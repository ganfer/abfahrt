// Variables used by Scriptable: icon-color: red; icon-glyph: train;
//
// VAG departures widget (EFA-BW TRIAS) — "VagAbfahrten"
//
// Setup:
//   1. Copy this file into Scriptable.
//   2. Run it once in Scriptable and save the TRIAS requestor key in Keychain.
//   3. Add one Scriptable widget on the Home Screen and select this script.
//      Leave the widget parameter empty.
//
// Usage:
//   - Home Screen widget: shows departures for the last selected stop.
//   - Run the script manually in Scriptable: GPS → nearby stops → selection.
//     The selected stop is saved in Keychain and used by the widget afterwards.
//

const APP_VERSION = '1.1.6';
const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';
const DEFAULT_STOPS = [
  'de:08311:30100:0:1',
  'de:08311:30100:0:2',
  'de:08311:30100:0:3',
  'de:08311:30100:0:5',
  'de:08311:30100:0:6',
  'de:08311:30100:0:7',
  'de:08311:30100:0:8',
  'de:08311:30100:0:9',
];
const REQUEST_TIMEOUT_MS = 12000;
const NEARBY_RESULTS = 5;
const DELAY_HEAVY_MIN = 5;
const LAST_STOP_REF_KEY = 'VAG_LAST_STOP_REF';
const LAST_STOP_NAME_KEY = 'VAG_LAST_STOP_NAME';
const SAVED_STOPS_KEY = 'VAG_SAVED_STOPS';
const RECENT_STOPS_KEY = 'VAG_RECENT_STOPS';
const RECENT_STOPS_LIMIT = 20;

// User-facing widget layout configuration. Widths are points inside the
// medium Scriptable widget. Hide columns you do not need and give the freed
// space to another visible column.
const DEFAULT_WIDGET_CONFIG = {
  rows: 5,
  refreshAfterLocationChange: true,
  columns: {
    line: { visible: true, width: 34 },
    destination: { visible: true, width: 105 },
    platform: { visible: true, width: 28 },
    departureTime: { visible: true, width: 42 },
    countdown: { visible: true, width: 50 },
  },
  spacing: {
    columns: 6,
    rows: 3,
  },
  fontSize: {
    line: 11,
    destination: 12,
    platform: 10,
    departureTime: 11,
    countdown: 12,
  },
  badgeHeight: 22,
};

const DEFAULT_FULLSCREEN_CONFIG = {
  rows: 8,
  columns: {
    line: { visible: true, width: 64 },
    destination: { visible: true, width: 190 },
    platform: { visible: true, width: 70 },
    departureTime: { visible: true, width: 82 },
    countdown: { visible: true, width: 92 },
  },
  fontSize: 16,
};

const DEFAULT_FILTER_CONFIG = { widget: true, fullscreen: true };
const DEFAULT_OFFLINE_CONFIG = { enabled: true, pinned: true, history: true, autoUpdate: true };
const GTFS_RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/vag-widget/gtfs-data/data/gtfs/';
const GTFS_CACHE_DIR = 'VagAbfahrten-GTFS';

const DEFAULT_LOCATION_CONFIG = {
  autoSelectSavedStop: true,
  savedStopRadiusMeters: 200,
  fallbackMode: 'last',
};

const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';

function mergeWidgetConfig(saved) {
  const d = DEFAULT_WIDGET_CONFIG;
  const s = saved || {};
  return {
    rows: Number.isFinite(s.rows) ? s.rows : d.rows,
    columns: {
      line: { ...d.columns.line, ...(s.columns?.line || {}) },
      destination: { ...d.columns.destination, ...(s.columns?.destination || {}) },
      platform: { ...d.columns.platform, ...(s.columns?.platform || {}) },
      departureTime: { ...d.columns.departureTime, ...(s.columns?.departureTime || {}) },
      countdown: { ...d.columns.countdown, ...(s.columns?.countdown || {}) },
    },
    spacing: { ...d.spacing, ...(s.spacing || {}) },
    fontSize: { ...d.fontSize, ...(s.fontSize || {}) },
    badgeHeight: Number.isFinite(s.badgeHeight) ? s.badgeHeight : d.badgeHeight,
    refreshAfterLocationChange: typeof s.refreshAfterLocationChange === 'boolean'
      ? s.refreshAfterLocationChange
      : d.refreshAfterLocationChange,
    filters: { ...DEFAULT_FILTER_CONFIG, ...(s.filters || {}) },
    offline: { ...DEFAULT_OFFLINE_CONFIG, ...(s.offline || {}) },
    location: {
      ...DEFAULT_LOCATION_CONFIG,
      ...(s.fullscreen?.location || {}),
      ...(s.location || {}),
      fallbackMode: s.location?.fallbackMode ||
        (typeof s.location?.fallbackToLastStop === 'boolean'
          ? (s.location.fallbackToLastStop ? 'last' : 'none')
          : DEFAULT_LOCATION_CONFIG.fallbackMode),
    },
    fullscreen: {
      ...DEFAULT_FULLSCREEN_CONFIG,
      ...(s.fullscreen || {}),
      columns: Object.fromEntries(Object.keys(DEFAULT_FULLSCREEN_CONFIG.columns).map((key) => [
        key,
        { ...DEFAULT_FULLSCREEN_CONFIG.columns[key], ...(s.fullscreen?.columns?.[key] || {}) },
      ])),
    },
  };
}

async function loadWidgetConfig() {
  const fm = FileManager.iCloud();
  const path = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);
  if (!fm.fileExists(path)) return mergeWidgetConfig(null);
  try {
    if (!fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
    return mergeWidgetConfig(JSON.parse(fm.readString(path)));
  } catch (_) {
    // A broken/missing personal config must never break the departures widget.
    return mergeWidgetConfig(null);
  }
}

let WIDGET_CONFIG = mergeWidgetConfig(null);

function widgetOpenUrl() {
  // A widget tap starts the interactive foreground flow in this same script:
  // GPS -> stop selection/auto-selection -> fullscreen departures.
  return 'scriptable:///run/VagAbfahrten';
}

function rawParameter() {
  return String(args.queryParameters?.parameter || args.widgetParameter || '').trim();
}

function parseParameter() {
  const raw = rawParameter();
  const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
  let key = parts.find((p) => !/^nearby$/i.test(p));
  const nearby = parts.some((p) => /^nearby$/i.test(p));
  if (!key && Keychain.contains('TRIAS_REQUESTOR_REF')) {
    key = Keychain.get('TRIAS_REQUESTOR_REF');
  }
  if (!key) {
    throw new Error(
      'Kein Key: Widget-Parameter = <Requestor-Key> (optional "|nearby") — oder einmal via Setup-Skript im Keychain speichern.',
    );
  }
  return { key: key.trim(), nearby };
}

function xmlEsc(v) {
  return String(v).replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  }[ch]));
}

function buildStopEventRequest(stopRef, key, resultLimit = 8) {
  const ts = new Date().toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Trias version="1.2" language="de" xmlns="http://www.vdv.de/trias" xmlns:siri="http://www.siri.org.uk/siri" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <ServiceRequest>',
    `    <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>`,
    `    <siri:RequestorRef>${xmlEsc(key)}</siri:RequestorRef>`,
    '    <RequestPayload>',
    '      <StopEventRequest>',
    '        <Location>',
    '          <LocationRef>',
    `            <StopPointRef>${xmlEsc(stopRef)}</StopPointRef>`,
    '          </LocationRef>',
    `          <DepArrTime>${ts}</DepArrTime>`,
    '        </Location>',
    '        <Params>',
    '          <Language>de</Language>',
    `          <NumberOfResults>${Math.max(1, Math.min(30, Math.round(Number(resultLimit) || 8)))}</NumberOfResults>`,
    '          <IncludeRealtimeData>true</IncludeRealtimeData>',
    '          <StopEventPolicy>DEPARTURE</StopEventPolicy>',
    '        </Params>',
    '      </StopEventRequest>',
    '    </RequestPayload>',
    '  </ServiceRequest>',
    '</Trias>',
  ].join('\n');
}

function buildNearbyRequest(lat, lon, key) {
  const ts = new Date().toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Trias version="1.2" language="de" xmlns="http://www.vdv.de/trias" xmlns:siri="http://www.siri.org.uk/siri" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <ServiceRequest>',
    `    <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>`,
    `    <siri:RequestorRef>${xmlEsc(key)}</siri:RequestorRef>`,
    '    <RequestPayload>',
    '      <LocationInformationRequest>',
    '        <InitialInput>',
    '          <GeoPosition>',
    `            <Longitude>${lon}</Longitude>`,
    `            <Latitude>${lat}</Latitude>`,
    '          </GeoPosition>',
    '        </InitialInput>',
    '        <Restrictions>',
    '          <Type>stop</Type>',
    `          <NumberOfResults>${NEARBY_RESULTS}</NumberOfResults>`,
    '        </Restrictions>',
    '      </LocationInformationRequest>',
    '    </RequestPayload>',
    '  </ServiceRequest>',
    '</Trias>',
  ].join('\n');
}

function parseXmlTree(raw) {
  const root = { name: '#document', attrs: {}, textContent: '', children: [] };
  let current = root;
  let sawRoot = false;
  let parseError = null;
  const parser = new XMLParser(raw);
  parser.didStartElement = (name, attrs) => {
    const raw = String(name);
    const local = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    const node = { name: local, attrs: attrs || {}, textContent: '', children: [] };
    node.__parent = current;
    current.children.push(node);
    current = node;
    sawRoot = true;
  };
  parser.didEndElement = () => {
    current = current.__parent || root;
  };
  parser.foundCharacters = (str) => {
    current.textContent += str;
  };
  parser.parseErrorOccurred = (_err, message) => {
    parseError = parseError || String(message || _err || 'parse error');
  };
  parser.parse();
  if (!sawRoot || !root.children.length) {
    throw new Error('XML-Parsing fehlgeschlagen (keine Elemente)' + (parseError ? ': ' + parseError : ''));
  }
  return root;
}

function child(node, ...names) {
  let level = node ? [node] : [];
  for (const name of names) {
    const next = [];
    for (const n of level) {
      for (const c of (n.children || [])) {
        if (c.name === name) next.push(c);
      }
    }
    if (!next.length) return null;
    level = next;
  }
  return level[0];
}

function children(node, name) {
  if (!node) return [];
  return (node.children || []).filter((c) => c.name === name);
}

function text(node, ...names) {
  const n = child(node, ...names);
  return n ? (n.textContent || '').trim() : '';
}

function platformFromStopPointRef(stopPointRef) {
  const parts = String(stopPointRef || '').split(':');
  return parts.length >= 5 && parts[parts.length - 1] ? parts[parts.length - 1] : '';
}

function stopEventsFromDoc(doc) {
  const events = [];
  const response =
    child(doc, 'Trias', 'ServiceDelivery', 'DeliveryPayload', 'StopEventResponse') ||
    child(doc, 'Trias', 'StopEventResponse') ||
    child(doc, 'ServiceDelivery', 'DeliveryPayload', 'StopEventResponse') ||
    child(doc, 'StopEventResponse');
  for (const result of children(response, 'StopEventResult')) {
    const event = child(result, 'StopEvent');
    if (!event) continue;
    const call = child(event, 'ThisCall', 'CallAtStop') || child(event, 'CallAtStop');
    const service = child(event, 'Service');
    if (!call || !service) continue;
    const stopRef = text(call, 'StopPointRef');
    const planned = text(call, 'ServiceDeparture', 'TimetabledTime');
    const estimated = text(call, 'ServiceDeparture', 'EstimatedTime');
    const departureEl = child(call, 'ServiceDeparture');
    const cancelled =
      (departureEl && departureEl.attrs && departureEl.attrs.Cancelled === 'true') ||
      text(service, 'Cancelled') === 'true' ||
      text(call, 'NotServicedStop') === 'true';
    if (!stopRef || !planned) continue;
    // In TRIAS 1.2 the passenger-facing line name belongs to
    // Service/ServiceSection/PublishedLineName. LineRef is only an internal
    // identifier and must never be displayed as the public line number.
    const section = child(service, 'ServiceSection');
    const publishedLineName =
      text(section, 'PublishedLineName', 'Text') ||
      text(section, 'PublishedLineName') ||
      text(service, 'PublishedLineName', 'Text') ||
      text(service, 'PublishedLineName');

    events.push({
      stopRef,
      plannedTime: Date.parse(planned),
      realtimeTime: estimated ? Date.parse(estimated) : null,
      cancelled,
      line: publishedLineName,
      destination: text(service, 'DestinationText', 'Text') || text(service, 'DestinationText'),
      platform: text(call, 'EstimatedBay') || text(call, 'PlannedBay') || platformFromStopPointRef(stopRef) || '',
    });
  }
  return events;
}

function countNodes(node, name) {
  if (!node) return 0;
  let count = node.name === name ? 1 : 0;
  for (const c of (node.children || [])) count += countNodes(c, name);
  return count;
}

function firstNodePath(node, target, path = []) {
  if (!node) return null;
  const here = node.name === '#document' ? path : [...path, node.name];
  if (node.name === target) return here.join(' > ');
  for (const c of (node.children || [])) {
    const found = firstNodePath(c, target, here);
    if (found) return found;
  }
  return null;
}

function firstLocationResultShape(doc) {
  function find(node) {
    if (!node) return null;
    if (node.name === 'LocationResult') return node;
    for (const c of (node.children || [])) {
      const hit = find(c);
      if (hit) return hit;
    }
    return null;
  }
  const result = find(doc);
  if (!result) return 'kein LocationResult';
  const describe = (node) => {
    const kids = (node.children || []).map((c) => c.name);
    return node.name + (kids.length ? ' [' + kids.join(', ') + ']' : '');
  };
  const lines = [describe(result)];
  for (const childNode of (result.children || []).slice(0, 8)) {
    lines.push('↳ ' + describe(childNode));
    for (const grand of (childNode.children || []).slice(0, 8)) {
      lines.push('  ↳ ' + describe(grand));
    }
  }
  return lines.join('\n');
}

function nearbyStopsFromDoc(doc) {
  const response =
    child(doc, 'Trias', 'ServiceDelivery', 'DeliveryPayload', 'LocationInformationResponse') ||
    child(doc, 'Trias', 'LocationInformationResponse') ||
    child(doc, 'ServiceDelivery', 'DeliveryPayload', 'LocationInformationResponse') ||
    child(doc, 'LocationInformationResponse');
  const out = [];
  for (const result of children(response, 'LocationResult')) {
    // EFA-BW returns stops as LocationResult/Location/StopPoint/...
    // (not as a direct StopPoint child of LocationResult).
    // EFA-BW's nearby LocationInformationResponse returns StopPlace
    // results (station/stop place level), not StopPoint results (platform level).
    const stopRef =
      text(result, 'Location', 'StopPlace', 'StopPlaceRef') ||
      text(result, 'Location', 'StopPoint', 'StopPointRef') ||
      text(result, 'StopPoint', 'StopPointRef') ||
      text(result, 'Location', 'StopPointRef') ||
      text(result, 'StopPointRef');
    const name =
      text(result, 'Location', 'StopPlace', 'StopPlaceName', 'Text') ||
      text(result, 'Location', 'LocationName', 'Text') ||
      text(result, 'Location', 'StopPoint', 'StopPointName', 'Text') ||
      text(result, 'StopPoint', 'StopPointName', 'Text') ||
      text(result, 'LocationName', 'Text');
    const latitude = Number(
      text(result, 'Location', 'GeoPosition', 'Latitude') ||
      text(result, 'Location', 'StopPlace', 'GeoPosition', 'Latitude') ||
      text(result, 'Location', 'StopPoint', 'GeoPosition', 'Latitude')
    );
    const longitude = Number(
      text(result, 'Location', 'GeoPosition', 'Longitude') ||
      text(result, 'Location', 'StopPlace', 'GeoPosition', 'Longitude') ||
      text(result, 'Location', 'StopPoint', 'GeoPosition', 'Longitude')
    );
    if (stopRef && name) out.push({
      stopRef,
      name,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    });
  }

  // EFA-BW may return the same physical stop multiple times with different
  // internal references/variants. Keep only one picker entry per stop name.
  const seenRefs = new Set();
  const seenNames = new Set();
  return out.filter(({ stopRef, name }) => {
    const normalizedName = name
      .normalize('NFKC')
      .trim()
      .replace(/\\s+/g, ' ')
      .toLocaleLowerCase('de-DE');

    if (seenRefs.has(stopRef) || seenNames.has(normalizedName)) return false;
    seenRefs.add(stopRef);
    seenNames.add(normalizedName);
    return true;
  });
}

async function triasPost(body) {
  const req = new Request(TRIAS_ENDPOINT);
  req.method = 'POST';
  req.headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    Accept: 'text/xml',
    'User-Agent': 'vag-widget/1.0 (Scriptable)',
  };
  req.body = body;
  req.timeoutInterval = REQUEST_TIMEOUT_MS / 1000;
  const text = await req.loadString();
  const status = req.response ? req.response.statusCode : '?';
  const fingerprint = text.replace(/\s+/g, ' ').slice(0, 120);
  if (text.startsWith('<!DOCTYPE html') || text.startsWith('<html')) {
    throw new Error(`TRIAS HTTP ${status} (HTML): ${fingerprint}…`);
  }
  if (!text.includes('<')) {
    throw new Error(`TRIAS HTTP ${status}: leere/unverständliche Antwort: ${fingerprint}…`);
  }
  if (status >= 400) {
    throw new Error(`TRIAS HTTP ${status}: ${fingerprint}…`);
  }
  return text;
}


function canonicalGtfsStopRef(ref) {
  const parts = String(ref || '').trim().split(':');
  return parts.length >= 3 ? parts.slice(0, 3).join(':') : String(ref || '').trim();
}

function gtfsCacheManager() { return FileManager.local(); }
function gtfsCachePath(name) {
  const manager = gtfsCacheManager();
  const dir = manager.joinPath(manager.documentsDirectory(), GTFS_CACHE_DIR);
  return manager.joinPath(dir, name);
}
function readGtfsJson(name) {
  try {
    const manager = gtfsCacheManager();
    const path = gtfsCachePath(name);
    return manager.fileExists(path) ? JSON.parse(manager.readString(path)) : null;
  } catch (_) { return null; }
}
function gtfsDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
function gtfsServiceRuns(service, date) {
  if (!service) return false;
  const key = gtfsDateKey(date);
  const exception = (service.exceptions || []).find((item) => item[0] === key);
  if (exception) return Number(exception[1]) === 1;
  if (service.start && key < service.start) return false;
  if (service.end && key > service.end) return false;
  const weekdays = String(service.weekdays || '0000000');
  const mondayIndex = (date.getDay() + 6) % 7;
  return weekdays[mondayIndex] === '1';
}
function offlineStopAllowed(stopRefs) {
  if (!WIDGET_CONFIG.offline?.enabled) return false;
  const refs = new Set((stopRefs || []).map(canonicalGtfsStopRef));
  if (WIDGET_CONFIG.offline.pinned) {
    for (const stop of savedStops().filter((item) => item.pinned === true)) {
      const stopRefsSaved = Array.isArray(stop.stopRefs) && stop.stopRefs.length ? stop.stopRefs : [stop.stopRef];
      if (stopRefsSaved.some((ref) => refs.has(canonicalGtfsStopRef(ref)))) return true;
    }
  }
  if (WIDGET_CONFIG.offline.history) {
    for (const stop of recentStops().slice(0, RECENT_STOPS_LIMIT)) {
      if (refs.has(canonicalGtfsStopRef(stop.stopRef))) return true;
    }
  }
  return false;
}
function offlineWantedEntriesRuntime() {
  const entries = new Map();
  const addStop = (stop) => {
    const refs = Array.isArray(stop.stopRefs) && stop.stopRefs.length ? stop.stopRefs : [stop.stopRef];
    for (const rawRef of refs) {
      if (!rawRef) continue;
      const ref = canonicalGtfsStopRef(rawRef);
      if (!entries.has(ref)) entries.set(ref, {
        ref,
        sourceName: stop.name || stop.displayName || '',
      });
    }
  };
  if (WIDGET_CONFIG.offline?.pinned) {
    for (const stop of savedStops().filter((item) => item.pinned === true)) addStop(stop);
  }
  if (WIDGET_CONFIG.offline?.history) {
    const pins = savedStops().filter((item) => item.pinned === true);
    for (const stop of recentStops().slice(0, RECENT_STOPS_LIMIT)) {
      const pin = pins.find((item) => canonicalGtfsStopRef(item.stopRef) === canonicalGtfsStopRef(stop.stopRef));
      addStop(pin ? { ...stop, name: pin.name || stop.name } : stop);
    }
  }
  return [...entries.values()];
}
function offlineWantedStopsRuntime() {
  return offlineWantedEntriesRuntime().map((item) => item.ref);
}
function normalizeGtfsLookupName(value) {
  return normalizeStopName(String(value || '')
    .replace(/\b(?:bstg|bahnsteig|steig|gleis)\b.*$/i, '')
    .replace(/[\s,;:\-]+$/g, ''));
}
function resolveGtfsIndexRef(entry, stops) {
  if (stops?.[entry.ref]) return entry.ref;
  const target = normalizeGtfsLookupName(entry.sourceName);
  if (!target) return null;
  const matches = Object.entries(stops || {})
    .filter(([, value]) => normalizeGtfsLookupName(value?.name) === target);
  const preferred = matches.filter(([ref]) => !/_parent$/i.test(ref) && !/^gen:/i.test(ref));
  const candidates = preferred.length ? preferred : matches;
  return candidates.length === 1 ? candidates[0][0] : null;
}
async function downloadGtfsJson(name) {
  const req = new Request(GTFS_RAW_BASE_URL + name + '?t=' + Date.now());
  req.timeoutInterval = 12;
  req.headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
  const raw = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error('GTFS HTTP ' + (status || '?'));
  return { raw, value: JSON.parse(raw) };
}
function offlineCacheNeedsUpdate(wanted) {
  const manifest = readGtfsJson('manifest.json');
  const index = readGtfsJson('index.json');
  if (!manifest || !index?.stops) return true;
  const requested = Array.isArray(manifest.requestedStopRefs) ? [...manifest.requestedStopRefs].sort() : null;
  if (!requested || requested.join('|') !== [...wanted].sort().join('|')) return true;
  const checkedAt = Date.parse(manifest.localSyncedAt || '');
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= 24 * 60 * 60 * 1000;
}
async function autoSyncOfflineData() {
  if (!WIDGET_CONFIG.offline?.enabled || WIDGET_CONFIG.offline.autoUpdate === false) return;
  const wantedEntries = offlineWantedEntriesRuntime();
  const wanted = wantedEntries.map((item) => item.ref);
  if (!wanted.length || !offlineCacheNeedsUpdate(wanted)) return;
  try {
    const manifest = await downloadGtfsJson('manifest.json');
    const index = await downloadGtfsJson('index.json');
    const found = wantedEntries.map((item) => ({
      ...item,
      sourceRef: resolveGtfsIndexRef(item, index.value.stops),
    })).filter((item) => item.sourceRef);
    const shards = [...new Set(found.map((item) => index.value.stops[item.sourceRef].shard))];
    const downloads = [];
    for (const shard of shards) downloads.push([shard, await downloadGtfsJson(shard + '.json')]);

    // Download everything first. Only replace the usable cache after every
    // required file arrived, so a transient network error keeps the old cache.
    const manager = gtfsCacheManager();
    const dir = manager.joinPath(manager.documentsDirectory(), GTFS_CACHE_DIR);
    if (!manager.fileExists(dir)) manager.createDirectory(dir, true);
    const localManifest = {
      ...manifest.value,
      localSyncedAt: new Date().toISOString(),
      requestedStopRefs: [...wanted].sort(),
      missingStopRefs: wanted.filter((ref) => !found.some((item) => item.ref === ref)).sort(),
    };
    manager.writeString(gtfsCachePath('manifest.json'), JSON.stringify(localManifest));
    manager.writeString(gtfsCachePath('index.json'), JSON.stringify({
      schemaVersion: index.value.schemaVersion,
      stops: Object.fromEntries(found.map((item) => [item.ref, { ...index.value.stops[item.sourceRef], sourceRef: item.sourceRef }])),
    }));
    for (const [shard, data] of downloads) manager.writeString(gtfsCachePath(shard + '.json'), data.raw);
    const keep = new Set(['manifest.json', 'index.json', ...shards.map((shard) => shard + '.json')]);
    for (const name of manager.listContents(dir)) {
      if (!keep.has(name)) manager.remove(manager.joinPath(dir, name));
    }
  } catch (_) {
    // Best effort only: online TRIAS remains primary and an existing offline
    // cache must continue to work when GitHub/network access is unavailable.
  }
}

function offlineDepartures(stopRefs, nowMs = Date.now()) {
  if (!offlineStopAllowed(stopRefs)) return [];
  const index = readGtfsJson('index.json');
  if (!index?.stops) return [];
  const logicalRefs = [...new Set(stopRefs.map(canonicalGtfsStopRef))];
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const serviceDates = [today, yesterday];
  const out = [];
  const seen = new Set();
  for (const logicalRef of logicalRefs) {
    const entry = index.stops[logicalRef];
    if (!entry?.shard) continue;
    const shard = readGtfsJson(entry.shard + '.json');
    const sourceRef = entry.sourceRef || logicalRef;
    const departures = shard?.stops?.[sourceRef] || [];
    for (const serviceDate of serviceDates) {
      if (!serviceDate) continue;
      const midnight = serviceDate.getTime();
      for (const item of departures) {
        const [seconds, line, destination, serviceId] = item;
        if (!gtfsServiceRuns(shard.services?.[serviceId], serviceDate)) continue;
        const plannedTime = midnight + Number(seconds) * 1000;
        if (plannedTime < nowMs) continue;
        const key = [logicalRef, plannedTime, line, destination, serviceId].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          stopRef: logicalRef, plannedTime, realtimeTime: null, cancelled: false,
          line: String(line || ''), destination: String(destination || ''), platform: '', offline: true,
        });
      }
    }
  }
  return out.sort((a, b) => a.plannedTime - b.plannedTime);
}
async function fetchDeparturesWithOffline(stopRefs, key, resultLimit = 8) {
  try {
    return await fetchDepartures(stopRefs, key, resultLimit);
  } catch (error) {
    const fallback = offlineDepartures(stopRefs);
    if (fallback.length) return fallback.slice(0, Math.max(1, resultLimit));
    throw error;
  }
}

async function fetchDepartures(stopRefs, key, resultLimit = 8) {
  const all = [];
  const errors = [];
  await Promise.all(
    stopRefs.map(async (ref) => {
      try {
        const xml = await triasPost(buildStopEventRequest(ref, key, resultLimit));
        all.push(...stopEventsFromDoc(parseXmlTree(xml)));
      } catch (e) {
        errors.push(e.message);
      }
    }),
  );
  if (!all.length && errors.length) throw new Error(errors[0]);
  return all;
}

function withDelay(events, now) {
  return events
    .filter((e) => (e.realtimeTime || e.plannedTime) >= now)
    .map((e) => {
      const at = e.realtimeTime || e.plannedTime;
      const rawDelayMin = e.realtimeTime
        ? Math.round((e.realtimeTime - e.plannedTime) / 60000)
        : null;
      // Ignore implausible realtime offsets instead of rendering misleading
      // labels such as "+115 min" in the compact widget.
      const delayMin = rawDelayMin !== null && rawDelayMin >= 0 && rawDelayMin <= 90
        ? rawDelayMin
        : null;
      return { ...e, at, delayMin };
    })
    .sort((a, b) => a.at - b.at)
    .slice(0, Math.max(1, Math.min(8, Number(WIDGET_CONFIG.rows) || 5)));
}

function cancelledCount(events, now) {
  return events.filter((e) => e.cancelled && (e.realtimeTime || e.plannedTime) >= now).length;
}

function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function palette() {
  // Keep the widget consistently dark, independent of the iOS appearance.
  return { bg: '#101010', fg: '#f0f0f0', dim: '#9a9a9a', ok: '#66bb6a', late: '#ef5350', delay: '#ff9800' };
}

function splitStopName(name) {
  const value = String(name || '').trim();
  const comma = value.indexOf(',');
  if (comma > 0) return { place: value.slice(0, comma).trim(), stop: value.slice(comma + 1).trim() };
  const match = value.match(/^(Friedrichsh(?:afen|\\.)?)\\s+(.+)$/i);
  if (match) return { place: 'Friedrichshafen', stop: match[2].trim() };
  return { place: '', stop: value };
}

function compactDestination(destination, place) {
  let value = String(destination || '').trim();
  if (place && value.toLocaleLowerCase('de-DE').startsWith(place.toLocaleLowerCase('de-DE') + ' ')) value = value.slice(place.length + 1);
  value = value.replace(/^Friedrichsh(?:afen|\\.)?[, ]+/i, '');
  return value || destination || '–';
}

function addColumnSpacer(row, hasPreviousColumn) {
  if (hasPreviousColumn) row.addSpacer(Math.max(0, WIDGET_CONFIG.spacing.columns));
}

function addDepartureRow(w, r, place, c) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  let hasColumn = false;
  const columns = WIDGET_CONFIG.columns;
  const height = Math.max(16, WIDGET_CONFIG.badgeHeight);

  if (columns.line.visible) {
    const badge = row.addStack();
    badge.size = new Size(Math.max(1, columns.line.width), height);
    badge.cornerRadius = 6;
    badge.backgroundColor = new Color('#2c2c2e');
    badge.centerAlignContent();
    badge.addSpacer();
    const badgeText = badge.addText(r.line || '–');
    badgeText.font = Font.boldSystemFont(WIDGET_CONFIG.fontSize.line);
    badgeText.textColor = new Color(c.fg);
    badgeText.lineLimit = 1;
    badgeText.minimumScaleFactor = 0.6;
    badge.addSpacer();
    hasColumn = true;
  }

  if (columns.destination.visible) {
    addColumnSpacer(row, hasColumn);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.destination.width), height);
    column.centerAlignContent();
    const destination = column.addText(compactDestination(r.destination, place));
    destination.font = Font.mediumSystemFont(WIDGET_CONFIG.fontSize.destination);
    destination.textColor = new Color(r.cancelled ? c.dim : c.fg);
    destination.lineLimit = 1;
    destination.minimumScaleFactor = 0.6;
    if (r.cancelled) destination.textOpacity = 0.65;
    hasColumn = true;
  }

  if (columns.platform.visible) {
    addColumnSpacer(row, hasColumn);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.platform.width), height);
    column.centerAlignContent();
    const platform = column.addText(r.platform || '–');
    platform.font = Font.systemFont(WIDGET_CONFIG.fontSize.platform);
    platform.textColor = new Color(r.cancelled ? c.dim : c.fg);
    platform.lineLimit = 1;
    platform.minimumScaleFactor = 0.6;
    hasColumn = true;
  }

  if (columns.departureTime.visible) {
    addColumnSpacer(row, hasColumn);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.departureTime.width), height);
    column.centerAlignContent();
    const clock = column.addText(fmtClock(r.at) + (r.realtimeTime ? (r.delayMin > 0 ? ' +' + r.delayMin : ' ·') : ' °'));
    clock.font = Font.systemFont(WIDGET_CONFIG.fontSize.departureTime);
    clock.textColor = new Color(r.cancelled ? c.dim : c.fg);
    clock.lineLimit = 1;
    clock.minimumScaleFactor = 0.7;
    hasColumn = true;
  }

  if (columns.countdown.visible) {
    addColumnSpacer(row, hasColumn);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.countdown.width), height);
    column.centerAlignContent();
    column.addSpacer();

    let right;
    if (r.cancelled) right = 'entfällt';
    else {
      const minutes = Math.max(0, Math.floor((r.at - Date.now()) / 60000));
      right = minutes <= 0 ? 'jetzt' : minutes + ' min';
    }
    const rightEl = column.addText(right);
    rightEl.font = Font.boldSystemFont(WIDGET_CONFIG.fontSize.countdown);
    rightEl.textColor = new Color(r.cancelled ? c.dim : r.delayMin >= DELAY_HEAVY_MIN ? c.late : r.delayMin > 0 ? c.delay : c.ok);
    rightEl.lineLimit = 1;
    rightEl.minimumScaleFactor = 0.65;
  }
}

function friendlyError(error) {
  const message = String(error?.message || error || '').trim();
  if (/timeout|timed out|Zeitüberschreitung/i.test(message)) return 'Verbindung zu EFA-BW dauert zu lange';
  if (/HTTP 401|HTTP 403|Requestor|Key/i.test(message)) return 'TRIAS-Key wurde abgelehnt';
  if (/network|offline|Internet|connection/i.test(message)) return 'Keine Verbindung zu EFA-BW';
  if (/parse|XML/i.test(message)) return 'Antwort von EFA-BW konnte nicht gelesen werden';
  return message || 'Abfahrten konnten nicht geladen werden';
}

function buildWidget(title, subtitle, rows, cancelledN, errorText) {
  const c = palette();
  const w = new ListWidget();
  w.backgroundColor = new Color(c.bg);
  w.setPadding(13, 14, 10, 14);
  w.url = widgetOpenUrl();
  const stop = splitStopName(title);
  const titleEl = w.addText(stop.stop || title);
  titleEl.font = Font.boldSystemFont(16);
  titleEl.textColor = new Color(c.fg);
  titleEl.lineLimit = 1;
  titleEl.minimumScaleFactor = 0.75;
  if (stop.place || subtitle) {
    const sub = w.addText(stop.place || subtitle);
    sub.font = Font.mediumSystemFont(10);
    sub.textColor = new Color(c.dim);
    sub.lineLimit = 1;
  }
  w.addSpacer(7);
  if (errorText) {
    const err = w.addText(errorText);
    err.font = Font.systemFont(11);
    err.textColor = new Color(c.late);
  } else if (!rows.length) {
    const none = w.addText('Keine Abfahrten');
    none.font = Font.systemFont(12);
    none.textColor = new Color(c.dim);
  } else {
    for (const r of rows.slice(0, Math.max(1, WIDGET_CONFIG.rows))) {
      addDepartureRow(w, r, stop.place, c);
      w.addSpacer(Math.max(0, WIDGET_CONFIG.spacing.rows));
    }
  }
  w.addSpacer();
  const footer = w.addStack();
  footer.layoutHorizontally();
  footer.addSpacer();
  const footerText = errorText ? 'Fehler · ' + fmtClock(Date.now()) : 'aktualisiert ' + fmtClock(Date.now()) + (cancelledN ? ' · ' + cancelledN + ' entfällt' : '');
  const foot = footer.addText(footerText);
  foot.font = Font.systemFont(8);
  foot.textColor = new Color(errorText ? c.late : c.dim);
  return w;
}

async function defaultWidget(key, present, tapParameter) {
  const hasLastStop =
    Keychain.contains(LAST_STOP_REF_KEY) &&
    Keychain.get(LAST_STOP_REF_KEY).trim() !== '';
  const lastRef = hasLastStop ? Keychain.get(LAST_STOP_REF_KEY) : '';
  const activePin = hasLastStop ? activePinnedStop(lastRef) : null;
  const stopRefs = activePin ? stopRefsFor(activePin) : hasLastStop ? [lastRef] : DEFAULT_STOPS;
  const title =
    hasLastStop && Keychain.contains(LAST_STOP_NAME_KEY)
      ? Keychain.get(LAST_STOP_NAME_KEY)
      : 'Bertoldsbrunnen';

  try {
    const events = await fetchDeparturesWithOffline(stopRefs, key, Math.max(8, Number(WIDGET_CONFIG.rows) || 5));
    const filteredEvents = applyPinnedFilter(events, activePin, 'widget');
    const rows = withDelay(filteredEvents, Date.now());
    const sub = filteredEvents.length
      ? `${filteredEvents.length} Ereignisse gelesen`
      : 'API antwortete ohne Events';
    const w = buildWidget(title, rows.length ? null : sub, rows, cancelledCount(filteredEvents, Date.now()), tapParameter);
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
  } catch (e) {
    const w = buildWidget(title, null, [], 0, friendlyError(e), tapParameter);
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
  }
}

async function showLocationDiagnostics(lines, errorText) {
  const alert = new Alert();
  alert.title = 'Standortdiagnose';
  alert.message = lines.join('\n') + (errorText ? '\n\nFEHLER: ' + errorText : '');
  alert.addAction('OK');
  await alert.present();
}

function savedStops() {
  try {
    return Keychain.contains(SAVED_STOPS_KEY) ? JSON.parse(Keychain.get(SAVED_STOPS_KEY)) : [];
  } catch (_) {
    return [];
  }
}

function recentStops() {
  try {
    return Keychain.contains(RECENT_STOPS_KEY) ? JSON.parse(Keychain.get(RECENT_STOPS_KEY)) : [];
  } catch (_) {
    return [];
  }
}

function normalizeStopName(name) {
  return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function sameStop(a, b) {
  return a.stopRef === b.stopRef || normalizeStopName(a.name) === normalizeStopName(b.name);
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stopDistanceMeters(stop, location) {
  if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return null;
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return null;
  return distanceMeters(location.latitude, location.longitude, stop.latitude, stop.longitude);
}

function stopRefsFor(stop) { return [...new Set([stop.stopRef, ...(Array.isArray(stop.stopRefs) ? stop.stopRefs : [])].filter(Boolean))]; }
function stopRole(stop) {
  if (stop.home === true || stop.role === 'home') return { icon: '🏠', label: 'Home' };
  const roles = { work: ['💼','Arbeit'], love: ['❤️','Love'], pub: ['🍺','Kneipe'], favorite: ['⭐️','Favorit'], transfer: ['🚉','Umstieg'] };
  if (stop.role === 'custom') return { icon: stop.roleIcon || '📍', label: stop.roleLabel || 'Eigene Rolle' };
  const role = roles[stop.role] || ['📌','Angepinnt']; return { icon: role[0], label: role[1] };
}
function activePinnedStop(stopRef, pinned = savedStops()) { return pinned.find((stop) => stop.pinned === true && stopRefsFor(stop).includes(stopRef)) || null; }
function eventMatchesFilter(event, stop) {
  const f = stop?.filter; if (!f || f.enabled === false) return true;
  const lines = Array.isArray(f.lines) ? f.lines.map(normalizeStopName) : [];
  const dirs = Array.isArray(f.destinations) ? f.destinations.map(normalizeStopName) : [];
  if (!lines.length && !dirs.length) return true;
  const match = (!lines.length || lines.includes(normalizeStopName(event.line))) && (!dirs.length || dirs.some((v) => normalizeStopName(event.destination).includes(v)));
  return f.mode === 'blacklist' ? !match : match;
}
function applyPinnedFilter(events, stop, surface) { return !stop || WIDGET_CONFIG.filters?.[surface] === false ? events : events.filter((e) => eventMatchesFilter(e, stop)); }

function pinnedStopFor(stop, pinned) {
  return pinned.find((s) => s.pinned === true && sameStop(s, stop)) || null;
}

function homeStop(pinned = savedStops()) {
  return pinned.find((s) => s.pinned === true && s.home === true) || null;
}

function pinnedLabel(stop) {
  return stopRole(stop).icon + ' ' + (stop.displayName || stop.name);
}

function requestWidgetRefresh() {
  if (!WIDGET_CONFIG.refreshAfterLocationChange) return;
  // Start a second, explicitly non-interactive run of this script. The
  // "refresh" parameter exits through the widget-only path before GPS or
  // fullscreen logic can run.
  Safari.open('scriptable:///run/' + encodeURIComponent(Script.name()) + '?parameter=refresh');
}

function rememberStop(stop) {
  Keychain.set(LAST_STOP_REF_KEY, stop.stopRef);
  Keychain.set(LAST_STOP_NAME_KEY, stop.name);
  const recent = recentStops().filter((s) => !sameStop(s, stop));
  recent.unshift({ stopRef: stop.stopRef, name: stop.name });
  Keychain.set(RECENT_STOPS_KEY, JSON.stringify(recent.slice(0, RECENT_STOPS_LIMIT)));
}

async function fallbackToLastStop(key, diagnostics, reason) {
  const hasLastStop =
    Keychain.contains(LAST_STOP_REF_KEY) &&
    Keychain.get(LAST_STOP_REF_KEY).trim() !== '';
  const mode = WIDGET_CONFIG.location.fallbackMode || 'last';
  if (mode === 'none') return false;

  if (mode === 'home') {
    const home = homeStop();
    if (home) {
      diagnostics.push('Fallback: Home ✓');
      rememberStop({ stopRef: home.stopRef, name: home.displayName || home.name });
      requestWidgetRefresh();
      const a = new Alert();
      a.title = 'Standort nicht verfügbar';
      a.message = reason + '\n\nStattdessen wird 🏠 Home verwendet.';
      a.addAction('Weiter');
      await a.present();
      await presentDeparturesTable(key);
      return true;
    }
    diagnostics.push('Fallback: Home nicht gesetzt – letzte Haltestelle wird versucht');
  }

  if (!hasLastStop) return false;
  diagnostics.push('Fallback: zuletzt verwendete Haltestelle ✓');
  const title = Keychain.contains(LAST_STOP_NAME_KEY)
    ? Keychain.get(LAST_STOP_NAME_KEY)
    : 'Letzte Haltestelle';
  const a = new Alert();
  a.title = 'Standort nicht verfügbar';
  a.message = reason + '\n\nStattdessen wird „' + title + '“ verwendet.';
  a.addAction('Weiter');
  await a.present();
  await presentDeparturesTable(key);
  return true;
}

async function nearbyFlow(key) {
  const diagnostics = [
    '1. nearby-Modus aktiv ✓',
    '2. Key aus Parameter/Keychain ✓',
  ];
  let loc;
  try {
    Location.setAccuracyToHundredMeters();
    loc = await Location.current();
    diagnostics.push('3. GPS erhalten ✓');
    diagnostics.push(`   ±${Math.round(loc.horizontalAccuracy || 0)} m`);
  } catch (e) {
    diagnostics.push('3. GPS erhalten ✗');
    if (await fallbackToLastStop(key, diagnostics, 'GPS ist nicht verfügbar.')) return;
    await showLocationDiagnostics(diagnostics, e.message);
    const w = buildWidget('Standort', null, [], 0, 'GPS nicht verfügbar: ' + e.message);
    w.presentMedium();
    Script.complete();
    return;
  }

  let stops;
  try {
    const xml = await triasPost(buildNearbyRequest(loc.latitude, loc.longitude, key));
    diagnostics.push('4. TRIAS-Antwort erhalten ✓');
    const doc = parseXmlTree(xml);
    stops = nearbyStopsFromDoc(doc);
    diagnostics.push(`5. Haltestellen gefunden: ${stops.length}`);
    if (!stops.length) {
      diagnostics.push(`   LocationResult: ${countNodes(doc, 'LocationResult')}`);
      diagnostics.push(`   Location: ${countNodes(doc, 'Location')}`);
      diagnostics.push(`   StopPoint: ${countNodes(doc, 'StopPoint')}`);
      diagnostics.push(`   StopPointRef: ${countNodes(doc, 'StopPointRef')}`);
      diagnostics.push('   Pfad: ' + (
        firstNodePath(doc, 'LocationResult') ||
        firstNodePath(doc, 'StopPoint') ||
        firstNodePath(doc, 'Location') ||
        'keiner'
      ));
      diagnostics.push('   Struktur:');
      diagnostics.push(firstLocationResultShape(doc));
    }
  } catch (e) {
    diagnostics.push('4/5. TRIAS-Ortssuche ✗');
    if (await fallbackToLastStop(key, diagnostics, 'Die Haltestellensuche konnte nicht geladen werden.')) return;
    await showLocationDiagnostics(diagnostics, e.message);
    const w = buildWidget('Nähe', null, [], 0, 'Ortsuche fehlgeschlagen: ' + e.message);
    w.presentMedium();
    Script.complete();
    return;
  }

  if (!stops.length) {
    if (await fallbackToLastStop(key, diagnostics, 'In der Nähe wurden keine Haltestellen gefunden.')) return;
    await showLocationDiagnostics(diagnostics, 'TRIAS lieferte keine auswertbaren Haltestellen.');
    const w = buildWidget('Nähe', null, [], 0, 'Keine Haltestellen gefunden');
    w.presentMedium();
    Script.complete();
    return;
  }

  diagnostics.push('6. Auswahl wird geöffnet ✓');
  const pinned = savedStops().filter((s) => s.pinned === true);
  const recent = recentStops();

  if (WIDGET_CONFIG.location.autoSelectSavedStop) {
    const radius = Math.max(0, Number(WIDGET_CONFIG.location.savedStopRadiusMeters) || 200);
    const candidates = stops
      .map((stop) => ({ stop, pin: pinnedStopFor(stop, pinned), distance: stopDistanceMeters(stop, loc) }))
      .filter((item) => item.pin && item.distance !== null && item.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length) {
      const { stop: hit, pin } = candidates[0];
      rememberStop({ ...hit, name: pin.displayName || hit.name });
      requestWidgetRefresh();
      await presentDeparturesTable(key, { autoSelected: true, distance: candidates[0].distance });
      return;
    }
  }

  const picker = new Alert();
  picker.title = 'Haltestelle wählen';
  picker.message = 'GPS ±100 m · 📌 angepinnt · ★ zuletzt verwendet';
  for (const stop of stops) {
    const pin = pinnedStopFor(stop, pinned);
    const isRecent = recent.some((s) => sameStop(s, stop));
    const distance = stopDistanceMeters(stop, loc);
    const distanceLabel = distance === null ? '' : ` · ${Math.round(distance)} m`;
    picker.addAction((pin ? (pin.home === true ? '🏠 ' : '📌 ') : isRecent ? '★ ' : '') + (pin?.displayName || stop.name) + distanceLabel);
  }
  const pinnedMenuIndex = stops.length;
  if (pinned.length) picker.addAction('📌 Angepinnte Haltestellen');
  picker.addCancelAction('Abbrechen');
  const idx = await picker.present();
  if (idx === -1) {
    Script.complete();
    return;
  }

  let selected;
  let selectedPin = null;
  if (pinned.length && idx === pinnedMenuIndex) {
    const pinnedPicker = new Alert();
    pinnedPicker.title = 'Fixierte Haltestellen';
    pinnedPicker.message = 'Wähle eine angepinnte Haltestelle.';
    const orderedPinned = [...pinned].sort((a, b) => Number(b.home === true) - Number(a.home === true));
    for (const stop of orderedPinned) {
      pinnedPicker.addAction(pinnedLabel(stop));
    }
    pinnedPicker.addCancelAction('Zurück');
    const pinnedIdx = await pinnedPicker.present();
    if (pinnedIdx === -1) {
      Script.complete();
      return;
    }
    selectedPin = orderedPinned[pinnedIdx];
    selected = {
      stopRef: selectedPin.stopRef,
      name: selectedPin.displayName || selectedPin.name,
    };
  } else {
    selected = stops[idx];
    selectedPin = pinnedStopFor(selected, pinned);
  }

  rememberStop({ ...selected, name: selectedPin?.displayName || selected.name });
  requestWidgetRefresh();

  // Live and pinned selections use the exact same downstream flow:
  // persist active stop, refresh the widget and open fullscreen departures.
  await presentDeparturesTable(key);
}

function htmlEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

async function presentDeparturesTable(key, context = null) {
  const hasLastStop =
    Keychain.contains(LAST_STOP_REF_KEY) &&
    Keychain.get(LAST_STOP_REF_KEY).trim() !== '';
  const lastRef = hasLastStop ? Keychain.get(LAST_STOP_REF_KEY) : '';
  const activePin = hasLastStop ? activePinnedStop(lastRef) : null;
  const stopRefs = activePin ? stopRefsFor(activePin) : hasLastStop ? [lastRef] : DEFAULT_STOPS;
  const title =
    hasLastStop && Keychain.contains(LAST_STOP_NAME_KEY)
      ? Keychain.get(LAST_STOP_NAME_KEY)
      : 'Bertoldsbrunnen';

  try {
    const events = await fetchDeparturesWithOffline(stopRefs, key, Math.max(8, Number(WIDGET_CONFIG.fullscreen.rows) || 8));
    const filteredEvents = applyPinnedFilter(events, activePin, 'fullscreen');
    const now = Date.now();
    const rows = filteredEvents
      .filter((e) => (e.realtimeTime || e.plannedTime) >= now)
      .map((e) => {
        const at = e.realtimeTime || e.plannedTime;
        const rawDelayMin = e.realtimeTime
          ? Math.round((e.realtimeTime - e.plannedTime) / 60000)
          : null;
        return {
          ...e,
          at,
          delayMin: rawDelayMin !== null && rawDelayMin >= 0 && rawDelayMin <= 90 ? rawDelayMin : null,
        };
      })
      .sort((a, b) => a.at - b.at)
      .slice(0, WIDGET_CONFIG.fullscreen.rows);

    const fs = WIDGET_CONFIG.fullscreen;
    const place = splitStopName(title).place;
    const defs = [
      { key: 'line', label: 'Linie', value: (r) => r.line || '–', cls: 'line' },
      { key: 'destination', label: 'Richtung', value: (r) => compactDestination(r.destination, place), cls: 'destination' },
      { key: 'platform', label: 'Gleis', value: (r) => r.platform || '–', cls: 'platform' },
      { key: 'departureTime', label: 'Abfahrt', value: (r) => fmtClock(r.at) + (r.realtimeTime ? (r.delayMin > 0 ? ' +' + r.delayMin : ' ·') : ' °'), cls: 'time' },
      {
        key: 'countdown',
        label: 'Restzeit',
        cls: 'countdown',
        value: (r) => {
          if (r.cancelled) return 'entfällt';
          const minutes = Math.max(0, Math.floor((r.at - Date.now()) / 60000));
          return minutes <= 0 ? 'jetzt' : minutes + ' min';
        },
      },
    ].filter((d) => fs.columns[d.key].visible);

    const header = defs.map((d) => `<th class="${d.cls}">${htmlEsc(d.label)}</th>`).join('');
    const body = rows.length
      ? rows.map((r) => {
          const cells = defs.map((d) => {
            let state = '';
            if (d.key === 'countdown') {
              state = r.cancelled ? ' cancelled' : r.delayMin >= DELAY_HEAVY_MIN ? ' late' : r.delayMin > 0 ? ' delayed' : ' ontime';
            }
            return `<td class="${d.cls}${state}">${htmlEsc(d.value(r))}</td>`;
          }).join('');
          return `<tr>${cells}</tr>`;
        }).join('')
      : `<tr><td class="empty" colspan="${Math.max(1, defs.length)}">Keine kommenden Abfahrten</td></tr>`;

    const html = `<!doctype html>
<html lang="de">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom)); background: #101010; color: #f0f0f0; }
  h1 { margin: 0; font-size: 28px; line-height: 1.15; }
  .meta { margin: 6px 0 22px; color: #9a9a9a; font-size: 13px; }
  .table-wrap { overflow-x: auto; border: 1px solid #2c2c2e; border-radius: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { padding: 11px 10px; text-align: left; color: #9a9a9a; font-size: 12px; font-weight: 600; background: #181818; border-bottom: 1px solid #2c2c2e; }
  td { padding: 14px 10px; font-size: ${Number(fs.fontSize) || 16}px; border-bottom: 1px solid #252525; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  tr:last-child td { border-bottom: 0; }
  .line { width: ${Number(fs.columns.line.width) || 64}px; font-weight: 700; }
  .destination { width: auto; }
  .platform { width: ${Number(fs.columns.platform.width) || 70}px; text-align: center; }
  .time { width: ${Number(fs.columns.departureTime.width) || 82}px; }
  .countdown { width: ${Number(fs.columns.countdown.width) || 92}px; text-align: right; font-weight: 700; }
  .ontime { color: #66bb6a; }
  .delayed { color: #ff9800; }
  .late { color: #ef5350; }
  .cancelled { color: #9a9a9a; }
  .empty { text-align: center; color: #9a9a9a; padding: 28px; }
</style>
</head>
<body>
  <h1>${htmlEsc(title)}</h1>
  <div class="meta">Abfahrten · aktualisiert ${htmlEsc(fmtClock(Date.now()))}${context?.autoSelected && Number.isFinite(context.distance) ? ' · 📍 automatisch gewählt · ' + htmlEsc(Math.round(context.distance) + ' m') : ''}</div>
  <div class="table-wrap">
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</body>
</html>`;

    const web = new WebView();
    await web.loadHTML(html);
    await web.present(true);
  } catch (e) {
    const alert = new Alert();
    alert.title = 'Abfahrten nicht verfügbar';
    alert.message = friendlyError(e) + '\n\nLetzter Versuch: ' + fmtClock(Date.now());
    alert.addAction('OK');
    await alert.present();
  }
  Script.complete();
}

async function setupMode() {
  const alert = new Alert();
  alert.title = 'TRIAS Key speichern';
  alert.message = 'Der Key wird sicher im iOS Keychain gespeichert. Widget-Parameter danach: leer oder "nearby".';
  alert.addTextField('Requestor-Key', Keychain.contains('TRIAS_REQUESTOR_REF') ? Keychain.get('TRIAS_REQUESTOR_REF') : '');
  alert.addAction('Speichern');
  alert.addCancelAction('Abbrechen');
  const choice = await alert.present();
  if (choice === -1) {
    const w = buildWidget('Setup', null, [], 0, 'Abgebrochen.');
    w.presentMedium();
    Script.complete();
    return false;
  }
  const key = alert.textFieldValue(0).trim();
  if (!key) {
    const w = buildWidget('Setup', null, [], 0, 'Kein Key eingegeben.');
    w.presentMedium();
    Script.complete();
    return false;
  }
  Keychain.set('TRIAS_REQUESTOR_REF', key);
  const check = Keychain.get('TRIAS_REQUESTOR_REF');
  const ok = check === key;
  const w = buildWidget(
    'Setup',
    null,
    [],
    0,
    ok
      ? `Key gespeichert (${key.length} Zeichen). Widget-Parameter: leer oder "nearby".`
      : 'Speichern fehlgeschlagen (Lesecheck abweichend).',
  );
  w.presentMedium();
  Script.complete();
  return ok;
}

async function main() {
  WIDGET_CONFIG = await loadWidgetConfig();
  await autoSyncOfflineData();
  const present = !config.runsInWidget;
  const parameter = rawParameter();
  const wantsSetup = parameter.toLowerCase() === 'setup';
  const wantsRefresh = parameter.toLowerCase() === 'refresh';
  const hasKeyInKeychain =
    Keychain.contains('TRIAS_REQUESTOR_REF') &&
    Keychain.get('TRIAS_REQUESTOR_REF').trim() !== '';

  if (wantsSetup) {
    await setupMode();
    return;
  }

  if (wantsRefresh) {
    const key = Keychain.contains('TRIAS_REQUESTOR_REF') ? Keychain.get('TRIAS_REQUESTOR_REF').trim() : '';
    if (key) await defaultWidget(key, false, '');
    else Script.complete();
    return;
  }

  if (!hasKeyInKeychain) {
    const parts = parameter.split('|').map((p) => p.trim()).filter(Boolean);
    const keyInParam = parts.find((p) => !/^nearby$/i.test(p));
    if (!keyInParam) {
      if (present) {
        await setupMode();
        return;
      }
      const w = buildWidget(
        'VAG Widget',
        null,
        [],
        0,
        'Setup: Skript einmal in Scriptable starten und den TRIAS-Key speichern.',
        parameter,
      );
      Script.setWidget(w);
      Script.complete();
      return;
    }
  }

  let key;
  try {
    ({ key } = parseParameter());
  } catch (e) {
    const w = buildWidget('VAG Widget', null, [], 0, e.message, parameter);
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
    return;
  }

  // Interactive location selection only runs when the script itself is opened
  // in Scriptable. The Home Screen widget remains passive and never relies on
  // widget tap URLs.
  if (present) {
    await nearbyFlow(key);
    return;
  }

  // The widget uses the last saved stop. If none was selected yet, the existing
  // Brauerei Ganter fallback is used.
  await defaultWidget(key, false, parameter);
}
await main();

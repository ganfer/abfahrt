// Variables used by Scriptable: icon-color: red; icon-glyph: train;
//
// public transport departures widget (EFA-BW TRIAS) — "abfahrt"
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

const APP_VERSION = '2.0.11';
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
const LAST_STOP_REF_KEY = 'ABFAHRT_LAST_STOP_REF';
const LAST_STOP_NAME_KEY = 'ABFAHRT_LAST_STOP_NAME';
const SAVED_STOPS_KEY = 'ABFAHRT_SAVED_STOPS';
const RECENT_STOPS_KEY = 'ABFAHRT_RECENT_STOPS';
const RECENT_STOPS_LIMIT = 20;

// User-facing Home Screen widget configuration. Every Scriptable widget
// family has its own layout; only behavior shared by all families lives in
// `common`.
const DEFAULT_WIDGET_CONFIG = {
  common: {
    refreshAfterLocationChange: true,
  },
  small: {
    rows: 3,
    showColumnHeader: false,
    columns: {
      line: { visible: true, width: 30 },
      destination: { visible: true, width: 70 },
      platform: { visible: false, width: 24 },
      departureTime: { visible: false, width: 38 },
      countdown: { visible: true, width: 42 },
    },
    spacing: { columns: 4, rows: 3 },
    fontSize: { line: 10, destination: 11, platform: 9, departureTime: 10, countdown: 11 },
    badgeHeight: 20,
  },
  medium: {
    rows: 5,
    showColumnHeader: false,
    columns: {
      line: { visible: true, width: 34 },
      destination: { visible: true, width: 105 },
      platform: { visible: true, width: 28 },
      departureTime: { visible: true, width: 42 },
      countdown: { visible: true, width: 50 },
    },
    spacing: { columns: 6, rows: 3 },
    fontSize: { line: 11, destination: 12, platform: 10, departureTime: 11, countdown: 12 },
    badgeHeight: 22,
  },
  large: {
    rows: 10,
    showColumnHeader: true,
    columns: {
      line: { visible: true, width: 34 },
      destination: { visible: true, width: 105 },
      platform: { visible: true, width: 28 },
      departureTime: { visible: true, width: 42 },
      countdown: { visible: true, width: 50 },
    },
    spacing: { columns: 6, rows: 4 },
    fontSize: { line: 11, destination: 12, platform: 10, departureTime: 11, countdown: 12 },
    badgeHeight: 24,
  },
  extraLarge: {
    rows: 14,
    showColumnHeader: true,
    columns: {
      line: { visible: true, width: 38 },
      destination: { visible: true, width: 150 },
      platform: { visible: true, width: 34 },
      departureTime: { visible: true, width: 48 },
      countdown: { visible: true, width: 56 },
    },
    spacing: { columns: 8, rows: 4 },
    fontSize: { line: 12, destination: 13, platform: 11, departureTime: 12, countdown: 13 },
    badgeHeight: 26,
  },
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
  destinationWrap: true,
  destinationLines: 2,
  sortBy: 'departureTime',
};

const DEFAULT_FILTER_CONFIG = { widget: true, fullscreen: true };
const DEFAULT_OFFLINE_CONFIG = { enabled: true, pinned: true, history: true, autoUpdate: true };
const GTFS_RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/abfahrt/gtfs-data/data/gtfs/';
const GTFS_CACHE_DIR = 'abfahrt-gtfs';

const DEFAULT_LOCATION_CONFIG = {
  autoSelectSavedStop: true,
  savedStopRadiusMeters: 200,
  fallbackMode: 'last',
};

const CONFIG_FILE_NAME = 'abfahrt.config.json';

function mergeWidgetLayout(defaults, saved) {
  const value = saved || {};
  return {
    rows: Number.isFinite(value.rows) ? value.rows : defaults.rows,
    showColumnHeader: typeof value.showColumnHeader === 'boolean'
      ? value.showColumnHeader
      : defaults.showColumnHeader,
    columns: Object.fromEntries(Object.keys(defaults.columns).map((key) => [
      key,
      { ...defaults.columns[key], ...(value.columns?.[key] || {}) },
    ])),
    spacing: { ...defaults.spacing, ...(value.spacing || {}) },
    fontSize: { ...defaults.fontSize, ...(value.fontSize || {}) },
    badgeHeight: Number.isFinite(value.badgeHeight) ? value.badgeHeight : defaults.badgeHeight,
  };
}

function mergeWidgetSettings(saved) {
  const s = saved || {};
  const widget = s.widget || {};
  const legacyMedium = {
    rows: s.rows,
    columns: s.columns,
    spacing: s.spacing,
    fontSize: s.fontSize,
    badgeHeight: s.badgeHeight,
  };
  const hasLegacyLayout =
    Number.isFinite(s.rows) ||
    Boolean(s.columns) ||
    Boolean(s.spacing) ||
    Boolean(s.fontSize) ||
    Number.isFinite(s.badgeHeight);
  return {
    common: {
      refreshAfterLocationChange:
        typeof widget.common?.refreshAfterLocationChange === 'boolean'
          ? widget.common.refreshAfterLocationChange
          : typeof s.refreshAfterLocationChange === 'boolean'
            ? s.refreshAfterLocationChange
            : DEFAULT_WIDGET_CONFIG.common.refreshAfterLocationChange,
    },
    small: mergeWidgetLayout(DEFAULT_WIDGET_CONFIG.small, widget.small),
    medium: mergeWidgetLayout(
      DEFAULT_WIDGET_CONFIG.medium,
      widget.medium || (hasLegacyLayout ? legacyMedium : null),
    ),
    large: mergeWidgetLayout(DEFAULT_WIDGET_CONFIG.large, widget.large),
    extraLarge: mergeWidgetLayout(DEFAULT_WIDGET_CONFIG.extraLarge, widget.extraLarge),
  };
}

function mergeWidgetConfig(saved) {
  const s = saved || {};
  return {
    widget: mergeWidgetSettings(s),
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
  return 'scriptable:///run/abfahrt';
}

function rawParameter() {
  return String(args.queryParameters?.parameter || args.widgetParameter || '').trim();
}

function parseParameter() {
  const raw = rawParameter();
  const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
  let key = parts.find((p) => !/^nearby$/i.test(p));
  const nearby = parts.some((p) => /^nearby$/i.test(p));
  if (!key && Keychain.contains('ABFAHRT_TRIAS_REQUESTOR_REF')) {
    key = Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF');
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
    'User-Agent': 'abfahrt/1.0 (Scriptable)',
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
    const stopRefs = Array.isArray(stop.stopRefs) && stop.stopRefs.length ? stop.stopRefs : [stop.stopRef];
    for (const rawRef of stopRefs) {
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
    for (const stop of recentStops().slice(0, RECENT_STOPS_LIMIT)) addStop(stop);
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
  const requested = Array.isArray(manifest.localRequestedStops)
    ? [...manifest.localRequestedStops].sort().join('|')
    : '';
  if (requested !== [...wanted].sort().join('|')) return true;
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
    const localManifest = { ...manifest.value, localSyncedAt: new Date().toISOString(), localRequestedStops: [...wanted] };
    manager.writeString(gtfsCachePath('manifest.json'), JSON.stringify(localManifest));
    manager.writeString(gtfsCachePath('index.json'), JSON.stringify({
      schemaVersion: index.value.schemaVersion,
      stops: Object.fromEntries(found.map((item) => [
        item.ref,
        { ...index.value.stops[item.sourceRef], sourceRef: item.sourceRef },
      ])),
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
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
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
      const midnight = serviceDate.getTime();
      for (const item of departures) {
        const [seconds, line, destination, serviceId] = item;
        if (!gtfsServiceRuns(shard.services?.[serviceId], serviceDate)) continue;
        const plannedTime = midnight + Number(seconds) * 1000;
        if (plannedTime < nowMs) continue;
        const dedupeKey = [logicalRef, plannedTime, line, destination, serviceId].join('|');
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
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

function withDelay(events, now, limit = widgetLayoutProfile().rows) {
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
    .slice(0, Math.max(1, Math.min(16, Number(limit) || 5)));
}

function widgetLayoutProfile(family = config.widgetFamily || 'medium') {
  const supported = ['small', 'medium', 'large', 'extraLarge'];
  const resolvedFamily = supported.includes(family) ? family : 'medium';
  const layout =
    WIDGET_CONFIG.widget?.[resolvedFamily] ||
    DEFAULT_WIDGET_CONFIG[resolvedFamily] ||
    DEFAULT_WIDGET_CONFIG.medium;
  return { family: resolvedFamily, ...layout };
}

function cancelledCount(events, now) {
  return events.filter((e) => e.cancelled && (e.realtimeTime || e.plannedTime) >= now).length;
}

function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function compareSortText(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'de-DE', { numeric: true, sensitivity: 'base' });
}

function compareFullscreenRows(a, b, sortBy = 'departureTime') {
  let primary = 0;
  if (sortBy === 'platform') primary = compareSortText(a.platform, b.platform);
  if (sortBy === 'destination') primary = compareSortText(a.destination, b.destination);
  if (sortBy === 'line') primary = compareSortText(a.line, b.line);
  return primary || (a.at - b.at);
}

function fullscreenGroupValue(row, sortBy = 'departureTime') {
  if (sortBy === 'platform') return String(row.platform || '').trim();
  if (sortBy === 'destination') return String(row.destination || '').trim();
  if (sortBy === 'line') return String(row.line || '').trim();
  return '';
}

function fullscreenGroupLabel(value, sortBy = 'departureTime') {
  const text = String(value || '').trim();
  if (sortBy === 'platform') return text ? 'Gleis ' + text : 'Ohne Gleisangabe';
  if (sortBy === 'destination') return text ? 'Richtung ' + text : 'Ohne Richtungsangabe';
  if (sortBy === 'line') return text ? 'Linie ' + text : 'Ohne Linienangabe';
  return '';
}

function groupFullscreenRows(rows, sortBy = 'departureTime') {
  if (sortBy === 'departureTime') return [{ key: '', label: '', rows: [...rows] }];

  const groups = [];
  for (const row of rows) {
    const value = fullscreenGroupValue(row, sortBy);
    const key = value.toLocaleLowerCase('de-DE');
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: fullscreenGroupLabel(value, sortBy), rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
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

function addColumnSpacer(row, hasPreviousColumn, layout) {
  if (hasPreviousColumn) row.addSpacer(Math.max(0, layout.spacing.columns));
}

function addWidgetColumnHeader(w, c, layout) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  let hasColumn = false;
  const columns = layout.columns;
  const labels = {
    line: 'Linie',
    destination: 'Richtung',
    platform: 'Gleis',
    departureTime: 'Abfahrt',
    countdown: 'Restzeit',
  };

  for (const key of ['line', 'destination', 'platform', 'departureTime', 'countdown']) {
    const columnConfig = columns[key];
    if (!columnConfig?.visible) continue;
    addColumnSpacer(row, hasColumn, layout);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columnConfig.width), 12);
    column.centerAlignContent();
    if (key === 'countdown') column.addSpacer();
    const label = column.addText(labels[key]);
    label.font = Font.mediumSystemFont(7);
    label.textColor = new Color(c.dim);
    label.lineLimit = 1;
    label.minimumScaleFactor = 0.6;
    hasColumn = true;
  }
}

function addDepartureRow(w, r, place, c, options = {}) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  if (options.highlight) {
    row.backgroundColor = new Color('#151517');
    row.cornerRadius = 7;
  }
  let hasColumn = false;
  const layout = options.layout || widgetLayoutProfile(options.family);
  const columns = layout.columns;
  const height = Math.max(16, layout.badgeHeight);

  if (columns.line.visible) {
    const badge = row.addStack();
    badge.size = new Size(Math.max(1, columns.line.width), height);
    badge.cornerRadius = 6;
    badge.backgroundColor = new Color('#2c2c2e');
    badge.centerAlignContent();
    badge.addSpacer();
    const badgeText = badge.addText(r.line || '–');
    badgeText.font = Font.boldSystemFont(layout.fontSize.line);
    badgeText.textColor = new Color(c.fg);
    badgeText.lineLimit = 1;
    badgeText.minimumScaleFactor = 0.6;
    badge.addSpacer();
    hasColumn = true;
  }

  if (columns.destination.visible) {
    addColumnSpacer(row, hasColumn, layout);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.destination.width), height);
    column.centerAlignContent();
    const destination = column.addText(compactDestination(r.destination, place));
    destination.font = Font.mediumSystemFont(layout.fontSize.destination);
    destination.textColor = new Color(r.cancelled ? c.dim : c.fg);
    destination.lineLimit = 1;
    destination.minimumScaleFactor = 0.6;
    if (r.cancelled) destination.textOpacity = 0.65;
    hasColumn = true;
  }

  if (columns.platform.visible) {
    addColumnSpacer(row, hasColumn, layout);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.platform.width), height);
    column.centerAlignContent();
    const platform = column.addText(r.platform || '–');
    platform.font = Font.systemFont(layout.fontSize.platform);
    platform.textColor = new Color(r.cancelled ? c.dim : c.fg);
    platform.lineLimit = 1;
    platform.minimumScaleFactor = 0.6;
    hasColumn = true;
  }

  if (columns.departureTime.visible) {
    addColumnSpacer(row, hasColumn, layout);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.departureTime.width), height);
    column.centerAlignContent();
    const clock = column.addText(fmtClock(r.at));
    clock.font = Font.systemFont(layout.fontSize.departureTime);
    clock.textColor = new Color(r.cancelled ? c.dim : c.fg);
    clock.lineLimit = 1;
    clock.minimumScaleFactor = 0.7;
    hasColumn = true;
  }

  if (columns.countdown.visible) {
    addColumnSpacer(row, hasColumn, layout);
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
    rightEl.font = Font.boldSystemFont(layout.fontSize.countdown);
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

function buildWidget(title, subtitle, rows, cancelledN, errorText, options = {}) {
  const c = palette();
  const w = new ListWidget();
  w.backgroundColor = new Color(c.bg);
  w.setPadding(11, 12, 9, 12);
  w.url = widgetOpenUrl();

  const stop = splitStopName(title);
  const realtimeAvailable = rows.some((r) => Boolean(r.realtimeTime));
  const platforms = [...new Set(rows.map((r) => String(r.platform || '').trim()).filter(Boolean))];
  const activePin = options.activePin || null;
  const platformSummary = platforms.length === 1
    ? '1 Steig'
    : platforms.length > 1
      ? platforms.length + ' Steige'
      : '';
  const statusLabel = realtimeAvailable ? 'Live' : 'Plan';
  const profile = widgetLayoutProfile(options.family);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  header.backgroundColor = new Color('#17171a');
  header.cornerRadius = 12;
  header.setPadding(6, 8, 6, 8);

  const badge = header.addStack();
  badge.size = new Size(28, 28);
  badge.cornerRadius = 14;
  badge.backgroundColor = new Color('#123822');
  badge.centerAlignContent();
  badge.addSpacer();
  const badgeText = badge.addText('H');
  badgeText.font = Font.boldSystemFont(16);
  badgeText.textColor = new Color('#ffd60a');
  badge.addSpacer();

  header.addSpacer(7);

  const titleEl = header.addText(stop.stop || title);
  titleEl.font = Font.boldSystemFont(15);
  titleEl.textColor = new Color(c.fg);
  titleEl.lineLimit = 1;
  titleEl.minimumScaleFactor = 0.68;

  header.addSpacer(10);

  const statusStack = header.addStack();
  statusStack.layoutHorizontally();
  statusStack.centerAlignContent();

  if (!errorText && rows.length) {
    const dot = statusStack.addText('●');
    dot.font = Font.systemFont(6);
    dot.textColor = new Color(realtimeAvailable ? '#30d158' : '#8e8e93');
    statusStack.addSpacer(3);

    const live = statusStack.addText(statusLabel);
    live.font = Font.mediumSystemFont(8);
    live.textColor = new Color(c.dim);
    live.lineLimit = 1;

    if (platformSummary) {
      statusStack.addSpacer(4);
      const sep = statusStack.addText('·');
      sep.font = Font.mediumSystemFont(8);
      sep.textColor = new Color(c.dim);
      statusStack.addSpacer(4);

      const platform = statusStack.addText(platformSummary);
      platform.font = Font.mediumSystemFont(8);
      platform.textColor = new Color(c.dim);
      platform.lineLimit = 1;
    }

    statusStack.addSpacer(4);
    const timeSep = statusStack.addText('·');
    timeSep.font = Font.mediumSystemFont(8);
    timeSep.textColor = new Color(c.dim);
    statusStack.addSpacer(4);
  }

  const updated = statusStack.addText('akt. ' + fmtClock(Date.now()));
  updated.font = Font.boldSystemFont(8);
  updated.textColor = new Color(errorText ? c.late : '#d8d8dc');
  updated.lineLimit = 1;

  if (cancelledN) {
    statusStack.addSpacer(4);
    const cancelled = statusStack.addText('· ' + cancelledN + ' entfällt');
    cancelled.font = Font.mediumSystemFont(8);
    cancelled.textColor = new Color(c.dim);
    cancelled.lineLimit = 1;
  }

  header.addSpacer();

  if (activePin) {
    const pin = header.addText(activePin.home === true ? '🏠' : '★');
    pin.font = Font.systemFont(12);
    pin.textColor = new Color(activePin.home === true ? c.fg : '#ffd60a');
    pin.lineLimit = 1;
  }

  w.addSpacer(7);

  if (errorText) {
    const errorCard = w.addStack();
    errorCard.backgroundColor = new Color('#26191a');
    errorCard.cornerRadius = 8;
    errorCard.setPadding(6, 7, 6, 7);
    const err = errorCard.addText(errorText);
    err.font = Font.systemFont(10);
    err.textColor = new Color(c.late);
    err.lineLimit = 2;
  } else if (!rows.length) {
    const emptyCard = w.addStack();
    emptyCard.backgroundColor = new Color('#18181b');
    emptyCard.cornerRadius = 8;
    emptyCard.setPadding(6, 7, 6, 7);
    const none = emptyCard.addText('Keine Abfahrten');
    none.font = Font.systemFont(11);
    none.textColor = new Color(c.dim);
  } else {
    const visibleRows = rows.slice(0, profile.rows);
    if (profile.showColumnHeader) {
      addWidgetColumnHeader(w, c, profile);
      w.addSpacer(4);
    }
    visibleRows.forEach((r, index) => {
      addDepartureRow(w, r, stop.place, c, {
        highlight: index === 0,
        layout: profile,
      });
      if (index < visibleRows.length - 1) {
        w.addSpacer(Math.max(1, profile.spacing.rows));
      }
    });
  }

  return w;
}

async function defaultWidget(key, present) {
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
    const profile = widgetLayoutProfile();
    const events = await fetchDeparturesWithOffline(stopRefs, key, Math.max(8, profile.rows));
    const filteredEvents = applyPinnedFilter(events, activePin, 'widget');
    const rows = withDelay(filteredEvents, Date.now(), profile.rows);
    const sub = filteredEvents.length
      ? `${filteredEvents.length} Ereignisse gelesen`
      : 'API antwortete ohne Events';
    const w = buildWidget(
      title,
      rows.length ? null : sub,
      rows,
      cancelledCount(filteredEvents, Date.now()),
      null,
      { activePin },
    );
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
  } catch (e) {
    const w = buildWidget(title, null, [], 0, friendlyError(e), { activePin });
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
  }
}

async function showLocationError(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
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

function pinnedStops() {
  return savedStops()
    .filter((stop) => stop.pinned === true)
    .sort((a, b) => Number(b.home === true) - Number(a.home === true));
}

async function choosePinnedStop(key, options = {}) {
  const pinned = pinnedStops();
  if (!pinned.length) return false;

  const picker = new Alert();
  picker.title = options.title || 'Angepinnte Haltestellen';
  picker.message = options.message || 'Wähle eine angepinnte Haltestelle.';
  for (const stop of pinned) {
    picker.addAction(pinnedLabel(stop));
  }
  picker.addCancelAction(options.cancelLabel || 'Abbrechen');

  const idx = await picker.present();
  if (idx === -1) {
    Script.complete();
    return true;
  }

  const selectedPin = pinned[idx];
  rememberStop({
    stopRef: selectedPin.stopRef,
    name: selectedPin.displayName || selectedPin.name,
  });
  requestWidgetRefresh();
  await presentDeparturesTable(key);
  return true;
}

function requestWidgetRefresh() {
  if (!WIDGET_CONFIG.widget.common.refreshAfterLocationChange) return;
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

async function fallbackToLastStop(key, reason) {
  const hasLastStop =
    Keychain.contains(LAST_STOP_REF_KEY) &&
    Keychain.get(LAST_STOP_REF_KEY).trim() !== '';
  const mode = WIDGET_CONFIG.location.fallbackMode || 'last';
  if (mode === 'none') return false;

  if (mode === 'home') {
    const home = homeStop();
    if (home) {
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
  }

  if (!hasLastStop) return false;
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
  let loc;
  try {
    Location.setAccuracyToHundredMeters();
    loc = await Location.current();
  } catch (_) {
    if (await choosePinnedStop(key, {
      title: 'Standort nicht verfügbar',
      message: 'GPS ist nicht verfügbar. Wähle stattdessen eine angepinnte Haltestelle.',
    })) return;
    if (await fallbackToLastStop(key, 'GPS ist nicht verfügbar.')) return;
    await showLocationError(
      'Standort nicht verfügbar',
      'Scriptable konnte deinen Standort nicht ermitteln. Prüfe in den iOS-Einstellungen unter „Datenschutz & Sicherheit → Ortungsdienste“, ob Scriptable auf deinen Standort zugreifen darf.',
    );
    Script.complete();
    return;
  }

  let stops;
  try {
    const xml = await triasPost(buildNearbyRequest(loc.latitude, loc.longitude, key));
    const doc = parseXmlTree(xml);
    stops = nearbyStopsFromDoc(doc);
  } catch (_) {
    if (await choosePinnedStop(key, {
      title: 'Haltestellensuche nicht verfügbar',
      message: 'Die Haltestellen in deiner Nähe konnten gerade nicht geladen werden. Wähle stattdessen eine angepinnte Haltestelle.',
    })) return;
    if (await fallbackToLastStop(key, 'Die Haltestellensuche konnte nicht geladen werden.')) return;
    await showLocationError(
      'Haltestellensuche nicht verfügbar',
      'Die Haltestellen in deiner Nähe konnten gerade nicht geladen werden. Bitte versuche es in einem Moment erneut.',
    );
    Script.complete();
    return;
  }

  if (!stops.length) {
    if (await choosePinnedStop(key, {
      title: 'Keine Haltestellen in der Nähe',
      message: 'In deiner Nähe wurden keine Haltestellen gefunden. Wähle stattdessen eine angepinnte Haltestelle.',
    })) return;
    if (await fallbackToLastStop(key, 'In der Nähe wurden keine Haltestellen gefunden.')) return;
    await showLocationError(
      'Keine Haltestellen gefunden',
      'In deiner Nähe konnten keine Haltestellen ermittelt werden. Prüfe deinen Standort und versuche es erneut.',
    );
    Script.complete();
    return;
  }

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
    await choosePinnedStop(key, { cancelLabel: 'Zurück' });
    return;
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
      .sort((a, b) => compareFullscreenRows(a, b, WIDGET_CONFIG.fullscreen.sortBy))
      .slice(0, WIDGET_CONFIG.fullscreen.rows);

    const fs = WIDGET_CONFIG.fullscreen;
    const realtimeAvailable = rows.some((r) => Boolean(r.realtimeTime));
    const statusLabel = realtimeAvailable ? 'Live' : 'Fahrplan';
    const statusClass = realtimeAvailable ? 'live' : 'schedule';
    const platformValues = [...new Set(rows.map((r) => String(r.platform || '').trim()).filter(Boolean))];
    const platformSummary = platformValues.length === 1
      ? '1 Steig'
      : platformValues.length > 1
        ? platformValues.length + ' Steige'
        : '';
    const pinGlyph = activePin ? '★' : '☆';
    const pinTitle = activePin ? 'Angepinnte Haltestelle' : 'Nicht angepinnt';
    const locationMeta = context?.autoSelected && Number.isFinite(context.distance)
      ? ' · 📍 ' + Math.round(context.distance) + ' m'
      : '';

    const defs = [
      { key: 'line', label: 'Linie', value: (r) => r.line || '–', cls: 'line' },
      { key: 'destination', label: 'Richtung', value: (r) => r.destination || '–', cls: 'destination' },
      { key: 'platform', label: 'Gleis', value: (r) => r.platform || '–', cls: 'platform' },
      { key: 'departureTime', label: 'Abfahrt', value: (r) => fmtClock(r.at), cls: 'time' },
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

    const widthSum = defs.reduce((sum, d) => sum + Math.max(1, Number(fs.columns[d.key].width) || 1), 0);
    const colgroup = defs.map((d) => {
      const configured = Math.max(1, Number(fs.columns[d.key].width) || 1);
      const percent = widthSum > 0 ? (configured / widthSum * 100).toFixed(2) : (100 / Math.max(1, defs.length)).toFixed(2);
      return `<col class="${d.cls}" style="width:${percent}%">`;
    }).join('');
    const destinationWrap = fs.destinationWrap !== false;
    const destinationLines = Math.max(1, Math.min(4, Number(fs.destinationLines) || 2));
    const header = defs.map((d) => `<th class="${d.cls}">${htmlEsc(d.label)}</th>`).join('');
    const renderDepartureRow = (r) => {
      const cells = defs.map((d) => {
        let state = '';
        if (d.key === 'countdown') {
          state = r.cancelled ? ' cancelled' : r.delayMin >= DELAY_HEAVY_MIN ? ' late' : r.delayMin > 0 ? ' delayed' : ' ontime';
        }
        const value = htmlEsc(d.value(r));
        if (d.key === 'line') {
          return `<td class="${d.cls}${state}"><span class="line-badge">${value}</span></td>`;
        }
        if (d.key === 'destination') {
          const wrapClass = destinationWrap ? ' destination-wrap' : ' destination-nowrap';
          return `<td class="${d.cls}${state}"><div class="destination-text${wrapClass}">${value}</div></td>`;
        }
        if (d.key === 'departureTime') {
          const marker = r.realtimeTime
            ? '<span class="time-marker realtime-marker" aria-label="Echtzeit">•</span>'
            : '<span class="time-marker schedule-marker" aria-label="Fahrplan">°</span>';
          return `<td class="${d.cls}${state}"><span class="time-value">${value}</span>${marker}</td>`;
        }
        return `<td class="${d.cls}${state}">${value}</td>`;
      }).join('');
      return `<tr class="departure-row">${cells}</tr>`;
    };

    const groupedRows = groupFullscreenRows(rows, fs.sortBy);
    const body = rows.length
      ? groupedRows.map((group) => {
          const heading = group.label
            ? `<tr class="group-row"><td colspan="${Math.max(1, defs.length)}"><div class="group-heading"><span class="group-title">${htmlEsc(group.label)}</span><span class="group-count">${group.rows.length === 1 ? '1 Abfahrt' : group.rows.length + ' Abfahrten'}</span></div></td></tr>`
            : '';
          return heading + group.rows.map(renderDepartureRow).join('');
        }).join('')
      : `<tr><td class="empty" colspan="${Math.max(1, defs.length)}">Keine kommenden Abfahrten</td></tr>`;

    const html = `<!doctype html>
<html lang="de">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  :root {
    color-scheme: dark;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
    --bg: #0d0d0f;
    --card: #171719;
    --card-2: #1d1d20;
    --border: rgba(255,255,255,.11);
    --muted: #9b9ba1;
    --text: #f5f5f7;
    --green: #69c26a;
    --orange: #ff9f0a;
    --red: #ff453a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: max(18px, env(safe-area-inset-top)) 14px max(28px, env(safe-area-inset-bottom));
    background:
      radial-gradient(circle at 50% -8%, rgba(58,122,255,.10), transparent 32%),
      var(--bg);
    color: var(--text);
  }

  .stop-card {
    position: relative;
    overflow: hidden;
    margin-bottom: 14px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background:
      radial-gradient(circle at 10% 15%, rgba(34,197,94,.18), transparent 34%),
      radial-gradient(circle at 80% 100%, rgba(49,130,246,.12), transparent 42%),
      linear-gradient(145deg, rgba(31,31,35,.96), rgba(18,18,20,.98));
    box-shadow: 0 12px 30px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.035);
  }
  .stop-card::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(115deg, transparent 15%, rgba(255,255,255,.025) 42%, transparent 66%);
  }
  .stop-top {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .stop-symbol {
    flex: 0 0 50px;
    width: 50px;
    height: 50px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid rgba(74,222,128,.30);
    background: rgba(16,67,43,.55);
    box-shadow: inset 0 0 0 7px rgba(74,222,128,.06);
  }
  .stop-symbol > span {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #ffd60a;
    color: #087f39;
    font-size: 24px;
    font-weight: 900;
    line-height: 1;
    box-shadow: 0 0 14px rgba(74,222,128,.24);
  }
  .stop-copy { min-width: 0; flex: 1; }
  .stop-title {
    margin: 0;
    font-size: clamp(23px, 7vw, 30px);
    line-height: 1.08;
    letter-spacing: -.025em;
    overflow-wrap: anywhere;
  }
  .meta {
    margin-top: 6px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.25;
  }
  .pin-state {
    position: relative;
    z-index: 1;
    flex: 0 0 42px;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: rgba(255,255,255,.045);
    color: #d8d8dc;
    font-size: 24px;
    line-height: 1;
  }
  .pin-state.active { color: #ffd60a; }
  .status-row {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    padding-left: 62px;
  }
  .chip {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgba(255,255,255,.045);
    color: #d7d7dc;
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }
  .chip.live {
    border-color: rgba(48,209,88,.24);
    background: rgba(17,92,50,.30);
    color: #73e895;
  }
  .chip.schedule { color: #b7b7bc; }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 0 rgba(115,232,149,.35);
    animation: livePulse 1.8s ease-out infinite;
  }
  .chip.schedule .live-dot {
    animation: none;
    background: #8e8e93;
    box-shadow: none;
  }
  @keyframes livePulse {
    0% { box-shadow: 0 0 0 0 rgba(115,232,149,.34); }
    70% { box-shadow: 0 0 0 7px rgba(115,232,149,0); }
    100% { box-shadow: 0 0 0 0 rgba(115,232,149,0); }
  }

  .table-wrap {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: rgba(20,20,22,.96);
    box-shadow: 0 10px 28px rgba(0,0,0,.18);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  th {
    padding: 12px 7px;
    text-align: left;
    color: #9c9ca2;
    font-size: 12px;
    font-weight: 700;
    background: linear-gradient(180deg, #1d1d20, #19191b);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  td {
    position: relative;
    padding: 13px 7px;
    font-size: ${Number(fs.fontSize) || 16}px;
    border-bottom: 1px solid rgba(255,255,255,.075);
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
  }
  td:not(.destination) { white-space: nowrap; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:first-child td {
    background: linear-gradient(90deg, rgba(255,255,255,.025), rgba(255,255,255,0));
  }
  .line { min-width: 46px; font-weight: 700; }
  td.line { overflow: visible; }
  .line-badge {
    display: inline-grid;
    place-items: center;
    min-width: 34px;
    height: 34px;
    padding: 0 9px;
    border-radius: 11px;
    background: linear-gradient(180deg, #2a2a2e, #222225);
    box-shadow: inset 0 1px rgba(255,255,255,.06);
  }
  .destination { min-width: 86px; text-align: left; }
  .destination-text { line-height: 1.18; overflow: hidden; }
  .destination-wrap {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: ${destinationLines};
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }
  .destination-nowrap { white-space: nowrap; text-overflow: ellipsis; }
  .platform { min-width: 44px; text-align: center; }
  .time {
    min-width: 68px;
    font-variant-numeric: tabular-nums;
    overflow: visible;
    text-overflow: clip;
  }
  .time-value { letter-spacing: -.01em; }
  .time-marker {
    display: inline-block;
    margin-left: 3px;
    font-size: .72em;
    vertical-align: .18em;
  }
  .realtime-marker { color: #62d97b; }
  .schedule-marker { color: #8e8e93; }
  .countdown {
    min-width: 76px;
    padding-right: 20px;
    text-align: right;
    font-weight: 750;
    white-space: nowrap;
  }
  tbody td:last-child {
    padding-right: 20px;
  }
  tbody tr.departure-row td:last-child::after {
    content: "›";
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-51%);
    color: #707077;
    font-size: 24px;
    font-weight: 300;
  }
  .ontime { color: var(--green); }
  .delayed { color: var(--orange); }
  .late { color: var(--red); }
  .cancelled { color: #8e8e93; text-decoration: line-through; }
  .group-row td {
    padding: 13px 12px 8px;
    border-bottom-color: rgba(255,255,255,.10);
    background: linear-gradient(180deg, rgba(40,40,44,.98), rgba(30,30,33,.98));
    color: #d7d7dc;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .01em;
    overflow: visible;
    white-space: normal;
  }
  .group-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .group-title {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .group-count {
    flex: 0 0 auto;
    color: #85858c;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .empty { text-align: center; color: var(--muted); padding: 30px 14px; }

  @media (max-width: 360px) {
    body { padding-left: 10px; padding-right: 10px; }
    .stop-card { padding: 14px; }
    .stop-symbol { flex-basis: 44px; width: 44px; height: 44px; }
    .stop-symbol > span { width: 30px; height: 30px; font-size: 21px; }
    .status-row { padding-left: 56px; }
    th, td { padding-left: 5px; padding-right: 5px; }
    .line { min-width: 42px; }
    .platform { min-width: 40px; }
    .time { min-width: 64px; }
    .countdown { min-width: 70px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-dot { animation: none; }
  }
</style>
</head>
<body>
  <section class="stop-card">
    <div class="stop-top">
      <div class="stop-symbol" aria-hidden="true"><span>H</span></div>
      <div class="stop-copy">
        <h1 class="stop-title">${htmlEsc(title)}</h1>
        <div class="meta">Abfahrten · aktualisiert ${htmlEsc(fmtClock(Date.now()))}${htmlEsc(locationMeta)}</div>
      </div>
      <div class="pin-state${activePin ? ' active' : ''}" title="${htmlEsc(pinTitle)}" aria-label="${htmlEsc(pinTitle)}">${pinGlyph}</div>
    </div>
    <div class="status-row">
      <div class="chip ${statusClass}"><span class="live-dot"></span>${statusLabel}</div>
      ${platformSummary ? `<div class="chip platform-chip"><span aria-hidden="true">▥</span>${htmlEsc(platformSummary)}</div>` : ''}
    </div>
  </section>

  <div class="table-wrap">
    <table>
      <colgroup>${colgroup}</colgroup>
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
  alert.message = 'Der Key wird sicher im iOS Keychain gespeichert. Der Widget-Parameter kann leer bleiben.';
  alert.addTextField('Requestor-Key', Keychain.contains('ABFAHRT_TRIAS_REQUESTOR_REF') ? Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF') : '');
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
  Keychain.set('ABFAHRT_TRIAS_REQUESTOR_REF', key);
  const check = Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF');
  const ok = check === key;
  const w = buildWidget(
    'Setup',
    null,
    [],
    0,
    ok
      ? `Key gespeichert (${key.length} Zeichen). Der Widget-Parameter kann leer bleiben.`
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
    Keychain.contains('ABFAHRT_TRIAS_REQUESTOR_REF') &&
    Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF').trim() !== '';

  if (wantsSetup) {
    await setupMode();
    return;
  }

  if (wantsRefresh) {
    const key = Keychain.contains('ABFAHRT_TRIAS_REQUESTOR_REF') ? Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF').trim() : '';
    if (key) await defaultWidget(key, false);
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
        'abfahrt',
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
    const w = buildWidget('abfahrt', null, [], 0, e.message, parameter);
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
  await defaultWidget(key, false);
}
await main();

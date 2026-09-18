// Variables used by Scriptable: icon-color: green; icon-glyph: list-alt;
//
// Fullscreen departures display for VagAbfahrten.

const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';
const REQUEST_TIMEOUT_MS = 12000;
const LAST_STOP_REF_KEY = 'VAG_LAST_STOP_REF';
const LAST_STOP_NAME_KEY = 'VAG_LAST_STOP_NAME';
const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';
const SAVED_STOPS_KEY = 'VAG_SAVED_STOPS';
const NEARBY_RESULTS = 8;
const DEFAULT_STOPS = ['de:08311:30120:0:1', 'de:08311:30120:0:2'];
const DISPLAY_CONFIG_DEFAULTS = {
  rows: 8,
  columns: {
    line: { visible: true, width: 64 },
    destination: { visible: true, width: 190 },
    platform: { visible: true, width: 70 },
    departureTime: { visible: true, width: 82 },
    countdown: { visible: true, width: 92 },
  },
  fontSize: 16,
  location: {
    autoRefreshOnOpen: false,
    autoSelectSavedStop: true,
  },
};

function loadDisplayConfig() {
  const fm = FileManager.iCloud();
  const path = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);
  if (!fm.fileExists(path)) return DISPLAY_CONFIG_DEFAULTS;
  try {
    const saved = JSON.parse(fm.readString(path));
    const fs = saved.fullscreen || {};
    return {
      ...DISPLAY_CONFIG_DEFAULTS,
      ...fs,
      columns: Object.fromEntries(Object.keys(DISPLAY_CONFIG_DEFAULTS.columns).map((key) => [
        key,
        { ...DISPLAY_CONFIG_DEFAULTS.columns[key], ...(fs.columns?.[key] || {}) },
      ])),
      location: { ...DISPLAY_CONFIG_DEFAULTS.location, ...(fs.location || {}) },
    };
  } catch (_) {
    return DISPLAY_CONFIG_DEFAULTS;
  }
}

function xmlEsc(v) {
  return String(v).replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[ch]));
}

function htmlEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function buildRequest(stopRef, key, count) {
  const ts = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Trias version="1.2" language="de" xmlns="http://www.vdv.de/trias" xmlns:siri="http://www.siri.org.uk/siri">
<ServiceRequest><siri:RequestTimestamp>${ts}</siri:RequestTimestamp><siri:RequestorRef>${xmlEsc(key)}</siri:RequestorRef>
<RequestPayload><StopEventRequest><Location><LocationRef><StopPointRef>${xmlEsc(stopRef)}</StopPointRef></LocationRef><DepArrTime>${ts}</DepArrTime></Location>
<Params><Language>de</Language><NumberOfResults>${count}</NumberOfResults><IncludeRealtimeData>true</IncludeRealtimeData><StopEventPolicy>DEPARTURE</StopEventPolicy></Params>
</StopEventRequest></RequestPayload></ServiceRequest></Trias>`;
}

function parseXml(raw) {
  const root = { name: '#document', textContent: '', children: [] };
  let current = root;
  const parser = new XMLParser(raw);
  parser.didStartElement = (name, attrs) => {
    const rawName = String(name);
    const node = { name: rawName.includes(':') ? rawName.split(':').pop() : rawName, attrs: attrs || {}, textContent: '', children: [], parent: current };
    current.children.push(node); current = node;
  };
  parser.didEndElement = () => { current = current.parent || root; };
  parser.foundCharacters = (s) => { current.textContent += s; };
  parser.parse();
  return root;
}

function child(node, ...names) {
  let level = node ? [node] : [];
  for (const name of names) {
    const next = [];
    for (const n of level) for (const c of (n.children || [])) if (c.name === name) next.push(c);
    if (!next.length) return null;
    level = next;
  }
  return level[0];
}
function children(node, name) { return node ? (node.children || []).filter((c) => c.name === name) : []; }
function text(node, ...names) { const n = child(node, ...names); return n ? (n.textContent || '').trim() : ''; }

function eventsFromXml(raw) {
  const doc = parseXml(raw);
  const response =
    child(doc, 'Trias', 'ServiceDelivery', 'DeliveryPayload', 'StopEventResponse') ||
    child(doc, 'Trias', 'StopEventResponse') ||
    child(doc, 'ServiceDelivery', 'DeliveryPayload', 'StopEventResponse') ||
    child(doc, 'StopEventResponse');
  const out = [];
  for (const result of children(response, 'StopEventResult')) {
    const event = child(result, 'StopEvent');
    const call = child(event, 'ThisCall', 'CallAtStop') || child(event, 'CallAtStop');
    const service = child(event, 'Service');
    if (!call || !service) continue;
    const planned = text(call, 'ServiceDeparture', 'TimetabledTime');
    if (!planned) continue;
    const estimated = text(call, 'ServiceDeparture', 'EstimatedTime');
    const section = child(service, 'ServiceSection');
    out.push({
      plannedTime: Date.parse(planned),
      realtimeTime: estimated ? Date.parse(estimated) : null,
      cancelled: text(call, 'NotServicedStop') === 'true',
      line: text(section, 'PublishedLineName', 'Text') || text(section, 'PublishedLineName') || text(service, 'PublishedLineName', 'Text') || text(service, 'PublishedLineName'),
      destination: text(service, 'DestinationText', 'Text') || text(service, 'DestinationText'),
      platform: text(call, 'EstimatedBay') || text(call, 'PlannedBay') || text(call, 'StopPointName', 'Text') || text(call, 'StopPointName') || '',
    });
  }
  return out;
}


function buildNearbyRequest(lat, lon, key) {
  const ts = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<Trias version="1.2" language="de" xmlns="http://www.vdv.de/trias" xmlns:siri="http://www.siri.org.uk/siri">
<ServiceRequest><siri:RequestTimestamp>${ts}</siri:RequestTimestamp><siri:RequestorRef>${xmlEsc(key)}</siri:RequestorRef>
<RequestPayload><LocationInformationRequest><InitialInput><GeoPosition><Longitude>${lon}</Longitude><Latitude>${lat}</Latitude></GeoPosition></InitialInput>
<Restrictions><Type>stop</Type><NumberOfResults>${NEARBY_RESULTS}</NumberOfResults></Restrictions>
</LocationInformationRequest></RequestPayload></ServiceRequest></Trias>`;
}

function nearbyStopsFromXml(raw) {
  const doc = parseXml(raw);
  const response =
    child(doc, 'Trias', 'ServiceDelivery', 'DeliveryPayload', 'LocationInformationResponse') ||
    child(doc, 'Trias', 'LocationInformationResponse') ||
    child(doc, 'ServiceDelivery', 'DeliveryPayload', 'LocationInformationResponse') ||
    child(doc, 'LocationInformationResponse');
  const out = [];
  for (const result of children(response, 'LocationResult')) {
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
    if (stopRef && name) out.push({ stopRef, name });
  }
  const seen = new Set();
  return out.filter((s) => {
    const key = s.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function savedStops() {
  try {
    return Keychain.contains(SAVED_STOPS_KEY) ? JSON.parse(Keychain.get(SAVED_STOPS_KEY)) : [];
  } catch (_) {
    return [];
  }
}

function rememberStop(stop) {
  const list = savedStops();
  const norm = stop.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
  const existing = list.find((s) =>
    s.stopRef === stop.stopRef ||
    String(s.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE') === norm
  );
  const filtered = list.filter((s) =>
    s.stopRef !== stop.stopRef &&
    String(s.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE') !== norm
  );
  const updated = [{ stopRef: stop.stopRef, name: stop.name, pinned: existing?.pinned === true }, ...filtered];
  const pinned = updated.filter((s) => s.pinned === true);
  const recent = updated.filter((s) => s.pinned !== true).slice(0, 20);
  Keychain.set(SAVED_STOPS_KEY, JSON.stringify([...pinned, ...recent]));
  Keychain.set(LAST_STOP_REF_KEY, stop.stopRef);
  Keychain.set(LAST_STOP_NAME_KEY, stop.name);
}

async function chooseLocation(key, cfg) {
  Location.setAccuracyToHundredMeters();
  const loc = await Location.current();
  const req = new Request(TRIAS_ENDPOINT);
  req.method = 'POST';
  req.headers = { 'Content-Type': 'text/xml; charset=utf-8', Accept: 'text/xml' };
  req.body = buildNearbyRequest(loc.latitude, loc.longitude, key);
  req.timeoutInterval = REQUEST_TIMEOUT_MS / 1000;
  const raw = await req.loadString();
  const stops = nearbyStopsFromXml(raw);
  if (!stops.length) throw new Error('Keine Haltestellen in der Nähe gefunden.');

  if (cfg.location.autoSelectSavedStop) {
    const saved = savedStops();
    const savedRefs = new Set(saved.map((s) => s.stopRef));
    const savedNames = new Set(saved.map((s) => String(s.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')));
    const hit = stops.find((s) =>
      savedRefs.has(s.stopRef) ||
      savedNames.has(s.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE'))
    );
    if (hit) {
      rememberStop(hit);
      return hit;
    }
  }

  const picker = new Alert();
  picker.title = 'Haltestelle wählen';
  picker.message = 'Haltestellen in deiner Nähe';
  for (const stop of stops) picker.addAction(stop.name);
  picker.addCancelAction('Abbrechen');
  const choice = await picker.present();
  if (choice === -1) return null;
  const selected = stops[choice];
  rememberStop(selected);
  return selected;
}

async function fetchDepartures(refs, key, count) {
  const all = [];
  for (const ref of refs) {
    const req = new Request(TRIAS_ENDPOINT);
    req.method = 'POST';
    req.headers = { 'Content-Type': 'text/xml; charset=utf-8', Accept: 'text/xml' };
    req.body = buildRequest(ref, key, count);
    req.timeoutInterval = REQUEST_TIMEOUT_MS / 1000;
    const raw = await req.loadString();
    if ((req.response?.statusCode || 200) >= 400) throw new Error('TRIAS HTTP ' + req.response.statusCode);
    all.push(...eventsFromXml(raw));
  }
  return all;
}

function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

async function showError(message) {
  const a = new Alert(); a.title = 'Abfahrten'; a.message = message; a.addAction('OK'); await a.present();
}

async function main() {
  if (!Keychain.contains('TRIAS_REQUESTOR_REF')) {
    await showError('Kein TRIAS-Key im Keychain. Bitte zuerst VagAbfahrten manuell starten.');
    return;
  }
  const key = Keychain.get('TRIAS_REQUESTOR_REF').trim();
  const cfg = loadDisplayConfig();
  let refs = Keychain.contains(LAST_STOP_REF_KEY) ? [Keychain.get(LAST_STOP_REF_KEY)] : DEFAULT_STOPS;
  let title = Keychain.contains(LAST_STOP_NAME_KEY) ? Keychain.get(LAST_STOP_NAME_KEY) : 'Brauerei Ganter';

  try {
    const wantsLocation = String(args.queryParameters?.action || '').toLowerCase() === 'location';
    if (wantsLocation || cfg.location.autoRefreshOnOpen) {
      const selected = await chooseLocation(key, cfg);
      if (selected) {
        refs = [selected.stopRef];
        title = selected.name;
      }
    }
    const now = Date.now();
    const events = (await fetchDepartures(refs, key, Math.max(8, cfg.rows)))
      .map((e) => ({ ...e, at: e.realtimeTime || e.plannedTime }))
      .filter((e) => e.at >= now)
      .sort((a, b) => a.at - b.at)
      .slice(0, cfg.rows);

    const defs = [
      ['line', 'Linie', (r) => r.line || '–'],
      ['destination', 'Richtung', (r) => r.destination || '–'],
      ['platform', 'Gleis', (r) => r.platform || '–'],
      ['departureTime', 'Abfahrt', (r) => fmtClock(r.at)],
      ['countdown', 'Restzeit', (r) => r.cancelled ? 'entfällt' : Math.max(0, Math.floor((r.at - Date.now()) / 60000)) + ' min'],
    ].filter(([key]) => cfg.columns[key].visible);

    const configuredTotal = defs.reduce((sum, [key]) => sum + (Number(cfg.columns[key].width) || 80), 0);
    const cols = defs.map(([key]) => {
      const width = Number(cfg.columns[key].width) || 80;
      const percent = configuredTotal > 0 ? (width / configuredTotal) * 100 : (100 / defs.length);
      return `<col style="width:${percent.toFixed(2)}%">`;
    }).join('');
    const heads = defs.map(([, label]) => `<th>${htmlEsc(label)}</th>`).join('');
    const rows = events.length ? events.map((r) =>
      '<tr>' + defs.map(([key,, value]) => `<td class="${key}">${htmlEsc(value(r))}</td>`).join('') + '</tr>'
    ).join('') : `<tr><td colspan="${defs.length}">Keine kommenden Abfahrten</td></tr>`;

    const html = `<!doctype html><html lang="de"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
*{box-sizing:border-box}html,body{width:100%;max-width:100%;overflow-x:hidden}body{margin:0;padding:max(22px,env(safe-area-inset-top)) 16px 30px;background:#101010;color:#f0f0f0}
h1{font-size:28px;margin:0;overflow-wrap:anywhere}.meta{color:#999;margin:5px 0 20px}.wrap{width:100%;max-width:100%;overflow:hidden;border:1px solid #2c2c2e;border-radius:14px}
table{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:13px 6px;border-bottom:1px solid #292929;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
th{font-size:12px;color:#999;text-align:left;background:#181818}td{font-size:min(${Number(cfg.fontSize) || 16}px,4vw)}.line{font-weight:700}.platform{text-align:center}.departureTime{text-align:center}.countdown{font-weight:700;text-align:right}
@media(max-width:430px){body{padding-left:12px;padding-right:12px}h1{font-size:26px}th,td{padding-left:4px;padding-right:4px}th{font-size:11px}}
</style></head><body><h1>${htmlEsc(title)}</h1><div class="meta">Abfahrten · aktualisiert ${fmtClock(Date.now())}</div>
<div class="wrap"><table><colgroup>${cols}</colgroup><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>
<div style="margin-top:18px"><a href="scriptable:///run/VagAbfahrten-Display?action=location" style="display:inline-block;color:#0a84ff;text-decoration:none;font-size:16px;padding:10px 0">⌖ Standort aktualisieren</a></div>
</body></html>`;

    const web = new WebView();
    await web.loadHTML(html);
    await web.present(true);
  } catch (e) {
    await showError('Abfahrten konnten nicht geladen werden.\n\n' + e.message);
  }
  Script.complete();
}

await main();

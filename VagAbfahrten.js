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

const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';
const DEFAULT_STOPS = [
  'de:08311:30120:0:1',
  'de:08311:30120:0:2',
];
const REQUEST_TIMEOUT_MS = 12000;
const RESULTS_LIMIT = 8;
const NEARBY_RESULTS = 5;
const DELAY_HEAVY_MIN = 5;
const LAST_STOP_REF_KEY = 'VAG_LAST_STOP_REF';
const LAST_STOP_NAME_KEY = 'VAG_LAST_STOP_NAME';

// User-facing widget layout configuration. Widths are points inside the
// medium Scriptable widget. Hide columns you do not need and give the freed
// space to another visible column.
const DEFAULT_WIDGET_CONFIG = {
  rows: 5,
  columns: {
    line: { visible: true, width: 34 },
    destination: { visible: true, width: 125 },
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
    departureTime: 11,
    countdown: 12,
  },
  badgeHeight: 22,
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
      departureTime: { ...d.columns.departureTime, ...(s.columns?.departureTime || {}) },
      countdown: { ...d.columns.countdown, ...(s.columns?.countdown || {}) },
    },
    spacing: { ...d.spacing, ...(s.spacing || {}) },
    fontSize: { ...d.fontSize, ...(s.fontSize || {}) },
    badgeHeight: Number.isFinite(s.badgeHeight) ? s.badgeHeight : d.badgeHeight,
  };
}

function loadWidgetConfig() {
  const fm = FileManager.iCloud();
  const path = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);
  if (!fm.fileExists(path)) return mergeWidgetConfig(null);
  try {
    if (!fm.isFileDownloaded(path)) fm.downloadFileFromiCloud(path);
    return mergeWidgetConfig(JSON.parse(fm.readString(path)));
  } catch (_) {
    // A broken/missing personal config must never break the departures widget.
    return mergeWidgetConfig(null);
  }
}

const WIDGET_CONFIG = loadWidgetConfig();

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

function buildStopEventRequest(stopRef, key) {
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
    `          <NumberOfResults>${RESULTS_LIMIT}</NumberOfResults>`,
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
    if (stopRef && name) out.push({ stopRef, name });
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

async function fetchDepartures(stopRefs, key) {
  const all = [];
  const errors = [];
  await Promise.all(
    stopRefs.map(async (ref) => {
      try {
        const xml = await triasPost(buildStopEventRequest(ref, key));
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
    .slice(0, 5);
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

  if (columns.departureTime.visible) {
    addColumnSpacer(row, hasColumn);
    const column = row.addStack();
    column.size = new Size(Math.max(1, columns.departureTime.width), height);
    column.centerAlignContent();
    const clock = column.addText(fmtClock(r.at));
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

function buildWidget(title, subtitle, rows, cancelledN, errorText) {
  const c = palette();
  const w = new ListWidget();
  w.backgroundColor = new Color(c.bg);
  w.setPadding(13, 14, 10, 14);
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
  const stopRefs = hasLastStop ? [Keychain.get(LAST_STOP_REF_KEY)] : DEFAULT_STOPS;
  const title =
    hasLastStop && Keychain.contains(LAST_STOP_NAME_KEY)
      ? Keychain.get(LAST_STOP_NAME_KEY)
      : 'Brauerei Ganter';

  try {
    const events = await fetchDepartures(stopRefs, key);
    const rows = withDelay(events, Date.now());
    const sub = events.length
      ? `${events.length} Ereignisse gelesen`
      : 'API antwortete ohne Events';
    const w = buildWidget(title, rows.length ? null : sub, rows, cancelledCount(events, Date.now()), tapParameter);
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
  } catch (e) {
    const w = buildWidget(title, null, [], 0, e.message, tapParameter);
    if (present) w.presentMedium();
    else Script.setWidget(w);
    Script.complete();
  }
}

async function showLocationDiagnostics(lines, errorText) {
  const alert = new Alert();
  alert.title = 'Location Diagnose';
  alert.message = lines.join('\n') + (errorText ? '\n\nFEHLER: ' + errorText : '');
  alert.addAction('OK');
  await alert.present();
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
    await showLocationDiagnostics(diagnostics, e.message);
    const w = buildWidget('Nähe', null, [], 0, 'Ortsuche fehlgeschlagen: ' + e.message);
    w.presentMedium();
    Script.complete();
    return;
  }

  if (!stops.length) {
    await showLocationDiagnostics(diagnostics, 'TRIAS lieferte keine auswertbaren Haltestellen.');
    const w = buildWidget('Nähe', null, [], 0, 'Keine Haltestellen gefunden');
    w.presentMedium();
    Script.complete();
    return;
  }

  diagnostics.push('6. Auswahl wird geöffnet ✓');
  const picker = new Alert();
  picker.title = 'Haltestelle wählen';
  picker.message = 'GPS ±100 m';
  for (const s of stops) picker.addAction(s.name);
  picker.addCancelAction('Abbrechen');
  const idx = await picker.present();
  if (idx === -1) {
    Script.complete();
    return;
  }

  const chosen = stops[idx];
  Keychain.set(LAST_STOP_REF_KEY, chosen.stopRef);
  Keychain.set(LAST_STOP_NAME_KEY, chosen.name);
  try {
    let events;
    try {
      events = await fetchDepartures([chosen.stopRef], key);
    } catch (e) {
      const parent = chosen.stopRef.replace(/:\d+$/, '');
      events = await fetchDepartures([parent], key);
    }
    const rows = withDelay(events, Date.now());
    const w = buildWidget(
      chosen.name,
      `${fmtClock(Date.now())} · GPS`,
      rows,
      cancelledCount(events, Date.now()),
    );
    w.presentMedium();
    Script.setWidget(w);
    Script.complete();
  } catch (e) {
    const w = buildWidget(chosen.name, null, [], 0, e.message);
    w.presentMedium();
    Script.complete();
  }
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
  const present = !config.runsInWidget;
  const parameter = rawParameter();
  const wantsSetup = parameter.toLowerCase() === 'setup';
  const hasKeyInKeychain =
    Keychain.contains('TRIAS_REQUESTOR_REF') &&
    Keychain.get('TRIAS_REQUESTOR_REF').trim() !== '';

  if (wantsSetup) {
    await setupMode();
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

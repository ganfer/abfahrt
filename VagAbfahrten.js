// Variables used by Scriptable: icon-color: red; icon-glyph: train;
//
// VAG departures widget (EFA-BW TRIAS) — "VagAbfahrten"
//
// Setup:
//   1. Copy this file into Scriptable.
//   2. Add a Scriptable widget on the Home Screen, pick this script.
//   3. In the widget settings, set the parameter to your TRIAS requestor key:
//        <key>            → always shows Brauerei Ganter (both platforms)
//        <key>|nearby     → tapping the widget opens Scriptable, refreshes
//                           via GPS: nearest tram stops, pick one, departures
//   The key stays on the device (widget parameters are not synced via iCloud).
//
// Tapping the widget always opens Scriptable briefly (iOS limitation: widget
// taps open a URL, not an in-widget refresh). The script then refreshes the
// widget with fresh data — including GPS when "nearby" is set.

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
    events.push({
      stopRef,
      plannedTime: Date.parse(planned),
      realtimeTime: estimated ? Date.parse(estimated) : null,
      cancelled,
      line: text(service, 'PublishedLineName', 'Text') || text(service, 'PublishedLineName'),
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
  return out;
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
      const delayMin = e.realtimeTime
        ? Math.max(0, Math.round((e.realtimeTime - e.plannedTime) / 60000))
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

function buildWidget(title, subtitle, rows, cancelledN, errorText, tapParameter) {
  const c = palette();
  const w = new ListWidget();
  w.backgroundColor = new Color(c.bg);
  const header = w.addStack();
  header.layoutHorizontally();
  const titleEl = header.addText(title);
  titleEl.font = Font.boldSystemFont(15);
  titleEl.textColor = new Color(c.fg);
  if (subtitle) {
    const sub = w.addText(subtitle);
    sub.font = Font.mediumSystemFont(11);
    sub.textColor = new Color(c.dim);
  }
  w.addSpacer(4);
  if (errorText) {
    const err = w.addText(errorText);
    err.font = Font.systemFont(11);
    err.textColor = new Color(c.late);
  } else if (!rows.length) {
    const none = w.addText('Keine Abfahrten');
    none.font = Font.systemFont(12);
    none.textColor = new Color(c.dim);
  } else {
    for (const r of rows) {
      const rowStack = w.addStack();
      rowStack.layoutHorizontally();
      rowStack.addSpacer(0);
      let left;
      let leftColor;
      if (r.cancelled) {
        left = `${r.destination} ${fmtClock(r.plannedTime)} · entfällt`;
      } else {
        left = `${r.destination} ${fmtClock(r.plannedTime)}`;
        if (r.delayMin) left += ` +${r.delayMin}`;
      }
      if (r.cancelled) leftColor = c.dim;
      else if (r.delayMin >= DELAY_HEAVY_MIN) leftColor = c.late;
      else if (r.delayMin > 0) leftColor = c.delay;
      else leftColor = c.fg;
      const line = rowStack.addText(left);
      line.font = Font.systemFont(12);
      line.lineLimit = 1;
      line.textColor = new Color(leftColor);
      if (r.cancelled) line.textOpacity = 0.7;
      let right;
      if (r.cancelled) right = 'entfällt';
      else {
        const minutes = Math.floor((r.at - Date.now()) / 60000);
        right = minutes <= 0 ? 'jetzt' : `${minutes} min`;
      }
      const rightEl = rowStack.addText(right);
      rightEl.font = Font.systemFont(12);
      if (r.cancelled) rightEl.textColor = new Color(c.dim);
      else if (r.delayMin >= DELAY_HEAVY_MIN) rightEl.textColor = new Color(c.late);
      else if (r.delayMin > 0) rightEl.textColor = new Color(c.delay);
      else rightEl.textColor = new Color(c.ok);
      rowStack.addSpacer();
    }
  }
  w.addSpacer();
  const footerText = errorText
    ? `Fehler · ${fmtClock(Date.now())}`
    : `TRIAS · ${fmtClock(Date.now())}` + (cancelledN ? ` · ${cancelledN} entfällt` : '');
  const foot = w.addText(footerText);
  foot.font = Font.systemFont(9);
  foot.textColor = new Color(errorText ? c.late : c.dim);
  // The departures widget has one reliable action: refresh the saved stop.
  w.url = `${URLScheme.forRunningScript()}&action=refresh`;
  return w;
}

function buildLocationWidget() {
  const c = palette();
  const w = new ListWidget();
  w.backgroundColor = new Color(c.bg);
  w.url = `${URLScheme.forRunningScript()}&action=location`;

  w.addSpacer();
  const icon = w.addText('⌖');
  icon.font = Font.boldSystemFont(30);
  icon.textColor = new Color(c.fg);
  icon.centerAlignText();

  const title = w.addText('Haltestelle');
  title.font = Font.boldSystemFont(13);
  title.textColor = new Color(c.fg);
  title.centerAlignText();

  const sub = w.addText('ändern');
  sub.font = Font.systemFont(11);
  sub.textColor = new Color(c.dim);
  sub.centerAlignText();
  w.addSpacer();
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
  const action = String(args.queryParameters?.action || '').trim().toLowerCase();
  const wantsSetup = parameter.toLowerCase() === 'setup';
  const wantsLocationWidget = parameter.toLowerCase() === 'location';
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

  if (!present && wantsLocationWidget) {
    Script.setWidget(buildLocationWidget());
    Script.complete();
    return;
  }

  if (present && (action === 'location' || wantsLocationWidget)) {
    await nearbyFlow(key);
    return;
  }

  // Widget refreshes and normal taps use the last saved stop. This deliberately
  // avoids GPS and the stop picker. If no stop was selected yet, the existing
  // Brauerei Ganter fallback is used.
  await defaultWidget(key, present, parameter);
}
await main();

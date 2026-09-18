// Variables used by Scriptable: icon-color: purple; icon-glyph: sliders-h;
//
// Interactive configuration assistant for VagAbfahrten.

const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';
const SAVED_STOPS_KEY = 'VAG_SAVED_STOPS';
const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';
const DEFAULTS = {
  rows: 5,
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
  fullscreen: {
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
  },
};

const fm = FileManager.iCloud();
const configPath = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadConfig() {
  if (!fm.fileExists(configPath)) return clone(DEFAULTS);
  try {
    if (!fm.isFileDownloaded(configPath)) fm.downloadFileFromiCloud(configPath);
    const saved = JSON.parse(fm.readString(configPath));
    return {
      ...clone(DEFAULTS),
      ...saved,
      columns: {
        line: { ...DEFAULTS.columns.line, ...(saved.columns?.line || {}) },
        destination: { ...DEFAULTS.columns.destination, ...(saved.columns?.destination || {}) },
        platform: { ...DEFAULTS.columns.platform, ...(saved.columns?.platform || {}) },
        departureTime: { ...DEFAULTS.columns.departureTime, ...(saved.columns?.departureTime || {}) },
        countdown: { ...DEFAULTS.columns.countdown, ...(saved.columns?.countdown || {}) },
      },
      spacing: { ...DEFAULTS.spacing, ...(saved.spacing || {}) },
      fontSize: { ...DEFAULTS.fontSize, ...(saved.fontSize || {}) },
      fullscreen: {
        ...DEFAULTS.fullscreen,
        ...(saved.fullscreen || {}),
        columns: {
          line: { ...DEFAULTS.fullscreen.columns.line, ...(saved.fullscreen?.columns?.line || {}) },
          destination: { ...DEFAULTS.fullscreen.columns.destination, ...(saved.fullscreen?.columns?.destination || {}) },
          platform: { ...DEFAULTS.fullscreen.columns.platform, ...(saved.fullscreen?.columns?.platform || {}) },
          departureTime: { ...DEFAULTS.fullscreen.columns.departureTime, ...(saved.fullscreen?.columns?.departureTime || {}) },
          countdown: { ...DEFAULTS.fullscreen.columns.countdown, ...(saved.fullscreen?.columns?.countdown || {}) },
        },
        location: { ...DEFAULTS.fullscreen.location, ...(saved.fullscreen?.location || {}) },
      },
    };
  } catch (_) {
    return clone(DEFAULTS);
  }
}

async function notice(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.present();
}

async function askNumber(title, message, value, min, max) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addTextField(String(value), String(value));
  a.addAction('Übernehmen');
  a.addCancelAction('Abbrechen');
  const choice = await a.present();
  if (choice === -1) return value;
  const parsed = Number(a.textFieldValue(0).trim());
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    await notice('Ungültiger Wert', `Bitte einen Wert zwischen ${min} und ${max} eingeben.`);
    return askNumber(title, message, value, min, max);
  }
  return parsed;
}

async function configureColumn(cfg, key, label) {
  const col = cfg.columns[key];
  const a = new Alert();
  a.title = label;
  a.message = `Aktuell: ${col.visible ? 'sichtbar' : 'ausgeblendet'} · Breite ${col.width}`;
  a.addAction(col.visible ? 'Spalte ausblenden' : 'Spalte einblenden');
  a.addAction('Breite ändern');
  a.addCancelAction('Zurück');
  const choice = await a.present();
  if (choice === 0) col.visible = !col.visible;
  if (choice === 1) col.width = await askNumber(label + ' – Breite', 'Breite der Spalte in Punkten.', col.width, 20, 220);
}


function savedStops() {
  try {
    return Keychain.contains(SAVED_STOPS_KEY) ? JSON.parse(Keychain.get(SAVED_STOPS_KEY)) : [];
  } catch (_) {
    return [];
  }
}

function writeSavedStops(stops) {
  // Keep every pinned stop. The 20-entry cap applies only to the rolling
  // history of unpinned stops.
  const pinned = stops.filter((s) => s.pinned === true);
  const recent = stops.filter((s) => s.pinned !== true).slice(0, 20);
  Keychain.set(SAVED_STOPS_KEY, JSON.stringify([...pinned, ...recent]));
}

function normalizeStopName(name) {
  return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

function rememberStop(stop) {
  const list = savedStops();
  const normalized = normalizeStopName(stop.name);
  const filtered = list.filter((s) => s.stopRef !== stop.stopRef && normalizeStopName(s.name) !== normalized);
  const existing = list.find((s) => s.stopRef === stop.stopRef || normalizeStopName(s.name) === normalized);
  filtered.unshift({ stopRef: stop.stopRef, name: stop.name, pinned: existing?.pinned === true });
  writeSavedStops(filtered);
}

function xmlEsc(v) {
  return String(v).replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[ch]));
}

function parseXml(raw) {
  const root = { name: '#document', textContent: '', children: [] };
  let current = root;
  const parser = new XMLParser(raw);
  parser.didStartElement = (name, attrs) => {
    const rawName = String(name);
    const node = { name: rawName.includes(':') ? rawName.split(':').pop() : rawName, attrs: attrs || {}, textContent: '', children: [], parent: current };
    current.children.push(node);
    current = node;
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

async function searchStops(query) {
  if (!Keychain.contains('TRIAS_REQUESTOR_REF')) throw new Error('Kein TRIAS-Key im Keychain.');
  const key = Keychain.get('TRIAS_REQUESTOR_REF').trim();
  const ts = new Date().toISOString();
  // LocationName in InitialInput is a plain string in the TRIAS 1.2
  // LocationInformationRequest. LocationName/Text belongs to returned
  // LocationRef structures, not to InitialInput.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<Trias version="1.2" language="de" xmlns="http://www.vdv.de/trias" xmlns:siri="http://www.siri.org.uk/siri">
<ServiceRequest><siri:RequestTimestamp>${ts}</siri:RequestTimestamp><siri:RequestorRef>${xmlEsc(key)}</siri:RequestorRef>
<RequestPayload><LocationInformationRequest><InitialInput><LocationName>${xmlEsc(query)}</LocationName></InitialInput>
<Restrictions><Type>stop</Type><NumberOfResults>20</NumberOfResults></Restrictions>
</LocationInformationRequest></RequestPayload></ServiceRequest></Trias>`;
  const req = new Request(TRIAS_ENDPOINT);
  req.method = 'POST';
  req.headers = { 'Content-Type': 'text/xml; charset=utf-8', Accept: 'text/xml' };
  req.body = body;
  req.timeoutInterval = 12;
  const raw = await req.loadString();
  if ((req.response?.statusCode || 200) >= 400) throw new Error('TRIAS HTTP ' + req.response.statusCode);
  const doc = parseXml(raw);
  const response =
    child(doc, 'Trias', 'ServiceDelivery', 'DeliveryPayload', 'LocationInformationResponse') ||
    child(doc, 'Trias', 'LocationInformationResponse') ||
    child(doc, 'ServiceDelivery', 'DeliveryPayload', 'LocationInformationResponse') ||
    child(doc, 'LocationInformationResponse');
  const found = [];
  for (const result of children(response, 'LocationResult')) {
    const stopRef =
      text(result, 'Location', 'StopPlace', 'StopPlaceRef') ||
      text(result, 'Location', 'StopPoint', 'StopPointRef') ||
      text(result, 'StopPoint', 'StopPointRef') ||
      text(result, 'Location', 'StopPointRef') ||
      text(result, 'StopPointRef');
    const name =
      text(result, 'Location', 'StopPlace', 'StopPlaceName', 'Text') ||
      text(result, 'Location', 'StopPlace', 'StopPlaceName') ||
      text(result, 'Location', 'StopPoint', 'StopPointName', 'Text') ||
      text(result, 'Location', 'StopPoint', 'StopPointName') ||
      text(result, 'Location', 'LocationName', 'Text') ||
      text(result, 'Location', 'LocationName') ||
      text(result, 'StopPoint', 'StopPointName', 'Text') ||
      text(result, 'StopPoint', 'StopPointName') ||
      text(result, 'LocationName', 'Text') ||
      text(result, 'LocationName');
    if (stopRef && name && !found.some((s) => s.stopRef === stopRef || normalizeStopName(s.name) === normalizeStopName(name))) {
      found.push({ stopRef, name });
    }
  }
  return found;
}

async function addSavedStop() {
  const a = new Alert();
  a.title = 'Haltestelle hinzufügen';
  a.message = 'Suche nach Haltestellenname, z. B. „Freiburg Hauptbahnhof“.';
  a.addTextField('Haltestelle', '');
  a.addAction('Suchen');
  a.addCancelAction('Abbrechen');
  if (await a.present() === -1) return;
  const query = a.textFieldValue(0).trim();
  if (!query) return;
  try {
    const results = await searchStops(query);
    if (!results.length) {
      await notice('Keine Treffer', 'Für diese Suche wurden keine Haltestellen gefunden.');
      return;
    }
    const picker = new Alert();
    picker.title = 'Haltestelle speichern';
    picker.message = `${results.length} Treffer für „${query}“`;
    for (const stop of results) picker.addAction(stop.name);
    picker.addCancelAction('Abbrechen');
    const choice = await picker.present();
    if (choice === -1) return;
    rememberStop(results[choice]);
    await notice('Gespeichert', results[choice].name + ' wurde als bekannte Haltestelle gespeichert.');
  } catch (e) {
    await notice('Suche fehlgeschlagen', e.message);
  }
}

async function manageSavedStops() {
  while (true) {
    const stops = savedStops();
    const a = new Alert();
    a.title = 'Gespeicherte Haltestellen';
    const pinnedCount = stops.filter((s) => s.pinned === true).length;
    const recentCount = stops.length - pinnedCount;
    a.message = stops.length
      ? `${pinnedCount} fixiert · ${recentCount} von maximal 20 automatisch verwaltet.`
      : 'Noch keine Haltestellen gespeichert.';
    a.addAction('Haltestelle hinzufügen');
    for (const stop of stops) a.addAction((stop.pinned === true ? '📌 ' : '') + stop.name);
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) {
      await addSavedStop();
      continue;
    }
    const index = choice - 1;
    const stop = stops[index];
    const detail = new Alert();
    detail.title = stop.name;
    detail.message = stop.stopRef + '\n\n' + (stop.pinned === true ? 'Diese Haltestelle ist fixiert.' : 'Diese Haltestelle gehört zur automatisch verwalteten Historie.');
    detail.addAction(stop.pinned === true ? 'Fixierung lösen' : '📌 Fixieren');
    detail.addDestructiveAction('Löschen');
    detail.addCancelAction('Zurück');
    const action = await detail.present();
    if (action === 0) {
      stops[index] = { ...stop, pinned: stop.pinned !== true };
      writeSavedStops(stops);
      await notice(stops[index].pinned ? 'Fixiert' : 'Fixierung gelöst', stop.name);
    }
    if (action === 1) {
      stops.splice(index, 1);
      writeSavedStops(stops);
      await notice('Gelöscht', stop.name + ' wurde aus den gespeicherten Haltestellen entfernt.');
    }
  }
}

async function configureFullscreen(cfg) {
  const labels = {
    line: 'Linie',
    destination: 'Richtung',
    platform: 'Gleis',
    departureTime: 'Abfahrtszeit',
    countdown: 'Restzeit',
  };

  while (true) {
    const a = new Alert();
    a.title = 'Fullscreen konfigurieren';
    a.message = `${cfg.fullscreen.rows} Abfahrten · Schrift ${cfg.fullscreen.fontSize} pt\n` +
      Object.keys(labels).map((key) =>
        `${labels[key]}: ${cfg.fullscreen.columns[key].visible ? cfg.fullscreen.columns[key].width + ' px' : 'aus'}`
      ).join('\n');
    a.addAction('Anzahl Abfahrten');
    a.addAction('Linie');
    a.addAction('Richtung');
    a.addAction('Gleis');
    a.addAction('Abfahrtszeit');
    a.addAction('Restzeit');
    a.addAction('Schriftgröße');
    a.addAction(`Standort beim Öffnen: ${cfg.fullscreen.location.autoRefreshOnOpen ? 'AN' : 'AUS'}`);
    a.addAction(`Gespeicherte Haltestelle automatisch: ${cfg.fullscreen.location.autoSelectSavedStop ? 'AN' : 'AUS'}`);
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) cfg.fullscreen.rows = await askNumber('Fullscreen – Abfahrten', 'Wie viele Abfahrten sollen angezeigt werden?', cfg.fullscreen.rows, 1, 30);
    if (choice >= 1 && choice <= 5) {
      const key = ['line', 'destination', 'platform', 'departureTime', 'countdown'][choice - 1];
      const col = cfg.fullscreen.columns[key];
      const b = new Alert();
      b.title = labels[key];
      b.message = `Aktuell: ${col.visible ? 'sichtbar' : 'ausgeblendet'} · Breite ${col.width} px`;
      b.addAction(col.visible ? 'Spalte ausblenden' : 'Spalte einblenden');
      b.addAction('Breite ändern');
      b.addCancelAction('Zurück');
      const sub = await b.present();
      if (sub === 0) col.visible = !col.visible;
      if (sub === 1) col.width = await askNumber(labels[key] + ' – Breite', 'Breite in Pixeln für die Fullscreen-Tabelle.', col.width, 40, 400);
    }
    if (choice === 6) cfg.fullscreen.fontSize = await askNumber('Fullscreen – Schriftgröße', 'Schriftgröße der Tabellenwerte.', cfg.fullscreen.fontSize, 10, 28);
    if (choice === 7) cfg.fullscreen.location.autoRefreshOnOpen = !cfg.fullscreen.location.autoRefreshOnOpen;
    if (choice === 8) cfg.fullscreen.location.autoSelectSavedStop = !cfg.fullscreen.location.autoSelectSavedStop;
  }
}

function summary(cfg) {
  const names = {
    line: 'Linie',
    destination: 'Richtung',
    platform: 'Gleis',
    departureTime: 'Abfahrt',
    countdown: 'Restzeit',
  };
  const columns = Object.keys(names)
    .map((key) => `${names[key]}: ${cfg.columns[key].visible ? cfg.columns[key].width + ' pt' : 'aus'}`)
    .join('\n');
  return `${cfg.rows} Widget-Abfahrten\n\n${columns}\n\nSpaltenabstand: ${cfg.spacing.columns} pt\nZeilenabstand: ${cfg.spacing.rows} pt\n\nFullscreen: ${cfg.fullscreen.rows} Abfahrten · ${cfg.fullscreen.fontSize} pt`;
}

async function save(cfg) {
  fm.writeString(configPath, JSON.stringify(cfg, null, 2));
  await notice('Gespeichert', 'Die persönliche Widget-Konfiguration wurde gespeichert. Das Home-Screen-Widget verwendet sie beim nächsten Refresh.');
}

async function reset() {
  if (fm.fileExists(configPath)) fm.remove(configPath);
  await notice('Zurückgesetzt', 'Die persönliche Konfiguration wurde gelöscht. Das Widget verwendet wieder die Standardwerte.');
}

async function main() {
  const cfg = loadConfig();

  while (true) {
    const menu = new Alert();
    menu.title = 'VAG Widget konfigurieren';
    menu.message = summary(cfg);
    menu.addAction('Anzahl Abfahrten');
    menu.addAction('Linie');
    menu.addAction('Richtung');
    menu.addAction('Gleis');
    menu.addAction('Abfahrtszeit');
    menu.addAction('Restzeit');
    menu.addAction('Abstände');
    menu.addAction('Schriftgrößen');
    menu.addAction('Fullscreen-Ansicht');
    menu.addAction('Gespeicherte Haltestellen');
    menu.addAction('Speichern');
    menu.addDestructiveAction('Auf Standard zurücksetzen');
    menu.addCancelAction('Beenden');
    const choice = await menu.present();

    if (choice === -1) break;
    if (choice === 0) cfg.rows = await askNumber('Anzahl Abfahrten', 'Wie viele Abfahrten sollen angezeigt werden?', cfg.rows, 1, 8);
    if (choice === 1) await configureColumn(cfg, 'line', 'Linie');
    if (choice === 2) await configureColumn(cfg, 'destination', 'Richtung');
    if (choice === 3) await configureColumn(cfg, 'platform', 'Gleis');
    if (choice === 4) await configureColumn(cfg, 'departureTime', 'Abfahrtszeit');
    if (choice === 5) await configureColumn(cfg, 'countdown', 'Restzeit');
    if (choice === 6) {
      cfg.spacing.columns = await askNumber('Spaltenabstand', 'Abstand zwischen sichtbaren Spalten.', cfg.spacing.columns, 0, 20);
      cfg.spacing.rows = await askNumber('Zeilenabstand', 'Abstand zwischen den Abfahrten.', cfg.spacing.rows, 0, 12);
    }
    if (choice === 7) {
      cfg.fontSize.line = await askNumber('Linie – Schriftgröße', '', cfg.fontSize.line, 8, 18);
      cfg.fontSize.destination = await askNumber('Richtung – Schriftgröße', '', cfg.fontSize.destination, 8, 18);
      cfg.fontSize.platform = await askNumber('Gleis – Schriftgröße', '', cfg.fontSize.platform, 8, 18);
      cfg.fontSize.departureTime = await askNumber('Abfahrtszeit – Schriftgröße', '', cfg.fontSize.departureTime, 8, 18);
      cfg.fontSize.countdown = await askNumber('Restzeit – Schriftgröße', '', cfg.fontSize.countdown, 8, 18);
    }
    if (choice === 8) await configureFullscreen(cfg);
    if (choice === 9) await manageSavedStops();
    if (choice === 10) {
      await save(cfg);
      break;
    }
    if (choice === 11) {
      await reset();
      break;
    }
  }

  Script.complete();
}

await main();

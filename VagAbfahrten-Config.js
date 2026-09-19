// Variables used by Scriptable: icon-color: purple; icon-glyph: sliders-h;
//
// Interactive configuration assistant for VagAbfahrten.

const APP_VERSION = '1.0.4';
const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';
const SAVED_STOPS_KEY = 'VAG_SAVED_STOPS'; // legacy storage key; now contains pinned stops only
const RECENT_STOPS_KEY = 'VAG_RECENT_STOPS';
const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';
const DEFAULTS = {
  rows: 5,
  refreshAfterLocationChange: true,
  location: {
    autoSelectSavedStop: true,
    savedStopRadiusMeters: 200,
    fallbackMode: 'last',
  },
  updates: {
    channel: 'stable',
  },
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
  },
};

const fm = FileManager.iCloud();
const configPath = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadConfig() {
  if (!fm.fileExists(configPath)) return clone(DEFAULTS);
  try {
    if (!fm.isFileDownloaded(configPath)) await fm.downloadFileFromiCloud(configPath);
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
      refreshAfterLocationChange: typeof saved.refreshAfterLocationChange === 'boolean'
        ? saved.refreshAfterLocationChange
        : DEFAULTS.refreshAfterLocationChange,
      updates: { ...DEFAULTS.updates, ...(saved.updates || {}) },
      location: {
        ...DEFAULTS.location,
        ...(saved.fullscreen?.location || {}),
        ...(saved.location || {}),
        fallbackMode: saved.location?.fallbackMode ||
          (typeof saved.location?.fallbackToLastStop === 'boolean'
            ? (saved.location.fallbackToLastStop ? 'last' : 'none')
            : DEFAULTS.location.fallbackMode),
      },
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
  const pinned = stops.filter((s) => s.pinned === true);
  Keychain.set(SAVED_STOPS_KEY, JSON.stringify(pinned));
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

function pinStop(stop) {
  const list = savedStops().filter((s) => s.pinned === true);
  const normalized = normalizeStopName(stop.name);
  const existing = list.find((s) => s.stopRef === stop.stopRef || normalizeStopName(s.name) === normalized);
  const filtered = list.filter((s) => s.stopRef !== stop.stopRef && normalizeStopName(s.name) !== normalized);
  filtered.unshift({
    stopRef: stop.stopRef,
    name: stop.name,
    displayName: existing?.displayName || '',
    pinned: true,
    home: existing?.home === true,
  });
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

async function addPinnedStop() {
  const history = recentStops();
  const menu = new Alert();
  menu.title = 'Haltestelle fixieren';
  menu.message = history.length
    ? 'Wähle eine zuletzt verwendete Haltestelle oder suche nach einer anderen.'
    : 'Noch keine Historie vorhanden. Suche nach einer Haltestelle.';
  if (history.length) menu.addAction('Aus Historie wählen');
  menu.addAction('Haltestelle suchen');
  menu.addCancelAction('Abbrechen');
  const source = await menu.present();
  if (source === -1) return;

  if (history.length && source === 0) {
    const pinned = savedStops().filter((s) => s.pinned === true);
    const picker = new Alert();
    picker.title = 'Aus Historie fixieren';
    picker.message = 'Zuletzt verwendete Haltestellen · 📌 = bereits fixiert';
    for (const stop of history) {
      const isPinned = pinned.some((s) =>
        s.stopRef === stop.stopRef || normalizeStopName(s.name) === normalizeStopName(stop.name)
      );
      picker.addAction((isPinned ? '📌 ' : '') + stop.name);
    }
    picker.addCancelAction('Abbrechen');
    const choice = await picker.present();
    if (choice === -1) return;
    pinStop(history[choice]);
    await notice('Fixiert', history[choice].name + ' wurde fixiert.');
    return;
  }

  const a = new Alert();
  a.title = 'Haltestelle suchen';
  a.message = 'Suche nach einer Haltestelle, die dauerhaft fixiert werden soll.';
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
    const pinned = savedStops().filter((s) => s.pinned === true);
    const refs = new Set(pinned.map((s) => s.stopRef));
    const names = new Set(pinned.map((s) => normalizeStopName(s.name)));
    const picker = new Alert();
    picker.title = 'Haltestelle fixieren';
    picker.message = `${results.length} Treffer für „${query}“ · 📌 = bereits fixiert`;
    for (const stop of results) {
      const isPinned = refs.has(stop.stopRef) || names.has(normalizeStopName(stop.name));
      picker.addAction((isPinned ? '📌 ' : '') + stop.name);
    }
    picker.addCancelAction('Abbrechen');
    const choice = await picker.present();
    if (choice === -1) return;
    pinStop(results[choice]);
    await notice('Fixiert', results[choice].name + ' wurde fixiert.');
  } catch (e) {
    await notice('Suche fehlgeschlagen', e.message);
  }
}

async function managePinnedStops() {
  // One-time migration: discard old rolling-history entries and retain pins.
  const all = savedStops();
  if (all.some((s) => s.pinned !== true)) writeSavedStops(all);

  while (true) {
    const stops = savedStops().filter((s) => s.pinned === true);
    const a = new Alert();
    a.title = 'Fixierte Haltestellen';
    a.message = stops.length ? `${stops.length} Haltestelle(n) dauerhaft fixiert.` : 'Noch keine Haltestellen fixiert.';
    a.addAction('Haltestelle fixieren');
    const orderedStops = [...stops].sort((a, b) => Number(b.home === true) - Number(a.home === true));
    for (const stop of orderedStops) a.addAction((stop.home === true ? '🏠 ' : '📌 ') + (stop.displayName || stop.name));
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) {
      await addPinnedStop();
      continue;
    }
    const stop = orderedStops[choice - 1];
    const index = stops.findIndex((s) => s.stopRef === stop.stopRef);
    const detail = new Alert();
    detail.title = stop.displayName || stop.name;
    detail.message = (stop.displayName ? 'TRIAS: ' + stop.name + '\n' : '') + stop.stopRef;
    detail.addAction('Anzeigename ändern');
    detail.addAction(stop.home === true ? 'Home entfernen' : 'Als Home festlegen');
    detail.addDestructiveAction('Fixierung entfernen');
    detail.addCancelAction('Zurück');
    const action = await detail.present();
    if (action === 0) {
      const rename = new Alert();
      rename.title = 'Anzeigename ändern';
      rename.message = 'Der TRIAS-Name bleibt unverändert und wird weiterhin für die Zuordnung verwendet.';
      rename.addTextField('Anzeigename', stop.displayName || stop.name);
      rename.addAction('Übernehmen');
      rename.addAction('Eigenen Namen entfernen');
      rename.addCancelAction('Abbrechen');
      const renameAction = await rename.present();
      if (renameAction === 0) {
        const value = rename.textFieldValue(0).trim();
        stops[index] = { ...stop, displayName: value && value !== stop.name ? value : '' };
        writeSavedStops(stops);
        await notice('Anzeigename gespeichert', stops[index].displayName || stop.name);
      }
      if (renameAction === 1) {
        stops[index] = { ...stop, displayName: '' };
        writeSavedStops(stops);
        await notice('Anzeigename entfernt', stop.name);
      }
    }
    if (action === 1) {
      if (stop.home === true) {
        stops[index] = { ...stop, home: false };
        writeSavedStops(stops);
        await notice('Home entfernt', stop.displayName || stop.name);
      } else {
        const updated = stops.map((item, i) => ({ ...item, home: i === index }));
        writeSavedStops(updated);
        await notice('Home festgelegt', '🏠 Home ist jetzt ' + (stop.displayName || stop.name) + '.');
      }
    }
    if (action === 2) {
      stops.splice(index, 1);
      writeSavedStops(stops);
      await notice('Fixierung entfernt', stop.displayName || stop.name);
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
  }
}

async function configureWidget(cfg) {
  while (true) {
    const a = new Alert();
    a.title = 'Widget konfigurieren';
    a.message = `${cfg.rows} Abfahrten · kompakte Home-Screen-Ansicht`;
    a.addAction('Anzahl Abfahrten');
    a.addAction('Linie');
    a.addAction('Richtung');
    a.addAction('Gleis');
    a.addAction('Abfahrtszeit');
    a.addAction('Restzeit');
    a.addAction('Abstände');
    a.addAction('Schriftgrößen');
    a.addAction(`Widget nach Standortwechsel aktualisieren: ${cfg.refreshAfterLocationChange ? 'AN' : 'AUS'}`);
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
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
    if (choice === 8) cfg.refreshAfterLocationChange = !cfg.refreshAfterLocationChange;
  }
}

async function configureLocation(cfg) {
  while (true) {
    const fallbackLabels = { last: 'Letzte Haltestelle', home: '🏠 Home', none: 'Kein Fallback' };
    const fallback = fallbackLabels[cfg.location.fallbackMode] || fallbackLabels.last;
    const a = new Alert();
    a.title = 'Standort konfigurieren';
    a.message = `Automatische Auswahl: ${cfg.location.autoSelectSavedStop ? 'AN' : 'AUS'}\nEntfernung: ${cfg.location.savedStopRadiusMeters} m\nFallback: ${fallback}`;
    a.addAction(`Fixierte Haltestelle automatisch: ${cfg.location.autoSelectSavedStop ? 'AN' : 'AUS'}`);
    if (cfg.location.autoSelectSavedStop) a.addAction(`Entfernung: ${cfg.location.savedStopRadiusMeters} m`);
    a.addAction('Fallback: ' + fallback);
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) cfg.location.autoSelectSavedStop = !cfg.location.autoSelectSavedStop;
    if (cfg.location.autoSelectSavedStop && choice === 1) cfg.location.savedStopRadiusMeters = await askNumber(
      'Automatische Haltestelle – Entfernung',
      'Maximale Entfernung in Metern, in der eine fixierte Haltestelle automatisch übernommen wird.',
      cfg.location.savedStopRadiusMeters,
      25,
      5000,
    );
    const fallbackChoice = cfg.location.autoSelectSavedStop ? 2 : 1;
    if (choice === fallbackChoice) {
      const b = new Alert();
      b.title = 'Fallback bei Standortfehler';
      b.message = 'Home fällt automatisch auf die zuletzt verwendete Haltestelle zurück, falls kein Home festgelegt ist.';
      b.addAction('Letzte Haltestelle');
      b.addAction('🏠 Home');
      b.addAction('Kein Fallback');
      b.addCancelAction('Abbrechen');
      const selected = await b.present();
      if (selected === 0) cfg.location.fallbackMode = 'last';
      if (selected === 1) cfg.location.fallbackMode = 'home';
      if (selected === 2) cfg.location.fallbackMode = 'none';
    }
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


const RELEASE_API_URL = 'https://api.github.com/repos/ganfer/vag-widget/releases/latest';
const RELEASE_RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/vag-widget/';
const MAIN_COMMIT_API_URL = 'https://api.github.com/repos/ganfer/vag-widget/commits/main';
const UPDATE_FILES = [
  {
    name: 'VagAbfahrten.js',
    markers: ["const APP_VERSION = '", "const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';", 'await main();'],
  },
  {
    name: 'VagAbfahrten-Config.js',
    markers: ["const APP_VERSION = '", "const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';", 'await main();'],
  },
];

function updateTargets(fileName) {
  const cloud = FileManager.iCloud();
  const local = FileManager.local();
  const targets = [{ label: 'iCloud', fm: cloud }];
  const localPath = local.joinPath(local.documentsDirectory(), fileName);
  if (local.fileExists(localPath)) targets.push({ label: 'Lokal', fm: local });
  return targets;
}

function versionFromSource(source) {
  const match = source.match(/const APP_VERSION = ['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const left = String(a || '').split('.').map((v) => Number(v) || 0);
  const right = String(b || '').split('.').map((v) => Number(v) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function latestRelease() {
  const req = new Request(RELEASE_API_URL + '?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' };
  const release = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error(`GitHub Releases HTTP ${status || '?'}`);
  const tag = String(release?.tag_name || '');
  const match = tag.match(/^v(\d+\.\d+\.\d+)$/);
  if (!match) throw new Error('Das neueste GitHub Release hat keine gültige vX.Y.Z-Version.');
  return { version: match[1], tag };
}

async function latestDevelopment() {
  const req = new Request(MAIN_COMMIT_API_URL + '?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' };
  const commit = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200 || !/^[0-9a-f]{40}$/i.test(String(commit?.sha || ''))) throw new Error(`GitHub main commit konnte nicht ermittelt werden (HTTP ${status || '?'}).`);
  return { ref: commit.sha, label: commit.sha.slice(0, 7) };
}

async function downloadUpdateFile(file, releaseTag) {
  const req = new Request(RELEASE_RAW_BASE_URL + encodeURIComponent(releaseTag) + '/' + file.name + '?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'text/plain', 'Cache-Control': 'no-cache' };
  const source = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error(`${file.name}: GitHub HTTP ${status || '?'}`);
  if (!source.trim() || !file.markers.every((marker) => source.includes(marker))) {
    throw new Error(`${file.name}: Download konnte nicht validiert werden.`);
  }
  return source;
}

async function configureUpdateChannel(cfg) {
  const a = new Alert();
  a.title = 'Update-Kanal';
  a.message = cfg.updates.channel === 'development'
    ? 'Aktuell: 🧪 Development\nNeuester Stand von main. Kann instabil sein.'
    : 'Aktuell: 🛡 Stable\nNur veröffentlichte GitHub Releases.';
  a.addAction('🛡 Stable' + (cfg.updates.channel === 'stable' ? ' ✓' : ''));
  a.addAction('🧪 Development' + (cfg.updates.channel === 'development' ? ' ✓' : ''));
  a.addCancelAction('Zurück');
  const choice = await a.present();
  if (choice === 0) cfg.updates.channel = 'stable';
  if (choice === 1) cfg.updates.channel = 'development';
}

async function updateScripts(cfg) {
  const development = cfg.updates.channel === 'development';
  let source;
  try {
    source = development ? await latestDevelopment() : await latestRelease();
  } catch (e) {
    await notice('Update-Prüfung fehlgeschlagen', (development ? 'Der aktuelle Development-Stand' : 'Das neueste GitHub Release') + ' konnte nicht ermittelt werden.\n\n' + e.message);
    return;
  }
  const remoteVersion = development ? null : source.version;
  if (!development && compareVersions(remoteVersion, APP_VERSION) <= 0) {
    await notice('Kein Update verfügbar', `Installiert: v${APP_VERSION}\nVerfügbar: v${remoteVersion}\nKanal: 🛡 Stable\n\nDu verwendest bereits die aktuelle Stable-Version.`);
    return;
  }
  const confirm = new Alert();
  confirm.title = development ? `Development ${source.label} installieren` : `Update v${remoteVersion} verfügbar`;
  confirm.message = development
    ? `Installiert: v${APP_VERSION}\nKanal: 🧪 Development\nCommit: ${source.label}\n\nWidget und Config werden exakt aus diesem main-Commit installiert. Development kann instabil sein.`
    : `Installiert: v${APP_VERSION}\nVerfügbar: v${remoteVersion}\n\nWidget und Config werden aus dem veröffentlichten GitHub Release ${source.tag} aktualisiert.`;
  confirm.addAction(development ? 'Development installieren' : 'Update installieren');
  confirm.addCancelAction('Abbrechen');
  if (await confirm.present() === -1) return;
  try {
    const ref = development ? source.ref : source.tag;
    const downloads = [];
    for (const file of UPDATE_FILES) downloads.push({ file, source: await downloadUpdateFile(file, ref) });
    const downloadedVersions = downloads.map((item) => versionFromSource(item.source)).filter(Boolean);
    if (!downloadedVersions.length || downloadedVersions.some((version) => version !== downloadedVersions[0])) throw new Error('Die heruntergeladenen Skripte haben unterschiedliche Versionsstände.');
    if (!development && downloadedVersions[0] !== remoteVersion) throw new Error('Die Release-Dateien passen nicht zur veröffentlichten Version.');
    const written = [];
    for (const item of downloads) {
      for (const target of updateTargets(item.file.name)) {
        const path = target.fm.joinPath(target.fm.documentsDirectory(), item.file.name);
        target.fm.writeString(path, item.source);
        written.push(`• ${item.file.name} [${target.label}]`);
      }
    }
    await notice('Update abgeschlossen', `${development ? `Development ${source.label}` : `Version v${remoteVersion}`} installiert.\n\n` + written.join('\n') + '\n\nConfig-Datei und fixierte Haltestellen wurden nicht verändert.');
  } catch (e) {
    await notice('Update fehlgeschlagen', 'Es wurden keine Skripte ersetzt.\n\n' + e.message);
  }
}

async function configureUpdates(cfg) {
  while (true) {
    const a = new Alert();
    a.title = 'Updates';
    a.message = `Installiert: v${APP_VERSION}\nKanal: ${cfg.updates.channel === 'development' ? '🧪 Development' : '🛡 Stable'}`;
    a.addAction('Update-Kanal');
    a.addAction('Auf Updates prüfen');
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) await configureUpdateChannel(cfg);
    if (choice === 1) {
      await save(cfg);
      await updateScripts(cfg);
      return;
    }
  }
}

async function main() {
  const cfg = await loadConfig();

  while (true) {
    const stops = savedStops();
    const pinned = stops.filter((s) => s.pinned === true).length;
    const menu = new Alert();
    menu.title = `VAG Widget · v${APP_VERSION}`;
    menu.message = `Widget: ${cfg.rows} Abfahrten\nFullscreen: ${cfg.fullscreen.rows} Abfahrten\nFixierte Haltestellen: ${pinned}`;
    menu.addAction('Widget');
    menu.addAction('Fullscreen');
    menu.addAction('Standort');
    menu.addAction('Fixierte Haltestellen');
    menu.addAction('Updates');
    menu.addAction('Speichern');
    menu.addDestructiveAction('Auf Standard zurücksetzen');
    menu.addCancelAction('Beenden');
    const choice = await menu.present();

    if (choice === -1) break;
    if (choice === 0) await configureWidget(cfg);
    if (choice === 1) await configureFullscreen(cfg);
    if (choice === 2) await configureLocation(cfg);
    if (choice === 3) await managePinnedStops();
    if (choice === 4) await configureUpdates(cfg);
    if (choice === 5) {
      await save(cfg);
      break;
    }
    if (choice === 6) {
      await reset();
      break;
    }
  }

  Script.complete();
}
await main();

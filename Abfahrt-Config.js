// Variables used by Scriptable: icon-color: purple; icon-glyph: sliders-h;
//
// Interactive configuration assistant for Abfahrt.

const APP_VERSION = '2.0.0';
const CONFIG_FILE_NAME = 'Abfahrt.config.json';
const SAVED_STOPS_KEY = 'ABFAHRT_SAVED_STOPS'; // contains pinned stops
const RECENT_STOPS_KEY = 'ABFAHRT_RECENT_STOPS';
const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';
const GTFS_RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/abfahrt/gtfs-data/data/gtfs/';
const GTFS_CACHE_DIR = 'Abfahrt-GTFS';
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
  filters: { widget: true, fullscreen: true },
  offline: { enabled: true, pinned: true, history: true, autoUpdate: true },
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
    destinationWrap: true,
    destinationLines: 2,
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
      filters: { ...DEFAULTS.filters, ...(saved.filters || {}) },
      offline: { ...DEFAULTS.offline, ...(saved.offline || {}) },
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
    role: existing?.role || (existing?.home === true ? 'home' : 'favorite'),
    roleIcon: existing?.roleIcon || '', roleLabel: existing?.roleLabel || '',
    stopRefs: Array.isArray(existing?.stopRefs) ? existing.stopRefs : [stop.stopRef],
    filter: existing?.filter || { enabled: false, mode: 'whitelist', lines: [], destinations: [] },
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
  if (!Keychain.contains('ABFAHRT_TRIAS_REQUESTOR_REF')) throw new Error('Kein TRIAS-Key im Keychain.');
  const key = Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF').trim();
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
  menu.title = 'Haltestelle anpinnen';
  menu.message = history.length
    ? 'Wähle eine zuletzt verwendete Haltestelle oder suche nach einer anderen.'
    : 'Noch keine zuletzt verwendeten Haltestellen vorhanden. Suche nach einer Haltestelle.';
  if (history.length) menu.addAction('Aus zuletzt verwendeten wählen');
  menu.addAction('Haltestelle suchen');
  menu.addCancelAction('Abbrechen');
  const source = await menu.present();
  if (source === -1) return;

  if (history.length && source === 0) {
    const pinned = savedStops().filter((s) => s.pinned === true);
    const picker = new Alert();
    picker.title = 'Zuletzt verwendete anpinnen';
    picker.message = 'Zuletzt verwendete Haltestellen · 📌 = bereits angepinnt';
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
    await notice('Angepinnt', history[choice].name + ' wurde angepinnt.');
    return;
  }

  const a = new Alert();
  a.title = 'Haltestelle suchen';
  a.message = 'Suche nach einer Haltestelle, die dauerhaft angepinnt werden soll.';
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
    picker.title = 'Haltestelle anpinnen';
    picker.message = `${results.length} Treffer für „${query}“ · 📌 = bereits angepinnt`;
    for (const stop of results) {
      const isPinned = refs.has(stop.stopRef) || names.has(normalizeStopName(stop.name));
      picker.addAction((isPinned ? '📌 ' : '') + stop.name);
    }
    picker.addCancelAction('Abbrechen');
    const choice = await picker.present();
    if (choice === -1) return;
    pinStop(results[choice]);
    await notice('Angepinnt', results[choice].name + ' wurde angepinnt.');
  } catch (e) {
    await notice('Suche fehlgeschlagen', e.message);
  }
}

const STOP_ROLES = [{key:'favorite',icon:'⭐️',label:'Favorit'},{key:'work',icon:'💼',label:'Arbeit'},{key:'love',icon:'❤️',label:'Love'},{key:'pub',icon:'🍺',label:'Kneipe'},{key:'transfer',icon:'🚉',label:'Umstieg'}];
function roleForStop(stop) { if (stop.home === true || stop.role === 'home') return {key:'home',icon:'🏠',label:'Home'}; if(stop.role==='custom') return {key:'custom',icon:stop.roleIcon||'📍',label:stop.roleLabel||'Eigene Rolle'}; return STOP_ROLES.find((r)=>r.key===stop.role)||{key:'favorite',icon:'⭐️',label:'Favorit'}; }
function stopMenuLabel(stop) { return roleForStop(stop).icon + ' ' + (stop.displayName || stop.name); }
async function configureStopRole(stops,index) { const stop=stops[index],a=new Alert(); a.title='Rolle · '+(stop.displayName||stop.name); a.addAction('🏠 Home'); for(const role of STOP_ROLES)a.addAction(role.icon+' '+role.label); a.addAction('Eigenes Emoji / Rolle'); a.addCancelAction('Zurück'); const x=await a.present(); if(x===-1)return; if(x===0){for(let i=0;i<stops.length;i++)stops[i]={...stops[i],home:i===index,role:i===index?'home':(stops[i].role==='home'?'favorite':stops[i].role)};} else if(x<=STOP_ROLES.length){stops[index]={...stop,home:false,role:STOP_ROLES[x-1].key,roleIcon:'',roleLabel:''};} else {const b=new Alert();b.title='Eigene Rolle';b.addTextField('Emoji',stop.roleIcon||'📍');b.addTextField('Bezeichnung',stop.roleLabel||'');b.addAction('Übernehmen');b.addCancelAction('Abbrechen');if(await b.present()===0)stops[index]={...stop,home:false,role:'custom',roleIcon:b.textFieldValue(0).trim()||'📍',roleLabel:b.textFieldValue(1).trim()||'Eigene Rolle'};} writeSavedStops(stops); }
async function configureStopGroup(stops,index) { const stop=stops[index],refs=[...new Set([stop.stopRef,...(Array.isArray(stop.stopRefs)?stop.stopRefs:[])].filter(Boolean))],a=new Alert();a.title='Haltestellengruppe';a.message=refs.join('\n');a.addAction('StopRef hinzufügen');if(refs.length>1)a.addDestructiveAction('Zusätzliche StopRefs entfernen');a.addCancelAction('Zurück');const x=await a.present();if(x===0){const b=new Alert();b.title='StopRef hinzufügen';b.addTextField('StopRef');b.addAction('Hinzufügen');b.addCancelAction('Abbrechen');if(await b.present()===0){const ref=b.textFieldValue(0).trim();if(ref){stops[index]={...stop,stopRefs:[...new Set([...refs,ref])]};writeSavedStops(stops);}}}if(x===1&&refs.length>1){stops[index]={...stop,stopRefs:[stop.stopRef]};writeSavedStops(stops);} }
async function configureStopFilter(stops,index) { const stop=stops[index],f={enabled:false,mode:'whitelist',lines:[],destinations:[],...(stop.filter||{})},a=new Alert();a.title='Filter · '+(stop.displayName||stop.name);a.message=(f.enabled?'Aktiv':'Aus')+' · '+(f.mode==='blacklist'?'Blacklist':'Whitelist')+'\nLinien: '+(f.lines.join(', ')||'alle')+'\nRichtungen: '+(f.destinations.join(', ')||'alle');a.addAction(f.enabled?'Filter deaktivieren':'Filter aktivieren');a.addAction('Modus: '+(f.mode==='blacklist'?'Blacklist':'Whitelist'));a.addAction('Linien bearbeiten');a.addAction('Richtungen bearbeiten');a.addCancelAction('Zurück');const x=await a.present();if(x===0)f.enabled=!f.enabled;if(x===1)f.mode=f.mode==='blacklist'?'whitelist':'blacklist';if(x===2||x===3){const b=new Alert(),isLines=x===2;b.title=isLines?'Linienfilter':'Richtungsfilter';b.message='Kommagetrennt. Leer = keine Einschränkung.';b.addTextField('Werte',(isLines?f.lines:f.destinations).join(', '));b.addAction('Übernehmen');b.addCancelAction('Abbrechen');if(await b.present()===0){const values=b.textFieldValue(0).split(',').map((v)=>v.trim()).filter(Boolean);if(isLines)f.lines=values;else f.destinations=values;}}stops[index]={...stop,filter:f};writeSavedStops(stops); }
async function configureSurfaceFilter(cfg, surface, label) { const a=new Alert(); a.title='Filter · '+label; a.message='Die pro Haltestelle konfigurierten Whitelist-/Blacklist-Filter für '+label+' anwenden.'; a.addAction('Filter: '+(cfg.filters[surface]?'AN':'AUS')); a.addCancelAction('Zurück'); const x=await a.present(); if(x===0)cfg.filters[surface]=!cfg.filters[surface]; }

async function managePinnedStops() {
  // One-time migration: discard old rolling-history entries and retain pins.
  const all = savedStops();
  if (all.some((s) => s.pinned !== true)) writeSavedStops(all);

  while (true) {
    const stops = savedStops().filter((s) => s.pinned === true);
    const a = new Alert();
    a.title = 'Angepinnte Haltestellen';
    a.message = stops.length ? `${stops.length} angepinnte Haltestelle${stops.length === 1 ? '' : 'n'}.` : 'Noch keine Haltestellen angepinnt.';
    a.addAction('Haltestelle anpinnen');
    const orderedStops = [...stops].sort((a, b) => Number(b.home === true) - Number(a.home === true));
    for (const stop of orderedStops) a.addAction(stopMenuLabel(stop));
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
    detail.addAction('Rolle ändern');
    detail.addAction('Haltestellengruppe');
    detail.addAction('Filter');
    detail.addDestructiveAction('Pin entfernen');
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
    if (action === 1) await configureStopRole(stops, index);
    if (action === 2) await configureStopGroup(stops, index);
    if (action === 3) await configureStopFilter(stops, index);
    if (action === 4) { stops.splice(index, 1); writeSavedStops(stops); await notice('Pin entfernt', stop.displayName || stop.name); }
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
    a.title = 'Vollbild konfigurieren';
    a.message = `${cfg.fullscreen.rows} Abfahrten · Schrift ${cfg.fullscreen.fontSize} pt\nRichtung: ${cfg.fullscreen.destinationWrap !== false ? 'Umbruch bis ' + (cfg.fullscreen.destinationLines || 2) + ' Zeilen' : 'eine Zeile'}\n` +
      Object.keys(labels).map((key) =>
        `${labels[key]}: ${cfg.fullscreen.columns[key].visible ? 'Breitenwert ' + cfg.fullscreen.columns[key].width : 'aus'}`
      ).join('\n');
    a.addAction('Anzahl Abfahrten');
    a.addAction('Linie');
    a.addAction('Richtung');
    a.addAction('Gleis');
    a.addAction('Abfahrtszeit');
    a.addAction('Restzeit');
    a.addAction('Schriftgröße');
    a.addAction('Filter');
    a.addAction(`Richtung umbrechen: ${cfg.fullscreen.destinationWrap !== false ? 'AN' : 'AUS'}`);
    a.addAction(`Max. Richtungszeilen: ${Math.max(1, Math.min(4, Number(cfg.fullscreen.destinationLines) || 2))}`);
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) cfg.fullscreen.rows = await askNumber('Vollbild – Abfahrten', 'Wie viele Abfahrten sollen angezeigt werden?', cfg.fullscreen.rows, 1, 30);
    if (choice >= 1 && choice <= 5) {
      const key = ['line', 'destination', 'platform', 'departureTime', 'countdown'][choice - 1];
      const col = cfg.fullscreen.columns[key];
      const b = new Alert();
      b.title = labels[key];
      b.message = `Aktuell: ${col.visible ? 'sichtbar' : 'ausgeblendet'} · Breitenwert ${col.width}\n\nDie sichtbaren Spalten teilen sich die verfügbare Displaybreite im Verhältnis ihrer Breitenwerte. Größer = mehr Platz.`;
      b.addAction(col.visible ? 'Spalte ausblenden' : 'Spalte einblenden');
      b.addAction('Breitenwert ändern');
      b.addCancelAction('Zurück');
      const sub = await b.present();
      if (sub === 0) col.visible = !col.visible;
      if (sub === 1) col.width = await askNumber(labels[key] + ' – Breitenwert', 'Relativer Anteil an der verfügbaren Vollbild-Breite. Größere Werte geben dieser Spalte mehr Platz.', col.width, 20, 400);
    }
    if (choice === 6) cfg.fullscreen.fontSize = await askNumber('Vollbild – Schriftgröße', 'Schriftgröße der Tabellenwerte.', cfg.fullscreen.fontSize, 10, 28);
    if (choice === 7) await configureSurfaceFilter(cfg, 'fullscreen', 'Vollbild');
    if (choice === 8) cfg.fullscreen.destinationWrap = cfg.fullscreen.destinationWrap === false;
    if (choice === 9) cfg.fullscreen.destinationLines = await askNumber(
      'Richtung – maximale Zeilen',
      'Wie viele Zeilen darf die Richtung im Vollbild maximal verwenden?',
      Math.max(1, Math.min(4, Number(cfg.fullscreen.destinationLines) || 2)),
      1,
      4,
    );
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
    a.addAction('Filter');
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
    if (choice === 9) await configureSurfaceFilter(cfg, 'widget', 'Widget');
  }
}

async function configureLocation(cfg) {
  while (true) {
    const fallbackLabels = { last: 'Letzte Haltestelle', home: '🏠 Home', none: 'Kein Fallback' };
    const fallback = fallbackLabels[cfg.location.fallbackMode] || fallbackLabels.last;
    const a = new Alert();
    a.title = 'Standort konfigurieren';
    a.message = `Automatische Auswahl: ${cfg.location.autoSelectSavedStop ? 'AN' : 'AUS'}\nEntfernung: ${cfg.location.savedStopRadiusMeters} m\nFallback: ${fallback}`;
    a.addAction(`Angepinnte Haltestelle automatisch: ${cfg.location.autoSelectSavedStop ? 'AN' : 'AUS'}`);
    if (cfg.location.autoSelectSavedStop) a.addAction(`Entfernung: ${cfg.location.savedStopRadiusMeters} m`);
    a.addAction('Fallback: ' + fallback);
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) cfg.location.autoSelectSavedStop = !cfg.location.autoSelectSavedStop;
    if (cfg.location.autoSelectSavedStop && choice === 1) cfg.location.savedStopRadiusMeters = await askNumber(
      'Automatische Haltestelle – Entfernung',
      'Maximale Entfernung in Metern, in der eine angepinnte Haltestelle automatisch übernommen wird.',
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
  return `${cfg.rows} Widget-Abfahrten\n\n${columns}\n\nSpaltenabstand: ${cfg.spacing.columns} pt\nZeilenabstand: ${cfg.spacing.rows} pt\n\nVollbild: ${cfg.fullscreen.rows} Abfahrten · ${cfg.fullscreen.fontSize} pt`;
}


function canonicalGtfsStopRef(ref) {
  const parts = String(ref || '').trim().split(':');
  return parts.length >= 3 ? parts.slice(0, 3).join(':') : String(ref || '').trim();
}
function offlineManager() { return FileManager.local(); }
function offlineDir() {
  const manager = offlineManager();
  return manager.joinPath(manager.documentsDirectory(), GTFS_CACHE_DIR);
}
function ensureOfflineDir() {
  const manager = offlineManager();
  const dir = offlineDir();
  if (!manager.fileExists(dir)) manager.createDirectory(dir, true);
  return dir;
}
function offlineFile(name) { return offlineManager().joinPath(offlineDir(), name); }
function readOfflineJson(name) {
  try {
    const manager = offlineManager(), path = offlineFile(name);
    return manager.fileExists(path) ? JSON.parse(manager.readString(path)) : null;
  } catch (_) { return null; }
}
async function downloadJson(url) {
  const req = new Request(url + '?t=' + Date.now());
  req.timeoutInterval = 30;
  req.headers = { 'User-Agent': 'abfahrt/' + APP_VERSION, Accept: 'application/json' };
  const raw = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status === 404 && url.startsWith(GTFS_RAW_BASE_URL)) {
    throw new Error('Offline-Fahrplandaten sind noch nicht verfügbar. Der GTFS-Datenbestand wurde auf GitHub noch nicht veröffentlicht.');
  }
  if (status < 200 || status >= 300) throw new Error('HTTP ' + (status || '?'));
  return { raw, value: JSON.parse(raw) };
}
function offlineWantedStopEntries(cfg) {
  const all = [];
  if (cfg.offline?.pinned) all.push(...savedStops().filter((stop) => stop.pinned === true));
  if (cfg.offline?.history) all.push(...recentStops().slice(0, 20));
  const entries = new Map();
  for (const stop of all) {
    const stopRefs = Array.isArray(stop.stopRefs) && stop.stopRefs.length ? stop.stopRefs : [stop.stopRef];
    for (const rawRef of stopRefs) {
      if (!rawRef) continue;
      const ref = canonicalGtfsStopRef(rawRef);
      if (!entries.has(ref)) entries.set(ref, {
        ref,
        name: stop.displayName || stop.name || 'Unbenannte Haltestelle',
        sourceName: stop.name || stop.displayName || '',
      });
    }
  }
  return [...entries.values()];
}
function offlineWantedStops(cfg) {
  return offlineWantedStopEntries(cfg).map((item) => item.ref);
}
function normalizeGtfsLookupName(value) {
  return normalizeStopName(String(value || '')
    .replace(/\b(?:bstg|bahnsteig|steig|gleis)\b.*$/i, '')
    .replace(/[\s,;:\-]+$/g, ''));
}
function resolveGtfsIndexRef(entry, stops) {
  if (stops?.[entry.ref]) return entry.ref;
  const target = normalizeGtfsLookupName(entry.sourceName || entry.name);
  if (!target) return null;
  const matches = Object.entries(stops || {})
    .filter(([, value]) => normalizeGtfsLookupName(value?.name) === target);
  const preferred = matches.filter(([ref]) => !/_parent$/i.test(ref) && !/^gen:/i.test(ref));
  const candidates = preferred.length ? preferred : matches;
  return candidates.length === 1 ? candidates[0][0] : null;
}
function formatOfflineTimestamp(value) {
  if (!value || value === 'keine Daten' || value === 'unbekannt') return value || 'keine Daten';
  let normalized = value;
  if (typeof normalized === 'string' && normalized.startsWith('"') && normalized.endsWith('"')) {
    try { normalized = JSON.parse(normalized); } catch (_) {}
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return String(normalized);
  return date.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' Uhr';
}
async function syncOfflineData(cfg) {
  if (!cfg.offline?.enabled) {
    await notice('Offline-Fahrplan ist aus', 'Aktiviere den Offline-Fahrplan zuerst.');
    return;
  }
  const wantedEntries = offlineWantedStopEntries(cfg);
  const wanted = wantedEntries.map((item) => item.ref);
  if (!wanted.length) {
    await notice('Keine Haltestellen', 'Es gibt keine ausgewählten angepinnten oder zuletzt verwendeten Haltestellen.');
    return;
  }
  try {
    const manifest = await downloadJson(GTFS_RAW_BASE_URL + 'manifest.json');
    const index = await downloadJson(GTFS_RAW_BASE_URL + 'index.json');
    const resolved = wantedEntries.map((item) => ({
      ...item,
      sourceRef: resolveGtfsIndexRef(item, index.value.stops),
    }));
    const found = resolved.filter((item) => item.sourceRef);
    const missing = resolved.filter((item) => !item.sourceRef);
    const shards = [...new Set(found.map((item) => index.value.stops[item.sourceRef].shard))];
    const downloads = [];
    for (const shard of shards) downloads.push([shard, await downloadJson(GTFS_RAW_BASE_URL + shard + '.json')]);

    // Keep the previous cache untouched until every required shard is available.
    const manager = offlineManager();
    ensureOfflineDir();
    const localManifest = {
      ...manifest.value,
      localSyncedAt: new Date().toISOString(),
      localRequestedStops: [...wanted],
    };
    manager.writeString(offlineFile('manifest.json'), JSON.stringify(localManifest));
    manager.writeString(offlineFile('index.json'), JSON.stringify({
      schemaVersion: index.value.schemaVersion,
      stops: Object.fromEntries(found.map((item) => [
        item.ref,
        { ...index.value.stops[item.sourceRef], sourceRef: item.sourceRef },
      ])),
    }));
    for (const [shard, data] of downloads) {
      manager.writeString(offlineFile(shard + '.json'), data.raw);
    }
    const keep = new Set(['manifest.json', 'index.json', ...shards.map((s) => s + '.json')]);
    for (const name of manager.listContents(offlineDir())) {
      if (!keep.has(name)) manager.remove(manager.joinPath(offlineDir(), name));
    }
    const stamp = formatOfflineTimestamp(manifest.value.sourceImportedAt || manifest.value.generatedAt || 'unbekannt');
    const missingText = missing.length
      ? '\n\nNicht zugeordnet (' + missing.length + '):\n' + missing.map((item) => '• ' + item.name + ' [' + item.ref + ']').join('\n')
      : '';
    await notice('Offline-Daten aktualisiert', `${found.length}/${wanted.length} Haltestellen-IDs verfügbar · ${shards.length} Datenpakete.\n\nDatenstand: ${stamp}${missingText}`);
  } catch (e) {
    await notice('Offline-Update fehlgeschlagen', 'Die bisherigen Offline-Daten bleiben erhalten.\n\n' + e.message);
  }
}
async function deleteOfflineData(showNotice = true) {
  const manager = offlineManager(), dir = offlineDir();
  if (manager.fileExists(dir)) manager.remove(dir);
  if (showNotice) await notice('Offline-Daten gelöscht', 'Der lokale GTFS-Cache wurde gelöscht.');
}
function offlineStatus(cfg) {
  const manifest = readOfflineJson('manifest.json');
  const index = readOfflineJson('index.json');
  const wanted = offlineWantedStops(cfg);
  const available = wanted.filter((ref) => index?.stops?.[ref]).length;
  const stamp = formatOfflineTimestamp(manifest?.sourceImportedAt || manifest?.generatedAt || 'keine Daten');
  return { wanted: wanted.length, available, stamp, schemaVersion: manifest?.schemaVersion || null };
}
async function configureOffline(cfg) {
  while (true) {
    const status = offlineStatus(cfg);
    const a = new Alert();
    a.title = 'Offline-Fahrplan';
    a.message = `Offline: ${cfg.offline.enabled ? 'Ein' : 'Aus'}\nAngepinnte: ${cfg.offline.pinned ? 'Ein' : 'Aus'}\nZuletzt verwendet (max. 20): ${cfg.offline.history ? 'Ein' : 'Aus'}\nAutomatisch: ${cfg.offline.autoUpdate !== false ? 'Ein' : 'Aus'}\nOffline-Zuordnungen: ${status.available}/${status.wanted}\nDatenformat: ${status.schemaVersion ? 'v' + status.schemaVersion : 'keine Daten'}\nDatenstand: ${status.stamp}`;
    a.addAction(`Offline-Fahrplan ${cfg.offline.enabled ? 'ausschalten' : 'einschalten'}`);
    a.addAction(`Angepinnte Haltestellen: ${cfg.offline.pinned ? 'Ein' : 'Aus'}`);
    a.addAction(`Zuletzt verwendete: ${cfg.offline.history ? 'Ein' : 'Aus'}`);
    a.addAction(`Automatische Aktualisierung: ${cfg.offline.autoUpdate !== false ? 'Ein' : 'Aus'}`);
    a.addAction('Offline-Daten aktualisieren');
    a.addDestructiveAction('Offline-Daten löschen');
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) cfg.offline.enabled = !cfg.offline.enabled;
    if (choice === 1) cfg.offline.pinned = !cfg.offline.pinned;
    if (choice === 2) cfg.offline.history = !cfg.offline.history;
    if (choice === 3) cfg.offline.autoUpdate = cfg.offline.autoUpdate === false;
    if (choice === 4) await syncOfflineData(cfg);
    if (choice === 5) await deleteOfflineData();
    await save(cfg, false);
  }
}

async function save(cfg, showNotice = true) {
  fm.writeString(configPath, JSON.stringify(cfg, null, 2));
  if (showNotice) {
    await notice('Gespeichert', 'Die persönliche Widget-Konfiguration wurde gespeichert. Das Home-Screen-Widget verwendet sie beim nächsten Refresh.');
  }
}

async function exportConfig(cfg) {
  const backup = {
    format: 'abfahrt-backup',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    config: clone(cfg),
    pinnedStops: savedStops().filter((stop) => stop.pinned === true),
  };
  const text = JSON.stringify(backup, null, 2);
  Pasteboard.copyString(text);
  await notice('Backup kopiert', 'Konfiguration und angepinnte Haltestellen wurden als JSON in die Zwischenablage kopiert. TRIAS-Key, letzte Haltestelle, zuletzt verwendete Haltestellen und Development-Status sind nicht enthalten.');
}

async function importConfig() {
  const a = new Alert();
  a.title = 'Backup importieren';
  a.message = 'Füge hier ein zuvor exportiertes Abfahrt-Backup ein. Die aktuelle Konfiguration und die angepinnten Haltestellen werden ersetzt. Der TRIAS-Key bleibt unverändert.';
  a.addTextField('Backup JSON', Pasteboard.pasteString() || '');
  a.addAction('Importieren');
  a.addCancelAction('Abbrechen');
  if (await a.present() === -1) return null;

  let backup;
  try {
    backup = JSON.parse(a.textFieldValue(0));
  } catch (_) {
    await notice('Import fehlgeschlagen', 'Das Backup ist kein gültiges JSON.');
    return null;
  }
  if (backup?.format !== 'abfahrt-backup' || backup?.formatVersion !== 1 || !backup.config || !Array.isArray(backup.pinnedStops)) {
    await notice('Import fehlgeschlagen', 'Das Backup-Format wird nicht unterstützt oder ist unvollständig.');
    return null;
  }

  const imported = {
    ...clone(DEFAULTS),
    ...backup.config,
    updates: { ...DEFAULTS.updates, ...(backup.config.updates || {}) },
    filters: { ...DEFAULTS.filters, ...(backup.config.filters || {}) },
    offline: { ...DEFAULTS.offline, ...(backup.config.offline || {}) },
    location: { ...DEFAULTS.location, ...(backup.config.location || {}) },
    columns: Object.fromEntries(Object.entries(DEFAULTS.columns).map(([key, value]) => [key, { ...value, ...(backup.config.columns?.[key] || {}) }])),
    spacing: { ...DEFAULTS.spacing, ...(backup.config.spacing || {}) },
    fontSize: { ...DEFAULTS.fontSize, ...(backup.config.fontSize || {}) },
    fullscreen: {
      ...DEFAULTS.fullscreen,
      ...(backup.config.fullscreen || {}),
      columns: Object.fromEntries(Object.entries(DEFAULTS.fullscreen.columns).map(([key, value]) => [key, { ...value, ...(backup.config.fullscreen?.columns?.[key] || {}) }])),
    },
  };
  await save(imported, false);
  writeSavedStops(backup.pinnedStops.map((stop) => ({ ...stop, pinned: true })));
  await notice('Backup importiert', 'Konfiguration und angepinnte Haltestellen wurden wiederhergestellt. Der TRIAS-Key und andere lokale Laufzeitdaten wurden nicht verändert.');
  return imported;
}

async function configureBackup(cfg) {
  const a = new Alert();
  a.title = 'Backup & Wiederherstellung';
  a.message = 'Sichert persönliche Einstellungen und angepinnte Haltestellen als JSON. Geheimnisse und Laufzeitdaten werden nicht exportiert.';
  a.addAction('Backup exportieren');
  a.addAction('Backup importieren');
  a.addCancelAction('Zurück');
  const choice = await a.present();
  if (choice === 0) await exportConfig(cfg);
  if (choice === 1) return await importConfig();
  return null;
}

async function reset() {
  if (fm.fileExists(configPath)) fm.remove(configPath);
  await deleteOfflineData(false);
  await notice('Zurückgesetzt', 'Die persönliche Konfiguration und der lokale Offline-Cache wurden gelöscht. Angepinnte und zuletzt verwendete Haltestellen sowie der TRIAS-Key bleiben erhalten.');
}


const RELEASE_API_URL = 'https://api.github.com/repos/ganfer/abfahrt/releases/latest';
const RELEASE_RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/abfahrt/';
const MAIN_COMMIT_API_URL = 'https://api.github.com/repos/ganfer/abfahrt/commits/main';
const DEVELOPMENT_REF_KEY = 'ABFAHRT_DEVELOPMENT_REF';
const PENDING_INSTALL_REF_KEY = 'ABFAHRT_PENDING_INSTALL_REF';
const PENDING_INSTALL_VERSION_KEY = 'ABFAHRT_PENDING_INSTALL_VERSION';
const PENDING_INSTALLER_NAME_KEY = 'ABFAHRT_PENDING_INSTALLER_NAME';

const INSTALLER_FILE_NAMES = ['Abfahrt-Install.js'];
const MANAGED_FILES = [
  {
    name: 'Abfahrt.js',
    markers: ["const APP_VERSION = '", "const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';", 'await main();'],
  },
  {
    name: 'Abfahrt-Config.js',
    markers: ["const APP_VERSION = '", "const CONFIG_FILE_NAME = 'Abfahrt.config.json';", 'await main();'],
  },
];
const MANAGED_KEYCHAIN_KEYS = [
  'ABFAHRT_TRIAS_REQUESTOR_REF',
  'ABFAHRT_LAST_STOP_REF',
  'ABFAHRT_LAST_STOP_NAME',
  SAVED_STOPS_KEY,
  RECENT_STOPS_KEY,
  DEVELOPMENT_REF_KEY,
  PENDING_INSTALL_REF_KEY,
  PENDING_INSTALL_VERSION_KEY,
  PENDING_INSTALLER_NAME_KEY,
];

function currentScriptFileManager() {
  const cloud = FileManager.iCloud();
  const local = FileManager.local();
  const scriptName = Script.name() + '.js';
  const cloudPath = cloud.joinPath(cloud.documentsDirectory(), scriptName);
  const localPath = local.joinPath(local.documentsDirectory(), scriptName);

  // Prefer the storage that contains the currently named Config script.
  // If both copies exist, Scriptable's iCloud script is the normal source.
  if (cloud.fileExists(cloudPath)) return { label: 'iCloud', fm: cloud };
  if (local.fileExists(localPath)) return { label: 'Lokal', fm: local };
  return { label: 'iCloud', fm: cloud };
}

function updateTargets(fileName) {
  const current = currentScriptFileManager();
  return [{ label: current.label, fm: current.fm }];
}

function versionFromSource(source) {
  const match = source.match(/const APP_VERSION = ['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function sha256Hex(input) {
  const text = unescape(encodeURIComponent(String(input)));
  const bytes = Array.from(text, (ch) => ch.charCodeAt(0));
  const bitLength = bytes.length * 8;
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotr = (value, amount) => (value >>> amount) | (value << (32 - amount));

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      w[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  return H.map((value) => value.toString(16).padStart(8, '0')).join('');
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
  return { version: match[1], tag, notes: String(release?.body || '').trim() };
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

async function downloadReleaseManifest(ref, expectedVersion) {
  const req = new Request(RELEASE_RAW_BASE_URL + encodeURIComponent(ref) + '/release-manifest.json?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
  const raw = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status === 404) return null; // Compatibility with releases created before manifest support.
  if (status !== 200) throw new Error(`Release-Manifest: GitHub HTTP ${status || '?'}`);

  let manifest;
  try { manifest = JSON.parse(raw); } catch (_) { throw new Error('Das Release-Manifest ist kein gültiges JSON.'); }
  if (manifest?.schemaVersion !== 1 || manifest?.version !== expectedVersion || !Array.isArray(manifest?.files)) {
    throw new Error('Das Release-Manifest passt nicht zum ausgewählten Stable Release.');
  }
  for (const file of MANAGED_FILES) {
    const entry = manifest.files.find((item) => item?.name === file.name);
    if (!entry || !/^[0-9a-f]{64}$/i.test(String(entry.sha256 || ''))) {
      throw new Error(`Release-Manifest: ${file.name} fehlt oder hat keinen gültigen SHA-256-Hash.`);
    }
  }
  return manifest;
}

async function downloadUpdateFile(file, ref, manifest = null) {
  const req = new Request(RELEASE_RAW_BASE_URL + encodeURIComponent(ref) + '/' + file.name + '?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'text/plain', 'Cache-Control': 'no-cache' };
  const source = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error(`${file.name}: GitHub HTTP ${status || '?'}`);
  if (!source.trim() || !file.markers.every((marker) => source.includes(marker))) {
    throw new Error(`${file.name}: Download konnte nicht validiert werden.`);
  }
  if (manifest) {
    const expected = manifest.files.find((item) => item.name === file.name)?.sha256;
    const actual = sha256Hex(source);
    if (!expected || actual !== String(expected).toLowerCase()) {
      throw new Error(`${file.name}: SHA-256-Prüfung gegen das Release-Manifest fehlgeschlagen.`);
    }
  }
  return source;
}

async function downloadManagedFiles(ref, expectedVersion = null, manifest = null) {
  const downloads = [];
  for (const file of MANAGED_FILES) {
    downloads.push({ file, source: await downloadUpdateFile(file, ref, manifest) });
  }
  const versions = downloads.map((item) => versionFromSource(item.source));
  if (versions.some((version) => !version) || versions.some((version) => version !== versions[0])) {
    throw new Error('Die heruntergeladenen Skripte haben unterschiedliche oder ungültige Versionsstände.');
  }
  if (expectedVersion && versions[0] !== expectedVersion) {
    throw new Error('Die Release-Dateien passen nicht zur veröffentlichten Version.');
  }
  return downloads;
}

function writeManagedFiles(downloads) {
  const target = currentScriptFileManager();
  const paths = downloads.map((item) => ({
    item,
    path: target.fm.joinPath(target.fm.documentsDirectory(), item.file.name),
  }));
  const backups = paths.map(({ path }) => ({
    path,
    existed: target.fm.fileExists(path),
    source: target.fm.fileExists(path) ? target.fm.readString(path) : null,
  }));

  try {
    for (const { item, path } of paths) target.fm.writeString(path, item.source);
  } catch (writeError) {
    for (const backup of backups) {
      try {
        if (backup.existed) target.fm.writeString(backup.path, backup.source);
        else if (target.fm.fileExists(backup.path)) target.fm.remove(backup.path);
      } catch (_) {}
    }
    throw new Error('Die Installation konnte nicht vollständig geschrieben werden; die vorherigen Dateien wurden soweit möglich wiederhergestellt. ' + writeError.message);
  }
  return { target, written: paths.map(({ item }) => `• ${item.file.name} [${target.label}]`) };
}

function installerFileNames() {
  const names = new Set(INSTALLER_FILE_NAMES);
  if (Keychain.contains(PENDING_INSTALLER_NAME_KEY)) {
    const pending = Keychain.get(PENDING_INSTALLER_NAME_KEY).trim();
    if (pending) names.add(pending.endsWith('.js') ? pending : pending + '.js');
  }
  return [...names];
}

function clearPendingInstallState() {
  for (const key of [PENDING_INSTALL_REF_KEY, PENDING_INSTALL_VERSION_KEY, PENDING_INSTALLER_NAME_KEY]) {
    if (Keychain.contains(key)) Keychain.remove(key);
  }
}

function removeInstallerFiles() {
  const names = installerFileNames();
  for (const manager of [FileManager.iCloud(), FileManager.local()]) {
    for (const name of names) {
      const path = manager.joinPath(manager.documentsDirectory(), name);
      if (manager.fileExists(path)) manager.remove(path);
    }
  }
}

async function completePendingInstall() {
  if (!Keychain.contains(PENDING_INSTALL_REF_KEY)) return false;
  const ref = Keychain.get(PENDING_INSTALL_REF_KEY).trim();
  const expectedVersion = Keychain.contains(PENDING_INSTALL_VERSION_KEY)
    ? Keychain.get(PENDING_INSTALL_VERSION_KEY).trim()
    : ref.replace(/^v/, '');

  try {
    const manifest = await downloadReleaseManifest(ref, expectedVersion);
    const downloads = await downloadManagedFiles(ref, expectedVersion, manifest);
    const result = writeManagedFiles(downloads);
    if (!managedInstallMatches(expectedVersion)) {
      throw new Error('Die installierten Skripte konnten nicht als vollständige Zielversion verifiziert werden.');
    }

    removeInstallerFiles();
    clearPendingInstallState();
    if (Keychain.contains(DEVELOPMENT_REF_KEY)) Keychain.remove(DEVELOPMENT_REF_KEY);
    await notice(
      'Installation abgeschlossen',
      `Abfahrt Stable v${expectedVersion} wurde aus ${ref} installiert und verifiziert.

${result.written.join('\n')}

Starte jetzt Abfahrt einmalig, um den TRIAS-Key einzurichten.`,
    );
  } catch (e) {
    await notice(
      'Installation fehlgeschlagen',
      'Der Bootstrap-Installer und der Installationsstatus bleiben für einen erneuten Versuch erhalten.\n\n' + e.message,
    );
  }
  return true;
}

function installedManagedVersions() {
  const versions = [];
  for (const file of MANAGED_FILES) {
    const found = [];
    for (const target of updateTargets(file.name)) {
      const path = target.fm.joinPath(target.fm.documentsDirectory(), file.name);
      if (!target.fm.fileExists(path)) continue;
      try {
        const version = versionFromSource(target.fm.readString(path));
        found.push({ label: target.label, version: version || 'unbekannt' });
      } catch (_) {
        found.push({ label: target.label, version: 'unlesbar' });
      }
    }
    versions.push({ file: file.name, copies: found });
  }
  return versions;
}

function managedInstallMatches(version) {
  const installed = installedManagedVersions();
  return installed.every((item) =>
    item.copies.length > 0 && item.copies.every((copy) => copy.version === version)
  );
}

function installedVersionSummary() {
  return installedManagedVersions()
    .map((item) => `${item.file}: ${item.copies.length ? item.copies.map((copy) => `${copy.label} v${copy.version}`).join(', ') : 'fehlt'}`)
    .join('\n');
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

function relaunchConfig() {
  Safari.open('scriptable:///run?scriptName=' + encodeURIComponent(Script.name()));
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
  const installedDevelopmentRef = Keychain.contains(DEVELOPMENT_REF_KEY) ? Keychain.get(DEVELOPMENT_REF_KEY) : '';
  if (development && installedDevelopmentRef === source.ref) {
    await notice('Kein Update verfügbar', `Development ${source.label} ist bereits installiert.\n\nInstalliert: v${APP_VERSION} · ${source.label}`);
    return;
  }
  const stableInstallComplete = development ? false : managedInstallMatches(remoteVersion);
  if (!development && compareVersions(remoteVersion, APP_VERSION) <= 0 && stableInstallComplete) {
    await notice('Kein Update verfügbar', `Verfügbar: v${remoteVersion}\nKanal: 🛡 Stable\n\nAlle verwalteten Skripte entsprechen bereits dem aktuellen Stable Release.\n\n${installedVersionSummary()}`);
    return;
  }
  const confirm = new Alert();
  confirm.title = development ? `Development ${source.label} installieren` : `Update v${remoteVersion} verfügbar`;
  confirm.message = development
    ? `Installiert: v${APP_VERSION}\nKanal: 🧪 Development\nCommit: ${source.label}\n\nWidget und Config werden exakt aus diesem main-Commit installiert. Development kann instabil sein.`
    : `Config: v${APP_VERSION}\nVerfügbar: v${remoteVersion}\n\n${stableInstallComplete ? '' : 'Die lokale Installation ist unvollständig oder hat unterschiedliche Versionsstände.\n\n'}Widget und Config werden aus dem veröffentlichten GitHub Release ${source.tag} aktualisiert.\n\n${installedVersionSummary()}`;
  confirm.addAction(development ? 'Development installieren' : 'Update installieren');
  confirm.addCancelAction('Abbrechen');
  if (await confirm.present() === -1) return;
  try {
    const ref = development ? source.ref : source.tag;
    const manifest = development ? null : await downloadReleaseManifest(source.tag, remoteVersion);
    const downloads = await downloadManagedFiles(ref, development ? null : remoteVersion, manifest);
    const downloadedVersions = downloads.map((item) => versionFromSource(item.source));
    const { written } = writeManagedFiles(downloads);
    if (!development && !managedInstallMatches(remoteVersion)) throw new Error('Die installierten Skripte konnten nach dem Update nicht als vollständige Zielversion verifiziert werden.');
    if (development) Keychain.set(DEVELOPMENT_REF_KEY, source.ref);
    else if (Keychain.contains(DEVELOPMENT_REF_KEY)) Keychain.remove(DEVELOPMENT_REF_KEY);
    await notice('Update abgeschlossen', `${development ? `Development ${source.label}` : `Version v${remoteVersion}`} installiert und verifiziert.\n\n` + written.join('\n') + '\n\nDie Config wird jetzt neu gestartet, damit der aktualisierte Code aktiv ist. Persönliche Config-Datei und angepinnte Haltestellen wurden nicht verändert.');
    if (!development && source.notes) await notice(`Was ist neu? · ${source.tag}`, formatReleaseNotes(source.notes));
    relaunchConfig();
    return;
  } catch (e) {
    await notice('Update fehlgeschlagen', 'Es wurden keine Skripte ersetzt.\n\n' + e.message);
  }
}

function formatReleaseNotes(notes) {
  const text = String(notes || '').trim();
  if (!text) return 'Für dieses Release sind keine Release Notes hinterlegt.';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 3500);
}

async function showWhatsNew(cfg) {
  if (cfg.updates.channel === 'development') {
    try {
      const development = await latestDevelopment();
      await notice('Was ist neu? · Development', `Development folgt dem aktuellen main-Stand.\n\nAktueller Commit: ${development.label}\n\nFür Development-Builds gibt es keine Stable Release Notes.`);
    } catch (e) {
      await notice('Was ist neu? · Development', 'Development folgt dem aktuellen main-Stand. Für Development-Builds gibt es keine Stable Release Notes.');
    }
    return;
  }

  try {
    const release = await latestRelease();
    await notice(`Was ist neu? · ${release.tag}`, formatReleaseNotes(release.notes));
  } catch (e) {
    await notice('Release Notes nicht verfügbar', 'Die Release Notes konnten nicht geladen werden.\n\n' + e.message);
  }
}

async function configureUpdates(cfg) {
  while (true) {
    const a = new Alert();
    a.title = 'Updates';
    a.message = `Installiert: v${APP_VERSION}\nKanal: ${cfg.updates.channel === 'development' ? '🧪 Development' : '🛡 Stable'}`;
    a.addAction('Update-Kanal');
    a.addAction('Auf Updates prüfen');
    a.addAction('Was ist neu?');
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) await configureUpdateChannel(cfg);
    if (choice === 1) {
      await save(cfg);
      await updateScripts(cfg);
      return;
    }
    if (choice === 2) await showWhatsNew(cfg);
  }
}

function diagnosticSnapshot(cfg) {
  const pinned = savedStops().filter((stop) => stop.pinned === true);
  const offline = offlineStatus(cfg);
  return {
    channel: cfg.updates.channel === 'development' ? 'Development' : 'Stable',
    key: Keychain.contains('ABFAHRT_TRIAS_REQUESTOR_REF') && Keychain.get('ABFAHRT_TRIAS_REQUESTOR_REF').trim() !== '' ? 'vorhanden' : 'fehlt',
    lastStop: Keychain.contains('ABFAHRT_LAST_STOP_REF') && Keychain.get('ABFAHRT_LAST_STOP_REF').trim() !== '' ? 'vorhanden' : 'nicht gesetzt',
    pinned: pinned.length,
    recent: recentStops().length,
    home: pinned.some((stop) => stop.home === true) ? 'gesetzt' : 'nicht gesetzt',
    offlineEnabled: cfg.offline?.enabled ? 'an' : 'aus',
    offlineAvailable: `${offline.available}/${offline.wanted}`,
    offlineSchema: offline.schemaVersion ? 'v' + offline.schemaVersion : 'keine Daten',
    offlineStamp: offline.stamp,
  };
}

async function probeEndpoint(url, headers = {}) {
  try {
    const req = new Request(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
    req.timeoutInterval = 8;
    req.headers = headers;
    await req.loadString();
    const status = req.response ? req.response.statusCode : 0;
    return status >= 200 && status < 500 ? `erreichbar (HTTP ${status})` : `Fehler (HTTP ${status || '?'})`;
  } catch (_) {
    return 'nicht erreichbar';
  }
}

function storageDiagnosticLines() {
  const cloud = FileManager.iCloud();
  const local = FileManager.local();
  const inspect = (label, fm, name) => {
    const path = fm.joinPath(fm.documentsDirectory(), name);
    if (!fm.fileExists(path)) return `${label}: fehlt`;
    try {
      const version = versionFromSource(fm.readString(path));
      return `${label}: ${version ? 'v' + version : 'Version unbekannt'}`;
    } catch (_) {
      return `${label}: vorhanden, nicht lesbar`;
    }
  };
  return [
    `Laufender Code: v${APP_VERSION}`,
    `Script.name(): ${Script.name()}`,
    'Abfahrt-Config.js',
    inspect('  iCloud', cloud, 'Abfahrt-Config.js'),
    inspect('  Lokal', local, 'Abfahrt-Config.js'),
    'Abfahrt.js',
    inspect('  iCloud', cloud, 'Abfahrt.js'),
    inspect('  Lokal', local, 'Abfahrt.js'),
  ];
}

async function buildDiagnostics(cfg) {
  const d = diagnosticSnapshot(cfg);
  const github = await probeEndpoint(RELEASE_API_URL, { Accept: 'application/vnd.github+json' });
  const trias = await probeEndpoint(TRIAS_ENDPOINT);
  return [
    'Abfahrt Diagnose',
    ...storageDiagnosticLines(),
    `Update-Kanal: ${d.channel}`,
    `TRIAS-Key: ${d.key}`,
    `TRIAS-Endpunkt: ${trias}`,
    `GitHub/Updater: ${github}`,
    `Letzte Haltestelle: ${d.lastStop}`,
    `Angepinnte Haltestellen: ${d.pinned}`,
    `Zuletzt verwendete Haltestellen: ${d.recent}`,
    `Home: ${d.home}`,
    `Offline-Fahrplan: ${d.offlineEnabled}`,
    `Offline-Zuordnungen: ${d.offlineAvailable}`,
    `Offline-Datenformat: ${d.offlineSchema}`,
    `Offline-Datenstand: ${d.offlineStamp}`,
  ].join('\n');
}

async function configureDiagnostics(cfg) {
  const report = await buildDiagnostics(cfg);
  const a = new Alert();
  a.title = 'Diagnose';
  a.message = report;
  a.addAction('Diagnose kopieren');
  a.addCancelAction('Zurück');
  if (await a.present() === 0) {
    Pasteboard.copyString(report);
    await notice('Diagnose kopiert', 'Der Diagnosebericht wurde kopiert. Keys, Stop-IDs, Haltestellennamen und Koordinaten werden nicht ausgegeben.');
  }
}


async function recoverFromMain() {
  const confirm = new Alert();
  confirm.title = 'Installation reparieren';
  confirm.message = 'Widget und Config werden direkt aus dem aktuellen GitHub-main wiederhergestellt. Persönliche Konfiguration und angepinnte Haltestellen bleiben erhalten.\n\nDiese Funktion umgeht die normale Stable-/Development-Updateprüfung.';
  confirm.addDestructiveAction('Recovery starten');
  confirm.addCancelAction('Abbrechen');
  if (await confirm.present() === -1) return;

  try {
    const source = await latestDevelopment();
    const downloads = await downloadManagedFiles(source.ref);
    const versions = downloads.map((item) => versionFromSource(item.source));
    const { target } = writeManagedFiles(downloads);

    Keychain.set(DEVELOPMENT_REF_KEY, source.ref);
    await notice('Recovery abgeschlossen', `v${versions[0]} · main ${source.label} wurde in ${target.label} installiert.\n\nBitte die Config anschließend neu öffnen.`);
  } catch (e) {
    await notice('Recovery fehlgeschlagen', e.message);
  }
}

async function uninstall() {
  const confirm = new Alert();
  confirm.title = 'Abfahrt deinstallieren?';
  confirm.message = 'Löscht die Konfiguration, angepinnte und zuletzt verwendete Haltestellen, Offline-Daten, Update-Status, den TRIAS-Key und die verwalteten Script-Dateien. Dieser Vorgang kann nicht rückgängig gemacht werden.';
  confirm.addDestructiveAction('Alles löschen');
  confirm.addCancelAction('Abbrechen');
  if (await confirm.present() !== 0) return false;

  const scriptNames = [...new Set([...MANAGED_FILES.map((file) => file.name), ...installerFileNames()])];
  for (const key of MANAGED_KEYCHAIN_KEYS) if (Keychain.contains(key)) Keychain.remove(key);
  if (fm.fileExists(configPath)) fm.remove(configPath);
  await deleteOfflineData(false);

  for (const manager of [FileManager.iCloud(), FileManager.local()]) {
    for (const file of scriptNames) {
      const path = manager.joinPath(manager.documentsDirectory(), file);
      if (manager.fileExists(path)) manager.remove(path);
    }
  }
  await notice('Deinstalliert', 'Alle bekannten Abfahrt-Daten einschließlich TRIAS-Key und Script-Dateien wurden gelöscht.');
  return true;
}

async function configureDeveloperOptions(cfg) {
  while (true) {
    const a = new Alert();
    a.title = 'Entwickleroptionen';
    a.message = 'Diagnose und Wiederherstellung für Entwicklung und Fehlerbehebung.';
    a.addAction('Diagnose');
    a.addAction('Backup & Wiederherstellung');
    a.addAction('Alle Einstellungen zurücksetzen');
    a.addDestructiveAction('Recovery · Installation reparieren');
    a.addDestructiveAction('Deinstallieren · Alles löschen');
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) await configureDiagnostics(cfg);
    if (choice === 1) { const imported = await configureBackup(cfg); if (imported) Object.assign(cfg, imported); }
    if (choice === 2) { await reset(); Object.assign(cfg, clone(DEFAULTS)); }
    if (choice === 3) await recoverFromMain();
    if (choice === 4) { if (await uninstall()) return 'uninstalled'; }
  }
}

async function main() {
  if (await completePendingInstall()) {
    Script.complete();
    return;
  }

  const cfg = await loadConfig();

  while (true) {
    const stops = savedStops();
    const pinned = stops.filter((s) => s.pinned === true).length;
    const menu = new Alert();
    menu.title = `Abfahrt · v${APP_VERSION}`;
    menu.message = `Widget: ${cfg.rows} Abfahrten\nVollbild: ${cfg.fullscreen.rows} Abfahrten\nAngepinnte Haltestellen: ${pinned}`;
    menu.addAction('Widget');
    menu.addAction('Vollbild');
    menu.addAction('Standort');
    menu.addAction('Haltestellen');
    menu.addAction('Offline-Fahrplan');
    menu.addAction('Updates');
    menu.addAction('Entwickleroptionen');
    menu.addCancelAction('Beenden');
    const choice = await menu.present();

    if (choice === -1) break;
    if (choice === 0) {
      await configureWidget(cfg);
      await save(cfg, false);
    }
    if (choice === 1) {
      await configureFullscreen(cfg);
      await save(cfg, false);
    }
    if (choice === 2) {
      await configureLocation(cfg);
      await save(cfg, false);
    }
    if (choice === 3) await managePinnedStops();
    if (choice === 4) { await configureOffline(cfg); await save(cfg, false); }
    if (choice === 5) { await configureUpdates(cfg); await save(cfg, false); }
    if (choice === 6) { const result = await configureDeveloperOptions(cfg); if (result === 'uninstalled') break; await save(cfg, false); }

  }

  Script.complete();
}
await main();

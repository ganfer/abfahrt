const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const src = read('abfahrt.js');

class FakeXMLParser {
  constructor(raw) { this.raw = raw; }
  parse() {
    const tagRe = /<([^!?][^>]*?)>|([^<]+)/g;
    const stack = [];
    let m;
    while ((m = tagRe.exec(this.raw))) {
      if (m[1] !== undefined) {
        const rawTag = m[1].trim();
        if (rawTag.startsWith('/')) {
          const name = rawTag.slice(1).trim();
          stack.pop();
          if (this.didEndElement) this.didEndElement(name);
          continue;
        }
        const selfClosing = rawTag.endsWith('/');
        const body = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
        const name = body.split(/\s+/)[0];
        const attrs = {};
        body.replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; return _; });
        if (this.didStartElement) this.didStartElement(name, attrs);
        if (!selfClosing) stack.push(name);
        else if (this.didEndElement) this.didEndElement(name);
      } else if (m[2] !== undefined && this.foundCharacters) {
        const txt = m[2];
        if (txt.trim()) this.foundCharacters(txt);
      }
    }
  }
}

function fakeStack() {
  return {
    layoutHorizontally() {},
    layoutVertically() {},
    centerAlignContent() {},
    setPadding() {},
    addSpacer() {},
    addText(t) { return { text: t }; },
    addStack() { return fakeStack(); },
  };
}

const sandbox = {
  args: { widgetParameter: 'test-key', queryParameters: {} },
  config: { runsInWidget: true },
  console,
  Date,
  Math,
  Promise,
  XMLParser: FakeXMLParser,
  Request: class { async loadString() { return '<Trias/>'; } },
  Keychain: { contains: () => false, get: () => '', set: () => {} },
  Location: { setAccuracyToHundredMeters() {}, current: async () => { throw new Error('no'); } },
  Alert: class { addAction() {} addCancelAction() {} addTextField() {} async present() { return -1; } textFieldValue() { return ''; } },
  Device: { isUsingDarkAppearance: () => true },
  Font: { boldSystemFont: () => ({}), systemFont: () => ({}), mediumSystemFont: () => ({}) },
  Color: class { constructor(c) { this.c = c; } },
  Size: class { constructor(width, height) { this.width = width; this.height = height; } },
  ListWidget: class {
    constructor() { this.texts = []; }
    addText(t) { const el = { text: t }; this.texts.push(t); return el; }
    addStack() { return fakeStack(); }
    addSpacer() {}
    setPadding() {}
    set backgroundColor(v) { this.bg = v; }
    set url(v) { this.urlValue = v; }
    presentMedium() {}
  },
  Script: { setWidget() {}, complete() {} },
};
vm.createContext(sandbox);
vm.runInContext(
  src.replace(
    'await main();',
    'globalThis.__test = { rawParameter, parseParameter, buildWidget, buildNearbyRequest, sameStop, distanceMeters, stopDistanceMeters, pinnedStopFor, homeStop, pinnedLabel, resolveGtfsIndexRef };',
  ),
  sandbox,
);
const T = sandbox.__test;

test('compact widget mirrors the dynamic fullscreen visual language', () => {
  const source = read('abfahrt.js');

  assert.match(source, /function addWidgetChip\(/);
  assert.match(source, /realtimeAvailable \? 'Live' : 'Plan'/);
  assert.match(source, /platforms\.length \+ ' Steige'/);
  assert.match(source, /activePin\.home === true \? '🏠' : '★'/);
  assert.match(source, /highlight: index === 0/);
  assert.match(source, /row\.backgroundColor = new Color\('#18181b'\)/);
  assert.ok(source.includes("const clock = column.addText(fmtClock(r.at));"));
  assert.doesNotMatch(source, /fmtClock\(r\.at\) \+ \(r\.realtimeTime/);
  assert.match(source, /Tippen für Details/);
});

test('widget tap starts the integrated foreground flow', () => {
  const w = T.buildWidget('Test', null, [], 0, null);
  assert.equal(w.urlValue, 'scriptable:///run/abfahrt');
});

test('foreground run reads query parameter and key from Keychain', () => {
  sandbox.args.widgetParameter = '';
  sandbox.args.queryParameters = { parameter: 'nearby' };
  sandbox.Keychain.contains = () => true;
  sandbox.Keychain.get = () => 'key-from-keychain';

  assert.equal(T.rawParameter(), 'nearby');
  const parsed = T.parseParameter();
  assert.equal(parsed.key, 'key-from-keychain');
  assert.equal(parsed.nearby, true);
});

test('nearby request contains coordinates', () => {
  const xml = T.buildNearbyRequest(47.99, 7.85, 'key');
  assert.ok(xml.includes('<Latitude>47.99</Latitude>'));
  assert.ok(xml.includes('<Longitude>7.85</Longitude>'));
});


test('stop event request accepts configured result limit', () => {
  const source = read('abfahrt.js');
  assert.match(source, /function buildStopEventRequest\(stopRef, key, resultLimit = 8\)/);
  assert.match(source, /NumberOfResults>\$\{Math\.max\(1, Math\.min\(30,/);
});

test('widget and config await iCloud config downloads', () => {
  const widget = read('abfahrt.js');
  const config = read('abfahrt-config.js');
  assert.match(widget, /async function loadWidgetConfig\(\)/);
  assert.match(widget, /await fm\.downloadFileFromiCloud\(path\)/);
  assert.match(config, /async function loadConfig\(\)/);
  assert.match(config, /await fm\.downloadFileFromiCloud\(configPath\)/);
});

test('widget row slicing uses configured row count', () => {
  const source = read('abfahrt.js');
  assert.match(source, /slice\(0, Math\.max\(1, Math\.min\(8, Number\(WIDGET_CONFIG\.rows\)/);
  assert.doesNotMatch(source, /\.slice\(0, 5\);/);
});


test('runtime maps technical failures to user-facing errors', () => {
  const source = read('abfahrt.js');
  assert.match(source, /function friendlyError\(error\)/);
  assert.match(source, /TRIAS-Key wurde abgelehnt/);
  assert.match(source, /Keine Verbindung zu EFA-BW/);
  assert.match(source, /Antwort von EFA-BW konnte nicht gelesen werden/);
});

test('fullscreen failure shows last attempt time', () => {
  const source = read('abfahrt.js');
  assert.match(source, /Abfahrten nicht verfügbar/);
  assert.match(source, /Letzter Versuch:/);
});


test('widget parameters are not rendered as widget errors', () => {
  const source = read('abfahrt.js');
  assert.ok(source.includes('async function defaultWidget(key, present)'));
  assert.doesNotMatch(source, /async function defaultWidget\(key, present, tapParameter\)/);
  assert.doesNotMatch(source, /cancelledCount\(filteredEvents, Date\.now\(\)\), tapParameter/);
  assert.doesNotMatch(source, /friendlyError\(e\), tapParameter/);
  assert.ok(source.includes('await defaultWidget(key, false);'));
});

test('widget tap uses the integrated foreground flow', () => {
  const source = read('abfahrt.js');
  assert.match(source, /return 'scriptable:\/\/\/run\/abfahrt';/);
  assert.doesNotMatch(source, /abfahrt\?action=select/);
});

test('location distance requires valid stop and device coordinates', () => {
  const source = read('abfahrt.js');
  assert.match(source, /if \(!Number\.isFinite\(stop\.latitude\) \|\| !Number\.isFinite\(stop\.longitude\)\) return null;/);
  assert.match(source, /if \(!Number\.isFinite\(location\?\.latitude\) \|\| !Number\.isFinite\(location\?\.longitude\)\) return null;/);
});

test('README describes the current two-script architecture', () => {
  const source = read('README.md');
  assert.match(source, /abfahrt\.js/);
  assert.match(source, /Home Screen widget/);
  assert.match(source, /abfahrt-config\.js/);
  assert.doesNotMatch(source, /abfahrt-Display\.js/);
  assert.doesNotMatch(source, /abfahrt-refresh\.js/);
});


test('foreground location failures stay user-friendly and hide technical diagnostics', () => {
  const source = read('abfahrt.js');
  assert.doesNotMatch(source, /Location Diagnose|showLocationDiagnostics|diagnostics\.push/);
  assert.doesNotMatch(source, /firstLocationResultShape|firstNodePath|countNodes/);
  assert.match(source, /Scriptable konnte deinen Standort nicht ermitteln/);
  assert.match(source, /Haltestellensuche nicht verfügbar/);
  assert.match(source, /In deiner Nähe konnten keine Haltestellen ermittelt werden/);
});

test('GPS picker exposes pinned stops and shares the selection flow', () => {
  const source = read('abfahrt.js');
  assert.match(source, /picker\.addAction\('📌 Angepinnte Haltestellen'\)/);
  assert.match(source, /async function choosePinnedStop\(key, options = \{\}\)/);
  assert.match(source, /picker\.title = options\.title \|\| 'Angepinnte Haltestellen'/);
  assert.match(source, /rememberStop\(\{[\s\S]*stopRef: selectedPin\.stopRef,[\s\S]*name: selectedPin\.displayName \|\| selectedPin\.name/);
  assert.match(source, /requestWidgetRefresh\(\);[\s\S]*await presentDeparturesTable\(key\);/);
});

test('location failures offer pinned stops before automatic fallback or errors', () => {
  const source = read('abfahrt.js');
  const gps = source.indexOf("title: 'Standort nicht verfügbar'");
  const gpsFallback = source.indexOf("fallbackToLastStop(key, 'GPS ist nicht verfügbar.')");
  const lookup = source.indexOf("title: 'Haltestellensuche nicht verfügbar'");
  const lookupFallback = source.indexOf("fallbackToLastStop(key, 'Die Haltestellensuche konnte nicht geladen werden.')");
  const empty = source.indexOf("title: 'Keine Haltestellen in der Nähe'");
  const emptyFallback = source.indexOf("fallbackToLastStop(key, 'In der Nähe wurden keine Haltestellen gefunden.')");

  assert.ok(gps !== -1 && gps < gpsFallback);
  assert.ok(lookup !== -1 && lookup < lookupFallback);
  assert.ok(empty !== -1 && empty < emptyFallback);
  assert.match(source, /Wähle stattdessen eine angepinnte Haltestelle/);
});


test('Home superpin is exposed in runtime and fallback flow', () => {
  const source = read('abfahrt.js');
  assert.match(source, /function homeStop\(/);
  assert.match(source, /if \(stop\.home === true \|\| stop\.role === 'home'\)/);
  assert.match(source, /icon: '🏠'/);
  assert.match(source, /mode === 'home'/);
  assert.match(source, /Stattdessen wird 🏠 Home verwendet/);
});

test('config supports one Home stop and three fallback modes', () => {
  const source = read('abfahrt-config.js');
  assert.match(source, /a\.addAction\('🏠 Home'\)/);
  assert.match(source, /home:i===index/);
  assert.match(source, /fallbackMode: 'last'/);
  assert.match(source, /cfg\.location\.fallbackMode = 'home'/);
  assert.match(source, /cfg\.location\.fallbackMode = 'none'/);
});


test('updater compares remote and installed versions before installing', () => {
  const source = read('abfahrt-config.js');
  assert.ok(source.includes('compareVersions(remoteVersion, APP_VERSION)'));
  assert.ok(source.includes("!development && compareVersions(remoteVersion, APP_VERSION) <= 0"));
  assert.ok(source.includes("'Kein Update verfügbar'"));
  assert.ok(source.includes("confirm.title = development ? `Development ${source.label} installieren` : `Update v${remoteVersion} verfügbar`"));
  assert.ok(source.includes("downloadManagedFiles(ref, development ? null : remoteVersion, manifest)"));
});


test('Home keeps the configured stop display name', () => {
  const runtime = read('abfahrt.js');
  const config = read('abfahrt-config.js');
  assert.ok(runtime.includes("return stopRole(stop).icon + ' ' + (stop.displayName || stop.name)"));
  assert.ok(runtime.includes('name: home.displayName || home.name'));
  assert.ok(runtime.includes('name: selectedPin.displayName || selectedPin.name'));
  assert.ok(config.includes("return roleForStop(stop).icon + ' ' + (stop.displayName || stop.name)"));
});


test('updater resolves the latest GitHub Release and downloads that exact tag', () => {
  const source = read('abfahrt-config.js');
  assert.ok(source.includes("https://api.github.com/repos/ganfer/abfahrt/releases/latest"));
  assert.ok(source.includes("https://raw.githubusercontent.com/ganfer/abfahrt/"));
  assert.ok(source.includes("source = development ? await latestDevelopment() : await latestRelease()"));
  assert.ok(source.includes("const ref = development ? source.ref : source.tag"));
  assert.ok(source.includes("downloadManagedFiles(ref, development ? null : remoteVersion, manifest)"));
  assert.ok(!source.includes("raw.githubusercontent.com/ganfer/abfahrt/main/"));
});


test('stop matching uses either exact ref or normalized name', () => {
  assert.equal(T.sameStop({ stopRef: 'A', name: 'Bertoldsbrunnen' }, { stopRef: 'A', name: 'Other' }), true);
  assert.equal(T.sameStop({ stopRef: 'A', name: ' Bertoldsbrunnen ' }, { stopRef: 'B', name: 'bertoldsbrunnen' }), true);
  assert.equal(T.sameStop({ stopRef: 'A', name: 'Bertoldsbrunnen' }, { stopRef: 'B', name: 'Hauptbahnhof' }), false);
});

test('distance calculation returns realistic meters and rejects missing coordinates', () => {
  const meters = T.distanceMeters(47.995, 7.85, 47.996, 7.85);
  assert.ok(meters > 100 && meters < 120);
  assert.equal(T.stopDistanceMeters({ latitude: NaN, longitude: 7.85 }, { latitude: 47.995, longitude: 7.85 }), null);
  assert.equal(T.stopDistanceMeters({ latitude: 47.995, longitude: 7.85 }, {}), null);
});

test('pinned and Home selection respect pin state and matching rules', () => {
  const pinned = [
    { stopRef: 'A', name: 'Alpha', pinned: false, home: true },
    { stopRef: 'B', name: 'Beta', displayName: 'Zuhause', pinned: true, home: true },
    { stopRef: 'C', name: 'Gamma', pinned: true },
  ];
  assert.equal(T.pinnedStopFor({ stopRef: 'B', name: 'Other' }, pinned).displayName, 'Zuhause');
  assert.equal(T.pinnedStopFor({ stopRef: 'X', name: 'gamma' }, pinned).stopRef, 'C');
  assert.equal(T.homeStop(pinned).stopRef, 'B');
  assert.equal(T.pinnedLabel(pinned[1]), '🏠 Zuhause');
  assert.equal(T.pinnedLabel(pinned[2]), '📌 Gamma');
});


test('stop roles, groups and filters are wired into runtime', () => {
  const runtime = read('abfahrt.js');
  const config = read('abfahrt-config.js');
  assert.match(runtime, /function stopRefsFor\(/);
  assert.match(runtime, /function eventMatchesFilter\(/);
  assert.match(runtime, /applyPinnedFilter\(events, activePin, 'widget'\)/);
  assert.match(runtime, /applyPinnedFilter\(events, activePin, 'fullscreen'\)/);
  assert.match(config, /Arbeit/);
  assert.match(config, /Love/);
  assert.match(config, /Kneipe/);
  assert.match(config, /Eigenes Emoji \/ Rolle/);
  assert.match(config, /Haltestellengruppe/);
  assert.match(config, /Blacklist/);
  assert.match(config, /Whitelist/);
});

test('realtime display distinguishes realtime, delay and timetable-only data', () => {
  const runtime = read('abfahrt.js');
  assert.match(runtime, /realtimeAvailable \? 'Live' : 'Plan'/);
  assert.match(runtime, /realtimeAvailable \? '● Echtzeit' : '° Fahrplan'/);
  assert.ok(runtime.includes("const clock = column.addText(fmtClock(r.at));"));
  assert.match(runtime, /r\.delayMin >= DELAY_HEAVY_MIN \? c\.late : r\.delayMin > 0 \? c\.delay : c\.ok/);
  assert.match(runtime, /if \(r\.cancelled\) right = 'entfällt'/);
});


test('offline GTFS is limited to configured saved stops', () => {
  const source = read('abfahrt.js');
  assert.match(source, /function offlineStopAllowed\(stopRefs\)/);
  assert.match(source, /WIDGET_CONFIG\.offline\.pinned/);
  assert.match(source, /WIDGET_CONFIG\.offline\.history/);
  assert.match(source, /recentStops\(\)\.slice\(0, RECENT_STOPS_LIMIT\)/);
});

test('TRIAS remains primary and GTFS is only a fallback', () => {
  const source = read('abfahrt.js');
  assert.match(source, /async function fetchDeparturesWithOffline/);
  assert.match(source, /return await fetchDepartures\(stopRefs, key, resultLimit\)/);
  assert.match(source, /const fallback = offlineDepartures\(stopRefs\)/);
});

test('offline GTFS respects service calendars and exceptions', () => {
  const source = read('abfahrt.js');
  assert.match(source, /function gtfsServiceRuns\(service, date\)/);
  assert.match(source, /service\.exceptions/);
  assert.match(source, /service\.weekdays/);
});

test('config can cache pinned stops and recent history independently', () => {
  const source = read('abfahrt-config.js');
  assert.match(source, /offline: \{ enabled: true, pinned: true, history: true, autoUpdate: true \}/);
  assert.match(source, /if \(cfg\.offline\?\.pinned\)/);
  assert.match(source, /if \(cfg\.offline\?\.history\)/);
  assert.match(source, /recentStops\(\)\.slice\(0, 20\)/);
  assert.match(source, /Offline-Daten aktualisieren/);
  assert.match(source, /Offline-Daten löschen/);
});


test('GTFS fallback resolves only unambiguous station-name aliases', () => {
  const exactStops = {
    'de:exact:1': { name: 'Andere Haltestelle' },
    'de:name:1': { name: 'Freiburg Hauptbahnhof' },
  };
  assert.equal(
    T.resolveGtfsIndexRef({ ref: 'de:exact:1', sourceName: 'Freiburg Hauptbahnhof' }, exactStops),
    'de:exact:1',
  );
  assert.equal(
    T.resolveGtfsIndexRef({ ref: 'de:missing:1', sourceName: 'Freiburg Hauptbahnhof' }, exactStops),
    'de:name:1',
  );
  assert.equal(
    T.resolveGtfsIndexRef(
      { ref: 'de:missing:2', sourceName: 'Villach Hauptbahnhof' },
      { 'at:42:3654': { name: 'Villach Hauptbahnhof Bstg F1' } },
    ),
    'at:42:3654',
  );
  assert.equal(
    T.resolveGtfsIndexRef(
      { ref: 'de:missing:3', sourceName: 'Doppelte Station' },
      {
        'de:a:1': { name: 'Doppelte Station' },
        'de:b:1': { name: 'Doppelte Station' },
      },
    ),
    null,
  );
});

test('runtime and config persist the resolved GTFS source reference', () => {
  const runtime = read('abfahrt.js');
  const config = read('abfahrt-config.js');
  assert.match(runtime, /sourceRef: resolveGtfsIndexRef/);
  assert.match(runtime, /const sourceRef = entry\.sourceRef \|\| logicalRef/);
  assert.match(config, /sourceRef: resolveGtfsIndexRef/);
  assert.match(config, /sourceRef: item\.sourceRef/);
});

test('offline auto refresh remembers the requested stop set instead of retrying unmapped IDs every run', () => {
  const runtime = read('abfahrt.js');
  assert.match(runtime, /localRequestedStops: \[\.\.\.wanted\]/);
  assert.match(runtime, /Array\.isArray\(manifest\.localRequestedStops\)/);
  assert.doesNotMatch(runtime, /wanted\.some\(\(ref\) => !index\.stops\[ref\]\)/);
});

test('manual offline refresh records sync metadata and downloads shards before replacing cache', () => {
  const config = read('abfahrt-config.js');
  assert.match(config, /localSyncedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(config, /localRequestedStops: \[\.\.\.wanted\]/);
  const downloadPos = config.indexOf("for (const shard of shards) downloads.push");
  const writePos = config.indexOf("manager.writeString(offlineFile('manifest.json')");
  assert.ok(downloadPos >= 0 && writePos > downloadPos);
});

test('uninstall removes last-stop state and the offline cache', () => {
  const config = read('abfahrt-config.js');
  assert.match(config, /'ABFAHRT_LAST_STOP_REF'/);
  assert.match(config, /'ABFAHRT_LAST_STOP_NAME'/);
  assert.match(config, /await deleteOfflineData\(false\);/);
});

test('GTFS fallback checks the previous service day for after-midnight trips', () => {
  const runtime = read('abfahrt.js');
  assert.match(runtime, /yesterday\.setDate\(yesterday\.getDate\(\) - 1\)/);
  assert.match(runtime, /const serviceDates = \[today, yesterday\]/);
});

test('user-facing pinned-stop terminology is consistent', () => {
  const runtime = read('abfahrt.js');
  const config = read('abfahrt-config.js');
  assert.match(config, /Angepinnte Haltestellen/);
  assert.match(runtime, /📌 Angepinnte Haltestellen/);
  assert.doesNotMatch(config, /Fixierte Haltestellen/);
  assert.doesNotMatch(runtime, /Fixierte Haltestellen/);
});


test('fullscreen uses dynamic status cards and keeps departure times fully visible', () => {
  const runtime = read('abfahrt.js');

  assert.match(runtime, /const realtimeAvailable = rows\.some/);
  assert.match(runtime, /const statusLabel = realtimeAvailable \? 'Live' : 'Fahrplan'/);
  assert.match(runtime, /platformValues\.length \+ ' Steige'/);
  assert.match(runtime, /const pinGlyph = activePin \? '★' : '☆'/);
  assert.ok(runtime.includes("value: (r) => fmtClock(r.at), cls: 'time'"));
  assert.match(runtime, /\.time \{[\s\S]*min-width: 68px/);
  assert.match(runtime, /class="line-badge"/);
  assert.match(runtime, /class="stop-card"/);
  assert.match(runtime, /@keyframes livePulse/);
});

test('fullscreen keeps destinations readable and honors configurable column proportions', () => {
  const runtime = read('abfahrt.js');
  const config = read('abfahrt-config.js');

  assert.ok(runtime.includes("value: (r) => r.destination || '–'"));
  assert.match(runtime, /const widthSum = defs\.reduce/);
  assert.match(runtime, /<colgroup>\$\{colgroup\}<\/colgroup>/);
  assert.match(runtime, /destination-wrap/);
  assert.match(runtime, /-webkit-line-clamp: \$\{destinationLines\}/);
  assert.match(runtime, /destinationWrap: true/);
  assert.match(runtime, /destinationLines: 2/);

  assert.match(config, /destinationWrap: true/);
  assert.match(config, /destinationLines: 2/);
  assert.match(config, /Richtung umbrechen:/);
  assert.match(config, /Max\. Richtungszeilen:/);
  assert.match(config, /Breitenwert ändern/);
});

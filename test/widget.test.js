const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const src = read('VagAbfahrten.js');

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
  ListWidget: class {
    constructor() { this.texts = []; }
    addText(t) { const el = { text: t }; this.texts.push(t); return el; }
    addStack() { return { layoutHorizontally() {}, addSpacer() {}, addText(t) { return { text: t }; } }; }
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
    'globalThis.__test = { rawParameter, parseParameter, buildWidget, buildNearbyRequest };',
  ),
  sandbox,
);
const T = sandbox.__test;

test('widget tap starts the integrated foreground flow', () => {
  const w = T.buildWidget('Test', null, [], 0, null, 'nearby');
  assert.equal(w.urlValue, 'scriptable:///run/VagAbfahrten');
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
  const source = read('VagAbfahrten.js');
  assert.match(source, /function buildStopEventRequest\(stopRef, key, resultLimit = 8\)/);
  assert.match(source, /NumberOfResults>\$\{Math\.max\(1, Math\.min\(30,/);
});

test('widget and config await iCloud config downloads', () => {
  const widget = read('VagAbfahrten.js');
  const config = read('VagAbfahrten-Config.js');
  assert.match(widget, /async function loadWidgetConfig\(\)/);
  assert.match(widget, /await fm\.downloadFileFromiCloud\(path\)/);
  assert.match(config, /async function loadConfig\(\)/);
  assert.match(config, /await fm\.downloadFileFromiCloud\(configPath\)/);
});

test('widget row slicing uses configured row count', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /slice\(0, Math\.max\(1, Math\.min\(8, Number\(WIDGET_CONFIG\.rows\)/);
  assert.doesNotMatch(source, /\.slice\(0, 5\);/);
});


test('runtime maps technical failures to user-facing errors', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /function friendlyError\(error\)/);
  assert.match(source, /TRIAS-Key wurde abgelehnt/);
  assert.match(source, /Keine Verbindung zu EFA-BW/);
  assert.match(source, /Antwort von EFA-BW konnte nicht gelesen werden/);
});

test('fullscreen failure shows last attempt time', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /Abfahrten nicht verfügbar/);
  assert.match(source, /Letzter Versuch:/);
});


test('widget tap uses the integrated foreground flow', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /return 'scriptable:\/\/\/run\/VagAbfahrten';/);
  assert.doesNotMatch(source, /VagAbfahrten\?action=select/);
});

test('location distance requires valid stop and device coordinates', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /if \(!Number\.isFinite\(stop\.latitude\) \|\| !Number\.isFinite\(stop\.longitude\)\) return null;/);
  assert.match(source, /if \(!Number\.isFinite\(location\?\.latitude\) \|\| !Number\.isFinite\(location\?\.longitude\)\) return null;/);
});

test('README describes the current two-script architecture', () => {
  const source = read('README.md');
  assert.match(source, /VagAbfahrten\.js.*Home Screen widget/);
  assert.match(source, /VagAbfahrten-Config\.js.*personal settings/);
  assert.match(source, /Retired helper scripts/);
});


test('GPS picker exposes pinned stops and shares the selection flow', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /picker\.addAction\('📌 Fixierte Haltestellen'\)/);
  assert.match(source, /pinnedPicker\.title = 'Fixierte Haltestellen'/);
  assert.ok(source.includes('selectedPin = orderedPinned[pinnedIdx]'));
  assert.match(source, /rememberStop\(\{ \.\.\.selected, name: selectedPin\?\.displayName \|\| selected\.name \}\)/);
  assert.match(source, /requestWidgetRefresh\(\);[\s\S]*await presentDeparturesTable\(key\);/);
});


test('Home superpin is exposed in runtime and fallback flow', () => {
  const source = read('VagAbfahrten.js');
  assert.match(source, /function homeStop\(/);
  assert.match(source, /stop\.home === true \? '🏠 '/);
  assert.match(source, /mode === 'home'/);
  assert.match(source, /Stattdessen wird 🏠 Home verwendet/);
});

test('config supports one Home stop and three fallback modes', () => {
  const source = read('VagAbfahrten-Config.js');
  assert.match(source, /Als Home festlegen/);
  assert.match(source, /Home entfernen/);
  assert.match(source, /fallbackMode: 'last'/);
  assert.match(source, /cfg\.location\.fallbackMode = 'home'/);
  assert.match(source, /cfg\.location\.fallbackMode = 'none'/);
});


test('updater compares remote and installed versions before installing', () => {
  const source = read('VagAbfahrten-Config.js');
  assert.ok(source.includes('compareVersions(remoteVersion, APP_VERSION)'));
  assert.ok(source.includes("!development && compareVersions(remoteVersion, APP_VERSION) <= 0"));
  assert.ok(source.includes("'Kein Update verfügbar'"));
  assert.ok(source.includes("confirm.title = development ? `Development ${source.label} installieren` : `Update v${remoteVersion} verfügbar`"));
  assert.ok(source.includes("!development && downloadedVersions[0] !== remoteVersion"));
});


test('Home keeps the configured stop display name', () => {
  const runtime = read('VagAbfahrten.js');
  const config = read('VagAbfahrten-Config.js');
  assert.ok(runtime.includes("(stop.home === true ? '🏠 ' : '📌 ') + (stop.displayName || stop.name)"));
  assert.ok(runtime.includes('name: home.displayName || home.name'));
  assert.ok(runtime.includes('name: selectedPin.displayName || selectedPin.name'));
  assert.ok(config.includes("(stop.home === true ? '🏠 ' : '📌 ') + (stop.displayName || stop.name)"));
});


test('updater resolves the latest GitHub Release and downloads that exact tag', () => {
  const source = read('VagAbfahrten-Config.js');
  assert.ok(source.includes("https://api.github.com/repos/ganfer/vag-widget/releases/latest"));
  assert.ok(source.includes("https://raw.githubusercontent.com/ganfer/vag-widget/"));
  assert.ok(source.includes("source = development ? await latestDevelopment() : await latestRelease()"));
  assert.ok(source.includes("const ref = development ? source.ref : source.tag"));
  assert.ok(source.includes("downloadUpdateFile(file, ref)"));
  assert.ok(!source.includes("raw.githubusercontent.com/ganfer/vag-widget/main/"));
});

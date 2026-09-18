const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'VagAbfahrten.js'), 'utf8');

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

test('widget tap preserves nearby parameter', () => {
  const w = T.buildWidget('Test', null, [], 0, null, 'nearby');
  assert.equal(w.urlValue, 'scriptable:///run/VagAbfahrten?parameter=nearby');
});

test('combined parameter is URL encoded', () => {
  const w = T.buildWidget('Test', null, [], 0, null, 'my key|nearby');
  assert.equal(w.urlValue, 'scriptable:///run/VagAbfahrten?parameter=my%20key%7Cnearby');
});

test('foreground run reads query parameter and key from Keychain', () => {
  sandbox.args.widgetParameter = '';
  sandbox.args.queryParameters = { parameter: 'nearby' };
  sandbox.Keychain.contains = () => true;
  sandbox.Keychain.get = () => 'key-from-keychain';

  assert.equal(T.rawParameter(), 'nearby');
  assert.deepEqual(T.parseParameter(), { key: 'key-from-keychain', nearby: true });
});

test('nearby request contains coordinates', () => {
  const xml = T.buildNearbyRequest(47.99, 7.85, 'key');
  assert.ok(xml.includes('<Latitude>47.99</Latitude>'));
  assert.ok(xml.includes('<Longitude>7.85</Longitude>'));
});

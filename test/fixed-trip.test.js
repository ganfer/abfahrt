const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'abfahrt.js'), 'utf8');
const keyName = 'ABFAHRT_FIXED_TRIP';

function keychain(values = new Map()) {
  return {
    contains: (key) => values.has(key),
    get: (key) => values.get(key),
    set: (key, value) => { values.set(key, value); },
    remove: (key) => { values.delete(key); },
  };
}

function fixedFns(store) {
  return new Function('Keychain',
    source.replace(/await main\(\);\s*$/,
      'return {fixedTrip, fixTrip, clearFixedTrip, isFixedTrip, renderTripProgressHTML};'),
  )(store);
}

function sample() {
  const now = Date.now();
  return {
    stopRef: 'de:08311:30100:0:1',
    journeyRef: 'journey-123',
    operatingDayRef: '2026-10-27',
    plannedTime: now + 5 * 60000, realtimeTime: null,
    line: '1', destination: 'Landwasser',
  };
}
function stops() {
  const at = Date.now() + 20 * 60000;
  return [{
    stopRef: 'de:08311:30200:0:1', name: 'Hauptbahnhof',
    plannedTime: at, at, realtime: false, cancelled: false,
    noAlighting: false, platform: '1',
  }];
}
async function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function launchFullscreen(store, {resumeFixed = false, failTrip = false} = {}) {
  class WebViewMock {
    constructor() {
      WebViewMock.current = this;
      this.html = '';
      this.calls = [];
    }
    async loadHTML(html) { this.html = html; }
    present() {
      return new Promise((resolve) => { this.dismiss = resolve; });
    }
    async evaluateJavaScript(script) {
      this.calls.push(script);
      return null;
    }
  }

  const deps = {
    Keychain: store,
    WebView: WebViewMock,
    Script: { complete() {} },
    events: [sample()],
    tripStops: stops(),
    resumeFixed,
    failTrip,
  };
  const code = source.replace(/await main\(\);\s*$/,
    "fetchDeparturesWithOffline = async () => {" +
    " if (deps.resumeFixed) throw new Error('Must not query boarding stop');" +
    " return deps.events;" +
    "};" +
    "loadTripInfoStops = async () => {" +
    " if (deps.failTrip) throw new Error('TRIAS unavailable');" +
    " return deps.tripStops;" +
    "};" +
    "return presentDeparturesTable('test-key', {resumeFixed: deps.resumeFixed});"
  );
  assert.notEqual(code, source);
  const run = new Function('deps', 'const {Keychain,WebView,Script}=deps;\n' + code);
  const running = run(deps);
  return {running, getWeb: () => WebViewMock.current};
}

test('a trip is pinned only on explicit action, survives relaunch, and contains no API key', () => {
  const values = new Map();
  const store = keychain(values);
  const api = fixedFns(store);
  const ride = sample();
  assert.equal(api.fixedTrip(), null);
  const saved = api.fixTrip(ride, 'Bertoldsbrunnen', stops());
  assert.equal(saved.journeyRef, 'journey-123');
  assert.equal(saved.originName, 'Bertoldsbrunnen');
  assert.ok(saved.expiresAt > Date.now());
  assert.ok(saved.expiresAt < Date.now() + 72 * 3600000);
  assert.equal(saved.line, '1');
  assert.equal(api.isFixedTrip(ride), true);
  assert.doesNotMatch(values.get(keyName), /requestorKey|TRIAS_REQUESTOR_REF|test-key/);
  assert.equal(fixedFns(store).fixedTrip().journeyRef, saved.journeyRef);
  api.clearFixedTrip();
  assert.equal(fixedFns(store).fixedTrip(), null);
});

test('a different fixed trip replaces the previous one, expired and corrupt data are discarded', () => {
  const values = new Map();
  const store = keychain(values);
  const api = fixedFns(store);
  const first = sample();
  api.fixTrip(first, 'Start', stops());
  const second = {...first, journeyRef: 'journey-456'};
  api.fixTrip(second, 'Start', stops());
  assert.equal(api.isFixedTrip(first), false);
  assert.equal(api.isFixedTrip(second), true);
  const expired = {...api.fixedTrip(), expiresAt: Date.now() - 1000};
  values.set(keyName, JSON.stringify(expired));
  assert.equal(api.fixedTrip(), null);
  assert.equal(store.contains(keyName), false);
  values.set(keyName, '{broken');
  assert.equal(api.fixedTrip(), null);
  assert.equal(store.contains(keyName), false);
});

test('journeys without usable references cannot be fixed', () => {
  const store = keychain();
  const api = fixedFns(store);
  assert.throws(() => api.fixTrip({...sample(), journeyRef: ''}, 'Start', stops()), /Fahrtreferenz/);
  assert.throws(() => api.fixTrip({...sample(), offline: true}, 'Start', stops()), /Fahrtreferenz/);
  assert.throws(() => api.fixTrip(sample(), 'Start', []), /Haltestellen/);
  assert.equal(api.fixedTrip(), null);
});

test('user can pin from a trip and reopen after the departure disappears from the stop board', async () => {
  const store = keychain();
  const first = launchFullscreen(store);
  await tick();
  let web = first.getWeb();
  assert.equal(web.calls.length, 0);
  assert.doesNotMatch(web.html, /id="trip-fixed-banner" class="trip-fixed-banner" >/);
  assert.equal(web.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/open/0'}), false);
  await tick();
  assert.ok(web.calls.some((x) => x.includes('window.abfahrtShowTrip')));
  assert.equal(web.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/pin'}), false);
  await tick();
  assert.equal(store.contains(keyName), true);
  assert.ok(web.calls.some((x) => x.includes('window.abfahrtSetFixedTrip')));
  web.dismiss();
  await first.running;

  const second = launchFullscreen(store, {resumeFixed: true});
  await tick();
  web = second.getWeb();
  assert.ok(web.html.includes('Fahrt fixiert'));
  assert.ok(web.html.includes('data-trip-action="unpin"'));
  assert.match(web.html, /<main id="abfahrt-board" hidden>/);
  assert.equal(web.calls.length, 0, 'resume must render before JS evaluation');
  assert.equal(web.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/unpin'}), false);
  await tick();
  assert.equal(store.contains(keyName), false);
  assert.ok(web.calls.some((x) => x.includes('window.abfahrtSetFixedTrip("")')));
  web.dismiss();
  await second.running;
});

test('a failed journey refresh still permits retry and unpin, without a black page', async () => {
  const store = keychain();
  fixedFns(store).fixTrip(sample(), 'Bertoldsbrunnen', stops());
  const session = launchFullscreen(store, {resumeFixed: true, failTrip: true});
  await tick();
  const web = session.getWeb();
  assert.ok(web.html.includes('Erneut versuchen'));
  assert.ok(web.html.includes('Fixierung lösen'));
  assert.match(web.html, /<main id="abfahrt-board" hidden>/);
  assert.equal(web.calls.length, 0);
  assert.equal(web.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/unpin'}), false);
  await tick();
  assert.equal(store.contains(keyName), false);
  web.dismiss();
  await session.running;
});

test('startup offers resume before GPS and uses blocked navigation rather than pending JS callback', () => {
  assert.match(source, /menu\.addAction\('Aktuelle Fahrt fortsetzen'\)/);
  assert.match(source, /await presentDeparturesTable\(key, \{ resumeFixed: true \}\)/);
  assert.match(source, /window\.location\.href = 'https:\/\/abfahrt-trip\.invalid\/'/);
  assert.doesNotMatch(source, /window\.abfahrtCommands/);
});

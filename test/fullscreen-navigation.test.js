const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'abfahrt.js'), 'utf8');

function startFullscreen({failTrip = false} = {}) {
  class WebViewMock {
    constructor() {
      WebViewMock.current = this;
      this.html = '';
      this.calls = [];
      this.presented = false;
    }
    async loadHTML(html) { this.html = html; }
    present() {
      this.presented = true;
      return new Promise((resolve) => { this.dismiss = resolve; });
    }
    async evaluateJavaScript(script) {
      this.calls.push(script);
      return null;
    }
  }
  const deps = {
    Keychain: { contains: () => false, get: () => '' },
    WebView: WebViewMock,
    Script: { complete() {} },
    events: [{
      stopRef: 'de:08311:30100:0:1',
      plannedTime: Date.now() + 12 * 60000,
      realtimeTime: null, line: '1', destination: 'Landwasser',
      platform: '1', cancelled: false, journeyRef: 'test-journey',
      operatingDayRef: '2026-10-27',
    }],
    tripStops: [{
      stopRef: 'de:08311:30200:0:1', name: 'Hauptbahnhof',
      plannedTime: Date.now() + 18 * 60000,
      at: Date.now() + 18 * 60000, realtime: false,
      cancelled: false, platform: '2', noAlighting: false,
    }],
    failTrip,
  };
  const modified = source.replace(
    /await main\(\);\s*$/,
    "fetchDeparturesWithOffline = async () => deps.events;" +
    "loadTripInfoStops = async () => {" +
    " if (deps.failTrip) throw new Error('Unavailable');" +
    " return deps.tripStops;" +
    "};" +
    "return presentDeparturesTable('test-key');",
  );
  assert.notEqual(modified, source, 'Scriptable bootstrap must be replaceable');
  const launch = new Function('deps', 'const {Keychain,WebView,Script}=deps;\n' + modified);
  const running = launch(deps);
  return { running, getInstance: () => WebViewMock.current };
}

async function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('fullscreen renders the previous stop board without a pending JS callback', async () => {
  const {running, getInstance} = startFullscreen();
  await tick();
  const instance = getInstance();
  assert.equal(instance.presented, true);
  assert.match(instance.html, /<main id="abfahrt-board">/);
  assert.match(instance.html, /Bertoldsbrunnen/);
  assert.match(instance.html, /<tbody>/);
  assert.equal(instance.calls.length, 0, 'must not evaluate JS before any user tap');
  assert.doesNotMatch(source, /window\.abfahrtCommands/);
  assert.doesNotMatch(source, /abfahrt:command/);
  instance.dismiss();
  await running;
});

test('tapping a departure is intercepted without leaving the WebView', async () => {
  const {running, getInstance} = startFullscreen();
  await tick();
  const instance = getInstance();
  assert.equal(instance.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/open/0'}), false);
  await tick();
  assert.ok(instance.calls.some((call) => call.includes('window.abfahrtShowLoading')));
  assert.ok(instance.calls.some((call) => call.includes('window.abfahrtShowTrip')));
  assert.equal(instance.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/back'}), false);
  await tick();
  assert.ok(instance.calls.some((call) => call.includes('window.abfahrtShowBoard')));
  instance.dismiss();
  await running;
});

test('API errors show a message rather than a blank page', async () => {
  const {running, getInstance} = startFullscreen({failTrip: true});
  await tick();
  const instance = getInstance();
  assert.equal(instance.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/open/0'}), false);
  await tick();
  assert.ok(instance.calls.some((call) => call.includes('window.abfahrtShowError')));
  assert.equal(instance.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/back'}), false);
  await tick();
  assert.ok(instance.calls.some((call) => call.includes('window.abfahrtShowBoard')));
  instance.dismiss();
  await running;
});

test('only internal event URLs are blocked', async () => {
  const {running, getInstance} = startFullscreen();
  await tick();
  const instance = getInstance();
  assert.equal(instance.shouldAllowRequest({url: 'about:blank'}), true);
  assert.equal(instance.shouldAllowRequest({url: 'https://example.com/'}), true);
  assert.equal(instance.shouldAllowRequest({url: 'https://abfahrt-trip.invalid/refresh'}), false);
  await tick();
  instance.dismiss();
  await running;
});

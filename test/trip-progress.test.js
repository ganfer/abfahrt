const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'abfahrt.js'), 'utf8');
const sandbox = { Date, Math, Promise, console, args: {widgetParameter: 'test-key', queryParameters: {}},
  config: {runsInWidget: true} };
vm.createContext(sandbox);
vm.runInContext(source.replace('await main();',
  'globalThis.tripTest = {buildTripInfoRequest, tripInfoStopsFromDoc, stopEventsFromDoc, renderTripProgressHTML};'
), sandbox);
const T = sandbox.tripTest;

function el(name, text = '', children = []) {
  return {name, textContent: text, children, attrs: {}};
}
function stamp(s) { return Date.parse(s); }
function call(ref, label, arrival, options = {}) {
  const nodes = [
    el('StopPointRef', ref), el('StopPointName', '', [el('Text', label)]),
    el('ServiceArrival', '', [
      el('TimetabledTime', arrival),
      ...(options.estimated ? [el('EstimatedTime', options.estimated)] : []),
    ]),
  ];
  if (options.departure) nodes.push(el('ServiceDeparture', '', [el('TimetabledTime', options.departure)]));
  if (options.cancelled) nodes.push(el('NotServicedStop', 'true'));
  if (options.noAlighting) nodes.push(el('NoAlightingAtStop', 'true'));
  return el(options.kind || 'OnwardCall', '', nodes);
}
const base = '2026-10-27T';
function response(calls) {
  return el('#document', '', [el('Trias', '', [
    el('ServiceDelivery', '', [el('DeliveryPayload', '', [
      el('TripInfoResponse', '', [el('TripInfoResult', '', calls)]),
    ])]),
  ])]);
}
const selected = {
  stopRef: 'de:08311:30100:0:1',
  plannedTime: stamp(base + '13:30:00Z'),
  realtimeTime: stamp(base + '13:32:00Z'),
  line: '1',
  destination: 'Landwasser',
  journeyRef: 'journey-123',
  operatingDayRef: '2026-10-27',
};

test('TripInfoRequest is tied to the selected journey and operating day, with XML escaping', () => {
  const xml = T.buildTripInfoRequest('route&ride<123', '2026-10-27', 'key<&');
  assert.match(xml, /<TripInfoRequest>/);
  assert.match(xml, /<JourneyRef>route&amp;ride&lt;123<\/JourneyRef>/);
  assert.match(xml, /<OperatingDayRef>2026-10-27<\/OperatingDayRef>/);
  assert.match(xml, /<IncludeCalls>true<\/IncludeCalls>/);
  assert.match(xml, /<UseTimetabledDataOnly>false<\/UseTimetabledDataOnly>/);
  assert.match(xml, /<siri:RequestorRef>key&lt;&amp;<\/siri:RequestorRef>/);
});

test('TripInfo skips earlier stops and the boarding stop, preserves onward order and individual arrival times', () => {
  const calls = [
    call('old', 'Frühere Haltestelle', base + '13:20:00Z', {kind:'PreviousCall'}),
    call(selected.stopRef, 'Bertoldsbrunnen', base + '13:30:00Z', {
      departure: base + '13:30:00Z', kind:'PreviousCall',
    }),
    call('s2', 'Hauptbahnhof', base + '13:36:00Z', {estimated: base + '13:39:00Z'}),
    call('s3', 'Eschholzstraße', base + '13:40:00Z', {noAlighting:true}),
    call('s4', 'Landwasser', base + '13:55:00Z', {cancelled:true}),
  ];
  const stops = T.tripInfoStopsFromDoc(response(calls), selected);
  assert.deepEqual(Array.from(stops, x => x.name), ['Hauptbahnhof', 'Eschholzstraße', 'Landwasser']);
  assert.equal(stops[0].at, stamp(base + '13:39:00Z'));
  assert.equal(stops[1].at, stamp(base + '13:40:00Z'));
  assert.equal(stops[1].realtime, false);
  assert.equal(stops[1].noAlighting, true);
  assert.equal(stops[2].cancelled, true);
});

test('repeated platform reference after boarding is retained on circular routes', () => {
  const calls = [
    call(selected.stopRef, 'Bertoldsbrunnen', base + '13:30:00Z', {departure:base + '13:30:00Z'}),
    call('another', 'Hauptbahnhof', base + '13:33:00Z'),
    call(selected.stopRef, 'Bertoldsbrunnen', base + '14:20:00Z', {departure:base + '14:20:00Z'}),
  ];
  const stops = T.tripInfoStopsFromDoc(response(calls), selected);
  assert.deepEqual(Array.from(stops, x => x.name), ['Hauptbahnhof', 'Bertoldsbrunnen']);
});

test('when the provider sends only OnwardCalls, past stops are discarded', () => {
  const calls = [
    call('before', 'Vergangenheit', base + '13:15:00Z'),
    call('after', 'Nächster Halt', base + '13:34:00Z'),
  ];
  const stops = T.tripInfoStopsFromDoc(response(calls), selected);
  assert.deepEqual(Array.from(stops, x => x.name), ['Nächster Halt']);
});

test('detail view renders both absolute arrival times and countdown hooks; text is escaped', () => {
  const calls = [
    call('s2', '<script>alert(1)</script>', base + '13:35:00Z', {estimated:base + '13:38:00Z'}),
    call('s3', 'Später', base + '13:45:00Z', {cancelled:true}),
  ];
  const html = T.renderTripProgressHTML(selected, T.tripInfoStopsFromDoc(response(calls), selected), 'Bertoldsbrunnen');
  assert.match(html, /data-arrival-ms="/);
  assert.match(html, /Plan \d\d:35/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /entfällt/);
  assert.match(html, /data-trip-action="back"/);
  assert.match(html, /data-trip-action="refresh"/);
});

test('fullscreen uses a lazily invoked native WebView bridge; widgets remain unmodified', () => {
  assert.match(source, /data-trip-index/);
  assert.match(source, /await loadTripInfoStops\(selectedRow, key\)/);
  assert.match(source, /web\.evaluateJavaScript\(/);
  assert.match(source, /window\.abfahrtShowTrip/);
  assert.match(source, /const events = await fetchDeparturesWithOffline\(stopRefs, key/);
  assert.doesNotMatch(source, /function buildStopEventRequest[\s\S]*?<IncludeOnwardCalls>true/);
});

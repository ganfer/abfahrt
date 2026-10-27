const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

test('normal-trip preview reuses the Scriptable view and is deterministic', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abfahrt-trip-preview-'));
  try {
    const output = path.join(tmp, 'trip.html');
    const render = () => {
      execFileSync(process.execPath, [
        path.join(root, 'scripts/render-widget-preview.mjs'),
        '--variant', 'trip-normal',
        '--output', output,
      ], { cwd: root, env: { ...process.env, TZ: 'Europe/Berlin' } });
      return fs.readFileSync(output, 'utf8');
    };

    const first = render();
    const second = render();
    assert.equal(first, second, 'same data and code must produce same HTML');
    assert.match(first, /Fahrtverlauf/);
    assert.match(first, /data-trip-action="pin"/);
    assert.match(first, /Fahrt fixieren/);
    assert.doesNotMatch(first, /data-trip-action="unpin"/);
    assert.match(first, /Bertoldsbrunnen/);
    assert.match(first, /Hauptbahnhof/);
    assert.match(first, /12:50 Uhr/);
    assert.match(first, /8 min/);
    assert.match(first, /Plan 12:47/);
    assert.match(first, /430px/);
    assert.match(first, /932px/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

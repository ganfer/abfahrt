const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const managed = ['VagAbfahrten.js', 'VagAbfahrten-Config.js', 'VagAbfahrten-Init.js'];
function version(source) {
  const match = source.match(/const APP_VERSION = ['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}
test('all managed scripts use the same semantic version', () => {
  const versions = managed.map((file) => [file, version(read(file))]);
  for (const pair of versions) {
    assert.ok(pair[1], pair[0] + ' must define APP_VERSION');
    assert.match(pair[1], /^\d+\.\d+\.\d+$/, pair[0] + ' must use x.y.z versioning');
  }
  assert.equal(new Set(versions.map((pair) => pair[1])).size, 1);
});
test('installer manages the current runtime and config scripts', () => {
  const installer = read('VagAbfahrten-Init.js');
  assert.match(installer, /VagAbfahrten\.js/);
  assert.match(installer, /VagAbfahrten-Config\.js/);
  assert.doesNotMatch(installer, /VagAbfahrten-Display\.js/);
  assert.doesNotMatch(installer, /VagAbfahrten-Refresh\.js/);
});
test('config updater validates versioned managed files', () => {
  const config = read('VagAbfahrten-Config.js');
  assert.match(config, /const UPDATE_FILES = \[/);
  assert.match(config, /VagAbfahrten\.js/);
  assert.match(config, /VagAbfahrten-Config\.js/);
  assert.match(config, /const APP_VERSION = '/);
  assert.match(config, /file\.markers\.every/);
});
test('README Development version matches scripts', () => {
  const runtimeVersion = version(read('VagAbfahrten.js'));
  const escaped = runtimeVersion.split('.').join('\\.');
  assert.match(read('README.md'), new RegExp('Development version: v' + escaped));
});


test('GTFS workflow compares normalized upstream timestamps and builder schema', () => {
  const workflow = read('.github/workflows/gtfs-data.yml');
  assert.match(workflow, /RAW=.*GTFS_IMPORT_STATUS_URL/s);
  assert.match(workflow, /json\.loads\(s\)/);
  assert.match(workflow, /EXPECTED_SCHEMA=.*awk -F=/);
  assert.doesNotMatch(workflow, /re\.search\(r"\^SCHEMA_VERSION\\\\s/);
});

test('offline documentation describes the implemented fallback, not future groundwork', () => {
  const readme = read('README.md');
  const gtfs = read('docs/GTFS.md');
  assert.match(readme, /## Offline timetable fallback/);
  assert.doesNotMatch(readme, /future offline fallback/);
  assert.match(gtfs, /pinned stops and\/or recent-stop history/);
  assert.match(gtfs, /parent_station.*additional alias/s);
});

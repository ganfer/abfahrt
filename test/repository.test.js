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

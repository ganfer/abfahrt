const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const managed = ['VagAbfahrten.js', 'VagAbfahrten-Config.js'];
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
test('bootstrap installer is versionsless and Stable-first', () => {
  const installer = read('VagAbfahrten-Install.js');
  assert.doesNotMatch(installer, /const APP_VERSION =/);
  assert.match(installer, /releases\/latest/);
  assert.match(installer, /VagAbfahrten-Config\.js/);
  assert.match(installer, /VAG_PENDING_INSTALL_REF/);
  assert.match(installer, /Compatibility bridge/);
});

test('config owns the managed installation lifecycle', () => {
  const config = read('VagAbfahrten-Config.js');
  assert.match(config, /const MANAGED_FILES = \[/);
  assert.match(config, /const MANAGED_KEYCHAIN_KEYS = \[/);
  assert.match(config, /const INSTALLER_FILE_NAMES = \[/);
  assert.match(config, /VagAbfahrten\.js/);
  assert.match(config, /VagAbfahrten-Config\.js/);
  assert.match(config, /downloadManagedFiles/);
  assert.match(config, /release-manifest\.json/);
  assert.match(config, /sha256Hex/);
  assert.match(config, /file\.markers\.every/);
});

test('obsolete helper and legacy installer are not part of the repository architecture', () => {
  assert.equal(fs.existsSync(path.join(root, 'VagAbfahrten-Refresh.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'VagAbfahrten-Init.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'VagAbfahrten-Install.js')), true);
});

test('README Development version matches scripts', () => {
  const runtimeVersion = version(read('VagAbfahrten.js'));
  const escaped = runtimeVersion.split('.').join('\\.');
  assert.match(read('README.md'), new RegExp('Development version: v' + escaped));
});

test('README and screenshot workflow keep the preview contract', () => {
  const readme = read('README.md');
  const workflow = read('.github/workflows/widget-screenshot.yml');
  const renderer = read('scripts/render-widget-preview.mjs');

  assert.match(readme, /docs\/assets\/widget-preview\.png/);
  assert.equal(fs.existsSync(path.join(root, 'docs/assets/widget-preview.png')), true);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /browser-actions\/setup-chrome@v2/);
  assert.match(workflow, /docs\/assets\/widget-preview\.png/);
  const triggerSection = workflow.split('\npermissions:')[0];
  assert.doesNotMatch(triggerSection, /docs\/assets\/widget-preview\.png/, 'generated screenshot must not retrigger its own workflow');
  assert.match(renderer, /extractObject\('DEFAULT_WIDGET_CONFIG'\)/);
});

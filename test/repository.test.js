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
  assert.doesNotMatch(installer, /^const APP_VERSION\s*=/m);
  assert.match(installer, /releases\/latest/);
  assert.match(installer, /VagAbfahrten-Config\.js/);
  assert.match(installer, /VAG_PENDING_INSTALL_REF/);
  assert.match(installer, /Compatibility bridge/);
});

test('README quick installer stays copy-pasteable in Scriptable', () => {
  const installer = read('VagAbfahrten-Install.js');
  const readme = read('README.md');
  const oneLine = 'await eval(await new Request("https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten-Install.js").loadString())';

  assert.match(installer, /\(async \(\) => \{/);
  assert.doesNotMatch(installer, /^await main\(\);$/m);
  assert.ok(readme.includes(oneLine));
  for (const file of [
    'docs/assets/install/scriptable-01-new-script.svg',
    'docs/assets/install/scriptable-02-paste.svg',
    'docs/assets/install/scriptable-03-run.svg',
    'docs/assets/install/scriptable-04-finished.svg',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file + ' must exist');
    assert.ok(readme.includes(file), file + ' must be referenced by README');
  }
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

test('GTFS workflow rebuilds when the builder changes in a push', () => {
  const workflow = read('.github/workflows/gtfs-data.yml');
  assert.match(workflow, /BEFORE: \$\{\{ github\.event\.before \}\}/);
  assert.match(workflow, /BUILDER_CHANGED=false/);
  assert.match(workflow, /git diff --quiet "\$BEFORE" "\$GITHUB_SHA" -- scripts\/build-gtfs\.py/);
  assert.match(workflow, /builderChanged=\$BUILDER_CHANGED/);
});

test('release workflow creates checksummed Stable metadata before tagging', () => {
  const workflow = read('.github/workflows/release.yml');
  assert.match(workflow, /release-manifest\.json/);
  assert.match(workflow, /createHash\('sha256'\)/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /--target "\$TARGET"/);
  assert.doesNotMatch(workflow, /--target "\$GITHUB_SHA"/);
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

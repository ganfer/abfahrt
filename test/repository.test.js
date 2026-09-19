const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const managed = ['abfahrt.js', 'abfahrt-config.js'];
function version(source) {
  const match = source.match(/const APP_VERSION = ['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}
test('project uses the hard abfahrt identity without legacy application names', () => {
  const rootFiles = fs.readdirSync(root);
  assert.equal(rootFiles.includes('abfahrt.js'), true);
  assert.equal(rootFiles.includes('abfahrt-config.js'), true);
  assert.equal(rootFiles.includes('abfahrt-install.js'), true);
  assert.equal(rootFiles.some((name) => /^VagAbfahrten(?:-|\.|$)/.test(name)), false);

  const sources = [
    read('abfahrt.js'),
    read('abfahrt-config.js'),
    read('abfahrt-install.js'),
    read('README.md'),
  ].join('\n');
  assert.doesNotMatch(sources, /VagAbfahrten|ganfer\/vag-widget|\bVAG_[A-Z_]+/);
  assert.match(sources, /ganfer\/abfahrt/);
  assert.match(sources, /ABFAHRT_TRIAS_REQUESTOR_REF/);
});

test('all managed scripts use the same semantic version', () => {
  const versions = managed.map((file) => [file, version(read(file))]);
  for (const pair of versions) {
    assert.ok(pair[1], pair[0] + ' must define APP_VERSION');
    assert.match(pair[1], /^\d+\.\d+\.\d+$/, pair[0] + ' must use x.y.z versioning');
  }
  assert.equal(new Set(versions.map((pair) => pair[1])).size, 1);
});
test('bootstrap installer is versionsless and Stable-first', () => {
  const installer = read('abfahrt-install.js');
  assert.doesNotMatch(installer, /^const APP_VERSION\s*=/m);
  assert.match(installer, /releases\/latest/);
  assert.match(installer, /abfahrt-config\.js/);
  assert.match(installer, /ABFAHRT_PENDING_INSTALL_REF/);
  assert.match(installer, /aktuellen abfahrt-Produktlinie/);
  assert.doesNotMatch(installer, /Compatibility bridge|kompatiblen Bootstrap-Fallback/);
});

test('README quick installer stays copy-pasteable in Scriptable', () => {
  const installer = read('abfahrt-install.js');
  const readme = read('README.md');
  const oneLine = 'await eval(await new Request("https://raw.githubusercontent.com/ganfer/abfahrt/main/abfahrt-install.js").loadString())';

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
  const config = read('abfahrt-config.js');
  assert.match(config, /const MANAGED_FILES = \[/);
  assert.match(config, /const MANAGED_KEYCHAIN_KEYS = \[/);
  assert.match(config, /const INSTALLER_FILE_NAMES = \[/);
  assert.match(config, /abfahrt\.js/);
  assert.match(config, /abfahrt-config\.js/);
  assert.match(config, /downloadManagedFiles/);
  assert.match(config, /release-manifest\.json/);
  assert.match(config, /sha256Hex/);
  assert.match(config, /file\.markers\.every/);
});

test('obsolete helper and legacy installer are not part of the repository architecture', () => {
  assert.equal(fs.existsSync(path.join(root, 'abfahrt-refresh.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'abfahrt-init.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'abfahrt-install.js')), true);
});

test('README Development version matches scripts', () => {
  const runtimeVersion = version(read('abfahrt.js'));
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

test('release workflow creates checksummed Stable metadata without bypassing protected main', () => {
  const workflow = read('.github/workflows/release.yml');
  assert.match(workflow, /release-manifest\.json/);
  assert.match(workflow, /createHash\('sha256'\)/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /--target "\$TARGET"/);
  assert.match(workflow, /RELEASE_BRANCH="release\/v\$VERSION"/);
  assert.match(workflow, /gh pr create/);
  assert.doesNotMatch(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /--target "\$GITHUB_SHA"/);
});

test('screenshot workflow updates protected main through a pull request', () => {
  const workflow = read('.github/workflows/widget-screenshot.yml');
  assert.match(workflow, /BRANCH="automation\/widget-screenshot"/);
  assert.match(workflow, /gh pr create/);
  assert.doesNotMatch(workflow, /^\s*git push\s*$/m);
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
  assert.match(workflow, /::warning::The refreshed screenshot was pushed to \$BRANCH/);
  assert.match(workflow, /Allow GitHub Actions to create and approve pull requests/);
  const triggerSection = workflow.split('\npermissions:')[0];
  assert.doesNotMatch(triggerSection, /docs\/assets\/widget-preview\.png/, 'generated screenshot must not retrigger its own workflow');
  assert.match(renderer, /extractObject\('DEFAULT_WIDGET_CONFIG'\)/);
  assert.match(renderer, /widget-header/);
  assert.match(renderer, /widget-topline/);
  assert.match(renderer, /widget-meta/);
  assert.doesNotMatch(renderer, /chip live/);
  assert.doesNotMatch(renderer, /Tippen für Details/);
  assert.match(renderer, /departure-row\$\{index === 0 \? ' featured' : ''\}/);
  assert.match(renderer, /departure: '12:45'/);
  assert.doesNotMatch(renderer, /departure: '12:45 ·'/);
});

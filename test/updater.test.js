const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'Abfahrt-Config.js'), 'utf8');

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, name + ' must exist');
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Could not extract ' + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extractFunction('compareVersions') +
  '\n' + extractFunction('versionFromSource') +
  '\n' + extractFunction('sha256Hex') +
  '\nglobalThis.__test = { compareVersions, versionFromSource, sha256Hex };',
  sandbox,
);
const T = sandbox.__test;

test('semantic version comparison handles newer, older and equivalent versions', () => {
  assert.ok(T.compareVersions('1.0.14', '1.0.13') > 0);
  assert.ok(T.compareVersions('1.1.0', '1.0.99') > 0);
  assert.ok(T.compareVersions('2.0.0', '10.0.0') < 0);
  assert.equal(T.compareVersions('1.0.13', '1.0.13'), 0);
  assert.equal(T.compareVersions('1.0', '1.0.0'), 0);
});

test('version extraction reads managed script versions and rejects unrelated source', () => {
  assert.equal(T.versionFromSource("const APP_VERSION = '1.2.3';"), '1.2.3');
  assert.equal(T.versionFromSource('const OTHER = 1;'), null);
});

test('release checksum helper produces standard SHA-256', () => {
  assert.equal(
    T.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('Development updater persists and compares exact commit provenance', () => {
  assert.match(source, /const DEVELOPMENT_REF_KEY = 'ABFAHRT_DEVELOPMENT_REF'/);
  assert.match(source, /installedDevelopmentRef === source\.ref/);
  assert.match(source, /Keychain\.set\(DEVELOPMENT_REF_KEY, source\.ref\)/);
  assert.match(source, /Keychain\.remove\(DEVELOPMENT_REF_KEY\)/);
});

test('Stable updater requires version, manifest validation and complete managed installation', () => {
  assert.match(source, /compareVersions\(remoteVersion, APP_VERSION\) <= 0 && stableInstallComplete/);
  assert.match(source, /managedInstallMatches\(remoteVersion\)/);
  assert.match(source, /downloadReleaseManifest\(source\.tag, remoteVersion\)/);
  assert.match(source, /downloadManagedFiles\(ref, development \? null : remoteVersion, manifest\)/);
  assert.match(source, /SHA-256-Prüfung/);
});

test('successful update relaunches Config so newly written code becomes active', () => {
  assert.match(source, /function relaunchConfig\(\)/);
  assert.match(source, /scriptable:\/\/\/run\?scriptName=/);
  assert.match(source, /relaunchConfig\(\);/);
});

test('Recovery bypasses channel selection and resolves exact main commit', () => {
  assert.match(source, /async function recoverFromMain\(\)/);
  assert.match(source, /const source = await latestDevelopment\(\)/);
  assert.match(source, /downloadManagedFiles\(source\.ref\)/);
  assert.match(source, /Recovery · Installation reparieren/);
});

test('pending bootstrap installation is completed by Config', () => {
  assert.match(source, /async function completePendingInstall\(\)/);
  assert.match(source, /PENDING_INSTALL_REF_KEY/);
  assert.match(source, /removeInstallerFiles\(\)/);
  assert.match(source, /clearPendingInstallState\(\)/);
});

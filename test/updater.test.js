const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'VagAbfahrten-Config.js'), 'utf8');

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
  '\nglobalThis.__test = { compareVersions, versionFromSource };',
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

test('Development updater persists and compares exact commit provenance', () => {
  assert.match(source, /const DEVELOPMENT_REF_KEY = 'VAG_DEVELOPMENT_REF'/);
  assert.match(source, /installedDevelopmentRef === source\.ref/);
  assert.match(source, /Keychain\.set\(DEVELOPMENT_REF_KEY, source\.ref\)/);
  assert.match(source, /Keychain\.remove\(DEVELOPMENT_REF_KEY\)/);
});

test('Stable updater requires both version and complete managed installation', () => {
  assert.match(source, /compareVersions\(remoteVersion, APP_VERSION\) <= 0 && stableInstallComplete/);
  assert.match(source, /managedInstallMatches\(remoteVersion\)/);
  assert.match(source, /downloadedVersions\[0\] !== remoteVersion/);
});

test('successful update relaunches Config so newly written code becomes active', () => {
  assert.match(source, /function relaunchConfig\(\)/);
  assert.match(source, /scriptable:\/\/\/run\?scriptName=/);
  assert.match(source, /relaunchConfig\(\);/);
});

test('Recovery bypasses channel selection and resolves exact main commit', () => {
  assert.match(source, /async function recoverFromMain\(\)/);
  assert.match(source, /const source = await latestDevelopment\(\)/);
  assert.match(source, /downloadUpdateFile\(file, source\.ref\)/);
  assert.match(source, /Recovery · Installation reparieren/);
});

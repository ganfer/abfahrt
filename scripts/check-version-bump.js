const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const VERSION_FILES = [
  'VagAbfahrten.js',
  'VagAbfahrten-Config.js',
];
const UPDATE_RELEVANT = VERSION_FILES;

function parseVersion(source, label) {
  const match = source.match(/const APP_VERSION = ['"]([^'"]+)['"]/);
  if (!match) throw new Error(`APP_VERSION fehlt in ${label}`);
  return match[1];
}

function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

const current = VERSION_FILES.map((file) => ({
  file,
  version: parseVersion(fs.readFileSync(file, 'utf8'), file),
}));
const versions = new Set(current.map((entry) => entry.version));
if (versions.size !== 1) {
  console.error('Versionsnummern stimmen nicht überein:');
  for (const entry of current) console.error(`  ${entry.file}: ${entry.version}`);
  process.exit(1);
}

const version = current[0].version;
const readme = fs.readFileSync('README.md', 'utf8');
const developmentLine = readme.split('\n').find((line) => line.includes('Development version:'));
const developmentVersion = developmentLine?.match(/v(\d+\.\d+\.\d+)/)?.[1];
if (developmentVersion !== version) {
  console.error(`README Development version (${developmentVersion || 'fehlt'}) stimmt nicht mit APP_VERSION v${version} überein.`);
  process.exit(1);
}
const stableLine = readme.split('\n').find((line) => line.includes('Stable version:'));
if (!stableLine || !/v\d+\.\d+\.\d+/.test(stableLine)) {
  console.error('README Stable version fehlt oder ist ungültig.');
  process.exit(1);
}

const baseRef = process.env.BASE_REF;
if (!baseRef) {
  console.log(`Versionen konsistent: v${version}. Kein PR-Basis-Ref, Versions-Bump-Prüfung übersprungen.`);
  process.exit(0);
}

let changed;
try {
  changed = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...HEAD`], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
} catch (error) {
  console.error('Geänderte Dateien konnten nicht gegen den Basis-Branch ermittelt werden.');
  throw error;
}

if (!changed.some((file) => UPDATE_RELEVANT.includes(file))) {
  console.log('Keine updater-relevanten Runtime-Dateien geändert; kein Versions-Bump erforderlich.');
  process.exit(0);
}

const baseSource = execFileSync('git', ['show', `origin/${baseRef}:VagAbfahrten.js`], { encoding: 'utf8' });
const baseVersion = parseVersion(baseSource, `origin/${baseRef}:VagAbfahrten.js`);
if (compareVersions(version, baseVersion) <= 0) {
  console.error('Version bump required:');
  console.error(`  ${baseRef}: v${baseVersion}`);
  console.error(`  PR:   v${version}`);
  console.error('Updater-relevante Dateien wurden geändert. APP_VERSION vor dem Merge erhöhen.');
  process.exit(1);
}

console.log(`Versions-Bump gültig: v${baseVersion} -> v${version}`);

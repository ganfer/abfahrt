const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const VERSION_FILES = ['VagAbfahrten.js', 'VagAbfahrten-Config.js', 'VagAbfahrten-Init.js'];
const UPDATE_RELEVANT = VERSION_FILES;

function version(source, label) {
  const match = source.match(/const APP_VERSION = ['"](\d+)\.(\d+)\.(\d+)['"]/);
  if (!match) throw new Error(`APP_VERSION fehlt in ${label}`);
  return { text: match[0], major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

const baseRef = process.env.BASE_REF;
if (!baseRef) {
  console.log('Kein PR-Basis-Ref; automatischer Versions-Bump übersprungen.');
  process.exit(0);
}

const changed = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...HEAD`], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
if (!changed.some((file) => UPDATE_RELEVANT.includes(file))) {
  console.log('Keine updater-relevanten Runtime-Dateien geändert; kein Versions-Bump erforderlich.');
  process.exit(0);
}

const baseSource = execFileSync('git', ['show', `origin/${baseRef}:VagAbfahrten.js`], { encoding: 'utf8' });
const base = version(baseSource, `origin/${baseRef}:VagAbfahrten.js`);
const next = `${base.major}.${base.minor}.${base.patch + 1}`;

for (const file of VERSION_FILES) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/const APP_VERSION = ['"]\d+\.\d+\.\d+['"]/.test(source)) throw new Error(`APP_VERSION fehlt in ${file}`);
  fs.writeFileSync(file, source.replace(/const APP_VERSION = ['"]\d+\.\d+\.\d+['"]/, `const APP_VERSION = '${next}'`));
}

const readme = fs.readFileSync('README.md', 'utf8');
const currentMatch = readme.match(/Current version:\s*\*\*v(\d+\.\d+\.\d+)\*\*/i);
if (!currentMatch) throw new Error('README current version konnte nicht gefunden werden.');
fs.writeFileSync('README.md', readme.replace(currentMatch[0], currentMatch[0].replace(currentMatch[1], next)));

console.log(`Automatischer Versions-Bump: v${base.major}.${base.minor}.${base.patch} -> v${next}`);

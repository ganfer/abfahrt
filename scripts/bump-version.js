const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const VERSION_FILES = ['VagAbfahrten.js', 'VagAbfahrten-Config.js'];
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
const current = version(fs.readFileSync('VagAbfahrten.js', 'utf8'), 'VagAbfahrten.js');
const automatic = `${base.major}.${base.minor}.${base.patch + 1}`;
const manuallyBumped = current.major > base.major || current.minor > base.minor || (current.major === base.major && current.minor === base.minor && current.patch > base.patch);
const next = manuallyBumped ? `${current.major}.${current.minor}.${current.patch}` : automatic;

for (const file of VERSION_FILES) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/const APP_VERSION = ['"]\d+\.\d+\.\d+['"]/.test(source)) throw new Error(`APP_VERSION fehlt in ${file}`);
  fs.writeFileSync(file, source.replace(/const APP_VERSION = ['"]\d+\.\d+\.\d+['"]/, `const APP_VERSION = '${next}'`));
}

const readme = fs.readFileSync('README.md', 'utf8');
const developmentLine = readme.split('\n').find((line) => line.includes('Development version:'));
if (!developmentLine) throw new Error('README Development version konnte nicht gefunden werden.');
const readmeVersion = developmentLine.match(/v(\d+\.\d+\.\d+)/);
if (!readmeVersion) throw new Error('README Development version konnte nicht gelesen werden.');
if (readmeVersion[1] !== next) {
  const updatedLine = developmentLine.replace(`v${readmeVersion[1]}`, `v${next}`);
  fs.writeFileSync('README.md', readme.replace(developmentLine, updatedLine));
}

console.log(manuallyBumped ? `Manueller Versions-Bump beibehalten: v${base.major}.${base.minor}.${base.patch} -> v${next}` : `Automatischer Versions-Bump: v${base.major}.${base.minor}.${base.patch} -> v${next}`);

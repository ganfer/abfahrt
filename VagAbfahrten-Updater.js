// Variables used by Scriptable: icon-color: blue; icon-glyph: cloud-download-alt;
//
// Updates VagAbfahrten.js, the config assistant and this updater from GitHub main.
//
// Run this script manually in Scriptable whenever you want to install the
// current GitHub version. The existing local script is only replaced after
// the download has passed basic validation.

const MANIFEST_URL = 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten-Updater.js';

const FILES = [
  {
    url: 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten.js',
    name: 'VagAbfahrten.js',
    marker: "const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';",
  },
  {
    url: 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten-Display.js',
    name: 'VagAbfahrten-Display.js',
    marker: "const DISPLAY_CONFIG_DEFAULTS =",
  },
  {
    url: 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten-Config.js',
    name: 'VagAbfahrten-Config.js',
    marker: "const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';",
  },
  {
    url: 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten-Updater.js',
    name: 'VagAbfahrten-Updater.js',
    marker: 'const FILES = [',
  },
];

function targetFileManager() {
  // VagAbfahrten stores its TRIAS key in Keychain, so replacing the script file
  // does not affect the saved key or selected stop.
  return FileManager.iCloud();
}

async function show(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction('OK');
  await alert.present();
}

async function downloadSource(file) {
  const req = new Request(file.url);
  req.timeoutInterval = 15;
  req.headers = { Accept: 'text/plain', 'Cache-Control': 'no-cache' };
  const source = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error(`${file.name}: GitHub HTTP ${status || '?'}`);
  if (source.length < 500) throw new Error(`${file.name}: Download ist unerwartet klein.`);
  if (!source.includes(file.marker) || !source.includes('await main();')) {
    throw new Error(`${file.name}: Download konnte nicht validiert werden.`);
  }
  return source;
}


function filesFromUpdaterSource(source) {
  // Evaluate only the literal FILES array from the trusted updater source.
  // This lets an older updater discover files added by a newer release in
  // the same run, without executing the downloaded updater itself.
  const start = source.indexOf('const FILES = [');
  if (start < 0) throw new Error('Updater-Manifest fehlt.');
  const arrayStart = source.indexOf('[', start);
  const endMarker = '\n];';
  const arrayEnd = source.indexOf(endMarker, arrayStart);
  if (arrayEnd < 0) throw new Error('Updater-Manifest ist unvollständig.');
  const literal = source.slice(arrayStart, arrayEnd + 2);
  const parsed = Function('"use strict"; return (' + literal + ');')();
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('Updater-Manifest ist leer.');
  for (const file of parsed) {
    if (!file || typeof file.url !== 'string' || typeof file.name !== 'string' || typeof file.marker !== 'string') {
      throw new Error('Updater-Manifest enthält einen ungültigen Eintrag.');
    }
    if (!file.url.startsWith('https://raw.githubusercontent.com/ganfer/vag-widget/main/')) {
      throw new Error('Updater-Manifest enthält eine unerwartete Quelle.');
    }
  }
  return parsed;
}

async function currentFilesManifest() {
  const req = new Request(MANIFEST_URL);
  req.timeoutInterval = 15;
  req.headers = { Accept: 'text/plain', 'Cache-Control': 'no-cache' };
  const source = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error(`Updater-Manifest: GitHub HTTP ${status || '?'}`);
  return filesFromUpdaterSource(source);
}

async function main() {
  const fm = targetFileManager();

  try {
    // Always read the current updater manifest from GitHub first. An older
    // installed updater can therefore discover newly added managed scripts
    // immediately, instead of requiring a second updater run.
    const files = await currentFilesManifest();
    const downloads = [];
    for (const file of files) {
      downloads.push({ file, source: await downloadSource(file) });
    }

    for (const item of downloads) {
      const target = fm.joinPath(fm.documentsDirectory(), item.file.name);
      fm.writeString(target, item.source);
    }

    await show(
      'VAG Widget aktualisiert',
      `${downloads.length} Skripte wurden aus dem aktuellen GitHub-Manifest aktualisiert.\n\n${downloads.map((item) => '• ' + item.file.name).join('\n')}\n\nDeine VagAbfahrten.config.json bleibt unverändert.`,
    );
  } catch (e) {
    await show(
      'Update fehlgeschlagen',
      `Die vorhandenen Skripte wurden nicht verändert.\n\n${e.message}`,
    );
  }

  Script.complete();
}

await main();

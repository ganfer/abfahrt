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

function targetFileManagers(fileName) {
  // Scriptable can store scripts either in iCloud Drive or "On My iPhone".
  // Update the iCloud copy (our default) and any existing local duplicate so
  // the user cannot accidentally keep launching a stale script with the same name.
  const cloud = FileManager.iCloud();
  const local = FileManager.local();
  const targets = [{ label: 'iCloud', fm: cloud }];

  const localPath = local.joinPath(local.documentsDirectory(), fileName);
  if (local.fileExists(localPath)) targets.push({ label: 'Lokal', fm: local });
  return targets;
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
  try {
    // Always read the current updater manifest from GitHub first. An older
    // installed updater can therefore discover newly added managed scripts
    // immediately, instead of requiring a second updater run.
    const files = await currentFilesManifest();
    const downloads = [];
    for (const file of files) {
      downloads.push({ file, source: await downloadSource(file) });
    }

    const written = [];
    for (const item of downloads) {
      for (const target of targetFileManagers(item.file.name)) {
        const path = target.fm.joinPath(target.fm.documentsDirectory(), item.file.name);
        target.fm.writeString(path, item.source);
        written.push(`• ${item.file.name} [${target.label}]`);
      }
    }

    await show(
      'VAG Widget aktualisiert',
      `${downloads.length} Skripte wurden aus dem aktuellen GitHub-Manifest geladen.\n\n${written.join('\n')}\n\nVorhandene lokale Duplikate wurden ebenfalls aktualisiert. Deine VagAbfahrten.config.json bleibt unverändert.`,
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

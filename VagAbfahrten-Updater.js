// Variables used by Scriptable: icon-color: blue; icon-glyph: cloud-download-alt;
//
// Updates VagAbfahrten.js, the config assistant and this updater from GitHub main.
//
// Run this script manually in Scriptable whenever you want to install the
// current GitHub version. The existing local script is only replaced after
// the download has passed basic validation.

const FILES = [
  {
    url: 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten.js',
    name: 'VagAbfahrten.js',
    marker: "const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';",
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

async function main() {
  const fm = targetFileManager();

  try {
    // Download and validate every managed script before replacing any local file.
    const downloads = [];
    for (const file of FILES) {
      downloads.push({ file, source: await downloadSource(file) });
    }

    for (const item of downloads) {
      const target = fm.joinPath(fm.documentsDirectory(), item.file.name);
      fm.writeString(target, item.source);
    }

    await show(
      'VAG Widget aktualisiert',
      'VagAbfahrten.js, VagAbfahrten-Config.js und der Updater selbst wurden aktualisiert.\n\nDeine VagAbfahrten.config.json bleibt unverändert.',
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

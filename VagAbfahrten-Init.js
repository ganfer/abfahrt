// Variables used by Scriptable: icon-color: green; icon-glyph: download;
//
// One-time installer for VagAbfahrten.
// Copy this script to Scriptable and run it once. After a successful install
// it removes itself from the Scriptable storage it was launched from.

const APP_VERSION = '1.0.5';

const FILES = [
  ['VagAbfahrten.js', ["const APP_VERSION = '", "const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';", 'await main();']],
  ['VagAbfahrten-Config.js', ["const APP_VERSION = '", "const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';", 'await main();']],
];
const BASE_URL = 'https://raw.githubusercontent.com/ganfer/vag-widget/main/';

async function show(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.present();
}

async function download(name, markers) {
  const req = new Request(BASE_URL + name);
  req.timeoutInterval = 15;
  req.headers = { Accept: 'text/plain', 'Cache-Control': 'no-cache' };
  const source = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) throw new Error(name + ': GitHub HTTP ' + (status || '?'));
  if (!source.trim() || !markers.every((marker) => source.includes(marker))) {
    throw new Error(name + ': Download konnte nicht validiert werden.');
  }
  return source;
}

function currentFileManager() {
  const cloud = FileManager.iCloud();
  const local = FileManager.local();
  const scriptName = Script.name() + '.js';
  const cloudPath = cloud.joinPath(cloud.documentsDirectory(), scriptName);
  const localPath = local.joinPath(local.documentsDirectory(), scriptName);
  if (local.fileExists(localPath) && !cloud.fileExists(cloudPath)) return local;
  return cloud;
}

async function main() {
  const target = currentFileManager();
  try {
    const downloads = [];
    for (const [name, markers] of FILES) {
      downloads.push({ name, source: await download(name, markers) });
    }

    // Validate every download before writing the first file.
    for (const item of downloads) {
      const path = target.joinPath(target.documentsDirectory(), item.name);
      target.writeString(path, item.source);
    }

    const selfPath = target.joinPath(target.documentsDirectory(), Script.name() + '.js');
    if (target.fileExists(selfPath)) target.remove(selfPath);

    await show(
      'Initialisierung abgeschlossen',
      `VAG Widget v${APP_VERSION} wurde installiert. Widget und Config sind bereit. Die Fullscreen-Anzeige ist im Widget-Skript integriert.\n\nDieses Initialisierungsskript wurde automatisch gelöscht. Künftige Updates startest du über VagAbfahrten-Config → Auf Updates prüfen.`,
    );
  } catch (e) {
    await show(
      'Initialisierung fehlgeschlagen',
      'Das Initialisierungsskript bleibt erhalten.\n\n' + e.message,
    );
  }
  Script.complete();
}

await main();

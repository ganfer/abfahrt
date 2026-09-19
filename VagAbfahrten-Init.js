// Variables used by Scriptable: icon-color: green; icon-glyph: download;
//
// One-time installer for VagAbfahrten.
// Copy this script to Scriptable and run it once. After a successful install
// it removes itself from the Scriptable storage it was launched from.

const APP_VERSION = '1.1.1';

const FILES = [
  ['VagAbfahrten.js', ["const APP_VERSION = '", "const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';", 'await main();']],
  ['VagAbfahrten-Config.js', ["const APP_VERSION = '", "const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';", 'await main();']],
];
const RELEASE_API_URL = 'https://api.github.com/repos/ganfer/vag-widget/releases/latest';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/vag-widget/';

async function latestStableRelease() {
  const req = new Request(RELEASE_API_URL + '?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' };
  const release = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  const tag = String(release?.tag_name || '');
  if (status !== 200 || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error('Das aktuelle Stable Release konnte nicht ermittelt werden.');
  }
  return { tag, version: tag.slice(1) };
}

async function show(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.present();
}

async function download(name, markers, ref) {
  const req = new Request(RAW_BASE_URL + encodeURIComponent(ref) + '/' + name);
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
    const release = await latestStableRelease();
    const downloads = [];
    for (const [name, markers] of FILES) {
      downloads.push({ name, source: await download(name, markers, release.tag) });
    }

    const versions = downloads.map((item) => item.source.match(/const APP_VERSION = ['\"]([^'\"]+)['\"]/)?.[1]);
    if (versions.some((version) => version !== release.version)) throw new Error('Die Release-Dateien passen nicht zum Stable Release.');

    // Validate every download before writing the first file.
    for (const item of downloads) {
      const path = target.joinPath(target.documentsDirectory(), item.name);
      target.writeString(path, item.source);
    }

    const selfPath = target.joinPath(target.documentsDirectory(), Script.name() + '.js');
    if (target.fileExists(selfPath)) target.remove(selfPath);

    await show(
      'Initialisierung abgeschlossen',
      `VAG Widget Stable v${release.version} wurde installiert. Widget und Config sind bereit. Die Fullscreen-Anzeige ist im Widget-Skript integriert.\n\nDieses Initialisierungsskript wurde automatisch gelöscht. Künftige Updates startest du über VagAbfahrten-Config → Auf Updates prüfen.`,
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

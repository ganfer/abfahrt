// Variables used by Scriptable: icon-color: green; icon-glyph: download;
//
// Stable bootstrap installer for Abfahrt.
// Copy this single file to Scriptable and run it once. The released Config
// owns the actual installation, validation and cleanup lifecycle.

const RELEASE_API_URL = 'https://api.github.com/repos/ganfer/abfahrt/releases/latest';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/ganfer/abfahrt/';
const CONFIG_NAME = 'Abfahrt-Config.js';
const PENDING_INSTALL_REF_KEY = 'ABFAHRT_PENDING_INSTALL_REF';
const PENDING_INSTALL_VERSION_KEY = 'ABFAHRT_PENDING_INSTALL_VERSION';
const PENDING_INSTALLER_NAME_KEY = 'ABFAHRT_PENDING_INSTALLER_NAME';

async function show(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.present();
}

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

async function download(name, ref) {
  const req = new Request(RAW_BASE_URL + encodeURIComponent(ref) + '/' + name + '?t=' + Date.now());
  req.timeoutInterval = 15;
  req.headers = { Accept: 'text/plain', 'Cache-Control': 'no-cache' };
  const source = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200 || !source.trim()) throw new Error(name + ': GitHub HTTP ' + (status || '?'));
  return source;
}

function versionFromSource(source) {
  return source.match(/const APP_VERSION = ['"]([^'"]+)['"]/)?.[1] || null;
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
    const config = await download(CONFIG_NAME, release.tag);
    if (versionFromSource(config) !== release.version) {
      throw new Error('Die Config passt nicht zum aktuellen Stable Release.');
    }

    if (!config.includes("const PENDING_INSTALL_REF_KEY = 'ABFAHRT_PENDING_INSTALL_REF'") || !config.includes('completePendingInstall')) {
      throw new Error('Dieses Stable Release gehört nicht zur aktuellen Abfahrt-Produktlinie.');
    }

    target.writeString(target.joinPath(target.documentsDirectory(), CONFIG_NAME), config);
    Keychain.set(PENDING_INSTALL_REF_KEY, release.tag);
    Keychain.set(PENDING_INSTALL_VERSION_KEY, release.version);
    Keychain.set(PENDING_INSTALLER_NAME_KEY, Script.name());
    Safari.open('scriptable:///run?scriptName=' + encodeURIComponent('Abfahrt-Config'));
    Script.complete();
    return;
  } catch (e) {
    await show('Installation fehlgeschlagen', 'Der Bootstrap-Installer bleibt erhalten.\n\n' + e.message);
  }
  Script.complete();
}

(async () => {
  await main();
})();

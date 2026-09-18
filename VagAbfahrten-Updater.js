// Variables used by Scriptable: icon-color: blue; icon-glyph: cloud-download-alt;
//
// Updates VagAbfahrten.js from the main branch of ganfer/vag-widget.
//
// Run this script manually in Scriptable whenever you want to install the
// current GitHub version. The existing local script is only replaced after
// the download has passed basic validation.

const RAW_URL = 'https://raw.githubusercontent.com/ganfer/vag-widget/main/VagAbfahrten.js';
const TARGET_NAME = 'VagAbfahrten.js';

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

async function main() {
  const fm = targetFileManager();
  const target = fm.joinPath(fm.documentsDirectory(), TARGET_NAME);

  try {
    const req = new Request(RAW_URL);
    req.timeoutInterval = 15;
    req.headers = {
      Accept: 'text/plain',
      'Cache-Control': 'no-cache',
    };

    const source = await req.loadString();
    const status = req.response ? req.response.statusCode : 0;

    if (status !== 200) {
      throw new Error(`GitHub HTTP ${status || '?'}`);
    }
    if (source.length < 1000) {
      throw new Error('Download ist unerwartet klein.');
    }
    if (!source.includes("const TRIAS_ENDPOINT = 'https://efa-bw.de/trias';")) {
      throw new Error('Download sieht nicht wie VagAbfahrten.js aus.');
    }
    if (!source.includes('await main();')) {
      throw new Error('Download ist unvollständig.');
    }

    // Write only after validation. If downloading/validation fails, the current
    // local script remains untouched.
    fm.writeString(target, source);

    await show(
      'VAG Widget aktualisiert',
      `VagAbfahrten.js wurde von GitHub main aktualisiert.\n\n${source.length} Zeichen geladen.`,
    );
  } catch (e) {
    await show(
      'Update fehlgeschlagen',
      `Die vorhandene VagAbfahrten.js wurde nicht verändert.\n\n${e.message}`,
    );
  }

  Script.complete();
}

await main();

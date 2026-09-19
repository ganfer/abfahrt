// Variables used by Scriptable: icon-color: red; icon-glyph: sync-alt;
//
// Lightweight refresh helper for VagAbfahrten.

const MAIN_SCRIPT = 'VagAbfahrten';

async function main() {
  Safari.open('scriptable:///run/' + encodeURIComponent(MAIN_SCRIPT) + '?parameter=refresh');
  Script.complete();
}

await main();

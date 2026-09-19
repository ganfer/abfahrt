import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runtimePath = path.join(root, 'abfahrt.js');
const source = fs.readFileSync(runtimePath, 'utf8');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function extractObject(constName) {
  const marker = `const ${constName} = `;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`${constName} not found in abfahrt.js`);
  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) throw new Error(`${constName} object start not found`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const literal = source.slice(start, i + 1);
        return Function(`"use strict"; return (${literal});`)();
      }
    }
  }
  throw new Error(`${constName} object end not found`);
}

const config = extractObject('DEFAULT_WIDGET_CONFIG');
const output = path.resolve(root, argument('--output', '.preview/widget-preview.html'));
fs.mkdirSync(path.dirname(output), { recursive: true });

const palette = {
  bg: '#101010',
  fg: '#f0f0f0',
  dim: '#9a9a9a',
  ok: '#66bb6a',
  late: '#ef5350',
  delay: '#ff9800',
};

const rows = [
  { line: '1', destination: 'Littenweiler', platform: '1', departure: '12:45', countdown: '3 min', state: 'ok', realtime: true },
  { line: '3', destination: 'Vauban', platform: '2', departure: '12:48', countdown: '6 min', state: 'delay', realtime: true },
  { line: '4', destination: 'Messe Freiburg', platform: '3', departure: '12:51', countdown: '9 min', state: 'ok', realtime: true },
  { line: '2', destination: 'Hornusstraße', platform: '4', departure: '12:54', countdown: '12 min', state: 'ok', realtime: false },
  { line: '5', destination: 'Europaplatz', platform: '–', departure: '12:57', countdown: 'entfällt', state: 'cancelled', realtime: true },
].slice(0, Math.max(1, Number(config.rows) || 5));

const visible = Object.entries(config.columns).filter(([, value]) => value.visible !== false);
const gridColumns = visible.map(([, value]) => `${Math.max(1, Number(value.width) || 1)}px`).join(' ');
const gap = Math.max(0, Number(config.spacing?.columns) || 0);
const rowGap = Math.max(0, Number(config.spacing?.rows) || 0);
const badgeHeight = Math.max(16, Number(config.badgeHeight) || 22);

function cell(key, row) {
  if (key === 'line') return `<div class="line-badge">${row.line}</div>`;
  if (key === 'destination') return `<div class="destination ${row.state === 'cancelled' ? 'cancelled-text' : ''}">${row.destination}</div>`;
  if (key === 'platform') return `<div class="platform">${row.platform}</div>`;
  if (key === 'departureTime') return `<div class="departure">${row.departure}</div>`;
  if (key === 'countdown') return `<div class="countdown ${row.state}">${row.countdown}</div>`;
  return '';
}

const rowHtml = rows.map((row, index) =>
  `<div class="departure-row${index === 0 ? ' featured' : ''}">${visible.map(([key]) => cell(key, row)).join('')}</div>`
).join('');

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>abfahrt preview</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 430px; height: 932px; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
    color: #fff;
    background:
      radial-gradient(circle at 10% 20%, rgba(98,82,150,.34), transparent 32%),
      radial-gradient(circle at 92% 62%, rgba(55,137,140,.30), transparent 33%),
      radial-gradient(circle at 45% 96%, rgba(135,70,78,.22), transparent 30%),
      linear-gradient(180deg, #1d212a 0%, #2b2d39 100%);
  }
  .phone {
    width: 430px;
    height: 932px;
    padding: 18px 24px 24px;
    position: relative;
  }
  .status {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: .1px;
    padding: 0 6px;
  }
  .day { margin: 36px 4px 0; font-size: 13px; color: rgba(255,255,255,.82); }
  .city { margin: 3px 4px 28px; font-size: 28px; line-height: 1.05; font-weight: 750; }
  .widget {
    width: 382px;
    min-height: 260px;
    border-radius: 28px;
    background: ${palette.bg};
    padding: 11px 12px 9px;
    box-shadow: 0 12px 26px rgba(0,0,0,.35);
  }
  .widget-header {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 12px;
    background: radial-gradient(circle at 10% 15%, rgba(48,209,88,.14), transparent 38%), #17171a;
  }
  .stop-badge {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #123822;
    color: #ffd60a;
    font-size: 17px;
    font-weight: 800;
  }
  .widget-copy { min-width: 0; flex: 1; }
  .widget-title { font-size: 15px; line-height: 18px; font-weight: 750; color: ${palette.fg}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .widget-subtitle { margin-top: 1px; font-size: 8px; line-height: 11px; font-weight: 500; color: ${palette.dim}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .widget-status { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
  .chip {
    height: 22px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 7px;
    border-radius: 8px;
    background: #232326;
    color: #d1d1d6;
    font-size: 8px;
    font-weight: 600;
    white-space: nowrap;
  }
  .chip.live { background: #123b24; color: #79e697; }
  .chip-dot { font-size: 6px; color: #30d158; }
  .pin { margin-left: 1px; color: #ffd60a; font-size: 14px; line-height: 1; }
  .rows { margin-top: 7px; display: flex; flex-direction: column; gap: ${rowGap}px; }
  .departure-row {
    display: grid;
    grid-template-columns: ${gridColumns};
    column-gap: ${gap}px;
    align-items: center;
    min-height: ${badgeHeight}px;
    padding: 0;
    border-radius: 9px;
  }
  .departure-row.featured { padding: 3px 5px; background: #18181b; }
  .departure-row > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line-badge {
    height: ${badgeHeight}px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2c2c2e;
    color: ${palette.fg};
    font-size: ${Number(config.fontSize?.line) || 11}px;
    font-weight: 700;
  }
  .destination { color: ${palette.fg}; font-size: ${Number(config.fontSize?.destination) || 12}px; font-weight: 500; }
  .platform { color: ${palette.fg}; font-size: ${Number(config.fontSize?.platform) || 10}px; }
  .departure { color: ${palette.fg}; font-size: ${Number(config.fontSize?.departureTime) || 11}px; font-variant-numeric: tabular-nums; }
  .countdown { text-align: right; font-size: ${Number(config.fontSize?.countdown) || 12}px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .countdown.ok { color: ${palette.ok}; }
  .countdown.delay { color: ${palette.delay}; }
  .countdown.late { color: ${palette.late}; }
  .countdown.cancelled, .cancelled-text { color: ${palette.dim}; opacity: .72; }
  .footer { margin-top: 5px; display: flex; justify-content: space-between; font-size: 7px; color: ${palette.dim}; }
  .footer .realtime { color: ${palette.ok}; }
  .dock {
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 67px;
    height: 78px;
    display: flex;
    align-items: center;
    justify-content: space-around;
  }
  .app { width: 54px; height: 54px; border-radius: 15px; background: rgba(255,255,255,.92); box-shadow: 0 3px 12px rgba(0,0,0,.16); }
  .home-indicator { position: absolute; width: 100px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.9); left: 165px; bottom: 24px; }
</style>
</head>
<body>
  <main class="phone">
    <div class="status"><span>12:42</span><span>● ᯤ ▰</span></div>
    <div class="day">Samstag, 19. September</div>
    <div class="city">Freiburg</div>
    <section class="widget" aria-label="public transport departures widget preview">
      <div class="widget-header">
        <div class="stop-badge">H</div>
        <div class="widget-copy">
          <div class="widget-title">Bertoldsbrunnen</div>
          <div class="widget-subtitle">Freiburg · akt. 12:42</div>
        </div>
        <div class="widget-status">
          <div class="chip live"><span class="chip-dot">●</span>Live</div>
          <div class="chip">4 Steige</div>
          <div class="pin">★</div>
        </div>
      </div>
      <div class="rows">${rowHtml}</div>
      <div class="footer"><span class="realtime">● Echtzeit</span><span>Tippen für Details</span></div>
    </section>
    <div class="dock"><div class="app"></div><div class="app"></div><div class="app"></div><div class="app"></div></div>
    <div class="home-indicator"></div>
  </main>
</body>
</html>`;

fs.writeFileSync(output, html);
console.log(`Rendered preview HTML: ${path.relative(root, output)}`);

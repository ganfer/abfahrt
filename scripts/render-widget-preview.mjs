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

const widgetConfig = extractObject('DEFAULT_WIDGET_CONFIG');
const fullscreenConfig = extractObject('DEFAULT_FULLSCREEN_CONFIG');
const variant = argument('--variant', 'widget-small');
const output = path.resolve(root, argument('--output', `.preview/${variant}.html`));
fs.mkdirSync(path.dirname(output), { recursive: true });

const palette = {
  bg: '#101010',
  fg: '#f0f0f0',
  dim: '#9a9a9a',
  ok: '#66bb6a',
  late: '#ef5350',
  delay: '#ff9800',
};

const fixtureRows = [
  { line: '1', destination: 'Littenweiler', platform: '1', departure: '12:45', countdown: '3 min', state: 'ok', realtime: true },
  { line: '3', destination: 'Vauban', platform: '1', departure: '12:48', countdown: '6 min', state: 'delay', realtime: true },
  { line: '4', destination: 'Messe Freiburg', platform: '2', departure: '12:51', countdown: '9 min', state: 'ok', realtime: true },
  { line: '2', destination: 'Hornusstraße', platform: '2', departure: '12:54', countdown: '12 min', state: 'ok', realtime: false },
  { line: '5', destination: 'Europaplatz', platform: '3', departure: '12:57', countdown: '15 min', state: 'ok', realtime: true },
  { line: '1', destination: 'Landwasser', platform: '3', departure: '13:00', countdown: '18 min', state: 'delay', realtime: true },
  { line: '3', destination: 'Innsbrucker Straße', platform: '4', departure: '13:03', countdown: '21 min', state: 'ok', realtime: true },
  { line: '4', destination: 'Zähringen', platform: '–', departure: '13:06', countdown: 'entfällt', state: 'cancelled', realtime: true },
  { line: '2', destination: 'Günterstal', platform: '1', departure: '13:09', countdown: '27 min', state: 'ok', realtime: true },
  { line: '5', destination: 'Rieselfeld', platform: '2', departure: '13:12', countdown: '30 min', state: 'ok', realtime: false },
];

function visibleColumns(layout) {
  return Object.entries(layout.columns).filter(([, value]) => value.visible !== false);
}

function widgetCell(key, row) {
  if (key === 'line') return `<div class="line-badge">${row.line}</div>`;
  if (key === 'destination') return `<div class="destination ${row.state === 'cancelled' ? 'cancelled-text' : ''}">${row.destination}</div>`;
  if (key === 'platform') return `<div class="platform">${row.platform}</div>`;
  if (key === 'departureTime') return `<div class="departure">${row.departure}</div>`;
  if (key === 'countdown') return `<div class="countdown ${row.state}">${row.countdown}</div>`;
  return '';
}

function renderWidget(family) {
  const layout = widgetConfig[family];
  if (!layout) throw new Error(`Unknown widget family: ${family}`);
  const isSmall = family === 'small';
  const rows = fixtureRows.slice(0, Math.max(1, Number(layout.rows) || 3));
  const visible = visibleColumns(layout);
  const gridColumns = visible.map(([, value]) => `${Math.max(1, Number(value.width) || 1)}px`).join(' ');
  const gap = Math.max(0, Number(layout.spacing?.columns) || 0);
  const rowGap = Math.max(0, Number(layout.spacing?.rows) || 0);
  const badgeHeight = Math.max(16, Number(layout.badgeHeight) || 22);
  const widgetWidth = isSmall ? 170 : 382;
  const widgetMinHeight = isSmall ? 170 : 356;
  const rowHtml = rows.map((row, index) =>
    `<div class="departure-row${index === 0 ? ' featured' : ''}">${visible.map(([key]) => widgetCell(key, row)).join('')}</div>`
  ).join('');
  const columnHeader = layout.showColumnHeader
    ? `<div class="column-header">${visible.map(([key]) => `<div>${({
        line: 'Linie',
        destination: 'Richtung',
        platform: 'Gleis',
        departureTime: 'Abfahrt',
        countdown: 'Restzeit',
      })[key] || ''}</div>`).join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>abfahrt ${family} widget preview</title>
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
  .phone { width: 430px; height: 932px; padding: 18px 24px 24px; position: relative; }
  .status { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; letter-spacing: .1px; padding: 0 6px; }
  .day { margin: 36px 4px 0; font-size: 13px; color: rgba(255,255,255,.82); }
  .city { margin: 3px 4px 28px; font-size: 28px; line-height: 1.05; font-weight: 750; }
  .widget {
    width: ${widgetWidth}px;
    min-height: ${widgetMinHeight}px;
    border-radius: ${isSmall ? 25 : 28}px;
    background: ${palette.bg};
    padding: ${isSmall ? '9px 9px 8px' : '11px 12px 9px'};
    box-shadow: 0 12px 26px rgba(0,0,0,.35);
  }
  .widget-header {
    min-height: ${isSmall ? 34 : 40}px;
    padding: ${isSmall ? '5px 6px' : '6px 8px'};
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: ${isSmall ? 5 : 7}px;
    background: radial-gradient(circle at 10% 15%, rgba(48,209,88,.14), transparent 38%), #17171a;
  }
  .stop-badge {
    width: ${isSmall ? 24 : 28}px; height: ${isSmall ? 24 : 28}px; flex: 0 0 ${isSmall ? 24 : 28}px;
    display: grid; place-items: center; border-radius: 50%; background: #123822; color: #ffd60a;
    font-size: ${isSmall ? 14 : 16}px; font-weight: 800;
  }
  .widget-title {
    min-width: 0; flex: 1 1 auto; font-size: ${isSmall ? 12 : 15}px; line-height: ${isSmall ? 14 : 18}px;
    font-weight: 750; color: ${palette.fg}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .widget-status {
    flex: 0 1 auto; display: flex; align-items: center; gap: 4px; min-width: 0; color: ${palette.dim};
    font-size: ${isSmall ? 0 : 8}px; line-height: 10px; font-weight: 500; white-space: nowrap;
  }
  .widget-status > * { ${isSmall ? 'display:none;' : ''} }
  .live-dot { flex: 0 0 auto; font-size: 6px; color: #30d158; }
  .updated { color: #d8d8dc; font-weight: 700; }
  .pin { flex: 0 0 auto; color: #ffd60a; font-size: ${isSmall ? 12 : 14}px; line-height: 1; }
  .column-header, .departure-row {
    display: grid;
    grid-template-columns: ${gridColumns};
    column-gap: ${gap}px;
    align-items: center;
  }
  .column-header {
    margin: ${isSmall ? '5px 0 2px' : '7px 0 3px'};
    padding: 0 1px;
    color: ${palette.dim};
    font-size: 7px;
    font-weight: 600;
  }
  .column-header > div:last-child { text-align: right; }
  .rows { margin-top: ${isSmall ? 5 : 7}px; display: flex; flex-direction: column; gap: ${rowGap}px; }
  .departure-row { min-height: ${badgeHeight}px; border-radius: 9px; }
  .departure-row.featured { background: #151517; }
  .departure-row > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line-badge {
    height: ${badgeHeight}px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    background: #2c2c2e; color: ${palette.fg}; font-size: ${Number(layout.fontSize?.line) || 11}px; font-weight: 700;
  }
  .destination { color: ${palette.fg}; font-size: ${Number(layout.fontSize?.destination) || 12}px; font-weight: 500; }
  .platform { color: ${palette.fg}; font-size: ${Number(layout.fontSize?.platform) || 10}px; text-align:center; }
  .departure { color: ${palette.fg}; font-size: ${Number(layout.fontSize?.departureTime) || 11}px; font-variant-numeric: tabular-nums; }
  .countdown { text-align: right; font-size: ${Number(layout.fontSize?.countdown) || 12}px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .countdown.ok { color: ${palette.ok}; } .countdown.delay { color: ${palette.delay}; } .countdown.late { color: ${palette.late}; }
  .countdown.cancelled, .cancelled-text { color: ${palette.dim}; opacity: .72; }
  .dock { position:absolute; left:24px; right:24px; bottom:67px; height:78px; display:flex; align-items:center; justify-content:space-around; }
  .app { width:54px; height:54px; border-radius:15px; background:rgba(255,255,255,.92); box-shadow:0 3px 12px rgba(0,0,0,.16); }
  .home-indicator { position:absolute; width:100px; height:5px; border-radius:3px; background:rgba(255,255,255,.9); left:165px; bottom:24px; }
</style>
</head>
<body>
<main class="phone">
  <div class="status"><span>12:42</span><span>● ᯤ ▰</span></div>
  <div class="day">Samstag, 19. September</div>
  <div class="city">Freiburg</div>
  <section class="widget" aria-label="abfahrt ${family} widget preview">
    <div class="widget-header">
      <div class="stop-badge">H</div>
      <div class="widget-title">Bertoldsbrunnen</div>
      <div class="widget-status"><span class="live-dot">●</span><span>Live</span><span>·</span><span>4 Steige</span><span>·</span><span class="updated">akt. 12:42</span></div>
      <div class="pin">★</div>
    </div>
    ${columnHeader}
    <div class="rows">${rowHtml}</div>
  </section>
  <div class="dock"><div class="app"></div><div class="app"></div><div class="app"></div><div class="app"></div></div>
  <div class="home-indicator"></div>
</main>
</body>
</html>`;
}

function fullscreenGroupLabel(platform) {
  return platform === '–' ? 'Ohne Gleisangabe' : `Gleis ${platform}`;
}

function renderFullscreenPlatform() {
  const layout = fullscreenConfig;
  const rows = fixtureRows.slice(0, Math.max(1, Number(layout.rows) || 8))
    .toSorted((a, b) => {
      const av = a.platform === '–' ? '' : a.platform;
      const bv = b.platform === '–' ? '' : b.platform;
      if (!av && !bv) return a.departure.localeCompare(b.departure);
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv, 'de-DE', { numeric: true, sensitivity: 'base' }) || a.departure.localeCompare(b.departure);
    });

  const groups = [];
  for (const row of rows) {
    const key = row.platform;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: fullscreenGroupLabel(key), rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }

  const body = groups.map((group) => {
    const heading = `<tr class="group-row"><td colspan="5"><div class="group-heading"><span>${group.label}</span><span class="group-count">${group.rows.length === 1 ? '1 Abfahrt' : `${group.rows.length} Abfahrten`}</span></div></td></tr>`;
    const groupRows = group.rows.map((row) => `
      <tr class="departure-row">
        <td class="line"><span class="line-badge">${row.line}</span></td>
        <td class="destination"><div class="destination-text">${row.destination}</div></td>
        <td class="platform">${row.platform}</td>
        <td class="time"><span>${row.departure}</span><span class="time-marker ${row.realtime ? 'realtime-marker' : 'schedule-marker'}">${row.realtime ? '•' : '°'}</span></td>
        <td class="countdown ${row.state}">${row.countdown}</td>
      </tr>`).join('');
    return heading + groupRows;
  }).join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>abfahrt fullscreen preview</title>
<style>
  :root {
    color-scheme: dark;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
    --bg:#0d0d0f; --border:rgba(255,255,255,.11); --muted:#9b9ba1; --text:#f5f5f7;
    --green:#69c26a; --orange:#ff9f0a; --red:#ff453a;
  }
  * { box-sizing:border-box; }
  html, body { margin:0; width:430px; height:932px; overflow:hidden; background:var(--bg); }
  body {
    padding: 26px 14px 28px;
    color:var(--text);
    background: radial-gradient(circle at 50% -8%, rgba(58,122,255,.10), transparent 32%), var(--bg);
  }
  .stop-card {
    position:relative; overflow:hidden; margin-bottom:14px; padding:16px; border:1px solid var(--border); border-radius:20px;
    background: radial-gradient(circle at 10% 15%, rgba(34,197,94,.18), transparent 34%),
      radial-gradient(circle at 80% 100%, rgba(49,130,246,.12), transparent 42%),
      linear-gradient(145deg, rgba(31,31,35,.96), rgba(18,18,20,.98));
    box-shadow:0 12px 30px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.035);
  }
  .stop-top { display:flex; align-items:center; gap:12px; }
  .stop-symbol { flex:0 0 50px; width:50px; height:50px; display:grid; place-items:center; border-radius:50%; border:1px solid rgba(74,222,128,.30); background:rgba(16,67,43,.55); }
  .stop-symbol span { width:34px; height:34px; display:grid; place-items:center; border-radius:50%; background:#ffd60a; color:#087f39; font-size:24px; font-weight:900; }
  .stop-copy { min-width:0; flex:1; }
  .stop-title { margin:0; font-size:28px; line-height:1.08; letter-spacing:-.025em; }
  .meta { margin-top:6px; color:var(--muted); font-size:13px; }
  .pin-state { flex:0 0 42px; width:42px; height:42px; display:grid; place-items:center; border-radius:14px; border:1px solid var(--border); background:rgba(255,255,255,.045); color:#ffd60a; font-size:24px; }
  .status-row { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; padding-left:62px; }
  .chip { min-height:32px; display:inline-flex; align-items:center; gap:7px; padding:0 11px; border:1px solid var(--border); border-radius:999px; background:rgba(255,255,255,.045); color:#d7d7dc; font-size:13px; font-weight:650; }
  .chip.live { border-color:rgba(48,209,88,.24); background:rgba(17,92,50,.30); color:#73e895; }
  .live-dot { width:8px; height:8px; border-radius:50%; background:currentColor; }
  .table-wrap { overflow:hidden; border:1px solid var(--border); border-radius:18px; background:rgba(20,20,22,.96); box-shadow:0 10px 28px rgba(0,0,0,.18); }
  table { width:100%; border-collapse:collapse; table-layout:auto; }
  th { padding:10px 6px; text-align:left; color:#9c9ca2; font-size:11px; font-weight:700; background:linear-gradient(180deg,#1d1d20,#19191b); border-bottom:1px solid var(--border); }
  td { position:relative; padding:10px 6px; font-size:${Number(layout.fontSize) || 16}px; border-bottom:1px solid rgba(255,255,255,.075); vertical-align:middle; }
  .line { width:52px; font-weight:700; }
  .line-badge { display:inline-grid; place-items:center; min-width:32px; height:32px; padding:0 8px; border-radius:10px; background:linear-gradient(180deg,#2a2a2e,#222225); }
  .destination { min-width:100px; text-align:left; }
  .destination-text { line-height:1.14; white-space:normal; overflow-wrap:break-word; }
  .platform { width:46px; text-align:center; }
  .time { width:66px; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .time-marker { margin-left:3px; font-size:.72em; vertical-align:.18em; }
  .realtime-marker { color:#62d97b; } .schedule-marker { color:#8e8e93; }
  .countdown { width:72px; text-align:right; font-weight:750; white-space:nowrap; }
  .countdown.ok { color:var(--green); } .countdown.delay { color:var(--orange); } .countdown.cancelled { color:#8e8e93; text-decoration:line-through; }
  .group-row td { padding:11px 12px 7px; background:linear-gradient(180deg,rgba(40,40,44,.98),rgba(30,30,33,.98)); color:#d7d7dc; font-size:12px; font-weight:700; white-space:normal; }
  .group-heading { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .group-count { color:#85858c; font-size:11px; font-weight:600; white-space:nowrap; }
</style>
</head>
<body>
  <section class="stop-card">
    <div class="stop-top">
      <div class="stop-symbol"><span>H</span></div>
      <div class="stop-copy">
        <h1 class="stop-title">Bertoldsbrunnen</h1>
        <div class="meta">Abfahrten · aktualisiert 12:42</div>
      </div>
      <div class="pin-state">★</div>
    </div>
    <div class="status-row">
      <div class="chip live"><span class="live-dot"></span>Live</div>
      <div class="chip">▥ 4 Steige</div>
    </div>
  </section>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Linie</th><th>Richtung</th><th>Gleis</th><th>Abfahrt</th><th>Restzeit</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</body>
</html>`;
}

let html;
if (variant === 'widget-small') html = renderWidget('small');
else if (variant === 'widget-large') html = renderWidget('large');
else if (variant === 'fullscreen-platform') html = renderFullscreenPlatform();
else throw new Error(`Unknown preview variant: ${variant}`);

fs.writeFileSync(output, html);
console.log(`Rendered ${variant} preview HTML: ${path.relative(root, output)}`);

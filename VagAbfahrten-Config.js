// Variables used by Scriptable: icon-color: purple; icon-glyph: sliders-h;
//
// Interactive configuration assistant for VagAbfahrten.

const CONFIG_FILE_NAME = 'VagAbfahrten.config.json';
const DEFAULTS = {
  rows: 5,
  columns: {
    line: { visible: true, width: 34 },
    destination: { visible: true, width: 105 },
    platform: { visible: true, width: 28 },
    departureTime: { visible: true, width: 42 },
    countdown: { visible: true, width: 50 },
  },
  spacing: { columns: 6, rows: 3 },
  fontSize: { line: 11, destination: 12, platform: 10, departureTime: 11, countdown: 12 },
  badgeHeight: 22,
  fullscreen: {
    rows: 8,
    columns: {
      line: { visible: true, width: 64 },
      destination: { visible: true, width: 190 },
      platform: { visible: true, width: 70 },
      departureTime: { visible: true, width: 82 },
      countdown: { visible: true, width: 92 },
    },
    fontSize: 16,
  },
};

const fm = FileManager.iCloud();
const configPath = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadConfig() {
  if (!fm.fileExists(configPath)) return clone(DEFAULTS);
  try {
    if (!fm.isFileDownloaded(configPath)) fm.downloadFileFromiCloud(configPath);
    const saved = JSON.parse(fm.readString(configPath));
    return {
      ...clone(DEFAULTS),
      ...saved,
      columns: {
        line: { ...DEFAULTS.columns.line, ...(saved.columns?.line || {}) },
        destination: { ...DEFAULTS.columns.destination, ...(saved.columns?.destination || {}) },
        platform: { ...DEFAULTS.columns.platform, ...(saved.columns?.platform || {}) },
        departureTime: { ...DEFAULTS.columns.departureTime, ...(saved.columns?.departureTime || {}) },
        countdown: { ...DEFAULTS.columns.countdown, ...(saved.columns?.countdown || {}) },
      },
      spacing: { ...DEFAULTS.spacing, ...(saved.spacing || {}) },
      fontSize: { ...DEFAULTS.fontSize, ...(saved.fontSize || {}) },
      fullscreen: {
        ...DEFAULTS.fullscreen,
        ...(saved.fullscreen || {}),
        columns: {
          line: { ...DEFAULTS.fullscreen.columns.line, ...(saved.fullscreen?.columns?.line || {}) },
          destination: { ...DEFAULTS.fullscreen.columns.destination, ...(saved.fullscreen?.columns?.destination || {}) },
          platform: { ...DEFAULTS.fullscreen.columns.platform, ...(saved.fullscreen?.columns?.platform || {}) },
          departureTime: { ...DEFAULTS.fullscreen.columns.departureTime, ...(saved.fullscreen?.columns?.departureTime || {}) },
          countdown: { ...DEFAULTS.fullscreen.columns.countdown, ...(saved.fullscreen?.columns?.countdown || {}) },
        },
      },
    };
  } catch (_) {
    return clone(DEFAULTS);
  }
}

async function notice(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.present();
}

async function askNumber(title, message, value, min, max) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addTextField(String(value), String(value));
  a.addAction('Übernehmen');
  a.addCancelAction('Abbrechen');
  const choice = await a.present();
  if (choice === -1) return value;
  const parsed = Number(a.textFieldValue(0).trim());
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    await notice('Ungültiger Wert', `Bitte einen Wert zwischen ${min} und ${max} eingeben.`);
    return askNumber(title, message, value, min, max);
  }
  return parsed;
}

async function configureColumn(cfg, key, label) {
  const col = cfg.columns[key];
  const a = new Alert();
  a.title = label;
  a.message = `Aktuell: ${col.visible ? 'sichtbar' : 'ausgeblendet'} · Breite ${col.width}`;
  a.addAction(col.visible ? 'Spalte ausblenden' : 'Spalte einblenden');
  a.addAction('Breite ändern');
  a.addCancelAction('Zurück');
  const choice = await a.present();
  if (choice === 0) col.visible = !col.visible;
  if (choice === 1) col.width = await askNumber(label + ' – Breite', 'Breite der Spalte in Punkten.', col.width, 20, 220);
}

async function configureFullscreen(cfg) {
  const labels = {
    line: 'Linie',
    destination: 'Richtung',
    platform: 'Gleis',
    departureTime: 'Abfahrtszeit',
    countdown: 'Restzeit',
  };

  while (true) {
    const a = new Alert();
    a.title = 'Fullscreen konfigurieren';
    a.message = `${cfg.fullscreen.rows} Abfahrten · Schrift ${cfg.fullscreen.fontSize} pt\n` +
      Object.keys(labels).map((key) =>
        `${labels[key]}: ${cfg.fullscreen.columns[key].visible ? cfg.fullscreen.columns[key].width + ' px' : 'aus'}`
      ).join('\n');
    a.addAction('Anzahl Abfahrten');
    a.addAction('Linie');
    a.addAction('Richtung');
    a.addAction('Gleis');
    a.addAction('Abfahrtszeit');
    a.addAction('Restzeit');
    a.addAction('Schriftgröße');
    a.addCancelAction('Zurück');
    const choice = await a.present();
    if (choice === -1) return;
    if (choice === 0) cfg.fullscreen.rows = await askNumber('Fullscreen – Abfahrten', 'Wie viele Abfahrten sollen angezeigt werden?', cfg.fullscreen.rows, 1, 30);
    if (choice >= 1 && choice <= 5) {
      const key = ['line', 'destination', 'platform', 'departureTime', 'countdown'][choice - 1];
      const col = cfg.fullscreen.columns[key];
      const b = new Alert();
      b.title = labels[key];
      b.message = `Aktuell: ${col.visible ? 'sichtbar' : 'ausgeblendet'} · Breite ${col.width} px`;
      b.addAction(col.visible ? 'Spalte ausblenden' : 'Spalte einblenden');
      b.addAction('Breite ändern');
      b.addCancelAction('Zurück');
      const sub = await b.present();
      if (sub === 0) col.visible = !col.visible;
      if (sub === 1) col.width = await askNumber(labels[key] + ' – Breite', 'Breite in Pixeln für die Fullscreen-Tabelle.', col.width, 40, 400);
    }
    if (choice === 6) cfg.fullscreen.fontSize = await askNumber('Fullscreen – Schriftgröße', 'Schriftgröße der Tabellenwerte.', cfg.fullscreen.fontSize, 10, 28);
  }
}

function summary(cfg) {
  const names = {
    line: 'Linie',
    destination: 'Richtung',
    platform: 'Gleis',
    departureTime: 'Abfahrt',
    countdown: 'Restzeit',
  };
  const columns = Object.keys(names)
    .map((key) => `${names[key]}: ${cfg.columns[key].visible ? cfg.columns[key].width + ' pt' : 'aus'}`)
    .join('\n');
  return `${cfg.rows} Widget-Abfahrten\n\n${columns}\n\nSpaltenabstand: ${cfg.spacing.columns} pt\nZeilenabstand: ${cfg.spacing.rows} pt\n\nFullscreen: ${cfg.fullscreen.rows} Abfahrten · ${cfg.fullscreen.fontSize} pt`;
}

async function save(cfg) {
  fm.writeString(configPath, JSON.stringify(cfg, null, 2));
  await notice('Gespeichert', 'Die persönliche Widget-Konfiguration wurde gespeichert. Das Home-Screen-Widget verwendet sie beim nächsten Refresh.');
}

async function reset() {
  if (fm.fileExists(configPath)) fm.remove(configPath);
  await notice('Zurückgesetzt', 'Die persönliche Konfiguration wurde gelöscht. Das Widget verwendet wieder die Standardwerte.');
}

async function main() {
  const cfg = loadConfig();

  while (true) {
    const menu = new Alert();
    menu.title = 'VAG Widget konfigurieren';
    menu.message = summary(cfg);
    menu.addAction('Anzahl Abfahrten');
    menu.addAction('Linie');
    menu.addAction('Richtung');
    menu.addAction('Gleis');
    menu.addAction('Abfahrtszeit');
    menu.addAction('Restzeit');
    menu.addAction('Abstände');
    menu.addAction('Schriftgrößen');
    menu.addAction('Fullscreen-Ansicht');
    menu.addAction('Speichern');
    menu.addDestructiveAction('Auf Standard zurücksetzen');
    menu.addCancelAction('Beenden');
    const choice = await menu.present();

    if (choice === -1) break;
    if (choice === 0) cfg.rows = await askNumber('Anzahl Abfahrten', 'Wie viele Abfahrten sollen angezeigt werden?', cfg.rows, 1, 8);
    if (choice === 1) await configureColumn(cfg, 'line', 'Linie');
    if (choice === 2) await configureColumn(cfg, 'destination', 'Richtung');
    if (choice === 3) await configureColumn(cfg, 'platform', 'Gleis');
    if (choice === 4) await configureColumn(cfg, 'departureTime', 'Abfahrtszeit');
    if (choice === 5) await configureColumn(cfg, 'countdown', 'Restzeit');
    if (choice === 6) {
      cfg.spacing.columns = await askNumber('Spaltenabstand', 'Abstand zwischen sichtbaren Spalten.', cfg.spacing.columns, 0, 20);
      cfg.spacing.rows = await askNumber('Zeilenabstand', 'Abstand zwischen den Abfahrten.', cfg.spacing.rows, 0, 12);
    }
    if (choice === 7) {
      cfg.fontSize.line = await askNumber('Linie – Schriftgröße', '', cfg.fontSize.line, 8, 18);
      cfg.fontSize.destination = await askNumber('Richtung – Schriftgröße', '', cfg.fontSize.destination, 8, 18);
      cfg.fontSize.platform = await askNumber('Gleis – Schriftgröße', '', cfg.fontSize.platform, 8, 18);
      cfg.fontSize.departureTime = await askNumber('Abfahrtszeit – Schriftgröße', '', cfg.fontSize.departureTime, 8, 18);
      cfg.fontSize.countdown = await askNumber('Restzeit – Schriftgröße', '', cfg.fontSize.countdown, 8, 18);
    }
    if (choice === 8) await configureFullscreen(cfg);
    if (choice === 9) {
      await save(cfg);
      break;
    }
    if (choice === 10) {
      await reset();
      break;
    }
  }

  Script.complete();
}

await main();

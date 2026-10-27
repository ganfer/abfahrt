# Vorschau-Screenshots

Die Vorschau-Galerie im README wird automatisch durch `.github/workflows/widget-screenshot.yml` erzeugt.

Sie besteht aus vier deterministischen Bildern:

| Datei | Inhalt |
| --- | --- |
| `docs/assets/widget-preview-small.png` | Small Widget |
| `docs/assets/widget-preview-large.png` | Large Widget |
| `docs/assets/fullscreen-preview-platform.png` | Vollbildansicht, nach Gleis sortiert und gruppiert |
| `docs/assets/trip-normal-preview.png` | Normaler Fahrtverlauf mit folgenden Haltestellen, Ankunftsuhrzeiten und Restminuten (nicht fixiert) |

Im README werden die vier Bilder bewusst nur als kleine, klickbare Vorschaubilder angezeigt. Ein Klick öffnet die jeweilige PNG-Datei in voller Größe.

## Warum keine echten Scriptable-Aufnahmen?

Scriptable ist eine iOS-Laufzeitumgebung und kann nicht nativ auf den Linux-Runnern von GitHub Actions ausgeführt werden.

Die CI behauptet deshalb ausdrücklich **nicht**, einen iOS-Simulator zu verwenden. Stattdessen liest `scripts/render-widget-preview.mjs` die relevanten Default-Konfigurationen direkt aus `abfahrt.js` und baut daraus deterministische HTML-Darstellungen.

Verwendet werden:

- `DEFAULT_WIDGET_CONFIG.small`
- `DEFAULT_WIDGET_CONFIG.large`
- `DEFAULT_FULLSCREEN_CONFIG`

Die Vollbild-Vorschau wird absichtlich im Sortiermodus **Gleis** dargestellt, damit die Gruppenüberschriften unmittelbar sichtbar sind.

## Feste Demodaten

Alle vier Vorschauen verwenden feste Beispieldaten rund um **Bertoldsbrunnen**.

Die Fixtures enthalten unter anderem:

- mehrere Linien und Richtungen
- mehrere Gleise
- Live- und Sollfahrplanzeiten
- Verspätung
- Ausfall
- feste Uhrzeit `12:42`

Dadurch benötigt die Vorschau:

- keinen TRIAS-Key
- keinen Standort
- keine Live-Netzwerkdaten aus EFA-BW

und bleibt bei identischem Code reproduzierbar.

## Renderer

Der Renderer unterstützt vier Varianten:

```sh
node scripts/render-widget-preview.mjs --variant widget-small --output .preview/widget-small.html
node scripts/render-widget-preview.mjs --variant widget-large --output .preview/widget-large.html
node scripts/render-widget-preview.mjs --variant fullscreen-platform --output .preview/fullscreen-platform.html
node scripts/render-widget-preview.mjs --variant trip-normal --output .preview/trip-normal.html
```

### Small Widget

Die Variante `widget-small` liest das echte Small-Default-Layout aus der Runtime, unter anderem:

- sichtbare Spalten
- Zeilenanzahl
- Spaltenbreiten
- Abstände
- Badge-Höhe
- Schriftgrößen

### Large Widget

`widget-large` verwendet entsprechend die Large-Konfiguration. Dadurch werden insbesondere die höhere Zeilenanzahl und die Spaltenüberschriften sichtbar.

### Fullscreen · Gleis

`fullscreen-platform` orientiert sich am aktuellen Fullscreen-Design und verwendet die Fullscreen-Defaultwerte aus der Runtime.

Die Demodaten werden nach Gleis sortiert und mit Überschriften wie

- `Gleis 1`
- `Gleis 2`
- `Ohne Gleisangabe`

gruppiert. Innerhalb einer Gruppe bleiben die Abfahrten chronologisch.

### Fahrtverlauf (normal)

`trip-normal` rendert die reale `renderTripProgressHTML`-Funktion aus `abfahrt.js` mit festen Demo-Haltestellen. Die Ansicht zeigt gleichzeitig Uhrzeiten und Restminuten sowie die Schaltfläche **Fahrt fixieren**. **Weitere Zustände wie fixierte oder fortgesetzte Fahrten werden bewusst nicht als Screenshots ergänzt.** Die Vorschau verwendet eine festgelegte Demonstrationszeit von `12:42` und einen festgelegten Betriebstag; weder Schlüssel noch GPS oder Netzabfragen sind erforderlich.

## Ablauf im Pull Request

Wenn sich eine für die Vorschau relevante Datei ändert, rendert der Workflow alle vier HTML-Dateien und erzeugt daraus mit Headless Chrome vier PNGs im Format **430 × 932 Pixel**.

Die PNGs werden als gemeinsames Workflow-Artefakt hochgeladen und können vor dem Merge visuell geprüft werden.

Relevante Trigger sind aktuell:

- `abfahrt.js`
- `abfahrt-config.js`
- `scripts/render-widget-preview.mjs`
- `.github/workflows/widget-screenshot.yml`
- `README.md`

## Ablauf auf `main`

Nach einem relevanten Push auf `main` werden dieselben vier Bilder erneut erzeugt.

Wenn sich mindestens eines der Bilder geändert hat oder eine der neuen Dateien noch fehlt:

1. werden die vier aktuellen PNGs aufgenommen,
2. das frühere `docs/assets/widget-preview.png` wird entfernt, falls es noch existiert,
3. der Workflow pusht den Stand nach `automation/readme-previews`,
4. ein Pull Request zurück nach `main` wird geöffnet oder aktualisiert.

Damit wird das geschützte `main` nicht direkt beschrieben.

Wenn alle Bilder bytegleich sind, wird kein neuer Commit und kein PR erzeugt.

## Technischer Renderweg

```text
abfahrt.js
  │
  ├── DEFAULT_WIDGET_CONFIG.small ──► Widget klein
  ├── DEFAULT_WIDGET_CONFIG.large ──► Widget groß
  ├── DEFAULT_FULLSCREEN_CONFIG ────► Fullscreen · Gleis
  └── renderTripProgressHTML ───────► Fahrtverlauf (normal)
                    │
                    ▼
       scripts/render-widget-preview.mjs
                    │
                    ▼
          deterministisches HTML
                    │
                    ▼
             Headless Chrome
                    │
                    ▼
             vier README-PNGs
```

## Grenzen der Vorschau

Die erzeugten Grafiken sind **Dokumentationsvorschauen**, keine pixelgenauen iOS-Screenshots.

Das reale Ergebnis hängt weiterhin ab von:

- iOS-Version
- Scriptable-Version
- tatsächlicher Widget-Größe
- Schriftmetriken auf dem Gerät
- realen Haltestellen- und Abfahrtsdaten

Die Vorschauen dienen vor allem als visuelle Regression und als kompakte Produktdarstellung im README. Die finale Prüfung auf einem echten Gerät ersetzen sie nicht.

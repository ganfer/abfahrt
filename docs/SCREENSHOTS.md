# Widget-Vorschau

Die Widget-Vorschau im README wird automatisch durch `.github/workflows/widget-screenshot.yml` erzeugt.

## Warum keine echte Scriptable-Aufnahme?

Scriptable ist eine iOS-Laufzeitumgebung und kann nicht nativ auf den Linux-Runnern von GitHub Actions ausgeführt werden.

Die CI behauptet deshalb ausdrücklich **nicht**, einen iOS-Simulator zu verwenden.

Stattdessen liest `scripts/render-widget-preview.mjs` die aktuelle `DEFAULT_WIDGET_CONFIG` aus `abfahrt.js` und baut daraus eine deterministische HTML-Darstellung des Widgets.

## Ziel

Die Vorschau soll bei Änderungen sichtbar machen, ob sich das Default-Layout plausibel verändert.

Sie übernimmt aus der Runtime unter anderem:

- sichtbare Spalten
- Spaltenbreiten
- Abstände
- Badge-Höhe
- Schriftgrößen

Für Daten und Uhrzeit werden feste Fixtures verwendet.

Dadurch benötigt der Workflow:

- keinen TRIAS-Key
- keinen Standort
- keine Live-Netzwerkdaten aus EFA-BW

## Ablauf bei Pull Requests

Wenn sich eine für die Vorschau relevante Datei ändert, rendert der Workflow eine neue PNG-Datei.

Relevante Dateien sind aktuell:

- `abfahrt.js`
- `abfahrt-config.js`
- `scripts/render-widget-preview.mjs`
- `.github/workflows/widget-screenshot.yml`

Die PNG wird als Workflow-Artefakt hochgeladen und kann im Pull Request visuell geprüft werden.

## Ablauf auf `main`

Bei einem relevanten Push nach `main` wird dieselbe Vorschau erzeugt und mit `docs/assets/widget-preview.png` verglichen.

Wenn sich die Bilddatei geändert hat:

1. commitet der Workflow das neue PNG,
2. pusht es nach `automation/widget-screenshot`,
3. öffnet oder aktualisiert einen Pull Request zurück nach `main`.

Damit wird das geschützte `main` nicht direkt beschrieben.

Wenn die Repository-Einstellung GitHub Actions das Erstellen von Pull Requests verbietet, bleibt der aktualisierte Branch trotzdem bestehen. Der Workflow gibt dann nur eine Warnung aus, statt nach erfolgreichem Rendern als fehlgeschlagen zu gelten.

Wenn das Bild bytegleich ist, wird weder ein Branch noch ein PR erzeugt.

## Feste Demodaten

Die Vorschau enthält bewusst mehrere Zustände, damit wichtige visuelle Varianten sichtbar bleiben.

Dazu gehören unter anderem:

- normale Live-Abfahrt
- Verspätung
- reine Sollfahrplanzeile
- Ausfall

Die Uhrzeit ist ebenfalls fest, damit derselbe Code immer dasselbe Bild erzeugen kann.

## Technischer Renderweg

```text
abfahrt.js
  │
  └── DEFAULT_WIDGET_CONFIG
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
docs/assets/widget-preview.png
```

Der Chrome-Runner verwendet eine Smartphone-Größe von 430 × 932 Pixeln.

## Grenzen der Vorschau

Die erzeugte Grafik ist eine **Dokumentationsvorschau**, kein pixelgenauer iOS-Screenshot.

Das reale Ergebnis hängt weiterhin ab von:

- iOS-Version
- Scriptable-Version
- tatsächlicher Widget-Größe
- Schriftmetriken auf dem Gerät
- realen Haltestellen- und Abfahrtsdaten

Wenn eine Rendering-Änderung nicht allein durch die ausgelesenen Default-Werte beschrieben wird, muss gegebenenfalls auch `scripts/render-widget-preview.mjs` angepasst werden.

## Warum die Vorschau trotzdem sinnvoll ist

Die Vorschau dient als visuelle Regression auf Repository-Ebene.

Sie beantwortet schnell Fragen wie:

- Sind Default-Spalten noch sichtbar?
- Sind Abstände plausibel?
- Ist der Header nach einer Änderung noch stimmig?
- Hat sich eine Widget-Konfiguration unbeabsichtigt auf das Standardbild ausgewirkt?

Die finale Prüfung auf einem echten Gerät ersetzt sie nicht.

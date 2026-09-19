# vag-widget

Scriptable iOS widget for **VAG Freiburg departures** (TRIAS API of EFA-BW).

## Features

- Default view: **Brauerei Ganter** (both platforms), planned time + delay, colour-coded countdown, cancellations as `entfällt`.
- **Tap the widget** → Scriptable opens, resolves nearby stops via GPS, stores the selected stop and opens the fullscreen departures view.
- After a location change, `VagAbfahrten.js` can start a second **non-interactive refresh run** of itself. This is configurable under **Widget** and does not re-enter GPS/fullscreen logic.
- **GPS nearby mode**: set the widget parameter to `nearby` when the TRIAS key is stored in Keychain, or `<key>|nearby` otherwise. The widget tap preserves that mode in the Scriptable URL, so the foreground run can call `Location.current()`, query nearby stops through TRIAS `LocationInformationRequest`, let you pick one, and show departures.
- Works on Wi-Fi and mobile data because it talks to EFA-BW directly.

## Setup

1. Install Scriptable.
2. Create a new script, paste `VagAbfahrten.js`, and name it exactly `VagAbfahrten`.
3. Add a Scriptable widget and select that script.
4. Store the TRIAS requestor key either in the widget parameter or once in Keychain using the script's setup mode.
5. For GPS nearby mode, set the widget parameter to `nearby` if the key is in Keychain.

## Location flow

```text
Home Screen widget
  -> tap VagAbfahrten
  -> Location.current()
  -> TRIAS LocationInformationRequest
  -> nearby stop picker
  -> selected stop stored in Keychain
  -> VagAbfahrten?parameter=refresh (non-interactive second run)
  -> fullscreen departures for the same stored stop
```

Widget and fullscreen therefore share one active stop in Keychain. The refresh parameter exits through a dedicated widget-only path before GPS or fullscreen logic. This preserves the working second execution point without a separate helper file.

## Development

```sh
node --test test/widget.test.js
```

The tests cover parsing, TRIAS XML builders, delay math, parameter handling, the Scriptable URL handoff, and the foreground query-parameter path.

## License

MIT.


## Update aus GitHub

Updates werden über `VagAbfahrten-Config.js` → **Update** installiert. Dabei werden `VagAbfahrten.js` und `VagAbfahrten-Config.js` aus dem `main`-Branch aktualisiert.

Alle verwalteten Dateien werden vor dem Überschreiben validiert. Die Validierung verwendet eindeutige Inhaltsmarker statt einer Mindest-Dateigröße, sodass auch kleine Hilfsskripte sicher aktualisiert werden können. Die Fullscreen-Anzeige ist direkt in `VagAbfahrten.js` integriert; ein separates `VagAbfahrten-Display.js` wird nicht mehr benötigt.

Der TRIAS-Key und die zuletzt ausgewählte Haltestelle liegen im iOS-Keychain und werden durch ein Script-Update nicht verändert.

> **Hinweis:** Beim nächsten Update über die Config wird eine eventuell noch vorhandene alte `VagAbfahrten-Display.js` automatisch aus dem Scriptable-Speicher entfernt.


## Widget-Konfiguration

Für persönliche Layout-Einstellungen gibt es `VagAbfahrten-Config.js`. Das Skript wird direkt in Scriptable gestartet und führt per Dialog durch die Konfiguration.

Konfigurierbar sind:

- Anzahl der sichtbaren Abfahrten
- Sichtbarkeit und Breite von Linie, Richtung, Gleis, Abfahrtszeit und Restzeit
- Spalten- und Zeilenabstand
- Schriftgrößen
- optionaler Widget-Refresh nach einem Standortwechsel
- gemeinsame Standortlogik mit automatischer fixierter Haltestelle und konfigurierbarem Radius (Standard 200 m)
- Zurücksetzen auf die Standardwerte

Die Einstellungen werden separat als `VagAbfahrten.config.json` im Scriptable-iCloud-Ordner gespeichert. `VagAbfahrten.js` lädt diese Datei automatisch; fehlt sie oder ist sie ungültig, werden die eingebauten Standardwerte verwendet.

Der GitHub-Updater aktualisiert `VagAbfahrten.js` und `VagAbfahrten-Config.js`, **nicht** aber `VagAbfahrten.config.json`. Persönliche Einstellungen bleiben bei Updates daher erhalten.


### Standort-Fallback

Unter **Config → Standort** kann der Fallback auf die zuletzt verwendete Haltestelle aktiviert oder deaktiviert werden (Standard: **AN**). Wenn GPS nicht verfügbar ist, die TRIAS-Ortssuche fehlschlägt oder keine auswertbare Haltestelle liefert, kann die Fullscreen-Ansicht mit der zuletzt verwendeten Haltestelle fortfahren. Existiert noch keine zuletzt verwendete Haltestelle, bleibt die normale Fehlerdiagnose erhalten.

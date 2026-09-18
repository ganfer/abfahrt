# vag-widget

Scriptable iOS widget for **VAG Freiburg departures** (TRIAS API of EFA-BW).

## Features

- Default view: **Brauerei Ganter** (both platforms), planned time + delay, colour-coded countdown, cancellations as `entfällt`.
- **Tap the widget** → Scriptable opens briefly and refreshes data.
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
  -> tap
  -> scriptable:///run/VagAbfahrten?parameter=nearby
  -> foreground Scriptable run
  -> args.queryParameters.parameter
  -> Location.current()
  -> TRIAS LocationInformationRequest
  -> nearby stop picker
  -> departures
```

The important part is that `nearby` is explicitly carried from the widget run into the foreground run. Without that, Scriptable starts the script without the widget parameter and the GPS branch is skipped.

## Development

```sh
node --test test/widget.test.js
```

The tests cover parsing, TRIAS XML builders, delay math, parameter handling, the Scriptable URL handoff, and the foreground query-parameter path.

## License

MIT.


## Update aus GitHub

Updates werden über `VagAbfahrten-Config.js` → **Update** installiert. Dabei werden `VagAbfahrten.js` und `VagAbfahrten-Config.js` aus dem `main`-Branch aktualisiert.

Die Downloads werden vor dem Überschreiben validiert. Die Fullscreen-Anzeige ist direkt in `VagAbfahrten.js` integriert; ein separates `VagAbfahrten-Display.js` wird nicht mehr benötigt.

Der TRIAS-Key und die zuletzt ausgewählte Haltestelle liegen im iOS-Keychain und werden durch ein Script-Update nicht verändert.

> **Hinweis:** Beim nächsten Update über die Config wird eine eventuell noch vorhandene alte `VagAbfahrten-Display.js` automatisch aus dem Scriptable-Speicher entfernt.


## Widget-Konfiguration

Für persönliche Layout-Einstellungen gibt es `VagAbfahrten-Config.js`. Das Skript wird direkt in Scriptable gestartet und führt per Dialog durch die Konfiguration.

Konfigurierbar sind:

- Anzahl der sichtbaren Abfahrten
- Sichtbarkeit und Breite von Linie, Richtung, Gleis, Abfahrtszeit und Restzeit
- Spalten- und Zeilenabstand
- Schriftgrößen
- Zurücksetzen auf die Standardwerte

Die Einstellungen werden separat als `VagAbfahrten.config.json` im Scriptable-iCloud-Ordner gespeichert. `VagAbfahrten.js` lädt diese Datei automatisch; fehlt sie oder ist sie ungültig, werden die eingebauten Standardwerte verwendet.

Der GitHub-Updater aktualisiert `VagAbfahrten.js` und `VagAbfahrten-Config.js`, **nicht** aber `VagAbfahrten.config.json`. Persönliche Einstellungen bleiben bei Updates daher erhalten.

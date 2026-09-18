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

# vag-widget

**Current version: v1.0.3**

Scriptable iOS widget for **VAG Freiburg departures** using the EFA-BW TRIAS API.

## What it does

The Home Screen widget shows departures for the currently active stop. By default, before any stop has been selected, it falls back to **Bertoldsbrunnen**. A tap opens Scriptable and runs the interactive location flow:

```text
Home Screen widget
  → GPS location
  → EFA-BW nearby-stop search
  → automatic pinned-stop selection OR stop picker
  → active stop stored in Keychain
  → optional immediate widget refresh
  → fullscreen departures
```

Pinned stops can be selected automatically when they are within the configured radius (default **200 m**). The picker marks pinned and recently used stops and shows their distance when TRIAS provides usable coordinates. At the bottom of the GPS picker, **Fixierte Haltestellen** opens all pinned stops for direct selection; choosing one uses the same active-stop, widget-refresh and fullscreen flow as a live nearby stop. If GPS or the nearby search fails, the last active stop can be used as a fallback.

## Installation

The recommended installation path is **`VagAbfahrten-Init.js`**. Run it once in Scriptable. It installs the runtime and Config scripts and then removes itself.

The installed scripts are:

- **`VagAbfahrten.js`** — Home Screen widget, GPS/location flow, TRIAS requests, immediate refresh path and fullscreen view.
- **`VagAbfahrten-Config.js`** — personal settings, pinned stops and integrated updater.

The TRIAS requestor key can be stored once in the iOS Keychain. It does not need to be kept in the widget parameter.

## Configuration

Run **`VagAbfahrten-Config`** in Scriptable.

### Widget

Configure the number of departures, visible columns, widths, spacing, font sizes and **Widget sofort aktualisieren** after a location change. The refresh uses a second non-interactive execution of `VagAbfahrten.js` with `parameter=refresh`; that path exits before GPS or fullscreen logic.

### Fullscreen

Configure the number of departures, visible columns, widths and font size independently of the compact widget.

### Standort

Configure automatic pinned-stop selection and its radius. The radius is relevant only while automatic selection is enabled. For GPS or TRIAS lookup failures, choose **Last stop**, **🏠 Home**, or **No fallback**. If Home is selected but no Home stop exists, the last active stop is used as a safety fallback.

### Fixierte Haltestellen

Stops can be pinned from recent history or found through the TRIAS stop search. A pinned stop can have a custom display name. Exactly one pinned stop can additionally be marked as **🏠 Home**. Home is always shown first in the pinned-stop picker and uses the house icon instead of the normal pin.

Personal settings are stored in **`VagAbfahrten.config.json`** in Scriptable's iCloud directory. Runtime and Config await an iCloud download before reading the file. If it is missing or invalid, built-in defaults are used.

## Display and status

Both compact and fullscreen views use realtime data when available. Delays and cancellations are highlighted. Common transport/API failures are translated into concise user-facing messages; the compact widget shows the time of the failed refresh and fullscreen shows the time of the last attempt.

## Updates and versioning

Runtime, Config and installer share **`APP_VERSION`**. The Config title shows the installed version.

Use **Config → Auf Updates prüfen** to install the current runtime and Config from the GitHub `main` branch. The updater validates downloaded files before replacing local copies and preserves:

- `VagAbfahrten.config.json`
- the TRIAS Keychain entry
- the active/last stop
- pinned and recent stops

Retired helper scripts such as `VagAbfahrten-Display.js` and `VagAbfahrten-Refresh.js` are cleaned from Scriptable storage by the current updater.

## Defaults

| Setting | Default |
| --- | --- |
| Widget departures | 5 |
| Fullscreen departures | 8 |
| Automatic pinned stop | On |
| Automatic-selection radius | 200 m |
| Location fallback | Last stop |
| Immediate widget refresh after location change | On |

TRIAS departure result requests are sized to the configured view and clamped to **1–30** results.

## Troubleshooting

If the widget reports that the TRIAS key was rejected, verify the Keychain value. If GPS is unavailable, check Scriptable's Location permission; with the fallback enabled, an existing last stop can still be opened. If EFA-BW cannot be reached or its response cannot be parsed, the UI shows a concise error while location-specific diagnostic dialogs retain additional technical detail.

If an update appears stale, run **Config → Auf Updates prüfen** again. The updater uses cache-busted GitHub downloads and validates all managed files before writing them.

## Development

Every push to `main` and every pull request runs the GitHub Actions CI pipeline on Node 22 and 24. It performs JavaScript syntax checks, the regression suite, repository/version consistency checks and publishes a JUnit XML report as a workflow artifact. GitHub Actions dependencies are kept current through Dependabot.

Run the same regression suite locally with:

```sh
node --test test/*.test.js
```

The suite checks important source contracts around TRIAS request construction/parsing, platform extraction, configured result counts, iCloud config loading, location/refresh behavior, updater wiring and user-facing error states.

## License

MIT.

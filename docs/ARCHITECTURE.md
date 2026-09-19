# Architecture

## Components

| Component | Responsibility |
| --- | --- |
| `VagAbfahrten.js` | Runtime, TRIAS requests/parsing, GPS stop selection, compact Scriptable widget, fullscreen departures and offline fallback consumption. |
| `VagAbfahrten-Config.js` | User configuration, pinned stops, filters, update channels, diagnostics, backup/restore and offline-data maintenance. |
| `VagAbfahrten-Init.js` | One-time Stable-first installer. It resolves the latest GitHub Release and installs Runtime + Config from the same release tag. |
| `scripts/build-gtfs.py` | Builds the compact offline timetable snapshot from the statewide GTFS feed. |
| `gtfs-data` branch | Generated offline timetable data. Kept separate from application source and force-refreshed by the scheduled pipeline. |

`VagAbfahrten-Refresh.js` was an old helper from the earlier multi-script flow and is no longer part of the managed installation. Refresh is now handled by the integrated runtime.

## Runtime flow

The Home Screen widget is passive: it renders the last active stop, or Bertoldsbrunnen when no stop has been selected yet. Tapping it opens `VagAbfahrten` in Scriptable, where the foreground flow requests GPS, resolves nearby stops, optionally auto-selects an eligible pinned stop, persists the selected stop and opens the fullscreen departures table.

TRIAS remains the primary departure source. If a TRIAS request fails and the requested stop is eligible for the local cache, the runtime can use scheduled GTFS data as a fallback.

## Persistence

The TRIAS requestor key and small runtime state are stored in iOS Keychain. Personal layout settings are stored in `VagAbfahrten.config.json`. Offline GTFS shards are stored below the Scriptable documents directory.

Diagnostics are designed to avoid exposing the requestor key, stop references, stop names and coordinates.

## Updates

Stable resolves the latest published GitHub Release and installs Runtime + Config from that exact tag. Development resolves the current `main` commit and downloads all managed files from that exact commit.

The installer and updater validate downloaded source markers and versions before replacing the managed scripts.

## CI contracts

The normal CI runs syntax checks, regression tests and repository/version consistency checks on Node 22. For internal pull requests it can automatically bump the Development patch version when updater-relevant files change.

The separate widget screenshot workflow renders a deterministic smartphone preview for documentation. See [SCREENSHOTS.md](SCREENSHOTS.md).

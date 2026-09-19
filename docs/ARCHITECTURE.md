# Architecture

## Components

| Component | Responsibility |
| --- | --- |
| `abfahrt.js` | Runtime, TRIAS requests/parsing, GPS stop selection, compact Scriptable widget, fullscreen departures and offline fallback consumption. |
| `abfahrt-Config.js` | User configuration plus the central package lifecycle: install, Stable/Development update, repair, uninstall, validation, pinned stops, filters, diagnostics, backup/restore and offline-data maintenance. |
| `abfahrt-Install.js` | Small versionless bootstrap. It resolves the latest Stable GitHub Release, installs the released Config and hands the remaining installation lifecycle to Config. |
| `scripts/build-gtfs.py` | Builds the compact offline timetable snapshot from the statewide GTFS feed. |
| `gtfs-data` branch | Generated offline timetable data. Kept separate from application source and force-refreshed by the scheduled pipeline. |

`abfahrt-Refresh.js` was an old helper from the earlier multi-script flow and is no longer part of the managed installation. Refresh is now handled by the integrated runtime.

## Runtime flow

The Home Screen widget is passive: it renders the last active stop, or Bertoldsbrunnen when no stop has been selected yet. Tapping it opens `abfahrt` in Scriptable, where the foreground flow requests GPS, resolves nearby stops, optionally auto-selects an eligible pinned stop, persists the selected stop and opens the fullscreen departures table.

TRIAS remains the primary departure source. If a TRIAS request fails and the requested stop is eligible for the local cache, the runtime can use scheduled GTFS data as a fallback.

## Persistence

The TRIAS requestor key and small runtime state are stored in iOS Keychain. Personal layout settings are stored in `abfahrt.config.json`. Offline GTFS shards are stored below the Scriptable documents directory.

Diagnostics are designed to avoid exposing the requestor key, stop references, stop names and coordinates.

## Updates

Stable resolves the latest published GitHub Release and installs Runtime + Config from that exact tag. Development resolves the current `main` commit and downloads all managed files from that exact commit.

The bootstrap installer is not an app-versioned component. Runtime and Config are the managed application files and share `APP_VERSION`.

For current Stable releases, the Release workflow creates `release-manifest.json` with SHA-256 hashes for Runtime and Config. Config resolves the exact release tag, validates source markers/version and verifies downloaded bytes against that manifest before replacing the managed scripts. Releases from before manifest support use the previous marker/version validation as a compatibility path.

A bootstrap installation stores a short pending-install handoff in Keychain and launches the released Config. Config then downloads the complete managed set, writes it with rollback protection, removes installer artifacts and clears the handoff state. The same central managed-file definition is reused by updates, Recovery and Uninstall.

## CI contracts

The normal CI runs syntax checks, regression tests and repository/version consistency checks on Node 22. For internal pull requests it can automatically bump the Development patch version when updater-relevant files change.

The separate widget screenshot workflow renders a deterministic smartphone preview for documentation. See [SCREENSHOTS.md](SCREENSHOTS.md).

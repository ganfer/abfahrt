# Offline GTFS data

VagAbfahrten prepares scheduled public-transport data from the statewide
MobiData BW/NVBW `bwgesamt` GTFS feed. The generated snapshot is intended as
an offline fallback for the configured **angepinnte stops and recently used stops**.

## Architecture

The scheduled GitHub Actions workflow `.github/workflows/gtfs-data.yml` checks
the upstream GTFS import timestamp once per day and also compares the published
schema with the builder schema. If the source or schema changed, it downloads
the `bwgesamt` feed without shapes, runs `scripts/build-gtfs.py`, validates the
result and force-publishes a fresh snapshot to the dedicated `gtfs-data` branch.

The data branch intentionally has no growing history. Application source code
and generated timetable data remain separate.

Generated files:

- `manifest.json`: schema version, validity, source and attribution.
- `index.json`: logical IFOPT stop → shard, name, coordinates and GTFS stop IDs.
- `00.json` … `ff.json`: timetable shards. Only shards that contain stops are emitted.

A TRIAS platform reference such as `de:08311:30100:0:1` is normalized to the
logical IFOPT stop `de:08311:30100`. The GTFS `stop_id` is the canonical
identity; `parent_station` is retained as an additional alias instead of
replacing that identity. This keeps TRIAS-compatible IFOPT/DHID references
usable even when the feed uses a synthetic parent ID.

Each departure is stored compactly as:

```json
[38520, "1", "Littenweiler", "service-id"]
```

The fields are departure seconds after midnight, line, destination/headsign and
GTFS service ID. Service calendars and calendar exceptions required by a shard
are embedded in that shard.

## Source and license

Source: MobiData BW / NVBW, Soll-Fahrplandaten Baden-Württemberg.

Attribution: **Datenpaket: MobiData BW; NVBW**

License: Datenlizenz Deutschland – Namensnennung – Version 2.0.

Scriptable downloads only the shard(s) required by the currently configured
angepinnte and recently used stops. TRIAS remains primary; the local GTFS cache
is used only when the TRIAS departure request fails. Automatic refresh is
best-effort and keeps an existing cache intact if a download fails.

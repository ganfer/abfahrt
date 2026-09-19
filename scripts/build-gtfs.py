#!/usr/bin/env python3
"""Build compact GTFS timetable shards for abfahrt.

The source is the MobiData BW/NVBW bwgesamt GTFS feed without shapes. The
output is intentionally optimized for Scriptable: a deterministic manifest,
an IFOPT lookup and 256 JSON timetable shards. Each shard contains only the
service calendars referenced by departures in that shard.

Usage:
  python3 scripts/build-gtfs.py bwgesamt.zip output-directory
  python3 scripts/build-gtfs.py --validate output-directory
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 2
SOURCE_NAME = "MobiData BW / NVBW"
SOURCE_DATASET = "Soll-Fahrplandaten Baden-Württemberg (bwgesamt, ohne Linienverlauf)"
SOURCE_URL = "https://www.nvbw.de/fileadmin/user_upload/service/open_data/fahrplandaten_ohne_liniennetz/bwgesamt.zip"
LICENSE = "Datenlizenz Deutschland – Namensnennung – Version 2.0"
IFOPT_RE = re.compile(r"^([A-Za-z]{2}:[^:]+:[^:]+)(?::.*)?$")


def canonical_stop_id(stop_id: str, parent_station: str = "") -> str:
    """Return the logical station key used by TRIAS pins and GTFS."""
    candidate = (parent_station or stop_id or "").strip()
    match = IFOPT_RE.match(candidate)
    return match.group(1) if match else candidate


def shard_for(stop_id: str) -> str:
    return hashlib.sha1(stop_id.encode("utf-8")).hexdigest()[:2]


def read_csv(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as raw:
        text = (line.decode("utf-8-sig", errors="replace") for line in raw)
        yield from csv.DictReader(text)


def parse_time(value: str):
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != 3:
        return None
    try:
        h, m, s = map(int, parts)
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


def feed_info(zf):
    rows = list(read_csv(zf, "feed_info.txt")) if "feed_info.txt" in zf.namelist() else []
    return rows[0] if rows else {}


def build(zip_path: Path, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    db_file = tempfile.NamedTemporaryFile(prefix="abfahrt-gtfs-", suffix=".sqlite", delete=False)
    db_file.close()
    db = sqlite3.connect(db_file.name)
    try:
        db.executescript("""
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=FILE;
        CREATE TABLE routes(route_id TEXT PRIMARY KEY, short_name TEXT, long_name TEXT);
        CREATE TABLE trips(trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT, headsign TEXT);
        CREATE TABLE stops(stop_id TEXT PRIMARY KEY, canonical_id TEXT, name TEXT, lat REAL, lon REAL);
        CREATE INDEX stops_canonical ON stops(canonical_id);
        CREATE TABLE stop_times(stop_id TEXT, trip_id TEXT, departure INTEGER, stop_sequence INTEGER);
        CREATE INDEX stop_times_stop ON stop_times(stop_id);
        CREATE INDEX stop_times_trip ON stop_times(trip_id);
        CREATE TABLE calendar(service_id TEXT PRIMARY KEY, weekdays TEXT, start_date TEXT, end_date TEXT);
        CREATE TABLE calendar_dates(service_id TEXT, date TEXT, exception_type INTEGER);
        CREATE INDEX calendar_dates_service ON calendar_dates(service_id);
        """)

        with zipfile.ZipFile(zip_path) as zf:
            info = feed_info(zf)

            db.executemany(
                "INSERT OR REPLACE INTO routes VALUES (?,?,?)",
                ((r.get("route_id",""), r.get("route_short_name",""), r.get("route_long_name",""))
                 for r in read_csv(zf, "routes.txt")),
            )
            db.executemany(
                "INSERT OR REPLACE INTO trips VALUES (?,?,?,?)",
                ((r.get("trip_id",""), r.get("route_id",""), r.get("service_id",""), r.get("trip_headsign",""))
                 for r in read_csv(zf, "trips.txt")),
            )

            stop_rows = []
            lookup = defaultdict(set)
            names = {}
            coords = {}
            for r in read_csv(zf, "stops.txt"):
                stop_id = r.get("stop_id", "").strip()
                if not stop_id:
                    continue
                parent_station = r.get("parent_station", "").strip()
                # Timetable rows belong to the stop/platform itself. A parent_station
                # is useful as an alias, but must not replace an IFOPT/DHID stop_id:
                # MobiData feeds can use synthetic parent IDs (e.g. *_Parent) that do
                # not match the TRIAS logical-stop reference.
                canonical = canonical_stop_id(stop_id)
                name = r.get("stop_name", "").strip()
                lat = float(r["stop_lat"]) if r.get("stop_lat") else None
                lon = float(r["stop_lon"]) if r.get("stop_lon") else None
                stop_rows.append((stop_id, canonical, name, lat, lon))
                lookup[canonical].add(stop_id)
                lookup[canonical].add(canonical)
                if parent_station:
                    parent_alias = canonical_stop_id(parent_station)
                    lookup[parent_alias].add(stop_id)
                    lookup[parent_alias].add(parent_station)
                    if name and parent_alias not in names:
                        names[parent_alias] = name
                    if lat is not None and lon is not None and parent_alias not in coords:
                        coords[parent_alias] = [lat, lon]
                if name and canonical not in names:
                    names[canonical] = name
                if lat is not None and lon is not None and canonical not in coords:
                    coords[canonical] = [lat, lon]
            db.executemany("INSERT OR REPLACE INTO stops VALUES (?,?,?,?,?)", stop_rows)

            if "calendar.txt" in zf.namelist():
                db.executemany(
                    "INSERT OR REPLACE INTO calendar VALUES (?,?,?,?)",
                    ((r.get("service_id",""),
                      "".join("1" if r.get(day) == "1" else "0" for day in
                              ("monday","tuesday","wednesday","thursday","friday","saturday","sunday")),
                      r.get("start_date",""), r.get("end_date",""))
                     for r in read_csv(zf, "calendar.txt")),
                )
            if "calendar_dates.txt" in zf.namelist():
                db.executemany(
                    "INSERT INTO calendar_dates VALUES (?,?,?)",
                    ((r.get("service_id",""), r.get("date",""), int(r.get("exception_type") or 0))
                     for r in read_csv(zf, "calendar_dates.txt")),
                )

            batch = []
            for r in read_csv(zf, "stop_times.txt"):
                dep = parse_time(r.get("departure_time", ""))
                if dep is None:
                    continue
                batch.append((r.get("stop_id",""), r.get("trip_id",""), dep, int(r.get("stop_sequence") or 0)))
                if len(batch) >= 100_000:
                    db.executemany("INSERT INTO stop_times VALUES (?,?,?,?)", batch)
                    batch.clear()
            if batch:
                db.executemany("INSERT INTO stop_times VALUES (?,?,?,?)", batch)
            db.commit()

        # Alias entries must point at timetable data too. The DB rows use the
        # canonicalized stop_id, so copy departures from every physical stop
        # represented by an alias when shards are generated.
        canonical_sources = defaultdict(set)
        for stop_id, canonical_id in db.execute("SELECT stop_id,canonical_id FROM stops"):
            canonical_sources[canonical_id].add(canonical_id)
        for alias, stop_ids in lookup.items():
            for stop_id in stop_ids:
                row = db.execute("SELECT canonical_id FROM stops WHERE stop_id=?", (stop_id,)).fetchone()
                if row:
                    canonical_sources[alias].add(row[0])

        index = {}
        for canonical in sorted(lookup):
            index[canonical] = {
                "shard": shard_for(canonical),
                "name": names.get(canonical, ""),
                "stopIds": sorted(lookup[canonical]),
            }
            if canonical in coords:
                index[canonical]["coordinates"] = coords[canonical]

        (out_dir / "index.json").write_text(
            json.dumps({"schemaVersion": SCHEMA_VERSION, "stops": index}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        shard_ids = sorted(set(v["shard"] for v in index.values()))
        for shard in shard_ids:
            canonical_ids = [k for k, v in index.items() if v["shard"] == shard]
            placeholders = ",".join("?" for _ in canonical_ids)
            query = f"""
                SELECT s.canonical_id, st.departure, t.service_id,
                       COALESCE(NULLIF(r.short_name,''), r.long_name, ''),
                       COALESCE(t.headsign,'')
                FROM stop_times st
                JOIN stops s ON s.stop_id = st.stop_id
                JOIN trips t ON t.trip_id = st.trip_id
                JOIN routes r ON r.route_id = t.route_id
                WHERE s.canonical_id IN ({placeholders})
                ORDER BY s.canonical_id, st.departure, t.trip_id
            """
            departures = defaultdict(list)
            services_used = set()
            source_ids = sorted(set().union(*(canonical_sources[cid] for cid in canonical_ids)))
            source_ph = ",".join("?" for _ in source_ids)
            source_query = query.replace(placeholders, source_ph)
            by_source = defaultdict(list)
            for source, departure, service_id, line, headsign in db.execute(source_query, source_ids):
                item = [departure, line, headsign, service_id]
                by_source[source].append(item)
                services_used.add(service_id)
            for canonical in canonical_ids:
                seen = set()
                for source in canonical_sources[canonical]:
                    for item in by_source[source]:
                        key = tuple(item)
                        if key not in seen:
                            departures[canonical].append(item)
                            seen.add(key)
                departures[canonical].sort(key=lambda item: item[0])

            services = {}
            if services_used:
                service_list = sorted(services_used)
                service_ph = ",".join("?" for _ in service_list)
                for sid, weekdays, start, end in db.execute(
                    f"SELECT service_id,weekdays,start_date,end_date FROM calendar WHERE service_id IN ({service_ph})",
                    service_list,
                ):
                    services[sid] = {"weekdays": weekdays, "start": start, "end": end, "exceptions": []}
                for sid, date, typ in db.execute(
                    f"SELECT service_id,date,exception_type FROM calendar_dates WHERE service_id IN ({service_ph}) ORDER BY service_id,date",
                    service_list,
                ):
                    services.setdefault(sid, {"weekdays": "0000000", "start": "", "end": "", "exceptions": []})
                    services[sid]["exceptions"].append([date, typ])

            payload = {
                "schemaVersion": SCHEMA_VERSION,
                "services": services,
                "stops": {cid: departures.get(cid, []) for cid in canonical_ids},
            }
            (out_dir / f"{shard}.json").write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
            )

        source_imported_at = os.environ.get("GTFS_IMPORTED_AT", "").strip()
        if source_imported_at.startswith('"') and source_imported_at.endswith('"'):
            try:
                decoded = json.loads(source_imported_at)
                if isinstance(decoded, str):
                    source_imported_at = decoded
            except json.JSONDecodeError:
                pass
        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": SOURCE_NAME,
            "dataset": SOURCE_DATASET,
            "sourceUrl": SOURCE_URL,
            "sourceImportedAt": source_imported_at,
            "feedVersion": info.get("feed_version", ""),
            "validFrom": info.get("feed_start_date", ""),
            "validUntil": info.get("feed_end_date", ""),
            "license": LICENSE,
            "attribution": "Datenpaket: MobiData BW; NVBW",
            "index": "index.json",
            "shards": shard_ids,
            "stopCount": len(index),
        }
        (out_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    finally:
        db.close()
        try:
            os.unlink(db_file.name)
        except OSError:
            pass


def validate(out_dir: Path):
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    index = json.loads((out_dir / manifest["index"]).read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == SCHEMA_VERSION
    assert index["schemaVersion"] == SCHEMA_VERSION
    assert manifest["stopCount"] == len(index["stops"])
    assert manifest["shards"], "No timetable shards generated"
    for shard in manifest["shards"]:
        path = out_dir / f"{shard}.json"
        assert path.exists(), f"Missing shard {shard}"
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert payload["schemaVersion"] == SCHEMA_VERSION
    print(f"Validated {manifest['stopCount']} logical stops in {len(manifest['shards'])} shards.")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--validate":
        validate(Path(sys.argv[2]))
        return
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-gtfs.py <gtfs.zip> <output-dir> | --validate <output-dir>")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
    validate(Path(sys.argv[2]))


if __name__ == "__main__":
    main()

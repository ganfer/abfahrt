#!/usr/bin/env python3
"""Read-only compatibility audit for a MobiData BW GTFS ZIP and an abfahrt snapshot.

The production publisher remains untouched. Detect broken foreign-key joins that
would silently discard departures and check the emitted Scriptable shard format.
"""

import argparse
import csv
import io
import json
import sqlite3
import sys
import tempfile
import zipfile
from collections import Counter
from pathlib import Path

REQUIRED = {
    'routes.txt': {'route_id', 'route_short_name', 'route_long_name'},
    'trips.txt': {'trip_id', 'route_id', 'service_id'},
    'stops.txt': {'stop_id'},
    'stop_times.txt': {'trip_id', 'stop_id', 'departure_time'},
}
BATCH = 50000


def rows(zf, filename):
    with zf.open(filename) as binary, io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as stream:
        yield from csv.DictReader(stream)


def analyze_feed(zip_path, report, issues):
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        missing_files = sorted(REQUIRED.keys() - names)
        if missing_files:
            issues.append('Required files missing: ' + ', '.join(missing_files))
            return
        for filename, required in REQUIRED.items():
            with zf.open(filename) as binary, io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as stream:
                columns = set((csv.DictReader(stream).fieldnames or []))
            missing_columns = required - columns
            if missing_columns:
                issues.append(f'{filename}: missing columns {sorted(missing_columns)}')
        if issues:
            return
        with tempfile.TemporaryDirectory(prefix='abfahrt-audit-') as temp:
            db = sqlite3.connect(str(Path(temp) / 'audit.sqlite'))
            try:
                db.executescript("""
                    PRAGMA journal_mode=OFF;
                    PRAGMA synchronous=OFF;
                    CREATE TABLE routes(id TEXT PRIMARY KEY);
                    CREATE TABLE trips(id TEXT PRIMARY KEY, route_id TEXT);
                    CREATE TABLE stops(id TEXT PRIMARY KEY);
                    CREATE TABLE batch(trip_id TEXT, stop_id TEXT);
                """)
                types = Counter()
                new_columns = {}
                with zf.open('routes.txt') as binary, io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as stream:
                    reader = csv.DictReader(stream)
                    new_columns['routes.txt'] = sorted(set(reader.fieldnames or []) & {'route_color', 'route_text_color'})
                    for row in reader:
                        db.execute('INSERT OR IGNORE INTO routes VALUES (?)', (row['route_id'],))
                        types[row.get('route_type', '')] += 1
                with zf.open('trips.txt') as binary, io.TextIOWrapper(binary, encoding='utf-8-sig', newline='') as stream:
                    reader = csv.DictReader(stream)
                    new_columns['trips.txt'] = sorted(set(reader.fieldnames or []) & {'bikes_allowed'})
                    db.executemany('INSERT OR IGNORE INTO trips VALUES (?,?)',
                                   ((row['trip_id'], row['route_id']) for row in reader))
                db.executemany('INSERT OR IGNORE INTO stops VALUES (?)',
                               ((row['stop_id'],) for row in rows(zf, 'stops.txt')))
                db.commit()
                route_count = db.execute('SELECT COUNT(*) FROM routes').fetchone()[0]
                trip_count = db.execute('SELECT COUNT(*) FROM trips').fetchone()[0]
                stop_count = db.execute('SELECT COUNT(*) FROM stops').fetchone()[0]
                orphan_trips = db.execute("""
                    SELECT COUNT(*) FROM trips t LEFT JOIN routes r ON t.route_id=r.id
                    WHERE r.id IS NULL
                """).fetchone()[0]
                missing_trip = missing_stop = stop_time_count = 0

                def check_batch(batch):
                    if not batch:
                        return 0, 0
                    db.executemany('INSERT INTO batch VALUES (?,?)', batch)
                    missing_t = db.execute("""
                        SELECT COUNT(*) FROM batch b LEFT JOIN trips t ON b.trip_id=t.id
                        WHERE t.id IS NULL
                    """).fetchone()[0]
                    missing_s = db.execute("""
                        SELECT COUNT(*) FROM batch b LEFT JOIN stops s ON b.stop_id=s.id
                        WHERE s.id IS NULL
                    """).fetchone()[0]
                    db.execute('DELETE FROM batch')
                    return missing_t, missing_s

                batch = []
                for row in rows(zf, 'stop_times.txt'):
                    batch.append((row['trip_id'], row['stop_id']))
                    stop_time_count += 1
                    if len(batch) >= BATCH:
                        bad_trip, bad_stop = check_batch(batch)
                        missing_trip += bad_trip
                        missing_stop += bad_stop
                        batch.clear()
                bad_trip, bad_stop = check_batch(batch)
                missing_trip += bad_trip
                missing_stop += bad_stop

                report['feed'] = {
                    'routes': route_count, 'trips': trip_count, 'stops': stop_count,
                    'stopTimes': stop_time_count,
                    'tripsWithoutRoute': orphan_trips,
                    'stopTimesWithoutTrip': missing_trip,
                    'stopTimesWithoutStop': missing_stop,
                    'routeTypes': dict(sorted(types.items())),
                    'newColumnsDetected': new_columns,
                }
                for label, value in [('trips without routes', orphan_trips),
                                     ('stop times without trips', missing_trip),
                                     ('stop times without stops', missing_stop)]:
                    if value:
                        issues.append(f'{value} {label}; builder would discard affected departures')
                if not (route_count and trip_count and stop_count and stop_time_count):
                    issues.append('At least one GTFS core table has no rows')
            finally:
                db.close()


def analyze_snapshot(directory, report, issues):
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    index = json.loads((directory / 'index.json').read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') != 2 or index.get('schemaVersion') != 2:
        issues.append('Unexpected snapshot schemaVersion (Scriptable expects 2)')
    indexed = index.get('stops', {})
    if manifest.get('stopCount') != len(indexed):
        issues.append('Manifest stopCount does not match index')
    departed = 0
    stops_with_departures = 0
    missing_services = 0
    broken_rows = 0
    line_missing = 0
    seen_shards = set()
    for shard in manifest.get('shards', []):
        seen_shards.add(shard)
        payload = json.loads((directory / f'{shard}.json').read_text(encoding='utf-8'))
        if payload.get('schemaVersion') != 2:
            issues.append(f'{shard}: incorrect shard schemaVersion')
        services = payload.get('services', {})
        for stop_id, departures in payload.get('stops', {}).items():
            if stop_id not in indexed or indexed[stop_id]['shard'] != shard:
                issues.append(f'{shard}: stop {stop_id} is missing or wrongly indexed')
            stops_with_departures += bool(departures)
            for departure in departures:
                departed += 1
                if not isinstance(departure, list) or len(departure) != 4:
                    broken_rows += 1
                    continue
                seconds, line, headsign, service_id = departure
                if not isinstance(seconds, int) or seconds < 0 or not isinstance(line, str) or not isinstance(headsign, str):
                    broken_rows += 1
                if service_id not in services:
                    missing_services += 1
                if not line:
                    line_missing += 1
    unlinked = [k for k, v in indexed.items() if v.get('shard') not in seen_shards]
    if unlinked:
        issues.append(f'{len(unlinked)} index entries refer to absent shards')
    if departed == 0:
        issues.append('Snapshot has no departures (possible silent loss during joins)')
    if broken_rows:
        issues.append(f'{broken_rows} malformed departure rows')
    if missing_services:
        issues.append(f'{missing_services} departure rows reference missing service calendars')
    report['snapshot'] = {
        'schemaVersion': manifest.get('schemaVersion'), 'indexedStops': len(indexed),
        'shards': len(seen_shards), 'stopsWithDepartures': stops_with_departures,
        'departures': departed, 'departuresWithoutLine': line_missing,
        'departuresWithoutService': missing_services, 'invalidRows': broken_rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('feed_zip', type=Path)
    parser.add_argument('snapshot_dir', type=Path)
    parser.add_argument('--report', type=Path, default=Path('gtfs-compat-report.json'))
    args = parser.parse_args()
    report = {'source': str(args.feed_zip), 'snapshotPath': str(args.snapshot_dir)}
    issues = []
    try:
        analyze_feed(args.feed_zip, report, issues)
        if (args.snapshot_dir / 'manifest.json').exists():
            analyze_snapshot(args.snapshot_dir, report, issues)
        else:
            issues.append('Snapshot manifest missing: build did not complete')
    except (OSError, ValueError, KeyError, sqlite3.Error, zipfile.BadZipFile) as exc:
        issues.append(f'Unexpected data error: {type(exc).__name__}: {exc}')
    report['issues'] = issues
    report['status'] = 'FAIL' if issues else 'PASS'
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return int(bool(issues))


if __name__ == '__main__':
    sys.exit(main())

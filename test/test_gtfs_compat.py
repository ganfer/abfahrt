"""Regression tests for the NVBW extended GTFS schema (15 November 2026)."""

import csv
import io
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'scripts' / 'build-gtfs.py'
AUDITOR = ROOT / 'scripts' / 'check-gtfs-compat.py'


def csv_bytes(fields, entries):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(entries)
    return stream.getvalue().encode('utf-8')


def fixture(zip_path, orphan_route=False, unknown_stop=False):
    route_fields = ['route_id', 'route_short_name', 'route_long_name', 'route_type',
                    'route_color', 'route_text_color']
    trip_fields = ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'bikes_allowed']
    stop_fields = ['stop_id', 'stop_name', 'stop_lat', 'stop_lon']
    time_fields = ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']
    calendar_fields = ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday',
                       'friday', 'saturday', 'sunday', 'start_date', 'end_date']
    files = {
        'routes.txt': (route_fields, [
            {'route_id': 'DTID:de:08311:line:1', 'route_short_name': '1',
             'route_long_name': 'Straßenbahn 1', 'route_type': '900',
             'route_color': 'EC6602', 'route_text_color': 'FFFFFF'},
            {'route_id': 'old_opaque_route_2', 'route_short_name': 'S1',
             'route_long_name': 'S-Bahn', 'route_type': '109',
             'route_color': '009640', 'route_text_color': 'FFFFFF'},
        ]),
        'trips.txt': (trip_fields, [
            {'trip_id': 'trip-1', 'route_id': 'DTID:de:08311:line:1',
             'service_id': 'daily', 'trip_headsign': 'Littenweiler', 'bikes_allowed': '1'},
            {'trip_id': 'trip-2', 'route_id': 'missing-DTID' if orphan_route else 'old_opaque_route_2',
             'service_id': 'daily', 'trip_headsign': 'Hauptbahnhof', 'bikes_allowed': '2'},
        ]),
        'stops.txt': (stop_fields, [
            {'stop_id': 'de:08311:30100:0:1', 'stop_name': 'Bertoldsbrunnen',
             'stop_lat': '47.995', 'stop_lon': '7.85'},
            {'stop_id': 'de:08311:30200:0:1', 'stop_name': 'Hauptbahnhof',
             'stop_lat': '47.997', 'stop_lon': '7.841'},
        ]),
        'stop_times.txt': (time_fields, [
            {'trip_id': 'trip-1', 'arrival_time': '08:15:00', 'departure_time': '08:16:00',
             'stop_id': 'de:08311:30100:0:1', 'stop_sequence': '1'},
            {'trip_id': 'trip-2', 'arrival_time': '08:30:00', 'departure_time': '08:31:00',
             'stop_id': 'missing-stop' if unknown_stop else 'de:08311:30200:0:1',
             'stop_sequence': '1'},
        ]),
        'calendar.txt': (calendar_fields, [
            {'service_id': 'daily', 'monday': '1', 'tuesday': '1', 'wednesday': '1',
             'thursday': '1', 'friday': '1', 'saturday': '1', 'sunday': '1',
             'start_date': '20260101', 'end_date': '20261231'},
        ]),
    }
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for name, (columns, records) in files.items():
            zf.writestr(name, csv_bytes(columns, records))


class GtfsCompatTests(unittest.TestCase):
    def audit(self, orphan_route=False, unknown_stop=False):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = base / 'test.zip'
            destination = base / 'generated'
            report_file = base / 'report.json'
            fixture(source, orphan_route=orphan_route, unknown_stop=unknown_stop)
            build = subprocess.run([sys.executable, str(BUILDER), str(source), str(destination)],
                                   capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stderr + build.stdout)
            audit = subprocess.run([sys.executable, str(AUDITOR), str(source), str(destination),
                                    '--report', str(report_file)], capture_output=True, text=True)
            report = json.loads(report_file.read_text(encoding='utf-8'))
            yield audit.returncode, report, destination

    def test_extended_route_types_dtid_colors_and_bicycles(self):
        for status, report, directory in self.audit():
            self.assertEqual(status, 0, report['issues'])
            self.assertEqual(report['status'], 'PASS')
            self.assertEqual(report['feed']['tripsWithoutRoute'], 0)
            self.assertEqual(report['snapshot']['departures'], 2)
            self.assertIn('109', report['feed']['routeTypes'])
            self.assertIn('900', report['feed']['routeTypes'])
            self.assertIn('bikes_allowed', report['feed']['newColumnsDetected']['trips.txt'])
            idx = json.loads((directory / 'index.json').read_text(encoding='utf-8'))
            self.assertIn('de:08311:30100', idx['stops'])
            departure_rows = []
            for shard in directory.glob('[0-9a-f][0-9a-f].json'):
                data = json.loads(shard.read_text(encoding='utf-8'))
                for departures in data['stops'].values():
                    departure_rows.extend(departures)
            self.assertEqual({entry[1] for entry in departure_rows}, {'1', 'S1'})

    def test_orphan_trip_route_is_detected_even_if_builder_succeeds(self):
        for status, report, _ in self.audit(orphan_route=True):
            self.assertEqual(status, 1)
            self.assertEqual(report['feed']['tripsWithoutRoute'], 1)
            self.assertEqual(report['snapshot']['departures'], 1)

    def test_missing_stop_reference_is_detected(self):
        for status, report, _ in self.audit(unknown_stop=True):
            self.assertEqual(status, 1)
            self.assertEqual(report['feed']['stopTimesWithoutStop'], 1)


if __name__ == '__main__':
    unittest.main()

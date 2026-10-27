# GTFS-Umstellung vom 15. November 2026 prüfen

Die MobiData BW/NVBW-Umstellung betrifft `routes.txt` und `trips.txt`: erweiterte
`route_type`-Werte, `route_color`, `route_text_color`, `bikes_allowed` und
`route_id` als DTID, sofern vorhanden.

**Betroffen ist der Offline-GTFS-Fallback von `abfahrt`.**
Der TRIAS-Live-Abruf und das separate Projekt `abfahrt-web` lesen keine
dieser GTFS-ZIP-Dateien.

## Kleine Regressionstests

```bash
python3 -m unittest discover -s test -p 'test_gtfs_compat.py' -v
```

Die Tests bauen mit dem **unveränderten Produktiv-Builder** einen kleinen
synthetischen GTFS-Datensatz. Sie prüfen neue Routentypen, opaque/DTID-artige
Kennungen, Farben und Fahrradfelder und erzeugen absichtlich ungültige
Verknüpfungen, die der Auditor erkennen muss.

## Volltest mit dem offiziellen Entwicklungsfeed

Nach Merge dieses Workflows nach `main`:

1. GitHub → **Actions** → **GTFS 2026 Compatibility Check**.
2. **Run workflow** auswählen.
3. Nach dem Lauf den **gtfs-compat-report** als Artefakt herunterladen.
4. `status: PASS` und die Zähler unter `feed` und `snapshot` auswerten.

Der Workflow verwendet die von NVBW angekündigte
[ZIP-Testdatei](https://www.nvbw.de/fileadmin/user_upload/service/open_data/fahrplandaten_mit_liniennetz/bwgesamt_develop.zip)
**mit Liniennetz**. Der produktive tägliche Workflow benutzt dagegen
`bwgesamt.zip` **ohne Liniennetz**. Der Test belegt daher die
Kompatibilität mit dem angekündigten neuen Schema, aber nicht, dass sich die
Feeds in Inhalt und Haltestellenzahl gleichen. Ein separater Test des
Produktivfeeds nach der Umstellung bleibt sinnvoll.

Im Volltest passieren diese Schritte:

- ZIP herunterladen und deren CRC/Integrität prüfen
- Mit `scripts/build-gtfs.py` einen **separaten** Offline-Snapshot erzeugen
- GTFS-Fremdschlüssel (Trips → Routen, Stop-Times → Trips/Stops) prüfen
- Das erzeugte Manifest, die Index-Shard-Zuordnung und die Service-Kalender prüfen
- Die Gesamtzahlen und Fehler in einer JSON-Datei dokumentieren

**Es erfolgen keine Commits, kein Force-Push und keine Veröffentlichung**
auf dem produktiven Branch `gtfs-data`. Im Zweifelsfall bleibt der bestehende
Offline-Fahrplan unverändert.

## Interpretation

- `tripsWithoutRoute > 0`: GTFS-Routenreferenzen stimmen nicht überein;
  die bisherige Builder-SQL-Verknüpfung würde Fahrten verlieren.
- `stopTimesWithoutTrip > 0` oder `stopTimesWithoutStop > 0`:
  gebrochene Referenzen in `stop_times.txt`.
- `departuresWithoutService > 0`: Für erzeugte Fahrten fehlen
  Kalenderinformationen.
- `departures = 0`: Der Builder erzeugt keine nutzbaren Abfahrten.
- `newColumnsDetected` und `routeTypes` dienen der Information.
  Der Builder nutzt diese optionalen Spalten bislang nicht.

Ein erfolgreicher Volltest ist ein struktureller Kompatibilitätsnachweis,
kein End-to-End-Test auf einem iPhone mit Live-TRIAS-Ausfall und auch kein
Vergleich der vollständigen Fahrpläne über beide Datensatzvarianten hinweg.

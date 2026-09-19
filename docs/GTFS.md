# Offline-GTFS

abfahrt bereitet landesweite **Sollfahrplandaten für Baden-Württemberg** als kompakten Offline-Fallback auf.

Die Daten stammen aus dem GTFS-Angebot von MobiData BW / NVBW. TRIAS bleibt die primäre Datenquelle; der lokale GTFS-Cache wird nur verwendet, wenn eine Live-Abfahrtsanfrage nicht erfolgreich ist.

## Ziel des Offline-Fallbacks

Der Fallback soll nicht den vollständigen Baden-Württemberg-Fahrplan auf dem iPhone speichern.

Stattdessen lädt Scriptable nur die Daten, die für relevante Haltestellen benötigt werden:

- angepinnte Haltestellen
- zuletzt verwendete Haltestellen

Dadurch bleibt der lokale Cache klein.

## Build-Pipeline

Der Workflow `.github/workflows/gtfs-data.yml` läuft planmäßig einmal täglich und kann zusätzlich manuell gestartet werden.

Er prüft:

1. den aktuellen Importzeitpunkt der Upstream-GTFS-Daten,
2. den Importzeitpunkt des bereits veröffentlichten Snapshots,
3. die erwartete Builder-Schemaversion,
4. ob `scripts/build-gtfs.py` geändert wurde.

Nur wenn ein Neuaufbau notwendig ist, werden die Quelldaten heruntergeladen und verarbeitet.

## Datenquelle

Der Workflow verwendet den landesweiten NVBW-GTFS-Datensatz `bwgesamt` ohne Liniennetz-Shapes.

Der aktuelle Quellpfad wird direkt im Workflow gepflegt.

## Build-Schritte

```text
MobiData BW / NVBW GTFS
      │
      ▼
bwgesamt.zip
      │
      ▼
scripts/build-gtfs.py
      │
      ├── Stops normalisieren
      ├── Trips und Stop Times lesen
      ├── Kalender und Ausnahmen aufbereiten
      ├── IFOPT-/TRIAS-Aliase erzeugen
      ├── Haltestellen auf Shards verteilen
      └── Ergebnis validieren
      │
      ▼
kompakter Snapshot
      │
      ▼
gtfs-data Branch
```

## Warum ein eigener `gtfs-data`-Branch?

Die generierten Daten gehören nicht zur normalen Anwendungshistorie.

Der Branch `gtfs-data` wird deshalb bei jedem erfolgreichen Neuaufbau **ersetzt**. Er besitzt bewusst keine dauerhaft wachsende Commit-Historie für jeden Fahrplanimport.

So bleiben:

- Anwendungscode auf `main`
- generierte Fahrplandaten auf `gtfs-data`

klar voneinander getrennt.

## Dateistruktur

Der veröffentlichte Snapshot liegt unter `data/gtfs/`.

### `manifest.json`

Enthält Metadaten zum Snapshot, unter anderem:

- Schemaversion
- Erstellungs-/Gültigkeitsinformationen
- Quellinformationen
- Attribution
- Upstream-Importzeitpunkt

### `index.json`

Ordnet logische Haltestellen ihren Datenshards zu.

Zusätzlich enthält der Index je nach Datensatz Informationen wie:

- Name
- Koordinaten
- GTFS-Stop-IDs
- Aliase

### `00.json` bis `ff.json`

Die eigentlichen Fahrplandaten sind in hexadezimal benannten Shards verteilt.

Es werden nur Shards erzeugt, die tatsächlich Haltestellen enthalten.

## StopRefs und IFOPT

Eine TRIAS-Referenz kann zum Beispiel so aussehen:

```text
de:08311:30100:0:1
```

Für die Zuordnung zum Offline-Index wird sie auf die logische IFOPT-Haltestelle reduziert:

```text
de:08311:30100
```

Der GTFS-`stop_id` bleibt dabei die kanonische Identität. Ein vorhandenes `parent_station` wird als zusätzlicher Alias behandelt und ersetzt die eigentliche Stop-ID nicht.

Das ist wichtig, weil manche Feeds synthetische Parent-IDs verwenden, während TRIAS mit IFOPT-/DHID-kompatiblen Referenzen arbeitet.

## Kompaktes Abfahrtsformat

Eine Abfahrt wird platzsparend als Array gespeichert:

```json
[38520, "1", "Littenweiler", "service-id"]
```

Bedeutung:

1. Abfahrtssekunden seit Mitternacht
2. Linie
3. Ziel/Headsign
4. GTFS-Service-ID

Die für einen Shard benötigten Service-Kalender und Kalenderausnahmen werden zusammen mit dem Shard gespeichert.

## Laufzeit auf dem Gerät

Die Config ermittelt, welche logischen Haltestellen offline verfügbar sein sollen.

Dann:

1. wird das Manifest geladen,
2. der Index ausgewertet,
3. werden nur die benötigten Shards geladen,
4. wird der neue Satz vollständig geprüft,
5. erst danach ersetzt er den vorhandenen Cache.

Schlägt ein Download fehl, bleibt der alte nutzbare Cache erhalten.

## Verwendung bei einer Abfahrt

Die Runtime fragt immer zuerst TRIAS an.

Nur wenn diese Anfrage fehlschlägt:

1. prüft abfahrt, ob die Haltestelle offline berechtigt ist,
2. lädt die passenden lokalen Daten,
3. prüft GTFS-Servicekalender und Ausnahmen für den aktuellen Tag,
4. baut daraus Soll-Abfahrten,
5. zeigt sie als **Plan-/Offline-Daten** statt Live-Daten an.

## Grenzen

GTFS ist ein Sollfahrplan.

Der Offline-Fallback kennt deshalb grundsätzlich keine:

- Live-Verspätungen
- kurzfristigen Gleisänderungen
- Echtzeit-Ausfälle, sofern sie nicht bereits im Soll-Datensatz abgebildet sind
- Echtzeitprognosen

Er ist dafür gedacht, bei einer fehlgeschlagenen Live-Anfrage trotzdem eine brauchbare Orientierung zu geben.

## Aktualisierung

Die lokale Synchronisierung kann automatisch im Hintergrund der normalen Nutzung angestoßen oder manuell über die Config gestartet werden.

Die Aktualisierung ist **Best Effort**. Ein temporärer Netzwerkfehler soll keinen vorhandenen Offline-Cache zerstören.

## Quelle und Lizenz

Quelle: **MobiData BW / NVBW, Soll-Fahrplandaten Baden-Württemberg**

Attribution: **Datenpaket: MobiData BW; NVBW**

Lizenz: **Datenlizenz Deutschland – Namensnennung – Version 2.0**

Die jeweils im Snapshot enthaltenen Metadaten sind maßgeblich für den konkreten Datenstand.

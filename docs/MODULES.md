# Module und Komponenten

Diese Seite beschreibt die technischen Bausteine von abfahrt. Sie ist als Inventar gedacht: Welche Datei macht was, welche logischen Module stecken darin und wie greifen sie ineinander?

## Übersicht

| Komponente | Aufgabe |
| --- | --- |
| `abfahrt.js` | Laufzeit: TRIAS, Standort, Haltestellenauswahl, Filter, Widget, Vollbild und Offline-Fallback |
| `abfahrt-config.js` | Konfiguration und Paketverwaltung: Einstellungen, Pins, Updates, Diagnose, Backup, Recovery und Deinstallation |
| `abfahrt-install.js` | kleiner versionsloser Bootstrap-Installer für das aktuelle Stable Release |
| `scripts/build-gtfs.py` | erzeugt kompakte Offline-GTFS-Daten für Baden-Württemberg |
| `scripts/render-widget-preview.mjs` | erzeugt die deterministische Widget-Vorschau für die Dokumentation |
| `scripts/bump-version.js` | erhöht im PR bei Runtime-/Config-Änderungen automatisch die Entwicklungsversion |
| `scripts/check-version-bump.js` | prüft Versionskonsistenz und erforderliche Versionssprünge |
| `.github/workflows/ci.yml` | Syntax-, Test- und Versionsprüfungen |
| `.github/workflows/gtfs-data.yml` | täglicher Build und Veröffentlichung der Offline-Daten |
| `.github/workflows/release.yml` | manuelle Stable-Veröffentlichung mit Manifest und Release-PR |
| `.github/workflows/widget-screenshot.yml` | automatische README-Widget-Vorschau |
| `test/*.test.js` | Regressionstests für Repository, Updater und Runtime |

## `abfahrt.js`: Runtime

`abfahrt.js` ist das eigentliche Laufzeitscript. Je nachdem, ob es als Widget oder interaktiv in Scriptable gestartet wird, nimmt es unterschiedliche Pfade.

### Konfiguration laden und migrieren

Die Runtime liest die persönliche `abfahrt.config.json`, verbindet sie mit den aktuellen Defaults und behandelt fehlende oder beschädigte Einstellungen defensiv. Ein Konfigurationsproblem soll das Widget nicht unnötig unbrauchbar machen.

### Widget-Parameter

Das Widget benötigt im Normalfall keinen Parameter. Die Parameterverarbeitung ist weiterhin gekapselt, damit alte oder spezielle Aufrufvarianten nicht unkontrolliert in die Runtime wirken.

### TRIAS-Client

Der TRIAS-Teil baut XML-Requests und sendet sie an EFA-BW.

Zentrale Aufgaben:

- `StopEventRequest` für Abfahrten
- `LocationInformationRequest` für Haltestellen in der Nähe
- Timeout-Behandlung
- XML-Escaping
- Fehlernormalisierung

### XML-Parser

Da Scriptable keine vollwertige DOM-Umgebung wie ein Browser bereitstellt, enthält die Runtime einen kleinen Parser und Hilfsfunktionen für die relevanten TRIAS-Strukturen.

Er extrahiert unter anderem:

- Linienname
- Ziel/Richtung
- geplante und erwartete Abfahrtszeit
- StopPointRef
- Gleis
- Ausfallstatus

### Abfahrtsnormalisierung

TRIAS-Antworten werden in ein internes, einheitliches Abfahrtsmodell überführt. Dadurch verwenden Widget und Vollbild dieselben Datenstrukturen.

Hier werden auch Verspätung, Restzeit und Sortierwerte berechnet.

### Haltestellensuche und GPS

Beim interaktiven Start:

1. fragt Scriptable den Standort ab,
2. TRIAS sucht Haltestellen in der Nähe,
3. doppelte oder logisch zusammengehörige Ergebnisse werden normalisiert,
4. eine passende angepinnte Haltestelle kann automatisch gewählt werden,
5. andernfalls erscheint eine Auswahl.

Das Widget selbst startet diese GPS-Suche nicht.

### Angepinnte Haltestellen

Pins werden aus dem Keychain geladen. Die Runtime kennt:

- Anzeigenamen
- Rollen
- mehrere StopRefs pro Pin
- Home-Markierung
- Linienfilter
- Richtungsfilter

Die Auswahl berücksichtigt außerdem den konfigurierten Radius.

### Filter

Pro Pin können Linien und Ziele als Whitelist oder Blacklist definiert werden.

Widget und Vollbild können getrennt festlegen, ob diese Filter angewendet werden.

### Standort-Fallback

Wenn GPS oder Nearby-Suche fehlschlagen, kann je nach Config verwendet werden:

- letzte aktive Haltestelle
- Home
- kein automatischer Fallback

Zusätzlich können angepinnte Haltestellen als manuelle Auswahl angeboten werden.

### Offline-GTFS

TRIAS bleibt primär. Erst wenn eine Live-Abfahrtsanfrage scheitert, prüft die Runtime den lokalen GTFS-Cache.

Das Modul:

- normalisiert StopRefs,
- ermittelt benötigte Shards,
- prüft Kalendertage und Ausnahmen,
- erzeugt Soll-Abfahrten,
- kennzeichnet diese getrennt von Live-Daten.

### Widget-Renderer

Der Widget-Renderer passt sich an `small`, `medium`, `large` und `extraLarge` an.

Je Widget-Familie werden eigene Einstellungen für Zeilen, Spalten, Abstände und Schrift verwendet. Header, Live-/Plan-Status, Steiganzahl und Aktualisierungszeit werden ebenfalls hier aufgebaut.

### Vollbild-Renderer

Die Vollbildansicht wird als HTML-Tabelle in einer Scriptable-WebView dargestellt.

Sie unterstützt:

- konfigurierbare Spalten
- relative Breiten
- mehrzeilige Ziele
- eigene Schriftgröße
- Sortierung nach Abfahrtszeit, Gleis, Richtung oder Linie
- Gruppenüberschriften für Gleis-, Richtungs- und Liniensortierung; innerhalb der Gruppen bleibt die Abfahrtszeit das zweite Kriterium

### Nutzerfreundliche Fehler

Technische Netzwerk- oder API-Fehler werden vor der Anzeige in kurze, verständliche Meldungen übersetzt.

## `abfahrt-config.js`: Konfiguration und Lifecycle

Die Config ist deutlich mehr als ein Einstellungsmenü. Sie ist gleichzeitig die zentrale Paketverwaltung für die installierten abfahrt-Dateien.

### Normalisierung und Migration

Beim Laden werden ältere Konfigurationsstände in das aktuelle Schema überführt.

Beispiel: Die frühere gemeinsame Widget-Konfiguration wird auf die neuen Widget-Familien migriert.

### Widget-Konfiguration

Getrennte Bereiche für:

- Allgemein
- Small
- Medium
- Large
- Extra Large

Jede Familie besitzt eigene Layoutwerte.

### Vollbild-Konfiguration

Verwaltet Spalten, Breiten, Zeilenanzahl, Typografie, Filter und Sortierung.

### Standort-Konfiguration

Verwaltet automatische Pin-Auswahl, Radius und Fallback-Modus.

### Haltestellenverwaltung

Die Config kann:

- zuletzt verwendete Haltestellen anzeigen
- per TRIAS nach Haltestellen suchen
- Haltestellen anpinnen
- Anzeigenamen ändern
- Rollen setzen
- StopRefs gruppieren
- Linien- und Richtungsfilter pflegen

### Rollen

Pins können vordefinierte Rollen wie Home, Work oder Pub besitzen. Eigene Rollen können Label und Emoji erhalten.

### Offline-Datenverwaltung

Die Config berechnet die für Pins und zuletzt verwendete Haltestellen benötigten GTFS-Shards.

Sie kann:

- Offline-Daten synchronisieren
- Status und Alter anzeigen
- Cache löschen
- vorhandene Daten bei fehlgeschlagenen Downloads unangetastet lassen

### Backup und Wiederherstellung

Backups enthalten persönliche Einstellungen und Haltestellendaten, aber keine Secrets oder flüchtigen Laufzeitinformationen.

Beim Import wird dieselbe Normalisierung wie beim normalen Laden verwendet.

### Reset

Ein Einstellungsreset stellt Defaults wieder her und entfernt abgeleitete Offline-Daten. Pins, Recent Stops und Requester-Key bleiben erhalten.

### Update-System

Die Config besitzt zwei Kanäle:

- Stable
- Development

Stable lädt aus einem Release-Tag und verifiziert aktuelle Releases über `release-manifest.json` und SHA-256.

Development löst zuerst den aktuellen Commit von `main` auf und lädt alle verwalteten Dateien aus exakt diesem Commit.

### Schreib- und Rollback-Schutz

Neue Runtime-/Config-Dateien werden erst vollständig geladen und geprüft, bevor installierte Dateien ersetzt werden. Dadurch soll ein Teil-Download keine funktionsfähige Installation zerstören.

### Diagnose

Die Diagnose sammelt unter anderem Versions-, Speicher- und Erreichbarkeitsinformationen.

Bewusst ausgeschlossen sind:

- Key-Werte
- StopRefs
- Haltestellennamen
- Koordinaten

### Recovery

Recovery umgeht den normalen Update-Kanal und stellt die verwalteten Dateien direkt vom aktuellen `main` wieder her. Persönliche Daten bleiben erhalten.

### Deinstallation

Die vollständige Deinstallation entfernt:

- Config
- Pins und Recent Stops
- Laufzeitstatus
- Offline-Cache
- Update-Provenienz
- Requester-Key
- verwaltete Scriptable-Dateien

## `abfahrt-install.js`: Bootstrap-Installer

Der Installer ist absichtlich klein und versionslos.

Sein Ablauf:

1. aktuelles Stable Release auf GitHub bestimmen,
2. veröffentlichte `abfahrt-config.js` laden,
3. Version und erwartete Marker prüfen,
4. Pending-Install-Handoff im Keychain hinterlegen,
5. Config starten,
6. Config übernimmt Download und Verifikation des vollständigen verwalteten Sets,
7. temporäre Installer-Datei wird entfernt.

Dadurch zeigt die bekannte Ein-Zeilen-Installation immer auf den kleinen Bootstrapper in `main`, installiert aber trotzdem bewusst ein Stable Release.

## `scripts/build-gtfs.py`

Der Python-Builder verarbeitet den landesweiten GTFS-Datensatz.

Er:

- liest Stops, Trips, Stop Times und Kalender,
- normalisiert Stop-Identitäten,
- bildet TRIAS-kompatible IFOPT-Aliase,
- erzeugt einen Index,
- verteilt Fahrplandaten auf kompakte Shards,
- bettet benötigte Service-Kalender ein,
- validiert den erzeugten Snapshot.

Mehr dazu: [GTFS.md](GTFS.md)

## `scripts/render-widget-preview.mjs`

Scriptable läuft nicht auf Linux-CI-Runnern. Der Renderer bildet deshalb das Widget deterministisch als HTML nach.

Er liest dafür die Default-Widget-Konfiguration direkt aus `abfahrt.js`, nutzt feste Demodaten und erzeugt eine reproduzierbare Vorschau.

Mehr dazu: [SCREENSHOTS.md](SCREENSHOTS.md)

## Versionsskripte

### `scripts/bump-version.js`

Wenn ein interner Pull Request `abfahrt.js` oder `abfahrt-config.js` verändert, erhöht die CI bei Bedarf automatisch die Patch-Version und synchronisiert die Entwicklungsversion im README.

### `scripts/check-version-bump.js`

Prüft:

- gleiche `APP_VERSION` in Runtime und Config
- passende Entwicklungsversion im README
- gültige Stable-Versionszeile
- erforderlichen Versionssprung bei Runtime-/Config-Änderungen

## GitHub-Actions-Workflows

### `ci.yml`

Führt Syntaxchecks, Tests und Versionsprüfung mit Node 22 aus.

### `gtfs-data.yml`

Prüft täglich den Upstream-Importzeitpunkt und die Builder-Schemaversion. Nur wenn Daten, Schema oder Builder geändert wurden, wird neu gebaut.

Der Snapshot wird in den separaten Branch `gtfs-data` force-published, damit keine stetig wachsende Historie entsteht.

### `release.yml`

Wird manuell ausgelöst.

Der Workflow:

1. liest `APP_VERSION`,
2. erzeugt `release-manifest.json`,
3. setzt die stabile README-Version,
4. veröffentlicht einen `release/vX.Y.Z`-Branch,
5. erstellt Tag und GitHub Release,
6. öffnet einen PR zurück nach `main`.

### `widget-screenshot.yml`

Erzeugt bei relevanten Änderungen die Widget-Vorschau und lädt sie in PRs als Artifact hoch.

Auf `main` wird eine geänderte Vorschau über den Branch `automation/widget-screenshot` zurück in das geschützte `main` gebracht.

## Tests

### `test/widget.test.js`

Deckt den größten Teil des Runtime-Verhaltens ab, unter anderem:

- TRIAS-Request und Parsing
- Gleisextraktion
- Ergebnisanzahl
- Standort- und Pin-Logik
- Filter
- Widget-Familien
- Vollbild-Sortierung
- Fehlerzustände

### `test/updater.test.js`

Prüft zentrale Updater-Funktionen isoliert.

### `test/repository.test.js`

Sichert Repository-Verträge ab:

- Dateinamen und Projektidentität
- Versionsgleichheit
- Installer-Vertrag
- README-Installer
- Release-Manifest
- Workflow-Verhalten
- Screenshot-Vertrag

## Datenfluss in Kurzform

```text
MobiData BW TRIAS
      │
      ├── LocationInformationRequest ──→ Haltestellensuche
      │
      └── StopEventRequest ────────────→ Live-Abfahrten
                                         │
                                         ▼
                                  internes Modell
                                   │           │
                                   ▼           ▼
                                Widget      Vollbild

Bei TRIAS-Fehler:
gtfs-data Branch → lokaler Cache → Soll-Abfahrten → gleiches Darstellungsmodell
```

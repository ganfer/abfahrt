# Architektur

Diese Seite beschreibt, wie die zentralen Komponenten von abfahrt zusammenspielen. Eine feinere Aufschlüsselung der einzelnen logischen Module findest du unter [Module und Komponenten](MODULES.md).

## Komponenten

| Komponente | Verantwortung |
| --- | --- |
| `abfahrt.js` | Runtime: TRIAS-Anfragen und Parsing, Standortlogik, Haltestellenauswahl, Filter, Widget, Vollbild und Nutzung des Offline-Fallbacks |
| `abfahrt-config.js` | Benutzerkonfiguration und zentraler Paket-Lifecycle: Installation, Stable-/Development-Updates, Repair, Uninstall, Pins, Filter, Diagnose, Backup/Wiederherstellung und Offline-Datenpflege |
| `abfahrt-install.js` | kleiner versionsloser Bootstrap, der das aktuelle Stable Release ermittelt und die Installation an die veröffentlichte Config übergibt |
| `scripts/build-gtfs.py` | erzeugt den kompakten Offline-Fahrplansnapshot aus dem landesweiten GTFS-Datensatz |
| `gtfs-data`-Branch | enthält ausschließlich die generierten Offline-Fahrplandaten und wird vom geplanten Workflow ersetzt |
| `scripts/render-widget-preview.mjs` | rendert eine deterministische Widget-Vorschau für README und Pull Requests |

Der frühere Helfer `abfahrt-refresh.js` gehört nicht mehr zur Architektur. Aktualisierung und interaktiver Standortwechsel sind inzwischen in die Runtime integriert.

## Grundprinzip

abfahrt trennt zwei Situationen klar voneinander:

1. **passives Widget**
2. **interaktive Nutzung im Vordergrund**

Das Home-Screen-Widget zeigt die Abfahrten der gespeicherten aktiven Haltestelle. Es fordert nicht bei jedem Widget-Refresh einen GPS-Standort an.

Erst beim Antippen wird `abfahrt` interaktiv in Scriptable geöffnet. Dann kann der Standort abgefragt, eine nahe Haltestelle gesucht und die aktive Auswahl geändert werden.

Das ist ein zentrales Designziel: schnelle Information auf dem Home Screen, Standortlogik nur dann, wenn der Nutzer sie tatsächlich benötigt.

## Laufzeitfluss

```text
Home-Screen-Widget
      │
      ├── aktive Haltestelle vorhanden
      │       └── Abfahrten laden und Widget rendern
      │
      └── keine Auswahl vorhanden
              └── initiale Standardhaltestelle Bertoldsbrunnen

Widget-Tap / manueller Start
      │
      ▼
Scriptable im Vordergrund
      │
      ▼
GPS anfragen
      │
      ▼
TRIAS Nearby-Suche
      │
      ├── passende angepinnte Haltestelle im Radius
      │       └── automatisch wählen
      │
      ├── mehrere sinnvolle Treffer
      │       └── Auswahl anzeigen
      │
      └── Standort-/Suchfehler
              └── konfigurierter Fallback / Pins
      │
      ▼
aktive Haltestelle speichern
      │
      ├── optional Widget aktualisieren
      └── Vollbild-Abfahrten anzeigen
```

## Datenquellen

### Primär: TRIAS

Die primäre Datenquelle ist die TRIAS-1.2-Schnittstelle von MobiData BW / EFA-BW.

abfahrt verwendet im Wesentlichen:

- `StopEventRequest` für Abfahrten
- `LocationInformationRequest` für Haltestellensuche und Nearby-Suche

Weitere Details: [TRIAS und Requester-Key](TRIAS.md)

### Fallback: GTFS

Wenn eine TRIAS-Abfahrtsanfrage fehlschlägt und für die angefragte Haltestelle lokale Daten verfügbar sind, kann die Runtime auf GTFS-Sollfahrplandaten zurückfallen.

Der Offline-Pfad ist bewusst **kein zweiter Live-Dienst**. Er liefert geplante Fahrten ohne Echtzeitprognose.

Weitere Details: [Offline-GTFS](GTFS.md)

## Internes Abfahrtsmodell

TRIAS- und Offline-Daten werden vor der Darstellung in vergleichbare interne Datensätze überführt.

Dadurch können Widget und Vollbild dieselben Anzeige- und Filterfunktionen verwenden, unabhängig davon, ob die Zeile aus Live- oder Sollfahrplandaten stammt.

Typische Felder sind:

- Linie
- Richtung/Ziel
- geplante Abfahrtszeit
- erwartete Abfahrtszeit
- Verspätung
- Gleis
- Ausfallstatus
- Kennzeichnung Live/Plan

## Haltestellenmodell

Eine reale Haltestelle kann aus mehreren TRIAS-StopRefs bestehen. abfahrt behandelt eine angepinnte Haltestelle deshalb als logische Gruppe.

Ein Pin kann enthalten:

- Anzeigename
- Rolle
- Koordinaten
- eine oder mehrere StopRefs
- Linienfilter
- Richtungsfilter

Dadurch lassen sich mehrere Steige derselben Haltestelle gemeinsam abfragen und darstellen.

## Standort- und Fallbacklogik

Bei erfolgreicher GPS-Suche werden nahe Haltestellen über TRIAS geladen.

Ist die automatische Auswahl aktiviert, prüft abfahrt, ob eine angepinnte Haltestelle innerhalb des konfigurierten Radius liegt. Trifft das zu, wird sie bevorzugt.

Bei Fehlern stehen abhängig von der Konfiguration zur Verfügung:

- letzte aktive Haltestelle
- Home
- kein automatischer Fallback
- manuelle Auswahl aus angepinnten Haltestellen

Die Oberfläche soll technische Fehler dabei nicht als Diagnoseansicht präsentieren, sondern möglichst direkt eine nutzbare Alternative anbieten.

## Persistenz

### iOS-Keychain

Im Keychain liegen Secrets und kleine Laufzeitdaten, darunter:

- TRIAS-Requester-Key
- letzte aktive Haltestelle
- angepinnte Haltestellen
- zuletzt verwendete Haltestellen
- Installations-/Update-Handoffs

### `abfahrt.config.json`

Die Datei enthält persönliche Oberflächen- und Verhaltenseinstellungen.

Dazu gehören unter anderem:

- Widget-Layouts
- Vollbild-Layout
- Filteraktivierung
- Standortverhalten
- Update-Kanal

### Offline-Cache

GTFS-Manifest, Index und benötigte Shards werden im Scriptable-Dokumentbereich abgelegt.

Ein neuer Cache ersetzt den alten erst, wenn alle benötigten Downloads erfolgreich waren.

## Datenschutzprinzipien

Die Diagnose ist so gestaltet, dass sie bei Supportfällen nützlich bleibt, ohne persönliche Daten unnötig offenzulegen.

Nicht ausgegeben werden:

- Requester-Key
- StopRefs
- Haltestellennamen
- Koordinaten

Backups schließen Secrets und flüchtigen Runtime-Status ebenfalls aus.

## Update-Architektur

### Stable

Stable löst das zuletzt veröffentlichte GitHub Release auf und installiert Runtime und Config aus genau dessen Tag.

Aktuelle Releases enthalten `release-manifest.json` mit SHA-256-Prüfsummen für die verwalteten Dateien.

Vor dem Ersetzen wird geprüft:

- erwarteter Dateiname
- Quellmarker
- Version
- bei unterstützten Releases SHA-256 gegen das Manifest

### Development

Development folgt `main`, lädt aber nicht einfach nacheinander „die neuesten“ Dateien.

Zuerst wird der aktuelle Commit-SHA von `main` aufgelöst. Danach werden alle verwalteten Dateien exakt aus diesem Commit geladen. So kann kein Mischstand aus zwei verschiedenen Commits entstehen.

## Installations-Lifecycle

Der Ein-Zeilen-Installer lädt `abfahrt-install.js` aus `main`. Dieser Bootstrap ist absichtlich versionslos.

```text
Bootstrap
  → latest Stable Release auflösen
  → veröffentlichte Config laden und prüfen
  → Pending-Install-Handoff im Keychain speichern
  → Config starten
  → Runtime + Config vollständig laden
  → Dateien validieren
  → atomar/mit Rollback-Schutz schreiben
  → Installer-Artefakte entfernen
  → Handoff löschen
```

Die zentrale Definition der verwalteten Dateien wird auch für Updates, Recovery und Deinstallation wiederverwendet.

## Recovery

Recovery ist absichtlich vom normalen Update-Kanal getrennt.

Es lädt Runtime und Config aus dem aktuellen `main` und dient dazu, eine beschädigte oder inkonsistente Installation wiederherzustellen. Persönliche Einstellungen und Haltestellendaten bleiben erhalten.

## Deinstallation

Die vollständige Deinstallation entfernt sowohl verwaltete Script-Dateien als auch zugehörige lokale Daten und den Requester-Key.

Damit bleibt nach einer bestätigten Komplett-Deinstallation keine versteckte abfahrt-Konfiguration zurück.

## CI-Verträge

Die normale CI läuft mit Node 22 und prüft:

- Syntax
- Regressionstests
- Versionskonsistenz
- notwendige Versionssprünge
- zentrale Repository-Verträge

Bei internen Pull Requests kann sie einen erforderlichen Patch-Versionssprung automatisch eintragen.

Die Widget-Vorschau wird in einem eigenen Workflow erzeugt. Details dazu: [SCREENSHOTS.md](SCREENSHOTS.md)

## Release-Modell

Ein Merge nach `main` ist **kein** automatisches Stable Release.

Stable-Releases werden bewusst über den manuellen Release-Workflow erzeugt. Dieser:

1. liest die aktuelle `APP_VERSION`,
2. erzeugt das Prüfsummenmanifest,
3. aktualisiert die stabile Versionsangabe im README,
4. erstellt einen dedizierten Release-Branch,
5. veröffentlicht Tag und GitHub Release,
6. öffnet einen Pull Request, der die generierten Stable-Metadaten nach `main` zurückführt.

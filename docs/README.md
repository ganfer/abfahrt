# Dokumentation

Willkommen in der technischen Dokumentation von **abfahrt**.

Wenn du abfahrt einfach nur installieren und verwenden möchtest, starte mit dem [README im Repository](../README.md).

## Themen

### [TRIAS und Requester-Key](TRIAS.md)

Alles rund um den notwendigen Zugang zu MobiData BW:

- Requester-Key beantragen
- verwendete TRIAS-Version
- StopEventRequest und LocationInformationRequest
- StopRefs
- Key-Speicherung
- typische Fehlerbilder

### [Module und Komponenten](MODULES.md)

Vollständige technische Bestandsaufnahme des Projekts:

- Runtime
- Config
- Installer
- Offline-GTFS-Builder
- Screenshot-Renderer
- Versionsskripte
- GitHub-Actions-Workflows
- Regressionstests

### [Architektur](ARCHITECTURE.md)

Beschreibt das Zusammenspiel der Komponenten:

- Widget- und Vordergrundfluss
- Datenquellen
- Standort- und Fallbacklogik
- Persistenz
- Update- und Release-Modell
- Datenschutzprinzipien

### [Offline-GTFS](GTFS.md)

Technische Dokumentation des lokalen Fahrplan-Fallbacks:

- Datenquelle
- Build-Pipeline
- Sharding
- IFOPT-/StopRef-Mapping
- Servicekalender
- Grenzen von Sollfahrplandaten

### [Widget-Vorschau](SCREENSHOTS.md)

Erklärt die automatisch erzeugte README-Vorschau:

- warum kein echter iOS-Simulator verwendet wird
- welche Werte aus der Runtime übernommen werden
- wie der Screenshot-Workflow arbeitet
- welche Grenzen die Vorschau hat

## Einstieg für Entwickler

Für einen schnellen Überblick empfiehlt sich diese Reihenfolge:

```text
README
  → MODULES.md
  → ARCHITECTURE.md
  → TRIAS.md / GTFS.md
  → SCREENSHOTS.md
```

Die eigentliche Laufzeit steckt in `abfahrt.js`, während `abfahrt-config.js` sowohl die Benutzereinstellungen als auch Installation, Update, Recovery und Deinstallation verwaltet.

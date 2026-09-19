# TRIAS und Requester-Key

abfahrt verwendet die **TRIAS-API von MobiData BW / NVBW** als primäre Quelle für Haltestellen- und Abfahrtsdaten in Baden-Württemberg.

## Warum wird ein Requester-Key benötigt?

TRIAS ist keine anonyme öffentliche Schnittstelle. Jede Anfrage enthält im Feld `RequestorRef` einen individuellen Zugangsschlüssel. abfahrt fragt diesen Key beim ersten Start ab und speichert ihn im **iOS-Keychain**.

Der Key gehört nicht in das Widget-Parameterfeld und sollte nicht in Screenshots, Issues, Logs oder öffentliche Konfigurationsdateien kopiert werden.

## Zugang beantragen

Der TRIAS-Zugang wird direkt bei MobiData BW beantragt.

**Kontakt:** [mobidata-bw@nvbw.de](mailto:mobidata-bw@nvbw.de)

Offizielle Datensatzseite:  
<https://mobidata-bw.de/dataset/trias>

MobiData BW bittet aktuell um:

- Vor- und Nachname
- Name der Institution; bei Privatpersonen reicht der vollständige Name
- Anschrift
- Kontakt-E-Mail-Adresse
- wenn möglich eine kurze Projekt- oder Innovationsbeschreibung

Für eine private Nutzung von abfahrt kann die Projektbeschreibung kurz gehalten werden, zum Beispiel:

> Privates Scriptable-Widget zur Anzeige von ÖPNV-Abfahrten in Baden-Württemberg über die TRIAS-API.

Mit der Kontaktaufnahme gelten die von MobiData BW veröffentlichten Nutzungsbedingungen und Datenschutzinformationen. Die Bearbeitungsdauer ist nicht verbindlich angegeben.

## Welche TRIAS-Version nutzt abfahrt?

abfahrt arbeitet mit **TRIAS 1.2** über den EFA-BW-Endpunkt:

```text
https://efa-bw.de/trias
```

Die Kommunikation erfolgt per HTTP POST mit XML-Nachrichten.

## Welche Abfragen verwendet abfahrt?

### StopEventRequest

Der `StopEventRequest` liefert die nächsten Abfahrten für eine oder mehrere StopRefs.

abfahrt verwendet ihn für:

- Widget-Abfahrten
- Vollbild-Abfahrten
- Echtzeitinformationen
- Verspätungen
- Ausfälle
- Linie, Richtung und Gleis

Die gewünschte Ergebnismenge richtet sich nach der aktiven Widget- oder Vollbildkonfiguration und wird intern begrenzt.

### LocationInformationRequest

Der `LocationInformationRequest` wird für die Haltestellensuche verwendet.

Es gibt zwei zentrale Anwendungsfälle:

- Haltestellen in der Nähe eines GPS-Standorts finden
- Haltestellen in der Config anhand eines Namens suchen

Die Rückgaben werden normalisiert, weil EFA-BW dieselbe physische Haltestelle über mehrere StopPoints oder StopPlaces zurückgeben kann.

## StopRefs und logische Haltestellen

TRIAS adressiert Haltestellen und Steige über Referenzen wie:

```text
de:08311:30100:0:1
```

Eine in abfahrt angepinnte Haltestelle kann mehrere solcher StopRefs enthalten. Das ist sinnvoll, wenn eine reale Haltestelle aus mehreren Steigen oder StopPoints besteht, die gemeinsam angezeigt werden sollen.

Für den Offline-Fallback wird eine StopRef zusätzlich auf die logische IFOPT-Haltestelle reduziert, zum Beispiel:

```text
de:08311:30100:0:1
→ de:08311:30100
```

## Speicherung des Keys

Der Requester-Key wird unter einem eigenen Eintrag im iOS-Keychain gespeichert.

Er wird bewusst nicht:

- in `abfahrt.config.json` geschrieben
- in Backups exportiert
- in Diagnoseberichten ausgegeben
- als Widget-Parameter benötigt

Bei einer vollständigen Deinstallation über die Entwickleroptionen wird der Key ebenfalls gelöscht.

## Fehlerbilder

### Key wird abgelehnt

Prüfe:

1. ob der Key vollständig und ohne zusätzliche Leerzeichen gespeichert wurde,
2. ob der Zugang von MobiData BW bereits aktiviert ist,
3. ob die TRIAS-Schnittstelle erreichbar ist.

Falls nötig, kann der Key über die Config bzw. nach einem vollständigen Reset erneut hinterlegt werden.

### TRIAS ist nicht erreichbar

Wenn die Live-Abfrage fehlschlägt, versucht abfahrt – sofern für die Haltestelle Daten vorhanden sind – auf den lokalen GTFS-Fahrplan zurückzufallen.

Der Offline-Fallback enthält **Sollfahrplandaten**, keine Live-Prognosen.

### Haltestelle wird nicht gefunden

Die GPS-Suche hängt davon ab, welche Haltestellen EFA-BW im Umfeld zurückliefert. Falls keine brauchbare Haltestelle gefunden wird, können je nach Konfiguration die letzte Haltestelle, Home oder angepinnte Haltestellen verwendet werden.

## Datenschutz

Bei normalen TRIAS-Anfragen werden die für die jeweilige Funktion notwendigen Daten an EFA-BW übertragen. Bei der Haltestellensuche gehört dazu der aktuelle Standort.

abfahrt speichert keine Standort-Historie. Der aktuell gewählte Halt und kleine Laufzeitinformationen werden lokal auf dem Gerät gehalten.

## Weiterführende Informationen

MobiData BW stellt zusätzlich ein TRIAS-Factsheet, XSD-Dateien und Beispielabfragen bereit. Die jeweils aktuellen Ressourcen sind über die offizielle Datensatzseite verlinkt:

<https://mobidata-bw.de/dataset/trias>

# Fahrtverlauf im Scriptable-Vollbild

In der **Vollbild-Abfahrtsansicht** kann man eine einzelne Straßenbahn-, Bus- oder Zugabfahrt antippen.
Für diese Fahrt werden über die bestehende MobiData-BW-TRIAS-1.2-Anbindung die
darauffolgenden Haltestellen geladen.

## Bedienung

1. In Scriptable `abfahrt` öffnen und eine Haltestelle auswählen.
2. Im großen Abfahrtsbildschirm eine Abfahrt antippen (oder per Tastatur Enter/Leertaste auswählen).
3. Die Detailansicht zeigt alle gemeldeten nachfolgenden Haltestellen in Fahrtreihenfolge.
4. Pro Haltestelle stehen **Ankunftsuhrzeit** und **Restminuten ab jetzt** nebeneinander.
5. **📌 Fahrt fixieren** speichert genau diese Fahrt, falls du sie später noch einmal öffnen möchtest.
6. **Aktualisieren** lädt neue Prognosen; **Abfahrten** führt zur bisherigen Tabelle zurück.
7. **Fixierung lösen** entfernt die gespeicherte Fahrt jederzeit wieder.

Bei vorhandener Echtzeitprognose wird die vorausgesagte Ankunftszeit verwendet.
Weicht sie von der Planzeit ab, erscheint zusätzlich die Planzeit. Fehlt die
Prognose für einzelne Haltestellen, wird diese ausdrücklich als **Fahrplan**
gekennzeichnet. Entfallene Haltestellen werden gekennzeichnet; es wird keine
pauschale Verspätung der Einstiegshaltestelle auf alle weiteren Stopps übertragen.

## Fahrt fixieren und unterwegs fortsetzen

Die Fixierung ist **freiwillig**: Beim normalen Öffnen einer Abfahrt wird nichts
automatisch gespeichert. Erst **📌 Fahrt fixieren** in der Fahrtverlaufsansicht
merkt sich die Fahrt im lokalen iOS-Keychain. Die App speichert dabei die
`JourneyRef`, `OperatingDayRef`, ursprüngliche Einstiegs-Haltestelle,
Fahrtzeit, Linie und Richtung. **Der private TRIAS-Zugangsschlüssel wird nicht
in die Fahrt kopiert.**

- In der Haltestellen-Detailansicht erscheint anschließend
  **📌 Aktuelle Fahrt fortsetzen** oberhalb der Abfahrtsliste.
- Beim nächsten Start von `abfahrt` in Scriptable gibt es vor der
  GPS-Suche den Menüpunkt **Aktuelle Fahrt fortsetzen**.
- Der ursprüngliche Zug muss deshalb **nicht mehr** im Abfahrtsmonitor
  stehen. `TripInfoRequest` lädt den Fahrtverlauf unmittelbar anhand
  der gespeicherten Fahrtreferenz neu, ohne den alten Haltestellenmonitor
  abzufragen. Das gilt auch, wenn GPS gerade nicht funktioniert.
- Pro Gerät ist eine Fahrt fixiert; eine neue Fixierung ersetzt die
  vorherige. Mit **Fixierung lösen** wird die Fahrt wieder entfernt.
- Eine fixierte Fahrt läuft automatisch aus: ungefähr drei Stunden nach
  dem letzten gemeldeten Ankunftstermin, spätestens 72 Stunden nach
  planmäßigem Fahrtbeginn.
- Bereits zurückgelegte Halte werden ausgegraut. Uhrzeiten bleiben
  absolut, die Restminuten werden alle 30 Sekunden lokal aktualisiert.
- Bei TRIAS-Ausfall bleibt die Fixierung bestehen. Die Detailseite
  bietet **Erneut versuchen** und **Fixierung lösen**. Die Fahrtdaten
  werden nicht erfunden; Offline-GTFS enthält weiterhin keinen Verlauf.

Die Funktion betrifft ausschließlich die **interaktive Scriptable-Ansicht**,
nicht das Homescreen-Widget und nicht `abfahrt-web`.

Die Restminuten werden im geöffneten Bildschirm alle 30 Sekunden aktualisiert.
Neue Netzabfragen erfolgen nur beim Öffnen des Fahrtverlaufs und über
**Aktualisieren**. Das spart TRIAS-Anfragen und Datenvolumen.

## Technische Implementierung

- `StopEventRequest` liefert bereits `Service/JourneyRef` und
  `Service/OperatingDayRef`; beide Werte werden jetzt im internen Abfahrtsmodell
  übernommen.
- Die neue `TripInfoRequest`-Anfrage läuft **erst nach Auswahl** einer Zeile.
- `TripInfoResponse/TripInfoResult/PreviousCall` und `OnwardCall` werden
  auf die nachfolgenden Haltestellen der ausgewählten Fahrt eingegrenzt.
- Die Scriptable-WebView verwendet abgefangene interne Navigations-URLs als native Aktionsbrücke (statt wartender JavaScript-Callbacks):
  Der TRIAS-Key verbleibt in Scriptable und wird nicht im HTML angezeigt.
- Die Echtzeitdaten bleiben die primäre Quelle. Bei reinen Offline-GTFS-Zeilen
  ohne JourneyRef ist der Verlauf nicht verfügbar.
- Das Hintergrund-Widget, die bisherige Tabelle, sortierte Gruppen, Filter,
  Offline-GTFS und das separate Repository `abfahrt-web` bleiben unverändert.

## Einschränkungen

Die konkrete Vollständigkeit einer Fahrt hängt von der Antwort der TRIAS-API
ab. Ohne `JourneyRef`, `OperatingDayRef` oder Folgehaltestellen erscheint
eine Fehlermeldung statt einer geratenen Route. Der Verlauf wird beim
Öffnen jeweils neu geladen. Eine Fahrt wird ausschließlich auf ausdrücklichen
Wunsch fixiert, nicht automatisch im Hintergrund.

Automatisierte Tests prüfen u.a. wiederkehrende Haltestellen, fehlende
Prognosen, abgesagte Halte, XML-Escaping und die UI-Verknüpfung. Die
interaktive Ausführung auf einem echten iPhone muss nach Übernahme über
Scriptable geprüft werden.

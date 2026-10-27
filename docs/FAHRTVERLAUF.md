# Fahrtverlauf im Scriptable-Vollbild

In der **Vollbild-Abfahrtsansicht** kann man eine einzelne Straßenbahn-, Bus- oder Zugabfahrt antippen.
Für diese Fahrt werden über die bestehende MobiData-BW-TRIAS-1.2-Anbindung die
darauffolgenden Haltestellen geladen.

## Bedienung

1. In Scriptable `abfahrt` öffnen und eine Haltestelle auswählen.
2. Im großen Abfahrtsbildschirm eine Abfahrt antippen (oder per Tastatur Enter/Leertaste auswählen).
3. Die Detailansicht zeigt alle gemeldeten nachfolgenden Haltestellen in Fahrtreihenfolge.
4. Pro Haltestelle stehen **Ankunftsuhrzeit** und **Restminuten ab jetzt** nebeneinander.
5. **Aktualisieren** lädt neue Prognosen; **Abfahrten** führt zur bisherigen Tabelle zurück.

Bei vorhandener Echtzeitprognose wird die vorausgesagte Ankunftszeit verwendet.
Weicht sie von der Planzeit ab, erscheint zusätzlich die Planzeit. Fehlt die
Prognose für einzelne Haltestellen, wird diese ausdrücklich als **Fahrplan**
gekennzeichnet. Entfallene Haltestellen werden gekennzeichnet; es wird keine
pauschale Verspätung der Einstiegshaltestelle auf alle weiteren Stopps übertragen.

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
- Die Scriptable-WebView verwendet eine native JavaScript-Callback-Brücke:
  Der TRIAS-Key verbleibt in Scriptable und wird nicht im HTML angezeigt.
- Die Echtzeitdaten bleiben die primäre Quelle. Bei reinen Offline-GTFS-Zeilen
  ohne JourneyRef ist der Verlauf nicht verfügbar.
- Das Hintergrund-Widget, die bisherige Tabelle, sortierte Gruppen, Filter,
  Offline-GTFS und das separate Repository `abfahrt-web` bleiben unverändert.

## Einschränkungen

Die konkrete Vollständigkeit einer Fahrt hängt von der Antwort der TRIAS-API
ab. Ohne `JourneyRef`, `OperatingDayRef` oder Folgehaltestellen erscheint
eine Fehlermeldung statt einer geratenen Route. Der Verlauf wird beim
Öffnen jeweils neu geladen; eine automatisch im Hintergrund gemerkte Fahrt
gehört noch nicht zu dieser Version.

Automatisierte Tests prüfen u.a. wiederkehrende Haltestellen, fehlende
Prognosen, abgesagte Halte, XML-Escaping und die UI-Verknüpfung. Die
interaktive Ausführung auf einem echten iPhone muss nach Übernahme über
Scriptable geprüft werden.

# abfahrt

**Entwicklungsversion: v2.0.9**  
**Stabile Version: v2.0.9**

**abfahrt** ist ein schnelles Scriptable-Widget für iPhone und iPad, das dir die nächsten Abfahrten des öffentlichen Nahverkehrs in Baden-Württemberg zeigt – mit Echtzeitdaten, Verspätungen, Ausfällen, GPS-Haltestellensuche, angepinnten Haltestellen und einem Offline-Fahrplan als Fallback.

<p align="center">
  <img src="docs/assets/widget-preview.png" alt="abfahrt-Widget mit den nächsten Abfahrten" width="360">
</p>

> Die Vorschau verwendet feste Demodaten. Sie wird automatisch erzeugt und benötigt weder einen TRIAS-Key noch einen echten Standort.

## Warum gibt es abfahrt?

Die Idee entstand aus einem sehr einfachen Problem: Ich wollte nicht jedes Mal eine große ÖPNV-App öffnen, eine Haltestelle suchen und mich durch mehrere Ansichten tippen, nur um eine Frage zu beantworten:

**Wann kommt die nächste Bahn – und wann muss ich loslaufen?**

Gerade in einer Stadt mit Straßenbahn ist man oft sowieso in der Nähe einer Haltestelle. Vielleicht sitzt man noch in einer Kneipe, steht bei Freunden vor der Tür oder läuft gerade durch die Innenstadt. Statt zuerst die passende Haltestelle in einer offiziellen App zu suchen, reicht bei abfahrt ein Tap auf das Widget.

Der Ablauf ist bewusst kurz:

```text
Widget antippen
  → Standort wird erst jetzt abgefragt
  → Haltestellen in der Nähe werden erkannt
  → passende angepinnte Haltestelle wird optional automatisch gewählt
  → nächste Abfahrten erscheinen
```

Das Home-Screen-Widget selbst verwendet **keine dauerhafte Standortabfrage**. Es zeigt die zuletzt aktive Haltestelle und lädt deren Abfahrten. Erst wenn du das Widget antippst und abfahrt im Vordergrund öffnest, wird der Standort verwendet. Dadurch bleibt die Bedienung schnell und unnötige Hintergrundortung wird vermieden.

abfahrt ist außerdem keine eigene App: Im Kern sind es JavaScript-Dateien, die in [Scriptable](https://scriptable.app/) laufen. Das Projekt ist bewusst leichtgewichtig geblieben, auch wenn inzwischen viele Einstellungen und Komfortfunktionen dazugekommen sind.

## Für wen ist abfahrt gedacht?

abfahrt richtet sich vor allem an Menschen in **Baden-Württemberg**, die möglichst schnell sehen möchten, was an der nächsten Haltestelle fährt.

Besonders praktisch ist es in Städten mit Straßenbahn- oder Stadtbahnnetzen, wenn in der direkten Umgebung nur wenige Haltestellen oder Steige relevant sind. Es funktioniert aber grundsätzlich überall dort, wo die verwendete TRIAS-Schnittstelle von MobiData BW passende Haltestellen- und Abfahrtsdaten liefert.

## Was kann abfahrt?

- **Echtzeit-Abfahrten** über die TRIAS-Schnittstelle von MobiData BW
- Anzeige von **Verspätungen und Ausfällen**
- **GPS-Suche** nach Haltestellen in der Nähe
- automatische Auswahl einer **angepinnten Haltestelle** innerhalb eines konfigurierbaren Radius
- angepinnte Haltestellen mit eigenen Namen und Rollen wie **Home, Work, Love, Pub, Favorite oder Transfer**
- mehrere StopRefs pro logischer Haltestelle, z. B. für mehrere Steige
- optionale **Linien- und Richtungsfilter** pro Haltestelle
- Widgets in **Small, Medium, Large und Extra Large**
- eigene Layout-Einstellungen für jede Widget-Größe
- **Vollbildansicht** mit konfigurierbarer Sortierung nach Abfahrtszeit, Gleis, Richtung oder Linie
- **Offline-Fallback** auf vorbereitete GTFS-Sollfahrplandaten
- automatischer **Stable-/Development-Updater**
- Diagnose, Backup/Wiederherstellung, Recovery und saubere Deinstallation

## Bevor du startest: TRIAS-Requester-Key beantragen

Für Live-Abfahrten benötigt abfahrt einen persönlichen **TRIAS-Requester-Key** von MobiData BW. Ohne diesen Key kann abfahrt keine regulären TRIAS-Anfragen an die EFA-BW-Schnittstelle senden.

Der Zugang wird direkt bei MobiData BW per E-Mail beantragt:

**E-Mail:** [mobidata-bw@nvbw.de](mailto:mobidata-bw@nvbw.de)

MobiData BW bittet aktuell um folgende Angaben:

- Vor- und Nachname
- Name der Institution; bei Privatpersonen reicht der vollständige Name
- Anschrift
- E-Mail-Adresse, die als Kontakt hinterlegt werden soll
- möglichst eine kurze Beschreibung des Projekts bzw. Anwendungsfalls

Eine kurze Beschreibung wie „Privates Scriptable-Widget zur Anzeige von ÖPNV-Abfahrten in Baden-Württemberg über die TRIAS-API“ reicht für den Kontext bereits aus. Die Bearbeitungsdauer wird von MobiData BW nicht verbindlich angegeben.

Offizielle Informationen zum Zugang:  
<https://mobidata-bw.de/dataset/trias>

Mehr Hintergründe dazu findest du unter [TRIAS und Requester-Key](docs/TRIAS.md).

## Schnellinstallation

### 1. Scriptable installieren

Installiere [Scriptable aus dem App Store](https://apps.apple.com/app/scriptable/id1405459188).

### 2. Requester-Key bereithalten

Beantrage zuerst deinen persönlichen TRIAS-Requester-Key wie oben beschrieben.

### 3. Neues Script anlegen

Öffne Scriptable und tippe oben rechts auf **+**.

<p align="center">
  <img src="docs/assets/install/scriptable-01-new-script.svg" alt="Scriptable: neues Script über das Plus anlegen" width="280">
</p>

### 4. Diese eine Zeile einfügen

Kopiere die folgende Zeile vollständig in das neue Script:

```js
await eval(await new Request("https://raw.githubusercontent.com/ganfer/abfahrt/main/abfahrt-install.js").loadString())
```

<p align="center">
  <img src="docs/assets/install/scriptable-02-paste.svg" alt="Scriptable: Installationszeile in den Editor einfügen" width="280">
</p>

### 5. Installation starten

Tippe in Scriptable auf **▶︎**. Der kleine Bootstrap-Installer ermittelt automatisch das aktuelle **Stable Release** und installiert die benötigten Dateien.

<p align="center">
  <img src="docs/assets/install/scriptable-03-run.svg" alt="Scriptable: Installation über den Run-Button starten" width="280">
</p>

### 6. abfahrt einmal starten

Nach erfolgreicher Installation findest du in Scriptable:

- `abfahrt`
- `abfahrt-config`

Das temporäre Installationsscript entfernt sich automatisch.

<p align="center">
  <img src="docs/assets/install/scriptable-04-finished.svg" alt="Scriptable: abfahrt und abfahrt-config nach der Installation" width="280">
</p>

Starte **`abfahrt` einmal direkt in Scriptable**. Beim ersten Start wirst du nach deinem TRIAS-Requester-Key gefragt. Der Key wird im iOS-Keychain gespeichert und muss nicht im Widget-Parameter hinterlegt werden.

### 7. Widget hinzufügen

Füge auf dem Home Screen ein Scriptable-Widget hinzu und wähle als Script **`abfahrt`**. Das Widget-Parameterfeld kann leer bleiben.

Du kannst Small-, Medium-, Large- oder Extra-Large-Widgets verwenden. Jede Größe besitzt eine eigene Layout-Konfiguration.

> Die gezeigten Scriptable-Ansichten sind vereinfachte Beispielbilder. Je nach iOS- und Scriptable-Version können Positionen oder Symbole leicht abweichen.

## So funktioniert die Nutzung

Das Widget zeigt die Abfahrten der aktuell gespeicherten Haltestelle. Wenn noch nie eine Haltestelle gewählt wurde, verwendet abfahrt **Bertoldsbrunnen in Freiburg** als initialen Standard.

Beim Antippen des Widgets öffnet sich abfahrt in Scriptable:

```text
Home-Screen-Widget
  → GPS-Standort
  → Suche nach Haltestellen in der Nähe
  → automatische Auswahl einer passenden angepinnten Haltestelle oder Auswahlmenü
  → gewählte Haltestelle wird gespeichert
  → Widget kann direkt aktualisiert werden
  → Vollbildansicht mit Abfahrten
```

Wenn GPS nicht verfügbar ist oder keine Haltestelle gefunden wird, kann abfahrt – je nach Einstellung – auf die letzte Haltestelle, **🏠 Home** oder die angepinnten Haltestellen ausweichen.

## Konfiguration

Starte **`abfahrt-config`** in Scriptable. Änderungen werden beim Verlassen eines Untermenüs automatisch gespeichert.

### Widget

Die Widget-Konfiguration ist in **Allgemein, Small, Medium, Large und Extra Large** aufgeteilt.

Für jede Widget-Größe kannst du unter anderem einstellen:

- Anzahl der Abfahrten
- sichtbare Spalten
- relative Spaltenbreiten
- Zeilen- und Spaltenabstände
- Schriftgrößen
- Badge-Höhe
- Spaltenüberschriften

Unter **Allgemein** liegen größenübergreifende Einstellungen, zum Beispiel die direkte Aktualisierung nach einem Standortwechsel und die Anwendung haltestellenspezifischer Filter.

### Vollbild

Für die Vollbildansicht kannst du unter anderem konfigurieren:

- Anzahl der Abfahrten
- sichtbare Spalten
- relative Spaltenbreiten
- Schriftgröße
- mehrzeilige Zielanzeige
- Anwendung von Haltestellenfiltern
- Sortierung nach **Abfahrtszeit, Gleis, Richtung oder Linie**

Bei Sortierung nach Gleis, Richtung oder Linie bleibt die Abfahrtszeit das zweite Sortierkriterium.

### Standort

Die Standortlogik kann automatisch eine angepinnte Haltestelle wählen, wenn sie innerhalb des eingestellten Radius liegt. Standardmäßig beträgt der Radius **200 m**.

Für Fehler bei Standort oder Haltestellensuche stehen folgende Fallbacks zur Verfügung:

- letzte Haltestelle
- **🏠 Home**
- kein Fallback

Wenn **Home** gewählt ist, aber keine Home-Haltestelle existiert, wird die zuletzt aktive Haltestelle verwendet.

### Haltestellen

Haltestellen können aus der Liste zuletzt verwendeter Haltestellen angepinnt oder direkt über TRIAS gesucht werden.

Eine angepinnte Haltestelle kann:

- einen eigenen Anzeigenamen besitzen
- eine Rolle erhalten
- aus mehreren TRIAS-StopRefs bestehen
- Linien per Whitelist oder Blacklist filtern
- Ziele/Richtungen per Whitelist oder Blacklist filtern

Eigene Rollen können mit individuellem Emoji und Namen erstellt werden. Es kann genau eine Home-Haltestelle geben.

### Offline-Daten

TRIAS bleibt immer die primäre Quelle. Wenn eine Abfahrtsanfrage fehlschlägt, kann abfahrt für geeignete angepinnte oder zuletzt verwendete Haltestellen auf lokal zwischengespeicherte **GTFS-Sollfahrplandaten** zurückfallen.

Es werden nur die tatsächlich benötigten Datenshards geladen. Die Daten können automatisch oder manuell aktualisiert werden.

Details: [Offline-GTFS](docs/GTFS.md)

### Updates

Es gibt zwei Update-Kanäle:

- **Stable** – Standard; verwendet das zuletzt bewusst veröffentlichte GitHub Release.
- **Development** – folgt dem aktuellen Stand von `main`.

Stable-Releases werden über ein Manifest mit SHA-256-Prüfsummen verifiziert. Die Config prüft außerdem Dateimarker und Versionen, bevor installierte Dateien ersetzt werden.

### Entwickleroptionen

Unter den Entwickleroptionen findest du:

- **Diagnose** – datenschutzfreundlicher Statusbericht ohne Requester-Key, StopRefs, Haltestellennamen oder Koordinaten
- **Backup & Wiederherstellung** – Export und Import der persönlichen Konfiguration
- **Alle Einstellungen zurücksetzen** – setzt Einstellungen zurück, behält aber angepinnte/zuletzt verwendete Haltestellen und den TRIAS-Key
- **Recovery · Installation reparieren** – stellt Runtime und Config direkt aus dem aktuellen `main` wieder her
- **Deinstallieren · Alles löschen** – entfernt Konfiguration, Haltestellendaten, Cache, Update-Informationen, Requester-Key und verwaltete Scripts

Die persönlichen Einstellungen liegen in **`abfahrt.config.json`**. Kleine Laufzeitdaten und der Requester-Key werden im iOS-Keychain gespeichert.

## Standardwerte

| Einstellung | Standard |
| --- | --- |
| Abfahrten im Small Widget | 3 |
| Abfahrten im Medium Widget | 5 |
| Abfahrten im Large Widget | 10 |
| Abfahrten im Extra-Large Widget | 14 |
| Abfahrten im Vollbild | 8 |
| Vollbild-Sortierung | Abfahrtszeit |
| Automatische angepinnte Haltestelle | An |
| Radius für automatische Auswahl | 200 m |
| Standort-Fallback | Letzte Haltestelle |
| Widget nach Standortwechsel direkt aktualisieren | An |
| Haltestellenfilter im Widget | An |
| Haltestellenfilter im Vollbild | An |
| Update-Kanal | Stable |

TRIAS-Abfragen werden an die aktive Widget- oder Vollbildkonfiguration angepasst und auf **1–30 Ergebnisse** begrenzt.

## Datenschutz und Akku

abfahrt ist so aufgebaut, dass Standortzugriffe bewusst im Vordergrund stattfinden:

- Das Home-Screen-Widget verwendet die gespeicherte aktive Haltestelle.
- GPS wird beim interaktiven Start von abfahrt angefragt, nicht dauerhaft im Hintergrund.
- Der TRIAS-Requester-Key liegt im iOS-Keychain.
- Diagnoseausgaben enthalten bewusst keine Key-Werte, StopRefs, Haltestellennamen oder Koordinaten.
- Offline-Daten werden nur für relevante Haltestellen lokal gespeichert.

## Fehlerbehebung

Wenn der TRIAS-Key abgelehnt wird, prüfe zuerst den gespeicherten Key und ob dein Zugang von MobiData BW aktiv ist.

Wenn kein Standort verfügbar ist, prüfe die Standortberechtigung von Scriptable unter iOS. Mit aktiviertem Fallback kann abfahrt trotzdem die letzte, die Home- oder eine angepinnte Haltestelle verwenden.

Bei Update- oder Installationsproblemen starte zuerst:

**abfahrt-config → Entwickleroptionen → Diagnose**

Wenn Runtime oder Config beschädigt sind, steht zusätzlich **Recovery · Installation reparieren** zur Verfügung.

## Dokumentation

- [TRIAS und Requester-Key](docs/TRIAS.md) – Zugang, verwendete TRIAS-Abfragen, Key-Speicherung und Fehlerbilder
- [Module und Komponenten](docs/MODULES.md) – technische Übersicht über Runtime, Config, Installer, Hilfsskripte, Workflows und Tests
- [Architektur](docs/ARCHITECTURE.md) – Zusammenspiel der Komponenten, Datenflüsse, Persistenz und Update-Modell
- [Offline-GTFS](docs/GTFS.md) – Aufbau und Aktualisierung des Offline-Fahrplans
- [Widget-Vorschau](docs/SCREENSHOTS.md) – automatische Erzeugung des README-Screenshots

## Entwicklung

Bei jedem Push auf `main` und bei jedem Pull Request läuft die CI mit **Node 22**.

Sie prüft:

- JavaScript-Syntax
- Regressionstests
- Versionskonsistenz
- Repository-Verträge

Die Tests decken unter anderem TRIAS-Request/Parsing, Gleiserkennung, Ergebnislimits, Standort- und Pin-Logik, Updater-Verhalten und nutzerfreundliche Fehlerzustände ab.

Lokal können die Regressionstests so gestartet werden:

```sh
node --test test/*.test.js
```

Eine separate CI erzeugt außerdem die deterministische Widget-Vorschau im README.

## Versionierung

`abfahrt.js` und `abfahrt-config.js` teilen sich dieselbe **`APP_VERSION`**. Der Bootstrap-Installer ist absichtlich versionslos.

- **Entwicklungsversion** = aktuelle `APP_VERSION` auf `main`
- **Stabile Version** = zuletzt veröffentlichtes Stable Release auf GitHub

Änderungen an Runtime oder Config erhöhen die Entwicklungsversion automatisch im Pull Request. Ein Merge nach `main` veröffentlicht nicht automatisch ein neues Stable Release.

## Datenquelle und Hinweis

Die Live-Daten stammen aus der TRIAS-Schnittstelle von **MobiData BW / NVBW**. Die Offline-Sollfahrplandaten basieren ebenfalls auf dem landesweiten Datenangebot von MobiData BW / NVBW.

abfahrt ist ein unabhängiges Open-Source-Projekt und kein offizielles Angebot von MobiData BW, NVBW, Scriptable oder einem Verkehrsverbund.

## Lizenz

MIT.

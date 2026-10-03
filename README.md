# FM27 Manager Dashboard · Gaming-Hub

Dein persönliches Command Center für **Football Manager** – und für deine anderen Karrieren und Spielsessions.
Läuft komplett im Browser, funktioniert offline, braucht kein Konto und keinen Server. **Alle Daten bleiben auf deinem Gerät.**

![Version](https://img.shields.io/badge/Version-11.9-2f6fde) ![Tests](https://img.shields.io/badge/Tests-1.231_bestanden-2ea043) ![Offline](https://img.shields.io/badge/offline-fähig-555) ![Sprache](https://img.shields.io/badge/Sprache-Deutsch-555)

> **Beta-Hinweis:** Gaming-Hub, Admin-Zentrale, Spiel-Tagebuch, Karriere-Begleiter und KI-Prompt sind noch als **Beta** gekennzeichnet. Das FM27 Dashboard selbst ist stabil.

---

## Inhalt

- [Was ist das?](#was-ist-das)
- [Funktionen](#funktionen)
- [Loslegen](#loslegen)
- [Eigene Kopie auf GitHub Pages](#eigene-kopie-auf-github-pages)
- [Updates einspielen](#updates-einspielen)
- [Deine Daten](#deine-daten)
- [Browser](#browser)
- [Für Entwickler](#für-entwickler)
- [Roadmap](#roadmap)
- [English summary](#english-summary)
- [Rechtliches](#rechtliches)

---

## Was ist das?

Football Manager ist ein riesiges Spiel – aber vieles, was man sich als Manager merkt, hat im Spiel keinen Platz: Kaderplanung über mehrere Saisons, eigene Notizen zu Spielern und Gegnern, Ziele, Finanzpläne, die Geschichte deiner Karriere.

Dieses Dashboard ist der Begleiter **neben** dem Spiel. Es startet im **Gaming-Hub**, von dem aus du in deine FM-Spielstände, dein Spiel-Tagebuch, den Karriere-Begleiter für andere Spiele und die Admin-Zentrale springst.

---

## Funktionen

### 🎮 Gaming-Hub (Beta)
- **Startseite** mit Begrüßung, Uhrzeit und einer großen **„Weiterspielen“-Karte** für deinen zuletzt gespielten Spielstand – in den Farben deines Vereins
- **Spielstände** auf einen Blick, sortiert nach „zuletzt gespielt“, Wechsel mit einem Klick
- **Admin & Sicherung**: Sicherungsstatus, Speicher und Fehlerprotokoll auf einen Blick
- **Neuigkeiten** aus den letzten Versionen
- Ganze Panels sind klickbar, Taste **H** öffnet den Hub von überall

### ⚽ FM27 Dashboard
- **Portal** mit frei anordenbaren Widgets: nächstes Spiel, Form & Bilanz, Kaderplan, Startelf, Ziele, offene Aufgaben
- **Kader** als Tabelle mit verschiebbaren Spalten, eigenen Feldern, Filtern und Import aus FM
- **Taktik** mit Spielfeld, Plan A/B, Standards und zwei Phasen: **mit Ball / gegen den Ball** – die Spieler laufen beim Umschalten sichtbar auf ihre Positionen
- **🤖 KI-Prompt (Beta)**: stellt aus Kader, Taktik, Ergebnissen und nächstem Gegner eine fertige Anfrage zusammen – kopieren und bei Claude oder einer anderen KI einfügen. Es wird nichts automatisch gesendet.
- **Spieltag**, Ergebnisse und Gegner-Datenbank
- **Transfers** mit Transfer-Center, Leihen und Verkaufsliste
- **Finanzen**, Gehälter, Verträge und Bosman-Warnungen
- **Entwicklung** und Talente
- **Journey**: deine Manager-Karriere mit Stationen, Tagebuch, Zielen und eigenen Regeln
- **Nationalteam-Modus** mit Spielerpool, Nominierung, Lehrgängen und Verknüpfung zum Vereinsspielstand (⇄)
- **Mehrere Spielstände** mit Schnellwechsler (Taste **S**)

### 📓 Spiel-Tagebuch (Beta)
- **Sessions** mit Timer, der auch weiterläuft, wenn du das Dashboard schließt
- **Session-Vorhaben**: beim Start festlegen, beim Beenden abhaken
- **Bilder** zu jeder Session – auch per **Strg + V** (z. B. Screenshots aus FM)
- **Challenges** als einfaches Ziel, mit Zähler oder mit Teilschritten
- **Zeitleiste**, Wochenüberblick und 🔥 Serie
- Verknüpft mit der **Journey** – und auch für Spiele außerhalb des Dashboards nutzbar

### 🏆 Karriere-Begleiter (Beta)
- Karrieren aus **anderen Spielen** (z. B. EA FC, F1 Manager) mit eigenem Wappen
- **Liste mit frei wählbaren Spalten** (Vorlagen für Fußball und Motorsport)
- **Saisonziele** und **Saisonverlauf**, „Saison abschließen“ nimmt die Liste mit
- Sessions und Challenges aus dem Tagebuch lassen sich einer Karriere zuordnen

### 🛡 Admin-Zentrale (Beta)
- **Allgemein · alle Spielstände**: Zentrale, Sicherung, Speicher, Tastenkürzel, Fehlerprotokoll, Sicherheit, Changelog
- **Pro Spielstand**: Übersicht, Notizen, Protokoll, Wiederherstellungspunkte, Datenprüfung, Wartung & Batch, Rohdaten, Listen, Eigene Felder
- Geschützt per **PIN** mit automatischer Sperre

### ⌨ Bedienung
- **Befehlspalette** mit **Strg + K**
- **Tastenkürzel** frei anpassbar, Übersicht mit **?**
- **Hell- und Dunkel-Design**, beide auf gute Lesbarkeit geprüft
- Als **App installierbar** (PWA), funktioniert offline

---

## Loslegen

1. Die Seite im Browser öffnen (z. B. deine GitHub-Pages-Adresse, siehe unten).
2. Beim ersten Start führt dich ein kurzer Willkommens-Dialog durch die ersten Schritte – mit Beispieldaten oder direkt mit deinem eigenen Verein.
3. Kader aus FM übernehmen: **Kader → Import aus FM**.
4. Optional: in der Adressleiste auf **„Installieren“** klicken – dann startet das Dashboard wie eine normale App.

**Tipp:** Unter **Hub → Admin & Sicherung → Sicherung** einen Ordner für die automatische Sicherung wählen, z. B. in OneDrive oder Google Drive.

---

## Eigene Kopie auf GitHub Pages

1. Repository forken oder ein neues anlegen und alle Dateien hochladen.
2. **Settings → Pages → Build and deployment**: Quelle *Deploy from a branch*, Branch `main`, Ordner `/ (root)`.
3. Nach 1–2 Minuten ist das Dashboard unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

> Beim Hochladen über die GitHub-Webseite gehen Ordner manchmal verloren und alle Dateien landen im Hauptverzeichnis. **Das ist kein Problem** – das Dashboard findet seine Programmdateien in beiden Fällen und lädt immer die Version, die zur aktuellen `index.html` passt.

---

## Updates einspielen

1. Neue Version entpacken.
2. Im Repository **Add file → Upload files**, alle Dateien hineinziehen, **Commit changes**.
3. 1–2 Minuten warten, dann die Seite mit **Strg + F5** neu laden.

Deine Daten sind von Updates nicht betroffen – sie liegen in deinem Browser, nicht in den Dateien.

---

## Deine Daten

- **Speicherort:** in der Datenbank deines Browsers (IndexedDB). Es gibt **keinen Server, kein Konto und kein Tracking**.
- **Automatische Ordner-Sicherung:** eine Datei pro Spielstand plus eine für Hub, Tagebuch und Einstellungen – jeweils mit Tageskopien.
- **Umzug:** *Admin-Zentrale → Sicherung → Alles exportieren* erzeugt eine Datei mit allem, z. B. für einen neuen PC oder einen anderen Browser.
- **Wiederherstellungspunkte** und **Rückgängig** für fast jede Aktion.

> Browserdaten löschen entfernt auch die Dashboard-Daten. Regelmäßig exportieren oder die Ordner-Sicherung nutzen.

---

## Browser

| Browser | Status |
|---|---|
| Chrome, Edge, Vivaldi, Brave (Chromium) | ✅ empfohlen – alle Funktionen inklusive Ordner-Sicherung |
| Firefox, Safari | ✅ funktioniert – ohne automatische Ordner-Sicherung (der Browser unterstützt das Schreiben in Ordner nicht); Sicherung über „Alles exportieren“ |

---

## Für Entwickler

Reines HTML, CSS und JavaScript – **kein Build-Schritt**, keine Abhängigkeiten zur Laufzeit.

```
index.html             Seite + Lader für die Programmteile
style.css              Aussehen (Hell/Dunkel)
sw.js                  Service Worker (offline)
manifest.webmanifest   App-Installation
js/01-core.js … js/25-init.js   Programmteile, in dieser Reihenfolge geladen
icons/                 App-Symbole
tests/run-tests.js     Testreihe
.github/workflows/     automatische Tests bei jedem Push
```

### Tests

```bash
npm install
npm test
```

Die Testreihe läuft mit [jsdom](https://github.com/jsdom/jsdom) und [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) und prüft über 1.200 Fälle – von der Datenbank-Migration bis zum Tagebuch. Mit dem Workflow in `.github/workflows/tests.yml` laufen sie bei jedem Push automatisch (dafür müssen die Ordner beim Hochladen erhalten bleiben, z. B. mit GitHub Desktop).

---

## Roadmap

**Version 12 (geplant)**
- 🌍 **Mehrsprachigkeit:** Deutsch bleibt Hauptsprache, **Englisch** kommt als zweite Sprache dazu
- ✅ **Raus aus der Beta:** Hub, Admin-Zentrale, Spiel-Tagebuch, Karriere-Begleiter und KI-Prompt werden gemeinsam für stabil erklärt – vor der Übersetzung, damit die Texte feststehen

**Später**
- Import an das Exportformat von **FM27** anpassen, sobald das Spiel erscheint
- Rollenlisten an die exakten FM-Rollennamen anpassen

Den vollständigen Verlauf findest du im Dashboard unter **Hub → Neuigkeiten**.

---

## English summary

**FM27 Manager Dashboard · Gaming-Hub** is a browser-based companion app for *Football Manager* – squad planning, tactics (in and out of possession), transfers, finances, a manager "journey", national team mode and multiple saves. On top of that, a **Gaming-Hub** adds a game diary (session timer, screenshots, challenges), a career companion for other games and a central admin area.

It runs entirely in your browser, works offline, needs no account and keeps **all data on your device**. The interface is currently **German only** – English is planned for version 12.

---

## Rechtliches

Inoffizielles Fan-Projekt. Nicht verbunden mit Sports Interactive oder SEGA. *Football Manager* ist eine Marke der jeweiligen Rechteinhaber. Es werden keine Spieldateien, Logos oder Wappen des Spiels verwendet – Vereinswappen im Dashboard sind selbst erzeugte Kürzel in Vereinsfarben.

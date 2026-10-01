# FM27 Dashboard als App einrichten

Damit das Dashboard als echte App läuft (eigenes Fenster, Symbol im Startmenü und in der Taskleiste, auch offline), muss es einmal über eine Webadresse erreichbar sein. Browser erlauben das Installieren nur für Seiten mit https, nicht für eine lokal geöffnete Datei.

Die einfachste kostenlose Lösung ist **GitHub Pages**.

> **Deine Daten bleiben bei dir.** Hochgeladen werden nur die Programmdateien aus diesem Ordner. Spielstände, Notizen, PIN usw. speichert die App weiterhin nur lokal in Vivaldi auf deinem Rechner.
> **Lade deshalb niemals** Umzugs-, Export- oder Sicherungsdateien (`fm27_….json`) in das GitHub-Projekt hoch.

Die Menünamen bei GitHub und Vivaldi können sich mit der Zeit leicht ändern. Der Ablauf bleibt aber gleich.

---

## Teil 1 – Einmalig: Dashboard bei GitHub Pages bereitstellen (ca. 10 Minuten)

1. **Konto anlegen:** Auf <https://github.com> kostenlos registrieren (falls du noch kein Konto hast).
2. **Neues Projekt (Repository) anlegen:** Oben rechts auf **„+“ → „New repository“**.
   - Name z. B. `fm27-dashboard`
   - Sichtbarkeit **„Public“** (GitHub Pages ist im kostenlosen Tarif nur für öffentliche Projekte verfügbar. Öffentlich ist dabei nur der Programmcode, keine Daten.)
   - **„Create repository“** klicken.
3. **Dateien hochladen:** Auf der neuen Projektseite auf **„uploading an existing file“** klicken und den **gesamten Inhalt** dieses Ordners hineinziehen:
   `index.html`, `app.js`, `style.css`, `manifest.webmanifest`, `sw.js` und den Ordner `icons` (mit allen Bildern darin).
   Unten auf **„Commit changes“** klicken.
4. **GitHub Pages einschalten:** Im Projekt auf **„Settings“ → „Pages“**.
   Unter „Build and deployment“ bei **Source** „Deploy from a branch“ wählen, Branch **„main“** und Ordner **„/ (root)“**, dann **„Save“**.
5. **Kurz warten** (1–3 Minuten). Oben auf derselben Seite erscheint dann deine Adresse, etwa:
   `https://DEIN-NAME.github.io/fm27-dashboard/`

## Teil 2 – Deine Daten umziehen (2 Minuten)

1. Die **bisherige Datei-Version** öffnen (die `index.html` aus deinem Ordner, mit diesen neuen Dateien).
2. **Zahnrad unten links → „Alles exportieren (Umzug)“.** Es wird eine Datei `fm27_umzug_….json` heruntergeladen.
3. Die neue Adresse in Vivaldi öffnen. Beim ersten Start erscheint **„Willkommen in der FM27-App“**.
4. **„Umzugsdatei laden …“** klicken und die gerade heruntergeladene Datei wählen → **„Alles übernehmen“**.
   Alle Spielstände, Einstellungen, Layout, Listen, PIN, Protokoll und Wiederherstellungspunkte sind da.

## Teil 3 – Als App installieren

- **Zahnrad unten links → „Als App installieren“**, oder
- in Vivaldi per **Rechtsklick auf den Tab → „… installieren“** bzw. über das Installieren-Symbol in der Adressleiste.

Danach findest du „FM27 Dashboard“ im Startmenü und kannst es an die Taskleiste anheften. Die alte Verknüpfung auf die Datei brauchst du nicht mehr.

## Teil 4 – Automatische Sicherung neu verbinden

Die Verbindung zum Sicherungsordner gehört zur alten Datei-Version und zieht nicht mit um. Deshalb in der App einmal:
**Admin-Bereich → Wiederherstellung → „Ordner wählen …“** und denselben Ordner wie bisher auswählen.

---

## Später: Updates einspielen

Wenn du neue Dateien von mir bekommst:

1. Im GitHub-Projekt auf **„Add file“ → „Upload files“**.
2. Die neuen Dateien hineinziehen (gleichnamige werden ersetzt) → **„Commit changes“**.
3. Nach 1–3 Minuten meldet die App beim nächsten Start **„Neue Version verfügbar“** → **„Jetzt laden“**.

Deine Daten bleiben bei Updates erhalten, denn sie liegen nicht bei GitHub, sondern auf deinem Rechner.

## Version 11.0 – was drin ist

- **Kader & Pool:** Tabelle mit frei verschiebbaren Spalten, eigene Felder, FM-Import (CSV/Text/HTML), Massenbearbeitung.
- **Taktik, Spieltag, Transfers:** Aufstellung per Drag & Drop, Transfer-Center mit Deal-Pipeline und Deadline Day, Finanzen.
- **Journey:** Rollenspiel pro Spielstand – Jobsuche, Lizenzen, Stationen, Bankkonto, Sparziele, Tagebuch.
- **Nationalteam-Modus:** eigener Spielstand mit Landesfarben, Nominierung und Lehrgängen; mit dem Verein verknüpfbar (⇄).
- **Spielstand wechseln:** Wappen oben links oder Taste S. **Tastenkürzel** frei belegbar (Zahnrad → Tastenkürzel anpassen).

## Deine Daten – so bleiben sie sicher

1. **Alles lebt lokal** in deinem Browser – seit 11.2 in der Browser-Datenbank (IndexedDB) mit viel Platz. Nichts wird hochgeladen. Achtung: „Browserdaten / Websitedaten löschen“ löscht auch das Dashboard – vorher „Alles exportieren“.
2. **Ordner-Sicherung einschalten** (Admin → Wiederherstellung): sichert automatisch in einen Ordner deiner Wahl, auch mit Tageskopien.
3. **Vor großen Schritten** (Browserwechsel, neuer PC, Browser-Daten löschen): Zahnrad → **„Alles exportieren (Umzug)“** – die Datei enthält alle Spielstände, Journey, Einstellungen und Tastenkürzel.
4. **Etwas schiefgelaufen?** Admin → Wiederherstellung (Wiederherstellungspunkte, Ordner anzeigen) oder „Import“ mit einer Sicherungsdatei. Ein beschädigter Spielstand wird nie überschrieben – das Original liegt unter Admin → Wartung.
5. **Fehler melden:** Admin → Datenprüfung → Fehlerprotokoll → „Bericht kopieren“ (enthält keine Spielstand-Daten).

**Browser:** gedacht für Vivaldi, Chrome oder Edge. In Firefox und Safari läuft das Dashboard ebenfalls, die automatische Ordner-Sicherung gibt es dort aber nicht – dort regelmäßig „Alles exportieren“ nutzen.


## Automatische Tests auf GitHub (ab 11.1, einmalig einrichten)

Bei jedem Hochladen prüft GitHub dann das komplette Dashboard (über 1.000 Prüfungen) – du siehst einen grünen Haken ✓ oder ein rotes ✗ neben deinem Commit und unter dem Reiter **Actions**.

1. Lade zusätzlich zu den App-Dateien hoch: den Ordner **`tests`**, die Datei **`package.json`** und die Datei **`.gitignore`**.
2. Die Datei für GitHub selbst liegt im versteckten Ordner `.github/workflows/`. So legst du sie am einfachsten an: im Repository **Add file → Create new file**, als Namen `.github/workflows/tests.yml` eintippen (die Schrägstriche legen die Ordner automatisch an), den Inhalt aus der mitgelieferten Datei `tests.yml` einfügen, **Commit changes**.
3. Unter **Actions** erscheint „Tests“. Beim ersten Mal ggf. auf „I understand my workflows, go ahead and enable them“ klicken. Von Hand starten: Actions → Tests → **Run workflow**.

Rotes ✗? Unter Actions auf den Lauf klicken – dort steht, welche Prüfung fehlgeschlagen ist. Die App auf GitHub Pages läuft davon unabhängig weiter; die Tests warnen nur.


## Desktop-App für Windows und Linux (Vorschau, ab 11.3)

GitHub baut dir die Desktop-App auf Knopfdruck – du musst nichts installieren:

1. Alle Dateien wie gewohnt hochladen (neu sind die Ordner `src-tauri` und `scripts` sowie `.github/workflows/desktop.yml`).
2. Im Repository **Actions → „Desktop-App bauen“ → Run workflow**. Der erste Lauf dauert ca. 10–20 Minuten.
3. Wenn er grün ist: unten im Lauf unter **Artifacts** „FM27-Dashboard-Windows“ (bzw. „-Linux“) herunterladen und entpacken.
   - **Windows:** die `…setup.exe` starten. Beim ersten Start meldet Windows „Der Computer wurde durch Windows geschützt“ (unsignierte App) → **Weitere Informationen → Trotzdem ausführen**.
   - **Linux:** `.deb` installieren oder die `.AppImage` ausführbar machen und starten.
4. **Daten übernehmen:** Die Desktop-App hat ihren eigenen Speicher. Im Browser Zahnrad → „Alles exportieren (Umzug)“, dann in der Desktop-App beim Willkommen „Umzugsdatei laden“.

Wichtig: Es ist eine **Vorschau**. Die automatische Ordner-Sicherung und Downloads (Export) hängen davon ab, was die Fenster-Komponente des Systems kann – unter Linux fehlen sie voraussichtlich. Schlägt der Bau fehl: den roten Lauf öffnen und mir die Fehlermeldung schicken.


## Gut zu wissen

- **Offline:** Die App startet auch ohne Internet. Updates kommen, sobald du wieder online bist.
- **Browserdaten löschen:** Löscht du in Vivaldi die Website-Daten der App-Adresse, sind die Daten dort weg. Genau dafür gibt es die automatische Ordner-Sicherung (Teil 4).
- **Anderes Gerät:** Dieselbe Adresse öffnen, installieren und die Umzugsdatei bzw. die neueste Sicherung aus dem Cloud-Ordner laden.

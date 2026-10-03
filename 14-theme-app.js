/* ==========================================================================
   READABLE ACCENT COLOURS (WCAG 4.5:1)
   The accent colour is freely chosen – so readable variants are calculated:
   --accent-text  accent used as text on the page background of the current theme
   --accent-fill  accent used as a button/badge surface, --on-accent = its text colour
   ========================================================================== */
function hexRgb(h){ const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if(!m) return [79,140,255]; const n = parseInt(m[1],16); return [n>>16 & 255, n>>8 & 255, n & 255]; }
const rgbHex = c => "#" + c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
const mixRgb = (a, b, t) => a.map((v,i)=>v + (b[i]-v)*t);
function relLum(c){ const f = v=>{ v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); }
function contrastRgb(a, b){ const A = relLum(a), B = relLum(b); return (Math.max(A,B)+0.05)/(Math.min(A,B)+0.05); }
function accentVariants(hex, theme){
  const acc = hexRgb(hex), light = theme === "light";
  const WHITE = [255,255,255], INK = [15,17,23];
  // worst-case text backgrounds: page background and the accent-tinted "active" surfaces
  const pageBgs = light ? [[255,255,255],[236,238,243]] : [[21,24,34],[30,34,48]];
  const bgs = pageBgs.concat(pageBgs.map(b=>mixRgb(b, acc, 0.18)));
  // integer steps (k × 5 %) – adding 0.05 repeatedly never lands exactly on 0.4 (floating point)
  let text = acc;
  for(let k = 0; k <= 20; k++){
    text = mixRgb(acc, light ? [0,0,0] : WHITE, k/20);
    if(bgs.every(b=>contrastRgb(text, b) >= 4.6)) break;
  }
  // button surface: white text if at most 40 % darkening is enough, otherwise the original colour with dark text
  let fill = null, on = WHITE;
  for(let k = 0; k <= 8 && !fill; k++){
    const f = mixRgb(acc, [0,0,0], k/20);
    if(contrastRgb(WHITE, f) >= 4.6) fill = f;
  }
  if(!fill){ fill = acc; on = contrastRgb(INK, acc) >= contrastRgb(WHITE, acc) ? INK : WHITE; }
  return {text: rgbHex(text), fill: rgbHex(fill), on: rgbHex(on)};
}
function setAccentVars(hex){
  const theme = (typeof layout !== "undefined" && layout.theme === "light") ? "light" : "dark";
  const v = accentVariants(hex, theme), st = document.documentElement.style;
  st.setProperty("--accent", hex);
  st.setProperty("--accent-text", v.text);
  st.setProperty("--accent-fill", v.fill);
  st.setProperty("--on-accent", v.on);
}

/* ==========================================================================
   SIDEBAR MENU (flyout) & COLOUR THEME
   Hover (mouse) opens the flyout, click/tap/Enter toggles it, Esc or a click outside closes it.
   ========================================================================== */
const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z"/></svg>';
function applyTheme(){
  const light = layout.theme === "light";
  try{ localStorage.setItem("fm27_theme_hint", light ? "light" : "dark"); }catch(e){}   // 11.3: read by the tiny pre-script in index.html (no dark flash)
  if(light) document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
  const label = qs("#themeLabel"), icon = qs("#themeIcon");
  if(label) label.textContent = light ? "Dunkles Design" : "Helles Design";
  if(icon) icon.innerHTML = light ? MOON_ICON : SUN_ICON;
  const meta = qs('meta[name="theme-color"]'); if(meta) meta.setAttribute("content", light ? "#f5f6f9" : "#0f1117");
  if(typeof state !== "undefined" && state) setAccentVars(state.club.accent);
}
function toggleTheme(){
  layout.theme = layout.theme === "light" ? "dark" : "light";
  saveLayout(); applyTheme();
  toast(layout.theme === "light" ? "Helles Design aktiv" : "Dunkles Design aktiv");
}

let menuCloseTimer = null;
function menuIsOpen(){ return !qs("#sideMenu").hidden; }
function openMenu(focusFirst){
  clearTimeout(menuCloseTimer);
  const m = qs("#sideMenu"); if(!m.hidden) return;
  m.hidden = false;
  qs("#btnMenu").setAttribute("aria-expanded", "true");
  qs("#menuWrap").classList.add("open");
  if(focusFirst){ const f = qs(".sm-item", m); if(f) f.focus(); }
}
function closeMenu(returnFocus){
  clearTimeout(menuCloseTimer);
  const m = qs("#sideMenu"); if(m.hidden) return;
  m.hidden = true;
  qs("#btnMenu").setAttribute("aria-expanded", "false");
  qs("#menuWrap").classList.remove("open");
  if(returnFocus) qs("#btnMenu").focus();
}
function initSideMenu(){
  const wrap = qs("#menuWrap"), btn = qs("#btnMenu"), menu = qs("#sideMenu");
  let openedByHoverAt = 0;
  // mouse only: touch devices get the click/tap behaviour (a tap would otherwise open and close at once)
  wrap.addEventListener("pointerenter", e=>{ if(e.pointerType === "mouse"){ openMenu(false); openedByHoverAt = Date.now(); } });
  wrap.addEventListener("pointerleave", e=>{ if(e.pointerType === "mouse"){ clearTimeout(menuCloseTimer); menuCloseTimer = setTimeout(()=>closeMenu(false), 280); } });
  btn.addEventListener("click", ()=>{
    if(menuIsOpen() && Date.now() - openedByHoverAt > 400) closeMenu(false);
    else openMenu(document.activeElement === btn && !openedByHoverAt);
    openedByHoverAt = 0;
  });
  btn.addEventListener("keydown", e=>{ if(e.key === "ArrowDown" || e.key === "ArrowRight"){ e.preventDefault(); openMenu(true); } });
  // any menu entry closes the menu after its own click handler ran
  menu.addEventListener("click", e=>{ if(e.target.closest(".sm-item")) setTimeout(()=>closeMenu(false), 0); });
  menu.addEventListener("keydown", e=>{
    const items = qsa(".sm-item", menu), i = items.indexOf(document.activeElement);
    if(e.key === "ArrowDown"){ e.preventDefault(); items[(i+1) % items.length].focus(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); items[(i-1+items.length) % items.length].focus(); }
    else if(e.key === "Home"){ e.preventDefault(); items[0].focus(); }
    else if(e.key === "End"){ e.preventDefault(); items[items.length-1].focus(); }
    else if(e.key === "Escape" || e.key === "ArrowLeft"){ e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if(e.key === "Tab") closeMenu(false);
  });
  document.addEventListener("pointerdown", e=>{ if(menuIsOpen() && !e.target.closest("#menuWrap")) closeMenu(false); });
  document.addEventListener("keydown", e=>{ if(e.key === "Escape" && menuIsOpen()) closeMenu(true); }, true);
  qs("#btnTheme").addEventListener("click", toggleTheme);
  qs("#btnHelp").addEventListener("click", openShortcutHelp);
  applyTheme();
}


/* ==========================================================================
   VERSION & CHANGELOG
   ========================================================================== */
const APP_VERSION = "12.0.0-vorschau.5";
const SEEN_VERSION_KEY = "fm27_seen_version";
// newest first · tag: neu | besser | fix
const CHANGELOG = [
  {v:"12.0.0-vorschau.5", beta:true, title:"Nexus · Vorschau 5: die echten FM26-Rollen", items:[
    ["neu","Taktik: alle 68 Rollen aus Football Manager 26 mit den offiziellen deutschen Namen – mit Ball (Offensive + Def./Off.) und gegen den Ball (Defensive + Def./Off.), passend zur Position (AV/FV auf LV/RV, Außenspieler auf LF/RF, Halbraumverteidiger bei IV …)."],
    ["neu","Neues Rollen-Menü: beim Überfahren oder mit ↑/↓ erscheinen englischer Name, Phase und Kurzbeschreibung der Rolle; Enter wählt, Buchstaben springen."],
    ["besser","Bestehende Aufstellungen werden automatisch umgestellt (z. B. Mezzala → Weiter Achter, Inside Forward → Inverser Außenstürmer, „Hoch bleibend“ → Umschaltstürmer/-zehner/-flügelspieler); selbst angelegte Rollen bleiben erhalten. Die Umschalt-Rollen bleiben gegen den Ball vorne."],
    ["besser","Der KI-Prompt nutzt damit automatisch die echten FM-Rollennamen."]]},
  {v:"12.0.0-vorschau.4", beta:true, title:"Nexus · Vorschau 4: Session & Woche im Hub", items:[
    ["neu","Hub → Seitenleiste „Session & Woche“: Session direkt im Hub starten (mit Vorhaben) und beenden, laufende Uhr, Spielzeit und Sessions dieser Woche, 🔥 Serie und deine aktiven Challenges mit Fortschritt. Klick auf die Karte öffnet das Tagebuch."]]},
  {v:"12.0.0-vorschau.3", beta:true, title:"Nexus · Vorschau 3: aufgeräumter Hub", items:[
    ["besser","Hub neu aufgeteilt: links die Hauptbühne (Begrüßung, Weiterspielen, Module), rechts eine Seitenleiste mit Uhr, Spielständen, Admin & Sicherung und Neuigkeiten – breiter auf großen Bildschirmen, ruhiger in der Mitte."],
    ["besser","Module als flache Kacheln, Admin-Status als kompakte Felder, Neuigkeiten als schlanke Liste (ein Klick öffnet den ganzen Changelog)."]]},
  {v:"12.0.0-vorschau.2", beta:true, title:"Nexus · Vorschau 2: Videos an Sessions & neuer Look", items:[
    ["neu","Videos an Sessions: im Session-Dialog direkt aus dem Medien-Ordner wählen (Vorschau-Kacheln zum Anhaken) oder Links einfügen – in der Zeitleiste als Kacheln, ein Klick spielt sie im eigenen Player."],
    ["neu","Neuer Name: Nexus Dashboard – mit dem Würfel als Logo und neuen App-Symbolen (für die kleinen Größen eine vereinfachte Fassung). Das FM-Modul heißt weiter FM27 Dashboard; deine Daten bleiben unverändert."],
    ["neu","Farben folgen dem aktiven Profil: im Karriere-Begleiter die Farbe der Karriere, im Tagebuch die der laufenden Session – zurück im Dashboard wieder die des Vereins."],
    ["besser","Der große Play-Knopf im Player ist jetzt rund."],
    ["fix","Karriere-Begleiter: aus „Saison 1“ wurde „Saison Saison 1“."]]},
  {v:"12.0.0-vorschau.1", beta:true, title:"Nexus · Vorschau 1: Medien", items:[
    ["neu","Spiel-Tagebuch → 🎬 Medien: verbinde deinen Aufnahme-Ordner (z. B. Videos\\Captures) – das Dashboard zeigt alle Videos mit Vorschaubild, Länge und Datum, durchsuchbar und nach Unterordnern filterbar. Der Ordner wird nur gelesen, nichts wird kopiert."],
    ["neu","Eigener Videoplayer: Zeitleiste mit Vorschau-Zeit, ±10 s, Bild für Bild, Geschwindigkeit 0,25–2×, Lautstärke, Wiederholen, Bild im Bild, Vollbild – plus Tastenkürzel (Leertaste, J/L, ←/→, ↑/↓, M, F, , und ., [ und ], 0–9, Esc)."],
    ["neu","Video-Links: YouTube und Twitch-Clips eingebettet, direkte Videodateien (.mp4, .webm) im eigenen Player."]]},
  {v:"11.9.1", title:"Tippen im Hub repariert", items:[
    ["fix","In Textfeldern im Hub (Admin-Zentrale, Karriere-Begleiter) öffnete ein „s“ das Spielstand-Menü – und andere Ein-Tasten-Kürzel lösten ebenfalls aus. Jetzt gilt wie im Dashboard: beim Tippen keine Kürzel, nur Strg + K (Befehlspalette) funktioniert überall."]]},
  {v:"11.9", beta:true, title:"Karriere-Begleiter (Beta)", items:[
    ["neu","Hub → Karriere-Begleiter: Karrieren aus anderen Spielen (EA FC, F1 Manager …) mit eigenem Wappen, Spiel, Team und Saison."],
    ["neu","Liste mit frei wählbaren Spalten (Vorlagen für Fußball und Motorsport), direkt bearbeitbar und sortierbar; Saisonziele mit Status; Saisonverlauf mit Platz, Bilanz und Titeln – „Saison abschließen“ nimmt die Liste mit."],
    ["neu","Verknüpft mit dem Spiel-Tagebuch: Sessions und Challenges lassen sich einer Karriere zuordnen, die Karriere zeigt ihre letzten Sessions und startet eigene."],
    ["besser","Karrieren sind in „Alles exportieren (Umzug)“ und in der Ordner-Sicherung (Hub, Tagebuch & Einstellungen) enthalten."]]},
  {v:"11.8.2", title:"Ordner-Sicherung: auch Hub & Tagebuch", items:[
    ["fix","Die automatische Ordner-Sicherung sicherte bisher nur die Spielstände – jetzt auch Hub, Spiel-Tagebuch (mit Bildern), Tastenkürzel und Layout, als eigene Datei mit Tageskopien. Sie wird nur neu geschrieben, wenn sich daran etwas geändert hat."],
    ["besser","Admin-Zentrale → Sicherung: eigene Karte „Hub, Tagebuch & Einstellungen“; „Laden …“ stellt sie wieder her – Spielstände bleiben dabei unberührt."]]},
  {v:"11.8.1", beta:true, title:"Tagebuch: Bilder, Vorhaben & mehr", items:[
    ["fix","Beim Start blitzte erst kurz das Dashboard auf, bevor der Hub erschien – jetzt erscheint direkt der Hub (bzw. direkt das Dashboard, wenn so eingestellt)."],
    ["neu","Bilder in Sessions: bis zu 6 pro Session – per Dateiauswahl oder einfach mit Strg + V einfügen (z. B. Screenshots aus FM). Vorschau in der Zeitleiste, Klick öffnet die große Ansicht zum Blättern (auch mit ← / →)."],
    ["neu","Geschaffte Challenges in der Zeitleiste: „↺ wieder aktiv“ (falls versehentlich) und „✕ löschen“ – beides rückgängig machbar."],
    ["neu","Session-Vorhaben: beim Start eintragen, was du vorhast – es steht während der Session oben, beim Beenden fragt das Tagebuch „geschafft?“ und übernimmt es als Titel."],
    ["besser","Zeitleiste filtern nach Spielstand oder Spiel."]]},
  {v:"11.8", beta:true, title:"Spiel-Tagebuch (Beta)", items:[
    ["neu","Hub → Spiel-Tagebuch: „▶ Session starten“ – der Timer läuft mit (auch wenn du das Dashboard schließt); beim Beenden hältst du fest, in welchem Spielstand oder Spiel du warst, was passiert ist und wie die Stimmung war. Sessions lassen sich auch nachtragen."],
    ["neu","Challenges: eigene Herausforderungen als einfaches Ziel, mit Zähler (z. B. 12 / 30 Siege) oder mit Teilschritten zum Abhaken – „geschafft“ erscheint mit 🏆 in der Zeitleiste."],
    ["neu","Zeitleiste nach Tagen, „Diese Woche“ mit Spielzeit, Sessions, Verteilung auf Spielstände und 🔥 Serie."],
    ["neu","Verknüpft mit der Journey: deren Tagebuch-Einträge aller Spielstände erscheinen im Tagebuch; eine Session kann per Häkchen ins Journey-Tagebuch übernommen werden (mit Spieldatum)."],
    ["neu","Andere Spiele: Sessions und Challenges gehen auch für Spiele außerhalb des Dashboards (z. B. EA FC)."]]},
  {v:"11.7.1", title:"Verein ⇄ Nationalteam: Umschalter repariert", items:[
    ["fix","Im Nationalteam fehlten Umschalter und Kürzel zum Verein, wenn die Verknüpfung nur auf einer Seite gespeichert war (z. B. nach „Rückgängig“ direkt nach der Einrichtung). Die Verknüpfung repariert sich jetzt selbst – auch bei bestehenden Spielständen."],
    ["fix","„Rückgängig“ nach dem Speichern der Nationalteam-Einstellungen setzt die Verknüpfung auf beiden Seiten zurück."],
    ["besser","Neuer Umschalter oben: Wappen und Name des Ziels („Zum Verein · Feyenoord Rotterdam“; auf schmaleren Bildschirmen nur Wappen + ⇄) in dessen Farben, mit deinem Tastenkürzel, falls vergeben."]]},
  {v:"11.7", beta:true, title:"Admin-Zentrale im Hub (Beta)", items:[
    ["neu","Der Admin-Bereich ist jetzt die Admin-Zentrale im Hub: oben „Allgemein · alle Spielstände“ (Zentrale, Sicherung, Speicher, Tastenkürzel, Fehlerprotokoll, Sicherheit, Changelog), darunter alles zum aktiven Spielstand (Übersicht, Notizen, Protokoll, Wiederherstellungspunkte, Datenprüfung, Wartung & Batch, Rohdaten, Listen, Eigene Felder)."],
    ["neu","Zentrale: Status auf einen Blick, alle Spielstände mit Größe, „zuletzt gespielt“ und letztem Export, dazu Schnellzugriff (Alles exportieren, Datei laden)."],
    ["besser","Was vorher gemischt war, ist getrennt: Ordner-Sicherung und Umzug unter „Sicherung“, Speicherbelegung und Speicher-Altlasten unter „Speicher“, das Fehlerprotokoll als eigener Bereich."],
    ["besser","Oben links in der Seitenleiste sitzt jetzt der Hub-Knopf; das Vereinswappen steht in der Kopfleiste neben dem Vereinsnamen (Klick = Spielstand wechseln)."],
    ["besser","Esc führt aus der Admin-Zentrale zurück zum Hub; PIN-Schutz und automatische Sperre gelten wie bisher."]]},
  {v:"11.6.1", beta:true, title:"Hub: ganze Panels klickbar & Neuigkeiten", items:[
    ["besser","Im Hub öffnet ein Klick irgendwo auf ein Panel dieses Panel: „Weiterspielen“ das Dashboard, „Spielstände“ die Auswahl, „Admin & Sicherung“ den Admin-Bereich. Knöpfe darin tun weiterhin nur ihre eigene Aufgabe."],
    ["neu","Panel „Neuigkeiten“ mit den letzten drei Versionen – ein Klick öffnet den kompletten Changelog (ohne PIN)."],
    ["besser","„Was ist neu?“ nach einem Update öffnet jetzt direkt den Changelog statt des PIN-geschützten Admin-Bereichs."]]},
  {v:"11.6", beta:true, title:"Neue Hub-Startseite (Beta)", items:[
    ["neu","Begrüßung mit Uhrzeit und Datum, darunter die große Karte „Weiterspielen“: aktueller Spielstand mit Wappen, Verein, Saison, Spieldatum und Kennzahlen (Transfer frei, Taktik, nächstes Spiel – im Nationalteam Nominierung und Bilanz). Die Karte nimmt die Farben deines Vereins an."],
    ["neu","Karte „Spielstände“: die letzten vier, sortiert nach „zuletzt gespielt“ – ein Klick wechselt und öffnet; „Alle Spielstände“ öffnet den Schnellwechsler."],
    ["neu","Karte „Admin & Sicherung“: Ordner-Sicherung, letzter Export, Speicher und Fehlerprotokoll auf einen Blick, mit „Admin öffnen“ und „Alles exportieren“."],
    ["besser","Karriere-Begleiter und Spiel-Tagebuch haben ihre Plätze schon – sie folgen in den nächsten Versionen."]]},
  {v:"11.5", beta:true, title:"KI-Prompt für die Taktik (Beta) · Bibliothek entfernt", items:[
    ["neu","Taktik → „🤖 KI-Prompt“: stellt eine fertige Anfrage aus Kader, Taktik (mit Ball und gegen den Ball), letzten Ergebnissen, Taktik-Bilanz und nächstem Gegner zusammen – Vorschau, ein Klick auf „Prompt kopieren“, bei Claude oder einer anderen KI einfügen. Nichts wird automatisch gesendet."],
    ["besser","Beim Wechsel „Mit Ball / Gegen den Ball“ laufen die Spieler sichtbar auf ihre neuen Positionen."],
    ["besser","Die Spielebibliothek ist wieder entfernt (dafür gibt es Steam). Selbst eingetragene Spiele bleiben gespeichert, bis du sie im Hub als Datei sicherst oder löschst."]]},
  {v:"11.4.1", title:"Lädt immer die passende Version", items:[
    ["fix","Lagen nach mehreren Uploads alte Programmdateien im Ordner „js“ und neue im Hauptverzeichnis, lud das Dashboard die alten – der Hub fehlte. Jetzt trägt jede Version einen Stempel, und das Dashboard nimmt genau die Dateien, die zur aktuellen Version passen."]]},
  {v:"11.4", beta:true, title:"Gaming-Hub & Spielebibliothek (Beta)", items:[
    ["neu","Gaming-Hub als Startseite: Kacheln für FM27 Dashboard, Spielebibliothek, Karriere-Begleiter (bald) und Spiel-Tagebuch (geplant). Erreichbar über ◆ Hub in der Seitenleiste oder Taste H; „Beim Start öffnen“ einstellbar."],
    ["neu","Spielebibliothek (Beta): alle Spiele als Regal, Liste oder Board (Karten ziehen), mit Cover, Status, Bewertung, Spielzeit, Tags, Notizen und ▶-Start über Steam."],
    ["neu","„Was spiele ich als Nächstes?“ schlägt aus dem Backlog vor – nach Zeit, Plattform und Stimmung; dazu Statistik (Backlog-Stunden, durchgespielt im Jahr) und Text-Import."],
    ["besser","Das FM27 Dashboard bleibt unverändert – es ist jetzt ein Panel des Hubs."]]},
  {v:"11.3.2", title:"Fokus Web-App", items:[
    ["besser","Die Desktop-Vorbereitung (Windows/Linux) ist wieder entfernt – das Dashboard bleibt eine Web-App, die sich im Browser als App installieren lässt."],
    ["besser","Egal wie GitHub die Dateien beim Hochladen ablegt (mit oder ohne Ordner „js“): Das Dashboard funktioniert – der Hinweis in der Datenprüfung entfällt."],
    ["besser","Das Offline-Modul hält die Programmdateien für beide Ablagen vor – offline klappt damit ab dem ersten Start."]]},
  {v:"11.3.1", title:"Startet auch bei falsch hochgeladenen Ordnern", items:[
    ["fix","Lagen die Programmdateien nach dem Hochladen nicht im Ordner „js“ (GitHub hat beim Upload die Ordner verworfen), blieb das Dashboard leer. Jetzt findet es die Dateien auch im Hauptverzeichnis und startet normal."],
    ["neu","Fehlen Programmdateien ganz, erscheint eine klare Meldung mit Lösung („Deine Daten sind sicher …“) statt einer leeren Seite."],
    ["fix","Das Offline-Modul installiert sich auch dann, wenn einzelne Dateien fehlen – vorher brach es komplett ab."],
    ["neu","Admin → Datenprüfung weist darauf hin, wenn die Ordnerstruktur repariert werden sollte (für Tests und Desktop-App)."]]},
  {v:"11.3", title:"Aufgeräumter Code & Desktop-App in Vorbereitung", items:[
    ["besser","Der Programmcode ist in 23 übersichtliche Teile aufgeteilt (Kern, Speicher, Kader, Taktik, Transfers, Journey, Nationalteam, Admin …) – ohne sichtbare Änderung, aber künftige Erweiterungen werden schneller und sicherer."],
    ["neu","Vorbereitung der Desktop-App für Windows und Linux (Tauri): GitHub baut auf Knopfdruck Installer (.exe/.msi bzw. .deb/.AppImage) – siehe Anleitung."],
    ["fix","Seit 11.2 blitzte das helle Design beim Start kurz dunkel auf (die Einstellung lag schon in der Datenbank) – jetzt startet es sofort hell."]]},
  {v:"11.2", title:"Mehr Platz: Speicher in der Browser-Datenbank", items:[
    ["neu","Deine Daten liegen jetzt in der Browser-Datenbank (IndexedDB) statt im kleinen localStorage (~5 MB) – der Browser gewährt dort meist Hunderte MB und mehr. Viele Karrieren, Saisons und Wiederherstellungspunkte sind kein Problem mehr."],
    ["neu","Automatischer Umzug beim ersten Start: Alles wird kopiert und Wert für Wert geprüft; die alte Kopie wird erst beim nächsten Start entfernt, wenn die Datenbank nachweislich vollständig ist."],
    ["besser","Das Dashboard bittet den Browser, die Daten dauerhaft aufzubewahren (nicht bei Speicherknappheit zu löschen)."],
    ["besser","Neuladen (z. B. nach „Alles importieren“) wartet, bis alle Änderungen geschrieben sind. Ohne Browser-Datenbank (manche private Fenster) läuft alles wie bisher weiter."],
    ["besser","Admin-Übersicht zeigt, wo die Daten liegen und wie viel Platz der Browser gewährt."]]},
  {v:"11.1", title:"Übersichtliche Sicherungen & automatische Tests", items:[
    ["besser","Admin → Wiederherstellung: Die Sicherungsdateien stehen jetzt pro Spielstand als Karte – mit Wappen, aktuellem Stand („heute, 20:51“) und eingeklappten Tageskopien; oben eine Zusammenfassung („3 von 4 Spielständen gesichert“)."],
    ["neu","Dateien gelöschter oder umbenannter Spielstände, alte Journey-Dateien (vor 9.9.1) und manuelle Exporte stehen getrennt und eingeklappt darunter – die Altlasten lassen sich mit Rückfrage löschen."],
    ["neu","Spielstände ohne Sicherung fallen sofort auf (gestrichelt, „Jetzt alle sichern“)."],
    ["neu","Automatische Tests auf GitHub: Bei jedem Hochladen läuft die komplette Testreihe (über 1.000 Prüfungen) – grüner Haken oder rotes Kreuz neben dem Commit. Einrichtung: siehe Anleitung."]]},
  {v:"11.0", title:"Full Release 🎉", items:[
    ["neu","Stabiler Release-Build für Browser und installierte App (Vivaldi, Chrome, Edge) – offline lauffähig, alle Daten bleiben lokal."],
    ["besser","Release-Prüfung aller Datenwege: Spielstand-Export/-Import (Verein und Nationalteam), „Alles exportieren (Umzug)“, Journey-Export, CSV → FM-Import, Wiederherstellungspunkte und alte Formate ab Version 1 – jeweils Zeichen für Zeichen identisch; kaputte oder fremde Dateien lassen die Daten unberührt."],
    ["fix","Taktik stürzte ab, wenn eine Standard-Zone auf einen Spieler zeigte, der in derselben Sitzung verkauft, verliehen oder gelöscht wurde."],
    ["fix","Transfers → Verkäufe stürzte bei einem Verkaufseintrag ohne Spieler ab; „Verkauf abschließen“ entfernt einen solchen Eintrag jetzt mit Hinweis."],
    ["besser","Aufgeräumt: 62 ungenutzte Stilregeln aus früheren Versionen entfernt (alter Deadline-Reiter, Labor, altes Admin-Design) – ohne sichtbare Änderung."],
    ["neu","Anleitung um „Was drin ist“ und „Deine Daten – so bleiben sie sicher“ ergänzt."]]},
  {v:"10.3", title:"Nationalteam: Lehrgänge & Feinschliff", items:[
    ["neu","Nominierung als Lehrgang speichern (z. B. „März 2027 – Lehrgang“), später wieder laden oder löschen; im Pool zeigt „3×“, wie oft ein Spieler dabei war."],
    ["neu","Nominierung zurücksetzen mit einem Klick (für den nächsten Lehrgang) und „Kader kopieren“: die Nominierten als Text nach Tor/Abwehr/Mittelfeld/Angriff mit Stammverein."],
    ["besser","Die Suche im Pool findet auch den Stammverein (z. B. „Leverkusen“)."],
    ["fix","Nach dem Schließen eines Dialogs sprang die Akzentfarbe im Nationalteam auf die Vereinsfarbe zurück."],
    ["fix","Vereinsbegriffe im Nationalteam: kein „Gehälter“ mehr im Kaderplan, „Verbandsziele“ statt „Vorstandsziele“, Budgets und Transferfenster im Einstellungsdialog ausgeblendet (Werte bleiben erhalten)."]]},
  {v:"10.2", title:"Schnellwechsler live & Tastenkürzel-Manager", items:[
    ["neu","Der Schnellwechsler ist der feste Spielstand-Manager (Wappen oben links, Taste S) – Pop-up und Flyout aus der Beta sind entfernt, ebenso das Labor."],
    ["neu","Zahnrad → Tastenkürzel: jede Aktion mit eigenem Kürzel belegen (auch mit Strg/Alt/Shift), Konflikte werden gelöst, einzeln oder alle zurücksetzen. Gilt für alle Spielstände."],
    ["neu","Neue Aktionen zum Belegen: Hell/Dunkel, ⇄ Verein/Nationalteam, Admin-Bereich, Export. Die Übersicht (?) zeigt deine eigenen Kürzel."],
    ["fix","Der Beta-Manager aus 10.1 veränderte die Überschrift im Zahnrad-Menü (gleicher Klassenname) – behoben."]]},
  {v:"10.1", beta:true, title:"Neuer Spielstand-Manager (drei Varianten)", items:[
    ["neu","Das Wappen oben links öffnet jetzt den Spielstand-Manager (Taste S) – zum Portal geht es über den Portal-Knopf darunter."],
    ["neu","Drei Varianten zum Vergleichen: A Pop-up mit Karten, B Flyout neben der Leiste, C Schnellwechsler mit Suche und Tastatur (↑/↓, Enter, 1–9). Wählbar unter Admin → Labor oder unten in jeder Variante."],
    ["neu","Jede Karte/Zeile zeigt Verein, Spieldatum, Kader, Bilanz, Nationalteam-Farben, Verknüpfung und Journey; Öffnen, Umbenennen, Duplizieren, Löschen und neue Spielstände direkt aus dem Manager."],
    ["besser","Löschen fragt im Dashboard-Stil nach; der letzte Spielstand lässt sich nicht löschen. Die klassische Verwaltung bleibt über das Zahnrad erreichbar."]]},
  {v:"10.0", title:"Nationalteam-Modus", items:[
    ["neu","Spielstände → „+ Nationalteam“: ein Spielstand im Nationalteam-Modus mit eigenem Look – Landesfarben-Streifen, Emblem aus deinen Farben (oder eigenes Bild), eigene Kopfleiste mit Länderspiel-Bilanz und Nominierungs-Zähler."],
    ["neu","Nationaler Pool: gleiche Tabelle und gleicher FM-Import wie im Verein, dazu Stammverein, Länderspiele und Länderspieltore (werden beim Import automatisch erkannt)."],
    ["neu","Nominieren per Klick: Spalte „Nominiert“, Zähler „23 / 26“ oben (Obergrenze einstellbar), Filter „Nur Nominierte“; Portal zeigt Nominierung je Mannschaftsteil mit Warnungen (z. B. zu wenige Torhüter), Rekordspieler und Stammvereine."],
    ["neu","Gleichzeitig trainieren: Nationalteam mit einem Vereins-Spielstand verknüpfen – „⇄“ oben wechselt mit einem Klick, das Spieldatum wird mitgenommen."],
    ["besser","Im Nationalteam ausgeblendet: Transfers, Finanzen, Entwicklung, Gehälter, Verträge und Bosman-Hinweise (die gehören zum Verein der Spieler). Taktik bietet nur Nominierte an."],
    ["fix","Release-Vorbereitung: Ein beschädigter Spielstand wird nicht mehr überschrieben – das Original wird gesichert und steht unter Wartung bereit."],
    ["neu","Release-Vorbereitung: Unerwartete Fehler werden abgefangen und protokolliert (Admin → Datenprüfung) – mit Hinweis, dass die Daten gespeichert sind."]]},
  {v:"9.9.1", title:"Journey pro Spielstand", items:[
    ["fix","Die Journey war für alle Spielstände gemeinsam – jetzt hat jeder Spielstand seine eigene: Profil, Stationen, Lizenzen, Bankkonto, Sparziele, Tagebuch, Regeln."],
    ["besser","Beim Wechsel des Spielstands zeigt die Journey sofort dessen Daten; ein Spielstand ohne Journey startet mit „Journey starten“."],
    ["besser","Die Journey steckt im Spielstand selbst und wandert automatisch mit: Duplizieren, JSON-Export, Umzug, Ordner-Sicherung, Wiederherstellungspunkte, Rückgängig."],
    ["neu","Die bisherige gemeinsame Journey wird beim ersten Start einmalig dem aktiven Spielstand zugeordnet – nichts geht verloren."],
    ["neu","Profil bearbeiten → „Journey exportieren“ und „Journey zurücksetzen“; eine exportierte Journey liest „Import“ in den aktuellen Spielstand ein (zum Umziehen zwischen Spielständen)."],
    ["besser","Neuer Verein: Ein neuer Spielstand ist jetzt optional und nimmt die Journey mit."]]},
  {v:"9.1", title:"Komfort-Update", items:[
    ["neu","Kader: Spalten frei verschieben wie in Excel – Spaltenkopf ziehen und fallen lassen; alternativ mit ↑/↓ im Dialog „Spalten“ (auch am Tablet). Reihenfolge gilt für alle Spielstände, zurücksetzbar."],
    ["neu","Spielernamen sind anklickbar (Portal, Verträge, Verkäufe, Transfer-Center, Fenster-Plan, Befehlspalette): springt in den Kader und markiert den Spieler – Filter, die ihn verdecken würden, werden dabei geleert."],
    ["neu","Verleihen und neue Leihen (auch Ausleihen): Feld „Notiz zur Leihe“, z. B. für versprochene Einsatzzeiten; erscheint in der Leihen-Übersicht und in der Kadertabelle."],
    ["besser","Verliehene Spieler bleiben wirklich im Kader: ausgegraut, aber an ihrem Platz einsortiert (z. B. nach Position) statt als Block am Ende."],
    ["neu","Admin → Wiederherstellung: „📂 Ordner anzeigen“ öffnet das Datei-Fenster direkt im Sicherungsordner – eine Datei auswählen stellt sie wieder her."]]},
  {v:"9.0", title:"Journey – Rollenspiel für deinen Journey-Save", items:[
    ["neu","Neuer Bereich „Journey“ (Taste 9) für Journey-Saves: Start arbeitslos ohne Lizenz oder mit Amateur-Lizenz – die Reise gilt für alle Spielstände."],
    ["neu","Manager-Profil, Jobsuche als Board (Interesse → Beworben → Gespräch → Angebot, Absagen), „Arbeitslos seit X Tagen“ zählt automatisch mit."],
    ["neu","Karriere-Stationen: Angebot annehmen legt die Station an, auf Wunsch mit eigenem Spielstand für den neuen Verein und Gehalt als Dauerauftrag; Bilanz kommt live aus dem verknüpften Spielstand."],
    ["neu","Trainerlizenz als Stufenleiter (Stufen änderbar) mit Kursen: Beginn, Dauer, Kosten – beim Datumssprung automatisch abgeschlossen."],
    ["neu","Bankkonto: Girokonto und Sparkonto, Buchungen und Daueraufträge (Einnahme, Ausgabe „ins Nix“, Sparen aufs Sparkonto oder ein Sparziel) – laufen automatisch mit dem Spieldatum, nie doppelt."],
    ["neu","Sparziele (Haus, Auto, Boot, Luxus …) mit Fortschritt und Prognose, wann du es dir leisten kannst; „Kaufen“ bucht ab und legt es in deinen Besitz."],
    ["neu","Reiseziele & Meilensteine, Trophäenschrank, Tagebuch mit Stimmung und eigene Regeln (Challenges)."],
    ["neu","Portal: Journey-Karte, solange du arbeitslos bist. Die Journey steckt in Umzug und Ordner-Sicherung."]]},
  {v:"8.9", title:"Transfer-Center & neues Admin-Design sind live", items:[
    ["neu","Transfer-Center und Admin-Design sind jetzt die Standard-Oberflächen – der Labor-Schalter entfällt."],
    ["neu","Deadline Day ist komplett ins Transfer-Center gewandert (eigener Reiter entfällt): Panic-Buy-Board und Last-Minute-Leihen erscheinen dort in der Deadline-Phase."],
    ["neu","Panic-Buy-Board, Last-Minute-Leihen und Deal-Pipeline: Transferziele direkt bearbeiten (✎) und löschen (✕), mit Rückgängig."],
    ["neu","Verliehene Spieler bleiben in der Kadertabelle sichtbar – ausgegraut, am Ende, mit Leihclub und „Zurückholen“; abschaltbar über „Verliehene zeigen“."],
    ["besser","Portal-Karte „Transferfenster“ erscheint nur, solange ein Fenster offen ist; Deadline-Look erst 1–2 Tage vor Schluss (gilt jetzt überall für den Deadline Day)."]]},
  {v:"8.8", title:"Speicher-Altlasten", items:[
    ["neu","Speicher-Hausmeister: Beim Start werden Protokolle gelöschter Spielstände automatisch entfernt (reine Verlaufsdaten)."],
    ["neu","Wartung: „Speicher: bitte prüfen“ listet alles, was noch Daten enthalten könnte – Wiederherstellungspunkte gelöschter Spielstände, der alte Spielstand aus Version 1/2, Spielstände ohne Listeneintrag, unbekannte Einträge."],
    ["neu","Wartung: Speicherbelegung mit den größten Einträgen und der letzten automatischen Bereinigung."]]},
  {v:"8.7", title:"Performance", items:[
    ["besser","Nach Änderungen wird nur noch die sichtbare Ansicht neu gezeichnet (vorher alle acht): bei einem großen Spielstand z. B. auf dem Portal 65 ms → 3 ms pro Änderung. Jede Ansicht wird beim Öffnen frisch gezeichnet."],
    ["besser","Transfer-Center, Fenster-Plan und Portal-Karte berechnen den Zukunfts-Kader nur noch einmal pro Zeichnen statt für jede Position und Karte neu."]]},
  {v:"8.6", title:"Bugfixes", items:[
    ["fix","FM-Import: Eine leere, „-“- oder „Unverkäuflich“-Zelle beim Transferwert hat vorhandene Werte auf 0 gesetzt – z. B. bei Spielern nach der Leihrückkehr. Solche Zellen gelten jetzt als „keine Angabe“."],
    ["besser","Changelog: nur die neueste Version ist aufgeklappt; 8.5 und 8.5.1 sind als Beta markiert."]]},
  {v:"8.5.1", beta:true, title:"Rohdaten neu, Deadline-Kopf neu, Transferfenster im Portal", items:[
    ["besser","Rohdaten: deutsche Spaltennamen, passende Eingaben je Feld (Auswahl mit deinen Bezeichnungen statt interner Schlüssel, Beträge mit Tausenderpunkt, Datum, Ja/Nein als Häkchen, Sterne), feste Namensspalte beim Scrollen, Suche und eigene Felder als Spalten."],
    ["neu","Rohdaten: „Technische Ansicht“ als Schalter – zeigt wie bisher die internen Schlüssel und Rohwerte."],
    ["besser","Transfer-Center (Beta): Deadline-Kopf neu aufgebaut – großer Countdown in der Mitte, Budget-Kacheln rechts (bei Minus deutlich markiert), schmale Phasenleiste, Einstellungen im „⋯“-Menü."],
    ["besser","Der Deadline-Day-Reiter hüpft nicht mehr aus der Leiste, stattdessen pulsiert ein kleiner Punkt."],
    ["neu","Portal (Beta): Karte „Transferfenster“ mit Phase, Countdown, Deals, Budget und den wichtigsten Aufgaben – erscheint, wenn das Transfer-Center eingeschaltet ist."]]},
  {v:"8.5", beta:true, title:"Neue Oberflächen zum Ausprobieren (Labor)", items:[
    ["neu","Admin-Bereich → Labor (Beta): neue Oberflächen per Schalter ausprobieren – die bisherigen bleiben parallel erreichbar."],
    ["neu","Transfer-Center (Beta): Sommer- und Winterfenster in einer Ansicht mit Phasen-Zeitstrahl (Vorbereitung → Fenster offen → Deadline Day); Deadline Day ist die letzte Phase statt einer eigenen Seite."],
    ["neu","Transfer-Center: Deal-Pipeline für Zugänge und Abgänge (per Klick durch die Stufen, Budget-Ampel), Budget-Cockpit mit Balken und Rechner, Seitenpanel je Saison (Kaderplanung mit Positions-Filter bzw. Bosman-Radar und Lücken)."],
    ["neu","Admin-Design (Beta): gruppierte Seitennavigation und eine neue Übersicht mit Gesundheitswert (0–100), Aktivität der letzten 14 Tage und Schnellaktionen."]]},
  {v:"8.4", title:"Deadline Day", items:[
    ["neu","Transfers → ⚡ Deadline Day: gelb-schwarzes Breaking-News-Layout, automatisch aktiv in den letzten 3 Tagen eines offenen Fensters (oder per Auto/An/Aus); dazu eine Leiste oben im ganzen Dashboard."],
    ["neu","Countdown bis zur Deadline; am letzten Tag stellst du die FM-Uhrzeit ein, die Uhr läuft dann in Echtzeit bis zur Deadline (Standard 23:00)."],
    ["neu","Ticker mit deinen eigenen Ereignissen: offizielle Transfers, Angebote, Einigungen, fixierte Deals, Bedarf je Position, Leih-Probleme, Bosman."],
    ["neu","Schnell-Rechner: Ablöse/Leihgebühr und Gehalt eintippen → Transferbudget und Gehaltsreserve danach, „Deal machbar?“, als Ziel anlegen."],
    ["neu","Panic-Buy-Board und Last-Minute-Leihen: Ziele nach Positionsbedarf sortiert, mit Budget-Prüfung und Ein-Klick-Verhandeln/Fixieren/Verpflichten."],
    ["neu","Transferziele können jetzt Leihen sein (Spieler ausleihen): Leihgebühr + Gehaltsanteil fürs Budget; im Kader als „Leihe“ markiert, geht zum Leihende zurück, kein Bosman."],
    ["neu","Notverkäufe & Leih-Abbrüche: Einigung, Verkauf abschließen, Abgabe-Spieler anbieten, Leihe abbrechen."],
    ["fix","Zurückgeholte Leihspieler verloren Land, Transferwert, Geburtsdatum, Gehalt, Vertrag, eigene Felder und Verlauf. Jetzt wird beim Verleihen der komplette Spieler aufbewahrt und beim Zurückholen 1:1 wiederhergestellt."]]},
  {v:"8.3", title:"Transfer-Hub", items:[
    ["neu","Transfers → Fenster-Plan: stellt sich automatisch auf das offene bzw. nächste Transferfenster (aus den Einstellungen) – mit Countdown, Budget-Überblick und manuellem Sommer/Winter-Umschalter."],
    ["neu","Aufgaben fürs Fenster, automatisch gesammelt: Bosman-Fälle, Leihen mit schlechter Spielzeit (aus 8.1), Abgabe-Spieler ohne Verkaufsplan, offene Verkäufe, fixierte Neuzugänge – jeweils mit direkter Aktion."],
    ["neu","Sommer: Soll/Ist je Position für die neue Saison, Shortlist nach Position (1./2./3. Wahl) und Entscheidung für jeden Leih-Rückkehrer (einplanen, erneut verleihen, verkaufen) – fließt in den Zukunfts-Kader."],
    ["neu","Winter: Bosman-Liste, Leihen zurückholen und kurzfristige Lücken durch Verletzungen/Sperren."],
    ["neu","Bosman: In den letzten 6 Vertragsmonaten (ab 01.01.) wird der Spieler im Kader und Portal markiert und du bekommst eine Aufgabe; bei „Abgabe“ oder „Unzufrieden“ nur die Aufgabe."],
    ["besser","Die Ziel-Kadertiefe je Position ist jetzt einstellbar (Soll im Fenster-Plan) und gilt auch für die Warnungen unter Kader → Nächste Saison."]]},
  {v:"8.2", title:"Wartung & Batch-Tools", items:[
    ["neu","Admin-Bereich → Wartung & Batch: findet verwaiste Einträge – doppelte Spieler nach Re-Importen, erledigte Transferziele, Talente/Leihen, die schon im Kader sind, leere Platzhalter, doppelte Ergebnisse und Transfers, Beispieldaten sowie Speicher-Altlasten gelöschter Spielstände."],
    ["neu","„Verwaiste Einträge sicher bereinigen“: eindeutige Fälle sind vorausgewählt, abgelaufene Verträge und beendete Leihen stehen „zur Prüfung“ bereit; alles mit Wiederherstellungspunkt und Rückgängig."],
    ["neu","Beträge umrechnen: Gehälter, Transferwerte, Ablösen, Erlöse, Budgets oder Kontostände mal Faktor (z. B. Währung) oder um Prozent ändern, optional runden – mit Vorschau der Summen."],
    ["neu","Werte zurücksetzen oder für alle setzen – z. B. alle Scouting-Status auf „Beobachtet“, alle Spieler „Verfügbar“, Leih-Spielzeiten zurücksetzen; auch für eigene Felder und nur für eine Position."]]},
  {v:"8.1.5", title:"Eigene Datenfelder", items:[
    ["neu","Admin-Bereich → Eigene Felder: eigene Spalten anlegen, z. B. „Homegrown“, „Strafen“ oder „Scouting-Priorität“ – als Text, Zahl, Ja/Nein oder Auswahl."],
    ["neu","Bereich pro Feld: Kadertabelle, Scouting-Liste oder beides. Die Spalten erscheinen sofort, lassen sich direkt im Tabellengitter bearbeiten und per Klick sortieren."],
    ["neu","Die Scouting-Liste ist jetzt über alle Spaltenköpfe sortierbar (dritter Klick = Standard-Reihenfolge)."],
    ["neu","Eigene Felder im Bearbeiten-Dialog (✎), im CSV-Export und im FM-Import: Eine Datei-Spalte mit gleichem Namen landet automatisch im Feld."],
    ["besser","Saubere Speicherung: Werte werden pro Feld und Typ geprüft; ein Typ- oder Auswahl-Wechsel konvertiert, was passt, und bietet Rückgängig an. Abgewählte Bereiche behalten ihre Werte."],
    ["besser","Änderungen an eigenen Feldern stehen einzeln im Protokoll und sind rücknehmbar; beim Verpflichten nimmt ein Transferziel seine Werte mit."]]},
  {v:"8.1", title:"Leih-Spielzeit, Admin-Notizen, alle Auswahllisten", items:[
    ["neu","Entwicklung → Leihen: Die Spalte „Minuten“ ist jetzt eine Auswahl „Spielzeit“ (Gut / Geht so / Schlecht)."],
    ["neu","Spielzeit „Schlecht“: Der Spieler wird rot markiert (Leihen, Portal „Leihen im Blick“, Kader → Nächste Saison), bekommt automatisch die Notiz „Zurückholen oder Leihe abbrechen im nächsten Transferfenster“ und „Rückruf prüfen“ wird gesetzt. Wird die Spielzeit wieder besser, verschwindet die Auto-Notiz."],
    ["neu","Admin-Bereich → Notizen: freie Notizen mit Titel, automatisch gespeichert, für alle Spielstände; ziehen beim Umzug mit."],
    ["neu","Auswahllisten: zusätzlich bearbeitbar sind Spielzeit, Spielort, Prioritäten, Positionsnamen, Standard-Situationen und Standard-Zonen (feste Listen: nur umbenennen)."],
    ["besser","Nicht als Liste bearbeitbar bleiben bewusst die Positionskürzel (TW, IV …), Formationen und technische Einstellungen – daran hängen Aufstellungen, Beste Elf und der FM-Import."]]},
  {v:"8.0", title:"Als App installierbar", items:[
    ["neu","Das Dashboard lässt sich als App installieren: eigenes Fenster, Symbol in Startmenü und Taskleiste, startet ohne Ordner und Browser-Tab und funktioniert auch offline."],
    ["neu","Umzug mit einem Klick: „Alles exportieren (Umzug)“ nimmt alle Spielstände, Einstellungen, Layout, Listen, PIN, Protokoll und Wiederherstellungspunkte mit; in der App „Umzugsdatei laden“."],
    ["neu","Willkommens-Dialog beim ersten Start der App und Hinweis „Neue Version verfügbar“, sobald du eine neue Version hochgeladen hast."],
    ["neu","Eigenes App-Symbol."]]},
  {v:"7.4", title:"Lesbarkeit & Changelog", items:[
    ["neu","Changelog im Admin-Bereich – alle bisherigen Versionen zum Nachlesen, dazu die Versionsnummer in der Übersicht."],
    ["besser","Kontrast beider Designs nach der WCAG-Norm (mind. 4,5 : 1) überarbeitet und für jeden sichtbaren Text gemessen: im hellen Design lagen vorher 54 % der Texte darunter, jetzt 0 %; im dunklen vorher 41 %, jetzt ebenfalls 0 %."],
    ["besser","Akzentfarbe: lesbare Schrift- und Knopfvarianten werden automatisch berechnet – jede frei gewählte Farbe funktioniert (z. B. dunkle Schrift auf gelben Knöpfen)."],
    ["besser","Leere Sterne (Einschätzung, Priorität) etwas kräftiger, damit die Bewertung schneller erfassbar ist."]]},
  {v:"7.3", title:"Neue Seitenleiste & helles Design", items:[
    ["neu","Ein Zahnrad statt fünf Knöpfen: Flyout-Menü mit Verein & Spielstand, Spielständen, Layout, Design, Admin-Bereich, Befehlspalette und Tastenkürzeln (Maus, Klick und Tastatur)."],
    ["neu","Helles Design, umschaltbar im Menü; gilt für alle Spielstände und startet ohne dunkles Aufblitzen."],
    ["besser","Verein & Spielstand hat ein eigenes Symbol (Trikot), die Sonne steht jetzt für das helle Design."],
    ["fix","„Layout zurücksetzen“ hätte auch das Design zurückgesetzt."]]},
  {v:"7.2", title:"Wappen = Portal", items:[
    ["besser","Das Wappen oben links führt zum Portal; Einstellungen gibt es nur noch unten links."]]},
  {v:"7.1", title:"Automatische Sicherung in einen Ordner", items:[
    ["neu","Sicherung in einen Ordner deiner Wahl (z. B. OneDrive): aktuelle Datei plus Tageskopien, ältere werden aufgeräumt."],
    ["neu","Sicherungen direkt aus dem Ordner laden – auch auf einem zweiten Gerät."],
    ["neu","Oben im Kopf: „☁ gesichert hh:mm“ bzw. gelber Knopf „Sicherung fortsetzen“, wenn der Browser nach einem Neustart die Erlaubnis bestätigt haben will."],
    ["fix","Eine vor dem Berechtigungsverlust geplante Sicherung blieb hängen („sichert gleich…“ für immer)."]]},
  {v:"7.0", title:"Analyse über Saisons (Phase 10)", items:[
    ["neu","Gegner-Datenbank: Bilanz je Gegner automatisch aus den Ergebnissen; deine Analyse wird beim Ergebnis gemerkt und beim nächsten Duell angeboten."],
    ["neu","Saisonvergleich: Platzierung, Bilanz, Tore, Transfersaldo, Kontostand, Kader und Gehälter über die Jahre."],
    ["neu","Spielerentwicklung: Verlauf von Einschätzung, Gehalt und Transferwert im Bearbeiten-Dialog – jeder FM-Import erzeugt einen Datenpunkt."],
    ["fix","Der Browser stellte nach dem Neuladen alte Filter wieder her – die Kadertabelle wirkte leer."],
    ["fix","Beim Tabwechsel wurden manche Ansichten nicht neu gezeichnet und zeigten veraltete Zahlen."]]},
  {v:"6.1", title:"Aufräumen nach dem FM-Import", items:[
    ["neu","Übrig gebliebene Beispieldaten (Leihen, Transferziele, Talente, Historie …) werden erkannt und lassen sich mit einem Klick entfernen – auch direkt im Import."],
    ["besser","Aktive Filter sind markiert, „Filter zurücksetzen“, und eine leere Tabelle nennt den Filter, der die Spieler ausblendet."]]},
  {v:"6.0", title:"Anpassbarkeit (Phase 9)", items:[
    ["neu","Auswahllisten im Admin-Bereich bearbeiten: Kaderrollen, Status, Grades, Talentwege, Klauseln … eigene Einträge mit „verhält sich wie“."],
    ["neu","Taktik-Rollen mit und gegen den Ball selbst benennen – Umbenennen aktualisiert alle Aufstellungen."],
    ["neu","Spaltenbreiten ziehen wie in Excel, Doppelklick passt an, Spalten ein- und ausblenden."],
    ["fix","Ziehgriffe der Spalten waren im Browser verdeckt und nicht klickbar."]]},
  {v:"5.2", title:"FM26-Import", items:[
    ["fix","Gehälter im FM26-Format („3Mio. €/J.“, „45.000 €/W.“) wurden als 0 gelesen."],
    ["neu","Spalte „Land“ statt Nebenpositionen (die stecken jetzt im Bearbeiten-Dialog)."],
    ["neu","Transferwert (auch als Spanne) – die Spalte erscheint nur, wenn Werte vorhanden sind; dazu Kaderwert im Portal und Erlös-Vorschlag beim Verkauf."]]},
  {v:"5.1", title:"Import aus FM (Phase 8)", items:[
    ["neu","Kader aus FM-Exporten (Text, Webseite) oder CSV übernehmen – mit Spaltenerkennung und Abgleich-Assistent (neu / geändert / fehlt)."],
    ["neu","CSV-Export für Excel und Massenbearbeitung im Kader."],
    ["fix","Beim CSV-Rundlauf wären die Nebenpositionen verloren gegangen."]]},
  {v:"5.0", title:"Admin-Bereich (Phase 7)", items:[
    ["neu","PIN-geschützter Admin-Bereich mit Änderungsprotokoll, einzelner Rücknahme und Strg+Z."],
    ["neu","Wiederherstellungspunkte, Datenprüfung mit Reparatur, Rohdaten-Editor, Backup-Erinnerung."],
    ["fix","Der Status „Verfügbar“ erschien im Protokoll als „—“."]]},
  {v:"4.1", title:"Finanzen & Beträge", items:[
    ["neu","Finanz-Tab: Kontostand-Verlauf, Gehaltsbudget-Auslastung, Transfers je Saison."],
    ["besser","Gehälter pro Jahr (umschaltbar auf Monat/Woche), Beträge mit Tausenderpunkt, Eingaben wie „2,5 Mio“ oder „850k“."],
    ["besser","Gesamtes Gehaltsbudget statt manuellem Spielraum – der Spielraum wird aus den echten Gehältern berechnet."]]},
  {v:"4.0", title:"Langzeitplanung (Phase 6)", items:[
    ["neu","Taktik-Bilanz: Ergebnisprotokoll mit Plan und Gegnerformation, Punkte pro Spiel je Plan, Nachfrage nach dem Spieltag."],
    ["neu","Zukunfts-Kader für die nächste Saison, Verkaufsliste mit Vorstandsanteil, Transferfenster-Countdown, Transfer-Historie."],
    ["neu","Verträge & Gehälter: Vertragskalender und Gehaltsstruktur."],
    ["fix","Leere Formplätze zählten als 0:0-Unentschieden."]]},
  {v:"3.1", title:"Layout (Phase 5)", items:[
    ["neu","Panels verschieben, einklappen und ausblenden, kompakte Ansicht."]]},
  {v:"3.0", title:"Taktik-Werkstatt (Phase 4)", items:[
    ["neu","Freie Formation wie im FotMob-Builder, Taktik-Pläne A/B/C, Form gegen den Ball frei verschiebbar, Wechselplan."],
    ["neu","Datums-Button (+1 Tag) mit Geburtstagen und automatischem Altern."]]},
  {v:"2.1", title:"Bearbeiten leichter gemacht", items:[
    ["neu","Bearbeiten-Dialog (✎) für alle Spielerdaten, sichtbare Eingabefelder, schneller Weg zu den Leihen."]]},
  {v:"2.0", title:"Begleit-Tool (Phase 2 + 3)", items:[
    ["besser","Konsequent als Ergänzung zu FM: Fitness und Zufriedenheit entfernt, dafür eigene Einschätzung und Kaderrolle."],
    ["neu","Taktikboard mit Drag & Drop, Rollen mit/gegen den Ball, Beste Elf, Standards-Planer."],
    ["neu","Vertragsampel, Talente & Leihen, Vorstandsziele, Transferbudget-Rechnung, Druck-Briefing, Saison-Archiv."],
    ["neu","Befehlspalette (Strg+K), Tastenkürzel, mehrere Spielstände, Akzentfarben."]]},
  {v:"1.1", title:"Stabilität (Phase 1)", items:[
    ["neu","Datenschema mit automatischer Migration, Import-Prüfung mit konkreten Fehlern, Speicherstatus, Rückgängig beim Löschen."],
    ["besser","Tastaturbedienung, Barrierefreiheit und Kartenansicht auf dem Handy."]]},
  {v:"1.0", title:"Erste Version", items:[
    ["neu","Portal, Kader, Taktik, Rekrutierung, Termine und Notizen – alles lokal im Browser, mit Export und Import."]]}
];
const CL_TAG = {neu:"Neu", besser:"Verbessert", fix:"Behoben"};
function adminChangelog(){
  const counts = {neu:0, besser:0, fix:0};
  CHANGELOG.forEach(r=>r.items.forEach(([t])=>counts[t]++));
  qs("#adminBody").innerHTML = `
    <div class="cl-head"><div><strong>Version ${APP_VERSION}</strong> <span class="muted">· ${CHANGELOG.length} Versionen · ${counts.neu} neue Funktionen · ${counts.besser} Verbesserungen · ${counts.fix} behobene Fehler</span></div></div>
    <div class="cl-list">${CHANGELOG.map((r,i)=>`
      <details class="cl-entry" ${i === 0 ? "open" : ""}>
        <summary><span class="cl-ver">v${esc(r.v)}</span><span class="cl-title">${esc(r.title)}</span>${r.beta ? '<span class="beta-pill">Beta</span>' : ""}${r.v === APP_VERSION ? '<span class="badge ok">aktuell</span>' : ""}
          <span class="cl-tags">${Object.keys(CL_TAG).map(t=>{ const n = r.items.filter(x=>x[0]===t).length; return n ? `<span class="cl-tag t-${t}">${n} ${CL_TAG[t]}</span>` : ""; }).join("")}</span></summary>
        <ul>${r.items.map(([t, text])=>`<li><span class="cl-tag t-${t}">${CL_TAG[t]}</span><span>${esc(text)}</span></li>`).join("")}</ul>
      </details>`).join("")}</div>`;
}
/** once per new version: a short hint where to read what changed */
function announceUpdate(firstStart){
  let seen = null; try{ seen = store.getItem(SEEN_VERSION_KEY); }catch(e){}
  try{ store.setItem(SEEN_VERSION_KEY, APP_VERSION); }catch(e){}
  if(seen === APP_VERSION || firstStart) return false;              // brand-new users don't need an update note
  const entry = CHANGELOG.find(r=>r.v === APP_VERSION);
  setTimeout(()=>toast(`Update auf v${APP_VERSION}${entry ? " – " + entry.title : ""}`, {actionLabel:"Was ist neu?", duration:9000,
    onUndo:()=>openHubChangelog(APP_VERSION)}), 2200);
  return true;
}


/* ==========================================================================
   APP (PWA): install, offline cache, updates, moving all data
   ========================================================================== */
let deferredInstall = null, swUpdateRequested = false;
const isHttp = () => /^https?:$/.test(location.protocol);
const isStandalone = () => !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone);
function reloadApp(){ store.flush().then(()=>location.reload()); }   // 11.2: never reload with writes still on their way                         // own function → replaceable in tests

function renderInstallItem(){
  const it = qs("#btnInstall"); if(!it) return;
  it.hidden = isStandalone();                                      // already running as the app
  qs("#installLabel").textContent = deferredInstall ? "Als App installieren" : "App installieren …";
}
function installApp(){
  if(deferredInstall){
    deferredInstall.prompt();
    deferredInstall.userChoice.then(c=>{
      if(c && c.outcome === "accepted") toast("App wird installiert – du findest sie im Startmenü.");
      deferredInstall = null; renderInstallItem();
    }).catch(()=>{});
    return;
  }
  openModal({
    title:"Als App installieren",
    body: isHttp()
      ? `<p class="lead">Dein Browser bietet das Installieren gerade nicht direkt an. In Chromium-Browsern geht es über das Browser-Menü („App installieren“ bzw. „Installieren“) oder das Installieren-Symbol in der Adressleiste. In Vivaldi außerdem per Rechtsklick auf den Tab.</p>`
      : `<p class="lead">Browser installieren Apps nur von einer Webadresse (https), nicht von einer lokal geöffneten Datei. Die Anleitung <strong>ANLEITUNG-App.md</strong> im Dashboard-Ordner zeigt, wie du das Dashboard kostenlos über GitHub Pages bereitstellst – deine Daten bleiben dabei lokal auf deinem Gerät.</p>
         <p class="lead">Vor dem Wechsel hier im Menü <strong>„Alles exportieren (Umzug)“</strong> wählen – die Datei lädst du dann in der App.</p>`
  });
}

/* ---------- moving everything (all saves + settings) ---------- */
function collectAllStorage(){
  if(_saveTimer) saveState();
  const storage = {};
  for(let i = 0; i < store.length; i++){
    const k = store.key(i);
    if(k && k.startsWith("fm27")) storage[k] = store.getItem(k);
  }
  return storage;
}
function exportAll(){
  const storage = collectAllStorage();
  const payload = {app:"FM27 Manager Dashboard", kind:"full", version:APP_VERSION, schemaVersion:SCHEMA_VERSION,
    exportedAt:new Date().toISOString(), storage};
  const blob = new Blob([JSON.stringify(payload)], {type:"application/json"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `fm27_umzug_${todayReal()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  slotIndex.slots.forEach(m=>{ m.lastExport = Date.now(); }); writeIndex();
  toast(`Alles exportiert: ${slotIndex.slots.length} Spielstände + Einstellungen – diese Datei in der App laden.`, {duration:6000});
  return payload;
}
function importFullBackup(obj){
  const st = obj && obj.storage;
  if(!st || typeof st !== "object" || !Object.keys(st).some(k=>k.startsWith("fm27_slot"))){
    showImportErrors(["Die Umzugsdatei enthält keine Spielstände."]); return;
  }
  let idx = null; try{ idx = JSON.parse(st[SLOT_INDEX_KEY]); }catch(e){}
  // "Karriere 2 (Feyenoord Rotterdam)" – slot name plus the club inside
  const names = idx && Array.isArray(idx.slots) ? idx.slots.map(x=>{
    let club = ""; try{ const d = JSON.parse(st[SLOT_PREFIX + x.id] || "null"); club = d && d.club ? d.club.name : ""; }catch(e){}
    return club && club !== x.name ? `${x.name} (${club})` : x.name;
  }) : [];
  const hasOwn = slotIndex && slotIndex.slots.some(m=>{ const d = readJSON(SLOT_PREFIX+m.id); return d && sampleLeftovers(d).hasReal; });
  openModal({
    title:"Umzug übernehmen",
    body:`<p class="lead">Die Datei vom ${esc(obj.exportedAt ? new Date(obj.exportedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}) : "?")} enthält
      <strong>${names.length} Spielstände</strong>${names.length ? ` (${esc(names.join(", "))})` : ""} sowie Einstellungen, Layout, Listen, PIN, Protokoll und Wiederherstellungspunkte.</p>
      ${hasOwn ? `<p class="pin-msg">Achtung: Dieses Dashboard enthält bereits eigene Daten – sie werden ersetzt. Bei Bedarf vorher „Alles exportieren (Umzug)“.</p>` : ""}
      <p class="hint">Danach lädt die App neu. Die Ordner-Sicherung musst du in der App einmal neu verbinden (Admin → Wiederherstellung).</p>`,
    saveLabel:"Alles übernehmen",
    onSave: ()=>{
      const own = []; for(let i = 0; i < store.length; i++){ const k = store.key(i); if(k && k.startsWith("fm27")) own.push(k); }
      own.forEach(k=>store.removeItem(k));
      try{
        Object.entries(st).forEach(([k,v])=>{ if(k.startsWith("fm27")) store.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); });
      }catch(e){ toast("Speicher voll – Umzug unvollständig: " + e.message, {duration:8000}); return false; }
      store.setItem(SEEN_VERSION_KEY, APP_VERSION);
      reloadApp();
    }
  });
}

/* ---------- first start of the app ---------- */
function showWelcome(){
  openModal({
    title:"Willkommen in der FM27-App",
    body:`<p class="lead">Die App speichert alles lokal auf diesem Gerät. Kommst du von der bisherigen Datei-Version, nimm deine Daten mit:</p>
      <ol class="welcome-steps">
        <li>In der <strong>bisherigen</strong> Version: Zahnrad unten links → <strong>„Alles exportieren (Umzug)“</strong>.</li>
        <li>Hier: <strong>„Umzugsdatei laden …“</strong> und die Datei wählen – fertig, alle Spielstände und Einstellungen sind da.</li>
      </ol>
      <p class="hint">Einzelne Sicherungen (normaler Export oder Dateien aus deinem Sicherungsordner) kannst du jederzeit über „Import“ laden.</p>`,
    leftButtons:`<button class="btn btn-accent" data-welcome="move">Umzugsdatei laden …</button><button class="btn" data-welcome="empty">Leer starten</button>`,
    onOpen: m=>{
      m.onclick = e=>{
        const b = e.target.closest("[data-welcome]"); if(!b) return;
        closeModal();
        if(b.dataset.welcome === "move") qs("#importFile").click();
        else { state = freshState("empty"); selectedSlot = null; saveState(); renderAll(); setTimeout(openSettingsModal, 50); }
      };
    }
  });
  qs("#modal [data-modal-cancel]").textContent = "Beispieldaten ansehen";
}

/* ---------- service worker: offline + update notice ---------- */
function registerServiceWorker(){
  if(!("serviceWorker" in navigator) || !isHttp()) return;
  navigator.serviceWorker.register("./sw.js").then(reg=>{
    const offer = w => toast("Neue Version verfügbar", {actionLabel:"Jetzt laden", duration:20000,
      onUndo:()=>{ swUpdateRequested = true; if(_saveTimer) saveState(); w.postMessage({type:"SKIP_WAITING"}); }});
    const watch = w => w && w.addEventListener("statechange", ()=>{ if(w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", ()=>watch(reg.installing));
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) reg.update().catch(()=>{}); });
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{ if(swUpdateRequested){ swUpdateRequested = false; reloadApp(); } });
}
function initAppShell(firstStart){
  window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferredInstall = e; renderInstallItem(); });
  window.addEventListener("appinstalled", ()=>{ deferredInstall = null; renderInstallItem(); toast("App installiert – viel Spaß!"); });
  qs("#btnInstall").addEventListener("click", installApp);
  qs("#btnMoveOut").addEventListener("click", exportAll);
  renderInstallItem();
  registerServiceWorker();
  if(isStandalone()) document.documentElement.classList.add("standalone");
  // once: the very first start of the hosted app (not for the local file version)
  let welcomed = false; try{ welcomed = !!store.getItem("fm27_welcome_done"); }catch(e){}
  if(firstStart && isHttp() && !welcomed){ try{ store.setItem("fm27_welcome_done","1"); }catch(e){} setTimeout(showWelcome, 300); }
}



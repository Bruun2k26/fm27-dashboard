/* build stamp – the loader in index.html picks the copy of the program files that matches index.html */
window.FM27_BUILD = "12.7";
/* ==========================================================================
   FM27 MANAGER DASHBOARD — app.js  (Schema v3)
   Externes Begleit-Tool zu Football Manager 27. Reines Vanilla JS,
   alle Daten lokal im Browser (localStorage), mehrere Spielstände.
   ========================================================================== */
"use strict";

/* ---------- Storage keys & schema ---------- */
const SLOT_INDEX_KEY = "fm27_slots_index";
const SLOT_PREFIX    = "fm27_slot_";
const LEGACY_KEY     = "fm27_dashboard_state_v1";   // single-save format from v1/v2
const SCHEMA_VERSION = 6;

/* ---------- Helpers ---------- */
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (v, fallback=0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
/* ---------- Number & money formatting (settings: separator, short/full, wage unit) ---------- */
const WAGE_UNITS = {year:{label:"pro Jahr", short:"/Jahr", f:1}, month:{label:"pro Monat", short:"/Mon.", f:12}, week:{label:"pro Woche", short:"/Wo.", f:52}};
const NUMBER_FORMATS = {dot:"1.000.000 (Punkt)", comma:"1,000,000 (Komma)"};
const MONEY_DISPLAY = {short:"Kurz (9,88 Mio.)", full:"Voll (9.875.000)"};
function prefs(){ return (typeof state !== "undefined" && state && state.club) ? state.club : {}; }
function fmtNum(n, maxFrac=0){
  return Number(n).toLocaleString(prefs().numberFormat === "comma" ? "en-US" : "de-DE", {maximumFractionDigits:maxFrac, minimumFractionDigits:0});
}
function fmtEUR(n){
  n = num(n);
  const abs = Math.abs(n), sign = n < 0 ? "−" : "";
  if(prefs().moneyDisplay === "full") return sign + "€" + fmtNum(Math.round(abs));
  if(abs >= 1e6) return sign + "€" + fmtNum(abs/1e6, 2) + " Mio.";
  if(abs >= 1e4) return sign + "€" + fmtNum(Math.round(abs/1e3)) + " Tsd.";
  return sign + "€" + fmtNum(Math.round(abs));
}
/** Wages are stored per YEAR; the chosen unit only affects display and input. */
function wageUnit(){ return WAGE_UNITS[prefs().wageUnit] ? prefs().wageUnit : "year"; }
const wageSuffix = () => WAGE_UNITS[wageUnit()].short;
const wageToUnit = yearly => yearly / WAGE_UNITS[wageUnit()].f;
const wageFromUnit = v => Math.round(v * WAGE_UNITS[wageUnit()].f);
function fmtWage(yearly){ return fmtEUR(Math.round(wageToUnit(yearly))) + wageSuffix(); }

/**
 * Reads money typed by a human: "2.500.000", "2,500,000", "2,5 Mio", "850k", "1.2m", "€ 300.000".
 * Without a suffix all separators are thousands separators; with a suffix the last one is the decimal point.
 */
function parseMoney(v){
  let t = String(v == null ? "" : v).trim().toLowerCase().replace(/€|eur|\s/g, "");
  if(!t) return 0;
  const neg = /^[-−]/.test(t); t = t.replace(/^[-−]/, "");
  let mult = 1;
  const m = /(mrd|mio|tsd|m|k)\.?$/.exec(t);
  if(m){ mult = {mrd:1e9, mio:1e6, m:1e6, tsd:1e3, k:1e3}[m[1]]; t = t.slice(0, m.index); }
  let n;
  if(mult > 1){
    const i = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
    const thousands = i >= 0 && /^\d{3}$/.test(t.slice(i+1));          // "1.200 Tsd." = 1.200 × 1.000
    n = i >= 0 && !thousands ? Number(t.slice(0,i).replace(/[.,]/g,"") + "." + t.slice(i+1)) : Number(t.replace(/[.,]/g,""));
  } else n = Number(t.replace(/[.,']/g, ""));
  return Number.isFinite(n) ? Math.round((neg ? -1 : 1) * n * mult) : 0;
}
/** Text input showing a formatted amount; isWage → shown/entered in the chosen wage unit. */
function moneyInput(value, attrs, isWage){
  const shown = Math.round(isWage ? wageToUnit(value) : value);
  return `<input type="text" inputmode="decimal" autocomplete="off" class="money" data-money ${isWage ? "data-wage" : ""} value="${fmtNum(shown)}" ${attrs || ""}>`;
}
/** Value of any form control, money inputs parsed (and converted back to per-year for wages). */
function readInput(el){
  if(el.type === "checkbox") return el.checked;
  if(el.dataset && "money" in el.dataset){ const v = parseMoney(el.value); return "wage" in el.dataset ? wageFromUnit(v) : v; }
  if(el.type === "number") return num(el.value);
  return el.value;
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function initials(name){
  return String(name||"?").replace(/\./g,"").split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase() || "?";
}
function parseISO(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));
  if(!m) return null;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  return isNaN(d) ? null : d;
}
function fmtDate(iso, opts){
  const d = parseISO(iso);
  if(!d) return iso || "—";
  return d.toLocaleDateString("de-DE", opts || {weekday:"short", day:"numeric", month:"long", year:"numeric"});
}
function toISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function addDaysISO(iso, n){ const d = parseISO(iso); d.setDate(d.getDate()+n); return toISO(d); }
/** Age in full years on a reference date. */
function ageOn(birthISO, ref){
  const b = parseISO(birthISO); if(!b || !ref) return null;
  let a = ref.getFullYear() - b.getFullYear();
  if(ref.getMonth() < b.getMonth() || (ref.getMonth() === b.getMonth() && ref.getDate() < b.getDate())) a--;
  return a;
}
/** Days until the next birthday (0 = today). 29 Feb counts as 28 Feb in non-leap years. */
function daysToBirthday(birthISO, ref){
  const b = parseISO(birthISO); if(!b || !ref) return null;
  const mk = y => { const d = new Date(y, b.getMonth(), b.getDate()); if(d.getMonth() !== b.getMonth()) d.setDate(0); return d; };
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  let next = mk(today.getFullYear());
  if(next < today) next = mk(today.getFullYear()+1);
  return Math.round((next - today)/86400000);
}
const MONTHS_DE = ["januar","februar","märz","april","mai","juni","juli","august","september","oktober","november","dezember"];
// Accepts ISO dates and legacy free-text dates like "12. März 2027".
function normalizeDate(v, fallback="2027-03-12"){
  if(parseISO(v)) return v;
  const m = /(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/.exec(String(v||""));
  if(m){
    const mi = MONTHS_DE.indexOf(m[2].toLowerCase());
    if(mi >= 0) return `${m[3]}-${String(mi+1).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }
  return fallback;
}
function isTyping(el){
  el = el || document.activeElement;
  if(!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/* ==========================================================================
   DOMAIN DEFINITIONS
   ========================================================================== */
const POS_LIST = ["TW","IV","LV","RV","DM","ZM","OM","LF","RF","ST"];
const POS_NAME = {TW:"Torwart",IV:"Innenverteidiger",LV:"Linksverteidiger",RV:"Rechtsverteidiger",DM:"Def. Mittelfeld",
  ZM:"Zentrales Mittelfeld",OM:"Off. Mittelfeld",LF:"Linker Flügel",RF:"Rechter Flügel",ST:"Sturm"};

// Positions that can reasonably cover each other (used for "Beste Elf").
const RELATED = {
  TW:[], IV:["DM","LV","RV"], LV:["RV","LF","IV"], RV:["LV","RF","IV"],
  DM:["ZM","IV"], ZM:["DM","OM"], OM:["ZM","LF","RF","ST"],
  LF:["RF","OM","ST","LV"], RF:["LF","OM","ST","RV"], ST:["OM","LF","RF"]
};

// 12.0: the official Football Manager 26 roles (DE/EN, position, phase, short description).
// phase: "both" = Def. / Off. (in AND out of possession), "in" = Offensive (with the ball), "out" = Defensive (without)
const ROLE_DB = [{"de": "Torwart", "en": "Goalkeeper", "pos": "TW", "phase": "both", "desc": "Ausgewogene Standard-Rolle"},
  {"de": "Linientorhüter", "en": "Line-Holding Keeper", "pos": "TW", "phase": "out", "desc": "Bleibt in seinem Kasten"},
  {"de": "Libero-Torhüter", "en": "Sweeper Keeper", "pos": "TW", "phase": "out", "desc": "Sichert große Bereiche vor seinem Tor"},
  {"de": "Kompromissloser Torhüter", "en": "No-Nonsense Goalkeeper", "pos": "TW", "phase": "in", "desc": "„Lang und weit bringt Sicherheit“"},
  {"de": "Ballspielender Torhüter", "en": "Ball Playing Goalkeeper", "pos": "TW", "phase": "in", "desc": "Nimmt aktiv am Aufbauspiel teil"},
  {"de": "Innenverteidiger", "en": "Centre-Back", "pos": "IV", "phase": "both", "desc": "Ausgewogene Standard-Rolle"},
  {"de": "Stoppender Innenverteidiger", "en": "Stopping Centre-Back", "pos": "IV", "phase": "out", "desc": "Verteidigt aggressiver nach vorne"},
  {"de": "Absichernder Innenverteidiger", "en": "Covering Centre-Back", "pos": "IV", "phase": "out", "desc": "Verteidigt vorsichtiger und hält die Linie"},
  {"de": "Ballspielender Innenverteidiger", "en": "Ball Playing Centre-Back", "pos": "IV", "phase": "in", "desc": "Lizenz zum Spielmachen und Ballschleppen"},
  {"de": "Kompromissloser Innenverteidiger", "en": "No-Nonsense Centre-Back", "pos": "IV", "phase": "in", "desc": "Safety first, Eleganz second"},
  {"de": "Aufrückender Innenverteidiger", "en": "Advanced Centre-Back", "pos": "IV", "phase": "in", "desc": "Der frühere Libero; rückt ins Mittelfeld vor"},
  {"de": "Halbraumverteidiger", "en": "Wide Centre-Back", "pos": "RIV/LIV", "phase": "both", "desc": "Innenverteidiger, der in Ballbesitz Breite anbietet"},
  {"de": "Stoppender Halbraumverteidiger", "en": "Stopping Wide Centre-Back", "pos": "RIV/LIV", "phase": "out", "desc": "Verteidigt aggressiver nach vorne"},
  {"de": "Absichernder Halbraumverteidiger", "en": "Covering Wide Centre-Back", "pos": "RIV/LIV", "phase": "out", "desc": "Verteidigt vorsichtiger und hält die Linie"},
  {"de": "Hinterlaufender Halbraumverteidiger", "en": "Overlapping Centre-Back", "pos": "RIV/LIV", "phase": "in", "desc": "Wird in Ballbesitz zum Flügelverteidiger"},
  {"de": "Außenverteidiger", "en": "Full-Back", "pos": "AV", "phase": "both", "desc": "Ausgewogene Standard-Rolle"},
  {"de": "Flügelverteidiger", "en": "Wing-Back", "pos": "AV, FV", "phase": "both", "desc": "Ausgewogene Standard-Rolle, tiefer Flügelspieler"},
  {"de": "Abwartender Außenverteidiger", "en": "Holding Full-Back", "pos": "AV", "phase": "out", "desc": "Absicherung auf Außen"},
  {"de": "Pressender Außenverteidiger", "en": "Pressing Full-Back", "pos": "AV", "phase": "out", "desc": "Verteidigt aggressiv nach vorne"},
  {"de": "Inverser Außenverteidiger", "en": "Inverted Full-Back", "pos": "AV", "phase": "in", "desc": "Zusätzlicher Innenverteidiger in Ballbesitz"},
  {"de": "Abwartender Flügelverteidiger", "en": "Holding Wing-Back", "pos": "FV", "phase": "out", "desc": "Absicherung auf Außen"},
  {"de": "Pressender Flügelverteidiger", "en": "Pressing Wing-Back", "pos": "FV", "phase": "out", "desc": "Verteidigt aggressiv nach vorne"},
  {"de": "Inverser Flügelverteidiger", "en": "Inverted Wing-Back", "pos": "AV, FV", "phase": "in", "desc": "Verkappter Sechser / Achter in Ballbesitz"},
  {"de": "Spielmachender Flügelverteidiger", "en": "Playmaking Wing-Back", "pos": "AV, FV", "phase": "in", "desc": "Verkappter Sechser / Achter mit Spielmacher-Lizenz"},
  {"de": "Vorgeschobener Flügelverteidiger", "en": "Advanced Wing-Back", "pos": "FV", "phase": "in", "desc": "Der frühere Komplette Flügelverteidiger; sehr offensiv"},
  {"de": "Defensiver Mittelfeldspieler", "en": "Defensive Midfielder", "pos": "DM", "phase": "both", "desc": "Ausgewogene Standard-Rolle"},
  {"de": "Halbverteidiger", "en": "Dropping Defensive Midfielder", "pos": "DM", "phase": "out", "desc": "Zusätzlicher Innenverteidiger im letzten Drittel"},
  {"de": "Abschirmender Sechser", "en": "Screening Defensive Midfielder", "pos": "DM", "phase": "out", "desc": "„Holding Six“"},
  {"de": "Pressender Sechser", "en": "Pressing Defensive Midfielder", "pos": "DM", "phase": "out", "desc": "Verteidigt aggressiv nach vorne"},
  {"de": "Flügelsichernder Sechser", "en": "Wide Covering Defensive Midfielder", "pos": "DMR/L", "phase": "out", "desc": "Unterstützt die Außenverteidiger beim Doppeln"},
  {"de": "Tiefer Spielmacher", "en": "Deep-Lying Playmaker", "pos": "DM", "phase": "in", "desc": "Aufbauspieler"},
  {"de": "Abkippender Sechser", "en": "Half-Back", "pos": "DM", "phase": "in", "desc": "Begibt sich zum Spielaufbau in die Defensivlinie"},
  {"de": "Box-to-Box-Spieler", "en": "Box-to-Box Midfielder", "pos": "DM", "phase": "in", "desc": "„Segundo Volante“, vertikaler Dauerrenner"},
  {"de": "Box-to-Box-Spielmacher", "en": "Box-to-Box Playmaker", "pos": "DM", "phase": "in", "desc": "„Vertikaler Spielmacher“, kreativer B2B-Spieler"},
  {"de": "Zentraler Mittelfeldspieler", "en": "Central Midfielder", "pos": "DM, ZM", "phase": "both", "desc": "Ausgewogene Standard-Rolle"},
  {"de": "Abschirmender Achter", "en": "Screening Central Midfielder", "pos": "ZM", "phase": "out", "desc": "Hält Position und stellt Passwege zu"},
  {"de": "Pressender Achter", "en": "Pressing Central Midfielder", "pos": "ZM", "phase": "out", "desc": "Verteidigt aggressiv nach vorne"},
  {"de": "Flügelsichernder Achter", "en": "Wide Covering Central Midfielder", "pos": "ZMR/L", "phase": "out", "desc": "Unterstützt die Außenverteidiger beim Doppeln"},
  {"de": "Spielmacher", "en": "Midfield Playmaker", "pos": "ZM", "phase": "in", "desc": "Kreativer Verbindungsspieler"},
  {"de": "Weiter Achter", "en": "Wide Central Midfielder", "pos": "ZMR/L", "phase": "in", "desc": "„Carrilero“, breiter Verbindungsspieler"},
  {"de": "Vorgeschobener Spielmacher", "en": "Advanced Playmaker", "pos": "ZM, OM", "phase": "in", "desc": "Klassischer Spielmacher und Chancenkreierer"},
  {"de": "Offensiver Mittelfeldspieler", "en": "Attacking Midfielder", "pos": "ZM, OM", "phase": "both", "desc": "Ausgewogene Standard-Rolle"},
  {"de": "Mitarbeitender Zehner", "en": "Tracking Attacking Midfielder", "pos": "OM", "phase": "out", "desc": "Arbeitet nach hinten, um die Defensive zu unterstützen"},
  {"de": "Zentraler Umschaltzehner", "en": "Central Outlet Attacking Midfielder", "pos": "OM", "phase": "out", "desc": "Anspielstation für den Umschaltmoment"},
  {"de": "Ausweichender Umschaltzehner", "en": "Splitting Outlet Attacking Midfielder", "pos": "OM", "phase": "out", "desc": "Wartet in den Halbräumen auf den Umschaltmoment"},
  {"de": "Freigeist/Freirolle", "en": "Free Role", "pos": "OM", "phase": "in", "desc": "„Trequartista“; besitzt offensiv alle Freiheiten"},
  {"de": "Halbraumspieler", "en": "Channel Midfielder", "pos": "OM", "phase": "in", "desc": "Attackiert die gegnerischen Schnittstellen / Halbräume"},
  {"de": "Zweiter Stürmer", "en": "Second Striker", "pos": "OM", "phase": "in", "desc": "„Schattenstürmer“; attackiert den Strafraum"},
  {"de": "Äußerer Mittelfeldspieler", "en": "Wide Midfielder", "pos": "RM/LM", "phase": "both", "desc": "Ausgewogene Standard-Rolle, „ZM für Außen“"},
  {"de": "Flügelspieler", "en": "Winger", "pos": "RM/LM, OMR/L", "phase": "both", "desc": "Dribbeln und Flanken sind sein Metier"},
  {"de": "Mitarbeitender Außenspieler", "en": "Tracking Wide Midfielder", "pos": "RM/LM", "phase": "out", "desc": "Arbeitet nach hinten, um die Defensive zu unterstützen"},
  {"de": "Mitarbeitender Flügelspieler", "en": "Tracking Winger", "pos": "OMR/L", "phase": "out", "desc": "Arbeitet nach hinten, um die Defensive zu unterstützen"},
  {"de": "Äußerer Umschaltspieler", "en": "Wide Outlet Wide Midfielder", "pos": "RM/LM", "phase": "out", "desc": "Anspielstation auf den Außen für den Umschaltmoment"},
  {"de": "Umschaltflügelspieler", "en": "Wide Outlet Winger", "pos": "OMR/L", "phase": "out", "desc": "Anspielstation auf den Außen für den Umschaltmoment"},
  {"de": "Inverser Umschaltflügelspieler", "en": "Inverting Outlet Winger", "pos": "OMR/L", "phase": "out", "desc": "Sucht die Halbräume für den Umschaltmoment"},
  {"de": "Halbraumflügel", "en": "Half-Space Winger", "pos": "RM/LM, OMR/L", "phase": "in", "desc": "„Inverser Flügelspieler“; zieht nach innen"},
  {"de": "Äußerer Spielmacher", "en": "Wide Playmaker", "pos": "RM/LM, OMR/L", "phase": "in", "desc": "Spielmacher mit weiter Startposition; zieht ins Zentrum"},
  {"de": "Inverser Außenstürmer", "en": "Half-Space Forward", "pos": "OMR/L", "phase": "in", "desc": "„Inverser Außenstürmer“; Torgefahr von Außen"},
  {"de": "Außenstürmer", "en": "Wide Forward", "pos": "OMR/L", "phase": "in", "desc": "„Raumdeuter“; gibt Breite und taucht dann in der Box auf"},
  {"de": "Mittelstürmer", "en": "Centre Forward", "pos": "ST", "phase": "both", "desc": "Ausgewogene Standard-Rolle, klassische Nummer 9"},
  {"de": "Mitarbeitender Mittelstürmer", "en": "Tracking Centre Forward", "pos": "ST", "phase": "out", "desc": "Arbeitet nach hinten, um die Defensive zu unterstützen"},
  {"de": "Zentraler Umschaltstürmer", "en": "Central Outlet Centre Forward", "pos": "ST", "phase": "out", "desc": "Zentrale Anspielstation für den Umschaltmoment"},
  {"de": "Ausweichender Umschaltstürmer", "en": "Splitting Outlet Centre Forward", "pos": "ST", "phase": "out", "desc": "Sucht die Halbräume / Außen für den Umschaltmoment"},
  {"de": "Hängende Spitze", "en": "Deep-Lying Forward", "pos": "ST", "phase": "in", "desc": "Verbindungsspieler und Ballverteiler"},
  {"de": "Falsche Neun", "en": "False Nine", "pos": "ST", "phase": "in", "desc": "Verkappter Zehner"},
  {"de": "Zielspieler", "en": "Target Forward", "pos": "ST", "phase": "in", "desc": "Langer Kerl mit Muskeln"},
  {"de": "Knipser", "en": "Poacher", "pos": "ST", "phase": "in", "desc": "Tore schießen, sonst nix"},
  {"de": "Halbraumstürmer", "en": "Channel Forward", "pos": "ST", "phase": "in", "desc": "Attackiert die Halbräume, um hinter die Linie zu kommen"}];
const ROLE_INFO = Object.fromEntries(ROLE_DB.map(r=>[r.de, r]));
const ROLES_IP = {"TW": ["Torwart", "Kompromissloser Torhüter", "Ballspielender Torhüter"], "IV": ["Innenverteidiger", "Ballspielender Innenverteidiger", "Kompromissloser Innenverteidiger", "Aufrückender Innenverteidiger", "Halbraumverteidiger", "Hinterlaufender Halbraumverteidiger"], "LV": ["Außenverteidiger", "Flügelverteidiger", "Inverser Außenverteidiger", "Inverser Flügelverteidiger", "Spielmachender Flügelverteidiger", "Vorgeschobener Flügelverteidiger"], "RV": ["Außenverteidiger", "Flügelverteidiger", "Inverser Außenverteidiger", "Inverser Flügelverteidiger", "Spielmachender Flügelverteidiger", "Vorgeschobener Flügelverteidiger"], "DM": ["Defensiver Mittelfeldspieler", "Tiefer Spielmacher", "Abkippender Sechser", "Box-to-Box-Spieler", "Box-to-Box-Spielmacher", "Zentraler Mittelfeldspieler"], "ZM": ["Zentraler Mittelfeldspieler", "Spielmacher", "Weiter Achter", "Vorgeschobener Spielmacher", "Offensiver Mittelfeldspieler"], "OM": ["Offensiver Mittelfeldspieler", "Vorgeschobener Spielmacher", "Freigeist/Freirolle", "Halbraumspieler", "Zweiter Stürmer"], "LF": ["Flügelspieler", "Äußerer Mittelfeldspieler", "Halbraumflügel", "Äußerer Spielmacher", "Inverser Außenstürmer", "Außenstürmer"], "RF": ["Flügelspieler", "Äußerer Mittelfeldspieler", "Halbraumflügel", "Äußerer Spielmacher", "Inverser Außenstürmer", "Außenstürmer"], "ST": ["Mittelstürmer", "Hängende Spitze", "Falsche Neun", "Zielspieler", "Knipser", "Halbraumstürmer"]};
const ROLES_OOP = {"TW": ["Torwart", "Linientorhüter", "Libero-Torhüter"], "IV": ["Innenverteidiger", "Stoppender Innenverteidiger", "Absichernder Innenverteidiger", "Halbraumverteidiger", "Stoppender Halbraumverteidiger", "Absichernder Halbraumverteidiger"], "LV": ["Außenverteidiger", "Flügelverteidiger", "Abwartender Außenverteidiger", "Pressender Außenverteidiger", "Abwartender Flügelverteidiger", "Pressender Flügelverteidiger"], "RV": ["Außenverteidiger", "Flügelverteidiger", "Abwartender Außenverteidiger", "Pressender Außenverteidiger", "Abwartender Flügelverteidiger", "Pressender Flügelverteidiger"], "DM": ["Defensiver Mittelfeldspieler", "Halbverteidiger", "Abschirmender Sechser", "Pressender Sechser", "Flügelsichernder Sechser", "Zentraler Mittelfeldspieler"], "ZM": ["Zentraler Mittelfeldspieler", "Abschirmender Achter", "Pressender Achter", "Flügelsichernder Achter", "Offensiver Mittelfeldspieler"], "OM": ["Offensiver Mittelfeldspieler", "Mitarbeitender Zehner", "Zentraler Umschaltzehner", "Ausweichender Umschaltzehner"], "LF": ["Flügelspieler", "Äußerer Mittelfeldspieler", "Mitarbeitender Außenspieler", "Mitarbeitender Flügelspieler", "Äußerer Umschaltspieler", "Umschaltflügelspieler", "Inverser Umschaltflügelspieler"], "RF": ["Flügelspieler", "Äußerer Mittelfeldspieler", "Mitarbeitender Außenspieler", "Mitarbeitender Flügelspieler", "Äußerer Umschaltspieler", "Umschaltflügelspieler", "Inverser Umschaltflügelspieler"], "ST": ["Mittelstürmer", "Mitarbeitender Mittelstürmer", "Zentraler Umschaltstürmer", "Ausweichender Umschaltstürmer"]};
/* the dashboard's own role names before 12.0 – unchanged lists are replaced, assigned roles are carried over */
const ROLES_IP_OLD = {TW:["Torwart","Ballspielender Torwart","Mitspielender Torwart"], IV:["Innenverteidiger","Ballspielender IV","Breiter IV","Aufrückender IV"],
  LV:["Außenverteidiger","Wingback","Inverser AV","Offensiver Wingback"], RV:["Außenverteidiger","Wingback","Inverser AV","Offensiver Wingback"],
  DM:["Sechser","Tiefer Spielmacher","Abkippender Sechser","Halbverteidiger"], ZM:["Box-to-Box","Achter","Mezzala","Zentraler Spielmacher"], OM:["Zehner","Schattenstürmer","Freirolle"],
  LF:["Flügelspieler","Inverser Flügel","Inside Forward","Breiter Spielmacher"], RF:["Flügelspieler","Inverser Flügel","Inside Forward","Breiter Spielmacher"],
  ST:["Mittelstürmer","Zielspieler","Falsche Neun","Tiefer Stürmer","Konterstürmer"]};
const ROLES_OOP_OLD = {TW:["Torwart","Hoch stehender Torwart"], IV:["Innenverteidiger","Herausrückender IV","Absichernder IV"], LV:["Außenverteidiger","Pressender AV","Absichernder AV"],
  RV:["Außenverteidiger","Pressender AV","Absichernder AV"], DM:["Abschirmender Sechser","Zerstörer","Zurückfallender Sechser"], ZM:["Zentraler MF","Pressender ZM","Abschirmender ZM"],
  OM:["Pressender OM","Abschirmender OM","Hoch bleibend"], LF:["Mitlaufender Flügel","Pressender Flügel","Hoch bleibend"], RF:["Mitlaufender Flügel","Pressender Flügel","Hoch bleibend"],
  ST:["Pressender Stürmer","Abschirmender Stürmer","Hoch bleibend"]};
const ROLE_RENAME = {
  in:{"Ballspielender Torwart":"Ballspielender Torhüter","Mitspielender Torwart":"Ballspielender Torhüter","Ballspielender IV":"Ballspielender Innenverteidiger","Breiter IV":"Halbraumverteidiger",
    "Aufrückender IV":"Aufrückender Innenverteidiger","Wingback":"Flügelverteidiger","Inverser AV":"Inverser Außenverteidiger","Offensiver Wingback":"Vorgeschobener Flügelverteidiger",
    "Sechser":"Defensiver Mittelfeldspieler","Halbverteidiger":"Abkippender Sechser","Box-to-Box":"Box-to-Box-Spieler","Achter":"Zentraler Mittelfeldspieler","Mezzala":"Weiter Achter",
    "Zentraler Spielmacher":"Spielmacher","Zehner":"Offensiver Mittelfeldspieler","Schattenstürmer":"Zweiter Stürmer","Freirolle":"Freigeist/Freirolle","Inverser Flügel":"Halbraumflügel",
    "Inside Forward":"Inverser Außenstürmer","Breiter Spielmacher":"Äußerer Spielmacher","Tiefer Stürmer":"Hängende Spitze","Konterstürmer":"Halbraumstürmer"},
  out:{"Hoch stehender Torwart":"Libero-Torhüter","Herausrückender IV":"Stoppender Innenverteidiger","Absichernder IV":"Absichernder Innenverteidiger","Pressender AV":"Pressender Außenverteidiger",
    "Absichernder AV":"Abwartender Außenverteidiger","Zerstörer":"Pressender Sechser","Zurückfallender Sechser":"Halbverteidiger","Zentraler MF":"Zentraler Mittelfeldspieler",
    "Pressender ZM":"Pressender Achter","Abschirmender ZM":"Abschirmender Achter","Pressender OM":"Offensiver Mittelfeldspieler","Abschirmender OM":"Mitarbeitender Zehner",
    "Mitlaufender Flügel":"Mitarbeitender Flügelspieler","Pressender Flügel":"Flügelspieler","Pressender Stürmer":"Mittelstürmer","Abschirmender Stürmer":"Mitarbeitender Mittelstürmer"},
  high:{OM:"Zentraler Umschaltzehner", LF:"Umschaltflügelspieler", RF:"Umschaltflügelspieler", ST:"Zentraler Umschaltstürmer"}
};
/* 12.6: an own formation WITHOUT the ball (e.g. 4-2-3-1 with the ball, 4-3-3 without).
   tactics[f].oopForm = formation name ("" = same formation, compact) · tactics[f].oopMap = {ipSlot: oopSlot} */
function oopFormOf(t){ return t && typeof t.oopForm === "string" && t.oopForm !== FREE && FORMATIONS[t.oopForm] ? t.oopForm : ""; }
/** Hungarian algorithm (min-cost assignment) for an n×n cost matrix → row → column */
function hungarian(cost){
  const n = cost.length, INF = 1e18, u = Array(n + 1).fill(0), v = Array(n + 1).fill(0), p = Array(n + 1).fill(0), way = Array(n + 1).fill(0);
  for(let i = 1; i <= n; i++){
    p[0] = i; let j0 = 0; const minv = Array(n + 1).fill(INF), used = Array(n + 1).fill(false);
    do{ used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for(let j = 1; j <= n; j++) if(!used[j]){ const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]; if(cur < minv[j]){ minv[j] = cur; way[j] = j0; } if(minv[j] < delta){ delta = minv[j]; j1 = j; } }
      for(let j = 0; j <= n; j++){ if(used[j]){ u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1; } while(p[j0] !== 0);
    do{ const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while(j0);
  }
  const ans = Array(n); for(let j = 1; j <= n; j++) if(p[j]) ans[p[j] - 1] = j - 1; return ans;
}
/** every player goes to the nearest position of the formation without the ball (shortest total way, keeper stays keeper) */
function autoOopMap(ipDefs, oopDefs){
  if(!ipDefs || !oopDefs || ipDefs.length !== oopDefs.length) return null;
  const cost = ipDefs.map(a=>oopDefs.map(b=>((a.cat === "TW") !== (b.cat === "TW") ? 1e6 : Math.hypot((a.x - b.x) * 0.68, a.y - b.y))));
  const ans = hungarian(cost), map = {}; ans.forEach((j,i)=>{ map[i] = j; }); return map;
}
function validOopMap(m, n){
  if(!m || typeof m !== "object") return false;
  const vals = []; for(let i = 0; i < n; i++){ const j = m[i]; if(!Number.isInteger(j) || j < 0 || j >= n) return false; vals.push(j); }
  return new Set(vals).size === n;
}
/* ---------- 12.7: board positions & role abbreviations ---------- */
/** Short codes for the 68 FM26 roles (sixes end in 6, eights in 8) – the full name is in the info window */
const ROLE_ABBR = {"Torwart":"TW","Linientorhüter":"LTH","Libero-Torhüter":"LBT","Kompromissloser Torhüter":"KTH","Ballspielender Torhüter":"BTH",
  "Innenverteidiger":"IV","Stoppender Innenverteidiger":"SIV","Absichernder Innenverteidiger":"AIV","Ballspielender Innenverteidiger":"BIV","Kompromissloser Innenverteidiger":"KIV",
  "Aufrückender Innenverteidiger":"LIB","Halbraumverteidiger":"HRV","Stoppender Halbraumverteidiger":"SHV","Absichernder Halbraumverteidiger":"AHV","Hinterlaufender Halbraumverteidiger":"HHV",
  "Außenverteidiger":"AV","Flügelverteidiger":"FV","Abwartender Außenverteidiger":"AAV","Pressender Außenverteidiger":"PAV","Inverser Außenverteidiger":"IAV",
  "Abwartender Flügelverteidiger":"AFV","Pressender Flügelverteidiger":"PFV","Inverser Flügelverteidiger":"IFV","Spielmachender Flügelverteidiger":"SFV","Vorgeschobener Flügelverteidiger":"VFV",
  "Defensiver Mittelfeldspieler":"DM","Halbverteidiger":"HV","Abschirmender Sechser":"A6","Pressender Sechser":"P6","Flügelsichernder Sechser":"F6","Tiefer Spielmacher":"TSM",
  "Abkippender Sechser":"K6","Box-to-Box-Spieler":"B2B","Box-to-Box-Spielmacher":"B2S","Zentraler Mittelfeldspieler":"ZM","Abschirmender Achter":"A8","Pressender Achter":"P8",
  "Flügelsichernder Achter":"F8","Spielmacher":"SM","Weiter Achter":"W8","Vorgeschobener Spielmacher":"VSM","Offensiver Mittelfeldspieler":"OM","Mitarbeitender Zehner":"MZ",
  "Zentraler Umschaltzehner":"ZUZ","Ausweichender Umschaltzehner":"AUZ","Freigeist/Freirolle":"FR","Halbraumspieler":"HRS","Zweiter Stürmer":"ZS",
  "Äußerer Mittelfeldspieler":"ÄM","Flügelspieler":"FL","Mitarbeitender Außenspieler":"MAS","Mitarbeitender Flügelspieler":"MFS","Äußerer Umschaltspieler":"ÄUS",
  "Umschaltflügelspieler":"UFS","Inverser Umschaltflügelspieler":"IUF","Halbraumflügel":"HRF","Äußerer Spielmacher":"ÄSM","Inverser Außenstürmer":"IAS","Außenstürmer":"AST",
  "Mittelstürmer":"MS","Mitarbeitender Mittelstürmer":"MMS","Zentraler Umschaltstürmer":"ZUS","Ausweichender Umschaltstürmer":"AUS","Hängende Spitze":"HS","Falsche Neun":"F9",
  "Zielspieler":"ZSP","Knipser":"KN","Halbraumstürmer":"HST"};
/** own roles (Admin → Listen) get initials, e.g. "Klassischer Neuner" → "KN" */
function roleAbbr(name){
  if(ROLE_ABBR[name]) return ROLE_ABBR[name];
  const w = String(name || "").split(/[\s\-\/]+/).filter(Boolean);
  return (w.length > 1 ? w.slice(0,3).map(x=>x[0]).join("") : String(name || "?").slice(0,3)).toUpperCase();
}
/** Board positions as in FM: LIV/IV/RIV, AV/FV, DML/DMR, ZML/ZMR, LM/RM, LF/RF … – derived from where the players stand.
    items: [{cat, x, y}] of one phase (cat = position group of the slot). Returns one code per item. */
function boardPositions(items){
  const out = items.map(it=>it.cat);
  const group = (cats, names) => {
    const idx = items.map((it,i)=>i).filter(i=>cats.includes(items[i].cat)).sort((a,b)=>items[a].x - items[b].x);
    const nm = names[Math.min(idx.length, names.length) - 1] || null;
    idx.forEach((i,k)=>{ if(nm) out[i] = nm[k] !== undefined ? nm[k] : nm[nm.length - 1]; });
    return idx.length;
  };
  const ivs = group(["IV"], [["IV"],["IV","IV"],["LIV","IV","RIV"],["LIV","IV","IV","RIV"]]);
  group(["DM"], [["DM"],["DML","DMR"],["DML","DM","DMR"]]);
  group(["ZM"], [["ZM"],["ZML","ZMR"],["ZML","ZM","ZMR"]]);
  items.forEach((it,i)=>{
    if(it.cat === "LV" || it.cat === "RV") out[i] = (it.y < 64 || ivs >= 3) ? "FV" : "AV";
    else if(it.cat === "LF" || it.cat === "RF") out[i] = it.y >= 40 ? (it.cat === "LF" ? "LM" : "RM") : it.cat;
  });
  return out;
}
/** 12.7: FM26 role that fits the MOVE between the phases (board position without → with the ball), or "" */
function suggestRoleIn(pin, pout){
  const back = /^(IV|LIV|RIV)$/, mid = /^(DM|DML|DMR|ZM|ZML|ZMR)$/, wideDef = /^(AV|FV)$/, wideAtt = /^(LM|RM|LF|RF)$/;
  if(wideDef.test(pout) && mid.test(pin)) return "Inverser Flügelverteidiger";
  if(wideDef.test(pout) && back.test(pin)) return "Inverser Außenverteidiger";
  if(pout === "AV" && wideAtt.test(pin)) return "Vorgeschobener Flügelverteidiger";
  if(/^DM/.test(pout) && back.test(pin)) return "Abkippender Sechser";
  if(/^(LIV|RIV)$/.test(pout) && (wideDef.test(pin) || wideAtt.test(pin))) return "Hinterlaufender Halbraumverteidiger";
  if(pout === "IV" && mid.test(pin)) return "Aufrückender Innenverteidiger";
  return "";
}
/** colour group of a board position: t = keeper, d = defence, m = midfield, a = attack */
const lineOf = code => code === "TW" ? "t" : /^(IV|LIV|RIV|AV|FV)$/.test(code) ? "d" : /^(DM|ZM|LM|RM|OM)/.test(code) ? "m" : "a";
/** an old role name → its FM26 counterpart in this position group (or "" if there is none in the list) */
function mapOldRole(phase, cat, name, list){
  const to = name === "Hoch bleibend" ? ROLE_RENAME.high[cat] : ROLE_RENAME[phase === "out" ? "out" : "in"][name];
  return to && list.includes(to) ? to : "";
}
const SQUAD_ROLES = {
  key:"Schlüsselspieler", first:"Stammspieler", rotation:"Rotation",
  backup:"Backup", prospect:"Perspektive", sell:"Abgabe"
};
const SQUAD_ROLE_ORDER = ["key","first","rotation","backup","prospect","sell"];

const STATUS = {
  "": "Verfügbar", injured:"Verletzt", suspended:"Gesperrt", unhappy:"Unzufrieden", ineligible:"Nicht spielberechtigt"
};
const UNAVAILABLE = ["injured","suspended","ineligible"];

const GRADES = ["A+","A","B","C","D"];
const SCOUT_STATUS = {watched:"Beobachtet", negotiating:"Verhandlung", fixed:"Fixiert"};
const PATHWAYS = {u19:"U19", u23:"U23 / Reserve", loan:"Leihe geplant", first:"1. Mannschaft"};
const LOAN_CLAUSES = {none:"Keine", recall:"Rückrufoption", buy:"Kaufoption", obligation:"Kaufpflicht"};
const SALE_STATUS = {listed:"Gelistet", offer:"Angebot liegt vor", agreed:"Einigung"};
const DEFAULT_WINDOWS = {summer:"01.07.–01.09.", winter:"01.01.–01.02."};
const GOAL_CATS = ["Liga","Pokal","Europa","Finanzen","Jugend","Spielstil","Sonstiges"];
const GOAL_STATUS = {track:"Auf Kurs", risk:"Gefährdet", done:"Erreicht", failed:"Verfehlt"};
/* ---------- Eigene Datenfelder (custom fields) ----------
   Definitions live in the save (state.customFields); values in entity.custom = {fieldId: value}.
   Values are kept for every defined field regardless of the area – the area only decides where
   a column is shown, so unticking an area never deletes data. */
const CF_TYPES = {text:"Text", number:"Zahl", bool:"Ja/Nein", select:"Auswahl"};
const CF_AREAS = {squad:"Kader", scouting:"Scouting"};
const CF_MAX = 30;
function sanitizeCustomFields(raw){
  const out = [], seenId = new Set(), seenName = new Set();
  (Array.isArray(raw) ? raw : []).forEach(f=>{
    if(!f || typeof f !== "object") return;
    const id = /^[A-Za-z0-9_]{1,24}$/.test(f.id || "") ? f.id : "f" + Math.random().toString(36).slice(2, 10);
    const name = String(f.name == null ? "" : f.name).trim().slice(0, 40);
    if(!name || seenId.has(id) || seenName.has(name.toLowerCase())) return;
    const type = CF_TYPES[f.type] ? f.type : "text";
    let options = [];
    if(type === "select"){
      options = [...new Set((Array.isArray(f.options) ? f.options : []).map(x=>String(x == null ? "" : x).trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
      if(!options.length) options = ["Option 1"];
    }
    const areas = [...new Set((Array.isArray(f.areas) ? f.areas : []).filter(a=>CF_AREAS[a]))];
    seenId.add(id); seenName.add(name.toLowerCase());
    out.push({id, name, type, options, areas: areas.length ? areas : ["squad"]});
  });
  return out.slice(0, CF_MAX);
}
/** One value in the field's type; undefined = empty (not stored). */
function coerceCF(def, v){
  if(v === undefined || v === null) return undefined;
  switch(def.type){
    case "number": {
      if(typeof v === "number") return Number.isFinite(v) ? v : undefined;
      const t = String(v).trim(); if(!t) return undefined;
      let n;
      if(/^[-+]?\d[\d.,]*\s*(k|tsd\.?|mio\.?|m|mrd\.?)$/i.test(t) || /^[-+]?\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(t)) n = parseMoney(t);   // "2,5 Mio", "12.000"
      else n = Number(t.replace(",", "."));                                                                                        // "4,5", "7" – "12x" → NaN
      return Number.isFinite(n) ? n : undefined;
    }
    case "bool": return (v === true || /^(ja|yes|y|x|1|true|✓)$/i.test(String(v).trim())) ? true : undefined;
    case "select": { const t = String(v).trim(); return def.options.includes(t) ? t : undefined; }
    default: { const t = String(v).trim().slice(0, 200); return t || undefined; }
  }
}
function sanitizeCustom(obj, defs){
  const out = {};
  if(obj && typeof obj === "object") defs.forEach(d=>{ const v = coerceCF(d, obj[d.id]); if(v !== undefined) out[d.id] = v; });
  return out;
}
const cfDefs = area => (state && state.customFields ? state.customFields : []).filter(d=>!area || d.areas.includes(area));
const cfById = id => (state && state.customFields || []).find(d=>d.id === id);
function cfText(def, v){
  if(def.type === "bool") return v ? "Ja" : "Nein";          // unticked = "Nein"
  if(v === undefined || v === null || v === "") return "—";
  if(def.type === "number") return fmtNum(v, 2);
  return String(v);
}
/** Sort helper: empty values always last. */
function cfSortValue(def, v){
  if(def.type === "bool") return v ? 1 : 0;                  // unticked = no, a real value
  if(v === undefined || v === null || v === "") return null;
  if(def.type === "number") return v;
  if(def.type === "select") return def.options.indexOf(v);
  return String(v).toLowerCase();
}
/** Compares two filled values (empty ones are handled by cfEmptyOrder, independent of the sort direction). */
function cfCompare(id, a, b){
  const def = cfById(id); if(!def) return 0;
  const x = cfSortValue(def, (a.custom||{})[id]), y = cfSortValue(def, (b.custom||{})[id]);
  if(x === null || y === null) return 0;
  return typeof x === "string" ? x.localeCompare(y, "de") : x - y;
}
/** Empty values always at the end – whether the column is sorted up or down. */
function cfEmptyOrder(id, a, b){
  const def = cfById(id); if(!def) return 0;
  const x = cfSortValue(def, (a.custom||{})[id]) === null, y = cfSortValue(def, (b.custom||{})[id]) === null;
  return x === y ? 0 : x ? 1 : -1;
}
function cfCellHTML(def, entity){
  const v = (entity.custom || {})[def.id];
  const a = `data-cf="${def.id}" aria-label="${esc(def.name)}"`;
  let ctl;
  if(def.type === "bool") ctl = `<input type="checkbox" class="cf-check" ${v ? "checked" : ""} ${a}>`;
  else if(def.type === "number") ctl = `<input type="number" step="any" class="w-s cf-num" value="${v === undefined ? "" : v}" placeholder="–" ${a}>`;
  else if(def.type === "select") ctl = `<select class="w-sel" ${a}><option value="">—</option>${def.options.map(o=>`<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else ctl = `<input type="text" class="w-m" value="${esc(v || "")}" placeholder="–" ${a}>`;
  return `<td data-col="cf_${def.id}" data-label="${esc(def.name)}" class="cf-cell cf-${def.type}">${ctl}</td>`;
}
/** Reads a custom cell into entity.custom (empty → removed). */
/** (Re)builds the custom-field column heads of a table, right before the actions column. */
function renderCFHeads(tableId, area){
  const table = qs("#" + tableId); if(!table || !table.tHead) return;
  const row = table.tHead.rows[0];
  qsa("th.cf-head", row).forEach(th=>th.remove());
  const actions = row.cells[row.cells.length - 1];
  cfDefs(area).forEach(d=>{
    const th = document.createElement("th");
    th.className = "cf-head"; th.dataset.col = "cf_" + d.id; th.dataset.sort = "cf:" + d.id; th.tabIndex = 0;
    th.textContent = d.name; th.title = `Eigenes Feld (${CF_TYPES[d.type]}) · Klick sortiert`;
    const h = document.createElement("span");
    h.className = "col-resizer"; h.title = "Ziehen: Breite ändern · Doppelklick: an Inhalt anpassen";
    h.addEventListener("click", e=>e.stopPropagation());
    h.addEventListener("dblclick", e=>{ e.stopPropagation(); autoFitColumn(table, th); });
    th.appendChild(h);
    row.insertBefore(th, actions);
  });
  // each custom column adds to the minimum width → the table scrolls sideways instead of squeezing the others
  table.style.setProperty("--cf-extra", (cfDefs(area).length * 150) + "px");
  if(typeof applyColWidths === "function") applyColWidths(tableId);
}
function readCFCell(el, entity){
  const def = cfById(el.dataset.cf); if(!def) return;
  const raw = def.type === "bool" ? el.checked : el.value;
  const v = coerceCF(def, raw);
  entity.custom = entity.custom || {};
  if(v === undefined) delete entity.custom[def.id]; else entity.custom[def.id] = v;
}

const PLAYTIME = {good:"Gut", ok:"Geht so", bad:"Schlecht"};              // Spielzeit bei der Leihe
const LOAN_BAD_NOTE = "Zurückholen oder Leihe abbrechen im nächsten Transferfenster";
const VENUES = {H:"Heim", A:"Auswärts", N:"Neutral"};
const PRIORITIES = {1:"Niedrig", 2:"Mittel", 3:"Hoch"};
// labels of the set-piece situations/zones (the geometry below stays fixed; only the names are editable)
const SP_TYPE_NAMES = {cornerL:"Ecke links", cornerR:"Ecke rechts", fkWide:"Freistoß Flanke", fkDirect:"Freistoß direkt", throwLong:"Langer Einwurf"};
const SP_ZONE_NAMES = {near:"Erster Pfosten", keeper:"Torwart stören", far:"Zweiter Pfosten", center:"Torraum Mitte", edge:"Rückraum", short:"Kurz anbieten", guard1:"Absicherung 1", guard2:"Absicherung 2"};
/* ==========================================================================
   EDITABLE LISTS (admin → "Listen")
   The constants above are the built-in defaults. Each save may rename them, add own entries
   ("verhält sich wie" = base) and reorder them. applyLists() writes the active save's lists into
   these very objects, so the rest of the code keeps using SQUAD_ROLES, STATUS, … unchanged.
   Logic always asks for the BASE of a value (listBase), so own entries inherit behaviour and colour.
   ========================================================================== */
const LISTS_DEFAULT_KEY = "fm27_lists_default";    // global: "Als Standard für neue Spielstände"
const KEYED_LISTS = {
  squadRoles: {label:"Kaderrollen", target:SQUAD_ROLES, used:"Spieler"},
  status:     {label:"Spielerstatus", target:STATUS, used:"Spieler"},
  scoutStatus:{label:"Transferstatus (Einkäufe)", target:SCOUT_STATUS, used:"Transferziele"},
  saleStatus: {label:"Verkaufsstatus", target:SALE_STATUS, used:"Verkäufe"},
  goalStatus: {label:"Status Vorstandsziele", target:GOAL_STATUS, used:"Ziele"},
  pathways:   {label:"Talentwege", target:PATHWAYS, used:"Talente"},
  loanClauses:{label:"Leihklauseln", target:LOAN_CLAUSES, used:"Leihen"},
  playtime:   {label:"Spielzeit (Leihen)", target:PLAYTIME, used:"Leihen"},
  // fixed: every entry has a fixed function → rename only (no add / delete / reorder)
  venues:     {label:"Spielort", target:VENUES, used:"Spiele", fixed:true},
  priorities: {label:"Prioritäten (Transferziele)", target:PRIORITIES, used:"Transferziele", fixed:true},
  posNames:   {label:"Positionsnamen", target:POS_NAME, used:"Spieler", fixed:true},
  spTypes:    {label:"Standard-Situationen", target:SP_TYPE_NAMES, used:"", fixed:true},
  spZones:    {label:"Standard-Zonen", target:SP_ZONE_NAMES, used:"", fixed:true}
};
const LABEL_LISTS = {
  grades:   {label:"Scouting-Grades", target:GRADES, used:"Transferziele"},
  goalCats: {label:"Kategorien Vorstandsziele", target:GOAL_CATS, used:"Ziele"}
};
const BASE_HINT = {
  squadRoles:{key:"Schlüsselspieler (Warnungen, Bonus bei Beste Elf)", sell:"Abgabe (Verkaufsliste, Zukunfts-Kader)"},
  status:{"":"verfügbar", injured:"nicht verfügbar", suspended:"nicht verfügbar", ineligible:"nicht verfügbar", unhappy:"verfügbar, aber auffällig"},
  scoutStatus:{watched:"zählt nicht ins Budget", negotiating:"zählt ins Budget, unsicher", fixed:"zählt ins Budget, kann verpflichtet werden"},
  saleStatus:{listed:"zählt nicht ins Budget", offer:"zählt ins Budget", agreed:"zählt ins Budget, Abgang im Zukunfts-Kader"},
  pathways:{first:"rückt im Zukunfts-Kader auf"},
  loanClauses:{buy:"Rückkehr unsicher", obligation:"kehrt nicht zurück"},
  playtime:{good:"Leihe läuft gut", ok:"beobachten", bad:"rot markiert · Auto-Notiz · „Rückruf prüfen“"}
};
// 12.0: the FM26 "outlet" roles stay high without the ball (counter-attack options)
const DEFAULT_STAY_HIGH = ["Zentraler Umschaltzehner","Ausweichender Umschaltzehner","Umschaltflügelspieler","Inverser Umschaltflügelspieler","Äußerer Umschaltspieler","Zentraler Umschaltstürmer","Ausweichender Umschaltstürmer"];
const DEFAULT_STAY_HIGH_OLD = ["Hoch bleibend","Pressender Stürmer","Pressender OM"];
const LIST_BASE = {};                     // listName → {key: baseKey}
const STAY_HIGH = new Set(DEFAULT_STAY_HIGH);
const BUILTIN_LISTS = JSON.parse(JSON.stringify({
  keyed: Object.fromEntries(Object.entries(KEYED_LISTS).map(([n,d])=>[n, Object.entries(d.target).map(([key,label])=>({key, label, base:key}))])),
  labels: Object.fromEntries(Object.entries(LABEL_LISTS).map(([n,d])=>[n, d.target.slice()])),
  rolesIP: ROLES_IP, rolesOOP: ROLES_OOP, stayHigh: DEFAULT_STAY_HIGH
}));
const listBase = (name, key) => (LIST_BASE[name] && LIST_BASE[name][key]) || key;
const isBuiltinKey = (name, key) => BUILTIN_LISTS.keyed[name].some(e=>e.key === key);

/** Repairs a lists object: built-ins always present, own entries unique, bases valid, no empty lists. */
function sanitizeLists(raw){
  const r = (raw && typeof raw === "object") ? raw : {};
  const out = {keyed:{}, labels:{}, rolesIP:{}, rolesOOP:{}, stayHigh:[]};
  Object.keys(KEYED_LISTS).forEach(name=>{
    const src = Array.isArray(r.keyed && r.keyed[name]) ? r.keyed[name] : [];
    const builtins = BUILTIN_LISTS.keyed[name];
    if(KEYED_LISTS[name].fixed){
      out.keyed[name] = builtins.map(b=>{
        const e = src.find(x=>x && x.key === b.key);
        const label = e ? String(e.label == null ? "" : e.label).trim().slice(0,40) : "";
        return {key:b.key, label: label || b.label, base:b.key};
      });
      return;
    }
    const seen = new Set(), list = [];
    src.forEach(e=>{
      if(!e || typeof e !== "object" || typeof e.key !== "string" || seen.has(e.key)) return;
      const bi = builtins.find(b=>b.key === e.key);
      const label = String(e.label == null ? "" : e.label).trim().slice(0,40) || (bi ? bi.label : "");
      if(!label) return;
      const base = bi ? bi.key : (builtins.some(b=>b.key === e.base) ? e.base : builtins[0].key);
      seen.add(e.key); list.push({key:e.key, label, base});
    });
    builtins.forEach(b=>{ if(!seen.has(b.key)) list.push(Object.assign({}, b)); });   // never lose a built-in
    out.keyed[name] = list;
  });
  Object.keys(LABEL_LISTS).forEach(name=>{
    const src = Array.isArray(r.labels && r.labels[name]) ? r.labels[name] : [];
    const list = [...new Set(src.map(x=>String(x == null ? "" : x).trim().slice(0,40)).filter(Boolean))];
    out.labels[name] = list.length ? list : BUILTIN_LISTS.labels[name].slice();
  });
  ["rolesIP","rolesOOP"].forEach(k=>{
    POS_LIST.forEach(cat=>{
      const src = r[k] && Array.isArray(r[k][cat]) ? r[k][cat] : [];
      let list = [...new Set(src.map(x=>String(x == null ? "" : x).trim().slice(0,40)).filter(Boolean))];
      // 12.0: the pre-FM26 default names are replaced by the FM26 list; own additions stay (appended)
      const oldDef = (k === "rolesIP" ? ROLES_IP_OLD : ROLES_OOP_OLD)[cat];
      if(list.length && list.some(x=>oldDef.includes(x)) && !list.some(x=>BUILTIN_LISTS[k][cat].includes(x) && !oldDef.includes(x))){
        const own = list.filter(x=>!oldDef.includes(x) && !BUILTIN_LISTS[k][cat].includes(x));
        list = BUILTIN_LISTS[k][cat].concat(own);
      }
      out[k][cat] = list.length ? list : BUILTIN_LISTS[k][cat].slice();
    });
  });
  const allOOP = new Set(Object.values(out.rolesOOP).flat());
  let sh = Array.isArray(r.stayHigh) ? r.stayHigh : BUILTIN_LISTS.stayHigh;
  if(sh.some(x=>DEFAULT_STAY_HIGH_OLD.includes(x))) sh = BUILTIN_LISTS.stayHigh.concat(sh.filter(x=>!DEFAULT_STAY_HIGH_OLD.includes(x)));   // 12.0
  out.stayHigh = [...new Set(sh)].filter(x=>allOOP.has(x));
  return out;
}
/** Writes the lists into the shared constants (in place, so existing references stay valid). */
function applyLists(lists){
  Object.entries(KEYED_LISTS).forEach(([name, def])=>{
    Object.keys(def.target).forEach(k=>delete def.target[k]);
    LIST_BASE[name] = {};
    lists.keyed[name].forEach(e=>{ def.target[e.key] = e.label; LIST_BASE[name][e.key] = e.base; });
  });
  SQUAD_ROLE_ORDER.length = 0; lists.keyed.squadRoles.forEach(e=>SQUAD_ROLE_ORDER.push(e.key));
  UNAVAILABLE.length = 0; lists.keyed.status.forEach(e=>{ if(["injured","suspended","ineligible"].includes(e.base)) UNAVAILABLE.push(e.key); });
  Object.entries(LABEL_LISTS).forEach(([name, def])=>{ def.target.length = 0; lists.labels[name].forEach(x=>def.target.push(x)); });
  POS_LIST.forEach(cat=>{
    ROLES_IP[cat] = lists.rolesIP[cat].slice();
    ROLES_OOP[cat] = lists.rolesOOP[cat].slice();
  });
  STAY_HIGH.clear(); lists.stayHigh.forEach(x=>STAY_HIGH.add(x));
  // set pieces keep their geometry objects – only the displayed names follow the list
  try{
    SP_TYPES.forEach(t=>{ if(SP_TYPE_NAMES[t.id]) t.label = SP_TYPE_NAMES[t.id]; });
    Object.keys(SP_ZONES).forEach(z=>{ if(SP_ZONE_NAMES[z]) SP_ZONES[z].label = SP_ZONE_NAMES[z]; });
  }catch(e){ /* not defined yet during start-up */ }
}
function defaultListsForNewSave(){ const d = readJSON(LISTS_DEFAULT_KEY); return sanitizeLists(d && typeof d === "object" ? d : null); }

/* ---------- where are list values used? (for counts, renames, deletions) ---------- */
function keyedUses(name){
  switch(name){
    case "squadRoles": return state.players.map(o=>[o,"squadRole"]);
    case "status":     return state.players.map(o=>[o,"status"]);
    case "scoutStatus":return state.scouting.map(o=>[o,"status"]);
    case "saleStatus": return state.sales.map(o=>[o,"status"]);
    case "goalStatus": return state.boardGoals.map(o=>[o,"status"]).concat(state.seasons.flatMap(se=>se.goals.map(g=>[g,"status"])));
    case "pathways":   return state.prospects.map(o=>[o,"pathway"]);
    case "loanClauses":return state.loans.map(o=>[o,"clause"]);
    case "playtime":   return state.loans.map(o=>[o,"playtime"]);
    case "venues":     return [[state.nextMatch,"venue"]].concat(state.results.map(o=>[o,"venue"]));
    case "priorities": return state.scouting.map(o=>[{v:String(o.priority)},"v"]);
    case "posNames":   return state.players.map(o=>[o,"pos"]);
  }
  return [];
}
function labelUses(name){
  if(name === "grades") return state.scouting.map(o=>[o,"grade"]);
  if(name === "goalCats") return state.boardGoals.map(o=>[o,"category"]);
  return [];
}
/** Every line-up slot of every plan and formation whose position category is `cat`. */
function roleSlots(cat){
  const out = [];
  state.plans.forEach(pl=>{
    const b = planBlock(pl.id);
    Object.entries(b.tactics).forEach(([f, t])=>{
      const defs = formationDefs(f, b);
      Object.entries(t.slots).forEach(([i, sl])=>{ if(defs[i] && defs[i].cat === cat) out.push(sl); });
    });
  });
  return out;
}
function countUses(kind, name, value, cat){
  if(kind === "keyed") return keyedUses(name).filter(([o,f])=>o[f] === value).length;
  if(kind === "labels") return labelUses(name).filter(([o,f])=>o[f] === value).length;
  const field = kind === "rolesIP" ? "roleIn" : "roleOut";
  return roleSlots(cat).filter(sl=>sl[field] === value).length;
}
function replaceUses(kind, name, from, to, cat){
  if(kind === "keyed") keyedUses(name).forEach(([o,f])=>{ if(o[f] === from) o[f] = to; });
  else if(kind === "labels") labelUses(name).forEach(([o,f])=>{ if(o[f] === from) o[f] = to; });
  else { const field = kind === "rolesIP" ? "roleIn" : "roleOut"; roleSlots(cat).forEach(sl=>{ if(sl[field] === from) sl[field] = to; }); }
}
/** After any list edit: keep lists valid, re-apply, repair data, save and re-render. */
function commitLists(msg){
  state.lists = sanitizeLists(state.lists);
  state = sanitizeState(state);
  saveState(); renderAll();
  if(adminVisible()) renderAdmin();
  if(msg) toast(msg);
}
const ACCENTS = ["#4f8cff","#3ddc97","#ff5d6c","#ffb84d","#b57bff","#2ec5d3","#ff7ac6"];

/* ---------- Formations (x/y in % of pitch; y=0 opponent goal, y=100 own goal) ---------- */
const FORMATIONS = {
  "4-3-3": [
    {cat:"TW",x:50,y:92},
    {cat:"LV",x:15,y:74},{cat:"IV",x:37,y:79},{cat:"IV",x:63,y:79},{cat:"RV",x:85,y:74},
    {cat:"DM",x:50,y:61},{cat:"ZM",x:31,y:50},{cat:"ZM",x:69,y:50},
    {cat:"LF",x:17,y:25},{cat:"ST",x:50,y:16},{cat:"RF",x:83,y:25}
  ],
  "4-2-3-1": [
    {cat:"TW",x:50,y:92},
    {cat:"LV",x:15,y:74},{cat:"IV",x:37,y:79},{cat:"IV",x:63,y:79},{cat:"RV",x:85,y:74},
    {cat:"DM",x:37,y:60},{cat:"DM",x:63,y:60},
    {cat:"LF",x:18,y:35},{cat:"OM",x:50,y:36},{cat:"RF",x:82,y:35},
    {cat:"ST",x:50,y:15}
  ],
  "3-4-2-1": [
    {cat:"TW",x:50,y:92},
    {cat:"IV",x:28,y:78},{cat:"IV",x:50,y:81},{cat:"IV",x:72,y:78},
    {cat:"LV",x:12,y:53},{cat:"ZM",x:38,y:57},{cat:"ZM",x:62,y:57},{cat:"RV",x:88,y:53},
    {cat:"OM",x:35,y:32},{cat:"OM",x:65,y:32},
    {cat:"ST",x:50,y:15}
  ],
  "4-4-2": [
    {cat:"TW",x:50,y:92},
    {cat:"LV",x:15,y:74},{cat:"IV",x:37,y:79},{cat:"IV",x:63,y:79},{cat:"RV",x:85,y:74},
    {cat:"LF",x:14,y:48},{cat:"ZM",x:38,y:53},{cat:"ZM",x:62,y:53},{cat:"RF",x:86,y:48},
    {cat:"ST",x:39,y:20},{cat:"ST",x:61,y:20}
  ],
  "3-5-2": [
    {cat:"TW",x:50,y:92},
    {cat:"IV",x:28,y:78},{cat:"IV",x:50,y:81},{cat:"IV",x:72,y:78},
    {cat:"LV",x:10,y:50},{cat:"ZM",x:32,y:50},{cat:"DM",x:50,y:61},{cat:"ZM",x:68,y:50},{cat:"RV",x:90,y:50},
    {cat:"ST",x:39,y:20},{cat:"ST",x:61,y:20}
  ],
  "4-1-4-1": [
    {cat:"TW",x:50,y:92},
    {cat:"LV",x:15,y:74},{cat:"IV",x:37,y:79},{cat:"IV",x:63,y:79},{cat:"RV",x:85,y:74},
    {cat:"DM",x:50,y:62},
    {cat:"LF",x:15,y:40},{cat:"ZM",x:37,y:45},{cat:"ZM",x:63,y:45},{cat:"RF",x:85,y:40},
    {cat:"ST",x:50,y:16}
  ],
  "5-2-3": [
    {cat:"TW",x:50,y:92},
    {cat:"LV",x:10,y:68},{cat:"IV",x:30,y:78},{cat:"IV",x:50,y:81},{cat:"IV",x:70,y:78},{cat:"RV",x:90,y:68},
    {cat:"ZM",x:37,y:55},{cat:"ZM",x:63,y:55},
    {cat:"LF",x:20,y:26},{cat:"ST",x:50,y:17},{cat:"RF",x:80,y:26}
  ]
};

/* ---------- Free formation (FotMob-style) ---------- */
const FREE = "Frei";

/** Slot definitions for a formation name; "Frei" uses the saved custom coordinates. */
function formationDefs(f, s){
  s = s || state;
  if(f === FREE) return (s && s.customFormation) ? s.customFormation.slots : FORMATIONS["4-3-3"];
  return FORMATIONS[f] || FORMATIONS["4-3-3"];
}
function allFormationKeys(s){ return Object.keys(FORMATIONS).concat(s && s.customFormation ? [FREE] : []); }

/** Position label from pitch coordinates (x: 0 left → 100 right, y: 0 opponent goal → 100 own goal). */
function catFromCoords(x, y){
  const side = x < 27 ? "L" : x > 73 ? "R" : null;
  if(y >= 64) return side ? side+"V" : "IV";
  if(y >= 56) return side ? side+"V" : "DM";
  if(y >= 40) return side ? (y >= 52 ? side+"V" : side+"F") : "ZM";
  if(y >= 25) return side ? side+"F" : "OM";
  return side ? side+"F" : "ST";
}

/** Reads the shape from the outfield players' depth, e.g. "4-1-2-3" (new line after a gap > 10%). */
function shapeString(defs){
  const ys = defs.filter(d=>d.cat !== "TW").map(d=>d.y).sort((a,b)=>b-a);
  if(!ys.length) return "";
  const lines = [1];
  for(let i=1;i<ys.length;i++){ if(ys[i-1]-ys[i] > 10) lines.push(1); else lines[lines.length-1]++; }
  return lines.join("-");
}
function formationLabel(f, s){
  s = s || state;
  return f === FREE ? `Frei · ${shapeString(formationDefs(FREE, s))}` : f;
}

/* ---------- Set pieces ---------- */
// Board: viewBox 0 0 400 300, goal line at top (y=20), goal centered at x=200.
const SP_ZONES = {
  near:  {label:"Erster Pfosten", x:148, y:64},
  keeper:{label:"Torwart stören", x:200, y:40},
  far:   {label:"Zweiter Pfosten", x:266, y:72},
  center:{label:"Torraum Mitte",  x:206, y:108},
  edge:  {label:"Rückraum",       x:200, y:182},
  short: {label:"Kurz anbieten",  x:58,  y:44},
  guard1:{label:"Absicherung 1",  x:120, y:258},
  guard2:{label:"Absicherung 2",  x:280, y:258}
};
const SP_TYPES = [
  {id:"cornerL",   label:"Ecke links",        taker:{x:16,y:30},    mirror:false, zones:["near","far","center","keeper","edge","short","guard1","guard2"]},
  {id:"cornerR",   label:"Ecke rechts",       taker:{x:384,y:30},  mirror:true,  zones:["near","far","center","keeper","edge","short","guard1","guard2"]},
  {id:"fkWide",    label:"Freistoß Flanke",   taker:{x:52,y:176},  mirror:false, zones:["near","far","center","edge","guard1","guard2"]},
  {id:"fkDirect",  label:"Freistoß direkt",   taker:{x:200,y:222}, mirror:false, zones:["guard1","guard2"]},
  {id:"throwLong", label:"Langer Einwurf",    taker:{x:16,y:120},    mirror:false, zones:["near","center","far","edge","guard1"]}
];

/* ==========================================================================
   DEFAULT / SAMPLE DATA (fictional names only)
   ========================================================================== */
const SAMPLE_SQUAD = [
  // name, pos, altPos, age, salary/Mon, contract, squadRole, rating, status
  ["Jonas Lindqvist","TW",[],29,62000,2029,"key",4,""],
  ["Mats Böhringer","TW",[],33,24000,2027,"backup",3,""],
  ["Aurelien Faye","IV",["DM"],27,78000,2028,"key",5,""],
  ["Dario Kessel","IV",[],24,52000,2030,"first",4,"injured"],
  ["Tobias Wendland","IV",["RV"],31,41000,2027,"rotation",3,""],
  ["Emre Yıldız","IV",[],20,14000,2029,"prospect",3,""],
  ["Luca Ferro","LV",["LF"],26,46000,2028,"first",4,""],
  ["Nils Hammar","RV",["IV"],28,44000,2027,"first",3,""],
  ["Kofi Mensah","RV",["RF"],22,21000,2028,"rotation",3,""],
  ["Henrik Arvidsson","DM",["ZM"],30,70000,2027,"key",4,"suspended"],
  ["Pablo Serrano","DM",["IV"],25,39000,2029,"rotation",3,""],
  ["Maximilian Roth","ZM",["DM","OM"],26,58000,2029,"first",4,""],
  ["Yannick Dufour","ZM",["OM"],23,35000,2028,"first",4,""],
  ["Felix Arnold","ZM",[],32,49000,2027,"sell",2,"unhappy"],
  ["Samu Laine","OM",["ZM","RF"],21,26000,2030,"rotation",4,""],
  ["Rafael Couto","LF",["RF","ST"],24,64000,2029,"key",5,""],
  ["Ilias Benali","RF",["LF"],27,55000,2028,"first",4,""],
  ["Tim Oberländer","RF",[],19,9000,2029,"prospect",3,"ineligible"],
  ["Viktor Hrubeš","ST",[],28,82000,2028,"key",5,""],
  ["Jamal Okonkwo","ST",["LF"],23,38000,2027,"rotation",3,""]
];

// Day/month of birth per sample player; the year follows from the age on 12.03.2027.
// Two birthdays sit right after the sample date so "+1 Tag" shows the feature immediately.
const SAMPLE_BIRTHDAYS = ["07-21","11-02","01-30","09-14","04-08","05-19","12-11","03-13","08-03","02-26",
  "10-17","06-05","03-15","12-29","04-22","01-09","09-30","05-01","03-20","11-24"];
function buildPlayersFromSample(){
  return SAMPLE_SQUAD.map(([name,pos,altPos,age,salary,contractUntil,squadRole,rating,status], i)=>{
    const md = SAMPLE_BIRTHDAYS[i];
    const year = 2027 - age - (md > "03-12" ? 1 : 0);
    return {id:uid(), name, pos, altPos:[...altPos], age, birthDate:`${year}-${md}`, salary: salary*12, contractUntil, squadRole, rating, status, note:""};  // sample list is per month → per year
  });
}

function emptySetPieces(){
  const sp = {};
  SP_TYPES.forEach(t=>{ sp[t.id] = {taker:null, zones:{}}; });
  return sp;
}

function buildDefaultState(){
  const players = buildPlayersFromSample();
  const byName = n => (players.find(p=>p.name===n) || {}).id || null;
  const s = {
    version: SCHEMA_VERSION,
    club: {
      name:"FC Unity", crest:"FCU", accent:"#4f8cff",
      ingameDate:"2027-03-12", season:"2026/27",
      wageBudget: 13000000,     // gesamtes Gehaltsbudget pro Jahr (wie in FM)
      wageUnit: "year", numberFormat: "dot", moneyDisplay: "short",
      transferBudget: 30000000,
      salesShare: 75,           // % der Verkaufserlöse, die der Vorstand fürs Transferbudget freigibt
      windows: Object.assign({}, DEFAULT_WINDOWS)
    },
    formationName:"4-3-3",
    phase:"in",
    tactics:{},
    customFormation:null,
    plans:null, activePlanId:null,
    lists: defaultListsForNewSave(),
    players,
    scouting:[
      {id:uid(), name:"Léo Ferreira", pos:"ST", age:20, grade:"A", status:"negotiating", fee:14000000, bonus:800000, wage:52000, priority:3, note:"Ausstiegsklausel prüfen"},
      {id:uid(), name:"Daniel Okafor", pos:"LF", age:22, grade:"B", status:"watched", fee:9000000, bonus:300000, wage:34000, priority:2, note:""},
      {id:uid(), name:"Stefan Krantz", pos:"DM", age:24, grade:"A+", status:"watched", fee:16500000, bonus:1000000, wage:61000, priority:3, note:"Nachfolger Arvidsson"},
      {id:uid(), name:"Pedro Villalobos", pos:"IV", age:19, grade:"C", status:"watched", fee:3200000, bonus:150000, wage:12000, priority:1, note:""},
      {id:uid(), name:"Rui Almeida", pos:"RV", age:26, grade:"B", status:"fixed", fee:7000000, bonus:200000, wage:30000, priority:2, note:"Wechsel im Sommer"}
    ],
    prospects:[
      {id:uid(), name:"Noah Brückner", pos:"ZM", age:17, current:2, potential:5, pathway:"u19", focus:"Passspiel, Übersicht", readyBy:"2028/29", note:""},
      {id:uid(), name:"Adam Sýkora", pos:"IV", age:18, current:2, potential:4, pathway:"loan", focus:"Zweikampf, Kopfball", readyBy:"2028/29", note:"Leihe 2. Liga suchen"},
      {id:uid(), name:"Milo Richter", pos:"LF", age:16, current:1, potential:4, pathway:"u19", focus:"Dribbling", readyBy:"2029/30", note:""}
    ],
    loans:[
      {id:uid(), name:"Ben Achterberg", pos:"OM", age:20, club:"SV Hafenstadt", league:"2. Liga", until:"06/2027", apps:21, minutes:1420, playtime:"good", clause:"recall", recallCheck:false, note:"Stammspieler dort"},
      {id:uid(), name:"Karim Haddad", pos:"TW", age:21, club:"FC Bergtal", league:"3. Liga", until:"06/2027", apps:3, minutes:270, playtime:"bad", clause:"recall", recallCheck:true, note:"Kaum Spielzeit · " + LOAN_BAD_NOTE}
    ],
    boardGoals:[
      {id:uid(), title:"Einzug in die Europapokal-Plätze", category:"Liga", target:"Platz 1–6", current:"Platz 5", status:"track"},
      {id:uid(), title:"Pokal-Viertelfinale erreichen", category:"Pokal", target:"Viertelfinale", current:"Viertelfinale", status:"done"},
      {id:uid(), title:"Gehaltsbudget einhalten", category:"Finanzen", target:"≤ Budget", current:"knapp", status:"risk"},
      {id:uid(), title:"Zwei Eigengewächse in den Profikader", category:"Jugend", target:"2 Spieler", current:"1 Spieler", status:"track"}
    ],
    nextMatch:{
      opponent:"SV Stahl Blau", competition:"Liga, 26. Spieltag", date:"2027-03-15", venue:"A",
      formation:"4-2-3-1", keyThreat:"Zehner mit starkem linken Fuß – eng begleiten", planId:"", subs:[],
      matchplan:"Hohes Pressing in den ersten 20 Minuten.\nBreite über die Außenverteidiger, Flanken in den Rückraum.\nAb 60. Minute: Joker über rechts.",
      weaknesses:"Langsame Innenverteidigung bei Bällen hinter die Kette.\nRechter Sechser verlässt oft seine Position."
    },
    results:[],   // filled below once the plans exist
    sales:[],     // filled below (needs player ids)
    balanceLog:[
      {id:uid(), date:"2026-07-01", amount:24500000, note:"Saisonstart"},
      {id:uid(), date:"2026-08-31", amount:17900000, note:"Nach Sommerfenster"},
      {id:uid(), date:"2026-10-31", amount:19300000, note:""},
      {id:uid(), date:"2026-12-31", amount:21800000, note:"Pokal-Prämien"},
      {id:uid(), date:"2027-01-31", amount:22400000, note:"Nach Winterfenster"},
      {id:uid(), date:"2027-02-28", amount:21600000, note:""}
    ],
    transferLog:[
      {id:uid(), date:"2026-07-14", type:"in",  name:"Rafael Couto",   pos:"LF", fee:12500000, club:"CD Almaraz",     season:"2026/27"},
      {id:uid(), date:"2026-07-28", type:"in",  name:"Samu Laine",     pos:"OM", fee:3200000,  club:"FC Kuusikko",    season:"2026/27"},
      {id:uid(), date:"2026-08-19", type:"out", name:"Marco Lenz",     pos:"ZM", fee:6800000,  club:"Olympique Varenne", season:"2026/27"},
      {id:uid(), date:"2027-01-22", type:"out", name:"Dennis Hollwig", pos:"ST", fee:1900000,  club:"SC Talstadt",    season:"2026/27"}
    ],
    setPieces: emptySetPieces(),
    penaltyOrder:[],
    todos:[
      {id:uid(), text:"Vertrag Arvidsson: Verlängerung oder Verkauf im Sommer entscheiden", done:false},
      {id:uid(), text:"Neuen Standardtrainer suchen", done:false},
      {id:uid(), text:"Leihe für Adam Sýkora organisieren", done:false},
      {id:uid(), text:"Emre Yıldız zur U23 hochstufen", done:true}
    ],
    notes:"Spielidee: Ballbesitz mit schnellem Umschalten nach Ballverlust.\n\nSommer 2027: DM und LF verstärken, Gehaltsstruktur entlasten (Arnold abgeben).\n\nJugend: Brückner ab 2028 schrittweise an die erste Elf heranführen.",
    seasons:[
      {id:uid(), season:"2025/26", position:"8.", summary:"Übergangssaison nach Trainerwechsel. Umstellung auf 4-3-3 hat sich in der Rückrunde ausgezahlt.", goals:[{title:"Klassenerhalt sichern", status:"done"}], squadSize:24, avgAge:26.1, closedAt:"2026-06-30"}
    ],
    ui:{ showLinks:true, includeWatched:false, tacticsTab:"formation", devTab:"prospects", spType:"cornerL" }
  };

  // sample line-up & set pieces
  autoFillXI(s, "4-3-3");

  s.scouting.forEach(t=>{ t.wage *= 12; });   // sample wages are written per month → store per year

  // Two tactic plans so the tactic record ("Taktik-Bilanz") has something to compare.
  const planA = uid(), planB = uid();
  const blockB = {players:s.players, tactics:{}, customFormation:null};
  autoFillXI(blockB, "4-2-3-1");
  s.plans = [{id:planA, name:"Plan A", data:null},
             {id:planB, name:"Plan B", data:{formationName:"4-2-3-1", tactics:blockB.tactics, customFormation:null}}];
  s.activePlanId = planA;
  const R = (date, opponent, venue, gf, ga, plan, oppFormation) => ({id:uid(), date, opponent, competition:"Liga", venue, gf, ga,
    planId: plan === "A" ? planA : planB, planName:"Plan "+plan, formation: plan === "A" ? "4-3-3" : "4-2-3-1", oppFormation, season:"2026/27"});
  s.results = [
    R("2027-03-08","Rapid Nord","H",3,1,"A","4-4-2"),
    R("2027-03-01","Blau-Weiß 04","A",2,0,"B","3-5-2"),
    R("2027-02-22","TSV Kirchberg","H",1,1,"A","3-4-2-1"),
    R("2027-02-15","1. FC Rhein","A",0,2,"A","3-5-2"),
    R("2027-02-08","SC Talstadt","H",4,2,"A","4-2-3-1"),
    R("2027-02-01","FC Nordstern","A",1,0,"B","5-3-2"),
    R("2027-01-25","VfR Seeberg","H",2,2,"B","4-4-2"),
    R("2027-01-18","Eintracht Moorfeld","A",0,1,"A","3-4-3")
  ];
  const sp = s.setPieces;
  sp.cornerL.taker = byName("Maximilian Roth");
  sp.cornerR.taker = byName("Ilias Benali");
  Object.assign(sp.cornerL.zones, {near:byName("Viktor Hrubeš"), far:byName("Aurelien Faye"), center:byName("Nils Hammar"), edge:byName("Yannick Dufour"), guard1:byName("Luca Ferro"), guard2:byName("Rafael Couto")});
  Object.assign(sp.cornerR.zones, {near:byName("Viktor Hrubeš"), far:byName("Aurelien Faye"), center:byName("Nils Hammar"), edge:byName("Maximilian Roth"), guard1:byName("Luca Ferro"), guard2:byName("Rafael Couto")});
  sp.fkDirect.taker = byName("Rafael Couto");
  s.sales = [
    {id:uid(), playerId:byName("Felix Arnold"),   price:2500000, status:"offer",  note:"Angebot aus der 2. Liga"},
    {id:uid(), playerId:byName("Jamal Okonkwo"),  price:4000000, status:"listed", note:"Nur bei gutem Angebot"}
  ];
  s.history = {};
  // sample history: rating + wage only – transfer values stay a feature of the FM import (column hidden in the demo)
  const H = (name, pts) => { const id = byName(name); if(id) s.history[id] = pts.map(([d,r,sal])=>({d, r, s:sal, vmin:0, vmax:0})); };
  H("Rafael Couto",   [["2026-07-14",4,768000],["2026-11-02",4,768000],["2027-02-20",5,768000]]);
  H("Samu Laine",     [["2026-07-28",3,240000],["2026-12-15",4,312000]]);
  H("Felix Arnold",   [["2026-07-01",3,588000],["2026-10-10",2,588000]]);
  s.penaltyOrder = [byName("Viktor Hrubeš"), byName("Rafael Couto"), byName("Maximilian Roth"), byName("Ilias Benali"), byName("Aurelien Faye")];
  return s;
}

/** New state that has already been through sanitizing, so every field (plans, birth dates …) exists. */
function freshState(kind){ return sanitizeState(kind === "sample" ? buildDefaultState() : buildEmptyState()); }

function buildEmptyState(){
  return {
    version: SCHEMA_VERSION,
    club:{ name:"Neuer Verein", crest:"NV", accent:"#4f8cff", ingameDate:"2026-07-01", season:"2026/27", wageBudget:0, transferBudget:0, wageUnit:"year", numberFormat:"dot", moneyDisplay:"short" },
    formationName:"4-3-3", phase:"in", tactics:{}, customFormation:null, lists: defaultListsForNewSave(),
    players:[], scouting:[], prospects:[], loans:[], boardGoals:[],
    nextMatch:{ opponent:"", competition:"", date:"", venue:"H", formation:"", keyThreat:"", matchplan:"", weaknesses:"", planId:"", subs:[] },
    results:[],
    setPieces: emptySetPieces(), penaltyOrder:[],
    todos:[], notes:"", seasons:[],
    ui:{ showLinks:true, includeWatched:false, tacticsTab:"formation", devTab:"prospects", spType:"cornerL" }
  };
}

/* ==========================================================================
   MIGRATION & SANITIZING
   ========================================================================== */
function defaultSlot(cat){ return {playerId:null, roleIn:ROLES_IP[cat][0], roleOut:ROLES_OOP[cat][0]}; }

/**
 * Upgrades any older state to SCHEMA_VERSION. Each step only adds/reshapes
 * what that version introduced, so old saves keep all their user data.
 */
function migrateState(raw){
  const s = (raw && typeof raw === "object") ? raw : {};
  let v = num(s.version, 1);

  if(v < 2){
    // v1 -> v2: explicit version, guaranteed containers.
    s.players = Array.isArray(s.players) ? s.players : [];
    s.scouting = Array.isArray(s.scouting) ? s.scouting : [];
    s.todos = Array.isArray(s.todos) ? s.todos : [];
    v = 2;
  }

  if(v < 3){
    // v2 -> v3: companion-tool focus.
    //  - drop in-game-only data (fitness, happiness, invented attributes)
    //  - lineups per formation with split in/out-of-possession roles
    //  - real in-game date, new modules
    s.club = s.club || {};
    s.club.ingameDate = normalizeDate(s.club.ingameDate);
    (s.players||[]).forEach(p=>{
      delete p.attrs; delete p.fitness; delete p.happiness; delete p.role;
      if(!SQUAD_ROLES[p.squadRole]) p.squadRole = "rotation";
      if(!p.rating) p.rating = 3;
    });
    s.tactics = {};
    const oldAssign = (s.assignments && typeof s.assignments === "object") ? s.assignments : {};
    Object.keys(oldAssign).forEach(f=>{
      if(!FORMATIONS[f]) return;
      s.tactics[f] = {slots:{}};
      Object.keys(oldAssign[f]||{}).forEach(idx=>{
        const slotDef = FORMATIONS[f][idx];
        if(!slotDef) return;
        s.tactics[f].slots[idx] = Object.assign(defaultSlot(slotDef.cat), {playerId: oldAssign[f][idx]});
      });
    });
    delete s.assignments;
    v = 3;
  }

  if(v < 4){
    // v3 -> v4: the fixed "last 5" list becomes a real results log.
    // Empty placeholders (no opponent, 0:0) were never real games → dropped.
    if(!Array.isArray(s.results)){
      s.results = (Array.isArray(s.form) ? s.form : [])
        .filter(f=>f && (String(f.opp||"").trim() || num(f.gf) || num(f.ga)))
        .map(f=>({opponent:String(f.opp||"").trim() || "Unbekannt", gf:num(f.gf), ga:num(f.ga),
                  date:"", venue:"H", competition:"", planId:"", planName:"", formation:"", oppFormation:"",
                  season: (s.club && s.club.season) || ""}));
    }
    delete s.form;
    v = 4;
  }
  if(v < 5){
    // v4 -> v5: sales list, transfer history, board share of sales, transfer windows (all new → defaults)
    v = 5;
  }
  if(v < 6){
    // v5 -> v6: wages are stored per YEAR (were per month) and the wage budget is the TOTAL budget
    // (was the remaining headroom) – headroom is now calculated from the actual squad wages.
    s.club = s.club || {};
    const players = Array.isArray(s.players) ? s.players : [];
    const monthlySum = players.reduce((a,p)=>a + Math.max(0, num(p && p.salary)), 0);
    players.forEach(p=>{ if(p) p.salary = Math.round(Math.max(0, num(p.salary)) * 12); });
    (Array.isArray(s.scouting) ? s.scouting : []).forEach(t=>{ if(t) t.wage = Math.round(Math.max(0, num(t.wage)) * 12); });
    if(s.club.wageBudget === undefined) s.club.wageBudget = Math.round((num(s.club.salaryBudget) + monthlySum) * 12);
    delete s.club.salaryBudget;
    v = 6;
  }

  s.version = SCHEMA_VERSION;
  return sanitizeState(s);
}

/**
 * Guarantees every field has the right type. Runs after every load/import,
 * so partially broken data never crashes the UI.
 */
function sanitizeState(s){
  s.lists = sanitizeLists(s.lists);   // must come first: values below are validated against these lists
  applyLists(s.lists);
  const d = buildEmptyState();
  const arr = v => Array.isArray(v) ? v.filter(x=>x && typeof x === "object") : [];
  const str = (v, f="") => typeof v === "string" ? v : (v == null ? f : String(v));

  s.club = Object.assign({}, d.club, (s.club && typeof s.club === "object") ? s.club : {});
  s.club.name = str(s.club.name, "Verein").trim() || "Verein";
  s.club.crest = str(s.club.crest, "FC").slice(0,3) || "FC";
  s.club.accent = /^#[0-9a-f]{6}$/i.test(s.club.accent) ? s.club.accent : "#4f8cff";
  s.club.ingameDate = normalizeDate(s.club.ingameDate, d.club.ingameDate);
  s.club.season = str(s.club.season, d.club.season);
  s.club.wageBudget = Math.max(0, num(s.club.wageBudget));      // total wage budget per year
  delete s.club.salaryBudget;
  s.club.wageUnit = WAGE_UNITS[s.club.wageUnit] ? s.club.wageUnit : "year";
  s.club.numberFormat = s.club.numberFormat === "comma" ? "comma" : "dot";
  s.club.moneyDisplay = s.club.moneyDisplay === "full" ? "full" : "short";
  s.club.transferBudget = num(s.club.transferBudget);
  s.club.salesShare = clamp(Math.round(num(s.club.salesShare, 100)), 0, 100);
  const win = (s.club.windows && typeof s.club.windows === "object") ? s.club.windows : {};
  s.club.windows = {
    summer: parseWindow(win.summer) ? str(win.summer) : DEFAULT_WINDOWS.summer,
    winter: parseWindow(win.winter) ? str(win.winter) : DEFAULT_WINDOWS.winter
  };

  s.phase = ["out","both","split"].includes(s.phase) ? s.phase : "in";     // 12.7: "both" = combined, "split" = two pitches
  // 12.7: matchday bench (per save) – only used when a bench size is set
  s.bench = Array.isArray(s.bench) ? [...new Set(s.bench.filter(id=>typeof id === "string" && (s.players || []).some(p=>p.id === id)))] : [];

  s.customFields = sanitizeCustomFields(s.customFields);
  const cfd = s.customFields;
  const refDate = parseISO(s.club.ingameDate);
  s.players = arr(s.players).map(p=>({
    id: str(p.id) || uid(),
    name: str(p.name, "Unbenannt").trim() || "Unbenannt",
    pos: POS_LIST.includes(p.pos) ? p.pos : "ZM",
    altPos: Array.isArray(p.altPos) ? p.altPos.filter(x=>POS_LIST.includes(x) && x !== p.pos) : [],
    birthDate: parseISO(p.birthDate) ? p.birthDate : "",
    // with a birth date the age is always derived from the in-game date
    age: clamp(parseISO(p.birthDate) ? ageOn(p.birthDate, refDate) : num(p.age, 20), 14, 45),
    salary: Math.max(0, num(p.salary)),
    contractUntil: clamp(Math.round(num(p.contractUntil, 2027)), 2000, 2100),
    squadRole: SQUAD_ROLES[p.squadRole] ? p.squadRole : "rotation",
    rating: clamp(Math.round(num(p.rating, 3)), 1, 5),
    status: STATUS[p.status] !== undefined ? p.status : "",
    note: str(p.note),
    nation: str(p.nation).trim().slice(0,40),                        // Land / Nationalität (aus FM-Import oder von Hand)
    valueMin: Math.max(0, Math.round(num(p.valueMin))),              // Transferwert (FM zeigt oft eine Spanne)
    valueMax: Math.max(0, Math.round(num(p.valueMax, p.valueMin))),
    extendPlanned: !!p.extendPlanned,  // "Verlängerung geplant" (Zukunfts-Kader)
    bosmanAck: Math.round(num(p.bosmanAck, 0)),   // Bosman-Hinweis schon gegeben für dieses Vertragsende
    loanIn: !!p.loanIn,                            // ausgeliehen von einem anderen Verein (geht am Leihende zurück)
    homeClub: str(p.homeClub).slice(0,60), caps: Math.max(0, Math.round(num(p.caps))), intGoals: Math.max(0, Math.round(num(p.intGoals))),   // 10.0 national pool
    nominated: !!p.nominated,
    custom: sanitizeCustom(p.custom, cfd)
  }));
  const ids = new Set(s.players.map(p=>p.id));

  sanitizeTacticBlock(s, ids);

  // Tactic plans (A/B/C): the active plan lives in the top-level fields, the others in plan.data.
  const plans = arr(s.plans).map(pl=>({id: str(pl.id) || uid(), name: str(pl.name, "Plan").trim().slice(0,24) || "Plan", data: pl.data}));
  if(!plans.length) plans.push({id: uid(), name: "Plan A", data: null});
  if(!plans.some(pl=>pl.id === s.activePlanId)) s.activePlanId = plans[0].id;
  plans.forEach(pl=>{
    if(pl.id === s.activePlanId){ pl.data = null; return; }
    const block = (pl.data && typeof pl.data === "object") ? pl.data : {};
    sanitizeTacticBlock(block, ids);
    pl.data = {formationName: block.formationName, tactics: block.tactics, customFormation: block.customFormation};
  });
  s.plans = plans.slice(0, 6);

  s.scouting = arr(s.scouting).map(t=>({
    id: str(t.id) || uid(), name: str(t.name, "Unbekannt"),
    pos: POS_LIST.includes(t.pos) ? t.pos : "ZM", age: num(t.age, 20),
    grade: GRADES.includes(t.grade) ? t.grade : "B",
    status: SCOUT_STATUS[t.status] ? t.status : "watched",
    fee: Math.max(0, num(t.fee)), bonus: Math.max(0, num(t.bonus)), wage: Math.max(0, num(t.wage)),
    priority: clamp(Math.round(num(t.priority, 2)), 1, 3), note: str(t.note),
    shortlist: clamp(Math.round(num(t.shortlist, 0)), 0, 3),           // Transfer-Hub: 1./2./3. Wahl je Position (0 = keine)
    kind: t.kind === "loan" ? "loan" : "buy",                           // Kauf oder Leihe (fee = Leihgebühr)
    wageShare: clamp(Math.round(num(t.wageShare, 100)), 0, 100),        // Gehaltsanteil bei Leihe in %
    custom: sanitizeCustom(t.custom, cfd)
  }));

  s.prospects = arr(s.prospects).map(p=>({
    id: str(p.id) || uid(), name: str(p.name, "Talent"),
    pos: POS_LIST.includes(p.pos) ? p.pos : "ZM", age: num(p.age, 17),
    current: clamp(Math.round(num(p.current, 2)), 1, 5), potential: clamp(Math.round(num(p.potential, 3)), 1, 5),
    pathway: PATHWAYS[p.pathway] ? p.pathway : "u19",
    focus: str(p.focus), readyBy: str(p.readyBy), note: str(p.note)
  }));

  s.loans = arr(s.loans).map(l=>({
    id: str(l.id) || uid(), name: str(l.name, "Spieler"),
    pos: POS_LIST.includes(l.pos) ? l.pos : "ZM", age: num(l.age, 20),
    club: str(l.club), league: str(l.league), until: str(l.until),
    // "Rucksack": the complete squad record of a player loaned out from the squad → restored 1:1 on return
    player: (l.player && typeof l.player === "object" && typeof l.player.name === "string") ? l.player : null,
    playerHistory: Array.isArray(l.playerHistory) ? l.playerHistory.slice(-80) : [],
    apps: Math.max(0, num(l.apps)), minutes: Math.max(0, num(l.minutes)),      // minutes: kept for old data, no longer shown
    playtime: PLAYTIME[l.playtime] !== undefined ? l.playtime : "",
    returnPlan: ["keep","loan","sell"].includes(l.returnPlan) ? l.returnPlan : "",   // Transfer-Hub: Rückkehrer einplanen / erneut verleihen / verkaufen
    clause: LOAN_CLAUSES[l.clause] ? l.clause : "none", recallCheck: !!l.recallCheck, note: str(l.note)
  }));

  s.boardGoals = arr(s.boardGoals).map(g=>({
    id: str(g.id) || uid(), title: str(g.title, "Ziel"),
    category: GOAL_CATS.includes(g.category) ? g.category : "Sonstiges",
    target: str(g.target), current: str(g.current),
    status: GOAL_STATUS[g.status] ? g.status : "track"
  }));

  s.nextMatch = Object.assign({}, d.nextMatch, (s.nextMatch && typeof s.nextMatch === "object") ? s.nextMatch : {});
  ["opponent","competition","date","venue","formation","keyThreat","matchplan","weaknesses","planId"].forEach(k=>{ s.nextMatch[k] = str(s.nextMatch[k]); });
  if(!s.plans.some(pl=>pl.id === s.nextMatch.planId)) s.nextMatch.planId = "";
  s.nextMatch.subs = arr(s.nextMatch.subs).slice(0,5).map(x=>({
    id: str(x.id) || uid(), minute: str(x.minute).slice(0,8),
    outId: ids.has(x.outId) ? x.outId : "", inId: ids.has(x.inId) ? x.inId : "", note: str(x.note)
  }));
  if(!["H","A","N"].includes(s.nextMatch.venue)) s.nextMatch.venue = "H";
  if(s.nextMatch.date && !parseISO(s.nextMatch.date)) s.nextMatch.date = normalizeDate(s.nextMatch.date, "");

  s.sales = arr(s.sales).filter(x=>ids.has(x.playerId)).map(x=>({
    id: str(x.id) || uid(), playerId: x.playerId, price: Math.max(0, num(x.price)),
    status: SALE_STATUS[x.status] ? x.status : "listed", note: str(x.note)
  })).filter((x,i,a)=>a.findIndex(y=>y.playerId===x.playerId)===i);   // one entry per player
  s.balanceLog = arr(s.balanceLog).filter(b=>parseISO(b.date)).slice(0, 2000).map(b=>({
    id: str(b.id) || uid(), date: b.date, amount: Math.round(num(b.amount)), note: str(b.note)
  }));
  s.transferLog = arr(s.transferLog).slice(0, 1000).map(t=>({
    id: str(t.id) || uid(), date: parseISO(t.date) ? t.date : "", type: t.type === "out" ? "out" : "in",
    name: str(t.name, "Unbekannt"), pos: POS_LIST.includes(t.pos) ? t.pos : "", fee: Math.max(0, num(t.fee)),
    club: str(t.club), season: str(t.season)
  }));

  s.results = arr(s.results).slice(0, 500).map(r=>({
    id: str(r.id) || uid(),
    date: parseISO(r.date) ? r.date : "",
    opponent: str(r.opponent, "Unbekannt").trim() || "Unbekannt",
    competition: str(r.competition), venue: ["H","A","N"].includes(r.venue) ? r.venue : "H",
    gf: clamp(Math.round(num(r.gf)), 0, 99), ga: clamp(Math.round(num(r.ga)), 0, 99),
    planId: str(r.planId), planName: str(r.planName), formation: str(r.formation),
    oppFormation: str(r.oppFormation).trim(), season: str(r.season)
  }));
  delete s.form;

  const sp = (s.setPieces && typeof s.setPieces === "object") ? s.setPieces : {};
  s.setPieces = emptySetPieces();
  SP_TYPES.forEach(t=>{
    const src = sp[t.id] || {};
    s.setPieces[t.id].taker = ids.has(src.taker) ? src.taker : null;
    t.zones.forEach(z=>{
      const pid = src.zones && src.zones[z];
      if(ids.has(pid)) s.setPieces[t.id].zones[z] = pid;
    });
  });
  s.penaltyOrder = (Array.isArray(s.penaltyOrder) ? s.penaltyOrder : []).slice(0,5).map(id => ids.has(id) ? id : null);

  s.todos = arr(s.todos).map(t=>({ id: str(t.id) || uid(), text: str(t.text), done: !!t.done }));
  s.journey = sanitizeJourney(s.journey);                                  // 9.9.1: journey per save
  // 10.0: mode of the save (club | national team) + national settings + link to the partner save
  s.mode = s.mode === "national" ? "national" : "club";
  s.link = typeof s.link === "string" ? s.link : "";
  s.national = sanitizeNational(s.national);
  // Transfer-Hub: target depth ("Soll") per position – also used by the next-season warnings
  const tp = (s.transferPlan && typeof s.transferPlan === "object") ? s.transferPlan : {};
  s.transferPlan = {targets: Object.fromEntries(POS_LIST.map(pos=>{
    const v = tp.targets && tp.targets[pos] !== undefined ? Math.round(num(tp.targets[pos], NaN)) : NaN;
    return [pos, Number.isFinite(v) ? clamp(v, 0, 8) : DEFAULT_POS_NEED(pos)];
  }))};
  s.notes = str(s.notes);
  s.seasons = arr(s.seasons).map(x=>({
    id: str(x.id) || uid(), season: str(x.season), position: str(x.position), summary: str(x.summary),
    goals: arr(x.goals).map(g=>({title:str(g.title), status: GOAL_STATUS[g.status] ? g.status : "track"})),
    squadSize: num(x.squadSize), avgAge: num(x.avgAge), closedAt: str(x.closedAt),
    wages: Math.max(0, num(x.wages))                     // Gehälter/Jahr beim Saisonabschluss (ab Phase 10)
  }));
  // Gegner-Datenbank: gespeicherte Analyse je Gegner (Bilanz kommt live aus den Ergebnissen)
  s.opponents = arr(s.opponents).map(o=>({
    id: str(o.id) || uid(), name: str(o.name).trim().slice(0,60), formation: str(o.formation).slice(0,20),
    keyThreat: str(o.keyThreat), weaknesses: str(o.weaknesses), notes: str(o.notes), updatedAt: parseISO(o.updatedAt) ? o.updatedAt : ""
  })).filter(o=>o.name).filter((o,i,a)=>a.findIndex(x=>normName(x.name)===normName(o.name))===i);
  // Spielerentwicklung: Schnappschüsse {d: Spieldatum, r: Einschätzung, s: Gehalt/Jahr, vmin/vmax: Transferwert}
  const hist = (s.history && typeof s.history === "object" && !Array.isArray(s.history)) ? s.history : {};
  s.history = {};
  Object.keys(hist).forEach(id=>{
    if(!ids.has(id) || !Array.isArray(hist[id])) return;
    const list = hist[id].filter(x=>x && typeof x === "object").map(x=>({
      d: parseISO(x.d) ? x.d : "", r: clamp(Math.round(num(x.r, 3)), 1, 5), s: Math.max(0, Math.round(num(x.s))),
      vmin: Math.max(0, Math.round(num(x.vmin))), vmax: Math.max(0, Math.round(num(x.vmax)))
    })).filter(x=>x.d).slice(-80);
    if(list.length) s.history[id] = list;
  });

  const ui = (s.ui && typeof s.ui === "object") ? s.ui : {};
  s.ui = {
    showLinks: ui.showLinks !== false,
    benchSize: ui.benchSize === undefined || ui.benchSize === "all" ? "all" : Math.max(0, Math.min(23, Math.round(num(ui.benchSize)))),   // 12.7
    includeWatched: !!ui.includeWatched,
    tacticsTab: ui.tacticsTab === "setpieces" ? "setpieces" : "formation",
    devTab: ui.devTab === "loans" ? "loans" : "prospects",
    spType: SP_TYPES.some(t=>t.id===ui.spType) ? ui.spType : "cornerL",
    squadTab: ["future","contracts"].includes(ui.squadTab) ? ui.squadTab : "current",
    sampleHintDismissed: !!ui.sampleHintDismissed,
    showLoaned: ui.showLoaned !== false,                                       // squad: show players on loan (greyed out)
    transferTab: ui.transferTab === "deadline" ? "center" : ["buy","sell","history","plan","center"].includes(ui.transferTab) ? ui.transferTab : "center",
    hubWindow: ["summer","winter"].includes(ui.hubWindow) ? ui.hubWindow : "auto",
    deadline: ["on","off"].includes(ui.deadline) ? ui.deadline : "auto",          // Deadline-Day-Modus: automatisch in den letzten 3 Fenstertagen
    deadlineTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(ui.deadlineTime || "") ? ui.deadlineTime : "23:00",
    includeListed: !!ui.includeListed,
    futureUncertain: !!ui.futureUncertain
  };
  s.version = SCHEMA_VERSION;
  return s;
}

/** Repairs one tactic block {formationName, customFormation, tactics} in place (used for every plan). */
function sanitizeTacticBlock(b, ids){
  const cf = b.customFormation;
  b.customFormation = (cf && Array.isArray(cf.slots) && cf.slots.length === 11) ? {
    base: FORMATIONS[cf.base] ? cf.base : "4-3-3",
    slots: cf.slots.map((d,i)=>({
      cat: i === 0 ? "TW" : (POS_LIST.includes(d && d.cat) && d.cat !== "TW" ? d.cat : "ZM"),
      x: clamp(num(d && d.x, 50), 3, 97), y: clamp(num(d && d.y, 50), 3, 97)
    }))
  } : null;
  b.formationName = (FORMATIONS[b.formationName] || (b.formationName === FREE && b.customFormation)) ? b.formationName : "4-3-3";
  const tactics = (b.tactics && typeof b.tactics === "object") ? b.tactics : {};
  b.tactics = {};
  allFormationKeys(b).forEach(f=>{
    const src = (tactics[f] && tactics[f].slots) || {};
    const slots = {}, ipDefs = formationDefs(f, b);
    const of = oopFormOf(tactics[f]) && FORMATIONS[oopFormOf(tactics[f])].length === ipDefs.length ? oopFormOf(tactics[f]) : "";
    const oopMap = of ? (validOopMap(tactics[f].oopMap, ipDefs.length) ? Object.fromEntries(Object.entries(tactics[f].oopMap).map(([k,v])=>[k, v])) : autoOopMap(ipDefs, FORMATIONS[of])) : null;
    ipDefs.forEach((def, i)=>{
      const o = src[i];
      if(!o || typeof o !== "object") return;
      slots[i] = {
        playerId: ids.has(o.playerId) ? o.playerId : null,
        roleIn: (ROLES_IP[def.cat].includes(o.roleIn) || (of && ROLES_IP[FORMATIONS[of][oopMap[i]].cat].includes(o.roleIn))) ? o.roleIn : (mapOldRole("in", def.cat, o.roleIn, ROLES_IP[def.cat]) || ROLES_IP[def.cat][0]),
        roleOut: (oc => ROLES_OOP[oc].includes(o.roleOut) ? o.roleOut : (mapOldRole("out", oc, o.roleOut, ROLES_OOP[oc]) || ROLES_OOP[oc][0]))(of ? FORMATIONS[of][oopMap[i]].cat : def.cat)
      };
      if(o.oopPos && typeof o.oopPos === "object"){
        slots[i].oopPos = {x: clamp(num(o.oopPos.x, 50), 3, 97), y: clamp(num(o.oopPos.y, 50), 3, 97)};
      }
    });
    b.tactics[f] = of ? {slots, oopForm:of, oopMap} : {slots};
  });
  return b;
}

/**
 * Checks an imported file before anything is overwritten. Returns concrete,
 * human-readable problems instead of a generic "invalid file".
 */
function validateImportedState(obj){
  const errors = [];
  if(!obj || typeof obj !== "object" || Array.isArray(obj)){
    return {valid:false, errors:["Die Datei enthält kein gültiges JSON-Objekt."]};
  }
  if(num(obj.version, 1) > SCHEMA_VERSION){
    errors.push(`Die Datei stammt aus einer neueren Version (Schema v${obj.version}). Diese Version kann bis v${SCHEMA_VERSION} lesen.`);
  }
  if(!obj.club || typeof obj.club !== "object"){
    errors.push("Feld 'club' fehlt oder ist kein Objekt.");
  } else {
    if(typeof obj.club.name !== "string" || !obj.club.name.trim()) errors.push("Feld 'club.name' fehlt oder ist leer.");
    ["salaryBudget","wageBudget","transferBudget"].forEach(k=>{
      if(obj.club[k] !== undefined && typeof obj.club[k] !== "number") errors.push(`Feld 'club.${k}' muss eine Zahl sein.`);
    });
  }
  if(!Array.isArray(obj.players)){
    errors.push("Feld 'players' fehlt oder ist keine Liste.");
  } else {
    obj.players.forEach((p,i)=>{
      if(!p || typeof p !== "object"){ errors.push(`players[${i}] ist kein gültiges Objekt.`); return; }
      const label = typeof p.name === "string" && p.name.trim() ? `"${p.name}"` : `players[${i}]`;
      if(typeof p.name !== "string" || !p.name.trim()) errors.push(`players[${i}].name fehlt oder ist leer.`);
      if(p.pos !== undefined && !POS_LIST.includes(p.pos)) errors.push(`${label}: Position "${p.pos}" ist unbekannt (erlaubt: ${POS_LIST.join(", ")}).`);
      ["age","salary","contractUntil"].forEach(k=>{
        if(p[k] !== undefined && typeof p[k] !== "number") errors.push(`${label}: '${k}' muss eine Zahl sein.`);
      });
    });
  }
  ["scouting","todos","form","prospects","loans","boardGoals","seasons"].forEach(k=>{
    if(obj[k] !== undefined && !Array.isArray(obj[k])) errors.push(`Feld '${k}' muss eine Liste sein.`);
  });
  if(obj.formationName !== undefined && !FORMATIONS[obj.formationName] && obj.formationName !== FREE) errors.push(`Formation "${obj.formationName}" wird nicht unterstützt.`);
  const more = errors.length > 8 ? [`… und ${errors.length-8} weitere Probleme.`] : [];
  return {valid: errors.length === 0, errors: errors.slice(0,8).concat(more)};
}


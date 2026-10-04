/* ==========================================================================
   ADMIN AREA (UI)
   ========================================================================== */
let adminTab = "home";
const logFilter = {q:"", area:"", onlyRevertible:false, limit:100};
let rawColl = "players";
const ADMIN_TABS = {home:"Zentrale", backup:"Sicherung", storage:"Speicher", hotkeys:"Tastenkürzel", errors:"Fehlerprotokoll", security:"Sicherheit", changelog:"Changelog",
  overview:"Übersicht", notes:"Notizen", log:"Protokoll", restore:"Wiederherstellungspunkte", health:"Datenprüfung", maintenance:"Wartung & Batch", raw:"Rohdaten", lists:"Listen", fields:"Eigene Felder"};
const ADMIN_GLOBAL_TABS = ["home","backup","storage","hotkeys","errors","security","changelog"];

function relTime(ts){
  const m = Math.round((Date.now() - ts)/60000);
  if(m < 1) return "gerade eben";
  if(m < 60) return `vor ${m} Min.`;
  if(m < 1440) return `vor ${Math.round(m/60)} Std.`;
  const d = Math.round(m/1440);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}
const tsText = ts => new Date(ts).toLocaleString("de-DE", {day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"});

function storageUsage(){
  const cats = {saves:0, logs:0, restore:0, other:0};
  for(let i = 0; i < store.length; i++){
    const k = store.key(i); if(!k || !k.startsWith("fm27")) continue;
    const size = k.length + (store.getItem(k) || "").length;        // browsers count characters
    if(k.startsWith(SLOT_PREFIX)) cats.saves += size; else if(k.startsWith(LOG_PREFIX)) cats.logs += size;
    else if(k.startsWith(RP_PREFIX)) cats.restore += size; else cats.other += size;
  }
  const total = cats.saves + cats.logs + cats.restore + cats.other;
  return {cats, total, quota: store.quota, backend: store.mode};    // localStorage ~5 MB, IndexedDB: what the browser grants
}
const fmtBytes = b => b >= 1048576 ? fmtNum(b/1048576, 1) + " MB" : fmtNum(Math.max(1, Math.round(b/1024))) + " KB";

function renderAdmin(){
  const root = qs("#adminRoot"); if(!root) return;
  if(!hasPin()){
    root.innerHTML = `<div class="admin-gate"><div class="gate-card">
      <div class="gate-icon" aria-hidden="true">🛡</div>
      <h2>Admin-Bereich einrichten</h2>
      <p class="muted">Lege einen PIN oder ein Passwort fest (mindestens 4 Zeichen). Er gilt für alle Spielstände.</p>
      <div class="field"><label for="pinNew1">PIN / Passwort</label><input type="password" id="pinNew1" autocomplete="new-password"></div>
      <div class="field"><label for="pinNew2">Wiederholen</label><input type="password" id="pinNew2" autocomplete="new-password"></div>
      <div class="pin-msg" id="pinMsg" role="alert"></div>
      <button class="btn btn-accent" id="btnSetPin">Festlegen &amp; öffnen</button>
      <p class="hint">Der PIN schützt den Admin-Bereich vor versehentlichen Änderungen und neugierigen Mitbenutzern. Gespeichert wird nur ein gesalzener Hash, nie der PIN selbst. Da alles lokal im Browser läuft, ist er kein Schutz gegen jemanden mit Entwicklertools.</p>
    </div></div>`;
    setTimeout(()=>{ const f = qs("#pinNew1"); if(f) f.focus(); }, 20);
    return;
  }
  if(!adminUnlocked){
    root.innerHTML = `<div class="admin-gate"><div class="gate-card">
      <div class="gate-icon" aria-hidden="true">🔒</div>
      <h2>Admin-Bereich gesperrt</h2>
      <div class="field"><label for="pinInput">PIN / Passwort</label><input type="password" id="pinInput" autocomplete="current-password"></div>
      <div class="pin-msg" id="pinMsg" role="alert"></div>
      <button class="btn btn-accent" id="btnUnlock">Entsperren</button>
      <button class="btn btn-ghost btn-sm" id="btnForgotPin">PIN vergessen?</button>
    </div></div>`;
    setTimeout(()=>{ const f = qs("#pinInput"); if(f) f.focus(); }, 20);
    return;
  }
  const cfg = adminCfg();
  const sub = `${ADMIN_GLOBAL_TABS.includes(adminTab) ? "Gilt für alle Spielstände" : `Spielstand „${esc((activeSlotMeta()||{}).name || "")}“`} · 🔓 entsperrt${cfg.autoLockMin ? ` · sperrt nach ${cfg.autoLockMin} Min. ohne Aktivität` : ""}`;
    root.innerHTML = `
      <div class="adm2">
        <nav class="adm2-nav" id="adminTabs" role="tablist" aria-label="Admin-Bereiche">
          <div class="adm2-title">🛡 Admin</div>
          ${ADMIN_GROUPS.map(g=>`<div class="adm2-group ${g.save ? "save" : ""}">${esc(g.save ? `Spielstand · ${(activeSlotMeta() || {}).name || state.club.name}` : g.label)}</div>${g.tabs.map(k=>`<button role="tab" data-atab="${k}" class="${k===adminTab?"active":""}"><span class="adm2-ico" aria-hidden="true">${ADMIN_ICONS[k] || "•"}</span>${esc(ADMIN_TABS[k])}${k === "labs" ? ' ' : ""}</button>`).join("")}`).join("")}
        </nav>
        <section class="adm2-main">
          <div class="adm2-head"><div><h2>${ADMIN_ICONS[adminTab] || ""} ${esc(ADMIN_TABS[adminTab])}</h2><div class="muted small">${sub}</div></div>
            <button class="btn btn-sm" id="btnLockAdmin">🔒 Sperren</button></div>
          <div id="adminBody"></div>
        </section>
      </div>`;
  if(!ADMIN_TABS[adminTab]) adminTab = "home";
  ({home:adminHome, backup:adminBackup, storage:adminStorage, hotkeys:adminHotkeys, errors:()=>{ qs("#adminBody").innerHTML = errorLogHTML(); },
    maintenance:adminMaintenance, fields:adminFields, notes:adminNotes, changelog:adminChangelog, overview:adminOverview2, log:adminLog, restore:adminRestore, health:adminHealth, lists:adminLists, raw:adminRaw, security:adminSecurity})[adminTab]();
}

/* ---------- 11.7 (Beta): Admin-Zentrale – pages for ALL saves ---------- */
function adminHome(){
  const rows = hubAdminRows(), sums = slotSummaries(), ents = storageEntries();
  const sizeOf = id => ents.filter(e=>e.key.endsWith(id)).reduce((a,e)=>a + e.size, 0);
  const metaOf = id => slotIndex.slots.find(m=>m.id === id) || {};
  qs("#adminBody").innerHTML = `
    <div class="adm-home-tiles">${rows.map(([k,v,st])=>`<div class="adm-home-tile"><span>${esc(k)}</span><strong class="${st}">${esc(v)}</strong></div>`).join("")}
      <div class="adm-home-tile"><span>Spielstände</span><strong>${sums.length}</strong></div><div class="adm-home-tile"><span>Version</span><strong>${esc(APP_VERSION)}</strong></div></div>
    <div class="card"><div class="card-head"><h2>Alle Spielstände</h2><button class="btn btn-sm" data-adm-saves>Spielstand wechseln <kbd>S</kbd></button></div>
      <div class="table-wrap"><table class="data-table adm-saves"><thead><tr><th>Spielstand</th><th>Verein</th><th>Spieldatum</th><th>Zuletzt gespielt</th><th>Letzter Export</th><th class="num">Größe</th></tr></thead>
      <tbody>${sums.map(x=>`<tr><td><span class="adm-save-name">${smCrest(x)}<strong>${esc(x.name)}</strong>${x.active ? ' <span class="sm-badge ok">aktiv</span>' : ""}</span></td><td>${esc(x.club)}${x.mode === "national" ? " · Nationalteam" : ""}</td>
        <td>${smDate(x)}</td><td>${esc(hubWhen(metaOf(x.id).lastPlayedAt || x.updatedAt))}</td><td>${esc(hubWhen(metaOf(x.id).lastExport))}</td><td class="num">${fmtBytes(sizeOf(x.id))}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h2>Schnellzugriff</h2></div><div class="adm2-actions">
      <button class="btn btn-sm btn-accent" data-adm-go="exportAll">Alles exportieren (Umzug)</button><button class="btn btn-sm" data-adm-go="importAll">Umzugsdatei / Sicherung laden …</button>
      <button class="btn btn-sm" data-atab-go="backup">Ordner-Sicherung</button><button class="btn btn-sm" data-atab-go="storage">Speicher prüfen</button><button class="btn btn-sm" data-atab-go="errors">Fehlerprotokoll</button></div></div>`;
}
function adminBackup(){
  qs("#adminBody").innerHTML = backupCardHTML() + `
    <div class="card"><div class="card-head"><h2>Umzug &amp; Komplett-Sicherung</h2></div>
      <p class="lead" style="margin-top:0">Eine Datei mit <strong>allen Spielständen</strong>, Hub, Einstellungen und Tastenkürzeln – für einen neuen PC, einen anderen Browser oder einfach als Sicherung.</p>
      <div class="adm2-actions"><button class="btn btn-sm btn-accent" data-adm-go="exportAll">Alles exportieren</button><button class="btn btn-sm" data-adm-go="importAll">Datei laden …</button></div></div>`;
  renderFolderBackupList();
}
function adminHotkeys(){
  const map = hotkeyMap(), groups = {};
  HOTKEY_ACTIONS().forEach(a=>{ (groups[a[3]] = groups[a[3]] || []).push(a); });
  qs("#adminBody").innerHTML = `<div class="toolbar"><span class="muted">Gilt für alle Spielstände.</span><span class="spacer"></span><button class="btn btn-sm btn-accent" data-adm-go="hotkeys">Kürzel ändern …</button></div>
    ${Object.entries(groups).map(([g, list])=>`<div class="tc-sub-head">${esc(g)}</div><table class="kbd-table">${list.map(([id, label])=>`<tr><td>${comboLabel(map[id])}</td><td>${esc(label)}</td></tr>`).join("")}</table>`).join("")}`;
}
function logRowHTML(e){
  return `<li class="log-row ${e.reverted ? "reverted" : ""}" data-log="${e.id}">
    <span class="log-time" title="${esc(tsText(e.ts))}">${relTime(e.ts)}</span>
    <span class="log-area">${esc(e.area)}</span>
    <span class="log-text">${esc(logText(e))}${e.reverted ? ' <span class="muted small">(zurückgenommen)</span>' : ""}</span>
    <span class="log-game muted small" title="Spieldatum">${e.gameDate ? fmtDate(e.gameDate,{day:"2-digit",month:"2-digit",year:"2-digit"}) : ""}</span>
    ${e.revertible && !e.reverted ? `<button class="btn-icon-sm" data-revert="${e.id}" title="Diese Änderung zurücknehmen" aria-label="Zurücknehmen: ${esc(logText(e))}">↶</button>` : `<span></span>`}
  </li>`;
}

function adminLog(){
  const areas = [...new Set(readLog().map(e=>e.area))].sort();
  qs("#adminBody").innerHTML = `
    <div class="toolbar">
      <input type="search" id="logSearch" placeholder="Protokoll durchsuchen (Name, Feld, Wert)…" value="${esc(logFilter.q)}" aria-label="Protokoll durchsuchen">
      <select id="logArea" aria-label="Bereich filtern"><option value="">Alle Bereiche</option>${areas.map(a=>`<option ${a===logFilter.area?"selected":""}>${esc(a)}</option>`).join("")}</select>
      <label class="check-label"><input type="checkbox" id="logRevertible" ${logFilter.onlyRevertible?"checked":""}> nur rücknehmbare</label>
      <span class="spacer"></span>
      <button class="btn btn-sm btn-danger-outline" id="btnClearLog">Protokoll leeren</button>
    </div>
    <div id="logListBox"></div>
    <p class="hint">↶ nimmt eine einzelne Änderung zurück – auch ältere, solange der Wert seitdem nicht erneut geändert wurde. Strg+Z (außerhalb von Eingabefeldern) nimmt die letzte Änderung zurück. Schnelles Tippen im selben Feld wird zu einem Eintrag zusammengefasst.</p>`;
  renderLogList();
}
function renderLogList(){
  const q = logFilter.q.trim().toLowerCase();
  const all = readLog().slice().reverse().filter(e=>
    (!logFilter.area || e.area === logFilter.area) && (!logFilter.onlyRevertible || (e.revertible && !e.reverted)) &&
    (!q || (logText(e) + " " + e.area).toLowerCase().includes(q)));
  const shown = all.slice(0, logFilter.limit);
  qs("#logListBox").innerHTML = shown.length ? `<ul class="log-list">${shown.map(logRowHTML).join("")}</ul>
    ${all.length > shown.length ? `<button class="btn btn-sm" id="btnLogMore">Weitere ${fmtNum(Math.min(100, all.length - shown.length))} laden (${fmtNum(all.length - shown.length)} übrig)</button>` : ""}`
    : `<p class="empty">Keine passenden Einträge.</p>`;
}

function adminRestore(){
  const rps = readRestorePoints();
  qs("#adminBody").innerHTML = `
    <div class="toolbar">
      <span class="muted">Automatisch vor Datumssprüngen (höchstens alle 7 Spieltage bzw. 30 Min.), Importen, Zurücksetzen und Saisonabschluss. Die letzten ${RP_MAX_AUTO} automatischen und ${RP_MAX_MANUAL} manuellen bleiben erhalten.</span>
      <span class="spacer"></span>
      <button class="btn btn-accent btn-sm" id="btnManualRp">+ Jetzt sichern</button>
    </div>
    ${rps.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Erstellt</th><th>Anlass</th><th>Spieldatum</th><th>Größe</th><th></th></tr></thead><tbody>
      ${rps.map(r=>`<tr data-rp="${r.id}">
        <td data-label="Erstellt">${esc(tsText(r.ts))}<div class="muted small">${relTime(r.ts)}</div></td>
        <td data-label="Anlass">${r.manual ? '<span class="badge ok">manuell</span> ' : ""}${esc(r.reason)}</td>
        <td data-label="Spieldatum">${r.gameDate ? fmtDate(r.gameDate,{day:"2-digit",month:"2-digit",year:"numeric"}) : "—"} <span class="muted small">${esc(r.season||"")}</span></td>
        <td data-label="Größe">${fmtBytes(r.size)}</td>
        <td data-label=""><span class="row-actions"><button class="btn btn-sm" data-rp-restore>Wiederherstellen</button><button class="btn-icon-sm del" data-rp-del aria-label="Punkt löschen">✕</button></span></td>
      </tr>`).join("")}</tbody></table></div>`
      : `<p class="empty">Noch keine Wiederherstellungspunkte. Der erste entsteht beim nächsten Datumssprung – oder jetzt mit „+ Jetzt sichern“.</p>`}
    <p class="hint">Wiederherstellungspunkte liegen im Browser-Speicher dieses Geräts und gehören zu diesem Spielstand. Für echte Sicherheit: Allgemein → Sicherung.</p>`;
}

/* ---------- Data health check ---------- */
function runHealthChecks(){
  const out = [];
  const add = (sev, text, fix, fixLabel) => out.push({sev, text, fix, fixLabel});
  const names = new Map(state.players.map(p=>[p.name.trim().toLowerCase(), p]));
  // duplicate players inside a line-up (all plans, all formations)
  state.plans.forEach(pl=>{
    const b = planBlock(pl.id);
    Object.entries(b.tactics).forEach(([f, t])=>{
      const seen = new Set(), dups = [];
      Object.entries(t.slots).forEach(([i, sl])=>{ if(sl.playerId){ if(seen.has(sl.playerId)) dups.push(i); seen.add(sl.playerId); } });
      if(dups.length) add("error", `${pl.name} · ${formationLabel(f, b)}: ${dups.length} Spieler doppelt aufgestellt`,
        ()=>{ dups.forEach(i=>{ planBlock(pl.id).tactics[f].slots[i].playerId = null; }); }, "Doppelte entfernen");
    });
  });
  const pens = state.penaltyOrder.filter(Boolean);
  if(new Set(pens).size !== pens.length) add("warn", "Elfmeter-Reihenfolge enthält einen Spieler mehrfach",
    ()=>{ const seen = new Set(); state.penaltyOrder = state.penaltyOrder.map(id=> id && !seen.has(id) ? (seen.add(id), id) : null); }, "Bereinigen");
  state.players.filter(p=>p.birthDate && ageOn(p.birthDate, ingameDate()) !== p.age).forEach(p=>
    add("error", `${p.name}: Alter ${p.age} passt nicht zum Geburtsdatum`, ()=>{ p.age = clamp(ageOn(p.birthDate, ingameDate()),14,45); }, "Alter korrigieren"));
  state.players.filter(p=>contractMonthsLeft(p) < 0).forEach(p=>
    add("warn", `${p.name}: Vertrag ist abgelaufen (30.06.${p.contractUntil}) – verlängern oder aus dem Kader nehmen`));
  const dupNames = state.players.map(p=>p.name.trim().toLowerCase()).filter((n,i,a)=>a.indexOf(n) !== i);
  [...new Set(dupNames)].forEach(n=> add("warn", `Zwei Spieler heißen „${names.get(n).name}“ – Absicht oder doppelt angelegt?`));
  state.scouting.filter(t=>names.has(t.name.trim().toLowerCase())).forEach(t=>
    add("warn", `Transferziel „${t.name}“ steht schon im Kader`, ()=>{ state.scouting = state.scouting.filter(x=>x.id !== t.id); }, "Ziel entfernen"));
  state.prospects.filter(t=>names.has(t.name.trim().toLowerCase())).forEach(t=>
    add("warn", `Talent „${t.name}“ steht zusätzlich im Profikader`, ()=>{ state.prospects = state.prospects.filter(x=>x.id !== t.id); }, "Talent-Eintrag entfernen"));
  state.loans.filter(t=>names.has(t.name.trim().toLowerCase())).forEach(t=>
    add("warn", `Leihspieler „${t.name}“ steht zusätzlich im Kader`, ()=>{ state.loans = state.loans.filter(x=>x.id !== t.id); }, "Leih-Eintrag entfernen"));
  const onSale = new Set(state.sales.map(x=>x.playerId));
  const sellNotListed = state.players.filter(p=>listBase("squadRoles", p.squadRole) === "sell" && !onSale.has(p.id));
  if(sellNotListed.length) add("info", `Kaderrolle „Abgabe“, aber nicht auf der Verkaufsliste: ${sellNotListed.map(p=>p.name).join(", ")}`);
  const xi = new Set(Object.values(currentSlots()).map(s=>s.playerId).filter(Boolean));
  const unavailXI = state.players.filter(p=>xi.has(p.id) && UNAVAILABLE.includes(p.status));
  if(unavailXI.length) add("info", `In der Startelf (${activePlan().name}), aber nicht verfügbar: ${unavailXI.map(p=>`${p.name} (${STATUS[p.status]})`).join(", ")}`);
  const nm = state.nextMatch;
  if(nm.opponent && nm.date && nm.date < state.club.ingameDate && !state.results.some(r=>r.date === nm.date && r.opponent === nm.opponent))
    add("info", `Spiel gegen ${nm.opponent} (${fmtDate(nm.date,{day:"numeric",month:"short"})}) liegt zurück, aber ohne Ergebnis`, ()=>{ navigate("fixtures"); openResultModal(null); }, "Ergebnis eintragen");
  const lo = sampleLeftovers();
  if(lo.total && lo.hasReal) add("warn", `Beispieldaten aus der Demo übrig: ${lo.parts.join(", ")}`, ()=>stripSampleData(state), "Beispieldaten entfernen");
  const b = budgetCalc();
  if(state.club.wageBudget && b.wageHeadroom < 0) add("warn", `Gehälter liegen ${fmtWage(-b.wageHeadroom)} über dem Gehaltsbudget`);
  const future = state.balanceLog.filter(x=>x.date > state.club.ingameDate).length + state.results.filter(r=>r.date && r.date > state.club.ingameDate).length;
  if(future) add("info", `${future} Einträge (Ergebnisse/Kontostand) liegen nach dem aktuellen Spieldatum`);
  return out;
}
function adminHealth(){
  const list = runHealthChecks();
  const icon = {error:"⛔", warn:"⚠", info:"ℹ"};
  const fixable = list.filter(x=>x.fix && x.fixLabel !== "Ergebnis eintragen");
  qs("#adminBody").innerHTML = `
    <div class="toolbar"><span class="muted">${list.length ? `${list.filter(x=>x.sev==="error").length} Fehler · ${list.filter(x=>x.sev==="warn").length} Warnungen · ${list.filter(x=>x.sev==="info").length} Hinweise` : ""}</span>
      <span class="spacer"></span>${fixable.length ? `<button class="btn btn-accent btn-sm" id="btnFixAll">Alle ${fixable.length} automatisch beheben</button>` : ""}
      <button class="btn btn-sm" id="btnRecheck">Erneut prüfen</button></div>
    ${list.length ? `<ul class="health-list">${list.map((x,i)=>`<li class="h-${x.sev}"><span class="h-icon">${icon[x.sev]}</span><span class="h-text">${esc(x.text)}</span>${x.fix ? `<button class="btn btn-sm" data-fix="${i}">${esc(x.fixLabel)}</button>` : ""}</li>`).join("")}</ul>`
      : `<div class="future-ok">✓ Keine Probleme gefunden. Die Daten dieses Spielstands sind in sich stimmig.</div>`}`;
  adminHealth._list = list;
}

/* ---------- Raw data editor ---------- */
const RAW_COLLS = Object.assign({}, Object.fromEntries(Object.entries(LOG_COLLECTIONS).map(([k,v])=>[k, v.label])), {club:"Verein (Einstellungen)", nextMatch:"Nächstes Spiel"});
function rawCell(v){
  if(v === null || v === undefined) return "";
  if(typeof v === "object") return JSON.stringify(v);
  return String(v);
}
/* ==========================================================================
   ROHDATEN 2.0 – readable editor: German labels, fitting controls, your list names,
   sticky name column, search. The technical view (raw keys/values) stays one click away.
   ========================================================================== */
let rawTech = false, rawSearch = "", rawScroll = {left:0, top:0};
const POS_OPTS = () => Object.fromEntries(POS_LIST.map(p=>[p, p]));
const RAW_META = {
  players: [["name","Name","text",170],["pos","Position","select",90,POS_OPTS],["altPos","Nebenpositionen","poslist",130],["nation","Land","text",120],
    ["birthDate","Geburtsdatum","date",150],["age","Alter","int",70],["salary","Gehalt (€/Jahr)","money",130],["valueMin","Transferwert von","money",130],["valueMax","Transferwert bis","money",130],
    ["contractUntil","Vertrag bis","int",90],["squadRole","Kaderrolle","select",150,()=>SQUAD_ROLES],["rating","Einschätzung","stars",110],["status","Status","select",150,()=>STATUS],
    ["extendPlanned","Verlängerung geplant","bool",90],["loanIn","Leihspieler","bool",80],["note","Notiz","text",240]],
  scouting: [["name","Name","text",170],["pos","Position","select",90,POS_OPTS],["age","Alter","int",70],["kind","Art","select",100,()=>({buy:"Kauf", loan:"Leihe"})],
    ["grade","Grade","select",80,()=>Object.fromEntries(GRADES.map(g=>[g,g]))],["status","Status","select",140,()=>SCOUT_STATUS],["priority","Priorität","select",110,()=>PRIORITIES],
    ["shortlist","Shortlist","select",100,()=>({0:"—",1:"1. Wahl",2:"2. Wahl",3:"3. Wahl"})],["fee","Ablöse / Leihgebühr","money",140],["bonus","Handgeld","money",120],
    ["wage","Gehalt (€/Jahr)","money",130],["wageShare","Gehaltsanteil %","int",90],["note","Notiz","text",240]],
  prospects: [["name","Name","text",170],["pos","Position","select",90,POS_OPTS],["age","Alter","int",70],["current","Aktuell","stars",110],["potential","Potenzial","stars",110],
    ["pathway","Weg","select",150,()=>PATHWAYS],["focus","Trainingsfokus","text",160],["readyBy","Bereit bis","text",110],["note","Notiz","text",240]],
  loans: [["name","Name","text",170],["pos","Position","select",90,POS_OPTS],["age","Alter","int",70],["club","Leihclub","text",150],["league","Liga","text",110],["until","Bis","text",100],
    ["apps","Einsätze","int",80],["playtime","Spielzeit","select",120,()=>Object.assign({"":"— offen —"}, PLAYTIME)],["clause","Klausel","select",140,()=>LOAN_CLAUSES],
    ["recallCheck","Rückruf prüfen","bool",90],["returnPlan","Rückkehr-Plan","select",140,()=>({"":"— offen —", keep:"Einplanen", loan:"Erneut verleihen", sell:"Verkaufen"})],
    ["player","Spielerdaten","backpack",150],["note","Notiz","text",240]],
  sales: [["playerId","Spieler","select",180,()=>Object.fromEntries(state.players.map(p=>[p.id, p.name]))],["price","Erwarteter Erlös","money",140],["status","Status","select",150,()=>SALE_STATUS],["note","Notiz","text",240]],
  results: [["date","Datum","date",150],["opponent","Gegner","text",160],["competition","Wettbewerb","text",140],["venue","Ort","select",110,()=>VENUES],["gf","Tore","int",70],["ga","Gegentore","int",80],
    ["planName","Plan","text",110],["formation","Formation","text",100],["oppFormation","Gegnerformation","text",120],["season","Saison","text",90]],
  transferLog: [["date","Datum","date",150],["type","Richtung","select",110,()=>({in:"Zugang", out:"Abgang"})],["name","Spieler","text",170],["pos","Position","text",80],
    ["fee","Ablöse","money",130],["club","Verein","text",150],["season","Saison","text",90]],
  balanceLog: [["date","Datum","date",150],["amount","Kontostand","money",150],["note","Notiz","text",260]],
  boardGoals: [["title","Ziel","text",240],["category","Kategorie","select",130,()=>Object.fromEntries(GOAL_CATS.map(c=>[c,c]))],["target","Vorgabe","text",160],["status","Status","select",130,()=>GOAL_STATUS]],
  todos: [["text","Aufgabe","text",420],["done","Erledigt","bool",80]],
  seasons: [["season","Saison","text",90],["position","Platzierung","text",100],["squadSize","Kader","int",70],["avgAge","Ø Alter","num",80],["wages","Gehälter (€/Jahr)","money",140],["closedAt","Abgeschlossen","date",150],["summary","Fazit","text",320]],
  opponents: [["name","Gegner","text",170],["formation","Formation","text",100],["keyThreat","Gefährlichster Spieler","text",180],["weaknesses","Schwachstellen","text",240],["notes","Notizen","text",240],["updatedAt","Stand","date",150]],
  club: [["name","Vereinsname","text"],["crest","Kürzel","text"],["accent","Akzentfarbe","color"],["ingameDate","Spieldatum","date"],["season","Saison","text"],
    ["transferBudget","Transferbudget","money"],["wageBudget","Gehaltsbudget (€/Jahr)","money"],["salesShare","Anteil Verkaufserlöse %","int"],
    ["wageUnit","Gehaltsanzeige","select",0,()=>({year:"pro Jahr", month:"pro Monat", week:"pro Woche"})],["numberFormat","Zahlenformat","select",0,()=>({dot:"1.234.567", comma:"1,234,567"})],
    ["moneyDisplay","Beträge","select",0,()=>({short:"kurz (€2,5 Mio.)", full:"voll (€2.500.000)"})],["windows","Transferfenster","json"]],
  nextMatch: [["opponent","Gegner","text"],["competition","Wettbewerb","text"],["date","Datum","date"],["venue","Ort","select",0,()=>VENUES],["formation","Erwartete Formation","text"],
    ["keyThreat","Gefährlichster Spieler","text"],["planId","Taktik-Plan","select",0,()=>Object.assign({"":"aktiver Plan"}, Object.fromEntries(state.plans.map(pl=>[pl.id, pl.name])))],
    ["matchplan","Matchplan","text"],["weaknesses","Schwachstellen","text"]]
};
if(!RAW_COLLS.opponents) RAW_COLLS.opponents = "Gegner-Datenbank";
function rawFields(coll){
  const known = (RAW_META[coll] || []).map(([key,label,type,width,opts])=>({key,label,type,width:width || 160,opts}));
  const isObj = coll === "club" || coll === "nextMatch";
  const sample = isObj ? [state[coll]] : (state[coll] || []);
  const seen = new Set(known.map(f=>f.key).concat(["id","custom","playerHistory","minutes","bosmanAck","planId"].filter(k=>!isObj || k !== "planId")));
  // fields not described above (e.g. added later) still appear – as a plain text/number field
  const extra = [...new Set(sample.flatMap(o=>Object.keys(o || {})))].filter(k=>!seen.has(k)).map(k=>{
    const v = sample.map(o=>o[k]).find(x=>x !== undefined && x !== null);
    return {key:k, label:FIELD_LABEL[k] || k, type: typeof v === "number" ? "num" : typeof v === "boolean" ? "bool" : (v && typeof v === "object") ? "json" : "text", width:140};
  });
  const cf = (coll === "players" || coll === "scouting") ? (state.customFields || []).map(d=>({key:"cf:" + d.id, label:"✦ " + d.name, type:"cf", def:d, width: d.type === "bool" ? 90 : 150})) : [];
  return known.concat(extra, cf);
}
function rawValueText(f, v){
  if(v === undefined || v === null) return "";
  if(f.type === "money") return fmtNum(v);
  if(f.type === "poslist") return (v || []).join(", ");
  if(f.type === "json") return JSON.stringify(v);
  return String(v);
}
function rawControl(f, o){
  const v = f.type === "cf" ? ((o.custom || {})[f.def.id]) : o[f.key];
  const a = `data-raw-key="${esc(f.key)}" data-rt="${f.type}" aria-label="${esc(f.label)}"`;
  switch(f.type){
    case "select": { const opts = f.opts(); const cur = v === undefined || v === null ? "" : String(v);
      const known = Object.prototype.hasOwnProperty.call(opts, cur);
      return `<select ${a}>${known ? "" : `<option value="${esc(cur)}" selected>${esc(cur || "—")} (unbekannt)</option>`}${Object.entries(opts).map(([k,l])=>`<option value="${esc(k)}" ${k === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`; }
    case "stars": return `<select ${a} class="raw-stars">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n === v ? "selected" : ""}>${"★".repeat(n)}${"☆".repeat(5-n)}</option>`).join("")}</select>`;
    case "bool": return `<input type="checkbox" ${v ? "checked" : ""} ${a}>`;
    case "date": return `<input type="date" value="${esc(v || "")}" ${a}>`;
    case "color": return `<input type="color" value="${esc(v || "#4f8cff")}" ${a}>`;
    case "money": return `<input type="text" inputmode="decimal" class="raw-num" value="${esc(rawValueText(f, v))}" ${a}>`;
    case "int": case "num": return `<input type="text" inputmode="decimal" class="raw-num" value="${esc(v === undefined ? "" : v)}" ${a}>`;
    case "backpack": return v ? `<span class="raw-badge ok" title="Beim Zurückholen werden alle Daten wiederhergestellt">✓ aufbewahrt</span>` : `<span class="muted small">—</span>`;
    case "cf": { const d = f.def;
      if(d.type === "bool") return `<input type="checkbox" ${v ? "checked" : ""} ${a}>`;
      if(d.type === "select") return `<select ${a}><option value="">—</option>${d.options.map(x=>`<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
      return `<input type="text" ${d.type === "number" ? 'inputmode="decimal" class="raw-num"' : ""} value="${esc(v === undefined ? "" : v)}" ${a}>`; }
    default: return `<input type="text" value="${esc(rawValueText(f, v))}" ${a}>`;
  }
}
function adminRaw(){ if(rawTech) adminRawTech(); else adminRaw2(); }
function adminRaw2(){
  const isObj = rawColl === "club" || rawColl === "nextMatch";
  const fields = rawFields(rawColl);
  const q = rawSearch.trim().toLowerCase();
  let table, count = "";
  if(isObj){
    const o = state[rawColl];
    table = `<table class="data-table raw-table raw2 raw-form"><tbody>${fields.map(f=>`<tr><th scope="row">${esc(f.label)}</th><td>${rawControl(f, o)}</td></tr>`).join("")}</tbody></table>`;
  } else {
    const all = state[rawColl] || [];
    const rows = all.filter(o=>!q || fields.some(f=>{ const v = f.type === "cf" ? (o.custom || {})[f.def.id] : o[f.key];
      const shown = f.type === "select" ? (f.opts()[v] ?? v) : v; return shown !== undefined && shown !== null && String(shown).toLowerCase().includes(q); }));
    count = q ? `${rows.length} von ${all.length} Einträgen` : `${all.length} Einträge`;
    const nameKey = fields[0] ? fields[0].key : "";
    table = rows.length ? `<table class="data-table raw-table raw2"><colgroup><col style="width:44px">${fields.map(f=>`<col style="width:${f.width}px">`).join("")}</colgroup>
      <thead><tr><th class="raw-sticky raw-idx">#</th>${fields.map((f,i)=>`<th class="${i === 0 ? "raw-sticky raw-first" : ""} ${["money","int","num"].includes(f.type) ? "num" : ""}">${esc(f.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(0,400).map(o=>`<tr data-raw-id="${esc(o.id)}"><td class="raw-sticky raw-idx muted">${all.indexOf(o)+1}</td>${fields.map((f,i)=>`<td class="${i === 0 ? "raw-sticky raw-first" : ""} rt-${f.type}">${rawControl(f, o)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : `<p class="empty">${q ? "Nichts gefunden." : "Keine Einträge."}</p>`;
  }
  qs("#adminBody").innerHTML = `
    <div class="toolbar raw-toolbar">
      <select id="rawColl" aria-label="Datensammlung">${options(RAW_COLLS, rawColl)}</select>
      ${isObj ? "" : `<input type="search" id="rawSearch" autocomplete="off" placeholder="In ${esc(RAW_COLLS[rawColl])} suchen …" value="${esc(rawSearch)}" aria-label="Suchen">`}
      <span class="muted small">${count}</span>
      <span class="spacer"></span>
      <label class="check-label small"><input type="checkbox" id="rawTechToggle"> Technische Ansicht</label>
      <button class="btn btn-sm" id="btnRawJson">Als JSON anzeigen</button>
    </div>
    <div class="table-wrap raw-wrap" id="rawWrap">${table}</div>
    <p class="hint">Alle gespeicherten Felder, mit deutschen Namen und passenden Eingaben – Auswahlfelder zeigen deine eigenen Bezeichnungen. Ungültige Werte werden automatisch korrigiert, jede Änderung landet im Protokoll und ist dort rücknehmbar. Die technische Ansicht zeigt die internen Schlüssel und Rohwerte.</p>`;
  const wrap = qs("#rawWrap");
  if(wrap){ wrap.scrollLeft = rawScroll.left; wrap.scrollTop = rawScroll.top; wrap.addEventListener("scroll", ()=>{ rawScroll = {left:wrap.scrollLeft, top:wrap.scrollTop}; }); }
}
/** Writes one edited cell (new view) – typed, sanitized, logged; the table stays where it is. */
function applyRawEdit2(el){
  const key = el.dataset.rawKey, type = el.dataset.rt, row = el.closest("[data-raw-id]");
  const isObj = rawColl === "club" || rawColl === "nextMatch";
  const obj = isObj ? state[rawColl] : (state[rawColl] || []).find(o=>o.id === (row && row.dataset.rawId));
  if(!obj) return;
  if(type === "cf"){ el.dataset.cf = key.slice(3); readCFCell(el, obj); }
  else {
    const old = obj[key]; let val;
    switch(type){
      case "bool": val = el.checked; break;
      case "money": val = /\d/.test(el.value) ? parseMoney(el.value) : 0; break;
      case "int": case "num": { const t = el.value.trim().replace(",", "."); const n = Number(t); if(!Number.isFinite(n)){ toast("Bitte eine Zahl eingeben."); el.value = old ?? ""; return; } val = type === "int" ? Math.round(n) : n; break; }
      case "stars": val = num(el.value, 3); break;
      case "poslist": val = el.value.split(/[,;\s]+/).map(x=>x.trim().toUpperCase()).filter(x=>POS_LIST.includes(x)); break;
      case "json": try{ val = JSON.parse(el.value); }catch(e){ toast("Ungültiges JSON – Änderung verworfen."); el.value = rawValueText({type:"json"}, old); return; } break;
      case "select": val = typeof old === "number" ? num(el.value, old) : el.value; break;
      default: val = el.value;
    }
    obj[key] = val;
  }
  const wrap = qs("#rawWrap"); if(wrap) rawScroll = {left:wrap.scrollLeft, top:wrap.scrollTop};
  state = sanitizeState(state);
  saveState(); renderAll(); adminRaw();
  toast("Gespeichert");
}

function adminRawTech(){
  const isObj = rawColl === "club" || rawColl === "nextMatch";
  const data = isObj ? state[rawColl] : state[rawColl];
  let table;
  if(isObj){
    table = `<table class="data-table raw-table"><thead><tr><th>Feld</th><th>Wert</th></tr></thead><tbody>
      ${Object.keys(data).map(k=>`<tr><td class="muted">${esc(k)}</td><td><input type="text" value="${esc(rawCell(data[k]))}" data-raw-key="${esc(k)}" aria-label="${esc(k)}"></td></tr>`).join("")}</tbody></table>`;
  } else {
    const keys = [...new Set(data.flatMap(o=>Object.keys(o)))].filter(k=>k !== "id");
    table = data.length ? `<table class="data-table raw-table"><thead><tr><th>#</th>${keys.map(k=>`<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>
      ${data.slice(0,300).map((o,i)=>`<tr data-raw-id="${esc(o.id)}"><td class="muted">${i+1}</td>${keys.map(k=>`<td><input type="text" value="${esc(rawCell(o[k]))}" data-raw-key="${esc(k)}" aria-label="${esc(k)}"></td>`).join("")}</tr>`).join("")}</tbody></table>`
      : `<p class="empty">Keine Einträge.</p>`;
  }
  qs("#adminBody").innerHTML = `
    <div class="toolbar">
      <select id="rawColl" aria-label="Datensammlung">${options(RAW_COLLS, rawColl)}</select>
      <span class="muted">${isObj ? "" : `${data.length} Einträge`}</span>
      <span class="spacer"></span>
      <label class="check-label small"><input type="checkbox" id="rawTechToggle" checked> Technische Ansicht</label>
      <button class="btn btn-sm" id="btnRawJson">Als JSON anzeigen</button>
    </div>
    <div class="table-wrap raw-wrap">${table}</div>
    <p class="hint">Direkter Zugriff auf alle gespeicherten Felder. Ungültige Werte werden beim Speichern automatisch korrigiert (z. B. Text in Zahlenfeldern). Jede Änderung landet im Protokoll und ist dort rücknehmbar.</p>`;
}
function applyRawEdit(el){
  const key = el.dataset.rawKey, row = el.closest("[data-raw-id]");
  const obj = row ? state[rawColl].find(o=>o.id === row.dataset.rawId) : state[rawColl];
  if(!obj) return;
  const old = obj[key], txt = el.value;
  let val;
  // numbers: "2.500.000" / "2,5 mio" / "850k" → parseMoney; plain values like "2029" or "-3" pass through
  if(typeof old === "number") val = /\d/.test(txt) ? parseMoney(txt) : old;
  else if(typeof old === "boolean") val = /^(true|ja|1|x|yes)$/i.test(txt.trim());
  else if(Array.isArray(old) && old.every(x=>typeof x === "string")) val = txt.split(",").map(x=>x.trim()).filter(Boolean);
  else if(old !== null && typeof old === "object"){ try{ val = JSON.parse(txt); }catch(e){ toast("Ungültiges JSON – Änderung verworfen."); el.value = rawCell(old); return; } }
  else val = txt;
  obj[key] = val;
  state = sanitizeState(state);
  saveState(); renderAll(); adminRaw();
  toast("Gespeichert");
}

function adminSecurity(){
  const cfg = adminCfg();
  qs("#adminBody").innerHTML = `
    <div class="admin-grid">
      <div class="card">
        <div class="card-head"><h2>PIN ändern</h2></div>
        <div class="form-stack">
          <div class="field"><label for="pinOld">Aktueller PIN</label><input type="password" id="pinOld" autocomplete="current-password"></div>
          <div class="field"><label for="pinA">Neuer PIN (mind. 4 Zeichen)</label><input type="password" id="pinA" autocomplete="new-password"></div>
          <div class="field"><label for="pinB">Wiederholen</label><input type="password" id="pinB" autocomplete="new-password"></div>
          <div class="pin-msg" id="pinMsg" role="alert"></div>
          <div><button class="btn btn-accent btn-sm" id="btnChangePin">PIN ändern</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Sperre</h2></div>
        <div class="form-stack">
          <div class="field"><label for="autoLock">Automatisch sperren nach Inaktivität</label>
            <select id="autoLock">${options({5:"5 Minuten",10:"10 Minuten",30:"30 Minuten",60:"60 Minuten",0:"nie"}, String(cfg.autoLockMin ?? 10))}</select></div>
          <label class="check-label"><input type="checkbox" id="lockOnLeave" ${cfg.lockOnLeave ? "checked" : ""}> Beim Verlassen des Admin-Bereichs sofort sperren</label>
          <p class="hint">PIN gesetzt ${cfg.setAt ? relTime(cfg.setAt) : ""}. Er gilt für alle Spielstände in diesem Browser. Gespeichert ist nur ein gesalzener Hash (${fmtNum(cfg.iter || PIN_ITER)} SHA-256-Runden).</p>
          <div><button class="btn btn-sm btn-danger-outline" id="btnRemovePin">PIN entfernen</button></div>
        </div>
      </div>
    </div>`;
}

function initAdmin(){
  qs("#btnAdmin").addEventListener("click", ()=> navigate("admin"));
  const root = qs("#adminRoot");
  const msg = t => { const m = qs("#pinMsg"); if(m) m.textContent = t; };
  root.addEventListener("click", e=>{
    const t = e.target;
    if(t.closest("#btnSetPin")){
      const a = qs("#pinNew1").value, b = qs("#pinNew2").value;
      if(a.length < 4) return msg("Mindestens 4 Zeichen.");
      if(a !== b) return msg("Die Eingaben stimmen nicht überein.");
      setPin(a); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = "overview"; renderAdmin(); toast("Admin-Bereich eingerichtet");
    }
    else if(t.closest("#btnUnlock")) tryUnlock();
    else if(t.closest("#btnForgotPin")) openForgotPin();
    else if(t.closest("#btnLockAdmin")){ lockAdmin(); toast("Admin-Bereich gesperrt"); }
    else if(t.closest("[data-atab]")){ saveCurrentNote(); adminTab = t.closest("[data-atab]").dataset.atab; orphanSel = null; renderAdmin(); }
    else if(t.closest("[data-atab-go]")){ adminTab = t.closest("[data-atab-go]").dataset.atabGo; orphanSel = null; renderAdmin(); }
    else if(t.closest("[data-adm-saves]")) openSaveMenu();
    else if(t.closest("[data-adm-go]")){ const g = t.closest("[data-adm-go]").dataset.admGo;
      if(g === "exportAll"){ exportAll(); renderAdmin(); } else if(g === "importAll") qs("#btnImport").click(); else if(g === "hotkeys") openHotkeyModal(); }
    else if(t.closest("[data-admin-export]")) qs("#btnExport").click();
    else if(t.closest("[data-revert]")){
      if(revertLogEntry(t.closest("[data-revert]").dataset.revert)) toast("Änderung zurückgenommen");
      renderAdmin();
    }
    else if(t.closest("#btnLogMore")){ logFilter.limit += 100; renderLogList(); }
    else if(t.closest("#btnClearLog")){
      openModal({title:"Protokoll leeren?", body:`<p class="lead">Löscht alle ${fmtNum(readLog().length)} Einträge dieses Spielstands. Deine Daten bleiben unverändert, nur die Historie und die Rücknahme-Möglichkeit gehen verloren.</p>`,
        saveLabel:"Leeren", onSave:()=>{ writeLog([{id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, area:"Daten", action:"info", entity:"Protokoll", text:"Protokoll geleert", revertible:false}]); renderAdmin(); }});
    }
    else if(t.closest("#btnManualRp")){
      openModal({title:"Wiederherstellungspunkt anlegen", body:`<div class="field"><label>Bezeichnung</label><input data-f="label" value="Manuell gesichert" maxlength="60"></div>`,
        saveLabel:"Sichern", onSave:get=>{ const r = createRestorePoint(get("label").trim() || "Manuell gesichert", true); renderAdmin(); toast(r ? "Wiederherstellungspunkt angelegt" : "Speicher voll – bitte exportieren"); }});
    }
    else if(t.closest("[data-rp-restore]")){
      const id = t.closest("[data-rp]").dataset.rp, rp = readRestorePoints().find(x=>x.id===id);
      openModal({title:"Wiederherstellen?", body:`<p class="lead">Setzt den Spielstand auf <strong>${esc(tsText(rp.ts))}</strong> (${esc(rp.reason)}) zurück. Der aktuelle Stand wird vorher selbst als Punkt „Vor Wiederherstellung“ gesichert – du kannst also zurück.</p>`,
        saveLabel:"Wiederherstellen", onSave:()=>{ restoreFromPoint(id); adminTab = "restore"; renderAdmin(); toast("Wiederhergestellt"); }});
    }
    else if(t.closest("[data-rp-del]")){
      const id = t.closest("[data-rp]").dataset.rp;
      try{ store.setItem(rpKey(), JSON.stringify(readRestorePoints().filter(x=>x.id !== id))); }catch(err){}
      renderAdmin();
    }
    else if(t.closest("[data-fix]")){
      const f = adminHealth._list[num(t.closest("[data-fix]").dataset.fix)];
      f.fix(); if(!adminVisible()) return;
      state = sanitizeState(state); saveState(); renderAll(); renderAdmin(); toast("Behoben");
    }
    else if(t.closest("#btnFixAll")){
      adminHealth._list.filter(x=>x.fix && x.fixLabel !== "Ergebnis eintragen").forEach(x=>x.fix());
      state = sanitizeState(state); saveState(); renderAll(); renderAdmin(); toast("Automatisch behoben – Details im Protokoll");
    }
    else if(t.closest("#btnRecheck")) renderAdmin();
    else if(t.closest("#btnRawJson")){
      openModal({title:`Rohdaten: ${RAW_COLLS[rawColl]}`, wide:true,
        body:`<textarea class="json-view" readonly>${esc(JSON.stringify(state[rawColl], null, 2))}</textarea>`});
    }
    else if(t.closest("#btnChangePin")){
      const old = qs("#pinOld").value, a = qs("#pinA").value, b = qs("#pinB").value;
      const r = checkPin(old);
      if(r !== "ok") return msg(r.startsWith("wait") ? `Zu viele Versuche – bitte ${r.split(":")[1]} s warten.` : "Aktueller PIN ist falsch.");
      if(a.length < 4) return msg("Neuer PIN: mindestens 4 Zeichen.");
      if(a !== b) return msg("Neue Eingaben stimmen nicht überein.");
      setPin(a); renderAdmin(); toast("PIN geändert");
    }
    else if(t.closest("#btnRemovePin")){
      openModal({title:"PIN entfernen?", body:`<p class="lead">Der Admin-Bereich ist danach nicht mehr gesperrt. Beim nächsten Öffnen kannst du einen neuen PIN festlegen.</p>`,
        saveLabel:"Entfernen", onSave:()=>{ const c = adminCfg(); delete c.hash; delete c.salt; saveAdminCfg(c); adminUnlocked = false; renderAdmin(); toast("PIN entfernt"); }});
    }
  });
  root.addEventListener("keydown", e=>{
    if(e.key !== "Enter") return;
    if(e.target.id === "pinInput") tryUnlock();
    if(e.target.id === "pinNew2" || e.target.id === "pinNew1") qs("#btnSetPin").click();
  });
  root.addEventListener("input", e=>{
    if(e.target.id === "rawSearch"){
      rawSearch = e.target.value; const pos = e.target.selectionStart; rawScroll = {left:0, top:0}; adminRaw();
      const f = qs("#rawSearch"); if(f){ f.focus(); f.setSelectionRange(pos, pos); } return;
    }
    if(e.target.id === "logSearch"){ logFilter.q = e.target.value; logFilter.limit = 100; renderLogList(); }
  });
  root.addEventListener("change", e=>{
    const t = e.target;
    if(t.id === "logArea"){ logFilter.area = t.value; logFilter.limit = 100; renderLogList(); }
    else if(t.id === "logRevertible"){ logFilter.onlyRevertible = t.checked; renderLogList(); }
    else if(t.id === "rawColl"){ rawColl = t.value; rawSearch = ""; rawScroll = {left:0, top:0}; adminRaw(); }
    else if(t.id === "rawTechToggle"){ rawTech = t.checked; adminRaw(); }
    else if(t.dataset.rawKey !== undefined){ if(t.dataset.rt) applyRawEdit2(t); else applyRawEdit(t); }
    else if(t.id === "autoLock"){ const c = adminCfg(); c.autoLockMin = num(t.value, 10); saveAdminCfg(c); renderAdmin(); }
    else if(t.id === "lockOnLeave"){ const c = adminCfg(); c.lockOnLeave = t.checked; saveAdminCfg(c); }
  });
  // activity keeps the admin area open; the interval locks it after the idle time
  // Idle check happens on the next interaction (and when returning to the tab) – no background timer needed.
  ["pointerdown","keydown"].forEach(ev=> document.addEventListener(ev, ()=>{
    if(!adminUnlocked) return;
    adminAutoLockCheck();
    if(adminUnlocked) adminLastActivity = Date.now();
  }, true));
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) adminAutoLockCheck(); });
}
/* ---------- Admin → Listen ---------- */
let listSel = "squadRoles", roleCat = "ST";
const ROLE_LISTS = {rolesIP:"Taktik-Rollen mit Ball", rolesOOP:"Taktik-Rollen gegen Ball"};
function listKind(name){ return KEYED_LISTS[name] ? "keyed" : LABEL_LISTS[name] ? "labels" : name; }
function listEntries(name){
  const k = listKind(name);
  if(k === "keyed") return state.lists.keyed[name];
  if(k === "labels") return state.lists.labels[name].map(label=>({key:label, label}));
  return state.lists[name][roleCat].map(label=>({key:label, label}));
}
function adminLists(){
  const kind = listKind(listSel);
  const fixed = kind === "keyed" && !!KEYED_LISTS[listSel].fixed;
  const title = (KEYED_LISTS[listSel] || LABEL_LISTS[listSel] || {}).label || ROLE_LISTS[listSel];
  const entries = listEntries(listSel);
  const builtins = kind === "keyed" ? BUILTIN_LISTS.keyed[listSel] : [];
  const navBtn = (name, label) => `<button class="${name === listSel ? "active" : ""}" data-list="${name}">${esc(label)}</button>`;
  const hint = fixed ? "Feste Liste: Jeder Eintrag hat eine feste Funktion – du kannst die Bezeichnungen ändern, aber nichts hinzufügen, löschen oder verschieben."
    : kind === "keyed" ? "Eingebaute Einträge kannst du umbenennen, aber nicht löschen – an ihnen hängt Logik. Eigene Einträge verhalten sich wie der gewählte eingebaute."
    : kind === "labels" ? "Umbenennen ändert den Wert auch bei allen Einträgen, die ihn verwenden."
    : `Rollen für die Position <strong>${roleCat}</strong>. Umbenennen aktualisiert alle Aufstellungen in allen Plänen.${kind === "rolesOOP" ? " „Bleibt vorne“: Die Position rückt gegen den Ball kaum zurück." : ""}`;
  const behaviour = (e, i) => {
    if(fixed) return `<span class="muted small">fest${BUILTIN_LISTS.keyed[listSel][i] && BUILTIN_LISTS.keyed[listSel][i].label !== e.label ? ` · Standard: ${esc(BUILTIN_LISTS.keyed[listSel][i].label)}` : ""}</span>`;
    if(kind === "keyed"){
      if(isBuiltinKey(listSel, e.key)) return `<span class="muted small">eingebaut${BASE_HINT[listSel] && BASE_HINT[listSel][e.key] ? " · " + esc(BASE_HINT[listSel][e.key]) : ""}</span>`;
      return `<label class="small muted">wie <select data-le-base="${i}">${builtins.map(b=>`<option value="${esc(b.key)}" ${b.key === e.base ? "selected" : ""}>${esc(state.lists.keyed[listSel].find(x=>x.key === b.key).label)}</option>`).join("")}</select></label>`;
    }
    if(kind === "rolesOOP") return `<label class="check-label small"><input type="checkbox" data-le-high="${i}" ${STAY_HIGH.has(e.label) ? "checked" : ""}> bleibt vorne</label>`;
    return "";
  };
  const uses = e => countUses(kind, listSel, e.key, roleCat);
  qs("#adminBody").innerHTML = `
    <div class="lists-layout">
      <nav class="lists-nav" aria-label="Listen">
        <div class="lists-group">Mit Logik</div>${Object.entries(KEYED_LISTS).filter(([,d])=>!d.fixed).map(([n,d])=>navBtn(n, d.label)).join("")}
        <div class="lists-group">Freie Listen</div>${Object.entries(LABEL_LISTS).map(([n,d])=>navBtn(n, d.label)).join("")}
        <div class="lists-group">Taktik</div>${Object.entries(ROLE_LISTS).map(([n,l])=>navBtn(n, l)).join("")}
        <div class="lists-group">Feste Benennungen</div>${Object.entries(KEYED_LISTS).filter(([,d])=>d.fixed).map(([n,d])=>navBtn(n, d.label)).join("")}
      </nav>
      <div class="lists-body">
        <div class="lists-head"><h3>${esc(title)}</h3>
          ${kind === "rolesIP" || kind === "rolesOOP" ? `<select id="roleCat" aria-label="Position">${POS_LIST.map(c=>`<option ${c === roleCat ? "selected" : ""}>${c}</option>`).join("")}</select>` : ""}</div>
        <p class="hint" style="margin-top:0">${hint}</p>
        <table class="data-table list-edit"><thead><tr><th></th><th>Bezeichnung</th><th>Verhalten</th><th>Verwendet</th><th></th></tr></thead><tbody>
          ${entries.map((e,i)=>`<tr>
            <td class="le-move">${fixed ? "" : `<button class="btn-icon-sm" data-le-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button><button class="btn-icon-sm" data-le-down="${i}" ${i === entries.length-1 ? "disabled" : ""} aria-label="Nach unten">↓</button>`}</td>
            <td><input type="text" value="${esc(e.label)}" data-le-label="${i}" maxlength="40" aria-label="Bezeichnung"></td>
            <td>${behaviour(e, i)}</td>
            <td class="muted small">${uses(e) || "—"}</td>
            <td>${kind === "keyed" && isBuiltinKey(listSel, e.key) ? "" : `<button class="btn-icon-sm del" data-le-del="${i}" aria-label="${esc(e.label)} löschen">✕</button>`}</td>
          </tr>`).join("")}</tbody></table>
        <div class="list-add" ${fixed ? "hidden" : ""}>
          <input type="text" id="leNew" placeholder="Neuer Eintrag …" maxlength="40" aria-label="Neuer Eintrag">
          ${kind === "keyed" ? `<label class="small muted">wie <select id="leNewBase">${builtins.map(b=>`<option value="${esc(b.key)}">${esc(state.lists.keyed[listSel].find(x=>x.key === b.key).label)}</option>`).join("")}</select></label>` : ""}
          <button class="btn btn-sm btn-accent" id="btnLeAdd">+ Hinzufügen</button>
        </div>
        <div class="list-foot">
          <button class="btn btn-sm" id="btnLeReset">Diese Liste auf Standard zurücksetzen</button>
          <button class="btn btn-sm" id="btnLeDefault" title="Neue Spielstände starten dann mit diesen Listen">Alle Listen als Standard für neue Spielstände</button>
        </div>
      </div>
    </div>`;
}

function listRename(i, newLabel){
  newLabel = newLabel.trim().slice(0, 40);
  const kind = listKind(listSel), entries = listEntries(listSel), e = entries[i];
  if(!newLabel || newLabel === e.label){ adminLists(); return; }
  if(entries.some((x,j)=>j !== i && x.label.toLowerCase() === newLabel.toLowerCase())){ toast(`„${newLabel}“ gibt es in dieser Liste schon.`); adminLists(); return; }
  if(kind === "keyed") e.label = newLabel;
  else {
    const arr = kind === "labels" ? state.lists.labels[listSel] : state.lists[listSel][roleCat];
    replaceUses(kind, listSel, e.label, newLabel, roleCat);
    if(kind === "rolesOOP" && state.lists.stayHigh.includes(e.label)) state.lists.stayHigh = state.lists.stayHigh.map(x=>x === e.label ? newLabel : x);
    // the same role name may exist for other positions – rename only this position's slots (done above) and entry
    arr[i] = newLabel;
  }
  commitLists(`Umbenannt: „${e.label}“ → „${newLabel}“`);
}
function listMove(i, dir){
  const kind = listKind(listSel);
  const arr = kind === "keyed" ? state.lists.keyed[listSel] : kind === "labels" ? state.lists.labels[listSel] : state.lists[listSel][roleCat];
  const j = i + dir; if(j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  commitLists();
}
function listAdd(){
  const label = qs("#leNew").value.trim().slice(0, 40); if(!label) return;
  const kind = listKind(listSel);
  if(listEntries(listSel).some(x=>x.label.toLowerCase() === label.toLowerCase())){ toast(`„${label}“ gibt es in dieser Liste schon.`); return; }
  if(kind === "keyed") state.lists.keyed[listSel].push({key:"c_" + uid(), label, base: qs("#leNewBase").value});
  else if(kind === "labels") state.lists.labels[listSel].push(label);
  else state.lists[listSel][roleCat].push(label);
  commitLists(`„${label}“ hinzugefügt`);
  const f = qs("#leNew"); if(f) f.focus();
}
function listDelete(i){
  const kind = listKind(listSel), entries = listEntries(listSel), e = entries[i];
  if(kind === "keyed" && isBuiltinKey(listSel, e.key)) return;
  if(kind !== "keyed" && entries.length <= 1){ toast("Mindestens ein Eintrag muss bleiben."); return; }
  const others = entries.filter((_,j)=>j !== i);
  const doDelete = to=>{
    const undo = snapshotUndo(`„${e.label}“ gelöscht`, renderAll);
    if(to !== undefined) replaceUses(kind, listSel, e.key, to, roleCat);
    if(kind === "keyed") state.lists.keyed[listSel] = state.lists.keyed[listSel].filter(x=>x.key !== e.key);
    else if(kind === "labels") state.lists.labels[listSel] = state.lists.labels[listSel].filter(x=>x !== e.label);
    else { state.lists[listSel][roleCat] = state.lists[listSel][roleCat].filter(x=>x !== e.label); state.lists.stayHigh = state.lists.stayHigh.filter(x=>x !== e.label); }
    commitLists(); undo();
  };
  const n = countUses(kind, listSel, e.key, roleCat);
  if(!n){ doDelete(); return; }
  const preferred = kind === "keyed" ? e.base : others[0].key;
  openModal({
    title:`„${e.label}“ löschen`,
    body:`<p class="lead">${n} ${n === 1 ? "Eintrag verwendet" : "Einträge verwenden"} „${esc(e.label)}“. Worauf sollen sie umgestellt werden?</p>
      <div class="field"><label>Neuer Wert</label><select data-f="to">${others.map(o=>`<option value="${esc(o.key)}" ${o.key === preferred ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`,
    saveLabel:"Umstellen & löschen",
    onSave: get=>{ doDelete(get("to")); }
  });
}
function listReset(){
  const kind = listKind(listSel);
  openModal({
    title:"Liste zurücksetzen?",
    body:`<p class="lead">Stellt die Standard-Einträge und -Bezeichnungen wieder her. ${kind === "keyed"
      ? "Eigene Einträge entfallen – wer sie nutzt, bekommt den eingebauten Eintrag, wie den sie sich verhalten."
      : "Werte, die es danach nicht mehr gibt, werden auf den ersten Standard-Eintrag umgestellt."}</p>`,
    saveLabel:"Zurücksetzen",
    onSave: ()=>{
      const undo = snapshotUndo("Liste zurückgesetzt", renderAll);
      if(kind === "keyed"){
        state.lists.keyed[listSel].filter(x=>!isBuiltinKey(listSel, x.key)).forEach(x=>replaceUses(kind, listSel, x.key, x.base));
        state.lists.keyed[listSel] = JSON.parse(JSON.stringify(BUILTIN_LISTS.keyed[listSel]));
      } else if(kind === "labels"){
        const def = BUILTIN_LISTS.labels[listSel];
        state.lists.labels[listSel].filter(x=>!def.includes(x)).forEach(x=>replaceUses(kind, listSel, x, def[0]));
        state.lists.labels[listSel] = def.slice();
      } else {
        const def = BUILTIN_LISTS[listSel][roleCat];
        state.lists[listSel][roleCat].filter(x=>!def.includes(x)).forEach(x=>replaceUses(kind, listSel, x, def[0], roleCat));
        state.lists[listSel][roleCat] = def.slice();
        if(kind === "rolesOOP") state.lists.stayHigh = [...new Set(state.lists.stayHigh.concat(BUILTIN_LISTS.stayHigh.filter(x=>def.includes(x))))];
      }
      commitLists(); undo();
    }
  });
}
function initLists(){
  const root = qs("#adminRoot");
  root.addEventListener("click", e=>{
    const t = e.target;
    const b = t.closest("[data-list]"); if(b){ listSel = b.dataset.list; adminLists(); return; }
    const up = t.closest("[data-le-up]"); if(up) return listMove(num(up.dataset.leUp), -1);
    const dn = t.closest("[data-le-down]"); if(dn) return listMove(num(dn.dataset.leDown), 1);
    const del = t.closest("[data-le-del]"); if(del) return listDelete(num(del.dataset.leDel));
    if(t.closest("#btnLeAdd")) return listAdd();
    if(t.closest("#btnLeReset")) return listReset();
    if(t.closest("#btnLeDefault")){
      try{ store.setItem(LISTS_DEFAULT_KEY, JSON.stringify(state.lists)); toast("Gespeichert – neue Spielstände starten mit diesen Listen"); }catch(err){}
    }
  });
  root.addEventListener("change", e=>{
    const t = e.target;
    if(t.id === "roleCat"){ roleCat = t.value; adminLists(); return; }
    if(t.dataset.leLabel !== undefined) return listRename(num(t.dataset.leLabel), t.value);
    if(t.dataset.leBase !== undefined){ state.lists.keyed[listSel][num(t.dataset.leBase)].base = t.value; commitLists("Verhalten geändert"); return; }
    if(t.dataset.leHigh !== undefined){
      const label = listEntries(listSel)[num(t.dataset.leHigh)].label;
      state.lists.stayHigh = t.checked ? [...new Set(state.lists.stayHigh.concat(label))] : state.lists.stayHigh.filter(x=>x !== label);
      commitLists();
    }
  });
  root.addEventListener("keydown", e=>{ if(e.key === "Enter" && e.target.id === "leNew"){ e.preventDefault(); listAdd(); } });
}

function tryUnlock(){
  const r = checkPin(qs("#pinInput").value);
  if(r === "ok"){ adminTab = "overview"; renderAdmin(); return; }
  const m = qs("#pinMsg");
  m.textContent = r.startsWith("wait") ? `Zu viele Fehlversuche – bitte ${r.split(":")[1]} Sekunden warten.` : "Falscher PIN.";
  const f = qs("#pinInput"); f.value = ""; f.focus();
}
function openForgotPin(){
  openModal({
    title:"PIN vergessen?",
    body:`<p class="lead">Da alles lokal gespeichert ist, lässt sich der PIN zurücksetzen – <strong>deine Daten bleiben erhalten</strong>. Damit das nicht unbemerkt passiert, wird das Zurücksetzen im Protokoll jedes Spielstands vermerkt.</p>
      <div class="field"><label>Zur Bestätigung ZURÜCKSETZEN eintippen</label><input data-f="confirm" autocomplete="off"></div>`,
    saveLabel:"PIN zurücksetzen",
    onSave: get=>{
      if(get("confirm").trim().toUpperCase() !== "ZURÜCKSETZEN"){ toast("Bitte genau ZURÜCKSETZEN eintippen."); return false; }
      const c = adminCfg(); delete c.hash; delete c.salt; c.failed = 0; c.lockedUntil = 0; saveAdminCfg(c);
      slotIndex.slots.forEach(sl=>{
        const k = LOG_PREFIX + sl.id, l = readJSON(k);
        const list = Array.isArray(l) ? l : [];
        list.push({id:uid(), ts:Date.now(), gameDate:"", area:"Sicherheit", action:"info", entity:"Admin", text:"⚠ Admin-PIN wurde über „PIN vergessen“ zurückgesetzt", revertible:false});
        try{ store.setItem(k, JSON.stringify(list.slice(-LOG_MAX))); }catch(e){}
      });
      renderAdmin(); toast("PIN zurückgesetzt – bitte neu festlegen");
    }
  });
}


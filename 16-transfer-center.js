/* ==========================================================================
   TRANSFER-HUB (Fenster-Plan) – automatically the open or the next window
   ========================================================================== */
const WINDOW_KEYS = {summer:"Sommerfenster", winter:"Winterfenster"};
/** Open or next span of one window type: {key, label, start, end, open, days}. */
function windowSpan(key, dateISO){
  const w = parseWindow(state.club.windows[key]); if(!w) return null;
  const d = parseISO(dateISO || state.club.ingameDate);
  const spans = [];
  for(let y = d.getFullYear()-1; y <= d.getFullYear()+1; y++){
    const start = new Date(y, w.sm-1, w.sd); let end = new Date(y, w.em-1, w.ed);
    if(end < start) end = new Date(y+1, w.em-1, w.ed);
    spans.push({start, end});
  }
  const open = spans.find(x=>d >= x.start && d <= x.end);
  const pick = open || spans.filter(x=>x.start > d).sort((a,b)=>a.start-b.start)[0];
  if(!pick) return null;
  return {key, label:WINDOW_KEYS[key], start:pick.start, end:pick.end, open:!!open,
    days: Math.round(((open ? pick.end : pick.start) - d)/86400000)};
}
function hubWindow(){
  if(state.ui.hubWindow === "summer" || state.ui.hubWindow === "winter") return windowSpan(state.ui.hubWindow);
  const ws = windowStatus(); if(!ws) return null;
  return windowSpan(ws.label === "Winterfenster" ? "winter" : "summer");
}
/** Loanees that come back next season (same rule as the next-season view). */
function returningLoans(){
  const Y = nextSeasonCutoff().getFullYear();
  return state.loans.filter(l=>{ const end = yearFrom(l.until); return end !== null && end <= Y && listBase("loanClauses", l.clause) !== "obligation"; });
}
const activeLoan = l => { const e = loanEndISO(l.until); return !e || e >= state.club.ingameDate; };
function hubTasks(win){
  const tasks = [], Y = win.start.getFullYear();
  const bosYear = win.key === "winter" ? Y : Y + 1;          // winter Jan Y: contracts ending 30.06.Y · summer Y: next year's
  state.players.filter(p=>p.contractUntil === bosYear).forEach(p=>{
    const sell = listBase("squadRoles", p.squadRole) === "sell";
    tasks.push({icon:"⚖", cls: win.key === "winter" ? "t-red" : "t-amber",
      text: win.key === "winter" ? `${p.name}: Bosman – Vertrag endet 30.06.${bosYear}${sell ? " · letzte Chance auf eine Ablöse" : ""}` : `${p.name}: letztes Vertragsjahr (bis 30.06.${bosYear}) – verlängern oder verkaufen, sonst im Winter Bosman`,
      actions: (p.extendPlanned ? [] : [["Verlängerung planen", `extend:${p.id}`]]).concat(state.sales.some(x=>x.playerId === p.id) ? [] : [["Verkauf planen", `sell:${p.id}`]]),
      done: p.extendPlanned ? "Verlängerung geplant" : ""});
  });
  // recall only makes sense if the loan is still running during the window (otherwise: returnee decision)
  const winStartISO = `${win.start.getFullYear()}-${String(win.start.getMonth()+1).padStart(2,"0")}-${String(win.start.getDate()).padStart(2,"0")}`;
  const runsInWindow = l => { const e = loanEndISO(l.until); return !e || e >= winStartISO; };
  state.loans.filter(l=>listBase("playtime", l.playtime) === "bad" && activeLoan(l) && runsInWindow(l)).forEach(l=>tasks.push({icon:"↩", cls:"t-red",
    text:`${l.name}: Spielzeit schlecht bei ${l.club || "der Leihe"} – zurückholen oder Leihe abbrechen`, actions:[["Zurückholen", `recall:${l.id}`]]}));
  state.players.filter(p=>listBase("squadRoles", p.squadRole) === "sell" && !state.sales.some(x=>x.playerId === p.id)).forEach(p=>tasks.push({icon:"€", cls:"t-amber",
    text:`${p.name}: Kaderrolle „Abgabe“, aber nicht auf der Verkaufsliste`, actions:[["Verkauf planen", `sell:${p.id}`]]}));
  state.sales.filter(x=>listBase("saleStatus", x.status) !== "agreed").forEach(x=>{ const p = playerById(x.playerId); if(p) tasks.push({icon:"€", cls:"",
    text:`${p.name}: auf der Verkaufsliste (${SALE_STATUS[x.status]}${x.price ? ", " + fmtEUR(x.price) : ""})`, actions:[["Verkäufe", "tab:sell"]]}); });
  state.scouting.filter(t=>listBase("scoutStatus", t.status) === "fixed").forEach(t=>tasks.push({icon:"✍", cls:"t-green",
    text:`${t.name}: Transfer fixiert – in den Kader übernehmen, sobald er in FM durch ist`, actions:[["Verpflichten", `sign:${t.id}`]]}));
  if(win.key === "summer") returningLoans().filter(l=>!l.returnPlan).forEach(l=>tasks.push({icon:"↺", cls:"t-amber",
    text:`${l.name} kehrt von der Leihe zurück – einplanen, erneut verleihen oder verkaufen?`, actions:[["Entscheiden", "scroll:hubLoans"]]}));
  return tasks;
}
function hubStockCount(pos){
  const {entries} = futureSquadEntries();
  const sure = entries.filter(e=>e.pos === pos && FUTURE_KIND[e.kind] && FUTURE_KIND[e.kind].counted).length;
  const maybe = entries.filter(e=>e.pos === pos && FUTURE_KIND[e.kind] && FUTURE_KIND[e.kind].uncertain).length;
  return {sure, maybe};
}
function renderTransferPlan(){ return withRenderCache(_renderTransferPlan); }
function _renderTransferPlan(){
  const box = qs("#tr-plan"); if(!box) return;
  const win = hubWindow();
  const sel = `<div class="seg seg-sm" id="hubWinSel" role="tablist" aria-label="Fenster">${[["auto","Automatisch"],["summer","Sommer"],["winter","Winter"]].map(([k,l])=>`<button data-hubwin="${k}" class="${state.ui.hubWindow === k ? "active" : ""}">${l}</button>`).join("")}</div>`;
  if(!win){ box.innerHTML = `<div class="card"><div class="hub-head"><h2>Fenster-Plan</h2>${sel}</div><p class="empty">Keine Transferfenster hinterlegt. Trage sie unter Zahnrad → Verein &amp; Spielstand ein (z. B. „01.07.–01.09.“).</p></div>`; return; }
  const tasks = hubTasks(win);
  const fmtD = d => d.toLocaleDateString("de-DE", {day:"2-digit", month:"2-digit", year:"numeric"});
  const status = win.open ? `<span class="badge ok">offen</span> schließt ${win.days === 0 ? "heute" : `in ${win.days} Tagen`}` : `öffnet in <strong>${win.days}</strong> Tagen`;
  const season = win.key === "summer" ? `Saison ${win.start.getFullYear()}/${String((win.start.getFullYear()+1)%100).padStart(2,"0")}` : `Saison ${win.start.getFullYear()-1}/${String(win.start.getFullYear()%100).padStart(2,"0")}`;
  let html = `
    <div class="card hub-top ${win.key}">
      <div class="hub-head">
        <div><h2>${win.key === "summer" ? "☀" : "❄"} ${win.label} ${win.start.getFullYear()}</h2>
          <div class="muted small">${fmtD(win.start)} – ${fmtD(win.end)} · ${status} · ${season}${state.ui.hubWindow === "auto" ? "" : " · manuell gewählt"}</div></div>
        ${sel}
      </div>
      <div class="hub-links"><span class="muted small">Budget: siehe Übersicht oben</span><button class="btn btn-sm" data-hub="tab:buy">Einkäufe →</button><button class="btn btn-sm" data-hub="tab:sell">Verkäufe →</button></div>
    </div>
    <div class="card"><div class="card-head"><h2>Aufgaben für dieses Fenster</h2><span class="muted small">${tasks.length ? tasks.length + " offen" : ""}</span></div>
      ${tasks.length ? `<ul class="hub-tasks">${tasks.map(t=>`<li class="${t.cls}"><span class="ht-icon" aria-hidden="true">${t.icon}</span><span class="ht-text">${esc(t.text)}${t.done ? ` <span class="badge ok">${esc(t.done)}</span>` : ""}</span>
        <span class="ht-actions">${t.actions.map(([l,a])=>`<button class="btn btn-sm" data-hub="${esc(a)}">${esc(l)}</button>`).join("")}</span></li>`).join("")}</ul>`
        : `<div class="future-ok">✓ Nichts offen für dieses Fenster.</div>`}
    </div>`;
  if(win.key === "summer"){
    const rows = POS_LIST.map(pos=>{ const c = hubStockCount(pos), need = POS_NEED(pos); return {pos, need, sure:c.sure, maybe:c.maybe, gap:Math.max(0, need - c.sure)}; });
    const byPos = pos => state.scouting.filter(t=>t.pos === pos).sort((a,b)=>(a.shortlist || 9) - (b.shortlist || 9) || b.priority - a.priority || GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
    const posOrder = rows.slice().sort((a,b)=>b.gap - a.gap || POS_LIST.indexOf(a.pos) - POS_LIST.indexOf(b.pos)).map(r=>r.pos).filter(pos=>byPos(pos).length || rows.find(r=>r.pos === pos).gap);
    const loans = returningLoans();
    html += `<div class="hub-grid">
      <div class="card"><div class="card-head"><h2>Soll / Ist je Position</h2><span class="muted small">${esc(futureSquadEntries().label)}</span></div>
        <table class="res-table hub-need"><thead><tr><th>Pos.</th><th class="num">Soll</th><th class="num">Ist</th><th class="num">Bedarf</th><th>Shortlist</th></tr></thead><tbody>
        ${rows.map(r=>`<tr class="${r.gap ? "gap" : ""}"><td><strong>${r.pos}</strong> <span class="muted small">${esc(POS_NAME[r.pos] || "")}</span></td>
          <td class="num"><input type="number" min="0" max="8" value="${r.need}" data-hub-target="${r.pos}" aria-label="Soll ${r.pos}" class="w-xs"></td>
          <td class="num">${r.sure}${r.maybe ? ` <span class="muted small">(+${r.maybe} unsicher)</span>` : ""}</td>
          <td class="num">${r.gap ? `<strong class="neg">${r.gap}</strong>` : '<span class="pos">✓</span>'}</td>
          <td class="small">${(()=>{ const sl = byPos(r.pos).filter(t=>t.shortlist); return sl.length ? sl.map(t=>`${t.shortlist}. ${esc(t.name)}`).join(" · ") : (byPos(r.pos).length ? `<span class="muted">${byPos(r.pos).length} Ziel${byPos(r.pos).length === 1 ? "" : "e"}, keine Wahl</span>` : (r.gap ? '<span class="neg">keine Ziele</span>' : "")); })()}</td></tr>`).join("")}
        </tbody></table>
        <p class="hint">„Ist“ = sicher im Kader nächster Saison (bleibt, Verlängerung, Rückkehrer, fixierte Neuzugänge, aufrückende Talente) auf der Hauptposition. Das Soll gilt auch für die Warnungen unter Kader → Nächste Saison.</p>
      </div>
      <div class="card" id="hubLoans"><div class="card-head"><h2>Leih-Rückkehrer</h2></div>
        ${loans.length ? `<ul class="hub-loans">${loans.map(l=>`<li class="${listBase("playtime", l.playtime) === "bad" ? "loan-bad" : ""}">
          <div class="grow"><strong>${esc(l.name)}</strong> <span class="muted small">${l.pos} · ${l.age} J. · ${esc(l.club || "")}${l.playtime ? " · Spielzeit " + esc(PLAYTIME[l.playtime]) : ""}${listBase("loanClauses", l.clause) === "buy" ? " · Kaufoption" : ""}</span></div>
          <select data-hub-return="${l.id}" aria-label="Plan für ${esc(l.name)}">${options({"":"— offen —", keep:"Einplanen", loan:"Erneut verleihen", sell:"Verkaufen"}, l.returnPlan)}</select></li>`).join("")}</ul>
          <p class="hint">„Erneut verleihen“ und „Verkaufen“ zählen im Zukunfts-Kader nicht mit. Verkaufen kannst du einen Rückkehrer auf der Verkaufsliste, sobald er zurück im Kader ist.</p>`
          : `<p class="empty">Keine Leihspieler kehren zur neuen Saison zurück.</p>`}
      </div>
    </div>
    <div class="card"><div class="card-head"><h2>Shortlist nach Position</h2><button class="btn btn-sm" data-hub="tab:buy">+ Transferziel</button></div>
      ${posOrder.length ? posOrder.map(pos=>{ const r = rows.find(x=>x.pos === pos), list = byPos(pos);
        return `<div class="sl-pos ${r.gap ? "gap" : ""}"><div class="sl-head"><strong>${pos}</strong> ${r.gap ? `<span class="badge unhappy">Bedarf ${r.gap}</span>` : '<span class="muted small">gedeckt</span>'}</div>
          ${list.length ? `<table class="res-table"><tbody>${list.map(t=>`<tr><td><select data-hub-rank="${t.id}" aria-label="Wahl für ${esc(t.name)}" class="w-sm">${options({0:"—",1:"1. Wahl",2:"2. Wahl",3:"3. Wahl"}, String(t.shortlist))}</select></td>
            <td><strong>${esc(t.name)}</strong> <span class="muted small">${t.age} J.</span></td><td><span class="grade-pill">${esc(t.grade)}</span></td><td class="small">${esc(SCOUT_STATUS[t.status] || "")}</td>
            <td class="num small">${fmtEUR(t.fee)}</td><td class="num small">${fmtWage(t.wage)}</td></tr>`).join("")}</tbody></table>`
            : `<p class="empty small">Noch keine Transferziele für ${pos}.</p>`}</div>`; }).join("")
        : `<p class="empty">Keine Transferziele und kein Bedarf – unter „Einkäufe“ Ziele anlegen.</p>`}
    </div>`;
  } else {
    const Y = win.start.getFullYear();
    const bos = state.players.filter(p=>p.contractUntil === Y);
    const recall = state.loans.filter(l=>(listBase("playtime", l.playtime) === "bad" || l.recallCheck) && activeLoan(l));
    const gaps = POS_LIST.map(pos=>{
      const all = state.players.filter(p=>p.pos === pos), out = all.filter(p=>UNAVAILABLE.includes(p.status));
      return {pos, avail: all.length - out.length, need: POS_NEED(pos), out};
    }).filter(g=>g.avail < g.need);
    html += `<div class="hub-grid">
      <div class="card hub-wide"><div class="card-head"><h2>⚖ Bosman-Liste</h2><span class="muted small">Verträge bis 30.06.${Y}</span></div>
        ${bos.length ? `<div class="table-wrap"><table class="res-table hub-bos"><thead><tr><th>Spieler</th><th>Kaderrolle</th><th>Status</th><th>Verlängerung</th><th></th></tr></thead><tbody>
          ${bos.map(p=>`<tr><td><strong>${plink(p.id, p.name)}</strong> <span class="muted small">${p.pos} · ${p.age} J.</span>${bosmanMarked(p) ? ' <span class="bosman-tag">B</span>' : ""}</td>
            <td class="small">${esc(SQUAD_ROLES[p.squadRole])}</td><td class="small">${esc(STATUS[p.status] || "Verfügbar")}</td>
            <td><label class="check-label small"><input type="checkbox" data-hub-extend="${p.id}" ${p.extendPlanned ? "checked" : ""}> geplant</label></td>
            <td>${state.sales.some(x=>x.playerId === p.id) ? '<span class="muted small">auf Verkaufsliste</span>' : `<button class="btn btn-sm" data-hub="sell:${p.id}">Verkauf planen</button>`}</td></tr>`).join("")}</tbody></table></div>
          <p class="hint">Ab dem 01.01. dürfen diese Spieler mit anderen Vereinen verhandeln und im Sommer ablösefrei gehen. Spieler mit „Abgabe“ oder „Unzufrieden“ werden im Kader nicht markiert – sie erscheinen nur als Aufgabe.</p>`
          : `<div class="future-ok">✓ Kein Vertrag endet am 30.06.${Y}.</div>`}
      </div>
      <div class="hub-wide hub-pair">
      <div class="card"><div class="card-head"><h2>↩ Leihen zurückholen</h2></div>
        ${recall.length ? `<ul class="hub-loans">${recall.map(l=>`<li class="${listBase("playtime", l.playtime) === "bad" ? "loan-bad" : ""}"><div class="grow"><strong>${esc(l.name)}</strong> <span class="muted small">${esc(l.club || "")} · ${l.apps} Sp.${l.playtime ? " · Spielzeit " + esc(PLAYTIME[l.playtime]) : ""}</span></div>
          <button class="btn btn-sm" data-hub="recall:${l.id}">Zurückholen</button></li>`).join("")}</ul>` : `<p class="empty">Keine Leihe mit schlechter Spielzeit oder „Rückruf prüfen“.</p>`}
      </div>
      <div class="card"><div class="card-head"><h2>🩹 Kurzfristige Lücken</h2></div>
        ${gaps.length ? `<ul class="hub-loans">${gaps.map(g=>`<li><div class="grow"><strong>${g.pos}</strong> <span class="muted small">${g.avail} von ${g.need} verfügbar${g.out.length ? " · fehlt: " + g.out.map(p=>`${esc(p.name)} (${esc(STATUS[p.status])})`).join(", ") : ""}</span></div></li>`).join("")}</ul>
          <p class="hint">Grundlage: das Soll je Position (einstellbar im Sommer-Plan) und der aktuelle Status der Spieler.</p>` : `<div class="future-ok">✓ Auf jeder Position genug Spieler verfügbar.</div>`}
      </div>
      </div>
    </div>`;
  }
  box.innerHTML = html;
}
function initTransferPlan(){
  const box = qs("#tr-plan");
  box.addEventListener("click", e=>{
    const w = e.target.closest("[data-hubwin]");
    if(w){ state.ui.hubWindow = w.dataset.hubwin; saveState(); renderTransferPlan(); return; }
    const a = e.target.closest("[data-hub]"); if(!a) return;
    const [kind, id] = a.dataset.hub.split(":");
    if(kind === "tab"){ state.ui.transferTab = id; saveState(); renderRecruitment(); if(id === "buy" && a.textContent.includes("+")) openTargetModal(); }
    else if(kind === "sell"){ openSaleModal(id); }
    else if(kind === "extend"){ const p = playerById(id); if(p){ p.extendPlanned = true; saveState(); renderAll(); toast(`${p.name}: Verlängerung geplant`); } }
    else if(kind === "recall"){ const l = state.loans.find(x=>x.id === id); if(l) returnLoan(l); }
    else if(kind === "sign"){ const t = state.scouting.find(x=>x.id === id); if(t) signTarget(t); }
    else if(kind === "scroll"){ const el = qs("#" + id); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); }
  });
  box.addEventListener("change", e=>{
    const t = e.target;
    if(t.dataset.hubTarget){ state.transferPlan.targets[t.dataset.hubTarget] = clamp(Math.round(num(t.value, 0)), 0, 8); saveState(); renderTransferPlan(); renderSquad(); }
    else if(t.dataset.hubReturn){ const l = state.loans.find(x=>x.id === t.dataset.hubReturn); if(l){ l.returnPlan = t.value; saveState(); renderTransferPlan(); renderSquad(); } }
    else if(t.dataset.hubRank){ const x = state.scouting.find(y=>y.id === t.dataset.hubRank); if(x){ x.shortlist = clamp(num(t.value, 0), 0, 3); saveState(); renderTransferPlan(); } }
    else if(t.dataset.hubExtend){ const p = playerById(t.dataset.hubExtend); if(p){ p.extendPlanned = t.checked; saveState(); renderAll(); } }
  });
}


/* ==========================================================================
   DEADLINE DAY MODUS
   Automatically active in the last 3 days of an open window (switchable).
   The dashboard only knows the in-game DATE – the clock on the last day is set by hand
   and then runs in real time while the view is open.
   ========================================================================== */
let ddClock = null, ddTimer = null;             // {fmMin, realStart}
let ddCalc = {kind:"buy", fee:0, bonus:0, wage:0, share:50, name:""};
function deadlineState(){
  const ws = windowStatus();
  const auto = !!(ws && ws.open && ws.days <= 1);          // 8.9: 1 day before and the deadline day itself
  const mode = state.ui.deadline;
  return {ws, auto, mode, active: mode === "on" || (mode === "auto" && auto)};
}
const hhmm = min => `${String(Math.floor(min/60)).padStart(2,"0")}:${String(Math.floor(min%60)).padStart(2,"0")}`;
function renderDeadlineBar(){
  const el = qs("#deadlineBar"); if(!el) return;
  const ds = deadlineState();
  if(isNat()){ el.hidden = true; el.innerHTML = ""; return; }
  const cardShown = currentView === "home" && ds.ws && ds.ws.open;       // the portal card already shows it
  el.hidden = !ds.active || cardShown;
  if(el.hidden){ el.innerHTML = ""; return; }
  const b = budgetCalc(), ws = ds.ws;
  el.innerHTML = `<span class="ddb-brand">⚡ DEADLINE DAY</span>
    <span>${ws && ws.open ? `${esc(ws.label)} schließt ${ws.days === 0 ? `<strong>heute ${esc(state.ui.deadlineTime)}</strong>` : `in <strong>${ws.days}</strong> Tag${ws.days === 1 ? "" : "en"}`}` : "manuell aktiviert"}</span>
    <span>Transfer frei <strong>${fmtEUR(b.transferLeft)}</strong></span><span>Gehalt frei <strong>${fmtWage(b.wageLeft)}</strong></span>
    <button class="btn btn-sm" data-dd-open>Öffnen →</button>`;
}
function tickerItems(){
  const b = budgetCalc(), items = [];
  items.push(`💰 Transferbudget frei: ${fmtEUR(b.transferLeft)} · Gehaltsreserve: ${fmtWage(b.wageLeft)}`);
  state.transferLog.filter(t=>t.season === state.club.season).slice(-5).reverse().forEach(t=>items.push(`✅ OFFIZIELL: ${t.name} ${t.type === "in" ? "kommt" : "geht"}${t.fee ? " · " + fmtEUR(t.fee) : " · ablösefrei"}`));
  state.sales.forEach(x=>{ const p = playerById(x.playerId); if(!p) return; const st = listBase("saleStatus", x.status);
    if(st === "offer") items.push(`📨 Angebot für ${p.name}${x.price ? ": " + fmtEUR(x.price) : ""}`);
    if(st === "agreed") items.push(`🤝 Einigung erzielt: ${p.name} – nur noch abschließen`); });
  state.scouting.forEach(t=>{ const st = listBase("scoutStatus", t.status);
    if(st === "fixed") items.push(`✍ ${t.kind === "loan" ? "Leihe" : "Transfer"} fixiert: ${t.name} – fehlt nur die Unterschrift`);
    if(st === "negotiating") items.push(`🔄 Verhandlungen laufen: ${t.name} (${t.pos})`); });
  POS_LIST.forEach(pos=>{ const need = POS_NEED(pos) - hubStockCount(pos).sure; if(need > 0) items.push(`🎯 Bedarf ${pos}: ${need} Spieler fehlen für nächste Saison`); });
  state.loans.filter(l=>listBase("playtime", l.playtime) === "bad" && activeLoan(l)).forEach(l=>items.push(`↩ ${l.name}: kaum Spielzeit bei ${l.club || "der Leihe"} – Abbruch prüfen`));
  const bos = state.players.filter(p=>isBosman(p)).length; if(bos) items.push(`⚖ Bosman: ${bos} Spieler in den letzten 6 Vertragsmonaten`);
  return items.length > 1 ? items : items.concat("Ruhiger Deadline Day – keine offenen Deals");
}
/** Budget after a hypothetical deal, excluding the target itself if it is already counted in the budget. */
function affordAfter(fee, bonus, wageYear, counted){
  const b = budgetCalc();
  return {transfer: b.transferLeft + (counted ? counted.fee + counted.bonus : 0) - fee - bonus,
          wage: b.wageLeft + (counted ? counted.wage : 0) - wageYear};
}
const targetWage = t => t.kind === "loan" ? Math.round(t.wage * t.wageShare / 100) : t.wage;
const isCounted = t => listBase("scoutStatus", t.status) !== "watched" || state.ui.includeWatched;
function stopDeadlineClock(){ clearTimeout(ddTimer); ddTimer = null; clearTimeout(tcTimer); tcTimer = null; }
function initDeadline(){
  qs("#deadlineBar").addEventListener("click", e=>{ if(e.target.closest("[data-dd-open]")){ state.ui.transferTab = "center"; navigate("recruitment"); renderRecruitment(); } });
}


/* ==========================================================================
   LABOR (Beta) · new UIs to try out before they replace the old ones
   ========================================================================== */
// 11.7: Admin-Zentrale – first what applies to ALL saves, then what belongs to the active save
const ADMIN_GROUPS = [
  {label:"Allgemein · alle Spielstände", tabs:["home","backup","storage","hotkeys","errors","security","changelog"]},
  {label:"Spielstand", save:true, tabs:["overview","notes","log","restore","health","maintenance","raw","lists","fields"]}
];
const ADMIN_ICONS = {home:"🛡", backup:"🗄", storage:"💾", hotkeys:"⌨", errors:"⚠", overview:"◎", notes:"✎", log:"☰", restore:"⟲", health:"✚", maintenance:"🧹", raw:"⌗", lists:"≡", fields:"✦", security:"🔒", changelog:"⧗"};
/* ---------- new admin overview: health score, activity, quick actions ---------- */
function adminHealthScore(){
  const checks = runHealthChecks(), parts = [];
  let score = 100;
  const err = checks.filter(x=>x.sev === "error").length, warn = checks.filter(x=>x.sev === "warn").length;
  // capped per category: ten errors of one kind should not wipe out the whole score
  if(err){ score -= Math.min(45, err * 15); parts.push(`${err} Fehler in der Datenprüfung`); }
  if(warn){ score -= Math.min(20, warn * 5); parts.push(`${warn} Warnung${warn === 1 ? "" : "en"}`); }
  const meta = activeSlotMeta() || {}, folderOk = backupPerm === "granted" && backupCfg().enabled;
  const days = meta.lastExport ? (Date.now() - meta.lastExport) / 86400000 : Infinity;
  if(!folderOk && days > 7){ score -= 10; parts.push(meta.lastExport ? `letztes Backup vor ${Math.floor(days)} Tagen` : "noch kein Backup"); }
  const orphans = findOrphans().filter(c=>c.safe).reduce((a,c)=>a + c.items.length, 0);
  if(orphans){ score -= 5; parts.push(`${orphans} verwaiste Einträge`); }
  const u = storageUsage(), pct = u.total / u.quota * 100;
  if(pct > 80){ score -= 10; parts.push(`Speicher zu ${Math.round(pct)} % voll`); }
  return {score: clamp(Math.round(score), 0, 100), parts, orphans, pct, folderOk};
}
function adminOverview2(){
  const h = adminHealthScore(), log = readLog(), rps = readRestorePoints(), meta = activeSlotMeta() || {};
  const color = h.score >= 85 ? "var(--success)" : h.score >= 60 ? "var(--warning)" : "var(--danger)";
  const R = 52, C = 2 * Math.PI * R, dash = C * h.score / 100;
  // activity: log entries per real day, last 14 days
  const days = [...Array(14)].map((_,i)=>{ const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (13 - i)); return d; });
  const counts = days.map(d=>log.filter(e=>e.ts >= +d && e.ts < +d + 86400000).length);
  const maxC = Math.max(1, ...counts);
  qs("#adminBody").innerHTML = `
    <div class="adm2-hero">
      <div class="adm2-score">
        <svg viewBox="0 0 130 130" aria-hidden="true"><circle cx="65" cy="65" r="${R}" class="ring-bg"/><circle cx="65" cy="65" r="${R}" class="ring-fg" style="stroke:${color};stroke-dasharray:${dash.toFixed(1)} ${C.toFixed(1)}"/></svg>
        <div class="adm2-score-num"><strong>${h.score}</strong><span>Gesundheit</span></div>
      </div>
      <div class="adm2-hero-text">
        <h3>${h.score >= 85 ? "Alles im grünen Bereich" : h.score >= 60 ? "Ein paar Dinge verdienen Aufmerksamkeit" : "Hier sollte aufgeräumt werden"}</h3>
        ${h.parts.length ? `<ul>${h.parts.map(p=>`<li>${esc(p)}</li>`).join("")}</ul>` : `<p class="muted">Keine Fehler, aktuelles Backup, keine Altlasten.</p>`}
        <div class="adm2-actions">
          <button class="btn btn-sm btn-accent" data-adm2="backup">${h.folderOk ? "☁ Jetzt sichern" : "⇩ Backup exportieren"}</button>
          <button class="btn btn-sm" data-atab-go="health">Datenprüfung</button>
          <button class="btn btn-sm" data-atab-go="maintenance">Wartung${h.orphans ? ` (${h.orphans})` : ""}</button>
          <button class="btn btn-sm" data-adm2="rp">Wiederherstellungspunkt</button>
        </div>
      </div>
    </div>
    <div class="muted small adm2-version">Dashboard v${APP_VERSION} · Datenschema v${SCHEMA_VERSION} · <button class="linkish" data-atab-go="changelog">Changelog</button></div>
    <div class="adm2-tiles">
      <div class="adm2-tile"><span>Protokoll</span><strong>${fmtNum(log.length)}</strong><em>${log.length ? "zuletzt " + relTime(log[log.length-1].ts) : "leer"}</em></div>
      <div class="adm2-tile"><span>Wiederherstellungspunkte</span><strong>${rps.length}</strong><em>${rps[0] ? "neuester " + relTime(rps[0].ts) : "noch keiner"}</em></div>
      <div class="adm2-tile"><span>Backup</span><strong>${h.folderOk ? "☁ Ordner" : meta.lastExport ? relTime(meta.lastExport) : "nie"}</strong><em>${h.folderOk ? "automatisch aktiv" : "manueller Export"}</em></div>
      <div class="adm2-tile"><span>Speicher · ${store.mode === "idb" ? "Browser-Datenbank" : "localStorage"}</span><strong>${fmtNum(h.pct, 0)} %</strong><em>${fmtBytes(storageUsage().total)} von ${fmtBytes(store.quota)}</em></div>
    </div>
    <div class="adm2-cols">
      <div class="card"><div class="card-head"><h2>Aktivität · 14 Tage</h2><span class="muted small">${counts.reduce((a,b)=>a+b,0)} Änderungen</span></div>
        <div class="adm2-bars">${counts.map((c,i)=>`<div class="adm2-bar" title="${days[i].toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"})}: ${c}"><i style="height:${Math.round(c / maxC * 100)}%"></i><span>${days[i].getDate()}.</span></div>`).join("")}</div>
      </div>
      <div class="card"><div class="card-head"><h2>Letzte Änderungen</h2><button class="btn btn-sm btn-ghost" data-atab-go="log">Alle</button></div>
        ${log.length ? `<ul class="log-list compact">${log.slice(-6).reverse().map(logRowHTML).join("")}</ul>` : `<p class="empty">Noch nichts protokolliert.</p>`}
      </div>
    </div>`;
}
function initLabs(){
  const root = qs("#adminRoot");
  root.addEventListener("click", async e=>{
    const a = e.target.closest("[data-adm2]"); if(!a) return;
    if(a.dataset.adm2 === "backup"){ if(backupPerm === "granted" && backupCfg().enabled){ if(await writeFolderBackup("Manuell")) toast("Gesichert"); } else qs("#btnExport").click(); renderAdmin(); }
    if(a.dataset.adm2 === "rp"){ const r = createRestorePoint("Manuell gesichert", true); toast(r ? "Wiederherstellungspunkt angelegt" : "Speicher voll – bitte exportieren"); renderAdmin(); }
  });
}


/* ==========================================================================
   TRANSFER-CENTER (Beta) – summer & winter window with Deadline Day as its last phase.
   Own element ids (tc…), same logic as the Fenster-Plan and Deadline Day views.
   ========================================================================== */
let tcPos = "", tcAllTasks = false, tcTimer = null;
const IN_BASES = ["watched","negotiating","fixed"], OUT_BASES = ["listed","offer","agreed"];
const keyForBase = (obj, list, base) => Object.keys(obj).find(k=>listBase(list, k) === base) || base;
function tcPhase(win, ds){
  if(!win) return "none";
  if(ds.active && (win.open || ds.mode === "on")) return "deadline";
  return win.open ? "open" : "prep";
}
function tcFits(t){
  const a = affordAfter(t.fee, t.bonus, targetWage(t), isCounted(t) ? {fee:t.fee, bonus:t.bonus, wage:targetWage(t)} : null);
  return a.transfer >= 0 && a.wage >= 0;
}
function tcBoardCard(t){
  const need = POS_NEED(t.pos) - hubStockCount(t.pos).sure, st = listBase("scoutStatus", t.status), fit = tcFits(t);
  const go = st === "watched" ? `<button class="btn btn-sm" data-tc="inNext:${t.id}">Verhandeln</button>`
    : st === "negotiating" ? `<button class="btn btn-sm dd-go" data-tc="inNext:${t.id}">Fixieren</button>`
    : `<button class="btn btn-sm dd-go" data-tc="sign:${t.id}">${t.kind === "loan" ? "Ausleihen ✓" : "Verpflichten ✓"}</button>`;
  return `<div class="dd-card ${fit ? "" : "no-money"}">
    <div class="dd-card-top"><strong>${esc(t.name)}</strong> <span class="dd-pos">${t.pos}</span>${need > 0 ? `<span class="dd-need">Bedarf ${need}</span>` : ""}<span class="grade-pill">${esc(t.grade)}</span></div>
    <div class="dd-card-mid">${t.kind === "loan" ? `Leihgebühr ${fmtEUR(t.fee)} · ${t.wageShare} % Gehalt = ${fmtWage(targetWage(t))}` : `${fmtEUR(t.fee + t.bonus)} · ${fmtWage(t.wage)}`}</div>
    <div class="dd-card-bot"><span class="${fit ? "pos" : "neg"}">${fit ? "✓ passt ins Budget" : "✗ sprengt das Budget"}</span><span class="muted small">${esc(SCOUT_STATUS[t.status])}</span>
      <span class="dd-card-tools"><button class="tc-arrow" data-tc="edit:${t.id}" title="Bearbeiten" aria-label="${esc(t.name)} bearbeiten">✎</button><button class="tc-arrow" data-tc="del:${t.id}" title="Löschen" aria-label="${esc(t.name)} löschen">✕</button></span>${go}</div>
  </div>`;
}
function tcDealIn(t){
  const st = listBase("scoutStatus", t.status), i = IN_BASES.indexOf(st), fit = tcFits(t);
  return `<div class="tc-deal ${fit ? "" : "nofit"}" title="${fit ? "passt ins Budget" : "sprengt das Budget"}">
    <div class="tc-deal-top"><span class="tc-fit" aria-hidden="true"></span><strong>${esc(t.name)}</strong>${t.kind === "loan" ? '<span class="loan-in-tag">Leihe</span>' : ""}<span class="tc-pos">${t.pos}</span></div>
    <div class="tc-deal-mid">${t.kind === "loan" ? `Gebühr ${fmtEUR(t.fee)} · ${t.wageShare} % Gehalt` : fmtEUR(t.fee + t.bonus)} · ${fmtWage(targetWage(t))}</div>
    <div class="tc-deal-act">
      <button class="tc-arrow" data-tc="inPrev:${t.id}" ${i <= 0 ? "disabled" : ""} aria-label="Eine Stufe zurück">◀</button>
      <span class="tc-deal-tools"><button class="tc-arrow" data-tc="edit:${t.id}" title="Bearbeiten" aria-label="${esc(t.name)} bearbeiten">✎</button><button class="tc-arrow" data-tc="del:${t.id}" title="Löschen" aria-label="${esc(t.name)} löschen">✕</button></span>
      ${st === "fixed" ? `<button class="btn btn-sm tc-sign" data-tc="sign:${t.id}">✓ ${t.kind === "loan" ? "Ausleihen" : "Unterschrift"}</button>` : `<button class="tc-arrow" data-tc="inNext:${t.id}" aria-label="Eine Stufe weiter">▶</button>`}
    </div></div>`;
}
function tcDealOut(x){
  const p = playerById(x.playerId); if(!p) return "";
  const st = listBase("saleStatus", x.status), i = OUT_BASES.indexOf(st);
  return `<div class="tc-deal out">
    <div class="tc-deal-top"><strong>${plink(p.id, p.name)}</strong><span class="tc-pos">${p.pos}</span></div>
    <div class="tc-deal-mid">${x.price ? fmtEUR(x.price) : "Preis offen"} · spart ${fmtWage(p.salary)}</div>
    <div class="tc-deal-act">
      <button class="tc-arrow" data-tc="outPrev:${x.id}" ${i <= 0 ? "disabled" : ""} aria-label="Eine Stufe zurück">◀</button>
      ${st === "agreed" ? `<button class="btn btn-sm tc-sign" data-tc="complete:${x.id}">✓ Abschluss</button>` : `<button class="tc-arrow" data-tc="outNext:${x.id}" aria-label="Eine Stufe weiter">▶</button>`}
    </div></div>`;
}

/* ---------- Portal: transfer window at a glance (Beta, only with the Transfer-Center switched on) ---------- */
function renderHomeWindow(){ return withRenderCache(_renderHomeWindow); }
function _renderHomeWindow(){
  const card = qs("#homeWindowCard"); if(!card) return;
  // 8.9: only while a transfer window is actually open (the real current one, not a manual pick)
  const ws = windowStatus();
  const win = ws && ws.open ? windowSpan(ws.label === "Winterfenster" ? "winter" : "summer") : null;
  card.hidden = !win;
  if(!win) return;
  const ds = deadlineState(), phase = tcPhase(win, ds), b = budgetCalc(), tasks = hubTasks(win);
  const Y = win.start.getFullYear(), DAY = 86400000;
  const total = Math.max(1, Math.round((win.end - win.start) / DAY)), elapsed = win.open ? clamp(Math.round((ingameDate() - win.start) / DAY), 0, total) : 0;
  const cnt = (list, key, base) => list.filter(x=>listBase(key, x.status) === base).length;
  card.classList.toggle("hw-summer", win.key === "summer" && phase !== "deadline");
  card.classList.toggle("hw-winter", win.key === "winter" && phase !== "deadline");
  card.classList.toggle("hw-dd", phase === "deadline");
  qs("#hwTitle").innerHTML = `${win.key === "summer" ? "☀" : "❄"} ${esc(win.label)} ${Y}`;
  const big = phase === "prep" ? [win.days, "Tage bis zum Start"] : win.days === 0 ? ["HEUTE", `Deadline ${state.ui.deadlineTime} Uhr`] : [win.days, `Tag${win.days === 1 ? "" : "e"} bis zur Deadline`];
  qs("#homeWindow").innerHTML = `
    <div class="hw">
      <div class="hw-count"><span class="hw-kicker">${phase === "deadline" ? "⚡ Deadline Day" : win.open ? "Fenster offen" : "Vorbereitung"}</span><strong>${esc(String(big[0]))}</strong><span>${esc(big[1])}</span></div>
      <div class="hw-mid">
        <div class="hw-phases"><span class="${phase === "prep" ? "now" : "done"}">Vorbereitung</span><span class="${phase === "open" ? "now" : phase === "deadline" ? "done" : ""}">Fenster offen</span><span class="${phase === "deadline" ? "now" : ""}">Deadline Day</span></div>
        <div class="tc-progress"><i style="width:${phase === "prep" ? 0 : Math.round(elapsed / total * 100)}%"></i></div>
        <div class="hw-stats">
          <div><span>Zugänge</span><strong>${cnt(state.scouting, "scoutStatus", "negotiating") + cnt(state.scouting, "scoutStatus", "fixed")}</strong><em>${cnt(state.scouting, "scoutStatus", "fixed")} fixiert</em></div>
          <div><span>Abgänge</span><strong>${state.sales.length}</strong><em>${cnt(state.sales, "saleStatus", "agreed")} Einigung</em></div>
          <div class="${b.transferLeft < 0 ? "neg" : ""}"><span>Transfer frei</span><strong>${fmtEUR(b.transferLeft)}</strong></div>
          <div class="${b.wageLeft < 0 ? "neg" : ""}"><span>Gehalt frei</span><strong>${fmtWage(b.wageLeft)}</strong></div>
        </div>
      </div>
      <div class="hw-tasks">
        <div class="hw-tasks-head">${tasks.length ? `${tasks.length} Aufgabe${tasks.length === 1 ? "" : "n"} fürs Fenster` : "✓ Keine offenen Aufgaben"}</div>
        ${tasks.slice(0,3).map(t=>`<div class="hw-task ${t.cls}"><span aria-hidden="true">${t.icon}</span><span>${esc(t.text)}</span></div>`).join("")}
      </div>
    </div>`;
}

function renderTransferCenter(){ return withRenderCache(_renderTransferCenter); }
function _renderTransferCenter(){
  const box = qs("#tr-center"); if(!box) return;
  // the classic views use the same kind of controls → keep only one of them in the page
  { const pl = qs("#tr-plan"); if(pl) pl.innerHTML = ""; }
  const win = hubWindow(), ds = deadlineState(), phase = tcPhase(win, ds), b = budgetCalc();
  const winSel = `<div class="seg seg-sm" role="tablist" aria-label="Fenster">${[["auto","Auto"],["summer","☀ Sommer"],["winter","❄ Winter"]].map(([k,l])=>`<button data-tcwin="${k}" class="${state.ui.hubWindow === k ? "active" : ""}">${l}</button>`).join("")}</div>`;
  if(!win){ box.innerHTML = `<div class="card"><div class="hub-head"><h2>Transfer-Center</h2>${winSel}</div><p class="empty">Keine Transferfenster hinterlegt – unter Zahnrad → Verein &amp; Spielstand eintragen.</p></div>`; return; }
  const fmtD = d => d.toLocaleDateString("de-DE", {day:"2-digit", month:"2-digit"});
  const DAY = 86400000, today = ingameDate();
  const total = Math.max(1, Math.round((win.end - win.start) / DAY));
  const elapsed = win.open ? clamp(Math.round((today - win.start) / DAY), 0, total) : 0;
  const pct = win.open ? Math.round(elapsed / total * 100) : 0;
  const step = (key, label, sub) => { const order = ["prep","open","deadline"], cur = order.indexOf(phase === "none" ? "prep" : phase), me = order.indexOf(key);
    return `<div class="tc-step ${me < cur ? "done" : me === cur ? "now" : ""}"><span class="tc-dot"></span><div><strong>${label}</strong><em>${sub}</em></div></div>`; };
  const big = phase === "prep" ? `<strong>${win.days}</strong><span>Tage bis zum Start</span>` : win.days === 0 ? `<strong>HEUTE</strong><span>Deadline ${esc(state.ui.deadlineTime)} Uhr</span>` : `<strong>${win.days}</strong><span>Tag${win.days === 1 ? "" : "e"} bis zur Deadline</span>`;
  const tasks = hubTasks(win);
  const shownTasks = tcAllTasks ? tasks : tasks.slice(0, 5);
  const items = phase === "deadline" ? tickerItems().map(t=>`<span>${esc(t)}</span>`).join('<span class="dd-sep">◆</span>') : "";
  // pipeline
  const posFilter = x => !tcPos || x.pos === tcPos;
  const inDeals = state.scouting.filter(posFilter);
  const outDeals = state.sales.filter(x=>{ const p = playerById(x.playerId); return p && posFilter(p); });
  const doneIn = state.transferLog.filter(t=>t.type === "in" && t.season === state.club.season && posFilter(t)).slice(-6).reverse();
  const doneOut = state.transferLog.filter(t=>t.type === "out" && t.season === state.club.season && posFilter(t)).slice(-6).reverse();
  const col = (label, cards, extra) => `<div class="tc-col"><div class="tc-col-head">${label}<span>${cards.length}</span></div>${cards.join("") || '<div class="tc-empty">—</div>'}${extra || ""}</div>`;
  const doneCard = t => `<div class="tc-deal done"><div class="tc-deal-top"><strong>${esc(t.name)}</strong><span class="tc-pos">${t.pos || ""}</span></div><div class="tc-deal-mid">${t.fee ? fmtEUR(t.fee) : "ablösefrei"}${t.date ? " · " + fmtDate(t.date,{day:"2-digit",month:"2-digit"}) : ""}</div></div>`;
  // budget cockpit
  const tAvail = state.club.transferBudget + b.salesIncome, tPlan = b.fees + b.bonus;
  const wUsed = b.wagesNow - b.wageRelief + b.wages;
  const bar = (used, total2, left) => `<div class="tc-bar"><i style="width:${clamp(total2 ? used / total2 * 100 : 0, 0, 100)}%" class="${left < 0 ? "over" : used / Math.max(1,total2) > 0.9 ? "tight" : ""}"></i></div>`;
  const wageY = ddCalc.kind === "loan" ? Math.round(ddCalc.wage * ddCalc.share / 100) : ddCalc.wage;
  const calcRes = affordAfter(ddCalc.fee, ddCalc.kind === "loan" ? 0 : ddCalc.bonus, wageY, null);
  // side panel by season / phase
  const rows = POS_LIST.map(pos=>({pos, need:POS_NEED(pos), sure:hubStockCount(pos).sure}));
  const Y = win.start.getFullYear();
  let side = "";
  if(phase === "deadline"){
    const cand = POS_LIST.map(pos=>({pos, gap: POS_NEED(pos) - hubStockCount(pos).sure})).filter(g=>g.gap > 0)
      .map(g=>({...g, best: state.scouting.filter(t=>t.pos === g.pos).sort((a,c)=>(a.shortlist||9)-(c.shortlist||9) || c.priority-a.priority)[0]}));
    const outLoans = state.loans.filter(activeLoan).filter(l=>listBase("playtime", l.playtime) === "bad" || l.recallCheck);
    side += `<div class="card tc-side dd"><div class="card-head"><h2>⚡ Last Minute</h2></div>
      ${cand.length ? cand.map(g=>`<div class="tc-row"><span class="tc-pos">${g.pos}</span><div class="grow">Bedarf ${g.gap}${g.best ? ` · <strong>${esc(g.best.name)}</strong> <span class="muted small">${esc(SCOUT_STATUS[g.best.status])}</span>` : ' · <span class="neg">kein Ziel</span>'}</div>
        ${g.best && listBase("scoutStatus", g.best.status) !== "fixed" ? `<button class="btn btn-sm" data-tc="inNext:${g.best.id}">▶</button>` : g.best ? `<button class="btn btn-sm tc-sign" data-tc="sign:${g.best.id}">✓</button>` : `<button class="btn btn-sm" data-tc="addTarget:${g.pos}">+ Ziel</button>`}</div>`).join("") : `<div class="future-ok">✓ Kein offener Positionsbedarf.</div>`}
      ${outLoans.length ? `<div class="tc-sub-head">Leih-Abbrüche</div>${outLoans.map(l=>`<div class="tc-row ${listBase("playtime", l.playtime) === "bad" ? "bad" : ""}"><div class="grow"><strong>${esc(l.name)}</strong> <span class="muted small">${esc(l.club || "")}</span></div><button class="btn btn-sm" data-tc="recall:${l.id}">Abbrechen</button></div>`).join("")}` : ""}
    </div>`;
  }
  if(win.key === "summer"){
    const loans = returningLoans();
    side += `<div class="card tc-side"><div class="card-head"><h2>Kaderplanung ${esc(futureSquadEntries().label)}</h2></div>
      <div class="tc-strip">${rows.map(r=>`<button class="tc-chip ${r.sure < r.need ? "gap" : "ok"} ${tcPos === r.pos ? "sel" : ""}" data-tc="pos:${r.pos}" title="${esc(POS_NAME[r.pos] || r.pos)}: ${r.sure} von ${r.need}"><strong>${r.pos}</strong><span>${r.sure}/${r.need}</span></button>`).join("")}</div>
      <p class="hint" style="margin:6px 0 0">Klick auf eine Position filtert die Pipeline. Rot = weniger als das Soll.</p>
      ${loans.length ? `<div class="tc-sub-head">Leih-Rückkehrer</div>${loans.map(l=>`<div class="tc-row ${listBase("playtime", l.playtime) === "bad" ? "bad" : ""}"><div class="grow"><strong>${esc(l.name)}</strong> <span class="muted small">${l.pos}${l.playtime ? " · " + esc(PLAYTIME[l.playtime]) : ""}</span></div>
        <select data-tc-return="${l.id}" aria-label="Plan für ${esc(l.name)}">${options({"":"— offen —", keep:"Einplanen", loan:"Verleihen", sell:"Verkaufen"}, l.returnPlan)}</select></div>`).join("")}` : ""}
    </div>`;
  } else {
    const bos = state.players.filter(p=>p.contractUntil === Y && !p.loanIn);
    const gaps = POS_LIST.map(pos=>{ const all = state.players.filter(p=>p.pos === pos), out = all.filter(p=>UNAVAILABLE.includes(p.status)); return {pos, avail: all.length - out.length, need: POS_NEED(pos), out}; }).filter(g=>g.avail < g.need);
    const toJune = Math.max(0, Math.round((new Date(Y, 5, 30) - today) / DAY));
    side += `<div class="card tc-side"><div class="card-head"><h2>⚖ Bosman-Radar</h2><span class="muted small">30.06.${Y} · noch ${toJune} Tage</span></div>
      ${bos.length ? bos.map(p=>`<div class="tc-row"><div class="grow"><strong>${plink(p.id, p.name)}</strong> <span class="muted small">${p.pos} · ${esc(SQUAD_ROLES[p.squadRole])}</span></div>
        <label class="check-label small"><input type="checkbox" data-tc-extend="${p.id}" ${p.extendPlanned ? "checked" : ""}> verl.</label>
        ${state.sales.some(x=>x.playerId === p.id) ? "" : `<button class="btn btn-sm" data-tc="sell:${p.id}">€</button>`}</div>`).join("") : `<div class="future-ok">✓ Kein Vertrag endet am 30.06.${Y}.</div>`}
      ${gaps.length ? `<div class="tc-sub-head">Kurzfristige Lücken</div>${gaps.map(g=>`<div class="tc-row"><span class="tc-pos">${g.pos}</span><div class="grow small">${g.avail}/${g.need} verfügbar${g.out.length ? " · " + g.out.map(p=>esc(p.name)).join(", ") : ""}</div></div>`).join("")}` : ""}
    </div>`;
  }
  const normalHeroHTML = `
  <div class="tc-hero tc-${win.key}">
    <div class="tc-hero-top">
      <div><div class="tc-kicker">${phase === "deadline" ? "⚡ DEADLINE DAY" : win.open ? "Fenster offen" : "Vorbereitung"}${state.ui.hubWindow === "auto" ? "" : " · manuell"}</div>
        <h2>${win.key === "summer" ? "☀" : "❄"} ${win.label} ${Y}</h2>
        <div class="tc-sub">${fmtD(win.start)}–${fmtD(win.end)}${win.end.getFullYear()} · Transfer frei <strong class="${b.transferLeft < 0 ? "neg" : ""}">${fmtEUR(b.transferLeft)}</strong> · Gehalt frei <strong class="${b.wageLeft < 0 ? "neg" : ""}">${fmtWage(b.wageLeft)}</strong></div></div>
      <div class="tc-big">${big}</div>
      <div class="tc-controls">${winSel}${phase === "deadline" || state.ui.deadline !== "auto" ? `<div class="seg seg-sm" role="tablist" aria-label="Deadline-Modus">${[["auto","DD Auto"],["on","An"],["off","Aus"]].map(([k,l])=>`<button data-tcmode="${k}" class="${state.ui.deadline === k ? "active" : ""}">${l}</button>`).join("")}</div>` : ""}</div>
    </div>
    <div class="tc-phases">
      ${step("prep", "Vorbereitung", phase === "prep" ? `noch ${win.days} Tage` : "erledigt")}
      ${step("open", "Fenster offen", win.open ? `Tag ${elapsed + 1} von ${total + 1}` : `ab ${fmtD(win.start)}`)}
      ${step("deadline", "Deadline Day", phase === "deadline" ? "jetzt!" : "letzte 2 Tage")}
      <div class="tc-progress"><i style="width:${phase === "prep" ? 0 : pct}%"></i></div>
    </div>
    ${phase === "deadline" ? `
      <div class="tc-clock">${win.days === 0 || ds.mode === "on" ? `<label>FM-Uhrzeit <input type="time" id="tcFmTime" value="${ddClock ? hhmm(ddClock.fmMin) : "09:00"}"></label>
        <label>Deadline <input type="time" id="tcDeadline" value="${esc(state.ui.deadlineTime)}"></label>
        <button class="btn btn-sm" id="tcClockBtn">${ddClock ? "Uhr stellen" : "Uhr starten"}</button><span id="tcRemaining" class="tc-remaining"></span>` : `<span>Die Uhr erscheint am letzten Tag.</span>`}</div>
      <div class="dd-ticker"><div class="dd-track">${items}<span class="dd-sep">◆</span>${items}<span class="dd-sep">◆</span></div></div>` : ""}
  </div>
`;
  const ddHeroHTML = `
  <div class="tc-hero tc-dd dd2">
    <details class="dd2-menu"><summary aria-label="Einstellungen zum Deadline Day" title="Einstellungen">⋯</summary>
      <div class="dd2-menu-body">
        <div class="dd2-menu-label">Fenster</div>${winSel}
        <div class="dd2-menu-label">Deadline-Modus</div>
        <div class="seg seg-sm" role="tablist" aria-label="Deadline-Modus">${[["auto","Auto"],["on","An"],["off","Aus"]].map(([k,l])=>`<button data-tcmode="${k}" class="${state.ui.deadline === k ? "active" : ""}">${l}</button>`).join("")}</div>
        <label class="dd2-menu-label">Deadline-Uhrzeit <input type="time" id="tcDeadline" value="${esc(state.ui.deadlineTime)}"></label>
      </div>
    </details>
    <div class="dd2-top">
      <div class="dd2-left">
        <div class="tc-kicker">⚡ Deadline Day</div>
        <h2>${win.key === "summer" ? "☀" : "❄"} ${win.label} ${Y}</h2>
        <div class="dd2-meta">${fmtD(win.start)}–${fmtD(win.end)}${win.end.getFullYear()}${win.open ? ` · Tag ${elapsed + 1} von ${total + 1}` : ""}</div>
      </div>
      <div class="dd2-center">
        ${win.open && win.days === 0 || ds.mode === "on" ? `
          <div class="dd2-count" id="tcRemaining">${ddClock ? "" : '<span class="dd2-big">HEUTE</span>'}</div>
          <div class="dd2-sub">Deadline ${esc(state.ui.deadlineTime)} Uhr</div>
          <div class="dd2-clockset"><label>FM-Uhrzeit <input type="time" id="tcFmTime" value="${ddClock ? hhmm(ddClock.fmMin) : "09:00"}"></label>
            <button class="btn btn-sm" id="tcClockBtn">${ddClock ? "Neu stellen" : "Uhr starten"}</button></div>`
        : `<div class="dd2-count"><span class="dd2-big">${win.days}</span></div><div class="dd2-sub">Tag${win.days === 1 ? "" : "e"} bis zur Deadline · ${esc(state.ui.deadlineTime)} Uhr</div>`}
      </div>
      <div class="dd2-right">
        <div class="dd2-tile ${b.transferLeft < 0 ? "neg" : ""}"><span>Transfer frei</span><strong>${fmtEUR(b.transferLeft)}</strong>${b.transferLeft < 0 ? "<em>über Budget</em>" : ""}</div>
        <div class="dd2-tile ${b.wageLeft < 0 ? "neg" : ""}"><span>Gehalt frei</span><strong>${fmtWage(b.wageLeft)}</strong>${b.wageLeft < 0 ? "<em>über Budget</em>" : ""}</div>
      </div>
    </div>
    <div class="dd2-phases" aria-label="Phase"><span class="done">Vorbereitung</span><span class="done">Fenster offen</span><span class="now">Deadline Day</span></div>
    <div class="dd-ticker"><div class="dd-track">${items}<span class="dd-sep">◆</span>${items}<span class="dd-sep">◆</span></div></div>
  </div>
`;
  box.innerHTML = `
  ${phase === "deadline" ? ddHeroHTML : normalHeroHTML}
  ${tasks.length ? `<div class="tc-tasks">${shownTasks.map(t=>`<div class="tc-task ${t.cls}"><span aria-hidden="true">${t.icon}</span><span class="grow">${esc(t.text)}</span>${t.actions.map(([l,a])=>`<button class="btn btn-sm" data-tc="task:${esc(a)}">${esc(l)}</button>`).join("")}</div>`).join("")}
    ${tasks.length > 5 ? `<button class="btn btn-sm btn-ghost" data-tc="tasks:toggle">${tcAllTasks ? "Weniger anzeigen" : `+ ${tasks.length - 5} weitere Aufgaben`}</button>` : ""}</div>` : ""}
  ${phase === "deadline" ? (()=>{ const sortB = list => list.slice().sort((x,y)=>(POS_NEED(y.pos)-hubStockCount(y.pos).sure) - (POS_NEED(x.pos)-hubStockCount(x.pos).sure) || (x.shortlist||9)-(y.shortlist||9) || y.priority-x.priority);
      const buys = sortB(state.scouting.filter(t=>t.kind !== "loan")), lns = sortB(state.scouting.filter(t=>t.kind === "loan"));
      return `<div class="tc-boards">
        <div class="dd-panel"><h3>Panic-Buy-Board <button class="btn btn-sm" data-tc="addTarget:">+ Ziel</button></h3>${buys.length ? buys.map(tcBoardCard).join("") : '<p class="empty">Keine Kaufziele.</p>'}</div>
        <div class="dd-panel"><h3>Last-Minute-Leihen <button class="btn btn-sm" data-tc="addLoan:">+ Leihziel</button></h3>${lns.length ? lns.map(tcBoardCard).join("") : '<p class="empty">Noch keine Leihziele.</p>'}</div>
      </div>`; })() : ""}
  <div class="tc-grid">
    <div class="tc-left">
      <div class="card"><div class="card-head"><h2>Budget-Cockpit</h2></div>
        <div class="tc-gauge"><div class="tc-gauge-head"><span>Transferbudget</span><strong class="${b.transferLeft < 0 ? "neg" : ""}">${fmtEUR(b.transferLeft)} frei</strong></div>${bar(tPlan, tAvail, b.transferLeft)}
          <div class="tc-gauge-foot">${fmtEUR(tPlan)} eingeplant von ${fmtEUR(tAvail)}${b.salesIncome ? ` (inkl. ${fmtEUR(b.salesIncome)} Verkäufe)` : ""}</div></div>
        <div class="tc-gauge"><div class="tc-gauge-head"><span>Gehaltsbudget${wageSuffix()}</span><strong class="${b.wageLeft < 0 ? "neg" : ""}">${fmtWage(b.wageLeft)} frei</strong></div>${bar(wUsed, state.club.wageBudget, b.wageLeft)}
          <div class="tc-gauge-foot">${fmtWage(wUsed)} von ${fmtWage(state.club.wageBudget)} nach geplanten Deals</div></div>
        <div class="tc-sub-head">Schnell-Rechner</div>
        <div class="tc-calc">
          <select data-tcc="kind" aria-label="Art">${options({buy:"Kauf", loan:"Leihe"}, ddCalc.kind)}</select>
          ${moneyInput(ddCalc.fee, 'data-tcc="fee" aria-label="Ablöse bzw. Leihgebühr"')}
          ${moneyInput(wageToUnit(ddCalc.wage), 'data-tcc="wage" aria-label="Gehalt"', true)}
          ${ddCalc.kind === "loan" ? `<input type="number" min="0" max="100" data-tcc="share" value="${ddCalc.share}" aria-label="Gehaltsanteil in Prozent">` : moneyInput(ddCalc.bonus, 'data-tcc="bonus" aria-label="Handgeld"')}
        </div>
        <div class="tc-calc-res" id="tcCalcRes">${tcCalcText(calcRes)}</div>
        <div class="tc-calc-save"><input type="text" data-tcc="name" placeholder="Name (optional)" value="${esc(ddCalc.name)}" aria-label="Name für das neue Ziel"><button class="btn btn-sm" data-tc="calcSave:">Als ${ddCalc.kind === "loan" ? "Leihziel" : "Ziel"} anlegen</button></div>
      </div>
    </div>
    <div class="tc-main">
      <div class="card"><div class="card-head"><h2>Deal-Pipeline${tcPos ? ` · ${tcPos} <button class="btn btn-sm btn-ghost" data-tc="pos:">Filter aus</button>` : ""}</h2>
        <div class="tc-add"><button class="btn btn-sm" data-tc="addTarget:">+ Ziel</button><button class="btn btn-sm" data-tc="addLoan:">+ Leihziel</button><button class="btn btn-sm" data-tc="addSale:">+ Verkauf</button></div></div>
        <div class="tc-lane-label">Zugänge</div>
        <div class="tc-board">
          ${col("Beobachtet", inDeals.filter(t=>listBase("scoutStatus", t.status) === "watched").map(tcDealIn))}
          ${col("Verhandlung", inDeals.filter(t=>listBase("scoutStatus", t.status) === "negotiating").map(tcDealIn))}
          ${col("Fixiert", inDeals.filter(t=>listBase("scoutStatus", t.status) === "fixed").map(tcDealIn))}
          ${col("Unterschrieben", doneIn.map(doneCard))}
        </div>
        <div class="tc-lane-label">Abgänge</div>
        <div class="tc-board">
          ${col("Gelistet", outDeals.filter(x=>listBase("saleStatus", x.status) === "listed").map(tcDealOut))}
          ${col("Angebot", outDeals.filter(x=>listBase("saleStatus", x.status) === "offer").map(tcDealOut))}
          ${col("Einigung", outDeals.filter(x=>listBase("saleStatus", x.status) === "agreed").map(tcDealOut))}
          ${col("Verkauft", doneOut.map(doneCard))}
        </div>
      </div>
    </div>
    <div class="tc-right">${side}</div>
  </div>`;
  updateTcClock();
}
function tcCalcText(a){
  const ok = a.transfer >= 0 && a.wage >= 0;
  return `<span>danach <strong class="${a.transfer < 0 ? "neg" : "pos"}">${fmtEUR(a.transfer)}</strong> · <strong class="${a.wage < 0 ? "neg" : "pos"}">${fmtWage(a.wage)}</strong></span><span class="tc-verdict ${ok ? "yes" : "no"}">${ok ? "machbar" : "zu teuer"}</span>`;
}
function updateTcClock(){
  clearTimeout(tcTimer); tcTimer = null;
  const el = qs("#tcRemaining"); if(!el || !ddClock) return;
  const [dh, dm] = state.ui.deadlineTime.split(":").map(Number);
  const now = ddClock.fmMin + (Date.now() - ddClock.realStart) / 60000, left = dh*60 + dm - now;
  if(left <= 0){ el.innerHTML = `<span class="dd-over">DEADLINE VORBEI</span>`; return; }
  const secs = Math.floor(left * 60);
  el.innerHTML = `<span class="dd2-noch">noch</span> <span class="dd-digits">${String(Math.floor(secs/3600)).padStart(2,"0")}:${String(Math.floor(secs%3600/60)).padStart(2,"0")}:${String(secs%60).padStart(2,"0")}</span>`;
  if(qs("#tr-center.active") && currentView === "recruitment") tcTimer = setTimeout(updateTcClock, 1000);
}
function initTransferCenter(){
  qs("#hwOpen").addEventListener("click", ()=>{ state.ui.transferTab = "center"; saveState(); navigate("recruitment"); renderRecruitment(); });
  const box = qs("#tr-center");
  const moveIn = (t, dir) => { const i = IN_BASES.indexOf(listBase("scoutStatus", t.status)); t.status = keyForBase(SCOUT_STATUS, "scoutStatus", IN_BASES[clamp(i + dir, 0, 2)]); };
  const moveOut = (x, dir) => { const i = OUT_BASES.indexOf(listBase("saleStatus", x.status)); x.status = keyForBase(SALE_STATUS, "saleStatus", OUT_BASES[clamp(i + dir, 0, 2)]); };
  box.addEventListener("click", e=>{
    const w = e.target.closest("[data-tcwin]"); if(w){ state.ui.hubWindow = w.dataset.tcwin; saveState(); renderTransferCenter(); return; }
    const m = e.target.closest("[data-tcmode]"); if(m){ state.ui.deadline = m.dataset.tcmode; saveState(); renderDeadlineBar(); renderTransferCenter(); return; }
    if(e.target.closest("#tcClockBtn")){
      const [h, mi] = (qs("#tcFmTime").value || "09:00").split(":").map(Number);
      const dl = qs("#tcDeadline").value; if(/^\d{2}:\d{2}$/.test(dl)){ state.ui.deadlineTime = dl; saveState(); }
      ddClock = {fmMin: h*60 + mi, realStart: Date.now()}; renderTransferCenter(); return;
    }
    const a = e.target.closest("[data-tc]"); if(!a) return;
    const raw = a.dataset.tc, kind = raw.slice(0, raw.indexOf(":")), id = raw.slice(raw.indexOf(":") + 1);
    const t = state.scouting.find(x=>x.id === id), sale = state.sales.find(x=>x.id === id);
    const after = () => { saveState(); renderHeader(); renderDeadlineBar(); renderTransferCenter(); };
    if(kind === "inNext" && t){ moveIn(t, 1); after(); }
    else if(kind === "inPrev" && t){ moveIn(t, -1); after(); }
    else if(kind === "outNext" && sale){ moveOut(sale, 1); after(); }
    else if(kind === "outPrev" && sale){ moveOut(sale, -1); after(); }
    else if(kind === "sign" && t) signTarget(t);
    else if(kind === "edit" && t) openTargetEditModal(t);
    else if(kind === "del" && t) deleteTarget(t);
    else if(kind === "complete" && sale) completeSale(sale);
    else if(kind === "pos"){ tcPos = tcPos === id ? "" : id; renderTransferCenter(); }
    else if(kind === "recall"){ const l = state.loans.find(x=>x.id === id); if(l) returnLoan(l); }
    else if(kind === "sell") openSaleModal(id);
    else if(kind === "addTarget") openTargetModal(id ? {pos:id} : {});
    else if(kind === "addLoan") openTargetModal({kind:"loan"});
    else if(kind === "addSale") openSaleModal();
    else if(kind === "tasks"){ tcAllTasks = !tcAllTasks; renderTransferCenter(); }
    else if(kind === "calcSave"){
      const name = ddCalc.name.trim() || (ddCalc.kind === "loan" ? "Leihziel" : "Panikkauf");
      state.scouting.push({id:uid(), name, pos:"ZM", age:24, grade:"B", status:"negotiating", priority:3, fee:ddCalc.fee, bonus:ddCalc.kind === "loan" ? 0 : ddCalc.bonus, wage:ddCalc.wage, note:"Schnell-Rechner", kind:ddCalc.kind, wageShare:ddCalc.share});
      state = sanitizeState(state); saveState(); renderAll(); renderTransferCenter();
      toast(`„${name}“ angelegt (Verhandlung) – mit ✎ Position & Details ergänzen`);
    }
    else if(kind === "task"){
      // task actions from hubTasks: extend:…, sell:…, recall:…, sign:…, tab:…, scroll:…
      const [k2, id2] = id.split(":");
      if(k2 === "extend"){ const p = playerById(id2); if(p){ p.extendPlanned = true; saveState(); renderAll(); renderTransferCenter(); toast(`${p.name}: Verlängerung geplant`); } }
      else if(k2 === "sell") openSaleModal(id2);
      else if(k2 === "recall"){ const l = state.loans.find(x=>x.id === id2); if(l) returnLoan(l); }
      else if(k2 === "sign"){ const t2 = state.scouting.find(x=>x.id === id2); if(t2) signTarget(t2); }
      else if(k2 === "tab"){ state.ui.transferTab = id2; saveState(); renderRecruitment(); }
      else if(k2 === "scroll"){ const el = qs(".tc-right [data-tc-return]"); if(el) el.focus(); }
    }
  });
  box.addEventListener("change", e=>{
    const t = e.target;
    if(t.dataset.tcReturn){ const l = state.loans.find(x=>x.id === t.dataset.tcReturn); if(l){ l.returnPlan = t.value; saveState(); renderSquad(); renderTransferCenter(); } return; }
    if(t.dataset.tcExtend){ const p = playerById(t.dataset.tcExtend); if(p){ p.extendPlanned = t.checked; saveState(); renderAll(); renderTransferCenter(); } return; }
    if(t.dataset.tcc === "kind"){ ddCalc.kind = t.value; renderTransferCenter(); }
  });
  box.addEventListener("input", e=>{
    const k = e.target.dataset.tcc; if(!k || k === "kind") return;
    if(k === "name"){ ddCalc.name = e.target.value; return; }
    if(k === "share") ddCalc.share = clamp(Math.round(num(e.target.value, 0)), 0, 100);
    else if(k === "wage") ddCalc.wage = wageFromUnit(parseMoney(e.target.value));
    else ddCalc[k] = parseMoney(e.target.value);
    const wageY = ddCalc.kind === "loan" ? Math.round(ddCalc.wage * ddCalc.share / 100) : ddCalc.wage;
    const r = qs("#tcCalcRes"); if(r) r.innerHTML = tcCalcText(affordAfter(ddCalc.fee, ddCalc.kind === "loan" ? 0 : ddCalc.bonus, wageY, null));
  });
}



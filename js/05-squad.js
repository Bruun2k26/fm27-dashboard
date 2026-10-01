/* ==========================================================================
   SQUAD
   ========================================================================== */
let squadSort = {key:"pos", dir:1};

function initSquad(){
  // Filters always start empty – also when the browser tries to restore old form values on reload.
  qs("#squadSearch").value = "";
  ["#squadPosFilter","#squadRoleFilter","#squadStatusFilter"].forEach(id=>{ qs(id).value = ""; });
  qs("#squadPosFilter").innerHTML += POS_LIST.map(p=>`<option value="${p}">${p} – ${POS_NAME[p]}</option>`).join("");
  qs("#squadRoleFilter").innerHTML += options(SQUAD_ROLES, "");
  ["#squadSearch","#squadPosFilter","#squadRoleFilter","#squadStatusFilter"].forEach(sel=>
    qs(sel).addEventListener(sel==="#squadSearch"?"input":"change", renderSquad));
  qsa("#squadTable th[data-sort]").forEach(th=>{
    const act = ()=>{
      const key = th.dataset.sort;
      if(squadSort.key === key) squadSort.dir *= -1; else squadSort = {key, dir:1};
      renderSquad();
    };
    th.addEventListener("click", act);
    th.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); act(); }});
  });
  qs("#btnAddPlayer").addEventListener("click", ()=> openPlayerModal());
  // custom field columns come and go → one delegated handler on the head + edits in the body
  const sqHead = qs("#squadTable thead");
  const sqSort = th=>{ const key = th.dataset.sort; if(squadSort.key === key) squadSort.dir *= -1; else squadSort = {key, dir:1}; renderSquad(); };
  sqHead.addEventListener("click", e=>{ const th = e.target.closest('th.cf-head'); if(th && !e.target.closest(".col-resizer")) sqSort(th); });
  sqHead.addEventListener("keydown", e=>{ const th = e.target.closest('th.cf-head'); if(th && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); sqSort(th); } });
  qs("#squadTbody").addEventListener("change", e=>{
    const el = e.target.closest("[data-cf]"); if(!el) return;
    const p = playerById(el.closest("tr").dataset.id); if(!p) return;
    readCFCell(el, p); saveState();
  });
  qs("#btnResetFilters").addEventListener("click", resetSquadFilters);
  qs("#squadShowLoaned").addEventListener("change", e=>{ state.ui.showLoaned = e.target.checked; saveState(); renderSquad(); });
  qs("#squadTbody").addEventListener("click", e=>{ const r = e.target.closest("[data-return-loan]"); if(r){ const l = state.loans.find(x=>x.id === r.dataset.returnLoan); if(l) returnLoan(l); } });
  qs("#squadTbody").addEventListener("click", e=>{ if(e.target.closest("[data-reset-filters]")) resetSquadFilters(); });
  qsa("#squadTabs [data-tab]").forEach(b=> b.addEventListener("click", ()=>{ state.ui.squadTab = b.dataset.tab; saveState(); renderSquad(); }));
  qs("#futureSquad").addEventListener("change", e=>{
    if(e.target.id !== "futureUncertain") return;
    state.ui.futureUncertain = e.target.checked; saveState(); renderFutureSquad();
  });
  qs("#futureSquad").addEventListener("click", e=>{
    const b = e.target.closest("[data-extend]"); if(!b) return;
    const p = playerById(b.dataset.extend); if(!p) return;
    p.extendPlanned = !p.extendPlanned; saveState(); renderFutureSquad();
    toast(p.extendPlanned ? `Verlängerung mit ${p.name} eingeplant` : `Verlängerung mit ${p.name} verworfen`);
  });
  qs("#btnSquadLoans").addEventListener("click", ()=>{ state.ui.devTab = "loans"; saveState(); renderDevelopment(); navigate("development"); });
  qs("#squadDepth").addEventListener("click", e=>{
    const c = e.target.closest("[data-pos]"); if(!c) return;
    const f = qs("#squadPosFilter");
    f.value = f.value === c.dataset.pos ? "" : c.dataset.pos;
    renderSquad();
  });

  const tb = qs("#squadTbody");
  tb.addEventListener("change", e=>{
    const el = e.target.closest("[data-field]"); if(!el) return;
    const p = playerById(el.closest("tr").dataset.id); if(!p) return;
    const f = el.dataset.field;
    if(f === "altPos"){
      p.altPos = el.value.toUpperCase().split(/[\s,;/]+/).filter(x=>POS_LIST.includes(x) && x!==p.pos);
      el.value = p.altPos.join(", ");
    } else if(f === "age" && p.birthDate){
      // age is derived from the birth date → keep day/month, shift the birth year
      const delta = clamp(Math.round(num(el.value, p.age)), 14, 45) - p.age;
      const b = parseISO(p.birthDate);
      b.setFullYear(b.getFullYear() - delta);
      p.birthDate = toISO(b);
      p.age = ageOn(p.birthDate, ingameDate());
      el.value = p.age;
    } else if(el.type === "checkbox"){
      p[f] = el.checked;
      const lbl = el.parentElement && el.parentElement.querySelector("span"); if(lbl && f === "nominated") lbl.textContent = el.checked ? "Nominiert" : "—";
    } else if("money" in el.dataset){
      p[f] = Math.max(0, readInput(el));
    } else if(el.type === "number"){
      p[f] = num(el.value);
      if(f === "contractUntil") p[f] = clamp(Math.round(p[f]), 2000, 2100);
      if(f === "caps" || f === "intGoals"){ p[f] = Math.max(0, Math.round(p[f])); el.value = p[f]; }
    } else {
      p[f] = el.value;
      if(f === "name") p.name = p.name.trim() || "Unbenannt";
    }
    saveState();
    if(["pos","squadRole","status","contractUntil"].includes(f)) renderSquad();
    renderHome(); renderTactics(); renderHeader();
  });
  tb.addEventListener("dblclick", e=>{
    const av = e.target.closest(".avatar"); if(!av) return;
    openPlayerModal(playerById(av.closest("tr").dataset.id));
  });
  tb.addEventListener("click", e=>{
    const tr = e.target.closest("tr[data-id]"); if(!tr) return;
    const p = playerById(tr.dataset.id);
    const star = e.target.closest("[data-star]");
    if(star){ p.rating = num(star.dataset.star); saveState(); renderSquad(); return; }
    if(e.target.closest("[data-edit]")) return openPlayerModal(p);
    if(e.target.closest("[data-loan]")) return loanOutPlayer(p);
    if(e.target.closest("[data-del]")) removeWithUndo("players", p.id, `„${p.name}“`, ()=>{ renderSquad(); renderTactics(); renderHome(); });
  });
}

/** Transfer value is optional: the column only appears once at least one player has one (e.g. after an FM import). */
// loaned-out players are shown in the squad too (8.9) → their stored values count as well
const hasTransferValues = () => state.players.some(p=>p.valueMax > 0) || state.loans.some(l=>l.player && l.player.valueMax > 0);
function fmtValue(p){
  if(!p.valueMax) return "—";
  if(!p.valueMin || p.valueMin === p.valueMax) return fmtEUR(p.valueMax);
  // "€2,1 – 3,5 Mio." instead of repeating unit and currency
  const a = fmtEUR(p.valueMin), b = fmtEUR(p.valueMax);
  const unit = / (Mio\.|Tsd\.)$/.exec(b);
  return unit && a.endsWith(unit[0]) ? `${a.slice(0, -unit[0].length)} – ${b.slice(1)}` : `${a} – ${b}`;
}
const valueMid = p => p.valueMax ? Math.round((p.valueMin || p.valueMax) / 2 + p.valueMax / 2) : 0;

function ageCellHTML(p){
  const b = birthdayInfo(p);
  return `<div class="age-cell"><input type="number" class="w-xs" value="${p.age}" data-field="age" aria-label="Alter"
      title="${b ? esc(b.text) : "Kein Geburtsdatum hinterlegt – über ✎ eintragen"}">`
    + (b && b.days <= 7 ? `<span class="bday ${b.days === 0 ? "today" : ""}" title="${esc(b.text)}" aria-label="${esc(b.text)}">🎂</span>` : "")
    + `</div>`;
}

/** Human-readable list of active squad filters (search, position, role, status). */
function squadActiveFilters(){
  const out = [], sel = id => qs(id);
  const q = sel("#squadSearch").value.trim();
  if(q) out.push(`Suche „${q}“`);
  [["#squadPosFilter",""],["#squadRoleFilter",""],["#squadStatusFilter",""]].forEach(([id])=>{
    const el = sel(id); if(el.value) out.push(el.options[el.selectedIndex].textContent.trim());
  });
  return out;
}
function resetSquadFilters(){
  qs("#squadSearch").value = "";
  ["#squadPosFilter","#squadRoleFilter","#squadStatusFilter"].forEach(id=>qs(id).value = "");
  renderSquad();
}

function renderSquadDepth(){
  const active = qs("#squadPosFilter").value;
  qs("#squadDepth").innerHTML = POS_LIST.map(pos=>{
    const nat = state.players.filter(p=>p.pos===pos && !UNAVAILABLE.includes(p.status)).length;
    const alt = state.players.filter(p=>p.altPos.includes(pos)).length;
    const need = pos === "IV" ? 3 : 2;
    return `<button class="depth-chip ${nat<need?"thin":""} ${active===pos?"active":""}" data-pos="${pos}"
      title="${POS_NAME[pos]}: ${nat} verfügbar auf Hauptposition, ${alt} als Nebenposition">
      ${pos} <strong>${nat}</strong>${alt?`<span style="color:var(--text-dim)">+${alt}</span>`:""}</button>`;
  }).join("");
}

function renderSquad(){
  const tab = state.ui.squadTab;
  qsa("#squadTabs [data-tab]").forEach(b=>b.classList.toggle("active", b.dataset.tab === tab));
  qs("#squad-current").classList.toggle("active", tab === "current");
  qs("#squad-future").classList.toggle("active", tab === "future");
  qs("#squad-contracts").classList.toggle("active", tab === "contracts");
  const showValue = hasTransferValues();
  const nat = isNat();
  ["nominated","homeClub","caps","intGoals"].forEach(k=>{ const th = qs(`#squadTable thead th[data-col="${k}"]`); if(th) th.hidden = !nat; });
  ["salary","contractUntil"].forEach(k=>{ const th = qs(`#squadTable thead th[data-col="${k}"]`); if(th) th.hidden = nat; });
  { const sf = qs("#squadStatusFilter"), op = qs('#squadStatusFilter option[value="nominated"]');
    if(nat && !op) sf.insertAdjacentHTML("afterbegin", '<option value="nominated">Nur Nominierte</option>');
    if(!nat && op){ if(sf.value === "nominated") sf.value = ""; op.remove(); } }
  if(nat && ["future","contracts"].includes(state.ui.squadTab)) state.ui.squadTab = "current";
  renderCFHeads("squadTable", "squad");
  if(squadSort.key.startsWith("cf:") && !cfById(squadSort.key.slice(3))) squadSort = {key:"pos", dir:1};   // field deleted
  qs("#thValue").hidden = !showValue;
  applyColWidths("squadTable");
  if(tab === "future") renderFutureSquad();
  if(tab === "contracts") renderContractsView();
  renderSquadDepth();
  qs("#btnSquadLoans").textContent = `Verliehen (${state.loans.length}) →`;
  qs("#squadShowLoaned").checked = state.ui.showLoaned !== false;
  const q = qs("#squadSearch").value.trim().toLowerCase();
  // make active filters obvious – an empty table must never look like missing data
  const activeFilters = squadActiveFilters();
  ["#squadSearch","#squadPosFilter","#squadRoleFilter","#squadStatusFilter"].forEach(sel=>qs(sel).classList.toggle("filter-on", !!qs(sel).value.trim()));
  qs("#btnResetFilters").hidden = !activeFilters.length;
  const posF = qs("#squadPosFilter").value, roleF = qs("#squadRoleFilter").value, statF = qs("#squadStatusFilter").value;

  const rows = state.players.filter(p=>{
    if(q && !(p.name.toLowerCase().includes(q) || p.note.toLowerCase().includes(q) || (p.nation || "").toLowerCase().includes(q) || (p.homeClub || "").toLowerCase().includes(q))) return false;
    if(posF && p.pos !== posF && !p.altPos.includes(posF)) return false;
    if(roleF && p.squadRole !== roleF) return false;
    if(statF === "available" && UNAVAILABLE.includes(p.status)) return false;
    if(statF === "contract" && contractMonthsLeft(p) > 12) return false;
    if(statF === "nominated"){ if(!p.nominated) return false; }
    else if(statF && !["available","contract"].includes(statF) && p.status !== statF) return false;
    return true;
  });
  const k = squadSort.key;
  const squadCmp = (a,b)=>{
    let r;
    if(k.startsWith("cf:")){ const e = cfEmptyOrder(k.slice(3), a, b); if(e) return e; r = cfCompare(k.slice(3), a, b); }
    else if(k === "pos") r = POS_LIST.indexOf(a.pos)-POS_LIST.indexOf(b.pos);
    else if(k === "squadRole") r = SQUAD_ROLE_ORDER.indexOf(a.squadRole)-SQUAD_ROLE_ORDER.indexOf(b.squadRole);
    else if(typeof a[k] === "string") r = a[k].localeCompare(b[k], "de");
    else r = a[k]-b[k];
    return (r || a.name.localeCompare(b.name,"de")) * squadSort.dir;
  };
  rows.sort(squadCmp);
  qsa("#squadTable th[data-sort]").forEach(th=>{
    th.classList.toggle("sorted", th.dataset.sort === k);
    th.classList.toggle("desc", th.dataset.sort === k && squadSort.dir < 0);
  });

  const playerRowHTML = p=>{
    const m = contractMonthsLeft(p), lv = contractLevel(m);
    return `<tr data-id="${p.id}" class="${selectedPlayers.has(p.id) ? "selected" : ""}">
      <td class="sel-col" data-col="sel" data-label="Auswahl"><input type="checkbox" data-sel="${p.id}" ${selectedPlayers.has(p.id) ? "checked" : ""} aria-label="${esc(p.name)} auswählen"></td>
      <td data-col="name" data-label="Name"><div class="player-cell"><span class="avatar">${esc(initials(p.name))}</span><input type="text" class="w-name" value="${esc(p.name)}" data-field="name" aria-label="Name">${p.loanIn ? '<span class="loan-in-tag" title="Ausgeliehen – geht am Leihende zurück">Leihe</span>' : ""}</div></td>
      ${nat ? `<td data-col="nominated" data-label="Nominiert" class="nat-nom-cell"><label class="nom-toggle"><input type="checkbox" data-field="nominated" ${p.nominated ? "checked" : ""} aria-label="${esc(p.name)} nominiert"><span>${p.nominated ? "Nominiert" : "—"}</span></label>${campCount(p.id) ? `<span class="nom-count" title="In ${campCount(p.id)} gespeicherten Lehrgängen">${campCount(p.id)}×</span>` : ""}</td>` : ""}
      <td data-col="pos" data-label="Pos."><select class="w-pos" data-field="pos" aria-label="Position">${options(POS_LIST, p.pos)}</select></td>
      <td data-col="nation" data-label="Land"><input type="text" class="w-s" value="${esc(p.nation)}" data-field="nation" placeholder="–" aria-label="Land" title="${p.altPos.length ? "Nebenpositionen: "+esc(p.altPos.join(", "))+" (✎)" : "Nebenpositionen über ✎"}"></td>
      <td data-col="age" data-label="Alter">${ageCellHTML(p)}</td>
      ${nat ? `<td data-col="homeClub" data-label="Stammverein"><input type="text" class="w-m" value="${esc(p.homeClub)}" data-field="homeClub" placeholder="–" aria-label="Stammverein"></td>
      <td data-col="caps" data-label="Länderspiele"><input type="number" class="w-xs" min="0" value="${p.caps}" data-field="caps" aria-label="Länderspiele"></td>
      <td data-col="intGoals" data-label="Länderspieltore"><input type="number" class="w-xs" min="0" value="${p.intGoals}" data-field="intGoals" aria-label="Länderspieltore"></td>` : ""}
      <td data-col="squadRole" data-label="Kaderrolle"><select class="w-sel" data-field="squadRole" aria-label="Kaderrolle">${options(SQUAD_ROLES, p.squadRole)}</select></td>
      <td data-col="rating" data-label="Einschätzung">${starsInput(p.rating, 'aria-label="Eigene Einschätzung"')}</td>
      ${nat ? "" : `<td data-col="salary" data-label="Gehalt${wageSuffix()}">${moneyInput(p.salary, `class="money w-m" data-field="salary" aria-label="Gehalt ${WAGE_UNITS[wageUnit()].label}"`, true)}</td>`}
      ${showValue ? `<td data-col="valueMax" data-label="Transferwert" class="value-cell" title="${p.valueMax ? "Transferwert laut FM · ✎ zum Bearbeiten" : "Kein Transferwert"}">${fmtValue(p)}</td>` : ""}
      ${nat ? "" : `<td data-col="contractUntil" data-label="Vertrag"><div class="contract-cell" title="${lv.text}${bosmanMarked(p) ? " · Bosman: letzte 6 Vertragsmonate" : ""}"><span class="c-dot ${lv.cls}"></span><input type="number" value="${p.contractUntil}" data-field="contractUntil" aria-label="Vertrag bis Jahr">${bosmanMarked(p) ? '<span class="bosman-tag" aria-label="Bosman">B</span>' : ""}</div></td>`}
      <td data-col="status" data-label="Status"><select class="w-sel st-${listBase("status", p.status)||"ok"}" data-field="status" aria-label="Status">${options(STATUS, p.status)}</select></td>
      <td data-col="note" data-label="Notiz"><input type="text" value="${esc(p.note)}" data-field="note" placeholder="Notiz…" aria-label="Notiz"></td>
      ${cfDefs("squad").map(d=>cfCellHTML(d, p)).join("")}
      <td data-col="actions" data-label=""><span class="row-actions">
        <button class="btn-icon-sm" data-edit title="Alle Daten bearbeiten" aria-label="${esc(p.name)} bearbeiten">✎</button>
        <button class="btn-icon-sm" data-loan title="Verleihen" aria-label="${esc(p.name)} verleihen">↗</button>
        <button class="btn-icon-sm del" data-del title="Löschen" aria-label="${esc(p.name)} löschen">✕</button>
      </span></td>
    </tr>`;
  };
  const emptyRowHTML = `<tr class="empty-row"><td colspan="${qsa("#squadTable thead th").filter(th=>!th.hidden).length}">${state.players.length ? `Keine Spieler passen zu den Filtern: <strong>${esc(activeFilters.join(" · "))}</strong>. Alle ${state.players.length} Spieler sind weiterhin da. <button class="btn btn-sm" data-reset-filters>Filter zurücksetzen</button>` : "Der Kader ist leer. Lege mit „+ Spieler“ los."}</td></tr>`;
  // 9.1: players on loan stay IN the squad – greyed out, read-only, sorted together with everyone else
  const lr = nat || state.ui.showLoaned === false || roleF || statF ? [] : state.loans.filter(l=>{
    const pl = l.player || l;
    if(q && !(l.name.toLowerCase().includes(q) || (l.club || "").toLowerCase().includes(q) || (pl.nation || "").toLowerCase().includes(q))) return false;
    if(posF && l.pos !== posF && !((pl.altPos || []).includes(posF))) return false;
    return true;
  }).sort((a,b)=>a.name.localeCompare(b.name, "de"));
  const loanRowHTML = l=>{
    const pl = l.player || {}, cfTxt = d => { const v = (pl.custom || {})[d.id]; return d.type === "bool" ? (v ? "✓" : "") : v === undefined ? "" : esc(String(v)); };
    return `<tr class="loaned-row" data-loan-id="${l.id}" title="Verliehen an ${esc(l.club || "?")}${l.until ? " bis " + esc(l.until) : ""} – nur zur Übersicht, bearbeiten unter Entwicklung → Leihen">
      <td class="sel-col" data-col="sel" data-label="Auswahl"></td>
      <td data-col="name" data-label="Name"><div class="player-cell"><span class="avatar">${esc(initials(l.name))}</span><span class="loaned-name">${esc(l.name)}</span><span class="loaned-tag">↗ ${esc(l.club || "verliehen")}${l.until ? " · bis " + esc(l.until) : ""}</span></div></td>
      <td data-col="pos" data-label="Pos.">${l.pos}</td>
      <td data-col="nation" data-label="Land">${esc(pl.nation || "")}</td>
      <td data-col="age" data-label="Alter">${pl.birthDate ? clamp(ageOn(pl.birthDate, ingameDate()), 14, 45) : l.age}</td>
      <td data-col="squadRole" data-label="Kaderrolle">${esc(SQUAD_ROLES[pl.squadRole] || "")}</td>
      <td data-col="rating" data-label="Einschätzung">${pl.rating ? starsRO(pl.rating) : ""}</td>
      <td data-col="salary" data-label="Gehalt" class="num">${pl.salary ? fmtNum(wageToUnit(pl.salary)) : ""}</td>
      ${showValue ? `<td data-col="valueMax" data-label="Transferwert" class="value-cell">${pl.valueMax ? fmtValue(pl) : "—"}</td>` : ""}
      <td data-col="contractUntil" data-label="Vertrag">${pl.contractUntil || ""}</td>
      <td data-col="status" data-label="Status"><span class="loaned-status">Verliehen${l.playtime ? " · " + esc(PLAYTIME[l.playtime]) : ""}</span></td>
      <td data-col="note" data-label="Notiz" class="small" title="${esc(l.note || pl.note || "")}">${l.note ? "📝 " + esc(l.note.slice(0,40)) : esc((pl.note || "").slice(0,40))}</td>
      ${cfDefs("squad").map(d=>`<td data-col="cf_${d.id}" class="cf-cell">${cfTxt(d)}</td>`).join("")}
      <td data-col="actions" data-label=""><span class="row-actions"><button class="btn-icon-sm" data-return-loan="${l.id}" title="Zurück in den Kader holen" aria-label="${esc(l.name)} zurück in den Kader holen">↙</button></span></td>
    </tr>`; };
  const lp = lr.map(l=>Object.assign({name:"", pos:"", altPos:[], age:0, salary:0, valueMin:0, valueMax:0, contractUntil:0, rating:0, status:"", note:"", squadRole:"", nation:"", custom:{}},
    l.player || {}, {name:l.name, pos:l.pos, age: l.player && l.player.birthDate ? clamp(ageOn(l.player.birthDate, ingameDate()), 14, 45) : l.age, __loan:l}));
  const allRows = rows.concat(lp).sort(squadCmp);
  qs("#squadTbody").innerHTML = allRows.map(x=>x.__loan ? loanRowHTML(x.__loan) : playerRowHTML(x)).join("") || emptyRowHTML;
  applyColOrder("squadTable");
  if(squadFocusId){ const fr = qs(`#squadTbody tr[data-id="${squadFocusId}"], #squadTbody tr[data-loan-id="${squadFocusId}"]`); if(fr) fr.classList.add("row-focus"); }
  renderBulkBar();
}

/** Create (player = undefined) or edit an existing player with all fields in one dialog. */
/* ==========================================================================
   SQUAD — NEXT SEASON ("Zukunfts-Kader")
   ========================================================================== */
const DEFAULT_POS_NEED = pos => pos === "IV" ? 3 : 2;
const POS_NEED = pos => (state && state.transferPlan && state.transferPlan.targets && state.transferPlan.targets[pos] !== undefined) ? state.transferPlan.targets[pos] : DEFAULT_POS_NEED(pos);
const FUTURE_KIND = {
  stay:        {label:"bleibt",                 counted:true},
  extend:      {label:"Verlängerung geplant",   counted:true},
  loanBack:    {label:"Leih-Rückkehrer",        counted:true},
  incoming:    {label:"Neuzugang (fixiert)",    counted:true},
  prospect:    {label:"Talent rückt auf",       counted:true},
  loanMaybe:   {label:"Rückkehr unsicher (Kaufoption)", counted:false, uncertain:true},
  incomingMaybe:{label:"Neuzugang in Verhandlung", counted:false, uncertain:true},
  expiring:    {label:"Vertrag endet",          counted:false, leaving:true},
  sell:        {label:"Abgabe geplant",         counted:false, leaving:true},
  loanGone:    {label:"Leihe mit Kaufpflicht",  counted:false, leaving:true},
  loanAgain:   {label:"Rückkehrer: erneut verleihen", counted:false, leaving:true},
  loanSell:    {label:"Rückkehrer: Verkauf geplant",  counted:false, leaving:true},
  loanInEnd:   {label:"Leihspieler geht zurück",      counted:false, leaving:true}
};

/** 1 July of the upcoming season change (contracts end on 30 June). */
function nextSeasonCutoff(){
  const d = ingameDate();
  return new Date(d.getMonth() >= 6 ? d.getFullYear()+1 : d.getFullYear(), 6, 1);
}
function yearFrom(text){ const m = /(\d{4})/.exec(text || ""); return m ? Number(m[1]) : null; }
function ageAtCutoff(age, birthDate, cutoff){
  if(birthDate && parseISO(birthDate)) return ageOn(birthDate, cutoff);
  return age + Math.max(0, cutoff.getFullYear() - ingameDate().getFullYear());
}

/** Everybody relevant for next season, each with a "kind" (see FUTURE_KIND). */
function futureSquadEntries(){
  if(_renderCache){ if(!_renderCache.fse) _renderCache.fse = computeFutureSquadEntries(); return _renderCache.fse; }
  return computeFutureSquadEntries();
}
function computeFutureSquadEntries(){
  const cutoff = nextSeasonCutoff(), Y = cutoff.getFullYear();
  const nextLabel = `${Y}/${String((Y+1)%100).padStart(2,"0")}`;
  const out = [];
  state.players.forEach(p=>{
    let kind = "stay";
    const sale = state.sales.find(x=>x.playerId === p.id);
    if(listBase("squadRoles", p.squadRole) === "sell" || (sale && listBase("saleStatus", sale.status) === "agreed")) kind = "sell";
    else if(p.loanIn) kind = "loanInEnd";
    else if(p.contractUntil <= Y) kind = p.extendPlanned ? "extend" : "expiring";
    out.push({kind, id:p.id, ref:"player", name:p.name, pos:p.pos, altPos:p.altPos, wage:p.salary,
      age: ageAtCutoff(p.age, p.birthDate, cutoff), squadRole:p.squadRole, rating:p.rating});
  });
  state.loans.forEach(l=>{
    const end = yearFrom(l.until);
    if(end === null || end > Y) return;   // still away next season
    const cl = listBase("loanClauses", l.clause);
    const kind = cl === "obligation" ? "loanGone" : l.returnPlan === "loan" ? "loanAgain" : l.returnPlan === "sell" ? "loanSell" : cl === "buy" ? "loanMaybe" : "loanBack";
    out.push({kind, id:l.id, ref:"loan", name:l.name, pos:l.pos, altPos:[], wage:0, age: ageAtCutoff(l.age, "", cutoff),
      badLoan: listBase("playtime", l.playtime) === "bad"});
  });
  state.scouting.forEach(t=>{
    if(listBase("scoutStatus", t.status) === "watched") return;
    out.push({kind: listBase("scoutStatus", t.status) === "fixed" ? "incoming" : "incomingMaybe", id:t.id, ref:"target", name:t.name, pos:t.pos, altPos:[],
      wage:t.wage, age: ageAtCutoff(t.age, "", cutoff)});
  });
  state.prospects.forEach(pr=>{
    const ready = yearFrom(pr.readyBy);
    if(listBase("pathways", pr.pathway) === "first" || pr.readyBy.startsWith(nextLabel) || (ready !== null && ready <= Y)){
      out.push({kind:"prospect", id:pr.id, ref:"prospect", name:pr.name, pos:pr.pos, altPos:[], wage:0, age: ageAtCutoff(pr.age, "", cutoff)});
    }
  });
  return {entries: out, cutoff, label: nextLabel};
}

function renderFutureSquad(){
  const {entries, cutoff, label} = futureSquadEntries();
  const withMaybe = state.ui.futureUncertain;
  const counts = e => FUTURE_KIND[e.kind].counted || (withMaybe && FUTURE_KIND[e.kind].uncertain);
  const squad = entries.filter(counts);
  const leaving = entries.filter(e=>FUTURE_KIND[e.kind].leaving);
  const arriving = entries.filter(e=>["loanBack","incoming","prospect"].includes(e.kind) || (withMaybe && FUTURE_KIND[e.kind].uncertain));
  const avgAge = squad.length ? fmtNum(squad.reduce((a,e)=>a+e.age,0)/squad.length, 1) : "–";
  const wages = squad.reduce((a,e)=>a+e.wage,0);
  const wagesNow = state.players.reduce((a,p)=>a+p.salary,0);

  const warnings = [];
  POS_LIST.forEach(pos=>{
    const n = squad.filter(e=>e.pos === pos).length;
    if(n < POS_NEED(pos)) warnings.push(`<strong>${pos}</strong>: nur ${n} Spieler auf der Hauptposition (Ziel ${POS_NEED(pos)})`);
  });
  const keyLeaving = entries.filter(e=>e.kind === "expiring" && listBase("squadRoles", e.squadRole) === "key");
  if(keyLeaving.length) warnings.unshift(`Schlüsselspieler mit auslaufendem Vertrag: <strong>${keyLeaving.map(e=>esc(e.name)).join(", ")}</strong> – verlängern oder Ersatz planen`);
  const old = squad.filter(e=>e.age >= 32 && e.ref === "player");
  if(old.length >= 3) warnings.push(`${old.length} Spieler sind dann 32 oder älter`);

  const chip = e => {
    const k = FUTURE_KIND[e.kind], clickable = e.kind === "expiring" || e.kind === "extend";
    return `<button type="button" class="fchip k-${e.kind}${e.badLoan ? " bad-loan" : ""}" ${clickable ? `data-extend="${e.id}"` : "disabled"}
      title="${esc(e.name)} · ${k.label}${e.badLoan ? " · Spielzeit schlecht – zurückholen oder Leihe abbrechen" : ""} · ${e.age} J.${e.wage ? " · "+fmtWage(e.wage) : ""}${clickable ? (e.kind==="expiring" ? " – klicken: Verlängerung einplanen" : " – klicken: Verlängerung verwerfen") : ""}">
      <span class="fchip-name">${esc(e.name.split(" ").slice(-1)[0])}</span><span class="fchip-age">${e.age}</span></button>`;
  };
  const kindOrder = Object.keys(FUTURE_KIND);
  const rows = POS_LIST.map(pos=>{
    const here = entries.filter(e=>e.pos === pos).sort((a,b)=>kindOrder.indexOf(a.kind)-kindOrder.indexOf(b.kind) || (b.rating||0)-(a.rating||0));
    const n = here.filter(counts).length;
    return `<div class="frow ${n < POS_NEED(pos) ? "thin" : ""}">
      <div class="frow-pos"><strong>${pos}</strong><span>${n}</span></div>
      <div class="frow-chips">${here.map(chip).join("") || `<span class="muted small">niemand</span>`}</div>
    </div>`;
  }).join("");

  qs("#futureSquad").innerHTML = `
    <div class="future-head">
      <div><h2>Kader ${esc(label)}</h2><div class="muted">Stand 1. Juli ${cutoff.getFullYear()} · Verträge enden am 30. Juni</div></div>
      <label class="check-label"><input type="checkbox" id="futureUncertain" ${withMaybe ? "checked" : ""}> Unsichere einrechnen (Verhandlungen, Kaufoptionen)</label>
    </div>
    <div class="future-stats">
      <div class="fstat"><span>Kadergröße</span><strong>${squad.length}</strong></div>
      <div class="fstat"><span>Ø Alter</span><strong>${avgAge}</strong></div>
      <div class="fstat"><span>Abgänge</span><strong class="neg">${leaving.length}</strong></div>
      <div class="fstat"><span>Zugänge</span><strong class="pos">${arriving.length}</strong></div>
      <div class="fstat"><span>Gehälter${wageSuffix()}</span><strong>${fmtEUR(wageToUnit(wages))}</strong><em class="${wages > wagesNow ? "neg" : "pos"}">${wages >= wagesNow ? "+" : "−"}${fmtEUR(wageToUnit(Math.abs(wages-wagesNow)))} ggü. heute</em></div>
    </div>
    ${warnings.length ? `<div class="future-warn">${warnings.map(w=>`<div>⚠ ${w}</div>`).join("")}</div>` : `<div class="future-ok">✓ Jede Position ist für ${esc(label)} ausreichend besetzt.</div>`}
    <div class="frows">${rows}</div>
    <div class="flegend">${["stay","extend","loanBack","incoming","prospect","incomingMaybe","loanMaybe","expiring","sell","loanGone","loanAgain","loanSell","loanInEnd"].map(k=>`<span class="fchip k-${k} legend" aria-hidden="true"></span><span>${FUTURE_KIND[k].label}</span>`).join("")}</div>
    <p class="hint">Grundlage: Vertragsende und Kaderrolle „Abgabe“ im Kader, Leihende und Klausel unter Entwicklung, Transferziele mit Status „Fixiert“ bzw. „Verhandlung“, Talente mit Weg „1. Mannschaft“ oder passendem „Bereit bis“. Klick auf einen Spieler mit auslaufendem Vertrag plant die Verlängerung ein.</p>`;
}

/* ==========================================================================
   SQUAD — CONTRACTS & WAGES
   ========================================================================== */
const ROLE_COLOR = {key:"var(--accent)", first:"#3ddc97", rotation:"#2ec5d3", backup:"#8a93a8", prospect:"#b57bff", sell:"#ff5d6c"};

function renderContractsView(){
  const players = state.players.slice();
  if(!players.length){ qs("#contractsView").innerHTML = `<p class="empty">Keine Spieler im Kader.</p>`; return; }
  const today = ingameDate();
  const y0 = today.getFullYear();
  const yMax = Math.max(y0 + 4, ...players.map(p=>p.contractUntil));
  // axis starts today; every contract ends on 30 June → labels and grid lines sit exactly there
  const tStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()), tEnd = new Date(yMax, 8, 30), span = tEnd - tStart;
  const pct = d => clamp((d - tStart) / span * 100, 0, 100);
  const nowPct = pct(today);
  const wagesTotal = players.reduce((a,p)=>a+p.salary,0);

  // --- contract calendar (Gantt) ---
  const byEnd = players.slice().sort((a,b)=>a.contractUntil-b.contractUntil || b.salary-a.salary);
  const years = []; for(let y=y0; y<=yMax; y++) years.push(y);
  const lineYears = years.filter(y=>new Date(y,5,30) >= tStart);
  const perYear = years.map(y=>{
    const ps = players.filter(p=>p.contractUntil === y);
    return {y, n:ps.length, wage:ps.reduce((a,p)=>a+p.salary,0), keys:ps.filter(p=>listBase("squadRoles", p.squadRole)==="key").length};
  }).filter(o=>o.n);
  const gantt = byEnd.map(p=>{
    const end = new Date(p.contractUntil, 5, 30), lv = contractLevel(contractMonthsLeft(p));
    const w = Math.max(0.8, pct(end) - nowPct);
    return `<div class="g-row" title="${esc(p.name)} · Vertrag bis 30.06.${p.contractUntil} · ${lv.text} · ${fmtWage(p.salary)}">
      <div class="g-name"><span class="role-dot" style="background:${ROLE_COLOR[listBase("squadRoles", p.squadRole)]}"></span>${plink(p.id, p.name)} <span class="muted small">${p.pos}</span></div>
      <div class="g-track">
        <div class="g-bar ${lv.cls}" style="left:${nowPct}%;width:${w}%"></div>
        ${p.extendPlanned && contractMonthsLeft(p) <= 12 ? `<span class="g-flag" style="left:${pct(end)}%">↻</span>` : ""}
      </div>
      <div class="g-end">${p.contractUntil}</div>
    </div>`;
  }).join("");
  const axis = lineYears.map(y=>`<span style="left:${pct(new Date(y,5,30))}%"><b class="yl">${y}</b><b class="ysh">’${String(y).slice(2)}</b></span>`).join("");
  const grid = lineYears.map(y=>`<i style="left:${pct(new Date(y,5,30))}%"></i>`).join("");

  // --- wage structure ---
  const sorted = players.slice().sort((a,b)=>b.salary-a.salary);
  const maxW = Math.max(1, sorted[0].salary);
  const med = (()=>{ const v = players.map(p=>p.salary).sort((a,b)=>a-b), m = Math.floor(v.length/2); return v.length%2 ? v[m] : (v[m-1]+v[m])/2; })();
  const flag = p => {
    if(p.salary >= med*1.3 && p.rating <= 2) return `<span class="w-flag bad" title="Hohes Gehalt, niedrige eigene Einschätzung">teuer</span>`;
    if(p.salary <= med*0.7 && p.rating >= 4) return `<span class="w-flag good" title="Starke Einschätzung bei niedrigem Gehalt">Schnäppchen</span>`;
    return "";
  };
  const bars = sorted.map(p=>`
    <div class="w-row" title="${esc(p.name)} · ${SQUAD_ROLES[p.squadRole]} · ${fmtWage(p.salary)} · ${fmtNum(p.salary/wagesTotal*100,1)} % der Gehälter">
      <div class="w-name">${esc(p.name)}</div>
      <div class="w-track"><div class="w-bar" style="width:${p.salary/maxW*100}%;background:${ROLE_COLOR[listBase("squadRoles", p.squadRole)]}"></div></div>
      <div class="w-val">${fmtEUR(wageToUnit(p.salary))}</div>
      <div class="w-meta">${starsRO(p.rating)}${flag(p)}</div>
    </div>`).join("");
  const roleShares = SQUAD_ROLE_ORDER.map(r=>({r, sum: players.filter(p=>p.squadRole===r).reduce((a,p)=>a+p.salary,0)})).filter(o=>o.sum);
  const top3 = sorted.slice(0,3).reduce((a,p)=>a+p.salary,0);
  const sellCost = players.filter(p=>listBase("squadRoles", p.squadRole)==="sell").reduce((a,p)=>a+p.salary,0);
  const insights = [
    `Die Top 3 verdienen <strong>${Math.round(top3/wagesTotal*100)} %</strong> aller Gehälter.`,
    sellCost ? `Spieler mit Rolle „Abgabe“ kosten <strong>${fmtWage(sellCost)}</strong>.` : "",
    (()=>{ const n = players.filter(p=>p.salary >= med*1.3 && p.rating <= 2).length; return n ? `<strong>${n}</strong> Spieler mit hohem Gehalt, aber niedriger Einschätzung.` : ""; })(),
    perYear.length && perYear[0].y <= y0+1 ? `Bis ${perYear[0].y} laufen <strong>${perYear[0].n}</strong> Verträge aus (${fmtWage(perYear[0].wage)}).` : ""
  ].filter(Boolean);

  qs("#contractsView").innerHTML = `
    <div class="future-stats">
      <div class="fstat"><span>Gehälter${wageSuffix()}</span><strong>${fmtEUR(wageToUnit(wagesTotal))}</strong><em>${wageUnit()==="year" ? fmtEUR(wagesTotal/12)+" pro Monat" : fmtEUR(wagesTotal)+" pro Jahr"}</em></div>
      <div class="fstat"><span>Ø pro Spieler</span><strong>${fmtEUR(wageToUnit(wagesTotal/players.length))}</strong><em>Median ${fmtEUR(wageToUnit(med))}</em></div>
      ${(()=>{ const h = state.club.wageBudget - wagesTotal; return `<div class="fstat"><span>Gehalts-Spielraum${wageSuffix()}</span><strong class="${h<0?"neg":""}">${fmtEUR(wageToUnit(h))}</strong><em>Budget ${fmtWage(state.club.wageBudget)}</em></div>`; })()}
      <div class="fstat"><span>Verträge ≤ 12 Monate</span><strong class="${players.some(p=>contractMonthsLeft(p)<=6)?"neg":""}">${players.filter(p=>contractMonthsLeft(p)<=12).length}</strong><em>davon ${players.filter(p=>contractMonthsLeft(p)<=6).length} ≤ 6 Monate</em></div>
    </div>
    <div class="contracts-grid">
      <div class="card">
        <div class="card-head"><h2>Vertragskalender</h2></div>
        <div class="year-sum">${perYear.map(o=>`<span class="ys"><strong>${o.y}</strong> ${o.n} ${o.n===1?"Vertrag":"Verträge"}${o.keys?` · ${o.keys} Schlüssel`:""} · ${fmtWage(o.wage)}</span>`).join("")}</div>
        <div class="gantt">
          <div class="g-row g-axis"><div class="g-name"></div><div class="g-track">${axis}</div><div class="g-end"></div></div>
          <div class="g-body">
            <div class="g-grid"><div class="g-name"></div><div class="g-track" title="Linke Kante = heute">${grid}</div><div class="g-end"></div></div>
            ${gantt}
          </div>
        </div>
        <p class="hint">Balken von heute bis Vertragsende; Linien = 30.06. des Jahres. Rot ≤ 6 Monate, Orange ≤ 12 Monate · ↻ Verlängerung geplant · Punkt = Kaderrolle.</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Gehaltsstruktur</h2></div>
        <div class="role-share">${roleShares.map(o=>`<span style="width:${o.sum/wagesTotal*100}%;background:${ROLE_COLOR[listBase("squadRoles", o.r)]}" title="${SQUAD_ROLES[o.r]}: ${fmtEUR(o.sum)} (${Math.round(o.sum/wagesTotal*100)} %)"></span>`).join("")}</div>
        <div class="role-legend">${roleShares.map(o=>`<span><i style="background:${ROLE_COLOR[listBase("squadRoles", o.r)]}"></i>${SQUAD_ROLES[o.r]} ${Math.round(o.sum/wagesTotal*100)} %</span>`).join("")}</div>
        ${insights.length ? `<ul class="insights">${insights.map(t=>`<li>${t}</li>`).join("")}</ul>` : ""}
        <div class="wages">${bars}</div>
      </div>
    </div>`;
}

function openPlayerModal(player){
  const p = player || {name:"", pos:"ZM", altPos:[], age:22, squadRole:"rotation", rating:3, salary:20000,
                       contractUntil: ingameDate().getFullYear()+3, status:"", note:""};
  openModal({
    title: player ? `${p.name} bearbeiten` : "Neuer Spieler",
    body:`
      <div class="field"><label>Name</label><input data-f="name" value="${esc(p.name)}"></div>
      <div class="field-row">
        <div class="field"><label>Position</label><select data-f="pos">${options(POS_LIST, p.pos)}</select></div>
        <div class="field"><label>Nebenpositionen</label><input data-f="altPos" value="${esc(p.altPos.join(", "))}" placeholder="z.B. DM, OM"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Land</label><input data-f="nation" value="${esc(p.nation || "")}" placeholder="z. B. Spanien"></div>
        <div class="field"><label>Transferwert von (€, optional)</label>${moneyInput(p.valueMin || 0, 'data-f="valueMin"')}</div>
        <div class="field"><label>bis (€)</label>${moneyInput(p.valueMax || 0, 'data-f="valueMax"')}</div>
      </div>
      <div class="field-row">
        <div class="field"><label>Geburtsdatum <span style="opacity:.6">(optional)</span></label><input data-f="birthDate" type="date" value="${esc(p.birthDate||"")}"></div>
        <div class="field"><label>Alter</label><input data-f="age" type="number" value="${p.age}" ${p.birthDate ? 'disabled title="Wird aus dem Geburtsdatum berechnet"' : ""}></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Kaderrolle</label><select data-f="squadRole">${options(SQUAD_ROLES, p.squadRole)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Gehalt ${WAGE_UNITS[wageUnit()].label} (€)</label>${moneyInput(p.salary, 'data-f="salary"', true)}</div>
        <div class="field"><label>Vertrag bis (Jahr, endet 30.06.)</label><input data-f="contractUntil" type="number" value="${p.contractUntil}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Eigene Einschätzung (1–5)</label><select data-f="rating">${options({1:"★",2:"★★",3:"★★★",4:"★★★★",5:"★★★★★"}, p.rating)}</select></div>
        <div class="field"><label>Status</label><select data-f="status">${options(STATUS, p.status)}</select></div>
      </div>
      <div class="field"><label>Notiz</label><textarea data-f="note" rows="3" placeholder="Pläne, Beobachtungen, Gesprächsnotizen…">${esc(p.note)}</textarea></div>
      ${cfDefs("squad").length ? `<div class="cf-modal"><div class="hist-head">Eigene Felder</div><div class="cf-modal-grid">${cfDefs("squad").map(d=>{
        const v = ((player || {}).custom || {})[d.id];
        const ctl = d.type === "bool" ? `<label class="check-label"><input type="checkbox" data-cfm="${d.id}" ${v ? "checked" : ""}> ${esc(d.name)}</label>`
          : d.type === "select" ? `<select data-cfm="${d.id}"><option value="">—</option>${d.options.map(o=>`<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
          : `<input type="text" ${d.type === "number" ? 'inputmode="decimal"' : ""} data-cfm="${d.id}" value="${esc(v === undefined ? "" : v)}">`;
        return d.type === "bool" ? `<div class="field">${ctl}</div>` : `<div class="field"><label>${esc(d.name)}</label>${ctl}</div>`;
      }).join("")}</div></div>` : ""}
      ${player ? historySectionHTML(player) : ""}`,
    onOpen: m=>{
      const bd = qs('[data-f="birthDate"]', m), ag = qs('[data-f="age"]', m);
      bd.oninput = ()=>{ const ok = !!parseISO(bd.value); ag.disabled = ok; if(ok) ag.value = ageOn(bd.value, ingameDate()); };
    },
    saveLabel: player ? "Speichern" : "Spieler anlegen",
    onSave: get=>{
      const pos = get("pos");
      const data = {
        name:get("name").trim()||"Unbenannt", pos,
        altPos:get("altPos").toUpperCase().split(/[\s,;/]+/).filter(x=>POS_LIST.includes(x)&&x!==pos),
        birthDate: parseISO(get("birthDate")) ? get("birthDate") : "",
        age: parseISO(get("birthDate")) ? clamp(ageOn(get("birthDate"), ingameDate()), 14, 45) : clamp(get("age"),14,45),
        salary:Math.max(0,get("salary")),
        contractUntil:clamp(Math.round(get("contractUntil")),2000,2100),
        squadRole:get("squadRole"), rating:clamp(num(get("rating"),3),1,5), status:get("status"), note:get("note"),
        nation:get("nation").trim(), valueMin:Math.min(get("valueMin"), get("valueMax") || get("valueMin")), valueMax:Math.max(get("valueMin"), get("valueMax"))
      };
      // custom fields from the dialog
      const custom = Object.assign({}, (player || {}).custom);
      qsa("#modal [data-cfm]").forEach(el=>{ const def = cfById(el.dataset.cfm); if(!def) return;
        const v = coerceCF(def, def.type === "bool" ? el.checked : el.value); if(v === undefined) delete custom[def.id]; else custom[def.id] = v; });
      data.custom = custom;
      if(player) Object.assign(player, data);
      else state.players.push(Object.assign({id:uid()}, data));
      saveState(); renderSquad(); renderTactics(); renderHome(); renderHeader();
      toast(player ? "Änderungen gespeichert" : "Spieler angelegt");
    }
  });
}

function loanOutPlayer(p){
  openModal({
    title:`${p.name} verleihen`,
    body:`
      <p class="lead">Der Spieler wird aus dem Kader in die Leih-Übersicht verschoben und aus allen Aufstellungen entfernt. Alle seine Daten (Land, Transferwert, Vertrag, Gehalt, eigene Felder, Verlauf) werden aufbewahrt und beim Zurückholen wiederhergestellt.</p>
      <div class="field-row">
        <div class="field"><label>Leihclub</label><input data-f="club"></div>
        <div class="field"><label>Liga</label><input data-f="league"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Bis</label><input data-f="until" placeholder="z.B. 06/2028"></div>
        <div class="field"><label>Klausel</label><select data-f="clause">${options(LOAN_CLAUSES,"recall")}</select></div>
      </div>
      <div class="field"><label>Notiz zur Leihe</label><textarea data-f="loanNote" rows="2" placeholder="z. B. 25 Einsätze versprochen, Stammplatz zugesagt, Kaufoption 2 Mio."></textarea></div>`,
    saveLabel:"Verleihen",
    onSave: get=>{
      const undo = snapshotUndo(`${p.name} verliehen`, renderAll);
      state.loans.push({id:uid(), name:p.name, pos:p.pos, age:p.age, club:get("club"), league:get("league"),
        until:get("until"), apps:0, minutes:0, clause:get("clause"), recallCheck:false, note:get("loanNote").trim(),   // the player's own note travels in the backpack
        player: JSON.parse(JSON.stringify(p)), playerHistory: JSON.parse(JSON.stringify((state.history || {})[p.id] || []))});
      state.players = state.players.filter(x=>x.id!==p.id);
      state = sanitizeState(state);   // clears lineup/set-piece references
      saveState(); renderAll(); undo();
    }
  });
}


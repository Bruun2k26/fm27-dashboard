/* ==========================================================================
   RECRUITMENT
   ========================================================================== */
function initRecruitment(){
  qs("#scoutSearch").addEventListener("input", renderRecruitment);
  qs("#scoutStatusFilter").addEventListener("change", renderRecruitment);
  qs("#includeWatched").addEventListener("change", e=>{ state.ui.includeWatched = e.target.checked; saveState(); renderRecruitment(); renderHeader(); });
  qs("#btnAddTarget").addEventListener("click", openTargetModal);
  const scHead = qs("#scoutTable thead");
  const scSort = th=>{
    const key = th.dataset.sort;
    if(scoutSort && scoutSort.key === key){ if(scoutSort.dir > 0) scoutSort.dir = -1; else scoutSort = null; }
    else scoutSort = {key, dir: ["priority","fee","wage","bonus"].includes(key) ? -1 : 1};
    renderRecruitment();
  };
  scHead.addEventListener("click", e=>{ const th = e.target.closest("th[data-sort]"); if(th && !e.target.closest(".col-resizer")) scSort(th); });
  scHead.addEventListener("keydown", e=>{ const th = e.target.closest("th[data-sort]"); if(th && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); scSort(th); } });
  qs("#scoutTbody").addEventListener("change", e=>{
    const el = e.target.closest("[data-cf]"); if(!el) return;
    const t = state.scouting.find(x=>x.id === el.closest("tr").dataset.id); if(!t) return;
    readCFCell(el, t); saveState();
  });
  qsa("#transferTabs [data-tab]").forEach(b=> b.addEventListener("click", ()=>{ state.ui.transferTab = b.dataset.tab; saveState(); renderRecruitment(); }));
  qs("#includeListed").addEventListener("change", e=>{ state.ui.includeListed = e.target.checked; saveState(); renderRecruitment(); renderHeader(); });
  qs("#salesShare").addEventListener("change", e=>{ state.club.salesShare = clamp(Math.round(num(e.target.value, 100)), 0, 100); e.target.value = state.club.salesShare; saveState(); renderRecruitment(); renderHeader(); });
  qs("#btnAddSale").addEventListener("click", ()=> openSaleModal());
  qs("#salesHint").addEventListener("click", e=>{ const b = e.target.closest("[data-add-sale]"); if(b) openSaleModal(b.dataset.addSale); });
  const st = qs("#salesTbody");
  st.addEventListener("change", e=>{
    const el = e.target.closest("[data-field]"); if(!el) return;
    const x = state.sales.find(y=>y.id === el.closest("tr").dataset.id);
    x[el.dataset.field] = ("money" in el.dataset || el.type === "number") ? Math.max(0, readInput(el)) : el.value;
    saveState(); renderRecruitment(); renderHeader(); if(state.ui.squadTab === "future") renderSquad();
  });
  st.addEventListener("click", e=>{
    const tr = e.target.closest("tr[data-id]"); if(!tr) return;
    const x = state.sales.find(y=>y.id === tr.dataset.id);
    if(e.target.closest("[data-complete]")) return completeSale(x);
    if(e.target.closest("[data-del]")) removeWithUndo("sales", x.id, `Verkauf von ${(playerById(x.playerId)||{}).name}`, ()=>{ renderRecruitment(); renderHeader(); });
  });
  qs("#transferHistory").addEventListener("change", e=>{ if(e.target.id === "historySeason"){ historyFilter = e.target.value; renderTransferHistory(); } });
  qs("#transferHistory").addEventListener("click", e=>{
    const b = e.target.closest("[data-del-log]"); if(!b) return;
    removeWithUndo("transferLog", b.closest("tr").dataset.id, "Historien-Eintrag", renderTransferHistory);
  });
  const tb = qs("#scoutTbody");
  tb.addEventListener("change", e=>{
    const el = e.target.closest("[data-field]"); if(!el) return;
    const t = state.scouting.find(x=>x.id===el.closest("tr").dataset.id);
    t[el.dataset.field] = ("money" in el.dataset || el.type === "number") ? Math.max(0, readInput(el)) : el.value;
    saveState(); renderRecruitment(); renderHeader();
  });
  tb.addEventListener("click", e=>{
    const tr = e.target.closest("tr[data-id]"); if(!tr) return;
    const t = state.scouting.find(x=>x.id===tr.dataset.id);
    const pr = e.target.closest("[data-prio]");
    if(pr){ t.priority = num(pr.dataset.prio); saveState(); renderRecruitment(); return; }
    if(e.target.closest("[data-sign]")) return signTarget(t);
    if(e.target.closest("[data-del]")) removeWithUndo("scouting", t.id, `Transferziel „${t.name}“`, ()=>{ renderRecruitment(); renderHeader(); });
  });
}

/* scouting list: sortable by clicking a column head (click again = reverse, third click = default order) */
let scoutSort = null;
function scoutCompare(k, a, b){
  if(k.startsWith("cf:")) return cfCompare(k.slice(3), a, b);
  if(k === "pos") return POS_LIST.indexOf(a.pos) - POS_LIST.indexOf(b.pos);
  if(k === "grade") return GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade);
  if(k === "status") return Object.keys(SCOUT_STATUS).indexOf(a.status) - Object.keys(SCOUT_STATUS).indexOf(b.status);
  if(typeof a[k] === "string") return a[k].localeCompare(b[k], "de");
  return (a[k] || 0) - (b[k] || 0);
}
function renderRecruitment(){
  const b = budgetCalc();
  qs("#includeWatched").checked = state.ui.includeWatched;
  qs("#rTransferBudget").textContent = fmtEUR(state.club.transferBudget);
  qs("#rPlannedFees").textContent = fmtEUR(b.fees);
  qs("#rPlannedBonus").textContent = fmtEUR(b.bonus);
  qs("#rPlannedWages").textContent = fmtEUR(wageToUnit(b.wages));
  qs("#rSalesLabel").textContent = `+ Verkaufserlöse (${state.club.salesShare} %)`;
  qs("#rSales").textContent = fmtEUR(b.salesIncome);
  qs("#rSales").title = `Brutto ${fmtEUR(b.salesGross)}, davon ${state.club.salesShare} % fürs Budget`;
  qs("#rWageRelief").textContent = fmtEUR(wageToUnit(b.wageRelief));
  renderWindowBanner();
  const tab = state.ui.transferTab;
  qsa("#transferTabs [data-tab]").forEach(x=>x.classList.toggle("active", x.dataset.tab === tab));
  ["center","plan","buy","sell","history"].forEach(t=> qs("#tr-"+t).classList.toggle("active", t === tab));
  if(tab === "center") renderTransferCenter(); else if(qs("#tr-center")) qs("#tr-center").innerHTML = "";
  if(tab === "plan"){ const c = qs("#tr-center"); if(c) c.innerHTML = ""; }
  if(tab === "plan") renderTransferPlan();
  if(tab !== "center") stopDeadlineClock();
  qs('#transferTabs [data-tab="center"]').classList.toggle("dd-hot", deadlineState().active);
  const nSales = state.sales.length;
  qs('#transferTabs [data-tab="sell"]').textContent = nSales ? `Verkäufe (${nSales})` : "Verkäufe";
  if(tab === "sell") renderSales();
  if(tab === "history") renderTransferHistory();
  const r = qs("#rRemaining"), w = qs("#rWageRemaining");
  r.textContent = fmtEUR(b.transferLeft); r.classList.toggle("neg", b.transferLeft < 0);
  w.textContent = fmtEUR(wageToUnit(b.wageLeft)); w.classList.toggle("neg", b.wageLeft < 0);

  const q = qs("#scoutSearch").value.trim().toLowerCase(), sf = qs("#scoutStatusFilter").value;
  const statusRank = {fixed:0, negotiating:1, watched:2};
  renderCFHeads("scoutTable", "scouting");
  if(scoutSort && scoutSort.key.startsWith("cf:") && !cfById(scoutSort.key.slice(3))) scoutSort = null;
  const rows = state.scouting.filter(t=>(!q || t.name.toLowerCase().includes(q) || t.note.toLowerCase().includes(q)) && (!sf || t.status===sf))
    .sort((a,b)=> scoutSort ? ((scoutSort.key.startsWith("cf:") && cfEmptyOrder(scoutSort.key.slice(3), a, b)) || (scoutCompare(scoutSort.key, a, b) || a.name.localeCompare(b.name,"de")) * scoutSort.dir)
      : b.priority-a.priority || statusRank[listBase("scoutStatus", a.status)]-statusRank[listBase("scoutStatus", b.status)] || GRADES.indexOf(a.grade)-GRADES.indexOf(b.grade));
  qsa("#scoutTable th[data-sort]").forEach(th=>{
    th.classList.toggle("sorted", !!scoutSort && th.dataset.sort === scoutSort.key);
    th.classList.toggle("desc", !!scoutSort && th.dataset.sort === scoutSort.key && scoutSort.dir < 0);
  });

  qs("#scoutTbody").innerHTML = rows.map(t=>`
    <tr data-id="${t.id}">
      <td data-label="Priorität"><span class="prio" aria-label="Priorität">${[1,2,3].map(i=>`<button type="button" data-prio="${i}" class="${i<=t.priority?"on":""}" aria-label="Priorität ${i}">★</button>`).join("")}</span></td>
      <td data-label="Name"><div class="player-cell"><input type="text" class="w-name" value="${esc(t.name)}" data-field="name" aria-label="Name">${t.kind === "loan" ? `<span class="loan-in-tag" title="Leihe · Gehaltsanteil ${t.wageShare} %">Leihe</span>` : ""}</div></td>
      <td data-label="Pos."><select class="w-pos" data-field="pos" aria-label="Position">${options(POS_LIST, t.pos)}</select></td>
      <td data-label="Alter"><input type="number" class="w-xs" value="${t.age}" data-field="age" aria-label="Alter"></td>
      <td data-label="Grade"><select class="grade-select grade-${t.grade.replace("+","plus")}" data-field="grade" aria-label="Scouting-Grade">${options(GRADES, t.grade)}</select></td>
      <td data-label="Status"><select class="w-sel status-${listBase("scoutStatus", t.status)}" data-field="status" aria-label="Status">${options(SCOUT_STATUS, t.status)}</select></td>
      <td data-label="Ablöse">${moneyInput(t.fee, 'class="money w-m" data-field="fee" aria-label="Ablöse"')}</td>
      <td data-label="Handgeld">${moneyInput(t.bonus, 'class="money w-m" data-field="bonus" aria-label="Handgeld"')}</td>
      <td data-label="Gehalt${wageSuffix()}">${moneyInput(t.wage, `class="money w-m" data-field="wage" aria-label="Gehalt ${WAGE_UNITS[wageUnit()].label}"`, true)}</td>
      <td data-label="Notiz"><input type="text" value="${esc(t.note)}" data-field="note" placeholder="Notiz…" aria-label="Notiz"></td>
      ${cfDefs("scouting").map(d=>cfCellHTML(d, t)).join("")}
      <td data-label=""><span class="row-actions">
        ${listBase("scoutStatus", t.status)==="fixed" ? `<button class="btn-icon-sm" data-sign title="In den Kader übernehmen" aria-label="${esc(t.name)} in den Kader übernehmen">✓</button>` : ""}
        <button class="btn-icon-sm del" data-del title="Löschen" aria-label="${esc(t.name)} löschen">✕</button>
      </span></td>
    </tr>`).join("") || `<tr class="empty-row"><td colspan="${11 + cfDefs("scouting").length}">${state.scouting.length ? "Keine Ziele passen zu den Filtern." : "Noch keine Transferziele. Mit „+ Transferziel“ die Beobachtungsliste starten."}</td></tr>`;
}

function renderWindowBanner(){
  const w = windowStatus();
  const el = qs("#windowBanner");
  if(!w){ el.innerHTML = ""; return; }
  const when = fmtDate(toISO(w.date), {day:"numeric", month:"long"});
  el.className = "window-banner " + (w.open ? (w.days <= 7 ? "closing" : "open") : "closed");
  el.innerHTML = w.open
    ? `<span class="wb-dot"></span><strong>${w.label} offen</strong> · schließt ${w.days === 0 ? "heute" : `in ${w.days} ${w.days===1?"Tag":"Tagen"}`} (${when})`
    : `<span class="wb-dot"></span><strong>Transferfenster geschlossen</strong> · ${w.label} öffnet in ${w.days} ${w.days===1?"Tag":"Tagen"} (${when})`;
  el.title = "Fensterdaten in den Einstellungen anpassbar (je nach Liga verschieden)";
}


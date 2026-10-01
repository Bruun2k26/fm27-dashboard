/* ==========================================================================
   FINANCE
   ========================================================================== */
function sortedBalance(){ return state.balanceLog.slice().sort((a,b)=>a.date.localeCompare(b.date)); }

function renderFinance(){
  if(!qs("#finStats")) return;
  const b = budgetCalc(), c = state.club;
  const bal = sortedBalance(), last = bal[bal.length-1], prev = bal[bal.length-2];
  const seasonLog = state.transferLog.filter(t=>t.season === c.season);
  const net = seasonLog.reduce((a,t)=>a + (t.type === "out" ? t.fee : -t.fee), 0);
  const usage = c.wageBudget ? b.wagesNow / c.wageBudget * 100 : 0;
  qs("#finStats").innerHTML = `
    <div class="fstat"><span>Kontostand</span><strong class="${last && last.amount < 0 ? "neg" : ""}">${last ? fmtEUR(last.amount) : "—"}</strong>
      <em class="${last && prev ? (last.amount >= prev.amount ? "pos" : "neg") : ""}">${last && prev ? `${last.amount >= prev.amount ? "+" : "−"}${fmtEUR(Math.abs(last.amount-prev.amount))} seit ${fmtDate(prev.date,{day:"numeric",month:"short"})}` : last ? "Stand "+fmtDate(last.date,{day:"numeric",month:"short",year:"numeric"}) : "Noch kein Eintrag"}</em></div>
    <div class="fstat"><span>Transferbudget frei</span><strong class="${b.transferLeft<0?"neg":""}">${fmtEUR(b.transferLeft)}</strong><em>nach geplanten Transfers</em></div>
    <div class="fstat"><span>Gehaltsbudget genutzt</span><strong class="${usage>100?"neg":""}">${c.wageBudget ? fmtNum(usage,0)+" %" : "—"}</strong><em>${fmtWage(b.wagesNow)} von ${fmtWage(c.wageBudget)}</em></div>
    <div class="fstat"><span>Transfersaldo ${esc(c.season)}</span><strong class="${net<0?"neg":"pos"}">${net>=0?"+":"−"}${fmtEUR(Math.abs(net))}</strong><em>${seasonLog.length} Transfers</em></div>`;

  // Budgets (editable here as well as in the settings)
  const fb = qs("#finBudgets");
  if(!fb.contains(document.activeElement)){
    fb.innerHTML = `
      <div class="field"><label>Transferbudget (€)</label>${moneyInput(c.transferBudget, 'data-fin="transferBudget"')}</div>
      <div class="field"><label>Gehaltsbudget gesamt ${WAGE_UNITS[wageUnit()].label} (€)</label>${moneyInput(c.wageBudget, 'data-fin="wageBudget"', true)}</div>
      <div class="field"><label>Budget-Anteil aus Verkäufen (%)</label><input type="number" min="0" max="100" step="5" data-fin="salesShare" value="${c.salesShare}"></div>
      <p class="hint">Werte aus FM übernehmen (Finanzen → Übersicht bzw. Gehaltsbudget). Eingaben wie „2,5 Mio“ oder „850k“ funktionieren.</p>`;
  }

  // Wage budget usage: today → after planned transfers → next season
  const future = futureSquadEntries();
  const withMaybe = state.ui.futureUncertain;
  const nextWages = future.entries.filter(e=>FUTURE_KIND[e.kind].counted || (withMaybe && FUTURE_KIND[e.kind].uncertain)).reduce((a,e)=>a+e.wage,0);
  const planned = b.wagesNow + b.wages - b.wageRelief;
  const row = (label, value, note) => {
    const p = c.wageBudget ? value / c.wageBudget * 100 : 0;
    const cls = p > 100 ? "over" : p > 92 ? "tight" : "";
    return `<div class="usage-row">
      <div class="usage-top"><span>${label}</span><strong>${fmtWage(value)}</strong><span class="usage-pct ${cls}">${c.wageBudget ? fmtNum(p,0)+" %" : ""}</span></div>
      <div class="usage-track"><div class="usage-bar ${cls}" style="width:${clamp(p,0,100)}%"></div>${p > 100 ? `<div class="usage-over" style="width:${clamp(p-100,0,40)}%"></div>` : ""}<i class="usage-limit"></i></div>
      ${note ? `<div class="muted small">${note}</div>` : ""}
    </div>`;
  };
  qs("#finWages").innerHTML = c.wageBudget ? `
    ${row("Heute", b.wagesNow, `Spielraum ${fmtWage(c.wageBudget - b.wagesNow)}`)}
    ${row("Nach geplanten Transfers", planned, `+ ${fmtWage(b.wages)} Neuzugänge, − ${fmtWage(b.wageRelief)} Verkäufe`)}
    ${row(`Saison ${esc(future.label)}`, nextWages, `laut Zukunfts-Kader${withMaybe ? " (inkl. unsicherer)" : ""} – auslaufende Verträge fallen weg`)}
    <p class="hint">Strich = Gehaltsbudget ${fmtWage(c.wageBudget)}. Orange ab 92 %, Rot über Budget.</p>`
    : `<p class="empty">Trage links dein Gehaltsbudget aus FM ein, um die Auslastung zu sehen.</p>`;

  renderBalance();
  renderTransferSeasons();
}

function renderBalance(){
  const bal = sortedBalance();
  const box = qs("#balanceChart");
  if(bal.length < 2){
    box.innerHTML = `<p class="empty">${bal.length ? "Noch ein Eintrag mehr, dann erscheint hier die Kurve." : "Noch keine Einträge. Trag den Kontostand aus FM z. B. einmal im Monat ein – so entsteht ein Verlauf über die Saisons."}</p>`;
  } else {
    const W = 640, H = 220, L = 64, R = 12, T = 14, B = 28;
    const t0 = parseISO(bal[0].date).getTime(), t1 = parseISO(bal[bal.length-1].date).getTime();
    // "nice" axis: steps of 1/2/5 × 10^n so the labels read 0, 5, 10, 15 Mio. …
    const rawLo = Math.min(0, ...bal.map(x=>x.amount)), rawHi = Math.max(...bal.map(x=>x.amount), rawLo + 1);
    const rough = (rawHi - rawLo) / 4, mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1,2,2.5,5,10].map(f=>f*mag).find(v=>v >= rough) || 10*mag;
    const lo = Math.floor(rawLo / step) * step, hi = Math.ceil(rawHi / step) * step;
    const X = t => L + (t1 === t0 ? 0.5 : (t - t0)/(t1 - t0)) * (W-L-R);
    const Y = v => T + (1 - (v - lo)/(hi - lo)) * (H-T-B);
    const pts = bal.map(x=>[X(parseISO(x.date).getTime()), Y(x.amount)]);
    const line = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
    const area = line + ` L${pts[pts.length-1][0].toFixed(1)} ${Y(Math.max(lo,0)).toFixed(1)} L${pts[0][0].toFixed(1)} ${Y(Math.max(lo,0)).toFixed(1)} Z`;
    const grid = [];
    for(let v = lo; v <= hi + step/2; v += step){ grid.push(`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="bc-grid"/><text x="${L-6}" y="${Y(v)}" class="bc-yl">${esc(fmtEUR(v))}</text>`); }
    // season boundaries (1 July)
    const seasonLines = [];
    for(let y = new Date(t0).getFullYear(); y <= new Date(t1).getFullYear(); y++){
      const t = new Date(y,6,1).getTime();
      if(t > t0 && t < t1) seasonLines.push(`<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H-B}" class="bc-season"/><text x="${X(t)+4}" y="${T+10}" class="bc-sl">${y}/${String((y+1)%100).padStart(2,"0")}</text>`);
    }
    const xl = [bal[0], bal[Math.floor(bal.length/2)], bal[bal.length-1]].filter((x,i,a)=>a.indexOf(x)===i)
      .map((x,i,a)=>`<text x="${X(parseISO(x.date).getTime())}" y="${H-8}" class="bc-xl" text-anchor="${i===0 ? "start" : i===a.length-1 ? "end" : "middle"}">${fmtDate(x.date,{month:"short",year:"2-digit"})}</text>`).join("");
    box.innerHTML = `<svg class="balance-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kontostand-Verlauf">
      ${grid.join("")}${lo < 0 ? `<line x1="${L}" x2="${W-R}" y1="${Y(0)}" y2="${Y(0)}" class="bc-zero"/>` : ""}${seasonLines.join("")}
      <path d="${area}" class="bc-area"/><path d="${line}" class="bc-line"/>
      ${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" class="bc-pt"><title>${esc(fmtDate(bal[i].date,{day:"numeric",month:"long",year:"numeric"}))}: ${esc(fmtEUR(bal[i].amount))}${bal[i].note ? " – "+esc(bal[i].note) : ""}</title></circle>`).join("")}
      ${xl}</svg>`;
  }
  qs("#balanceList").innerHTML = bal.length ? `<table class="res-table"><thead><tr><th>Datum</th><th class="num">Kontostand</th><th class="num">Δ</th><th>Notiz</th><th></th></tr></thead><tbody>
    ${bal.slice().reverse().map((x,i,arr)=>{ const before = arr[i+1]; const d = before ? x.amount - before.amount : null;
      return `<tr data-id="${x.id}"><td class="muted">${fmtDate(x.date,{day:"2-digit",month:"2-digit",year:"2-digit"})}</td>
        <td class="num"><strong>${fmtEUR(x.amount)}</strong></td>
        <td class="num ${d===null?"":d>=0?"pos-t":"neg-t"}">${d===null ? "" : (d>=0?"+":"−")+fmtEUR(Math.abs(d))}</td>
        <td class="muted">${esc(x.note)}</td>
        <td><button class="btn-icon-sm del" data-del-bal aria-label="Eintrag löschen">✕</button></td></tr>`; }).join("")}
    </tbody></table>` : "";
}

function openBalanceModal(){
  const last = sortedBalance().slice(-1)[0];
  openModal({
    title:"Kontostand eintragen",
    body:`<p class="lead">In FM unter Finanzen ablesen. Ein Eintrag pro Monat reicht für einen aussagekräftigen Verlauf.</p>
      <div class="field-row">
        <div class="field"><label>Datum</label><input data-f="date" type="date" value="${esc(state.club.ingameDate)}"></div>
        <div class="field"><label>Kontostand (€)</label>${moneyInput(last ? last.amount : 0, 'data-f="amount"')}</div>
      </div>
      <div class="field"><label>Notiz (optional)</label><input data-f="note" placeholder="z. B. nach Sommerfenster"></div>`,
    saveLabel:"Speichern",
    onSave: get=>{
      const date = parseISO(get("date")) ? get("date") : state.club.ingameDate;
      const existing = state.balanceLog.find(x=>x.date === date);
      if(existing) Object.assign(existing, {amount:get("amount"), note:get("note")});   // one value per day
      else state.balanceLog.push({id:uid(), date, amount:get("amount"), note:get("note")});
      saveState(); renderFinance(); toast(existing ? "Kontostand für diesen Tag aktualisiert" : "Kontostand eingetragen");
    }
  });
}

function renderTransferSeasons(){
  const seasons = [...new Set(state.transferLog.map(t=>t.season).filter(Boolean))].sort();
  const box = qs("#finTransfers");
  if(!seasons.length){ box.innerHTML = `<p class="empty">Noch keine abgeschlossenen Transfers. Käufe (✓ bei „Fixiert“) und Verkäufe erscheinen hier automatisch.</p>`; return; }
  const data = seasons.map(se=>{
    const l = state.transferLog.filter(t=>t.season === se);
    return {se, out:l.filter(t=>t.type==="in").reduce((a,t)=>a+t.fee,0), inc:l.filter(t=>t.type==="out").reduce((a,t)=>a+t.fee,0)};
  });
  const max = Math.max(1, ...data.map(d=>Math.max(d.out, d.inc)));
  box.innerHTML = `<div class="season-bars">${data.map(d=>{ const net = d.inc - d.out; return `
    <div class="sb-row">
      <div class="sb-label">${esc(d.se)}</div>
      <div class="sb-bars">
        <div class="sb-line"><div class="sb-bar out" style="width:${d.out/max*72}%"></div><span>${fmtEUR(d.out)} Ausgaben</span></div>
        <div class="sb-line"><div class="sb-bar in" style="width:${d.inc/max*72}%"></div><span>${fmtEUR(d.inc)} Einnahmen</span></div>
      </div>
      <div class="sb-net ${net<0?"neg-t":"pos-t"}">${net>=0?"+":"−"}${fmtEUR(Math.abs(net))}</div>
    </div>`; }).join("")}</div>`;
}

function initFinance(){
  qs("#btnAddBalance").addEventListener("click", openBalanceModal);
  qs("#finBudgets").addEventListener("change", e=>{
    const el = e.target.closest("[data-fin]"); if(!el) return;
    const k = el.dataset.fin;
    state.club[k] = k === "salesShare" ? clamp(Math.round(num(el.value, 100)), 0, 100) : Math.max(0, readInput(el));
    saveState();
    el.blur();
    renderHeader(); renderFinance(); renderRecruitment();
  });
  qs("#balanceList").addEventListener("click", e=>{
    const b = e.target.closest("[data-del-bal]"); if(!b) return;
    removeWithUndo("balanceLog", b.closest("tr").dataset.id, "Kontostand-Eintrag", renderFinance);
  });
}

/* ---------- Sales ---------- */
function renderSales(){
  qs("#includeListed").checked = state.ui.includeListed;
  const share = qs("#salesShare"); if(document.activeElement !== share) share.value = state.club.salesShare;
  const onList = new Set(state.sales.map(x=>x.playerId));
  const missing = state.players.filter(p=>listBase("squadRoles", p.squadRole) === "sell" && !onList.has(p.id));
  qs("#salesHint").innerHTML = missing.length ? `<div class="sales-hint">Als „Abgabe“ markiert, aber nicht auf der Verkaufsliste: ${missing.map(p=>
    `<button class="btn btn-sm" data-add-sale="${p.id}">+ ${esc(p.name)}</button>`).join(" ")}</div>` : "";
  const rank = {agreed:0, offer:1, listed:2};
  // 11.0 fix: a sale may still point to a player removed in this session (sold elsewhere, loaned, deleted) → skip it
  qs("#salesTbody").innerHTML = state.sales.filter(x=>playerById(x.playerId)).sort((a,b)=>rank[listBase("saleStatus", a.status)]-rank[listBase("saleStatus", b.status)]).map(x=>{
    const p = playerById(x.playerId), lv = contractLevel(contractMonthsLeft(p));
    return `<tr data-id="${x.id}">
      <td data-label="Spieler"><div class="player-cell"><span class="avatar">${esc(initials(p.name))}</span><strong>${plink(p.id, p.name)}</strong></div></td>
      <td data-label="Pos.">${p.pos}</td>
      <td data-label="Alter">${p.age}</td>
      <td data-label="Gehalt${wageSuffix()}">${fmtWage(p.salary)}</td>
      <td data-label="Vertrag"><span class="contract-cell" title="${lv.text}"><span class="c-dot ${lv.cls}"></span>${p.contractUntil}</span></td>
      <td data-label="Erwarteter Erlös">${moneyInput(x.price, 'class="money w-m" data-field="price" aria-label="Erwarteter Erlös"')}</td>
      <td data-label="Status"><select class="w-sel sale-${listBase("saleStatus", x.status)}" data-field="status" aria-label="Verkaufsstatus">${options(SALE_STATUS, x.status)}</select></td>
      <td data-label="Notiz"><input type="text" value="${esc(x.note)}" data-field="note" placeholder="Interessent, Klauseln…" aria-label="Notiz"></td>
      <td data-label=""><span class="row-actions">
        <button class="btn-icon-sm" data-complete title="Verkauf abschließen" aria-label="Verkauf von ${esc(p.name)} abschließen">✓</button>
        <button class="btn-icon-sm del" data-del title="Von der Liste nehmen" aria-label="${esc(p.name)} von der Verkaufsliste nehmen">✕</button>
      </span></td></tr>`;
  }).join("") || `<tr class="empty-row"><td colspan="9">Keine Verkäufe geplant. Mit „+ Verkauf planen“ einen Spieler auf die Liste setzen – Erlöse fließen (anteilig) ins Transferbudget.</td></tr>`;
}
function openSaleModal(preselectId){
  const onList = new Set(state.sales.map(x=>x.playerId));
  const candidates = state.players.filter(p=>!onList.has(p.id));
  if(!candidates.length){ toast("Alle Spieler stehen bereits auf der Verkaufsliste."); return; }
  openModal({
    title:"Verkauf planen",
    body:`
      <div class="field"><label>Spieler</label><select data-f="playerId">${candidates.sort((a,b)=>POS_LIST.indexOf(a.pos)-POS_LIST.indexOf(b.pos)).map(p=>
        `<option value="${p.id}" ${p.id===preselectId?"selected":""}>${p.pos} · ${esc(p.name)} (${p.age} J., Vertrag bis ${p.contractUntil})</option>`).join("")}</select></div>
      <div class="field-row">
        <div class="field"><label>Erwarteter Erlös (€)</label>${moneyInput((()=>{ const pre = playerById(preselectId) || candidates[0]; return valueMid(pre) || 1000000; })(), 'data-f="price"')}</div>
        <div class="field"><label>Status</label><select data-f="status">${options(SALE_STATUS,"listed")}</select></div>
      </div>
      <div class="field"><label>Interessent / Notiz</label><input data-f="note"></div>
      <label class="check-label"><input type="checkbox" data-f="markSell" checked> Kaderrolle auf „Abgabe“ setzen</label>`,
    onOpen: m=>{
      // follow the chosen player: suggest the middle of his FM transfer value
      qs('[data-f="playerId"]', m).onchange = e=>{ const pl = playerById(e.target.value), v = valueMid(pl); if(v) qs('[data-f="price"]', m).value = fmtNum(v); };
    },
    saveLabel:"Auf die Liste",
    onSave: get=>{
      const p = playerById(get("playerId"));
      state.sales.push({id:uid(), playerId:p.id, price:Math.max(0,get("price")), status:get("status"), note:get("note")});
      if(get("markSell")) p.squadRole = "sell";
      saveState(); renderRecruitment(); renderHeader(); renderSquad(); renderHome();
      toast(`${p.name} steht auf der Verkaufsliste`);
    }
  });
}
/** Completed sale: player leaves, the board's share of the fee and the wage go back into the budgets. */
function completeSale(x){
  const p = playerById(x.playerId);
  if(!p){ state.sales = state.sales.filter(y=>y.id !== x.id); saveState(); renderAll(); toast("Dieser Spieler ist nicht mehr im Kader – Verkaufseintrag entfernt."); return; }
  openModal({
    title:`${p.name} verkaufen`,
    body:`<p class="lead">Der Spieler verlässt den Kader. ${state.club.salesShare} % der Ablöse fließen ins Transferbudget (Einstellung unter „Verkäufe“), sein Gehalt von ${fmtWage(p.salary)} wird frei.</p>
      <div class="field-row">
        <div class="field"><label>Ablöse (€)</label>${moneyInput(x.price, 'data-f="fee"')}</div>
        <div class="field"><label>Aufnehmender Verein</label><input data-f="club" value=""></div>
      </div>`,
    saveLabel:"Verkauf abschließen",
    onSave: get=>{
      const undo = snapshotUndo(`${p.name} verkauft`, renderAll);
      const fee = Math.max(0, get("fee"));
      state.club.transferBudget += Math.round(fee * state.club.salesShare / 100);
      state.transferLog.push({id:uid(), date:state.club.ingameDate, type:"out", name:p.name, pos:p.pos, fee, club:get("club").trim(), season:state.club.season});
      state.players = state.players.filter(y=>y.id !== p.id);
      state = sanitizeState(state);          // removes sale entry, line-up and set-piece references
      saveState(); renderAll(); undo();
    }
  });
}

/* ---------- Transfer history ---------- */
let historyFilter = "season";
function renderTransferHistory(){
  const seasons = [...new Set(state.transferLog.map(t=>t.season).filter(Boolean))].sort().reverse();
  if(historyFilter !== "all" && historyFilter !== "season" && !seasons.includes(historyFilter)) historyFilter = "season";
  const list = state.transferLog.filter(t=> historyFilter === "all" ? true : t.season === (historyFilter === "season" ? state.club.season : historyFilter))
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const spent = list.filter(t=>t.type==="in").reduce((a,t)=>a+t.fee,0);
  const earned = list.filter(t=>t.type==="out").reduce((a,t)=>a+t.fee,0);
  const net = earned - spent;
  qs("#transferHistory").innerHTML = `
    <div class="toolbar">
      <select id="historySeason" aria-label="Zeitraum">
        <option value="season">Diese Saison (${esc(state.club.season)})</option><option value="all">Alle</option>
        ${seasons.filter(x=>x!==state.club.season).map(x=>`<option value="${esc(x)}">Saison ${esc(x)}</option>`).join("")}
      </select>
    </div>
    <div class="future-stats hist-stats">
      <div class="fstat"><span>Ausgaben</span><strong class="neg">${fmtEUR(spent)}</strong><em>${list.filter(t=>t.type==="in").length} Zugänge</em></div>
      <div class="fstat"><span>Einnahmen (brutto)</span><strong class="pos">${fmtEUR(earned)}</strong><em>${list.filter(t=>t.type==="out").length} Abgänge</em></div>
      <div class="fstat"><span>Transfersaldo</span><strong class="${net<0?"neg":"pos"}">${net>=0?"+":""}${fmtEUR(net)}</strong></div>
    </div>
    ${list.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Datum</th><th></th><th>Spieler</th><th>Pos.</th><th>Verein</th><th class="num">Ablöse</th><th></th></tr></thead><tbody>
      ${list.map(t=>`<tr data-id="${t.id}">
        <td data-label="Datum">${t.date ? fmtDate(t.date,{day:"2-digit",month:"2-digit",year:"numeric"}) : "—"}</td>
        <td data-label=""><span class="hist-type ${t.type}">${t.type==="in" ? "↓ Zugang" : "↑ Abgang"}</span></td>
        <td data-label="Spieler"><strong>${esc(t.name)}</strong></td><td data-label="Pos.">${t.pos || "—"}</td>
        <td data-label="Verein">${esc(t.club) || "—"}</td>
        <td data-label="Ablöse" class="num">${fmtEUR(t.fee)}</td>
        <td data-label=""><button class="btn-icon-sm del" data-del-log aria-label="Eintrag löschen">✕</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">Noch keine Transfers in diesem Zeitraum. Abgeschlossene Käufe (✓ bei „Fixiert“) und Verkäufe landen automatisch hier.</p>`}`;
  qs("#historySeason").value = historyFilter;
}

function openTargetModal(preset){
  preset = (preset && typeof preset === "object" && !preset.target) ? preset : {};   // may be called as a click handler
  openModal({
    title: preset.kind === "loan" ? "Neues Leihziel" : "Neues Transferziel",
    body:`
      <div class="field"><label>Name</label><input data-f="name"></div>
      <div class="field-row">
        <div class="field"><label>Position</label><select data-f="pos">${options(POS_LIST, preset.pos || "ZM")}</select></div>
        <div class="field"><label>Alter</label><input data-f="age" type="number" value="22"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Scouting-Grade</label><select data-f="grade">${options(GRADES,"B")}</select></div>
        <div class="field"><label>Priorität</label><select data-f="priority">${options(PRIORITIES,2)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Art</label><select data-f="kind">${options({buy:"Kauf", loan:"Leihe (Spieler ausleihen)"}, preset.kind || "buy")}</select></div>
        <div class="field"><label>Gehaltsanteil bei Leihe (%)</label><input data-f="wageShare" type="number" min="0" max="100" value="${preset.kind === "loan" ? 50 : 100}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Ablöse bzw. Leihgebühr (€)</label>${moneyInput(preset.kind === "loan" ? 0 : 5000000, 'data-f="fee"')}</div>
        <div class="field"><label>Handgeld (€)</label>${moneyInput(preset.kind === "loan" ? 0 : 200000, 'data-f="bonus"')}</div>
      </div>
      <div class="field"><label>Gehalt ${WAGE_UNITS[wageUnit()].label} (€, volles Gehalt)</label>${moneyInput(300000, 'data-f="wage"', true)}</div>`,
    saveLabel:"Hinzufügen",
    onSave: get=>{
      state.scouting.push({id:uid(), name:get("name").trim()||"Unbekannt", pos:get("pos"), age:get("age"), grade:get("grade"),
        status:"watched", priority:num(get("priority"),2), fee:get("fee"), bonus:get("bonus"), wage:get("wage"), note:"",
        kind:get("kind"), wageShare:clamp(Math.round(num(get("wageShare"),100)),0,100)});
      saveState(); renderRecruitment(); renderHeader(); toast("Transferziel hinzugefügt");
    }
  });
}

// Completed transfer: move into squad and consume the budget.
function signTarget(t){
  const isLoan = t.kind === "loan";
  const seasonEnd = ingameDate().getMonth() >= 6 ? ingameDate().getFullYear() + 1 : ingameDate().getFullYear();
  openModal({
    title: isLoan ? `${t.name} ausleihen` : `${t.name} verpflichten`,
    body:`<p class="lead">${isLoan ? `Übernimmt den Leihspieler in den Kader: Leihgebühr vom Transferbudget, ${t.wageShare} % des Gehalts laufen über dein Gehaltsbudget. Zum Leihende geht er zurück (Zukunfts-Kader).` : "Übernimmt den Spieler in den Kader und zieht Ablöse + Handgeld vom Transferbudget sowie das Gehalt vom Gehaltsspielraum ab."}</p>
      <div class="field-row">
        <div class="field"><label>${isLoan ? "Leihe bis (Jahr, jeweils 30.06.)" : "Vertrag bis (Jahr)"}</label><input data-f="contractUntil" type="number" value="${isLoan ? seasonEnd : ingameDate().getFullYear()+4}"></div>
        <div class="field"><label>Kaderrolle</label><select data-f="squadRole">${options(SQUAD_ROLES, isLoan ? "rotation" : t.age<21?"prospect":"first")}</select></div>
      </div>
      ${isLoan ? `<div class="field"><label>Notiz zur Leihe</label><textarea data-f="loanNote" rows="2" placeholder="z. B. versprochene Einsatzzeiten, Kaufoption"></textarea></div>` : ""}`,
    saveLabel:"Verpflichten",
    onSave: get=>{
      const undo = snapshotUndo(`${t.name} verpflichtet`, renderAll);
      state.players.push({id:uid(), name:t.name, pos:t.pos, altPos:[], age:t.age, salary: isLoan ? Math.round(t.wage * t.wageShare / 100) : t.wage, contractUntil:get("contractUntil"), custom:Object.assign({}, t.custom), loanIn:isLoan,
        squadRole:get("squadRole"), rating: (()=>{ const i = GRADES.indexOf(t.grade); return i < 0 ? 3 : i <= 1 ? 4 : i === 2 ? 3 : 2; })(), status:"",
        note: isLoan && get("loanNote").trim() ? [t.note, "Leihe: " + get("loanNote").trim()].filter(Boolean).join(" · ") : t.note});
      state.club.transferBudget -= (t.fee + t.bonus);
      state.transferLog.push({id:uid(), date:state.club.ingameDate, type:"in", name: isLoan ? `${t.name} (Leihe)` : t.name, pos:t.pos, fee:t.fee, club:"", season:state.club.season});
      state.scouting = state.scouting.filter(x=>x.id!==t.id);
      saveState(); renderAll(); undo();
    }
  });
}


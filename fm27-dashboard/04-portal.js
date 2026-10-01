/* ==========================================================================
   PORTAL
   ========================================================================== */
function renderHome(){
  { const h = qs('[data-panel="goals"] .card-head h2'); if(h) h.textContent = isNat() ? "Verbandsziele" : "Vorstandsziele"; }
  renderHomeNational();
  renderHomeWindow();
  renderHomeJourney();
  // Next match
  const nm = state.nextMatch;
  const venue = VENUES[nm.venue];
  let days = "";
  const md = parseISO(nm.date);
  if(md){
    const diff = Math.round((md - ingameDate())/86400000);
    days = diff === 0 ? " · heute" : diff === 1 ? " · morgen" : diff > 1 ? ` · in ${diff} Tagen` : " · Datum liegt zurück";
  }
  qs("#nextMatchBox").innerHTML = nm.opponent ? `
    <div class="nm-main"><span class="nm-opp">${esc(nm.opponent)}</span><span class="nm-venue">${venue}</span></div>
    <div class="nm-meta">${(()=>{ const pl = state.plans.find(x=>x.id===matchPlanId()); const b = planBlock(pl.id); return `<span class="nm-plan">${esc(pl.name)} · ${esc(formationLabel(b.formationName, b))}</span> · `; })()}${esc(nm.competition || "Wettbewerb offen")}${md ? " · "+fmtDate(nm.date,{weekday:"short",day:"numeric",month:"short"}) : ""}${days}</div>
    <div class="nm-grid">
      <div><h4>Matchplan</h4><p>${esc(nm.matchplan) || "—"}</p></div>
      <div><h4>Schwachstellen · erwartet ${esc(nm.formation || "?")}</h4><p>${esc(nm.weaknesses) || "—"}</p></div>
    </div>` : `<p class="empty">Noch kein Gegner eingetragen. Unter „Spieltag“ vorbereiten.</p>`;

  // Form & tactic record (current season, real games only)
  const season = seasonResults(state.club.season);
  const last5 = season.slice(0,5);
  const pts = last5.reduce((a,r)=>a+POINTS[resultOf(r)],0);
  const gf = last5.reduce((a,r)=>a+r.gf,0), ga = last5.reduce((a,r)=>a+r.ga,0), diff = gf-ga;
  const pips = last5.slice().reverse().map(r=>`
      <div class="form-col" title="${esc(r.opponent)}${r.date ? " · "+fmtDate(r.date,{day:"numeric",month:"short"}) : ""}"><div class="form-pip ${resultOf(r)}">${RESULT_LETTER[resultOf(r)]}</div><span>${r.gf}:${r.ga}</span></div>`);
  for(let i=last5.length;i<5;i++) pips.unshift(`<div class="form-col"><div class="form-pip empty" title="Noch kein Spiel">–</div><span>&nbsp;</span></div>`);
  const plans = groupRecord(season, r=>r.planId || "_none", r=>planDisplayName(r)).slice(0,3);
  qs("#formCurve").innerHTML = season.length ? `
    <div class="form-strip">${pips.join("")}</div>
    <div class="form-sum"><span><strong>${pts}</strong> Pkt.</span><span>Tore <strong>${gf}:${ga}</strong></span><span>Diff. <strong>${diff>0?"+":""}${diff}</strong></span></div>
    <div class="rec-mini">${plans.map(g=>`<div class="rec-line"><span class="rec-name">${esc(g.label)}</span>${recordBadges(g)}<span class="rec-ppg">${fmtNum(g.ppg,1)} P/Sp</span></div>`).join("")}</div>`
    : `<div class="form-strip">${pips.join("")}</div><p class="empty">Noch keine Spiele diese Saison. Ergebnisse trägst du unter „Spieltag“ ein – das Dashboard fragt nach dem Spieltag automatisch.</p>`;

  // Squad plan
  const counts = {}; SQUAD_ROLE_ORDER.forEach(r=>counts[r]=0);
  state.players.forEach(p=>counts[p.squadRole]++);
  const unavail = state.players.filter(p=>UNAVAILABLE.includes(p.status)).length;
  const avgAge = state.players.length ? fmtNum(state.players.reduce((s,p)=>s+p.age,0)/state.players.length, 1) : "–";
  const wageSum = state.players.reduce((s,p)=>s+p.salary,0);
  qs("#squadPlanSummary").innerHTML = `<div class="kv-list">
    ${SQUAD_ROLE_ORDER.map(r=>`<div class="kv"><span>${SQUAD_ROLES[r]}</span><strong>${counts[r]}</strong></div>`).join("")}
    <div class="kv sep"><span>Kader · Ø Alter</span><strong>${state.players.length} · ${avgAge}</strong></div>
    <div class="kv"><span>Nicht verfügbar</span><strong>${unavail}</strong></div>
    ${isNat() ? "" : `<div class="kv"><span>Gehälter${wageSuffix()}</span><strong>${fmtEUR(wageToUnit(wageSum))}</strong></div>`}
    ${hasTransferValues() ? `<div class="kv" title="Summe der Transferwerte laut FM (Mitte der Spanne)"><span>Kaderwert</span><strong>${fmtEUR(state.players.reduce((a,p)=>a+valueMid(p),0))}</strong></div>` : ""}
    ${nextBirthdayLine()}
  </div>`;

  // Board goals
  qs("#boardGoals").innerHTML = state.boardGoals.length ? state.boardGoals.map(g=>`
    <div class="goal-row" data-id="${g.id}">
      <span class="goal-cat">${esc(g.category)}</span>
      <div><div class="goal-title">${esc(g.title)}</div><div class="goal-sub">Ziel: ${esc(g.target)||"—"} · Stand: ${esc(g.current)||"—"}</div></div>
      <select class="s-${listBase("goalStatus", g.status)}" data-goal-status aria-label="Status">${options(GOAL_STATUS, g.status)}</select>
      <span class="row-actions">
        <button class="btn-icon-sm" data-goal-edit title="Bearbeiten" aria-label="Ziel bearbeiten">✎</button>
        <button class="btn-icon-sm del" data-goal-del title="Löschen" aria-label="Ziel löschen">✕</button>
      </span>
    </div>`).join("") : `<p class="empty">Noch keine Vorstandsziele. Trage die Saisonziele aus FM ein, um sie im Blick zu behalten.</p>`;

  // Contracts
  const expiring = state.players.map(p=>({p, m:contractMonthsLeft(p)})).filter(o=>o.m<=12).sort((a,b)=>a.m-b.m);
  qs("#contractAlerts").innerHTML = expiring.length ? expiring.slice(0,6).map(({p,m})=>{
    const lv = contractLevel(m);
    return `<div class="alert-row"><span class="c-dot ${lv.cls}"></span>
      <div class="grow"><strong>${plink(p.id, p.name)}</strong> <span class="muted">${p.pos} · ${p.age} J.</span>${bosmanMarked(p) ? ' <span class="bosman-tag" title="letzte 6 Vertragsmonate">Bosman</span>' : ""}</div>
      <span class="role-tag ${listBase("squadRoles",p.squadRole)==="key"?"role-key":listBase("squadRoles",p.squadRole)==="sell"?"role-sell":""}">${SQUAD_ROLES[p.squadRole]}</span>
      <span class="muted">${lv.text}</span></div>`;
  }).join("") + (expiring.length>6 ? `<p class="hint">+ ${expiring.length-6} weitere</p>` : "")
    : `<p class="empty">Kein Vertrag läuft in den nächsten 12 Monaten aus.</p>`;

  // Mini pitch
  qs("#miniPitch").innerHTML = pitchHTML({mini:true});

  // Todos
  const open = state.todos.filter(t=>!t.done);
  qs("#todoPreview").innerHTML = open.length
    ? open.slice(0,5).map(t=>`<li>${esc(t.text)}</li>`).join("") + (open.length>5?`<li>… ${open.length-5} weitere</li>`:"")
    : `<li class="empty" style="padding-left:0">Alles erledigt.</li>`;

  // Loans
  const ptRank = l => ({bad:0, ok:1, "":2, good:3})[listBase("playtime", l.playtime) || ""] ?? 2;
  const loans = state.loans.slice().sort((a,b)=>ptRank(a)-ptRank(b) || (b.recallCheck-a.recallCheck));
  qs("#loanPreview").innerHTML = loans.length ? loans.slice(0,4).map(l=>`
    <div class="alert-row ${listBase("playtime", l.playtime) === "bad" ? "loan-bad" : ""}">${listBase("playtime", l.playtime) === "bad" ? '<span class="c-dot c-red" title="Spielzeit schlecht"></span>' : l.recallCheck ? '<span class="c-dot c-amber" title="Rückruf prüfen"></span>' : '<span class="c-dot c-green"></span>'}
      <div class="grow"><strong>${esc(l.name)}</strong><div class="muted">${esc(l.club)||"—"} · ${l.apps} Sp.${l.playtime ? " · Spielzeit: " + esc(PLAYTIME[l.playtime]) : ""}</div></div></div>`).join("")
    : `<p class="empty">Keine Spieler verliehen.</p>`;
}

function nextBirthdayLine(){
  const next = state.players.filter(p=>p.birthDate).map(p=>({p, n:daysToBirthday(p.birthDate, ingameDate())}))
    .sort((a,b)=>a.n-b.n)[0];
  if(!next) return "";
  const when = next.n === 0 ? "heute 🎂" : next.n === 1 ? "morgen" : `in ${next.n} T.`;
  return `<div class="kv" title="${esc(birthdayInfo(next.p).text)}"><span>Nächster Geburtstag</span><strong>${esc(next.p.name.split(" ").slice(-1)[0])} · ${when}</strong></div>`;
}

function initHome(){
  qs("#btnAddGoal").addEventListener("click", ()=> openGoalModal(null));
  const box = qs("#boardGoals");
  box.addEventListener("change", e=>{
    const sel = e.target.closest("[data-goal-status]"); if(!sel) return;
    const g = state.boardGoals.find(x=>x.id===sel.closest("[data-id]").dataset.id);
    g.status = sel.value; saveState(); renderHome();
  });
  box.addEventListener("click", e=>{
    const row = e.target.closest("[data-id]"); if(!row) return;
    const g = state.boardGoals.find(x=>x.id===row.dataset.id);
    if(e.target.closest("[data-goal-edit]")) openGoalModal(g);
    if(e.target.closest("[data-goal-del]")) removeWithUndo("boardGoals", g.id, "Ziel", renderHome);
  });
}
function openGoalModal(goal){
  const g = goal || {title:"", category:"Liga", target:"", current:"", status:"track"};
  openModal({
    title: goal ? "Vorstandsziel bearbeiten" : "Neues Vorstandsziel",
    body: `
      <div class="field"><label>Ziel</label><input data-f="title" value="${esc(g.title)}" placeholder="z.B. Platz 1–6 erreichen"></div>
      <div class="field-row">
        <div class="field"><label>Kategorie</label><select data-f="category">${options(GOAL_CATS, g.category)}</select></div>
        <div class="field"><label>Status</label><select data-f="status">${options(GOAL_STATUS, g.status)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Vorgabe</label><input data-f="target" value="${esc(g.target)}"></div>
        <div class="field"><label>Aktueller Stand</label><input data-f="current" value="${esc(g.current)}"></div>
      </div>`,
    onSave: get=>{
      const data = {title:get("title").trim()||"Ziel", category:get("category"), status:get("status"), target:get("target"), current:get("current")};
      if(goal) Object.assign(goal, data); else state.boardGoals.push(Object.assign({id:uid()}, data));
      saveState(); renderHome(); toast("Ziel gespeichert");
    }
  });
}


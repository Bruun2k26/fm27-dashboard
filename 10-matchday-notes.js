/* ==========================================================================
   MATCHDAY
   ========================================================================== */
const MATCH_FIELDS = {oppPlan:"planId", oppName:"opponent", oppComp:"competition", oppVenue:"venue", oppDate:"date", oppFormation:"formation", keyThreat:"keyThreat", matchplanNotes:"matchplan", weaknessNotes:"weaknesses"};
function initFixtures(){
  Object.entries(MATCH_FIELDS).forEach(([id,key])=>{
    const el = qs("#"+id);
    el.addEventListener(el.tagName === "SELECT" || el.type === "date" ? "change" : "input", ()=>{
      state.nextMatch[key] = el.value; scheduleSave(); renderHome();
      if(key === "opponent") renderOppHint();
    });
  });
  qs("#btnAddResult").addEventListener("click", ()=> openResultModal(null));
  qs("#resultsSeason").addEventListener("change", e=>{ resultsFilter = e.target.value; renderResults(); });
  qs("#resultsList").addEventListener("click", e=>{
    const row = e.target.closest("[data-id]"); if(!row) return;
    const r = state.results.find(x=>x.id === row.dataset.id); if(!r) return;
    if(e.target.closest("[data-edit]")) openResultModal(r);
    if(e.target.closest("[data-del]")) removeWithUndo("results", r.id, `Ergebnis gegen ${r.opponent}`, ()=>{ renderResults(); renderHome(); });
  });
  qs("#btnPrint").addEventListener("click", printBriefing);
  qs("#oppPlan").addEventListener("change", ()=>{ renderSubs(); renderHome(); });
  qs("#btnAddSub").addEventListener("click", ()=>{
    if(state.nextMatch.subs.length >= 5) return;
    state.nextMatch.subs.push({id:uid(), minute:"", outId:"", inId:"", note:""});
    saveState(); renderSubs();
    const rows = qsa("#subsEditor .sub-row"); if(rows.length) qs("input", rows[rows.length-1]).focus();
  });
  const se = qs("#subsEditor");
  se.addEventListener("change", e=>{
    const el = e.target.closest("[data-field]"); if(!el) return;
    const x = state.nextMatch.subs.find(o=>o.id === el.closest("[data-id]").dataset.id);
    x[el.dataset.field] = el.value; saveState();
  });
  se.addEventListener("click", e=>{
    if(!e.target.closest("[data-del]")) return;
    const id = e.target.closest("[data-id]").dataset.id;
    const snap = JSON.stringify(state.nextMatch.subs);
    state.nextMatch.subs = state.nextMatch.subs.filter(o=>o.id !== id);
    saveState(); renderSubs();
    toast("Wechsel gelöscht", {onUndo:()=>{ state.nextMatch.subs = JSON.parse(snap); saveState(); renderSubs(); }});
  });
}
function matchPlanId(){ return state.nextMatch.planId || state.activePlanId; }
function renderSubs(){
  const xi = planXI(matchPlanId()).map(o=>o.slot.playerId).filter(Boolean);
  const xiSet = new Set(xi);
  const opt = (ids, sel, empty) => `<option value="">${empty}</option>` + ids.map(id=>{
    const p = playerById(id); return p ? `<option value="${id}" ${id===sel?"selected":""}>${p.pos} · ${esc(p.name)}</option>` : "";
  }).join("");
  const bench = state.players.filter(p=>!xiSet.has(p.id) && !UNAVAILABLE.includes(p.status))
    .sort((a,b)=>POS_LIST.indexOf(a.pos)-POS_LIST.indexOf(b.pos)).map(p=>p.id);
  const subs = state.nextMatch.subs;
  qs("#subsEditor").innerHTML = subs.length ? subs.map(x=>`
    <div class="sub-row" data-id="${x.id}">
      <input data-field="minute" value="${esc(x.minute)}" placeholder="60'" aria-label="Minute">
      <select data-field="outId" aria-label="Spieler raus">${opt(xi.concat(x.outId && !xiSet.has(x.outId) ? [x.outId] : []), x.outId, "↓ raus …")}</select>
      <span class="sub-arrow" aria-hidden="true">⇄</span>
      <select data-field="inId" aria-label="Spieler rein">${opt(bench.concat(x.inId && !bench.includes(x.inId) ? [x.inId] : []), x.inId, "↑ rein …")}</select>
      <input data-field="note" value="${esc(x.note)}" placeholder="Auslöser, z. B. bei Rückstand" aria-label="Auslöser">
      <button class="btn-icon-sm del" data-del aria-label="Wechsel löschen">✕</button>
    </div>`).join("")
    : `<p class="empty">Noch keine Wechsel geplant. Plane bis zu 5 Wechsel mit Minute und Auslöser – sie erscheinen im Druck-Briefing.</p>`;
  qs("#btnAddSub").disabled = subs.length >= 5;
}

function renderFixtures(){
  { const vs = qs("#oppVenue"); if(vs){ const cur = state.nextMatch.venue || "H"; vs.innerHTML = options(VENUES, cur); } }
  renderOppHint(); renderOpponentDb();
  const planSel = qs("#oppPlan");
  planSel.innerHTML = `<option value="">Aktiver Plan (${esc(activePlan().name)})</option>` + state.plans.map(pl=>`<option value="${pl.id}">${esc(pl.name)} · ${esc(formationLabel(planBlock(pl.id).formationName, planBlock(pl.id)))}</option>`).join("");
  Object.entries(MATCH_FIELDS).forEach(([id,key])=>{
    const el = qs("#"+id);
    if(document.activeElement !== el) el.value = state.nextMatch[key] || (key === "venue" ? "H" : "");
  });
  renderSubs();
  renderResults();
}

/* ---------- Results log & tactic record ("Taktik-Bilanz") ---------- */
const POINTS = {W:3, D:1, L:0};
const RESULT_LETTER = {W:"S", D:"U", L:"N"};
let resultsFilter = "season";   // "season" | "all" | a season label

const resultOf = r => r.gf > r.ga ? "W" : r.gf < r.ga ? "L" : "D";
/** Newest first; undated (migrated) games keep their original order at the end. */
function sortedResults(){
  return state.results.map((r,i)=>({r,i})).sort((a,b)=>{
    if(a.r.date && b.r.date) return b.r.date.localeCompare(a.r.date) || a.i-b.i;
    if(a.r.date) return -1; if(b.r.date) return 1; return a.i-b.i;
  }).map(o=>o.r);
}
function seasonResults(season){ return sortedResults().filter(r=>!season || r.season === season); }
function planDisplayName(r){
  const pl = state.plans.find(x=>x.id === r.planId);
  const name = pl ? pl.name : (r.planName || "Ohne Plan");
  return r.formation ? `${name} · ${r.formation}` : name;
}
/** Back line of the opponent formation: "3-5-2" → "gegen 3er-Kette". */
function backLineLabel(f){
  const m = /^\s*([345])\s*-/.exec(f || "");
  return m ? `gegen ${m[1]}er-Kette` : "Gegnerformation unbekannt";
}
/** Groups results → [{key,label,n,w,d,l,gf,ga,ppg}], most games first. */
function groupRecord(list, keyFn, labelFn){
  const map = new Map();
  list.forEach(r=>{
    const k = keyFn(r);
    if(!map.has(k)) map.set(k, {key:k, label:labelFn(r), n:0, w:0, d:0, l:0, gf:0, ga:0, pts:0});
    const g = map.get(k), res = resultOf(r);
    g.n++; g.gf += r.gf; g.ga += r.ga; g.pts += POINTS[res];
    if(res === "W") g.w++; else if(res === "D") g.d++; else g.l++;
  });
  return [...map.values()].map(g=>Object.assign(g, {ppg: g.pts/g.n})).sort((a,b)=>b.n-a.n || b.ppg-a.ppg);
}
function recordBadges(g){
  return `<span class="rec-badges"><span class="rb W">${g.w} S</span><span class="rb D">${g.d} U</span><span class="rb L">${g.l} N</span></span>`;
}
function recordTable(title, groups){
  if(!groups.length) return "";
  // highlight the best group only when it rests on at least 3 games (1 game says little)
  const solid = groups.filter(g=>g.n >= 3);
  const best = solid.length ? Math.max(...solid.map(g=>g.ppg)) : null;
  return `<div class="rec-block"><h4>${title}</h4>${groups.map(g=>`
    <div class="rec-line" title="${g.n} Spiele · Tore ${g.gf}:${g.ga}">
      <span class="rec-name">${esc(g.label)}${g.n < 3 ? ` <span class="muted small">(${g.n} Sp.)</span>` : ""}</span>${recordBadges(g)}
      <span class="rec-bar"><span style="width:${Math.round(g.ppg/3*100)}%" class="${best !== null && g.n >= 3 && g.ppg===best && groups.length>1 ? "best" : ""}"></span></span>
      <span class="rec-ppg">${fmtNum(g.ppg,2)}</span>
    </div>`).join("")}</div>`;
}

function renderResults(){
  const seasons = [...new Set(state.results.map(r=>r.season).filter(Boolean))].sort().reverse();
  const sel = qs("#resultsSeason");
  sel.innerHTML = `<option value="season">Diese Saison (${esc(state.club.season)})</option><option value="all">Alle Spiele</option>`
    + seasons.filter(x=>x !== state.club.season).map(x=>`<option value="${esc(x)}">Saison ${esc(x)}</option>`).join("");
  if(![...sel.options].some(o=>o.value === resultsFilter)) resultsFilter = "season";
  sel.value = resultsFilter;
  const list = resultsFilter === "all" ? sortedResults() : seasonResults(resultsFilter === "season" ? state.club.season : resultsFilter);

  qs("#resultsList").innerHTML = list.length ? `<table class="res-table"><thead><tr><th>Datum</th><th>Gegner</th><th></th><th>Ergebnis</th><th>Unser Plan</th><th>Gegner</th><th></th></tr></thead><tbody>
    ${list.map(r=>{ const res = resultOf(r); return `<tr data-id="${r.id}">
      <td class="muted">${r.date ? fmtDate(r.date,{day:"2-digit",month:"2-digit",year:"2-digit"}) : "—"}</td>
      <td><strong>${esc(r.opponent)}</strong>${r.competition ? `<div class="muted small">${esc(r.competition)}</div>` : ""}</td>
      <td><span class="venue-tag">${r.venue === "A" ? "A" : r.venue === "N" ? "N" : "H"}</span></td>
      <td><span class="score ${res}">${r.gf}:${r.ga}</span></td>
      <td>${esc(planDisplayName(r))}</td>
      <td class="muted">${esc(r.oppFormation) || "—"}</td>
      <td><span class="row-actions"><button class="btn-icon-sm" data-edit aria-label="Ergebnis bearbeiten">✎</button><button class="btn-icon-sm del" data-del aria-label="Ergebnis löschen">✕</button></span></td>
    </tr>`; }).join("")}</tbody></table>`
    : `<p class="empty">Keine Spiele in diesem Zeitraum. Trage Ergebnisse mit „+ Ergebnis“ ein – nach einem Spieltag fragt das Dashboard beim Weiterschalten des Datums von selbst.</p>`;

  const withForm = list.filter(r=>r.oppFormation);
  qs("#bilanzBox").innerHTML = list.length ? `
    ${recordTable("Nach unserem Plan", groupRecord(list, r=>(r.planId || "_none")+"|"+r.formation, planDisplayName))}
    ${recordTable("Nach Abwehrlinie des Gegners", groupRecord(withForm, r=>backLineLabel(r.oppFormation), r=>backLineLabel(r.oppFormation)))}
    ${recordTable("Heim / Auswärts", groupRecord(list, r=>r.venue, r=>VENUES[r.venue]))}
    <p class="hint">Zahl rechts = Punkte pro Spiel. Mehr Einträge mit Gegnerformation machen die Bilanz aussagekräftiger.</p>`
    : "";
}

/**
 * Enter or edit a result. New results are prefilled from the match preparation;
 * the tactic plan and our formation are stored as a snapshot.
 */
function openResultModal(existing, opts){
  opts = opts || {};
  const nm = state.nextMatch;
  const r = existing || {date: nm.date || state.club.ingameDate, opponent: nm.opponent, competition: nm.competition,
    venue: nm.venue || "H", gf:"", ga:"", planId: matchPlanId(), oppFormation: nm.formation};
  const fromPrep = !existing && !!nm.opponent;
  const planOpts = state.plans.map(pl=>`<option value="${pl.id}" ${pl.id===r.planId?"selected":""}>${esc(pl.name)} · ${esc(formationLabel(planBlock(pl.id).formationName, planBlock(pl.id)))}</option>`).join("")
    + (existing && r.planId && !state.plans.some(pl=>pl.id===r.planId) ? `<option value="${esc(r.planId)}" selected>${esc(r.planName || "Gelöschter Plan")}</option>` : "")
    + `<option value="" ${!r.planId?"selected":""}>Ohne Plan</option>`;
  openModal({
    title: existing ? "Ergebnis bearbeiten" : "Ergebnis eintragen",
    body: `
      ${opts.lead ? `<p class="lead">${esc(opts.lead)}</p>` : ""}
      <div class="field-row">
        <div class="field" style="flex:2"><label>Gegner</label><input data-f="opponent" value="${esc(r.opponent||"")}"></div>
        <div class="field"><label>Ort</label><select data-f="venue">${options(VENUES, r.venue)}</select></div>
      </div>
      <div class="score-input">
        <input data-f="gf" type="number" min="0" max="99" value="${r.gf}" placeholder="0" aria-label="Unsere Tore">
        <span>:</span>
        <input data-f="ga" type="number" min="0" max="99" value="${r.ga}" placeholder="0" aria-label="Gegentore">
      </div>
      <div class="field-row">
        <div class="field"><label>Unser Taktik-Plan</label><select data-f="planId">${planOpts}</select></div>
        <div class="field"><label>Formation des Gegners</label><input data-f="oppFormation" value="${esc(r.oppFormation||"")}" placeholder="z. B. 3-5-2"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Datum</label><input data-f="date" type="date" value="${esc(r.date||"")}"></div>
        <div class="field"><label>Wettbewerb</label><input data-f="competition" value="${esc(r.competition||"")}"></div>
      </div>
      ${fromPrep ? `<label class="check-label"><input type="checkbox" data-f="clearPrep" checked> Spieltag-Vorbereitung danach für den nächsten Gegner leeren</label>` : ""}`,
    saveLabel: existing ? "Speichern" : "Ergebnis speichern",
    onOpen: m=>{ const gfEl = qs('[data-f="gf"]', m); setTimeout(()=> (r.opponent ? gfEl : qs('[data-f="opponent"]', m)).focus(), 30); },
    onSave: get=>{
      const gfRaw = qs('#modal [data-f="gf"]').value, gaRaw = qs('#modal [data-f="ga"]').value;
      if(gfRaw === "" || gaRaw === ""){ toast("Bitte beide Torzahlen eintragen."); return false; }
      const planId = get("planId");
      const pl = state.plans.find(x=>x.id === planId);
      const block = pl ? planBlock(pl.id) : null;
      const data = {
        opponent: get("opponent").trim() || "Unbekannt", venue: get("venue"),
        gf: clamp(Math.round(num(gfRaw)),0,99), ga: clamp(Math.round(num(gaRaw)),0,99),
        planId, oppFormation: get("oppFormation").trim(),
        date: parseISO(get("date")) ? get("date") : "", competition: get("competition").trim()
      };
      if(existing){
        // keep the original snapshot unless the plan was changed
        if(planId !== existing.planId){ data.planName = pl ? pl.name : ""; data.formation = block ? formationLabel(block.formationName, block) : ""; }
        Object.assign(existing, data);
      } else {
        const snap = JSON.stringify(state);
        // keep the prepared analysis for the next meeting with this opponent
        if(nm.opponent && normName(nm.opponent) === normName(data.opponent)){
          upsertOpponent(data.opponent, {formation: data.oppFormation || nm.formation, keyThreat: nm.keyThreat, weaknesses: nm.weaknesses});
        }
        state.results.push(Object.assign({id:uid(), season: state.club.season,
          planName: pl ? pl.name : "", formation: block ? formationLabel(block.formationName, block) : ""}, data));
        if(get("clearPrep")){
          Object.assign(state.nextMatch, {opponent:"", date:"", formation:"", keyThreat:"", weaknesses:"", subs:[]});
        }
        saveState(); renderFixtures(); renderHome();
        const res = resultOf(data);
        toast(`${({W:"Sieg",D:"Unentschieden",L:"Niederlage"})[res]} ${data.gf}:${data.ga} gegen ${data.opponent} gespeichert`,
          {onUndo:()=>{ state = JSON.parse(snap); saveState(); renderAll(); }});
        return;
      }
      saveState(); renderFixtures(); renderHome(); toast("Ergebnis aktualisiert");
    }
  });
}

function printBriefing(){
  const nm = state.nextMatch, pid = matchPlanId(), block = planBlock(pid);
  const plan = state.plans.find(x=>x.id===pid);
  const f = block.formationName;
  const lineup = planXI(pid).map(({def:d, slot:sl})=>{
    const p = playerById(sl.playerId);
    return `<tr><td>${d.cat}</td><td>${p?esc(p.name):"—"}</td><td>${esc(sl.roleIn)}</td><td>${esc(sl.roleOut)}</td></tr>`;
  }).join("");
  const name = id => { const p = playerById(id); return p ? esc(p.name) : "—"; };
  const sp = SP_TYPES.map(t=>{
    const s = state.setPieces[t.id];
    const zones = t.zones.filter(z=>s.zones[z]).map(z=>`${SP_ZONES[z].label}: ${name(s.zones[z])}`).join(", ");
    return `<tr><td>${t.label}</td><td>${name(s.taker)}</td><td>${zones || "—"}</td></tr>`;
  }).join("");
  const pens = state.penaltyOrder.filter(Boolean).map((id,i)=>`${i+1}. ${name(id)}`).join("   ");
  qs("#printArea").innerHTML = `
    <h1>${esc(state.club.name)} – ${esc(nm.opponent || "Gegner offen")}</h1>
    <div class="pr-meta">${esc(nm.competition)} · ${nm.date ? fmtDate(nm.date) : "Datum offen"} · ${{H:"Heimspiel",A:"Auswärtsspiel",N:"Neutraler Platz"}[nm.venue]} · ${esc(plan.name)} · Formation ${esc(formationLabel(f, block))}</div>
    <div class="pr-cols">
      <div><h2>Aufstellung</h2><table><tr><th>Pos.</th><th>Spieler</th><th>Mit Ball</th><th>Gegen Ball</th></tr>${lineup}</table></div>
      <div>
        <h2>Gegner</h2>
        <p><strong>Erwartete Formation:</strong> ${esc(nm.formation) || "—"}</p>
        <p><strong>Gefährlichster Spieler:</strong> ${esc(nm.keyThreat) || "—"}</p>
        <p><strong>Schwachstellen:</strong>\n${esc(nm.weaknesses) || "—"}</p>
      </div>
    </div>
    <h2>Matchplan</h2><p>${esc(nm.matchplan) || "—"}</p>
    ${nm.subs.length ? `<h2>Wechselplan</h2><table><tr><th>Minute</th><th>Raus</th><th>Rein</th><th>Auslöser</th></tr>${nm.subs.map(x=>`<tr><td>${esc(x.minute)||"—"}</td><td>${name(x.outId)}</td><td>${name(x.inId)}</td><td>${esc(x.note)||"—"}</td></tr>`).join("")}</table>` : ""}
    <h2>Standards</h2><table><tr><th>Situation</th><th>Schütze</th><th>Zuordnung</th></tr>${sp}</table>
    <p style="margin-top:6pt"><strong>Elfmeter:</strong> ${pens || "—"}</p>`;
  window.print();
}

/* ==========================================================================
   NOTES, TODOS, SEASON ARCHIVE
   ========================================================================== */
function initNotes(){
  qs("#btnAddTodo").addEventListener("click", ()=>{
    const t = {id:uid(), text:"", done:false};
    state.todos.unshift(t); saveState(); renderNotes(); renderHome();
    const inp = qs(`#todoList [data-id="${t.id}"] input[type=text]`); if(inp) inp.focus();
  });
  qs("#freeNotes").addEventListener("input", e=>{ state.notes = e.target.value; scheduleSave(); });
  const list = qs("#todoList");
  list.addEventListener("change", e=>{
    const li = e.target.closest("[data-id]"); if(!li) return;
    const t = state.todos.find(x=>x.id===li.dataset.id);
    if(e.target.type === "checkbox"){ t.done = e.target.checked; saveState(); renderNotes(); }
    else { t.text = e.target.value; saveState(); }
    renderHome();
  });
  list.addEventListener("keydown", e=>{
    if(e.key === "Enter" && e.target.type === "text"){ e.preventDefault(); e.target.blur(); }
  });
  list.addEventListener("click", e=>{
    if(!e.target.closest("[data-del]")) return;
    const id = e.target.closest("[data-id]").dataset.id;
    removeWithUndo("todos", id, "Aufgabe", ()=>{ renderNotes(); renderHome(); });
  });
  qs("#btnCloseSeason").addEventListener("click", openCloseSeasonModal);
  qs("#seasonArchive").addEventListener("click", e=>{
    const del = e.target.closest("[data-del-season]"); if(!del) return;
    removeWithUndo("seasons", del.dataset.delSeason, "Saison-Eintrag", renderNotes);
  });
}
function renderNotes(){
  renderSeasonCompare();
  const ta = qs("#freeNotes");
  if(document.activeElement !== ta) ta.value = state.notes;
  const todos = state.todos.slice().sort((a,b)=>a.done-b.done);
  qs("#todoList").innerHTML = todos.map(t=>`
    <li class="todo-item ${t.done?"done":""}" data-id="${t.id}">
      <input type="checkbox" ${t.done?"checked":""} aria-label="Erledigt">
      <input type="text" value="${esc(t.text)}" placeholder="Neue Aufgabe…" aria-label="Aufgabe">
      <button class="btn-icon-sm del" data-del aria-label="Aufgabe löschen">✕</button>
    </li>`).join("") || `<li class="empty">Keine Aufgaben. Mit „+ Aufgabe“ anlegen.</li>`;

  qs("#seasonArchive").innerHTML = state.seasons.length ? `<div class="archive-list">${state.seasons.map(s=>`
    <div class="archive-card">
      <div class="a-head"><span class="a-season">${esc(s.season)}</span><span class="a-pos">${esc(s.position) || "—"}</span></div>
      <div class="a-meta">${s.squadSize} Spieler · Ø ${s.avgAge} Jahre${s.closedAt ? " · abgeschlossen "+fmtDate(s.closedAt,{day:"numeric",month:"short",year:"numeric"}) : ""}</div>
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
      ${s.goals.length ? `<ul>${s.goals.map(g=>`<li>${esc(g.title)} – ${GOAL_STATUS[g.status]}</li>`).join("")}</ul>` : ""}
      <div style="text-align:right"><button class="btn-icon-sm del" data-del-season="${s.id}" aria-label="Eintrag löschen">✕</button></div>
    </div>`).join("")}</div>`
    : `<p class="empty">Noch keine abgeschlossene Saison. Am Saisonende „Saison abschließen“ – Ziele, Platzierung und Fazit bleiben hier erhalten.</p>`;
}
function nextSeasonLabel(s){
  const m = /^(\d{4})\/(\d{2})$/.exec(s);
  if(!m) return s;
  const y = Number(m[1]) + 1;
  return `${y}/${String((y+1)%100).padStart(2,"0")}`;
}
function openCloseSeasonModal(){
  openModal({
    title:`Saison ${state.club.season} abschließen`,
    body:`
      <p class="lead">Speichert Platzierung, Vorstandsziele und dein Fazit im Archiv. Danach wird die neue Saison gestartet: Alter +1, Vorstandsziele und Form zurückgesetzt. Kader, Verträge und Notizen bleiben.</p>
      <div class="field-row">
        <div class="field"><label>Endplatzierung</label><input data-f="position" placeholder="z.B. 4. / Pokalsieger"></div>
        <div class="field"><label>Neue Saison</label><input data-f="next" value="${esc(nextSeasonLabel(state.club.season))}"></div>
      </div>
      <div class="field"><label>Fazit</label><textarea data-f="summary" rows="4" placeholder="Was lief gut, was nicht, was nimmst du mit?"></textarea></div>
      <label class="check-label"><input type="checkbox" data-f="age" checked> Spieler ohne Geburtsdatum, Talente und Leihspieler ein Jahr älter machen</label>
      <p class="hint">Spieler mit Geburtsdatum altern automatisch mit dem Spieldatum.</p>`,
    saveLabel:"Saison abschließen",
    onSave: get=>{
      createRestorePoint(`Vor Saisonabschluss ${state.club.season}`);
      const undo = snapshotUndo(`Saison ${state.club.season} archiviert`, renderAll);
      const avg = state.players.length ? +(state.players.reduce((s,p)=>s+p.age,0)/state.players.length).toFixed(1) : 0;
      const rec = groupRecord(seasonResults(state.club.season), ()=>"all", ()=>"")[0];
      const recText = rec ? `Bilanz: ${rec.w} S · ${rec.d} U · ${rec.l} N, Tore ${rec.gf}:${rec.ga}` : "";
      state.seasons.unshift({id:uid(), season:state.club.season, position:get("position"),
        summary:[get("summary"), recText].filter(Boolean).join("\n"),
        goals: state.boardGoals.map(g=>({title:g.title, status:g.status})), squadSize: state.players.length, avgAge: avg,
        closedAt: state.club.ingameDate, wages: state.players.reduce((a,p)=>a+p.salary,0)});
      state.club.season = get("next") || nextSeasonLabel(state.club.season);
      if(get("age")){ state.players.forEach(p=>{ if(!p.birthDate) p.age++; }); state.prospects.forEach(p=>p.age++); state.loans.forEach(l=>l.age++); }
      state.boardGoals = [];
      // results stay in the log (tagged with their season) – the record just starts fresh for the new season
      saveState(); renderAll(); undo();
    }
  });
}


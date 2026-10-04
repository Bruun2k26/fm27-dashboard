/* ==========================================================================
   KARRIERE-BEGLEITER (11.9 Beta) – a lean companion for careers in OTHER games (EA FC, F1 Manager, …):
   list/squad with free columns, season goals, season history. Global (store key "fm27_career").
   Linked with the game diary: sessions and challenges can belong to a career.
   ========================================================================== */
const CAREER_KEY = "fm27_career";
const CG_STATUS = {open:"Offen", track:"Auf Kurs", done:"Erreicht", miss:"Verfehlt"};
const CR_PRESETS = {
  fussball:{label:"Fußball (EA FC & Co.)", cols:[["Name","text"],["Position","text"],["Alter","number"],["Wertung","number"],["Notiz","text"]]},
  motorsport:{label:"Motorsport (F1 Manager & Co.)", cols:[["Fahrer","text"],["Team","text"],["Punkte","number"],["Siege","number"],["Notiz","text"]]},
  frei:{label:"Frei (nur eine Spalte Name)", cols:[["Name","text"]]}
};
let career = null, crView = {id:"", tab:"list", sort:null};
function sanitizeCareer(raw){
  const r = raw && typeof raw === "object" ? raw : {}, S = v => typeof v === "string" ? v : "", A = v => Array.isArray(v) ? v : [];
  const careers = A(r.careers).filter(c=>c && typeof c === "object" && S(c.name).trim()).map(c=>{
    const cols = A(c.columns).filter(x=>x && S(x.name).trim()).map(x=>({id:S(x.id) || uid(), name:S(x.name).trim().slice(0,30), type:x.type === "number" ? "number" : "text"})).slice(0,12);
    const colIds = new Set(cols.map(x=>x.id));
    const rows = A(c.rows).filter(x=>x && typeof x === "object").map(x=>({id:S(x.id) || uid(), cells:Object.fromEntries(Object.entries(x.cells || {}).filter(([k,v])=>colIds.has(k) && (typeof v === "string" || typeof v === "number")).map(([k,v])=>[k, String(v).slice(0,200)]))})).slice(0,300);
    const seasons = A(c.seasons).filter(x=>x && S(x.label).trim()).map(x=>({id:S(x.id) || uid(), label:S(x.label).trim().slice(0,20), place:S(x.place).slice(0,20),
      w:Math.max(0, Math.round(num(x.w))), d:Math.max(0, Math.round(num(x.d))), l:Math.max(0, Math.round(num(x.l))), titles:S(x.titles).slice(0,200), notes:S(x.notes).slice(0,2000), closed:!!x.closed,
      goals:A(x.goals).filter(g=>g && S(g.text).trim()).map(g=>({id:S(g.id) || uid(), text:S(g.text).trim().slice(0,120), status:CG_STATUS[g.status] ? g.status : "open"})).slice(0,30)}));
    if(!seasons.length) seasons.push({id:uid(), label:"Saison 1", place:"", w:0, d:0, l:0, titles:"", notes:"", closed:false, goals:[]});
    return {id:S(c.id) || uid(), name:S(c.name).trim().slice(0,60), game:S(c.game).trim().slice(0,60), team:S(c.team).trim().slice(0,60),
      accent:/^#[0-9a-fA-F]{6}$/.test(S(c.accent)) ? c.accent : "#2f6fde", crest:(S(c.crest).trim() || S(c.team || c.name).replace(/[^A-Za-zÄÖÜäöü0-9 ]/g,"").split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join("")).toUpperCase().slice(0,4) || "?",
      columns:cols.length ? cols : CR_PRESETS.fussball.cols.map(([name,type])=>({id:uid(), name, type})), rows, seasons,
      createdAt:num(c.createdAt) || Date.now(), updatedAt:num(c.updatedAt) || Date.now()};
  });
  return {v:1, careers};
}
function loadCareer(){ career = sanitizeCareer(readJSON(CAREER_KEY)); return career; }
function saveCareer(){ try{ store.setItem(CAREER_KEY, JSON.stringify(career)); }catch(e){ toast("Karriere-Begleiter konnte nicht gespeichert werden."); } scheduleFolderBackup(); }
function careerUndo(label, fn, keepFocus){
  const before = JSON.stringify(career);
  fn(); const c = career.careers.find(x=>x.id === crView.id); if(c) c.updatedAt = Date.now();
  career = sanitizeCareer(career); saveCareer(); if(!keepFocus) renderHub();
  toast(label, {onUndo:()=>{ career = sanitizeCareer(JSON.parse(before)); saveCareer(); renderHub(); }});
}
const crById = id => career && career.careers.find(c=>c.id === id);
const crCurSeason = c => c.seasons[c.seasons.length - 1];
/** "2025/26" → "Saison 2025/26", but "Saison 1" stays "Saison 1" (was shown as "Saison Saison 1") */
const crSeasonName = label => /^saison\b/i.test(String(label).trim()) ? String(label).trim() : `Saison ${label}`;
const crCrest = (c, cls) => `<span class="sm-crest ${cls || ""}" style="background:${esc(c.accent)};color:${crestText(c.accent)};${crestText(c.accent) === "#fff" ? "" : "text-shadow:none;"}">${esc(c.crest)}</span>`;
/** used by the diary: target "career:<id>" */
function careerTarget(id){ const c = crById(id); return c ? {name:c.name, sub:`${c.game || "Karriere"}${c.team ? " · " + c.team : ""}`, crest:crCrest(c, "xs")} : null; }
/* ---------- dialogs ---------- */
function careerModal(c){
  const isNew = !c; c = c || {name:"", game:"", team:"", accent:"#2f6fde", crest:""};
  const games = [...new Set([...(diary ? diary.games : []), ...career.careers.map(x=>x.game).filter(Boolean)])];
  openModal({title: isNew ? "Neue Karriere" : "Karriere bearbeiten", body:`
    <div class="field"><label>Name der Karriere</label><input data-f="name" maxlength="60" value="${esc(c.name)}" placeholder="z. B. Road to Glory mit Wrexham"></div>
    <div class="field-row"><div class="field"><label>Spiel</label><input data-f="game" list="crGames" maxlength="60" value="${esc(c.game)}" placeholder="z. B. EA SPORTS FC 26"><datalist id="crGames">${games.map(g=>`<option value="${esc(g)}">`).join("")}</datalist></div>
      <div class="field"><label>Team / Verein</label><input data-f="team" maxlength="60" value="${esc(c.team)}" placeholder="z. B. Wrexham AFC"></div></div>
    <div class="field-row"><div class="field"><label>Kürzel</label><input data-f="crest" maxlength="4" value="${esc(c.crest)}" placeholder="automatisch"></div>
      <div class="field"><label>Farbe</label><input type="color" data-f="accent" value="${esc(c.accent)}"></div>
      ${isNew ? `<div class="field"><label>Liste für …</label><select data-f="preset">${Object.entries(CR_PRESETS).map(([k,p])=>`<option value="${k}">${esc(p.label)}</option>`).join("")}</select></div>` : ""}</div>
    ${isNew ? `<div class="field"><label>Erste Saison</label><input data-f="season" maxlength="20" value="${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(2)}"></div>` : ""}`,
    leftButtons: isNew ? "" : `<button class="btn btn-danger-outline" data-cr-del>Löschen</button>`,
    saveLabel: isNew ? "Karriere anlegen" : "Speichern",
    onOpen: m=>{ const del = qs("[data-cr-del]", m); if(del) del.onclick = ()=>{ closeModal(); careerUndo(`Karriere „${c.name}“ gelöscht`, ()=>{ career.careers = career.careers.filter(x=>x.id !== c.id); crView.id = ""; }); }; },
    onSave: get=>{
      const name = get("name").trim(); if(!name){ toast("Bitte die Karriere benennen."); return false; }
      const data = {name, game:get("game").trim(), team:get("team").trim(), crest:get("crest").trim(), accent:get("accent")};
      careerUndo(isNew ? `Karriere „${name}“ angelegt` : "Gespeichert", ()=>{
        if(isNew){ const id = uid(), p = CR_PRESETS[get("preset")] || CR_PRESETS.fussball;
          career.careers.push(Object.assign({id, columns:p.cols.map(([n,t])=>({id:uid(), name:n, type:t})), rows:[], seasons:[{id:uid(), label:get("season").trim() || "Saison 1", goals:[]}], createdAt:Date.now()}, data));
          crView = {id, tab:"list", sort:null}; }
        else Object.assign(crById(c.id), data);
      });
    }});
}
function crColumnsModal(c){
  openModal({title:"Spalten der Liste", body:`
    <p class="hint" style="margin-top:0">Eine Spalte pro Zeile. Mit „#“ am Ende wird sie als Zahl sortiert, z. B. <code>Punkte #</code>. Entfernte Spalten verlieren ihre Einträge.</p>
    <textarea data-f="cols" rows="8" style="width:100%">${esc(c.columns.map(x=>x.name + (x.type === "number" ? " #" : "")).join("\n"))}</textarea>`,
    saveLabel:"Übernehmen",
    onSave: get=>{
      const lines = get("cols").split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0,12);
      if(!lines.length){ toast("Mindestens eine Spalte."); return false; }
      careerUndo("Spalten geändert", ()=>{ const cc = crById(c.id), old = cc.columns;
        cc.columns = lines.map(l=>{ const isNum = /#$/.test(l), name = l.replace(/\s*#$/, "").trim(), ex = old.find(o=>o.name === name); return {id:ex ? ex.id : uid(), name, type:isNum ? "number" : "text"}; }); });
    }});
}
function crSeasonModal(c, s){
  openModal({title:esc(crSeasonName(s.label)), body:`
    <div class="field-row"><div class="field"><label>Saison</label><input data-f="label" maxlength="20" value="${esc(s.label)}"></div><div class="field"><label>Platz / Ergebnis</label><input data-f="place" maxlength="20" value="${esc(s.place)}" placeholder="z. B. 3. Platz"></div></div>
    <div class="field-row"><div class="field"><label>Siege</label><input type="number" min="0" data-f="w" value="${s.w}"></div><div class="field"><label>Unentschieden</label><input type="number" min="0" data-f="d" value="${s.d}"></div><div class="field"><label>Niederlagen</label><input type="number" min="0" data-f="l" value="${s.l}"></div></div>
    <div class="field"><label>Titel / Höhepunkte</label><input data-f="titles" maxlength="200" value="${esc(s.titles)}" placeholder="z. B. FA Cup, Aufstieg"></div>
    <div class="field"><label>Notizen</label><textarea data-f="notes" rows="3">${esc(s.notes)}</textarea></div>`,
    leftButtons: c.seasons.length > 1 ? `<button class="btn btn-danger-outline" data-cs-del>Saison löschen</button>` : "",
    onOpen: m=>{ const del = qs("[data-cs-del]", m); if(del) del.onclick = ()=>{ closeModal(); careerUndo(`Saison ${s.label} gelöscht`, ()=>{ const cc = crById(c.id); cc.seasons = cc.seasons.filter(x=>x.id !== s.id); }); }; },
    onSave: get=>{ careerUndo("Saison gespeichert", ()=>{ Object.assign(crById(c.id).seasons.find(x=>x.id === s.id), {label:get("label"), place:get("place"), w:num(get("w")), d:num(get("d")), l:num(get("l")), titles:get("titles"), notes:get("notes")}); }); }});
}
function crNextSeason(c){
  const cur = crCurSeason(c), m = /^(\d{4})(\/(\d{2,4}))?$/.exec(cur.label.trim());
  const next = m ? (m[2] ? `${+m[1] + 1}/${String(+m[1] + 2).slice(m[3].length === 2 ? 2 : 0)}` : String(+m[1] + 1)) : `Saison ${c.seasons.length + 1}`;
  openModal({title:"Saison abschließen", body:`<p class="lead" style="margin-top:0">Schließt <strong>${esc(cur.label)}</strong> ab und startet <strong>${esc(next)}</strong>. Die Liste bleibt, die Ziele beginnen neu. Offene Ziele werden als „verfehlt“ archiviert.</p>
    <div class="field"><label>Neue Saison</label><input data-f="label" maxlength="20" value="${esc(next)}"></div>`,
    saveLabel:"Saison abschließen",
    onSave: get=>{ careerUndo(`Neue Saison ${get("label")}`, ()=>{ const cc = crById(c.id), s = crCurSeason(cc); s.closed = true; s.goals.forEach(g=>{ if(g.status === "open" || g.status === "track") g.status = "miss"; });
      cc.seasons.push({id:uid(), label:get("label").trim() || next, goals:[]}); }); }});
}
/* ---------- pages ---------- */
function renderCareer(root){
  if(!career) loadCareer();
  const c = crById(crView.id);
  if(!c){ crView.id = ""; return renderCareerList(root); }
  const s = crCurSeason(c), rows = c.rows.slice();
  if(crView.sort){ const col = c.columns.find(x=>x.id === crView.sort.col); if(col){ const dir = crView.sort.dir;
    rows.sort((a,b)=>{ const x = a.cells[col.id] || "", y = b.cells[col.id] || ""; return dir * (col.type === "number" ? (num(x) - num(y)) : x.localeCompare(y, "de", {numeric:true})); }); } }
  const sessions = diary ? diary.sessions.filter(x=>x.careerId === c.id).slice(0,5) : [];
  const tabs = [["list","Liste"],["goals",`Ziele ${esc(s.label)}`],["seasons","Saisonverlauf"]];
  const gCount = k => s.goals.filter(g=>g.status === k).length;
  root.innerHTML = `<main class="hub-main hub2 career-page" style="--hero-accent:${esc(c.accent)}">
    <header class="hub2-head"><div><button class="btn btn-sm" data-cr="back" title="Zur Übersicht (Esc)">← Karrieren</button>
      <div class="cr-title">${crCrest(c, "xl")}<div><h1>${esc(c.name)}</h1><p class="muted">${esc([c.game, c.team, crSeasonName(s.label)].filter(Boolean).join(" · "))}</p></div></div></div>
      <div class="diary-actions"><button class="btn btn-accent" data-cr="session">▶ Session starten</button><button class="btn" data-cr="edit">Bearbeiten</button></div></header>
    <div class="seg cr-tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${crView.tab === k}" class="${crView.tab === k ? "active" : ""}" data-cr-tab="${k}">${l}</button>`).join("")}</div>
    <div class="diary-grid">
      <section class="hub2-card">${crView.tab === "goals" ? `
          <div class="hub2-card-head"><h3>Ziele ${esc(s.label)}</h3><span class="muted small">${gCount("done")} erreicht · ${gCount("track")} auf Kurs · ${gCount("open")} offen</span></div>
          ${s.goals.map(g=>`<div class="cr-goal s-${g.status}"><input class="cr-goal-text" data-cr-goal="${g.id}" value="${esc(g.text)}" aria-label="Ziel"><select data-cr-gstatus="${g.id}" aria-label="Status">${options(CG_STATUS, g.status)}</select><button class="btn-icon-sm del" data-cr-gdel="${g.id}" aria-label="Ziel löschen">✕</button></div>`).join("") || '<p class="muted">Noch keine Ziele für diese Saison.</p>'}
          <div class="cr-add"><input id="crNewGoal" maxlength="120" placeholder="Neues Ziel, z. B. Aufstieg in die Premier League" aria-label="Neues Ziel"><button class="btn btn-sm btn-accent" data-cr="addGoal">+ Ziel</button></div>`
        : crView.tab === "seasons" ? `
          <div class="hub2-card-head"><h3>Saisonverlauf</h3><button class="btn btn-sm" data-cr="nextSeason">Saison abschließen →</button></div>
          <div class="table-wrap"><table class="data-table cr-seasons"><thead><tr><th>Saison</th><th>Platz</th><th class="num">S-U-N</th><th>Titel / Höhepunkte</th><th>Ziele</th></tr></thead>
          <tbody>${c.seasons.slice().reverse().map(x=>`<tr data-cr-season="${x.id}" tabindex="0"><td><strong>${esc(x.label)}</strong>${x.closed ? "" : ' <span class="sm-badge ok">läuft</span>'}</td><td>${esc(x.place || "–")}</td><td class="num">${x.w}-${x.d}-${x.l}</td><td>${esc(x.titles || "–")}</td><td>${x.goals.length ? `${x.goals.filter(g=>g.status === "done").length} / ${x.goals.length}` : "–"}</td></tr>`).join("")}</tbody></table></div>`
        : `
          <div class="hub2-card-head"><h3>Liste <span class="muted small">${c.rows.length} Einträge</span></h3><button class="btn btn-sm" data-cr="cols">Spalten …</button></div>
          <div class="table-wrap"><table class="data-table cr-table"><thead><tr>${c.columns.map(col=>`<th class="${col.type === "number" ? "num" : ""}"><button class="cr-sort" data-cr-sort="${col.id}">${esc(col.name)}${crView.sort && crView.sort.col === col.id ? (crView.sort.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}<th></th></tr></thead>
          <tbody>${rows.map(r=>`<tr>${c.columns.map(col=>`<td class="${col.type === "number" ? "num" : ""}"><input class="cr-cell" ${col.type === "number" ? 'inputmode="decimal"' : ""} data-cr-cell="${r.id}:${col.id}" value="${esc(r.cells[col.id] || "")}" aria-label="${esc(col.name)}"></td>`).join("")}<td><button class="btn-icon-sm del" data-cr-rdel="${r.id}" aria-label="Zeile löschen">✕</button></td></tr>`).join("")}</tbody></table></div>
          <div class="cr-add"><button class="btn btn-sm btn-accent" data-cr="addRow">+ Zeile</button><span class="muted small">Änderungen werden sofort gespeichert.</span></div>`}
      </section>
      <aside class="diary-side">
        <section class="hub2-card"><div class="hub2-card-head"><h3>${esc(crSeasonName(s.label))}</h3></div>
          <div class="diary-week"><div><span>Bilanz</span><strong>${s.w}-${s.d}-${s.l}</strong></div><div><span>Ziele erreicht</span><strong>${gCount("done")} / ${s.goals.length}</strong></div></div>
          <button class="btn btn-sm" data-cr-season="${s.id}">Saison bearbeiten</button></section>
        <section class="hub2-card"><div class="hub2-card-head"><h3>Letzte Sessions</h3><span class="muted small">aus dem Tagebuch</span></div>
          ${sessions.length ? sessions.map(x=>`<div class="cr-session"><span class="muted small">${esc(dDayLabel(x.start))} · ${dMin(x.minutes)}</span><strong>${J_MOODS[x.mood] || ""} ${esc(x.title || "Session")}</strong></div>`).join("")
            : '<p class="muted small" style="margin:0">Noch keine Sessions. Mit „▶ Session starten“ läuft der Timer für diese Karriere.</p>'}</section>
      </aside>
    </div></main>`;
}
function renderCareerList(root){
  root.innerHTML = `<main class="hub-main hub2 career-page">
    <header class="hub2-head"><div><button class="btn btn-sm" data-hub="home" title="Zurück zum Hub (Esc)">← Hub</button>
      <h1>🏆 Karriere-Begleiter</h1><p class="muted">Für Karrieren in anderen Spielen – Liste, Saisonziele und Verlauf. Dein FM-Spielstand bleibt im FM27 Dashboard.</p></div>
      <div class="diary-actions"><button class="btn btn-accent" data-cr="new">+ Neue Karriere</button></div></header>
    ${career.careers.length ? `<div class="cr-grid">${career.careers.slice().sort((a,b)=>b.updatedAt - a.updatedAt).map(c=>{ const s = crCurSeason(c), done = s.goals.filter(g=>g.status === "done").length;
      return `<article class="hub2-card hub2-click cr-card" data-cr-open="${c.id}" role="button" tabindex="0" style="--hero-accent:${esc(c.accent)}" aria-label="${esc(c.name)} öffnen">
        <div class="cr-card-top">${crCrest(c, "xl")}<div><strong>${esc(c.name)}</strong><span class="muted small">${esc([c.game, c.team].filter(Boolean).join(" · ") || "–")}</span></div></div>
        <div class="diary-week"><div><span>Saison</span><strong>${esc(s.label)}</strong></div><div><span>Ziele</span><strong>${done} / ${s.goals.length}</strong></div></div>
        <span class="hub2-mod-meta">${c.rows.length} in der Liste · ${c.seasons.length} Saison${c.seasons.length === 1 ? "" : "s"} · ${esc(hubWhen(c.updatedAt))}</span></article>`; }).join("")}</div>`
      : `<div class="diary-empty"><p><strong>Noch keine Karriere.</strong></p><p class="muted">Lege eine Karriere aus einem anderen Spiel an – z. B. deine EA-FC-Karriere oder eine F1-Manager-Saison.</p><button class="btn btn-accent" data-cr="new">+ Neue Karriere</button></div>`}
  </main>`;
}
function careerClick(e){
  const t = e.target, g = sel => t.closest(sel), c = crById(crView.id);
  const op = g("[data-cr-open]"); if(op){ crView = {id:op.dataset.crOpen, tab:"list", sort:null}; renderHub(); return true; }
  const a = g("[data-cr]"); if(a){ const k = a.dataset.cr;
    if(k === "new") careerModal(null);
    else if(k === "back"){ crView.id = ""; renderHub(); }
    else if(k === "edit") careerModal(c);
    else if(k === "cols") crColumnsModal(c);
    else if(k === "nextSeason") crNextSeason(c);
    else if(k === "session"){ if(!diary) loadDiary(); if(diary.running) toast("Es läuft schon eine Session – im Tagebuch beenden."); else { startSession({slotId:"", game:c.game, careerId:c.id}, ""); showHub("diary"); } }
    else if(k === "addRow") careerUndo("Zeile hinzugefügt", ()=>{ crById(c.id).rows.push({id:uid(), cells:{}}); });
    else if(k === "addGoal"){ const inp = qs("#crNewGoal"), text = inp ? inp.value.trim() : ""; if(!text){ if(inp) inp.focus(); return true; }
      careerUndo("Ziel hinzugefügt", ()=>{ crCurSeason(crById(c.id)).goals.push({id:uid(), text, status:"open"}); }); setTimeout(()=>{ const n = qs("#crNewGoal"); if(n) n.focus(); }, 0); }
    return true; }
  const tb = g("[data-cr-tab]"); if(tb){ crView.tab = tb.dataset.crTab; renderHub(); return true; }
  const so = g("[data-cr-sort]"); if(so){ const col = so.dataset.crSort; crView.sort = crView.sort && crView.sort.col === col ? (crView.sort.dir > 0 ? {col, dir:-1} : null) : {col, dir:1}; renderHub(); return true; }
  const rd = g("[data-cr-rdel]"); if(rd){ careerUndo("Zeile gelöscht", ()=>{ const cc = crById(c.id); cc.rows = cc.rows.filter(r=>r.id !== rd.dataset.crRdel); }); return true; }
  const gd = g("[data-cr-gdel]"); if(gd){ careerUndo("Ziel gelöscht", ()=>{ const s = crCurSeason(crById(c.id)); s.goals = s.goals.filter(x=>x.id !== gd.dataset.crGdel); }); return true; }
  const se = g("[data-cr-season]"); if(se){ crSeasonModal(c, c.seasons.find(x=>x.id === se.dataset.crSeason)); return true; }
  return false;
}
/** inline edits: saved on change, without re-rendering (the cursor stays where it is) */
function careerChange(e){
  const t = e.target, c = crById(crView.id); if(!c) return;
  if(t.matches("[data-cr-cell]")){ const [rid, cid] = t.dataset.crCell.split(":"), row = c.rows.find(r=>r.id === rid); if(!row) return;
    row.cells[cid] = t.value.trim(); c.updatedAt = Date.now(); saveCareer(); return; }
  if(t.matches("[data-cr-goal]")){ const gl = crCurSeason(c).goals.find(x=>x.id === t.dataset.crGoal); if(gl && t.value.trim()){ gl.text = t.value.trim(); c.updatedAt = Date.now(); saveCareer(); } return; }
  if(t.matches("[data-cr-gstatus]")){ careerUndo(`Ziel: ${CG_STATUS[t.value]}`, ()=>{ crCurSeason(crById(c.id)).goals.find(x=>x.id === t.dataset.crGstatus).status = t.value; }); }
}
function careerTileMeta(){
  if(!career) loadCareer();
  const n = career.careers.length; if(!n) return "Noch keine Karriere – jetzt anlegen";
  const last = career.careers.slice().sort((a,b)=>b.updatedAt - a.updatedAt)[0];
  return `${n} Karriere${n === 1 ? "" : "n"} · zuletzt: ${esc(last.name)}`;
}

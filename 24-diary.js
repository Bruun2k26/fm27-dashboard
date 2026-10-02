/* ==========================================================================
   SPIEL-TAGEBUCH (11.8 Beta) – sessions (with a timer that survives reloads), challenges, week overview.
   Global for all saves (store key "fm27_diary"). Linked with the Journey: journey diary entries of all
   saves show up here, and a session can be copied into the journey diary of its save.
   Sessions use REAL time; journey entries use the in-game date – so they are shown separately.
   ========================================================================== */
const DIARY_KEY = "fm27_diary";
const CH_KIND = {simple:"Einfaches Ziel", count:"Mit Zähler", steps:"Mit Teilschritten"};
let diary = null, diaryTimer = null;
function sanitizeDiary(raw){
  const r = raw && typeof raw === "object" ? raw : {}, S = v => typeof v === "string" ? v : "", A = v => Array.isArray(v) ? v : [];
  const moods = typeof J_MOODS === "object" ? J_MOODS : {};
  const sessions = A(r.sessions).filter(x=>x && typeof x === "object").map(x=>({id:S(x.id) || uid(), start:num(x.start), end:num(x.end), minutes:Math.max(0, Math.round(num(x.minutes))),
    slotId:S(x.slotId), game:S(x.game).slice(0,60), label:S(x.label).slice(0,80), title:S(x.title).slice(0,120), text:S(x.text).slice(0,4000), mood:moods[x.mood] ? x.mood : "good",
    journeyId:S(x.journeyId)})).filter(x=>x.start).sort((a,b)=>b.start - a.start).slice(0,2000);
  const challenges = A(r.challenges).filter(x=>x && typeof x === "object" && S(x.title).trim()).map(x=>({id:S(x.id) || uid(), title:S(x.title).trim().slice(0,120), desc:S(x.desc).slice(0,1000),
    slotId:S(x.slotId), game:S(x.game).slice(0,60), label:S(x.label).slice(0,80), kind:CH_KIND[x.kind] ? x.kind : "simple", target:Math.max(1, Math.round(num(x.target) || 1)),
    current:Math.max(0, Math.round(num(x.current))), steps:A(x.steps).filter(st=>st && S(st.text).trim()).map(st=>({id:S(st.id) || uid(), text:S(st.text).trim().slice(0,120), done:!!st.done})).slice(0,30),
    status:["active","done","dropped"].includes(x.status) ? x.status : "active", createdAt:num(x.createdAt) || Date.now(), doneAt:num(x.doneAt)}));
  const run = r.running && typeof r.running === "object" && num(r.running.start) ? {start:num(r.running.start), slotId:S(r.running.slotId), game:S(r.running.game).slice(0,60)} : null;
  return {v:1, sessions, challenges, running:run, games:[...new Set(A(r.games).map(g=>S(g).trim()).filter(Boolean))].slice(0,40)};
}
function loadDiary(){ diary = sanitizeDiary(readJSON(DIARY_KEY)); return diary; }
function saveDiary(){ try{ store.setItem(DIARY_KEY, JSON.stringify(diary)); }catch(e){ toast("Tagebuch konnte nicht gespeichert werden."); } }
function diaryUndo(label, fn){
  const before = JSON.stringify(diary);
  fn(); diary = sanitizeDiary(diary); saveDiary(); renderHub();
  toast(label, {onUndo:()=>{ diary = sanitizeDiary(JSON.parse(before)); saveDiary(); renderHub(); }});
}
/* ---------- helpers ---------- */
const dMin = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} Std.${r ? ` ${r} Min.` : ""}` : `${r} Min.`; };
const dClock = ms => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; };
const dDay = ts => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
function dDayLabel(ts){
  const t = dDay(Date.now()), d = dDay(ts), diff = Math.round((t - d) / 86400000);
  if(diff === 0) return "Heute"; if(diff === 1) return "Gestern";
  return new Date(ts).toLocaleDateString("de-DE", {weekday:"long", day:"2-digit", month:"2-digit", year: new Date(ts).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined});
}
/** what an entry belongs to: a save of this dashboard (with crest) or another game (free name) */
function dTarget(x){
  if(x.slotId){ const s = slotSummaries().find(y=>y.id === x.slotId); if(s) return {name:s.name, sub:s.club, crest:smCrest(s, "xs"), slot:s};
    return {name:x.label || "Gelöschter Spielstand", sub:"nicht mehr vorhanden", crest:'<span class="sm-crest xs" style="background:var(--bg-750)">?</span>'}; }
  const g = x.game || "Ohne Zuordnung";
  return {name:g, sub:"anderes Spiel", crest:`<span class="sm-crest xs d-game" style="background:hsl(${[...g].reduce((a,c)=>(a * 31 + c.charCodeAt(0)) % 360, 7)} 45% 32%)">${esc(g.replace(/[^A-Za-zÄÖÜäöü0-9 ]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase() || "?")}</span>`};
}
function dTargetOptions(sel){
  const sums = slotSummaries();
  return `<optgroup label="Spielstände">${sums.map(s=>`<option value="slot:${s.id}" ${sel === "slot:" + s.id ? "selected" : ""}>${esc(s.name)} · ${esc(s.club)}</option>`).join("")}</optgroup>
    ${diary.games.length ? `<optgroup label="Andere Spiele">${diary.games.map(g=>`<option value="game:${esc(g)}" ${sel === "game:" + g ? "selected" : ""}>${esc(g)}</option>`).join("")}</optgroup>` : ""}
    <option value="new" ${sel === "new" ? "selected" : ""}>+ Anderes Spiel …</option>`;
}
function dReadTarget(m){
  const v = qs('[data-f="target"]', m).value;
  if(v.startsWith("slot:")){ const id = v.slice(5); return {slotId:id, game:"", label:(slotIndex.slots.find(s=>s.id === id) || {}).name || ""}; }
  if(v.startsWith("game:")) return {slotId:"", game:v.slice(5), label:v.slice(5)};
  const g = qs('[data-f="newGame"]', m).value.trim(); return {slotId:"", game:g, label:g};
}
const dTargetKey = x => x.slotId ? "slot:" + x.slotId : x.game ? "game:" + x.game : "slot:" + slotIndex.active;
function dWeek(){
  const now = new Date(), mon = new Date(now); mon.setHours(0,0,0,0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const list = diary.sessions.filter(s=>s.start >= mon.getTime()), by = {};
  list.forEach(s=>{ const k = dTargetKey(s); by[k] = by[k] || {x:s, min:0}; by[k].min += s.minutes; });
  let streak = 0; const days = new Set(diary.sessions.map(s=>dDay(s.start)));
  for(let d = dDay(Date.now()); days.has(d) || (streak === 0 && days.has(d - 86400000)); d -= 86400000){ if(days.has(d)) streak++; else if(streak === 0) continue; }
  return {min:list.reduce((a,s)=>a + s.minutes, 0), n:list.length, by:Object.values(by).sort((a,b)=>b.min - a.min), streak};
}
/* ---------- sessions ---------- */
function startSession(){
  if(diary.running) return;
  diaryUndo("Session gestartet – der Timer läuft auch, wenn du das Dashboard schließt", ()=>{ diary.running = {start:Date.now(), slotId:slotIndex.active, game:""}; });
}
function sessionModal(s, fromRun){
  const isNew = !s.id, end = fromRun ? Date.now() : (s.end || s.start + s.minutes * 60000);
  const minutes = fromRun ? Math.max(1, Math.round((end - s.start) / 60000)) : s.minutes;
  const startLocal = new Date(s.start - new Date(s.start).getTimezoneOffset() * 60000).toISOString().slice(0,16);
  openModal({title: fromRun ? "Session beenden" : isNew ? "Session nachtragen" : "Session bearbeiten", wide:true, body:`
    <div class="field-row"><div class="field" style="flex:2"><label>Spielstand / Spiel</label><select data-f="target">${dTargetOptions(dTargetKey(s))}</select></div>
      <div class="field" style="flex:2" id="dNewGameWrap" hidden><label>Name des Spiels</label><input data-f="newGame" maxlength="60" placeholder="z. B. EA SPORTS FC 26"></div></div>
    <div class="field-row"><div class="field"><label>Beginn</label><input type="datetime-local" data-f="start" value="${startLocal}"></div>
      <div class="field"><label>Dauer (Minuten)</label><input type="number" min="1" data-f="minutes" value="${minutes || 60}"></div>
      <div class="field"><label>Stimmung</label><select data-f="mood">${options(Object.fromEntries(Object.entries(J_MOODS)), s.mood || "good")}</select></div></div>
    <div class="field"><label>Was ist passiert?</label><input data-f="title" maxlength="120" value="${esc(s.title || "")}" placeholder="z. B. Pokal-Aus gegen Bayern, Winter-Transfers fix"></div>
    <div class="field"><label>Notizen (optional)</label><textarea data-f="text" rows="4">${esc(s.text || "")}</textarea></div>
    <label class="check-label" id="dJourneyWrap" hidden><input type="checkbox" data-f="toJourney"> Auch ins Journey-Tagebuch dieses Spielstands übernehmen (mit dem Spieldatum)</label>`,
    leftButtons: fromRun ? `<button class="btn btn-danger-outline" data-d-discard>Verwerfen</button>` : isNew ? "" : `<button class="btn btn-danger-outline" data-d-del>Löschen</button>`,
    saveLabel: fromRun ? "Session speichern" : "Speichern",
    onOpen: m=>{
      const upd = () => { const v = qs('[data-f="target"]', m).value; qs("#dNewGameWrap", m).hidden = v !== "new";
        const j = v.startsWith("slot:") && !s.journeyId && dJourneyOf(v.slice(5)); qs("#dJourneyWrap", m).hidden = !j; };
      qs('[data-f="target"]', m).addEventListener("change", upd); upd();
      const dis = qs("[data-d-discard]", m); if(dis) dis.onclick = ()=>{ closeModal(); diaryUndo("Session verworfen", ()=>{ diary.running = null; }); };
      const del = qs("[data-d-del]", m); if(del) del.onclick = ()=>{ closeModal(); diaryUndo("Session gelöscht", ()=>{ diary.sessions = diary.sessions.filter(x=>x.id !== s.id); }); };
    },
    onSave: get=>{
      const t = dReadTarget(qs("#modal")); if(!t.slotId && !t.game){ toast("Bitte ein Spiel angeben."); return false; }
      const st = new Date(get("start")).getTime() || s.start, mins = Math.max(1, Math.round(num(get("minutes")))), data = Object.assign({start:st, end:st + mins * 60000, minutes:mins,
        title:get("title").trim(), text:get("text"), mood:get("mood")}, t);
      const toJ = get("toJourney") && t.slotId && dJourneyOf(t.slotId);
      diaryUndo(fromRun ? `Session gespeichert · ${dMin(mins)}` : "Session gespeichert", ()=>{
        if(t.game && !diary.games.includes(t.game)) diary.games.unshift(t.game);
        let target = isNew ? Object.assign({id:uid()}, data) : Object.assign(diary.sessions.find(x=>x.id === s.id), data);
        if(isNew) diary.sessions.push(target);
        if(fromRun) diary.running = null;
        if(toJ) target.journeyId = dWriteJourney(t.slotId, {title:data.title || "Session", text:data.text, mood:data.mood});
      });
    }});
}
/* ---------- journey link ---------- */
function dJourneyOf(slotId){
  const data = slotId === slotIndex.active ? state : readJSON(SLOT_PREFIX + slotId);
  return data && data.journey && data.journey.active ? data : null;
}
/** writes an entry into the journey diary of a save (active one or not) – dated with its in-game date */
function dWriteJourney(slotId, e){
  const id = uid(), entry = {id, title:e.title, mood:e.mood, text:e.text};
  if(slotId === slotIndex.active){ journey.diary.push(Object.assign({date:state.club.ingameDate}, entry)); saveState(); }
  else { const data = readJSON(SLOT_PREFIX + slotId); if(!data || !data.journey) return ""; data.journey.diary.push(Object.assign({date:data.club.ingameDate}, entry)); store.setItem(SLOT_PREFIX + slotId, JSON.stringify(data)); }
  return id;
}
function dJourneyFeed(limit){
  const out = [];
  slotIndex.slots.forEach(m=>{ const data = m.id === slotIndex.active ? state : readJSON(SLOT_PREFIX + m.id);
    if(data && data.journey && data.journey.active) (data.journey.diary || []).forEach(e=>out.push({e, slot:m})); });
  return out.sort((a,b)=>(b.e.date || "").localeCompare(a.e.date || "")).slice(0, limit || 5);
}
/* ---------- challenges ---------- */
const chProgress = c => c.kind === "count" ? Math.min(1, c.current / c.target) : c.kind === "steps" ? (c.steps.length ? c.steps.filter(s=>s.done).length / c.steps.length : 0) : (c.status === "done" ? 1 : 0);
function chCheckDone(c){ if(c.status === "active" && c.kind !== "simple" && chProgress(c) >= 1){ c.status = "done"; c.doneAt = Date.now(); return true; } return false; }
function challengeModal(c){
  const isNew = !c; c = c || {title:"", desc:"", kind:"simple", target:10, current:0, steps:[], slotId:slotIndex.active, game:""};
  openModal({title: isNew ? "Neue Challenge" : "Challenge bearbeiten", wide:true, body:`
    <div class="field"><label>Challenge</label><input data-f="title" maxlength="120" value="${esc(c.title)}" placeholder="z. B. Mit Schweinfurt die Champions League gewinnen"></div>
    <div class="field-row"><div class="field" style="flex:2"><label>Spielstand / Spiel</label><select data-f="target">${dTargetOptions(dTargetKey(c))}</select></div>
      <div class="field" style="flex:2" id="dNewGameWrap" hidden><label>Name des Spiels</label><input data-f="newGame" maxlength="60"></div>
      <div class="field"><label>Art</label><select data-f="kind">${options(CH_KIND, c.kind)}</select></div></div>
    <div class="field-row" id="dCountWrap"><div class="field"><label>Ziel (Anzahl)</label><input type="number" min="1" data-f="goal" value="${c.target}"></div><div class="field"><label>Stand</label><input type="number" min="0" data-f="current" value="${c.current}"></div></div>
    <div class="field" id="dStepsWrap"><label>Teilschritte (eine Zeile pro Schritt)</label><textarea data-f="steps" rows="4" placeholder="Aufstieg in Liga 2&#10;Aufstieg in die Bundesliga&#10;Europapokal&#10;Champions League gewinnen">${esc(c.steps.map(s=>s.text).join("\n"))}</textarea></div>
    <div class="field"><label>Regeln / Notizen (optional)</label><textarea data-f="desc" rows="2">${esc(c.desc)}</textarea></div>`,
    leftButtons: isNew ? "" : `<button class="btn btn-danger-outline" data-d-del>Löschen</button>${c.status === "active" ? `<button class="btn" data-d-drop>Abbrechen</button>` : `<button class="btn" data-d-reopen>Wieder aufnehmen</button>`}`,
    saveLabel: isNew ? "Challenge anlegen" : "Speichern",
    onOpen: m=>{
      const upd = () => { const k = qs('[data-f="kind"]', m).value; qs("#dCountWrap", m).hidden = k !== "count"; qs("#dStepsWrap", m).hidden = k !== "steps";
        qs("#dNewGameWrap", m).hidden = qs('[data-f="target"]', m).value !== "new"; };
      m.addEventListener("change", upd); upd();
      const b = (sel, fn) => { const el = qs(sel, m); if(el) el.onclick = ()=>{ closeModal(); fn(); }; };
      b("[data-d-del]", ()=>diaryUndo("Challenge gelöscht", ()=>{ diary.challenges = diary.challenges.filter(x=>x.id !== c.id); }));
      b("[data-d-drop]", ()=>diaryUndo("Challenge abgebrochen", ()=>{ const x = diary.challenges.find(y=>y.id === c.id); x.status = "dropped"; x.doneAt = Date.now(); }));
      b("[data-d-reopen]", ()=>diaryUndo("Challenge wieder aktiv", ()=>{ const x = diary.challenges.find(y=>y.id === c.id); x.status = "active"; x.doneAt = 0; }));
    },
    onSave: get=>{
      const title = get("title").trim(); if(!title){ toast("Bitte die Challenge benennen."); return false; }
      const t = dReadTarget(qs("#modal")), oldSteps = c.steps || [];
      const steps = get("steps").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(text=>({id:(oldSteps.find(s=>s.text === text) || {}).id || uid(), text, done:!!(oldSteps.find(s=>s.text === text) || {}).done}));
      const data = Object.assign({title, desc:get("desc"), kind:get("kind"), target:num(get("goal")) || 1, current:num(get("current")), steps}, t);
      diaryUndo(isNew ? "Challenge angelegt" : "Challenge gespeichert", ()=>{
        if(t.game && !diary.games.includes(t.game)) diary.games.unshift(t.game);
        const x = isNew ? Object.assign({id:uid(), status:"active", createdAt:Date.now()}, data) : Object.assign(diary.challenges.find(y=>y.id === c.id), data);
        if(isNew) diary.challenges.push(x);
        chCheckDone(x);
      });
    }});
}
/* ---------- page ---------- */
function renderDiary(root){
  if(!diary) loadDiary();
  const run = diary.running, wk = dWeek(), active = diary.challenges.filter(c=>c.status === "active"), doneList = diary.challenges.filter(c=>c.status === "done");
  const events = diary.sessions.map(s=>({ts:s.start, s})).concat(doneList.map(c=>({ts:c.doneAt, c}))).sort((a,b)=>b.ts - a.ts).slice(0, 80);
  const days = []; events.forEach(ev=>{ const k = dDay(ev.ts); let d = days.find(x=>x.k === k); if(!d){ d = {k, list:[], min:0}; days.push(d); } d.list.push(ev); if(ev.s) d.min += ev.s.minutes; });
  const feed = dJourneyFeed(5), maxMin = Math.max(1, ...wk.by.map(b=>b.min));
  root.innerHTML = `<main class="hub-main hub2 diary-page">
    <header class="hub2-head"><div><button class="btn btn-sm" data-hub="home" title="Zurück zum Hub (Esc)">← Hub</button>
      <h1>📓 Spiel-Tagebuch <span class="beta-pill">Beta</span></h1><p class="muted">Sessions, Challenges und deine Journey-Geschichten an einem Ort.</p></div>
      <div class="diary-actions">${run
        ? `<div class="diary-run"><span class="diary-run-dot" aria-hidden="true"></span><div><small>Session läuft · ${esc(dTarget(run).name)}</small><strong id="diaryClock">${dClock(Date.now() - run.start)}</strong></div><button class="btn btn-accent" data-d="stop">■ Beenden</button></div>`
        : `<button class="btn btn-accent" data-d="start">▶ Session starten</button>`}
        <button class="btn" data-d="addSession">+ Session nachtragen</button><button class="btn" data-d="addChallenge">+ Challenge</button></div>
    </header>
    <div class="diary-grid">
      <section class="hub2-card diary-timeline" aria-label="Zeitleiste">
        <div class="hub2-card-head"><h3>Zeitleiste</h3><span class="muted small">${diary.sessions.length} Sessions</span></div>
        ${days.length ? days.map(d=>`<div class="diary-day"><div class="diary-day-head"><strong>${esc(dDayLabel(d.k))}</strong>${d.min ? `<span class="muted small">${dMin(d.min)}</span>` : ""}</div>
          ${d.list.map(ev=>ev.s ? (()=>{ const s = ev.s, t = dTarget(s); return `<button class="diary-entry" data-d-session="${s.id}">
              <span class="diary-time">${new Date(s.start).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}<em>${dMin(s.minutes)}</em></span>
              ${t.crest}<span class="diary-entry-main"><strong>${esc(s.title || "Session")}</strong><span class="muted small">${esc(t.name)}${s.journeyId ? " · 📓 auch in der Journey" : ""}</span>${s.text ? `<span class="diary-text">${esc(s.text.slice(0,160))}${s.text.length > 160 ? " …" : ""}</span>` : ""}</span>
              <span class="diary-mood" title="Stimmung">${J_MOODS[s.mood] || ""}</span></button>`; })()
            : `<div class="diary-entry win"><span class="diary-time">🏆</span><span class="diary-entry-main"><strong>Challenge geschafft: ${esc(ev.c.title)}</strong><span class="muted small">${esc(dTarget(ev.c).name)}</span></span></div>`).join("")}</div>`).join("")
          : `<div class="diary-empty"><p><strong>Noch keine Einträge.</strong></p><p class="muted">Starte vor dem Spielen eine Session – der Timer läuft mit, und beim Beenden hältst du in zwei Sätzen fest, was passiert ist.</p></div>`}
      </section>
      <aside class="diary-side">
        <section class="hub2-card"><div class="hub2-card-head"><h3>Diese Woche</h3>${wk.streak > 1 ? `<span class="sm-badge ok">🔥 ${wk.streak} Tage in Folge</span>` : ""}</div>
          <div class="diary-week"><div><span>Spielzeit</span><strong>${dMin(wk.min)}</strong></div><div><span>Sessions</span><strong>${wk.n}</strong></div></div>
          ${wk.by.length ? `<div class="diary-bars">${wk.by.slice(0,5).map(b=>{ const t = dTarget(b.x); return `<div class="diary-bar"><span>${esc(t.name)}</span><i style="width:${Math.round(b.min / maxMin * 100)}%"></i><em>${dMin(b.min)}</em></div>`; }).join("")}</div>` : '<p class="muted small" style="margin:0">Noch nichts gespielt diese Woche.</p>'}
        </section>
        <section class="hub2-card"><div class="hub2-card-head"><h3>Challenges</h3><span class="muted small">${active.length} aktiv · ${doneList.length} geschafft</span></div>
          ${active.length ? active.map(c=>{ const t = dTarget(c), p = chProgress(c); return `<div class="ch-item">
              <button class="ch-title" data-d-ch="${c.id}">${esc(c.title)}</button><span class="muted small">${esc(t.name)} · ${CH_KIND[c.kind]}</span>
              ${c.kind !== "simple" ? `<div class="ch-bar"><i style="width:${Math.round(p * 100)}%"></i></div>` : ""}
              <div class="ch-actions">${c.kind === "count" ? `<span class="ch-count">${c.current} / ${c.target}</span><button class="btn btn-sm" data-d-plus="${c.id}">+1</button>`
                : c.kind === "steps" ? `<div class="ch-steps">${c.steps.map(st=>`<label class="check-label"><input type="checkbox" data-d-step="${c.id}:${st.id}" ${st.done ? "checked" : ""}> ${esc(st.text)}</label>`).join("")}</div>`
                : `<button class="btn btn-sm" data-d-done="${c.id}">✓ Geschafft</button>`}</div></div>`; }).join("")
            : '<p class="muted small" style="margin:0">Keine aktive Challenge. Wie wäre es mit einer neuen Herausforderung?</p>'}
          ${doneList.length ? `<details class="ch-done"><summary>${doneList.length} geschafft</summary>${doneList.slice().sort((a,b)=>b.doneAt - a.doneAt).map(c=>`<button class="ch-done-item" data-d-ch="${c.id}">🏆 ${esc(c.title)} <span class="muted small">${new Date(c.doneAt).toLocaleDateString("de-DE")}</span></button>`).join("")}</details>` : ""}
        </section>
        <section class="hub2-card"><div class="hub2-card-head"><h3>Aus deinen Journeys</h3><span class="muted small">Spieldatum</span></div>
          ${feed.length ? feed.map(({e, slot})=>`<button class="journey-feed-item" data-d-journey="${slot.id}"><span class="muted small">${esc(slot.name)} · ${fmtDate(e.date, {day:"2-digit", month:"2-digit", year:"numeric"})}</span><strong>${J_MOODS[e.mood] || ""} ${esc(e.title || "Eintrag")}</strong></button>`).join("")
            : '<p class="muted small" style="margin:0">Noch keine Journey-Einträge. Sie erscheinen hier automatisch, sobald du in einer Journey Tagebuch schreibst.</p>'}
        </section>
      </aside>
    </div></main>`;
}
function diaryClick(e){
  const t = e.target, g = sel => t.closest(sel);
  if(g("[data-d=start]")) return startSession();
  if(g("[data-d=stop]")) return sessionModal(diary.running, true);
  if(g("[data-d=addSession]")) return sessionModal({start:Date.now() - 3600000, minutes:60, slotId:slotIndex.active, mood:"good"}, false);
  if(g("[data-d=addChallenge]")) return challengeModal(null);
  const se = g("[data-d-session]"); if(se) return sessionModal(diary.sessions.find(x=>x.id === se.dataset.dSession), false);
  const ch = g("[data-d-ch]"); if(ch) return challengeModal(diary.challenges.find(x=>x.id === ch.dataset.dCh));
  const pl = g("[data-d-plus]"); if(pl){ const c = diary.challenges.find(x=>x.id === pl.dataset.dPlus); let won = false;
    diaryUndo(`${c.title}: ${c.current + 1} / ${c.target}`, ()=>{ c.current++; won = chCheckDone(c); }); if(won) toast(`🏆 Challenge geschafft: ${c.title}`); return; }
  const dn = g("[data-d-done]"); if(dn){ const c = diary.challenges.find(x=>x.id === dn.dataset.dDone);
    return diaryUndo(`🏆 Challenge geschafft: ${c.title}`, ()=>{ c.status = "done"; c.doneAt = Date.now(); }); }
  const jf = g("[data-d-journey]"); if(jf){ if(jf.dataset.dJourney !== slotIndex.active) switchSlot(jf.dataset.dJourney); openPanel("fm"); navigate("journey"); }
}
function diaryChange(e){
  const st = e.target.closest("[data-d-step]"); if(!st) return;
  const [cid, sid] = st.dataset.dStep.split(":"), c = diary.challenges.find(x=>x.id === cid); let won = false;
  diaryUndo(st.checked ? "Teilschritt erledigt" : "Teilschritt wieder offen", ()=>{ c.steps.find(x=>x.id === sid).done = st.checked; won = chCheckDone(c); });
  if(won) toast(`🏆 Challenge geschafft: ${c.title}`);
}
function diaryTick(){ const el = qs("#diaryClock"); if(el && diary && diary.running) el.textContent = dClock(Date.now() - diary.running.start); }
/** short status for the hub tile */
function diaryTileMeta(){
  if(!diary) loadDiary();
  if(diary.running) return `<span class="diary-run-dot" aria-hidden="true"></span> Session läuft · ${dClock(Date.now() - diary.running.start).slice(0,-3)} Std.`;
  const wk = dWeek(), act = diary.challenges.filter(c=>c.status === "active").length;
  return `Diese Woche ${dMin(wk.min)} · ${act} aktive Challenge${act === 1 ? "" : "s"}`;
}

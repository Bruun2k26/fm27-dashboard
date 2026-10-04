/* ==========================================================================
   SPIEL-TAGEBUCH (11.8 Beta) – sessions (with a timer that survives reloads), challenges, week overview.
   Global for all saves (store key "fm27_diary"). Linked with the Journey: journey diary entries of all
   saves show up here, and a session can be copied into the journey diary of its save.
   Sessions use REAL time; journey entries use the in-game date – so they are shown separately.
   ========================================================================== */
const DIARY_KEY = "fm27_diary", IMG_PREFIX = "fm27_img_", DIARY_MAX_IMGS = 6;
let dFilter = "", dPending = null, dTab = "timeline", dVidPending = null;
/* 12.0: videos of the open session dialog – picked inline (a second dialog would replace this one) */
function dAddVid(v){ if(!dVidPending) return false; if(dVidPending.length >= 6){ toast("Höchstens 6 Videos pro Session."); return false; } dVidPending.push(v); dRenderVids(); return true; }
function dVidLabel(v){ return v.kind === "file" ? v.name.replace(MEDIA_EXT, "") : (v.title || v.url.replace(/^https?:\/\//, "").slice(0,40)); }
function dRenderVids(){ const box = qs("#dVids"); if(!box || !dVidPending) return;
  box.innerHTML = dVidPending.map((v,i)=>`<span class="d-vid-chip"><span aria-hidden="true">${v.kind === "file" ? "🎬" : "🔗"}</span>${esc(dVidLabel(v))}<button type="button" data-dv-del="${i}" aria-label="Video entfernen">✕</button></span>`).join("") || '<span class="muted small">Noch keine Videos.</span>'; }
function dTogglePicker(){ const p = qs("#dVidPicker"); if(!p) return; p.hidden = !p.hidden; if(!p.hidden) dRenderPicker(); }
function dRenderPicker(){
  const p = qs("#dVidPicker"); if(!p || p.hidden) return;
  if(!fsSupported() || !mediaDir || mediaPerm !== "granted" || !mediaFiles.length){ p.innerHTML = `<p class="muted small">${!fsSupported() ? "Dein Browser kann keine Ordner lesen – Links gehen trotzdem." : !mediaDir ? "Noch kein Medien-Ordner verbunden: Tagebuch → Reiter 🎬 Medien → Ordner wählen." : mediaPerm !== "granted" ? "Medien-Ordner erst wieder verbinden: Tagebuch → 🎬 Medien." : "Keine Videos im Ordner."}</p>`; return; }
  const chosen = new Set(dVidPending.filter(v=>v.kind === "file").map(v=>v.path));
  p.innerHTML = `<div class="d-vid-grid">${mediaFiles.slice(0, 60).map(f=>`<button type="button" class="d-vid-pick ${chosen.has(f.path) ? "on" : ""}" data-dv-pick="${esc(f.path)}" aria-pressed="${chosen.has(f.path)}" data-vchip="${esc(f.path)}">
    <span class="media-thumb"><span class="media-dur"></span></span><span class="d-vid-name">${esc(f.name.replace(MEDIA_EXT, ""))}</span></button>`).join("")}</div>`;
  mediaFiles.slice(0, 60).forEach(f=>{ queueThumb(f); paintVchips(f); });
}     // 12.0: tab "timeline" | "media"     // timeline filter · images of the open session dialog
const CH_KIND = {simple:"Einfaches Ziel", count:"Mit Zähler", steps:"Mit Teilschritten"};
let diary = null, diaryTimer = null;
function sanitizeDiary(raw){
  const r = raw && typeof raw === "object" ? raw : {}, S = v => typeof v === "string" ? v : "", A = v => Array.isArray(v) ? v : [];
  const moods = typeof J_MOODS === "object" ? J_MOODS : {};
  const sessions = A(r.sessions).filter(x=>x && typeof x === "object").map(x=>({id:S(x.id) || uid(), start:num(x.start), end:num(x.end), minutes:Math.max(0, Math.round(num(x.minutes))),
    slotId:S(x.slotId), game:S(x.game).slice(0,60), label:S(x.label).slice(0,80), title:S(x.title).slice(0,120), text:S(x.text).slice(0,4000), mood:moods[x.mood] ? x.mood : "good",
    careerId:S(x.careerId), journeyId:S(x.journeyId), plan:S(x.plan).slice(0,120), planDone:!!x.planDone,
    images:A(x.images).filter(i=>typeof i === "string" && i).slice(0, DIARY_MAX_IMGS),
    videos:A(x.videos).filter(v=>v && (v.kind === "file" ? S(v.path) : /^https?:\/\//.test(S(v.url)))).map(v=>v.kind === "file"
      ? {kind:"file", path:S(v.path).slice(0,400), name:S(v.name).slice(0,160), size:num(v.size), mtime:num(v.mtime)}
      : {kind:"link", url:S(v.url).slice(0,500), title:S(v.title).slice(0,100)}).slice(0,6)})).filter(x=>x.start).sort((a,b)=>b.start - a.start).slice(0,2000);
  const challenges = A(r.challenges).filter(x=>x && typeof x === "object" && S(x.title).trim()).map(x=>({id:S(x.id) || uid(), title:S(x.title).trim().slice(0,120), desc:S(x.desc).slice(0,1000),
    slotId:S(x.slotId), careerId:S(x.careerId), game:S(x.game).slice(0,60), label:S(x.label).slice(0,80), kind:CH_KIND[x.kind] ? x.kind : "simple", target:Math.max(1, Math.round(num(x.target) || 1)),
    current:Math.max(0, Math.round(num(x.current))), steps:A(x.steps).filter(st=>st && S(st.text).trim()).map(st=>({id:S(st.id) || uid(), text:S(st.text).trim().slice(0,120), done:!!st.done})).slice(0,30),
    status:["active","done","dropped"].includes(x.status) ? x.status : "active", createdAt:num(x.createdAt) || Date.now(), doneAt:num(x.doneAt)}));
  const run = r.running && typeof r.running === "object" && num(r.running.start) ? {start:num(r.running.start), slotId:S(r.running.slotId), careerId:S(r.running.careerId), game:S(r.running.game).slice(0,60), plan:S(r.running.plan).slice(0,120)} : null;
  const links = A(r.links).filter(l=>l && /^https?:\/\//.test(S(l.url))).map(l=>({id:S(l.id) || uid(), url:S(l.url).slice(0,500), title:S(l.title).slice(0,100), addedAt:num(l.addedAt) || Date.now()})).slice(0,300);
  return {v:1, sessions, challenges, running:run, links, games:[...new Set(A(r.games).map(g=>S(g).trim()).filter(Boolean))].slice(0,40)};
}
function loadDiary(){ diary = sanitizeDiary(readJSON(DIARY_KEY)); return diary; }
function saveDiary(){ try{ store.setItem(DIARY_KEY, JSON.stringify(diary)); }catch(e){ toast("Tagebuch konnte nicht gespeichert werden."); } scheduleFolderBackup(); }
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
  if(x.careerId){ const t = typeof careerTarget === "function" && careerTarget(x.careerId); if(t) return t;
    return {name:x.label || "Gelöschte Karriere", sub:"nicht mehr vorhanden", crest:'<span class="sm-crest xs" style="background:var(--bg-750)">?</span>'}; }
  if(x.slotId){ const s = slotSummaries().find(y=>y.id === x.slotId); if(s) return {name:s.name, sub:s.club, crest:smCrest(s, "xs"), slot:s};
    return {name:x.label || "Gelöschter Spielstand", sub:"nicht mehr vorhanden", crest:'<span class="sm-crest xs" style="background:var(--bg-750)">?</span>'}; }
  const g = x.game || "Ohne Zuordnung";
  return {name:g, sub:"anderes Spiel", crest:`<span class="sm-crest xs d-game" style="background:hsl(${[...g].reduce((a,c)=>(a * 31 + c.charCodeAt(0)) % 360, 7)} 45% 32%)">${esc(g.replace(/[^A-Za-zÄÖÜäöü0-9 ]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase() || "?")}</span>`};
}
function dTargetOptions(sel){
  const sums = slotSummaries();
  return `<optgroup label="Spielstände">${sums.map(s=>`<option value="slot:${s.id}" ${sel === "slot:" + s.id ? "selected" : ""}>${esc(s.name)} · ${esc(s.club)}</option>`).join("")}</optgroup>
    ${career && career.careers.length ? `<optgroup label="Karriere-Begleiter">${career.careers.map(c=>`<option value="career:${c.id}" ${sel === "career:" + c.id ? "selected" : ""}>${esc(c.name)}${c.game ? " · " + esc(c.game) : ""}</option>`).join("")}</optgroup>` : ""}
    ${diary.games.length ? `<optgroup label="Andere Spiele">${diary.games.map(g=>`<option value="game:${esc(g)}" ${sel === "game:" + g ? "selected" : ""}>${esc(g)}</option>`).join("")}</optgroup>` : ""}
    <option value="new" ${sel === "new" ? "selected" : ""}>+ Anderes Spiel …</option>`;
}
function dReadTarget(m){
  const v = qs('[data-f="target"]', m).value;
  if(v.startsWith("slot:")){ const id = v.slice(5); return {slotId:id, careerId:"", game:"", label:(slotIndex.slots.find(s=>s.id === id) || {}).name || ""}; }
  if(v.startsWith("career:")){ const c = crById(v.slice(7)) || {}; return {slotId:"", careerId:v.slice(7), game:c.game || "", label:c.name || ""}; }
  if(v.startsWith("game:")) return {slotId:"", careerId:"", game:v.slice(5), label:v.slice(5)};
  const g = qs('[data-f="newGame"]', m).value.trim(); return {slotId:"", careerId:"", game:g, label:g};
}
const dTargetKey = x => x.careerId ? "career:" + x.careerId : x.slotId ? "slot:" + x.slotId : x.game ? "game:" + x.game : "slot:" + slotIndex.active;
function dWeek(){
  const now = new Date(), mon = new Date(now); mon.setHours(0,0,0,0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const list = diary.sessions.filter(s=>s.start >= mon.getTime()), by = {};
  list.forEach(s=>{ const k = dTargetKey(s); by[k] = by[k] || {x:s, min:0}; by[k].min += s.minutes; });
  let streak = 0; const days = new Set(diary.sessions.map(s=>dDay(s.start)));
  for(let d = dDay(Date.now()); days.has(d) || (streak === 0 && days.has(d - 86400000)); d -= 86400000){ if(days.has(d)) streak++; else if(streak === 0) continue; }
  return {min:list.reduce((a,s)=>a + s.minutes, 0), n:list.length, by:Object.values(by).sort((a,b)=>b.min - a.min), streak};
}
/* ---------- 11.8.1: images (own store entries – the diary itself stays small) ---------- */
function readDiaryImage(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>{ const img = new Image(); img.onload = ()=>{ const c = document.createElement("canvas"), k = Math.min(1, 1600 / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.82)); };
      img.onerror = ()=>rej(new Error("Bild nicht lesbar")); img.src = fr.result; };
    fr.onerror = ()=>rej(fr.error); fr.readAsDataURL(file);
  });
}
const dImg = id => store.getItem(IMG_PREFIX + id) || "";
/** images no session refers to any more (deleted sessions, cancelled dialogs) – removed at start, so "undo" stays possible during a visit */
function dGcImages(){
  const used = new Set(diary.sessions.flatMap(s=>s.images || [])), gone = [];
  for(let i = 0; i < store.length; i++){ const k = store.key(i); if(k && k.startsWith(IMG_PREFIX) && !used.has(k.slice(IMG_PREFIX.length))) gone.push(k); }
  gone.forEach(k=>store.removeItem(k));
  return gone.length;
}
function dLightbox(sessionId, index){
  const s = diary.sessions.find(x=>x.id === sessionId); if(!s || !(s.images || []).length) return;
  let i = clamp(index, 0, s.images.length - 1);
  const draw = m => { qs("#dLbImg", m).src = dImg(s.images[i]); qs("#dLbCount", m).textContent = `${i + 1} / ${s.images.length}`;
    qs("[data-lb=prev]", m).disabled = i === 0; qs("[data-lb=next]", m).disabled = i === s.images.length - 1; };
  openModal({title: s.title || "Session", wide:true, body:`<div class="d-lightbox"><img id="dLbImg" alt="Bild ${esc(s.title || "Session")}"></div>
    <div class="d-lb-nav"><button class="btn btn-sm" data-lb="prev">← Zurück</button><span class="muted small" id="dLbCount"></span><button class="btn btn-sm" data-lb="next">Weiter →</button></div>`,
    saveLabel:"Schließen",
    onOpen: m=>{ draw(m);
      m.addEventListener("click", e=>{ const b = e.target.closest("[data-lb]"); if(!b) return; i = clamp(i + (b.dataset.lb === "next" ? 1 : -1), 0, s.images.length - 1); draw(m); });
      m.addEventListener("keydown", e=>{ if(e.key === "ArrowRight"){ i = Math.min(i + 1, s.images.length - 1); draw(m); } if(e.key === "ArrowLeft"){ i = Math.max(i - 1, 0); draw(m); } }); }});
}
/** for the open session dialog: add one image (data URL) – used by file input and Ctrl+V */
function dModalAddImage(url){
  if(!dPending) return false;
  if(dPending.length >= DIARY_MAX_IMGS){ toast(`Höchstens ${DIARY_MAX_IMGS} Bilder pro Session.`); return false; }
  dPending.push({id:uid(), url, isNew:true}); dRenderPending(); return true;
}
function dRenderPending(){
  const box = qs("#dImgs"); if(!box || !dPending) return;
  box.innerHTML = dPending.map((p,i)=>`<span class="d-thumb"><img src="${p.url}" alt="Bild ${i + 1}"><button type="button" class="d-thumb-del" data-d-imgdel="${i}" aria-label="Bild ${i + 1} entfernen">✕</button></span>`).join("")
    + (dPending.length < DIARY_MAX_IMGS ? `<label class="d-thumb add" title="Bilder hinzufügen – oder mit Strg + V einfügen">＋<input type="file" accept="image/*" multiple id="dImgFile" hidden></label>` : "");
}
/* ---------- sessions ---------- */
function startSession(t, plan){
  if(diary.running) return;
  t = t || {slotId:slotIndex.active, game:""};
  diaryUndo("Session gestartet – der Timer läuft auch, wenn du das Dashboard schließt", ()=>{ diary.running = {start:Date.now(), slotId:t.slotId || "", careerId:t.careerId || "", game:t.game || "", plan:(plan || "").trim()}; if(t.game && !t.careerId && !diary.games.includes(t.game)) diary.games.unshift(t.game); });
}
/** 11.8.1: start with an optional plan ("Session-Vorhaben") */
function startSessionModal(){
  if(diary.running) return;
  openModal({title:"Session starten", body:`
    <div class="field"><label>Spielstand / Spiel</label><select data-f="target">${dTargetOptions("slot:" + slotIndex.active)}</select></div>
    <div class="field" id="dNewGameWrap" hidden><label>Name des Spiels</label><input data-f="newGame" maxlength="60"></div>
    <div class="field"><label>Vorhaben (optional)</label><input data-f="plan" maxlength="120" placeholder="z. B. Winter-Transferfenster abschließen"></div>
    <p class="hint">Das Vorhaben steht während der Session oben – beim Beenden fragt das Tagebuch, ob du es geschafft hast.</p>`,
    saveLabel:"▶ Starten",
    onOpen: m=>{ const upd = () => { qs("#dNewGameWrap", m).hidden = qs('[data-f="target"]', m).value !== "new"; }; qs('[data-f="target"]', m).addEventListener("change", upd); upd(); setTimeout(()=>{ const p = qs('[data-f="plan"]', m); if(p) p.focus(); }, 30); },
    onSave: get=>{ const t = dReadTarget(qs("#modal")); if(!t.slotId && !t.game){ toast("Bitte ein Spiel angeben."); return false; } startSession(t, get("plan")); }});
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
    ${s.plan ? `<label class="check-label d-plan-check"><input type="checkbox" data-f="planDone" ${s.planDone || fromRun ? "checked" : ""}> 🎯 Vorhaben geschafft: <strong>${esc(s.plan)}</strong></label>` : ""}
    <div class="field"><label>Was ist passiert?</label><input data-f="title" maxlength="120" value="${esc(s.title || (fromRun && s.plan) || "")}" placeholder="z. B. Pokal-Aus gegen Bayern, Winter-Transfers fix"></div>
    <div class="field"><label>Notizen (optional)</label><textarea data-f="text" rows="4">${esc(s.text || "")}</textarea></div>
    <div class="field"><label>Videos <span class="muted small">(bis zu 6 · aus deinem Medien-Ordner oder als Link)</span></label>
      <div class="d-vids" id="dVids"></div>
      <div class="d-vid-actions"><button type="button" class="btn btn-sm" data-dv="pick">🎬 Aus Ordner …</button><input id="dVidUrl" placeholder="oder Link einfügen (YouTube, Twitch, .mp4)" aria-label="Video-Link"><button type="button" class="btn btn-sm" data-dv="addLink">+ Link</button></div>
      <div class="d-vid-picker" id="dVidPicker" hidden></div></div>
    <div class="field"><label>Bilder <span class="muted small">(bis zu ${DIARY_MAX_IMGS} · auch mit Strg + V einfügen, z. B. ein Screenshot aus FM)</span></label><div class="d-imgs" id="dImgs"></div></div>
    <label class="check-label" id="dJourneyWrap" hidden><input type="checkbox" data-f="toJourney"> Auch ins Journey-Tagebuch dieses Spielstands übernehmen (mit dem Spieldatum)</label>`,
    leftButtons: fromRun ? `<button class="btn btn-danger-outline" data-d-discard>Verwerfen</button>` : isNew ? "" : `<button class="btn btn-danger-outline" data-d-del>Löschen</button>`,
    saveLabel: fromRun ? "Session speichern" : "Speichern",
    onOpen: m=>{
      const upd = () => { const v = qs('[data-f="target"]', m).value; qs("#dNewGameWrap", m).hidden = v !== "new";
        const j = v.startsWith("slot:") && !s.journeyId && dJourneyOf(v.slice(5)); qs("#dJourneyWrap", m).hidden = !j; };
      qs('[data-f="target"]', m).addEventListener("change", upd); upd();
      dPending = (s.images || []).map(id=>({id, url:dImg(id)})); dRenderPending();
      dVidPending = (s.videos || []).map(v=>Object.assign({}, v)); dRenderVids();
      m.addEventListener("click", e=>{
        const b = e.target.closest("[data-dv]"); if(b){ const k = b.dataset.dv;
          if(k === "pick") dTogglePicker(); else if(k === "addLink"){ const inp = qs("#dVidUrl", m), p = parseVideoLink(inp.value); if(!p){ toast("Bitte einen gültigen Link einfügen (https://…)."); return; } dAddVid({kind:"link", url:p.url, title:""}); inp.value = ""; } return; }
        const del = e.target.closest("[data-dv-del]"); if(del){ dVidPending.splice(num(del.dataset.dvDel), 1); dRenderVids(); dRenderPicker(); return; }
        const pk = e.target.closest("[data-dv-pick]"); if(pk){ const f = mediaFiles.find(x=>x.path === pk.dataset.dvPick); if(!f) return;
          const i = dVidPending.findIndex(v=>v.kind === "file" && v.path === f.path); if(i >= 0) dVidPending.splice(i, 1); else dAddVid({kind:"file", path:f.path, name:f.name, size:f.size, mtime:f.mtime}); dRenderVids(); dRenderPicker(); }
      });
      m.addEventListener("change", async e=>{ if(e.target.id !== "dImgFile") return;
        for(const f of [...e.target.files]){ try{ if(!dModalAddImage(await readDiaryImage(f))) break; }catch(err){ toast("Ein Bild konnte nicht gelesen werden."); } } });
      m.addEventListener("click", e=>{ const x = e.target.closest("[data-d-imgdel]"); if(x){ dPending.splice(num(x.dataset.dImgdel), 1); dRenderPending(); } });
      m.addEventListener("paste", async e=>{ const items = [...((e.clipboardData && e.clipboardData.items) || [])].filter(it=>it.type && it.type.startsWith("image/"));
        if(!items.length) return; e.preventDefault();
        for(const it of items){ try{ if(!dModalAddImage(await readDiaryImage(it.getAsFile()))) break; }catch(err){ toast("Bild aus der Zwischenablage konnte nicht gelesen werden."); } }
        toast("Bild eingefügt"); });
      const dis = qs("[data-d-discard]", m); if(dis) dis.onclick = ()=>{ closeModal(); diaryUndo("Session verworfen", ()=>{ diary.running = null; }); };
      const del = qs("[data-d-del]", m); if(del) del.onclick = ()=>{ closeModal(); diaryUndo("Session gelöscht", ()=>{ diary.sessions = diary.sessions.filter(x=>x.id !== s.id); }); };
    },
    onClose: ()=>{ dPending = null; dVidPending = null; },
    onSave: get=>{
      const t = dReadTarget(qs("#modal")); if(!t.slotId && !t.game){ toast("Bitte ein Spiel angeben."); return false; }
      const st = new Date(get("start")).getTime() || s.start, mins = Math.max(1, Math.round(num(get("minutes")))), data = Object.assign({start:st, end:st + mins * 60000, minutes:mins,
        title:get("title").trim(), text:get("text"), mood:get("mood"), plan:s.plan || "", planDone: s.plan ? !!get("planDone") : false}, t);
      // images: new ones become own store entries; removed ones are cleaned up at the next start (so undo still works)
      (dPending || []).filter(p=>p.isNew).forEach(p=>{ try{ store.setItem(IMG_PREFIX + p.id, p.url); }catch(e){ toast("Speicher voll – Bild nicht gespeichert."); } });
      data.images = (dPending || []).map(p=>p.id); dPending = null;
      data.videos = (dVidPending || []).slice(0,6); dVidPending = null;
      const toJ = get("toJourney") && t.slotId && dJourneyOf(t.slotId);
      diaryUndo(fromRun ? `Session gespeichert · ${dMin(mins)}` : "Session gespeichert", ()=>{
        if(t.game && !t.careerId && !diary.games.includes(t.game)) diary.games.unshift(t.game);
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
        if(t.game && !t.careerId && !diary.games.includes(t.game)) diary.games.unshift(t.game);
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
  const keyOf = x => dTargetKey(x), keys = [...new Set(diary.sessions.map(keyOf).concat(diary.challenges.map(keyOf)))];
  if(dFilter && !keys.includes(dFilter)) dFilter = "";
  const events = diary.sessions.filter(s=>!dFilter || keyOf(s) === dFilter).map(s=>({ts:s.start, s}))
    .concat(doneList.filter(c=>!dFilter || keyOf(c) === dFilter).map(c=>({ts:c.doneAt, c}))).sort((a,b)=>b.ts - a.ts).slice(0, 80);
  const days = []; events.forEach(ev=>{ const k = dDay(ev.ts); let d = days.find(x=>x.k === k); if(!d){ d = {k, list:[], min:0}; days.push(d); } d.list.push(ev); if(ev.s) d.min += ev.s.minutes; });
  const feed = dJourneyFeed(5), maxMin = Math.max(1, ...wk.by.map(b=>b.min));
  root.innerHTML = `<main class="hub-main hub2 diary-page">
    <header class="hub2-head"><div><button class="btn btn-sm" data-hub="home" title="Zurück zum Hub (Esc)">← Hub</button>
      <h1>📓 Spiel-Tagebuch</h1><p class="muted">Sessions, Challenges und deine Journey-Geschichten an einem Ort.</p></div>
      <div class="diary-actions">${run
        ? `<div class="diary-run"><span class="diary-run-dot" aria-hidden="true"></span><div><small>Session läuft · ${esc(dTarget(run).name)}</small><strong id="diaryClock">${dClock(Date.now() - run.start)}</strong>${run.plan ? `<span class="diary-run-plan">🎯 ${esc(run.plan)}</span>` : ""}</div><button class="btn btn-accent" data-d="stop">■ Beenden</button></div>`
        : `<button class="btn btn-accent" data-d="start">▶ Session starten</button>`}
        <button class="btn" data-d="addSession">+ Session nachtragen</button><button class="btn" data-d="addChallenge">+ Challenge</button></div>
    </header>
    <div class="diary-grid">
      <div class="diary-main">
      <div class="seg diary-tabs" role="tablist" aria-label="Ansicht"><button role="tab" data-d-tab="timeline" aria-selected="${dTab === "timeline"}" class="${dTab === "timeline" ? "active" : ""}">Zeitleiste</button><button role="tab" data-d-tab="media" aria-selected="${dTab === "media"}" class="${dTab === "media" ? "active" : ""}">🎬 Medien</button></div>
      ${dTab === "media" ? mediaGalleryHTML() : `
      <section class="hub2-card diary-timeline" aria-label="Zeitleiste">
        <div class="hub2-card-head"><h3>Zeitleiste</h3>${keys.length > 1 ? `<select class="d-filter" data-d-filter aria-label="Zeitleiste filtern"><option value="">Alle Spielstände &amp; Spiele</option>${keys.map(k=>{ const [kind, v] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)]; const t = dTarget(kind === "slot" ? {slotId:v} : kind === "career" ? {careerId:v} : {game:v}); return `<option value="${esc(k)}" ${dFilter === k ? "selected" : ""}>${esc(t.name)}</option>`; }).join("")}</select>` : `<span class="muted small">${diary.sessions.length} Sessions</span>`}</div>
        ${days.length ? days.map(d=>`<div class="diary-day"><div class="diary-day-head"><strong>${esc(dDayLabel(d.k))}</strong>${d.min ? `<span class="muted small">${dMin(d.min)}</span>` : ""}</div>
          ${d.list.map(ev=>ev.s ? (()=>{ const s = ev.s, t = dTarget(s); return `<div class="diary-entry" data-d-session="${s.id}" role="button" tabindex="0" aria-label="Session ${esc(s.title || "")} bearbeiten">
              <span class="diary-time">${new Date(s.start).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}<em>${dMin(s.minutes)}</em></span>
              ${t.crest}<span class="diary-entry-main"><strong>${esc(s.title || "Session")}</strong><span class="muted small">${esc(t.name)}${s.journeyId ? " · 📓 auch in der Journey" : ""}</span>${s.plan ? `<span class="diary-plan ${s.planDone ? "ok" : "no"}">🎯 ${esc(s.plan)} · ${s.planDone ? "geschafft" : "nicht geschafft"}</span>` : ""}${s.text ? `<span class="diary-text">${esc(s.text.slice(0,160))}${s.text.length > 160 ? " …" : ""}</span>` : ""}
              ${(s.videos || []).length ? `<span class="diary-vids">${s.videos.map((v,i)=>`<button type="button" class="diary-vid" data-d-vid="${s.id}:${i}" ${v.kind === "file" ? `data-vchip="${esc(v.path)}"` : ""} aria-label="Video ${esc(dVidLabel(v))} abspielen"><span class="media-thumb ${v.kind === "link" ? "link" : ""}"><span class="media-play" aria-hidden="true">▶</span>${v.kind === "link" ? `<span class="diary-vid-kind">${{youtube:"YouTube", twitch:"Twitch", file:"Video", other:"Link"}[(parseVideoLink(v.url) || {}).kind] || "Link"}</span>` : '<span class="media-dur"></span>'}</span><span class="diary-vid-name">${esc(dVidLabel(v))}</span></button>`).join("")}</span>` : ""}
              ${(s.images || []).length ? `<span class="diary-thumbs">${s.images.slice(0,4).map((id,i)=>`<button type="button" class="diary-thumb" data-d-img="${s.id}:${i}" aria-label="Bild ${i + 1} ansehen"><img src="${dImg(id)}" alt=""></button>`).join("")}${s.images.length > 4 ? `<span class="diary-thumb more">+${s.images.length - 4}</span>` : ""}</span>` : ""}</span>
              <span class="diary-mood" title="Stimmung">${J_MOODS[s.mood] || ""}</span></div>`; })()
            : `<div class="diary-entry win"><span class="diary-time">🏆</span><span class="diary-entry-main"><strong>Challenge geschafft: ${esc(ev.c.title)}</strong><span class="muted small">${esc(dTarget(ev.c).name)}</span></span>
                <span class="diary-win-acts"><button type="button" class="tc-arrow" data-d-reopen="${ev.c.id}" title="Versehentlich? Wieder aktiv setzen" aria-label="${esc(ev.c.title)} wieder aktiv setzen">↺</button><button type="button" class="tc-arrow" data-d-delch="${ev.c.id}" title="Challenge löschen" aria-label="${esc(ev.c.title)} löschen">✕</button></span></div>`).join("")}</div>`).join("")
          : `<div class="diary-empty"><p><strong>Noch keine Einträge.</strong></p><p class="muted">Starte vor dem Spielen eine Session – der Timer läuft mit, und beim Beenden hältst du in zwei Sätzen fest, was passiert ist.</p></div>`}
      </section>`}
      </div>
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
  if(dTab === "media") mediaAfterRender(root);
  else { const byPath = new Map(mediaFiles.map(f=>[f.path, f])); qsa("[data-vchip]", root).forEach(el=>{ const f = byPath.get(el.dataset.vchip); if(f){ queueThumb(f); paintVchips(f); } }); }
}
function diaryClick(e){
  const t = e.target, g = sel => t.closest(sel);
  const tb = g("[data-d-tab]"); if(tb){ dTab = tb.dataset.dTab; renderHub(); return true; }
  if(dTab === "media" && mediaClick(e)) return true;
  const dv = g("[data-d-vid]"); if(dv){ const [sid, i] = dv.dataset.dVid.split(":"); playSessionVideo(diary.sessions.find(x=>x.id === sid).videos[num(i)]); return true; }
  const im = g("[data-d-img]"); if(im){ const [sid, i] = im.dataset.dImg.split(":"); dLightbox(sid, num(i)); return true; }
  const ro = g("[data-d-reopen]"); if(ro){ const c = diary.challenges.find(x=>x.id === ro.dataset.dReopen);
    diaryUndo(`„${c.title}“ wieder aktiv`, ()=>{ c.status = "active"; c.doneAt = 0; if(c.kind === "count" && c.current >= c.target) c.current = c.target - 1; if(c.kind === "steps" && c.steps.length && c.steps.every(x=>x.done)) c.steps[c.steps.length - 1].done = false; }); return true; }
  const dc = g("[data-d-delch]"); if(dc){ const c = diary.challenges.find(x=>x.id === dc.dataset.dDelch);
    diaryUndo(`Challenge „${c.title}“ gelöscht`, ()=>{ diary.challenges = diary.challenges.filter(x=>x.id !== c.id); }); return true; }
  if(g("[data-d=start]")){ startSessionModal(); return true; }
  if(g("[data-d=stop]")){ sessionModal(diary.running, true); return true; }
  if(g("[data-d=addSession]")){ sessionModal({start:Date.now() - 3600000, minutes:60, slotId:slotIndex.active, mood:"good"}, false); return true; }
  if(g("[data-d=addChallenge]")){ challengeModal(null); return true; }
  const se = g("[data-d-session]"); if(se){ sessionModal(diary.sessions.find(x=>x.id === se.dataset.dSession), false); return true; }
  const ch = g("[data-d-ch]"); if(ch){ challengeModal(diary.challenges.find(x=>x.id === ch.dataset.dCh)); return true; }
  const pl = g("[data-d-plus]"); if(pl){ const c = diary.challenges.find(x=>x.id === pl.dataset.dPlus); let won = false;
    diaryUndo(`${c.title}: ${c.current + 1} / ${c.target}`, ()=>{ c.current++; won = chCheckDone(c); }); if(won) toast(`🏆 Challenge geschafft: ${c.title}`); return true; }
  const dn = g("[data-d-done]"); if(dn){ const c = diary.challenges.find(x=>x.id === dn.dataset.dDone);
    diaryUndo(`🏆 Challenge geschafft: ${c.title}`, ()=>{ c.status = "done"; c.doneAt = Date.now(); }); return true; }
  const jf = g("[data-d-journey]"); if(jf){ if(jf.dataset.dJourney !== slotIndex.active) switchSlot(jf.dataset.dJourney); openPanel("fm"); navigate("journey"); return true; }
  return false;
}
function diaryChange(e){
  const fl = e.target.closest("[data-d-filter]"); if(fl){ dFilter = fl.value; renderHub(); return; }
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

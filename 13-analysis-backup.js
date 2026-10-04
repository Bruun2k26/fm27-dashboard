/* ==========================================================================
   PHASE 10 · ANALYSE ÜBER SAISONS
   ========================================================================== */
/* ---------- Spielerentwicklung ---------- */
function recordPlayerHistory(){
  if(!state || !state.players) return;
  if(!state.history || typeof state.history !== "object") state.history = {};
  const d = state.club.ingameDate;
  state.players.forEach(p=>{
    const h = state.history[p.id] || (state.history[p.id] = []);
    const snap = {d, r:p.rating, s:p.salary, vmin:p.valueMin || 0, vmax:p.valueMax || 0};
    const last = h[h.length-1];
    if(last && last.r === snap.r && last.s === snap.s && last.vmin === snap.vmin && last.vmax === snap.vmax) return;
    // several edits on the same in-game day → one point (the very first point stays as baseline)
    if(last && last.d === d && h.length > 1) Object.assign(last, snap); else h.push(snap);
    if(h.length > 80) h.splice(0, h.length - 80);
  });
  Object.keys(state.history).forEach(id=>{ if(!state.players.some(p=>p.id === id)) delete state.history[id]; });
}
function sparkline(values, fmt, cls){
  const W = 170, H = 34, P = 3;
  if(values.length < 2) return "";
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v,i)=>[P + i*(W-2*P)/(values.length-1), H - P - (v-lo)/span*(H-2*P)]);
  const path = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const first = values[0], last = values[values.length-1];
  const trend = last > first ? "up" : last < first ? "down" : "flat";
  return `<div class="spark ${cls||""}"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${path}" class="spark-line ${trend}"/>
    ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2" class="spark-pt ${trend}"/>`).join("")}</svg>
    <span class="spark-val">${fmt(first)} → <strong class="${trend}">${fmt(last)}</strong></span></div>`;
}
function historySectionHTML(p){
  const h = (state.history && state.history[p.id]) || [];
  if(h.length < 2) return `<div class="hist-box"><div class="hist-head">Entwicklung</div>
    <p class="hint" style="margin:0">Der Verlauf entsteht mit der Zeit: Jede Änderung von Stärke, Gehalt oder Transferwert wird mit dem Spieldatum festgehalten – am bequemsten über regelmäßige FM-Importe.</p></div>`;
  const vals = h.map(x=>x.vmax ? (x.vmin + x.vmax)/2 : 0);
  return `<div class="hist-box"><div class="hist-head">Entwicklung <span class="muted small">${h.length} Datenpunkte seit ${fmtDate(h[0].d,{month:"short",year:"numeric"})}</span></div>
    <div class="spark-grid">
      <div><div class="muted small">Einschätzung</div>${sparkline(h.map(x=>x.r), v=>"★".repeat(v))}</div>
      <div><div class="muted small">Gehalt${wageSuffix()}</div>${sparkline(h.map(x=>wageToUnit(x.s)), v=>fmtEUR(v))}</div>
      ${vals.some(v=>v) ? `<div><div class="muted small">Transferwert (Mitte)</div>${sparkline(vals, v=>v ? fmtEUR(v) : "—")}</div>` : ""}
    </div>
    <table class="res-table hist-table"><thead><tr><th>Spieldatum</th><th>Einschätzung</th><th class="num">Gehalt${wageSuffix()}</th><th class="num">Transferwert</th></tr></thead><tbody>
      ${h.slice().reverse().slice(0,8).map(x=>`<tr><td class="muted">${fmtDate(x.d,{day:"2-digit",month:"2-digit",year:"2-digit"})}</td><td>${starsRO(x.r)}</td>
        <td class="num">${fmtEUR(wageToUnit(x.s))}</td><td class="num">${x.vmax ? fmtValue({valueMin:x.vmin, valueMax:x.vmax}) : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

/* ---------- Gegner-Datenbank ---------- */
const oppKey = n => normName(n);
function opponentEntry(name){ const k = oppKey(name); return k ? state.opponents.find(o=>oppKey(o.name) === k) : null; }
function upsertOpponent(name, data){
  if(!name || !name.trim()) return null;
  let o = opponentEntry(name);
  if(!o){ o = {id:uid(), name:name.trim(), formation:"", keyThreat:"", weaknesses:"", notes:"", updatedAt:""}; state.opponents.push(o); }
  Object.entries(data || {}).forEach(([k,v])=>{ if(typeof v === "string" && v.trim()) o[k] = v.trim(); });
  o.updatedAt = state.club.ingameDate;
  return o;
}
function opponentStats(name){
  const k = oppKey(name);
  const list = sortedResults().filter(r=>oppKey(r.opponent) === k);
  const rec = list.length ? groupRecord(list, ()=>"all", ()=>"")[0] : null;
  const fc = {}; list.forEach(r=>{ if(r.oppFormation) fc[r.oppFormation] = (fc[r.oppFormation]||0) + 1; });
  const formation = Object.entries(fc).sort((a,b)=>b[1]-a[1])[0];
  return {list, rec, formation: formation ? formation[0] : ""};
}
function allOpponents(){
  const map = new Map();
  sortedResults().forEach(r=>{ const k = oppKey(r.opponent); if(k && !map.has(k)) map.set(k, r.opponent); });
  state.opponents.forEach(o=>{ const k = oppKey(o.name); if(!map.has(k)) map.set(k, o.name); });
  return [...map.values()];
}
function lastMeetingText(r){
  return `${r.gf}:${r.ga} (${({H:"H",A:"A",N:"N"})[r.venue]}${r.date ? ", " + fmtDate(r.date,{day:"2-digit",month:"2-digit",year:"2-digit"}) : ""})`;
}
function renderOppHint(){
  const box = qs("#oppHint"); if(!box) return;
  const name = state.nextMatch.opponent.trim();
  if(!name){ box.hidden = true; box.innerHTML = ""; return; }
  const st = opponentStats(name), entry = opponentEntry(name);
  box.hidden = false;
  if(!st.rec && !entry){ box.innerHTML = `<span class="muted">Erstes Duell – noch keine Daten zu „${esc(name)}“. Deine Analyse wird beim Eintragen des Ergebnisses gemerkt.</span>`; return; }
  const nm = state.nextMatch;
  const fillable = entry && [["formation","formation"],["keyThreat","keyThreat"],["weaknesses","weaknesses"]].some(([a,b])=>entry[a] && !nm[b]);
  box.innerHTML = `
    ${st.rec ? `<div class="oh-line"><strong>Bilanz:</strong> ${recordBadges(st.rec)} <span class="muted">Tore ${st.rec.gf}:${st.rec.ga} · ${fmtNum(st.rec.ppg,2)} P/Sp · zuletzt ${esc(lastMeetingText(st.list[0]))}${st.formation ? " · meist " + esc(st.formation) : ""}</span></div>` : ""}
    ${entry ? `<div class="oh-line"><strong>Gespeicherte Analyse</strong> <span class="muted">(${entry.updatedAt ? fmtDate(entry.updatedAt,{day:"2-digit",month:"2-digit",year:"2-digit"}) : "ohne Datum"})</span>:
      ${[entry.formation && "Formation " + esc(entry.formation), entry.keyThreat && "gefährlich: " + esc(entry.keyThreat), entry.weaknesses && "Schwachstellen: " + esc(entry.weaknesses.split("\n")[0])].filter(Boolean).join(" · ") || '<span class="muted">nur Notizen</span>'}</div>` : ""}
    <div class="oh-actions">
      ${fillable ? `<button class="btn btn-sm btn-accent" data-opp-apply>Analyse in leere Felder übernehmen</button>` : ""}
      <button class="btn btn-sm btn-ghost" data-opp-open="${esc(name)}">Details</button>
    </div>`;
}
function applyOpponentToPrep(name){
  const e = opponentEntry(name); if(!e) return 0;
  const nm = state.nextMatch; let n = 0;
  [["formation","formation"],["keyThreat","keyThreat"],["weaknesses","weaknesses"]].forEach(([a,b])=>{ if(e[a] && !nm[b]){ nm[b] = e[a]; n++; } });
  saveState(); renderFixtures(); renderHome();
  return n;
}
function renderOpponentDb(){
  const box = qs("#oppDb"); if(!box) return;
  const q = (qs("#oppSearch").value || "").trim().toLowerCase();
  const rows = allOpponents().filter(n=>!q || n.toLowerCase().includes(q)).map(n=>({name:n, st:opponentStats(n), e:opponentEntry(n)}))
    .sort((a,b)=>((b.st.list[0]||{}).date||"").localeCompare((a.st.list[0]||{}).date||"") || a.name.localeCompare(b.name,"de"));
  box.innerHTML = rows.length ? `<div class="table-wrap"><table class="res-table opp-table"><thead><tr>
      <th>Gegner</th><th class="num">Spiele</th><th>Bilanz</th><th class="num">P/Sp</th><th class="num">Tore</th><th>Zuletzt</th><th>Meist</th><th>Analyse / Notizen</th><th></th></tr></thead><tbody>
    ${rows.map(({name, st, e})=>`<tr data-opp="${esc(name)}">
      <td><strong>${esc(name)}</strong></td>
      <td class="num">${st.rec ? st.rec.n : 0}</td>
      <td>${st.rec ? recordBadges(st.rec) : '<span class="muted small">—</span>'}</td>
      <td class="num">${st.rec ? fmtNum(st.rec.ppg,2) : "—"}</td>
      <td class="num">${st.rec ? st.rec.gf+":"+st.rec.ga : "—"}</td>
      <td>${st.list[0] ? `<span class="score ${resultOf(st.list[0])}">${st.list[0].gf}:${st.list[0].ga}</span> <span class="muted small">${st.list[0].date ? fmtDate(st.list[0].date,{day:"2-digit",month:"2-digit",year:"2-digit"}) : ""}</span>` : "—"}</td>
      <td class="muted">${esc((e && e.formation) || st.formation) || "—"}</td>
      <td class="opp-notes">${e ? esc([e.keyThreat, e.weaknesses, e.notes].filter(Boolean).join(" · ").slice(0,90)) || '<span class="muted small">—</span>' : '<span class="muted small">—</span>'}</td>
      <td><span class="row-actions"><button class="btn-icon-sm" data-opp-open="${esc(name)}" title="Details & Notizen" aria-label="${esc(name)} öffnen">✎</button>
        <button class="btn-icon-sm" data-opp-next="${esc(name)}" title="Als nächsten Gegner vorbereiten" aria-label="${esc(name)} als nächsten Gegner">➜</button></span></td>
    </tr>`).join("")}</tbody></table></div>
    <p class="hint">Die Bilanz kommt automatisch aus deinen Ergebnissen. Deine Analyse aus der Spieltag-Vorbereitung wird beim Eintragen des Ergebnisses hier gespeichert und beim nächsten Duell wieder angeboten.</p>`
    : `<p class="empty">${q ? "Kein Gegner passt zur Suche." : "Noch keine Gegner. Sie erscheinen automatisch, sobald du Ergebnisse einträgst."}</p>`;
}
function openOpponentModal(name){
  const e = opponentEntry(name) || {formation:"", keyThreat:"", weaknesses:"", notes:""};
  const st = opponentStats(name);
  openModal({
    title: `Gegner: ${name}`,
    wide: true,
    body: `
      ${st.rec ? `<div class="oh-line" style="margin-bottom:10px"><strong>Bilanz:</strong> ${recordBadges(st.rec)} <span class="muted">${st.rec.n} Spiele · Tore ${st.rec.gf}:${st.rec.ga} · ${fmtNum(st.rec.ppg,2)} Punkte pro Spiel</span></div>` : ""}
      <div class="field-row">
        <div class="field"><label>Typische Formation</label><input data-f="formation" value="${esc(e.formation || st.formation)}" placeholder="z. B. 4-2-3-1"></div>
        <div class="field" style="flex:2"><label>Gefährlichster Spieler</label><input data-f="keyThreat" value="${esc(e.keyThreat)}"></div>
      </div>
      <div class="field"><label>Schwachstellen</label><textarea data-f="weaknesses" rows="3">${esc(e.weaknesses)}</textarea></div>
      <div class="field"><label>Notizen</label><textarea data-f="notes" rows="3" placeholder="Was hat funktioniert, was nicht?">${esc(e.notes)}</textarea></div>
      ${st.list.length ? `<h4 class="imp-h">Alle Spiele</h4><table class="res-table"><tbody>${st.list.map(r=>`<tr>
        <td class="muted">${r.date ? fmtDate(r.date,{day:"2-digit",month:"2-digit",year:"2-digit"}) : "—"}</td><td><span class="venue-tag">${r.venue}</span></td>
        <td><span class="score ${resultOf(r)}">${r.gf}:${r.ga}</span></td><td>${esc(planDisplayName(r))}</td><td class="muted">${esc(r.oppFormation) || ""}</td><td class="muted">${esc(r.season)}</td></tr>`).join("")}</tbody></table>` : ""}`,
    leftButtons: `<button class="btn" data-opp-modal-next>Als nächsten Gegner vorbereiten</button>`,
    onOpen: m=>{
      qs("[data-opp-modal-next]", m).onclick = ()=>{
        const f = k => qs(`[data-f="${k}"]`, m).value;
        upsertOpponent(name, {formation:f("formation"), keyThreat:f("keyThreat"), weaknesses:f("weaknesses"), notes:f("notes")});
        closeModal(); prepareNextOpponent(name);
      };
    },
    saveLabel: "Speichern",
    onSave: get=>{
      const o = upsertOpponent(name, {});
      ["formation","keyThreat","weaknesses","notes"].forEach(k=>{ o[k] = get(k).trim(); });   // allow clearing fields
      saveState(); renderFixtures(); toast(`Analyse zu ${name} gespeichert`);
    }
  });
}
function prepareNextOpponent(name){
  const nm = state.nextMatch;
  if(normName(nm.opponent) !== normName(name)){
    Object.assign(nm, {opponent:name, formation:"", keyThreat:"", weaknesses:"", subs:[]});
  }
  const n = applyOpponentToPrep(name);
  navigate("fixtures"); renderFixtures();
  toast(`${name} als nächster Gegner vorbereitet${n ? ` – ${n} Felder aus der Analyse übernommen` : ""}`);
}

/* ---------- Saisonvergleich ---------- */
function seasonWindow(label){
  const m = /^(\d{4})/.exec(label || ""); if(!m) return null;
  const y = +m[1]; return {from:`${y}-07-01`, to:`${y+1}-06-30`};
}
function seasonCompareRows(){
  const labels = new Set([state.club.season]);
  state.seasons.forEach(x=>labels.add(x.season));
  state.results.forEach(r=>{ if(r.season) labels.add(r.season); });
  state.transferLog.forEach(t=>{ if(t.season) labels.add(t.season); });
  return [...labels].filter(Boolean).sort().reverse().map(label=>{
    const arch = state.seasons.find(x=>x.season === label), current = label === state.club.season;
    const res = state.results.filter(r=>r.season === label);
    const rec = res.length ? groupRecord(res, ()=>"all", ()=>"")[0] : null;
    const tl = state.transferLog.filter(t=>t.season === label);
    const net = tl.length ? tl.reduce((a,t)=>a + (t.type === "out" ? t.fee : -t.fee), 0) : null;
    const win = seasonWindow(label);
    const bal = win ? state.balanceLog.filter(b=>b.date >= win.from && b.date <= win.to).sort((a,b)=>a.date.localeCompare(b.date)).pop() : null;
    const avgAge = current ? (state.players.length ? state.players.reduce((a,p)=>a+p.age,0)/state.players.length : null) : (arch ? arch.avgAge : null);
    return {label, current, position: arch ? arch.position : "", rec, net, balance: bal ? bal.amount : null,
      squad: current ? state.players.length : (arch ? arch.squadSize : null), avgAge,
      wages: current ? state.players.reduce((a,p)=>a+p.salary,0) : (arch && arch.wages ? arch.wages : null)};
  });
}
function renderSeasonCompare(){
  const box = qs("#seasonCompare"); if(!box) return;
  const rows = seasonCompareRows();
  const solid = rows.filter(r=>r.rec && r.rec.n >= 3);
  const best = solid.length > 1 ? Math.max(...solid.map(r=>r.rec.ppg)) : null;
  box.innerHTML = `<div class="table-wrap"><table class="res-table season-table"><thead><tr>
      <th>Saison</th><th>Platz</th><th class="num">Spiele</th><th>Bilanz</th><th>Punkte/Spiel</th><th class="num">Tore</th>
      <th class="num">Transfersaldo</th><th class="num">Kontostand</th><th class="num">Kader</th><th class="num">Ø Alter</th><th class="num">Gehälter${wageSuffix()}</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.current ? "current" : ""}">
      <td><strong>${esc(r.label)}</strong>${r.current ? ' <span class="badge ok">läuft</span>' : ""}</td>
      <td>${esc(r.position) || (r.current ? '<span class="muted small">offen</span>' : "—")}</td>
      <td class="num">${r.rec ? r.rec.n : 0}</td>
      <td>${r.rec ? recordBadges(r.rec) : '<span class="muted small">—</span>'}</td>
      <td>${r.rec ? `<span class="ppg-cell"><span class="rec-bar"><span style="width:${Math.round(r.rec.ppg/3*100)}%" class="${best !== null && r.rec.n >= 3 && r.rec.ppg === best ? "best" : ""}"></span></span>${fmtNum(r.rec.ppg,2)}</span>` : "—"}</td>
      <td class="num">${r.rec ? `${r.rec.gf}:${r.rec.ga}` : "—"}</td>
      <td class="num ${r.net === null ? "" : r.net < 0 ? "neg-t" : "pos-t"}">${r.net === null ? "—" : (r.net >= 0 ? "+" : "−") + fmtEUR(Math.abs(r.net))}</td>
      <td class="num">${r.balance === null ? "—" : fmtEUR(r.balance)}</td>
      <td class="num">${r.squad === null ? "—" : r.squad}</td>
      <td class="num">${r.avgAge === null || !r.avgAge ? "—" : fmtNum(r.avgAge,1)}</td>
      <td class="num">${r.wages === null ? "—" : fmtEUR(wageToUnit(r.wages))}</td>
    </tr>`).join("")}</tbody></table></div>
    <p class="hint">Quellen: Saison-Archiv (Platzierung, Kader), Ergebnisse, Transfer-Historie und Kontostände (letzter Eintrag der Saison, 1.7.–30.6.). Gehälter werden ab jetzt beim Saisonabschluss mitgespeichert.</p>`;
}

function initPhase10(){
  qs("#oppSearch").addEventListener("input", renderOpponentDb);
  document.addEventListener("click", e=>{
    const open = e.target.closest("[data-opp-open]");
    if(open){ openOpponentModal(open.dataset.oppOpen); return; }
    const next = e.target.closest("[data-opp-next]");
    if(next){ prepareNextOpponent(next.dataset.oppNext); return; }
    if(e.target.closest("[data-opp-apply]")){
      const n = applyOpponentToPrep(state.nextMatch.opponent);
      toast(n ? `${n} Felder aus der gespeicherten Analyse übernommen` : "Nichts zu übernehmen – die Felder sind schon ausgefüllt.");
    }
  });
}


/* ==========================================================================
   AUTOMATISCHE SICHERUNG IN EINEN ORDNER (File System Access API, Chromium)
   The folder handle lives in IndexedDB (handles can't go into localStorage).
   Chromium usually asks again for write permission after a browser restart for
   locally opened files → the header pill "Sicherung fortsetzen" makes that visible.
   ========================================================================== */
const BACKUP_CFG_KEY = "fm27_backup";
const BACKUP_DELAY = 20000;                    // bundle changes: write 20 s after the last save
let backupDir = null, backupPerm = "none";     // none | granted | prompt | denied | unsupported
let backupTimer = null, backupBusy = false, backupError = "";
const fsSupported = () => typeof window.showDirectoryPicker === "function";
function backupCfg(){ const c = readJSON(BACKUP_CFG_KEY); return (c && typeof c === "object") ? c : {}; }
function saveBackupCfg(c){ try{ store.setItem(BACKUP_CFG_KEY, JSON.stringify(c)); }catch(e){} }

/* small IndexedDB key-value store (with in-memory fallback, e.g. for tests) */
const _memKV = {};
function kvOpen(){
  return new Promise((res, rej)=>{
    if(!window.indexedDB) return rej(new Error("no indexedDB"));
    const r = indexedDB.open("fm27_fs", 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore("kv");
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error);
  });
}
async function kvGet(k){
  try{ const db = await kvOpen(); return await new Promise(res=>{ const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = ()=>res(q.result || null); q.onerror = ()=>res(null); }); }
  catch(e){ return _memKV[k] || null; }
}
async function kvSet(k, v){
  try{ const db = await kvOpen(); await new Promise((res, rej)=>{ const tx = db.transaction("kv","readwrite"); v === null ? tx.objectStore("kv").delete(k) : tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = ()=>rej(tx.error); }); }
  catch(e){ if(v === null) delete _memKV[k]; else _memKV[k] = v; }
}

const safeFileName = t => String(t || "Spielstand").normalize("NFC").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 60) || "Spielstand";
const todayReal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

async function initFolderBackup(){
  if(!fsSupported()){ backupPerm = "unsupported"; renderBackupPill(); return; }
  const h = await kvGet("backupDir");
  if(!h){ backupPerm = "none"; renderBackupPill(); return; }
  backupDir = h;
  try{ backupPerm = await h.queryPermission({mode:"readwrite"}); }catch(e){ backupPerm = "prompt"; }
  if(backupPerm !== "granted"){ clearTimeout(backupTimer); backupTimer = null; }   // nothing can be written until confirmed
  renderBackupPill();
  if(backupPerm === "granted") scheduleFolderBackup(2000);
}
async function chooseBackupFolder(){
  if(!fsSupported()){ toast("Dein Browser erlaubt kein Schreiben in Ordner – bitte regelmäßig „Export“ nutzen."); return false; }
  let h;
  try{ h = await window.showDirectoryPicker({id:"fm27-backup", mode:"readwrite"}); }
  catch(e){ if(e && e.name !== "AbortError") toast("Ordner konnte nicht geöffnet werden: " + (e.message || e.name)); return false; }
  backupDir = h; backupPerm = "granted";
  await kvSet("backupDir", h);
  const c = backupCfg(); c.enabled = true; c.dirName = h.name; c.keepDays = c.keepDays || 14; saveBackupCfg(c);
  const ok = await writeFolderBackup("Ordner verbunden");
  if(ok) toast(`Automatische Sicherung aktiv – Ordner „${h.name}“`);
  if(adminVisible()) renderAdmin();
  return ok;
}
async function resumeFolderBackup(){
  if(!backupDir) return false;
  try{ backupPerm = await backupDir.requestPermission({mode:"readwrite"}); }catch(e){ backupPerm = "prompt"; }
  renderBackupPill();
  if(backupPerm === "granted"){ const ok = await writeFolderBackup("Fortgesetzt"); if(ok) toast("Sicherung fortgesetzt"); return ok; }
  toast("Ohne Schreibrecht kann nicht gesichert werden – bitte im Dialog „Bearbeiten erlauben“ wählen.");
  return false;
}
async function disconnectBackupFolder(){
  clearTimeout(backupTimer); backupTimer = null;
  backupDir = null; backupPerm = "none";
  await kvSet("backupDir", null);
  const c = backupCfg(); c.enabled = false; saveBackupCfg(c);
  renderBackupPill();
}
/** Called after every successful save: one backup 20 s after the last change. */
function scheduleFolderBackup(delay){
  if(!backupDir || backupPerm !== "granted" || !backupCfg().enabled) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(()=>{ backupTimer = null; writeFolderBackup("Automatisch"); }, delay === undefined ? BACKUP_DELAY : delay);
  renderBackupPill();
}
async function writeTextFile(dir, name, text){
  const fh = await dir.getFileHandle(name, {create:true});
  const w = await fh.createWritable();          // written to a temporary file, committed on close → no half-written backups
  await w.write(text);
  await w.close();
}
function backupPayload(slotMeta, data){
  return JSON.stringify({app:"FM27 Manager Dashboard", schemaVersion:SCHEMA_VERSION, exportedAt:new Date().toISOString(),
    slotName: slotMeta ? slotMeta.name : "", backup:"auto", data}, null, 1);
}
/* 11.8.2: everything that belongs to NO single save – hub, game diary (with images), hotkeys, layout – gets its own
   backup file. Written only when it changed (images can make it big). The admin PIN is left out on purpose. */
const GLOBAL_BASE = "fm27__hub-und-tagebuch";
let lastGlobalSig = "";
function globalBackupKeys(){
  const keys = [HUB_KEY, DIARY_KEY, CAREER_KEY, HOTKEY_KEY, LAYOUT_KEY, COL_KEY].filter(k=>store.getItem(k) !== null);
  for(let i = 0; i < store.length; i++){ const k = store.key(i); if(k && k.startsWith(IMG_PREFIX)) keys.push(k); }
  return keys;
}
const globalSignature = () => globalBackupKeys().map(k=>k.startsWith(IMG_PREFIX) ? k : k + "=" + store.getItem(k)).join("\u0001");
function globalBackupPayload(){
  return JSON.stringify({app:"FM27 Manager Dashboard", kind:"global", version:APP_VERSION, exportedAt:new Date().toISOString(), backup:"auto",
    storage:Object.fromEntries(globalBackupKeys().map(k=>[k, store.getItem(k)]))});
}
/** Writes "<Spielstand>_aktuell.json" + a daily copy, then removes daily copies older than keepDays. */
async function writeFolderBackup(reason, allSlots){
  if(!backupDir || backupPerm !== "granted" || backupBusy) return false;
  backupBusy = true;
  clearTimeout(backupTimer); backupTimer = null;          // this write covers any pending one
  try{
    if(_saveTimer) saveState();
    const c = backupCfg(), day = todayReal(), keep = c.keepDays || 14;
    const slots = allSlots ? slotIndex.slots : [activeSlotMeta()].filter(Boolean);
    for(const meta of slots){
      const data = meta.id === slotIndex.active ? state : readJSON(SLOT_PREFIX + meta.id);
      if(!data) continue;
      const base = "fm27_" + safeFileName(meta.name), text = backupPayload(meta, data);
      await writeTextFile(backupDir, `${base}_aktuell.json`, text);
      await writeTextFile(backupDir, `${base}_${day}.json`, text);
      await pruneFolderBackups(base, keep);
    }
    const sig = globalSignature();
    if(allSlots || reason === "Manuell" || sig !== lastGlobalSig){
      const text = globalBackupPayload();
      await writeTextFile(backupDir, `${GLOBAL_BASE}_aktuell.json`, text);
      await writeTextFile(backupDir, `${GLOBAL_BASE}_${day}.json`, text);
      await pruneFolderBackups(GLOBAL_BASE, keep);
      lastGlobalSig = sig;
    }
    c.lastAt = Date.now(); c.lastReason = reason; c.lastError = ""; saveBackupCfg(c);
    backupError = "";
    const meta = activeSlotMeta(); if(meta){ meta.lastExport = Date.now(); writeIndex(); }   // counts as a backup for the reminder
    return true;
  }catch(e){
    backupError = (e && (e.message || e.name)) || "unbekannter Fehler";
    if(e && (e.name === "NotAllowedError" || e.name === "SecurityError")){ backupPerm = "prompt"; clearTimeout(backupTimer); backupTimer = null; }
    const c = backupCfg(); c.lastError = backupError; saveBackupCfg(c);
    toast("Automatische Sicherung fehlgeschlagen: " + backupError, {duration:6000});
    return false;
  }finally{
    backupBusy = false;
    renderBackupPill();
    if(adminVisible() && ["backup","home"].includes(adminTab)) renderAdmin();
  }
}
async function pruneFolderBackups(base, keepDays){
  const re = new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "_(\\d{4}-\\d{2}-\\d{2})\\.json$");
  const dated = [];
  for await (const [name] of backupDir.entries()){ const m = re.exec(name); if(m) dated.push({name, day:m[1]}); }
  dated.sort((a,b)=>b.day.localeCompare(a.day));
  for(const f of dated.slice(keepDays)) await backupDir.removeEntry(f.name);
}
async function listFolderBackups(){
  if(!backupDir || backupPerm !== "granted") return [];
  const out = [];
  for await (const [name, h] of backupDir.entries()){
    if(h.kind !== "file" || !/^fm27_.+\.json$/.test(name)) continue;
    const f = await h.getFile();
    out.push({name, size:f.size, modified:f.lastModified, handle:h});
  }
  return out.sort((a,b)=>b.modified - a.modified);
}
/** Browsers may not open the Explorer or reveal the full path – but the system file dialog can start
    INSIDE the backup folder: you see all backups there, and picking one restores it (with confirmation). */
async function showBackupFolder(){
  if(!backupDir){ toast("Noch kein Sicherungsordner gewählt."); return; }
  if(!window.showOpenFilePicker){ toast("Dein Browser kann das Datei-Fenster nicht öffnen – bitte Vivaldi, Chrome oder Edge verwenden."); return; }
  try{
    const [h] = await window.showOpenFilePicker({startIn: backupDir, multiple:false, types:[{description:"FM27-Sicherung", accept:{"application/json":[".json"]}}]});
    handleBackupText(await (await h.getFile()).text());
  }catch(e){
    if(e && e.name === "AbortError") return;                 // dialog closed – nothing to do
    toast("Ordner konnte nicht geöffnet werden: " + ((e && (e.message || e.name)) || "unbekannter Fehler"));
  }
}
async function loadFolderBackup(name){
  const f = await (await backupDir.getFileHandle(name)).getFile();
  handleBackupText(await f.text());
}

function renderBackupPill(){
  const el = qs("#backupPill"); if(!el) return;
  const c = backupCfg();
  el.className = "backup-pill";
  if(backupPerm === "unsupported" || (!backupDir && !c.enabled)){ el.hidden = true; return; }
  el.hidden = false;
  if(backupPerm === "prompt" || backupPerm === "denied"){
    el.classList.add("paused"); el.textContent = "☁ Sicherung fortsetzen";
    el.title = `Automatische Sicherung in „${c.dirName || "Ordner"}“ pausiert – der Browser braucht deine Bestätigung. Klicken zum Fortsetzen.`;
  } else if(backupError){
    el.classList.add("error"); el.textContent = "☁ Sicherung: Fehler";
    el.title = backupError + " – klicken für Details";
  } else if(backupPerm === "granted"){
    el.classList.add(backupTimer ? "pending" : "ok");
    el.textContent = backupTimer ? "☁ sichert gleich…" : (c.lastAt ? `☁ gesichert ${new Date(c.lastAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}` : "☁ bereit");
    el.title = `Automatische Sicherung in „${c.dirName || "Ordner"}“${c.lastAt ? " · zuletzt " + tsText(c.lastAt) : ""} – klicken zum Einrichten`;
  } else { el.hidden = true; }
}
function backupCardHTML(){
  const c = backupCfg();
  if(!fsSupported()) return `<div class="card backup-card"><div class="card-head"><h2>Automatische Sicherung in einen Ordner</h2></div>
    <p class="empty" style="margin:0">Dein Browser unterstützt das Schreiben in Ordner nicht (geht in Chromium-Browsern wie Chrome, Edge, Vivaldi). Bitte regelmäßig über „Export“ sichern.</p></div>`;
  const status = backupPerm === "granted" ? `<span class="badge ok">aktiv</span> Ordner <strong>${esc(c.dirName || (backupDir && backupDir.name) || "")}</strong>${c.lastAt ? ` · zuletzt ${esc(tsText(c.lastAt))} (${esc(c.lastReason || "")})` : ""}`
    : (backupPerm === "prompt" || backupPerm === "denied") ? `<span class="badge unhappy">pausiert</span> Ordner <strong>${esc(c.dirName || "")}</strong> – der Browser möchte die Schreiberlaubnis bestätigt haben.`
    : `<span class="muted">Noch kein Ordner verbunden.</span>`;
  return `<div class="card backup-card">
    <div class="card-head"><h2>Automatische Sicherung in einen Ordner</h2></div>
    <p class="lead" style="margin:0 0 10px">${status}</p>
    ${backupError ? `<p class="pin-msg" style="margin:0 0 8px">Letzter Fehler: ${esc(backupError)}</p>` : ""}
    <div class="toolbar" style="margin-bottom:8px">
      ${backupPerm === "granted" ? `<button class="btn btn-sm" data-bk="open" title="Öffnet das Datei-Fenster direkt im Sicherungsordner">📂 Ordner anzeigen</button><button class="btn btn-sm btn-accent" data-bk="now">Jetzt sichern</button><button class="btn btn-sm" data-bk="all">Alle Spielstände sichern</button><button class="btn btn-sm" data-bk="choose">Anderen Ordner wählen</button>`
        : (backupPerm === "prompt" || backupPerm === "denied") ? `<button class="btn btn-sm btn-accent" data-bk="resume">Sicherung fortsetzen</button><button class="btn btn-sm" data-bk="choose">Anderen Ordner wählen</button>`
        : `<button class="btn btn-sm btn-accent" data-bk="choose">Ordner wählen …</button>`}
      ${backupDir ? `<button class="btn btn-sm btn-ghost" data-bk="disconnect">Trennen</button>` : ""}
      <span class="spacer"></span>
      <label class="check-label">Tageskopien behalten <select autocomplete="off" data-bk-keep>${options({7:"7 Tage",14:"14 Tage",30:"30 Tage",90:"90 Tage"}, String(c.keepDays || 14))}</select></label>
    </div>
    <div id="folderBackupList"></div>
    <p class="hint">Tipp: Einen Ordner in OneDrive, Google Drive oder Dropbox wählen – dann liegt die Sicherung auch in der Cloud, und auf einem zweiten Gerät lädst du hier einfach die neueste Datei. Pro Spielstand gibt es eine immer aktuelle Datei plus eine Kopie je Tag. Gesichert wird ~20 Sekunden nach deiner letzten Änderung. Wichtig bei zwei Geräten: immer nur auf einem gleichzeitig arbeiten, sonst überschreibt die neuere Sicherung die andere.</p>
  </div>`;
}
/* ---------- 11.1: backup files grouped per save ----------
   fm27_<save>_aktuell.json + fm27_<save>_<YYYY-MM-DD>.json belong to a save of the dashboard;
   everything else is sorted into "no save in the dashboard", old journey files and "other files". */
function bkWhen(ts){
  const d = new Date(ts), now = new Date(), t = d.toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"});
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if(diff === 0) return `heute, ${t}`;
  if(diff === 1) return `gestern, ${t}`;
  return `${d.toLocaleDateString("de-DE", {weekday:"short", day:"2-digit", month:"2-digit"})}${d.getFullYear() !== now.getFullYear() ? d.getFullYear() : ""}, ${t}`;
}
function groupBackupFiles(files){
  const esc2 = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sums = slotSummaries(), used = new Set(), groups = [];
  sums.forEach(x=>{
    const base = "fm27_" + safeFileName(x.name), re = new RegExp("^" + esc2(base) + "_(aktuell|\\d{4}-\\d{2}-\\d{2})\\.json$");
    const mine = files.filter(f=>!used.has(f.name) && re.test(f.name));
    mine.forEach(f=>used.add(f.name));
    const current = mine.find(f=>/_aktuell\.json$/.test(f.name)) || null;
    const daily = mine.filter(f=>f !== current).sort((a,b)=>b.name.localeCompare(a.name));
    groups.push({kind:"save", sum:x, current, daily, files:mine});
  });
  const globRe = new RegExp("^" + esc2(GLOBAL_BASE) + "_(aktuell|\\d{4}-\\d{2}-\\d{2})\\.json$");
  const globFiles = files.filter(f=>globRe.test(f.name)); globFiles.forEach(f=>used.add(f.name));
  const global = {current:globFiles.find(f=>/_aktuell\.json$/.test(f.name)) || null, daily:globFiles.filter(f=>!/_aktuell\.json$/.test(f.name)).sort((a,b)=>b.name.localeCompare(a.name))};
  const rest = files.filter(f=>!used.has(f.name));
  const orphans = {}, journey = [], other = [];
  rest.forEach(f=>{
    if(/^fm27_journey_/.test(f.name)){ journey.push(f); return; }
    const m = /^fm27_(.+)_(aktuell|\d{4}-\d{2}-\d{2})\.json$/.exec(f.name);
    if(m) (orphans[m[1]] = orphans[m[1]] || []).push(f); else other.push(f);
  });
  // active save first, then by newest backup; saves without any backup last
  groups.sort((a,b)=>(b.sum.active - a.sum.active) || (!!b.current - !!a.current) || ((b.current ? b.current.modified : 0) - (a.current ? a.current.modified : 0)));
  return {global, saves:groups, orphans:Object.entries(orphans).map(([name, list])=>({name, files:list.sort((a,b)=>b.modified - a.modified)})).sort((a,b)=>b.files[0].modified - a.files[0].modified),
    journey:journey.sort((a,b)=>b.modified - a.modified), other:other.sort((a,b)=>b.modified - a.modified)};
}
const bkLoadBtn = (f, label) => `<button class="btn btn-sm" data-bk-load="${esc(f.name)}" title="${esc(f.name)}">${label || "Laden …"}</button>`;
const bkRow = f => `<div class="bk-row"><span class="bk-row-main"><strong>${esc(bkWhen(f.modified))}</strong><span class="muted small">${esc(f.name)}</span></span><span class="muted small">${fmtBytes(f.size)}</span>${bkLoadBtn(f)}</div>`;
async function renderFolderBackupList(){
  const box = qs("#folderBackupList"); if(!box) return;
  if(backupPerm !== "granted"){ box.innerHTML = ""; return; }
  let files = [];
  try{ files = await listFolderBackups(); }catch(e){ box.innerHTML = `<p class="pin-msg">Ordner konnte nicht gelesen werden: ${esc(e.message || e.name)}</p>`; return; }
  if(!files.length){ box.innerHTML = `<p class="empty">Noch keine Sicherungen in diesem Ordner.</p>`; return; }
  const g = groupBackupFiles(files), total = files.reduce((a,f)=>a + f.size, 0);
  const saved = g.saves.filter(x=>x.current).length;
  const orphanCount = g.orphans.reduce((a,o)=>a + o.files.length, 0);
  box.innerHTML = `
    <div class="bk-summary"><span><strong>${saved}</strong> von ${g.saves.length} Spielständen gesichert</span><span>${files.length} Dateien</span><span>${fmtBytes(total)}</span></div>
    <div class="bk-saves">
      <article class="bk-card bk-global ${g.global.current ? "" : "missing"}">
        <div class="bk-card-head"><span class="sm-crest bk-global-icon" aria-hidden="true">🎮</span><div class="bk-card-title"><strong>Hub, Tagebuch &amp; Einstellungen</strong><span class="muted small">Tagebuch, Bilder, Karrieren, Kürzel, Layout</span></div></div>
        ${g.global.current ? `<div class="bk-current"><div><span class="muted small">Aktueller Stand</span><strong>${esc(bkWhen(g.global.current.modified))}</strong><span class="muted small">${fmtBytes(g.global.current.size)}</span></div>${bkLoadBtn(g.global.current)}</div>`
          : `<div class="bk-current none"><span>Noch nicht im Ordner gesichert.</span><button class="btn btn-sm btn-accent" data-bk="all">Jetzt sichern</button></div>`}
        ${g.global.daily.length ? `<details class="bk-daily"><summary>${g.global.daily.length} Tageskopie${g.global.daily.length === 1 ? "" : "n"} <span class="muted small">(${esc(g.global.daily.slice(-1)[0].name.slice(-15, -5).split("-").reverse().slice(0,2).join("."))}. – ${esc(g.global.daily[0].name.slice(-15, -5).split("-").reverse().slice(0,2).join("."))}.)</span></summary>${g.global.daily.map(bkRow).join("")}</details>` : ""}
      </article>
      ${g.saves.map(x=>`<article class="bk-card ${x.sum.active ? "active" : ""} ${x.current ? "" : "missing"}">
        <div class="bk-card-head">${smCrest(x.sum)}<div class="bk-card-title"><strong>${esc(x.sum.name)}</strong><span class="muted small">${esc(x.sum.club)}${x.sum.mode === "national" ? " · Nationalteam" : ""}</span></div>
          ${x.sum.active ? '<span class="sm-badge ok">aktiv</span>' : ""}</div>
        ${x.current ? `<div class="bk-current"><div><span class="muted small">Aktueller Stand</span><strong>${esc(bkWhen(x.current.modified))}</strong><span class="muted small">${fmtBytes(x.current.size)}</span></div>${bkLoadBtn(x.current)}</div>`
          : `<div class="bk-current none"><span>Noch keine Sicherung im Ordner.</span><button class="btn btn-sm btn-accent" data-bk="all">Jetzt alle sichern</button></div>`}
        ${x.daily.length ? `<details class="bk-daily"><summary>${x.daily.length} Tageskopie${x.daily.length === 1 ? "" : "n"} <span class="muted small">(${esc(x.daily.map(f=>f.name.slice(-15, -5)).slice(-1)[0].split("-").reverse().slice(0,2).join("."))}. – ${esc(x.daily[0].name.slice(-15, -5).split("-").reverse().slice(0,2).join("."))}.)</span></summary>${x.daily.map(bkRow).join("")}</details>` : ""}
      </article>`).join("")}</div>
    ${orphanCount ? `<details class="bk-extra"><summary>Dateien ohne Spielstand im Dashboard <span class="muted small">${g.orphans.length} Name${g.orphans.length === 1 ? "" : "n"} · ${orphanCount} Dateien – z. B. gelöschte oder umbenannte Spielstände</span></summary>
        ${g.orphans.map(o=>`<div class="bk-orphan"><div class="bk-orphan-head"><strong>${esc(o.name.replace(/_/g, " "))}</strong><span class="muted small">${o.files.length} Dateien · zuletzt ${esc(bkWhen(o.files[0].modified))}</span>
          ${bkLoadBtn(o.files[0], "Neueste laden …")}<button class="btn btn-sm btn-danger-outline" data-bk-del="${esc(o.files.map(f=>f.name).join("|"))}">Dateien löschen</button></div></div>`).join("")}
      </details>` : ""}
    ${g.journey.length ? `<details class="bk-extra"><summary>Alte Journey-Dateien <span class="muted small">${g.journey.length} Dateien – von vor 9.9.1, die Journey steckt heute im Spielstand</span></summary>
        ${g.journey.map(bkRow).join("")}<div class="bk-extra-foot"><button class="btn btn-sm btn-danger-outline" data-bk-del="${esc(g.journey.map(f=>f.name).join("|"))}">Alle ${g.journey.length} löschen</button></div></details>` : ""}
    ${g.other.length ? `<details class="bk-extra"><summary>Sonstige Dateien <span class="muted small">${g.other.length} – z. B. manuelle Exporte</span></summary>${g.other.map(bkRow).join("")}</details>` : ""}`;
}
/** Delete files from the backup folder (only offered for files that belong to no save). */
function deleteBackupFiles(names){
  openModal({title:`${names.length} Datei${names.length === 1 ? "" : "en"} löschen?`,
    body:`<p class="lead">Die Dateien werden <strong>endgültig</strong> aus dem Sicherungsordner gelöscht – das lässt sich nicht rückgängig machen.</p><ul class="bk-del-list">${names.slice(0,12).map(n=>`<li>${esc(n)}</li>`).join("")}${names.length > 12 ? `<li>… und ${names.length - 12} weitere</li>` : ""}</ul>`,
    saveLabel:"Endgültig löschen",
    onSave: async ()=>{
      let n = 0;
      for(const name of names){ try{ await backupDir.removeEntry(name); n++; }catch(e){ logError("Sicherungsdatei löschen", name + " " + (e.message || e.name)); } }
      toast(`${n} Datei${n === 1 ? "" : "en"} gelöscht`); renderAdmin();
    }});
}
function initFolderBackupUI(){
  qs("#backupPill").addEventListener("click", ()=>{
    if(backupPerm === "prompt" || backupPerm === "denied") resumeFolderBackup();
    else { adminTab = "restore"; navigate("admin"); }
  });
  qs("#adminRoot").addEventListener("click", async e=>{
    const er = e.target.closest("[data-err]");
    if(er){
      if(er.dataset.err === "clear"){ store.removeItem(ERROR_KEY); toast("Fehlerprotokoll geleert"); renderAdmin(); }
      else { const txt = JSON.stringify(readJSON(ERROR_KEY) || [], null, 1); try{ await navigator.clipboard.writeText(txt); toast("Bericht kopiert"); }catch(err){ toast("Kopieren nicht möglich – bitte manuell markieren."); } }
      return;
    }
    const b = e.target.closest("[data-bk]");
    if(b){
      const a = b.dataset.bk;
      if(a === "open"){ await showBackupFolder(); return; }
      if(a === "choose") await chooseBackupFolder();
      else if(a === "resume") await resumeFolderBackup();
      else if(a === "now"){ if(await writeFolderBackup("Manuell")) toast("Gesichert"); }
      else if(a === "all"){ if(await writeFolderBackup("Alle Spielstände", true)) toast(`${slotIndex.slots.length} Spielstände gesichert`); }
      else if(a === "disconnect"){ await disconnectBackupFolder(); toast("Ordner getrennt – die Dateien im Ordner bleiben erhalten."); }
      renderAdmin();
      return;
    }
    const del = e.target.closest("[data-bk-del]");
    if(del){ deleteBackupFiles(del.dataset.bkDel.split("|").filter(Boolean)); return; }
    const l = e.target.closest("[data-bk-load]");
    if(l){ try{ await loadFolderBackup(l.dataset.bkLoad); }catch(err){ toast("Datei konnte nicht gelesen werden: " + (err.message || err.name)); } }
  });
  qs("#adminRoot").addEventListener("change", e=>{
    const k = e.target.closest("[data-bk-keep]"); if(!k) return;
    const c = backupCfg(); c.keepDays = num(k.value, 14); saveBackupCfg(c); toast(`Tageskopien: ${c.keepDays} Tage`);
  });
  // leaving the tab / closing: write a pending backup right away
  document.addEventListener("visibilitychange", ()=>{
    if(document.hidden && backupTimer){ clearTimeout(backupTimer); backupTimer = null; writeFolderBackup("Beim Verlassen"); }
  });
  initFolderBackup();
}




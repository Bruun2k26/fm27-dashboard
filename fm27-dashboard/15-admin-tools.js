/* ==========================================================================
   ADMIN · FREE NOTES (global: for all saves, moves with "Alles exportieren")
   ========================================================================== */
const ADMIN_NOTES_KEY = "fm27_admin_notes";
let noteSel = null, noteTimer = null;
function readNotes(){
  const l = readJSON(ADMIN_NOTES_KEY);
  return Array.isArray(l) ? l.filter(n=>n && typeof n === "object").map(n=>({id:String(n.id || uid()), title:String(n.title || "").slice(0,80), text:String(n.text || ""), updatedAt:num(n.updatedAt, Date.now())})) : [];
}
function writeNotes(list){
  try{ store.setItem(ADMIN_NOTES_KEY, JSON.stringify(list)); return true; }
  catch(e){ toast("Notiz konnte nicht gespeichert werden – Speicher voll?"); return false; }
}
const noteTitle = n => n.title.trim() || (n.text.trim().split("\n")[0] || "").slice(0,40) || "Ohne Titel";
function adminNotes(){
  const notes = readNotes().sort((a,b)=>b.updatedAt - a.updatedAt);
  if(noteSel && !notes.some(n=>n.id === noteSel)) noteSel = null;
  if(!noteSel && notes.length) noteSel = notes[0].id;
  const cur = notes.find(n=>n.id === noteSel);
  qs("#adminBody").innerHTML = `
    <div class="lists-layout notes-admin">
      <nav class="lists-nav" aria-label="Notizen">
        <button class="btn btn-sm btn-accent" id="btnNoteNew" style="margin-bottom:6px">+ Neue Notiz</button>
        ${notes.map(n=>`<button class="${n.id === noteSel ? "active" : ""}" data-note="${esc(n.id)}"><span class="note-t">${esc(noteTitle(n))}</span><span class="muted small">${relTime(n.updatedAt)}</span></button>`).join("")
          || `<p class="empty small">Noch keine Notizen.</p>`}
      </nav>
      <div class="lists-body">
        ${cur ? `
          <input type="text" id="noteTitle" class="note-title" value="${esc(cur.title)}" placeholder="Titel (z. B. „Änderungen für 8.1“)" maxlength="80" aria-label="Titel">
          <textarea id="noteText" class="note-text" placeholder="Freie Notizen – Ideen, Roadmap, Merkzettel …" aria-label="Notiz">${esc(cur.text)}</textarea>
          <div class="note-foot"><span class="muted small" id="noteSaved">gespeichert ${esc(tsText(cur.updatedAt))}</span><span class="spacer"></span>
            <button class="btn btn-sm btn-danger-outline" id="btnNoteDel">Notiz löschen</button></div>`
          : `<div class="empty">Freie Notizen für alles rund ums Dashboard – z. B. Roadmap-Wünsche, Ideen oder Merkzettel. Sie gelten für alle Spielstände und ziehen beim Umzug mit.</div>`}
      </div>
    </div>`;
}
function saveCurrentNote(){
  clearTimeout(noteTimer); noteTimer = null;
  const t = qs("#noteTitle"), x = qs("#noteText"); if(!t || !x || !noteSel) return;
  const list = readNotes(), n = list.find(y=>y.id === noteSel); if(!n) return;
  if(n.title === t.value && n.text === x.value) return;
  n.title = t.value; n.text = x.value; n.updatedAt = Date.now();
  if(writeNotes(list)){
    const s2 = qs("#noteSaved"); if(s2) s2.textContent = "gespeichert " + tsText(n.updatedAt);
    const nav = qs(`[data-note="${noteSel}"] .note-t`); if(nav) nav.textContent = noteTitle(n);
  }
}
function initAdminNotes(){
  const root = qs("#adminRoot");
  root.addEventListener("input", e=>{
    if(e.target.id !== "noteTitle" && e.target.id !== "noteText") return;
    clearTimeout(noteTimer); noteTimer = setTimeout(saveCurrentNote, 400);
    const s2 = qs("#noteSaved"); if(s2) s2.textContent = "speichert …";
  });
  root.addEventListener("focusout", e=>{ if(e.target.id === "noteTitle" || e.target.id === "noteText") saveCurrentNote(); });
  root.addEventListener("click", e=>{
    if(e.target.closest("#btnNoteNew")){
      saveCurrentNote();
      const list = readNotes(), n = {id:uid(), title:"", text:"", updatedAt:Date.now()};
      list.push(n); writeNotes(list); noteSel = n.id; adminNotes();
      const t = qs("#noteTitle"); if(t) t.focus();
      return;
    }
    const pick = e.target.closest("[data-note]");
    if(pick){ saveCurrentNote(); noteSel = pick.dataset.note; adminNotes(); return; }
    if(e.target.closest("#btnNoteDel")){
      saveCurrentNote();
      const before = readNotes(), n = before.find(x=>x.id === noteSel);
      writeNotes(before.filter(x=>x.id !== noteSel)); noteSel = null; adminNotes();
      toast(`Notiz „${n ? noteTitle(n) : ""}“ gelöscht`, {onUndo:()=>{ writeNotes(before); noteSel = n && n.id; if(currentView === "admin" && adminTab === "notes") adminNotes(); }});
    }
  });
  window.addEventListener("beforeunload", saveCurrentNote);
}


/* ==========================================================================
   ADMIN · EIGENE FELDER (custom fields)
   ========================================================================== */
function cfUsage(id){
  return state.players.filter(p=>p.custom && p.custom[id] !== undefined).length
       + state.scouting.filter(t=>t.custom && t.custom[id] !== undefined).length;
}
function adminFields(){
  const defs = state.customFields;
  const typeSel = (attr, cur) => `<select ${attr}>${options(CF_TYPES, cur)}</select>`;
  qs("#adminBody").innerHTML = `
    <div class="card cf-admin">
      <div class="card-head"><h2>Eigene Felder</h2><span class="muted small">${defs.length} von ${CF_MAX}</span></div>
      <p class="lead" style="margin-top:0">Eigene Spalten für Kader und Scouting-Liste – z. B. „Homegrown“ (Ja/Nein), „Strafen“ (Zahl) oder „Scouting-Priorität“ (Auswahl). Sie erscheinen sofort in den Tabellen, lassen sich dort direkt bearbeiten und per Klick auf den Spaltenkopf sortieren.</p>
      ${defs.length ? `<div class="table-wrap"><table class="data-table cf-table"><thead><tr><th></th><th>Feldname</th><th>Typ</th><th>Auswahlwerte</th><th>Kader</th><th>Scouting</th><th>Werte</th><th></th></tr></thead><tbody>
        ${defs.map((d,i)=>`<tr data-cfi="${i}">
          <td class="le-move"><button class="btn-icon-sm" data-cfd-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button><button class="btn-icon-sm" data-cfd-down="${i}" ${i === defs.length-1 ? "disabled" : ""} aria-label="Nach unten">↓</button></td>
          <td data-label="Feldname"><input type="text" maxlength="40" value="${esc(d.name)}" data-cfd-name="${i}" aria-label="Feldname"></td>
          <td data-label="Typ">${typeSel(`data-cfd-type="${i}" aria-label="Typ"`, d.type)}</td>
          <td data-label="Auswahlwerte">${d.type === "select" ? `<input type="text" value="${esc(d.options.join(", "))}" data-cfd-opts="${i}" placeholder="A, B, C" aria-label="Auswahlwerte (kommagetrennt)">` : '<span class="muted small">—</span>'}</td>
          <td data-label="Kader"><input type="checkbox" data-cfd-area="${i}:squad" ${d.areas.includes("squad") ? "checked" : ""} aria-label="In der Kadertabelle zeigen"></td>
          <td data-label="Scouting"><input type="checkbox" data-cfd-area="${i}:scouting" ${d.areas.includes("scouting") ? "checked" : ""} aria-label="In der Scouting-Liste zeigen"></td>
          <td data-label="Werte" class="muted small">${cfUsage(d.id) || "—"}</td>
          <td><button class="btn-icon-sm del" data-cfd-del="${i}" aria-label="${esc(d.name)} löschen">✕</button></td>
        </tr>`).join("")}</tbody></table></div>` : `<p class="empty">Noch keine eigenen Felder.</p>`}
      <div class="cf-add">
        <input type="text" id="cfNewName" maxlength="40" placeholder="Feldname, z. B. Homegrown" aria-label="Neuer Feldname">
        ${typeSel('id="cfNewType" aria-label="Typ"', "text")}
        <input type="text" id="cfNewOpts" placeholder="Auswahlwerte: A, B, C" aria-label="Auswahlwerte" hidden>
        <label class="check-label"><input type="checkbox" id="cfNewSquad" checked> Kader</label>
        <label class="check-label"><input type="checkbox" id="cfNewScout"> Scouting</label>
        <button class="btn btn-sm btn-accent" id="btnCfAdd" ${defs.length >= CF_MAX ? "disabled" : ""}>+ Feld anlegen</button>
      </div>
      <p class="hint">Ein Haken bei „Kader“ bzw. „Scouting“ steuert nur, wo die Spalte erscheint – abgewählte Bereiche behalten ihre Werte. Beim FM-Import wird eine Datei-Spalte mit gleichem Namen automatisch diesem Feld zugeordnet; im CSV-Export sind die Kader-Felder dabei. Ein Transferziel nimmt seine Werte bei der Verpflichtung mit in den Kader.</p>
    </div>`;
}
/** Change a field definition; values are converted by the sanitizer (e.g. text → number). Undo + notice on losses. */
function updateField(i, patch, what){
  const before = JSON.stringify(state), def = state.customFields[i]; if(!def) return;
  const filled = cfUsage(def.id);
  const next = Object.assign({}, def, patch);
  // renaming options 1:1 (same number) keeps the values (A,B,C → A,Bee,C)
  if(def.type === "select" && next.type === "select" && patch.options && patch.options.length === def.options.length){
    const map = Object.fromEntries(def.options.map((o,k)=>[o, patch.options[k]]));
    state.players.concat(state.scouting).forEach(e=>{ if(e.custom && map[e.custom[def.id]]) e.custom[def.id] = map[e.custom[def.id]]; });
  }
  state.customFields[i] = next;
  state = sanitizeState(state);
  const after = cfUsage(next.id), lost = filled - after;
  saveState(); renderAll(); adminFields();
  toast(lost > 0 ? `${what}: ${lost} Wert${lost === 1 ? "" : "e"} passten nicht mehr und wurden geleert.` : `${what} gespeichert`,
    {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); if(adminTab === "fields") adminFields(); }, duration: lost > 0 ? 9000 : 5000});
}
function initAdminFields(){
  const root = qs("#adminRoot");
  root.addEventListener("change", e=>{
    const t = e.target;
    if(t.id === "cfNewType"){ const o = qs("#cfNewOpts"); if(o) o.hidden = t.value !== "select"; return; }
    if(t.dataset.cfdName !== undefined){
      const i = num(t.dataset.cfdName), name = t.value.trim().slice(0,40);
      if(!name || state.customFields.some((d,k)=>k !== i && d.name.toLowerCase() === name.toLowerCase())){ toast(name ? `„${name}“ gibt es schon.` : "Der Name darf nicht leer sein."); adminFields(); return; }
      updateField(i, {name}, "Name");
    }
    else if(t.dataset.cfdType !== undefined){
      const i = num(t.dataset.cfdType), def = state.customFields[i];
      updateField(i, {type:t.value, options: t.value === "select" ? (def.options.length ? def.options : ["Option 1"]) : []}, `Typ „${CF_TYPES[t.value]}“`);
    }
    else if(t.dataset.cfdOpts !== undefined){
      const opts = t.value.split(/[,;]/).map(x=>x.trim()).filter(Boolean);
      if(!opts.length){ toast("Mindestens ein Auswahlwert."); adminFields(); return; }
      updateField(num(t.dataset.cfdOpts), {options:opts}, "Auswahlwerte");
    }
    else if(t.dataset.cfdArea !== undefined){
      const [i, area] = t.dataset.cfdArea.split(":"), def = state.customFields[num(i)];
      let areas = new Set(def.areas); if(t.checked) areas.add(area); else areas.delete(area);
      if(!areas.size){ toast("Mindestens ein Bereich – sonst wäre die Spalte nirgends zu sehen."); t.checked = true; return; }
      updateField(num(i), {areas:[...areas]}, "Bereich");
    }
  });
  root.addEventListener("click", e=>{
    const t = e.target;
    if(t.closest("#btnCfAdd")){
      const name = qs("#cfNewName").value.trim().slice(0,40), type = qs("#cfNewType").value;
      const areas = [qs("#cfNewSquad").checked && "squad", qs("#cfNewScout").checked && "scouting"].filter(Boolean);
      if(!name){ toast("Bitte einen Feldnamen eingeben."); qs("#cfNewName").focus(); return; }
      if(state.customFields.some(d=>d.name.toLowerCase() === name.toLowerCase())){ toast(`„${name}“ gibt es schon.`); return; }
      if(!areas.length){ toast("Bitte Kader und/oder Scouting wählen."); return; }
      const options = type === "select" ? qs("#cfNewOpts").value.split(/[,;]/).map(x=>x.trim()).filter(Boolean) : [];
      if(type === "select" && !options.length){ toast("Bitte Auswahlwerte eingeben, z. B. „Hoch, Mittel, Niedrig“."); qs("#cfNewOpts").focus(); return; }
      const before = JSON.stringify(state);
      state.customFields.push({id:"f" + uid(), name, type, options, areas});
      state = sanitizeState(state); saveState(); renderAll(); adminFields();
      toast(`Feld „${name}“ angelegt – jetzt als Spalte in ${areas.map(a=>CF_AREAS[a]).join(" und ")}`, {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); adminFields(); }});
      return;
    }
    const up = t.closest("[data-cfd-up]"), down = t.closest("[data-cfd-down]");
    if(up || down){
      const i = num((up || down).dataset[up ? "cfdUp" : "cfdDown"]), j = up ? i-1 : i+1, a = state.customFields;
      [a[i], a[j]] = [a[j], a[i]]; saveState(); renderAll(); adminFields(); return;
    }
    const del = t.closest("[data-cfd-del]");
    if(del){
      const i = num(del.dataset.cfdDel), def = state.customFields[i], n = cfUsage(def.id);
      openModal({title:`Feld „${def.name}“ löschen?`,
        body:`<p class="lead">Die Spalte verschwindet aus ${def.areas.map(a=>CF_AREAS[a]).join(" und ")}${n ? `, und <strong>${n} eingetragene Wert${n === 1 ? "" : "e"}</strong> werden gelöscht` : ""}. Direkt danach kannst du es rückgängig machen.</p>`,
        saveLabel:"Feld löschen",
        onSave:()=>{
          const before = JSON.stringify(state);
          state.customFields.splice(i, 1);
          state = sanitizeState(state); saveState(); renderAll(); adminFields();
          toast(`Feld „${def.name}“ gelöscht`, {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); if(adminTab === "fields") adminFields(); }, duration:9000});
        }});
    }
  });
  root.addEventListener("keydown", e=>{ if(e.key === "Enter" && e.target.id === "cfNewName"){ e.preventDefault(); qs("#btnCfAdd").click(); } });
}


/* ==========================================================================
   ADMIN · WARTUNG & BATCH-TOOLS
   Every action: restore point + undo + log entry. Nothing is removed without a visible list.
   ========================================================================== */
/** "06/2027", "6.2027", "30.06.2027", "2027-06-30", "2027" → last day of that period (ISO) or null if unclear. */
function loanEndISO(txt){
  const t = String(txt || "").trim(); if(!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); if(m) return t;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  m = /^(\d{1,2})[./-](\d{4})$/.exec(t);
  if(m){ const mo = +m[1]; if(mo < 1 || mo > 12) return null; const last = new Date(+m[2], mo, 0).getDate(); return `${m[2]}-${String(mo).padStart(2,"0")}-${last}`; }
  m = /^(\d{4})$/.exec(t); if(m) return `${m[1]}-06-30`;
  return null;
}
function lineupPlayerIds(){
  const ids = new Set();
  state.plans.forEach(pl=>{ const b = planBlock(pl.id); Object.values(b.tactics || {}).forEach(t=>Object.values(t.slots || {}).forEach(sl=>{ if(sl && sl.playerId) ids.add(sl.playerId); })); });
  return ids;
}
/** Which of several duplicates to keep: in a line-up > birth date > transfer value > custom values > note > first. */
function keepScore(p, inXI){
  return (inXI.has(p.id) ? 1000 : 0) + (p.birthDate ? 50 : 0) + (p.valueMax ? 20 : 0) + Object.keys(p.custom || {}).length * 5 + (p.note ? 2 : 0);
}
/** Finds orphaned / leftover records. item = {coll, id | key, text, detail}; safe categories are preselected. */
function findOrphans(){
  const cats = [], add = (key, label, why, items, safe) => { if(items.length) cats.push({key, label, why, items, safe}); };
  const inXI = lineupPlayerIds();
  const squadNames = new Set(state.players.map(p=>normName(p.name)));
  // 1) duplicate players (e.g. after re-imports)
  const groups = {};
  state.players.forEach(p=>{ (groups[normName(p.name)] = groups[normName(p.name)] || []).push(p); });
  const dups = [];
  Object.values(groups).filter(g=>g.length > 1).forEach(g=>{
    const keep = g.slice().sort((a,b)=>keepScore(b, inXI) - keepScore(a, inXI))[0];
    g.filter(p=>p !== keep).forEach(p=>dups.push({coll:"players", id:p.id, text:p.name, detail:`${p.pos} · ${p.age} J. · doppelt – behalten wird der Eintrag ${inXI.has(keep.id) ? "aus der Aufstellung" : "mit den meisten Daten"}`}));
  });
  add("dupPlayers", "Doppelte Spieler", "gleicher Name mehrfach im Kader – typisch nach Re-Importen", dups, true);
  // 2) done scoutings / promoted talents / loanees back in the squad
  add("signedTargets", "Erledigte Transferziele", "stehen schon im Kader", state.scouting.filter(t=>squadNames.has(normName(t.name))).map(t=>({coll:"scouting", id:t.id, text:t.name, detail:`${t.pos} · ${SCOUT_STATUS[t.status] || ""}`})), true);
  add("prospectsInSquad", "Talente, die schon im Kader sind", "doppelt geführt", state.prospects.filter(t=>squadNames.has(normName(t.name))).map(t=>({coll:"prospects", id:t.id, text:t.name, detail:t.pos})), true);
  add("loansInSquad", "Leihen, die schon zurück im Kader sind", "doppelt geführt", state.loans.filter(t=>squadNames.has(normName(t.name))).map(t=>({coll:"loans", id:t.id, text:t.name, detail:t.club || ""})), true);
  // 3) empty placeholders
  const isPlaceholder = n => /^(unbekannt|neuer spieler|neues talent|spieler)$/i.test(String(n || "").trim());
  const ph = [];
  state.players.filter(p=>isPlaceholder(p.name) && !inXI.has(p.id) && !p.note && !p.salary).forEach(p=>ph.push({coll:"players", id:p.id, text:p.name, detail:"leerer Platzhalter im Kader"}));
  state.scouting.filter(t=>isPlaceholder(t.name) && !t.note && !t.fee).forEach(t=>ph.push({coll:"scouting", id:t.id, text:t.name, detail:"leeres Probe-Scouting"}));
  state.prospects.filter(t=>isPlaceholder(t.name) && !t.note).forEach(t=>ph.push({coll:"prospects", id:t.id, text:t.name, detail:"leerer Talent-Eintrag"}));
  add("placeholders", "Leere Platzhalter", "ohne Namen und ohne Daten angelegt", ph, true);
  // 4) duplicate results / transfer history
  const seen = new Set(), dr = [];
  // entry order: the first one stays, later copies go
  state.results.forEach(r=>{ const k = [r.date, normName(r.opponent), r.gf, r.ga].join("|"); if(seen.has(k)) dr.push({coll:"results", id:r.id, text:`${r.opponent} ${r.gf}:${r.ga}`, detail:r.date ? fmtDate(r.date,{day:"2-digit",month:"2-digit",year:"numeric"}) : ""}); else seen.add(k); });
  add("dupResults", "Doppelte Ergebnisse", "gleiches Datum, Gegner und Ergebnis", dr, true);
  const seenT = new Set(), dt = [];
  state.transferLog.forEach(t=>{ const k = [t.type, normName(t.name), t.fee, t.date].join("|"); if(seenT.has(k)) dt.push({coll:"transferLog", id:t.id, text:t.name, detail:`${t.type === "in" ? "Zugang" : "Abgang"} · ${fmtEUR(t.fee)}`}); else seenT.add(k); });
  add("dupTransfers", "Doppelte Einträge in der Transfer-Historie", "gleicher Spieler, Betrag und Datum", dt, true);
  // 5) demo data
  const lo = sampleLeftovers();
  if(lo.total && lo.hasReal){
    const sig = sampleSignature(), items = [];
    Object.entries(SAMPLE_COLLS).forEach(([c, def])=>{ (state[c] || []).filter(o=>sig[c].has(def.key(o))).forEach(o=>items.push({coll:c, id:o.id, text:o.name || o.opponent || o.title || o.text || o.season || o.date, detail:SAMPLE_COLLS[c].label})); });
    add("sample", "Beispieldaten aus der Demo", "stammen nicht aus deiner Karriere", items, true);
  }
  // 6) storage leftovers of deleted saves (invisible, but take space)
  const ents = storageEntries();
  const toItem = e => ({coll:"storage", key:e.key, text:e.label, detail:`${e.key} · ${fmtBytes(e.size)}`});
  add("storage", "Speicher-Altlasten", "Protokolle gelöschter Spielstände – reine Verlaufsdaten", ents.filter(e=>e.kind === "orphanLog").map(toItem), true);
  add("storageCheck", "Speicher: bitte prüfen", "könnte noch Daten enthalten – z. B. Wiederherstellungspunkte gelöschter Spielstände oder der alte Spielstand aus Version 1/2",
    ents.filter(e=>["orphanRp","orphanSave","legacy","unknown"].includes(e.kind)).map(toItem), false);
  // 7) to check – not preselected
  add("expired", "Abgelaufene Verträge", "Vertrag ist vorbei – vermutlich nicht mehr im Verein (bitte prüfen)",
    state.players.filter(p=>contractMonthsLeft(p) < 0).map(p=>({coll:"players", id:p.id, text:p.name, detail:`Vertrag bis 30.06.${p.contractUntil}`})), false);
  const today = state.club.ingameDate;
  add("endedLoans", "Beendete Leihen", "Enddatum liegt zurück – zurückholen (Entwicklung → Leihen) oder entfernen",
    state.loans.filter(l=>{ const e = loanEndISO(l.until); return e && e < today; }).map(l=>({coll:"loans", id:l.id, text:l.name, detail:`bis ${l.until}${l.club ? " · " + l.club : ""}`})), false);
  return cats;
}
function itemKey(it){ return it.coll === "storage" ? "storage:" + it.key : it.coll + ":" + it.id; }

/** Runs a batch change safely: restore point, undo, one log entry. fn returns a short result text. */
function runBatch(label, fn, afterUndo){
  createRestorePoint(`Vor Wartung: ${label}`);
  const snap = JSON.stringify(state);
  const result = fn();
  state = sanitizeState(state);
  saveState();
  const log = readLog();
  log.push({id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, area:"Wartung", action:"info", entity:"Batch", text:`${label}: ${result}`, revertible:false});
  writeLog(log);
  renderAll();
  if(currentView === "admin" && adminTab === "maintenance") adminMaintenance();
  toast(`${label}: ${result}`, {onUndo:()=>{ if(afterUndo) afterUndo(); state = JSON.parse(snap); saveState(); renderAll(); if(currentView === "admin" && adminTab === "maintenance") adminMaintenance(); }, duration:9000});
}
let orphanSel = null;           // Set of selected item keys (null = defaults)
function cleanOrphans(selectedKeys){
  const cats = findOrphans();
  const items = cats.flatMap(c=>c.items).filter(it=>selectedKeys.has(itemKey(it)));
  if(!items.length){ toast("Nichts ausgewählt."); return; }
  const removedStorage = {};
  runBatch("Verwaiste Einträge bereinigt", ()=>{
    const byColl = {};
    items.forEach(it=>{
      if(it.coll === "storage"){ removedStorage[it.key] = store.getItem(it.key); store.removeItem(it.key); }
      else (byColl[it.coll] = byColl[it.coll] || new Set()).add(it.id);
    });
    Object.entries(byColl).forEach(([c, ids])=>{ state[c] = state[c].filter(o=>!ids.has(o.id)); });
    return `${items.length} Einträge entfernt`;
  }, ()=>{   // storage keys are not part of the save → "Rückgängig" restores them explicitly
    Object.entries(removedStorage).forEach(([k,v])=>{ try{ store.setItem(k, v); }catch(e){} });
  });
  orphanSel = null;
}

/* ---------- amounts: convert / adjust ---------- */
const MONEY_TARGETS = {
  salary:    {label:"Gehälter (Kader)",              list:()=>state.players,   fields:["salary"], squad:true},
  value:     {label:"Transferwerte (Kader)",         list:()=>state.players,   fields:["valueMin","valueMax"], squad:true},
  scoutFee:  {label:"Ablösen (Scouting)",            list:()=>state.scouting,  fields:["fee"]},
  scoutBonus:{label:"Handgelder (Scouting)",         list:()=>state.scouting,  fields:["bonus"]},
  scoutWage: {label:"Gehälter (Scouting)",           list:()=>state.scouting,  fields:["wage"]},
  salePrice: {label:"Erwartete Erlöse (Verkäufe)",   list:()=>state.sales,     fields:["price"]},
  budgets:   {label:"Budgets (Transfer & Gehalt)",   list:()=>[state.club],    fields:["transferBudget","wageBudget"]},
  balance:   {label:"Kontostand-Verlauf",            list:()=>state.balanceLog,fields:["amount"]}
};
const ROUND_STEPS = {0:"nicht runden", 1000:"auf 1.000", 10000:"auf 10.000", 100000:"auf 100.000", 1000000:"auf 1 Mio."};
function moneyBatchPlan(cfg){
  const t = MONEY_TARGETS[cfg.target]; if(!t) return null;
  let list = t.list();
  if(t.squad && cfg.role) list = list.filter(p=>p.squadRole === cfg.role);
  const f = cfg.mode === "percent" ? 1 + cfg.value/100 : cfg.value;
  const step = num(cfg.round, 0);
  const calc = v => { let n = v * f; if(step) n = Math.round(n / step) * step; return Math.max(0, Math.round(n)); };
  let before = 0, after = 0, changed = 0; const ex = [];
  list.forEach(o=>t.fields.forEach(k=>{
    const v = num(o[k], 0); if(!v) return;
    const nv = calc(v); before += v; after += nv; if(nv !== v) changed++;
    if(ex.length < 3 && nv !== v) ex.push(`${o.name || (o.playerId ? (playerById(o.playerId) || {}).name : "") || (o.date ? fmtDate(o.date,{day:"2-digit",month:"2-digit",year:"2-digit"}) : "Verein")}: ${fmtEUR(v)} → ${fmtEUR(nv)}`);
  }));
  return {list, fields:t.fields, calc, before, after, changed, ex, valid: Number.isFinite(f) && f > 0};
}

/* ---------- set a value for all ---------- */
function batchFields(){
  const bool = {"true":"Ja", "false":"Nein"};
  const out = {
    "players.status":        {label:"Kader · Status", coll:"players", field:"status", values:()=>STATUS},
    "players.squadRole":     {label:"Kader · Kaderrolle", coll:"players", field:"squadRole", values:()=>SQUAD_ROLES},
    "players.rating":        {label:"Kader · Einschätzung", coll:"players", field:"rating", values:()=>({1:"★",2:"★★",3:"★★★",4:"★★★★",5:"★★★★★"}), number:true},
    "players.extendPlanned": {label:"Kader · Verlängerung geplant", coll:"players", field:"extendPlanned", values:()=>bool, bool:true},
    "scouting.status":       {label:"Scouting · Status", coll:"scouting", field:"status", values:()=>SCOUT_STATUS},
    "scouting.priority":     {label:"Scouting · Priorität", coll:"scouting", field:"priority", values:()=>PRIORITIES, number:true},
    "scouting.grade":        {label:"Scouting · Grade", coll:"scouting", field:"grade", values:()=>Object.fromEntries(GRADES.map(g=>[g,g]))},
    "loans.playtime":        {label:"Leihen · Spielzeit", coll:"loans", field:"playtime", values:()=>Object.assign({"":"— nicht bewertet —"}, PLAYTIME)},
    "loans.recallCheck":     {label:"Leihen · Rückruf prüfen", coll:"loans", field:"recallCheck", values:()=>bool, bool:true},
    "prospects.pathway":     {label:"Talente · Weg", coll:"prospects", field:"pathway", values:()=>PATHWAYS}
  };
  (state.customFields || []).forEach(d=>d.areas.forEach(a=>{
    const coll = a === "squad" ? "players" : "scouting";
    const values = d.type === "bool" ? {"true":"Ja", "":"Nein"} : d.type === "select" ? Object.assign({"":"— leeren —"}, Object.fromEntries(d.options.map(o=>[o,o]))) : {"":"— leeren —"};
    out[`${coll}.cf:${d.id}`] = {label:`${a === "squad" ? "Kader" : "Scouting"} · ✦ ${d.name}`, coll, cf:d.id, values:()=>values};
  }));
  return out;
}
function setBatchPlan(key, raw, pos){
  const bf = batchFields()[key]; if(!bf) return null;
  const value = bf.bool && !bf.cf ? raw === "true" : bf.number ? num(raw) : raw;
  const list = (state[bf.coll] || []).filter(o=>!pos || o.pos === pos);
  const cur = o => bf.cf ? ((o.custom || {})[bf.cf] === undefined ? "" : String((o.custom || {})[bf.cf])) : o[bf.field];
  const target = bf.cf ? (raw === "true" ? "true" : raw) : value;
  const changed = list.filter(o=>!same(cur(o), target)).length;
  return {bf, list, value, raw, changed};
}
function applySetBatch(plan){
  const {bf, list, value, raw} = plan;
  runBatch(`${bf.label} → ${bf.values()[raw] || raw || "leer"}`, ()=>{
    let n = 0;
    list.forEach(o=>{
      if(bf.cf){
        const def = cfById(bf.cf); o.custom = o.custom || {};
        const v = coerceCF(def, raw === "true" ? true : raw);
        const before = o.custom[def.id];
        if(v === undefined) delete o.custom[def.id]; else o.custom[def.id] = v;
        if(!same(before, o.custom[def.id])) n++;
        return;
      }
      if(same(o[bf.field], value)) return;
      const before = o[bf.field];
      o[bf.field] = value; n++;
      if(bf.coll === "loans" && bf.field === "playtime") onLoanPlaytime(o, before);   // keep auto note & red marking consistent
      if(bf.coll === "players" && bf.field === "extendPlanned" && value) {}             // nothing else to adjust
    });
    return `${n} Einträge geändert`;
  });
}
const BATCH_PRESETS = [
  {label:"Alle Scouting-Status → Beobachtet", key:"scouting.status", raw:"watched"},
  {label:"Alle Spieler → Verfügbar", key:"players.status", raw:""},
  {label:"Verlängerungs-Planungen zurücksetzen", key:"players.extendPlanned", raw:"false"},
  {label:"Leih-Spielzeiten zurücksetzen", key:"loans.playtime", raw:""}
];

let batchUI = {target:"salary", mode:"factor", value:"1", round:"0", role:"", setKey:"scouting.status", setRaw:"", setPos:""};
function adminMaintenance(){
  const cats = findOrphans();
  if(!orphanSel){ orphanSel = new Set(); cats.forEach(c=>{ if(c.safe) c.items.forEach(it=>orphanSel.add(itemKey(it))); }); }
  const nSel = cats.flatMap(c=>c.items).filter(it=>orphanSel.has(itemKey(it))).length;
  const bf = batchFields(); if(!bf[batchUI.setKey]) batchUI.setKey = "scouting.status";
  const vals = bf[batchUI.setKey].values(); if(!(batchUI.setRaw in vals)) batchUI.setRaw = Object.keys(vals)[0];
  qs("#adminBody").innerHTML = `
    <div class="card maint-card">
      <div class="card-head"><h2>🧹 Verwaiste Einträge</h2><button class="btn btn-sm" id="btnOrphanScan">Neu prüfen</button></div>
      ${cats.length ? `
        <p class="lead" style="margin-top:0">Gefunden: ${cats.map(c=>`${c.items.length} × ${esc(c.label)}`).join(" · ")}. Vorausgewählt sind nur eindeutige Fälle – „zur Prüfung“ entscheidest du selbst.</p>
        ${cats.map(c=>`<details class="orphan-cat ${c.safe ? "" : "check"}" ${c.items.length <= 6 ? "open" : ""}>
          <summary><label class="check-label" onclick="event.stopPropagation()"><input type="checkbox" data-orphan-cat="${c.key}" ${c.items.every(it=>orphanSel.has(itemKey(it))) ? "checked" : ""}></label>
            <strong>${esc(c.label)}</strong> <span class="muted small">${c.items.length} · ${esc(c.why)}</span>${c.safe ? "" : ' <span class="badge unhappy">zur Prüfung</span>'}</summary>
          <ul>${c.items.map(it=>`<li><label class="check-label"><input type="checkbox" data-orphan="${esc(itemKey(it))}" ${orphanSel.has(itemKey(it)) ? "checked" : ""}> <span>${esc(it.text)}</span></label> <span class="muted small">${esc(it.detail || "")}</span></li>`).join("")}</ul>
        </details>`).join("")}
        <div class="maint-actions"><button class="btn btn-accent" id="btnOrphanClean" ${nSel ? "" : "disabled"}>Verwaiste Einträge sicher bereinigen (${nSel})</button>
          <span class="muted small">Vorher wird automatisch ein Wiederherstellungspunkt angelegt; direkt danach ist Rückgängig möglich.</span></div>`
        : `<div class="future-ok">✓ Keine verwaisten Einträge gefunden – deine Daten sind aufgeräumt.</div>`}
    </div>

    ${(()=>{ const ents = storageEntries(), total = ents.reduce((a,e)=>a+e.size,0), last = readJSON(STORAGE_CLEAN_KEY);
      return `<div class="card maint-card"><div class="card-head"><h2>💾 Speicherbelegung</h2><span class="muted small">${fmtBytes(total)} in ${ents.length} Einträgen${last ? ` · zuletzt automatisch aufgeräumt ${relTime(last.at)} (${last.count}, ${fmtBytes(last.freed)})` : ""}</span></div>
        <div class="mem-list">${ents.slice(0,8).map(e=>`<div class="mem-row mem-${e.kind}"><span class="mem-label">${esc(e.label)}</span><span class="mem-bar"><i style="width:${Math.max(2, Math.round(e.size / Math.max(1, ents[0].size) * 100))}%"></i></span><span class="mem-size">${fmtBytes(e.size)}</span></div>`).join("")}</div>
        <p class="hint">Beim Start entfernt das Dashboard automatisch nur, was garantiert keine Daten enthält (Protokolle gelöschter Spielstände). Alles andere steht oben unter „bitte prüfen“.</p></div>`; })()}
    <div class="admin-grid maint-grid">
      <div class="card maint-card">
        <div class="card-head"><h2>💱 Beträge umrechnen</h2></div>
        <div class="form-stack">
          <div class="field"><label>Was?</label><select data-bu="target">${options(Object.fromEntries(Object.entries(MONEY_TARGETS).map(([k,v])=>[k,v.label])), batchUI.target)}</select></div>
          ${MONEY_TARGETS[batchUI.target].squad ? `<div class="field"><label>Nur Kaderrolle (optional)</label><select data-bu="role"><option value="">alle Spieler</option>${options(SQUAD_ROLES, batchUI.role)}</select></div>` : ""}
          <div class="field-row">
            <div class="field"><label>Rechnung</label><select data-bu="mode">${options({factor:"mal Faktor (z. B. Währung)", percent:"Prozent ±"}, batchUI.mode)}</select></div>
            <div class="field"><label>${batchUI.mode === "percent" ? "Prozent (z. B. 10 oder -5)" : "Faktor (z. B. 1,17 für £ → €)"}</label><input type="text" inputmode="decimal" data-bu="value" value="${esc(batchUI.value)}"></div>
          </div>
          <div class="field"><label>Danach runden</label><select data-bu="round">${options(ROUND_STEPS, batchUI.round)}</select></div>
          <div class="batch-preview" id="moneyPreview"></div>
          <div><button class="btn btn-accent btn-sm" id="btnMoneyApply">Umrechnen</button></div>
        </div>
        <p class="hint">Den aktuellen Wechselkurs trägst du selbst ein – das Dashboard kennt keine Kurse. Gehälter werden intern pro Jahr gespeichert; der Faktor gilt unabhängig von der angezeigten Einheit.</p>
      </div>
      <div class="card maint-card">
        <div class="card-head"><h2>♻ Werte zurücksetzen / für alle setzen</h2></div>
        <div class="preset-row">${BATCH_PRESETS.map((pr,i)=>`<button class="btn btn-sm" data-preset="${i}">${esc(pr.label)}</button>`).join("")}</div>
        <div class="form-stack" style="margin-top:12px">
          <div class="field"><label>Feld</label><select data-bu="setKey">${options(Object.fromEntries(Object.entries(bf).map(([k,v])=>[k,v.label])), batchUI.setKey)}</select></div>
          <div class="field-row">
            <div class="field"><label>Neuer Wert</label><select data-bu="setRaw">${options(vals, batchUI.setRaw)}</select></div>
            <div class="field"><label>Nur Position (optional)</label><select data-bu="setPos"><option value="">alle</option>${options(POS_LIST, batchUI.setPos)}</select></div>
          </div>
          <div class="batch-preview" id="setPreview"></div>
          <div><button class="btn btn-accent btn-sm" id="btnSetApply">Für alle setzen</button></div>
        </div>
      </div>
    </div>`;
  renderBatchPreviews();
}
function renderBatchPreviews(){
  const mp = qs("#moneyPreview"), sp = qs("#setPreview"); if(!mp || !sp) return;
  const plan = moneyBatchPlan({target:batchUI.target, mode:batchUI.mode, value:num(String(batchUI.value).replace(",", "."), NaN), round:batchUI.round, role:batchUI.role});
  if(!plan || !plan.valid) mp.innerHTML = `<span class="neg">Bitte eine gültige Zahl eingeben${batchUI.mode === "factor" ? " (größer als 0)" : ""}.</span>`;
  else mp.innerHTML = plan.changed ? `<strong>${plan.changed} Werte ändern sich</strong> · Summe ${fmtEUR(plan.before)} → ${fmtEUR(plan.after)}${plan.ex.length ? `<div class="muted small">${plan.ex.map(esc).join("<br>")}</div>` : ""}` : `<span class="muted">Keine Änderung mit diesen Einstellungen.</span>`;
  qs("#btnMoneyApply").disabled = !plan || !plan.valid || !plan.changed;
  const sPlan = setBatchPlan(batchUI.setKey, batchUI.setRaw, batchUI.setPos);
  sp.innerHTML = sPlan ? (sPlan.changed ? `<strong>${sPlan.changed} von ${sPlan.list.length} Einträgen ändern sich</strong>` : `<span class="muted">Alle ${sPlan.list.length} Einträge haben diesen Wert schon.</span>`) : "";
  qs("#btnSetApply").disabled = !sPlan || !sPlan.changed;
}
function initMaintenance(){
  const root = qs("#adminRoot");
  root.addEventListener("change", e=>{
    const t = e.target;
    if(t.dataset.orphan !== undefined){ t.checked ? orphanSel.add(t.dataset.orphan) : orphanSel.delete(t.dataset.orphan); adminMaintenance(); return; }
    if(t.dataset.orphanCat !== undefined){
      const c = findOrphans().find(x=>x.key === t.dataset.orphanCat); if(!c) return;
      c.items.forEach(it=>t.checked ? orphanSel.add(itemKey(it)) : orphanSel.delete(itemKey(it))); adminMaintenance(); return;
    }
    if(t.dataset.bu !== undefined){
      batchUI[t.dataset.bu] = t.value;
      if(t.dataset.bu === "setKey") batchUI.setRaw = "";
      if(["target","mode","setKey"].includes(t.dataset.bu)) adminMaintenance(); else renderBatchPreviews();
    }
  });
  root.addEventListener("input", e=>{ if(e.target.dataset.bu === "value"){ batchUI.value = e.target.value; renderBatchPreviews(); } });
  root.addEventListener("click", e=>{
    const t = e.target;
    if(t.closest("#btnOrphanScan")){ orphanSel = null; adminMaintenance(); toast("Neu geprüft"); }
    else if(t.closest("#btnOrphanClean")) cleanOrphans(new Set(orphanSel));
    else if(t.closest("#btnMoneyApply")){
      const plan = moneyBatchPlan({target:batchUI.target, mode:batchUI.mode, value:num(String(batchUI.value).replace(",", "."), NaN), round:batchUI.round, role:batchUI.role});
      if(!plan || !plan.valid || !plan.changed) return;
      const lbl = `${MONEY_TARGETS[batchUI.target].label} ${batchUI.mode === "percent" ? (num(batchUI.value.replace(",", ".")) >= 0 ? "+" : "") + batchUI.value + " %" : "× " + batchUI.value}`;
      runBatch(lbl, ()=>{ plan.list.forEach(o=>plan.fields.forEach(k=>{ const v = num(o[k], 0); if(v) o[k] = plan.calc(v); })); return `${plan.changed} Werte, Summe ${fmtEUR(plan.before)} → ${fmtEUR(plan.after)}`; });
    }
    else if(t.closest("#btnSetApply")){ const plan = setBatchPlan(batchUI.setKey, batchUI.setRaw, batchUI.setPos); if(plan && plan.changed) applySetBatch(plan); }
    else if(t.closest("[data-preset]")){
      const pr = BATCH_PRESETS[num(t.closest("[data-preset]").dataset.preset)];
      const plan = setBatchPlan(pr.key, pr.raw, "");
      if(!plan || !plan.changed){ toast(`${pr.label}: nichts zu tun.`); return; }
      applySetBatch(plan);
    }
  });
}



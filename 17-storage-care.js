/* ==========================================================================
   SPEICHER-HAUSMEISTER (8.8)
   Every key the dashboard writes is known here. Automatically removed on start: only logs of
   deleted saves (pure history). Everything that might still hold data (restore points of deleted
   saves, the old v1/v2 save, saves without an index entry, unknown keys) is listed in Wartung.
   ========================================================================== */
const STORAGE_CLEAN_KEY = "fm27_storage_clean";
const KNOWN_KEYS = () => new Set([SLOT_INDEX_KEY, LISTS_DEFAULT_KEY, ADMIN_KEY, BACKUP_CFG_KEY, SEEN_VERSION_KEY, ADMIN_NOTES_KEY,
  LAYOUT_KEY, COL_KEY, "fm27_welcome_done", STORAGE_CLEAN_KEY, ERROR_KEY, HOTKEY_KEY, "fm27_theme_hint", "fm27_start_hint", "fm27_hub", "fm27_diary", "fm27_career"]);
// a function: LAYOUT_KEY / COL_KEY are defined further down in the file
const KEY_LABEL = () => ({[SLOT_INDEX_KEY]:"Spielstand-Liste", [LISTS_DEFAULT_KEY]:"Standard-Listen", [ADMIN_KEY]:"Admin-PIN & Einstellungen", [BACKUP_CFG_KEY]:"Ordner-Sicherung",
  [SEEN_VERSION_KEY]:"gesehene Version", [ADMIN_NOTES_KEY]:"Admin-Notizen", [LAYOUT_KEY]:"Layout & Design", [COL_KEY]:"Spaltenbreiten", fm27_welcome_done:"Willkommen gezeigt",
  [STORAGE_CLEAN_KEY]:"letzte Speicherbereinigung", [JOURNEY_KEY]:"alte gemeinsame Journey (vor 9.9.1)", [LEGACY_KEY]:"alter Spielstand (Version 1/2)"});
function storageEntries(){
  const live = new Map(slotIndex.slots.map(x=>[x.id, x.name])), out = [];
  for(let i = 0; i < store.length; i++){
    const key = store.key(i); if(!key || !key.startsWith("fm27")) continue;
    const size = key.length + (store.getItem(key) || "").length;
    let kind = "setting", label = KEY_LABEL()[key] || key;
    const m = /^(fm27_slot_|fm27_log_|fm27_rp_)(.+)$/.exec(key);
    if(m){
      const which = m[1] === SLOT_PREFIX ? "Spielstand" : m[1] === LOG_PREFIX ? "Protokoll" : "Wiederherstellungspunkte";
      if(live.has(m[2])){ kind = m[1] === SLOT_PREFIX ? "save" : m[1] === LOG_PREFIX ? "log" : "rp"; label = `${which} „${live.get(m[2])}“`; }
      else { kind = m[1] === SLOT_PREFIX ? "orphanSave" : m[1] === LOG_PREFIX ? "orphanLog" : "orphanRp"; label = `${which} eines gelöschten Spielstands`; }
    } else if(key === LEGACY_KEY || key === JOURNEY_KEY) kind = "legacy";
    else if(key.startsWith("fm27_rescue_")){ kind = "legacy"; label = "Gerettetes Original eines beschädigten Spielstands"; }
    else if(key === ERROR_KEY) label = "Fehlerprotokoll";
    else if(key === HOTKEY_KEY) label = "Eigene Tastenkürzel";
    else if(key === "fm27_theme_hint") label = "Design-Hinweis (gegen Aufblitzen beim Start)";
    else if(key === "fm27_hub") label = "Gaming-Hub";
    else if(key === "fm27_start_hint") label = "Start-Hinweis (Hub oder Dashboard, gegen Aufblitzen)";
    else if(key === "fm27_diary") label = "Spiel-Tagebuch";
    else if(key === "fm27_career") label = "Karriere-Begleiter";
    else if(key.startsWith(IMG_PREFIX)) label = "Tagebuch-Bild";
    else if(!key.startsWith(IMG_PREFIX) && !KNOWN_KEYS().has(key)) kind = "unknown";
    out.push({key, size, kind, label});
  }
  return out.sort((a,b)=>b.size - a.size);
}
/** On start: remove only what can never hold data (logs of deleted saves). Returns {count, freed}. */
function autoCleanStorage(){
  const gone = storageEntries().filter(e=>e.kind === "orphanLog");
  let freed = 0;
  gone.forEach(e=>{ try{ store.removeItem(e.key); freed += e.size; }catch(err){} });
  if(gone.length){ try{ store.setItem(STORAGE_CLEAN_KEY, JSON.stringify({at:Date.now(), count:gone.length, freed})); }catch(err){} }
  return {count:gone.length, freed};
}

/* ---------- edit / delete transfer targets (boards, pipeline) ---------- */
function openTargetEditModal(t){
  openModal({
    title:`${t.kind === "loan" ? "Leihziel" : "Transferziel"} bearbeiten`,
    body:`
      <div class="field-row"><div class="field" style="flex:2"><label>Name</label><input data-f="name" value="${esc(t.name)}"></div>
        <div class="field"><label>Position</label><select data-f="pos">${options(POS_LIST, t.pos)}</select></div>
        <div class="field"><label>Alter</label><input data-f="age" type="number" value="${t.age}"></div></div>
      <div class="field-row"><div class="field"><label>Art</label><select data-f="kind">${options({buy:"Kauf", loan:"Leihe"}, t.kind)}</select></div>
        <div class="field"><label>Status</label><select data-f="status">${options(SCOUT_STATUS, t.status)}</select></div>
        <div class="field"><label>Grade</label><select data-f="grade">${options(GRADES, t.grade)}</select></div>
        <div class="field"><label>Priorität</label><select data-f="priority">${options(PRIORITIES, String(t.priority))}</select></div></div>
      <div class="field-row"><div class="field"><label>Ablöse bzw. Leihgebühr (€)</label>${moneyInput(t.fee, 'data-f="fee"')}</div>
        <div class="field"><label>Handgeld (€)</label>${moneyInput(t.bonus, 'data-f="bonus"')}</div></div>
      <div class="field-row"><div class="field"><label>Gehalt ${WAGE_UNITS[wageUnit()].label} (€, volles Gehalt)</label>${moneyInput(t.wage, 'data-f="wage"', true)}</div>
        <div class="field"><label>Gehaltsanteil bei Leihe (%)</label><input data-f="wageShare" type="number" min="0" max="100" value="${t.wageShare}"></div></div>
      <div class="field"><label>Notiz</label><input data-f="note" value="${esc(t.note)}"></div>`,
    leftButtons:`<button class="btn btn-danger-outline" data-target-del>Löschen</button>`,
    onOpen: m=>{ qs("[data-target-del]", m).onclick = ()=>{ closeModal(); deleteTarget(t); }; },
    saveLabel:"Speichern",
    onSave: get=>{
      const undo = snapshotUndo(`${t.name} geändert`, renderAll);
      Object.assign(t, {name:get("name").trim() || t.name, pos:get("pos"), age:get("age"), kind:get("kind"), status:get("status"), grade:get("grade"),
        priority:num(get("priority"), 2), fee:get("fee"), bonus:get("bonus"), wage:get("wage"), wageShare:clamp(Math.round(num(get("wageShare"), 100)), 0, 100), note:get("note")});
      state = sanitizeState(state); saveState(); renderAll(); undo();
    }
  });
}
function deleteTarget(t){
  const undo = snapshotUndo(`${t.name} gelöscht`, renderAll);
  state.scouting = state.scouting.filter(x=>x.id !== t.id);
  saveState(); renderAll(); undo();
}



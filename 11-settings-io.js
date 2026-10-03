/* ==========================================================================
   SETTINGS
   ========================================================================== */
function openSettingsModal(){
  const c = state.club;
  openModal({
    title:"Verein & Spielstand",
    body:`
      <div class="field-row">
        <div class="field" style="flex:2"><label>Vereinsname</label><input data-f="name" value="${esc(c.name)}"></div>
        <div class="field"><label>Kürzel</label><input data-f="crest" maxlength="3" value="${esc(c.crest)}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Spieldatum (aus FM)</label><input data-f="ingameDate" type="date" value="${esc(c.ingameDate)}"></div>
        <div class="field"><label>Saison</label><input data-f="season" value="${esc(c.season)}"></div>
      </div>
      <div class="field-row" ${isNat() ? "hidden" : ""}>
        <div class="field"><label>Transferbudget (€)</label>${moneyInput(c.transferBudget, 'data-f="transferBudget"')}</div>
        <div class="field"><label>Gehaltsbudget gesamt ${WAGE_UNITS[wageUnit()].label} (€)</label>${moneyInput(c.wageBudget, 'data-f="wageBudget"', true)}</div>
      </div>
      <div class="field-row">
        <div class="field"><label>Gehälter anzeigen</label><select data-f="wageUnit">${options(Object.fromEntries(Object.entries(WAGE_UNITS).map(([k,v])=>[k,v.label])), wageUnit())}</select></div>
        <div class="field"><label>Tausendertrennzeichen</label><select data-f="numberFormat">${options(NUMBER_FORMATS, c.numberFormat)}</select></div>
        <div class="field"><label>Beträge</label><select data-f="moneyDisplay">${options(MONEY_DISPLAY, c.moneyDisplay)}</select></div>
      </div>
      <div class="field-row" ${isNat() ? "hidden" : ""}>
        <div class="field"><label>Sommer-Transferfenster</label><input data-f="winSummer" value="${esc(c.windows.summer)}" placeholder="01.07.–01.09."></div>
        <div class="field"><label>Winter-Transferfenster</label><input data-f="winWinter" value="${esc(c.windows.winter)}" placeholder="01.01.–01.02."></div>
      </div>
      <div class="field"><label>Akzentfarbe</label>
        <div class="swatches">
          ${ACCENTS.map(a=>`<button type="button" class="swatch ${a===c.accent?"active":""}" data-swatch="${a}" style="background:${a}" aria-label="Farbe ${a}"></button>`).join("")}
          <input type="color" data-f="accent" value="${c.accent}" aria-label="Eigene Farbe">
        </div>
      </div>`,
    onOpen: modal=>{
      const picker = qs('[data-f="accent"]', modal);
      const preview = v=>{ setAccentVars(v); qsa("[data-swatch]", modal).forEach(s=>s.classList.toggle("active", s.dataset.swatch===v)); };
      qsa("[data-swatch]", modal).forEach(s=> s.onclick = ()=>{ picker.value = s.dataset.swatch; preview(s.dataset.swatch); });
      picker.oninput = ()=> preview(picker.value);
      qs("[data-modal-cancel]", modal).addEventListener("click", ()=> setAccentVars(state.club.accent));
    },
    onSave: get=>{
      const newDate = normalizeDate(get("ingameDate"), c.ingameDate);
      Object.assign(c, {
        name: get("name").trim() || c.name, crest: (get("crest").trim() || "FC").toUpperCase(),
        season: get("season").trim() || c.season,
        transferBudget: get("transferBudget"), wageBudget: get("wageBudget"), accent: get("accent"),
        wageUnit: get("wageUnit"), numberFormat: get("numberFormat"), moneyDisplay: get("moneyDisplay"),
        windows: {
          summer: parseWindow(get("winSummer")) ? get("winSummer").trim() : c.windows.summer,
          winter: parseWindow(get("winWinter")) ? get("winWinter").trim() : c.windows.winter
        }
      });
      if(newDate !== c.ingameDate) applyDateChange(newDate);   // ages + birthday notice
      else { saveState(); renderAll(); toast("Einstellungen gespeichert"); }
    }
  });
}

/* ==========================================================================
   SAVE SLOTS UI
   ========================================================================== */
function openSlotsModal(){
  const rel = ts => {
    const d = Math.round((Date.now()-ts)/60000);
    return d < 1 ? "gerade eben" : d < 60 ? `vor ${d} Min.` : d < 1440 ? `vor ${Math.round(d/60)} Std.` : new Date(ts).toLocaleDateString("de-DE");
  };
  openModal({
    title:"Spielstände",
    wide:true,
    body:`<p class="lead">Jede FM-Karriere bekommt ihren eigenen Spielstand. Alles bleibt lokal in diesem Browser – für Backups „Export“ nutzen.</p>
      <div class="slot-list">${slotIndex.slots.map(s=>`
        <div class="slot-item ${s.id===slotIndex.active?"active":""}" data-slot-id="${s.id}">
          <input value="${esc(s.name)}" data-slot-rename aria-label="Name des Spielstands">
          <span class="slot-meta">${s.id===slotIndex.active ? "aktiv · " : ""}${rel(s.updatedAt)}</span>
          ${s.id!==slotIndex.active ? `<button class="btn btn-sm" data-slot-load>Laden</button>` : ""}
          <button class="btn-icon-sm" data-slot-dup title="Duplizieren" aria-label="Duplizieren">⧉</button>
          ${slotIndex.slots.length>1 ? `<button class="btn-icon-sm del" data-slot-del title="Löschen" aria-label="Löschen">✕</button>` : ""}
        </div>`).join("")}</div>`,
    leftButtons:`<button class="btn btn-sm" data-slot-new="national">+ Nationalteam</button><button class="btn btn-sm" data-slot-new="sample">+ Mit Beispieldaten</button><button class="btn btn-sm" data-slot-new="empty">+ Leer</button>`,
    onOpen: modal=>{
      modal.onchange = e=>{
        const inp = e.target.closest("[data-slot-rename]"); if(!inp) return;
        const meta = slotIndex.slots.find(s=>s.id===inp.closest("[data-slot-id]").dataset.slotId);
        meta.name = inp.value.trim() || meta.name; writeIndex(); renderHeader();
      };
      modal.onclick = e=>{
        const row = e.target.closest("[data-slot-id]"), id = row && row.dataset.slotId;
        if(e.target.closest("[data-slot-load]")){ closeModal(); switchSlot(id); toast("Spielstand geladen"); }
        else if(e.target.closest("[data-slot-dup]")){
          if(id === slotIndex.active) saveState();
          const data = readJSON(SLOT_PREFIX+id) || state;
          const meta = slotIndex.slots.find(s=>s.id===id);
          createSlot(meta.name+" (Kopie)", data); openSlotsModal();
        }
        else if(e.target.closest("[data-slot-del]")){
          const meta = slotIndex.slots.find(s=>s.id===id);
          if(!confirm(`Spielstand „${meta.name}“ endgültig löschen? Ohne Export ist er danach weg.`)) return;
          slotIndex.slots = slotIndex.slots.filter(s=>s.id!==id);
          store.removeItem(SLOT_PREFIX+id);
          store.removeItem(LOG_PREFIX+id); store.removeItem(RP_PREFIX+id);
          if(id === slotIndex.active){ writeIndex(); switchSlot(slotIndex.slots[0].id); }
          else writeIndex();
          openSlotsModal();
        }
        else if(e.target.closest("[data-slot-new]")){
          const kind = e.target.closest("[data-slot-new]").dataset.slotNew;
          saveState();
          const fresh = freshState(kind === "sample" ? "sample" : "empty");
          if(kind === "national"){ fresh.mode = "national"; fresh.club.name = "Nationalteam"; fresh.club.ingameDate = state.club.ingameDate; fresh.club.season = state.club.season; }
          const newId = createSlot(kind === "sample" ? "Beispiel-Karriere" : kind === "national" ? "Nationalteam" : `Karriere ${slotIndex.slots.length+1}`, sanitizeState(fresh));
          closeModal(); switchSlot(newId);
          if(kind === "empty") setTimeout(openSettingsModal, 50);
          if(kind === "national") setTimeout(()=>openNationalModal(true), 50);
          toast("Neuer Spielstand angelegt");
        }
      };
    }
  });
}

/* ==========================================================================
   EXPORT / IMPORT / RESET
   ========================================================================== */
function showImportErrors(errors){
  openModal({
    title:"Import abgebrochen",
    body:`<p class="lead">Die Datei passt nicht zum erwarteten Format. Es wurde nichts verändert.</p>
      <ul class="error-list">${errors.map(e=>`<li>${esc(e)}</li>`).join("")}</ul>`
  });
}
/** Validates, migrates and imports a backup (file, folder backup …) – asks: replace current save or new save. */
/** 11.8.2: restore hub, game diary (with images), hotkeys and layout from a "Hub, Tagebuch & Einstellungen" backup */
function restoreGlobalBackup(parsed){
  const st = parsed.storage, allowed = k => [HUB_KEY, DIARY_KEY, HOTKEY_KEY, LAYOUT_KEY, COL_KEY].includes(k) || k.startsWith(IMG_PREFIX);
  const keys = Object.keys(st).filter(k=>allowed(k) && typeof st[k] === "string");
  const d = sanitizeDiary((()=>{ try{ return JSON.parse(st[DIARY_KEY] || "null"); }catch(e){ return null; } })());
  const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("de-DE", {dateStyle:"short", timeStyle:"short"}) : "unbekannt";
  openModal({title:"Hub, Tagebuch & Einstellungen wiederherstellen?", body:`
    <p class="lead" style="margin-top:0">Stand vom <strong>${esc(when)}</strong>: ${d.sessions.length} Sessions, ${d.challenges.length} Challenges, ${keys.filter(k=>k.startsWith(IMG_PREFIX)).length} Bilder, dazu Tastenkürzel und Layout.</p>
    <p class="hint">Ersetzt diese Daten auf diesem Gerät. <strong>Spielstände bleiben unberührt.</strong> Die Seite lädt danach neu.</p>`,
    saveLabel:"Wiederherstellen",
    onSave: ()=>{ keys.forEach(k=>store.setItem(k, st[k])); toast("Hub, Tagebuch & Einstellungen wiederhergestellt – lädt neu …"); reloadApp(); }});
}
function handleBackupText(text){
  let parsed;
  try{ parsed = JSON.parse(text); }
  catch(err){ showImportErrors([`Kein gültiges JSON (${err.message}).`]); return; }
  if(parsed && parsed.kind === "full") return importFullBackup(parsed);   // "Alles exportieren (Umzug)"
  if(parsed && parsed.kind === "global" && parsed.storage && typeof parsed.storage === "object") return restoreGlobalBackup(parsed);   // 11.8.2
  if(parsed && parsed.kind === "journey" && parsed.journey){
    const j = sanitizeJourney(parsed.journey);
    return openModal({title:"Journey wiederherstellen?", body:`<p class="lead">Ersetzt die Journey <strong>dieses Spielstands</strong> („${esc((activeSlotMeta() || {}).name || state.club.name)}“) durch die Datei${j.profile.name ? ` von <strong>${esc(j.profile.name)}</strong>` : ""}: ${j.stations.length} Stationen, ${j.diary.length} Tagebuch-Einträge, Girokonto ${jEUR(j.bank.giro)}. Direkt danach rückgängig machbar.</p>`,
      saveLabel:"Wiederherstellen", onSave:()=>jUndo("Journey wiederhergestellt", ()=>{ journey = j; })});
  }
  const data = (parsed && parsed.data && typeof parsed.data === "object") ? parsed.data : parsed;
  const check = validateImportedState(data);
  if(!check.valid){ showImportErrors(check.errors); return; }
  const incoming = migrateState(data);
  applyLists(state.lists);            // preview only – keep the current save's lists active
  const label = (parsed && parsed.slotName) || incoming.club.name;
  openModal({
    title:"Backup importieren",
    body:`<p class="lead"><strong>${esc(incoming.club.name)}</strong> · Saison ${esc(incoming.club.season)} · ${incoming.players.length} Spieler.<br>Wohin soll das Backup?</p>`,
    leftButtons:`<button class="btn" data-imp="replace">Aktuellen Spielstand ersetzen</button><button class="btn btn-accent" data-imp="new">Als neuen Spielstand</button>`,
    onOpen: modal=>{
      modal.onclick = ev=>{
        const b = ev.target.closest("[data-imp]"); if(!b) return;
        closeModal();
        if(b.dataset.imp === "new"){ saveState(); switchSlot(createSlot(label, incoming)); toast("Backup als neuer Spielstand importiert"); }
        else {
          const undo = snapshotUndo("Backup importiert", renderAll);
          createRestorePoint("Vor Import");
          state = incoming; applyLists(state.lists); selectedSlot = null; saveState(); renderAll(); undo();
        }
      };
    }
  });
    
}

function initDataTools(){
  qs("#btnExport").addEventListener("click", ()=>{
    saveState();
    const payload = {app:"FM27 Manager Dashboard", schemaVersion:SCHEMA_VERSION, exportedAt:new Date().toISOString(),
      slotName:(activeSlotMeta()||{}).name, data:state};
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = state.club.name.replace(/[^\wäöüÄÖÜß-]+/g,"_");
    a.href = url; a.download = `fm27_${safe}_${state.club.season.replace("/","-")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    const meta = activeSlotMeta(); if(meta){ meta.lastExport = Date.now(); writeIndex(); }
    toast("Backup exportiert");
  });
  qs("#btnImport").addEventListener("click", ()=> qs("#importFile").click());
  qs("#importFile").addEventListener("change", e=>{
    const file = e.target.files[0];
    e.target.value = "";
    if(!file) return;
    if(file.size > 5*1024*1024){ showImportErrors(["Die Datei ist größer als 5 MB – das ist kein Dashboard-Backup."]); return; }
    const reader = new FileReader();
    reader.onerror = ()=> showImportErrors(["Die Datei konnte nicht gelesen werden."]);
    reader.onload = ()=> handleBackupText(reader.result);
    reader.readAsText(file);
  });
  qs("#btnReset").addEventListener("click", ()=>{
    openModal({
      title:"Spielstand zurücksetzen?",
      body:`<p class="lead">Ersetzt „${esc((activeSlotMeta()||{}).name)}“ durch Beispieldaten oder einen leeren Stand. Direkt danach kannst du das noch rückgängig machen.</p>`,
      leftButtons:`<button class="btn" data-reset="empty">Leeren</button><button class="btn btn-danger-outline" data-reset="sample">Beispieldaten laden</button>`,
      onOpen: modal=>{
        modal.onclick = ev=>{
          const b = ev.target.closest("[data-reset]"); if(!b) return;
          closeModal();
          createRestorePoint("Vor Zurücksetzen");
          const undo = snapshotUndo("Spielstand zurückgesetzt", renderAll);
          state = freshState(b.dataset.reset === "sample" ? "sample" : "empty");
          selectedSlot = null; saveState(); renderAll(); undo();
        };
      }
    });
  });
}

/* ==========================================================================
   COMMAND PALETTE & SHORTCUTS
   ========================================================================== */
let cmdItems = [], cmdIndex = 0;
function buildCommands(){
  const c = [];
  const add = (grp, label, sub, run) => c.push({grp, label, sub, run});
  VIEWS.forEach((v,i)=> add("Modul", VIEW_LABEL[v], String(i+1), ()=>navigate(v)));
  add("Aktion","Neuer Spieler","", ()=>{ navigate("squad"); openPlayerModal(); });
  add("Aktion","Neues Transferziel","", ()=>{ navigate("recruitment"); openTargetModal(); });
  add("Aktion","Neues Talent","", ()=>{ state.ui.devTab="prospects"; navigate("development"); renderDevelopment(); openProspectModal(); });
  add("Aktion","Neue Leihe","", ()=>{ state.ui.devTab="loans"; navigate("development"); renderDevelopment(); openLoanModal(); });
  add("Aktion","Kontostand eintragen","", ()=>{ navigate("finance"); openBalanceModal(); });
  add("Modul","Gegner-Datenbank","", ()=>{ navigate("fixtures"); const el = qs('[data-panel="opponents"]'); if(el) el.scrollIntoView({block:"start"}); });
  add("Modul","Saisonvergleich","", ()=>{ navigate("notes"); const el = qs('[data-panel="seasonCompare"]'); if(el) el.scrollIntoView({block:"start"}); });
  allOpponents().forEach(n=> add("Gegner", n, (()=>{ const st = opponentStats(n); return st.rec ? `${st.rec.w} S · ${st.rec.d} U · ${st.rec.l} N` : "Notizen"; })(), ()=>openOpponentModal(n)));
  add("Modul","Verträge & Gehälter","", ()=>{ state.ui.squadTab = "contracts"; navigate("squad"); });
  add("Aktion","Tagebuch-Eintrag schreiben","", ()=>{ navigate("journey"); if(journey.active) jDiaryModal(null); });
  add("Aktion","Buchung (Journey-Bankkonto)","", ()=>{ navigate("journey"); if(journey.active) jBookingModal(); });
  if(isNat()){ add("Aktion","Nationalteam-Einstellungen","", ()=>openNationalModal(false));
    add("Aktion","Nominierung als Lehrgang speichern","", natSaveCamp); add("Aktion","Kader kopieren (Nominierte als Text)","", natCopySquad); }
  if(linkedPartnerId()) add("Aktion","Zum verknüpften Spielstand wechseln","", switchLinked);
  add("Aktion","Spielstand wechseln","", ()=>openSaveMenu());
  add("Modul","Gaming-Hub","", ()=>showHub("home"));
  add("Modul","Spiel-Tagebuch (Beta)","", ()=>showHub("diary"));
  add("Aktion", diary && diary.running ? "Session beenden" : "Session starten", "", ()=>runHotkey("session"));
  add("Aktion","KI-Prompt kopieren (Taktik, Beta)","", ()=>{ navigate("tactics"); openAiPromptModal(); });
  add("Aktion","Tastenkürzel anpassen","", ()=>openHotkeyModal());
  add("Modul","Transfer-Center","", ()=>{ state.ui.transferTab = "center"; navigate("recruitment"); renderRecruitment(); });
  add("Modul","Deadline Day (Transfer-Center)","", ()=>{ state.ui.transferTab = "center"; navigate("recruitment"); renderRecruitment(); });
  add("Modul","Transfer-Hub (Fenster-Plan)","", ()=>{ state.ui.transferTab = "plan"; navigate("recruitment"); renderRecruitment(); });
  add("Modul","Verkaufsliste","", ()=>{ state.ui.transferTab = "sell"; navigate("recruitment"); renderRecruitment(); });
  add("Modul","Transfer-Historie","", ()=>{ state.ui.transferTab = "history"; navigate("recruitment"); renderRecruitment(); });
  add("Aktion","Verkauf planen","", ()=>{ state.ui.transferTab = "sell"; navigate("recruitment"); renderRecruitment(); openSaleModal(); });
  add("Modul","Kader nächste Saison","", ()=>{ state.ui.squadTab = "future"; navigate("squad"); });
  add("Aktion","Ergebnis eintragen","", ()=>{ navigate("fixtures"); openResultModal(null); });
  add("Daten","Kader aus FM importieren","", ()=>{ navigate("squad"); openImportWizard(); });
  add("Daten","Kader als CSV exportieren","", exportSquadCSV);
  add("Aktion","Neue Aufgabe","N", ()=>{ navigate("notes"); qs("#btnAddTodo").click(); });
  add("Aktion","Neues Vorstandsziel","", ()=>{ navigate("home"); openGoalModal(null); });
  add("Aktion","Beste Elf aufstellen","B", ()=>{ state.ui.tacticsTab="formation"; navigate("tactics"); runBestXI(); });
  add("Aktion","Standards planen","", ()=>{ state.ui.tacticsTab="setpieces"; navigate("tactics"); });
  add("Aktion","Matchday-Briefing drucken","P", printBriefing);
  add("Datum","Einen Tag weiter","T", ()=>nextDay(1));
  add("Datum","Eine Woche weiter","Shift+T", ()=>nextDay(7));
  add("Aktion","Phase wechseln (mit/gegen Ball)","", ()=>{ state.phase = state.phase==="in"?"out":"in"; saveState(); navigate("tactics"); });
  state.plans.forEach(pl=> add("Plan", pl.name, pl.id===state.activePlanId ? "aktiv" : "", ()=>{ state.ui.tacticsTab="formation"; navigate("tactics"); switchPlan(pl.id); }));
  add("Aktion","Neuer Taktik-Plan","", ()=>{ state.ui.tacticsTab="formation"; navigate("tactics"); addPlan(); });
  if(state.customFormation) add("Formation", formationLabel(FREE), state.formationName===FREE?"aktiv":"eigene", ()=>{ state.formationName = FREE; selectedSlot = null; saveState(); renderTactics(); renderHeader(); navigate("tactics"); });
  Object.keys(FORMATIONS).forEach(f=> add("Formation", f, f===state.formationName?"aktiv":"", ()=>{ qs("#formationSelect").value=f; qs("#formationSelect").dispatchEvent(new Event("change")); navigate("tactics"); }));
  add("Daten","Admin-Bereich (Protokoll, Wiederherstellung, Datenprüfung)","", ()=>navigate("admin"));
  add("Hilfe",`Changelog – was ist neu in v${APP_VERSION}?`,"", ()=>{ adminTab = "changelog"; navigate("admin"); });
  add("Daten","Admin-Notizen","", ()=>{ adminTab = "notes"; navigate("admin"); });
  add("Daten","Eigene Felder (Spalten anlegen)","", ()=>{ adminTab = "fields"; navigate("admin"); });
  add("Daten","Wartung & Batch-Tools (aufräumen, umrechnen, zurücksetzen)","", ()=>{ adminTab = "maintenance"; navigate("admin"); });
  add("Daten","Letzte Änderung zurücknehmen","Strg+Z", undoLastChange);
  add("Daten","Wiederherstellungspunkt anlegen","", ()=>{ const r = createRestorePoint("Manuell gesichert", true); toast(r ? "Wiederherstellungspunkt angelegt" : "Speicher voll – bitte exportieren"); });
  add("Daten","Ordner-Sicherung einrichten / anzeigen","", ()=>{ adminTab = "restore"; navigate("admin"); });
  if(backupPerm === "granted") add("Daten","Ordner-Sicherung jetzt ausführen","", async ()=>{ if(await writeFolderBackup("Manuell")) toast("Gesichert"); });
  if(backupPerm === "prompt") add("Daten","Ordner-Sicherung fortsetzen","", resumeFolderBackup);
  add("Daten","Alles exportieren (Umzug in die App / auf ein anderes Gerät)","", exportAll);
  if(!isStandalone()) add("Daten","Als App installieren","", installApp);
  add("Daten","Spielstände verwalten","", openSlotsModal);
  add("Daten","Backup exportieren","", ()=>qs("#btnExport").click());
  add("Daten","Backup importieren","", ()=>qs("#btnImport").click());
  add("Daten","Einstellungen","", openSettingsModal);
  add("Layout","Layout anpassen","L", openLayoutModal);
  add("Layout", layout.theme === "light" ? "Dunkles Design" : "Helles Design", "", toggleTheme);
  add("Layout","Spalten im Kader ein-/ausblenden","", ()=>{ navigate("squad"); openColumnsModal(); });
  add("Layout","Spaltenbreiten zurücksetzen","", ()=>resetColumns());
  add("Layout","Alle Panels ausklappen","", ()=>setAllCollapsed(false));
  add("Layout","Alle Panels dieser Ansicht einklappen","", ()=>setAllCollapsed(true));
  add("Layout","Kompakte Ansicht umschalten","", ()=>{ layout.compact = !layout.compact; saveLayout(); applyLayout(); });
  add("Layout","Layout zurücksetzen","", resetLayout);
  add("Hilfe","Tastenkürzel anzeigen","?", openShortcutHelp);
  state.players.forEach(p=> add("Spieler", p.name, `${p.pos} · ${SQUAD_ROLES[p.squadRole]}`, ()=>{
    navigate("squad");
    ["#squadPosFilter","#squadRoleFilter","#squadStatusFilter"].forEach(s=>qs(s).value="");
    qs("#squadSearch").value = p.name; renderSquad(); openPlayerModal(p);
  }));
  state.scouting.forEach(t=> add("Transfer", t.name, `${t.pos} · ${t.grade} · ${SCOUT_STATUS[t.status]}`, ()=>{ navigate("recruitment"); qs("#scoutSearch").value = t.name; renderRecruitment(); }));
  state.prospects.forEach(p=> add("Talent", p.name, `${p.pos} · ${p.age} J.`, ()=>{ state.ui.devTab="prospects"; navigate("development"); renderDevelopment(); }));
  state.loans.forEach(l=> add("Leihe", l.name, l.club, ()=>{ state.ui.devTab="loans"; navigate("development"); renderDevelopment(); }));
  return c;
}
function fuzzyScore(text, q){
  text = text.toLowerCase();
  if(!q) return 1;
  const i = text.indexOf(q);
  if(i === 0) return 100; if(i > 0) return 60 - Math.min(i,40);
  let ti = 0;                       // subsequence match, e.g. "bst" → "Beste Elf"
  for(const ch of q){ ti = text.indexOf(ch, ti); if(ti < 0) return 0; ti++; }
  return 10;
}
function renderCmd(){
  const q = qs("#cmdInput").value.trim().toLowerCase();
  cmdItems = buildCommands().map(c=>({c, s: Math.max(fuzzyScore(c.label,q), fuzzyScore(c.grp+" "+c.label,q)*0.8)}))
    .filter(o=>o.s>0).sort((a,b)=>b.s-a.s).slice(0,30).map(o=>o.c);
  cmdIndex = clamp(cmdIndex, 0, Math.max(0, cmdItems.length-1));
  qs("#cmdList").innerHTML = cmdItems.map((c,i)=>`
    <li role="option" data-i="${i}" class="${i===cmdIndex?"active":""}" aria-selected="${i===cmdIndex}">
      <span><span class="grp">${esc(c.grp)}</span>${esc(c.label)}</span><span class="sub">${esc(c.sub)}</span></li>`).join("")
    || `<li class="empty">Nichts gefunden.</li>`;
  const act = qs("#cmdList li.active"); if(act) act.scrollIntoView({block:"nearest"});
}
function openCmd(){
  closeModal();
  qs("#cmdOverlay").classList.add("active");
  qs("#cmdInput").value = ""; cmdIndex = 0; renderCmd();
  qs("#cmdInput").focus();   // synchronous, so fast typing right after Ctrl+K is not lost
}
function closeCmd(){ qs("#cmdOverlay").classList.remove("active"); }
function runCmd(i){ const c = cmdItems[i]; if(!c) return; closeCmd(); c.run(); }
function initCmd(){
  qs("#btnCmd").addEventListener("click", openCmd);
  qs("#cmdInput").addEventListener("input", ()=>{ cmdIndex = 0; renderCmd(); });
  qs("#cmdInput").addEventListener("keydown", e=>{
    if(e.key === "ArrowDown"){ e.preventDefault(); cmdIndex = Math.min(cmdIndex+1, cmdItems.length-1); renderCmd(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); cmdIndex = Math.max(cmdIndex-1, 0); renderCmd(); }
    else if(e.key === "Enter"){ e.preventDefault(); runCmd(cmdIndex); }
    else if(e.key === "Escape"){ e.preventDefault(); closeCmd(); }
  });
  qs("#cmdList").addEventListener("click", e=>{ const li = e.target.closest("[data-i]"); if(li) runCmd(num(li.dataset.i)); });
  qs("#cmdOverlay").addEventListener("click", e=>{ if(e.target.id === "cmdOverlay") closeCmd(); });
}
function openShortcutHelp(){
  const map = hotkeyMap(), used = HOTKEY_ACTIONS().filter(x=>map[x[0]]);
  const fixed = [["<kbd>⠿</kbd> + Pfeiltasten","Fokussiertes Panel verschieben"],["<kbd>Esc</kbd>","Dialog schließen / Auswahl aufheben"]];
  openModal({title:"Tastenkürzel", body:`<table class="kbd-table">${used.map(x=>`<tr><td>${comboLabel(map[x[0]])}</td><td>${esc(x[1])}</td></tr>`).join("")}${fixed.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>`,
    leftButtons:`<button class="btn btn-sm" data-open-hk>Kürzel ändern …</button>`,
    onOpen: m=>{ qs("[data-open-hk]", m).onclick = ()=>{ closeModal(); openHotkeyModal(); }; }});
}
function newInCurrentView(){
  ({
    home: ()=>openGoalModal(null), squad: ()=>openPlayerModal(), recruitment: ()=> state.ui.transferTab === "sell" ? openSaleModal() : openTargetModal(),
    development: ()=> state.ui.devTab === "loans" ? openLoanModal() : openProspectModal(),
    notes: ()=>qs("#btnAddTodo").click(), fixtures: ()=>openResultModal(null), finance: openBalanceModal,
    tactics: ()=>toast("In der Taktik: Spieler per Drag & Drop aufstellen")
  })[currentView]();
}
function initShortcuts(){
  document.addEventListener("keydown", e=>{
    const modalOpen = qs("#modalOverlay").classList.contains("active");
    const cmdOpen = qs("#cmdOverlay").classList.contains("active");
    if(hkCapture) return;                                                      // the hotkey manager is listening
    if(hubView && !qs("#modalOverlay").classList.contains("active") && !qs("#cmdOverlay").classList.contains("active")){   // 11.4: the hub has its own keys
      if(typeof hubKey === "function" && hubKey(e)) return;
      const c = comboFromEvent(e), m = hotkeyMap(), a = c ? Object.keys(m).find(id=>m[id] === c) : null;
      if(["palette","saves","help","theme","session","diary"].includes(a)){ e.preventDefault(); runHotkey(a, e); }
      return;
    }
    const combo = comboFromEvent(e), map = hotkeyMap();
    const act = combo ? Object.keys(map).find(id=>map[id] === combo) : null;
    const withMod = combo.startsWith("mod+") || combo.startsWith("alt+");
    // the palette works everywhere (also while typing), other combos only outside inputs and dialogs
    if(act === "palette"){ e.preventDefault(); runHotkey(act, e); return; }
    if(withMod && act && !isTyping(e.target) && !modalOpen && !cmdOpen && !smOpen){ e.preventDefault(); runHotkey(act, e); return; }
    if(smOpen){ if(e.key === "Escape") closeSaveMenu(); return; }      // the save menu handles its own keys
    if(e.key === "Escape"){
      if(cmdOpen) return closeCmd();
      if(modalOpen) return closeModal();
      if(selectedSlot !== null && currentView === "tactics"){ selectedSlot = null; renderTactics(); }
      return;
    }
    if(modalOpen || cmdOpen || isTyping(e.target) || withMod) return;
    if(act){ e.preventDefault(); runHotkey(act, e); }
  });
}


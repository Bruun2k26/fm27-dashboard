/* ==========================================================================
   INIT
   ========================================================================== */
/* Performance (8.7): only the VISIBLE view is drawn. Every other view is drawn fresh by navigate()
   when it is opened, so hidden views never show stale data – they just aren't built for nothing. */
const VIEW_RENDERERS = () => ({home:renderHome, squad:renderSquad, tactics:renderTactics, recruitment:renderRecruitment,
  finance:renderFinance, development:renderDevelopment, fixtures:renderFixtures, notes:renderNotes, journey:renderJourney});
function renderAll(){
  renderSampleBanner();
  renderDeadlineBar();
  if(state && state.lists) applyLists(state.lists);
  renderHeader();
  const r = VIEW_RENDERERS()[currentView];
  if(r) withRenderCache(r);
  if(typeof hubView !== "undefined" && hubView) renderHub();      // 11.6: e.g. a save switched while the hub is open
}
/** Draws everything, visible or not (rarely needed – e.g. before printing). */
function renderEverything(){ Object.values(VIEW_RENDERERS()).forEach(f=>withRenderCache(f)); }
/* Per-render cache: expensive derived data (next-season squad) is computed once per drawing pass. */
let _renderCache = null;
function withRenderCache(fn){
  const outer = _renderCache === null;
  if(outer) _renderCache = {};
  try{ return fn(); } finally { if(outer) _renderCache = null; }
}

let _initDone = false;
function init(){
  if(_initDone) return;           // guard: listeners must never be registered twice
  _initDone = true;
  const firstStart = !readJSON(SLOT_INDEX_KEY) && !readJSON(LEGACY_KEY);   // measured before the index is created
  loadSlotIndex();
  state = loadSlot(slotIndex.active);
  loadLayout();
  enhancePanels();
  initNav(); initHome(); initSquad(); initTactics(); initRecruitment();
  initDevelopment(); initFixtures(); initFinance(); initAdmin(); initLists(); initBulkAndImport(); initColumnTools(); initSampleBanner(); initPhase10(); initFolderBackupUI(); initSideMenu(); initAdminNotes(); initAdminFields(); initMaintenance(); initTransferPlan(); initDeadline(); initLabs(); initTransferCenter(); initJourney(); initNotes(); initDataTools(); initCmd(); initShortcuts();
  qs("#btnSettings").addEventListener("click", openSettingsModal);
  qs("#btnLayout").addEventListener("click", openLayoutModal);
  qs("#btnNextDay").addEventListener("click", e=> nextDay(e.shiftKey ? 7 : 1));
  qs("#btnSlots").addEventListener("click", openSlotsModal);
  qs("#btnHotkeys").addEventListener("click", ()=>{ if(typeof closeMenu === "function") closeMenu(); openHotkeyModal(); });
  refreshHotkeyHints();
  qs("#btnNational").addEventListener("click", ()=>{ if(typeof closeMenu === "function") closeMenu(); openNationalModal(false); });
  qs("#btnLinkSwitch").addEventListener("click", switchLinked);
  qs("#natNomChip").addEventListener("click", ()=>{ qs("#squadStatusFilter").value = "nominated"; navigate("squad"); });
  qs("#natNomBox").addEventListener("click", e=>{
    const b = e.target.closest("[data-nat]"); if(!b) return;
    const [k, id] = b.dataset.nat.split(":");
    if(k === "saveCamp") natSaveCamp(); else if(k === "copy") natCopySquad(); else if(k === "reset") natResetNominations();
    else if(k === "load") natLoadCamp(id); else if(k === "del") natDeleteCamp(id);
  });
  const crest = qs("#crestBox");
  // 10.1 (Beta): crest = save manager (the portal has its own button right below)
  crest.addEventListener("click", ()=>smOpen ? closeSaveMenu() : openSaveMenu());
  crest.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); smOpen ? closeSaveMenu() : openSaveMenu(); }});
  qs("#modalOverlay").addEventListener("click", e=>{ if(e.target.id === "modalOverlay") closeModal(); });
  renderAll(); renderEverything();          // complete page once at start; afterwards only the visible view
  saveState();
  const announced = announceUpdate(firstStart);
  const migratedTo = migrateSharedJourney();
  if(migratedTo){ renderAll(); setTimeout(()=>toast(`Journey dem Spielstand „${migratedTo}“ zugeordnet – jeder Spielstand hat jetzt seine eigene Journey.`, {duration:9000}), announced ? 12000 : 1500); }
  const cleaned = autoCleanStorage();
  if(cleaned.count) setTimeout(()=>toast(`Speicher aufgeräumt: ${cleaned.count} Altlast${cleaned.count === 1 ? "" : "en"} entfernt (${fmtBytes(cleaned.freed)} frei)`), announced ? 10500 : 3000);
  const bosNew = checkBosman();
  if(bosNew.length){ saveState(); renderAll(); setTimeout(()=>toast(`⚖ Bosman: ${bosNew.length} Spieler in den letzten 6 Vertragsmonaten – als Aufgaben eingetragen (Portal → Offene Aufgaben)`, {duration:8000}), announced ? 11500 : 1200); }
  initAppShell(firstStart);
  hubInit(firstStart);                      // 11.4: the hub opens as start page (unless "start in" says otherwise)
  if(pendingLoadNotice){ toast(pendingLoadNotice); pendingLoadNotice = null; }
  else if(!announced) setTimeout(backupReminder, 1500);
}
/** 11.2: load the data (IndexedDB) first, then start – synchronous when there is no database */
function bootApp(){
  let p = null;
  try{ p = store.init(); }catch(e){ p = null; }
  if(p && typeof p.then === "function") p.then(()=>{ init(); storeNotice(); }, ()=>{ init(); storeNotice(); });
  else init();
}
function storeNotice(){
  const n = store.notice || "";
  if(n.startsWith("migrated:")) setTimeout(()=>toast(`Daten in die Browser-Datenbank umgezogen (${n.split(":")[1]} Einträge, geprüft) – mehr Platz für deine Karrieren.`, {duration:8000}), 1200);
  else if(n === "unavailable-data") setTimeout(()=>toast("Die Browser-Datenbank ist gerade nicht erreichbar – deine Daten liegen dort sicher. Bitte die Seite neu laden.", {duration:12000}), 800);
  else if(n === "unavailable") logError("IndexedDB nicht verfügbar – localStorage wird genutzt", store.lastError);
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootApp);
else bootApp();

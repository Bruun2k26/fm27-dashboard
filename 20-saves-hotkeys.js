/* ==========================================================================
   SPIELSTAND-MANAGER (live since 10.2) – quick switcher: search, ↑/↓, Enter, 1–9.
   Opened by the crest top left or the hotkey (default S).
   ========================================================================== */
let smOpen = false, smSel = 0, smQuery = "";
function slotSummaries(){
  return slotIndex.slots.map(meta=>{
    const act = meta.id === slotIndex.active;
    const d = act ? state : (readJSON(SLOT_PREFIX + meta.id) || {});
    const club = d.club || {}, nat = d.mode === "national", n = d.national || {};
    const res = Array.isArray(d.results) ? d.results : [], w = res.filter(r=>r.gf > r.ga).length, dr = res.filter(r=>r.gf === r.ga).length;
    const partner = d.link && slotIndex.slots.find(x=>x.id === d.link);
    return {id:meta.id, name:meta.name, updatedAt:meta.updatedAt, active:act, club:club.name || "", date:club.ingameDate || "", season:club.season || "",
      mode: nat ? "national" : "club", crest: nat ? (n.code || club.crest || "") : (club.crest || ""), accent: nat ? (n.accent || "#C9A227") : (club.accent || "#4f8cff"),
      colors: nat && Array.isArray(n.colors) && n.colors.length === 3 ? n.colors : null, players:(d.players || []).length,
      record: res.length ? `${w}-${dr}-${res.length - w - dr}` : "", journey: !!(d.journey && d.journey.active), link: partner ? partner.name : "", broken: !act && !readJSON(SLOT_PREFIX + meta.id)};
  }).sort((a,b)=>(b.active - a.active) || (b.updatedAt || 0) - (a.updatedAt || 0));
}
/** 11.6: readable initials on any club colour – white or dark, whichever contrasts more */
function crestText(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if(!m) return "#fff";
  const ch = i => { const v = parseInt(m[1].substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0555) ? "#fff" : "#0b0f18";
}
const smCrest = (x, cls) => x.colors
  ? `<span class="sm-crest flag ${cls || ""}" style="background:linear-gradient(180deg, ${x.colors[0]} 0 33.3%, ${x.colors[1]} 33.3% 66.6%, ${x.colors[2]} 66.6%)"><b>${esc(x.crest)}</b></span>`
  : `<span class="sm-crest ${cls || ""}" style="background:${esc(x.accent)};color:${crestText(x.accent)};${crestText(x.accent) === "#fff" ? "" : "text-shadow:none;"}">${esc(x.crest)}</span>`;
const smDate = x => x.date ? fmtDate(x.date, {day:"2-digit", month:"2-digit", year:"numeric"}) : "—";
const smBadges = x => `${x.mode === "national" ? '<span class="sm-badge nat">Nationalteam</span>' : ""}${x.link ? `<span class="sm-badge" title="verknüpft">⇄ ${esc(x.link)}</span>` : ""}${x.journey ? '<span class="sm-badge">🧭 Journey</span>' : ""}${x.broken ? '<span class="sm-badge neg">beschädigt</span>' : ""}`;
function openSaveMenu(){
  if(typeof closeMenu === "function") closeMenu();
  smOpen = true; smSel = 0; smQuery = "";
  let root = qs("#saveMenu");
  if(!root){ root = document.createElement("div"); root.id = "saveMenu"; document.body.appendChild(root); bindSaveMenu(root); }
  root.hidden = false;
  renderSaveMenu();
  const f = qs("#smSearch") || qs("#saveMenu [data-sm-open]"); if(f) f.focus();
}
function closeSaveMenu(){
  const root = qs("#saveMenu"); if(root){ root.hidden = true; root.innerHTML = ""; }
  smOpen = false; qs("#crestBox").focus({preventScroll:true});
}
function renderSaveMenu(){
  const root = qs("#saveMenu"); if(!root) return;
  const list = slotSummaries();
  root.className = "sm-root sm-switcher";
  const acts = x => `<span class="sm-acts"><button class="tc-arrow" data-sm-ren="${x.id}" title="Umbenennen" aria-label="${esc(x.name)} umbenennen">✎</button><button class="tc-arrow" data-sm-dup="${x.id}" title="Duplizieren" aria-label="${esc(x.name)} duplizieren">⧉</button><button class="tc-arrow" data-sm-del="${x.id}" title="Löschen" aria-label="${esc(x.name)} löschen" ${list.length < 2 ? "disabled" : ""}>✕</button></span>`;
  {
    const q = smQuery.trim().toLowerCase();
    const hits = list.filter(x=>!q || [x.name, x.club, x.season].join(" ").toLowerCase().includes(q));
    const news = [["empty","Neuer Spielstand (leer)"],["sample","Neuer Spielstand mit Beispieldaten"],["national","Neues Nationalteam"]].filter(([,l])=>!q || l.toLowerCase().includes(q));
    const items = hits.map(x=>({kind:"slot", x})).concat(news.map(([k,l])=>({kind:"new", k, l})));
    smSel = clamp(smSel, 0, Math.max(0, items.length - 1));
    root.innerHTML = `<div class="sm-backdrop" data-sm-close></div>
      <div class="sm-panel" role="dialog" aria-modal="true" aria-label="Spielstand wechseln">
        <input type="search" id="smSearch" autocomplete="off" placeholder="Spielstand suchen … (Name, Verein, Saison)" value="${esc(smQuery)}" aria-label="Spielstand suchen">
        <ul class="sm-results" role="listbox">${items.map((it,i)=>it.kind === "slot"
          ? `<li role="option" class="${i === smSel ? "sel" : ""} ${it.x.active ? "active" : ""}" data-sm-idx="${i}" ${it.x.active ? "" : `data-sm-open="${it.x.id}"`}>
              <kbd>${i < 9 ? i + 1 : ""}</kbd>${smCrest(it.x)}<span class="sm-row-main"><strong>${esc(it.x.name)}</strong><span>${esc(it.x.club)} · ${smDate(it.x)}${it.x.season ? " · " + esc(it.x.season) : ""}</span></span>
              <span class="sm-row-right">${smBadges(it.x)}${it.x.active ? '<span class="sm-badge ok">aktiv</span>' : ""}${acts(it.x)}</span></li>`
          : `<li role="option" class="sm-new-item ${i === smSel ? "sel" : ""}" data-sm-idx="${i}" data-sm-new="${it.k}"><kbd>+</kbd><span class="sm-row-main"><strong>${esc(it.l)}</strong></span></li>`).join("") || '<li class="sm-empty">Nichts gefunden.</li>'}</ul>
        <div class="sm-foot"><span class="sm-keys"><kbd>↑</kbd><kbd>↓</kbd> wählen · <kbd>Enter</kbd> öffnen · <kbd>1</kbd>–<kbd>9</kbd> direkt · <kbd>Esc</kbd> schließen</span><button class="linkish" data-sm-classic>Klassische Verwaltung</button></div>
      </div>`;
    const sel = qs("#saveMenu .sm-results li.sel"); if(sel) sel.scrollIntoView({block:"nearest"});
  }
}
function smCreate(kind){
  saveState();
  const fresh = freshState(kind === "sample" ? "sample" : "empty");
  if(kind === "national"){ fresh.mode = "national"; fresh.club.name = "Nationalteam"; fresh.club.ingameDate = state.club.ingameDate; fresh.club.season = state.club.season; }
  const newId = createSlot(kind === "sample" ? "Beispiel-Karriere" : kind === "national" ? "Nationalteam" : `Karriere ${slotIndex.slots.length+1}`, sanitizeState(fresh));
  closeSaveMenu(); switchSlot(newId);
  if(kind === "empty") setTimeout(openSettingsModal, 50);
  if(kind === "national") setTimeout(()=>openNationalModal(true), 50);
  toast("Neuer Spielstand angelegt");
}
function smRename(id){
  const meta = slotIndex.slots.find(s=>s.id === id); if(!meta) return;
  closeSaveMenu();
  openModal({title:"Spielstand umbenennen", body:`<div class="field"><label>Name</label><input data-f="name" value="${esc(meta.name)}" maxlength="60"></div>`, saveLabel:"Speichern",
    onSave: get=>{ const n = get("name").trim(); if(!n) return false; meta.name = n; writeIndex(); renderHeader(); toast("Umbenannt"); setTimeout(()=>openSaveMenu(), 30); }});
}
function smDuplicate(id){
  if(id === slotIndex.active) saveState();
  const data = readJSON(SLOT_PREFIX + id) || state, meta = slotIndex.slots.find(s=>s.id === id);
  createSlot(meta.name + " (Kopie)", data);
  toast(`„${meta.name}“ dupliziert`); renderSaveMenu();
}
function smDelete(id){
  const meta = slotIndex.slots.find(s=>s.id === id); if(!meta || slotIndex.slots.length < 2) return;
  closeSaveMenu();
  openModal({title:`„${meta.name}“ löschen?`, body:`<p class="lead">Der Spielstand wird endgültig gelöscht – samt Protokoll und Wiederherstellungspunkten. Ohne Export ist er danach weg.</p>`, saveLabel:"Endgültig löschen",
    onSave: ()=>{
      slotIndex.slots = slotIndex.slots.filter(s=>s.id !== id);
      [SLOT_PREFIX, LOG_PREFIX, RP_PREFIX].forEach(p=>store.removeItem(p + id));
      writeIndex();
      if(id === slotIndex.active) switchSlot(slotIndex.slots[0].id);
      toast(`„${meta.name}“ gelöscht`); setTimeout(()=>openSaveMenu(), 30);
    }});
}
function bindSaveMenu(root){
  root.addEventListener("click", e=>{
    const t = e.target;
    if(t.closest("[data-sm-close]")) return closeSaveMenu();
    if(t.closest("[data-sm-classic]")){ closeSaveMenu(); return openSlotsModal(); }
    const ren = t.closest("[data-sm-ren]"); if(ren) return smRename(ren.dataset.smRen);
    const dup = t.closest("[data-sm-dup]"); if(dup) return smDuplicate(dup.dataset.smDup);
    const del = t.closest("[data-sm-del]"); if(del) return smDelete(del.dataset.smDel);
    const nw = t.closest("[data-sm-new]"); if(nw) return smCreate(nw.dataset.smNew);
    const op = t.closest("[data-sm-open]"); if(op){ const id = op.dataset.smOpen; closeSaveMenu(); switchSlot(id); toast(`Spielstand „${(activeSlotMeta() || {}).name}“ geladen`); }
  });
  root.addEventListener("input", e=>{ if(e.target.id === "smSearch"){ smQuery = e.target.value; smSel = 0; const pos = e.target.selectionStart; renderSaveMenu(); const f = qs("#smSearch"); f.focus(); f.setSelectionRange(pos, pos); } });
  root.addEventListener("keydown", e=>{
    if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); return closeSaveMenu(); }
    const items = qsa("#saveMenu .sm-results li[data-sm-idx]");
    if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); smSel = clamp(smSel + (e.key === "ArrowDown" ? 1 : -1), 0, items.length - 1); items.forEach((li,i)=>li.classList.toggle("sel", i === smSel)); if(items[smSel]) items[smSel].scrollIntoView({block:"nearest"}); }
    else if(e.key === "Enter"){ e.preventDefault(); const li = items[smSel]; if(li) (li.querySelector("[data-sm-open]") || li).click(); }
    else if(/^[1-9]$/.test(e.key) && (e.target.id !== "smSearch" || !smQuery)){ e.preventDefault(); const li = items[num(e.key) - 1]; if(li && !li.classList.contains("sm-new-item")) li.click(); }
  });
}


/* ==========================================================================
   TASTENKÜRZEL-MANAGER (10.2) – every action has a default key, you can change it.
   Stored for all saves. Combos: "mod+k" (Strg/⌘), "shift+t", "alt+x", or a single key.
   ========================================================================== */
const HOTKEY_KEY = "fm27_hotkeys";
const HOTKEY_ACTIONS = () => [
  ["palette","Befehlspalette öffnen","mod+k","Allgemein"],
  ["undo","Letzte Änderung zurücknehmen","mod+z","Allgemein"],
  ["help","Tastenkürzel-Übersicht","?","Allgemein"],
  ["saves","Spielstand wechseln","s","Allgemein"],
  ["search","Suchfeld im aktuellen Modul","/","Allgemein"],
  ["newItem","Neuer Eintrag im aktuellen Modul","n","Allgemein"],
  ["nextDay","Spieldatum +1 Tag","t","Spieltag"],
  ["nextWeek","Spieldatum +7 Tage","shift+t","Spieltag"],
  ["bestXI","Beste Elf aufstellen","b","Spieltag"],
  ["print","Matchday-Briefing drucken","p","Spieltag"],
  ["layout","Layout anpassen","l","Ansicht"],
  ["theme","Hell / Dunkel umschalten","","Ansicht"],
  ["linkSwitch","⇄ Verein / Nationalteam wechseln","","Ansicht"],
  ["admin","Admin-Bereich öffnen","","Ansicht"],
  ["export","Spielstand exportieren","","Ansicht"],
  ["hub","Gaming-Hub öffnen","h","Allgemein"],
  ["aiPrompt","KI-Prompt kopieren (Beta)","","Spieltag"],
  ["diary","Spiel-Tagebuch öffnen (Beta)","","Allgemein"],
  ["career","Karriere-Begleiter öffnen (Beta)","","Allgemein"],
  ["session","Session starten / beenden (Beta)","","Allgemein"],
  ...VIEWS.map((v,i)=>["view:" + v, `Modul: ${VIEW_LABEL[v]}`, String(i+1), "Module"])
];
const HK_RESERVED = new Set(["escape","enter","tab","arrowup","arrowdown","arrowleft","arrowright","backspace","delete"," ","shift","control","alt","meta","altgraph","capslock","contextmenu"]);
let hkCapture = null;
function hotkeyMap(){
  const saved = readJSON(HOTKEY_KEY) || {}, map = {};
  HOTKEY_ACTIONS().forEach(([id,,def])=>{ map[id] = typeof saved[id] === "string" ? saved[id] : def; });
  return map;
}
/** "mod+k", "shift+t", "?" … – shift only counts for letters (on many layouts "?" or "/" already need shift). */
function comboFromEvent(e){
  const k = (e.key || "").toLowerCase(); if(!k || HK_RESERVED.has(k)) return k && !["shift","control","alt","meta","altgraph"].includes(k) ? "#" + k : "";
  const parts = [];
  if(e.ctrlKey || e.metaKey) parts.push("mod");
  if(e.altKey) parts.push("alt");
  if(e.shiftKey && /^[a-z]$/.test(k)) parts.push("shift");
  return parts.concat(k).join("+");
}
function comboLabel(c){
  if(!c) return '<span class="muted">—</span>';
  return c.split("+").map(p=>`<kbd>${esc({mod:"Strg/⌘", shift:"Shift", alt:"Alt"}[p] || (p.length === 1 ? p.toUpperCase() : p))}</kbd>`).join(" + ");
}
function runHotkey(id, e){
  if(id.startsWith("view:")) return navigate(id.slice(5));
  switch(id){
    case "palette": { const open = qs("#cmdOverlay").classList.contains("active"); return open ? closeCmd() : openCmd(); }
    case "undo": return undoLastChange();
    case "help": return openShortcutHelp();
    case "saves": return openSaveMenu();
    case "search": { const sel = {squad:"#squadSearch", recruitment:"#scoutSearch"}[currentView]; return sel ? qs(sel).focus() : openCmd(); }
    case "newItem": return newInCurrentView();
    case "nextDay": return nextDay(1);
    case "nextWeek": return nextDay(7);
    case "bestXI": state.ui.tacticsTab = "formation"; navigate("tactics"); return runBestXI();
    case "print": return printBriefing();
    case "layout": return openLayoutModal();
    case "theme": return toggleTheme();
    case "linkSwitch": return linkedPartnerId() ? switchLinked() : toast("Kein verknüpfter Spielstand (Nationalteam-Einstellungen).");
    case "admin": return navigate("admin");
    case "export": return qs("#btnExport").click();
    case "hub": return showHub("home");
    case "aiPrompt": navigate("tactics"); return openAiPromptModal();
    case "diary": return showHub("diary");
    case "career": return showHub("career");
    case "session": if(!diary) loadDiary(); return diary.running ? (showHub("diary"), sessionModal(diary.running, true)) : startSession();
  }
}
/** Key hints in the gear menu follow your own keys. */
function refreshHotkeyHints(){
  const map = hotkeyMap();
  qsa("[data-hk-hint]").forEach(k=>{ const c = map[k.dataset.hkHint]; k.hidden = !c;
    k.textContent = c ? c.split("+").map(x=>({mod:"Strg", shift:"Shift", alt:"Alt"}[x] || (x.length === 1 ? x.toUpperCase() : x))).join(" ") : ""; });
}
function openHotkeyModal(){
  const render = () => {
    const map = hotkeyMap(), groups = {};
    HOTKEY_ACTIONS().forEach(a=>{ (groups[a[3]] = groups[a[3]] || []).push(a); });
    return Object.entries(groups).map(([g, list])=>`<div class="tc-sub-head">${esc(g)}</div><table class="kbd-table hk-table">${list.map(([id, label, def])=>`<tr>
      <td>${esc(label)}</td>
      <td><button class="hk-btn ${hkCapture === id ? "capturing" : ""}" data-hk="${id}" aria-label="Kürzel für ${esc(label)} ändern">${hkCapture === id ? "Taste drücken … (Esc = abbrechen, Entf = entfernen)" : comboLabel(map[id])}</button></td>
      <td>${map[id] !== def ? `<button class="tc-arrow" data-hk-reset="${id}" title="Standard: ${esc(def || "keins")}" aria-label="${esc(label)} zurücksetzen">↺</button>` : ""}</td></tr>`).join("")}</table>`).join("");
  };
  const refresh = () => { const b = qs("#hkBody"); if(b) b.innerHTML = render(); };
  const save = map => { const def = Object.fromEntries(HOTKEY_ACTIONS().map(a=>[a[0], a[2]])); const out = {}; Object.entries(map).forEach(([k,v])=>{ if(v !== def[k]) out[k] = v; }); store.setItem(HOTKEY_KEY, JSON.stringify(out)); refreshHotkeyHints(); };
  const onKey = e=>{
    if(!hkCapture) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const k = (e.key || "").toLowerCase();
    if(["shift","control","alt","meta","altgraph"].includes(k)) return;      // wait for the real key
    const id = hkCapture; hkCapture = null;
    if(k === "escape"){ refresh(); return; }
    const map = hotkeyMap();
    if(k === "backspace" || k === "delete"){ map[id] = ""; save(map); refresh(); toast("Kürzel entfernt"); return; }
    const combo = comboFromEvent(e);
    if(!combo || combo.startsWith("#")){ refresh(); toast("Diese Taste ist reserviert (Esc, Enter, Tab, Pfeiltasten …)."); return; }
    const other = Object.keys(map).find(x=>x !== id && map[x] === combo);
    if(other){ map[other] = ""; toast(`„${combo.replace("mod","Strg")}“ war bei „${(HOTKEY_ACTIONS().find(a=>a[0] === other) || [])[1]}“ – dort entfernt.`, {duration:6000}); }
    map[id] = combo; save(map); refresh();
  };
  openModal({title:"Tastenkürzel", wide:true, body:`<p class="lead" style="margin-top:0">Klick auf ein Kürzel, dann die neue Taste drücken – auch mit <kbd>Strg</kbd>, <kbd>Alt</kbd> oder <kbd>Shift</kbd>. Die Einstellung gilt für alle Spielstände.</p><div id="hkBody">${render()}</div>`,
    leftButtons:`<button class="btn btn-sm" data-hk-all>Alle zurücksetzen</button>`, saveLabel:"Fertig",
    onOpen: m=>{
      document.addEventListener("keydown", onKey, true);
      m.addEventListener("click", e=>{
        const b = e.target.closest("[data-hk]"); if(b){ hkCapture = hkCapture === b.dataset.hk ? null : b.dataset.hk; refresh(); const again = qs(`[data-hk="${b.dataset.hk}"]`, m); if(again) again.focus(); return; }
        const r = e.target.closest("[data-hk-reset]"); if(r){ const map = hotkeyMap(), def = HOTKEY_ACTIONS().find(a=>a[0] === r.dataset.hkReset)[2];
          const other = Object.keys(map).find(x=>x !== r.dataset.hkReset && map[x] === def && def); if(other) map[other] = "";
          map[r.dataset.hkReset] = def; save(map); refresh(); return; }
        if(e.target.closest("[data-hk-all]")){ const before = store.getItem(HOTKEY_KEY); store.removeItem(HOTKEY_KEY); hkCapture = null; refresh(); refreshHotkeyHints();
          toast("Alle Kürzel zurückgesetzt", {onUndo:()=>{ if(before) store.setItem(HOTKEY_KEY, before); refresh(); refreshHotkeyHints(); }}); }
      });
    },
    onClose: ()=>{ hkCapture = null; document.removeEventListener("keydown", onKey, true); },
    onSave: ()=>{ hkCapture = null; document.removeEventListener("keydown", onKey, true); }});
}


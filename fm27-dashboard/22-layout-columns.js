/* ==========================================================================
   LAYOUT — reorder, collapse, hide panels (global, not per save)
   ========================================================================== */
const LAYOUT_KEY = "fm27_layout";
const PORTAL_PANEL_NAMES = {nextMatch:"Nächstes Spiel", form:"Form", squadPlan:"Kaderplan", goals:"Vorstandsziele",
  contracts:"Vertragsfristen", xi:"Startelf", todos:"Offene Aufgaben", loans:"Leihen im Blick"};
let layout = {order:{}, collapsed:{}, hidden:{}, compact:false};
const _defaultOrder = {};

function loadLayout(){
  const raw = readJSON(LAYOUT_KEY);
  const obj = (v)=> (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
  if(raw && typeof raw === "object"){
    layout.order = {};
    Object.entries(obj(raw.order)).forEach(([z, ids])=>{ if(Array.isArray(ids)) layout.order[z] = ids.filter(x=>typeof x === "string"); });
    layout.collapsed = obj(raw.collapsed);
    layout.hidden = obj(raw.hidden);
    layout.compact = !!raw.compact;
    layout.theme = raw.theme === "light" ? "light" : "dark";
  }
}
function saveLayout(){
  try{ store.setItem(LAYOUT_KEY, JSON.stringify(layout)); }catch(e){ /* non-critical */ }
}
const panelKey = el => `${el.parentElement.dataset.layout}:${el.dataset.panel}`;
const zonePanels = zone => qsa(":scope > [data-panel]", zone);

/** Adds grip + collapse controls to every panel and wraps its content in .panel-body (runs once). */
function enhancePanels(){
  qsa("[data-layout]").forEach(zone=>{
    _defaultOrder[zone.dataset.layout] = zonePanels(zone).map(p=>p.dataset.panel);
    zonePanels(zone).forEach(panel=>{
      const head = qs(":scope > .card-head, :scope > .side-head", panel);
      const body = document.createElement("div");
      body.className = "panel-body";
      while(head.nextSibling) body.appendChild(head.nextSibling);
      panel.appendChild(body);
      panel.classList.add("panel");
      const title = (qs("h2, h3", head) || {}).textContent || panel.dataset.panel;
      const grip = document.createElement("button");
      grip.type = "button"; grip.className = "p-grip"; grip.textContent = "⠿";
      grip.title = "Ziehen zum Verschieben · Pfeiltasten verschieben";
      grip.setAttribute("aria-label", `${title} verschieben`);
      head.insertBefore(grip, head.firstChild);
      const col = document.createElement("button");
      col.type = "button"; col.className = "p-collapse"; col.textContent = "▾";
      col.setAttribute("aria-label", `${title} ein-/ausklappen`);
      head.appendChild(col);
      head.classList.add("panel-head");
    });
  });
  applyLayout();

  document.addEventListener("click", e=>{
    const c = e.target.closest(".p-collapse"); if(!c) return;
    togglePanel(c.closest("[data-panel]"));
  });
  // Double-click on a panel title also toggles.
  document.addEventListener("dblclick", e=>{
    const h = e.target.closest(".panel-head"); if(!h || e.target.closest("button, input, select, textarea")) return;
    togglePanel(h.closest("[data-panel]"));
  });
  initPanelDrag();
}
function togglePanel(panel){
  const k = panelKey(panel);
  if(layout.collapsed[k]) delete layout.collapsed[k]; else layout.collapsed[k] = true;
  saveLayout(); applyLayout();
}

/** Applies stored order, collapsed and hidden state to the DOM. */
function applyLayout(){
  document.body.classList.toggle("compact", layout.compact);
  qsa("[data-layout]").forEach(zone=>{
    const z = zone.dataset.layout, def = _defaultOrder[z] || [];
    const saved = (layout.order[z] || []).filter(id=>def.includes(id));
    const order = saved.concat(def.filter(id=>!saved.includes(id)));
    const byId = {}; zonePanels(zone).forEach(p=>byId[p.dataset.panel] = p);
    order.forEach(id=>{ if(byId[id]) zone.appendChild(byId[id]); });
    zonePanels(zone).forEach(p=>{
      const k = panelKey(p), collapsed = !!layout.collapsed[k];
      p.classList.toggle("collapsed", collapsed);
      p.classList.toggle("panel-hidden", !!layout.hidden[k]);
      const c = qs(".p-collapse", p);
      if(c){ c.setAttribute("aria-expanded", String(!collapsed)); c.title = collapsed ? "Ausklappen" : "Einklappen"; }
    });
  });
}
function storeOrder(zone){
  layout.order[zone.dataset.layout] = zonePanels(zone).map(p=>p.dataset.panel);
  saveLayout();
}

/* ---------- Panel drag (pointer) & keyboard reorder ---------- */
let pdrag = null;
function initPanelDrag(){
  document.addEventListener("pointerdown", e=>{
    const grip = e.target.closest(".p-grip"); if(!grip || e.button > 0) return;
    e.preventDefault();
    const panel = grip.closest("[data-panel]"), zone = panel.parentElement;
    const r = panel.getBoundingClientRect();
    pdrag = {panel, zone, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, started:false, ph:null, w:r.width, h:r.height};
  });
  document.addEventListener("pointermove", e=>{
    if(!pdrag) return;
    const d = pdrag;
    if(!d.started){
      if(Math.hypot(e.clientX-d.x0, e.clientY-d.y0) < 5) return;
      d.started = true;
      d.ph = document.createElement("div");
      d.ph.className = d.panel.className.replace(/\bpanel\b/,"") + " panel-placeholder";
      d.ph.style.height = d.h + "px";
      d.zone.insertBefore(d.ph, d.panel);
      Object.assign(d.panel.style, {position:"fixed", width:d.w+"px", height:d.h+"px", zIndex:400, pointerEvents:"none"});
      d.panel.classList.add("panel-dragging");
      document.body.classList.add("dragging");
    }
    e.preventDefault();
    d.panel.style.left = (e.clientX - d.dx) + "px";
    d.panel.style.top = (e.clientY - d.dy) + "px";
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const target = over && over.closest("[data-panel]");
    if(!target || target === d.panel || target.parentElement !== d.zone) return;
    const r = target.getBoundingClientRect();
    // same row → decide by x, otherwise by y
    const before = (e.clientY < r.top + r.height*0.25) || (e.clientY <= r.bottom - r.height*0.25 && e.clientX < r.left + r.width/2);
    d.zone.insertBefore(d.ph, before ? target : target.nextSibling);
  }, {passive:false});
  const end = ()=>{
    if(!pdrag) return;
    const d = pdrag; pdrag = null;
    if(!d.started) return;
    d.zone.insertBefore(d.panel, d.ph);
    d.ph.remove();
    d.panel.removeAttribute("style");
    d.panel.classList.remove("panel-dragging");
    document.body.classList.remove("dragging");
    storeOrder(d.zone);
    const g = qs(".p-grip", d.panel); if(g) g.focus({preventScroll:true});
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  document.addEventListener("keydown", e=>{
    const grip = e.target.closest && e.target.closest(".p-grip"); if(!grip) return;
    const dir = {ArrowUp:-1, ArrowLeft:-1, ArrowDown:1, ArrowRight:1}[e.key]; if(!dir) return;
    e.preventDefault();
    const panel = grip.closest("[data-panel]"), zone = panel.parentElement;
    const list = zonePanels(zone).filter(p=>!p.classList.contains("panel-hidden"));
    const i = list.indexOf(panel), j = i + dir;
    if(j < 0 || j >= list.length) return;
    if(dir < 0) zone.insertBefore(panel, list[j]); else zone.insertBefore(panel, list[j].nextSibling);
    storeOrder(zone); grip.focus();
    toast(`„${(qs("h2, h3", panel)||{}).textContent}“ verschoben`);
  });
}

function resetLayout(){
  const snap = JSON.stringify(layout);
  layout = {order:{}, collapsed:{}, hidden:{}, compact:false, theme:layout.theme};   // the colour theme is not "layout"
  saveLayout(); applyLayout();
  toast("Layout zurückgesetzt", {onUndo:()=>{ layout = JSON.parse(snap); saveLayout(); applyLayout(); }});
}
function setAllCollapsed(collapsed){
  qsa("[data-panel]").forEach(p=>{
    const k = panelKey(p);
    if(collapsed && p.closest(".view.active")) layout.collapsed[k] = true;
    if(!collapsed) delete layout.collapsed[k];
  });
  saveLayout(); applyLayout();
}
function openLayoutModal(){
  openModal({
    title:"Layout",
    body:`
      <p class="lead">Panels verschiebst du am Griff <strong>⠿</strong> (oder per Pfeiltasten), einklappen per <strong>▾</strong> oder Doppelklick auf den Titel. Das Layout gilt für alle Spielstände.</p>
      <div class="field"><label>Karten im Portal</label>
        <div class="layout-checks">${Object.entries(PORTAL_PANEL_NAMES).map(([id,name])=>
          `<label class="check-label"><input type="checkbox" data-lay-show="home:${id}" ${layout.hidden["home:"+id] ? "" : "checked"}> ${name}</label>`).join("")}</div>
      </div>
      <label class="check-label" style="margin-top:4px"><input type="checkbox" data-f="compact" ${layout.compact?"checked":""}> Kompakte Ansicht (weniger Abstände, mehr auf einen Blick)</label>`,
    leftButtons:`<button class="btn btn-sm" data-lay="expand">Alle ausklappen</button><button class="btn btn-sm btn-danger-outline" data-lay="reset">Layout zurücksetzen</button>`,
    onOpen: m=>{
      m.onchange = e=>{
        const cb = e.target.closest("[data-lay-show]");
        if(cb){ if(cb.checked) delete layout.hidden[cb.dataset.layShow]; else layout.hidden[cb.dataset.layShow] = true; }
        if(e.target.dataset.f === "compact") layout.compact = e.target.checked;
        saveLayout(); applyLayout();
      };
      m.onclick = e=>{
        const b = e.target.closest("[data-lay]"); if(!b) return;
        if(b.dataset.lay === "reset"){ closeModal(); resetLayout(); }
        else { setAllCollapsed(false); toast("Alle Panels ausgeklappt"); }
      };
    }
  });
}

// Money inputs show the formatted amount as soon as a value is committed (Enter/Tab/blur).
// Capture phase → runs before the module handlers, which parse the same number again.
const reformatMoney = e=>{
  const el = e.target;
  if(el && el.dataset && "money" in el.dataset) el.value = fmtNum(parseMoney(el.value));
};
document.addEventListener("change", reformatMoney, true);
document.addEventListener("focusout", reformatMoney);

/* ==========================================================================
   COLUMNS — resize like a spreadsheet, hide/show (global, like the layout)
   ========================================================================== */
const COL_KEY = "fm27_columns";
const RESIZABLE_TABLES = ["squadTable","scoutTable","salesTable","prospectTable","loanTable"];
const SQUAD_COL_NAMES = {pos:"Position", nation:"Land", age:"Alter", squadRole:"Kaderrolle", rating:"Einschätzung", salary:"Gehalt",
  valueMax:"Transferwert", contractUntil:"Vertrag", status:"Status", note:"Notiz"};
const COL_MIN = 44, COL_MAX = 700;
let colPrefs = {widths:{}, hidden:{}, order:{}};

function loadColPrefs(){
  const raw = readJSON(COL_KEY), ok = v => v && typeof v === "object" && !Array.isArray(v);
  colPrefs = {widths:{}, hidden:{}, order:{}};
  if(!ok(raw)) return;
  if(ok(raw.order)) Object.entries(raw.order).forEach(([t, list])=>{ if(Array.isArray(list)) colPrefs.order[t] = [...new Set(list.filter(x=>typeof x === "string" && x !== "sel" && x !== "actions"))]; });
  if(ok(raw.widths)) Object.entries(raw.widths).forEach(([t, w])=>{
    if(!ok(w)) return;
    colPrefs.widths[t] = {};
    Object.entries(w).forEach(([k, v])=>{ const n = Math.round(num(v)); if(n) colPrefs.widths[t][k] = clamp(n, COL_MIN, COL_MAX); });
  });
  if(ok(raw.hidden)) Object.entries(raw.hidden).forEach(([t, list])=>{ if(Array.isArray(list)) colPrefs.hidden[t] = list.filter(x=>typeof x === "string" && x !== "name"); });
}
function saveColPrefs(){ try{ store.setItem(COL_KEY, JSON.stringify(colPrefs)); }catch(e){} }
const isColHidden = (tableId, key) => (colPrefs.hidden[tableId] || []).includes(key);
function visibleHeads(table){
  return qsa("thead th", table).filter(th=>!th.hidden && !isColHidden(table.id, th.dataset.col));
}
/** Fixed widths (table-layout: fixed) once the user resized something; otherwise the normal automatic layout. */
function applyColWidths(tableId){
  const table = qs("#" + tableId); if(!table) return;
  const w = colPrefs.widths[tableId];
  const on = !!w && Object.keys(w).length > 0;
  table.classList.toggle("custom-widths", on);
  if(!on){ table.style.width = ""; table.style.minWidth = ""; qsa("thead th", table).forEach(th=>th.style.width = ""); return; }
  let sum = 0;
  visibleHeads(table).forEach(th=>{
    const px = w[th.dataset.col] || (th.classList.contains("sel-col") ? 34 : th.dataset.col === "actions" ? 90 : 110);
    th.style.width = px + "px"; sum += px;
  });
  table.style.width = sum + "px"; table.style.minWidth = "0";
}
function applyHiddenCols(){
  let st = qs("#colHideStyle");
  if(!st){ st = document.createElement("style"); st.id = "colHideStyle"; document.head.appendChild(st); }
  st.textContent = Object.entries(colPrefs.hidden).map(([t, list])=>list.map(k=>`#${t} [data-col="${k}"]{display:none !important;}`).join("\n")).join("\n");
  RESIZABLE_TABLES.forEach(applyColWidths);
}
/** Cells belonging to a header: by column key (squad) or by position. */
function columnCells(table, th){
  const key = th.dataset.col;
  const byKey = qsa(`tbody td[data-col="${key}"]`, table);
  if(byKey.length) return byKey;
  const idx = qsa("thead th", table).indexOf(th);
  return qsa("tbody tr", table).map(tr=>tr.cells[idx]).filter(Boolean);
}
let _measureCtx = null;
function textWidth(text, el){
  if(!_measureCtx){ const c = document.createElement("canvas"); _measureCtx = c.getContext ? c.getContext("2d") : null; }
  const cs = getComputedStyle(el);
  if(!_measureCtx || !_measureCtx.measureText) return String(text).length * (parseFloat(cs.fontSize) || 13) * 0.6;
  _measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return _measureCtx.measureText(String(text)).width;
}
/** Double-click on a column border: fit to the widest content (like Excel). */
function autoFitColumn(table, th){
  let max = textWidth(th.textContent.trim(), th) + 30;
  columnCells(table, th).slice(0, 300).forEach(td=>{
    const ctl = td.querySelector("input:not([type=checkbox]), select");
    const text = ctl ? (ctl.tagName === "SELECT" ? (ctl.selectedOptions[0] || {}).text || "" : ctl.value || ctl.placeholder || "") : td.textContent.trim();
    const extra = ctl ? (ctl.tagName === "SELECT" ? 46 : 30) : 22;
    max = Math.max(max, textWidth(text, ctl || td) + extra + (td.querySelector(".avatar") ? 36 : 0));
  });
  setColWidth(table, th, max);
  saveColPrefs();
}
function setColWidth(table, th, px){
  const t = table.id;
  if(!colPrefs.widths[t] || !Object.keys(colPrefs.widths[t]).length){
    // first resize: freeze all current widths so nothing else jumps
    colPrefs.widths[t] = {};
    visibleHeads(table).forEach(h=>{ colPrefs.widths[t][h.dataset.col] = clamp(Math.round(h.getBoundingClientRect().width) || 110, COL_MIN, COL_MAX); });
  }
  colPrefs.widths[t][th.dataset.col] = clamp(Math.round(px), COL_MIN, COL_MAX);
  applyColWidths(t);
}
let colDrag = null;
/* ---------- column order (9.1): drag a column head like in Excel/Sheets ----------
   Selection (first) and actions (last) stay fixed; everything else – incl. custom fields – can move. */
const COL_FIXED = new Set(["sel","actions"]);
const colDefaultOrder = {};     // the order from the HTML – needed to go back after "reset"
function currentColOrder(tableId){
  const table = qs("#" + tableId); if(!table) return [];
  return qsa("thead th", table).map(th=>th.dataset.col).filter(k=>k && !COL_FIXED.has(k));
}
/** Puts heads and cells into the saved order (called after each render). */
function applyColOrder(tableId){
  const table = qs("#" + tableId);
  // heads are really moved in the page → without a saved order go back to the original one
  const order = (colPrefs.order[tableId] && colPrefs.order[tableId].length) ? colPrefs.order[tableId] : colDefaultOrder[tableId];
  if(!table || !order || !order.length){ markColDraggable(tableId); return; }
  const rank = k => { const i = order.indexOf(k); return i < 0 ? order.length + 1 : i; };
  const sortCells = (cells, keyOf) => {
    const movable = cells.filter(c=>!COL_FIXED.has(keyOf(c)));
    const orig = new Map(movable.map((c,i)=>[c, i]));
    return movable.slice().sort((a,b)=>rank(keyOf(a)) - rank(keyOf(b)) || orig.get(a) - orig.get(b));
  };
  const headRow = table.tHead && table.tHead.rows[0]; if(!headRow) return;
  const heads = [...headRow.cells], actH = heads.find(th=>th.dataset.col === "actions") || null;
  sortCells(heads, th=>th.dataset.col).forEach(th=>headRow.insertBefore(th, actH));
  qsa("tbody tr", table).forEach(tr=>{
    if(tr.classList.contains("empty-row")) return;
    const cells = [...tr.cells], act = cells.find(td=>td.dataset.col === "actions") || null;
    sortCells(cells, td=>td.dataset.col).forEach(td=>tr.insertBefore(td, act));
  });
  applyColWidths(tableId);
  markColDraggable(tableId);
}
/** Every movable head is draggable – set right while drawing (custom-field heads are created on each render). */
function markColDraggable(tableId){
  const table = qs("#" + tableId); if(!table) return;
  qsa("thead th", table).forEach(th=>{ th.draggable = !!(th.dataset.col && !COL_FIXED.has(th.dataset.col) && th.textContent.trim()); });
}
function moveColumn(tableId, key, targetKey, after){
  const order = currentColOrder(tableId).filter(k=>k !== key);
  let i = order.indexOf(targetKey); if(i < 0) i = order.length; else if(after) i++;
  order.splice(i, 0, key);
  colPrefs.order[tableId] = order; saveColPrefs();
  applyColOrder(tableId);
}
let colMove = null;
function initColumnOrder(){
  const table = qs("#squadTable"); if(!table) return;
  const head = table.tHead;
  const clear = () => qsa("th.drop-before, th.drop-after, th.col-dragging", head).forEach(th=>th.classList.remove("drop-before","drop-after","col-dragging"));
  colDefaultOrder.squadTable = currentColOrder("squadTable");
  markColDraggable("squadTable");
  head.addEventListener("dragstart", e=>{
    const th = e.target.closest("th");
    if(!th || colDrag || !th.draggable){ e.preventDefault(); return; }     // never while resizing a column
    colMove = th.dataset.col; th.classList.add("col-dragging");
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", colMove);
  });
  head.addEventListener("dragover", e=>{
    const th = e.target.closest("th"); if(!colMove || !th || COL_FIXED.has(th.dataset.col) || th.dataset.col === colMove) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    const r = th.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    qsa("th.drop-before, th.drop-after", head).forEach(x=>{ if(x !== th) x.classList.remove("drop-before","drop-after"); });
    th.classList.toggle("drop-after", after); th.classList.toggle("drop-before", !after);
  });
  head.addEventListener("drop", e=>{
    const th = e.target.closest("th"); if(!colMove || !th || COL_FIXED.has(th.dataset.col)) return;
    e.preventDefault();
    const key = colMove, after = th.classList.contains("drop-after");
    clear(); colMove = null;
    if(th.dataset.col !== key){ moveColumn("squadTable", key, th.dataset.col, after); toast("Spalte verschoben – zurücksetzen unter „Spalten“"); }
  });
  head.addEventListener("dragend", ()=>{ clear(); colMove = null; });
}
/* ---------- 9.1: player names are links – click → squad tab, row marked ---------- */
let squadFocusId = "";
const plink = (id, name) => `<button type="button" class="plink" data-goto-player="${esc(id)}" title="Im Kader zeigen">${esc(name)}</button>`;
function gotoPlayer(id){
  const loan = state.loans.find(l=>l.id === id || (l.player && l.player.id === id));
  const target = loan ? loan.id : id;
  if(!loan && !playerById(id)){ toast("Spieler nicht (mehr) im Kader."); return; }
  // nothing may hide the row: filters off, loaned players shown, "current" tab
  ["#squadSearch","#squadPosFilter","#squadRoleFilter","#squadStatusFilter"].forEach(sel=>{ const el = qs(sel); if(el) el.value = ""; });
  if(loan) state.ui.showLoaned = true;
  state.ui.squadTab = "current";
  squadFocusId = target;
  navigate("squad");
  const row = qs(`#squadTbody tr[data-id="${target}"], #squadTbody tr[data-loan-id="${target}"]`);
  if(row){
    row.classList.remove("row-focus-pulse"); void row.offsetWidth; row.classList.add("row-focus", "row-focus-pulse");
    row.scrollIntoView({block:"center", behavior:"smooth"});
    const nm = row.querySelector('[data-field="name"]'); if(nm) nm.focus({preventScroll:true});
  }
}
function initPlayerLinks(){
  // capture phase: a name inside a clickable card must not trigger the card as well
  document.addEventListener("click", e=>{
    const a = e.target.closest("[data-goto-player]"); if(!a) return;
    e.preventDefault(); e.stopPropagation();
    gotoPlayer(a.dataset.gotoPlayer);
  }, true);
  // the mark stays until you work on another row
  qs("#squadTbody").addEventListener("pointerdown", e=>{
    const tr = e.target.closest("tr"); if(!tr || !squadFocusId) return;
    if(tr.dataset.id !== squadFocusId && tr.dataset.loanId !== squadFocusId){ squadFocusId = ""; qsa("#squadTbody tr.row-focus").forEach(r=>r.classList.remove("row-focus","row-focus-pulse")); }
  });
}
function initColumnTools(){
  loadColPrefs();
  RESIZABLE_TABLES.forEach(id=>{
    const table = qs("#" + id); if(!table) return;
    qsa("thead th", table).forEach((th, i)=>{
      if(!th.dataset.col) th.dataset.col = th.dataset.sort || "c" + i;
      if(th.classList.contains("sel-col") || th.dataset.col === "actions" || !th.textContent.trim()) return;
      const h = document.createElement("span");
      h.className = "col-resizer"; h.title = "Ziehen: Breite ändern · Doppelklick: an Inhalt anpassen";
      h.addEventListener("click", e=>e.stopPropagation());                 // never trigger the column sort
      h.addEventListener("dblclick", e=>{ e.stopPropagation(); autoFitColumn(table, th); });
      th.appendChild(h);
    });
  });
  applyHiddenCols();
  document.addEventListener("pointerdown", e=>{
    const h = e.target.closest(".col-resizer"); if(!h || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const th = h.closest("th"), table = th.closest("table");
    colDrag = {table, th, x:e.clientX, w:th.getBoundingClientRect().width};
    setColWidth(table, th, colDrag.w);
    document.body.classList.add("col-resizing"); h.classList.add("active");
  }, true);
  document.addEventListener("pointermove", e=>{
    if(!colDrag) return;
    e.preventDefault();
    setColWidth(colDrag.table, colDrag.th, colDrag.w + (e.clientX - colDrag.x));
  });
  const end = ()=>{
    if(!colDrag) return;
    qsa(".col-resizer.active").forEach(x=>x.classList.remove("active"));
    document.body.classList.remove("col-resizing");
    colDrag = null; saveColPrefs();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  qs("#btnColumns").addEventListener("click", openColumnsModal);
  initColumnOrder(); initPlayerLinks();
}
function resetColumns(tableIds){
  const snap = JSON.stringify(colPrefs);
  (tableIds || RESIZABLE_TABLES).forEach(t=>{ delete colPrefs.widths[t]; delete colPrefs.hidden[t]; delete colPrefs.order[t]; });
  saveColPrefs(); applyHiddenCols(); applyColOrder("squadTable");
  toast("Spalten zurückgesetzt", {onUndo:()=>{ colPrefs = JSON.parse(snap); saveColPrefs(); applyHiddenCols(); applyColOrder("squadTable"); }});
}
function colOrderRows(){
  const names = Object.assign({name:"Name"}, SQUAD_COL_NAMES, Object.fromEntries(cfDefs("squad").map(d=>["cf_" + d.id, d.name + " ✦"])));
  const hidden = colPrefs.hidden.squadTable || [], order = currentColOrder("squadTable").filter(k=>names[k]);
  return order.map((k,i)=>`<div class="col-order-row">
    ${k === "name" ? '<span class="col-fixed-vis" title="immer sichtbar">✓</span>' : `<input type="checkbox" data-col-show="${k}" ${hidden.includes(k) ? "" : "checked"} aria-label="${esc(names[k])} anzeigen">`}
    <span class="grow">${esc(names[k])}${k === "valueMax" && !hasTransferValues() ? ' <span class="muted small">(erscheint nach Import)</span>' : ""}</span>
    <button class="tc-arrow" data-col-move="${k}:-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(names[k])} nach links">↑</button>
    <button class="tc-arrow" data-col-move="${k}:1" ${i === order.length - 1 ? "disabled" : ""} aria-label="${esc(names[k])} nach rechts">↓</button></div>`).join("");
}
function openColumnsModal(){
  const hidden = colPrefs.hidden.squadTable || [];
  openModal({
    title:"Spalten im Kader",
    body:`<p class="lead">Sichtbare Spalten und ihre <strong>Reihenfolge</strong> wählen – oder in der Tabelle einen <strong>Spaltenkopf ziehen</strong> und woanders fallen lassen, wie in Excel. Breiten änderst du direkt in der Tabelle: <strong>Spaltenrand im Kopf ziehen</strong>, <strong>Doppelklick</strong> passt die Breite an den Inhalt an – wie in Excel.</p>
      <div class="col-order">${colOrderRows()}</div>
      <p class="hint">Name, Auswahl und Aktionen bleiben immer sichtbar. Einstellungen gelten für alle Spielstände.</p>`,
    leftButtons:`<button class="btn btn-sm" data-col-fitall>Alle an Inhalt anpassen</button><button class="btn btn-sm btn-danger-outline" data-col-reset>Breiten &amp; Spalten zurücksetzen</button>`,
    onOpen: m=>{
      m.addEventListener("click", e=>{
        const mv = e.target.closest("[data-col-move]"); if(!mv) return;
        const [key, dir] = mv.dataset.colMove.split(":"), order = currentColOrder("squadTable"), i = order.indexOf(key), j = i + num(dir);
        if(i < 0 || j < 0 || j >= order.length) return;
        moveColumn("squadTable", key, order[j], num(dir) > 0);
        qs(".col-order", m).innerHTML = colOrderRows();
        const again = qs(`[data-col-move="${key}:${dir}"]`, m); if(again && !again.disabled) again.focus();
      });
      m.onchange = e=>{
        const cb = e.target.closest("[data-col-show]"); if(!cb) return;
        const list = new Set(colPrefs.hidden.squadTable || []);
        if(cb.checked) list.delete(cb.dataset.colShow); else list.add(cb.dataset.colShow);
        colPrefs.hidden.squadTable = [...list];
        saveColPrefs(); applyHiddenCols();
      };
      m.onclick = e=>{
        if(e.target.closest("[data-col-reset]")){ closeModal(); resetColumns(); }
        if(e.target.closest("[data-col-fitall]")){
          closeModal();
          const table = qs("#squadTable");
          if(currentView !== "squad") navigate("squad");
          visibleHeads(table).filter(th=>th.querySelector(".col-resizer")).forEach(th=>autoFitColumn(table, th));
          toast("Spalten an Inhalt angepasst");
        }
      };
    }
  });
}


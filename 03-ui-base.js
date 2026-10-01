/* ==========================================================================
   UI PRIMITIVES: toast, modal, undo, stars
   ========================================================================== */
function toast(msg, opts){
  opts = opts || {};
  const t = qs("#toast"), undoBtn = qs("#toastUndoBtn");
  qs("#toastMsg").textContent = msg;
  t.classList.add("show");
  undoBtn.textContent = opts.actionLabel || "Rückgängig";
  if(opts.onUndo){
    undoBtn.hidden = false;
    undoBtn.onclick = ()=>{ opts.onUndo(); t.classList.remove("show"); clearTimeout(toast._t); };
  } else { undoBtn.hidden = true; undoBtn.onclick = null; }
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.classList.remove("show"), opts.duration || (opts.onUndo ? 6000 : 2600));
}

let _modalReturnFocus = null;
/**
 * openModal({title, body, wide, saveLabel, onSave, extraButtons})
 * onSave(get) receives a getter for elements with [data-f] inside the modal.
 * Return false from onSave to keep the modal open.
 */
function openModal(o){
  // a dialog replaced by another one still gets its clean-up
  if(_modalOnClose){ const cb = _modalOnClose; _modalOnClose = null; try{ cb(); }catch(e){} }
  _modalOnClose = o.onClose || null;
  const overlay = qs("#modalOverlay"), modal = qs("#modal");
  _modalReturnFocus = document.activeElement;
  modal.onclick = null; modal.onchange = null;   // drop handlers from the previous dialog
  modal.classList.toggle("wide", !!o.wide);
  modal.setAttribute("aria-label", o.title || "Dialog");
  modal.innerHTML = `
    <h3>${esc(o.title||"")}</h3>
    ${o.body||""}
    <div class="modal-actions">
      ${o.leftButtons || ""}
      <span class="spacer"></span>
      <button class="btn" data-modal-cancel>${o.onSave ? "Abbrechen" : "Schließen"}</button>
      ${o.onSave ? `<button class="btn btn-accent" data-modal-save>${esc(o.saveLabel||"Speichern")}</button>` : ""}
    </div>`;
  overlay.classList.add("active");
  const get = (name) => {
    const el = qs(`[data-f="${name}"]`, modal);
    if(!el) return undefined;
    return readInput(el);
  };
  qs("[data-modal-cancel]", modal).onclick = closeModal;
  const save = qs("[data-modal-save]", modal);
  if(save) save.onclick = ()=>{ if(o.onSave(get, modal) !== false) closeModal(); };
  modal.onkeydown = (e)=>{
    if(e.key === "Enter" && save && e.target.tagName === "INPUT"){ e.preventDefault(); save.click(); }
    if(e.key === "Tab") trapFocus(e, modal);
  };
  if(o.onOpen) o.onOpen(modal);
  const first = qs("input:not([type=hidden]), select, textarea, button", modal);
  setTimeout(()=> (first || modal).focus(), 20);
}
let _modalOnClose = null;
function closeModal(){
  if(!qs("#modalOverlay").classList.contains("active")) return;
  qs("#modalOverlay").classList.remove("active");
  // undo an unsaved colour preview – with the colour of the MODE (10.3 fix: national teams kept losing their accent)
  if(state) setAccentVars(isNat() ? state.national.accent : state.club.accent);
  const cb = _modalOnClose; _modalOnClose = null; if(cb) try{ cb(); }catch(e){ logError("onClose", e && e.stack); }
  if(_modalReturnFocus && _modalReturnFocus.focus) _modalReturnFocus.focus();
}
function trapFocus(e, root){
  const f = qsa("button, input, select, textarea, [tabindex]:not([tabindex='-1'])", root).filter(el=>!el.disabled && el.offsetParent !== null);
  if(!f.length) return;
  const first = f[0], last = f[f.length-1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

/** Removes an item from a state list with a 6-second undo toast. */
function removeWithUndo(listName, id, label, after){
  const list = state[listName];
  const idx = list.findIndex(x=>x.id===id);
  if(idx === -1) return;
  const [removed] = list.splice(idx,1);
  saveState(); after();
  toast(`${label} gelöscht`, {onUndo:()=>{ state[listName].splice(idx,0,removed); saveState(); after(); }});
}

/** Takes a snapshot of the whole state for undoing bulk operations. */
function snapshotUndo(msg, after){
  const snap = JSON.stringify(state);
  return (overrideMsg)=> toast(overrideMsg || msg, {onUndo:()=>{ state = JSON.parse(snap); selectedSlot = null; saveState(); after(); }});
}

function starsInput(value, attrs, max=5){
  let h = `<span class="stars" role="radiogroup" ${attrs}>`;
  for(let i=1;i<=max;i++) h += `<button type="button" data-star="${i}" class="${i<=value?"on":""}" aria-label="${i} von ${max}" aria-checked="${i===value}">★</button>`;
  return h + "</span>";
}
function starsRO(value, max=5){
  let h = `<span class="stars ro" aria-label="${value} von ${max}">`;
  for(let i=1;i<=max;i++) h += i<=value ? "★" : `<span class="off">★</span>`;
  return h + "</span>";
}
function options(map, selected){
  const entries = Array.isArray(map) ? map.map(v=>[v,v]) : Object.entries(map);
  return entries.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(selected)?"selected":""}>${esc(l)}</option>`).join("");
}
function playerOptions(selectedId, emptyLabel="— frei —", filterFn){
  const list = state.players.filter(p=> !filterFn || filterFn(p) || p.id===selectedId)
    .slice().sort((a,b)=>POS_LIST.indexOf(a.pos)-POS_LIST.indexOf(b.pos) || a.name.localeCompare(b.name));
  return `<option value="">${esc(emptyLabel)}</option>` + list.map(p=>
    `<option value="${p.id}" ${p.id===selectedId?"selected":""}>${esc(p.pos)} · ${esc(p.name)}${UNAVAILABLE.includes(p.status)?" ("+STATUS[p.status]+")":""}</option>`).join("");
}
const playerById = id => state.players.find(p=>p.id===id);

/* ==========================================================================
   DERIVED DATA
   ========================================================================== */
function ingameDate(){ return parseISO(state.club.ingameDate) || new Date(2027,2,12); }

// FM contracts end on 30 June of the given year.
function contractMonthsLeft(p){
  const d = ingameDate(), end = new Date(p.contractUntil, 5, 30);
  let m = (end.getFullYear()-d.getFullYear())*12 + (end.getMonth()-d.getMonth());
  if(end.getDate() < d.getDate()) m -= 1;
  return m;
}
function contractLevel(m){
  if(m < 0) return {cls:"c-expired", text:"abgelaufen"};
  if(m <= 6) return {cls:"c-red", text:`noch ${m} Mon.`};
  if(m <= 12) return {cls:"c-amber", text:`noch ${m} Mon.`};
  return {cls:"c-green", text:`noch ${Math.floor(m/12)} J. ${m%12} Mon.`};
}

/**
 * Planned purchases (negotiating/fixed, optionally watched) and planned sales
 * (offer/agreed, optionally listed). Only the board's share of a sale goes into the budget.
 */
function budgetCalc(){
  const counted = state.scouting.filter(t => listBase("scoutStatus", t.status) !== "watched" || state.ui.includeWatched);
  const fees = counted.reduce((s,t)=>s+t.fee,0);
  const bonus = counted.reduce((s,t)=>s+t.bonus,0);
  const wages = counted.reduce((s,t)=>s + (t.kind === "loan" ? Math.round(t.wage * t.wageShare / 100) : t.wage), 0);   // loans: only our share
  const sales = state.sales.filter(x => listBase("saleStatus", x.status) !== "listed" || state.ui.includeListed);
  const salesGross = sales.reduce((s,x)=>s+x.price,0);
  const salesIncome = Math.round(salesGross * state.club.salesShare / 100);
  const wageRelief = sales.reduce((s,x)=>s+((playerById(x.playerId)||{}).salary||0),0);
  const wagesNow = state.players.reduce((s,p)=>s+p.salary,0);
  return {
    fees, bonus, wages, salesGross, salesIncome, wageRelief, wagesNow,
    wageHeadroom: state.club.wageBudget - wagesNow,                       // today
    transferLeft: state.club.transferBudget + salesIncome - fees - bonus,
    wageLeft: state.club.wageBudget - wagesNow + wageRelief - wages       // after planned transfers
  };
}

/* ---------- Transfer windows ---------- */
/** "01.07.–01.09." → {sm, sd, em, ed} (months 1-based). */
function parseWindow(text){
  const m = /(\d{1,2})\.(\d{1,2})\.?\s*[–\-—bis ]+\s*(\d{1,2})\.(\d{1,2})\.?/.exec(String(text||""));
  if(!m) return null;
  const w = {sd:+m[1], sm:+m[2], ed:+m[3], em:+m[4]};
  if(w.sm<1||w.sm>12||w.em<1||w.em>12||w.sd<1||w.sd>31||w.ed<1||w.ed>31) return null;
  return w;
}
/** Is a window open on the in-game date? Otherwise: which one opens next. */
function windowStatus(dateISO){
  const d = parseISO(dateISO || state.club.ingameDate);
  const spans = [];
  [["summer","Sommerfenster"],["winter","Winterfenster"]].forEach(([k,label])=>{
    const w = parseWindow(state.club.windows[k]); if(!w) return;
    for(let y = d.getFullYear()-1; y <= d.getFullYear()+1; y++){
      const start = new Date(y, w.sm-1, w.sd);
      let end = new Date(y, w.em-1, w.ed);
      if(end < start) end = new Date(y+1, w.em-1, w.ed);   // window across new year
      spans.push({label, start, end});
    }
  });
  const open = spans.find(x=>d >= x.start && d <= x.end);
  const dayDiff = t => Math.round((t - d)/86400000);
  if(open) return {open:true, label:open.label, days:dayDiff(open.end), date:open.end};
  const next = spans.filter(x=>x.start > d).sort((a,b)=>a.start-b.start)[0];
  return next ? {open:false, label:next.label, days:dayDiff(next.start), date:next.start} : null;
}

/* ==========================================================================
   LINE-UP LOGIC
   ========================================================================== */
function slotsFor(s, f){
  if(!s.tactics[f]) s.tactics[f] = {slots:{}};
  return s.tactics[f].slots;
}
function currentSlots(){ return slotsFor(state, state.formationName); }
function ensureSlot(idx, s=state, f=state.formationName){
  const slots = slotsFor(s, f);
  if(!slots[idx]) slots[idx] = defaultSlot(formationDefs(f, s)[idx].cat);
  return slots[idx];
}

function positionFit(p, cat){
  if(p.pos === cat) return 1;
  if(p.altPos.includes(cat)) return 0.85;
  if((RELATED[cat]||[]).includes(p.pos)) return 0.5;
  return 0;
}
const ROLE_BONUS = {key:6, first:4, rotation:2, prospect:1, backup:0, sell:-3};

/** Greedy best XI: scarcest positions first, then position fit, own rating, squad role. */
function autoFillXI(s, f){
  const defs = formationDefs(f, s);
  const avail = s.players.filter(p=>!UNAVAILABLE.includes(p.status));
  const order = defs.map((d,i)=>({d,i, n: avail.filter(p=>positionFit(p,d.cat)>=0.85).length}))
                    .sort((a,b)=>a.n-b.n);
  const used = new Set();
  let offPos = 0, empty = 0;
  order.forEach(({d,i})=>{
    let best = null, bestScore = -Infinity;
    avail.forEach(p=>{
      if(used.has(p.id)) return;
      const fit = positionFit(p, d.cat);
      if(fit === 0) return;
      const score = fit*100 + p.rating*9 + (ROLE_BONUS[listBase("squadRoles", p.squadRole)]||0);
      if(score > bestScore){ bestScore = score; best = p; }
    });
    const slot = ensureSlot(i, s, f);
    if(best){
      used.add(best.id); slot.playerId = best.id;
      if(positionFit(best, d.cat) < 0.85) offPos++;
    } else { slot.playerId = null; empty++; }
  });
  return {offPos, empty};
}

function assignToSlot(pid, toIdx, fromIdx){
  const slots = currentSlots();
  if(fromIdx !== null && fromIdx !== undefined){
    if(fromIdx === toIdx) return;
    const a = ensureSlot(fromIdx).playerId, b = ensureSlot(toIdx).playerId;
    slots[toIdx].playerId = a; slots[fromIdx].playerId = b;
  } else {
    Object.values(slots).forEach(sl=>{ if(sl.playerId === pid) sl.playerId = null; });
    ensureSlot(toIdx).playerId = pid;
  }
}
function unassign(idx){ const sl = currentSlots()[idx]; if(sl) sl.playerId = null; }

// Out-of-possession shape: block drops and narrows; "Hoch bleibend" roles stay up.
function slotCoords(def, slot, phase){
  if(phase === "out" && slot && slot.oopPos) return {x: slot.oopPos.x, y: slot.oopPos.y};   // manually placed
  let {x, y} = def;
  if(phase === "out" && def.cat !== "TW"){
    // compact mid-block: vertical span halved around y=60; "Hoch bleibend"/pressing roles stay up
    const stayHigh = slot && STAY_HIGH.has(slot.roleOut);          // editable in Admin → Listen
    y = stayHigh ? y + 10 : 60 + (y - 50) * 0.5;
    x = 50 + (x - 50) * (stayHigh ? 0.95 : 0.84);
  }
  return {x, y};
}

// Neighbouring positions for partnership lines (computed on real pitch proportions).
const _linkCache = {};
function formationLinks(f){
  if(f !== FREE && _linkCache[f]) return _linkCache[f];   // free formation changes → never cached
  const defs = formationDefs(f), links = new Set();
  defs.forEach((a,i)=>{
    const near = defs.map((b,j)=>({j, d: Math.hypot((a.x-b.x)*0.68, a.y-b.y)}))
      .filter(o=>o.j!==i && o.d < 26).sort((p,q)=>p.d-q.d).slice(0,3);
    near.forEach(o=>links.add(i<o.j ? `${i}-${o.j}` : `${o.j}-${i}`));
  });
  const out = [...links].map(k=>k.split("-").map(Number));
  if(f !== FREE) _linkCache[f] = out;
  return out;
}

/* ==========================================================================
   NAVIGATION
   ========================================================================== */
const VIEWS = ["home","squad","tactics","recruitment","finance","development","fixtures","notes","journey"];
const VIEW_LABEL = {home:"Portal",squad:"Kader",tactics:"Taktik",recruitment:"Transfers",finance:"Finanzen",development:"Entwicklung",fixtures:"Spieltag",notes:"Notizen",journey:"Journey"};
let currentView = "home";

function navigate(view){
  if(view !== "recruitment" && typeof stopDeadlineClock === "function") stopDeadlineClock();
  if(typeof renderDeadlineBar === "function") renderDeadlineBar();       // never show a stale deadline bar
  if(!VIEWS.includes(view) && view !== "admin") return;
  if(isNat() && NAT_HIDDEN_VIEWS.includes(view)){ toast("Im Nationalteam-Modus ausgeblendet (Transfers, Finanzen, Entwicklung gehören zum Verein)."); return; }
  if(currentView === "admin" && view !== "admin" && adminCfg().lockOnLeave) adminUnlocked = false;
  currentView = view;
  qsa(".nav-btn").forEach(b=>{
    const on = b.dataset.view === view;
    b.classList.toggle("active", on);
    if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  });
  qsa(".view").forEach(v=>v.classList.toggle("active", v.id === "view-"+view));
  renderDeadlineBar();
  // every view is drawn fresh when opened – otherwise it may show the state from page load
  const vr = VIEW_RENDERERS()[view];
  if(vr) withRenderCache(vr);
  if(view === "admin") renderAdmin();
  qs("#btnAdmin").classList.toggle("active", view === "admin");
  qs("#btnMenu").classList.toggle("active", view === "admin");
  window.scrollTo({top:0});
}
function initNav(){
  qsa(".nav-btn").forEach(btn=> btn.addEventListener("click", ()=> navigate(btn.dataset.view)));
  document.addEventListener("click", e=>{
    const g = e.target.closest("[data-goto]");
    if(!g) return;
    if(g.dataset.filter === "contract"){ qs("#squadStatusFilter").value = "contract"; renderSquad(); }
    if(g.dataset.devtab){ state.ui.devTab = g.dataset.devtab; saveState(); renderDevelopment(); }
    if(g.dataset.trtab){ state.ui.transferTab = g.dataset.trtab; saveState(); }
    navigate(g.dataset.goto);
  });
}

/* ==========================================================================
   HEADER
   ========================================================================== */
function renderHeader(){
  const b = budgetCalc();
  qs("#clubName").textContent = state.club.name;
  qs("#slotName").textContent = (activeSlotMeta()||{}).name || "";
  qs("#ingameDatePill").textContent = fmtDate(state.club.ingameDate) + " · " + state.club.season;
  qsa(".wu").forEach(e=> e.textContent = wageSuffix());
  const tc = qs("#transferBudgetChip"), sc = qs("#salaryBudgetChip");
  tc.textContent = fmtEUR(b.transferLeft); tc.classList.toggle("neg", b.transferLeft < 0);
  sc.textContent = fmtEUR(wageToUnit(b.wageLeft)); sc.classList.toggle("neg", b.wageLeft < 0);
  qs("#formationChip").textContent = `${activePlan().name} · ${formationLabel(state.formationName)}`;
  qs("#crestInitials").textContent = state.club.crest;
  setAccentVars(state.club.accent);
  applyModeLook();
  document.title = `${state.club.name} – FM27 Dashboard`;
}

/* ==========================================================================
   IN-GAME DATE & BIRTHDAYS
   ========================================================================== */
/**
 * Sets a new in-game date. Ages of players with a birth date follow automatically;
 * birthdays, match day and the season change (1 July) are announced. Undoable.
 */
function applyDateChange(newISO){
  const oldISO = state.club.ingameDate;
  if(!parseISO(newISO) || newISO === oldISO) return;
  autoRestorePoint("Vor Datumssprung");
  const snap = JSON.stringify(state), jSnap = JSON.stringify(journey);
  const oldD = parseISO(oldISO), newD = parseISO(newISO);
  const birthdays = state.players.filter(p=>p.birthDate && ageOn(p.birthDate, newD) > ageOn(p.birthDate, oldD));
  state.club.ingameDate = newISO;
  state.players.forEach(p=>{ if(p.birthDate) p.age = clamp(ageOn(p.birthDate, newD), 14, 45); });
  saveState(); renderAll();

  const parts = [fmtDate(newISO, {weekday:"short", day:"numeric", month:"long"})];
  if(birthdays.length) parts.push("🎂 " + birthdays.map(p=>`${p.name} wird ${p.age}`).join(", "));
  if(state.nextMatch.date === newISO && state.nextMatch.opponent) parts.push(`⚽ Spieltag gegen ${state.nextMatch.opponent}`);
  const wOld = windowStatus(oldISO), wNew = windowStatus(newISO);
  if(wOld && wNew && wOld.open !== wNew.open) parts.push(wNew.open ? `🔓 ${wNew.label} geöffnet` : "🔒 Transferfenster geschlossen");
  const july = new Date(newD.getFullYear(), 6, 1);
  if(newD > oldD && july > oldD && july <= newD) parts.push("Neue Saison – unter Notizen „Saison abschließen“");
  const jMsgs = processJourney(oldISO, newISO);
  if(jMsgs.length){ parts.push(...jMsgs); if(currentView === "journey") renderJourney(); renderHomeJourney(); }
  const bos = checkBosman();
  if(bos.length){ saveState(); renderAll(); parts.push(`⚖ Bosman: ${bos.map(p=>p.name).join(", ")} – letzte 6 Vertragsmonate, als Aufgabe eingetragen`); }
  toast(parts.join(" · "), {onUndo:()=>{ state = JSON.parse(snap); saveState(); journey = sanitizeJourney(JSON.parse(jSnap)); saveJourney(); renderAll(); }});

  // The prepared match lies behind us now → ask for the result right away.
  const md = state.nextMatch.date;
  const recorded = state.results.some(r=>r.date === md && r.opponent === state.nextMatch.opponent);
  if(md && state.nextMatch.opponent && oldISO <= md && newISO > md && !recorded){
    setTimeout(()=> openResultModal(null, {lead:`Das Spiel gegen ${state.nextMatch.opponent} (${fmtDate(md,{day:"numeric",month:"long"})}) ist vorbei – wie ist es ausgegangen?`}), 60);
  }
}
function nextDay(days){ applyDateChange(addDaysISO(state.club.ingameDate, days)); }

/* ---------- Bosman: the last 6 months of a contract (01.01.–30.06. of the final year) ---------- */
function isBosman(p, dateISO){
  if(p.loanIn) return false;                       // borrowed player: "contract end" = end of the loan
  if(isNat()) return false;                        // national pool: contracts belong to the players' clubs
  const d = parseISO(dateISO || state.club.ingameDate); if(!d) return false;
  return p.contractUntil === d.getFullYear() && d.getMonth() <= 5;
}
/** Marked in the squad unless the player is to be sold or unhappy – those only get the notification (your rule). */
function bosmanMarked(p){ return isBosman(p) && listBase("squadRoles", p.squadRole) !== "sell" && listBase("status", p.status) !== "unhappy"; }
function bosmanTodoText(p){
  const end = `30.06.${p.contractUntil}`;
  if(listBase("squadRoles", p.squadRole) === "sell") return `Bosman: ${p.name} (Abgabe) – Vertrag endet ${end}, im Winter letzte Chance auf eine Ablöse`;
  if(listBase("status", p.status) === "unhappy") return `Bosman: ${p.name} (unzufrieden) – Vertrag endet ${end}, kann ablösefrei wechseln`;
  return `Bosman: ${p.name} – Vertrag endet ${end}, verlängern oder verkaufen`;
}
/** New Bosman cases → one task each (once per contract end). Returns the affected players. */
function checkBosman(){
  const fresh = state.players.filter(p=>isBosman(p) && p.bosmanAck !== p.contractUntil);
  fresh.forEach(p=>{ state.todos.push({id:uid(), text:bosmanTodoText(p), done:false}); p.bosmanAck = p.contractUntil; });
  return fresh;
}

function birthdayInfo(p){
  if(!p.birthDate) return null;
  const n = daysToBirthday(p.birthDate, ingameDate());
  const when = n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`;
  return {days:n, text:`Geburtstag: ${fmtDate(p.birthDate,{day:"numeric",month:"long",year:"numeric"})} (${when})`};
}


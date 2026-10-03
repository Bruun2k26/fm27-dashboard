/* ==========================================================================
   TACTICS — PITCH
   ========================================================================== */
let selectedSlot = null;
/** soft hyphens at the joints of German compounds (works without a hyphenation dictionary) */
const roleHy = name => String(name).replace(/(\p{L}{3,}?)(verteidiger|spieler|stürmer|macher|zehner|flügel|torhüter|sechser)/giu, "$1\u00AD$2");
/* ---------- 12.0: role picker – shows the FM26 short description while hovering or arrowing through ---------- */
const RP_PHASE = {both:"Mit & gegen Ball", in:"Mit Ball", out:"Gegen den Ball"};
let rpOpen = null;
function rpInfoHTML(name){
  const r = ROLE_INFO[name];
  if(!r) return `<strong>${esc(name)}</strong><p>Eigene Rolle – angelegt unter Admin → Listen.</p>`;
  return `<div class="rp-info-top"><strong>${esc(r.de)}</strong><span class="rp-phase p-${r.phase}">${RP_PHASE[r.phase]}</span></div>
    <span class="rp-en">${esc(r.en)} · ${esc(r.pos)}</span><p>${esc(r.desc)}</p>`;
}
function enhanceRolePicker(sel, phase){
  if(!sel || sel.dataset.rp) return;
  sel.dataset.rp = "1"; sel.classList.add("rp-native"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
  [...sel.options].forEach(o=>{ const r = ROLE_INFO[o.value]; if(r) o.title = `${r.en} – ${r.desc}`; });
  const b = document.createElement("button"); b.type = "button"; b.className = "rp-btn";
  b.setAttribute("aria-haspopup", "listbox"); b.setAttribute("aria-expanded", "false");
  const lbl = sel.id && qs(`label[for="${sel.id}"]`); if(lbl){ lbl.id = lbl.id || sel.id + "-lbl"; lbl.setAttribute("for", ""); lbl.onclick = ()=>b.focus(); }
  const paint = () => { const v = sel.value, r = ROLE_INFO[v]; b.innerHTML = `<span class="rp-cur"><strong>${esc(v)}</strong>${r ? `<small>${esc(r.en)}</small>` : ""}</span><span aria-hidden="true">▾</span>`;
    b.setAttribute("aria-label", `${lbl ? lbl.textContent + ": " : ""}${v}`); b.title = r ? r.desc : ""; };
  paint(); sel.after(b);
  b.addEventListener("click", ()=>openRolePicker(sel, b, phase));
  b.addEventListener("keydown", e=>{ if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){ e.preventDefault(); e.stopPropagation(); openRolePicker(sel, b, phase); } });
}
function closeRolePicker(refocus){
  if(!rpOpen) return; const {pop, btn} = rpOpen; rpOpen = null;
  pop.remove(); btn.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", rpOutside, true); window.removeEventListener("resize", rpReposition); window.removeEventListener("scroll", rpReposition, true);
  if(refocus && btn.isConnected) btn.focus({preventScroll:true});
}
function rpOutside(e){ if(rpOpen && !rpOpen.pop.contains(e.target) && e.target !== rpOpen.btn && !rpOpen.btn.contains(e.target)) closeRolePicker(false); }
function rpReposition(){
  if(!rpOpen) return; const {pop, btn} = rpOpen, r = btn.getBoundingClientRect(), w = Math.max(r.width, 340), h = pop.offsetHeight || 360;
  const below = innerHeight - r.bottom - 8, top = below >= Math.min(h, 300) || below >= r.top ? r.bottom + 4 : Math.max(8, r.top - h - 4);
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px"; pop.style.top = top + "px"; pop.style.width = w + "px";
  pop.style.maxHeight = Math.max(220, (top > r.top ? innerHeight - top - 8 : r.top - 12)) + "px";
}
function openRolePicker(sel, btn, phase){
  if(rpOpen){ const same = rpOpen.sel === sel; closeRolePicker(false); if(same) return; }
  const opts = [...sel.options].map(o=>o.value);
  const pop = document.createElement("div"); pop.className = "rp-pop"; pop.tabIndex = -1;
  pop.innerHTML = `<div class="rp-head">${phase === "out" ? "Rolle gegen den Ball" : "Rolle mit Ball"} <span class="muted small">· ${opts.length} Rollen</span></div>
    <ul class="rp-list" role="listbox" aria-label="${phase === "out" ? "Rolle gegen den Ball" : "Rolle mit Ball"}">${opts.map((v,i)=>{ const r = ROLE_INFO[v];
      return `<li role="option" id="rp-o${i}" data-i="${i}" aria-selected="${v === sel.value}" class="${v === sel.value ? "sel" : ""}"><span class="rp-name">${esc(v)}</span>${r ? `<span class="rp-en">${esc(r.en)}</span>` : '<span class="rp-en">eigene Rolle</span>'}</li>`; }).join("")}</ul>
    <div class="rp-info" aria-live="polite"></div>`;
  document.body.appendChild(pop);
  rpOpen = {pop, btn, sel, opts, i:Math.max(0, opts.indexOf(sel.value)), buf:"", bufT:null};
  btn.setAttribute("aria-expanded", "true");
  const list = qs(".rp-list", pop), info = qs(".rp-info", pop);
  const setActive = (i, scroll) => { rpOpen.i = i; qsa("li", list).forEach((li,k)=>li.classList.toggle("act", k === i)); list.setAttribute("aria-activedescendant", "rp-o" + i);
    info.innerHTML = rpInfoHTML(opts[i]); if(scroll){ const li = qs(`#rp-o${i}`, pop); if(li && li.scrollIntoView) li.scrollIntoView({block:"nearest"}); } };
  const choose = i => { const v = opts[i]; closeRolePicker(true); if(v !== sel.value){ sel.value = v; sel.dispatchEvent(new Event("change", {bubbles:true})); } };
  list.addEventListener("mousemove", e=>{ const li = e.target.closest("li"); if(li && +li.dataset.i !== rpOpen.i) setActive(+li.dataset.i, false); });
  list.addEventListener("click", e=>{ const li = e.target.closest("li"); if(li) choose(+li.dataset.i); });
  pop.addEventListener("keydown", e=>{
    const k = e.key, n = opts.length; let handled = true;
    if(k === "ArrowDown") setActive((rpOpen.i + 1) % n, true);
    else if(k === "ArrowUp") setActive((rpOpen.i - 1 + n) % n, true);
    else if(k === "Home") setActive(0, true); else if(k === "End") setActive(n - 1, true);
    else if(k === "Enter" || k === " ") choose(rpOpen.i);
    else if(k === "Escape") closeRolePicker(true);
    else if(k === "Tab"){ closeRolePicker(true); }
    else if(k.length === 1 && /\S/.test(k)){ clearTimeout(rpOpen.bufT); rpOpen.buf += k.toLowerCase(); rpOpen.bufT = setTimeout(()=>{ if(rpOpen) rpOpen.buf = ""; }, 700);
      const j = opts.findIndex(v=>v.toLowerCase().startsWith(rpOpen.buf)); if(j >= 0) setActive(j, true); }
    else handled = false;
    if(handled){ e.preventDefault(); } e.stopPropagation();   // keys never reach the dashboard shortcuts while the picker is open
  });
  setActive(rpOpen.i, true); rpReposition(); pop.focus({preventScroll:true});
  document.addEventListener("pointerdown", rpOutside, true); window.addEventListener("resize", rpReposition); window.addEventListener("scroll", rpReposition, true);
}
/* 11.5: when switching "Mit Ball / Gegen den Ball" the players move visibly to their new spots.
   Uses the separate CSS property "translate" – "transform" already centres the dots. */
function pitchPositions(){
  const m = {}; qsa("#pitch .pitch-slot[data-slot]").forEach(el=>{ m[el.dataset.slot] = {l:parseFloat(el.style.left), t:parseFloat(el.style.top)}; }); return m;
}
function animatePitchFrom(before){
  try{ if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return; }catch(e){}
  const pitch = qs("#pitch"); if(!pitch) return;
  const r = pitch.getBoundingClientRect(); if(!r.width) return;
  qsa("#pitch .pitch-slot[data-slot]").forEach(el=>{
    const b = before[el.dataset.slot]; if(!b) return;
    const dx = (b.l - parseFloat(el.style.left)) / 100 * r.width, dy = (b.t - parseFloat(el.style.top)) / 100 * r.height;
    if(Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    el.style.transition = "none"; el.style.translate = `${dx}px ${dy}px`;
    void el.offsetWidth;
    el.style.transition = "translate .45s cubic-bezier(.2,.7,.2,1)"; el.style.translate = "0px 0px";
    el.addEventListener("transitionend", ()=>{ el.style.transition = ""; el.style.translate = ""; }, {once:true});
  });
}

function pitchHTML({mini=false}={}){
  const f = state.formationName, defs = formationDefs(f), slots = slotsFor(state, f);
  const phase = mini ? "in" : state.phase;
  const pos = defs.map((d,i)=>slotCoords(d, slots[i], phase));

  let lines = "";
  if(!mini && state.ui.showLinks){
    lines = formationLinks(f).filter(([a,b])=>slots[a]?.playerId && slots[b]?.playerId).map(([a,b])=>{
      const hi = selectedSlot === a || selectedSlot === b;
      return `<line class="${hi?"hi":""}" x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}"/>`;
    }).join("");
  }

  const nodes = defs.map((d,i)=>{
    const sl = slots[i], p = sl && playerById(sl.playerId);
    const cls = ["pitch-slot"];
    if(!p) cls.push("empty");
    else {
      if(UNAVAILABLE.includes(p.status)) cls.push("unavail");
      else if(positionFit(p, d.cat) < 0.85) cls.push("offpos");
    }
    if(!mini && selectedSlot === i) cls.push("selected");
    const role = sl ? (phase === "out" ? sl.roleOut : sl.roleIn) : (phase === "out" ? ROLES_OOP[d.cat][0] : ROLES_IP[d.cat][0]);
    const title = p ? `${p.name} (${p.pos}) – ${role}${UNAVAILABLE.includes(p.status)?" · "+STATUS[p.status]:""}${cls.includes("offpos")?" · Fremdposition":""}` : `${POS_NAME[d.cat]} – unbesetzt`;
    const shortName = p ? p.name.split(" ").slice(-1)[0] : d.cat;
    return `<div class="${cls.join(" ")}" style="left:${pos[i].x}%;top:${pos[i].y}%"
        ${mini ? "" : `data-slot="${i}" data-pid="${p?p.id:""}" tabindex="0" role="button" aria-label="${esc(title)}"`} title="${esc(title)}">
      <div class="dot">${p ? esc(initials(p.name)) : "+"}${p ? `<span class="cat">${d.cat}</span>` : ""}</div>
      <div class="p-name">${esc(shortName)}</div>
      ${p ? `<div class="p-role" title="${esc(ROLE_INFO[role] ? `${role} (${ROLE_INFO[role].en}) – ${ROLE_INFO[role].desc}` : role)}">${esc(roleHy(role))}</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="pitch ${mini?"mini":""}" ${mini?'style="width:300px;max-width:100%"':'id="pitch"'}>
    <div class="pitch-mark pm-outline"></div><div class="pitch-mark pm-half"></div><div class="pitch-mark pm-circle"></div>
    <div class="pitch-mark pm-box-top"></div><div class="pitch-mark pm-box-bot"></div>
    <div class="pitch-mark pm-six-top"></div><div class="pitch-mark pm-six-bot"></div>
    <svg class="pitch-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    ${nodes}
  </div>`;
}

function renderTactics(){
  if(!qs("#pitchHost")) return;
  renderFormationOptions();
  qsa(".phase-btn").forEach(b=>b.classList.toggle("active", b.dataset.phase === state.phase));
  qs("#toggleLinks").checked = state.ui.showLinks;
  renderPlanBar();
  qs("#btnResetOop").hidden = !(state.phase === "out" && hasOopOverrides());
  qsa("#tacticsTabs [data-tab]").forEach(b=>b.classList.toggle("active", b.dataset.tab === state.ui.tacticsTab));
  qs("#tactics-formation").classList.toggle("active", state.ui.tacticsTab === "formation");
  qs("#tactics-setpieces").classList.toggle("active", state.ui.tacticsTab === "setpieces");
  if(selectedSlot !== null && !formationDefs(state.formationName)[selectedSlot]) selectedSlot = null;

  qs("#pitchHost").innerHTML = pitchHTML();
  renderSlotEditor();
  renderBench();
  renderSetPieces();
}

function renderSlotEditor(){
  const box = qs("#slotEditor");
  if(selectedSlot === null){
    const n = Object.values(currentSlots()).filter(s=>s.playerId).length;
    const free = state.formationName === FREE ? `<p class="hint">Freie Formation auf Basis von ${esc(state.customFormation.base)}. Zurück zur Vorlage über das Formations-Menü.</p>` : "";
    box.innerHTML = `<p class="empty">Klicke eine Position auf dem Feld an, um Spieler und Rollen festzulegen.</p>${free}
      <p class="hint">${n}/11 Positionen besetzt · Orange = Fremdposition · Rot = nicht verfügbar</p>`;
    return;
  }
  const d = formationDefs(state.formationName)[selectedSlot], sl = ensureSlot(selectedSlot);
  const p = playerById(sl.playerId);
  box.innerHTML = `
    <div class="slot-title"><span class="cat-big">${d.cat}</span><strong>${POS_NAME[d.cat]}</strong>
      ${d.cat !== "TW" ? `<select id="se-cat" class="se-cat" title="Positionskürzel manuell festlegen" aria-label="Positionskürzel">${options(POS_LIST.filter(x=>x!=="TW"), d.cat)}</select>` : ""}</div>
    <div class="sp-field"><label for="se-player">Spieler</label><select id="se-player">${playerOptions(sl.playerId)}</select></div>
    <div class="sp-field"><label for="se-in">Rolle mit Ball</label><select id="se-in">${options(ROLES_IP[d.cat], sl.roleIn)}</select></div>
    <div class="sp-field"><label for="se-out">Rolle gegen Ball</label><select id="se-out">${options(ROLES_OOP[d.cat], sl.roleOut)}</select></div>
    ${p && positionFit(p,d.cat) < 0.85 ? `<p class="hint" style="color:var(--warning)">${esc(p.name)} spielt hier nicht auf seiner Haupt- oder Nebenposition.</p>` : ""}
    ${p && UNAVAILABLE.includes(p.status) ? `<p class="hint" style="color:var(--neg-text)">${esc(p.name)}: ${STATUS[p.status]}</p>` : ""}`;
  qs("#se-player").onchange = e=>{
    if(e.target.value) assignToSlot(e.target.value, selectedSlot, null); else unassign(selectedSlot);
    saveState(); renderTactics();
  };
  qs("#se-in").onchange = e=>{ sl.roleIn = e.target.value; saveState(); renderTactics(); };
  const catSel = qs("#se-cat");
  if(catSel) catSel.onchange = e=>{
    const cat = e.target.value, idx = selectedSlot;
    const def = formationDefs(state.formationName)[idx];
    const base = toFreeFormation();
    const fd = state.customFormation.slots[idx];
    fd.cat = cat;
    const slot = ensureSlot(idx);
    if(!ROLES_IP[cat].includes(slot.roleIn)) slot.roleIn = ROLES_IP[cat][0];
    if(!ROLES_OOP[cat].includes(slot.roleOut)) slot.roleOut = ROLES_OOP[cat][0];
    saveState(); renderTactics(); renderHeader();
    if(base) toast(`Freie Formation – basiert auf ${base}`);
  };
  qs("#se-out").onchange = e=>{ sl.roleOut = e.target.value; saveState(); renderTactics(); };
  enhanceRolePicker(qs("#se-in"), "in"); enhanceRolePicker(qs("#se-out"), "out");
}

function renderBench(){
  const inXI = new Set(Object.values(currentSlots()).map(s=>s.playerId).filter(Boolean));
  const pf = qs("#benchFilter").value;
  const nomOnly = isNat() && state.national.benchNominated && state.players.some(p=>p.nominated);
  const list = state.players.filter(p=>!inXI.has(p.id) && (!pf || p.pos===pf || p.altPos.includes(pf)) && (!nomOnly || p.nominated))
    .sort((a,b)=>POS_LIST.indexOf(a.pos)-POS_LIST.indexOf(b.pos) || b.rating-a.rating);
  qs("#benchList").innerHTML = list.map(p=>`
    <div class="bench-item ${UNAVAILABLE.includes(p.status)?"unavail":""}" data-pid="${p.id}" tabindex="0" role="button"
         aria-label="${esc(p.name)}, ${p.pos}${UNAVAILABLE.includes(p.status)?", "+STATUS[p.status]:""}">
      <span class="pos">${p.pos}</span><span class="nm">${esc(p.name)}</span>
      ${UNAVAILABLE.includes(p.status) ? `<span class="badge ${listBase("status", p.status)}">${STATUS[p.status]}</span>` : starsRO(p.rating)}
    </div>`).join("") || `<p class="empty">Alle passenden Spieler stehen in der Startelf.</p>`;
}

/* ---------- Tactic plans (Plan A / B / C) ---------- */
function activePlan(){ return state.plans.find(pl=>pl.id === state.activePlanId) || state.plans[0]; }
/** Tactic data of any plan; the active one lives in the top-level state fields. */
function planBlock(id){
  const pl = state.plans.find(x=>x.id === id) || activePlan();
  return pl.id === state.activePlanId
    ? {formationName: state.formationName, tactics: state.tactics, customFormation: state.customFormation}
    : pl.data;
}
function planXI(id){
  const b = planBlock(id), slots = (b.tactics[b.formationName] || {slots:{}}).slots;
  return formationDefs(b.formationName, b).map((d,i)=>({def:d, slot: slots[i] || defaultSlot(d.cat)}));
}
function currentBlockCopy(){
  return JSON.parse(JSON.stringify({formationName: state.formationName, tactics: state.tactics, customFormation: state.customFormation}));
}
function switchPlan(id){
  if(id === state.activePlanId || !state.plans.some(x=>x.id === id)) return;
  activePlan().data = currentBlockCopy();
  const target = state.plans.find(x=>x.id === id);
  Object.assign(state, target.data);
  target.data = null;
  state.activePlanId = id;
  selectedSlot = null;
  saveState(); renderTactics(); renderHeader(); renderHome(); renderFixtures();
}
function addPlan(){
  if(state.plans.length >= 6){ toast("Maximal 6 Pläne."); return; }
  const used = new Set(state.plans.map(x=>x.name));
  const name = ["A","B","C","D","E","F","G"].map(l=>"Plan "+l).find(n=>!used.has(n)) || "Neuer Plan";
  const pl = {id: uid(), name, data: currentBlockCopy()};
  state.plans.push(pl);
  switchPlan(pl.id);
  toast(`${name} angelegt – Kopie des bisherigen Plans`);
}
function openPlanModal(){
  const pl = activePlan();
  openModal({
    title: `${pl.name} bearbeiten`,
    body: `<p class="lead">Pläne sind eigenständige Taktik-Varianten (Formation, Aufstellung, Rollen), z. B. „Heim offensiv“ oder „Auswärts kompakt“. Standards und Kader gelten für alle Pläne.</p>
      <div class="field"><label>Name</label><input data-f="name" maxlength="24" value="${esc(pl.name)}"></div>`,
    leftButtons: state.plans.length > 1 ? `<button class="btn btn-danger-outline" data-plan-del>Plan löschen</button>` : "",
    onOpen: m=>{
      const del = qs("[data-plan-del]", m);
      if(del) del.onclick = ()=>{
        closeModal();
        const snap = JSON.stringify(state);
        const other = state.plans.find(x=>x.id !== pl.id);
        switchPlan(other.id);
        state.plans = state.plans.filter(x=>x.id !== pl.id);
        if(state.nextMatch.planId === pl.id) state.nextMatch.planId = "";
        saveState(); renderAll();
        toast(`${pl.name} gelöscht`, {onUndo:()=>{ state = JSON.parse(snap); saveState(); renderAll(); }});
      };
    },
    onSave: get=>{ pl.name = get("name").trim().slice(0,24) || pl.name; saveState(); renderTactics(); renderHeader(); renderFixtures(); }
  });
}
function renderPlanBar(){
  qs("#planBar").innerHTML = state.plans.map(pl=>`<button type="button" role="tab" data-plan="${pl.id}" class="${pl.id===state.activePlanId?"active":""}" aria-selected="${pl.id===state.activePlanId}">${esc(pl.name)}</button>`).join("")
    + `<button type="button" data-plan-add title="Neuer Plan als Kopie des aktuellen" aria-label="Neuen Plan anlegen">+</button>`
    + `<button type="button" data-plan-edit title="Aktuellen Plan umbenennen oder löschen" aria-label="Plan bearbeiten">✎</button>`;
}

/* ---------- Out-of-possession positions (free) ---------- */
function setOopPos(idx, x, y){
  const sl = ensureSlot(idx);
  sl.oopPos = {x: Math.round(clamp(x, 5, 95)), y: Math.round(clamp(y, 6, 95))};
  saveState(); renderTactics();
}
function hasOopOverrides(){ return Object.values(currentSlots()).some(sl=>sl.oopPos); }

/* ---------- Free positioning ---------- */
/** Copies the current formation + line-up into the free formation. Returns the base name if converted. */
function toFreeFormation(){
  if(state.formationName === FREE) return null;
  const base = state.formationName;
  state.customFormation = {base, slots: FORMATIONS[base].map(d=>({cat:d.cat, x:d.x, y:d.y}))};
  state.tactics[FREE] = {slots: JSON.parse(JSON.stringify(slotsFor(state, base)))};
  state.formationName = FREE;
  return base;
}
/** Moves one position; relabels it (IV → DM …) only when it really entered another zone. */
function moveSlotTo(idx, x, y){
  const snap = JSON.stringify(state);
  const base = toFreeFormation();
  const def = state.customFormation.slots[idx];
  const oldZone = catFromCoords(def.x, def.y);
  def.x = Math.round(clamp(x, 5, 95));
  def.y = Math.round(clamp(y, 6, 95));
  if(def.cat !== "TW"){
    const newZone = catFromCoords(def.x, def.y);
    if(newZone !== oldZone && newZone !== def.cat){
      def.cat = newZone;
      const sl = ensureSlot(idx);
      if(!ROLES_IP[newZone].includes(sl.roleIn)) sl.roleIn = ROLES_IP[newZone][0];
      if(!ROLES_OOP[newZone].includes(sl.roleOut)) sl.roleOut = ROLES_OOP[newZone][0];
    }
  }
  saveState(); renderTactics(); renderHeader(); renderHome();
  if(base) toast(`Freie Formation – basiert auf ${base}`, {onUndo:()=>{ state = JSON.parse(snap); saveState(); renderAll(); }});
}
function renderFormationOptions(){
  const sel = qs("#formationSelect");
  sel.innerHTML = Object.keys(FORMATIONS).map(f=>`<option value="${f}">${f}</option>`).join("")
    + (state.customFormation ? `<option value="${FREE}">${esc(formationLabel(FREE))}</option>` : "");
  sel.value = state.formationName;
}
function pitchPercent(pitchEl, clientX, clientY){
  const r = pitchEl.getBoundingClientRect();
  return {x: (clientX - r.left) / r.width * 100, y: (clientY - r.top) / r.height * 100};
}

/* ---------- Drag & drop (pointer events: mouse, touch, pen) ---------- */
let drag = null;
function initDragDrop(){
  document.addEventListener("pointerdown", e=>{
    if(e.button > 0) return;
    const src = e.target.closest("#pitch .pitch-slot, #benchList .bench-item");
    if(!src) return;
    if(e.pointerType === "mouse") e.preventDefault();   // stops text selection while dragging
    drag = { src, pid: src.dataset.pid || null,
             fromSlot: src.dataset.slot !== undefined ? num(src.dataset.slot) : null,
             x:e.clientX, y:e.clientY, moved:false, ghost:null, over:null, freePos:null,
             origLeft: src.style.left, origTop: src.style.top };
  });
  document.addEventListener("pointermove", e=>{
    if(!drag) return;
    if(!drag.moved){
      if(Math.hypot(e.clientX-drag.x, e.clientY-drag.y) < 6) return;
      if(!drag.pid && drag.fromSlot === null) return;
      drag.moved = true;
      const p = playerById(drag.pid);
      drag.ghost = document.createElement("div");
      drag.ghost.className = "drag-ghost";
      drag.ghost.textContent = p ? p.name : formationDefs(state.formationName)[drag.fromSlot].cat;
      document.body.appendChild(drag.ghost);
      drag.src.classList.add("drag-src");
      document.body.classList.add("dragging");
    }
    e.preventDefault();
    drag.ghost.style.left = e.clientX+"px"; drag.ghost.style.top = e.clientY+"px";
    const over = document.elementFromPoint(e.clientX, e.clientY);
    let target = over && (over.closest("#pitch .pitch-slot") || over.closest("#benchList"));
    if(target === drag.src) target = null;                                      // hovering over itself = open grass
    if(target && target.id === "benchList" && !drag.pid) target = null;        // empty slot can't go to the bench
    if(target && target.classList.contains("pitch-slot") && !drag.pid && drag.fromSlot === null) target = null;
    // Free positioning: a pitch position dragged onto open grass follows the pointer.
    const pitchEl = over && over.closest("#pitch");
    drag.freePos = null;
    if(drag.fromSlot !== null && !target && pitchEl){
      {
        const pt = pitchPercent(pitchEl, e.clientX, e.clientY);
        drag.freePos = {x: clamp(pt.x,5,95), y: clamp(pt.y,6,95)};
        drag.src.classList.add("moving");
        drag.src.style.left = drag.freePos.x+"%"; drag.src.style.top = drag.freePos.y+"%";
        const catEl = drag.src.querySelector(".cat");
        const def = formationDefs(state.formationName)[drag.fromSlot];
        if(catEl && def.cat !== "TW" && state.phase === "in"){
          const zone = catFromCoords(drag.freePos.x, drag.freePos.y);
          catEl.textContent = zone !== catFromCoords(def.x, def.y) ? zone : def.cat;
        }
      }
    } else if(drag.src.classList.contains("moving")){
      drag.src.classList.remove("moving");
      drag.src.style.left = drag.origLeft; drag.src.style.top = drag.origTop;
    }
    drag.ghost.style.display = drag.freePos ? "none" : "";
    if(drag.over !== target){
      if(drag.over) drag.over.classList.remove("drop-hover");
      drag.over = target;
      if(target && target !== drag.src) target.classList.add("drop-hover");
    }
  }, {passive:false});
  document.addEventListener("pointerup", e=>{
    if(!drag) return;
    const d = drag; drag = null;
    if(!d.moved){ handleTacticsClick(d); return; }
    d.ghost.remove(); d.src.classList.remove("drag-src","moving"); document.body.classList.remove("dragging");
    if(d.over) d.over.classList.remove("drop-hover");
    if(d.freePos){
      selectedSlot = d.fromSlot;
      if(state.phase === "in") moveSlotTo(d.fromSlot, d.freePos.x, d.freePos.y);
      else setOopPos(d.fromSlot, d.freePos.x, d.freePos.y);
      return;
    }
    const target = d.over;
    if(!target){
      if(d.fromSlot !== null){ d.src.style.left = d.origLeft; d.src.style.top = d.origTop; }
      return;
    }
    if(target.id === "benchList"){
      if(d.fromSlot !== null){ unassign(d.fromSlot); saveState(); renderTactics(); }
      return;
    }
    const to = num(target.dataset.slot);
    if(to === d.fromSlot) return;
    assignToSlot(d.pid, to, d.fromSlot);
    selectedSlot = to;
    saveState(); renderTactics();
  });
  document.addEventListener("pointercancel", ()=>{
    if(!drag) return;
    if(drag.ghost) drag.ghost.remove();
    drag.src.classList.remove("drag-src","moving"); document.body.classList.remove("dragging");
    if(drag.over) drag.over.classList.remove("drop-hover");
    if(drag.fromSlot !== null){ drag.src.style.left = drag.origLeft; drag.src.style.top = drag.origTop; }
    drag = null;
  });
  // Keyboard: arrow keys nudge a focused pitch position (switches to the free formation).
  document.addEventListener("keydown", e=>{
    const arrows = {ArrowLeft:[-2,0], ArrowRight:[2,0], ArrowUp:[0,-2], ArrowDown:[0,2]};
    if(!arrows[e.key]) return;
    const slotEl = e.target.closest && e.target.closest("#pitch .pitch-slot");
    if(!slotEl) return;
    e.preventDefault();
    const idx = num(slotEl.dataset.slot), def = formationDefs(state.formationName)[idx];
    const step = e.shiftKey ? 5 : 1;                 // 2 % per press, Shift = 10 %
    selectedSlot = idx;
    if(state.phase === "in") moveSlotTo(idx, def.x + arrows[e.key][0]*step, def.y + arrows[e.key][1]*step);
    else {
      const cur = slotCoords(def, currentSlots()[idx], "out");
      setOopPos(idx, cur.x + arrows[e.key][0]*step, cur.y + arrows[e.key][1]*step);
    }
    const again = qs(`#pitch [data-slot="${idx}"]`); if(again) again.focus();
  });
  // Keyboard: Enter/Space on a slot selects it; on a bench player assigns to the selected slot.
  document.addEventListener("keydown", e=>{
    if(e.key !== "Enter" && e.key !== " ") return;
    const src = e.target.closest && e.target.closest("#pitch .pitch-slot, #benchList .bench-item");
    if(!src) return;
    e.preventDefault();
    handleTacticsClick({src, pid:src.dataset.pid||null, fromSlot: src.dataset.slot!==undefined ? num(src.dataset.slot) : null});
  });
}
function handleTacticsClick(d){
  if(d.fromSlot !== null){
    selectedSlot = selectedSlot === d.fromSlot ? null : d.fromSlot;
    renderTactics();
    const again = qs(`#pitch [data-slot="${d.fromSlot}"]`); if(again) again.focus();
    return;
  }
  if(selectedSlot === null){ toast("Erst eine Position auf dem Feld anklicken – oder den Spieler direkt aufs Feld ziehen."); return; }
  assignToSlot(d.pid, selectedSlot, null);
  saveState(); renderTactics();
}

function initTactics(){
  renderFormationOptions();
  qs("#benchFilter").innerHTML += options(POS_LIST, "");
  qs("#formationSelect").addEventListener("change", e=>{
    state.formationName = e.target.value; selectedSlot = null;
    const empty = !Object.values(currentSlots()).some(s=>s.playerId);
    if(empty && state.players.length){ autoFillXI(state, state.formationName); toast("Neue Formation – beste Elf vorgeschlagen"); }
    saveState(); renderTactics(); renderHeader();
  });
  qsa(".phase-btn").forEach(btn=> btn.addEventListener("click", ()=>{
    if(state.phase === btn.dataset.phase) return;
    const before = pitchPositions(); state.phase = btn.dataset.phase; saveState(); renderTactics(); animatePitchFrom(before);
  }));
  qs("#toggleLinks").addEventListener("change", e=>{ state.ui.showLinks = e.target.checked; saveState(); renderTactics(); });
  qs("#benchFilter").addEventListener("change", renderBench);
  qs("#btnBestXI").addEventListener("click", runBestXI);
  qs("#planBar").addEventListener("click", e=>{
    const b = e.target.closest("button"); if(!b) return;
    if(b.dataset.plan) switchPlan(b.dataset.plan);
    else if(b.hasAttribute("data-plan-add")) addPlan();
    else if(b.hasAttribute("data-plan-edit")) openPlanModal();
  });
  qs("#btnResetOop").addEventListener("click", ()=>{
    const undo = snapshotUndo("Form gegen den Ball zurückgesetzt", renderAll);
    Object.values(currentSlots()).forEach(sl=>delete sl.oopPos);
    saveState(); renderTactics(); undo();
  });
  qs("#btnClearXI").addEventListener("click", ()=>{
    const undo = snapshotUndo("Aufstellung geleert", renderAll);
    Object.values(currentSlots()).forEach(s=>s.playerId=null);
    selectedSlot = null; saveState(); renderTactics(); undo();
  });
  qsa("#tacticsTabs [data-tab]").forEach(b=> b.addEventListener("click", ()=>{ state.ui.tacticsTab = b.dataset.tab; saveState(); renderTactics(); }));
  initDragDrop();
  initSetPieces();
}
function runBestXI(){
  if(!state.players.length){ toast("Keine Spieler im Kader."); return; }
  const undo = snapshotUndo("", renderAll);
  const r = autoFillXI(state, state.formationName);
  saveState(); renderTactics(); renderHome();
  const parts = ["Beste Elf aufgestellt"];
  if(r.offPos) parts.push(`${r.offPos} auf Fremdposition`);
  if(r.empty) parts.push(`${r.empty} Position(en) unbesetzt`);
  undo(parts.join(" · "));
}

/* ==========================================================================
   TACTICS — SET PIECES
   ========================================================================== */
function initSetPieces(){
  qs("#spTabs").innerHTML = SP_TYPES.map(t=>`<button data-sp="${t.id}">${t.label}</button>`).join("");
  qs("#spTabs").addEventListener("click", e=>{
    const b = e.target.closest("[data-sp]"); if(!b) return;
    state.ui.spType = b.dataset.sp; saveState(); renderSetPieces();
  });
  qs("#spEditor").addEventListener("change", e=>{
    const el = e.target.closest("[data-sp-field]"); if(!el) return;
    const sp = state.setPieces[state.ui.spType];
    if(el.dataset.spField === "taker") sp.taker = el.value || null;
    else { if(el.value) sp.zones[el.dataset.spField] = el.value; else delete sp.zones[el.dataset.spField]; }
    saveState(); renderSetPieces();
  });
  qs("#spEditor").addEventListener("click", e=>{
    if(!e.target.closest("[data-sp-copy]")) return;
    const cur = state.ui.spType, other = cur === "cornerL" ? "cornerR" : "cornerL";
    state.setPieces[cur] = JSON.parse(JSON.stringify(state.setPieces[other]));
    saveState(); renderSetPieces(); toast("Zuordnung übernommen – Schützen ggf. anpassen");
  });
  qs("#penaltyList").addEventListener("change", e=>{
    const el = e.target.closest("[data-pen]"); if(!el) return;
    const order = state.penaltyOrder.slice();
    while(order.length < 5) order.push(null);
    order[num(el.dataset.pen)] = el.value || null;
    state.penaltyOrder = order;
    saveState(); renderSetPieces();
  });
}

function renderSetPieces(){
  const type = SP_TYPES.find(t=>t.id===state.ui.spType) || SP_TYPES[0];
  const sp = state.setPieces[type.id];
  // names are editable (admin → lists) → refresh the tab labels on every render
  qsa("#spTabs [data-sp]").forEach(b=>{ const t = SP_TYPES.find(x=>x.id === b.dataset.sp); if(t) b.textContent = t.label; b.classList.toggle("active", b.dataset.sp === type.id); });

  const mx = x => type.mirror ? 400 - x : x;
  const label = id => { const p = playerById(id); return p ? initials(p.name) : ""; };
  const zonesSVG = type.zones.map(z=>{
    // 11.0 fix: a zone may still point to a player who was sold/loaned/deleted in this session → treat as empty
    const Z = SP_ZONES[z], zp = sp.zones[z] ? playerById(sp.zones[z]) : null, pid = zp ? zp.id : "", x = mx(Z.x);
    return `<g class="zone ${pid?"":"empty"}"><title>${Z.label}${zp?": "+esc(zp.name):""}</title>
      <circle cx="${x}" cy="${Z.y}" r="14"/><text x="${x}" y="${Z.y}">${pid?esc(label(pid)):""}</text>
      <text class="zl" x="${x}" y="${Z.y+24}">${zp ? esc(zp.name.split(" ").slice(-1)[0]) : Z.label}</text></g>`;
  }).join("");
  const tk = type.taker, takerP = playerById(sp.taker);
  const target = type.id === "fkDirect" ? {x:mx(222),y:26} : {x:mx(SP_ZONES.center.x), y:SP_ZONES.center.y};
  qs("#spBoard").innerHTML = `
    <svg class="sp-board" viewBox="0 0 400 300" role="img" aria-label="${type.label}: Zonenbelegung">
      <rect class="ln" x="4" y="20" width="392" height="276"/>
      <rect class="ln" x="56" y="20" width="288" height="136"/>
      <rect class="ln" x="130" y="20" width="140" height="54"/>
      <path class="ln" d="M160 156 A 52 52 0 0 0 240 156"/>
      <rect class="ln" x="168" y="6" width="64" height="14"/>
      <path class="ball-path" d="M${tk.x} ${tk.y} Q ${(tk.x+target.x)/2} ${Math.min(tk.y,target.y)-18} ${target.x} ${target.y}"/>
      ${zonesSVG}
      <g class="taker"><circle cx="${tk.x}" cy="${tk.y}" r="11"/><text x="${tk.x}" y="${tk.y}" style="fill:#fff;font-size:10px;font-weight:700;text-anchor:middle;dominant-baseline:central">${takerP?esc(initials(takerP.name)):"?"}</text></g>
    </svg>`;

  qs("#spEditorTitle").textContent = type.label;
  qs("#spEditor").innerHTML = `
    <div class="sp-field"><label>Schütze</label><select data-sp-field="taker">${playerOptions(sp.taker, "— offen —")}</select></div>
    ${type.zones.map(z=>`<div class="sp-field"><label>${SP_ZONES[z].label}</label><select data-sp-field="${z}">${playerOptions(sp.zones[z], "— frei —")}</select></div>`).join("")}
    ${type.id.startsWith("corner") ? `<button class="btn btn-sm" data-sp-copy style="margin-top:6px">Von ${type.id==="cornerL"?"Ecke rechts":"Ecke links"} übernehmen</button>` : ""}`;

  const order = state.penaltyOrder;
  qs("#penaltyList").innerHTML = [0,1,2,3,4].map(i=>`<li><select data-pen="${i}" aria-label="Elfmeterschütze ${i+1}">${playerOptions(order[i]||null, "— offen —")}</select></li>`).join("");
}


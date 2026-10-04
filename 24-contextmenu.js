/* ==========================================================================
   KONTEXTMENÜ (13.0) – one menu system for the whole app.
   Right click (or long press, the menu key, Shift+F10) on a player, a slot, the pitch, the bench …
   Style "quick" (Schnellleiste: icon bar + chips) or "classic" (sub menus) – Hub → Einstellungen.
   Text fields keep the browser menu; Shift + right click always opens the browser menu.
   ========================================================================== */
let cmStack = [], cmLastFocus = null;
const cmStyle = () => (typeof hub !== "undefined" && hub && hub.cmStyle === "classic") ? "classic" : "quick";
function cmClose(refocus){
  cmStack.forEach(m=>m.remove()); cmStack = [];
  document.removeEventListener("pointerdown", cmOutside, true); window.removeEventListener("resize", cmCloseNow); window.removeEventListener("scroll", cmCloseNow, true);
  if(refocus && cmLastFocus && cmLastFocus.isConnected) try{ cmLastFocus.focus({preventScroll:true}); }catch(e){}
}
const cmCloseNow = () => cmClose(false);
function cmOutside(e){ if(!cmStack.some(m=>m.contains(e.target))) cmClose(false); }
const cmIsOpen = () => cmStack.length > 0;
/** after an action: save and repaint whatever shows players */
function cmCommit(msg, undoFn){
  saveState(); renderAll();                 // 13.1: only the visible view is redrawn – the others when they are opened
  if(typeof spRefresh === "function") spRefresh();
  if(msg) toast(msg, undoFn ? {onUndo:undoFn} : undefined);
}
/** snapshot-based undo for a player / slot change */
function cmUndoable(label, fn){
  const before = JSON.stringify({players:state.players, tactics:state.tactics, bench:state.bench, sales:state.sales, prospects:state.prospects, loans:state.loans});
  fn();
  cmCommit(label, ()=>{ const b = JSON.parse(before); Object.assign(state, b); cmCommit("Rückgängig gemacht"); });
}
/* ---------- notes: dated entries (shown formatted in the player profile) ---------- */
function fmtNoteHTML(t){
  const lines = esc(String(t || "")).split("\n"); let h = "", inList = false;
  lines.forEach(l=>{ const b = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if(/^\s*[-•]\s+/.test(l)){ if(!inList){ h += "<ul>"; inList = true; } h += "<li>" + b.replace(/^\s*[-•]\s+/, "") + "</li>"; }
    else { if(inList){ h += "</ul>"; inList = false; } h += b ? `<p>${b}</p>` : ""; } });
  return h + (inList ? "</ul>" : "");
}
function addPlayerNote(p, text){
  const t = String(text || "").trim(); if(!t) return false;
  p.noteLog = p.noteLog || [];
  p.noteLog.unshift({id:uid(), d:toISO(ingameDate()), t:t.slice(0,4000), at:Date.now()});
  return true;
}
/* ---------- the menus ---------- */
const CM_STATUS_ORDER = () => Object.keys(STATUS);
function cmPlayerParts(p){
  return [
    {chips:"Status", kind:"status", list:CM_STATUS_ORDER(), cur:p.status || "", label:k=>STATUS[k] || "Verfügbar",
      set:k=>cmUndoable(`${p.name}: ${STATUS[k] || "Verfügbar"}`, ()=>{ p.status = k; })},
    {chips:"Positionen · Klick = Nebenposition, Doppelklick = Hauptposition", kind:"pos", list:POS_LIST, main:p.pos, on:p.altPos,
      toggle:x=>cmUndoable(`${p.name}: Nebenposition ${x} ${p.altPos.includes(x) ? "entfernt" : "hinzugefügt"}`, ()=>{ p.altPos = p.altPos.includes(x) ? p.altPos.filter(y=>y !== x) : p.altPos.concat(x); }),
      main:p.pos, setMain:x=>cmUndoable(`${p.name}: Hauptposition ${x}`, ()=>{ const old = p.pos; p.pos = x; p.altPos = p.altPos.filter(y=>y !== x); if(old && old !== x && !p.altPos.includes(old)) p.altPos.push(old); })},
    {stars:"Stärke", v:p.rating, set:n=>cmUndoable(`${p.name}: Stärke ${n} ★`, ()=>{ p.rating = n; })},
    {stars:"Potenzial", v:p.potential || 0, set:n=>cmUndoable(`${p.name}: Potenzial ${n} ★`, ()=>{ p.potential = n; })}
  ];
}
function cmClassicPlayerParts(p){
  return [
    {sub:"Status", ic:"●", items:CM_STATUS_ORDER().map(k=>({lb:STATUS[k] || "Verfügbar", ck:(p.status || "") === k, run:()=>cmUndoable(`${p.name}: ${STATUS[k] || "Verfügbar"}`, ()=>{ p.status = k; })}))},
    {sub:"Positionen", ic:"⌖", items:[{grp:"Hauptposition"}, ...POS_LIST.map(x=>({lb:x, ck:p.pos === x, run:()=>cmUndoable(`${p.name}: Hauptposition ${x}`, ()=>{ const old = p.pos; p.pos = x; p.altPos = p.altPos.filter(y=>y !== x); if(old !== x && !p.altPos.includes(old)) p.altPos.push(old); })})),
      "sep", {grp:"Nebenpositionen"}, ...POS_LIST.filter(x=>x !== p.pos).map(x=>({lb:x, ck:p.altPos.includes(x), run:()=>cmUndoable(`${p.name}: Nebenposition ${x} ${p.altPos.includes(x) ? "entfernt" : "hinzugefügt"}`, ()=>{ p.altPos = p.altPos.includes(x) ? p.altPos.filter(y=>y !== x) : p.altPos.concat(x); })}))]},
    {stars:"Stärke", v:p.rating, set:n=>cmUndoable(`${p.name}: Stärke ${n} ★`, ()=>{ p.rating = n; })},
    {stars:"Potenzial", v:p.potential || 0, set:n=>cmUndoable(`${p.name}: Potenzial ${n} ★`, ()=>{ p.potential = n; })}
  ];
}
function cmSlotInfo(i, phase){
  const defs = formationDefs(state.formationName), oop = oopInfo(), b = boardsNow();
  return {def:defs[i], bp:(phase === "out" ? b.bpOut : b.bpIn)[i], bpIn:b.bpIn[i], bpOut:b.bpOut[i], oopCat:(oopDefAt(oop, i) || defs[i]).cat};
}
function cmRoleItems(i, phase, sl){
  const info = cmSlotInfo(i, phase), list = phase === "in" ? ipRoleList(i) : ROLES_OOP[info.oopCat], cur = phase === "in" ? sl.roleIn : sl.roleOut;
  const hint = phase === "in" ? roleHint(i) : "", ln = lineOf(phase === "in" ? info.bpIn : info.bpOut);
  return list.map(r=>({lb:r, role:r, l:ln, phase, ck:r === cur, hl:r === hint ? "💡 passt" : "",
    run:()=>cmUndoable(`Rolle ${phase === "in" ? "mit Ball" : "gegen den Ball"}: ${r}`, ()=>{ if(phase === "in") sl.roleIn = r; else sl.roleOut = r; })}));
}
function cmMenuForPlayer(p, ctx){
  const quick = cmStyle() === "quick";
  const slots = currentSlots(), slotIdx = ctx.slot !== undefined ? ctx.slot : (()=>{ const k = Object.keys(slots).find(k2=>slots[k2] && slots[k2].playerId === p.id); return k === undefined ? null : num(k); })();
  const inXI = slotIdx !== null, sl = inXI ? slots[slotIdx] : null, phase = ctx.phase || "in";
  const xiOthers = Object.entries(slots).filter(([k,s])=>s && s.playerId && s.playerId !== p.id).map(([k,s])=>({k:num(k), p:playerById(s.playerId)})).filter(o=>o.p);
  const swapItems = inXI ? xiOthers.map(o=>({lb:`${o.p.name}`, kb:boardsNow().bpIn[o.k], run:()=>cmUndoable(`${p.name} ⇄ ${o.p.name}`, ()=>{ assignToSlot(p.id, o.k, slotIdx); })}))
    : xiOthers.map(o=>({lb:`${o.p.name}`, kb:boardsNow().bpIn[o.k], run:()=>cmUndoable(`${p.name} ersetzt ${o.p.name}`, ()=>{ assignToSlot(p.id, o.k, null); benchRemove(p.id); if(benchLimit()) benchAdd(o.p.id); })}));
  const toBench = ()=>cmUndoable(`${p.name} auf die Bank`, ()=>{ if(inXI) unassign(slotIdx); if(benchLimit()) benchAdd(p.id); });
  const notInSquad = ()=>cmUndoable(`${p.name} nicht im Kader`, ()=>{ if(inXI) unassign(slotIdx); benchRemove(p.id); });
  const del = ()=>{ cmClose(false); removeWithUndo("players", p.id, `„${p.name}“`, ()=>{ renderSquad(); renderTactics(); renderHome(); }); };
  const bar = [{ic:"👤", lb:"Profil", run:()=>openPlayerModal(p)},
    inXI || ctx.where === "bench" ? {ic:"⇄", lb:inXI ? "Tauschen" : "Einsetzen", sub:swapItems} : {ic:"▦", lb:"Taktik", run:()=>{ selectedSlot = null; navigate("tactics"); }},
    inXI ? {ic:"↓", lb:"Bank", run:toBench} : {ic:"↗", lb:"Verleihen", run:()=>loanOutPlayer(p)},
    {ic:"✎", lb:"Notiz", note:p},
    {ic:"✕", lb:"Löschen", dan:true, run:del}];
  const items = [];
  if(!quick) items.push({lb:"Profil öffnen", ic:"👤", kb:"Enter", run:()=>openPlayerModal(p)}, "sep");
  if(inXI){
    items.push({grp:"Taktik"},
      {sub:"Rolle mit Ball", ic:"▶", items:cmRoleItems(slotIdx, "in", sl)},
      {sub:"Rolle gegen den Ball", ic:"■", items:cmRoleItems(slotIdx, "out", sl)});
    if(!quick) items.push({sub:"Tauschen mit …", ic:"⇄", items:swapItems}, {lb:"Auf die Bank", ic:"↓", run:toBench});
    items.push({lb:"Nicht im Kader", ic:"⊘", run:notInSquad});
    if(phase === "in" && formationDefs(state.formationName)[slotIdx] && state.formationName === FREE) {}
  } else if(ctx.where === "bench"){
    items.push({grp:"Taktik"});
    if(!quick) items.push({sub:"In die Startelf für …", ic:"↑", items:swapItems});
    if(benchLimit() && !state.bench.includes(p.id)) items.push({lb:"Auf die Bank", ic:"↓", run:()=>cmUndoable(`${p.name} auf die Bank`, ()=>{ benchAdd(p.id); })});
    items.push({lb:"Nach „Nicht im Kader“", ic:"⊘", run:notInSquad});
  }
  items.push("sep", {grp:"Spieler"}, ...(quick ? cmPlayerParts(p) : cmClassicPlayerParts(p)));
  if(!quick) items.push({lb:"Notiz …", ic:"✎", kb:"N", note:p});
  if(ctx.where === "squad" || ctx.where === "xi"){
    items.push("sep", {grp:"Planung"},
      {lb:"In der Taktik zeigen", ic:"▦", run:()=>{ selectedSlot = inXI ? slotIdx : null; navigate("tactics"); renderTactics(); if(!inXI) toast(`${p.name} steht nicht in der Startelf.`); }},
      state.sales.some(s=>s.playerId === p.id) ? {lb:"Auf der Verkaufsliste", ic:"€", dis:true, why:"steht schon drauf"} : {lb:"Auf die Verkaufsliste", ic:"€", run:()=>cmUndoable(`${p.name} auf der Verkaufsliste`, ()=>{ state.sales.push({id:uid(), playerId:p.id, price:valueMid(p), status:"listed", note:""}); })},
      ...(!quick || inXI ? [{lb:"Verleihen …", ic:"↗", run:()=>loanOutPlayer(p)}] : []));   // quick bar shows "Bank" for XI players
  }
  if(!quick) items.push("sep", {lb:"Löschen", ic:"✕", kb:"Entf", dan:true, run:del});
  return {head:{ini:initials(p.name), name:p.name, sub:inXI ? (ctx.phase === "out" ? cmSlotInfo(slotIdx, "out").bp : cmSlotInfo(slotIdx, "in").bpIn) + (sl && cmSlotInfo(slotIdx,"in").bpIn !== cmSlotInfo(slotIdx,"in").bpOut ? ` → ${cmSlotInfo(slotIdx,"in").bpOut}` : "") : p.pos + (p.altPos.length ? " · " + p.altPos.join(", ") : "")},
    bar: quick ? bar : null, items};
}
/** 13.1: youth prospects (Entwicklung → Talente) */
function cmMenuForProspect(p){
  const quick = cmStyle() === "quick";
  const del = ()=>removeWithUndo("prospects", p.id, `Talent „${p.name}“`, ()=>{ renderDevelopment(); renderHome(); });
  const parts = [
    {chips:"Weg", kind:"status", neutral:true, list:Object.keys(PATHWAYS), cur:p.pathway, label:k=>PATHWAYS[k], set:k=>cmUndoable(`${p.name}: ${PATHWAYS[k]}`, ()=>{ p.pathway = k; })},
    {chips:"Position", kind:"pos", single:true, list:POS_LIST, main:p.pos, on:[], toggle:x=>cmUndoable(`${p.name}: Position ${x}`, ()=>{ p.pos = x; }), setMain:x=>cmUndoable(`${p.name}: Position ${x}`, ()=>{ p.pos = x; })},
    {stars:"Aktuell", v:p.current, set:n=>cmUndoable(`${p.name}: Aktuell ${n} ★`, ()=>{ p.current = n; })},
    {stars:"Potenzial", v:p.potential, set:n=>cmUndoable(`${p.name}: Potenzial ${n} ★`, ()=>{ p.potential = n; })}];
  const bar = [{ic:"👤", lb:"Profil", run:()=>openProspectProfile(p)}, {ic:"⬆", lb:"Kader", run:()=>promoteProspect(p)}, {ic:"↗", lb:"Verleihen", run:()=>loanProspect(p)},
    {ic:"✎", lb:"Notiz", note:p}, {ic:"✕", lb:"Entfernen", dan:true, run:del}];
  const items = quick ? [{grp:"Talent"}, ...parts]
    : [{lb:"Profil öffnen", ic:"👤", kb:"Enter", run:()=>openProspectProfile(p)}, "sep", {grp:"Talent"},
       {sub:"Weg", ic:"◆", items:Object.keys(PATHWAYS).map(k=>({lb:PATHWAYS[k], ck:p.pathway === k, run:()=>cmUndoable(`${p.name}: ${PATHWAYS[k]}`, ()=>{ p.pathway = k; })}))},
       {sub:"Position", ic:"⌖", items:POS_LIST.map(x=>({lb:x, ck:p.pos === x, run:()=>cmUndoable(`${p.name}: Position ${x}`, ()=>{ p.pos = x; })}))},
       parts[2], parts[3], {lb:"Notiz …", ic:"✎", kb:"N", note:p}, "sep", {grp:"Planung"},
       {lb:"In den Profikader übernehmen", ic:"⬆", run:()=>promoteProspect(p)}, {lb:"Verleihen", ic:"↗", run:()=>loanProspect(p)}, "sep", {lb:"Entfernen", ic:"✕", kb:"Entf", dan:true, run:del}];
  return {head:{ini:initials(p.name), name:p.name, sub:`${p.pos} · ${p.age} J. · ${PATHWAYS[p.pathway] || ""}`}, bar: quick ? bar : null, items};
}
function cmMenuForEmptySlot(i){
  const d = formationDefs(state.formationName)[i], inXI = new Set(Object.values(currentSlots()).map(s=>s.playerId).filter(Boolean));
  const cands = state.players.filter(p=>!inXI.has(p.id) && !UNAVAILABLE.includes(p.status)).sort((a,b)=>positionFit(b, d.cat) - positionFit(a, d.cat) || b.rating - a.rating);
  const put = p => cmUndoable(`${p.name} als ${d.cat} eingesetzt`, ()=>{ assignToSlot(p.id, i, null); benchRemove(p.id); });
  return {head:{ini:"+", name:"Freie Position", sub:cmSlotInfo(i, "in").bpIn}, items:[
    {sub:"Spieler einsetzen", ic:"+", items:[{grp:`Passend für ${d.cat}`}, ...cands.filter(p=>positionFit(p, d.cat) >= 0.85).slice(0,8).map(p=>({lb:p.name, kb:"★".repeat(p.rating), run:()=>put(p)})),
      "sep", {grp:"Weitere"}, ...cands.filter(p=>positionFit(p, d.cat) < 0.85).slice(0,8).map(p=>({lb:`${p.name} (${p.pos})`, kb:"★".repeat(p.rating), run:()=>put(p)}))]},
    cands[0] ? {lb:`Beste Wahl: ${cands[0].name}`, ic:"★", run:()=>put(cands[0])} : {lb:"Kein freier Spieler", ic:"★", dis:true}]};
}
function cmMenuForPitch(){
  const views = {in:"Mit Ball", out:"Gegen den Ball", both:"Kombiniert", split:"Beide"};
  return {head:{ini:"▦", name:"Spielfeld", sub:`${formationLabel(state.formationName, state)}${oopInfo() ? " · gegen den Ball " + oopInfo().form : ""}`}, items:[
    {sub:"Ansicht", ic:"◫", items:Object.entries(views).map(([k,v])=>({lb:v, ck:state.phase === k, run:()=>{ state.phase = k; saveState(); renderTactics(); }}))},
    {sub:"Formation gegen den Ball", ic:"▦", items:[{lb:"wie mit Ball (kompakt)", ck:!oopInfo(), run:()=>setOopForm("")}, ...Object.keys(FORMATIONS).map(k=>({lb:k, ck:oopInfo() && oopInfo().form === k, run:()=>setOopForm(k)}))]},
    "sep",
    {lb:"Beste Elf", ic:"★", run:()=>{ const b = qs("#btnBestXI"); if(b) b.click(); }},
    {lb:"Verbindungen", ic:"⋰", ck:!!state.ui.showLinks, run:()=>{ state.ui.showLinks = !state.ui.showLinks; saveState(); renderTactics(); }},
    {lb:"KI-Prompt …", ic:"🤖", run:()=>{ const b = qs("#btnAiPrompt"); if(b) b.click(); }},
    "sep", {lb:"Aufstellung leeren", ic:"✕", dan:true, run:()=>{ const b = qs("#btnClearXI"); if(b) b.click(); }}]};
}
/** what was clicked? → menu definition (or null = browser menu) */
function cmResolve(target){
  if(!target || !target.closest) return null;
  if(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .cm")) return null;
  const slotEl = target.closest(".pitch[data-board] .pitch-slot[data-slot]");
  if(slotEl){ const i = num(slotEl.dataset.slot), phase = slotEl.closest(".pitch[data-board]").dataset.phase, p = playerById(slotEl.dataset.pid);
    return p ? cmMenuForPlayer(p, {where:"pitch", slot:i, phase}) : cmMenuForEmptySlot(i); }
  if(target.closest(".pitch[data-board]")) return cmMenuForPitch();
  const bi = target.closest("#benchList .bench-item, #benchRest .bench-item"); if(bi){ const p = playerById(bi.dataset.pid); return p ? cmMenuForPlayer(p, {where:"bench"}) : null; }
  const pr = target.closest("#prospectTbody tr[data-id]"); if(pr){ const p = state.prospects.find(x=>x.id === pr.dataset.id); return p ? cmMenuForProspect(p) : null; }
  const lt = target.closest("#loanTbody tr[data-id]");
  if(lt){ const l = state.loans.find(x=>x.id === lt.dataset.id); if(!l) return null;
    const lb = b => (b.getAttribute("aria-label") || b.title || "").replace(l.name, "").trim() || b.textContent.trim();
    return {head:{ini:initials(l.name), name:l.name, sub:`verliehen an ${l.club || "?"}${l.playtime ? " · Spielzeit: " + (PLAYTIME[l.playtime] || l.playtime) : ""}`},
      items:[{lb:"Zurück in den Kader holen", ic:"↙", run:()=>returnLoan(l)}, "sep", {lb:"Notiz …", ic:"✎", note:l},
        "sep", {lb:"Löschen", ic:"✕", dan:true, run:()=>{ removeWithUndo("loans", l.id, `Leihe „${l.name}“`, ()=>{ renderDevelopment(); renderHome(); }); }}]}; }
  const pc = target.closest("[data-plan-pid]"); if(pc){ const p = playerById(pc.dataset.planPid); return p ? cmMenuForPlayer(p, {where:"squad"}) : null; }
  const deal = target.closest("#tr-center .tc-deal");
  if(deal){   // pipeline card: the menu offers exactly the card's own buttons
    const btns = qsa("[data-tc]", deal); if(!btns.length) return null;
    const lb = b => (b.getAttribute("aria-label") || b.title || b.textContent || "").trim();
    return {head:{ini:"€", name:(qs("strong", deal) || {}).textContent || "Transfer", sub:(qs(".tc-pos", deal) || {}).textContent || ""},
      items:btns.map(b=>({lb:lb(b), ic:b.textContent.trim().length <= 2 ? b.textContent.trim() : "", dan:/del:/.test(b.dataset.tc), run:()=>b.click()}))};
  }
  const lr = target.closest("#squadTbody tr[data-loan-id]");
  if(lr){ const l = state.loans.find(x=>x.id === lr.dataset.loanId); if(!l) return null;
    return {head:{ini:initials(l.name), name:l.name, sub:`verliehen an ${l.club || "?"}`}, items:[
      {lb:"Zurück in den Kader holen", ic:"↙", run:()=>returnLoan(l)},
      {lb:"In Entwicklung → Leihen zeigen", ic:"↗", run:()=>openLoanInDev(l.id)}]}; }
  const sr = target.closest("#squadTbody tr[data-id]"); if(sr){ const p = playerById(sr.dataset.id); return p ? cmMenuForPlayer(p, {where:"squad"}) : null; }
  const xr = target.closest("#miniPitch [data-xi]"); if(xr){ const sl = currentSlots()[num(xr.dataset.xi)], p = sl && playerById(sl.playerId); return p ? cmMenuForPlayer(p, {where:"xi", slot:num(xr.dataset.xi), phase:"in"}) : cmMenuForEmptySlot(num(xr.dataset.xi)); }
  return null;
}
/* ---------- rendering ---------- */
function cmBuild(def, items, x, y, level){
  const m = document.createElement("div"); m.className = "cm"; m.tabIndex = -1; m.setAttribute("role", "menu");
  if(level === 0 && def.head) m.insertAdjacentHTML("beforeend", `<div class="cm-hd"><span class="cm-tok">${esc(def.head.ini)}</span><div><strong>${esc(def.head.name)}</strong><small>${esc(def.head.sub || "")}</small></div></div>`);
  if(level === 0 && def.bar){
    const qb = document.createElement("div"); qb.className = "cm-bar";
    def.bar.forEach(q=>{ const b = document.createElement("button"); b.type = "button"; b.className = q.dan ? "dan" : ""; b.innerHTML = `<span aria-hidden="true">${q.ic}</span><small>${esc(q.lb)}</small>`; b.setAttribute("aria-label", q.lb);
      b.onclick = e=>{ e.stopPropagation();
        if(q.note) return cmNoteEditor(m, q.note);
        if(q.sub){ while(cmStack.length > 1) cmStack.pop().remove(); const r = b.getBoundingClientRect(); const sm = cmBuild(def, q.sub.length ? q.sub : [{lb:"Niemand verfügbar", dis:true}], r.left, r.bottom + 4, 1); sm.focus(); sm._set(0); return; }
        cmClose(false); q.run(); };
      qb.appendChild(b); });
    m.appendChild(qb);
  }
  const acts = [];
  items.forEach(it=>{
    if(it === "sep"){ m.insertAdjacentHTML("beforeend", '<div class="cm-sep"></div>'); return; }
    if(it.grp){ m.insertAdjacentHTML("beforeend", `<div class="cm-grp">${esc(it.grp)}</div>`); return; }
    if(it.stars){
      const r = document.createElement("div"); r.className = "cm-stars"; r.innerHTML = `<span class="lb">${esc(it.stars)}</span><span class="sbar" role="radiogroup" aria-label="${esc(it.stars)}">${[1,2,3,4,5].map(i=>`<button type="button" data-s="${i}" class="${i <= it.v ? "on" : ""}" aria-label="${i} von 5" aria-checked="${i === it.v}">★</button>`).join("")}</span>`;
      qsa("[data-s]", r).forEach(b=>b.onclick = e=>{ e.stopPropagation(); cmClose(false); it.set(num(b.dataset.s)); });
      m.appendChild(r); return;
    }
    if(it.chips){
      const r = document.createElement("div"); r.className = "cm-chips";
      r.innerHTML = `<div class="cl">${esc(it.chips)}</div><div class="chs ${it.kind}">${it.list.map(k=>{
        const cls = it.kind === "status" ? ((it.cur === k ? "on " : "") + (it.neutral ? "neutral" : listBase("status", k) && listBase("status", k) !== "ok" ? "bad" : "")) : (k === it.main ? "is-main" : it.on.includes(k) ? "on" : "");
        return `<button type="button" data-k="${esc(k)}" class="${cls}" aria-pressed="${it.kind === "status" ? it.cur === k : k === it.main || it.on.includes(k)}">${esc(it.kind === "status" ? it.label(k) : k)}</button>`; }).join("")}</div>`;
      qsa("[data-k]", r).forEach(b=>{
        let t = null;
        b.onclick = e=>{ e.stopPropagation(); const k = b.dataset.k;
          if(it.kind === "status"){ cmClose(false); it.set(k); return; }
          if(k === it.main) return;
          if(it.single){ cmClose(false); it.setMain(k); return; }
          clearTimeout(t); t = setTimeout(()=>{ cmClose(false); it.toggle(k); }, 240); };   // wait: a double click makes it the main position
        b.ondblclick = e=>{ e.stopPropagation(); if(it.kind !== "pos") return; clearTimeout(t); cmClose(false); it.setMain(b.dataset.k); };
      });
      m.appendChild(r); return;
    }
    const e = document.createElement("div"); e.className = "cm-it" + (it.dis ? " dis" : "") + (it.dan ? " dan" : ""); e.setAttribute("role", "menuitem");
    if(it.dis){ e.setAttribute("aria-disabled", "true"); if(it.why) e.title = it.why; }
    const inf = it.role && ROLE_INFO[it.role];
    e.innerHTML = it.role
      ? `<span class="ck">${it.ck ? "✓" : ""}</span><span class="cm-chip pc-roles l-${it.l}"><span class="pc-r${it.phase === "in" ? 1 : 2}">${esc(roleAbbr(it.role))}</span></span><span class="lb">${esc(it.lb)}${it.hl ? `<span class="hl">${it.hl}</span>` : ""}</span>${inf ? `<span class="ds">${esc(inf.desc)}</span>` : ""}`
      : `${it.ck !== undefined ? `<span class="ck">${it.ck ? "✓" : ""}</span>` : `<span class="ic">${it.ic || ""}</span>`}<span class="lb">${esc(it.lb || it.sub)}${it.hl ? `<span class="hl">${it.hl}</span>` : ""}</span>${it.kb ? `<span class="kb">${esc(it.kb)}</span>` : ""}${it.sub ? '<span class="ar">›</span>' : ""}`;
    e._it = it; acts.push(e); m.appendChild(e);
  });
  if(level === 0) m.insertAdjacentHTML("beforeend", '<div class="cm-ft">Shift + Rechtsklick: Browser-Menü</div>');
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  if(x + w > innerWidth - 6) x = level ? Math.max(6, x - w - (cmStack[level - 1] ? cmStack[level - 1].offsetWidth : 0) - 6) : innerWidth - w - 6;
  if(y + h > innerHeight - 6) y = Math.max(6, innerHeight - h - 6);
  m.style.left = Math.max(6, x) + "px"; m.style.top = Math.max(6, y) + "px";
  cmStack.push(m); m._i = -1;
  const setA = i => { acts.forEach((a,k)=>a.classList.toggle("act", k === i)); m._i = i; if(acts[i]) acts[i].scrollIntoView && acts[i].scrollIntoView({block:"nearest"}); };
  m._set = setA;
  const openSub = a => { while(cmStack.length > level + 1) cmStack.pop().remove(); if(!a || !a._it.sub || a._it.dis) return null;
    const r = a.getBoundingClientRect(); return cmBuild(def, a._it.items && a._it.items.length ? a._it.items : [{lb:"Niemand verfügbar", dis:true}], r.right + 2, r.top - 5, level + 1); };
  const run = a => { if(!a || a._it.dis) return;
    if(a._it.note){ while(cmStack.length > 1) cmStack.pop().remove(); return cmNoteEditor(cmStack[0], a._it.note); }
    if(a._it.sub){ const sm = openSub(a); if(sm){ sm.focus(); sm._set(0); } return; }
    cmClose(false); a._it.run(); };
  acts.forEach((a,k)=>{ a.onmouseenter = ()=>{ setA(k); if(a._it.sub) openSub(a); else while(cmStack.length > level + 1) cmStack.pop().remove(); };
    a.onclick = e=>{ e.stopPropagation(); run(a); }; });
  m.addEventListener("keydown", e=>{
    if(e.target.tagName === "TEXTAREA") return;
    const n = acts.length; let i = m._i;
    if(e.key === "ArrowDown" && n){ do{ i = (i + 1) % n; }while(acts[i]._it.dis && i !== m._i); setA(i); }
    else if(e.key === "ArrowUp" && n){ do{ i = (i - 1 + n) % n; }while(acts[i]._it.dis && i !== m._i); setA(i); }
    else if(e.key === "ArrowRight" || e.key === "Enter" || e.key === " "){ if(i >= 0) run(acts[i]); }
    else if(e.key === "ArrowLeft" && level > 0){ cmStack.pop().remove(); cmStack[cmStack.length - 1].focus(); }
    else if(e.key === "Escape"){ cmClose(true); }
    else if(e.key === "Tab"){ cmClose(true); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  return m;
}
function cmNoteEditor(m, p){
  m.innerHTML = `<div class="cm-hd"><span class="cm-tok">✎</span><div><strong>Notiz</strong><small>${esc(p.name)} · ${esc(fmtDate(toISO(ingameDate())))}</small></div></div>
    <div class="cm-note"><textarea rows="4" aria-label="Notiz zu ${esc(p.name)}" placeholder="Notiz … (**fett**, - Aufzählung)"></textarea>
    <div class="cm-note-ft"><span>Strg + Enter speichert</span><button type="button" class="btn btn-sm btn-accent">Speichern</button></div></div>`;
  const ta = qs("textarea", m), save = ()=>{ const t = ta.value; cmClose(true); if(addPlayerNote(p, t)) cmCommit(`Notiz für ${p.name} gespeichert – im Profil unter „Notiz-Verlauf“`); };
  qs(".cm-note button", m).onclick = e=>{ e.stopPropagation(); save(); };
  ta.addEventListener("keydown", e=>{ if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); save(); } else if(e.key === "Escape"){ e.preventDefault(); cmClose(true); } e.stopPropagation(); });
  ta.focus({preventScroll:true});      // at once – fast typing right after the click must land in the note (and not trigger shortcuts)
}
function cmOpenAt(target, x, y){
  const def = cmResolve(target); if(!def) return false;
  cmClose(false); cmLastFocus = document.activeElement;
  const m = cmBuild(def, def.items, x, y, 0); m.focus({preventScroll:true}); m._set(def.bar ? -1 : 0);
  document.addEventListener("pointerdown", cmOutside, true); window.addEventListener("resize", cmCloseNow); window.addEventListener("scroll", cmCloseNow, true);
  if(typeof hidePitchTip === "function") hidePitchTip();
  return true;
}
function initContextMenu(){
  document.addEventListener("contextmenu", e=>{
    if(e.shiftKey) return;                                                     // Shift + right click = browser menu
    if(cmOpenAt(e.target, e.clientX, e.clientY)) e.preventDefault();
  });
  // keyboard: menu key / Shift+F10 on the focused element
  document.addEventListener("keydown", e=>{
    if(!(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
    const el = document.activeElement; if(!el || el === document.body) return;
    const r = el.getBoundingClientRect();
    if(cmOpenAt(el, r.left + 10, r.bottom + 2)) e.preventDefault();
  }, true);
  // touch: long press
  let lp = null;
  document.addEventListener("touchstart", e=>{ const t = e.touches[0], tg = e.target; clearTimeout(lp);
    lp = setTimeout(()=>{ if(cmOpenAt(tg, t.clientX, t.clientY) && navigator.vibrate) navigator.vibrate(12); }, 520); }, {passive:true});
  ["touchend","touchmove","touchcancel"].forEach(ev=>document.addEventListener(ev, ()=>clearTimeout(lp), {passive:true}));
}

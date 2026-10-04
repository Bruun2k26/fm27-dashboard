/* ==========================================================================
   DEVELOPMENT — prospects & loans
   ========================================================================== */
function initDevelopment(){
  qsa("#devTabs [data-tab]").forEach(b=>b.addEventListener("click", ()=>{ state.ui.devTab = b.dataset.tab; saveState(); renderDevelopment(); }));
  qs("#btnAddDev").addEventListener("click", ()=> state.ui.devTab === "loans" ? openLoanModal() : openProspectModal());

  const bind = (tbodySel, listName, label, extraClick) => {
    const tb = qs(tbodySel);
    tb.addEventListener("change", e=>{
      const el = e.target.closest("[data-field]"); if(!el) return;
      const item = state[listName].find(x=>x.id===el.closest("tr").dataset.id);
      const f = el.dataset.field;
      const before = item[f];
      item[f] = el.type === "checkbox" ? el.checked : el.type === "number" ? Math.max(0, num(el.value)) : el.value;
      if(listName === "loans" && f === "playtime"){ onLoanPlaytime(item, before); saveState(); renderDevelopment(); renderHome(); return; }
      saveState(); if(listName === "loans") renderHome();
    });
    tb.addEventListener("click", e=>{
      const tr = e.target.closest("tr[data-id]"); if(!tr) return;
      const item = state[listName].find(x=>x.id===tr.dataset.id);
      const star = e.target.closest("[data-star]");
      if(star){ item[star.closest("[data-stars]").dataset.stars] = num(star.dataset.star); saveState(); renderDevelopment(); return; }
      if(e.target.closest("[data-del]")) return removeWithUndo(listName, item.id, `${label} „${item.name}“`, ()=>{ renderDevelopment(); renderHome(); });
      if(extraClick) extraClick(e, item);
    });
  };
  bind("#prospectTbody", "prospects", "Talent", (e, p)=>{
    if(e.target.closest("[data-prof]")) return openProspectProfile(p);
    if(e.target.closest("[data-promote]")) promoteProspect(p);
    if(e.target.closest("[data-loan]")) loanProspect(p);
  });
  bind("#loanTbody", "loans", "Leihe", (e, l)=>{
    if(e.target.closest("[data-return]")) returnLoan(l);
  });
}

/** Spielzeit "Schlecht": red marking, auto note, "Rückruf prüfen". Back to good: the auto note goes again. */
function onLoanPlaytime(l, before){
  const nowBad = listBase("playtime", l.playtime) === "bad", wasBad = listBase("playtime", before) === "bad";
  if(nowBad && !wasBad){
    if(!l.note.includes(LOAN_BAD_NOTE)) l.note = l.note ? `${l.note} · ${LOAN_BAD_NOTE}` : LOAN_BAD_NOTE;
    l.recallCheck = true;
    toast(`${l.name}: rot markiert, Notiz ergänzt, „Rückruf prüfen“ gesetzt`);
  } else if(wasBad && !nowBad){
    l.note = l.note.replace(" · " + LOAN_BAD_NOTE, "").replace(LOAN_BAD_NOTE, "").trim();
  }
}

function renderDevelopment(){
  const tab = state.ui.devTab;
  qsa("#devTabs [data-tab]").forEach(b=>b.classList.toggle("active", b.dataset.tab === tab));
  qs("#dev-prospects").classList.toggle("active", tab === "prospects");
  qs("#dev-loans").classList.toggle("active", tab === "loans");
  qs("#btnAddDev").textContent = tab === "loans" ? "+ Leihe" : "+ Talent";

  qs("#prospectTbody").innerHTML = state.prospects.slice().sort((a,b)=>b.potential-a.potential || a.age-b.age).map(p=>`
    <tr data-id="${p.id}">
      <td data-label="Name"><div class="player-cell"><span class="avatar" data-prof aria-hidden="true">${esc(initials(p.name))}</span><button type="button" class="player-link" data-prof title="Talentprofil öffnen" aria-label="Talentprofil von ${esc(p.name)} öffnen">${esc(p.name)}</button></div></td>
      <td data-label="Pos."><select class="w-pos" data-field="pos" aria-label="Position">${options(POS_LIST, p.pos)}</select></td>
      <td data-label="Alter"><input type="number" class="w-xs" value="${p.age}" data-field="age" aria-label="Alter"></td>
      <td data-label="Aktuell">${starsInput(p.current, 'data-stars="current" aria-label="Aktuelles Niveau"')}</td>
      <td data-label="Potenzial">${starsInput(p.potential, 'data-stars="potential" aria-label="Potenzial"')}</td>
      <td data-label="Weg"><select class="w-sel" data-field="pathway" aria-label="Entwicklungsweg">${options(PATHWAYS, p.pathway)}</select></td>
      <td data-label="Trainingsfokus"><input type="text" value="${esc(p.focus)}" data-field="focus" aria-label="Trainingsfokus"></td>
      <td data-label="Bereit bis"><input type="text" class="w-s" value="${esc(p.readyBy)}" data-field="readyBy" placeholder="z.B. 2028/29" aria-label="Bereit bis"></td>
      <td data-label="Notiz"><input type="text" value="${esc(p.note)}" data-field="note" aria-label="Notiz"></td>
      <td data-label=""><span class="row-actions">
        <button class="btn-icon-sm" data-promote title="In den Profikader übernehmen" aria-label="${esc(p.name)} befördern">⬆</button>
        <button class="btn-icon-sm" data-loan title="Verleihen" aria-label="${esc(p.name)} verleihen">↗</button>
        <button class="btn-icon-sm del" data-del title="Löschen" aria-label="${esc(p.name)} löschen">✕</button>
      </span></td>
    </tr>`).join("") || `<tr class="empty-row"><td colspan="10">Noch keine Talente. Trage Jugendspieler ein, die du langfristig entwickeln willst.</td></tr>`;

  qs("#loanTbody").innerHTML = state.loans.map(l=>`
    <tr data-id="${l.id}" class="${listBase("playtime", l.playtime) === "bad" ? "loan-bad" : ""}" title="${listBase("playtime", l.playtime) === "bad" ? "Spielzeit schlecht – zurückholen oder Leihe abbrechen" : ""}">
      <td data-label="Name"><input type="text" class="w-name" value="${esc(l.name)}" data-field="name" aria-label="Name"></td>
      <td data-label="Pos."><select class="w-pos" data-field="pos" aria-label="Position">${options(POS_LIST, l.pos)}</select></td>
      <td data-label="Alter"><input type="number" class="w-xs" value="${l.age}" data-field="age" aria-label="Alter"></td>
      <td data-label="Leihclub"><input type="text" value="${esc(l.club)}" data-field="club" aria-label="Leihclub"></td>
      <td data-label="Liga"><input type="text" class="w-m" value="${esc(l.league)}" data-field="league" aria-label="Liga"></td>
      <td data-label="Bis"><input type="text" class="w-s" value="${esc(l.until)}" data-field="until" aria-label="Leihe bis"></td>
      <td data-label="Einsätze"><input type="number" class="w-xs" value="${l.apps}" data-field="apps" aria-label="Einsätze"></td>
      <td data-label="Spielzeit"><select class="w-sel pt-${listBase("playtime", l.playtime) || "none"}" data-field="playtime" aria-label="Spielzeit">${`<option value="">— bewerten —</option>` + options(PLAYTIME, l.playtime)}</select></td>
      <td data-label="Klausel"><select class="w-sel" data-field="clause" aria-label="Klausel">${options(LOAN_CLAUSES, l.clause)}</select></td>
      <td data-label="Rückruf prüfen"><input type="checkbox" ${l.recallCheck?"checked":""} data-field="recallCheck" aria-label="Rückruf prüfen" style="accent-color:var(--warning);width:16px;height:16px"></td>
      <td data-label="Notiz"><input type="text" value="${esc(l.note)}" title="${esc(l.note)}" data-field="note" aria-label="Notiz"></td>
      <td data-label=""><span class="row-actions">
        <button class="btn-icon-sm" data-return title="Zurück in den Kader" aria-label="${esc(l.name)} zurückholen">↙</button>
        <button class="btn-icon-sm del" data-del title="Löschen" aria-label="${esc(l.name)} löschen">✕</button>
      </span></td>
    </tr>`).join("") || `<tr class="empty-row"><td colspan="12">Keine Spieler verliehen. Über „↗“ im Kader oder bei Talenten verleihen.</td></tr>`;
}

function openProspectModal(){
  openModal({
    title:"Neues Talent",
    body:`
      <div class="field"><label>Name</label><input data-f="name"></div>
      <div class="field-row">
        <div class="field"><label>Position</label><select data-f="pos">${options(POS_LIST,"ZM")}</select></div>
        <div class="field"><label>Alter</label><input data-f="age" type="number" value="17"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Aktuell (1–5)</label><input data-f="current" type="number" min="1" max="5" value="2"></div>
        <div class="field"><label>Potenzial (1–5)</label><input data-f="potential" type="number" min="1" max="5" value="4"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Weg</label><select data-f="pathway">${options(PATHWAYS,"u19")}</select></div>
        <div class="field"><label>Bereit bis</label><input data-f="readyBy" placeholder="z.B. 2028/29"></div>
      </div>
      <div class="field"><label>Trainingsfokus</label><input data-f="focus"></div>`,
    saveLabel:"Hinzufügen",
    onSave: get=>{
      state.prospects.push({id:uid(), name:get("name").trim()||"Talent", pos:get("pos"), age:get("age"),
        current:clamp(get("current"),1,5), potential:clamp(get("potential"),1,5), pathway:get("pathway"),
        focus:get("focus"), readyBy:get("readyBy"), note:""});
      saveState(); renderDevelopment(); toast("Talent hinzugefügt");
    }
  });
}
function openLoanModal(){
  openModal({
    title:"Neue Leihe",
    body:`
      <div class="field"><label>Name</label><input data-f="name"></div>
      <div class="field-row">
        <div class="field"><label>Position</label><select data-f="pos">${options(POS_LIST,"ZM")}</select></div>
        <div class="field"><label>Alter</label><input data-f="age" type="number" value="20"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Leihclub</label><input data-f="club"></div>
        <div class="field"><label>Liga</label><input data-f="league"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Bis</label><input data-f="until" placeholder="06/2028"></div>
        <div class="field"><label>Klausel</label><select data-f="clause">${options(LOAN_CLAUSES,"recall")}</select></div>
      </div>
      <div class="field"><label>Notiz zur Leihe</label><textarea data-f="loanNote" rows="2" placeholder="z. B. versprochene Einsatzzeiten"></textarea></div>`,
    saveLabel:"Hinzufügen",
    onSave: get=>{
      state.loans.push({id:uid(), name:get("name").trim()||"Spieler", pos:get("pos"), age:get("age"), club:get("club"),
        league:get("league"), until:get("until"), apps:0, minutes:0, clause:get("clause"), recallCheck:false, note:get("loanNote").trim()});
      saveState(); renderDevelopment(); renderHome(); toast("Leihe hinzugefügt");
    }
  });
}
/* ---------- 13.1: prospect profile (like the player profile – live head, note log, actions) ---------- */
function prospectHeadHTML(p){
  return `<div class="pp-live"><div class="pp-head">
      <span class="pp-avatar">${esc(initials(p.name || "?"))}</span>
      <div class="pp-id"><strong>${esc(p.name || "Unbenannt")}</strong>
        <span class="pp-meta"><span class="pp-pos">${esc(p.pos)}</span><span>${p.age} Jahre</span><span>${esc(PATHWAYS[p.pathway] || "")}</span></span></div>
      <span class="badge info">Talent</span>
    </div>
    <div class="pp-kpis">
      <div><span>Aktuell</span>${starsRO(p.current)}</div>
      <div><span>Potenzial</span>${starsRO(p.potential)}</div>
      <div><span>Entwicklungsweg</span><strong>${esc(PATHWAYS[p.pathway] || "—")}</strong></div>
      <div><span>Bereit bis</span><strong>${esc(p.readyBy || "—")}</strong></div>
      <div><span>Trainingsfokus</span><strong>${esc(p.focus || "—")}</strong></div>
    </div></div>`;
}
function openProspectProfile(p){
  const stars = sel => options({1:"★",2:"★★",3:"★★★",4:"★★★★",5:"★★★★★"}, sel);
  openModal({title:"Talentprofil", body:`${prospectHeadHTML(p)}
    <div class="pp-grid"><section class="pp-sec"><h4>Profil &amp; Entwicklung</h4>
      <div class="field"><label>Name</label><input data-f="name" value="${esc(p.name)}"></div>
      <div class="field-row"><div class="field"><label>Position</label><select data-f="pos">${options(POS_LIST, p.pos)}</select></div>
        <div class="field"><label>Alter</label><input data-f="age" type="number" min="12" max="25" value="${p.age}"></div>
        <div class="field"><label>Entwicklungsweg</label><select data-f="pathway">${options(PATHWAYS, p.pathway)}</select></div></div>
      <div class="field-row"><div class="field"><label>Aktuell (1–5)</label><select data-f="current">${stars(p.current)}</select></div>
        <div class="field"><label>Potenzial (1–5)</label><select data-f="potential">${stars(p.potential)}</select></div>
        <div class="field"><label>Bereit bis</label><input data-f="readyBy" value="${esc(p.readyBy)}" placeholder="z. B. 2028/29"></div></div>
      <div class="field"><label>Trainingsfokus</label><input data-f="focus" value="${esc(p.focus)}" placeholder="z. B. Abschluss, Zweikämpfe"></div></section>
    <section class="pp-sec"><h4>Notizen</h4>
      <div class="field"><textarea data-f="note" rows="4" aria-label="Notiz" placeholder="Feste Notiz – Pläne, Beobachtungen …">${esc(p.note)}</textarea></div>
      <h4 style="margin-top:12px">Notiz-Verlauf</h4><div class="pp-log" id="ppLog">${ppNoteLogHTML(p)}</div>
      <div class="pp-log-add"><textarea id="ppLogNew" rows="2" aria-label="Neuer datierter Eintrag" placeholder="Neuer Eintrag mit Spieldatum … (**fett**, - Aufzählung)"></textarea><button type="button" class="btn btn-sm" id="ppLogAdd">+ Eintrag</button></div></section></div>`,
    leftButtons:`<button class="btn btn-sm" type="button" data-pp="promote">⬆ In den Kader</button><button class="btn btn-sm" type="button" data-pp="loan">↗ Verleihen</button><button class="btn btn-sm btn-danger-outline" type="button" data-pp="del">Löschen</button>`,
    onOpen: m=>{ m.classList.add("pp-wide");
      const g = f => { const el = qs(`[data-f="${f}"]`, m); return el ? readInput(el) : undefined; };
      const refresh = ()=>{ const tmp = Object.assign({}, p, {name:String(g("name") || "").trim(), pos:g("pos"), age:clamp(num(g("age")), 12, 25), pathway:g("pathway"),
        current:clamp(num(g("current"), 2), 1, 5), potential:clamp(num(g("potential"), 3), 1, 5), readyBy:String(g("readyBy") || ""), focus:String(g("focus") || "")});
        const live = qs(".pp-live", m); if(live) live.outerHTML = prospectHeadHTML(tmp); };
      m.addEventListener("input", e=>{ if(e.target.closest("[data-f]")) refresh(); });
      m.addEventListener("change", e=>{ if(e.target.closest("[data-f]")) refresh(); });
      const repaint = ()=>{ qs("#ppLog", m).innerHTML = ppNoteLogHTML(p); };
      qs("#ppLogAdd", m).onclick = ()=>{ const ta = qs("#ppLogNew", m); if(addPlayerNote(p, ta.value)){ ta.value = ""; saveState(); repaint(); toast("Eintrag gespeichert"); } };
      qs("#ppLogNew", m).addEventListener("keydown", e=>{ if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); qs("#ppLogAdd", m).click(); } });
      qs("#ppLog", m).addEventListener("click", e=>{ const d = e.target.closest("[data-pp-logdel]"); if(!d) return;
        const idx = p.noteLog.findIndex(x=>x.id === d.dataset.ppLogdel), gone = p.noteLog[idx]; if(idx < 0) return;
        p.noteLog.splice(idx, 1); saveState(); repaint(); toast("Eintrag gelöscht", {onUndo:()=>{ p.noteLog.splice(idx, 0, gone); saveState(); repaint(); }}); });
      qsa("[data-pp]", m).forEach(b=>b.addEventListener("click", ()=>{ const k = b.dataset.pp; closeModal();
        if(k === "promote") promoteProspect(p); else if(k === "loan") loanProspect(p);
        else removeWithUndo("prospects", p.id, `Talent „${p.name}“`, ()=>{ renderDevelopment(); renderHome(); }); }));
    },
    saveLabel:"Speichern",
    onSave: get=>{
      const before = JSON.stringify(p);
      Object.assign(p, {name:get("name").trim() || "Talent", pos:get("pos"), age:clamp(num(get("age")), 12, 25), pathway:get("pathway"),
        current:clamp(num(get("current"), 2), 1, 5), potential:clamp(num(get("potential"), 3), 1, 5), readyBy:get("readyBy").trim(), focus:get("focus").trim(), note:get("note")});
      saveState(); renderDevelopment(); renderHome();
      toast("Talentprofil gespeichert", {onUndo:()=>{ Object.assign(p, JSON.parse(before)); saveState(); renderDevelopment(); }});
    }});
}
function promoteProspect(p){
  const undo = snapshotUndo(`${p.name} in den Profikader übernommen`, renderAll);
  state.players.push({id:uid(), name:p.name, pos:p.pos, altPos:[], age:p.age, salary:0, contractUntil:ingameDate().getFullYear()+3,
    squadRole:"prospect", rating:p.current, potential:p.potential, status:"", note:[p.focus && "Fokus: "+p.focus, p.note].filter(Boolean).join(" · "), noteLog:(p.noteLog || []).slice()});
  state.prospects = state.prospects.filter(x=>x.id!==p.id);
  saveState(); renderAll(); undo();
}
function loanProspect(p){
  const undo = snapshotUndo(`${p.name} zur Leihe verschoben`, renderAll);
  state.loans.push({id:uid(), name:p.name, pos:p.pos, age:p.age, club:"", league:"", until:"", apps:0, minutes:0, clause:"recall", recallCheck:false, note:p.note});
  state.prospects = state.prospects.filter(x=>x.id!==p.id);
  state.ui.devTab = "loans";
  saveState(); renderAll(); undo();
}
function returnLoan(l){
  const undo = snapshotUndo(`${l.name} ist zurück im Kader`, renderAll);
  const loanInfo = l.club ? `Leihe: ${l.club} (${l.apps} Sp.${l.playtime ? ", Spielzeit " + PLAYTIME[l.playtime] : ""})` : "";
  const loanNote = l.note.replace(" · " + LOAN_BAD_NOTE, "").replace(LOAN_BAD_NOTE, "").trim();
  if(l.player){
    // loaned out from the squad → restore the complete record (same id: history, custom fields … stay connected)
    const p = JSON.parse(JSON.stringify(l.player));
    if(state.players.some(x=>x.id === p.id)) p.id = uid();
    if(!p.birthDate) p.age = Math.max(num(p.age), num(l.age));
    p.status = ""; p.extendPlanned = false;
    const extra = [loanNote && loanNote !== (l.player.note || "").trim() ? loanNote : "", loanInfo].filter(Boolean);
    p.note = [p.note, ...extra].filter(Boolean).join(" · ");
    state.players.push(p);
    if(l.playerHistory && l.playerHistory.length){ state.history = state.history || {}; state.history[p.id] = l.playerHistory.concat(state.history[p.id] || []); }
  } else {
    // entered directly as a loan (no squad record) → new player with what is known
    state.players.push({id:uid(), name:l.name, pos:l.pos, altPos:[], age:l.age, salary:0, contractUntil:ingameDate().getFullYear()+2,
      squadRole: l.age < 21 ? "prospect" : "rotation", rating:3, status:"", note:[loanInfo, loanNote].filter(Boolean).join(" · ")});
  }
  state.loans = state.loans.filter(x=>x.id!==l.id);
  saveState(); renderAll(); undo();
}


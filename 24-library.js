/* ==========================================================================
   SPIELEBIBLIOTHEK (11.4 Beta) – all your games: shelf, list, board.
   Lives in the hub (global, not per FM save). No account / no online sync – by hand or text import.
   ========================================================================== */
const LIB_GENRES = ["Action","Adventure","Rollenspiel","Strategie","Simulation","Sport","Management","Rennspiel","Shooter","Aufbau","Puzzle","Roguelike","Indie","Horror","Koop"];
const LIB_TAGS = ["entspannt","fordernd","kurz","lang","story","koop","multiplayer","open world","couch"];
let libQuery = "", libStatus = "", libPlatform = "", libDrag = null;

const libSample = () => [
  ["Football Manager 26","PC","Management","playing",4,412,0,["lang","management"]],
  ["Elden Ring","PC","Rollenspiel","done",5,118,100,["fordernd","open world"]],
  ["Baldur's Gate 3","PC","Rollenspiel","backlog",0,0,100,["story","koop","lang"]],
  ["Hades II","Nintendo Switch","Roguelike","playing",5,26,40,["fordernd","kurz"]],
  ["Stardew Valley","Nintendo Switch","Simulation","done",4,74,0,["entspannt","koop","couch"]],
  ["Cyberpunk 2077","PC","Rollenspiel","backlog",0,0,60,["story","open world"]],
  ["EA SPORTS FC 26","PlayStation 5","Sport","dropped",3,31,0,["multiplayer","couch"]],
  ["Anno 117: Pax Romana","PC","Aufbau","wish",0,0,80,["entspannt","lang"]],
  ["Hollow Knight: Silksong","Nintendo Switch","Action","backlog",0,0,30,["fordernd"]],
  ["Forza Horizon 5","Xbox Series","Rennspiel","backlog",0,0,25,["entspannt","open world"]]
].map(([title, platform, genre, status, rating, hours, estHours, tags])=>{
  const today = new Date(), iso = d => d.toISOString().slice(0,10), ago = n => iso(new Date(today.getTime() - n * 86400000));
  return {id:uid(), title, platform, genre, status, rating, hours, estHours, tags, sample:true,
    started: status === "backlog" || status === "wish" ? "" : ago(30 + hours), finished: status === "done" ? ago(10 + rating * 7) : "", updatedAt: Date.now() - hours * 1000};
});
const todayISO = () => new Date().toISOString().slice(0,10);
function libFiltered(){
  const q = libQuery.trim().toLowerCase();
  const list = hub.games.filter(g=>(!libStatus || g.status === libStatus) && (!libPlatform || g.platform === libPlatform)
    && (!q || [g.title, g.genre, g.platform, g.tags.join(" "), g.notes].join(" ").toLowerCase().includes(q)));
  const by = {updated:(a,b)=>b.updatedAt - a.updatedAt, title:(a,b)=>a.title.localeCompare(b.title, "de"), rating:(a,b)=>b.rating - a.rating || a.title.localeCompare(b.title, "de"),
    hours:(a,b)=>b.hours - a.hours, platform:(a,b)=>a.platform.localeCompare(b.platform, "de") || a.title.localeCompare(b.title, "de"),
    status:(a,b)=>GAME_STATUS.findIndex(s=>s[0] === a.status) - GAME_STATUS.findIndex(s=>s[0] === b.status) || a.title.localeCompare(b.title, "de")}[hub.libSort] || ((a,b)=>b.updatedAt - a.updatedAt);
  return list.slice().sort(by);
}
function libStats(){
  const g = hub.games, y = String(new Date().getFullYear()), rated = g.filter(x=>x.rating);
  const backlog = g.filter(x=>x.status === "backlog");
  return {total:g.length, playing:g.filter(x=>x.status === "playing").length, backlog:backlog.length, backlogHours:backlog.reduce((a,x)=>a + x.estHours, 0),
    doneYear:g.filter(x=>x.status === "done" && x.finished.startsWith(y)).length, hours:Math.round(g.reduce((a,x)=>a + x.hours, 0)),
    avg: rated.length ? rated.reduce((a,x)=>a + x.rating, 0) / rated.length : 0, year:y};
}
const libStars = n => `<span class="lib-stars" aria-label="${n} von 5 Sternen">${"★".repeat(n)}<span>${"★".repeat(5 - n)}</span></span>`;
const steamBtn = g => g.steamId ? `<a class="btn btn-sm lib-play" href="steam://run/${g.steamId}" title="Über Steam starten">▶ Spielen</a>` : "";
const statusChip = g => `<span class="lib-status s-${g.status}">${esc(GAME_STATUS_LABEL[g.status])}</span>`;

function renderLibrary(root){
  const st = libStats(), list = libFiltered(), platforms = [...new Set(hub.games.map(g=>g.platform).filter(Boolean))].sort();
  const view = hub.libView, hasSample = hub.games.some(g=>g.sample);
  root.innerHTML = `
    <header class="hub-top">
      <div class="hub-brand"><button class="btn btn-sm" data-hub="home" data-hub-first title="Zurück zum Hub (Esc)">← Hub</button>
        <div><strong>Spielebibliothek <span class="beta-pill">Beta</span></strong><span class="muted small">${esc(hub.name)}</span></div></div>
      <div class="hub-top-actions">
        <button class="btn btn-sm" data-lib="next" ${st.backlog ? "" : "disabled"}>🎲 Was spiele ich als Nächstes?</button>
        <button class="btn btn-sm" data-lib="import">Import</button>
        <button class="btn btn-sm btn-accent" data-lib="new">+ Spiel</button>
      </div>
    </header>
    <main class="hub-main lib-main">
      <div class="lib-stats">
        <div><span>Spiele</span><strong>${st.total}</strong></div>
        <div><span>Spiele ich gerade</span><strong>${st.playing}</strong></div>
        <div><span>Backlog</span><strong>${st.backlog}</strong><em>${st.backlogHours ? `≈ ${st.backlogHours} Std.` : "Dauer unbekannt"}</em></div>
        <div><span>Durchgespielt ${st.year}</span><strong>${st.doneYear}</strong></div>
        <div><span>Spielzeit gesamt</span><strong>${st.hours} Std.</strong></div>
        <div><span>Ø Bewertung</span><strong>${st.avg ? fmtNum(st.avg, 1) + " ★" : "–"}</strong></div>
      </div>
      ${hasSample ? `<div class="lib-sample-note">Du siehst Beispielspiele zum Ausprobieren. <button class="linkish" data-lib="clearSamples">Beispiele entfernen</button></div>` : ""}
      <div class="lib-toolbar">
        <div class="seg" role="tablist" aria-label="Ansicht">${[["shelf","Regal"],["list","Liste"],["board","Board"]].map(([k,l])=>`<button role="tab" aria-selected="${view === k}" class="${view === k ? "active" : ""}" data-lib-view="${k}">${l}</button>`).join("")}</div>
        <input type="search" id="libSearch" placeholder="Suchen … ( / )" value="${esc(libQuery)}" aria-label="Spiele suchen">
        <select id="libStatus" aria-label="Status filtern"><option value="">Alle Status</option>${GAME_STATUS.map(([k,l])=>`<option value="${k}" ${libStatus === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <select id="libPlatform" aria-label="Plattform filtern"><option value="">Alle Plattformen</option>${platforms.map(p=>`<option ${libPlatform === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
        ${view !== "board" ? `<select id="libSort" aria-label="Sortieren">${options({updated:"Zuletzt geändert", title:"Titel A–Z", rating:"Bewertung", hours:"Spielzeit", platform:"Plattform", status:"Status"}, hub.libSort)}</select>` : ""}
      </div>
      ${!hub.games.length ? `<div class="lib-empty"><div class="lib-empty-icon" aria-hidden="true">🎮</div><h2>Deine Bibliothek ist noch leer</h2>
          <p class="muted">Lege dein erstes Spiel an, füge eine Liste ein – oder schau dir die Bibliothek mit Beispielspielen an.</p>
          <div class="lib-empty-actions"><button class="btn btn-accent" data-lib="samples">Beispielspiele ansehen</button><button class="btn" data-lib="new">+ Spiel</button><button class="btn" data-lib="import">Liste einfügen</button></div></div>`
        : !list.length ? `<p class="empty">Keine Treffer – Suche oder Filter anpassen.</p>`
        : view === "list" ? libListHTML(list) : view === "board" ? libBoardHTML(list) : libShelfHTML(list)}
    </main>`;
  const s = qs("#libSearch"); if(s) s.addEventListener("input", ()=>{ libQuery = s.value; const pos = s.selectionStart; renderLibrary(root); const n = qs("#libSearch"); n.focus(); n.setSelectionRange(pos, pos); });
  [["#libStatus", v=>libStatus = v], ["#libPlatform", v=>libPlatform = v], ["#libSort", v=>{ hub.libSort = v; saveHub(); }]].forEach(([sel, set])=>{ const el = qs(sel); if(el) el.addEventListener("change", ()=>{ set(el.value); renderLibrary(root); }); });
  if(view === "board") bindBoardDnD(root);
}
function libShelfHTML(list){
  return `<div class="lib-shelf">${list.map(g=>`<article class="lib-card" data-lib-open="${g.id}" tabindex="0" role="button" aria-label="${esc(g.title)} öffnen">
      ${gameCoverHTML(g, "lg")}
      <div class="lib-card-body"><strong title="${esc(g.title)}">${esc(g.title)}</strong>
        <span class="muted small">${esc([g.platform, g.genre].filter(Boolean).join(" · ") || "—")}</span>
        <div class="lib-card-row">${statusChip(g)}${g.rating ? libStars(g.rating) : ""}</div>
        <div class="lib-card-row muted small"><span>${g.hours ? `${fmtNum(g.hours, g.hours % 1 ? 1 : 0)} Std.` : g.estHours ? `≈ ${g.estHours} Std.` : ""}</span>${steamBtn(g)}</div></div>
    </article>`).join("")}</div>`;
}
function libListHTML(list){
  return `<div class="table-wrap"><table class="data-table lib-table"><thead><tr><th>Spiel</th><th>Plattform</th><th>Genre</th><th>Status</th><th>Bewertung</th><th class="num">Spielzeit</th><th>Gestartet</th><th>Beendet</th><th></th></tr></thead>
    <tbody>${list.map(g=>`<tr data-id="${g.id}">
      <td><button class="lib-title-btn" data-lib-open="${g.id}">${gameCoverHTML(g, "xs")}<span>${esc(g.title)}</span></button></td>
      <td>${esc(g.platform || "—")}</td><td>${esc(g.genre || "—")}</td>
      <td><select data-lib-status="${g.id}" aria-label="Status von ${esc(g.title)}">${GAME_STATUS.map(([k,l])=>`<option value="${k}" ${g.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td>${g.rating ? libStars(g.rating) : '<span class="muted">–</span>'}</td>
      <td class="num">${g.hours ? fmtNum(g.hours, g.hours % 1 ? 1 : 0) + " Std." : g.estHours ? `<span class="muted">≈ ${g.estHours}</span>` : "–"}</td>
      <td>${g.started ? fmtDate(g.started, {day:"2-digit", month:"2-digit", year:"2-digit"}) : "–"}</td><td>${g.finished ? fmtDate(g.finished, {day:"2-digit", month:"2-digit", year:"2-digit"}) : "–"}</td>
      <td>${steamBtn(g)}</td></tr>`).join("")}</tbody></table></div>`;
}
function libBoardHTML(list){
  return `<div class="lib-board">${GAME_STATUS.map(([k,l],ci)=>{ const col = list.filter(g=>g.status === k);
    return `<section class="lib-col" data-lib-col="${k}" aria-label="${l}"><div class="lib-col-head"><strong>${l}</strong><span class="muted small">${col.length}</span></div>
      <div class="lib-col-body">${col.map(g=>`<article class="lib-mini" draggable="true" data-lib-drag="${g.id}">
          <button class="lib-mini-main" data-lib-open="${g.id}">${gameCoverHTML(g, "xs")}<span>${esc(g.title)}</span></button>
          <span class="lib-mini-move">${ci > 0 ? `<button class="tc-arrow" data-lib-move="${g.id}:-1" aria-label="${esc(g.title)} nach ${GAME_STATUS[ci-1][1]}">←</button>` : ""}${ci < GAME_STATUS.length - 1 ? `<button class="tc-arrow" data-lib-move="${g.id}:1" aria-label="${esc(g.title)} nach ${GAME_STATUS[ci+1][1]}">→</button>` : ""}</span>
        </article>`).join("") || '<p class="lib-col-empty muted small">hierher ziehen</p>'}</div></section>`; }).join("")}</div>`;
}
function setGameStatus(g, status){
  if(!g || g.status === status) return;
  hubUndo(`„${g.title}“: ${GAME_STATUS_LABEL[status]}`, ()=>{
    g.status = status; g.updatedAt = Date.now();
    if(status === "playing" && !g.started) g.started = todayISO();
    if(status === "done" && !g.finished) g.finished = todayISO();
  });
}
function bindBoardDnD(root){
  qsa(".lib-mini", root).forEach(c=>c.addEventListener("dragstart", e=>{ libDrag = c.dataset.libDrag; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", libDrag); }));
  qsa(".lib-mini", root).forEach(c=>c.addEventListener("dragend", ()=>{ libDrag = null; qsa(".lib-col.drop", root).forEach(x=>x.classList.remove("drop")); }));
  qsa(".lib-col", root).forEach(col=>{
    col.addEventListener("dragover", e=>{ if(!libDrag) return; e.preventDefault(); col.classList.add("drop"); });
    col.addEventListener("dragleave", ()=>col.classList.remove("drop"));
    col.addEventListener("drop", e=>{ e.preventDefault(); col.classList.remove("drop"); const g = hub.games.find(x=>x.id === libDrag); libDrag = null; setGameStatus(g, col.dataset.libCol); });
  });
}
function readCoverImage(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>{ const img = new Image(); img.onload = ()=>{ const c = document.createElement("canvas"), k = Math.min(1, 360 / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.85)); };
      img.onerror = ()=>rej(new Error("Bild nicht lesbar")); img.src = fr.result; };
    fr.onerror = ()=>rej(fr.error); fr.readAsDataURL(file);
  });
}
function gameModal(g){
  const isNew = !g; g = g || {title:"", platform:"PC", genre:"", status:"backlog", rating:0, hours:0, estHours:0, started:"", finished:"", tags:[], notes:"", steamId:"", cover:""};
  let cover = g.cover;
  openModal({title: isNew ? "Spiel hinzufügen" : g.title, wide:true, body:`
    <div class="lib-form">
      <div class="lib-form-cover"><div id="libCoverPrev">${gameCoverHTML(Object.assign({}, g, {cover, title:g.title || "?"}), "lg")}</div>
        <label class="btn btn-sm lib-cover-btn">Cover wählen<input type="file" accept="image/*" id="libCoverFile" hidden></label>
        <button class="btn btn-sm btn-ghost" type="button" id="libCoverClear" ${cover ? "" : "disabled"}>Cover entfernen</button></div>
      <div class="lib-form-fields">
        <div class="field"><label>Titel</label><input data-f="title" value="${esc(g.title)}" maxlength="120" placeholder="z. B. Elden Ring" autocomplete="off"></div>
        <div class="field-row"><div class="field"><label>Plattform</label><select data-f="platform">${["", ...GAME_PLATFORMS].map(p=>`<option value="${esc(p)}" ${g.platform === p ? "selected" : ""}>${esc(p || "—")}</option>`).join("")}${g.platform && !GAME_PLATFORMS.includes(g.platform) ? `<option selected>${esc(g.platform)}</option>` : ""}</select></div>
          <div class="field"><label>Genre</label><input data-f="genre" list="libGenres" value="${esc(g.genre)}" maxlength="40"><datalist id="libGenres">${LIB_GENRES.map(x=>`<option value="${x}">`).join("")}</datalist></div>
          <div class="field"><label>Status</label><select data-f="status">${GAME_STATUS.map(([k,l])=>`<option value="${k}" ${g.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
        <div class="field-row"><div class="field"><label>Bewertung</label><select data-f="rating">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${g.rating === n ? "selected" : ""}>${n ? "★".repeat(n) : "keine"}</option>`).join("")}</select></div>
          <div class="field"><label>Spielzeit (Std.)</label><input type="number" min="0" step="0.5" data-f="hours" value="${g.hours || ""}"></div>
          <div class="field"><label>Geschätzte Dauer (Std.)</label><input type="number" min="0" data-f="estHours" value="${g.estHours || ""}" title="Für Backlog-Statistik und „Was spiele ich als Nächstes?“"></div></div>
        <div class="field-row"><div class="field"><label>Gestartet</label><input type="date" data-f="started" value="${g.started}"></div>
          <div class="field"><label>Beendet</label><input type="date" data-f="finished" value="${g.finished}"></div>
          <div class="field"><label>Steam-App-ID (optional)</label><input data-f="steamId" value="${esc(g.steamId)}" inputmode="numeric" placeholder="z. B. 1245620" title="Steht in der Store-Adresse: store.steampowered.com/app/ID/"></div></div>
        <div class="field"><label>Tags (mit Komma getrennt)</label><input data-f="tags" value="${esc(g.tags.join(", "))}" placeholder="${LIB_TAGS.slice(0,5).join(", ")}"></div>
        <div class="field"><label>Notizen</label><textarea data-f="notes" rows="3">${esc(g.notes)}</textarea></div>
      </div></div>`,
    leftButtons: isNew ? "" : `<button class="btn btn-danger-outline" data-lib-del>Löschen</button>`,
    saveLabel: isNew ? "Hinzufügen" : "Speichern",
    onOpen: m=>{
      const prev = ()=>{ qs("#libCoverPrev", m).innerHTML = gameCoverHTML({title:qs('[data-f="title"]', m).value || "?", cover, color:g.color}, "lg"); };
      qs("#libCoverFile", m).onchange = async e=>{ const f = e.target.files[0]; if(!f) return; try{ cover = await readCoverImage(f); qs("#libCoverClear", m).disabled = false; prev(); }catch(err){ toast("Bild konnte nicht gelesen werden."); } };
      qs("#libCoverClear", m).onclick = ()=>{ cover = ""; qs("#libCoverClear", m).disabled = true; prev(); };
      qs('[data-f="title"]', m).addEventListener("input", ()=>{ if(!cover) prev(); });
      const del = qs("[data-lib-del]", m); if(del) del.onclick = ()=>{ closeModal(); hubUndo(`„${g.title}“ gelöscht`, ()=>{ hub.games = hub.games.filter(x=>x.id !== g.id); }); };
      setTimeout(()=>{ const t = qs('[data-f="title"]', m); if(t) t.focus(); }, 30);   // the dialog may already be closed
    },
    onSave: get=>{
      const title = get("title").trim(); if(!title){ toast("Bitte einen Titel eingeben."); return false; }
      const dupe = hub.games.find(x=>x.id !== g.id && x.title.toLowerCase() === title.toLowerCase());
      if(dupe && isNew){ toast(`„${title}“ ist schon in der Bibliothek.`); return false; }
      const data = {title, platform:get("platform"), genre:get("genre").trim(), status:get("status"), rating:num(get("rating")), hours:num(get("hours")), estHours:num(get("estHours")),
        started:get("started"), finished:get("finished"), steamId:get("steamId"), tags:get("tags").split(",").map(t=>t.trim()).filter(Boolean), notes:get("notes"), cover, sample:false, updatedAt:Date.now()};
      if(data.status === "playing" && !data.started) data.started = todayISO();
      if(data.status === "done" && !data.finished) data.finished = todayISO();
      hubUndo(isNew ? `„${title}“ hinzugefügt` : `„${title}“ gespeichert`, ()=>{
        if(isNew) hub.games.push(Object.assign({id:uid(), createdAt:Date.now()}, data)); else Object.assign(hub.games.find(x=>x.id === g.id), data);
      });
    }});
}
function libImportModal(){
  openModal({title:"Spiele einfügen", wide:true, body:`
    <p class="lead" style="margin-top:0">Ein Spiel pro Zeile. Optional mit Semikolon getrennt: <code>Titel; Plattform; Status</code> – z. B. <code>Elden Ring; PC; durchgespielt</code>.</p>
    <textarea id="libImpText" rows="10" style="width:100%" placeholder="Baldur's Gate 3; PC&#10;Hades II; Nintendo Switch; spiele ich&#10;Stardew Valley"></textarea>
    <p class="hint">Status-Wörter: wunschliste, backlog, spiele ich, durchgespielt, abgebrochen. Ohne Angabe: Backlog. Doppelte Titel werden übersprungen.</p>`,
    saveLabel:"Einfügen",
    onSave: ()=>{
      // order matters: "durchgespielt" contains "spiel" → the clearer words are checked first
      const words = {durch:"done", fertig:"done", beendet:"done", abgebrochen:"dropped", abbruch:"dropped", wunsch:"wish", backlog:"backlog", aktuell:"playing", spiele:"playing", spiel:"playing"};
      const have = new Set(hub.games.map(g=>g.title.toLowerCase())), add = [], skipped = [];
      qs("#libImpText").value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach(line=>{
        const [title, platform, st] = line.split(/\s*[;\t]\s*/);
        if(!title) return;
        if(have.has(title.toLowerCase())){ skipped.push(title); return; }
        have.add(title.toLowerCase());
        const key = Object.keys(words).find(w=>(st || "").toLowerCase().includes(w));
        add.push({id:uid(), title, platform: platform || "", status: key ? words[key] : "backlog", createdAt:Date.now(), updatedAt:Date.now()});
      });
      if(!add.length){ toast(skipped.length ? "Alle Titel sind schon in der Bibliothek." : "Keine Titel gefunden."); return false; }
      hubUndo(`${add.length} Spiel${add.length === 1 ? "" : "e"} eingefügt${skipped.length ? ` · ${skipped.length} doppelt übersprungen` : ""}`, ()=>{ hub.games.push(...add); });
    }});
}
/** "What do I play next?" – random pick from the backlog, filtered by time, platform and mood */
function libPickNext(){
  const platforms = [...new Set(hub.games.filter(g=>g.status === "backlog").map(g=>g.platform).filter(Boolean))].sort();
  const tags = [...new Set(hub.games.filter(g=>g.status === "backlog").flatMap(g=>g.tags))].sort();
  let lastId = "";
  const pick = (m)=>{
    const time = qs('[data-f="time"]', m).value, pf = qs('[data-f="platform"]', m).value, tag = qs('[data-f="tag"]', m).value;
    const fits = g => g.status === "backlog" && (!pf || g.platform === pf) && (!tag || g.tags.includes(tag))
      && (time === "any" || !g.estHours || (time === "short" ? g.estHours <= 15 : time === "mid" ? g.estHours > 15 && g.estHours <= 50 : g.estHours > 50));
    let pool = hub.games.filter(fits); if(pool.length > 1) pool = pool.filter(g=>g.id !== lastId);
    const box = qs("#libPick", m);
    if(!pool.length){ box.innerHTML = `<p class="empty">Nichts im Backlog passt – Filter lockern?</p>`; return; }
    const g = pool[Math.floor(Math.random() * pool.length)]; lastId = g.id;
    box.innerHTML = `<div class="lib-pick">${gameCoverHTML(g, "lg")}<div><strong>${esc(g.title)}</strong><span class="muted small">${esc([g.platform, g.genre].filter(Boolean).join(" · "))}${g.estHours ? ` · ≈ ${g.estHours} Std.` : ""}</span>
      <div class="lib-card-row">${g.tags.map(t=>`<span class="sm-badge">${esc(t)}</span>`).join("")}</div>
      <div class="lib-card-row"><button class="btn btn-sm btn-accent" data-pick-play="${g.id}">Jetzt spielen</button><button class="btn btn-sm" data-pick-again>🎲 Anderer Vorschlag</button>${steamBtn(g)}</div></div></div>`;
  };
  openModal({title:"Was spiele ich als Nächstes?", body:`
    <div class="field-row"><div class="field"><label>Zeit</label><select data-f="time"><option value="any">egal</option><option value="short">kurz (bis 15 Std.)</option><option value="mid">mittel (15–50 Std.)</option><option value="long">lang (über 50 Std.)</option></select></div>
      <div class="field"><label>Plattform</label><select data-f="platform"><option value="">alle</option>${platforms.map(p=>`<option>${esc(p)}</option>`).join("")}</select></div>
      <div class="field"><label>Stimmung / Tag</label><select data-f="tag"><option value="">egal</option>${tags.map(t=>`<option>${esc(t)}</option>`).join("")}</select></div></div>
    <div id="libPick"></div>`, saveLabel:"Schließen",
    onOpen: m=>{
      m.addEventListener("change", ()=>pick(m));
      m.addEventListener("click", e=>{
        if(e.target.closest("[data-pick-again]")) return pick(m);
        const p = e.target.closest("[data-pick-play]"); if(p){ closeModal(); setGameStatus(hub.games.find(g=>g.id === p.dataset.pickPlay), "playing"); }
      });
      pick(m);
    }});
}
function libraryClick(e){
  const t = e.target;
  if(t.closest(".lib-play")) return;                                  // the steam:// link handles itself
  const v = t.closest("[data-lib-view]"); if(v){ hub.libView = v.dataset.libView; saveHub(); renderHub(); return; }
  const mv = t.closest("[data-lib-move]"); if(mv){ const [id, dir] = mv.dataset.libMove.split(":"), g = hub.games.find(x=>x.id === id);
    const i = GAME_STATUS.findIndex(s=>s[0] === g.status) + num(dir); if(i >= 0 && i < GAME_STATUS.length) setGameStatus(g, GAME_STATUS[i][0]); return; }
  const op = t.closest("[data-lib-open]"); if(op){ gameModal(hub.games.find(g=>g.id === op.dataset.libOpen)); return; }
  const a = t.closest("[data-lib]"); if(!a) return;
  const k = a.dataset.lib;
  if(k === "new") gameModal(null);
  else if(k === "import") libImportModal();
  else if(k === "next") libPickNext();
  else if(k === "samples") hubUndo("Beispielspiele geladen – zum Ausprobieren", ()=>{ hub.games.push(...libSample()); });
  else if(k === "clearSamples") hubUndo("Beispielspiele entfernt", ()=>{ hub.games = hub.games.filter(g=>!g.sample); });
}
document.addEventListener("change", e=>{
  const s = e.target.closest && e.target.closest("[data-lib-status]"); if(!s) return;
  setGameStatus(hub.games.find(g=>g.id === s.dataset.libStatus), s.value);
});
/** keys inside the hub (returns true when handled) */
function hubKey(e){
  if(isTyping(e.target)){ if(e.key === "Escape" && e.target.id === "libSearch"){ e.target.blur(); return true; } return false; }
  if(e.ctrlKey || e.metaKey || e.altKey) return false;
  if(e.key === "Escape" && hubView === "library"){ e.preventDefault(); showHub("home"); return true; }
  if(hubView === "library" && e.key === "/"){ e.preventDefault(); const s = qs("#libSearch"); if(s) s.focus(); return true; }
  if(hubView === "library" && e.key.toLowerCase() === "n"){ e.preventDefault(); gameModal(null); return true; }
  if(e.key.toLowerCase() === "h" && hubView === "library"){ e.preventDefault(); showHub("home"); return true; }
  return false;
}

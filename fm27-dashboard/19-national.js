/* ==========================================================================
   NATIONALTEAM-MODUS (10.0) – a save is either a club or a national team.
   Same table/import engine; own look (flag colours, emblem), own header and portal cards.
   A national save can be LINKED to a club save (coach both at once) – switch with one click.
   ========================================================================== */
const NAT_PRESETS = [
  {id:"ger", name:"Deutschland", code:"GER", colors:["#000000","#DD0000","#FFCE00"], accent:"#FFCE00"},
  {id:"aut", name:"Österreich", code:"AUT", colors:["#ED2939","#FFFFFF","#ED2939"], accent:"#ED2939"},
  {id:"sui", name:"Schweiz", code:"SUI", colors:["#DA291C","#FFFFFF","#DA291C"], accent:"#DA291C"},
  {id:"eng", name:"England", code:"ENG", colors:["#FFFFFF","#CE1124","#FFFFFF"], accent:"#CE1124"},
  {id:"fra", name:"Frankreich", code:"FRA", colors:["#002395","#FFFFFF","#ED2939"], accent:"#3D6DFF"},
  {id:"esp", name:"Spanien", code:"ESP", colors:["#AA151B","#F1BF00","#AA151B"], accent:"#F1BF00"},
  {id:"ita", name:"Italien", code:"ITA", colors:["#009246","#FFFFFF","#CE2B37"], accent:"#2F7DE1"},
  {id:"ned", name:"Niederlande", code:"NED", colors:["#AE1C28","#FFFFFF","#21468B"], accent:"#FF7F00"},
  {id:"por", name:"Portugal", code:"POR", colors:["#006600","#FF0000","#FF0000"], accent:"#E42518"},
  {id:"bel", name:"Belgien", code:"BEL", colors:["#000000","#FDDA24","#EF3340"], accent:"#EF3340"},
  {id:"cro", name:"Kroatien", code:"CRO", colors:["#FF0000","#FFFFFF","#171796"], accent:"#E30A17"},
  {id:"pol", name:"Polen", code:"POL", colors:["#FFFFFF","#DC143C","#DC143C"], accent:"#DC143C"},
  {id:"bra", name:"Brasilien", code:"BRA", colors:["#009C3B","#FFDF00","#002776"], accent:"#FFDF00"},
  {id:"arg", name:"Argentinien", code:"ARG", colors:["#74ACDF","#FFFFFF","#74ACDF"], accent:"#74ACDF"},
  {id:"usa", name:"USA", code:"USA", colors:["#B22234","#FFFFFF","#3C3B6E"], accent:"#3C6FD1"},
  {id:"jpn", name:"Japan", code:"JPN", colors:["#FFFFFF","#BC002D","#FFFFFF"], accent:"#1D3F9A"},
  {id:"goldnavy", name:"Gold / Navy", code:"NAT", colors:["#0B1F44","#C9A227","#0B1F44"], accent:"#C9A227"}
];
const HEX = /^#[0-9a-fA-F]{6}$/;
function sanitizeNational(raw){
  const r = raw && typeof raw === "object" ? raw : {};
  const colors = (Array.isArray(r.colors) ? r.colors : []).filter(c=>HEX.test(c)).slice(0,3);
  while(colors.length < 3) colors.push(["#0B1F44","#C9A227","#0B1F44"][colors.length]);
  const img = typeof r.crestImg === "string" && r.crestImg.startsWith("data:image/") && r.crestImg.length < 250000 ? r.crestImg : "";
  return {country: typeof r.country === "string" ? r.country.slice(0,40) : "", code: (typeof r.code === "string" ? r.code : "").toUpperCase().replace(/[^A-Z]/g,"").slice(0,3),
    colors, accent: HEX.test(r.accent) ? r.accent : colors[1], crestImg: img,
    maxSquad: clamp(Math.round(num(r.maxSquad, 26)), 11, 60), minGK: clamp(Math.round(num(r.minGK, 3)), 0, 5),
    benchNominated: r.benchNominated !== false,
    // 10.3: saved nominations ("Lehrgänge")
    camps: (Array.isArray(r.camps) ? r.camps : []).filter(c=>c && typeof c === "object").map(c=>({id: typeof c.id === "string" && c.id ? c.id : Math.random().toString(36).slice(2,10),
      name: String(c.name || "Lehrgang").slice(0,60), date: typeof c.date === "string" ? c.date : "", ids: (Array.isArray(c.ids) ? c.ids : []).filter(x=>typeof x === "string").slice(0,80)})).slice(-60)};
}
const isNat = () => !!(state && state.mode === "national");
const NAT_HIDDEN_VIEWS = ["recruitment","finance","development"];
const nominated = () => state.players.filter(p=>p.nominated);
const natRecord = () => { const r = state.results; const w = r.filter(x=>x.gf > x.ga).length, d = r.filter(x=>x.gf === x.ga).length; return {w, d, l:r.length - w - d, gf:r.reduce((a,x)=>a+x.gf,0), ga:r.reduce((a,x)=>a+x.ga,0), n:r.length}; };
const NAT_GROUPS = [["Tor",["TW"]],["Abwehr",["IV","LV","RV"]],["Mittelfeld",["DM","ZM","OM"]],["Angriff",["LF","RF","ST"]]];

/** Header, colours, emblem and the link switch – called from renderHeader. */
function applyModeLook(){
  const nat = isNat();
  document.body.classList.toggle("mode-national", nat);
  const crest = qs("#crestBox");
  const link = state.link && slotIndex.slots.find(x=>x.id === state.link);
  const ls = qs("#btnLinkSwitch");
  if(ls){ ls.hidden = !link; if(link){ const other = readJSON(SLOT_PREFIX + link.id) || {}; ls.textContent = `⇄ ${other.mode === "national" ? "Nationalteam" : "Verein"}: ${link.name}`; ls.title = "Zum verknüpften Spielstand wechseln – das Spieldatum wird mitgenommen"; } }
  if(!nat){ crest.style.background = ""; crest.style.backgroundImage = ""; crest.classList.remove("nat-crest"); document.documentElement.style.removeProperty("--nat-stripe"); return; }
  const n = state.national, [c1, c2, c3] = n.colors;
  document.documentElement.style.setProperty("--nat-stripe", `linear-gradient(90deg, ${c1} 0 33.3%, ${c2} 33.3% 66.6%, ${c3} 66.6%)`);
  crest.classList.add("nat-crest");
  crest.style.background = n.crestImg ? `center / cover no-repeat url("${n.crestImg}")` : `linear-gradient(180deg, ${c1} 0 33.3%, ${c2} 33.3% 66.6%, ${c3} 66.6%)`;
  qs("#crestInitials").textContent = n.crestImg ? "" : (n.code || state.club.crest);
  setAccentVars(n.accent);
  const rec = natRecord(), nom = nominated().length, max = n.maxSquad;
  qs("#natRecordChip").textContent = `${rec.w}-${rec.d}-${rec.l}`;
  const nv = qs("#natNomValue"); nv.textContent = `${nom} / ${max}`;
  nv.classList.toggle("neg", nom > max); nv.classList.toggle("pos", nom === max);
}
/** Portal cards of the national team. */
function renderHomeNational(){
  if(!isNat()) return;
  const n = state.national, nom = nominated(), max = n.maxSquad, pct = clamp(Math.round(nom.length / max * 100), 0, 100);
  const warn = [];
  const gk = nom.filter(p=>p.pos === "TW").length;
  if(nom.length && gk < n.minGK) warn.push(`nur ${gk} Torhüter nominiert (mind. ${n.minGK})`);
  if(nom.length > max) warn.push(`${nom.length - max} zu viel – Obergrenze ${max}`);
  nom.filter(p=>UNAVAILABLE.includes(p.status)).forEach(p=>warn.push(`${p.name} ist ${STATUS[p.status] || "nicht verfügbar"}`));
  qs("#natNomBox").innerHTML = `<div class="nat-nom">
    <div class="nat-nom-big ${nom.length > max ? "neg" : nom.length === max ? "pos" : ""}"><strong>${nom.length}</strong><span>von ${max} nominiert</span></div>
    <div class="nat-nom-main"><div class="tc-bar"><i style="width:${pct}%" class="${nom.length > max ? "over" : ""}"></i></div>
      <div class="nat-groups">${NAT_GROUPS.map(([label, pos])=>{ const k = nom.filter(p=>pos.includes(p.pos)).length, pool = state.players.filter(p=>pos.includes(p.pos)).length;
        return `<div><span>${label}</span><strong>${k}</strong><em>Pool ${pool}</em></div>`; }).join("")}</div>
      ${warn.length ? `<ul class="nat-warn">${warn.slice(0,5).map(w=>`<li>⚠ ${esc(w)}</li>`).join("")}</ul>` : nom.length ? `<div class="future-ok">✓ Kader passt</div>` : `<p class="empty small">Noch niemand nominiert – im Pool die Spalte „Nominiert“ anhaken.</p>`}
      <div class="nat-tools"><button class="btn btn-sm" data-nat="saveCamp" ${nom.length ? "" : "disabled"}>Als Lehrgang speichern</button><button class="btn btn-sm" data-nat="copy" ${nom.length ? "" : "disabled"}>Kader kopieren</button><button class="btn btn-sm btn-ghost" data-nat="reset" ${nom.length ? "" : "disabled"}>Nominierung zurücksetzen</button></div>
    </div></div>
    ${n.camps.length ? `<div class="nat-camps"><div class="tc-sub-head">Gespeicherte Lehrgänge</div>${n.camps.slice().reverse().slice(0,6).map(c=>`<div class="nat-camp"><span class="grow"><strong>${esc(c.name)}</strong> <span class="muted small">${c.ids.length} Spieler${c.date ? " · " + fmtDate(c.date, {day:"2-digit", month:"2-digit", year:"numeric"}) : ""}</span></span>
      <button class="btn btn-sm" data-nat="load:${c.id}">Laden</button><button class="tc-arrow" data-nat="del:${c.id}" aria-label="${esc(c.name)} löschen">✕</button></div>`).join("")}</div>` : ""}`;
  const top = (key, label) => { const list = state.players.filter(p=>p[key] > 0).sort((a,b)=>b[key]-a[key]).slice(0,5);
    return `<div class="nat-top"><div class="tc-sub-head">${label}</div>${list.length ? list.map(p=>`<div class="nat-top-row">${plink(p.id, p.name)}<strong>${p[key]}</strong></div>`).join("") : '<p class="empty small">Keine Daten – per Import oder im Pool eintragen.</p>'}</div>`; };
  qs("#natRecordsBox").innerHTML = top("caps", "Meiste Länderspiele") + top("intGoals", "Meiste Länderspieltore");
  const clubs = {}; nom.forEach(p=>{ const c = p.homeClub || "ohne Angabe"; clubs[c] = (clubs[c] || 0) + 1; });
  const cl = Object.entries(clubs).sort((a,b)=>b[1]-a[1]);
  qs("#natClubsBox").innerHTML = cl.length ? `<div class="nat-clubs">${cl.slice(0,10).map(([c,k])=>`<div class="nat-club"><span>${esc(c)}</span><i style="width:${Math.round(k / cl[0][1] * 100)}%"></i><strong>${k}</strong></div>`).join("")}</div>`
    : `<p class="empty small">Sobald Spieler nominiert sind, siehst du hier, aus welchen Vereinen sie kommen.</p>`;
}
/* ---------- 10.3: national-team care ---------- */
const campCount = id => state.national.camps.filter(c=>c.ids.includes(id)).length;
function natSaveCamp(){
  const nom = nominated(); if(!nom.length){ toast("Noch niemand nominiert."); return; }
  const d = ingameDate(), month = d.toLocaleDateString("de-DE", {month:"long", year:"numeric"});
  openModal({title:"Nominierung als Lehrgang speichern", body:`<div class="field"><label>Name</label><input data-f="name" value="${esc(month.charAt(0).toUpperCase() + month.slice(1) + " – Lehrgang")}" maxlength="60"></div>
    <p class="hint">${nom.length} Nominierte werden gespeichert. Später lässt sich der Lehrgang wieder laden – und du siehst pro Spieler, wie oft er dabei war.</p>`, saveLabel:"Speichern",
    onSave: get=>{ const before = JSON.stringify(state);
      state.national.camps.push({id:uid(), name:get("name").trim() || "Lehrgang", date:state.club.ingameDate, ids:nom.map(p=>p.id)});
      saveState(); renderAll(); toast("Lehrgang gespeichert", {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); }}); }});
}
function natLoadCamp(id){
  const c = state.national.camps.find(x=>x.id === id); if(!c) return;
  const before = JSON.stringify(state), missing = c.ids.filter(pid=>!playerById(pid)).length;
  state.players.forEach(p=>{ p.nominated = c.ids.includes(p.id); });
  saveState(); renderAll();
  toast(`„${c.name}“ geladen${missing ? ` – ${missing} Spieler nicht mehr im Pool` : ""}`, {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); }});
}
function natDeleteCamp(id){
  const before = JSON.stringify(state), c = state.national.camps.find(x=>x.id === id); if(!c) return;
  state.national.camps = state.national.camps.filter(x=>x.id !== id);
  saveState(); renderAll(); toast(`„${c.name}“ gelöscht`, {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); }});
}
function natResetNominations(){
  const n = nominated().length; if(!n){ toast("Es ist niemand nominiert."); return; }
  const before = JSON.stringify(state);
  state.players.forEach(p=>{ p.nominated = false; });
  saveState(); renderAll(); toast(`${n} Nominierungen zurückgesetzt`, {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); }});
}
/** The squad as text, grouped by team part – e.g. to share it. */
function natSquadText(){
  const nom = nominated();
  const lines = NAT_GROUPS.map(([label, pos])=>{ const list = nom.filter(p=>pos.includes(p.pos)).sort((a,b)=>POS_LIST.indexOf(a.pos) - POS_LIST.indexOf(b.pos) || a.name.localeCompare(b.name, "de"));
    return list.length ? `${label}: ${list.map(p=>p.name + (p.homeClub ? ` (${p.homeClub})` : "")).join(", ")}` : ""; }).filter(Boolean);
  return `${state.club.name} – Kader (${nom.length})\n` + lines.join("\n");
}
async function natCopySquad(){
  const text = natSquadText();
  try{ await navigator.clipboard.writeText(text); toast("Kader kopiert"); }
  catch(e){ openModal({title:"Kader als Text", body:`<textarea rows="10" readonly style="width:100%">${esc(text)}</textarea>`, saveLabel:"Schließen"}); }
  return text;
}
/** Switch to the linked save – the in-game date travels along (in FM it is ONE save). */
function switchLinked(){
  const target = state.link; if(!target || !slotIndex.slots.some(x=>x.id === target)) return;
  const date = state.club.ingameDate;
  switchSlot(target);
  if(date > state.club.ingameDate) applyDateChange(date);
  else toast(`Gewechselt: ${(activeSlotMeta() || {}).name || state.club.name}`);
}
function setLink(partnerId){
  const me = slotIndex.active;
  // unlink the old partner (if it pointed to us)
  if(state.link && state.link !== partnerId){ const old = readJSON(SLOT_PREFIX + state.link); if(old && old.link === me){ old.link = ""; store.setItem(SLOT_PREFIX + state.link, JSON.stringify(old)); } }
  state.link = partnerId || "";
  if(partnerId){ const other = readJSON(SLOT_PREFIX + partnerId); if(other){ other.link = me; store.setItem(SLOT_PREFIX + partnerId, JSON.stringify(other)); } }
}
/** Emblem image: scaled down to 96 px so a save stays small. */
function readCrestImage(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>{ const img = new Image(); img.onload = ()=>{ const c = document.createElement("canvas"), k = Math.min(1, 96 / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/png")); };
      img.onerror = ()=>rej(new Error("Bild nicht lesbar")); img.src = fr.result; };
    fr.onerror = ()=>rej(fr.error); fr.readAsDataURL(file);
  });
}
function openNationalModal(first){
  const n = state.national;
  const clubSaves = slotIndex.slots.filter(x=>x.id !== slotIndex.active && (readJSON(SLOT_PREFIX + x.id) || {}).mode !== "national");
  let crestImg = n.crestImg;
  openModal({title: first ? "Nationalteam einrichten" : "Nationalteam-Einstellungen", wide:true,
    body:`<div class="field-row"><div class="field"><label>Vorlage (Land / Farben)</label><select data-f="preset"><option value="">— eigene Farben —</option>${NAT_PRESETS.map(pr=>`<option value="${pr.id}">${esc(pr.name)}</option>`).join("")}</select></div>
        <div class="field" style="flex:2"><label>Name</label><input data-f="country" value="${esc(n.country || state.club.name)}" placeholder="z. B. Deutschland"></div>
        <div class="field"><label>Kürzel</label><input data-f="code" maxlength="3" value="${esc(n.code)}" placeholder="GER"></div></div>
      <div class="field-row nat-colors">${[0,1,2].map(i=>`<div class="field"><label>Farbe ${i+1}</label><input type="color" data-f="c${i}" value="${n.colors[i]}"></div>`).join("")}
        <div class="field"><label>Akzentfarbe</label><input type="color" data-f="accent" value="${n.accent}"></div>
        <div class="field"><label>Vorschau</label><div class="nat-preview" id="natPreview"></div></div></div>
      <div class="field-row"><div class="field" style="flex:2"><label>Eigenes Emblem (optional, Bilddatei)</label><input type="file" accept="image/*" id="natCrestFile"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-sm" type="button" id="natCrestClear" ${crestImg ? "" : "disabled"}>Emblem entfernen</button></div></div>
      <div class="field-row"><div class="field"><label>Kadergröße (Obergrenze)</label><input type="number" data-f="maxSquad" min="11" max="60" value="${n.maxSquad}"></div>
        <div class="field"><label>Mindestens Torhüter</label><input type="number" data-f="minGK" min="0" max="5" value="${n.minGK}"></div>
        <div class="field" style="flex:2"><label>Mit Vereins-Spielstand verknüpfen (gleichzeitig trainieren)</label><select data-f="link"><option value="">— keine Verknüpfung —</option>${clubSaves.map(x=>`<option value="${x.id}" ${state.link === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div></div>
      <label class="check-label"><input type="checkbox" data-f="benchNominated" ${n.benchNominated ? "checked" : ""}> Taktik: nur nominierte Spieler zur Auswahl (sobald jemand nominiert ist)</label>
      <p class="hint">Offizielle Verbandswappen sind geschützte Marken und daher nicht enthalten – das Emblem wird aus deinen Farben erzeugt, oder du lädst ein eigenes Bild hoch.</p>`,
    saveLabel: first ? "Los geht's" : "Speichern",
    onOpen: m=>{
      const f = k => qs(`[data-f="${k}"]`, m);
      const prev = ()=>{ const c = [0,1,2].map(i=>f("c"+i).value); qs("#natPreview", m).style.background = crestImg ? `center / cover no-repeat url("${crestImg}")` : `linear-gradient(180deg, ${c[0]} 0 33.3%, ${c[1]} 33.3% 66.6%, ${c[2]} 66.6%)`;
        qs("#natPreview", m).textContent = crestImg ? "" : (f("code").value.toUpperCase() || "NAT"); };
      f("preset").onchange = ()=>{ const pr = NAT_PRESETS.find(x=>x.id === f("preset").value); if(!pr) return;
        pr.colors.forEach((c,i)=>{ f("c"+i).value = c.toLowerCase(); }); f("accent").value = pr.accent.toLowerCase(); f("code").value = pr.code; if(pr.id !== "goldnavy") f("country").value = pr.name; prev(); };
      m.addEventListener("input", prev);
      qs("#natCrestFile", m).onchange = async e=>{ const file = e.target.files[0]; if(!file) return;
        try{ crestImg = await readCrestImage(file); qs("#natCrestClear", m).disabled = false; prev(); }catch(err){ toast("Bild konnte nicht gelesen werden."); } };
      qs("#natCrestClear", m).onclick = ()=>{ crestImg = ""; qs("#natCrestClear", m).disabled = true; prev(); };
      prev();
    },
    onSave: get=>{
      const before = JSON.stringify(state);
      state.national = sanitizeNational({country:get("country").trim(), code:get("code"), colors:[get("c0"), get("c1"), get("c2")], accent:get("accent"), crestImg,
        maxSquad:get("maxSquad"), minGK:get("minGK"), benchNominated:get("benchNominated"), camps:state.national.camps});
      if(state.national.country) state.club.name = state.national.country;
      if(state.national.code) state.club.crest = state.national.code;
      setLink(get("link"));
      saveState(); renderAll();
      toast(first ? "Nationalteam eingerichtet – jetzt den Pool per „Import aus FM“ füllen" : "Gespeichert", {onUndo:()=>{ state = JSON.parse(before); saveState(); renderAll(); }});
    }});
}

/* ---------- release hardening (10.0): error log ---------- */
function errorLogHTML(){
  const list = (readJSON(ERROR_KEY) || []).slice().reverse();
  return `<div class="card err-card"><div class="card-head"><h2>Fehlerprotokoll</h2><span class="muted small">${list.length ? list.length + " Einträge" : ""}</span></div>
    ${list.length ? `<ul class="err-list">${list.slice(0,15).map(e=>`<li><span class="muted small">${esc(new Date(e.ts).toLocaleString("de-DE"))} · v${esc(e.v)}${e.view ? " · " + esc(e.view) : ""}</span><strong>${esc(e.msg)}</strong>${e.detail ? `<code>${esc(e.detail)}</code>` : ""}</li>`).join("")}</ul>
      <div class="err-actions"><button class="btn btn-sm" data-err="copy">Bericht kopieren</button><button class="btn btn-sm btn-danger-outline" data-err="clear">Protokoll leeren</button></div>
      <p class="hint">Den kopierten Bericht kannst du beim Melden eines Fehlers mitschicken – er enthält keine Spielstand-Daten.</p>`
      : `<div class="future-ok">✓ Keine unerwarteten Fehler aufgezeichnet.</div>`}</div>`;
}
const ERROR_KEY = "fm27_errors";
let _lastErrToast = 0;
function logError(msg, detail){
  try{
    const list = readJSON(ERROR_KEY) || [];
    list.push({ts:Date.now(), v:APP_VERSION, view:typeof currentView === "string" ? currentView : "", msg:String(msg).slice(0,300), detail:String(detail || "").split("\n").slice(0,4).join(" | ").slice(0,500)});
    store.setItem(ERROR_KEY, JSON.stringify(list.slice(-40)));
  }catch(e){}
  if(Date.now() - _lastErrToast > 15000 && typeof toast === "function"){
    _lastErrToast = Date.now();
    try{ toast("Unerwarteter Fehler – deine Daten sind gespeichert. Details: Admin → Datenprüfung.", {duration:7000}); }catch(e){}
  }
}
window.addEventListener("error", e=>logError(e.message || "Fehler", e.error && e.error.stack));
window.addEventListener("unhandledrejection", e=>logError((e.reason && (e.reason.message || e.reason)) || "Promise-Fehler", e.reason && e.reason.stack));



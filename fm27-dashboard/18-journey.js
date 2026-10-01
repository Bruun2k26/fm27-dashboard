/* ==========================================================================
   JOURNEY (9.0) – role-play companion for a journey save (starting unemployed).
   Stored ACROSS saves (own key): every new club becomes its own save, linked to a station.
   ========================================================================== */
const JOURNEY_KEY = "fm27_journey";
const J_LICENSES = ["Keine Lizenz","Amateur-Lizenz","Nationale C-Lizenz","Nationale B-Lizenz","Nationale A-Lizenz","Kontinentale C-Lizenz","Kontinentale B-Lizenz","Kontinentale A-Lizenz","Kontinentale Pro-Lizenz"];
const J_APP_STAGES = [["interest","Interesse"],["applied","Beworben"],["interview","Gespräch"],["offer","Angebot"]];
const J_GOAL_CATS = {house:"🏠 Haus", car:"🚗 Auto", boat:"⛵ Boot", watch:"⌚ Luxus", travel:"✈ Reise", other:"💎 Sonstiges"};
const J_MOODS = {great:"😄", good:"🙂", neutral:"😐", bad:"😟", awful:"😠"};
/* 9.9.1: the journey belongs to ONE save (state.journey). "journey" always points to the journey of the
   active save – switching, duplicating, exporting, restore points and undo all carry it automatically. */
Object.defineProperty(globalThis, "journey", {configurable:true,
  get(){ return state ? state.journey : null; },
  set(v){ if(state) state.journey = v; }});
function defaultJourney(){
  return {version:1, active:false, startDate:"", lastDate:"",
    profile:{name:"", age:35, nation:"", background:"", philosophy:"", start:"none", reputation:1, licenseIdx:0},
    licenseLevels:J_LICENSES.slice(), courses:[], applications:[], stations:[], milestones:[], trophies:[],
    bank:{giro:0, savings:0}, orders:[], tx:[], goals:[], diary:[], rules:[]};
}
function sanitizeJourney(raw){
  const r = raw && typeof raw === "object" ? raw : {}, d = defaultJourney(), A = x => Array.isArray(x) ? x : [];
  // (the helper "str" only exists inside sanitizeState → own converter here)
  const iso = x => typeof x === "string" && parseISO(x) ? x : "", S = x => typeof x === "string" ? x : (x == null ? "" : String(x)), N = (x, f=0) => num(x, f);
  const levels = A(r.licenseLevels).map(S).map(x=>x.trim().slice(0,40)).filter(Boolean);
  const j = {version:1, active:!!r.active, startDate:iso(r.startDate), lastDate:iso(r.lastDate),
    profile:Object.assign({}, d.profile, r.profile && typeof r.profile === "object" ? {
      name:S(r.profile.name).slice(0,60), age:clamp(Math.round(N(r.profile.age,35)),16,90), nation:S(r.profile.nation).slice(0,40),
      background:S(r.profile.background).slice(0,300), philosophy:S(r.profile.philosophy).slice(0,300),
      start:r.profile.start === "amateur" ? "amateur" : "none", reputation:clamp(Math.round(N(r.profile.reputation,1)),1,5),
      licenseIdx:Math.max(0, Math.round(N(r.profile.licenseIdx,0)))} : {}),
    licenseLevels: levels.length >= 2 ? levels : d.licenseLevels,
    courses:A(r.courses).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), targetIdx:Math.max(0,Math.round(N(o.targetIdx,1))), start:iso(o.start), months:clamp(Math.round(N(o.months,6)),1,60), cost:Math.max(0,N(o.cost)), done:!!o.done})),
    applications:A(r.applications).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), club:S(o.club).slice(0,60)||"Verein", league:S(o.league).slice(0,60), country:S(o.country).slice(0,40), date:iso(o.date),
      status:[...J_APP_STAGES.map(x=>x[0]),"rejected"].includes(o.status) ? o.status : "interest", note:S(o.note).slice(0,500)})),
    stations:A(r.stations).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), club:S(o.club).slice(0,60)||"Verein", league:S(o.league).slice(0,60), country:S(o.country).slice(0,40),
      role:S(o.role).slice(0,40)||"Cheftrainer", from:iso(o.from), to:iso(o.to), reason:S(o.reason).slice(0,60), salary:Math.max(0,N(o.salary)), slotId:S(o.slotId), orderId:S(o.orderId), achievements:S(o.achievements).slice(0,500)})),
    milestones:A(r.milestones).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), text:S(o.text).slice(0,120)||"Ziel", done:!!o.done, date:iso(o.date)})),
    trophies:A(r.trophies).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), title:S(o.title).slice(0,80)||"Titel", season:S(o.season).slice(0,20), club:S(o.club).slice(0,60)})),
    bank:{giro:N(r.bank && r.bank.giro), savings:Math.max(0, N(r.bank && r.bank.savings))},
    goals:A(r.goals).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), name:S(o.name).slice(0,60)||"Sparziel", cat:J_GOAL_CATS[o.cat] ? o.cat : "other",
      target:Math.max(0,N(o.target)), saved:Math.max(0,N(o.saved)), status:o.status === "bought" ? "bought" : "saving", boughtAt:iso(o.boughtAt)})),
    orders:[], tx:[], diary:[], rules:[]};
  const goalIds = new Set(j.goals.map(g=>g.id));
  j.orders = A(r.orders).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), name:S(o.name).slice(0,60)||"Dauerauftrag", amount:Math.max(0,N(o.amount)),
    type:["income","expense","save"].includes(o.type) ? o.type : "expense", target:goalIds.has(o.target) ? o.target : "", freq:o.freq === "weekly" ? "weekly" : "monthly",
    day:clamp(Math.round(N(o.day,1)),1,31), start:iso(o.start), active:o.active !== false}));
  j.tx = A(r.tx).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), date:iso(o.date), amount:N(o.amount), from:S(o.from), to:S(o.to), text:S(o.text).slice(0,120)})).slice(-300);
  j.diary = A(r.diary).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), date:iso(o.date), mood:J_MOODS[o.mood] ? o.mood : "neutral", title:S(o.title).slice(0,100), text:S(o.text).slice(0,4000)}));
  j.rules = A(r.rules).filter(o=>o && typeof o === "object").map(o=>({id:S(o.id)||uid(), text:S(o.text).slice(0,200)||"Regel", broken:!!o.broken}));
  j.profile.licenseIdx = clamp(j.profile.licenseIdx, 0, j.licenseLevels.length - 1);
  j.courses.forEach(c=>{ c.targetIdx = clamp(c.targetIdx, 0, j.licenseLevels.length - 1); });
  // money earmarked for goals always sits in the savings account
  const earmarked = j.goals.filter(g=>g.status === "saving").reduce((a,g)=>a+g.saved, 0);
  if(j.bank.savings < earmarked) j.bank.savings = earmarked;
  return j;
}
function loadJourney(){ if(state) state.journey = sanitizeJourney(state.journey); }
function saveJourney(){ saveState(); }            // part of the save – stored with it
/** One-time move of the old shared journey (before 9.9.1) into the ACTIVE save. Never overwrites an existing journey. */
function migrateSharedJourney(){
  const raw = readJSON(JOURNEY_KEY); if(!raw) return "";
  const j = sanitizeJourney(raw);
  if(!j.active){ store.removeItem(JOURNEY_KEY); return ""; }
  if(state.journey && state.journey.active) return "";      // conflict (e.g. restored old "Umzug") → stays listed in Wartung, nothing lost
  state.journey = j; saveState();
  store.removeItem(JOURNEY_KEY);
  return (activeSlotMeta() || {}).name || state.club.name;
}
function jUndo(msg, fn){
  const snap = JSON.stringify(journey);
  fn(); journey = sanitizeJourney(journey); saveJourney(); renderJourney(); renderHomeJourney();
  toast(msg, {onUndo:()=>{ journey = sanitizeJourney(JSON.parse(snap)); saveJourney(); renderJourney(); renderHomeJourney(); }});
}
const jToday = () => state.club.ingameDate;
const jCurrent = () => journey.stations.find(s=>!s.to) || null;
const jDays = (a, b) => { const x = parseISO(a), y = parseISO(b); return x && y ? Math.round((y - x) / 86400000) : 0; };
function jUnemployedSince(){
  if(jCurrent()) return null;
  const ended = journey.stations.filter(s=>s.to).map(s=>s.to).sort().pop();
  return ended || journey.startDate || jToday();
}
function addMonthsISO(iso, m){
  const d = parseISO(iso); if(!d) return "";
  const t = new Date(d.getFullYear(), d.getMonth() + m, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
}
const jFree = () => journey.bank.savings - journey.goals.filter(g=>g.status === "saving").reduce((a,g)=>a+g.saved, 0);
// personal money: always the exact amount (the club views shorten large sums to "€18 Tsd.")
const jEUR = v => (v < 0 ? "−" : "") + "€" + fmtNum(Math.abs(Math.round(num(v))));
const jFmtD = iso => iso ? fmtDate(iso, {day:"2-digit", month:"2-digit", year:"numeric"}) : "—";

/* ---------- money: bookings, standing orders, goals ---------- */
function jTx(date, amount, from, to, text){ journey.tx.push({id:uid(), date, amount, from, to, text}); }
function jApplyOrder(o, date){
  const a = o.amount; if(!a) return;
  if(o.type === "income"){ journey.bank.giro += a; jTx(date, a, "ext", "giro", o.name); }
  else if(o.type === "expense"){ journey.bank.giro -= a; jTx(date, a, "giro", "ext", o.name); }
  else {
    journey.bank.giro -= a; journey.bank.savings += a;
    const g = journey.goals.find(x=>x.id === o.target && x.status === "saving");
    if(g) g.saved += a;
    jTx(date, a, "giro", g ? "goal:" + g.id : "savings", o.name + (g ? ` → ${g.name}` : ""));
  }
}
/** All due dates of an order in (fromISO, toISO]. */
function jOccurrences(o, fromISO, toISO){
  const out = [], from = parseISO(fromISO), to = parseISO(toISO), start = parseISO(o.start) || from;
  if(!from || !to || to <= from) return out;
  if(o.freq === "weekly"){
    let d = new Date(start);
    while(d <= from) d.setDate(d.getDate() + 7);
    for(; d <= to && out.length < 600; d.setDate(d.getDate() + 7)) out.push(new Date(d));
  } else {
    for(let y = from.getFullYear(), m = from.getMonth(); out.length < 600; m++){
      const t = new Date(y, m, 1); if(t > to) break;
      const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      const due = new Date(t.getFullYear(), t.getMonth(), Math.min(o.day, last));
      if(due > from && due <= to && due >= start) out.push(due);
    }
  }
  return out.map(d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
}
/** Date jump: book all due standing orders once, finish licence courses. Returns short messages. */
function processJourney(oldISO, newISO){
  if(!journey || !journey.active) return [];
  const from = journey.lastDate && journey.lastDate > oldISO ? journey.lastDate : oldISO;
  if(!(newISO > from)) return [];
  const msgs = []; let n = 0, sum = 0;
  const due = [];
  journey.orders.filter(o=>o.active).forEach(o=>jOccurrences(o, from, newISO).forEach(d=>due.push([d, o])));
  due.sort((a,b)=>a[0].localeCompare(b[0])).forEach(([d, o])=>{ jApplyOrder(o, d); n++; sum += o.type === "income" ? o.amount : -o.amount; });
  if(n) msgs.push(`💶 ${n} Buchung${n === 1 ? "" : "en"} (${sum >= 0 ? "+" : "−"}${jEUR(Math.abs(sum))})`);
  journey.courses.filter(c=>!c.done && c.start).forEach(c=>{
    const end = addMonthsISO(c.start, c.months);
    if(end > from && end <= newISO){ c.done = true; journey.profile.licenseIdx = Math.max(journey.profile.licenseIdx, c.targetIdx); msgs.push(`🎓 ${journey.licenseLevels[c.targetIdx]} abgeschlossen`); }
  });
  const g = journey.goals.find(x=>x.status === "saving" && x.target && x.saved >= x.target && !x._told);
  if(g) msgs.push(`🎯 Sparziel „${g.name}“ erreicht – kaufbereit`);
  journey.lastDate = newISO;
  journey = sanitizeJourney(journey); saveJourney();
  return msgs;
}
function jMonthlyFor(goalId){
  return journey.orders.filter(o=>o.active && o.type === "save" && o.target === goalId).reduce((a,o)=>a + (o.freq === "weekly" ? o.amount * 52 / 12 : o.amount), 0);
}

/* ---------- rendering ---------- */
function renderJourney(){
  if(!journey) loadJourney();
  const startBox = qs("#journeyStart"), grid = qs("#journeyGrid"); if(!startBox || !grid) return;
  startBox.hidden = journey.active; grid.hidden = !journey.active;
  if(!journey.active){
    startBox.innerHTML = `<div class="card j-start"><div class="j-start-icon" aria-hidden="true">🧭</div>
      <h2>Journey starten</h2>
      <p class="lead">Für einen Journey-Save: Du startest in FM arbeitslos – ohne Lizenz oder mit Amateur-Lizenz – und arbeitest dich hoch. Hier begleitest du deine Reise: Jobsuche, Lizenzen, Karriere-Stationen, Bankkonto, Sparziele, Tagebuch und eigene Regeln.</p>
      <p class="hint">Die Journey gehört zu diesem Spielstand („${esc((activeSlotMeta() || {}).name || state.club.name)}“) – jeder Spielstand hat seine eigene.</p>
      <button class="btn btn-accent" data-j="begin">Journey starten</button></div>`;
    return;
  }
  const p = journey.profile, cur = jCurrent(), since = jUnemployedSince(), today = jToday();
  // profile
  qs("#jProfile").innerHTML = `<div class="j-profile">
    <div class="j-avatar" aria-hidden="true">${esc((p.name || "?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase())}</div>
    <div class="j-pmain"><h3>${esc(p.name || "Namenloser Trainer")}</h3>
      <div class="muted small">${p.age} J.${p.nation ? " · " + esc(p.nation) : ""} · Start: ${p.start === "amateur" ? "mit Amateur-Lizenz" : "ohne Lizenz"}${journey.startDate ? " am " + jFmtD(journey.startDate) : ""}</div>
      ${p.background ? `<p class="j-text">${esc(p.background)}</p>` : ""}${p.philosophy ? `<p class="j-text"><strong>Philosophie:</strong> ${esc(p.philosophy)}</p>` : ""}</div>
    <div class="j-pstats">
      <div class="j-status ${cur ? "emp" : "unemp"}">${cur ? `💼 ${esc(cur.role)} bei <strong>${esc(cur.club)}</strong><em>seit ${jDays(cur.from, today)} Tagen</em>` : `🔎 Arbeitslos<em>seit ${Math.max(0, jDays(since, today))} Tagen</em>`}</div>
      <div><span>Lizenz</span><strong>${esc(journey.licenseLevels[p.licenseIdx])}</strong></div>
      <div><span>Ruf (eigene Einschätzung)</span><strong>${starsRO(p.reputation)}</strong></div>
      <div><span>Stationen</span><strong>${journey.stations.length}</strong></div>
    </div></div>`;
  // job search
  const apps = journey.applications, rej = apps.filter(a=>a.status === "rejected");
  const appCard = a => { const i = J_APP_STAGES.findIndex(x=>x[0] === a.status);
    return `<div class="j-app"><div class="j-app-top"><strong>${esc(a.club)}</strong>${a.date ? `<span class="muted small">${jFmtD(a.date)}</span>` : ""}</div>
      <div class="muted small">${esc([a.league, a.country].filter(Boolean).join(" · ")) || "&nbsp;"}</div>${a.note ? `<div class="j-app-note">${esc(a.note)}</div>` : ""}
      <div class="j-app-act"><button class="tc-arrow" data-j="appPrev:${a.id}" ${i <= 0 ? "disabled" : ""} aria-label="Zurück">◀</button>
        <span><button class="tc-arrow" data-j="appEdit:${a.id}" aria-label="Bearbeiten">✎</button><button class="tc-arrow" data-j="appReject:${a.id}" title="Absage" aria-label="Absage">✗</button></span>
        ${a.status === "offer" ? `<button class="btn btn-sm btn-accent" data-j="accept:${a.id}">Annehmen ✓</button>` : `<button class="tc-arrow" data-j="appNext:${a.id}" aria-label="Weiter">▶</button>`}</div></div>`; };
  qs("#jJobs").innerHTML = cur ? `<p class="empty">Du bist bei ${esc(cur.club)} unter Vertrag. Neue Anfragen und Bewerbungen kannst du trotzdem festhalten.</p>${apps.length ? "" : ""}` : "";
  qs("#jJobs").innerHTML += `<div class="j-board">${J_APP_STAGES.map(([k,l])=>{ const list = apps.filter(a=>a.status === k);
      return `<div class="tc-col"><div class="tc-col-head">${l}<span>${list.length}</span></div>${list.map(appCard).join("") || '<div class="tc-empty">—</div>'}</div>`; }).join("")}</div>
    ${rej.length ? `<details class="j-rejected"><summary>${rej.length} Absage${rej.length === 1 ? "" : "n"}</summary><ul>${rej.map(a=>`<li>${esc(a.club)} <span class="muted small">${jFmtD(a.date)}</span> <button class="linkish" data-j="appDel:${a.id}">löschen</button></li>`).join("")}</ul></details>` : ""}`;
  // stations
  qs("#jStations").innerHTML = journey.stations.length ? `<ol class="j-timeline">${journey.stations.slice().sort((a,b)=>(b.from||"").localeCompare(a.from||"")).map(s=>{
      const st = jStationStats(s);
      return `<li class="${s.to ? "" : "now"}"><div class="j-tl-head"><strong>${esc(s.club)}</strong><span class="muted small">${jFmtD(s.from)} – ${s.to ? jFmtD(s.to) : "heute"}</span></div>
        <div class="muted small">${esc(s.role)}${s.league ? " · " + esc(s.league) : ""}${s.country ? " · " + esc(s.country) : ""}${s.to && s.reason ? " · " + esc(s.reason) : ""}</div>
        ${st ? `<div class="small">${st}</div>` : ""}${s.achievements ? `<div class="j-text small">🏅 ${esc(s.achievements)}</div>` : ""}
        <div class="j-tl-act">${s.slotId && s.slotId !== slotIndex.active && slotIndex.slots.some(x=>x.id === s.slotId) ? `<button class="btn btn-sm" data-j="openSlot:${s.slotId}">Spielstand öffnen</button>` : ""}
          ${s.to ? "" : `<button class="btn btn-sm" data-j="endStation:${s.id}">Station beenden</button>`}<button class="tc-arrow" data-j="editStation:${s.id}" aria-label="Bearbeiten">✎</button></div></li>`; }).join("")}</ol>`
    : `<p class="empty">Noch keine Station. Nimm ein Angebot aus der Jobsuche an oder trage einen Verein ein.</p>`;
  // licence
  const L = journey.licenseLevels, li = p.licenseIdx;
  qs("#jLicense").innerHTML = `<ol class="j-ladder">${L.map((l,i)=>`<li class="${i < li ? "done" : i === li ? "now" : ""}">${esc(l)}</li>`).join("")}</ol>
    ${journey.courses.length ? `<div class="tc-sub-head">Kurse</div>${journey.courses.map(c=>{ const end = c.start ? addMonthsISO(c.start, c.months) : ""; const pct = c.done ? 100 : c.start ? clamp(Math.round(jDays(c.start, today) / Math.max(1, jDays(c.start, end)) * 100), 0, 100) : 0;
      return `<div class="j-course"><div class="j-course-top"><strong>${esc(L[c.targetIdx])}</strong><span class="muted small">${c.done ? "✓ abgeschlossen" : end ? "fertig am " + jFmtD(end) : "Start offen"}${c.cost ? " · " + jEUR(c.cost) : ""}</span><button class="tc-arrow" data-j="courseDel:${c.id}" aria-label="Kurs löschen">✕</button></div>
        <div class="tc-bar"><i style="width:${pct}%"></i></div></div>`; }).join("")}` : ""}
    <p class="hint">Stufen änderbar unter „Profil bearbeiten“. Kurse werden beim Datumssprung automatisch abgeschlossen.</p>`;
  // bank
  const free = jFree(), orders = journey.orders;
  qs("#jBank").innerHTML = `<div class="j-accounts">
      <div class="j-acc ${journey.bank.giro < 0 ? "neg" : ""}"><span>Girokonto</span><strong>${jEUR(journey.bank.giro)}</strong>${journey.bank.giro < 0 ? "<em>im Minus</em>" : ""}</div>
      <div class="j-acc"><span>Sparkonto</span><strong>${jEUR(journey.bank.savings)}</strong><em>davon frei ${jEUR(free)}</em></div></div>
    <div class="tc-sub-head">Daueraufträge <button class="linkish" data-j="addOrder">+ neu</button></div>
    ${orders.length ? orders.map(o=>`<div class="j-order ${o.active ? "" : "off"}"><span class="j-otype t-${o.type}">${o.type === "income" ? "＋" : o.type === "save" ? "⇄" : "－"}</span>
      <div class="grow"><strong>${esc(o.name)}</strong><div class="muted small">${jEUR(o.amount)} · ${o.freq === "weekly" ? "wöchentlich" : `monatlich am ${o.day}.`} · ${o.type === "income" ? "aufs Girokonto" : o.type === "expense" ? "weg (Ausgabe)" : o.target ? "aufs Sparziel „" + esc((journey.goals.find(g=>g.id === o.target) || {}).name || "") + "“" : "aufs Sparkonto"}</div></div>
      <label class="switch small-switch" title="aktiv"><input type="checkbox" data-j-order="${o.id}" ${o.active ? "checked" : ""} aria-label="${esc(o.name)} aktiv"><span></span></label>
      <button class="tc-arrow" data-j="orderEdit:${o.id}" aria-label="Bearbeiten">✎</button></div>`).join("") : `<p class="empty small">Noch keine Daueraufträge – z. B. Gehalt, Miete oder monatliches Sparen.</p>`}
    ${journey.tx.length ? `<details class="j-tx"><summary>Letzte Umsätze</summary><ul>${journey.tx.slice(-12).reverse().map(t=>{ const inc = t.from === "ext", out = t.to === "ext";
      return `<li><span class="muted small">${jFmtD(t.date)}</span><span class="grow">${esc(t.text)}</span><strong class="${inc ? "pos" : out ? "neg" : ""}">${inc ? "+" : out ? "−" : "⇄ "}${jEUR(Math.abs(t.amount))}</strong></li>`; }).join("")}</ul></details>` : ""}`;
  // savings goals
  const active = journey.goals.filter(g=>g.status === "saving"), owned = journey.goals.filter(g=>g.status === "bought");
  qs("#jSave").innerHTML = (active.length ? active.map(g=>{ const pct = g.target ? clamp(Math.round(g.saved / g.target * 100), 0, 100) : 0, rate = jMonthlyFor(g.id), rest = Math.max(0, g.target - g.saved);
      const eta = rest && rate ? addMonthsISO(today, Math.ceil(rest / rate)) : "";
      return `<div class="j-goal"><div class="j-goal-top"><span class="j-gcat">${J_GOAL_CATS[g.cat].split(" ")[0]}</span><strong>${esc(g.name)}</strong><span class="muted small">${jEUR(g.saved)} / ${jEUR(g.target)}</span></div>
        <div class="tc-bar"><i style="width:${pct}%" class="${pct >= 100 ? "" : ""}"></i></div>
        <div class="j-goal-foot"><span class="muted small">${pct >= 100 ? "✓ Ziel erreicht" : rate ? `${jEUR(rate)}/Monat · erreicht ca. ${jFmtD(eta)}${(()=>{ const mo = Math.ceil(rest / rate); return mo >= 24 ? ` (in ~${Math.round(mo/12)} J.)` : mo > 1 ? ` (in ${mo} Mon.)` : ""; })()}` : "kein Sparplan"}</span>
          <span><button class="btn btn-sm" data-j="goalPay:${g.id}">Einzahlen</button>${pct >= 100 ? `<button class="btn btn-sm btn-accent" data-j="goalBuy:${g.id}">Kaufen ✓</button>` : ""}<button class="tc-arrow" data-j="goalEdit:${g.id}" aria-label="Bearbeiten">✎</button></span></div></div>`; }).join("")
      : `<p class="empty">Noch keine Sparziele – z. B. Haus, Auto, Boot oder eine teure Uhr.</p>`)
    + (owned.length ? `<div class="tc-sub-head">Besitz</div><div class="j-owned">${owned.map(g=>`<span class="j-owned-item" title="gekauft am ${jFmtD(g.boughtAt)} für ${jEUR(g.target)}">${J_GOAL_CATS[g.cat].split(" ")[0]} ${esc(g.name)}</span>`).join("")}</div>` : "");
  // milestones, trophies, diary, rules
  qs("#jMilestones").innerHTML = journey.milestones.length ? `<ul class="j-list">${journey.milestones.map(m=>`<li class="${m.done ? "done" : ""}"><label class="check-label"><input type="checkbox" data-j-ms="${m.id}" ${m.done ? "checked" : ""}> <span>${esc(m.text)}</span></label>${m.done && m.date ? `<span class="muted small">${jFmtD(m.date)}</span>` : ""}<button class="tc-arrow" data-j="msDel:${m.id}" aria-label="Löschen">✕</button></li>`).join("")}</ul>`
    : `<p class="empty">Noch keine Reiseziele. <button class="linkish" data-j="msDefaults">Vorschläge übernehmen</button></p>`;
  qs("#jTrophies").innerHTML = journey.trophies.length ? `<div class="j-trophies">${journey.trophies.map(t=>`<div class="j-trophy"><span aria-hidden="true">🏆</span><div><strong>${esc(t.title)}</strong><div class="muted small">${esc([t.club, t.season].filter(Boolean).join(" · "))}</div></div><button class="tc-arrow" data-j="trDel:${t.id}" aria-label="Löschen">✕</button></div>`).join("")}</div>`
    : `<p class="empty">Noch leer – der erste Titel kommt bestimmt.</p>`;
  qs("#jDiary").innerHTML = journey.diary.length ? `<div class="j-diary">${journey.diary.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(e=>`<article class="j-entry">
      <div class="j-entry-head"><span class="j-mood" aria-hidden="true">${J_MOODS[e.mood]}</span><strong>${esc(e.title || "Eintrag")}</strong><span class="muted small">${jFmtD(e.date)}</span><button class="tc-arrow" data-j="diaryEdit:${e.id}" aria-label="Bearbeiten">✎</button></div>
      <div class="j-text">${esc(e.text).replace(/\n/g, "<br>")}</div></article>`).join("")}</div>`
    : `<p class="empty">Das erste Kapitel deiner Reise ist noch ungeschrieben.</p>`;
  qs("#jRules").innerHTML = journey.rules.length ? `<ul class="j-list">${journey.rules.map(r=>`<li class="${r.broken ? "broken" : ""}"><span>${esc(r.text)}</span>
      <button class="btn btn-sm ${r.broken ? "btn-danger-outline" : ""}" data-j="ruleToggle:${r.id}">${r.broken ? "✗ gebrochen" : "✓ eingehalten"}</button><button class="tc-arrow" data-j="ruleDel:${r.id}" aria-label="Löschen">✕</button></li>`).join("")}</ul>`
    : `<p class="empty">Selbstauferlegte Challenges, z. B. „nur Spieler unter 23 verpflichten“.</p>`;
}
/** Live numbers of a station from its linked save (results of that save). */
function jStationStats(s){
  if(!s.slotId) return "";
  const data = s.slotId === slotIndex.active ? state : readJSON(SLOT_PREFIX + s.slotId);
  if(!data || !Array.isArray(data.results) || !data.results.length) return "";
  const r = data.results, w = r.filter(x=>x.gf > x.ga).length, dr = r.filter(x=>x.gf === x.ga).length;
  return `${r.length} Spiele · <span class="pos">${w} S</span> · ${dr} U · <span class="neg">${r.length - w - dr} N</span>`;
}
function renderHomeJourney(){
  const card = qs("#journeyHomeCard"); if(!card) return;
  if(!journey) loadJourney();
  const show = journey.active && !jCurrent();
  card.hidden = !show; if(!show) return;
  const since = jUnemployedSince(), apps = journey.applications.filter(a=>a.status !== "rejected");
  const course = journey.courses.find(c=>!c.done && c.start);
  qs("#journeyHome").innerHTML = `<div class="jh">
    <div class="jh-big"><strong>${Math.max(0, jDays(since, jToday()))}</strong><span>Tage ohne Job</span></div>
    <div class="jh-cols">
      <div><span>Bewerbungen</span><strong>${apps.length}</strong><em>${apps.filter(a=>a.status === "interview").length} Gespräch · ${apps.filter(a=>a.status === "offer").length} Angebot</em></div>
      <div><span>Lizenz</span><strong>${esc(journey.licenseLevels[journey.profile.licenseIdx])}</strong><em>${course ? "Kurs bis " + jFmtD(addMonthsISO(course.start, course.months)) : "kein Kurs"}</em></div>
      <div class="${journey.bank.giro < 0 ? "neg" : ""}"><span>Girokonto</span><strong>${jEUR(journey.bank.giro)}</strong><em>Sparkonto ${jEUR(journey.bank.savings)}</em></div>
    </div></div>`;
}

/* ---------- dialogs ---------- */
function jProfileModal(first){
  const p = journey.profile;
  openModal({title: first ? "Journey starten" : "Manager-Profil", wide:true,
    body:`<div class="field-row"><div class="field" style="flex:2"><label>Name</label><input data-f="name" value="${esc(p.name)}" placeholder="dein Trainername"></div>
      <div class="field"><label>Alter</label><input data-f="age" type="number" value="${p.age}"></div><div class="field"><label>Nationalität</label><input data-f="nation" value="${esc(p.nation)}"></div></div>
      <div class="field-row"><div class="field"><label>Start</label><select data-f="start">${options({none:"arbeitslos, ohne Lizenz", amateur:"arbeitslos, mit Amateur-Lizenz"}, p.start)}</select></div>
        <div class="field"><label>Aktuelle Lizenz</label><select data-f="licenseIdx">${options(Object.fromEntries(journey.licenseLevels.map((l,i)=>[i,l])), String(p.licenseIdx))}</select></div>
        <div class="field"><label>Ruf (1–5)</label><select data-f="reputation">${options({1:"★",2:"★★",3:"★★★",4:"★★★★",5:"★★★★★"}, String(p.reputation))}</select></div></div>
      <div class="field"><label>Hintergrund</label><textarea data-f="background" rows="2" placeholder="z. B. Ex-Amateurspieler, Sportlehrer …">${esc(p.background)}</textarea></div>
      <div class="field"><label>Spielphilosophie</label><textarea data-f="philosophy" rows="2" placeholder="z. B. Pressing, Jugend vor Stars …">${esc(p.philosophy)}</textarea></div>
      ${first ? `<div class="field-row"><div class="field"><label>Startkapital Girokonto (€)</label>${moneyInput(0, 'data-f="giro"')}</div><div class="field"><label>Sparkonto (€)</label>${moneyInput(0, 'data-f="savings"')}</div></div>`
        : `<div class="field"><label>Lizenz-Stufen (eine pro Zeile)</label><textarea data-f="levels" rows="4">${esc(journey.licenseLevels.join("\n"))}</textarea></div>`}`,
    saveLabel: first ? "Los geht's" : "Speichern",
    leftButtons: first ? "" : `<button class="btn btn-sm" data-j-export>Journey exportieren</button><button class="btn btn-sm btn-danger-outline" data-j-reset>Journey zurücksetzen</button>`,
    onOpen: m=>{
      const ex = qs("[data-j-export]", m); if(ex) ex.onclick = ()=>jExport();
      const rs = qs("[data-j-reset]", m); if(rs) rs.onclick = ()=>{ closeModal(); jUndo("Journey dieses Spielstands zurückgesetzt", ()=>{ journey = sanitizeJourney(null); }); };
    },
    onSave: get=>{
      jUndo(first ? "Journey gestartet" : "Profil gespeichert", ()=>{
        if(!first){ const lv = get("levels").split("\n").map(x=>x.trim()).filter(Boolean); if(lv.length >= 2) journey.licenseLevels = lv; }
        Object.assign(journey.profile, {name:get("name").trim(), age:get("age"), nation:get("nation").trim(), start:get("start"), licenseIdx:num(get("licenseIdx"),0),
          reputation:num(get("reputation"),1), background:get("background"), philosophy:get("philosophy")});
        if(first){ journey.active = true; journey.startDate = jToday(); journey.lastDate = jToday(); journey.bank.giro = get("giro"); journey.bank.savings = get("savings");
          if(get("start") === "amateur" && journey.profile.licenseIdx < 1) journey.profile.licenseIdx = 1; }
      });
    }});
}
function jAppModal(a){
  a = a || {club:"", league:"", country:"", date:jToday(), status:"interest", note:""};
  openModal({title: a.id ? "Bewerbung bearbeiten" : "Verein auf die Liste",
    body:`<div class="field-row"><div class="field" style="flex:2"><label>Verein</label><input data-f="club" value="${esc(a.club)}"></div><div class="field"><label>Datum</label><input data-f="date" type="date" value="${esc(a.date)}"></div></div>
      <div class="field-row"><div class="field"><label>Liga</label><input data-f="league" value="${esc(a.league)}"></div><div class="field"><label>Land</label><input data-f="country" value="${esc(a.country)}"></div>
        <div class="field"><label>Stand</label><select data-f="status">${options(Object.assign(Object.fromEntries(J_APP_STAGES), {rejected:"Absage"}), a.status)}</select></div></div>
      <div class="field"><label>Notizen (z. B. zum Gespräch)</label><textarea data-f="note" rows="3">${esc(a.note)}</textarea></div>`,
    leftButtons: a.id ? `<button class="btn btn-danger-outline" data-j-appdel>Löschen</button>` : "",
    onOpen: m=>{ const b = qs("[data-j-appdel]", m); if(b) b.onclick = ()=>{ closeModal(); jUndo("Bewerbung gelöscht", ()=>{ journey.applications = journey.applications.filter(x=>x.id !== a.id); }); }; },
    saveLabel:"Speichern",
    onSave: get=>{ const data = {club:get("club").trim() || "Verein", league:get("league").trim(), country:get("country").trim(), date:get("date"), status:get("status"), note:get("note")};
      jUndo(a.id ? "Gespeichert" : "Verein hinzugefügt", ()=>{ if(a.id) Object.assign(journey.applications.find(x=>x.id === a.id), data); else journey.applications.push(Object.assign({id:uid()}, data)); }); }});
}
function jStationModal(pre){
  pre = pre || {};
  openModal({title:"Neuer Verein", wide:true,
    body:`<p class="lead">Beginnt eine neue Station deiner Journey${jCurrent() ? ` – die aktuelle bei ${esc(jCurrent().club)} wird dabei beendet` : ""}.</p>
      <div class="field-row"><div class="field" style="flex:2"><label>Verein</label><input data-f="club" value="${esc(pre.club || "")}"></div><div class="field"><label>Rolle</label><input data-f="role" value="Cheftrainer"></div><div class="field"><label>Beginn</label><input data-f="from" type="date" value="${esc(jToday())}"></div></div>
      <div class="field-row"><div class="field"><label>Liga</label><input data-f="league" value="${esc(pre.league || "")}"></div><div class="field"><label>Land</label><input data-f="country" value="${esc(pre.country || "")}"></div>
        <div class="field"><label>Monatsgehalt (€)</label>${moneyInput(0, 'data-f="salary"')}</div></div>
      <label class="check-label"><input type="checkbox" data-f="salaryOrder" checked> Gehalt als Dauerauftrag am 1. jedes Monats aufs Girokonto</label>
      <label class="check-label"><input type="checkbox" data-f="newSlot"> Neuen Spielstand für diesen Verein anlegen und öffnen – die Journey zieht mit (Kader danach per FM-Import füllen)</label>`,
    saveLabel:"Station beginnen",
    onSave: get=>{
      const club = get("club").trim(); if(!club){ toast("Bitte den Verein eintragen."); return false; }
      const from = get("from") || jToday(), salary = get("salary");
      let slotId = "";
      jUndo(`Neue Station: ${club}`, ()=>{
        const cur = jCurrent(); if(cur) jEndStation(cur, from, "gewechselt");
        const st = {id:uid(), club, role:get("role").trim() || "Cheftrainer", league:get("league").trim(), country:get("country").trim(), from, to:"", reason:"", salary, slotId:"", orderId:"", achievements:""};
        if(salary && get("salaryOrder")){ const o = {id:uid(), name:`Gehalt ${club}`, amount:salary, type:"income", target:"", freq:"monthly", day:1, start:from, active:true}; journey.orders.push(o); st.orderId = o.id; }
        if(pre.appId){ const a = journey.applications.find(x=>x.id === pre.appId); if(a) journey.applications = journey.applications.filter(x=>x.id !== a.id); }
        journey.stations.push(st);
        if(get("newSlot")){
          // the journey moves on with you: the new save gets a copy (incl. this station), the old save keeps its state as it was
          const fresh = freshState("empty"); fresh.club.name = club; fresh.club.ingameDate = from; fresh.club.crest = club.replace(/[^A-Za-zÄÖÜäöü]/g,"").slice(0,3).toUpperCase() || "FC";
          slotId = uid(); st.slotId = slotId;
          fresh.journey = JSON.parse(JSON.stringify(journey));
          const created = createSlot(club, sanitizeState(fresh));
          // createSlot picks its own id → link the station (in both copies) to the real id
          st.slotId = created; slotId = created;
          const data = readJSON(SLOT_PREFIX + created); (data.journey.stations.find(x=>x.id === st.id) || {}).slotId = created; store.setItem(SLOT_PREFIX + created, JSON.stringify(data));
        }
      });
      if(slotId){ saveJourney(); switchSlot(slotId); toast(`Neuer Spielstand „${club}“ – jetzt Kader per „Import aus FM“ füllen`, {duration:7000}); }
    }});
}
function jEndStation(s, date, reason){
  s.to = date || jToday(); s.reason = reason || s.reason;
  const o = journey.orders.find(x=>x.id === s.orderId); if(o) o.active = false;
}
function jOrderModal(o){
  const g = journey.goals.filter(x=>x.status === "saving");
  o = o || {name:"", amount:0, type:"save", target:"", freq:"monthly", day:1, active:true};
  openModal({title: o.id ? "Dauerauftrag bearbeiten" : "Neuer Dauerauftrag",
    body:`<div class="field-row"><div class="field" style="flex:2"><label>Bezeichnung</label><input data-f="name" value="${esc(o.name)}" placeholder="z. B. Miete, Sparplan Haus"></div><div class="field"><label>Betrag (€)</label>${moneyInput(o.amount, 'data-f="amount"')}</div></div>
      <div class="field-row"><div class="field"><label>Art</label><select data-f="type">${options({income:"Einnahme → Girokonto", expense:"Ausgabe → weg (ins Nix)", save:"Sparen → Sparkonto/Sparziel"}, o.type)}</select></div>
        <div class="field"><label>Sparen auf</label><select data-f="target">${options(Object.assign({"":"Sparkonto (frei)"}, Object.fromEntries(g.map(x=>[x.id, "Sparziel: " + x.name]))), o.target)}</select></div></div>
      <div class="field-row"><div class="field"><label>Rhythmus</label><select data-f="freq">${options({monthly:"monatlich", weekly:"wöchentlich"}, o.freq)}</select></div><div class="field"><label>Tag im Monat</label><input data-f="day" type="number" min="1" max="31" value="${o.day}"></div></div>
      <p class="hint">Gebucht wird automatisch beim Datumssprung – nie doppelt, auch nicht beim Wechsel zwischen Spielständen. Rückgängig über den Hinweis nach dem Datumssprung.</p>`,
    leftButtons: o.id ? `<button class="btn btn-danger-outline" data-j-orddel>Löschen</button>` : "",
    onOpen: m=>{ const b = qs("[data-j-orddel]", m); if(b) b.onclick = ()=>{ closeModal(); jUndo("Dauerauftrag gelöscht", ()=>{ journey.orders = journey.orders.filter(x=>x.id !== o.id); }); }; },
    saveLabel:"Speichern",
    onSave: get=>{ const data = {name:get("name").trim() || "Dauerauftrag", amount:get("amount"), type:get("type"), target:get("type") === "save" ? get("target") : "", freq:get("freq"), day:clamp(Math.round(num(get("day"),1)),1,31)};
      jUndo("Dauerauftrag gespeichert", ()=>{ if(o.id) Object.assign(journey.orders.find(x=>x.id === o.id), data); else journey.orders.push(Object.assign({id:uid(), start:jToday(), active:true}, data)); }); }});
}
function jBookingModal(){
  openModal({title:"Buchung",
    body:`<div class="field-row"><div class="field"><label>Art</label><select data-f="kind">${options({in:"Einzahlung aufs Girokonto", out:"Ausgabe vom Girokonto", toSave:"Umbuchung Giro → Sparkonto", toGiro:"Umbuchung Sparkonto → Giro"}, "in")}</select></div>
      <div class="field"><label>Betrag (€)</label>${moneyInput(0, 'data-f="amount"')}</div></div>
      <div class="field"><label>Text</label><input data-f="text" placeholder="z. B. Prämie, neues Handy"></div>`,
    saveLabel:"Buchen",
    onSave: get=>{ const a = get("amount"), k = get("kind"), t = get("text").trim(); if(!a){ toast("Bitte einen Betrag eingeben."); return false; }
      if(k === "toGiro" && a > jFree()){ toast(`Vom Sparkonto sind nur ${jEUR(jFree())} frei (der Rest ist für Sparziele reserviert).`); return false; }
      jUndo("Gebucht", ()=>{ const b = journey.bank, d = jToday();
        if(k === "in"){ b.giro += a; jTx(d, a, "ext", "giro", t || "Einzahlung"); }
        if(k === "out"){ b.giro -= a; jTx(d, a, "giro", "ext", t || "Ausgabe"); }
        if(k === "toSave"){ b.giro -= a; b.savings += a; jTx(d, a, "giro", "savings", t || "Umbuchung aufs Sparkonto"); }
        if(k === "toGiro"){ b.savings -= a; b.giro += a; jTx(d, a, "savings", "giro", t || "Umbuchung aufs Girokonto"); } }); }});
}
function jGoalModal(g){
  g = g || {name:"", cat:"house", target:0};
  openModal({title: g.id ? "Sparziel bearbeiten" : "Neues Sparziel",
    body:`<div class="field-row"><div class="field"><label>Kategorie</label><select data-f="cat">${options(J_GOAL_CATS, g.cat)}</select></div><div class="field" style="flex:2"><label>Name</label><input data-f="name" value="${esc(g.name)}" placeholder="z. B. Villa am See"></div></div>
      <div class="field"><label>Zielbetrag (€)</label>${moneyInput(g.target, 'data-f="target"')}</div>
      ${g.id ? "" : `<label class="check-label"><input type="checkbox" data-f="plan"> Monatlichen Sparplan anlegen über</label> ${moneyInput(0, 'data-f="rate" aria-label="Monatlicher Sparbetrag"')}`}`,
    leftButtons: g.id ? `<button class="btn btn-danger-outline" data-j-goaldel>Löschen</button>` : "",
    onOpen: m=>{ const b = qs("[data-j-goaldel]", m); if(b) b.onclick = ()=>{ closeModal(); jUndo(`Sparziel gelöscht – ${jEUR(g.saved)} wieder frei auf dem Sparkonto`, ()=>{ journey.goals = journey.goals.filter(x=>x.id !== g.id); journey.orders.forEach(o=>{ if(o.target === g.id) o.target = ""; }); }); }; },
    saveLabel:"Speichern",
    onSave: get=>{ const data = {name:get("name").trim() || J_GOAL_CATS[get("cat")].split(" ")[1], cat:get("cat"), target:get("target")};
      jUndo("Sparziel gespeichert", ()=>{ if(g.id) Object.assign(journey.goals.find(x=>x.id === g.id), data);
        else { const ng = Object.assign({id:uid(), saved:0, status:"saving", boughtAt:""}, data); journey.goals.push(ng);
          if(get("plan") && get("rate")) journey.orders.push({id:uid(), name:`Sparplan ${ng.name}`, amount:get("rate"), type:"save", target:ng.id, freq:"monthly", day:1, start:jToday(), active:true}); } }); }});
}
function jGoalPay(g){
  openModal({title:`Auf „${g.name}“ einzahlen`,
    body:`<div class="field-row"><div class="field"><label>Betrag (€)</label>${moneyInput(Math.max(0, g.target - g.saved), 'data-f="amount"')}</div>
      <div class="field"><label>Von</label><select data-f="src">${options({free:`Sparkonto (frei: ${jEUR(jFree())})`, giro:`Girokonto (${jEUR(journey.bank.giro)})`}, jFree() > 0 ? "free" : "giro")}</select></div></div>`,
    saveLabel:"Einzahlen",
    onSave: get=>{ const a = get("amount"), src = get("src"); if(!a) return false;
      if(src === "free" && a > jFree()){ toast(`Frei auf dem Sparkonto: ${jEUR(jFree())}`); return false; }
      jUndo(`${jEUR(a)} auf „${g.name}“`, ()=>{ const x = journey.goals.find(y=>y.id === g.id); x.saved += a;
        if(src === "giro"){ journey.bank.giro -= a; journey.bank.savings += a; jTx(jToday(), a, "giro", "goal:" + g.id, `Einzahlung ${g.name}`); }
        else jTx(jToday(), a, "savings", "goal:" + g.id, `Zuordnung ${g.name}`); }); }});
}
function jGoalBuy(g){
  openModal({title:`${g.name} kaufen?`, body:`<p class="lead">${jEUR(g.target)} gehen vom Sparkonto ab${g.saved > g.target ? `, ${jEUR(g.saved - g.target)} Überschuss bleiben frei` : ""}. Das Stück wandert in deinen Besitz, Sparpläne dafür werden beendet.</p>`,
    saveLabel:"Kaufen",
    onSave: ()=>jUndo(`🎉 ${g.name} gekauft`, ()=>{ const x = journey.goals.find(y=>y.id === g.id); journey.bank.savings -= x.target; x.saved = x.target; x.status = "bought"; x.boughtAt = jToday();
      journey.orders.forEach(o=>{ if(o.target === x.id){ o.active = false; o.target = ""; } }); jTx(jToday(), x.target, "savings", "ext", `Kauf: ${x.name}`); })});
}
function jDiaryModal(e){
  e = e || {date:jToday(), mood:"good", title:"", text:""};
  openModal({title: e.id ? "Tagebuch-Eintrag" : "Neuer Tagebuch-Eintrag", wide:true,
    body:`<div class="field-row"><div class="field" style="flex:2"><label>Titel</label><input data-f="title" value="${esc(e.title)}" placeholder="z. B. Das Vorstellungsgespräch"></div>
      <div class="field"><label>Datum</label><input data-f="date" type="date" value="${esc(e.date)}"></div><div class="field"><label>Stimmung</label><select data-f="mood">${options(Object.fromEntries(Object.entries(J_MOODS).map(([k,v])=>[k,v])), e.mood)}</select></div></div>
      <div class="field"><label>Text</label><textarea data-f="text" rows="8">${esc(e.text)}</textarea></div>`,
    leftButtons: e.id ? `<button class="btn btn-danger-outline" data-j-diadel>Löschen</button>` : "",
    onOpen: m=>{ const b = qs("[data-j-diadel]", m); if(b) b.onclick = ()=>{ closeModal(); jUndo("Eintrag gelöscht", ()=>{ journey.diary = journey.diary.filter(x=>x.id !== e.id); }); }; },
    saveLabel:"Speichern",
    onSave: get=>{ const data = {title:get("title").trim(), date:get("date"), mood:get("mood"), text:get("text")};
      jUndo("Eintrag gespeichert", ()=>{ if(e.id) Object.assign(journey.diary.find(x=>x.id === e.id), data); else journey.diary.push(Object.assign({id:uid()}, data)); }); }});
}
function jExport(){
  const name = (activeSlotMeta() || {}).name || state.club.name;
  const text = JSON.stringify({app:"FM27 Dashboard", kind:"journey", version:APP_VERSION, slotName:name, savedAt:new Date().toISOString(), journey}, null, 2);
  const url = URL.createObjectURL(new Blob([text], {type:"application/json"})), a = document.createElement("a");
  a.href = url; a.download = `fm27_journey_${safeFileName(name)}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast("Journey exportiert – in einem anderen Spielstand über „Import“ einlesen");
  return text;
}
function jPrompt(title, label, cb){
  openModal({title, body:`<div class="field"><label>${label}</label><input data-f="v"></div>`, saveLabel:"Hinzufügen",
    onSave: get=>{ const v = get("v").trim(); if(!v) return false; cb(v); }});
}
function initJourney(){
  loadJourney();
  const root = qs("#view-journey");
  const act = (kind, id) => {
    const find = list => journey[list].find(x=>x.id === id);
    const stepApp = dir => { const a = find("applications"); if(!a) return; const i = J_APP_STAGES.findIndex(x=>x[0] === a.status);
      jUndo(`${a.club}: ${J_APP_STAGES[clamp(i + dir, 0, 3)][1]}`, ()=>{ a.status = J_APP_STAGES[clamp(i + dir, 0, 3)][0]; }); };
    switch(kind){
      case "begin": return jProfileModal(true);
      case "profile": return jProfileModal(false);
      case "addApp": return jAppModal(null);
      case "appEdit": return jAppModal(find("applications"));
      case "appNext": return stepApp(1);
      case "appPrev": return stepApp(-1);
      case "appReject": { const a = find("applications"); return jUndo(`Absage von ${a.club}`, ()=>{ a.status = "rejected"; }); }
      case "appDel": return jUndo("Gelöscht", ()=>{ journey.applications = journey.applications.filter(x=>x.id !== id); });
      case "accept": { const a = find("applications"); return jStationModal({club:a.club, league:a.league, country:a.country, appId:a.id}); }
      case "newStation": return jStationModal({});
      case "endStation": { const s = find("stations");
        return openModal({title:`Station bei ${s.club} beenden`, body:`<div class="field-row"><div class="field"><label>Ende</label><input data-f="to" type="date" value="${esc(jToday())}"></div>
          <div class="field"><label>Grund</label><select data-f="reason">${options({"entlassen":"entlassen","zurückgetreten":"zurückgetreten","Vertrag ausgelaufen":"Vertrag ausgelaufen","gewechselt":"gewechselt"}, "entlassen")}</select></div></div>
          <div class="field"><label>Erfolge (optional)</label><input data-f="ach" value="${esc(s.achievements)}"></div><p class="hint">Das Gehalt als Dauerauftrag wird gestoppt, die Uhr für „arbeitslos seit“ beginnt.</p>`,
          saveLabel:"Beenden", onSave: get=>jUndo(`Station bei ${s.club} beendet`, ()=>{ jEndStation(journey.stations.find(x=>x.id === id), get("to"), get("reason")); journey.stations.find(x=>x.id === id).achievements = get("ach"); })}); }
      case "editStation": { const s = find("stations");
        return openModal({title:`Station ${s.club}`, body:`<div class="field-row"><div class="field"><label>Verein</label><input data-f="club" value="${esc(s.club)}"></div><div class="field"><label>Rolle</label><input data-f="role" value="${esc(s.role)}"></div></div>
          <div class="field-row"><div class="field"><label>Von</label><input data-f="from" type="date" value="${esc(s.from)}"></div><div class="field"><label>Bis</label><input data-f="to" type="date" value="${esc(s.to)}"></div></div>
          <div class="field"><label>Erfolge</label><input data-f="ach" value="${esc(s.achievements)}"></div>`, saveLabel:"Speichern",
          onSave: get=>jUndo("Gespeichert", ()=>{ Object.assign(journey.stations.find(x=>x.id === id), {club:get("club").trim() || s.club, role:get("role").trim(), from:get("from"), to:get("to"), achievements:get("ach")}); })}); }
      case "openSlot": return switchSlot(id);
      case "addCourse": return openModal({title:"Lizenz-Kurs", body:`<div class="field-row"><div class="field"><label>Ziel-Lizenz</label><select data-f="t">${options(Object.fromEntries(journey.licenseLevels.map((l,i)=>[i,l]).slice(journey.profile.licenseIdx + 1)), String(journey.profile.licenseIdx + 1))}</select></div>
          <div class="field"><label>Beginn</label><input data-f="s" type="date" value="${esc(jToday())}"></div><div class="field"><label>Dauer (Monate)</label><input data-f="m" type="number" value="6" min="1"></div></div>
          <div class="field-row"><div class="field"><label>Kosten (€)</label>${moneyInput(0, 'data-f="c"')}</div></div><label class="check-label"><input type="checkbox" data-f="pay" checked> Kosten jetzt vom Girokonto abbuchen</label>`, saveLabel:"Anmelden",
          onSave: get=>jUndo("Kurs angemeldet", ()=>{ const c = {id:uid(), targetIdx:num(get("t"),1), start:get("s"), months:num(get("m"),6), cost:get("c"), done:false}; journey.courses.push(c);
            if(c.cost && get("pay")){ journey.bank.giro -= c.cost; jTx(jToday(), c.cost, "giro", "ext", `Kurs ${journey.licenseLevels[c.targetIdx]}`); } })});
      case "courseDel": return jUndo("Kurs gelöscht", ()=>{ journey.courses = journey.courses.filter(x=>x.id !== id); });
      case "booking": return jBookingModal();
      case "addOrder": return jOrderModal(null);
      case "orderEdit": return jOrderModal(find("orders"));
      case "addGoal": return jGoalModal(null);
      case "goalEdit": return jGoalModal(find("goals"));
      case "goalPay": return jGoalPay(find("goals"));
      case "goalBuy": return jGoalBuy(find("goals"));
      case "addMilestone": return jPrompt("Neues Reiseziel", "Ziel", v=>jUndo("Ziel hinzugefügt", ()=>journey.milestones.push({id:uid(), text:v, done:false, date:""})));
      case "msDefaults": return jUndo("Vorschläge übernommen", ()=>["Erster Job als Trainer","Erste Lizenz-Stufe geschafft","Erste volle Saison","Aufstieg","Erster Titel","Pro-Lizenz","Profiliga","Europapokal","Nationaltrainer"].forEach(t=>journey.milestones.push({id:uid(), text:t, done:false, date:""})));
      case "msDel": return jUndo("Gelöscht", ()=>{ journey.milestones = journey.milestones.filter(x=>x.id !== id); });
      case "addTrophy": return openModal({title:"Titel in den Schrank", body:`<div class="field"><label>Titel</label><input data-f="t" placeholder="z. B. Meister 3. Liga"></div>
          <div class="field-row"><div class="field"><label>Verein</label><input data-f="c" value="${esc((jCurrent() || {}).club || "")}"></div><div class="field"><label>Saison</label><input data-f="s" value="${esc(state.club.season)}"></div></div>`, saveLabel:"Hinzufügen",
          onSave: get=>{ if(!get("t").trim()) return false; jUndo("🏆 Titel hinzugefügt", ()=>journey.trophies.push({id:uid(), title:get("t").trim(), club:get("c").trim(), season:get("s").trim()})); }});
      case "trDel": return jUndo("Gelöscht", ()=>{ journey.trophies = journey.trophies.filter(x=>x.id !== id); });
      case "addDiary": return jDiaryModal(null);
      case "diaryEdit": return jDiaryModal(find("diary"));
      case "addRule": return jPrompt("Eigene Regel", "Regel", v=>jUndo("Regel hinzugefügt", ()=>journey.rules.push({id:uid(), text:v, broken:false})));
      case "ruleToggle": { const r = find("rules"); return jUndo(r.broken ? "Wieder eingehalten" : "Regel gebrochen", ()=>{ r.broken = !r.broken; }); }
      case "ruleDel": return jUndo("Gelöscht", ()=>{ journey.rules = journey.rules.filter(x=>x.id !== id); });
    }
  };
  root.addEventListener("click", e=>{
    const b = e.target.closest("[data-j]"); if(!b) return;
    const raw = b.dataset.j, i = raw.indexOf(":");
    act(i < 0 ? raw : raw.slice(0, i), i < 0 ? "" : raw.slice(i + 1));
  });
  root.addEventListener("change", e=>{
    const t = e.target;
    if(t.dataset.jOrder){ const o = journey.orders.find(x=>x.id === t.dataset.jOrder); if(o) jUndo(`${o.name} ${t.checked ? "aktiv" : "pausiert"}`, ()=>{ o.active = t.checked; }); }
    if(t.dataset.jMs){ const m = journey.milestones.find(x=>x.id === t.dataset.jMs); if(m) jUndo(t.checked ? `✓ ${m.text}` : "Zurückgesetzt", ()=>{ m.done = t.checked; m.date = t.checked ? jToday() : ""; }); }
  });
}



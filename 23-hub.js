/* ==========================================================================
   GAMING-HUB (11.4) – start page above all panels. The FM dashboard is one panel of several.
   The hub knows "games" from the start, so later panels (career companion, diary) plug in
   without any migration. Hub data is global (all FM saves share one hub): store key "fm27_hub".
   ========================================================================== */
const HUB_KEY = "fm27_hub";
const HUB_START = {hub:"Hub", fm:"FM27 Dashboard"};
const GAME_STATUS = [["wish","Wunschliste"],["backlog","Backlog"],["playing","Spiele ich"],["done","Durchgespielt"],["dropped","Abgebrochen"]];
const GAME_STATUS_LABEL = Object.fromEntries(GAME_STATUS);
let hub = null, hubView = null;          // hubView: null (hidden) | "home"

function sanitizeHub(raw){
  const r = raw && typeof raw === "object" ? raw : {};
  const S = v => typeof v === "string" ? v : "";
  const games = (Array.isArray(r.games) ? r.games : []).filter(g=>g && typeof g === "object" && S(g.title).trim()).map(g=>({
    id: S(g.id) || uid(), title: S(g.title).trim().slice(0,120), platform: S(g.platform).slice(0,40), genre: S(g.genre).slice(0,40),
    status: GAME_STATUS_LABEL[g.status] ? g.status : "backlog", rating: clamp(Math.round(num(g.rating)), 0, 5),
    hours: Math.max(0, Math.round(num(g.hours) * 10) / 10), estHours: Math.max(0, Math.round(num(g.estHours))),
    started: /^\d{4}-\d{2}-\d{2}$/.test(S(g.started)) ? g.started : "", finished: /^\d{4}-\d{2}-\d{2}$/.test(S(g.finished)) ? g.finished : "",
    tags: (Array.isArray(g.tags) ? g.tags : []).map(t=>S(t).trim().toLowerCase()).filter(Boolean).slice(0,12),
    notes: S(g.notes).slice(0,4000), steamId: S(g.steamId).replace(/\D/g, "").slice(0,12),
    cover: S(g.cover).startsWith("data:image/") && S(g.cover).length < 400000 ? g.cover : "",
    color: /^#[0-9a-fA-F]{6}$/.test(S(g.color)) ? g.color : "", sample: !!g.sample,
    createdAt: num(g.createdAt) || Date.now(), updatedAt: num(g.updatedAt) || Date.now()
  }));
  // 11.5: the game library is gone – own entries stay until the user saves or deletes them; sample games are dropped
  return {v:1, name: (S(r.name).trim() || "Mein Gaming-Hub").slice(0,40), startPanel: HUB_START[r.startPanel] ? r.startPanel : "hub",
    games: games.filter(g=>!g.sample), introSeen: !!r.introSeen};
}
function loadHub(){ hub = sanitizeHub(readJSON(HUB_KEY)); return hub; }
function saveHub(){ try{ store.setItem(HUB_KEY, JSON.stringify(hub)); }catch(e){ toast("Hub konnte nicht gespeichert werden – Speicher voll?"); } hubStartHint(); scheduleFolderBackup(); }
/** 11.8.1: tiny hint OUTSIDE the database – read by the pre-script in index.html before anything is drawn */
function hubStartHint(){ try{ localStorage.setItem("fm27_start_hint", hub && hub.startPanel === "fm" ? "fm" : "hub"); }catch(e){} }
function hubUndo(label, fn){
  const before = JSON.stringify(hub);
  fn(); hub = sanitizeHub(hub); saveHub(); renderHub();
  toast(label, {onUndo:()=>{ hub = sanitizeHub(JSON.parse(before)); saveHub(); renderHub(); }});
}
const hubGreeting = () => { const h = new Date().getHours(); return h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : h < 22 ? "Guten Abend" : "Gute Nacht"; };
/* ---------- 11.6 (Beta): start page – "Weiterspielen" hero, saves, admin, coming modules ---------- */
let hubClockTimer = null;
/* 11.7 (Beta): Admin-Zentrale – the admin element (#adminRoot) is hung into a hub page while it is open
   and parked in its old place otherwise; all its buttons, PIN and auto-lock keep working unchanged. */
const adminVisible = () => hubView === "admin" && !!qs("#hubRoot") && !qs("#hubRoot").hidden;
function parkAdmin(){ const ar = qs("#adminRoot"), home = qs("#view-admin"); if(ar && home && ar.parentElement !== home) home.appendChild(ar); }
function leaveAdmin(next){ if(hubView === "admin" && next !== "admin" && typeof adminCfg === "function" && adminCfg().lockOnLeave) adminUnlocked = false; }
function markPlayed(){ const m = typeof activeSlotMeta === "function" && activeSlotMeta(); if(m){ m.lastPlayedAt = Date.now(); writeIndex(); } }
function ensureHubRoot(){
  let root = qs("#hubRoot"); if(root) return root;
  root = document.createElement("div"); root.id = "hubRoot"; root.className = "hub-root"; root.hidden = true;
  root.setAttribute("role", "region"); root.setAttribute("aria-label", "Gaming-Hub");
  document.body.appendChild(root);
  root.addEventListener("click", hubClick);
  root.addEventListener("change", e=>{ if(hubView === "diary") diaryChange(e); if(hubView === "career") careerChange(e); });
  root.addEventListener("keydown", e=>{ if((e.key === "Enter" || e.key === " ") && e.target.matches("[data-hub-open][tabindex], [data-d-session][tabindex], [data-cr-open][tabindex], [data-cr-season][tabindex], [data-media-card][tabindex], [data-media-link][tabindex]")){ e.preventDefault(); e.target.click(); } });
  return root;
}
function showHub(view){
  if(!hub) loadHub();
  leaveAdmin(view || "home");
  if(view === "admin" && hubView !== "admin") adminTab = adminTab && ADMIN_GLOBAL_TABS.includes(adminTab) ? adminTab : (adminTab || "home");
  hubView = view || "home";
  ensureHubRoot().hidden = false;
  document.body.classList.add("hub-open");
  if(typeof closeMenu === "function") closeMenu();
  renderHub();
  clearInterval(hubClockTimer); hubClockTimer = setInterval(hubTick, 20000);
  clearInterval(diaryTimer); diaryTimer = hubView === "diary" ? setInterval(diaryTick, 1000) : null;
  const f = qs("#hubRoot [data-hub-first]"); if(f) f.focus({preventScroll:true});
  window.scrollTo && window.scrollTo(0, 0);
  document.title = "Nexus Dashboard";
}
function hideHub(){
  leaveAdmin(null); parkAdmin();
  if(state) setAccentVars(isNat() ? state.national.accent : state.club.accent);
  const r = qs("#hubRoot"); if(r) r.hidden = true;
  hubView = null; document.body.classList.remove("hub-open"); clearInterval(hubClockTimer); clearInterval(diaryTimer);
}
function hubTick(){
  const dm = qs("#hubDiaryMeta"); if(dm) dm.innerHTML = diaryTileMeta();
  const t = qs("#hubClockTime"), d = qs("#hubClockDate"); if(!t) return;
  const now = new Date();
  t.textContent = now.toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"});
  d.textContent = now.toLocaleDateString("de-DE", {weekday:"long", day:"numeric", month:"short", year:"numeric"});
}
function openPanel(id){
  if(id === "fm"){ markPlayed(); hideHub(); renderAll(); toast(`FM27 Dashboard · ${esc((activeSlotMeta() || {}).name || state.club.name)}`); return; }
  if(id === "admin") return showHub("admin");
  if(id === "saves") return openSaveMenu();
  if(id === "changelog") return openHubChangelog();
  if(id === "diary") return showHub("diary");
  if(id === "career") return showHub("career");
}
const hubWhen = ts => ts ? relTime(ts) : "noch nie";
function hubHeroStats(){
  const nat = isNat(), n = state.nextMatch, out = [];
  if(nat){
    const nom = state.players.filter(p=>p.nominated).length, r = state.results, w = r.filter(x=>x.gf > x.ga).length, d = r.filter(x=>x.gf === x.ga).length;
    out.push(["Nominiert", `${nom} / ${state.national.maxSquad}`], ["Bilanz", `${w}-${d}-${r.length - w - d}`]);
  } else {
    const b = budgetCalc();
    out.push(["Transfer frei", fmtEUR(b.transferLeft)], ["Taktik", `${activePlan().name} · ${formationLabel(state.formationName)}`]);
  }
  if(n.opponent){
    const days = n.date ? Math.round((parseISO(n.date) - ingameDate()) / 86400000) : null;
    out.push(["Nächstes Spiel", `${n.opponent}${days === 0 ? " · heute" : days === 1 ? " · morgen" : days > 1 ? ` · in ${days} Tagen` : ""}`]);
  }
  return out;
}
/** 11.6.1: full changelog without PIN – the chosen version (or the newest) is open */
function openHubChangelog(v){
  const openV = v || APP_VERSION;
  openModal({title:"Neuigkeiten · Changelog", wide:true, body:`
    <p class="lead" style="margin-top:0">Du nutzt <strong>Version ${esc(APP_VERSION)}</strong> · ${CHANGELOG.length} Versionen.</p>
    <div class="cl-list hub2-cl-modal">${CHANGELOG.map(r=>`
      <details class="cl-entry" ${r.v === openV ? "open" : ""} data-cl-v="${esc(r.v)}">
        <summary><span class="cl-ver">v${esc(r.v)}</span><span class="cl-title">${esc(r.title)}</span>${r.beta ? '<span class="beta-pill">Beta</span>' : ""}${r.v === APP_VERSION ? '<span class="sm-badge ok">aktuell</span>' : ""}</summary>
        <ul>${r.items.map(([t, text])=>`<li><span class="cl-tag t-${t}">${CL_TAG[t]}</span><span>${esc(text)}</span></li>`).join("")}</ul>
      </details>`).join("")}</div>`,
    saveLabel:"Schließen",
    onOpen: m=>{ const el = qs(`[data-cl-v="${CSS.escape ? CSS.escape(openV) : openV}"]`, m); if(el && el.scrollIntoView) el.scrollIntoView({block:"nearest"}); }});
}
function hubAdminRows(){
  const rows = [];
  const c = typeof backupCfg === "function" ? backupCfg() : {};
  const folderOn = typeof backupPerm !== "undefined" && backupPerm === "granted" && c.enabled;
  rows.push(["Ordner-Sicherung", folderOn ? `aktiv · ${hubWhen(c.lastAt)}` : "aus", folderOn ? "ok" : "warn"]);
  const lastExp = Math.max(0, ...slotIndex.slots.map(m=>m.lastExport || 0));
  rows.push(["Letzter Export", hubWhen(lastExp), lastExp && Date.now() - lastExp < 14 * 86400000 ? "ok" : folderOn ? "" : "warn"]);
  const u = storageUsage(), pct = u.quota ? Math.round(u.total / u.quota * 100) : 0;
  rows.push(["Speicher", `${pct} % · ${fmtBytes(u.total)}`, pct >= 80 ? "warn" : "ok"]);
  const errs = (readJSON(ERROR_KEY) || []).length;
  rows.push(["Fehlerprotokoll", errs ? `${errs} Einträge` : "keine Fehler", errs ? "warn" : "ok"]);
  return rows;
}
function renderAdminPage(root){
  if(!qs("#hubAdminHost")){
    parkAdmin();
    root.innerHTML = `<main class="hub-main hub2 hub-admin-page">
      <header class="hub2-head hub-admin-head"><div><button class="btn btn-sm" data-hub="home" title="Zurück zum Hub (Esc)">← Hub</button>
        <h1>🛡 Admin-Zentrale <span class="beta-pill">Beta</span></h1><p class="muted">Allgemeines gilt für alle Spielstände – darunter alles zum aktiven Spielstand.</p></div></header>
      <div id="hubAdminHost"></div></main>`;
  }
  const ar = qs("#adminRoot"); if(ar && ar.parentElement !== qs("#hubAdminHost")) qs("#hubAdminHost").appendChild(ar);
  renderAdmin();
}
/** 12.0: the accent follows the active profile – career colour, colour of the running session, otherwise the club */
function hexOfCss(c){ const el = document.createElement("span"); el.style.color = c; document.body.appendChild(el); const m = getComputedStyle(el).color.match(/\d+/g); el.remove();
  return m ? "#" + m.slice(0,3).map(x=>(+x).toString(16).padStart(2,"0")).join("") : ""; }
function profileAccent(){
  if(hubView === "career" && typeof crView !== "undefined" && crView.id){ const c = crById(crView.id); if(c) return c.accent; }
  if(hubView === "diary" && typeof diary !== "undefined" && diary && diary.running){ const r = diary.running;
    if(r.careerId){ const c = crById(r.careerId); if(c) return c.accent; }
    if(r.slotId){ const s = slotSummaries().find(x=>x.id === r.slotId); if(s && /^#[0-9a-f]{6}$/i.test(s.accent)) return s.accent; }
    if(r.game){ const x = dTarget(r); const m = /background:(hsl\([^)]*\))/.exec(x.crest); if(m){ const hx = hexOfCss(m[1]); if(hx) return hx; } } }
  return isNat() ? state.national.accent : state.club.accent;
}
function applyProfileAccent(){ if(state) setAccentVars(profileAccent()); }
function renderHub(){
  const root = qs("#hubRoot"); if(!root || root.hidden) return;
  applyProfileAccent();
  if(hubView === "admin") return renderAdminPage(root);
  parkAdmin();
  if(hubView === "diary") return renderDiary(root);
  if(hubView === "career") return renderCareer(root);
  const sums = slotSummaries(), cur = sums.find(x=>x.active) || sums[0];
  const metaOf = id => slotIndex.slots.find(m=>m.id === id) || {};
  const recent = sums.slice().sort((a,b)=>(b.active - a.active) || ((metaOf(b.id).lastPlayedAt || b.updatedAt || 0) - (metaOf(a.id).lastPlayedAt || a.updatedAt || 0))).slice(0,4);
  const nat = cur.mode === "national", stripe = cur.colors ? `linear-gradient(90deg, ${cur.colors[0]} 0 33.3%, ${cur.colors[1]} 33.3% 66.6%, ${cur.colors[2]} 66.6%)` : "";
  const now = new Date();
  root.innerHTML = `
    <main class="hub-main hub2 hub3">
      <div class="hub3-layout">
        <div class="hub3-main">
      <header class="hub2-head hub3-head">
        <div><span class="hub2-brand"><img class="nexus-mark" src="nexus.svg" alt="" width="26" height="26"><strong>Nexus</strong><span class="muted">·</span>${esc(hub.name)} <span class="beta-pill">Beta</span></span>
          <h1>${hubGreeting()}!</h1><p class="muted">Dein Command Center ist bereit für die nächste Session.</p></div>
        
      </header>
          <div class="hub2-grid hub3-grid">
        <section class="hub2-hero hub2-click" data-hub-open="fm" style="--hero-accent:${esc(cur.accent)}" aria-label="Weiterspielen – Klick öffnet den Spielstand">
          ${stripe ? `<div class="hub2-hero-stripe" style="background:${stripe}"></div>` : ""}
          <div class="hub2-hero-top">${smCrest(cur, "xl")}<span class="hub2-pill"><i aria-hidden="true"></i>Zuletzt gespielt</span></div>
          <h2>FM27 Dashboard${nat ? " · Nationalteam" : ""}</h2>
          <p class="hub2-hero-sub"><strong>${esc(cur.name)}</strong> · ${esc(cur.club)}${cur.season ? ` (Saison ${esc(cur.season)})` : ""}</p>
          <p class="muted small">Spieldatum ${smDate(cur)} · gespeichert ${hubWhen(cur.updatedAt)}</p>
          <div class="hub2-hero-foot">
            <div class="hub2-stats">${hubHeroStats().map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
            <button class="btn btn-accent hub2-go" data-hub-open="fm" data-hub-first>▶ Weiterspielen</button>
          </div>
        </section>
            <div class="hub3-mods">
        <article class="hub2-card hub2-mod hub2-click" data-hub-open="career" role="button" tabindex="0" aria-label="Karriere-Begleiter öffnen">
          <span class="hub2-mod-icon" aria-hidden="true">🏆</span><h3>Karriere-Begleiter <span class="beta-pill">Beta</span></h3>
          <p class="muted">Liste, Saisonziele und Verlauf für Karrieren in anderen Spielen.</p><span class="hub2-mod-meta">${careerTileMeta()}</span>
        </article>
        <article class="hub2-card hub2-mod hub2-click" data-hub-open="diary" role="button" tabindex="0" aria-label="Spiel-Tagebuch öffnen">
          <span class="hub2-mod-icon" aria-hidden="true">📓</span><h3>Spiel-Tagebuch <span class="beta-pill">Beta</span></h3>
          <p class="muted">Sessions, Challenges und deine Journey-Geschichten.</p><span class="hub2-mod-meta" id="hubDiaryMeta">${diaryTileMeta()}</span>
        </article>
            </div>
          </div>
        <section class="hub2-card hub2-news hub2-click" data-hub-open="changelog" role="button" tabindex="0" aria-label="Neuigkeiten – Klick öffnet den Changelog">
          <div class="hub2-card-head"><h3><span aria-hidden="true">📰</span> Neuigkeiten</h3><span class="muted small">alle ansehen →</span></div>
          <div class="hub2-news-list">${CHANGELOG.slice(0,3).map((r,i)=>`
            <div class="hub2-news-item" data-hub-cl="${esc(r.v)}">
              <div class="hub2-news-top"><span class="cl-ver">v${esc(r.v)}</span>${r.beta ? '<span class="beta-pill">Beta</span>' : ""}${i === 0 ? '<span class="sm-badge ok">aktuell</span>' : ""}</div>
              <strong>${esc(r.title)}</strong>
              <span class="cl-tags">${Object.keys(CL_TAG).map(t=>{ const n = r.items.filter(x=>x[0] === t).length; return n ? `<span class="cl-tag t-${t}">${n} ${CL_TAG[t]}</span>` : ""; }).join("")}</span>
              <p>${esc((r.items[0] || ["",""])[1])}</p>
            </div>`).join("")}</div>
        </section>
        </div>
        <aside class="hub3-rail" aria-label="Seitenleiste">
          <div class="hub3-clockcard"><div class="hub2-side hub3-side">
          <div class="hub2-clock" aria-label="Uhrzeit"><span class="hub2-clock-icon" aria-hidden="true">🕒</span><div><strong id="hubClockTime">${now.toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"})}</strong>
            <span id="hubClockDate">${now.toLocaleDateString("de-DE", {weekday:"long", day:"numeric", month:"short", year:"numeric"})}</span></div></div>
          <div class="hub2-tools"><button class="btn btn-sm" data-hub="settings">⚙ Einstellungen</button><button class="btn btn-sm" data-hub="theme">${layout.theme === "light" ? "🌙 Dunkel" : "☀ Hell"}</button></div>
        </div></div>
        <section class="hub2-card hub2-saves hub2-click" data-hub-open="saves" aria-label="Spielstände – Klick öffnet die Spielstand-Auswahl">
          <div class="hub2-card-head"><h3><span aria-hidden="true">🗂</span> Spielstände</h3><span class="muted small">${sums.length} gespeichert</span></div>
          <div class="hub2-save-list">${recent.map(x=>`
            <button class="hub2-save ${x.active ? "active" : ""}" data-hub-save="${x.id}" title="${x.active ? "Aktiver Spielstand – öffnen" : "Wechseln und öffnen"}">
              ${smCrest(x)}<span class="hub2-save-main"><strong>${esc(x.name)}</strong><span>${esc(x.club)}${x.mode === "national" ? " · Nationalteam" : ""} · ${smDate(x)}</span></span>
              <span class="hub2-save-when">${x.active ? '<span class="sm-badge ok">aktiv</span>' : esc(hubWhen(metaOf(x.id).lastPlayedAt || x.updatedAt))}</span>
            </button>`).join("")}</div>
          <div class="hub2-card-foot"><button class="btn btn-sm" data-hub="saves">Alle Spielstände <kbd>S</kbd></button></div>
        </section>
        <section class="hub2-card hub2-admin hub2-click" data-hub-open="admin" aria-label="Admin und Sicherung – Klick öffnet den Admin-Bereich">
          <div class="hub2-card-head"><h3><span aria-hidden="true">🛡</span> Admin &amp; Sicherung</h3></div>
          <ul class="hub2-admin-rows">${hubAdminRows().map(([k,v,st])=>`<li><span>${esc(k)}</span><strong class="${st}">${esc(v)}</strong></li>`).join("")}</ul>
          <div class="hub2-card-foot"><button class="btn btn-sm" data-hub="admin">Admin öffnen</button><button class="btn btn-sm" data-hub="exportAll" title="Alle Spielstände, Einstellungen und Hub in eine Datei">Alles exportieren</button></div>
        </section>

        </aside>
      </div>
      ${hub.games.length ? `<section class="card hub-legacy" role="note"><div class="card-head"><h2>Spielebibliothek entfernt</h2></div>
        <p class="lead" style="margin:0 0 10px">Die Beta der Spielebibliothek ist wieder raus (dafür gibt es ja Steam). Deine <strong>${hub.games.length} eingetragenen Spiele</strong> sind noch gespeichert – sichere sie als Datei oder lösche sie.</p>
        <div class="adm2-actions"><button class="btn btn-sm" data-hub="legacySave">Als Datei sichern</button><button class="btn btn-sm btn-danger-outline" data-hub="legacyDelete">Endgültig löschen</button></div></section>` : ""}
      <p class="hub-foot muted small">Taste <kbd>H</kbd> öffnet den Hub von überall · ${esc(HUB_START[hub.startPanel])} beim Start · alle Daten bleiben lokal in deinem Browser</p>
    </main>`;
}
/** 11.5: the old library entries as a file (JSON with all fields, cover images included) */
function hubLegacySave(){
  const text = JSON.stringify({app:"FM27 Dashboard", kind:"spielebibliothek", savedAt:new Date().toISOString(), games:hub.games}, null, 2);
  const url = URL.createObjectURL(new Blob([text], {type:"application/json"})), a = document.createElement("a");
  a.href = url; a.download = `fm27_spielebibliothek_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`${hub.games.length} Spiele als Datei gesichert`);
  return text;
}
function hubSettingsModal(){
  openModal({title:"Hub-Einstellungen", body:`
    <div class="field"><label>Name des Hubs</label><input data-f="name" maxlength="40" value="${esc(hub.name)}"></div>
    <div class="field"><label>Beim Start öffnen</label><select data-f="startPanel">${options(HUB_START, hub.startPanel)}</select></div>
    <p class="hint">Der Hub ist für alle Spielstände gleich und in „Alles exportieren (Umzug)“ enthalten.</p>`,
    saveLabel:"Speichern", onSave: get=>{ hubUndo("Hub-Einstellungen gespeichert", ()=>{ hub.name = get("name"); hub.startPanel = get("startPanel"); }); }});
}
function hubClick(e){
  const t = e.target;
  if(hubView === "diary" && diaryClick(e)) return;
  if(hubView === "career" && careerClick(e)) return;
  // 11.6.1: whole panels are clickable – the innermost target wins, so buttons inside a panel only do their own job
  const target = t.closest("[data-hub-save], [data-hub], [data-hub-cl], [data-hub-open]"); if(!target) return;
  if(target.dataset.hubSave){ if(target.dataset.hubSave !== slotIndex.active) switchSlot(target.dataset.hubSave); openPanel("fm"); return; }
  if(target.dataset.hubCl){ openHubChangelog(target.dataset.hubCl); return; }
  if(target.dataset.hubOpen){ openPanel(target.dataset.hubOpen); return; }
  const a = target; if(a.dataset.hub){
    const k = a.dataset.hub;
    if(k === "settings") hubSettingsModal();
    else if(k === "theme"){ toggleTheme(); renderHub(); }
    else if(k === "home") showHub("home");
    else if(k === "fm") openPanel("fm");
    else if(k === "saves") openSaveMenu();
    else if(k === "admin") openPanel("admin");
    else if(k === "exportAll") exportAll();
    else if(k === "legacySave") hubLegacySave();
    else if(k === "legacyDelete") hubUndo(`${hub.games.length} Spiele gelöscht`, ()=>{ hub.games = []; });
    return;
  }
}
/** keys inside the hub (returns true when handled) */
function hubKey(e){
  if(e.key === "Escape" && hubView === "career" && crView.id && !isTyping(e.target)){ e.preventDefault(); crView.id = ""; renderHub(); return true; }
  if(e.key === "Escape" && (hubView === "admin" || hubView === "diary" || hubView === "career") && !isTyping(e.target)){ e.preventDefault(); showHub("home"); return true; }
  return false;
}
/** called once at the end of init() */
function hubInit(firstStart){
  loadHub(); loadDiary(); loadCareer(); dGcImages(); initMedia();
  ensureHubRoot();
  const btn = qs("#btnHub"); if(btn) btn.addEventListener("click", ()=>showHub("home"));
  if(hub.startPanel === "hub") showHub("home"); else markPlayed();
  hubStartHint(); document.documentElement.classList.remove("boot-hub");
}

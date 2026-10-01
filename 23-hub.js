/* ==========================================================================
   GAMING-HUB (11.4) – start page above all panels. The FM dashboard is one panel of several.
   The hub knows "games" from the start, so later panels (library, career companion, diary) plug in
   without any migration. Hub data is global (all FM saves share one hub): store key "fm27_hub".
   ========================================================================== */
const HUB_KEY = "fm27_hub";
const HUB_START = {hub:"Hub", fm:"FM27 Dashboard", library:"Spielebibliothek"};
const GAME_STATUS = [["wish","Wunschliste"],["backlog","Backlog"],["playing","Spiele ich"],["done","Durchgespielt"],["dropped","Abgebrochen"]];
const GAME_STATUS_LABEL = Object.fromEntries(GAME_STATUS);
const GAME_PLATFORMS = ["PC","Steam Deck","PlayStation 5","PlayStation 4","Xbox Series","Xbox One","Nintendo Switch","Switch 2","Mobil","Sonstige"];
let hub = null, hubView = null;          // hubView: null (hidden) | "home" | "library"

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
  return {v:1, name: (S(r.name).trim() || "Mein Gaming-Hub").slice(0,40), startPanel: HUB_START[r.startPanel] ? r.startPanel : "hub",
    games, libView: ["shelf","list","board"].includes(r.libView) ? r.libView : "shelf", libSort: S(r.libSort) || "updated", introSeen: !!r.introSeen};
}
function loadHub(){ hub = sanitizeHub(readJSON(HUB_KEY)); return hub; }
function saveHub(){ try{ store.setItem(HUB_KEY, JSON.stringify(hub)); }catch(e){ toast("Hub konnte nicht gespeichert werden – Speicher voll?"); } }
function hubUndo(label, fn){
  const before = JSON.stringify(hub);
  fn(); hub = sanitizeHub(hub); saveHub(); renderHub();
  toast(label, {onUndo:()=>{ hub = sanitizeHub(JSON.parse(before)); saveHub(); renderHub(); }});
}
const hubGreeting = () => { const h = new Date().getHours(); return h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : h < 22 ? "Guten Abend" : "Gute Nacht"; };
/** colour of a game tile without cover – stable per title */
function gameColor(g){
  if(g.color) return g.color;
  let h = 0; for(const c of g.title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 38%)`;
}
const gameInitials = t => t.replace(/[^A-Za-zÄÖÜäöü0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0,3).map(w=>w[0]).join("").toUpperCase() || "?";

/* ---------- panels of the hub ---------- */
function hubPanels(){
  const meta = (typeof activeSlotMeta === "function" && activeSlotMeta()) || {};
  const g = hub.games, playing = g.filter(x=>x.status === "playing").length, backlog = g.filter(x=>x.status === "backlog").length;
  return [
    {id:"fm", title:"FM27 Dashboard", icon:"⚽", status:"live", desc:"Kader, Taktik, Transfers, Journey, Nationalteam",
      meta: state ? `${esc(meta.name || state.club.name)} · ${esc(state.club.name)} · ${fmtDate(state.club.ingameDate, {day:"2-digit", month:"2-digit", year:"numeric"})}` : ""},
    {id:"library", title:"Spielebibliothek", icon:"🎮", status:"beta", desc:"Alle deine Spiele – Regal, Liste, Board",
      meta: g.length ? `${g.length} Spiele · ${playing} gerade · ${backlog} im Backlog` : "Noch leer – Beispielspiele ansehen?"},
    {id:"career", title:"Karriere-Begleiter", icon:"🏆", status:"soon", desc:"Begleiter für andere Karriere- und Managementspiele", meta:"In Arbeit"},
    {id:"diary", title:"Spiel-Tagebuch", icon:"📓", status:"planned", desc:"Sessions, Challenges, Wochenüberblick", meta:"Geplant"}
  ];
}
function ensureHubRoot(){
  let root = qs("#hubRoot"); if(root) return root;
  root = document.createElement("div"); root.id = "hubRoot"; root.className = "hub-root"; root.hidden = true;
  root.setAttribute("role", "region"); root.setAttribute("aria-label", "Gaming-Hub");
  document.body.appendChild(root);
  root.addEventListener("click", hubClick);
  root.addEventListener("keydown", e=>{ if(e.key === "Enter" && e.target.matches("[data-hub-open]")){ e.preventDefault(); e.target.click(); } });
  return root;
}
function showHub(view){
  if(!hub) loadHub();
  hubView = view || "home";
  ensureHubRoot().hidden = false;
  document.body.classList.add("hub-open");
  if(typeof closeMenu === "function") closeMenu();
  renderHub();
  const f = qs("#hubRoot [data-hub-first]"); if(f) f.focus({preventScroll:true});
  window.scrollTo && window.scrollTo(0, 0);
}
function hideHub(){
  const r = qs("#hubRoot"); if(r) r.hidden = true;
  hubView = null; document.body.classList.remove("hub-open");
}
function openPanel(id){
  if(id === "fm"){ hideHub(); renderAll(); toast(`FM27 Dashboard · ${esc((activeSlotMeta() || {}).name || state.club.name)}`); return; }
  if(id === "library") return showHub("library");
  toast(id === "career" ? "Der Karriere-Begleiter ist als Nächstes dran." : "Das Spiel-Tagebuch ist geplant.");
}
function renderHub(){
  const root = qs("#hubRoot"); if(!root || root.hidden) return;
  if(hubView === "library" && typeof renderLibrary === "function") return renderLibrary(root);
  const panels = hubPanels(), now = hub.games.filter(g=>g.status === "playing").sort((a,b)=>b.updatedAt - a.updatedAt).slice(0,6);
  root.innerHTML = `
    <header class="hub-top">
      <div class="hub-brand"><span class="hub-logo" aria-hidden="true">◆</span><div><strong id="hubName">${esc(hub.name)}</strong><span class="muted small">${hubGreeting()}! Was spielen wir heute?</span></div></div>
      <div class="hub-top-actions">
        <button class="btn btn-sm" data-hub="settings" title="Hub-Einstellungen">⚙ Einstellungen</button>
        <button class="btn btn-sm" data-hub="theme" title="Hell / Dunkel">${layout.theme === "light" ? "🌙 Dunkel" : "☀ Hell"}</button>
      </div>
    </header>
    <main class="hub-main">
      <section class="hub-panels" aria-label="Panels">${panels.map((p,i)=>`
        <article class="hub-tile ${p.status}" ${p.status === "live" || p.status === "beta" ? `role="button" tabindex="0" data-hub-open="${p.id}" ${i === 0 ? "data-hub-first" : ""}` : `aria-disabled="true" data-hub-open="${p.id}"`} aria-label="${esc(p.title)} öffnen">
          <div class="hub-tile-icon" aria-hidden="true">${p.icon}</div>
          <div class="hub-tile-body"><div class="hub-tile-title"><strong>${esc(p.title)}</strong>${p.status === "beta" ? '<span class="beta-pill">Beta</span>' : p.status === "soon" ? '<span class="hub-soon">bald</span>' : p.status === "planned" ? '<span class="hub-soon">geplant</span>' : ""}</div>
            <p>${esc(p.desc)}</p><span class="hub-tile-meta">${p.meta}</span></div>
          ${p.status === "live" || p.status === "beta" ? '<span class="hub-tile-go" aria-hidden="true">→</span>' : ""}
        </article>`).join("")}</section>
      ${now.length ? `<section class="hub-now"><div class="tc-sub-head">Spiele ich gerade</div><div class="hub-now-row">${now.map(g=>`
          <button class="hub-now-card" data-lib-open="${g.id}" title="${esc(g.title)}">${gameCoverHTML(g, "sm")}<span>${esc(g.title)}</span></button>`).join("")}</div></section>` : ""}
      <p class="hub-foot muted small">Taste <kbd>H</kbd> öffnet den Hub von überall · ${esc(HUB_START[hub.startPanel])} beim Start · alle Daten bleiben lokal in deinem Browser</p>
    </main>`;
}
function gameCoverHTML(g, size){
  return g.cover ? `<span class="game-cover ${size || ""}" style="background-image:url('${g.cover}')"></span>`
    : `<span class="game-cover gen ${size || ""}" style="background:linear-gradient(160deg, ${gameColor(g)}, #0b0f18)"><b>${esc(gameInitials(g.title))}</b></span>`;
}
function hubSettingsModal(){
  openModal({title:"Hub-Einstellungen", body:`
    <div class="field"><label>Name des Hubs</label><input data-f="name" maxlength="40" value="${esc(hub.name)}"></div>
    <div class="field"><label>Beim Start öffnen</label><select data-f="startPanel">${options(HUB_START, hub.startPanel)}</select></div>
    <p class="hint">Der Hub ist für alle Spielstände gleich. Die Spielebibliothek ist in „Alles exportieren (Umzug)“ enthalten.</p>`,
    saveLabel:"Speichern", onSave: get=>{ hubUndo("Hub-Einstellungen gespeichert", ()=>{ hub.name = get("name"); hub.startPanel = get("startPanel"); }); }});
}
function hubClick(e){
  const t = e.target;
  const open = t.closest("[data-hub-open]"); if(open){ openPanel(open.dataset.hubOpen); return; }
  const a = t.closest("[data-hub]"); if(a){
    const k = a.dataset.hub;
    if(k === "settings") hubSettingsModal();
    else if(k === "theme"){ toggleTheme(); renderHub(); }
    else if(k === "home") showHub("home");
    else if(k === "fm") openPanel("fm");
    return;
  }
  const lo = t.closest("[data-lib-open]"); if(lo && typeof gameModal === "function"){ gameModal(hub.games.find(g=>g.id === lo.dataset.libOpen)); return; }
  if(typeof libraryClick === "function") libraryClick(e);
}
/** called once at the end of init() */
function hubInit(firstStart){
  loadHub();
  ensureHubRoot();
  const btn = qs("#btnHub"); if(btn) btn.addEventListener("click", ()=>showHub("home"));
  if(hub.startPanel === "hub") showHub("home");
  else if(hub.startPanel === "library") showHub("library");
}

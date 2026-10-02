/* ==========================================================================
   SAVE SLOTS & PERSISTENCE
   ========================================================================== */
let pendingLoadNotice = null;
let slotIndex = null;
let state = null;


/* ==========================================================================
   SPEICHERSCHICHT (11.2) – IndexedDB instead of the ~5 MB localStorage.
   Same interface as localStorage (getItem/setItem/removeItem/key/length). All data is loaded into
   memory once at start, so every read stays synchronous; every write goes straight on to IndexedDB.
   Migration in two phases: 1) copy + verify every value, the old data stays in localStorage;
   2) on the NEXT start, when the database is readable and complete, the old copy is removed.
   Without IndexedDB (some private windows, test environments) everything works as before.
   ========================================================================== */
const STORE_DB = "fm27-dashboard", STORE_OS = "kv", BACKEND_KEY = "fm27_backend";
const store = {
  mode: "local", _map: null, _db: null, _pending: 0, _waiters: [], quota: 5 * 1024 * 1024,
  notice: "", lastError: "",
  get length(){ return this._map ? this._map.size : localStorage.length; },
  key(i){ if(!this._map) return localStorage.key(i); const k = [...this._map.keys()][i]; return k === undefined ? null : k; },
  getItem(k){ if(!this._map) return localStorage.getItem(k); return this._map.has(k) ? this._map.get(k) : null; },
  setItem(k, v){ v = String(v); if(!this._map) return localStorage.setItem(k, v); this._map.set(k, v); this._write(k, v); },
  removeItem(k){ if(!this._map) return localStorage.removeItem(k); this._map.delete(k); this._write(k, null); },
  _write(k, v){
    this._pending++;
    const done = () => { this._pending--; if(!this._pending){ const w = this._waiters; this._waiters = []; w.forEach(f=>f()); } };
    try{
      const tx = this._db.transaction(STORE_OS, "readwrite"), os = tx.objectStore(STORE_OS);
      if(v === null) os.delete(k); else os.put(v, k);
      tx.oncomplete = done;
      tx.onerror = tx.onabort = () => { this._fail(k, tx.error); done(); };
    }catch(e){ this._fail(k, e); done(); }
  },
  _fail(k, err){
    this.lastError = `${k}: ${(err && (err.name || err.message)) || "unbekannt"}`;
    if(typeof logError === "function") logError("Speichern in der Datenbank fehlgeschlagen", this.lastError);
    if(typeof toast === "function") toast("Speichern fehlgeschlagen – bitte „Alles exportieren“ und Speicher prüfen (Admin → Wartung).", {duration:9000});
  },
  /** resolves when every write has reached the database (used before reloading the page) */
  flush(){ return this._pending ? new Promise(r=>this._waiters.push(r)) : Promise.resolve(); },
  /** returns null (stay on localStorage, synchronous) or a promise that resolves when the data is ready */
  init(){
    let idb = null;
    try{ idb = (typeof indexedDB !== "undefined") ? indexedDB : null; }catch(e){ idb = null; }
    if(!idb) return null;
    const lsKeys = () => { const out = []; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(k && k.startsWith("fm27") && k !== BACKEND_KEY && k !== "fm27_theme_hint") out.push(k); } return out; };
    const reqP = r => new Promise((res, rej)=>{ r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const txP = tx => new Promise((res, rej)=>{ tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
    const readAll = async db => { const tx = db.transaction(STORE_OS, "readonly"), os = tx.objectStore(STORE_OS);
      const [keys, vals] = await Promise.all([reqP(os.getAllKeys()), reqP(os.getAll())]); return new Map(keys.map((k,i)=>[k, vals[i]])); };
    const open = new Promise((res, rej)=>{
      const r = idb.open(STORE_DB, 1);
      r.onupgradeneeded = () => { if(!r.result.objectStoreNames.contains(STORE_OS)) r.result.createObjectStore(STORE_OS); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("blocked"));
    });
    const timeout = new Promise((_, rej)=>setTimeout(()=>rej(new Error("timeout")), 4000));
    return Promise.race([open, timeout]).then(async db=>{
      let map = await readAll(db);
      const marker = localStorage.getItem(BACKEND_KEY), old = lsKeys();
      if(!map.size && old.length){
        // phase 1: copy everything, then compare every single value
        const tx = db.transaction(STORE_OS, "readwrite"), os = tx.objectStore(STORE_OS);
        old.forEach(k=>os.put(localStorage.getItem(k), k));
        await txP(tx);
        map = await readAll(db);
        const bad = old.filter(k=>map.get(k) !== localStorage.getItem(k));
        if(bad.length) throw new Error(`Prüfung fehlgeschlagen bei ${bad.length} Einträgen`);
        localStorage.setItem(BACKEND_KEY, "idb-pending");
        this.notice = `migrated:${old.length}`;
      } else if(map.size && marker === "idb-pending"){
        // phase 2: database readable and complete → remove the old copy
        const idx = (()=>{ try{ return JSON.parse(map.get(SLOT_INDEX_KEY) || "null"); }catch(e){ return null; } })();
        const complete = idx && Array.isArray(idx.slots) && idx.slots.every(x=>map.has(SLOT_PREFIX + x.id));
        if(complete){ old.forEach(k=>localStorage.removeItem(k)); localStorage.setItem(BACKEND_KEY, "idb"); this.notice = `cleaned:${old.length}`; }
      } else if(!map.size && !old.length){
        localStorage.setItem(BACKEND_KEY, "idb");                     // fresh start directly in the database
      }
      this._db = db; this._map = map; this.mode = "idb";
      db.onversionchange = () => db.close();
      try{
        if(navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e=>{ if(e && e.quota) this.quota = e.quota; }).catch(()=>{});
        if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});   // ask the browser not to evict the data
      }catch(e){}
    }).catch(err=>{
      // stay on localStorage – but never silently: data may still sit in the database
      this.mode = "local"; this._map = null;
      this.notice = localStorage.getItem(BACKEND_KEY) === "idb" ? "unavailable-data" : "unavailable";
      this.lastError = (err && (err.message || err.name)) || "unbekannt";
    });
  }
};

function readJSON(key){
  try{ const raw = store.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch(e){ return undefined; } // undefined = present but corrupt
}
function writeIndex(){
  try{ store.setItem(SLOT_INDEX_KEY, JSON.stringify(slotIndex)); }catch(e){ /* reported by saveState */ }
}

function loadSlotIndex(){
  const idx = readJSON(SLOT_INDEX_KEY);
  if(idx && Array.isArray(idx.slots) && idx.slots.length){
    slotIndex = idx;
    if(!slotIndex.slots.some(s=>s.id===slotIndex.active)) slotIndex.active = slotIndex.slots[0].id;
    return;
  }
  // First start with this version: adopt a legacy single save if present.
  const id = uid();
  slotIndex = {active:id, slots:[{id, name:"Karriere 1", updatedAt:Date.now()}]};
  const legacy = readJSON(LEGACY_KEY);
  if(legacy && Array.isArray(legacy.players)){
    const from = num(legacy.version, 1);
    const migrated = migrateState(legacy);
    store.setItem(SLOT_PREFIX+id, JSON.stringify(migrated));
    slotIndex.slots[0].name = migrated.club.name;
    pendingLoadNotice = `Bisherigen Spielstand übernommen und aktualisiert (v${from} → v${SCHEMA_VERSION}).`;
  }
  writeIndex();
}

function loadSlot(id){
  const raw = readJSON(SLOT_PREFIX+id);
  if(raw === undefined){
    // 10.0: keep the damaged original – the next save would otherwise overwrite it for good
    const text = store.getItem(SLOT_PREFIX+id);
    const rescueKey = `fm27_rescue_${id}_${Date.now()}`;
    try{ if(text) store.setItem(rescueKey, text); }catch(e){}
    pendingLoadNotice = "Spielstand war beschädigt – Beispieldaten geladen. Das beschädigte Original ist gesichert (Admin → Wartung → „bitte prüfen“); ein Backup-Import stellt deine Daten wieder her.";
    logError("Spielstand beschädigt", rescueKey);
    return freshState("sample");
  }
  if(!raw) return freshState("sample");
  const from = num(raw.version, 1);
  const s = migrateState(raw);
  if(from < SCHEMA_VERSION){
    pendingLoadNotice = `Datenstruktur automatisch aktualisiert (v${from} → v${SCHEMA_VERSION}).`;
    try{ store.setItem(SLOT_PREFIX+id, JSON.stringify(s)); }catch(e){}
  }
  return s;
}

function activeSlotMeta(){ return slotIndex.slots.find(s=>s.id===slotIndex.active); }

function setSaveStatus(status){
  const pill = qs("#saveStatus"), text = qs("#saveStatusText");
  if(!pill) return;
  pill.classList.remove("pending","error");
  if(status === "pending"){ pill.classList.add("pending"); text.textContent = "Speichert…"; }
  else if(status === "error"){ pill.classList.add("error"); text.textContent = "Nicht gespeichert"; }
  else text.textContent = "Gespeichert";
}

let _saveTimer = null;
function saveState(){
  clearTimeout(_saveTimer);
  try{
    recordPlayerHistory();   // Spielerentwicklung: Schnappschuss bei Änderung von Einschätzung, Gehalt oder Wert
    logChanges();            // change log: diff against the last saved state
    store.setItem(SLOT_PREFIX+slotIndex.active, JSON.stringify(state));
    scheduleFolderBackup();
    const meta = activeSlotMeta();
    if(meta) meta.updatedAt = Date.now();
    writeIndex();
    setSaveStatus("saved");
  }catch(e){
    console.error("Save failed", e);
    setSaveStatus("error");
    toast("Speichern fehlgeschlagen – Browser-Speicher voll oder blockiert. Bitte exportieren.");
  }
}
function scheduleSave(delay=450){
  setSaveStatus("pending");
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, delay);
}
// Flush pending typing before the tab closes.
window.addEventListener("beforeunload", ()=>{ if(_saveTimer) saveState(); });

function switchSlot(id){
  if(_saveTimer) saveState();
  slotIndex.active = id;
  writeIndex();
  state = loadSlot(id);
  resetLogBase();                 // the log compares within one save only
  selectedSlot = null;
  if(adminVisible()) lockAdmin();
  renderAll();
  if(pendingLoadNotice){ toast(pendingLoadNotice); pendingLoadNotice = null; }
}
function createSlot(name, data){
  const id = uid();
  slotIndex.slots.push({id, name, updatedAt:Date.now()});
  store.setItem(SLOT_PREFIX+id, JSON.stringify(data));
  writeIndex();
  return id;
}

/* ==========================================================================
   ADMIN: PIN, CHANGE LOG, RESTORE POINTS
   ========================================================================== */
const ADMIN_KEY  = "fm27_admin";      // global: PIN hash + settings (not per save)
const LOG_PREFIX = "fm27_log_";       // per save
const RP_PREFIX  = "fm27_rp_";        // per save
const LOG_MAX = 1500, RP_MAX_AUTO = 10, RP_MAX_MANUAL = 10;

/* ---------- SHA-256 (pure JS: works on file:// and without WebCrypto) ---------- */
const _K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256hex(str){
  const bytes = new TextEncoder().encode(str);
  const len = bytes.length, bitLen = len * 8;
  const total = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 4, bitLen >>> 0); dv.setUint32(total - 8, Math.floor(bitLen / 2**32));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x,n) => (x >>> n) | (x << (32 - n));
  for(let o = 0; o < total; o += 64){
    for(let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i*4);
    for(let i = 16; i < 64; i++){
      const s0 = rotr(W[i-15],7) ^ rotr(W[i-15],18) ^ (W[i-15] >>> 3);
      const s1 = rotr(W[i-2],17) ^ rotr(W[i-2],19) ^ (W[i-2] >>> 10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for(let i = 0; i < 64; i++){
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25), ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + _K[i] + W[i]) >>> 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22), mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0]+=a; H[1]+=b; H[2]+=c; H[3]+=d; H[4]+=e; H[5]+=f; H[6]+=g; H[7]+=h;
  }
  return Array.from(H, x => x.toString(16).padStart(8,"0")).join("");
}

/* ---------- Admin PIN ----------
   Honest scope: this locks the admin area against accidents and curious co-users.
   Everything runs in the browser, so it is not protection against someone with dev tools. */
const PIN_ITER = 8000;
let adminUnlocked = false, adminLastActivity = 0;
function adminCfg(){
  const c = readJSON(ADMIN_KEY);
  return (c && typeof c === "object") ? c : {};
}
function saveAdminCfg(c){ try{ store.setItem(ADMIN_KEY, JSON.stringify(c)); }catch(e){} }
function hashPin(pin, salt, iter){
  let h = sha256hex(salt + ":" + pin);
  for(let i = 0; i < iter; i++) h = sha256hex(h + salt);
  return h;
}
function randomSalt(){
  const a = new Uint8Array(16);
  (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(a) : a.forEach((_,i)=>a[i] = Math.random()*256|0);
  return Array.from(a, x=>x.toString(16).padStart(2,"0")).join("");
}
const hasPin = () => !!adminCfg().hash;
function setPin(pin){
  const c = adminCfg(), salt = randomSalt();
  Object.assign(c, {salt, iter:PIN_ITER, hash:hashPin(pin, salt, PIN_ITER), failed:0, lockedUntil:0, setAt:Date.now()});
  if(!c.autoLockMin) c.autoLockMin = 10;
  saveAdminCfg(c);
}
/** → "ok" | "wrong" | "wait:<seconds>" */
function checkPin(pin){
  const c = adminCfg();
  if(c.lockedUntil && Date.now() < c.lockedUntil) return "wait:" + Math.ceil((c.lockedUntil - Date.now())/1000);
  if(c.hash && hashPin(pin, c.salt, c.iter || PIN_ITER) === c.hash){
    c.failed = 0; c.lockedUntil = 0; saveAdminCfg(c);
    adminUnlocked = true; adminLastActivity = Date.now();
    return "ok";
  }
  c.failed = (c.failed || 0) + 1;
  if(c.failed >= 5){ c.lockedUntil = Date.now() + 30000; c.failed = 0; }
  saveAdminCfg(c);
  return c.lockedUntil && Date.now() < c.lockedUntil ? "wait:30" : "wrong";
}
function lockAdmin(){
  if(typeof saveCurrentNote === "function") saveCurrentNote(); adminUnlocked = false; if(adminVisible()) renderAdmin(); }
function adminAutoLockCheck(){
  const min = adminCfg().autoLockMin || 10;
  if(adminUnlocked && min > 0 && Date.now() - adminLastActivity > min*60000){ lockAdmin(); toast("Admin-Bereich automatisch gesperrt"); }
}

/* ---------- Change log (diff of saved states) ---------- */
let logBase = null;              // last saved state of the active save (deep copy)
const LOG_COLLECTIONS = {
  opponents:{label:"Gegner-Datenbank", name:o=>o.name},
  players:{label:"Spieler", name:o=>o.name}, scouting:{label:"Transferziel", name:o=>o.name},
  prospects:{label:"Talent", name:o=>o.name}, loans:{label:"Leihe", name:o=>o.name},
  sales:{label:"Verkauf", name:o=>{ const p = state.players.find(x=>x.id===o.playerId); return p ? p.name : "Spieler"; }},
  results:{label:"Ergebnis", name:o=>`${o.opponent} ${o.gf}:${o.ga}`}, transferLog:{label:"Transfer-Historie", name:o=>o.name},
  balanceLog:{label:"Kontostand", name:o=>o.date}, boardGoals:{label:"Vorstandsziel", name:o=>o.title},
  todos:{label:"Aufgabe", name:o=>o.text || "(leer)"}, seasons:{label:"Saison-Archiv", name:o=>o.season}
};
const FIELD_LABEL = {homeClub:"Stammverein", caps:"Länderspiele", intGoals:"Länderspieltore", nominated:"Nominiert", nation:"Land", valueMin:"Transferwert von", valueMax:"Transferwert bis", name:"Name", pos:"Position", altPos:"Nebenpositionen", age:"Alter", birthDate:"Geburtsdatum", salary:"Gehalt",
  contractUntil:"Vertrag bis", squadRole:"Kaderrolle", rating:"Einschätzung", status:"Status", note:"Notiz", extendPlanned:"Verlängerung geplant",
  fee:"Ablöse", bonus:"Handgeld", wage:"Gehalt", grade:"Grade", priority:"Priorität", price:"Erwarteter Erlös", amount:"Kontostand",
  current:"Aktuell", potential:"Potenzial", pathway:"Weg", focus:"Trainingsfokus", readyBy:"Bereit bis", club:"Verein", league:"Liga",
  until:"Bis", apps:"Einsätze", minutes:"Minuten", clause:"Klausel", recallCheck:"Rückruf prüfen", title:"Titel", category:"Kategorie",
  target:"Vorgabe", text:"Text", done:"Erledigt", opponent:"Gegner", gf:"Tore", ga:"Gegentore", oppFormation:"Gegnerformation",
  transferBudget:"Transferbudget", wageBudget:"Gehaltsbudget", salesShare:"Budget-Anteil Verkäufe", ingameDate:"Spieldatum", season:"Saison",
  crest:"Kürzel", accent:"Akzentfarbe", wageUnit:"Gehaltseinheit", numberFormat:"Zahlenformat", moneyDisplay:"Betragsanzeige", windows:"Transferfenster",
  competition:"Wettbewerb", venue:"Ort", formation:"Formation", keyThreat:"Gefährlichster Spieler", matchplan:"Matchplan", weaknesses:"Schwachstellen",
  planId:"Taktik-Plan", subs:"Wechselplan", date:"Datum", notes:"Langzeitstrategie", summary:"Fazit", position:"Platzierung"};
const MONEY_FIELDS = new Set(["fee","bonus","price","amount","transferBudget","valueMin","valueMax"]);
const WAGE_FIELDS = new Set(["salary","wage","wageBudget"]);

function logKey(){ return LOG_PREFIX + slotIndex.active; }
function readLog(){ const l = readJSON(logKey()); return Array.isArray(l) ? l : []; }
function writeLog(list){
  try{ store.setItem(logKey(), JSON.stringify(list.slice(-LOG_MAX))); }
  catch(e){ try{ store.setItem(logKey(), JSON.stringify(list.slice(-300))); }catch(e2){} }
}
function resetLogBase(){ logBase = state ? JSON.parse(JSON.stringify(state)) : null; }
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

function diffStates(a, b){
  const out = [];
  const push = e => out.push(Object.assign({id:uid(), ts:Date.now(), gameDate:b.club.ingameDate}, e));
  Object.entries(LOG_COLLECTIONS).forEach(([coll, def])=>{
    const A = new Map((a[coll]||[]).map((o,i)=>[o.id, {o,i}])), B = new Map((b[coll]||[]).map(o=>[o.id, o]));
    B.forEach((o, id)=>{
      const prev = A.get(id);
      if(!prev){ push({area:def.label, action:"add", coll, entityId:id, entity:def.name(o), after:o, revertible:true}); return; }
      new Set(Object.keys(prev.o).concat(Object.keys(o))).forEach(k=>{
        if(k === "id" || same(prev.o[k], o[k])) return;
        if(coll === "players" && k === "age" && o.birthDate) return;          // derived from the date
        if(k === "custom"){                                                     // one entry per custom field
          const A2 = prev.o.custom || {}, B2 = o.custom || {};
          new Set(Object.keys(A2).concat(Object.keys(B2))).forEach(fid=>{
            if(same(A2[fid], B2[fid])) return;
            push({area:def.label, action:"change", coll, entityId:id, entity:def.name(o), field:"cf:" + fid, from:A2[fid], to:B2[fid], revertible:true});
          });
          return;
        }
        push({area:def.label, action:"change", coll, entityId:id, entity:def.name(o), field:k, from:prev.o[k], to:o[k], revertible:true});
      });
    });
    A.forEach(({o,i}, id)=>{ if(!B.has(id)) push({area:def.label, action:"remove", coll, entityId:id, entity:def.name(o), before:o, index:i, revertible:true}); });
  });
  ["name","crest","accent","ingameDate","season","transferBudget","wageBudget","salesShare","wageUnit","numberFormat","moneyDisplay","windows"].forEach(k=>{
    if(!same(a.club[k], b.club[k])) push({area:"Verein", action:"change", path:"club", field:k, entity:b.club.name, from:a.club[k], to:b.club[k], revertible:true});
  });
  Object.keys(Object.assign({}, a.nextMatch, b.nextMatch)).forEach(k=>{
    if(!same(a.nextMatch[k], b.nextMatch[k])) push({area:"Spieltag", action:"change", path:"nextMatch", field:k, entity:b.nextMatch.opponent || "Nächstes Spiel", from:a.nextMatch[k], to:b.nextMatch[k], revertible:true});
  });
  if(a.notes !== b.notes) push({area:"Notizen", action:"change", path:"", field:"notes", entity:"Langzeitstrategie", from:a.notes, to:b.notes, revertible:true});
  const tac = s => JSON.stringify([s.formationName, s.tactics, s.customFormation, s.plans, s.activePlanId]);
  if(tac(a) !== tac(b)){
    const pa = (a.plans||[]).find(x=>x.id===a.activePlanId), pb = (b.plans||[]).find(x=>x.id===b.activePlanId);
    const text = a.activePlanId !== b.activePlanId ? `Plan gewechselt: ${pa?pa.name:"?"} → ${pb?pb.name:"?"}`
      : a.formationName !== b.formationName ? `Formation: ${formationLabel(a.formationName, a)} → ${formationLabel(b.formationName, b)}`
      : (a.plans||[]).length !== (b.plans||[]).length ? `Taktik-Pläne: ${(a.plans||[]).length} → ${(b.plans||[]).length}` : "Aufstellung/Rollen geändert";
    push({area:"Taktik", action:"info", entity:pb ? pb.name : "Taktik", text, revertible:false});
  }
  if(!same(a.lists, b.lists)) push({area:"Listen", action:"info", entity:"Auswahllisten", text:"Auswahllisten angepasst", revertible:false});
  if(!same(a.customFields, b.customFields)){
    const an = (a.customFields||[]).map(f=>f.name), bn = (b.customFields||[]).map(f=>f.name);
    const added = bn.filter(n=>!an.includes(n)), removed = an.filter(n=>!bn.includes(n));
    push({area:"Eigene Felder", action:"info", entity:"Felder", revertible:false,
      text: added.length ? `Feld angelegt: ${added.join(", ")}` : removed.length ? `Feld gelöscht: ${removed.join(", ")}` : "Feld-Einstellungen geändert"});
  }
  if(!same([a.setPieces, a.penaltyOrder], [b.setPieces, b.penaltyOrder])) push({area:"Standards", action:"info", entity:"Standards", text:"Standard-Zuordnung geändert", revertible:false});
  return out;
}

/** Called from saveState(): appends readable entries, merges rapid edits of the same field. */
function logChanges(){
  if(!logBase || !state){ resetLogBase(); return; }
  let entries = diffStates(logBase, state);
  resetLogBase();
  if(!entries.length) return;
  const log = readLog();
  if(entries.length > 40){
    log.push({id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, area:"Daten", action:"info", entity:"Spielstand",
      text:`Umfangreiche Änderung (${entries.length} Einzeländerungen, z. B. Import oder Zurücksetzen)`, revertible:false});
    writeLog(log); return;
  }
  entries.forEach(e=>{
    const last = log[log.length-1];
    if(last && e.action === "change" && last.action === "change" && !last.reverted && last.coll === e.coll && last.path === e.path
       && last.entityId === e.entityId && last.field === e.field && e.ts - last.ts < 90000){
      last.to = e.to; last.ts = e.ts; last.entity = e.entity;              // typing → one entry
      if(same(last.from, last.to)) log.pop();                             // edited back to the start
      return;
    }
    log.push(e);
  });
  writeLog(log);
}

function fmtLogValue(field, v){
  if(field === "status" && (v === "" || STATUS[v] !== undefined)) return STATUS[v || ""];   // "" means "Verfügbar"
  if(v === undefined || v === null || v === "") return "—";
  if(WAGE_FIELDS.has(field) && typeof v === "number") return fmtWage(v);
  if(MONEY_FIELDS.has(field) && typeof v === "number") return fmtEUR(v);
  if(field === "squadRole" && SQUAD_ROLES[v]) return SQUAD_ROLES[v];
  if(field === "rating" || field === "current" || field === "potential") return "★".repeat(v);
  if(field === "salesShare") return v + " %";
  if(field === "planId"){ const pl = state.plans.find(x=>x.id===v); return pl ? pl.name : "aktiver Plan"; }
  if(typeof v === "boolean") return v ? "ja" : "nein";
  if(Array.isArray(v)) return field === "subs" ? `${v.length} Wechsel` : (v.join(", ") || "—");
  if(typeof v === "object") return field === "windows" ? `${v.summer} / ${v.winter}` : "…";
  if(parseISO(v)) return fmtDate(v, {day:"2-digit", month:"2-digit", year:"numeric"});
  const t = String(v).replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0,47) + "…" : t;
}
function logText(e){
  if(e.action === "info") return e.text;
  if(e.field && e.field.startsWith("cf:")){
    const def = cfById(e.field.slice(3));
    const f = v => def ? cfText(def, v) : (v === undefined ? "—" : String(v));
    return `${def ? def.name : "Eigenes Feld"} · ${e.entity}: ${f(e.from)} → ${f(e.to)}`;
  }
  if(e.action === "add") return `${e.area} angelegt: ${e.entity}`;
  if(e.action === "remove") return `${e.area} gelöscht: ${e.entity}`;
  return `${FIELD_LABEL[e.field] || e.field} · ${e.entity}: ${fmtLogValue(e.field, e.from)} → ${fmtLogValue(e.field, e.to)}`;
}

/** Takes one log entry back. Only if the value is still what the entry set (otherwise newer changes would be lost). */
function revertLogEntry(entryId){
  const log = readLog(), e = log.find(x=>x.id === entryId);
  if(!e || !e.revertible || e.reverted) return false;
  const holder = e.coll ? null : (e.path === "club" ? state.club : e.path === "nextMatch" ? state.nextMatch : state);
  if(e.action === "change"){
    const obj = e.coll ? state[e.coll].find(o=>o.id === e.entityId) : holder;
    if(!obj){ toast(`${e.entity} existiert nicht mehr – über einen Wiederherstellungspunkt zurückholen.`); return false; }
    // custom fields keep their value in obj.custom – the general check below is for normal fields only
    if(!e.field.startsWith("cf:") && !same(obj[e.field], e.to)){ toast(`Inzwischen erneut geändert (jetzt: ${fmtLogValue(e.field, obj[e.field])}). Erst die neuere Änderung zurücknehmen.`, {duration:4500}); return false; }
    if(e.field.startsWith("cf:")){
      const fid = e.field.slice(3); obj.custom = obj.custom || {};
      if(!same(obj.custom[fid], e.to)){ toast(`Inzwischen erneut geändert. Erst die neuere Änderung zurücknehmen.`, {duration:4500}); return false; }
      if(e.from === undefined) delete obj.custom[fid]; else obj.custom[fid] = e.from;
    }
    else if(e.coll === "players" && e.field === "birthDate"){ obj.birthDate = e.from; }
    else obj[e.field] = JSON.parse(JSON.stringify(e.from === undefined ? null : e.from));
  } else if(e.action === "add"){
    const list = state[e.coll];
    if(!list.some(o=>o.id === e.entityId)){ toast("Bereits entfernt."); return false; }
    state[e.coll] = list.filter(o=>o.id !== e.entityId);
  } else if(e.action === "remove"){
    if(state[e.coll].some(o=>o.id === e.entityId)){ toast("Eintrag ist bereits wieder da."); return false; }
    state[e.coll].splice(clamp(e.index || 0, 0, state[e.coll].length), 0, JSON.parse(JSON.stringify(e.before)));
  }
  state = sanitizeState(state);
  if(e.path === "club" && e.field === "ingameDate") state.players.forEach(p=>{ if(p.birthDate) p.age = clamp(ageOn(p.birthDate, ingameDate()), 14, 45); });
  saveState();                                                     // logs the revert itself
  const log2 = readLog(), orig = log2.find(x=>x.id === entryId);
  if(orig){ orig.reverted = true; writeLog(log2); }
  renderAll();
  return true;
}
function undoLastChange(){
  const log = readLog();
  for(let i = log.length-1; i >= 0; i--){
    const e = log[i];
    if(e.reverted || e.revertOf) continue;
    if(!e.revertible){ toast(`Letzte Änderung („${logText(e)}“) ist nicht einzeln rücknehmbar – Wiederherstellungspunkt im Admin-Bereich nutzen.`, {duration:5000}); return; }
    const before = readLog().length;
    if(revertLogEntry(e.id)){
      const l = readLog(); l.slice(before).forEach(x=>x.revertOf = e.id); writeLog(l);   // hide the revert from the next Strg+Z
      toast(`Zurückgenommen: ${logText(e)}`);
    }
    return;
  }
  toast("Nichts zum Zurücknehmen.");
}

/* ---------- Restore points ---------- */
function rpKey(){ return RP_PREFIX + slotIndex.active; }
function readRestorePoints(){ const l = readJSON(rpKey()); return Array.isArray(l) ? l : []; }
function createRestorePoint(reason, manual){
  if(!state) return null;
  const list = readRestorePoints();
  const data = JSON.stringify(state);
  const rp = {id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, season:state.club.season, reason, manual:!!manual, size:data.length, data};
  list.unshift(rp);
  const autos = list.filter(x=>!x.manual), manuals = list.filter(x=>x.manual);
  let keep = list.filter(x=> x.manual ? manuals.indexOf(x) < RP_MAX_MANUAL : autos.indexOf(x) < RP_MAX_AUTO);
  for(let tries = 0; tries < 12; tries++){
    try{ store.setItem(rpKey(), JSON.stringify(keep)); return rp; }
    catch(e){                                           // storage full → drop the oldest automatic point
      const idx = keep.map(x=>!x.manual).lastIndexOf(true);
      if(idx <= 0) break;
      keep.splice(idx, 1);
    }
  }
  return null;
}
/** Automatic points on date jumps: at most one per 7 in-game days or 30 real minutes. */
function autoRestorePoint(reason){
  const last = readRestorePoints().find(x=>!x.manual);
  if(last){
    const days = Math.abs((ingameDate() - (parseISO(last.gameDate) || ingameDate()))/86400000);
    if(days < 7 && Date.now() - last.ts < 30*60000) return null;
  }
  return createRestorePoint(reason);
}
function restoreFromPoint(id){
  const rp = readRestorePoints().find(x=>x.id === id);
  if(!rp) return false;
  createRestorePoint("Vor Wiederherstellung");
  state = migrateState(JSON.parse(rp.data));
  selectedSlot = null;
  resetLogBase();
  const log = readLog();
  log.push({id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, area:"Daten", action:"info", entity:"Spielstand",
    text:`Wiederherstellungspunkt geladen: ${rp.reason} (${new Date(rp.ts).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})})`, revertible:false});
  writeLog(log);
  saveState(); renderAll();
  return true;
}

/* ---------- Backup reminder ---------- */
function backupReminder(){
  const meta = activeSlotMeta(); if(!meta) return;
  if(backupPerm === "granted" && backupCfg().enabled) return;          // automatic folder backup is running
  const since = readLog().filter(e=>e.ts > (meta.lastExport || 0)).length;
  const days = meta.lastExport ? Math.floor((Date.now() - meta.lastExport)/86400000) : null;
  if(since >= 25 && (days === null || days >= 7)){
    toast(days === null ? `Noch kein Backup dieses Spielstands – ${since} Änderungen seitdem.` : `Letztes Backup vor ${days} Tagen – ${since} Änderungen seitdem.`,
      {actionLabel:"Jetzt exportieren", onUndo:()=>qs("#btnExport").click(), duration:9000});
  }
}


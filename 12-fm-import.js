/* ==========================================================================
   IMPORT FROM FM (text / web page / CSV) — parsing & matching
   ========================================================================== */
/** Turns FM "print to text" (| separated), FM "print to web page" (HTML table) or CSV/TSV into rows of cells. */
function parseTable(text){
  text = String(text || "").replace(/^\uFEFF/, "");
  if(/<table[\s>]/i.test(text)){
    const doc = new DOMParser().parseFromString(text, "text/html");
    const tables = [...doc.querySelectorAll("table")].sort((a,b)=>b.rows.length - a.rows.length);
    if(!tables.length) return [];
    return [...tables[0].rows].map(tr=>[...tr.cells].map(c=>c.textContent.replace(/\s+/g," ").trim()));
  }
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.filter(l=>l.includes("|")).length >= 2){
    return lines.filter(l=>l.includes("|") && !/^[\s|:+=-]+$/.test(l))
      .map(l=>l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c=>c.trim()));
  }
  // CSV / TSV: pick the delimiter that splits the header into the most columns
  const delim = ["\t",";",","].map(d=>({d, n:splitCSVLine(lines[0]||"", d).length})).sort((a,b)=>b.n-a.n)[0].d;
  return lines.map(l=>splitCSVLine(l, delim).map(c=>c.trim()));
}
function splitCSVLine(line, d){
  const out = []; let cur = "", q = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(q){ if(ch === '"' && line[i+1] === '"'){ cur += '"'; i++; } else if(ch === '"') q = false; else cur += ch; }
    else if(ch === '"') q = true;
    else if(ch === d){ out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const IMPORT_TARGETS = {"":"— ignorieren —", name:"Name", pos:"Position(en)", altPos:"Nebenpositionen", age:"Alter", birthDate:"Geburtsdatum",
  salary:"Gehalt", value:"Transferwert", nation:"Land / Nationalität", contractUntil:"Vertrag bis", squadRole:"Kaderrolle / Kaderstatus", rating:"Einschätzung (1–5)", status:"Status", note:"Notiz",
  homeClub:"Stammverein", caps:"Länderspiele", intGoals:"Länderspieltore"};
const COLUMN_SYNONYMS = {
  name:["name","spieler","player","spielername"], pos:["position","pos","positionen","positions","bestepos","bestpos","bestposition"],
  altPos:["nebenpositionen","nebenpos","altpos"], age:["alter","age"],
  birthDate:["geburtsdatum","geb","gebdatum","dob","dateofbirth","geboren","born","birthdate"],
  salary:["gehalt","wage","lohn","gage","einkommen","salary","gehaltprojahr","gehaltjahr","gehaltpromonat","gehaltprowoche"],
  contractUntil:["vertragsende","vertragbis","vertrag","expires","contractexpires","contract","vertragendet","endet","ablauf","vertragslaufzeit"],
  squadRole:["kaderrolle","kaderstatus","squadstatus"],
  value:["transferwert","wert","value","marktwert","transfervalue","schatzwert","schaetzwert","geschatzterwert"],
  nation:["land","nation","nationalitat","nationalitaet","nat","nationality","staatsangehorigkeit","herkunft"], rating:["einschatzung","einschaetzung","rating","bewertung"],
  status:["status"], note:["notiz","note","notes","notizen"],
  homeClub:["stammverein","verein","club","klub","aktuellerverein","team"],
  caps:["landerspiele","laenderspiele","intcaps","caps","internationals","intapps","lsp"],
  intGoals:["landerspieltore","laenderspieltore","intgoals","inttore","internationalgoals"]
};
const normKey = t => String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z]/g,"");
/** Built-in targets plus the custom squad fields ("cf:<id>"). */
function importTargets(){
  const t = Object.assign({}, IMPORT_TARGETS);
  cfDefs("squad").forEach(d=>{ t["cf:" + d.id] = `Eigenes Feld: ${d.name}`; });
  return t;
}
function guessMapping(header){
  const used = new Set();
  return header.map(h=>{
    const k = normKey(h);
    // a column named like a custom field (e.g. "Homegrown") goes straight into that field
    const cf = cfDefs("squad").find(d=>!used.has("cf:" + d.id) && normKey(d.name) === k);
    if(cf){ used.add("cf:" + cf.id); return "cf:" + cf.id; }
    const hit = Object.entries(COLUMN_SYNONYMS).find(([t, syn])=>!used.has(t) && syn.includes(k));
    if(hit){ used.add(hit[0]); return hit[0]; }
    return "";
  });
}

/** FM positions → dashboard positions. "D (RLC), DM" → [IV, LV, RV, DM]; "M/AM (R)" → [RF]; German "V (Z)", "OM (L)", "TW". */
function parseFMPositions(text){
  const out = [];
  const add = p => { if(p && POS_LIST.includes(p) && !out.includes(p)) out.push(p); };
  String(text||"").toUpperCase().replace(/\s+/g," ").split(/,|;/).forEach(part=>{
    part = part.trim(); if(!part) return;
    if(POS_LIST.includes(part)){ add(part); return; }                 // own CSV: "IV", "LF" …
    const m = /^([A-ZÄÖÜ/ ]+?)\s*(?:\(([A-Z ]+)\))?$/.exec(part);
    if(!m) return;
    const roles = m[1].split("/").map(r=>r.trim()).filter(Boolean);
    // FM names no main position → centre first, then left, then right
    const sides = (m[2] || "").replace(/\s/g,"").split("").map(c=>({L:"L",R:"R",C:"C",Z:"C"})[c]).filter(Boolean)
      .sort((a,b)=>"CLR".indexOf(a)-"CLR".indexOf(b));
    roles.forEach(r=>{
      if(["GK","TW","G"].includes(r)) return add("TW");
      if(["DM","DMC"].includes(r)) return add("DM");
      if(["SW","LIB"].includes(r)) return add("IV");
      if(["ST","S","STC","FC","MS"].includes(r)) return add("ST");
      const side = sides.length ? sides : ["C"];
      side.forEach(sd=>{
        if(["D","V","IV"].includes(r)) add(sd === "L" ? "LV" : sd === "R" ? "RV" : "IV");
        else if(["WB","FV","AV"].includes(r)) add(sd === "R" ? "RV" : "LV");
        else if(r === "M") add(sd === "L" ? "LF" : sd === "R" ? "RF" : "ZM");
        else if(["AM","OM"].includes(r)) add(sd === "L" ? "LF" : sd === "R" ? "RF" : "OM");
      });
    });
  });
  return out;
}

/** "€12,000 p/w", "45.000 € p.M.", "€2.3M p/a", "1,2 Mio. pro Jahr" → per year. Without a unit: fallback. */
function parseWageCell(text, fallbackUnit){
  const t = String(text||"").trim();
  if(!t || /^(n\/a|-+|—|k\.a\.)$/i.test(t)) return null;
  const lower = t.toLowerCase();
  let unit = null, cleaned = lower;
  // "/J." "/M." "/W." are FM26's German short forms (e.g. "3Mio. €/J."); a slash is required so "Mio." is never read as a unit
  const units = [
    ["year", /(\/\s*j(ahr)?\.?(?![a-z])|p\s*[\/.]?\s*a\.?(?![a-z])|p\.\s*j\.?|pro\s*jahr|per\s*(year|annum)|\bpa\b|jährl\w*)/],
    ["month",/(\/\s*m(on|onat)?\.?(?![a-z])|p\s*[\/.]?\s*m\.?(?![a-z])|pro\s*monat|per\s*month|\bpcm\b|monatl\w*)/],
    ["week", /(\/\s*w(o|oche)?\.?(?![a-z])|p\s*[\/.]?\s*w\.?(?![a-z])|pro\s*woche|per\s*week|\bpw\b|wöchentl\w*)/]
  ];
  for(const [u, re] of units){ if(re.test(cleaned)){ unit = u; cleaned = cleaned.replace(re, " "); break; } }
  cleaned = cleaned.replace(/[€£$¥]|eur|chf/g, "").trim();
  if(!/\d/.test(cleaned)) return null;
  const v = parseMoney(cleaned);
  const f = {week:52, month:12, year:1}[unit || fallbackUnit || "week"];
  return Math.round(v * f);
}
/** Transfer value: "3Mio. €", "2,1Mio. € - 3,5Mio. €", "€1.5M - €2.8M"; "Unverkäuflich" → null. → {min, max} */
function parseValueCell(text){
  const t = String(text||"").trim();
  if(!t || /(unverk|not for sale|n\/a|^-+$|^—$|k\.a\.)/i.test(t)) return null;
  const parts = t.split(/\s[-–—]\s|–|—|\sbis\s/).map(x=>x.replace(/[€£$¥]|eur/gi,"").trim()).filter(x=>/\d/.test(x));
  if(!parts.length) return null;
  const vals = parts.slice(0,2).map(parseMoney).filter(v=>v >= 0);
  if(!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  return max > 0 ? {min, max} : null;
}
/** "30/6/2027", "30.06.2027", "2027-06-30", "Juni 2027", "2027" → {iso?, year}. Day comes first (EU format). */
function parseDateCell(text){
  const t = String(text||"");
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if(m) return {iso:`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`, year:+m[1]};
  m = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(t);
  if(m){
    let y = +m[3]; if(y < 100) y += y > 50 ? 1900 : 2000;
    let d = +m[1], mo = +m[2];
    if(mo > 12 && d <= 12){ const x = d; d = mo; mo = x; }       // US order fallback
    const iso = `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return {iso: parseISO(iso) ? iso : null, year:y};
  }
  m = /\b(19|20)\d{2}\b/.exec(t);
  return m ? {iso:null, year:+m[0]} : null;
}
const ROLE_WORDS = [
  ["key", ["schlusselspieler","keyplayer","key"]],
  ["first", ["stammspieler","firstteam","regularstarter","first","stamm","important"]],
  ["rotation", ["rotation","rotationsspieler","squadplayer","erganzungsspieler","kaderspieler"]],
  ["backup", ["backup","ersatz","ersatzspieler"]],
  ["prospect", ["perspektive","perspektivspieler","hotprospect","youngster","talent","nachwuchs","prospect","nachwuchsspieler"]],
  ["sell", ["abgabe","notneeded","nichtbenotigt","sell","transferliste","verkaufen"]]
];
function parseRoleCell(t){ const k = normKey(t); const hit = ROLE_WORDS.find(([,ws])=>ws.some(w=>k === w || k.startsWith(w))); return hit ? hit[0] : null; }
function parseStatusCell(t){
  const k = normKey(t);
  if(!k || ["verfugbar","available","fit"].includes(k)) return "";
  const hit = Object.entries(STATUS).find(([key,label])=>normKey(label) === k || key === k);
  return hit ? hit[0] : (/(verletz|injur)/.test(k) ? "injured" : /(gesperrt|suspend|ban)/.test(k) ? "suspended" : null);
}
const normName = n => String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();

/** Rows + column mapping → clean player records; problems per row are collected as warnings. */
function buildImportRecords(rows, mapping, wageUnit){
  const recs = [], warnings = [], seen = new Set();
  rows.forEach((row, ri)=>{
    const rec = {}, get = t => { const i = mapping.indexOf(t); return i >= 0 ? (row[i] || "").trim() : undefined; };
    const name = get("name");
    if(!name) return;
    if(/^(name|spieler|player)$/i.test(name)) return;                // repeated header lines
    const key = normName(name);
    if(seen.has(key)){ warnings.push(`„${name}“ steht mehrfach in der Datei – nur der erste Eintrag zählt.`); return; }
    seen.add(key);
    rec.name = name.replace(/\s+/g," ");
    const pos = get("pos");
    if(pos !== undefined){
      const list = parseFMPositions(pos);
      if(list.length){ rec.pos = list[0]; rec.altPos = list.slice(1); rec.posList = list; }
      else if(pos) warnings.push(`${rec.name}: Position „${pos}“ nicht erkannt – bleibt unverändert bzw. ZM.`);
    }
    const alt = get("altPos");
    if(alt !== undefined){ rec.altPos = parseFMPositions(alt).filter(x=>x !== rec.pos); rec.altFromColumn = true; }
    const bd = get("birthDate");
    if(bd !== undefined){ const d = parseDateCell(bd); if(d && d.iso) rec.birthDate = d.iso; }
    const age = get("age");
    if(age !== undefined && /\d/.test(age)) rec.age = clamp(parseInt(age, 10), 14, 45);
    const sal = get("salary");
    if(sal !== undefined){ const v = parseWageCell(sal, wageUnit); if(v !== null) rec.salary = v; }
    const ct = get("contractUntil");
    if(ct !== undefined){ const d = parseDateCell(ct); if(d) rec.contractUntil = d.year; }
    const role = get("squadRole"); if(role !== undefined){ const r = parseRoleCell(role); if(r) rec.squadRole = r; }
    const rt = get("rating"); if(rt !== undefined && /\d/.test(rt)) rec.rating = clamp(parseInt(rt,10), 1, 5);
    const st = get("status"); if(st !== undefined){ const x = parseStatusCell(st); if(x !== null) rec.status = x; }
    const nt = get("note"); if(nt !== undefined) rec.note = nt;
    const hc = get("homeClub"); if(hc !== undefined && hc.trim()) rec.homeClub = hc.trim().slice(0,60);
    const cp = get("caps"); if(cp !== undefined && /\d/.test(cp)) rec.caps = Math.max(0, Math.round(num(cp.replace(/[^\d]/g,""))));
    const ig = get("intGoals"); if(ig !== undefined && /\d/.test(ig)) rec.intGoals = Math.max(0, Math.round(num(ig.replace(/[^\d]/g,""))));
    mapping.forEach((t, i)=>{                                 // custom fields: raw text, converted per type
      if(!t.startsWith("cf:")) return;
      const def = cfById(t.slice(3)); if(!def) return;
      rec.custom = rec.custom || {};
      rec.custom[def.id] = coerceCF(def, (row[i] || "").trim());          // undefined = empty cell
      rec.cfMapped = (rec.cfMapped || []).concat(def.id);
    });
    const na = get("nation"); if(na !== undefined && na) rec.nation = na.replace(/\s+/g," ").slice(0,40);
    const tv = get("value");
    // an empty, "-", "N/A" or "Unverkäuflich" cell means "no information" – it must never wipe an existing value
    if(tv !== undefined){ const v = parseValueCell(tv); if(v){ rec.valueMin = v.min; rec.valueMax = v.max; } }
    recs.push(rec);
  });
  return {recs, warnings};
}

const IMPORT_FIELDS = ["pos","altPos","nation","birthDate","age","salary","valueMin","valueMax","contractUntil","squadRole","rating","status","note","homeClub","caps","intGoals"];
/** Compares import records with the squad: new / changed (field by field) / unchanged / missing. */
function diffImport(recs){
  const byName = new Map(state.players.map(p=>[normName(p.name), p]));
  const res = {added:[], changed:[], unchanged:[], missing:[]};
  const matched = new Set();
  recs.forEach(rec=>{
    const p = byName.get(normName(rec.name));
    if(p) rec = Object.assign({}, rec);
    if(!p){
      const elsewhere = state.loans.find(l=>normName(l.name) === normName(rec.name)) ? "steht unter Leihen"
        : state.prospects.find(x=>normName(x.name) === normName(rec.name)) ? "steht unter Talenten"
        : state.scouting.find(x=>normName(x.name) === normName(rec.name)) ? "steht auf der Transferliste" : "";
      res.added.push({rec, note:elsewhere});
      return;
    }
    matched.add(p.id);
    // keep the current main position if FM still lists it (FM has no "main" position)
    // (a separate "Nebenpositionen" column always wins over the derived list)
    if(rec.posList && rec.posList.includes(p.pos)){
      rec = Object.assign({}, rec, {pos:p.pos, altPos: rec.altFromColumn ? rec.altPos.filter(x=>x !== p.pos) : rec.posList.filter(x=>x !== p.pos)});
    }
    const changes = [];
    IMPORT_FIELDS.forEach(f=>{
      if(rec[f] === undefined) return;
      if(f === "age" && (p.birthDate || rec.birthDate)) return;          // age follows the birth date
      if(same(rec[f], p[f])) return;
      changes.push({field:f, from:p[f], to:rec[f]});
    });
    (rec.cfMapped || []).forEach(fid=>{
      const def = cfById(fid); if(!def) return;
      let a = (p.custom || {})[fid], b = rec.custom[fid];
      if(def.type === "bool"){ a = !!a; b = !!b; }                         // empty = "no" for yes/no fields
      if(same(a === undefined ? null : a, b === undefined ? null : b)) return;
      changes.push({field:"cf:" + fid, from:(p.custom || {})[fid], to:rec.custom[fid]});
    });
    (changes.length ? res.changed : res.unchanged).push({rec, player:p, changes});
  });
  state.players.forEach(p=>{ if(!matched.has(p.id)) res.missing.push(p); });
  return res;
}


/* ---------- Import wizard (3 steps: source → columns → review) ---------- */
let importCtx = null;
function openImportWizard(){
  importCtx = {text:"", fileName:""};
  openModal({
    title:"Kader importieren · 1/3 Quelle",
    wide:true,
    body:`
      <p class="lead">In FM die gewünschte Kaderansicht öffnen (mit den Spalten, die du übernehmen willst, z. B. Name, Position, Alter, Gehalt, Vertragsende), dann <strong>Drucken</strong> (Strg+P) und als <strong>Textdatei</strong> oder <strong>Webseite</strong> speichern. Die genauen Menünamen können je nach FM-Version leicht abweichen. Eine CSV aus diesem Dashboard oder aus Excel funktioniert genauso.</p>
      <div class="field"><label for="impFile">Datei wählen (.txt, .html, .csv)</label><input type="file" id="impFile" accept=".txt,.html,.htm,.csv,.tsv,.rtf,text/plain,text/html,text/csv"></div>
      <div class="field"><label for="impText">… oder Inhalt hier einfügen</label><textarea id="impText" rows="8" placeholder="| Name | Position | Alter | Gehalt | Vertragsende |"></textarea></div>
      <div class="pin-msg" id="impMsg" role="alert"></div>`,
    saveLabel:"Weiter",
    onOpen: m=>{
      qs("#impFile", m).onchange = e=>{
        const f = e.target.files[0]; if(!f) return;
        const r = new FileReader();
        r.onload = ()=>{
          const buf = new Uint8Array(r.result);
          const utf16 = (buf[0] === 0xFF && buf[1] === 0xFE) || (buf.length > 3 && buf[1] === 0 && buf[3] === 0);
          qs("#impText").value = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(buf);
          importCtx.fileName = f.name;
        };
        r.readAsArrayBuffer(f);
      };
    },
    onSave: ()=>{
      const text = qs("#impText").value;
      const rows = parseTable(text).filter(r=>r.some(c=>c));
      if(rows.length < 2){ qs("#impMsg").textContent = "Keine Tabelle erkannt – mindestens eine Überschrift und eine Datenzeile nötig."; return false; }
      importCtx.rows = rows;
      importCtx.header = rows[0];
      importCtx.mapping = guessMapping(rows[0]);
      const salCol = importCtx.header[importCtx.mapping.indexOf("salary")] || "";
      importCtx.wageUnit = /jahr|year|p\.?\s*a/i.test(salCol) ? "year" : /monat|month/i.test(salCol) ? "month" : "week";
      setTimeout(openImportMapping, 0);
    }
  });
}

function openImportMapping(){
  const c = importCtx, preview = c.rows.slice(1, 5);
  openModal({
    title:"Kader importieren · 2/3 Spalten",
    wide:true,
    body:`
      <p class="lead">${fmtNum(c.rows.length-1)} Zeilen erkannt${c.fileName ? ` in „${esc(c.fileName)}“` : ""}. Prüfe, welche Spalte wohin gehört – nicht benötigte auf „ignorieren“ lassen.</p>
      <div class="table-wrap imp-map"><table class="data-table"><thead><tr>${c.header.map((h,i)=>`<th><div class="muted small">${esc(h) || "(leer)"}</div>
        <select data-map="${i}" aria-label="Spalte ${esc(h)} zuordnen">${options(importTargets(), c.mapping[i])}</select></th>`).join("")}</tr></thead>
        <tbody>${preview.map(r=>`<tr>${c.header.map((_,i)=>`<td class="small">${esc(r[i] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="field-row" style="margin-top:12px">
        <div class="field"><label>Gehälter ohne Einheit in der Datei sind …</label><select data-f="wageUnit">${options({week:"pro Woche (FM-Standard)", month:"pro Monat", year:"pro Jahr"}, c.wageUnit)}</select></div>
      </div>
      <p class="hint">Einheiten wie „p/w“, „p.M.“ oder „p.a.“ in den Zellen werden automatisch erkannt. FM-Positionen wie „D (RLC)“ oder „V/FV (L)“ werden übersetzt – bei bekannten Spielern bleibt die bisherige Hauptposition erhalten.</p>
      <div class="pin-msg" id="impMsg" role="alert"></div>`,
    leftButtons:`<button class="btn" data-imp-back>Zurück</button>`,
    saveLabel:"Weiter",
    onOpen: m=>{
      m.onchange = e=>{ const s = e.target.closest("[data-map]"); if(s) c.mapping[num(s.dataset.map)] = s.value; };
      m.onclick = e=>{ if(e.target.closest("[data-imp-back]")){ closeModal(); setTimeout(openImportWizard, 0); } };
    },
    onSave: get=>{
      const dupl = c.mapping.filter(Boolean).filter((t,i,a)=>a.indexOf(t) !== i);
      if(!c.mapping.includes("name")){ qs("#impMsg").textContent = "Ohne Namensspalte geht es nicht – bitte eine Spalte als „Name“ zuordnen."; return false; }
      if(dupl.length){ qs("#impMsg").textContent = `„${importTargets()[dupl[0]]}“ ist mehreren Spalten zugeordnet.`; return false; }
      c.wageUnit = get("wageUnit");
      const {recs, warnings} = buildImportRecords(c.rows.slice(1), c.mapping, c.wageUnit);
      if(!recs.length){ qs("#impMsg").textContent = "Keine Spieler mit Namen gefunden."; return false; }
      c.recs = recs; c.warnings = warnings; c.diff = diffImport(recs);
      setTimeout(openImportReview, 0);
    }
  });
}

function importFieldText(f, v){
  if(f === "salary") return fmtWage(v);
  if(f === "valueMin" || f === "valueMax") return v ? fmtEUR(v) : "—";
  if(f === "altPos") return v.length ? v.join(", ") : "—";
  if(f === "squadRole") return SQUAD_ROLES[v] || v;
  if(f === "status") return STATUS[v] || "Verfügbar";
  if(f === "rating") return "★".repeat(v);
  if(f === "birthDate") return v ? fmtDate(v,{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
  return v === "" || v === undefined ? "—" : String(v);
}
/** Display list of a player's changes; value min/max are shown as one "Wert" range. */
function importChangeList(x){
  const FL = {homeClub:"Stammverein", caps:"Länderspiele", intGoals:"Länderspieltore", pos:"Position", altPos:"Nebenpos.", nation:"Land", birthDate:"Geburtsdatum", age:"Alter", salary:"Gehalt", contractUntil:"Vertrag bis", squadRole:"Kaderrolle", rating:"Einschätzung", status:"Status", note:"Notiz"};
  const out = x.changes.filter(c=>c.field !== "valueMin" && c.field !== "valueMax")
    .map(c=>{
      if(c.field.startsWith("cf:")){ const d = cfById(c.field.slice(3)); return {label:d ? d.name : "Feld", from:d ? cfText(d, c.from) : "—", to:d ? cfText(d, c.to) : "—"}; }
      return {label:FL[c.field], from:importFieldText(c.field, c.from), to:importFieldText(c.field, c.to)};
    });
  const vc = x.changes.filter(c=>c.field === "valueMin" || c.field === "valueMax");
  if(vc.length){
    const before = {valueMin:x.player.valueMin, valueMax:x.player.valueMax}, after = Object.assign({}, before);
    vc.forEach(c=>after[c.field] = c.to);
    out.push({label:"Wert", from:fmtValue(before), to:fmtValue(after)});
  }
  return out;
}
function openImportReview(){
  const c = importCtx, d = c.diff;
  const FL = {homeClub:"Stammverein", caps:"Länderspiele", intGoals:"Länderspieltore", pos:"Position", altPos:"Nebenpos.", nation:"Land", valueMin:"Wert von", valueMax:"Wert bis", birthDate:"Geburtsdatum", age:"Alter", salary:"Gehalt", contractUntil:"Vertrag bis", squadRole:"Kaderrolle", rating:"Einschätzung", status:"Status", note:"Notiz"};
  const recLine = r => [r.pos, r.nation || "", r.age !== undefined ? r.age + " J." : "", r.salary !== undefined ? fmtWage(r.salary) : "",
    r.valueMax ? "Wert " + fmtValue(r) : "", r.contractUntil ? "bis " + r.contractUntil : ""].filter(Boolean).join(" · ");
  openModal({
    title:"Kader importieren · 3/3 Abgleich",
    wide:true,
    body:`
      <div class="imp-summary">
        <span class="imp-chip add">${d.added.length} neu</span><span class="imp-chip chg">${d.changed.length} geändert</span>
        <span class="imp-chip same">${d.unchanged.length} unverändert</span><span class="imp-chip miss">${d.missing.length} nicht in der Datei</span>
      </div>
      ${c.warnings.length ? `<details class="imp-warn"><summary>${c.warnings.length} Hinweise zur Datei</summary><ul>${c.warnings.slice(0,30).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
      ${d.added.length ? `<h4 class="imp-h">Neu im Kader <button class="linkish" data-imp-all="add">alle an/aus</button></h4><div class="imp-list">${d.added.map((x,i)=>`
        <label class="imp-row"><input type="checkbox" data-imp-add="${i}" ${x.note ? "" : "checked"}><strong>${esc(x.rec.name)}</strong><span class="muted small">${esc(recLine(x.rec))}</span>
        ${x.note ? `<span class="badge unhappy" title="Vorsicht vor Duplikaten">${esc(x.note)}</span>` : ""}</label>`).join("")}</div>` : ""}
      ${d.changed.length ? `<h4 class="imp-h">Änderungen <button class="linkish" data-imp-all="chg">alle an/aus</button></h4><div class="imp-list">${d.changed.map((x,i)=>`
        <label class="imp-row"><input type="checkbox" data-imp-chg="${i}" checked><strong>${esc(x.player.name)}</strong>
        <span class="imp-changes">${importChangeList(x).map(ch=>`<span>${ch.label}: <s>${esc(ch.from)}</s> → <b>${esc(ch.to)}</b></span>`).join("")}</span></label>`).join("")}</div>` : ""}
      ${d.missing.length ? `<h4 class="imp-h">Im Dashboard, aber nicht in der Datei</h4>
        <p class="hint" style="margin-top:0">Nur anhaken, wenn die Datei deinen <strong>kompletten</strong> Kader enthält – sonst einfach behalten.</p>
        <div class="imp-list">${d.missing.map((p,i)=>`<label class="imp-row"><input type="checkbox" data-imp-del="${i}"><span>${esc(p.name)} <span class="muted small">${p.pos}</span></span><span class="muted small">entfernen</span></label>`).join("")}</div>` : ""}
      ${(()=>{ const lo = sampleLeftovers(); const other = lo.parts.filter(x=>!/^\d+ Spieler$/.test(x));
        return other.length ? `<h4 class="imp-h">Beispieldaten</h4><label class="imp-row"><input type="checkbox" data-imp-sample checked>
          <span>Übrige Beispieldaten aus der Demo ebenfalls entfernen: <span class="muted small">${esc(other.join(", "))}</span></span></label>` : ""; })()}
      ${!d.added.length && !d.changed.length ? `<div class="future-ok">✓ Alles aktuell – die Datei enthält keine Neuerungen gegenüber deinem Kader.</div>` : ""}
      <p class="hint">Vor dem Übernehmen wird automatisch ein Wiederherstellungspunkt angelegt. Deine eigenen Felder (Einschätzung, Kaderrolle, Notizen) bleiben unangetastet, solange die Datei sie nicht enthält.</p>`,
    leftButtons:`<button class="btn" data-imp-back>Zurück</button>`,
    saveLabel:"Übernehmen",
    onOpen: m=>{
      m.onclick = e=>{
        if(e.target.closest("[data-imp-back]")){ closeModal(); setTimeout(openImportMapping, 0); return; }
        const all = e.target.closest("[data-imp-all]");
        if(all){
          e.preventDefault();
          const boxes = qsa(all.dataset.impAll === "add" ? "[data-imp-add]" : "[data-imp-chg]", m);
          const on = !boxes.every(b=>b.checked); boxes.forEach(b=>b.checked = on);
        }
      };
    },
    onSave: ()=>{
      const m = qs("#modal");
      const addIdx = qsa("[data-imp-add]", m).filter(b=>b.checked).map(b=>num(b.dataset.impAdd));
      const chgIdx = qsa("[data-imp-chg]", m).filter(b=>b.checked).map(b=>num(b.dataset.impChg));
      const delIdx = qsa("[data-imp-del]", m).filter(b=>b.checked).map(b=>num(b.dataset.impDel));
      const sampleBox = qs("[data-imp-sample]", m);
      applyImport(addIdx.map(i=>d.added[i]), chgIdx.map(i=>d.changed[i]), delIdx.map(i=>d.missing[i]), !!(sampleBox && sampleBox.checked));
    }
  });
}
function applyImport(added, changed, removed, stripSample){
  if(!added.length && !changed.length && !removed.length && !stripSample){ toast("Nichts ausgewählt – Kader unverändert."); return; }
  createRestorePoint("Vor Kader-Import");
  const snap = JSON.stringify(state);
  const year = ingameDate().getFullYear();
  added.forEach(({rec})=>{
    state.players.push({id:uid(), name:rec.name, pos:rec.pos || "ZM", altPos:rec.altPos || [],
      age: rec.age !== undefined ? rec.age : 22, birthDate: rec.birthDate || "", salary: rec.salary || 0,
      contractUntil: rec.contractUntil || year + 1, squadRole: rec.squadRole || "rotation", rating: rec.rating || 3,
      status: rec.status || "", note: rec.note || "", nation: rec.nation || "", valueMin: rec.valueMin || 0, valueMax: rec.valueMax || 0,
      homeClub: rec.homeClub || "", caps: rec.caps || 0, intGoals: rec.intGoals || 0,
      custom: Object.fromEntries(Object.entries(rec.custom || {}).filter(([,v])=>v !== undefined))});
  });
  changed.forEach(({player, changes})=>{
    const p = state.players.find(x=>x.id === player.id); if(!p) return;
    changes.forEach(ch=>{
      if(ch.field.startsWith("cf:")){ const fid = ch.field.slice(3); p.custom = p.custom || {}; if(ch.to === undefined) delete p.custom[fid]; else p.custom[fid] = ch.to; }
      else p[ch.field] = JSON.parse(JSON.stringify(ch.to));
    });
  });
  const gone = new Set(removed.map(p=>p.id));
  state.players = state.players.filter(p=>!gone.has(p.id));
  if(stripSample) stripSampleData(state, {keepPlayers:true});
  state = sanitizeState(state);
  saveState();
  const log = readLog();
  log.push({id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, area:"Import", action:"info", entity:"Kader",
    text:`Kader-Import${importCtx && importCtx.fileName ? " aus „"+importCtx.fileName+"“" : ""}: ${added.length} neu, ${changed.length} geändert, ${removed.length} entfernt${stripSample ? ", Beispieldaten entfernt" : ""}`, revertible:false});
  writeLog(log);
  renderAll();
  toast(`Import: ${added.length} neu · ${changed.length} geändert · ${removed.length} entfernt`, {onUndo:()=>{ state = JSON.parse(snap); saveState(); renderAll(); }, duration:8000});
}

/* ---------- CSV export (Excel-friendly: UTF-8 BOM, semicolons) ---------- */
function exportSquadCSV(){
  const cols = [["Name",p=>p.name],["Position",p=>p.pos],["Nebenpositionen",p=>p.altPos.join(", ")],["Land",p=>p.nation],["Alter",p=>p.age],
    ["Geburtsdatum",p=>p.birthDate ? fmtDate(p.birthDate,{day:"2-digit",month:"2-digit",year:"numeric"}) : ""],
    ["Gehalt pro Jahr",p=>p.salary],["Transferwert",p=>!p.valueMax ? "" : p.valueMin && p.valueMin !== p.valueMax ? `${p.valueMin} - ${p.valueMax}` : p.valueMax],["Vertrag bis",p=>p.contractUntil],["Kaderrolle",p=>SQUAD_ROLES[p.squadRole]],
    ["Einschätzung",p=>p.rating],["Status",p=>STATUS[p.status]],["Notiz",p=>p.note]]
    .concat(isNat() ? [["Stammverein",p=>p.homeClub],["Länderspiele",p=>p.caps],["Länderspieltore",p=>p.intGoals],["Nominiert",p=>p.nominated ? "Ja" : ""]] : [])
    .concat(cfDefs("squad").map(d=>[d.name, p=>{ const v = (p.custom || {})[d.id]; return v === undefined ? "" : d.type === "bool" ? (v ? "Ja" : "") : v; }]));
  const cell = v => { const t = String(v === undefined || v === null ? "" : v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
  const players = state.players.slice().sort((a,b)=>POS_LIST.indexOf(a.pos)-POS_LIST.indexOf(b.pos) || a.name.localeCompare(b.name,"de"));
  const csv = "\uFEFF" + [cols.map(c=>c[0]).join(";")].concat(players.map(p=>cols.map(c=>cell(c[1](p))).join(";"))).join("\r\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `kader_${state.club.name.replace(/[^\wäöüÄÖÜß-]+/g,"_")}_${state.club.ingameDate}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`${players.length} Spieler als CSV exportiert`);
  return csv;
}

/* ---------- Bulk edit in the squad table ---------- */
const selectedPlayers = new Set();
function renderBulkBar(){
  const bar = qs("#bulkBar");
  [...selectedPlayers].forEach(id=>{ if(!playerById(id)) selectedPlayers.delete(id); });
  const n = selectedPlayers.size;
  bar.hidden = n === 0;
  const visible = qsa("#squadTbody [data-sel]");
  const all = qs("#selAll");
  all.checked = visible.length > 0 && visible.every(b=>b.checked);
  all.indeterminate = !all.checked && visible.some(b=>b.checked);
  if(!n){ bar.innerHTML = ""; return; }
  bar.innerHTML = `<strong>${n} ausgewählt</strong>
    <select data-bulk="squadRole" aria-label="Kaderrolle für Auswahl setzen"><option value="">Kaderrolle setzen …</option>${options(SQUAD_ROLES, "")}</select>
    <select data-bulk="status" aria-label="Status für Auswahl setzen"><option value="">Status setzen …</option>${Object.entries(STATUS).map(([k,l])=>`<option value="${k || "ok"}">${esc(l)}</option>`).join("")}</select>
    <span class="bulk-contract">Vertrag bis <input type="number" id="bulkContract" value="${ingameDate().getFullYear()+2}" min="2000" max="2100" aria-label="Vertrag bis Jahr"><button class="btn btn-sm" data-bulk-act="contract">Setzen</button></span>
    <button class="btn btn-sm" data-bulk-act="sale">Auf Verkaufsliste</button>
    <button class="btn btn-sm btn-danger-outline" data-bulk-act="delete">Löschen</button>
    <button class="btn btn-sm btn-ghost" data-bulk-act="clear">Auswahl aufheben</button>`;
}
function applyBulk(fn, message){
  const undo = snapshotUndo(message, ()=>{ renderAll(); });
  const ids = [...selectedPlayers];
  fn(ids.map(id=>playerById(id)).filter(Boolean));
  state = sanitizeState(state);
  saveState(); renderAll(); undo();
}
function initBulkAndImport(){
  qs("#btnImportFM").addEventListener("click", openImportWizard);
  qs("#btnExportCSV").addEventListener("click", exportSquadCSV);
  qs("#squadTbody").addEventListener("change", e=>{
    const cb = e.target.closest("[data-sel]"); if(!cb) return;
    if(cb.checked) selectedPlayers.add(cb.dataset.sel); else selectedPlayers.delete(cb.dataset.sel);
    cb.closest("tr").classList.toggle("selected", cb.checked);
    renderBulkBar();
  });
  qs("#selAll").addEventListener("change", e=>{
    qsa("#squadTbody [data-sel]").forEach(cb=>{ cb.checked = e.target.checked; cb.closest("tr").classList.toggle("selected", cb.checked);
      if(cb.checked) selectedPlayers.add(cb.dataset.sel); else selectedPlayers.delete(cb.dataset.sel); });
    renderBulkBar();
  });
  const bar = qs("#bulkBar");
  bar.addEventListener("change", e=>{
    const s = e.target.closest("[data-bulk]"); if(!s || !s.value) return;
    const f = s.dataset.bulk, v = s.value === "ok" ? "" : s.value;
    const label = f === "squadRole" ? SQUAD_ROLES[v] : STATUS[v];
    applyBulk(ps=>ps.forEach(p=>p[f] = v), `${selectedPlayers.size} Spieler: ${f === "squadRole" ? "Kaderrolle" : "Status"} → ${label}`);
  });
  bar.addEventListener("click", e=>{
    const b = e.target.closest("[data-bulk-act]"); if(!b) return;
    const act = b.dataset.bulkAct, n = selectedPlayers.size;
    if(act === "clear"){ selectedPlayers.clear(); renderSquad(); return; }
    if(act === "contract"){
      const y = clamp(Math.round(num(qs("#bulkContract").value, 0)), 2000, 2100);
      applyBulk(ps=>ps.forEach(p=>{ p.contractUntil = y; p.extendPlanned = false; }), `${n} Verträge bis ${y}`);
    }
    if(act === "sale"){
      applyBulk(ps=>ps.forEach(p=>{
        p.squadRole = "sell";
        if(!state.sales.some(x=>x.playerId === p.id)) state.sales.push({id:uid(), playerId:p.id, price:valueMid(p), status:"listed", note:""});
      }), `${n} Spieler auf die Verkaufsliste gesetzt${state.players.some(p=>selectedPlayers.has(p.id) && !p.valueMax) ? " (fehlende Erlöse noch eintragen)" : " (Erlös = Transferwert)"}`);
    }
    if(act === "delete"){
      applyBulk(ps=>{ const gone = new Set(ps.map(p=>p.id)); state.players = state.players.filter(p=>!gone.has(p.id)); }, `${n} Spieler gelöscht`);
      selectedPlayers.clear(); renderSquad();
    }
  });
}


/* ==========================================================================
   LEFTOVER SAMPLE DATA
   An FM import replaces the squad – but the demo's loans, transfer targets, talents, history …
   stay behind and distort budgets and the next-season plan. They are recognised by comparing
   with a freshly built sample career (no hard-coded name lists).
   ========================================================================== */
let _sampleSig = null;
const SAMPLE_COLLS = {
  players:    {label:"Spieler",               key:o=>normName(o.name)},
  scouting:   {label:"Transferziele",         key:o=>normName(o.name)},
  prospects:  {label:"Talente",               key:o=>normName(o.name)},
  loans:      {label:"Leihen",                key:o=>normName(o.name)},
  transferLog:{label:"Einträge in der Transfer-Historie", key:o=>normName(o.name)+"|"+o.fee},
  results:    {label:"Ergebnisse",            key:o=>normName(o.opponent)+"|"+o.date},
  balanceLog: {label:"Kontostände",           key:o=>o.date+"|"+o.amount},
  boardGoals: {label:"Vorstandsziele",        key:o=>o.title},
  todos:      {label:"Aufgaben",              key:o=>o.text},
  seasons:    {label:"Archiv-Saisons",        key:o=>o.season+"|"+o.summary}
};
function sampleSignature(){
  if(_sampleSig) return _sampleSig;
  const d = buildDefaultState();
  _sampleSig = {nm:d.nextMatch, notes:d.notes};
  Object.entries(SAMPLE_COLLS).forEach(([c, def])=>{ _sampleSig[c] = new Set((d[c]||[]).map(def.key)); });
  return _sampleSig;
}
/** What of the demo data is still in the save? (hasReal = there are also real, non-demo players) */
function sampleLeftovers(s){
  s = s || state;
  const sig = sampleSignature(), counts = {};
  Object.entries(SAMPLE_COLLS).forEach(([c, def])=>{ counts[c] = (s[c]||[]).filter(o=>sig[c].has(def.key(o))).length; });
  const hasReal = s.players.some(p=>!sig.players.has(normName(p.name)));
  const nm = !!s.nextMatch.opponent && s.nextMatch.opponent === sig.nm.opponent;
  const notes = !!s.notes && s.notes === sig.notes;
  const total = Object.values(counts).reduce((a,b)=>a+b,0) + (nm ? 1 : 0) + (notes ? 1 : 0);
  const parts = Object.entries(counts).filter(([,n])=>n).map(([c,n])=>`${n} ${SAMPLE_COLLS[c].label}`);
  if(nm) parts.push(`Spieltag-Vorbereitung (${sig.nm.opponent})`);
  if(notes) parts.push("Beispiel-Notizen");
  return {counts, total, hasReal, parts};
}
/** Removes the demo entries from a state (mutates, no save).
    keepPlayers: used by the import – there the user decides about players via "nicht in der Datei". */
function stripSampleData(s, opts){
  const sig = sampleSignature(), keepPlayers = !!(opts && opts.keepPlayers);
  Object.entries(SAMPLE_COLLS).forEach(([c, def])=>{
    if(c === "players" && keepPlayers) return;
    s[c] = (s[c]||[]).filter(o=>!sig[c].has(def.key(o)));
  });
  if(s.nextMatch.opponent === sig.nm.opponent){
    ["opponent","competition","date","formation","keyThreat","matchplan","weaknesses"].forEach(k=>{ if(s.nextMatch[k] === sig.nm[k]) s.nextMatch[k] = ""; });
    s.nextMatch.subs = [];
  }
  if(s.notes === sig.notes) s.notes = "";
}
function removeSampleLeftovers(){
  const lo = sampleLeftovers();
  if(!lo.total) return;
  createRestorePoint("Vor Entfernen der Beispieldaten");
  const snap = JSON.stringify(state);
  stripSampleData(state);
  state = sanitizeState(state);
  saveState();
  const log = readLog();
  log.push({id:uid(), ts:Date.now(), gameDate:state.club.ingameDate, area:"Daten", action:"info", entity:"Beispieldaten",
    text:`Beispieldaten entfernt: ${lo.parts.join(", ")}`, revertible:false});
  writeLog(log);
  renderAll();
  toast(`Beispieldaten entfernt (${lo.parts.length} Bereiche)`, {onUndo:()=>{ state = JSON.parse(snap); saveState(); renderAll(); }, duration:8000});
}
function renderSampleBanner(){
  const el = qs("#sampleBanner"); if(!el) return;
  const lo = sampleLeftovers();
  const show = lo.total > 0 && lo.hasReal && !state.ui.sampleHintDismissed;
  el.hidden = !show;
  if(!show){ el.innerHTML = ""; return; }
  el.innerHTML = `<span class="sb-icon" aria-hidden="true">🧹</span>
    <div class="sb-text"><strong>Noch Beispieldaten aus der Demo im Spielstand:</strong> ${esc(lo.parts.join(", "))}.
      <span class="muted">Sie verfälschen z. B. Transferbudget und Zukunfts-Kader.</span></div>
    <button class="btn btn-sm btn-accent" data-sample="remove">Beispieldaten entfernen</button>
    <button class="btn btn-sm btn-ghost" data-sample="keep">Behalten</button>`;
}
function initSampleBanner(){
  qs("#sampleBanner").addEventListener("click", e=>{
    const b = e.target.closest("[data-sample]"); if(!b) return;
    if(b.dataset.sample === "remove") removeSampleLeftovers();
    else { state.ui.sampleHintDismissed = true; saveState(); renderSampleBanner(); toast("Hinweis ausgeblendet – entfernen geht weiterhin über Admin → Datenprüfung."); }
  });
}



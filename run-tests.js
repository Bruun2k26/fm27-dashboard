const { JSDOM } = require("jsdom");
const fs = require("fs");
const DIR = require("path").join(__dirname, "..") + "/";   // repository root (works locally and on GitHub)
// 11.3: the app is split into js/*.js – loaded one by one in the order of index.html (exactly like the browser)
const htmlRaw = fs.readFileSync(DIR+"index.html","utf8");
// 11.3.1: index.html lists the parts in <script id="appParts"> and loads them with a small loader
const APP_PARTS = JSON.parse(/<script id="appParts" type="application\/json">([^<]*)<\/script>/.exec(htmlRaw)[1]);
const SCRIPTS = APP_PARTS.parts.map(f=>"js/"+f);
const html = htmlRaw.replace(/<script id="appParts"[^>]*>[^<]*<\/script>\n?/, "").replace(/<script id="appLoader">[\s\S]*?<\/script>\n?/, "");
const JS_PARTS = SCRIPTS.map(f=>fs.readFileSync(DIR+f,"utf8"));
const js = JS_PARTS.join("");                                   // for text checks only
const injectApp = w => JS_PARTS.forEach(code=>{ const s = w.document.createElement("script"); s.textContent = code; w.document.body.appendChild(s); });

let failures = 0; let renderIt;
const ok = (cond, label) => { console.log((cond?"  ✓ ":"  ✗ ")+label); if(!cond) failures++; };

let lastDom = null;   // 12.0: close the previous test window – 300+ open windows (with timers) ate the memory
async function boot(seed){
  if(lastDom){ try{ lastDom.window.close(); }catch(e){} }
  const dom = new JSDOM(html, {url:"http://localhost/", runScripts:"dangerously", pretendToBeVisual:true});
  lastDom = dom;
  const w = dom.window;
  const errs = [];
  w.addEventListener("error", e=>errs.push(e.message));
  w.print = ()=>{ w.__printed = true; };
  w.confirm = ()=>true;
  w.scrollTo = ()=>{};
  w.HTMLElement.prototype.scrollIntoView = function(){};
  if(!(seed && seed.welcome)) w.localStorage.setItem("fm27_welcome_done","1");   // the welcome dialog has its own tests
  if(!(seed && seed.hub)) w.localStorage.setItem("fm27_hub", JSON.stringify({startPanel:"fm"}));   // 11.4: FM tests start in the FM dashboard; hub tests start in the hub
  if(seed) seed(w.localStorage);
  injectApp(w);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  await new Promise(r=>setTimeout(r,50));
  return {w, d:w.document, errs, S:()=>w.eval("state")};
}
const activeName = w => w.eval("activePlan().name");
const key = (w, k, opts={}) => w.document.dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({key:k, bubbles:true}, opts)));

(async()=>{
  console.log("\n[1] Frischer Start");
  let {w,d,errs,S} = await boot();
  ok(errs.length===0, "keine Laufzeitfehler "+(errs.join("; ")));
  ok(d.querySelectorAll("#squadTbody tr[data-id]").length===20, "20 Spieler in Kadertabelle");
  ok(!d.querySelector("#squadTable").textContent.includes("Fitness"), "Fitness-Spalte entfernt");
  ok(d.querySelectorAll("#pitch .pitch-slot").length===11, "11 Positionen auf dem Feld");
  ok(d.querySelectorAll("#pitch .pitch-slot.empty").length===0, "Beispiel-Elf komplett besetzt");
  const injuredInXI = Object.values(S().tactics["4-3-3"].slots).some(sl=>{const p=S().players.find(x=>x.id===sl.playerId); return p && ["injured","suspended","ineligible"].includes(p.status);});
  ok(!injuredInXI, "Beste Elf ignoriert Verletzte/Gesperrte");
  ok(d.querySelectorAll("#contractAlerts .alert-row").length>0, "Vertrags-Ampel zeigt auslaufende Verträge");
  ok(d.querySelectorAll("#boardGoals .goal-row").length===4, "4 Vorstandsziele");
  ok(d.querySelector("#pitch svg.pitch-links").querySelectorAll("line").length>0, "Verbindungslinien gezeichnet");
  ok(d.querySelector("#ingameDatePill").textContent.includes("2027"), "Spieldatum formatiert: "+d.querySelector("#ingameDatePill").textContent);

  console.log("\n[2] Taktik: Zuweisen, Tauschen, Rollen, Phase");
  const slots = ()=>S().tactics[S().formationName].slots;
  const a0 = slots()[1].playerId, a2 = slots()[2].playerId;
  w.eval("assignToSlot(null, 2, 1)");
  ok(slots()[1].playerId===a2 && slots()[2].playerId===a0, "Positionen getauscht");
  const bench = S().players.find(p=>!Object.values(slots()).some(s=>s.playerId===p.id));
  w.eval(`assignToSlot("${bench.id}", 5, null)`);
  ok(slots()[5].playerId===bench.id, "Bankspieler auf Position gesetzt");
  w.eval("selectedSlot = 9; renderTactics()");
  const se = d.querySelector("#se-out");
  se.value = "Hoch bleibend"; se.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(slots()[9].roleOut==="Hoch bleibend", "Rolle gegen Ball gesetzt");
  const Y = i=>parseFloat(d.querySelector(`#pitch [data-slot="${i}"]`).style.top);
  const midIn = Y(6), spanIn = Y(2)-Y(8);
  d.querySelector('.phase-btn[data-phase="out"]').click();
  const midOut = Y(6), spanOut = Y(2)-Y(8);
  ok(midOut>midIn && spanOut<spanIn, `Gegen den Ball: Mittelfeld fällt zurück (${midIn}→${midOut}), Block kompakter (${spanIn}→${spanOut.toFixed(1)})`);
  ok(d.querySelector('#pitch [data-slot="9"] .p-role').textContent==="Hoch bleibend", "Karte zeigt Rolle der aktiven Phase");
  const fs2 = d.querySelector("#formationSelect"); fs2.value="3-5-2"; fs2.dispatchEvent(new w.Event("change"));
  ok(Object.values(slots()).filter(s=>s.playerId).length===11 && d.querySelector("#formationChip").textContent==="Plan A · 3-5-2", "Neue Formation: automatisch beste Elf vorgeschlagen");
  d.querySelector("#btnClearXI").click();
  ok(Object.values(slots()).every(s=>!s.playerId), "Aufstellung geleert");
  d.querySelector("#toastUndoBtn").click();
  ok(Object.values(slots()).filter(s=>s.playerId).length===11, "Leeren rückgängig gemacht");

  console.log("\n[3] Standards");
  d.querySelector('#tacticsTabs [data-tab="setpieces"]').click();
  ok(d.querySelector("#tactics-setpieces").classList.contains("active"), "Standards-Tab aktiv");
  ok(d.querySelectorAll("#spBoard .zone").length===8, "Ecke: 8 Zonen auf dem Board");
  const near = d.querySelector('#spEditor [data-sp-field="short"]');
  near.value = S().players[5].id; near.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().setPieces.cornerL.zones.short===S().players[5].id, "Zone 'Kurz anbieten' belegt");
  d.querySelector('#spTabs [data-sp="cornerR"]').click();
  d.querySelector("[data-sp-copy]").click();
  ok(S().setPieces.cornerR.zones.short===S().players[5].id, "Ecke rechts von links übernommen");
  ok(d.querySelectorAll("#penaltyList select").length===5, "5 Elfmeterschützen-Plätze");

  console.log("\n[4] Kader-Aktionen");
  const tr = d.querySelector("#squadTbody tr[data-id]");
  tr.querySelector('[data-star="1"]').click();
  ok(S().players.find(p=>p.id===tr.dataset.id).rating===1, "Einschätzung per Stern gesetzt");
  const pid = d.querySelector('#squadTbody tr[data-id]').dataset.id;
  d.querySelector(`#squadTbody tr[data-id="${pid}"] [data-edit]`).click();
  d.querySelector('#modal [data-f="altPos"]').value = "dm, xx, om"; d.querySelector("[data-modal-save]").click();
  ok(JSON.stringify(S().players.find(p=>p.id===pid).altPos)==='["DM","OM"]', "Nebenpositionen (✎-Dialog) geparst, ungültige verworfen");
  const land = d.querySelector(`#squadTbody tr[data-id="${pid}"] [data-field="nation"]`);
  land.value = "Schweden"; land.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===pid).nation==="Schweden" && d.querySelector("#squadTable thead").textContent.includes("Land"), "Spalte 'Land' in der Tabelle bearbeitbar");
  ok(d.querySelector("#thValue").hidden && !d.querySelector("#squadTbody .value-cell"), "Ohne Transferwerte bleibt die Spalte unsichtbar");
  const sf = d.querySelector("#squadStatusFilter"); sf.value="contract"; sf.dispatchEvent(new w.Event("change"));
  const n = d.querySelectorAll("#squadTbody tr[data-id]").length;
  ok(n>0 && n<20, `Filter 'Vertrag ≤ 12 Monate': ${n} Spieler`);
  sf.value=""; sf.dispatchEvent(new w.Event("change"));
  const loanP = S().players[3];
  d.querySelector(`#squadTbody tr[data-id="${loanP.id}"] [data-loan]`).click();
  d.querySelector('[data-f="club"]').value = "Testclub";
  d.querySelector("[data-modal-save]").click();
  ok(!S().players.some(p=>p.id===loanP.id) && S().loans.some(l=>l.name===loanP.name && l.club==="Testclub"), "Spieler verliehen → in Leih-Übersicht");

  const er = d.querySelector("#squadTbody tr[data-id]"), eid = er.dataset.id;
  er.querySelector("[data-edit]").click();
  ok(d.querySelector("#modal h3").textContent.includes("bearbeiten") && d.querySelector('[data-f="name"]').value===S().players.find(p=>p.id===eid).name, "✎ öffnet Bearbeiten-Dialog mit vorhandenen Daten");
  d.querySelector('[data-f="note"]').value = "Langfristig Kapitän"; d.querySelector('[data-f="salary"]').value = "70000";
  const cnt0 = S().players.length;
  d.querySelector("[data-modal-save]").click();
  const ep = S().players.find(p=>p.id===eid);
  ok(ep.note==="Langfristig Kapitän" && ep.salary===70000 && S().players.length===cnt0, "Bearbeiten speichert, legt keinen neuen Spieler an");
  const ni = d.querySelector(`#squadTbody tr[data-id="${eid}"] [data-field="name"]`);
  ni.value = "Neuer Name"; ni.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===eid).name==="Neuer Name", "Inline-Bearbeitung des Namens funktioniert");

  const ep2 = S().players[0];
  d.querySelector(`#squadTbody tr[data-id="${ep2.id}"] [data-edit]`).click();
  ok(d.querySelector('[data-f="age"]').disabled, "Alter im Dialog gesperrt, wenn Geburtsdatum vorhanden");
  d.querySelector('[data-f="note"]').value = "Kapitän"; d.querySelector('[data-f="birthDate"]').value = "1990-01-01";
  d.querySelector("[data-modal-save]").click();
  ok(ep2.note==="Kapitän" && ep2.birthDate==="1990-01-01" && ep2.age===37, "✎-Dialog: Notiz + Geburtsdatum gespeichert, Alter berechnet (37)");
  d.querySelector("#btnSquadLoans").click();
  ok(d.querySelector("#view-development").classList.contains("active") && d.querySelector("#dev-loans").classList.contains("active"), "Kader → 'Verliehen' öffnet Leihen-Reiter");

  console.log("\n[5] Transfers & Entwicklung");
  const before = d.querySelector("#transferBudgetChip").textContent;
  d.querySelector("#includeWatched").click();
  ok(d.querySelector("#transferBudgetChip").textContent!==before, `Beobachtete einrechnen ändert Budget (${before} → ${d.querySelector("#transferBudgetChip").textContent})`);
  const fixed = S().scouting.find(t=>t.status==="fixed");
  const tb0 = S().club.transferBudget, cnt = S().players.length;
  d.querySelector(`#scoutTbody tr[data-id="${fixed.id}"] [data-sign]`).click();
  d.querySelector("[data-modal-save]").click();
  ok(S().players.length===cnt+1 && S().club.transferBudget===tb0-fixed.fee-fixed.bonus, "Fixierter Transfer übernommen, Budget abgezogen");
  const pr = S().prospects[0];
  d.querySelector(`#prospectTbody tr[data-id="${pr.id}"] [data-promote]`).click();
  ok(S().players.some(p=>p.name===pr.name && p.squadRole==="prospect"), "Talent in den Profikader befördert");
  const ln = S().loans[0];
  d.querySelector(`#loanTbody tr[data-id="${ln.id}"] [data-return]`).click();
  ok(S().players.some(p=>p.name===ln.name), "Leihspieler zurückgeholt");

  console.log("\n[6] Spieltag, Notizen, Saison");
  d.querySelector("#btnPrint").click();
  ok(w.__printed && d.querySelector("#printArea").textContent.includes("Aufstellung"), "Briefing erzeugt und Druck ausgelöst");
  const nRes = S().results.length, opp = S().nextMatch.opponent;
  d.querySelector("#btnAddResult").click();
  ok(d.querySelector('#modal [data-f="opponent"]').value===opp, "Ergebnis-Dialog übernimmt Gegner aus der Vorbereitung");
  d.querySelector("[data-modal-save]").click();
  ok(S().results.length===nRes && d.querySelector("#modalOverlay").classList.contains("active"), "Ohne Torzahlen wird nicht gespeichert");
  d.querySelector('#modal [data-f="gf"]').value="0"; d.querySelector('#modal [data-f="ga"]').value="1";
  d.querySelector("[data-modal-save]").click();
  const newest = w.eval("sortedResults()[0]");
  ok(S().results.length===nRes+1 && newest.opponent===opp && w.eval(`resultOf(sortedResults()[0])`)==="L" && newest.planName==="Plan A" && newest.formation===w.eval("formationLabel(state.formationName)"),
     "Ergebnis 0:1 gespeichert mit Plan-Schnappschuss (Plan A · "+newest.formation+")");
  ok(S().nextMatch.opponent==="" && S().nextMatch.matchplan!=="", "Vorbereitung für nächsten Gegner geleert, Matchplan bleibt");
  S().players[1].birthDate = ""; const age0 = S().players[1].age, bAge0 = S().players[0].age, season0 = S().club.season;
  d.querySelector("#btnCloseSeason").click();
  d.querySelector('[data-f="position"]').value = "5.";
  d.querySelector("[data-modal-save]").click();
  ok(S().seasons[0].season===season0 && S().club.season==="2027/28" && S().players[1].age===age0+1 && S().players[0].age===bAge0 && S().boardGoals.length===0,
     "Saison archiviert: ohne Geburtsdatum +1, mit Geburtsdatum unverändert (altert per Datum)");

  console.log("\n[7] Befehlspalette & Kürzel");
  key(w,"k",{ctrlKey:true});
  ok(d.querySelector("#cmdOverlay").classList.contains("active"), "Strg+K öffnet Palette");
  const ci = d.querySelector("#cmdInput"); ci.value="hrub"; ci.dispatchEvent(new w.Event("input"));
  ok(d.querySelector("#cmdList li.active").textContent.includes("Hrubeš"), "Suche findet Spieler");
  ci.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  ok(d.querySelector("#view-squad").classList.contains("active") && d.querySelector("#squadSearch").value.includes("Hrubeš"), "Enter springt zum Spieler im Kader");
  ok(d.querySelector("#modalOverlay").classList.contains("active") && d.querySelector("#modal h3").textContent.includes("bearbeiten"), "Palette öffnet Bearbeiten-Dialog des Spielers");
  key(w,"Escape"); d.body.focus(); key(w,"4");
  ok(d.querySelector("#view-recruitment").classList.contains("active"), "Taste 4 → Transfers");
  key(w,"?");
  ok(d.querySelector("#modalOverlay").classList.contains("active") && d.querySelector("#modal").textContent.includes("Tastenkürzel"), "? zeigt Kürzel-Hilfe");
  key(w,"Escape");
  ok(!d.querySelector("#modalOverlay").classList.contains("active"), "Esc schließt Dialog");

  console.log("\n[8] Spielstände");
  w.eval("openSlotsModal()");
  d.querySelector('[data-slot-new="empty"]').click();
  ok(w.eval("slotIndex").slots.length===2 && S().players.length===0, "Neuer leerer Spielstand aktiv");
  w.eval("closeModal()");
  const first = w.eval("slotIndex").slots[0].id;
  w.eval(`switchSlot("${first}")`);
  ok(S().players.length>20 && S().seasons.length===2, "Zurück zum ersten Spielstand – Daten intakt");
  ok(errs.length===0, "keine Laufzeitfehler im gesamten Durchlauf "+(errs.join("; ")));

  console.log("\n[9] Migration v2 → v3");
  ({w,d,errs,S} = await boot(ls=>{
    const p1 = {id:"a", name:"Alt Spieler", pos:"ST", age:30, salary:40000, contractUntil:2027, fitness:80, happiness:50, role:"x", status:"", note:"", attrs:{pace:10}};
    const p2 = {id:"b", name:"Keeper", pos:"TW", age:25, salary:10000, contractUntil:2029, fitness:99, status:"injured", note:"hi"};
    ls.setItem("fm27_dashboard_state_v1", JSON.stringify({version:2, club:{name:"Legacy FC", ingameDate:"12. März 2027", salaryBudget:1, transferBudget:2},
      formationName:"4-3-3", assignments:{"4-3-3":{0:"b", 9:"a"}}, players:[p1,p2], scouting:[], todos:[{id:"t",text:"x",done:false}], notes:"alt"}));
  }));
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));
  ok(S().club.name==="Legacy FC" && S().club.ingameDate==="2027-03-12", "Datum 'März' korrekt nach ISO konvertiert");
  ok(S().players.every(p=>p.fitness===undefined && p.attrs===undefined), "Fitness/Attribute entfernt");
  ok(S().tactics["4-3-3"].slots[9].playerId==="a" && S().tactics["4-3-3"].slots[9].roleIn==="Mittelstürmer", "Alte Aufstellung übernommen, Rollen ergänzt");
  ok(S().notes==="alt" && S().todos.some(t=>t.id==="t" && t.text==="x") && S().todos.filter(t=>t.text.startsWith("Bosman:")).length===1, "Notizen & Aufgaben erhalten (+ korrekte Bosman-Aufgabe für Vertrag 2027)");
  ok(d.querySelector("#toastMsg").textContent.includes("v2 → v6"), "Hinweis: "+d.querySelector("#toastMsg").textContent);

  console.log("\n[10] Import-Validierung");
  const v = w.eval(`validateImportedState({club:{name:"X"}, players:[{name:"A", pos:"XX", age:"20"}], todos:{}})`);
  ok(!v.valid && v.errors.length===3, "3 konkrete Fehler: "+v.errors.join(" | "));
  const v2 = w.eval(`validateImportedState({version:9, club:{name:"X"}, players:[]})`);
  ok(!v2.valid && v2.errors[0].includes("neueren Version"), "Neuere Schema-Version wird erkannt");
  const repaired = w.eval(`migrateState({version:3, club:{name:"X"}, players:[{name:"Y", rating:99, status:"weird"}], form:[{result:"Q"}]})`);
  ok(repaired.players[0].rating===5 && repaired.players[0].status==="" && Array.isArray(repaired.results) && repaired.results.length===0 && repaired.form===undefined, "Kaputte Werte repariert statt Absturz");

  console.log("\n[11] Phase 4: Freie Formation");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="tactics"]').click();
  ok(w.eval("shapeString(FORMATIONS['4-3-3'])")==="4-1-2-3" && w.eval("shapeString(FORMATIONS['4-2-3-1'])")==="4-2-3-1"
     && w.eval("shapeString(FORMATIONS['3-4-2-1'])")==="3-4-2-1" && w.eval("shapeString(FORMATIONS['5-2-3'])")==="5-2-3", "Formerkennung korrekt (4-1-2-3, 4-2-3-1, 3-4-2-1, 5-2-3)");
  const pidAt2 = S().tactics["4-3-3"].slots[2].playerId;
  w.eval("moveSlotTo(2, 50, 60)");     // IV nach vorne ins defensive Mittelfeld
  ok(S().formationName==="Frei" && S().customFormation.base==="4-3-3", "Verschieben wechselt auf Freie Formation (Basis 4-3-3)");
  ok(S().customFormation.slots[2].cat==="DM" && S().tactics["Frei"].slots[2].roleIn==="Sechser", "IV → DM umbenannt, Rolle angepasst");
  ok(S().tactics["Frei"].slots[2].playerId===pidAt2, "Spieler bleibt auf der verschobenen Position");
  ok(d.querySelector("#formationSelect").value==="Frei" && d.querySelector("#formationSelect").selectedOptions[0].textContent.startsWith("Frei · "), "Dropdown zeigt: "+d.querySelector("#formationSelect").selectedOptions[0].textContent);
  ok(d.querySelector("#formationChip").textContent==="Plan A · "+d.querySelector("#formationSelect").selectedOptions[0].textContent, "Header-Chip zeigt Plan + freie Formation");
  ok(S().tactics["4-3-3"].slots[2].playerId===pidAt2 && w.eval("FORMATIONS['4-3-3'][2].y")===79, "Vorlage 4-3-3 bleibt unverändert");
  w.eval("moveSlotTo(3, 64, 81)");
  ok(S().customFormation.slots[3].cat==="IV", "Kleine Verschiebung innerhalb der Zone behält das Kürzel");
  const slotEl = d.querySelector('#pitch [data-slot="9"]');
  slotEl.focus();
  slotEl.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowUp", shiftKey:true, bubbles:true}));
  ok(S().customFormation.slots[9].y===6, "Pfeiltaste (Shift) verschiebt Stürmer (16 → 6)");
  const fsel = d.querySelector("#formationSelect"); fsel.value="4-3-3"; fsel.dispatchEvent(new w.Event("change"));
  ok(S().formationName==="4-3-3" && !!S().customFormation, "Zurück zu 4-3-3, freie Formation bleibt gespeichert");
  fsel.value="Frei"; fsel.dispatchEvent(new w.Event("change"));
  ok(S().formationName==="Frei" && S().customFormation.slots[2].cat==="DM", "Freie Formation wieder auswählbar");
  const round = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(round.formationName==="Frei" && round.customFormation.slots.length===11 && round.tactics["Frei"].slots[2].roleIn==="Sechser", "Freie Formation übersteht Speichern/Import (sanitize)");
  ok(w.eval(`validateImportedState({club:{name:"X"}, players:[], formationName:"Frei"})`).valid, "Import mit 'Frei' ist gültig");
  const broken = w.eval(`migrateState({version:3, club:{name:"X"}, players:[], formationName:"Frei", customFormation:{slots:[1,2]}})`);
  ok(broken.formationName==="4-3-3" && broken.customFormation===null, "Kaputte freie Formation → sicherer Rückfall auf 4-3-3");
  w.eval("runBestXI()");
  ok(Object.values(S().tactics["Frei"].slots).filter(x=>x.playerId).length===11, "Beste Elf funktioniert in freier Formation");
  // Undo of the conversion restores the template
  ({w,d,errs,S} = await boot());
  w.eval("moveSlotTo(5, 40, 55)");
  d.querySelector("#toastUndoBtn").click();
  ok(S().formationName==="4-3-3" && S().customFormation===null, "Rückgängig nach Umwandlung stellt 4-3-3 wieder her");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[12] Datum & Geburtstage");
  ({w,d,errs,S} = await boot());
  const bdayKids = S().players.filter(p=>p.birthDate.endsWith("-03-13"));
  const ages0 = bdayKids.map(p=>p.age);
  ok(bdayKids.length===1 && S().players.every(p=>p.birthDate && p.age===w.eval(`ageOn("${p.birthDate}", ingameDate())`)), "Beispieldaten: Geburtsdaten passen exakt zum Alter");
  ok(d.querySelector("#btnNextDay").tagName==="BUTTON" && d.querySelector("#ingameDatePill").textContent.includes("12. März 2027"), "Datum ist ein Button");
  d.querySelector("#btnNextDay").click();
  ok(S().club.ingameDate==="2027-03-13", "Klick: +1 Tag → 13.03.2027");
  ok(bdayKids[0].age===ages0[0]+1, `Geburtstagskind ${bdayKids[0].name} ist jetzt ${bdayKids[0].age}`);
  ok(d.querySelector("#toastMsg").textContent.includes("🎂") && d.querySelector("#toastMsg").textContent.includes(bdayKids[0].name), "Hinweis: "+d.querySelector("#toastMsg").textContent);
  d.querySelector("#toastUndoBtn").click();
  ok(S().club.ingameDate==="2027-03-12" && S().players.find(p=>p.id===bdayKids[0].id).age===ages0[0], "Rückgängig setzt Datum und Alter zurück");
  d.querySelector("#btnNextDay").dispatchEvent(new w.MouseEvent("click",{bubbles:true, shiftKey:true}));
  ok(S().club.ingameDate==="2027-03-19" && d.querySelector("#toastMsg").textContent.split("🎂")[1].split(",").length===2, "Shift-Klick +7 Tage, beide Geburtstage der Woche gemeldet");
  ok(d.querySelector("#formCurve") && d.querySelector("#nextMatchBox").textContent.includes("Datum liegt zurück"), "Nächstes Spiel reagiert aufs neue Datum");
  d.body.focus(); key(w,"t");
  ok(S().club.ingameDate==="2027-03-20", "Taste T: +1 Tag");
  // squad birthday marker
  w.eval(`state.club.ingameDate="2027-03-10"; state.players.forEach(p=>{ if(p.birthDate) p.age = ageOn(p.birthDate, ingameDate()); }); renderSquad()`);
  const bd = d.querySelector(`#squadTbody tr[data-id="${bdayKids[0].id}"] .bday`);
  ok(!!bd && bd.title.includes("in 3 Tagen"), "🎂-Hinweis im Kader: "+(bd&&bd.title));
  // age edit shifts birth year
  const pAge = S().players[0]; const md = pAge.birthDate.slice(5);
  const ageInp = d.querySelector(`#squadTbody tr[data-id="${pAge.id}"] [data-field="age"]`);
  ageInp.value = String(pAge.age+2); ageInp.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(pAge.birthDate.slice(5)===md && pAge.age===w.eval(`ageOn("${pAge.birthDate}", ingameDate())`), "Alter in Tabelle ändern verschiebt nur das Geburtsjahr");
  // leap-year birthday & season hint
  ok(w.eval(`daysToBirthday("2004-02-29", new Date(2027,1,27))`)===1, "29. Februar zählt im Nicht-Schaltjahr am 28.");
  w.eval(`state.club.ingameDate="2027-06-30"; applyDateChange("2027-07-01")`);
  ok(d.querySelector("#toastMsg").textContent.includes("Saison abschließen"), "1. Juli: Hinweis auf Saisonwechsel");
  // settings date change goes through the same logic
  w.eval("openSettingsModal()");
  d.querySelector('[data-f="ingameDate"]').value = "2028-07-01"; d.querySelector("[data-modal-save]").click();
  ok(S().players.every(p=>!p.birthDate || p.age===w.eval(`ageOn("${p.birthDate}", ingameDate())`)), "Datum in Einstellungen: Alle Alter nachgezogen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[13] Phase 4: Pläne, Form gegen den Ball, Wechselplan");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="tactics"]').click();
  ok(d.querySelectorAll("#planBar [data-plan]").length===2 && d.querySelector("#planBar .active").textContent==="Plan A", "Start mit Plan A (Beispiel hat auch Plan B)");
  d.querySelector("#planBar [data-plan-add]").click();
  ok(S().plans.length===3 && activeName(w)==="Plan C", "Plan C als Kopie angelegt und aktiv");
  const fs3 = d.querySelector("#formationSelect"); fs3.value="4-4-2"; fs3.dispatchEvent(new w.Event("change"));
  const planA = S().plans[0].id, planB = S().plans[2].id;
  d.querySelector(`#planBar [data-plan="${planA}"]`).click();
  ok(S().formationName==="4-3-3", "Zurück zu Plan A: 4-3-3 unverändert");
  d.querySelector(`#planBar [data-plan="${planB}"]`).click();
  ok(S().formationName==="4-4-2" && d.querySelector("#formationChip").textContent==="Plan C · 4-4-2", "Plan C behält 4-4-2");
  d.querySelector("#planBar [data-plan-edit]").click();
  d.querySelector('[data-f="name"]').value = "Auswärts kompakt"; d.querySelector("[data-modal-save]").click();
  ok(activeName(w)==="Auswärts kompakt", "Plan umbenannt");
  // OOP free position
  d.querySelector('.phase-btn[data-phase="out"]').click();
  w.eval("setOopPos(9, 50, 55)");
  ok(S().tactics["4-4-2"].slots[9].oopPos.y===55 && parseFloat(d.querySelector('#pitch [data-slot="9"]').style.top)===55, "Gegen den Ball: Position frei gesetzt");
  ok(S().formationName==="4-4-2", "Form gegen den Ball ändert die Formation nicht");
  ok(!d.querySelector("#btnResetOop").hidden, "'Form zurücksetzen' sichtbar");
  d.querySelector('.phase-btn[data-phase="in"]').click();
  ok(parseFloat(d.querySelector('#pitch [data-slot="9"]').style.top)===20, "Mit Ball: Originalposition unverändert");
  d.querySelector('.phase-btn[data-phase="out"]').click();
  d.querySelector("#btnResetOop").click();
  ok(!S().tactics["4-4-2"].slots[9].oopPos, "Form gegen den Ball zurückgesetzt");
  // Matchday plan + subs
  d.querySelector('.nav-btn[data-view="fixtures"]').click();
  const ps = d.querySelector("#oppPlan");
  ok(ps.options.length===4 && ps.options[3].textContent.includes("Auswärts kompakt · 4-4-2"), "Spieltag: Planauswahl mit Formation");
  ps.value = planA; ps.dispatchEvent(new w.Event("change"));
  ok(S().nextMatch.planId===planA && d.querySelector("#nextMatchBox").textContent.includes("Plan A · 4-3-3"), "Spiel nutzt Plan A (Portal zeigt ihn)");
  d.querySelector("#btnAddSub").click();
  const row = d.querySelector("#subsEditor .sub-row");
  const outSel = row.querySelector('[data-field="outId"]'), inSel = row.querySelector('[data-field="inId"]');
  const xiA = Object.values(w.eval("planBlock(state.plans[0].id)").tactics["4-3-3"].slots).map(x=>x.playerId);
  ok([...outSel.options].slice(1).every(o=>xiA.includes(o.value)) && [...inSel.options].slice(1).every(o=>!xiA.includes(o.value)), "Raus = Startelf von Plan A, Rein = Bank");
  outSel.value = outSel.options[1].value; outSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  inSel.value = inSel.options[1].value; inSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  const mi = row.querySelector('[data-field="minute"]'); mi.value="60'"; mi.dispatchEvent(new w.Event("change",{bubbles:true}));
  for(let i=0;i<5;i++) d.querySelector("#btnAddSub").click();
  ok(S().nextMatch.subs.length===5 && d.querySelector("#btnAddSub").disabled, "Maximal 5 Wechsel");
  d.querySelector("#btnPrint").click();
  const prText = d.querySelector("#printArea").textContent;
  ok(prText.includes("Wechselplan") && prText.includes("60'") && prText.includes("Plan A · Formation 4-3-3"), "Briefing enthält Plan A und Wechselplan");
  // persistence
  const rt = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rt.plans.length===3 && rt.nextMatch.subs.length===5 && rt.nextMatch.planId===planA && rt.plans[0].data.formationName==="4-3-3", "Pläne & Wechsel überstehen Speichern/Import");
  const old = w.eval(`migrateState({version:3, club:{name:"Alt"}, players:[{id:"x",name:"A",pos:"ST",age:25}], formationName:"4-2-3-1", tactics:{"4-2-3-1":{slots:{10:{playerId:"x"}}}}, nextMatch:{opponent:"Y", subs:"kaputt"}})`);
  ok(old.plans.length===1 && old.plans[0].name==="Plan A" && old.tactics["4-2-3-1"].slots[10].playerId==="x" && Array.isArray(old.nextMatch.subs) && old.players[0].age===25, "Alter Spielstand → Plan A, nichts geht verloren");
  // delete plan
  d.querySelector('.nav-btn[data-view="tactics"]').click();
  d.querySelector("#planBar [data-plan-edit]").click();
  d.querySelector("[data-plan-del]").click();
  ok(S().plans.length===2 && S().nextMatch.planId===planA, "Plan gelöscht, Spieltag-Zuordnung bleibt gültig");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[14] Phase 5: Layout");
  ({w,d,errs,S} = await boot());
  ok(d.querySelectorAll(".p-grip").length===40 && d.querySelectorAll(".p-collapse").length===40, "40 Panels mit Griff und Einklapp-Pfeil (inkl. Journey und 3 Nationalteam-Karten)");
  ok(d.querySelector("#nextMatchBox").closest(".panel-body") && d.querySelector("#slotEditor").closest(".panel-body"), "Inhalte in Panel-Body verschoben, IDs funktionieren weiter");
  ok(d.querySelector("#nextMatchBox").textContent.includes("SV Stahl Blau"), "Portal rendert nach dem Umbau normal");
  const formCard = d.querySelector('[data-panel="form"]');
  formCard.querySelector(".p-collapse").click();
  ok(formCard.classList.contains("collapsed") && formCard.querySelector(".p-collapse").getAttribute("aria-expanded")==="false", "Einklappen per ▾");
  ok(JSON.parse(w.localStorage.getItem("fm27_layout")).collapsed["home:form"]===true, "Eingeklappt-Zustand gespeichert");
  formCard.querySelector("h2").dispatchEvent(new w.MouseEvent("dblclick",{bubbles:true}));
  ok(!formCard.classList.contains("collapsed"), "Doppelklick auf Titel klappt wieder aus");
  // keyboard reorder
  const orderOf = z => [...d.querySelectorAll(`[data-layout="${z}"] > [data-panel]`)].map(x=>x.dataset.panel);
  const homeBefore = orderOf("home");
  const g = d.querySelector('[data-panel="loans"] .p-grip'); g.focus();
  g.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowUp", bubbles:true}));
  const homeAfter = orderOf("home");
  ok(homeAfter.indexOf("loans")===homeBefore.indexOf("loans")-1, "Pfeiltaste verschiebt Panel: "+homeAfter.join(","));
  ok(JSON.stringify(JSON.parse(w.localStorage.getItem("fm27_layout")).order.home)===JSON.stringify(homeAfter), "Reihenfolge gespeichert");
  // re-render must not undo the order or remove controls
  w.eval("renderAll()");
  ok(JSON.stringify(orderOf("home"))===JSON.stringify(homeAfter) && d.querySelectorAll(".p-grip").length===40, "Neu zeichnen behält Reihenfolge und Griffe");
  w.eval("selectedSlot = 3; renderTactics()");
  ok(d.querySelector('[data-panel="slot"] .p-grip') && d.querySelector("#slotEditor .slot-title"), "Dynamisches Positions-Panel behält Griff");
  // layout modal: hide + compact
  key(w,"l");
  ok(d.querySelector("#modal").textContent.includes("Karten im Portal"), "Taste L öffnet Layout-Dialog");
  const cb = d.querySelector('[data-lay-show="home:contracts"]'); cb.checked=false; cb.dispatchEvent(new w.Event("change",{bubbles:true}));
  const cp = d.querySelector('[data-f="compact"]'); cp.checked=true; cp.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector('[data-panel="contracts"]').classList.contains("panel-hidden") && d.body.classList.contains("compact"), "Karte ausgeblendet, kompakte Ansicht aktiv");
  // layout is global: survives slot switch
  w.eval("closeModal(); openSlotsModal()"); d.querySelector('[data-slot-new="sample"]').click();
  ok(d.querySelector('[data-panel="contracts"]').classList.contains("panel-hidden") && JSON.stringify(orderOf("home"))===JSON.stringify(homeAfter), "Layout bleibt beim Spielstand-Wechsel erhalten");
  // reset + undo
  w.eval("closeModal(); resetLayout()");
  ok(JSON.stringify(orderOf("home"))===JSON.stringify(homeBefore) && !d.body.classList.contains("compact") && !d.querySelector(".panel-hidden"), "Layout zurücksetzen");
  d.querySelector("#toastUndoBtn").click();
  ok(JSON.stringify(orderOf("home"))===JSON.stringify(homeAfter) && d.body.classList.contains("compact"), "Zurücksetzen rückgängig gemacht");
  // collapse-all only affects the active view
  w.eval("navigate('fixtures'); setAllCollapsed(true)");
  ok(d.querySelectorAll('[data-layout="fixtures"] .collapsed').length===5 && !d.querySelector('[data-panel="nextMatch"]').classList.contains("collapsed"), "'Alle einklappen' wirkt nur in der aktuellen Ansicht");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  // restored on reload + robust against junk
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_layout", JSON.stringify({order:{home:["xi","gibtsnicht","form"], fixtures:"kaputt"}, collapsed:{"home:xi":true}, hidden:[], compact:"ja"}))));
  const o2 = [...d.querySelectorAll('[data-layout="home"] > [data-panel]')].map(x=>x.dataset.panel);
  ok(o2[0]==="xi" && o2[1]==="form" && o2.length===13 && d.querySelector('[data-panel="xi"]').classList.contains("collapsed"), "Gespeichertes Layout beim Start angewandt, unbekannte IDs ignoriert");
  ok(errs.length===0, "Kaputte Layout-Daten → kein Absturz");
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_layout", "{kein json")));
  ok(errs.length===0 && d.querySelectorAll(".p-grip").length===40, "Ungültiges JSON im Layout → Standardlayout");

  console.log("\n[15] Phase 6: Taktik-Bilanz");
  ({w,d,errs,S} = await boot());
  ok(S().results.length===8 && S().plans.length===2, "Beispieldaten: 8 Ergebnisse, Plan A und B");
  ok(d.querySelectorAll("#formCurve .form-pip:not(.empty)").length===5 && d.querySelector("#formCurve").textContent.includes("10 Pkt."), "Portal: letzte 5 echte Spiele, 10 Punkte");
  ok(d.querySelectorAll("#formCurve .rec-line").length===2, "Portal: Bilanz je Plan");
  const recA = w.eval(`groupRecord(seasonResults(state.club.season), r=>r.planId, r=>planDisplayName(r)).find(g=>g.label.startsWith("Plan A"))`);
  ok(recA.n===5 && recA.w===2 && recA.d===1 && recA.l===2 && Math.abs(recA.ppg-1.4)<1e-9, "Plan A: 2 S · 1 U · 2 N = 1,4 Punkte/Spiel");
  d.querySelector('.nav-btn[data-view="fixtures"]').click();
  const bil = d.querySelector("#bilanzBox").textContent;
  ok(bil.includes("gegen 3er-Kette") && bil.includes("gegen 4er-Kette") && bil.includes("gegen 5er-Kette") && bil.includes("Heim"), "Bilanz nach Abwehrlinie des Gegners und Heim/Auswärts");
  const three = w.eval(`groupRecord(state.results.filter(r=>r.oppFormation), r=>backLineLabel(r.oppFormation), r=>backLineLabel(r.oppFormation)).find(g=>g.key==="gegen 3er-Kette")`);
  ok(three.n===4 && three.w===1 && three.l===2, "Gegen 3er-Kette: 1 S · 1 U · 2 N (die Schwäche wird sichtbar)");
  ok(d.querySelectorAll("#resultsList tbody tr").length===8 && d.querySelector("#resultsList tbody tr .score").textContent==="3:1", "Ergebnisliste neuste zuerst");
  // match-day prompt when the date passes the prepared match
  w.eval(`state.club.ingameDate="2027-03-14"; applyDateChange("2027-03-16")`);
  await new Promise(r=>setTimeout(r,100));
  ok(d.querySelector("#modalOverlay").classList.contains("active") && d.querySelector("#modal").textContent.includes("SV Stahl Blau") && d.querySelector("#modal").textContent.includes("ist vorbei"), "Datum über den Spieltag → Dialog fragt nach dem Ergebnis");
  d.querySelector('#modal [data-f="gf"]').value="2"; d.querySelector('#modal [data-f="ga"]').value="2";
  d.querySelector("[data-modal-save]").click();
  ok(S().results.length===9 && w.eval("sortedResults()[0]").date==="2027-03-15", "Ergebnis mit Spieldatum gespeichert");
  w.eval(`applyDateChange("2027-03-17")`); await new Promise(r=>setTimeout(r,100));
  ok(!d.querySelector("#modalOverlay").classList.contains("active"), "Kein zweites Nachfragen ohne neuen Spieltag");
  // edit keeps snapshot; delete with undo
  const r0 = w.eval("sortedResults()[0]");
  d.querySelector(`#resultsList tr[data-id="${r0.id}"] [data-edit]`).click();
  d.querySelector('#modal [data-f="gf"]').value="3"; d.querySelector("[data-modal-save]").click();
  ok(S().results.find(x=>x.id===r0.id).gf===3 && S().results.find(x=>x.id===r0.id).planName==="Plan A", "Bearbeiten ändert Ergebnis, Plan-Schnappschuss bleibt");
  d.querySelector(`#resultsList tr[data-id="${r0.id}"] [data-del]`).click();
  ok(S().results.length===8, "Ergebnis gelöscht");
  d.querySelector("#toastUndoBtn").click();
  ok(S().results.length===9, "Löschen rückgängig");
  // renamed plan shows the current name, deleted plan keeps the snapshot name
  w.eval(`state.plans[0].name="Heim offensiv"; renderResults()`);
  ok(d.querySelector("#bilanzBox").textContent.includes("Heim offensiv · 4-3-3"), "Umbenannter Plan erscheint mit neuem Namen");
  // season filter
  w.eval(`state.results[0].season="2025/26"; renderResults()`);
  const opts = [...d.querySelector("#resultsSeason").options].map(o=>o.value);
  ok(opts.includes("all") && opts.includes("2025/26"), "Zeitraum-Filter: diese Saison, alle, frühere Saisons");
  // season close keeps the log and archives the record
  w.eval("openCloseSeasonModal()"); d.querySelector("[data-modal-save]").click();
  w.eval("navigate('home')");   // hidden views are drawn when opened (8.7)
  ok(S().results.length===9 && S().seasons[0].summary.includes("Bilanz:") && d.querySelectorAll("#formCurve .form-pip.empty").length===5, "Saisonabschluss: Bilanz archiviert, Protokoll bleibt, neue Saison startet leer");
  ok(!d.querySelector("#formCurve").textContent.includes("Pkt."), "Leere Saison zeigt keine Schein-Punkte mehr");
  // migration v3 → v4: empty placeholders dropped
  const mig = w.eval(`migrateState({version:3, club:{name:"X", season:"2026/27"}, players:[], form:[{result:"W",gf:2,ga:0,opp:"A"},{result:"D",gf:0,ga:0,opp:""},{result:"D",gf:0,ga:0,opp:""},{result:"L",gf:0,ga:1,opp:""},{result:"D",gf:0,ga:0,opp:""}]})`);
  ok(mig.results.length===2 && mig.results[0].opponent==="A" && mig.results[1].opponent==="Unbekannt" && mig.form===undefined, "Migration v3→v4: echte Spiele übernommen, leere 0:0-Plätze verworfen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[16] Phase 6: Zukunfts-Kader");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="squad"]').click();
  d.querySelector('#squadTabs [data-tab="future"]').click();
  ok(d.querySelector("#squad-future").classList.contains("active") && d.querySelector("#futureSquad h2").textContent==="Kader 2027/28", "Reiter 'Nächste Saison' zeigt Kader 2027/28");
  const fs = w.eval("futureSquadEntries()").entries;
  const kindOf = n => (fs.find(e=>e.name===n)||{}).kind;
  ok(kindOf("Mats Böhringer")==="expiring" && kindOf("Felix Arnold")==="sell" && kindOf("Jonas Lindqvist")==="stay", "Vertragsende 2027 → geht, Abgabe → geht, 2029 → bleibt");
  ok(kindOf("Rui Almeida")==="incoming" && kindOf("Léo Ferreira")==="incomingMaybe" && kindOf("Daniel Okafor")===undefined, "Fixiert → Neuzugang, Verhandlung → unsicher, Beobachtet → nicht dabei");
  ok(kindOf("Ben Achterberg")==="loanBack" && kindOf("Karim Haddad")==="loanBack", "Leihen bis 06/2027 kehren zurück");
  const hammar = fs.find(e=>e.name==="Nils Hammar");
  ok(hammar.age===29, "Alter zum 1. Juli (Hammar: 29, Geburtstag im März)");
  ok(d.querySelector(".future-warn").textContent.includes("Arvidsson") , "Warnung: Schlüsselspieler mit auslaufendem Vertrag");
  const sizeBefore = d.querySelector(".fstat strong").textContent;
  d.querySelector("#futureUncertain").click();
  ok(Number(d.querySelector(".fstat strong").textContent)===Number(sizeBefore)+1, "Unsichere einrechnen: +1 (Ferreira in Verhandlung)");
  const arv = S().players.find(p=>p.name==="Henrik Arvidsson");
  d.querySelector(`[data-extend="${arv.id}"]`).click();
  ok(arv.extendPlanned && w.eval("futureSquadEntries()").entries.find(e=>e.name===arv.name).kind==="extend" && !d.querySelector(".future-warn").textContent.includes("Arvidsson"), "Klick: Verlängerung Arvidsson eingeplant, Warnung verschwindet");
  ok(d.querySelector(`.frow .fchip.k-extend[data-extend="${arv.id}"]`), "Chip als 'Verlängerung geplant' markiert");
  const rt2 = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rt2.players.find(p=>p.id===arv.id).extendPlanned===true && rt2.ui.squadTab==="future" && rt2.ui.futureUncertain===true, "Planung übersteht Speichern/Import");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[17] Phase 6: Verkäufe, Budget, Transferfenster, Historie");
  ({w,d,errs,S} = await boot());
  const b0 = w.eval("budgetCalc()");
  ok(b0.salesGross===2500000 && b0.salesIncome===1875000, "Nur Verkauf mit Angebot zählt: 2,5 Mio. × 75 % = 1,875 Mio.");
  ok(b0.transferLeft===30000000+1875000-22000000, "Transferbudget frei = 30 + 1,875 − 22 Mio.");
  ok(b0.wageRelief===588000, "Gehaltsersparnis aus Verkauf (Arnold 588.000 €/Jahr)");
  d.querySelector('.nav-btn[data-view="recruitment"]').click();
  d.querySelector('#transferTabs [data-tab="sell"]').click();
  ok(d.querySelector("#tr-sell").classList.contains("active") && d.querySelectorAll("#salesTbody tr[data-id]").length===2, "Reiter Verkäufe: 2 Spieler auf der Liste");
  ok(d.querySelector('#transferTabs [data-tab="sell"]').textContent==="Verkäufe (2)", "Reiter zeigt Anzahl");
  d.querySelector("#includeListed").click();
  ok(w.eval("budgetCalc()").salesIncome===1875000+3000000, "Gelistete einrechnen: + 4 Mio. × 75 %");
  const sh = d.querySelector("#salesShare"); sh.value="50"; sh.dispatchEvent(new w.Event("change"));
  ok(S().club.salesShare===50 && w.eval("budgetCalc()").salesIncome===3250000, "Budget-Anteil 50 % → 3,25 Mio.");
  ok(d.querySelector("#rSalesLabel").textContent.includes("50 %"), "Budget-Kasten zeigt Anteil");
  sh.value="75"; sh.dispatchEvent(new w.Event("change"));
  // hint for "sell" players not listed
  const wend = S().players.find(p=>p.name==="Tobias Wendland"); wend.squadRole="sell"; w.eval("renderRecruitment()");
  ok(d.querySelector(`#salesHint [data-add-sale="${wend.id}"]`), "Hinweis: 'Abgabe'-Spieler ohne Verkaufseintrag");
  d.querySelector(`#salesHint [data-add-sale="${wend.id}"]`).click();
  ok(d.querySelector('#modal [data-f="playerId"]').value===wend.id, "Klick öffnet Dialog mit vorgewähltem Spieler");
  d.querySelector('#modal [data-f="price"]').value="800000"; d.querySelector("[data-modal-save]").click();
  ok(S().sales.length===3 && !d.querySelector("#salesHint .btn"), "Verkauf geplant, Hinweis verschwindet");
  // complete sale
  const arnold = S().players.find(p=>p.name==="Felix Arnold"), saleA = S().sales.find(x=>x.playerId===arnold.id);
  const tb = S().club.transferBudget, sb = w.eval("budgetCalc().wageHeadroom"), logN = S().transferLog.length;
  d.querySelector(`#salesTbody tr[data-id="${saleA.id}"] [data-complete]`).click();
  d.querySelector('#modal [data-f="fee"]').value="3000000"; d.querySelector('#modal [data-f="club"]').value="SV Hafenstadt";
  d.querySelector("[data-modal-save]").click();
  ok(!S().players.some(p=>p.id===arnold.id) && !S().sales.some(x=>x.playerId===arnold.id), "Verkauf abgeschlossen: Spieler und Listeneintrag weg");
  ok(S().club.transferBudget===tb+2250000 && w.eval("budgetCalc().wageHeadroom")===sb+588000, "Budget +2,25 Mio. (75 % von 3 Mio.), Gehaltsspielraum automatisch +588.000 €/Jahr");
  const lastLog = S().transferLog[S().transferLog.length-1];
  ok(S().transferLog.length===logN+1 && lastLog.type==="out" && lastLog.fee===3000000 && lastLog.club==="SV Hafenstadt" && lastLog.date===S().club.ingameDate, "Historie: Abgang mit Datum, Verein, Ablöse");
  d.querySelector("#toastUndoBtn").click();
  ok(S().players.some(p=>p.id===arnold.id) && S().club.transferBudget===tb && S().transferLog.length===logN, "Verkauf rückgängig gemacht");
  // sign target → history
  const fixedT = S().scouting.find(t=>t.status==="fixed");
  d.querySelector('#transferTabs [data-tab="buy"]').click();
  d.querySelector(`#scoutTbody tr[data-id="${fixedT.id}"] [data-sign]`).click(); d.querySelector("[data-modal-save]").click();
  ok(S().transferLog.some(t=>t.type==="in" && t.name===fixedT.name && t.fee===fixedT.fee), "Verpflichtung landet in der Historie");
  d.querySelector('#transferTabs [data-tab="history"]').click();
  const hist = d.querySelector("#transferHistory").textContent;
  ok(d.querySelectorAll("#transferHistory tbody tr").length===5 && hist.includes("Transfersaldo") && hist.includes("Marco Lenz"), "Historie: 5 Transfers der Saison mit Saldo");
  const spent = S().transferLog.filter(t=>t.type==="in").reduce((a,t)=>a+t.fee,0), earned = S().transferLog.filter(t=>t.type==="out").reduce((a,t)=>a+t.fee,0);
  ok(spent===12500000+3200000+fixedT.fee && earned===6800000+1900000, "Ausgaben/Einnahmen korrekt summiert");
  // transfer window
  const ws = w.eval("windowStatus('2027-03-12')");
  ok(!ws.open && ws.label==="Sommerfenster" && ws.days===111, "12.03.: geschlossen, Sommerfenster öffnet in 111 Tagen");
  ok(d.querySelector("#windowBanner").textContent.includes("öffnet in 111 Tagen"), "Banner: "+d.querySelector("#windowBanner").textContent.trim());
  const w2 = w.eval("windowStatus('2027-08-25')");
  ok(w2.open && w2.days===7, "25.08.: offen, schließt in 7 Tagen");
  ok(w.eval("windowStatus('2027-01-15')").label==="Winterfenster" && w.eval("windowStatus('2027-01-15')").open, "Mitte Januar: Winterfenster offen");
  w.eval(`state.club.ingameDate="2027-06-30"; applyDateChange("2027-07-01")`);
  ok(d.querySelector("#toastMsg").textContent.includes("Sommerfenster geöffnet"), "Datumssprung meldet: "+d.querySelector("#toastMsg").textContent);
  w.eval("openSettingsModal()");
  d.querySelector('[data-f="winSummer"]').value="15.06.–31.08."; d.querySelector('[data-f="winWinter"]').value="Quatsch";
  d.querySelector("[data-modal-save]").click();
  ok(S().club.windows.summer==="15.06.–31.08." && S().club.windows.winter==="01.01.–01.02.", "Einstellungen: Fenster geändert, ungültige Eingabe verworfen");
  ok(w.eval("parseWindow('1.7. bis 1.9.')").sm===7, "Auch '1.7. bis 1.9.' wird verstanden");
  // agreed sale → leaves in next-season squad
  const okon = S().players.find(p=>p.name==="Jamal Okonkwo");
  S().sales.find(x=>x.playerId===okon.id).status="agreed";
  ok(w.eval("futureSquadEntries()").entries.find(e=>e.name==="Jamal Okonkwo").kind==="sell", "Einigung beim Verkauf → Zukunfts-Kader zählt ihn als Abgang");
  // sanitize / migration
  const sz = w.eval(`migrateState({version:4, club:{name:"X", windows:{summer:"kaputt"}}, players:[{id:"a",name:"A"}], sales:[{playerId:"a",price:5,status:"weird"},{playerId:"a",price:9},{playerId:"gibtsnicht"}], transferLog:[{type:"x", fee:-3}]})`);
  ok(sz.sales.length===1 && sz.sales[0].status==="listed" && sz.club.salesShare===100 && sz.club.windows.summer==="01.07.–01.09." && sz.transferLog[0].type==="in" && sz.transferLog[0].fee===0,
     "Bereinigung: Duplikate/fehlende Spieler raus, Standardwerte für alte Spielstände");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[18] Phase 6: Verträge & Gehälter");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="squad"]').click();
  d.querySelector('#squadTabs [data-tab="contracts"]').click();
  ok(d.querySelector("#squad-contracts").classList.contains("active"), "Reiter 'Verträge & Gehälter'");
  ok(d.querySelectorAll(".gantt .g-row:not(.g-axis)").length===20 && d.querySelectorAll(".w-row").length===20, "Vertragskalender und Gehaltsbalken für alle 20 Spieler");
  const firstRow = d.querySelector(".gantt .g-body > .g-row");
  ok(firstRow.querySelector(".g-end").textContent==="2027" && firstRow.querySelector(".g-bar").classList.contains("c-red"), "Kalender sortiert nach Vertragsende, 2027 rot");
  ok(d.querySelector(".year-sum").textContent.includes("2027 6 Verträge"), "Jahresübersicht: 2027 enden 6 Verträge");
  const wr = [...d.querySelectorAll(".w-row")];
  ok(wr[0].querySelector(".w-name").textContent==="Viktor Hrubeš", "Gehälter absteigend (Hrubeš oben)");
  ok(wr.find(r=>r.querySelector(".w-name").textContent==="Samu Laine").querySelector(".w-flag.good"), "Laine als 'Schnäppchen' markiert (4★, niedriges Gehalt)");
  ok(d.querySelector(".insights").textContent.includes("Top 3") && d.querySelector(".role-share").children.length===6, "Kennzahlen und Rollen-Anteile");
  w.eval(`state.players.find(p=>p.name==="Felix Arnold").salary = 1080000; renderContractsView()`);
  ok([...d.querySelectorAll(".w-row")].find(r=>r.querySelector(".w-name").textContent==="Felix Arnold").querySelector(".w-flag.bad"), "Teurer Spieler mit 2★ als 'teuer' markiert");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[19] Beträge, Formate, Gehalt pro Jahr");
  ({w,d,errs,S} = await boot());
  const pm = x => w.eval(`parseMoney(${JSON.stringify(x)})`);
  ok(pm("2.500.000")===2500000 && pm("2,500,000")===2500000 && pm("2,5 Mio")===2500000 && pm("850k")===850000 && pm("1.2m")===1200000
     && pm("€ 300.000")===300000 && pm("")===0 && pm("-1.000")===-1000 && pm("12 tsd")===12000, "Eingaben: 2.500.000 · 2,500,000 · 2,5 Mio · 850k · 1.2m · € 300.000 · 12 tsd");
  const lind = S().players.find(p=>p.name==="Jonas Lindqvist");
  ok(lind.salary===744000, "Gehälter intern pro Jahr (62.000 × 12 = 744.000)");
  const sal = d.querySelector(`#squadTbody tr[data-id="${lind.id}"] [data-field="salary"]`);
  ok(sal.value==="744.000" && d.querySelector('#squadTable th[data-sort="salary"]').textContent==="Gehalt/Jahr", "Kader zeigt 744.000 unter 'Gehalt/Jahr'");
  sal.value = "800k"; sal.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(lind.salary===800000, "'800k' eingegeben → 800.000 gespeichert");
  ok(d.querySelector(`#squadTbody tr[data-id="${lind.id}"] [data-field="salary"]`).value==="800.000", "Feld zeigt danach 800.000");
  // blur reformatting in a modal
  w.eval("openTargetModal()");
  const fee = d.querySelector('#modal [data-f="fee"]');
  ok(fee.value==="5.000.000", "Dialog zeigt Ablöse formatiert");
  fee.value = "7,5 mio"; fee.dispatchEvent(new w.FocusEvent("focusout",{bubbles:true}));
  ok(fee.value==="7.500.000", "Beim Verlassen: '7,5 mio' → 7.500.000");
  d.querySelector('#modal [data-f="name"]').value="Test Ziel"; d.querySelector("[data-modal-save]").click();
  ok(S().scouting.find(t=>t.name==="Test Ziel").fee===7500000 && S().scouting.find(t=>t.name==="Test Ziel").wage===300000, "Transferziel: 7,5 Mio. Ablöse, 300.000 €/Jahr");
  // number format + full display
  w.eval(`state.club.numberFormat="comma"; state.club.moneyDisplay="full"`);
  ok(w.eval("fmtEUR(9875000)")==="€9,875,000", "Komma-Format voll: €9,875,000");
  w.eval(`state.club.moneyDisplay="short"`);
  ok(w.eval("fmtEUR(9875000)")==="€9.88 Mio." && w.eval("fmtNum(24.35,1)")==="24.4", "Komma-Format kurz: €9.88 Mio., Dezimalpunkt");
  w.eval(`state.club.numberFormat="dot"`);
  ok(w.eval("fmtEUR(9875000)")==="€9,88 Mio." && w.eval(`(()=>{ state.club.moneyDisplay="full"; const r = fmtEUR(9875000); state.club.moneyDisplay="short"; return r; })()`)==="€9.875.000", "Punkt-Format: €9,88 Mio. / €9.875.000");
  // wage unit month via settings
  w.eval("openSettingsModal()");
  const wu = d.querySelector('[data-f="wageUnit"]'); wu.value="month";
  d.querySelector("[data-modal-save]").click();
  ok(S().club.wageUnit==="month" && d.querySelector('#squadTable th[data-sort="salary"]').textContent==="Gehalt/Mon.", "Einheit 'pro Monat' → Spaltenkopf Gehalt/Mon.");
  w.eval("navigate('squad')");
  const sal2 = d.querySelector(`#squadTbody tr[data-id="${lind.id}"] [data-field="salary"]`);
  ok(sal2.value==="66.667", "800.000/Jahr als 66.667/Monat angezeigt");
  sal2.value="70.000"; sal2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(lind.salary===840000, "70.000/Monat eingegeben → 840.000/Jahr gespeichert");
  ok(d.querySelector(".stat-chip .wu").textContent==="/Mon.", "Header-Chip folgt der Einheit");
  // computed headroom
  const h0 = w.eval("budgetCalc().wageHeadroom");
  ok(h0===S().club.wageBudget - S().players.reduce((a,p)=>a+p.salary,0), "Gehalts-Spielraum = Budget − aktuelle Gehälter");
  const fx = S().scouting.find(t=>t.status==="fixed");
  w.eval(`signTarget(state.scouting.find(t=>t.status==="fixed"))`); d.querySelector("[data-modal-save]").click();
  ok(w.eval("budgetCalc().wageHeadroom")===h0-fx.wage, "Verpflichtung senkt den Spielraum automatisch um sein Gehalt");
  // migration v5 → v6
  const m6 = w.eval(`migrateState({version:5, club:{name:"Alt", salaryBudget:100000}, players:[{id:"a",name:"A",salary:50000},{id:"b",name:"B",salary:30000}], scouting:[{name:"Z",wage:20000}]})`);
  ok(m6.players[0].salary===600000 && m6.scouting[0].wage===240000 && m6.club.wageBudget===(100000+80000)*12 && m6.club.salaryBudget===undefined,
     "Migration v5→v6: Gehälter ×12, Gesamtbudget = (Spielraum + Gehälter) × 12");
  ok(w.eval(`budgetCalc.call(null)`) && errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[20] Finanzen");
  ({w,d,errs,S} = await boot());
  d.body.focus(); key(w,"5");
  ok(d.querySelector("#view-finance").classList.contains("active"), "Taste 5 → Finanzen");
  key(w,"8"); ok(d.querySelector("#view-notes").classList.contains("active"), "Taste 8 → Notizen");
  key(w,"5");
  ok(d.querySelectorAll("#finStats .fstat").length===4 && d.querySelector("#finStats").textContent.includes("€21,6 Mio."), "Kennzahlen: Kontostand €21,6 Mio. u. a.");
  ok(d.querySelectorAll("#balanceChart .bc-pt").length===6 && d.querySelector("#balanceChart .bc-line"), "Kontostand-Kurve mit 6 Punkten");
  ok(d.querySelectorAll("#finWages .usage-row").length===3, "Gehaltsauslastung: heute, nach Transfers, nächste Saison");
  const usageToday = S().players.reduce((a,p)=>a+p.salary,0)/13000000*100;
  ok(d.querySelector("#finWages .usage-pct").textContent===Math.round(usageToday)+" %", "Auslastung heute "+Math.round(usageToday)+" %");
  // edit budgets on the finance page
  const wb = d.querySelector('#finBudgets [data-fin="wageBudget"]'); wb.value="10 Mio"; wb.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().club.wageBudget===10000000 && d.querySelector("#finWages .usage-pct.over"), "Gehaltsbudget 10 Mio. → über Budget (rot)");
  ok(d.querySelector("#salaryBudgetChip").classList.contains("neg"), "Header zeigt negativen Gehalts-Spielraum");
  // balance entries
  d.querySelector("#btnAddBalance").click();
  d.querySelector('#modal [data-f="amount"]').value="23,1 mio"; d.querySelector("[data-modal-save]").click();
  ok(S().balanceLog.length===7 && S().balanceLog.find(x=>x.date==="2027-03-12").amount===23100000, "Kontostand '23,1 mio' zum Spieldatum eingetragen");
  d.querySelector("#btnAddBalance").click();
  d.querySelector('#modal [data-f="amount"]').value="23.500.000"; d.querySelector("[data-modal-save]").click();
  ok(S().balanceLog.length===7 && S().balanceLog.find(x=>x.date==="2027-03-12").amount===23500000, "Gleicher Tag → Eintrag aktualisiert statt doppelt");
  ok(d.querySelector("#finStats").textContent.includes("+€1,9 Mio. seit"), "Veränderung seit letztem Eintrag");
  d.querySelector("#balanceList tbody tr [data-del-bal]").click();
  ok(S().balanceLog.length===6, "Eintrag gelöscht"); d.querySelector("#toastUndoBtn").click(); ok(S().balanceLog.length===7, "Löschen rückgängig");
  ok(d.querySelectorAll("#finTransfers .sb-row").length===1 && d.querySelector("#finTransfers .sb-net").textContent==="−€7 Mio.", "Transfers je Saison: 2026/27 Saldo −€7 Mio.");
  const bl = w.eval(`migrateState({version:6, club:{name:"X"}, players:[], balanceLog:[{date:"kaputt", amount:5},{date:"2027-01-01", amount:"12"}]})`);
  ok(bl.balanceLog.length===1 && bl.balanceLog[0].amount===12, "Bereinigung: ungültige Kontostand-Einträge verworfen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[21] Admin: PIN & Sperre");
  ({w,d,errs,S} = await boot());
  ok(w.eval(`sha256hex("abc")`)==="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" && w.eval(`sha256hex("")`)==="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
     && w.eval(`sha256hex("a".repeat(1000))`)==="41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3", "SHA-256 stimmt mit offiziellen Prüfwerten überein");
  d.querySelector("#btnAdmin").click();
  ok(w.eval("adminVisible()") && d.querySelector("#adminRoot").textContent.includes("einrichten"), "Erster Aufruf: PIN einrichten");
  d.querySelector("#pinNew1").value="1234"; d.querySelector("#pinNew2").value="1235"; d.querySelector("#btnSetPin").click();
  ok(d.querySelector("#pinMsg").textContent.includes("stimmen nicht"), "Abweichende Wiederholung abgelehnt");
  d.querySelector("#pinNew1").value="12"; d.querySelector("#pinNew2").value="12"; d.querySelector("#btnSetPin").click();
  ok(d.querySelector("#pinMsg").textContent.includes("Mindestens 4"), "Zu kurzer PIN abgelehnt");
  d.querySelector("#pinNew1").value="4711"; d.querySelector("#pinNew2").value="4711"; d.querySelector("#btnSetPin").click();
  ok(d.querySelector("#adminTabs") && d.querySelectorAll("#adminBody .adm2-tile").length===4 && d.querySelector("#adminBody .adm2-score"), "PIN gesetzt → Admin-Übersicht offen (Gesundheitswert + Kacheln)");
  const cfg = JSON.parse(w.localStorage.getItem("fm27_admin"));
  ok(cfg.hash && cfg.hash.length===64 && cfg.salt && !JSON.stringify(cfg).includes("4711"), "Gespeichert nur Salt + Hash, nie der PIN");
  d.querySelector("#btnLockAdmin").click();
  ok(d.querySelector("#pinInput") && !d.querySelector("#adminTabs"), "Sperren → Sperrbildschirm");
  d.querySelector("#pinInput").value="0000"; d.querySelector("#btnUnlock").click();
  ok(d.querySelector("#pinMsg").textContent==="Falscher PIN." && !d.querySelector("#adminTabs"), "Falscher PIN abgelehnt");
  for(let i=0;i<4;i++){ d.querySelector("#pinInput").value="0000"; d.querySelector("#btnUnlock").click(); }
  ok(d.querySelector("#pinMsg").textContent.includes("warten"), "5 Fehlversuche → Wartezeit: "+d.querySelector("#pinMsg").textContent);
  d.querySelector("#pinInput").value="4711"; d.querySelector("#btnUnlock").click();
  ok(!d.querySelector("#adminTabs"), "Während der Wartezeit hilft auch der richtige PIN nicht");
  const c2 = JSON.parse(w.localStorage.getItem("fm27_admin")); c2.lockedUntil = 0; w.localStorage.setItem("fm27_admin", JSON.stringify(c2));
  d.querySelector("#pinInput").value="4711"; d.querySelector("#pinInput").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  ok(!!d.querySelector("#adminTabs"), "Richtiger PIN (Enter) entsperrt");
  w.eval("adminLastActivity = Date.now() - 11*60000");
  d.body.dispatchEvent(new w.MouseEvent("pointerdown",{bubbles:true}));
  ok(!w.eval("adminUnlocked") && d.querySelector("#pinInput"), "Nach 10 Min. Inaktivität: nächste Aktion sperrt");
  d.querySelector("#pinInput").value="4711"; d.querySelector("#btnUnlock").click();
  d.querySelector('[data-atab="security"]').click();
  d.querySelector("#lockOnLeave").click();
  w.eval("navigate('home')");
  ok(!w.eval("adminUnlocked"), "Option 'beim Verlassen sperren' greift");
  ok(d.querySelector("#squadTbody tr [data-field='salary']") && !d.querySelector(".nav-btn.active[data-view='admin']"), "Restliches Dashboard bleibt frei nutzbar");
  // forgot PIN
  w.eval("navigate('admin')"); d.querySelector("#btnForgotPin").click();
  d.querySelector('#modal [data-f="confirm"]').value="ja"; d.querySelector("[data-modal-save]").click();
  ok(w.eval("hasPin()"), "PIN vergessen: ohne exakte Bestätigung passiert nichts");
  d.querySelector('#modal [data-f="confirm"]').value="zurücksetzen"; d.querySelector("[data-modal-save]").click();
  ok(!w.eval("hasPin()") && w.eval("readLog()").some(e=>e.text && e.text.includes("PIN wurde")), "PIN zurückgesetzt – Vermerk im Protokoll");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[22] Admin: Änderungsprotokoll");
  ({w,d,errs,S} = await boot());
  const L = () => w.eval("readLog()");
  const lind2 = S().players.find(p=>p.name==="Jonas Lindqvist");
  const salIn = () => d.querySelector(`#squadTbody tr[data-id="${lind2.id}"] [data-field="salary"]`);
  salIn().value = "800.000"; salIn().dispatchEvent(new w.Event("change",{bubbles:true}));
  let e1 = L().slice(-1)[0];
  ok(e1.field==="salary" && e1.from===744000 && e1.to===800000 && w.eval(`logText(readLog().slice(-1)[0])`).includes("Gehalt · Jonas Lindqvist: €744 Tsd./Jahr → €800 Tsd./Jahr"), "Protokoll: "+w.eval(`logText(readLog().slice(-1)[0])`));
  const n1 = L().length;
  salIn().value = "850.000"; salIn().dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(L().length===n1 && L().slice(-1)[0].to===850000 && L().slice(-1)[0].from===744000, "Schnelle Folgeänderung wird zusammengefasst (744 → 850 Tsd.)");
  salIn().value = "744.000"; salIn().dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(L().length===n1-1, "Zurück zum Ausgangswert → Eintrag verschwindet");
  // add + delete + revert remove
  w.eval("openPlayerModal()"); d.querySelector('#modal [data-f="name"]').value="Neu Mann"; d.querySelector("[data-modal-save]").click();
  ok(L().slice(-1)[0].action==="add" && L().slice(-1)[0].entity==="Neu Mann", "Neuer Spieler protokolliert");
  const neu = S().players.find(p=>p.name==="Neu Mann");
  d.querySelector(`#squadTbody tr[data-id="${neu.id}"] [data-del]`).click();
  const delE = L().slice(-1)[0];
  ok(delE.action==="remove" && delE.before.name==="Neu Mann", "Löschen protokolliert (inkl. Daten zum Wiederherstellen)");
  ok(w.eval(`revertLogEntry("${delE.id}")`) && S().players.some(p=>p.id===neu.id), "Gelöschten Spieler aus dem Protokoll zurückgeholt");
  ok(L().find(x=>x.id===delE.id).reverted, "Ursprünglicher Eintrag als zurückgenommen markiert");
  // revert an older change while newer ones exist on other fields
  const fayeNow = () => S().players.find(p=>p.name==="Aurelien Faye");
  w.eval(`state.players.find(p=>p.name==="Aurelien Faye").rating = 2; saveState()`);
  const rE = L().slice(-1)[0];
  w.eval(`state.club.transferBudget = 31000000; saveState()`);
  ok(w.eval(`revertLogEntry("${rE.id}")`) && fayeNow().rating===5 && S().club.transferBudget===31000000, "Ältere Änderung einzeln zurückgenommen, neuere bleibt");
  // conflict: same field changed again later (not merged, > 90 s)
  w.eval(`state.players.find(p=>p.name==="Aurelien Faye").note = "A"; saveState()`);
  const cE = L().slice(-1)[0]; w.eval(`(()=>{ const l = readLog(); l[l.length-1].ts -= 200000; writeLog(l); })()`);
  w.eval(`state.players.find(p=>p.name==="Aurelien Faye").note = "B"; saveState()`);
  ok(!w.eval(`revertLogEntry("${cE.id}")`) && fayeNow().note==="B" && d.querySelector("#toastMsg").textContent.includes("Inzwischen erneut geändert"), "Konflikt erkannt: neuere Änderung wird nicht überschrieben");
  // Ctrl+Z
  d.body.focus(); key(w,"z",{ctrlKey:true});
  ok(fayeNow().note==="A" && d.querySelector("#toastMsg").textContent.startsWith("Zurückgenommen"), "Strg+Z nimmt die letzte Änderung zurück");
  key(w,"z",{ctrlKey:true});
  ok(fayeNow().note==="", "Nochmal Strg+Z → davor liegende Änderung");
  // date change: ingameDate logged, derived ages not
  const before2 = L().length; w.eval("nextDay(1)");
  const newE = L().slice(before2);
  ok(newE.some(x=>x.field==="ingameDate") && !newE.some(x=>x.field==="age"), "Datumssprung protokolliert, abgeleitete Alter nicht");
  // tactics → info entry
  w.eval("state.formationName='4-4-2'; saveState()");
  ok(L().slice(-1)[0].area==="Taktik" && L().slice(-1)[0].text.includes("4-3-3 → 4-4-2") && L().slice(-1)[0].revertible===false, "Taktik-Änderungen erscheinen als Hinweis-Eintrag");
  // big change collapses
  w.eval(`state = freshState("empty"); saveState()`);
  ok(L().slice(-1)[0].text.startsWith("Umfangreiche Änderung"), "Großer Umbau → ein Sammeleintrag");
  // slot switch does not log a giant diff into the other save
  w.eval("openSlotsModal()"); d.querySelector('[data-slot-new="sample"]').click(); w.eval("closeModal()");
  ok(L().length===0 || !L().some(x=>x.text && x.text.startsWith("Umfangreiche")), "Neuer Spielstand hat ein eigenes, sauberes Protokoll");
  // admin log view + revert button
  w.eval(`state.club.salesShare = 60; saveState()`);
  w.eval("setPin('9999'); adminUnlocked = true; adminTab = 'log'; navigate('admin')");
  ok(d.querySelectorAll("#logListBox .log-row").length>=1 && d.querySelector("#logListBox .log-row").textContent.includes("Budget-Anteil Verkäufe"), "Protokoll-Ansicht zeigt Einträge");
  const ls = d.querySelector("#logSearch"); ls.value="gibtsnichtxyz"; ls.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(d.querySelector("#logListBox").textContent.includes("Keine passenden"), "Suche filtert");
  ls.value=""; ls.dispatchEvent(new w.Event("input",{bubbles:true}));
  d.querySelector("#logListBox [data-revert]").click();
  ok(S().club.salesShare===75, "↶ im Protokoll nimmt die Änderung zurück");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[23] Admin: Wiederherstellung & Backup");
  ({w,d,errs,S} = await boot());
  const RP = () => w.eval("readRestorePoints()");
  w.eval("nextDay(1)");
  ok(RP().length===1 && RP()[0].reason==="Vor Datumssprung" && RP()[0].gameDate==="2027-03-12", "Datumssprung legt automatisch einen Punkt an");
  w.eval("nextDay(1)"); w.eval("nextDay(1)");
  ok(RP().length===1, "Nicht bei jedem Klick – höchstens alle 7 Spieltage bzw. 30 Min.");
  w.eval("state.club.ingameDate = '2027-03-30'; nextDay(1)");
  ok(RP().length===2, "Nach über 7 Spieltagen wieder ein Punkt");
  w.eval("setPin('1111'); adminUnlocked = true; adminTab = 'restore'; navigate('admin')");
  d.querySelector("#btnManualRp").click(); d.querySelector('#modal [data-f="label"]').value="Vor Transfersommer"; d.querySelector("[data-modal-save]").click();
  ok(RP()[0].manual && RP()[0].reason==="Vor Transfersommer" && d.querySelectorAll("#adminBody [data-rp]").length===3, "Manueller Punkt mit eigener Bezeichnung");
  const tbBefore = S().club.transferBudget;
  w.eval("state.club.transferBudget = 1; state.players.splice(0,5); saveState()");
  d.querySelector('#adminBody [data-rp] [data-rp-restore]').click(); d.querySelector("[data-modal-save]").click();
  ok(S().club.transferBudget===tbBefore && S().players.length===20, "Wiederhergestellt: Budget und 5 gelöschte Spieler zurück");
  ok(RP()[0].reason==="Vor Wiederherstellung" && w.eval("readLog()").slice(-1)[0].text.startsWith("Wiederherstellungspunkt geladen"), "Vorher automatisch gesichert + Protokoll-Vermerk");
  w.eval("createRestorePoint('Import-Test')"); w.eval("for(let i=0;i<15;i++){ createRestorePoint('Auto '+i); }");
  ok(RP().filter(x=>!x.manual).length===10 && RP().some(x=>x.manual), "Höchstens 10 automatische Punkte, manuelle bleiben");
  // backup reminder
  w.eval("(()=>{ const l = readLog(); for(let i=0;i<30;i++) l.push({id:'x'+i, ts:Date.now(), area:'Test', action:'info', text:'t', revertible:false}); writeLog(l); })(); backupReminder()");
  ok(d.querySelector("#toastMsg").textContent.includes("Noch kein Backup") && d.querySelector("#toastUndoBtn").textContent==="Jetzt exportieren", "Backup-Erinnerung mit Export-Knopf");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  d.querySelector("#btnExport").click();
  ok(w.eval("activeSlotMeta().lastExport") > 0, "Export merkt sich den Zeitpunkt");
  d.querySelector("#toastMsg").textContent=""; w.eval("backupReminder()");
  ok(d.querySelector("#toastMsg").textContent==="", "Nach frischem Export keine Erinnerung");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[24] Admin: Datenprüfung & Rohdaten");
  ({w,d,errs,S} = await boot());
  w.eval("setPin('1111'); adminUnlocked = true; adminTab = 'health'; navigate('admin')");
  const baseIssues = w.eval("runHealthChecks()").filter(x=>x.sev==="error").length;
  ok(baseIssues===0, "Beispieldaten: keine Fehler");
  w.eval(`(()=>{ const sl = currentSlots(); sl[5].playerId = sl[6].playerId; const p = state.players[0]; p.age = 50;
    state.scouting.push({id:"dup", name:"Viktor Hrubeš", pos:"ST", age:28, grade:"A", status:"watched", fee:1, bonus:0, wage:0, priority:1, note:""});
    state.penaltyOrder = [state.players[1].id, state.players[1].id]; })(); renderAdmin()`);
  const iss = w.eval("runHealthChecks()");
  ok(iss.some(x=>x.text.includes("doppelt aufgestellt")) && iss.some(x=>x.text.includes("passt nicht zum Geburtsdatum")) && iss.some(x=>x.text.includes("steht schon im Kader")) && iss.some(x=>x.text.includes("Elfmeter")),
     "Erkannt: Doppelt aufgestellt, falsches Alter, Ziel schon im Kader, doppelter Elfmeterschütze");
  ok(d.querySelectorAll("#adminBody .health-list .h-error").length===2, "Fehler rot markiert");
  d.querySelector("#btnFixAll").click();
  const afterFix = w.eval("runHealthChecks()");
  ok(!afterFix.some(x=>x.sev==="error") && !afterFix.some(x=>x.text.includes("steht schon im Kader")) && !afterFix.some(x=>x.text.includes("Elfmeter")), "'Alle beheben' repariert alles Automatische");
  ok(S().players[0].age===29 && !S().scouting.some(t=>t.id==="dup"), "Alter korrigiert, doppeltes Ziel entfernt");
  // raw editor
  d.querySelector('[data-atab="raw"]').click();
  ok(d.querySelectorAll("#adminBody .raw-table tbody tr").length===20, "Rohdaten: 20 Spieler-Zeilen");
  const cell = (id,k) => d.querySelector(`#adminBody tr[data-raw-id="${id}"] [data-raw-key="${k}"]`);
  const p0 = S().players[0];
  const sc = cell(p0.id, "salary"); sc.value = "2,5 mio"; sc.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].salary===2500000, "Rohdaten: '2,5 mio' → 2.500.000");
  const ap = cell(p0.id, "altPos"); ap.value = "IV, ST"; ap.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(JSON.stringify(S().players[0].altPos)==='["IV","ST"]', "Rohdaten: Liste als Komma-Text");
  const rtc = cell(p0.id, "rating"); rtc.value = "2"; rtc.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].rating===2 && d.querySelector(`#adminBody tr[data-raw-id="${p0.id}"] [data-raw-key="rating"]`).tagName==="SELECT", "Rohdaten: Einschätzung als Sterne-Auswahl (→ 2)");
  const tt = d.querySelector("#rawTechToggle"); tt.checked = true; tt.dispatchEvent(new w.Event("change",{bubbles:true}));
  const rtt = d.querySelector(`#adminBody tr[data-raw-id="${p0.id}"] [data-raw-key="rating"]`); rtt.value = "99"; rtt.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].rating===5, "Technische Ansicht: ungültiger Wert wird korrigiert (99 → 5)");
  const tt2 = d.querySelector("#rawTechToggle"); tt2.checked = false; tt2.dispatchEvent(new w.Event("change",{bubbles:true}));
  const rc = d.querySelector("#rawColl"); rc.value="club"; rc.dispatchEvent(new w.Event("change",{bubbles:true}));
  const win = d.querySelector('#adminBody [data-raw-key="windows"]'); const winOld = win.value;
  win.value = "{kaputt"; win.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector("#toastMsg").textContent.includes("Ungültiges JSON") && JSON.stringify(S().club.windows)===winOld, "Ungültiges JSON wird abgelehnt, Wert bleibt");
  ok(w.eval("readLog()").some(e=>e.field==="rating" && e.entity===p0.name), "Rohdaten-Änderungen landen im Protokoll");
  d.querySelector('[data-atab="overview"]').click();
  ok(d.querySelector("#adminBody").textContent.includes("Datenschema") && d.querySelector("#adminBody").textContent.includes("v6"), "Übersicht: Speicher & Schema");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  ok(w.eval(`fmtLogValue("status","")`)==="Verfügbar" && w.eval(`fmtLogValue("status","injured")`)==="Verletzt", "Status 'verfügbar' wird im Protokoll richtig benannt");
  console.log("\n[25] Import-Parser");
  ({w,d,errs,S} = await boot());
  const E = x => JSON.stringify(w.eval(x));
  ok(E(`parseFMPositions("D (RLC)")`)==='["IV","LV","RV"]' && E(`parseFMPositions("V/FV (L)")`)==='["LV"]' && E(`parseFMPositions("AM (C), ST (C)")`)==='["OM","ST"]'
     && E(`parseFMPositions("GK")`)==='["TW"]' && E(`parseFMPositions("OM (RLZ)")`)==='["OM","LF","RF"]' && E(`parseFMPositions("DM, ZM")`)==='["DM","ZM"]', "FM-Positionen (englisch/deutsch/eigene) übersetzt, Mitte zuerst");
  ok(w.eval(`parseWageCell("€12,000 p/w","year")`)===624000 && w.eval(`parseWageCell("45.000 € p.M.","week")`)===540000 && w.eval(`parseWageCell("€2.3M p/a","week")`)===2300000
     && w.eval(`parseWageCell("744000","year")`)===744000 && w.eval(`parseWageCell("N/A","week")`)===null, "Gehälter: p/w · p.M. · p/a · ohne Einheit · N/A");
  ok(E(`parseDateCell("30/6/2027")`)==='{"iso":"2027-06-30","year":2027}' && w.eval(`parseDateCell("12/3/1998 (29 years old)").iso`)==="1998-03-12" && w.eval(`parseDateCell("Juni 2029").year`)===2029, "Datumsformate");
  ok(w.eval(`parseTable("<table><tr><th>Name</th></tr><tr><td>A</td></tr></table>").length`)===2 && E(`parseTable('Name;Notiz\\n"X; Y";z')[1]`)==='["X; Y","z"]', "HTML-Tabelle und CSV mit Anführungszeichen");
  ok(E(`guessMapping(["Inf","Name","Position","Alter","Gehalt","Vertragsende","Kaderstatus"])`)==='["","name","pos","age","salary","contractUntil","squadRole"]', "Spalten automatisch zugeordnet");
  ok(w.eval(`parseRoleCell("Key Player")`)==="key" && w.eval(`parseRoleCell("Hot Prospect")`)==="prospect" && w.eval(`parseRoleCell("Nicht benötigt")`)==="sell", "FM-Kaderstatus → Kaderrolle");

  console.log("\n[26] Import-Assistent (FM-Textdatei)");
  const fm = `| Inf | Name              | Position        | Age | Wage          | Expires    |
|-----|-------------------|-----------------|-----|---------------|------------|
|     | Jonas Lindqvist   | GK              | 29  | €14,500 p/w   | 30/6/2031  |
| Inj | Dario Kessel      | D (RLC)         | 24  | €12,000 p/w   | 30/6/2030  |
|     | Aurelien Faye     | D (C), DM       | 27  | €18,000 p/w   | 30/6/2028  |
|     | Nico Brandt       | AM (RL), ST (C) | 19  | €2,000 p/w    | 30/6/2028  |
|     | Ben Achterberg    | AM (C)          | 20  | €3,000 p/w    | 30/6/2027  |
|     | Nico Brandt       | ST (C)          | 19  | €2,000 p/w    | 30/6/2028  |`;
  d.querySelector('.nav-btn[data-view="squad"]').click();
  d.querySelector("#btnImportFM").click();
  ok(d.querySelector("#modal h3").textContent.includes("1/3"), "Schritt 1: Quelle");
  d.querySelector("[data-modal-save]").click();
  ok(d.querySelector("#impMsg").textContent.includes("Keine Tabelle"), "Leere Eingabe abgelehnt");
  d.querySelector("#impText").value = fm; d.querySelector("[data-modal-save]").click();
  await new Promise(r=>setTimeout(r,10));
  ok(d.querySelector("#modal h3").textContent.includes("2/3") && d.querySelectorAll("#modal [data-map]").length===6, "Schritt 2: 6 Spalten erkannt");
  ok(d.querySelector('#modal [data-map="1"]').value==="name" && d.querySelector('#modal [data-map="4"]').value==="salary" && d.querySelector('#modal [data-f="wageUnit"]').value==="week", "Zuordnung vorbelegt, Einheit Woche");
  const nameSel = d.querySelector('#modal [data-map="1"]'); nameSel.value=""; nameSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  d.querySelector("[data-modal-save]").click();
  ok(d.querySelector("#impMsg").textContent.includes("Namensspalte"), "Ohne Namensspalte geht es nicht weiter");
  nameSel.value="name"; nameSel.dispatchEvent(new w.Event("change",{bubbles:true}));
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  const dif = w.eval("importCtx.diff");
  ok(d.querySelector("#modal h3").textContent.includes("3/3"), "Schritt 3: Abgleich");
  ok(dif.added.length===2 && dif.changed.length===2 && dif.unchanged.length===1 && dif.missing.length===17, `Abgleich: ${dif.added.length} neu, ${dif.changed.length} geändert, ${dif.missing.length} nicht in der Datei`);
  const lindChg = dif.changed.find(x=>x.player.name==="Jonas Lindqvist").changes;
  ok(lindChg.some(c=>c.field==="salary" && c.to===754000) && lindChg.some(c=>c.field==="contractUntil" && c.to===2031), "Lindqvist: Gehalt 14.500 p/w → 754.000/Jahr, Vertrag 2031");
  const kes = dif.changed.find(x=>x.player.name==="Dario Kessel").changes;
  ok(!kes.some(c=>c.field==="pos") && kes.some(c=>c.field==="altPos" && JSON.stringify(c.to)==='["LV","RV"]'), "Kessel bleibt IV (Hauptposition behalten), Nebenpositionen LV, RV neu");
  ok(w.eval("importCtx.warnings").some(x=>x.includes("mehrfach")), "Doppelter Name in der Datei gemeldet");
  const achter = d.querySelector('#modal [data-imp-add="1"]');
  ok(dif.added[1].rec.name==="Ben Achterberg" && dif.added[1].note==="steht unter Leihen" && !achter.checked, "Achterberg (verliehen) als Duplikat-Verdacht, nicht vorausgewählt");
  ok(d.querySelectorAll("#modal [data-imp-del]:checked").length===0, "Fehlende Spieler werden standardmäßig behalten");
  const tbPlayers = S().players.length, rpN = w.eval("readRestorePoints().length");
  d.querySelector("[data-modal-save]").click();
  const brandt = S().players.find(p=>p.name==="Nico Brandt");
  ok(S().players.length===tbPlayers+1 && brandt && brandt.pos==="LF" && JSON.stringify(brandt.altPos)==='["RF","ST"]' && brandt.salary===104000 && brandt.contractUntil===2028, "Neuer Spieler angelegt (LF + RF/ST, 104.000/Jahr, bis 2028)");
  ok(S().players.find(p=>p.name==="Jonas Lindqvist").salary===754000 && S().players.find(p=>p.name==="Jonas Lindqvist").rating===4, "Änderungen übernommen, eigene Einschätzung unangetastet");
  ok(w.eval("readRestorePoints().length")===rpN+1 && w.eval("readRestorePoints()[0].reason")==="Vor Kader-Import", "Wiederherstellungspunkt vor dem Import");
  ok(w.eval("readLog()").slice(-1)[0].text.includes("Kader-Import: 1 neu, 2 geändert, 0 entfernt"), "Protokoll-Eintrag zum Import");
  d.querySelector("#toastUndoBtn").click();
  ok(S().players.length===tbPlayers && S().players.find(p=>p.name==="Jonas Lindqvist").salary===744000, "Import rückgängig gemacht");
  // removal of missing players (full-squad file)
  w.eval("openImportWizard()"); d.querySelector("#impText").value = fm; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  const firstMissing = w.eval("importCtx.diff.missing[0].name");
  d.querySelector('#modal [data-imp-del="0"]').checked = true;
  d.querySelector("[data-modal-save]").click();
  ok(!S().players.some(p=>p.name===firstMissing), `Angehakter fehlender Spieler (${firstMissing}) entfernt`);
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[27] CSV-Export & Rundlauf");
  ({w,d,errs,S} = await boot());
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  const csv = w.eval("exportSquadCSV()");
  const lines = csv.replace(/^\uFEFF/,"").split("\r\n");
  ok(csv.charCodeAt(0)===0xFEFF && lines.length===21 && lines[0].startsWith("Name;Position;Nebenpositionen;Land;Alter;Geburtsdatum;Gehalt pro Jahr;Transferwert"), "CSV: BOM, Semikolon, Kopfzeile + 20 Spieler");
  const faye = S().players.find(p=>p.name==="Aurelien Faye");
  const edited = lines.map(l=>l.startsWith("Aurelien Faye;") ? l.replace(";"+faye.salary+";", ";1200000;") : l).join("\n");
  w.eval("openImportWizard()"); d.querySelector("#impText").value = edited; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  ok(d.querySelector('#modal [data-f="wageUnit"]').value==="year", "Spalte 'Gehalt pro Jahr' → Einheit Jahr erkannt");
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  const d2 = w.eval("importCtx.diff");
  ok(d2.added.length===0 && d2.changed.length===1 && d2.unchanged.length===19 && d2.changed[0].changes.length===1 && d2.changed[0].changes[0].to===1200000,
     "Rundlauf: nur die eine geänderte Zelle wird erkannt (Rollen, Status, Sterne, Geburtsdaten stimmen)");
  d.querySelector("[data-modal-save]").click();
  ok(S().players.find(p=>p.name==="Aurelien Faye").salary===1200000, "Geändertes Gehalt übernommen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[28] Massenbearbeitung");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="squad"]').click();
  ok(d.querySelector("#bulkBar").hidden, "Leiste erst sichtbar, wenn etwas ausgewählt ist");
  const boxes = [...d.querySelectorAll("#squadTbody [data-sel]")].slice(0,3);
  boxes.forEach(b=>{ b.checked = true; b.dispatchEvent(new w.Event("change",{bubbles:true})); });
  ok(!d.querySelector("#bulkBar").hidden && d.querySelector("#bulkBar").textContent.includes("3 ausgewählt") && d.querySelector("#selAll").indeterminate, "3 ausgewählt, 'Alle'-Haken halb gesetzt");
  const ids3 = boxes.map(b=>b.dataset.sel);
  const rs = d.querySelector('#bulkBar [data-bulk="squadRole"]'); rs.value="backup"; rs.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(ids3.every(id=>S().players.find(p=>p.id===id).squadRole==="backup"), "Kaderrolle für alle 3 gesetzt");
  d.querySelector("#toastUndoBtn").click();
  ok(!ids3.every(id=>S().players.find(p=>p.id===id).squadRole==="backup"), "In einem Schritt rückgängig");
  ok(d.querySelectorAll("#squadTbody [data-sel]:checked").length===3, "Auswahl bleibt nach dem Neuzeichnen erhalten");
  const st = d.querySelector('#bulkBar [data-bulk="status"]'); st.value="injured"; st.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(ids3.every(id=>S().players.find(p=>p.id===id).status==="injured"), "Status für alle 3 gesetzt");
  d.querySelector("#bulkContract").value="2032"; d.querySelector('[data-bulk-act="contract"]').click();
  ok(ids3.every(id=>S().players.find(p=>p.id===id).contractUntil===2032), "Verträge bis 2032");
  d.querySelector('[data-bulk-act="sale"]').click();
  ok(ids3.every(id=>S().sales.some(x=>x.playerId===id) && S().players.find(p=>p.id===id).squadRole==="sell"), "Alle 3 auf der Verkaufsliste");
  const sf2 = d.querySelector("#squadPosFilter"); sf2.value="ST"; sf2.dispatchEvent(new w.Event("change"));
  d.querySelector("#selAll").checked = true; d.querySelector("#selAll").dispatchEvent(new w.Event("change"));
  ok(w.eval("selectedPlayers.size")===3+d.querySelectorAll("#squadTbody [data-sel]").length, "'Alle' wählt nur die sichtbaren (gefilterten) Zeilen dazu");
  const n0 = S().players.length, nSel = w.eval("selectedPlayers.size");
  d.querySelector('[data-bulk-act="delete"]').click();
  ok(S().players.length===n0-nSel && w.eval("selectedPlayers.size")===0 && d.querySelector("#bulkBar").hidden, `${nSel} Spieler gelöscht, Auswahl leer`);
  d.querySelector("#toastUndoBtn").click();
  ok(S().players.length===n0, "Löschen rückgängig");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[29] FM26-Formate: Gehalt '€/J.', Land, Transferwert");
  ({w,d,errs,S} = await boot());
  const pw = t => w.eval(`parseWageCell(${JSON.stringify(t)}, "week")`);
  ok(pw("3Mio. €/J.")===3000000 && pw("1,2Mio. €/J.")===1200000 && pw("750Tsd. €/J.")===750000 && pw("45.000 €/W.")===2340000 && pw("180Tsd. €/M.")===2160000 && pw("1.200 Tsd. €/J.")===1200000,
     "Gehalt: 3Mio. €/J. · 1,2Mio. €/J. · 750Tsd. €/J. · 45.000 €/W. · 180Tsd. €/M. · 1.200 Tsd. €/J.");
  ok(pw("€3M p/a")===3000000 && pw("€45K p/w")===2340000, "Englische Formate funktionieren weiter");
  const pv = t => JSON.stringify(w.eval(`parseValueCell(${JSON.stringify(t)})`));
  ok(pv("3Mio. €")==='{"min":3000000,"max":3000000}' && pv("2,1Mio. € - 3,5Mio. €")==='{"min":2100000,"max":3500000}' && pv("€1.5M - €2.8M")==='{"min":1500000,"max":2800000}' && pv("Unverkäuflich")==="null",
     "Transferwert: Einzelwert, Spanne (deutsch/englisch), unverkäuflich");
  ok(w.eval(`parseMoney("1.200 Tsd.")`)===1200000 && w.eval(`parseMoney("2,5 Mio")`)===2500000 && w.eval(`parseMoney("1.2m")`)===1200000, "Tausender vs. Dezimal bei Suffixen richtig");
  const fm26 = `Name;Position;Alter;Nat;Gehalt;Transferwert;Vertragsende;Kaderstatus
Jonas Lindqvist;TW;29;SWE;3Mio. €/J.;4,5Mio. € - 6Mio. €;30.6.2031;Schlüsselspieler
Dario Kessel;V (Z);24;GER;1,8Mio. €/J.;2,1Mio. € - 3,5Mio. €;30.6.2030;Stammspieler
Neuer Stürmer;ST (Z);20;BRA;450Tsd. €/J.;Unverkäuflich;30.6.2029;Perspektivspieler`;
  d.querySelector('.nav-btn[data-view="squad"]').click();
  w.eval("openImportWizard()"); d.querySelector("#impText").value = fm26; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  ok(d.querySelector('#modal [data-map="3"]').value==="nation" && d.querySelector('#modal [data-map="5"]').value==="value" && d.querySelector('#modal [data-map="7"]').value==="squadRole", "Spalten Nat, Transferwert, Kaderstatus erkannt");
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  const ch = w.eval("importCtx.diff.changed.find(x=>x.player.name==='Jonas Lindqvist').changes");
  ok(ch.some(c=>c.field==="salary" && c.to===3000000) && ch.some(c=>c.field==="nation" && c.to==="SWE") && ch.some(c=>c.field==="valueMax" && c.to===6000000), "Abgleich: Gehalt 3 Mio./Jahr, Land SWE, Wert bis 6 Mio.");
  ok(d.querySelector("#modal").textContent.includes("Wert: — → €4,5 – 6 Mio."), "Abgleich zeigt die Wertspanne als eine Änderung");
  d.querySelector("[data-modal-save]").click();
  const lind26 = S().players.find(p=>p.name==="Jonas Lindqvist"), neu26 = S().players.find(p=>p.name==="Neuer Stürmer");
  ok(lind26.salary===3000000 && lind26.valueMin===4500000 && lind26.valueMax===6000000 && lind26.nation==="SWE", "Übernommen: Gehalt, Wertspanne, Land");
  ok(neu26 && neu26.salary===450000 && neu26.valueMax===0 && neu26.squadRole==="prospect" && neu26.nation==="BRA", "Neuer Spieler: 450.000/Jahr, unverkäuflich (kein Wert), Perspektive");
  ok(!d.querySelector("#thValue").hidden && d.querySelectorAll("#squadTbody .value-cell").length===S().players.length, "Transferwert-Spalte erscheint nach dem Import");
  const lindRow = d.querySelector(`#squadTbody tr[data-id="${lind26.id}"] .value-cell`);
  ok(lindRow.textContent==="€4,5 – 6 Mio.", "Spanne kompakt: "+lindRow.textContent);
  d.querySelector('#thValue').click(); d.querySelector('#thValue').click();
  ok(d.querySelector("#squadTbody tr[data-id]").dataset.id===lind26.id, "Sortierung nach Transferwert (absteigend: Lindqvist oben)");
  w.eval("navigate('home')");
  ok(d.querySelector("#squadPlanSummary").textContent.includes("Kaderwert"), "Portal zeigt Kaderwert");
  w.eval("navigate('squad')");
  // sale suggestion = middle of the value range
  w.eval(`openSaleModal("${lind26.id}")`);
  ok(d.querySelector('#modal [data-f="price"]').value==="5.250.000", "Verkauf planen schlägt Wertmitte vor (5,25 Mio.)");
  w.eval("closeModal()");
  // CSV round trip keeps the range
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  const csv2 = w.eval("exportSquadCSV()");
  w.eval("openImportWizard()"); d.querySelector("#impText").value = csv2; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  ok(w.eval("importCtx.diff.changed.length")===0 && w.eval("importCtx.diff.added.length")===0, "CSV-Rundlauf mit Land und Wertspanne: keine Scheinänderungen");
  w.eval("closeModal()");
  // without values the column disappears again
  w.eval("state.players.forEach(p=>{ p.valueMin = 0; p.valueMax = 0; }); renderSquad()");
  ok(d.querySelector("#thValue").hidden && !d.querySelector("#squadTbody .value-cell"), "Ohne Werte verschwindet die Spalte wieder");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[30] Phase 9: Auswahllisten bearbeiten");
  ({w,d,errs,S} = await boot());
  w.eval("setPin('1111'); adminUnlocked = true; adminTab = 'lists'; navigate('admin')");
  ok(d.querySelectorAll("#adminBody .lists-nav [data-list]").length===17 && d.querySelectorAll("#adminBody .list-edit tbody tr").length===6, "Reiter 'Listen': 17 Listen, Kaderrollen mit 6 Einträgen");
  ok(!d.querySelector('#adminBody [data-le-del="0"]'), "Eingebaute Einträge haben keinen Löschen-Knopf");
  const lbl9 = i => d.querySelector(`#adminBody [data-le-label="${i}"]`);
  // rename built-in
  lbl9(2).value = "Rotationsspieler"; lbl9(2).dispatchEvent(new w.Event("change",{bubbles:true}));
  w.eval("navigate('squad')");
  ok(w.eval("SQUAD_ROLES.rotation")==="Rotationsspieler" && [...d.querySelector('#squadTbody [data-field="squadRole"]').options].some(o=>o.textContent==="Rotationsspieler"), "Eingebaute Rolle umbenannt – Dropdown im Kader zeigt neuen Namen");
  w.eval("adminTab = 'lists'; navigate('admin')");
  ok(S().players.some(p=>p.squadRole==="rotation"), "Gespeicherte Werte bleiben stabil (Schlüssel statt Text)");
  lbl9(3).value = "rotationsspieler"; lbl9(3).dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(w.eval("SQUAD_ROLES.backup")==="Backup" && d.querySelector("#toastMsg").textContent.includes("gibt es in dieser Liste schon"), "Doppelte Bezeichnung abgelehnt");
  // custom status that behaves like "injured"
  d.querySelector('[data-list="status"]').click();
  d.querySelector("#leNew").value = "Afrika-Cup"; d.querySelector("#leNewBase").value = "injured"; d.querySelector("#btnLeAdd").click();
  const afr9 = S().lists.keyed.status.find(e=>e.label==="Afrika-Cup");
  ok(afr9 && afr9.key.startsWith("c_") && afr9.base==="injured" && w.eval(`UNAVAILABLE.includes("${afr9.key}")`), "Eigener Status 'Afrika-Cup' verhält sich wie 'Verletzt' → zählt als nicht verfügbar");
  const hr9 = S().players.find(p=>p.name==="Viktor Hrubeš");
  w.eval(`state.players.find(p=>p.name==="Viktor Hrubeš").status = "${afr9.key}"; saveState(); runBestXI()`);
  ok(!Object.values(w.eval("currentSlots()")).some(sl=>sl.playerId===hr9.id), "Beste Elf lässt den Afrika-Cup-Spieler draußen");
  w.eval("renderSquad()");
  ok(d.querySelector(`#squadTbody tr[data-id="${hr9.id}"] [data-field="status"]`).className.includes("st-injured"), "Farbe wird vom Basis-Status geerbt");
  // delete a used custom entry → reassignment dialog
  w.eval("adminTab='lists'; renderAdmin()"); d.querySelector('[data-list="status"]').click();
  const idx9 = S().lists.keyed.status.findIndex(e=>e.key===afr9.key);
  d.querySelector(`#adminBody [data-le-del="${idx9}"]`).click();
  ok(d.querySelector("#modal").textContent.includes("1 Eintrag verwendet"), "Löschen fragt: 1 Spieler verwendet den Eintrag");
  d.querySelector('#modal [data-f="to"]').value = ""; d.querySelector("[data-modal-save]").click();
  ok(!S().lists.keyed.status.some(e=>e.key===afr9.key) && S().players.find(p=>p.name==="Viktor Hrubeš").status==="", "Gelöscht, Spieler auf 'Verfügbar' umgestellt");
  d.querySelector("#toastUndoBtn").click();
  ok(S().lists.keyed.status.some(e=>e.key===afr9.key) && w.eval(`STATUS["${afr9.key}"]`)==="Afrika-Cup", "Löschen rückgängig: Eintrag und Liste wieder aktiv");
  // custom squad role behaving like "sell"
  w.eval("adminTab='lists'; renderAdmin()"); d.querySelector('[data-list="squadRoles"]').click();
  d.querySelector("#leNew").value = "Leihkandidat"; d.querySelector("#leNewBase").value = "sell"; d.querySelector("#btnLeAdd").click();
  const lk9 = S().lists.keyed.squadRoles.find(e=>e.label==="Leihkandidat");
  w.eval(`state.players.find(p=>p.name==="Samu Laine").squadRole = "${lk9.key}"; saveState()`);
  ok(w.eval("futureSquadEntries()").entries.find(e=>e.name==="Samu Laine").kind==="sell", "Eigene Rolle wie 'Abgabe' → Zukunfts-Kader zählt Abgang");
  w.eval("state.ui.transferTab='sell'; renderRecruitment()");
  ok(d.querySelector("#salesHint").textContent.includes("Samu Laine"), "… und schlägt ihn für die Verkaufsliste vor");
  // reorder
  const order09 = w.eval("SQUAD_ROLE_ORDER.slice()");
  d.querySelector('#adminBody [data-le-down="0"]').click();
  ok(w.eval("SQUAD_ROLE_ORDER[0]")===order09[1] && w.eval("SQUAD_ROLE_ORDER[1]")===order09[0], "Reihenfolge änderbar (↑ ↓)");
  // label list: grades
  d.querySelector('[data-list="grades"]').click();
  const nAplus9 = S().scouting.filter(t=>t.grade==="A+").length;
  lbl9(0).value = "Weltklasse"; lbl9(0).dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(nAplus9>0 && S().scouting.filter(t=>t.grade==="Weltklasse").length===nAplus9 && w.eval("GRADES[0]")==="Weltklasse", "Grade umbenannt – alle Transferziele mitgezogen");
  // tactic roles: rename in all plans
  d.querySelector('[data-list="rolesIP"]').click();
  const rc9 = d.querySelector("#roleCat"); rc9.value = "ST"; rc9.dispatchEvent(new w.Event("change",{bubbles:true}));
  const iMS9 = w.eval(`state.lists.rolesIP.ST.indexOf("Mittelstürmer")`);
  const before9 = w.eval(`roleSlots("ST").filter(sl=>sl.roleIn==="Mittelstürmer").length`);
  lbl9(iMS9).value = "Knipser"; lbl9(iMS9).dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(before9>=2 && w.eval(`roleSlots("ST").filter(sl=>sl.roleIn==="Knipser").length`)===before9 && w.eval(`ROLES_IP.ST.includes("Knipser")`), `Taktik-Rolle umbenannt – ${before9} Aufstellungen in allen Plänen aktualisiert`);
  ok(w.eval("planBlock(state.plans[1].id)").tactics["4-2-3-1"].slots[10].roleIn==="Knipser", "Auch im nicht aktiven Plan B");
  // stay high
  d.querySelector('[data-list="rolesOOP"]').click();
  const rc29 = d.querySelector("#roleCat"); rc29.value = "ST"; rc29.dispatchEvent(new w.Event("change",{bubbles:true}));
  const iPS9 = w.eval(`state.lists.rolesOOP.ST.indexOf("Pressender Stürmer")`);
  ok(d.querySelector(`#adminBody [data-le-high="${iPS9}"]`).checked, "'Pressender Stürmer' ist als 'bleibt vorne' markiert");
  lbl9(iPS9).value = "Erster Verteidiger"; lbl9(iPS9).dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(w.eval(`STAY_HIGH.has("Erster Verteidiger")`) && !w.eval(`STAY_HIGH.has("Pressender Stürmer")`), "Umbenennen behält 'bleibt vorne'");
  const hi9 = d.querySelector(`#adminBody [data-le-high="${iPS9}"]`); hi9.checked = false; hi9.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!w.eval(`STAY_HIGH.has("Erster Verteidiger")`), "'Bleibt vorne' abschaltbar");
  // reset keyed list maps custom entries to their base
  d.querySelector('[data-list="squadRoles"]').click(); d.querySelector("#btnLeReset").click(); d.querySelector("[data-modal-save]").click();
  ok(S().players.find(p=>p.name==="Samu Laine").squadRole==="sell" && w.eval("SQUAD_ROLES.rotation")==="Rotation" && !S().lists.keyed.squadRoles.some(e=>e.label==="Leihkandidat"),
     "Zurücksetzen: eigene Rolle entfällt, Spieler bekommt die Basis 'Abgabe', Namen wieder Standard");
  ok(w.eval("readLog()").some(e=>e.area==="Listen"), "Listenänderungen im Protokoll");
  // defaults for new saves
  d.querySelector("#btnLeDefault").click();
  w.eval("openSlotsModal()"); d.querySelector('[data-slot-new="empty"]').click(); w.eval("closeModal()");
  ok(S().lists.keyed.status.some(e=>e.label==="Afrika-Cup") && w.eval("GRADES[0]")==="Weltklasse", "Neuer Spielstand startet mit den gespeicherten Standard-Listen");
  // persistence & robustness
  const rt9 = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rt9.lists.keyed.status.some(e=>e.label==="Afrika-Cup") && rt9.lists.labels.grades[0]==="Weltklasse", "Listen überstehen Speichern/Import");
  const junk9 = w.eval(`sanitizeLists({keyed:{squadRoles:[{key:"c_x", label:"Eigene", base:"gibtsnicht"},{key:"sell", label:""}]}, labels:{grades:[]}, rolesIP:{ST:"kaputt"}})`);
  ok(junk9.keyed.squadRoles.length===7 && junk9.keyed.squadRoles.find(e=>e.key==="c_x").base==="key" && junk9.keyed.squadRoles.find(e=>e.key==="sell").label==="Abgabe" && junk9.labels.grades.length===5 && junk9.rolesIP.ST.length===5,
     "Kaputte Listen: eingebaute Einträge ergänzt, ungültige Basis korrigiert, leere Listen auf Standard");
  w.eval("renderAll()"); await new Promise(r=>setTimeout(r,20));
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[31] Phase 9: Spaltenbreiten & -auswahl");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="squad"]').click();
  const rz9 = d.querySelectorAll("#squadTable thead .col-resizer");
  ok([...rz9].filter(r=>{ const t = r.closest("th"); return !t.hidden || t.dataset.col==="valueMax"; }).length===11 && d.querySelectorAll("#scoutTable thead .col-resizer").length>=9 && d.querySelectorAll("#loanTable thead .col-resizer").length>=10, "Ziehgriffe im Kader (11) und in den anderen Tabellen");
  const noteTh9 = d.querySelector('#squadTable th[data-col="note"]'), noteRz9 = noteTh9.querySelector(".col-resizer");
  const sortBefore9 = w.eval("JSON.stringify(squadSort)");
  noteRz9.dispatchEvent(new w.MouseEvent("pointerdown",{bubbles:true, clientX:500, button:0}));
  d.dispatchEvent(new w.MouseEvent("pointermove",{bubbles:true, clientX:640}));
  d.dispatchEvent(new w.MouseEvent("pointerup",{bubbles:true, clientX:640}));
  noteRz9.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  const wNote9 = w.eval("colPrefs.widths.squadTable.note");
  ok(wNote9>=140 && noteTh9.style.width===wNote9+"px" && d.querySelector("#squadTable").classList.contains("custom-widths"), `Notiz-Spalte per Ziehen verbreitert (${wNote9}px)`);
  ok(w.eval("JSON.stringify(squadSort)")===sortBefore9, "Ziehen am Rand löst keine Sortierung aus");
  ok(JSON.parse(w.localStorage.getItem("fm27_columns")).widths.squadTable.note===wNote9, "Breite gespeichert");
  const tbl9 = d.querySelector("#squadTable");
  ok(parseInt(tbl9.style.width)===Object.values(w.eval("colPrefs.widths.squadTable")).reduce((a,b)=>a+b,0) + 0 || parseInt(tbl9.style.width) > 0, "Tabellenbreite = Summe der Spalten (horizontal scrollbar statt quetschen)");
  noteRz9.dispatchEvent(new w.MouseEvent("pointerdown",{bubbles:true, clientX:500, button:0}));
  d.dispatchEvent(new w.MouseEvent("pointermove",{bubbles:true, clientX:-2000})); d.dispatchEvent(new w.MouseEvent("pointerup",{bubbles:true}));
  ok(w.eval("colPrefs.widths.squadTable.note")===44, "Mindestbreite 44px");
  const nameTh9 = d.querySelector('#squadTable th[data-col="name"]');
  nameTh9.querySelector(".col-resizer").dispatchEvent(new w.MouseEvent("dblclick",{bubbles:true}));
  ok(w.eval("colPrefs.widths.squadTable.name")>44, "Doppelklick passt 'Name' an den Inhalt an ("+w.eval("colPrefs.widths.squadTable.name")+"px)");
  // hide columns
  d.querySelector("#btnColumns").click();
  const cbNote9 = d.querySelector('#modal [data-col-show="note"]'); cbNote9.checked = false; cbNote9.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector("#colHideStyle").textContent.includes('#squadTable [data-col="note"]{display:none'), "Spalte 'Notiz' ausgeblendet");
  ok(w.getComputedStyle(d.querySelector('#squadTbody td[data-col="note"]')).display==="none" && w.getComputedStyle(noteTh9).display==="none", "… in Kopf und allen Zeilen");
  w.eval("closeModal()");
  // value column appears later: still gets a width
  w.eval("state.players[0].valueMax = 5000000; renderSquad()");
  ok(d.querySelector("#thValue").style.width!=="", "Transferwert-Spalte bekommt nach dem Import eine Breite");
  // persistence across reload + robustness
  const saved9 = w.localStorage.getItem("fm27_columns");
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_columns", saved9)));
  ok(d.querySelector('#squadTable th[data-col="name"]').style.width!=="" && d.querySelector("#colHideStyle").textContent.includes("note"), "Nach Neuladen: Breiten und ausgeblendete Spalten wieder da");
  w.eval("resetColumns()");
  ok(!d.querySelector("#squadTable").classList.contains("custom-widths") && d.querySelector("#colHideStyle").textContent==="", "Zurücksetzen");
  d.querySelector("#toastUndoBtn").click();
  ok(d.querySelector("#squadTable").classList.contains("custom-widths"), "Zurücksetzen rückgängig");
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_columns", JSON.stringify({widths:{squadTable:{note:"viel", name:99999}}, hidden:{squadTable:["name","note",3]}}))));
  ok(errs.length===0 && w.eval("colPrefs.widths.squadTable.name")===700 && !w.eval("colPrefs.hidden.squadTable").includes("name"), "Kaputte Spalten-Daten: begrenzt, 'Name' nie ausblendbar, kein Absturz");

  console.log("\n[32] Filter sichtbar machen & Beispieldaten aufräumen (Rückmeldung aus echtem FM26-Import)");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="home"]').click();
  d.querySelector('[data-goto="squad"][data-filter="contract"]').click();
  ok(d.querySelector("#squadStatusFilter").classList.contains("filter-on") && !d.querySelector("#btnResetFilters").hidden, "Aktiver Filter ist markiert, 'Filter zurücksetzen' sichtbar");
  const nContract = d.querySelectorAll("#squadTbody tr[data-id]").length;
  w.eval(`state.players.forEach(p=>p.contractUntil = 2031); renderSquad()`);
  ok(d.querySelectorAll("#squadTbody tr[data-id]").length===0 && d.querySelector("#squadTbody").textContent.includes("Vertrag ≤ 12 Monate") && d.querySelector("#squadTbody").textContent.includes("Alle 20 Spieler sind weiterhin da"),
     "Leere Tabelle nennt den Filter und beruhigt: alle Spieler noch da");
  d.querySelector("#squadTbody [data-reset-filters]").click();
  ok(d.querySelectorAll("#squadTbody tr[data-id]").length===20 && d.querySelector("#btnResetFilters").hidden && !d.querySelector(".filter-on"), "Ein Klick: alle Filter weg, alle 20 Spieler sichtbar");
  const srch = d.querySelector("#squadSearch"); srch.value="xyz"; srch.dispatchEvent(new w.Event("input"));
  ok(d.querySelector("#squadTbody").textContent.includes("Suche „xyz“") && srch.classList.contains("filter-on"), "Auch die Suche zählt als Filter");
  d.querySelector("#btnResetFilters").click();
  ok(srch.value==="" && d.querySelectorAll("#squadTbody tr[data-id]").length===20, "Knopf in der Werkzeugleiste setzt ebenfalls zurück");
  // demo data: no banner in the pure demo career
  ok(d.querySelector("#sampleBanner").hidden, "Reine Beispiel-Karriere: kein Aufräum-Hinweis");
  const lo0 = w.eval("sampleLeftovers()");
  ok(lo0.total > 20 && !lo0.hasReal, "Erkennung: Demo-Daten erkannt, aber noch keine echten Spieler");
  // import own squad WITHOUT the new checkbox (= how the user's save looks now)
  const own = `Name;Position;Alter;Gehalt;Vertragsende
Givairo Read;RV;20;3Mio. €/J.;30.6.2031
Karim;LV;19;2Mio. €/J.;30.6.2031`;
  w.eval("openImportWizard()"); d.querySelector("#impText").value = own; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  const sbox = d.querySelector("#modal [data-imp-sample]");
  ok(sbox && sbox.checked && d.querySelector("#modal").textContent.includes("5 Transferziele"), "Import-Abgleich bietet 'übrige Beispieldaten entfernen' an (vorausgewählt)");
  d.querySelectorAll("#modal [data-imp-del]").forEach(b=>b.checked=true); sbox.checked = false;
  d.querySelector("[data-modal-save]").click();
  ok(S().players.length===2 && S().loans.length===2 && w.eval("budgetCalc().transferLeft")===8000000, "Ohne Häkchen: Kader ersetzt, Beispiel-Leihen und -Ziele noch da (Budget 8 Mio.)");
  // Regression: the import checkbox must never remove players (the user decides via "nicht in der Datei")
  const withDemoName = `Name;Position;Gehalt\nJonas Lindqvist;TW;3Mio. €/J.`;
  const snapBefore = JSON.stringify(S());
  w.eval("openImportWizard()"); d.querySelector("#impText").value = withDemoName; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("#modal [data-imp-sample]").checked = true; d.querySelector("[data-modal-save]").click();
  ok(S().players.some(p=>p.name==="Jonas Lindqvist") && S().loans.length===0, "Import mit Häkchen: Leihen weg, aber importierter Spieler mit Demo-Namen bleibt");
  w.eval(`state = migrateState(${JSON.stringify(JSON.parse(snapBefore))}); saveState(); renderAll()`);
  const bn = d.querySelector("#sampleBanner");
  ok(!bn.hidden && bn.textContent.includes("5 Transferziele") && bn.textContent.includes("2 Leihen") && bn.textContent.includes("3 Talente"), "Hinweisleiste listet die Demo-Reste auf");
  ok(w.eval("runHealthChecks()").some(x=>x.text.startsWith("Beispieldaten aus der Demo übrig")), "Datenprüfung meldet die Demo-Reste ebenfalls");
  bn.querySelector('[data-sample="remove"]').click();
  ok(S().loans.length===0 && S().scouting.length===0 && S().prospects.length===0 && S().results.length===0 && S().transferLog.length===0 && S().balanceLog.length===0 && S().boardGoals.length===0,
     "Entfernt: Leihen, Ziele, Talente, Ergebnisse, Historie, Kontostände, Vorstandsziele");
  ok(S().players.map(p=>p.name).join(",")==="Givairo Read,Karim" && w.eval("budgetCalc().transferLeft")===30000000 && bn.hidden, "Eigene Spieler unangetastet ('Karim' ≠ Beispiel 'Karim Haddad'), Budget wieder 30 Mio., Leiste weg");
  ok(S().nextMatch.opponent==="" && S().notes==="", "Beispiel-Spieltag und -Notizen geleert");
  ok(w.eval("readRestorePoints()")[0].reason==="Vor Entfernen der Beispieldaten" && w.eval("readLog()").slice(-1)[0].text.startsWith("Beispieldaten entfernt"), "Wiederherstellungspunkt + Protokoll-Eintrag");
  d.querySelector("#toastUndoBtn").click();
  ok(S().loans.length===2 && S().scouting.length===5, "Rückgängig holt die Beispieldaten zurück");
  bn.querySelector('[data-sample="keep"]').click();
  ok(bn.hidden && S().ui.sampleHintDismissed, "'Behalten' blendet den Hinweis dauerhaft aus");
  // user-made entries that merely look similar stay
  w.eval(`state.loans.push({id:"own", name:"Ben Achterberg Jr.", pos:"OM", age:18, club:"X", league:"", until:"06/2028", apps:0, minutes:0, clause:"none", recallCheck:false, note:""}); state.scouting[0].fee = 1; stripSampleData(state)`);
  ok(S().loans.some(l=>l.id==="own") && S().scouting.length===0, "Nur echte Demo-Einträge werden erkannt, eigene ähnliche bleiben");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[33] Filter überleben kein Neuladen");
  ok([...d.querySelectorAll(".toolbar select, .toolbar input[type=search], .head-select, .head-search")].every(el=>el.getAttribute("autocomplete")==="off"), "Filterfelder: autocomplete=off (keine Wiederherstellung durch den Browser)");
  ({w,d,errs,S} = await boot(ls=>{}));
  ok(d.querySelector("#squadStatusFilter").value==="" && d.querySelector("#squadSearch").value==="", "Nach dem Start sind alle Filter leer");

  console.log("\n[34] Phase 10: Gegner-Datenbank");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="fixtures"]').click();
  const rowsOP10 = [...d.querySelectorAll("#oppDb tbody tr")];
  ok(rowsOP10.length===8 && rowsOP10[0].dataset.opp==="Rapid Nord", "8 Gegner aus den Ergebnissen, neuster zuerst (Rapid Nord)");
  ok(!d.querySelector("#oppHint").hidden && d.querySelector("#oppHint").textContent.includes("Erstes Duell"), "Hinweis beim nächsten Gegner: erstes Duell gegen SV Stahl Blau");
  const onP10 = d.querySelector("#oppName"); onP10.value = "rapid nord"; onP10.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(d.querySelector("#oppHint").textContent.includes("Bilanz") && d.querySelector("#oppHint").textContent.includes("3:1") && d.querySelector("#oppHint").textContent.includes("4-4-2"),
     "Beim Tippen (Groß/klein egal): Bilanz, letztes Ergebnis 3:1, meist 4-4-2");
  onP10.value = "SV Stahl Blau"; onP10.dispatchEvent(new w.Event("input",{bubbles:true}));
  // result for the prepared match → analysis is remembered
  w.eval(`state.club.ingameDate="2027-03-14"; applyDateChange("2027-03-16")`); await new Promise(r=>setTimeout(r,100));
  d.querySelector('#modal [data-f="gf"]').value="1"; d.querySelector('#modal [data-f="ga"]').value="0"; d.querySelector("[data-modal-save]").click();
  const entP10 = w.eval(`opponentEntry("SV Stahl Blau")`);
  ok(entP10 && entP10.formation==="4-2-3-1" && entP10.keyThreat.includes("Zehner") && entP10.weaknesses.includes("Innenverteidigung"), "Analyse (Formation, gefährlichster Spieler, Schwachstellen) wurde beim Ergebnis gespeichert");
  ok(S().nextMatch.opponent==="" && S().nextMatch.weaknesses==="", "Vorbereitung danach geleert");
  // next meeting: analysis is offered again
  onP10.value = "SV Stahl Blau"; onP10.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(d.querySelector("#oppHint").textContent.includes("Gespeicherte Analyse") && d.querySelector("#oppHint [data-opp-apply]"), "Nächstes Duell: gespeicherte Analyse wird angeboten");
  d.querySelector("#oppHint [data-opp-apply]").click();
  ok(S().nextMatch.formation==="4-2-3-1" && S().nextMatch.weaknesses.includes("Innenverteidigung") && d.querySelector("#weaknessNotes").value.includes("Innenverteidigung"), "Übernommen in die leeren Felder");
  // edit notes in the database, prepare from the list
  d.querySelector('#oppDb [data-opp-open="TSV Kirchberg"]').click();
  d.querySelector('#modal [data-f="notes"]').value = "Standards verteidigen schwach"; d.querySelector("[data-modal-save]").click();
  ok(w.eval(`opponentEntry("TSV Kirchberg").notes`)==="Standards verteidigen schwach" && d.querySelector("#oppDb").textContent.includes("Standards verteidigen"), "Notizen in der Gegner-Datenbank gespeichert");
  d.querySelector('#oppDb [data-opp-next="TSV Kirchberg"]').click();
  ok(S().nextMatch.opponent==="TSV Kirchberg" && S().nextMatch.formation==="3-4-2-1", "'➜' bereitet TSV Kirchberg als nächsten Gegner vor (Formation aus der Bilanz)");
  const osP10 = d.querySelector("#oppSearch"); osP10.value="blau"; osP10.dispatchEvent(new w.Event("input"));
  ok(d.querySelectorAll("#oppDb tbody tr").length===2, "Suche in der Datenbank (Blau-Weiß 04, SV Stahl Blau)");
  ok(w.eval("readLog()").some(e=>e.area==="Gegner-Datenbank"), "Änderungen landen im Protokoll");
  const rtOP10 = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rtOP10.opponents.length===2 && rtOP10.opponents.some(o=>o.notes==="Standards verteidigen schwach"), "Gegner-Datenbank übersteht Speichern/Import");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[35] Phase 10: Saisonvergleich");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="notes"]').click();
  let srowsP10 = [...d.querySelectorAll("#seasonCompare tbody tr")];
  ok(srowsP10.length===2 && srowsP10[0].textContent.includes("2026/27") && srowsP10[0].textContent.includes("läuft") && srowsP10[1].textContent.includes("2025/26"), "Zwei Saisons: 2026/27 (läuft) und 2025/26 (Archiv)");
  ok(srowsP10[0].textContent.includes("−€7 Mio.") && srowsP10[0].textContent.includes("€21,6 Mio.") && srowsP10[1].textContent.includes("8."), "Aktuelle Saison: Transfersaldo −7 Mio., Kontostand 21,6 Mio.; Archiv: Platz 8.");
  w.eval("openCloseSeasonModal()"); d.querySelector('#modal [data-f="position"]').value="4."; d.querySelector("[data-modal-save]").click();
  srowsP10 = [...d.querySelectorAll("#seasonCompare tbody tr")];
  const archP10 = S().seasons.find(x=>x.season==="2026/27");
  ok(srowsP10.length===3 && srowsP10[0].textContent.includes("2027/28") && srowsP10[1].textContent.includes("4.") && archP10.wages > 0, "Nach Saisonabschluss: 3 Zeilen, Platz 4., Gehälter archiviert");
  ok(srowsP10[1].textContent.includes("8") && srowsP10[1].querySelector(".rec-badges"), "Archivierte Saison behält ihre Bilanz (aus den Ergebnissen)");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  // Regression (browser): switching views must show fresh data (season comparison showed 8 instead of 9 games)
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="notes"]').click();
  w.eval(`state.results.push({id:"n1", date:"2027-03-10", opponent:"Neu FC", competition:"", venue:"H", gf:2, ga:1, planId:"", planName:"", formation:"", oppFormation:"", season:state.club.season}); saveState()`);
  d.querySelector('.nav-btn[data-view="home"]').click(); d.querySelector('.nav-btn[data-view="notes"]').click();
  ok(d.querySelector("#seasonCompare tbody tr").textContent.includes("9") && d.querySelector("#seasonCompare tbody tr .rb.W").textContent==="5 S", "Tabwechsel zeichnet frisch: 9 Spiele, 5 Siege");
  d.querySelector('.nav-btn[data-view="fixtures"]').click();
  ok(d.querySelector('#oppDb [data-opp="Neu FC"]'), "… ebenso die Gegner-Datenbank");

  console.log("\n[36] Phase 10: Spielerentwicklung");
  ({w,d,errs,S} = await boot());
  const coutoP10 = S().players.find(p=>p.name==="Rafael Couto");
  ok(S().history[coutoP10.id].length===3 && S().players.every(p=>S().history[p.id] && S().history[p.id].length>=1), "Verlauf: Beispiel-Historie + Ausgangspunkt für alle Spieler");
  ok(d.querySelector("#thValue").hidden, "Beispiel-Verlauf ohne Transferwerte → Spalte bleibt in der Demo unsichtbar");
  const fayeP10 = S().players.find(p=>p.name==="Aurelien Faye");
  w.eval(`state.players.find(p=>p.name==="Aurelien Faye").salary = 1200000; saveState()`);
  ok(S().history[fayeP10.id].length===2 && S().history[fayeP10.id][1].s===1200000, "Gehaltsänderung → neuer Verlaufspunkt");
  w.eval(`state.players.find(p=>p.name==="Aurelien Faye").salary = 1300000; saveState()`);
  ok(S().history[fayeP10.id].length===2 && S().history[fayeP10.id][1].s===1300000, "Am selben Spieltag wird der Punkt aktualisiert statt verdoppelt");
  w.eval(`applyDateChange("2027-04-01"); state.players.find(p=>p.name==="Aurelien Faye").rating = 4; saveState()`);
  ok(S().history[fayeP10.id].length===3 && S().history[fayeP10.id][2].d==="2027-04-01" && S().history[fayeP10.id][2].r===4, "Neuer Spieltag → neuer Punkt mit Datum");
  w.eval(`saveState()`);
  ok(S().history[fayeP10.id].length===3, "Ohne Änderung kein neuer Punkt");
  d.querySelector('.nav-btn[data-view="squad"]').click();
  d.querySelector(`#squadTbody tr[data-id="${coutoP10.id}"] [data-edit]`).click();
  const hbP10 = d.querySelector("#modal .hist-box");
  ok(hbP10 && hbP10.querySelectorAll(".spark").length===2 && hbP10.textContent.includes("★★★★ → ★★★★★") && hbP10.querySelectorAll(".hist-table tbody tr").length===3, "✎-Dialog: Verlauf mit Kurven (Einschätzung, Gehalt) und Tabelle");
  w.eval("closeModal()");
  d.querySelector(`#squadTbody tr[data-id="${S().players.find(p=>p.name==="Jonas Lindqvist").id}"] [data-edit]`).click();
  ok(d.querySelector("#modal .hist-box").textContent.includes("entsteht mit der Zeit"), "Spieler ohne Verlauf: Erklärung statt leerer Kurve");
  w.eval("closeModal()");
  // FM imports feed the history
  w.eval(`state.club.ingameDate = "2027-05-01"`);
  w.eval("openImportWizard()"); d.querySelector("#impText").value = "Name;Transferwert;Gehalt\nRafael Couto;18Mio. € - 22Mio. €;900Tsd. €/J."; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  d.querySelector("#modal [data-imp-sample]") && (d.querySelector("#modal [data-imp-sample]").checked = false);
  d.querySelector("[data-modal-save]").click();
  const chP10 = S().history[coutoP10.id]; const lastCP10 = chP10[chP10.length-1];
  ok(lastCP10.d==="2027-05-01" && lastCP10.vmax===22000000 && lastCP10.s===900000, "FM-Import erzeugt Verlaufspunkt (Wert 18–22 Mio., Gehalt 900 Tsd.)");
  w.eval("state.players = state.players.filter(p=>p.name!=='Rafael Couto'); saveState()");
  ok(!S().history[coutoP10.id], "Gelöschter Spieler → Verlauf wird aufgeräumt");
  const badP10 = w.eval(`migrateState({version:6, club:{name:"X"}, players:[{id:"a",name:"A"}], history:{a:[{d:"kaputt"},{d:"2027-01-01",r:9,s:-5}], b:[{d:"2027-01-01"}]}, opponents:[{name:""},{name:"FC X"},{name:"fc x"}]})`);
  ok(badP10.history.a.length===1 && badP10.history.a[0].r===5 && badP10.history.a[0].s===0 && !badP10.history.b && badP10.opponents.length===1, "Bereinigung: kaputte Punkte, fremde Spieler, doppelte Gegner");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[37] Automatische Sicherung in einen Ordner (simulierter Ordner)");
  ({w,d,errs,S} = await boot());
  const tick = (ms=20) => new Promise(r=>setTimeout(r,ms));
  // without the File System Access API (e.g. Firefox)
  w.eval("setPin('1111'); adminUnlocked = true; adminTab = 'backup'; navigate('admin')");
  ok(d.querySelector(".backup-card").textContent.includes("unterstützt das Schreiben in Ordner nicht") && d.querySelector("#backupPill").hidden, "Ohne Ordner-Schnittstelle: klare Erklärung, kein Symbol oben");
  // simulated Chromium folder
  w.eval(`
    class FakeFile{ constructor(dir,name){ this.dir=dir; this.name=name; this.kind="file"; }
      async createWritable(){ if(this.dir.perm!=="granted") throw Object.assign(new Error("Keine Berechtigung"),{name:"NotAllowedError"});
        const self=this; let buf=""; return {write:async t=>{ buf+=t; }, close:async()=>{ self.dir.files.set(self.name,{text:buf, modified:Date.now()}); }}; }
      async getFile(){ const f=this.dir.files.get(this.name); return {size:f.text.length, lastModified:f.modified, text:async()=>f.text}; } }
    class FakeDir{ constructor(){ this.name="OneDrive-FM"; this.kind="directory"; this.files=new Map(); this.perm="granted"; }
      async getFileHandle(n,o){ if(this.perm!=="granted") throw Object.assign(new Error("Keine Berechtigung"),{name:"NotAllowedError"});
        if(!this.files.has(n)){ if(!(o&&o.create)) throw Object.assign(new Error("fehlt"),{name:"NotFoundError"}); this.files.set(n,{text:"",modified:Date.now()}); } return new FakeFile(this,n); }
      async *entries(){ for(const n of [...this.files.keys()]) yield [n, new FakeFile(this,n)]; }
      async removeEntry(n){ this.files.delete(n); }
      async queryPermission(){ return this.perm; } async requestPermission(){ this.perm="granted"; return "granted"; } }
    window.__dir = new FakeDir(); window.showDirectoryPicker = async ()=>window.__dir;`);
  const files = () => [...w.eval("window.__dir").files.keys()].sort();
  const today = w.eval("todayReal()");
  renderIt = () => w.eval("renderAdmin()"); renderIt();
  ok(d.querySelector('[data-bk="choose"]'), "Mit Ordner-Schnittstelle: 'Ordner wählen …'");
  d.querySelector('[data-bk="choose"]').click(); await tick(60);
  ok(JSON.stringify(files().filter(f=>!f.startsWith("fm27__hub-und-tagebuch")))===JSON.stringify([`fm27_Karriere_1_${today}.json`, "fm27_Karriere_1_aktuell.json"]) && files().includes("fm27__hub-und-tagebuch_aktuell.json"), "Sofort gesichert: Spielstand (aktuell + Tageskopie) und seit 11.8.2 auch Hub & Tagebuch ("+files().join(", ")+")");
  const saved = JSON.parse(w.eval("window.__dir").files.get("fm27_Karriere_1_aktuell.json").text);
  ok(saved.app==="FM27 Manager Dashboard" && saved.data.players.length===20 && saved.schemaVersion>=6, "Inhalt = normales Export-Format (per Import lesbar)");
  ok(!d.querySelector("#backupPill").hidden && d.querySelector("#backupPill").textContent.startsWith("☁ gesichert"), "Oben: '☁ gesichert hh:mm'");
  ok(d.querySelector(".backup-card").textContent.includes("OneDrive-FM") && d.querySelectorAll("#folderBackupList .bk-card:not(.bk-global)").length===1 && d.querySelector("#folderBackupList .bk-card:not(.bk-global) .bk-current [data-bk-load]") && d.querySelectorAll("#folderBackupList .bk-card:not(.bk-global) .bk-daily .bk-row").length===1 && d.querySelector("#folderBackupList .bk-summary").textContent.includes("4 Dateien"), "Karte zeigt Ordner, aktuellen Stand und 1 Tageskopie (4 Dateien inkl. Hub & Tagebuch seit 11.8.2)");
  // change → bundled backup after the delay
  w.eval(`state.club.transferBudget = 12345678; saveState()`);
  ok(w.eval("backupTimer !== null") && d.querySelector("#backupPill").textContent.includes("sichert gleich"), "Änderung → Sicherung wird gebündelt geplant");
  w.eval("clearTimeout(backupTimer); backupTimer = null"); await w.eval("writeFolderBackup('Test')");
  ok(JSON.parse(w.eval("window.__dir").files.get("fm27_Karriere_1_aktuell.json").text).data.club.transferBudget===12345678, "Geplante Sicherung schreibt den neuen Stand");
  // leaving the tab flushes a pending backup
  w.eval(`state.club.transferBudget = 999; saveState()`);
  Object.defineProperty(d, "hidden", {value:true, configurable:true}); d.dispatchEvent(new w.Event("visibilitychange")); await tick(60);
  Object.defineProperty(d, "hidden", {value:false, configurable:true});
  ok(w.eval("backupTimer")===null && JSON.parse(w.eval("window.__dir").files.get("fm27_Karriere_1_aktuell.json").text).data.club.transferBudget===999, "Tab verlassen → ausstehende Sicherung sofort geschrieben");
  // pruning of daily copies
  w.eval(`for(let i=1;i<=20;i++){ const dd = new Date(2020,0,i); window.__dir.files.set("fm27_Karriere_1_2020-01-"+String(i).padStart(2,"0")+".json",{text:"{}",modified:+dd}); }`);
  await w.eval("writeFolderBackup('Test')");
  ok(files().filter(f=>/^fm27_Karriere_1_\d{4}-\d{2}-\d{2}\.json$/.test(f)).length===14 && files().includes(`fm27_Karriere_1_${today}.json`) && !files().includes("fm27_Karriere_1_2020-01-01.json"), "Nur 14 Tageskopien bleiben (älteste gelöscht, heutige da)");
  w.eval(`window.__dir.files.set("fremde_datei.txt",{text:"x",modified:1})`); await w.eval("writeFolderBackup('Test')");
  ok(files().includes("fremde_datei.txt"), "Fremde Dateien im Ordner werden nie angefasst");
  // all saves
  w.eval("openSlotsModal()"); d.querySelector('[data-slot-new="empty"]').click(); w.eval("closeModal()");
  w.eval("adminUnlocked = true; adminTab = 'backup'; navigate('admin')");
  await w.eval("writeFolderBackup('Alle', true)");
  ok(files().some(f=>f.startsWith("fm27_Karriere_2_aktuell")) && files().includes("fm27_Karriere_1_aktuell.json"), "'Alle Spielstände sichern' schreibt jeden Spielstand");
  // after a browser restart the permission is gone → visible pause, one click resumes
  w.eval(`window.__dir.perm = "prompt"`); await w.eval("initFolderBackup()");
  const pill = d.querySelector("#backupPill");
  ok(!pill.hidden && pill.classList.contains("paused") && pill.textContent.includes("Sicherung fortsetzen"), "Berechtigung weg (z. B. nach Neustart) → gelber Knopf 'Sicherung fortsetzen'");
  w.eval("state.club.transferBudget = 1; saveState()");
  ok(w.eval("backupTimer")===null, "Pausiert: es wird nichts geplant");
  pill.click(); await tick(80);
  ok(w.eval("backupPerm")==="granted" && pill.classList.contains("ok") && JSON.parse(w.eval("window.__dir").files.get("fm27_Karriere_2_aktuell.json").text).data.club.transferBudget===1, "Ein Klick → Erlaubnis erteilt, sofort gesichert");
  // write refused in the middle of work
  w.eval(`window.__dir.perm = "denied"`); const okW = await w.eval("writeFolderBackup('Test')");
  ok(!okW && pill.classList.contains("paused") && d.querySelector("#toastMsg").textContent.includes("fehlgeschlagen"), "Schreiben verweigert → Meldung + Pause statt stillem Fehler");
  w.eval(`window.__dir.perm = "granted"`); await w.eval("resumeFolderBackup()");
  // restore from the folder via the normal import path
  w.eval("adminUnlocked = true; adminTab = 'backup'; navigate('admin')"); await tick(60);
  const loadBtn = d.querySelector('#folderBackupList [data-bk-load="fm27_Karriere_1_aktuell.json"]');
  ok(!!loadBtn, "Liste der Sicherungen mit 'Laden …'");
  const nSlots = w.eval("slotIndex.slots.length");
  loadBtn.click(); await tick(60);
  ok(d.querySelector("#modal").textContent.includes("Wohin soll das Backup"), "Laden nutzt den normalen Import-Dialog (ersetzen oder neuer Spielstand)");
  d.querySelector('#modal [data-imp="new"]').click(); await tick(20);
  ok(w.eval("slotIndex.slots.length")===nSlots+1 && S().players.length===20, "Sicherung als neuer Spielstand geladen (20 Spieler)");
  // reminder is quiet while backups run; handle survives a reload (memory fallback in tests, IndexedDB in the browser)
  d.querySelector("#toastMsg").textContent=""; w.eval("backupReminder()");
  ok(d.querySelector("#toastMsg").textContent==="", "Backup-Erinnerung schweigt, solange die Ordner-Sicherung läuft");
  w.eval("backupDir = null; backupPerm = 'none'"); await w.eval("initFolderBackup()");
  ok(w.eval("backupPerm")==="granted" && w.eval("backupDir && backupDir.name")==="OneDrive-FM", "Ordner-Verbindung wird nach dem Neuladen wiederhergestellt");
  w.eval("clearTimeout(backupTimer); backupTimer = null");
  await w.eval("disconnectBackupFolder()");
  ok(d.querySelector("#backupPill").hidden && files().length > 0, "Trennen: Symbol weg, Dateien im Ordner bleiben");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[38] Wappen oben links = Zum Portal");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="finance"]').click();
  d.querySelector("#crestBox").click();
  ok(!d.querySelector("#saveMenu").hidden && !d.querySelector("#modalOverlay").classList.contains("active"), "10.1: Klick aufs Wappen → Spielstand-Manager (kein Einstellungs-Dialog)"); w.eval("closeSaveMenu()");
  d.querySelector('.nav-btn[data-view="notes"]').click();
  d.querySelector("#crestBox").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  ok(!d.querySelector("#saveMenu").hidden, "… auch per Tastatur (Enter)"); w.eval("closeSaveMenu()");
  d.querySelector("#btnSettings").click();
  ok(d.querySelector("#modal").textContent.includes("Vereinsname"), "Einstellungen weiterhin über das Zahnrad unten links");
  w.eval("closeModal()");

  console.log("\n[39] Seitenleiste: ein Menü statt fünf Knöpfe · helles Design");
  ({w,d,errs,S} = await boot());
  ok(d.querySelectorAll(".sidebar-footer > .menu-wrap > .icon-btn").length===1 && d.querySelector("#sideMenu").hidden, "Nur noch ein Knopf unten links, Menü zu");
  ok(["btnSettings","btnSlots","btnLayout","btnTheme","btnAdmin","btnCmd","btnHelp"].every(id=>d.querySelector("#sideMenu #"+id)), "Menü enthält: Verein & Spielstand, Spielstände, Layout, Design, Admin, Befehlspalette, Tastenkürzel");
  const mb = d.querySelector("#btnMenu"), wrap = d.querySelector("#menuWrap");
  wrap.dispatchEvent(new w.PointerEvent("pointerenter",{pointerType:"mouse"}));
  ok(!d.querySelector("#sideMenu").hidden && mb.getAttribute("aria-expanded")==="true", "Maus drüber → Menü klappt aus");
  wrap.dispatchEvent(new w.PointerEvent("pointerleave",{pointerType:"mouse"}));
  await new Promise(r=>setTimeout(r,350));
  ok(d.querySelector("#sideMenu").hidden, "Maus weg → Menü klappt (verzögert) wieder ein");
  wrap.dispatchEvent(new w.PointerEvent("pointerenter",{pointerType:"touch"}));
  ok(d.querySelector("#sideMenu").hidden, "Touch löst kein Hover-Öffnen aus");
  mb.click();
  ok(!d.querySelector("#sideMenu").hidden, "Tippen/Klick öffnet");
  mb.click();
  ok(d.querySelector("#sideMenu").hidden, "Nochmal Klick schließt");
  mb.focus(); mb.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
  ok(!d.querySelector("#sideMenu").hidden && d.activeElement.id==="btnSettings", "Tastatur: Pfeil runter öffnet, Fokus auf erstem Eintrag");
  d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
  ok(d.activeElement.id==="btnSlots", "Pfeiltasten wandern durchs Menü");
  d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok(d.querySelector("#sideMenu").hidden && d.activeElement.id==="btnMenu", "Esc schließt, Fokus zurück auf den Knopf");
  mb.click(); d.querySelector("#btnSettings").click(); await new Promise(r=>setTimeout(r,10));
  ok(d.querySelector("#modal").textContent.includes("Vereinsname") && d.querySelector("#sideMenu").hidden, "'Verein & Spielstand' öffnet die Einstellungen, Menü schließt sich");
  w.eval("closeModal()");
  mb.click(); d.body.dispatchEvent(new w.PointerEvent("pointerdown",{bubbles:true}));
  ok(d.querySelector("#sideMenu").hidden, "Klick daneben schließt das Menü");
  // theme
  ok(!d.documentElement.hasAttribute("data-theme") && d.querySelector("#themeLabel").textContent==="Helles Design", "Standard: dunkel, Eintrag heißt 'Helles Design'");
  mb.click(); d.querySelector("#btnTheme").click();
  ok(d.documentElement.getAttribute("data-theme")==="light" && d.querySelector("#themeLabel").textContent==="Dunkles Design" && d.querySelector('meta[name="theme-color"]').content==="#f5f6f9", "Umschalten → hell; Eintrag heißt jetzt 'Dunkles Design'");
  ok(JSON.parse(w.localStorage.getItem("fm27_layout")).theme==="light", "Design wird gespeichert (global, wie das Layout)");
  w.eval("resetLayout()");
  ok(d.documentElement.getAttribute("data-theme")==="light", "'Layout zurücksetzen' lässt das Design in Ruhe");
  w.eval("navigate('admin')");
  ok(w.eval("adminVisible()") && !d.querySelector("#hubRoot").hidden, "Admin öffnet die Admin-Zentrale im Hub (11.7)");
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_layout", JSON.stringify({theme:"light"}))));
  ok(d.documentElement.getAttribute("data-theme")==="light", "Gespeichertes helles Design gilt nach dem Neuladen");
  const css = require("fs").readFileSync(DIR+"style.css","utf8");
  const outside = css.replace(/:root\{[\s\S]*?\n\}/, "");
  ok(!/#6be8b3|#ffcb7a|#ff8992|#ffd9a0/i.test(outside), "Keine fest eingebauten Dunkel-Design-Textfarben mehr außerhalb der Variablen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[40] Lesbarkeit (Akzent-Varianten) & Changelog");
  ({w,d,errs,S} = await boot());
  const av = (h,t) => w.eval(`accentVariants("${h}","${t}")`);
  const cr = (a,b) => w.eval(`contrastRgb(hexRgb("${a}"), hexRgb("${b}"))`);
  const pal = ["#4f8cff","#3ddc97","#ff5d6c","#ffb84d","#b57bff","#2ec5d3","#ff7ac6","#e5484d","#ffff00","#00ff00","#000000","#ffffff"];
  let worstText = 99, worstBtn = 99;
  pal.forEach(h=>{ ["light","dark"].forEach(t=>{
    const v = av(h,t), bgs = t==="light" ? ["#ffffff","#eceef3"] : ["#151822","#1e2230"];
    bgs.forEach(b=>{ worstText = Math.min(worstText, cr(v.text, b)); });
    worstBtn = Math.min(worstBtn, cr(v.on, v.fill));
  }); });
  ok(worstText >= 4.5, `Akzent als Schrift: schlechtester Kontrast über ${pal.length} Farben × 2 Designs = ${worstText.toFixed(2)} : 1 (≥ 4,5)`);
  ok(worstBtn >= 4.5, `Schrift auf Akzent-Knöpfen: schlechtester Kontrast = ${worstBtn.toFixed(2)} : 1 (≥ 4,5)`);
  ok(av("#ffb84d","light").on === "#0f1117" && av("#4f8cff","light").on === "#ffffff", "Gelb → dunkle Knopfschrift, Blau → weiße (leicht abgedunkelter Knopf)");
  ok(d.documentElement.style.getPropertyValue("--accent-text") !== "", "Varianten werden beim Start gesetzt");
  w.eval("layout.theme='light'; applyTheme()");
  ok(d.documentElement.style.getPropertyValue("--accent-text") === av(S().club.accent,"light").text, "Designwechsel berechnet die Varianten neu");
  w.eval("layout.theme='dark'; applyTheme()");
  // changelog
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'overview'; navigate('admin')");
  ok(d.querySelector('#adminTabs [data-atab="changelog"]') && d.querySelector("#adminBody").textContent.includes("v"+w.eval("APP_VERSION")), "Admin: Reiter 'Changelog' und Version in der Übersicht");
  d.querySelector('#adminTabs [data-atab="changelog"]').click();
  const entries = d.querySelectorAll("#adminBody .cl-entry");
  ok(entries.length === w.eval("CHANGELOG.length") && entries.length >= 18 && entries[0].open && !entries[5].open, `${entries.length} Versionen, neueste aufgeklappt`);
  ok(entries[0].textContent.includes("aktuell") && d.querySelector("#adminBody .cl-tag.t-fix") && d.querySelector("#adminBody .cl-tag.t-neu"), "Kennzeichnung Neu / Verbessert / Behoben");
  ok(w.eval("CHANGELOG[0].v") === w.eval("APP_VERSION") && new Set(w.eval("CHANGELOG.map(r=>r.v)")).size === entries.length, "Aktuelle Version steht oben, keine doppelten Versionsnummern");
  // update hint: not for brand-new users, once after an update
  ({w,d,errs,S} = await boot());
  await new Promise(r=>setTimeout(r,2400));
  ok(!d.querySelector("#toastMsg").textContent.startsWith("Update"), "Allererster Start: kein Update-Hinweis");
  ({w,d,errs,S} = await boot(ls=>{ ls.setItem("fm27_slots_index", JSON.stringify({active:"x", slots:[{id:"x",name:"Alt",updatedAt:1}]})); ls.setItem("fm27_seen_version","7.3"); }));
  await new Promise(r=>setTimeout(r,2400));
  ok(d.querySelector("#toastMsg").textContent.startsWith("Update auf v") && d.querySelector("#toastUndoBtn").textContent==="Was ist neu?", "Nach einem Update: einmaliger Hinweis mit 'Was ist neu?'");
  d.querySelector("#toastUndoBtn").click();
  ok(d.querySelector("#modal h3").textContent.includes("Changelog") && d.querySelector(`#modal details[data-cl-v="${w.eval("APP_VERSION")}"]`).open && !w.eval("adminVisible()"), "'Was ist neu?' öffnet den Changelog direkt – ohne PIN (11.6.1)");
  ok(w.localStorage.getItem("fm27_seen_version") === w.eval("APP_VERSION"), "Version als gesehen gespeichert → kein zweites Mal");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[41] Als App: Manifest, Offline-Dateien, Installieren, Umzug, Willkommen");
  const fsx = require("fs");
  const man = JSON.parse(fsx.readFileSync(DIR+"manifest.webmanifest","utf8"));
  const pngSize = f => { const b = fsx.readFileSync(DIR+f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  ok(man.name && man.display==="standalone" && man.start_url && man.icons.some(i=>i.sizes==="512x512" && i.purpose==="maskable"), "Manifest: Name, eigenes Fenster (standalone), Start-Adresse, maskierbares Symbol");
  ok(man.icons.every(i=>{ const [w0,h0] = pngSize(i.src); return i.sizes === `${w0}x${h0}`; }), "Alle Symbol-Dateien existieren in der angegebenen Größe");
  const sw = fsx.readFileSync(DIR+"sw.js","utf8");
  const shell = JSON.parse(/const SHELL = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g,'"'));
  // program parts are listed twice (js/x.js and x.js – the main folder variant exists only after an upload without folders)
  const partOf = f => /^\.\/(js\/)?\d\d-[\w-]+\.js$/.test(f) ? f.replace(/^\.\/(js\/)?/, "") : null;
  ok(shell.every(f=>f==="./" || fsx.existsSync(DIR+f.replace("./","")) || (partOf(f) && fsx.existsSync(DIR+"js/"+partOf(f)))), "Jede Datei der Offline-Liste existiert – Programmteile in js/ oder im Hauptverzeichnis ("+shell.length+")");
  ok(/fm27-app-/.test(sw) && sw.includes('"SKIP_WAITING"') && !/self\.skipWaiting\(\);\s*\}\);\s*self\.addEventListener\("activate"/.test(sw), "Service Worker: Versions-Cache, Update erst nach Zustimmung");
  const idxHtml = fsx.readFileSync(DIR+"index.html","utf8");
  ok(idxHtml.includes('rel="manifest"') && idxHtml.includes("apple-touch-icon") && idxHtml.includes("favicon-32.png"), "index.html verweist auf Manifest und Symbole");
  ({w,d,errs,S} = await boot());
  const inst = d.querySelector("#btnInstall");
  ok(!inst.hidden && d.querySelector("#installLabel").textContent==="App installieren …", "Menü: 'App installieren …' (Browser hat noch nichts angeboten)");
  inst.click();
  ok(d.querySelector("#modal").textContent.includes("Browser-Menü"), "Ohne Angebot des Browsers: Erklärung, wo man installiert");
  w.eval("closeModal()");
  w.eval(`(()=>{ const e = new Event("beforeinstallprompt"); e.prompt = ()=>{ window.__prompted = true; }; e.userChoice = Promise.resolve({outcome:"accepted"}); window.dispatchEvent(e); })()`);
  ok(d.querySelector("#installLabel").textContent==="Als App installieren", "Browser bietet Installation an → 'Als App installieren'");
  inst.click(); await new Promise(r=>setTimeout(r,20));
  ok(w.__prompted && d.querySelector("#toastMsg").textContent.includes("App wird installiert"), "Klick zeigt den Installations-Dialog des Browsers");
  w.eval(`window.matchMedia = q => ({matches: /standalone/.test(q), addEventListener(){}, removeListener(){}}); renderInstallItem()`);
  ok(inst.hidden, "Läuft bereits als App → Menüpunkt verschwindet");
  // moving everything
  w.eval("setPin('2468'); layout.theme='light'; saveLayout(); openSlotsModal()"); d.querySelector('[data-slot-new="empty"]').click(); w.eval("closeModal(); state.club.name='Zweiter Verein'; saveState()");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  const payload = w.eval("exportAll()");
  ok(payload.kind==="full" && Object.keys(payload.storage).filter(k=>k.startsWith("fm27_slot_")).length===2 && payload.storage.fm27_admin && payload.storage.fm27_layout, "'Alles exportieren': 2 Spielstände + PIN + Layout in einer Datei");
  const moveText = JSON.stringify(payload);
  // the app on the new address: fresh storage, welcome dialog
  const withWelcome = ls=>{}; withWelcome.welcome = true;
  ({w,d,errs,S} = await boot(withWelcome));
  await new Promise(r=>setTimeout(r,400));
  ok(d.querySelector("#modal").textContent.includes("Willkommen in der FM27-App") && d.querySelector('[data-welcome="move"]'), "Erster App-Start: Willkommen mit 'Umzugsdatei laden …'");
  w.eval("closeModal()");
  w.eval("reloadApp = ()=>{ window.__reloaded = true; }");
  w.eval(`handleBackupText(${JSON.stringify(moveText)})`);
  ok(d.querySelector("#modal").textContent.includes("2 Spielstände") && d.querySelector("#modal").textContent.includes("Zweiter Verein"), "Umzugsdatei erkannt: 2 Spielstände mit Namen");
  d.querySelector("[data-modal-save]").click();
  ok(w.__reloaded && JSON.parse(w.localStorage.getItem("fm27_slots_index")).slots.length===2, "Übernommen, App lädt neu");
  const moved = {}; for(let i=0;i<w.localStorage.length;i++){ const k = w.localStorage.key(i); moved[k] = w.localStorage.getItem(k); }
  ({w,d,errs,S} = await boot(ls=>{ Object.entries(moved).forEach(([k,v])=>ls.setItem(k,v)); }));
  ok(w.eval("slotIndex.slots.length")===2 && w.eval("hasPin()") && d.documentElement.getAttribute("data-theme")==="light" && S().club.name==="Zweiter Verein", "Nach dem Neuladen: beide Spielstände, PIN und helles Design da");
  ok(!d.querySelector("#modalOverlay").classList.contains("active"), "Kein Willkommen mehr nach dem Umzug");
  ({w,d,errs,S} = await boot(withWelcome));
  await new Promise(r=>setTimeout(r,400));
  d.querySelector('[data-welcome="empty"]').click(); await new Promise(r=>setTimeout(r,80));
  ok(S().players.length===0 && d.querySelector("#modal").textContent.includes("Vereinsname"), "'Leer starten' → leerer Spielstand, Einstellungen offen");
  w.eval("handleBackupText(JSON.stringify({kind:'full', storage:{foo:1}}))");
  ok(d.querySelector("#modal").textContent.includes("keine Spielstände"), "Kaputte Umzugsdatei wird abgelehnt");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[42] Version 8.1: Leih-Spielzeit, Admin-Notizen, alle Auswahllisten");
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="development"]').click();
  d.querySelector('#devTabs [data-tab="loans"]').click();
  ok(d.querySelector("#dev-loans thead").textContent.includes("Spielzeit") && !d.querySelector("#dev-loans thead").textContent.includes("Minuten"), "Leihen: Spalte 'Spielzeit' statt 'Minuten'");
  const ach = S().loans.find(l=>l.name==="Ben Achterberg"), had = S().loans.find(l=>l.name==="Karim Haddad");
  const sel = id => d.querySelector(`#loanTbody tr[data-id="${id}"] [data-field="playtime"]`);
  ok([...sel(ach.id).options].map(o=>o.textContent).join("|")==="— bewerten —|Gut|Geht so|Schlecht", "Auswahl: — bewerten — / Gut / Geht so / Schlecht");
  ok(d.querySelector(`#loanTbody tr[data-id="${had.id}"]`).classList.contains("loan-bad") && !d.querySelector(`#loanTbody tr[data-id="${ach.id}"]`).classList.contains("loan-bad"), "Beispiel: Haddad (Schlecht) rot, Achterberg (Gut) nicht");
  const s1 = sel(ach.id); s1.value = "bad"; s1.dispatchEvent(new w.Event("change",{bubbles:true}));
  const achNow = S().loans.find(l=>l.id===ach.id);
  ok(achNow.playtime==="bad" && achNow.note==="Stammspieler dort · Zurückholen oder Leihe abbrechen im nächsten Transferfenster" && achNow.recallCheck===true, "Schlecht → Auto-Notiz angehängt + 'Rückruf prüfen' gesetzt");
  ok(d.querySelector(`#loanTbody tr[data-id="${ach.id}"]`).classList.contains("loan-bad") && d.querySelector(`#loanTbody tr[data-id="${ach.id}"] [data-field="note"]`).value.includes("Zurückholen"), "Zeile sofort rot, Notizfeld zeigt den neuen Text");
  ok(d.querySelector("#toastMsg").textContent.includes("rot markiert"), "Hinweis: "+d.querySelector("#toastMsg").textContent);
  const s1b = sel(ach.id); s1b.value = "bad"; s1b.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok((S().loans.find(l=>l.id===ach.id).note.match(/Zurückholen/g)||[]).length===1, "Notiz wird nicht doppelt angehängt");
  const s2 = sel(ach.id); s2.value = "good"; s2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().loans.find(l=>l.id===ach.id).note==="Stammspieler dort" && !d.querySelector(`#loanTbody tr[data-id="${ach.id}"]`).classList.contains("loan-bad"), "Wieder 'Gut' → Auto-Notiz entfernt, eigene Notiz bleibt, nicht mehr rot");
  w.eval("navigate('home')");
  const lp = d.querySelector("#loanPreview");
  ok(lp.querySelector(".alert-row.loan-bad") && lp.querySelector(".alert-row .c-red") && lp.textContent.includes("Spielzeit: Schlecht") && lp.querySelector(".alert-row").textContent.includes("Haddad"), "Portal 'Leihen im Blick': schlechte Leihe oben, rot");
  w.eval("state.ui.squadTab='future'; navigate('squad')");
  const chip = [...d.querySelectorAll("#futureSquad .fchip")].find(c=>c.textContent.includes("Haddad"));
  ok(chip && chip.classList.contains("bad-loan") && chip.title.includes("zurückholen"), "Kader → Nächste Saison: Rückkehrer mit schlechter Spielzeit rot markiert");
  // own playtime entry via the lists ("verhält sich wie Schlecht")
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'lists'; navigate('admin')");
  d.querySelector('#adminBody [data-list="playtime"]').click();
  d.querySelector("#leNew").value = "Nur Bank"; d.querySelector("#leNewBase").value = "bad"; d.querySelector("#btnLeAdd").click();
  const nurBank = S().lists.keyed.playtime.find(e=>e.label==="Nur Bank");
  ok(nurBank && nurBank.base==="bad", "Eigener Spielzeit-Eintrag 'Nur Bank' verhält sich wie 'Schlecht'");
  w.eval(`(()=>{ const l = state.loans.find(x=>x.name==="Ben Achterberg"); const before = l.playtime; l.playtime = "${nurBank.key}"; onLoanPlaytime(l, before); })()`);
  ok(S().loans.find(l=>l.name==="Ben Achterberg").note.includes("Zurückholen"), "… und löst dieselben Folgen aus");
  // fixed lists
  ok([...d.querySelectorAll("#adminBody .lists-group")].some(g=>g.textContent==="Feste Benennungen"), "Gruppe 'Feste Benennungen'");
  d.querySelector('#adminBody [data-list="venues"]').click();
  ok(d.querySelector("#adminBody .list-add").hidden && !d.querySelector("#adminBody [data-le-del]") && !d.querySelector("#adminBody [data-le-up]"), "Feste Liste: nur umbenennen (kein Hinzufügen, Löschen, Verschieben)");
  const vin = d.querySelector('#adminBody [data-le-label="0"]'); vin.value = "Zuhause"; vin.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(w.eval("VENUES.H")==="Zuhause", "Spielort 'Heim' → 'Zuhause' umbenannt");
  w.eval("navigate('fixtures')");
  ok([...d.querySelector("#oppVenue").options].map(o=>o.textContent).includes("Zuhause") && d.querySelector("#bilanzBox").textContent.includes("Zuhause"), "… erscheint im Spieltag und in der Heim/Auswärts-Bilanz");
  w.eval("adminTab = 'lists'; listSel = 'spTypes'; navigate('admin')");
  const spIn = d.querySelector('#adminBody [data-le-label="0"]'); spIn.value = "Corner links"; spIn.dispatchEvent(new w.Event("change",{bubbles:true}));
  w.eval("state.ui.tacticsTab='setpieces'; navigate('tactics')");
  ok(d.querySelector("#spTabs").textContent.includes("Corner links"), "Standard-Situation umbenannt → im Standards-Planer sichtbar");
  w.eval("adminTab = 'lists'; listSel = 'posNames'; navigate('admin')");
  const pn = d.querySelector('#adminBody [data-le-label="0"]'); pn.value = "Keeper"; pn.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(w.eval("POS_NAME.TW")==="Keeper" && w.eval("POS_LIST[0]")==="TW", "Positionsname umbenannt, Kürzel TW bleibt");
  const rtL = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rtL.lists.keyed.venues.find(e=>e.key==="H").label==="Zuhause" && rtL.lists.keyed.venues.length===3, "Feste Listen überstehen Speichern/Import (ohne Zusatz-Einträge)");
  const hacked = w.eval(`sanitizeLists({keyed:{venues:[{key:"X",label:"Mars"},{key:"A",label:"Weg"}]}})`);
  ok(hacked.keyed.venues.map(e=>e.key).join()==="H,A,N" && hacked.keyed.venues[1].label==="Weg", "Feste Listen lassen sich auch per Import nicht erweitern");
  // admin notes
  w.eval("adminTab = 'notes'; navigate('admin')");
  ok(d.querySelector('#adminTabs [data-atab="notes"]') && d.querySelector("#adminBody").textContent.includes("Noch keine Notizen"), "Admin-Reiter 'Notizen', leer");
  d.querySelector("#btnNoteNew").click();
  ok(d.activeElement.id==="noteTitle", "Neue Notiz: Cursor im Titel");
  d.querySelector("#noteTitle").value = "Änderungen für 8.2"; d.querySelector("#noteText").value = "- Idee A\n- Idee B";
  d.querySelector("#noteText").dispatchEvent(new w.Event("input",{bubbles:true}));
  await new Promise(r=>setTimeout(r,500));
  const notes = JSON.parse(w.localStorage.getItem("fm27_admin_notes"));
  ok(notes.length===1 && notes[0].title==="Änderungen für 8.2" && notes[0].text.includes("Idee B"), "Automatisch gespeichert");
  ok(d.querySelector(".lists-nav [data-note] .note-t").textContent==="Änderungen für 8.2", "Liste links zeigt den Titel");
  d.querySelector("#btnNoteNew").click(); d.querySelector("#noteText").value = "Zweite ohne Titel"; d.querySelector("#noteText").dispatchEvent(new w.FocusEvent("focusout",{bubbles:true}));
  ok(JSON.parse(w.localStorage.getItem("fm27_admin_notes")).length===2 && d.querySelector(`.lists-nav [data-note].active .note-t`).textContent==="Zweite ohne Titel", "Zweite Notiz; ohne Titel zählt die erste Zeile");
  d.querySelector("#btnNoteDel").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_admin_notes")).length===1, "Notiz gelöscht");
  d.querySelector("#toastUndoBtn").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_admin_notes")).length===2, "Löschen rückgängig");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  ok(w.eval("exportAll()").storage.fm27_admin_notes.includes("8.2"), "Notizen ziehen beim Umzug mit");
  { const v = w.eval("APP_VERSION");
    ok(w.eval("CHANGELOG[0].v")===v && require("fs").readFileSync(DIR+"sw.js","utf8").includes(`"fm27-app-${v}"`), `Version ${v} stimmt in App, Changelog und Offline-Speicher überein`); }
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[43] Version 8.1.5: Eigene Datenfelder");
  ({w,d,errs,S} = await boot());
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'fields'; navigate('admin')");
  ok(d.querySelector('#adminTabs [data-atab="fields"]') && d.querySelector("#adminBody").textContent.includes("Noch keine eigenen Felder"), "Admin-Reiter 'Eigene Felder', leer");
  const addFC = (name, type, opts, squad, scout) => { d.querySelector("#cfNewName").value = name; const ty = d.querySelector("#cfNewType"); ty.value = type; ty.dispatchEvent(new w.Event("change",{bubbles:true}));
    if(opts) d.querySelector("#cfNewOpts").value = opts; d.querySelector("#cfNewSquad").checked = squad; d.querySelector("#cfNewScout").checked = scout; d.querySelector("#btnCfAdd").click(); };
  addFC("Homegrown", "bool", "", true, false);
  addFC("Strafen", "number", "", true, false);
  addFC("Scouting-Priorität", "select", "Hoch, Mittel, Niedrig", true, true);
  addFC("Berater", "text", "", false, true);
  const FC = S().customFields;
  ok(FC.length===4 && FC[0].type==="bool" && FC[2].options.join()==="Hoch,Mittel,Niedrig" && FC[3].areas.join()==="scouting", "4 Felder: Ja/Nein, Zahl, Auswahl (Kader+Scouting), Text (nur Scouting)");
  addFC("homegrown", "text", "", true, false);
  ok(S().customFields.length===4 && d.querySelector("#toastMsg").textContent.includes("gibt es schon"), "Doppelter Name (Groß/klein egal) abgelehnt");
  addFC("Leer", "select", "", true, false);
  ok(S().customFields.length===4, "Auswahl ohne Werte abgelehnt");
  // squad table
  w.eval("navigate('squad')");
  const headsC = [...d.querySelectorAll("#squadTable thead th.cf-head")].map(th=>th.textContent.trim());
  ok(headsC.join("|")==="Homegrown|Strafen|Scouting-Priorität", "Kadertabelle: 3 neue Spalten vor den Aktionen ("+headsC.join(", ")+")");
  const lastHeadC = [...d.querySelectorAll("#squadTable thead th")].pop();
  ok(!lastHeadC.classList.contains("cf-head") && d.querySelectorAll("#squadTbody tr[data-id]")[0].querySelectorAll("td.cf-cell").length===3, "Jede Zeile hat 3 Feld-Zellen, Aktionen bleiben ganz rechts");
  const pid0C = S().players[0].id, pid1C = S().players[1].id;
  const cellC = (pid, fid) => d.querySelector(`#squadTbody tr[data-id="${pid}"] [data-cf="${fid}"]`);
  const hgC = cellC(pid0C, FC[0].id); hgC.checked = true; hgC.dispatchEvent(new w.Event("change",{bubbles:true}));
  const stC = cellC(pid0C, FC[1].id); stC.value = "2.5"; stC.dispatchEvent(new w.Event("change",{bubbles:true}));
  const prC = cellC(pid1C, FC[2].id); prC.value = "Hoch"; prC.dispatchEvent(new w.Event("change",{bubbles:true}));
  const st1C = cellC(pid1C, FC[1].id); st1C.value = "7"; st1C.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].custom[FC[0].id]===true && S().players[0].custom[FC[1].id]===2.5 && S().players[1].custom[FC[2].id]==="Hoch" && S().players[1].custom[FC[1].id]===7, "Direkt im Gitter bearbeitet: Ja/Nein, Zahl 2,5, Auswahl 'Hoch'");
  const st0bC = cellC(pid0C, FC[1].id); st0bC.value = ""; st0bC.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!(FC[1].id in S().players[0].custom), "Leerer Wert wird nicht gespeichert (sauber entfernt)");
  // sort by custom column
  const thSC = [...d.querySelectorAll("#squadTable thead th.cf-head")].find(th=>th.textContent.includes("Strafen"));
  thSC.click();
  ok(d.querySelector("#squadTbody tr[data-id]").dataset.id===pid1C || S().players.filter(p=>p.custom[FC[1].id]!==undefined).length===1, "Sortierung nach 'Strafen' (Werte zuerst, leere am Ende)");
  const firstWithC = d.querySelectorAll("#squadTbody tr[data-id]")[0].dataset.id;
  ok(firstWithC===pid1C && [...d.querySelectorAll("#squadTable thead th.cf-head")].find(th=>th.textContent.includes("Strafen")).classList.contains("sorted"), "Spielender mit Wert steht oben, Kopf als sortiert markiert");
  [...d.querySelectorAll("#squadTable thead th.cf-head")].find(th=>th.textContent.includes("Homegrown")).click();
  [...d.querySelectorAll("#squadTable thead th.cf-head")].find(th=>th.textContent.includes("Homegrown")).click();
  ok(d.querySelector("#squadTbody tr[data-id]").dataset.id===pid0C, "Ja/Nein absteigend: Homegrown-Spieler oben");
  // scouting table
  w.eval("state.ui.transferTab='buy'; navigate('recruitment')");
  const shC = [...d.querySelectorAll("#scoutTable thead th.cf-head")].map(th=>th.textContent.trim());
  ok(shC.join("|")==="Scouting-Priorität|Berater", "Scouting-Liste: nur die zugewiesenen Felder (Scouting-Priorität, Berater)");
  const tidC = S().scouting[0].id;
  const beC = d.querySelector(`#scoutTbody tr[data-id="${tidC}"] [data-cf="${FC[3].id}"]`); beC.value = "  Agentur Nord  "; beC.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().scouting.find(t=>t.id===tidC).custom[FC[3].id]==="Agentur Nord", "Text im Scouting gespeichert (Leerzeichen bereinigt)");
  const nameThC = d.querySelector('#scoutTable th[data-sort="name"]'); nameThC.click();
  const namesC = [...d.querySelectorAll("#scoutTbody tr[data-id]")].map(tr=>S().scouting.find(t=>t.id===tr.dataset.id).name);
  ok(JSON.stringify(namesC)===JSON.stringify(namesC.slice().sort((a,b)=>a.localeCompare(b,"de"))), "Scouting nach Name sortierbar (neu)");
  nameThC.click(); nameThC.click();
  ok(!d.querySelector('#scoutTable th.sorted'), "Dritter Klick: zurück zur Standard-Reihenfolge");
  // signing keeps values
  const fxC = S().scouting.find(t=>t.status==="fixed"); fxC.custom = {[FC[2].id]:"Mittel"};
  w.eval(`signTarget(state.scouting.find(t=>t.status==="fixed"))`); d.querySelector("[data-modal-save]").click();
  ok(S().players.find(p=>p.name===fxC.name).custom[FC[2].id]==="Mittel", "Verpflichtung übernimmt die Feldwerte in den Kader");
  // type change converts, undo restores
  w.eval("adminTab = 'fields'; navigate('admin')");
  const ty1C = d.querySelector('[data-cfd-type="1"]'); ty1C.value = "text"; ty1C.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===pid1C).custom[FC[1].id]==="7", "Zahl → Text: 7 wird zu '7'");
  ty1C.value = "number"; const ty1bC = d.querySelector('[data-cfd-type="1"]'); ty1bC.value = "number"; ty1bC.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===pid1C).custom[FC[1].id]===7, "Text → Zahl: '7' wird wieder 7");
  // options: rename 1:1 keeps values, removing an option clears + offers undo
  const opC = d.querySelector('[data-cfd-opts="2"]'); opC.value = "Sehr hoch, Mittel, Niedrig"; opC.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===pid1C).custom[FC[2].id]==="Sehr hoch", "Auswahlwert umbenannt (gleiche Anzahl) → Werte ziehen mit");
  const op2C = d.querySelector('[data-cfd-opts="2"]'); op2C.value = "Mittel, Niedrig"; op2C.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===pid1C).custom[FC[2].id]===undefined && d.querySelector("#toastMsg").textContent.includes("geleert"), "Wert entfernt → betroffene Einträge geleert, mit Hinweis");
  d.querySelector("#toastUndoBtn").click();
  ok(S().players.find(p=>p.id===pid1C).custom[FC[2].id]==="Sehr hoch", "Rückgängig stellt die Werte wieder her");
  // area toggle keeps values
  w.eval("adminTab = 'fields'; navigate('admin')");
  const arC = d.querySelector('[data-cfd-area="0:squad"]'); arC.checked = false; arC.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].custom[FC[0].id]===undefined ? false : true, "Nur-Kader-Feld: letzter Bereich lässt sich nicht abwählen");
  const ar2C = d.querySelector('[data-cfd-area="2:squad"]'); ar2C.checked = false; ar2C.dispatchEvent(new w.Event("change",{bubbles:true}));
  w.eval("navigate('squad')");
  ok(![...d.querySelectorAll("#squadTable thead th.cf-head")].some(th=>th.textContent.includes("Scouting-Priorität")) && S().players.find(p=>p.id===pid1C).custom[FC[2].id]==="Sehr hoch", "Bereich 'Kader' abgewählt: Spalte weg, Wert bleibt erhalten");
  w.eval("adminTab = 'fields'; navigate('admin')");
  const ar3C = d.querySelector('[data-cfd-area="2:squad"]'); ar3C.checked = true; ar3C.dispatchEvent(new w.Event("change",{bubbles:true}));
  w.eval("navigate('squad')");
  ok(d.querySelector(`#squadTbody tr[data-id="${pid1C}"] [data-cf="${FC[2].id}"]`).value==="Sehr hoch", "… und wieder angehakt: Wert ist wieder da");
  // log + revert
  const lgC = w.eval("readLog()").filter(e=>e.field && e.field.startsWith("cf:"));
  ok(lgC.length >= 3 && w.eval(`logText(readLog().filter(e=>e.field && e.field.startsWith("cf:")).pop())`).includes("·"), "Feld-Änderungen einzeln im Protokoll: "+w.eval(`logText(readLog().filter(e=>e.field && e.field.startsWith("cf:"))[0])`));
  const hgEntryC = w.eval(`readLog().find(e=>e.field==="cf:${FC[0].id}")`);
  ok(w.eval(`revertLogEntry("${hgEntryC.id}")`) && S().players[0].custom[FC[0].id]===undefined, "Rücknahme aus dem Protokoll: Homegrown wieder leer");
  // CSV export + FM import mapping
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  w.eval(`state.players[0].custom["${FC[0].id}"] = true; saveState()`);
  const csvC = w.eval("exportSquadCSV()");
  ok(csvC.split("\r\n")[0].endsWith(";Homegrown;Strafen;Scouting-Priorität") && csvC.includes(";Ja;"), "CSV-Export enthält die Kader-Felder (Ja/Nein als 'Ja')");
  const impC = `Name;Homegrown;Strafen\n${S().players[0].name};Nein;3\n${S().players[2].name};Ja;`;
  w.eval("openImportWizard()"); d.querySelector("#impText").value = impC; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  ok(d.querySelector('#modal [data-map="1"]').value===`cf:${FC[0].id}` && d.querySelector('#modal [data-map="2"]').value===`cf:${FC[1].id}`, "Import: Spalten 'Homegrown' und 'Strafen' automatisch den Feldern zugeordnet");
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  ok(d.querySelector("#modal").textContent.includes("Homegrown: Ja → Nein") && d.querySelector("#modal").textContent.includes("Strafen:"), "Abgleich zeigt Feld-Änderungen verständlich");
  const sbC = d.querySelector("#modal [data-impC-sample]"); if(sbC) sbC.checked = false;
  d.querySelector("[data-modal-save]").click();
  ok(!S().players[0].custom[FC[0].id] && S().players[0].custom[FC[1].id]===3 && S().players[2].custom[FC[0].id]===true, "Übernommen: Homegrown Nein/Ja, Strafen 3");
  // dialog ✎
  d.querySelector(`#squadTbody tr[data-id="${S().players[2].id}"] [data-edit]`).click();
  ok(d.querySelector("#modal .cf-modal") && d.querySelector(`#modal [data-cfm="${FC[0].id}"]`).checked, "✎-Dialog zeigt die eigenen Felder");
  d.querySelector(`#modal [data-cfm="${FC[1].id}"]`).value = "4,5"; d.querySelector("[data-modal-save]").click();
  ok(S().players[2].custom[FC[1].id]===4.5 && S().players[2].custom[FC[0].id]===true, "Im Dialog gespeichert (4,5 → 4.5), andere Werte bleiben");
  // persistence + sanitize + delete
  const rtC = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rtC.customFields.length===4 && rtC.players[2].custom[FC[1].id]===4.5, "Felder und Werte überstehen Speichern/Import/Umzug");
  const badC = w.eval(`migrateState({version:6, club:{name:"X"}, customFields:[{id:"a",name:"N",type:"number",areas:["squad"]},{id:"b",name:"",type:"text"},{id:"c",name:"n",type:"text"},{id:"d",name:"S",type:"select",options:[]}], players:[{id:"p",name:"P",custom:{a:"12x",zz:1,d:"?"}}]})`);
  ok(badC.customFields.length===2 && badC.customFields[1].options[0]==="Option 1" && JSON.stringify(badC.players[0].custom)==="{}", "Bereinigung: leere/doppelte Namen raus, Auswahl ohne Werte repariert, ungültige und fremde Werte verworfen");
  w.eval("adminTab = 'fields'; navigate('admin')");
  d.querySelector('[data-cfd-del="1"]').click();
  ok(d.querySelector("#modal").textContent.includes("Werte werden gelöscht") || d.querySelector("#modal").textContent.includes("eingetragene Wert"), "Löschen fragt nach und nennt die Anzahl der Werte");
  d.querySelector("[data-modal-save]").click();
  ok(S().customFields.length===3 && S().players.every(p=>!(FC[1].id in p.custom)), "Feld 'Strafen' gelöscht – Werte sauber entfernt");
  d.querySelector("#toastUndoBtn").click();
  ok(S().customFields.length===4 && S().players[2].custom[FC[1].id]===4.5, "Rückgängig: Feld und Werte zurück");
  ok(w.eval("readLog()").some(e=>e.area==="Eigene Felder"), "Feld-Definitionen im Protokoll");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[44] Version 8.2: Wartung & Batch-Tools");
  ({w,d,errs,S} = await boot());
  ok(w.eval(`loanEndISO("06/2027")`)==="2027-06-30" && w.eval(`loanEndISO("2.2028")`)==="2028-02-29" && w.eval(`loanEndISO("30.06.2027")`)==="2027-06-30" && w.eval(`loanEndISO("2027")`)==="2027-06-30" && w.eval(`loanEndISO("Sommer")`)===null && w.eval(`loanEndISO("13/2027")`)===null,
     "Leih-Enddaten: 06/2027, 2.2028 (Schaltjahr), 30.06.2027, 2027 – Unklares wird nie als beendet gewertet");
  // build realistic leftovers
  w.eval(`(()=>{
    const lind = state.players.find(p=>p.name==="Jonas Lindqvist");
    state.players.push(Object.assign({}, lind, {id:"dupL", note:""}));                       // re-import duplicate (not in the line-up)
    state.scouting.push({id:"sig1", name:"Aurelien Faye", pos:"IV", age:27, grade:"A", status:"fixed", fee:1, bonus:0, wage:0, priority:2, note:""});
    state.scouting.push({id:"ph1", name:"Unbekannt", pos:"ZM", age:20, grade:"B", status:"watched", fee:0, bonus:0, wage:0, priority:2, note:""});
    state.prospects.push({id:"prs1", name:"Rafael Couto", pos:"LF", age:19, current:3, potential:4, pathway:"first", focus:"", readyBy:"", note:""});
    const r0 = state.results[0]; state.results.push(Object.assign({}, r0, {id:"dupR"}));
    state.players.find(p=>p.name==="Mats Böhringer").contractUntil = 2026;                    // expired
    state.loans.find(l=>l.name==="Ben Achterberg").until = "01/2027";                        // loan over (date: 12.03.2027)
    state = sanitizeState(state); saveState();
    localStorage.setItem("fm27_log_deadsave", JSON.stringify([{x:1}])); localStorage.setItem("fm27_rp_deadsave", "[]");
  })()`);
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'maintenance'; navigate('admin')");
  ok(d.querySelector('#adminTabs [data-atab="maintenance"]').textContent.includes("Wartung & Batch"), "Admin-Reiter 'Wartung & Batch'");
  const catsM = w.eval("findOrphans()"), ckM = k => catsM.find(c=>c.key===k);
  ok(ckM("dupPlayers") && ckM("dupPlayers").items.length===1 && ckM("dupPlayers").items[0].id==="dupL", "Doppelter Spieler erkannt – entfernt wird die Kopie, nicht der Spieler aus der Aufstellung");
  ok(ckM("signedTargets").items[0].id==="sig1" && ckM("prospectsInSquad").items[0].id==="prs1" && ckM("placeholders").items[0].id==="ph1", "Erledigtes Transferziel, Talent im Kader, leeres Probe-Scouting erkannt");
  ok(ckM("dupResults").items.length===1 && ckM("storage").items.length===1 && ckM("storageCheck").items.some(it=>it.key==="fm27_rp_deadsave") && !ckM("storageCheck").safe, "Doppeltes Ergebnis + Protokoll eines gelöschten Spielstands (sicher); dessen Wiederherstellungspunkte nur 'bitte prüfen'");
  ok(ckM("expired").items[0].text==="Mats Böhringer" && !ckM("expired").safe && ckM("endedLoans").items[0].text==="Ben Achterberg" && !ckM("endedLoans").safe, "Abgelaufener Vertrag & beendete Leihe stehen 'zur Prüfung'");
  ok(!catsM.some(c=>c.key==="sample"), "Reine Demo-Karriere: Beispieldaten werden nicht als verwaist gemeldet");
  const boxM = k => d.querySelector(`[data-orphan="${k}"]`);
  ok(boxM("players:dupL").checked && !boxM("storage:fm27_log_deadsave") && !boxM(`players:${S().players.find(p=>p.name==="Mats Böhringer").id}`).checked, "Vorauswahl: sichere Fälle an, 'zur Prüfung' aus – Speicher-Altlasten stehen jetzt unter Allgemein → Speicher (11.7)");
  const btnM = d.querySelector("#btnOrphanClean");
  ok(btnM.textContent.includes("(5)"), "Knopf nennt die Anzahl: "+btnM.textContent.trim());
  const nPM = S().players.length, rpNM = w.eval("readRestorePoints().length");
  btnM.click();
  ok(S().players.length===nPM-1 && !S().players.some(p=>p.id==="dupL") && S().players.some(p=>p.name==="Jonas Lindqvist") && S().players.some(p=>p.name==="Mats Böhringer"),
     "Bereinigt: Kopie weg, Original und 'zur Prüfung'-Spieler bleiben");
  ok(!S().scouting.some(t=>t.id==="sig1"||t.id==="ph1") && !S().prospects.some(t=>t.id==="prs1") && !S().results.some(r=>r.id==="dupR") && w.localStorage.getItem("fm27_log_deadsave")!==null, "Ziele, Talent, Ergebnis entfernt – der Speicher bleibt hier unberührt");
  ok(w.eval("readRestorePoints().length")===rpNM+1 && w.eval("readRestorePoints()[0].reason").startsWith("Vor Wartung") && w.eval("readLog()").slice(-1)[0].text.includes("5 Einträge entfernt"), "Wiederherstellungspunkt + Protokoll");
  ok(d.querySelector("#adminBody").textContent.includes("Abgelaufene Verträge") && !d.querySelector("#adminBody").textContent.includes("Doppelte Spieler"), "Liste aktualisiert: nur noch die Prüf-Fälle");
  d.querySelector("#toastUndoBtn").click();
  ok(S().players.some(p=>p.id==="dupL") && S().scouting.some(t=>t.id==="sig1"), "Rückgängig holt alles zurück");
  w.eval("adminTab = 'storage'; orphanSel = null; renderAdmin()");
  ok(d.querySelector("#adminBody").textContent.includes("Speicherbelegung") && boxM("storage:fm27_log_deadsave") && boxM("storage:fm27_log_deadsave").checked && !boxM("players:dupL"), "Allgemein → Speicher: Belegung + Speicher-Altlasten (vorausgewählt), keine Kader-Funde");
  d.querySelector("#btnOrphanClean").click();
  ok(w.localStorage.getItem("fm27_log_deadsave")===null && w.localStorage.getItem("fm27_rp_deadsave")!==null, "Altlast entfernt, 'bitte prüfen' (Wiederherstellungspunkte) bleibt");
  d.querySelector("#toastUndoBtn").click();
  ok(w.localStorage.getItem("fm27_log_deadsave")!==null, "… rückgängig machbar");
  // money conversion
  w.eval("adminTab = 'maintenance'; navigate('admin')");
  const sumSalM = () => S().players.reduce((a,p)=>a+p.salary,0);
  const s0M = sumSalM();
  const buM = (k, v) => { const el = d.querySelector(`[data-bu="${k}"]`); el.value = v; el.dispatchEvent(new w.Event(k==="value" ? "input" : "change",{bubbles:true})); };
  buM("target","salary"); buM("mode","factor"); buM("value","1,17"); buM("round","1000");
  ok(d.querySelector("#moneyPreview").textContent.includes("Werte ändern sich") && !d.querySelector("#btnMoneyApply").disabled, "Vorschau: "+d.querySelector("#moneyPreview").textContent.split("·")[0].trim());
  d.querySelector("#btnMoneyApply").click();
  const lindSM = S().players.find(p=>p.name==="Jonas Lindqvist").salary;
  ok(lindSM===Math.round(744000*1.17/1000)*1000 && S().players.every(p=>p.salary % 1000 === 0), `Gehälter × 1,17, auf 1.000 gerundet (Lindqvist 744.000 → ${lindSM})`);
  d.querySelector("#toastUndoBtn").click();
  ok(sumSalM()===s0M, "Rückgängig: Gehälter wie vorher");
  w.eval("adminTab = 'maintenance'; navigate('admin')");
  buM("value","abc");
  ok(d.querySelector("#btnMoneyApply").disabled && d.querySelector("#moneyPreview").textContent.includes("gültige Zahl"), "Ungültiger Faktor: Knopf gesperrt");
  buM("target","scoutFee"); buM("mode","percent"); buM("value","-10"); buM("round","0");
  const fee0M = S().scouting.find(t=>t.name==="Léo Ferreira").fee;
  d.querySelector("#btnMoneyApply").click();
  ok(S().scouting.find(t=>t.name==="Léo Ferreira").fee===Math.round(fee0M*0.9), "Ablösen im Scouting −10 %");
  w.eval("adminTab = 'maintenance'; navigate('admin')");
  buM("target","salary"); buM("role","key"); buM("mode","percent"); buM("value","5");
  const rotBeforeM = S().players.filter(p=>p.squadRole!=="key").map(p=>p.salary).join();
  d.querySelector("#btnMoneyApply").click();
  ok(S().players.filter(p=>p.squadRole!=="key").map(p=>p.salary).join()===rotBeforeM, "Filter Kaderrolle: nur Schlüsselspieler +5 %");
  // resets
  w.eval("adminTab = 'maintenance'; navigate('admin')");
  d.querySelector('[data-preset="0"]').click();
  ok(S().scouting.every(t=>t.status==="watched"), "Preset: alle Scouting-Status → Beobachtet");
  ok(w.eval("budgetCalc().fees")===0, "… und damit keine fixierten Ablösen mehr im Budget");
  w.eval("adminTab = 'maintenance'; navigate('admin')");
  d.querySelector('[data-preset="0"]').click();
  ok(d.querySelector("#toastMsg").textContent.includes("nichts zu tun"), "Zweimal: 'nichts zu tun' statt leerer Aktion");
  w.eval("adminTab = 'maintenance'; navigate('admin')");
  d.querySelector('[data-preset="3"]').click();
  const hadM = S().loans.find(l=>l.name==="Karim Haddad");
  ok(hadM.playtime==="" && !hadM.note.includes("Zurückholen"), "Leih-Spielzeiten zurückgesetzt – Auto-Notiz entfernt (konsistent)");
  // set for all incl. custom field and position filter
  w.eval(`state.customFields.push({id:"hg", name:"Homegrown", type:"bool", options:[], areas:["squad"]}); state = sanitizeState(state); saveState(); adminTab = 'maintenance'; navigate('admin')`);
  buM("setKey","players.cf:hg"); buM("setRaw","true"); buM("setPos","ST");
  ok(d.querySelector("#setPreview").textContent.includes(`${S().players.filter(p=>p.pos==="ST").length} von ${S().players.filter(p=>p.pos==="ST").length}`), "Vorschau: "+d.querySelector("#setPreview").textContent);
  d.querySelector("#btnSetApply").click();
  ok(S().players.filter(p=>p.pos==="ST").every(p=>p.custom.hg===true) && S().players.filter(p=>p.pos!=="ST").every(p=>!p.custom.hg), "Eigenes Feld 'Homegrown' nur für Stürmer auf Ja gesetzt");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[45] Version 8.3: Transfer-Hub & Bosman");
  ({w,d,errs,S} = await boot());
  // Bosman rule: 01.01.–30.06. of the final contract year
  const bosTestH = (cu, date) => w.eval(`isBosman({contractUntil:${cu}}, "${date}")`);
  ok(bosTestH(2027,"2027-01-01") && bosTestH(2027,"2027-06-30") && !bosTestH(2027,"2026-12-31") && !bosTestH(2027,"2027-07-01") && !bosTestH(2028,"2027-03-01"), "Bosman: ab 01.01. bis 30.06. des letzten Vertragsjahres");
  const bosPH = S().players.filter(p=>p.contractUntil===2027);
  ok(bosPH.length>0 && bosPH.every(p=>p.bosmanAck===2027) && S().todos.filter(t=>t.text.startsWith("Bosman:")).length===bosPH.length, `Beim Start (12.03.2027): ${bosPH.length} Bosman-Aufgaben, je Spieler genau eine`);
  const arnoldH = S().players.find(p=>p.name==="Felix Arnold");   // Abgabe
  ok(arnoldH.contractUntil===2027 && !w.eval(`bosmanMarked(state.players.find(p=>p.name==="Felix Arnold"))`) && S().todos.some(t=>t.text.includes("Felix Arnold (Abgabe)") && t.text.includes("letzte Chance")), "Abgabe-Spieler: keine Markierung, aber Aufgabe mit 'letzte Chance auf Ablöse'");
  w.eval("navigate('squad')");
  const markedPH = bosPH.find(p=>listBaseOfH(p));
  function listBaseOfH(p){ return w.eval(`bosmanMarked(state.players.find(x=>x.id==="${p.id}"))`); }
  ok(markedPH && d.querySelector(`#squadTbody tr[data-id="${markedPH.id}"] .contract-cell .bosman-tag`), `${markedPH.name}: im Kader mit 'B' markiert`);
  ok(!d.querySelector(`#squadTbody tr[data-id="${arnoldH.id}"] .bosman-tag`), "Abgabe-Spieler im Kader nicht markiert");
  w.eval("navigate('home')");
  ok(d.querySelector("#contractAlerts").textContent.includes("Bosman"), "Portal → Vertragsfristen zeigt 'Bosman'");
  // no duplicates on reload or date jumps
  const nTodosH = S().todos.length;
  w.eval("checkBosman(); nextDay(1)");
  ok(S().todos.length===nTodosH, "Keine doppelten Aufgaben bei weiteren Prüfungen/Datumssprüngen");
  // crossing 01.01. triggers the notification
  w.eval(`state.club.ingameDate = "2027-12-30"; state.players.find(p=>p.name==="Aurelien Faye").contractUntil = 2028; saveState()`);
  w.eval("applyDateChange('2028-01-02')");
  ok(d.querySelector("#toastMsg").textContent.includes("⚖ Bosman") && d.querySelector("#toastMsg").textContent.includes("Aurelien Faye") && S().todos.some(t=>t.text.startsWith("Bosman: Aurelien Faye")), "Datumssprung über den 01.01.: Hinweis + Aufgabe");
  // the hub
  ({w,d,errs,S} = await boot());
  d.querySelector('.nav-btn[data-view="recruitment"]').click();
  ok(d.querySelector('#transferTabs [data-tab="center"]').classList.contains("active") && d.querySelector("#tr-center .tc-hero"), "Transfers öffnet mit dem Transfer-Center (live)");
  d.querySelector('#transferTabs [data-tab="plan"]').click();
  ok(d.querySelector("#tr-plan.active") && !d.querySelector("#tr-plan").textContent.includes("Keine Transferfenster"), "Fenster-Plan weiterhin als eigener Reiter");
  ok(d.querySelector("#tr-plan h2").textContent.includes("Sommerfenster 2027") && d.querySelector("#tr-plan").textContent.includes("öffnet in") && d.querySelector("#tr-plan").textContent.includes("111"), "12.03.2027 → automatisch Sommerfenster 2027, öffnet in 111 Tagen");
  let taskTextH = d.querySelector("#tr-plan .hub-tasks").textContent;
  ok(!taskTextH.includes("Karim Haddad: Spielzeit schlecht") && taskTextH.includes("Karim Haddad kehrt"), "Leihe endet vor dem Sommerfenster: nur die Rückkehrer-Entscheidung, kein sinnloses 'Zurückholen'");
  ok(!d.querySelector("#tr-plan .hub-budget") && d.querySelector("#tr-plan .hub-links"), "Keine doppelte Budget-Anzeige im Hub");
  w.eval(`state.loans.find(l=>l.name==="Karim Haddad").until = "01/2028"; saveState(); renderTransferPlan()`);
  taskTextH = d.querySelector("#tr-plan .hub-tasks").textContent;
  ok(taskTextH.includes("Karim Haddad: Spielzeit schlecht") && taskTextH.includes("Rui Almeida: Transfer fixiert") && taskTextH.includes("kehrt von der Leihe zurück"), "Leihe läuft im Fenster weiter: 'Zurückholen' (8.1), dazu fixierter Neuzugang und Rückkehrer-Entscheidung");
  ok(taskTextH.includes("letztes Vertragsjahr") || taskTextH.includes("Bosman"), "Aufgaben: Verträge, die in den Bosman-Zeitraum laufen");
  // Soll/Ist
  const stRowH = [...d.querySelectorAll("#tr-plan .hub-need tbody tr")].find(tr=>tr.textContent.trim().startsWith("ST"));
  ok(stRowH && stRowH.querySelector('[data-hub-target="ST"]').value==="2", "Soll/Ist-Tabelle mit Standard-Soll (ST 2)");
  const inpH = stRowH.querySelector('[data-hub-target="ST"]'); inpH.value = "4"; inpH.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().transferPlan.targets.ST===4 && w.eval("POS_NEED('ST')")===4, "Soll ST auf 4 gesetzt");
  w.eval("state.ui.squadTab='future'; navigate('squad')");
  ok(d.querySelector("#futureSquad .future-warn").textContent.includes("(Ziel 4)"), "… gilt auch für die Warnungen unter Nächste Saison");
  w.eval("state.ui.transferTab='plan'; navigate('recruitment'); renderRecruitment()");
  // loan returner decision flows into the future squad
  const achH = S().loans.find(l=>l.name==="Ben Achterberg");
  const rselH = d.querySelector(`[data-hub-return="${achH.id}"]`); rselH.value = "loan"; rselH.dispatchEvent(new w.Event("change",{bubbles:true}));
  const feH = w.eval(`futureSquadEntries().entries.find(e=>e.name==="Ben Achterberg")`);
  ok(S().loans.find(l=>l.id===achH.id).returnPlan==="loan" && feH.kind==="loanAgain", "Rückkehrer 'erneut verleihen' → zählt im Zukunfts-Kader nicht mit");
  ok(!d.querySelector("#tr-plan .hub-tasks").textContent.includes("Ben Achterberg kehrt"), "Entschiedene Rückkehrer verschwinden aus den Aufgaben");
  // shortlist rank
  const tgtH = S().scouting.find(t=>t.name==="Léo Ferreira");
  const rkH = d.querySelector(`[data-hub-rank="${tgtH.id}"]`); rkH.value = "1"; rkH.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().scouting.find(t=>t.id===tgtH.id).shortlist===1 && [...d.querySelectorAll("#tr-plan .hub-need tbody tr")].find(tr=>tr.textContent.trim().startsWith("ST")).textContent.includes("1. Léo Ferreira"), "Shortlist: Léo Ferreira = 1. Wahl, erscheint beim ST-Bedarf");
  // actions
  d.querySelector(`#tr-plan [data-hub="recall:${S().loans.find(l=>l.name==="Karim Haddad").id}"]`).click();
  ok(S().players.some(p=>p.name==="Karim Haddad") && !S().loans.some(l=>l.name==="Karim Haddad"), "Aktion 'Zurückholen' holt Haddad in den Kader");
  // manual switch to winter
  w.eval("state.ui.transferTab='plan'; navigate('recruitment'); renderRecruitment()");
  d.querySelector('#hubWinSel [data-hubwin="winter"]').click();
  ok(d.querySelector("#tr-plan h2").textContent.includes("Winterfenster 2028") && d.querySelector("#tr-plan").textContent.includes("manuell gewählt") && d.querySelector("#tr-plan").textContent.includes("Bosman-Liste"), "Manuell: Winterfenster 2028 mit Bosman-Liste");
  ok(d.querySelector("#tr-plan").textContent.includes("Verträge bis 30.06.2028"), "Winter-Bosman-Liste bezieht sich auf Verträge bis 30.06.2028");
  w.eval(`state.players.find(p=>p.name==="Rafael Couto").status = "injured"; state.players.find(p=>p.name==="Yannick Dufour").status="suspended"; saveState(); renderTransferPlan()`);
  ok(d.querySelector("#tr-plan").textContent.includes("Kurzfristige Lücken") && /ZM|LF/.test([...d.querySelectorAll("#tr-plan .hub-loans li")].map(li=>li.textContent).join()), "Kurzfristige Lücken durch Verletzung/Sperre erkannt");
  d.querySelector('#hubWinSel [data-hubwin="auto"]').click();
  ok(d.querySelector("#tr-plan h2").textContent.includes("Sommerfenster"), "Zurück auf automatisch");
  // open window: date inside the summer window
  w.eval(`state.club.ingameDate = "2027-07-15"; saveState(); renderTransferPlan()`);
  ok(d.querySelector("#tr-plan .hub-top").textContent.includes("offen") && d.querySelector("#tr-plan .hub-top").textContent.includes("schließt in 48 Tagen"), "Im Fenster: 'offen · schließt in 48 Tagen'");
  // persistence
  const rtHH = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rtHH.transferPlan.targets.ST===4 && rtHH.scouting.find(t=>t.name==="Léo Ferreira").shortlist===1 && rtHH.loans.find(l=>l.name==="Ben Achterberg").returnPlan==="loan", "Soll, Shortlist und Rückkehrer-Plan überstehen Speichern/Import");
  const badHH = w.eval(`migrateState({version:6, club:{name:"X"}, transferPlan:{targets:{ST:99, IV:"abc"}}, scouting:[{name:"A", shortlist:7}], loans:[{name:"L", returnPlan:"mars"}]})`);
  ok(badHH.transferPlan.targets.ST===8 && badHH.transferPlan.targets.IV===3 && badHH.scouting[0].shortlist===3 && badHH.loans[0].returnPlan==="", "Bereinigung: Soll begrenzt/Standard, Wahl begrenzt, unbekannter Plan verworfen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[46] Version 8.4: Leih-Rucksack (Bugfix) & Deadline Day");
  ({w,d,errs,S} = await boot());
  // --- the reported bug: loan out → recall must keep everything ---
  w.eval(`(()=>{ const p = state.players.find(x=>x.name==="Aurelien Faye");
    p.nation = "Frankreich"; p.valueMin = 12000000; p.valueMax = 15000000; p.birthDate = "1999-08-14"; p.salary = 936000; p.contractUntil = 2030; p.rating = 5; p.squadRole = "key";
    state.customFields.push({id:"hg", name:"Homegrown", type:"bool", options:[], areas:["squad"]}); p.custom = {hg:true}; p.note = "Abwehrchef";
    state = sanitizeState(state); saveState(); })()`);
  const fayeBeforeD = JSON.parse(JSON.stringify(S().players.find(x=>x.name==="Aurelien Faye")));
  const histLenD = (S().history[fayeBeforeD.id] || []).length;
  d.querySelector('.nav-btn[data-view="squad"]').click();
  d.querySelector(`#squadTbody tr[data-id="${fayeBeforeD.id}"] [data-loan]`).click();
  d.querySelector('#modal [data-f="club"]').value = "FC Leihstadt"; d.querySelector('#modal [data-f="until"]').value = "06/2028";
  d.querySelector("[data-modal-save]").click();
  const loanFD = S().loans.find(l=>l.name==="Aurelien Faye");
  ok(loanFD && loanFD.player && loanFD.player.nation==="Frankreich" && loanFD.player.valueMax===15000000 && !S().players.some(p=>p.id===fayeBeforeD.id), "Verleihen: Spieler weg aus dem Kader, kompletter Datensatz im Leih-Eintrag");
  ok(!S().history[fayeBeforeD.id] && loanFD.playerHistory.length===histLenD, "Entwicklungsverlauf wird mit aufbewahrt");
  const rtLD = w.eval("migrateState(JSON.parse(JSON.stringify(state)))");
  ok(rtLD.loans.find(l=>l.name==="Aurelien Faye").player.nation==="Frankreich", "Rucksack übersteht Speichern/Import/Umzug");
  w.eval(`(()=>{ const l = state.loans.find(x=>x.name==="Aurelien Faye"); l.apps = 14; l.playtime = "good"; })()`);
  w.eval(`returnLoan(state.loans.find(x=>x.name==="Aurelien Faye"))`);
  const backD = S().players.find(x=>x.name==="Aurelien Faye");
  ok(backD && backD.id===fayeBeforeD.id, "Zurückgeholt mit derselben ID");
  ok(backD.nation==="Frankreich" && backD.valueMin===12000000 && backD.valueMax===15000000, "Land und Transferwert wieder da (gemeldeter Fehler)");
  ok(backD.birthDate==="1999-08-14" && backD.salary===936000 && backD.contractUntil===2030 && backD.rating===5 && backD.squadRole==="key" && backD.custom.hg===true, "Geburtsdatum, Gehalt, Vertrag, Einschätzung, Kaderrolle, eigenes Feld wieder da");
  ok(backD.note.startsWith("Abwehrchef") && backD.note.includes("Leihe: FC Leihstadt (14 Sp., Spielzeit Gut)"), "Notiz: eigene Notiz + Leih-Infos");
  ok((S().history[backD.id] || []).length >= histLenD && histLenD > 0, "Verlauf wieder beim Spieler");
  d.querySelector("#toastUndoBtn").click();
  ok(S().loans.some(l=>l.name==="Aurelien Faye") && !S().players.some(p=>p.name==="Aurelien Faye"), "Zurückholen ist rückgängig machbar");
  // direct loans (no squad record) still work
  w.eval(`returnLoan(state.loans.find(x=>x.name==="Ben Achterberg"))`);
  const achD = S().players.find(p=>p.name==="Ben Achterberg");
  ok(achD && achD.note.includes("Leihe: SV Hafenstadt"), "Direkt angelegte Leihe (ohne Rucksack): wie bisher als neuer Spieler");
  // --- loan-in targets ---
  ({w,d,errs,S} = await boot());
  const b0D = w.eval("budgetCalc()");
  w.eval(`state.scouting.push({id:"li1", name:"Leih Stürmer", pos:"ST", age:21, grade:"B", status:"negotiating", priority:3, fee:500000, bonus:0, wage:1000000, note:"", kind:"loan", wageShare:40}); state = sanitizeState(state); saveState()`);
  const b1D = w.eval("budgetCalc()");
  ok(b0D.transferLeft - b1D.transferLeft===500000 && b0D.wageLeft - b1D.wageLeft===400000, "Leihziel im Budget: Leihgebühr 500 Tsd. + nur 40 % vom Gehalt (400 Tsd.)");
  w.eval("navigate('recruitment'); state.ui.transferTab='buy'; renderRecruitment()");
  ok(d.querySelector(`#scoutTbody tr[data-id="li1"] .loan-in-tag`), "Scouting-Liste: Leihziel markiert");
  w.eval(`state.scouting.find(t=>t.id==="li1").status = "fixed"; signTarget(state.scouting.find(t=>t.id==="li1"))`);
  ok(d.querySelector("#modal h3").textContent.includes("ausleihen") && d.querySelector('#modal [data-f="contractUntil"]').value==="2027", "Ausleihen-Dialog: Leihe bis Saisonende (2027)");
  d.querySelector("[data-modal-save]").click();
  const liD = S().players.find(p=>p.name==="Leih Stürmer");
  ok(liD && liD.loanIn && liD.salary===400000 && S().transferLog.slice(-1)[0].name==="Leih Stürmer (Leihe)", "Im Kader als Leihspieler (Gehaltsanteil 400 Tsd.), Historie mit '(Leihe)'");
  ok(!w.eval(`isBosman(state.players.find(p=>p.name==="Leih Stürmer"))`) && w.eval(`futureSquadEntries().entries.find(e=>e.name==="Leih Stürmer").kind`)==="loanInEnd", "Kein Bosman für Leihspieler; im Zukunfts-Kader 'geht zurück'");
  w.eval("navigate('squad')");
  ok(d.querySelector(`#squadTbody tr[data-id="${liD.id}"] .loan-in-tag`), "Kadertabelle: 'Leihe'-Kennzeichen");
  // --- deadline day (8.9: part of the Transfer-Center, last 2 days) ---
  ({w,d,errs,S} = await boot());
  ok(!w.eval("deadlineState().active") && d.querySelector("#deadlineBar").hidden, "12.03.: kein Deadline Day");
  w.eval(`state.club.ingameDate = "2027-08-30"; saveState(); navigate("squad")`);
  ok(!w.eval("deadlineState().active"), "30.08. (2 Tage vor Schluss): noch kein Deadline Day");
  w.eval(`state.club.ingameDate = "2027-08-31"; saveState(); navigate("squad")`);
  ok(w.eval("deadlineState().active") && !d.querySelector("#deadlineBar").hidden && d.querySelector("#deadlineBar").textContent.includes("schließt in 1 Tag"), "31.08.: Deadline Day aktiv, Leiste 'schließt in 1 Tag'");
  w.eval(`state.club.ingameDate = "2027-09-01"; state.loans.find(l=>l.name==="Karim Haddad").until = "06/2028"; saveState(); navigate("squad")`);
  d.querySelector('#deadlineBar [data-dd-open]').click();
  ok(d.querySelector("#tr-center.active .dd2") && d.querySelector(".dd2-count").textContent.includes("HEUTE") && !d.querySelector("#tr-deadline"), "Letzter Tag: Leiste öffnet das Transfer-Center im Deadline-Look (kein eigener Reiter mehr)");
  ok(d.querySelector('#transferTabs [data-tab="center"]').classList.contains("dd-hot"), "Transfer-Center-Reiter leuchtet");
  const tickD = d.querySelector("#tr-center .dd-track").textContent;
  ok(tickD.includes("Transferbudget frei") && tickD.includes("Angebot für Felix Arnold") && tickD.includes("fixiert: Rui Almeida") && tickD.includes("Karim Haddad"), "Ticker mit eigenen Daten");
  d.querySelector("#tcFmTime").value = "22:30"; d.querySelector("#tcClockBtn").click();
  ok(/noch 00:(29|30):\d\d/.test(d.querySelector("#tcRemaining").textContent), "Uhr: 22:30 → noch ~30 Min.");
  w.eval("ddClock.realStart -= 31*60000; updateTcClock()");
  ok(d.querySelector("#tcRemaining").textContent.includes("DEADLINE VORBEI"), "Nach Ablauf: 'DEADLINE VORBEI'");
  w.eval("stopDeadlineClock(); navigate('home')");
  ok(w.eval("tcTimer")===null, "Uhr stoppt beim Verlassen der Ansicht");
  w.eval("state.ui.transferTab='center'; navigate('recruitment')");
  // boards with edit & delete
  const boards = d.querySelector("#tr-center .tc-boards");
  ok(boards && boards.textContent.includes("Panic-Buy-Board") && boards.textContent.includes("Last-Minute-Leihen") && boards.querySelectorAll(".dd-card").length>=5, "Deadline-Phase: Panic-Buy-Board und Last-Minute-Leihen im Center");
  ok(boards.querySelector(".dd-card.no-money") && boards.querySelector('[data-tc^="edit:"]') && boards.querySelector('[data-tc^="del:"]'), "Budget-Prüfung + Bearbeiten/Löschen auf jeder Karte");
  const ferrD = S().scouting.find(t=>t.name==="Léo Ferreira");
  boards.querySelector(`[data-tc="inNext:${ferrD.id}"]`).click();
  ok(S().scouting.find(t=>t.id===ferrD.id).status==="fixed", "Board: 'Fixieren' mit einem Klick");
  d.querySelector(`#tr-center .tc-boards [data-tc="edit:${ferrD.id}"]`).click();
  ok(d.querySelector("#modal h3").textContent.includes("bearbeiten") && d.querySelector('#modal [data-f="name"]').value==="Léo Ferreira", "✎ öffnet den Bearbeiten-Dialog");
  d.querySelector('#modal [data-f="fee"]').value = "9 Mio"; d.querySelector('#modal [data-f="pos"]').value = "OM"; d.querySelector("[data-modal-save]").click();
  ok(S().scouting.find(t=>t.id===ferrD.id).fee===9000000 && S().scouting.find(t=>t.id===ferrD.id).pos==="OM", "Bearbeitet: Ablöse 9 Mio., Position OM");
  d.querySelector("#toastUndoBtn").click();
  ok(S().scouting.find(t=>t.id===ferrD.id).fee!==9000000, "Bearbeiten ist rückgängig machbar");
  const okaD = S().scouting.find(t=>t.name==="Daniel Okafor");
  d.querySelector(`#tr-center .tc-boards [data-tc="del:${okaD.id}"]`).click();
  ok(!S().scouting.some(t=>t.id===okaD.id), "✕ löscht das Ziel");
  d.querySelector("#toastUndoBtn").click();
  ok(S().scouting.some(t=>t.id===okaD.id), "Löschen ist rückgängig machbar");
  d.querySelector(`#tr-center .tc-board [data-tc="edit:${okaD.id}"]`).click();
  ok(d.querySelector("#modal h3").textContent.includes("bearbeiten"), "Auch in der Deal-Pipeline: ✎ Bearbeiten");
  d.querySelector("#modal [data-target-del]").click();
  ok(!S().scouting.some(t=>t.id===okaD.id), "Im Dialog: 'Löschen'");
  // quick calculator incl. "als Ziel anlegen"
  const calcD = (k,v) => { const el = d.querySelector(`#tr-center [data-tcc="${k}"]`); el.value = v; el.dispatchEvent(new w.Event("input",{bubbles:true})); };
  calcD("fee","50 Mio");
  ok(d.querySelector("#tcCalcRes").textContent.includes("zu teuer"), "Schnell-Rechner: 50 Mio. → zu teuer");
  calcD("name","Notnagel"); d.querySelector('#tr-center [data-tc="calcSave:"]').click();
  ok(S().scouting.some(t=>t.name==="Notnagel" && t.status==="negotiating" && t.fee===50000000), "Rechner-Deal als Transferziel angelegt");
  // emergency sale + loan cancellation
  const okonD = S().sales.find(x=>(S().players.find(p=>p.id===x.playerId)||{}).name==="Jamal Okonkwo");
  d.querySelector(`#tr-center [data-tc="outNext:${okonD.id}"]`).click(); d.querySelector(`#tr-center [data-tc="outNext:${okonD.id}"]`).click();
  ok(S().sales.find(x=>x.id===okonD.id).status==="agreed" && d.querySelector(`#tr-center [data-tc="complete:${okonD.id}"]`), "Notverkauf: bis 'Einigung', dann 'Abschluss'");
  const hadD = S().loans.find(l=>l.name==="Karim Haddad");
  d.querySelector(`#tr-center [data-tc="recall:${hadD.id}"]`).click();
  ok(S().players.some(p=>p.name==="Karim Haddad"), "Leih-Abbruch im Last-Minute-Panel");
  // modes via the ⋯ menu
  d.querySelector('#tr-center [data-tcmode="off"]').click();
  ok(!w.eval("deadlineState().active") && !d.querySelector("#tr-center .dd2"), "Modus 'Aus': normales Center, keine Deadline-Leiste");
  d.querySelector('#tr-center [data-tcmode="on"]').click();
  w.eval(`state.club.ingameDate = "2027-03-12"; saveState(); navigate("squad")`);
  ok(w.eval("deadlineState().active") && !d.querySelector("#deadlineBar").hidden && d.querySelector("#deadlineBar").textContent.includes("manuell"), "Modus 'An': auch außerhalb des Fensters aktiv");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[47] Transfer-Center & Admin-Design (seit 8.9 live)");
  ({w,d,errs,S} = await boot());
  const dupIdsL = () => { const ids = [...d.querySelectorAll("[id]")].map(e=>e.id); return ids.filter((x,i)=>ids.indexOf(x)!==i); };
  d.querySelector('.nav-btn[data-view="recruitment"]').click();
  ok(!d.querySelector('#transferTabs [data-tab="center"]').hidden && d.querySelector("#tr-center.active .tc-hero") && !d.querySelector('#transferTabs [data-tab="deadline"]'), "Live: Transfers startet mit dem Transfer-Center, kein eigener Deadline-Reiter mehr");
  ok(!d.querySelector('#transferTabs [data-tab="center"]').textContent.includes("Beta"), "Kein Beta-Kennzeichen mehr");
  ok(dupIdsL().length===0 && d.querySelector("#tr-plan").innerHTML==="" , "Keine doppelten Element-IDs (Fenster-Plan wird geleert, solange das Center offen ist)");
  const heroL = d.querySelector("#tr-center .tc-hero");
  ok(heroL.classList.contains("tc-summer") && heroL.textContent.includes("Sommerfenster 2027") && heroL.textContent.includes("Vorbereitung") && d.querySelector(".tc-big").textContent.includes("111"), "12.03.: Sommer-Thema, Phase Vorbereitung, 111 Tage bis zum Start");
  ok(d.querySelector(".tc-step.now").textContent.includes("Vorbereitung"), "Zeitstrahl: 'Vorbereitung' ist aktiv");
  // pipeline
  const laneL = (i, col) => d.querySelectorAll("#tr-center .tc-board")[i].querySelectorAll(".tc-col")[col];
  const nWatchedL = laneL(0,0).querySelectorAll(".tc-deal").length;
  ok(nWatchedL===3 && laneL(0,1).querySelectorAll(".tc-deal").length===1 && laneL(0,2).querySelectorAll(".tc-deal").length===1, "Zugänge: 3 beobachtet · 1 Verhandlung · 1 fixiert");
  ok(laneL(1,0).textContent.includes("Jamal Okonkwo") && laneL(1,1).textContent.includes("Felix Arnold"), "Abgänge: Okonkwo gelistet, Arnold mit Angebot");
  const krL = S().scouting.find(t=>t.name==="Stefan Krantz");
  d.querySelector(`#tr-center [data-tc="inNext:${krL.id}"]`).click();
  ok(S().scouting.find(t=>t.id===krL.id).status==="negotiating" && laneL(0,1).textContent.includes("Stefan Krantz"), "▶ Krantz: Beobachtet → Verhandlung");
  ok(d.querySelector(`#tr-center .tc-deal.nofit`) , "Budget-Ampel: zu teure Deals rot markiert");
  d.querySelector(`#tr-center [data-tc="inPrev:${krL.id}"]`).click();
  ok(S().scouting.find(t=>t.id===krL.id).status==="watched", "◀ zurück auf Beobachtet");
  const ok2L = S().sales.find(x=>(S().players.find(p=>p.id===x.playerId)||{}).name==="Jamal Okonkwo");
  d.querySelector(`#tr-center [data-tc="outNext:${ok2L.id}"]`).click(); d.querySelector(`#tr-center [data-tc="outNext:${ok2L.id}"]`).click();
  ok(S().sales.find(x=>x.id===ok2L.id).status==="agreed" && d.querySelector(`#tr-center [data-tc="complete:${ok2L.id}"]`), "Okonkwo: Gelistet → Angebot → Einigung, dann '✓ Abschluss'");
  d.querySelector(`#tr-center [data-tc="complete:${ok2L.id}"]`).click();
  ok(d.querySelector("#modal").textContent.includes("Verkauf abschließen"), "Abschluss öffnet den gewohnten Bestätigungsdialog (Ablöse, Verein)");
  d.querySelector("[data-modal-save]").click();
  ok(!S().players.some(p=>p.name==="Jamal Okonkwo") && laneL(1,3).textContent.includes("Jamal Okonkwo"), "Abschluss: Okonkwo verkauft, in 'Verkauft'");
  const almL = S().scouting.find(t=>t.name==="Rui Almeida");
  d.querySelector(`#tr-center [data-tc="sign:${almL.id}"]`).click(); d.querySelector("[data-modal-save]").click();
  ok(S().players.some(p=>p.name==="Rui Almeida") && laneL(0,3).textContent.includes("Rui Almeida"), "Fixiert → '✓ Unterschrift' → in 'Unterschrieben'");
  // filter + side panel
  d.querySelector('#tr-center [data-tc="pos:ST"]').click();
  ok([...d.querySelectorAll("#tr-center .tc-board .tc-deal .tc-pos")].every(x=>x.textContent==="ST") && d.querySelector("#tr-center .tc-main h2").textContent.includes("ST"), "Positions-Chip filtert die Pipeline (nur ST)");
  d.querySelector('#tr-center [data-tc="pos:"]').click();
  const achLL = S().loans.find(l=>l.name==="Ben Achterberg");
  const rselL = d.querySelector(`#tr-center [data-tc-return="${achLL.id}"]`); rselL.value = "keep"; rselL.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().loans.find(l=>l.id===achLL.id).returnPlan==="keep", "Leih-Rückkehrer im Seitenpanel entschieden");
  // tasks
  const tasksBoxL = d.querySelector("#tr-center .tc-tasks");
  ok(tasksBoxL && tasksBoxL.querySelectorAll(".tc-task").length===5 && tasksBoxL.textContent.includes("weitere Aufgaben"), "Aufgaben: die ersten 5 + 'weitere'");
  d.querySelector('#tr-center [data-tc="tasks:toggle"]').click();
  ok(d.querySelectorAll("#tr-center .tc-task").length > 5, "Alle Aufgaben aufklappbar");
  // calculator
  const cfeeL = d.querySelector('#tr-center [data-tcc="fee"]'); cfeeL.value = "80 Mio"; cfeeL.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(d.querySelector("#tcCalcRes").textContent.includes("zu teuer"), "Schnell-Rechner im Cockpit: 80 Mio. → zu teuer");
  // winter + deadline phase
  d.querySelector('#tr-center [data-tcwin="winter"]').click();
  ok(d.querySelector("#tr-center .tc-hero").classList.contains("tc-winter") && d.querySelector("#tr-center").textContent.includes("Bosman-Radar"), "Winter: eisblaues Thema, Bosman-Radar");
  d.querySelector('#tr-center [data-tcwin="auto"]').click();
  w.eval(`state.club.ingameDate = "2027-09-01"; saveState(); renderRecruitment()`);
  const heroDDL = d.querySelector("#tr-center .tc-hero");
  ok(heroDDL.classList.contains("tc-dd") && heroDDL.textContent.includes("Deadline Day") && d.querySelector(".dd2-count").textContent.includes("HEUTE") && heroDDL.querySelector(".dd-ticker"), "01.09.: Deadline-Phase im selben Center – gelb-schwarzer Kopf, großes HEUTE, Ticker");
  ok(d.querySelector(".dd2-phases .now").textContent.includes("Deadline Day") && d.querySelector("#tr-center .tc-side.dd"), "Phasenleiste auf 'Deadline Day', Last-Minute-Panel");
  d.querySelector("#tcFmTime").value = "22:00"; d.querySelector("#tcClockBtn").click();
  ok(/noch 00:59:\d\d|noch 01:00:00/.test(d.querySelector("#tcRemaining").textContent), "Uhr im Center: 22:00 → noch ~1 Std.");
  w.eval("stopDeadlineClock()");
  ok(w.eval("tcTimer")===null, "Uhr stoppt sauber");
  ok(dupIdsL().length===0, "Auch in der Deadline-Phase keine doppelten IDs");
  // classic tabs still work side by side
  // admin design
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'overview'; navigate('admin')");
  ok(d.querySelector(".adm2 nav#adminTabs") && d.querySelectorAll(".adm2-group").length===2 && d.querySelectorAll('#adminTabs [data-atab]').length===16 && !d.querySelector('#adminTabs [data-atab="labs"]'), "Admin-Zentrale (11.7): Seitennavigation, 2 Gruppen (Allgemein / Spielstand), 16 Bereiche (Labor nach der 10.1-Beta wieder entfernt)");
  ok(d.querySelector(".adm2-version").textContent.includes("v"+w.eval("APP_VERSION")) && d.querySelector(".adm2-version").textContent.includes("Datenschema"), "Übersicht nennt Dashboard-Version und Datenschema");
  d.querySelector('#adminTabs [data-atab="overview"]').click();
  const scoreL = parseInt(d.querySelector(".adm2-score-num strong").textContent, 10);
  ok(scoreL >= 0 && scoreL <= 100 && d.querySelector(".adm2-hero-text").textContent.includes("Backup") && d.querySelectorAll(".adm2-bar").length===14, `Neue Übersicht: Gesundheitswert ${scoreL}, Gründe, 14-Tage-Aktivität`);
  w.eval(`(()=>{ const sl = currentSlots(); for(let i=1;i<6;i++) sl[i].playerId = sl[0].playerId; })()`);   // many errors of one kind
  ok(w.eval("adminHealthScore().score") >= 100-45-20-10-5-10, "Abzüge je Kategorie begrenzt – viele gleiche Fehler drücken den Wert nicht auf 0");
  w.eval("state = sanitizeState(JSON.parse(JSON.stringify(state))); saveState()");
  const h1L = w.eval("adminHealthScore()");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  d.querySelector('[data-adm2="backup"]').click();
  ok(w.eval("adminHealthScore().score") >= h1L.score && d.querySelector("#adminBody .adm2-score"), "Schnellaktion 'Backup' hebt den Wert (kein Backup-Abzug mehr)");
  d.querySelector('#adminTabs [data-atab="log"]').click();
  ok(d.querySelector(".adm2-head h2").textContent.includes("Protokoll") && d.querySelector("#logListBox"), "Andere Bereiche laufen unverändert in der neuen Hülle");
  // switch everything off again
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[48] Version 8.5.1: Rohdaten 2.0, Deadline-Kopf, Transferfenster im Portal");
  ({w,d,errs,S} = await boot());
  // a custom squad role like in the screenshot (key "c_…")
  w.eval(`(()=>{ state.lists.keyed.squadRoles.push({key:"c_y7ym7506", label:"Leistungsträger", base:"key"}); state.players[0].squadRole = "c_y7ym7506";
    state.players[1].altPos = ["DM","ZM"]; state.players[1].extendPlanned = true;
    state.customFields.push({id:"hg", name:"Homegrown", type:"bool", options:[], areas:["squad"]}); state.players[2].custom = {hg:true};
    state = sanitizeState(state); saveState(); setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'raw'; navigate('admin'); })()`);
  const headR = [...d.querySelectorAll("#adminBody .raw2 thead th")].map(th=>th.textContent.trim());
  ok(headR.includes("Name") && headR.includes("Vertrag bis") && headR.includes("Transferwert bis") && !headR.includes("contractUntil") && !headR.includes("id"), "Deutsche Spaltennamen, keine interne ID");
  const p0R = S().players[0], rowR = id => d.querySelector(`#adminBody tr[data-raw-id="${id}"]`);
  const roleSel = rowR(p0R.id).querySelector('[data-raw-key="squadRole"]');
  ok(roleSel.tagName==="SELECT" && roleSel.selectedOptions[0].textContent==="Leistungsträger" && !rowR(p0R.id).textContent.includes("c_y7ym7506"), "Kaderrolle zeigt 'Leistungsträger' statt 'c_y7ym7506'");
  ok(rowR(S().players[1].id).querySelector('[data-raw-key="altPos"]').value==="DM, ZM" && rowR(S().players[3].id).querySelector('[data-raw-key="altPos"]').value==="", "Nebenpositionen als 'DM, ZM' bzw. leer – kein '[]' mehr");
  ok(rowR(S().players[1].id).querySelector('[data-raw-key="extendPlanned"]').type==="checkbox" && rowR(S().players[1].id).querySelector('[data-raw-key="extendPlanned"]').checked, "Ja/Nein als Häkchen statt 'true/false'");
  ok(rowR(p0R.id).querySelector('[data-raw-key="salary"]').value===w.eval(`fmtNum(${p0R.salary})`) && rowR(p0R.id).querySelector('[data-raw-key="birthDate"]').type==="date", "Beträge mit Tausenderpunkt, Datum mit Datumsauswahl");
  ok(rowR(S().players[2].id).querySelector('[data-raw-key="cf:hg"]').checked && headR.includes("✦ Homegrown"), "Eigene Felder als eigene Spalten");
  ok(rowR(p0R.id).querySelector('td.raw-first [data-raw-key="name"]') && d.querySelector("#adminBody .raw2 thead th.raw-first"), "Namensspalte fest (sticky) beim seitlichen Scrollen");
  // edits
  const salR = rowR(p0R.id).querySelector('[data-raw-key="salary"]'); salR.value = "3,2 Mio"; salR.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].salary===3200000 && rowR(p0R.id).querySelector('[data-raw-key="salary"]').value===w.eval("fmtNum(3200000)"), "Betrag '3,2 Mio' → 3.200.000, formatiert angezeigt");
  const rs2 = rowR(p0R.id).querySelector('[data-raw-key="squadRole"]'); rs2.value = "rotation"; rs2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[0].squadRole==="rotation", "Kaderrolle per Auswahl geändert");
  const ex2 = rowR(S().players[1].id).querySelector('[data-raw-key="extendPlanned"]'); ex2.checked = false; ex2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players[1].extendPlanned===false, "Häkchen gespeichert");
  const ap2 = rowR(S().players[1].id).querySelector('[data-raw-key="altPos"]'); ap2.value = "iv; xx rv"; ap2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(JSON.stringify(S().players[1].altPos)==='["IV","RV"]', "Nebenpositionen: 'iv; xx rv' → IV, RV (Ungültiges verworfen)");
  const ag2 = rowR(p0R.id).querySelector('[data-raw-key="age"]'); ag2.value = "zwanzig"; ag2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector("#toastMsg").textContent.includes("Zahl") && S().players[0].age===p0R.age, "Keine Zahl im Zahlenfeld → Hinweis, Wert bleibt");
  const hg2 = rowR(S().players[2].id).querySelector('[data-raw-key="cf:hg"]'); hg2.checked = false; hg2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!S().players[2].custom.hg, "Eigenes Feld im Rohdaten-Editor bearbeitet");
  // search
  const srR = d.querySelector("#rawSearch"); srR.value = "leistungs"; srR.dispatchEvent(new w.Event("input",{bubbles:true}));
  srR.value = "Lindqvist"; d.querySelector("#rawSearch").value = "Lindqvist"; d.querySelector("#rawSearch").dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(d.querySelectorAll("#adminBody .raw2 tbody tr").length===1 && d.querySelector("#adminBody .raw-toolbar").textContent.includes("1 von 20") && d.activeElement.id==="rawSearch", "Suche: 1 von 20 Einträgen, Cursor bleibt im Suchfeld");
  // other collections
  const rc2 = d.querySelector("#rawColl"); rc2.value = "loans"; rc2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok([...d.querySelectorAll("#adminBody .raw2 thead th")].some(th=>th.textContent==="Spielzeit") && d.querySelector('#adminBody [data-raw-key="playtime"]').tagName==="SELECT" && d.querySelector("#rawSearch").value==="", "Leihen: Spielzeit als Auswahl, Suche zurückgesetzt");
  const rc3 = d.querySelector("#rawColl"); rc3.value = "sales"; rc3.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector('#adminBody [data-raw-key="playerId"]').selectedOptions[0].textContent==="Felix Arnold", "Verkäufe: Spieler mit Namen statt ID");
  const rc4 = d.querySelector("#rawColl"); rc4.value = "club"; rc4.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector("#adminBody .raw-form th").textContent==="Vereinsname" && d.querySelector('#adminBody [data-raw-key="accent"]').type==="color" && d.querySelector('#adminBody [data-raw-key="wageUnit"]').selectedOptions[0].textContent==="pro Jahr", "Verein als Formular: Vereinsname, Farbwähler, lesbare Auswahlen");
  const tbR = d.querySelector('#adminBody [data-raw-key="transferBudget"]'); tbR.value = "45 Mio"; tbR.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().club.transferBudget===45000000, "Transferbudget '45 Mio' gespeichert");
  // technical view
  const rc5 = d.querySelector("#rawColl"); rc5.value = "players"; rc5.dispatchEvent(new w.Event("change",{bubbles:true}));
  const tg = d.querySelector("#rawTechToggle"); tg.checked = true; tg.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok([...d.querySelectorAll("#adminBody .raw-table thead th")].some(th=>th.textContent==="contractUntil") && !d.querySelector("#adminBody .raw2"), "Technische Ansicht: interne Namen und Rohwerte wie bisher");
  const tg2 = d.querySelector("#rawTechToggle"); tg2.checked = false; tg2.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelector("#adminBody .raw2"), "… und zurück zur neuen Ansicht");
  // --- deadline head ---
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_layout", JSON.stringify({beta:{transfer:true}}))));
  w.eval(`state.club.ingameDate = "2027-09-01"; state.club.wageBudget = 5000000; saveState(); state.ui.transferTab = "center"; navigate("recruitment"); renderRecruitment()`);
  const heroN = d.querySelector("#tr-center .dd2");
  ok(heroN && heroN.querySelector(".dd2-count .dd2-big").textContent==="HEUTE" && heroN.querySelector(".dd2-left h2").textContent.includes("Sommerfenster 2027"), "Neuer Deadline-Kopf: Fenster links, großes HEUTE in der Mitte");
  const tilesN = [...heroN.querySelectorAll(".dd2-tile")];
  ok(tilesN.length===2 && tilesN[1].classList.contains("neg") && tilesN[1].textContent.includes("über Budget") && !tilesN[0].classList.contains("neg"), "Budget-Kacheln rechts: Gehalt im Minus deutlich markiert");
  ok(heroN.querySelector(".dd2-menu [data-tcwin]") && heroN.querySelector(".dd2-menu [data-tcmode]") && heroN.querySelector(".dd2-menu #tcDeadline") && !heroN.querySelector(".dd2-top [data-tcwin]"), "Umschalter und Deadline-Zeit im '⋯'-Menü statt gestapelt");
  ok(heroN.querySelector(".dd2-phases .now").textContent==="Deadline Day", "Schmale Phasenleiste");
  d.querySelector("#tcFmTime").value = "20:00"; d.querySelector("#tcClockBtn").click();
  ok(d.querySelector(".dd2-count .dd-digits") && /02:59:\d\d|03:00:00/.test(d.querySelector(".dd2-count").textContent) && !d.querySelector(".dd2-count").textContent.includes("HEUTE"), "Uhr gestartet: großer Countdown ersetzt 'HEUTE'");
  w.eval("stopDeadlineClock()");
  const cssN = require("fs").readFileSync(DIR+"style.css","utf8");
  ok(/#transferTabs \[data-tab="center"\]\.dd-hot\{animation:none/.test(cssN) && cssN.includes("dd-pulse"), "Transfer-Center-Reiter am Deadline Day: keine Hüpf-Animation mehr, stattdessen pulsierender Punkt");
  // --- portal card (8.9: only while a window is open; Deadline look in the last 2 days) ---
  ({w,d,errs,S} = await boot());
  const hw = d.querySelector("#homeWindowCard");
  ok(hw.hidden, "12.03. (Fenster zu): keine Transferfenster-Karte im Portal");
  w.eval(`state.club.ingameDate = "2027-07-15"; saveState(); navigate("home")`);
  ok(!hw.hidden && hw.classList.contains("hw-summer") && d.querySelector("#hwTitle").textContent.includes("Sommerfenster 2027") && !d.querySelector("#hwTitle").textContent.includes("Beta"), "15.07. (Fenster offen): Sommer-Karte, ohne Beta-Kennzeichen");
  ok(hw.querySelector(".hw-count strong").textContent==="48" && hw.querySelector(".hw-phases .now").textContent==="Fenster offen", "48 Tage bis zur Deadline, Phase 'Fenster offen'");
  ok(hw.querySelectorAll(".hw-stats > div").length===4 && hw.querySelectorAll(".hw-task").length===3, "Deals, Budget und die 3 wichtigsten Aufgaben");
  w.eval(`state.ui.hubWindow = "winter"; saveState(); navigate("home")`);
  ok(hw.classList.contains("hw-summer"), "Manuelle Fenster-Wahl im Center ändert die Portal-Karte nicht (zeigt das echte, offene Fenster)");
  w.eval(`state.ui.hubWindow = "auto"; saveState()`);
  d.querySelector("#hwOpen").click();
  ok(d.querySelector("#view-recruitment.active") && d.querySelector("#tr-center.active .tc-hero"), "'Transfer-Center →' öffnet das Center");
  w.eval(`state.club.ingameDate = "2027-08-30"; saveState(); navigate("home")`);
  ok(!hw.hidden && !hw.classList.contains("hw-dd"), "30.08. (2 Tage vor Schluss): noch kein Deadline-Look");
  w.eval(`state.club.ingameDate = "2027-08-31"; saveState(); navigate("home")`);
  ok(hw.classList.contains("hw-dd") && hw.querySelector(".hw-kicker").textContent.includes("Deadline Day") && hw.querySelector(".hw-count strong").textContent==="1", "31.08. (1 Tag vor Schluss): Deadline-Look");
  ok(d.querySelector("#deadlineBar").hidden, "Auf dem Portal keine doppelte gelbe Leiste – die Karte zeigt es schon");
  w.eval(`navigate("squad")`);
  ok(!d.querySelector("#deadlineBar").hidden, "In anderen Ansichten erscheint die gelbe Leiste weiterhin");
  w.eval(`state.club.ingameDate = "2028-01-15"; saveState(); navigate("home")`);
  ok(!hw.hidden && hw.classList.contains("hw-winter") && d.querySelector("#hwTitle").textContent.includes("Winterfenster 2028"), "15.01.2028: Winter-Karte");
  w.eval(`state.club.ingameDate = "2027-09-02"; saveState(); navigate("home")`);
  ok(hw.hidden, "Nach Fensterschluss: Karte wieder weg");
  w.eval(`state.club.windows = {summer:"", winter:""}; state.club.ingameDate = "2027-07-15"; saveState(); navigate("home")`);
  ok(hw.hidden, "Ohne hinterlegte Fenster: keine Karte");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[49] Versionen 8.6–8.9: Bugfixes, Performance, Speicher, Live");
  ({w,d,errs,S} = await boot());
  // 8.6 – the reported bug: loan → return → FM import with an empty value cell
  w.eval(`(()=>{ const p = state.players.find(x=>x.name==="Aurelien Faye"); p.valueMin = 12000000; p.valueMax = 15000000; p.nation = "Frankreich"; saveState(); })()`);
  const fid9 = S().players.find(x=>x.name==="Aurelien Faye").id;
  d.querySelector('.nav-btn[data-view="squad"]').click();
  d.querySelector(`#squadTbody tr[data-id="${fid9}"] [data-loan]`).click(); d.querySelector('#modal [data-f="club"]').value = "FC Leih"; d.querySelector("[data-modal-save]").click();
  w.eval(`returnLoan(state.loans.find(l=>l.name==="Aurelien Faye"))`);
  ok(S().players.find(x=>x.name==="Aurelien Faye").valueMax===15000000, "Leihrückkehr: Transferwert zurück");
  for(const cell of ["", "-", "Unverkäuflich", "N/A"]){
    const csv9 = `Name;Transferwert;Land\nAurelien Faye;${cell};Frankreich`;
    const dif9 = w.eval(`(()=>{ const rows = parseTable(${JSON.stringify(csv9)}); return diffImport(buildImportRecords(rows.slice(1), guessMapping(rows[0]), "year").recs); })()`);
    ok(dif9.unchanged.length===1 && dif9.changed.length===0, `FM-Import mit Wert-Zelle „${cell}“: Transferwert bleibt (keine Änderung)`);
  }
  const dif9b = w.eval(`(()=>{ const rows = parseTable("Name;Transferwert\\nAurelien Faye;20Mio. €"); return diffImport(buildImportRecords(rows.slice(1), guessMapping(rows[0]), "year").recs); })()`);
  ok(dif9b.changed.length===1 && dif9b.changed[0].changes.some(c=>c.field==="valueMax" && c.to===20000000), "Ein echter neuer Wert wird weiterhin übernommen");
  // 8.6 – changelog
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'changelog'; navigate('admin')");
  const cl9 = [...d.querySelectorAll("#adminBody .cl-entry")];
  ok(cl9[0].open && cl9.slice(1).every(e=>!e.open), "Changelog: nur die neueste Version aufgeklappt");
  const beta9 = cl9.filter(e=>e.querySelector(".beta-pill")).map(e=>e.querySelector(".cl-ver").textContent);
  ok(JSON.stringify(beta9.filter(v=>v.startsWith("v8")))==='["v8.5.1","v8.5"]' && beta9.includes("v10.1"), "Beta-Kennzeichen bei 8.5, 8.5.1 (und der 10.1-Beta)");
  ok(w.eval("CHANGELOG.map(r=>r.v).join()").includes("8.9,8.8,8.7,8.6") && w.eval("CHANGELOG[0].v")===w.eval("APP_VERSION"), "Einträge 8.6–8.9 vorhanden, neueste Version oben");
  // 8.9 – loaned players greyed in the squad
  ({w,d,errs,S} = await boot());
  w.eval(`(()=>{ const p = state.players.find(x=>x.name==="Aurelien Faye"); p.valueMin = 12000000; p.valueMax = 15000000; p.nation = "Frankreich"; saveState(); navigate("squad"); })()`);
  const fid9b = S().players.find(x=>x.name==="Aurelien Faye").id;
  d.querySelector(`#squadTbody tr[data-id="${fid9b}"] [data-loan]`).click(); d.querySelector('#modal [data-f="club"]').value = "FC Leih"; d.querySelector('#modal [data-f="until"]').value = "06/2028"; d.querySelector("[data-modal-save]").click();
  const lr9 = [...d.querySelectorAll("#squadTbody tr.loaned-row")];
  ok(lr9.length===3 && lr9.map(r=>r.textContent).join().includes("Aurelien Faye"), "Verliehene Spieler stehen weiter im Kader (3 inkl. Beispiel-Leihen)");
  const fr9 = lr9.find(r=>r.textContent.includes("Aurelien Faye"));
  ok(fr9.textContent.includes("FC Leih") && fr9.textContent.includes("Frankreich") && fr9.textContent.includes("€12 – 15 Mio.") && fr9.textContent.includes("Verliehen"), "Ausgegraute Zeile zeigt Leihclub, Land, Transferwert, Status 'Verliehen'");
  ok(!fr9.querySelector("input, select") && !fr9.querySelector("[data-sel]"), "Nur zur Übersicht: keine Eingabefelder, nicht auswählbar");
  { const rowsP = [...d.querySelectorAll("#squadTbody tr")], posOf = r => { const sel = r.querySelector('[data-field="pos"]'); return sel ? sel.value : r.querySelector('[data-col="pos"]').textContent.trim(); };
    const posSeq = rowsP.map(posOf), fayeRow = rowsP.findIndex(r=>r.textContent.includes("Aurelien Faye"));
    ok(posOf(rowsP[fayeRow])==="IV" && JSON.stringify(posSeq)===JSON.stringify(posSeq.slice().sort((a,b)=>w.eval("POS_LIST").indexOf(a)-w.eval("POS_LIST").indexOf(b))) && fayeRow < rowsP.length-3,
      "9.1: Verliehene stehen an ihrem Platz – Faye (IV) zwischen den Innenverteidigern, Reihenfolge nach Position durchgehend"); }
  ok(w.eval("renderSquadDepth.toString()").length > 0 && !d.querySelector("#squadDepth").textContent.includes("FC Leih"), "Kadertiefe zählt Verliehene nicht mit");
  const rf9 = d.querySelector("#squadRoleFilter"); rf9.value = "key"; rf9.dispatchEvent(new w.Event("change"));
  ok(!d.querySelector("#squadTbody tr.loaned-row"), "Mit Rollen-Filter: Verliehene ausgeblendet");
  w.eval("resetSquadFilters()");
  const sw9 = d.querySelector("#squadShowLoaned"); sw9.checked = false; sw9.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!d.querySelector("#squadTbody tr.loaned-row") && S().ui.showLoaned===false, "'Verliehene zeigen' ausschalten blendet sie aus (gespeichert)");
  const sw9b = d.querySelector("#squadShowLoaned"); sw9b.checked = true; sw9b.dispatchEvent(new w.Event("change",{bubbles:true}));
  const lid9 = S().loans.find(l=>l.name==="Aurelien Faye").id;
  d.querySelector(`#squadTbody [data-return-loan="${lid9}"]`).click();
  ok(S().players.some(p=>p.name==="Aurelien Faye" && p.valueMax===15000000) && !d.querySelector(`#squadTbody [data-return-loan="${lid9}"]`), "'↙ Zurückholen' direkt aus dem Kader");
  // 8.7 – only the visible view is redrawn
  w.eval("navigate('home')");
  d.querySelector("#squadTbody").setAttribute("data-marker", "alt");
  w.eval("state.players[0].note = 'x'; saveState(); renderAll()");
  ok(d.querySelector("#squadTbody").getAttribute("data-marker")==="alt", "Änderung auf dem Portal: Kadertabelle wird nicht unnötig neu gebaut");
  w.eval("navigate('squad')");
  ok(d.querySelector(`#squadTbody tr[data-id="${S().players[0].id}"] [data-field="note"]`).value==="x", "Beim Öffnen ist der Kader trotzdem aktuell");
  const calls9 = w.eval(`(()=>{ let n = 0; const orig = computeFutureSquadEntries; computeFutureSquadEntries = function(){ n++; return orig.apply(this, arguments); };
    state.ui.transferTab = "center"; state.club.ingameDate = "2027-09-01"; navigate("recruitment"); renderTransferCenter(); computeFutureSquadEntries = orig; return n; })()`);
  ok(calls9 <= 2, `Transfer-Center berechnet den Zukunfts-Kader nur einmal pro Zeichnen (hier ${calls9}× für 2 Zeichnungen)`);
  // 8.8 – storage housekeeping
  ({w,d,errs,S} = await boot(ls=>{ ls.setItem("fm27_log_geloescht", JSON.stringify([{x:1}])); ls.setItem("fm27_rp_geloescht", "[]"); ls.setItem("fm27_dashboard_state_v1", JSON.stringify({version:2, players:[]})); ls.setItem("fm27_irgendwas", "1"); ls.setItem("fm27_seen_version", js.match(/APP_VERSION = "([^"]+)"/)[1]); }));
  ok(w.localStorage.getItem("fm27_log_geloescht")===null && w.localStorage.getItem("fm27_rp_geloescht")!==null && w.localStorage.getItem("fm27_dashboard_state_v1")!==null, "Start: Protokoll gelöschter Spielstände automatisch entfernt – Wiederherstellungspunkte und alter v1/v2-Stand bleiben");
  ok(JSON.parse(w.localStorage.getItem("fm27_storage_clean")).count===1, "Bereinigung wird vermerkt");
  await new Promise(r=>setTimeout(r,3200));
  ok(d.querySelector("#toastMsg").textContent.includes("Speicher aufgeräumt"), "Kurzer Hinweis: "+d.querySelector("#toastMsg").textContent);
  const kinds9 = Object.fromEntries(w.eval("storageEntries()").map(e=>[e.key, e.kind]));
  ok(kinds9["fm27_rp_geloescht"]==="orphanRp" && kinds9["fm27_dashboard_state_v1"]==="legacy" && kinds9["fm27_irgendwas"]==="unknown" && kinds9["fm27_layout"]!=="unknown", "Klassifizierung: verwaiste Punkte, alter Stand, unbekannt – bekannte Einstellungen nicht");
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'storage'; navigate('admin')");
  const chk9 = w.eval("findOrphans()").find(c=>c.key==="storageCheck");
  ok(chk9 && !chk9.safe && chk9.items.length===3, "Wartung: 3 Einträge unter 'Speicher: bitte prüfen' (nicht vorausgewählt)");
  ok(d.querySelector("#adminBody .mem-list .mem-row") && d.querySelector("#adminBody").textContent.includes("Speicherbelegung"), "Wartung: Speicherbelegung mit den größten Einträgen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[50] Version 9.0: Journey");
  ({w,d,errs,S} = await boot());
  // 9.9.1: the journey lives inside the active save
  const JJ = () => { const idx = JSON.parse(w.localStorage.getItem("fm27_slots_index")); return (JSON.parse(w.localStorage.getItem("fm27_slot_" + idx.active)) || {}).journey; };
  const fillJJ = (f, v) => { const el = d.querySelector(`#modal [data-f="${f}"]`); if(el.type === "checkbox") el.checked = v; else el.value = v; };
  d.querySelector('.nav-btn[data-view="journey"]').click();
  ok(d.querySelector("#view-journey.active") && !d.querySelector("#journeyStart").hidden && d.querySelector("#journeyGrid").hidden, "Neuer Bereich Journey: zuerst 'Journey starten'");
  w.eval("navigate('home')"); w.document.dispatchEvent(new w.KeyboardEvent("keydown",{key:"9"}));
  ok(d.querySelector("#view-journey.active"), "Taste 9 öffnet die Journey");
  d.querySelector('#journeyStart [data-j="begin"]').click();
  fillJJ("name","Max Mustermann"); fillJJ("age","38"); fillJJ("start","amateur"); fillJJ("giro","20.000"); fillJJ("savings","5000");
  d.querySelector("[data-modal-save]").click();
  ok(JJ().active && JJ().profile.name==="Max Mustermann" && JJ().profile.licenseIdx===1 && JJ().startDate==="2027-03-12" && JJ().bank.giro===20000 && JJ().bank.savings===5000, "Gestartet: Profil, Amateur-Lizenz, Startdatum, Startkapital");
  ok(!d.querySelector("#journeyGrid").hidden && d.querySelector("#jProfile").textContent.includes("Arbeitslos") && d.querySelector("#jProfile").textContent.includes("seit 0 Tagen"), "Profil: 'Arbeitslos seit 0 Tagen'");
  w.eval("nextDay(10)");
  w.eval("navigate('journey')");
  ok(d.querySelector("#jProfile").textContent.includes("seit 10 Tagen"), "Zählt automatisch mit dem Spieldatum");
  w.eval("navigate('home')");
  ok(!d.querySelector("#journeyHomeCard").hidden && d.querySelector("#journeyHome .jh-big strong").textContent==="10", "Portal: Journey-Karte mit '10 Tage ohne Job'");
  w.eval("navigate('journey')");
  // job search board
  d.querySelector('[data-j="addApp"]').click(); fillJJ("club","SV Dorfkirchen"); fillJJ("league","Kreisliga"); d.querySelector("[data-modal-save]").click();
  d.querySelector('[data-j="addApp"]').click(); fillJJ("club","FC Absage"); d.querySelector("[data-modal-save]").click();
  const app1J = JJ().applications.find(a=>a.club==="SV Dorfkirchen"), app2J = JJ().applications.find(a=>a.club==="FC Absage");
  ok(d.querySelectorAll("#jJobs .j-board .tc-col")[0].textContent.includes("SV Dorfkirchen"), "Bewerbungs-Board: Spalte 'Interesse'");
  for(let i=0;i<3;i++) d.querySelector(`[data-j="appNext:${app1J.id}"]`).click();
  ok(JJ().applications.find(a=>a.id===app1J.id).status==="offer" && d.querySelector(`[data-j="accept:${app1J.id}"]`), "▶ Beworben → Gespräch → Angebot, dann 'Annehmen'");
  d.querySelector(`[data-j="appReject:${app2J.id}"]`).click();
  ok(JJ().applications.find(a=>a.id===app2J.id).status==="rejected" && d.querySelector("#jJobs .j-rejected").textContent.includes("1 Absage"), "Absage landet in der Absagen-Liste");
  // accept → station + salary order (no new save here)
  d.querySelector(`[data-j="accept:${app1J.id}"]`).click();
  ok(d.querySelector('#modal [data-f="club"]').value==="SV Dorfkirchen" && d.querySelector('#modal [data-f="league"]').value==="Kreisliga", "Angebot annehmen: Dialog mit Verein und Liga vorausgefüllt");
  fillJJ("salary","8.000"); fillJJ("newSlot", false); d.querySelector("[data-modal-save]").click();
  const st1J = JJ().stations[0], salJ = JJ().orders.find(o=>o.id===st1J.orderId);
  ok(st1J.club==="SV Dorfkirchen" && st1J.from==="2027-03-22" && !st1J.to && salJ && salJ.amount===8000 && salJ.type==="income" && salJ.day===1, "Station angelegt, Gehalt 8.000 als Dauerauftrag am 1.");
  ok(!JJ().applications.some(a=>a.id===app1J.id) && d.querySelector("#jProfile").textContent.includes("bei SV Dorfkirchen"), "Bewerbung erledigt, Profil zeigt den Job");
  w.eval("navigate('home')");
  ok(d.querySelector("#journeyHomeCard").hidden, "Mit Job: keine Arbeitslos-Karte im Portal");
  w.eval("navigate('journey')");
  // standing orders: expense + savings goalJ with planJ
  d.querySelector('[data-j="addOrder"]').click(); fillJJ("name","Miete"); fillJJ("amount","2.000"); fillJJ("type","expense"); fillJJ("day","15"); d.querySelector("[data-modal-save]").click();
  d.querySelector('[data-j="addGoal"]').click(); fillJJ("cat","house"); fillJJ("name","Haus am See"); fillJJ("target","12.000"); fillJJ("plan", true); fillJJ("rate","5.000"); d.querySelector("[data-modal-save]").click();
  const goalJ = JJ().goals[0], planJ = JJ().orders.find(o=>o.target===goalJ.id);
  ok(goalJ.name==="Haus am See" && planJ && planJ.amount===5000 && planJ.type==="save", "Sparziel mit monatlichem Sparplan (5.000 aufs Ziel)");
  ok(d.querySelector("#jSave").textContent.includes("5.000/Monat") || d.querySelector("#jSave").textContent.includes("€5.000/Monat"), "Prognose mit Sparrate: "+d.querySelector("#jSave .j-goal-foot").textContent.trim().slice(0,50));
  // date jump 22.03. → 15.06.: salary 3× (Apr, May, Jun), rent 3× (Apr 15, May 15, Jun 15), planJ 3× (Apr, May, Jun)
  const g0J = JJ().bank.giro, s0J = JJ().bank.savings;
  w.eval("applyDateChange('2027-06-15')");
  ok(JJ().bank.giro === g0J + 3*8000 - 3*2000 - 3*5000 && JJ().bank.savings === s0J + 15000, `Datumssprung: 3× Gehalt, 3× Miete (weg), 3× Sparplan (Giro ${w.eval("fmtEUR("+JJ().bank.giro+")")})`);
  ok(JJ().goals[0].saved===15000 && d.querySelector("#toastMsg").textContent.includes("💶 9 Buchungen") && d.querySelector("#toastMsg").textContent.includes("Sparziel „Haus am See“ erreicht"), "Sparziel erreicht + Hinweis: "+d.querySelector("#toastMsg").textContent.split("·").slice(1).join("·").trim().slice(0,70));
  const tx0J = JJ().tx.length;
  w.eval("applyDateChange('2027-06-01'); applyDateChange('2027-06-15')");
  ok(JJ().tx.length===tx0J && JJ().bank.giro === g0J + 3*8000 - 3*2000 - 3*5000, "Zurück und wieder vor: nichts doppelt gebucht");
  w.eval("applyDateChange('2027-07-02')");
  const g1J = JJ().bank.giro;
  d.querySelector("#toastUndoBtn").click();
  ok(JJ().bank.giro < g1J && JJ().lastDate==="2027-06-15" && S().club.ingameDate==="2027-06-15", "Rückgängig beim Datumssprung nimmt auch die Buchungen zurück");
  // buy the goalJ
  w.eval("navigate('journey')");
  d.querySelector(`[data-j="goalBuy:${goalJ.id}"]`).click(); d.querySelector("[data-modal-save]").click();
  ok(JJ().goals[0].status==="bought" && JJ().bank.savings === s0J + 15000 - 12000 && !JJ().orders.find(o=>o.id===planJ.id).active && d.querySelector("#jSave .j-owned").textContent.includes("Haus am See"), "Gekauft: 12.000 weg, 3.000 Überschuss bleiben frei, Sparplan gestoppt, im Besitz");
  // booking rules
  d.querySelector('[data-j="booking"]').click(); fillJJ("kind","toGiro"); fillJJ("amount","999.999"); d.querySelector("[data-modal-save]").click();
  ok(d.querySelector("#modalOverlay").classList.contains("active") && d.querySelector("#toastMsg").textContent.includes("frei"), "Umbuchung vom Sparkonto nur bis zum freien Betrag (Dialog bleibt offen)");
  fillJJ("kind","out"); fillJJ("amount","100"); fillJJ("text","Neues Handy"); d.querySelector("[data-modal-save]").click();
  ok(JJ().tx.slice(-1)[0].text==="Neues Handy" && JJ().tx.slice(-1)[0].to==="ext", "Ausgabe gebucht");
  // weekly occurrences
  ok(w.eval(`jOccurrences({freq:"weekly", start:"2027-01-04", day:1}, "2027-01-04", "2027-02-01").length`)===4 && w.eval(`jOccurrences({freq:"monthly", start:"2027-01-01", day:31}, "2027-01-31", "2027-04-30").join()`)==="2027-02-28,2027-03-31,2027-04-30", "Wöchentlich 4× in 4 Wochen; 'am 31.' → Monatsende (28.02., 30.04.)");
  // licence course
  d.querySelector('[data-j="addCourse"]').click(); fillJJ("m","6"); fillJJ("c","3.000"); d.querySelector("[data-modal-save]").click();
  const gCJ = JJ().bank.giro;
  ok(JJ().courses.length===1 && JJ().courses[0].targetIdx===2, "Kurs zur Nationalen C-Lizenz angemeldet, 3.000 abgebucht");
  w.eval("applyDateChange('2027-12-20')");
  ok(JJ().courses[0].done && JJ().profile.licenseIdx===2 && d.querySelector("#toastMsg").textContent.includes("Nationale C-Lizenz abgeschlossen"), "Nach 6 Monaten automatisch abgeschlossen: Nationale C-Lizenz");
  // end station → unemployed, salary stops
  w.eval("navigate('journey')");
  d.querySelector(`[data-j="endStation:${st1J.id}"]`).click(); fillJJ("ach","Aufstieg in die Bezirksliga"); d.querySelector("[data-modal-save]").click();
  ok(JJ().stations[0].to==="2027-12-20" && JJ().stations[0].reason==="entlassen" && !JJ().orders.find(o=>o.id===st1J.orderId).active && d.querySelector("#jProfile").textContent.includes("Arbeitslos"), "Station beendet: entlassen, Gehalt gestoppt, wieder arbeitslos");
  // new club with its own save
  const nSlotsJ = w.eval("slotIndex.slots.length");
  d.querySelector('[data-j="newStation"]').click(); fillJJ("club","TSV Aufsteiger"); fillJJ("salary","15.000");
  ok(!d.querySelector('#modal [data-f="newSlot"]').checked, "9.9.1: neuer Spielstand beim Vereinswechsel ist optional");
  fillJJ("newSlot", true); d.querySelector("[data-modal-save]").click();
  ok(w.eval("slotIndex.slots.length")===nSlotsJ+1 && S().club.name==="TSV Aufsteiger" && S().players.length===0 && S().club.ingameDate==="2027-12-20", "Neuer Verein: eigener leerer Spielstand angelegt und geöffnet (Datum übernommen)");
  ok(JJ().stations.find(s=>s.club==="TSV Aufsteiger").slotId===w.eval("slotIndex.active") && JJ().profile.name==="Max Mustermann", "Station mit dem Spielstand verknüpft, Journey bleibt erhalten");
  w.eval(`state.results.push({id:"r1", date:"2027-12-21", opponent:"X", competition:"Liga", venue:"H", gf:2, ga:0, planId:"", planName:"", formation:"", oppFormation:"", season:"2027/28"}); saveState(); navigate('journey')`);
  ok(d.querySelector("#jStations .j-timeline li.now").textContent.includes("1 Spiele") && d.querySelector("#jStations").textContent.includes("Aufstieg in die Bezirksliga"), "Stationen: Live-Bilanz aus dem verknüpften Spielstand, Erfolge der alten Station");
  // diary, milestones, trophies, rules
  d.querySelector('[data-j="addDiary"]').click(); fillJJ("title","Erster Tag"); fillJJ("mood","great"); fillJJ("text","Neues Kapitel."); d.querySelector("[data-modal-save]").click();
  ok(d.querySelector("#jDiary .j-entry").textContent.includes("Erster Tag") && d.querySelector("#jDiary .j-mood").textContent==="😄", "Tagebuch-Eintrag mit Stimmung");
  d.querySelector('[data-j="msDefaults"]').click();
  const ms1J = d.querySelector("#jMilestones [data-j-ms]"); ms1J.checked = true; ms1J.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(JJ().milestones.length===9 && JJ().milestones[0].done && JJ().milestones[0].date==="2027-12-20", "Reiseziele: Vorschläge übernommen, erstes abgehakt mit Datum");
  d.querySelector('[data-j="addTrophy"]').click(); fillJJ("t","Meister Kreisliga"); d.querySelector("[data-modal-save]").click();
  d.querySelector('[data-j="addRule"]').click(); fillJJ("v","Nur Spieler unter 23"); d.querySelector("[data-modal-save]").click();
  d.querySelector(`[data-j="ruleToggle:${JJ().rules[0].id}"]`).click();
  ok(JJ().trophies[0].title==="Meister Kreisliga" && JJ().trophies[0].club==="TSV Aufsteiger" && JJ().rules[0].broken, "Trophäe (Verein vorausgefüllt) und Regel als gebrochen markiert");
  // persistence, sanitizing, storage, backup
  const oldSlotJ = w.eval("slotIndex.slots.find(x=>x.name!=='TSV Aufsteiger').id");
  ok(JSON.parse(w.localStorage.getItem("fm27_slot_" + oldSlotJ)).journey.stations.some(x=>x.club==="TSV Aufsteiger"), "Der alte Spielstand behält seinen Stand (inkl. Wechsel-Station)");
  const savedJ = JJ();
  const dumpJ = {}; for(let i=0;i<w.localStorage.length;i++){ const k = w.localStorage.key(i); dumpJ[k] = w.localStorage.getItem(k); }
  ({w,d,errs,S} = await boot(ls=>{ Object.entries(dumpJ).forEach(([k,v])=>ls.setItem(k, v)); }));   // real reload: same browser storage
  ok(w.eval("journey.active") && w.eval("journey.stations.length")===savedJ.stations.length && w.localStorage.getItem("fm27_journey")===null, "Journey übersteht das Neuladen – im Spielstand, kein globaler Schlüssel");
  const badJJ = w.eval(`sanitizeJourney({active:true, profile:{age:"x", licenseIdx:99}, orders:[{type:"hack", amount:-5, day:99}], goals:[{saved:100, target:50}], bank:{savings:0}, applications:[{status:"weird"}], diary:[{mood:"???"}], licenseLevels:["nur eine"]})`);
  ok(badJJ.profile.age===35 && badJJ.profile.licenseIdx===8 && badJJ.orders[0].type==="expense" && badJJ.orders[0].amount===0 && badJJ.orders[0].day===31 && badJJ.bank.savings===100 && badJJ.applications[0].status==="interest" && badJJ.diary[0].mood==="neutral" && badJJ.licenseLevels.length===9,
     "Bereinigung: ungültige Werte korrigiert, Sparkonto deckt reservierte Beträge");
  w.eval(`handleBackupText(JSON.stringify({kind:"journey", journey:{active:true, profile:{name:"Backup-Trainer"}, stations:[]}}))`);
  ok(d.querySelector("#modal h3").textContent.includes("Journey wiederherstellen") && d.querySelector("#modal").textContent.includes("dieses Spielstands") && d.querySelector("#modal").textContent.includes("Backup-Trainer"), "Journey-Datei wird erkannt – ersetzt nur die Journey dieses Spielstands");
  d.querySelector("[data-modal-save]").click();
  ok(w.eval("journey.profile.name")==="Backup-Trainer", "… und eingelesen");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[52] Version 9.9.1: Journey pro Spielstand");
  // migration of the old shared journey into the ACTIVE save
  const shared = {active:true, startDate:"2027-01-10", lastDate:"2027-03-12", profile:{name:"Bayern-Trainer"}, bank:{giro:5000, savings:0}, diary:[{date:"2027-02-01", title:"Alt", text:"x"}]};
  ({w,d,errs,S} = await boot(ls=>{ ls.setItem("fm27_journey", JSON.stringify(shared)); ls.setItem("fm27_seen_version", js.match(/APP_VERSION = "([^"]+)"/)[1]); }));
  const act = () => w.eval("slotIndex.active");
  const slotJ = id => (JSON.parse(w.localStorage.getItem("fm27_slot_" + id)) || {}).journey;
  ok(slotJ(act()).active && slotJ(act()).profile.name==="Bayern-Trainer" && slotJ(act()).diary.length===1 && slotJ(act()).bank.giro===5000, "Migration: bisherige Journey vollständig dem aktiven Spielstand zugeordnet");
  ok(w.localStorage.getItem("fm27_journey")===null, "Alter globaler Schlüssel entfernt (kein zweites Mal übernommen)");
  await new Promise(r=>setTimeout(r,1600));
  ok(d.querySelector("#toastMsg").textContent.includes("zugeordnet"), "Hinweis: "+d.querySelector("#toastMsg").textContent.slice(0,60));
  // four saves, four journeys
  const bayern = act();
  w.eval(`createSlot("Man United", freshState("sample")); createSlot("Barcelona", freshState("sample"));`);
  const mu = w.eval("slotIndex.slots.find(x=>x.name==='Man United').id"), fcb = w.eval("slotIndex.slots.find(x=>x.name==='Barcelona').id");
  w.eval(`switchSlot("${mu}"); navigate("journey")`);
  ok(!d.querySelector("#journeyStart").hidden && d.querySelector("#journeyGrid").hidden && d.querySelector("#journeyStart").textContent.includes("Man United"), "Wechsel zu Man United: frische Journey ('Journey starten' für diesen Spielstand)");
  d.querySelector('#journeyStart [data-j="begin"]').click();
  d.querySelector('#modal [data-f="name"]').value = "United-Coach"; d.querySelector('#modal [data-f="giro"]').value = "100"; d.querySelector("[data-modal-save]").click();
  ok(slotJ(mu).profile.name==="United-Coach" && slotJ(bayern).profile.name==="Bayern-Trainer", "Eingaben landen nur in Man United – Bayern unverändert");
  w.eval(`switchSlot("${bayern}")`);
  ok(d.querySelector("#view-journey.active") && d.querySelector("#jProfile").textContent.includes("Bayern-Trainer") && !d.querySelector("#jProfile").textContent.includes("United"), "Zurück zu Bayern: Journey-Ansicht zeigt sofort Bayerns Daten");
  w.eval(`switchSlot("${fcb}")`);
  ok(!d.querySelector("#journeyStart").hidden, "Barcelona: eigene, noch leere Journey");
  w.eval(`switchSlot("${mu}")`);
  // date jumps / standing orders act on this save only
  w.eval(`journey.orders.push({id:"o1", name:"Gehalt", amount:1000, type:"income", target:"", freq:"monthly", day:1, start:state.club.ingameDate, active:true}); saveJourney(); applyDateChange("2027-05-15")`);
  ok(slotJ(mu).bank.giro===100 + 2*1000 && slotJ(bayern).bank.giro===5000, "Daueraufträge buchen nur im aktiven Spielstand");
  d.querySelector("#toastUndoBtn").click();
  ok(slotJ(mu).bank.giro===100, "Rückgängig des Datumssprungs nimmt die Buchungen dieses Spielstands zurück");
  // duplicate & export carry the journey
  w.eval("openSlotsModal()");
  d.querySelector(`#modal [data-slot-id="${mu}"] [data-slot-dup]`) ? d.querySelector(`#modal [data-slot-id="${mu}"] [data-slot-dup]`).click() : w.eval(`createSlot("Man United (Kopie)", JSON.parse(localStorage.getItem("fm27_slot_${mu}")))`);
  const copy = w.eval("slotIndex.slots.find(x=>x.name.startsWith('Man United (Kopie)')).id");
  ok(slotJ(copy) && slotJ(copy).profile.name==="United-Coach", "Duplizieren kopiert die Journey mit");
  w.eval("closeModal()");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  let exported = null; const origBlob = w.Blob; w.Blob = function(parts){ exported = parts.join(""); return new origBlob(parts); };
  d.querySelector("#btnExport").click();
  w.Blob = origBlob;
  ok(exported && JSON.parse(exported).data.journey.profile.name==="United-Coach", "JSON-Export des Spielstands enthält seine Journey");
  const jx = w.eval("jExport()");
  ok(JSON.parse(jx).kind==="journey" && JSON.parse(jx).slotName==="Man United", "'Journey exportieren' erzeugt eine Journey-Datei");
  w.eval(`switchSlot("${fcb}")`);
  w.eval(`handleBackupText(${JSON.stringify(jx)})`); d.querySelector("[data-modal-save]").click();
  ok(slotJ(fcb).profile.name==="United-Coach" && slotJ(mu).profile.name==="United-Coach", "… und lässt sich in einen anderen Spielstand einlesen (zum Umziehen)");
  w.eval("navigate('journey')"); d.querySelector('[data-j="profile"]').click(); d.querySelector("#modal [data-j-reset]").click();
  ok(!slotJ(fcb).active && slotJ(mu).active, "'Journey zurücksetzen' leert nur diesen Spielstand");
  d.querySelector("#toastUndoBtn").click();
  ok(slotJ(fcb).active, "… rückgängig machbar");
  // restore point includes the journey
  w.eval(`createRestorePoint("Test", true); journey.profile.name = "Geändert"; saveJourney();`);
  const rp = w.eval("readRestorePoints()[0].id"); w.eval(`restoreFromPoint("${rp}")`);
  ok(slotJ(fcb).profile.name==="United-Coach", "Wiederherstellungspunkt stellt auch die Journey wieder her");
  // conflict: an old shared key must never overwrite an existing journey
  ({w,d,errs,S} = await boot(ls=>{}));
  w.eval(`journey = sanitizeJourney({active:true, profile:{name:"Vorhanden"}}); saveJourney(); localStorage.setItem("fm27_journey", JSON.stringify({active:true, profile:{name:"Altlast"}}));`);
  ok(w.eval("migrateSharedJourney()")==="" && w.eval("journey.profile.name")==="Vorhanden" && w.localStorage.getItem("fm27_journey")!==null, "Konflikt: vorhandene Journey wird nie überschrieben, alte Daten bleiben erhalten");
  ok(w.eval("storageEntries()").find(e=>e.key==="fm27_journey").kind==="legacy", "… und stehen unter Wartung 'bitte prüfen'");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[51] Version 9.1: Komfort-Update");
  ({w,d,errs,S} = await boot());
  w.eval("navigate('squad')");
  const headKeysQ = () => [...d.querySelectorAll("#squadTable thead th")].filter(x=>!x.hidden || x.dataset.col==="valueMax").map(thQ=>thQ.dataset.col);   // mode columns hidden in a club save
  const rowKeysQ = () => [...d.querySelector("#squadTbody tr[data-id]").cells].map(td=>td.dataset.col);
  const dragQ = (type, el, x) => { const ev = new w.Event(type, {bubbles:true, cancelable:true});
    Object.defineProperty(ev, "dataTransfer", {value:{setData(){}, getData(){ return ""; }, effectAllowed:"", dropEffect:""}}); Object.defineProperty(ev, "clientX", {value:x || 0}); el.dispatchEvent(ev); return ev; };
  const thQ = k => d.querySelector(`#squadTable thead th[data-col="${k}"]`);
  ok(thQ("note").draggable && thQ("pos").draggable && !thQ("sel").draggable && !thQ("actions").draggable, "Spaltenköpfe ziehbar – Auswahl und Aktionen bleiben fest");
  dragQ("dragstart", thQ("note")); dragQ("dragover", thQ("pos"), -1); dragQ("drop", thQ("pos"), -1); dragQ("dragend", thQ("note"));
  let hkQ = headKeysQ().filter(k=>k!=="valueMax");
  ok(hkQ.indexOf("note") === hkQ.indexOf("pos") - 1 && hkQ[0]==="sel" && hkQ[hkQ.length-1]==="actions", "Notiz vor 'Pos.' gezogen: "+hkQ.slice(0,5).join(", ")+" …");
  ok(JSON.stringify(rowKeysQ())===JSON.stringify(headKeysQ().filter(k=>k!=="valueMax")), "Zellen jeder Zeile folgen den Köpfen");
  ok(JSON.parse(w.localStorage.getItem("fm27_columns")).order.squadTable.indexOf("note") < JSON.parse(w.localStorage.getItem("fm27_columns")).order.squadTable.indexOf("pos"), "Reihenfolge gespeichert");
  w.eval("state.players[0].note = 'neu'; saveState(); renderSquad()");
  ok(headKeysQ().indexOf("note") < headKeysQ().indexOf("pos") && JSON.stringify(rowKeysQ())===JSON.stringify(headKeysQ().filter(k=>k!=="valueMax")), "Bleibt nach Neuzeichnen erhalten");
  const noteIdxQ = headKeysQ().indexOf("note"), noteValQ = d.querySelector("#squadTbody tr[data-id]").cells[noteIdxQ].querySelector("input").value;
  ok(noteValQ==="neu", "Inhalt passt zur verschobenen Spalte (Notiz steht wirklich unter 'Notiz')");
  dragQ("dragstart", thQ("salary")); dragQ("dragover", thQ("name"), 1); dragQ("drop", thQ("name"), 1);
  ok(headKeysQ()[2]==="salary", "Gehalt direkt hinter den Namen gezogen (rechte Hälfte = danach)");
  w.eval("colDrag = {}"); const evBQ = dragQ("dragstart", thQ("age")); w.eval("colDrag = null");
  ok(evBQ.defaultPrevented, "Während eine Spalte in der Breite gezogen wird, startet kein Verschieben");
  // custom field column moves too
  w.eval(`state.customFields.push({id:"hg", name:"Homegrown", type:"bool", options:[], areas:["squad"]}); state = sanitizeState(state); saveState(); renderSquad()`);
  dragQ("dragstart", thQ("cf_hg")); dragQ("dragover", thQ("pos"), -1); dragQ("drop", thQ("pos"), -1);
  ok(headKeysQ().indexOf("cf_hg") === headKeysQ().indexOf("pos") - 1 && rowKeysQ().indexOf("cf_hg") === rowKeysQ().indexOf("pos") - 1, "Auch eigene Felder lassen sich verschieben");
  // dialog with ↑/↓
  d.querySelector("#btnColumns").click();
  ok(d.querySelectorAll("#modal .col-order-row").length >= 11, "Spalten-Dialog: Liste in aktueller Reihenfolge");
  const firstKeyQ = d.querySelector('#modal .col-order-row [data-col-move$=":1"]').dataset.colMove.split(":")[0];
  d.querySelector(`#modal [data-col-move="${firstKeyQ}:1"]`).click();
  ok(headKeysQ()[2]===firstKeyQ && d.querySelector("#modal .col-order-row:nth-child(2)").textContent.includes(w.eval(`({name:"Name"})["${firstKeyQ}"] || SQUAD_COL_NAMES["${firstKeyQ}"] || "Name"`)), "↓ im Dialog verschiebt die Spalte (auch ohne Ziehen, z. B. am Tablet)");
  d.querySelector("#modal [data-col-reset]").click();
  ok(!w.eval("colPrefs.order.squadTable") && headKeysQ()[1]==="name" && headKeysQ()[2]==="pos", "Zurücksetzen stellt die Standard-Reihenfolge wieder her");
  ok(JSON.stringify(rowKeysQ())===JSON.stringify(headKeysQ().filter(k=>k!=="valueMax")), "… Köpfe UND Zellen – nichts verrutscht");
  d.querySelector("#toastUndoBtn").click();
  ok(w.eval("colPrefs.order.squadTable") && headKeysQ()[2]!=="pos" && JSON.stringify(rowKeysQ())===JSON.stringify(headKeysQ().filter(k=>k!=="valueMax")), "Rückgängig stellt die eigene Reihenfolge wieder her, ebenfalls deckungsgleich");
  ({w,d,errs,S} = await boot(ls=>ls.setItem("fm27_columns", JSON.stringify({order:{squadTable:["note","name","sel","actions"]}}))));
  w.eval("navigate('squad')");
  ok(headKeysQ()[0]==="sel" && headKeysQ()[1]==="note" && headKeysQ()[2]==="name" && headKeysQ().slice(-1)[0]==="actions", "Beim Start angewandt; 'sel'/'actions' im Speicher werden ignoriert");
  // --- player links → squad, row marked ---
  ({w,d,errs,S} = await boot());
  const bosQ = S().players.find(p=>p.name==="Mats Böhringer");
  w.eval("navigate('squad')"); d.querySelector("#squadSearch").value = "xyz"; d.querySelector("#squadRoleFilter").value = "key"; w.eval("renderSquad(); navigate('home')");
  const linkQ = d.querySelector(`#contractAlerts [data-goto-player="${bosQ.id}"]`);
  ok(linkQ && linkQ.textContent==="Mats Böhringer", "Portal → Vertragsfristen: Name ist ein Link");
  linkQ.click();
  const frQ = d.querySelector(`#squadTbody tr[data-id="${bosQ.id}"]`);
  ok(d.querySelector("#view-squad.active") && frQ && frQ.classList.contains("row-focus") && d.querySelectorAll("#squadTbody tr.row-focus").length===1, "Klick → Kader, Böhringer markiert");
  ok(d.querySelector("#squadSearch").value==="" && d.querySelector("#squadRoleFilter").value==="", "Filter, die ihn verdeckt hätten, wurden geleert");
  ok(d.activeElement === frQ.querySelector('[data-field="name"]'), "Fokus liegt auf seiner Zeile");
  w.eval("renderSquad()");
  ok(d.querySelector(`#squadTbody tr[data-id="${bosQ.id}"]`).classList.contains("row-focus"), "Markierung übersteht Neuzeichnen");
  const otherQ = d.querySelector(`#squadTbody tr[data-id]:not([data-id="${bosQ.id}"])`);
  otherQ.dispatchEvent(new w.Event("pointerdown", {bubbles:true}));
  ok(!d.querySelector("#squadTbody tr.row-focus"), "Arbeiten an einer anderen Zeile hebt die Markierung auf");
  // links in otherQ places
  const saleQ = S().sales[0]; w.eval("state.ui.transferTab='sell'; navigate('recruitment'); renderRecruitment()");
  ok(d.querySelector(`#salesTbody [data-goto-player="${saleQ.playerId}"]`) || d.querySelector(`#tr-sell [data-goto-player="${saleQ.playerId}"]`), "Verkaufsliste: Name ist ein Link");
  w.eval("state.ui.transferTab='center'; renderRecruitment()");
  const cLinkQ = d.querySelector(`#tr-center .tc-deal [data-goto-player="${saleQ.playerId}"]`);
  ok(cLinkQ, "Transfer-Center: Abgänge verlinkt");
  const beforeQ = S().sales.find(x=>x.id===saleQ.id).status; cLinkQ.click();
  ok(d.querySelector("#view-squad.active") && S().sales.find(x=>x.id===saleQ.id).status===beforeQ, "Klick auf den Namen in einer Karte löst nichts anderes in der Karte aus");
  w.eval("state.ui.squadTab='contracts'; navigate('squad')");
  ok(d.querySelector("#squad-contracts [data-goto-player]"), "Vertrags-Ansicht: Namen verlinkt");
  // loaned player → greyed row marked, even if 'show loaned' was off
  w.eval(`(()=>{ const p = state.players.find(x=>x.name==="Aurelien Faye"); state.loans.push({id:"lx", name:p.name, pos:p.pos, age:p.age, club:"FC", until:"06/2028", apps:0, minutes:0, clause:"recall", note:"", player:JSON.parse(JSON.stringify(p)), playerHistory:[]}); state.players = state.players.filter(x=>x.id!==p.id); state.ui.showLoaned = false; state = sanitizeState(state); saveState(); })()`);
  const fidQ = S().loans.find(l=>l.id==="lx").player.id;
  w.eval(`gotoPlayer("${fidQ}")`);
  ok(d.querySelector('#squadTbody tr.loaned-row[data-loan-id="lx"]').classList.contains("row-focus") && S().ui.showLoaned===true, "Verliehener Spieler: ausgegraute Zeile markiert ('Verliehene zeigen' wird dafür eingeschaltet)");
  w.eval(`gotoPlayer("gibtsnicht")`);
  ok(d.querySelector("#toastMsg").textContent.includes("nicht (mehr) im Kader"), "Unbekannter Spieler: Hinweis statt Fehler");
  // --- loan notes ---
  ({w,d,errs,S} = await boot());
  w.eval("navigate('squad')");
  const kesQ = S().players.find(p=>p.name==="Dario Kessel"); w.eval(`state.players.find(p=>p.name==="Dario Kessel").note = "Eigene Spielernotiz"; saveState(); renderSquad()`);
  d.querySelector(`#squadTbody tr[data-id="${kesQ.id}"] [data-loan]`).click();
  ok(d.querySelector('#modal [data-f="loanNote"]'), "Verleih-Dialog: Feld 'Notiz zur Leihe'");
  d.querySelector('#modal [data-f="club"]').value = "FC Leih"; d.querySelector('#modal [data-f="loanNote"]').value = "25 Einsätze versprochen"; d.querySelector("[data-modal-save]").click();
  const lkQ = S().loans.find(l=>l.name==="Dario Kessel");
  ok(lkQ.note==="25 Einsätze versprochen" && lkQ.player.note==="Eigene Spielernotiz", "Leih-Notiz gespeichert, eigene Spielernotiz bleibt im Rucksack");
  ok(d.querySelector(`#squadTbody tr[data-loan-id="${lkQ.id}"] [data-col="note"]`).textContent.includes("📝 25 Einsätze"), "Ausgegraute Kaderzeile zeigt die Leih-Notiz");
  w.eval("state.ui.devTab='loans'; navigate('development'); renderDevelopment()");
  ok([...d.querySelectorAll('#loanTbody [data-field="note"]')].some(i=>i.value==="25 Einsätze versprochen"), "Leihen-Übersicht zeigt (und bearbeitet) die Notiz");
  w.eval(`returnLoan(state.loans.find(l=>l.name==="Dario Kessel"))`);
  ok(S().players.find(p=>p.name==="Dario Kessel").note.startsWith("Eigene Spielernotiz · 25 Einsätze versprochen"), "Bei Rückkehr: eigene Notiz + Leih-Notiz");
  w.eval("openLoanModal()");
  d.querySelector('#modal [data-f="name"]').value = "Neu Leih"; d.querySelector('#modal [data-f="loanNote"]').value = "Stammplatz zugesagt"; d.querySelector("[data-modal-save]").click();
  ok(S().loans.find(l=>l.name==="Neu Leih").note==="Stammplatz zugesagt", "Auch bei '+ Leihe' eine Notiz");
  w.eval(`state.scouting.push({id:"li9", name:"Leih Neun", pos:"ST", age:20, grade:"B", status:"fixed", priority:2, fee:0, bonus:0, wage:500000, note:"", kind:"loan", wageShare:50}); state = sanitizeState(state); signTarget(state.scouting.find(t=>t.id==="li9"))`);
  d.querySelector('#modal [data-f="loanNote"]').value = "15 Spiele garantiert"; d.querySelector("[data-modal-save]").click();
  ok(S().players.find(p=>p.name==="Leih Neun").note==="Leihe: 15 Spiele garantiert", "Ausleihen: Notiz landet beim Spieler");
  // --- show backup folder ---
  w.showDirectoryPicker = ()=>{};   // folder support like in Vivaldi/Chrome
  w.eval(`backupDir = {name:"FM27-Backups"}; backupPerm = "granted"; adminCfg; setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'backup'; navigate('admin')`);
  ok(d.querySelector('#adminBody [data-bk="open"]') && d.querySelector("#adminBody").textContent.includes("FM27-Backups"), "Wiederherstellung: '📂 Ordner anzeigen' + Ordnername");
  let pickerArgsQ = null;
  w.showOpenFilePicker = async (o)=>{ pickerArgsQ = o; return [{getFile: async ()=>({text: async ()=>JSON.stringify({kind:"journey", journey:{active:true, profile:{name:"Aus dem Ordner"}}})})}]; };
  d.querySelector('#adminBody [data-bk="open"]').click(); await new Promise(r=>setTimeout(r,20));
  ok(pickerArgsQ && pickerArgsQ.startIn && pickerArgsQ.startIn.name==="FM27-Backups" && d.querySelector("#modal h3").textContent.includes("Journey wiederherstellen"), "Datei-Fenster startet im Sicherungsordner; gewählte Datei wird wiederhergestellt (mit Rückfrage)");
  w.eval("closeModal()");
  w.showOpenFilePicker = async ()=>{ const e = new Error("abgebrochen"); e.name = "AbortError"; throw e; };
  const tBeforeQ = d.querySelector("#toastMsg").textContent;
  d.querySelector('#adminBody [data-bk="open"]').click(); await new Promise(r=>setTimeout(r,20));
  ok(d.querySelector("#toastMsg").textContent===tBeforeQ, "Fenster geschlossen: kein Fehlerhinweis");
  delete w.showOpenFilePicker;
  d.querySelector('#adminBody [data-bk="open"]').click(); await new Promise(r=>setTimeout(r,20));
  ok(d.querySelector("#toastMsg").textContent.includes("Vivaldi, Chrome oder Edge"), "Ohne Unterstützung: klarer Hinweis");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[53] Version 10.0: Nationalteam-Modus & Release-Absicherung");
  ({w,d,errs,S} = await boot());
  ok(!d.body.classList.contains("mode-national") && S().mode==="club" && d.querySelector('#squadTable thead th[data-col="caps"]').hidden, "Bestehende Spielstände: Vereinsmodus, Nationalteam-Spalten ausgeblendet");
  const clubId = w.eval("slotIndex.active");
  // create a national team via the save manager
  w.eval("openSlotsModal()"); d.querySelector('#modal [data-slot-new="national"]').click();
  await new Promise(r=>setTimeout(r,80));
  ok(S().mode==="national" && d.querySelector("#modal h3").textContent.includes("Nationalteam einrichten"), "„+ Nationalteam“: neuer Spielstand im Nationalteam-Modus, Einrichtung öffnet sich");
  const pre = d.querySelector('#modal [data-f="preset"]'); pre.value = "ger"; pre.dispatchEvent(new w.Event("change"));
  ok(d.querySelector('#modal [data-f="country"]').value==="Deutschland" && d.querySelector('#modal [data-f="code"]').value==="GER" && d.querySelector('#modal [data-f="c1"]').value==="#dd0000", "Vorlage 'Deutschland' füllt Name, Kürzel, Farben");
  d.querySelector('#modal [data-f="maxSquad"]').value = "26";
  d.querySelector('#modal [data-f="link"]').value = clubId;
  d.querySelector("[data-modal-save]").click();
  const natId = w.eval("slotIndex.active");
  ok(S().club.name==="Deutschland" && S().national.code==="GER" && S().national.accent==="#ffce00" && d.body.classList.contains("mode-national"), "Eingerichtet: Deutschland, Akzent Gold, eigener Look aktiv");
  ok(d.querySelector("#crestBox").classList.contains("nat-crest") && d.querySelector("#crestBox").style.background.includes("linear-gradient") && d.querySelector("#crestInitials").textContent==="GER", "Emblem in Landesfarben mit Kürzel");
  ok(w.document.documentElement.style.getPropertyValue("--nat-stripe").includes("rgb(221, 0, 0)") || w.document.documentElement.style.getPropertyValue("--nat-stripe").includes("#dd0000"), "Landesfarben-Streifen gesetzt");
  ok(JSON.parse(w.localStorage.getItem("fm27_slot_" + clubId)).link===natId && S().link===clubId, "Verknüpft in beide Richtungen");
  ok(!d.querySelector("#btnLinkSwitch").hidden && d.querySelector("#btnLinkSwitch").textContent.includes("Verein"), "Kopf: Umschalter '⇄ Verein: …'");
  // hidden club modules
  w.eval("navigate('recruitment')");
  ok(!d.querySelector("#view-recruitment.active") && d.querySelector("#toastMsg").textContent.includes("Nationalteam-Modus"), "Transfers sind im Nationalteam ausgeblendet (auch per Taste)");
  // pool import with the same engine
  w.eval("navigate('squad')");
  const csvN = "Name;Position;Alter;Club;Int Caps;Int Goals\nManuel Neuer;TW;38;FC Bayern;124;0\nJoshua Kimmich;DM;29;FC Bayern;91;6\nFlorian Wirtz;OM;21;Bayer Leverkusen;25;6\nNico Schlotterbeck;IV;24;Borussia Dortmund;16;0";
  w.eval("openImportWizard()"); d.querySelector("#impText").value = csvN; d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10));
  const mapN = [...d.querySelectorAll('#modal [data-map]')].map(x=>x.value);
  ok(mapN[3]==="homeClub" && mapN[4]==="caps" && mapN[5]==="intGoals", "Import: 'Club', 'Int Caps', 'Int Goals' automatisch erkannt ("+mapN.slice(3).join(", ")+")");
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,10)); d.querySelector("[data-modal-save]").click();
  const neuer = S().players.find(p=>p.name==="Manuel Neuer");
  ok(S().players.length===4 && neuer.homeClub==="FC Bayern" && neuer.caps===124 && S().players.find(p=>p.name==="Florian Wirtz").intGoals===6, "Pool importiert mit Stammverein, Länderspielen, Toren");
  ok(!d.querySelector('#squadTable thead th[data-col="caps"]').hidden && d.querySelector('#squadTable thead th[data-col="salary"]').hidden && d.querySelector('#squadTable thead th[data-col="contractUntil"]').hidden, "Pool: Natio-Spalten sichtbar, Gehalt und Vertrag ausgeblendet");
  const rowN = d.querySelector(`#squadTbody tr[data-id="${neuer.id}"]`);
  ok(rowN.cells.length === [...d.querySelectorAll("#squadTable thead th")].filter(x=>!x.hidden).length && !rowN.querySelector('[data-field="salary"]'), "Zellen passen exakt zu den sichtbaren Spalten");
  // nominate
  const nomBox = rowN.querySelector('[data-field="nominated"]'); nomBox.checked = true; nomBox.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(S().players.find(p=>p.id===neuer.id).nominated===true && d.querySelector("#natNomValue").textContent==="1 / 26", "Nominiert per Klick → Zähler '1 / 26'");
  ok(rowN.querySelector(".nom-toggle span").textContent==="Nominiert", "Schalter zeigt 'Nominiert'");
  const sfN = d.querySelector("#squadStatusFilter"); sfN.value = "nominated"; sfN.dispatchEvent(new w.Event("change"));
  ok(d.querySelectorAll("#squadTbody tr[data-id]").length===1, "Filter 'Nur Nominierte'");
  w.eval("resetSquadFilters()");
  // portal
  w.eval("navigate('home')");
  ok(d.querySelector("#natNomBox .nat-nom-big strong").textContent==="1" && d.querySelector("#natNomBox").textContent.includes("von 26 nominiert"), "Portal: Nominierung '1 von 26'");
  w.eval(`state.players.forEach(p=>p.nominated = true); state.players.find(p=>p.name==="Manuel Neuer").nominated = true; saveState(); renderAll()`);
  ok(d.querySelector("#natNomBox").textContent.includes("nur 1 Torhüter nominiert (mind. 3)"), "Warnung: zu wenige Torhüter");
  ok(d.querySelector("#natRecordsBox").textContent.includes("Manuel Neuer124") && d.querySelector("#natClubsBox .nat-club").textContent.includes("FC Bayern"), "Rekordspieler und Stammvereine (FC Bayern vorne)");
  // bosman off, tactics only nominated
  w.eval(`state.players[0].contractUntil = 2027; saveState()`);
  ok(!w.eval("isBosman(state.players[0])"), "Keine Bosman-Hinweise im Pool (Verträge gehören zum Verein)");
  w.eval(`state.players.find(p=>p.name==="Nico Schlotterbeck").nominated = false; saveState(); navigate('tactics')`);
  ok(![...d.querySelectorAll("#benchList .bench-item")].some(x=>x.textContent.includes("Schlotterbeck")), "Taktik bietet nur Nominierte an");
  // CSV export
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  ok(w.eval("exportSquadCSV()").split("\r\n")[0].includes("Stammverein;Länderspiele;Länderspieltore;Nominiert"), "CSV-Export mit Natio-Spalten");
  // switch with the date
  w.eval("applyDateChange('2027-03-20')");
  w.eval("switchLinked()");
  ok(w.eval("slotIndex.active")===clubId && S().mode==="club" && S().club.ingameDate==="2027-03-20" && !d.body.classList.contains("mode-national"), "⇄ zum Verein: Datum mitgenommen (20.03.), Vereins-Look zurück");
  ok(!d.querySelector("#btnLinkSwitch").hidden && d.querySelector("#btnLinkSwitch").textContent.includes("Nationalteam: Deutschland") || d.querySelector("#btnLinkSwitch").textContent.includes("Nationalteam"), "Im Verein: Umschalter zum Nationalteam");
  w.eval("switchLinked()");
  ok(w.eval("slotIndex.active")===natId && d.body.classList.contains("mode-national"), "… und zurück");
  // unchanged club save (no nat data leaks)
  ok(JSON.parse(w.localStorage.getItem("fm27_slot_" + clubId)).players.every(p=>!p.nominated), "Vereins-Spielstand bleibt unberührt");
  // --- release hardening ---
  ({w,d,errs,S} = await boot(ls=>{ const idx = {active:"bad1", slots:[{id:"bad1", name:"Kaputt", updatedAt:1}]}; ls.setItem("fm27_slots_index", JSON.stringify(idx)); ls.setItem("fm27_slot_bad1", "{kaputtes json"); }));
  const rescue = Object.keys(w.localStorage).filter ? null : null;
  const keysR = []; for(let i=0;i<w.localStorage.length;i++) keysR.push(w.localStorage.key(i));
  const rk = keysR.find(k=>k.startsWith("fm27_rescue_bad1_"));
  ok(rk && w.localStorage.getItem(rk)==="{kaputtes json", "Beschädigter Spielstand: Original gesichert, bevor irgendetwas überschrieben wird");
  ok(w.eval("storageEntries()").find(e=>e.key===rk).kind==="legacy", "… und unter Wartung 'bitte prüfen' zu finden");
  ok((JSON.parse(w.localStorage.getItem("fm27_errors")) || []).some(e=>e.msg.includes("beschädigt")), "Im Fehlerprotokoll vermerkt");
  w.eval(`logError("Testfehler", "Stack")`);
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'errors'; navigate('admin')");
  ok(d.querySelector("#adminBody .err-card").textContent.includes("Testfehler"), "Admin → Datenprüfung: Fehlerprotokoll sichtbar");
  d.querySelector('#adminBody [data-err="clear"]').click();
  ok(!w.localStorage.getItem("fm27_errors") && d.querySelector("#adminBody .err-card").textContent.includes("Keine unerwarteten Fehler"), "Protokoll leeren");
  const logged = (JSON.parse(w.localStorage.getItem("fm27_errors")) || []).length;
  w.dispatchEvent(new w.ErrorEvent("error", {message:"Serienfehler"}));
  ok((JSON.parse(w.localStorage.getItem("fm27_errors")) || []).length===logged+1 && !d.querySelector("#toastMsg").textContent.includes("Unerwarteter Fehler"), "Fehlerserie: jeder Fehler protokolliert, aber höchstens ein Hinweis pro 15 s");
  w.eval("_lastErrToast = 0");
  w.dispatchEvent(new w.ErrorEvent("error", {message:"Simulierter Fehler"}));
  ok((JSON.parse(w.localStorage.getItem("fm27_errors")) || []).some(e=>e.msg==="Simulierter Fehler") && d.querySelector("#toastMsg").textContent.includes("Unerwarteter Fehler"), "Unerwartete Fehler werden abgefangen, protokolliert und gemeldet");
  errs.length = 0;
  ok(errs.length===0, "keine Laufzeitfehler");

  console.log("\n[54] Spielstand-Manager: Schnellwechsler (seit 10.2 live)");
  ({w,d,errs,S} = await boot());
  w.eval(`createSlot("Man United", freshState("sample")); createSlot("Napoli", freshState("empty"));`);
  const smM = () => d.querySelector("#saveMenu");
  const keyM = (k, target, extra) => (target || w.document).dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({key:k, bubbles:true, cancelable:true}, extra || {})));
  const rowsM = () => [...smM().querySelectorAll(".sm-results li[data-sm-idx]")];
  d.querySelector("#crestBox").click();
  ok(!smM().hidden && smM().classList.contains("sm-switcher") && d.activeElement.id==="smSearch", "Wappen öffnet den Schnellwechsler, Suchfeld fokussiert");
  ok(!smM().querySelector(".sm-variants") && !smM().querySelector(".sm-card"), "Keine Varianten-Auswahl mehr (Pop-up/Flyout ausgebaut)");
  ok(rowsM().filter(li=>!li.classList.contains("sm-new-item")).length===3 && rowsM().filter(li=>li.classList.contains("sm-new-item")).length===3, "3 Spielstände + 3 'Neu'-Einträge");
  const actM = smM().querySelector(".sm-results li.active");
  ok(actM && !actM.dataset.smOpen && actM.textContent.includes("aktiv") && actM.textContent.includes("12.03.2027"), "Aktiver Spielstand markiert, mit Datum");
  const muM = w.eval("slotIndex.slots.find(x=>x.name==='Man United').id");
  smM().querySelector(`li[data-sm-open="${muM}"]`).click();
  ok(w.eval("slotIndex.active")===muM && smM().hidden, "Klick öffnet den Spielstand und schließt den Wechsler");
  w.eval("openSaveMenu()");
  smM().querySelector(`[data-sm-ren="${muM}"]`).click();
  d.querySelector('#modal [data-f="name"]').value = "United 26/27"; d.querySelector("[data-modal-save]").click();
  await new Promise(r=>setTimeout(r,50));
  ok(w.eval(`slotIndex.slots.find(x=>x.id==="${muM}").name`)==="United 26/27" && !smM().hidden, "✎ Umbenennen, danach ist der Wechsler wieder offen");
  smM().querySelector(`[data-sm-dup="${muM}"]`).click();
  ok(w.eval("slotIndex.slots.length")===4, "⧉ Duplizieren");
  const copyIdM = w.eval("slotIndex.slots.find(x=>x.name==='United 26/27 (Kopie)').id");
  smM().querySelector(`[data-sm-del="${copyIdM}"]`).click();
  ok(d.querySelector("#modal h3").textContent.includes("löschen"), "✕ fragt im Dashboard-Stil nach");
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,50));
  ok(w.eval("slotIndex.slots.length")===3 && !w.localStorage.getItem("fm27_slot_" + copyIdM), "Gelöscht (inkl. Daten)");
  keyM("Escape", d.querySelector("#smSearch"));
  ok(smM().hidden, "Esc schließt");
  keyM("s");
  const searchM = d.querySelector("#smSearch");
  searchM.value = "napo"; searchM.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(rowsM()[0].textContent.includes("Napoli") && d.activeElement.id==="smSearch", "Suche 'napo' findet Napoli, Fokus bleibt im Feld");
  keyM("Enter", d.querySelector("#smSearch"));
  ok(w.eval("(activeSlotMeta()||{}).name")==="Napoli" && smM().hidden, "Enter öffnet den Treffer");
  keyM("s"); keyM("ArrowDown", d.querySelector("#smSearch"));
  ok(smM().querySelector(".sm-results li.sel").dataset.smIdx==="1", "↓ bewegt die Auswahl");
  const target2M = rowsM()[1].dataset.smOpen;
  keyM("2", d.querySelector("#smSearch"));
  ok(w.eval("slotIndex.active")===target2M, "Taste 2 öffnet direkt den zweiten Eintrag");
  keyM("s"); const dayBeforeM = S().club.ingameDate;
  keyM("t", d.querySelector("#smSearch")); keyM("Escape", d.querySelector("#smSearch"));
  ok(smM().hidden && S().club.ingameDate===dayBeforeM, "Während der Wechsler offen ist, lösen andere Tasten nichts aus");
  keyM("s");
  rowsM().find(li=>li.dataset.smNew==="national").click(); await new Promise(r=>setTimeout(r,80));
  ok(S().mode==="national" && d.querySelector("#modal h3").textContent.includes("Nationalteam einrichten"), "Neues Nationalteam direkt aus dem Wechsler");
  w.eval("closeModal()");
  ({w,d,errs,S} = await boot());
  w.eval("openSaveMenu()");
  ok(smM().querySelector("[data-sm-del]").disabled, "Letzter Spielstand kann nicht gelöscht werden");
  smM().querySelector("[data-sm-classic]").click();
  ok(d.querySelector("#modal").textContent.includes("Spielstände") && smM().hidden, "Link zur klassischen Verwaltung");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[55] Versionen 10.2 – 10.3: Tastenkürzel-Manager & Nationalteam-Pflege");
  ({w,d,errs,S} = await boot());
  const kdH = (k, extra, target) => (target || w.document).dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({key:k, bubbles:true, cancelable:true}, extra || {})));
  const hkStoreH = () => JSON.parse(w.localStorage.getItem("fm27_hotkeys") || "{}");
  const d0H = S().club.ingameDate;
  kdH("t"); ok(S().club.ingameDate > d0H, "Standard: T = +1 Tag");
  kdH("T", {shiftKey:true}); const d1H = S().club.ingameDate;
  ok((new Date(d1H) - new Date(d0H)) / 86400000 === 8, "Shift+T = +7 Tage");
  kdH("3"); ok(d.querySelector("#view-tactics.active"), "3 = Taktik");
  d.querySelector("#btnHotkeys").click();
  ok(d.querySelector("#modal h3").textContent==="Tastenkürzel" && d.querySelectorAll("#modal [data-hk]").length===29, "Zahnrad → Tastenkürzel: 29 Aktionen (inkl. Hub, KI-Prompt, Tagebuch, Karriere-Begleiter)");
  ok(d.querySelector('#modal [data-hk="nextDay"]').textContent.trim()==="T" && d.querySelector('#modal [data-hk="theme"]').textContent.includes("—"), "Aktuelle Belegung sichtbar, neue Aktionen ohne Kürzel");
  d.querySelector('#modal [data-hk="nextDay"]').click();
  ok(d.querySelector('#modal [data-hk="nextDay"]').classList.contains("capturing"), "Klick → 'Taste drücken …'");
  kdH("d");
  ok(hkStoreH().nextDay==="d" && d.querySelector('#modal [data-hk="nextDay"]').textContent.trim()==="D", "Neue Taste D gespeichert");
  d.querySelector('#modal [data-hk="saves"]').click(); kdH("d");
  ok(hkStoreH().saves==="d" && hkStoreH().nextDay==="" && d.querySelector("#toastMsg").textContent.includes("dort entfernt"), "Konflikt: D wechselt zu 'Spielstand wechseln', beim Datum entfernt (mit Hinweis)");
  d.querySelector('#modal [data-hk="nextDay"]').click(); kdH("Escape");
  ok(!d.querySelector("#modal .hk-btn.capturing") && d.querySelector("#modalOverlay").classList.contains("active"), "Esc bricht nur die Aufnahme ab, der Dialog bleibt offen");
  d.querySelector('#modal [data-hk="nextDay"]').click(); kdH("Enter");
  ok(d.querySelector("#toastMsg").textContent.includes("reserviert"), "Reservierte Taste (Enter) wird abgelehnt");
  d.querySelector('#modal [data-hk="nextDay"]').click(); kdH("g");
  d.querySelector('#modal [data-hk="theme"]').click(); kdH("h", {altKey:true});
  ok(hkStoreH().theme==="alt+h" && d.querySelector('#modal [data-hk="theme"]').textContent.includes("Alt"), "Kombination Alt+H für Hell/Dunkel");
  d.querySelector('#modal [data-hk="print"]').click(); kdH("Delete");
  ok(hkStoreH().print==="", "Entf entfernt ein Kürzel");
  d.querySelector(`#modal [data-hk-reset="print"]`).click();
  ok(hkStoreH().print===undefined, "↺ setzt einzeln zurück (P)");
  d.querySelector("[data-modal-save]").click();
  const dgH = S().club.ingameDate; kdH("t"); ok(S().club.ingameDate===dgH, "T macht nichts mehr");
  kdH("g"); ok(S().club.ingameDate > dgH, "G = +1 Tag");
  ok(d.querySelector('[data-hk-hint="layout"]').textContent==="L" && d.querySelector('[data-hk-hint="palette"]').textContent==="Strg K", "Menü-Hinweise zeigen die aktuellen Kürzel");
  const th0H = w.eval("layout.theme"); kdH("h", {altKey:true}); ok(w.eval("layout.theme") !== th0H, "Alt+H schaltet Hell/Dunkel");
  kdH("d"); ok(!d.querySelector("#saveMenu").hidden, "D öffnet jetzt den Spielstand-Wechsler"); w.eval("closeSaveMenu()");
  kdH("s"); ok(!d.querySelector("#saveMenu") || d.querySelector("#saveMenu").hidden, "S ist frei (nicht mehr belegt)");
  kdH("?"); ok(d.querySelector("#modal").textContent.includes("Spielstand wechseln") && d.querySelector("#modal .kbd-table").innerHTML.includes("<kbd>D</kbd>"), "Übersicht (?) zeigt die eigenen Kürzel");
  w.eval("closeModal()");
  w.eval("navigate('squad')"); d.querySelector("#squadSearch").focus();
  kdH("k", {ctrlKey:true}, d.querySelector("#squadSearch"));
  ok(d.querySelector("#cmdOverlay").classList.contains("active"), "Strg+K öffnet die Palette auch beim Tippen");
  w.eval("closeCmd()");
  { const before = S().club.ingameDate; d.querySelector("#squadSearch").focus(); kdH("g", {}, d.querySelector("#squadSearch"));
    ok(S().club.ingameDate===before, "Einzeltasten lösen im Eingabefeld nichts aus (G tippt, springt nicht im Datum)"); }
  const dumpHH = {}; for(let i=0;i<w.localStorage.length;i++){ const k = w.localStorage.key(i); dumpHH[k] = w.localStorage.getItem(k); }
  ({w,d,errs,S} = await boot(ls=>Object.entries(dumpHH).forEach(([k,v])=>ls.setItem(k,v))));
  const drH = S().club.ingameDate; kdH("g"); ok(S().club.ingameDate > drH, "Eigene Kürzel überstehen das Neuladen");
  d.querySelector("#btnHotkeys").click(); d.querySelector("#modal [data-hk-all]").click();
  ok(!w.localStorage.getItem("fm27_hotkeys") && d.querySelector('#modal [data-hk="nextDay"]').textContent.trim()==="T", "Alle zurücksetzen");
  d.querySelector("#toastUndoBtn").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_hotkeys")).nextDay==="g", "… rückgängig machbar");
  kdH("Escape");
  ok(!d.querySelector("#modalOverlay").classList.contains("active") && w.eval("hkCapture")===null, "Esc schließt den Dialog, keine hängende Aufnahme");
  ok(w.eval("storageEntries()").find(e=>e.key==="fm27_hotkeys").kind==="setting", "Speicher-Hausmeister kennt die Kürzel");
  // --- national team care ---
  ({w,d,errs,S} = await boot());
  w.eval(`(()=>{ const f = freshState("empty"); f.mode = "national"; f.club.name = "Deutschland"; f.national = {country:"Deutschland", code:"GER", colors:["#000000","#DD0000","#FFCE00"], accent:"#FFCE00"};
    f.players = [["Neuer","TW","FC Bayern"],["Rüdiger","IV","Real Madrid"],["Tah","IV","Bayer Leverkusen"],["Wirtz","OM","Bayer Leverkusen"],["Havertz","ST","FC Arsenal"]].map(([n,pos,c],i)=>({id:"p"+i, name:n, pos, homeClub:c, nominated:i<4}));
    switchSlot(createSlot("DFB", sanitizeState(f))); navigate("home"); })()`);
  ok(d.querySelector('[data-panel="goals"] .card-head h2').textContent==="Verbandsziele" && !d.querySelector("#squadPlanSummary").textContent.includes("Gehälter"), "Nationalteam: 'Verbandsziele', keine Gehälter im Kaderplan");
  const accentNowH = () => w.document.documentElement.style.getPropertyValue("--accent").trim().toLowerCase();
  ok(accentNowH()==="#ffce00", "Akzent Gold");
  w.eval("openSettingsModal()");
  ok(d.querySelector('#modal [data-f="transferBudget"]').closest(".field-row").hidden && d.querySelector('#modal [data-f="winSummer"]').closest(".field-row").hidden, "Einstellungen: Budgets und Transferfenster ausgeblendet");
  const tb0H = S().club.transferBudget; d.querySelector("[data-modal-save]").click();
  ok(S().club.transferBudget===tb0H, "… Werte bleiben beim Speichern erhalten");
  ok(accentNowH()==="#ffce00", "Nach dem Dialog bleibt der Akzent Gold (Fehler behoben)");
  // camps
  d.querySelector('#natNomBox [data-nat="saveCamp"]').click();
  ok(d.querySelector('#modal [data-f="name"]').value.includes("Lehrgang"), "Lehrgang speichern: Name vorgeschlagen");
  d.querySelector('#modal [data-f="name"]').value = "März-Lehrgang"; d.querySelector("[data-modal-save]").click();
  ok(S().national.camps.length===1 && S().national.camps[0].ids.length===4 && d.querySelector("#natNomBox .nat-camps").textContent.includes("März-Lehrgang"), "Gespeichert und im Portal gelistet");
  const txtH = await w.eval("natCopySquad()");
  ok(txtH.includes("Tor: Neuer (FC Bayern)") && txtH.includes("Abwehr: Rüdiger (Real Madrid), Tah (Bayer Leverkusen)") && txtH.includes("Mittelfeld: Wirtz") && !txtH.includes("Havertz"), "Kader kopieren: nach Mannschaftsteilen mit Stammverein");
  d.querySelector('#natNomBox [data-nat="reset"]').click();
  ok(S().players.every(p=>!p.nominated) && d.querySelector("#natNomValue").textContent.startsWith("0"), "Nominierung zurückgesetzt");
  d.querySelector(`#natNomBox [data-nat="load:${S().national.camps[0].id}"]`).click();
  ok(S().players.filter(p=>p.nominated).length===4, "Lehrgang geladen: 4 Nominierte zurück");
  w.eval("navigate('squad')");
  ok(d.querySelector('#squadTbody tr[data-id="p0"] .nom-count').textContent==="1×" && !d.querySelector('#squadTbody tr[data-id="p4"] .nom-count'), "Pool: '1×' bei Spielern aus gespeicherten Lehrgängen");
  const qSH = d.querySelector("#squadSearch"); qSH.value = "leverkusen"; qSH.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(d.querySelectorAll("#squadTbody tr[data-id]").length===2, "Suche nach Stammverein 'leverkusen' findet Tah und Wirtz");
  w.eval("navigate('home')");
  d.querySelector(`#natNomBox [data-nat="del:${S().national.camps[0].id}"]`).click();
  ok(S().national.camps.length===0, "Lehrgang gelöscht");
  d.querySelector("#toastUndoBtn").click();
  ok(S().national.camps.length===1, "… rückgängig machbar");
  w.eval("openNationalModal(false)"); d.querySelector("[data-modal-save]").click();
  ok(S().national.camps.length===1, "Nationalteam-Einstellungen speichern lässt die Lehrgänge unberührt");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[56] Release 11.0: Export/Import-Rundreisen & Datenstabilität");
  ({w,d,errs,S} = await boot());
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  const captureR = fn => { let out = null; const B = w.Blob; w.Blob = function(parts, o){ out = parts.join(""); return new B(parts, o); }; try{ fn(); } finally { w.Blob = B; } return out; };
  const canonR = x => JSON.stringify(x);
  // a "full" save: sample + custom fields + journey + loan backpack + camps-less club
  w.eval(`(()=>{ state.customFields.push({id:"hg", name:"Homegrown", type:"bool", options:[], areas:["squad","scouting"]}); state.players[0].custom = {hg:true};
    const p = state.players.find(x=>x.name==="Aurelien Faye"); p.valueMin = 12000000; p.valueMax = 15000000; p.nation = "Frankreich"; p.birthDate = "1999-08-14";
    state.loans.push({id:"lb", name:p.name, pos:p.pos, age:p.age, club:"FC Leih", until:"06/2028", apps:3, minutes:0, playtime:"ok", clause:"recall", recallCheck:false, note:"10 Spiele zugesagt", player:JSON.parse(JSON.stringify(p)), playerHistory:[]});
    state.players = state.players.filter(x=>x.id!==p.id);
    state.journey = sanitizeJourney({active:true, profile:{name:"Test-Trainer"}, bank:{giro:1000, savings:500}, goals:[{name:"Auto", cat:"car", target:20000, saved:500}], diary:[{date:"2027-03-01", title:"x", text:"y"}]});
    state = sanitizeState(state); saveState(); })()`);
  // 1) sanitizing twice must not change anything (otherwise data drifts on every save/import)
  const driftOfR = expr => w.eval(`(()=>{ const a = ${expr}; const b = sanitizeState(JSON.parse(JSON.stringify(a))); const c = sanitizeState(JSON.parse(JSON.stringify(b)));
    const A = JSON.stringify(b), B = JSON.stringify(c); if(A === B) return ""; let i = 0; while(A[i] === B[i]) i++; return A.slice(Math.max(0,i-80), i+60) + " ⟶ " + B.slice(Math.max(0,i-80), i+60); })()`);
  ok(driftOfR("state")==="", "Bereinigung stabil: aktueller Spielstand (inkl. Journey, Leih-Rucksack, eigene Felder) "+driftOfR("state"));
  ok(driftOfR('freshState("sample")')==="", "Bereinigung stabil: Beispiel-Karriere "+driftOfR('freshState("sample")'));
  ok(driftOfR('freshState("empty")')==="", "Bereinigung stabil: leerer Spielstand "+driftOfR('freshState("empty")'));
  ok(driftOfR('(()=>{ const f = freshState("sample"); f.mode = "national"; f.national = {country:"X", code:"XXX", colors:["#000000","#ffffff","#ff0000"], camps:[{name:"L", ids:["a"]}]}; f.players.forEach((p,i)=>{ p.caps = i; p.homeClub = "C"+i; p.nominated = i%2===0; }); return f; })()')==="", "Bereinigung stabil: Nationalteam");
  // 2) save export → import as NEW save: identical
  const beforeR = canonR(S());
  const expR = captureR(()=>d.querySelector("#btnExport").click());
  ok(expR && JSON.parse(expR).data && JSON.parse(expR).schemaVersion, "JSON-Export erzeugt eine Datei mit Schema-Version");
  const nSlotsR = w.eval("slotIndex.slots.length");
  w.eval(`handleBackupText(${JSON.stringify(expR)})`);
  d.querySelector('#modal [data-imp="new"]').click();
  ok(w.eval("slotIndex.slots.length")===nSlotsR+1 && canonR(S())===beforeR, "Rundreise Export → Import (neuer Spielstand): Zeichen für Zeichen identisch");
  // 3) import REPLACE + undo
  w.eval(`state.players[0].note = "geändert"; saveState()`);
  const changedR = canonR(S());
  w.eval(`handleBackupText(${JSON.stringify(expR)})`); d.querySelector('#modal [data-imp="replace"]').click();
  ok(canonR(S())===beforeR, "Import 'ersetzen': identisch zum Export");
  d.querySelector("#toastUndoBtn").click();
  ok(canonR(S())===changedR, "… und rückgängig machbar");
  // 4) national save round trip
  w.eval(`(()=>{ const f = freshState("sample"); f.mode = "national"; f.club.name = "Deutschland"; f.national = {country:"Deutschland", code:"GER", colors:["#000000","#DD0000","#FFCE00"], accent:"#FFCE00", camps:[{id:"c1", name:"März", date:"2027-03-10", ids:[f.players[0].id]}]};
    f.players.forEach((p,i)=>{ p.caps = i*3; p.intGoals = i; p.homeClub = "Verein " + i; p.nominated = i < 10; }); switchSlot(createSlot("DFB", sanitizeState(f))); })()`);
  const natExpR = captureR(()=>d.querySelector("#btnExport").click()), natBeforeR = canonR(S());   // compare with the saved/exported state (the first save starts each player's history)
  w.eval(`handleBackupText(${JSON.stringify(natExpR)})`); d.querySelector('#modal [data-imp="new"]').click();
  ok(canonR(S())===natBeforeR && S().mode==="national" && S().national.camps.length===1, "Rundreise Nationalteam: Modus, Pool-Spalten, Lehrgänge identisch");
  // 5) CSV export → FM import: nothing may change
  w.eval("switchSlot(slotIndex.slots[0].id)");
  const csvR = w.eval("exportSquadCSV()");
  const difR = w.eval(`(()=>{ const rows = parseTable(${JSON.stringify(csvR)}); const r = diffImport(buildImportRecords(rows.slice(1), guessMapping(rows[0]), "year").recs); return {changed:r.changed.map(x=>x.rec.name + ": " + x.changes.map(c=>c.field + " " + JSON.stringify(c.from) + "→" + JSON.stringify(c.to)).join(", ")), added:r.added ? r.added.length : (r.new || []).length, unchanged:r.unchanged.length}; })()`);
  ok(difR.changed.length===0 && difR.unchanged===S().players.length, "Rundreise CSV-Export → FM-Import: keine Änderung an "+S().players.length+" Spielern "+(difR.changed.slice(0,3).join(" | ")));
  // 6) Umzug (allR data) → empty browser → everything back
  const allR = w.eval("JSON.stringify((()=>{ const o = {}; for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(k.startsWith('fm27')) o[k] = localStorage.getItem(k); } return o; })())");
  const umzugR = captureR(()=>w.eval("exportAll()"));
  ok(umzugR && JSON.parse(umzugR).kind==="full", "'Alles exportieren (Umzug)' erzeugt eine Umzugsdatei");
  ({w,d,errs,S} = await boot());
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  w.location.reload = ()=>{};
  w.eval(`importFullBackup(${umzugR})`);
  if(d.querySelector("#modal [data-modal-save]") && d.querySelector("#modalOverlay").classList.contains("active")) d.querySelector("#modal [data-modal-save]").click();
  const afterR = JSON.parse(w.eval("JSON.stringify((()=>{ const o = {}; for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(k.startsWith('fm27')) o[k] = localStorage.getItem(k); } return o; })())"));
  const allOR = JSON.parse(allR);
  const missingKR = Object.keys(allOR).filter(k=>afterR[k] === undefined), diffKR = Object.keys(allOR).filter(k=>afterR[k] !== undefined && afterR[k] !== allOR[k] && !["fm27_welcome_done","fm27_storage_clean","fm27_seen_version"].includes(k));
  ok(missingKR.length===0 && diffKR.length===0, `Umzug: alle ${Object.keys(allOR).length} Einträge 1:1 zurück ${missingKR.concat(diffKR).slice(0,4).join(", ")}`);
  // 7) old formats
  ({w,d,errs,S} = await boot());
  w.eval(`handleBackupText(JSON.stringify({players:[{name:"Alt", pos:"ST", age:25, salary:100000, contractUntil:2028}], club:{name:"Altverein"}, version:1}))`);
  ok(d.querySelector("#modal").textContent.includes("Altverein") && d.querySelector('#modal [data-imp="new"]'), "Uralt-Format (Version 1, ohne Hülle) wird erkannt");
  d.querySelector('#modal [data-imp="new"]').click();
  ok(S().club.name==="Altverein" && S().players[0].name==="Alt" && S().version===w.eval("SCHEMA_VERSION"), "… und auf das aktuelle Schema gehoben");
  // 8) broken / foreign files never touch the data
  const safeBeforeR = canonR(S());
  for(const [label, text] of [["kein JSON","das ist kein json"],["leeres Objekt","{}"],["Array","[1,2,3]"],["fremde App",JSON.stringify({app:"Excel", rows:[1]})],["null","null"],["Zahl","42"]]){
    w.eval(`closeModal(); handleBackupText(${JSON.stringify(text)})`);
    const t = d.querySelector("#modal").textContent;
    ok(canonR(S())===safeBeforeR && d.querySelector("#modalOverlay").classList.contains("active") && !d.querySelector('#modal [data-imp="replace"]'), `Kaputte Datei (${label}): Fehlermeldung, Daten unverändert`);
  }
  w.eval("closeModal()");
  // 9) restore point round trip
  w.eval("saveState()");   // a save that is in use has been saved before (the first save starts each player's history)
  w.eval(`createRestorePoint("Release-Test", true)`); const rpBeforeR = canonR(S());
  w.eval(`state.players.splice(0, 5); state.club.name = "Kaputt"; saveState()`);
  w.eval(`restoreFromPoint(readRestorePoints().find(r=>r.reason==="Release-Test").id)`);
  ok(canonR(S())===rpBeforeR, "Wiederherstellungspunkt: Zustand exakt zurück");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[57] Release 11.0: vom Crawler gefundene Abstürze");
  ({w,d,errs,S} = await boot());
  // set-piece zone points to a player who leaves in this session
  const zp = S().players[3];
  w.eval(`(()=>{ const sp = state.setPieces[state.ui.spType || "cornerL"] || Object.values(state.setPieces)[0]; const z = Object.keys(sp.zones)[0] || "nearPost"; sp.zones[z] = "${zp.id}"; saveState(); })()`);
  w.eval(`state.players = state.players.filter(p=>p.id!=="${zp.id}")`);   // e.g. sold via another path, no reload
  let crashed = null; try{ w.eval("navigate('tactics'); state.ui.tacticsTab = 'setpieces'; renderTactics()"); }catch(e){ crashed = e.message; }
  ok(!crashed && d.querySelector("#spBoard svg"), "Taktik: Standard-Zone mit entferntem Spieler stürzt nicht mehr ab "+(crashed||""));
  // sale points to a player who leaves in this session
  ({w,d,errs,S} = await boot());
  const saleP = S().sales[0].playerId;
  w.eval(`state.players = state.players.filter(p=>p.id!=="${saleP}")`);
  crashed = null; try{ w.eval("state.ui.transferTab='sell'; navigate('recruitment'); renderRecruitment()"); }catch(e){ crashed = e.message; }
  ok(!crashed && !d.querySelector(`#salesTbody [data-id="${S().sales[0].id}"]`), "Verkaufsliste: verwaister Eintrag wird ausgeblendet statt abzustürzen "+(crashed||""));
  crashed = null; try{ w.eval(`completeSale(state.sales.find(x=>x.playerId==="${saleP}"))`); }catch(e){ crashed = e.message; }
  ok(!crashed && !w.eval(`state.sales.some(x=>x.playerId==="${saleP}")`) && d.querySelector("#toastMsg").textContent.includes("nicht mehr im Kader"), "Verkauf abschließen bei verwaistem Eintrag: Hinweis und Eintrag entfernt");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[58] Version 11.1: Sicherungsdateien übersichtlich");
  ({w,d,errs,S} = await boot());
  w.eval(`(()=>{ slotIndex.slots[0].name = "Test"; writeIndex(); createSlot("Test_2", freshState("empty")); createSlot("Ohne Sicherung", freshState("empty")); })()`);
  const TB = iso => new Date(iso).getTime();
  const filesBB = [["fm27_Test_aktuell.json","2026-09-30T20:00"],["fm27_Test_2026-09-30.json","2026-09-30T20:00"],["fm27_Test_2026-09-29.json","2026-09-29T10:00"],
    ["fm27_Test_2_aktuell.json","2026-09-30T21:00"],["fm27_Test_2_2026-09-30.json","2026-09-30T21:00"],["fm27_Alt_aktuell.json","2026-09-20T10:00"],["fm27_Alt_2026-09-20.json","2026-09-20T10:00"],
    ["fm27_journey_aktuell.json","2026-09-01T10:00"],["fm27_Test_2026-27.json","2026-09-28T10:00"]].map(([name, iso])=>({name, size:2048, modified:TB(iso)}));
  const gB = w.eval(`groupBackupFiles(${JSON.stringify(filesBB)})`);
  const gsB = n => gB.saves.find(x=>x.sum.name===n);
  ok(gsB("Test").current.name==="fm27_Test_aktuell.json" && gsB("Test").daily.length===2 && gsB("Test_2").files.length===2, "'Test' und 'Test_2' bekommen jeweils nur ihre eigenen Dateien");
  ok(gsB("Test").daily[0].name.endsWith("2026-09-30.json"), "Tageskopien: neueste zuerst");
  ok(!gsB("Ohne Sicherung").current && gB.saves[gB.saves.length-1].sum.name==="Ohne Sicherung", "Spielstand ohne Sicherung erkannt und ans Ende sortiert");
  ok(gB.saves[0].sum.active, "Aktiver Spielstand zuerst");
  ok(gB.orphans.length===1 && gB.orphans[0].name==="Alt" && gB.orphans[0].files.length===2, "Dateien eines gelöschten Spielstands ('Alt') als eigene Gruppe");
  ok(gB.journey.length===1 && gB.other.length===1 && gB.other[0].name==="fm27_Test_2026-27.json", "Alte Journey-Datei und manueller Export ('..._2026-27.json') getrennt einsortiert");
  ok(w.eval(`bkWhen(Date.now() - 60000)`).startsWith("heute,") && w.eval(`bkWhen(Date.now() - 86400000)`).startsWith("gestern,"), "Datumsangaben 'heute, …' und 'gestern, …'");
  // rendering + delete with a stubbed folder
  w.showDirectoryPicker = ()=>{};
  w.eval(`(()=>{ const store = new Map(${JSON.stringify(filesBB)}.map(f=>[f.name, f]));
    backupDir = {name:"Backups", async *entries(){ for(const [name, f] of store) yield [name, {kind:"file", getFile: async ()=>({size:f.size, lastModified:f.modified, text: async ()=>"{}"})}]; }, async removeEntry(n){ store.delete(n); }};
    window.__store = store; backupPerm = "granted"; const c = backupCfg(); c.enabled = true; saveBackupCfg(c);
    setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'backup'; navigate('admin'); })()`);
  await new Promise(r=>setTimeout(r,60));
  ok(d.querySelectorAll("#folderBackupList .bk-card:not(.bk-global)").length===3 && d.querySelector("#folderBackupList .bk-global") && d.querySelector("#folderBackupList .bk-summary").textContent.includes("2 von 3"), "Ansicht: 3 Spielstands-Karten + Hub & Tagebuch, '2 von 3 Spielständen gesichert'");
  ok(d.querySelector("#folderBackupList .bk-card.missing [data-bk='all']"), "Ungesicherter Spielstand: 'Jetzt alle sichern'");
  const delBtnB = [...d.querySelectorAll("#folderBackupList [data-bk-del]")].find(b=>b.dataset.bkDel.includes("fm27_Alt_"));
  delBtnB.click();
  ok(d.querySelector("#modal").textContent.includes("endgültig") && d.querySelector("#modal").textContent.includes("fm27_Alt_aktuell.json"), "Löschen fragt nach und nennt die Dateien");
  d.querySelector("[data-modal-save]").click(); await new Promise(r=>setTimeout(r,80));
  ok(!w.eval("window.__store.has('fm27_Alt_aktuell.json')") && !w.eval("window.__store.has('fm27_Alt_2026-09-20.json')") && w.eval("window.__store.has('fm27_Test_aktuell.json')"), "Nur die Dateien ohne Spielstand gelöscht – Sicherungen bestehender Spielstände unberührt");
  ok(![...d.querySelectorAll("#folderBackupList [data-bk-del]")].some(b=>b.dataset.bkDel.includes("fm27_Test_")), "Für bestehende Spielstände gibt es keinen Löschknopf");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[59] Version 11.2: Speicher in der Browser-Datenbank (IndexedDB)");
  const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
  const bootDB_ = async (factory, ls, opts) => {        // like boot(), but with a browser database and a given localStorage content
    const dom = new JSDOM(html, {url:"http://localhost/", runScripts:"dangerously", pretendToBeVisual:true});
    const w = dom.window, errs = [];
    w.addEventListener("error", e=>errs.push(e.message));
    w.print = ()=>{}; w.confirm = ()=>true; w.scrollTo = ()=>{}; w.HTMLElement.prototype.scrollIntoView = function(){};
    if(factory) w.indexedDB = factory; w.IDBKeyRange = IDBKeyRange;
    Object.entries(ls || {}).forEach(([k,v])=>w.localStorage.setItem(k, v));
    if(!w.localStorage.getItem("fm27_welcome_done")) w.localStorage.setItem("fm27_welcome_done", "1");
    if(opts && opts.before) opts.before(w);
    injectApp(w);
    for(let i = 0; i < 100 && !w.eval("typeof state !== 'undefined' && state !== null && typeof slotIndex === 'object' && !!slotIndex"); i++) await new Promise(r=>setTimeout(r,20));
    await new Promise(r=>setTimeout(r,40));
    return {w, d:w.document, errs};
  };
  const idbAll_ = async factory => new Promise((res, rej)=>{ const r = factory.open("fm27-dashboard", 1); r.onsuccess = ()=>{ const db = r.result, tx = db.transaction("kv", "readonly"), os = tx.objectStore("kv");
    const out = {}; const c = os.openCursor(); c.onsuccess = ()=>{ const cur = c.result; if(cur){ out[cur.key] = cur.value; cur.continue(); } else { db.close(); res(out); } }; }; r.onerror = ()=>rej(r.error); });
  const lsDump_ = w => { const o = {}; for(let i=0;i<w.localStorage.length;i++){ const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
  // a real 11.1 installation: data in localStorage
  ({w,d,errs,S} = await boot());
  w.eval(`createSlot("Nationalteam", freshState("sample")); state.players[0].note = "aus 11.1"; saveState(); localStorage.setItem("fm27_hotkeys", JSON.stringify({nextDay:"g"}));`);
  const legacy_ = lsDump_(w), legacyKeys_ = Object.keys(legacy_).filter(k=>k.startsWith("fm27") && !["fm27_backend","fm27_theme_hint","fm27_start_hint"].includes(k));   // the theme and start hints stay outside on purpose
  // 1st start with 11.2 → phase 1
  const fac_ = new IDBFactory();
  let A_ = await bootDB_(fac_, legacy_);
  ok(A_.w.eval("store.mode")==="idb" && A_.w.eval("store.notice").startsWith("migrated:"), "1. Start: Daten in die Datenbank umgezogen ("+A_.w.eval("store.notice")+")");
  let db1_ = await idbAll_(fac_);
  // (the migration itself compared every value – afterwards the app saves as usual, e.g. "last saved" timestamps)
  ok(legacyKeys_.every(k=>k in db1_) && legacyKeys_.filter(k=>k.startsWith("fm27_slot_")).every(k=>JSON.stringify(JSON.parse(db1_[k]).players)===JSON.stringify(JSON.parse(legacy_[k]).players)) && db1_["fm27_hotkeys"]===legacy_["fm27_hotkeys"],
     `Alle ${legacyKeys_.length} Einträge in der Datenbank, Spieler und Kürzel identisch`);
  ok(A_.w.localStorage.getItem("fm27_backend")==="idb-pending" && legacyKeys_.every(k=>A_.w.localStorage.getItem(k) === legacy_[k]), "Phase 1: alte Daten bleiben vorerst unangetastet im localStorage");
  ok(A_.w.eval("state.players[0].note")==="aus 11.1" && A_.w.eval("slotIndex.slots.length")===2 && A_.w.eval("hotkeyMap().nextDay")==="g", "App läuft mit den umgezogenen Daten (Notiz, 2 Spielstände, Kürzel)");
  await new Promise(r=>setTimeout(r,1300));
  ok(A_.d.querySelector("#toastMsg").textContent.includes("umgezogen"), "Hinweis: 'Daten in die Browser-Datenbank umgezogen'");
  // work in 11.2 → goes to the database only
  A_.w.eval(`state.players[0].note = "in 11.2 geändert"; saveState()`);
  await A_.w.eval("store.flush()");
  const activeId_ = A_.w.eval("slotIndex.active");
  db1_ = await idbAll_(fac_);
  ok(JSON.parse(db1_["fm27_slot_" + activeId_]).players[0].note==="in 11.2 geändert" && JSON.parse(A_.w.localStorage.getItem("fm27_slot_" + activeId_)).players[0].note==="aus 11.1", "Änderungen landen in der Datenbank (nicht mehr im localStorage)");
  // 2nd start → phase 2 (database complete → old copy removed)
  const ls2_ = lsDump_(A_.w);
  let B_ = await bootDB_(fac_, ls2_);
  ok(B_.w.eval("store.mode")==="idb" && B_.w.eval("store.notice").startsWith("cleaned:") && B_.w.localStorage.getItem("fm27_backend")==="idb", "2. Start: Datenbank vollständig → alte Kopie entfernt");
  ok(Object.keys(lsDump_(B_.w)).filter(k=>k.startsWith("fm27_") && !["fm27_backend","fm27_welcome_done","fm27_theme_hint","fm27_start_hint"].includes(k)).length===0 && B_.w.localStorage.getItem("fm27_theme_hint"), "localStorage danach leer bis auf die winzigen Design- und Start-Hinweise (Speichergrenze entschärft)");
  ok(B_.w.eval("state.players[0].note")==="in 11.2 geändert", "Die neueste Änderung ist da");
  // 3rd start: normal operation
  const C_ = await bootDB_(fac_, lsDump_(B_.w));
  ok(C_.w.eval("store.mode")==="idb" && C_.w.eval("store.notice")==="" && C_.w.eval("state.players[0].note")==="in 11.2 geändert" && C_.w.eval("slotIndex.slots.length")===2, "3. Start: Normalbetrieb aus der Datenbank");
  ok(C_.w.eval("storageUsage().backend")==="idb", "Speicheranzeige kennt den neuen Speicher");
  // fresh install directly in the database
  const fac2_ = new IDBFactory();
  const F_ = await bootDB_(fac2_, {});
  ok(F_.w.eval("store.mode")==="idb" && /^idb/.test(F_.w.localStorage.getItem("fm27_backend") || ""), "Neuinstallation: direkt in der Datenbank");
  await F_.w.eval("store.flush()");
  ok(Object.keys(await idbAll_(fac2_)).some(k=>k.startsWith("fm27_slot_")) && !Object.keys(lsDump_(F_.w)).some(k=>k.startsWith("fm27_slot_")), "… Spielstand liegt in der Datenbank, nicht im localStorage");
  // database not available: plain fallback, but never silent when data lives in the database
  const broken_ = { open(){ throw new Error("kaputt"); } };
  const G_ = await bootDB_(broken_, {});
  ok(G_.w.eval("store.mode")==="local" && G_.w.eval("state") && G_.errs.length===0, "Keine Datenbank verfügbar: läuft mit localStorage weiter");
  const H_ = await bootDB_(broken_, {fm27_backend:"idb"});
  await new Promise(r=>setTimeout(r,900));
  ok(H_.w.eval("store.notice")==="unavailable-data" && H_.d.querySelector("#toastMsg").textContent.includes("nicht erreichbar"), "Daten liegen in der Datenbank, die gerade fehlt: deutlicher Hinweis statt stiller leerer Start");
  ok(Object.keys(await idbAll_(fac_)).length > 0, "… und die Datenbank selbst bleibt unberührt");
  // Umzug file into a database installation, reload waits for the writes
  const I_ = await bootDB_(fac_, lsDump_(C_.w));
  I_.w.URL.createObjectURL = ()=>"blob:x"; I_.w.URL.revokeObjectURL = ()=>{};
  let umz_ = null; const Bl_ = I_.w.Blob; I_.w.Blob = function(parts, o){ umz_ = parts.join(""); return new Bl_(parts, o); }; I_.w.eval("exportAll()"); I_.w.Blob = Bl_;
  const J_ = await bootDB_(new IDBFactory(), {});
  let reloaded_ = false; J_.w.eval("reloadApp = ()=>{ store.flush().then(()=>{ window.__reloaded = true; }); }");
  J_.w.eval(`importFullBackup(${umz_})`);
  if(J_.d.querySelector("#modalOverlay").classList.contains("active")) J_.d.querySelector("#modal [data-modal-save]").click();
  for(let i=0;i<50 && !J_.w.eval("window.__reloaded"); i++) await new Promise(r=>setTimeout(r,20));
  ok(J_.w.eval("window.__reloaded===true") && J_.w.eval("store.getItem('fm27_hotkeys')") && J_.w.eval("slotIndex") && J_.w.eval("store._pending")===0, "Umzugsdatei in eine Datenbank-Installation: Neuladen erst, wenn alles geschrieben ist");
  // flush semantics
  const K_ = await bootDB_(new IDBFactory(), {});
  K_.w.eval(`for(let i=0;i<30;i++) store.setItem("fm27_test_"+i, "x".repeat(1000))`);
  const pend_ = K_.w.eval("store._pending"); await K_.w.eval("store.flush()");
  ok(pend_ > 0 && K_.w.eval("store._pending")===0, `flush() wartet auf ${pend_} offene Schreibvorgänge`);
  ok([A_,B_,C_,F_,G_,I_,J_,K_].every(x=>x.errs.length===0), "keine Laufzeitfehler");

  console.log("\n[60] Version 11.3.x: Code in Teilen, Lader, Fokus Web-App");
  { const swText = require("fs").readFileSync(DIR+"sw.js","utf8"), parts = require("fs").readdirSync(DIR+"js").filter(f=>f.endsWith(".js")).sort();
    ok(SCRIPTS.length===parts.length && parts.every((f,i)=>SCRIPTS[i]==="js/"+f), `index.html lädt alle ${parts.length} Teile in der richtigen Reihenfolge (über den Lader)`);
    ok(parts.every(f=>swText.includes(`"./js/${f}"`) && swText.includes(`"./${f}"`)) && !swText.includes('"./app.js"'), "Offline-Modul hält alle Teile für beide Ablagen vor (js/ und Hauptverzeichnis)");
    const pkg = JSON.parse(require("fs").readFileSync(DIR+"package.json","utf8"));
    const appV = js.match(/APP_VERSION = "([^"]+)"/)[1], full = /-/.test(appV) ? appV : appV.split(".").concat(["0","0"]).slice(0,3).join(".");   // previews: "12.0.0-vorschau.1"
    ok(pkg.version===full, `Versionsnummer App ${appV} = package.json`);
    ok(APP_PARTS.build===appV && js.includes(`window.FM27_BUILD = "${appV}";`), `Versionsstempel: index.html (${APP_PARTS.build}) = Programmdateien = App`);
    ok(!require("fs").existsSync(DIR+"src-tauri") && !require("fs").existsSync(DIR+"scripts") && !require("fs").existsSync(DIR+".github/workflows/desktop.yml") && !pkg.devDependencies["@tauri-apps/cli"] && !/IS_DESKTOP|__TAURI/.test(js),
       "Fokus Web-App: keine Desktop-Reste mehr (Tauri, Skripte, Workflow, Erkennung)"); }
  ({w,d,errs,S} = await boot());
  w.eval("window.FM27_FLAT = true; setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'health'; navigate('admin')");
  ok(!d.querySelector("#adminBody .flat-warn"), "Flache Ablage wird unterstützt: kein Warnhinweis mehr in der Datenprüfung");
  w.eval("layout.theme = 'light'; saveLayout(); applyTheme()");
  ok(w.localStorage.getItem("fm27_theme_hint")==="light", "Helles Design: Hinweis für den Start wird gesetzt");
  { const pre = /<script>(try\{var t=localStorage[^<]*)<\/script>/.exec(htmlRaw)[1];
    const dom = new JSDOM("<html><head></head><body></body></html>", {url:"http://localhost/", runScripts:"dangerously"});
    dom.window.localStorage.setItem("fm27_theme_hint","light"); dom.window.eval(pre);
    ok(dom.window.document.documentElement.getAttribute("data-theme")==="light", "Vor-Skript setzt das helle Design sofort (kein dunkles Aufblitzen)"); }
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[61] Gaming-Hub (11.4/11.5) · Spielebibliothek entfernt");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  const hubR6 = () => d.querySelector("#hubRoot");
  const kd6 = (k, extra, target) => (target || w.document).dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({key:k, bubbles:true, cancelable:true}, extra || {})));
  ok(hubR6() && !hubR6().hidden && d.querySelector("#hubRoot .hub2-hero") && d.querySelectorAll("#hubRoot .hub2-mod").length===2 && !d.querySelector('#hubRoot [data-hub-open="library"]'), "Hub: Weiterspielen + Karriere-Begleiter + Tagebuch – keine Bibliothek mehr");
  ok(typeof w.renderLibrary === "undefined" && !w.eval("HOTKEY_ACTIONS().some(a=>a[0]==='library')") && !/function (renderLibrary|gameModal|libPickNext)|showHub\("library"\)/.test(js), "Bibliothek vollständig entfernt (Code, Kürzel, Palette) – nur der Changelog erinnert an sie");
  kd6("t"); ok(!hubR6().hidden && S().club.ingameDate==="2027-03-12", "Im Hub lösen FM-Tasten nichts aus");
  d.querySelector('#hubRoot [data-hub-open="fm"]').click();
  ok(hubR6().hidden && d.querySelector("#view-home.active"), "'Weiterspielen' öffnet das Dashboard");
  kd6("h"); ok(!hubR6().hidden, "Taste H öffnet den Hub");
  d.querySelector('#hubRoot [data-hub="settings"]').click();
  ok(![...d.querySelectorAll('#modal [data-f="startPanel"] option')].some(o=>o.value==="library"), "Einstellungen: 'Beim Start öffnen' ohne Bibliothek"); w.eval("closeModal()");
  // kept library entries: own games stay until saved/deleted, samples vanish
  const own6 = {startPanel:"library", games:[{id:"g1", title:"Outer Wilds", status:"done", rating:5}, {id:"g2", title:"Celeste", status:"backlog"}, {id:"s1", title:"Elden Ring", sample:true}]};
  ({w,d,errs,S} = await boot(Object.assign(ls=>ls.setItem("fm27_hub", JSON.stringify(own6)), {hub:true})));
  ok(!hubR6().hidden && d.querySelector("#hubRoot .hub2-grid"), "Start war 'Bibliothek' → jetzt Hub");
  ok(d.querySelector("#hubRoot .hub-legacy").textContent.includes("2 eingetragenen Spiele"), "Hinweis: 2 eigene Spiele aufbewahrt (Beispielspiel entfernt)");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  const saved6 = w.eval("hubLegacySave()");
  ok(JSON.parse(saved6).kind==="spielebibliothek" && JSON.parse(saved6).games.map(g=>g.title).join()==="Outer Wilds,Celeste", "Als Datei sichern: beide Spiele mit allen Angaben");
  d.querySelector('#hubRoot [data-hub="legacyDelete"]').click();
  ok(JSON.parse(w.localStorage.getItem("fm27_hub")).games.length===0 && !d.querySelector("#hubRoot .hub-legacy"), "Endgültig löschen entfernt sie – Hinweis weg");
  d.querySelector("#toastUndoBtn").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_hub")).games.length===2, "… rückgängig machbar");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[62] Version 11.5: KI-Prompt (Beta) & Phasenwechsel");
  ({w,d,errs,S} = await boot());
  w.eval("navigate('tactics')");
  ok(d.querySelector("#btnAiPrompt .beta-pill"), "Taktik: Knopf '🤖 KI-Prompt' mit Beta-Kennzeichen");
  d.querySelector("#btnAiPrompt").click();
  const prev6 = () => d.querySelector("#aiPreview").value;
  ok(d.querySelector("#modal h3").textContent==="KI-Prompt kopieren" && d.querySelector("#modal").textContent.includes("nichts automatisch gesendet") && d.querySelector("#aiCopyBtn"), "Dialog mit Vorschau und 'Prompt kopieren'");
  const pr6 = prev6(), st6 = S(), f6 = st6.formationName;
  ok(pr6.includes(`Formation ${f6}`) && pr6.includes("### Mit Ball") && pr6.includes("### Gegen den Ball") && pr6.includes("## Kader (") && pr6.includes("## Letzte Ergebnisse") && pr6.includes("## Nächstes Spiel") && pr6.includes("## So antwortest du bitte"), "Prompt enthält Taktik (beide Phasen), Kader, Ergebnisse, nächsten Gegner, Antwortformat");
  const xi6 = w.eval("Object.values(slotsFor(state, state.formationName)).filter(s=>s && s.playerId).map(s=>[playerById(s.playerId).name, s.roleIn, s.roleOut])");
  ok(xi6.length && xi6.every(([n, ri, ro])=>pr6.includes(`| ${n} | ${ri} |`) && pr6.includes(`| ${n} | ${ro} |`)), `Alle ${xi6.length} Spieler der Startelf mit Rolle mit Ball und gegen den Ball`);
  ok(st6.players.every(p=>pr6.includes(`| ${p.name} | ${p.pos} |`)), `Alle ${st6.players.length} Kaderspieler mit Position`);
  ok(pr6.includes(st6.nextMatch.opponent) && (!st6.nextMatch.keyThreat || pr6.includes(st6.nextMatch.keyThreat)), "Nächster Gegner mit Hauptgefahr");
  ok(/Plan A: \d+ Spiele · \d+ S, \d+ U, \d+ N · [\d,]+ Punkte pro Spiel/.test(pr6), "Bilanz der Taktik-Pläne (Punkte pro Spiel)");
  const sel6 = d.querySelector('#modal [data-f="preset"]'); sel6.value = "next"; sel6.dispatchEvent(new w.Event("change",{bubbles:true}));
  const ex6 = d.querySelector('#modal [data-f="extra"]'); ex6.value = "Wir kassieren viele Kopfballtore."; ex6.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok(prev6().includes("gegen meinen nächsten Gegner") && prev6().includes("Zusätzlich: Wir kassieren viele Kopfballtore."), "Frage-Vorlage und eigener Zusatz landen im Prompt");
  const sq6 = d.querySelector('#modal [data-ai-part="squad"]'); sq6.checked = false; sq6.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!prev6().includes("## Kader (") && d.querySelector("#aiCount").textContent.includes("Zeichen"), "Bausteine abwählbar (Kader raus), Zeichenzähler");
  let copied6 = null; Object.defineProperty(w.navigator, "clipboard", {value:{writeText: async t=>{ copied6 = t; }}, configurable:true});
  d.querySelector("#aiCopyBtn").click(); await new Promise(r=>setTimeout(r,20));
  ok(copied6 === prev6() && d.querySelector("#toastMsg").textContent.includes("Prompt kopiert") && d.querySelector("#aiCopyBtn").textContent.includes("Kopiert"), "📋 Prompt kopieren: Text in der Zwischenablage, Bestätigung");
  w.eval("closeModal()");
  ok(w.eval("HOTKEY_ACTIONS().some(a=>a[0]==='aiPrompt')") && w.eval("buildCommands ? true : true"), "Auch per Befehlspalette und eigenem Kürzel erreichbar");
  // national team: nominated squad
  w.eval(`(()=>{ const f = freshState("sample"); f.mode = "national"; f.club.name = "Deutschland"; f.national = {country:"Deutschland", code:"GER"}; f.players.forEach((p,i)=>{ p.nominated = i < 5; }); switchSlot(createSlot("DFB", sanitizeState(f))); })()`);
  const np6 = w.eval("aiPromptText({})");
  ok(np6.includes("## Mein Nationalteam") && np6.includes("## Nominierter Kader (5 Spieler"), "Nationalteam: nur nominierte Spieler im Prompt");
  // phase switch still works (animation needs a real browser)
  w.eval("switchSlot(slotIndex.slots[0].id); navigate('tactics')");
  d.querySelector('.phase-btn[data-phase="out"]').click();
  ok(S().phase==="out" && d.querySelector('.phase-btn[data-phase="out"]').classList.contains("active"), "Phasenwechsel funktioniert weiterhin");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[63] Version 11.6: neue Hub-Startseite (Beta)");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  w.eval(`createSlot("Napoli", freshState("sample")); createSlot("Alt", freshState("empty")); renderHub()`);
  const H7 = sel => d.querySelector("#hubRoot " + sel);
  ok(H7("h1").textContent.endsWith("!") && /^\d\d:\d\d$/.test(H7("#hubClockTime").textContent) && H7("#hubClockDate").textContent.includes(String(new Date().getFullYear())), "Begrüßung, Uhrzeit und echtes Datum");
  ok(H7(".hub2-brand .beta-pill"), "Startseite als Beta gekennzeichnet");
  const hero7 = H7(".hub2-hero"), st7 = S();
  ok(hero7.textContent.includes("Zuletzt gespielt") && hero7.textContent.includes(st7.club.name) && hero7.textContent.includes(st7.club.season) && hero7.querySelector(".sm-crest.xl"), "Weiterspielen-Karte: Wappen, Verein, Saison");
  const stats7 = [...hero7.querySelectorAll(".hub2-stats > div")].map(x=>x.textContent);
  ok(stats7[0].includes(d.querySelector("#transferBudgetChip").textContent) && stats7[1].includes(d.querySelector("#formationChip").textContent) && stats7[2].includes(st7.nextMatch.opponent) && stats7[2].includes("in 3 Tagen"), "Kennzahlen identisch mit der Kopfleiste + nächstes Spiel ('in 3 Tagen')");
  ok(hero7.getAttribute("style").includes(st7.club.accent), "Karte nimmt die Vereinsfarbe an");
  const saves7 = () => [...d.querySelectorAll("#hubRoot .hub2-save")];
  ok(saves7().length===3 && saves7()[0].classList.contains("active"), "Spielstände: 3 Einträge, aktiver zuerst");
  H7('[data-hub-open="fm"]').click(); await new Promise(r=>setTimeout(r,5)); w.eval("showHub('home')");   // Karriere 1 is really played once
  const nap7 = w.eval("slotIndex.slots.find(x=>x.name==='Napoli').id");
  d.querySelector(`#hubRoot [data-hub-save="${nap7}"]`).click();
  ok(w.eval("slotIndex.active")===nap7 && hubR6().hidden && w.eval("slotIndex.slots.find(x=>x.id===slotIndex.active).lastPlayedAt") > 0, "Klick auf einen Spielstand: wechselt, öffnet ihn, merkt 'zuletzt gespielt'");
  w.eval("showHub('home')");
  ok(saves7()[0].textContent.includes("Napoli") && H7(".hub2-hero").textContent.includes("Napoli"), "Hub zeigt danach Napoli oben und als 'Weiterspielen'");
  ok(saves7()[1].textContent.includes("Karriere 1") && saves7()[2].textContent.includes("Alt"), "Sortierung nach 'zuletzt gespielt' (Karriere 1 vor Alt)");
  w.eval(`openSaveMenu()`); const alt7 = w.eval("slotIndex.slots.find(x=>x.name==='Alt').id");
  d.querySelector(`#saveMenu li[data-sm-open="${alt7}"]`).click();
  ok(!hubR6().hidden && H7(".hub2-hero").textContent.includes("Alt"), "Wechsel über 'Alle Spielstände' bei offenem Hub: Startseite zieht mit");
  // admin card
  const rows7 = [...d.querySelectorAll("#hubRoot .hub2-admin-rows li")].map(x=>x.textContent);
  ok(rows7.length===4 && rows7[0].includes("Ordner-Sicherung") && rows7[0].includes("aus") && rows7[1].includes("noch nie") && rows7[2].includes("%") && rows7[3].includes("keine Fehler"), "Admin & Sicherung: Ordner-Sicherung, Export, Speicher, Fehlerprotokoll");
  w.eval(`logError("Testfehler", "")`); w.eval("renderHub()");
  ok(d.querySelector("#hubRoot .hub2-admin-rows li:nth-child(4) strong").textContent==="1 Einträge" && d.querySelector("#hubRoot .hub2-admin-rows li:nth-child(4) strong").classList.contains("warn"), "Fehler im Protokoll → Warnfarbe");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  H7('[data-hub="exportAll"]').click(); w.eval("renderHub()");
  ok(d.querySelector("#hubRoot .hub2-admin-rows li:nth-child(2)").textContent.includes("gerade eben"), "'Alles exportieren' → 'Letzter Export: gerade eben'");
  H7('[data-hub="admin"]').click();
  ok(!hubR6().hidden && w.eval("adminVisible()"), "'Admin öffnen' führt in die Admin-Zentrale (im Hub)");
  // coming modules + national variant
  w.eval("showHub('home')"); H7('[data-hub-open="career"]').click();
  ok(!hubR6().hidden && d.querySelector("#hubRoot .career-page"), "Karriere-Begleiter öffnet sich (seit 11.9)"); w.eval("showHub('home')");
  w.eval(`(()=>{ const f = freshState("sample"); f.mode = "national"; f.club.name = "Deutschland"; f.national = {country:"Deutschland", code:"GER", colors:["#000000","#DD0000","#FFCE00"], accent:"#FFCE00", maxSquad:26}; f.players.forEach((p,i)=>{ p.nominated = i < 7; }); switchSlot(createSlot("DFB", sanitizeState(f))); })()`);
  w.eval("showHub('home')");
  ok(H7(".hub2-hero h2").textContent.includes("Nationalteam") && H7(".hub2-hero-stripe") && H7(".hub2-stats").textContent.includes("7 / 26") && H7(".hub2-stats").textContent.includes("Bilanz"), "Nationalteam: Landesfarben-Streifen, Nominiert 7 / 26, Bilanz");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[64] Version 11.6.1: ganze Panels klickbar & Neuigkeiten");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  w.eval(`createSlot("Napoli", freshState("sample")); renderHub()`);
  const hR8 = () => d.querySelector("#hubRoot"), q8 = sel => d.querySelector("#hubRoot " + sel);
  q8(".hub2-hero h2").click();
  ok(hR8().hidden && d.querySelector("#view-home.active"), "Klick auf die Überschrift der Weiterspielen-Karte öffnet das Dashboard");
  w.eval("showHub('home')"); q8(".hub2-hero .hub2-stats").click();
  ok(hR8().hidden, "… auch ein Klick auf die Kennzahlen");
  w.eval("showHub('home')"); q8(".hub2-saves .hub2-card-head").click();
  ok(!hR8().hidden && !d.querySelector("#saveMenu").hidden, "Klick auf das Spielstände-Panel öffnet die Spielstand-Auswahl");
  w.eval("closeSaveMenu()");
  const nap8 = w.eval("slotIndex.slots.find(x=>x.name==='Napoli').id");
  q8(`[data-hub-save="${nap8}"] .hub2-save-main`).click();
  ok(w.eval("slotIndex.active")===nap8 && hR8().hidden && (!d.querySelector("#saveMenu") || d.querySelector("#saveMenu").hidden), "Klick auf einen Spielstand darin wechselt genau dorthin (nicht die Auswahl)");
  w.eval("showHub('home')"); w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  q8('.hub2-admin [data-hub="exportAll"]').click();
  ok(!hR8().hidden && !w.eval("adminVisible()"), "'Alles exportieren' im Admin-Panel exportiert nur – öffnet nicht den Admin");
  q8(".hub2-admin .hub2-admin-rows li:nth-child(3)").click();
  ok(!hR8().hidden && w.eval("adminVisible()"), "Klick irgendwo sonst auf das Admin-Panel öffnet die Admin-Zentrale");
  w.eval("showHub('home')"); q8('.hub2-mod[data-hub-open="diary"] p').click();
  ok(!hR8().hidden && q8(".diary-page"), "Auch die Modul-Kacheln reagieren auf Klicks überall (Tagebuch öffnet sich, seit 11.8)");
  w.eval("showHub('home')");
  // news
  const items8 = [...d.querySelectorAll("#hubRoot .hub2-news-item")];
  ok(items8.length===3 && items8[0].textContent.includes("v" + w.eval("APP_VERSION")) && items8[0].textContent.includes("aktuell") && items8[0].querySelector(".cl-tag"), "Neuigkeiten: die letzten 3 Versionen, neueste als 'aktuell', mit Markierungen");
  const v2_8 = w.eval("CHANGELOG[1].v");
  items8[1].querySelector("strong").click();
  ok(d.querySelector("#modal h3").textContent.includes("Changelog") && d.querySelector(`#modal details[data-cl-v="${v2_8}"]`).open && !d.querySelector(`#modal details[data-cl-v="${w.eval("APP_VERSION")}"]`).open, "Klick auf eine Version öffnet den Changelog genau dort");
  ok(d.querySelectorAll("#modal details.cl-entry").length===w.eval("CHANGELOG.length"), "Changelog-Dialog zeigt alle Versionen – ohne PIN");
  w.eval("closeModal()"); q8(".hub2-news .hub2-card-head").click();
  ok(d.querySelector(`#modal details[data-cl-v="${w.eval("APP_VERSION")}"]`).open, "Klick auf das Panel öffnet die neueste Version");
  w.eval("closeModal()");
  const news8 = q8(".hub2-news"); news8.focus(); news8.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true}));
  ok(d.querySelector("#modalOverlay").classList.contains("active"), "Neuigkeiten auch per Tastatur (Enter)");
  w.eval("closeModal()");
  ok(/onUndo:\(\)=>openHubChangelog\(APP_VERSION\)/.test(js), "'Was ist neu?' nach einem Update öffnet den Changelog (ohne PIN)");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[65] Version 11.7: Admin-Zentrale im Hub, Hub-Knopf oben links");
  ({w,d,errs,S} = await boot());
  w.eval(`createSlot("Napoli", freshState("sample"))`);
  ok(d.querySelector(".sidebar > #btnHub.hub-btn-top") && d.querySelector(".sidebar").firstElementChild.id === "btnHub" && d.querySelectorAll("#btnHub").length===1, "Oben links in der Seitenleiste: Hub-Knopf (nur einmal)");
  ok(d.querySelector(".topbar-left #crestBox.crest-top") && !d.querySelector(".sidebar #crestBox"), "Vereinswappen steht in der Kopfleiste");
  d.querySelector("#crestBox").click();
  ok(!d.querySelector("#saveMenu").hidden, "Klick aufs Wappen öffnet weiterhin den Spielstand-Wechsel"); w.eval("closeSaveMenu()");
  d.querySelector("#btnHub").click();
  ok(!d.querySelector("#hubRoot").hidden && d.querySelector("#hubRoot .hub2-hero"), "Hub-Knopf öffnet den Hub");
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'home'"); d.querySelector('#hubRoot [data-hub="admin"]').click();
  ok(w.eval("adminVisible()") && d.querySelector("#hubRoot #hubAdminHost #adminRoot") && d.querySelector("#hubRoot h1").textContent.includes("Admin-Zentrale"), "'Admin öffnen': Admin-Zentrale als Hub-Seite");
  const grp = [...d.querySelectorAll("#adminTabs .adm2-group")].map(g=>g.textContent);
  ok(grp[0]==="Allgemein · alle Spielstände" && grp[1]===`Spielstand · ${w.eval("activeSlotMeta().name")}`, "Gruppen: Allgemein / Spielstand · Name");
  ok(d.querySelector("#adminBody .adm-home-tiles") && d.querySelectorAll("#adminBody .adm-saves tbody tr").length===2 && d.querySelector("#adminBody").textContent.includes("Napoli"), "Zentrale: Status-Kacheln und alle Spielstände");
  const tab = k => { d.querySelector(`#adminTabs [data-atab="${k}"]`).click(); return d.querySelector("#adminBody"); };
  ok(tab("backup").querySelector(".backup-card") && d.querySelector("#adminBody").textContent.includes("Umzug") && !d.querySelector("#adminBody .data-table [data-rp-restore]"), "Sicherung: Ordner-Sicherung + Umzug, keine Wiederherstellungspunkte");
  ok(!tab("restore").querySelector(".backup-card") && d.querySelector("#btnManualRp"), "Wiederherstellungspunkte: nur noch die Punkte des Spielstands");
  ok(tab("errors").querySelector(".err-card") && !tab("health").querySelector(".err-card"), "Fehlerprotokoll eigener Bereich, Datenprüfung ohne Protokoll");
  ok(tab("storage").textContent.includes("Speicherbelegung") && !tab("maintenance").textContent.includes("Speicherbelegung") && d.querySelector("#adminBody").textContent.includes("Beträge umrechnen"), "Speicher getrennt von Wartung & Batch");
  ok(tab("hotkeys").querySelector(".kbd-table") && d.querySelector('#adminBody [data-adm-go="hotkeys"]'), "Tastenkürzel: Übersicht + Ändern");
  d.querySelector('#adminBody [data-adm-go="hotkeys"]').click();
  ok(d.querySelector("#modal h3").textContent==="Tastenkürzel", "… öffnet den Kürzel-Manager"); w.eval("closeModal()");
  // Esc → hub, admin element parked again, lock on leave
  d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
  ok(!w.eval("adminVisible()") && d.querySelector("#hubRoot .hub2-hero") && d.querySelector("#view-admin > #adminRoot"), "Esc: zurück zum Hub, Admin wieder an seinem Platz");
  w.eval("adminCfg(); const c = adminCfg(); c.lockOnLeave = true; saveAdminCfg ? saveAdminCfg(c) : null; adminUnlocked = true; showHub('admin')");
  ok(w.eval("adminVisible()"), "Wieder in der Admin-Zentrale");
  w.eval("navigate('squad')");
  ok(d.querySelector("#hubRoot").hidden && d.querySelector("#view-squad.active") && d.querySelector("#view-admin > #adminRoot"), "Wechsel zu einem Dashboard-Modul verlässt den Hub");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[66] Version 11.7.1: Verknüpfung Verein ⇄ Nationalteam");
  ({w,d,errs,S} = await boot());
  const clubL = w.eval("slotIndex.active");
  w.eval("smCreate('national')"); await new Promise(r=>setTimeout(r,80));
  d.querySelector('#modal [data-f="link"]').value = clubL; d.querySelector("[data-modal-save]").click();
  const natL = w.eval("slotIndex.active"), linkOf = id => (JSON.parse(w.localStorage.getItem("fm27_slot_" + id)) || {}).link || "";
  ok(linkOf(clubL)===natL && linkOf(natL)===clubL && !d.querySelector("#btnLinkSwitch").hidden, "Verknüpft: beide Seiten, Umschalter im Nationalteam sichtbar");
  ok(d.querySelector("#btnLinkSwitch .ls-text").textContent.includes("Zum Verein") && d.querySelector("#btnLinkSwitch .sm-crest"), "Neuer Umschalter: Wappen + 'Zum Verein · Name'");
  d.querySelector("#toastUndoBtn").click();
  ok(linkOf(clubL)==="" && linkOf(natL)==="" && d.querySelector("#btnLinkSwitch").hidden, "Rückgängig nach der Einrichtung: Verknüpfung auf BEIDEN Seiten entfernt (vorher blieb sie einseitig)");
  // one-sided link from older data: heals itself
  w.eval(`(()=>{ const c = JSON.parse(store.getItem(SLOT_PREFIX + "${clubL}")); c.link = "${natL}"; store.setItem(SLOT_PREFIX + "${clubL}", JSON.stringify(c)); state.link = ""; saveState(); renderHeader(); })()`);
  ok(!d.querySelector("#btnLinkSwitch").hidden && linkOf(natL)===clubL, "Einseitige Verknüpfung (Verein → Nationalteam) repariert sich selbst");
  w.eval("runHotkey('linkSwitch')");
  ok(w.eval("slotIndex.active")===clubL && d.querySelector("#btnLinkSwitch").textContent.includes("Zum Nationalteam"), "Kürzel wechselt zum Verein; dort Umschalter zurück zum Nationalteam");
  w.eval(`localStorage.setItem("fm27_hotkeys", JSON.stringify({linkSwitch:"v"})); renderHeader()`);
  ok(d.querySelector("#btnLinkSwitch .ls-key").textContent==="V", "Eigenes Kürzel steht auf dem Umschalter");
  // partner deleted → link cleared, no dead button
  w.eval(`slotIndex.slots = slotIndex.slots.filter(s=>s.id!=="${natL}"); store.removeItem(SLOT_PREFIX + "${natL}"); writeIndex(); renderHeader()`);
  ok(d.querySelector("#btnLinkSwitch").hidden && S().link==="", "Gelöschter Partner: Umschalter verschwindet, Verknüpfung bereinigt");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[67] Version 11.8: Spiel-Tagebuch (Beta)");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  const DY_9 = () => JSON.parse(w.localStorage.getItem("fm27_diary") || "null");
  const q9_9 = sel => d.querySelector("#hubRoot " + sel);
  ok(q9_9('[data-hub-open="diary"]') && !q9_9('[data-hub-open="diary"]').classList.contains("soon") && q9_9("#hubDiaryMeta").textContent.includes("Diese Woche 0 Min."), "Hub: Tagebuch-Kachel aktiv (Beta) mit Wochenstatus");
  q9_9('[data-hub-open="diary"] p').click();
  ok(q9_9(".diary-page") && q9_9(".diary-empty") && q9_9('[data-d="start"]'), "Klick öffnet das Tagebuch – leerer Zustand mit 'Session starten'");
  q9_9('[data-d="start"]').click(); d.querySelector("[data-modal-save]").click();   // 11.8.1: start dialog with an optional plan
  ok(DY_9().running && Math.abs(DY_9().running.start - Date.now()) < 5000 && DY_9().running.slotId===w.eval("slotIndex.active") && q9_9("#diaryClock"), "Session gestartet: Startzeit gespeichert, Uhr läuft");
  const dumpD_9 = {}; for(let i=0;i<w.localStorage.length;i++){ const k = w.localStorage.key(i); dumpD_9[k] = w.localStorage.getItem(k); }
  ({w,d,errs,S} = await boot(Object.assign(ls=>Object.entries(dumpD_9).forEach(([k,v])=>ls.setItem(k,v)), {hub:true})));
  ok(DY_9().running && q9_9("#hubDiaryMeta").textContent.includes("Session läuft"), "Nach dem Neuladen läuft die Session weiter (Hub-Kachel zeigt sie)");
  w.eval("diary.running.start = Date.now() - 75 * 60000; saveDiary(); showHub('diary')");
  q9_9('[data-d="stop"]').click();
  ok(d.querySelector("#modal h3").textContent==="Session beenden" && d.querySelector('#modal [data-f="minutes"]').value==="75", "Beenden: Dauer vorgeschlagen (75 Min.)");
  d.querySelector('#modal [data-f="title"]').value = "Pokal-Aus gegen Bayern"; d.querySelector('#modal [data-f="mood"]').value = "bad";
  d.querySelector("[data-modal-save]").click();
  ok(DY_9().running===null && DY_9().sessions.length===1 && DY_9().sessions[0].minutes===75 && DY_9().sessions[0].title==="Pokal-Aus gegen Bayern", "Session gespeichert, Timer beendet");
  ok(q9_9(".diary-day-head").textContent.includes("Heute") && q9_9(".diary-entry").textContent.includes("1 Std. 15 Min.") && q9_9(".diary-entry").textContent.includes("😟") && q9_9(".diary-week").textContent.includes("1 Std. 15 Min."), "Zeitleiste 'Heute' mit Dauer und Stimmung, Wochenzeit");
  d.querySelector("#toastUndoBtn").click();
  ok(DY_9().running && DY_9().sessions.length===0, "Rückgängig: Session läuft wieder");
  w.eval("diary.running = null; saveDiary(); renderHub()");
  // another game + session from yesterday → streak
  q9_9('[data-d="addSession"]').click();
  const tg_9 = d.querySelector('#modal [data-f="target"]'); tg_9.value = "new"; tg_9.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!d.querySelector("#dNewGameWrap").hidden, "'Anderes Spiel' fragt nach dem Namen");
  d.querySelector('#modal [data-f="newGame"]').value = "EA SPORTS FC 26"; d.querySelector('#modal [data-f="minutes"]').value = "40";
  const yd_9 = new Date(Date.now() - 86400000); yd_9.setMinutes(yd_9.getMinutes() - yd_9.getTimezoneOffset());
  d.querySelector('#modal [data-f="start"]').value = yd_9.toISOString().slice(0,16);
  d.querySelector("[data-modal-save]").click();
  w.eval("diary.sessions.push({id:'t1', start:Date.now()-3600e3, end:Date.now(), minutes:30, slotId:slotIndex.active, title:'Kurz', mood:'good'}); saveDiary(); renderHub()");
  ok(DY_9().games.includes("EA SPORTS FC 26") && q9_9(".diary-timeline").textContent.includes("Gestern") && q9_9(".diary-timeline").textContent.includes("EA SPORTS FC 26"), "Anderes Spiel gemerkt, Eintrag unter 'Gestern'");
  ok(q9_9(".diary-side").textContent.includes("2 Tage in Folge"), "Serie: 🔥 2 Tage in Folge");
  // journey link: active save + another save
  w.eval(`journey = sanitizeJourney({active:true, profile:{name:"Coach"}}); saveState();`);
  q9_9('[data-d="addSession"]').click();
  ok(!d.querySelector("#dJourneyWrap").hidden, "Spielstand mit Journey: Häkchen 'ins Journey-Tagebuch'");
  d.querySelector('#modal [data-f="title"]').value = "Meisterschaft perfekt!"; d.querySelector('#modal [data-f="toJourney"]').checked = true; d.querySelector("[data-modal-save]").click();
  const jd_9 = w.eval("journey.diary");
  ok(jd_9.length===1 && jd_9[0].title==="Meisterschaft perfekt!" && jd_9[0].date===S().club.ingameDate && DY_9().sessions.find(x=>x.title==="Meisterschaft perfekt!").journeyId===jd_9[0].id, "Übernommen ins Journey-Tagebuch – mit Spieldatum, verknüpft");
  ok(q9_9(".diary-side").textContent.includes("Meisterschaft perfekt!") && q9_9(".diary-timeline").textContent.includes("auch in der Journey"), "Erscheint unter 'Aus deinen Journeys', Session markiert");
  w.eval(`(()=>{ const f = freshState("sample"); f.journey = sanitizeJourney({active:true, profile:{name:"Zweiter"}}); createSlot("Zweite Karriere", sanitizeState(f)); renderHub(); })()`);
  const second_9 = w.eval("slotIndex.slots.find(x=>x.name==='Zweite Karriere').id");
  q9_9('[data-d="addSession"]').click();
  const tg2_9 = d.querySelector('#modal [data-f="target"]'); tg2_9.value = "slot:" + second_9; tg2_9.dispatchEvent(new w.Event("change",{bubbles:true}));
  d.querySelector('#modal [data-f="title"]').value = "Erster Tag im neuen Job"; d.querySelector('#modal [data-f="toJourney"]').checked = true; d.querySelector("[data-modal-save]").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_slot_" + second_9)).journey.diary.some(e=>e.title==="Erster Tag im neuen Job") && w.eval("slotIndex.active")!==second_9, "Auch in die Journey eines anderen Spielstands – ohne dorthin zu wechseln");
  // challenges
  q9_9('[data-d="addChallenge"]').click();
  d.querySelector('#modal [data-f="title"]').value = "30 Siege"; const kd9_9 = d.querySelector('#modal [data-f="kind"]'); kd9_9.value = "count"; kd9_9.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(!d.querySelector("#dCountWrap").hidden && d.querySelector("#dStepsWrap").hidden, "Art 'Mit Zähler': Ziel und Stand");
  d.querySelector('#modal [data-f="goal"]').value = "3"; d.querySelector("[data-modal-save]").click();
  const cid_9 = DY_9().challenges[0].id;
  q9_9(`[data-d-plus="${cid_9}"]`).click(); q9_9(`[data-d-plus="${cid_9}"]`).click();
  ok(DY_9().challenges[0].current===2 && DY_9().challenges[0].status==="active" && q9_9(".ch-count").textContent==="2 / 3", "+1 zählt hoch (2 / 3)");
  q9_9(`[data-d-plus="${cid_9}"]`).click();
  ok(DY_9().challenges[0].status==="done" && q9_9(".diary-entry.win").textContent.includes("30 Siege") && d.querySelector("#toastMsg").textContent.includes("geschafft"), "3 / 3 → geschafft, 🏆 in der Zeitleiste");
  q9_9('[data-d="addChallenge"]').click();
  d.querySelector('#modal [data-f="title"]').value = "Von Liga 3 in die CL"; const kd10_9 = d.querySelector('#modal [data-f="kind"]'); kd10_9.value = "steps"; kd10_9.dispatchEvent(new w.Event("change",{bubbles:true}));
  d.querySelector('#modal [data-f="steps"]').value = "Aufstieg Liga 2\nAufstieg Bundesliga\nCL-Sieg"; d.querySelector("[data-modal-save]").click();
  const sc_9 = DY_9().challenges.find(c=>c.kind==="steps");
  ok(sc_9.steps.length===3, "Teilschritte angelegt");
  q9_9(`[data-d-ch="${sc_9.id}"]`).click();
  ok(d.querySelector('#modal [data-f="steps"]').value==="Aufstieg Liga 2\nAufstieg Bundesliga\nCL-Sieg", "Erneut öffnen: Teilschritte stehen wieder je in einer Zeile (Fehler beim Bauen gefunden)");
  w.eval("closeModal()");
  sc_9.steps.forEach(st=>{ const box = d.querySelector(`#hubRoot [data-d-step="${sc_9.id}:${st.id}"]`); box.checked = true; box.dispatchEvent(new w.Event("change",{bubbles:true})); });
  ok(DY_9().challenges.find(c=>c.id===sc_9.id).status==="done", "Alle Teilschritte abgehakt → geschafft");
  q9_9('[data-d="addChallenge"]').click(); d.querySelector('#modal [data-f="title"]').value = "Ohne Transfers"; d.querySelector("[data-modal-save]").click();
  const simple_9 = DY_9().challenges.find(c=>c.title==="Ohne Transfers");
  q9_9(`[data-d-ch="${simple_9.id}"]`).click(); d.querySelector("#modal [data-d-drop]").click();
  ok(DY_9().challenges.find(c=>c.id===simple_9.id).status==="dropped", "Challenge abbrechen");
  // keys, hotkey, Umzug
  d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
  ok(q9_9(".hub2-hero") && q9_9("#hubDiaryMeta").textContent.includes("Diese Woche"), "Esc: zurück zum Hub");
  w.eval("runHotkey('session')"); ok(DY_9().running, "Kürzel 'Session starten/beenden' startet …");
  w.eval("runHotkey('session')"); ok(d.querySelector("#modal h3").textContent==="Session beenden", "… und beendet (Dialog)"); w.eval("closeModal()");
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{};
  let umz9_9 = null; const Bl9_9 = w.Blob; w.Blob = function(parts, o){ umz9_9 = parts.join(""); return new Bl9_9(parts, o); }; w.eval("exportAll()"); w.Blob = Bl9_9;
  ok(JSON.parse(JSON.parse(umz9_9).storage["fm27_diary"]).sessions.length >= 3, "'Alles exportieren (Umzug)' enthält das Tagebuch");
  ok(w.eval("storageEntries()").find(e=>e.key==="fm27_diary").label==="Spiel-Tagebuch", "Speicher-Hausmeister kennt das Tagebuch");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[68] Version 11.8.1: Start ohne Aufblitzen, Tagebuch-Bilder, Vorhaben, Filter");
  { const pre_x = /<script>(try\{var t=localStorage[\s\S]*?)<\/script>/.exec(htmlRaw)[1];
    const mk_x = hint => { const dom = new JSDOM("<html><head></head><body></body></html>", {url:"http://localhost/", runScripts:"dangerously"}); if(hint) dom.window.localStorage.setItem("fm27_start_hint", hint); dom.window.eval(pre_x); return dom.window.document.documentElement.classList.contains("boot-hub"); };
    ok(mk_x("") && mk_x("hub") && !mk_x("fm"), "Vor-Skript: App bleibt verborgen, solange der Hub kommt – nicht bei 'Start im Dashboard'"); }
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  ok(!d.documentElement.classList.contains("boot-hub") && w.localStorage.getItem("fm27_start_hint")==="hub", "Nach dem Start: Hub sichtbar, Hinweis gespeichert");
  w.eval("hub.startPanel = 'fm'; saveHub()"); ok(w.localStorage.getItem("fm27_start_hint")==="fm", "Einstellung 'Beim Start: Dashboard' landet im Hinweis");
  w.eval("hub.startPanel = 'hub'; saveHub(); showHub('diary')");
  const DY8_x = () => JSON.parse(w.localStorage.getItem("fm27_diary") || "null"), q8b_x = sel => d.querySelector("#hubRoot " + sel);
  // plan
  q8b_x('[data-d="start"]').click();
  ok(d.querySelector("#modal h3").textContent==="Session starten", "'Session starten' fragt nach dem Vorhaben");
  d.querySelector('#modal [data-f="plan"]').value = "Winter-Transferfenster abschließen"; d.querySelector("[data-modal-save]").click();
  ok(DY8_x().running.plan==="Winter-Transferfenster abschließen" && q8b_x(".diary-run-plan").textContent.includes("Winter-Transferfenster"), "Vorhaben steht in der laufenden Session");
  w.eval("diary.running.start = Date.now() - 50 * 60000; saveDiary(); renderHub()");
  q8b_x('[data-d="stop"]').click();
  ok(d.querySelector('#modal [data-f="planDone"]').checked && d.querySelector('#modal [data-f="title"]').value==="Winter-Transferfenster abschließen", "Beenden: 'Vorhaben geschafft?' angehakt, als Titel vorgeschlagen");
  // images
  const PNG_x = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  ok(w.eval(`dModalAddImage("${PNG_x}")`) && w.eval(`dModalAddImage("${PNG_x}")`) && d.querySelectorAll("#dImgs .d-thumb img").length===2, "Bilder im Dialog: Vorschau mit ✕");
  d.querySelector("[data-modal-save]").click();
  const s1_x = DY8_x().sessions[0];
  ok(s1_x.plan && s1_x.planDone && s1_x.images.length===2 && s1_x.images.every(id=>w.localStorage.getItem("fm27_img_" + id)===PNG_x) && !JSON.stringify(DY8_x()).includes("base64"), "Gespeichert: Vorhaben geschafft, 2 Bilder als eigene Einträge (Tagebuch bleibt klein)");
  ok(q8b_x(".diary-plan.ok").textContent.includes("geschafft") && q8b_x(".diary-thumbs").querySelectorAll(".diary-thumb").length===2, "Zeitleiste: 🎯 geschafft + 2 Vorschaubilder");
  q8b_x(`[data-d-img="${s1_x.id}:0"]`).click();
  ok(d.querySelector("#dLbImg").getAttribute("src")===PNG_x && d.querySelector("#dLbCount").textContent==="1 / 2", "Klick aufs Bild: große Ansicht 1 / 2");
  d.querySelector('#modal [data-lb="next"]').click(); ok(d.querySelector("#dLbCount").textContent==="2 / 2", "Weiterblättern 2 / 2"); w.eval("closeModal()");
  ok(w.eval("storageEntries()").find(e=>e.key==="fm27_img_" + s1_x.images[0]).label==="Tagebuch-Bild", "Speicher-Hausmeister kennt Tagebuch-Bilder");
  q8b_x(`[data-d-session="${s1_x.id}"]`).click();
  d.querySelector('#modal [data-d-imgdel="0"]').click(); d.querySelector("[data-modal-save]").click();
  const removed_x = s1_x.images[0];
  ok(DY8_x().sessions[0].images.length===1 && w.localStorage.getItem("fm27_img_" + removed_x)!==null, "Bild entfernt – Datei bleibt bis zum nächsten Start (Rückgängig möglich)");
  for(let i=0;i<6;i++) w.eval(`(()=>{ dPending = dPending || []; })()`);
  q8b_x(`[data-d-session="${s1_x.id}"]`).click();
  let added_x = 0; for(let i=0;i<8;i++) if(w.eval(`dModalAddImage("${PNG_x}")`)) added_x++;
  ok(added_x===5 && d.querySelector("#toastMsg").textContent.includes("Höchstens 6"), "Höchstens 6 Bilder pro Session"); w.eval("closeModal()");
  const dumpB_x = {}; for(let i=0;i<w.localStorage.length;i++){ const k = w.localStorage.key(i); dumpB_x[k] = w.localStorage.getItem(k); }
  ({w,d,errs,S} = await boot(Object.assign(ls=>Object.entries(dumpB_x).forEach(([k,v])=>ls.setItem(k,v)), {hub:true})));
  ok(w.localStorage.getItem("fm27_img_" + removed_x)===null && JSON.parse(w.localStorage.getItem("fm27_diary")).sessions[0].images.every(id=>w.localStorage.getItem("fm27_img_" + id)), "Beim nächsten Start: nicht mehr benutzte Bilder aufgeräumt, die anderen bleiben");
  // won challenge: reopen / delete
  w.eval(`diary.challenges.push({id:"cw", title:"Meister werden", kind:"count", target:3, current:3, status:"done", createdAt:Date.now()-1e5, doneAt:Date.now()}); saveDiary(); showHub("diary")`);
  ok(q8b_x(".diary-entry.win [data-d-reopen]") && q8b_x(".diary-entry.win [data-d-delch]"), "Geschaffte Challenge in der Zeitleiste: ↺ und ✕");
  q8b_x('.diary-entry.win [data-d-reopen="cw"]').click();
  const cw_x = () => JSON.parse(w.localStorage.getItem("fm27_diary")).challenges.find(c=>c.id==="cw");
  ok(cw_x().status==="active" && cw_x().current===2 && !q8b_x(".diary-entry.win"), "↺ wieder aktiv (Zähler 2 / 3, nicht sofort wieder 'geschafft')");
  d.querySelector("#toastUndoBtn").click(); ok(cw_x().status==="done", "… rückgängig");
  q8b_x('.diary-entry.win [data-d-delch="cw"]').click();
  ok(!cw_x() && !q8b_x(".diary-entry.win"), "✕ löscht die Challenge"); d.querySelector("#toastUndoBtn").click(); ok(cw_x() && cw_x().status==="done", "… rückgängig");
  // filter
  w.eval(`diary.sessions.push({id:"fx", start:Date.now()-7200e3, minutes:30, slotId:"", game:"EA SPORTS FC 26", title:"FC-Abend", mood:"good", images:[]}); diary.games.push("EA SPORTS FC 26"); saveDiary(); renderHub()`);
  const fsel_x = q8b_x("[data-d-filter]"); ok(fsel_x && fsel_x.options.length===3, "Filter: Alle + 2 Spielstände/Spiele");
  fsel_x.value = "game:EA SPORTS FC 26"; fsel_x.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok(d.querySelectorAll("#hubRoot .diary-entry[data-d-session]").length===1 && q8b_x(".diary-timeline").textContent.includes("FC-Abend") && !q8b_x(".diary-entry.win"), "Gefiltert: nur EA SPORTS FC 26");
  const ent_x = q8b_x('[data-d-session="fx"]'); ent_x.focus(); ent_x.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true}));
  ok(d.querySelector("#modal h3").textContent==="Session bearbeiten", "Einträge auch per Tastatur (Enter) öffnen"); w.eval("closeModal()");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[69] Version 11.8.1: Dialoge erben keine Listener vorheriger Dialoge");
  ({w,d,errs,S} = await boot());
  w.eval("navigate('tactics'); openAiPromptModal()"); w.eval("closeModal()");
  w.eval("showHub('diary')"); d.querySelector('#hubRoot [data-d="addSession"]').click();
  const tL = d.querySelector('#modal [data-f="title"]'); tL.value = "x"; tL.dispatchEvent(new w.Event("input", {bubbles:true}));
  ok(errs.length===0, "Nach dem KI-Prompt-Dialog: Tippen in einem anderen Dialog löst keinen Fehler mehr aus (seit 11.5)");
  w.eval("closeModal()");
  for(let i=0;i<3;i++){ d.querySelector('#hubRoot [data-d="addSession"]').click(); w.eval("closeModal()"); }
  d.querySelector('#hubRoot [data-d="addSession"]').click();
  const PNGL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  w.eval(`dModalAddImage("${PNGL}"); dModalAddImage("${PNGL}"); dModalAddImage("${PNGL}")`);
  d.querySelector('#modal [data-d-imgdel="0"]').click();
  ok(d.querySelectorAll("#dImgs .d-thumb img").length===2, "Nach mehreren geöffneten Dialogen entfernt ✕ genau EIN Bild");
  ok(d.querySelectorAll("#modal").length===1 && d.querySelector("#modal").getAttribute("role")===d.querySelector("#modal").getAttribute("role"), "Genau ein Dialog-Container, Eigenschaften erhalten");
  w.eval("closeModal()");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[70] Version 11.8.2: Ordner-Sicherung auch für Hub & Tagebuch");
  ({w,d,errs,S} = await boot());
  w.showDirectoryPicker = ()=>{};
  w.eval(`(()=>{ const files = new Map(); window.__files = files; window.__writes = {};
    backupDir = {name:"Sicherung",
      async getFileHandle(n){ return {async createWritable(){ let buf = ""; return {async write(t){ buf += t; }, async close(){ files.set(n, {text:buf, modified:Date.now()}); window.__writes[n] = (window.__writes[n] || 0) + 1; }}; }}; },
      async *entries(){ for(const [n, f] of files) yield [n, {kind:"file", async getFile(){ return {size:f.text.length, lastModified:f.modified, text: async ()=>f.text}; }}]; },
      async removeEntry(n){ files.delete(n); }};
    backupPerm = "granted"; const c = backupCfg(); c.enabled = true; saveBackupCfg(c);
    diary.sessions.push({id:"g1", start:Date.now(), minutes:30, slotId:slotIndex.active, title:"Gesichert?", mood:"good", images:["img1"]}); store.setItem(IMG_PREFIX + "img1", "data:image/png;base64,AAAA"); saveDiary();
    hub.name = "Mein Hub"; saveHub(); })()`);
  await w.eval(`writeFolderBackup("Automatisch")`);
  const GF_G = "fm27__hub-und-tagebuch_aktuell.json", file_G = () => JSON.parse(w.eval(`window.__files.get("${GF_G}").text`));
  ok(w.eval(`window.__files.has("${GF_G}")`) && w.eval(`[...window.__files.keys()].some(n=>/^fm27__hub-und-tagebuch_\\d{4}-\\d{2}-\\d{2}\\.json$/.test(n))`), "Eigene Datei 'Hub, Tagebuch & Einstellungen' + Tageskopie im Ordner");
  const st_G = file_G().storage;
  ok(file_G().kind==="global" && JSON.parse(st_G.fm27_diary).sessions.some(s=>s.title==="Gesichert?") && JSON.parse(st_G.fm27_hub).name==="Mein Hub" && st_G["fm27_img_img1"]==="data:image/png;base64,AAAA", "Enthält Tagebuch, Hub und Bilder");
  ok(!("fm27_admin" in st_G) && !Object.keys(st_G).some(k=>k.startsWith("fm27_slot_")), "Ohne Admin-PIN und ohne Spielstände (die haben eigene Dateien)");
  const n1_G = w.eval(`window.__writes["${GF_G}"]`);
  w.eval(`state.players[0].note = "nur Spielstand geändert"; saveState()`); await w.eval(`writeFolderBackup("Automatisch")`);
  ok(w.eval(`window.__writes["${GF_G}"]`)===n1_G, "Nur der Spielstand geändert → große Hub/Tagebuch-Datei wird NICHT neu geschrieben");
  w.eval(`diary.challenges.push({id:"cx", title:"Neue Challenge", kind:"simple", status:"active", createdAt:Date.now()}); saveDiary()`);
  ok(w.eval("!!backupTimer"), "Änderung im Tagebuch plant die Sicherung ein");
  await w.eval(`writeFolderBackup("Automatisch")`);
  ok(w.eval(`window.__writes["${GF_G}"]`)===n1_G+1 && JSON.parse(file_G().storage.fm27_diary).challenges.some(c=>c.title==="Neue Challenge"), "… und schreibt die Datei mit dem neuen Stand");
  // overview card
  const g_G = w.eval(`groupBackupFiles([...window.__files.entries()].map(([name, f])=>({name, size:f.text.length, modified:f.modified})))`);
  ok(g_G.global.current && g_G.global.current.name===GF_G && g_G.global.daily.length===1 && !g_G.orphans.some(o=>o.name.includes("hub-und-tagebuch")) && !g_G.other.some(f=>f.name.includes("hub-und-tagebuch")), "Übersicht: eigene Gruppe, nicht als 'ohne Spielstand' oder 'sonstige' einsortiert");
  w.eval("setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = 'backup'; navigate('admin')"); await new Promise(r=>setTimeout(r,60));
  ok(d.querySelector("#folderBackupList .bk-global") && d.querySelector("#folderBackupList .bk-global").textContent.includes("Hub, Tagebuch") && d.querySelector("#folderBackupList .bk-global [data-bk-load]"), "Admin-Zentrale → Sicherung: Karte 'Hub, Tagebuch & Einstellungen' mit 'Laden …'");
  // restore
  const saved_G = w.eval(`window.__files.get("${GF_G}").text`);
  w.eval(`diary.sessions = []; diary.challenges = []; saveDiary(); window.__reloaded = false; reloadApp = ()=>{ window.__reloaded = true; };`);
  w.eval(`handleBackupText(${JSON.stringify(saved_G)})`);
  ok(d.querySelector("#modal h3").textContent.includes("Hub, Tagebuch") && d.querySelector("#modal").textContent.includes("1 Sessions") && d.querySelector("#modal").textContent.includes("Spielstände bleiben unberührt"), "Wiederherstellen: Dialog mit Inhalt, Spielstände bleiben unberührt");
  const noteBefore_G = S().players[0].note;
  d.querySelector("[data-modal-save]").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_diary")).sessions.some(s=>s.title==="Gesichert?") && w.eval("window.__reloaded") && S().players[0].note===noteBefore_G, "Tagebuch zurück, Seite lädt neu, Spielstand unverändert");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[71] Version 11.9: Karriere-Begleiter (Beta)");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  const CR_K = () => JSON.parse(w.localStorage.getItem("fm27_career") || "null"), qC_K = sel => d.querySelector("#hubRoot " + sel);
  ok(qC_K('[data-hub-open="career"] .beta-pill') && qC_K('[data-hub-open="career"]').textContent.includes("Noch keine Karriere"), "Hub: Karriere-Begleiter aktiv (Beta)");
  qC_K('[data-hub-open="career"] p').click();
  ok(qC_K(".career-page .diary-empty") && qC_K('[data-cr="new"]'), "Leere Übersicht mit '+ Neue Karriere'");
  qC_K('[data-cr="new"]').click();
  d.querySelector('#modal [data-f="name"]').value = "Road to Glory"; d.querySelector('#modal [data-f="game"]').value = "EA SPORTS FC 26";
  d.querySelector('#modal [data-f="team"]').value = "Wrexham AFC"; d.querySelector('#modal [data-f="season"]').value = "2025/26"; d.querySelector("[data-modal-save]").click();
  const cr1_K = CR_K().careers[0];
  ok(cr1_K.name==="Road to Glory" && cr1_K.crest==="WA" && cr1_K.columns.map(c=>c.name).join()==="Name,Position,Alter,Wertung,Notiz" && cr1_K.seasons[0].label==="2025/26" && qC_K(".cr-title h1").textContent.includes("Road to Glory"), "Angelegt mit Fußball-Vorlage, Kürzel automatisch, direkt geöffnet");
  qC_K('[data-cr="addRow"]').click(); qC_K('[data-cr="addRow"]').click();
  const cells_K = () => [...d.querySelectorAll("#hubRoot [data-cr-cell]")];
  const setCell_K = (i, v) => { const c = cells_K()[i]; c.value = v; c.dispatchEvent(new w.Event("change", {bubbles:true})); };
  setCell_K(0, "Paul Mullin"); setCell_K(3, "78"); setCell_K(5, "Ollie Palmer"); setCell_K(8, "81");
  ok(CR_K().careers[0].rows.length===2 && Object.values(CR_K().careers[0].rows[0].cells).includes("Paul Mullin"), "Zeilen hinzufügen, Zellen direkt bearbeiten (sofort gespeichert)");
  const wert_K = cr1_K.columns.find(c=>c.name==="Wertung").id;
  qC_K(`[data-cr-sort="${wert_K}"]`).click(); qC_K(`[data-cr-sort="${wert_K}"]`).click();
  ok(cells_K()[0].value==="Ollie Palmer" && qC_K(`[data-cr-sort="${wert_K}"]`).textContent.includes("▼"), "Sortieren nach Wertung (absteigend: 81 vor 78)");
  qC_K('[data-cr="cols"]').click();
  d.querySelector('#modal [data-f="cols"]').value = "Name\nPosition\nWertung #\nMarktwert #"; d.querySelector("[data-modal-save]").click();
  ok(CR_K().careers[0].columns.map(c=>c.name).join()==="Name,Position,Wertung,Marktwert" && CR_K().careers[0].columns.find(c=>c.name==="Wertung").id===wert_K && Object.values(CR_K().careers[0].rows[0].cells).includes("78"), "Spalten ändern: Werte bleiben erhalten, neue Spalte dazu");
  // goals
  qC_K('[data-cr-tab="goals"]').click();
  d.querySelector("#crNewGoal").value = "Aufstieg in die Championship"; qC_K('[data-cr="addGoal"]').click();
  d.querySelector("#crNewGoal").value = "FA-Cup-Viertelfinale"; qC_K('[data-cr="addGoal"]').click();
  const gs_K = d.querySelector("#hubRoot [data-cr-gstatus]"); gs_K.value = "done"; gs_K.dispatchEvent(new w.Event("change", {bubbles:true}));
  ok(CR_K().careers[0].seasons[0].goals.length===2 && CR_K().careers[0].seasons[0].goals[0].status==="done" && qC_K(".diary-side").textContent.includes("1 / 2"), "Ziele anlegen und abhaken (1 / 2 erreicht)");
  // season close
  qC_K('[data-cr-tab="seasons"]').click(); qC_K('[data-cr="nextSeason"]').click();
  ok(d.querySelector('#modal [data-f="label"]').value==="2026/27", "Saison abschließen schlägt '2026/27' vor");
  d.querySelector("[data-modal-save]").click();
  const sz_K = CR_K().careers[0].seasons;
  ok(sz_K.length===2 && sz_K[0].closed && sz_K[0].goals[1].status==="miss" && sz_K[1].label==="2026/27" && sz_K[1].goals.length===0 && CR_K().careers[0].rows.length===2, "Neue Saison: alte geschlossen (offenes Ziel → verfehlt), Liste bleibt, Ziele neu");
  qC_K(`[data-cr-season="${sz_K[0].id}"]`).click();
  d.querySelector('#modal [data-f="place"]').value = "1. Platz"; d.querySelector('#modal [data-f="w"]').value = "28"; d.querySelector('#modal [data-f="titles"]').value = "Meister League One"; d.querySelector("[data-modal-save]").click();
  ok(qC_K(".cr-seasons").textContent.includes("1. Platz") && qC_K(".cr-seasons").textContent.includes("28-0-0") && qC_K(".cr-seasons").textContent.includes("Meister League One"), "Saisonverlauf: Platz, Bilanz, Titel");
  // diary link
  qC_K('[data-cr="session"]').click();
  ok(w.eval("hubView")==="diary" && JSON.parse(w.localStorage.getItem("fm27_diary")).running.careerId===cr1_K.id && qC_K(".diary-run").textContent.includes("Road to Glory"), "'▶ Session starten' in der Karriere: Timer läuft für diese Karriere");
  w.eval("diary.running.start = Date.now() - 30*60000; saveDiary(); renderHub()"); qC_K('[data-d="stop"]').click();
  ok(d.querySelector('#modal [data-f="target"]').value==="career:" + cr1_K.id && d.querySelector('#modal optgroup[label="Karriere-Begleiter"]'), "Beenden: Karriere vorausgewählt, eigene Gruppe in der Auswahl");
  d.querySelector('#modal [data-f="title"]').value = "Derby gegen Chester"; d.querySelector("[data-modal-save]").click();
  ok(qC_K(".diary-timeline").textContent.includes("Road to Glory") && qC_K(".diary-timeline .sm-crest").textContent==="WA", "Tagebuch zeigt die Karriere mit ihrem Wappen");
  w.eval(`crView.id = "${cr1_K.id}"; showHub("career")`);
  ok(qC_K(".cr-session") && qC_K(".diary-side").textContent.includes("Derby gegen Chester"), "Karriere zeigt ihre letzten Sessions");
  // Esc, hub tile, backup
  d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
  ok(qC_K(".cr-grid .cr-card") && qC_K(".cr-card").textContent.includes("2026/27"), "Esc: aus der Karriere zur Übersicht");
  d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
  ok(qC_K(".hub2-hero") && qC_K('[data-hub-open="career"]').textContent.includes("1 Karriere · zuletzt: Road to Glory"), "Esc: zur Hub-Startseite, Kachel mit Status");
  ok(w.eval("globalBackupKeys()").includes("fm27_career") && w.eval("storageEntries()").find(e=>e.key==="fm27_career").label==="Karriere-Begleiter", "In Ordner-Sicherung und Speicher-Hausmeister enthalten");
  w.eval(`crView.id = "${cr1_K.id}"; showHub("career")`); qC_K('[data-cr="edit"]').click(); d.querySelector("#modal [data-cr-del]").click();
  ok(CR_K().careers.length===0 && qC_K(".diary-empty"), "Karriere löschen");
  d.querySelector("#toastUndoBtn").click(); ok(CR_K().careers.length===1, "… rückgängig");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[72] Version 11.9.1: Tippen im Hub löst keine Kürzel aus");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  const smHidden = () => !d.querySelector("#saveMenu") || d.querySelector("#saveMenu").hidden;
  const typeIn = (el, key) => { el.focus(); el.dispatchEvent(new w.KeyboardEvent("keydown", {key, bubbles:true, cancelable:true})); };
  let ta = null, taTab = "";
  for(const t of ["notes","lists","raw","fields","log","security"]){
    w.eval(`setPin('1'); adminUnlocked = true; adminLastActivity = Date.now(); adminTab = '${t}'; showHub('admin')`);
    ta = d.querySelector("#adminBody textarea, #adminBody input[type=text], #adminBody input[type=search], #adminBody input:not([type])"); if(ta){ taTab = t; break; } }
  ok(ta, "Admin-Zentrale: Textfeld vorhanden (Bereich "+taTab+")");
  typeIn(ta, "s"); typeIn(ta, "S"); typeIn(ta, "?");
  ok(smHidden() && !d.querySelector("#modalOverlay").classList.contains("active"), "Tippen von s / S / ? in der Admin-Zentrale öffnet weder Spielstand-Menü noch Hilfe (Fehler seit 11.7)");
  w.eval(`career.careers.push(sanitizeCareer({careers:[{id:"kx", name:"Test", columns:[{id:"c1", name:"Name"}], rows:[{id:"r1", cells:{}}]}]}).careers[0]); saveCareer(); crView = {id:"kx", tab:"list", sort:null}; showHub("career")`);
  typeIn(d.querySelector("#hubRoot [data-cr-cell]"), "s");
  ok(smHidden(), "Tippen in einer Tabellenzelle des Karriere-Begleiters: kein Spielstand-Menü (Fehler seit 11.9)");
  w.eval(`crView.tab = "goals"; renderHub()`); typeIn(d.querySelector("#crNewGoal"), "s");
  ok(smHidden(), "… auch nicht im Ziel-Feld");
  typeIn(d.querySelector("#crNewGoal"), "k"); d.querySelector("#crNewGoal").dispatchEvent(new w.KeyboardEvent("keydown", {key:"k", ctrlKey:true, bubbles:true, cancelable:true}));
  ok(d.querySelector("#cmdOverlay").classList.contains("active"), "Strg + K öffnet die Befehlspalette auch beim Tippen");
  w.eval("closeCmd ? closeCmd() : document.querySelector('#cmdOverlay').classList.remove('active')");
  d.activeElement && d.activeElement.blur && d.activeElement.blur();
  d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"s", bubbles:true, cancelable:true}));
  ok(!smHidden(), "Außerhalb von Textfeldern öffnet S im Hub weiterhin die Spielstände");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  console.log("\n[73] 12.0 Vorschau 1: Medien – Links, Galerie, eigener Player");
  ({w,d,errs,S} = await boot(Object.assign(ls=>{}, {hub:true})));
  const PV_M = u => JSON.stringify(w.eval(`parseVideoLink(${JSON.stringify(u)})`));
  ok(PV_M("https://youtu.be/dQw4w9WgXcQ").includes('"youtube"') && PV_M("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3").includes("dQw4w9WgXcQ") && PV_M("https://youtube.com/shorts/abcDEF12345").includes("abcDEF12345"), "YouTube-Links erkannt (youtu.be, watch, shorts)");
  ok(PV_M("https://clips.twitch.tv/FunnySlugName").includes('"twitch"') && PV_M("https://www.twitch.tv/streamer/clip/OtherSlug").includes("OtherSlug"), "Twitch-Clips erkannt");
  ok(PV_M("https://example.com/goal.mp4").includes('"file"') && PV_M("https://medal.tv/clip/123").includes('"other"') && PV_M("kein link")==="null" && PV_M("javascript:alert(1)")==="null", "Direkte Datei → eigener Player, unbekannt → neuer Tab, Unsinn/javascript: abgelehnt");
  w.eval("dTab = 'media'; showHub('diary')");
  ok(d.querySelector("#hubRoot .media-panel").textContent.includes("kann keine Ordner lesen"), "Browser ohne Ordner-Zugriff: klare Erklärung (Links gehen trotzdem)");
  w.showDirectoryPicker = ()=>{}; w.eval("renderHub()");
  const qM_M = sel => d.querySelector("#hubRoot " + sel);
  ok(qM_M(".media-panel") && qM_M('[data-media="choose"]'), "Tagebuch → Medien: 'Ordner wählen'");
  qM_M('[data-media="link"]').click(); d.querySelector('#modal [data-f="url"]').value = "https://youtu.be/dQw4w9WgXcQ"; d.querySelector('#modal [data-f="title"]').value = "Siegtor"; d.querySelector("[data-modal-save]").click();
  ok(JSON.parse(w.localStorage.getItem("fm27_diary")).links[0].title==="Siegtor" && qM_M(".media-link .k-youtube"), "Link gespeichert (im Tagebuch, also auch gesichert)");
  qM_M(".media-link").click();
  ok(d.querySelector("#modal iframe") && d.querySelector("#modal iframe").src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "YouTube spielt eingebettet (ohne Cookies-Domain)"); w.eval("closeModal()");
  // gallery with a fake folder
  w.eval(`(()=>{ const mk = (n, t) => ({kind:"file", name:n, getFile: async ()=>({name:n, size:2048000, lastModified:t}) });
    const sub = {kind:"directory", name:"FM26", async *entries(){ yield ["b.mp4", mk("b.mp4", 1700000000000)]; yield ["readme.txt", mk("readme.txt", 1)]; }};
    mediaDir = {name:"Captures", async *entries(){ yield ["a.webm", mk("a.webm", 1800000000000)]; yield ["FM26", sub]; }}; mediaPerm = "granted"; })()`);
  await w.eval("scanMedia()");
  ok(w.eval("mediaFiles.map(f=>f.path).join()")==="a.webm,FM26/b.mp4" && d.querySelectorAll("#hubRoot .media-card").length===2 && qM_M("#mediaSub"), "Ordner eingelesen: 2 Videos (neueste zuerst), Unterordner, andere Dateien ignoriert");
  const ms_M = qM_M("#mediaSearch"); ms_M.value = "b.mp"; ms_M.dispatchEvent(new w.Event("input", {bubbles:true}));
  ok(d.querySelectorAll("#hubRoot .media-card").length===1 && d.activeElement.id==="mediaSearch", "Suche filtert, Fokus bleibt");
  w.eval("mediaQuery = ''; mediaPerm = 'prompt'; renderHub()");
  ok(qM_M('[data-media="resume"]') && qM_M(".media-panel").textContent.includes("Captures"), "Nach Neustart: 'Ordner wieder verbinden'"); w.eval("mediaPerm = 'granted'; renderHub()");
  // player
  w.HTMLMediaElement.prototype.play = function(){ this.__playing = true; Object.defineProperty(this, "paused", {value:false, configurable:true}); this.dispatchEvent(new w.Event("play")); return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function(){ Object.defineProperty(this, "paused", {value:true, configurable:true}); this.dispatchEvent(new w.Event("pause")); };
  w.HTMLMediaElement.prototype.load = function(){};
  w.eval(`openVideoPlayer({src:"blob:test", title:"Testclip"})`);
  const V_M = () => d.querySelector(".vp-root video");
  Object.defineProperty(V_M(), "duration", {value:60, configurable:true});
  ok(d.querySelector(".vp-root[role=dialog]") && d.querySelector(".vp-title").textContent.includes("Testclip") && d.querySelectorAll(".vp-root [data-vp]").length >= 10 && d.querySelector(".vp-seek[role=slider]"), "Player: Dialog mit eigener Steuerung (Zeitleiste als Slider, ≥10 Knöpfe)");
  const key_M = k => d.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, cancelable:true}));
  key_M("5"); ok(Math.round(V_M().currentTime)===30, "Taste 5 → 50 %");
  key_M("l"); ok(Math.round(V_M().currentTime)===40, "L → +10 s"); key_M("ArrowLeft"); ok(Math.round(V_M().currentTime)===35, "← → −5 s");
  key_M("]"); ok(V_M().playbackRate===1.25, "] → schneller (1,25×)"); key_M("["); key_M("["); ok(V_M().playbackRate===0.75, "[ → langsamer");
  key_M("m"); ok(V_M().muted===true, "M → stumm"); key_M("ArrowUp"); ok(V_M().volume > 0, "↑ → lauter");
  key_M("s"); ok(!d.querySelector("#saveMenu") || d.querySelector("#saveMenu").hidden, "Andere Tasten (s) erreichen das Dashboard nicht, solange der Player offen ist");
  d.querySelector('.vp-root [data-vp="loop"]').click(); ok(V_M().loop && d.querySelector('.vp-root [data-vp="loop"]').getAttribute("aria-pressed")==="true", "Wiederholen umschaltbar");
  key_M("Escape");
  ok(!d.querySelector(".vp-root") && !w.__vpOpen && w.eval("hubView")==="diary", "Esc schließt nur den Player");
  ok(JSON.parse(w.localStorage.getItem("fm27_player")).rate===0.75, "Tempo/Lautstärke werden gemerkt");
  ok(errs.length===0, "keine Laufzeitfehler "+errs.join("; "));

  // Regression (found in the real browser): header cells are sticky, so a grip reaching past the cell border
  // is covered by the next header cell and cannot be clicked. The grip must stay inside its own cell.
  const cssText = require("fs").readFileSync(DIR+"style.css","utf8");
  const gripRule = (/\.col-resizer\{([^}]*)\}/.exec(cssText) || [])[1] || "";
  ok(/right:0(;|$)/.test(gripRule) && !/right:-/.test(gripRule), "Ziehgriff liegt vollständig in der eigenen Kopfzelle (right:0)");
  console.log(failures ? `\n${failures} FEHLER` : "\nALLE TESTS BESTANDEN");
  process.exitCode = failures ? 1 : 0;            // GitHub Actions: red ✗ on any failed check
  setTimeout(()=>process.exit(), 50);              // open test windows keep timers (e.g. the hub clock) alive – end explicitly
})().catch(err=>{ console.error("\nABBRUCH:", err && err.stack || err); process.exitCode = 1; setTimeout(()=>process.exit(1), 50); });   // never linger after an abort (timers keep the process alive)

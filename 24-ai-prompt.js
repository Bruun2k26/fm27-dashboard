/* ==========================================================================
   KI-PROMPT (11.5 Beta) – "Weg A": the dashboard writes a complete request from YOUR data
   (squad, tactic in both phases, results, next opponent) – you paste it into Claude or any AI.
   Nothing is sent automatically; no account, no key in the dashboard.
   ========================================================================== */
const AI_PRESETS = {
  improve:["Taktik verbessern", "Wie kann ich meine Taktik – mit Ball und gegen den Ball – mit genau diesem Kader verbessern?"],
  next:["Plan für das nächste Spiel", "Wie stelle ich mich gegen meinen nächsten Gegner auf, und was sollte ich an Formation, Rollen und Anweisungen anpassen?"],
  analyse:["Analyse der letzten Spiele", "Was sagen meine letzten Ergebnisse über meine Taktik aus? Was läuft gut, was nicht – und warum?"],
  roles:["Rollen & Aufstellung prüfen", "Passen meine Spieler zu ihren Rollen? Wer aus meinem Kader wäre in welcher Rolle die bessere Wahl?"],
  own:["Nur eigene Frage", ""]
};
const AI_PARTS = {tactic:"Taktik (beide Phasen)", squad:"Kader", results:"Letzte Ergebnisse", record:"Bilanz der Taktik-Pläne", next:"Nächster Gegner"};
const aiDate = iso => iso ? fmtDate(iso, {day:"2-digit", month:"2-digit", year:"numeric"}) : "";

function aiPromptText(o){
  o = Object.assign({preset:"improve", extra:"", tactic:true, squad:true, results:true, record:true, next:true}, o || {});
  const nat = isNat(), L = [];
  const plan = state.plans.find(p=>p.id === state.activePlanId) || {name:"Plan"};
  const question = [AI_PRESETS[o.preset] ? AI_PRESETS[o.preset][1] : "", (o.extra || "").trim()].filter(Boolean).join("\n\nZusätzlich: ");
  L.push(`Du bist ein erfahrener Taktik-Experte für Football Manager. Ich spiele Football Manager und brauche deine Hilfe.`);
  L.push(``, `**Meine Frage:** ${question || "(bitte ergänzen)"}`);
  L.push(``, `## ${nat ? "Mein Nationalteam" : "Mein Verein"}`,
    `- ${nat ? "Nationalmannschaft" : "Verein"}: ${state.club.name}`, `- Saison: ${state.club.season || "–"} · Spieldatum: ${aiDate(state.club.ingameDate)}`);
  if(o.tactic){
    const f = state.formationName, defs = formationDefs(f), slots = slotsFor(state, f), t = state.tactics[f], of = oopFormOf(t);
    const oopCat = i => of && validOopMap(t.oopMap, defs.length) ? FORMATIONS[of][t.oopMap[i]].cat : defs[i].cat;
    const rn = r => r ? (ROLE_INFO[r] ? `${r} (${ROLE_INFO[r].en})` : r) : "–";
    const used = new Set();
    const row = phase => defs.map((d,i)=>{ const sl = slots[i], p = sl && playerById(sl.playerId);
      const role = sl ? (phase === "out" ? sl.roleOut : sl.roleIn) : ""; if(role) used.add(role);
      return `| ${phase === "out" ? oopCat(i) : d.cat} | ${p ? p.name : "(unbesetzt)"} | ${rn(role)} |`; }).join("\n");
    L.push(``, `## Meine Taktik: ${plan.name} – mit Ball ${f}${of ? `, gegen den Ball ${of}` : ` (gegen den Ball dieselbe Formation, kompakter)`}`,
      ``, `### Mit Ball (in Ballbesitz) – ${f}`, `| Position | Spieler | Rolle |`, `|---|---|---|`, row("in"),
      ``, `### Gegen den Ball – ${of || f}`, `| Position | Spieler | Rolle |`, `|---|---|---|`, row("out"));
    const legend = [...used].filter(r=>ROLE_INFO[r]).map(r=>`- **${r}** (${ROLE_INFO[r].en}, ${({both:"mit & gegen Ball", in:"mit Ball", out:"gegen den Ball"})[ROLE_INFO[r].phase]}): ${ROLE_INFO[r].desc}`);
    if(legend.length) L.push(``, `### Rollen-Legende`, legend.join("\n"));
    const cats = [...new Set(defs.map(d=>d.cat).concat(defs.map((d,i)=>oopCat(i))))];
    L.push(``, `### Verfügbare Rollen in Football Manager 26 (nur diese Namen verwenden)`,
      cats.map(c=>`- ${c} – mit Ball: ${ROLES_IP[c].join(", ")} · gegen den Ball: ${ROLES_OOP[c].join(", ")}`).join("\n"));
  }
  if(o.squad){
    let squad = state.players.slice();
    if(nat && squad.some(p=>p.nominated)) squad = squad.filter(p=>p.nominated);
    squad.sort((a,b)=>POS_LIST.indexOf(a.pos) - POS_LIST.indexOf(b.pos) || b.rating - a.rating);
    L.push(``, `## ${nat && squad.some(p=>p.nominated) ? "Nominierter Kader" : "Kader"} (${squad.length} Spieler, Einschätzung 1–5 Sterne)`,
      `| Spieler | Position | Nebenpositionen | Alter | Einschätzung | Kaderrolle | Status |`, `|---|---|---|---|---|---|---|`,
      squad.map(p=>`| ${p.name} | ${p.pos} | ${(p.altPos || []).join(", ") || "–"} | ${p.age || "–"} | ${p.rating || "–"} | ${SQUAD_ROLES[p.squadRole] || "–"} | ${p.status ? (STATUS[p.status] || p.status) : "fit"} |`).join("\n"));
  }
  const res = state.results.slice().sort((a,b)=>(b.date || "").localeCompare(a.date || ""));
  if(o.results){
    L.push(``, `## Letzte Ergebnisse`);
    L.push(res.length ? res.slice(0,5).map(r=>`- ${aiDate(r.date)} · ${r.venue === "A" ? "auswärts" : r.venue === "N" ? "neutral" : "zu Hause"} gegen ${r.opponent || "?"}: ${r.gf}:${r.ga}${r.competition ? ` (${r.competition})` : ""}${r.planName || r.formation ? ` · meine Taktik: ${[r.planName, r.formation].filter(Boolean).join(", ")}` : ""}${r.oppFormation ? ` · Gegner im ${r.oppFormation}` : ""}`).join("\n") : "- noch keine Ergebnisse eingetragen");
  }
  if(o.record){
    const by = {}; res.forEach(r=>{ const k = r.planName || r.formation || "ohne Plan"; (by[k] = by[k] || []).push(r); });
    const lines = Object.entries(by).map(([k, list])=>{ const w = list.filter(r=>r.gf > r.ga).length, d = list.filter(r=>r.gf === r.ga).length, l = list.length - w - d;
      return `- ${k}: ${list.length} Spiele · ${w} S, ${d} U, ${l} N · ${fmtNum((w * 3 + d) / list.length, 2)} Punkte pro Spiel · Tore ${list.reduce((a,r)=>a + r.gf, 0)}:${list.reduce((a,r)=>a + r.ga, 0)}`; });
    if(lines.length) L.push(``, `## Bilanz meiner Taktik-Pläne`, lines.join("\n"));
  }
  if(o.next){
    const n = state.nextMatch, op = n.opponent ? opponentEntry(n.opponent) : null;
    if(n.opponent){
      const bits = [`- Gegner: ${n.opponent}${n.venue === "A" ? " (auswärts)" : n.venue === "N" ? " (neutral)" : " (zu Hause)"}${n.competition ? ` · ${n.competition}` : ""}${n.date ? ` · ${aiDate(n.date)}` : ""}`];
      const fm = n.formation || (op && op.formation); if(fm) bits.push(`- Formation des Gegners: ${fm}`);
      const kt = n.keyThreat || (op && op.keyThreat); if(kt) bits.push(`- Hauptgefahr: ${kt}`);
      const wk = n.weaknesses || (op && op.weaknesses); if(wk) bits.push(`- Schwächen des Gegners: ${wk}`);
      if(op && op.notes) bits.push(`- Meine Notizen zum Gegner: ${op.notes}`);
      if(n.matchplan) bits.push(`- Mein bisheriger Matchplan: ${n.matchplan}`);
      const prev = res.filter(r=>oppKey(r.opponent) === oppKey(n.opponent));
      if(prev.length) bits.push(`- Frühere Spiele gegen diesen Gegner: ${prev.slice(0,4).map(r=>`${r.gf}:${r.ga}`).join(", ")}`);
      L.push(``, `## Nächstes Spiel`, bits.join("\n"));
    }
  }
  L.push(``, `## So antwortest du bitte`,
    `1. Kurze Einschätzung (3–5 Sätze).`,
    `2. Konkrete Änderungen: Formation mit Ball und gegen den Ball, Rollen **mit Ball**, Rollen **gegen den Ball**, Mannschaftsanweisungen.`,
    `3. Welche Spieler aus meinem Kader in welche Rolle passen – bitte nur Spieler aus meiner Liste.`,
    `4. Worauf ich im nächsten Spiel achten soll.`,
    `Verwende für Rollen ausschließlich die oben aufgeführten Namen aus Football Manager 26 (deutsch, gern mit englischem Namen in Klammern), und antworte auf Deutsch.`);
  return L.join("\n");
}
async function aiCopy(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta = qs("#aiPreview"); if(ta){ ta.focus(); ta.select(); try{ if(document.execCommand("copy")) return true; }catch(err){} }
    return false;
  }
}
function openAiPromptModal(){
  openModal({title:"KI-Prompt kopieren", wide:true, body:`
    <p class="lead" style="margin-top:0">Stellt eine fertige Anfrage aus deinen Daten zusammen – zum Einfügen bei Claude oder einer anderen KI. <strong>Es wird nichts automatisch gesendet.</strong> <span class="beta-pill">Beta</span></p>
    <div class="field-row"><div class="field"><label>Worum geht's?</label><select data-f="preset">${Object.entries(AI_PRESETS).map(([k,[l]])=>`<option value="${k}">${l}</option>`).join("")}</select></div></div>
    <div class="field"><label>Zusatz oder eigene Frage (optional)</label><textarea data-f="extra" rows="2" placeholder="z. B. Wir kassieren viele Gegentore nach Kontern über die linke Seite."></textarea></div>
    <div class="ai-parts" role="group" aria-label="Was soll in den Prompt?">${Object.entries(AI_PARTS).map(([k,l])=>`<label class="check-label"><input type="checkbox" data-ai-part="${k}" checked> ${l}</label>`).join("")}</div>
    <div class="field"><label for="aiPreview">Vorschau</label><textarea id="aiPreview" rows="12" readonly></textarea><span class="muted small" id="aiCount"></span></div>
    <div class="ai-copy-row"><button class="btn btn-accent" type="button" id="aiCopyBtn">📋 Prompt kopieren</button><span class="muted small">Danach bei Claude (claude.ai) oder einer anderen KI einfügen.</span></div>`,
    saveLabel:"Schließen",
    onOpen: m=>{
      const opts = () => Object.assign({preset:qs('[data-f="preset"]', m).value, extra:qs('[data-f="extra"]', m).value},
        Object.fromEntries(qsa("[data-ai-part]", m).map(c=>[c.dataset.aiPart, c.checked])));
      const upd = () => { const t = aiPromptText(opts()); qs("#aiPreview", m).value = t; qs("#aiCount", m).textContent = `${t.length.toLocaleString("de-DE")} Zeichen`; };
      m.addEventListener("input", upd); m.addEventListener("change", upd); upd();
      qs("#aiCopyBtn", m).addEventListener("click", async ()=>{
        const ok = await aiCopy(qs("#aiPreview", m).value);
        toast(ok ? "Prompt kopiert – jetzt bei Claude oder einer anderen KI einfügen" : "Kopieren nicht möglich – Text in der Vorschau markieren und mit Strg + C kopieren", {duration:6000});
        if(ok){ const b = qs("#aiCopyBtn", m); b.textContent = "✓ Kopiert"; setTimeout(()=>{ if(b.isConnected) b.textContent = "📋 Prompt kopieren"; }, 2500); }
      });
    }});
}
{ const b = qs("#btnAiPrompt"); if(b) b.addEventListener("click", openAiPromptModal); }

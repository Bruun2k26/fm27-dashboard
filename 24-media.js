/* ==========================================================================
   MEDIEN (12.0 Vorschau) – videos from a local folder (read only, Chromium) and links.
   The folder is only READ: nothing is copied into the dashboard, so backups stay small.
   Thumbnails are cached outside the data store (kv store "fm27_fs"), never in backups.
   Own player: custom controls on top of the browser's video decoder.
   YouTube / Twitch play in their own embedded players (their terms don't allow anything else).
   ========================================================================== */
const MEDIA_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i, MEDIA_MAX = 1500;
let mediaDir = null, mediaPerm = "none", mediaFiles = [], mediaScanning = false, mediaQuery = "", mediaSub = "";
const mediaThumbs = new Map();       // key → {url, dur} | "pending" | "fail"
let thumbQueue = [], thumbBusy = false;

/* ---------- folder ---------- */
async function initMedia(){
  if(!fsSupported()) return;
  const h = await kvGet("mediaDir"); if(!h) return;
  mediaDir = h;
  try{ mediaPerm = await h.queryPermission({mode:"read"}); }catch(e){ mediaPerm = "prompt"; }
  if(mediaPerm === "granted") scanMedia();
}
async function chooseMediaFolder(){
  if(!fsSupported()){ toast("Dein Browser kann keine Ordner lesen – bitte Chrome, Edge oder Vivaldi nutzen."); return; }
  try{
    const h = await window.showDirectoryPicker({id:"fm27media", mode:"read", startIn:"videos"});
    mediaDir = h; mediaPerm = "granted"; await kvSet("mediaDir", h);
    toast(`Medien-Ordner „${h.name}“ verbunden`); await scanMedia();
  }catch(e){ if(e && e.name !== "AbortError") toast("Ordner konnte nicht geöffnet werden: " + (e.message || e.name)); }
}
async function resumeMedia(){
  if(!mediaDir) return;
  try{ mediaPerm = await mediaDir.requestPermission({mode:"read"}); }catch(e){ mediaPerm = "prompt"; }
  if(mediaPerm === "granted") await scanMedia(); else renderHub();
}
async function disconnectMedia(){ mediaDir = null; mediaPerm = "none"; mediaFiles = []; await kvSet("mediaDir", null); renderHub(); toast("Medien-Ordner getrennt – deine Videos bleiben unverändert auf dem PC."); }
async function scanMedia(){
  if(!mediaDir || mediaScanning) return;
  mediaScanning = true; renderHub();
  const out = [];
  async function walk(dir, path, depth){
    for await (const [name, h] of dir.entries()){
      if(out.length >= MEDIA_MAX) return;
      if(h.kind === "directory"){ if(depth < 3 && !name.startsWith(".")) await walk(h, path ? `${path}/${name}` : name, depth + 1); }
      else if(MEDIA_EXT.test(name)){ try{ const f = await h.getFile(); out.push({path:path ? `${path}/${name}` : name, folder:path, name, size:f.size, mtime:f.lastModified, handle:h}); }catch(e){} }
    }
  }
  try{ await walk(mediaDir, "", 0); }catch(e){ toast("Ordner konnte nicht gelesen werden: " + (e.message || e.name)); }
  mediaFiles = out.sort((a,b)=>b.mtime - a.mtime);
  mediaScanning = false; renderHub();
}
const mediaKey = f => `vthumb:${f.path}|${f.size}|${f.mtime}`;
/* ---------- thumbnails: one after another, only for cards on screen ---------- */
function queueThumb(f){
  const k = mediaKey(f); if(mediaThumbs.has(k)) return;
  mediaThumbs.set(k, "pending"); thumbQueue.push(f); pumpThumbs();
}
async function pumpThumbs(){
  if(thumbBusy) return; const f = thumbQueue.shift(); if(!f) return;
  thumbBusy = true; const k = mediaKey(f);
  try{
    let t = await kvGet(k);
    if(!t){ t = await makeThumb(await f.handle.getFile()); if(t) kvSet(k, t); }
    mediaThumbs.set(k, t || "fail");
  }catch(e){ mediaThumbs.set(k, "fail"); }
  const card = qs(`[data-media-card="${CSS.escape(f.path)}"]`); if(card) paintThumb(card, f);
  thumbBusy = false; pumpThumbs();
}
function makeThumb(file){
  return new Promise(res=>{
    const v = document.createElement("video"), url = URL.createObjectURL(file); let done = false;
    const finish = r => { if(done) return; done = true; clearTimeout(to); v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url); res(r); };
    const to = setTimeout(()=>finish(null), 8000);
    v.muted = true; v.preload = "metadata"; v.playsInline = true;
    v.onloadedmetadata = ()=>{ v.currentTime = Math.min(1.2, (v.duration || 2) * 0.15); };
    v.onseeked = ()=>{ try{ const c = document.createElement("canvas"), k = 320 / (v.videoWidth || 320); c.width = 320; c.height = Math.round((v.videoHeight || 180) * k);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); finish({url:c.toDataURL("image/jpeg", 0.72), dur:v.duration || 0}); }catch(e){ finish(null); } };
    v.onerror = ()=>finish(null);
    v.src = url;
  });
}
function paintThumb(card, f){
  const t = mediaThumbs.get(mediaKey(f)), box = qs(".media-thumb", card); if(!box) return;
  if(t && typeof t === "object"){ box.style.backgroundImage = `url('${t.url}')`; box.classList.add("ready"); const d = qs(".media-dur", card); if(d && t.dur) d.textContent = fmtDur(t.dur); }
  else if(t === "fail") box.classList.add("fail");
}
const fmtDur = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}` : `${m}:${String(r).padStart(2,"0")}`; };
/* ---------- links ---------- */
/** what kind of link is it? youtube / twitch → their embed, direct file → own player, else open in a new tab */
function parseVideoLink(raw){
  let u; try{ u = new URL(String(raw).trim()); }catch(e){ return null; }
  if(!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let m;
  if(host === "youtu.be" && (m = /^\/([\w-]{6,})/.exec(u.pathname))) return {kind:"youtube", id:m[1], url:u.href};
  if(/(^|\.)youtube\.com$/.test(host)){
    const id = u.searchParams.get("v") || ((m = /^\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname)) && m[2]);
    if(id) return {kind:"youtube", id, url:u.href};
  }
  if(host === "clips.twitch.tv" && (m = /^\/([\w-]+)/.exec(u.pathname)) && m[1] !== "embed") return {kind:"twitch", id:m[1], url:u.href};
  if(/(^|\.)twitch\.tv$/.test(host) && (m = /\/clip\/([\w-]+)/.exec(u.pathname))) return {kind:"twitch", id:m[1], url:u.href};
  if(MEDIA_EXT.test(u.pathname)) return {kind:"file", url:u.href};
  return {kind:"other", url:u.href};
}
function addLinkModal(){
  openModal({title:"Video-Link hinzufügen", body:`
    <div class="field"><label>Link</label><input data-f="url" placeholder="https://youtu.be/… · https://clips.twitch.tv/… · https://…/clip.mp4" autocomplete="off"></div>
    <div class="field"><label>Titel (optional)</label><input data-f="title" maxlength="100" placeholder="z. B. Siegtor im Derby"></div>
    <p class="hint">YouTube und Twitch spielen in ihrem eigenen eingebetteten Player; direkte Videodateien (.mp4, .webm) im Dashboard-Player.</p>`,
    saveLabel:"Hinzufügen",
    onSave: get=>{
      const p = parseVideoLink(get("url")); if(!p){ toast("Das ist kein gültiger Link (https://…)."); return false; }
      diaryUndo("Video-Link gespeichert", ()=>{ diary.links.unshift({id:uid(), url:p.url, title:get("title").trim(), addedAt:Date.now()}); });
    }});
}
function openLink(l){
  const p = parseVideoLink(l.url); if(!p) return;
  if(p.kind === "file") return openVideoPlayer({src:p.url, title:l.title || p.url.split("/").pop()});
  if(p.kind === "youtube" || p.kind === "twitch") return openEmbed(p, l.title);
  window.open(p.url, "_blank", "noopener");
}
function openEmbed(p, title){
  const src = p.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(p.id)}?autoplay=1&rel=0`
    : `https://clips.twitch.tv/embed?clip=${encodeURIComponent(p.id)}&parent=${encodeURIComponent(location.hostname || "localhost")}&autoplay=true`;
  openModal({title: title || (p.kind === "youtube" ? "YouTube" : "Twitch-Clip"), wide:true, body:`
    <div class="media-embed"><iframe src="${src}" title="${esc(title || "Video")}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <p class="hint">Wird vom Anbieter abgespielt und braucht Internet. <a href="${esc(p.url)}" target="_blank" rel="noopener">Im Browser öffnen ↗</a></p>`, saveLabel:"Schließen"});
}
/* ---------- gallery (in the game diary, tab "Medien") ---------- */
function mediaGalleryHTML(){
  const links = diary.links || [];
  const linkCards = links.length ? `<div class="hub2-card-head media-sub-head"><h3>Links</h3><span class="muted small">${links.length}</span></div>
    <div class="media-links">${links.map(l=>{ const p = parseVideoLink(l.url) || {kind:"other"}; return `<div class="media-link" data-media-link="${l.id}" role="button" tabindex="0">
      <span class="media-link-kind k-${p.kind}">${{youtube:"▶ YouTube", twitch:"▶ Twitch", file:"▶ Video", other:"↗ Link"}[p.kind]}</span>
      <span class="media-link-main"><strong>${esc(l.title || l.url)}</strong><span class="muted small">${esc(l.url.replace(/^https?:\/\//, "").slice(0,60))}</span></span>
      <button type="button" class="tc-arrow" data-media-linkdel="${l.id}" aria-label="Link entfernen">✕</button></div>`; }).join("")}</div>` : "";
  let body;
  if(!fsSupported()) body = `<div class="diary-empty"><p><strong>Dein Browser kann keine Ordner lesen.</strong></p><p class="muted">Lokale Videos gehen in Chrome, Edge oder Vivaldi. Links funktionieren überall.</p></div>`;
  else if(!mediaDir) body = `<div class="diary-empty"><p><strong>Verbinde deinen Aufnahme-Ordner</strong></p>
      <p class="muted">Das Dashboard liest den Ordner nur – es kopiert nichts und verändert nichts. Typische Orte: <em>Videos\\Captures</em> (Xbox Game Bar, Win + Alt + R), <em>Videos\\&lt;Spiel&gt;</em> (NVIDIA ShadowPlay) oder dein OBS-Ordner.</p>
      <button class="btn btn-accent" data-media="choose">📁 Ordner wählen</button></div>`;
  else if(mediaPerm !== "granted") body = `<div class="diary-empty"><p><strong>Medien-Ordner „${esc(mediaDir.name)}“</strong></p><p class="muted">Der Browser fragt nach jedem Neustart einmal nach, ob das Dashboard den Ordner lesen darf.</p>
      <button class="btn btn-accent" data-media="resume">Ordner wieder verbinden</button></div>`;
  else {
    const subs = [...new Set(mediaFiles.map(f=>f.folder).filter(Boolean))].sort();
    const q = mediaQuery.trim().toLowerCase(), list = mediaFiles.filter(f=>(!mediaSub || f.folder === mediaSub) && (!q || f.path.toLowerCase().includes(q)));
    body = `<div class="media-toolbar"><span class="media-folder">📁 <strong>${esc(mediaDir.name)}</strong> <span class="muted small">${mediaScanning ? "wird eingelesen …" : `${mediaFiles.length} Video${mediaFiles.length === 1 ? "" : "s"}`}</span></span>
        <input type="search" id="mediaSearch" placeholder="Suchen …" value="${esc(mediaQuery)}" aria-label="Videos suchen">
        ${subs.length ? `<select id="mediaSub" aria-label="Unterordner"><option value="">Alle Ordner</option>${subs.map(s=>`<option ${s === mediaSub ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>` : ""}
        <button class="btn btn-sm" data-media="rescan" title="Ordner neu einlesen">⟳</button><button class="btn btn-sm" data-media="disconnect">Trennen</button></div>
      ${list.length ? `<div class="media-grid">${list.slice(0, 240).map(f=>`<div class="media-card" data-media-card="${esc(f.path)}" role="button" tabindex="0" aria-label="${esc(f.name)} abspielen">
          <span class="media-thumb"><span class="media-play" aria-hidden="true">▶</span><span class="media-dur"></span></span>
          <strong title="${esc(f.path)}">${esc(f.name.replace(MEDIA_EXT, ""))}</strong>
          <span class="muted small">${new Date(f.mtime).toLocaleDateString("de-DE", {day:"2-digit", month:"2-digit", year:"numeric"})} · ${fmtBytes(f.size)}${f.folder ? ` · ${esc(f.folder)}` : ""}</span></div>`).join("")}</div>
          ${list.length > 240 ? `<p class="muted small">Die ersten 240 von ${list.length} – Suche oder Ordner-Filter grenzen ein.</p>` : ""}`
        : `<p class="muted">${mediaScanning ? "Wird eingelesen …" : "Keine Videos gefunden (mp4, webm, mov, m4v, mkv)."}</p>`}`;
  }
  return `<section class="hub2-card media-panel"><div class="hub2-card-head"><h3>🎬 Medien <span class="beta-pill">Vorschau</span></h3><button class="btn btn-sm" data-media="link">+ Link</button></div>${body}${linkCards}</section>`;
}
/** after rendering: thumbnails only for cards that are (about to be) visible */
function mediaAfterRender(root){
  const s = qs("#mediaSearch", root); if(s) s.addEventListener("input", ()=>{ mediaQuery = s.value; const pos = s.selectionStart; renderHub(); const n = qs("#mediaSearch"); if(n){ n.focus(); n.setSelectionRange(pos, pos); } });
  const sub = qs("#mediaSub", root); if(sub) sub.addEventListener("change", ()=>{ mediaSub = sub.value; renderHub(); });
  const cards = qsa("[data-media-card]", root); if(!cards.length) return;
  const byPath = new Map(mediaFiles.map(f=>[f.path, f]));
  const want = card => { const f = byPath.get(card.dataset.mediaCard); if(f){ paintThumb(card, f); queueThumb(f); } };
  if("IntersectionObserver" in window){ const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ want(e.target); io.unobserve(e.target); } }), {rootMargin:"300px"}); cards.forEach(c=>io.observe(c)); }
  else cards.slice(0, 24).forEach(want);
}
function mediaClick(e){
  const t = e.target, g = sel => t.closest(sel);
  const a = g("[data-media]"); if(a){ const k = a.dataset.media;
    if(k === "choose") chooseMediaFolder(); else if(k === "resume") resumeMedia(); else if(k === "rescan") scanMedia(); else if(k === "disconnect") disconnectMedia(); else if(k === "link") addLinkModal();
    return true; }
  const ld = g("[data-media-linkdel]"); if(ld){ diaryUndo("Link entfernt", ()=>{ diary.links = diary.links.filter(l=>l.id !== ld.dataset.mediaLinkdel); }); return true; }
  const lk = g("[data-media-link]"); if(lk){ openLink(diary.links.find(l=>l.id === lk.dataset.mediaLink)); return true; }
  const c = g("[data-media-card]"); if(c){ const f = mediaFiles.find(x=>x.path === c.dataset.mediaCard); if(f) playMediaFile(f); return true; }
  return false;
}
async function playMediaFile(f){
  try{ const file = await f.handle.getFile(), url = URL.createObjectURL(file);
    openVideoPlayer({src:url, title:f.name.replace(MEDIA_EXT, ""), sub:`${f.folder ? f.folder + " · " : ""}${new Date(f.mtime).toLocaleString("de-DE", {dateStyle:"medium", timeStyle:"short"})}`, onClose:()=>URL.revokeObjectURL(url)}); }
  catch(e){ toast("Video konnte nicht geöffnet werden – wurde es verschoben? Ordner neu einlesen (⟳)."); }
}

/* ==========================================================================
   VIDEO PLAYER – own controls on top of the browser's decoder
   Keys: Space/K play · J/L ±10 s · ←/→ ±5 s · ↑/↓ volume · M mute · F fullscreen · , / . frame step
         [ / ] speed · 0–9 jump to 0–90 % · Esc close
   ========================================================================== */
const VP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
let vp = null;
const vpPrefs = (()=>{ try{ return Object.assign({vol:0.9, muted:false, rate:1}, JSON.parse(localStorage.getItem("fm27_player") || "{}")); }catch(e){ return {vol:0.9, muted:false, rate:1}; } })();
const vpSavePrefs = () => { try{ localStorage.setItem("fm27_player", JSON.stringify(vpPrefs)); }catch(e){} };
const vpIcon = {play:"▶", pause:"❚❚", vol:"🔊", low:"🔉", mute:"🔇", full:"⛶", pip:"⧉", loop:"🔁", close:"✕"};
function openVideoPlayer(o){
  closeVideoPlayer();
  const root = document.createElement("div"); root.className = "vp-root"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Videoplayer: " + (o.title || "Video"));
  root.innerHTML = `
    <div class="vp-stage">
      <video class="vp-video" playsinline preload="metadata"></video>
      <button class="vp-big" data-vp="toggle" aria-label="Abspielen">▶</button>
      <div class="vp-msg" hidden></div>
      <div class="vp-top"><div class="vp-title"><strong>${esc(o.title || "Video")}</strong>${o.sub ? `<span>${esc(o.sub)}</span>` : ""}</div><button class="vp-btn" data-vp="close" aria-label="Schließen (Esc)">${vpIcon.close}</button></div>
      <div class="vp-bar">
        <div class="vp-seek" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="vp-track"><div class="vp-buf"></div><div class="vp-played"></div><div class="vp-knob"></div></div><div class="vp-hover" hidden></div></div>
        <div class="vp-ctrls">
          <button class="vp-btn" data-vp="toggle" aria-label="Abspielen / Pause (Leertaste)">▶</button>
          <button class="vp-btn small" data-vp="back" aria-label="10 Sekunden zurück (J)">−10</button><button class="vp-btn small" data-vp="fwd" aria-label="10 Sekunden vor (L)">+10</button>
          <button class="vp-btn small" data-vp="prevf" aria-label="Ein Bild zurück (,)">⏮</button><button class="vp-btn small" data-vp="nextf" aria-label="Ein Bild vor (.)">⏭</button>
          <span class="vp-time"><span class="vp-cur">0:00</span> / <span class="vp-dur">0:00</span></span>
          <span class="vp-spacer"></span>
          <button class="vp-btn" data-vp="mute" aria-label="Ton an/aus (M)">${vpIcon.vol}</button>
          <input class="vp-vol" type="range" min="0" max="1" step="0.05" aria-label="Lautstärke">
          <button class="vp-btn small vp-rate" data-vp="rate" aria-label="Geschwindigkeit ([ / ])">1×</button>
          <button class="vp-btn" data-vp="loop" aria-label="Wiederholen" aria-pressed="false">${vpIcon.loop}</button>
          ${document.pictureInPictureEnabled ? `<button class="vp-btn" data-vp="pip" aria-label="Bild im Bild">${vpIcon.pip}</button>` : ""}
          <button class="vp-btn" data-vp="full" aria-label="Vollbild (F)">${vpIcon.full}</button>
        </div></div></div>`;
  document.body.appendChild(root);
  const v = qs(".vp-video", root);
  vp = {root, v, o, hideT:null, prevFocus:document.activeElement};
  v.volume = vpPrefs.vol; v.muted = vpPrefs.muted; v.playbackRate = vpPrefs.rate;
  const upd = () => vpUpdate();
  ["timeupdate","progress","durationchange","loadedmetadata","play","pause","volumechange","ratechange","ended","seeking","seeked"].forEach(ev=>v.addEventListener(ev, upd));
  v.addEventListener("error", ()=>vpMsg("Dieses Video kann der Browser nicht abspielen (Format/Codec). Tipp: MP4 (H.264) oder WebM."));
  v.addEventListener("click", ()=>vpToggle()); v.addEventListener("dblclick", ()=>vpFull());
  root.addEventListener("click", vpClick);
  root.addEventListener("mousemove", vpWake); root.addEventListener("touchstart", vpWake, {passive:true});
  qs(".vp-vol", root).addEventListener("input", e=>{ v.volume = +e.target.value; v.muted = v.volume === 0; });
  vpSeekBind(qs(".vp-seek", root));
  document.addEventListener("keydown", vpKey, true);
  window.__vpOpen = true;
  v.src = o.src;
  const pr = v.play && v.play(); if(pr && pr.catch) pr.catch(()=>{});
  qs(".vp-big", root).focus({preventScroll:true});
  vpUpdate(); vpWake();
  return root;
}
function closeVideoPlayer(){
  if(!vp) return;
  const {root, v, o, prevFocus} = vp; vp = null; window.__vpOpen = false;
  document.removeEventListener("keydown", vpKey, true);
  try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
  try{ v.pause(); v.removeAttribute("src"); v.load(); }catch(e){}
  root.remove(); if(o.onClose) o.onClose();
  if(prevFocus && prevFocus.focus) try{ prevFocus.focus({preventScroll:true}); }catch(e){}
}
function vpMsg(t){ if(!vp) return; const m = qs(".vp-msg", vp.root); m.hidden = !t; m.textContent = t || ""; }
function vpToggle(){ if(!vp) return; const v = vp.v; if(v.paused || v.ended){ const p = v.play(); if(p && p.catch) p.catch(()=>{}); } else v.pause(); vpWake(); }
function vpSeekTo(t){ if(!vp) return; const v = vp.v, d = v.duration || 0; v.currentTime = Math.max(0, Math.min(d || t, t)); vpWake(); vpUpdate(); }
function vpStep(dir){ if(!vp) return; vp.v.pause(); vpSeekTo(vp.v.currentTime + dir / 30); }
function vpRate(dir){ if(!vp) return; const i = VP_SPEEDS.indexOf(vp.v.playbackRate), n = VP_SPEEDS[Math.max(0, Math.min(VP_SPEEDS.length - 1, (i < 0 ? 3 : i) + dir))];
  vp.v.playbackRate = n; vpPrefs.rate = n; vpSavePrefs(); vpFlash(`${n}×`); }
function vpVol(delta){ if(!vp) return; const v = vp.v; v.volume = Math.max(0, Math.min(1, Math.round((v.volume + delta) * 20) / 20)); v.muted = v.volume === 0; vpFlash(v.muted ? "Stumm" : `${Math.round(v.volume * 100)} %`); }
function vpFull(){ if(!vp) return; const st = qs(".vp-stage", vp.root); try{ if(document.fullscreenElement) document.exitFullscreen(); else if(st.requestFullscreen) st.requestFullscreen(); }catch(e){} }
function vpFlash(t){ if(!vp) return; let f = qs(".vp-flash", vp.root); if(!f){ f = document.createElement("div"); f.className = "vp-flash"; qs(".vp-stage", vp.root).appendChild(f); }
  f.textContent = t; f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }
function vpWake(){ if(!vp) return; const r = vp.root; r.classList.remove("idle"); clearTimeout(vp.hideT); vp.hideT = setTimeout(()=>{ if(vp && !vp.v.paused) vp.root.classList.add("idle"); }, 2600); }
function vpUpdate(){
  if(!vp) return; const {root, v} = vp, d = v.duration || 0, c = v.currentTime || 0;
  const pct = d ? c / d * 100 : 0; let buf = 0;
  try{ for(let i = 0; i < v.buffered.length; i++) if(v.buffered.start(i) <= c) buf = Math.max(buf, v.buffered.end(i)); }catch(e){}
  qs(".vp-played", root).style.width = pct + "%"; qs(".vp-knob", root).style.left = pct + "%"; qs(".vp-buf", root).style.width = (d ? buf / d * 100 : 0) + "%";
  const sk = qs(".vp-seek", root); sk.setAttribute("aria-valuenow", Math.round(pct)); sk.setAttribute("aria-valuetext", `${fmtDur(c)} von ${fmtDur(d)}`);
  qs(".vp-cur", root).textContent = fmtDur(c); qs(".vp-dur", root).textContent = fmtDur(d);
  const playing = !v.paused && !v.ended;
  qsa('[data-vp="toggle"]', root).forEach(b=>{ b.textContent = playing ? vpIcon.pause : vpIcon.play; b.setAttribute("aria-label", playing ? "Pause (Leertaste)" : "Abspielen (Leertaste)"); });
  root.classList.toggle("paused", !playing);
  qs('[data-vp="mute"]', root).textContent = v.muted || v.volume === 0 ? vpIcon.mute : v.volume < 0.5 ? vpIcon.low : vpIcon.vol;
  qs(".vp-vol", root).value = v.muted ? 0 : v.volume;
  qs(".vp-rate", root).textContent = `${v.playbackRate}×`;
  const lp = qs('[data-vp="loop"]', root); lp.setAttribute("aria-pressed", String(v.loop)); lp.classList.toggle("on", v.loop);
  if(!v.muted){ vpPrefs.vol = v.volume; } vpPrefs.muted = v.muted;
}
function vpClick(e){
  const b = e.target.closest("[data-vp]"); if(!b || !vp) return;
  const k = b.dataset.vp, v = vp.v;
  if(k === "toggle") vpToggle(); else if(k === "close") closeVideoPlayer();
  else if(k === "back") vpSeekTo(v.currentTime - 10); else if(k === "fwd") vpSeekTo(v.currentTime + 10);
  else if(k === "prevf") vpStep(-1); else if(k === "nextf") vpStep(1);
  else if(k === "mute"){ v.muted = !v.muted; if(!v.muted && v.volume === 0) v.volume = 0.5; vpSavePrefs(); }
  else if(k === "rate"){ const i = VP_SPEEDS.indexOf(v.playbackRate); vpRate(i >= VP_SPEEDS.length - 1 ? -(VP_SPEEDS.length - 1) : 1); }
  else if(k === "loop"){ v.loop = !v.loop; vpFlash(v.loop ? "Wiederholen an" : "Wiederholen aus"); vpUpdate(); }
  else if(k === "pip"){ try{ document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture(); }catch(err){} }
  else if(k === "full") vpFull();
}
function vpSeekBind(el){
  const at = e => { const r = el.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX); return Math.max(0, Math.min(1, (x - r.left) / (r.width || 1))); };
  let drag = false;
  const move = e => { if(!vp) return; const p = at(e), hv = qs(".vp-hover", vp.root); hv.hidden = false; hv.style.left = (p * 100) + "%"; hv.textContent = fmtDur(p * (vp.v.duration || 0)); if(drag) vpSeekTo(p * (vp.v.duration || 0)); };
  el.addEventListener("pointerdown", e=>{ drag = true; try{ el.setPointerCapture(e.pointerId); }catch(err){} move(e); });
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", ()=>{ drag = false; });
  el.addEventListener("pointerleave", ()=>{ if(vp) qs(".vp-hover", vp.root).hidden = true; });
  el.addEventListener("click", e=>{ if(vp) vpSeekTo(at(e) * (vp.v.duration || 0)); });
}
function vpKey(e){
  if(!vp) return;
  if(e.target && e.target.classList && e.target.classList.contains("vp-vol") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
  const v = vp.v, k = e.key; let used = true;
  if(k === " " || k === "k" || k === "K") vpToggle();
  else if(k === "j" || k === "J") vpSeekTo(v.currentTime - 10);
  else if(k === "l" || k === "L") vpSeekTo(v.currentTime + 10);
  else if(k === "ArrowLeft") vpSeekTo(v.currentTime - 5);
  else if(k === "ArrowRight") vpSeekTo(v.currentTime + 5);
  else if(k === "ArrowUp") vpVol(0.1);
  else if(k === "ArrowDown") vpVol(-0.1);
  else if(k === "m" || k === "M"){ v.muted = !v.muted; vpFlash(v.muted ? "Stumm" : "Ton an"); }
  else if(k === "f" || k === "F") vpFull();
  else if(k === ",") vpStep(-1);
  else if(k === ".") vpStep(1);
  else if(k === "[") vpRate(-1);
  else if(k === "]") vpRate(1);
  else if(/^[0-9]$/.test(k)) vpSeekTo((v.duration || 0) * (+k / 10));
  else if(k === "Escape"){ if(document.fullscreenElement) used = false; else closeVideoPlayer(); }
  else if(k === "Tab"){ const f = qsa("button, [tabindex], input", vp.root).filter(x=>!x.hidden && x.offsetParent !== null); if(f.length){ const i = f.indexOf(document.activeElement); const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length; f[n].focus(); } }
  else used = false;
  if(used){ e.preventDefault(); e.stopPropagation(); vpWake(); }
}

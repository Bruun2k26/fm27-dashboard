/* FM27 Manager Dashboard – Service Worker
   Network first: online you always get the newest files; offline the app starts from the cache.
   Change CACHE on every release so the browser notices the new version. */
const CACHE = "fm27-app-11.7";
const SHELL = ["./", "./index.html", "./js/01-core.js", "./js/02-storage.js", "./js/03-ui-base.js", "./js/04-portal.js", "./js/05-squad.js", "./js/06-tactics.js", "./js/07-transfers.js", "./js/08-finance.js", "./js/09-development.js", "./js/10-matchday-notes.js", "./js/11-settings-io.js", "./js/12-fm-import.js", "./js/13-analysis-backup.js", "./js/14-theme-app.js", "./js/15-admin-tools.js", "./js/16-transfer-center.js", "./js/17-storage-care.js", "./js/18-journey.js", "./js/19-national.js", "./js/20-saves-hotkeys.js", "./js/21-admin.js", "./js/22-layout-columns.js", "./js/23-hub.js", "./js/24-ai-prompt.js", "./js/25-init.js", "./01-core.js", "./02-storage.js", "./03-ui-base.js", "./04-portal.js", "./05-squad.js", "./06-tactics.js", "./07-transfers.js", "./08-finance.js", "./09-development.js", "./10-matchday-notes.js", "./11-settings-io.js", "./12-fm-import.js", "./13-analysis-backup.js", "./14-theme-app.js", "./15-admin-tools.js", "./16-transfer-center.js", "./17-storage-care.js", "./18-journey.js", "./19-national.js", "./20-saves-hotkeys.js", "./21-admin.js", "./22-layout-columns.js", "./23-hub.js", "./24-ai-prompt.js", "./25-init.js", "./style.css", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png"];

self.addEventListener("install", e => {
  // file by file – the parts live in js/ OR (uploaded without the folder) in the main folder; missing ones are skipped
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))));
  // no automatic skipWaiting: the app asks first ("Update verfügbar – jetzt laden")
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("fm27-app-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if(e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== "GET" || url.origin !== self.location.origin) return;     // only our own files
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try{
      const res = await Promise.race([fetch(req, {cache: "no-cache"}), timeout(4000)]);
      if(res && res.ok) cache.put(req, res.clone());
      return res;
    }catch(err){
      const hit = await cache.match(req, {ignoreSearch: true});
      if(hit) return hit;
      if(req.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
      return Response.error();
    }
  })());
});

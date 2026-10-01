// Copies the web app into dist/ – that is what the desktop app ships (no service worker needed there).
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const copy = (rel) => {
  const src = path.join(root, rel), dst = path.join(dist, rel);
  if (fs.statSync(src).isDirectory()) { fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(src).forEach(f => copy(path.join(rel, f))); }
  else fs.copyFileSync(src, dst);
};
["index.html", "style.css", "manifest.webmanifest", "js", "icons"].forEach(copy);
const n = fs.readdirSync(path.join(dist, "js")).length;
console.log(`dist/ bereit: index.html, style.css, ${n} Skripte, Symbole`);

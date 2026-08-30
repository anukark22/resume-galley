/* Removes one @media print rule at a time and reports how many glyphs land on
   the printed page. The rule whose removal brings the text back is the culprit.

   usage: node src/print-bisect.js            (needs the dev server on :4321)
*/
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "test");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
].find(p => fs.existsSync(p));

const base = fs.readFileSync(path.join(OUT, "print-test.html"), "utf8");
const start = base.indexOf("@media print{");
let depth = 0, end = start + "@media print".length;
for (; end < base.length; end++) {
  if (base[end] === "{") depth++;
  else if (base[end] === "}") { depth--; if (depth === 0) { end++; break; } }
}
const block = base.slice(start, end);
const body = block.slice(block.indexOf("{") + 1, block.length - 1);

/* split the block into top-level rules */
const rules = [];
let d = 0, buf = "";
for (const ch of body) {
  buf += ch;
  if (ch === "{") d++;
  else if (ch === "}") { d--; if (d === 0) { rules.push(buf.trim()); buf = ""; } }
}

function glyphsFor(html, tag) {
  const file = path.join(OUT, "bisect.html");
  fs.writeFileSync(file, html);
  const pdf = path.join(OUT, "bisect.pdf");
  if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
  try {
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox",
      "--run-all-compositor-stages-before-draw", "--virtual-time-budget=9000",
      "--no-pdf-header-footer", "--print-to-pdf=" + pdf,
      "http://localhost:4321/test/bisect.html"], { stdio: "ignore", timeout: 90000 });
  } catch (e) { return -1; }
  if (!fs.existsSync(pdf)) return -1;
  const bytes = fs.readFileSync(pdf);
  const zlib = require("zlib");
  const latin = b => { let s = ""; for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + 8192, b.length))); return s; };
  const raw = latin(bytes);
  let text = "";
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(raw))) {
    const s0 = m.index + m[0].length, e0 = raw.indexOf("endstream", s0);
    if (e0 < 0) continue;
    let out = null;
    try { out = zlib.inflateSync(bytes.subarray(s0, e0)); }
    catch (e) { try { out = zlib.inflateRawSync(bytes.subarray(s0, e0)); } catch (e2) {} }
    if (out) text += latin(out) + "\n";
  }
  return (text.match(/<[0-9A-Fa-f]{4,}>/g) || []).reduce((a, x) => a + (x.length - 2) / 4, 0) | 0;
}

const withBlock = (rulesSubset) =>
  base.slice(0, start) + "@media print{" + rulesSubset.join("\n") + "}" + base.slice(end);

console.log("rules in the print block:", rules.length);
console.log("baseline (all rules)   :", glyphsFor(withBlock(rules), "all"), "glyphs");
console.log("no print block at all  :", glyphsFor(base.slice(0, start) + base.slice(end), "none"), "glyphs");
console.log("");
/* additive: add one rule at a time and watch where the glyphs vanish */
const acc = [];
for (const r of rules) {
  acc.push(r);
  const g = glyphsFor(withBlock(acc.slice()));
  console.log(String(g).padStart(6), " glyphs after adding:", r.split("{")[0].trim().slice(0,56));
}

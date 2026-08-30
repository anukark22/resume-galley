/* Prints the app to a real PDF with headless Chrome and reports whether any
   text actually landed on the page. Used to verify the print stylesheet.

   usage: node src/print-check.js [pages]
*/
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "test");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error("Chrome not found"); process.exit(1); }

const jobs = Number(process.argv[2] || 8);
const seed = `
<script>
(function () {
  var d = RG.doc;
  d.header = { name: "Anuka Rashmi Kumar", headline: "Electronics engineer",
    email: "anuka@example.com", phone: "+91 91086 32452", location: "Bengaluru, India",
    links: [{ label: "LinkedIn", url: "linkedin.com/in/anuka" }] };
  var items = [];
  for (var i = 1; i <= ${jobs}; i++) items.push({
    id: "j" + i, _open: false, role: "Engineer " + i, org: "Company " + i,
    location: "Bengaluru", start: "Jan 2024", end: "Present",
    bullets: ["PRINTPROBE" + i + " a substantial line of work that wraps onto a second line to give the entry real height.",
              "Second achievement line for bulk."] });
  d.sections = [
    { id: "s1", type: "experience", title: "Experience", on: true, _open: false, items: items },
    { id: "s2", type: "education", title: "Education", on: true, _open: false,
      items: [{ id: "e1", _open: false, degree: "B.Tech Electronics", school: "Ramaiah University",
                location: "Bengaluru", start: "2022", end: "2026", sub: "CGPA 7.8/10", bullets: [] }] }
  ];
  RG.renderAll();
})();
</script>
`;

const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace("</body>", seed + "</body>");
const testHtml = path.join(OUT, "print-test.html");
fs.writeFileSync(testHtml, page);

const pdf = path.join(OUT, "print-out.pdf");
if (fs.existsSync(pdf)) fs.unlinkSync(pdf);

console.log("printing:", process.env.PRINT_URL || testHtml);
execFileSync(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  "--run-all-compositor-stages-before-draw",
  "--virtual-time-budget=15000",
  "--no-pdf-header-footer",
  "--print-to-pdf=" + pdf,
  process.env.PRINT_URL || ("file:///" + testHtml.replace(/\\/g, "/"))
], { stdio: "ignore", timeout: 120000 });

if (!fs.existsSync(pdf)) { console.error("Chrome produced no PDF"); process.exit(1); }
const bytes = fs.readFileSync(pdf);
console.log("PDF written:", pdf, "(" + bytes.length + " bytes)");

/* count pages, and pull the text out with the same decoder the app uses */
const latin = b => { let s = ""; for (let i = 0; i < b.length; i += 8192)
  s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + 8192, b.length))); return s; };
const raw = latin(bytes);
const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log("pages in PDF:", pageCount);

(async () => {
  const zlib = require("zlib");
  let text = "";
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const chunk = bytes.subarray(start, end);
    let out = null;
    try { out = zlib.inflateSync(chunk); } catch (e) {
      try { out = zlib.inflateRawSync(chunk); } catch (e2) {}
    }
    if (!out) continue;
    const s = latin(out);
    if (/\bTj\b|\bTJ\b/.test(s)) text += s + "\n";
  }
  const tj = (text.match(/Tj/g) || []).length;
  const tja = (text.match(/TJ/g) || []).length;
  const glyphs = (text.match(/<[0-9A-Fa-f]{2,}>/g) || []).reduce((a,x)=>a+(x.length-2)/4,0);
  console.log("text ops (Tj/TJ):", tj + tja);
  console.log("glyphs drawn    :", Math.round(glyphs));
  console.log(glyphs > 100 ? "RESULT: the PDF HAS content" : "RESULT: the PDF IS BLANK");
})();

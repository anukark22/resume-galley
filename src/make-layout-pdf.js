/* Builds test/layout-resume.pdf - a PDF laid out the way a real design-tool
   export is, to catch the things that plain drawing-order extraction gets
   wrong:
     - dates right-aligned and drawn BEFORE the job title on the same line
     - sentences wrapped across two drawn lines
     - no bullet characters (the dot is a graphic in the real file)
     - every glyph separately kerned, with big negative kerns after m/M/W,
       which naive extractors turn into "prom otional"
     - subset font codes with a /ToUnicode map
*/
const fs = require("fs"), zlib = require("zlib"), path = require("path");
const OUT = path.join(__dirname, "..", "test");
fs.mkdirSync(OUT, { recursive: true });

/* [text, size, x, y] - order here is DRAW order, deliberately not reading order */
const RUNS = [
  ["WORK EXPERIENCE", 12, 210, 720],

  ["June 2025 - Dec 2025", 9, 430, 698],           /* date drawn first */
  ["Senior Volunteer - IIM UN", 11, 72, 698],

  ["Led graphic design, promotional content creation, and CRM", 10, 72, 684],
  ["coordination for large-scale conferences involving 14 organizations.", 10, 72, 671],

  ["PROJECTS", 12, 250, 645],

  ["2026", 9, 470, 623],
  ["Generative AI Career Advisor", 11, 72, 623],
  ["Built a generative AI career advisory web app using Ollama, Streamlit and", 10, 72, 609],
  ["REST APIs for personalized career roadmaps and skill gap analysis.", 10, 72, 596],
  ["Technologies: Python, Streamlit, REST APIs, Ollama, Prompt Engineering", 10, 72, 583],

  ["2026", 9, 470, 561],
  ["Content-Based Movie Recommendation Engine", 11, 72, 561],
  ["Built a content-based movie recommendation web app using Flask, Scikit-", 10, 72, 547],
  ["learn, cosine similarity, and the TMDb API.", 10, 72, 534],

  ["EDUCATION", 12, 245, 508],
  ["2022 - 2026", 9, 452, 486],
  ["BSc Computer Science", 11, 72, 486],
  ["University of Colombo", 10, 72, 472]
];

const chars = [...new Set(RUNS.map(r => r[0]).join(""))];
const gid = new Map();
chars.forEach((c, i) => gid.set(c, 0x0100 + i));
const hex4 = n => n.toString(16).toUpperCase().padStart(4, "0");

/* one TJ array per run, every glyph its own string, wide letters kerned hard */
function tj(s) {
  let out = "[";
  for (const ch of s) {
    out += "<" + hex4(gid.get(ch)) + ">";
    if ("mMWw".includes(ch)) out += " -220 ";
  }
  return out + "] TJ";
}

const content = RUNS.map(([t, size, x, y]) =>
  "BT /F1 " + size + " Tf 1 0 0 1 " + x + " " + y + " Tm " + tj(t) + " ET"
).join("\n");

const bf = chars.map(c => "<" + hex4(gid.get(c)) + "> <" + hex4(c.charCodeAt(0)) + ">").join("\n");
const cmap =
  "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Custom def\n/CMapType 2 def\n" +
  "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" +
  chars.length + " beginbfchar\n" + bf + "\nendbfchar\nendcmap\nend\nend";

const cs = zlib.deflateSync(Buffer.from(content, "latin1"));
const cm = zlib.deflateSync(Buffer.from(cmap, "latin1"));
const objs = {
  1: "<< /Type /Catalog /Pages 2 0 R >>",
  2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  5: "<< /Type /Font /Subtype /Type0 /BaseFont /XYZABC+Inter /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>",
  7: "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /XYZABC+Inter /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>"
};

let pdf = Buffer.from("%PDF-1.5\n", "latin1");
const off = {};
for (let i = 1; i <= 7; i++) {
  off[i] = pdf.length;
  if (i === 4) {
    pdf = Buffer.concat([pdf,
      Buffer.from("4 0 obj\n<< /Length " + cs.length + " /Filter /FlateDecode >>\nstream\n", "latin1"),
      cs, Buffer.from("\nendstream\nendobj\n", "latin1")]);
  } else if (i === 6) {
    pdf = Buffer.concat([pdf,
      Buffer.from("6 0 obj\n<< /Length " + cm.length + " /Filter /FlateDecode >>\nstream\n", "latin1"),
      cm, Buffer.from("\nendstream\nendobj\n", "latin1")]);
  } else {
    pdf = Buffer.concat([pdf, Buffer.from(i + " 0 obj\n" + objs[i] + "\nendobj\n", "latin1")]);
  }
}
const xref = pdf.length;
let x = "xref\n0 8\n0000000000 65535 f \n";
for (let i = 1; i <= 7; i++) x += String(off[i]).padStart(10, "0") + " 00000 n \n";
x += "trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
fs.writeFileSync(path.join(OUT, "layout-resume.pdf"), Buffer.concat([pdf, Buffer.from(x, "latin1")]));
console.log("wrote test/layout-resume.pdf -", RUNS.length, "runs,", chars.length, "glyphs");

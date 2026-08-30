/* Builds test/ctm-resume.pdf - the hard case.
     - every line is wrapped in "q <cm> ... Q", with the text matrix left at
       identity, so an extractor that ignores the graphics matrix stacks all
       lines on one baseline and interleaves them character by character
     - every glyph is positioned individually and there are NO space glyphs,
       so word gaps exist only as advances
     - right-aligned dates in their own cm block
     - subset codes with a /ToUnicode map
*/
const fs = require("fs"), zlib = require("zlib"), path = require("path");
const OUT = path.join(__dirname, "..", "test");
fs.mkdirSync(OUT, { recursive: true });

/* [text, size, x, y] */
const LINES = [
  ["ANUKA RASHMI KUMAR", 18, 72, 730],
  ["anuka@example.com | +91 9108632452 | Bengaluru, India", 9, 72, 712],
  ["SUMMARY", 11, 72, 686],
  ["Electronics engineer who ships embedded and web work. Comfortable moving", 10, 72, 670],
  ["between firmware, dashboards and whatever the team needs made administrative.", 10, 72, 657],
  ["WORK EXPERIENCE", 11, 72, 630],
  ["Founding Engineer - AmbuGo", 11, 72, 612],
  ["Jun 2025 - Present", 9, 452, 612],
  ["Designed the admin dashboard, integrating agentic AI workflows to streamline", 10, 72, 598],
  ["driver onboarding, document verification and administrative processes.", 10, 72, 585],
  ["Senior Volunteer - IIM UN", 11, 72, 562],
  ["Jun 2025 - Dec 2025", 9, 448, 562],
  ["Led graphic design, promotional content creation and CRM coordination for", 10, 72, 548],
  ["large-scale conferences involving 14 organizations.", 10, 72, 535],
  ["PROJECTS", 11, 72, 508],
  ["Smart Surveillance System", 11, 72, 490],
  ["2026", 9, 470, 490],
  ["Built an AI-powered multi-threat detection system with Raspberry Pi 5, OpenCV", 10, 72, 476],
  ["and YOLO, with face recognition and evidence capture.", 10, 72, 463],
  ["EDUCATION", 11, 72, 436],
  ["B.Tech Electronics and Communication Engineering", 11, 72, 418],
  ["2022 - 2026", 9, 452, 418],
  ["Bengaluru Institute of Technology", 10, 72, 404]
];

const chars = [...new Set(LINES.map(l => l[0]).join(""))].filter(c => c !== " ");
const gid = new Map();
chars.forEach((c, i) => gid.set(c, 0x0100 + i));
const hex4 = n => n.toString(16).toUpperCase().padStart(4, "0");

/* real-ish Helvetica proportions, deliberately not the same numbers the
   extractor guesses with */
function adv(ch) {
  if (ch === " ") return 0.278;
  if ("iljtfIr.,;:'|!()[]-".indexOf(ch) >= 0) return 0.297;
  if ("mMWw%@".indexOf(ch) >= 0) return 0.861;
  if (ch >= "A" && ch <= "Z") return 0.715;
  return 0.548;
}

/* one Tm + Tj per glyph, spaces present only as advance */
function glyphs(text, size) {
  let out = "", x = 0;
  for (const ch of text) {
    if (ch !== " ") {
      out += "1 0 0 1 " + x.toFixed(2) + " 0 Tm <" + hex4(gid.get(ch)) + "> Tj\n";
    }
    x += adv(ch) * size;
  }
  return out;
}

const content = LINES.map(([t, size, x, y]) =>
  "q 1 0 0 1 " + x + " " + y + " cm\nBT /F1 " + size + " Tf\n" + glyphs(t, size) + "ET\nQ"
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
  5: "<< /Type /Font /Subtype /Type0 /BaseFont /QWERTY+Helvetica /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>",
  7: "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /QWERTY+Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>"
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
fs.writeFileSync(path.join(OUT, "ctm-resume.pdf"), Buffer.concat([pdf, Buffer.from(x, "latin1")]));
console.log("wrote test/ctm-resume.pdf -", LINES.length, "cm-positioned lines, no space glyphs");

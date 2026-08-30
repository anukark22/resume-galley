/* Builds test/subset-resume.pdf: a PDF whose text is stored as SUBSET GLYPH
   CODES (not letters) with a /ToUnicode CMap, exactly like a Canva/InDesign
   export. Reading the bytes directly gives mojibake; only the CMap recovers it.
   Also builds test/nomap-resume.pdf: the same but with the CMap stripped, to
   check we detect and report the unrecoverable case. */
const fs = require("fs"), zlib = require("zlib"), path = require("path");
const OUT = path.join(__dirname, "..", "test");
fs.mkdirSync(OUT, { recursive: true });

const LINES = [
  ["PRIYA RAJAPAKSE", 20, 720],
  ["priya@example.com | +94 71 234 5678 | Kandy, Sri Lanka", 10, 700],
  ["SUMMARY", 12, 668],
  ["Marketing lead with seven years across brand and growth.", 10, 652],
  ["EXPERIENCE", 12, 620],
  ["Marketing Lead", 11, 604],
  ["Orbit Media | Colombo | Feb 2022 - Present", 10, 590],
  ["- Grew organic traffic 140% in eighteen months", 10, 576],
  ["- Built the content team from two people to nine", 10, 562],
  ["Content Strategist", 11, 540],
  ["Lantern Co | Kandy | Jun 2019 - Jan 2022", 10, 526],
  ["- Launched a newsletter that reached 30,000 readers", 10, 512],
  ["EDUCATION", 12, 480],
  ["BA Communications", 11, 464],
  ["University of Peradeniya | 2015 - 2019", 10, 450],
  ["SKILLS", 12, 418],
  ["Tools: Figma, HubSpot, Google Analytics", 10, 402]
];

/* Assign every distinct character an arbitrary 2-byte glyph id starting at
   0x0100 - deliberately NOT its Unicode value, which is what subsetting does. */
const chars = [...new Set(LINES.map(l => l[0]).join(""))];
const gid = new Map();
chars.forEach((c, i) => gid.set(c, 0x0100 + i));
const hex4 = n => n.toString(16).toUpperCase().padStart(4, "0");
const enc = s => "<" + [...s].map(c => hex4(gid.get(c))).join("") + ">";

const content = LINES.map(([t, size, y]) =>
  "BT /F1 " + size + " Tf 1 0 0 1 72 " + y + " Tm " + enc(t) + " Tj ET"
).join("\n");

const bf = chars.map(c => "<" + hex4(gid.get(c)) + "> <" + hex4(c.charCodeAt(0)) + ">").join("\n");
const cmap =
  "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" +
  "/CMapName /Custom def\n/CMapType 2 def\n" +
  "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" +
  chars.length + " beginbfchar\n" + bf + "\nendbfchar\n" +
  "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";

function build(withCMap) {
  const cs = zlib.deflateSync(Buffer.from(content, "latin1"));
  const cm = zlib.deflateSync(Buffer.from(cmap, "latin1"));
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
            "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
  objs[5] = "<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Helvetica " +
            "/Encoding /Identity-H /DescendantFonts [7 0 R] " +
            (withCMap ? "/ToUnicode 6 0 R " : "") + ">>";
  objs[7] = "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Helvetica " +
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>";

  let pdf = Buffer.from("%PDF-1.5\n", "latin1");
  const off = {};
  const total = 7;
  for (let i = 1; i <= total; i++) {
    off[i] = pdf.length;
    if (i === 4) {
      pdf = Buffer.concat([pdf,
        Buffer.from("4 0 obj\n<< /Length " + cs.length + " /Filter /FlateDecode >>\nstream\n", "latin1"),
        cs, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    } else if (i === 6) {
      if (!withCMap) { off[i] = pdf.length; pdf = Buffer.concat([pdf, Buffer.from("6 0 obj\n<< >>\nendobj\n", "latin1")]); continue; }
      pdf = Buffer.concat([pdf,
        Buffer.from("6 0 obj\n<< /Length " + cm.length + " /Filter /FlateDecode >>\nstream\n", "latin1"),
        cm, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    } else {
      pdf = Buffer.concat([pdf, Buffer.from(i + " 0 obj\n" + objs[i] + "\nendobj\n", "latin1")]);
    }
  }
  const xref = pdf.length;
  let x = "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= total; i++) x += String(off[i]).padStart(10, "0") + " 00000 n \n";
  x += "trailer\n<< /Size " + (total + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return Buffer.concat([pdf, Buffer.from(x, "latin1")]);
}

fs.writeFileSync(path.join(OUT, "subset-resume.pdf"), build(true));
fs.writeFileSync(path.join(OUT, "nomap-resume.pdf"), build(false));
console.log("wrote test/subset-resume.pdf (with /ToUnicode) and test/nomap-resume.pdf (without)");
console.log("distinct glyphs:", chars.length, "- first codes:", chars.slice(0, 5).map(c => c + "=" + hex4(gid.get(c))).join(" "));

/* Builds test fixtures: a real deflated .docx and a Flate-compressed PDF. */
const fs = require("fs"), zlib = require("zlib"), path = require("path");
const OUT = path.join(__dirname, "..", "test");
fs.mkdirSync(OUT, { recursive: true });

/* ---------- zip writer (deflate, so it exercises the inflate path) ---------- */
function crcTable() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
}
const T = crcTable();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

const P = (t, bullet) =>
  "<w:p>" + (bullet ? "<w:pPr><w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/></w:numPr></w:pPr>" : "") +
  "<w:r><w:t xml:space=\"preserve\">" + t.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</w:t></w:r></w:p>";

const doc =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  [
    P("Anuka Rashmi Kumar"),
    P("anuka@example.com | +94 77 555 0134 | Colombo, Sri Lanka"),
    P("linkedin.com/in/anuka"),
    P(""),
    P("SUMMARY"),
    P("Front-end engineer with four years building design systems and internal tools. Happiest where typography meets state management."),
    P(""),
    P("WORK EXPERIENCE"),
    P("Senior Front-End Engineer"),
    P("Vantix Labs | Colombo | Mar 2023 - Present"),
    P("Rebuilt the component library, cutting page weight by 38%", true),
    P("Mentored three juniors through their first production releases", true),
    P("Front-End Engineer"),
    P("Bluepeak | Remote | Jun 2021 - Feb 2023"),
    P("Shipped the customer dashboard used by 12,000 accounts", true),
    P(""),
    P("EDUCATION"),
    P("BSc (Hons) Computer Science"),
    P("University of Colombo | 2017 - 2021"),
    P("First class honours", true),
    P(""),
    P("SKILLS"),
    P("Languages: TypeScript, Python, SQL"),
    P("Frameworks: React, Svelte, Node"),
    P(""),
    P("CERTIFICATIONS"),
    P("AWS Certified Developer | Amazon Web Services | Mar 2024"),
    P(""),
    P("LANGUAGES"),
    P("Sinhala - native", true),
    P("English - fluent", true)
  ].join("") +
  "</w:body></w:document>";

fs.writeFileSync(path.join(OUT, "sample-resume.docx"), zip([
  { name: "[Content_Types].xml", data:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: "_rels/.rels", data:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: "word/document.xml", data: doc }
]));

/* ---------------------------- a small text PDF ---------------------------- */
const pdfLines = [
  ["Anuka Rashmi Kumar", 20, 720],
  ["anuka@example.com | +94 77 555 0134 | Colombo, Sri Lanka", 10, 700],
  ["SUMMARY", 12, 670],
  ["Front-end engineer with four years building design systems.", 10, 654],
  ["WORK EXPERIENCE", 12, 624],
  ["Senior Front-End Engineer", 11, 608],
  ["Vantix Labs | Colombo | Mar 2023 - Present", 10, 594],
  ["- Rebuilt the component library, cutting page weight by 38%", 10, 580],
  ["EDUCATION", 12, 550],
  ["BSc (Hons) Computer Science", 11, 534],
  ["University of Colombo | 2017 - 2021", 10, 520]
];
const content = pdfLines.map(([t, s, y]) =>
  "BT /F1 " + s + " Tf 1 0 0 1 72 " + y + " Tm (" + t.replace(/([()\\])/g, "\\$1") + ") Tj ET"
).join("\n");
const cs = zlib.deflateSync(Buffer.from(content, "latin1"));

const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  null,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
];
let pdf = Buffer.from("%PDF-1.4\n", "latin1");
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(pdf.length);
  if (i === 3) {
    pdf = Buffer.concat([pdf,
      Buffer.from("4 0 obj\n<< /Length " + cs.length + " /Filter /FlateDecode >>\nstream\n", "latin1"),
      cs, Buffer.from("\nendstream\nendobj\n", "latin1")]);
  } else {
    pdf = Buffer.concat([pdf, Buffer.from((i + 1) + " 0 obj\n" + o + "\nendobj\n", "latin1")]);
  }
});
const xref = pdf.length;
let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
offsets.forEach(o => (x += String(o).padStart(10, "0") + " 00000 n \n"));
x += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
pdf = Buffer.concat([pdf, Buffer.from(x, "latin1")]);
fs.writeFileSync(path.join(OUT, "sample-resume.pdf"), pdf);

console.log("wrote test/sample-resume.docx and test/sample-resume.pdf");

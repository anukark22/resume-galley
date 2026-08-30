/* Replace a heading-delimited section of README.md with a file's contents.
   Reads both from disk, so no shell quoting is involved.
   usage: node src/splice-md.js <from-heading> <to-heading> <replacement-file> */
const fs = require("fs");
const [from, to, file] = process.argv.slice(2);
const md = fs.readFileSync("README.md", "utf8");
const a = md.indexOf(from);
const b = md.indexOf(to);
if (a < 0 || b < 0 || b <= a) {
  console.error("headings not found or out of order");
  process.exit(1);
}
const block = fs.readFileSync(file, "utf8");
fs.writeFileSync("README.md", md.slice(0, a) + block + md.slice(b));
console.log("replaced", JSON.stringify(from), "->", JSON.stringify(to));

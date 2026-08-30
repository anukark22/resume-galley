/* Replaces a line range in a source part with the contents of another file.
   Reads both from disk so no shell quoting can eat backslashes.
   usage: node src/splice.js <target> <fromLine> <toLine> <replacementFile> */
const fs = require("fs");
const [target, from, to, repl] = process.argv.slice(2);
const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);
const block = fs.readFileSync(repl, "utf8").replace(/\s+$/, "").split(/\r?\n/);
const a = Number(from) - 1, b = Number(to);
console.log("first replaced:", JSON.stringify(lines[a]));
console.log("last replaced :", JSON.stringify(lines[b - 1]));
console.log("next kept     :", JSON.stringify(lines[b]));
fs.writeFileSync(target, lines.slice(0, a).concat(block, lines.slice(b)).join("\n"));
console.log("ok, lines now:", a + block.length + (lines.length - b));

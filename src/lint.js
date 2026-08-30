/* Rough tokeniser to locate an unterminated string or comment in a source file.
   usage: node src/lint.js <file> */
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
let line = 1, i = 0, state = "code", startLine = 0, quote = "";

while (i < src.length) {
  const c = src[i], n = src[i + 1];
  if (c === "\n") {
    line++;
    if (state === "str") {
      console.log("UNTERMINATED " + quote + " string starting at line " + startLine);
      console.log("  " + src.split("\n")[startLine - 1].trim().slice(0, 100));
      process.exit(1);
    }
    if (state === "line") state = "code";
    i++; continue;
  }
  if (state === "code") {
    if (c === "/" && n === "*") { state = "block"; startLine = line; i += 2; continue; }
    if (c === "/" && n === "/") { state = "line"; i += 2; continue; }
    if (c === "/") {
      /* regex literal if the previous meaningful character cannot end a value */
      let j = i - 1;
      while (j >= 0 && /\s/.test(src[j])) j--;
      if (j < 0 || "(,=:[!&|?{};+-*%~^<>".indexOf(src[j]) >= 0) {
        i++;
        while (i < src.length && src[i] !== "\n") {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === "[") { while (i < src.length && src[i] !== "]" && src[i] !== "\n") { if (src[i] === "\\") i++; i++; } }
          if (src[i] === "/") { i++; break; }
          i++;
        }
        continue;
      }
    }
    if (c === '"' || c === "'" || c === "`") { state = "str"; quote = c; startLine = line; i++; continue; }
    i++; continue;
  }
  if (state === "block") {
    if (c === "*" && n === "/") { state = "code"; i += 2; continue; }
    i++; continue;
  }
  if (state === "line") { i++; continue; }
  if (state === "str") {
    if (c === "\\") { i += 2; continue; }
    if (c === quote) { state = "code"; i++; continue; }
    i++; continue;
  }
}
if (state === "block") { console.log("UNTERMINATED /* comment from line " + startLine); process.exit(1); }
if (state === "str") { console.log("UNTERMINATED string from line " + startLine); process.exit(1); }
console.log("strings and comments balanced");

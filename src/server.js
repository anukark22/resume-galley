/* Tiny static server for local testing of index.html. */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");
const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf", ".txt": "text/plain" };

http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(4321, () => console.log("serving http://localhost:4321"));

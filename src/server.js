/* Local dev server: serves the built app and mounts the same /api/analyze-job
   handler Vercel runs, so local and deployed behave identically.

   OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=qwen3:8b node src/server.js
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = path.join(__dirname, "..");

/* Vercel injects environment variables itself; locally read .env.local so the
   same OLLAMA_BASE_URL / OLLAMA_MODEL settings work in both places. */
(function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
})();

const PORT = Number(process.env.PORT || 4321);
const analyzeJob = require(path.join(ROOT, "api", "analyze-job.js"));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8"
};

/* the smallest shim of the Vercel response helpers the route relies on */
function shim(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const p = decodeURIComponent(parsed.pathname);

  if (p === "/api/analyze-job") {
    shim(res);
    try { await analyzeJob(req, res); }
    catch (err) {
      console.error("[analyze-job]", err);
      if (!res.headersSent) res.status(500).json({ error: "Server error." });
      else res.end();
    }
    return;
  }

  const file = path.join(ROOT, p === "/" ? "/index.html" : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  const cfg = require(path.join(ROOT, "api", "_lib", "analyze.js")).config();
  console.log("Resume Galley on http://localhost:" + PORT);
  console.log("Ollama  " + cfg.base + "   model  " + cfg.model);
});

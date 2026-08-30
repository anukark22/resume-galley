/* ============================================================================
   POST /api/analyze-job     (Vercel serverless function)

   Body: { "resume": "...", "jobDescription": "..." }

   Streams newline-delimited JSON so the connection stays active while the
   model works and the UI can show real progress:
     {"type":"progress","chars":1234}
     {"type":"result","data":{...}}
     {"type":"error","code":"...","message":"..."}

   OLLAMA_BASE_URL and OLLAMA_MODEL are read here, server-side, and never
   sent to the browser.
   ========================================================================== */
"use strict";

const { analyze, AnalyzeError, MAX_BODY } = require("./_lib/analyze.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  let body = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY) return res.status(413).json({ error: "Request too large." });
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ error: "Body must be JSON." });
    }
  }
  if (!body) {
    try { body = await readJson(req); } catch (e) {
      return res.status(e && e.status === 413 ? 413 : 400)
        .json({ error: e && e.message ? e.message : "Body must be JSON." });
    }
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const line = obj => { try { res.write(JSON.stringify(obj) + "\n"); } catch (e) {} };
  let last = 0;

  try {
    const result = await analyze(body, {
      /* Vercel Hobby functions stop at 60s; leave headroom to report cleanly */
      timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 55000),
      onProgress: chars => {
        if (chars - last < 200) return;
        last = chars;
        line({ type: "progress", chars: chars });
      }
    });
    line({ type: "result", data: result });
    res.end();
  } catch (err) {
    const known = err instanceof AnalyzeError;
    /* never leak a stack trace or the Ollama address to the client */
    line({
      type: "error",
      code: known ? err.code : "server_error",
      message: known ? err.message
        : "AI analysis failed unexpectedly. Check the server logs for details."
    });
    if (!known) console.error("[analyze-job]", err);
    res.end();
  }
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const e = new Error("Request too large.");
        e.status = 413;
        req.destroy();
        return reject(e);
      }
      data += chunk;
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error("Body must be JSON.")); }
    });
    req.on("error", reject);
  });
}

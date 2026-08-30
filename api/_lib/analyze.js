/* ============================================================================
   Job-fit analysis core.

   Shared by the Vercel serverless route (api/analyze-job.js) and the local
   dev server (src/server.js) so both behave identically. Nothing here ever
   reaches the browser: OLLAMA_BASE_URL and OLLAMA_MODEL are read on the
   server only, and the client is given the analysis, never the endpoint.
   ========================================================================== */
"use strict";

const MAX_FIELD = 24000;      /* characters per field */
const MAX_BODY = 200 * 1024;  /* bytes of request body */
const DEFAULT_MODEL = "qwen3:8b";
const DEFAULT_BASE = "http://localhost:11434";
/* models that emit a <think> scratchpad and accept think:false */
const THINKERS = /^(qwen3|deepseek-r1|magistral|phi4-reasoning)/i;

const SYSTEM_PROMPT = [
"You are an honest, rigorous job-fit and resume analysis engine.",
"Your job is to compare a candidate's resume against a specific job description and determine how suitable the candidate actually is for that role.",
"",
"Your goal is NOT to encourage the candidate.",
"Your goal is to give the most accurate assessment possible based ONLY on the evidence provided.",
"",
"Do not inflate the candidate's suitability.",
"Do not assume skills that are not explicitly demonstrated.",
"Do not treat vague keyword overlap as proof of experience.",
"Do not reward the candidate simply because they are a student or because their background is generally related to the role.",
"Do not penalize them for wording differences when the underlying experience clearly matches.",
"",
"ANALYSIS",
"Analyze the job description first and identify its actual requirements.",
"Separate requirements into: required qualifications, preferred qualifications, technical skills, tools/technologies, years or type of experience, education requirements, domain knowledge, responsibilities, soft skills, other constraints.",
"",
"Then compare each requirement against the candidate's resume.",
"For every important requirement, classify the candidate as:",
"MATCH - clearly demonstrated",
"PARTIAL - some relevant evidence, but insufficient or indirect",
"MISSING - no evidence in the resume",
"UNCLEAR - potentially relevant, but the resume does not provide enough evidence",
"",
"Never classify something as MATCH merely because a related keyword appears.",
"Job requires 'Experience with React and TypeScript' and the resume says 'Built websites using JavaScript': this is NOT a match for React or TypeScript.",
"Job requires 'Python' and the resume says 'Developed machine-learning projects in Python': this IS a match.",
"",
"FIT SCORE",
"Give the candidate an overall suitability score from 0-100 representing actual demonstrated fit, not potential.",
"90-100: Exceptional match. 80-89: Strong match. 70-79: Good/credible match. 60-69: Borderline match. 40-59: Weak match. 0-39: Poor match.",
"Do not artificially push the score toward 70 or above. A candidate can receive 35, 48 or 57 if that is what the evidence supports.",
"A score below 50 is completely acceptable when justified.",
"",
"REQUIRED VS PREFERRED",
"Missing a preferred qualification should have a relatively small effect.",
"Missing a clearly stated required qualification must visibly and substantially reduce the score.",
"If the job requires professional experience and the candidate has none, explicitly identify this as a major gap.",
"Do not compensate for a major missing requirement merely because the candidate has projects or coursework.",
"",
"EXPERIENCE LEVEL",
"Distinguish coursework, personal projects, academic projects, internships, freelance work and professional employment.",
"Never treat coursework as professional experience. Never treat a personal project as professional employment.",
"Do not represent an internship as multiple years of full-time experience.",
"Do not assume project experience satisfies a professional-experience requirement unless the job description clearly allows equivalent experience.",
"",
"TRANSFERABLE SKILLS",
"Transferable skills may count when genuinely relevant, but do not automatically treat adjacent technologies as equivalent.",
"Potential to learn something is not the same as currently possessing the skill. Only current, demonstrated skill contributes strongly to the score.",
"",
"EDUCATION",
"Check degree, major, graduation status, required academic background, and GPA only if explicitly requested.",
"Never assume the candidate holds a certification that is not listed.",
"Do not penalize the candidate for not having information the employer did not request.",
"",
"LOCATION / WORK AUTHORISATION",
"Only evaluate location, relocation, visa sponsorship or work authorisation if there is enough information. Otherwise treat it as UNKNOWN rather than assuming eligibility or ineligibility.",
"",
"VAGUE INPUT",
"If the job description is vague or missing real requirements, say so explicitly in the summary.",
"If the resume does not provide enough information to judge a requirement, use UNCLEAR instead of guessing.",
"",
"RESUME QUALITY",
"Separately evaluate whether the resume communicates the candidate's qualifications: missing evidence, weakly quantified achievements, generic bullet points, missing technologies, unclear dates, poor alignment, or relevant experience that is present but poorly communicated.",
"Do NOT lower the qualification score because the writing is weak. Report presentation problems separately.",
"",
"ATS / KEYWORD ANALYSIS",
"Identify important job-description keywords that are present clearly, present under different wording, or missing.",
"Do not recommend keyword stuffing. Only recommend adding a keyword if the candidate genuinely has that skill or experience.",
"",
"HONEST RECRUITER TEST",
"Imagine a recruiter spends 30-60 seconds on this resume. Would this candidate realistically be worth interviewing for this particular role?",
"Choose VERY LIKELY, LIKELY, POSSIBLE, UNLIKELY or VERY UNLIKELY and explain why.",
"Be willing to answer UNLIKELY or VERY UNLIKELY when the candidate is genuinely not competitive.",
"Distinguish 'qualified to apply' from 'competitive for an interview'.",
"",
"STRENGTHS AND GAPS",
"Identify the 3-5 strongest aspects of the candidate's profile for THIS job, each supported by evidence from the resume. No generic praise such as 'you are a great candidate'.",
"Identify the 3-5 most important weaknesses. For each gap set severity HIGH for a missing required qualification, MEDIUM for a missing preferred one, LOW for a minor point.",
"Prioritise gaps that could actually prevent an interview. Do not list trivial missing keywords above major experience gaps.",
"",
"IMPROVEMENTS",
"Give practical recommendations prioritised HIGH, MEDIUM or LOW impact, limited to things the candidate can realistically improve.",
"Never recommend lying, exaggerating experience, claiming a skill the candidate does not have, or keyword stuffing.",
"",
"APPLICATION DECISION",
"Give one final recommendation: APPLY, APPLY - BUT TAILOR RESUME, STRETCH APPLICATION, or LOW PRIORITY.",
"Do not tell the candidate to apply simply because 'there is no harm in trying'.",
"",
"OUTPUT",
"Return ONLY valid JSON, no prose and no code fences, using exactly this structure:",
'{"fit_score":0,"interview_likelihood":"","application_recommendation":"","one_line_verdict":"","summary":"","strengths":[{"title":"","explanation":"","evidence":""}],"gaps":[{"title":"","severity":"","explanation":"","job_requirement":""}],"requirements":[{"requirement":"","importance":"","status":"","evidence":"","impact":""}],"keyword_analysis":{"present":[],"related_wording":[],"missing":[]},"resume_communication_issues":[],"improvements":[{"priority":"","recommendation":"","reason":""}]}',
"",
"FINAL RULE",
"Be honest even when the answer is disappointing. A score of 52 with an accurate explanation is better than a score of 82 that makes the candidate feel good.",
"Never invent qualifications. Never assume experience. Never confuse potential with current suitability. Judge the candidate against the actual job."
].join("\n");

function config() {
  return {
    base: String(process.env.OLLAMA_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ""),
    model: String(process.env.OLLAMA_MODEL || DEFAULT_MODEL)
  };
}

/* ---------------------------------------------------------------- errors -- */
class AnalyzeError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function validate(body) {
  if (!body || typeof body !== "object") {
    throw new AnalyzeError("bad_request", 400, "Request body must be JSON.");
  }
  const resume = typeof body.resume === "string" ? body.resume.trim() : "";
  const jd = typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
  if (resume.replace(/\s/g, "").length < 40) {
    throw new AnalyzeError("empty_resume", 400,
      "This resume is nearly empty - there is nothing to compare against the job.");
  }
  if (jd.replace(/\s/g, "").length < 40) {
    throw new AnalyzeError("empty_job", 400,
      "Paste the job description first - a few words is not enough to analyse.");
  }
  if (resume.length > MAX_FIELD || jd.length > MAX_FIELD) {
    throw new AnalyzeError("too_large", 413,
      "That is longer than this can handle. Trim it to roughly " + MAX_FIELD + " characters.");
  }
  return { resume: resume, jd: jd };
}

/* --------------------------------------------------------------- ollama --- */
async function callOllama(resume, jd, opts) {
  const c = config();
  const timeoutMs = Number(opts.timeoutMs || process.env.OLLAMA_TIMEOUT_MS || 55000);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  const base = {
    model: c.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "CANDIDATE RESUME\n" + resume + "\n\nJOB DESCRIPTION\n" + jd }
    ],
    stream: true,
    format: "json",
    options: { temperature: 0.2, num_ctx: 8192 }
  };
  const send = payload => fetch(c.base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: ctl.signal
  });

  let res;
  try {
    res = await send(THINKERS.test(c.model) ? Object.assign({ think: false }, base) : base);
    /* a model that does not support the think flag rejects the whole request */
    if (!res.ok) {
      const text = await res.text();
      if (/think/i.test(text)) res = await send(base);
      else throw httpFail(res.status, text, c.model);
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof AnalyzeError) throw err;
    if (err && err.name === "AbortError") {
      throw new AnalyzeError("timeout", 504,
        "The model did not finish within " + Math.round(timeoutMs / 1000) + " seconds.");
    }
    throw new AnalyzeError("unreachable", 502,
      "Resume Galley couldn't reach your Ollama model. Check that Ollama is running and your configured connection is available.");
  }
  if (!res.ok) {
    clearTimeout(timer);
    throw httpFail(res.status, await res.text(), c.model);
  }

  let raw = "";
  try {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let j;
        try { j = JSON.parse(t); } catch (e) { continue; }
        if (j.error) throw new AnalyzeError("model_error", 502, String(j.error));
        const piece = (j.message && j.message.content) || "";
        if (piece) {
          raw += piece;
          if (opts.onProgress) opts.onProgress(raw.length);
        }
      }
    }
  } catch (err) {
    if (err instanceof AnalyzeError) { clearTimeout(timer); throw err; }
    clearTimeout(timer);
    if (err && err.name === "AbortError") {
      throw new AnalyzeError("timeout", 504,
        "The model did not finish within " + Math.round(timeoutMs / 1000) + " seconds.");
    }
    throw new AnalyzeError("stream_failed", 502, "The connection to Ollama dropped mid-answer.");
  }
  clearTimeout(timer);
  return { raw: raw, model: c.model };
}

function httpFail(status, text, model) {
  if (status === 404) {
    return new AnalyzeError("no_model", 502,
      'Ollama does not have "' + model + '". Pull it first:  ollama pull ' + model);
  }
  return new AnalyzeError("ollama_http", 502,
    "Ollama answered " + status + (text ? ": " + String(text).slice(0, 200) : ""));
}

/* ------------------------------------------------------ parse and repair -- */
function extractJson(s) {
  /* reasoning models wrap their scratchpad in <think>; drop it first */
  let t = String(s || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const slice = t.slice(a, b + 1);
  try { return JSON.parse(slice); } catch (e) {}
  /* one repair pass: trailing commas are the usual culprit */
  try { return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")); } catch (e) {}
  return null;
}

const pick = (v, list, fallback) => {
  const u = String(v == null ? "" : v).toUpperCase().replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim();
  return list.find(x => x === u) || list.find(x => u.indexOf(x) === 0) || fallback;
};
const asArray = x => (Array.isArray(x) ? x : []);
const asText = x => (typeof x === "string" ? x : x == null ? "" : String(x));

function normalise(j) {
  let score = Number(j.fit_score);
  if (!isFinite(score)) score = 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    fit_score: score,
    interview_likelihood: pick(j.interview_likelihood,
      ["VERY LIKELY", "LIKELY", "POSSIBLE", "UNLIKELY", "VERY UNLIKELY"], "POSSIBLE"),
    application_recommendation: pick(j.application_recommendation,
      ["APPLY - BUT TAILOR RESUME", "STRETCH APPLICATION", "LOW PRIORITY", "APPLY"], "STRETCH APPLICATION"),
    one_line_verdict: asText(j.one_line_verdict),
    summary: asText(j.summary),
    strengths: asArray(j.strengths).map(s => ({
      title: asText(s && s.title),
      explanation: asText(s && s.explanation),
      evidence: asText(s && s.evidence)
    })).filter(s => s.title || s.explanation),
    gaps: asArray(j.gaps).map(g => ({
      title: asText(g && g.title),
      severity: pick(g && g.severity, ["HIGH", "MEDIUM", "LOW"], "MEDIUM"),
      explanation: asText(g && g.explanation),
      job_requirement: asText(g && g.job_requirement)
    })).filter(g => g.title || g.explanation),
    requirements: asArray(j.requirements).map(r => ({
      requirement: asText(r && r.requirement),
      importance: pick(r && r.importance, ["REQUIRED", "PREFERRED"], "PREFERRED"),
      status: pick(r && r.status, ["MATCH", "PARTIAL", "MISSING", "UNCLEAR"], "UNCLEAR"),
      evidence: asText(r && r.evidence),
      impact: pick(r && r.impact, ["HIGH", "MEDIUM", "LOW"], "MEDIUM")
    })).filter(r => r.requirement),
    keyword_analysis: {
      present: asArray(j.keyword_analysis && j.keyword_analysis.present).map(asText),
      related_wording: asArray(j.keyword_analysis && j.keyword_analysis.related_wording).map(asText),
      missing: asArray(j.keyword_analysis && j.keyword_analysis.missing).map(asText)
    },
    resume_communication_issues: asArray(j.resume_communication_issues).map(asText),
    improvements: asArray(j.improvements).map(i => ({
      priority: pick(i && i.priority, ["HIGH", "MEDIUM", "LOW"], "MEDIUM"),
      recommendation: asText(i && i.recommendation),
      reason: asText(i && i.reason)
    })).filter(i => i.recommendation)
  };
}

/* ------------------------------------------------------------- entrypoint - */
async function analyze(body, opts) {
  const { resume, jd } = validate(body);
  const { raw, model } = await callOllama(resume, jd, opts || {});
  const parsed = extractJson(raw);
  if (!parsed) {
    throw new AnalyzeError("bad_json", 502,
      "The model did not return usable JSON. Try again, or set OLLAMA_MODEL to a stronger model - " +
      "smaller ones sometimes drift out of the required format.");
  }
  const result = normalise(parsed);
  result._model = model;
  return result;
}

module.exports = { analyze, validate, extractJson, normalise, config, AnalyzeError, MAX_BODY, MAX_FIELD, SYSTEM_PROMPT };

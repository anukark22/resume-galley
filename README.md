# Resume Galley

A section-based resume editor. Import the resume you already have, edit it as
labelled fields instead of a canvas, and export Word / PDF / plain text.

## Using it

Double-click **`index.html`**. That's it — no server, no install. Your resumes are
saved in that browser under the key `resume-galley/files/v1`.

`app.html` is the same app with the outer document tags stripped, for hosting it
somewhere — a static host, or anywhere that wraps body content. Prefer the local
`index.html` when you need to **print to PDF**, since embedded viewers often block
the print dialog.

Two copies do **not** sync: each browser keeps its own storage. Move a resume
between them with **Files › Download backup** (a `.json` file) and drop that file
into the import box on the other side.

## What imports

| Format | How well it comes through |
| --- | --- |
| `.docx` | Cleanly, bullets included. Best option. |
| `.pdf` | Good. Subset-embedded fonts (Canva, InDesign) are decoded through the font's `/ToUnicode` map, so the text comes out as letters rather than mojibake. The rare PDF that ships no character map at all cannot be recovered by any tool — you get told so plainly. |
| `.txt` | Verbatim. |
| `.json` | A backup exported from this app — restores design settings too. |
| paste | Always works. The fallback when the above disappoint. |

Extracted text always lands in an editable box **before** it is imported, with a
note on how the extraction went, so nothing is imported behind your back.

PDF text is rebuilt from the **position** of each run on the page, not the order
it happens to be drawn in. The graphics matrix (`q`/`Q`/`cm`) is followed as well
as the text matrix, because design tools position every block with it — ignoring
it stacks the whole page on one baseline and weaves the lines together character
by character. A negative vertical component in the text matrix means the page was
laid out top-down, so it is read in increasing y rather than decreasing.

That machinery is what keeps a right-aligned date attached to its job title,
lifts section headings out of a narrow left rail and back in front of the block
they introduce, and avoids the mid-word breaks ("prom otional") that come from
reading kerning as spaces. Hyperlink URLs are recovered from the PDF's link
annotations, since a design tool writes "LinkedIn" as a word and hides the
address elsewhere.

The importer then guesses where sections start (headings, dates at the end of a
line, bullet markers), stitches wrapped sentences back together, and splits jobs
into entries. It is a guess — check each section afterwards.

### Where an import goes

Every document you bring in is **saved as its own resume** by default, so
importing a second one never costs you the first. Drop several files at once and
you get one saved resume each, listed in the order you dropped them, with the
first of them open for editing.

The dialog offers two other destinations for the resume you are currently on —
**Replace this one** and **Add to this one** — and both carry an undo. The choice
resets to "save as a new resume" every time the dialog opens, so a one-off
replace can never quietly overwrite the next document you import.

Two resumes for the same person get numbered — *Anuka Rashmi Kumar*, *Anuka
Rashmi Kumar (2)* — so the list can tell them apart. Rename any of them in the
Files tab.

If an import lands badly, the toast that follows it has an **Undo import** button
for about 12 seconds, which puts back exactly what you had — including the file's
name. Clearing the resume offers the same undo.

## Files

The **Files** tab is your library. Whatever you import or start is saved there
under a name, and every keystroke is written back to it — close the tab, reopen
it later, and the same resume is waiting, unchanged.

- Importing names the file after you (or after the source file) automatically.
- **New blank resume** and **Duplicate** let you keep tailored versions side by
  side; click any row to switch, and each keeps its own content and design.
- **Download .docx / .txt / backup** saves the current one to disk.
- Renaming is just typing in the name box.

These files live in one browser's storage. They survive closing the tab and
restarting the machine, but not clearing site data — and they do not follow you
to another browser or device. **Download backup** (`.json`) is the way to move a
resume between the local copy and the published one, or to another computer:
save it, then drop that file into the import box on the other side.

## Layout

The default is **Side** — section headings in a narrow left rail with the
content beside them, dates right-aligned, the way most designed resumes are set.
**Modern**, **Classic** and **Rule** are in the Design tab, along with typeface,
accent, text size, line spacing, margin and paper size. Every one of those is
per-file, so two resumes can look different.

Picking a template marks that resume as deliberately styled, so it keeps your
choice from then on.

Note the `.docx` export always puts headings above their section rather than
beside it — Word's two-column layouts read badly to applicant tracking systems.
Use **PDF** when the side-heading look matters.

## Job Match

Compares the resume you are editing against a pasted job description and tells
you honestly how well you match. The analysis runs on a model you host yourself
through [Ollama](https://ollama.com) — never a hosted API.

### Architecture

```
browser  ->  /api/analyze-job  ->  Ollama  ->  qwen3:8b
             (server-side only)
```

The browser never talks to Ollama and never learns where it is. `OLLAMA_BASE_URL`
and `OLLAMA_MODEL` are read only inside the API route, so the same build works
against `http://localhost:11434` locally and against a tunnelled endpoint on
Vercel with no code change.

### Configuration

Copy `.env.example` to `.env.local` for local work, and set the same names in
Vercel's project settings for the deployment. Never prefix them with
`NEXT_PUBLIC_` — that would publish them to the browser.

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_TIMEOUT_MS=55000
```

Models to pull (`qwen3:8b` is the default and the better analyst; `gemma3:4b` is
much faster):

```
ollama pull qwen3:8b
ollama pull gemma3:4b
```

### Speed matters more than you would expect

Measured on the machine this was built on, which has no GPU offload — Ollama
reported `vram 0.0GB`, so everything ran on CPU:

| Model | One analysis |
| --- | --- |
| qwen2.5:7b | about 10 minutes |
| qwen2.5:3b | about 7 minutes |

**A Vercel function stops at 60 seconds** (Hobby; 300s on Pro). Streaming keeps
the connection alive but does not extend that limit, so on hardware this slow the
deployed route will hit the cap and report a timeout rather than an answer. Two
ways around it:

- **Run it locally**, where `OLLAMA_TIMEOUT_MS` can be as large as you like:
  `node src/server.js`, then open <http://localhost:4321>.
- **Point `OLLAMA_BASE_URL` at a machine with GPU offload** and use `gemma3:4b`.

### Running locally

```
node src/server.js
```

That serves the app and mounts the same `/api/analyze-job` handler Vercel runs,
so local and deployed behave identically. Opening `index.html` straight from the
file system gives you the editor but not Job Match — there is no server for it to
call, and the panel says so instead of failing silently.

### What it returns

A score out of 100 with a plain label, a one-line verdict, a requirement
breakdown (MATCH / PARTIAL / MISSING / UNCLEAR, each with its evidence), where
you match, where you fall short split into required, preferred and minor gaps,
the recruiter verdict, an application recommendation, and improvements ranked by
impact.

The prompt is deliberately unflattering: keyword overlap is not evidence,
coursework and personal projects are not professional employment, a missing
required qualification visibly costs score, and a result below 50 is a normal
outcome. Run against a deliberately mismatched posting it returned 48 both times.

The route validates both fields, caps their size, strips `<think>` blocks,
attempts one JSON repair, and normalises every field before replying. Failures
come back as plain sentences — unreachable, timeout, missing model — with no
stack traces and no endpoint in the message. Nothing is stored server-side; the
analysis lives in your browser alongside the resume until you clear it.

## Deleting

Every delete asks first — sections, entries, bullet points, skill groups and
links — and the question names what is about to go ("*Senior Front-End Engineer*
and its 2 points"). A row you have not typed anything into yet goes straight
away, since there is nothing to lose.

Either way the toast that follows carries an **Undo** for about 12 seconds.

## Project layout

```
index.html   the app - open this
app.html     same app, body-only, for publishing as an Artifact
api/         analyze-job.js (Vercel function) + shared _lib/analyze.js
src/         source parts; edit these, then run src/build.sh
  01-style.html   tokens, layout, print rules
  02-markup.html  page structure
  03-core.html    state, editor, live preview
  04-io.html      import parsing, docx/txt/json export
  05-fit.html     Job Match panel and report (calls /api/analyze-job)
  build.sh        joins the parts into app.html + index.html
  server.js       dev server: static files plus the /api/analyze-job route
  make-fixtures.js    regenerates test/ sample .docx and plain .pdf
  make-subset-pdf.js  regenerates the subset-font PDF fixtures
  make-layout-pdf.js  regenerates the right-aligned-dates layout fixture
  make-ctm-pdf.js     regenerates the cm-positioned, no-space-glyph fixture
  splice.js           dev helper for replacing a line range in a part
test/        fixtures covering each hard case: plain .docx/.pdf, subset fonts,
             no character map, right-aligned dates, cm-positioned blocks
```

After editing anything in `src/`, rebuild:

```bash
bash src/build.sh
```

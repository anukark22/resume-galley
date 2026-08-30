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

## Job fit

The **Job fit** tab compares the resume you are editing against a pasted job
description using a model running locally through [Ollama](https://ollama.com).
Nothing leaves the machine: the resume and the posting go to
`http://localhost:11434` and nowhere else.

```bash
ollama pull qwen3:8b
```

Use `qwen3:4b` instead on a machine without GPU offload - a 7B model on CPU took
about ten minutes for one report here, a 4B is far quicker. Any installed model
works; **Refresh list** reads what Ollama actually has.

The report gives a fit score, every requirement marked MATCH / PARTIAL / MISSING
/ UNCLEAR, strengths and gaps with severity, keyword coverage, and improvements
ranked by impact. The prompt is deliberately unflattering: keyword overlap is not
evidence, coursework and projects are not professional experience, and a missing
required qualification costs far more than a missing preferred one.

This only works where the page can reach localhost - the local `index.html`, or a
copy served from localhost. The published web copy cannot: its sandbox blocks
outside addresses, and it says so in the tab. If you serve the app from some
other origin, allow it:

```bash
set OLLAMA_ORIGINS=http://localhost:4321
```

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
src/         source parts; edit these, then run src/build.sh
  01-style.html   tokens, layout, print rules
  02-markup.html  page structure
  03-core.html    state, editor, live preview
  04-io.html      import parsing, docx/txt/json export
  build.sh        joins the parts into app.html + index.html
  server.js       optional local server (node src/server.js) on :4321
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

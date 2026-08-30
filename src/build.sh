#!/usr/bin/env bash
# Joins the source parts into the two builds.
#   app.html   - body-only, for publishing as a Claude Artifact
#   index.html - standalone page, open it straight from the folder
set -e
cd "$(dirname "$0")/.."
cat src/01-style.html src/02-markup.html src/03-core.html src/04-io.html > app.html
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' '<meta charset="utf-8">' \
    '<meta name="viewport" content="width=device-width,initial-scale=1">' '</head>' '<body>'
  cat app.html
  printf '%s\n' '</body>' '</html>'
} > index.html
echo "built app.html and index.html"

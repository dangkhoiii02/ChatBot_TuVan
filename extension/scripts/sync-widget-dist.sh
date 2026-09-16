#!/usr/bin/env bash
# Copy widget/dist → extension/widget and rewrite absolute /assets/ → ./assets/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/widget/dist"
DST="$ROOT/extension/widget"
if [[ ! -f "$SRC/index.html" ]]; then
  echo "Missing $SRC/index.html — run widget build first" >&2
  exit 1
fi
rm -rf "$DST"
mkdir -p "$DST"
cp -a "$SRC"/. "$DST"/
python3 - <<PY
from pathlib import Path
p = Path("$DST/index.html")
html = p.read_text(encoding="utf-8")
html = html.replace('src="/assets/', 'src="./assets/').replace('href="/assets/', 'href="./assets/')
p.write_text(html, encoding="utf-8")
print("Synced widget dist → extension/widget (relative assets)")
PY

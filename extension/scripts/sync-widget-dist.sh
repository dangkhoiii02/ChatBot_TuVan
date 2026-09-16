#!/usr/bin/env bash
# Copy widget/dist → extension/widget and rewrite for chrome-extension:// packing:
# - absolute /assets/ → ./assets/
# - strip crossorigin on <script> / <link> (MV3 / extension page quirks)
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
import re
p = Path("$DST/index.html")
html = p.read_text(encoding="utf-8")
html = html.replace('src="/assets/', 'src="./assets/').replace('href="/assets/', 'href="./assets/')
# Remove crossorigin attribute (with optional value) on script/link tags
html = re.sub(r'\s+crossorigin(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?', '', html, flags=re.I)
p.write_text(html, encoding="utf-8")
print("Synced widget dist → extension/widget (relative assets, no crossorigin)")
print(p.read_text(encoding="utf-8"))
PY

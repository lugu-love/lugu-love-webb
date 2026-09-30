#!/usr/bin/env python3
from pathlib import Path
import os
import json

HERE = Path(__file__).resolve().parent
FORMAL = Path(os.environ.get(
    "B74_FORMAL_ROOT",
    "/tmp/b74-doubao-formal-release/candidate-20260920-nuanshan-bear-r1",
))
SRC = FORMAL / "index.html"
DST = HERE / "index.html"
if not SRC.exists():
    raise SystemExit(f"formal index not found: {SRC}")

html = SRC.read_text(encoding="utf-8")
base_path = os.environ.get('B74_BASE_PATH', '').strip().rstrip('/')
base_href = f'{base_path}/formal/' if base_path else '/formal/'
for old_base in (
    '<base href="../candidate-20260920-nuanshan-bear-r1/">',
    '<base href="../release-20260920-nuanshan-bear-r1/">',
):
    html = html.replace(old_base, f'<base href="{base_href}">')
html = html.replace(
    '</head>',
    f'  <script>window.__B74_BASE_PATH = {json.dumps(base_path)}; window.__B74_PIN_CLOUD_KOALA = true;</script>\n'
    f'  <link rel="stylesheet" href="{base_path}/candidate.css?v=12">\n'
    '</head>',
)
needle = 'function takeNextBottleSequenceItem() {\nif (!fengxinRabbitSequence.length) return null;'
patch = 'function takeNextBottleSequenceItem() {\nif (!fengxinRabbitSequence.length) return null;\nif (window.__B74_PIN_CLOUD_KOALA && bottleItemsByCharacter.has("yunqi-koala")) { const koalaItems = bottleItemsByCharacter.get("yunqi-koala") || []; const preferred = bottleItemsById.get("yunqi-koala-01-kaixin") || koalaItems[0]; if (preferred) { pendingBottleSequenceItem = null; lastBottleCharacterId = preferred.characterId; lastBottleItemId = preferred.id; return preferred; } }'
if needle not in html:
    raise SystemExit("takeNextBottleSequenceItem marker not found")
html = html.replace(needle, patch, 1)
candidate_tag = f'  <script type="module" src="{base_path}/candidate.js?v=12"></script>'
last_script_close = html.rfind('</script>')
if last_script_close < 0:
    raise SystemExit("closing script marker not found")
insert_at = last_script_close + len('</script>')
html = html[:insert_at] + '\n' + candidate_tag + html[insert_at:]
DST.write_text(html, encoding="utf-8")
print(f"wrote {DST} ({DST.stat().st_size} bytes)")

#!/usr/bin/env python3
# Re-subsets the bundled Noto CJK faces to every zh/jp character in packages/decks.
# Needs fontTools and brotli (`pip install fonttools brotli`). Run: `pnpm -F mobile fonts:cjk`.
import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[3]
FACES = {'zh': 'noto-sans-chinese', 'jp': 'noto-sans-japanese'}


def strings(node, key=None):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from strings(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v, key)
    elif isinstance(node, str) and key in FACES:
        yield key, node


text = {lang: set() for lang in FACES}
for path in sorted((ROOT / 'packages/decks/src').rglob('*.json')):
    for lang, value in strings(json.loads(path.read_text())):
        text[lang].update(value)

for lang, family in FACES.items():
    # recalcTimestamp off, so a re-run with unchanged decks leaves the files byte-identical
    font = TTFont(ROOT / f'apps/website/public/fonts/{family}_regular.woff2', recalcTimestamp=False)
    subsetter = subset.Subsetter(subset.Options())
    subsetter.populate(text=''.join(sorted(text[lang])))
    subsetter.subset(font)
    # iOS finds the face by its family name and Android by its file name, so the two match.
    name = font['name']
    name.names = [record for record in name.names if record.nameID not in (16, 17)]
    for record in name.names:
        if record.nameID in (1, 4, 6):
            record.string = family
    font.flavor = None
    out = ROOT / f'apps/mobile/assets/fonts/{family}.ttf'
    font.save(out)
    print(f'{out.relative_to(ROOT)}: {len(text[lang])} characters, {out.stat().st_size // 1024} KB')

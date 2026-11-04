#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["fonttools[woff]==4.68.0"]
# ///
"""Regenerate the Noto Sans Chinese/Japanese woff2 subsets in public/fonts.

Each subset keeps every character the committed file already covers (the site and
Share Cards only set Pool questions in these fonts) and adds every character of the
Pool's zh/jp questions. Run after adding Pool questions if cjk-font-coverage.test.ts
fails:

    apps/website/scripts/subset-cjk-fonts.py
"""

import json
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[3]
FONT_DIR = ROOT / "apps/website/public/fonts"
POOL = ROOT / "packages/decks/src/pool/questions.json"
NOTO_CJK = "https://github.com/notofonts/noto-cjk/raw/74981c47522c5b7262fcc344bf01c18e82af5d78/Sans/SubsetOTF/SC"
JP_VARIABLE = (
    "https://github.com/google/fonts/raw/295d98a7a0c17c68f1341eaeea354e7960ea70d3"
    "/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"
)

# The sources the committed subsets were first cut from: static Noto Sans SC, and
# Google Fonts' variable Noto Sans JP pinned to a weight (smaller than the static OTF).
FONTS = [
    # (Pool language, file stem, source URL, wght for a variable source)
    ("zh", "noto-sans-chinese_regular", f"{NOTO_CJK}/NotoSansSC-Regular.otf", None),
    ("zh", "noto-sans-chinese_bold", f"{NOTO_CJK}/NotoSansSC-Bold.otf", None),
    ("jp", "noto-sans-japanese_regular", JP_VARIABLE, 400),
    ("jp", "noto-sans-japanese_bold", JP_VARIABLE, 700),
]


def main() -> None:
    pool = json.loads(POOL.read_text())
    with tempfile.TemporaryDirectory() as tmp:
        for language, stem, url, wght in FONTS:
            target = FONT_DIR / f"{stem}.woff2"
            unicodes = set(TTFont(target).getBestCmap())
            unicodes |= {ord(c) for q in pool.values() for c in q.get(language, "") if not c.isspace()}

            source = Path(tmp) / url.rsplit("/", 1)[1]
            if not source.exists():
                urllib.request.urlretrieve(url, source)
            font = TTFont(source)
            if wght:
                font = instancer.instantiateVariableFont(font, {"wght": wght})
            missing = unicodes - set(font.getBestCmap())
            if missing:
                raise SystemExit(f"{url} lacks {''.join(sorted(map(chr, missing)))}")

            subsetter = subset.Subsetter(subset.Options())
            subsetter.populate(unicodes=unicodes)
            subsetter.subset(font)
            font.flavor = "woff2"
            font.save(target)
            print(f"{target.name}: {len(unicodes)} characters, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()

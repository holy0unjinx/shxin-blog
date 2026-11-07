#!/usr/bin/env python3
"""Remove empty Shinmyeongjo Hangul glyphs and put those syllables in Noto."""

from pathlib import Path
import sys

from fontTools import subset
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "fonts/sm-base.woff2"
FALLBACK = ROOT / "fonts/noto-serif-missing-hangul.woff2"
SOURCE = ROOT / "tools/fonts/sm.woff2"
BASE_RANGES = ((0x2190, 0x21FF), (0x3000, 0x303F), (0x3040, 0x30FF),
               (0x3130, 0x318F), (0xAC00, 0xD7A3), (0xFF00, 0xFFEF))


def has_outline(glyphs, name):
    pen = RecordingPen()
    glyphs[name].draw(pen)
    return bool(pen.value)


def save_subset(font, codepoints, path):
    options = subset.Options()
    options.hinting = False
    options.layout_features = ["*"]
    selected = subset.Subsetter(options=options)
    selected.populate(unicodes=codepoints)
    selected.subset(font)
    # The flavor has to be set on the font. TTFont.save() does not read the
    # subsetter's options, so an .otf source saved here would stay a bare
    # OTTO file under a .woff2 name — which the browser rejects, because the
    # stylesheet promises format("woff2").
    font.flavor = "woff2"
    font.save(path)


def main(noto_path):
    # Always start from the original, so running this script twice is safe.
    shin = TTFont(SOURCE)
    base_points = {cp for first, last in BASE_RANGES for cp in range(first, last + 1)}
    save_subset(shin, base_points, BASE)
    shin = TTFont(BASE)
    cmap = shin.getBestCmap()
    glyphs = shin.getGlyphSet()
    missing = {
        cp for cp, name in cmap.items()
        if 0xAC00 <= cp <= 0xD7A3 and not has_outline(glyphs, name)
    }
    if not missing or ord("졩") not in missing:
        raise RuntimeError("Expected empty Hangul glyphs in the original Shinmyeongjo subset")

    noto = TTFont(noto_path)
    noto_cmap = noto.getBestCmap()
    noto_glyphs = noto.getGlyphSet()
    uncovered = [cp for cp in missing if cp not in noto_cmap or not has_outline(noto_glyphs, noto_cmap[cp])]
    if uncovered:
        raise RuntimeError(f"Noto has no outline for: {uncovered[:10]}")

    save_subset(shin, set(cmap) - missing, BASE)
    save_subset(noto, missing, FALLBACK)
    print(f"Moved {len(missing)} empty Hangul syllables from {BASE.name} to {FALLBACK.name}")


if __name__ == "__main__":
    main(sys.argv[1])

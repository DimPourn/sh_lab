"""Trim the self-hosted web fonts to what the site uses.

Keeps printable ASCII plus the typographic punctuation the copy uses, and narrows each variable
font's axes to the weights and widths the CSS asks for (measured in a browser, 2026-11-24).
If the CSS starts using a weight, width or character outside these ranges, widen PLAN or UNI,
re-run this on the ORIGINAL fonts (from git history or the upstream release), and update the
@font-face ranges in docs/site.css, docs/404.css and docs/case.css to match.

Needs fontTools and brotli (python3 -m pip install fonttools brotli). Run:
    python3 tools/trim-fonts.py <original-fonts-dir> docs/assets/fonts

The fonts are under the SIL Open Font License 1.1, which allows subsetting; none declares a
Reserved Font Name, so the family names stay as they are.
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.varLib.instancer import AxisTriple

UNI = list(range(0x20, 0x7F)) + [
    0xA0, 0xA9, 0xB0, 0xB5, 0xB7, 0xD7,  # nbsp © ° µ · ×
    0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026,  # – — ‘ ’ “ ” • …
    0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2713,  # ← ↑ → ↓ − ✓
]
PLAN = {
    "archivo.woff2": {"wght": (700, 800), "wdth": (68, 85)},
    "instrument-sans.woff2": {"wght": (400, 700), "wdth": 100},
    "martian-mono.woff2": {"wght": (400, 700), "wdth": AxisTriple(87.5, 100, 100)},
    "courier-prime-400.woff2": None,
    "courier-prime-700.woff2": None,
}


def main(src_dir: str, out_dir: str) -> None:
    for name, axes in PLAN.items():
        src = os.path.join(src_dir, name)
        font = TTFont(src)
        opt = subset.Options()
        opt.flavor = "woff2"
        opt.layout_features = subset.Options().layout_features + ["tnum", "pnum"]
        opt.name_IDs = ["*"]
        opt.name_languages = ["*"]
        opt.notdef_outline = True
        opt.glyph_names = False
        sub = subset.Subsetter(opt)
        sub.populate(unicodes=UNI)
        sub.subset(font)  # subset first: instancing first trips over gvar in Martian Mono
        if axes:
            font = instancer.instantiateVariableFont(font, axes, updateFontNames=False)
        out = os.path.join(out_dir, name)
        subset.save_font(font, out, opt)
        print(f"{name:26} {os.path.getsize(src) / 1024:6.1f} KB -> {os.path.getsize(out) / 1024:6.1f} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

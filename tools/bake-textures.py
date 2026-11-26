"""Bake the paper grain, folder fiber and stamp ink mask into small WebP tiles (docs/assets/img/tex/).

These used to be inline SVG feTurbulence filters in case.css and 404.css. Firefox draws SVG filters
on the CPU and redraws them whenever the element's on-screen size or angle changes, so the intro's
moving folders froze it for up to half a second a frame on a 4K screen. A bitmap is drawn by the GPU at
any size and angle, in every browser. The SVGs below are the originals, so the look is unchanged.

Needs Python Playwright with Chromium, and Pillow with WebP support, in the same environment:
    python3 tools/bake-textures.py docs/assets/img/tex
"""
import asyncio
import io
import sys
from pathlib import Path
from urllib.parse import quote

from PIL import Image
from playwright.async_api import async_playwright


def svg(size: int, turbulence: str, matrix: str) -> str:
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}'><filter id='t'>"
            f"<feTurbulence type='fractalNoise' {turbulence} stitchTiles='stitch'/>"
            f"<feColorMatrix values='{matrix}'/></filter><rect width='100%' height='100%' filter='url(#t)'/></svg>")


def srgb(linear: float) -> int:
    # feColorMatrix works in linearRGB by default, so its constant colours are linear values.
    v = 12.92 * linear if linear <= 0.0031308 else 1.055 * linear ** (1 / 2.4) - 0.055
    return round(v * 255)


# name, CSS tile size, baked scale, alpha step (fewer levels compress far better), colour, SVG
TEXTURES = [
    ("grain", 180, 1, 3, (0, 0, 0),
     svg(180, "baseFrequency='.85' numOctaves='2'", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .11 0")),
    ("fiber-2x", 300, 2, 4, (srgb(.25), srgb(.16), srgb(.04)),
     svg(300, "baseFrequency='.012 .55' numOctaves='3'", "0 0 0 0 .25 0 0 0 0 .16 0 0 0 0 .04 0 0 0 .16 0")),
    # The mask's speckles are what you see on a stamp, so it keeps 2x detail but only 4 alpha levels.
    ("ink-2x", 220, 2, 85, (0, 0, 0),
     svg(220, "baseFrequency='.75' numOctaves='2'", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 2.15")),
]


async def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, size, scale, step, rgb, source in TEXTURES:
            ctx = await browser.new_context(device_scale_factor=scale, viewport={"width": size, "height": size})
            page = await ctx.new_page()
            uri = "data:image/svg+xml," + quote(source)
            await page.set_content(f"<body style='margin:0'><img id=t src=\"{uri}\" width={size} height={size} style='display:block'>")
            await page.wait_for_function("document.getElementById('t').complete")
            png = await page.locator("#t").screenshot(omit_background=True)
            await ctx.close()
            # Keep only the alpha from the render; the colour is exact, so screenshot rounding adds no tint.
            alpha = Image.open(io.BytesIO(png)).getchannel("A").point(lambda v: min(255, round(v / step) * step))
            tile = Image.new("RGBA", alpha.size, rgb + (0,))
            tile.putalpha(alpha)
            path = out / f"{name}.webp"
            tile.save(path, "WEBP", lossless=True, method=6, exact=True)
            print(f"{path}  {tile.size[0]}px for a {size}px tile  {path.stat().st_size / 1024:.1f} KB")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1] if len(sys.argv) > 1 else "docs/assets/img/tex")))

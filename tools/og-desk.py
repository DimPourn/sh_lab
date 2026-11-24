"""Shoot the link-preview card (docs/assets/img/og-slip.jpg) from the live desk scene.

Needs Python Playwright with Chromium. Serve docs/ first, then run:
    python3 -m http.server --bind 127.0.0.1 --directory docs 8080
    python3 tools/og-desk.py http://127.0.0.1:8080/ docs/assets/img/og-slip.jpg

Give a new image a new filename (and update og:image) so apps that cached the old card fetch it again.
The card is cropped tight around the routing slip so the headline stays legible in small previews.
"""
import asyncio
import sys

from playwright.async_api import async_playwright

# Hide the controls and hints that make sense on a live page but not on a card.
HIDE = ".case-cue, .case-skip, .sound-toggle, .egg-slip, .to-desk, .case-dust { display: none !important; } .sheet { visibility: hidden !important; }"


async def main(url: str, out: str) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # bypass_csp: the page's own CSP (rightly) refuses the injected style below.
        ctx = await browser.new_context(viewport={"width": 1200, "height": 630}, device_scale_factor=1, color_scheme="dark", bypass_csp=True)
        # Mark the intro as seen, so the page shows the opened file straight away.
        await ctx.add_init_script("try { sessionStorage.setItem('shlab-case-intro', '1') } catch (e) {}")
        page = await ctx.new_page()
        await page.goto(url)
        await page.add_style_tag(content=HIDE)
        await page.wait_for_timeout(2000)
        slip = await page.locator(".case-inner").bounding_box()
        width = slip["width"] + 76
        clip = {"x": slip["x"] - 40, "y": slip["y"] - 30, "width": width, "height": width * 630 / 1200}
        shot_ctx = await browser.new_context(viewport={"width": 1200, "height": 630}, device_scale_factor=1200 / width, color_scheme="dark", bypass_csp=True)
        await shot_ctx.add_init_script("try { sessionStorage.setItem('shlab-case-intro', '1') } catch (e) {}")
        shot = await shot_ctx.new_page()
        await shot.goto(url)
        await shot.add_style_tag(content=HIDE)
        await shot.wait_for_timeout(2000)
        await shot.screenshot(path=out, type="jpeg", quality=88, clip=clip)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))

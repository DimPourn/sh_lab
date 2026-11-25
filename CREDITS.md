# Credits and licences

Everything below is served from the site itself. Nothing is loaded from a third-party origin.

## Libraries (`docs/vendor/`)

| File | Version | Licence |
| --- | --- | --- |
| `gsap.min.js`, `ScrollTrigger.min.js`, `SplitText.min.js`, `DrawSVGPlugin.min.js`, `ScrambleTextPlugin.min.js` | GSAP 3.13.0 | GSAP standard no-charge licence, https://gsap.com/standard-license |
| `lenis.min.js` | Lenis 1.3.27 | MIT, `LICENSE-lenis.txt` |

Each script is pinned with a Subresource Integrity hash (sha384) in `docs/index.html`.

## Fonts (`docs/assets/fonts/`)

All four are under the SIL Open Font License 1.1; each licence file sits next to the fonts.
`tools/trim-fonts.py` trims them to the characters and axes the site uses, which the OFL allows.
None declares a Reserved Font Name.

| Family | Copyright | Licence file |
| --- | --- | --- |
| Archivo | 2020 The Archivo Project Authors | `OFL-archivo.txt` |
| Instrument Sans | 2022 The Instrument Sans Project Authors | `OFL-instrument-sans.txt` |
| Martian Mono | 2021 The Martian Mono Project Authors | `OFL-martian-mono.txt` |
| Courier Prime | 2015 The Courier Prime Project Authors | `OFL-courier-prime.txt` |

## Images

`docs/assets/img/og-slip.jpg` (the link preview) and `.github/assets/desk.jpg` (the README image)
are screenshots of this site. The desk, folders and paper textures are CSS and inline SVG; no
stock images are used.

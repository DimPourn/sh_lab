// Case-file hero: lamp on, walk to the desk, a pile of folders lands, SH-LAB/01 opens.
// case.css renders the opened folder on its own; this file only adds motion on top of it.
(() => {
  const root = document.documentElement;
  const sec = document.querySelector(".case");
  if (!sec) return;
  const $ = (s) => sec.querySelector(s);
  const $$ = (s) => Array.from(sec.querySelectorAll(s));

  const stage = $(".case-stage"), fx = $(".case-fx"), cam = $(".case-cam"), walk = $(".case-walk");
  const main = $(".case-main"), cover = $(".case-cover");
  const piles = [$(".case-pile-a"), $(".case-pile-b"), $(".case-pile-c")];
  const frontShade = $(".case-front .case-shade"), innerShade = $(".case-inner .case-shade");
  const bars = $$(".case-bar:not(.is-kept)"), stamp = $(".case-verified");
  const slip = $(".case-slip"), tofrom = $(".case-tofrom"), h1 = $("h1"), lede = $(".case-lede"), cta = $(".case-cta");
  const dark = $(".case-dark"), dim = $(".case-dim"), light = $(".case-light"), cue = $(".case-cue"), skip = $(".case-skip");
  const phone = window.matchMedia("(max-width: 759px)");
  const KEY = "shlab-case-intro";

  // The stage is drawn at 1280 × 800 (390 wide on phones) and scaled to the viewport.
  function fit() {
    const w = sec.clientWidth, h = sec.clientHeight;
    const s = phone.matches ? w / 390 : Math.min(w / 1280, h / 800);
    stage.style.setProperty("--s", s.toFixed(4));
  }
  fit();
  window.addEventListener("resize", fit);

  const motion = root.classList.contains("motion") && "gsap" in window && "ScrollTrigger" in window;
  if (!motion) return;

  let tl = null, split = null, dustOn = false;
  const seen = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
  const remember = () => { try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode: replay next time */ } };

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    try { start(); } catch (err) { fail(err); }
  });

  function start() {
    gsap.registerPlugin(ScrollTrigger);
    if (window.SplitText) gsap.registerPlugin(SplitText);
    stage.style.visibility = "visible";
    cue.style.visibility = "visible";

    // Pin the desk while the page sheet slides over it (same hand-off as the old hero).
    ScrollTrigger.create({
      trigger: sec,
      start: () => (sec.offsetHeight > window.innerHeight ? "bottom bottom" : "top top"),
      end: () => `+=${window.innerHeight}`,
      pin: true,
      pinSpacing: false,
      invalidateOnRefresh: true,
    });

    const full = window.scrollY < 40 && !location.hash && !seen();
    tl = full ? intro() : quick();
    if (full) remember();
    dust($(".case-dust"));
    pointerLight();
    ScrollTrigger.refresh();
  }

  function intro() {
    const isPhone = phone.matches;
    gsap.set(dark, { autoAlpha: 1 });
    gsap.set(cam, { x: 0, scale: 0.62 });
    gsap.set([...piles, main], { autoAlpha: 0 });
    gsap.set(cover, { rotationY: 0 });
    gsap.set(frontShade, { opacity: 0 });
    gsap.set(innerShade, { opacity: 0.5 });
    gsap.set(bars, { scaleX: 1 });
    gsap.set(stamp, { autoAlpha: 0, scale: 1.8, rotation: -9 });
    gsap.set([slip, tofrom, lede, cta, cue], { autoAlpha: 0, y: 10 });
    if (window.SplitText) {
      split = new SplitText(h1.querySelectorAll("span"), { type: "chars" });
      gsap.set(split.chars, { autoAlpha: 0 });
    } else gsap.set(h1, { autoAlpha: 0 });

    skip.hidden = false;
    gsap.fromTo(skip, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, delay: 0.6 });
    skip.addEventListener("click", () => tl && tl.progress(1), { once: true });

    const t = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: settle });

    // The desk lamp clicks on with a short flicker.
    t.to(dark, { autoAlpha: 0.3, duration: 0.04, ease: "none" }, 0.35)
      .to(dark, { autoAlpha: 0.85, duration: 0.04, ease: "none" }, 0.42)
      .to(dark, { autoAlpha: 0.12, duration: 0.05, ease: "none" }, 0.5)
      .to(dark, { autoAlpha: 0, duration: 0.35, ease: "power1.out" }, 0.58)
      .call(() => { dustOn = true; }, null, 0.6);

    // Walk up to the desk: the view closes in with a footstep bob that settles on arrival.
    t.to(cam, { scale: 0.88, duration: 1.6, ease: "power2.inOut" }, 0.4)
      .to(walk, { y: 7, duration: 0.27, ease: "sine.inOut", yoyo: true, repeat: 5 }, 0.45)
      .to(walk, { y: 0, duration: 0.3, ease: "sine.out" }, 2.07);

    // A pile of folders is tossed onto the desk, SH-LAB/01 last and on top.
    const from = [[600, 760, 34], [680, 820, 42], [580, 850, 30], [640, 790, 38]];
    const land = [[72, 42, 7], [-34, 18, -6], [42, -12, 3.2], [-16, 14, -3.6]];
    [...piles, main].forEach((el, i) => {
      const at = 1.5 + i * 0.14;
      t.set(el, { autoAlpha: 1 }, at).fromTo(
        el,
        { x: from[i][0], y: from[i][1], rotation: from[i][2], scale: 1.08, "--lift": 1 },
        { x: land[i][0], y: land[i][1], rotation: land[i][2], scale: 1, "--lift": 0, duration: 0.62, ease: "back.out(1.15)" },
        at,
      );
    });
    t.to(walk, { keyframes: { x: [0, -5, 4, -3, 1.5, 0], y: [0, 3, -2, 1, 0, 0] }, duration: 0.32, ease: "none" }, 2.3);

    // Pull the top file square and lean in.
    t.to(main, { x: 0, y: 0, rotation: 0, duration: 0.55, ease: "power2.inOut" }, 2.7)
      .to(cam, { scale: 1, duration: 1.0, ease: "power2.inOut" }, 2.7);

    // Open it: the cover swings over the hinge, darkening as it turns from the lamp.
    t.to(cover, { rotationY: -180, duration: 0.95, ease: "power2.inOut" }, 3.25)
      .to(frontShade, { opacity: 0.45, duration: 0.475, ease: "power1.in" }, 3.25)
      .to(innerShade, { opacity: 0, duration: 0.475, ease: "power1.out" }, 3.725);
    if (isPhone) t.to(cam, { x: 340, duration: 0.95, ease: "power2.inOut" }, 3.25);

    // The routing slip types itself; the dossier's redactions lift; the stamp lands.
    t.to([slip, tofrom], { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 }, 3.9);
    if (split) t.to(split.chars, { autoAlpha: 1, duration: 0.01, stagger: 0.036, ease: "none" }, 4.0);
    else t.to(h1, { autoAlpha: 1, duration: 0.4 }, 4.0);
    t.to(bars, { scaleX: 0, duration: 0.45, stagger: 0.13 }, 4.1)
      .to([lede, cta], { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.12 }, 4.85)
      .to(stamp, { autoAlpha: 0.88, scale: 1, duration: 0.16, ease: "power4.in" }, 5.0)
      .to(walk, { keyframes: { x: [0, -2.5, 2, -1, 0] }, duration: 0.22, ease: "none" }, 5.16)
      .to(skip, { autoAlpha: 0, duration: 0.3 }, 5.2)
      .to(cue, { autoAlpha: 1, y: 0, duration: 0.6 }, 5.3);
    return t;
  }

  // Returning visitors and deep links skip the scene and get the open file at once.
  function quick() {
    dustOn = true;
    return gsap.timeline({ onComplete: settle })
      .from(fx, { autoAlpha: 0, duration: 0.6, ease: "power2.out" })
      .from(cue, { autoAlpha: 0, duration: 0.4 }, 0.3);
  }

  // Hand everything back to case.css, then wire the scroll hand-off.
  function settle() {
    skip.hidden = true;
    if (split) { split.revert(); split = null; }
    gsap.set([fx, cam, walk, main, ...piles, ...bars, stamp, slip, tofrom, lede, cta, h1, dark, frontShade, innerShade, skip], { clearProps: "all" });
    gsap.set(cue, { clearProps: "opacity,transform" });
    gsap.set(cover, { rotationY: -180 });
    scrollFx();
  }

  function scrollFx() {
    const scrub = { trigger: sec, start: "top top", end: () => `+=${window.innerHeight}`, scrub: true, invalidateOnRefresh: true };
    const t = gsap.timeline({ scrollTrigger: scrub })
      .to(fx, { scale: 0.94, y: -24, ease: "none" }, 0)
      .to(dim, { opacity: 0.55, ease: "none" }, 0)
      .to(cue, { autoAlpha: 0, duration: 0.15, ease: "none" }, 0);
    // On wide screens the file starts to close as the sheet arrives.
    if (!phone.matches) {
      t.fromTo(cover, { rotationY: -180 }, { rotationY: -118, ease: "power1.in" }, 0)
        .fromTo(innerShade, { opacity: 0 }, { opacity: 0.35, ease: "none" }, 0);
    }
    phone.addEventListener("change", () => { fit(); ScrollTrigger.refresh(); });
  }

  // The lamp follows the pointer a little, like a hand nudging it.
  function pointerLight() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const lx = gsap.quickTo(light, "x", { duration: 1.2, ease: "power3" });
    const ly = gsap.quickTo(light, "y", { duration: 1.2, ease: "power3" });
    sec.addEventListener("pointermove", (e) => {
      const r = sec.getBoundingClientRect();
      lx(((e.clientX - r.left) / r.width - 0.56) * 120);
      ly(((e.clientY - r.top) / r.height - 0.22) * 70);
    });
    sec.addEventListener("pointerleave", () => { lx(0); ly(0); });
  }

  // Dust drifting through the lamp's cone. Stops drawing when the hero is off screen.
  function dust(canvas) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, visible = true, alpha = 0;
    const motes = Array.from({ length: 46 }, () => ({
      x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.012, vy: -(0.004 + Math.random() * 0.01), ph: Math.random() * 6.28,
    }));
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener("resize", size);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(sec);
    gsap.ticker.add((time, dtMs) => {
      if (!visible || !w) return;
      const dt = Math.min(dtMs, 100) / 1000;
      if (dustOn) alpha = Math.min(1, alpha + dt / 1.5);
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.56, cy = h * 0.2, rx = w * 0.42, ry = h * 0.62;
      for (const m of motes) {
        m.x += m.vx * dt; m.y += m.vy * dt; m.ph += dt;
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        if (m.x < -0.05) m.x = 1.05; else if (m.x > 1.05) m.x = -0.05;
        const px = m.x * w + Math.sin(m.ph * 0.7) * 6, py = m.y * h;
        const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
        if (d > 1) continue;
        const a = (1 - d) * 0.5 * alpha * (0.6 + 0.4 * Math.sin(m.ph * 1.3));
        ctx.fillStyle = `rgba(255, 236, 200, ${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, m.r, 0, 6.283); ctx.fill();
      }
    });
  }

  // If anything throws, fall back to the static opened file.
  function fail(err) {
    console.error(err);
    if (tl) tl.kill();
    if (split) split.revert();
    gsap.set([fx, cam, walk, main, cover, ...piles, ...bars, stamp, slip, tofrom, lede, cta, h1, dark, frontShade, innerShade, skip], { clearProps: "all" });
    skip.hidden = true;
    stage.style.visibility = "visible";
    cue.style.visibility = "visible";
    fit();
  }
})();

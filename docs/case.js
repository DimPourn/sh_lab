// Case-file site: the desk is the hero and the menu. Every section below is a file.
// case.css renders everything finished on its own; this file adds motion, sound and
// the file transitions on top of it.
(() => {
  const root = document.documentElement;
  const sec = document.querySelector(".case");
  if (!sec) return;
  const $ = (s, el = sec) => el.querySelector(s);
  const $$ = (s, el = sec) => Array.from(el.querySelectorAll(s));

  const stage = $(".case-stage"), fx = $(".case-fx"), cam = $(".case-cam"), walk = $(".case-walk");
  const desk = $(".case-desk"), key = $(".case-key"), main = $(".case-main"), cover = $(".case-cover");
  const files = $$(".case-file");
  const frontShade = $(".case-front .case-shade"), innerShade = $(".case-inner .case-shade");
  const bars = $$(".case-bar:not(.is-kept)"), stamp = $(".case-verified");
  const slip = $(".case-slip"), tofrom = $(".case-tofrom"), h1 = $("h1"), lede = $(".case-lede"), cta = $(".case-cta");
  const note = $(".case-note"), strip = $(".case-files");
  const dark = $(".case-dark"), dim = $(".case-dim"), light = $(".case-light"), cue = $(".case-cue"), skip = $(".case-skip");
  const veil = document.querySelector(".file-veil"), veilTab = document.querySelector(".file-veil-tab");
  const phone = window.matchMedia("(max-width: 759px)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const KEY = "shlab-case-intro";

  // The stage is drawn at 1280 × 800 (390 wide on phones) and scaled to the viewport.
  // On phones the open folder (design y 104–664) must also end above the file strip,
  // or the strip sits on the folder's buttons and takes their taps.
  const PHONE_FOLDER_BOTTOM = 664 + 12;
  const stripReserve = () => {
    if (!strip || getComputedStyle(strip).display === "none") return 0;
    return strip.offsetHeight + (parseFloat(getComputedStyle(strip).bottom) || 0);
  };
  const scale = () => (phone.matches
    ? Math.min(sec.clientWidth / 390, (sec.clientHeight - stripReserve()) / PHONE_FOLDER_BOTTOM)
    : Math.min(sec.clientWidth / 1280, sec.clientHeight / 800));
  const fit = () => stage.style.setProperty("--s", scale().toFixed(4));
  fit();
  window.addEventListener("resize", fit);

  const sound = createSound();
  setupSoundToggle();
  eggs();

  const motion = root.classList.contains("motion") && "gsap" in window && "ScrollTrigger" in window;
  if (!motion) return;

  let tl = null, split = null, dustOn = false, busy = false;
  const seen = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
  const remember = () => { try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode: replay next time */ } };
  const cssNum = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    try { start(); } catch (err) { fail(err); }
  });

  function start() {
    gsap.registerPlugin(ScrollTrigger);
    if (window.SplitText) gsap.registerPlugin(SplitText);
    stage.style.visibility = "visible";
    cue.style.visibility = "visible";

    // Pin the desk while the page sheet slides over it.
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
    wireFiles();
    sectionFiles();
    deskTab();
    document.querySelector(".to-desk")?.addEventListener("click", () => sound.play("paper"));
    ScrollTrigger.refresh();
  }

  function intro() {
    const isPhone = phone.matches;
    gsap.set(dark, { autoAlpha: 1 });
    gsap.set(cam, { x: 0, scale: 0.62 });
    gsap.set(desk, { filter: "blur(7px)" });
    gsap.set([...files, main], { autoAlpha: 0 });
    gsap.set(cover, { rotationY: 0 });
    gsap.set(frontShade, { opacity: 0 });
    gsap.set(innerShade, { opacity: 0.5 });
    gsap.set(bars, { scaleX: 1 });
    gsap.set(stamp, { autoAlpha: 0, scale: 1.45, rotation: -9 });
    gsap.set([slip, tofrom, lede, cta, cue, note], { autoAlpha: 0, y: 10 });
    if (strip) gsap.set(strip, { autoAlpha: 0, y: 16 });
    if (window.SplitText) {
      split = new SplitText(h1.querySelectorAll("span"), { type: "chars" });
      gsap.set(split.chars, { autoAlpha: 0 });
    } else gsap.set(h1, { autoAlpha: 0 });

    skip.hidden = false;
    gsap.fromTo(skip, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, delay: 0.6 });
    skip.addEventListener("click", () => tl && tl.progress(1), { once: true });

    const t = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: settle });

    // The lamp clicks on with a short flicker.
    t.call(() => sound.play("click"), null, 0.35)
      .to(dark, { autoAlpha: 0.3, duration: 0.04, ease: "none" }, 0.35)
      .to(dark, { autoAlpha: 0.85, duration: 0.04, ease: "none" }, 0.42)
      .to(dark, { autoAlpha: 0.12, duration: 0.05, ease: "none" }, 0.5)
      .to(dark, { autoAlpha: 0, duration: 0.35, ease: "power1.out" }, 0.58)
      .call(() => { dustOn = true; }, null, 0.6);

    // Walk up to the desk. The desk stays soft; the files land sharp, then the desk focuses.
    t.to(cam, { scale: 0.88, duration: 1.6, ease: "power2.inOut" }, 0.4)
      .to(walk, { y: 7, duration: 0.27, ease: "sine.inOut", yoyo: true, repeat: 5 }, 0.45)
      .to(walk, { y: 0, duration: 0.3, ease: "sine.out" }, 2.07)
      .to(desk, { filter: "blur(0px)", duration: 1.6, ease: "power2.out" }, 2.4);

    // The pile is tossed down from the right.
    const land = [[70, 40, 7], [-30, 18, -6], [40, -12, 3], [12, 30, -2], [-48, -6, 5], [58, 10, -4], [-16, -20, 2.5], [28, 26, -7], [-40, 30, 4], [-16, 14, -3.6]]; // one per file, then SH-LAB/01 last
    files.forEach((el, i) => {
      const at = 1.45 + i * 0.075;
      t.set(el, { autoAlpha: 1 }, at).fromTo(
        el,
        { x: 560 + (i % 3) * 50, y: 760 + (i % 4) * 30, rotation: 26 + (i % 5) * 4, scale: 1.08, "--lift": 1 },
        { x: land[i][0], y: land[i][1], rotation: land[i][2], scale: 1, "--lift": 0, duration: 0.62, ease: "back.out(1.15)" },
        at,
      );
      if (i % 3 === 0) t.call(() => sound.play("thud", 0.5), null, at + 0.34);
    });
    // SH-LAB/01 is dropped on top from just above, already in view with its big label readable.
    // Browsers time the main content (LCP) by the first large paint, and a file flying in from
    // off screen is measured at the sliver that was visible, so this one has to arrive in frame.
    const [mx, my, mr] = land[files.length], dropAt = 2.05;
    t.fromTo(main,
      { x: mx + 14, y: my - 34, rotation: mr - 4, scale: 1.16, "--lift": 1 },
      { x: mx, y: my, rotation: mr, scale: 1, "--lift": 0, duration: 0.42, ease: "power2.in" }, dropAt)
      .to(main, { autoAlpha: 1, duration: 0.1, ease: "none" }, dropAt)
      .call(() => sound.play("thud", 1), null, dropAt + 0.42)
      .to(walk, { keyframes: { x: [0, -5, 4, -3, 1.5, 0], y: [0, 3, -2, 1, 0, 0] }, duration: 0.32, ease: "none" }, dropAt + 0.42);

    // Square the pile into an index, pull the top file straight, lean in.
    t.to(files, {
      x: (i, el) => cssNum(el, "--x"), y: 0, rotation: (i, el) => cssNum(el, "--r"),
      duration: 0.5, ease: "power2.inOut", stagger: { each: 0.03, from: "end" },
    }, 2.72)
      .to(main, { x: 0, y: 0, rotation: 0, duration: 0.55, ease: "power2.inOut" }, 2.7)
      .to(cam, { scale: 1, duration: 1.0, ease: "power2.inOut" }, 2.7);

    // Open it: the cover swings over the hinge, darkening as it turns from the lamp.
    t.call(() => sound.play("paper"), null, 3.25)
      .to(cover, { rotationY: -180, duration: 0.95, ease: "power2.inOut" }, 3.25)
      .to(frontShade, { opacity: 0.45, duration: 0.475, ease: "power1.in" }, 3.25)
      .to(innerShade, { opacity: 0, duration: 0.475, ease: "power1.out" }, 3.725);
    if (isPhone) t.to(cam, { x: 340, duration: 0.95, ease: "power2.inOut" }, 3.25);

    // The routing slip types itself, the redactions lift, the stamp lands.
    t.to([slip, tofrom], { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 }, 3.9);
    if (split) t.to(split.chars, { autoAlpha: 1, duration: 0.01, stagger: 0.036, ease: "none" }, 4.0);
    else t.to(h1, { autoAlpha: 1, duration: 0.4 }, 4.0);
    t.to(bars, { scaleX: 0, duration: 0.45, stagger: { each: 0.13, ease: "power1.in" } }, 4.1)
      .to([lede, cta], { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.12 }, 4.85)
      .call(() => sound.play("stamp"), null, 5.12)
      .to(stamp, { autoAlpha: 0.88, scale: 1, duration: 0.16, ease: "power4.in" }, 5.0)
      .to(walk, { keyframes: { x: [0, -2.5, 2, -1, 0] }, duration: 0.22, ease: "none" }, 5.16)
      .to(note, { autoAlpha: 1, y: 0, duration: 0.45, ease: "back.out(1.6)" }, 5.3)
      .to(skip, { autoAlpha: 0, duration: 0.3 }, 5.2)
      .to(cue, { autoAlpha: 1, y: 0, duration: 0.6 }, 5.4);
    if (strip) t.to(strip, { autoAlpha: 1, y: 0, duration: 0.5 }, 5.3);
    return t;
  }

  // Returning visitors and deep links get the open file at once.
  function quick() {
    dustOn = true;
    const t = gsap.timeline({ onComplete: settle }).from(fx, { autoAlpha: 0, duration: 0.6, ease: "power2.out" }).from(cue, { autoAlpha: 0, duration: 0.4 }, 0.3);
    if (strip) t.fromTo(strip, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.3);
    return t;
  }

  // Hand everything back to case.css, then wire the scroll hand-off.
  function settle() {
    skip.hidden = true;
    if (split) { split.revert(); split = null; }
    gsap.set([fx, cam, walk, desk, main, ...files, ...bars, stamp, slip, tofrom, lede, cta, h1, note, dark, frontShade, innerShade, skip], { clearProps: "all" });
    gsap.set(cue, { clearProps: "opacity,transform" });
    if (strip) gsap.set(strip, { clearProps: "transform" });
    gsap.set(cover, { rotationY: -180 });
    sec.classList.add("is-ready");
    scrollFx();
  }

  function scrollFx() {
    const t = gsap.timeline({ scrollTrigger: { trigger: sec, start: "top top", end: () => `+=${window.innerHeight}`, scrub: true, invalidateOnRefresh: true } })
      .to(fx, { scale: 0.94, y: -24, ease: "none" }, 0)
      .to(dim, { opacity: 0.55, ease: "none" }, 0)
      .to(cue, { autoAlpha: 0, duration: 0.15, ease: "none" }, 0);
    if (!phone.matches) {
      t.fromTo(cover, { rotationY: -180 }, { rotationY: -118, ease: "power1.in" }, 0)
        .fromTo(innerShade, { opacity: 0 }, { opacity: 0.35, ease: "none" }, 0);
    }
    phone.addEventListener("change", () => { fit(); ScrollTrigger.refresh(); });
  }

  // ── Files: the pile, the phone strip and the hero's own link open a file ──
  function wireFiles() {
    const links = [...files, ...$$(".case-files a"), ...$$(".case-cta a")];
    for (const link of links) {
      const id = link.getAttribute("href").slice(1);
      const target = document.getElementById(id);
      const folder = files.find((f) => f.getAttribute("href") === `#${id}`);
      if (!target || !folder) continue; // not a file (e.g. the incident list): app.js scrolls to it
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFile(folder, target, e.detail === 0);
      });
    }
  }

  const lenis = () => window.__shlabLenis;
  const scrollY0 = (el) => el.getBoundingClientRect().top + window.scrollY;
  function jump(y) { const l = lenis(); if (l) l.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y); }
  function glide(y, done) {
    const l = lenis();
    if (l) l.scrollTo(y, { duration: 1.4, easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), force: true, onComplete: done });
    else { window.scrollTo({ top: y, behavior: "smooth" }); setTimeout(done, 900); }
  }
  function land(target) {
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    history.replaceState(null, "", `#${target.id}`);
  }

  function openFile(folder, target, fromKeyboard) {
    if (busy) return;
    const y = scrollY0(target);
    // Keyboard and reduced motion: go straight there. Animating keyboard actions only slows them down.
    if (fromKeyboard || reduced.matches) { jump(y); land(target); return; }
    busy = true;
    sound.play("paper");
    lenis()?.stop();
    veilTab.textContent = folder.querySelector(".case-label b").textContent.replace(/^FILE /, "") + " · " + folder.querySelector(".case-label span").textContent;

    const t = gsap.timeline({ onComplete: () => { busy = false; } });
    const atDesk = window.scrollY < window.innerHeight * 0.5 && !phone.matches;
    if (atDesk) {
      // Lead: the file slides out of the pile and flies at the viewer until it fills the screen.
      const s = scale(), S = Math.max(window.innerWidth / s / 480, window.innerHeight / s / 640) * 1.12;
      const rest = [desk, main, key];
      t.set(folder, { zIndex: 30 })
        .to(folder, { x: "+=72", duration: 0.18, ease: "power2.out" })
        .to(folder, { x: -240, y: -16, rotation: 0, scale: S, "--lift": 1, duration: 0.56, ease: "power3.inOut" }, 0.12)
        .to(rest, { filter: "blur(5px) brightness(.7)", duration: 0.56, ease: "power2.inOut" }, 0.12);
    }
    // Support: paper covers the screen, the page jumps behind it, then the paper lifts away
    // while the page glides onto the file, whose own cover opens as it arrives.
    const coverAt = atDesk ? 0.56 : 0;
    t.set(veil, { yPercent: 0 }, coverAt)
      .fromTo(veil, { autoAlpha: 0 }, { autoAlpha: 1, duration: atDesk ? 0.16 : 0.22, ease: "power1.out" }, coverAt)
      .call(() => {
        const hasCover = !!target.querySelector(":scope > .file-cover");
        // Start where the file's cover is still shut, so it opens in view once the paper lifts.
        jump(hasCover ? y - window.innerHeight * 0.85 : y);
        if (atDesk) gsap.set([folder, desk, main, key], { clearProps: "all" });
        lenis()?.start();
        gsap.delayedCall(0.22, () => glide(y, () => land(target)));
      })
      .to(veil, { yPercent: -100, duration: 0.55, ease: "power3.inOut" }, "+=0.04")
      .set(veil, { autoAlpha: 0, yPercent: 0 });
  }

  // The Desk tab shows when the reader scrolls back up (looking for a way out) and tucks
  // away while they read on or pause, so it never sits on a heading or a stamp for long.
  function deskTab() {
    const tab = document.querySelector(".to-desk");
    if (!tab) return;
    let inSheet = false, lastY = window.scrollY, idle = null;
    const show = (on) => root.classList.toggle("show-desk", on);
    const tuckLater = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { if (!tab.matches(":hover, :focus-visible")) show(false); }, 2400);
    };
    ScrollTrigger.create({
      trigger: ".sheet", start: "top 30%", end: "bottom top",
      onToggle: (st) => { inSheet = st.isActive; root.classList.toggle("in-sheet", inSheet); if (!inSheet) show(false); },
    });
    window.addEventListener("scroll", () => {
      const y = window.scrollY, dy = y - lastY;
      lastY = y;
      if (!inSheet || Math.abs(dy) < 3) return;
      if (dy < 0) { show(true); tuckLater(); } else { show(false); }
    }, { passive: true });
    tab.addEventListener("mouseleave", tuckLater);
    tab.addEventListener("blur", tuckLater);
  }

  // ── Sections as files: covers that open on arrival, stamps, the stapled printout ──
  function sectionFiles() {
    // Each cover opens once, in time, as its file comes into view. (Scrubbing tied it to the
    // scroll, so the last file, which can never reach the top of the screen, stayed half open.)
    const covers = Array.from(document.querySelectorAll(".is-file > .file-cover"));
    // Only the first file plays its whole cover. After that a cover is a screen of scrolling
    // with nothing to read, so the rest just stamp their tab as they arrive.
    for (const c of covers.slice(1)) {
      const tab = c.parentElement.querySelector(":scope > .file-tab");
      c.remove();
      if (!tab) continue;
      gsap.fromTo(tab, { autoAlpha: 0, scale: 1.45, rotation: -5 }, {
        autoAlpha: 1, scale: 1, rotation: 0, duration: 0.2, ease: "power4.in",
        scrollTrigger: { trigger: tab.parentElement, start: "top 85%", once: true },
        onComplete: () => sound.play("stamp", 0.35),
      });
    }
    for (const c of covers.slice(0, 1)) {
      gsap.set(c, { transformPerspective: 1800, transformOrigin: "50% 0%" });
      const t = gsap.timeline({ paused: true })
        .to(c, { rotationX: -94, duration: 0.85, ease: "power2.in" }, 0)
        .to(c, { autoAlpha: 0, duration: 0.25, ease: "none" }, 0.62);
      const st = ScrollTrigger.create({
        trigger: c.parentElement, start: "top 78%", once: true,
        onEnter: () => { sound.play("paper", 0.6); t.play(); },
      });
      if (window.scrollY > st.start) t.progress(1);
    }
    for (const s of document.querySelectorAll(".file-stamp")) {
      gsap.fromTo(s, { autoAlpha: 0, scale: 1.8, rotation: -7 }, {
        autoAlpha: 1, scale: 1, rotation: -7, duration: 0.18, ease: "power4.in",
        scrollTrigger: { trigger: s.closest(".report"), start: "top 70%", once: true },
        onComplete: () => sound.play("stamp", 0.6),
      });
    }
    const seal = document.querySelector(".footer-stamp");
    if (seal) {
      gsap.fromTo(seal, { autoAlpha: 0, scale: 1.8, rotation: -6 }, {
        autoAlpha: 1, scale: 1, rotation: -6, duration: 0.18, ease: "power4.in",
        scrollTrigger: { trigger: ".footer", start: "top 95%", once: true },
        onComplete: () => sound.play("stamp", 0.5),
      });
    }
    for (const printout of document.querySelectorAll(".printout")) {
      gsap.timeline({ scrollTrigger: { trigger: printout, start: "top 85%", once: true } })
        .from(printout, { y: -36, rotation: "-=6", autoAlpha: 0, duration: 0.6, ease: "power3.out" })
        .fromTo(printout.querySelector(".staple"), { scaleX: 1.5, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 1, duration: 0.12, ease: "power4.in", onComplete: () => sound.play("click") }, 0.45);
    }
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

  // ── Sound: synthesized with Web Audio (no files), on by default, muted with one button ──
  function createSound() {
    let on = false, ctx = null;
    // On unless the visitor turned it off. Browsers still hold audio until the first click, tap or key.
    on = true;
    try { on = localStorage.getItem("shlab-sound") !== "0"; } catch { /* storage blocked */ }
    const ready = () => {
      if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    };
    const noise = (c, secs) => {
      const buf = c.createBuffer(1, Math.ceil(c.sampleRate * secs), c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; return src;
    };
    const burst = (c, t, { secs, type, freq, q = 0.8, peak, attack = 0.002 }) => {
      const src = noise(c, secs + 0.05), f = c.createBiquadFilter(), g = c.createGain();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
      src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + secs + 0.05);
    };
    const tone = (c, t, { freq, secs, peak, type = "sine", drop = 0.6 }) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * drop, t + secs);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + secs + 0.02);
    };
    const kit = {
      click: (c, t, v) => { tone(c, t, { freq: 2100, secs: 0.02, peak: 0.05 * v, type: "square", drop: 0.8 }); burst(c, t, { secs: 0.03, type: "highpass", freq: 3200, peak: 0.08 * v }); },
      thud: (c, t, v) => { burst(c, t, { secs: 0.22, type: "lowpass", freq: 420, peak: 0.45 * v }); tone(c, t, { freq: 95, secs: 0.16, peak: 0.25 * v }); },
      paper: (c, t, v) => { burst(c, t, { secs: 0.2, type: "bandpass", freq: 2600, q: 0.6, peak: 0.07 * v, attack: 0.03 }); },
      stamp: (c, t, v) => { burst(c, t, { secs: 0.13, type: "lowpass", freq: 950, peak: 0.55 * v }); tone(c, t, { freq: 70, secs: 0.15, peak: 0.4 * v }); },
    };
    return {
      get on() { return on; },
      set(value) { on = value; try { localStorage.setItem("shlab-sound", value ? "1" : "0"); } catch { /* storage blocked */ } },
      play(name, volume = 1) {
        // The context is only created by the first click, tap or key (unlock), never before it.
        if (!on || document.hidden || !ctx) return;
        const c = ready(); if (!c || c.state !== "running") return;
        kit[name](c, c.currentTime + 0.005, volume);
      },
      unlock() { if (on) ready(); },
    };
  }

  function setupSoundToggle() {
    const btn = document.querySelector(".sound-toggle");
    if (!btn) return;
    const show = () => { btn.setAttribute("aria-pressed", String(sound.on)); btn.title = sound.on ? "Sound on" : "Sound off"; };
    show();
    btn.addEventListener("click", () => { sound.set(!sound.on); show(); sound.unlock(); setTimeout(() => sound.play("click"), 30); });
    // Browsers only start audio after a gesture: the first tap anywhere unlocks it if it was left on.
    for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, () => sound.unlock(), { once: true, passive: true });
  }

  // ── Easter eggs: the Konami code, typing sudo, touching the key, and a note in the console ──
  function eggs() {
    const slipEl = document.querySelector(".egg-slip");
    let slipTimer = 0;
    const slip = (title, text, stampText) => {
      if (!slipEl) return;
      const b = document.createElement("b"), p = document.createElement("span");
      b.textContent = title;
      p.textContent = text;
      slipEl.replaceChildren(b, p);
      if (stampText) {
        const st = document.createElement("i");
        st.className = "egg-stamp";
        st.setAttribute("aria-hidden", "true");
        st.textContent = stampText;
        slipEl.append(st);
      }
      slipEl.classList.remove("is-on");
      void slipEl.offsetWidth; // restart the slide-in
      slipEl.classList.add("is-on");
      clearTimeout(slipTimer);
      slipTimer = setTimeout(() => slipEl.classList.remove("is-on"), 6500);
    };

    let lifted = false;
    const lift = () => {
      if (!lifted) {
        lifted = true;
        const home = ["127.0.0.1", "127.0.0.0/8"];
        $$(".case-v.is-redacted").forEach((v, i) => {
          const value = home[i] || home[0];
          const shown = v.querySelector("span[aria-hidden]"), sr = v.querySelector(".case-sr"), tip = v.querySelector(".case-tip");
          if (shown) shown.textContent = value;
          if (sr) sr.textContent = value;
          if (tip) tip.textContent = "There’s no place like home.";
          v.classList.add("is-lifted");
        });
      }
      sound.play("paper");
      slip("Clearance granted", "Redactions lifted. There’s no place like 127.0.0.1.");
    };
    const sudo = () => {
      sound.play("stamp", 0.7);
      slip("IR-04 · opened", "visitor is not in the sudoers file. This incident will be reported.", "Reported");
    };

    // ↑ ↑ ↓ ↓ ← → ← → B A, and "sudo" typed anywhere on the page.
    const konami = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
    let at = 0, typed = "";
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      const k = (e.key || "").toLowerCase();
      if (k === konami[at]) at++;
      else at = k === "arrowup" ? (at === 2 ? 2 : 1) : 0;
      if (at === konami.length) { at = 0; lift(); }
      if (k.length === 1) {
        typed = (typed + k).slice(-8);
        if (typed.endsWith("sudo")) { typed = ""; sudo(); }
      }
    });

    // The key blinks like a real one waiting for a touch, then "types" a one-time password,
    // the way a YubiKey brushed by accident pastes cccccc… into a chat.
    if (key) {
      const tip = key.querySelector(".case-tip"), idle = tip ? tip.textContent : "";
      const modhex = "cbdefghijklnrtuv";
      let timer = 0;
      const touch = () => {
        clearTimeout(timer);
        key.classList.remove("is-touched", "is-typing");
        if (tip) tip.textContent = idle;
        void key.offsetWidth; // restart the blink
        key.classList.add("is-touched");
        sound.play("click", 0.8);
        timer = setTimeout(() => {
          let otp = "cccccc";
          for (let i = 0; i < 38; i++) otp += modhex[Math.floor(Math.random() * 16)];
          if (tip) tip.textContent = otp;
          key.classList.add("is-typing");
          timer = setTimeout(() => {
            key.classList.remove("is-touched", "is-typing");
            if (tip) tip.textContent = idle;
          }, 3400);
        }, 900);
      };
      key.addEventListener("click", touch);
      key.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); touch(); }
      });
    }

    console.log("%cSH-LAB/01 · DECLASSIFIED", "font: 700 13px/1.8 monospace; letter-spacing: .12em; color: #b3352b");
    console.log("Reading the console? Good instinct.\nEverything here is static and self-hosted, behind a strict Content Security Policy.\nSource: https://github.com/DimPourn/sh_lab\nOn the desk, try the Konami code, or type sudo.");
  }

  // If anything throws, fall back to the static opened file.
  function fail(err) {
    console.error(err);
    if (tl) tl.kill();
    if (split) split.revert();
    gsap.set([fx, cam, walk, desk, main, cover, ...files, ...bars, stamp, slip, tofrom, lede, cta, h1, note, dark, frontShade, innerShade, skip], { clearProps: "all" });
    if (strip) gsap.set(strip, { clearProps: "all" });
    skip.hidden = true;
    stage.style.visibility = "visible";
    cue.style.visibility = "visible";
    if (strip) strip.style.visibility = "visible";
    fit();
  }
})();

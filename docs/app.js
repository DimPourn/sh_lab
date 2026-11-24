(() => {
  const root = document.documentElement;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const fig = document.getElementById("board-fig");
  const stack = document.getElementById("stack");
  const packet = document.getElementById("packet");

  const motion = root.classList.contains("motion") && "gsap" in window && "ScrollTrigger" in window;
  if (motion) window.__shlabMotion = true;
  else root.classList.remove("motion");

  // Legend hover highlights the matching part on the board drawing.
  for (const link of fig.querySelectorAll(".legend a[data-part]")) {
    const on = () => { fig.dataset.focus = link.dataset.part; };
    const off = () => { delete fig.dataset.focus; };
    link.addEventListener("mouseenter", on);
    link.addEventListener("focus", on);
    link.addEventListener("mouseleave", off);
    link.addEventListener("blur", off);
  }

  if (!motion) {
    staticStack();
    return;
  }

  // SplitText measures lines, so wait for the self-hosted fonts.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    try {
      startMotion();
    } catch (err) {
      console.error(err);
      root.classList.remove("motion");
      ScrollTrigger.getAll().forEach((st) => { st.animation && st.animation.progress(1); st.kill(); });
      gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1));
    }
  });

  // Without motion the stack-up still marks the layer in the middle of the viewport.
  function staticStack() {
    const bands = Array.from(stack.querySelectorAll(".band"));
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).pop();
      if (!hit) return;
      bands.forEach((b) => b.classList.toggle("is-active", b === hit.target));
      const lid = hit.target.querySelector(".lid");
      packet.style.setProperty("--packet-y", `${hit.target.offsetTop + lid.offsetTop + lid.offsetHeight / 2}px`);
      stack.classList.add("is-tracking");
    }, { rootMargin: "-45% 0px -50% 0px" });
    bands.forEach((b) => io.observe(b));
  }

  function startMotion() {
    gsap.registerPlugin(ScrollTrigger);
    for (const name of ["SplitText", "DrawSVGPlugin", "ScrambleTextPlugin"]) {
      if (window[name]) gsap.registerPlugin(window[name]);
    }
    const hasSplit = "SplitText" in window;
    const hasDraw = "DrawSVGPlugin" in window;
    const hasScramble = "ScrambleTextPlugin" in window;
    const mm = gsap.matchMedia();

    // Reverting a SplitText can nudge layout, which leaves trigger positions stale.
    let pendingRefresh = null;
    const refreshSoon = () => {
      if (pendingRefresh) pendingRefresh.kill();
      pendingRefresh = gsap.delayedCall(0.15, () => ScrollTrigger.refresh());
    };
    const unsplit = (split) => { if (split) { split.revert(); refreshSoon(); } };
    const scramble = (el, chars, duration = 0.9) =>
      hasScramble ? gsap.to(el, { duration, scrambleText: { text: el.textContent, chars, speed: 0.6 } }) : gsap.timeline();
    const countUp = (el, duration) => {
      const text = el.textContent;
      const match = text.match(/^([\d,]+)(.*)$/s);
      if (!match) return gsap.timeline();
      const end = parseInt(match[1].replace(/,/g, ""), 10);
      const counter = { v: 0 };
      el.textContent = `0${match[2]}`;
      return gsap.to(counter, {
        v: end,
        duration: duration ?? (end > 99 ? 1.8 : 0.8),
        ease: "power2.out",
        onUpdate: () => { el.textContent = Math.round(counter.v).toLocaleString("en-US") + match[2]; },
        onComplete: () => { el.textContent = text; },
      });
    };
    const blurIn = { autoAlpha: 0, y: 22, filter: "blur(10px)" };

    // Smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync.
    if ("Lenis" in window) {
      const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
      window.__shlabLenis = lenis; // case.js drives file transitions with it
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      document.addEventListener("click", (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a || a.classList.contains("skip-link")) return;
        const hash = a.getAttribute("href");
        const target = hash === "#top" ? 0 : document.querySelector(hash);
        if (target === null) return;
        e.preventDefault();
        lenis.scrollTo(target, { duration: 1.6, easing: (x) => 1 - Math.pow(1 - x, 4) });
        history.replaceState(null, "", hash);
      });
      if (location.hash.length > 1) {
        const target = document.querySelector(location.hash);
        if (target) window.addEventListener("load", () => lenis.scrollTo(target, { immediate: true }), { once: true });
      }
    }

    gsap.to(".progress", {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.3 },
    });

    // ── Board plate: an exploded drawing that assembles once it is in view ──
    const stage = document.querySelector(".plate-stage");
    const board = fig.querySelector(".board");
    const parts = gsap.utils.toArray(".board .part");
    const route = document.getElementById("route");
    const packetLayer = document.getElementById("packets");
    const traffic = gsap.timeline({ repeat: -1, paused: true });
    const routeLength = route.getTotalLength();
    const routeStart = route.getPointAtLength(0);
    for (let i = 0; i < 3; i++) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("r", "5");
      dot.setAttribute("cx", routeStart.x);
      dot.setAttribute("cy", routeStart.y);
      dot.setAttribute("opacity", "0");
      packetLayer.appendChild(dot);
      const state = { d: 0 };
      traffic.to(state, {
        d: routeLength, duration: 2.4, ease: "power1.inOut",
        onUpdate: () => {
          const p = route.getPointAtLength(state.d);
          const t = state.d / routeLength;
          dot.setAttribute("cx", p.x.toFixed(1));
          dot.setAttribute("cy", p.y.toFixed(1));
          dot.setAttribute("opacity", Math.min(1, t * 8, (1 - t) * 8).toFixed(2));
        },
      }, i * 0.8);
    }

    mm.add({ wide: "(min-width: 1081px)", narrow: "(max-width: 1080px)" }, (ctx) => {
      const { wide } = ctx.conditions;
      // Plays once when the board comes into view (it used to be pinned and scrubbed).
      const asm = gsap.timeline({ defaults: { ease: "none" }, paused: true, onComplete: () => traffic.play() });
      asm.fromTo(board, {
        rotationX: 58, rotationZ: -14, scale: 0.8, y: 60, transformPerspective: 1500, transformOrigin: "50% 65%",
      }, { rotationX: 0, rotationZ: 0, scale: 1, y: 0, duration: 1, ease: "power2.out" }, 0);
      parts.forEach((part, i) => {
        asm.fromTo(part, { y: -(70 + ((i * 47) % 110)), autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" }, 0.12 + i * 0.035);
      });
      if (hasDraw) {
        asm.fromTo(board.querySelectorAll(".traces path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.45, stagger: 0.025 }, 0.4);
        asm.fromTo(board.querySelectorAll(".leader"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.15, stagger: 0.03 }, 0.86);
      }
      asm
        .fromTo(board.querySelectorAll(".silk.mark"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 0.8)
        .fromTo(board.querySelectorAll(".balloons circle, .balloons text"), { scale: 0, transformOrigin: "50% 50%" }, {
          scale: 1, duration: 0.18, stagger: 0.025, ease: "back.out(2.4)",
        }, 0.86)
        .fromTo(fig.querySelectorAll(".legend li, .fig-note"), { autoAlpha: 0, x: wide ? 40 : 0, y: wide ? 0 : 24, filter: "blur(8px)" }, {
          autoAlpha: 1, x: 0, y: 0, filter: "blur(0px)", duration: 0.3, stagger: 0.05, ease: "power3.out",
        }, 0.7);
      asm.timeScale(0.44); // about 2.6 s end to end
      const st = ScrollTrigger.create({
        trigger: stage,
        start: wide ? "top 72%" : "top 82%",
        once: true,
        onEnter: () => gsap.delayedCall(0.3, () => asm.play()), // let the file cover lift first
      });
      if (window.scrollY > st.start) asm.progress(1);
      return () => traffic.pause();
    });

    const specs = gsap.utils.toArray(".specs > div");
    const specsTl = gsap.timeline({ scrollTrigger: { trigger: ".specs", start: "top 92%", once: true } })
      .from(specs, { ...blurIn, duration: 1, stagger: 0.08, ease: "power3.out" }, 0);
    specs.forEach((div, i) => specsTl.add(countUp(div.querySelector("dd")), 0.15 + i * 0.08));

    // ── Section heads: rules draw, labels decode, headings rise word by word ──
    gsap.utils.toArray(".sec-head").forEach((head) => {
      const tag = head.querySelector(".label");
      const body = head.querySelector(":scope > div");
      const h2 = head.querySelector("h2");
      const split = hasSplit ? SplitText.create(h2, { type: "lines,words", mask: "lines" }) : null;
      gsap.timeline({
        defaults: { ease: "expo.out" },
        scrollTrigger: { trigger: head, start: "top 88%", once: true },
        onComplete: () => unsplit(split),
      })
        .fromTo([tag, body], { "--draw": 0 }, { "--draw": 1, duration: 1.4, ease: "power3.inOut", stagger: 0.12 }, 0)
        .add(scramble(tag, "upperCase", 1), 0.1)
        .from(split ? split.words : h2, { yPercent: 118, rotation: 5, transformOrigin: "0% 100%", duration: 1.2, stagger: 0.04 }, 0.15)
        .from(body.querySelector("p"), { ...blurIn, duration: 1.3, ease: "power3.out" }, 0.5);
    });

    // ── Stack-up ────────────────────────────────────────────────────────────
    const bands = gsap.utils.toArray(".band", stack);
    bands.forEach((band) => {
      gsap.timeline({ scrollTrigger: { trigger: band, start: "top 94%", once: true } })
        .fromTo(band, { clipPath: "inset(0% 100% 0% 0%)" }, {
          clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "power4.inOut", clearProps: "clipPath",
        }, 0)
        .fromTo(band, { "--fill": 0 }, { "--fill": 1, duration: 1.2, ease: "power3.inOut" }, 0.1)
        .from(band.querySelectorAll(".lid, .band-body > *, .band-tag"), {
          autoAlpha: 0, y: 14, filter: "blur(8px)", duration: 1, stagger: 0.07, ease: "power3.out",
        }, 0.35);
      ScrollTrigger.create({ trigger: band, start: "top center", end: "bottom center", toggleClass: { targets: band, className: "is-active" } });
    });
    gsap.from(".via-mesh", { scaleY: 0, ease: "none", scrollTrigger: { trigger: stack, start: "top 75%", end: "bottom 55%", scrub: 0.6 } });
    const lidCenter = (band) => {
      const lid = band.querySelector(".lid");
      return band.offsetTop + lid.offsetTop + lid.offsetHeight / 2;
    };
    gsap.fromTo(packet, { y: () => lidCenter(bands[0]) }, {
      y: () => lidCenter(bands[bands.length - 1]),
      ease: "none",
      scrollTrigger: {
        trigger: stack, start: "top center", end: "bottom center", scrub: 0.8, invalidateOnRefresh: true,
        onToggle: (self) => stack.classList.toggle("is-tracking", self.isActive),
      },
    });
    const stop = stack.querySelector(".stop");
    const blocked = document.createElement("span");
    blocked.className = "packet-public";
    blocked.setAttribute("aria-hidden", "true");
    stack.appendChild(blocked);
    gsap.timeline({ scrollTrigger: { trigger: stack, start: "top 80%", once: true } })
      .from(".via-public", { scaleY: 0, duration: 0.7, ease: "power2.in" })
      .from(stop, { scale: 2.8, rotation: -90, autoAlpha: 0, duration: 0.7, ease: "back.out(2.6)" });
    const attack = gsap.timeline({ repeat: -1, repeatDelay: 1.3, paused: true })
      .fromTo(blocked, { y: -8, autoAlpha: 0, scale: 1 }, { y: () => stop.offsetTop, autoAlpha: 1, duration: 0.9, ease: "power1.in" })
      .to(blocked, { scale: 2.4, autoAlpha: 0, duration: 0.4, ease: "power2.out" })
      .fromTo(stop, { scale: 1 }, { scale: 1.4, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, "<");
    ScrollTrigger.create({ trigger: stack, start: "top 80%", end: "bottom top", onToggle: (self) => (self.isActive ? attack.play() : attack.pause()) });

    // ── Monitoring: stages swing in, signals flow, and the phone buzzes ────
    const stages = gsap.utils.toArray(".stage");
    const flow = gsap.timeline({ scrollTrigger: { trigger: ".flow", start: "top 85%", once: true } });
    stages.forEach((st, i) => {
      const at = i * 0.32;
      const stageLabel = st.querySelector(".stage-label");
      flow
        .from(st, { autoAlpha: 0, rotationY: -32, x: -24, transformPerspective: 1000, transformOrigin: "0% 50%", duration: 1.2, ease: "expo.out" }, at)
        .fromTo(stageLabel, { "--draw": 0 }, { "--draw": 1, duration: 0.8, ease: "power2.out" }, at + 0.1)
        .add(scramble(stageLabel, "upperCase", 0.8), at + 0.05)
        .from(st.querySelectorAll(".nodes li"), { autoAlpha: 0, y: 14, filter: "blur(6px)", duration: 0.8, stagger: 0.06, ease: "power3.out" }, at + 0.2)
        .fromTo(st, { "--arrow": 0, "--arrow-head": 0 }, { "--arrow": 1, "--arrow-head": 1, duration: 0.5, ease: "power2.inOut" }, at + 0.55);
    });
    const phone = document.querySelector(".stage-end .nodes li");
    flow
      .to(phone, { x: 2.5, duration: 0.045, repeat: 11, yoyo: true, ease: "none" })
      .fromTo(phone, { boxShadow: "0 0 0 0px rgba(176, 125, 34, 0.5)" }, {
        boxShadow: "0 0 0 18px rgba(176, 125, 34, 0)", duration: 1.2, repeat: 1, ease: "power2.out",
      }, "<");
    gsap.from(".notes > div", { ...blurIn, duration: 1.2, stagger: 0.14, ease: "power3.out", scrollTrigger: { trigger: ".notes", start: "top 88%", once: true } });
    mm.add("(min-width: 1081px)", () => {
      const signals = gsap.timeline({ repeat: -1, paused: true });
      const travel = parseFloat(getComputedStyle(root).fontSize) * 1.45;
      stages.slice(0, -1).forEach((st, i) => {
        const dot = document.createElement("span");
        dot.className = "signal";
        dot.setAttribute("aria-hidden", "true");
        st.appendChild(dot);
        signals.fromTo(dot, { x: 0, autoAlpha: 0 }, {
          keyframes: [{ autoAlpha: 1, duration: 0.12 }, { x: travel, duration: 0.5, ease: "none" }, { autoAlpha: 0, duration: 0.12 }],
        }, i * 0.35);
      });
      signals.to({}, { duration: 0.8 });
      flow.eventCallback("onComplete", () => signals.play());
      const st = ScrollTrigger.create({
        trigger: ".flow", start: "top bottom", end: "bottom top",
        onToggle: (self) => (self.isActive && flow.progress() === 1 ? signals.play() : signals.pause()),
      });
      return () => { st.kill(); signals.kill(); document.querySelectorAll(".signal").forEach((d) => d.remove()); };
    });

    // ── Hardening: the excerpt types itself, annotations light their line ──
    const code = document.querySelector(".code code");
    code.innerHTML = code.innerHTML.split("\n").map((line) => `<span class="ln"><span class="lt">${line}</span></span>`).join("");
    const codeLines = gsap.utils.toArray(".code .ln");
    const typing = gsap.timeline({
      scrollTrigger: { trigger: ".code-card", start: "top 80%", once: true },
      onComplete: () => document.querySelector(".code").classList.add("is-typed"),
    })
      .from(".code-card", { autoAlpha: 0, y: 40, rotationX: 12, transformPerspective: 1200, transformOrigin: "50% 0%", duration: 1.2, ease: "expo.out" }, 0)
      .add(scramble(document.querySelector(".code-title span"), "lowerCase", 0.8), 0.2);
    let typeAt = 0.45;
    codeLines.forEach((line) => {
      const text = line.querySelector(".lt");
      const len = Math.max(1, text.textContent.length);
      const d = Math.min(0.26, len * 0.007);
      typing.fromTo(text, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: d, ease: `steps(${len})` }, typeAt);
      const b = text.querySelector(".b");
      if (b) typing.from(b, { scale: 0, duration: 0.35, ease: "back.out(3)" }, typeAt + d - 0.05);
      typeAt += d + 0.04;
    });
    gsap.utils.toArray(".annotations li").forEach((li) => {
      const n = li.querySelector(".balloon").textContent.trim();
      const line = codeLines.find((l) => l.querySelector(".b")?.textContent.trim() === n);
      const set = (on) => { li.classList.toggle("is-active", on); line && line.classList.toggle("is-active", on); };
      gsap.from(li, { autoAlpha: 0, x: 30, filter: "blur(8px)", duration: 1, ease: "power3.out", scrollTrigger: { trigger: li, start: "top 95%", once: true } });
      ScrollTrigger.create({ trigger: li, start: "top 58%", end: "bottom 58%", onToggle: (self) => set(self.isActive) });
      li.addEventListener("mouseenter", () => set(true));
      li.addEventListener("mouseleave", () => set(false));
    });
    gsap.from(".aside", { ...blurIn, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: ".aside", start: "top 92%", once: true } });

    // ── Parts list: a scanline sweeps the table and lights each row ────────
    const wrap = document.querySelector(".bom").closest(".table-wrap");
    const scanline = document.createElement("span");
    scanline.className = "scanline";
    scanline.setAttribute("aria-hidden", "true");
    wrap.appendChild(scanline);
    const rows = gsap.utils.toArray(".bom tbody tr");
    const light = (tr) => {
      if (tr.classList.contains("is-lit")) return;
      tr.classList.add("is-lit");
      const ref = tr.querySelector("td:first-child");
      if (ref) scramble(ref, "0123456789ABCDEF", 0.7);
    };
    ScrollTrigger.create({
      trigger: wrap, start: "top 88%", end: "bottom 80%", scrub: true,
      onUpdate: (self) => {
        const y = self.progress * wrap.offsetHeight;
        gsap.set(scanline, { y, autoAlpha: self.progress > 0.005 && self.progress < 0.995 ? 1 : 0 });
        rows.forEach((tr) => { if (tr.offsetTop + tr.offsetHeight * 0.5 <= y + 4) light(tr); });
      },
      onLeave: () => { rows.forEach(light); gsap.set(scanline, { autoAlpha: 0 }); },
      onRefresh: (self) => { if (self.progress === 1) rows.forEach(light); },
    });

    // ── Incident reports: each one prints, decodes and gets stamped ────────
    gsap.utils.toArray(".report").forEach((report) => {
      const id = report.querySelector(".report-id");
      const tl = gsap.timeline({ defaults: { ease: "expo.out" }, scrollTrigger: { trigger: report, start: "top 88%", once: true } })
        .fromTo(report, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.5, ease: "power3.inOut", clearProps: "clipPath" }, 0)
        .fromTo(report, { "--draw": 0 }, { "--draw": 1, duration: 1.2, ease: "power3.inOut" }, 0)
        .add(scramble(id, "0123456789", 1.1), 0.1)
        .from(report.querySelector(".report-cat"), { autoAlpha: 0, y: 10, duration: 0.8 }, 0.35)
        .from(report.querySelector(".status .pass"), { scale: 2.6, rotation: -18, autoAlpha: 0, duration: 0.6, ease: "back.out(2.2)" }, 1.0)
        .from(report.querySelector("h3"), { ...blurIn, y: 26, duration: 1.1, ease: "power3.out" }, 0.25)
        .from(report.querySelectorAll(".fields > div"), { ...blurIn, duration: 1, stagger: 0.1, ease: "power3.out" }, 0.4);
      const matrixRows = report.querySelectorAll(".matrix caption, .matrix thead tr, .matrix tbody tr");
      if (matrixRows.length) {
        tl.from(matrixRows, { autoAlpha: 0, x: -14, duration: 0.6, stagger: 0.1, ease: "power3.out" }, 0.75)
          .from(report.querySelectorAll(".matrix .pass"), { scale: 2.6, rotation: -18, autoAlpha: 0, duration: 0.55, stagger: 0.22, ease: "back.out(2.2)" }, 1.15);
      }
      report.querySelectorAll(".fig-num").forEach((el, i) => {
        tl.from(el.parentElement, { autoAlpha: 0, y: 20, duration: 0.9 }, 0.65 + i * 0.12).add(countUp(el, 1.8), 0.65 + i * 0.12);
      });
      const pipeline = report.querySelector(".pipeline");
      if (pipeline) {
        const steps = pipeline.querySelectorAll("li");
        tl.from(steps, { autoAlpha: 0, y: 16, filter: "blur(6px)", duration: 0.7, stagger: 0.28, ease: "power3.out" }, 0.75)
          .call(() => pipeline.classList.add("is-done"), null, 0.75 + steps.length * 0.28 + 0.2)
          .from(report.querySelector(".pipeline-note"), { ...blurIn, duration: 1, ease: "power3.out" }, ">");
      }
    });

    gsap.from(".gaps li", { ...blurIn, duration: 1, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ".gaps", start: "top 88%", once: true } });

    gsap.from(".footer-inner > *", { autoAlpha: 0, y: 12, duration: 0.9, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".footer", start: "top 98%", once: true } });

    window.addEventListener("load", () => ScrollTrigger.refresh());
  }
})();

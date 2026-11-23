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

  // Mark the masthead link for the section in view.
  const navLinks = new Map(
    Array.from(document.querySelectorAll(".masthead-nav a")).map((a) => [a.getAttribute("href").slice(1), a])
  );
  const sectionIo = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a, id) => {
        if (id === e.target.id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
  }, { rootMargin: "-40% 0px -55% 0px" });
  for (const id of [...navLinks.keys(), "top"]) {
    const el = document.getElementById(id);
    if (el) sectionIo.observe(el);
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
    const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
    const rgba = (hex, a) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };
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

    // Smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync.
    if ("Lenis" in window) {
      const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
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
        // Lenis applies the page's scroll-padding-top, which already clears the sticky masthead.
        lenis.scrollTo(target, { duration: 1.5, easing: (x) => 1 - Math.pow(1 - x, 4) });
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

    // Vanta mesh behind the hero, recolored when the theme flips.
    const meshEl = document.getElementById("hero-mesh");
    let mesh = null;
    const startMesh = () => {
      if (mesh || !window.VANTA || !window.THREE) return;
      const small = window.innerWidth < 760;
      try {
        mesh = VANTA.NET({
          el: meshEl,
          THREE: window.THREE,
          mouseControls: true,
          touchControls: false,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 1,
          color: parseInt(cssVar("--mesh").slice(1), 16),
          backgroundColor: parseInt(cssVar("--paper").slice(1), 16),
          backgroundAlpha: 0,
          points: small ? 7 : 11,
          maxDistance: small ? 18 : 22,
          spacing: small ? 19 : 16,
          showDots: true,
        });
      } catch (err) {
        mesh = null;
      }
    };
    startMesh();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (mesh) { mesh.destroy(); mesh = null; }
      startMesh();
    });

    // Hero intro.
    const heroCopy = document.querySelector(".hero-copy");
    const h1 = heroCopy.querySelector("h1");
    const board = fig.querySelector(".board");
    const specs = gsap.utils.toArray(".specs > div");
    gsap.set([...heroCopy.children, fig, ...specs, meshEl], { visibility: "visible" });

    const intro = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } });
    const h1Split = hasSplit ? SplitText.create(h1, { type: "lines", mask: "lines" }) : null;
    intro
      .fromTo(meshEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 2.4, ease: "power2.out" }, 0)
      .from(heroCopy.querySelector(".label"), { autoAlpha: 0, y: 14, duration: 0.8 }, 0.1)
      .from(h1Split ? h1Split.lines : h1, {
        yPercent: 110, autoAlpha: h1Split ? 1 : 0, duration: 1.2, stagger: 0.09,
        onComplete: () => unsplit(h1Split),
      }, 0.2)
      .from(heroCopy.querySelector(".lede"), { autoAlpha: 0, y: 20, duration: 1 }, 0.6)
      .from(heroCopy.querySelectorAll(".cta .btn"), { autoAlpha: 0, y: 16, duration: 0.8, stagger: 0.08 }, 0.75)
      .from(board, { autoAlpha: 0, y: 40, scale: 0.97, transformOrigin: "50% 60%", duration: 1.3 }, 0.3);
    if (hasDraw) {
      intro.from(board.querySelectorAll(".traces path"), { drawSVG: 0, duration: 1.5, stagger: 0.05, ease: "power2.inOut" }, 0.6);
      intro.from(board.querySelectorAll(".leader"), { drawSVG: 0, duration: 0.5, stagger: 0.1, ease: "power2.out" }, 1.55);
    }
    intro
      .from(board.querySelectorAll(".part"), {
        autoAlpha: 0, scale: 0.86, transformOrigin: "50% 50%", duration: 0.7, stagger: 0.04, ease: "back.out(1.7)",
      }, 0.75)
      .from(board.querySelectorAll(".silk.mark"), { autoAlpha: 0, duration: 0.8 }, 1.3)
      .from(board.querySelectorAll(".balloons circle, .balloons text"), {
        scale: 0, transformOrigin: "50% 50%", duration: 0.6, stagger: 0.06, ease: "back.out(2.6)",
      }, 1.6)
      .from(fig.querySelectorAll(".legend li"), { autoAlpha: 0, y: 18, duration: 0.8, stagger: 0.08 }, 1.5)
      .from(fig.querySelector(".fig-note"), { autoAlpha: 0, duration: 0.8 }, 1.9)
      .from(specs, { autoAlpha: 0, y: 22, duration: 0.9, stagger: 0.07 }, 1.3);
    specs.forEach((div, i) => intro.add(countUp(div.querySelector("dd")), 1.45 + i * 0.07));
    intro.play();

    // Board traffic, ACT-style: packets ride the Ethernet → RP1 → SoC trace.
    const route = document.getElementById("route");
    const packetLayer = document.getElementById("packets");
    const start = route.getPointAtLength(0);
    const routeLength = route.getTotalLength();
    const traffic = gsap.timeline({ repeat: -1, paused: true });
    for (let i = 0; i < 3; i++) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("r", "5");
      dot.setAttribute("cx", start.x);
      dot.setAttribute("cy", start.y);
      dot.setAttribute("opacity", "0");
      packetLayer.appendChild(dot);
      const state = { d: 0 };
      traffic.to(state, {
        d: routeLength,
        duration: 2.4,
        ease: "power1.inOut",
        onUpdate: () => {
          const p = route.getPointAtLength(state.d);
          const t = state.d / routeLength;
          dot.setAttribute("cx", p.x.toFixed(1));
          dot.setAttribute("cy", p.y.toFixed(1));
          dot.setAttribute("opacity", Math.min(1, t * 8, (1 - t) * 8).toFixed(2));
        },
      }, i * 0.8);
    }
    intro.call(() => traffic.play(), null, 2);
    ScrollTrigger.create({
      trigger: fig, start: "top bottom", end: "bottom top",
      onToggle: (self) => (self.isActive && intro.progress() > 0.9 ? traffic.play() : traffic.pause()),
    });

    // Hero depth: pointer tilt on the board, parallax on the way out.
    mm.add("(hover: hover) and (pointer: fine)", () => {
      const hero = document.querySelector(".hero");
      gsap.set(board, { transformPerspective: 1200 });
      const rx = gsap.quickTo(board, "rotationX", { duration: 0.9, ease: "power3" });
      const ry = gsap.quickTo(board, "rotationY", { duration: 0.9, ease: "power3" });
      const move = (e) => {
        const r = hero.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 9);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 7);
      };
      const reset = () => { rx(0); ry(0); };
      hero.addEventListener("pointermove", move);
      hero.addEventListener("pointerleave", reset);
      return () => {
        hero.removeEventListener("pointermove", move);
        hero.removeEventListener("pointerleave", reset);
      };
    });
    const heroOut = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true };
    gsap.to(fig, { y: -60, ease: "none", scrollTrigger: heroOut });
    gsap.to(heroCopy, { y: -24, ease: "none", scrollTrigger: heroOut });
    gsap.to(meshEl, { yPercent: 16, ease: "none", scrollTrigger: heroOut });

    // Section heads: rules draw, the label scrambles in, the heading rises line by line.
    gsap.utils.toArray(".sec-head").forEach((head) => {
      const label = head.querySelector(".label");
      const body = head.querySelector(":scope > div");
      const h2 = head.querySelector("h2");
      const split = hasSplit ? SplitText.create(h2, { type: "lines", mask: "lines" }) : null;
      gsap.timeline({
        defaults: { ease: "expo.out" },
        scrollTrigger: { trigger: head, start: "top 88%", once: true },
        onComplete: () => unsplit(split),
      })
        .fromTo([label, body], { "--draw": 0 }, { "--draw": 1, duration: 1.2, ease: "power3.inOut", stagger: 0.12 }, 0)
        .add(scramble(label, "upperCase", 0.9), 0.1)
        .from(split ? split.lines : h2, { yPercent: 105, autoAlpha: split ? 1 : 0, duration: 1.1, stagger: 0.08 }, 0.15)
        .from(body.querySelector("p"), { autoAlpha: 0, y: 18, duration: 1 }, 0.45);
    });

    // Stack-up: hatching fills in, the via drills down with the scroll, and the packet follows it.
    const bands = gsap.utils.toArray(".band", stack);
    bands.forEach((band) => {
      gsap.timeline({ scrollTrigger: { trigger: band, start: "top 94%", once: true } })
        .fromTo(band, { "--fill": 0 }, { "--fill": 1, duration: 1, ease: "power3.inOut" })
        .from(band.querySelectorAll(".lid, .band-body > *, .band-tag"), {
          autoAlpha: 0, x: 28, duration: 0.9, stagger: 0.06, ease: "expo.out",
        }, 0.1);
      ScrollTrigger.create({ trigger: band, start: "top center", end: "bottom center", toggleClass: { targets: band, className: "is-active" } });
    });
    gsap.from(".via-mesh", {
      scaleY: 0, ease: "none",
      scrollTrigger: { trigger: stack, start: "top 75%", end: "bottom 55%", scrub: 0.5 },
    });
    const lidCenter = (band) => {
      const lid = band.querySelector(".lid");
      return band.offsetTop + lid.offsetTop + lid.offsetHeight / 2;
    };
    gsap.fromTo(packet, { y: () => lidCenter(bands[0]) }, {
      y: () => lidCenter(bands[bands.length - 1]),
      ease: "none",
      scrollTrigger: {
        trigger: stack, start: "top center", end: "bottom center", scrub: 0.6, invalidateOnRefresh: true,
        onToggle: (self) => stack.classList.toggle("is-tracking", self.isActive),
      },
    });

    const stop = stack.querySelector(".stop");
    const blocked = document.createElement("span");
    blocked.className = "packet-public";
    blocked.setAttribute("aria-hidden", "true");
    stack.appendChild(blocked);
    gsap.timeline({ scrollTrigger: { trigger: stack, start: "top 75%", once: true } })
      .from(".via-public", { scaleY: 0, duration: 0.6, ease: "power2.in" })
      .from(stop, { scale: 2.6, rotation: -45, autoAlpha: 0, duration: 0.55, ease: "back.out(3)" });
    const stopY = () => stop.offsetTop;
    const attack = gsap.timeline({ repeat: -1, repeatDelay: 1.4, paused: true })
      .fromTo(blocked, { y: -8, autoAlpha: 0, scale: 1 }, { y: stopY, autoAlpha: 1, duration: 0.9, ease: "power1.in" })
      .to(blocked, { scale: 2.2, autoAlpha: 0, duration: 0.35, ease: "power2.out" })
      .fromTo(stop, { scale: 1 }, { scale: 1.35, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, "<");
    ScrollTrigger.create({
      trigger: stack, start: "top 80%", end: "bottom top",
      onToggle: (self) => (self.isActive ? attack.play() : attack.pause()),
    });

    // Monitoring: stages light up left to right, then signals flow and the phone pings.
    const stages = gsap.utils.toArray(".stage");
    const flow = gsap.timeline({ scrollTrigger: { trigger: ".flow", start: "top 85%", once: true } });
    stages.forEach((stage, i) => {
      const at = i * 0.45;
      const label = stage.querySelector(".stage-label");
      flow
        .fromTo(label, { "--draw": 0 }, { "--draw": 1, duration: 0.7, ease: "power2.out" }, at)
        .add(scramble(label, "upperCase", 0.7), at)
        .from(stage.querySelectorAll(".nodes li"), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.07, ease: "expo.out" }, at + 0.1)
        .fromTo(stage, { "--arrow": 0, "--arrow-head": 0 }, { "--arrow": 1, "--arrow-head": 1, duration: 0.45, ease: "power2.inOut" }, at + 0.35);
    });
    const phone = document.querySelector(".stage-end .nodes li");
    const copper = cssVar("--copper");
    flow.fromTo(phone, { boxShadow: `0 0 0 0 ${rgba(copper, 0.5)}` }, {
      boxShadow: `0 0 0 18px ${rgba(copper, 0)}`, duration: 1.1, repeat: 2, ease: "power2.out",
    });
    gsap.from(".notes > div", {
      autoAlpha: 0, y: 24, duration: 1, stagger: 0.12, ease: "expo.out",
      scrollTrigger: { trigger: ".notes", start: "top 85%", once: true },
    });
    mm.add("(min-width: 1081px)", () => {
      const signals = gsap.timeline({ repeat: -1, paused: true });
      stages.slice(0, -1).forEach((stage, i) => {
        const dot = document.createElement("span");
        dot.className = "signal";
        dot.setAttribute("aria-hidden", "true");
        stage.appendChild(dot);
        const travel = parseFloat(getComputedStyle(root).fontSize) * 1.45;
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

    // Hardening: the excerpt types in, and each annotation lights up its line of config.
    const code = document.querySelector(".code code");
    code.innerHTML = code.innerHTML.split("\n").map((line) => `<span class="ln">${line}</span>`).join("");
    const codeLines = gsap.utils.toArray(".code .ln");
    gsap.timeline({ scrollTrigger: { trigger: ".code-card", start: "top 78%", once: true } })
      .add(scramble(document.querySelector(".code-title span"), "lowerCase", 0.8), 0)
      .from(codeLines, { autoAlpha: 0, x: -14, duration: 0.5, stagger: 0.07, ease: "power2.out" }, 0.1)
      .from(".code .b", { scale: 0, duration: 0.45, stagger: 0.08, ease: "back.out(3)" }, 0.6);
    gsap.utils.toArray(".annotations li").forEach((li) => {
      const n = li.querySelector(".balloon").textContent.trim();
      const line = codeLines.find((l) => l.querySelector(".b")?.textContent.trim() === n);
      const set = (on) => { li.classList.toggle("is-active", on); line && line.classList.toggle("is-active", on); };
      gsap.from(li, { autoAlpha: 0, y: 24, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: li, start: "top 95%", once: true } });
      ScrollTrigger.create({ trigger: li, start: "top 58%", end: "bottom 58%", onToggle: (self) => set(self.isActive) });
      li.addEventListener("mouseenter", () => set(true));
      li.addEventListener("mouseleave", () => set(false));
    });
    gsap.from(".aside", {
      autoAlpha: 0, x: -20, duration: 1, ease: "expo.out",
      scrollTrigger: { trigger: ".aside", start: "top 88%", once: true },
    });

    // Parts list: rows arrive in batches and reference designators scramble in.
    const rows = gsap.utils.toArray(".bom tbody tr");
    gsap.set(rows, { autoAlpha: 0, y: 14 });
    ScrollTrigger.batch(rows, {
      start: "top 97%",
      once: true,
      onEnter: (batch) => {
        gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.05, ease: "expo.out" });
        batch.forEach((tr, i) => {
          const ref = tr.querySelector("td:first-child");
          if (ref) scramble(ref, "0123456789ABCDEF", 0.8).delay(0.1 + i * 0.05);
        });
      },
    });

    // Incident reports: the rule draws, the ID decodes, test results stamp in.
    gsap.utils.toArray(".report").forEach((report) => {
      const id = report.querySelector(".report-id");
      const tl = gsap.timeline({
        defaults: { ease: "expo.out" },
        scrollTrigger: { trigger: report, start: "top 88%", once: true },
      })
        .fromTo(report, { "--draw": 0 }, { "--draw": 1, duration: 1.1, ease: "power3.inOut" }, 0)
        .add(scramble(id, "0123456789", 1), 0.1)
        .from(report.querySelector(".report-cat"), { autoAlpha: 0, y: 10, duration: 0.7 }, 0.3)
        .from(report.querySelector(".status .pass"), { scale: 1.9, autoAlpha: 0, duration: 0.5, ease: "back.out(2.6)" }, 0.9)
        .from(report.querySelector("h3"), { autoAlpha: 0, y: 26, duration: 1 }, 0.2)
        .from(report.querySelectorAll(".fields > div"), { autoAlpha: 0, y: 22, duration: 0.9, stagger: 0.1 }, 0.35);

      const matrixRows = report.querySelectorAll(".matrix caption, .matrix thead tr, .matrix tbody tr");
      if (matrixRows.length) {
        tl.from(matrixRows, { autoAlpha: 0, duration: 0.5, stagger: 0.1 }, 0.7)
          .from(report.querySelectorAll(".matrix .pass"), { scale: 1.9, autoAlpha: 0, duration: 0.5, stagger: 0.2, ease: "back.out(2.6)" }, 1.1);
      }
      report.querySelectorAll(".fig-num").forEach((el, i) => {
        tl.from(el.parentElement, { autoAlpha: 0, y: 20, duration: 0.8 }, 0.6 + i * 0.1).add(countUp(el, 1.8), 0.6 + i * 0.1);
      });
      const pipeline = report.querySelector(".pipeline");
      if (pipeline) {
        const steps = pipeline.querySelectorAll("li");
        tl.from(steps, { autoAlpha: 0, y: 16, duration: 0.6, stagger: 0.25 }, 0.7)
          .call(() => pipeline.classList.add("is-done"), null, 0.7 + steps.length * 0.25 + 0.2)
          .from(report.querySelector(".pipeline-note"), { autoAlpha: 0, y: 12, duration: 0.8 }, ">");
      }
    });

    window.addEventListener("load", () => ScrollTrigger.refresh());
  }
})();

(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Legend hover highlights the matching part on the board drawing.
  const fig = document.getElementById("board-fig");
  if (fig) {
    for (const link of fig.querySelectorAll(".legend a[data-part]")) {
      const on = () => { fig.dataset.focus = link.dataset.part; };
      const off = () => { delete fig.dataset.focus; };
      link.addEventListener("mouseenter", on);
      link.addEventListener("focus", on);
      link.addEventListener("mouseleave", off);
      link.addEventListener("blur", off);
    }
  }

  // Packets travel along the Ethernet → RP1 → SoC trace.
  const route = document.getElementById("route");
  const layer = document.getElementById("packets");
  if (route && layer && !reduceMotion.matches) {
    const length = route.getTotalLength();
    const start = route.getPointAtLength(0);
    const count = 3;
    const period = 3200;
    const dots = Array.from({ length: count }, () => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("r", "5");
      c.setAttribute("cx", start.x);
      c.setAttribute("cy", start.y);
      c.setAttribute("opacity", "0");
      layer.appendChild(c);
      return c;
    });
    let visible = true;
    let raf = 0;
    const frame = (t) => {
      dots.forEach((dot, i) => {
        const p = ((t / period) + i / count) % 1;
        const pt = route.getPointAtLength(p * length);
        dot.setAttribute("cx", pt.x.toFixed(1));
        dot.setAttribute("cy", pt.y.toFixed(1));
        dot.setAttribute("opacity", Math.min(1, p * 8, (1 - p) * 8).toFixed(2));
      });
      raf = visible ? requestAnimationFrame(frame) : 0;
    };
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }).observe(fig);
  }

  // Mark the masthead link for the section in view.
  const navLinks = new Map(
    Array.from(document.querySelectorAll(".masthead-nav a")).map((a) => [a.getAttribute("href").slice(1), a])
  );
  if (navLinks.size && "IntersectionObserver" in window) {
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
  }

  // Stack-up: highlight the layer at the middle of the viewport and move the packet down the via.
  const stack = document.getElementById("stack");
  const packet = document.getElementById("packet");
  if (stack && packet && "IntersectionObserver" in window) {
    const bands = Array.from(stack.querySelectorAll(".band"));
    const place = (band) => {
      bands.forEach((b) => b.classList.toggle("is-active", b === band));
      const lid = band.querySelector(".lid");
      packet.style.setProperty("--packet-y", `${band.offsetTop + lid.offsetTop + lid.offsetHeight / 2}px`);
      stack.classList.add("is-tracking");
    };
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).pop();
      if (hit) place(hit.target);
    }, { rootMargin: "-45% 0px -50% 0px" });
    bands.forEach((b) => io.observe(b));
  }
})();

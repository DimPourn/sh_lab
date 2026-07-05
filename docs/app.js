/* ============================================================================
   Pi 5 Homelab — bento control-room
   Three.js WebGL rendered INSIDE bento tiles (network mesh + exploded
   defense-in-depth) + GSAP ScrollTrigger for tile choreography.
   Self-contained (libraries vendored under ./vendor/). Degrades gracefully.
   ========================================================================== */
import * as THREE from 'three';

const doc = document;
const root = doc.documentElement;
const body = doc.body;
root.classList.add('js');

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const hasGsap = !!(gsap && ScrollTrigger);
if (hasGsap) gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer:fine)').matches;
const isMobile = window.matchMedia('(max-width: 720px)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2);
let animate = !reduced;
if (reduced) body.classList.add('no-anim');

function webglOK() {
  try {
    const c = doc.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}
const WEBGL = webglOK();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* palette — security blue + protected green */
const COL = {
  green:  new THREE.Color('#34d399'),
  blue:   new THREE.Color('#38b7f8'),
  amber:  new THREE.Color('#fbbf24'),
  purple: new THREE.Color('#a78bfa'),
  teal:   new THREE.Color('#22d3ee'),
};
const LAYER_COLORS = [COL.green, COL.blue, COL.amber, COL.purple, COL.teal];

function glowTexture() {
  const s = 128, c = doc.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = WEBGL ? glowTexture() : null;

/* shared pointer (normalised -1..1) */
const ptr = { x: 0, y: 0 };
if (finePointer) {
  window.addEventListener('pointermove', (e) => {
    ptr.x = (e.clientX / window.innerWidth - 0.5) * 2;
    ptr.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
}

/* ════════════════════════════════════════════════════════════════════════
   NETWORK MESH — rendered inside the hero tile
   ══════════════════════════════════════════════════════════════════════ */
const MeshScene = (() => {
  const canvas = doc.getElementById('mesh-canvas');
  if (!canvas || !WEBGL) return null;

  let renderer, scene, camera, globe, points, lines, pulseGeo;
  let W = 0, H = 0, visible = true, intro = 0;
  const pulses = [];
  const R = 10;
  const N = isMobile ? 220 : 460;
  const cur = { x: 0, y: 0 };

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070d17, 0.03);
    camera = new THREE.PerspectiveCamera(44, 1, 0.1, 200);
    camera.position.set(0, 0, 30);

    globe = new THREE.Group();
    scene.add(globe);

    const pos = [], col = [], nodes = [];
    const inc = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * inc;
      const v = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).multiplyScalar(R);
      nodes.push(v); pos.push(v.x, v.y, v.z);
      const c = COL.green.clone().lerp(COL.blue, (y + 1) / 2);
      col.push(c.r, c.g, c.b);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: isMobile ? 0.72 : 0.6, map: GLOW, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.95,
    }));
    globe.add(points);

    const lpos = [], lcol = [], edges = [], K = 3;
    for (let i = 0; i < N; i++) {
      const d = [];
      for (let j = 0; j < N; j++) if (j !== i) d.push([nodes[i].distanceToSquared(nodes[j]), j]);
      d.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < K; k++) {
        const j = d[k][1];
        if (i < j) {
          edges.push([i, j]);
          const a = nodes[i], b = nodes[j];
          lpos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          const ca = COL.blue.clone().multiplyScalar(0.55);
          lcol.push(ca.r, ca.g, ca.b, ca.r, ca.g, ca.b);
        }
      }
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lGeo.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    lines = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    globe.add(lines);

    const M = isMobile ? 9 : 16;
    pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    for (let i = 0; i < M; i++) pulses.push({ e: (Math.random() * edges.length) | 0, t: Math.random(), sp: 0.004 + Math.random() * 0.006 });
    globe.add(new THREE.Points(pulseGeo, new THREE.PointsMaterial({
      size: isMobile ? 1.3 : 1.0, map: GLOW, color: COL.green, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })));
    pulses.nodes = nodes; pulses.edges = edges;

    resize();
    if (animate && hasGsap) gsap.to({ v: 0 }, { v: 1, duration: 1.8, ease: 'expo.out', delay: 0.2, onUpdate: function () { intro = this.targets()[0].v; } });
    else intro = 1;
  }

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (W < 2 || H < 2) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    // pull camera back a touch on portrait tiles so the globe always fits
    camera.position.z = 30 * clamp(1.15 - (W / H) * 0.12, 0.85, 1.25);
  }

  function frame(time) {
    if (!visible || W < 2) return;
    const e = easeInOut(clamp(intro, 0, 1));
    cur.x = lerp(cur.x, ptr.y * 0.28, 0.05);
    cur.y = lerp(cur.y, ptr.x * 0.42, 0.05);
    globe.rotation.y = (animate ? time * 0.00009 : 0) + cur.y - 0.2;
    globe.rotation.x = -0.18 + cur.x;
    globe.scale.setScalar(lerp(0.55, 1, e));
    points.material.opacity = 0.95 * e;
    lines.material.opacity = 0.32 * e;

    if (animate) {
      const arr = pulseGeo.attributes.position.array, nd = pulses.nodes, el = pulses.edges;
      for (let i = 0; i < pulses.length; i++) {
        const pu = pulses[i]; pu.t += pu.sp;
        if (pu.t > 1) { pu.t = 0; pu.e = (Math.random() * el.length) | 0; }
        const a = nd[el[pu.e][0]], b = nd[el[pu.e][1]];
        arr[i * 3] = lerp(a.x, b.x, pu.t); arr[i * 3 + 1] = lerp(a.y, b.y, pu.t); arr[i * 3 + 2] = lerp(a.z, b.z, pu.t);
      }
      pulseGeo.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function setVisible(v) { visible = v; }
  init();

  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
  if (window.IntersectionObserver) new IntersectionObserver((es) => es.forEach((x) => setVisible(x.isIntersecting)), { threshold: 0.01 }).observe(canvas);

  return { frame, resize, setVisible };
})();

/* ════════════════════════════════════════════════════════════════════════
   DEFENSE IN DEPTH — exploded 5-layer stack inside its tile
   ══════════════════════════════════════════════════════════════════════ */
const StackScene = (() => {
  const canvas = doc.getElementById('stack-canvas');
  if (!canvas || !WEBGL) return null;

  let renderer, scene, camera, group, W = 0, H = 0, visible = true;
  const planes = [], connectors = [];
  let progress = 0, activeIdx = 0;
  const SEP_MIN = 0.9, SEP_MAX = 6.6, PW = 9, PD = 6;
  const layerEls = Array.prototype.slice.call(doc.querySelectorAll('.layers li'));
  const cornerLocal = [[-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]];

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070d17, 0.022);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    group = new THREE.Group();
    scene.add(group);

    const planeGeo = new THREE.PlaneGeometry(PW, PD).rotateX(-Math.PI / 2);
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(PW, 0.001, PD));

    for (let L = 0; L < 5; L++) {
      const grp = new THREE.Group();
      const color = LAYER_COLORS[L];
      const fill = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      grp.add(fill);
      const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      grp.add(edge);
      const grid = new THREE.GridHelper(PW, 9, color, color);
      grid.scale.z = PD / PW;
      grid.material.transparent = true; grid.material.opacity = 0.12; grid.material.blending = THREE.AdditiveBlending; grid.material.depthWrite = false;
      grp.add(grid);
      const cGeo = new THREE.BufferGeometry();
      cGeo.setAttribute('position', new THREE.Float32BufferAttribute([-PW / 2, 0, -PD / 2, PW / 2, 0, -PD / 2, PW / 2, 0, PD / 2, -PW / 2, 0, PD / 2], 3));
      const dots = new THREE.Points(cGeo, new THREE.PointsMaterial({
        size: 0.8, map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9,
      }));
      grp.add(dots);
      group.add(grp);
      planes.push({ grp, fill, edge, grid, dots, baseY: (L - 2) });
    }
    for (let c = 0; c < 4; c++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x4a6f96, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(line); connectors.push(line);
    }
    resize(); setProgress(0);
  }

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (W < 2 || H < 2) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  function setProgress(p) {
    progress = clamp(p, 0, 1);
    const e = easeInOut(progress);
    const sep = lerp(SEP_MIN, SEP_MAX, e);
    activeIdx = clamp(Math.floor(progress * 4.999), 0, 4);
    for (let L = 0; L < 5; L++) {
      const pl = planes[L], isA = L === activeIdx;
      pl.grp.position.y = pl.baseY * sep;
      pl.fill.material.opacity = isA ? 0.26 : 0.09;
      pl.edge.material.opacity = isA ? 1.0 : 0.5;
      pl.grid.material.opacity = isA ? 0.22 : 0.1;
      pl.dots.material.opacity = isA ? 1.0 : 0.6;
      const s = isA ? 1.035 : 1.0; pl.grp.scale.set(s, 1, s);
    }
    for (let c = 0; c < 4; c++) {
      const arr = connectors[c].geometry.attributes.position.array;
      for (let L = 0; L < 5; L++) { arr[L * 3] = cornerLocal[c][0]; arr[L * 3 + 1] = planes[L].baseY * sep; arr[L * 3 + 2] = cornerLocal[c][1]; }
      connectors[c].geometry.attributes.position.needsUpdate = true;
      connectors[c].material.opacity = lerp(0.28, 0.14, e);
    }
    const ang = lerp(-0.35, 0.72, e), dist = lerp(18, 25, e), camY = lerp(3.2, 9, e);
    camera.position.set(Math.sin(ang) * dist, camY, Math.cos(ang) * dist);
    camera.lookAt(0, 0, 0);
    group.rotation.y = lerp(0, 0.1, e);
    if (layerEls.length) layerEls.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  }

  function frame() {
    if (!visible || W < 2) return;
    if (animate) group.rotation.x = lerp(group.rotation.x || 0, ptr.x * 0.08, 0.05);
    renderer.render(scene, camera);
  }
  function setVisible(v) { visible = v; }

  init();
  if (window.ResizeObserver) new ResizeObserver(() => { resize(); if (paused) renderOnce(); }).observe(canvas);
  return { frame, resize, setProgress, setVisible };
})();

/* ════════════════════════════════════════════════════════════════════════
   RENDER LOOP
   ══════════════════════════════════════════════════════════════════════ */
let paused = reduced;
function renderOnce(t) {
  if (MeshScene) MeshScene.frame(t || performance.now());
  if (StackScene) StackScene.frame();
}
function loop(t) { renderOnce(t); if (!paused && animate) requestAnimationFrame(loop); }
if (animate) requestAnimationFrame(loop); else renderOnce(0);
function nudge() { if (paused || !animate) renderOnce(performance.now()); }

/* resize */
let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    if (MeshScene) MeshScene.resize();
    if (StackScene) StackScene.resize();
    if (hasGsap) ScrollTrigger.refresh();
    nudge();
  }, 150);
}, { passive: true });

/* ════════════════════════════════════════════════════════════════════════
   GSAP CHOREOGRAPHY
   ══════════════════════════════════════════════════════════════════════ */
if (hasGsap) {
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => root.style.setProperty('--sc', self.progress.toFixed(4)) });

  /* hero tiles: staggered entrance on load */
  const heroReveals = gsap.utils.toArray('.hero .reveal');
  if (!reduced) {
    gsap.set(heroReveals, { opacity: 0, y: 22 });
    gsap.to(heroReveals, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07, delay: 0.15 });
  } else { gsap.set(heroReveals, { opacity: 1, y: 0 }); }

  /* section reveals — stagger tiles within each bento */
  gsap.utils.toArray('.reveal').forEach((el) => {
    if (el.closest('.hero')) return;
    if (el.classList.contains('bento')) {
      gsap.set(el, { opacity: 1 });
      const tiles = el.querySelectorAll('.tile');
      gsap.set(tiles, { opacity: 0, y: 22 });
      gsap.to(tiles, {
        opacity: 1, y: 0, duration: 0.65, ease: 'power3.out', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 86%', toggleActions: 'play none none reverse' },
      });
    } else {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.75, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' },
      });
    }
  });

  /* flagship: pin the defense feature + scrub the explode */
  if (StackScene && !isMobile) {
    ScrollTrigger.create({
      trigger: '.defense', start: 'top top', end: 'bottom bottom',
      pin: '.defense .pin', pinSpacing: true, scrub: reduced ? true : 0.6,
      onUpdate: (self) => { StackScene.setProgress(self.progress); nudge(); },
      onToggle: (self) => StackScene.setVisible(self.isActive),
    });
    StackScene.setVisible(true);
  } else if (StackScene) {
    StackScene.setProgress(0.6); StackScene.setVisible(true);
  }

  /* scrollspy → nav active state */
  const navLinks = Array.prototype.slice.call(doc.querySelectorAll('.nav-links a'));
  doc.querySelectorAll('section[id], header[id]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 50%', end: 'bottom 50%',
      onToggle: (self) => { if (self.isActive) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + sec.id)); },
    });
  });
} else {
  root.classList.remove('js');
}

/* ════════════════════════════════════════════════════════════════════════
   VANILLA UI
   ══════════════════════════════════════════════════════════════════════ */
const glow = doc.querySelector('.cursor-glow');
if (glow && finePointer) {
  window.addEventListener('pointermove', (e) => {
    glow.style.opacity = '1';
    glow.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0) translate(-50%,-50%)';
  }, { passive: true });
  doc.querySelectorAll('.tile').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
}

const motionBtn = doc.getElementById('motion');
function applyPaused() {
  body.classList.toggle('paused', paused);
  if (motionBtn) { motionBtn.setAttribute('aria-pressed', String(paused)); motionBtn.lastChild.textContent = paused ? ' Motion off' : ' Motion'; }
}
if (motionBtn) motionBtn.addEventListener('click', () => {
  paused = !paused; applyPaused();
  if (!paused) { animate = true; requestAnimationFrame(loop); } else renderOnce(performance.now());
});
applyPaused();

window.addEventListener('load', () => { if (hasGsap) ScrollTrigger.refresh(); if (MeshScene) MeshScene.resize(); if (StackScene) StackScene.resize(); renderOnce(performance.now()); });

/* ============================================================================
   Descent — cinematic scroll-driven flythrough through the defense layers.
   Fixed full-viewport Three.js scene; scroll flies the camera through six
   glowing gates toward the hardened core. Self-contained (./vendor/).
   Degrades to a stacked layer list on mobile / reduced-motion / no-WebGL.
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
const isMobile = window.matchMedia('(max-width: 820px)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function webglOK() {
  try { const c = doc.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
  catch (e) { return false; }
}
const WEBGL = webglOK();

/* fly mode = full pinned flythrough; otherwise flat stacked layers */
const flyMode = hasGsap && WEBGL && !reduced && !isMobile;
const descentEl = doc.getElementById('descent');
if (!flyMode && descentEl) descentEl.classList.add('flat');
if (reduced) body.classList.add('no-anim');

/* layer accent colors (match --accent in HTML) */
const LAYER_COL = ['#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#fcd34d'];
const N = 6, SPACING = 20;
const GATE_Z = i => -i * SPACING;
const CORE_Z = GATE_Z(N - 1) - 30; // -130
const CAM_START = 16, CAM_END = GATE_Z(N - 1) - 8;       // +16 → -108

/* shared pointer parallax */
const ptr = { x: 0, y: 0 };
if (finePointer) window.addEventListener('pointermove', (e) => {
  ptr.x = (e.clientX / window.innerWidth - 0.5) * 2;
  ptr.y = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

function glowTexture(inner) {
  const s = 128, c = doc.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(inner || 0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.2)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ════════════════════════════════════════════════════════════════════════
   SCENE
   ══════════════════════════════════════════════════════════════════════ */
const Scene = (() => {
  const canvas = doc.getElementById('scene');
  if (!canvas || !WEBGL) { if (canvas) canvas.style.display = 'none'; return null; }

  let renderer, scene, camera, W = 0, H = 0, visible = true;
  const GLOW = glowTexture(0.28), GLOWS = glowTexture(0.5);
  const gates = [], nebulae = [];
  let stars, core, coreHalo;
  let flight = 0, targetFlight = 0;
  const camPos = new THREE.Vector3(0, 0, CAM_START);

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b16, 0.012);
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

    // starfield / dust
    const SN = isMobile ? 900 : 1800, sp = [], scl = [];
    const cA = new THREE.Color('#818cf8'), cB = new THREE.Color('#22d3ee'), tmp = new THREE.Color();
    for (let i = 0; i < SN; i++) {
      sp.push((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 60, 20 - Math.random() * 160);
      tmp.copy(cA).lerp(cB, Math.random());
      scl.push(tmp.r, tmp.g, tmp.b);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(scl, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.5, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9 }));
    scene.add(stars);

    // nebula clouds
    const nebColors = ['#6366f1', '#38bdf8', '#2dd4bf', '#818cf8'];
    for (let i = 0; i < (isMobile ? 4 : 7); i++) {
      const m = new THREE.SpriteMaterial({ map: GLOWS, color: new THREE.Color(nebColors[i % nebColors.length]), transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m);
      s.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 36, 10 - Math.random() * 130);
      const sc = 26 + Math.random() * 30; s.scale.setScalar(sc);
      scene.add(s); nebulae.push({ s, base: sc, ph: Math.random() * 6.28 });
    }

    // gates
    const ringGeo = new THREE.TorusGeometry(6.4, 0.14, 12, 90);
    const ring2Geo = new THREE.TorusGeometry(7.4, 0.05, 8, 90);
    for (let i = 0; i < N; i++) {
      const col = new THREE.Color(LAYER_COL[i]);
      const grp = new THREE.Group(); grp.position.z = GATE_Z(i);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      grp.add(ring);
      const ring2 = new THREE.Mesh(ring2Geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      grp.add(ring2);
      // particle ring
      const PN = isMobile ? 60 : 120, pp = [];
      for (let k = 0; k < PN; k++) { const a = (k / PN) * Math.PI * 2, r = 6.4 + (Math.random() - 0.5) * 1.4; pp.push(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 1.2); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.5, map: GLOW, color: col, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      grp.add(pts);
      // faint disc
      const disc = new THREE.Mesh(new THREE.CircleGeometry(6.2, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      grp.add(disc);
      scene.add(grp);
      gates.push({ grp, ring, ring2, pts, disc, col, z: GATE_Z(i), rot: Math.random() * 6.28 });
    }

    // core
    core = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWS, color: new THREE.Color('#fff3d6'), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.position.set(0, 0, CORE_Z); core.scale.setScalar(7); scene.add(core);
    coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWS, color: new THREE.Color('#fcd34d'), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    coreHalo.position.set(0, 0, CORE_Z); coreHalo.scale.setScalar(18); scene.add(coreHalo);

    resize();
    setFlight(0, true);
  }

  function resize() {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  const layerEls = Array.prototype.slice.call(doc.querySelectorAll('.descent .layer'));
  const numEl = doc.getElementById('layer-num');
  let activeShown = -1;

  function updateCards(p) {
    const ai = clamp(Math.floor(p * N - 0.0001), 0, N - 1);
    if (ai !== activeShown) {
      activeShown = ai;
      layerEls.forEach((el, i) => el.classList.toggle('active', i === ai));
      if (numEl) numEl.textContent = String(ai + 1).padStart(2, '0');
    }
  }

  function setFlight(p, immediate) {
    targetFlight = clamp(p, 0, 1);
    if (immediate) flight = targetFlight;
    if (flyMode) updateCards(targetFlight);
  }

  function render(time) {
    if (!visible || W < 2) return;
    flight = lerp(flight, targetFlight, 0.1);
    const e = smooth(flight);
    const camZ = lerp(CAM_START, CAM_END, e);
    camPos.z = camZ;
    camera.position.set(camPos.x + ptr.x * 1.6, camPos.y - ptr.y * 1.1, camZ);
    camera.lookAt(ptr.x * 1.2, -ptr.y * 0.8, camZ - 20);
    camera.rotation.z = Math.sin(time * 0.0002) * 0.02 + ptr.x * 0.02;

    // gates
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i], a = camZ - g.z;      // >0 ahead, ~0 at gate, <0 passed
      let op;
      if (a < 0) op = clamp(1 + a / 7, 0, 1);
      else op = clamp(1 - (a - 7) / 46, 0.12, 1);
      const near = clamp(1 - Math.abs(a) / 13, 0, 1);
      g.rot += 0.0016 + near * 0.004;
      g.grp.rotation.z = g.rot;
      g.ring.material.opacity = 0.9 * op;
      g.ring2.material.opacity = (0.28 + near * 0.5) * op;
      g.pts.material.opacity = 0.8 * op;
      g.disc.material.opacity = (0.04 + near * 0.14) * op;
      const sc = 1 + near * 0.22;
      g.grp.scale.set(sc, sc, 1);
    }

    // core pulse + approach glow
    const coreNear = clamp(1 - Math.abs(camZ - CORE_Z) / 64, 0, 1);
    const pulse = 1 + Math.sin(time * 0.0016) * 0.06;
    core.scale.setScalar((5 + coreNear * 4.5) * pulse);
    core.material.opacity = 0.45 + coreNear * 0.28;
    coreHalo.scale.setScalar((15 + coreNear * 15) * pulse);
    coreHalo.material.opacity = 0.2 + coreNear * 0.28;

    // nebula drift
    for (const n of nebulae) { n.s.scale.setScalar(n.base * (1 + Math.sin(time * 0.0004 + n.ph) * 0.08)); }
    // star parallax
    stars.rotation.z = time * 0.000015;

    renderer.render(scene, camera);
  }

  function setVisible(v) { visible = v; }
  init();
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
  doc.addEventListener('visibilitychange', () => setVisible(!doc.hidden));
  return { render, resize, setFlight, setVisible, get flight() { return targetFlight; } };
})();

/* ════════════════════════════════════════════════════════════════════════
   RENDER LOOP
   ══════════════════════════════════════════════════════════════════════ */
let paused = reduced;
let ambientT = 0;
function tick(t) {
  if (Scene) {
    // in flat/ambient mode (not fly, not reduced), gently auto-descend & loop
    if (!flyMode && !reduced) { ambientT += 0.0009; Scene.setFlight(0.28 + Math.sin(ambientT) * 0.22); }
    Scene.render(t);
  }
  if (!paused) requestAnimationFrame(tick);
}
if (!reduced) requestAnimationFrame(tick);
else if (Scene) Scene.render(0);

let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Scene) Scene.resize(); if (hasGsap) ScrollTrigger.refresh(); if (paused) Scene && Scene.render(performance.now()); }, 150); }, { passive: true });

/* ════════════════════════════════════════════════════════════════════════
   SCROLL CHOREOGRAPHY
   ══════════════════════════════════════════════════════════════════════ */
if (hasGsap) {
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => root.style.setProperty('--sc', self.progress.toFixed(4)) });

  // hero intro
  const heroEls = gsap.utils.toArray('[data-hero]');
  if (!reduced) {
    gsap.set(heroEls, { opacity: 0, y: 26 });
    gsap.to(heroEls, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.13, delay: 0.15 });
  } else gsap.set(heroEls, { opacity: 1, y: 0 });

  // the flythrough — CSS `position: sticky` handles pinning; we only read progress
  if (flyMode && Scene) {
    ScrollTrigger.create({
      trigger: '#descent', start: 'top top', end: 'bottom bottom',
      onUpdate: (self) => Scene.setFlight(self.progress),
    });
  }

  // section + layer reveals (reduced-motion: show everything immediately)
  if (reduced) {
    gsap.set('.reveal', { opacity: 1, y: 0 });
    gsap.set('.reveal .card', { opacity: 1, y: 0 });
    gsap.set('.descent.flat .layer', { opacity: 1, y: 0 });
  } else {
    gsap.utils.toArray('.reveal').forEach((el) => {
      if (el.classList.contains('grid')) {
        gsap.set(el, { opacity: 1 });
        const items = el.querySelectorAll('.card');
        gsap.set(items, { opacity: 0, y: 24 });
        gsap.to(items, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.06,
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' } });
      } else {
        gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
      }
    });
    if (!flyMode) {
      gsap.utils.toArray('.descent.flat .layer').forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
      });
    }
  }

  // scrollspy
  const navLinks = Array.prototype.slice.call(doc.querySelectorAll('.nav-links a'));
  doc.querySelectorAll('section[id], header[id]').forEach((sec) => {
    ScrollTrigger.create({ trigger: sec, start: 'top 52%', end: 'bottom 52%',
      onToggle: (self) => { if (self.isActive) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + sec.id)); } });
  });
} else {
  root.classList.remove('js');
}

/* ════════════════════════════════════════════════════════════════════════
   VANILLA UI
   ══════════════════════════════════════════════════════════════════════ */
if (finePointer) {
  doc.querySelectorAll('.card').forEach((c) => {
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
  if (!paused) requestAnimationFrame(tick); else if (Scene) Scene.render(performance.now());
});
applyPaused();

window.addEventListener('load', () => { if (hasGsap) ScrollTrigger.refresh(); if (Scene) { Scene.resize(); Scene.render(performance.now()); } });

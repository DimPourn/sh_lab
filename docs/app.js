/* ============================================================================
   Pi 5 Homelab — cinematic WebGL scroll experience
   Three.js (network-mesh hero + exploded defense-in-depth) + GSAP ScrollTrigger.
   Self-contained: libraries are vendored under ./vendor/.
   Degrades gracefully: no-WebGL / reduced-motion / mobile all handled.
   ========================================================================== */
import * as THREE from 'three';

const doc = document;
const root = doc.documentElement;
const body = doc.body;

/* mark JS active so the pre-hidden reveal states apply (and content is never
   left invisible if this module fails to load). */
root.classList.add('js');

/* ── environment ─────────────────────────────────────────────────────────── */
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const hasGsap = !!(gsap && ScrollTrigger);
if (hasGsap) gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer:fine)').matches;
const isMobile = window.matchMedia('(max-width: 860px)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2);

/* animate = run continuous RAF loops. When false we still render a single
   static frame so the 3D is present, just not moving. */
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

/* palette (matches the CSS custom properties) */
const COL = {
  green: new THREE.Color('#00ff9c'),
  cyan:  new THREE.Color('#38bdf8'),
  amber: new THREE.Color('#f0b429'),
  purple:new THREE.Color('#a78bfa'),
  pink:  new THREE.Color('#ff5470'),
};
const LAYER_COLORS = [COL.green, COL.cyan, COL.amber, COL.purple, COL.pink];

/* shared soft radial sprite for glowing points */
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

/* ════════════════════════════════════════════════════════════════════════
   HERO — network mesh globe
   ══════════════════════════════════════════════════════════════════════ */
const HeroScene = (() => {
  const canvas = doc.getElementById('hero-canvas');
  if (!canvas || !WEBGL) return null;

  let renderer, scene, camera, world, points, lines, pulseGeo, pulses = [];
  let W = 0, H = 0, visible = true, introDone = false;
  const R = 10;                       // globe radius
  const N = isMobile ? 260 : 560;     // node budget (segment/point budget tier)
  const targetRot = { x: 0, y: 0 };   // pointer parallax target
  const curRot = { x: 0, y: 0 };
  let heroGroupIntro = 0;             // 0..1 entrance progress
  let fade = 1;                       // scroll fade-out

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050a, 0.028);

    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    camera.position.set(0, 0, 30);

    world = new THREE.Group();
    scene.add(world);

    const globe = new THREE.Group();
    world.add(globe);

    // Fibonacci-sphere nodes
    const pos = [], col = [];
    const nodes = [];
    const inc = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * inc;
      const v = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).multiplyScalar(R);
      nodes.push(v);
      pos.push(v.x, v.y, v.z);
      const c = COL.green.clone().lerp(COL.cyan, (y + 1) / 2 * 0.9);
      col.push(c.r, c.g, c.b);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: isMobile ? 0.78 : 0.62, map: glowTexture(), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true, opacity: 0.95,
    }));
    globe.add(points);

    // mesh: connect each node to its nearest neighbours (tiered, additive)
    const lpos = [], lcol = [], edges = [];
    const K = 3;
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
          const ca = COL.green.clone().multiplyScalar(0.5);
          lcol.push(ca.r, ca.g, ca.b, ca.r, ca.g, ca.b);
        }
      }
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lGeo.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    lines = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    globe.add(lines);

    // travelling data pulses along random edges
    const M = isMobile ? 10 : 20;
    const ppos = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      pulses.push({ e: (Math.random() * edges.length) | 0, t: Math.random(), sp: 0.003 + Math.random() * 0.006, edges });
    }
    pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const pulseObj = new THREE.Points(pulseGeo, new THREE.PointsMaterial({
      size: isMobile ? 1.4 : 1.1, map: glowTexture(), color: COL.cyan,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    globe.add(pulseObj);
    pulses.nodes = nodes; pulses.geo = pulseGeo; pulses.edgeList = edges;

    // faint orbital ring of particles for depth / flair
    const ringN = isMobile ? 120 : 240, rpos = [];
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2, rr = R * (1.55 + Math.random() * 0.5);
      const yj = (Math.random() - 0.5) * 1.4;
      rpos.push(Math.cos(a) * rr, yj, Math.sin(a) * rr);
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
    const ring = new THREE.Points(rGeo, new THREE.PointsMaterial({
      size: 0.34, map: glowTexture(), color: COL.green, transparent: true,
      opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    ring.rotation.x = 0.62;
    globe.add(ring);
    world.userData.ring = ring;

    // distant starfield (own group, unaffected by globe rotation)
    const sN = isMobile ? 350 : 700, spos = [];
    for (let i = 0; i < sN; i++) {
      const rr = 60 + Math.random() * 70;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      spos.push(rr * Math.sin(ph) * Math.cos(th), rr * Math.sin(ph) * Math.sin(th), rr * Math.cos(ph));
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
    const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 0.4, color: 0x9fb7cc, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(stars);
    scene.userData.stars = stars;

    world.userData.globe = globe;
    resize();

    // entrance
    if (animate && hasGsap) {
      gsap.to({ v: 0 }, {
        v: 1, duration: 2.2, ease: 'expo.out', delay: 0.15,
        onUpdate: function () { heroGroupIntro = this.targets()[0].v; },
        onComplete: () => { introDone = true; },
      });
    } else { heroGroupIntro = 1; introDone = true; }

    requestAnimationFrame(() => canvas.classList.add('ready'));
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  function setPointer(nx, ny) { targetRot.y = nx * 0.5; targetRot.x = ny * 0.35; }
  function setVisible(v) { visible = v; }
  function setFade(f) {
    fade = clamp(f, 0, 1);
    // drive the canvas element opacity directly so no stale frame lingers
    canvas.style.transition = 'none';
    canvas.style.opacity = String(isMobile ? fade * 0.6 : fade);
  }

  function frame(time) {
    if (!visible || fade <= 0.001) return;
    const globe = world.userData.globe;
    const intro = easeInOut(heroGroupIntro);

    curRot.x = lerp(curRot.x, targetRot.x, 0.05);
    curRot.y = lerp(curRot.y, targetRot.y, 0.05);

    if (animate) globe.rotation.y = time * 0.00007 + curRot.y;
    else globe.rotation.y = curRot.y - 0.3;
    globe.rotation.x = -0.28 + curRot.x;

    // globe drifts in on entry, and off to the right on wide screens
    const targetX = W > 900 ? R * 0.9 : 0;
    globe.position.x = lerp(0, targetX, intro);
    globe.scale.setScalar(lerp(0.35, 1, intro));

    const ring = world.userData.ring;
    if (ring && animate) ring.rotation.y = -time * 0.00012;

    // pulses
    if (animate && pulses.geo) {
      const arr = pulses.geo.attributes.position.array;
      const nodes = pulses.nodes, el = pulses.edgeList;
      for (let i = 0; i < pulses.length; i++) {
        const pu = pulses[i];
        pu.t += pu.sp;
        if (pu.t > 1) { pu.t = 0; pu.e = (Math.random() * el.length) | 0; }
        const a = nodes[el[pu.e][0]], b = nodes[el[pu.e][1]];
        arr[i * 3] = lerp(a.x, b.x, pu.t);
        arr[i * 3 + 1] = lerp(a.y, b.y, pu.t);
        arr[i * 3 + 2] = lerp(a.z, b.z, pu.t);
      }
      pulses.geo.attributes.position.needsUpdate = true;
    }

    // apply scroll fade via opacity
    points.material.opacity = 0.95 * fade;
    lines.material.opacity = 0.34 * fade;
    world.userData.ring.material.opacity = 0.5 * fade;

    renderer.render(scene, camera);
  }

  init();
  return { frame, resize, setPointer, setVisible, setFade, get intro() { return introDone; } };
})();

/* ════════════════════════════════════════════════════════════════════════
   DEFENSE IN DEPTH — exploded 5-layer WebGL stack (scroll-scrubbed)
   ══════════════════════════════════════════════════════════════════════ */
const StackScene = (() => {
  const canvas = doc.getElementById('stack-canvas');
  if (!canvas || !WEBGL) return null;

  let renderer, scene, camera, group, W = 0, H = 0, visible = true;
  const planes = [];   // { grp, fill, edge, dots, label, color, baseY }
  const connectors = [];
  let progress = 0, activeIdx = 0;
  const SEP_MIN = 0.9, SEP_MAX = 7.2;
  const PW = 9, PD = 6;   // plane half-not; full width/depth

  function roundedPlaneEdges() {
    const g = new THREE.PlaneGeometry(PW, PD);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050a, 0.02);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    group = new THREE.Group();
    scene.add(group);

    const planeGeo = roundedPlaneEdges();
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(PW, 0.001, PD));

    for (let L = 0; L < 5; L++) {
      const grp = new THREE.Group();
      const color = LAYER_COLORS[L];

      const fill = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      grp.add(fill);

      const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      grp.add(edge);

      // inner grid for the cyber look
      const grid = new THREE.GridHelper(PW, 9, color, color);
      grid.scale.z = PD / PW;
      grid.material.transparent = true; grid.material.opacity = 0.13;
      grid.material.blending = THREE.AdditiveBlending; grid.material.depthWrite = false;
      grp.add(grid);

      // corner glow dots
      const cpos = [
        -PW / 2, 0, -PD / 2, PW / 2, 0, -PD / 2,
         PW / 2, 0,  PD / 2, -PW / 2, 0,  PD / 2,
      ];
      const cGeo = new THREE.BufferGeometry();
      cGeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
      const dots = new THREE.Points(cGeo, new THREE.PointsMaterial({
        size: 0.85, map: glowTexture(), color, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9,
      }));
      grp.add(dots);

      group.add(grp);
      planes.push({ grp, fill, edge, grid, dots, color, baseY: (L - 2) });
    }

    // vertical connectors between adjacent layer corners
    for (let c = 0; c < 4; c++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0x7896b4, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      group.add(line);
      connectors.push(line);
    }

    resize();
    setProgress(0);
  }

  function resize() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    if (W < 2 || H < 2) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  const cornerLocal = [
    [-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2],
  ];

  function setProgress(p) {
    progress = clamp(p, 0, 1);
    const e = easeInOut(progress);
    const sep = lerp(SEP_MIN, SEP_MAX, e);
    activeIdx = clamp(Math.floor(progress * 4.999), 0, 4);

    for (let L = 0; L < 5; L++) {
      const pl = planes[L];
      pl.grp.position.y = pl.baseY * sep;
      const isA = L === activeIdx;
      // highlight the active layer
      pl.fill.material.opacity = isA ? 0.26 : 0.09;
      pl.edge.material.opacity = isA ? 1.0 : 0.5;
      pl.grid.material.opacity = isA ? 0.22 : 0.1;
      pl.dots.material.opacity = isA ? 1.0 : 0.6;
      const s = isA ? 1.035 : 1.0;
      pl.grp.scale.set(s, 1, s);
    }

    // connectors follow current world corner positions
    for (let c = 0; c < 4; c++) {
      const arr = connectors[c].geometry.attributes.position.array;
      for (let L = 0; L < 5; L++) {
        arr[L * 3] = cornerLocal[c][0];
        arr[L * 3 + 1] = planes[L].baseY * sep;
        arr[L * 3 + 2] = cornerLocal[c][1];
      }
      connectors[c].geometry.attributes.position.needsUpdate = true;
      connectors[c].material.opacity = lerp(0.28, 0.14, e);
    }

    // camera: front-ish + slightly high at rest, orbit to iso as it explodes
    const ang = lerp(-0.35, 0.75, e);
    const dist = lerp(19, 26, e);
    const camY = lerp(3.5, 9.5, e);
    const cx = W < 700 ? 0 : PW * 0.28;   // bias left on wide screens (copy sits right/left)
    camera.position.set(Math.sin(ang) * dist + cx, camY, Math.cos(ang) * dist);
    camera.lookAt(cx, 0, 0);

    group.rotation.y = lerp(0.0, 0.12, e);

    // reflect active layer in the DOM list
    if (layerEls.length) layerEls.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  }

  function setPointer(nx) {
    if (!animate) return;
    group.rotation.y += (nx * 0.14 - group.rotation.y % (Math.PI * 2)) * 0; // subtle; handled in frame
    group.userData.px = nx;
  }
  function setVisible(v) { visible = v; }

  const layerEls = Array.prototype.slice.call(doc.querySelectorAll('.layers li'));

  function frame() {
    if (!visible || W < 2) return;
    if (animate && group.userData.px != null) {
      const target = group.userData.px * 0.1;
      group.rotation.x = lerp(group.rotation.x || 0, target, 0.05);
    }
    renderer.render(scene, camera);
  }

  init();
  return { frame, resize, setProgress, setPointer, setVisible };
})();

/* ════════════════════════════════════════════════════════════════════════
   RENDER LOOP (single RAF driving both scenes)
   ══════════════════════════════════════════════════════════════════════ */
let paused = reduced;
function renderOnce(t) {
  if (HeroScene) HeroScene.frame(t || 0);
  if (StackScene) StackScene.frame();
}
function loop(t) {
  renderOnce(t);
  if (!paused && animate) requestAnimationFrame(loop);
}
if (animate) requestAnimationFrame(loop);
else renderOnce(0);   // one static frame for reduced-motion

/* ── pointer parallax (shared) ───────────────────────────────────────────── */
if (finePointer) {
  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    if (HeroScene) HeroScene.setPointer(nx, ny);
    if (StackScene) StackScene.setPointer(nx);
  }, { passive: true });
}

/* ── resize ──────────────────────────────────────────────────────────────── */
let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    if (HeroScene) HeroScene.resize();
    if (StackScene) StackScene.resize();
    if (hasGsap) ScrollTrigger.refresh();
    if (paused) renderOnce(performance.now());
  }, 150);
}, { passive: true });

/* ════════════════════════════════════════════════════════════════════════
   GSAP SCROLL CHOREOGRAPHY
   ══════════════════════════════════════════════════════════════════════ */
function nudge() { if (paused) renderOnce(performance.now()); }

if (hasGsap) {
  /* progress bar */
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => { root.style.setProperty('--sc', self.progress.toFixed(4)); },
  });

  /* hero intro timeline (kinetic lines + lede + cta) */
  if (!reduced) {
    const tl = gsap.timeline({ delay: 0.2 });
    tl.to('.overline .kin', { y: 0, duration: 0.9, ease: 'expo.out' })
      .to('.hero-title .kin', { y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, '-=0.6')
      .to('.hero-lede', { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, '-=0.5')
      .to('.hero-cta', { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, '-=0.6');
    gsap.set('.hero-lede, .hero-cta', { y: 16 });
  } else {
    gsap.set('.hero-title .kin, .overline .kin', { y: 0 });
    gsap.set('.hero-lede, .hero-cta', { opacity: 1 });
  }

  /* hero globe fade-out as it scrolls away; stop rendering once fully faded */
  if (HeroScene) {
    ScrollTrigger.create({
      trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: (self) => {
        const f = 1 - self.progress;
        HeroScene.setFade(f);
        HeroScene.setVisible(f > 0.01);
        nudge();
      },
    });
  }

  /* section reveals (kinetic titles + fade-up blocks) */
  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.to(el, {
      opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' },
    });
  });
  /* kinetic split for section titles */
  doc.querySelectorAll('[data-kin]').forEach((el) => {
    const words = el.textContent.split(' ');
    el.innerHTML = '';
    words.forEach((w) => {
      const line = doc.createElement('span'); line.className = 'line'; line.style.display = 'inline-block';
      const kin = doc.createElement('span'); kin.className = 'kin'; kin.textContent = w;
      line.appendChild(kin); el.appendChild(line); el.appendChild(doc.createTextNode(' '));
    });
    gsap.to(el.querySelectorAll('.kin'), {
      y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
    });
  });

  /* flagship: pin the defense stage + scrub the explode */
  if (StackScene && !isMobile) {
    ScrollTrigger.create({
      trigger: '#defense', start: 'top top', end: 'bottom bottom',
      pin: '.pin-stage', pinSpacing: true, scrub: reduced ? true : 0.6,
      onUpdate: (self) => { StackScene.setProgress(self.progress); nudge(); },
      onToggle: (self) => StackScene.setVisible(self.isActive),
    });
    StackScene.setVisible(true);
  } else if (StackScene) {
    // mobile: no pin — show a static exploded frame
    StackScene.setProgress(0.62);
    StackScene.setVisible(true);
  }

  /* horizontal cinematic gallery (pin + scrub translate) */
  if (!isMobile) {
    const track = doc.getElementById('gal-track');
    const galSec = doc.getElementById('gallery');
    if (track && galSec) {
      const getScroll = () => track.scrollWidth - window.innerWidth;
      gsap.to(track, {
        x: () => -getScroll(), ease: 'none',
        scrollTrigger: {
          trigger: galSec, start: 'top top', end: () => '+=' + getScroll(),
          pin: '.gal-stage', pinSpacing: true, scrub: 0.6, invalidateOnRefresh: true,
        },
      });
    }
  }

  /* chapter scrollspy → nav + big counter */
  const chapEls = Array.prototype.slice.call(doc.querySelectorAll('[data-chapter]'));
  const chapters = [{ id: 'top', name: 'Index' }];
  chapEls.forEach((el) => chapters.push({ id: el.id, name: el.getAttribute('data-chapter') }));
  const total = chapters.length;
  const bigEl = doc.getElementById('count-big'), subEl = doc.getElementById('count-sub');
  const navLinks = Array.prototype.slice.call(doc.querySelectorAll('.topnav a.mnav'));
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  function setChapter(idx) {
    if (!bigEl) return;
    bigEl.innerHTML = '<b>' + pad(idx) + '</b> / ' + pad(total - 1);
    subEl.textContent = chapters[idx].name;
    const id = chapters[idx].id;
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  }
  setChapter(0);
  chapters.forEach((ch, idx) => {
    const el = idx === 0 ? doc.getElementById('top') : doc.getElementById(ch.id);
    if (!el) return;
    ScrollTrigger.create({
      trigger: el, start: 'top 55%', end: 'bottom 45%',
      onToggle: (self) => { if (self.isActive) setChapter(idx); },
    });
  });

  /* subtle parallax on chapter index numerals */
  gsap.utils.toArray('.chap .idx').forEach((el) => {
    gsap.fromTo(el, { y: 30 }, {
      y: -30, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

} else {
  /* no GSAP: reveal everything so nothing is hidden */
  root.classList.remove('js');
}

/* ════════════════════════════════════════════════════════════════════════
   VANILLA UI: cursor glow, card spotlight, motion toggle
   ══════════════════════════════════════════════════════════════════════ */
const glow = doc.querySelector('.cursor-glow');
if (glow && finePointer) {
  window.addEventListener('pointermove', (e) => {
    glow.style.opacity = '1';
    glow.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0) translate(-50%,-50%)';
  }, { passive: true });
  doc.querySelectorAll('.card').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
}

/* motion toggle */
const motionBtn = doc.getElementById('motion');
function applyPaused() {
  body.classList.toggle('paused', paused);
  if (motionBtn) {
    motionBtn.setAttribute('aria-pressed', String(paused));
    motionBtn.lastChild.textContent = paused ? ' Motion off' : ' Motion';
  }
}
if (motionBtn) {
  motionBtn.addEventListener('click', () => {
    paused = !paused;
    applyPaused();
    if (!paused) { animate = true; requestAnimationFrame(loop); }
    else { renderOnce(performance.now()); }
  });
}
applyPaused();

/* ensure a frame is drawn once fonts/layout settle */
window.addEventListener('load', () => {
  if (hasGsap) ScrollTrigger.refresh();
  renderOnce(performance.now());
});

/* ============================================================================
   root@pi5 — homelab security console
   Interactive 3D network map (Three.js) + boot sequence + scroll choreography.
   Self-contained; libraries vendored under ./vendor/. Degrades gracefully.
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

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function webglOK() {
  try {
    const c = doc.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}
const WEBGL = webglOK();

const COL = {
  host: new THREE.Color('#22d3ee'),
  core: new THREE.Color('#38b7f8'),
  apps: new THREE.Color('#34d399'),
  obs:  new THREE.Color('#fbbf24'),
  edge: new THREE.Color('#3a6f96'),
};

function glowTexture() {
  const s = 128, c = doc.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.22, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ── shared pointer (screen-normalised parallax) ── */
const ptr = { x: 0, y: 0 };
if (finePointer) window.addEventListener('pointermove', (e) => {
  ptr.x = (e.clientX / window.innerWidth - 0.5) * 2;
  ptr.y = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

/* ════════════════════════════════════════════════════════════════════════
   NETWORK MAP — services, docker networks, wireguard boundary
   ══════════════════════════════════════════════════════════════════════ */
const NODES = [
  { id: 'pi5',       label: 'Pi 5',            role: 'Raspberry Pi 5 host',     net: 'host',       cat: 'host', hub: true },
  { id: 'pihole',    label: 'Pi-hole',         role: 'network-wide DNS block',  net: 'core',       cat: 'core' },
  { id: 'wud',       label: 'WUD',             role: 'image update tracking',   net: 'core',       cat: 'core' },
  { id: 'homepage',  label: 'Homepage',        role: 'single-pane dashboard',   net: 'proxy',      cat: 'core', hub: true },
  { id: 'vault',     label: 'Vaultwarden',     role: 'password manager',        net: 'apps',       cat: 'apps' },
  { id: 'paperless', label: 'Paperless-ngx',   role: 'documents + OCR',         net: 'apps',       cat: 'apps' },
  { id: 'hass',      label: 'Home Assistant',  role: 'smart-home hub',          net: 'host-net',   cat: 'apps' },
  { id: 'immich',    label: 'Immich',          role: 'photo library (offline)', net: 'apps',       cat: 'apps' },
  { id: 'prom',      label: 'Prometheus',      role: 'metrics store',           net: 'monitoring', cat: 'obs', hub: true },
  { id: 'grafana',   label: 'Grafana',         role: 'dashboards',              net: 'monitoring', cat: 'obs' },
  { id: 'loki',      label: 'Loki',            role: 'log store',               net: 'monitoring', cat: 'obs' },
  { id: 'promtail',  label: 'Promtail',        role: 'log shipper',             net: 'monitoring', cat: 'obs' },
  { id: 'alert',     label: 'Alertmanager',    role: 'alert routing',           net: 'monitoring', cat: 'obs' },
  { id: 'ntfy',      label: 'ntfy',            role: 'push notifications',      net: 'monitoring', cat: 'obs' },
  { id: 'node',      label: 'node-exporter',   role: 'host metrics',            net: 'monitoring', cat: 'obs' },
  { id: 'cadvisor',  label: 'cAdvisor',        role: 'container metrics',       net: 'monitoring', cat: 'obs' },
  { id: 'blackbox',  label: 'blackbox',        role: 'endpoint uptime',         net: 'monitoring', cat: 'obs' },
  { id: 'piexp',     label: 'pihole-exporter', role: 'DNS metrics',             net: 'monitoring', cat: 'obs' },
];
const EDGES = [
  ['pi5', 'pihole'], ['pi5', 'prom'], ['pi5', 'homepage'], ['pi5', 'hass'], ['pi5', 'wud'],
  ['prom', 'grafana'], ['prom', 'alert'], ['prom', 'node'], ['prom', 'cadvisor'], ['prom', 'blackbox'], ['prom', 'piexp'],
  ['alert', 'ntfy'], ['loki', 'promtail'], ['grafana', 'loki'],
  ['homepage', 'grafana'], ['homepage', 'vault'], ['homepage', 'paperless'], ['homepage', 'immich'],
  ['piexp', 'pihole'], ['blackbox', 'hass'],
];
const CLUSTER_DIR = {
  host: new THREE.Vector3(0, 0, 0),
  core: new THREE.Vector3(-1, 0.55, 0.35),
  apps: new THREE.Vector3(0.15, -0.95, 0.4),
  obs:  new THREE.Vector3(1, 0.4, -0.35),
};

const GraphScene = (() => {
  const canvas = doc.getElementById('graph-canvas');
  const labelWrap = doc.getElementById('graph-labels');
  const tip = doc.getElementById('graph-tip');
  if (!canvas) return null;
  if (!WEBGL) {
    if (labelWrap) labelWrap.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#6f849b;font-family:var(--mono);font-size:.78rem">WebGL unavailable — network map disabled</div>';
    return null;
  }

  let renderer, scene, camera, group, boundary, W = 0, H = 0, visible = true, intro = 0;
  const GLOW = glowTexture();
  const byId = {};
  const sprites = [];       // { node, sprite, pos(Vector3 local), base, color }
  const labelEls = {};      // id -> div (hub labels)
  let raycaster, hovered = null;
  const rot = { x: -0.16, y: 0.6 }, vel = { x: 0, y: 0 };
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  const pulses = [];
  let pulseGeo, pulsePositions;
  const tmp = new THREE.Vector3();

  function layout() {
    // cluster centroids + scatter
    const R = 6.2, SC = 2.6;
    const groups = { core: [], apps: [], obs: [], host: [] };
    NODES.forEach(n => groups[n.cat].push(n));
    NODES.forEach(n => {
      const dir = CLUSTER_DIR[n.cat].clone().normalize();
      const centroid = dir.multiplyScalar(n.cat === 'host' ? 0 : R);
      let p;
      if (n.cat === 'host') { p = new THREE.Vector3(0, 0, 0); }
      else {
        // deterministic-ish scatter using index
        const i = groups[n.cat].indexOf(n), c = groups[n.cat].length;
        const a = (i / Math.max(1, c)) * Math.PI * 2;
        const rr = SC * (0.45 + (i % 3) * 0.28);
        const up = new THREE.Vector3(0, 1, 0);
        const t1 = new THREE.Vector3().crossVectors(centroid.clone().normalize(), up).normalize();
        const t2 = new THREE.Vector3().crossVectors(centroid.clone().normalize(), t1).normalize();
        p = centroid.clone()
          .add(t1.multiplyScalar(Math.cos(a) * rr))
          .add(t2.multiplyScalar(Math.sin(a) * rr))
          .add(new THREE.Vector3(0, 0, 0).addScaledVector(centroid.clone().normalize(), (i % 2 ? 1 : -1) * 0.8));
        if (n.hub) p.multiplyScalar(0.7);
      }
      n._pos = p;
    });
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060d17, 0.026);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(0, 0, 26);
    group = new THREE.Group();
    scene.add(group);

    layout();

    // wireguard boundary shell
    const bgeo = new THREE.IcosahedronGeometry(10.4, 1);
    boundary = new THREE.LineSegments(
      new THREE.EdgesGeometry(bgeo),
      new THREE.LineBasicMaterial({ color: 0x2b567a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    group.add(boundary);

    // edges
    const lpos = [], lcol = [];
    EDGES.forEach(([a, b]) => {
      const na = NODES.find(n => n.id === a), nb = NODES.find(n => n.id === b);
      if (!na || !nb) return;
      const ca = COL[na.cat], cb = COL[nb.cat];
      lpos.push(na._pos.x, na._pos.y, na._pos.z, nb._pos.x, nb._pos.y, nb._pos.z);
      lcol.push(ca.r * 0.6, ca.g * 0.6, ca.b * 0.6, cb.r * 0.6, cb.g * 0.6, cb.b * 0.6);
    });
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lgeo.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    group.add(lines);

    // node sprites
    NODES.forEach(n => {
      const color = COL[n.cat].clone();
      const mat = new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
      const sp = new THREE.Sprite(mat);
      sp.position.copy(n._pos);
      const base = n.hub ? (n.id === 'pi5' ? 2.5 : 1.9) : 1.15;
      sp.scale.setScalar(base);
      group.add(sp);
      const rec = { node: n, sprite: sp, base, color };
      sprites.push(rec); byId[n.id] = rec;
    });

    // pulses along edges
    const M = isMobile ? 10 : 18;
    pulsePositions = new Float32Array(M * 3);
    pulseGeo = new THREE.BufferGeometry();
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
    for (let i = 0; i < M; i++) pulses.push({ e: (Math.random() * EDGES.length) | 0, t: Math.random(), sp: 0.004 + Math.random() * 0.006 });
    group.add(new THREE.Points(pulseGeo, new THREE.PointsMaterial({
      size: isMobile ? 0.9 : 0.7, map: GLOW, color: new THREE.Color('#8affde'), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })));

    raycaster = new THREE.Raycaster();

    // hub labels
    NODES.filter(n => n.hub).forEach(n => {
      const d = doc.createElement('div');
      d.className = 'glabel hub'; d.textContent = n.label;
      labelWrap.appendChild(d); labelEls[n.id] = d;
    });

    resize();
    if (animate && hasGsap) gsap.to({ v: 0 }, { v: 1, duration: 1.6, ease: 'expo.out', delay: 0.35, onUpdate: function () { intro = this.targets()[0].v; } });
    else intro = 1;

    bindPointer();
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; vel.x = vel.y = 0; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      pickPos.set(nx, ny); pickReady = true;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        vel.y = dx * 0.006; vel.x = dy * 0.006;
        rot.y += vel.y; rot.x = clamp(rot.x + vel.x, -1.0, 1.0);
      }
    });
    const end = (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (x) {} };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { pickReady = false; setHover(null); });
  }

  const pickPos = new THREE.Vector2(); let pickReady = false;

  function project(v) {
    tmp.copy(v).applyMatrix4(group.matrixWorld).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, z: tmp.z };
  }

  function setHover(rec) {
    if (hovered === rec) return;
    hovered = rec;
    if (!rec) { tip.style.opacity = '0'; canvas.style.cursor = dragging ? 'grabbing' : 'grab'; return; }
    canvas.style.cursor = 'pointer';
    tip.querySelector('.t').textContent = rec.node.label;
    tip.querySelector('.r').textContent = rec.node.role;
    tip.querySelector('.net').textContent = 'net: ' + rec.node.net;
    tip.style.opacity = '1';
  }

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (W < 2 || H < 2) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    camera.position.z = 26 * clamp(1.2 - (W / H) * 0.14, 0.9, 1.35);
  }

  function frame(time) {
    if (!visible || W < 2) return;
    // rotation w/ inertia + idle autorotate
    if (!dragging) {
      rot.y += (animate ? 0.0016 : 0) + vel.y;
      rot.x = clamp(rot.x + vel.x, -1.0, 1.0);
      vel.y *= 0.93; vel.x *= 0.93;
    }
    const e = intro < 1 ? (intro * intro * (3 - 2 * intro)) : 1;
    group.rotation.set(rot.x, rot.y, 0);
    group.scale.setScalar(lerp(0.6, 1, e));
    // gentle parallax tilt
    group.position.x = lerp(group.position.x, ptr.x * 0.6, 0.05);
    group.position.y = lerp(group.position.y, -ptr.y * 0.4, 0.05);
    if (boundary) boundary.rotation.y = -rot.y * 0.5;
    group.updateMatrixWorld();

    // pulses
    if (animate) {
      for (let i = 0; i < pulses.length; i++) {
        const pu = pulses[i]; pu.t += pu.sp;
        if (pu.t > 1) { pu.t = 0; pu.e = (Math.random() * EDGES.length) | 0; }
        const ed = EDGES[pu.e]; const a = byId[ed[0]], b = byId[ed[1]];
        if (!a || !b) continue;
        pulsePositions[i * 3] = lerp(a.node._pos.x, b.node._pos.x, pu.t);
        pulsePositions[i * 3 + 1] = lerp(a.node._pos.y, b.node._pos.y, pu.t);
        pulsePositions[i * 3 + 2] = lerp(a.node._pos.z, b.node._pos.z, pu.t);
      }
      pulseGeo.attributes.position.needsUpdate = true;
    }

    // hover pick
    if (pickReady && !dragging) {
      raycaster.setFromCamera(pickPos, camera);
      const hits = raycaster.intersectObjects(sprites.map(s => s.sprite), false);
      setHover(hits.length ? sprites.find(s => s.sprite === hits[0].object) : null);
    } else if (dragging) { setHover(null); }

    // node pulse + hover emphasis
    for (const s of sprites) {
      const target = (s === hovered) ? s.base * 1.5 : s.base;
      const cur = s.sprite.scale.x;
      s.sprite.scale.setScalar(lerp(cur, target * e, 0.2));
      s.sprite.material.opacity = ((s === hovered) ? 1 : 0.92) * e;
    }

    // labels (hubs always; hovered gets tooltip)
    for (const id in labelEls) {
      const rec = byId[id], pr = project(rec.node._pos);
      const el = labelEls[id];
      const behind = pr.z > 1;
      el.style.opacity = behind ? '0' : '0.92';
      el.style.transform = 'translate(-50%,-50%) translate(' + pr.x.toFixed(1) + 'px,' + (pr.y - rec.base * 8).toFixed(1) + 'px)';
    }
    if (hovered) {
      const pr = project(hovered.node._pos);
      tip.style.left = pr.x.toFixed(1) + 'px';
      tip.style.top = (pr.y - hovered.base * 6).toFixed(1) + 'px';
    }

    renderer.render(scene, camera);
  }

  function setVisible(v) { visible = v; }
  init();
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
  if (window.IntersectionObserver) new IntersectionObserver((es) => es.forEach(x => setVisible(x.isIntersecting)), { threshold: 0.01 }).observe(canvas);
  return { frame, resize, setVisible };
})();

/* ════════════════════════════════════════════════════════════════════════
   RENDER LOOP
   ══════════════════════════════════════════════════════════════════════ */
let paused = reduced;
function renderOnce(t) { if (GraphScene) GraphScene.frame(t || performance.now()); }
function loop(t) { renderOnce(t); if (!paused && animate) requestAnimationFrame(loop); }
if (animate) requestAnimationFrame(loop); else renderOnce(0);

let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (GraphScene) GraphScene.resize(); if (hasGsap) ScrollTrigger.refresh(); if (paused || !animate) renderOnce(); }, 150);
}, { passive: true });

/* ════════════════════════════════════════════════════════════════════════
   BOOT SEQUENCE
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  const boot = doc.getElementById('boot');
  const cursor = doc.getElementById('boot-cursor');
  if (!boot) return;
  const lines = Array.prototype.slice.call(boot.querySelectorAll('.ln'));
  if (reduced || !animate) { boot.classList.add('done'); if (cursor) cursor.style.animation = 'blink 1.1s step-end infinite'; return; }
  let i = 0;
  const reveal = () => {
    if (i >= lines.length) { if (cursor) cursor.style.animation = 'blink 1.1s step-end infinite'; return; }
    const el = lines[i];
    if (hasGsap) gsap.fromTo(el, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.28, ease: 'power2.out' });
    else el.style.opacity = '1';
    i++;
    setTimeout(reveal, 190 + Math.random() * 120);
  };
  // kick off shortly after load
  setTimeout(reveal, 450);
})();

/* ════════════════════════════════════════════════════════════════════════
   SCROLL CHOREOGRAPHY
   ══════════════════════════════════════════════════════════════════════ */
if (hasGsap) {
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => root.style.setProperty('--sc', self.progress.toFixed(4)) });

  const heroReveals = gsap.utils.toArray('.hero .reveal');
  if (!reduced) {
    gsap.set(heroReveals, { opacity: 0, y: 20 });
    gsap.to(heroReveals, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out', stagger: 0.12, delay: 0.1 });
  } else gsap.set(heroReveals, { opacity: 1, y: 0 });

  gsap.utils.toArray('.reveal').forEach((el) => {
    if (el.closest('.hero')) return;
    if (el.classList.contains('grid') || el.classList.contains('log')) {
      gsap.set(el, { opacity: 1 });
      const items = el.querySelectorAll('.card, .logrow');
      gsap.set(items, { opacity: 0, y: 20 });
      gsap.to(items, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 86%', toggleActions: 'play none none reverse' } });
    } else {
      gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
    }
  });

  const navLinks = Array.prototype.slice.call(doc.querySelectorAll('.nav-links a'));
  doc.querySelectorAll('section[id], header[id]').forEach((sec) => {
    ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => { if (self.isActive) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + sec.id)); } });
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
  doc.querySelectorAll('.card, .kpi').forEach((c) => {
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

window.addEventListener('load', () => { if (hasGsap) ScrollTrigger.refresh(); if (GraphScene) GraphScene.resize(); renderOnce(performance.now()); });

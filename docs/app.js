/* ============================================================================
   Descent — cinematic scroll-driven flythrough where every defense layer is
   a literal scene:
     01 the open internet dying against the sealed edge shield
     02 the WireGuard mesh — keyed peers, encrypted tunnels, riding packets
     03 the tailnet — hub + orbiting services, TLS locks, 127.0.0.1
     04 the UFW wall — instanced bricks, allow-listed port holes, denied
        packets splashing red; the camera stops, then passes through a port
     05 segmented networks — isolated bridge rings, no lateral path
     06 the Pi-hole core — a DNS sinkhole vortex swallowing ad domains
   Fixed full-viewport Three.js stage; scroll drives a keyframed camera path
   with real "stops" at the edge and the firewall. Self-contained (./vendor/).
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
const N = 6;

/* set-piece anchors along -Z */
const SHIELD_Z = -20;
const WALL_Z = -96;
const CORE_Z = -146.5;

/* camera path: scroll progress → keyframed position.
   Plateaus are the "stops": ~0.167 at the edge shield, ~0.667 at the wall. */
const PATH = [
  [0.000,  0.0,  0.0,   16.0],
  [0.055,  0.0,  0.2,    3.0],
  [0.120,  0.0,  0.3,  -13.0],
  [0.167,  0.0,  0.2,  -16.6],  // stop: the internet ends at the shield
  [0.198,  0.0,  0.0,  -24.0],  // punch through the edge
  [0.260,  1.7,  0.7,  -34.0],  // weave the wireguard mesh
  [0.333, -1.3, -0.5,  -47.0],
  [0.410,  1.0,  0.4,  -58.0],
  [0.500,  0.0,  0.0,  -73.0],  // past the tailnet hub
  [0.610,  0.0,  0.0,  -89.0],
  [0.667,  0.0,  0.0,  -92.2],  // stop: face the firewall
  [0.702,  0.0,  0.0,  -99.5],  // through the allow-listed port
  [0.775, -1.5,  0.5, -110.0],  // weave the network segments
  [0.833,  1.3, -0.5, -119.0],
  [0.915,  0.5,  0.2, -130.0],
  [1.000,  0.0,  0.0, -136.5],  // settle before the pi-hole sinkhole
];
function pathAt(p, out) {
  p = clamp(p, 0, 1);
  let i = 0;
  while (i < PATH.length - 2 && p > PATH[i + 1][0]) i++;
  const a = PATH[i], b = PATH[i + 1];
  const t = smooth((p - a[0]) / (b[0] - a[0]));
  out.set(lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t));
  return out;
}

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

/* white canvas glyphs, tinted per-sprite via material color */
function glyphTexture(draw) {
  const s = 128, c = doc.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff';
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const lockTex = () => glyphTexture((g) => {
  g.lineWidth = 10;
  g.beginPath(); g.arc(64, 52, 19, Math.PI, 0); g.stroke();   // shackle
  g.fillRect(36, 52, 56, 44);                                  // body
  g.fillStyle = 'rgba(0,0,0,.9)';
  g.beginPath(); g.arc(64, 68, 7, 0, 6.284); g.fill();         // keyhole
  g.fillRect(60, 68, 8, 16);
});
const keyTex = () => glyphTexture((g) => {
  g.lineWidth = 10;
  g.beginPath(); g.arc(40, 64, 16, 0, 6.284); g.stroke();      // bow
  g.beginPath(); g.moveTo(56, 64); g.lineTo(102, 64);          // stem
  g.moveTo(86, 64); g.lineTo(86, 82);                          // teeth
  g.moveTo(100, 64); g.lineTo(100, 78); g.stroke();
});
const crossTex = () => glyphTexture((g) => {
  g.lineWidth = 14;
  g.beginPath(); g.moveTo(40, 40); g.lineTo(88, 88);
  g.moveTo(88, 40); g.lineTo(40, 88); g.stroke();
});

/* mono text label → sprite */
function textSprite(text, color, h) {
  const fs = 46, pad = 16;
  const c = doc.createElement('canvas');
  let g = c.getContext('2d');
  g.font = '700 ' + fs + 'px "Space Mono", ui-monospace, monospace';
  c.width = Math.ceil(g.measureText(text).width) + pad * 2;
  c.height = fs + pad * 2;
  g = c.getContext('2d');
  g.font = '700 ' + fs + 'px "Space Mono", ui-monospace, monospace';
  g.fillStyle = color; g.textBaseline = 'middle';
  g.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(h * (c.width / c.height), h, 1);
  return sp;
}

/* ════════════════════════════════════════════════════════════════════════
   SCENE
   ══════════════════════════════════════════════════════════════════════ */
const Scene = (() => {
  const canvas = doc.getElementById('scene');
  if (!canvas || !WEBGL) { if (canvas) canvas.style.display = 'none'; return null; }

  let renderer, scene, camera, W = 0, H = 0, visible = true;
  const GLOW = glowTexture(0.28), GLOWS = glowTexture(0.5);
  const LOCK = lockTex(), KEY = keyTex(), CROSS = crossTex();
  let stars;
  const nebulae = [], zones = [];
  let flight = 0, targetFlight = 0, lastT = 0;
  const _cp = new THREE.Vector3(), _lk = new THREE.Vector3();

  /* zone infra: each zone owns a group, fading materials and an update fn.
     inFull/inSpan shape the approach fade — small values keep a zone hidden
     until the camera actually punches through the barrier in front of it. */
  function makeZone(zNear, zFar, inFull, inSpan) {
    const z = { zNear, zFar, inFull: inFull === undefined ? 6 : inFull, inSpan: inSpan === undefined ? 44 : inSpan, group: new THREE.Group(), mats: [], update: null };
    scene.add(z.group); zones.push(z); return z;
  }
  function reg(zone, mat, base) { mat.transparent = true; mat.opacity = 0; zone.mats.push({ m: mat, b: base }); return mat; }
  function presence(z, camZ) {
    const inF = clamp(1 - ((camZ - z.zNear) - z.inFull) / z.inSpan, 0, 1);
    const outF = clamp(1 + (camZ - z.zFar) / 8, 0, 1);
    return smooth(inF) * smooth(outF);
  }

  /* short-lived impact flashes */
  function flashPool(group, count, color, maxScale) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m); s.visible = false; group.add(s);
      items.push({ s, life: 0 });
    }
    return {
      burst(x, y, zz) {
        for (const it of items) {
          if (it.life > 0) continue;
          it.life = 1; it.s.visible = true; it.s.position.set(x, y, zz);
          return;
        }
      },
      update(dt, pr) {
        for (const it of items) {
          if (it.life <= 0) continue;
          it.life -= dt * 2.6;
          if (it.life <= 0) { it.life = 0; it.s.visible = false; continue; }
          it.s.material.opacity = pr * 0.85 * it.life;
          it.s.scale.setScalar((1 - it.life) * maxScale + 0.35);
        }
      },
    };
  }

  function lineMat(zone, color, base) {
    return reg(zone, new THREE.LineBasicMaterial({ color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false }), base);
  }
  function pointsMat(zone, opts, base) {
    return reg(zone, new THREE.PointsMaterial(Object.assign({ map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }, opts)), base);
  }
  function spriteMat(zone, color, base, map) {
    return reg(zone, new THREE.SpriteMaterial({ map: map || GLOW, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), base);
  }

  /* ── 01 · THE EDGE — the internet stops here ─────────────────────────── */
  function buildEdge() {
    const zn = makeZone(18, -23);
    const g = zn.group;

    // the open internet: a slowly turning globe of hosts + traffic arcs
    const globe = new THREE.Group(); globe.position.set(0, 0.4, -4); g.add(globe);
    const R = 6.4, GN = isMobile ? 170 : 300;
    const gp = [], gc = [];
    const cA = new THREE.Color('#2dd4bf'), cB = new THREE.Color('#d9fef7'), tc = new THREE.Color();
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < GN; i++) {
      const y = 1 - (i / (GN - 1)) * 2, rad = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i;
      gp.push(Math.cos(th) * rad * R, y * R, Math.sin(th) * rad * R);
      tc.copy(cA).lerp(cB, Math.random() * 0.7);
      gc.push(tc.r, tc.g, tc.b);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    globe.add(new THREE.Points(gg, pointsMat(zn, { size: 0.34, vertexColors: true }, 0.85)));

    // great-circle traffic arcs between hosts
    const arcSeg = [];
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vt = new THREE.Vector3(), vp = new THREE.Vector3();
    for (let a = 0; a < (isMobile ? 8 : 14); a++) {
      va.randomDirection(); vb.randomDirection();
      vp.copy(va).multiplyScalar(R);
      for (let k = 1; k <= 22; k++) {
        const t = k / 22;
        vt.copy(va).lerp(vb, t).normalize().multiplyScalar(R + Math.sin(t * Math.PI) * 1.5);
        arcSeg.push(vp.x, vp.y, vp.z, vt.x, vt.y, vt.z);
        vp.copy(vt);
      }
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(arcSeg, 3));
    globe.add(new THREE.LineSegments(ag, lineMat(zn, '#2dd4bf', 0.22)));

    // the sealed edge: a hex-lattice shield — nothing gets past it
    const shield = new THREE.Group(); shield.position.set(0, 0, SHIELD_Z); g.add(shield);
    const ringM = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color('#2dd4bf'), blending: THREE.AdditiveBlending, depthWrite: false }), 0.85);
    shield.add(new THREE.Mesh(new THREE.TorusGeometry(9, 0.12, 10, 96), ringM));
    const hexPos = [];
    const ha = 1.05, hw = ha * 1.5, hh = ha * Math.sqrt(3);
    for (let q = -9; q <= 9; q++) for (let r = -9; r <= 9; r++) {
      const cx = q * hw, cy = (r + (q & 1 ? 0.5 : 0)) * hh;
      if (Math.hypot(cx, cy) > 7.9) continue;
      for (let k = 0; k < 6; k++) {
        const a1 = Math.PI / 3 * k, a2 = Math.PI / 3 * (k + 1);
        hexPos.push(cx + Math.cos(a1) * ha, cy + Math.sin(a1) * ha, 0, cx + Math.cos(a2) * ha, cy + Math.sin(a2) * ha, 0);
      }
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hexPos, 3));
    const hexM = lineMat(zn, '#2dd4bf', 0.3);
    shield.add(new THREE.LineSegments(hg, hexM));
    const discM = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color('#2dd4bf'), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0.05);
    shield.add(new THREE.Mesh(new THREE.CircleGeometry(8.8, 48), discM));
    // the seal: an opaque backing — nothing behind the edge is visible until
    // the camera passes through it
    const sealM = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a1424') }), 0.92);
    const seal = new THREE.Mesh(new THREE.CircleGeometry(8.9, 48), sealM);
    seal.position.z = -0.15; shield.add(seal);

    // hostile probes: red packets that fly at the shield and die on it
    const PN = isMobile ? 10 : 18;
    const probes = [];
    const pHead = new Float32Array(PN * 3), pTrail = new Float32Array(PN * 6);
    function spawnProbe(p, stagger) {
      const th = Math.random() * 6.284, ph = Math.acos(2 * Math.random() - 1);
      p.x = Math.sin(ph) * Math.cos(th) * R;
      p.y = 0.4 + Math.sin(ph) * Math.sin(th) * R * 0.8;
      p.z = -4 + Math.cos(ph) * R;
      if (p.z < -12) p.z = -12 + Math.random() * 5;
      const tx = (Math.random() - 0.5) * 11, ty = (Math.random() - 0.5) * 7;
      const dx = tx - p.x, dy = ty - p.y, dz = SHIELD_Z - p.z;
      const len = Math.hypot(dx, dy, dz), spd = 7 + Math.random() * 6;
      p.vx = dx / len * spd; p.vy = dy / len * spd; p.vz = dz / len * spd;
      p.delay = stagger ? Math.random() * 1.6 : Math.random() * 0.5;
    }
    for (let i = 0; i < PN; i++) { const p = {}; spawnProbe(p, true); probes.push(p); }
    const phG = new THREE.BufferGeometry();
    phG.setAttribute('position', new THREE.BufferAttribute(pHead, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.Points(phG, pointsMat(zn, { size: 0.7, color: new THREE.Color('#fb7185') }, 0.95)));
    const ptG = new THREE.BufferGeometry();
    ptG.setAttribute('position', new THREE.BufferAttribute(pTrail, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.LineSegments(ptG, lineMat(zn, '#f87171', 0.55)));
    const impacts = flashPool(g, 10, '#fb7185', 1.3);

    zn.update = (t, dt, camZ, pr) => {
      globe.rotation.y = t * 0.00006;
      hexM.opacity = pr * 0.3 * (0.8 + 0.2 * Math.sin(t * 0.0012));
      for (let i = 0; i < PN; i++) {
        const p = probes[i];
        if (p.delay > 0) { p.delay -= dt; pHead[i * 3 + 2] = 999; pTrail[i * 6 + 2] = 999; pTrail[i * 6 + 5] = 999; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.z <= SHIELD_Z + 0.4) { impacts.burst(p.x, p.y, SHIELD_Z + 0.25); spawnProbe(p, false); }
        pHead[i * 3] = p.x; pHead[i * 3 + 1] = p.y; pHead[i * 3 + 2] = p.z;
        pTrail[i * 6] = p.x; pTrail[i * 6 + 1] = p.y; pTrail[i * 6 + 2] = p.z;
        pTrail[i * 6 + 3] = p.x - p.vx * 0.2; pTrail[i * 6 + 4] = p.y - p.vy * 0.2; pTrail[i * 6 + 5] = p.z - p.vz * 0.2;
      }
      phG.attributes.position.needsUpdate = true;
      ptG.attributes.position.needsUpdate = true;
      impacts.update(dt, pr);
    };
  }

  /* ── 02 · WIREGUARD MESH — keyed peers, encrypted tunnels ────────────── */
  function buildWireguard() {
    // hidden until the camera punches through the edge shield
    const zn = makeZone(-20.5, -53, 0, 4);
    const g = zn.group;
    let NP = [
      [-6.5, 2.8, -29], [5.8, 3.4, -31], [0.5, -3.8, -30],
      [-3.2, -1.2, -35], [6.8, -2.6, -37], [-7.4, -3.4, -40],
      [2.6, 4.2, -41], [-1.8, 1.0, -44], [7.2, 1.8, -46],
      [-5.6, 3.6, -48], [3.4, -3.2, -49], [-0.6, -1.6, -52],
    ];
    if (isMobile) NP = NP.slice(0, 9);

    // peers: glow + solid octahedron + identity key floating above
    const nodeM = spriteMat(zn, '#22d3ee', 0.85);
    const octoGeo = new THREE.OctahedronGeometry(0.3);
    const octoM = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color('#67e8f9'), blending: THREE.AdditiveBlending, depthWrite: false }), 0.9);
    const keyM = spriteMat(zn, '#a5f3fc', 0.55, KEY);
    for (const p of NP) {
      const s = new THREE.Sprite(nodeM); s.position.set(p[0], p[1], p[2]); s.scale.setScalar(1.5); g.add(s);
      const o = new THREE.Mesh(octoGeo, octoM); o.position.set(p[0], p[1], p[2]); g.add(o);
      const k = new THREE.Sprite(keyM); k.position.set(p[0], p[1] + 0.8, p[2]); k.scale.setScalar(0.62); g.add(k);
    }

    // encrypted tunnels: each peer links to its 3 nearest
    const linkKeys = new Set(), links = [];
    for (let i = 0; i < NP.length; i++) {
      const ds = [];
      for (let j = 0; j < NP.length; j++) {
        if (j === i) continue;
        ds.push([Math.hypot(NP[i][0] - NP[j][0], NP[i][1] - NP[j][1], NP[i][2] - NP[j][2]), j]);
      }
      ds.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < 3 && k < ds.length; k++) {
        const j = ds[k][1], key = Math.min(i, j) + ':' + Math.max(i, j);
        if (!linkKeys.has(key)) { linkKeys.add(key); links.push([i, j]); }
      }
    }
    const lp = [];
    for (const [i, j] of links) lp.push(NP[i][0], NP[i][1], NP[i][2], NP[j][0], NP[j][1], NP[j][2]);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    g.add(new THREE.LineSegments(lg, lineMat(zn, '#22d3ee', 0.3)));

    // packets riding the tunnels
    const PK = isMobile ? 14 : 26;
    const pk = [], pkPos = new Float32Array(PK * 3);
    for (let i = 0; i < PK; i++) pk.push({ l: (Math.random() * links.length) | 0, t: Math.random(), spd: 0.25 + Math.random() * 0.5, dir: Math.random() < 0.5 ? 1 : -1 });
    const pkG = new THREE.BufferGeometry();
    pkG.setAttribute('position', new THREE.BufferAttribute(pkPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.Points(pkG, pointsMat(zn, { size: 0.5, color: new THREE.Color('#cffafe') }, 0.95)));

    zn.update = (t, dt, camZ, pr) => {
      g.rotation.z = Math.sin(t * 0.00012) * 0.02;
      for (let i = 0; i < PK; i++) {
        const p = pk[i];
        p.t += p.spd * dt * p.dir;
        if (p.t > 1 || p.t < 0) { p.l = (Math.random() * links.length) | 0; p.t = clamp(p.t, 0, 1) === 1 ? 0 : 1; p.dir = p.t === 0 ? 1 : -1; }
        const [a, b] = links[p.l];
        pkPos[i * 3] = lerp(NP[a][0], NP[b][0], p.t);
        pkPos[i * 3 + 1] = lerp(NP[a][1], NP[b][1], p.t);
        pkPos[i * 3 + 2] = lerp(NP[a][2], NP[b][2], p.t);
      }
      pkG.attributes.position.needsUpdate = true;
    };
  }

  /* ── 03 · TAILNET — hub, orbiting services, TLS on every beam ────────── */
  function buildTailscale() {
    const zn = makeZone(-53, -80);
    const g = zn.group;
    const HUB = { x: 0, y: 0.2, z: -67 }, TR = 6.4, TILT = 0.38;
    const SN = isMobile ? 6 : 8;
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);

    // hub: the pi, terminating TLS on the tailnet interface
    const hubM = spriteMat(zn, '#38bdf8', 0.95, GLOWS);
    const hub = new THREE.Sprite(hubM); hub.position.set(HUB.x, HUB.y, HUB.z); hub.scale.setScalar(3.4); g.add(hub);
    const hubRingM = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color('#7dd3fc'), blending: THREE.AdditiveBlending, depthWrite: false }), 0.8);
    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 8, 48), hubRingM);
    hubRing.position.copy(hub.position); g.add(hubRing);
    const hubLabel = textSprite('127.0.0.1', '#9ddcfd', 0.62);
    hubLabel.position.set(HUB.x, HUB.y - 1.8, HUB.z); g.add(hubLabel);
    reg(zn, hubLabel.material, 0.9);

    // orbiting service nodes + TLS locks on every beam
    const svcM = spriteMat(zn, '#38bdf8', 0.9);
    const lockM = spriteMat(zn, '#bae6fd', 0.85, LOCK);
    const svcs = [], locks = [];
    for (let i = 0; i < SN; i++) {
      const s = new THREE.Sprite(svcM); s.scale.setScalar(1.35); g.add(s); svcs.push(s);
      const l = new THREE.Sprite(lockM); l.scale.setScalar(0.72); g.add(l); locks.push(l);
    }
    const beamPos = new Float32Array(SN * 6);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.LineSegments(bg, lineMat(zn, '#38bdf8', 0.38)));

    // https packets, hub ↔ services
    const PK = isMobile ? 10 : 16;
    const pk = [], pkPos = new Float32Array(PK * 3);
    for (let i = 0; i < PK; i++) pk.push({ s: i % SN, t: Math.random(), spd: 0.35 + Math.random() * 0.4, dir: i % 2 ? 1 : -1 });
    const pkG = new THREE.BufferGeometry();
    pkG.setAttribute('position', new THREE.BufferAttribute(pkPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.Points(pkG, pointsMat(zn, { size: 0.48, color: new THREE.Color('#e0f2fe') }, 0.95)));

    const sx = new Float32Array(SN), sy = new Float32Array(SN), sz = new Float32Array(SN);
    zn.update = (t, dt, camZ, pr) => {
      const spin = t * 0.00016;
      for (let i = 0; i < SN; i++) {
        const a = spin + (i / SN) * Math.PI * 2;
        const lx = Math.cos(a) * TR, ly = Math.sin(a) * TR;
        sx[i] = HUB.x + lx; sy[i] = HUB.y + ly * cosT; sz[i] = HUB.z + ly * sinT;
        svcs[i].position.set(sx[i], sy[i], sz[i]);
        locks[i].position.set(lerp(HUB.x, sx[i], 0.55), lerp(HUB.y, sy[i], 0.55), lerp(HUB.z, sz[i], 0.55));
        beamPos[i * 6] = HUB.x; beamPos[i * 6 + 1] = HUB.y; beamPos[i * 6 + 2] = HUB.z;
        beamPos[i * 6 + 3] = sx[i]; beamPos[i * 6 + 4] = sy[i]; beamPos[i * 6 + 5] = sz[i];
      }
      bg.attributes.position.needsUpdate = true;
      for (let i = 0; i < PK; i++) {
        const p = pk[i];
        p.t += p.spd * dt * p.dir;
        if (p.t > 1) { p.t = 1; p.dir = -1; } else if (p.t < 0) { p.t = 0; p.dir = 1; }
        pkPos[i * 3] = lerp(HUB.x, sx[p.s], p.t);
        pkPos[i * 3 + 1] = lerp(HUB.y, sy[p.s], p.t);
        pkPos[i * 3 + 2] = lerp(HUB.z, sz[p.s], p.t);
      }
      pkG.attributes.position.needsUpdate = true;
      hubRing.rotation.z = t * 0.0004;
    };
  }

  /* ── 04 · UFW WALL — bricks, allow-listed ports, denied packets ──────── */
  function buildFirewall() {
    // materializes as its own chapter begins, not during the tailnet
    const zn = makeZone(-80, -100, 6, 12);
    const g = zn.group;
    // holes: [x, y, radius, accent, label]
    const HOLES = [
      [0, 0, 1.9, '#60a5fa', ':443 · serve'],
      [-4.6, 1.7, 1.3, '#2dd4bf', ':53 · dns'],
      [4.8, -1.9, 1.3, '#22d3ee', ':9090 · metrics'],
    ];
    const nearHole = (x, y, pad) => HOLES.some((h) => Math.hypot(x - h[0], y - h[1]) < h[2] + (pad || 0));

    // the wall itself: one instanced draw call
    const COLS = 19, ROWS = 13, BW = 1.64, BH = 1.0;
    const spots = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * BW + (r % 2 ? BW / 2 : 0);
      const y = (r - (ROWS - 1) / 2) * BH;
      if (nearHole(x, y, 0)) continue;
      spots.push([x, y]);
    }
    const brickGeo = new THREE.BoxGeometry(1.5, 0.86, 0.7);
    const brickMat = reg(zn, new THREE.MeshBasicMaterial({ color: 0xffffff }), 1);
    const wall = new THREE.InstancedMesh(brickGeo, brickMat, spots.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), base = new THREE.Color('#16223f'), hi = new THREE.Color('#60a5fa');
    for (let i = 0; i < spots.length; i++) {
      m4.setPosition(spots[i][0], spots[i][1], WALL_Z);
      wall.setMatrixAt(i, m4);
      col.copy(base).multiplyScalar(0.55 + Math.random() * 0.45);
      let dMin = 1e9;
      for (const h of HOLES) dMin = Math.min(dMin, Math.hypot(spots[i][0] - h[0], spots[i][1] - h[1]) - h[2]);
      if (dMin < 2.4) col.lerp(hi, (1 - dMin / 2.4) * 0.35);
      wall.setColorAt(i, col);
    }
    wall.instanceMatrix.needsUpdate = true;
    wall.instanceColor.needsUpdate = true;
    g.add(wall);

    // glowing port rings + labels
    for (const h of HOLES) {
      const rm = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color(h[3]), blending: THREE.AdditiveBlending, depthWrite: false }), 0.85);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(h[2] * 0.82, 0.07, 8, 48), rm);
      ring.position.set(h[0], h[1], WALL_Z + 0.42); g.add(ring);
      const lab = textSprite(h[4], h[3], 0.5);
      lab.position.set(h[0], h[1] - h[2] * 0.82 - 0.62, WALL_Z + 0.6); g.add(lab);
      reg(zn, lab.material, 0.9);
    }
    // wash of light behind the wall, visible only through the ports
    const washM = spriteMat(zn, '#6091fa', 0.16, GLOWS);
    const wash = new THREE.Sprite(washM); wash.position.set(0, 0, WALL_Z - 4); wash.scale.setScalar(26); g.add(wash);

    // traffic: allowed packets thread the ports, the rest splash red
    const PK = isMobile ? 12 : 22;
    const pks = [];
    const pkPos = new Float32Array(PK * 3), pkCol = new Float32Array(PK * 3);
    const trPos = new Float32Array(PK * 6), trCol = new Float32Array(PK * 6);
    const cAllow = new THREE.Color('#22d3ee'), cDeny = new THREE.Color('#fb7185');
    function spawnPk(p, i, stagger) {
      p.x = (Math.random() - 0.5) * 22; p.y = (Math.random() - 0.5) * 10;
      p.z = -80 - Math.random() * 6;
      p.allow = Math.random() < 0.38;
      let tx, ty;
      if (p.allow) {
        const h = HOLES[(Math.random() * HOLES.length) | 0];
        tx = h[0] + (Math.random() - 0.5) * h[2] * 0.7; ty = h[1] + (Math.random() - 0.5) * h[2] * 0.7;
      } else {
        let guard = 0;
        do { tx = (Math.random() - 0.5) * 24; ty = (Math.random() - 0.5) * 11; } while (nearHole(tx, ty, 0.7) && ++guard < 20);
      }
      const dx = tx - p.x, dy = ty - p.y, dz = WALL_Z - p.z;
      const len = Math.hypot(dx, dy, dz), spd = 8 + Math.random() * 5;
      p.vx = dx / len * spd; p.vy = dy / len * spd; p.vz = dz / len * spd;
      p.delay = stagger ? Math.random() * 1.4 : Math.random() * 0.4;
      const cc = p.allow ? cAllow : cDeny;
      pkCol[i * 3] = cc.r; pkCol[i * 3 + 1] = cc.g; pkCol[i * 3 + 2] = cc.b;
      for (let k = 0; k < 2; k++) { trCol[i * 6 + k * 3] = cc.r; trCol[i * 6 + k * 3 + 1] = cc.g; trCol[i * 6 + k * 3 + 2] = cc.b; }
    }
    for (let i = 0; i < PK; i++) { const p = {}; spawnPk(p, i, true); pks.push(p); }
    const pkG = new THREE.BufferGeometry();
    pkG.setAttribute('position', new THREE.BufferAttribute(pkPos, 3).setUsage(THREE.DynamicDrawUsage));
    pkG.setAttribute('color', new THREE.BufferAttribute(pkCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.Points(pkG, pointsMat(zn, { size: 0.55, vertexColors: true }, 0.95)));
    const trG = new THREE.BufferGeometry();
    trG.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
    trG.setAttribute('color', new THREE.BufferAttribute(trCol, 3).setUsage(THREE.DynamicDrawUsage));
    const trM = reg(zn, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.45);
    g.add(new THREE.LineSegments(trG, trM));
    const denies = flashPool(g, 10, '#fb7185', 1.2);

    zn.update = (t, dt, camZ, pr) => {
      for (let i = 0; i < PK; i++) {
        const p = pks[i];
        if (p.delay > 0) { p.delay -= dt; pkPos[i * 3 + 2] = 999; trPos[i * 6 + 2] = 999; trPos[i * 6 + 5] = 999; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (!p.allow && p.z <= WALL_Z + 0.5) { denies.burst(p.x, p.y, WALL_Z + 0.45); spawnPk(p, i, false); }
        else if (p.allow && p.z <= WALL_Z - 5) spawnPk(p, i, false);
        pkPos[i * 3] = p.x; pkPos[i * 3 + 1] = p.y; pkPos[i * 3 + 2] = p.z;
        trPos[i * 6] = p.x; trPos[i * 6 + 1] = p.y; trPos[i * 6 + 2] = p.z;
        trPos[i * 6 + 3] = p.x - p.vx * 0.12; trPos[i * 6 + 4] = p.y - p.vy * 0.12; trPos[i * 6 + 5] = p.z - p.vz * 0.12;
      }
      pkG.attributes.position.needsUpdate = true; pkG.attributes.color.needsUpdate = true;
      trG.attributes.position.needsUpdate = true; trG.attributes.color.needsUpdate = true;
      denies.update(dt, pr);
    };
  }

  /* ── 05 · SEGMENTED NETWORKS — isolated bridges, no lateral path ─────── */
  function buildSegments() {
    const zn = makeZone(-100, -131);
    const g = zn.group;
    const CL = [
      { c: [-5.2, 2.0, -112], col: '#a5b4fc', label: 'net · monitoring', n: 5 },
      { c: [5.4, -1.4, -117], col: '#818cf8', label: 'net · proxy', n: 4 },
      { c: [-4.6, -2.4, -125], col: '#6366f1', label: 'net · apps', n: 5 },
    ];
    const RING_R = 3.0;
    const rings = [], nodesP = [], nodesC = [], linkP = [], linkC = [];
    const tc = new THREE.Color();
    const clusterNodes = [];
    for (const cl of CL) {
      tc.set(cl.col);
      // boundary ring as segments (merged below)
      for (let k = 0; k < 48; k++) {
        const a1 = (k / 48) * Math.PI * 2, a2 = ((k + 1) / 48) * Math.PI * 2;
        rings.push(cl.c[0] + Math.cos(a1) * RING_R, cl.c[1] + Math.sin(a1) * RING_R, cl.c[2],
                   cl.c[0] + Math.cos(a2) * RING_R, cl.c[1] + Math.sin(a2) * RING_R, cl.c[2]);
      }
      // containers inside the bridge
      const pts = [];
      for (let i = 0; i < cl.n; i++) {
        const a = i * 2.4 + cl.c[0], r = 0.8 + (i % 3) * 0.62;
        const x = cl.c[0] + Math.cos(a) * r, y = cl.c[1] + Math.sin(a) * r, z = cl.c[2] + (Math.random() - 0.5) * 0.6;
        pts.push([x, y, z]);
        nodesP.push(x, y, z); nodesC.push(tc.r, tc.g, tc.b);
      }
      clusterNodes.push(pts);
      // internal links only — everything can talk inside, nothing outside
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        linkP.push(pts[i][0], pts[i][1], pts[i][2], pts[j][0], pts[j][1], pts[j][2]);
        linkC.push(tc.r, tc.g, tc.b, tc.r, tc.g, tc.b);
      }
      const lab = textSprite(cl.label, cl.col, 0.55);
      lab.position.set(cl.c[0], cl.c[1] - RING_R - 0.7, cl.c[2]); g.add(lab);
      reg(zn, lab.material, 0.9);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rings, 3));
    g.add(new THREE.LineSegments(rg, lineMat(zn, '#a5b4fc', 0.5)));
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(nodesP, 3));
    ng.setAttribute('color', new THREE.Float32BufferAttribute(nodesC, 3));
    g.add(new THREE.Points(ng, pointsMat(zn, { size: 0.85, vertexColors: true }, 0.95)));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linkP, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(linkC, 3));
    const linkM = reg(zn, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.28);
    g.add(new THREE.LineSegments(lg, linkM));

    // intra-bridge packets
    const PK = isMobile ? 8 : 12;
    const pk = [], pkPos = new Float32Array(PK * 3);
    for (let i = 0; i < PK; i++) {
      const ci = i % CL.length, pts = clusterNodes[ci];
      pk.push({ ci, a: (Math.random() * pts.length) | 0, b: (Math.random() * pts.length) | 0, t: Math.random(), spd: 0.4 + Math.random() * 0.4 });
    }
    const pkG = new THREE.BufferGeometry();
    pkG.setAttribute('position', new THREE.BufferAttribute(pkPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.add(new THREE.Points(pkG, pointsMat(zn, { size: 0.45, color: new THREE.Color('#e0e7ff') }, 0.9)));

    // one attempted lateral hop — stopped dead at the boundary
    const A = CL[0].c, B = CL[1].c;
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const dl = Math.hypot(dx, dy, dz);
    const ex = B[0] - dx / dl * (RING_R + 0.1), ey = B[1] - dy / dl * (RING_R + 0.1), ez = B[2] - dz / dl * (RING_R + 0.1);
    const blG = new THREE.BufferGeometry();
    blG.setAttribute('position', new THREE.Float32BufferAttribute([A[0] + dx / dl, A[1] + dy / dl, A[2] + dz / dl, ex, ey, ez], 3));
    const blM = new THREE.LineBasicMaterial({ color: new THREE.Color('#f87171'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    g.add(new THREE.LineSegments(blG, blM));
    const xM = new THREE.SpriteMaterial({ map: CROSS, color: new THREE.Color('#f87171'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const xS = new THREE.Sprite(xM); xS.position.set(ex, ey, ez); xS.scale.setScalar(0.55); g.add(xS);

    zn.update = (t, dt, camZ, pr) => {
      for (let i = 0; i < PK; i++) {
        const p = pk[i], pts = clusterNodes[p.ci];
        p.t += p.spd * dt;
        if (p.t > 1) { p.t = 0; p.a = p.b; p.b = (Math.random() * pts.length) | 0; }
        pkPos[i * 3] = lerp(pts[p.a][0], pts[p.b][0], p.t);
        pkPos[i * 3 + 1] = lerp(pts[p.a][1], pts[p.b][1], p.t);
        pkPos[i * 3 + 2] = lerp(pts[p.a][2], pts[p.b][2], p.t);
      }
      pkG.attributes.position.needsUpdate = true;
      const pulse = 0.6 + 0.4 * Math.sin(t * 0.003);
      blM.opacity = pr * 0.28 * pulse;
      xM.opacity = pr * (0.35 + 0.35 * pulse);
    };
  }

  /* ── 06 · THE CORE — pi-hole, a literal DNS sinkhole ─────────────────── */
  function buildCore() {
    // kept dark until the descent's final chapter
    const zn = makeZone(-128, -155, 4, 12);
    const g = zn.group;
    const vg = new THREE.Group(); vg.position.set(0, 0, CORE_Z); vg.rotation.x = 0.42; g.add(vg);

    // the vortex: gold queries orbit, red ad domains spiral in and vanish
    const VN = isMobile ? 380 : 650;
    const vd = [];
    const vPos = new Float32Array(VN * 3), vCol = new Float32Array(VN * 3);
    const cGold = new THREE.Color('#fcd34d'), cPale = new THREE.Color('#fff6dc'), cAd = new THREE.Color('#f87171'), tc = new THREE.Color();
    function spawnV(p, i, fresh) {
      p.isAd = Math.random() < 0.3;
      p.r = fresh ? 1.3 + Math.random() * 6.8 : 7.2 + Math.random() * 1.4;
      p.ang = Math.random() * 6.284;
      p.w = (0.35 + Math.random() * 0.3) * (p.isAd ? 1.35 : 1);
      p.zj = (Math.random() - 0.5) * 0.8;
      if (p.isAd) tc.copy(cAd).multiplyScalar(0.75 + Math.random() * 0.4);
      else tc.copy(cGold).lerp(cPale, Math.random() * 0.8);
      vCol[i * 3] = tc.r; vCol[i * 3 + 1] = tc.g; vCol[i * 3 + 2] = tc.b;
    }
    for (let i = 0; i < VN; i++) { const p = {}; spawnV(p, i, true); vd.push(p); }
    const vG = new THREE.BufferGeometry();
    vG.setAttribute('position', new THREE.BufferAttribute(vPos, 3).setUsage(THREE.DynamicDrawUsage));
    vG.setAttribute('color', new THREE.BufferAttribute(vCol, 3));
    vg.add(new THREE.Points(vG, pointsMat(zn, { size: 0.42, vertexColors: true }, 0.95)));

    // the hole: an occluding void ringed in gold
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.12, 40), new THREE.MeshBasicMaterial({ color: 0x04060d }));
    hole.position.z = 0.05; vg.add(hole);
    const ringM = reg(zn, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fcd34d'), blending: THREE.AdditiveBlending, depthWrite: false }), 0.9);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 10, 64), ringM); vg.add(ring);

    // ambient core glow
    const coreM = spriteMat(zn, '#fff3d6', 0.4, GLOWS);
    const core = new THREE.Sprite(coreM); core.position.set(0, 0, CORE_Z - 3); core.scale.setScalar(8); g.add(core);
    const haloM = spriteMat(zn, '#fcd34d', 0.17, GLOWS);
    const halo = new THREE.Sprite(haloM); halo.position.set(0, 0, CORE_Z - 3); halo.scale.setScalar(16); g.add(halo);

    const label = textSprite('pi-hole · dns sinkhole', '#fcd34d', 0.6);
    label.position.set(0, -4.4, CORE_Z + 2.5); g.add(label);
    reg(zn, label.material, 0.9);

    const swallows = flashPool(vg, 6, '#fb7185', 1.3);

    zn.update = (t, dt, camZ, pr) => {
      for (let i = 0; i < VN; i++) {
        const p = vd[i];
        p.ang += p.w * dt * (3.2 / Math.max(1.2, p.r));
        if (p.isAd) {
          p.r -= dt * (0.45 + (8.2 - p.r) * 0.22);
          if (p.r < 1.15) { swallows.burst(Math.cos(p.ang) * 1.2, Math.sin(p.ang) * 1.2, 0.2); spawnV(p, i, false); }
        } else {
          p.r -= dt * 0.05;
          if (p.r < 2.2) spawnV(p, i, false);
        }
        vPos[i * 3] = Math.cos(p.ang) * p.r;
        vPos[i * 3 + 1] = Math.sin(p.ang) * p.r;
        vPos[i * 3 + 2] = (p.r - 8) * 0.16 + p.zj;
      }
      vG.attributes.position.needsUpdate = true;
      const pulse = 1 + Math.sin(t * 0.0016) * 0.06;
      core.scale.setScalar(8 * pulse);
      halo.scale.setScalar(16 * pulse);
      ring.rotation.z = t * 0.0003;
      swallows.update(dt, pr);
    };
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b16, 0.011);
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

    // starfield / dust spanning the whole descent
    const SN = isMobile ? 900 : 1800, sp = [], scl = [];
    const cA = new THREE.Color('#818cf8'), cB = new THREE.Color('#22d3ee'), tmp = new THREE.Color();
    for (let i = 0; i < SN; i++) {
      sp.push((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 60, 20 - Math.random() * 180);
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
      const m = new THREE.SpriteMaterial({ map: GLOWS, color: new THREE.Color(nebColors[i % nebColors.length]), transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m);
      s.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 36, 10 - Math.random() * 160);
      const sc = 26 + Math.random() * 30; s.scale.setScalar(sc);
      scene.add(s); nebulae.push({ s, base: sc, ph: Math.random() * 6.28 });
    }

    buildEdge();
    buildWireguard();
    buildTailscale();
    buildFirewall();
    buildSegments();
    buildCore();

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
    const dt = clamp((time - lastT) / 1000, 0, 0.05); lastT = time;
    flight = lerp(flight, targetFlight, 0.1);

    pathAt(flight, _cp);
    pathAt(Math.min(1, flight + 0.04), _lk);
    camera.position.set(_cp.x + ptr.x * 1.4, _cp.y - ptr.y * 1.0, _cp.z);
    camera.lookAt(_lk.x + ptr.x * 1.4, _lk.y - ptr.y * 1.0, _lk.z - 12);
    camera.rotation.z += Math.sin(time * 0.0002) * 0.02 + ptr.x * 0.02;
    const camZ = camera.position.z;

    for (const z of zones) {
      const pr = presence(z, camZ);
      const on = pr > 0.012;
      if (z.group.visible !== on) z.group.visible = on;
      if (!on) continue;
      for (const e of z.mats) e.m.opacity = e.b * pr;
      if (z.update) z.update(time, dt, camZ, pr);
    }

    // nebula drift + star parallax
    for (const n of nebulae) { n.s.scale.setScalar(n.base * (1 + Math.sin(time * 0.0004 + n.ph) * 0.08)); }
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

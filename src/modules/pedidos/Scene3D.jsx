// Escena 3D de Pedidos (Three.js): luces y sombras reales, cámara isométrica con órbita, vehículos animados.
// Recibe solo agregados (stats) y callbacks; toda la geometría es procedural (sin modelos externos).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N, SITES, paths, roadsFor, pathAt, zonaPos, ciudadPos } from './layout';

const TIPO_C = { IMP: '#14B8A6', NAC: '#3B82F6', DIR: '#F59E0B' };
const fmtN = (v) => Math.round(v || 0).toLocaleString('es-MX');
const fk = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : fmtN(v));
const W = (x, y, z = 0) => new THREE.Vector3(x, z, y); // mundo (x, y, z) → three (x, z, y)

const PALETTE = {
  dark: { bg: '#15111C', plate: '#2A2238', grass: '#24382D', grass2: '#284033', road: '#383149', line: '#9A92B4', pad: '#2B2439', padLine: '#E0BB3E', water: '#1B4466', wall: '#EAE7F2', wall2: '#D9D4E6', roofA: '#6D4FD8', roofX: '#8B6CF6', tree: '#46A86C', hemi: 1.05, sun: 2.1, glass: '#F5D06B', text: '#EDEBF2', sub: '#A9A2B8', card: 'rgba(30,24,41,0.92)', cardB: '#3E3555' },
  light: { bg: '#E7EDF7', plate: '#F4F6FB', grass: '#D5E8CD', grass2: '#CBE2C2', road: '#C6D0E0', line: '#FFFFFF', pad: '#E4E9F2', padLine: '#F2B705', water: '#8FC3EC', wall: '#FFFFFF', wall2: '#EEF2F8', roofA: '#2F6BE8', roofX: '#7C5CF0', tree: '#5DBB7A', hemi: 1.05, sun: 1.9, glass: '#BFD9F7', text: '#1E2A44', sub: '#5B6680', card: 'rgba(255,255,255,0.95)', cardB: '#D5DDEB' },
};

// ── Caché de geometrías / materiales / texturas ─────────────────────────────
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const mat = (color, o = {}) => memo(`m:${color}:${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04, ...o }));
const rbox = (w, h, d, r = 0.05) => memo(`rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)));
const canvasTex = (k, w, h, draw) => memo(`t:${k}`, () => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
const stripes = (base, line, n, vertical = true) => canvasTex(`st:${base}:${line}:${n}:${vertical}`, 128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = line; for (let i = 0; i < n; i++) { if (vertical) g.fillRect((i * w) / n, 0, w / n / 3, h); else g.fillRect(0, (i * h) / n, w, h / n / 4); } });
const cartonTex = (alert) => canvasTex(`carton:${alert}`, 64, 64, (g) => { g.fillStyle = alert ? '#F08A8A' : '#D9A86A'; g.fillRect(0, 0, 64, 64); g.fillStyle = alert ? '#C25E5E' : '#B9874A'; g.fillRect(27, 0, 10, 64); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, 64, 6); });
const signTex = (text, bg, fg) => canvasTex(`sign:${text}:${bg}:${fg}`, 256, 64, (g, w, h) => { g.fillStyle = bg; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 14); g.fill(); g.fillStyle = fg; g.font = '900 30px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
const pinTex = (n) => canvasTex(`pin:${n}`, 96, 128, (g) => { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 8; g.fillStyle = '#E5484D'; g.beginPath(); g.moveTo(48, 122); g.bezierCurveTo(12, 78, 6, 58, 6, 44); g.arc(48, 44, 42, Math.PI, 0); g.bezierCurveTo(90, 58, 84, 78, 48, 122); g.fill(); g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(48, 44, 25, 0, Math.PI * 2); g.fill(); g.fillStyle = '#E5484D'; g.font = '900 30px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 48, 46); });
const flowTex = (color) => canvasTex(`flow:${color}`, 64, 8, (g) => { g.clearRect(0, 0, 64, 8); g.fillStyle = color; g.beginPath(); g.roundRect(4, 1, 24, 6, 3); g.fill(); });

const mesh = (geo, m, shadow = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; return o; };
// Caja con esquina (x, y) de mundo, tamaño w (x) × d (y) × h, sobre z
const boxAt = (x, y, z, w, d, h, m, r = 0.05) => { const o = mesh(rbox(w, h, d, r), m); o.position.copy(W(x + w / 2, y + d / 2, z + h / 2)); return o; };

// ── Modelos ──────────────────────────────────────────────────────────────────
function warehouse(P, { x, y, w, d, h, roof, doors = 3, logo, rh = 0.55, windows = true }) {
  const g = new THREE.Group();
  g.add(boxAt(x, y, 0, w, d, h, mat(P.wall), 0.04));
  g.add(boxAt(x - 0.02, y - 0.02, 0, w + 0.04, d + 0.04, 0.16, mat(roof, { roughness: 0.5 }), 0.02));
  // techo de dos aguas
  const sh = new THREE.Shape(); sh.moveTo(-d / 2 - 0.14, 0); sh.lineTo(d / 2 + 0.14, 0); sh.lineTo(0, rh); sh.closePath();
  const geo = memo(`roof:${w}:${d}:${rh}`, () => new THREE.ExtrudeGeometry(sh, { depth: w + 0.28, bevelEnabled: false }));
  const rm = mesh(geo, mat(roof, { roughness: 0.45, metalness: 0.15, flatShading: true }));
  rm.rotation.y = Math.PI / 2; rm.position.copy(W(x - 0.14, y + d / 2, h)); g.add(rm);
  // costillas del techo (lado frontal)
  const nr = Math.max(4, Math.round(w / 0.42));
  const slope = Math.atan2(rh, d / 2 + 0.14), len = Math.hypot(rh, d / 2 + 0.14);
  for (let i = 1; i < nr; i++) { const rib = mesh(memo(`rib:${len}`, () => new THREE.BoxGeometry(0.04, 0.03, len)), mat(new THREE.Color(roof).offsetHSL(0, 0, 0.12).getStyle()), false); rib.position.copy(W(x + (i * w) / nr, y + d / 2 + (d / 2 + 0.14) / 2, h + rh / 2 + 0.02)); rib.rotation.x = slope; g.add(rib); }
  const ridge = mesh(memo(`ridge:${w}`, () => new THREE.BoxGeometry(w + 0.32, 0.07, 0.12)), mat(new THREE.Color(roof).offsetHSL(0, 0, 0.18).getStyle()), false); ridge.position.copy(W(x + w / 2, y + d / 2, h + rh + 0.02)); g.add(ridge);
  // puertas de andén en la fachada frontal (y + d)
  const dh = Math.min(1.2, h * 0.68);
  for (let i = 0; i < doors; i++) {
    const dw = Math.min(0.85, (w - 0.6) / doors - 0.18), u = x + 0.35 + (i * (w - 0.5)) / doors;
    g.add(boxAt(u - 0.06, y + d - 0.02, 0, dw + 0.12, 0.08, dh + 0.1, mat(new THREE.Color(roof).offsetHSL(0, 0, -0.08).getStyle()), 0.02));
    const door = mesh(memo(`door:${dw}:${dh}`, () => new THREE.BoxGeometry(dw, dh, 0.04)), new THREE.MeshStandardMaterial({ map: stripes('#DCE3EE', '#B8C2D3', 10, false), roughness: 0.5 }));
    door.position.copy(W(u + dw / 2, y + d + 0.05, dh / 2)); g.add(door);
    g.add(boxAt(u - 0.1, y + d, dh + 0.12, dw + 0.2, 0.32, 0.07, mat(roof), 0.02));
  }
  if (windows) for (let i = 0; i < Math.floor(d / 0.7); i++) g.add(boxAt(x + w - 0.01, y + 0.35 + i * 0.7, h * 0.58, 0.04, 0.42, h * 0.24, mat(P.glass, { emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 1.6 : 0.05, roughness: 0.15, metalness: 0.4 }), 0.01));
  if (w >= 3.3) { // equipos de aire y tragaluces en el techo
    for (let i = 0; i < Math.floor(w / 1.6); i++) { const ux = x + 0.6 + i * 1.6; const ac = boxAt(ux, y + 0.25, h + 0.12, 0.42, 0.36, 0.26, mat('#C9CED8', { metalness: 0.5, roughness: 0.35 }), 0.04); g.add(ac); const fan = mesh(memo('fan', () => new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14)), mat('#3A3A44'), false); fan.position.copy(W(ux + 0.21, y + 0.43, h + 0.4)); g.add(fan); }
    for (let i = 0; i < Math.floor(w / 1.2); i++) { const sk = mesh(memo('sky', () => new THREE.BoxGeometry(0.5, 0.04, 0.3)), mat('#BFE3FF', { roughness: 0.05, metalness: 0.3, emissive: '#BFE3FF', emissiveIntensity: P === PALETTE.dark ? 0.35 : 0.05 }), false); sk.position.copy(W(x + 0.5 + i * 1.2, y + d * 0.72, h + rh * 0.45 + 0.03)); sk.rotation.x = Math.atan2(rh, d / 2 + 0.14); g.add(sk); }
  }
  // topes de andén
  for (let i = 0; i < doors; i++) { const dw = Math.min(0.85, (w - 0.6) / doors - 0.18), u = x + 0.35 + (i * (w - 0.5)) / doors; [u - 0.12, u + dw + 0.04].forEach((bx) => g.add(boxAt(bx, y + d, 0.15, 0.08, 0.1, 0.22, mat('#1F1D26', { roughness: 0.9 }), 0.02))); }
  if (logo) { const s = new THREE.Mesh(memo('signG', () => new THREE.PlaneGeometry(1.3, 0.33)), new THREE.MeshBasicMaterial({ map: signTex(logo, '#FFFFFF', roof), transparent: true })); s.position.copy(W(x + w * 0.5, y + d + 0.07, h - 0.3)); g.add(s); }
  return g;
}
function container(color, L = 1.9) {
  const g = new THREE.Group();
  const m = mesh(memo(`cont:${L}`, () => new THREE.BoxGeometry(L, 0.62, 0.68)), new THREE.MeshStandardMaterial({ map: stripes(color, new THREE.Color(color).offsetHSL(0, 0, -0.1).getStyle(), 18), roughness: 0.55, metalness: 0.2 }));
  m.position.y = 0.31; g.add(m); return g;
}
function truck(color, cont) {
  const g = new THREE.Group();
  const trailerM = cont ? new THREE.MeshStandardMaterial({ map: stripes('#2BB3A8', '#22948B', 18), roughness: 0.5, metalness: 0.2 }) : mat('#FFFFFF', { roughness: 0.35 });
  const tr = mesh(rbox(1.2, 0.74, 0.64, 0.06), trailerM); tr.position.set(-0.26, 0.6, 0); g.add(tr);
  if (!cont) { const st = mesh(rbox(1.21, 0.13, 0.65, 0.02), mat(color)); st.position.set(-0.26, 0.5, 0); g.add(st); }
  const ch = mesh(rbox(1.78, 0.1, 0.5, 0.02), mat('#2A2733')); ch.position.set(-0.05, 0.2, 0); g.add(ch);
  const cab = mesh(rbox(0.5, 0.62, 0.62, 0.1), mat(color, { roughness: 0.35, metalness: 0.2 })); cab.position.set(0.6, 0.53, 0); g.add(cab);
  const ws = mesh(rbox(0.04, 0.24, 0.52, 0.02), mat('#1E2A44', { roughness: 0.1, metalness: 0.6 }), false); ws.position.set(0.86, 0.66, 0); g.add(ws);
  const wg = memo('wheel', () => new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14));
  [[-0.66, 0.29], [-0.66, -0.29], [-0.3, 0.29], [-0.3, -0.29], [0.62, 0.29], [0.62, -0.29]].forEach(([wx, wz]) => { const w = mesh(wg, mat('#16151C', { roughness: 0.9 })); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.15, wz); g.add(w); });
  return g;
}
function ship() {
  const g = new THREE.Group(); const L = 4.4, Wd = 1.15;
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L - 0.9, 0); sh.lineTo(L, Wd / 2); sh.lineTo(L - 0.9, Wd); sh.lineTo(0, Wd); sh.closePath();
  const hull = mesh(memo('hull', () => new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 })), mat('#24467E', { roughness: 0.4, metalness: 0.2 }));
  hull.rotation.x = -Math.PI / 2; hull.position.set(0, -0.15, Wd); g.add(hull);
  const band = mesh(memo('band', () => new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false })), mat('#C2423F'));
  band.rotation.x = -Math.PI / 2; band.position.set(0, -0.2, Wd); band.scale.set(1.01, 1.01, 1); g.add(band);
  const cols = ['#E5484D', '#2BB3A8', '#3B6FE0', '#F2A900', '#7C5CF0', '#2BB3A8'];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) { if (k && (i + j) % 2) continue; const c = container(cols[(i * 2 + j + k) % 6], 0.8); c.scale.set(1, 0.6, 0.62); c.position.set(1.15 + i * 0.86, 0.42 + k * 0.38, 0.32 + j * 0.48); g.add(c); }
  const br = mesh(rbox(0.6, 0.8, 0.8, 0.05), mat('#F4F6FB')); br.position.set(0.42, 0.8, Wd / 2); g.add(br);
  const bw = mesh(rbox(0.62, 0.1, 0.82, 0.02), mat('#1E2A44', { roughness: 0.1, metalness: 0.5 }), false); bw.position.set(0.42, 1.05, Wd / 2); g.add(bw);
  return g;
}
function forklift(withLoad) {
  const g = new THREE.Group();
  const b = mesh(rbox(0.62, 0.34, 0.46, 0.08), mat('#F2B705', { roughness: 0.4 })); b.position.set(0, 0.3, 0); g.add(b);
  const seat = mesh(rbox(0.26, 0.24, 0.3, 0.05), mat('#2A2733')); seat.position.set(-0.05, 0.58, 0); g.add(seat);
  const head = mesh(memo('head', () => new THREE.SphereGeometry(0.09, 12, 10)), mat('#F2C9A0')); head.position.set(-0.05, 0.8, 0); g.add(head);
  const helmet = mesh(memo('helm', () => new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#F2B705')); helmet.position.set(-0.05, 0.84, 0); g.add(helmet);
  [[-0.24, 0.18], [-0.24, -0.18], [0.16, 0.18], [0.16, -0.18]].forEach(([px, pz]) => { const p = mesh(memo('pillar', () => new THREE.BoxGeometry(0.03, 0.55, 0.03)), mat('#2A2733'), false); p.position.set(px, 0.72, pz); g.add(p); });
  const top = mesh(rbox(0.46, 0.04, 0.42, 0.01), mat('#2A2733'), false); top.position.set(-0.04, 1.0, 0); g.add(top);
  const mast = mesh(memo('mast', () => new THREE.BoxGeometry(0.06, 0.95, 0.36)), mat('#6B7280')); mast.position.set(0.36, 0.5, 0); g.add(mast);
  [0.12, -0.12].forEach((pz) => { const f = mesh(memo('fork', () => new THREE.BoxGeometry(0.45, 0.03, 0.06)), mat('#4B5563')); f.position.set(0.6, 0.1, pz); g.add(f); });
  if (withLoad) { const p = pallet(false); p.position.set(0.62, 0.1, 0); g.add(p); }
  const wg = memo('fw', () => new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12));
  [[-0.2, 0.25], [-0.2, -0.25], [0.2, 0.25], [0.2, -0.25]].forEach(([px, pz]) => { const w = mesh(wg, mat('#16151C')); w.rotation.x = Math.PI / 2; w.position.set(px, 0.1, pz); g.add(w); });
  return g;
}
function pallet(alert) {
  const g = new THREE.Group();
  const base = mesh(memo('pb', () => new THREE.BoxGeometry(0.56, 0.08, 0.56)), mat('#A47B4F', { roughness: 0.9 })); base.position.y = 0.04; g.add(base);
  const bx = mesh(rbox(0.5, 0.38, 0.5, 0.03), new THREE.MeshStandardMaterial({ map: cartonTex(alert), roughness: 0.85 })); bx.position.y = 0.27; g.add(bx);
  return g;
}
function tree(P, s = 1) {
  const g = new THREE.Group();
  const tr = mesh(memo('trunk', () => new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8)), mat('#8B6B4A')); tr.position.y = 0.25; g.add(tr);
  const c1 = mesh(memo('crown', () => new THREE.IcosahedronGeometry(0.42, 1)), mat(P.tree, { flatShading: true, roughness: 0.8 })); c1.position.y = 0.78; g.add(c1);
  const c2 = mesh(memo('crown2', () => new THREE.IcosahedronGeometry(0.28, 1)), mat(new THREE.Color(P.tree).offsetHSL(0, 0, 0.06).getStyle(), { flatShading: true, roughness: 0.8 })); c2.position.set(0.12, 1.08, 0.05); g.add(c2);
  g.scale.setScalar(s); return g;
}
// Plaza de tiendas de una zona: local principal con letrero + dos locales chicos
function plaza(P, x, y, name, seed) {
  const g = new THREE.Group(); g.add(store(P, x, y, name));
  const cols = ['#F59E0B', '#14B8A6', '#EC4899', '#3B82F6'];
  [[x + 0.15, y - 1.15, 1.1, 0.85, 0.75], [x + 1.4, y - 1.05, 0.9, 0.75, 0.62]].forEach(([sx, sy, w, d, h], i) => {
    const c = cols[(seed + i) % cols.length];
    g.add(boxAt(sx, sy, 0, w, d, h, mat(P.wall), 0.04));
    g.add(boxAt(sx - 0.03, sy - 0.03, h, w + 0.06, d + 0.06, 0.1, mat(c, { roughness: 0.4 }), 0.03));
    g.add(boxAt(sx + 0.15, sy + d - 0.01, 0.05, w - 0.3, 0.03, h * 0.55, mat(P.glass, { roughness: 0.1, metalness: 0.5, emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 0.45 : 0 }), 0.01));
  });
  return g;
}
function store(P, x, y, name) {
  const g = new THREE.Group(), w = 2.4, d = 1.9, h = 1.05;
  g.add(boxAt(x, y, 0, w, d, h, mat(P.wall), 0.05));
  g.add(boxAt(x - 0.05, y - 0.05, h, w + 0.1, d + 0.1, 0.2, mat('#E0BB3E', { roughness: 0.4 }), 0.04));
  g.add(boxAt(x + 0.25, y + d - 0.01, 0.02, 0.75, 0.04, 0.6, mat(P.glass, { roughness: 0.1, metalness: 0.5, emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 0.4 : 0 }), 0.01));
  g.add(boxAt(x + 1.2, y + d - 0.01, 0.15, 0.95, 0.04, 0.47, mat(P.glass, { roughness: 0.1, metalness: 0.5, emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 0.4 : 0 }), 0.01));
  const aw = mesh(memo('awn', () => new THREE.BoxGeometry(w - 0.1, 0.03, 0.45)), new THREE.MeshStandardMaterial({ map: stripes('#7C5CF0', '#FFFFFF', 8), roughness: 0.6 }));
  aw.position.copy(W(x + w / 2, y + d + 0.2, h * 0.68)); aw.rotation.x = 0.45; g.add(aw);
  const s = new THREE.Mesh(memo('signS', () => new THREE.PlaneGeometry(1.6, 0.36)), new THREE.MeshBasicMaterial({ map: signTex(name, '#7C5CF0', '#FFFFFF'), transparent: true }));
  s.position.copy(W(x + w / 2, y + d + 0.06, h + 0.08)); g.add(s);
  return g;
}
function factory(P) {
  const n = N.PROV, g = new THREE.Group();
  g.add(boxAt(n.x, n.y, 0, n.w, n.d, n.h, mat(P === PALETTE.dark ? '#B9B3CC' : '#C9D1DE'), 0.04));
  for (let i = 0; i < 4; i++) {
    const x0 = n.x + i * (n.w / 4), sw = n.w / 4;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(sw, 0); sh.lineTo(sw, 0.6); sh.closePath();
    const st = mesh(memo('saw', () => new THREE.ExtrudeGeometry(sh, { depth: n.d, bevelEnabled: false })), mat(P === PALETTE.dark ? '#7A6FA8' : '#8FA2C0', { flatShading: true }));
    st.position.copy(W(x0, n.y, n.h)); g.add(st);
    g.add(boxAt(x0 + sw - 0.03, n.y + 0.05, n.h + 0.04, 0.03, n.d - 0.1, 0.5, mat(P.glass, { emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 0.5 : 0.05, roughness: 0.1 }), 0.005));
  }
  const ch = mesh(memo('chim', () => new THREE.CylinderGeometry(0.22, 0.28, n.h + 1.8, 16)), mat('#9AA4B6')); ch.position.copy(W(n.x + 0.55, n.y + 0.5, (n.h + 1.8) / 2)); g.add(ch);
  const band = mesh(memo('chimb', () => new THREE.CylinderGeometry(0.235, 0.235, 0.18, 16)), mat('#E5484D')); band.position.copy(W(n.x + 0.55, n.y + 0.5, n.h + 1.55)); g.add(band);
  for (let i = 0; i < 3; i++) g.add(boxAt(n.x + 0.5 + i, n.y + n.d - 0.01, 0.45, 0.6, 0.04, 0.5, mat(P.glass, { emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 0.5 : 0.05, roughness: 0.1 }), 0.01));
  return g;
}

export default function Scene3D({ isDark, zonas, ciudades, stats, fTipo, selKey, site, panelOpen, play, onPick, zoomCmd, semaforo }) {
  const host = useRef(null);
  const st = useRef({});
  const props = useRef({});
  props.current = { onPick, play };

  // ── Montaje: renderer, cámara, controles, loop ──
  useEffect(() => {
    const el = host.current; const S = st.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const composer = new EffectComposer(renderer);
    const labels = new CSS2DRenderer(); labels.domElement.style.position = 'absolute'; labels.domElement.style.inset = '0'; labels.domElement.style.pointerEvents = 'none'; el.appendChild(labels.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
    const ctr = W(SITES.RED.x, SITES.RED.y, 0);
    cam.position.copy(ctr).add(new THREE.Vector3(1, 1.08, 1).normalize().multiplyScalar(80)); cam.zoom = 1.15;
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.copy(ctr); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;
    controls.minZoom = 0.6; controls.maxZoom = 5; controls.minPolarAngle = 0.45; controls.maxPolarAngle = 1.2;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45; // luz ambiental suave
    const hemi = new THREE.HemisphereLight('#ffffff', '#5a5470', 1); scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff6e8', 1.8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight('#b9a8ff', 0.35); fill.position.set(40, 20, -30); scene.add(fill);
    const staticG = new THREE.Group(), dynG = new THREE.Group(); scene.add(staticG, dynG);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.4, 1.2); composer.addPass(bloom); composer.addPass(new OutputPass());
    Object.assign(S, { renderer, labels, scene, cam, controls, hemi, sun, staticG, dynG, anim: [], movers: [], t: 0, labelEls: [], detail: null, composer, bloom });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight, a = w / h, vs = 30; cam.left = (-vs * a) / 2; cam.right = (vs * a) / 2; cam.top = vs / 2; cam.bottom = -vs / 2; cam.updateProjectionMatrix(); renderer.setSize(w, h); labels.setSize(w, h); S.composer?.setSize(w, h); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // Clic sin arrastre → raycast al objeto con userData.pick
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
    const onDown = (e) => { down = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects([staticG, dynG], true).find((h) => { let o = h.object; while (o && !o.userData.pick) o = o.parent; return o; });
      if (hit) { let o = hit.object; while (o && !o.userData.pick) o = o.parent; props.current.onPick?.(o.userData.pick); }
    };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);

    let raf, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (props.current.play) S.t += dt;
      const t = S.t;
      if (S.tween) { const k = Math.min(1, (now - S.tween.t0) / 700), e = 1 - Math.pow(1 - k, 3); controls.target.lerpVectors(S.tween.a, S.tween.b, e); cam.position.copy(controls.target).add(S.tween.off); cam.zoom = S.tween.za + (S.tween.zb - S.tween.za) * e; cam.updateProjectionMatrix(); if (k >= 1) S.tween = null; }
      const moved = controls.update();
      // En pausa solo se dibuja si la cámara se movió o cambió la escena (ahorra batería)
      if (!props.current.play && !S.tween && !moved && !S.dirty && S.frame > 2) { raf = requestAnimationFrame(loop); return; }
      S.dirty = false;
      // Monitor de rendimiento: si va lento, quita el brillo y baja la resolución
      S.fpsAcc = (S.fpsAcc || 0) + dt; S.fpsN = (S.fpsN || 0) + 1;
      if (S.fpsAcc > 3) { const fps = S.fpsN / S.fpsAcc; if (fps < 32 && !S.lowPerf) { S.lowPerf = true; if (S.bloom) S.bloom.enabled = false; renderer.setPixelRatio(1); resize(); } S.fpsAcc = 0; S.fpsN = 0; }
      S.anim.forEach((f) => f(t, dt));
      // detalle de etiquetas según zoom
      const det = cam.zoom > 1.55; if (det !== S.detail) { S.detail = det; S.labelEls.forEach((l) => l.setDetail(det)); S.frame = 0; }
      // Etiquetas sin encimarse: por prioridad (seleccionada > con atorados > con más piezas); las que chocan se ocultan
      if ((S.frame = (S.frame || 0) + 1) % 12 === 1) {
        const r = el.getBoundingClientRect(), v = new THREE.Vector3();
        // los paneles del HUD (KPIs, rutas, controles, panel lateral) cuentan como ocupados
        const placed = [...(el.parentElement?.querySelectorAll('[data-hud]') || [])].map((h) => { const b = h.getBoundingClientRect(); return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height }; });
        [...S.labelEls].sort((a, b) => b.pri - a.pri).forEach((l) => {
          if (!l.obj.visible) return;
          v.copy(l.obj.position).project(cam); const w = l.el.offsetWidth || 80, h = l.el.offsetHeight || 22;
          const x = (v.x + 1) / 2 * r.width - w / 2, y = (1 - v.y) / 2 * r.height - h - 14;
          const hit = placed.some((p) => x < p.x + p.w + 4 && x + w + 4 > p.x && y < p.y + p.h + 3 && y + h + 3 > p.y);
          l.el.style.visibility = hit ? 'hidden' : 'visible'; if (!hit) placed.push({ x, y, w, h });
        });
      }
      sun.position.copy(controls.target).add(new THREE.Vector3(-18, 34, 14)); sun.target.position.copy(controls.target);
      if (S.bloom?.enabled) S.composer.render(); else renderer.render(scene, cam);
      labels.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ''; };
  }, []);

  // ── Escena estática (piso, caminos, edificios) ──
  useEffect(() => {
    const S = st.current; if (!S.scene) return;
    const P = isDark ? PALETTE.dark : PALETTE.light;
    S.renderer.setClearColor(P.bg); S.scene.fog = new THREE.Fog(P.bg, 90, 200);
    if (S.bloom) S.bloom.enabled = isDark && !S.lowPerf; // brillo de ventanas y postes solo de noche
    S.dirty = true;
    S.hemi.intensity = P.hemi; S.hemi.groundColor.set(isDark ? '#3a3350' : '#b9c3d6'); S.sun.intensity = P.sun;
    const G = S.staticG; while (G.children.length) G.remove(G.children[0]);
    S.anim = S.anim.filter((f) => !f.isStatic);
    const zs = zonas.map((z, i) => ({ z, ...zonaPos(i) })), cs = ciudades.map((c, i) => ({ c, ...ciudadPos(i) }));
    const yBot = Math.max(17, Math.max(...zs.map((p) => p.y)) + 3); // mínimo para que el piso cubra agua y árboles
    const pick = (o, k) => { o.userData.pick = k; o.traverse((c) => { c.userData.pickParent = k; }); return o; };
    const addAnim = (f) => { f.isStatic = true; S.anim.push(f); };
    // piso
    const plate = boxAt(-16, -17, -0.4, 46, yBot + 19, 0.4, mat(P.plate, { roughness: 0.95 }), 0.3); plate.castShadow = false; G.add(plate);
    [[-5, -16.5, 10, 9.7, P.grass], [7.2, -16.5, 12.4, 6.5, P.grass], [7.2, 5.8, 12.4, yBot - 4.8, P.grass2], [21.3, -16.5, 5.1, 12.5, P.grass]].forEach(([x, y, w, d, c]) => { const o = boxAt(x, y, 0, w, d, 0.05, mat(c, { roughness: 1 }), 0.08); o.castShadow = false; G.add(o); });
    [[-3.4, 0.6, 8.6, 5.8], [7.2, -4, 12.2, 7.8], [7.6, -10, 9.4, 3.4], [-2.4, -10.6, 6, 4.2]].forEach(([x, y, w, d]) => { const o = boxAt(x, y, 0, w, d, 0.07, mat(P.pad, { roughness: 0.9 }), 0.05); o.castShadow = false; G.add(o); });
    for (let i = 0; i < 10; i++) { const o = boxAt(8.4 + i * 1.05, 2.4, 0.07, 0.05, 1.2, 0.01, mat(P.padLine, { roughness: 0.6 }), 0); o.castShadow = false; G.add(o); }
    { const o = boxAt(8.4, 2.38, 0.07, 10.5, 0.05, 0.01, mat(P.padLine), 0); o.castShadow = false; G.add(o); }
    // agua con oleaje
    const wg = new THREE.PlaneGeometry(21.2, yBot - 4.4, 48, 36); wg.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.6, metalness: 0, envMapIntensity: 0.15, flatShading: true, transparent: true, opacity: 0.96 }));
    water.position.copy(W(-16 + 10.6, 6.4 + (yBot - 4.4) / 2, 0.16)); water.receiveShadow = true; G.add(water);
    const base = wg.attributes.position.array.slice();
    addAnim((t) => { const a = wg.attributes.position.array; for (let i = 0; i < a.length; i += 3) a[i + 1] = base[i + 1] + Math.sin(base[i] * 0.9 + t * 1.4) * 0.05 + Math.cos(base[i + 2] * 1.1 + t * 1.1) * 0.04; wg.attributes.position.needsUpdate = true; wg.computeVertexNormals(); });
    const quay = boxAt(-3.4, 6.2, -0.4, 8.6, 0.3, 0.47, mat(isDark ? '#3A3350' : '#B9C3D3'), 0.04); G.add(quay);
    // caminos + líneas
    const roads = roadsFor(zs, cs, yBot);
    const dashes = [];
    roads.forEach(([a, b]) => {
      const vert = a[0] === b[0], x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const o = vert ? boxAt(a[0] - 0.55, y0 - 0.55, 0, 1.1, y1 - y0 + 1.1, 0.06, mat(P.road, { roughness: 0.92 }), 0.02) : boxAt(x0 - 0.55, a[1] - 0.55, 0, x1 - x0 + 1.1, 1.1, 0.06, mat(P.road, { roughness: 0.92 }), 0.02);
      o.castShadow = false; G.add(o);
      const L = vert ? y1 - y0 : x1 - x0;
      for (let s = 0.4; s < L - 0.2; s += 0.9) dashes.push(vert ? [a[0], y0 + s, true] : [x0 + s, a[1], false]);
    });
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.012, 0.07), mat(P.line, { roughness: 0.5 }), dashes.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    dashes.forEach(([x, y, v], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v ? Math.PI / 2 : 0); m4.compose(W(x, y, 0.066), q, sc); dm.setMatrixAt(i, m4); }); dm.receiveShadow = true; G.add(dm);
    // edificios
    G.add(pick(factory(P), 'PROV'));
    G.add(pick(warehouse(P, { ...N.ADUANA, roof: '#E2A93B', doors: 2, logo: 'ADUANA', rh: 0.42, windows: false }), 'ADU'));
    G.add(pick(warehouse(P, { ...N.ALM, roof: P.roofA, doors: 4, logo: 'PLAN · ALMACÉN' }), 'ALM'));
    G.add(pick(warehouse(P, { ...N.XD, roof: P.roofX, doors: 3, logo: 'CROSS DOCK', rh: 0.38 }), 'XD'));
    G.add(pick(warehouse(P, { ...N.FUL, roof: '#14B8A6', doors: 2, logo: 'FULFILLMENT', rh: 0.42 }), 'FUL'));
    { // foro
      const n = N.FORO, g = new THREE.Group();
      g.add(boxAt(n.x, n.y, 0, n.w, n.d, n.h, mat(P.wall), 0.05));
      g.add(boxAt(n.x - 0.04, n.y - 0.04, n.h, n.w + 0.08, n.d + 0.08, 0.16, mat('#EC4899', { roughness: 0.4 }), 0.04));
      const s = new THREE.Mesh(memo('signF', () => new THREE.PlaneGeometry(1.7, 0.36)), new THREE.MeshBasicMaterial({ map: signTex('FORO FOTO', '#EC4899', '#FFFFFF'), transparent: true })); s.position.copy(W(n.x + n.w / 2, n.y + n.d + 0.04, n.h - 0.32)); g.add(s);
      g.add(boxAt(n.x + 1.5, n.y + n.d - 0.01, 0, 0.6, 0.04, 0.55, mat(P.glass, { roughness: 0.1, metalness: 0.5 }), 0.01));
      [[n.x - 0.6, n.y + 0.4], [n.x - 0.6, n.y + 1.5]].forEach(([fx, fy]) => { g.add(boxAt(fx, fy, 0, 0.06, 0.06, 0.95, mat('#6B7280'), 0.01)); g.add(boxAt(fx - 0.14, fy - 0.12, 0.95, 0.32, 0.3, 0.24, mat('#1F2430'), 0.04)); });
      const flash = new THREE.PointLight('#ffffff', 0, 6); flash.position.copy(W(n.x + n.w / 2, n.y + n.d + 0.6, n.h + 0.5)); g.add(flash);
      addAnim((t) => { flash.intensity = Math.sin(t * 2.3) > 0.94 ? 18 : 0; });
      G.add(pick(g, 'FORO'));
    }
    cs.forEach(({ c, x, y }) => G.add(pick(warehouse(P, { x, y, w: 2.4, d: 1.8, h: 1.1, roof: '#0EA5E9', doors: 2, rh: 0.36, windows: false, logo: c === 'REGIONAL' ? 'REGIONAL' : c.slice(0, 11) }), `CIU|${c}`)));
    zs.forEach(({ z, x, y }, i) => G.add(pick(plaza(P, x, y, z === 'TIENDAS' ? 'TIENDAS' : z, i), `Z|${z}`)));
    // patio de contenedores y grúa
    const cols = ['#2BB3A8', '#E5484D', '#3B6FE0', '#F2A900', '#7C5CF0', '#2BB3A8', '#3B6FE0', '#E5484D'];
    for (let i = 0; i < 8; i++) { const r = i % 2, l = Math.floor(i / 4); const c = container(cols[i]); c.position.copy(W(2.7 + 0.95, 1.4 + r * 0.76 + (i % 4 >= 2 ? 1.7 : 0) + 0.34, l * 0.64)); G.add(c); }
    const crane = new THREE.Group(); const gx = -1.6, gy = 5.5;
    [[gx, gy], [gx + 2.6, gy], [gx, gy - 1.3], [gx + 2.6, gy - 1.3]].forEach(([x, y]) => crane.add(boxAt(x, y, 0, 0.16, 0.16, 2.7, mat('#F2B705', { roughness: 0.4, metalness: 0.3 }), 0.02)));
    crane.add(boxAt(gx, gy - 1.3, 2.7, 2.76, 1.46, 0.2, mat('#F2B705', { roughness: 0.4, metalness: 0.3 }), 0.03));
    const trolley = boxAt(gx + 0.8, gy - 1.0, 2.3, 0.55, 0.8, 0.38, mat('#3A3A44'), 0.04); crane.add(trolley);
    const spreader = container('#E5484D', 1.2); spreader.scale.set(1, 0.8, 0.8); crane.add(spreader);
    addAnim((t) => { const f = (Math.sin(t * 0.5) + 1) / 2; trolley.position.x = gx + 0.6 + f * 1.6; spreader.position.set(trolley.position.x, 1.1 + Math.abs(Math.sin(t * 0.5)) * 0.9, trolley.position.z); });
    G.add(crane);
    // racks junto al almacén
    const a = N.ALM;
    for (let l = 0; l < 3; l++) { G.add(boxAt(a.x + 0.2, a.y - 1.0, l * 0.56, 2.3, 0.62, 0.06, mat('#E5484D', { metalness: 0.3 }), 0.01)); for (let i = 0; i < 3; i++) { const p = pallet(false); p.position.copy(W(a.x + 0.55 + i * 0.75, a.y - 0.7, l * 0.56 + 0.06)); G.add(p); } }
    [[a.x + 0.2, a.y - 1.0], [a.x + 2.44, a.y - 1.0], [a.x + 0.2, a.y - 0.44], [a.x + 2.44, a.y - 0.44]].forEach(([x, y]) => G.add(boxAt(x, y, 0, 0.06, 0.06, 1.7, mat('#3B6FE0', { metalness: 0.3 }), 0.01)));
    // banda transportadora del fulfillment
    const f = N.FUL, bx = f.x + f.w + 0.25, by = f.y + 0.6;
    G.add(boxAt(bx, by, 0, 2.5, 0.55, 0.32, mat('#4B5563', { metalness: 0.3 }), 0.04));
    const belt = []; for (let i = 0; i < 4; i++) { const b = mesh(rbox(0.32, 0.26, 0.32, 0.03), new THREE.MeshStandardMaterial({ map: cartonTex(false), roughness: 0.85 })); G.add(b); belt.push(b); }
    addAnim((t) => belt.forEach((b, i) => { const u = ((t * 0.3 + i / 4) % 1) * 2.2; b.position.copy(W(bx + 0.15 + u, by + 0.27, 0.45)); }));
    // humo de la chimenea
    const smoke = []; for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(memo('smk', () => new THREE.SphereGeometry(0.22, 10, 8)), new THREE.MeshStandardMaterial({ color: isDark ? '#9B95AE' : '#E3E7EE', transparent: true, opacity: 0.6, roughness: 1 })); G.add(s); smoke.push(s); }
    addAnim((t) => smoke.forEach((s, i) => { const ph = (t * 0.25 + i / 6) % 1; s.position.copy(W(N.PROV.x + 0.55 + ph * 1.2, N.PROV.y + 0.5 - ph * 0.4, N.PROV.h + 1.9 + ph * 2.2)); s.scale.setScalar(0.6 + ph * 1.8); s.material.opacity = 0.65 * (1 - ph); }));
    // montacargas
    const fk1 = forklift(true), fk2 = forklift(false); G.add(fk1, fk2);
    addAnim((t) => { const u = (Math.sin(t * 0.8) + 1) / 2; fk1.position.copy(W(a.x + 0.6 + u * 3.2, a.y + a.d + 1.7, 0)); fk1.rotation.y = Math.cos(t * 0.8) > 0 ? 0 : Math.PI; const v = (Math.sin(t * 0.6 + 2) + 1) / 2; fk2.position.copy(W(N.XD.x + 0.4 + v * 2.4, N.XD.y + N.XD.d + 1.75, 0)); fk2.rotation.y = Math.cos(t * 0.6 + 2) > 0 ? 0 : Math.PI; });
    // árboles y autos
    [[-4, -14], [-3.6, -8], [3.8, -12.5], [4.2, -2.5], [2.8, -1.4], [8, -12.5], [11, -13.4], [15, -12.8], [18.5, -13.4], [9, 7.5], [12, 8.6], [16, 7.2], [18.6, 10.4], [24.6, -4.6], [-4.6, -3], [21.2, 15], [10.5, 12], [14.5, 14]].forEach(([x, y], i) => { const tr = tree(P, 0.85 + ((i * 37) % 10) / 22); tr.position.copy(W(x, y, 0.05)); tr.rotation.y = i; G.add(tr); });
    // postes de luz a lo largo de los caminos principales
    const bulbM = mat('#FFE9A8', { emissive: '#FFD66B', emissiveIntensity: isDark ? 4 : 0.4 });
    [[5.2, -9], [5.2, -2], [5.2, 3], [10, -4.9], [16, -4.9], [19.7, 0], [19.7, 6], [19.7, 12], [2.5, 5.7], [19.7, -9]].forEach(([lx, ly]) => {
      G.add(boxAt(lx, ly, 0, 0.07, 0.07, 1.5, mat('#4B5563', { metalness: 0.5 }), 0.01));
      G.add(boxAt(lx, ly, 1.45, 0.32, 0.07, 0.05, mat('#4B5563', { metalness: 0.5 }), 0.01));
      const b = mesh(memo('bulb', () => new THREE.SphereGeometry(0.07, 10, 8)), bulbM, false); b.position.copy(W(lx + 0.3, ly + 0.035, 1.4)); G.add(b);
    });
    // arbustos junto a las plataformas
    [[7.4, -4.4], [8.4, -4.4], [9.4, -4.4], [17.6, -4.4], [18.6, -4.4], [-2.2, -6.2], [3.2, -6.2], [7.8, 3.9], [18.9, 3.9]].forEach(([bx, by], i) => { const b = mesh(memo('bush', () => new THREE.IcosahedronGeometry(0.26, 1)), mat(new THREE.Color(P.tree).offsetHSL(0, 0, -0.04).getStyle(), { flatShading: true, roughness: 0.9 })); b.position.copy(W(bx, by, 0.18)); b.scale.set(1.2, 0.8, 1); b.rotation.y = i; G.add(b); });
    [[10.2, '#E5484D'], [11.4, '#F4F6FB'], [12.6, '#3B82F6'], [13.8, '#E0BB3E']].forEach(([px, col]) => { const car = new THREE.Group(); const b1 = mesh(rbox(0.85, 0.24, 0.45, 0.08), mat(col, { roughness: 0.3, metalness: 0.3 })); b1.position.y = 0.2; car.add(b1); const b2 = mesh(rbox(0.48, 0.2, 0.4, 0.07), mat('#1E2A44', { roughness: 0.1, metalness: 0.6 })); b2.position.set(-0.05, 0.38, 0); car.add(b2); car.rotation.y = Math.PI / 2; car.position.copy(W(px, 6.7, 0.06)); G.add(car); });
  }, [isDark, zonas.join('|'), ciudades.join('|')]);

  // ── Capa dinámica (tarimas, pines, etiquetas, vehículos, rutas) ──
  useEffect(() => {
    const S = st.current; if (!S.scene) return;
    const P = isDark ? PALETTE.dark : PALETTE.light;
    const G = S.dynG; while (G.children.length) G.remove(G.children[0]);
    S.dirty = true;
    S.anim = S.anim.filter((f) => f.isStatic); S.labelEls = []; S.detail = null;
    const cnt = (k) => stats[k] || { n: 0, pzs: 0, ator: 0 };
    const hl = (tp) => (!fTipo || fTipo === tp ? 1 : 0.12);
    const zs = zonas.map((z, i) => ({ z, ...zonaPos(i) })), cs = ciudades.map((c, i) => ({ c, ...ciudadPos(i) }));
    const add = (o, k) => { if (k) o.userData.pick = k; G.add(o); return o; };
    const anim = (f) => S.anim.push(f);
    const label = (key, x, y, z, title, sub, color, n = 1, ator = 0, pzs = 0, grp = '') => {
      const el = document.createElement('div'); const active = selKey === key; const idle = !n;
      el.style.cssText = `pointer-events:auto;cursor:pointer;background:${active ? (isDark ? 'rgba(58,47,85,0.96)' : 'rgba(238,243,255,0.98)') : P.card};border:1px solid ${active ? color : P.cardB};border-radius:10px;padding:4px 9px;font-family:Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.18);white-space:nowrap;transform:translateY(-14px);backdrop-filter:blur(6px);opacity:${idle && !active ? (isDark ? 0.72 : 1) : 1};`;
      const sh = (sub || '').split(' · ')[0];
      el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:${idle && !isDark ? '#374151' : P.text}"><span style="width:7px;height:7px;border-radius:9px;background:${color}"></span>${title}<span class="sm" style="font-weight:600;color:${P.sub}">${sh}</span></div><div class="lg" style="font-size:9.5px;color:${P.sub};margin-top:1px">${sub || ''}</div>`;
      el.onclick = (e) => { e.stopPropagation(); props.current.onPick?.(key); };
      const o = new CSS2DObject(el); o.position.copy(W(x, y, z)); G.add(o);
      const sm = el.querySelector('.sm'), lg = el.querySelector('.lg');
      const setDetail = (d) => {
        const on = (d || active) && !idle; lg.style.display = on ? 'block' : 'none'; sm.style.display = on || idle ? 'none' : 'inline';
        // zonas: en vista general solo la etiqueta agrupada 'Tiendas'; con zoom o selección, una por zona
        if (grp === 'zona') o.visible = !!(d || active || selKey.startsWith('Z|')); // CSS2DRenderer controla display según .visible
        if (grp === 'agg') o.visible = !(d || selKey.startsWith('Z|'));
      };
      S.labelEls.push({ setDetail, el, obj: o, pri: active ? 1e9 : idle ? -1 : ator * 1000 + pzs });
    };
    const pin = (n, x, y, z, key) => { if (!n) return; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex(n), depthTest: false })); sp.scale.set(0.62, 0.83, 1); if (key) sp.userData.pick = key; sp.center.set(0.5, 0); sp.renderOrder = 10; G.add(sp); anim((t) => { sp.position.copy(W(x, y, z + 0.15 + Math.abs(Math.sin(t * 2.6 + x)) * 0.35)); }); };
    const stack = (x0, y0, pzs, alert, cols = 3) => { const n = pzs > 0 ? Math.min(14, Math.max(1, Math.round(Math.log2(pzs / 60 + 1) * 2.4))) : 0; for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols) % 2, l = Math.floor(i / (cols * 2)); const p = pallet(alert); p.position.copy(W(x0 + c * 0.68 + 0.28, y0 + r * 0.68 + 0.28, 0.07 + l * 0.46)); G.add(p); } };
    const SM = semaforo?.nodo || { riesgo: 0.05, atorado: 0.2 };
    const halo = (x, y, w, d, c) => { // anillo en el piso: verde OK · ámbar riesgo · rojo atorado (pulsa)
      if (!c.n) return; const sh = c.ator / c.n; const col = sh >= SM.atorado ? '#E5484D' : sh >= SM.riesgo ? '#F59E0B' : '#22C55E';
      const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false });
      const o = new THREE.Mesh(rbox(w + 1.1, 0.02, d + 1.1, 0.4), m); o.position.copy(W(x + w / 2, y + d / 2, 0.09)); o.renderOrder = 2; G.add(o);
      if (sh >= SM.atorado) anim((t) => { m.opacity = 0.22 + (Math.sin(t * 3.5) + 1) * 0.16; });
    };
    const ring = (x, y, w, d) => { const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: isDark ? '#A78BFA' : '#3B6FE0', transparent: true, opacity: 0.8 }); [[x - 0.25, y - 0.25, w + 0.5, 0.08], [x - 0.25, y + d + 0.17, w + 0.5, 0.08], [x - 0.25, y - 0.25, 0.08, d + 0.5], [x + w + 0.17, y - 0.25, 0.08, d + 0.5]].forEach(([a, b, c, e]) => { const s = new THREE.Mesh(new THREE.BoxGeometry(c, 0.02, e), m); s.position.copy(W(a + c / 2, b + e / 2, 0.1)); g.add(s); }); G.add(g); anim((t) => { m.opacity = 0.45 + Math.sin(t * 4) * 0.35; }); };

    // nodos fijos
    const nodes = [
      ['PROV', 'PROVEEDOR', N.PROV, 'Proveedores', 'pzs on order', '#64748B', 2.4],
      ['ADU', 'ADUANA', N.ADUANA, 'Aduana · Puerto', 'pzs', '#E2A93B', 1.9],
      ['ALM', 'ALMACEN', N.ALM, 'PLAN · Almacén', 'pzs en bodega', P.roofA, 3.1],
      ['XD', 'CROSSDOCK', N.XD, 'PLAN · Cross dock', 'pzs in process', P.roofX, 2.2],
      ['FORO', 'FORO', N.FORO, 'Foro fotográfico', 'pzs', '#EC4899', 1.8],
      ['FUL', 'FULFILLMENT', N.FUL, 'Fulfillment', 'pzs', '#14B8A6', 2.3],
    ];
    nodes.forEach(([key, sk, n, title, unit, color, lz]) => {
      const c = cnt(sk);
      label(key, n.x + n.w / 2, n.y + n.d / 2, n.h + lz, title, c.n ? `${c.ocs} OCs · ${fk(c.pzs)} ${unit}${c.ator ? ` · ${fk(c.pzsAtor || 0)} pzs atoradas` : ''}` : 'Sin pedidos', color, c.n, c.ator, c.pzs);
      pin(c.ator ? fk(c.pzsAtor || 0) : 0, n.x + n.w, n.y + n.d / 2, n.h + 0.6, key);
      halo(n.x, n.y, n.w, n.d, c);
      if (selKey === key) ring(n.x, n.y, n.w, n.d);
    });
    stack(N.PROV.x, N.PROV.y + N.PROV.d + 0.35, cnt('PROVEEDOR').pzs, cnt('PROVEEDOR').ator > 0, 4);
    stack(3.0, 4.5, cnt('ADUANA').pzs * 0.4, cnt('ADUANA').ator > 0, 3);
    stack(N.ALM.x + 0.2, N.ALM.y + N.ALM.d + 0.3, cnt('ALMACEN').pzs, cnt('ALMACEN').ator > 0, 5);
    stack(N.XD.x + 0.1, N.XD.y + N.XD.d + 0.3, cnt('CROSSDOCK').pzs, cnt('CROSSDOCK').ator > 0, 4);
    stack(N.FORO.x + N.FORO.w + 0.2, N.FORO.y + 0.2, cnt('FORO').pzs, cnt('FORO').ator > 0, 2);
    const cT = cnt('TRANSITO_INT');
    const cPI = cnt('PROVEEDOR|IMP');
    // Importación en el mar solo cuenta OCs con embarque; las que siguen con proveedor están en el nodo Proveedores
    const cA = cnt('ADUANA'), mN = cT.n + cA.n, mOcs = (cT.ocs || 0) + (cA.ocs || 0);
    label('MAR', -9, 9.6, 1.9, mN ? 'Importación' : 'Importación · sin datos de embarque', mN ? `${mOcs} OCs en tránsito/aduana · ${fk(cT.pzs + cA.pzs)} pzs` : '', TIPO_C.IMP, mN, cT.ator + cA.ator, cT.pzs + cA.pzs); pin(cT.ator + cA.ator ? fk((cT.pzsAtor || 0) + (cA.pzsAtor || 0)) : 0, -7, 9.7, 1.4, 'MAR');
    cs.forEach(({ c, x, y }) => { const k = `CIU|${c}`, s = cnt(`BODEGA_REG|${c}`); label(k, x + 1.2, y + 0.9, 2.1, c === 'REGIONAL' ? 'Bodegas regionales' : `Bodega ${c[0]}${c.slice(1).toLowerCase()}`, s.n ? `${s.ocs} OCs · ${fk(s.pzs)} pzs` : 'Sin inventario', '#0EA5E9', s.n, s.ator, s.pzs); pin(s.ator ? fk(s.pzsAtor || 0) : 0, x + 2.4, y + 0.9, 1.5, k); halo(x, y, 2.4, 1.8, s); stack(x + 2.75, y + 0.15, s.pzs, s.ator > 0, 2); if (selKey === k) ring(x, y, 2.4, 1.8); });
    zs.forEach(({ z, x, y }) => { const k = `Z|${z}`, sT = cnt(`TIENDA|${z}`), sR = cnt(`RECIBIDO|${z}`), sRu = cnt(`TRANSITO_TDA|${z}`); label(k, x + 1.2, y + 0.95, 1.9, z === 'TIENDAS' ? 'Tiendas' : `Zona ${z}`, `${sRu.n} en ruta · ${fk(sT.pzs)} pzs sin entrada · ${sR.n} recibidos`, '#F59E0B', sT.n + sRu.n + sR.n, sT.ator + sRu.ator, sT.pzs + sRu.pzs, 'zona'); pin(sT.ator + sRu.ator ? fk((sT.pzsAtor || 0) + (sRu.pzsAtor || 0)) : 0, x + 2.4, y + 0.95, 1.4, k); halo(x - 1.45, y - 1.2, 3.85, 3.0, { n: sT.n + sRu.n, ator: sT.ator + sRu.ator }); stack(x - 1.5, y + 0.15, sT.pzs, sT.ator > 0, 2); if (selKey === k) ring(x, y, 2.4, 1.9); });

    { // etiqueta agrupada de todas las zonas (vista general)
      const tot = zs.reduce((a, { z }) => { const r = cnt(`TRANSITO_TDA|${z}`), ti = cnt(`TIENDA|${z}`), re = cnt(`RECIBIDO|${z}`); a.ru += r.n; a.ti += ti.pzs; a.re += re.n; a.at += r.ator + ti.ator; a.n += r.n + ti.n + re.n; return a; }, { ru: 0, ti: 0, re: 0, at: 0, n: 0 });
      const mid = zs[Math.floor((zs.length - 1) / 2)] || { x: 23.2, y: 0 };
      label('ZAGG', mid.x + 1.2, mid.y + 0.95, 2.6, `Tiendas · ${fmtN(tot.ru)} en ruta`, `${zs.length} zonas · ${fk(tot.ti)} pzs sin entrada · ${fmtN(tot.re)} recibidos`, '#F59E0B', tot.n, tot.at, tot.ru, 'agg');
    }
    // rutas de color (tubo con flujo animado)
    const route = (path, color, op, vol = 0.3) => {
      const cp = new THREE.CurvePath(); for (let i = 0; i < path.length - 1; i++) cp.add(new THREE.LineCurve3(W(path[i][0], path[i][1], 0.1), W(path[i + 1][0], path[i + 1][1], 0.1)));
      const len = cp.getLength(); const tex = flowTex(color).clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(len / 0.9, 1);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(8, path.length * 24), 0.035 + 0.09 * Math.sqrt(Math.min(1, vol)), 6, false), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false }));
      G.add(tube); anim((t) => { tex.offset.x = -t * 0.9; });
    };
    // grosor proporcional al volumen activo de cada ruta
    const vIMP = cnt('PROVEEDOR|IMP').n + cT.n + cnt('ADUANA').n, vNAC = cnt('PROVEEDOR|NAC').n, vDIR = cnt('PROVEEDOR|DIR').n;
    const vTot = Math.max(1, vIMP + vNAC + vDIR), vOutTot = Math.max(1, zs.reduce((a, p) => a + cnt(`TRANSITO_TDA|${p.z}`).n, 0));
    route(paths.SHIP, TIPO_C.IMP, hl('IMP'), vIMP / vTot); route(paths.IMP, TIPO_C.IMP, hl('IMP'), vIMP / vTot); route(paths.NAC, TIPO_C.NAC, hl('NAC'), vNAC / vTot);
    zs.forEach((p) => { route(paths.DIR(p.y), TIPO_C.DIR, hl('DIR'), Math.max(0.02, vDIR / vTot)); route(paths.OUT(p.y), '#8B6CF6', fTipo === 'DIR' ? 0.12 : 0.9, cnt(`TRANSITO_TDA|${p.z}`).n / vOutTot); });

    // vehículos
    const lane = (path, n, speed, color, op, cont, key) => {
      for (let i = 0; i < n; i++) {
        const tk = truck(color, cont); if (op < 1) tk.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = op; } });
        add(tk, key);
        anim((t) => { const p = pathAt(path, ((t * speed) + i / n) % 1); tk.position.copy(W(p.x, p.y, 0.06)); tk.rotation.y = -p.ang; });
      }
    };
    const nShip = Math.min(3, cT.n);
    if (!nShip && cPI.n) { const sh = ship(); add(sh, 'MAR'); anim((t) => { sh.position.copy(W(-12, 8.6, 0.2 + Math.sin(t * 1.2) * 0.05)); sh.rotation.z = Math.sin(t) * 0.02; }); } // barco en origen: importación aún con proveedor
    for (let i = 0; i < nShip; i++) { const sh = ship(); add(sh, 'MAR'); anim((t) => { const p = pathAt(paths.SHIP, ((t * 0.022) + i / nShip) % 1); sh.position.copy(W(p.x - 2.2, p.y - 0.58, 0.2 + Math.sin(t * 1.5 + i) * 0.05)); sh.rotation.z = Math.sin(t * 1.2 + i) * 0.02; }); }
    lane(paths.IMP, Math.min(3, cnt('ADUANA').n), 0.04, TIPO_C.IMP, hl('IMP'), true, 'ADU');
    lane(paths.NAC, Math.min(3, Math.ceil(cnt('PROVEEDOR|NAC').n / 6)), 0.035, TIPO_C.NAC, hl('NAC'), false, 'PROV');
    if (cnt('FORO').n) lane(paths.FORO, 1, 0.045, '#EC4899', 1, false, 'FORO');
    if (cnt('FULFILLMENT').n) lane(paths.FUL, 1, 0.035, '#14B8A6', 1, false, 'FUL');
    cs.forEach((p, i) => { if (cnt(`BODEGA_REG|${p.c}`).n) lane(paths.BOD(p.y), 1, 0.026 + i * 0.004, '#0EA5E9', 1, false, `CIU|${p.c}`); });
    zs.forEach((p, i) => {
      lane(paths.OUT(p.y), Math.min(3, cnt(`TRANSITO_TDA|${p.z}|PLAN`).n), 0.045 + i * 0.003, '#7C5CF0', fTipo === 'DIR' ? 0.15 : 1, false, `ZR|${p.z}`);
      lane(paths.DIR(p.y), Math.min(2, cnt(`TRANSITO_TDA|${p.z}|DIR`).n), 0.022 + i * 0.002, TIPO_C.DIR, hl('DIR'), false, `ZR|${p.z}`);
    });
    // camiones en andén de PLAN
    [[9.2, TIPO_C.NAC, cnt('ALMACEN').n > 0], [11.4, TIPO_C.IMP, cnt('ALMACEN').n > 1], [14.5, TIPO_C.NAC, cnt('CROSSDOCK').n > 0], [16.6, TIPO_C.IMP, cnt('CROSSDOCK').n > 1]].forEach(([px, col, on]) => { if (!on) return; const tk = truck(col, false); tk.position.copy(W(px, 3.05, 0.07)); tk.rotation.y = -Math.PI / 2; G.add(tk); });
  }, [stats, fTipo, selKey, isDark, zonas.join('|'), ciudades.join('|')]);

  // ── Cámara a sitio ──
  useEffect(() => {
    const S = st.current; if (!S.cam) return;
    const s = SITES[site] || SITES.RED; const cam = S.cam, controls = S.controls;
    const off = cam.position.clone().sub(controls.target);
    const b = W(s.x, s.y, 0);
    if (panelOpen && site !== 'RED') { const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize(); b.add(right.multiplyScalar(5.5 / s.z)); }
    S.tween = { a: controls.target.clone(), b, off, za: cam.zoom, zb: s.z, t0: performance.now() };
  }, [site, panelOpen]);

  // ── Botones de zoom / vista completa ──
  useEffect(() => {
    const S = st.current; if (!S.cam || !zoomCmd?.n) return;
    if (zoomCmd.reset) { const s = SITES.RED; S.tween = { a: S.controls.target.clone(), b: W(s.x, s.y, 0), off: S.cam.position.clone().sub(S.controls.target), za: S.cam.zoom, zb: s.z, t0: performance.now() }; return; }
    S.tween = { a: S.controls.target.clone(), b: S.controls.target.clone(), off: S.cam.position.clone().sub(S.controls.target), za: S.cam.zoom, zb: Math.min(5, Math.max(0.6, S.cam.zoom * zoomCmd.f)), t0: performance.now() };
  }, [zoomCmd?.n]);

  return <div ref={host} className="absolute inset-0" style={{ isolation: 'isolate' }} />;
}

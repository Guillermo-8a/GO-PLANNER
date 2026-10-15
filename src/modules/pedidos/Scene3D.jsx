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
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { N, SITES, paths, roadsFor, pathAt, pathLen, zonaPos, ciudadPos } from './layout';

const TIPO_C = { IMP: '#14B8A6', NAC: '#3B82F6', DIR: '#F59E0B' };
const fmtN = (v) => Math.round(v || 0).toLocaleString('es-MX');
const fk = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : fmtN(v));
const W = (x, y, z = 0) => new THREE.Vector3(x, z, y); // mundo (x, y, z) → three (x, z, y)

const PALETTE = {
  dark: { bg: '#15111C', plate: '#2A2238', grass: '#24382D', grass2: '#284033', road: '#383149', line: '#9A92B4', pad: '#2B2439', padLine: '#E0BB3E', water: '#1B4466', wall: '#EAE7F2', wall2: '#D9D4E6', roofA: '#6D4FD8', roofX: '#8B6CF6', tree: '#46A86C', hemi: 0.65, sun: 2.3, glass: '#F5D06B', text: '#EDEBF2', sub: '#A9A2B8', card: 'rgba(30,24,41,0.92)', cardB: '#3E3555' },
  light: { bg: '#E7EDF7', plate: '#F4F6FB', grass: '#D5E8CD', grass2: '#CBE2C2', road: '#C6D0E0', line: '#FFFFFF', pad: '#E4E9F2', padLine: '#F2B705', water: '#8FC3EC', wall: '#FFFFFF', wall2: '#EEF2F8', roofA: '#2F6BE8', roofX: '#7C5CF0', tree: '#5DBB7A', hemi: 0.65, sun: 2.2, glass: '#BFD9F7', text: '#1E2A44', sub: '#5B6680', card: 'rgba(255,255,255,0.95)', cardB: '#D5DDEB' },
};

// ── Caché de geometrías / materiales / texturas ─────────────────────────────
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const mat = (color, o = {}) => memo(`m:${color}:${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04, ...o })); // (bumpMap de grano descartado: genera NaN y cuadros negros con el bloom)
const rbox = (w, h, d, r = 0.05) => memo(`rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)));
const canvasTex = (k, w, h, draw) => memo(`t:${k}`, () => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t; });
const stripes = (base, line, n, vertical = true) => canvasTex(`st:${base}:${line}:${n}:${vertical}`, 256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = line; for (let i = 0; i < n; i++) { if (vertical) g.fillRect((i * w) / n, 0, w / n / 2.8, h); else g.fillRect(0, (i * h) / n, w, h / n / 3.5); } });
const cartonTex = (alert) => canvasTex(`carton:${alert}`, 128, 128, (g) => { g.fillStyle = alert ? '#F08A8A' : '#D9A86A'; g.fillRect(0, 0, 128, 128); g.fillStyle = alert ? '#C25E5E' : '#B9874A'; g.fillRect(54, 0, 20, 128); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 124); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, 128, 10); });
const signTex = (text, bg, fg) => canvasTex(`sign:${text}:${bg}:${fg}`, 512, 128, (g, w, h) => {
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 24); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 4; g.stroke();
  let fs = 58; g.font = `900 ${fs}px Inter, system-ui, sans-serif`; while (fs > 26 && g.measureText(text).width > w - 44) { fs -= 2; g.font = `900 ${fs}px Inter, system-ui, sans-serif`; } // textos largos se achican
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
});
const pinTex = (n) => canvasTex(`pin:${n}`, 96, 128, (g) => { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 8; g.fillStyle = '#E5484D'; g.beginPath(); g.moveTo(48, 122); g.bezierCurveTo(12, 78, 6, 58, 6, 44); g.arc(48, 44, 42, Math.PI, 0); g.bezierCurveTo(90, 58, 84, 78, 48, 122); g.fill(); g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(48, 44, 25, 0, Math.PI * 2); g.fill(); g.fillStyle = '#E5484D'; g.font = '900 30px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 48, 46); });
const flowTex = (color) => canvasTex(`flow:${color}`, 64, 8, (g) => { g.clearRect(0, 0, 64, 8); g.fillStyle = color; g.beginPath(); g.roundRect(4, 1, 24, 6, 3); g.fill(); });

// Agua: manchas suaves de oleaje (se desplazan con el tiempo)
const waterTex = (dark) => canvasTex(`wtex:${dark}`, 256, 256, (g, w, h) => {
  g.fillStyle = dark ? '#2D6E9E' : '#68B0E8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) { const x = (Math.sin(i * 73.1) * 0.5 + 0.5) * w, y = (Math.cos(i * 41.7) * 0.5 + 0.5) * h; g.fillStyle = dark ? 'rgba(56, 189, 248, 0.07)' : 'rgba(255, 255, 255, 0.16)'; g.beginPath(); g.ellipse(x, y, 14 + (i % 22), 3 + (i % 5), 0, 0, Math.PI * 2); g.fill(); }
});
// Baliza holográfica (gradiente vertical) y charco de luz cálida bajo los postes
const beaconTex = (color) => canvasTex(`bcn:${color}`, 32, 128, (g) => { const grd = g.createLinearGradient(0, 128, 0, 0); grd.addColorStop(0, `${color}AA`); grd.addColorStop(0.35, `${color}44`); grd.addColorStop(1, `${color}00`); g.fillStyle = grd; g.fillRect(0, 0, 32, 128); });
const glowPoolTex = () => canvasTex('gp', 64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32); grd.addColorStop(0, 'rgba(255, 224, 138, 0.55)'); grd.addColorStop(0.5, 'rgba(255, 198, 92, 0.22)'); grd.addColorStop(1, 'rgba(255, 198, 92, 0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); });
// Texturas de suelo y muros con detalle visible a distancia (sin bumpMap, que rompe el bloom)
const rep = (t, n) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n, n); return t; };
const grassMap = (base, alt, dark) => rep(canvasTex(`gmap:${base}:${dark}`, 256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = alt;
  for (let i = -w; i < w * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i - h + 16, h); g.lineTo(i - h, h); g.fill(); } // franjas de jardín
  for (let i = 0; i < 180; i++) { g.fillStyle = i % 2 ? (dark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.14)') : 'rgba(0, 0, 0, 0.07)'; g.beginPath(); g.arc((i * 97) % w, (i * 53) % h, 4 + (i % 10), 0, Math.PI * 2); g.fill(); }
}), 6);
const roadMap = (base) => rep(canvasTex(`rmap:${base}`, 256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)'; g.fillRect((i * 73) % w, (i * 137) % h, 3 + (i % 4), 3 + (i % 4)); } }), 8);
const padMap = (base, dark) => rep(canvasTex(`pmap:${base}:${dark}`, 256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; g.lineWidth = 2; for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); } }), 5);
const plazaTileMap = (base, dark) => rep(canvasTex(`ptile:${base}:${dark}`, 256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.strokeStyle = dark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.065)'; g.lineWidth = 2; for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
  g.strokeStyle = dark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.03)'; g.lineWidth = 1; for (let k = 32; k < w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.25)') : 'rgba(0,0,0,0.03)'; g.fillRect(((i * 3) % 4) * 64 + 2, Math.floor(((i * 7) % 16) / 4) * 64 + 2, 60, 60); }
}), 16);
const wallMap = (base, dark) => canvasTex(`wmap:${base}:${dark}`, 128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.045)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2); for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h); });
// Halo radial de semáforo (centro suave, borde marcado)
const haloTex = (color) => canvasTex(`halo:${color}`, 128, 128, (g) => {
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grd.addColorStop(0, `${color}88`); grd.addColorStop(0.65, `${color}44`); grd.addColorStop(0.9, `${color}99`); grd.addColorStop(1, `${color}00`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
});
// Oclusión de contacto: sombra suave bajo edificios para que no "floten"
const aoTex = () => canvasTex('ao', 64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 8, 32, 32, 32); grd.addColorStop(0, 'rgba(0,0,0,0.38)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); });
const mesh = (geo, m, shadow = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; return o; };
// Caja con esquina (x, y) de mundo, tamaño w (x) × d (y) × h, sobre z
const aoPad = (x, y, w, d, z = 0.075) => {
  const m = new THREE.Mesh(memo(`aoG:${w}:${d}`, () => { const p = new THREE.PlaneGeometry(w + 0.9, d + 0.9); p.rotateX(-Math.PI / 2); return p; }), memo('aoM', () => new THREE.MeshBasicMaterial({ map: aoTex(), transparent: true, depthWrite: false })));
  m.position.copy(W(x + w / 2, y + d / 2, z)); return m;
};
const boxAt = (x, y, z, w, d, h, m, r = 0.05) => { const o = mesh(rbox(w, h, d, r), m); o.position.copy(W(x + w / 2, y + d / 2, z + h / 2)); return o; };

// ── Modelos ──────────────────────────────────────────────────────────────────
function warehouse(P, { x, y, w, d, h, roof, doors = 3, logo, rh = 0.55, windows = true }) {
  const g = new THREE.Group(); g.add(aoPad(x, y, w, d));
  g.add(boxAt(x, y, 0, w, d, h, memo(`wallM:${P.wall}`, () => new THREE.MeshStandardMaterial({ color: P.wall, map: wallMap(P.wall, P === PALETTE.dark), roughness: 0.62, metalness: 0.04 })), 0.04)); // muro con paneles
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
  if (w >= 2.4) { // paneles solares en la vertiente frontal, entre el alero y los tragaluces
    const panelTex = canvasTex('sol', 64, 64, (gg) => { gg.fillStyle = '#0F294A'; gg.fillRect(0, 0, 64, 64); gg.strokeStyle = '#38BDF8'; gg.lineWidth = 1.5; for (let k = 0; k <= 64; k += 16) { gg.beginPath(); gg.moveTo(k, 0); gg.lineTo(k, 64); gg.moveTo(0, k); gg.lineTo(64, k); gg.stroke(); } });
    const solMat = memo('solMat', () => new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.15, metalness: 0.85 }));
    const slope = Math.atan2(rh, d / 2 + 0.14), py = y + d * 0.9, hy = h + rh * ((y + d + 0.14 - py) / (d / 2 + 0.14)) + 0.03;
    for (let i = 0; i < Math.floor((w - 0.6) / 0.9); i++) { const sp = mesh(memo('solG', () => new THREE.BoxGeometry(0.72, 0.03, 0.42)), solMat, false); sp.position.copy(W(x + 0.55 + i * 0.9, py, hy)); sp.rotation.x = slope; g.add(sp); }
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
function truck(color, cont, dark) {
  const g = new THREE.Group();
  const trailerM = cont ? new THREE.MeshStandardMaterial({ map: stripes('#2BB3A8', '#22948B', 18), roughness: 0.45, metalness: 0.25 }) : dark ? mat('#B9B4C8', { roughness: 0.65 }) : mat('#FFFFFF', { roughness: 0.3 });
  const tr = mesh(rbox(1.2, 0.74, 0.64, 0.06), trailerM); tr.position.set(-0.26, 0.6, 0); g.add(tr);
  if (!cont) { const st = mesh(rbox(1.21, 0.13, 0.65, 0.02), mat(color)); st.position.set(-0.26, 0.5, 0); g.add(st); }
  const aero = mesh(rbox(0.28, 0.14, 0.56, 0.04), mat(color)); aero.position.set(0.52, 0.88, 0); aero.rotation.z = -0.25; g.add(aero); // deflector
  const ch = mesh(rbox(1.78, 0.1, 0.5, 0.02), mat('#2A2733')); ch.position.set(-0.05, 0.2, 0); g.add(ch);
  const cab = mesh(rbox(0.5, 0.62, 0.62, 0.1), mat(color, dark ? { roughness: 0.5, metalness: 0.15 } : { roughness: 0.3, metalness: 0.25 })); cab.position.set(0.6, 0.53, 0); g.add(cab);
  const ws = mesh(rbox(0.04, 0.24, 0.52, 0.02), mat('#1E2A44', { roughness: 0.08, metalness: 0.7 }), false); ws.position.set(0.86, 0.66, 0); g.add(ws);
  const grill = mesh(rbox(0.03, 0.22, 0.36, 0.01), mat('#D1D5DB', { metalness: 0.8, roughness: 0.2 }), false); grill.position.set(0.86, 0.38, 0); g.add(grill);
  const hlM = mat('#FFFBEB', { emissive: '#FDE68A', emissiveIntensity: dark ? 3.5 : 0.2 }), tlM = mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: dark ? 2.2 : 0.2 });
  [-0.2, 0.2].forEach((z) => {
    const hl = mesh(memo('thl', () => new THREE.BoxGeometry(0.03, 0.07, 0.1)), hlM, false); hl.position.set(0.86, 0.34, z); g.add(hl);
    const tl = mesh(memo('ttl', () => new THREE.BoxGeometry(0.03, 0.06, 0.1)), tlM, false); tl.position.set(-0.86, 0.28, z); g.add(tl);
  });
  if (dark) { // haz de los faros sobre el asfalto
    const beamGeo = memo('tbeam', () => { const sh = new THREE.Shape(); sh.moveTo(0.85, -0.22); sh.lineTo(2.1, -0.65); sh.lineTo(2.1, 0.65); sh.lineTo(0.85, 0.22); sh.closePath(); return new THREE.ShapeGeometry(sh); });
    const beam = new THREE.Mesh(beamGeo, memo('tbeamM', () => new THREE.MeshBasicMaterial({ color: '#FEF08A', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })));
    beam.rotation.x = -Math.PI / 2; beam.position.y = 0.025; g.add(beam);
  }
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
function tree(P, s = 1, variant = 1) {
  const g = new THREE.Group();
  const tr = mesh(memo('trunk', () => new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8)), mat('#8B6B4A')); tr.position.y = 0.25; g.add(tr);
  const hs = ((variant % 5) - 2) * 0.015;
  const col1 = new THREE.Color(P.tree).offsetHSL(hs, 0, 0).getStyle(), col2 = new THREE.Color(P.tree).offsetHSL(hs, 0, 0.07).getStyle();
  if (variant % 3 === 0) { // pino
    const p1 = mesh(memo('pine1', () => new THREE.ConeGeometry(0.38, 0.75, 7)), mat(col1, { flatShading: true, roughness: 0.8 })); p1.position.y = 0.72;
    const p2 = mesh(memo('pine2', () => new THREE.ConeGeometry(0.28, 0.6, 7)), mat(col2, { flatShading: true, roughness: 0.8 })); p2.position.y = 1.08; g.add(p1, p2);
  } else { // frondoso
    const c1 = mesh(memo('crown', () => new THREE.IcosahedronGeometry(0.42, 1)), mat(col1, { flatShading: true, roughness: 0.8 })); c1.position.y = 0.78;
    const c2 = mesh(memo('crown2', () => new THREE.IcosahedronGeometry(0.28, 1)), mat(col2, { flatShading: true, roughness: 0.8 })); c2.position.set(0.12, 1.08, 0.05); g.add(c1, c2);
  }
  g.scale.setScalar(s); return g;
}
// Plaza de tiendas de una zona: local principal con letrero + dos locales chicos
// Plaza de una zona: tienda principal + dos boutiques (blanco, morado oscuro y negro mate)
function plaza(P, x, y, name) {
  const g = new THREE.Group(); g.add(store(P, x, y, name));
  const dark = P === PALETTE.dark, wCol = dark ? '#EAE6F3' : '#FFFFFF', purp = '#3B1D6E', blk = '#14121A';
  [[x + 0.12, y - 1.15, 1.15, 0.85, 0.78], [x + 1.42, y - 1.05, 0.92, 0.75, 0.66]].forEach(([sx, sy, w, d, h], i) => {
    g.add(boxAt(sx, sy, 0, w, d, h, mat(wCol, { roughness: 0.45 }), 0.03));
    g.add(boxAt(sx - 0.01, sy - 0.01, 0, w + 0.02, d + 0.02, 0.08, mat(blk, { roughness: 0.7 }), 0.01));
    g.add(boxAt(sx - 0.03, sy - 0.03, h, w + 0.06, d + 0.06, 0.1, mat(i === 0 ? purp : blk, { roughness: 0.35, metalness: 0.15 }), 0.02));
    g.add(boxAt(sx + 0.14, sy + d - 0.01, 0.08, w - 0.28, 0.04, h * 0.6, mat(blk, { roughness: 0.4 }), 0.01));
    g.add(boxAt(sx + 0.18, sy + d + 0.01, 0.11, w - 0.36, 0.03, h * 0.52, mat(P.glass, { roughness: 0.08, metalness: 0.65, emissive: P.glass, emissiveIntensity: dark ? 0.38 : 0 }), 0.01));
  });
  return g;
}
function store(P, x, y, name) {
  const g = new THREE.Group(), w = 2.4, d = 1.9, h = 1.08; g.add(aoPad(x, y, w, d));
  const dark = P === PALETTE.dark, wCol = dark ? '#F0EDF7' : '#FFFFFF', purp = '#3B1D6E', blk = '#14121A';
  const glass = mat(P.glass, { roughness: 0.08, metalness: 0.7, emissive: P.glass, emissiveIntensity: dark ? 0.35 : 0 });
  g.add(boxAt(x, y, 0, w, d, h, mat(wCol, { roughness: 0.42 }), 0.04));
  g.add(boxAt(x - 0.015, y - 0.015, 0, w + 0.03, d + 0.03, 0.09, mat(blk, { roughness: 0.75 }), 0.01)); // zócalo
  g.add(boxAt(x - 0.04, y - 0.04, h, w + 0.08, d + 0.08, 0.18, mat(purp, { roughness: 0.35, metalness: 0.12 }), 0.03)); // corona morada
  g.add(boxAt(x - 0.05, y - 0.05, h + 0.18, w + 0.1, d + 0.1, 0.04, mat(blk, { roughness: 0.5, metalness: 0.2 }), 0.01)); g.add(boxAt(x + 0.06, y + 0.06, h + 0.2, w - 0.12, d - 0.12, 0.03, mat(dark ? '#4A4360' : '#E4E1EC', { roughness: 0.8 }), 0.01)); // azotea clara con filo negro
  g.add(boxAt(x + 0.18, y + d - 0.03, 0, 0.85, 0.12, h * 0.82, mat(blk, { roughness: 0.5 }), 0.02)); // pórtico
  g.add(boxAt(x + 0.25, y + d + 0.04, 0.02, 0.71, 0.04, 0.64, glass, 0.01));
  g.add(boxAt(x + 1.16, y + d - 0.01, 0.14, 1.02, 0.05, 0.54, mat(blk, { roughness: 0.5 }), 0.01)); // escaparate
  g.add(boxAt(x + 1.2, y + d + 0.01, 0.17, 0.94, 0.04, 0.48, glass, 0.01));
  g.add(boxAt(x + 1.65, y + d + 0.02, 0.16, 0.04, 0.05, 0.5, mat(blk), 0.005));
  g.add(boxAt(x + 0.12, y + d - 0.02, h * 0.68, w - 0.24, 0.38, 0.05, mat(blk, { roughness: 0.4, metalness: 0.25 }), 0.015)); // marquesina
  g.add(boxAt(x + 0.12, y + d + 0.34, h * 0.69, w - 0.24, 0.03, 0.03, mat('#6D4FD8', { emissive: '#6D4FD8', emissiveIntensity: dark ? 1.2 : 0.1 }), 0.005));
  g.add(boxAt(x + 0.3, y + 0.35, h + 0.18, 0.55, 0.45, 0.16, mat(blk, { roughness: 0.6, metalness: 0.3 }), 0.02)); // HVAC
  const s = new THREE.Mesh(memo('signS', () => new THREE.PlaneGeometry(1.6, 0.36)), new THREE.MeshBasicMaterial({ map: signTex(name, '#241046', '#FFFFFF'), transparent: true }));
  s.position.copy(W(x + w / 2, y + d + 0.06, h + 0.09)); g.add(s);
  return g;
}
function factory(P, n = N.PROV, roofC) {
  const g = new THREE.Group(); g.add(aoPad(n.x, n.y, n.w, n.d));
  g.add(boxAt(n.x, n.y, 0, n.w, n.d, n.h, mat(P === PALETTE.dark ? '#B9B3CC' : '#C9D1DE'), 0.04));
  for (let i = 0; i < 4; i++) {
    const x0 = n.x + i * (n.w / 4), sw = n.w / 4;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(sw, 0); sh.lineTo(sw, 0.6); sh.closePath();
    const st = mesh(memo(`saw:${sw}:${n.d}`, () => new THREE.ExtrudeGeometry(sh, { depth: n.d, bevelEnabled: false })), mat(roofC || (P === PALETTE.dark ? '#7A6FA8' : '#8FA2C0'), { flatShading: true }));
    st.position.copy(W(x0, n.y, n.h)); g.add(st);
    g.add(boxAt(x0 + sw + 0.004, n.y + 0.05, n.h + 0.04, 0.03, n.d - 0.1, 0.5, mat(P === PALETTE.dark ? '#E9B98A' : '#CFE0F5', { emissive: P === PALETTE.dark ? '#E9A86E' : '#CFE0F5', emissiveIntensity: P === PALETTE.dark ? 0.3 : 0.03, roughness: 0.15 }), 0.005));
  }
  const ch = mesh(memo(`chim:${n.h}`, () => new THREE.CylinderGeometry(0.22, 0.28, n.h + 1.8, 16)), mat('#9AA4B6')); ch.position.copy(W(n.x + 0.55, n.y + 0.5, (n.h + 1.8) / 2)); g.add(ch);
  const band = mesh(memo('chimb', () => new THREE.CylinderGeometry(0.235, 0.235, 0.18, 16)), mat('#E5484D')); band.position.copy(W(n.x + 0.55, n.y + 0.5, n.h + 1.55)); g.add(band);
  for (let i = 0; i < 3; i++) g.add(boxAt(n.x + 0.5 + i, n.y + n.d - 0.01, 0.45, 0.6, 0.04, 0.5, mat(P.glass, { emissive: P.glass, emissiveIntensity: P === PALETTE.dark ? 0.5 : 0.05, roughness: 0.1 }), 0.01));
  return g;
}

function palm(s = 1) {
  const g = new THREE.Group();
  const tr = mesh(memo('palmT', () => new THREE.CylinderGeometry(0.05, 0.08, 1.3, 7)), mat('#9C7A52', { roughness: 0.9 })); tr.position.set(0.12, 0.62, 0); tr.rotation.z = -0.18; g.add(tr);
  for (let i = 0; i < 6; i++) { const lf = mesh(memo('palmL', () => new THREE.BoxGeometry(0.62, 0.025, 0.16)), mat('#3FA968', { roughness: 0.8 })); const a = (i / 6) * Math.PI * 2; lf.position.set(0.24 + Math.cos(a) * 0.26, 1.24, Math.sin(a) * 0.26); lf.rotation.set(0, -a, -0.35); g.add(lf); }
  g.scale.setScalar(s); return g;
}
function umbrella(c) {
  const g = new THREE.Group();
  const p = mesh(memo('umbP', () => new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6)), mat('#E5E7EB'), false); p.position.y = 0.3; g.add(p);
  const top = mesh(memo('umbT', () => new THREE.ConeGeometry(0.34, 0.16, 10)), new THREE.MeshStandardMaterial({ map: stripes(c, '#FFFFFF', 6), roughness: 0.6 })); top.position.y = 0.64; g.add(top);
  return g;
}
function lighthouse(P) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const b = mesh(memo(`lh${i}`, () => new THREE.CylinderGeometry(0.3 - i * 0.04 - 0.04, 0.3 - i * 0.04, 0.5, 14)), mat(i % 2 ? '#E5484D' : '#F4F6FB', { roughness: 0.5 })); b.position.y = 0.25 + i * 0.5; g.add(b); }
  const lamp = mesh(memo('lhL', () => new THREE.CylinderGeometry(0.16, 0.16, 0.26, 12)), mat('#FFE9A8', { emissive: '#FFD66B', emissiveIntensity: P === PALETTE.dark ? 3 : 0.5 }), false); lamp.position.y = 2.13; g.add(lamp);
  const cap = mesh(memo('lhC', () => new THREE.ConeGeometry(0.22, 0.25, 12)), mat('#2A2733')); cap.position.y = 2.38; g.add(cap);
  if (P === PALETTE.dark) { // haz giratorio de noche
    const coneGeo = memo('lhBeam', () => { const cg = new THREE.ConeGeometry(0.85, 3.8, 16, 1, true); cg.translate(0, -1.9, 0); cg.rotateZ(-Math.PI / 2); return cg; });
    const beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 2.13; beam.name = 'lhBeam'; g.add(beam);
  }
  return g;
}
// Barco centrado en su origen (para girarlo sobre la ruta)
function shipC(wake = true) {
  const g = new THREE.Group(); const s = ship(); s.position.set(-2.2, 0, -0.575); g.add(s);
  if (wake) { // estela de espuma en V detrás de la popa
    const wakeGeo = memo('shipWake', () => { const sh = new THREE.Shape(); sh.moveTo(-2.2, 0); sh.lineTo(-4.0, 0.72); sh.lineTo(-3.6, 0); sh.lineTo(-4.0, -0.72); sh.closePath(); return new THREE.ShapeGeometry(sh); });
    const w = new THREE.Mesh(wakeGeo, memo('shipWakeM', () => new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide })));
    w.rotation.x = -Math.PI / 2; w.position.y = 0.04; g.add(w);
  }
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
    const isMob = window.innerWidth < 768; renderer.setPixelRatio(Math.min(isMob ? 1.5 : 1.75, window.devicePixelRatio || 1)); // menos calor en cel/laptop
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
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.85; // reflejos tipo maqueta en techos, metales y agua
    const hemi = new THREE.HemisphereLight('#E2EDF8', '#2D263B', 0.65); scene.add(hemi);
    const sun = new THREE.DirectionalLight('#FFF5E6', 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); // 4096 calienta GPUs integradas
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 2.5;
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight('#8B6CF6', 0.45); fill.position.set(40, 16, -25); scene.add(fill); // relleno violeta en caras en sombra
    const staticG = new THREE.Group(), dynG = new THREE.Group(); scene.add(staticG, dynG);
    composer.addPass(new RenderPass(scene, cam));
    // GTAO: sombra de contacto en esquinas, llantas y contenedores (solo escritorio)
    let gtao = null;
    if (window.innerWidth >= 768) {
      gtao = new GTAOPass(scene, cam, el.clientWidth, el.clientHeight);
      gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.8, thickness: 1.2, scale: 1.1, samples: 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2 });
      // pines (sprites) y piezas transparentes fuera del cálculo de AO: si no, salen como rectángulos negros
      const ov = gtao._overrideVisibility.bind(gtao);
      gtao._overrideVisibility = () => { ov(); scene.traverse((o) => { if (o.visible && (o.isSprite || o.material?.transparent)) { o.visible = false; gtao._visibilityCache.push(o); } }); };
      composer.addPass(gtao);
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.4, 1.2); composer.addPass(bloom);
    // Lente diorama: curva S suave + viñeta
    const dioramaPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uDark: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uDark; varying vec2 vUv;
        void main(){ vec4 col = texture2D(tDiffuse, vUv);
          col.rgb = mix(col.rgb, smoothstep(0.0, 1.0, col.rgb), 0.16);
          float vig = smoothstep(0.82, 0.28, distance(vUv, vec2(0.5)) * (uDark > 0.5 ? 0.95 : 0.75));
          col.rgb *= mix(uDark > 0.5 ? 0.72 : 0.95, 1.0, vig);
          gl_FragColor = col; }`,
    });
    composer.addPass(new OutputPass()); composer.addPass(dioramaPass); // diorama después del tone mapping/sRGB
    Object.assign(S, { renderer, labels, scene, cam, controls, hemi, sun, staticG, dynG, anim: [], movers: [], t: 0, labelEls: [], detail: null, composer, bloom, gtao, dioramaPass });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight, a = w / h, vs = 30; cam.left = (-vs * a) / 2; cam.right = (vs * a) / 2; cam.top = vs / 2; cam.bottom = -vs / 2; cam.updateProjectionMatrix(); renderer.setSize(w, h); labels.setSize(w, h); S.composer?.setSize(w, h); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // Clic sin arrastre → raycast al objeto con userData.pick
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
    // Hover: el nodo bajo el cursor se ilumina y sube un poco (máx. un raycast por cuadro)
    let hovObj = null, moveEv = null;
    const setHover = (obj, on) => {
      if (!obj) return;
      obj.userData.baseY = obj.userData.baseY ?? obj.position.y; obj.position.y = obj.userData.baseY + (on ? 0.08 : 0);
      obj.traverse((c) => {
        if (!c.isMesh || !c.material || !('emissive' in c.material)) return;
        if (on && !c.userData._origMat) { c.userData._origMat = c.material; c.material = c.material.clone(); c.material.emissive = new THREE.Color('#8B6CF6'); c.material.emissiveIntensity = (c.userData._origMat.emissiveIntensity || 0) + 0.28; }
        else if (!on && c.userData._origMat) { c.material.dispose(); c.material = c.userData._origMat; delete c.userData._origMat; }
      });
    };
    const doHover = () => {
      const e = moveEv; moveEv = null; if (!e || down) return;
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects([staticG, dynG], true).find((h) => { let o = h.object; while (o && !o.userData.pick) o = o.parent; return o; });
      let root = hit ? hit.object : null; while (root && !root.userData.pick) root = root.parent;
      const k = root?.userData?.pick || '';
      if (root !== hovObj) { setHover(hovObj, false); hovObj = root; setHover(hovObj, true); renderer.domElement.style.cursor = k ? 'pointer' : 'grab'; S.dirty = true; }
    };
    const onMove = (e) => { if (!moveEv) requestAnimationFrame(doHover); moveEv = e; };
    renderer.domElement.addEventListener('pointermove', onMove); renderer.domElement.style.cursor = 'grab';
    const onDown = (e) => { down = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      const d0 = down; down = null;
      if (!d0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects([staticG, dynG], true).find((h) => { let o = h.object; while (o && !o.userData.pick) o = o.parent; return o; });
      if (hit) { let o = hit.object; while (o && !o.userData.pick) o = o.parent; props.current.onPick?.(o.userData.pick); }
    };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);

    let raf, last = performance.now();
    const FRAME_MIN = 1000 / 38; // reproduciendo sin mover la cámara: tope ~38 FPS (menos calor)
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (props.current.play && !S.tween && now - last < FRAME_MIN) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (props.current.play) S.t += dt;
      const t = S.t;
      if (S.tween) { const k = Math.min(1, (now - S.tween.t0) / 700), e = 1 - Math.pow(1 - k, 3); controls.target.lerpVectors(S.tween.a, S.tween.b, e); cam.position.copy(controls.target).add(S.tween.off); cam.zoom = S.tween.za + (S.tween.zb - S.tween.za) * e; cam.updateProjectionMatrix(); if (k >= 1) S.tween = null; }
      const moved = controls.update();
      // En pausa solo se dibuja si la cámara se movió o cambió la escena (ahorra batería)
      if (!props.current.play && !S.tween && !moved && !S.dirty && S.frame > 2) return;
      if (moved || S.tween || S.dirty || !S.sunReady) { sun.position.copy(controls.target).add(new THREE.Vector3(-24, 30, 18)); sun.target.position.copy(controls.target); S.sunReady = true; } // sol en diagonal rasante
      S.dirty = false;
      // Monitor de rendimiento: si va lento, quita el brillo y baja la resolución
      S.fpsAcc = (S.fpsAcc || 0) + dt; S.fpsN = (S.fpsN || 0) + 1;
      if (S.fpsAcc > 3) { const fps = S.fpsN / S.fpsAcc; if (fps < 32 && !S.lowPerf) { S.lowPerf = true; if (S.bloom) S.bloom.enabled = false; if (S.gtao) S.gtao.enabled = false; renderer.setPixelRatio(1); resize(); if (sun.shadow.mapSize.x > 2048) { sun.shadow.mapSize.set(2048, 2048); sun.shadow.map?.dispose(); sun.shadow.map = null; } } S.fpsAcc = 0; S.fpsN = 0; }
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
      if (!S.lowPerf) S.composer.render(); else renderer.render(scene, cam);
      labels.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); composer.dispose(); renderer.dispose(); el.innerHTML = ''; };
  }, []);

  // ── Escena estática (piso, caminos, edificios) ──
  useEffect(() => {
    const S = st.current; if (!S.scene) return;
    const P = isDark ? PALETTE.dark : PALETTE.light;
    S.renderer.setClearColor(P.bg); S.scene.fog = new THREE.Fog(P.bg, 90, 200);
    if (S.bloom) S.bloom.enabled = isDark && !S.lowPerf; // brillo de ventanas y postes solo de noche
    if (S.dioramaPass) S.dioramaPass.uniforms.uDark.value = isDark ? 1 : 0;
    S.dirty = true;
    S.hemi.intensity = P.hemi; S.hemi.groundColor.set(isDark ? '#2D263B' : '#9AA5BB'); S.sun.intensity = P.sun;
    S.scene.environmentIntensity = isDark ? 0.85 : 0.5; // de día el entorno lavaba las sombras
    S.renderer.toneMappingExposure = isDark ? 1.0 : (window.innerWidth < 768 ? 1.05 : 1.15); // negros profundos de noche, nitidez de día
    const G = S.staticG; while (G.children.length) G.remove(G.children[0]);
    S.anim = S.anim.filter((f) => !f.isStatic);
    const zs = zonas.map((z, i) => ({ z, ...zonaPos(i) })), cs = ciudades.map((c, i) => ({ c, ...ciudadPos(i) }));
    const yBot = Math.max(21, Math.max(...zs.map((p) => p.y)) + 3); // mínimo para que el piso cubra agua y árboles
    const pick = (o, k) => { o.userData.pick = k; o.traverse((c) => { c.userData.pickParent = k; }); return o; };
    const addAnim = (f) => { f.isStatic = true; S.anim.push(f); };
    // piso
    // base de maqueta: zócalo oscuro + filete morado + explanada con loseta
    const plinthBase = boxAt(-16.6, -17.6, -0.75, 52.2, yBot + 20.2, 0.42, mat(isDark ? '#120E1A' : '#CBD5E1', { roughness: 0.6, metalness: 0.2 }), 0.35);
    const plinthTrim = boxAt(-16.25, -17.25, -0.36, 51.5, yBot + 19.5, 0.08, mat('#6D4FD8', { roughness: 0.4, metalness: 0.3 }), 0.3);
    const plate = boxAt(-16, -17, -0.3, 51, yBot + 19, 0.3, memo(`plMat:${isDark}`, () => new THREE.MeshStandardMaterial({ map: plazaTileMap(P.plate, isDark), roughness: 0.85 })), 0.25);
    plinthBase.castShadow = false; plinthTrim.castShadow = false; plate.castShadow = false; G.add(plinthBase, plinthTrim, plate);
    // malecón entre el mar y el jardín del letrero, con bolardos luminosos
    { const seaWall = boxAt(5.05, 5.8, -0.15, 2.25, yBot - 4.4, 0.32, mat(isDark ? '#3E3554' : '#CFD8E6', { roughness: 0.75 }), 0.06), seaWalk = boxAt(5.25, 6.0, 0.17, 1.85, yBot - 4.8, 0.05, memo(`pmat:${isDark}`, () => new THREE.MeshStandardMaterial({ map: padMap(P.pad, isDark), roughness: 0.85 })), 0.04);
      seaWall.receiveShadow = true; seaWalk.receiveShadow = true; G.add(seaWall, seaWalk);
      for (let by = 7.2; by < yBot - 0.5; by += 2.6) { G.add(boxAt(5.35, by, 0.22, 0.12, 0.12, 0.28, mat('#1E1B26'), 0.02)); const tb = boxAt(5.36, by + 0.01, 0.5, 0.1, 0.1, 0.06, mat('#FFE08A', { emissive: '#FFE08A', emissiveIntensity: isDark ? 2.5 : 0.3 }), 0.01); tb.castShadow = false; G.add(tb); } }
    // jardín del letrero en terraza elevada (lo de adentro sube GZ)
    const GZ = 0.19, inG = (x, y) => x >= 7.1 && x <= 19.6 && y >= 5.8;
    const gMat1 = memo(`gm1:${isDark}`, () => new THREE.MeshStandardMaterial({ map: grassMap(P.grass, P.grass2, isDark), roughness: 0.92 }));
    const gMat2 = memo(`gm2:${isDark}`, () => new THREE.MeshStandardMaterial({ map: grassMap(P.grass, P.grass2, isDark), color: isDark ? '#D1FAE5' : '#ECFDF5', roughness: 0.92 }));
    [[-5, -16.5, 10, 9.7, gMat1], [7.2, -16.5, 12.4, 6.5, gMat1], [21.3, -16.5, 5.1, 12.5, gMat1], [-15.6, -16.5, 10.2, 21.7, gMat2], [27.9, -16.5, 6.7, yBot + 18, gMat2]].forEach(([x, y, w, d, m]) => {
      const curb = boxAt(x - 0.08, y - 0.08, 0, w + 0.16, d + 0.16, 0.03, mat(isDark ? '#383247' : '#CBD5E1', { roughness: 0.9 }), 0.1); // borde de jardinera
      const o = boxAt(x, y, 0.02, w, d, 0.03, m, 0.08); curb.castShadow = false; o.castShadow = false; G.add(curb, o);
    });
    { const wall = boxAt(7.0, 5.68, 0, 12.74, yBot - 4.56, 0.17, mat(isDark ? '#4A3F5C' : '#94A3B8', { roughness: 0.9 }), 0.08), turf = boxAt(7.1, 5.8, 0.16, 12.5, yBot - 4.8, 0.08, gMat2, 0.06); wall.receiveShadow = true; turf.receiveShadow = true; turf.castShadow = false; G.add(wall, turf); }
    // lomas escalonadas y rocas low-poly para romper lo plano
    [[-12.5, -13.5, 5.2, 4.2, 0.14], [-11.8, -12.8, 3.2, 2.4, 0.24], [-3.8, -14.8, 4.5, 3.2, 0.14], [11.5, 11.5, 5.5, 4.0, 0.14], [30.5, -13, 3.5, 6.0, 0.15], [30.8, 8, 3.2, 7.5, 0.15]].forEach(([hx, hy, hw, hd, hz]) => { const hill = boxAt(hx, hy, 0.05 + (inG(hx, hy) ? GZ : 0), hw, hd, hz, gMat1, Math.min(0.4, hz * 0.8)); hill.receiveShadow = true; G.add(hill); });
    [[-13.2, -11.5, 0.35], [-10.2, -14.2, 0.25], [-1.5, -13.8, 0.3], [14.2, 12.4, 0.32], [32.2, -6.5, 0.35], [32.5, 13.5, 0.28]].forEach(([rx, ry, rs], i) => { const rock = mesh(memo('rockG', () => new THREE.DodecahedronGeometry(1, 0)), mat(isDark ? '#4B5563' : '#94A3B8', { flatShading: true, roughness: 0.85 })); rock.scale.set(rs * 1.3, rs * 0.75, rs); rock.position.copy(W(rx, ry, 0.12 + (inG(rx, ry) ? GZ : 0))); rock.rotation.y = i * 1.1; G.add(rock); });
    // patios de concreto con losas y guarnición
    const pMat = memo(`pmat:${isDark}`, () => new THREE.MeshStandardMaterial({ map: padMap(P.pad, isDark), roughness: 0.85 }));
    [[-3.4, 0.6, 8.6, 5.8], [7.2, -4, 12.2, 7.8], [7.6, -10, 9.4, 3.4], [-2.4, -10.6, 6, 4.2]].forEach(([x, y, w, d]) => {
      const border = boxAt(x - 0.1, y - 0.1, 0, w + 0.2, d + 0.2, 0.055, mat(isDark ? '#473E5E' : '#B8C4D9', { roughness: 0.8 }), 0.07);
      const o = boxAt(x, y, 0.01, w, d, 0.06, pMat, 0.05); border.castShadow = false; o.castShadow = false; G.add(border, o);
    });
    for (let i = 0; i < 10; i++) { const o = boxAt(8.4 + i * 1.05, 2.4, 0.07, 0.05, 1.2, 0.01, mat(P.padLine, { roughness: 0.6 }), 0); o.castShadow = false; G.add(o); }
    { const o = boxAt(8.4, 2.38, 0.07, 10.5, 0.05, 0.01, mat(P.padLine), 0); o.castShadow = false; G.add(o); }
    // agua con oleaje
    const wg = new THREE.PlaneGeometry(21.2, yBot - 4.4, 1, 1); wg.rotateX(-Math.PI / 2); // sin deformar vértices en CPU: el oleaje lo hace la textura
    const wMap = waterTex(isDark); wMap.wrapS = wMap.wrapT = THREE.RepeatWrapping; wMap.repeat.set(5, 7);
    // sombreado suave (sin facetas) + textura de oleaje que se desplaza; un poco más alto para no chocar con el pasto
    const water = new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({ map: wMap, color: isDark ? '#6FA6D2' : '#8FC3EC', roughness: 0.28, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: isDark ? 0.7 : 0.5, transparent: true, opacity: 0.95 }));
    water.position.copy(W(-16 + 10.6, 6.4 + (yBot - 4.4) / 2, 0.212)); water.receiveShadow = true; G.add(water); // arriba del piso (0.19): el plano liso ya no sube con las olas
    // espuma que va y viene en la playa y alrededor de la isla
    const shoreFoam = boxAt(-16, 6.28, 0.205, 12.5, 0.26, 0.015, new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.65 }), 0.06); shoreFoam.castShadow = false; shoreFoam.receiveShadow = false;
    const islFoam = new THREE.Mesh(memo('islFoam', () => new THREE.RingGeometry(1.72, 2.05, 24)), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    islFoam.rotation.x = -Math.PI / 2; islFoam.position.copy(W(-9.5, 18, 0.22)); G.add(shoreFoam, islFoam);
    addAnim((t) => {
      wMap.offset.set(Math.sin(t * 0.4) * 0.04 + t * 0.015, t * 0.01);
      shoreFoam.position.z = 6.38 + Math.sin(t * 1.6) * 0.08; shoreFoam.material.opacity = 0.4 + (Math.sin(t * 1.6) + 1) * 0.22;
      const k = 1 + Math.sin(t * 1.8) * 0.04; islFoam.scale.set(k, k, 1); islFoam.material.opacity = 0.35 + (Math.cos(t * 1.8) + 1) * 0.2;
    });
    { // playa con palmeras, sombrillas y faro
      const sand = boxAt(-16, 5.1, 0, 12.5, 1.6, 0.2, mat(isDark ? '#8A7858' : '#EBD7A6', { roughness: 1 }), 0.1); sand.castShadow = false; G.add(sand);
      [[-15.3, 5.5, 1], [-11.6, 5.3, 0.9], [-8.2, 5.4, 1.1], [-5.2, 5.3, 0.95]].forEach(([x, y, k], i) => { const pm = palm(k); pm.position.copy(W(x, y, 0.2)); pm.rotation.y = i * 1.7; G.add(pm); });
      [[-10.2, 5.9, '#E5484D'], [-7.4, 6.0, '#3B82F6'], [-6.2, 5.8, '#F2B705']].forEach(([x, y, c]) => { const u = umbrella(c); u.position.copy(W(x, y, 0.2)); G.add(u); });
      const lh = lighthouse(P); lh.position.copy(W(-14.6, 5.6, 0.2)); G.add(lh);
      const lhBeam = lh.getObjectByName('lhBeam'); if (lhBeam) addAnim((t) => { lhBeam.rotation.y = t * 0.7; });
      // muelle del proveedor de importación
      G.add(boxAt(-13.6, 5.4, 0, 1.0, 4.3, 0.34, mat('#A47B4F', { roughness: 0.9 }), 0.03));
      for (let i = 0; i < 4; i++) [[-13.62, 6.2 + i], [-12.68, 6.2 + i]].forEach(([x, y]) => G.add(boxAt(x, y, -0.3, 0.1, 0.1, 0.7, mat('#6B4F33'), 0.02)));
      // barco descargando en el puerto (decorativo)
      const dk = ship(); dk.position.copy(W(-1.8, 6.7, 0.2)); G.add(dk); addAnim((t) => { dk.position.y = 0.2 + Math.sin(t * 1.1) * 0.04; });
      // isla con palmeras y veleros
      const isl = mesh(memo('isl', () => new THREE.CylinderGeometry(1.5, 1.9, 0.36, 18)), mat(isDark ? '#8A7858' : '#EBD7A6', { roughness: 1 })); isl.position.copy(W(-9.5, 18, 0.05)); G.add(isl);
      const islG = mesh(memo('islG', () => new THREE.CylinderGeometry(0.9, 1.2, 0.1, 16)), mat(P.grass2, { roughness: 1 })); islG.position.copy(W(-9.4, 17.8, 0.26)); G.add(islG);
      [[-9.8, 17.6, 1], [-9, 18.4, 0.8], [-10.3, 18.6, 0.9]].forEach(([x, y, k], i) => { const pm = palm(k); pm.position.copy(W(x, y, 0.3)); pm.rotation.y = i * 2.1; G.add(pm); });
      [[-13, 13.5, '#E5484D', 0], [-5, 21, '#F2B705', 2.5]].forEach(([x, y, c, ph]) => {
        const sb = new THREE.Group(); const h = mesh(rbox(1.0, 0.2, 0.36, 0.08), mat('#F4F6FB', { roughness: 0.4 })); h.position.y = 0.1; sb.add(h);
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.62, 0); sh.lineTo(0, 1.0); sh.closePath();
        const sail = new THREE.Mesh(memo('sail', () => new THREE.ShapeGeometry(sh)), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6 })); sail.position.set(-0.2, 0.22, 0); sb.add(sail);
        G.add(sb); addAnim((t) => { const a = t * 0.12 + ph; sb.position.copy(W(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.1, 0.16 + Math.sin(t * 1.4 + ph) * 0.04)); sb.rotation.y = -a - Math.PI / 2; });
      });
      [[-6, 8.6], [-4.6, 15.5], [-14, 10.5]].forEach(([x, y], i) => { const b = mesh(memo('buoy', () => new THREE.CylinderGeometry(0.1, 0.14, 0.3, 10)), mat(i % 2 ? '#F2B705' : '#E5484D', { emissive: i % 2 ? '#F2B705' : '#E5484D', emissiveIntensity: isDark ? 0.8 : 0 })); G.add(b); addAnim((t) => { b.position.copy(W(x, y, 0.25 + Math.sin(t * 2 + i) * 0.05)); }); });
      // Tótem GO PLANNER compacto (antes 6×3 a escala 1.3; ahora 2.6×1.3 a escala 0.75)
      const logo = memo('billLogo', () => new THREE.TextureLoader().load('/logov.png', (tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 16; tx.minFilter = THREE.LinearMipmapLinearFilter; S.dirty = true; }));
      const sign = new THREE.Group();
      const plinth = mesh(rbox(3.2, 0.22, 0.6, 0.05), mat('#14121A', { roughness: 0.5, metalness: 0.2 })); plinth.position.y = 0.11; sign.add(plinth);
      const strip = mesh(memo('stripSm', () => new THREE.BoxGeometry(2.8, 0.03, 0.02)), mat('#E0BB3E', { emissive: '#E0BB3E', emissiveIntensity: isDark ? 1.5 : 0.2 }), false); strip.position.set(0, 0.23, 0.25); sign.add(strip);
      const backGlass = mesh(rbox(2.8, 1.4, 0.04, 0.03), mat('#120E1A', { roughness: 0.2, metalness: 0.5, transparent: true, opacity: isDark ? 0.75 : 0.85 })); backGlass.position.set(0, 0.95, -0.08); sign.add(backGlass);
      const lg = memo('logoGSm', () => new THREE.PlaneGeometry(2.6, 1.3)), NL = 16;
      for (let i = 0; i < NL; i++) {
        const front = i === NL - 1;
        const m = new THREE.MeshStandardMaterial({ map: logo, alphaTest: front ? 0.02 : 0.45, transparent: front, side: THREE.DoubleSide, color: front ? '#ffffff' : '#6D4FD8', roughness: front ? 0.2 : 0.4, metalness: front ? 0.15 : 0.4, ...(front && isDark ? { emissive: '#ffffff', emissiveMap: logo, emissiveIntensity: 0.5 } : {}) });
        const p = new THREE.Mesh(lg, m); p.position.set(0, 0.95, -0.06 + i * 0.007); p.castShadow = i % 4 === 0 || front; p.receiveShadow = !front; sign.add(p);
      }
      [-0.85, 0.85].forEach((lx) => { const lamp = mesh(rbox(0.14, 0.08, 0.1, 0.02), mat('#14121A'), false); lamp.position.set(lx, 0.06, 0.5); lamp.rotation.x = -0.5; sign.add(lamp); const lens = mesh(memo('lensSm', () => new THREE.CircleGeometry(0.04, 10)), mat('#FFF3C4', { emissive: '#FFE08A', emissiveIntensity: isDark ? 2.5 : 0.3 }), false); lens.position.set(lx, 0.1, 0.45); lens.rotation.x = -1.07; sign.add(lens); });
      if (isDark) { const sp = new THREE.SpotLight('#FFE6B0', 16, 6, 0.7, 0.7, 1.4); sp.position.set(0, 0.3, 0.9); sp.target.position.set(0, 0.95, 0); sign.add(sp, sp.target); }
      sign.position.copy(W(12.5, 16, 0.05 + GZ)); sign.rotation.y = Math.PI / 4; sign.scale.setScalar(0.75); G.add(sign);
    }
    const quay = boxAt(-3.4, 6.2, -0.4, 8.6, 0.3, 0.47, mat(isDark ? '#3A3350' : '#B9C3D3'), 0.04); G.add(quay);
    // caminos + líneas
    const roads = roadsFor(zs, cs, yBot);
    const dashes = [], rMat = memo(`rmat:${isDark}`, () => new THREE.MeshStandardMaterial({ map: roadMap(P.road), roughness: 0.88 })), curbMat = mat(isDark ? '#4E4663' : '#94A3B8', { roughness: 0.8 });
    roads.forEach(([a, b]) => {
      const vert = a[0] === b[0], x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const curb = vert ? boxAt(a[0] - 0.64, y0 - 0.64, 0, 1.28, y1 - y0 + 1.28, 0.055, curbMat, 0.03) : boxAt(x0 - 0.64, a[1] - 0.64, 0, x1 - x0 + 1.28, 1.28, 0.055, curbMat, 0.03); // banqueta
      const o = vert ? boxAt(a[0] - 0.55, y0 - 0.55, 0.01, 1.1, y1 - y0 + 1.1, 0.05, rMat, 0.02) : boxAt(x0 - 0.55, a[1] - 0.55, 0.01, x1 - x0 + 1.1, 1.1, 0.05, rMat, 0.02);
      curb.castShadow = false; o.castShadow = false; G.add(curb, o);
      const L = vert ? y1 - y0 : x1 - x0;
      for (let s = 0.4; s < L - 0.2; s += 0.9) dashes.push(vert ? [a[0], y0 + s, true] : [x0 + s, a[1], false]);
    });
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.012, 0.07), mat(P.line, { roughness: 0.5 }), dashes.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    dashes.forEach(([x, y, v], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v ? Math.PI / 2 : 0); m4.compose(W(x, y, 0.066), q, sc); dm.setMatrixAt(i, m4); }); dm.receiveShadow = true; G.add(dm);
    { // pasos de cebra en cruces clave (franjas a lo largo de la calle, repartidas a lo ancho)
      const cw = [[6.0, 0.4, true], [15.6, 3.8, true], [20.5, -1.2, true], [20.5, 8.8, true], [1.8, 4.9, false]]; // true = calle vertical
      const im = new THREE.InstancedMesh(memo('cwStripe', () => new THREE.BoxGeometry(0.45, 0.014, 0.1)), mat(P.line, { roughness: 0.6 }), cw.length * 5); let k = 0;
      cw.forEach(([cx, cy, vert]) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), vert ? Math.PI / 2 : 0); for (let st = -2; st <= 2; st++) { m4.compose(W(vert ? cx + st * 0.2 : cx, vert ? cy : cy + st * 0.2, 0.068), q, sc); im.setMatrixAt(k++, m4); } });
      im.receiveShadow = true; G.add(im);
    }
    // edificios
    G.add(pick(factory(P), 'PROV'));
    G.add(pick(factory(P, N.PIMP, '#14B8A6'), 'PIMP'));
    { const o = boxAt(N.PIMP.x - 0.6, N.PIMP.y - 0.6, 0, N.PIMP.w + 4.2, N.PIMP.d + 1.6, 0.07, mat(P.pad, { roughness: 0.9 }), 0.05); o.castShadow = false; G.add(o); }
    ['#2BB3A8', '#3B6FE0', '#F2A900', '#E5484D'].forEach((c, i) => { const ct = container(c, 1.5); ct.position.copy(W(N.PIMP.x + N.PIMP.w + 1.6, N.PIMP.y + 0.2 + (i % 2) * 0.8, Math.floor(i / 2) * 0.64)); ct.rotation.y = Math.PI / 2; G.add(ct); });
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
    zs.forEach(({ z, x, y }) => G.add(pick(plaza(P, x, y, z === 'TIENDAS' ? 'TIENDAS' : z), `Z|${z}`)));
    // patio de contenedores y grúa
    const cols = ['#2BB3A8', '#E5484D', '#3B6FE0', '#F2A900', '#7C5CF0', '#2BB3A8', '#3B6FE0', '#E5484D'];
    for (let i = 0; i < 8; i++) { const r = i % 2, l = Math.floor(i / 4); const c = container(cols[i]); c.position.copy(W(2.7 + 0.95, 1.4 + r * 0.76 + (i % 4 >= 2 ? 1.7 : 0) + 0.34, l * 0.64)); G.add(c); }
    const crane = new THREE.Group(); const gx = -1.6, gy = 5.5;
    [[gx, gy], [gx + 2.6, gy], [gx, gy - 1.3], [gx + 2.6, gy - 1.3]].forEach(([x, y]) => crane.add(boxAt(x, y, 0, 0.16, 0.16, 2.7, mat('#F2B705', { roughness: 0.4, metalness: 0.3 }), 0.02)));
    crane.add(boxAt(gx, gy - 1.3, 2.7, 2.76, 1.46, 0.2, mat('#F2B705', { roughness: 0.4, metalness: 0.3 }), 0.03));
    const trolley = boxAt(gx + 0.8, gy - 1.0, 2.3, 0.55, 0.8, 0.38, mat('#3A3A44'), 0.04); crane.add(trolley);
    const spreader = container('#E5484D', 1.2); spreader.scale.set(1, 0.8, 0.8); crane.add(spreader);
    const cableGeo = memo('crCable', () => new THREE.CylinderGeometry(0.015, 0.015, 1, 6)), cableMat = mat('#1F2937', { metalness: 0.8 });
    const cb1 = new THREE.Mesh(cableGeo, cableMat), cb2 = new THREE.Mesh(cableGeo, cableMat); crane.add(cb1, cb2);
    addAnim((t) => {
      const f = (Math.sin(t * 0.5) + 1) / 2, tx = gx + 0.6 + f * 1.6, sy = 1.1 + Math.abs(Math.sin(t * 0.5)) * 0.9;
      trolley.position.x = tx; spreader.position.set(tx, sy, trolley.position.z);
      const len = Math.max(0.1, 2.3 - (sy + 0.25));
      [[-0.35, cb1], [0.35, cb2]].forEach(([dx, cb]) => { cb.scale.set(1, len, 1); cb.position.set(tx + dx, 2.3 - len / 2, trolley.position.z); });
    });
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
    [[-4, -14], [-3.6, -8], [3.8, -12.5], [4.2, -2.5], [2.8, -1.4], [8, -12.5], [11, -13.4], [15, -12.8], [18.5, -13.4], [9, 7.5], [12, 8.6], [16, 7.2], [18.6, 10.4], [24.6, -4.6], [-4.6, -3], [10.5, 12], [16.8, 20.5], [9, 21], [-14.5, -15], [-7, -15.6], [-14.8, -7], [-7.2, -6.5], [-14.6, -2], [-6.6, 2.6], [-9.5, -8.8], [-12.6, -13.2], [33, -10], [33.2, -3], [33.4, 6], [33.2, 16]].forEach(([x, y], i) => { const tr = tree(P, 0.85 + ((i * 37) % 10) / 22, i); tr.position.copy(W(x, y, 0.05 + (inG(x, y) ? GZ : 0))); tr.rotation.y = i; G.add(tr); });
    // postes de luz a lo largo de los caminos principales
    const bulbM = mat('#FFE9A8', { emissive: '#FFD66B', emissiveIntensity: isDark ? 4 : 0.4 });
    [[5.2, -9], [5.2, -2], [5.2, 3], [10, -4.9], [16, -4.9], [19.7, 0], [19.7, 6], [19.7, 12], [2.5, 5.7], [19.7, -9]].forEach(([lx, ly]) => {
      G.add(boxAt(lx, ly, 0, 0.07, 0.07, 1.5, mat('#4B5563', { metalness: 0.5 }), 0.01));
      G.add(boxAt(lx, ly, 1.45, 0.32, 0.07, 0.05, mat('#4B5563', { metalness: 0.5 }), 0.01));
      const b = mesh(memo('bulb', () => new THREE.SphereGeometry(0.07, 10, 8)), bulbM, false); b.position.copy(W(lx + 0.3, ly + 0.035, 1.4)); G.add(b);
      if (isDark) { // charco de luz cálida en el asfalto (sin PointLight)
        const pool = new THREE.Mesh(memo('poolG', () => { const p = new THREE.PlaneGeometry(2.6, 2.6); p.rotateX(-Math.PI / 2); return p; }), memo('poolM', () => new THREE.MeshBasicMaterial({ map: glowPoolTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        pool.position.copy(W(lx + 0.35, ly, 0.075)); pool.renderOrder = 1; G.add(pool);
      }
    });
    // arbustos junto a las plataformas
    [[7.4, -4.4], [8.4, -4.4], [9.4, -4.4], [17.6, -4.4], [18.6, -4.4], [-2.2, -6.2], [3.2, -6.2], [7.8, 3.9], [18.9, 3.9]].forEach(([bx, by], i) => { const b = mesh(memo('bush', () => new THREE.IcosahedronGeometry(0.26, 1)), mat(new THREE.Color(P.tree).offsetHSL(0, 0, -0.04).getStyle(), { flatShading: true, roughness: 0.9 })); b.position.copy(W(bx, by, 0.18)); b.scale.set(1.2, 0.8, 1); b.rotation.y = i; G.add(b); });
    { // estacionamiento con cajones y topes + autos con rines y luces
      const parkPad = boxAt(9.4, 5.95, GZ, 5.4, 1.65, 0.065, rMat, 0.04); parkPad.castShadow = false; G.add(parkPad);
      for (let i = 0; i <= 4; i++) { const ln = boxAt(9.65 + i * 1.2, 6.1, GZ + 0.066, 0.04, 1.25, 0.005, mat(P.line), 0); ln.castShadow = false; G.add(ln); if (i < 4) G.add(boxAt(10.0 + i * 1.2, 7.25, GZ + 0.066, 0.5, 0.08, 0.04, mat('#F2B705'), 0.01)); }
      const trimM = mat('#14121A', { roughness: 0.7 }), glassM = mat('#0F172A', { roughness: 0.08, metalness: 0.8 }), rimM = mat('#CBD5E1', { metalness: 0.8, roughness: 0.2 });
      [[10.25, '#B91C1C', true], [11.45, '#F8FAFC', false], [12.65, '#1E293B', true], [13.85, '#6D4FD8', false]].forEach(([px, col, suv]) => {
        const car = new THREE.Group(), bodyM = mat(col, { roughness: 0.22, metalness: 0.45 });
        const under = mesh(rbox(0.92, 0.1, 0.46, 0.03), trimM); under.position.y = 0.12; car.add(under);
        const body = mesh(rbox(0.9, 0.22, 0.46, 0.06), bodyM); body.position.y = 0.23; car.add(body);
        const cabL = suv ? 0.58 : 0.46, cab = mesh(rbox(cabL, 0.19, 0.4, 0.06), bodyM); cab.position.set(suv ? -0.06 : -0.03, 0.39, 0); car.add(cab);
        const win = mesh(rbox(cabL + 0.02, 0.14, 0.41, 0.04), glassM, false); win.position.copy(cab.position); car.add(win);
        [[-0.27, 0.22], [-0.27, -0.22], [0.27, 0.22], [0.27, -0.22]].forEach(([wx, wz]) => { const w = mesh(memo('carW', () => new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12)), trimM); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.1, wz); car.add(w); const r = mesh(memo('carR', () => new THREE.CylinderGeometry(0.055, 0.055, 0.085, 8)), rimM, false); r.rotation.x = Math.PI / 2; r.position.set(wx, 0.1, wz); car.add(r); });
        const hl = mesh(memo('cHL', () => new THREE.BoxGeometry(0.02, 0.05, 0.38)), mat('#FEF08A', { emissive: '#FEF08A', emissiveIntensity: isDark ? 1.5 : 0.1 }), false); hl.position.set(0.45, 0.25, 0); car.add(hl);
        const tl = mesh(memo('cTL', () => new THREE.BoxGeometry(0.02, 0.05, 0.38)), mat('#EF4444', { emissive: '#EF4444', emissiveIntensity: isDark ? 1.8 : 0.2 }), false); tl.position.set(-0.45, 0.26, 0); car.add(tl);
        car.rotation.y = -Math.PI / 2; car.position.copy(W(px, 6.72, GZ + 0.065)); G.add(car);
      });
    }
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
      const sh = (sub || '').split(' · ')[0], atR = n > 0 ? Math.min(100, Math.round((ator / n) * 100)) : 0, dot = ator > 0 ? '#E5484D' : color;
      el.style.cssText = `pointer-events:auto;cursor:pointer;background:${active ? (isDark ? 'rgba(48,36,78,0.96)' : 'rgba(238,243,255,0.98)') : P.card};border:1px solid ${active ? color : ator > 0 ? '#E5484D88' : P.cardB};border-radius:11px;padding:5px 10px;font-family:Inter,system-ui,sans-serif;box-shadow:${active ? `0 0 0 2px ${color}55, ` : ''}0 8px 20px rgba(0,0,0,0.24);white-space:nowrap;transform:translateY(-14px);backdrop-filter:blur(8px);opacity:${idle && !active ? (isDark ? 0.68 : 0.9) : 1};`;
      // nombre + dato corto · detalle · barra de salud (rojo = % de líneas atoradas)
      el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:-0.01em;color:${idle && !isDark ? '#374151' : P.text};font-variant-numeric:tabular-nums"><span style="width:8px;height:8px;border-radius:9px;background:${dot};box-shadow:0 0 8px ${dot}"></span><span>${title}</span><span class="sm" style="font-weight:700;color:${ator > 0 ? '#F87171' : P.sub};background:${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'};padding:1px 5px;border-radius:5px;font-size:10px">${sh}</span></div><div class="lg" style="font-size:9.5px;color:${P.sub};margin-top:2px;font-variant-numeric:tabular-nums">${sub || ''}</div>${!idle ? `<div style="height:2.5px;width:100%;background:${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};border-radius:2px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${ator > 0 ? Math.max(18, atR) : 100}%;background:${ator > 0 ? '#E5484D' : color}"></div></div>` : ''}`;
      el.onclick = (e) => { e.stopPropagation(); props.current.onPick?.(key); };
      const o = new CSS2DObject(el); o.position.copy(W(x, y, z)); G.add(o);
      const sm = el.querySelector('.sm'), lg = el.querySelector('.lg');
      const setDetail = (d) => {
        const on = (d || active) && !idle; lg.style.display = on ? 'block' : 'none'; sm.style.display = on || idle ? 'none' : 'inline-block';
        // zonas: en vista general solo la etiqueta agrupada 'Tiendas'; con zoom o selección, una por zona
        if (grp === 'zona') o.visible = !!(d || active || selKey.startsWith('Z|')); // CSS2DRenderer controla display según .visible
        if (grp === 'agg') o.visible = !(d || selKey.startsWith('Z|'));
      };
      S.labelEls.push({ setDetail, el, obj: o, pri: active ? 1e9 : idle ? -1 : ator * 1000 + pzs });
    };
    const pin = (n, x, y, z, key) => { if (!n) return; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex(n), depthTest: false })); sp.scale.set(0.62, 0.83, 1); if (key) sp.userData.pick = key; sp.center.set(0.5, 0); sp.renderOrder = 10; G.add(sp); anim((t) => { sp.position.copy(W(x, y, z + 0.15 + Math.abs(Math.sin(t * 2.6 + x)) * 0.35)); }); };
    // tarimas: se juntan y se dibujan con 3 InstancedMesh (base, caja normal, caja alerta)
    const palletData = [];
    const stack = (x0, y0, pzs, alert, cols = 3) => { const n = pzs > 0 ? Math.min(14, Math.max(1, Math.round(Math.log2(pzs / 60 + 1) * 2.4))) : 0; for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols) % 2, l = Math.floor(i / (cols * 2)); palletData.push({ pos: W(x0 + c * 0.68 + 0.28, y0 + r * 0.68 + 0.28, 0.07 + l * 0.46), alert }); } };
    const SM = semaforo?.nodo || { riesgo: 0.05, atorado: 0.2 };
    const halo = (x, y, w, d, c) => { // campo radial en el piso: verde OK · ámbar riesgo · rojo atorado (onda expansiva)
      if (!c.n) return; const sh = c.ator / c.n; const col = sh >= SM.atorado ? '#E5484D' : sh >= SM.riesgo ? '#F59E0B' : '#22C55E';
      const m = new THREE.MeshBasicMaterial({ map: haloTex(col), transparent: true, opacity: 0.85, depthWrite: false });
      const o = new THREE.Mesh(memo(`hplane:${w}:${d}`, () => { const g = new THREE.PlaneGeometry(w + 1.8, d + 1.8); g.rotateX(-Math.PI / 2); return g; }), m);
      o.position.copy(W(x + w / 2, y + d / 2, 0.085)); o.renderOrder = 2; G.add(o);
      if (sh >= SM.atorado) {
        const pulse = new THREE.Mesh(o.geometry, m.clone()); pulse.position.copy(o.position); pulse.renderOrder = 2; G.add(pulse);
        anim((t) => { const ph = (t * 0.85) % 1; pulse.scale.set(1 + ph * 0.35, 1, 1 + ph * 0.35); pulse.material.opacity = (1 - ph) * 0.65; });
      }
    };
    const ring = (x, y, w, d) => { // marco pulsante + pilar de luz holográfico sobre lo seleccionado
      const g = new THREE.Group(), col = isDark ? '#A78BFA' : '#3B6FE0', m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
      [[x - 0.25, y - 0.25, w + 0.5, 0.08], [x - 0.25, y + d + 0.17, w + 0.5, 0.08], [x - 0.25, y - 0.25, 0.08, d + 0.5], [x + w + 0.17, y - 0.25, 0.08, d + 0.5]].forEach(([a, b, c, e]) => { const sg = new THREE.Mesh(new THREE.BoxGeometry(c, 0.02, e), m); sg.position.copy(W(a + c / 2, b + e / 2, 0.1)); g.add(sg); });
      const rad = Math.max(w, d) * 0.48;
      const bcn = new THREE.Mesh(memo(`bcnG:${rad}`, () => new THREE.CylinderGeometry(rad, rad, 3.8, 24, 1, true)), new THREE.MeshBasicMaterial({ map: beaconTex(col), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      bcn.position.copy(W(x + w / 2, y + d / 2, 1.95)); bcn.renderOrder = 3; g.add(bcn); G.add(g);
      anim((t) => { m.opacity = 0.5 + Math.sin(t * 4) * 0.35; bcn.material.opacity = 0.35 + Math.sin(t * 3) * 0.18; });
    };

    // nodos fijos
    const mg = (a, b) => ({ n: a.n + b.n, pzs: a.pzs + b.pzs, ator: a.ator + b.ator, pzsAtor: (a.pzsAtor || 0) + (b.pzsAtor || 0), ocs: (a.ocs || 0) + (b.ocs || 0) });
    const cPN = mg(cnt('PROVEEDOR|NAC'), cnt('PROVEEDOR|DIR')), cPIm = cnt('PROVEEDOR|IMP');
    const nodes = [
      ['PROV', cPN, N.PROV, 'Proveedores nacionales', 'pzs on order', TIPO_C.NAC, 2.4],
      ['PIMP', cPIm, N.PIMP, 'Proveedores importación', 'pzs on order', TIPO_C.IMP, 2.4],
      ['ADU', 'ADUANA', N.ADUANA, 'Aduana · Puerto', 'pzs', '#E2A93B', 1.9],
      ['ALM', 'ALMACEN', N.ALM, 'PLAN · Almacén', 'pzs en bodega', P.roofA, 3.1],
      ['XD', 'CROSSDOCK', N.XD, 'PLAN · Cross dock', 'pzs in process', P.roofX, 2.2],
      ['FORO', 'FORO', N.FORO, 'Foro fotográfico', 'pzs', '#EC4899', 1.8],
      ['FUL', 'FULFILLMENT', N.FUL, 'Fulfillment', 'pzs', '#14B8A6', 2.3],
    ];
    nodes.forEach(([key, sk, n, title, unit, color, lz]) => {
      const c = typeof sk === 'string' ? cnt(sk) : sk;
      label(key, n.x + n.w / 2, n.y + n.d / 2, n.h + lz, title, c.n ? `${c.ocs} OCs · ${fk(c.pzs)} ${unit}${c.ator ? ` · ${fk(c.pzsAtor || 0)} pzs atoradas` : ''}` : 'Sin pedidos', color, c.n, c.ator, c.pzs);
      pin(c.ator ? fk(c.pzsAtor || 0) : 0, n.x + n.w, n.y + n.d / 2, n.h + 0.6, key);
      halo(n.x, n.y, n.w, n.d, c);
      if (selKey === key) ring(n.x, n.y, n.w, n.d);
    });
    stack(N.PROV.x, N.PROV.y + N.PROV.d + 0.35, cPN.pzs, cPN.ator > 0, 4);
    stack(N.PIMP.x, N.PIMP.y + N.PIMP.d + 0.35, cPIm.pzs, cPIm.ator > 0, 4);
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
    if (palletData.length) {
      const baseIM = new THREE.InstancedMesh(memo('pb', () => new THREE.BoxGeometry(0.56, 0.08, 0.56)), mat('#A47B4F', { roughness: 0.9 }), palletData.length);
      const okL = palletData.filter((p) => !p.alert), alL = palletData.filter((p) => p.alert), boxGeo = rbox(0.5, 0.38, 0.5, 0.03);
      const okIM = okL.length ? new THREE.InstancedMesh(boxGeo, memo('mCartOk', () => new THREE.MeshStandardMaterial({ map: cartonTex(false), roughness: 0.85 })), okL.length) : null;
      const alIM = alL.length ? new THREE.InstancedMesh(boxGeo, memo('mCartAl', () => new THREE.MeshStandardMaterial({ map: cartonTex(true), roughness: 0.85 })), alL.length) : null;
      const m4 = new THREE.Matrix4();
      palletData.forEach((p, i) => { m4.makeTranslation(p.pos.x, p.pos.y + 0.04, p.pos.z); baseIM.setMatrixAt(i, m4); });
      okL.forEach((p, i) => { m4.makeTranslation(p.pos.x, p.pos.y + 0.27, p.pos.z); okIM.setMatrixAt(i, m4); });
      alL.forEach((p, i) => { m4.makeTranslation(p.pos.x, p.pos.y + 0.27, p.pos.z); alIM.setMatrixAt(i, m4); });
      [baseIM, okIM, alIM].forEach((im) => { if (im) { im.castShadow = true; im.receiveShadow = true; G.add(im); } });
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
    zs.forEach((p) => { route(paths.DIR(p), TIPO_C.DIR, hl('DIR'), Math.max(0.02, vDIR / vTot)); route(paths.OUT(p), '#8B6CF6', fTipo === 'DIR' ? 0.12 : 0.9, cnt(`TRANSITO_TDA|${p.z}`).n / vOutTot); });

    // vehículos: cada flota comparte reloj y velocidad, así en los tramos compartidos guardan su distancia y no se enciman
    const tkOp = (color, cont, op) => { const tk = truck(color, cont, isDark); if (op < 1) tk.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = op; } }); return tk; };
    const rr = (lanes) => { const out = []; for (let k = 0; lanes.some((l) => l.length > k); k++) lanes.forEach((l) => { if (l[k]) out.push(l[k]); }); return out; };
    const many = (n, it) => Array.from({ length: Math.max(0, n) }, () => it);
    const fleet = (items, v, gap, mk, z = 0.06) => {
      if (!items.length) return;
      const Ls = items.map((it) => pathLen(it.path)), Lc = Math.max(...Ls) + gap, n = Math.min(items.length, Math.floor(Lc / gap));
      items.slice(0, n).forEach((it, i) => {
        const L = Ls[i], o = add(mk(it), it.key), d0 = (i * Lc) / n;
        o.rotation.order = 'YXZ'; // rumbo primero, luego balanceo sobre el propio eje
        anim((t) => {
          const s = (d0 + t * v) % Lc; if (s > L) { o.visible = false; o.position.set(0, -50, 0); return; } o.visible = true;
          const r = s / L, u = r < 0.08 ? (r / 0.08) * (r / 0.08) * 0.08 : r > 0.92 ? 1 - ((1 - r) / 0.08) * ((1 - r) / 0.08) * 0.08 : r; // arranca y frena suave
          const p = pathAt(it.path, u), vibe = z < 0.1 ? Math.sin(t * 28 + i) * 0.006 : 0; // vibración de motor en camiones
          o.position.copy(W(p.x, p.y, z + vibe)); o.rotation.set(p.turn * 0.14, -p.ang, 0);
        });
      });
    };
    const mkT = (it) => tkOp(it.color, it.cont, it.op);
    const nShip = Math.min(3, cT.n);
    if (!nShip && cPI.n) { const sh = add(shipC(false), 'MAR'); anim((t) => { sh.position.copy(W(-10.2, 8.3, 0.2 + Math.sin(t * 1.2) * 0.05)); sh.rotation.z = Math.sin(t) * 0.02; }); } // barco en el muelle del proveedor: importación aún con proveedor
    fleet(many(nShip, { path: paths.SHIP, key: 'MAR' }), 0.35, 5.6, shipC, 0.2);
    fleet(rr([many(Math.min(3, Math.ceil(cnt('PROVEEDOR|NAC').n / 6)), { path: paths.NAC, color: TIPO_C.NAC, op: hl('NAC'), key: 'PROV' }), many(Math.min(3, cnt('ADUANA').n), { path: paths.IMP, color: TIPO_C.IMP, op: hl('IMP'), cont: true, key: 'ADU' })]), 0.5, 2.4, mkT);
    fleet([...(cnt('FORO').n ? [{ path: paths.FORO, color: '#EC4899', op: 1, key: 'FORO' }] : []), ...(cnt('FULFILLMENT').n ? [{ path: paths.FUL, color: '#14B8A6', op: 1, key: 'FUL' }] : [])], 0.5, 2.4, mkT);
    fleet(rr([...zs.map((p) => many(Math.min(2, cnt(`TRANSITO_TDA|${p.z}|PLAN`).n), { path: paths.OUT(p), color: '#7C5CF0', op: fTipo === 'DIR' ? 0.15 : 1, key: `ZR|${p.z}` })), ...cs.map((p) => many(cnt(`BODEGA_REG|${p.c}`).n ? 1 : 0, { path: paths.BOD(p.y), color: '#0EA5E9', op: 1, key: `CIU|${p.c}` }))]), 0.8, 3.8, mkT);
    fleet(rr(zs.map((p) => many(Math.min(2, cnt(`TRANSITO_TDA|${p.z}|DIR`).n), { path: paths.DIR(p), color: TIPO_C.DIR, op: hl('DIR'), key: `ZR|${p.z}` }))), 0.9, 3.8, mkT);
    // camiones en andén de PLAN con torreta ámbar y humo de escape
    const puffMat = new THREE.MeshBasicMaterial({ color: isDark ? '#CBD5E1' : '#94A3B8', transparent: true, opacity: 0.45, depthWrite: false });
    const beaconMat = mat('#F59E0B', { emissive: '#F59E0B', emissiveIntensity: isDark ? 4 : 1.2 });
    [[9.2, TIPO_C.NAC, cnt('ALMACEN').n > 0], [11.4, TIPO_C.IMP, cnt('ALMACEN').n > 1], [14.5, TIPO_C.NAC, cnt('CROSSDOCK').n > 0], [16.6, TIPO_C.IMP, cnt('CROSSDOCK').n > 1]].forEach(([px, col, on], idx) => {
      if (!on) return; const tk = truck(col, false, isDark); tk.position.copy(W(px, 3.05, 0.07)); tk.rotation.y = -Math.PI / 2; G.add(tk);
      const lamp = mesh(memo('dockLamp', () => new THREE.SphereGeometry(0.06, 8, 8)), beaconMat.clone(), false); lamp.position.copy(W(px, 1.35, 1.45)); G.add(lamp);
      const puff = new THREE.Mesh(memo('puffG', () => new THREE.SphereGeometry(0.11, 8, 6)), puffMat.clone()); G.add(puff);
      anim((t) => {
        lamp.material.emissiveIntensity = (Math.sin(t * 6 + idx * 1.5) > 0 ? 1 : 0.15) * (isDark ? 4.5 : 1.5);
        const ph = (t * 0.7 + idx * 0.35) % 1; puff.position.copy(W(px + 0.25 + ph * 0.2, 3.45 + ph * 0.3, 0.75 + ph * 0.65)); puff.scale.setScalar(0.5 + ph * 1.4); puff.material.opacity = (1 - ph) * 0.4;
      });
    });
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

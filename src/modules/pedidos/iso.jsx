// Primitivas isométricas para la escena de Pedidos (SVG puro, sin librerías).
// Mundo: x → abajo-derecha, y → abajo-izquierda, z → arriba. Unidad = 1 "cuadro".
export const S = 26;
export const P = (x, y, z = 0) => [(x - y) * S * 0.866, (x + y) * S * 0.5 - z * S];
export const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
export const quad = (x0, y0, x1, y1, z = 0) => pts([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)]);

// Aclara / oscurece un color hex
export const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
};

export function Box({ x, y, z = 0, w, d, h, c, top, left, right, stroke = 'rgba(15,23,42,0.10)', sw = 0.8, opacity }) {
  const T = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const R = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  const L = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  return (
    <g opacity={opacity}>
      <polygon points={pts(L)} fill={left || shade(c, -0.18)} stroke={stroke} strokeWidth={sw} />
      <polygon points={pts(R)} fill={right || shade(c, 0.08)} stroke={stroke} strokeWidth={sw} />
      <polygon points={pts(T)} fill={top || shade(c, 0.22)} stroke={stroke} strokeWidth={sw} />
    </g>
  );
}
// Rectángulo sobre la cara izquierda (plano y = y0) entre u (x) y v (z)
export const faceL = (y0, x0, x1, z0, z1) => pts([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)]);
// Rectángulo sobre la cara derecha (plano x = x0) entre u (y) y v (z)
export const faceR = (x0, y0, y1, z0, z1) => pts([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)]);
// Círculo proyectado sobre un plano horizontal
export const circleZ = (cx, cy, z, r, n = 18) => pts(Array.from({ length: n }, (_, i) => P(cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI), z)));

// Nave con techo de dos aguas (cumbrera a lo largo de x), costillas en el techo y puertas en la fachada izquierda
export function Warehouse({ x, y, w, d, h, roof, wall = '#F4F6FB', doors = 3, logo, dark, rh = 0.55, windows = true, doorColor }) {
  const wallL = dark ? '#2C2640' : shade(wall, -0.06), wallR = dark ? '#363050' : wall;
  const back = [P(x, y, h), P(x + w, y, h), P(x + w, y + d / 2, h + rh), P(x, y + d / 2, h + rh)];
  const front = [P(x, y + d, h), P(x + w, y + d, h), P(x + w, y + d / 2, h + rh), P(x, y + d / 2, h + rh)];
  const gable = [P(x + w, y, h), P(x + w, y + d, h), P(x + w, y + d / 2, h + rh)];
  const ribs = [];
  for (let i = 1; i < Math.round(w / 0.45); i++) { const u = x + (i * w) / Math.round(w / 0.45); const [a, b] = [P(u, y + d, h), P(u, y + d / 2, h + rh)]; ribs.push(<line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={shade(roof, 0.25)} strokeWidth="0.9" opacity="0.7" />); }
  const dc = doorColor || shade(roof, -0.25);
  const ds = [];
  for (let i = 0; i < doors; i++) {
    const u0 = x + 0.35 + (i * (w - 0.5)) / doors, u1 = u0 + Math.min(0.9, (w - 0.7) / doors - 0.15);
    ds.push(<polygon key={`f${i}`} points={faceL(y + d, u0 - 0.06, u1 + 0.06, 0, Math.min(1.25, h * 0.72) + 0.08)} fill={dc} />);
    ds.push(<polygon key={`d${i}`} points={faceL(y + d, u0, u1, 0, Math.min(1.25, h * 0.72))} fill={dark ? '#4A4266' : '#DCE3EE'} />);
    for (let k = 1; k < 5; k++) { const zz = (Math.min(1.25, h * 0.72) * k) / 5; const [a, b] = [P(u0, y + d, zz), P(u1, y + d, zz)]; ds.push(<line key={`s${i}${k}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={dark ? '#5C5480' : '#C3CCDB'} strokeWidth="0.8" />); }
  }
  const win = [];
  if (windows) for (let i = 0; i < Math.floor(d / 0.7); i++) { const v0 = y + 0.3 + i * 0.7; win.push(<polygon key={`w${i}`} points={faceR(x + w, v0, v0 + 0.4, h * 0.62, h * 0.85)} fill={dark ? '#E0BB3E' : '#BFD6F6'} opacity={dark ? 0.75 : 1} />); }
  return (
    <g>
      <polygon points={pts([P(x, y + d, 0), P(x + w, y + d, 0), P(x + w, y + d, h), P(x, y + d, h)])} fill={wallL} stroke="rgba(15,23,42,0.08)" />
      <polygon points={pts([P(x + w, y, 0), P(x + w, y + d, 0), P(x + w, y + d, h), P(x + w, y, h)])} fill={wallR} stroke="rgba(15,23,42,0.08)" />
      {/* franja de color en la base */}
      <polygon points={faceL(y + d, x, x + w, 0, 0.12)} fill={shade(roof, -0.1)} />
      <polygon points={faceR(x + w, y, y + d, 0, 0.12)} fill={shade(roof, -0.05)} />
      {win}{ds}
      <polygon points={pts(back)} fill={shade(roof, -0.12)} />
      <polygon points={pts(gable)} fill={dark ? '#3E3760' : shade(wall, -0.02)} stroke="rgba(15,23,42,0.08)" />
      <polygon points={pts(front)} fill={roof} />
      {ribs}
      <line x1={P(x, y + d / 2, h + rh)[0]} y1={P(x, y + d / 2, h + rh)[1]} x2={P(x + w, y + d / 2, h + rh)[0]} y2={P(x + w, y + d / 2, h + rh)[1]} stroke={shade(roof, 0.4)} strokeWidth="1.6" />
      {logo && (() => { const [cx, cy] = P(x + w * 0.62, y + d * 0.75, h + rh * 0.5); return <g><ellipse cx={cx} cy={cy} rx="11" ry="6.5" fill="#fff" opacity="0.95" /><text x={cx} y={cy + 3} textAnchor="middle" fontSize="7" fontWeight="900" fill={shade(roof, -0.2)}>{logo}</text></g>; })()}
    </g>
  );
}

// Camión: cabina de color + caja blanca con franja; dir 'x' o 'y'; rev invierte el sentido
export function TruckSprite({ x, y, dir = 'x', rev = false, color = '#3B6FE0', trailer = '#FFFFFF', cont, dark }) {
  const along = dir === 'x', L = 1.7, W = 0.62;
  const ox = x - (along ? L / 2 : W / 2), oy = y - (along ? W / 2 : L / 2);
  const cab = along ? { x: rev ? ox : ox + L - 0.5, y: oy, w: 0.5, d: W } : { x: ox, y: rev ? oy : oy + L - 0.5, w: W, d: 0.5 };
  const box = along ? { x: rev ? ox + 0.56 : ox, y: oy, w: L - 0.56, d: W } : { x: ox, y: rev ? oy + 0.56 : oy, w: W, d: L - 0.56 };
  const wheels = [];
  const wpos = along ? [[ox + 0.25, oy + W], [ox + L - 0.3, oy + W], [ox + L * 0.45, oy + W]] : [[ox + W, oy + 0.25], [ox + W, oy + L - 0.3], [ox + W, oy + L * 0.45]];
  wpos.forEach(([wx, wy], i) => { const [cx, cy] = P(wx, wy, 0.1); wheels.push(<ellipse key={i} cx={cx} cy={cy} rx="3.6" ry="3" fill="#1F2430" />); });
  const tc = cont || trailer;
  return (
    <g>
      <ellipse cx={P(x, y, 0)[0]} cy={P(x, y, 0)[1] + 3} rx="26" ry="9" fill="#0F172A" opacity="0.12" />
      {wheels}
      <Box {...box} z={0.12} h={0.72} c={tc} top={shade(tc, cont ? 0.15 : -0.02)} left={shade(tc, cont ? -0.2 : -0.1)} right={shade(tc, cont ? 0.05 : -0.04)} />
      {!cont && (along
        ? <polygon points={faceL(box.y + box.d, box.x + 0.05, box.x + box.w - 0.05, 0.4, 0.55)} fill={color} />
        : <polygon points={faceR(box.x + box.w, box.y + 0.05, box.y + box.d - 0.05, 0.4, 0.55)} fill={color} />)}
      <Box {...cab} z={0.12} h={0.58} c={color} />
      {along
        ? <polygon points={faceL(cab.y + cab.d, rev ? cab.x + 0.04 : cab.x + 0.22, rev ? cab.x + 0.28 : cab.x + 0.46, 0.38, 0.62)} fill={dark ? '#9EC5FF' : '#CFE4FF'} />
        : <polygon points={faceR(cab.x + cab.w, rev ? cab.y + 0.04 : cab.y + 0.22, rev ? cab.y + 0.28 : cab.y + 0.46, 0.38, 0.62)} fill={dark ? '#9EC5FF' : '#CFE4FF'} />}
    </g>
  );
}

// Barco portacontenedores (a lo largo de x)
export function Ship({ x, y, bob = 0 }) {
  const L = 4.2, W = 1.1, z = -0.15 + bob * 0.05;
  const hull = [P(x, y, z), P(x + L - 0.6, y, z), P(x + L, y + W / 2, z), P(x + L - 0.6, y + W, z), P(x, y + W, z)];
  const hullTop = hull.map(([sx, sy]) => [sx, sy - 0.5 * S]);
  const side = [P(x, y + W, z), P(x + L - 0.6, y + W, z), P(x + L, y + W / 2, z), P(x + L, y + W / 2, z + 0.5), P(x + L - 0.6, y + W, z + 0.5), P(x, y + W, z + 0.5)];
  const cols = ['#E5484D', '#2BB3A8', '#3B6FE0', '#F2A900', '#2BB3A8', '#E5484D'];
  return (
    <g>
      <polygon points={pts(side)} fill="#1F3A68" />
      <polygon points={pts(hullTop)} fill="#2E5597" />
      <polygon points={pts([P(x, y + W, z + 0.08), P(x + L - 0.6, y + W, z + 0.08), P(x + L, y + W / 2, z + 0.08), P(x + L, y + W / 2, z + 0.16), P(x + L - 0.6, y + W, z + 0.16), P(x, y + W, z + 0.16)])} fill="#C2423F" />
      {[0, 1, 2].map((i) => [0, 1].map((j) => <Box key={`${i}${j}`} x={x + 0.9 + i * 0.85} y={y + 0.12 + j * 0.45} z={z + 0.5} w={0.78} d={0.4} h={0.36} c={cols[(i * 2 + j) % 6]} stroke="rgba(0,0,0,0.2)" />))}
      <Box x={x + 0.15} y={y + 0.2} z={z + 0.5} w={0.55} d={0.7} h={0.75} c="#F4F6FB" />
      <polygon points={faceR(x + 0.7, y + 0.28, y + 0.82, z + 1.05, z + 1.15)} fill="#1F3A68" />
    </g>
  );
}

export function Tree({ x, y, s = 1, color = '#5DBB7A' }) {
  const [sx, sy] = P(x, y, 0);
  return (
    <g>
      <ellipse cx={sx + 4} cy={sy + 2} rx={11 * s} ry={5 * s} fill="#0F172A" opacity="0.12" />
      <rect x={sx - 1.8} y={sy - 14 * s} width="3.6" height={14 * s} rx="1" fill="#8B6B4A" />
      <circle cx={sx} cy={sy - 22 * s} r={11 * s} fill={color} />
      <circle cx={sx + 3 * s} cy={sy - 18 * s} r={7 * s} fill={shade(color, -0.12)} opacity="0.6" />
      <circle cx={sx - 4 * s} cy={sy - 27 * s} r={4.5 * s} fill="#fff" opacity="0.18" />
    </g>
  );
}

// Tarima con cajas
export function Pallet({ x, y, z = 0, color = '#E2B57A', alert }) {
  const c = alert ? '#F08A8A' : color;
  return (
    <g>
      <Box x={x} y={y} z={z} w={0.56} d={0.56} h={0.07} c="#A0794F" />
      <Box x={x + 0.03} y={y + 0.03} z={z + 0.07} w={0.5} d={0.5} h={0.36} c={c} />
      <polygon points={faceL(y + 0.53, x + 0.03, x + 0.53, z + 0.24, z + 0.27)} fill={shade(c, -0.3)} opacity="0.5" />
    </g>
  );
}

export function Forklift({ x, y, carrying, rev }) {
  return (
    <g>
      <ellipse cx={P(x + 0.3, y + 0.25, 0)[0]} cy={P(x + 0.3, y + 0.25, 0)[1] + 2} rx="12" ry="5" fill="#0F172A" opacity="0.12" />
      <Box x={x} y={y} z={0.08} w={0.62} d={0.45} h={0.32} c="#F2B705" />
      <Box x={x + 0.12} y={y + 0.08} z={0.4} w={0.32} d={0.3} h={0.32} c="#3A3A44" />
      <Box x={rev ? x + 0.62 : x - 0.1} y={y + 0.05} z={0.08} w={0.08} d={0.35} h={0.8} c="#6B7280" />
      {carrying && <Pallet x={rev ? x + 0.72 : x - 0.66} y={y - 0.05} z={0.1} />}
    </g>
  );
}

export function MapPin({ x, y, z, n, color = '#3B6FE0', t = 0 }) {
  const [sx, sy] = P(x, y, z); const b = Math.sin(t * 3.2 + x * 1.7) * 3.5;
  return (
    <g transform={`translate(${sx},${sy - 6 + b})`} style={{ pointerEvents: 'none' }}>
      <ellipse cx="0" cy={6 - b} rx="6" ry="2.5" fill="#0F172A" opacity="0.15" />
      <path d="M0,0 C-11,-12 -11,-28 0,-28 C11,-28 11,-12 0,0 Z" fill={color} stroke="#fff" strokeWidth="1.6" />
      <circle cx="0" cy="-17" r="6.5" fill="#fff" />
      <text x="0" y="-14.2" textAnchor="middle" fontSize="8" fontWeight="900" fill={color}>{n}</text>
    </g>
  );
}

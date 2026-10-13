// Distribución del mundo de la escena de Pedidos (coordenadas de mundo: x, y en el piso; z altura).
export const N = {
  PROV: { x: -1, y: -9.2, w: 3.4, d: 2.6, h: 1.4 },
  ADUANA: { x: -0.6, y: 1.8, w: 2.8, d: 2.1, h: 1.2 },
  ALM: { x: 8.2, y: -2.8, w: 4.8, d: 4, h: 2.1 },
  XD: { x: 13.8, y: -2.4, w: 3.4, d: 3.6, h: 1.35 },
  FORO: { x: 8.4, y: -8.6, w: 2.4, d: 2, h: 1.25 },
  FUL: { x: 12.6, y: -8.8, w: 3.6, d: 2.3, h: 1.45 },
};
export const XV1 = 6, XV2 = 20.5, XDIR = 27.2, YTOP = -12, YFAC = -5.6, YLOW = 4.9;
export const zonaPos = (i) => ({ x: 23.2, y: -1.2 + i * 4 });
export const ciudadPos = (i) => ({ x: 22.6, y: -15.2 + i * 2.8 });

// Vistas de cámara: centro (x, y) y zoom
export const SITES = {
  RED: { l: 'Red completa', x: 7, y: -1, z: 1.15 },
  PROV: { l: 'Proveedores', x: 0.5, y: -8, z: 2.4 },
  PUERTO: { l: 'Puerto · Aduana', x: -2, y: 5, z: 2 },
  PLAN: { l: 'PLAN · Almacén y cross dock', x: 12.8, y: 0.2, z: 2.1 },
  NORTE: { l: 'Foro y fulfillment', x: 12.5, y: -8, z: 2.4 },
  BOD: { l: 'Bodegas regionales', x: 23.5, y: -11, z: 2.2 },
  TDAS: { l: 'Zonas de tiendas', x: 24.5, y: 8, z: 1.7 },
};
export const siteOfKey = (k = '') => (k === 'PROV' ? 'PROV' : k === 'ADU' || k === 'MAR' ? 'PUERTO' : k === 'ALM' || k === 'XD' ? 'PLAN' : k === 'FORO' || k === 'FUL' ? 'NORTE' : k.startsWith('CIU|') ? 'BOD' : k.startsWith('Z|') ? 'TDAS' : null);

export const paths = {
  NAC: [[1.2, YFAC], [XV1, YFAC], [XV1, 1.9], [8.4, 1.9]],
  IMP: [[2.6, YLOW], [XV1, YLOW], [XV1, 1.9], [8.4, 1.9]],
  SHIP: [[-17, 9.2], [-3.4, 9.2]],
  DIR: (zy) => [[-0.4, YFAC], [-2.6, YFAC], [-2.6, YTOP], [XDIR, YTOP], [XDIR, zy + 1.0], [25.9, zy + 1.0]],
  OUT: (zy) => [[15.6, 2.4], [15.6, YLOW], [XV2, YLOW], [XV2, zy + 1.0], [23.0, zy + 1.0]],
  BOD: (cy) => [[15.6, 2.4], [15.6, YLOW], [XV2, YLOW], [XV2, cy + 0.9], [22.4, cy + 0.9]],
  FORO: [[XV1, 1.9], [XV1, YFAC], [9.6, YFAC]],
  FUL: [[XV1, 1.9], [XV1, YFAC], [14.4, YFAC]],
};
export const roadsFor = (zs, cs, yBot) => [
  [[-2.6, YFAC], [XV1, YFAC]], [[XV1, YFAC], [XV2, YFAC]], [[XV1, YTOP], [XV1, YLOW]], [[1.2, YLOW], [XV2, YLOW]],
  [[XV2, -16], [XV2, yBot]], [[-2.6, YTOP], [-2.6, YFAC]], [[-2.6, YTOP], [XDIR, YTOP]], [[XDIR, YTOP], [XDIR, yBot]],
  [[15.6, 1.6], [15.6, YLOW]],
  ...zs.flatMap((p) => [[[XV2, p.y + 1], [23.1, p.y + 1]], [[25.6, p.y + 1], [XDIR, p.y + 1]]]),
  ...cs.map((p) => [[XV2, p.y + 0.9], [22.5, p.y + 0.9]]),
];
export const pathAt = (path, f) => {
  const seg = []; let L = 0;
  for (let i = 0; i < path.length - 1; i++) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); seg.push(l); L += l; }
  let d = f * L;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) { const r = seg[i] ? d / seg[i] : 0; const a = path[i], b = path[i + 1]; return { x: a[0] + (b[0] - a[0]) * r, y: a[1] + (b[1] - a[1]) * r, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
    d -= seg[i];
  }
  const b = path[path.length - 1], a = path[path.length - 2] || b; return { x: b[0], y: b[1], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
};

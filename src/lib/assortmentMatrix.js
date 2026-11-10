// Matriz de compra (Assortment): ppto GOA × mes → bucket → punto de precio (campana) → piezas → modelos según tiendas elegibles × pzs por tienda.
// Funciones puras (sin React).

// 4 puntos de precio a partir del histórico, respetando la campana (corte óptimo 1D ponderado por piezas).
// hist: [{ pvp, u, p }] → puntos de menor a mayor: PVP representativo (el de más piezas del tramo), rango y % en $.
export function pricePoints(hist, k = 4) {
  const m = new Map();
  (hist || []).forEach(h => {
    const pvp = Number(h.pvp), u = Number(h.u);
    if (!(pvp > 0) || !(u > 0)) return;
    const x = m.get(pvp) || { pvp, u: 0, p: 0 };
    x.u += u; x.p += Number(h.p) > 0 ? Number(h.p) : pvp * u; m.set(pvp, x);
  });
  const d = [...m.values()].sort((a, b) => a.pvp - b.pvp), n = d.length;
  if (!n) return { points: [], bell: [] };
  k = Math.min(k, n);
  const U = [0], UP = [0], UP2 = [0];
  d.forEach(x => { U.push(U[U.length - 1] + x.u); UP.push(UP[UP.length - 1] + x.u * x.pvp); UP2.push(UP2[UP2.length - 1] + x.u * x.pvp * x.pvp); });
  const cost = (i, j) => { const u = U[j] - U[i]; return u > 0 ? (UP2[j] - UP2[i]) - (UP[j] - UP[i]) ** 2 / u : 0; };
  const D = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity)), C = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0));
  D[0][0] = 0;
  for (let g = 1; g <= k; g++) for (let j = g; j <= n; j++) for (let i = g - 1; i < j; i++) { const v = D[g - 1][i] + cost(i, j); if (v < D[g][j]) { D[g][j] = v; C[g][j] = i; } }
  const cuts = []; let j = n;
  for (let g = k; g >= 1; g--) { const i = C[g][j]; cuts.unshift([i, j]); j = i; }
  const tot = d.reduce((a, x) => a + x.p, 0) || 1;
  const points = cuts.map(([i, jj]) => {
    const seg = d.slice(i, jj), top = seg.reduce((a, x) => (x.u > a.u ? x : a), seg[0]);
    return { pvp: top.pvp, lo: seg[0].pvp, hi: seg[seg.length - 1].pvp, u: U[jj] - U[i], pct: seg.reduce((a, x) => a + x.p, 0) / tot * 100 };
  });
  return { points, bell: d.map(x => ({ pvp: x.pvp, u: x.u })) };
}

// budget: [$ por mes]  ·  buckets: [{ id, name, pct (0-1), points: [{ pvp, pct (0-100) }], stores: [{ id, cluster, qty }] }]
// Modelos enteros con acumulado: lo que no alcanza a 1 modelo (o el redondeo) pasa al mes siguiente; el remanente final queda como no asignado.
export function buildMatrix({ budget, buckets, tol = 0.10 }) {
  const nM = budget.length;
  return buckets.map(b => {
    const stores = (b.stores || []).filter(s => s.qty > 0);
    const pzsModelo = stores.reduce((a, s) => a + s.qty, 0);
    const pts = (b.points || []).filter(p => p.pvp > 0);
    const pTot = pts.reduce((a, p) => a + (Number(p.pct) || 0), 0) || 1;
    const points = pts.map(p => {
      let carry = 0;
      const cells = budget.map((bm, m) => {
        const otb = bm * b.pct * ((Number(p.pct) || 0) / pTot);
        const pzs = otb / p.pvp, mod = pzsModelo > 0 ? pzs / pzsModelo : 0;
        const acc = mod + carry, modelos = acc >= 1 ? Math.round(acc) : 0; carry = acc - modelos;
        const importe = modelos * pzsModelo * p.pvp, dif = otb > 0 ? (importe - otb) / otb : 0;
        return { mes: m, otb, pzs, mod, modelos, pzsReal: modelos * pzsModelo, importe, dif, sinModelo: mod > 0 && modelos === 0, fueraTol: otb > 0 && Math.abs(dif) > tol };
      });
      const sum = (f) => cells.reduce((a, c) => a + c[f], 0);
      return { pvp: p.pvp, pct: (Number(p.pct) || 0) / pTot * 100, cells, otb: sum('otb'), modelos: sum('modelos'), pzsReal: sum('pzsReal'), importe: sum('importe'), sinAsignar: carry * pzsModelo * p.pvp };
    });
    const sum = (f) => points.reduce((a, p) => a + p[f], 0);
    return { id: b.id, name: b.name, tiendas: stores.length, pzsModelo, stores, points,
      otb: sum('otb'), modelos: sum('modelos'), pzsReal: sum('pzsReal'), importe: sum('importe'), sinAsignar: sum('sinAsignar'),
      modelosMes: Array.from({ length: nM }, (_, m) => points.reduce((a, p) => a + p.cells[m].modelos, 0)),
      importeMes: Array.from({ length: nM }, (_, m) => points.reduce((a, p) => a + p.cells[m].importe, 0)),
      otbMes: Array.from({ length: nM }, (_, m) => points.reduce((a, p) => a + p.cells[m].otb, 0)) };
  });
}

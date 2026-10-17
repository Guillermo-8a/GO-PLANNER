// src/utils/demandaEngine.js — Diagnóstico de demanda (lectura + clasificación). Sin React para poder probarlo en node.
// Entrada: CSV de BigQuery, una fila por MODELO × SEMANA (lunes) a nivel cadena:
//   SEMANA, SECCION, GOA, MARCA, MODELO, TEMPORADA, LETRA_ACTUAL, VTA_U, VTA_U_DESC, VTA_P, DESC_P, TIENDAS_CON_VTA, TIENDAS_ACTIVAS
// Clasificación de demanda (Syntetos-Boylan) entre la 1a y la última semana con venta:
//   ADI = semanas / semanas con venta · CV² = (desv. est. / promedio)² de las semanas con venta · cortes 1.32 y 0.49.
// Disponibilidad sin OH histórico: cobertura = tiendas con venta / tiendas activas (proxy).

export const MIN_VIDA = 26; // semanas desde la 1a venta para clasificar
export const TIPOS = ['Suave', 'Errático', 'Intermitente', 'Irregular'];
export const TIPO_INFO = {
  Suave: { color: '#34d399', regla: 'ADI < 1.32 · CV² < 0.49', txt: 'Vende casi todas las semanas y parejo' },
  'Errático': { color: '#E0BB3E', regla: 'ADI < 1.32 · CV² ≥ 0.49', txt: 'Vende seguido pero con picos fuertes' },
  Intermitente: { color: '#9575CD', regla: 'ADI ≥ 1.32 · CV² < 0.49', txt: 'Semanas sin venta, cantidades parejas' },
  Irregular: { color: '#D63F8C', regla: 'ADI ≥ 1.32 · CV² ≥ 0.49', txt: 'Semanas sin venta y cantidades erráticas' },
};
export const ACCIONES = ['Básico', 'Temporada', 'Falla de inventario', 'No sirve', 'Mantener / revisar', 'En observación'];
export const ACCION_INFO = {
  'Básico': { color: '#34d399', accion: 'Resurtido continuo: nunca quebrar' },
  Temporada: { color: '#E0BB3E', accion: 'Compra única por temporada y plan de salida' },
  'Falla de inventario': { color: '#FB923C', accion: 'Resurtir: revisar mínimos y distribución' },
  'No sirve': { color: '#D63F8C', accion: 'Liquidar y no recomprar → Nulo Movimiento' },
  'Mantener / revisar': { color: '#9575CD', accion: 'Desempeño medio: revisar precio o surtido' },
  'En observación': { color: '#9A9CA3', accion: 'Poca historia: comparar su venta contra su GOA' },
};

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const str = (v) => String(v ?? '').trim();
const ALIAS = {
  semana: ['SEMANA', 'LUNES', 'FECHA'], sec: ['SECCION'], goa: ['GOA', 'GRUPO ARTICULOS', 'N GOA'], marca: ['MARCA'],
  modelo: ['MODELO', 'MODELO PROVEEDOR'], temp: ['TEMPORADA'], letra: ['LETRA ACTUAL', 'LETRA'],
  u: ['VTA U', 'VTAS U', 'VENTA U'], ud: ['VTA U DESC'], p: ['VTA P', 'VTAS P', 'VENTA P'], dp: ['DESC P'],
  t: ['TIENDAS CON VTA'], act: ['TIENDAS ACTIVAS'],
};

const splitLine = (line, d) => {
  if (line.indexOf('"') < 0) return line.split(d);
  const out = []; let f = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === d) { out.push(f); f = ''; } else f += ch;
  }
  out.push(f); return out;
};

export function parseDemanda(text, name = '') {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('El archivo viene vacío.');
  const d = [',', ';', '\t', '|'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const h = splitLine(lines[0], d).map(norm), c = {};
  Object.entries(ALIAS).forEach(([k, al]) => { const i = h.findIndex((x) => al.includes(x)); if (i >= 0) c[k] = i; });
  if (c.semana == null || c.modelo == null || c.u == null) throw new Error('Faltan columnas: SEMANA, MODELO y VTA_U son obligatorias.');
  const rows = [], wset = new Set();
  for (let i = 1; i < lines.length; i++) {
    const r = splitLine(lines[i], d), m = str(r[c.modelo]), w = str(r[c.semana]).slice(0, 10);
    if (!m || m === '#' || !/^\d{4}-\d{2}-\d{2}$/.test(w)) continue;
    rows.push([m, w, r]); wset.add(w);
  }
  const W = [...wset].sort(), wi = new Map(W.map((w, i) => [w, i])), NW = W.length;
  const act = new Array(NW).fill(0), M = new Map();
  const g = (r, k) => (c[k] != null ? r[c[k]] : '');
  for (const [m, w, r] of rows) {
    const i = wi.get(w);
    let x = M.get(m);
    if (!x) M.set(m, (x = { k: m, sec: str(g(r, 'sec')) || '—', goa: str(g(r, 'goa')) || '—', marca: str(g(r, 'marca')) || '—', temp: str(g(r, 'temp')) || '—', letra: str(g(r, 'letra')) || 'Sin Asignar', u: new Array(NW).fill(0), ud: new Array(NW).fill(0), p: new Array(NW).fill(0), dp: new Array(NW).fill(0), t: new Array(NW).fill(0) }));
    x.u[i] += num(g(r, 'u')); x.ud[i] += num(g(r, 'ud')); x.p[i] += num(g(r, 'p')); x.dp[i] += num(g(r, 'dp')); x.t[i] += num(g(r, 't'));
    act[i] = Math.max(act[i], num(g(r, 'act')));
  }
  if (!M.size) throw new Error('No encontré filas válidas (SEMANA con formato AAAA-MM-DD).');
  return { name, loadedAt: Date.now(), W, act, M: [...M.values()] };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sum = (a, i0 = 0, i1 = a.length) => { let s = 0; for (let i = i0; i < i1; i++) s += a[i]; return s; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const p100 = (v) => `${Math.round(v * 100)}%`;
const x1 = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

export const tipoDe = (adi, cv2) => (adi < 1.32 ? (cv2 < 0.49 ? 'Suave' : 'Errático') : cv2 < 0.49 ? 'Intermitente' : 'Irregular');
export const esLiquidado = (letra) => !!letra && norm(letra) !== 'SIN ASIGNAR' && norm(letra) !== 'REGULAR';

// Métricas y acción por modelo
export function diagnosticar(X) {
  const { W, act, M } = X, NW = W.length;
  const R = M.map((m) => {
    const u = m.u, sale = [];
    for (let i = 0; i < NW; i++) if (u[i] > 0) sale.push(i);
    const totU = sum(u), totP = sum(m.p), liq = esLiquidado(m.letra);
    const base = { m, totU, totP, liq, nSale: sale.length };
    if (!sale.length) return { ...base, vida: 0, tipo: null, accion: 'En observación', porque: 'Sin venta en la ventana' };
    const f = sale[0], l = sale[sale.length - 1], vida = NW - f, span = l - f + 1, nz = sale.map((i) => u[i]);
    const mu = mean(nz), sd = Math.sqrt(mean(nz.map((v) => (v - mu) ** 2)));
    const adi = span / sale.length, cv2 = mu ? (sd / mu) ** 2 : 0, tipo = sale.length >= 2 ? tipoDe(adi, cv2) : null;
    const cov = act.map((a, i) => (a ? m.t[i] / a : 0));
    const cs = cov.slice(f, l + 1).sort((a, b) => a - b), pk = cs[Math.floor(0.9 * (cs.length - 1))];
    const rec = NW - 8 >= f ? mean(cov.slice(NW - 8)) : null;
    const vps = totU / span, desc = totU ? sum(m.ud) / totU : 0, last = NW - 1 - l;
    const w52 = Math.max(f, NW - 52); let s52 = 0; for (let i = w52; i < NW; i++) if (u[i] > 0) s52++;
    const pres = s52 / (NW - w52);
    let best = 0; for (let i = f; i <= Math.max(f, NW - 13); i++) best = Math.max(best, sum(u, i, Math.min(NW, i + 13)));
    const conc = totU ? best / totU : 0;
    const l4 = sale.slice(-4), fade = mean(l4.map((i) => u[i])) / mu, d4 = sum(l4.map((i) => m.ud[i])) / Math.max(1, sum(l4.map((i) => u[i])));
    const ros = (a, b) => sum(u, a, b) / Math.max(1, sum(m.t, a, b));
    const corte = last >= 3 && fade >= 0.7 && d4 < 0.5; // se cortó la venta sin desgaste ni rebaja
    const merma = last < 3 && rec != null && pk > 0 && rec < 0.5 * pk && ros(NW - 8, NW) >= 0.8 * ros(f, l + 1); // menos tiendas, misma venta por tienda
    return { ...base, f, l, vida, span, adi, cv2, tipo, pk, rec, vps, desc, last, pres, conc, fade, corte, merma };
  });
  // Índice vs mediana de venta semanal de su GOA (modelos con historia suficiente)
  const byGoa = new Map();
  R.forEach((r) => { if (r.vida >= MIN_VIDA) { const a = byGoa.get(r.m.goa) || []; a.push(r.vps); byGoa.set(r.m.goa, a); } });
  const med = new Map([...byGoa].map(([g, a]) => [g, median(a)]));
  R.forEach((r) => {
    if (!r.nSale) return;
    r.idx = med.get(r.m.goa) ? r.vps / med.get(r.m.goa) : null;
    const ix = r.idx ?? 1;
    if (r.vida < MIN_VIDA) { r.accion = 'En observación'; r.porque = `${r.vida} semanas desde su 1a venta (< ${MIN_VIDA}); vende ${x1(ix)}× la mediana de su GOA`; }
    else if (r.nSale < 8) { r.accion = 'No sirve'; r.porque = `Solo ${r.nSale} semanas con venta en ${r.vida} de vida`; }
    else if (ix < 0.5 && (r.tipo === 'Intermitente' || r.tipo === 'Irregular')) { r.accion = 'No sirve'; r.porque = `Demanda ${r.tipo.toLowerCase()} y vende ${x1(ix)}× la mediana de su GOA`; }
    else if (ix >= 1 && r.corte) { r.accion = 'Falla de inventario'; r.porque = `Dejó de vender hace ${r.last} sem sin bajar ritmo (últimas 4 sem = ${p100(r.fade)} de su promedio) y sin rebaja`; }
    else if (ix >= 1 && r.merma) { r.accion = 'Falla de inventario'; r.porque = `Se vende en ${p100(r.rec)} de las tiendas vs ${p100(r.pk)} en su pico, con la misma venta por tienda`; }
    else if (r.adi < 1.32 && r.cv2 < 1 && r.pres >= 0.8 && r.conc < 0.35) { r.accion = 'Básico'; r.porque = `Vende ${p100(r.pres)} de las semanas del último año, sin pico estacional (máx. 13 sem = ${p100(r.conc)})`; }
    else if (r.tipo === 'Errático' || r.tipo === 'Suave' || r.conc >= 0.45) { r.accion = 'Temporada'; r.porque = r.conc >= 0.45 ? `${p100(r.conc)} de su venta en 13 semanas` : `Vende seguido pero con picos (CV² ${r.cv2.toFixed(2)})`; }
    else { r.accion = 'Mantener / revisar'; r.porque = `Demanda ${String(r.tipo).toLowerCase()}, vende ${x1(ix)}× la mediana de su GOA`; }
  });
  return R;
}

// Venta mensual de un modelo (la semana cuenta en el mes de su jueves)
export function mensual(X, m) {
  const out = new Map();
  X.W.forEach((w, i) => {
    const d = new Date(`${w}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 3);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let o = out.get(k); if (!o) out.set(k, (o = { mes: k, u: 0, ud: 0, p: 0, dp: 0, t: 0, n: 0 }));
    o.u += m.u[i]; o.ud += m.ud[i]; o.p += m.p[i]; o.dp += m.dp[i]; o.t += m.t[i]; o.n++;
  });
  return [...out.values()].map((o) => ({ ...o, pDesc: o.u ? o.ud / o.u : 0, tiendas: o.t / o.n }));
}

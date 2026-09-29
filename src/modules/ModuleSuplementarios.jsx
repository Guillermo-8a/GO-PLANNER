// src/modules/ModuleSuplementarios.jsx
// Suplementarios (Financial): OTB general mensual → bajada a Marca/Proveedor.
// La bajada usa ajuste proporcional iterativo (IPF): respeta la estacionalidad histórica
// de cada entidad y SIEMPRE cuadra al OTB mensual. Celdas editadas a mano quedan fijas (lock).
import { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, ComposedChart, LineChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { Upload, Download, Lock, RotateCcw, Check, AlertCircle, Trash2, Copy } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import { SEASONAL_CURVE_MX } from '../utils/fcstEngine';

const LS_KEY = 'gop_suplementarios';
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const METRICS = [
  { key: 'vta', label: 'Venta' },
  { key: 'mkd', label: 'Mkds' },
  { key: 'cmsi', label: 'CMSI' }, // costo de meses sin intereses
  { key: 'compra', label: 'Compra' },
  { key: 'utilidad', label: 'Utilidad' },
  { key: 'inv', label: 'Inventario', stock: true },
];
const R12 = [...Array(12).keys()];
const MLABEL = [...MONTHS, 'Cierre'];
const nCols = (mk) => (mk === 'inv' ? 13 : 12); // inventario = inv inicial de cada mes + cierre
const rng = (n) => [...Array(n).keys()];
const PERIODS = [
  { key: 'Q1', m: [0, 1, 2] }, { key: 'Q2', m: [3, 4, 5] }, { key: 'Q3', m: [6, 7, 8] }, { key: 'Q4', m: [9, 10, 11] },
  { key: 'S1', m: R12.slice(0, 6) }, { key: 'S2', m: R12.slice(6) }, { key: 'Año', m: R12 },
];
const RATIO_ALIAS = {
  vta: ['VTA', 'VENTA', 'VENTAS', 'SALES'],
  mkd: ['MKD', 'MKDS', 'REBAJA', 'REBAJAS', 'MARKDOWN', 'MARKDOWNS'],
  cmsi: ['CMSI', 'COSTO MSI', 'MSI'],
  compra: ['COMPRA', 'COMPRAS', 'RECIBOS'],
  utilidad: ['UTILIDAD', 'UB', 'UTILIDAD BRUTA'],
  inv: ['INV', 'INVENTARIO', 'INV INICIAL', 'INVENTARIO INICIAL', 'BOH'],
};

const zeros = (n = 12) => Array(n).fill(0);
const sum = (a) => a.reduce((s, v) => s + (+v || 0), 0);
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s%]/g, '')) || 0);
const toRatio = (s) => { const n = norm(s); return Object.keys(RATIO_ALIAS).find((k) => RATIO_ALIAS[k].includes(n)) || null; };
const toTipo = (s) => {
  const n = norm(s);
  if (['OTB', 'OBJ', 'OBJETIVO', 'TARGET'].includes(n)) return 'otb';
  if (['HIST', 'HISTORICO', 'TY', 'ACTUAL'].includes(n)) return 'hist';
  if (['REAL', 'LY', 'AA', 'CIERRE'].includes(n)) return 'ty';
  if (['FCST', 'FORECAST', 'PRONOSTICO'].includes(n)) return 'fcst';
  return null;
};
const monthIdx = (h) => {
  const n = norm(h).replace(/\.$/, '');
  if (['CIERRE', 'FIN', 'INV FINAL', 'CIERRE DIC'].includes(n)) return 12;
  let i = MONTHS.findIndex((m) => norm(m) === n);
  if (i < 0) i = MONTHS_FULL.findIndex((m) => m === n || (n === 'SETIEMBRE' && m === 'SEPTIEMBRE'));
  if (i < 0 && /^M?\d{1,2}$/.test(n)) { const d = parseInt(n.replace('M', ''), 10); if (d >= 1 && d <= 12) i = d - 1; }
  return i;
};
// Texto pegado desde Excel → matriz de números ('' = celda vacía)
const parseGrid = (txt) => txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t').map((v) => (v.trim() === '' ? '' : num(v))));

const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const dec = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
const growth = (p, l) => (l ? p / l - 1 : null);

// ─── Excel ────────────────────────────────────────────────────────────────────
async function parseExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = { otb: {}, hist: {}, ty: {}, fcst: {}, rows: 0, state: null };
  const est = wb.Sheets._estado;
  if (est) {
    try { out.state = JSON.parse(XLSX.utils.sheet_to_json(est, { header: 1 }).map((r) => r[0] ?? '').join('')); } catch {}
    if (out.state) return out;
  }
  wb.SheetNames.forEach((sn) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    const hi = rows.findIndex((r) => r.some((c) => norm(c) === 'TIPO') && r.some((c) => norm(c) === 'RATIO'));
    if (hi < 0) return;
    const h = rows[hi];
    const cTipo = h.findIndex((c) => norm(c) === 'TIPO');
    const cRatio = h.findIndex((c) => norm(c) === 'RATIO');
    const cEnt = h.findIndex((c) => ['ENTIDAD', 'MARCA', 'PROVEEDOR'].includes(norm(c)));
    const mCols = h.map((c, i) => ({ i, m: monthIdx(c) })).filter((x) => x.m >= 0);
    rows.slice(hi + 1).forEach((r) => {
      const tipo = toTipo(r[cTipo]); const ratio = toRatio(r[cRatio]);
      if (!tipo || !ratio) return;
      const arr = zeros(nCols(ratio)); mCols.forEach(({ i, m }) => { if (m < arr.length) arr[m] = num(r[i]); });
      if (tipo === 'otb') out.otb[ratio] = arr;
      else {
        const ent = String(cEnt >= 0 ? r[cEnt] : '').trim();
        if (!ent) return;
        out[tipo][ent] = { ...(out[tipo][ent] || {}), [ratio]: arr };
      }
      out.rows++;
    });
  });
  return out;
}

// ─── Forecast IS ──────────────────────────────────────────────────────────────
// Misma lógica que ModuleForecast: varios motores, gana el de mejor accuracy (100 − WMAPE).
// Serie = 12 meses LY + meses reales TY. Accuracy por backtest: se reservan los últimos ≤3 meses reales.
const holt = (d, h, a = 0.3, b = 0.1) => {
  if (d.length < 2) return Array(h).fill(d[0] || 0);
  let lv = d[0], tr = d[1] - d[0];
  for (let i = 1; i < d.length; i++) { const p = lv; lv = a * d[i] + (1 - a) * (lv + tr); tr = b * (lv - p) + (1 - b) * tr; }
  return rng(h).map((j) => lv + (j + 1) * tr);
};
const FC_ENGINES = {
  // LY del mes × tendencia (real / LY de los meses transcurridos)
  'Estacional YTD': (ser, h, ly) => {
    const n = ser.length - 12, base = sum(ly.slice(0, n)), r = base ? sum(ser.slice(12)) / base : 1;
    return rng(h).map((j) => (+ly[(n + j) % 12] || 0) * r);
  },
  // Nivel + tendencia sobre la serie completa
  'Holt': (ser, h) => holt(ser, h),
  // Holt sobre la serie desestacionalizada con índices LY, re-estacionalizada
  'Holt-Winters': (ser, h, ly) => {
    const mu = sum(ly.slice(0, 12)) / 12, si = (m) => (mu ? (+ly[m % 12] || 0) / mu || 1 : 1);
    const f = holt(ser.map((v, i) => v / si(i)), h);
    return f.map((v, j) => v * si(ser.length + j));
  },
};
// HIST incompleto (meses en 0 al inicio o al final: marca nueva o archivo sin Oct–Dic): se completa con la curva
// estacional MX escalada al nivel de los meses con dato (o al real TY si el HIST viene todo en 0). Solo para pronosticar.
function fillHist(ly, ty, n) {
  const L = rng(12).map((k) => +ly[k] || 0), C = SEASONAL_CURVE_MX;
  const nz = L.map((v, k) => (v > 0 ? k : -1)).filter((k) => k >= 0);
  const known = nz.length ? rng(12).filter((k) => k >= nz[0] && k <= nz[nz.length - 1]) : [];
  if (known.length === 12) return ly;
  const lvl = known.length ? sum(known.map((k) => L[k])) / sum(known.map((k) => C[k]))
    : n ? sum(rng(n).map((k) => +ty[k] || 0)) / sum(rng(n).map((k) => C[k])) : 0;
  const out = [...ly]; rng(12).forEach((k) => { if (!known.includes(k)) out[k] = lvl * C[k]; });
  return out;
}
function bestFcst(ly0, ty, n, h) {
  const ly = fillHist(ly0, ty, n);
  const ser = [...rng(12).map((k) => +ly[k] || 0), ...rng(n).map((k) => +ty[k] || 0)];
  const hold = Math.min(3, n);
  const scores = Object.entries(FC_ENGINES).map(([name, f]) => {
    if (!hold) return { name, acc: null };
    const pred = f(ser.slice(0, ser.length - hold), hold, ly), act = ser.slice(-hold), A = sum(act);
    return { name, acc: A ? Math.max(0, 100 - (sum(act.map((v, i) => Math.abs(pred[i] - v))) / A) * 100) : null };
  });
  const win = scores.reduce((b, x) => ((x.acc ?? -1) > (b.acc ?? -1) ? x : b), { name: 'Estacional YTD', acc: null });
  return { model: win.name, acc: win.acc, scores, future: FC_ENGINES[win.name](ser, h, ly).map((v) => Math.max(v, 0)) };
}

// ─── Bajada (IPF) ─────────────────────────────────────────────────────────────
// ents: [{ name, base:[..] (LY o IS, semilla de estacionalidad y share), hist:[..] (LY) }]
function allocate(otbArr, ents, cfg = {}, locks = {}) {
  const n = ents.length, K = rng(otbArr.length);
  if (!n) return { rows: [], colTot: zeros(otbArr.length) };
  const base = ents.map((e) => K.map((k) => Math.max(+e.base[k] || 0, 0)));
  const baseTot = base.map(sum), B = sum(baseTot);
  const annual = sum(otbArr);
  const w0 = ents.map((e, i) => {
    const c = cfg[e.name] || {};
    const share = c.share !== '' && c.share != null ? +c.share / 100 : B ? baseTot[i] / B : 1 / n;
    return Math.max(share * (1 + (+c.adj || 0) / 100), 0);
  });
  const W = sum(w0) || 1;
  const rowT = w0.map((b) => (annual * b) / W);
  const lk = ents.map((e) => locks[e.name] || {});
  const isL = (i, k) => lk[i][k] != null;
  const rowTe = rowT.map((r, i) => Math.max(r - sum(K.map((k) => (isL(i, k) ? +lk[i][k] : 0))), 0));
  const colTe = K.map((k) => Math.max((+otbArr[k] || 0) - sum(ents.map((_, i) => (isL(i, k) ? +lk[i][k] : 0))), 0));
  const M = base.map((h, i) => K.map((k) => (isL(i, k) ? 0 : baseTot[i] > 0 ? h[k] : 1)));

  for (let it = 0; it < 60; it++) {
    M.forEach((row, i) => { const s = sum(row); if (s > 0) row.forEach((_, k) => { row[k] *= rowTe[i] / s; }); });
    K.forEach((k) => {
      const free = M.map((_, i) => i).filter((i) => !isL(i, k));
      const s = sum(free.map((i) => M[i][k]));
      if (s > 0) free.forEach((i) => { M[i][k] *= colTe[k] / s; });
      else if (colTe[k] > 0 && free.length) {
        const w = sum(free.map((i) => rowTe[i]));
        free.forEach((i) => { M[i][k] = colTe[k] * (w ? rowTe[i] / w : 1 / free.length); });
      }
    });
  }
  const plan = M.map((row, i) => row.map((v, k) => (isL(i, k) ? +lk[i][k] : v)));
  const rows = ents.map((e, i) => ({
    name: e.name, base: base[i], baseTot: baseTot[i], baseShare: B ? baseTot[i] / B : null,
    share: w0[i] / W, target: rowT[i], plan: plan[i], planTot: sum(plan[i]),
  }));
  const colTot = K.map((k) => sum(plan.map((r) => r[k])));
  return { rows, colTot };
}

// Inventario por marca = consecuencia de los demás ratios: Inv ini Ene (bajada del OTB) y después
// Inv[k+1] = Inv[k] + Compra[k] − Venta[k] − Mkd[k] − CMSI[k]  (todo mercancía a precio de venta).
// Si una marca queda negativa en un mes, se le pasa compra de ese mes desde marcas con compra e inventario
// disponibles (el total del mes no cambia y ninguna compra ni inventario queda negativo). Celdas de compra fijas no se tocan.
function rollInventory(A, entities, otb, cfgInv = {}, lkC = {}) {
  const n = entities.length;
  if (!n) return;
  const inv0 = allocate([+otb.inv?.[0] || 0], A.inv.rows.map((r) => ({ name: r.name, base: [r.base[0]] })), cfgInv, {}).rows.map((r) => r.plan[0]);
  const C = A.compra.rows.map((r) => [...r.plan]), V = A.vta.rows.map((r) => r.plan), M = A.mkd.rows.map((r) => r.plan), Q = A.cmsi.rows.map((r) => r.plan);
  const I = rng(n).map((i) => { const a = zeros(13); a[0] = inv0[i]; return a; });
  const fixed = (i, k) => lkC[entities[i].name]?.[k] != null;
  for (let k = 0; k < 12; k++) {
    const next = (i) => I[i][k] + C[i][k] - (+V[i][k] || 0) - (+M[i][k] || 0) - (+Q[i][k] || 0);
    rng(n).forEach((i) => {
      let d = -next(i);
      if (d <= 0.5 || fixed(i, k)) return;
      const donors = rng(n).filter((j) => j !== i && !fixed(j, k)).map((j) => ({ j, cap: Math.max(0, Math.min(C[j][k], next(j))) })).filter((x) => x.cap > 0);
      const cap = sum(donors.map((x) => x.cap)); if (!cap) return;
      const take = Math.min(d, cap);
      donors.forEach(({ j, cap: c }) => { C[j][k] -= take * c / cap; });
      C[i][k] += take;
    });
    rng(n).forEach((i) => { const v = next(i); I[i][k + 1] = Math.abs(v) < 0.5 ? 0 : v; });
  }
  const upd = (key, P) => {
    const tot = sum(P.map(sum)) || 1;
    A[key].rows.forEach((r, i) => { r.plan = P[i]; r.planTot = sum(P[i]); r.share = r.planTot / tot; });
    A[key].colTot = rng(P[0].length).map((k) => sum(P.map((p) => p[k])));
  };
  upd('compra', C); upd('inv', I);
  A.inv.negativos = I.some((a) => a.some((v) => v < -0.5));
}

// Inventario = inv INICIAL por mes (+ cierre en idx 12). Para un periodo: inv fin = inv ini del mes siguiente.
// Rotación = Σ venta del periodo / promedio de (n+1) inventarios (año: 12 ventas / 13 inventarios).
function kpis(d, ms) {
  const s = (k) => ms.reduce((a, i) => a + (+d[k]?.[i] || 0), 0);
  const vta = s('vta'), mkd = s('mkd'), cmsi = s('cmsi'), compra = s('compra'), ut = s('utilidad');
  const pts = [...ms, ms[ms.length - 1] + 1].map((i) => +d.inv?.[i] || 0);
  const invAvg = sum(pts) / pts.length, invIni = pts[0], invFin = pts[pts.length - 1];
  return {
    vta, mkd, cmsi, compra, ut, invAvg, invIni, invFin,
    margen: vta ? ut / vta : null, mkdPct: vta ? mkd / vta : null, cmsiPct: vta ? cmsi / vta : null,
    st: vta + invFin ? vta / (vta + invFin) : null,
    mos: vta ? invFin / (vta / ms.length) : null,
    rot: invAvg ? vta / invAvg : null,
    vtaCompra: compra ? vta / compra : null,
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
// Navegación tipo Excel: Enter/Shift+Enter baja/sube, flechas se mueven entre celdas (←/→ solo si la celda
// está completa seleccionada o el cursor está en la orilla). Al entrar a una celda se selecciona todo.
const moveFocus = (el, dr, dc) => {
  const g = el.dataset.grid; let r = +el.dataset.r, c = +el.dataset.c;
  for (let i = 0; i < 20; i++) {
    r += dr; c += dc;
    const next = document.querySelector(`input[data-grid="${g}"][data-r="${r}"][data-c="${c}"]`);
    if (next) { next.focus(); return true; }
  }
  return false;
};

function NumCell({ value, onCommit, onPasteGrid, className = '', placeholder = '', grid, r, c }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = () => { if (String(v) !== String(value ?? '')) onCommit(v === '' ? '' : num(v)); };
  const onPaste = (e) => {
    const txt = e.clipboardData.getData('text');
    if (!onPasteGrid || !/[\t\n]/.test(txt.replace(/\n+$/, ''))) return; // valor suelto → paste normal
    e.preventDefault(); onPasteGrid(parseGrid(txt));
  };
  return (
    <input
      value={v} placeholder={placeholder} onPaste={onPaste}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      data-grid={grid} data-r={r} data-c={c}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.altKey || e.metaKey || e.ctrlKey) return;
        const el = e.currentTarget, all = el.selectionStart === 0 && el.selectionEnd === el.value.length;
        const mv = (dr, dc) => { if (grid && moveFocus(el, dr, dc)) e.preventDefault(); };
        if (e.key === 'Enter') { e.preventDefault(); if (!grid || !moveFocus(el, e.shiftKey ? -1 : 1, 0)) el.blur(); }
        else if (e.key === 'ArrowDown') mv(1, 0);
        else if (e.key === 'ArrowUp') mv(-1, 0);
        else if (e.key === 'ArrowRight' && (all || el.selectionStart === el.value.length)) mv(0, 1);
        else if (e.key === 'ArrowLeft' && (all || el.selectionEnd === 0)) mv(0, -1);
        else if (e.key === 'Escape') { setV(value ?? ''); el.blur(); }
      }}
      className={`w-full min-w-[72px] px-1.5 py-1 text-right text-xs rounded border focus:outline-none focus:ring-1 ${className}`}
    />
  );
}

function usePersisted() {
  const [st, setSt] = useState(() => {
    try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch {}
    return { dim: 'Marca', otb: Object.fromEntries(METRICS.map((m) => [m.key, zeros(nCols(m.key))])), entities: [], cfg: {}, locks: {} };
  });
  const tm = useRef(null);
  useEffect(() => {
    clearTimeout(tm.current);
    tm.current = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch {} }, 400);
    return () => clearTimeout(tm.current);
  }, [st]);
  return [st, setSt];
}

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function ModuleSuplementarios({ t, isDark, navIcon, navLabel, navDesc }) {
  const [st, setSt] = usePersisted();
  const [tab, setTab] = useState('otb');
  // Alt/Option + ↑/↓ cambia de pestaña
  useEffect(() => {
    const TABS = ['otb', 'bajada', 'analisis'];
    const h = (e) => {
      if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      setTab((cur) => TABS[(TABS.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : TABS.length - 1)) % TABS.length]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const [metric, setMetric] = useState('vta');
  const [ent, setEnt] = useState('__total');
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const { dim, otb, entities, cfg, locks } = st;
  // Años respecto al plan: HIST del Excel = año en curso (real hasta el corte) → LY = HIST + IS (pronóstico del resto)
  // REAL del Excel = año anterior cerrado → LLY
  const baseMode = st.baseMode || 'prom'; // 'prom' promedio LY+LLY | 'is' solo LY | 'ly' solo LLY
  // Corte automático: último mes con venta en HIST (se puede cambiar a mano)
  const corteAuto = Math.max(0, ...entities.map((e) => { const v = e.hist?.vta || []; let k = 12; while (k > 0 && !(+v[k - 1])) k--; return k; }));
  const corte = st.corte ?? corteAuto;

  // LY por marca × ratio: HIST hasta el corte + pronóstico del mejor modelo sobre LLY (REAL) + HIST (o FCST de Excel si viene)
  const isFc = useMemo(() => {
    return Object.fromEntries(METRICS.map((m) => [m.key, Object.fromEntries(entities.map((e) => {
      const n = nCols(m.key), lly = e.ty?.[m.key] || zeros(n), cur = e.hist?.[m.key], fc = e.fcst?.[m.key];
      if (!cur) return [e.name, { arr: null, model: 'Sin HIST', acc: null }];
      const real = rng(corte).map((k) => +cur[k] || 0);
      if (corte >= n) return [e.name, { arr: real, model: 'Año completo', acc: null }];
      if (fc) return [e.name, { arr: [...real, ...rng(n - corte).map((j) => +fc[corte + j] || 0)], model: 'FCST Excel', acc: null }];
      const r = bestFcst(lly, cur, corte, n - corte);
      return [e.name, { arr: [...real, ...r.future], model: r.model, acc: r.acc, scores: r.scores }];
    }))]));
  }, [entities, corte]);
  const llyOf = (e, mk) => e.ty?.[mk] || zeros(nCols(mk));
  const lyOf = (e, mk) => isFc?.[mk]?.[e.name]?.arr || null;
  // Base de share y estacionalidad: promedio LY y LLY; si un año está en 0 (marca nueva o de salida) usa solo el otro
  const baseOf = (e, mk) => {
    const lly = llyOf(e, mk), ly = lyOf(e, mk);
    if (!ly) return lly;
    if (baseMode === 'ly') return sum(lly) > 0 ? lly : ly;
    if (baseMode === 'is') return ly;
    const a = sum(ly) > 0, b = sum(lly) > 0;
    // Por mes: si un año trae 0 en ese mes (HIST incompleto, marca nueva), usa el otro
    return a && b ? ly.map((v, k) => { const x = +v || 0, y = +lly[k] || 0; return x && y ? (x + y) / 2 : x || y; }) : a ? ly : lly;
  };
  // Comparativo (crecimientos, KPIs "vs LY"): LY si hay real, si no LLY
  const cmpOf = (e, mk) => (baseMode === 'ly' ? llyOf(e, mk) : lyOf(e, mk) || llyOf(e, mk));
  const cmpLbl = baseMode === 'ly' ? 'LLY' : 'LY';

  const alloc = useMemo(
    () => {
      const A = Object.fromEntries(METRICS.map((m) => {
        const ents = entities.map((e) => ({ name: e.name, base: baseOf(e, m.key), hist: e.hist?.[m.key] || zeros(nCols(m.key)) }));
        return [m.key, allocate(otb[m.key] || zeros(nCols(m.key)), ents, cfg[m.key], locks[m.key])];
      }));
      rollInventory(A, entities, otb, cfg.inv, locks.compra);
      return A;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [otb, entities, cfg, locks, isFc]
  );

  // data por entidad: { plan: {metric:[..]}, hist: {metric:[..]} }
  const byEnt = useMemo(() => {
    const out = {};
    entities.forEach((e, i) => {
      out[e.name] = {
        plan: Object.fromEntries(METRICS.map((m) => [m.key, alloc[m.key].rows[i]?.plan || zeros(nCols(m.key))])),
        hist: Object.fromEntries(METRICS.map((m) => [m.key, cmpOf(e, m.key)])), // comparativo: LY (o LLY)
        base: Object.fromEntries(METRICS.map((m) => [m.key, alloc[m.key].rows[i]?.base || zeros(nCols(m.key))])),
        ly: Object.fromEntries(METRICS.map((m) => [m.key, lyOf(e, m.key) || zeros(nCols(m.key))])),
        lly: Object.fromEntries(METRICS.map((m) => [m.key, llyOf(e, m.key)])),
      };
    });
    const totOf = (tp) => Object.fromEntries(METRICS.map((m) => [m.key, rng(nCols(m.key)).map((k) => sum(entities.map((e) => +out[e.name][tp][m.key][k] || 0)))]));
    out.__total = { plan: otb, hist: totOf('hist'), base: totOf('base'), ly: totOf('ly'), lly: totOf('lly') };
    return out;
  }, [alloc, entities, otb, isFc, baseMode]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const r = await parseExcel(f);
      if (r.state) {
        if (!confirm('Este archivo es un plan exportado de Suplementarios. ¿Reemplazar lo que tienes cargado?')) return;
        setSt(r.state);
        setMsg({ ok: true, text: `Plan restaurado · ${r.state.entities?.length || 0} ${r.state.dim?.toLowerCase() || 'entidad'}es` });
        return;
      }
      if (!r.rows) { setMsg({ ok: false, text: 'No encontré filas válidas. Revisa encabezados Tipo / Entidad / Ratio / Ene…Dic.' }); return; }
      setSt((s) => {
        const map = Object.fromEntries(s.entities.map((x) => [x.name, x]));
        ['hist', 'ty', 'fcst'].forEach((tp) => Object.entries(r[tp]).forEach(([name, d]) => {
          map[name] = { ...(map[name] || { name }), [tp]: { ...(map[name]?.[tp] || {}), ...d } };
        }));
        return { ...s, otb: { ...s.otb, ...r.otb }, entities: Object.values(map) };
      });
      setMsg({ ok: true, text: `${r.rows} filas · ${Object.keys(r.otb).length} ratios OTB · ${Object.keys(r.hist).length} HIST · ${Object.keys(r.ty).length} REAL · ${Object.keys(r.fcst).length} FCST` });
    } catch (err) { setMsg({ ok: false, text: `Error leyendo Excel: ${err.message}` }); }
  };

  // Exporta plan legible + hoja _estado (JSON completo) para volver a cargarlo y seguir donde te quedaste
  const exportPlan = () => {
    const aoa = [['Tipo', dim, 'Ratio', ...MLABEL, 'Total']];
    const line = (tipo, name, m, arr) => [tipo, name, m.label.toUpperCase(), ...rng(13).map((k) => (k < arr.length ? Math.round(arr[k] || 0) : '')), Math.round(m.stock ? sum(arr) / arr.length : sum(arr))];
    METRICS.forEach((m) => aoa.push(line('OTB', '', m, otb[m.key] || zeros(nCols(m.key)))));
    METRICS.forEach((m) => alloc[m.key].rows.forEach((r) => aoa.push(line('PLAN', r.name, m, r.plan))));
    const json = JSON.stringify(st), chunks = [];
    for (let i = 0; i < json.length; i += 30000) chunks.push([json.slice(i, i + 30000)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Plan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chunks), '_estado');
    XLSX.writeFile(wb, `Suplementarios_${dim}.xlsx`);
  };

  const setOtb = (mk, k, v) => setSt((s) => ({ ...s, otb: { ...s.otb, [mk]: rng(nCols(mk)).map((i) => (i === k ? +v || 0 : +s.otb[mk]?.[i] || 0)) } }));
  const pasteOtb = (r0, c0, grid) => setSt((s) => {
    const o = { ...s.otb };
    grid.forEach((line, i) => {
      const m = METRICS[r0 + i]; if (!m) return;
      const arr = rng(nCols(m.key)).map((k) => +o[m.key]?.[k] || 0);
      line.forEach((v, j) => { const k = c0 + j; if (k < arr.length && v !== '') arr[k] = v; });
      o[m.key] = arr;
    });
    return { ...s, otb: o };
  });
  const setCfg = (name, field, v) => setSt((s) => ({ ...s, cfg: { ...s.cfg, [metric]: { ...(s.cfg[metric] || {}), [name]: { ...(s.cfg[metric]?.[name] || {}), [field]: v } } } }));
  const setLock = (name, k, v) => setSt((s) => {
    const ml = { ...(s.locks[metric] || {}) }; const row = { ...(ml[name] || {}) };
    if (v === '') delete row[k]; else row[k] = metric === 'utilidad' ? v : Math.max(0, v); // sin compras/inv/venta negativas
    ml[name] = row; return { ...s, locks: { ...s.locks, [metric]: ml } };
  });
  // Pegado en bajada: col 0 = share manual, 1 = estrategia, 2.. = meses (quedan fijos)
  const pasteBaj = (r0, c0, grid) => setSt((s) => {
    const names = entities.map((e) => e.name);
    const mc = { ...(s.cfg[metric] || {}) }, ml = { ...(s.locks[metric] || {}) };
    grid.forEach((line, i) => {
      const name = names[r0 + i]; if (!name) return;
      line.forEach((v, j) => {
        const c = c0 + j;
        if (c <= 1) mc[name] = { ...(mc[name] || {}), [c === 0 ? 'share' : 'adj']: v };
        else if (c - 2 < nCols(metric) && v !== '' && !(metric === 'inv' && c > 2)) ml[name] = { ...(ml[name] || {}), [c - 2]: metric === 'utilidad' ? v : Math.max(0, v) };
      });
    });
    return { ...s, cfg: { ...s.cfg, [metric]: mc }, locks: { ...s.locks, [metric]: ml } };
  });
  const clearLocks = (name) => setSt((s) => {
    const ml = { ...(s.locks[metric] || {}) };
    if (name) delete ml[name]; else Object.keys(ml).forEach((n) => delete ml[n]);
    return { ...s, locks: { ...s.locks, [metric]: ml } };
  });
  const copyCfgToAll = () => setSt((s) => ({ ...s, cfg: Object.fromEntries(METRICS.map((m) => [m.key, JSON.parse(JSON.stringify(s.cfg[metric] || {}))])) }));
  const clearAll = () => { if (confirm('¿Borrar OTB, históricos y ajustes de Suplementarios?')) setSt({ dim, otb: Object.fromEntries(METRICS.map((m) => [m.key, zeros(nCols(m.key))])), entities: [], cfg: {}, locks: {} }); };

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-right whitespace-nowrap ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs text-right whitespace-nowrap tabular-nums';
  const good = t.success, bad = t.danger, warn = t.warning;
  // <select> nativo: en Windows las opciones salen blancas y el borde negro si no se fuerzan
  const selStyle = isDark ? { colorScheme: 'dark', backgroundColor: '#241e29', borderColor: 'rgba(255,255,255,0.15)', color: '#EDEBF2' } : { colorScheme: 'light' };
  const selCls = `px-2 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[#8A73AD] ${isDark ? '[&>option]:bg-[#1c1720] [&>option]:text-[#EDEBF2]' : t.input}`;

  const headerRight = (
    <>
      <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
        {['Marca', 'Proveedor'].map((d) => (
          <button key={d} onClick={() => setSt((s) => ({ ...s, dim: d }))} className={`px-3 py-1 text-xs rounded-md ${dim === d ? t.toggleActive : t.textMuted}`}>{d}</button>
        ))}
      </div>
      <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-bold ${t.btn}`}><Upload size={14} />Cargar Excel</button>
      <button onClick={exportPlan} disabled={!entities.length} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg ${t.btnGhost} disabled:opacity-40`}><Download size={14} />Exportar</button>
      <button onClick={clearAll} className={`p-2 rounded-lg border ${t.btnDanger}`} title="Borrar todo"><Trash2 size={14} /></button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
    </>
  );

  // ── Tab 1: OTB general ──
  const totalK = kpis(otb, R12), lyK = kpis(byEnt.__total.hist, R12);
  const OtbTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ['Venta', fmt(totalK.vta), pct(growth(totalK.vta, lyK.vta)) + ` vs ${cmpLbl}`],
          ['Margen', pct(totalK.margen), `${cmpLbl} ${pct(lyK.margen)}`],
          ['Mkd %', pct(totalK.mkdPct), `${cmpLbl} ${pct(lyK.mkdPct)}`],
          ['Sell-through', pct(totalK.st), `${cmpLbl} ${pct(lyK.st)}`],
          ['MOS cierre', dec(totalK.mos), `${cmpLbl} ${dec(lyK.mos)}`],
          ['Rotación', dec(totalK.rot), `${cmpLbl} ${dec(lyK.rot)}`],
        ].map(([l, v, s]) => (
          <div key={l} className={`${card} text-center`}>
            <p className={`text-[10px] uppercase tracking-wide ${t.textMuted}`}>{l}</p>
            <p className={`text-xl font-black ${t.text}`}>{v}</p>
            <p className={`text-[10px] ${t.textMuted}`}>{s}</p>
          </div>
        ))}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={`${th} text-left`}>Ratio</th>{MLABEL.map((m) => <th key={m} className={th}>{m}</th>)}<th className={th}>Total</th><th className={th}>{cmpLbl}</th><th className={th}>Crec.</th></tr></thead>
          <tbody>
            {METRICS.map((m, ri) => {
              const arr = otb[m.key] || zeros(nCols(m.key));
              const lyArr = byEnt.__total.hist[m.key];
              const tot = m.stock ? sum(arr) / arr.length : sum(arr);
              const ly = m.stock ? sum(lyArr) / lyArr.length : sum(lyArr);
              const g = growth(tot, ly);
              return (
                <tr key={m.key} className={t.tableRow}>
                  <td className={`px-2 py-1 text-xs font-bold whitespace-nowrap ${t.text}`}>{m.label}{m.stock && <span className={`ml-1 text-[9px] ${t.textMuted}`}>(inicial)</span>}</td>
                  {rng(13).map((k) => (
                    <td key={k} className="px-0.5 py-0.5">
                      {k < nCols(m.key) && <NumCell value={arr[k] || ''} onCommit={(v) => setOtb(m.key, k, v)} onPasteGrid={(g) => pasteOtb(ri, k, g)} grid="otb" r={ri} c={k} className={t.inputY} />}
                    </td>
                  ))}
                  <td className={`${td} font-bold ${t.text}`} title={m.stock ? 'Promedio de 13 inventarios' : ''}>{fmt(tot)}</td>
                  <td className={`${td} ${t.textMuted}`}>{fmt(ly)}</td>
                  <td className={`${td} ${g == null ? t.textMuted : g >= 0 ? good : bad}`}>{pct(g)}</td>
                </tr>
              );
            })}
            {[
              ['Margen %', 'margen', pct], ['Mkd %', 'mkdPct', pct], ['CMSI %', 'cmsiPct', pct], ['Sell-through', 'st', pct],
              ['MOS', 'mos', dec], ['Rotación acum.', 'rot', dec, true], ['Vta / Compra', 'vtaCompra', dec],
            ].map(([l, k, f, ytd]) => (
              <tr key={k} className={`border-t ${t.border}`}>
                <td className={`px-2 py-1 text-xs italic whitespace-nowrap ${t.textMuted}`}>{l}</td>
                {R12.map((i) => <td key={i} className={`${td} ${t.textMuted}`}>{f(kpis(otb, ytd ? R12.slice(0, i + 1) : [i])[k])}</td>)}
                <td />
                <td className={`${td} font-bold ${t.text}`}>{f(totalK[k])}</td>
                <td className={`${td} ${t.textMuted}`}>{f(lyK[k])}</td><td />
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`mt-2 text-[10px] ${t.textMuted}`}>
          Pega bloques desde Excel (Cmd+V) sobre la primera celda · Enter/flechas para moverte · Esc cancela · Alt/Option+↑↓ cambia de pestaña. Inventario = inv inicial de cada mes a precio de venta; Cierre = inv final de Dic.
          ST = Vta / (Vta + Inv fin) · MOS = Inv fin / Vta prom mensual · Rotación acum. = Σ Vta Ene→mes / promedio inv ini Ene→mes siguiente (total: 12 ventas / 13 inventarios) · CMSI = costo de meses sin intereses.
        </p>
      </div>
    </div>
  );

  // ── Tab 2: Bajada ──
  const A = alloc[metric];
  const KC = rng(nCols(metric));
  const mCfg = cfg[metric] || {}, mLocks = locks[metric] || {};
  const otbM = otb[metric] || zeros(nCols(metric));
  const monthOk = KC.map((k) => Math.abs(A.colTot[k] - (+otbM[k] || 0)) < 1);
  const manualSum = sum(Object.values(mCfg).map((c) => (c.share !== '' && c.share != null ? +c.share : 0)));
  const isInv = metric === 'inv';
  const baseLbl = baseMode === 'prom' ? 'Base' : baseMode === 'is' ? 'LY' : 'LLY';
  const isIS = baseMode !== 'ly' && entities.some((e) => e.hist);
  const solid = { background: isDark ? '#1c1720' : '#ffffff' };
  const hasTy = entities.some((e) => e.ty);
  const BajadaTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)} className={`px-3 py-1.5 text-xs rounded-lg border ${metric === m.key ? t.toggleActive : `${t.toggle} ${t.textMuted}`}`}>{m.label}</button>
        ))}
        <div className="flex-1" />
        <div className={`flex items-center rounded-lg border p-0.5 ${t.toggle}`} title="Base para share y estacionalidad">
          {[['prom', 'LY + LLY'], ['is', 'Solo LY'], ['ly', 'Solo LLY']].map(([k, l]) => (
            <button key={k} onClick={() => setSt((s) => ({ ...s, baseMode: k }))} className={`px-3 py-1 text-xs rounded-md ${baseMode === k ? t.toggleActive : t.textMuted}`}>{l}</button>
          ))}
        </div>
        {baseMode !== 'ly' && (
          <label className={`flex items-center gap-1.5 text-xs ${t.textMuted}`}>HIST (real) hasta
            <select value={corte} onChange={(e) => setSt((s) => ({ ...s, corte: +e.target.value }))} style={selStyle} className={selCls}>
              {rng(13).map((k) => <option key={k} value={k}>{k ? MONTHS[k - 1] : '—'}</option>)}
            </select>
          </label>
        )}
        <button onClick={copyCfgToAll} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`} title="Aplica share y estrategia de este ratio a todos"><Copy size={13} />Copiar ajustes a todos</button>
        <button onClick={() => clearLocks()} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}><RotateCcw size={13} />Liberar fijas</button>
      </div>
      {baseMode !== 'ly' && !hasTy && (
        <div className={`px-3 py-2 rounded-lg border text-xs ${t.warningBg}`}>Sin LLY: sube filas Tipo REAL (año anterior cerrado) por {dim.toLowerCase()} para promediar LY + LLY y mejorar el IS. Mientras, la base usa solo LY (HIST + IS).</div>
      )}
      {!entities.length ? (
        <div className={`${card} text-center text-sm ${t.textMuted}`}>Carga el Excel con filas HIST por {dim.toLowerCase()} para hacer la bajada.</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full">
            <thead><tr>
              <th className={`${th} text-left sticky left-0 z-20`} style={solid}>{dim}</th>
              <th className={th}>{baseLbl}</th><th className={th}>Share {baseLbl}</th>{isIS && <th className={th}>Modelo</th>}<th className={th}>Share manual</th><th className={th}>Estrategia %</th>
              <th className={th}>Share final</th><th className={th}>Plan</th><th className={th}>Crec. vs {cmpLbl}</th>
              {isInv && <><th className={th}>Rot final</th><th className={th}>Rot {cmpLbl}</th></>}
              {KC.map((k) => <th key={k} className={th}>{MLABEL[k]}</th>)}
            </tr></thead>
            <tbody>
              {A.rows.map((r, ri) => {
                const c = mCfg[r.name] || {}; const lk = mLocks[r.name] || {};
                const tot = (arr) => (isInv ? sum(arr) / arr.length : sum(arr));
                const g = growth(tot(r.plan), tot(byEnt[r.name].hist[metric]));
                const paste = (c0) => (grid) => pasteBaj(ri, c0, grid);
                const rotP = isInv ? kpis(byEnt[r.name].plan, R12).rot : null, rotL = isInv ? kpis(byEnt[r.name].hist, R12).rot : null;
                return (
                  <tr key={r.name} className={t.tableRow}>
                    <td className={`px-2 py-1 text-xs font-bold whitespace-nowrap sticky left-0 z-10 ${t.text}`} style={solid}>
                      <span className="flex items-center gap-1">{r.name}
                        {Object.keys(lk).length > 0 && <button onClick={() => clearLocks(r.name)} title="Liberar celdas fijas"><Lock size={11} className={warn} /></button>}
                      </span>
                    </td>
                    <td className={`${td} ${t.textMuted}`}>{fmt(isInv ? r.baseTot / KC.length : r.baseTot)}</td>
                    <td className={`${td} ${t.textMuted}`}>{pct(r.baseShare)}</td>
                    {isIS && (() => { const f = isFc[metric][r.name] || {}; return (
                      <td className={`${td} ${t.textMuted}`} title={f.scores?.map((x) => `${x.name}: ${x.acc == null ? '—' : x.acc.toFixed(1) + '%'}`).join('\n')}>
                        {f.model}{f.acc != null && <span className={f.acc >= 85 ? good : f.acc >= 70 ? warn : bad}> · {f.acc.toFixed(0)}%</span>}
                      </td>); })()}
                    <td className="px-0.5 py-0.5 w-20"><NumCell value={c.share ?? ''} placeholder="base" onCommit={(v) => setCfg(r.name, 'share', v)} onPasteGrid={paste(0)} grid="baj" r={ri} c={0} className={t.input} /></td>
                    <td className="px-0.5 py-0.5 w-20"><NumCell value={c.adj ?? ''} placeholder="0" onCommit={(v) => setCfg(r.name, 'adj', v)} onPasteGrid={paste(1)} grid="baj" r={ri} c={1} className={t.input} /></td>
                    <td className={`${td} font-bold ${t.text}`}>{pct(r.share)}</td>
                    <td className={`${td} font-bold ${t.text}`}>{fmt(tot(r.plan))}</td>
                    <td className={`${td} ${g == null ? t.textMuted : g >= 0 ? good : bad}`}>{pct(g)}</td>
                    {isInv && <>
                      <td className={`${td} font-bold ${rotP != null && rotL != null ? (rotP >= rotL ? good : bad) : t.text}`}>{dec(rotP)}</td>
                      <td className={`${td} ${t.textMuted}`}>{dec(rotL)}</td>
                    </>}
                    {KC.map((k) => isInv && k > 0 ? (
                      <td key={k} className={`${td} ${r.plan[k] < -0.5 ? bad : t.text}`} title="Inv = inv anterior + compra − venta − mkd − cmsi">{fmt(r.plan[k])}</td>
                    ) : (
                      <td key={k} className="px-0.5 py-0.5">
                        <NumCell value={Math.round(r.plan[k])} onCommit={(v) => setLock(r.name, k, v)} onPasteGrid={paste(k + 2)} grid="baj" r={ri} c={k + 2} className={lk[k] != null ? t.inputY : t.input} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 ${t.border}`}>
                <td className={`px-2 py-1 text-xs font-black sticky left-0 z-10 ${t.text}`} style={solid}>Total</td>
                <td className={`${td} ${t.textMuted}`}>{fmt(sum(A.rows.map((r) => (isInv ? r.baseTot / KC.length : r.baseTot))))}</td><td />{isIS && <td />}
                <td className={`${td} ${manualSum > 100 ? bad : t.textMuted}`}>{manualSum ? `${manualSum.toFixed(1)}%` : ''}</td><td />
                <td className={`${td} ${t.text}`}>100%</td>
                <td className={`${td} font-black ${t.text}`}>{fmt(isInv ? sum(A.colTot) / KC.length : sum(A.colTot))}</td><td />
                {isInv && <><td className={`${td} font-bold ${t.text}`}>{dec(kpis(otb, R12).rot)}</td><td className={`${td} ${t.textMuted}`}>{dec(kpis(byEnt.__total.hist, R12).rot)}</td></>}
                {KC.map((k) => <td key={k} className={`${td} font-bold ${t.text}`}>{fmt(A.colTot[k])}</td>)}
              </tr>
              <tr>
                <td className={`px-2 py-1 text-xs sticky left-0 z-10 ${t.textMuted}`} style={solid}>OTB objetivo</td><td colSpan={isIS ? 6 : 5} />
                <td className={`${td} ${t.textMuted}`}>{fmt(isInv ? sum(otbM) / KC.length : sum(otbM))}</td><td />
                {isInv && <td colSpan={2} />}
                {KC.map((k) => (
                  <td key={k} className={`${td} ${monthOk[k] ? good : bad}`}>
                    <span className="inline-flex items-center gap-0.5">{monthOk[k] ? <Check size={11} /> : <AlertCircle size={11} />}{fmt(otbM[k])}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          <p className={`mt-2 text-[10px] ${t.textMuted}`}>
            Pega bloques desde Excel (Cmd+V) sobre la primera celda: share, estrategia o meses. Share manual vacío = share de la base ({baseLbl}). Estrategia % multiplica el share (se renormaliza a 100%). Editar/pegar un mes lo fija (amarillo); el resto se reacomoda para cuadrar el OTB mensual.
            {' LY = HIST (año en curso) hasta el corte + IS (pronóstico del resto del año con el modelo de mejor accuracy sobre LLY + HIST: Estacional YTD, Holt, Holt-Winters; backtest en los últimos ≤3 meses de HIST; filas FCST del Excel tienen prioridad). Base LY + LLY = promedio de ambos años para share y estacionalidad; si una marca tiene un año en 0 (nueva o de salida) usa solo el otro.'}
            {isInv && ' Inventario: solo se captura/ajusta Ene (inv inicial); los demás meses = inv anterior + compra − venta − mkd − cmsi. Inventario en 0 es válido (marcas estacionales sin venta en esos meses). Si una marca quedaría en negativo se le reasigna compra de ese mes desde otras marcas (el total no cambia).'}
            {isInv && A.negativos && ' ⚠ Aún hay inventarios negativos: la compra total del OTB en esos meses no alcanza.'}
            {isInv && ' Rot final = Vta plan / promedio de 13 inventarios plan de la marca (verde si ≥ ${cmpLbl}).'}
          </p>
        </div>
      )}
    </div>
  );

  // ── Tab 3: Análisis ──
  const sel = byEnt[ent] || byEnt.__total;
  const hasLY = sum(sel.ly?.vta || []) > 0;
  const chartData = R12.map((k) => ({ mes: MONTHS[k], 'Vta LLY': sel.lly?.vta?.[k] || 0, 'Vta LY': sel.ly?.vta?.[k] || 0, 'Vta Plan': sel.plan.vta?.[k] || 0, 'Inv ini Plan': sel.plan.inv?.[k] || 0 }));
  const seas = (arr) => { const avg = sum(arr.slice(0, 12)) / 12; return R12.map((k) => (avg ? arr[k] / avg : null)); };
  const seasLLY = seas(sel.lly?.vta || zeros()), seasLY = seas(sel.ly?.vta || zeros()), seasB = seas(sel.base?.vta || zeros()), seasPl = seas(sel.plan.vta || zeros());
  const seasData = R12.map((k) => ({ mes: MONTHS[k], LLY: seasLLY[k], LY: seasLY[k], Base: seasB[k], Plan: seasPl[k] }));
  const perRows = [
    ['Venta', 'vta', fmt, true], ['Mkd %', 'mkdPct', pct], ['CMSI %', 'cmsiPct', pct], ['Mg %', 'margen', pct],
    ['Compra', 'compra', fmt, true], ['ST %', 'st', pct], ['MOS', 'mos', dec], ['Rot', 'rot', dec],
  ];
  const tot = kpis(otb, R12);
  const totInvShareBase = sum(entities.map((e) => kpis(byEnt[e.name].plan, R12).invAvg)) || 1;
  const ranking = entities.map((e) => {
    const p = kpis(byEnt[e.name].plan, R12), l = kpis(byEnt[e.name].hist, R12);
    const shV = tot.vta ? p.vta / tot.vta : null, shI = p.invAvg / totInvShareBase;
    return { name: e.name, p, l, g: growth(p.vta, l.vta), shV, shI, gap: shV != null ? shI - shV : null };
  }).sort((a, b) => b.p.vta - a.p.vta);

  const AnalisisTab = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs ${t.textMuted}`}>{dim}:</span>
        <select value={ent} onChange={(e) => setEnt(e.target.value)} style={selStyle} className={selCls}>
          <option value="__total">Total OTB</option>
          {entities.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={card}>
          <p className={`text-xs font-bold mb-2 ${t.text}`}>Venta LLY · LY (Real + IS) vs Plan · Inv inicial plan</p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#ffffff14' : '#e5e7eb'} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: isDark ? '#1c1720' : '#fff', border: 'none', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="l" dataKey="Vta LLY" fill={isDark ? '#45404f' : '#e2e8f0'} radius={[3, 3, 0, 0]} />
              {hasLY && <Bar yAxisId="l" dataKey="Vta LY" fill={isDark ? '#6b6778' : '#cbd5e1'} radius={[3, 3, 0, 0]} />}
              <Bar yAxisId="l" dataKey="Vta Plan" fill={isDark ? '#8A73AD' : '#2563eb'} radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" dataKey="Inv ini Plan" stroke="#E0BB3E" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className={card}>
          <p className={`text-xs font-bold mb-2 ${t.text}`}>Ciclicidad venta (índice mes / promedio)</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={seasData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#ffffff14' : '#e5e7eb'} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => dec(v, 2)} contentStyle={{ background: isDark ? '#1c1720' : '#fff', border: 'none', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={1} stroke={isDark ? '#6b6778' : '#cbd5e1'} strokeDasharray="2 4" label={{ value: 'Promedio = 1', position: 'insideTopRight', fontSize: 9, fill: isDark ? '#948FA0' : '#6b7280' }} />
              <Line dataKey="LLY" stroke={isDark ? '#948FA0' : '#94a3b8'} strokeWidth={2} strokeDasharray="2 3" dot={{ r: 2 }} />
              {hasLY && <Line dataKey="LY" stroke="#E0BB3E" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />}
              {baseMode === 'prom' && hasLY && <Line dataKey="Base" stroke="#4FB0A5" strokeWidth={2} dot={false} />}
              <Line dataKey="Plan" stroke={isDark ? '#B39DDB' : '#2563eb'} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <p className={`text-xs font-bold mb-2 ${t.text}`}>Crecimiento por mes vs LY</p>
        <table className="w-full">
          <thead><tr><th className={`${th} text-left`}>Ratio</th>{MONTHS.map((m) => <th key={m} className={th}>{m}</th>)}<th className={th}>Año</th></tr></thead>
          <tbody>
            {[['Vta plan', sel.plan.vta], ['Vta LY', sel.hist.vta]].map(([l, a]) => (
              <tr key={l} className={t.tableRow}>
                <td className={`px-2 py-1 text-xs font-bold whitespace-nowrap ${t.text}`}>{l}</td>
                {R12.map((k) => <td key={k} className={`${td} ${t.text}`}>{fmt(a?.[k])}</td>)}
                <td className={`${td} font-bold ${t.text}`}>{fmt(sum((a || []).slice(0, 12)))}</td>
              </tr>
            ))}
            {METRICS.map((m) => {
              const p = sel.plan[m.key] || [], l = sel.hist[m.key] || [];
              const yr = m.stock ? growth(sum(p) / (p.length || 1), sum(l) / (l.length || 1)) : growth(sum(p), sum(l));
              const cls = (g) => (g == null ? t.textMuted : g >= 0 ? good : bad);
              return (
                <tr key={m.key} className={`border-t ${t.border}`}>
                  <td className={`px-2 py-1 text-xs italic whitespace-nowrap ${t.textMuted}`}>Crec. {m.label}{m.stock ? ' ini' : ''}</td>
                  {R12.map((k) => { const g = growth(+p[k] || 0, +l[k] || 0); return <td key={k} className={`${td} ${cls(g)}`}>{pct(g)}</td>; })}
                  <td className={`${td} font-bold ${cls(yr)}`}>{pct(yr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <p className={`text-xs font-bold mb-2 ${t.text}`}>Trimestres y semestres · Plan ({cmpLbl} abajo)</p>
        <table className="w-full">
          <thead><tr><th className={`px-2 py-2 text-xs font-black uppercase text-left ${t.tableHead}`}>Ratio</th>{PERIODS.map((p) => <th key={p.key} className={`px-2 py-2 text-sm font-black uppercase text-center ${t.tableHead} ${t.text}`}>{p.key}</th>)}</tr></thead>
          <tbody>
            {perRows.map(([l, k, f, isAmt]) => (
              <tr key={k} className={t.tableRow}>
                <td className={`px-2 py-1 text-xs font-bold ${t.text}`}>{l}</td>
                {PERIODS.map((p) => {
                  const pv = kpis(sel.plan, p.m)[k], lv = kpis(sel.hist, p.m)[k];
                  const g = isAmt ? growth(pv, lv) : null;
                  return (
                    <td key={p.key} className={td.replace('text-right', 'text-center')}>
                      <div className={`font-bold ${t.text}`}>{f(pv)}</div>
                      <div className={`text-[10px] ${t.textMuted}`}>{f(lv)}{g != null && <span className={g >= 0 ? good : bad}> {pct(g)}</span>}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entities.length > 0 && (
        <div className={`${card} overflow-x-auto`}>
          <p className={`text-xs font-bold mb-2 ${t.text}`}>Evaluación por {dim.toLowerCase()} (año)</p>
          <table className="w-full">
            <thead><tr>
              <th className={`${th} text-left`}>{dim}</th>
              {['Vta plan', 'Crec.', 'Share vta', 'Share inv', 'Gap inv-vta', 'Margen', 'Mkd %', 'CMSI %', 'ST', 'MOS', 'Rotación', 'Vta/Compra'].map((h) => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.name} className={`${t.tableRow} cursor-pointer`} onClick={() => setEnt(r.name)}>
                  <td className={`px-2 py-1 text-xs font-bold ${t.text}`}>{r.name}</td>
                  <td className={`${td} ${t.text}`}>{fmt(r.p.vta)}</td>
                  <td className={`${td} ${r.g == null ? t.textMuted : r.g >= 0 ? good : bad}`}>{pct(r.g)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.shV)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.shI)}</td>
                  <td className={`${td} ${r.gap > 0.03 ? bad : r.gap < -0.03 ? warn : t.textMuted}`}>{r.gap == null ? '—' : `${(r.gap * 100).toFixed(1)} pts`}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.margen)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.mkdPct)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.cmsiPct)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.st)}</td>
                  <td className={`${td} ${tot.mos && r.p.mos > tot.mos * 1.25 ? bad : t.text}`}>{dec(r.p.mos)}</td>
                  <td className={`${td} ${t.text}`}>{dec(r.p.rot)}</td>
                  <td className={`${td} ${t.text}`}>{dec(r.p.vtaCompra, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`mt-2 text-[10px] ${t.textMuted}`}>Gap rojo = más inventario que venta (&gt;3 pts, riesgo de sobre-stock); amarillo = sub-inventariado. MOS rojo = &gt;25% arriba del total. Click en fila para ver su detalle arriba.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <div className={`flex gap-4 border-b ${t.border}`}>
        {[['otb', 'OTB General'], ['bajada', `Bajada por ${dim}`], ['analisis', 'Análisis']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`pb-2 text-sm font-bold border-b-2 ${tab === id ? t.tabActive : t.tabInactive}`}>{l}</button>
        ))}
      </div>
      {tab === 'otb' && OtbTab}
      {tab === 'bajada' && BajadaTab}
      {tab === 'analisis' && AnalisisTab}
    </div>
  );
}

// src/modules/ModuleAllocation.jsx
// Allocation (Check Coo): reportero de advertencias sobre Parametrizaciones y OC.
// Entrada: Excel (una o dos hojas / uno o dos archivos). Se detecta cada hoja por encabezados:
//   Param → SKU, TIENDA + (MIN | MAX)  ·  OC → SKU, TIENDA, CANTIDAD (+ OC opcional)
// Salida: hallazgos por regla (dónde y qué cambiar) + CSV de parametrización corregida.
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Trash2, Settings, AlertTriangle, AlertOctagon, CheckCircle2, Search } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';

const LS_KEY = 'gop_allocation_meta';
const DB_NAME = 'gop_allocation_db';

// ─── Columnas (alias) ─────────────────────────────────────────────────────────
const ALIAS = {
  sku: ['SKU', 'ARTICULO', 'MATERIAL', 'UPC', 'EAN'],
  estilo: ['ESTILO', 'MODELO', 'GENERICO', 'STYLE'],
  talla: ['TALLA', 'SIZE', 'TALLAS'],
  tienda: ['TIENDA', 'CENTRO', 'STORE', 'SUCURSAL', 'ID TIENDA'],
  cluster: ['CLUSTER', 'GRUPO', 'GRUPO TIENDAS'],
  ap8: ['AP8', 'AP 8', 'PERFIL AP8'],
  nivel: ['NIVEL FCST', 'NIVEL_FCST', 'NIVEL FORECAST', 'NIVEL PRONOSTICO', 'NIVEL'],
  mos: ['MOS', 'MESES DE INVENTARIO'],
  min: ['MIN', 'MINIMO', 'MINIMOS', 'STOCK MIN'],
  max: ['MAX', 'MAXIMO', 'MAXIMOS', 'STOCK MAX'],
  compra: ['COMPRA', 'PIEZAS COMPRA', 'CANTIDAD COMPRA', 'COMPRA PZAS', 'BUY'],
  oc: ['OC', 'ORDEN', 'ORDEN DE COMPRA', 'PEDIDO', 'PO'],
  qty: ['CANTIDAD', 'PIEZAS', 'PZAS', 'QTY', 'UNIDADES', 'CANTIDAD PEDIDA'],
};
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ');
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s%]/g, '')));
const isBlank = (v) => v == null || String(v).trim() === '';
const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const pct = (v, d = 0) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const moda = (arr) => { const c = {}; arr.forEach((v) => (c[v] = (c[v] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
const groupBy = (rows, fn) => { const m = new Map(); rows.forEach((r) => { const k = fn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };

function mapHeader(h) {
  const n = h.map(norm), cols = {};
  Object.entries(ALIAS).forEach(([k, al]) => { const i = n.findIndex((c) => al.includes(c)); if (i >= 0) cols[k] = i; });
  return cols;
}

// ─── IndexedDB (filas pesadas) ────────────────────────────────────────────────
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('data');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idbGet = async (k) => { const db = await idb(); return new Promise((res) => { const q = db.transaction('data').objectStore('data').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const idbSet = async (k, v) => { const db = await idb(); return new Promise((res) => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put(v, k); tx.oncomplete = res; tx.onerror = res; }); };

// ─── Excel ────────────────────────────────────────────────────────────────────
async function parseFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = {};
  wb.SheetNames.forEach((sn) => {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    const hi = aoa.slice(0, 15).findIndex((r) => { const c = mapHeader(r); return c.sku != null && c.tienda != null; });
    if (hi < 0) return;
    const header = aoa[hi].map((x) => String(x).trim()), cols = mapHeader(aoa[hi]);
    const rows = aoa.slice(hi + 1).filter((r) => !isBlank(r[cols.sku]) && !isBlank(r[cols.tienda]));
    const kind = cols.qty != null && cols.min == null && cols.max == null ? 'oc' : cols.min != null || cols.max != null ? 'param' : null;
    if (kind && !out[kind]) out[kind] = { name: `${file.name} › ${sn}`, header, cols, rows };
  });
  return out;
}

// ─── Reglas ───────────────────────────────────────────────────────────────────
const DEF_CFG = { mosMin: 1, mosMax: 4, maxMinRatio: 4, curvaPts: 5, sobranteCompra: 1.3, picoX: 3, concTop: 0.2, concShare: 0.5, coreTalla: 0.1 };

const PARAM_RULES = {
  vacio:    { sev: 'error', label: 'Campos vacíos', help: 'Cluster, AP8, nivel fcst, MOS, MIN o MAX sin valor' },
  minmax:   { sev: 'error', label: 'MIN > MAX', help: 'Máximo menor al mínimo → MAX = MIN' },
  compraMin:{ sev: 'error', label: 'Compra no cubre mínimos', help: 'Σ MIN del SKU > compra → MIN escalado a la compra' },
  sobrante: { sev: 'warn',  label: 'Compra > Σ MAX', help: 'La compra excede lo que las tiendas pueden recibir → sobrante en CEDIS' },
  mos:      { sev: 'warn',  label: 'MOS fuera de rango', help: 'MOS fuera del rango configurado → se ajusta al límite' },
  ratio:    { sev: 'warn',  label: 'MAX/MIN extremo', help: 'Brecha MAX vs MIN muy amplia → MAX topado' },
  min0:     { sev: 'warn',  label: 'MIN = 0 en tienda activa', help: 'Tienda con cluster pero sin mínimo, no recibirá' },
  cluster:  { sev: 'warn',  label: 'Cluster inconsistente', help: 'Tiendas del mismo cluster con MIN distinto para el SKU → moda del cluster' },
  ap8:      { sev: 'warn',  label: 'AP8 mezclado en estilo', help: 'SKUs del mismo estilo con AP8 distinto → moda del estilo' },
  nivel:    { sev: 'warn',  label: 'Nivel fcst mezclado', help: 'SKUs del mismo estilo con nivel de forecast distinto → moda' },
  curva:    { sev: 'warn',  label: 'MIN vs curva de compra', help: 'Mezcla de tallas en MIN se aleja de la curva comprada' },
};
const OC_RULES = {
  bajoMin:   { sev: 'error', label: 'No cubre mínimo', help: 'Cantidad en OC < MIN parametrizado de la tienda/SKU' },
  destalle:  { sev: 'error', label: 'Tienda destallada', help: 'Recibe el estilo pero le faltan tallas centrales de la curva' },
  sinPedido: { sev: 'warn',  label: 'Tienda parametrizada sin OC', help: 'Tiene MIN > 0 pero no aparece en la OC' },
  pico:      { sev: 'warn',  label: 'Pico de cantidad', help: 'Cantidad muy por arriba de la mediana del SKU o del MAX' },
  concentr:  { sev: 'warn',  label: 'Concentración', help: 'Pocas tiendas se llevan la mayor parte del SKU' },
};

function checkParams(P, compraOC, cfg) {
  const { cols: c, rows } = P, F = [];
  const get = (r, k) => (c[k] != null ? r[c[k]] : undefined);
  const fixes = rows.map(() => ({})); // idx → {campo: valor}
  const add = (rule, where, detalle, actual, sugerido, idx, field, val) => {
    F.push({ rule, sev: PARAM_RULES[rule].sev, where, detalle, actual, sugerido });
    if (idx != null && field) (Array.isArray(idx) ? idx : [idx]).forEach((i) => (fixes[i][field] = val));
  };
  const R = rows.map((r, i) => ({ i, sku: String(get(r, 'sku')).trim(), tienda: String(get(r, 'tienda')).trim(), estilo: String(get(r, 'estilo') ?? '').trim(), talla: String(get(r, 'talla') ?? '').trim(), cluster: String(get(r, 'cluster') ?? '').trim(), ap8: String(get(r, 'ap8') ?? '').trim(), nivel: String(get(r, 'nivel') ?? '').trim(), mos: num(get(r, 'mos')), min: num(get(r, 'min')), max: num(get(r, 'max')), compra: num(get(r, 'compra')) }));
  const W = R.map((r) => ({ ...r })); // valores de trabajo con correcciones acumuladas

  // 1. vacíos
  R.forEach((r) => {
    const miss = ['cluster', 'ap8', 'nivel', 'mos', 'min', 'max'].filter((k) => c[k] != null && isBlank(get(rows[r.i], k)));
    if (miss.length) add('vacio', `${r.sku} · T${r.tienda}`, `Sin ${miss.join(', ').toUpperCase()}`, '', 'Capturar', null);
  });
  // 2. cluster: MIN por SKU×cluster
  if (c.cluster != null) groupBy(W.filter((r) => r.cluster && isFinite(r.min)), (r) => `${r.sku}|${r.cluster}`).forEach((g, k) => {
    const m = +moda(g.map((r) => r.min)), off = g.filter((r) => r.min !== m);
    if (g.length > 2 && off.length && off.length / g.length <= 0.34) off.forEach((r) => { add('cluster', `${r.sku} · T${r.tienda}`, `Cluster ${k.split('|')[1]}: MIN ${r.min} vs moda ${m}`, r.min, m, r.i, 'min', m); r.min = m; });
  });
  // 3. AP8 / nivel por estilo
  const est = (r) => r.estilo || r.sku;
  [['ap8', 'ap8'], ['nivel', 'nivel']].forEach(([k, rule]) => {
    if (c[k] == null) return;
    groupBy(W.filter((r) => r[k]), est).forEach((g, e) => {
      const vals = new Set(g.map((r) => r[k])); if (vals.size < 2) return;
      const m = moda(g.map((r) => r[k]));
      const bySku = groupBy(g.filter((r) => r[k] !== m), (r) => r.sku);
      bySku.forEach((gs, sku) => { add(rule, `Estilo ${e} · ${sku}`, `${gs.length} tiendas con ${[...new Set(gs.map((r) => r[k]))].join('/')} vs ${m}`, gs[0][k], m, gs.map((r) => r.i), k, m); gs.forEach((r) => (r[k] = m)); });
    });
  });
  // 4. MOS
  if (c.mos != null) W.forEach((r) => {
    if (!isFinite(r.mos)) return;
    const v = Math.min(cfg.mosMax, Math.max(cfg.mosMin, r.mos));
    if (v !== r.mos) { add('mos', `${r.sku} · T${r.tienda}`, `MOS ${r.mos} fuera de ${cfg.mosMin}–${cfg.mosMax}`, r.mos, v, r.i, 'mos', v); r.mos = v; }
  });
  // 5. MIN = 0 en tienda con cluster
  W.forEach((r) => { if (r.cluster && r.min === 0 && r.max > 0) add('min0', `${r.sku} · T${r.tienda}`, `Cluster ${r.cluster}, MAX ${r.max}, MIN 0`, 0, '≥1', null); });
  // 6. MIN > MAX
  W.forEach((r) => { if (isFinite(r.min) && isFinite(r.max) && r.min > r.max) { add('minmax', `${r.sku} · T${r.tienda}`, `MIN ${r.min} > MAX ${r.max}`, r.max, r.min, r.i, 'max', r.min); r.max = r.min; } });
  // 7. MAX/MIN extremo
  W.forEach((r) => { if (r.min > 0 && r.max / r.min > cfg.maxMinRatio) { const v = Math.round(r.min * cfg.maxMinRatio); add('ratio', `${r.sku} · T${r.tienda}`, `MAX ${r.max} = ${(r.max / r.min).toFixed(1)}× MIN`, r.max, v, r.i, 'max', v); r.max = v; } });
  // 8. Compra vs Σ MIN / Σ MAX por SKU
  const compraSku = {};
  groupBy(W, (r) => r.sku).forEach((g, sku) => {
    const compra = Math.max(...g.map((r) => (isFinite(r.compra) ? r.compra : 0))) || compraOC[sku] || 0;
    compraSku[sku] = compra; if (!compra) return;
    const sMin = g.reduce((s, r) => s + (r.min || 0), 0), sMax = g.reduce((s, r) => s + (r.max || 0), 0);
    if (sMin > compra) {
      const f = compra / sMin; let n0 = 0;
      g.forEach((r) => { if (!r.min) return; const v = Math.floor(r.min * f); if (!v) n0++; fixes[r.i].min = v; if (r.max < v) fixes[r.i].max = v; r.min = v; });
      add('compraMin', `SKU ${sku}`, `Σ MIN ${fmt(sMin)} vs compra ${fmt(compra)} (${g.length} tiendas)${n0 ? ` · ${n0} tiendas quedan en 0: considera sacarlas` : ''}`, sMin, compra, null);
    } else if (sMax && compra > sMax * cfg.sobranteCompra) add('sobrante', `SKU ${sku}`, `Compra ${fmt(compra)} vs Σ MAX ${fmt(sMax)} → sobran ~${fmt(compra - sMax)} pzas`, sMax, `Subir MAX o abrir tiendas`, null);
  });
  // 9. Curva: mezcla de tallas en Σ MIN vs compra
  if (c.talla != null) groupBy(W.filter((r) => r.talla), est).forEach((g, e) => {
    const bySz = groupBy(g, (r) => r.talla);
    const skuOf = Object.fromEntries([...bySz].map(([t, gs]) => [t, gs[0].sku]));
    const tMin = [...bySz].reduce((s, [, gs]) => s + gs.reduce((a, r) => a + (r.min || 0), 0), 0);
    const tCom = Object.values(skuOf).reduce((s, sku) => s + (compraSku[sku] || 0), 0);
    if (!tMin || !tCom) return;
    bySz.forEach((gs, t) => {
      const sMin = gs.reduce((a, r) => a + (r.min || 0), 0) / tMin, sCom = (compraSku[skuOf[t]] || 0) / tCom;
      if (Math.abs(sMin - sCom) * 100 > cfg.curvaPts) add('curva', `Estilo ${e} · T.${t}`, `MIN pesa ${pct(sMin)} vs compra ${pct(sCom)}`, pct(sMin), pct(sCom), null);
    });
  });
  return { findings: F, fixes, R };
}

function checkOC(O, P, cfg) {
  const F = [], c = O.cols;
  const add = (rule, where, detalle, actual, sugerido) => F.push({ rule, sev: OC_RULES[rule].sev, where, detalle, actual, sugerido });
  const L = O.rows.map((r) => ({ sku: String(r[c.sku]).trim(), tienda: String(r[c.tienda]).trim(), estilo: String(c.estilo != null ? r[c.estilo] : '').trim(), talla: String(c.talla != null ? r[c.talla] : '').trim(), oc: String(c.oc != null ? r[c.oc] : '').trim(), qty: num(r[c.qty]) || 0 }));
  // agrega por SKU×tienda
  const agg = new Map(); L.forEach((l) => { const k = `${l.sku}|${l.tienda}`; const a = agg.get(k) || { ...l, qty: 0 }; a.qty += l.qty; agg.set(k, a); });
  const A = [...agg.values()];
  // Param index
  const pIdx = new Map();
  if (P) { const pc = P.cols; P.rows.forEach((r) => pIdx.set(`${String(r[pc.sku]).trim()}|${String(r[pc.tienda]).trim()}`, { min: num(r[pc.min]), max: num(r[pc.max]), estilo: pc.estilo != null ? String(r[pc.estilo]).trim() : '', talla: pc.talla != null ? String(r[pc.talla]).trim() : '' })); }
  A.forEach((a) => { const p = pIdx.get(`${a.sku}|${a.tienda}`); if (p) { a.estilo ||= p.estilo; a.talla ||= p.talla; } });
  // bajo mínimo / sin pedido
  if (P) {
    A.forEach((a) => { const p = pIdx.get(`${a.sku}|${a.tienda}`); if (p && p.min > 0 && a.qty < p.min) add('bajoMin', `${a.sku} · T${a.tienda}`, `OC ${a.qty} vs MIN ${p.min}`, a.qty, p.min); });
    const ocSkus = new Set(A.map((a) => a.sku));
    pIdx.forEach((p, k) => { const [sku, t] = k.split('|'); if (ocSkus.has(sku) && p.min > 0 && !agg.has(k)) add('sinPedido', `${sku} · T${t}`, `MIN ${p.min}, no viene en OC`, 0, p.min); });
  }
  // picos y concentración por SKU
  groupBy(A, (a) => a.sku).forEach((g, sku) => {
    const q = g.map((a) => a.qty).sort((x, y) => x - y), med = q[Math.floor(q.length / 2)] || 0, tot = q.reduce((s, v) => s + v, 0);
    g.forEach((a) => {
      const p = pIdx.get(`${sku}|${a.tienda}`);
      if (p && p.max > 0 && a.qty > p.max) add('pico', `${sku} · T${a.tienda}`, `OC ${a.qty} > MAX ${p.max}`, a.qty, p.max);
      else if (g.length >= 5 && med > 0 && a.qty > med * cfg.picoX) add('pico', `${sku} · T${a.tienda}`, `${a.qty} pzas = ${(a.qty / med).toFixed(1)}× la mediana (${med})`, a.qty, Math.round(med * cfg.picoX));
    });
    if (g.length >= 5 && tot) {
      const nTop = Math.max(1, Math.ceil(g.length * cfg.concTop)), top = [...g].sort((x, y) => y.qty - x.qty).slice(0, nTop), sh = top.reduce((s, a) => s + a.qty, 0) / tot;
      if (sh > cfg.concShare) add('concentr', `SKU ${sku}`, `${nTop} de ${g.length} tiendas (${top.slice(0, 3).map((a) => 'T' + a.tienda).join(', ')}…) se llevan ${pct(sh)}`, pct(sh), `≤ ${pct(cfg.concShare)}`);
    }
  });
  // destalle por estilo×tienda: tallas centrales (≥ coreTalla del estilo) faltantes
  groupBy(A.filter((a) => a.estilo && a.talla), (a) => a.estilo).forEach((g, e) => {
    const bySz = {}; g.forEach((a) => (bySz[a.talla] = (bySz[a.talla] || 0) + a.qty));
    const tot = Object.values(bySz).reduce((s, v) => s + v, 0); if (!tot) return;
    const core = Object.keys(bySz).filter((t) => bySz[t] / tot >= cfg.coreTalla);
    groupBy(g, (a) => a.tienda).forEach((gt, t) => {
      const has = new Set(gt.filter((a) => a.qty > 0).map((a) => a.talla)), miss = core.filter((x) => !has.has(x));
      if (has.size && miss.length) add('destalle', `Estilo ${e} · T${t}`, `Recibe ${[...has].sort().join(', ')}; faltan ${miss.sort().join(', ')}`, `${has.size}/${core.length} centrales`, `Agregar ${miss.join(', ')} o sacar tienda`);
    });
  });
  const compraOC = {}; A.forEach((a) => (compraOC[a.sku] = (compraOC[a.sku] || 0) + a.qty));
  return { findings: F, compraOC, nSku: new Set(A.map((a) => a.sku)).size, nTiendas: new Set(A.map((a) => a.tienda)).size, pzas: A.reduce((s, a) => s + a.qty, 0) };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const downloadCSV = (name, aoa) => {
  const blob = new Blob(['﻿' + aoa.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
};

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function ModuleAllocation({ t, isDark, navIcon, navLabel, navDesc }) {
  const [tab, setTab] = useState('param');
  const [data, setData] = useState({ param: null, oc: null });
  const [cfg, setCfg] = useState(() => { try { return { ...DEF_CFG, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}').cfg }; } catch { return DEF_CFG; } });
  const [showCfg, setShowCfg] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fRule, setFRule] = useState(null);
  const [fSev, setFSev] = useState('all');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { idbGet('data').then((d) => d && setData(d)); }, []);
  // meta: umbrales + archivos cargados (la barra "Datos:" marca el módulo solo si hay archivos)
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ cfg })); localStorage.setItem('gop_allocation_files', JSON.stringify([data.param?.name, data.oc?.name].filter(Boolean))); } catch {} }, [cfg, data]);
  useEffect(() => { setFRule(null); setQ(''); }, [tab]);
  useEffect(() => {
    const TABS = ['param', 'oc'];
    const h = (e) => { if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return; e.preventDefault(); setTab((cur) => TABS[(TABS.indexOf(cur) + 1) % 2]); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const ocRes = useMemo(() => (data.oc ? checkOC(data.oc, data.param, cfg) : null), [data, cfg]);
  const pRes = useMemo(() => (data.param ? checkParams(data.param, ocRes?.compraOC || {}, cfg) : null), [data, cfg, ocRes]);

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    if (!files.length) return;
    try {
      const next = { ...data }; const got = [];
      for (const f of files) { const r = await parseFile(f); ['param', 'oc'].forEach((k) => { if (r[k]) { next[k] = r[k]; got.push(`${k === 'param' ? 'Param' : 'OC'}: ${r[k].rows.length.toLocaleString('es-MX')} filas`); } }); }
      if (!got.length) { setMsg({ ok: false, text: 'No encontré hojas válidas. Param: SKU, TIENDA, MIN/MAX · OC: SKU, TIENDA, CANTIDAD.' }); return; }
      setData(next); await idbSet('data', next);
      setMsg({ ok: true, text: got.join(' · ') });
      if (!next.param && next.oc) setTab('oc');
    } catch (err) { setMsg({ ok: false, text: `Error leyendo Excel: ${err.message}` }); }
  };
  const clearAll = async () => { if (!confirm('¿Borrar parametrizaciones y OC cargadas?')) return; const e = { param: null, oc: null }; setData(e); await idbSet('data', e); };

  const exportCorrected = () => {
    const P = data.param, { fixes } = pRes, c = P.cols;
    const aoa = [[...P.header, 'CAMBIOS']];
    P.rows.forEach((r, i) => {
      const f = fixes[i], row = [...r], ch = [];
      Object.entries(f).forEach(([k, v]) => { if (c[k] != null && String(r[c[k]]) !== String(v)) { ch.push(`${k.toUpperCase()} ${r[c[k]]}→${v}`); row[c[k]] = v; } });
      aoa.push([...row, ch.join('; ')]);
    });
    downloadCSV('Parametrizacion_corregida.csv', aoa);
  };
  const exportFindings = (F, rules, name) => downloadCSV(name, [['Severidad', 'Regla', 'Dónde', 'Detalle', 'Actual', 'Sugerido'], ...F.map((f) => [f.sev === 'error' ? 'Error' : 'Advertencia', rules[f.rule].label, f.where, f.detalle, f.actual, f.sugerido])]);

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left whitespace-nowrap ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs whitespace-nowrap';
  const inCls = `px-2 py-1 text-xs rounded-lg border focus:outline-none focus:ring-1 ${t.input}`;

  const res = tab === 'param' ? pRes : ocRes, RULES = tab === 'param' ? PARAM_RULES : OC_RULES, src = data[tab];
  const F = res?.findings || [];
  const counts = useMemo(() => { const m = {}; F.forEach((f) => (m[f.rule] = (m[f.rule] || 0) + 1)); return m; }, [F]);
  const shown = useMemo(() => {
    const s = norm(q);
    return F.filter((f) => (!fRule || f.rule === fRule) && (fSev === 'all' || f.sev === fSev) && (!s || norm(`${f.where} ${f.detalle}`).includes(s)))
      .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'error' ? -1 : 1));
  }, [F, fRule, fSev, q]);
  const nErr = F.filter((f) => f.sev === 'error').length, nWarn = F.length - nErr;
  const nFixed = pRes ? pRes.fixes.filter((f) => Object.keys(f).length).length : 0;

  const headerRight = (
    <>
      <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-bold ${t.btn}`}><Upload size={14} />Cargar Excel</button>
      <button onClick={exportCorrected} disabled={!pRes} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg ${t.btnSec} disabled:opacity-40`}><Download size={14} />CSV corregido</button>
      <button onClick={() => setShowCfg((v) => !v)} className={`p-2 rounded-lg border ${t.btnEdit}`} title="Umbrales"><Settings size={14} /></button>
      <button onClick={clearAll} className={`p-2 rounded-lg border ${t.btnDanger}`} title="Borrar todo"><Trash2 size={14} /></button>
      <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={onFiles} />
    </>
  );

  const CFG_FIELDS = [
    ['mosMin', 'MOS mínimo'], ['mosMax', 'MOS máximo'], ['maxMinRatio', 'MAX/MIN tope (×)'], ['curvaPts', 'Desv. curva (pts)'],
    ['sobranteCompra', 'Compra / Σ MAX tope (×)'], ['picoX', 'Pico vs mediana (×)'], ['concTop', '% tiendas top'], ['concShare', '% pzas máx top'], ['coreTalla', 'Talla central ≥ %'],
  ];

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {showCfg && (
        <div className={`${card} grid grid-cols-2 md:grid-cols-5 gap-3`}>
          {CFG_FIELDS.map(([k, l]) => (
            <label key={k} className={`text-[10px] font-bold uppercase ${t.textMuted}`}>{l}
              <input type="number" step="0.05" value={cfg[k]} onChange={(e) => setCfg((s) => ({ ...s, [k]: +e.target.value || 0 }))} className={`mt-1 w-full ${inCls}`} />
            </label>
          ))}
          <button onClick={() => setCfg(DEF_CFG)} className={`self-end px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>Restablecer</button>
        </div>
      )}
      <div className={`flex gap-4 border-b ${t.border}`}>
        {[['param', 'Parametrizaciones'], ['oc', 'OC']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`pb-2 text-sm font-bold border-b-2 ${tab === id ? t.tabActive : t.tabInactive}`}>{l}</button>
        ))}
      </div>

      {!src ? (
        <div className={`${card} text-center py-16`}>
          <Upload size={28} className={`mx-auto mb-3 ${t.textMuted}`} />
          <p className={`font-bold ${t.text}`}>Carga el Excel de {tab === 'param' ? 'parametrizaciones' : 'OC / pedidos'}</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>
            {tab === 'param' ? 'Columnas: SKU, TIENDA, MIN, MAX · opcional ESTILO, TALLA, CLUSTER, AP8, NIVEL FCST, MOS, COMPRA' : 'Columnas: SKU, TIENDA, CANTIDAD · opcional OC, ESTILO, TALLA'}
          </p>
          <p className={`text-[10px] mt-1 ${t.textMuted}`}>Puede ser un archivo con dos hojas o dos archivos (selección múltiple). Se guarda en IndexedDB.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ['Errores', fmt(nErr), nErr ? t.danger : t.success, AlertOctagon],
              ['Advertencias', fmt(nWarn), nWarn ? t.warning : t.success, AlertTriangle],
              tab === 'param' ? ['Filas corregidas', fmt(nFixed), t.accent1, CheckCircle2] : ['Piezas OC', fmt(ocRes.pzas), t.accent1, CheckCircle2],
              ['SKUs', fmt(tab === 'param' ? new Set(pRes.R.map((r) => r.sku)).size : ocRes.nSku), t.text],
              ['Tiendas', fmt(tab === 'param' ? new Set(pRes.R.map((r) => r.tienda)).size : ocRes.nTiendas), t.text],
            ].map(([l, v, cl, Ic]) => (
              <div key={l} className={card}>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${t.textMuted}`}>{l}</p>
                <p className={`text-2xl font-black mt-1 flex items-center gap-2 ${cl}`}>{Ic && <Ic size={18} />}{v}</p>
              </div>
            ))}
          </div>
          <p className={`text-[10px] ${t.textMuted}`}>Fuente: {src.name}{tab === 'oc' && !data.param ? ' · Sin parametrización cargada: no se revisan mínimos ni MAX.' : ''}</p>

          {/* Reglas: click filtra */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(RULES).map(([k, r]) => {
              const n = counts[k] || 0, on = fRule === k;
              return (
                <button key={k} onClick={() => setFRule(on ? null : k)} className={`text-left rounded-xl border px-3 py-2 ${on ? (isDark ? 'border-[#E0BB3E]/60 bg-[#E0BB3E]/10' : 'border-blue-400 bg-blue-50') : t.cardInner} ${!n ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${t.text}`}>{r.label}</span>
                    <span className={`text-xs font-black tabular-nums ${!n ? t.success : r.sev === 'error' ? t.danger : t.warning}`}>{n ? fmt(n) : '✓'}</span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${t.textMuted}`}>{r.help}</p>
                </button>
              );
            })}
          </div>

          <div className={card}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="relative">
                <Search size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, tienda, estilo…" className={`pl-6 ${inCls}`} />
              </div>
              <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
                {[['all', 'Todo'], ['error', 'Errores'], ['warn', 'Advertencias']].map(([k, l]) => (
                  <button key={k} onClick={() => setFSev(k)} className={`px-3 py-1 text-xs rounded-md ${fSev === k ? t.toggleActive : t.textMuted}`}>{l}</button>
                ))}
              </div>
              <span className={`text-xs ${t.textMuted}`}>{fmt(shown.length)} hallazgos{fRule ? ` · ${RULES[fRule].label}` : ''}</span>
              <button onClick={() => exportFindings(shown, RULES, `Hallazgos_${tab === 'param' ? 'Param' : 'OC'}.csv`)} disabled={!shown.length} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnGhost} disabled:opacity-40`}><Download size={12} />Hallazgos</button>
            </div>
            {!shown.length ? (
              <p className={`text-center py-8 text-sm ${t.success}`}>Sin hallazgos con estos filtros.</p>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full">
                  <thead className="sticky top-0 z-10"><tr>{['', 'Regla', 'Dónde', 'Qué está mal', 'Actual', 'Cambiar a'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.slice(0, 1000).map((f, i) => (
                      <tr key={i} className={`border-t ${t.border} ${t.tableRow}`}>
                        <td className={td}>{f.sev === 'error' ? <AlertOctagon size={13} className={t.danger} /> : <AlertTriangle size={13} className={t.warning} />}</td>
                        <td className={`${td} font-bold ${t.text}`}>{RULES[f.rule].label}</td>
                        <td className={`${td} ${t.accent1}`}>{f.where}</td>
                        <td className={`${td} ${t.text} whitespace-normal min-w-[240px]`}>{f.detalle}</td>
                        <td className={`${td} tabular-nums text-right ${t.textMuted}`}>{String(f.actual)}</td>
                        <td className={`${td} tabular-nums text-right font-bold ${t.accent2}`}>{String(f.sugerido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length > 1000 && <p className={`mt-2 text-[10px] ${t.textMuted}`}>Mostrando 1,000 de {fmt(shown.length)} — descarga el CSV de hallazgos para verlos todos.</p>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

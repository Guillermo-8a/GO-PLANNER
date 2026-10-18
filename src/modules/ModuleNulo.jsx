// src/modules/ModuleNulo.jsx
// Nulo Movimiento (Check Coo): mercancía sin venta en cada combinación SKU × centro (tiendas y bodegas).
// Entrada: CSV de BigQuery (o la hoja BASE del Excel "Nulo Propuesta"). Una fila por SKU × centro.
// Regla: meses desde la última venta > umbral (3 por default, editable por sección).
//   Sin venta en la ventana (">14 meses") → se mide la antigüedad desde la 1a recepción (si es reciente no es nulo).
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Upload, Download, Trash2, Settings, Search, ChevronDown } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import FilterMenu, { FilterSection } from '../components/FilterMenu';

const LS_CFG = 'gop_nulo_cfg', LS_FILES = 'gop_nulo_files', DB_NAME = 'gop_nulo_db';

// ─── Utilidades ───────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, '')));
const str = (v) => String(v ?? '').trim();
const ctr = (v) => { const s = str(v); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; };
const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const fmt$ = (v) => (v == null || !isFinite(v) ? '—' : `$${Math.round(v).toLocaleString('es-MX')}`);
const fmtM = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)} M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(0)} K` : fmt$(v));
const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);

const MES = { ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12 };
const MES_TXT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const mi = (y, m) => y * 12 + (m - 1);
const miTxt = (x) => (x == null || !isFinite(x) ? '—' : `${MES_TXT[((x % 12) + 12) % 12]} ${Math.floor(x / 12)}`);
const isoMonday = (w, y) => { const d = new Date(Date.UTC(y, 0, 4)); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() || 7) + 1 + (w - 1) * 7); return d; };
const isoWeekMi = (w, y) => { const d = isoMonday(w, y); return mi(d.getUTCFullYear(), d.getUTCMonth() + 1); };
// Semana de 1a recepción: 'SS.AAAA' (Excel) o 'AAAASS' (BigQuery) → [semana, año]
const wkParts = (v) => { const t = str(v); let m = t.match(/^(\d{1,2})\.(\d{4})$/); if (m) return [+m[1], +m[2]]; m = t.match(/^(20\d{2}|19\d{2})(\d{2})$/); return m && +m[2] >= 1 && +m[2] <= 53 ? [+m[2], +m[1]] : null; };
const weekIdx = (v) => { const w = wkParts(v); return w ? Math.round(isoMonday(w[0], w[1]) / 6048e5) : null; }; // semana absoluta
function parseMes(v) {
  if (v instanceof Date) return mi(v.getFullYear(), v.getMonth() + 1);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return mi(d.getUTCFullYear(), d.getUTCMonth() + 1); }
  const raw = str(v); let m;
  const wk = wkParts(raw); if (wk) return isoWeekMi(wk[0], wk[1]); // semana (Fecha de Primera Rec)
  const s = norm(raw);
  if ((m = s.match(/^(\d{4})[-/ ](\d{1,2})\b/))) return mi(+m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/))) return mi(+m[3], +m[2]);
  if ((m = s.match(/^([A-Z]{3})[A-Z]*[ -]*(\d{4})$/)) && MES[m[1]]) return mi(+m[2], MES[m[1]]);
  return null;
}

// Bodegas regionales / PLAN: centro con S al final o nombre CR / PLAN / BODEGA / CEDIS
const isBodega = (c, name) => /S$/i.test(c) || /^(CR |PLAN|BODEGA|CEDIS|FULFIL)/.test(norm(name));

const ALIAS = {
  secNum: ['# SECCION', '#SECCION', 'NUM SECCION', 'NO SECCION', 'ID SECCION', 'SECCION ID', 'CVE SECCION'],
  seccion: ['SECCION', 'NOM SECCION', 'NOMBRE SECCION', 'DESC SECCION'],
  zona: ['ZONA DE VENTAS', 'ZONA VENTAS', 'ZONA'],
  centro: ['CENTRO', 'ID CENTRO', 'CVE CENTRO'],
  tienda: ['TIENDA', 'NOMBRE CENTRO', 'DESC CENTRO', 'NOMBRE TIENDA'],
  prov: ['PROVEEDOR', 'NOMBRE PROVEEDOR', 'DESC PROVEEDOR'],
  goa: ['GRUPO ARTICULOS', 'GRUPO DE ARTICULOS', 'GOA', 'DESC GRUPO'],
  marca: ['MARCA', 'DENOMINACION MARCA'],
  estatus: ['ESTATUS DEL ARTICULO', 'ESTATUS ARTICULO', 'ESTATUS'],
  norma: ['NORMA DE APROVISIONAMIENTO', 'NORMA APROVISIONAMIENTO', 'NORMA'],
  letra: ['LETRA ACTUAL', 'LETRA'],
  sku: ['SKU', 'MATERIAL', 'VAR / IND', 'VAR/IND'],
  desc: ['ARTICULO', 'DESCRIPCION', 'DESCRIPCION ARTICULO', 'DESC ARTICULO'],
  modelo: ['MODELO', 'MODELO PROVEEDOR'],
  precio: ['PRECIO DE VENTA ACT', 'PRECIO VENTA ACT', 'PRECIO'],
  pzs: ['PZS', 'PIEZAS', 'OH', 'OH PZS', 'INV PZS'],
  monto: ['MONTO', 'MONTO $', 'OH $', 'INV $', 'VALOR'],
  meses: ['#MESES DESDE ULT VTA', '# MESES DESDE ULT VTA', 'MESES DESDE ULT VTA', 'MESES SIN VENTA'],
  mesUlt: ['MES ULTIMA VTA', 'MES ULT VTA', 'MES ULTIMA VENTA'],
  fecUlt: ['FECHA ULTIMA VENTA', 'FECHA ULT VTA', 'FECHA ULTIMA VTA', 'ULTIMA VENTA'],
  mesRec: ['MES 1A RECEPCION', 'MES PRIMERA RECEPCION'],
  anioRec: ['ANO RECEPCION', 'ANIO RECEPCION'],
  accion: ['ACCION', 'ACCION SUGERIDA'],
  destinos: ['DESTINOS', 'DESTINOS SUGERIDOS'],
  fecRec: ['FECHA DE PRIMERA REC', 'FECHA PRIMERA RECEPCION', 'FECHA 1A RECEPCION', 'FECHA DE PRIMERA RECEPCION'],
};
const mapHeader = (h) => { const n = h.map(norm), c = {}; Object.entries(ALIAS).forEach(([k, al]) => { const i = n.findIndex((x) => al.includes(x)); if (i >= 0) c[k] = i; }); return c; };
const headerOk = (c) => c.centro != null && c.sku != null && (c.monto != null || c.pzs != null) && (c.meses != null || c.mesUlt != null || c.fecUlt != null);

// ─── Lectura: arma columnas tipadas sin guardar las filas crudas ─────────────
const DIM_KEYS = ['sec', 'zona', 'centro', 'prov', 'goa', 'marca', 'estatus', 'norma', 'letra', 'sku'];
function makeBuilder() {
  const D = Object.fromEntries(DIM_KEYS.map((k) => [k, { idx: new Map(), list: [] }]));
  const enc = (k, v) => { const d = D[k]; let i = d.idx.get(v); if (i === undefined) { i = d.list.length; d.idx.set(v, i); d.list.push(v); } return i; };
  const A = Object.fromEntries([...DIM_KEYS, 'pzs', 'monto', 'meses', 'ult', 'rec', 'recW'].map((k) => [k, []]));
  const info = { secNum: {}, centro: {}, sku: {} };
  let c = null, hdrTries = 0;
  const push = (r) => {
    if (!c) { const h = mapHeader(r); if (headerOk(h)) c = h; else if (++hdrTries > 15) throw new Error('No encontré encabezados: hacen falta Centro, SKU, Monto/Pzs y #Meses desde Ult Vta (o Mes Ultima Vta).'); return; }
    const centro = ctr(r[c.centro]), sku = str(r[c.sku]);
    if (!centro || !sku) return;
    const pz = c.pzs != null ? num(r[c.pzs]) || 0 : 0, mt = c.monto != null ? num(r[c.monto]) || 0 : 0;
    if (pz <= 0 && mt <= 0) return;
    const sec = str(r[c.seccion]) || '—';
    if (c.secNum != null && !info.secNum[sec]) info.secNum[sec] = str(r[c.secNum]);
    if (!info.centro[centro]) info.centro[centro] = str(r[c.tienda]) || centro;
    if (!info.sku[sku]) info.sku[sku] = { desc: str(r[c.desc]), modelo: c.modelo != null ? str(r[c.modelo]) : '', precio: c.precio != null ? num(r[c.precio]) : null, acc: {} };
    // Acción sugerida (por modelo) y destinos de traslado: vienen del extracto BigQuery, solo en filas en nulo
    if (c.accion != null && str(r[c.accion])) info.sku[sku].acc[centro] = [str(r[c.accion]), c.destinos != null ? str(r[c.destinos]) : ''];
    A.sec.push(enc('sec', sec)); A.zona.push(enc('zona', str(r[c.zona]) || (isBodega(centro, info.centro[centro]) ? 'BODEGAS' : '—'))); A.centro.push(enc('centro', centro));
    A.prov.push(enc('prov', str(r[c.prov]) || '—')); A.goa.push(enc('goa', str(r[c.goa]) || '—')); A.marca.push(enc('marca', str(r[c.marca]) || '—'));
    A.estatus.push(enc('estatus', str(r[c.estatus]) || 'Sin asignar')); A.norma.push(enc('norma', str(r[c.norma]) || 'Sin asignar')); A.letra.push(enc('letra', str(r[c.letra]) || '—'));
    A.sku.push(enc('sku', sku)); A.pzs.push(pz); A.monto.push(mt);
    // meses: número, o texto ">14 meses"/"sin venta" → null
    const mv = c.meses != null ? num(r[c.meses]) : NaN; A.meses.push(isFinite(mv) ? mv : null);
    A.ult.push(c.mesUlt != null ? parseMes(r[c.mesUlt]) : c.fecUlt != null ? parseMes(r[c.fecUlt]) : null);
    let rec = null;
    if (c.mesRec != null && c.anioRec != null) rec = parseMes(`${str(r[c.mesRec])} ${str(r[c.anioRec])}`);
    if (rec == null && c.fecRec != null) rec = parseMes(r[c.fecRec]);
    A.rec.push(rec); A.recW.push(c.fecRec != null ? weekIdx(r[c.fecRec]) : null);
  };
  const finish = (name) => {
    if (!c) throw new Error('No encontré encabezados válidos.');
    const n = A.sku.length; if (!n) throw new Error('El archivo no trae filas con inventario.');
    // Corte = mes de la última venta + meses (moda); si no hay, el mes más reciente con venta
    const cnt = new Map(); let maxU = -Infinity;
    for (let i = 0; i < n; i++) { const u = A.ult[i]; if (u != null) { if (u > maxU) maxU = u; if (A.meses[i] != null) { const k = u + A.meses[i]; cnt.set(k, (cnt.get(k) || 0) + 1); } } }
    const now = new Date();
    const corte = cnt.size ? [...cnt].sort((a, b) => b[1] - a[1])[0][0] : isFinite(maxU) ? maxU : mi(now.getFullYear(), now.getMonth());
    const C = {};
    DIM_KEYS.forEach((k) => (C[k] = Uint32Array.from(A[k])));
    C.pzs = Float64Array.from(A.pzs); C.monto = Float64Array.from(A.monto);
    // Semana de corte = semana siguiente a la última 1a recepción (antigüedad en semanas, como el archivo: > 13 sem = nulo)
    let maxW = -Infinity; for (let i = 0; i < n; i++) if (A.recW[i] != null && A.recW[i] > maxW) maxW = A.recW[i];
    C.mUlt = new Int16Array(n); C.mRec = new Int16Array(n); C.wRec = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const m = A.meses[i] != null ? A.meses[i] : A.ult[i] != null ? corte - A.ult[i] : -1;
      C.mUlt[i] = m < 0 ? -1 : Math.min(m, 999);
      C.mRec[i] = A.rec[i] != null ? Math.max(0, Math.min(corte - A.rec[i], 999)) : -1;
      C.wRec[i] = A.recW[i] != null ? Math.min(maxW + 1 - A.recW[i], 9999) : -1;
    }
    const Dl = Object.fromEntries(DIM_KEYS.map((k) => [k, D[k].list]));
    const tipo = Uint8Array.from(Dl.centro.map((ce) => (isBodega(ce, info.centro[ce]) ? 1 : 0)));
    return { name, n, corte, loadedAt: Date.now(), D: Dl, info, tipo, C };
  };
  return { push, finish };
}

// CSV por streaming (archivos de BigQuery de cientos de MB). Respeta comillas.
async function readCSV(file, push, onProg) {
  const reader = file.stream().pipeThrough(new TextDecoderStream('utf-8')).getReader();
  let rest = '', d = null, pend = '', read = 0, first = true;
  const splitQ = (line) => {
    if (line.indexOf('"') < 0) return line.split(d);
    const out = []; let f = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === d) { out.push(f); f = ''; } else f += ch;
    }
    out.push(f); return out;
  };
  const line = (l) => {
    if (l.endsWith('\r')) l = l.slice(0, -1);
    if (pend) { l = `${pend}\n${l}`; pend = ''; }
    if ((l.split('"').length - 1) % 2) { pend = l; return; } // salto de línea dentro de comillas
    if (first) { l = l.replace(/^﻿/, ''); first = false; }
    if (!d) d = [',', ';', '\t', '|'].sort((a, b) => l.split(b).length - l.split(a).length)[0];
    if (l) push(splitQ(l));
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    read += value.length;
    const parts = (rest + value).split('\n'); rest = parts.pop();
    for (const p of parts) line(p);
    onProg?.(read); await new Promise((r) => setTimeout(r, 0));
  }
  if (rest) line(rest);
  if (pend) push(splitQ(pend));
}
async function readXLSX(file, push) {
  const buf = await file.arrayBuffer();
  const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
  const sn = names.find((s) => norm(s) === 'BASE') || names.find((s) => !s.startsWith('_')) || names[0];
  const wb = XLSX.read(buf, { type: 'array', sheets: [sn], dense: true, cellText: false, cellHTML: false });
  XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true }).forEach(push);
  return sn;
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('data'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async (k) => { const db = await idb(); return new Promise((res) => { const q = db.transaction('data').objectStore('data').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const idbSet = async (k, v) => { const db = await idb(); return new Promise((res) => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put(v, k); tx.oncomplete = res; tx.onerror = res; }); };

// ─── Cálculo ──────────────────────────────────────────────────────────────────
const BUCKETS = ['0 – 3 meses', '4 – 6 meses', '7 – 9 meses', '10 – 12 meses', '13+ meses', 'Sin venta en la ventana'];
const bucketOf = (m) => (m < 0 ? 5 : m <= 3 ? 0 : m <= 6 ? 1 : m <= 9 ? 2 : m <= 12 ? 3 : 4);
const FILTERS = [['sec', 'Sección'], ['goa', 'GOA'], ['marca', 'Marca'], ['norma', 'Norma'], ['estatus', 'Estatus del artículo'], ['letra', 'Letra de rebaja'], ['bucket', 'Meses desde últ. venta'], ['zona', 'Zona'], ['tipo', 'Tipo de centro']];
const FKEYS = FILTERS.map((f) => f[0]);
const DEF_CFG = { umbral: 3, porSeccion: {}, corte: '' };

function effective(X, cfg) {
  const { n, C } = X, off = cfg.corte ? (() => { const [y, m] = cfg.corte.split('-').map(Number); return mi(y, m) - X.corte; })() : 0;
  const thr = X.D.sec.map((s) => { const v = cfg.porSeccion?.[s]; return v === '' || v == null || !isFinite(+v) ? +cfg.umbral : +v; });
  const nulo = new Uint8Array(n), bucket = new Uint8Array(n), mU = new Int16Array(n), mR = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const u = C.mUlt[i] < 0 ? -1 : Math.max(0, C.mUlt[i] + off), r = C.mRec[i] < 0 ? -1 : Math.max(0, C.mRec[i] + off), t = thr[C.sec[i]];
    const w = C.wRec?.[i] >= 0 ? C.wRec[i] + Math.round((off * 52) / 12) : -1;
    mU[i] = u; mR[i] = r; bucket[i] = bucketOf(u);
    nulo[i] = u >= 0 ? (u > t ? 1 : 0) : w >= 0 ? (w > Math.round((t * 52) / 12) ? 1 : 0) : r >= 0 ? (r > t ? 1 : 0) : 1;
  }
  return { nulo, bucket, mU, mR, corte: X.corte + off };
}

function compute(X, E, F, estado) {
  const { n, C, D, tipo } = X, { nulo, bucket } = E;
  const val = (k, i) => (k === 'bucket' ? bucket[i] : k === 'tipo' ? tipo[C.centro[i]] : C[k][i]);
  const size = (k) => (k === 'bucket' ? BUCKETS.length : k === 'tipo' ? 2 : D[k].length);
  const active = FKEYS.filter((k) => F[k]?.size);
  const opt = Object.fromEntries(FKEYS.map((k) => [k, new Float64Array(size(k))]));
  const z = (k) => new Float64Array(D[k].length);
  const byLetra = z('letra'), byLetraP = z('letra'), byEst = z('estatus'), byMarca = z('marca'), byGoa = z('goa'), bySku = z('sku'), byProv = z('prov');
  const zT = z('zona'), zN = z('zona'), cT = z('centro'), cN = z('centro'), secT = z('sec'), secN = z('sec');
  const sec = new Map(); const rows = [];
  let m$ = 0, mP = 0, all$ = 0, allN$ = 0, wM = 0, wD = 0;
  for (let i = 0; i < n; i++) {
    let fails = 0, fk = null;
    for (const k of active) if (!F[k].has(val(k, i))) { fails++; fk = k; if (fails > 1) break; }
    if (fails > 1) continue;
    const m = C.monto[i], nu = nulo[i] === 1, ok = estado === 'all' || (estado === 'nulo' ? nu : !nu);
    if (fails === 1) { if (ok) opt[fk][val(fk, i)] += m; continue; }
    if (ok) for (const k of FKEYS) opt[k][val(k, i)] += m;
    all$ += m; zT[C.zona[i]] += m; cT[C.centro[i]] += m; secT[C.sec[i]] += m;
    if (nu) { allN$ += m; zN[C.zona[i]] += m; cN[C.centro[i]] += m; secN[C.sec[i]] += m; }
    if (!ok) continue;
    rows.push(i); m$ += m; mP += C.pzs[i];
    byLetra[C.letra[i]] += m; byLetraP[C.letra[i]] += C.pzs[i]; byEst[C.estatus[i]] += m; byMarca[C.marca[i]] += m; byGoa[C.goa[i]] += m; bySku[C.sku[i]] += m; byProv[C.prov[i]] += m;
    if (E.mU[i] >= 0) { wM += E.mU[i] * m; wD += m; }
    let s = sec.get(C.sec[i]); if (!s) sec.set(C.sec[i], (s = { m: 0, p: 0, c: new Set(), g: new Set(), k: new Set() }));
    s.m += m; s.p += C.pzs[i]; s.c.add(C.centro[i]); s.g.add(C.goa[i]); s.k.add(C.sku[i]);
  }
  const top = (arr, names, k, otras = true) => {
    const a = [...arr].map((v, i) => ({ name: names[i], value: v })).filter((x) => x.value > 0).sort((x, y) => y.value - x.value);
    if (!otras || a.length <= k) return a.slice(0, k);
    return [...a.slice(0, k), { name: 'Otras', value: a.slice(k).reduce((s, x) => s + x.value, 0) }];
  };
  const share = (T, N, names, k) => [...T].map((t, i) => ({ name: names[i], t, nu: N[i] })).filter((x) => x.nu > 0)
    .sort((a, b) => b.nu - a.nu).slice(0, k).map((x) => ({ name: x.name, nulo: x.nu / x.t, mov: 1 - x.nu / x.t, nu: x.nu, t: x.t }));
  const provTop = top(byProv, D.prov, 1, false)[0];
  return {
    opt, rows, m$, mP, all$, allN$, mesesProm: wD ? wM / wD : null, prov: provTop?.name || '—', combos: rows.length,
    letra: [...byLetra].map((v, i) => ({ name: D.letra[i], idx: i, value: v, pzs: byLetraP[i] })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    est: top(byEst, D.estatus, 6), marca: top(byMarca, D.marca, 7), goa: top(byGoa, D.goa, 6), sku: (() => { // por modelo (suma de sus SKUs en la selección); sin modelo → SKU
      const g = new Map();
      bySku.forEach((v, i) => { if (!v) return; const s = D.sku[i], k = X.info.sku[s] || {}, mo = k.modelo || s; const e = g.get(mo) || { value: 0, desc: (k.desc || '').split(',')[0] }; e.value += v; g.set(mo, e); });
      return [...g].map(([mo, e]) => ({ name: `${mo} · ${e.desc}`, value: e.value })).sort((x, y) => y.value - x.value).slice(0, 5);
    })(),
    zona: share(zT, zN, D.zona, 14),
    tienda: share(cT, cN, D.centro.map((ce) => X.info.centro[ce] || ce), 12),
    secs: [...sec].map(([si, s]) => ({ si, name: D.sec[si], num: X.info.secNum[D.sec[si]] || '', m: s.m, p: s.p, c: s.c.size, g: s.g.size, k: s.k.size, part: secT[si] ? secN[si] / secT[si] : null })).sort((a, b) => b.m - a.m),
  };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const downloadCSV = (name, lines) => { const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

const PAL = ['#7B1FA2', '#AB47BC', '#CE93D8', '#E040FB', '#D63F8C', '#F48FB1', '#9575CD', '#5E35B1'];
const NULO_C = '#D63F8C';
// RG = precio regular · PR/SR/TR = liquidación · cualquier otra letra = rebaja
const grpLetra = (l) => { const s = String(l || '').trim().toUpperCase(); return s === 'RG' ? 'RG' : ['PR', 'SR', 'TR'].includes(s) ? 'LQ' : 'RB'; };

// ─── Multiselect ──────────────────────────────────────────────────────────────
function MultiSelect({ label, options, sel, onChange, t, isDark, inCls }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), ref = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const s = norm(q), shown = options.filter((o) => (o.m > 0 || sel.has(o.v)) && (!s || norm(o.label).includes(s)));
  const toggle = (v) => { const nx = new Set(sel); nx.has(v) ? nx.delete(v) : nx.add(v); onChange(nx); };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center justify-between gap-2 w-44 ${inCls} ${sel.size ? (isDark ? '!border-violet-400/60 text-violet-300' : '!border-violet-400 text-violet-700') : ''}`}>
        <span className="truncate">{sel.size ? (sel.size === 1 ? options.find((o) => sel.has(o.v))?.label : `${sel.size} seleccionados`) : `${label}: Todos`}</span><ChevronDown size={12} />
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 w-72 rounded-xl border p-2 ${t.menuBg}`}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className={`w-full mb-2 ${inCls}`} />
          <div className="flex gap-2 mb-1">
            <button onClick={() => onChange(new Set(shown.map((o) => o.v)))} className={`text-[10px] ${t.accent1}`}>Seleccionar visibles</button>
            <button onClick={() => onChange(new Set())} className={`text-[10px] ${t.textMuted}`}>Limpiar</button>
          </div>
          <div className="max-h-64 overflow-auto">
            {shown.map((o) => (
              <label key={o.v} className={`flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer ${t.tableRow} ${t.text}`}>
                <input type="checkbox" checked={sel.has(o.v)} onChange={() => toggle(o.v)} className="accent-violet-500" />
                <span className="flex-1 truncate">{o.label}</span><span className={`tabular-nums text-[10px] ${t.textMuted}`}>{fmtM(o.m)}</span>
              </label>
            ))}
            {!shown.length && <p className={`text-xs px-1 py-2 ${t.textMuted}`}>Sin opciones</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function ModuleNulo({ t, isDark, navIcon, navLabel, navDesc }) {
  const [tab, setTab] = useState('resumen');
  const [X, setX] = useState(null);
  const [cfg, setCfg] = useState(() => { try { return { ...DEF_CFG, ...JSON.parse(localStorage.getItem(LS_CFG) || '{}') }; } catch { return DEF_CFG; } });
  const [F, setF] = useState({});
  const [estado, setEstado] = useState('nulo');
  const [showCfg, setShowCfg] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ k: 'monto', d: -1 });
  const fileRef = useRef(null);

  useEffect(() => { idbGet('data').then((d) => d && setX(d)); }, []);
  useEffect(() => { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch {} }, [cfg]);
  useEffect(() => {
    const TABS = ['resumen', 'detalle'];
    const h = (e) => { if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return; e.preventDefault(); setTab((cur) => TABS[(TABS.indexOf(cur) + 1) % 2]); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const E = useMemo(() => (X ? effective(X, cfg) : null), [X, cfg]);
  const R = useMemo(() => (X && E ? compute(X, E, F, estado) : null), [X, E, F, estado]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setMsg(null); setBusy('Leyendo archivo…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const b = makeBuilder(); let src = f.name;
      if (/\.xlsx?$/i.test(f.name)) { setBusy('Leyendo Excel (para archivos grandes usa el CSV de BigQuery)…'); await new Promise((r) => setTimeout(r, 30)); src += ` › ${await readXLSX(f, b.push)}`; }
      else await readCSV(f, b.push, (rd) => setBusy(`Leyendo CSV… ${Math.round((rd / f.size) * 100)}%`));
      setBusy('Armando base…'); await new Promise((r) => setTimeout(r, 30));
      const d = b.finish(src);
      setX(d); setF({}); await idbSet('data', d);
      try { localStorage.setItem(LS_FILES, JSON.stringify([src])); } catch {}
      setMsg({ ok: true, text: `${fmt(d.n)} combinaciones SKU × centro · ${fmt(d.D.centro.length)} centros (${fmt([...d.tipo].filter(Boolean).length)} bodegas) · corte ${miTxt(d.corte)}` });
    } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
    setBusy(null);
  };
  const clearAll = async () => { if (!confirm('¿Borrar la base de Nulo Movimiento?')) return; setX(null); setF({}); await idbSet('data', null); try { localStorage.removeItem(LS_FILES); } catch {} };

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left whitespace-nowrap cursor-pointer select-none ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs whitespace-nowrap';
  const inCls = `px-2 py-1 text-xs rounded-lg border focus:outline-none focus:ring-1 ${t.input}`;
  const ttStyle = { contentStyle: { background: isDark ? '#1c1720' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`, borderRadius: 10, fontSize: 11 }, itemStyle: { color: isDark ? '#EDEBF2' : '#111' } };
  const axisTick = { fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' };

  const optLabels = (k) => (k === 'bucket' ? BUCKETS : k === 'tipo' ? ['Tienda', 'Bodega'] : k === 'sec' ? X.D.sec.map((s) => `${X.info.secNum[s] ? X.info.secNum[s] + ' · ' : ''}${s}`) : X.D[k]);
  const nF = FKEYS.filter((k) => F[k]?.size).length;
  const setDim = (k, s) => setF((p) => ({ ...p, [k]: s }));

  // ── Detalle ──
  const detail = useMemo(() => {
    if (!R || tab !== 'detalle') return [];
    const { C, D, info } = X, s = norm(q);
    let idx = R.rows;
    if (s) idx = idx.filter((i) => { const sk = D.sku[C.sku[i]], ce = D.centro[C.centro[i]]; return norm(`${sk} ${info.sku[sk]?.desc} ${info.sku[sk]?.modelo} ${ce} ${info.centro[ce]} ${D.marca[C.marca[i]]}`).includes(s); });
    const key = { monto: (i) => C.monto[i], pzs: (i) => C.pzs[i], meses: (i) => (E.mU[i] < 0 ? 9999 : E.mU[i]), rec: (i) => E.mR[i], centro: (i) => D.centro[C.centro[i]], sku: (i) => D.sku[C.sku[i]], sec: (i) => D.sec[C.sec[i]], marca: (i) => D.marca[C.marca[i]] }[sort.k];
    return [...idx].sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d; });
  }, [R, X, E, q, sort, tab]);

  const DET_COLS = [
    ['sec', 'Sección'], ['zona', 'Zona'], ['centro', 'Centro'], [null, 'Tienda / bodega'], [null, 'Tipo'], [null, 'Proveedor'], [null, 'GOA'], ['marca', 'Marca'],
    ['sku', 'SKU'], [null, 'Artículo'], [null, 'Estatus'], [null, 'Norma'], [null, 'Letra'], [null, 'Últ. venta'], ['meses', 'Meses s/vta'], ['rec', 'Meses desde 1a rec.'], ['pzs', 'Pzs'], ['monto', 'Monto $'], [null, 'Estado'], [null, 'Acción'], [null, 'Destinos sugeridos'], [null, 'Diag. demanda'],
  ];
  const diag = useMemo(() => { try { return JSON.parse(localStorage.getItem('gop_demanda_diag') || '{}'); } catch { return {}; } }, [X]); // de Diagnóstico de demanda (por modelo)
  const detRow = (i) => {
    const { C, D, info, tipo } = X, sk = D.sku[C.sku[i]], ce = D.centro[C.centro[i]], u = E.mU[i];
    return [D.sec[C.sec[i]], D.zona[C.zona[i]], ce, info.centro[ce], tipo[C.centro[i]] ? 'Bodega' : 'Tienda', D.prov[C.prov[i]], D.goa[C.goa[i]], D.marca[C.marca[i]], sk, info.sku[sk]?.desc || '',
      D.estatus[C.estatus[i]], D.norma[C.norma[i]], D.letra[C.letra[i]], u < 0 ? 'Sin venta en ventana' : miTxt(E.corte - u), u < 0 ? '>14' : u, E.mR[i] < 0 ? '' : E.mR[i], C.pzs[i], Math.round(C.monto[i] * 100) / 100, E.nulo[i] ? 'Nulo' : 'Con movimiento', ...(E.nulo[i] && info.sku[sk]?.acc?.[ce] ? info.sku[sk].acc[ce] : ['', '']), diag[(info.sku[sk]?.modelo || '').trim()] || ''];
  };
  const exportDetail = () => downloadCSV(`Nulo_Movimiento_detalle_${miTxt(E.corte).replace(' ', '')}.csv`, [DET_COLS.map((c) => c[1]).map(csvCell).join(','), ...detail.map((i) => detRow(i).map(csvCell).join(','))]);
  const exportSecs = () => downloadCSV('Nulo_Movimiento_secciones.csv', [['# Sección', 'Sección', 'No de tiendas con NM', 'No de GOAs con NM', 'SKU', 'Monto', 'Pzs', '% del inventario de la sección'].join(','), ...R.secs.map((s) => [s.num, s.name, s.c, s.g, s.k, Math.round(s.m), s.p, s.part != null ? (s.part * 100).toFixed(1) + '%' : ''].map(csvCell).join(','))]);

  const headerRight = (
    <>
      {X && (
        <FilterMenu isDark={isDark} count={nF + (estado !== 'nulo' ? 1 : 0)} width={640}>
          <FilterSection label="Estado" isDark={isDark}>
            <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
              {[['nulo', 'Nulo movimiento'], ['mov', 'Con movimiento'], ['all', 'Todo el inventario']].map(([k, l]) => (
                <button key={k} onClick={() => setEstado(k)} className={`px-3 py-1 text-xs rounded-md ${estado === k ? t.toggleActive : t.textMuted}`}>{l}</button>
              ))}
            </div>
          </FilterSection>
          <FilterSection label="Filtros (cascada, $ del estado elegido)" isDark={isDark}>
            {FILTERS.map(([k, l]) => (
              <MultiSelect key={k} label={l} t={t} isDark={isDark} inCls={inCls} sel={F[k] || new Set()} onChange={(s) => setDim(k, s)}
                options={optLabels(k).map((lb, v) => ({ v, label: lb, m: R.opt[k][v] })).sort((a, b) => (k === 'bucket' ? a.v - b.v : b.m - a.m))} />
            ))}
            {nF > 0 && <button onClick={() => setF({})} className={`px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>✕ Limpiar</button>}
          </FilterSection>
        </FilterMenu>
      )}
      <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-bold ${t.btn} disabled:opacity-50`}><Upload size={14} />Cargar CSV / Excel</button>
      <button onClick={() => setShowCfg((v) => !v)} className={`p-2 rounded-lg border ${t.btnEdit}`} title="Umbral por sección y mes de corte"><Settings size={14} /></button>
      <button onClick={clearAll} className={`p-2 rounded-lg border ${t.btnDanger}`} title="Borrar base"><Trash2 size={14} /></button>
      <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={onFile} />
    </>
  );

  const chips = X ? FKEYS.filter((k) => F[k]?.size).map((k) => { const lb = optLabels(k); return { k, txt: `${FILTERS.find((f) => f[0] === k)[1]}: ${[...F[k]].slice(0, 3).map((v) => lb[v]).join(', ')}${F[k].size > 3 ? ` +${F[k].size - 3}` : ''}` }; }) : [];

  const Donut = ({ title, data, legend }) => (
    <div className={`${card} flex flex-col`}>
      <p className={`text-xs font-bold text-center ${t.text}`}>{title}</p>
      <div className="flex-1 flex items-center gap-2 min-h-[170px]">
        <div className="w-1/2 h-[170px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={legend === 'pie' ? 0 : 38} outerRadius={70} paddingAngle={legend === 'pie' ? 0 : 2} stroke="none"
                label={({ percent, cx, cy, midAngle, innerRadius, outerRadius }) => { if (percent < 0.08) return null; const r = (innerRadius + outerRadius) / 2, a = (-midAngle * Math.PI) / 180; return <text x={cx + r * Math.cos(a)} y={cy + r * Math.sin(a)} fill="#fff" fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="central">{(percent * 100).toFixed(1)}%</text>; }} labelLine={false}>
                {data.map((d, i) => <Cell key={i} fill={d.name === 'Otras' ? (isDark ? '#4b4458' : '#d1d5db') : PAL[i % PAL.length]} />)}
              </Pie>
              <Tooltip {...ttStyle} formatter={(v) => fmt$(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 space-y-1 overflow-hidden">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]" title={d.name}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.name === 'Otras' ? (isDark ? '#4b4458' : '#d1d5db') : PAL[i % PAL.length] }} />
              <span className={`truncate ${t.textMuted}`}>{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  const ShareBars = ({ title, data, onPick }) => (
    <div className={card}>
      <p className={`text-xs font-bold text-center ${t.text}`}>{title}</p>
      <div className="flex justify-center gap-3 text-[10px] my-1">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ background: NULO_C }} /><span className={t.textMuted}>Nulo</span></span>
        <span className="flex items-center gap-1"><span className={`w-3 h-2 rounded-sm ${isDark ? 'bg-white/15' : 'bg-gray-200'}`} /><span className={t.textMuted}>Con movimiento</span></span>
      </div>
      <div style={{ height: Math.max(160, data.length * 26 + 30) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }} barCategoryGap="18%">
            <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={118} tick={axisTick} axisLine={false} tickLine={false} interval={0} />
            <Tooltip {...ttStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }} formatter={(v, k, p) => (k === 'nulo' ? [`${pct(v)} · ${fmt$(p.payload.nu)}`, 'Nulo'] : [`${pct(v)} · ${fmt$(p.payload.t - p.payload.nu)}`, 'Con movimiento'])} />
            <Bar isAnimationActive={false} dataKey="nulo" stackId="a" fill={NULO_C} onClick={onPick} cursor={onPick ? 'pointer' : undefined} />
            <Bar isAnimationActive={false} dataKey="mov" stackId="a" fill={isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb'} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {busy && <div className={`px-3 py-2 rounded-lg border text-xs ${t.warningBg}`}>{busy}</div>}
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {showCfg && X && (
        <div className={card}>
          <div className="flex flex-wrap items-end gap-4 mb-3">
            <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Umbral general (meses)
              <input type="number" min="0" value={cfg.umbral} onChange={(e) => setCfg((s) => ({ ...s, umbral: Math.max(0, +e.target.value || 0) }))} className={`mt-1 block w-24 ${inCls}`} />
            </label>
            <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Mes de corte (auto: {miTxt(X.corte)})
              <input type="month" value={cfg.corte} onChange={(e) => setCfg((s) => ({ ...s, corte: e.target.value }))} className={`mt-1 block ${inCls}`} style={isDark ? { colorScheme: 'dark' } : undefined} />
            </label>
            <button onClick={() => setCfg(DEF_CFG)} className={`px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>Restablecer</button>
            <p className={`text-[10px] ${t.textMuted} max-w-md`}>Nulo = más de N meses desde la última venta en la combinación SKU × centro. Si no vendió en la ventana del extracto, cuenta la antigüedad desde la 1a recepción. Vacío = umbral general.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {X.D.sec.map((s) => (
              <label key={s} className={`text-[10px] font-bold ${t.textMuted}`}>{X.info.secNum[s] ? `${X.info.secNum[s]} · ` : ''}{s}
                <input type="number" min="0" placeholder={String(cfg.umbral)} value={cfg.porSeccion[s] ?? ''} onChange={(e) => setCfg((c) => ({ ...c, porSeccion: { ...c.porSeccion, [s]: e.target.value } }))} className={`mt-1 block w-full ${inCls}`} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={`flex gap-4 border-b ${t.border}`}>
        {[['resumen', 'Resumen'], ['detalle', 'Detalle']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`pb-2 text-sm font-bold border-b-2 ${tab === id ? t.tabActive : t.tabInactive}`}>{l}</button>
        ))}
        {X && <span className={`ml-auto self-center text-[10px] ${t.textMuted}`}>Corte {miTxt(E.corte)} · {X.name}</span>}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => <button key={c.k} onClick={() => setDim(c.k, new Set())} className={`px-2 py-1 text-[10px] rounded-full border ${t.cardInner} ${t.text}`}>{c.txt} ✕</button>)}
        </div>
      )}

      {!X ? (
        <div className={`${card} text-center py-16`}>
          <Upload size={28} className={`mx-auto mb-3 ${t.textMuted}`} />
          <p className={`font-bold ${t.text}`}>Carga el CSV de BigQuery (o el Excel con la hoja BASE)</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Una fila por SKU × centro, tiendas y bodegas. Columnas: Sección, Zona de ventas, Centro, Tienda, Proveedor, Grupo artículos, Marca, Estatus del Artículo, Norma de Aprovisionamiento, SKU, Artículo, Pzs, Monto, #Meses desde Ult Vta (o Mes Ultima Vta), Mes 1a Recepción + Año Recepción.</p>
          <p className={`text-[10px] mt-1 ${t.textMuted}`}>Se guarda en IndexedDB. Para bases de 1M+ filas usa CSV: se lee por streaming.</p>
        </div>
      ) : tab === 'resumen' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-6 grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ['Monto selección', fmt(R.m$), 'text-3xl'],
                ['#Meses prom. desde últ. vta', R.mesesProm == null ? '—' : R.mesesProm.toFixed(1), 'text-3xl'],
                ['Proveedor con mayor monto', R.prov, 'text-sm'],
                ['Piezas', fmt(R.mP), 'text-xl'],
                ['% del inventario', pct(R.all$ ? R.m$ / R.all$ : null), 'text-xl'],
                ['Combinaciones SKU × centro', fmt(R.combos), 'text-xl'],
              ].map(([l, v, sz]) => (
                <div key={l} className={`${card} text-center flex flex-col justify-center`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${t.textMuted}`}>{l}</p>
                  <p className={`${sz} font-black mt-1 tabular-nums ${t.text} leading-tight`}>{v}</p>
                </div>
              ))}
            </div>
            <div className="lg:col-span-3"><Donut title="% Estatus (pesos)" data={R.est} legend="pie" /></div>
            <div className="lg:col-span-3"><Donut title="% Marca (pesos)" data={R.marca} legend="pie" /></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            <ShareBars title="Monto por zona de ventas" data={R.zona} onPick={(d) => { const v = X.D.zona.indexOf(d.name); if (v >= 0) setDim('zona', new Set([v])); }} />
            <div className="space-y-3">
              <Donut title="Modelos con mayor monto" data={R.sku} />
              <Donut title="% por grupo de artículos" data={R.goa} />
            </div>
            <ShareBars title="Monto por tienda / bodega (top 12)" data={R.tienda} />
          </div>

          {R.letra.length > 0 && (
            <div className={card}>
              <p className={`text-xs font-bold text-center ${t.text}`}>Inventario por letra de rebaja · ¿regular o liquidado?</p>
              <p className={`text-[10px] text-center mb-2 ${t.textMuted}`}>Monto y piezas por letra actual · click en una barra para filtrar</p>
              {(() => { const g = { RG: { l: 'Regular (RG)', c: '#22C55E', m: 0, p: 0 }, RB: { l: 'Rebaja', c: '#F59E0B', m: 0, p: 0 }, LQ: { l: 'Liquidación (PR/SR/TR)', c: NULO_C, m: 0, p: 0 } };
                R.letra.forEach((d) => { const o = g[grpLetra(d.name)]; o.m += d.value; o.p += d.pzs; });
                return <div className="grid grid-cols-3 gap-2 mb-3">{Object.values(g).map((o) => (
                  <div key={o.l} className={`rounded-xl border p-3 text-center ${t.cardInner}`}>
                    <div className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>{o.l}</div>
                    <div className="text-xl font-black" style={{ color: o.c }}>{R.m$ ? pct(o.m / R.m$) : '—'}</div>
                    <div className={`text-[10px] ${t.textMuted}`}>{fmt$(o.m)} · {Math.round(o.p).toLocaleString('es-MX')} pzs</div>
                  </div>))}</div>; })()}
              <div style={{ height: Math.max(160, R.letra.length * 30 + 30) }}>
                <ResponsiveContainer>
                  <BarChart data={R.letra.map((d) => ({ ...d, pct: R.m$ ? d.value / R.m$ : 0 }))} layout="vertical" margin={{ left: 0, right: 90 }} barCategoryGap="20%">
                    <XAxis type="number" tickFormatter={(v) => fmt$(v)} tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                    <Tooltip {...ttStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }} formatter={(v, k, p) => [`${fmt$(v)} · ${pct(p.payload.pct)} · ${Math.round(p.payload.pzs).toLocaleString('es-MX')} pzs`, 'Letra']} />
                    <Bar isAnimationActive={false} dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => setDim('letra', new Set([d.idx]))}
                      label={{ position: 'right', fontSize: 10, fill: isDark ? '#cbd5e1' : '#475569', formatter: (v) => (R.m$ ? pct(v / R.m$) : '') }}>
                      {R.letra.map((d, i) => <Cell key={i} fill={{ RG: '#22C55E', RB: '#F59E0B', LQ: NULO_C }[grpLetra(d.name)]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className={card}>
            <div className="flex items-center mb-2">
              <span className={`text-xs ${t.textMuted}`}>Por sección · clic filtra</span>
              <button onClick={exportSecs} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}><Download size={12} />CSV</button>
            </div>
            <div className="overflow-auto max-h-[50vh]">
              <table className="w-full">
                <thead className="sticky top-0"><tr>{['# Sección', 'Sección', 'No de tiendas con NM', 'No de GOAs con NM', 'SKU', 'Monto', 'Pzs', '% inv. sección'].map((h, i) => <th key={h} className={`${th} ${i > 1 ? '!text-right' : ''}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {R.secs.map((s) => (
                    <tr key={s.si} onClick={() => setDim('sec', new Set([s.si]))} className={`border-t cursor-pointer ${t.border} ${t.tableRow}`}>
                      <td className={`${td} ${t.textMuted}`}>{s.num}</td>
                      <td className={`${td} font-bold ${t.text}`}>{s.name}</td>
                      {[fmt(s.c), fmt(s.g), fmt(s.k), fmt$(s.m), fmt(s.p), pct(s.part)].map((v, i) => <td key={i} className={`${td} text-right tabular-nums ${i === 3 ? `font-bold ${t.accent2}` : t.text}`}>{v}</td>)}
                    </tr>
                  ))}
                  {R.secs.length > 1 && (
                    <tr className={`border-t font-bold ${t.border}`}>
                      <td className={td} /><td className={`${td} ${t.text}`}>Total</td>
                      {['', '', '', fmt$(R.m$), fmt(R.mP), ''].map((v, i) => <td key={i} className={`${td} text-right tabular-nums ${t.text}`}>{v}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className={card}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative">
              <Search size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, artículo, centro, tienda, marca…" className={`w-72 ${inCls} !pl-6`} />
            </div>
            <span className={`text-xs ${t.textMuted}`}>{fmt(detail.length)} combinaciones · {fmt$(detail.reduce((s, i) => s + X.C.monto[i], 0))}</span>
            <button onClick={exportDetail} disabled={!detail.length} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnSec} disabled:opacity-40`}><Download size={12} />CSV detalle</button>
          </div>
          <div className="overflow-auto max-h-[68vh]">
            <table className="w-full">
              <thead className="sticky top-0 z-10"><tr>
                {DET_COLS.map(([k, l]) => (
                  <th key={l} onClick={() => k && setSort((s) => ({ k, d: s.k === k ? -s.d : -1 }))} className={`${th} ${['meses', 'rec', 'pzs', 'monto'].includes(k) ? '!text-right' : ''}`}>{l}{sort.k === k ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}</th>
                ))}
              </tr></thead>
              <tbody>
                {detail.slice(0, 500).map((i) => {
                  const r = detRow(i);
                  return (
                    <tr key={i} className={`border-t ${t.border} ${t.tableRow}`}>
                      {r.map((v, j) => <td key={j} className={`${td} ${j >= 14 && j <= 17 ? 'text-right tabular-nums' : ''} ${j === 17 ? `font-bold ${t.accent2}` : j === 18 ? (v === 'Nulo' ? 'font-bold text-pink-500' : t.success) : j === 8 ? t.accent1 : t.text} ${j === 9 ? 'max-w-[220px] truncate' : ''}`} title={j === 9 ? v : undefined}>{j === 17 ? fmt$(v) : j === 16 ? fmt(v) : v}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {detail.length > 500 && <p className={`mt-2 text-[10px] ${t.textMuted}`}>Mostrando 500 de {fmt(detail.length)} — usa filtros/búsqueda o baja el CSV para verlas todas.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

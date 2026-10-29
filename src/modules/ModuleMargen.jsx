// src/modules/ModuleMargen.jsx
// Margen (Financial): dónde se mueve el margen TY vs LY. División → sección → marca → origen.
// Entrada: CSV de BigQuery (VEIL_TAB_UTILIDAD_COMPARATIVO_S, ver api/_queries.js › margen). Una fila por año × jerarquía.
// Puente exacto por segmento, en pts de venta neta: Descuento + Costo de compra + Bonificación + Merma + Financiamiento + Otros = Δ margen.
//   margen = 1 − costo/vn − bonif/vn − merma/vn − financ/vn + otros/vn ; costo/vn = (costo/precio lleno) / (vn/precio lleno)
// Contribución al total = tasa (cambio de margen del segmento) + mix (cambio de peso); suma exacta al Δ del total.
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import { Upload, Trash2, Database } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import MS from '../components/MultiSelect';
import FilterMenu, { FilterSection } from '../components/FilterMenu';

const LS_FILES = 'gop_margen_files', DB_NAME = 'gop_margen_db';
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const fmtM = (v) => { const a = Math.abs(v), g = v < 0 ? '-' : ''; return a >= 1e6 ? `${g}$${(a / 1e6).toFixed(1)} M` : `${g}$${Math.round(a / 1e3).toLocaleString('es-MX')} K`; };
const pts = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}`);
const pc = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const POS = '#A78BFA', NEG = '#D63F8C', LYC = '#6B5B8E'; // violeta GO / magenta GO / violeta apagado (LY)

const ALIAS = {
  anio: ['ANIO', 'AÑO', 'ANO', 'YEAR'], mes: ['MES', 'MES PERIODO'],
  div: ['DIVISION'], sec: ['SECCION'], marca: ['MARCA'], orig: ['TIPO IMPORTACION', 'ORIGEN'], tm: ['TIPO MARCA'],
  pl: ['PRECIO LLENO', 'VENTAS A PRECIO LLENO'], mkd: ['MKD', 'TOTAL MARKDOWNS'],
  vn: ['VENTA NETA', 'VENTAS NETAS'], costo: ['COSTO', 'COSTO DE LO VENDIDO'],
  bonif: ['BONIF', 'BONIFICACIONES PROVEEDOR'], merma: ['MERMA', 'PROVISION DE MERMA'],
  financ: ['FINANC', 'COSTO FINANCIAMIENTO INVENTARIOS'], ub: ['UB MERC', 'UTILIDAD BRUTA DE MERCANCIAS'],
};
const REQ = ['anio', 'vn', 'costo', 'pl', 'ub'];

function parse(text, src) {
  const wb = XLSX.read(text, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!rows.length) throw new Error('Archivo vacío');
  const col = {}; const heads = Object.keys(rows[0]);
  for (const k in ALIAS) col[k] = heads.find((h) => ALIAS[k].includes(norm(h)));
  const miss = REQ.filter((k) => !col[k]);
  if (miss.length) throw new Error(`Faltan columnas: ${miss.join(', ')}`);
  const g = (r, k) => (col[k] ? String(r[col[k]] ?? '').trim() || '(sin dato)' : '(sin dato)');
  const data = rows.map((r) => ({
    a: Math.round(num(r[col.anio])), mes: col.mes ? g(r, 'mes') : null, div: g(r, 'div'), sec: g(r, 'sec'), marca: g(r, 'marca'), orig: ((o) => (norm(o) === 'DIRECTO' ? 'Importación' : o))(g(r, 'orig')), tm: g(r, 'tm'),
    pl: num(r[col.pl]), vn: num(r[col.vn]), c: num(r[col.costo]), b: num(r[col.bonif]), me: num(r[col.merma]), f: num(r[col.financ]), ub: num(r[col.ub]),
  })).filter((r) => r.a > 2000);
  return { rows: data, src, hasMes: !!col.mes };
}

const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('data'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async (k) => { const db = await idb(); return new Promise((res) => { const q = db.transaction('data').objectStore('data').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const idbSet = async (k, v) => { const db = await idb(); return new Promise((res) => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put(v, k); tx.oncomplete = res; tx.onerror = res; }); };

// Por GOA: utilidad (VEIL_TAB_UTILIDAD_COMPARATIVO_S por GOA) + compras del BI (PV/PC). MG inicial = 1 − compras PC ÷ compras PV; Degradación = MG vendido − MG inicial.
const readTxt = async (f) => { const b = await f.arrayBuffer(); try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); } };
const sh1 = (txt) => { const wb = XLSX.read(txt, { type: 'string' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); };
const parseGoaU = (txt) => sh1(txt).map((r) => ({ a: +r.ANIO, mes: +r.MES, goa: String(r.GOA).trim(), vn: +r.VENTA_NETA || 0, uvv: +r.UTILIDAD_DE_LO_VENDIDO || 0, ubm: +r.UB_MERCANCIAS || 0, ubs: +r.UB_SIN_CFI || 0, bp: +r.BONIF_PROVEEDOR || 0, bm: +r.BONIF_MSI || 0, rg: +r.REGALIAS || 0, mr: +r.MERMA || 0, cf: +r.CFI || 0, ot: +r.OTROS_CAMBIOS || 0 })).filter((r) => r.a && r.mes);
const parseGoaC = (txt) => txt.split(/\r?\n/).slice(3).map((l) => l.split(',')).filter((f) => f.length >= 13 && f[6] && !isNaN(+f[6]) && f[8]).map((f) => ({ a: +f[6], mes: +f[8], goa: f[5].trim(), sec: f[3].trim(), D: f[7].trim() === 'D', pv: (+f[11] || 0) * 1000, pc: (+f[12] || 0) * 1000 }));
const GM = [['deg', 'Degradación'], ['mv', 'MG vendido'], ['mi', 'MG compra'], ['vn', 'Venta']];
const gmet = (o) => { const mi = o.pv > 0 ? 1 - o.pc / o.pv : null, mv = o.vn > 0 ? o.uvv / o.vn : null; return { vn: o.vn, mi, mv, deg: mi != null && mv != null ? mv - mi : null }; };
const FL = ['vn', 'uvv', 'ubm', 'ubs', 'bp', 'bm', 'rg', 'mr', 'cf', 'ot', 'pv', 'pc', 'pvD', 'pcD'];
const gz = () => Object.fromEntries(FL.map((k) => [k, 0]));
const gsum = (list, y, ms) => { const o = gz(); for (const g of list) for (const m of ms) { const c = g.m[y]?.[m]; if (c) for (const k of FL) o[k] += c[k]; } return o; };
const gfull = (o) => { const vn = o.vn, r = (x) => (vn > 0 ? x / vn : null), pvN = o.pv - o.pvD, pcN = o.pc - o.pcD, mi = o.pv > 0 ? 1 - o.pc / o.pv : null, mv = r(o.uvv); return { vn, mi, miD: o.pvD > 0 ? 1 - o.pcD / o.pvD : null, miN: pvN > 0 ? 1 - pcN / pvN : null, partD: o.pv > 0 ? o.pvD / o.pv : null, mv, deg: mi != null && mv != null ? mv - mi : null, bp: r(o.bp), bm: r(o.bm), ro: r(o.rg + o.ot), mr: r(o.mr), mgs: r(o.ubs), cf: r(o.cf), mgc: r(o.ubm) }; };
const cP = (v) => (v == null ? ['–'] : [pc(v)]), cG = (v) => (v == null ? ['–'] : [pts(v)]);
const cD = (k) => (a, b) => { const d = a[k] != null && b[k] != null ? a[k] - b[k] : null; return [d == null ? '–' : pts(d), d == null || Math.abs(d) < 0.0005 ? undefined : d > 0 ? POS : NEG]; };
const CT = [
  ['VENTA', [['TY', (a) => [fmtM(a.vn)]], ['Var %', (a, b) => { const d = b.vn > 0 ? a.vn / b.vn - 1 : null; return [d == null ? '–' : pc(d), d == null ? undefined : d >= 0 ? POS : NEG]; }]]],
  ['MI IMPORTACIÓN', [['TY', (a) => cP(a.miD)], ['Δ', cD('miD')]]],
  ['% PART. IMPO', [['TY', (a) => cP(a.partD)], ['Δ', cD('partD')]]],
  ['MI NACIONAL', [['TY', (a) => cP(a.miN)], ['Δ', cD('miN')]]],
  ['MI PONDERADO', [['TY', (a) => cP(a.mi)], ['Δ', cD('mi')]]],
  ['DEGRADACIÓN MG', [['TY', (a) => cG(a.deg)], ['LY', (a, b) => cG(b.deg)]]],
  ['MG DE LO VENDIDO', [['TY', (a) => cP(a.mv)], ['Δ', cD('mv')]]],
  ['BONIF. PROVEEDOR', [['LY', (a, b) => cP(b.bp)], ['TY', (a) => cP(a.bp)]]],
  ['BONIF. MSI', [['LY', (a, b) => cP(b.bm)], ['TY', (a) => cP(a.bm)]]],
  ['MERMA', [['LY', (a, b) => cP(b.mr)], ['TY', (a) => cP(a.mr)]]],
  ['REGALÍAS Y OTROS', [['LY', (a, b) => cP(b.ro)], ['TY', (a) => cP(a.ro)]]],
  ['MG ANTES DE CFI', [['TY', (a) => cP(a.mgs)], ['Δ', cD('mgs')]]],
  ['CFI', [['LY', (a, b) => cP(b.cf)], ['TY', (a) => cP(a.cf)]]],
  ['MG DESPUÉS DE CFI', [['TY', (a) => cP(a.mgc)], ['Δ', cD('mgc')]]],
];
const goaMonthly = (U, C, ty) => {
  const ly = ty - 1, corte = Math.max(...U.filter((r) => r.a === ty).map((r) => r.mes), 0), by = {};
  const g = (k) => (by[k] ||= { goa: k, sec: 'Sin sección', m: { [ly]: Array.from({ length: 13 }, gz), [ty]: Array.from({ length: 13 }, gz) } });
  for (const r of U) if ((r.a === ty || r.a === ly) && r.mes <= corte) { const o = g(r.goa).m[r.a][r.mes]; for (const k of ['vn', 'uvv', 'ubm', 'ubs', 'bp', 'bm', 'rg', 'mr', 'cf', 'ot']) o[k] += r[k]; }
  for (const r of C) if ((r.a === ty || r.a === ly) && r.mes <= corte) { const x = g(r.goa); if (r.sec) x.sec = r.sec; const o = x.m[r.a][r.mes]; o.pv += r.pv; o.pc += r.pc; if (r.D) { o.pvD += r.pv; o.pcD += r.pc; } }
  const goas = Object.values(by), months = Array.from({ length: corte }, (_, i) => i + 1);
  const secs = {}; for (const x of goas) (secs[x.sec] ||= []).push(x);
  const sections = Object.entries(secs).map(([name, list]) => ({ name, list, vn: gsum(list, ty, months).vn })).sort((a, b) => b.vn - a.vn);
  return { ty, ly, corte, months, goas, sections };
};
const zero = () => ({ pl: 0, vn: 0, c: 0, b: 0, me: 0, f: 0, ub: 0 });
const add = (s, r) => { for (const k in s) s[k] += r[k]; };

// Ratios de un acumulado (null si no hay venta)
function ratios(s) {
  if (!s || s.vn <= 0 || s.pl <= 0) return null;
  const v = s.vn, m = s.ub / v, c = s.c / v, b = s.b / v, me = s.me / v, f = s.f / v;
  return { m, k: s.c / s.pl, d: 1 - v / s.pl, b, me, f, r: m - (1 - c - b - me - f) };
}
// Puente L → T en pts (cada término positivo suma margen)
function bridge(L, T) {
  const l = ratios(L), t = ratios(T);
  if (!l || !t) return null;
  const x = {
    desc: -l.k * (1 / (1 - t.d) - 1 / (1 - l.d)), compra: -(t.k - l.k) / (1 - t.d),
    bonif: -(t.b - l.b), merma: -(t.me - l.me), financ: -(t.f - l.f), otros: t.r - l.r,
  };
  return { ...x, total: t.m - l.m, mL: l.m, mT: t.m };
}
// Degradación sobre precio lleno: MG inicial → tras descuento → tras merma → tras financiamiento → con bonificación (sube) → MG final (incluye ajustes)
function stages(s) {
  if (!s || s.pl <= 0) return null;
  const p = s.pl, s0 = 1 - s.c / p, s1 = (s.vn - s.c) / p, s2 = s1 - s.me / p, s3 = s2 - s.f / p, s4 = s3 - s.b / p, s5 = s.ub / p;
  return { ini: s0, desc: s1 - s0, merma: s2 - s1, financ: s3 - s2, bonif: s4 - s3, otros: s5 - s4, fin: s5, vn: s.vn > 0 ? s.ub / s.vn : null, cum: [s0, s1, s2, s3, s4, s5] };
}
const CAUSA = {
  desc: ['Descuento', 'Frenar rebajas / cupones; revisar eventos y letras'],
  compra: ['Costo de compra', 'Revisar IMU de OC vs PVP; reprecio o renegociar costo'],
  bonif: ['Bonificación', 'Confirmar bonificación del proveedor (cae si baja el descuento o la compra)'],
  merma: ['Merma', 'Revisar provisión y mermas por tienda'],
  financ: ['Financiamiento', 'Inventario inflado: bajar cobertura / mover nulo'],
  otros: ['Ajustes / saldos', 'Revisar ajustes de costo e inventario con Finanzas'],
};
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIMS = [['div', 'División'], ['sec', 'Sección'], ['marca', 'Marca'], ['orig', 'Origen'], ['tm', 'Tipo de marca']];
const DEG = ['MG inicial', 'Tras descto', 'Tras merma', 'Tras financ.', 'Con bonif.', 'MG final'];
const NEXT = { div: 'sec', sec: 'marca', marca: 'orig' };

// ─── Supuesto: "si arreglamos esto, pasa esto" ────────────────────────────────
const SIM_DEF = 50; // % de recuperación por defecto de cada causa a la baja
function simulate(R, sim) {
  if (!R?.br) return null;
  const rows = Object.keys(CAUSA).filter((k) => R.br[k] < -0.0005).sort((a, b) => R.br[a] - R.br[b])
    .map((k) => { const p = sim[k] ?? SIM_DEF, x = -R.br[k] * p / 100; return { k, p, eff: R.br[k], pts: x, usd: x * R.VT }; });
  const x = rows.reduce((a, r) => a + r.pts, 0);
  return { rows, pts: x, usd: x * R.VT, mNew: R.MT + x };
}
const usd = (v) => `${v >= 0 ? '+' : '-'}${fmtM(Math.abs(v))}`;

// ─── Resumen para dirección: dónde está, qué pasó, qué afecta, cómo lo solucionamos ───
function summary(R, F, SM) {
  if (!R || R.err || !R.br) return null;
  const scope = DIMS.filter(([k]) => F[k]?.length).map(([k]) => F[k].join(', ')).join(' › ') || 'Total';
  const d = R.MT - R.ML, rL = ratios(R.TL), rT = ratios(R.TT);
  const head = `${scope}: margen ${pc(R.ML)} → ${pc(R.MT)} (${pts(d)} pts, ${usd(d * R.VT)} de UB) · venta ${pc(R.VT / R.VL - 1)}`;
  const real = (a) => a.filter((x) => Math.abs(x.contrib) >= 0.0005 || x.T.vn >= 1e6);
  const sec = real(R.by.sec), mar = real(R.by.marca).filter((x) => x.name !== '(sin dato)');
  const up = sec.filter((x) => x.contrib >= 0.001).sort((a, b) => b.contrib - a.contrib), dn = sec.filter((x) => x.contrib <= -0.001).sort((a, b) => a.contrib - b.contrib);
  const down = (a) => a.filter((x) => x.br && x.br.total < 0 && x.imp$ != null).sort((a, b) => a.imp$ - b.imp$).slice(0, 3);
  const line = (x) => `${x.name}: ${pts(x.br.total)} pts de margen (${usd(x.imp$)} de UB)${x.causa ? ` · causa: ${CAUSA[x.causa][0].toLowerCase()}` : ''}`;
  const lst = (a) => a.slice(0, 3).map((x) => `${x.name} (${pts(x.contrib)} pts)`).join(', ');

  const donde = [];
  if (up.length) donde.push(`Suben: ${lst(up)}.`);
  if (up.length > 1 && d > 0) donde.push(`Las 2 principales explican ${pc((up[0].contrib + up[1].contrib) / d, 0)} del avance.`);
  donde.push(dn.length ? `Restan: ${lst(dn)}.` : 'Ninguna sección resta margen.');
  const mdn = mar.filter((x) => x.contrib <= -0.001).sort((a, b) => a.contrib - b.contrib);
  if (mdn.length) donde.push(`Marcas que más restan: ${lst(mdn)}.`);

  const pasoFn = {
    desc: (e) => `Descuento ${pts(e)} pts: descuento promedio ${pc(rL.d)} → ${pc(rT.d)} del precio lleno.`,
    compra: (e) => `Costo de compra ${pts(e)} pts: costo ÷ precio lleno ${pc(rL.k)} → ${pc(rT.k)}.`,
    bonif: (e) => `Bonificación ${pts(e)} pts: ${pc(Math.abs(rL.b))} → ${pc(Math.abs(rT.b))} de la venta.`,
    merma: (e) => `Merma ${pts(e)} pts: ${pc(rL.me)} → ${pc(rT.me)} de la venta.`,
    financ: (e) => `Financiamiento ${pts(e)} pts: ${pc(rL.f)} → ${pc(rT.f)} de la venta.`,
    otros: (e) => `Ajustes y saldos de costo ${pts(e)} pts.`,
  };
  const pasó = Object.keys(pasoFn).sort((a, b) => Math.abs(R.br[b]) - Math.abs(R.br[a])).filter((k) => Math.abs(R.br[k]) >= 0.0005).slice(0, 5).map((k) => pasoFn[k](R.br[k]));
  if (R.sL && R.sT) pasó.unshift(`MG inicial ${pc(R.sL.ini)} → ${pc(R.sT.ini)}; la degradación hasta UB final (% de precio lleno) pasa de ${pts(R.sL.fin - R.sL.ini)} a ${pts(R.sT.fin - R.sT.ini)} pts.`);

  const afecta = [];
  const ds = down(sec); if (ds.length) afecta.push('Secciones con margen a la baja:', ...ds.map((x) => '  · ' + line(x)));
  const dm = down(mar); if (dm.length) afecta.push('Marcas con margen a la baja:', ...dm.map((x) => '  · ' + line(x)));
  const big = [...sec].sort((a, b) => b.T.vn - a.T.vn)[0], bd = big && ratios(big.T)?.d;
  if (big && big.mT != null && big.mT < R.MT && big.T.vn / R.VT >= 0.15) afecta.push(`${big.name} pesa ${pc(big.T.vn / R.VT, 0)} de la venta con margen ${pc(big.mT)} (bajo el ${pc(R.MT)} del total) y descuento de ${pc(bd)}.`);
  const imp = R.by.orig.find((x) => x.name === 'Importación'), nac = R.by.orig.find((x) => x.name === 'Nacional');
  if (imp && nac && imp.mT != null && nac.mT != null) {
    afecta.push(`Importación: venta ${pc(imp.varV)}, margen ${pc(imp.mL)} → ${pc(imp.mT)}. Nacional: venta ${pc(nac.varV)}, margen ${pc(nac.mL)} → ${pc(nac.mT)}.`);
    if (imp.sT && nac.sT) afecta.push(`MG inicial importación ${pc(imp.sT.ini)} vs ${pc(nac.sT.ini)} nacional; se degrada ${pts(imp.sT.fin - imp.sT.ini)} vs ${pts(nac.sT.fin - nac.sT.ini)} pts.`);
  }
  const mp = R.by.tm.find((x) => x.name === 'Marca Propia'), mv = R.by.tm.find((x) => x.name === 'Marca del Proveedor');
  if (mp && mv && mp.mT != null && mv.mT != null) afecta.push(`Marca propia: venta ${pc(mp.varV)}, margen ${pc(mp.mL)} → ${pc(mp.mT)}. Marca del proveedor: venta ${pc(mv.varV)}, margen ${pc(mv.mL)} → ${pc(mv.mT)}.`);

  const como = [];
  (SM?.rows || []).slice(0, 3).forEach((x) => como.push(`${CAUSA[x.k][0]} (${pts(x.eff)} pts): ${CAUSA[x.k][1]}.`));
  ds.forEach((x) => { if (x.causa) como.push(`${x.name}: ${CAUSA[x.causa][1]}.`); });
  if (big && big.mT != null && big.mT < R.MT && big.T.vn / R.VT >= 0.15 && bd < 0.08) como.push(`${big.name}: casi no usa descuento, la palanca es el costo de compra (IMU); negociar costo o mezclar hacia mayor margen.`);
  if (imp && nac && imp.mT != null && nac.mT != null && imp.mT < nac.mT) como.push('Importación: nace con más MG inicial pero termina por debajo de nacional; revisar liquidación y financiamiento antes de comprometer más compra.');
  if (SM?.rows.length) como.push(`Supuesto: recuperando ${SM.rows.map((x) => `${x.p}% de ${CAUSA[x.k][0].toLowerCase()}`).join(', ')} → ${pts(SM.pts)} pts: margen ${pc(R.MT)} → ${pc(SM.mNew)} (${usd(SM.usd)} de UB).`);
  else como.push('Sin causas a la baja en este alcance: mantener y proteger lo que funciona.');

  return { head, blocks: [['Dónde está el problema', donde], ['Qué pasó', pasó], ['Qué afecta', afecta], ['Cómo lo solucionaremos', como]] };
}

export default function ModuleMargen({ t, isDark, navIcon, navLabel, navDesc }) {
  const [X, setX] = useState(null);
  const [CAT, setCAT] = useState(null);
  const [GX, setGX] = useState(null);
  const goaRef = useRef(null);
  const [F, setF] = useState({});
  const [dim, setDim] = useState('sec');
  const [soloBaja, setSoloBaja] = useState(false);
  const [tab, setTab] = useState('detalle');
  const [sim, setSim] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { idbGet('data').then((d) => { if (d) { setX(d); setF(defFilter(d)); } }); idbGet('cat').then((c) => c && setCAT(c)); idbGet('goa').then((g) => { if (g?.v === 2) setGX(g); else if (g) { idbSet('goa', null); setMsg({ ok: false, text: 'Los archivos GOA guardados son de una versión anterior: vuelve a cargarlos con el botón GOA (utilidad por GOA + Compras del BI).' }); } }); }, []);
  const defFilter = () => ({});

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setMsg(null); setBusy('Leyendo archivo…');
    await new Promise((r) => setTimeout(r, 30));
    try { await load(parse(await f.text(), f.name)); } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
    setBusy(null);
  };
  const load = async (d) => {
    setX(d); setF(defFilter(d)); setDim('sec'); await idbSet('data', d);
    try { localStorage.setItem(LS_FILES, JSON.stringify([d.src])); } catch {}
    const ys = [...new Set(d.rows.map((r) => r.a))].sort();
    setMsg({ ok: true, text: `${d.rows.length.toLocaleString('es-MX')} filas · años ${ys.join(', ')} · ${d.src}` });
  };
  // BigQuery (/api/bq?source=margen): año en curso vs anterior, acumulado hasta el mes de corte
  const traerBQ = async () => {
    const now = new Date(); const last = now.getMonth() === 0 ? [now.getFullYear() - 1, 12] : [now.getFullYear(), now.getMonth()];
    const inp = window.prompt('Año y mes de corte (AAAA-M). Compara contra el año anterior, acumulado ene → mes:', localStorage.getItem('gop_margen_corte') || `${last[0]}-${last[1]}`);
    const m = inp && inp.match(/^(20\d{2})[-/ ](\d{1,2})$/); if (!m || +m[2] < 1 || +m[2] > 12) { if (inp) setMsg({ ok: false, text: 'Formato: AAAA-M (ej. 2026-9)' }); return; }
    let tok = localStorage.getItem('gop_api_token') || ''; if (!tok) { tok = window.prompt('Token de GO PLANNER (GOP_API_TOKEN):') || ''; if (!tok) return; localStorage.setItem('gop_api_token', tok); }
    localStorage.setItem('gop_margen_corte', `${m[1]}-${+m[2]}`);
    setMsg(null); setBusy('Consultando BigQuery…');
    try {
      const r = await fetch(`/api/bq?source=margen&anio=${m[1]}&mes=${+m[2]}`, { headers: { 'x-gop-token': tok } });
      const txt = await r.text(); if (r.status === 401) localStorage.removeItem('gop_api_token'); if (!r.ok) throw new Error(txt);
      await load(parse(txt, `BigQuery · ene-${MES[+m[2] - 1]} ${m[1]}`));
      try {
        const rc = await fetch(`/api/bq?source=margen_cat&anio=${m[1]}&mes=${+m[2]}`, { headers: { 'x-gop-token': tok } });
        const tc = await rc.text(); if (!rc.ok) throw new Error(tc);
        const wb = XLSX.read(tc, { type: 'string' });
        const cat = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).map((r) => ({ a: +r.anio, mes: String(r.mes), div: r.DIVISION, sec: r.SECCION, marca: r.MARCA, pi: +r.pl_ini || 0, pa: +r.pl_act || 0, c: +r.costo || 0 }));
        setCAT(cat); await idbSet('cat', cat);
      } catch (e2) { setMsg({ ok: false, text: `Margen cargado; catálogo no disponible: ${e2.message}` }); }
    } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
    setBusy(null);
  };
  const onGoa = async (e) => {
    const fs = [...(e.target.files || [])]; e.target.value = ''; if (!fs.length) return;
    try {
      const n = { ...(GX || {}), v: 2 };
      for (const f of fs) { const tx = await readTxt(f); if (tx.includes('UTILIDAD_DE_LO_VENDIDO')) n.u = parseGoaU(tx); else if (tx.includes('COMPRAS NETAS')) n.c = parseGoaC(tx); else throw new Error(`${f.name}: no reconozco el formato (utilidad por GOA o Compras del BI)`); }
      setGX(n); await idbSet('goa', n); setTab('goa');
      setMsg({ ok: true, text: `GOA: utilidad ${n.u?.length ?? 0} filas · compras ${n.c?.length ?? 0} filas` });
    } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
  };
  const G = useMemo(() => { if (!GX?.u?.length) return null; const ty = Math.max(...GX.u.map((r) => r.a)); return goaMonthly(GX.u, GX.c || [], ty); }, [GX]);
  const [gm, setGm] = useState('deg');
  const [ex, setEx] = useState({});
  const clearAll = async () => { if (!confirm('¿Borrar la base de Margen?')) return; setX(null); setCAT(null); setGX(null); setF({}); await idbSet('data', null); await idbSet('cat', null); await idbSet('goa', null); try { localStorage.removeItem(LS_FILES); } catch {} };

  const R = useMemo(() => {
    if (!X) return null;
    const years = [...new Set(X.rows.map((r) => r.a))].sort();
    const ty = years[years.length - 1], ly = ty - 1;
    if (!years.includes(ly)) return { err: `Falta el año ${ly} para comparar` };
    const pass = (r, skip) => Object.keys(F).every((k) => k === skip || !F[k]?.length || F[k].includes(r[k]));
    const rows = X.rows.filter((r) => (r.a === ty || r.a === ly) && pass(r));
    const opt = {}; // opciones en cascada: valores que existen con los demás filtros
    for (const [k] of [...DIMS, ['mes']]) { const m = {}; X.rows.filter((r) => (r.a === ty || r.a === ly) && pass(r, k)).forEach((r) => { if (r[k] != null) m[r[k]] = (m[r[k]] || 0) + Math.abs(r.vn); }); opt[k] = Object.entries(m).sort(k === 'mes' ? (a, b) => a[0] - b[0] : (a, b) => b[1] - a[1]).map(([v, x]) => ({ value: v, label: k === 'mes' ? (MES[+v - 1] || v) : v, hint: fmtM(x) })); }
    const TL = zero(), TT = zero();
    for (const r of rows) add(r.a === ty ? TT : TL, r);
    const VL = TL.vn, VT = TT.vn, ML = TL.ub / VL;
    const mk = (dm) => {
      const by = {};
      for (const r of rows) { const o = (by[r[dm]] ||= { L: zero(), T: zero() }); add(r.a === ty ? o.T : o.L, r); }
      return Object.entries(by).map(([name, { L, T }]) => {
        const wL = L.vn / VL, wT = T.vn / VT, rl = ratios(L), rt = ratios(T);
        const contrib = T.ub / VT - L.ub / VL;
        const mix = rl ? (wT - wL) * (rl.m - ML) : 0;
        const br = bridge(L, T);
        let causa = null;
        if (br) { const [k, v] = Object.entries(br).filter(([k]) => CAUSA[k]).sort((a, b) => a[1] - b[1])[0]; if (v < -0.002) causa = k; }
        return { name, L, T, contrib, mix, tasa: contrib - mix, br, mL: rl?.m, mT: rt?.m, varV: L.vn > 0 ? T.vn / L.vn - 1 : null, imp$: br ? T.vn * br.total : null, causa,
          sT: stages(T), tag: L.vn <= 0 && T.vn > 0 ? 'nuevo' : T.vn <= 0 && L.vn > 0 ? 'salida' : null };
      });
    };
    const list = mk(dim), by = { sec: mk('sec'), marca: mk('marca'), orig: mk('orig'), tm: mk('tm') };
    let cat = null;
    if (CAT?.length) {
      const z = () => ({ pi: 0, pa: 0, c: 0 }), cl = z(), ct = z();
      for (const r of CAT) if ((r.a === ty || r.a === ly) && ['div', 'sec', 'marca', 'mes'].every((k) => !F[k]?.length || F[k].includes(r[k]))) { const o = r.a === ty ? ct : cl; o.pi += r.pi; o.pa += r.pa; o.c += r.c; }
      const f = (o) => (o.pi > 0 ? { mg: 1 - o.c / o.pi, lista: 1 - o.pa / o.pi } : null);
      cat = { L: f(cl), T: f(ct) };
    }
    return { cat, ty, ly, TL, TT, VL, VT, ML, MT: TT.ub / VT, list, by, sL: stages(TL), sT: stages(TT), br: bridge(TL, TT), opt, n: rows.length };
  }, [X, CAT, F, dim]);

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center whitespace-nowrap select-none ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs whitespace-nowrap text-center tabular-nums';
  const col = (v) => (v == null || Math.abs(v) < 0.0005 ? undefined : v > 0 ? POS : NEG);
  const ttStyle = { contentStyle: { background: isDark ? '#1c1720' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`, borderRadius: 10, fontSize: 11 }, itemStyle: { color: isDark ? '#EDEBF2' : '#111' } };
  const stk = (top) => ({ position: 'sticky', top, zIndex: 2, background: isDark ? '#1d1830' : '#f4f0fc' });
  const axisTick = { fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' };

  const nF = Object.values(F).filter((v) => v?.length).length;
  const headerRight = (
    <>
      {R && !R.err && (
        <FilterMenu isDark={isDark} count={nF} width={640}>
          <FilterSection label="Filtros (cascada, venta neta)" isDark={isDark}>
            {DIMS.map(([k, l]) => <MS key={k} label={l} t={t} isDark={isDark} options={R.opt[k]} selected={F[k] || []} onChange={(a) => setF((s) => ({ ...s, [k]: a }))} />)}
            {X.hasMes && <MS label="Mes" t={t} isDark={isDark} options={R.opt.mes || []} selected={F.mes || []} onChange={(a) => setF((s) => ({ ...s, mes: a }))} />}
            {nF > 0 && <button onClick={() => setF({})} className={`px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>✕ Limpiar</button>}
          </FilterSection>
        </FilterMenu>
      )}
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
      <button onClick={traerBQ} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold ${t.btnGhost}`}><Database size={14} /> BigQuery</button>
      <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold ${t.btnGhost}`}><Upload size={14} /> CSV</button>
      <input ref={goaRef} type="file" accept=".csv,.txt" multiple className="hidden" onChange={onGoa} />
      <button onClick={() => goaRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold ${t.btnGhost}`}><Upload size={14} /> GOA</button>
      {X && <button onClick={clearAll} className={`p-1.5 rounded-lg ${t.btnGhost}`} title="Borrar base"><Trash2 size={14} /></button>}
    </>
  );

  const chart = R?.br ? [['Descuento', R.br.desc], ['Costo compra', R.br.compra], ['Bonificación', R.br.bonif], ['Merma', R.br.merma], ['Financ.', R.br.financ], ['Otros', R.br.otros]].map(([name, v]) => ({ name, v: +(v * 100).toFixed(2) })) : [];
  const SM = simulate(R, sim);
  const SUM = summary(R, F, SM);
  const copiar = () => { if (!SUM) return; const tx = [SUM.head, '', ...SUM.blocks.flatMap(([h, it]) => [h.toUpperCase(), ...it.map((i) => (i.startsWith('  ·') ? i : `- ${i}`)), ''])].join('\n'); navigator.clipboard?.writeText(tx); setMsg({ ok: true, text: 'Resumen copiado' }); };
  const rows = R?.list ? R.list.filter((x) => Math.abs(x.contrib) >= 0.0005 || x.L.vn >= 1e6 || x.T.vn >= 1e6).filter((x) => !soloBaja || x.contrib < 0).sort((a, b) => a.contrib - b.contrib) : [];

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {busy && <div className={`px-3 py-2 rounded-lg border text-xs ${t.warningBg}`}>{busy}</div>}
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {!X && (
        <div className={`${card} text-center py-16`}>
          <Upload className="mx-auto mb-3 opacity-60" size={28} />
          <p className={`font-bold ${t.text}`}>Carga el CSV de margen</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Se guarda localmente (IndexedDB) y sobrevive al refresh.</p>
        </div>
      )}
      {R?.err && <div className={`px-3 py-2 rounded-lg border text-xs ${t.dangerBg}`}>{R.err}</div>}
      {R && !R.err && (
        <>
          {nF > 0 && (
            <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${t.textMuted}`}>
              {DIMS.filter(([k]) => F[k]?.length).map(([k, l]) => <button key={k} onClick={() => setF((s) => ({ ...s, [k]: [] }))} className={`px-2 py-0.5 rounded-md border font-bold ${t.badge || ''}`} title="Quitar filtro">{F[k].length === 1 ? F[k][0] : `${l}: ${F[k].length}`} ✕</button>)}
              <span className="ml-auto">{R.ty} vs {R.ly} · {R.n.toLocaleString('es-MX')} filas</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[[`Margen ${R.ly}`, pc(R.ML), null], [`Margen ${R.ty}`, pc(R.MT), null], ['Δ pts', pts(R.MT - R.ML), col(R.MT - R.ML)], ['Impacto UB', `${R.MT - R.ML >= 0 ? '+' : '-'}${fmtM(Math.abs((R.MT - R.ML) * R.VT))}`, col(R.MT - R.ML)]].map(([l, v, c]) => (
              <div key={l} className={`${card} text-center`}>
                <div className={`text-[10px] font-bold uppercase ${t.textMuted}`}>{l}</div>
                <div className="text-2xl font-black tabular-nums" style={{ color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div className={`inline-flex rounded-lg border p-0.5 ${t.toggle}`}>
            {[['resumen', 'Resumen'], ['detalle', 'Detalle'], ['goa', 'Por GOA']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-1 text-xs rounded-md font-bold ${tab === k ? t.toggleActive : t.textMuted}`}>{l}</button>)}
          </div>
          {tab === 'goa' && (!G ? (
            <div className={card}><p className={`text-xs text-center py-8 ${t.textMuted}`}>Carga con el botón GOA los dos archivos: utilidad por GOA (CSV de BQ) y Compras del BI (PV y PC).</p></div>
          ) : (() => {
            const { ty, ly, months, goas, sections } = G, all = (y, ms = months) => gmet(gsum(goas, y, ms)), A = all(ty), B = all(ly);
            const fm = (k, v) => (k === 'vn' ? fmtM(v) : k === 'deg' ? pts(v) : pc(v));
            const tile = (l, k, sub) => { const d = A[k] != null && B[k] != null ? A[k] - B[k] : null; return (
              <div key={l} className={`${card} text-center`}>
                <div className={`text-[10px] font-bold uppercase ${t.textMuted}`}>{l}</div>
                <div className="text-2xl font-black tabular-nums" >{k === 'deg' ? `${(A[k] * 100).toFixed(1)} pts` : pc(A[k])}</div>
                <div className={`text-[10px] ${t.textMuted}`}>{sub}</div>
                <div className="text-xs font-bold tabular-nums" style={{ color: col(d) }}>{pts(d)} pts vs {ly} ({k === 'deg' ? `${(B[k] * 100).toFixed(1)} pts` : pc(B[k])})</div>
              </div>); };
            const lineData = months.map((m) => { const a = gmet(gsum(goas, ty, [m])), b = gmet(gsum(goas, ly, [m])); return { name: MES[m - 1], [`Compra ${ty}`]: a.mi != null ? +(a.mi * 100).toFixed(1) : null, [`Venta ${ty}`]: a.mv != null ? +(a.mv * 100).toFixed(1) : null, [`Compra ${ly}`]: b.mi != null ? +(b.mi * 100).toFixed(1) : null, [`Venta ${ly}`]: b.mv != null ? +(b.mv * 100).toFixed(1) : null }; });
            const dl = goas.map((g) => { const a = gmet(gsum([g], ty, months)), b = gmet(gsum([g], ly, months)); return { name: g.goa, vn: a.vn, d: a.deg != null && b.deg != null ? (a.deg - b.deg) * 100 : null }; }).filter((x) => x.d != null && x.vn >= 2e7).sort((a, b) => b.d - a.d);
            const bars = [...dl.filter((x) => x.d > 0).slice(0, 6), ...dl.filter((x) => x.d <= 0).slice(-6)].map((x) => ({ name: x.name, v: +x.d.toFixed(1) }));
            const heat = (v, ref) => { if (v == null || ref == null) return undefined; const d = v - ref, a = Math.min(Math.abs(d) / (gm === 'vn' ? Math.max(Math.abs(ref), 1) : 0.1), 1) * 0.35; return d === 0 ? undefined : `${d > 0 ? 'rgba(167,139,250,' : 'rgba(214,63,140,'}${a.toFixed(2)})`; };
            const cells = (list) => { const mv = (y, ms) => gmet(gsum(list, y, ms))[gm]; return [...months.map((m) => { const v = mv(ty, [m]), r = mv(ly, [m]); return { v, bg: gm === 'vn' ? heat(v, r) : heat(v, r) }; }), { v: mv(ly, months), muted: true }, { v: mv(ty, months), bold: true }, { d: (mv(ty, months) ?? 0) - (mv(ly, months) ?? 0), v2: mv(ty, months), v1: mv(ly, months) }]; };
            const renderRow = (label, list, kind) => { const cs = cells(list); const last = cs[cs.length - 1]; const dv = last.v1 != null && last.v2 != null ? (gm === 'vn' ? (last.v1 > 0 ? last.v2 / last.v1 - 1 : null) : last.v2 - last.v1) : null; return (
              <tr key={`${kind}-${label}`} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'} ${kind === 'tot' ? 'font-black' : kind === 'sec' ? 'font-bold cursor-pointer' : ''}`} onClick={kind === 'sec' ? () => setEx((e) => ({ ...e, [label]: !e[label] })) : undefined}>
                <td className={`${td} !text-left ${t.text}`} style={{ paddingLeft: kind === 'goa' ? 22 : undefined }}>{kind === 'sec' ? `${ex[label] ? '▾' : '▸'} ` : ''}{label}</td>
                {cs.slice(0, months.length).map((c, i) => <td key={i} className={`${td} ${t.text}`} style={{ background: c.bg }}>{c.v == null ? '–' : fm(gm, c.v)}</td>)}
                <td className={`${td} ${t.textMuted}`}>{cs[months.length].v == null ? '–' : fm(gm, cs[months.length].v)}</td>
                <td className={`${td} font-black ${t.text}`}>{cs[months.length + 1].v == null ? '–' : fm(gm, cs[months.length + 1].v)}</td>
                <td className={td} style={{ color: col(dv) }}>{dv == null ? '–' : gm === 'vn' ? pc(dv) : pts(dv)}</td>
              </tr>); };
            return (<>
              <div className={`${card} !py-3`}>
                <p className={`text-xs ${t.text}`}><b>Cómo leerlo:</b> compras con un margen (<b>MG compra</b>) → vendes con otro (<b>MG vendido</b>). Lo que se pierde en medio, por descuento, liquidación y mezcla, es la <b>degradación</b>. Ene-{MES[G.corte - 1]} {ty} vs {ly}, división 17.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tile('MG compra', 'mi', 'con qué margen compras')}{tile('MG vendido', 'mv', 'con qué margen vendes')}{tile('Degradación', 'deg', 'lo que se pierde entre compra y venta')}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={card}>
                  <h3 className={`text-sm font-black mb-2 ${t.text}`}>Compras vs ventas, mes a mes (MG %)</h3>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer>
                      <LineChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} unit="%" domain={['dataMin - 2', 'dataMax + 2']} />
                        <Tooltip {...ttStyle} formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line isAnimationActive={false} type="monotone" dataKey={`Compra ${ty}`} stroke={POS} strokeWidth={2.5} dot={{ r: 2 }} />
                        <Line isAnimationActive={false} type="monotone" dataKey={`Venta ${ty}`} stroke={NEG} strokeWidth={2.5} dot={{ r: 2 }} />
                        <Line isAnimationActive={false} type="monotone" dataKey={`Compra ${ly}`} stroke={POS} strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.5} />
                        <Line isAnimationActive={false} type="monotone" dataKey={`Venta ${ly}`} stroke={NEG} strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className={`text-[10px] ${t.textMuted}`}>La distancia entre las dos líneas es la degradación. Si se cierra vs {ly} (punteadas), se degrada menos.</p>
                </div>
                <div className={card}>
                  <h3 className={`text-sm font-black mb-2 ${t.text}`}>GOA que más mejoran y más empeoran (Δ degradación, pts)</h3>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={axisTick} axisLine={false} tickLine={false} width={96} />
                        <Tooltip {...ttStyle} formatter={(v) => `${v > 0 ? '+' : ''}${v} pts`} />
                        <ReferenceLine x={0} stroke={isDark ? '#948FA0' : '#9ca3af'} />
                        <Bar isAnimationActive={false} dataKey="v" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 9, fill: isDark ? '#cbd5e1' : '#475569' }}>{bars.map((x, i) => <Cell key={i} fill={x.v > 0 ? POS : NEG} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className={`text-[10px] ${t.textMuted}`}>Violeta = se degrada menos que {ly}; magenta = más. Solo GOA con más de $20 M de venta.</p>
                </div>
              </div>
              <div className={card}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className={`text-sm font-black ${t.text}`}>Cálculos para MG · acumulado ene-{MES[G.corte - 1]} {ty}</h3>
                  <button onClick={() => setEx(Object.fromEntries(sections.map((x) => [x.name, !Object.values(ex).some(Boolean)])))} className={`px-3 py-1 text-xs rounded-lg ${t.btnGhost}`}>{Object.values(ex).some(Boolean) ? 'Contraer todo' : 'Expandir todo'}</button>
                  <span className={`ml-auto text-[10px] ${t.textMuted}`}>Clic en una sección para ver sus GOA</span>
                </div>
                <div style={{ maxHeight: 560, overflow: 'auto' }}>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className={th} style={{ ...stk(0), height: 26 }} />
                        {CT.map(([g, cs]) => <th key={g} colSpan={cs.length} className={th} style={{ ...stk(0), height: 26, background: isDark ? '#2c2347' : '#e3d9fb', borderLeft: '2px solid rgba(167,139,250,0.5)' }}>{g}</th>)}
                      </tr>
                      <tr>
                        <th className={`${th} !text-left`} style={{ ...stk(26), left: 0, zIndex: 3 }}>Sección / GOA</th>
                        {CT.flatMap(([g, cs]) => cs.map(([h], i) => <th key={g + h} className={th} style={{ ...stk(26), ...(i === 0 ? { borderLeft: '2px solid rgba(167,139,250,0.5)' } : {}) }}>{h === 'TY' ? ty : h === 'LY' ? ly : h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {[['TOTAL', goas, 'tot'], ...sections.flatMap((sc) => [[sc.name, sc.list, 'sec'], ...(ex[sc.name] ? sc.list.filter((g) => gsum([g], ty, months).vn >= 1e6 || gsum([g], ly, months).vn >= 1e6).sort((a, b) => gsum([b], ty, months).vn - gsum([a], ty, months).vn).map((g) => [g.goa, [g], 'goa']) : [])])].map(([label, list, kind]) => {
                        const a = gfull(gsum(list, ty, months)), b = gfull(gsum(list, ly, months));
                        return (
                          <tr key={`c${kind}-${label}`} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'} ${kind === 'tot' ? 'font-black' : kind === 'sec' ? 'font-bold cursor-pointer' : ''}`} onClick={kind === 'sec' ? () => setEx((e) => ({ ...e, [label]: !e[label] })) : undefined}>
                            <td className={`${td} !text-left ${t.text}`} style={{ position: 'sticky', left: 0, background: isDark ? '#17131f' : '#ffffff', paddingLeft: kind === 'goa' ? 22 : undefined }}>{kind === 'sec' ? `${ex[label] ? '▾' : '▸'} ` : ''}{label}</td>
                            {CT.flatMap(([g, cs]) => cs.map(([h, f], i) => { const r = f(a, b); return <td key={g + h} className={`${td} ${t.text}`} style={{ color: r[1], borderLeft: i === 0 ? '2px solid rgba(167,139,250,0.25)' : undefined }}>{r[0]}</td>; }))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className={`text-[10px] mt-2 ${t.textMuted}`}>MI = margen inicial de compra (1 − costo ÷ PVP de lo comprado); Impo = Directo, Nac = Nacional + Indirecto; % part = parte de la compra a PVP. Bonif., merma, regalías y otros, y CFI van como % de venta neta (signo como viene en BQ). Δ en pts, salvo Venta (var. %).</p>
              </div>
              <div className={card}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
                    {GM.map(([k, l]) => <button key={k} onClick={() => setGm(k)} className={`px-3 py-1 text-xs rounded-md ${gm === k ? t.toggleActive : t.textMuted}`}>{l}</button>)}
                  </div>
                  <button onClick={() => setEx(Object.fromEntries(sections.map((x) => [x.name, !Object.values(ex).some(Boolean)])))} className={`px-3 py-1 text-xs rounded-lg ${t.btnGhost}`}>{Object.values(ex).some(Boolean) ? 'Contraer todo' : 'Expandir todo'}</button>
                  <span className={`ml-auto text-[10px] ${t.textMuted}`}>Clic en una sección para ver sus GOA · el color de cada mes compara contra el mismo mes de {ly}</span>
                </div>
                {!GX.c?.length && <p className={`text-[10px] mb-2 ${t.textMuted}`}>Falta el archivo de Compras: sin él no hay MG compra ni degradación.</p>}
                <div style={{ maxHeight: 560, overflow: 'auto' }}>
                  <table className="w-full">
                    <thead><tr><th className={`${th} !text-left`} style={stk(0)}>Sección / GOA</th>{months.map((m) => <th key={m} className={th} style={stk(0)}>{MES[m - 1]}</th>)}<th className={th} style={stk(0)}>Acum. {ly}</th><th className={th} style={stk(0)}>Acum. {ty}</th><th className={th} style={stk(0)}>Δ</th></tr></thead>
                    <tbody>
                      {renderRow('TOTAL', goas, 'tot')}
                      {sections.flatMap((sc) => [renderRow(sc.name, sc.list, 'sec'), ...(ex[sc.name] ? sc.list.filter((g) => gsum([g], ty, months).vn >= 1e6 || gsum([g], ly, months).vn >= 1e6).sort((a, b) => gsum([b], ty, months).vn - gsum([a], ty, months).vn).map((g) => renderRow(g.goa, [g], 'goa')) : [])])}
                    </tbody>
                  </table>
                </div>
                <p className={`text-[10px] mt-2 ${t.textMuted}`}>MG compra = 1 − compras a costo ÷ compras a precio de venta. MG vendido = utilidad de lo vendido ÷ venta neta. Degradación = MG vendido − MG compra (negativa; entre menos negativa, mejor). En Δ, positivo = mejor que {ly}. GOA con menos de $1 M de venta no se listan, pero sí suman en su sección.</p>
              </div>
            </>);
          })())}
          {tab === 'resumen' && SUM && (
            <div className="space-y-3">
              <div className={`${card} flex items-start justify-between gap-3`}>
                <div>
                  <div className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Resumen ejecutivo · {R.ty} vs {R.ly}{X.hasMes ? '' : ' (acumulado)'}</div>
                  <h2 className={`text-lg font-black mt-1 ${t.text}`}>{SUM.head}</h2>
                </div>
                <button onClick={copiar} className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-bold ${t.btnGhost}`}>Copiar</button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {SUM.blocks.map(([h, items], i) => (
                  <div key={h} className={card}>
                    <h3 className="text-sm font-black mb-2" style={{ color: i === 3 ? POS : undefined }}><span className={i === 3 ? '' : t.text}>{h}</span></h3>
                    <ul className="space-y-1.5">
                      {items.map((x, j) => x.startsWith('  ·')
                        ? <li key={j} className={`text-xs pl-5 ${t.textMuted}`}>{x.trim()}</li>
                        : <li key={j} className={`text-xs list-disc ml-4 ${t.text}`}>{x}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <p className={`text-[10px] ${t.textMuted}`}>Se arma solo con los filtros activos del header. El supuesto usa los % de recuperación de la pestaña Detalle.</p>
            </div>
          )}
          {tab === 'detalle' && (<>
          <div className="grid md:grid-cols-2 gap-4">
          <div className={card}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className={`text-sm font-black ${t.text}`}>Puente de margen (pts de venta neta)</h3>
                <span className={`text-[10px] ${t.textMuted}`}>+ = ayuda al margen (p. ej. costo o financiamiento más bajos) · incluye mix</span>
              </div>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <BarChart data={chart} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} />
                    <ReferenceLine y={0} stroke={isDark ? '#4b4458' : '#d1d5db'} />
                    <Tooltip {...ttStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }} formatter={(v) => [`${v > 0 ? '+' : ''}${v} pts`, 'Efecto']} />
                    <Bar isAnimationActive={false} dataKey="v" radius={[4, 4, 4, 4]} label={{ position: 'top', fontSize: 10, fill: isDark ? '#cbd5e1' : '#475569', formatter: (v) => (v > 0 ? `+${v}` : v) }}>
                      {chart.map((d, i) => <Cell key={i} fill={d.v >= 0 ? POS : NEG} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {SM && (
                <div className="mt-3">
                  <h4 className={`text-xs font-black mb-1 ${t.text}`}>Supuesto: ¿y si lo arreglamos?</h4>
                  {SM.rows.length === 0 ? <p className={`text-xs ${t.textMuted}`}>No hay causas a la baja en este alcance.</p> : (
                    <table className="w-full">
                      <thead><tr><th className={`${th} !text-left`}>Causa a la baja</th><th className={th}>Efecto</th><th className={th}>Recuperar %</th><th className={th}>Ganas pts</th><th className={th}>UB $</th></tr></thead>
                      <tbody>
                        {SM.rows.map((x) => (
                          <tr key={x.k} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                            <td className={`${td} !text-left ${t.text}`} title={CAUSA[x.k][1]}>{CAUSA[x.k][0]}</td>
                            <td className={td} style={{ color: NEG }}>{pts(x.eff)}</td>
                            <td className={td}><input type="number" min="0" max="100" step="10" value={x.p} onChange={(e) => setSim((s) => ({ ...s, [x.k]: Math.min(100, Math.max(0, +e.target.value || 0)) }))} className={`w-16 text-center px-1 py-0.5 text-xs rounded-lg border focus:outline-none ${t.input}`} /></td>
                            <td className={td} style={{ color: POS }}>{pts(x.pts)}</td>
                            <td className={td} style={{ color: POS }}>{usd(x.usd)}</td>
                          </tr>
                        ))}
                        <tr className={`border-t font-black ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                          <td className={`${td} !text-left ${t.text}`} colSpan={3}>Margen {pc(R.MT)} → {pc(SM.mNew)}</td>
                          <td className={td} style={{ color: POS }}>{pts(SM.pts)}</td><td className={td} style={{ color: POS }}>{usd(SM.usd)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  <p className={`text-[10px] mt-1 ${t.textMuted}`}>Recupera X% del efecto negativo de cada causa. Pts y UB sobre la venta {R.ty}; es un supuesto, no un pronóstico.</p>
                </div>
              )}
            </div>
            <div className={card}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className={`text-sm font-black ${t.text}`}>MG inicial y cómo se degrada (% de precio lleno)</h3>
                <span className={`text-[10px] ${t.textMuted}`}>Venta {R.ly}→{R.ty}: {pc(R.VT / R.VL - 1)}</span>
              </div>
              <div style={{ height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={DEG.map((n, i) => ({ name: n, [R.ly]: R.sL ? +(R.sL.cum[i] * 100).toFixed(1) : 0, [R.ty]: R.sT ? +(R.sT.cum[i] * 100).toFixed(1) : 0 }))} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} unit="%" />
                    <Tooltip {...ttStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }} formatter={(v) => `${v}%`} />
                    <Bar isAnimationActive={false} dataKey={String(R.ly)} fill={LYC} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: isDark ? '#948FA0' : '#6b7280' }} />
                    <Bar isAnimationActive={false} dataKey={String(R.ty)} fill={POS} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: isDark ? '#cbd5e1' : '#475569' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full mt-2">
                <thead><tr><th className={`${th} !text-left`}>Paso (pts s/ precio lleno)</th><th className={th}>{R.ly}</th><th className={th}>{R.ty}</th><th className={th}>Δ</th></tr></thead>
                <tbody>
                  {[['MG inicial', 'ini', true], ['Descuento', 'desc'], ['Merma', 'merma'], ['Financiamiento', 'financ'], ['Bonificación', 'bonif'], ['Ajustes / saldos', 'otros'], ['UB s/ precio lleno', 'fin', true], ['UB s/ venta neta', 'vn', true]].map(([l, k, bold]) => {
                    const a = R.sL?.[k], b = R.sT?.[k], dl = a != null && b != null ? b - a : null;
                    return (
                      <tr key={k} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'} ${bold ? 'font-black' : ''}`}>
                        <td className={`${td} !text-left ${t.text}`}>{l}</td>
                        <td className={`${td} ${t.text}`}>{bold ? pc(a) : pts(a)}</td><td className={`${td} ${t.text}`}>{bold ? pc(b) : pts(b)}</td>
                        <td className={td} style={{ color: col(dl) }}>{pts(dl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {R.cat?.L && R.cat?.T && (
                <table className="w-full mt-3">
                  <thead><tr><th className={`${th} !text-left`}>Vs catálogo (precio inicial de lista)</th><th className={th}>{R.ly}</th><th className={th}>{R.ty}</th><th className={th}>Δ</th></tr></thead>
                  <tbody>
                    {[['MG catálogo', R.cat.L.mg, R.cat.T.mg], ['MG inicial (utilidad)', R.sL?.ini, R.sT?.ini], ['Rebaja de lista', R.cat.L.lista, R.cat.T.lista]].map(([l, a, b]) => (
                      <tr key={l} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                        <td className={`${td} !text-left ${t.text}`}>{l}</td>
                        <td className={`${td} ${t.text}`}>{pc(a)}</td><td className={`${td} ${t.text}`}>{pc(b)}</td>
                        <td className={td} style={{ color: l === 'Rebaja de lista' ? col(a != null && b != null ? a - b : null) : col(a != null && b != null ? b - a : null) }}>{a != null && b != null ? pts(b - a) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {R.cat?.L && <p className={`text-[10px] mt-1 ${t.textMuted}`}>Catálogo = 1 − costo ÷ (unidades × precio inicial sin IVA). Rebaja de lista = 1 − precio vigente ÷ inicial (cambios de precio / letras de rebaja; el vigente es el de hoy, así que el año anterior sale algo inflado). Filtra por división, sección, marca y mes; no por origen.</p>}
            </div>
          </div>

          <div className={card}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
                {DIMS.map(([k, l]) => <button key={k} onClick={() => setDim(k)} className={`px-3 py-1 text-xs rounded-md ${dim === k ? t.toggleActive : t.textMuted}`}>{l}</button>)}
              </div>
              <label className={`flex items-center gap-1 text-xs ${t.textMuted}`}><input type="checkbox" checked={soloBaja} onChange={(e) => setSoloBaja(e.target.checked)} /> Solo a la baja</label>
              <span className={`ml-auto text-[10px] ${t.textMuted}`}>Clic en una fila para bajar un nivel · ordenado por contribución al total</span>
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={`${th} !text-left`}>{DIMS.find((d) => d[0] === dim)[1]}</th>
                    {['Venta TY', 'Var %', `Mg ${R.ly}`, `Mg ${R.ty}`, 'MG ini', 'Degrad.', 'Δ pts', 'Contrib.', 'Mix', 'Impacto UB', 'Descto', 'Compra', 'Bonif', 'Merma', 'Financ', 'Otros'].map((h) => <th key={h} className={th}>{h}</th>)}
                    <th className={`${th} !text-left`}>Causa → acción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`font-black ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                    <td className={`${td} !text-left ${t.text}`}>Total</td>
                    <td className={`${td} ${t.text}`}>{fmtM(R.VT)}</td><td className={`${td} ${t.text}`}>{pc(R.VT / R.VL - 1)}</td>
                    <td className={`${td} ${t.text}`}>{pc(R.ML)}</td><td className={`${td} ${t.text}`}>{pc(R.MT)}</td>
                    <td className={`${td} ${t.text}`}>{pc(R.sT?.ini)}</td><td className={td}>{pts(R.sT ? R.sT.fin - R.sT.ini : null)}</td>
                    <td className={td} style={{ color: col(R.MT - R.ML) }}>{pts(R.MT - R.ML)}</td>
                    <td className={td} style={{ color: col(R.MT - R.ML) }}>{pts(R.MT - R.ML)}</td>
                    <td className={td}>{pts(R.list.reduce((s, x) => s + x.mix, 0))}</td>
                    <td className={td} style={{ color: col(R.MT - R.ML) }}>{fmtM((R.MT - R.ML) * R.VT)}</td>
                    {['desc', 'compra', 'bonif', 'merma', 'financ', 'otros'].map((k) => <td key={k} className={td} style={{ color: col(R.br?.[k]) }}>{pts(R.br?.[k])}</td>)}
                    <td />
                  </tr>
                  {rows.map((x) => (
                    <tr key={x.name} onClick={() => NEXT[dim] && (setF((s) => ({ ...s, [dim]: [x.name] })), setDim(NEXT[dim]))} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'} ${t.tableRow} ${NEXT[dim] ? 'cursor-pointer' : ''}`}>
                      <td className={`${td} !text-left font-bold ${t.text} max-w-[240px] truncate`} title={x.name}>
                        {x.name}{x.tag && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black ${x.tag === 'salida' ? 'bg-amber-500/20 text-amber-500' : 'bg-sky-500/20 text-sky-500'}`}>{x.tag}</span>}
                      </td>
                      <td className={`${td} ${t.text}`}>{fmtM(x.T.vn)}</td>
                      <td className={td} style={{ color: col(x.varV) }}>{pc(x.varV)}</td>
                      <td className={`${td} ${t.text}`}>{pc(x.mL)}</td><td className={`${td} ${t.text}`}>{pc(x.mT)}</td>
                      <td className={`${td} ${t.text}`}>{pc(x.sT?.ini)}</td><td className={td}>{pts(x.sT ? x.sT.fin - x.sT.ini : null)}</td>
                      <td className={`${td} font-bold`} style={{ color: col(x.br?.total) }}>{pts(x.br?.total)}</td>
                      <td className={`${td} font-black`} style={{ color: col(x.contrib) }}>{pts(x.contrib)}</td>
                      <td className={td} style={{ color: col(x.mix) }}>{pts(x.mix)}</td>
                      <td className={td} style={{ color: col(x.imp$) }}>{x.imp$ == null ? '—' : `${x.imp$ >= 0 ? '+' : '-'}${fmtM(Math.abs(x.imp$))}`}</td>
                      {['desc', 'compra', 'bonif', 'merma', 'financ', 'otros'].map((k) => <td key={k} className={td} style={{ color: col(x.br?.[k]) }}>{pts(x.br?.[k])}</td>)}
                      <td className={`${td} !text-left text-[11px] ${t.textMuted}`} title={x.causa ? CAUSA[x.causa][1] : ''}>{x.causa ? <><b className={t.text}>{CAUSA[x.causa][0]}</b> → {CAUSA[x.causa][1]}</> : x.tag === 'salida' ? 'Marca en salida' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-[10px] mt-2 ${t.textMuted}`}>
              Descto = menor/mayor descuento (precio lleno → venta neta). Compra = costo ÷ precio lleno (IMU de compra y mezcla). Bonif/Merma/Financ = % sobre venta neta. Otros = ajustes y saldos de costo. Los efectos de cada fila son propios del segmento (pts de su venta); Contrib. = su aporte al Δ del total (tasa + mix) y suma exacta.
              MG ini = 1 − costo ÷ precio lleno; Degrad. = UB ÷ precio lleno − MG ini (lo que se pierde en descuento, merma y financiamiento, neto de bonificación). La bonificación es mensual y se calcula sobre costo (crece con el descuento), y al cierre de año se ajusta por aduanas y tipo de cambio vs presupuesto; una marca descontinuada ya no bonifica.
            </p>
          </div>
          </>)}
        </>
      )}
    </div>
  );
}

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

// ─── Utilidades ───────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s%]/g, '')));
const isBlank = (v) => v == null || String(v).trim() === '';
const str = (v) => String(v ?? '').trim();
const ctr = (v) => { const s = str(v); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; }; // centros con ceros a la izquierda
const toDate = (v) => (v instanceof Date ? v : typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)) : v ? new Date(v) : null);
const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const pct = (v, d = 0) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const moda = (arr) => { const c = {}; arr.forEach((v) => (c[v] = (c[v] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
const groupBy = (rows, fn) => { const m = new Map(); rows.forEach((r) => { const k = fn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
const lista = (s, n = 8) => { const a = [...s].sort(); return a.length > n ? `${a.slice(0, n).join(', ')} +${a.length - n}` : a.join(', '); };

// Alias para el archivo de OC (formato libre)
const ALIAS = {
  sku: ['SKU', 'ARTICULO', 'MATERIAL', 'UPC', 'EAN', 'VAR / IND', 'VAR/IND'],
  estilo: ['ESTILO', 'MODELO', 'GENERICO', 'STYLE'],
  talla: ['TALLA', 'SIZE'],
  tienda: ['TIENDA', 'CENTRO', 'STORE', 'SUCURSAL'],
  oc: ['OC', 'ORDEN', 'ORDEN DE COMPRA', 'PEDIDO', 'PO'],
  qty: ['CANTIDAD', 'PIEZAS', 'PZAS', 'QTY', 'UNIDADES', 'CANTIDAD PEDIDA'],
};
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
// Libro "Validación Parametrizaciones": ZO9_DM (bloque crudo Gpo.Art.…Store Priority N), CATALOGO, BASE,
// MATRIZ CLIMA, COMPRA_MES, ZO9_MARA, BASE_FECHAS O9. No hace falta correr las fórmulas: todo se cruza aquí.
// Las hojas pueden venir en uno o varios archivos; cada una se reconoce por sus encabezados.
const findHdr = (aoa, test) => aoa.slice(0, 15).findIndex((r) => test(r.map(norm)));
async function parseFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const out = {};
  wb.SheetNames.forEach((sn) => {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
    let hi;
    // ZO9_DM
    if ((hi = findHdr(aoa, (h) => h.includes('GPO ART') && h.includes('STOCK MIN N'))) >= 0) {
      const h = aoa[hi].map(norm), s = h.indexOf('GPO ART'), e = h.indexOf('STORE PRIORITY N') + 1 || h.length;
      const header = aoa[hi].slice(s, e).map(str), hn = h.slice(s, e), c = (n) => hn.indexOf(n);
      const cols = { grp: c('GPO ART'), art: c('VAR / IND'), desc: c('DESCRIPCION'), centro: c('CENTRO'), ap: c('AP N'), nivel: c('NIVEL FORECAST N'), min: c('STOCK MIN N'), max: c('STOCK MAX N'), wos: c('WOS N'), plazo: c('PLAZO ENT N') };
      const rows = aoa.slice(hi + 1).map((r) => r.slice(s, e)).filter((r) => !isBlank(r[cols.art]) && !isBlank(r[cols.centro]));
      out.param = { name: `${file.name} › ${sn}`, header, cols, rows };
      return;
    }
    // CATALOGO
    if ((hi = findHdr(aoa, (h) => h.includes('ARTICULO') && h.includes('MODELO') && h.includes('TALLA'))) >= 0) {
      const h = aoa[hi].map(norm), g = (r, n) => str(r[h.indexOf(n)]);
      out.cat = {};
      aoa.slice(hi + 1).forEach((r) => { const a = g(r, 'ARTICULO'); if (a) out.cat[a] = { modelo: g(r, 'MODELO'), color: g(r, 'COLOR'), talla: g(r, 'TALLA'), goa: g(r, 'DESCRIPCION GRUPO'), marca: g(r, 'DENOMINACION MARCA'), prov: g(r, 'DESCR PROVEEDOR') }; });
      return;
    }
    // BASE (varias tablas lado a lado)
    if ((hi = findHdr(aoa, (h) => h.includes('VA / NO VA') && h.includes('CLUSTER'))) >= 0) {
      const h = aoa[hi].map(norm), rows = aoa.slice(hi + 1);
      const iC = h.indexOf('CENTRO'), iMar = h.indexOf('MARCA'), iVa = h.indexOf('VA / NO VA'), iCl = h.indexOf('CLUSTER'), iCli = h.indexOf('CLIMA'), iDesc = h.indexOf('DESC CENTRO'), iZ = h.indexOf('ZONA');
      const iCod = h.indexOf('CODIGO'), iCod2 = h.indexOf('CODIGO', iCod + 1), iAp = h.indexOf('AP'), iApC = iAp - 1, iCed = h.indexOf('CEDIS Y FULLFILMENT');
      const b = { centros: {}, matriz: {}, marcaAgr: {}, tipoGrp: {}, ap7: [], cedis: [] };
      rows.forEach((r) => {
        const c = ctr(r[iC]);
        if (c && !b.centros[c]) b.centros[c] = { clima: str(r[iCli]), cluster: str(r[iCl]), desc: str(r[iDesc]), zona: str(r[iZ]) };
        if (c && str(r[iMar])) b.matriz[`${norm(r[iMar])}|${c}`] = norm(r[iVa]);
        if (iCod >= 0 && str(r[iCod + 1])) b.marcaAgr[norm(r[iCod + 1])] = norm(r[iCod + 2]);
        if (iCod2 >= 0 && str(r[iCod2])) b.tipoGrp[str(r[iCod2])] = norm(r[iCod2 + 2]);
        if (iAp >= 0 && str(r[iApC]) && str(r[iAp]) === '7') b.ap7.push(ctr(r[iApC]));
        if (iCed >= 0 && str(r[iCed])) b.cedis.push(ctr(r[iCed]));
      });
      out.base = b;
      return;
    }
    // MATRIZ CLIMA (clima general + por mes 1..12)
    if ((hi = findHdr(aoa, (h) => h.includes('DET') && h.includes('CLIMA GENERAL'))) >= 0) {
      const h = aoa[hi], hn = h.map(norm), iD = hn.indexOf('DET'), iG = hn.indexOf('CLIMA GENERAL');
      const mc = h.map((x, i) => ({ i, m: +x })).filter((x) => x.m >= 1 && x.m <= 12);
      out.clima = {};
      aoa.slice(hi + 1).forEach((r) => { const c = ctr(r[iD]); if (c) out.clima[c] = { general: norm(r[iG]), mes: Object.fromEntries(mc.map((x) => [x.m, norm(r[x.i])])) }; });
      return;
    }
    // COMPRA_MES
    if ((hi = findHdr(aoa, (h) => h.includes('ARTICULO') && h.includes('MES') && h.includes('PIEZAS'))) >= 0) {
      const h = aoa[hi].map(norm), iA = h.indexOf('ARTICULO'), iM = h.indexOf('MES'), iP = h.indexOf('PIEZAS');
      out.compra = {};
      aoa.slice(hi + 1).forEach((r) => { const a = str(r[iA]); if (a) out.compra[`${a}|${+r[iM]}`] = (out.compra[`${a}|${+r[iM]}`] || 0) + (num(r[iP]) || 0); });
      return;
    }
    // ZO9_MARA
    if ((hi = findHdr(aoa, (h) => h.includes('MATERIAL') && h.includes('ALLOCATION COVERAGE'))) >= 0) {
      const h = aoa[hi].map(norm), iA = h.indexOf('MATERIAL'), iC = h.indexOf('ALLOCATION COVERAGE');
      out.mara = {}; aoa.slice(hi + 1).forEach((r) => { if (str(r[iA])) out.mara[str(r[iA])] = num(r[iC]); });
      return;
    }
    // BASE_FECHAS O9
    if ((hi = findHdr(aoa, (h) => h.includes('MATERIAL') && h.includes('FECHA IN DE TEMP'))) >= 0) {
      const h = aoa[hi].map(norm), iA = h.indexOf('MATERIAL'), iI = h.indexOf('FECHA IN DE TEMP'), iF = h.indexOf('FECHA FIN DE TEMP');
      out.fechas = {}; aoa.slice(hi + 1).forEach((r) => { if (str(r[iA])) out.fechas[str(r[iA])] = { ini: toDate(r[iI]), fin: toDate(r[iF]) }; });
      return;
    }
    // OC (formato libre)
    if (!out.oc && (hi = aoa.slice(0, 15).findIndex((r) => { const c = mapHeader(r); return c.sku != null && c.tienda != null && c.qty != null; })) >= 0) {
      const cols = mapHeader(aoa[hi]);
      out.oc = { name: `${file.name} › ${sn}`, header: aoa[hi].map(str), cols, rows: aoa.slice(hi + 1).filter((r) => !isBlank(r[cols.sku]) && !isBlank(r[cols.tienda])) };
    }
  });
  return out;
}

// ─── Reglas ───────────────────────────────────────────────────────────────────
const DEF_CFG = { climaMes: true, curvaPts: 10, plazo: '', picoX: 3, concTop: 0.2, concShare: 0.5, coreTalla: 0.1 };
const CLUSTER_ORD = ['AA', 'A', 'B', 'C', 'D', 'E']; // AA = mejor; al recortar se apagan primero los de abajo
const HOT = ['CALOR', 'PLAYA'], COLD = ['FRIO', 'FRIO LIGERO', 'TEMPLADO', 'EXTREMOSO'];
const EXC_CENTROS = ['0670', '880S']; // excepciones del archivo (matriz y WOS)

const PARAM_RULES = {
  cierre:    { sev: 'error', label: 'Centro en cierre activo', help: 'Centro marcado CIERRES con nivel fcst 1 → se apaga' },
  fueraMatriz:{ sev: 'error', label: 'Activo fuera de matriz', help: 'Nivel fcst 1 en centro NO VA / sin matriz para la marca → se apaga' },
  vaInactivo:{ sev: 'warn',  label: 'VA sin parametrizar', help: 'Matriz dice VA y el centro está en 0 → se activa con MIN/MAX del cluster' },
  calor:     { sev: 'error', label: 'Invernal en tienda de calor', help: 'Mercancía invernal activa en clima Calor/Playa → se apaga' },
  frio:      { sev: 'error', label: 'Calor en tienda fría', help: 'Mercancía de calor activa en clima frío/templado/extremoso → se apaga' },
  ap:        { sev: 'error', label: 'AP distinto de 8', help: 'Centro activo con AP ≠ 8 (salvo centros AP7) → AP 8' },
  compra:    { sev: 'error', label: 'Compra no cubre mínimos', help: 'Σ Stock Min de centros activos > compra del mes → se apagan centros de clusters bajos' },
  minmax:    { sev: 'error', label: 'MIN > MAX', help: 'Stock Max menor al mínimo → MAX = MIN' },
  cluster:   { sev: 'warn',  label: 'MIN distinto en el cluster', help: 'Mismo modelo/talla/cluster con Stock Min diferente → moda' },
  curva:     { sev: 'warn',  label: 'MIN vs curva de compra', help: 'Mezcla de tallas en Σ Stock Min se aleja de la curva comprada' },
  wos:       { sev: 'warn',  label: 'WOS ≠ semanas de temporada', help: 'WOS debe igualar (fin − inicio de temp.) / 7 → se ajusta' },
  coverage:  { sev: 'warn',  label: 'Allocation coverage ≠ semanas', help: 'ZO9_MARA: coverage debe igualar semanas de temporada (corregir en MARA)' },
  lunes:     { sev: 'warn',  label: 'Inicio de temporada no es lunes', help: 'Fecha inicio de temporada debe caer en lunes' },
  plazo:     { sev: 'warn',  label: 'Plazo de entrega', help: 'Plazo Ent. distinto al esperado (o a la moda del modelo)' },
  sinBase:   { sev: 'warn',  label: 'Centro sin matriz', help: 'Centro no existe en BASE: sin clima ni cluster para validar' },
};

const OC_RULES = {
  bajoMin:   { sev: 'error', label: 'No cubre mínimo', help: 'Cantidad en OC < Stock Min parametrizado del centro/artículo' },
  destalle:  { sev: 'error', label: 'Tienda destallada', help: 'Recibe el modelo pero le faltan tallas centrales de la curva' },
  sinPedido: { sev: 'warn',  label: 'Centro parametrizado sin OC', help: 'Activo con Stock Min > 0 pero no aparece en la OC' },
  pico:      { sev: 'warn',  label: 'Pico de cantidad', help: 'Cantidad muy por arriba de la mediana del artículo o del Stock Max' },
  concentr:  { sev: 'warn',  label: 'Concentración', help: 'Pocas tiendas se llevan la mayor parte del artículo' },
};

function checkParams(P, X, cfg) {
  const { cols: c, rows } = P, cat = X.cat || {}, base = X.base || { centros: {}, matriz: {}, marcaAgr: {}, tipoGrp: {}, ap7: [], cedis: [] };
  const clima = X.clima || {}, compra = X.compra || {}, mara = X.mara || {}, fechas = X.fechas || {};
  const ap7 = new Set(base.ap7), cedis = new Set(base.cedis);
  const fixes = rows.map(() => ({}));
  const G = new Map(); // hallazgos agrupados: regla|dónde|detalle
  const add = (rule, where, detalle, actual, sugerido, centro, talla) => {
    const k = `${rule}|${where}|${detalle}`;
    const g = G.get(k) || { rule, sev: PARAM_RULES[rule].sev, where, detalle, actual, sugerido, centros: new Set(), tallas: new Set(), n: 0 };
    g.n++; if (centro) g.centros.add(centro); if (talla) g.tallas.add(talla); G.set(k, g); return g;
  };
  const semanas = (f) => (f?.ini && f?.fin ? Math.round((f.fin - f.ini) / 6048e5) : null);

  // Fila de trabajo (valores que se van corrigiendo)
  const W = rows.map((r, i) => {
    const art = str(r[c.art]), centro = ctr(r[c.centro]), k = cat[art] || {}, b = base.centros[centro];
    const agr = base.marcaAgr[norm(k.marca)] || norm(k.marca), f = fechas[art];
    const mes = f?.ini ? f.ini.getMonth() + 1 : null, cz = clima[centro];
    const cli = norm((cfg.climaMes && mes && cz?.mes?.[mes]) || cz?.general || b?.clima);
    return {
      i, art, centro, grp: str(r[c.grp]), modelo: k.modelo || str(r[c.desc]), color: k.color || '', talla: k.talla || '',
      mc: `${k.modelo || art} ${k.color || ''}`.trim(), cluster: norm(b?.cluster), clima: cli, tipo: base.tipoGrp[str(r[c.grp])] || '',
      va: base.matriz[`${agr}|${centro}`], f, mes, cedis: cedis.has(centro),
      ap: str(r[c.ap]), act: str(r[c.nivel]) === '1', min: num(r[c.min]) || 0, max: num(r[c.max]) || 0, wos: num(r[c.wos]) || 0, plazo: str(r[c.plazo]),
    };
  });
  const setF = (w, o) => { Object.assign(w, o); Object.entries(o).forEach(([k, v]) => { if (c[k === 'act' ? 'nivel' : k] != null) fixes[w.i][k === 'act' ? 'nivel' : k] = k === 'act' ? (v ? '1' : '0') : v; }); };
  const apagar = (w) => setF(w, { act: false, ap: '', min: 0, max: 0, wos: 0, plazo: '0' });

  // 1. Centros sin BASE
  W.forEach((w) => { if (!w.cedis && !base.centros[w.centro]) add('sinBase', w.mc, `Centro ${w.centro} no está en BASE`, '', 'Agregar a BASE', w.centro, w.talla); });
  // 2. Cierres
  W.forEach((w) => { if (w.act && !w.cedis && !EXC_CENTROS.includes(w.centro) && (w.cluster === 'CIERRES' || w.va === 'CIERRES')) { add('cierre', w.mc, 'Centro en cierre con nivel fcst 1', '1', '0', w.centro, w.talla); apagar(w); } });
  // 3. Clima
  W.forEach((w) => {
    if (!w.act || w.cedis) return;
    if (w.tipo === 'INVERNAL' && HOT.includes(w.clima)) { add('calor', w.mc, `Invernal (${w.grp}) en clima ${w.clima}${w.mes ? ` · mes ${w.mes}` : ''}`, '1', '0', w.centro, w.talla); apagar(w); }
    else if (w.tipo === 'CALOR' && COLD.includes(w.clima)) { add('frio', w.mc, `Calor (${w.grp}) en clima ${w.clima}${w.mes ? ` · mes ${w.mes}` : ''}`, '1', '0', w.centro, w.talla); apagar(w); }
  });
  // 4. Matriz de marca
  W.forEach((w) => {
    if (w.cedis || EXC_CENTROS.includes(w.centro) || !base.centros[w.centro]) return;
    if (w.act && w.va !== 'VA') { add('fueraMatriz', w.mc, w.va ? `Matriz: ${w.va}` : 'Marca sin matriz en el centro', '1', '0', w.centro, w.talla); apagar(w); }
  });
  const act = () => W.filter((w) => w.act);
  // 5. AP
  W.forEach((w) => { if (w.act && !w.cedis && w.ap !== '8' && !ap7.has(w.centro)) { add('ap', w.mc, `AP ${w.ap || 'vacío'}`, w.ap || '—', '8', w.centro, w.talla); setF(w, { ap: '8' }); } });
  // 6. WOS vs semanas de temporada
  W.forEach((w) => { const s = semanas(w.f); if (w.act && s != null && w.wos !== s && !EXC_CENTROS.includes(w.centro)) { add('wos', w.mc, `WOS ${w.wos} vs ${s} semanas`, w.wos, s, w.centro, w.talla); setF(w, { wos: s }); } });
  // 7. Plazo
  groupBy(act().filter((w) => !w.cedis), (w) => w.mc).forEach((g, mc) => {
    const m = cfg.plazo !== '' ? str(cfg.plazo) : moda(g.map((w) => w.plazo));
    g.forEach((w) => { if (w.plazo !== m) { add('plazo', mc, `Plazo ${w.plazo} vs ${m}`, w.plazo, m, w.centro, w.talla); setF(w, { plazo: m }); } });
  });
  // 8. MIN consistente por cluster
  groupBy(act().filter((w) => w.cluster), (w) => `${w.mc}|${w.talla}|${w.cluster}`).forEach((g) => {
    if (g.length < 3) return;
    const m = +moda(g.map((w) => w.min)), off = g.filter((w) => w.min !== m);
    if (off.length && off.length / g.length <= 0.34) off.forEach((w) => { add('cluster', w.mc, `Cluster ${w.cluster}: MIN ${w.min} vs moda ${m}`, w.min, m, w.centro, w.talla); setF(w, { min: m }); });
  });
  // 9. MIN > MAX (MAX 0 = sin tope)
  W.forEach((w) => { if (w.act && w.max > 0 && w.min > w.max) { add('minmax', w.mc, `MIN ${w.min} > MAX ${w.max}`, w.max, w.min, w.centro, w.talla); setF(w, { max: w.min }); } });
  // 10. Compra del mes vs Σ MIN → se apagan centros de clusters bajos hasta cuadrar
  groupBy(act(), (w) => w.art).forEach((g, art) => {
    const w0 = g[0]; if (!w0.mes) return;
    const pz = compra[`${art}|${w0.mes}`]; if (pz == null) return;
    const sMin = g.reduce((s, w) => s + w.min, 0); if (sMin <= pz) return;
    const orden = [...g].sort((a, b) => (CLUSTER_ORD.indexOf(b.cluster) - CLUSTER_ORD.indexOf(a.cluster)) || a.centro.localeCompare(b.centro));
    let s = sMin; const off = [];
    for (const w of orden) { if (s <= pz) break; s -= w.min; off.push(w); }
    const gk = add('compra', w0.mc, `T.${w0.talla}: compra ${fmt(pz)} pzas vs Σ MIN ${fmt(sMin)} en ${g.length} centros → apagar ${off.length} (${lista(new Set(off.map((w) => w.cluster || '—')), 6)})`, sMin, pz, null, w0.talla);
    off.forEach((w) => { gk.centros.add(w.centro); apagar(w); });
  });
  // 11. VA sin parametrizar → se prende (mejor cluster primero) solo si la compra alcanza. Invernal apagado = decisión de clima (igual que el archivo)
  const refCl = groupBy(act(), (w) => `${w.mc}|${w.talla}|${w.cluster}`), refT = groupBy(act(), (w) => `${w.mc}|${w.talla}`);
  const libre = {}; groupBy(act(), (w) => w.art).forEach((g, art) => { const pz = g[0].mes ? compra[`${art}|${g[0].mes}`] : null; libre[art] = pz == null ? Infinity : pz - g.reduce((s, w) => s + w.min, 0); });
  W.filter((w) => !w.act && w.va === 'VA' && !w.cedis && w.cluster !== 'CIERRES' && w.tipo !== 'INVERNAL' && !(w.tipo === 'CALOR' && COLD.includes(w.clima)))
    .sort((a, b) => CLUSTER_ORD.indexOf(a.cluster) - CLUSTER_ORD.indexOf(b.cluster))
    .forEach((w) => {
      const ref = refCl.get(`${w.mc}|${w.talla}|${w.cluster}`) || refT.get(`${w.mc}|${w.talla}`);
      if (!ref) return; // modelo-talla sin ningún centro activo: no se inventa
      const min = +moda(ref.map((r) => r.min)), max = +moda(ref.map((r) => r.max));
      if ((libre[w.art] ?? Infinity) < min) { add('vaInactivo', w.mc, `Cluster ${w.cluster || '—'}: VA en 0, sin compra para prenderlo`, '0', 'Revisar compra', w.centro, w.talla); return; }
      libre[w.art] = (libre[w.art] ?? Infinity) - min;
      add('vaInactivo', w.mc, `Cluster ${w.cluster || '—'}: VA con nivel fcst 0`, '0', `1 · MIN ${min}`, w.centro, w.talla);
      setF(w, { act: true, ap: ap7.has(w.centro) ? '7' : '8', min, max, wos: semanas(w.f) ?? +moda(ref.map((r) => r.wos)), plazo: moda(ref.map((r) => r.plazo)) });
    });
  // 12. Curva: mezcla de tallas en Σ MIN (por modelo-color × cluster) vs curva de compra
  groupBy(act().filter((w) => w.talla && w.mes), (w) => w.mc).forEach((g, mc) => {
    const pzT = {}; new Map(g.map((w) => [w.talla, w])).forEach((w, t) => (pzT[t] = compra[`${w.art}|${w.mes}`] || 0));
    const tc = Object.values(pzT).reduce((a, b) => a + b, 0); if (!tc) return;
    groupBy(g, (w) => w.cluster).forEach((gc, cl) => {
      const mT = {}; gc.forEach((w) => (mT[w.talla] = (mT[w.talla] || 0) + w.min));
      const tm = Object.values(mT).reduce((a, b) => a + b, 0); if (!tm) return;
      Object.keys(pzT).forEach((t) => { const a = (mT[t] || 0) / tm, b = pzT[t] / tc; if (Math.abs(a - b) * 100 > cfg.curvaPts) add('curva', mc, `Cluster ${cl || '—'} T.${t}: MIN pesa ${pct(a)} vs compra ${pct(b)}`, pct(a), pct(b), null, t); });
    });
  });
  // 13. Fechas: lunes y coverage (por artículo)
  new Map(W.map((w) => [w.art, w])).forEach((w, art) => {
    if (!w.f?.ini) return;
    if (w.f.ini.getDay() !== 1) add('lunes', w.mc, `Inicio ${w.f.ini.toLocaleDateString('es-MX')} (${w.f.ini.toLocaleDateString('es-MX', { weekday: 'long' })})`, '', 'Lunes', null, w.talla);
    const s = semanas(w.f), cov = mara[art];
    if (s != null && cov != null && isFinite(cov) && cov !== s) add('coverage', w.mc, `Artículo ${art}: coverage ${cov} vs ${s} semanas`, cov, s, null, w.talla);
  });

  const findings = [...G.values()].map((g) => ({ ...g, detalle: `${g.detalle}${g.tallas.size ? ` · Tallas ${lista(g.tallas)}` : ''}${g.centros.size ? ` · ${g.centros.size} centros: ${lista(g.centros)}` : ''}` }));
  return { findings, fixes, W };
}

function checkOC(O, PW, cfg) {
  const F = [], c = O.cols;
  const add = (rule, where, detalle, actual, sugerido) => F.push({ rule, sev: OC_RULES[rule].sev, where, detalle, actual, sugerido });
  const L = O.rows.map((r) => ({ sku: String(r[c.sku]).trim(), tienda: ctr(r[c.tienda]), estilo: String(c.estilo != null ? r[c.estilo] : '').trim(), talla: String(c.talla != null ? r[c.talla] : '').trim(), oc: String(c.oc != null ? r[c.oc] : '').trim(), qty: num(r[c.qty]) || 0 }));
  // agrega por SKU×tienda
  const agg = new Map(); L.forEach((l) => { const k = `${l.sku}|${l.tienda}`; const a = agg.get(k) || { ...l, qty: 0 }; a.qty += l.qty; agg.set(k, a); });
  const A = [...agg.values()];
  // Param index
  const pIdx = new Map();
  if (PW) PW.forEach((w) => pIdx.set(`${w.art}|${w.centro}`, { min: w.act ? w.min : 0, max: w.act ? w.max : 0, estilo: w.mc, talla: w.talla }));
  A.forEach((a) => { const p = pIdx.get(`${a.sku}|${a.tienda}`); if (p) { a.estilo ||= p.estilo; a.talla ||= p.talla; } });
  // bajo mínimo / sin pedido
  if (PW) {
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
  return { findings: F, nSku: new Set(A.map((a) => a.sku)).size, nTiendas: new Set(A.map((a) => a.tienda)).size, pzas: A.reduce((s, a) => s + a.qty, 0) };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const downloadCSV = (name, aoa) => {
  const blob = new Blob(['﻿' + aoa.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
};

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function ModuleAllocation({ t, isDark, navIcon, navLabel, navDesc }) {
  const [tab, setTab] = useState('param');
  const [data, setData] = useState({});
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

  const pRes = useMemo(() => (data.param ? checkParams(data.param, data, cfg) : null), [data, cfg]);
  const ocRes = useMemo(() => (data.oc ? checkOC(data.oc, pRes?.W, cfg) : null), [data, cfg, pRes]);

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    if (!files.length) return;
    try {
      const next = { ...data }; const got = [];
      const LBL = { param: 'ZO9_DM', oc: 'OC', cat: 'Catálogo', base: 'BASE', clima: 'Matriz clima', compra: 'Compra mes', mara: 'ZO9_MARA', fechas: 'Fechas O9' };
      for (const f of files) { const r = await parseFile(f); Object.keys(r).forEach((k) => { next[k] = r[k]; got.push(r[k].rows ? `${LBL[k]} ${r[k].rows.length.toLocaleString('es-MX')} filas` : LBL[k]); }); }
      if (!got.length) { setMsg({ ok: false, text: 'No encontré hojas válidas (ZO9_DM, CATALOGO, BASE, MATRIZ CLIMA, COMPRA_MES, ZO9_MARA, BASE_FECHAS o una OC con SKU/CENTRO/CANTIDAD).' }); return; }
      const falta = next.param ? ['cat', 'base', 'clima', 'compra', 'fechas', 'mara'].filter((k) => !next[k]).map((k) => LBL[k]) : [];
      if (falta.length) got.push(`Faltan: ${falta.join(', ')} (esas reglas no corren)`);
      setData(next); await idbSet('data', next);
      setMsg({ ok: true, text: got.join(' · ') });
      if (!next.param && next.oc) setTab('oc');
    } catch (err) { setMsg({ ok: false, text: `Error leyendo Excel: ${err.message}` }); }
  };
  const clearAll = async () => { if (!confirm('¿Borrar parametrizaciones y OC cargadas?')) return; const e = {}; setData(e); await idbSet('data', e); };

  const exportCorrected = () => {
    const P = data.param, { fixes } = pRes, c = P.cols;
    // Solo filas que cambian, en el layout de ZO9_DM, listas para volver a parametrizar
    const aoa = [[...P.header, 'CAMBIOS']];
    P.rows.forEach((r, i) => {
      const row = [...r], ch = [];
      Object.entries(fixes[i]).forEach(([k, v]) => { if (c[k] != null && String(r[c[k]] ?? '') !== String(v)) { ch.push(`${P.header[c[k]]} ${r[c[k]] === '' ? '∅' : r[c[k]]}→${v === '' ? '∅' : v}`); row[c[k]] = v; } });
      if (ch.length) aoa.push([...row, ch.join('; ')]);
    });
    if (aoa.length === 1) { setMsg({ ok: true, text: 'Sin cambios que exportar.' }); return; }
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
  const nAct = pRes ? pRes.W.filter((w) => w.act).length : 0;

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
    ['curvaPts', 'Desv. curva (pts)'], ['plazo', 'Plazo ent. esperado (vacío = moda)', 'text'],
    ['picoX', 'OC: pico vs mediana (×)'], ['concTop', 'OC: % tiendas top'], ['concShare', 'OC: % pzas máx top'], ['coreTalla', 'OC: talla central ≥ %'],
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
          <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Clima
            <select value={cfg.climaMes ? 'mes' : 'gen'} onChange={(e) => setCfg((s) => ({ ...s, climaMes: e.target.value === 'mes' }))} className={`mt-1 w-full ${inCls}`} style={isDark ? { colorScheme: 'dark', backgroundColor: '#241e29' } : undefined}>
              <option value="mes">Clima del mes de inicio de temporada</option><option value="gen">Clima general</option>
            </select>
          </label>
          {CFG_FIELDS.map(([k, l, tp]) => (
            <label key={k} className={`text-[10px] font-bold uppercase ${t.textMuted}`}>{l}
              <input type={tp || 'number'} step="0.05" value={cfg[k]} onChange={(e) => setCfg((s) => ({ ...s, [k]: tp ? e.target.value.trim() : +e.target.value || 0 }))} className={`mt-1 w-full ${inCls}`} />
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
            {tab === 'param' ? 'El libro de Validación Parametrizaciones con ZO9_DM, CATALOGO, BASE, MATRIZ CLIMA, COMPRA_MES, ZO9_MARA y BASE_FECHAS pegados. No hace falta correr fórmulas.' : 'Columnas: SKU / Var. Ind., CENTRO, CANTIDAD · opcional OC. Se cruza con la parametrización corregida.'}
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
              tab === 'param' ? ['Modelos-color', fmt(new Set(pRes.W.map((w) => w.mc)).size), t.text] : ['SKUs', fmt(ocRes.nSku), t.text],
              tab === 'param' ? ['Filas activas (corregido)', fmt(nAct), t.text] : ['Tiendas', fmt(ocRes.nTiendas), t.text],
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

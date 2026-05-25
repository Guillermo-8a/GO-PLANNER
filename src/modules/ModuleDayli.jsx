import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Icons from '../utils/icons';
import { useGlobal } from '../context/GlobalContext';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine
} from 'recharts';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
     .map(c => c.replace(/^"|"$/g, '').trim());

const num = v => parseFloat(String(v || '0').replace(/[^0-9.-]+/g, '')) || 0;

const fmt = (n, dec = 0) =>
  n == null ? '-' : n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtMXN = (n, dec = 0) =>
  n == null ? '-' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPct = (n, dec = 1) =>
  n == null ? '-' : n.toFixed(dec) + '%';

const delta = (curr, prev) => prev && prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null;

const semaforo = (pct, thresholdGood = 0, thresholdWarn = -5) => {
  if (pct == null) return 'text-gray-400';
  if (pct >= thresholdGood) return 'text-emerald-400';
  if (pct >= thresholdWarn) return 'text-amber-400';
  return 'text-red-400';
};

const semaforoMG = (mg) => {
  if (mg == null) return 'text-gray-400';
  if (mg >= 45) return 'text-emerald-400';
  if (mg >= 35) return 'text-amber-400';
  return 'text-red-400';
};

const downloadExcel = (rows, filename) => {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

const parseDate = (s) => {
  if (!s) return null;
  // Supports DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
  const clean = s.trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    d = new Date(clean.slice(0, 10));
  } else {
    const parts = clean.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) d = new Date(`${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`);
      else d = new Date(`${c.length === 4 ? c : '20' + c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`);
    }
  }
  return d && !isNaN(d) ? d : null;
};

const fmtDate = (d) => {
  if (!d) return '';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ─── MINI COMPONENTS ────────────────────────────────────────────────────────

const DeltaBadge = ({ value, suffix = '%', invert = false }) => {
  if (value == null) return <span className="text-gray-400 text-[10px]">N/D</span>;
  const positive = invert ? value < 0 : value >= 0;
  const color = positive ? 'text-emerald-400' : 'text-red-400';
  const arrow = positive ? '▲' : '▼';
  return (
    <span className={`text-[10px] font-black ${color}`}>
      {arrow} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
};

const SemaforoCircle = ({ ok }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${ok === true ? 'bg-emerald-400' : ok === false ? 'bg-red-400' : 'bg-amber-400'}`} />
);

const MiniBar = ({ value, max, color = 'bg-emerald-500', height = 'h-1.5', isDark }) => (
  <div className={`w-full ${height} rounded-full ${isDark ? 'bg-zinc-700/40' : 'bg-gray-200'} overflow-hidden`}>
    <div className={`${height} rounded-full ${color} transition-all duration-500`}
      style={{ width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%` }} />
  </div>
);

const EmptyState = ({ icon: Icon, title, sub, t }) => (
  <div className={`p-12 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
    <Icon size={36} className="text-gray-400 mb-3" />
    <p className={`text-sm font-bold ${t.textMain}`}>{title}</p>
    <p className={`text-xs mt-1 ${t.textMuted}`}>{sub}</p>
  </div>
);

// ─── CSV PARSERS ─────────────────────────────────────────────────────────────

const parseSalesCSV = (text) => {
  const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const rows = text.split('\n').map(r => parseCSVRow(r, sep));
  if (rows.length < 2) return [];

  const H = rows[0].map(h => h.toUpperCase().trim().replace(/\s+/g, '_').replace(/[#ÁÉÍÓÚáéíóú]/g, c =>
    ({ '#': 'NUM', Á:'A', É:'E', Í:'I', Ó:'O', Ú:'U', á:'A', é:'E', í:'I', ó:'O', ú:'U' }[c] || c)
  ));

  const idx = (...names) => names.map(n => H.findIndex(h => h === n || h.includes(n))).find(i => i >= 0) ?? -1;

  const iDiv     = idx('DIVISION', 'DIV');
  const iSec     = idx('SECCION', 'SECTION', 'SEC');
  const iNumSec  = idx('NUM_SECCION', '_SECCION', 'NUMSEC');
  const iMarca   = idx('MARCA', 'PROVEEDOR', 'BRAND');
  const iCanal   = idx('CANAL', 'CHANNEL', 'CANAL_VENTA');
  const iFecha   = idx('FECHA', 'DATE', 'DIA');
  const iVentaP  = idx('VENTA_', 'VENTA$', 'VENTA_PESOS', 'VENTAS');
  const iVentaU  = idx('VENTA_U', 'UNIDADES', 'PIEZAS', 'PZS');
  const iMG      = idx('MG', 'MARGEN', 'MG_', 'MARGIN');
  const iUtil    = idx('UTILIDAD', 'UTIL', 'GANANCIA');
  const iMD      = idx('MARKDOWN', 'DESCUENTO', 'MD');

  const extracted = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => !c)) continue;
    const fecha = iFecha >= 0 ? parseDate(r[iFecha]) : null;
    const ventaP = num(iVentaP >= 0 ? r[iVentaP] : 0);
    if (!ventaP && !fecha) continue;
    extracted.push({
      division: iDiv    >= 0 ? r[iDiv].trim().toUpperCase()   : 'GENERAL',
      seccion:  iSec    >= 0 ? r[iSec].trim().toUpperCase()   : 'GENERAL',
      numSec:   iNumSec >= 0 ? r[iNumSec].trim()              : '',
      marca:    iMarca  >= 0 ? r[iMarca].trim().toUpperCase() : 'SIN MARCA',
      canal:    iCanal  >= 0 ? r[iCanal].trim().toUpperCase() : 'SIN CANAL',
      fecha,
      ventaP,
      ventaU:   num(iVentaU >= 0 ? r[iVentaU] : 0),
      mg:       num(iMG     >= 0 ? r[iMG]     : 0),
      utilidad: num(iUtil   >= 0 ? r[iUtil]   : 0),
      markdown: num(iMD     >= 0 ? r[iMD]     : 0),
    });
  }
  return extracted;
};

const parseInventoryCSV = (text) => {
  const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const rows = text.split('\n').map(r => parseCSVRow(r, sep));
  if (rows.length < 2) return [];

  const H = rows[0].map(h => h.toUpperCase().trim().replace(/\s+/g, '_'));
  const idx = (...names) => names.map(n => H.findIndex(h => h === n || h.includes(n))).find(i => i >= 0) ?? -1;

  const iDiv    = idx('DIVISION', 'DIV');
  const iSec    = idx('SECCION', 'SEC');
  const iMarca  = idx('MARCA', 'PROVEEDOR');
  const iCanal  = idx('CANAL', 'CHANNEL');
  const iCosto  = idx('COSTO_VENDIDO', 'COSTO', 'CMV', 'COSTO_MERCIA');
  const iUtilV  = idx('UTILIDAD_VENDIDA', 'UTIL_VENDIDA', 'UTILIDAD');
  const iOH     = idx('OH', 'ON_HAND', 'INVENTARIO', 'STOCK');
  const iOO     = idx('OO', 'ON_ORDER', 'PEDIDO', 'COMPRA');
  const iCompra = idx('COMPRADO', 'COMPRA_TOTAL', 'TOTAL_COMPRA');
  const iNac    = idx('NACIONAL', 'NAC', 'LOCAL');
  const iImp    = idx('IMPORTACION', 'IMP', 'IMPORT');
  const iST     = idx('SELL_THROUGH', 'ST', 'SELL_THRU');
  const iVenta  = idx('VENTA', 'VENTAS', 'VENTA_');

  const extracted = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => !c)) continue;
    const oh = num(iOH >= 0 ? r[iOH] : 0);
    if (!oh && !(iCosto >= 0 && r[iCosto])) continue;
    extracted.push({
      division:    iDiv   >= 0 ? r[iDiv].trim().toUpperCase()   : 'GENERAL',
      seccion:     iSec   >= 0 ? r[iSec].trim().toUpperCase()   : 'GENERAL',
      marca:       iMarca >= 0 ? r[iMarca].trim().toUpperCase() : 'SIN MARCA',
      canal:       iCanal >= 0 ? r[iCanal].trim().toUpperCase() : 'SIN CANAL',
      costoVendido: num(iCosto >= 0 ? r[iCosto] : 0),
      utilidadVendida: num(iUtilV >= 0 ? r[iUtilV] : 0),
      oh,
      oo:          num(iOO    >= 0 ? r[iOO]    : 0),
      comprado:    num(iCompra >= 0 ? r[iCompra] : 0),
      nacional:    num(iNac   >= 0 ? r[iNac]   : 0),
      importacion: num(iImp   >= 0 ? r[iImp]   : 0),
      sellThrough: num(iST    >= 0 ? r[iST]    : 0),
      ventaRef:    num(iVenta >= 0 ? r[iVenta] : 0),
    });
  }
  return extracted;
};

// ─── LINEAR REGRESSION ───────────────────────────────────────────────────────

const linearRegression = (points) => {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - yMean, 2), 0);
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2: Math.max(0, r2) };
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function ModuleDaily() {
  const gState = useGlobal();
  const theme  = gState?.theme || 'light';
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState(0);

  // ── Tema ──────────────────────────────────────────────────────────────
  const themes = {
    dark: {
      appBg:      'bg-transparent text-gray-100',
      card:       'bg-zinc-900 border-zinc-800 shadow-sm',
      cardInner:  'bg-zinc-950 border-zinc-800',
      textMain:   'text-white',
      textMuted:  'text-gray-400',
      textAccent1:'text-emerald-400',
      textAccent2:'text-teal-400',
      border:     'border-zinc-800',
      input:      'bg-zinc-950 border-zinc-700 text-white focus:ring-emerald-500',
      btnPrimary: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]',
      btnSecondary:'bg-teal-700 text-white hover:bg-teal-600',
      btnGhost:   'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      tabActive:  'border-emerald-500 text-emerald-400',
      badge:      'bg-emerald-900/30 text-emerald-400 border-emerald-500/40',
      badgeTeal:  'bg-teal-900/30 text-teal-400 border-teal-500/40',
      badgeAmber: 'bg-amber-900/30 text-amber-400 border-amber-500/40',
      badgeRed:   'bg-red-900/30 text-red-400 border-red-500/40',
    },
    light: {
      appBg:      'bg-transparent text-gray-800',
      card:       'bg-white border-gray-200 shadow-sm',
      cardInner:  'bg-gray-50 border-gray-200',
      textMain:   'text-gray-900',
      textMuted:  'text-gray-500',
      textAccent1:'text-emerald-600',
      textAccent2:'text-teal-600',
      border:     'border-gray-200',
      input:      'bg-white border-gray-300 text-gray-900 focus:ring-emerald-500',
      btnPrimary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md',
      btnSecondary:'bg-teal-600 text-white hover:bg-teal-700 shadow-md',
      btnGhost:   'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      tabActive:  'border-emerald-500 text-emerald-600',
      badge:      'bg-emerald-50 text-emerald-700 border-emerald-200',
      badgeTeal:  'bg-teal-50 text-teal-700 border-teal-200',
      badgeAmber: 'bg-amber-50 text-amber-700 border-amber-200',
      badgeRed:   'bg-red-50 text-red-700 border-red-200',
    },
  };
  const t = themes[theme] || themes.light;

  // ── Refs ──────────────────────────────────────────────────────────────
  const salesInputRef = useRef(null);
  const invInputRef   = useRef(null);
  const salesLYInputRef = useRef(null);

  // ── Data state ────────────────────────────────────────────────────────
  const [salesData,   setSalesData]   = useState([]); // TY
  const [salesLYData, setSalesLYData] = useState([]); // LY
  const [invData,     setInvData]     = useState([]);

  // ── Filters ───────────────────────────────────────────────────────────
  const [fFecha,    setFFecha]    = useState('');   // YYYY-MM-DD max date filter
  const [fCanal,    setFCanal]    = useState('ALL');
  const [fDiv,      setFDiv]      = useState('ALL');
  const [fSec,      setFSec]      = useState('ALL');
  const [fMarca,    setFMarca]    = useState('ALL');

  // ── LY offset (días) ─────────────────────────────────────────────────
  const [lyOffset, setLyOffset] = useState(364); // 52 semanas por default

  // ─────────────────────────────────────────────────────────────────────
  // PERSISTENCIA
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_daily');
      if (s) {
        const d = JSON.parse(s);
        // Re-parse dates
        if (d.salesData?.length)   setSalesData(d.salesData.map(r => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null })));
        if (d.salesLYData?.length) setSalesLYData(d.salesLYData.map(r => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null })));
        if (d.invData?.length)     setInvData(d.invData);
        if (d.fFecha)  setFFecha(d.fFecha);
        if (d.fCanal)  setFCanal(d.fCanal);
        if (d.fDiv)    setFDiv(d.fDiv);
        if (d.fSec)    setFSec(d.fSec);
        if (d.fMarca)  setFMarca(d.fMarca);
        if (d.lyOffset) setLyOffset(d.lyOffset);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const payload = { salesData, salesLYData, invData, fFecha, fCanal, fDiv, fSec, fMarca, lyOffset };
      localStorage.setItem('gop_daily', JSON.stringify(payload));
    } catch {}
  }, [salesData, salesLYData, invData, fFecha, fCanal, fDiv, fSec, fMarca, lyOffset]);

  // ─────────────────────────────────────────────────────────────────────
  // CSV UPLOAD HANDLERS
  // ─────────────────────────────────────────────────────────────────────
  const handleSalesUpload = (e, isLY = false) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseSalesCSV(ev.target.result);
      if (isLY) setSalesLYData(rows);
      else setSalesData(rows);
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleInvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setInvData(parseInventoryCSV(ev.target.result));
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  // ─────────────────────────────────────────────────────────────────────
  // FILTER HELPERS
  // ─────────────────────────────────────────────────────────────────────
  const applyFilters = useCallback((rows) =>
    rows.filter(r =>
      (fCanal === 'ALL' || r.canal === fCanal) &&
      (fDiv   === 'ALL' || r.division === fDiv) &&
      (fSec   === 'ALL' || r.seccion === fSec) &&
      (fMarca === 'ALL' || r.marca === fMarca) &&
      (!fFecha || !r.fecha || r.fecha <= new Date(fFecha + 'T23:59:59'))
    ), [fCanal, fDiv, fSec, fMarca, fFecha]);

  const filteredSales = useMemo(() => applyFilters(salesData),   [salesData, applyFilters]);
  const filteredInv   = useMemo(() => applyFilters(invData),     [invData, applyFilters]);

  // LY: shift TY date by lyOffset days to find equivalent LY date
  const filteredLY = useMemo(() => {
    const base = applyFilters(salesLYData.length ? salesLYData : []);
    return base;
  }, [salesLYData, applyFilters]);

  // Opciones de filtro
  const opts = useMemo(() => {
    const all = salesData.concat(salesLYData);
    const set = (key) => ['ALL', ...new Set(all.map(r => r[key]).filter(Boolean)).values()].sort();
    return {
      canal: set('canal'), div: set('division'), sec: set('seccion'), marca: set('marca'),
    };
  }, [salesData, salesLYData]);

  // ─────────────────────────────────────────────────────────────────────
  // AGGREGATES
  // ─────────────────────────────────────────────────────────────────────
  const agg = useCallback((rows) => {
    const ventaP   = rows.reduce((s, r) => s + r.ventaP,   0);
    const ventaU   = rows.reduce((s, r) => s + r.ventaU,   0);
    const utilidad = rows.reduce((s, r) => s + r.utilidad, 0);
    const markdown = rows.reduce((s, r) => s + r.markdown, 0);
    const mgPct    = ventaP > 0 ? (utilidad / ventaP) * 100 : 0;
    const atv      = ventaP > 0 && ventaU > 0 ? ventaP / (ventaU > 0 ? ventaU : 1) : 0;
    return { ventaP, ventaU, utilidad, markdown, mgPct, atv };
  }, []);

  const kpiTY  = useMemo(() => agg(filteredSales), [filteredSales, agg]);
  const kpiLY  = useMemo(() => agg(filteredLY),    [filteredLY, agg]);

  // Último día en TY
  const lastDateTY = useMemo(() => {
    const dates = filteredSales.map(r => r.fecha).filter(Boolean);
    return dates.length ? new Date(Math.max(...dates)) : null;
  }, [filteredSales]);

  // Día TY vs LY equivalente
  const kpiDayTY = useMemo(() => {
    if (!lastDateTY) return agg([]);
    return agg(filteredSales.filter(r => r.fecha && r.fecha.toDateString() === lastDateTY.toDateString()));
  }, [filteredSales, lastDateTY, agg]);

  const kpiDayLY = useMemo(() => {
    if (!lastDateTY) return agg([]);
    const lyDate = new Date(lastDateTY);
    lyDate.setDate(lyDate.getDate() - lyOffset);
    return agg(filteredLY.filter(r => r.fecha && r.fecha.toDateString() === lyDate.toDateString()));
  }, [filteredLY, lastDateTY, lyOffset, agg]);

  // Forecast de cierre de mes
  const forecastMes = useMemo(() => {
    if (!filteredSales.length) return null;
    const now = lastDateTY || new Date();
    const diaActual = now.getDate();
    const diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const diasRestantes = diasMes - diaActual;

    const runRate = diaActual > 0 ? kpiTY.ventaP / diaActual : 0;
    const runRateU = diaActual > 0 ? kpiTY.ventaU / diaActual : 0;

    // Tendencia reciente (últimos 7 días)
    const recientes = filteredSales
      .filter(r => r.fecha && r.fecha >= new Date(now.getTime() - 7 * 86400000))
      .reduce((s, r) => ({ ventaP: s.ventaP + r.ventaP, ventaU: s.ventaU + r.ventaU, n: s.n + 1 }), { ventaP: 0, ventaU: 0, n: 0 });
    const rr7 = recientes.n > 0 ? recientes.ventaP / recientes.n : runRate;

    // LY mes completo
    const lyMesCompleto = filteredLY.filter(r => {
      if (!r.fecha) return false;
      const lyRef = new Date(now);
      lyRef.setFullYear(lyRef.getFullYear() - 1);
      return r.fecha.getMonth() === lyRef.getMonth() && r.fecha.getFullYear() === lyRef.getFullYear();
    }).reduce((s, r) => s + r.ventaP, 0);

    const crecimientoLY = lyMesCompleto > 0 && kpiTY.ventaP > 0
      ? (kpiTY.ventaP / (lyMesCompleto * (diaActual / diasMes))) - 1 : 0;

    const conservador = kpiTY.ventaP + runRate * diasRestantes * 0.85;
    const neutral     = kpiTY.ventaP + rr7 * diasRestantes;
    const arriesgado  = kpiTY.ventaP + rr7 * diasRestantes * (1 + Math.max(0, crecimientoLY));

    const mgEst = (v) => v > 0 ? (kpiTY.utilidad + (v - kpiTY.ventaP) * (kpiTY.mgPct / 100)) : 0;

    return {
      diaActual, diasMes, diasRestantes, runRate, lyMesCompleto,
      conservador: { ventaP: conservador, ventaU: kpiTY.ventaU + runRateU * diasRestantes * 0.85, mg: mgEst(conservador) },
      neutral:     { ventaP: neutral,     ventaU: kpiTY.ventaU + rr7 / (runRate || 1) * runRateU * diasRestantes, mg: mgEst(neutral) },
      arriesgado:  { ventaP: arriesgado,  ventaU: kpiTY.ventaU + rr7 / (runRate || 1) * runRateU * diasRestantes * 1.1, mg: mgEst(arriesgado) },
    };
  }, [filteredSales, filteredLY, lastDateTY, kpiTY, kpiLY]);

  // Por canal, división, sección, marca
  const byKey = useCallback((rows, key) => {
    const map = {};
    rows.forEach(r => {
      const k = r[key] || 'N/D';
      if (!map[k]) map[k] = { key: k, ventaP: 0, ventaU: 0, utilidad: 0, markdown: 0 };
      map[k].ventaP   += r.ventaP;
      map[k].ventaU   += r.ventaU;
      map[k].utilidad += r.utilidad;
      map[k].markdown += r.markdown;
    });
    return Object.values(map).map(g => ({
      ...g,
      mgPct: g.ventaP > 0 ? (g.utilidad / g.ventaP) * 100 : 0,
    })).sort((a, b) => b.ventaP - a.ventaP);
  }, []);

  const byCanal   = useMemo(() => byKey(filteredSales, 'canal'),    [filteredSales, byKey]);
  const byDiv     = useMemo(() => byKey(filteredSales, 'division'), [filteredSales, byKey]);
  const bySec     = useMemo(() => byKey(filteredSales, 'seccion'),  [filteredSales, byKey]);
  const byMarca   = useMemo(() => byKey(filteredSales, 'marca'),    [filteredSales, byKey]);

  const mejorCanal = byCanal[0]?.key || 'N/D';
  const peorCanal  = byCanal[byCanal.length - 1]?.key || 'N/D';
  const mejorMarca = byMarca[0]?.key || 'N/D';

  // Serie diaria TY y LY (para gráficas)
  const serieDiaria = useMemo(() => {
    const map = {};
    filteredSales.forEach(r => {
      if (!r.fecha) return;
      const k = r.fecha.toISOString().slice(0, 10);
      if (!map[k]) map[k] = { fecha: k, ty: 0, tyU: 0 };
      map[k].ty  += r.ventaP;
      map[k].tyU += r.ventaU;
    });
    // LY: align by lyOffset days
    filteredLY.forEach(r => {
      if (!r.fecha) return;
      const shifted = new Date(r.fecha.getTime() + lyOffset * 86400000);
      const k = shifted.toISOString().slice(0, 10);
      if (!map[k]) map[k] = { fecha: k, ty: 0, tyU: 0 };
      map[k].ly  = (map[k].ly || 0) + r.ventaP;
      map[k].lyU = (map[k].lyU || 0) + r.ventaU;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filteredSales, filteredLY, lyOffset]);

  // Heatmap: día semana × semana mes
  const heatmapData = useMemo(() => {
    const dow = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const map = {};
    filteredSales.forEach(r => {
      if (!r.fecha) return;
      const d = r.fecha.getDay();
      const w = Math.floor((r.fecha.getDate() - 1) / 7) + 1;
      const k = `${d}-${w}`;
      if (!map[k]) map[k] = { dow: d, week: w, label: dow[d], ventaP: 0, count: 0 };
      map[k].ventaP += r.ventaP;
      map[k].count  += 1;
    });
    return Object.values(map);
  }, [filteredSales]);

  // Inventario KPIs
  const invKPI = useMemo(() => {
    const oh          = filteredInv.reduce((s, r) => s + r.oh,          0);
    const oo          = filteredInv.reduce((s, r) => s + r.oo,          0);
    const costoV      = filteredInv.reduce((s, r) => s + r.costoVendido, 0);
    const utilV       = filteredInv.reduce((s, r) => s + r.utilidadVendida, 0);
    const comprado    = filteredInv.reduce((s, r) => s + r.comprado,    0);
    const nacional    = filteredInv.reduce((s, r) => s + r.nacional,    0);
    const importacion = filteredInv.reduce((s, r) => s + r.importacion, 0);
    const ventaRef    = filteredInv.reduce((s, r) => s + r.ventaRef,    0) || kpiTY.ventaP;

    const sellThrough = (oh + ventaRef) > 0 ? ventaRef / (oh + ventaRef) * 100 : 0;
    const cobertura   = kpiTY.ventaP > 0 && lastDateTY
      ? oh / (kpiTY.ventaP / lastDateTY.getDate()) : 0;

    return { oh, oo, total: oh + oo, costoV, utilV, comprado, nacional, importacion, sellThrough, cobertura };
  }, [filteredInv, kpiTY, lastDateTY]);

  // Scatter data: venta vs OH+OO por marca
  const scatterData = useMemo(() => {
    const salesMap = {};
    filteredSales.forEach(r => {
      const k = r.marca;
      if (!salesMap[k]) salesMap[k] = { ventaP: 0, ventaU: 0 };
      salesMap[k].ventaP += r.ventaP;
      salesMap[k].ventaU += r.ventaU;
    });
    const invMap = {};
    filteredInv.forEach(r => {
      const k = r.marca;
      if (!invMap[k]) invMap[k] = { oh: 0, oo: 0 };
      invMap[k].oh += r.oh;
      invMap[k].oo += r.oo;
    });
    return Object.keys({ ...salesMap, ...invMap }).map(k => ({
      name: k,
      x: salesMap[k]?.ventaP || 0,
      y: (invMap[k]?.oh || 0) + (invMap[k]?.oo || 0),
    })).filter(p => p.x > 0 || p.y > 0);
  }, [filteredSales, filteredInv]);

  const scatterRegression = useMemo(() => {
    if (scatterData.length < 3) return null;
    return linearRegression(scatterData);
  }, [scatterData]);

  // ─────────────────────────────────────────────────────────────────────
  // CHART COLORS
  // ─────────────────────────────────────────────────────────────────────
  const COLORS = ['#10b981','#14b8a6','#f59e0b','#60a5fa','#a78bfa','#f87171','#e879f9'];
  const gridColor = isDark ? '#27272a' : '#f0f0f0';
  const axisColor = isDark ? '#52525b' : '#d1d5db';
  const textColor = isDark ? '#a1a1aa' : '#6b7280';

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>
        <p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {fmtMXN(p.value)}</p>
        ))}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────
  // FILTER BAR COMPONENT
  // ─────────────────────────────────────────────────────────────────────
  const FilterBar = () => (
    <div className={`flex flex-wrap gap-2 p-4 rounded-xl border ${t.cardInner}`}>
      <span className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} flex items-center`}>Filtros</span>
      <input
        type="date"
        value={fFecha}
        onChange={e => setFFecha(e.target.value)}
        className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}
        placeholder="Hasta fecha"
      />
      {[
        { label: 'Canal', val: fCanal, set: setFCanal, ops: opts.canal },
        { label: 'División', val: fDiv, set: setFDiv, ops: opts.div },
        { label: 'Sección', val: fSec, set: setFSec, ops: opts.sec },
        { label: 'Marca', val: fMarca, set: setFMarca, ops: opts.marca },
      ].map(({ label, val, set, ops }) => (
        <select key={label} value={val} onChange={e => set(e.target.value)}
          className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
          {ops.map(o => <option key={o} value={o}>{o === 'ALL' ? `Todos (${label})` : o}</option>)}
        </select>
      ))}
      {(fCanal !== 'ALL' || fDiv !== 'ALL' || fSec !== 'ALL' || fMarca !== 'ALL' || fFecha) && (
        <button onClick={() => { setFCanal('ALL'); setFDiv('ALL'); setFSec('ALL'); setFMarca('ALL'); setFFecha(''); }}
          className={`text-xs px-3 py-1.5 rounded-lg border font-bold transition-all ${t.btnGhost}`}>
          ✕ Limpiar
        </button>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // TAB STYLE
  // ─────────────────────────────────────────────────────────────────────
  const tabStyle = (n) =>
    `px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
      activeTab === n ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`
    }`;

  // ─────────────────────────────────────────────────────────────────────
  // KPI CARD COMPONENT
  // ─────────────────────────────────────────────────────────────────────
  const KPICard = ({ label, value, sub, deltaVal, icon: Icon, accent, badge }) => (
    <div className={`p-4 rounded-xl border ${t.cardInner} flex flex-col gap-1 relative overflow-hidden`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>{label}</span>
        {Icon && <Icon size={14} className={accent || t.textAccent1} />}
      </div>
      <div className={`text-xl font-black ${accent || t.textMain}`}>{value}</div>
      {sub && <div className={`text-[10px] ${t.textMuted}`}>{sub}</div>}
      {deltaVal != null && <DeltaBadge value={deltaVal} />}
      {badge && (
        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black border ${
          badge === 'ok' ? t.badge : badge === 'warn' ? t.badgeAmber : t.badgeRed
        }`}>{badge === 'ok' ? '✓' : badge === 'warn' ? '~' : '!'}</span>
      )}
    </div>
  );

  const hasNoData = !salesData.length;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>

      {/* ── HEADER ── */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-50'}`}>
                <Icons.BarChart2 size={22} className={t.textAccent1} />
              </span>
              Daily
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>
              Desempeño diario · Venta, margen e inventario
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* CSV Ventas TY */}
            <input ref={salesInputRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={e => handleSalesUpload(e, false)} />
            <button onClick={() => salesInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14} /> CSV Ventas TY
            </button>

            {/* CSV Ventas LY */}
            <input ref={salesLYInputRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={e => handleSalesUpload(e, true)} />
            <button onClick={() => salesLYInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14} /> CSV Ventas LY
            </button>

            {/* CSV Inventario */}
            <input ref={invInputRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={handleInvUpload} />
            <button onClick={() => invInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Package size={14} /> CSV Inventario
            </button>

            {/* Badges */}
            {salesData.length > 0 && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>
                TY: {salesData.length.toLocaleString()} filas
              </span>
            )}
            {salesLYData.length > 0 && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeTeal}`}>
                LY: {salesLYData.length.toLocaleString()} filas
              </span>
            )}
            {invData.length > 0 && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeAmber}`}>
                Inv: {invData.length.toLocaleString()} filas
              </span>
            )}

            {/* Clear data */}
            {(salesData.length || salesLYData.length || invData.length) > 0 && (
              <button onClick={() => { if(window.confirm('¿Borrar todos los datos cargados?')) { setSalesData([]); setSalesLYData([]); setInvData([]); localStorage.removeItem('gop_daily'); }}}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost} opacity-50 hover:opacity-100`}>
                <Icons.Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
        <div className={`flex border-b ${t.border} px-2 overflow-x-auto`}>
          <button className={tabStyle(0)} onClick={() => setActiveTab(0)}>📊 Dashboard</button>
          <button className={tabStyle(1)} onClick={() => setActiveTab(1)}>📈 Sales Daily</button>
          <button className={tabStyle(2)} onClick={() => setActiveTab(2)}>📦 Inventory & Buying</button>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB 0 — DASHBOARD
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 0 && (
          <div className="p-5 space-y-5">

            {hasNoData ? (
              <EmptyState icon={Icons.BarChart2} t={t}
                title="Sin datos cargados"
                sub="Carga el CSV de ventas TY desde el encabezado para comenzar." />
            ) : (
              <>
                {/* LY offset config */}
                <div className={`flex items-center gap-4 p-3 rounded-xl border ${t.cardInner} flex-wrap`}>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>Offset LY</span>
                  <input type="number" min={350} max={380} value={lyOffset}
                    onChange={e => setLyOffset(Number(e.target.value))}
                    className={`w-20 text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                  <span className={`text-[10px] ${t.textMuted}`}>días hacia atrás para comparar LY (default 364 = 52 semanas)</span>
                  {lastDateTY && (
                    <span className={`text-[10px] ${t.textMuted} ml-auto`}>
                      Último día TY: <strong className={t.textMain}>{fmtDate(lastDateTY)}</strong>
                    </span>
                  )}
                </div>

                {/* ── ROW 1: KPIs ACUMULADOS ── */}
                <div>
                  <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>KPIs Acumulados</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard label="Venta Acumulada TY" value={fmtMXN(kpiTY.ventaP)}
                      sub={`${fmt(kpiTY.ventaU)} pzs`}
                      deltaVal={delta(kpiTY.ventaP, kpiLY.ventaP)}
                      icon={Icons.TrendingUp} accent="text-emerald-400"
                      badge={delta(kpiTY.ventaP, kpiLY.ventaP) >= 0 ? 'ok' : delta(kpiTY.ventaP, kpiLY.ventaP) >= -5 ? 'warn' : 'bad'} />
                    <KPICard label="Venta Acumulada LY" value={fmtMXN(kpiLY.ventaP)}
                      sub={`${fmt(kpiLY.ventaU)} pzs`}
                      icon={Icons.Calendar} accent={t.textMuted} />
                    <KPICard label="MG Acumulado" value={fmtPct(kpiTY.mgPct)}
                      sub={fmtMXN(kpiTY.utilidad) + ' utilidad'}
                      icon={Icons.Percent} accent={semaforoMG(kpiTY.mgPct)} />
                    <KPICard label="Markdowns Acumulados" value={fmtMXN(kpiTY.markdown)}
                      sub={kpiTY.ventaP > 0 ? `${((kpiTY.markdown / kpiTY.ventaP) * 100).toFixed(1)}% de venta` : '–'}
                      icon={Icons.Tag} accent="text-amber-400" />
                  </div>
                </div>

                {/* ── ROW 2: KPIs DÍA ── */}
                <div>
                  <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Último Día</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard label="Venta Día TY" value={fmtMXN(kpiDayTY.ventaP)}
                      sub={`${fmt(kpiDayTY.ventaU)} pzs`}
                      deltaVal={delta(kpiDayTY.ventaP, kpiDayLY.ventaP)}
                      icon={Icons.Zap} accent="text-emerald-400" />
                    <KPICard label="Venta Día LY" value={fmtMXN(kpiDayLY.ventaP)}
                      sub={`${fmt(kpiDayLY.ventaU)} pzs`}
                      icon={Icons.Calendar} accent={t.textMuted} />
                    <KPICard label="MG Día" value={fmtPct(kpiDayTY.mgPct)}
                      icon={Icons.Percent} accent={semaforoMG(kpiDayTY.mgPct)} />
                    <KPICard label="ATV Día" value={fmtMXN(kpiDayTY.atv, 0)}
                      sub="por transacción"
                      icon={Icons.ShoppingBag} accent="text-teal-400" />
                  </div>
                </div>

                {/* ── ROW 3: BEST/WORST + RIESGOS ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Mejor canal */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Canales</h4>
                    <div className="space-y-2">
                      {byCanal.slice(0, 4).map((c, i) => {
                        const maxV = byCanal[0]?.ventaP || 1;
                        return (
                          <div key={c.key}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`text-xs font-bold ${t.textMain} flex items-center gap-1`}>
                                {i === 0 && <span className="text-emerald-400">★</span>}
                                {c.key}
                              </span>
                              <span className={`text-xs font-mono ${t.textAccent1}`}>{fmtMXN(c.ventaP)}</span>
                            </div>
                            <MiniBar value={c.ventaP} max={maxV} isDark={isDark} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-black ${t.badge}`}>Mejor: {mejorCanal}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-black ${t.badgeRed}`}>Peor: {peorCanal}</span>
                    </div>
                  </div>

                  {/* Mejor marca */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Top Marcas</h4>
                    <div className="space-y-2">
                      {byMarca.slice(0, 5).map((m, i) => {
                        const maxV = byMarca[0]?.ventaP || 1;
                        return (
                          <div key={m.key}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`text-xs font-bold ${t.textMain} truncate max-w-[100px]`} title={m.key}>
                                {i === 0 && '★ '}{m.key}
                              </span>
                              <span className={`text-xs font-mono ${t.textAccent1}`}>{fmtMXN(m.ventaP)}</span>
                            </div>
                            <MiniBar value={m.ventaP} max={maxV} color="bg-teal-500" isDark={isDark} />
                          </div>
                        );
                      })}
                    </div>
                    <p className={`mt-2 text-[9px] ${t.textMuted}`}>Mejor marca: <strong className={t.textAccent2}>{mejorMarca}</strong></p>
                  </div>

                  {/* Riesgos / semáforos */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Semáforos</h4>
                    <div className="space-y-2.5">
                      {[
                        {
                          label: 'Venta vs LY',
                          val: delta(kpiTY.ventaP, kpiLY.ventaP),
                          ok: delta(kpiTY.ventaP, kpiLY.ventaP) >= 0,
                          txt: delta(kpiTY.ventaP, kpiLY.ventaP) != null ? `${delta(kpiTY.ventaP, kpiLY.ventaP).toFixed(1)}%` : 'Sin LY'
                        },
                        {
                          label: 'MG vs benchmark 40%',
                          val: kpiTY.mgPct - 40,
                          ok: kpiTY.mgPct >= 40,
                          txt: fmtPct(kpiTY.mgPct)
                        },
                        {
                          label: 'Markdown ratio < 5%',
                          val: kpiTY.ventaP > 0 ? -(kpiTY.markdown / kpiTY.ventaP * 100 - 5) : null,
                          ok: kpiTY.ventaP > 0 ? kpiTY.markdown / kpiTY.ventaP < 0.05 : null,
                          txt: kpiTY.ventaP > 0 ? fmtPct(kpiTY.markdown / kpiTY.ventaP * 100) : 'N/D'
                        },
                        {
                          label: 'Día TY vs Día LY',
                          val: delta(kpiDayTY.ventaP, kpiDayLY.ventaP),
                          ok: delta(kpiDayTY.ventaP, kpiDayLY.ventaP) >= 0,
                          txt: delta(kpiDayTY.ventaP, kpiDayLY.ventaP) != null ? `${delta(kpiDayTY.ventaP, kpiDayLY.ventaP).toFixed(1)}%` : 'Sin LY'
                        },
                        {
                          label: 'Sell Through' ,
                          ok: invKPI.sellThrough >= 60,
                          val: invKPI.sellThrough - 60,
                          txt: invData.length ? fmtPct(invKPI.sellThrough) : 'Sin datos'
                        },
                      ].map(({ label, ok, txt }) => (
                        <div key={label} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <SemaforoCircle ok={ok} />
                            <span className={`text-xs ${t.textMuted}`}>{label}</span>
                          </div>
                          <span className={`text-xs font-black font-mono ${ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-amber-400'}`}>{txt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── ROW 4: GRÁFICA TENDENCIA ── */}
                {serieDiaria.length > 1 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>📈 Tendencia de Venta Diaria</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={serieDiaria} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => v?.slice(5)} />
                        <YAxis tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {salesLYData.length > 0 && (
                          <Line type="monotone" dataKey="ly" name="LY" stroke={axisColor}
                            dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                        )}
                        <Line type="monotone" dataKey="ty" name="TY" stroke="#10b981"
                          dot={false} strokeWidth={2.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── ROW 5: FORECAST CIERRE MES ── */}
                {forecastMes && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className={`text-sm font-bold ${t.textMain}`}>🎯 Forecast Cierre de Mes</h4>
                      <span className={`text-[9px] font-black uppercase ${t.textMuted}`}>
                        Día {forecastMes.diaActual} / {forecastMes.diasMes} · Quedan {forecastMes.diasRestantes} días
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { label: 'Conservador', icon: '🛡️', scenario: forecastMes.conservador, color: 'text-blue-400', barColor: 'bg-blue-400' },
                        { label: 'Neutral', icon: '⚖️', scenario: forecastMes.neutral, color: 'text-emerald-400', barColor: 'bg-emerald-400' },
                        { label: 'Arriesgado', icon: '🚀', scenario: forecastMes.arriesgado, color: 'text-amber-400', barColor: 'bg-amber-400' },
                      ].map(({ label, icon, scenario, color, barColor }) => (
                        <div key={label} className={`p-4 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'}`}>
                          <div className="flex items-center gap-2 mb-3">
                            <span>{icon}</span>
                            <span className={`text-xs font-black uppercase ${color}`}>{label}</span>
                          </div>
                          <div className={`text-2xl font-black ${color}`}>{fmtMXN(scenario.ventaP)}</div>
                          <div className={`text-[10px] ${t.textMuted} mt-0.5`}>{fmt(scenario.ventaU)} pzs</div>
                          <div className={`text-xs font-bold mt-2 ${semaforoMG((scenario.mg / scenario.ventaP) * 100)}`}>
                            MG est: {fmtPct((scenario.mg / scenario.ventaP) * 100)}
                          </div>
                          <div className="mt-3">
                            <MiniBar value={scenario.ventaP} max={forecastMes.arriesgado.ventaP * 1.1}
                              color={barColor} isDark={isDark} height="h-2" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className={`text-[9px] mt-3 ${t.textMuted}`}>
                      Run rate diario: {fmtMXN(forecastMes.runRate)} / día ·
                      {salesLYData.length > 0 && forecastMes.lyMesCompleto > 0
                        ? ` LY mes completo: ${fmtMXN(forecastMes.lyMesCompleto)}`
                        : ' Carga CSV LY para mejor forecast'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 1 — SALES DAILY
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 1 && (
          <div className="p-5 space-y-5">

            {hasNoData ? (
              <EmptyState icon={Icons.TrendingUp} t={t}
                title="Sin datos de ventas"
                sub="Carga el CSV de ventas TY desde el encabezado." />
            ) : (
              <>
                <FilterBar />

                {/* ── KPIs PRINCIPALES ── */}
                <div>
                  <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>KPIs del Período Filtrado</h3>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {[
                      { label: 'Venta $',    val: fmtMXN(kpiTY.ventaP), sub: null,              d: delta(kpiTY.ventaP, kpiLY.ventaP) },
                      { label: 'Venta PZS',  val: fmt(kpiTY.ventaU),    sub: null,              d: delta(kpiTY.ventaU, kpiLY.ventaU) },
                      { label: 'MG %',       val: fmtPct(kpiTY.mgPct), sub: null,              d: null },
                      { label: 'Markdowns',  val: fmtMXN(kpiTY.markdown), sub: null,           d: null },
                      { label: 'Utilidad',   val: fmtMXN(kpiTY.utilidad), sub: null,           d: null },
                      { label: 'ATV',        val: fmtMXN(kpiTY.atv),     sub: 'por tx',        d: null },
                    ].map(({ label, val, sub, d }) => (
                      <div key={label} className={`p-3 rounded-xl border ${t.cardInner}`}>
                        <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                        <div className={`text-base font-black ${t.textMain}`}>{val}</div>
                        {sub && <div className={`text-[9px] ${t.textMuted}`}>{sub}</div>}
                        {d != null && <DeltaBadge value={d} />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── COMPARATIVO DÍA VS LY ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Último Día TY vs LY</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Venta TY', val: fmtMXN(kpiDayTY.ventaP), color: 'text-emerald-400' },
                        { label: 'Venta LY', val: fmtMXN(kpiDayLY.ventaP), color: t.textMuted },
                        { label: 'Var $',    val: fmtMXN(kpiDayTY.ventaP - kpiDayLY.ventaP), color: (kpiDayTY.ventaP - kpiDayLY.ventaP) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                        { label: 'Var %',    val: delta(kpiDayTY.ventaP, kpiDayLY.ventaP) != null ? `${delta(kpiDayTY.ventaP, kpiDayLY.ventaP).toFixed(1)}%` : 'N/D', color: (delta(kpiDayTY.ventaP, kpiDayLY.ventaP) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className={`p-3 rounded-lg border ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                          <div className={`text-[9px] uppercase font-black ${t.textMuted}`}>{label}</div>
                          <div className={`text-sm font-black ${color}`}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {lastDateTY && <p className={`text-[9px] mt-2 ${t.textMuted}`}>Fecha: {fmtDate(lastDateTY)}</p>}
                  </div>

                  {/* Acumulado vs LY */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Acumulado TY vs LY</h4>
                    <div className="space-y-2">
                      {[
                        { label: 'Venta $', ty: kpiTY.ventaP, ly: kpiLY.ventaP },
                        { label: 'Piezas',  ty: kpiTY.ventaU, ly: kpiLY.ventaU },
                        { label: 'Utilidad',ty: kpiTY.utilidad, ly: kpiLY.utilidad },
                      ].map(({ label, ty, ly }) => {
                        const d = delta(ty, ly);
                        const maxVal = Math.max(ty, ly, 1);
                        return (
                          <div key={label}>
                            <div className="flex justify-between mb-1">
                              <span className={`text-[10px] font-bold ${t.textMuted}`}>{label}</span>
                              <DeltaBadge value={d} />
                            </div>
                            <div className="relative h-4 rounded-full overflow-hidden bg-gray-200/30">
                              <div className="absolute left-0 top-0 h-full rounded-full bg-emerald-500/60 transition-all duration-500"
                                style={{ width: `${(ty / maxVal) * 100}%` }} />
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className={`text-[9px] text-emerald-400 font-mono`}>{label === 'Piezas' ? fmt(ty) : fmtMXN(ty)}</span>
                              <span className={`text-[9px] ${t.textMuted} font-mono`}>{label === 'Piezas' ? fmt(ly) : fmtMXN(ly)} LY</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ── GRÁFICA LÍNEA DIARIA ── */}
                {serieDiaria.length > 1 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>📈 Venta Diaria TY vs LY</h4>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={serieDiaria}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => v?.slice(5)} />
                        <YAxis tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {salesLYData.length > 0 && (
                          <Line type="monotone" dataKey="ly" name="LY" stroke={axisColor}
                            dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                        )}
                        <Line type="monotone" dataKey="ty" name="TY" stroke="#10b981"
                          dot={false} strokeWidth={2} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── BARRAS POR CANAL / DIV ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Por canal */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>Por Canal</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={byCanal.slice(0, 8)} layout="vertical"
                        margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <YAxis type="category" dataKey="key" tick={{ fontSize: 9, fill: textColor }} stroke={axisColor} width={70} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="ventaP" name="Venta $" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Por división */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>Por División</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={byDiv.slice(0, 8)} layout="vertical"
                        margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <YAxis type="category" dataKey="key" tick={{ fontSize: 9, fill: textColor }} stroke={axisColor} width={80} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="ventaP" name="Venta $" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ── HEATMAP VENTAS POR DÍA-SEMANA ── */}
                {heatmapData.length > 0 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>🗓️ Heatmap — Venta por Día de Semana</h4>
                    {(() => {
                      const dow = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                      const weeks = [1,2,3,4,5];
                      const maxV = Math.max(...heatmapData.map(d => d.ventaP), 1);
                      return (
                        <div className="overflow-x-auto custom-scrollbar">
                          <div className="grid gap-1" style={{ gridTemplateColumns: `60px repeat(5, 1fr)` }}>
                            <div />
                            {weeks.map(w => (
                              <div key={w} className={`text-center text-[9px] font-black uppercase ${t.textMuted}`}>Sem {w}</div>
                            ))}
                            {dow.map((d, di) => (
                              <React.Fragment key={d}>
                                <div className={`text-[9px] font-black ${t.textMuted} flex items-center`}>{d}</div>
                                {weeks.map(w => {
                                  const cell = heatmapData.find(h => h.dow === di && h.week === w);
                                  const intensity = cell ? cell.ventaP / maxV : 0;
                                  return (
                                    <div key={w} title={cell ? fmtMXN(cell.ventaP) : ''}
                                      className="h-8 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all"
                                      style={{
                                        background: cell
                                          ? `rgba(16, 185, 129, ${0.1 + intensity * 0.85})`
                                          : isDark ? 'rgba(39,39,42,0.5)' : 'rgba(243,244,246,0.8)',
                                        color: intensity > 0.5 ? 'white' : isDark ? '#a1a1aa' : '#9ca3af'
                                      }}>
                                      {cell ? '$' + (cell.ventaP / 1000).toFixed(0) + 'k' : '·'}
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    <p className={`text-[9px] mt-2 ${t.textMuted}`}>Intensidad = mayor venta. Hover para ver valor exacto.</p>
                  </div>
                )}

                {/* ── TABLA POR SECCIÓN / MARCA ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: 'Por Sección', data: bySec },
                    { title: 'Por Marca', data: byMarca },
                  ].map(({ title, data }) => (
                    <div key={title} className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>{title}</h4>
                      <div className="overflow-x-auto custom-scrollbar max-h-[280px]">
                        <table className="w-full text-left text-xs min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-950 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              {['Nombre', 'Venta $', 'PZS', 'MG%', 'Markdown'].map(h =>
                                <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {data.slice(0, 15).map((r, i) => (
                              <tr key={i} className={`transition-colors ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-emerald-50/30'}`}>
                                <td className={`p-2 font-bold ${t.textMain} max-w-[120px] truncate`} title={r.key}>{r.key}</td>
                                <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.ventaP)}</td>
                                <td className={`p-2 font-mono ${t.textMuted}`}>{fmt(r.ventaU)}</td>
                                <td className={`p-2 font-bold ${semaforoMG(r.mgPct)}`}>{fmtPct(r.mgPct)}</td>
                                <td className={`p-2 font-mono text-amber-400`}>{fmtMXN(r.markdown)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── RESULTADO / MARGEN ESTIMADO ── */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>📊 Resultado Estimado del Ejercicio</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: 'Venta Total', val: fmtMXN(kpiTY.ventaP), color: 'text-emerald-400' },
                      { label: 'Costo Vendido', val: fmtMXN(invKPI.costoV || kpiTY.ventaP * (1 - kpiTY.mgPct / 100)), color: 'text-red-400' },
                      { label: 'Utilidad Bruta', val: fmtMXN(kpiTY.utilidad), color: 'text-teal-400' },
                      { label: 'Markdowns', val: fmtMXN(kpiTY.markdown), color: 'text-amber-400' },
                      { label: 'MG % Final', val: fmtPct(kpiTY.mgPct), color: semaforoMG(kpiTY.mgPct) },
                    ].map(({ label, val, color }) => (
                      <div key={label} className={`p-3 rounded-lg border ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                        <div className={`text-[9px] uppercase font-black ${t.textMuted}`}>{label}</div>
                        <div className={`text-base font-black ${color}`}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2 — INVENTORY & BUYING
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 2 && (
          <div className="p-5 space-y-5">

            {!invData.length && !salesData.length ? (
              <EmptyState icon={Icons.Package} t={t}
                title="Sin datos de inventario"
                sub="Carga el CSV de inventario desde el encabezado." />
            ) : (
              <>
                <FilterBar />

                {/* ── INVENTARIO KPIs ── */}
                <div>
                  <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Inventario Actual</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard label="On Hand (OH)" value={fmt(invKPI.oh)} sub="unidades disponibles" icon={Icons.Package} accent="text-emerald-400" />
                    <KPICard label="On Order (OO)" value={fmt(invKPI.oo)} sub="en tránsito/pedido" icon={Icons.Truck} accent="text-teal-400" />
                    <KPICard label="Inventario Total" value={fmt(invKPI.total)} sub="OH + OO" icon={Icons.Layers} accent={t.textAccent1} />
                    <KPICard label="Sell Through" value={fmtPct(invKPI.sellThrough)}
                      sub="venta / (OH+venta)"
                      icon={Icons.Percent}
                      accent={invKPI.sellThrough >= 60 ? 'text-emerald-400' : invKPI.sellThrough >= 40 ? 'text-amber-400' : 'text-red-400'}
                      badge={invKPI.sellThrough >= 60 ? 'ok' : invKPI.sellThrough >= 40 ? 'warn' : 'bad'} />
                  </div>
                </div>

                {/* ── COMPRAS ── */}
                {invKPI.comprado > 0 && (
                  <div>
                    <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Compras</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KPICard label="Comprado Total" value={fmtMXN(invKPI.comprado)} icon={Icons.ShoppingCart} accent="text-blue-400" />
                      <KPICard label="Nacional" value={fmtMXN(invKPI.nacional)}
                        sub={invKPI.comprado > 0 ? fmtPct(invKPI.nacional / invKPI.comprado * 100) : '–'}
                        icon={Icons.MapPin} accent="text-emerald-400" />
                      <KPICard label="Importación" value={fmtMXN(invKPI.importacion)}
                        sub={invKPI.comprado > 0 ? fmtPct(invKPI.importacion / invKPI.comprado * 100) : '–'}
                        icon={Icons.Globe} accent="text-purple-400" />
                      <KPICard label="Cobertura (días)" value={invKPI.cobertura > 0 ? `${invKPI.cobertura.toFixed(1)} días` : 'N/D'}
                        sub="OH / run rate diario"
                        icon={Icons.Clock}
                        accent={invKPI.cobertura > 60 ? 'text-red-400' : invKPI.cobertura > 30 ? 'text-amber-400' : 'text-emerald-400'} />
                    </div>
                  </div>
                )}

                {/* ── ANÁLISIS ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Sell Through por división */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>ST por División</h4>
                    <div className="space-y-2">
                      {byDiv.map((d, i) => {
                        const invRow = filteredInv.filter(r => r.division === d.key);
                        const ohDiv = invRow.reduce((s, r) => s + r.oh, 0);
                        const st = (ohDiv + d.ventaP) > 0 ? d.ventaP / (ohDiv + d.ventaP) * 100 : null;
                        return (
                          <div key={i}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`text-[10px] font-bold ${t.textMain} truncate max-w-[100px]`}>{d.key}</span>
                              <span className={`text-[10px] font-black ${st != null ? (st >= 60 ? 'text-emerald-400' : st >= 40 ? 'text-amber-400' : 'text-red-400') : t.textMuted}`}>
                                {st != null ? fmtPct(st) : 'N/D'}
                              </span>
                            </div>
                            {st != null && <MiniBar value={st} max={100}
                              color={st >= 60 ? 'bg-emerald-500' : st >= 40 ? 'bg-amber-400' : 'bg-red-400'}
                              isDark={isDark} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* OH por canal */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>OH por Canal</h4>
                    {(() => {
                      const byC = {};
                      filteredInv.forEach(r => {
                        if (!byC[r.canal]) byC[r.canal] = { oh: 0, oo: 0 };
                        byC[r.canal].oh += r.oh;
                        byC[r.canal].oo += r.oo;
                      });
                      const sorted = Object.entries(byC).sort((a, b) => b[1].oh - a[1].oh);
                      const maxOH = sorted[0]?.[1]?.oh || 1;
                      return (
                        <div className="space-y-2">
                          {sorted.map(([canal, d]) => (
                            <div key={canal}>
                              <div className="flex justify-between mb-0.5">
                                <span className={`text-[10px] font-bold ${t.textMain}`}>{canal}</span>
                                <span className={`text-[10px] font-mono ${t.textAccent1}`}>{fmt(d.oh)} OH</span>
                              </div>
                              <MiniBar value={d.oh} max={maxOH} color="bg-teal-500" isDark={isDark} />
                            </div>
                          ))}
                          {!sorted.length && <p className={`text-xs ${t.textMuted}`}>Sin datos de inventario con filtros actuales.</p>}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Aging / Semanas inv */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Cobertura por División</h4>
                    <div className="space-y-2">
                      {byDiv.map((d, i) => {
                        const invRow = filteredInv.filter(r => r.division === d.key);
                        const ohDiv  = invRow.reduce((s, r) => s + r.oh, 0);
                        const dias   = lastDateTY ? lastDateTY.getDate() : 30;
                        const rr     = d.ventaP / (dias || 1);
                        const cob    = rr > 0 ? ohDiv / rr : null;
                        const semanas = cob != null ? (cob / 7).toFixed(1) : null;
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold ${t.textMain} truncate max-w-[100px]`}>{d.key}</span>
                            <div className="text-right">
                              <span className={`text-[10px] font-black ${semanas != null ? (parseFloat(semanas) > 12 ? 'text-red-400' : parseFloat(semanas) > 8 ? 'text-amber-400' : 'text-emerald-400') : t.textMuted}`}>
                                {semanas != null ? `${semanas} sem` : 'N/D'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className={`text-[9px] mt-3 ${t.textMuted}`}>&gt;12 sem = riesgo. &lt;4 sem = ok.</p>
                  </div>
                </div>

                {/* ── SCATTER VENTA vs OH+OO ── */}
                {scatterData.length >= 3 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h4 className={`text-sm font-bold ${t.textMain}`}>🔵 Dispersión: Venta vs Inventario por Marca</h4>
                      {scatterRegression && (
                        <div className="flex gap-3">
                          <span className={`text-[10px] font-black ${t.textMuted}`}>
                            R² = <strong className="text-emerald-400">{scatterRegression.r2.toFixed(3)}</strong>
                          </span>
                          <span className={`text-[10px] font-black ${t.textMuted}`}>
                            Slope = <strong className={t.textMain}>{scatterRegression.slope.toFixed(2)}</strong>
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-black ${scatterRegression.r2 > 0.7 ? t.badge : scatterRegression.r2 > 0.4 ? t.badgeAmber : t.badgeRed}`}>
                            {scatterRegression.r2 > 0.7 ? 'Correlación fuerte' : scatterRegression.r2 > 0.4 ? 'Correlación moderada' : 'Correlación débil'}
                          </span>
                        </div>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="x" name="Venta $" type="number"
                          tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'}
                          label={{ value: 'Venta $', position: 'insideBottom', offset: -5, fontSize: 10, fill: textColor }} />
                        <YAxis dataKey="y" name="OH + OO" type="number"
                          tick={{ fontSize: 9, fill: textColor }} stroke={axisColor}
                          tickFormatter={v => fmt(v)}
                          label={{ value: 'OH + OO', angle: -90, position: 'insideLeft', fontSize: 10, fill: textColor }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>
                                <p className={`font-bold mb-1 ${t.textMain}`}>{d?.name}</p>
                                <p className="text-emerald-400">Venta: {fmtMXN(d?.x)}</p>
                                <p className="text-teal-400">OH+OO: {fmt(d?.y)}</p>
                              </div>
                            );
                          }}
                        />
                        <Scatter data={scatterData} fill="#10b981" fillOpacity={0.7} />
                        {/* Trend line as reference points */}
                        {scatterRegression && (() => {
                          const xs = scatterData.map(d => d.x);
                          const xMin = Math.min(...xs);
                          const xMax = Math.max(...xs);
                          const trendLine = [
                            { x: xMin, y: scatterRegression.slope * xMin + scatterRegression.intercept },
                            { x: xMax, y: scatterRegression.slope * xMax + scatterRegression.intercept },
                          ];
                          return (
                            <Scatter data={trendLine} fill="none" line={{ stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '6 3' }}
                              shape={() => null} legendType="none" />
                          );
                        })()}
                      </ScatterChart>
                    </ResponsiveContainer>
                    <p className={`text-[9px] mt-2 ${t.textMuted}`}>
                      Puntos por encima de la línea = inventario alto vs venta (riesgo). 
                      Puntos debajo = inventario bajo vs venta (oportunidad).
                    </p>
                  </div>
                )}

                {/* ── TABLA DETALLE INVENTARIO ── */}
                {filteredInv.length > 0 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>Detalle Inventario</h4>
                    <div className="overflow-x-auto custom-scrollbar max-h-[320px]">
                      <table className="w-full text-left text-xs min-w-max">
                        <thead>
                          <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-950 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                            {['División','Sección','Marca','Canal','OH','OO','Total','Costo Vendido','Utilidad Vendida'].map(h =>
                              <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                          {filteredInv.map((r, i) => (
                            <tr key={i} className={`transition-colors ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-emerald-50/30'}`}>
                              <td className={`p-2 ${t.textMuted}`}>{r.division}</td>
                              <td className={`p-2 ${t.textMuted}`}>{r.seccion}</td>
                              <td className={`p-2 font-bold ${t.textMain}`}>{r.marca}</td>
                              <td className="p-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.canal}</span>
                              </td>
                              <td className={`p-2 font-mono ${t.textAccent1}`}>{fmt(r.oh)}</td>
                              <td className={`p-2 font-mono text-teal-400`}>{fmt(r.oo)}</td>
                              <td className={`p-2 font-black ${t.textMain}`}>{fmt(r.oh + r.oo)}</td>
                              <td className={`p-2 font-mono text-red-400`}>{fmtMXN(r.costoVendido)}</td>
                              <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.utilidadVendida)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => downloadExcel(
                        [['División','Sección','Marca','Canal','OH','OO','Total','Costo Vendido','Utilidad Vendida'],
                         ...filteredInv.map(r => [r.division, r.seccion, r.marca, r.canal, r.oh, r.oo, r.oh+r.oo, r.costoVendido, r.utilidadVendida])],
                        'Daily_Inventario.csv')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
                        <Icons.Download size={13} /> Exportar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        * { scrollbar-width: thin; scrollbar-color: rgba(156,163,175,0.3) transparent; }
        *::-webkit-scrollbar { width: 6px; height: 6px; }
        *::-webkit-scrollbar-track { background: transparent !important; }
        *::-webkit-scrollbar-thumb { background-color: rgba(156,163,175,0.3); border-radius: 10px; }
        *::-webkit-scrollbar-thumb:hover { background-color: rgba(156,163,175,0.8); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(156,163,175,0.2); }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(156,163,175,0.5); }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}} />
    </div>
  );
}

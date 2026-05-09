import React, { useState, useMemo, useRef, useEffect, useCallback, startTransition } from 'react';
import * as icons from '../utils/icons';

// Theme local con localStorage — independiente de GlobalContext
const useThemeLocal = () => {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('gop_theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    const sync = () => {
      try { setTheme(localStorage.getItem('gop_theme') || 'dark'); } catch {}
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return { theme };
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
     .map(c => c.replace(/^"|"$/g, '').trim());

const num = v => parseFloat(String(v || '0').replace(/[^0-9.-]+/g, '')) || 0;

const fmt = (n, dec = 0) =>
  n == null ? '-' : n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtMXN = n =>
  n == null ? '-' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtPct = (n, dec = 1) =>
  n == null ? '-' : (n * 100).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';

const downloadExcel = (rows, filename) => {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Regresión lineal simple (mínimos cuadrados) sobre [{x,y}]
// devuelve { slope, intercept, r2, predict(x) }
const linearRegression = (points) => {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0, predict: () => points[0]?.y || 0 };
  const sumX = points.reduce((s,p) => s + p.x, 0);
  const sumY = points.reduce((s,p) => s + p.y, 0);
  const sumXY = points.reduce((s,p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s,p) => s + p.x * p.x, 0);
  const meanY = sumY / n;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  const ssTot = points.reduce((s,p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s,p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2, predict: x => slope * x + intercept };
};

// ─── MINI-CHART: LÍNEA HISTÓRICO + PROYECCIÓN ──────────────────────────────

const LineForecast = ({ historico, proyeccion, theme, height = 120 }) => {
  const isDark = theme === 'dark';
  const all = [...historico, ...proyeccion];
  if (!all.length) return null;
  const max = Math.max(...all.map(p => p.y), 1);
  const min = Math.min(...all.map(p => p.y), 0);
  const range = max - min || 1;
  const w = 600, h = height, pad = 20;
  const xStep = (w - pad * 2) / Math.max(all.length - 1, 1);
  const toY = v => h - pad - ((v - min) / range) * (h - pad * 2);
  const toX = i => pad + i * xStep;

  const histPath = historico.map((p,i) => `${i===0?'M':'L'}${toX(i)},${toY(p.y)}`).join(' ');
  const projPath = proyeccion.length
    ? `M${toX(historico.length - 1)},${toY(historico[historico.length-1]?.y || 0)} ` +
      proyeccion.map((p,i) => `L${toX(historico.length + i)},${toY(p.y)}`).join(' ')
    : '';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke={isDark ? '#3f3f46' : '#e5e7eb'} strokeWidth="1" />
      {histPath && <path d={histPath} fill="none" stroke="#fb923c" strokeWidth="2" />}
      {projPath && <path d={projPath} fill="none" stroke="#2dd4bf" strokeWidth="2" strokeDasharray="4 3" />}
      {historico.map((p,i) => (
        <circle key={`h${i}`} cx={toX(i)} cy={toY(p.y)} r="2.5" fill="#fb923c" />
      ))}
      {proyeccion.map((p,i) => (
        <circle key={`p${i}`} cx={toX(historico.length + i)} cy={toY(p.y)} r="2.5" fill="#2dd4bf" />
      ))}
    </svg>
  );
};

// ─── INPUT NUMÉRICO CON LOCAL STATE + onBlur ────────────────────────────────
// Patrón crítico de performance: el state global (overrides, drivers) solo se
// actualiza cuando el usuario sale del input (onBlur) o presiona Enter.
// Mientras tipea, el valor vive en el local state — sin re-renders del padre.
// Memoizado para evitar re-mounts.
const NumberInputDeferred = React.memo(function NumberInputDeferred({
  value,                  // valor controlado externo (puede ser null/undefined)
  onCommit,               // callback al sacar foco o Enter: (parsedValue, rawString) => void
  placeholder,
  step = 'any',
  className = '',
  formatter,              // opcional: (n) => string para mostrar al perder foco
  parseValue,             // opcional: (str) => num | null
  ...rest
}) {
  const fmtIn  = useCallback((v) => {
    if (v == null || v === '' || Number.isNaN(v)) return '';
    return formatter ? formatter(v) : String(v);
  }, [formatter]);
  const parse = useCallback((s) => {
    if (parseValue) return parseValue(s);
    if (s === '' || s == null) return null;
    const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }, [parseValue]);

  const [local, setLocal] = useState(() => fmtIn(value));
  const [focused, setFocused] = useState(false);

  // Sincronizar valor externo cuando NO está focuseado (evita pisar lo que tipea)
  useEffect(() => {
    if (!focused) setLocal(fmtIn(value));
  }, [value, focused, fmtIn]);

  const commit = () => {
    const parsed = parse(local);
    onCommit(parsed, local);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.currentTarget.blur(); }
        else if (e.key === 'Escape') { setLocal(fmtIn(value)); e.currentTarget.blur(); }
      }}
      className={className}
    />
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Forecast() {
  const gState = useThemeLocal();
  const theme  = gState?.theme || 'light';
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState(1);

  // ── Temas ──────────────────────────────────────────────────────────────
  const themes = {
    dark: {
      appBg: 'bg-transparent text-gray-100',
      card: 'bg-zinc-900 border-zinc-800 shadow-sm',
      cardInner: 'bg-zinc-950 border-zinc-800',
      textMain: 'text-white', textMuted: 'text-gray-400',
      textAccent1: 'text-orange-400', textAccent2: 'text-teal-400',
      border: 'border-zinc-800',
      input: 'bg-zinc-950 border-zinc-700 text-white focus:ring-orange-500',
      btnPrimary: 'bg-orange-500 text-black hover:bg-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.2)]',
      btnSecondary: 'bg-teal-600 text-white hover:bg-teal-500',
      btnGhost: 'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700',
      tabActive: 'border-orange-500 text-orange-400',
      badge: 'bg-orange-900/30 text-orange-400 border-orange-500/40',
      badgeTeal: 'bg-teal-900/30 text-teal-400 border-teal-500/40',
      // Nueva paleta
      textPurple: 'text-violet-400', textYellow: 'text-amber-400', textGray: 'text-zinc-400',
      badgePurple: 'bg-violet-900/30 text-violet-300 border-violet-500/40',
      badgeYellow: 'bg-amber-900/30 text-amber-300 border-amber-500/40',
      badgeGray:   'bg-zinc-800/60 text-zinc-300 border-zinc-600/40',
      btnPurple:   'bg-violet-600 text-white hover:bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.25)]',
      btnYellow:   'bg-amber-500 text-zinc-900 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]',
      cellPurple:  'bg-violet-500/80 border-violet-400 text-white',
      cellYellow:  'bg-amber-400/80 border-amber-300 text-zinc-900',
      menu:        'bg-zinc-900 border-zinc-700 shadow-2xl',
      menuItem:    'hover:bg-zinc-800 text-gray-200',
    },
    light: {
      appBg: 'bg-transparent text-gray-800',
      card: 'bg-white border-gray-200 shadow-sm',
      cardInner: 'bg-gray-50 border-gray-200',
      textMain: 'text-gray-900', textMuted: 'text-gray-500',
      textAccent1: 'text-orange-600', textAccent2: 'text-teal-600',
      border: 'border-gray-200',
      input: 'bg-white border-gray-300 text-gray-900 focus:ring-orange-500',
      btnPrimary: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md',
      btnSecondary: 'bg-teal-600 text-white hover:bg-teal-700 shadow-md',
      btnGhost: 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200',
      tabActive: 'border-orange-500 text-orange-600',
      badge: 'bg-orange-50 text-orange-700 border-orange-200',
      badgeTeal: 'bg-teal-50 text-teal-700 border-teal-200',
      // Nueva paleta
      textPurple: 'text-violet-600', textYellow: 'text-amber-600', textGray: 'text-zinc-500',
      badgePurple: 'bg-violet-50 text-violet-700 border-violet-200',
      badgeYellow: 'bg-amber-50 text-amber-700 border-amber-200',
      badgeGray:   'bg-zinc-100 text-zinc-700 border-zinc-300',
      btnPurple:   'bg-violet-600 text-white hover:bg-violet-700 shadow-md',
      btnYellow:   'bg-amber-500 text-white hover:bg-amber-600 shadow-md',
      cellPurple:  'bg-violet-500 border-violet-600 text-white',
      cellYellow:  'bg-amber-400 border-amber-500 text-zinc-900',
      menu:        'bg-white border-gray-200 shadow-2xl',
      menuItem:    'hover:bg-gray-100 text-gray-700',
    },
  };
  const t = themes[theme] || themes.light;

  // ══════════════════════════════════════════════════════════════════════
  // ESTADO GLOBAL DEL MÓDULO (compartido entre tabs)
  // ══════════════════════════════════════════════════════════════════════

  const histInputRef = useRef(null);

  // Histórico: [{ centro, nombre, anio, mes, venta, costo, markdown, msi, inventario }]
  const [historico, setHistorico]   = useState([]);
  // Catálogo de centros derivado del histórico + flags manuales
  // { [centro]: { nombre, tipo: 'NORMAL'|'APERTURA'|'NUEVA', mesApertura?: 1-12 } }
  const [centros, setCentros]       = useState({});
  // Aperturas planeadas (tiendas nuevas que abren en el año del plan)
  // { [centro]: { nombre, mesApertura, goa: 'ALL' } }
  const [aperturas, setAperturas]   = useState({});
  // Matriz GOA × Centro × Temporada (editable)
  // { [centro]: { [goa]: { activo: bool, meses: [1..12] } } }
  const [matrizGoaCentro, setMatrizGoaCentro] = useState({});
  // Lista maestra de GOAs (puede venir del histórico o capturarse manualmente)
  const [goasMaestro, setGoasMaestro] = useState([]);

  // Año del plan (default = año máximo del histórico + 1)
  const [anioPlan, setAnioPlan] = useState(new Date().getFullYear() + 1);

  // ── Persistencia ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_forecast_setup');
      if (s) {
        const d = JSON.parse(s);
        if (d.historico?.length)   setHistorico(d.historico);
        if (d.centros)             setCentros(d.centros);
        if (d.aperturas)           setAperturas(d.aperturas);
        if (d.matrizGoaCentro)     setMatrizGoaCentro(d.matrizGoaCentro);
        if (d.goasMaestro?.length) setGoasMaestro(d.goasMaestro);
        if (d.anioPlan)            setAnioPlan(d.anioPlan);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('gop_forecast_setup', JSON.stringify({
          historico, centros, aperturas, matrizGoaCentro, goasMaestro, anioPlan
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [historico, centros, aperturas, matrizGoaCentro, goasMaestro, anioPlan]);

  // ══════════════════════════════════════════════════════════════════════
  // TAB 1 — CARGA & SETUP
  // ══════════════════════════════════════════════════════════════════════

  // Parser formato wide (4 filas header):
  //   Fila 1: CANAL DE VENTA (Físico / Digital — "Sin asignar" cuenta como Físico)
  //   Fila 2: MÉTRICA (Vta $, Mkds, MSI, ROT, MG%)
  //   Fila 3: AÑO (2026, 2025, 2024, 2023)
  //   Fila 4: SECCION, N_SECCION, TIPO_TDA, CENTRO, N_CENTRO, GOA, MES, ENE, FEB, ..., DIC
  // Datos comienzan en fila 5. La col MES de la fila 4 es placeholder vacío.
  const handleHistUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
      const rows = text.split(/\r?\n/).map(r => parseCSVRow(r, sep));
      if (rows.length < 5) { alert('CSV inválido: se esperan 4 filas de header + datos.'); return; }

      const canalRow   = rows[0];
      const metricaRow = rows[1];
      const anioRow    = rows[2];
      const headerRow  = rows[3].map(h => h.toUpperCase().trim());

      const findCol = (...names) => {
        for (const n of names) {
          const i = headerRow.findIndex(h => h === n.toUpperCase());
          if (i >= 0) return i;
        }
        return -1;
      };

      const iSec      = findCol('SECCION', 'SECCIÓN');
      const iNSec     = findCol('N_SECCION', 'N_SECCIÓN');
      const iTipoTda  = findCol('TIPO_TDA', 'TIPO_TIENDA');
      const iCentro   = findCol('CENTRO');
      const iNCentro  = findCol('N_CENTRO', 'NOMBRE_CENTRO', 'NOM_CENTRO');
      const iGoa      = findCol('GOA', 'FAMILIA', 'DEPARTAMENTO');
      const iMes      = findCol('MES'); // placeholder

      if (iCentro === -1 || iSec === -1 || iGoa === -1) {
        alert('El CSV debe incluir mínimo: SECCION, CENTRO y GOA en la fila 4.');
        return;
      }

      const startData = (iMes >= 0 ? iMes : Math.max(iSec, iNSec, iTipoTda, iCentro, iNCentro, iGoa)) + 1;
      const MESES_MAP = { ENE:1, FEB:2, MAR:3, ABR:4, MAY:5, JUN:6, JUL:7, AGO:8, SEP:9, OCT:10, NOV:11, DIC:12 };

      // Mapear cada col mensual: { idx, canal, metrica, anio, mes }
      const colsMensuales = [];
      for (let c = startData; c < headerRow.length; c++) {
        const canal   = (canalRow[c]   || '').trim();
        const metrica = (metricaRow[c] || '').trim();
        const anio    = parseInt(anioRow[c], 10);
        const mes     = MESES_MAP[headerRow[c]];
        if (!canal || !metrica || !anio || !mes) continue;

        const canalNorm = /digital/i.test(canal) ? 'VIRTUAL'
                        : /fisico|físico|piso|sin\s*asignar/i.test(canal) ? 'FISICO'
                        : null;
        if (!canalNorm) continue;

        const met = metrica === 'Vta $'  ? 'venta'
                  : metrica === 'Mkds'   ? 'markdown'
                  : metrica === 'MSI'    ? 'msi'
                  : metrica === 'ROT'    ? 'rotacion'
                  : metrica === 'MG%'    ? 'mg'
                  : null;
        if (!met) continue;

        colsMensuales.push({ idx: c, canal: canalNorm, metrica: met, anio, mes });
      }

      if (!colsMensuales.length) {
        alert('No se detectaron columnas mensuales válidas. Revisa filas 1-3 (canal, métrica, año) y fila 4 (ENE-DIC).');
        return;
      }

      // Bucket: centro|seccion|goa|anio|mes|canal → métricas
      const bucket = {};
      const centrosSet = {};
      const goasSet = new Set();
      const seccionesSet = new Set();

      for (let i = 4; i < rows.length; i++) {
        const r = rows[i];
        if (!r[iCentro] || !r[iSec]) continue;
        const centro   = r[iCentro].trim();
        const seccion  = r[iSec].trim();
        const nSeccion = iNSec    >= 0 ? (r[iNSec]?.trim()    || '') : '';
        const tipoTda  = iTipoTda >= 0 ? (r[iTipoTda]?.trim() || '') : '';
        const nombre   = iNCentro >= 0 ? (r[iNCentro]?.trim() || centro) : centro;
        const goa      = (r[iGoa]?.trim().toUpperCase() || '');

        if (!centrosSet[centro]) centrosSet[centro] = { nombre, tipoTda, tipo: 'NORMAL' };
        if (goa) goasSet.add(goa);
        seccionesSet.add(`${seccion}|${nSeccion}`);

        colsMensuales.forEach(({ idx, canal, metrica, anio, mes }) => {
          const raw = r[idx];
          const v = num(raw);
          if (v === 0 && (raw === '' || raw == null)) return;
          const key = `${centro}|${seccion}|${goa}|${anio}|${mes}|${canal}`;
          if (!bucket[key]) {
            bucket[key] = {
              centro, nombre, seccion, nSeccion, tipoTda, goa, anio, mes, canal,
              venta: 0, markdown: 0, msi: 0,
              _rotSum: 0, _rotCnt: 0, _mgSum: 0, _mgCnt: 0,
            };
          }
          if (metrica === 'mg') {
            bucket[key]._mgSum += v;
            bucket[key]._mgCnt += 1;
          } else if (metrica === 'rotacion') {
            // ROT promedio (no suma) por si vienen 2 bloques (Piso + Sin asignar)
            bucket[key]._rotSum += v;
            bucket[key]._rotCnt += 1;
          } else {
            bucket[key][metrica] += v;
          }
        });
      }

      const extracted = Object.values(bucket).map(r => ({
        centro: r.centro, nombre: r.nombre,
        seccion: r.seccion, nSeccion: r.nSeccion,
        tipoTda: r.tipoTda, goa: r.goa,
        anio: r.anio, mes: r.mes, canal: r.canal,
        venta: r.venta, markdown: r.markdown, msi: r.msi,
        rotacion: r._rotCnt > 0 ? r._rotSum / r._rotCnt : 0,
        mg:       r._mgCnt  > 0 ? r._mgSum  / r._mgCnt  : 0,
      }));

      setHistorico(extracted);
      setCentros(prev => {
        const merged = { ...prev };
        Object.entries(centrosSet).forEach(([c, info]) => {
          merged[c] = { ...info, ...(prev[c] || {}) };
        });
        return merged;
      });
      if (goasSet.size) setGoasMaestro(prev => Array.from(new Set([...prev, ...goasSet])).sort());

      // Inicializar matriz GOA × Centro a partir del histórico (cruces con venta > 0)
      // Sin sobrescribir lo que el usuario ya haya editado.
      setMatrizGoaCentro(prev => {
        const next = { ...prev };
        const hist = {};
        extracted.forEach(r => {
          if (!r.goa || r.venta === 0) return;
          if (!hist[r.centro]) hist[r.centro] = {};
          if (!hist[r.centro][r.goa]) hist[r.centro][r.goa] = new Set();
          hist[r.centro][r.goa].add(r.mes);
        });
        Object.entries(hist).forEach(([c, goas]) => {
          if (!next[c]) next[c] = {};
          Object.entries(goas).forEach(([g, mesesSet]) => {
            if (!next[c][g]) {
              next[c][g] = { activo: true, meses: Array.from(mesesSet).sort((a,b) => a-b) };
            }
          });
        });
        return next;
      });

      const maxAnio = Math.max(...extracted.map(r => r.anio));
      if (maxAnio) setAnioPlan(maxAnio + 1);

      if (histInputRef.current) histInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  // Resumen del histórico cargado
  const resumenHist = useMemo(() => {
    if (!historico.length) return null;
    const aniosSet = new Set(historico.map(r => r.anio));
    const centrosSet = new Set(historico.map(r => r.centro));
    const seccionesSet = new Set(historico.map(r => r.seccion));
    const goasSet = new Set(historico.map(r => r.goa).filter(Boolean));
    const canalesSet = new Set(historico.map(r => r.canal));
    const totalVta = historico.reduce((s,r) => s + r.venta, 0);
    const vtaFisico = historico.filter(r => r.canal === 'FISICO').reduce((s,r) => s + r.venta, 0);
    const vtaVirtual = historico.filter(r => r.canal === 'VIRTUAL').reduce((s,r) => s + r.venta, 0);
    const aniosArr = Array.from(aniosSet).sort();
    const ultimoAnio = aniosArr[aniosArr.length - 1];
    const mesesUlt = new Set(historico.filter(r => r.anio === ultimoAnio).map(r => r.mes));

    // Sección dominante (más venta) — para mostrar en header
    const ventaPorSec = {};
    historico.forEach(r => {
      const k = `${r.seccion}|${r.nSeccion || ''}`;
      ventaPorSec[k] = (ventaPorSec[k] || 0) + r.venta;
    });
    const seccionDominanteKey = Object.entries(ventaPorSec).sort((a,b) => b[1]-a[1])[0]?.[0] || '';
    const [secNum, secNombre] = seccionDominanteKey.split('|');

    return {
      anios: aniosArr,
      centros: centrosSet.size,
      secciones: seccionesSet.size,
      goas: goasSet.size,
      canales: Array.from(canalesSet),
      filas: historico.length,
      totalVta, vtaFisico, vtaVirtual,
      ultimoAnio,
      mesesUltAnio: mesesUlt.size,
      seccionNum: secNum,
      seccionNombre: secNombre,
    };
  }, [historico]);

  // Lista de centros con stats agregados (suma todos los canales y secciones)
  const centrosLista = useMemo(() => {
    if (!historico.length) return [];
    const agg = {};
    historico.forEach(r => {
      if (!agg[r.centro]) agg[r.centro] = {
        centro: r.centro, nombre: r.nombre, tipoTda: r.tipoTda || '',
        vta: 0, anios: new Set(),
      };
      agg[r.centro].vta += r.venta;
      agg[r.centro].anios.add(r.anio);
    });
    return Object.values(agg)
      .map(a => ({
        ...a,
        anios: a.anios.size,
        tipo: centros[a.centro]?.tipo || 'NORMAL',
        mesApertura: centros[a.centro]?.mesApertura,
      }))
      .sort((a,b) => b.vta - a.vta);
  }, [historico, centros]);

  // Tipos de tienda únicos para el filtro
  const tiposTdaUnicos = useMemo(() => {
    const set = new Set(centrosLista.map(c => c.tipoTda).filter(Boolean));
    return Array.from(set).sort();
  }, [centrosLista]);

  // Filtros + orden tabla centros (declarados antes del useMemo que los usa)
  const [filtroTexto, setFiltroTexto]       = useState('');
  const [filtroTipo, setFiltroTipo]         = useState('TODOS');
  const [filtroTipoTda, setFiltroTipoTda]   = useState('TODOS');
  const [ordenCol, setOrdenCol]             = useState('vta');
  const [ordenDir, setOrdenDir]             = useState('desc');

  // Lista filtrada y ordenada para la tabla del catálogo
  const centrosListaFiltrada = useMemo(() => {
    let arr = centrosLista.filter(c => {
      if (filtroTipo !== 'TODOS' && c.tipo !== filtroTipo) return false;
      if (filtroTipoTda !== 'TODOS' && c.tipoTda !== filtroTipoTda) return false;
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase();
        if (!c.centro.toLowerCase().includes(q) && !c.nombre.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const dir = ordenDir === 'asc' ? 1 : -1;
    arr = [...arr].sort((a,b) => {
      let va, vb;
      if (ordenCol === 'goas') {
        va = Object.values(matrizGoaCentro[a.centro] || {}).filter(v => v.activo).length;
        vb = Object.values(matrizGoaCentro[b.centro] || {}).filter(v => v.activo).length;
      } else {
        va = a[ordenCol]; vb = b[ordenCol];
      }
      if (typeof va === 'string') return va.localeCompare(vb || '') * dir;
      return ((va || 0) - (vb || 0)) * dir;
    });
    return arr;
  }, [centrosLista, filtroTipo, filtroTipoTda, filtroTexto, ordenCol, ordenDir, matrizGoaCentro]);

  const toggleOrden = (col) => {
    if (ordenCol === col) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOrdenCol(col); setOrdenDir('desc'); }
  };

  const cambiarTipoCentro = (centro, tipo) => {
    setCentros(prev => ({
      ...prev,
      [centro]: { ...(prev[centro] || {}), tipo, ...(tipo !== 'APERTURA' && tipo !== 'NUEVA' ? { mesApertura: undefined } : {}) }
    }));
  };

  const cambiarMesApertura = (centro, mes) => {
    setCentros(prev => ({
      ...prev,
      [centro]: { ...(prev[centro] || {}), mesApertura: mes ? parseInt(mes, 10) : undefined }
    }));
  };

  // Agregar tienda nueva (no existe en histórico)
  const [nuevaCentroId, setNuevaCentroId]   = useState('');
  const [nuevaCentroNom, setNuevaCentroNom] = useState('');
  const [nuevaCentroMes, setNuevaCentroMes] = useState(1);

  // Estados para matriz GOA
  const [nuevoGoa, setNuevoGoa] = useState('');
  const [celaEditando, setCelaEditando] = useState(null); // { centro, goa }

  // Edición masiva por GOA (click en header GOA)
  const [goaMasivo, setGoaMasivo] = useState(null); // { goa, meses: [] }

  // Menú de 3 puntos (header)
  const [menuAbierto, setMenuAbierto] = useState(false);
  const sesionInputRef = useRef(null);

  const agregarTiendaNueva = () => {
    if (!nuevaCentroId.trim()) return;
    const id = nuevaCentroId.trim();
    setCentros(prev => ({
      ...prev,
      [id]: { nombre: nuevaCentroNom.trim() || id, tipo: 'NUEVA', mesApertura: nuevaCentroMes }
    }));
    setAperturas(prev => ({
      ...prev,
      [id]: { nombre: nuevaCentroNom.trim() || id, mesApertura: nuevaCentroMes }
    }));
    setNuevaCentroId(''); setNuevaCentroNom(''); setNuevaCentroMes(1);
  };

  const eliminarTiendaNueva = (id) => {
    setCentros(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setAperturas(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setMatrizGoaCentro(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  // Matriz GOA × Centro: toggle activo/inactivo del cruce
  const toggleCruce = (centro, goa) => {
    setMatrizGoaCentro(prev => {
      const next = { ...prev };
      if (!next[centro]) next[centro] = {};
      const actual = next[centro][goa];
      if (actual?.activo) {
        next[centro][goa] = { ...actual, activo: false };
      } else {
        next[centro][goa] = {
          activo: true,
          meses: actual?.meses?.length ? actual.meses : [1,2,3,4,5,6,7,8,9,10,11,12]
        };
      }
      return next;
    });
  };

  // Toggle de mes específico para un cruce GOA × Centro
  const toggleMesCruce = (centro, goa, mes) => {
    setMatrizGoaCentro(prev => {
      const next = { ...prev };
      if (!next[centro]) next[centro] = {};
      const actual = next[centro][goa] || { activo: true, meses: [] };
      const meses = actual.meses.includes(mes)
        ? actual.meses.filter(m => m !== mes)
        : [...actual.meses, mes].sort((a,b) => a-b);
      next[centro][goa] = { activo: meses.length > 0, meses };
      return next;
    });
  };

  // Marcar todos los meses (todo el año) en un cruce
  const setMesesCruce = (centro, goa, meses) => {
    setMatrizGoaCentro(prev => {
      const next = { ...prev };
      if (!next[centro]) next[centro] = {};
      next[centro][goa] = { activo: meses.length > 0, meses: [...meses].sort((a,b) => a-b) };
      return next;
    });
  };

  // Helpers GOA-maestro
  const agregarGoaMaestro = (nombre) => {
    const g = nombre.trim().toUpperCase();
    if (!g) return;
    setGoasMaestro(prev => prev.includes(g) ? prev : [...prev, g].sort());
  };

  const eliminarGoaMaestro = (goa) => {
    setGoasMaestro(prev => prev.filter(g => g !== goa));
    setMatrizGoaCentro(prev => {
      const next = {};
      Object.entries(prev).forEach(([c, goas]) => {
        const filtered = { ...goas };
        delete filtered[goa];
        next[c] = filtered;
      });
      return next;
    });
  };

  const exportSetup = () => {
    const header = ['Centro','Nombre','Tipo Tda','Tipo','Mes Apertura','GOAs activos','Detalle (GOA:meses)'];
    const rows = [];
    centrosLista.forEach(c => {
      const cruces = matrizGoaCentro[c.centro] || {};
      const activos = Object.entries(cruces).filter(([_, v]) => v.activo);
      const detalle = activos.map(([g, v]) => `${g}:${v.meses.join('-')}`).join(' | ');
      rows.push([
        c.centro, c.nombre, c.tipoTda, c.tipo,
        c.mesApertura || '',
        activos.length,
        detalle,
      ]);
    });
    downloadExcel([header, ...rows], 'Forecast_Setup_Centros.csv');
  };

  // ── Guardar / Cargar sesión completa (.json) ──────────────────────────
  const guardarSesion = () => {
    const payload = {
      _meta: { app: 'GO Planner', module: 'Forecast', version: 1, exportedAt: new Date().toISOString() },
      historico, centros, aperturas, matrizGoaCentro, goasMaestro, anioPlan,
      inSeasonOverrides,
      otbTotal, otbOverridesGoa, crecGoa, crecCentro, rotOverrides, msiPct, mkdPctGoa,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().slice(0,10);
    a.download = `GOPlanner_Forecast_Sesion_${fecha}.json`;
    a.click();
    setMenuAbierto(false);
  };

  const cargarSesion = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d._meta || d._meta.module !== 'Forecast') {
          alert('Archivo inválido: no es una sesión de Forecast.');
          return;
        }
        if (!confirm('Esto reemplazará la sesión actual. ¿Continuar?')) return;
        setHistorico(d.historico || []);
        setCentros(d.centros || {});
        setAperturas(d.aperturas || {});
        setMatrizGoaCentro(d.matrizGoaCentro || {});
        setGoasMaestro(d.goasMaestro || []);
        setAnioPlan(d.anioPlan || new Date().getFullYear() + 1);
        setInSeasonOverrides(d.inSeasonOverrides || {});
        setOtbTotal(d.otbTotal || 0);
        setOtbOverridesGoa(d.otbOverridesGoa || {});
        setCrecGoa(d.crecGoa || {});
        setCrecCentro(d.crecCentro || {});
        setRotOverrides(d.rotOverrides || {});
        setMsiPct(d.msiPct != null ? d.msiPct : 0.05);
        setMkdPctGoa(d.mkdPctGoa || {});
        if (sesionInputRef.current) sesionInputRef.current.value = '';
        setMenuAbierto(false);
      } catch (err) {
        alert('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const limpiarSesion = () => {
    if (!confirm('Esto borra TODO: histórico, centros, aperturas, matriz GOA, drivers y overrides. ¿Continuar?')) return;
    setHistorico([]); setCentros({}); setAperturas({});
    setMatrizGoaCentro({}); setGoasMaestro([]);
    setAnioPlan(new Date().getFullYear() + 1);
    setInSeasonOverrides({});
    setOtbTotal(0); setOtbOverridesGoa({}); setCrecGoa({}); setCrecCentro({});
    setRotOverrides({}); setMsiPct(0.05); setMkdPctGoa({});
    setMenuAbierto(false);
  };

  // ── Eliminar centro completo (incluye matriz y aperturas) ─────────────
  const eliminarCentro = (id) => {
    if (!confirm(`¿Eliminar el centro ${id}? Esto borra su histórico, cruces GOA y apertura si aplica.`)) return;
    setHistorico(prev => prev.filter(r => r.centro !== id));
    setCentros(prev => { const n = { ...prev }; delete n[id]; return n; });
    setAperturas(prev => { const n = { ...prev }; delete n[id]; return n; });
    setMatrizGoaCentro(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // ── Matriz masiva: aplicar meses de un GOA a todos los centros ────────
  const aplicarGoaMasivo = (goa, meses, soloActivos = false) => {
    startTransition(() => {
      setMatrizGoaCentro(prev => {
        const next = { ...prev };
        const allCentros = [
          ...new Set([
            ...centrosLista.map(c => c.centro),
            ...Object.keys(aperturas),
          ])
        ];
        allCentros.forEach(c => {
          if (!next[c]) next[c] = {};
          if (soloActivos && !next[c][goa]?.activo) return;
          next[c][goa] = { activo: meses.length > 0, meses: [...meses].sort((a,b) => a-b) };
        });
        return next;
      });
    });
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 2 — REGRESIÓN & IN SEASON
  // ══════════════════════════════════════════════════════════════════════

  // Overrides manuales de In Season: { "centro|goa|anio|mes": valor }
  const [inSeasonOverrides, setInSeasonOverrides] = useState({});

  // Persistir overrides en mismo localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_forecast_overrides');
      if (s) setInSeasonOverrides(JSON.parse(s));
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem('gop_forecast_overrides', JSON.stringify(inSeasonOverrides)); } catch {}
    }, 1000); // debounce 1s
    return () => clearTimeout(t);
  }, [inSeasonOverrides]);

  // Selector Tab 2
  const [t2Centro, setT2Centro] = useState('');
  const [t2Goa,    setT2Goa]    = useState('');
  const [t2Filtro, setT2Filtro] = useState(''); // filtro lista resumen

  // Escenarios IS
  const [escenarioActivo, setEscenarioActivo] = useState('editable'); // conservador|optimista|limpio|editable
  const [thresholdsAvanzado, setThresholdsAvanzado] = useState(false); // panel colapsable
  const [thresholds, setThresholds] = useState({
    pesoConservador:    [0.6, 0.3, 0.1],   // último, penúltimo, antepenúltimo año
    capOptimista:       0.30,               // +30% sobre conservador
    // Z-score sobre ratio markdown/venta (Limpio)
    zScoreMkd:          1.5,                // |z| > 1.5σ → mes promocional atípico
    volumenMin:         0.10,               // sólo aplica Z-score si venta del mes ≥ 10% prom mensual
    // Detección de stockout (Limpio)
    stockoutLocal:      0.30,               // venta < 30% del prom de meses adyacentes
    stockoutHist:       0.50,               // venta < 50% del prom mismo mes en otros años
    stockoutFactorGuard:0.75,               // factor del mes >= factor_anterior * 0.75 (no es bajón estacional)
  });

  // Histórico agregado por Centro × GOA × Año × Mes (suma canales)
  const histCxG = useMemo(() => {
    const map = {};
    historico.forEach(r => {
      if (!r.goa) return;
      const k = `${r.centro}|${r.goa}|${r.anio}|${r.mes}`;
      if (!map[k]) map[k] = { centro: r.centro, goa: r.goa, anio: r.anio, mes: r.mes, venta: 0, markdown: 0 };
      map[k].venta    += r.venta;
      map[k].markdown += r.markdown || 0;
    });
    return map;
  }, [historico]);

  // Año actual y plan
  const anioActual = useMemo(() => {
    if (!historico.length) return new Date().getFullYear();
    return Math.max(...historico.map(r => r.anio));
  }, [historico]);

  const aniosCerrados = useMemo(() => {
    if (!historico.length) return [];
    return Array.from(new Set(historico.map(r => r.anio))).sort().filter(a => a < anioActual);
  }, [historico, anioActual]);

  // Meses con dato real del año actual
  const mesesActualReales = useMemo(() => {
    const set = new Set(historico.filter(r => r.anio === anioActual && r.venta > 0).map(r => r.mes));
    return set;
  }, [historico, anioActual]);

  // ══════════════════════════════════════════════════════════════════════
  // L1 — MOTOR DE REGRESIÓN PESADO (sin overrides)
  // Recalcula SOLO cuando cambia: histórico, matriz, thresholds, anioPlan
  // Devuelve un Map: { "centro|goa": { serie, escenarios, plan, ... } }
  // No depende de inSeasonOverrides ni de escenarioActivo.
  // ══════════════════════════════════════════════════════════════════════
  const forecastL1 = useMemo(() => {
    if (!historico.length) return { mapa: {}, baseAnio: 0 };

    const todosAnios = Array.from(new Set(historico.map(r => r.anio))).sort();
    const baseAnio = todosAnios[0];
    const mapa = {};

    // Pre-cómputo: lista de cruces a procesar (de la matriz)
    const cruces = [];
    Object.entries(matrizGoaCentro).forEach(([centro, goas]) => {
      Object.entries(goas).forEach(([goa, v]) => {
        if (v.activo && v.meses?.length) cruces.push({ centro, goa, mesesSet: new Set(v.meses) });
      });
    });

    cruces.forEach(({ centro, goa, mesesSet }) => {
      const key = `${centro}|${goa}`;

      // 1) Serie histórica con flag stockout para imputación posterior
      const serieRaw = [];
      todosAnios.forEach(anio => {
        for (let mes = 1; mes <= 12; mes++) {
          const k = `${centro}|${goa}|${anio}|${mes}`;
          const reg = histCxG[k];
          const esReal = anio < anioActual ? true : mesesActualReales.has(mes);
          if (!esReal && anio === anioActual) continue;
          if (!reg && anio < anioActual) {
            serieRaw.push({ anio, mes, venta: 0, markdown: 0, x: (anio-baseAnio)*12+(mes-1), faltante: true });
            continue;
          }
          if (reg) serieRaw.push({
            anio, mes, venta: reg.venta, markdown: reg.markdown || 0,
            x: (anio-baseAnio)*12+(mes-1), faltante: false,
          });
        }
      });

      // Si hay menos de 6 meses con dato real, marcar insuficiente
      const conDato = serieRaw.filter(s => !s.faltante);
      if (conDato.length < 6) {
        mapa[key] = { insuficiente: true, error: 'Datos insuficientes (<6 meses)', serie: conDato };
        return;
      }

      // 2) Regresión lineal sobre serie real (sin imputación, mantiene la realidad)
      const serie = conDato;
      const regresion = linearRegression(serie.map(s => ({ x: s.x, y: s.venta })));

      // 3) Factores estacionales BASE (con años cerrados completos)
      const porMes = {};
      const porAnio = {};
      serie.forEach(s => {
        if (s.anio === anioActual) return;
        if (!porMes[s.mes]) porMes[s.mes] = [];
        porMes[s.mes].push({ valor: s.venta, mkd: s.markdown, anio: s.anio });
        porAnio[s.anio] = (porAnio[s.anio] || 0) + s.venta;
      });
      const aniosCompletos = Object.keys(porAnio).filter(a => {
        const cnt = serie.filter(s => s.anio === parseInt(a)).length;
        return cnt >= 10;
      }).map(Number);

      const factores = {};
      let promAnualGlobal = 0;
      if (aniosCompletos.length > 0) {
        promAnualGlobal = aniosCompletos.reduce((s, a) => s + porAnio[a]/12, 0) / aniosCompletos.length;
        for (let m = 1; m <= 12; m++) {
          const valoresMes = (porMes[m] || []).filter(p => aniosCompletos.includes(p.anio)).map(p => p.valor);
          const promMes = valoresMes.length ? valoresMes.reduce((a,b)=>a+b,0) / valoresMes.length : promAnualGlobal;
          factores[m] = promAnualGlobal > 0 ? promMes / promAnualGlobal : 1;
        }
      } else {
        for (let m = 1; m <= 12; m++) factores[m] = 1;
      }

      // 4) DETECCIÓN DE STOCKOUTS y MESES ATÍPICOS para escenario LIMPIO
      //    Operamos sobre años cerrados completos.
      //    A) Stockout: caída local (<30% adyacentes) AND (factor mes >= factor previo * 0.75) → no es estacional
      //                 OR caída histórica (<50% mismo mes en otros años)
      //    Z-score sobre RATIO mkd/venta (no monto absoluto), con candado de volumen mínimo.
      const promVtaMensual = aniosCompletos.length > 0 ? promAnualGlobal : 0;
      const volumenMinAbs = promVtaMensual * thresholds.volumenMin;

      // Z-score sobre ratios mkd/venta de meses con volumen ≥ umbral
      const ratiosValidos = [];
      serie.forEach(s => {
        if (s.anio === anioActual || !aniosCompletos.includes(s.anio)) return;
        if (s.venta < volumenMinAbs) return; // candado de volumen
        ratiosValidos.push(s.venta > 0 ? s.markdown / s.venta : 0);
      });
      const muRatio = ratiosValidos.length ? ratiosValidos.reduce((a,b)=>a+b,0) / ratiosValidos.length : 0;
      const sigmaRatio = ratiosValidos.length > 1
        ? Math.sqrt(ratiosValidos.reduce((s,v) => s + (v - muRatio)**2, 0) / ratiosValidos.length)
        : 0;

      // Marcar cada mes (de años cerrados completos) como atípico/stockout
      const meta = {}; // { "anio|mes": { atipico, stockout, valorImputado } }
      serie.forEach(s => {
        if (s.anio === anioActual || !aniosCompletos.includes(s.anio)) return;
        const k = `${s.anio}|${s.mes}`;
        meta[k] = { atipico: false, stockout: false, valorImputado: s.venta };

        // Z-score atípico (sólo si pasa candado volumen)
        if (s.venta >= volumenMinAbs && sigmaRatio > 0) {
          const ratio = s.venta > 0 ? s.markdown / s.venta : 0;
          const z = Math.abs(ratio - muRatio) / sigmaRatio;
          if (z > thresholds.zScoreMkd) meta[k].atipico = true;
        }

        // Stockout — Condición A (local): venta < 30% prom adyacentes
        const prev = serie.find(x => x.anio === s.anio && x.mes === s.mes - 1)
                  ?? serie.find(x => x.anio === s.anio - 1 && x.mes === 12);
        const next = serie.find(x => x.anio === s.anio && x.mes === s.mes + 1)
                  ?? serie.find(x => x.anio === s.anio + 1 && x.mes === 1);
        const adyacentes = [prev, next].filter(x => x && !x.faltante);
        const promAdyacentes = adyacentes.length
          ? adyacentes.reduce((a,b) => a + b.venta, 0) / adyacentes.length
          : 0;
        let condA = false;
        if (promAdyacentes > 0 && s.venta < promAdyacentes * thresholds.stockoutLocal) {
          // Candado: factor del mes >= factor mes anterior * 0.75 (no es bajón estacional natural)
          const factorMes = factores[s.mes] || 1;
          const factorPrev = factores[s.mes - 1] || factores[12] || 1;
          if (factorMes >= factorPrev * thresholds.stockoutFactorGuard) {
            condA = true;
          }
        }

        // Stockout — Condición B (histórica): venta < 50% prom mismo mes en otros años
        const otrosAnios = (porMes[s.mes] || []).filter(p => p.anio !== s.anio).map(p => p.valor);
        const promMismoMes = otrosAnios.length ? otrosAnios.reduce((a,b)=>a+b,0) / otrosAnios.length : 0;
        const condB = promMismoMes > 0 && s.venta < promMismoMes * thresholds.stockoutHist;

        if (condA || condB) {
          meta[k].stockout = true;
          // Imputar promedio entre vecinos válidos (preservar OTB)
          const candidatos = [];
          if (promAdyacentes > 0) candidatos.push(promAdyacentes);
          if (promMismoMes > 0) candidatos.push(promMismoMes);
          meta[k].valorImputado = candidatos.length
            ? candidatos.reduce((a,b)=>a+b,0) / candidatos.length
            : s.venta;
        }
      });

      // 5) Factores estacionales LIMPIO: excluye meses atípicos, imputa stockouts
      const factoresLimpio = { ...factores };
      if (aniosCompletos.length > 0) {
        for (let m = 1; m <= 12; m++) {
          const valoresLimpios = [];
          aniosCompletos.forEach(a => {
            const k = `${a}|${m}`;
            const info = meta[k];
            if (!info) return;
            if (info.atipico) return;            // excluye atípicos
            valoresLimpios.push(info.valorImputado); // usa imputado si stockout
          });
          const promMesL = valoresLimpios.length
            ? valoresLimpios.reduce((a,b)=>a+b,0) / valoresLimpios.length
            : promAnualGlobal;
          factoresLimpio[m] = promAnualGlobal > 0 ? promMesL / promAnualGlobal : 1;
        }
      }

      // 6) Funciones de proyección por escenario
      const inMatriz = (mes) => !mesesSet.size || mesesSet.has(mes);
      const proyectarBase = (anio, mes) => {
        if (!inMatriz(mes)) return 0;
        const x = (anio - baseAnio) * 12 + (mes - 1);
        return Math.max(0, regresion.predict(x) * factores[mes]);
      };
      const aniosOrd = [...aniosCompletos].sort((a,b) => b-a);
      const [pUlt, pPen, pAnt] = thresholds.pesoConservador;
      const proyectarConservador = (anio, mes) => {
        if (!inMatriz(mes)) return 0;
        const w = [pUlt, pPen, pAnt];
        let sumPond = 0, sumPesos = 0;
        aniosOrd.slice(0, 3).forEach((a, i) => {
          const peso = w[i] || 0;
          const totAnio = porAnio[a] || 0;
          sumPond += (totAnio / 12) * peso;
          sumPesos += peso;
        });
        const baseMensual = sumPesos > 0 ? sumPond / sumPesos : 0;
        return Math.max(0, baseMensual * factores[mes]);
      };
      const proyectarLimpio = (anio, mes) => {
        if (!inMatriz(mes)) return 0;
        const x = (anio - baseAnio) * 12 + (mes - 1);
        return Math.max(0, regresion.predict(x) * factoresLimpio[mes]);
      };
      const proyectarOptimista = (anio, mes) => {
        if (!inMatriz(mes)) return 0;
        const base = proyectarBase(anio, mes);
        const cons = proyectarConservador(anio, mes);
        const cap = cons * (1 + thresholds.capOptimista);
        return Math.min(base, cap);
      };

      // 7) Construir IS por escenario (sin overrides — eso es L2)
      const buildIS = (proyFn) => {
        const arr = [];
        for (let mes = 1; mes <= 12; mes++) {
          const k = `${centro}|${goa}|${anioActual}|${mes}`;
          const real = histCxG[k];
          if (mesesActualReales.has(mes) && real) {
            arr.push({ mes, valor: real.venta, fuente: 'real' });
          } else {
            arr.push({ mes, valor: proyFn(anioActual, mes), fuente: 'sugerido' });
          }
        }
        return arr;
      };

      const escenarios = {
        conservador: buildIS(proyectarConservador),
        limpio:      buildIS(proyectarLimpio),
        optimista:   buildIS(proyectarOptimista),
        base:        buildIS(proyectarBase),
      };

      // 8) Plan año siguiente — uno por escenario (L2 elegirá según activo)
      const planEsc = {};
      [['conservador', proyectarConservador], ['limpio', proyectarLimpio],
       ['optimista', proyectarOptimista], ['base', proyectarBase]].forEach(([k, fn]) => {
        planEsc[k] = [];
        for (let mes = 1; mes <= 12; mes++) planEsc[k].push({ mes, valor: fn(anioPlan, mes) });
      });

      // 9) Confidence
      const r2 = regresion.r2;
      const slope = regresion.slope;
      const tieneCompletos = aniosCompletos.length;
      const confidence = {
        conservador: tieneCompletos >= 2 ? Math.min(1, 0.5 + (1 - r2) * 0.5) : 0.3,
        optimista:   r2 > 0.3 && slope > 0 ? Math.min(1, r2 + 0.2) : Math.max(0.2, r2 * 0.6),
        limpio:      tieneCompletos >= 2 ? 0.75 : 0.4,
        editable:    1.0,
      };

      mapa[key] = {
        insuficiente: false,
        serie, regresion, factores, factoresLimpio, meta,
        escenarios, planEsc, confidence,
        mesesAplicables: mesesSet.size ? Array.from(mesesSet).sort((a,b) => a-b) : null,
        totalUltAnio: serie.filter(s => s.anio === anioActual - 1).reduce((s,x) => s + x.venta, 0),
      };
    });

    return { mapa, baseAnio };
  }, [historico, histCxG, anioActual, anioPlan, mesesActualReales, matrizGoaCentro, thresholds]);

  // ══════════════════════════════════════════════════════════════════════
  // L2 — APLICA OVERRIDES + ESCENARIO ACTIVO PARA UN CRUCE
  // Operación O(12) por cruce, ultra ligera. Se llama solo cuando se
  // renderiza el cruce activo en pantalla.
  // ══════════════════════════════════════════════════════════════════════
  const aplicarOverrides = useCallback((centro, goa) => {
    const r = forecastL1.mapa[`${centro}|${goa}`];
    if (!r || r.insuficiente) return r;

    // IS según escenario: si activo es 'editable', parte de 'base'; si no, copia el escenario
    const fuenteIS = escenarioActivo === 'editable' ? r.escenarios.base : r.escenarios[escenarioActivo];
    const fuentePlan = escenarioActivo === 'editable' ? r.planEsc.base : r.planEsc[escenarioActivo];

    const inSeason = fuenteIS.map(x => {
      const overrideKey = `${centro}|${goa}|${anioActual}|${x.mes}`;
      const override = inSeasonOverrides[overrideKey];
      const sugerido = x.valor;
      let valor = sugerido, fuente = x.fuente;
      if (escenarioActivo === 'editable' && x.fuente !== 'real' && override !== undefined) {
        valor = override;
        fuente = 'override';
      }
      return { mes: x.mes, valor, fuente, sugerido };
    });

    const totalInSeason = inSeason.reduce((s,x) => s + x.valor, 0);
    const totalPlan = fuentePlan.reduce((s,x) => s + x.valor, 0);
    const crecYoY = r.totalUltAnio > 0 ? (totalInSeason - r.totalUltAnio) / r.totalUltAnio : 0;
    const crecPlan = totalInSeason > 0 ? (totalPlan - totalInSeason) / totalInSeason : 0;

    return {
      ...r,
      inSeason, plan: fuentePlan,
      kpis: { totalInSeason, totalPlan, totalUltAnio: r.totalUltAnio, crecYoY, crecPlan, r2: r.regresion.r2 },
    };
  }, [forecastL1, escenarioActivo, inSeasonOverrides, anioActual]);

  // Compatibilidad: alias para no romper referencias
  const calcRegresion = aplicarOverrides;

  // Lista de cruces Centro×GOA activos según matriz
  const crucesActivos = useMemo(() => {
    const arr = [];
    Object.entries(matrizGoaCentro).forEach(([centro, goas]) => {
      Object.entries(goas).forEach(([goa, v]) => {
        if (v.activo && v.meses?.length) arr.push({ centro, goa });
      });
    });
    return arr;
  }, [matrizGoaCentro]);

  // ══════════════════════════════════════════════════════════════════════
  // L3 — KPIs AGREGADOS (depende de L1 + escenario + overrides)
  // O(N) sobre cruces, una pasada. Se actualiza con cada keystroke pero es barato.
  // ══════════════════════════════════════════════════════════════════════
  const resumenCruces = useMemo(() => {
    if (!historico.length) return [];
    return crucesActivos.map(({ centro, goa }) => {
      const r = forecastL1.mapa[`${centro}|${goa}`];
      const nombre = centros[centro]?.nombre || aperturas[centro]?.nombre || centro;
      if (!r || r.insuficiente) {
        return { centro, nombre, goa, totalInSeason: 0, totalPlan: 0, crecPlan: 0, crecYoY: 0, totalUltAnio: 0, r2: 0, insuficiente: true };
      }

      // Aplicar escenario activo + overrides (operación barata O(12))
      const fuenteIS = escenarioActivo === 'editable' ? r.escenarios.base : r.escenarios[escenarioActivo];
      const fuentePlan = escenarioActivo === 'editable' ? r.planEsc.base : r.planEsc[escenarioActivo];

      let totalInSeason = 0;
      fuenteIS.forEach(x => {
        if (escenarioActivo === 'editable' && x.fuente !== 'real') {
          const ov = inSeasonOverrides[`${centro}|${goa}|${anioActual}|${x.mes}`];
          totalInSeason += ov !== undefined ? ov : x.valor;
        } else {
          totalInSeason += x.valor;
        }
      });

      const totalPlan = fuentePlan.reduce((s,x) => s + x.valor, 0);
      const totalUltAnio = r.totalUltAnio;
      const crecYoY = totalUltAnio > 0 ? (totalInSeason - totalUltAnio) / totalUltAnio : 0;
      const crecPlan = totalInSeason > 0 ? (totalPlan - totalInSeason) / totalInSeason : 0;

      return {
        centro, nombre, goa,
        totalInSeason, totalPlan, totalUltAnio,
        crecYoY, crecPlan, r2: r.regresion?.r2 || 0,
      };
    }).sort((a,b) => b.totalPlan - a.totalPlan);
  }, [crucesActivos, forecastL1, historico, centros, aperturas, escenarioActivo, inSeasonOverrides, anioActual]);

  const resumenCrucesFiltrado = useMemo(() => {
    if (!t2Filtro.trim()) return resumenCruces;
    const q = t2Filtro.toLowerCase();
    return resumenCruces.filter(r =>
      r.centro.toLowerCase().includes(q) ||
      r.nombre.toLowerCase().includes(q) ||
      r.goa.toLowerCase().includes(q)
    );
  }, [resumenCruces, t2Filtro]);

  // Auto-seleccionar primer cruce al entrar a Tab 2
  useEffect(() => {
    if (activeTab === 2 && !t2Centro && resumenCruces.length > 0) {
      setT2Centro(resumenCruces[0].centro);
      setT2Goa(resumenCruces[0].goa);
    }
  }, [activeTab, t2Centro, resumenCruces]);

  // Cálculo del cruce activo
  const t2Calc = useMemo(() => calcRegresion(t2Centro, t2Goa), [t2Centro, t2Goa, calcRegresion]);

  // Helpers UI Tab 2
  const editarInSeason = (centro, goa, mes, valor) => {
    const k = `${centro}|${goa}|${anioActual}|${mes}`;
    setInSeasonOverrides(prev => ({ ...prev, [k]: parseFloat(valor) || 0 }));
  };
  const limpiarOverride = (centro, goa, mes) => {
    const k = `${centro}|${goa}|${anioActual}|${mes}`;
    setInSeasonOverrides(prev => {
      const n = { ...prev };
      delete n[k];
      return n;
    });
  };
  const limpiarTodosOverrides = () => {
    if (!confirm('Esto restaura todos los In Season editados al valor sugerido. ¿Continuar?')) return;
    setInSeasonOverrides({});
  };

  const exportRegresion = () => {
    const header = ['Centro','Nombre','GOA','Total Año Anterior','Total In Season','% YoY','Total Plan','% Crec. Plan','R²'];
    const rows = resumenCruces.map(r => [
      r.centro, r.nombre, r.goa,
      r.totalUltAnio || 0, r.totalInSeason || 0, r.crecYoY || 0,
      r.totalPlan || 0, r.crecPlan || 0, r.r2 || 0,
    ]);
    downloadExcel([header, ...rows], `Forecast_Regresion_${anioPlan}.csv`);
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 3 — DRIVERS DEL PLAN (OTB, crecimientos, rotación, MSI, markdowns)
  // ══════════════════════════════════════════════════════════════════════

  // Drivers persistidos
  const [otbTotal, setOtbTotal]               = useState(0);          // OTB total del depto (capturado)
  const [otbOverridesGoa, setOtbOverridesGoa] = useState({});         // { goa: monto }  override sobre distribución
  const [crecGoa, setCrecGoa]                 = useState({});         // { goa: pct decimal, ej 0.07 }
  const [crecCentro, setCrecCentro]           = useState({});         // { "centro|goa": pct }  override centro×goa
  const [rotOverrides, setRotOverrides]       = useState({});         // { "centro|goa": rotación }
  const [msiPct, setMsiPct]                   = useState(0.05);       // % global MSI sobre venta plan
  const [mkdPctGoa, setMkdPctGoa]             = useState({});         // { goa: % markdown sobre venta }

  // Persistencia
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_forecast_drivers');
      if (s) {
        const d = JSON.parse(s);
        if (d.otbTotal != null)        setOtbTotal(d.otbTotal);
        if (d.otbOverridesGoa)         setOtbOverridesGoa(d.otbOverridesGoa);
        if (d.crecGoa)                 setCrecGoa(d.crecGoa);
        if (d.crecCentro)              setCrecCentro(d.crecCentro);
        if (d.rotOverrides)            setRotOverrides(d.rotOverrides);
        if (d.msiPct != null)          setMsiPct(d.msiPct);
        if (d.mkdPctGoa)               setMkdPctGoa(d.mkdPctGoa);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('gop_forecast_drivers', JSON.stringify({
          otbTotal, otbOverridesGoa, crecGoa, crecCentro, rotOverrides, msiPct, mkdPctGoa
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [otbTotal, otbOverridesGoa, crecGoa, crecCentro, rotOverrides, msiPct, mkdPctGoa]);

  // ── Lógica de distribución y cálculos ────────────────────────────────

  // Total Plan sugerido por GOA (suma de plan de regresión por GOA)
  const planSugeridoPorGoa = useMemo(() => {
    const map = {};
    resumenCruces.forEach(r => {
      map[r.goa] = (map[r.goa] || 0) + (r.totalPlan || 0);
    });
    return map;
  }, [resumenCruces]);

  // Plan total sugerido (suma global)
  const planSugeridoTotal = useMemo(() =>
    Object.values(planSugeridoPorGoa).reduce((s,v) => s+v, 0)
  , [planSugeridoPorGoa]);

  // Distribución OTB por GOA (sugerido vs override)
  const otbPorGoa = useMemo(() => {
    const map = {};
    const otbBase = otbTotal > 0 ? otbTotal : planSugeridoTotal;
    goasMaestro.forEach(g => {
      const sugerido = planSugeridoTotal > 0
        ? otbBase * (planSugeridoPorGoa[g] || 0) / planSugeridoTotal
        : 0;
      const override = otbOverridesGoa[g];
      const aplicado = override != null ? override : sugerido;
      const partSug = planSugeridoTotal > 0 ? (planSugeridoPorGoa[g] || 0) / planSugeridoTotal : 0;
      const partApl = otbBase > 0 ? aplicado / otbBase : 0;
      map[g] = { sugerido, override, aplicado, partSug, partApl };
    });
    return map;
  }, [goasMaestro, planSugeridoPorGoa, planSugeridoTotal, otbTotal, otbOverridesGoa]);

  // Total OTB aplicado (con overrides)
  const otbAplicadoTotal = useMemo(() =>
    Object.values(otbPorGoa).reduce((s,v) => s + v.aplicado, 0)
  , [otbPorGoa]);

  // Diferencia OTB total capturado vs aplicado (para alertar al usuario)
  const otbDiff = useMemo(() => {
    if (!otbTotal) return 0;
    return otbAplicadoTotal - otbTotal;
  }, [otbTotal, otbAplicadoTotal]);

  // Crecimiento aplicado para un cruce (override centro > GOA > sugerido)
  const getCrecAplicado = useCallback((centro, goa, crecSugeridoCruce) => {
    const overrideCentro = crecCentro[`${centro}|${goa}`];
    if (overrideCentro != null) return overrideCentro;
    const overrideGoa = crecGoa[goa];
    if (overrideGoa != null) return overrideGoa;
    return crecSugeridoCruce;
  }, [crecCentro, crecGoa]);

  // Rotación histórica promedio por Centro × GOA (de los últimos años cerrados con dato)
  const rotacionHistPromedio = useMemo(() => {
    const map = {};
    historico.forEach(r => {
      if (!r.goa || !r.rotacion || r.rotacion <= 0) return;
      const k = `${r.centro}|${r.goa}`;
      if (!map[k]) map[k] = { sum: 0, cnt: 0 };
      map[k].sum += r.rotacion;
      map[k].cnt += 1;
    });
    const out = {};
    Object.entries(map).forEach(([k, v]) => {
      out[k] = v.cnt > 0 ? v.sum / v.cnt : 0;
    });
    return out;
  }, [historico]);

  // Mg histórico promedio por Centro × GOA
  const mgHistPromedio = useMemo(() => {
    const map = {};
    historico.forEach(r => {
      if (!r.goa || !r.mg || r.mg === 0) return;
      const k = `${r.centro}|${r.goa}`;
      if (!map[k]) map[k] = { sum: 0, cnt: 0 };
      map[k].sum += r.mg;
      map[k].cnt += 1;
    });
    const out = {};
    Object.entries(map).forEach(([k, v]) => {
      out[k] = v.cnt > 0 ? v.sum / v.cnt : 0;
    });
    return out;
  }, [historico]);

  // Plan completo por cruce (con drivers aplicados): venta, mkd, msi, rot, inv promedio, compra
  const planCruceCompleto = useMemo(() => {
    return resumenCruces.map(r => {
      const ventaSugerida = r.totalPlan || 0;
      const ventaInS = r.totalInSeason || 0;
      const crecSug = r.crecPlan || 0;
      const crecAplicado = getCrecAplicado(r.centro, r.goa, crecSug);

      // Si hay override, recalcular venta
      const tieneOverrideCrec = crecCentro[`${r.centro}|${r.goa}`] != null || crecGoa[r.goa] != null;
      const ventaPlanFinal = tieneOverrideCrec && ventaInS > 0
        ? ventaInS * (1 + crecAplicado)
        : ventaSugerida;

      // Markdowns: % por GOA × venta
      const mkdPct = mkdPctGoa[r.goa] != null ? mkdPctGoa[r.goa] : 0;
      const mkdMonto = ventaPlanFinal * mkdPct;

      // MSI: % global × venta plan
      const msiMonto = ventaPlanFinal * msiPct;

      // Rotación
      const rotHist = rotacionHistPromedio[`${r.centro}|${r.goa}`] || 0;
      const rotOverride = rotOverrides[`${r.centro}|${r.goa}`];
      const rotAplicada = rotOverride != null ? rotOverride : rotHist;

      // Inv promedio = Venta / Rotación
      const invPromedio = rotAplicada > 0 ? ventaPlanFinal / rotAplicada : 0;
      // Compra resultante = Venta + ΔInventario (asumimos inv inicial ≈ inv promedio para simplificar en este tab)
      // En Tab 5 se hará el cálculo completo con stock inicial.
      const compra = ventaPlanFinal; // simplificación inicial

      // Mg base histórico (en Tab 5 se aplicará bonificación apertura)
      const mgHist = mgHistPromedio[`${r.centro}|${r.goa}`] || 0;
      const utilidad = ventaPlanFinal * mgHist - mkdMonto;

      return {
        ...r,
        ventaSugerida, ventaPlanFinal, crecSug, crecAplicado, tieneOverrideCrec,
        mkdPct, mkdMonto, msiMonto,
        rotHist, rotOverride, rotAplicada, tieneRotOverride: rotOverride != null,
        invPromedio, compra,
        mgHist, utilidad,
      };
    });
  }, [resumenCruces, getCrecAplicado, crecCentro, crecGoa, mkdPctGoa, msiPct,
      rotacionHistPromedio, rotOverrides, mgHistPromedio]);

  // Filtros Tab 3
  const [t3Tab, setT3Tab]           = useState('otb'); // otb | crec | rot | mkdmsi
  const [t3Filtro, setT3Filtro]     = useState('');
  const [t3FiltroGoa, setT3FiltroGoa] = useState('TODOS');

  const planCruceFiltrado = useMemo(() => {
    let arr = planCruceCompleto;
    if (t3FiltroGoa !== 'TODOS') arr = arr.filter(r => r.goa === t3FiltroGoa);
    if (t3Filtro.trim()) {
      const q = t3Filtro.toLowerCase();
      arr = arr.filter(r => r.centro.toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q));
    }
    return arr;
  }, [planCruceCompleto, t3Filtro, t3FiltroGoa]);

  // Exports
  const exportDrivers = () => {
    const header = ['Centro','Nombre','GOA','Venta Plan','Crec %','Markdown $','MSI $','Rot','Inv Prom','Mg %','Utilidad'];
    const rows = planCruceCompleto.map(r => [
      r.centro, r.nombre, r.goa,
      r.ventaPlanFinal, r.crecAplicado,
      r.mkdMonto, r.msiMonto,
      r.rotAplicada, r.invPromedio,
      r.mgHist, r.utilidad,
    ]);
    downloadExcel([header, ...rows], `Forecast_Drivers_${anioPlan}.csv`);
  };

  // Reset por sección
  const resetOtbOverrides = () => {
    if (!confirm('Eliminar todos los overrides de OTB por GOA?')) return;
    setOtbOverridesGoa({});
  };
  const resetCrecimientos = () => {
    if (!confirm('Eliminar todos los crecimientos manuales (GOA y centro)?')) return;
    setCrecGoa({}); setCrecCentro({});
  };
  const resetRotaciones = () => {
    if (!confirm('Eliminar todos los overrides de rotación?')) return;
    setRotOverrides({});
  };
  const resetMkdMsi = () => {
    if (!confirm('Resetear markdowns por GOA y MSI a valores por defecto?')) return;
    setMkdPctGoa({}); setMsiPct(0.05);
  };

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════

  const tabStyle = (n) =>
    `px-4 py-3 text-xs md:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
      activeTab === n ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`
    }`;

  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>

      {/* ── HEADER ── */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark ? 'bg-orange-500/20' : 'bg-orange-50'}`}>
                <Icons.TrendingUp size={22} className={t.textAccent1} />
              </span>
              Forecast
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>
              Plan por tienda · Regresión histórica · Distribución GOA × Centro · OTB
            </p>
            {resumenHist?.seccionNum && (
              <div className={`mt-3 ml-10 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                isDark
                  ? 'bg-gradient-to-r from-violet-500/15 to-amber-500/10 border-violet-500/30'
                  : 'bg-gradient-to-r from-violet-50 to-amber-50 border-violet-200'
              }`}>
                <span className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>Sección activa</span>
                <span className={`px-2 py-0.5 rounded-md font-mono font-black text-xs ${
                  isDark ? 'bg-violet-500/30 text-violet-200' : 'bg-violet-200 text-violet-900'
                }`}>{resumenHist.seccionNum}</span>
                <span className={`text-sm font-black ${t.textMain}`}>{resumenHist.seccionNombre}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={histInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleHistUpload} />
            <input ref={sesionInputRef} type="file" accept=".json" className="hidden" onChange={cargarSesion} />

            <button onClick={() => histInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14} /> Cargar Histórico
            </button>

            {/* Año del plan */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${t.cardInner}`}>
              <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>Año plan</span>
              <input type="number" value={anioPlan}
                onChange={e => setAnioPlan(parseInt(e.target.value, 10) || anioPlan)}
                className={`w-20 text-xs font-bold px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
            </div>

            {/* Indicadores */}
            {resumenHist && (
              <>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgePurple}`}>
                  {resumenHist.centros} centros · {resumenHist.secciones} secciones · {resumenHist.goas || '—'} GOAs
                </span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeYellow}`}>
                  {resumenHist.anios.join(' · ')} ({resumenHist.mesesUltAnio} meses {resumenHist.ultimoAnio})
                </span>
              </>
            )}

            {/* Menú 3 puntos */}
            <div className="relative">
              <button onClick={() => setMenuAbierto(v => !v)}
                className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${t.btnGhost}`}
                title="Más opciones">
                <Icons.MoreVertical size={16} />
              </button>
              {menuAbierto && (
                <>
                  {/* Backdrop para cerrar al click fuera */}
                  <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
                  <div className={`absolute right-0 mt-2 w-56 rounded-xl border overflow-hidden z-50 ${t.menu}`}>
                    <button onClick={guardarSesion}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold transition-colors ${t.menuItem}`}>
                      <Icons.Download size={14} className={t.textPurple} /> Guardar sesión (.json)
                    </button>
                    <button onClick={() => sesionInputRef.current?.click()}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold transition-colors ${t.menuItem}`}>
                      <Icons.Upload size={14} className={t.textYellow} /> Cargar sesión (.json)
                    </button>
                    {historico.length > 0 && (
                      <button onClick={exportSetup}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold transition-colors ${t.menuItem}`}>
                        <Icons.FileText size={14} className={t.textAccent2} /> Exportar setup (.csv)
                      </button>
                    )}
                    <div className={`border-t ${t.border}`} />
                    <button onClick={limpiarSesion}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold transition-colors ${t.menuItem} text-red-500 hover:text-red-400`}>
                      <Icons.Trash2 size={14} /> Limpiar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
        <div className={`flex border-b ${t.border} px-2 overflow-x-auto custom-scrollbar`}>
          <button className={tabStyle(1)} onClick={() => setActiveTab(1)}>📥 Carga & Setup</button>
          <button className={tabStyle(2)} onClick={() => setActiveTab(2)}>📈 Regresión & In Season</button>
          <button className={tabStyle(3)} onClick={() => setActiveTab(3)}>🎚️ Drivers del Plan</button>
          <button className={tabStyle(4)} onClick={() => setActiveTab(4)}>🧮 Matriz GOA × Centro</button>
          <button className={tabStyle(5)} onClick={() => setActiveTab(5)}>🏬 Plan x Tienda</button>
          <button className={tabStyle(6)} onClick={() => setActiveTab(6)}>📡 Canales</button>
          <button className={tabStyle(7)} onClick={() => setActiveTab(7)}>📊 Resumen OTB</button>
        </div>

        {/* ══════════ TAB 1: CARGA & SETUP ══════════ */}
        {activeTab === 1 && (
          <div className="p-5 space-y-5">

            {/* Estado vacío */}
            {!historico.length && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Upload size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Carga el histórico para empezar</p>
                <p className={`text-xs mt-1 ${t.textMuted} max-w-md`}>
                  Formato wide con 3 filas de header: <strong>Año/Mes_natural</strong> · <strong>Canal_de_Venta</strong> (Piso/Digital/Sin asignar) · <strong>Métricas</strong> (Vtas_U, Vtas_$, %GM, Markdown, Costo_MSI). Cols ID: Seccion, N_Seccion, Centro, N.Seccion, Tipo_Tda, GOA, Medida.
                </p>
              </div>
            )}

            {historico.length > 0 && (
              <>
                {/* KPIs del histórico */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Centros', val: fmt(resumenHist.centros) },
                    { label: 'Secciones', val: fmt(resumenHist.secciones) },
                    { label: 'GOAs', val: resumenHist.goas ? fmt(resumenHist.goas) : '—' },
                    { label: `Cobertura ${resumenHist.ultimoAnio}`, val: `${resumenHist.mesesUltAnio} / 12 meses` },
                    { label: 'Venta hist.', val: fmtMXN(resumenHist.totalVta) },
                  ].map(({ label, val }) => (
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                      <div className={`text-lg font-black ${t.textMain}`}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Split por canal */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>Venta por Canal</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>Físico (Piso + Sin asignar)</div>
                      <div className={`text-lg font-black ${t.textAccent1}`}>{fmtMXN(resumenHist.vtaFisico)}</div>
                      <div className={`text-[10px] ${t.textMuted}`}>{fmtPct(resumenHist.totalVta ? resumenHist.vtaFisico / resumenHist.totalVta : 0)}</div>
                    </div>
                    <div>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>Virtual (Digital)</div>
                      <div className={`text-lg font-black ${t.textAccent2}`}>{fmtMXN(resumenHist.vtaVirtual)}</div>
                      <div className={`text-[10px] ${t.textMuted}`}>{fmtPct(resumenHist.totalVta ? resumenHist.vtaVirtual / resumenHist.totalVta : 0)}</div>
                    </div>
                    <div>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>Kiosko</div>
                      <div className={`text-lg font-black ${t.textMuted}`}>—</div>
                      <div className={`text-[10px] ${t.textMuted}`}>Pendiente columna en CSV</div>
                    </div>
                  </div>
                </div>

                {/* Catálogo de centros + tipo + mes apertura */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                      Catálogo de Centros · {centrosListaFiltrada.length} de {centrosLista.length}
                    </h3>
                  </div>

                  {/* Barra de filtros */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                    <div className="relative md:col-span-2">
                      <Icons.Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
                      <input type="text" placeholder="Buscar centro o nombre..." value={filtroTexto}
                        onChange={e => setFiltroTexto(e.target.value)}
                        className={`w-full text-xs pl-9 pr-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                    </div>
                    <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                      <option value="TODOS">Todos los tipos</option>
                      <option value="NORMAL">Normal</option>
                      <option value="APERTURA">Apertura</option>
                      <option value="NUEVA">Nueva</option>
                    </select>
                    <select value={filtroTipoTda} onChange={e => setFiltroTipoTda(e.target.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                      <option value="TODOS">Todos los Tipo Tda</option>
                      {tiposTdaUnicos.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                    </select>
                  </div>

                  {(filtroTexto || filtroTipo !== 'TODOS' || filtroTipoTda !== 'TODOS') && (
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => { setFiltroTexto(''); setFiltroTipo('TODOS'); setFiltroTipoTda('TODOS'); }}
                        className={`text-[10px] font-bold px-2 py-1 rounded ${t.btnGhost}`}>
                        ✕ Limpiar filtros
                      </button>
                    </div>
                  )}

                  <div className="overflow-x-auto max-h-[45vh] custom-scrollbar">
                    <table className="w-full text-left min-w-max">
                      <thead>
                        <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                          {[
                            { col: 'centro',  label: 'Centro' },
                            { col: 'nombre',  label: 'Nombre' },
                            { col: 'tipoTda', label: 'Tipo Tda' },
                            { col: 'anios',   label: 'Años' },
                            { col: 'vta',     label: 'Venta hist.' },
                            { col: 'tipo',    label: 'Tipo' },
                            { col: null,      label: 'Mes apertura' },
                            { col: 'goas',    label: 'GOAs' },
                            { col: null,      label: '' },
                          ].map(({ col, label }) => (
                            <th key={label} className={`p-2 whitespace-nowrap ${col ? 'cursor-pointer select-none hover:opacity-70' : ''}`}
                              onClick={col ? () => toggleOrden(col) : undefined}>
                              <span className="inline-flex items-center gap-1">
                                {label}
                                {col && ordenCol === col && (
                                  <span className={t.textPurple}>{ordenDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                        {centrosListaFiltrada.map(c => (
                          <tr key={c.centro} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                            <td className={`p-2 font-mono ${t.textMain}`}>{c.centro}</td>
                            <td className={`p-2 ${t.textMuted}`}>{c.nombre}</td>
                            <td className="p-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgeGray}`}>
                                {c.tipoTda || '—'}
                              </span>
                            </td>
                            <td className={`p-2 font-mono text-center ${t.textMuted}`}>{c.anios}</td>
                            <td className={`p-2 font-mono ${t.textPurple}`}>{fmtMXN(c.vta)}</td>
                            <td className="p-2">
                              <select value={c.tipo} onChange={e => cambiarTipoCentro(c.centro, e.target.value)}
                                className={`text-[10px] px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`}>
                                <option value="NORMAL">Normal</option>
                                <option value="APERTURA">Apertura</option>
                              </select>
                            </td>
                            <td className="p-2">
                              {c.tipo === 'APERTURA' ? (
                                <select value={c.mesApertura || ''} onChange={e => cambiarMesApertura(c.centro, e.target.value)}
                                  className={`text-[10px] px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`}>
                                  <option value="">—</option>
                                  {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                                </select>
                              ) : <span className={t.textMuted}>—</span>}
                            </td>
                            <td className="p-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                Object.values(matrizGoaCentro[c.centro] || {}).filter(v => v.activo).length > 0
                                  ? t.badgeYellow : t.badgeGray
                              }`}>
                                {Object.values(matrizGoaCentro[c.centro] || {}).filter(v => v.activo).length}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <button onClick={() => eliminarCentro(c.centro)}
                                className={`p-1.5 rounded-md transition-all opacity-50 hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 ${t.textMuted}`}
                                title="Eliminar centro">
                                <Icons.Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {centrosListaFiltrada.length === 0 && (
                          <tr>
                            <td colSpan={9} className={`p-6 text-center text-xs ${t.textMuted}`}>
                              Sin resultados con los filtros actuales.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tiendas nuevas (no existen en histórico) */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                    Tiendas Nuevas · Sin histórico — se proyectan con benchmark
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                    <input type="text" placeholder="ID centro" value={nuevaCentroId}
                      onChange={e => setNuevaCentroId(e.target.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                    <input type="text" placeholder="Nombre" value={nuevaCentroNom}
                      onChange={e => setNuevaCentroNom(e.target.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                    <select value={nuevaCentroMes} onChange={e => setNuevaCentroMes(parseInt(e.target.value, 10))}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                      {MESES.map((m, i) => <option key={i} value={i+1}>Abre en {m}</option>)}
                    </select>
                    <button onClick={agregarTiendaNueva} disabled={!nuevaCentroId.trim()}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40 ${t.btnPrimary}`}>
                      <Icons.Plus size={13} /> Agregar
                    </button>
                  </div>
                  {Object.keys(aperturas).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aperturas).map(([id, info]) => (
                        <span key={id} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeTeal}`}>
                          {id} · {info.nombre} · {MESES[info.mesApertura - 1]}
                          <button onClick={() => eliminarTiendaNueva(id)} className="opacity-60 hover:opacity-100">
                            <Icons.X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-[10px] ${t.textMuted}`}>No hay tiendas nuevas registradas.</p>
                  )}
                </div>

                {/* Maestro de GOAs · agregar/eliminar */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                    GOAs Maestro · {goasMaestro.length} registrados
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    <input type="text" placeholder="Nuevo GOA (ej. BOTA, TENIS)" value={nuevoGoa}
                      onChange={e => setNuevoGoa(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { agregarGoaMaestro(nuevoGoa); setNuevoGoa(''); } }}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1 md:col-span-2`} />
                    <button onClick={() => { agregarGoaMaestro(nuevoGoa); setNuevoGoa(''); }} disabled={!nuevoGoa.trim()}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40 ${t.btnPrimary}`}>
                      <Icons.Plus size={13} /> Agregar GOA
                    </button>
                  </div>
                  {goasMaestro.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {goasMaestro.map(g => (
                        <span key={g} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>
                          {g}
                          <button onClick={() => eliminarGoaMaestro(g)} className="opacity-60 hover:opacity-100" title="Eliminar GOA y sus cruces">
                            <Icons.X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-[10px] ${t.textMuted}`}>Sin GOAs · agrega uno o carga un CSV con columna GOA.</p>
                  )}
                </div>

                {/* Matriz GOA × Centro × Temporada */}
                {goasMaestro.length > 0 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div>
                        <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                          Matriz GOA × Centro × Temporada
                        </h3>
                        <p className={`text-[10px] mt-1 ${t.textMuted}`}>
                          Click en celda → editar 1 cruce · Click en <strong className={t.textPurple}>nombre del GOA</strong> → aplicar masivo a todas las tiendas
                        </p>
                      </div>
                      <div className={`text-[10px] ${t.textMuted} flex items-center flex-wrap gap-3`}>
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block w-3 h-3 rounded-sm ${isDark ? 'bg-violet-500/80' : 'bg-violet-500'}`}></span> Año completo
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block w-3 h-3 rounded-sm ${isDark ? 'bg-amber-400/80' : 'bg-amber-400'}`}></span> Temporada
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block w-3 h-3 rounded-sm border ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-300'}`}></span> Inactivo
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[55vh] custom-scrollbar">
                      <table className="w-full text-left min-w-max">
                        <thead>
                          <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                            <th className={`p-2 sticky left-0 ${isDark ? 'bg-zinc-900' : 'bg-gray-50'}`}>Centro</th>
                            {goasMaestro.map(g => {
                              // Estado de aplicación: cuántos centros lo tienen activo
                              const allCentros = [...new Set([...centrosLista.map(c => c.centro), ...Object.keys(aperturas)])];
                              const activos = allCentros.filter(c => matrizGoaCentro[c]?.[g]?.activo).length;
                              const total = allCentros.length;
                              return (
                                <th key={g} className="p-1 text-center">
                                  <button
                                    onClick={() => {
                                      // Inicializar con meses actuales del primer cruce activo, o todo el año
                                      const primerActivo = allCentros.map(c => matrizGoaCentro[c]?.[g]).find(v => v?.activo);
                                      setGoaMasivo({ goa: g, meses: primerActivo?.meses || [1,2,3,4,5,6,7,8,9,10,11,12] });
                                    }}
                                    className={`w-full px-2 py-2 rounded-md font-black border transition-all ${
                                      goaMasivo?.goa === g
                                        ? (isDark ? 'bg-violet-500/30 border-violet-400 text-violet-300' : 'bg-violet-100 border-violet-400 text-violet-700')
                                        : `border-transparent ${t.textMuted} hover:${t.textPurple} hover:bg-violet-500/5`
                                    }`}
                                    title={`${activos}/${total} centros con ${g} activo · click para aplicar masivo`}
                                  >
                                    <div>{g}</div>
                                    <div className={`text-[8px] mt-0.5 font-bold ${activos > 0 ? t.textPurple : t.textMuted}`}>
                                      {activos}/{total}
                                    </div>
                                  </button>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                          {[...centrosLista, ...Object.entries(aperturas)
                            .filter(([id]) => !centrosLista.find(c => c.centro === id))
                            .map(([id, info]) => ({
                              centro: id, nombre: info.nombre, tipo: 'NUEVA', vta: 0, anios: 0, tipoTda: 'NUEVA'
                            }))].map(c => (
                            <tr key={c.centro} className={`text-xs ${isDark ? 'hover:bg-zinc-800/20' : 'hover:bg-teal-50/20'}`}>
                              <td className={`p-2 font-mono whitespace-nowrap sticky left-0 ${isDark ? 'bg-zinc-950' : 'bg-gray-50'} ${t.textMain}`}>
                                <div className="flex flex-col">
                                  <span className="font-bold">{c.centro}</span>
                                  <span className={`text-[9px] ${t.textMuted}`}>{c.nombre}</span>
                                </div>
                              </td>
                              {goasMaestro.map(g => {
                                const cruce = matrizGoaCentro[c.centro]?.[g];
                                const activo = !!cruce?.activo;
                                const meses = cruce?.meses || [];
                                const fullYear = activo && meses.length === 12;
                                const partial = activo && meses.length > 0 && meses.length < 12;
                                return (
                                  <td key={g} className="p-1 text-center">
                                    <button
                                      onClick={() => setCelaEditando({ centro: c.centro, goa: g })}
                                      className={`w-full px-2 py-1.5 rounded-md text-[10px] font-black border transition-all ${
                                        fullYear
                                          ? t.cellPurple
                                          : partial
                                            ? t.cellYellow
                                            : (isDark ? 'bg-zinc-800 border-zinc-700 text-gray-500 hover:bg-zinc-700' : 'bg-white border-gray-300 text-gray-400 hover:bg-gray-100')
                                      }`}
                                      title={activo ? `Meses: ${meses.map(m => MESES[m-1]).join(', ')}` : 'Click para activar'}
                                    >
                                      {fullYear ? '✓ TODO' : partial ? `${meses.length} mes${meses.length>1?'es':''}` : '—'}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Editor masivo: aplica meses del GOA a todas las tiendas */}
                    {goaMasivo && (
                      <div className={`mt-3 p-4 rounded-xl border-2 ${isDark ? 'border-violet-500/50 bg-violet-900/10' : 'border-violet-300 bg-violet-50/40'}`}>
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${t.textPurple}`}>⚡ Edición masiva</span>
                            <h4 className={`text-sm font-black ${t.textMain}`}>
                              GOA: <span className={t.textPurple}>{goaMasivo.goa}</span>
                              <span className={`ml-3 text-[11px] font-normal ${t.textMuted}`}>
                                Se aplicará a {[...new Set([...centrosLista.map(c => c.centro), ...Object.keys(aperturas)])].length} centros
                              </span>
                            </h4>
                          </div>
                          <button onClick={() => setGoaMasivo(null)}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>
                            <Icons.X size={12} className="inline" /> Cerrar
                          </button>
                        </div>

                        <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>
                          Selecciona los meses ({goaMasivo.meses.length} seleccionados)
                        </div>

                        <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5 mb-3">
                          {MESES.map((m, i) => {
                            const mes = i + 1;
                            const activo = goaMasivo.meses.includes(mes);
                            return (
                              <button key={mes}
                                onClick={() => setGoaMasivo(prev => ({
                                  ...prev,
                                  meses: prev.meses.includes(mes)
                                    ? prev.meses.filter(x => x !== mes)
                                    : [...prev.meses, mes].sort((a,b) => a-b)
                                }))}
                                className={`px-2 py-2 rounded-md text-[10px] font-black border transition-all ${
                                  activo
                                    ? t.cellPurple
                                    : (isDark ? 'bg-zinc-800 border-zinc-700 text-gray-500 hover:bg-zinc-700' : 'bg-white border-gray-300 text-gray-400 hover:bg-gray-100')
                                }`}
                              >{m}</button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-2 mb-3">
                          <button onClick={() => setGoaMasivo(prev => ({ ...prev, meses: [1,2,3,4,5,6,7,8,9,10,11,12] }))}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>Todo el año</button>
                          <button onClick={() => setGoaMasivo(prev => ({ ...prev, meses: [] }))}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>Limpiar meses</button>
                          <button onClick={() => setGoaMasivo(prev => ({ ...prev, meses: [3,4,5,6,7,8] }))}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>Primavera-Verano</button>
                          <button onClick={() => setGoaMasivo(prev => ({ ...prev, meses: [9,10,11,12,1,2] }))}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>Otoño-Invierno</button>
                        </div>

                        <div className={`flex items-center gap-2 pt-3 border-t ${t.border}`}>
                          <button
                            onClick={() => {
                              if (!confirm(`Esto SOBRESCRIBE el GOA "${goaMasivo.goa}" en TODAS las tiendas con los meses seleccionados. ¿Continuar?`)) return;
                              aplicarGoaMasivo(goaMasivo.goa, goaMasivo.meses, false);
                              setGoaMasivo(null);
                            }}
                            disabled={goaMasivo.meses.length === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40 ${t.btnPurple}`}>
                            <Icons.Zap size={13} /> Aplicar a TODAS las tiendas
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`Esto actualiza solo las tiendas que YA tenían "${goaMasivo.goa}" activo (preserva las apagadas). ¿Continuar?`)) return;
                              aplicarGoaMasivo(goaMasivo.goa, goaMasivo.meses, true);
                              setGoaMasivo(null);
                            }}
                            disabled={goaMasivo.meses.length === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40 ${t.btnYellow}`}>
                            <Icons.Edit size={13} /> Solo a tiendas ya activas
                          </button>
                          <span className={`text-[10px] ${t.textMuted} ml-auto`}>
                            💡 Tip: usa "Solo activas" para no reactivar tiendas que apagaste a propósito.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Editor de temporada individual (popover inline) */}
                    {celaEditando && (
                      <div className={`mt-3 p-4 rounded-xl border-2 ${isDark ? 'border-amber-500/50 bg-amber-900/10' : 'border-amber-300 bg-amber-50/40'}`}>
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${t.textYellow}`}>Editando cruce individual</span>
                            <h4 className={`text-sm font-black ${t.textMain}`}>
                              {celaEditando.centro} · {centros[celaEditando.centro]?.nombre || aperturas[celaEditando.centro]?.nombre || ''}
                              <span className={`mx-2 ${t.textMuted}`}>×</span>
                              <span className={t.textPurple}>{celaEditando.goa}</span>
                            </h4>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setMesesCruce(celaEditando.centro, celaEditando.goa, [1,2,3,4,5,6,7,8,9,10,11,12])}
                              className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>Año completo</button>
                            <button onClick={() => setMesesCruce(celaEditando.centro, celaEditando.goa, [])}
                              className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>Limpiar</button>
                            <button onClick={() => setCelaEditando(null)}
                              className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnYellow}`}>Listo</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
                          {MESES.map((m, i) => {
                            const mes = i + 1;
                            const activo = (matrizGoaCentro[celaEditando.centro]?.[celaEditando.goa]?.meses || []).includes(mes);
                            return (
                              <button key={mes}
                                onClick={() => toggleMesCruce(celaEditando.centro, celaEditando.goa, mes)}
                                className={`px-2 py-2 rounded-md text-[10px] font-black border transition-all ${
                                  activo
                                    ? t.cellYellow
                                    : (isDark ? 'bg-zinc-800 border-zinc-700 text-gray-500 hover:bg-zinc-700' : 'bg-white border-gray-300 text-gray-400 hover:bg-gray-100')
                                }`}
                              >{m}</button>
                            );
                          })}
                        </div>
                        <p className={`text-[10px] mt-3 ${t.textMuted}`}>
                          💡 Tip: marca solo los meses donde este GOA realmente debe planearse en este centro (ej. BOTA solo en Oct-Feb).
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {goasMaestro.length === 0 && (
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <p className={`text-xs ${t.textMuted}`}>
                      💡 No hay GOAs registrados. Carga un CSV con columna <strong>GOA</strong> o agrégalos manualmente arriba.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════ TAB 2: REGRESIÓN & IN SEASON ══════════ */}
        {activeTab === 2 && (
          <div className="p-5 space-y-5">

            {!historico.length && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.TrendingUp size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Carga el histórico primero</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Ve a Tab 1 → Cargar Histórico para activar la regresión.</p>
              </div>
            )}

            {historico.length > 0 && resumenCruces.length === 0 && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Settings size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Sin cruces activos en la matriz</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Ve a Tab 1 → Matriz GOA × Centro y activa al menos un cruce.</p>
              </div>
            )}

            {historico.length > 0 && resumenCruces.length > 0 && (
              <>
                {/* KPIs globales */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {(() => {
                    const totIS = resumenCruces.reduce((s,r) => s + (r.totalInSeason || 0), 0);
                    const totPlan = resumenCruces.reduce((s,r) => s + (r.totalPlan || 0), 0);
                    const totUlt = resumenCruces.reduce((s,r) => s + (r.totalUltAnio || 0), 0);
                    const yoy = totUlt > 0 ? (totIS - totUlt) / totUlt : 0;
                    const crecP = totIS > 0 ? (totPlan - totIS) / totIS : 0;
                    const r2avg = resumenCruces.length ? resumenCruces.reduce((s,r) => s + (r.r2 || 0), 0) / resumenCruces.length : 0;
                    return (
                      <>
                        <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{anioActual - 1} (cierre)</div>
                          <div className={`text-lg font-black ${t.textGray}`}>{fmtMXN(totUlt)}</div>
                        </div>
                        <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>In Season {anioActual}</div>
                          <div className={`text-lg font-black ${t.textYellow}`}>{fmtMXN(totIS)}</div>
                          <div className={`text-[10px] font-bold ${yoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {yoy >= 0 ? '↑' : '↓'} {fmtPct(Math.abs(yoy))} vs {anioActual - 1}
                          </div>
                        </div>
                        <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>Plan {anioPlan}</div>
                          <div className={`text-lg font-black ${t.textPurple}`}>{fmtMXN(totPlan)}</div>
                          <div className={`text-[10px] font-bold ${crecP >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {crecP >= 0 ? '↑' : '↓'} {fmtPct(Math.abs(crecP))} vs InSeason
                          </div>
                        </div>
                        <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>Cruces activos</div>
                          <div className={`text-lg font-black ${t.textMain}`}>{resumenCruces.length}</div>
                          <div className={`text-[10px] ${t.textMuted}`}>Centro × GOA</div>
                        </div>
                        <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>R² promedio</div>
                          <div className={`text-lg font-black ${r2avg >= 0.5 ? 'text-emerald-500' : r2avg >= 0.2 ? t.textYellow : 'text-red-500'}`}>
                            {(r2avg * 100).toFixed(1)}%
                          </div>
                          <div className={`text-[10px] ${t.textMuted}`}>Calidad ajuste</div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* ═══ PANEL DE ESCENARIOS IS ═══ */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                      <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                        Escenarios In Season {anioActual}
                      </h3>
                      <p className={`text-[10px] mt-1 ${t.textMuted}`}>
                        Selecciona el escenario base · IS Editable arranca del activo y permite overrides manuales
                      </p>
                    </div>
                    <button onClick={() => setThresholdsAvanzado(v => !v)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold ${t.btnGhost}`}>
                      <Icons.Settings size={12} /> {thresholdsAvanzado ? 'Cerrar' : 'Configuración avanzada'}
                    </button>
                  </div>

                  {/* Panel avanzado colapsable */}
                  {thresholdsAvanzado && (
                    <div className={`mb-4 p-3 rounded-lg border ${isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-gray-200'}`}>
                      <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>Configuración avanzada</h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Bloque Conservador / Optimista */}
                        <div className="space-y-3">
                          <div>
                            <label className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} block mb-1`}>
                              Pesos Conservador (último/penúlt/antep)
                            </label>
                            <div className="flex gap-1">
                              {thresholds.pesoConservador.map((p, i) => (
                                <input key={i} type="number" step="0.05" min="0" max="1" value={p}
                                  onChange={e => {
                                    const nuevo = [...thresholds.pesoConservador];
                                    nuevo[i] = parseFloat(e.target.value) || 0;
                                    setThresholds(prev => ({ ...prev, pesoConservador: nuevo }));
                                  }}
                                  className={`w-full text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                              ))}
                            </div>
                            <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                              Suma: {thresholds.pesoConservador.reduce((s,v) => s+v, 0).toFixed(2)} (ideal 1.0)
                            </p>
                          </div>
                          <div>
                            <label className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} block mb-1`}>
                              Cap Optimista (% sobre Conservador)
                            </label>
                            <div className="flex items-center gap-1">
                              <input type="number" step="5" min="0" max="100" value={(thresholds.capOptimista * 100).toFixed(0)}
                                onChange={e => setThresholds(prev => ({ ...prev, capOptimista: (parseFloat(e.target.value) || 30) / 100 }))}
                                className={`flex-1 text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                              <span className={t.textMuted}>%</span>
                            </div>
                          </div>
                        </div>

                        {/* Bloque Limpio: Z-score + stockout */}
                        <div className={`p-2 rounded-lg border ${isDark ? 'bg-teal-500/5 border-teal-500/20' : 'bg-teal-50/30 border-teal-200'}`}>
                          <p className={`text-[9px] uppercase font-black tracking-widest mb-2 text-teal-500`}>Detección Limpio</p>

                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <label className={`text-[9px] font-bold ${t.textMuted} block mb-1`}>Z-score mkd/venta (σ)</label>
                              <input type="number" step="0.1" min="0.5" max="3" value={thresholds.zScoreMkd}
                                onChange={e => setThresholds(prev => ({ ...prev, zScoreMkd: parseFloat(e.target.value) || 1.5 }))}
                                className={`w-full text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                            </div>
                            <div>
                              <label className={`text-[9px] font-bold ${t.textMuted} block mb-1`}>Volumen mín. (% prom)</label>
                              <div className="flex items-center gap-1">
                                <input type="number" step="5" min="0" max="100" value={(thresholds.volumenMin * 100).toFixed(0)}
                                  onChange={e => setThresholds(prev => ({ ...prev, volumenMin: (parseFloat(e.target.value) || 10) / 100 }))}
                                  className={`flex-1 text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                                <span className={`text-[9px] ${t.textMuted}`}>%</span>
                              </div>
                            </div>
                          </div>

                          <p className={`text-[9px] uppercase font-black tracking-widest mb-1 mt-2 ${t.textMuted}`}>Stockout</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className={`text-[9px] font-bold ${t.textMuted} block mb-1`}>Local (% adyacentes)</label>
                              <div className="flex items-center gap-1">
                                <input type="number" step="5" min="10" max="80" value={(thresholds.stockoutLocal * 100).toFixed(0)}
                                  onChange={e => setThresholds(prev => ({ ...prev, stockoutLocal: (parseFloat(e.target.value) || 30) / 100 }))}
                                  className={`flex-1 text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                                <span className={`text-[9px] ${t.textMuted}`}>%</span>
                              </div>
                            </div>
                            <div>
                              <label className={`text-[9px] font-bold ${t.textMuted} block mb-1`}>Histórico (% mismo mes)</label>
                              <div className="flex items-center gap-1">
                                <input type="number" step="5" min="10" max="90" value={(thresholds.stockoutHist * 100).toFixed(0)}
                                  onChange={e => setThresholds(prev => ({ ...prev, stockoutHist: (parseFloat(e.target.value) || 50) / 100 }))}
                                  className={`flex-1 text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                                <span className={`text-[9px] ${t.textMuted}`}>%</span>
                              </div>
                            </div>
                            <div>
                              <label className={`text-[9px] font-bold ${t.textMuted} block mb-1`}>Guard estacional</label>
                              <input type="number" step="0.05" min="0.5" max="1" value={thresholds.stockoutFactorGuard}
                                onChange={e => setThresholds(prev => ({ ...prev, stockoutFactorGuard: parseFloat(e.target.value) || 0.75 }))}
                                className={`w-full text-xs font-mono px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className={`text-[9px] mt-3 ${t.textMuted} italic`}>
                        💡 Los valores por defecto funcionan bien para la mayoría de cruces. Ajusta solo si ves falsos positivos en la detección de meses atípicos o stockouts.
                      </p>
                    </div>
                  )}

                  {/* Cards de escenarios — solo visibles si hay un cruce seleccionado */}
                  {t2Calc && !t2Calc.insuficiente && t2Calc.escenarios && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      {[
                        { key: 'conservador', label: 'Conservador', desc: 'Promedio ponderado 60/30/10', color: 'gray', editable: false },
                        { key: 'limpio',      label: 'Limpio',      desc: 'Sin meses promocionales',   color: 'teal', editable: false },
                        { key: 'optimista',   label: 'Optimista',   desc: `Cap +${(thresholds.capOptimista*100).toFixed(0)}% vs Conservador`, color: 'amber', editable: false },
                        { key: 'editable',    label: 'Editable',    desc: 'Base operativa con overrides', color: 'violet', editable: true },
                      ].map(s => {
                        const esActivo = escenarioActivo === s.key;
                        // Total del escenario (ya viene calculado en escenarios[key], excepto editable que es inSeason)
                        const totalEsc = s.key === 'editable'
                          ? t2Calc.inSeason.reduce((a,x) => a + x.valor, 0)
                          : t2Calc.escenarios[s.key].reduce((a,x) => a + x.valor, 0);
                        const conf = t2Calc.confidence[s.key] || 0;
                        const colorMap = {
                          gray:   { bgA: 'bg-zinc-500/15 border-zinc-400', bg: 'bg-zinc-500/5 border-zinc-700/30', text: t.textGray },
                          teal:   { bgA: isDark ? 'bg-teal-500/20 border-teal-400' : 'bg-teal-50 border-teal-400', bg: isDark ? 'bg-teal-500/5 border-teal-700/30' : 'bg-white border-gray-200', text: 'text-teal-500' },
                          amber:  { bgA: isDark ? 'bg-amber-500/20 border-amber-400' : 'bg-amber-50 border-amber-400', bg: isDark ? 'bg-amber-500/5 border-amber-700/30' : 'bg-white border-gray-200', text: t.textYellow },
                          violet: { bgA: isDark ? 'bg-violet-500/20 border-violet-400' : 'bg-violet-50 border-violet-400', bg: isDark ? 'bg-violet-500/5 border-violet-700/30' : 'bg-white border-gray-200', text: t.textPurple },
                        };
                        const c = colorMap[s.color];
                        const overridesEnEsc = s.editable ? Object.keys(inSeasonOverrides).filter(k => k.startsWith(`${t2Centro}|${t2Goa}|${anioActual}|`)).length : 0;
                        return (
                          <button key={s.key}
                            onClick={() => setEscenarioActivo(s.key)}
                            className={`text-left p-3 rounded-lg border-2 transition-all ${esActivo ? c.bgA + ' shadow-md' : c.bg + ' hover:scale-[1.02]'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] font-black uppercase tracking-widest ${c.text}`}>
                                {esActivo && '✓ '}{s.label}
                              </span>
                              {s.editable ? (
                                <Icons.Edit size={12} className={c.text} />
                              ) : (
                                <span className={`text-[8px] font-bold uppercase ${t.textMuted}`}>auto</span>
                              )}
                            </div>
                            <div className={`text-base font-black ${c.text}`}>{fmtMXN(totalEsc)}</div>
                            <div className={`flex items-center justify-between mt-1 text-[9px] ${t.textMuted}`}>
                              <span>{s.desc}</span>
                            </div>
                            <div className={`mt-2 flex items-center gap-1.5`}>
                              <div className={`flex-1 h-1 rounded-full ${isDark ? 'bg-zinc-800' : 'bg-gray-200'} overflow-hidden`}>
                                <div className={`h-full ${c.text.replace('text-','bg-')}`} style={{ width: `${(conf*100).toFixed(0)}%` }}></div>
                              </div>
                              <span className={`text-[9px] font-bold ${c.text}`}>{(conf*100).toFixed(0)}%</span>
                            </div>
                            {s.editable && overridesEnEsc > 0 && (
                              <div className={`mt-1 text-[9px] font-bold ${c.text}`}>{overridesEnEsc} override{overridesEnEsc>1?'s':''}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(!t2Calc || t2Calc.insuficiente) && (
                    <p className={`text-[10px] ${t.textMuted} text-center py-3`}>
                      Selecciona un cruce con datos suficientes abajo para ver los escenarios.
                    </p>
                  )}
                </div>

                {/* ═══ RESUMEN POR GOA (gráfica de barras) ═══ */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                    Resumen por GOA · Plan {anioPlan} con escenario activo
                  </h3>
                  {(() => {
                    const porGoa = {};
                    resumenCruces.forEach(r => {
                      if (!porGoa[r.goa]) porGoa[r.goa] = { goa: r.goa, plan: 0, inSeason: 0, ultAnio: 0, cruces: 0 };
                      porGoa[r.goa].plan     += r.totalPlan || 0;
                      porGoa[r.goa].inSeason += r.totalInSeason || 0;
                      porGoa[r.goa].ultAnio  += r.totalUltAnio || 0;
                      porGoa[r.goa].cruces   += 1;
                    });
                    const arr = Object.values(porGoa).sort((a,b) => b.plan - a.plan);
                    const totSeccionPlan = arr.reduce((s,g) => s + g.plan, 0);
                    const totSeccionInS  = arr.reduce((s,g) => s + g.inSeason, 0);
                    const totSeccionUlt  = arr.reduce((s,g) => s + g.ultAnio, 0);
                    const maxBarra = Math.max(...arr.map(g => g.plan), 1);

                    return (
                      <>
                        {/* Total sección */}
                        <div className={`p-3 rounded-lg border mb-3 ${isDark ? 'bg-violet-900/10 border-violet-500/30' : 'bg-violet-50/50 border-violet-200'}`}>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${t.textPurple}`}>📊 Total Sección</span>
                              {resumenHist?.seccionNum && (
                                <span className={`ml-2 text-xs font-mono font-bold ${t.textMuted}`}>{resumenHist.seccionNum} · {resumenHist.seccionNombre}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span><span className={t.textMuted}>{anioActual-1}: </span><span className={`font-bold ${t.textGray}`}>{fmtMXN(totSeccionUlt)}</span></span>
                              <span><span className={t.textMuted}>InS: </span><span className={`font-bold ${t.textYellow}`}>{fmtMXN(totSeccionInS)}</span></span>
                              <span><span className={t.textMuted}>Plan: </span><span className={`font-black ${t.textPurple}`}>{fmtMXN(totSeccionPlan)}</span></span>
                            </div>
                          </div>
                        </div>

                        {/* Barras por GOA */}
                        <div className="space-y-1.5">
                          {arr.map(g => {
                            const partPlan = totSeccionPlan > 0 ? g.plan / totSeccionPlan : 0;
                            const crecVsUlt = g.ultAnio > 0 ? (g.plan - g.ultAnio) / g.ultAnio : 0;
                            return (
                              <div key={g.goa} className="flex items-center gap-2 text-xs">
                                <div className="w-32 truncate">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{g.goa}</span>
                                </div>
                                <div className="flex-1 relative h-6 rounded-md overflow-hidden">
                                  <div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/40' : 'bg-gray-100'}`}></div>
                                  <div className={`absolute inset-y-0 left-0 ${isDark ? 'bg-violet-500/70' : 'bg-violet-400'} transition-all`}
                                    style={{ width: `${(g.plan / maxBarra) * 100}%` }}></div>
                                  <div className="absolute inset-0 flex items-center justify-between px-2">
                                    <span className={`text-[10px] font-bold ${t.textMain}`}>{fmtMXN(g.plan)}</span>
                                    <span className={`text-[9px] font-bold ${t.textMuted}`}>{(partPlan*100).toFixed(1)}% · {g.cruces} centros</span>
                                  </div>
                                </div>
                                <div className={`w-16 text-right font-mono text-[10px] font-bold ${crecVsUlt >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {crecVsUlt >= 0 ? '↑' : '↓'} {Math.abs(crecVsUlt * 100).toFixed(1)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Selector cruce + Detalle */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>Análisis detallado:</span>
                    <select value={t2Centro} onChange={e => setT2Centro(e.target.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1 min-w-[200px]`}>
                      {Array.from(new Set(crucesActivos.map(c => c.centro))).sort().map(c => (
                        <option key={c} value={c}>{c} · {centros[c]?.nombre || aperturas[c]?.nombre || c}</option>
                      ))}
                    </select>
                    <span className={t.textMuted}>×</span>
                    <select value={t2Goa} onChange={e => setT2Goa(e.target.value)}
                      className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                      {Array.from(new Set(crucesActivos.filter(c => c.centro === t2Centro).map(c => c.goa))).sort().map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    {t2Calc?.mesesAplicables && (
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${t.badgeYellow}`}>
                        Temporada: {t2Calc.mesesAplicables.length === 12 ? 'Todo el año' : t2Calc.mesesAplicables.map(m => MESES[m-1]).join(', ')}
                      </span>
                    )}
                  </div>

                  {t2Calc?.insuficiente ? (
                    <p className={`text-xs ${t.textMuted} p-4 text-center`}>{t2Calc.error || 'Sin datos suficientes para regresión.'}</p>
                  ) : t2Calc && (
                    <>
                      {/* KPIs del cruce */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>{anioActual - 1}</div>
                          <div className={`text-base font-black ${t.textGray}`}>{fmtMXN(t2Calc.kpis.totalUltAnio)}</div>
                        </div>
                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>In Season {anioActual}</div>
                          <div className={`text-base font-black ${t.textYellow}`}>{fmtMXN(t2Calc.kpis.totalInSeason)}</div>
                          <div className={`text-[9px] font-bold ${t2Calc.kpis.crecYoY >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {fmtPct(t2Calc.kpis.crecYoY)}
                          </div>
                        </div>
                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>Plan {anioPlan}</div>
                          <div className={`text-base font-black ${t.textPurple}`}>{fmtMXN(t2Calc.kpis.totalPlan)}</div>
                          <div className={`text-[9px] font-bold ${t2Calc.kpis.crecPlan >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {fmtPct(t2Calc.kpis.crecPlan)}
                          </div>
                        </div>
                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>R² regresión</div>
                          <div className={`text-base font-black ${t2Calc.kpis.r2 >= 0.5 ? 'text-emerald-500' : t2Calc.kpis.r2 >= 0.2 ? t.textYellow : 'text-red-500'}`}>
                            {(t2Calc.kpis.r2 * 100).toFixed(1)}%
                          </div>
                          <div className={`text-[9px] ${t.textMuted}`}>Pendiente {t2Calc.regresion.slope >= 0 ? '↑' : '↓'} {fmt(Math.abs(t2Calc.regresion.slope), 0)}/mes</div>
                        </div>
                      </div>

                      {/* Gráfico */}
                      <div className={`p-3 rounded-lg border mb-4 ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>
                            Evolución mensual · histórico + proyección
                          </span>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="inline-flex items-center gap-1"><span className={`inline-block w-3 h-0.5 ${isDark ? 'bg-amber-400' : 'bg-amber-500'}`}></span>Real</span>
                            <span className="inline-flex items-center gap-1"><span className={`inline-block w-3 h-0.5 border-t border-dashed ${isDark ? 'border-violet-400' : 'border-violet-500'}`} style={{borderStyle:'dashed', borderTopWidth: '2px'}}></span>Proyección</span>
                          </div>
                        </div>
                        <LineForecast
                          historico={t2Calc.serie.map(s => ({ y: s.venta, label: `${MESES[s.mes-1]}-${s.anio}` }))}
                          proyeccion={[
                            ...t2Calc.inSeason.filter(x => x.fuente !== 'real').map(x => ({ y: x.valor })),
                            ...t2Calc.plan.map(x => ({ y: x.valor })),
                          ]}
                          theme={theme}
                          height={140}
                        />
                      </div>

                      {/* Tabla mensual */}
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2 sticky left-0 bg-inherit">Año</th>
                              {MESES.map(m => <th key={m} className="p-2 text-right">{m}</th>)}
                              <th className="p-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {/* Años cerrados */}
                            {aniosCerrados.map(anio => {
                              const fila = MESES.map((_, i) => {
                                const k = `${t2Centro}|${t2Goa}|${anio}|${i+1}`;
                                return histCxG[k]?.venta || 0;
                              });
                              const tot = fila.reduce((s,v) => s+v, 0);
                              return (
                                <tr key={anio} className="text-xs">
                                  <td className={`p-2 font-mono font-bold sticky left-0 ${isDark ? 'bg-zinc-950' : 'bg-gray-50'} ${t.textGray}`}>{anio}</td>
                                  {fila.map((v, i) => (
                                    <td key={i} className={`p-2 text-right font-mono ${v > 0 ? t.textMuted : 'opacity-30'}`}>
                                      {v > 0 ? fmt(v, 0) : '—'}
                                    </td>
                                  ))}
                                  <td className={`p-2 text-right font-mono font-black ${t.textGray}`}>{fmt(tot, 0)}</td>
                                </tr>
                              );
                            })}

                            {/* Año actual: In Season editable */}
                            <tr className={`text-xs ${isDark ? 'bg-amber-900/10' : 'bg-amber-50/50'}`}>
                              <td className={`p-2 font-mono font-bold sticky left-0 ${isDark ? 'bg-zinc-950' : 'bg-gray-50'} ${t.textYellow}`}>
                                {anioActual} <span className="text-[9px] font-normal">(InS)</span>
                              </td>
                              {t2Calc.inSeason.map((x) => {
                                const overrideKey = `${t2Centro}|${t2Goa}|${anioActual}|${x.mes}`;
                                const tieneOverride = inSeasonOverrides[overrideKey] !== undefined;
                                const editable = x.fuente !== 'real';
                                return (
                                  <td key={x.mes} className="p-1 text-right">
                                    {editable ? (
                                      <div className="flex items-center justify-end gap-0.5">
                                        <NumberInputDeferred
                                          value={Math.round(x.valor)}
                                          onCommit={(parsed) => {
                                            if (parsed === null) limpiarOverride(t2Centro, t2Goa, x.mes);
                                            else editarInSeason(t2Centro, t2Goa, x.mes, parsed);
                                          }}
                                          className={`w-20 text-right font-mono text-xs px-1.5 py-1 rounded border ${
                                            tieneOverride
                                              ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                              : (isDark ? 'bg-zinc-900 border-zinc-700 text-violet-300' : 'bg-violet-50 border-violet-200 text-violet-700')
                                          } focus:outline-none focus:ring-1 focus:ring-amber-500`}
                                          title={tieneOverride
                                            ? `Editado · sugerido era ${fmt(x.sugerido, 0)}`
                                            : 'Sugerido por regresión + estacionalidad'} />
                                        {tieneOverride && (
                                          <button onClick={() => limpiarOverride(t2Centro, t2Goa, x.mes)}
                                            className={`text-[9px] ${t.textMuted} hover:text-red-500`} title="Restaurar sugerido">
                                            ↺
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className={`font-mono font-bold ${t.textMain}`}>{fmt(x.valor, 0)}</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className={`p-2 text-right font-mono font-black ${t.textYellow}`}>
                                {fmt(t2Calc.inSeason.reduce((s,x) => s + x.valor, 0), 0)}
                              </td>
                            </tr>

                            {/* Año plan */}
                            <tr className={`text-xs ${isDark ? 'bg-violet-900/10' : 'bg-violet-50/50'}`}>
                              <td className={`p-2 font-mono font-bold sticky left-0 ${isDark ? 'bg-zinc-950' : 'bg-gray-50'} ${t.textPurple}`}>
                                {anioPlan} <span className="text-[9px] font-normal">(Plan)</span>
                              </td>
                              {t2Calc.plan.map((x) => (
                                <td key={x.mes} className={`p-2 text-right font-mono ${x.valor > 0 ? t.textPurple : 'opacity-30'}`}>
                                  {x.valor > 0 ? fmt(x.valor, 0) : '—'}
                                </td>
                              ))}
                              <td className={`p-2 text-right font-mono font-black ${t.textPurple}`}>
                                {fmt(t2Calc.plan.reduce((s,x) => s + x.valor, 0), 0)}
                              </td>
                            </tr>

                            {/* Factores estacionales */}
                            <tr className={`text-xs ${isDark ? 'bg-zinc-900/40' : 'bg-gray-50'}`}>
                              <td className={`p-2 font-mono sticky left-0 ${isDark ? 'bg-zinc-950' : 'bg-gray-50'} ${t.textMuted} text-[10px]`}>Factor estac.</td>
                              {MESES.map((_, i) => {
                                const f = t2Calc.factores[i+1] || 1;
                                const above = f > 1.05, below = f < 0.95;
                                return (
                                  <td key={i} className={`p-2 text-right font-mono text-[10px] ${
                                    above ? 'text-emerald-500' : below ? 'text-red-500' : t.textMuted
                                  }`}>
                                    {f.toFixed(2)}
                                  </td>
                                );
                              })}
                              <td className={`p-2 text-right ${t.textMuted} text-[10px]`}>—</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                        <p className={`text-[10px] ${t.textMuted}`}>
                          💡 Celdas <span className={t.textPurple}>moradas</span> = sugerido por regresión · <span className={t.textYellow}>amarillas</span> = editadas manualmente · click ↺ para restaurar.
                        </p>
                        {Object.keys(inSeasonOverrides).length > 0 && (
                          <button onClick={limpiarTodosOverrides}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>
                            ↺ Restaurar todos los sugeridos ({Object.keys(inSeasonOverrides).length})
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Tabla resumen de todos los cruces */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                      Resumen de todos los cruces · {resumenCrucesFiltrado.length} de {resumenCruces.length}
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Icons.Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
                        <input type="text" placeholder="Filtrar por centro o GOA..." value={t2Filtro}
                          onChange={e => setT2Filtro(e.target.value)}
                          className={`text-xs pl-9 pr-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                      </div>
                      <button onClick={exportRegresion}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${t.btnSecondary}`}>
                        <Icons.Download size={13} /> Exportar
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[50vh] custom-scrollbar">
                    <table className="w-full text-left min-w-max">
                      <thead>
                        <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                          <th className="p-2">Centro</th>
                          <th className="p-2">GOA</th>
                          <th className="p-2 text-right">{anioActual - 1}</th>
                          <th className="p-2 text-right">In Season</th>
                          <th className="p-2 text-right">% YoY</th>
                          <th className="p-2 text-right">Plan {anioPlan}</th>
                          <th className="p-2 text-right">% Crec.</th>
                          <th className="p-2 text-right">R²</th>
                          <th className="p-2 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                        {resumenCrucesFiltrado.map(r => (
                          <tr key={`${r.centro}|${r.goa}`}
                            className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'} ${
                              t2Centro === r.centro && t2Goa === r.goa ? (isDark ? 'bg-violet-900/20' : 'bg-violet-50') : ''
                            }`}>
                            <td className={`p-2 font-mono ${t.textMain}`}>
                              {r.centro} <span className={`text-[9px] ${t.textMuted}`}>· {r.nombre}</span>
                            </td>
                            <td className="p-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{r.goa}</span>
                            </td>
                            <td className={`p-2 text-right font-mono ${t.textGray}`}>{fmt(r.totalUltAnio || 0, 0)}</td>
                            <td className={`p-2 text-right font-mono ${t.textYellow}`}>{fmt(r.totalInSeason || 0, 0)}</td>
                            <td className={`p-2 text-right font-mono font-bold ${(r.crecYoY || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {fmtPct(r.crecYoY || 0)}
                            </td>
                            <td className={`p-2 text-right font-mono ${t.textPurple}`}>{fmt(r.totalPlan || 0, 0)}</td>
                            <td className={`p-2 text-right font-mono font-bold ${(r.crecPlan || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {fmtPct(r.crecPlan || 0)}
                            </td>
                            <td className={`p-2 text-right font-mono ${(r.r2 || 0) >= 0.5 ? 'text-emerald-500' : (r.r2 || 0) >= 0.2 ? t.textYellow : 'text-red-500'}`}>
                              {((r.r2 || 0) * 100).toFixed(0)}%
                            </td>
                            <td className="p-2 text-center">
                              <button onClick={() => { setT2Centro(r.centro); setT2Goa(r.goa); }}
                                className={`text-[10px] font-bold px-2 py-1 rounded ${t.btnGhost}`}>Ver</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════ TAB 3: DRIVERS DEL PLAN ══════════ */}
        {activeTab === 3 && (
          <div className="p-5 space-y-5">

            {!historico.length && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Settings size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Carga el histórico primero (Tab 1)</p>
              </div>
            )}

            {historico.length > 0 && resumenCruces.length === 0 && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <p className={`text-sm font-bold ${t.textMain}`}>Sin cruces activos. Activa la matriz en Tab 1.</p>
              </div>
            )}

            {historico.length > 0 && resumenCruces.length > 0 && (
              <>
                {/* KPIs maestros del plan */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>OTB capturado</div>
                    <div className={`text-lg font-black ${t.textPurple}`}>{otbTotal > 0 ? fmtMXN(otbTotal) : '—'}</div>
                    <div className={`text-[10px] ${t.textMuted}`}>Departamento</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>OTB aplicado</div>
                    <div className={`text-lg font-black ${t.textYellow}`}>{fmtMXN(otbAplicadoTotal)}</div>
                    <div className={`text-[10px] ${otbDiff === 0 ? t.textMuted : Math.abs(otbDiff) > otbTotal * 0.01 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {otbDiff === 0 ? 'En línea' : (otbDiff > 0 ? '+' : '') + fmtMXN(otbDiff)}
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>Plan sugerido</div>
                    <div className={`text-lg font-black ${t.textGray}`}>{fmtMXN(planSugeridoTotal)}</div>
                    <div className={`text-[10px] ${t.textMuted}`}>Por regresión</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>Plan con drivers</div>
                    <div className={`text-lg font-black ${t.textPurple}`}>
                      {fmtMXN(planCruceCompleto.reduce((s,r) => s + r.ventaPlanFinal, 0))}
                    </div>
                    <div className={`text-[10px] ${t.textMuted}`}>Con overrides</div>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>Utilidad estimada</div>
                    <div className={`text-lg font-black text-emerald-500`}>
                      {fmtMXN(planCruceCompleto.reduce((s,r) => s + r.utilidad, 0))}
                    </div>
                    <div className={`text-[10px] ${t.textMuted}`}>Pre-bonificación</div>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className={`flex gap-1 border-b ${t.border} overflow-x-auto custom-scrollbar`}>
                  {[
                    { id: 'otb',    label: 'OTB Departamento',     icon: '💰' },
                    { id: 'crec',   label: 'Crecimientos',         icon: '📈' },
                    { id: 'rot',    label: 'Rotación',             icon: '🔄' },
                    { id: 'mkdmsi', label: 'Markdowns & MSI',      icon: '🏷️' },
                  ].map(s => (
                    <button key={s.id} onClick={() => setT3Tab(s.id)}
                      className={`px-4 py-2.5 text-xs font-black border-b-2 transition-all whitespace-nowrap ${
                        t3Tab === s.id ? `border-violet-500 ${t.textPurple}` : `border-transparent ${t.textMuted} hover:${t.textMain}`
                      }`}>
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>

                {/* ══════ Sub-tab OTB ══════ */}
                {t3Tab === 'otb' && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                        Captura del OTB Total · Departamento {anioPlan}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div className="md:col-span-2">
                          <label className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>OTB Total ($)</label>
                          <NumberInputDeferred
                            value={otbTotal || ''}
                            placeholder={`Sugerido: ${Math.round(planSugeridoTotal).toLocaleString()}`}
                            onCommit={(parsed) => setOtbTotal(parsed || 0)}
                            className={`w-full text-lg font-black px-4 py-3 rounded-lg border ${t.input} focus:outline-none focus:ring-2 focus:ring-violet-500`} />
                        </div>
                        <div className="flex flex-col gap-2">
                          <button onClick={() => setOtbTotal(Math.round(planSugeridoTotal))}
                            className={`px-3 py-2 rounded-lg text-xs font-bold ${t.btnGhost}`}>
                            ⚡ Usar sugerido ({fmtMXN(planSugeridoTotal)})
                          </button>
                          <button onClick={() => setOtbTotal(0)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold ${t.btnGhost}`}>
                            ✕ Limpiar
                          </button>
                        </div>
                      </div>
                      <p className={`text-[10px] ${t.textMuted}`}>
                        💡 Si dejas en 0, el sistema usa el plan sugerido como base. Captura un valor para forzar tu OTB objetivo.
                      </p>
                    </div>

                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                          Distribución por GOA · Sugerido vs Override
                        </h3>
                        {Object.keys(otbOverridesGoa).length > 0 && (
                          <button onClick={resetOtbOverrides}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>
                            ↺ Restaurar sugeridos ({Object.keys(otbOverridesGoa).length})
                          </button>
                        )}
                      </div>

                      {Math.abs(otbDiff) > (otbTotal * 0.01) && otbTotal > 0 && (
                        <div className={`p-3 mb-3 rounded-lg border ${otbDiff > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                          <p className="text-xs font-bold">
                            ⚠️ La suma de los GOAs ({fmtMXN(otbAplicadoTotal)}) {otbDiff > 0 ? 'EXCEDE' : 'es MENOR'} al OTB capturado ({fmtMXN(otbTotal)}) por <strong>{fmtMXN(Math.abs(otbDiff))}</strong>.
                          </p>
                        </div>
                      )}

                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2">GOA</th>
                              <th className="p-2 text-right">Plan sugerido</th>
                              <th className="p-2 text-right">% Part. sug.</th>
                              <th className="p-2 text-right">OTB sugerido</th>
                              <th className="p-2 text-right">Override $</th>
                              <th className="p-2 text-right">OTB aplicado</th>
                              <th className="p-2 text-right">% Part. apl.</th>
                              <th className="p-2 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {goasMaestro.map(g => {
                              const d = otbPorGoa[g];
                              if (!d) return null;
                              const tieneOverride = d.override != null;
                              return (
                                <tr key={g} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                                  <td className="p-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{g}</span>
                                  </td>
                                  <td className={`p-2 text-right font-mono ${t.textGray}`}>{fmtMXN(planSugeridoPorGoa[g] || 0)}</td>
                                  <td className={`p-2 text-right font-mono ${t.textMuted}`}>{fmtPct(d.partSug)}</td>
                                  <td className={`p-2 text-right font-mono ${t.textYellow}`}>{fmtMXN(d.sugerido)}</td>
                                  <td className="p-2 text-right">
                                    <NumberInputDeferred
                                      value={tieneOverride ? Math.round(d.override) : ''}
                                      placeholder={Math.round(d.sugerido).toLocaleString()}
                                      onCommit={(parsed) => {
                                        setOtbOverridesGoa(prev => {
                                          const n = { ...prev };
                                          if (parsed === null) delete n[g];
                                          else n[g] = parsed;
                                          return n;
                                        });
                                      }}
                                      className={`w-32 text-right font-mono text-xs px-2 py-1 rounded border ${
                                        tieneOverride
                                          ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                          : t.input
                                      } focus:outline-none focus:ring-1`} />
                                  </td>
                                  <td className={`p-2 text-right font-mono font-black ${tieneOverride ? t.textYellow : t.textPurple}`}>
                                    {fmtMXN(d.aplicado)}
                                  </td>
                                  <td className={`p-2 text-right font-mono ${t.textMuted}`}>{fmtPct(d.partApl)}</td>
                                  <td className="p-2 text-center">
                                    {tieneOverride && (
                                      <button onClick={() => setOtbOverridesGoa(prev => { const n = { ...prev }; delete n[g]; return n; })}
                                        className={`text-[10px] ${t.textMuted} hover:text-red-500`} title="Restaurar sugerido">↺</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className={`text-xs font-black ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}>
                              <td className={`p-2 ${t.textMain}`}>TOTAL</td>
                              <td className={`p-2 text-right font-mono ${t.textGray}`}>{fmtMXN(planSugeridoTotal)}</td>
                              <td className={`p-2 text-right font-mono ${t.textMuted}`}>100%</td>
                              <td className={`p-2 text-right font-mono ${t.textYellow}`}>{fmtMXN(otbTotal > 0 ? otbTotal : planSugeridoTotal)}</td>
                              <td className="p-2"></td>
                              <td className={`p-2 text-right font-mono ${t.textPurple}`}>{fmtMXN(otbAplicadoTotal)}</td>
                              <td className={`p-2 text-right font-mono ${t.textMuted}`}>100%</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════ Sub-tab Crecimientos ══════ */}
                {t3Tab === 'crec' && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                          Crecimiento por GOA · Override del crecimiento sugerido
                        </h3>
                        {(Object.keys(crecGoa).length + Object.keys(crecCentro).length) > 0 && (
                          <button onClick={resetCrecimientos}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>
                            ↺ Limpiar todos ({Object.keys(crecGoa).length + Object.keys(crecCentro).length})
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2">GOA</th>
                              <th className="p-2 text-right">Plan sugerido</th>
                              <th className="p-2 text-right">In Season</th>
                              <th className="p-2 text-right">% Crec. sug.</th>
                              <th className="p-2 text-center">% Crec. override</th>
                              <th className="p-2 text-right">Plan ajustado</th>
                              <th className="p-2 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {goasMaestro.map(g => {
                              const cruces = resumenCruces.filter(r => r.goa === g);
                              const planSug = cruces.reduce((s,r) => s + (r.totalPlan || 0), 0);
                              const inSeason = cruces.reduce((s,r) => s + (r.totalInSeason || 0), 0);
                              const crecSug = inSeason > 0 ? (planSug - inSeason) / inSeason : 0;
                              const overridePct = crecGoa[g];
                              const tieneOverride = overridePct != null;
                              const planAjustado = tieneOverride ? inSeason * (1 + overridePct) : planSug;
                              return (
                                <tr key={g} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                                  <td className="p-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{g}</span>
                                  </td>
                                  <td className={`p-2 text-right font-mono ${t.textGray}`}>{fmtMXN(planSug)}</td>
                                  <td className={`p-2 text-right font-mono ${t.textYellow}`}>{fmtMXN(inSeason)}</td>
                                  <td className={`p-2 text-right font-mono ${crecSug >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmtPct(crecSug)}</td>
                                  <td className="p-2 text-center">
                                    <div className="inline-flex items-center gap-1">
                                      <NumberInputDeferred
                                        value={tieneOverride ? (overridePct * 100).toFixed(1) : ''}
                                        placeholder={(crecSug * 100).toFixed(1)}
                                        onCommit={(parsed) => {
                                          setCrecGoa(prev => {
                                            const n = { ...prev };
                                            if (parsed === null) delete n[g];
                                            else n[g] = parsed / 100;
                                            return n;
                                          });
                                        }}
                                        className={`w-20 text-right font-mono text-xs px-2 py-1 rounded border ${
                                          tieneOverride
                                            ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                            : t.input
                                        } focus:outline-none focus:ring-1`} />
                                      <span className={`text-[10px] ${t.textMuted}`}>%</span>
                                    </div>
                                  </td>
                                  <td className={`p-2 text-right font-mono font-black ${tieneOverride ? t.textYellow : t.textPurple}`}>{fmtMXN(planAjustado)}</td>
                                  <td className="p-2 text-center">
                                    {tieneOverride && (
                                      <button onClick={() => setCrecGoa(prev => { const n = { ...prev }; delete n[g]; return n; })}
                                        className={`text-[10px] ${t.textMuted} hover:text-red-500`}>↺</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Override por centro × GOA */}
                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                        Override por Centro × GOA · Solo casos específicos (toma prioridad sobre crec. GOA)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                        <div className="relative md:col-span-2">
                          <Icons.Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
                          <input type="text" placeholder="Buscar centro o nombre..." value={t3Filtro}
                            onChange={e => setT3Filtro(e.target.value)}
                            className={`w-full text-xs pl-9 pr-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                        </div>
                        <select value={t3FiltroGoa} onChange={e => setT3FiltroGoa(e.target.value)}
                          className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                          <option value="TODOS">Todos los GOAs</option>
                          {goasMaestro.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div className="overflow-x-auto max-h-[40vh] custom-scrollbar">
                        <table className="w-full text-left min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2">Centro</th>
                              <th className="p-2">GOA</th>
                              <th className="p-2 text-right">In Season</th>
                              <th className="p-2 text-right">Plan sug.</th>
                              <th className="p-2 text-right">% Crec. apl.</th>
                              <th className="p-2 text-center">Override centro</th>
                              <th className="p-2 text-right">Plan final</th>
                              <th className="p-2 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {planCruceFiltrado.map(r => {
                              const k = `${r.centro}|${r.goa}`;
                              const tieneOverride = crecCentro[k] != null;
                              return (
                                <tr key={k} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                                  <td className={`p-2 font-mono ${t.textMain}`}>
                                    {r.centro} <span className={`text-[9px] ${t.textMuted}`}>· {r.nombre}</span>
                                  </td>
                                  <td className="p-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{r.goa}</span></td>
                                  <td className={`p-2 text-right font-mono ${t.textYellow}`}>{fmt(r.totalInSeason || 0, 0)}</td>
                                  <td className={`p-2 text-right font-mono ${t.textGray}`}>{fmt(r.ventaSugerida, 0)}</td>
                                  <td className={`p-2 text-right font-mono ${r.crecAplicado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmtPct(r.crecAplicado)}</td>
                                  <td className="p-2 text-center">
                                    <div className="inline-flex items-center gap-1">
                                      <NumberInputDeferred
                                        value={tieneOverride ? (crecCentro[k] * 100).toFixed(1) : ''}
                                        placeholder="—"
                                        onCommit={(parsed) => {
                                          setCrecCentro(prev => {
                                            const n = { ...prev };
                                            if (parsed === null) delete n[k];
                                            else n[k] = parsed / 100;
                                            return n;
                                          });
                                        }}
                                        className={`w-16 text-right font-mono text-xs px-1.5 py-1 rounded border ${
                                          tieneOverride
                                            ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                            : t.input
                                        } focus:outline-none focus:ring-1`} />
                                      <span className={`text-[10px] ${t.textMuted}`}>%</span>
                                    </div>
                                  </td>
                                  <td className={`p-2 text-right font-mono font-black ${r.tieneOverrideCrec ? t.textYellow : t.textPurple}`}>{fmt(r.ventaPlanFinal, 0)}</td>
                                  <td className="p-2 text-center">
                                    {tieneOverride && (
                                      <button onClick={() => setCrecCentro(prev => { const n = { ...prev }; delete n[k]; return n; })}
                                        className={`text-[10px] ${t.textMuted} hover:text-red-500`}>↺</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════ Sub-tab Rotación ══════ */}
                {t3Tab === 'rot' && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div>
                          <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                            Rotación por Centro × GOA · Sugerido = promedio histórico
                          </h3>
                          <p className={`text-[10px] mt-1 ${t.textMuted}`}>
                            Inv. Promedio = Venta Plan / Rotación · A mayor rotación, menor inventario y menor compra.
                          </p>
                        </div>
                        {Object.keys(rotOverrides).length > 0 && (
                          <button onClick={resetRotaciones}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>
                            ↺ Limpiar overrides ({Object.keys(rotOverrides).length})
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                        <div className="relative md:col-span-2">
                          <Icons.Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
                          <input type="text" placeholder="Buscar centro..." value={t3Filtro}
                            onChange={e => setT3Filtro(e.target.value)}
                            className={`w-full text-xs pl-9 pr-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                        </div>
                        <select value={t3FiltroGoa} onChange={e => setT3FiltroGoa(e.target.value)}
                          className={`text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                          <option value="TODOS">Todos los GOAs</option>
                          {goasMaestro.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>

                      <div className="overflow-x-auto max-h-[55vh] custom-scrollbar">
                        <table className="w-full text-left min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2">Centro</th>
                              <th className="p-2">GOA</th>
                              <th className="p-2 text-right">Venta Plan</th>
                              <th className="p-2 text-right">Rot. hist.</th>
                              <th className="p-2 text-center">Rot. override</th>
                              <th className="p-2 text-right">Rot. aplicada</th>
                              <th className="p-2 text-right">Inv. Promedio</th>
                              <th className="p-2 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {planCruceFiltrado.map(r => {
                              const k = `${r.centro}|${r.goa}`;
                              return (
                                <tr key={k} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                                  <td className={`p-2 font-mono ${t.textMain}`}>
                                    {r.centro} <span className={`text-[9px] ${t.textMuted}`}>· {r.nombre}</span>
                                  </td>
                                  <td className="p-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{r.goa}</span></td>
                                  <td className={`p-2 text-right font-mono ${t.textPurple}`}>{fmt(r.ventaPlanFinal, 0)}</td>
                                  <td className={`p-2 text-right font-mono ${r.rotHist > 0 ? t.textGray : 'opacity-40'}`}>
                                    {r.rotHist > 0 ? r.rotHist.toFixed(2) : '—'}
                                  </td>
                                  <td className="p-2 text-center">
                                    <NumberInputDeferred
                                      value={r.tieneRotOverride ? r.rotOverride.toFixed(2) : ''}
                                      placeholder={r.rotHist > 0 ? r.rotHist.toFixed(2) : '0.00'}
                                      onCommit={(parsed) => {
                                        setRotOverrides(prev => {
                                          const n = { ...prev };
                                          if (parsed === null) delete n[k];
                                          else n[k] = parsed;
                                          return n;
                                        });
                                      }}
                                      className={`w-20 text-right font-mono text-xs px-2 py-1 rounded border ${
                                        r.tieneRotOverride
                                          ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                          : t.input
                                      } focus:outline-none focus:ring-1`} />
                                  </td>
                                  <td className={`p-2 text-right font-mono font-black ${r.tieneRotOverride ? t.textYellow : t.textMain}`}>
                                    {r.rotAplicada > 0 ? r.rotAplicada.toFixed(2) : '—'}
                                  </td>
                                  <td className={`p-2 text-right font-mono ${t.textPurple}`}>{fmt(r.invPromedio, 0)}</td>
                                  <td className="p-2 text-center">
                                    {r.tieneRotOverride && (
                                      <button onClick={() => setRotOverrides(prev => { const n = { ...prev }; delete n[k]; return n; })}
                                        className={`text-[10px] ${t.textMuted} hover:text-red-500`}>↺</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════ Sub-tab Markdowns & MSI ══════ */}
                {t3Tab === 'mkdmsi' && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                        MSI · % global sobre venta proyectada
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>% MSI</label>
                          <div className="relative">
                            <NumberInputDeferred
                              value={(msiPct * 100).toFixed(1)}
                              onCommit={(parsed) => setMsiPct((parsed || 0) / 100)}
                              className={`w-full text-lg font-black px-4 py-3 pr-8 rounded-lg border ${t.input} focus:outline-none focus:ring-2 focus:ring-violet-500`} />
                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${t.textMuted}`}>%</span>
                          </div>
                        </div>
                        <div className={`p-4 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'} md:col-span-2`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted}`}>MSI total estimado</div>
                          <div className={`text-2xl font-black ${t.textPurple}`}>
                            {fmtMXN(planCruceCompleto.reduce((s,r) => s + r.msiMonto, 0))}
                          </div>
                          <div className={`text-[10px] ${t.textMuted}`}>
                            = Venta Plan ({fmtMXN(planCruceCompleto.reduce((s,r) => s + r.ventaPlanFinal, 0))}) × {(msiPct * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                          Markdowns por GOA · % sobre venta plan
                        </h3>
                        {(Object.keys(mkdPctGoa).length > 0 || msiPct !== 0.05) && (
                          <button onClick={resetMkdMsi}
                            className={`text-[10px] font-bold px-3 py-1.5 rounded ${t.btnGhost}`}>↺ Reset</button>
                        )}
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2">GOA</th>
                              <th className="p-2 text-right">Venta Plan</th>
                              <th className="p-2 text-center">% Markdown</th>
                              <th className="p-2 text-right">$ Markdown</th>
                              <th className="p-2 text-right">% Mg hist.</th>
                              <th className="p-2 text-right">Utilidad estimada</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                            {goasMaestro.map(g => {
                              const cruces = planCruceCompleto.filter(r => r.goa === g);
                              const ventaG = cruces.reduce((s,r) => s + r.ventaPlanFinal, 0);
                              const mkdGoaPct = mkdPctGoa[g] || 0;
                              const mkdMonto = ventaG * mkdGoaPct;
                              const mgPromGoa = cruces.length ? cruces.reduce((s,r) => s + r.mgHist, 0) / cruces.length : 0;
                              const utilidadG = ventaG * mgPromGoa - mkdMonto;
                              return (
                                <tr key={g} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                                  <td className="p-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{g}</span></td>
                                  <td className={`p-2 text-right font-mono ${t.textPurple}`}>{fmtMXN(ventaG)}</td>
                                  <td className="p-2 text-center">
                                    <div className="inline-flex items-center gap-1">
                                      <NumberInputDeferred
                                        value={(mkdGoaPct * 100).toFixed(1)}
                                        onCommit={(parsed) => {
                                          setMkdPctGoa(prev => ({ ...prev, [g]: (parsed || 0) / 100 }));
                                        }}
                                        className={`w-16 text-right font-mono text-xs px-2 py-1 rounded border ${
                                          mkdGoaPct > 0
                                            ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                            : t.input
                                        } focus:outline-none focus:ring-1`} />
                                      <span className={`text-[10px] ${t.textMuted}`}>%</span>
                                    </div>
                                  </td>
                                  <td className={`p-2 text-right font-mono ${t.textYellow}`}>{fmtMXN(mkdMonto)}</td>
                                  <td className={`p-2 text-right font-mono ${t.textGray}`}>{fmtPct(mgPromGoa)}</td>
                                  <td className={`p-2 text-right font-mono font-black ${utilidadG >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {fmtMXN(utilidadG)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer: export y reglas */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                  <p className={`text-[10px] ${t.textMuted}`}>
                    💡 Prioridad de overrides: <strong>Centro</strong> &gt; <strong>GOA</strong> &gt; <strong>Sugerido</strong>. Todos los cambios se guardan automáticamente.
                  </p>
                  <button onClick={exportDrivers}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${t.btnSecondary}`}>
                    <Icons.Download size={13} /> Exportar drivers
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════ TAB 4-7: PLACEHOLDERS ══════════ */}
        {activeTab >= 4 && (
          <div className="p-8 flex flex-col items-center justify-center text-center min-h-[40vh]">
            <Icons.Settings size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
            <p className={`text-sm font-bold ${t.textMain}`}>
              {activeTab === 4 && 'Matriz GOA × Centro'}
              {activeTab === 5 && 'Plan x Tienda'}
              {activeTab === 6 && 'Canales'}
              {activeTab === 7 && 'Resumen OTB'}
            </p>
            <p className={`text-xs mt-1 ${t.textMuted} max-w-md`}>
              Tab pendiente de implementación.
            </p>
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

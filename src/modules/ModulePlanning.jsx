import React, { useState, useMemo, useRef, useEffect, useCallback, startTransition } from 'react';
import * as Icons from '../utils/icons';

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

const LineForecast = ({ historico, proyeccion, theme, height = 120 }) => {
  const isDark = theme === 'dark';
  const all = [...historico, ...proyeccion];
  if (!all.length) return null;
  const max = all.reduce((m, p) => p.y > m ? p.y : m, 1);
  const min = all.reduce((m, p) => p.y < m ? p.y : m, 0);
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

const SparklineBarras = ({ valores, color = '#a78bfa', height = 24 }) => {
  const max = valores.reduce((m, v) => v > m ? v : m, 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height, minWidth: 80 }}>
      {valores.map((v, i) => (
        <div key={i}
          className="flex-1 rounded-sm transition-all"
          style={{ 
            height: `${(v / max) * 100}%`, 
            minHeight: '1px',
            backgroundColor: v > 0 ? color : 'rgba(150,150,150,0.2)',
            opacity: 0.7
          }}
          title={`${MESES[i]}: ${fmt(v, 0)}`}
        />
      ))}
    </div>
  );
};

const NumberInputDeferred = React.memo(function NumberInputDeferred({
  value,
  onCommit,
  placeholder,
  step = 'any',
  className = '',
  formatter,
  parseValue,
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
// COMPONENTE PRINCIPAL (Renombrado a Planning)
// ═══════════════════════════════════════════════════════════════════════════

export default function Planning() {
  const gState = useThemeLocal();
  const theme  = gState?.theme || 'light';
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState(1);

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

  const histInputRef = useRef(null);
  const [historico, setHistorico]   = useState([]);
  const [centros, setCentros]       = useState({});
  const [aperturas, setAperturas]   = useState({});
  const [matrizGoaCentro, setMatrizGoaCentro] = useState({});
  const [goasMaestro, setGoasMaestro] = useState([]);
  const [anioPlan, setAnioPlan] = useState(new Date().getFullYear() + 1);

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
      const iMes      = findCol('MES'); 

      if (iCentro === -1 || iSec === -1 || iGoa === -1) {
        alert('El CSV debe incluir mínimo: SECCION, CENTRO y GOA en la fila 4.');
        return;
      }

      const startData = (iMes >= 0 ? iMes : Math.max(iSec, iNSec, iTipoTda, iCentro, iNCentro, iGoa)) + 1;
      const MESES_MAP = { ENE:1, FEB:2, MAR:3, ABR:4, MAY:5, JUN:6, JUL:7, AGO:8, SEP:9, OCT:10, NOV:11, DIC:12 };

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

      const maxAnio = extracted.reduce((max, r) => r.anio > max ? r.anio : max, 0);
      if (maxAnio) setAnioPlan(maxAnio + 1);

      if (histInputRef.current) histInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

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

  const tiposTdaUnicos = useMemo(() => {
    const set = new Set(centrosLista.map(c => c.tipoTda).filter(Boolean));
    return Array.from(set).sort();
  }, [centrosLista]);

  const [filtroTexto, setFiltroTexto]       = useState('');
  const [filtroTipo, setFiltroTipo]         = useState('TODOS');
  const [filtroTipoTda, setFiltroTipoTda]   = useState('TODOS');
  const [ordenCol, setOrdenCol]             = useState('vta');
  const [ordenDir, setOrdenDir]             = useState('desc');

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

  const [nuevaCentroId, setNuevaCentroId]   = useState('');
  const [nuevaCentroNom, setNuevaCentroNom] = useState('');
  const [nuevaCentroMes, setNuevaCentroMes] = useState(1);
  const [nuevoGoa, setNuevoGoa] = useState('');
  const [celaEditando, setCelaEditando] = useState(null); 
  const [goaMasivo, setGoaMasivo] = useState(null); 
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
    setCentros(prev => { const n = { ...prev }; delete n[id]; return n; });
    setAperturas(prev => { const n = { ...prev }; delete n[id]; return n; });
    setMatrizGoaCentro(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

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

  const setMesesCruce = (centro, goa, meses) => {
    setMatrizGoaCentro(prev => {
      const next = { ...prev };
      if (!next[centro]) next[centro] = {};
      next[centro][goa] = { activo: meses.length > 0, meses: [...meses].sort((a,b) => a-b) };
      return next;
    });
  };

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
    downloadExcel([header, ...rows], 'Planning_Setup_Centros.csv');
  };

  const guardarSesion = () => {
    const payload = {
      _meta: { app: 'GO Planner', module: 'Planning', version: 1, exportedAt: new Date().toISOString() },
      historico, centros, aperturas, matrizGoaCentro, goasMaestro, anioPlan,
      inSeasonOverrides,
      otbTotal, otbOverridesGoa, crecGoa, crecCentro, rotOverrides, msiPct, mkdPctGoa,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().slice(0,10);
    a.download = `GOPlanner_Planning_Sesion_${fecha}.json`;
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
        if (!d._meta || d._meta.module !== 'Planning') {
          alert('Archivo inválido: no es una sesión de Planning.');
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

  const eliminarCentro = (id) => {
    if (!confirm(`¿Eliminar el centro ${id}? Esto borra su histórico, cruces GOA y apertura si aplica.`)) return;
    setHistorico(prev => prev.filter(r => r.centro !== id));
    setCentros(prev => { const n = { ...prev }; delete n[id]; return n; });
    setAperturas(prev => { const n = { ...prev }; delete n[id]; return n; });
    setMatrizGoaCentro(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

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

  const [inSeasonOverrides, setInSeasonOverrides] = useState({});

  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_forecast_overrides');
      if (s) setInSeasonOverrides(JSON.parse(s));
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem('gop_forecast_overrides', JSON.stringify(inSeasonOverrides)); } catch {}
    }, 1000); 
    return () => clearTimeout(t);
  }, [inSeasonOverrides]);

  const [t2Centro, setT2Centro] = useState('');
  const [t2Goa,    setT2Goa]    = useState('');
  const [t2Filtro, setT2Filtro] = useState(''); 

  const [escenarioActivo, setEscenarioActivo] = useState('editable'); 
  const [thresholdsAvanzado, setThresholdsAvanzado] = useState(false); 
  const [thresholds, setThresholds] = useState({
    pesoConservador:    [0.6, 0.3, 0.1],   
    capOptimista:       0.30,               
    zScoreMkd:          1.5,                
    volumenMin:         0.10,               
    stockoutLocal:      0.30,               
    stockoutHist:       0.50,               
    stockoutFactorGuard:0.75,               
  });

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

  const anioActual = useMemo(() => {
    if (!historico.length) return new Date().getFullYear();
    return historico.reduce((max, r) => r.anio > max ? r.anio : max, 0);
  }, [historico]);

  const aniosCerrados = useMemo(() => {
    if (!historico.length) return [];
    return Array.from(new Set(historico.map(r => r.anio))).sort().filter(a => a < anioActual);
  }, [historico, anioActual]);

  const mesesActualReales = useMemo(() => {
    const set = new Set(historico.filter(r => r.anio === anioActual && r.venta > 0).map(r => r.mes));
    return set;
  }, [historico, anioActual]);

  const forecastL1 = useMemo(() => {
    if (!historico.length) return { mapa: {}, baseAnio: 0 };

    const todosAnios = Array.from(new Set(historico.map(r => r.anio))).sort();
    const baseAnio = todosAnios[0];
    const mapa = {};

    const cruces = [];
    Object.entries(matrizGoaCentro).forEach(([centro, goas]) => {
      Object.entries(goas).forEach(([goa, v]) => {
        if (v.activo && v.meses?.length) cruces.push({ centro, goa, mesesSet: new Set(v.meses) });
      });
    });

    cruces.forEach(({ centro, goa, mesesSet }) => {
      const key = `${centro}|${goa}`;

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

      const conDato = serieRaw.filter(s => !s.faltante);
      if (conDato.length < 6) {
        mapa[key] = { insuficiente: true, error: 'Datos insuficientes (<6 meses)', serie: conDato };
        return;
      }

      const serie = conDato;
      const regresion = linearRegression(serie.map(s => ({ x: s.x, y: s.venta })));

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

      const promVtaMensual = aniosCompletos.length > 0 ? promAnualGlobal : 0;
      const volumenMinAbs = promVtaMensual * thresholds.volumenMin;

      const ratiosValidos = [];
      serie.forEach(s => {
        if (s.anio === anioActual || !aniosCompletos.includes(s.anio)) return;
        if (s.venta < volumenMinAbs) return; 
        ratiosValidos.push(s.venta > 0 ? s.markdown / s.venta : 0);
      });
      const muRatio = ratiosValidos.length ? ratiosValidos.reduce((a,b)=>a+b,0) / ratiosValidos.length : 0;
      const sigmaRatio = ratiosValidos.length > 1
        ? Math.sqrt(ratiosValidos.reduce((s,v) => s + (v - muRatio)**2, 0) / ratiosValidos.length)
        : 0;

      const meta = {}; 
      serie.forEach(s => {
        if (s.anio === anioActual || !aniosCompletos.includes(s.anio)) return;
        const k = `${s.anio}|${s.mes}`;
        meta[k] = { atipico: false, stockout: false, valorImputado: s.venta };

        if (s.venta >= volumenMinAbs && sigmaRatio > 0) {
          const ratio = s.venta > 0 ? s.markdown / s.venta : 0;
          const z = Math.abs(ratio - muRatio) / sigmaRatio;
          if (z > thresholds.zScoreMkd) meta[k].atipico = true;
        }

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
          const factorMes = factores[s.mes] || 1;
          const factorPrev = factores[s.mes - 1] || factores[12] || 1;
          if (factorMes >= factorPrev * thresholds.stockoutFactorGuard) {
            condA = true;
          }
        }

        const otrosAnios = (porMes[s.mes] || []).filter(p => p.anio !== s.anio).map(p => p.valor);
        const promMismoMes = otrosAnios.length ? otrosAnios.reduce((a,b)=>a+b,0) / otrosAnios.length : 0;
        const condB = promMismoMes > 0 && s.venta < promMismoMes * thresholds.stockoutHist;

        if (condA || condB) {
          meta[k].stockout = true;
          const candidatos = [];
          if (promAdyacentes > 0) candidatos.push(promAdyacentes);
          if (promMismoMes > 0) candidatos.push(promMismoMes);
          meta[k].valorImputado = candidatos.length
            ? candidatos.reduce((a,b)=>a+b,0) / candidatos.length
            : s.venta;
        }
      });

      const factoresLimpio = { ...factores };
      if (aniosCompletos.length > 0) {
        for (let m = 1; m <= 12; m++) {
          const valoresLimpios = [];
          aniosCompletos.forEach(a => {
            const k = `${a}|${m}`;
            const info = meta[k];
            if (!info) return;
            if (info.atipico) return;            
            valoresLimpios.push(info.valorImputado); 
          });
          const promMesL = valoresLimpios.length
            ? valoresLimpios.reduce((a,b)=>a+b,0) / valoresLimpios.length
            : promAnualGlobal;
          factoresLimpio[m] = promAnualGlobal > 0 ? promMesL / promAnualGlobal : 1;
        }
      }

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

      const planEsc = {};
      [['conservador', proyectarConservador], ['limpio', proyectarLimpio],
       ['optimista', proyectarOptimista], ['base', proyectarBase]].forEach(([k, fn]) => {
        planEsc[k] = [];
        for (let mes = 1; mes <= 12; mes++) planEsc[k].push({ mes, valor: fn(anioPlan, mes) });
      });

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

  const aplicarOverrides = useCallback((centro, goa) => {
    const r = forecastL1.mapa[`${centro}|${goa}`];
    if (!r || r.insuficiente) return r;

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

  const calcRegresion = aplicarOverrides;

  const crucesActivos = useMemo(() => {
    const arr = [];
    Object.entries(matrizGoaCentro).forEach(([centro, goas]) => {
      Object.entries(goas).forEach(([goa, v]) => {
        if (v.activo && v.meses?.length) arr.push({ centro, goa });
      });
    });
    return arr;
  }, [matrizGoaCentro]);

  const resumenCruces = useMemo(() => {
    if (!historico.length) return [];
    return crucesActivos.map(({ centro, goa }) => {
      const r = forecastL1.mapa[`${centro}|${goa}`];
      const nombre = centros[centro]?.nombre || aperturas[centro]?.nombre || centro;
      if (!r || r.insuficiente) {
        return { centro, nombre, goa, totalInSeason: 0, totalPlan: 0, crecPlan: 0, crecYoY: 0, totalUltAnio: 0, r2: 0, insuficiente: true };
      }

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

  useEffect(() => {
    if (activeTab === 2 && !t2Centro && resumenCruces.length > 0) {
      setT2Centro(resumenCruces[0].centro);
      setT2Goa(resumenCruces[0].goa);
    }
  }, [activeTab, t2Centro, resumenCruces]);

  const t2Calc = useMemo(() => calcRegresion(t2Centro, t2Goa), [t2Centro, t2Goa, calcRegresion]);

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
    downloadExcel([header, ...rows], `Planning_Regresion_${anioPlan}.csv`);
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 3 — DRIVERS DEL PLAN
  // ══════════════════════════════════════════════════════════════════════

  const [otbMaster, setOtbMaster] = useState({
    vta:    Array(12).fill(null),    
    rot:    Array(12).fill(null),
    invIni: Array(12).fill(null),
    mgPct:  Array(12).fill(null),
    modoVta:  'mensual',  
    modoMg:   'total',    
    totalVta: null,
    totalMg:  null,
  });
  const [msiModo, setMsiModo]       = useState('total'); 
  const [msiMensual, setMsiMensual] = useState(Array(12).fill(null));
  const [mkdModo, setMkdModo]       = useState('porGoa'); 
  const [mkdMensualGlobal, setMkdMensualGlobal] = useState(Array(12).fill(null));

  const [otbTotal, setOtbTotal]               = useState(0);          
  const [otbOverridesGoa, setOtbOverridesGoa] = useState({});         
  const [crecGoa, setCrecGoa]                 = useState({});         
  const [crecCentro, setCrecCentro]           = useState({});         
  const [rotOverrides, setRotOverrides]       = useState({});         
  const [msiPct, setMsiPct]                   = useState(0.05);       
  const [mkdPctGoa, setMkdPctGoa]             = useState({});         

  const [t4Agrupacion, setT4Agrupacion] = useState('centro'); 
  const [t4Expandidas, setT4Expandidas] = useState(new Set()); 
  const [t4Locks, setT4Locks] = useState(new Set()); 
  const [t4Overrides, setT4Overrides] = useState({}); 
  const [t4Filtro, setT4Filtro] = useState('');

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
        if (d.otbMaster)               setOtbMaster(d.otbMaster);
        if (d.msiModo)                 setMsiModo(d.msiModo);
        if (d.msiMensual)              setMsiMensual(d.msiMensual);
        if (d.mkdModo)                 setMkdModo(d.mkdModo);
        if (d.mkdMensualGlobal)        setMkdMensualGlobal(d.mkdMensualGlobal);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('gop_forecast_drivers', JSON.stringify({
          otbTotal, otbOverridesGoa, crecGoa, crecCentro, rotOverrides, msiPct, mkdPctGoa,
          otbMaster, msiModo, msiMensual, mkdModo, mkdMensualGlobal
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [otbTotal, otbOverridesGoa, crecGoa, crecCentro, rotOverrides, msiPct, mkdPctGoa, otbMaster, msiModo, msiMensual, mkdModo, mkdMensualGlobal]);

  const planSugeridoPorGoa = useMemo(() => {
    const map = {};
    resumenCruces.forEach(r => {
      map[r.goa] = (map[r.goa] || 0) + (r.totalPlan || 0);
    });
    return map;
  }, [resumenCruces]);

  const planSugeridoTotal = useMemo(() =>
    Object.values(planSugeridoPorGoa).reduce((s,v) => s+v, 0)
  , [planSugeridoPorGoa]);

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

  const otbAplicadoTotal = useMemo(() =>
    Object.values(otbPorGoa).reduce((s,v) => s + v.aplicado, 0)
  , [otbPorGoa]);

  const otbDiff = useMemo(() => {
    if (!otbTotal) return 0;
    return otbAplicadoTotal - otbTotal;
  }, [otbTotal, otbAplicadoTotal]);

  const getCrecAplicado = useCallback((centro, goa, crecSugeridoCruce) => {
    const overrideCentro = crecCentro[`${centro}|${goa}`];
    if (overrideCentro != null) return overrideCentro;
    const overrideGoa = crecGoa[goa];
    if (overrideGoa != null) return overrideGoa;
    return crecSugeridoCruce;
  }, [crecCentro, crecGoa]);

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

  const rotacionPorAnio = useMemo(() => {
    const map = {}; 
    const acum = {}; 
    historico.forEach(r => {
      if (!r.goa || !r.rotacion) return;
      const k = `${r.centro}|${r.goa}|${r.anio}`;
      if (!acum[k]) acum[k] = { sum: 0, cnt: 0 };
      acum[k].sum += r.rotacion;
      acum[k].cnt += 1;
    });
    Object.entries(acum).forEach(([k, v]) => {
      const [centro, goa, anio] = k.split('|');
      const ck = `${centro}|${goa}`;
      if (!map[ck]) map[ck] = {};
      map[ck][anio] = v.cnt > 0 ? v.sum / v.cnt : 0;
    });
    return map;
  }, [historico]);

  const rotSugeridaInteligente = useMemo(() => {
    const promPorGoa = {};
    Object.entries(rotacionHistPromedio).forEach(([k, v]) => {
      const [, goa] = k.split('|');
      if (!promPorGoa[goa]) promPorGoa[goa] = { sum: 0, cnt: 0 };
      promPorGoa[goa].sum += v;
      promPorGoa[goa].cnt += 1;
    });
    const promFinalGoa = {};
    Object.entries(promPorGoa).forEach(([g, v]) => {
      promFinalGoa[g] = v.cnt > 0 ? v.sum / v.cnt : 0;
    });
    
    const out = {};
    Object.entries(rotacionHistPromedio).forEach(([k, rotCentro]) => {
      const [, goa] = k.split('|');
      const rotGoa = promFinalGoa[goa] || rotCentro;
      if (rotCentro >= rotGoa) {
        out[k] = rotCentro * 1.05;  
      } else {
        out[k] = rotCentro * 0.5 + rotGoa * 0.5;  
      }
    });
    return out;
  }, [rotacionHistPromedio]);

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

  const planCruceCompleto = useMemo(() => {
    return resumenCruces.map(r => {
      const ventaSugerida = r.totalPlan || 0;
      const ventaInS = r.totalInSeason || 0;
      const crecSug = r.crecPlan || 0;
      const crecAplicado = getCrecAplicado(r.centro, r.goa, crecSug);

      const tieneOverrideCrec = crecCentro[`${r.centro}|${r.goa}`] != null || crecGoa[r.goa] != null;
      const ventaPlanFinal = tieneOverrideCrec && ventaInS > 0
        ? ventaInS * (1 + crecAplicado)
        : ventaSugerida;

      const mkdPct = mkdPctGoa[r.goa] != null ? mkdPctGoa[r.goa] : 0;
      const mkdMonto = ventaPlanFinal * mkdPct;
      const msiMonto = ventaPlanFinal * msiPct;

      const rotHist = rotacionHistPromedio[`${r.centro}|${r.goa}`] || 0;
      const rotOverride = rotOverrides[`${r.centro}|${r.goa}`];
      const rotAplicada = rotOverride != null ? rotOverride : rotHist;
      const rotSugerida = rotSugeridaInteligente[`${r.centro}|${r.goa}`] || rotHist;
      const rotPorAnio = rotacionPorAnio[`${r.centro}|${r.goa}`] || {};

      const invPromedio = rotAplicada > 0 ? ventaPlanFinal / rotAplicada : 0;
      const compra = ventaPlanFinal; 

      const mgHist = mgHistPromedio[`${r.centro}|${r.goa}`] || 0;
      const utilidad = ventaPlanFinal * mgHist - mkdMonto;

      return {
        ...r,
        ventaSugerida, ventaPlanFinal, crecSug, crecAplicado, tieneOverrideCrec,
        mkdPct, mkdMonto, msiMonto,
        rotHist, rotOverride, rotAplicada, tieneRotOverride: rotOverride != null,
        rotSugerida, rotPorAnio,
        invPromedio, compra,
        mgHist, utilidad,
      };
    });
  }, [resumenCruces, getCrecAplicado, crecCentro, crecGoa, mkdPctGoa, msiPct,
      rotacionHistPromedio, rotOverrides, mgHistPromedio, rotSugeridaInteligente, rotacionPorAnio]);

  const otbMasterCalc = useMemo(() => {
    const sugVta = Array(12).fill(0);
    const sugInvIni = Array(12).fill(0);
    const sugMkd = Array(12).fill(0);
    
    planCruceCompleto.forEach(r => {
      const cruce = forecastL1.mapa[`${r.centro}|${r.goa}`];
      if (!cruce || cruce.insuficiente) return;
      const planEsc = cruce.planEsc[escenarioActivo === 'editable' ? 'base' : escenarioActivo];
      planEsc.forEach((m, i) => sugVta[i] += m.valor);
    });
    
    const factorEstacional = sugVta.map(v => {
      const tot = sugVta.reduce((a,b)=>a+b, 0);
      return tot > 0 ? v / tot : 1/12;
    });
    
    const vtaFinal = Array(12).fill(0).map((_, i) => {
      if (otbMaster.vta[i] != null) return otbMaster.vta[i];
      if (otbMaster.modoVta === 'total' && otbMaster.totalVta) {
        return otbMaster.totalVta * factorEstacional[i];
      }
      return sugVta[i];
    });
    
    const mgHistProm = planCruceCompleto.length 
      ? planCruceCompleto.reduce((s,r) => s + r.mgHist, 0) / planCruceCompleto.length 
      : 0.40;
    const mgFinal = Array(12).fill(0).map((_, i) => {
      if (otbMaster.mgPct[i] != null) return otbMaster.mgPct[i];
      if (otbMaster.modoMg === 'total' && otbMaster.totalMg != null) return otbMaster.totalMg;
      return mgHistProm;
    });
    
    const rotFinal = otbMaster.rot.map((v, i) => v ?? 1.5); 
    const invIniEne = otbMaster.invIni[0] ?? vtaFinal[0] / (rotFinal[0] || 1.5);
    
    const filas = [];
    let invInicial = invIniEne;
    for (let i = 0; i < 12; i++) {
      const venta = vtaFinal[i];
      const rot = rotFinal[i];
      const mgPct = mgFinal[i];
      const invFinal = otbMaster.invIni[i+1] ?? venta / (rot || 1.5);
      const compra = venta + invFinal - invInicial;
      const utilidadBruta = venta * mgPct;
      const mkd = sugMkd[i]; 
      const msi = venta * msiPct;
      
      filas.push({
        mes: i+1,
        invInicial, venta, mkd, msi,
        compra, utilidadBruta, mgPct,
        invFinal, rot,
      });
      invInicial = invFinal;
    }
    
    return { filas, sugVta, factorEstacional };
  }, [otbMaster, planCruceCompleto, forecastL1, escenarioActivo, msiPct]);

  const t4DataAgrupada = useMemo(() => {
    const cruces = planCruceCompleto.map(r => {
      const cruceL1 = forecastL1.mapa[`${r.centro}|${r.goa}`];
      if (!cruceL1?.planEsc) return null;
      const planEsc = cruceL1.planEsc[escenarioActivo === 'editable' ? 'base' : escenarioActivo];
      const meses = planEsc.map((m, i) => {
        const k = `${r.centro}|${r.goa}|${m.mes}`;
        const override = t4Overrides[k];
        const isLocked = t4Locks.has(k);
        return {
          mes: m.mes,
          valor: override !== undefined ? override : m.valor,
          sugerido: m.valor,
          isLocked,
          isOverride: override !== undefined,
        };
      });
      return {
        centro: r.centro, nombre: r.nombre, goa: r.goa,
        meses,
        total: meses.reduce((s,m) => s + m.valor, 0),
      };
    }).filter(Boolean);
    
    if (t4Agrupacion === 'centro') {
      const map = {};
      cruces.forEach(c => {
        if (!map[c.centro]) map[c.centro] = { id: c.centro, nombre: c.nombre, hijos: [], meses: Array(12).fill(0), total: 0 };
        map[c.centro].hijos.push(c);
        c.meses.forEach((m, i) => map[c.centro].meses[i] += m.valor);
        map[c.centro].total += c.total;
      });
      return Object.values(map).sort((a,b) => b.total - a.total);
    } else {
      const map = {};
      cruces.forEach(c => {
        if (!map[c.goa]) map[c.goa] = { id: c.goa, nombre: c.goa, hijos: [], meses: Array(12).fill(0), total: 0 };
        map[c.goa].hijos.push(c);
        c.meses.forEach((m, i) => map[c.goa].meses[i] += m.valor);
        map[c.goa].total += c.total;
      });
      return Object.values(map).sort((a,b) => b.total - a.total);
    }
  }, [planCruceCompleto, forecastL1, escenarioActivo, t4Agrupacion, t4Overrides, t4Locks]);

  const rebalancearTab4 = (grupoId) => {
    const grupo = t4DataAgrupada.find(g => g.id === grupoId);
    if (!grupo) return;
    
    let target;
    if (t4Agrupacion === 'goa') {
      target = otbPorGoa[grupoId]?.aplicado || grupo.total;
    } else {
      target = grupo.hijos.reduce((s,h) => s + h.meses.reduce((a,m) => a + m.sugerido, 0), 0);
    }
    
    const sumaActual = grupo.total;
    const diff = target - sumaActual;
    if (Math.abs(diff) < 1) return; 
    
    const candidatos = [];
    grupo.hijos.forEach(h => {
      h.meses.forEach(m => {
        const k = `${h.centro}|${h.goa}|${m.mes}`;
        if (!t4Locks.has(k)) candidatos.push({ k, valor: m.valor });
      });
    });
    
    const sumaCandidatos = candidatos.reduce((s,c) => s + c.valor, 0);
    if (sumaCandidatos === 0) {
      alert('Todas las celdas están bloqueadas. Libera al menos una para rebalancear.');
      return;
    }
    
    startTransition(() => {
      setT4Overrides(prev => {
        const next = { ...prev };
        candidatos.forEach(c => {
          const proporcion = c.valor / sumaCandidatos;
          next[c.k] = Math.max(0, c.valor + diff * proporcion);
        });
        return next;
      });
    });
  };

  const [t3Tab, setT3Tab]           = useState('otb'); 
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

  const exportDrivers = () => {
    const header = ['Centro','Nombre','GOA','Venta Plan','Crec %','Markdown $','MSI $','Rot','Inv Prom','Mg %','Utilidad'];
    const rows = planCruceCompleto.map(r => [
      r.centro, r.nombre, r.goa,
      r.ventaPlanFinal, r.crecAplicado,
      r.mkdMonto, r.msiMonto,
      r.rotAplicada, r.invPromedio,
      r.mgHist, r.utilidad,
    ]);
    downloadExcel([header, ...rows], `Planning_Drivers_${anioPlan}.csv`);
  };

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

  const tabStyle = (n) =>
    `px-4 py-3 text-xs md:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
      activeTab === n ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`
    }`;

  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>

      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark ? 'bg-orange-500/20' : 'bg-orange-50'}`}>
                <Icons.TrendingUp size={22} className={t.textAccent1} />
              </span>
              Planning
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>
              Plan por tienda · Regresión histórica · Distribución GOA × Centro · OTB
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={histInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleHistUpload} />
            <input ref={sesionInputRef} type="file" accept=".json" className="hidden" onChange={cargarSesion} />
            <button onClick={() => histInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14} /> Cargar Histórico
            </button>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${t.cardInner}`}>
              <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>Año plan</span>
              <input type="number" value={anioPlan}
                onChange={e => setAnioPlan(parseInt(e.target.value, 10) || anioPlan)}
                className={`w-20 text-xs font-bold px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1`} />
            </div>
            <div className="relative">
              <button onClick={() => setMenuAbierto(v => !v)}
                className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${t.btnGhost}`}
                title="Más opciones">
                <Icons.MoreVertical size={16} />
              </button>
              {menuAbierto && (
                <>
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

      <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
        <div className={`flex border-b ${t.border} px-2 overflow-x-auto custom-scrollbar`}>
          <button className={tabStyle(1)} onClick={() => setActiveTab(1)}>📥 Carga & Setup</button>
          <button className={tabStyle(2)} onClick={() => setActiveTab(2)}>📈 Regresión & In Season</button>
          <button className={tabStyle(3)} onClick={() => setActiveTab(3)}>🎚️ Drivers del Plan</button>
          <button className={tabStyle(4)} onClick={() => setActiveTab(4)}>🧮 Matriz GOA × Centro</button>
        </div>

        {activeTab === 1 && (
          <div className="p-5 space-y-5">
            {!historico.length && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Upload size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Carga el histórico para empezar</p>
              </div>
            )}
            {historico.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Centros', val: fmt(resumenHist.centros) },
                    { label: 'GOAs', val: resumenHist.goas ? fmt(resumenHist.goas) : '—' },
                    { label: 'Venta hist.', val: fmtMXN(resumenHist.totalVta) },
                  ].map(({ label, val }) => (
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                      <div className={`text-lg font-black ${t.textMain}`}>{val}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 4 && (
          <div className="p-5 space-y-5">
            <div className={`p-4 rounded-xl border ${t.cardInner} flex items-center justify-between flex-wrap gap-2`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>Agrupar por:</span>
                <div className={`flex rounded-lg border ${t.border} overflow-hidden`}>
                  <button onClick={() => setT4Agrupacion('centro')}
                    className={`px-3 py-1.5 text-xs font-bold ${t4Agrupacion === 'centro' ? t.btnPurple : t.btnGhost}`}>
                    🏬 Centro
                  </button>
                  <button onClick={() => setT4Agrupacion('goa')}
                    className={`px-3 py-1.5 text-xs font-bold ${t4Agrupacion === 'goa' ? t.btnPurple : t.btnGhost}`}>
                    🎯 GOA
                  </button>
                </div>
                <input placeholder="Filtrar..." value={t4Filtro} onChange={e => setT4Filtro(e.target.value)}
                  className={`text-xs px-3 py-1.5 rounded border ${t.input}`} />
              </div>
              <button onClick={() => setT4Expandidas(new Set())}
                className={`text-xs px-3 py-1.5 rounded ${t.btnGhost}`}>
                Colapsar todo
              </button>
            </div>

            <div className={`rounded-xl border ${t.cardInner} overflow-hidden`}>
              <div className="overflow-x-auto custom-scrollbar max-h-[70vh]">
                <table className="w-full text-left min-w-max text-xs">
                  <thead>
                    <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900' : 'bg-gray-50'}`}>
                      <th className="p-2 sticky left-0 bg-inherit">{t4Agrupacion === 'centro' ? 'Centro / GOA' : 'GOA / Centro'}</th>
                      {MESES.map(m => <th key={m} className="p-2 text-right">{m}</th>)}
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2 text-center">⚖️</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t4DataAgrupada
                      .filter(g => !t4Filtro || g.nombre.toLowerCase().includes(t4Filtro.toLowerCase()))
                      .map(grupo => {
                        const expandido = t4Expandidas.has(grupo.id);
                        return (
                          <React.Fragment key={grupo.id}>
                            <tr className={`font-bold ${isDark ? 'bg-violet-900/10 hover:bg-violet-900/20' : 'bg-violet-50 hover:bg-violet-100'} cursor-pointer`}
                                onClick={() => setT4Expandidas(prev => {
                                  const n = new Set(prev);
                                  n.has(grupo.id) ? n.delete(grupo.id) : n.add(grupo.id);
                                  return n;
                                })}>
                              <td className={`p-2 sticky left-0 bg-inherit ${t.textMain}`}>
                                <span className="inline-block w-4">{expandido ? '▼' : '▶'}</span>
                                {grupo.nombre} <span className={`text-[9px] ${t.textMuted}`}>({grupo.hijos.length})</span>
                              </td>
                              {grupo.meses.map((v, i) => (
                                <td key={i} className={`p-2 text-right font-mono ${t.textPurple}`}>{fmt(v, 0)}</td>
                              ))}
                              <td className={`p-2 text-right font-mono font-black ${t.textPurple}`}>{fmt(grupo.total, 0)}</td>
                              <td className="p-2 text-center">
                                <button onClick={(e) => { e.stopPropagation(); rebalancearTab4(grupo.id); }}
                                  className={`text-[10px] px-2 py-0.5 rounded ${t.btnGhost}`}
                                  title="Rebalancear diferencia entre celdas no bloqueadas">⚖️</button>
                              </td>
                            </tr>
                            {expandido && grupo.hijos.map(hijo => (
                              <tr key={`${hijo.centro}|${hijo.goa}`} className={`text-xs ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                                <td className={`p-2 pl-8 sticky left-0 bg-inherit ${t.textMuted}`}>
                                  {t4Agrupacion === 'centro'
                                    ? <span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgePurple}`}>{hijo.goa}</span></span>
                                    : <span className="font-mono">{hijo.centro} <span className={`text-[9px] ${t.textMuted}`}>· {hijo.nombre}</span></span>}
                                </td>
                                {hijo.meses.map((m, i) => {
                                  const k = `${hijo.centro}|${hijo.goa}|${m.mes}`;
                                  return (
                                    <td key={i} className="p-1 text-right">
                                      <div className="flex items-center justify-end gap-0.5">
                                        <NumberInputDeferred
                                          value={Math.round(m.valor)}
                                          onCommit={(parsed) => {
                                            setT4Overrides(prev => ({ ...prev, [k]: parsed ?? m.sugerido }));
                                            setT4Locks(prev => new Set(prev).add(k));
                                          }}
                                          className={`w-16 text-right font-mono px-1 py-0.5 rounded border text-[10px] ${
                                            m.isLocked
                                              ? (isDark ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-amber-100 border-amber-400 text-amber-900')
                                              : t.input
                                          }`} />
                                        {m.isLocked && (
                                          <button onClick={() => {
                                            setT4Overrides(prev => { const n = {...prev}; delete n[k]; return n; });
                                            setT4Locks(prev => { const n = new Set(prev); n.delete(k); return n; });
                                          }} className="text-[10px]" title="Liberar candado">🔒</button>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className={`p-2 text-right font-mono font-bold ${t.textPurple}`}>
                                  {fmt(hijo.meses.reduce((s,m) => s + m.valor, 0), 0)}
                                </td>
                                <td className="p-2"></td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}} />
    </div>
  );
}

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Icons from '../utils/icons';
import { useDispatch, useGlobal, globalActions } from '../context/GlobalContext';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
     .map(c => c.replace(/^"|"$/g, '').trim());

const num = v => parseFloat(String(v || '0').replace(/[^0-9.-]+/g, '')) || 0;

// Regresión lineal + R² para scatter. points = [{x, y}]
const linReg = (points) => {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const sx = points.reduce((s,p) => s+p.x, 0);
  const sy = points.reduce((s,p) => s+p.y, 0);
  const sxy = points.reduce((s,p) => s+p.x*p.y, 0);
  const sxx = points.reduce((s,p) => s+p.x*p.x, 0);
  const syy = points.reduce((s,p) => s+p.y*p.y, 0);
  const denom = (n*sxx - sx*sx);
  const slope = denom !== 0 ? (n*sxy - sx*sy) / denom : 0;
  const intercept = (sy - slope*sx) / n;
  const num2 = (n*sxy - sx*sy);
  const den2 = Math.sqrt((n*sxx - sx*sx) * (n*syy - sy*sy));
  const r = den2 !== 0 ? num2/den2 : 0;
  return { slope, intercept, r2: r*r };
};

const fmt = (n, dec = 0) =>
  n == null ? '-' : n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtMXN = n =>
  n == null ? '-' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Exportar a CSV / Excel
const downloadExcel = (rows, filename) => {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

// (lógica de temporada ahora es configurable por el usuario, ver goasTemporada state)

// ─── MINI-CHART: BARRAS COMPARATIVAS ────────────────────────────────────────

const BarCompare = ({ data, theme }) => {
  const isDark = theme === 'dark';
  // Solo centros que cambiaron (salida o entrada)
  const changed = data.filter(d => d.antes !== d.despues);
  if (!changed.length) return null;
  const max = Math.max(...changed.map(d => Math.max(d.antes, d.despues)), 1);
  return (
    <div className="mt-2">
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
        {changed.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className={`w-40 truncate text-right text-[9px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
              title={`${d.nombre || d.centro} (${d.centro})`}>
              {d.nombre || d.centro}
              <span className="opacity-40 ml-0.5">({d.centro})</span>
            </span>
            <div className="flex-1 flex flex-col gap-0.5">
              {/* Antes */}
              <div className="relative h-2 rounded-full bg-zinc-700/20 overflow-hidden">
                <div className="absolute left-0 top-0 h-full rounded-full bg-yellow-400/80"
                  style={{ width: `${(d.antes / max) * 100}%` }} />
              </div>
              {/* Después */}
              <div className="relative h-2 rounded-full bg-zinc-700/20 overflow-hidden">
                <div className="absolute left-0 top-0 h-full rounded-full bg-violet-500"
                  style={{ width: `${(d.despues / max) * 100}%` }} />
              </div>
            </div>
            <div className="flex flex-col items-end w-16 shrink-0">
              <span className="text-yellow-400 font-mono">{fmt(d.antes)}</span>
              <span className="text-violet-400 font-mono">{fmt(d.despues)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-yellow-400/80 inline-block" /> Antes</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-violet-500 inline-block" /> Después</span>
        <span className={`${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{changed.length} centros con movimiento</span>
      </div>
    </div>
  );
};

// ─── MINI-CHART: DONUT RESUMEN ───────────────────────────────────────────────

const DonutSummary = ({ items, theme }) => {
  const isDark = theme === 'dark';
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  const colors = ['#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#f87171', '#e879f9'];
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        {items.map((item, i) => {
          const pct = item.value / total;
          const dash = pct * circ;
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={colors[i % colors.length]} strokeWidth="18"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ}
              style={{ transition: 'stroke-dasharray 0.5s ease' }} />
          );
          offset += pct;
          return seg;
        })}
      </svg>
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: colors[i % colors.length] }} />
            <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>{item.label}</span>
            <span className="font-black ml-1" style={{ color: colors[i % colors.length] }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Traslados() {
  const gState   = useGlobal();
  const theme    = gState?.theme || 'light';
  const isDark   = theme === 'dark';

  const [activeTab, setActiveTab] = useState(1); // 1=Excedente, 2=Solicitud, 3=Nivelación
  const [mesActual, setMesActual] = useState(5); // mes del año para MOS

  // ── Temas ──────────────────────────────────────────────────────────────
  const themes = {
    dark: {
      appBg: 'bg-transparent text-gray-100',
      card: 'bg-zinc-900 border-zinc-800 shadow-sm',
      cardInner: 'bg-zinc-950 border-zinc-800',
      textMain: 'text-white', textMuted: 'text-gray-400',
      textAccent1: 'text-yellow-400', textAccent2: 'text-violet-400',
      border: 'border-zinc-800',
      input: 'bg-zinc-950 border-zinc-700 text-white focus:ring-orange-500',
      btnPrimary: 'bg-yellow-400 text-black hover:bg-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.3)]',
      btnSecondary: 'bg-violet-600 text-white hover:bg-violet-500',
      btnGhost: 'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700',
      tabActive: 'border-violet-500 text-violet-400',
      badge: 'bg-yellow-900/30 text-yellow-400 border-yellow-500/40',
      badgeTeal: 'bg-violet-900/30 text-violet-400 border-violet-500/40',
    },
    light: {
      appBg: 'bg-transparent text-gray-800',
      card: 'bg-white border-gray-200 shadow-sm',
      cardInner: 'bg-gray-50 border-gray-200',
      textMain: 'text-gray-900', textMuted: 'text-gray-500',
      textAccent1: 'text-yellow-500', textAccent2: 'text-violet-600',
      border: 'border-gray-200',
      input: 'bg-white border-gray-300 text-gray-900 focus:ring-orange-500',
      btnPrimary: 'bg-yellow-400 text-black hover:bg-yellow-300 shadow-md',
      btnSecondary: 'bg-violet-600 text-white hover:bg-violet-700 shadow-md',
      btnGhost: 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200',
      tabActive: 'border-violet-600 text-violet-600',
      badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      badgeTeal: 'bg-violet-50 text-violet-700 border-violet-200',
    },
  };
  const t = themes[theme] || themes.light;

  // ══════════════════════════════════════════════════════════════════════
  // TAB 1 — EXCEDENTE
  // ══════════════════════════════════════════════════════════════════════

  const csvInputRef    = useRef(null);
  const matrizInputRef = useRef(null);

  const [rawData,    setRawData]    = useState([]);
  const [ohEnPesos,  setOhEnPesos]  = useState(true); // true = OH/VTA vienen en pesos, convertir a pzs
  const [brandMatrix, setBrandMatrix] = useState({});
  const [climaMatrix, setClimaMatrix] = useState({});

  // Panel configurable: { [goa]: 'FRIO' | 'CALOR' | 'PLAYA' | 'TODO' }
  // El usuario define qué GOAs son de temporada y qué clima requieren
  const [goasTemporada, setGoasTemporada] = useState({});
  const [showPanelGoas, setShowPanelGoas] = useState(false);
  const [showPanelNiv,  setShowPanelNiv]  = useState(true);

  const [filterSku,          setFilterSku]          = useState('ALL');
  const [filterTipoCentro,   setFilterTipoCentro]   = useState('ALL');
  const [filterSeccion,      setFilterSeccion]      = useState('ALL');
  const [filterMarca,        setFilterMarca]        = useState('ALL');
  const [filterGoa,          setFilterGoa]          = useState('ALL');
  const [letrasExcluidas,    setLetrasExcluidas]    = useState(new Set()); // letras de descuento a excluir
  const [filterZona,         setFilterZona]         = useState('ALL');
  const [minPzsTraslado,     setMinPzsTraslado]     = useState(0);   // mínimo pzs para considerar traslado
  const [minPesosTraslado,   setMinPesosTraslado]   = useState(0);   // mínimo pesos para considerar traslado
  // Zonas adyacentes: { ZONA: Set<ZONA> } — define qué zonas pueden recibir entre sí
  const [zonasAdyacentes,    setZonasAdyacentes]    = useState({});
  const [showPanelZonas,     setShowPanelZonas]     = useState(false);
  const [costoPorPza,        setCostoPorPza]        = useState(35); // costo logístico por pieza

  const [excResult, setExcResult] = useState([]);
  const [excLoading, setExcLoading] = useState(false);
  const [sinReceptorData, setSinReceptorData] = useState([]); // SKUs sin receptor → recomendar descuento

  // Dashboard: artículos de temporada fuera de zona (antes de ejecutar traslados)
  const dashboardData = useMemo(() => {
    if (!rawData.length || !Object.keys(goasTemporada).length) return null;

    const CLIMA_COMP = {
      FRIO:  (tc) => ['FRIO','EXTREMOSO','TEMPLADO',''].includes(tc),
      CALOR: (tc) => ['CALOR','PLAYA','EXTREMOSO','TEMPLADO',''].includes(tc),
      PLAYA: (tc) => ['PLAYA','CALOR'].includes(tc),
    };

    const fuera = rawData.filter(r => {
      const tipoClima = goasTemporada[r.goa];
      if (!tipoClima || tipoClima === 'TODO') return false;
      if (r.oh <= 0) return false;
      const tc = (climaMatrix[r.centro] || r.tipoCentro || '').toUpperCase();
      const ok = CLIMA_COMP[tipoClima]?.(tc) ?? true;
      return !ok;
    });

    if (!fuera.length) return { fuera: [], totalPzs: 0, totalPesos: 0, porGoa: [], porDesc: [], porCentro: [] };

    const totalPzs   = fuera.reduce((s, r) => s + r.oh, 0);
    const totalPesos = fuera.reduce((s, r) => s + r.oh * r.precio, 0);
    const totalVta   = fuera.reduce((s, r) => s + r.vta, 0);
    const vtaMes     = mesActual > 0 ? totalVta / mesActual : 0;
    const mos        = vtaMes > 0 ? +(totalPzs / vtaMes).toFixed(1) : null;

    // Por GOA
    const goaMap = {};
    fuera.forEach(r => {
      if (!goaMap[r.goa]) goaMap[r.goa] = { pzs: 0, pesos: 0, vta: 0, conDesc: 0, sinDesc: 0 };
      goaMap[r.goa].pzs   += r.oh;
      goaMap[r.goa].pesos += r.oh * r.precio;
      goaMap[r.goa].vta   += r.vta;
      if (r.letraDesc) goaMap[r.goa].conDesc += r.oh; else goaMap[r.goa].sinDesc += r.oh;
    });
    const porGoa = Object.entries(goaMap)
      .map(([goa, d]) => ({
        goa, ...d,
        mos: d.vta > 0 && mesActual > 0 ? +(d.pzs / (d.vta / mesActual)).toFixed(1) : null,
        pctPzs: totalPzs > 0 ? +((d.pzs / totalPzs) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.pesos - a.pesos);

    // Por letra de descuento
    const descMap = {};
    fuera.forEach(r => {
      const k = r.letraDesc || 'Sin descuento';
      if (!descMap[k]) descMap[k] = { pzs: 0, pesos: 0 };
      descMap[k].pzs   += r.oh;
      descMap[k].pesos += r.oh * r.precio;
    });
    const porDesc = Object.entries(descMap)
      .map(([letra, d]) => ({ letra, ...d, pct: totalPzs > 0 ? +((d.pzs/totalPzs)*100).toFixed(1) : 0 }))
      .sort((a, b) => b.pesos - a.pesos);

    // Por centro (top 15 por pesos)
    const centroMap = {};
    fuera.forEach(r => {
      const k = r.centro;
      if (!centroMap[k]) centroMap[k] = { nombre: r.nCentro || r.centro, pzs: 0, pesos: 0, vta: 0 };
      centroMap[k].pzs   += r.oh;
      centroMap[k].pesos += r.oh * r.precio;
      centroMap[k].vta   += r.vta;
    });
    const porCentro = Object.entries(centroMap)
      .map(([id, d]) => ({
        id, ...d,
        mos: d.vta > 0 && mesActual > 0 ? +(d.pzs / (d.vta / mesActual)).toFixed(1) : null,
      }))
      .sort((a, b) => b.pesos - a.pesos)
      .slice(0, 15);

    return { fuera, totalPzs, totalPesos, totalVta, mos, porGoa, porDesc, porCentro };
  }, [rawData, goasTemporada, climaMatrix, mesActual]);

  // Persistencia Tab 1
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_traslados_exc');
      if (s) {
        const d = JSON.parse(s);
        if (d.rawData?.length)      setRawData(d.rawData);
        if (d.brandMatrix)          setBrandMatrix(d.brandMatrix);
        if (d.climaMatrix)          setClimaMatrix(d.climaMatrix);
        if (d.goasTemporada)        setGoasTemporada(d.goasTemporada);
        if (d.excResult?.length)    setExcResult(d.excResult);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gop_traslados_exc', JSON.stringify({ rawData, brandMatrix, climaMatrix, goasTemporada, excResult }));
    } catch {}
  }, [rawData, brandMatrix, climaMatrix, excResult]);

  // Leer CSV principal (excedente)
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
      const rows = text.split('\n').map(r => parseCSVRow(r, sep));
      if (rows.length < 2) return;

      const H = rows[0].map(h => h.toUpperCase().trim());
      const idx = (names) => names.map(n => H.findIndex(h => h === n || h.includes(n))).find(i => i >= 0) ?? -1;

      const iSeccion    = idx(['SECCION', 'SECCIÓN', 'SECTION']);
      const iNomSec     = idx(['NOMBRE', 'NOM_SECCION', 'NOMBRE_SECCION']); // NOMBRE = nombre de sección
      const iGoa        = idx(['GOA', 'FAMILIA']);
      const iSku        = idx(['SKU', 'ARTICULO', 'MATERIAL']);
      const iNSku       = idx(['NSKU', 'N_SKU', 'DESC_SKU', 'NOMBRE_SKU', 'DESCRIPCION']);
      const iModelo     = idx(['MODELO', 'MODEL']);
      const iMarca      = idx(['MARCA', 'BRAND']);
      const iCentro     = idx(['CENTRO', 'ID_CENTRO', 'NUM_CENTRO']); // número de centro
      const iNCentro    = idx(['N_CENTRO', 'NCENTRO', 'NOMBRE_CENTRO', 'NOM_CENTRO']); // nombre tienda
      const iOH         = idx(['OH', 'INV', 'INVENTARIO', 'STOCK', 'EXISTENCIAS']);
      const iPrecio     = idx(['PRECIO', 'PVP', 'PRICE', 'COSTO']);
      const iTipoCentro = idx(['TIPO_CENTRO', 'TIPO CENTRO', 'TIPO', 'TIPO_TIENDA']);
      const iZona       = idx(['ZONA', 'REGION', 'DISTRITO', 'ZONA_CENTRO']);
      const iVta        = idx(['VTA', 'VTA_ACUM', 'VENTAS', 'VTAS', 'SALES']);
      const iVta3m      = idx(['VTA_3M', 'VTA3M', 'VTA 3M', 'VTA_3MESES', 'VENTA_3M']);
      const iVtaMesAnt  = idx(['VTA_MES_ANT', 'VTA_MES_ANTERIOR', 'VTA_ANT', 'VENTA_MES_ANT']);
      const iLetraDesc  = idx(['LETRA _DESC', 'LETRA_DESC', 'LETRA DESC', 'DESC', 'DESCUENTO']);

      if (iGoa === -1 || iSku === -1 || iCentro === -1) {
        alert('El CSV debe tener mínimo: GOA, SKU, CENTRO'); return;
      }

      const extracted = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[iCentro] || !r[iGoa]) continue;
        const precioRow = num(iPrecio >= 0 ? r[iPrecio] : 0);
        const ohRaw     = num(iOH    >= 0 ? r[iOH]     : 0);
        const vtaRaw    = num(iVta   >= 0 ? r[iVta]    : 0);
        const vta3mRaw  = iVta3m     >= 0 ? num(r[iVta3m])     : null;
        const vtaMaRaw  = iVtaMesAnt >= 0 ? num(r[iVtaMesAnt]) : null;
        // Convertir pesos → piezas si aplica (OH_pzs = OH_pesos / precio)
        const conv = (v) => ohEnPesos && precioRow > 0 && v != null ? Math.round(v / precioRow) : v;
        extracted.push({
          numSeccion: iSeccion   >= 0 ? r[iSeccion].trim()    : '',
          seccion:    iNomSec    >= 0 ? r[iNomSec].trim()     : 'GENERAL',
          goa:        r[iGoa].trim().toUpperCase(),
          sku:        iSku       >= 0 ? r[iSku].trim()        : '',
          nsku:       iNSku      >= 0 ? r[iNSku].trim()       : '',
          modelo:     iModelo    >= 0 ? r[iModelo].trim().toUpperCase()  : '',
          marca:      iMarca     >= 0 ? r[iMarca].trim().toUpperCase()   : '',
          centro:     r[iCentro].trim(),
          nCentro:    iNCentro   >= 0 ? r[iNCentro].trim()    : '',
          oh:         conv(ohRaw),        // piezas
          ohPesos:    ohEnPesos ? ohRaw : ohRaw * precioRow, // valor en pesos
          precio:     precioRow,
          tipoCentro: iTipoCentro >= 0 ? r[iTipoCentro].trim().toUpperCase() : '',
          zona:       iZona      >= 0 ? r[iZona].trim().toUpperCase()   : '',
          vta:        conv(vtaRaw),       // piezas
          vta3m:      vta3mRaw != null ? conv(vta3mRaw) : null,
          vtaMesAnt:  vtaMaRaw != null ? conv(vtaMaRaw) : null,
          letraDesc:  iLetraDesc >= 0 ? r[iLetraDesc].trim()  : '',
        });
      }
      setRawData(extracted);
      setExcResult([]);
      if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  // Leer CSV matrices (marca + clima)
  const handleMatrizUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const sep = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
      const rows = text.split('\n').map(r => parseCSVRow(r, sep));
      if (rows.length < 2) return;

      // ── Detectar filas clave escaneando las primeras 10 ────────────────
      // Fila de IDs de centro: mayoría de celdas son números enteros
      // Fila de clima: mayoría de celdas son FRIO/CALOR/PLAYA
      // Fila de header: contiene MARCA o NOM_MARCA

      let centroRowIdx  = -1;
      let climaRowIdx   = -1;
      let headerRowIdx  = -1;

      const CLIMA_VALS = new Set(['FRIO', 'CALOR', 'PLAYA', 'TEMPLADO', 'EXTREMOSO', 'TODO']);

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const cells = rows[i].map(c => c.toUpperCase().trim());
        const numCount   = cells.filter(c => /^\d{3,4}$/.test(c)).length;
        const climaCount = cells.filter(c => CLIMA_VALS.has(c)).length;
        const hasMarca   = cells.some(c => c === 'MARCA' || c === 'NOM_MARCA');

        if (numCount > 5 && centroRowIdx === -1)  centroRowIdx  = i;
        if (climaCount > 5 && climaRowIdx === -1) climaRowIdx   = i;
        if (hasMarca && headerRowIdx === -1)       headerRowIdx  = i;
      }

      // Fallback: header en fila 0
      if (headerRowIdx === -1) headerRowIdx = 0;

      const H = rows[headerRowIdx].map(h => h.toUpperCase().trim());
      const dataStartIdx = headerRowIdx + 1;

      // Detectar si es matriz clima GOA independiente (col GOA + col CLIMA)
      const iGoaCol   = H.findIndex(h => h === 'GOA' || h === 'FAMILIA');
      const iClimaCol = H.findIndex(h => h === 'CLIMA' || h === 'ZONA_CLIMA' || h === 'TIPO_CLIMA');

      if (iGoaCol >= 0 && iClimaCol >= 0) {
        const newClima = {};
        for (let i = dataStartIdx; i < rows.length; i++) {
          const r = rows[i];
          if (!r[iGoaCol]) continue;
          newClima[r[iGoaCol].trim().toUpperCase()] = r[iClimaCol].trim().toUpperCase();
        }
        setClimaMatrix(newClima);
        alert(`Matriz clima cargada: ${Object.keys(newClima).length} GOAs.`);
      } else {
        // ── Matriz de marca con clima integrado ──────────────────────────
        const iMarca    = H.findIndex(h => h === 'MARCA');
        const iNomMarca = H.findIndex(h => h === 'NOM_MARCA');
        const iSeccion  = H.findIndex(h => h === 'SECCION' || h === 'SECCIÓN');
        const iNomSec   = H.findIndex(h => h === 'NOM_SECCION' || h === 'NOM_SECCIÓN');
        if (iMarca === -1 && iNomMarca === -1) { alert('No se encontró columna MARCA o NOM_MARCA'); return; }

        // Columnas de centros: numéricos en la fila de header o en centroRowIdx
        const centroRef = centroRowIdx >= 0 ? rows[centroRowIdx] : H;
        const climaRef  = climaRowIdx  >= 0 ? rows[climaRowIdx]  : [];

        const infoColsMax = Math.max(iMarca, iNomMarca, iSeccion >= 0 ? iSeccion : 0, iNomSec >= 0 ? iNomSec : 0);
        const storeCols = [];
        centroRef.forEach((cell, j) => {
          const id = String(cell).trim();
          if (j > infoColsMax && /^\d{3,4}$/.test(id)) {
            const tipoClima = climaRef[j] ? String(climaRef[j]).trim().toUpperCase() : '';
            storeCols.push({ colIndex: j, storeId: id, tipoClima });
          }
        });

        // Construir mapa climaMatrix desde la fila de clima de la matriz
        const newClima = {};
        storeCols.forEach(sc => {
          if (sc.tipoClima && CLIMA_VALS.has(sc.tipoClima)) {
            newClima[sc.storeId] = sc.tipoClima;
          }
        });
        if (Object.keys(newClima).length > 0) {
          setClimaMatrix(newClima);
        }

        // Construir brandMatrix
        const matrix = {};
        for (let i = dataStartIdx; i < rows.length; i++) {
          const r = rows[i];
          const marca   = (iNomMarca >= 0 ? r[iNomMarca] : r[iMarca])?.trim().toUpperCase() || '';
          const seccion = iNomSec >= 0
            ? (r[iNomSec]?.trim().toUpperCase() || 'GENERAL')
            : iSeccion >= 0
              ? (r[iSeccion]?.trim().toUpperCase() || 'GENERAL')
              : 'GENERAL';
          if (!marca) continue;
          storeCols.forEach(sc => {
            const v = r[sc.colIndex]?.trim().toUpperCase();
            if (v && v !== 'NO' && v !== 'N' && v !== '0' && v !== '') {
              if (!matrix[sc.storeId]) matrix[sc.storeId] = [];
              const combo = `${seccion}|${marca}`;
              if (!matrix[sc.storeId].includes(combo)) matrix[sc.storeId].push(combo);
            }
          });
        }
        setBrandMatrix(matrix);
        const climaMsg = Object.keys(newClima).length > 0
          ? ` · Clima de ${Object.keys(newClima).length} centros detectado automáticamente.`
          : '';
        alert(`Matriz cargada: ${storeCols.length} centros, ${Object.keys(matrix).length} con permisos.${climaMsg}`);
      }
      if (matrizInputRef.current) matrizInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  // Opciones de filtros
  const opcionesGoa     = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.goa).filter(Boolean))], [rawData]);
  const opcionesLetras  = useMemo(() => [...new Set(rawData.map(r => r.letraDesc).filter(Boolean))].sort(), [rawData]);
  const opcionesZona    = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.zona).filter(Boolean)).values()], [rawData]);
  const opcionesSku    = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.sku).filter(Boolean))], [rawData]);
  const opcionesMarca  = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.marca).filter(Boolean))], [rawData]);
  const opcionesSeccion = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.seccion).filter(Boolean))], [rawData]);
  const opcionesTipoCentro = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.tipoCentro).filter(Boolean))], [rawData]);

  // HERRAMIENTA EXCEDENTE
  const calcularExcedentes = useCallback(() => {
    if (!rawData.length) return;
    const goasActivos = Object.keys(goasTemporada).filter(g => goasTemporada[g] && goasTemporada[g] !== 'TODO');
    if (goasActivos.length === 0) {
      alert('Define al menos un GOA de temporada antes de ejecutar la herramienta.');
      return;
    }
    setExcLoading(true);

    setTimeout(() => {
      const centroPorSku = {};
      rawData.forEach(r => {
        // Excluir mercancía con letra de descuento seleccionada para no mover
        if (letrasExcluidas.size > 0 && r.letraDesc && letrasExcluidas.has(r.letraDesc)) return;
        const key = `${r.sku}|${r.goa}|${r.marca}|${r.seccion}|${r.numSeccion}`;
        if (!centroPorSku[key]) centroPorSku[key] = { meta: r, centros: {} };
        const prev = centroPorSku[key].centros[r.centro];
        centroPorSku[key].centros[r.centro] = {
          ...r,
          oh:  (prev?.oh  || 0) + r.oh,
          vta: (prev?.vta || 0) + r.vta,
        };
      });

      const zonaValida = (tipoClima, tipoCentro = '') => {
        const tc = tipoCentro.toUpperCase().trim();
        if (tipoClima === 'FRIO')  return ['FRIO','EXTREMOSO','TEMPLADO',''].includes(tc);
        if (tipoClima === 'CALOR') return ['CALOR','PLAYA','EXTREMOSO','TEMPLADO',''].includes(tc);
        if (tipoClima === 'PLAYA') return ['PLAYA','CALOR'].includes(tc);
        return true;
      };

      const resultado = [];
      const sinReceptor = []; // SKUs donde no hay receptor válido → recomendar descuento

      Object.entries(centroPorSku).forEach(([, { meta, centros }]) => {
        const goa       = meta.goa;
        const marca     = meta.marca;
        const tipoClima = goasTemporada[goa];
        if (!tipoClima || tipoClima === 'TODO') return;

        if (filterGoa      !== 'ALL' && goa         !== filterGoa)     return;
        if (filterSku      !== 'ALL' && meta.sku     !== filterSku)     return;
        if (filterMarca    !== 'ALL' && marca        !== filterMarca)   return;
        if (filterSeccion  !== 'ALL' && meta.seccion !== filterSeccion) return;
        if (filterZona     !== 'ALL' && meta.zona    !== filterZona)    return;

        Object.entries(centros).forEach(([centroOrigen, dataOrigen]) => {
          if (dataOrigen.oh <= 0) return;
          if (filterTipoCentro !== 'ALL' && dataOrigen.tipoCentro !== filterTipoCentro) return;

          const zonaOrigen = dataOrigen.zona || '';
          const tcOrigen   = climaMatrix[dataOrigen.centro] || dataOrigen.tipoCentro || '';
          if (zonaValida(tipoClima, tcOrigen)) return; // ya está en zona correcta

          // Score receptor: clima + zona (misma > adyacente > cualquiera) + permiso + vta + MOS
          const adyacentesOrigen = zonasAdyacentes[zonaOrigen] || new Set();
          const allReceptores = Object.entries(centros)
            .filter(([c]) => c !== centroOrigen)
            .map(([c, d]) => {
              const seccionMarca = `${meta.numSeccion}|${marca}`;
              const tienePermiso = !brandMatrix[c] || brandMatrix[c].length === 0 || brandMatrix[c].includes(seccionMarca);
              const tcRec        = climaMatrix[c] || d.tipoCentro || '';
              const climaOK      = zonaValida(tipoClima, tcRec);
              const mismaZona    = d.zona === zonaOrigen;
              const zonaAdyacente = !mismaZona && adyacentesOrigen.has(d.zona || '');
              const vtaMes       = mesActual > 0 ? (d.vta || 0) / mesActual : 0;
              const mos          = vtaMes > 0 ? d.oh / vtaMes : 99;
              const score = (climaOK ? 1000 : 0)
                          + (mismaZona ? 600 : zonaAdyacente ? 300 : 0)
                          + (tienePermiso ? 200 : 0)
                          + (d.vta || 0)
                          - mos * 10;
              return { centro: c, data: d, tienePermiso, climaOK, mismaZona, zonaAdyacente, score, mos };
            })
            .filter(r => r.climaOK)
            .sort((a, b) => b.score - a.score);

          const receptor = allReceptores[0];

          if (!receptor) {
            // No hay receptor compatible — recomendar descuento
            sinReceptor.push({
              sku: meta.sku, goa, marca,
              seccion: meta.seccion, numSeccion: meta.numSeccion,
              centroOrigen, nombreOrigen: dataOrigen.nCentro || centroOrigen,
              pzs: dataOrigen.oh, precio: dataOrigen.precio,
              costoTraslado: dataOrigen.oh * costoPorPza,
            });
            return;
          }

          const costoTraslado = dataOrigen.oh * costoPorPza;
          const fueraZona     = !receptor.mismaZona;
          const esFueraAdyacente = fueraZona && !receptor.zonaAdyacente;

          // Filtro mínimo pzs y pesos
          if (minPzsTraslado > 0 && dataOrigen.oh < minPzsTraslado) return;
          if (minPesosTraslado > 0 && (dataOrigen.oh * dataOrigen.precio) < minPesosTraslado) return;

          resultado.push({
            seccion:            meta.seccion,
            numSeccion:         meta.numSeccion,
            sku:                meta.sku,
            nsku:               meta.nsku,
            modelo:             meta.modelo,
            marca,
            goa,
            centroSalida:       centroOrigen,
            nombreSalida:       dataOrigen.nCentro || centroOrigen,
            centroReceptor:     receptor.centro,
            nombreReceptor:     receptor.data.nCentro || receptor.centro,
            zonaOrigen:         dataOrigen.zona || '',
            zonaDestino:        receptor.data.zona || '',
            pzs:                dataOrigen.oh,
            pesos:              dataOrigen.oh * (dataOrigen.precio || 0),
            precio:             dataOrigen.precio,
            costoTraslado,
            fueraZona,
            razon:              `${goa} (${tipoClima}) en ${tcOrigen}${fueraZona ? (esFueraAdyacente ? ' ⚠️ zona no adyacente' : ' zona adyacente') : ''}`,
            tipoCentroOrigen:   dataOrigen.tipoCentro,
            tipoCentroReceptor: receptor.data.tipoCentro,
            letraDesc:          dataOrigen.letraDesc || '',
          });
        });
      });

      setExcResult(resultado);
      setSinReceptorData(sinReceptor);
      setExcLoading(false);
    }, 300);
  }, [rawData, brandMatrix, climaMatrix, goasTemporada, filterGoa, filterSku, filterMarca,
      filterSeccion, filterTipoCentro, filterZona, letrasExcluidas, costoPorPza, mesActual,
      minPzsTraslado, minPesosTraslado, zonasAdyacentes]);

  // Datos para gráfica excedente
  const chartDataExc = useMemo(() => {
    if (!excResult.length) return [];
    const byReceptor = {};
    const byOrigen   = {};
    rawData.forEach(r => {
      if (!byOrigen[r.centro]) byOrigen[r.centro] = 0;
      byOrigen[r.centro] += r.oh;
    });
    excResult.forEach(r => {
      if (!byReceptor[r.centroReceptor]) byReceptor[r.centroReceptor] = 0;
      byReceptor[r.centroReceptor] += r.pzs;
    });
    const salidas = {};
    excResult.forEach(r => {
      if (!salidas[r.centroSalida]) salidas[r.centroSalida] = 0;
      salidas[r.centroSalida] += r.pzs;
    });

    const nombrePorCentro = {};
    rawData.forEach(r => { if (r.centro) nombrePorCentro[r.centro] = r.nCentro || r.centro; });
    const centros = new Set([...Object.keys(byOrigen), ...Object.keys(byReceptor)]);
    return Array.from(centros).map(c => ({
      centro: c,
      nombre: nombrePorCentro[c] || c,
      antes:  byOrigen[c]   || 0,
      despues: Math.max(0, (byOrigen[c] || 0) - (salidas[c] || 0) + (byReceptor[c] || 0)),
    })).sort((a, b) => b.antes - a.antes).slice(0, 15);
  }, [excResult, rawData]);

  // Resumen de movimientos entre zonas
  const zonaResumen = useMemo(() => {
    if (!excResult.length) return [];
    const map = {};
    excResult.forEach(r => {
      const origen = rawData.find(d => d.centro === r.centroSalida)?.zona || r.centroSalida;
      const destino = rawData.find(d => d.centro === r.centroReceptor)?.zona || r.centroReceptor;
      const key = `${origen} → ${destino}`;
      if (!map[key]) map[key] = { origen, destino, pzs: 0, pesos: 0, mismaZona: origen === destino };
      map[key].pzs   += r.pzs;
      map[key].pesos += r.pesos;
    });
    return Object.values(map).sort((a,b) => b.pzs - a.pzs);
  }, [excResult, rawData]);

  // Scatter VTA vs OH — antes y después, con forecast basado en uplift de datos
  const scatterData = useMemo(() => {
    if (!rawData.length) return [];

    // Calcular uplift por GOA: ratio VTA/OH en centros con clima correcto vs incorrecto
    const upliftPorGoa = {};
    const CLIMA_COMP = {
      FRIO:  (tc) => ['FRIO','EXTREMOSO','TEMPLADO',''].includes(tc),
      CALOR: (tc) => ['CALOR','PLAYA','EXTREMOSO','TEMPLADO',''].includes(tc),
      PLAYA: (tc) => ['PLAYA','CALOR'].includes(tc),
    };
    const byGoa = {};
    rawData.forEach(r => {
      const tc = (climaMatrix[r.centro] || r.tipoCentro || '').toUpperCase();
      const tipoClima = goasTemporada[r.goa];
      if (!tipoClima || tipoClima === 'TODO') return;
      const enZonaCorrecta = CLIMA_COMP[tipoClima]?.(tc) ?? true;
      if (!byGoa[r.goa]) byGoa[r.goa] = { vtaOK: 0, ohOK: 0, vtaKO: 0, ohKO: 0 };
      if (enZonaCorrecta) {
        byGoa[r.goa].vtaOK += r.vta; byGoa[r.goa].ohOK += r.oh;
      } else {
        byGoa[r.goa].vtaKO += r.vta; byGoa[r.goa].ohKO += r.oh;
      }
    });
    Object.entries(byGoa).forEach(([goa, d]) => {
      const ratioOK = d.ohOK > 0 ? d.vtaOK / d.ohOK : null;
      const ratioKO = d.ohKO > 0 ? d.vtaKO / d.ohKO : null;
      upliftPorGoa[goa] = ratioOK && ratioKO && ratioKO > 0 ? ratioOK / ratioKO : 1.0;
    });

    // Agregar por centro
    const porCentro = {};
    rawData.forEach(r => {
      if (!porCentro[r.centro]) porCentro[r.centro] = { nombre: r.nCentro || r.centro, zona: r.zona, oh: 0, vta: 0, goas: {} };
      porCentro[r.centro].oh  += r.oh;
      porCentro[r.centro].vta += r.vta;
      if (!porCentro[r.centro].goas[r.goa]) porCentro[r.centro].goas[r.goa] = { oh: 0, vta: 0 };
      porCentro[r.centro].goas[r.goa].oh  += r.oh;
      porCentro[r.centro].goas[r.goa].vta += r.vta;
    });

    const salidas = {}, entradas = {};
    excResult.forEach(r => {
      salidas[r.centroSalida]    = (salidas[r.centroSalida]    || 0) + r.pzs;
      entradas[r.centroReceptor] = (entradas[r.centroReceptor] || 0) + r.pzs;
    });

    return Object.entries(porCentro).map(([id, d]) => {
      const ohDespues = Math.max(0, d.oh - (salidas[id] || 0) + (entradas[id] || 0));
      // Forecast VTA: aplica uplift a la VTA de cada GOA que recibió mercancía
      let vtaFcst = d.vta;
      if (entradas[id]) {
        // Centro receptor — estimar uplift promedio de los GOAs que llegan
        const upliftProm = excResult
          .filter(r => r.centroReceptor === id)
          .reduce((s, r) => s + (upliftPorGoa[r.goa] || 1), 0) /
          Math.max(1, excResult.filter(r => r.centroReceptor === id).length);
        vtaFcst = d.vta * upliftProm;
      }
      return {
        id, nombre: d.nombre, zona: d.zona,
        ohAntes: d.oh, vtaAntes: d.vta,
        ohDespues, vtaFcst,
        cambia: d.oh !== ohDespues,
      };
    }).filter(d => d.ohAntes > 0 || d.vtaAntes > 0);
  }, [excResult, rawData, climaMatrix, goasTemporada]);

  const exportExcedente = () => {
    // Layout base + Costo Traslado + Razón
    const header = ['División','Sección','Sección','Marca','Grupo de artículos','Modelo','Material','Texto breve Material','PVP','# centro tienda origen','Tienda Origen','Stock','Piezas a trasladar','# centro tienda destino','Tienda Destino','MONTO A TRASPASO','ZONA ORIGEN','ZONA DESTINO','Costo Traslado','Razón'];
    const rows = excResult.map(r => [
      '', r.numSeccion, r.seccion, r.marca, r.goa, r.modelo || '',
      r.sku, r.nsku || '', r.precio,
      r.centroSalida, r.nombreSalida,
      r.pzs,               // Stock (OH origen)
      r.pzs,               // Piezas a trasladar
      r.centroReceptor, r.nombreReceptor,
      r.pesos,             // Monto a traspaso
      r.zonaOrigen || '', r.zonaDestino || '',
      r.costoTraslado, r.razon
    ]);
    downloadExcel([header, ...rows], 'Traslados_Excedente.csv');
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 2 — NECESIDAD
  // ══════════════════════════════════════════════════════════════════════

  const [chequeraText,      setChequeraText]      = useState('');
  const [centrosSurtidores, setCentrosSurtidores] = useState('');

  // Helper: match centro por número o nombre, usado en tab 2
  const buildMatchSurtidor = useCallback((lista) => {
    if (!lista || !lista.length) return () => true;
    return (r) => lista.some(s => {
      const sq = s.toUpperCase().trim();
      return r.centro?.toUpperCase().trim() === sq ||
             r.nCentro?.toUpperCase().trim() === sq;
    });
  }, []);

  const [necesResult,       setNecesResult]       = useState([]);
  const [necesAvisos,       setNecesAvisos]       = useState([]);
  const [necesLoading,      setNecesLoading]      = useState(false);

  // Modal para tallas faltantes: { sku, nsku, callback }
  const [modalTallas,    setModalTallas]    = useState(null);
  // Cache manual de tallas por SKU: { [sku]: '17' }
  const [tallasCache,    setTallasCache]    = useState({});
  const [modalInputVal,  setModalInputVal]  = useState('');
  // Corridas mínimas que debe dejar cada surtidor
  const [minCorridasAlto, setMinCorridasAlto] = useState(2); // top tiendas por vta
  const [minCorridasResto, setMinCorridasResto] = useState(1);

  // Persistencia Tab 2
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_traslados_nec');
      if (s) {
        const d = JSON.parse(s);
        if (d.chequeraText)        setChequeraText(d.chequeraText);
        if (d.centrosSurtidores)   setCentrosSurtidores(d.centrosSurtidores);
        if (d.necesResult?.length) setNecesResult(d.necesResult);
        if (d.necesAvisos?.length) setNecesAvisos(d.necesAvisos);
        if (d.tallasCache)         setTallasCache(d.tallasCache);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gop_traslados_nec', JSON.stringify({ chequeraText, centrosSurtidores, necesResult, necesAvisos, tallasCache }));
    } catch {}
  }, [chequeraText, centrosSurtidores, necesResult, necesAvisos, tallasCache]);

  // Extraer talla del nombre del SKU: "TENIS NIÑA, 17, ROSA CLARO" → "17"
  const extraerTalla = useCallback((nsku = '', sku = '', cache = {}) => {
    if (cache[sku]) return cache[sku];
    // Busca el primer segmento numérico tras una coma
    const match = nsku.match(/,\s*([0-9]+(?:\.[0-9]+)?)\s*(?:,|$)/);
    if (match) return match[1].trim();
    // Fallback: busca número standalone en la cadena
    const nums = nsku.match(/\b([0-9]{2,3})\b/g);
    if (nums) return nums[0];
    return null;
  }, []);

  // Lookup de centro: busca por nombre o nCentro en rawData
  const lookupCentro = useCallback((input, datos) => {
    if (!input || !datos.length) return { nombre: input, nCentro: '', zona: '' };
    const q = input.trim().toUpperCase();
    const hit = datos.find(r =>
      r.centro.toUpperCase() === q ||
      (r.nCentro || '').toUpperCase() === q
    );
    // nombre = nombre tienda (nCentro col), nCentro = número (centro col)
    return hit
      ? { nombre: hit.nCentro || hit.centro, nCentro: hit.centro, zona: hit.zona || '' }
      : { nombre: input, nCentro: '', zona: '' };
  }, []);

  const fmtCentro = (nombre, nCentro) =>
    nCentro ? `${nombre} (${nCentro})` : nombre;

  // Auto-detectar si el identificador es MODELO, GOA o MARCA
  const detectarTipoId = useCallback((id, datos) => {
    const q = id.toUpperCase().trim();
    if (!q) return { tipo: null, valor: q };
    // Escalera: SKU → Modelo → GOA → Marca
    if (datos.some(r => r.sku?.toUpperCase() === q))           return { tipo: 'sku',    valor: q };
    if (datos.some(r => (r.modelo || '').toUpperCase() === q)) return { tipo: 'modelo', valor: q };
    if (datos.some(r => r.goa === q))                          return { tipo: 'goa',    valor: q };
    if (datos.some(r => r.marca === q))                        return { tipo: 'marca',  valor: q };
    return { tipo: 'modelo', valor: q }; // fallback
  }, []);

  // Parsear chequera: Identificador | Ppto | CentroReceptor
  const parsearChequera = useCallback((texto, datos) => {
    const lines = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const items = [];
    lines.forEach(line => {
      const sep   = line.includes('|') ? '|' : line.includes('\t') ? '\t' : ',';
      const parts = line.split(sep).map(p => p.trim());
      if (parts.length < 2) return;

      const idRaw = parts[0] || '';

      // Detección flexible del resto de campos — no importa orden ni si faltan
      // Ppto = primer campo numérico después del identificador
      // Centro = primer campo no-numérico después del identificador
      let pptoNeed = 0;
      let centroReceptor = 'DESTINO (definir)';
      for (let pi = 1; pi < parts.length; pi++) {
        const v = parts[pi].trim();
        if (!v) continue;
        const n = num(v);
        if (n > 0 && pptoNeed === 0) {
          pptoNeed = n; // primer número = ppto
        } else if (isNaN(parseFloat(v.replace(/[$,]/g, ''))) || v.replace(/[$,\d.]/g, '').length > 2) {
          // tiene letras suficientes = es un centro
          if (centroReceptor === 'DESTINO (definir)') centroReceptor = v;
        }
      }

      // Soporte de múltiples identificadores en el primer campo: "HARRY, WILSON-22, MODELO-X"
      // Separados por coma (dentro del campo, antes del primer |)
      const ids = idRaw.split(',').map(s => s.trim()).filter(Boolean);

      if (ids.length === 1) {
        // Una sola línea normal
        const { tipo, valor } = detectarTipoId(idRaw, datos);
        items.push({ idRaw, tipo, valor, pptoNeed, centroReceptor, multiIds: null });
      } else {
        // Múltiples identificadores — calcular OH total por id para distribuir ppto proporcionalmente
        const resueltos = ids.map(id => {
          const { tipo, valor } = detectarTipoId(id, datos);
          // OH disponible total para este identificador
          const ohTotal = datos
            .filter(r => {
              if (tipo === 'modelo') return (r.modelo || r.goa).toUpperCase() === valor;
              if (tipo === 'goa')    return r.goa === valor;
              if (tipo === 'marca')  return r.marca === valor;
              return false;
            })
            .reduce((s, r) => s + r.oh, 0);
          return { id, tipo, valor, ohTotal };
        });

        const ohTotalSum = resueltos.reduce((s, r) => s + r.ohTotal, 0) || 1;

        resueltos.forEach(r => {
          const ppto = pptoNeed > 0
            ? Math.round((r.ohTotal / ohTotalSum) * pptoNeed)
            : 0;
          items.push({
            idRaw: r.id, tipo: r.tipo, valor: r.valor,
            pptoNeed: ppto, centroReceptor,
            multiIds: ids, // para referencia
          });
        });
      }
    });
    return items;
  }, [detectarTipoId]);

  // HERRAMIENTA NECESIDAD — corridas por modelo+talla
  const calcularNecesidad = useCallback(() => {
    if (!chequeraText.trim() || !rawData.length) return;
    setNecesAvisos([]);

    // Validar campos obligatorios en cada línea
    const lineasRaw = chequeraText.split('\n').map(l => l.trim()).filter(Boolean);
    const errores = [];
    lineasRaw.forEach((linea, i) => {
      const sep = linea.includes('|') ? '|' : linea.includes('\t') ? '\t' : ',';
      const parts = linea.split(sep).map(p => p.trim());
      const id = parts[0]?.trim();
      const hasPpto = parts.slice(1).some(p => num(p) > 0);
      const hasCentro = parts.slice(1).some(p => p && isNaN(parseFloat(p.replace(/[$,]/g, ''))));
      if (!id) errores.push(`Línea ${i+1}: falta identificador (marca, GOA, modelo o SKU)`);
      if (!hasPpto) errores.push(`Línea ${i+1}: falta presupuesto (número > 0)`);
      if (!hasCentro) errores.push(`Línea ${i+1}: falta centro receptor`);
    });
    if (errores.length) { alert('Revisa la chequera:\n' + errores.join('\n')); return; }

    const chequera       = parsearChequera(chequeraText, rawData);
    const surtidoresList = centrosSurtidores
      ? centrosSurtidores.split(',').map(c => c.trim()).filter(Boolean)
      : null;
    const matchSurtidor  = buildMatchSurtidor(surtidoresList);

    // Detectar SKUs sin talla parseable que no estén en cache
    const sinTalla = rawData.filter(r => {
      if (!matchSurtidor(r)) return false;
      const t = extraerTalla(r.nsku, r.sku, tallasCache);
      return !t && r.oh > 0;
    });
    const skusSinTalla = [...new Map(sinTalla.map(r => [r.sku, r])).values()];

    if (skusSinTalla.length > 0) {
      // Abrir modal con el primer SKU sin talla
      setModalTallas({ skus: skusSinTalla, index: 0, pendingCalc: true });
      return;
    }

    ejecutarCalculo(chequera, surtidoresList, matchSurtidor, tallasCache, minCorridasAlto, minCorridasResto);
  }, [chequeraText, centrosSurtidores, rawData, tallasCache, minCorridasAlto, minCorridasResto, buildMatchSurtidor]);

  const ejecutarCalculo = useCallback((chequera, surtidoresList, matchSurtidor, cache, minAlto, minResto) => {
    setNecesLoading(true);
    setTimeout(() => {
      // ── Inventario: centro → modeloKey → talla → [rows] ──────────────
      const inv = {};
      rawData.forEach(r => {
        if (!matchSurtidor(r)) return;
        if (r.oh <= 0) return;
        const talla = extraerTalla(r.nsku, r.sku, cache);
        if (!talla) return;
        const mk = r.modelo || r.goa;
        if (!inv[r.centro]) inv[r.centro] = {};
        if (!inv[r.centro][mk]) inv[r.centro][mk] = {};
        if (!inv[r.centro][mk][talla]) inv[r.centro][mk][talla] = [];
        inv[r.centro][mk][talla].push({ ...r, ohDisp: r.oh });
      });

      // ── Venta por centro para clasificar alto/bajo volumen ───────────
      const vtaCentro = {};
      rawData.forEach(r => {
        if (surtidoresList) {
          const matchCentro = surtidoresList.some(s => {
            const sq = s.toUpperCase().trim();
            return r.centro.toUpperCase().trim() === sq ||
                   r.nCentro.toUpperCase().trim() === sq;
          });
          if (!matchCentro) return;
        }
        vtaCentro[r.centro] = (vtaCentro[r.centro] || 0) + (r.vta || 0);
      });
      const vtaVals = Object.values(vtaCentro).sort((a,b) => b - a);
      const p70 = vtaVals[Math.floor(vtaVals.length * 0.3)] || 0; // top 30% = alto
      const esAltoVolumen = (centro) => (vtaCentro[centro] || 0) >= p70;

      // ── Curva de tallas global por modelo: vta+oh por talla ─────────
      const curvaPorModelo = {}; // { modeloKey: { talla: vtaOh } }
      rawData.forEach(r => {
        const talla = extraerTalla(r.nsku, r.sku, cache);
        if (!talla) return;
        const mk = r.modelo || r.goa;
        if (!curvaPorModelo[mk]) curvaPorModelo[mk] = {};
        curvaPorModelo[mk][talla] = (curvaPorModelo[mk][talla] || 0) + (r.vta || 0) + (r.oh || 0);
      });

      const invMut = JSON.parse(JSON.stringify(inv));
      const resultado = [];
      const avisos = []; // mensajes de por qué no se pudo ejecutar algo

      chequera.forEach(item => {
        const recInfo = lookupCentro(item.centroReceptor, rawData);
        const pptoTotal = item.pptoNeed || 0;

        // ── Cascada Marca → GOA → Modelo → Tallas ──────────────────────
        // 1. Filtrar rows del CSV que aplican al identificador
        let rowsAplicables = [];
        if (item.tipo === 'sku') {
          rowsAplicables = rawData.filter(r => r.sku === item.valor);
        } else if (item.tipo === 'modelo') {
          rowsAplicables = rawData.filter(r => (r.modelo || r.goa).toUpperCase() === item.valor);
        } else if (item.tipo === 'goa') {
          rowsAplicables = rawData.filter(r => r.goa === item.valor);
        } else if (item.tipo === 'marca') {
          rowsAplicables = rawData.filter(r => r.marca === item.valor);
        }
        if (!rowsAplicables.length) return;

        // 2. Calcular OH total por modelo (para ponderación)
        const ohPorModelo = {};
        rowsAplicables.forEach(r => {
          const mk = r.modelo || r.goa;
          ohPorModelo[mk] = (ohPorModelo[mk] || 0) + r.oh;
        });
        const ohTotalAll = Object.values(ohPorModelo).reduce((s,v) => s+v, 0) || 1;

        // 3. Distribuir ppto entre modelos proporcional a OH
        const modelosAplicables = Object.keys(ohPorModelo);

        modelosAplicables.forEach(modeloKey => {
          const pptoPorModelo = Math.round((ohPorModelo[modeloKey] / ohTotalAll) * pptoTotal);
          let pptoRestante = pptoPorModelo;
          if (pptoRestante <= 0) return;

          // Corrida = todas las tallas del modelo en el CSV
          const curva = curvaPorModelo[modeloKey] || {};
          const totalCurva = Object.values(curva).reduce((s,v) => s+v, 0) || 1;
          const corrida = Object.keys(curva).sort((a,b) => parseFloat(a)-parseFloat(b));
          if (!corrida.length) return;

          // Precio corrida = suma precios de 1 SKU por talla (más representativo)
          const precioTalla = {}; // { talla: precio }
          rawData.forEach(r => {
            const t = extraerTalla(r.nsku, r.sku, cache);
            if (t && (r.modelo || r.goa) === modeloKey) {
              if (!precioTalla[t]) precioTalla[t] = r.precio || 0;
            }
          });
          // precioCorrida calculado abajo con curva de tallas

          // Precio de 1 corrida completa = suma de (precio_talla × pzs_curva_talla)
          // Primero calcular pzs por talla para 1 corrida según curva
          const pzsCorrida1 = {}; // { talla: pzs para 1 corrida }
          corrida.forEach(talla => {
            const pct = (curva[talla] || 0) / totalCurva;
            // Mínimo 1 pza por talla en la corrida base
            pzsCorrida1[talla] = Math.max(1, Math.round(100 * pct)); // sobre base 100 para preservar proporción
          });
          // Normalizar: encontrar el GCD para que la corrida sea la más pequeña posible
          const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
          const gcdAll = Object.values(pzsCorrida1).reduce((g, v) => gcd(g, v), Object.values(pzsCorrida1)[0] || 1);
          corrida.forEach(t => { pzsCorrida1[t] = Math.max(1, Math.floor(pzsCorrida1[t] / gcdAll)); });

          // Precio de 1 corrida
          const precioCorrida = corrida.reduce((s, t) => s + (precioTalla[t]||0) * (pzsCorrida1[t]||1), 0);
          if (precioCorrida <= 0) return;

          // Cuántas corridas caben con el ppto
          const corridasMax = pptoRestante > 0 ? Math.floor(pptoRestante / precioCorrida) : 999;
          if (corridasMax <= 0) {
            avisos.push(`"${item.idRaw}" → modelo ${modeloKey}: el ppto asignado ($${Math.round(pptoRestante).toLocaleString('es-MX')}) no alcanza ni 1 corrida completa. Necesitas mínimo $${Math.round(precioCorrida).toLocaleString('es-MX')} por corrida (${corrida.length} tallas).`);
            return;
          }

          // Centro receptor para excluirlo de surtidores
          const receptorNombre = recInfo.nombre.toUpperCase().trim();
          const receptorNCentro = recInfo.nCentro?.trim() || '';

          // Por talla: pzs = corridasMax × pzs de esa talla en 1 corrida
          const asignaciones = [];
          let corridasRealesMin = corridasMax;

          corrida.forEach(talla => {
            const pzsPedidas = corridasMax * (pzsCorrida1[talla] || 1);

            // Mejor surtidor: mayor vta, que pueda dar pzsPedidas, dejar mínimo, y NO ser el receptor
            const candidatos = Object.entries(invMut)
              .filter(([centro, mods]) => {
                if (!mods[modeloKey]?.[talla]?.some(r => r.ohDisp > 0)) return false;
                // Excluir si el centro ES el receptor
                const cUp = centro.toUpperCase().trim();
                if (receptorNCentro && cUp === receptorNCentro) return false;
                if (cUp === receptorNombre) return false;
                // También excluir por nCentro del row
                const firstRow = mods[modeloKey][talla][0];
                if (receptorNCentro && firstRow?.nCentro?.trim() === receptorNCentro) return false;
                return true;
              })
              .map(([centro, mods]) => {
                const rows = mods[modeloKey][talla].filter(r => r.ohDisp > 0);
                const ohTot = rows.reduce((s,r) => s + r.ohDisp, 0);
                const vtaTot = rows.reduce((s,r) => s + (r.vta||0), 0);
                const minGuarda = esAltoVolumen(centro) ? (minAlto||2) : (minResto||1);
                const puedeEnviar = Math.max(0, ohTot - minGuarda);
                return { centro, rows, ohTot, vtaTot, puedeEnviar };
              })
              .filter(c => c.puedeEnviar > 0)
              .sort((a,b) => b.vtaTot - a.vtaTot || b.ohTot - a.ohTot);

            if (!candidatos.length) return;
            const mejor = candidatos[0];
            const pzsEnv = Math.min(pzsPedidas, mejor.puedeEnviar);
            if (pzsEnv <= 0) return;
            corridasRealesMin = Math.min(corridasRealesMin, pzsEnv);

            const row = mejor.rows[0];
            asignaciones.push({
              talla, pzsEnv,
              sku: row.sku, nsku: row.nsku,
              centro: mejor.centro,        // número de centro surtidor
              nCentro: row.nCentro,        // nombre tienda surtidor
              nombreCentro: row.nCentro,   // nombre tienda (para display)
              zona: row.zona || '',        // zona del surtidor
              oh: mejor.ohTot, precio: precioTalla[talla]||row.precio,
              seccion: row.seccion, numSeccion: row.numSeccion,
              marca: row.marca, goa: row.goa, modelo: modeloKey,
            });
          });

          if (!asignaciones.length) {
            avisos.push(`"${item.idRaw}" → modelo ${modeloKey}: no hay centros surtidores con stock suficiente (respetando mínimo de corridas a dejar).`);
            return;
          }

          // Emitir filas y descontar
          asignaciones.forEach(a => {
            const rows = invMut[a.centro]?.[modeloKey]?.[a.talla];
            let restante = a.pzsEnv;
            if (rows) rows.forEach(r => { const d = Math.min(r.ohDisp, restante); r.ohDisp -= d; restante -= d; });

            resultado.push({
              seccion: a.seccion, numSeccion: a.numSeccion,
              marca: a.marca, goa: a.goa, modelo: a.modelo,
              sku: a.sku, nsku: a.nsku, talla: a.talla,
              centroSalida:   fmtCentro(a.nombreCentro, a.nCentro),  // para tabla (display)
              centroReceptor: fmtCentro(recInfo.nombre, recInfo.nCentro),
              // campos separados para export
              centroSalidaNum: a.centro || '',
              nombreSalida:    a.nCentro || a.nombreCentro,
              centroReceptorNum: recInfo.nCentro || '',
              nombreReceptor:  recInfo.nombre,
              zonaOrigen:      a.zona || '',
              zonaDestino:     recInfo.zona || '',
              ohDisp: a.oh, pzs: a.pzsEnv,
              ohQueda: a.oh - a.pzsEnv,
              importe: a.pzsEnv * (a.precio||0),
              precio: a.precio,
              corridasEnv: a.pzsEnv,
            });
          });

          if (pptoRestante > 0) pptoRestante -= asignaciones.reduce((s,a) => s + a.pzsEnv*(a.precio||0), 0);
        }); // end modelosAplicables
      }); // end chequera

      setNecesResult(resultado);
      setNecesAvisos(avisos);
      // Si no hubo resultados pero sí avisos, mostrarlos
      if (resultado.length === 0 && avisos.length > 0) {
        alert('No se generaron traslados:\n\n' + avisos.join('\n\n'));
      }
      setNecesLoading(false);
    }, 300);
  }, [rawData, extraerTalla, lookupCentro]);

  // Confirmar talla manual en el modal
  const confirmarTallaModal = () => {
    if (!modalTallas || !modalInputVal.trim()) return;
    const current = modalTallas.skus[modalTallas.index];
    const newCache = { ...tallasCache, [current.sku]: modalInputVal.trim() };
    setTallasCache(newCache);

    const nextIndex = modalTallas.index + 1;
    if (nextIndex < modalTallas.skus.length) {
      setModalTallas({ ...modalTallas, index: nextIndex });
      setModalInputVal('');
    } else {
      setModalTallas(null);
      setModalInputVal('');
      // Reejecutar cálculo con cache completo
      const chequera = parsearChequera(chequeraText, rawData);
      const surtidoresList = centrosSurtidores
        ? centrosSurtidores.split(',').map(c => c.trim()).filter(Boolean)
        : null;
      const ms = buildMatchSurtidor(surtidoresList);
      ejecutarCalculo(chequera, surtidoresList, ms, newCache, minCorridasAlto, minCorridasResto);
    }
  };

  const chartDataNec = useMemo(() => {
    if (!necesResult.length) return [];
    const byGoa = {};
    necesResult.forEach(r => {
      if (!byGoa[r.goa]) byGoa[r.goa] = { pzs: 0, pesos: 0 };
      byGoa[r.goa].pzs   += r.pzs;
      byGoa[r.goa].pesos += r.importe;
    });
    return Object.entries(byGoa).map(([label, v]) => ({ label, value: v.pzs }));
  }, [necesResult]);

  const exportNecesidad = () => {
    // Layout base
    const header = ['División','Sección','Sección','Marca','Grupo de artículos','Modelo','Material','Texto breve Material','PVP','# centro tienda origen','Tienda Origen','Stock','Piezas a trasladar','# centro tienda destino','Tienda Destino','MONTO A TRASPASO','ZONA ORIGEN','ZONA DESTINO'];
    const rows = necesResult.map(r => [
      '', r.numSeccion, r.seccion, r.marca, r.goa, r.modelo || '',
      r.sku, r.nsku || '', r.precio,
      r.centroSalidaNum || '', r.nombreSalida || '',
      r.ohDisp,            // Stock (OH origen)
      r.pzs,               // Piezas a trasladar
      r.centroReceptorNum || '', r.nombreReceptor || '',
      r.importe,           // Monto a traspaso
      r.zonaOrigen || '', r.zonaDestino || ''
    ]);
    downloadExcel([header, ...rows], 'Traslados_Aperturas.csv');
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 3 — NIVELACIÓN DE INVENTARIOS
  // ══════════════════════════════════════════════════════════════════════

  const [nivNivel,       setNivNivel]       = useState('sku'); // goa | marca | modelo | sku
  const [nivZonaMode,    setNivZonaMode]    = useState('misma'); // misma | todas | metro
  const [mosObjetivoMin, setMosObjetivoMin] = useState(2);
  const [mosObjetivoMax, setMosObjetivoMax] = useState(4);
  const [nivResult,      setNivResult]      = useState([]);
  const [nivProblematicas, setNivProblematicas] = useState([]);
  const [nivLiquidacion,   setNivLiquidacion]   = useState([]);
  const [nivCobertura,     setNivCobertura]     = useState(null);
  const [nivLoading,     setNivLoading]     = useState(false);
  const [nivExecuted,    setNivExecuted]    = useState(false);
  // Pesos ajustables del score de potencial
  const [pesoVelocidad,  setPesoVelocidad]  = useState(40);
  const [pesoRiesgo,     setPesoRiesgo]     = useState(40);
  const [pesoHistorico,  setPesoHistorico]  = useState(20);

  // Persistencia
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_traslados_niv');
      if (s) {
        const d = JSON.parse(s);
        if (d.nivNivel)       setNivNivel(d.nivNivel);
        if (d.nivZonaMode)    setNivZonaMode(d.nivZonaMode);
        if (d.mosObjetivoMin != null) setMosObjetivoMin(d.mosObjetivoMin);
        if (d.mosObjetivoMax != null) setMosObjetivoMax(d.mosObjetivoMax);
        if (d.pesoVelocidad != null)  setPesoVelocidad(d.pesoVelocidad);
        if (d.pesoRiesgo != null)     setPesoRiesgo(d.pesoRiesgo);
        if (d.pesoHistorico != null)  setPesoHistorico(d.pesoHistorico);
        if (d.nivResult?.length) { setNivResult(d.nivResult); setNivExecuted(true); }
        if (d.nivProblematicas?.length) setNivProblematicas(d.nivProblematicas);
        if (d.nivLiquidacion?.length) setNivLiquidacion(d.nivLiquidacion);
        if (d.nivCobertura) setNivCobertura(d.nivCobertura);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gop_traslados_niv', JSON.stringify({
        nivNivel, nivZonaMode, mosObjetivoMin, mosObjetivoMax, pesoVelocidad, pesoRiesgo, pesoHistorico, nivResult, nivProblematicas, nivLiquidacion, nivCobertura
      }));
    } catch {}
  }, [nivNivel, nivZonaMode, mosObjetivoMin, mosObjetivoMax, pesoVelocidad, pesoRiesgo, pesoHistorico, nivResult, nivProblematicas, nivLiquidacion, nivCobertura]);

  const calcularNivelacion = useCallback(() => {
    if (!rawData.length) return;
    setNivLoading(true);

    setTimeout(() => {
      // Clave de agrupación según nivel elegido
      const keyOf = (r) => {
        if (nivNivel === 'goa')    return r.goa;
        if (nivNivel === 'marca')  return r.marca;
        if (nivNivel === 'modelo') return r.modelo || r.goa;
        return r.sku; // sku
      };

      // VTA 3 meses: usar campo vta3m si existe, sino estimar de vta acum
      const getVta3m = (r) => r.vta3m != null && r.vta3m > 0 ? r.vta3m : (r.vta || 0) * (3 / Math.max(1, mesActual));

      // Zona efectiva según modo: misma=zona real, todas=una sola bolsa, metro=agrupa todas las METRO
      const zonaEfectiva = (z) => {
        const zz = (z || 'SIN ZONA').toUpperCase();
        if (nivZonaMode === 'todas') return 'GLOBAL';
        if (nivZonaMode === 'metro' && zz.startsWith('METRO')) return 'METRO (todas)';
        return zz;
      };

      const porZonaClave = {};

      // Separar: filas excluidas por letra de rebaja van a liquidación directa
      const liquidacionPorLetra = {}; // clave|zona → { rebajado }
      rawData.forEach(r => {
        const zona = zonaEfectiva(r.zona);
        const clave = keyOf(r);
        if (!clave) return;
        // Si la letra está excluida, no entra a nivelación (va a liquidación con su nivel)
        if (letrasExcluidas.size > 0 && r.letraDesc && letrasExcluidas.has(r.letraDesc)) {
          const lk = `${zona}||${clave}`;
          if (!liquidacionPorLetra[lk]) liquidacionPorLetra[lk] = {
            zona, clave, goa: r.goa, marca: r.marca, sku: r.sku, nsku: r.nsku, modelo: r.modelo,
            oh: 0, importe: 0, letraDesc: r.letraDesc, tiendas: new Set(),
          };
          liquidacionPorLetra[lk].oh += r.oh;
          liquidacionPorLetra[lk].importe += r.oh * (r.precio || 0);
          liquidacionPorLetra[lk].tiendas.add(r.centro);
          return;
        }
        if (!porZonaClave[zona]) porZonaClave[zona] = {};
        if (!porZonaClave[zona][clave]) porZonaClave[zona][clave] = { centros: {}, meta: r };
        const nodo = porZonaClave[zona][clave].centros;
        if (!nodo[r.centro]) {
          nodo[r.centro] = {
            centro: r.centro, nCentro: r.nCentro || r.centro, zona,
            oh: 0, vtaAcum: 0, vta3m: 0,
            seccion: r.seccion, numSeccion: r.numSeccion,
            marca: r.marca, goa: r.goa, modelo: r.modelo,
            sku: r.sku, nsku: r.nsku, precio: r.precio,
            rows: [],
          };
        }
        nodo[r.centro].oh      += r.oh;
        nodo[r.centro].vtaAcum += r.vta || 0;
        nodo[r.centro].vta3m   += getVta3m(r);
        nodo[r.centro].rows.push(r);
      });

      const resultado = [];
      const problematicas = [];
      const liquidacion = []; // claves sin venta en toda la zona → sugerir descuento

      Object.entries(porZonaClave).forEach(([zona, claves]) => {
        Object.entries(claves).forEach(([clave, { centros, meta }]) => {
          const nodos = Object.values(centros).map(n => {
            const vtaProyMes = n.vta3m / 3; // forecast plano (ya trae fallback a vta acum)
            const mos = vtaProyMes > 0 ? n.oh / vtaProyMes : (n.oh > 0 ? 99 : 0);
            return { ...n, vtaProyMes, mos };
          }).filter(n => n.oh > 0 || n.vtaProyMes > 0);

          if (nodos.length < 2) return;

          // ¿Nadie vende esta clave en la zona? → liquidación, no traslado
          const vtaZonaTotal = nodos.reduce((s,n) => s + n.vtaProyMes, 0);
          const ohZonaTotal  = nodos.reduce((s,n) => s + n.oh, 0);
          if (vtaZonaTotal <= 0.01 && ohZonaTotal > 0) {
            liquidacion.push({
              zona, clave, nivel: nivNivel,
              goa: meta.goa, marca: meta.marca, sku: meta.sku, nsku: meta.nsku, modelo: meta.modelo,
              tiendas: nodos.length,
              oh: ohZonaTotal,
              importe: nodos.reduce((s,n) => s + n.oh * (n.precio||0), 0),
            });
            return; // no intentar nivelar
          }

          // Normalizadores para el score de potencial
          const maxVel  = Math.max(...nodos.map(n => n.vtaProyMes), 0.01);
          const maxHist = Math.max(...nodos.map(n => n.vtaAcum), 0.01);
          const wTot = (pesoVelocidad + pesoRiesgo + pesoHistorico) || 1;

          nodos.forEach(n => {
            // velocidad: qué tan rápido vende (normalizado)
            const sVel = n.vtaProyMes / maxVel;
            // riesgo de quiebre: MOS bajo = alto potencial de recibir
            const sRiesgo = n.mos < mosObjetivoMin ? 1 : Math.max(0, 1 - (n.mos - mosObjetivoMin) / (mosObjetivoMax - mosObjetivoMin + 0.01));
            // histórico
            const sHist = n.vtaAcum / maxHist;
            n.potencial = ((pesoVelocidad*sVel + pesoRiesgo*sRiesgo + pesoHistorico*sHist) / wTot);
          });

          // Donadores: MOS alto (sobreinventario) ordenado desc
          // Receptores: mayor potencial + MOS bajo
          let donadores  = [...nodos].filter(n => n.mos > mosObjetivoMax).sort((a,b) => b.mos - a.mos);
          let receptores = [...nodos].filter(n => n.mos < mosObjetivoMin || n.potencial > 0.5)
                                     .sort((a,b) => b.potencial - a.potencial || a.mos - b.mos);

          // Trabajar sobre copia mutable de OH
          const ohMut = {};
          nodos.forEach(n => { ohMut[n.centro] = n.oh; });

          const tieneTallas = nodos.some(n => n.rows.some(rr => {
            const m = (rr.nsku||'').match(/,\s*([0-9]+)\s*(?:,|$)/);
            return !!m;
          }));

          receptores.forEach(rec => {
            // objetivo: llevar receptor a mosObjetivoMin (piso) idealmente al promedio del rango
            const mosTarget = (mosObjetivoMin + mosObjetivoMax) / 2;
            const ohObjetivo = Math.round(rec.vtaProyMes * mosTarget);
            let faltante = Math.max(0, ohObjetivo - ohMut[rec.centro]);
            if (faltante <= 0) return;

            for (const don of donadores) {
              if (faltante <= 0) break;
              if (don.centro === rec.centro) continue;
              // donador debe quedar >= mosObjetivoMin
              const ohMinDon = Math.ceil(don.vtaProyMes * mosObjetivoMin);
              const puedeDonar = Math.max(0, ohMut[don.centro] - ohMinDon);
              if (puedeDonar <= 0) continue;

              const mover = Math.min(faltante, puedeDonar);
              if (mover <= 0) continue;

              ohMut[don.centro] -= mover;
              ohMut[rec.centro] += mover;
              faltante -= mover;

              resultado.push({
                zona, nivel: nivNivel, clave,
                seccion: don.seccion, numSeccion: don.numSeccion,
                marca: don.marca, goa: don.goa, modelo: don.modelo,
                sku: don.sku, nsku: don.nsku,
                centroSalida: don.centro, nombreSalida: don.nCentro,
                centroReceptor: rec.centro, nombreReceptor: rec.nCentro,
                zonaOrigen: don.zona, zonaDestino: rec.zona,
                pzs: mover,
                ohSalidaAntes: don.oh,
                importe: mover * (don.precio || 0),
                precio: don.precio,
                mosSalidaAntes: +don.mos.toFixed(1),
                mosReceptorAntes: +rec.mos.toFixed(1),
                mosSalidaDespues: +(don.vtaProyMes > 0 ? ohMut[don.centro]/don.vtaProyMes : 0).toFixed(1),
                mosReceptorDespues: +(rec.vtaProyMes > 0 ? ohMut[rec.centro]/rec.vtaProyMes : 0).toFixed(1),
                potencialReceptor: +rec.potencial.toFixed(2),
              });
            }
          });

          // Detectar problemáticas: tiendas que siguen fuera de rango tras nivelar
          nodos.forEach(n => {
            const mosFinal = n.vtaProyMes > 0 ? ohMut[n.centro] / n.vtaProyMes : 99;
            if (mosFinal > mosObjetivoMax * 1.5 && ohMut[n.centro] > 0) {
              problematicas.push({
                zona, clave, nivel: nivNivel,
                centro: n.centro, nombre: n.nCentro,
                goa: n.goa, marca: n.marca, sku: n.sku, nsku: n.nsku, modelo: n.modelo,
                ohInicial: n.oh,
                mosInicial: +n.mos.toFixed(1),
                oh: ohMut[n.centro],
                mosFinal: +mosFinal.toFixed(1),
                vtaProyMes: +n.vtaProyMes.toFixed(1),
                importe: ohMut[n.centro] * (n.precio || 0),
              });
            }
          });
        });
      });

      // Agregar las excluidas por letra al array de liquidación, marcadas como "ya rebajado"
      Object.values(liquidacionPorLetra).forEach(l => {
        liquidacion.push({
          zona: l.zona, clave: l.clave, nivel: nivNivel,
          goa: l.goa, marca: l.marca, sku: l.sku, nsku: l.nsku, modelo: l.modelo,
          tiendas: l.tiendas.size,
          oh: l.oh, importe: l.importe,
          motivo: 'rebajado', letraDesc: l.letraDesc,
        });
      });
      // Marcar las de liquidación por-sin-venta como "sin rebaja aún"
      liquidacion.forEach(l => { if (!l.motivo) l.motivo = 'sin_venta'; });

      problematicas.sort((a,b) => b.mosFinal - a.mosFinal);
      liquidacion.sort((a,b) => b.importe - a.importe);
      setNivResult(resultado);
      setNivProblematicas(problematicas.slice(0, 10));
      setNivLiquidacion(liquidacion);
      // Cobertura de VTA_3M
      const totalRows = rawData.length;
      const con3m = rawData.filter(r => r.vta3m != null && r.vta3m > 0).length;
      const conVta = rawData.filter(r => (r.vta || 0) > 0).length;
      setNivCobertura({
        total: totalRows,
        con3m, pct3m: totalRows ? (con3m/totalRows*100) : 0,
        conVta, pctVta: totalRows ? (conVta/totalRows*100) : 0,
        sinVenta: rawData.filter(r => (r.vta||0)===0 && (r.vta3m||0)===0).length,
      });
      setNivExecuted(true);
      setNivLoading(false);
    }, 400);
  }, [rawData, nivNivel, nivZonaMode, mosObjetivoMin, mosObjetivoMax, pesoVelocidad, pesoRiesgo, pesoHistorico, mesActual, letrasExcluidas]);

  const nivChartData = useMemo(() => {
    if (!nivResult.length || !rawData.length)
      return { porZona: [], zonaInvMos: [], topCentros: [], topSkus: [], topProblem: [], scatter: [] };

    // Por zona: pzs/importe movidos
    const porZona = {};
    nivResult.forEach(r => {
      if (!porZona[r.zona]) porZona[r.zona] = { zona: r.zona, pzs: 0, importe: 0, traslados: 0 };
      porZona[r.zona].pzs += r.pzs;
      porZona[r.zona].importe += r.importe;
      porZona[r.zona].traslados += 1;
    });

    // Movimiento neto de OH por centro (salidas y entradas)
    const salidas = {}, entradas = {};
    nivResult.forEach(r => {
      salidas[r.centroSalida]    = (salidas[r.centroSalida]    || 0) + r.pzs;
      entradas[r.centroReceptor] = (entradas[r.centroReceptor] || 0) + r.pzs;
    });

    // Base por centro: OH, VTA_3M, zona (para MOS antes/después y scatter)
    const getVta3m = (r) => r.vta3m != null && r.vta3m > 0 ? r.vta3m : (r.vta || 0) * (3 / Math.max(1, mesActual));
    const centros = {};
    rawData.forEach(r => {
      if (!centros[r.centro]) centros[r.centro] = { centro: r.centro, nombre: r.nCentro || r.centro, zona: r.zona, oh: 0, vta3m: 0 };
      centros[r.centro].oh    += r.oh;
      centros[r.centro].vta3m += getVta3m(r);
    });

    // Uplift por zona: ratio vta/oh en zona (para fcst de receptoras)
    // Simplificado: si recibe, sube su venta proyectada proporcional al inventario extra sano
    const centrosArr = Object.values(centros).map(c => {
      const vtaProyMes = c.vta3m / 3;
      const ohDespues  = Math.max(0, c.oh - (salidas[c.centro]||0) + (entradas[c.centro]||0));
      const recibio    = entradas[c.centro] || 0;
      // uplift B: si recibió mercancía sana, proyecta hasta +uplift según cuánto recibió vs su venta
      const upliftFactor = recibio > 0 && vtaProyMes > 0
        ? 1 + Math.min(0.5, (recibio / (vtaProyMes * 3)) * 0.3) // máximo +50%
        : 1;
      const vtaFcst    = vtaProyMes * upliftFactor;
      const mosAntes   = vtaProyMes > 0 ? c.oh / vtaProyMes : (c.oh > 0 ? 99 : 0);
      const mosDespues = vtaFcst > 0 ? ohDespues / vtaFcst : (ohDespues > 0 ? 99 : 0);
      const modificado = (salidas[c.centro]||0) + (entradas[c.centro]||0) > 0;
      return { ...c, vtaProyMes, vtaFcst, ohDespues, mosAntes, mosDespues, modificado,
               movido: (salidas[c.centro]||0) + (entradas[c.centro]||0),
               neto: (entradas[c.centro]||0) - (salidas[c.centro]||0),
               recibio: entradas[c.centro]||0, envio: salidas[c.centro]||0 };
    });

    // Inv + MOS por zona (antes vs después)
    const zMap = {};
    centrosArr.forEach(c => {
      if (!zMap[c.zona]) zMap[c.zona] = { zona: c.zona, ohAntes: 0, ohDespues: 0, vtaProy: 0, vtaFcst: 0 };
      zMap[c.zona].ohAntes   += c.oh;
      zMap[c.zona].ohDespues += c.ohDespues;
      zMap[c.zona].vtaProy   += c.vtaProyMes;
      zMap[c.zona].vtaFcst   += c.vtaFcst;
    });
    const zonaInvMos = Object.values(zMap).map(z => ({
      ...z,
      mosAntes:   z.vtaProy > 0 ? +(z.ohAntes / z.vtaProy).toFixed(1) : 0,
      mosDespues: z.vtaFcst > 0 ? +(z.ohDespues / z.vtaFcst).toFixed(1) : 0,
    })).sort((a,b) => b.ohAntes - a.ohAntes);

    // Top centros más modificados
    const topCentros = centrosArr.filter(c => c.modificado)
      .sort((a,b) => b.movido - a.movido).slice(0, 12);

    // Top SKUs/modelos más problemáticos (mayor OH con bajo movimiento) — de nivProblematicas
    // Top tiendas problemáticas ya está en nivProblematicas

    // Scatter: cada punto = centro. antes(x=vta,y=oh) / después(x=vtaFcst,y=ohDespues)
    const scatter = centrosArr.filter(c => c.oh > 0 || c.vtaProyMes > 0).map(c => ({
      centro: c.centro, nombre: c.nombre, zona: c.zona,
      vtaAntes: c.vtaProyMes, ohAntes: c.oh,
      vtaDespues: c.vtaFcst,  ohDespues: c.ohDespues,
      modificado: c.modificado,
    }));

    return {
      porZona: Object.values(porZona).sort((a,b) => b.pzs - a.pzs),
      zonaInvMos, topCentros, scatter,
    };
  }, [nivResult, rawData, mesActual]);

  // Top problemáticos por SKU y por Modelo (agregado de nivProblematicas)
  const nivTops = useMemo(() => {
    if (!nivProblematicas.length) return { skus: [], modelos: [], tiendas: [] };
    const skuMap = {}, modMap = {};
    nivProblematicas.forEach(p => {
      const sk = p.sku || p.clave;
      // SKU: mostrar descripción (nsku) + número
      if (!skuMap[sk]) skuMap[sk] = { key: p.nsku || sk, sub: `SKU ${sk} · ${p.goa}`, oh: 0, importe: 0 };
      skuMap[sk].oh += p.oh; skuMap[sk].importe += p.importe;
      // Modelo: el modelo real
      const mk = p.modelo || p.clave;
      if (!modMap[mk]) modMap[mk] = { key: mk, sub: `${p.marca} · ${p.goa}`, oh: 0, importe: 0 };
      modMap[mk].oh += p.oh; modMap[mk].importe += p.importe;
    });
    return {
      skus: Object.values(skuMap).sort((a,b)=>b.importe-a.importe).slice(0,5),
      modelos: Object.values(modMap).sort((a,b)=>b.importe-a.importe).slice(0,5),
      tiendas: nivProblematicas.slice(0,5),
    };
  }, [nivProblematicas]);

  const exportNivelacion = () => {
    // Layout: Division | Seccion | Seccion(nom) | Marca | Grupo(GOA) | Modelo | Material(SKU) | Texto breve(NSKU) | PVP | #Centro Origen | Tienda Origen | Stock | Pzs a trasladar | #Centro Destino | Tienda Destino | Monto a Traspaso | Zona Origen | Zona Destino
    const header = ['División','Sección','Sección','Marca','Grupo de artículos','Modelo','Material','Texto breve Material','PVP','# centro tienda origen','Tienda Origen','Stock','Piezas a trasladar','# centro tienda destino','Tienda Destino','MONTO A TRASPASO','ZONA ORIGEN','ZONA DESTINO'];
    const rows = nivResult.map(r => [
      '', r.numSeccion, r.seccion, r.marca, r.goa, r.modelo || '',
      r.sku, r.nsku, r.precio,
      r.centroSalida, r.nombreSalida,
      r.ohSalidaAntes != null ? r.ohSalidaAntes : '',
      r.pzs,
      r.centroReceptor, r.nombreReceptor,
      r.importe,
      r.zonaOrigen || r.zona, r.zonaDestino || r.zona
    ]);
    downloadExcel([header, ...rows], 'Nivelacion_Inventarios.csv');
  };


  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════

  const tabStyle = (n) =>
    `px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
      activeTab === n ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`
    }`;

  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>

      {/* ── HEADER ── */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark ? 'bg-violet-500/20' : 'bg-violet-50'}`}>
                <Icons.ArrowLeftRight size={22} className={t.textAccent1} />
              </span>
              Traslados
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>
              Herramienta de transferencias inter-tienda · Excedente de temporada y abastecimiento por necesidad
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Carga CSV principal */}
            <input ref={csvInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVUpload} />
            <button onClick={() => csvInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14} /> Cargar CSV Artículos
            </button>

            {/* Carga Matrices */}
            <input ref={matrizInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleMatrizUpload} />
            <button onClick={() => matrizInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.FileText size={14} /> Cargar Matriz
            </button>

            {/* Indicadores */}
            {rawData.length > 0 && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>
                {rawData.length.toLocaleString()} filas
              </span>
            )}
            <button onClick={() => setOhEnPesos(v => !v)}
              className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${ohEnPesos ? t.badgeTeal : t.btnGhost}`}
              title="Si tu CSV trae OH y VTA en pesos, actívalo para convertir a piezas">
              OH en {ohEnPesos ? 'pesos → pzs' : 'piezas'}
            </button>
            {Object.keys(brandMatrix).length > 0 && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeTeal}`}>
                Matriz marca ✓
              </span>
            )}
            {Object.keys(climaMatrix).length > 0 && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeTeal}`}>
                Clima {Object.keys(climaMatrix).length} centros ✓
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
        <div className={`flex border-b ${t.border} px-2`}>
          <button className={tabStyle(1)} onClick={() => setActiveTab(1)}>
            🔁 Excedente de Temporada
          </button>
          <button className={tabStyle(2)} onClick={() => setActiveTab(2)}>
            📋 Solicitud / Aperturas
          </button>
          <button className={tabStyle(3)} onClick={() => setActiveTab(3)}>
            ⚖️ Nivelación
          </button>
        </div>

        {/* ══════════ TAB 1: EXCEDENTE ══════════ */}
        {activeTab === 1 && (
          <div className="p-5 space-y-5">

            {/* ── Panel de configuración unificado ── */}
            <div className={`rounded-xl border ${t.cardInner} overflow-hidden`}>
              {/* Header colapsable */}
              <button onClick={() => setShowPanelGoas(v => !v)}
                className={`w-full flex items-center justify-between px-5 py-3 transition-colors ${isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icons.Sliders size={14} className={t.textAccent2} />
                  <span className={`text-xs font-black uppercase tracking-widest ${t.textMain}`}>Configuración</span>
                  {Object.keys(goasTemporada).filter(g => goasTemporada[g]).map(g => (
                    <span key={g} className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>
                      {g} {goasTemporada[g] === 'CALOR' ? '☀️' : goasTemporada[g] === 'PLAYA' ? '🏖️' : goasTemporada[g] === 'EXTREMOSO' ? '🌡️' : '🌤️'}
                    </span>
                  ))}
                  {letrasExcluidas.size > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-500/20 border border-red-500/40 text-red-400">
                      {letrasExcluidas.size} letras excluidas
                    </span>
                  )}
                </div>
                <Icons.ChevronDown size={14} className={`${t.textMuted} transition-transform ${showPanelGoas ? 'rotate-180' : ''}`} />
              </button>

              {showPanelGoas && (
                <div className={`px-5 pb-5 space-y-5 border-t ${t.border}`}>

                  {/* GOAs de Temporada */}
                  <div className="pt-4">
                    <h3 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>GOAs de Temporada</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                      {opcionesGoa.filter(g => g !== 'ALL').map(goa => (
                        <div key={goa} className={`flex items-center gap-2 p-2 rounded-lg border ${isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-white'}`}>
                          <span className={`flex-1 text-xs font-bold truncate ${t.textMain}`}>{goa}</span>
                          <select
                            value={goasTemporada[goa] || ''}
                            onChange={e => setGoasTemporada(prev => ({ ...prev, [goa]: e.target.value || undefined }))}
                            className={`text-[10px] px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1 w-32`}>
                            <option value="">— No aplica —</option>
                            <option value="CALOR">☀️ Calor</option>
                            <option value="PLAYA">🏖️ Playa</option>
                            <option value="TEMPLADO">🌤️ Templado</option>
                            <option value="EXTREMOSO">🌡️ Extremoso</option>
                          </select>
                        </div>
                      ))}
                    </div>
                    {opcionesGoa.filter(g => g !== 'ALL').length === 0 && (
                      <p className={`text-xs ${t.textMuted}`}>Carga el CSV primero para ver los GOAs disponibles.</p>
                    )}
                  </div>

                  {/* Filtros */}
                  <div>
                    <h3 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>Filtros</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { label: 'GOA',         val: filterGoa,        set: setFilterGoa,        opts: opcionesGoa },
                        { label: 'SKU',         val: filterSku,        set: setFilterSku,        opts: opcionesSku },
                        { label: 'Marca',       val: filterMarca,      set: setFilterMarca,      opts: opcionesMarca },
                        { label: 'Sección',     val: filterSeccion,    set: setFilterSeccion,    opts: opcionesSeccion },
                        { label: 'Tipo Centro', val: filterTipoCentro, set: setFilterTipoCentro, opts: opcionesTipoCentro },
                        { label: 'Zona',        val: filterZona,       set: setFilterZona,       opts: opcionesZona },
                      ].map(({ label, val, set, opts }) => (
                        <div key={label}>
                          <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>{label}</label>
                          <select value={val} onChange={e => set(e.target.value)}
                            className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                            {opts.map(o => <option key={o} value={o}>{o === 'ALL' ? 'Todos' : o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Letras de descuento a excluir */}
                  {opcionesLetras.length > 0 && (
                    <div>
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-2`}>
                        Excluir del traslado — letras con descuento
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {opcionesLetras.map(letra => {
                          const sel = letrasExcluidas.has(letra);
                          return (
                            <button key={letra} onClick={() => setLetrasExcluidas(prev => {
                              const next = new Set(prev);
                              sel ? next.delete(letra) : next.add(letra);
                              return next;
                            })}
                              className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${sel ? 'bg-red-500/20 border-red-500 text-red-400' : isDark ? 'bg-zinc-800 border-zinc-600 text-gray-400' : 'bg-gray-100 border-gray-300 text-gray-500'}`}>
                              {sel ? '✕ ' : ''}{letra}
                            </button>
                          );
                        })}
                      </div>
                      {letrasExcluidas.size > 0 && (
                        <p className="text-[9px] mt-1 text-red-400">{letrasExcluidas.size} letra(s) excluida(s)</p>
                      )}
                    </div>
                  )}

                  {/* Mínimos y costo */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} whitespace-nowrap`}>Mín. pzs</label>
                      <input type="number" min={0} value={minPzsTraslado}
                        onChange={e => setMinPzsTraslado(Number(e.target.value))}
                        className={`w-20 text-xs px-2 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} whitespace-nowrap`}>Mín. $ traslado</label>
                      <input type="number" min={0} value={minPesosTraslado}
                        onChange={e => setMinPesosTraslado(Number(e.target.value))}
                        className={`w-24 text-xs px-2 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} whitespace-nowrap`}>Costo/pza ($)</label>
                      <input type="number" min={1} value={costoPorPza}
                        onChange={e => setCostoPorPza(Number(e.target.value))}
                        className={`w-20 text-xs px-2 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                    </div>
                  </div>

                  {/* Zonas adyacentes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>Zonas adyacentes</label>
                      <button onClick={() => setShowPanelZonas(v => !v)}
                        className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all ${t.btnGhost}`}>
                        {showPanelZonas ? 'Ocultar' : 'Configurar'}
                      </button>
                    </div>
                    {showPanelZonas && (
                      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                        {[...opcionesZona].filter(z => z !== 'ALL').sort().map(zona => (
                          <div key={zona} className="flex items-center gap-3 flex-wrap">
                            <span className={`text-[10px] font-black w-28 truncate ${t.textMain}`}>{zona}</span>
                            <span className={`text-[9px] ${t.textMuted}`}>→</span>
                            <div className="flex flex-wrap gap-1.5">
                              {[...opcionesZona].filter(z => z !== 'ALL' && z !== zona).sort().map(z2 => {
                                const sel = zonasAdyacentes[zona]?.has(z2);
                                return (
                                  <button key={z2} onClick={() => setZonasAdyacentes(prev => {
                                    const next = { ...prev };
                                    if (!next[zona]) next[zona] = new Set();
                                    else next[zona] = new Set(next[zona]);
                                    sel ? next[zona].delete(z2) : next[zona].add(z2);
                                    return next;
                                  })}
                                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${sel ? 'bg-violet-500/20 border-violet-500 text-violet-400' : isDark ? 'bg-zinc-800 border-zinc-600 text-gray-500' : 'bg-gray-100 border-gray-300 text-gray-400'}`}>
                                    {z2}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Botones ejecutar */}
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={calcularExcedentes} disabled={!rawData.length || excLoading}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-40 ${t.btnPrimary}`}>
                      {excLoading
                        ? <><Icons.Loader size={15} className="animate-spin" /> Calculando…</>
                        : <><Icons.Zap size={15} /> Ejecutar herramienta</>}
                    </button>
                    {excResult.length > 0 && (
                      <button onClick={exportExcedente}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${t.btnSecondary}`}>
                        <Icons.Download size={15} /> Exportar Excel
                      </button>
                    )}
                  </div>

                </div>
              )}
            </div>
            {/* end panel config */}

            {/* Resultados excedente */}
            {excResult.length > 0 ? (
              <>
                {/* Stats rápidos */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Traslados',   val: excResult.length,                                    icon: <Icons.ArrowLeftRight size={16} />, color: t.textAccent1 },
                    { label: 'Piezas',      val: fmt(excResult.reduce((s, r) => s + r.pzs, 0)),       icon: <Icons.Package size={16} />,        color: t.textAccent2 },
                    { label: 'Importe',     val: fmtMXN(excResult.reduce((s, r) => s + r.pesos, 0)), icon: <Icons.DollarSign size={16} />,     color: 'text-emerald-400' },
                    { label: 'GOAs afect.', val: new Set(excResult.map(r => r.goa)).size,             icon: <Icons.Tag size={16} />,            color: 'text-amber-400' },
                  ].map(({ label, val, icon, color }) => (
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner} text-center`}>
                      <div className={`flex items-center justify-center gap-2 text-[10px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>
                        <span className={color}>{icon}</span> {label}
                      </div>
                      <div className={`text-lg font-black ${t.textMain}`}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Gráfica antes/después */}
                <div className={`p-5 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>
                    <Icons.BarChart2 size={15} className={`inline mr-2 ${t.textAccent1}`} />
                    Inventario por Centro — Antes vs Después del Traslado
                  </h4>
                  <BarCompare data={chartDataExc} theme={theme} />
                </div>

                {/* Resumen por zonas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>🗺️ Flujo entre Zonas</h4>
                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                      {zonaResumen.map((z, i) => {
                        const maxPzs = zonaResumen[0]?.pzs || 1;
                        const pct = Math.max(4, (z.pzs / maxPzs) * 100);
                        return (
                          <div key={i} className={`rounded-lg p-3 ${z.mismaZona ? (isDark ? 'bg-violet-900/20' : 'bg-violet-50') : (isDark ? 'bg-yellow-900/15' : 'bg-yellow-50')}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black ${z.mismaZona ? 'bg-violet-500/30 text-violet-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                  {z.mismaZona ? 'MISMA' : '⚠️'}
                                </span>
                                <span className={`text-[10px] font-bold truncate ${t.textMain}`}>{z.origen}</span>
                                <span className={`shrink-0 text-[10px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>→</span>
                                <span className={`text-[10px] font-bold truncate ${t.textMain}`}>{z.destino}</span>
                              </div>
                              <div className="shrink-0 text-right ml-2">
                                <span className={`text-[10px] font-black ${z.mismaZona ? 'text-violet-400' : 'text-yellow-400'}`}>{fmt(z.pzs)} pzs</span>
                                <span className={`text-[9px] ${t.textMuted} ml-1`}>{fmtMXN(z.pesos)}</span>
                              </div>
                            </div>
                            <div className={`h-1.5 w-full rounded-full ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}>
                              <div className={`h-full rounded-full ${z.mismaZona ? 'bg-violet-500' : 'bg-yellow-400'}`}
                                style={{width: `${pct}%`, transition: 'width 0.4s ease'}} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 text-[9px]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500 inline-block"/> Misma zona</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-400 inline-block"/> Cruza zona</span>
                    </div>
                  </div>

                  {/* Scatter VTA vs OH: Antes y Después */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-1 ${t.textMain}`}>📊 VTA vs OH — Antes / Después + Forecast</h4>
                    <p className={`text-[9px] mb-2 ${t.textMuted}`}>Eje X = OH · Eje Y = VTA. 🟡 Antes · 🟣 Después (con fcst de uplift por zona)</p>
                    <svg viewBox="0 0 280 170" className="w-full">
                      {[0,1,2,3].map(i => (
                        <g key={i}>
                          <line x1={30} y1={10+i*38} x2={275} y2={10+i*38} stroke={isDark?'#3f3f46':'#e5e7eb'} strokeWidth="0.5"/>
                          <line x1={30+i*61} y1={10} x2={30+i*61} y2={124} stroke={isDark?'#3f3f46':'#e5e7eb'} strokeWidth="0.5"/>
                        </g>
                      ))}
                      {(() => {
                        const maxOH  = Math.max(...scatterData.map(d => Math.max(d.ohAntes, d.ohDespues)), 1);
                        const maxVTA = Math.max(...scatterData.map(d => Math.max(d.vtaAntes, d.vtaFcst)), 1);
                        const toX = v => 30 + (v/maxOH)  * 242;
                        const toY = v => 124 - (v/maxVTA) * 112;
                        return scatterData.slice(0,100).map((d, i) => (
                          <g key={i}>
                            {/* Línea connecting antes→después */}
                            {d.cambia && (
                              <line
                                x1={toX(d.ohAntes)}  y1={toY(d.vtaAntes)}
                                x2={toX(d.ohDespues)} y2={toY(d.vtaFcst)}
                                stroke="#a78bfa" strokeWidth="0.6" opacity="0.3"/>
                            )}
                            {/* Punto antes (amarillo) */}
                            <circle cx={toX(d.ohAntes)} cy={toY(d.vtaAntes)}
                              r={d.cambia ? 3 : 2} fill="#facc15"
                              opacity={d.cambia ? 0.9 : 0.35}>
                              <title>{d.nombre} — Antes: OH {d.ohAntes} / VTA {d.vtaAntes}</title>
                            </circle>
                            {/* Punto después (morado) solo si cambia */}
                            {d.cambia && (
                              <circle cx={toX(d.ohDespues)} cy={toY(d.vtaFcst)}
                                r={3.5} fill="#a78bfa" opacity="0.9"
                                stroke="#7c3aed" strokeWidth="0.5">
                                <title>{d.nombre} — Después: OH {d.ohDespues} / VTA fcst {Math.round(d.vtaFcst)}</title>
                              </circle>
                            )}
                          </g>
                        ));
                      })()}
                      <text x={152} y={158} textAnchor="middle" fontSize="7" fill={isDark?'#71717a':'#9ca3af'}>OH</text>
                      <text x={12} y={67} textAnchor="middle" fontSize="7" fill={isDark?'#71717a':'#9ca3af'} transform="rotate(-90,12,67)">VTA</text>
                    </svg>
                    <div className="flex gap-4 text-[9px] mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"/> Antes</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block"/> Después + fcst</span>
                      <span className={`${t.textMuted}`}>Líneas = centros que cambian</span>
                    </div>
                  </div>
                </div>

                {/* Tabla de traslados */}
                <div className={`rounded-xl border overflow-hidden ${t.cardInner}`}>
                  <div className={`flex items-center justify-between px-4 py-2 border-b ${t.border}`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>
                      {excResult.length} traslados · {excResult.filter(r=>r.fueraZona).length} fuera de zona ⚠️
                    </span>
                    <button onClick={exportExcedente}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${t.btnSecondary}`}>
                      <Icons.Download size={12} /> Exportar Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-[55vh] custom-scrollbar">
                    <table className="w-full text-left min-w-max">
                      <thead>
                        <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                          {['Sección', 'Núm.', 'SKU', 'Marca', 'GOA', 'Centro Salida', 'Centro Receptor', 'Tipo Rec.', 'Pzs', 'Importe', 'Costo Traslado', 'Razón'].map(h => (
                            <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                        {excResult.map((r, i) => (
                          <tr key={i} className={`text-xs hover:${isDark ? 'bg-zinc-800/30' : 'bg-orange-50/30'} transition-colors`}>
                            <td className={`p-2 font-bold ${t.textMuted}`}>{r.seccion}</td>
                            <td className={`p-2 font-mono text-[10px] ${t.textMuted}`}>{r.numSeccion}</td>
                            <td className={`p-2 font-mono font-black ${t.textMain}`}>{r.sku}</td>
                            <td className={`p-2 ${t.textMuted}`}>{r.marca}</td>
                            <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.goa}</span></td>
                            <td className={`p-2 font-bold ${t.textMain}`}>{r.nombreSalida} <span className={`font-mono text-[9px] ${t.textMuted}`}>({r.centroSalida})</span></td>
                            <td className={`p-2 font-bold ${r.fueraZona ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {r.fueraZona && <span title="Receptor fuera de zona">⚠️ </span>}
                              {r.nombreReceptor} <span className={`font-mono text-[9px] ${t.textMuted}`}>({r.centroReceptor})</span>
                            </td>
                            <td className={`p-2 text-[10px] ${t.textMuted}`}>{r.tipoCentroReceptor}</td>
                            <td className={`p-2 font-black ${t.textAccent1}`}>{fmt(r.pzs)}</td>
                            <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.pesos)}</td>
                            <td className={`p-2 font-mono text-[10px] ${r.fueraZona ? 'text-amber-400' : t.textMuted}`}>{fmtMXN(r.costoTraslado)}</td>
                            <td className={`p-2 text-[9px] max-w-[160px] truncate ${t.textMuted}`} title={r.razon}>{r.razon}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Panel: Mejor descuentas ── */}
                {sinReceptorData.length > 0 && (
                  <div className={`p-4 rounded-xl border border-red-500/30 ${isDark ? 'bg-red-950/20' : 'bg-red-50'}`}>
                    <h4 className="text-sm font-black text-red-400 mb-1 flex items-center gap-2">
                      <Icons.AlertCircle size={15} /> Mejor descuentas estos SKUs — no encontramos receptor rentable
                    </h4>
                    <p className={`text-[10px] mb-3 ${t.textMuted}`}>
                      No hay tienda compatible en clima con capacidad. Costo de trasladar &gt; beneficio estimado.
                    </p>
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-xs min-w-max">
                        <thead>
                          <tr className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} border-b ${t.border}`}>
                            {['SKU', 'GOA', 'Marca', 'Sección', 'Centro', 'Pzs', 'Precio', 'Costo Traslado', 'Recomendación'].map(h =>
                              <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                          {sinReceptorData.map((r, i) => (
                            <tr key={i} className="text-xs">
                              <td className={`p-2 font-mono ${t.textMain}`}>{r.sku}</td>
                              <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.goa}</span></td>
                              <td className={`p-2 ${t.textMuted}`}>{r.marca}</td>
                              <td className={`p-2 ${t.textMuted}`}>{r.seccion}</td>
                              <td className={`p-2 font-bold ${t.textMain}`}>{r.nombreOrigen} <span className={`text-[9px] ${t.textMuted}`}>({r.centroOrigen})</span></td>
                              <td className={`p-2 font-black text-amber-400`}>{fmt(r.pzs)}</td>
                              <td className={`p-2 font-mono ${t.textMuted}`}>{fmtMXN(r.precio)}</td>
                              <td className="p-2 font-black text-red-400">{fmtMXN(r.costoTraslado)}</td>
                              <td className="p-2 text-red-400 text-[10px] font-bold">
                                💸 Descuenta — traslado costaría {fmtMXN(r.costoTraslado)} para {fmt(r.pzs)} pzs
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : rawData.length > 0 ? (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Zap size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Herramienta lista para analizar</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Aplica los filtros que necesites y presiona "Ejecutar herramienta"</p>
              </div>
            ) : (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Upload size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Sin datos</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Carga el CSV de artículos para comenzar. Columnas requeridas: GOA, SKU, CENTRO, OH, ZONA, TIPO_CENTRO.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ TAB 2: NECESIDAD ══════════ */}
        {activeTab === 2 && (
          <div className="p-5 space-y-5">

            {/* Modal tallas faltantes */}
            {modalTallas && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${t.card}`}>
                  <h3 className={`text-sm font-black mb-1 ${t.textMain}`}>Talla no detectada</h3>
                  <p className={`text-xs mb-4 ${t.textMuted}`}>
                    El SKU <span className="font-mono font-bold">{modalTallas.skus[modalTallas.index]?.sku}</span> no tiene talla parseable en su nombre:<br />
                    <span className={`font-mono text-[11px] ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                      "{modalTallas.skus[modalTallas.index]?.nsku}"
                    </span>
                  </p>
                  <p className={`text-[10px] mb-2 font-black uppercase tracking-widest ${t.textMuted}`}>
                    Asigna la talla manualmente ({modalTallas.index + 1} de {modalTallas.skus.length})
                  </p>
                  <input
                    autoFocus
                    value={modalInputVal}
                    onChange={e => setModalInputVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmarTallaModal()}
                    placeholder="Ej: 17"
                    className={`w-full text-sm px-3 py-2 rounded-lg border mb-4 ${t.input} focus:outline-none focus:ring-1`}
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setModalTallas(null); setModalInputVal(''); }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold ${t.btnGhost}`}>
                      Cancelar
                    </button>
                    <button onClick={confirmarTallaModal} disabled={!modalInputVal.trim()}
                      className={`px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40 ${t.btnPrimary}`}>
                      Confirmar y continuar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Chequera */}
              <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                <h3 className={`text-xs font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>
                  Chequera de Solicitud
                </h3>
                <p className={`text-[10px] mb-3 ${t.textMuted}`}>
                  SKU / Modelo / GOA / Marca | Ppto ($) | Centro receptor — los 3 son obligatorios
                </p>
                <textarea
                  value={chequeraText}
                  onChange={e => setChequeraText(e.target.value)}
                  rows={10}
                  placeholder={"WILSON-22 | 22450 | SATELITE\nTENIS NIñA | 50000 | M A QUEVEDO\nBUBBLE GUMMERS | 30000 | BUENAVISTA"}
                  className={`w-full text-xs font-mono px-3 py-2 rounded-lg border resize-y ${t.input} focus:outline-none focus:ring-1`}
                />
                {Object.keys(tallasCache).length > 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-[10px] ${t.textMuted}`}>
                      {Object.keys(tallasCache).length} tallas asignadas manualmente
                    </span>
                    <button onClick={() => setTallasCache({})}
                      className={`text-[10px] px-2 py-0.5 rounded border font-bold ${t.btnGhost}`}>
                      Limpiar cache
                    </button>
                  </div>
                )}
              </div>

              {/* Config */}
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>Parámetros de la Herramienta</h3>
                  <div>
                    <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>
                      Centros surtidores (dejar vacío = todos los del CSV)
                    </label>
                    <input
                      value={centrosSurtidores}
                      onChange={e => setCentrosSurtidores(e.target.value)}
                      placeholder="M A QUEVEDO, SATELITE, BUENAVISTA"
                      className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}
                    />
                    <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                      La herramienta detecta la corrida automáticamente del nombre del SKU.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>
                        Corridas mínimas — tiendas top
                      </label>
                      <input
                        type="number" min={1} max={10}
                        value={minCorridasAlto}
                        onChange={e => setMinCorridasAlto(Number(e.target.value))}
                        className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}
                      />
                      <p className={`text-[9px] mt-0.5 ${t.textMuted}`}>Top 30% vta · default 2</p>
                    </div>
                    <div>
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>
                        Corridas mínimas — resto
                      </label>
                      <input
                        type="number" min={1} max={10}
                        value={minCorridasResto}
                        onChange={e => setMinCorridasResto(Number(e.target.value))}
                        className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}
                      />
                      <p className={`text-[9px] mt-0.5 ${t.textMuted}`}>Resto · default 1</p>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>Resumen de Necesidad</h3>
                  {necesResult.length > 0 ? (
                    <DonutSummary items={chartDataNec} theme={theme} />
                  ) : (
                    <p className={`text-xs ${t.textMuted}`}>Sin resultados aún. Llena la chequera y ejecuta la herramienta.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-3 flex-wrap">
              <button onClick={calcularNecesidad}
                disabled={!chequeraText.trim() || !rawData.length || necesLoading}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-40 ${t.btnPrimary}`}>
                {necesLoading
                  ? <><Icons.Loader size={15} className="animate-spin" /> Calculando…</>
                  : <><Icons.Zap size={15} /> Ejecutar herramienta</>}
              </button>
              {necesResult.length > 0 && (
                <button onClick={exportNecesidad}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${t.btnSecondary}`}>
                  <Icons.Download size={15} /> Exportar Excel
                </button>
              )}
            </div>

            {/* Panel de avisos */}
            {necesAvisos.length > 0 && (
              <div className={`p-4 rounded-xl border border-amber-500/30 ${isDark ? 'bg-amber-950/20' : 'bg-amber-50'}`}>
                <h4 className="text-sm font-black text-amber-500 mb-2 flex items-center gap-2">
                  <Icons.AlertCircle size={15} /> Avisos ({necesAvisos.length})
                </h4>
                <ul className="space-y-1.5">
                  {necesAvisos.map((a, i) => (
                    <li key={i} className={`text-[11px] ${t.textMuted} flex gap-2`}>
                      <span className="text-amber-500 shrink-0">•</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Gráficas de necesidad */}
            {necesResult.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Piezas por centro surtidor */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>🏪 Piezas por Centro Surtidor</h4>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                    {(() => {
                      const porCentro = {};
                      necesResult.forEach(r => {
                        if (!porCentro[r.centroSalida]) porCentro[r.centroSalida] = { nombre: r.nombreSalida || r.centroSalida, pzs: 0, importe: 0 };
                        porCentro[r.centroSalida].pzs += r.pzs;
                        porCentro[r.centroSalida].importe += r.importe;
                      });
                      const arr = Object.entries(porCentro).map(([id,d]) => ({id, ...d})).sort((a,b) => b.pzs - a.pzs);
                      const maxP = arr[0]?.pzs || 1;
                      return arr.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className={`w-32 truncate text-[10px] font-bold text-right ${t.textMain}`} title={c.nombre}>
                            {c.nombre} <span className={`font-mono ${t.textMuted}`}>({c.id})</span>
                          </span>
                          <div className="flex-1 relative h-5 rounded-lg overflow-hidden bg-zinc-700/20">
                            <div className="absolute left-0 h-full rounded-lg bg-gradient-to-r from-yellow-400 to-violet-500 flex items-center pl-2"
                              style={{width: `${Math.max(6,(c.pzs/maxP)*100)}%`}}>
                              <span className="text-[9px] font-black text-black">{fmt(c.pzs)} pzs</span>
                            </div>
                          </div>
                          <span className="w-20 text-right text-[9px] font-mono text-emerald-400">{fmtMXN(c.importe)}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Corrida por talla */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>📏 Distribución por Talla</h4>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                    {(() => {
                      const porTalla = {};
                      necesResult.forEach(r => {
                        const t2 = r.talla || '?';
                        porTalla[t2] = (porTalla[t2] || 0) + r.pzs;
                      });
                      const arr = Object.entries(porTalla).sort((a,b) => parseFloat(a[0]) - parseFloat(b[0]));
                      const maxT = Math.max(...arr.map(x => x[1]), 1);
                      return arr.map(([talla, pzs], i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className={`w-10 text-[10px] font-black text-right ${t.textAccent1}`}>{talla}</span>
                          <div className="flex-1 relative h-5 rounded-lg overflow-hidden bg-zinc-700/20">
                            <div className="absolute left-0 h-full rounded-lg bg-violet-500 flex items-center pl-2"
                              style={{width: `${Math.max(4,(pzs/maxT)*100)}%`}}>
                              <span className="text-[9px] font-black text-white">{fmt(pzs)}</span>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Tabla necesidad */}
            {necesResult.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'L\u00edneas SKU', val: necesResult.length },
                    { label: 'Corridas',    val: fmt(Math.max(...necesResult.map(r => r.corridasEnv || 0))) },
                    { label: 'Piezas',      val: fmt(necesResult.reduce((s, r) => s + r.pzs, 0)) },
                    { label: 'Importe',     val: fmtMXN(necesResult.reduce((s, r) => s + r.importe, 0)) },
                  ].map(({ label, val }) => (
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner} text-center`}>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                      <div className={`text-lg font-black ${t.textMain}`}>{val}</div>
                    </div>
                  ))}
                </div>

                <div className={`rounded-xl border overflow-hidden ${t.cardInner}`}>
                  <div className="overflow-x-auto max-h-[55vh] custom-scrollbar">
                    <table className="w-full text-left min-w-max">
                      <thead>
                        <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                          {['Secci\u00f3n', 'N\u00fam.', 'Marca', 'GOA', 'SKU', 'N SKU', 'Talla', 'Centro Salida', 'Centro Receptor', 'OH Disp', 'Pzs', 'OH Queda', 'Importe'].map(h => (
                            <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                        {necesResult.map((r, i) => (
                          <tr key={i} className={`text-xs transition-colors ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-teal-50/30'}`}>
                            <td className={`p-2 ${t.textMuted}`}>{r.seccion}</td>
                            <td className={`p-2 font-mono text-[10px] ${t.textMuted}`}>{r.numSeccion}</td>
                            <td className={`p-2 ${t.textMuted}`}>{r.marca}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.goa}</span>
                            </td>
                            <td className={`p-2 font-mono text-[10px] ${t.textMain}`}>{r.sku}</td>
                            <td className={`p-2 text-[10px] max-w-[160px] truncate ${t.textMuted}`} title={r.nsku}>{r.nsku}</td>
                            <td className={`p-2 font-black text-center ${t.textAccent1}`}>{r.talla}</td>
                            <td className={`p-2 font-bold ${t.textMain}`}>{r.centroSalida}</td>
                            <td className={`p-2 font-bold text-emerald-400`}>{r.centroReceptor}</td>
                            <td className={`p-2 font-mono text-amber-400`}>{fmt(r.ohDisp)}</td>
                            <td className={`p-2 font-black ${t.textAccent2}`}>{fmt(r.pzs)}</td>
                            <td className={`p-2 font-mono ${r.ohQueda <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(r.ohQueda)}</td>
                            <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!necesResult.length && rawData.length > 0 && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Package size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Herramienta de solicitud lista</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Llena la chequera. La herramienta detecta la corrida automáticamente por las tallas del nombre del SKU.</p>
              </div>
            )}

            {!rawData.length && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Upload size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Sin inventario base</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Carga el CSV de artículos desde el botón del encabezado para que la herramienta pueda calcular disponibilidad.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ TAB 3: NIVELACIÓN ══════════ */}
        {activeTab === 3 && (
          <div className="p-5 space-y-5">

            {/* Config colapsable */}
            <div className={`rounded-xl border ${t.cardInner} overflow-hidden`}>
              <button onClick={() => setShowPanelNiv(v => !v)}
                className={`w-full flex items-center justify-between px-5 py-3 transition-colors ${isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icons.Sliders size={14} className={t.textAccent2} />
                  <span className={`text-xs font-black uppercase tracking-widest ${t.textMain}`}>Configuración</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{nivNivel.toUpperCase()}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badgeTeal}`}>MOS {mosObjetivoMin}-{mosObjetivoMax}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>
                    {nivZonaMode === 'misma' ? 'Misma zona' : nivZonaMode === 'metro' ? 'Metro entre sí' : 'Entre todas'}
                  </span>
                </div>
                <Icons.ChevronDown size={14} className={`${t.textMuted} transition-transform ${showPanelNiv ? 'rotate-180' : ''}`} />
              </button>
              {showPanelNiv && (
              <div className={`p-4 space-y-4 border-t ${t.border}`}>
              {/* Switch nivel */}
              <div>
                <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-2`}>Nivel de agrupación</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { id: 'goa', label: 'GOA' },
                    { id: 'marca', label: 'Marca' },
                    { id: 'modelo', label: 'Modelo' },
                    { id: 'sku', label: 'SKU' },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setNivNivel(opt.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${nivNivel === opt.id ? t.btnPrimary : `${t.btnGhost} border border-transparent`}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                  {nivNivel === 'sku' ? 'Máxima precisión — respeta tallas si el SKU las tiene.' : `Agrupa por ${nivNivel} — mueve el bloque completo.`}
                </p>
              </div>

              {/* Modo de zona */}
              <div>
                <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-2`}>Alcance de traslados</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { id: 'misma', label: 'Solo misma zona', desc: 'Nivela dentro de cada zona' },
                    { id: 'metro', label: 'Metro entre sí', desc: 'Zonas METRO se nivelan entre ellas; resto solo su zona' },
                    { id: 'todas', label: 'Entre todas', desc: 'Sin restricción de zona' },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setNivZonaMode(opt.id)}
                      title={opt.desc}
                      className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${nivZonaMode === opt.id ? t.btnPrimary : `${t.btnGhost} border border-transparent`}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                  {nivZonaMode === 'misma' ? 'Cada tienda solo recibe de tiendas de su misma zona.' :
                   nivZonaMode === 'metro' ? 'Las zonas que empiezan con METRO se tratan como una sola bolsa.' :
                   'Cualquier tienda puede recibir de cualquier otra, sin importar zona.'}
                </p>
              </div>

              {/* Filtro de niveles de rebaja (mismo que excedente) */}
              {opcionesLetras.length > 0 && (
                <div>
                  <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-2`}>
                    Niveles de rebaja — excluir del traslado (van directo a liquidación)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {opcionesLetras.map(letra => {
                      const sel = letrasExcluidas.has(letra);
                      return (
                        <button key={letra} onClick={() => setLetrasExcluidas(prev => {
                          const next = new Set(prev);
                          sel ? next.delete(letra) : next.add(letra);
                          return next;
                        })}
                          className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${sel ? 'bg-orange-500/20 border-orange-500 text-orange-400' : isDark ? 'bg-zinc-800 border-zinc-600 text-gray-400' : 'bg-gray-100 border-gray-300 text-gray-500'}`}>
                          {sel ? '✕ ' : ''}{letra}
                        </button>
                      );
                    })}
                  </div>
                  <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                    Lo que marques ya está rebajado y no se puede rebajar más — mejor no trasladarlo. Se lista aparte como liquidación final.
                  </p>
                </div>
              )}

              {/* MOS objetivo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>MOS objetivo mín</label>
                  <input type="number" min={0} step={0.5} value={mosObjetivoMin}
                    onChange={e => setMosObjetivoMin(Number(e.target.value))}
                    className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                </div>
                <div>
                  <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>MOS objetivo máx</label>
                  <input type="number" min={0} step={0.5} value={mosObjetivoMax}
                    onChange={e => setMosObjetivoMax(Number(e.target.value))}
                    className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                </div>
                <div className="col-span-2">
                  <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>Mes actual (para MOS/fcst)</label>
                  <input type="number" min={1} max={12} value={mesActual}
                    onChange={e => setMesActual(Number(e.target.value))}
                    className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`} />
                </div>
              </div>

              {/* Pesos del score */}
              <div>
                <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-2`}>
                  Pesos del potencial de venta (velocidad {pesoVelocidad}% · riesgo quiebre {pesoRiesgo}% · histórico {pesoHistorico}%)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Velocidad', val: pesoVelocidad, set: setPesoVelocidad, color: 'accent-yellow-400' },
                    { label: 'Riesgo quiebre', val: pesoRiesgo, set: setPesoRiesgo, color: 'accent-violet-500' },
                    { label: 'Histórico', val: pesoHistorico, set: setPesoHistorico, color: 'accent-emerald-400' },
                  ].map(({ label, val, set, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-[9px] mb-1">
                        <span className={t.textMuted}>{label}</span>
                        <span className={`font-black ${t.textMain}`}>{val}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={val}
                        onChange={e => set(Number(e.target.value))}
                        className={`w-full ${color}`} />
                    </div>
                  ))}
                </div>
              </div>
              </div>
              )}
            </div>

            {/* Botones (siempre visibles) */}
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => { calcularNivelacion(); setShowPanelNiv(false); }} disabled={!rawData.length || nivLoading}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-40 ${t.btnPrimary}`}>
                {nivLoading
                  ? <><Icons.Loader size={15} className="animate-spin" /> Nivelando…</>
                  : <><Icons.Zap size={15} /> Ejecutar nivelación</>}
              </button>
              {nivResult.length > 0 && (
                <button onClick={exportNivelacion}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${t.btnSecondary}`}>
                  <Icons.Download size={15} /> Exportar Excel
                </button>
              )}
            </div>

            {/* Cobertura de VTA_3M */}
            {nivCobertura && (
              <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                <div className="flex items-start gap-3">
                  <Icons.AlertCircle size={16} className={nivCobertura.pct3m < 30 ? 'text-amber-400 mt-0.5' : 'text-emerald-400 mt-0.5'} />
                  <div className="flex-1">
                    <p className={`text-xs font-bold ${t.textMain}`}>
                      Cobertura de venta reciente (VTA 3M): <span className={nivCobertura.pct3m < 30 ? 'text-amber-400' : 'text-emerald-400'}>{nivCobertura.pct3m.toFixed(1)}%</span> de las filas
                    </p>
                    <p className={`text-[11px] mt-1 ${t.textMuted}`}>
                      {fmt(nivCobertura.con3m)} de {fmt(nivCobertura.total)} filas tienen VTA_3M &gt; 0 · {nivCobertura.pctVta.toFixed(1)}% tienen VTA acumulada · {fmt(nivCobertura.sinVenta)} filas sin ninguna venta.
                      {nivCobertura.pct3m < 30 && ' Cobertura baja: la mayoría del inventario casi no rota, por eso el R² mejora poco y muchos SKUs van a liquidación en vez de traslado.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Resultados */}
            {nivResult.length > 0 ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Traslados', val: nivResult.length, color: t.textAccent1 },
                    { label: 'Piezas niveladas', val: fmt(nivResult.reduce((s,r)=>s+r.pzs,0)), color: t.textAccent2 },
                    { label: 'Importe movido', val: fmtMXN(nivResult.reduce((s,r)=>s+r.importe,0)), color: 'text-emerald-400' },
                    { label: 'Zonas activas', val: new Set(nivResult.map(r=>r.zona)).size, color: 'text-violet-400' },
                  ].map(({label,val,color}) => (
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner} text-center`}>
                      <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                      <div className={`text-lg font-black ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Fila: Nivelación por zona + Inventario/MOS por zona */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>⚖️ Nivelación por Zona de Venta</h4>
                  <div className="space-y-2">
                    {nivChartData.porZona.map((z, i) => {
                      const maxPzs = nivChartData.porZona[0]?.pzs || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className={`w-32 truncate text-[10px] font-bold text-right ${t.textMain}`}>{z.zona}</span>
                          <div className="flex-1 relative h-6 rounded-lg overflow-hidden bg-zinc-700/20">
                            <div className="absolute left-0 top-0 h-full rounded-lg bg-gradient-to-r from-yellow-400 to-violet-500 flex items-center pl-2"
                              style={{width: `${Math.max(6,(z.pzs/maxPzs)*100)}%`}}>
                              <span className="text-[9px] font-black text-black">{fmt(z.pzs)} pzs · {z.traslados} mov</span>
                            </div>
                          </div>
                          <span className={`w-24 text-right text-[10px] font-black text-emerald-400`}>{fmtMXN(z.importe)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Venta proyectada por zona */}
                  <div className={`mt-4 pt-4 border-t ${t.border}`}>
                    <h5 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>Venta proyectada / mes por zona</h5>
                    <div className="space-y-1.5">
                      {nivChartData.zonaInvMos.map((z, i) => {
                        const maxV = Math.max(...nivChartData.zonaInvMos.map(x => Math.max(x.vtaProy, x.vtaFcst)), 1);
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className={`w-28 truncate text-[9px] font-bold text-right ${t.textMain}`}>{z.zona}</span>
                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="h-2 rounded bg-zinc-700/20 overflow-hidden">
                                <div className="h-full rounded bg-yellow-400/80" style={{width: `${(z.vtaProy/maxV)*100}%`}} />
                              </div>
                              <div className="h-2 rounded bg-zinc-700/20 overflow-hidden">
                                <div className="h-full rounded bg-violet-500" style={{width: `${(z.vtaFcst/maxV)*100}%`}} />
                              </div>
                            </div>
                            <span className="w-20 text-right text-[9px] font-mono">
                              <span className="text-yellow-400">{fmt(z.vtaProy)}</span>
                              <span className={t.textMuted}>→</span>
                              <span className="text-violet-400">{fmt(z.vtaFcst)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3 mt-1.5 text-[8px]">
                      <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded bg-yellow-400/80 inline-block"/> Venta actual</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded bg-violet-500 inline-block"/> Con fcst uplift</span>
                    </div>
                  </div>
                </div>

                {/* Inventario + MOS por zona: antes vs después */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>📦 Inventario y MOS por Zona — Antes vs Después</h4>
                  <div className="space-y-3">
                    {nivChartData.zonaInvMos.map((z, i) => {
                      const maxOH = Math.max(...nivChartData.zonaInvMos.map(x => Math.max(x.ohAntes, x.ohDespues)), 1);
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[11px] font-black ${t.textMain}`}>{z.zona}</span>
                            <span className="text-[10px] font-mono">
                              <span className="text-yellow-400">MOS {z.mosAntes}</span>
                              <span className={t.textMuted}> → </span>
                              <span className="text-violet-400">{z.mosDespues}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-10 text-[8px] text-right ${t.textMuted}`}>Antes</span>
                            <div className="flex-1 h-3 rounded bg-zinc-700/20 overflow-hidden">
                              <div className="h-full rounded bg-yellow-400/80" style={{width: `${(z.ohAntes/maxOH)*100}%`}} />
                            </div>
                            <span className="w-14 text-[9px] font-mono text-yellow-400 text-right">{fmt(z.ohAntes)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`w-10 text-[8px] text-right ${t.textMuted}`}>Después</span>
                            <div className="flex-1 h-3 rounded bg-zinc-700/20 overflow-hidden">
                              <div className="h-full rounded bg-violet-500" style={{width: `${(z.ohDespues/maxOH)*100}%`}} />
                            </div>
                            <span className="w-14 text-[9px] font-mono text-violet-400 text-right">{fmt(z.ohDespues)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-3 text-[9px]">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-yellow-400/80 inline-block"/> OH antes</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-violet-500 inline-block"/> OH después</span>
                  </div>
                </div>
                </div>

                {/* Top centros más modificados */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>🏪 Top Centros más Modificados</h4>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                    {nivChartData.topCentros.map((c, i) => {
                      const maxMov = nivChartData.topCentros[0]?.movido || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className={`w-36 truncate text-[10px] font-bold text-right ${t.textMain}`} title={c.nombre}>
                            {c.nombre} <span className={`font-mono ${t.textMuted}`}>({c.centro})</span>
                          </span>
                          <div className="flex-1 relative h-5 rounded-lg overflow-hidden bg-zinc-700/20">
                            <div className="absolute left-0 h-full rounded-lg bg-gradient-to-r from-yellow-400 to-violet-500 flex items-center pl-2"
                              style={{width: `${Math.max(6,(c.movido/maxMov)*100)}%`}}>
                              <span className="text-[9px] font-black text-black flex items-center gap-1">
                                {c.neto > 0 ? '↑' : c.neto < 0 ? '↓' : '↔'} {fmt(Math.abs(c.neto))} pzs {c.neto > 0 ? 'recibió' : c.neto < 0 ? 'envió' : ''}
                              </span>
                            </div>
                          </div>
                          <span className={`w-24 text-right text-[9px] font-mono`} title="MOS antes → después">
                            <span className={t.textMuted}>MOS </span>
                            <span className="text-yellow-400">{c.mosAntes.toFixed(1)}</span>
                            <span className={t.textMuted}>→</span>
                            <span className="text-violet-400">{c.mosDespues.toFixed(1)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tarjetas top problemáticos */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { title: '🔴 Top SKUs problemáticos', items: nivTops.skus, keyLabel: 'sku' },
                    { title: '🟠 Top Modelos/Claves', items: nivTops.modelos, keyLabel: 'modelo' },
                    { title: '🏬 Top Tiendas (mayor MOS)', items: nivTops.tiendas, keyLabel: 'tienda' },
                  ].map(({ title, items, keyLabel }) => (
                    <div key={title} className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-xs font-black mb-2 ${t.textMain}`}>{title}</h4>
                      {items.length ? (
                        <div className="space-y-1.5">
                          {items.map((it, i) => (
                            <div key={i} className={`flex items-center justify-between text-[10px] pb-1.5 ${i < items.length-1 ? `border-b ${t.border}` : ''}`}>
                              <div className="min-w-0">
                                <div className={`font-bold truncate ${t.textMain}`}>
                                  {keyLabel === 'tienda' ? it.nombre : it.key}
                                </div>
                                <div className={`text-[9px] ${t.textMuted}`}>
                                  {keyLabel === 'tienda' ? `${it.zona} · MOS ${it.mosFinal} (mayor sobreinv.)` : it.sub}
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className="font-black text-red-400">{fmt(it.oh)} pzs</div>
                                <div className={`text-[9px] ${t.textMuted}`}>{fmtMXN(it.importe)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-[10px] ${t.textMuted}`}>Sin problemas detectados.</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Scatter comparativo con R²: antes vs después */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { titulo: 'ANTES', xKey: 'vtaAntes', yKey: 'ohAntes', color: '#facc15', lineColor: '#eab308' },
                    { titulo: 'DESPUÉS + FCST', xKey: 'vtaDespues', yKey: 'ohDespues', color: '#a78bfa', lineColor: '#7c3aed' },
                  ].map(({ titulo, xKey, yKey, color, lineColor }) => {
                    const pts = nivChartData.scatter.map(d => ({ x: d[xKey], y: d[yKey], ...d }));
                    const reg = linReg(pts.map(p => ({ x: p.x, y: p.y })));
                    const maxX = Math.max(...pts.map(p => p.x), 1);
                    const maxY = Math.max(...pts.map(p => p.y), 1);
                    // viewBox 400x260, plot area x:[45,385] y:[15,215]
                    const toX = v => 45 + (v/maxX) * 340;
                    const toY = v => 215 - (v/maxY) * 200;
                    // Línea de regresión: de x=0 a x=maxX
                    const y0 = reg.intercept;
                    const y1 = reg.slope * maxX + reg.intercept;
                    return (
                      <div key={titulo} className={`p-4 rounded-xl border ${t.cardInner}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className={`text-sm font-bold ${titulo==='ANTES' ? 'text-yellow-400' : 'text-violet-400'}`}>
                            📊 Venta vs Inventario · {titulo}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${titulo==='ANTES' ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400' : 'bg-violet-500/10 border-violet-500/40 text-violet-400'}`}>
                            R² = {reg.r2.toFixed(3)}
                          </span>
                        </div>
                        <svg viewBox="0 0 400 240" className="w-full">
                          {/* Grid */}
                          {[0,1,2,3,4].map(i => (
                            <line key={'h'+i} x1={45} y1={15+i*50} x2={385} y2={15+i*50} stroke={isDark?'#27272a':'#f0f0f0'} strokeWidth="0.5"/>
                          ))}
                          {[0,1,2,3,4].map(i => (
                            <line key={'v'+i} x1={45+i*85} y1={15} x2={45+i*85} y2={215} stroke={isDark?'#27272a':'#f0f0f0'} strokeWidth="0.5" strokeDasharray="2,2"/>
                          ))}
                          {/* Puntos sin cambio primero (fondo) */}
                          {pts.filter(d => !d.modificado).map((d, i) => (
                            <circle key={'s'+i} cx={toX(d.x)} cy={toY(d.y)}
                              r={2} fill={color} opacity={0.25}>
                              <title>{d.nombre} ({d.zona}) — Venta {Math.round(d.x)} / Inv {Math.round(d.y)}</title>
                            </circle>
                          ))}
                          {/* Puntos modificados encima, brillantes */}
                          {pts.filter(d => d.modificado).map((d, i) => (
                            <g key={'m'+i}>
                              <circle cx={toX(d.x)} cy={toY(d.y)} r={7} fill={color} opacity={0.25} />
                              <circle cx={toX(d.x)} cy={toY(d.y)} r={4.5} fill={color} opacity={1}
                                stroke="#fff" strokeWidth="1.2">
                                <title>{d.nombre} ({d.zona}) — Venta {Math.round(d.x)} / Inv {Math.round(d.y)}</title>
                              </circle>
                            </g>
                          ))}
                          {/* Línea de regresión */}
                          <line x1={toX(0)} y1={toY(Math.max(0,y0))} x2={toX(maxX)} y2={toY(Math.max(0,y1))}
                            stroke={lineColor} strokeWidth="2" opacity="0.9"/>
                          {/* Ejes labels */}
                          <text x={215} y={234} textAnchor="middle" fontSize="9" fill={isDark?'#71717a':'#9ca3af'}>Venta</text>
                          <text x={14} y={115} textAnchor="middle" fontSize="9" fill={isDark?'#71717a':'#9ca3af'} transform="rotate(-90,14,115)">Inventario</text>
                          <text x={45} y={228} fontSize="7" fill={isDark?'#52525b':'#9ca3af'}>0</text>
                          <text x={385} y={228} textAnchor="end" fontSize="7" fill={isDark?'#52525b':'#9ca3af'}>{fmt(maxX)}</text>
                          <text x={40} y={215} textAnchor="end" fontSize="7" fill={isDark?'#52525b':'#9ca3af'}>0</text>
                          <text x={40} y={20} textAnchor="end" fontSize="7" fill={isDark?'#52525b':'#9ca3af'}>{fmt(maxY)}</text>
                        </svg>
                        <div className="flex gap-3 text-[9px] mt-1">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{background: color}}/> Tiendas ({pts.length})</span>
                          <span className="flex items-center gap-1"><span className="w-4 border-t-2 inline-block" style={{borderColor: lineColor}}/> Tendencia</span>
                          <span className={t.textMuted}>Grandes = modificados</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Top 10 problemáticas */}
                {nivProblematicas.length > 0 && (
                  <div className={`p-4 rounded-xl border border-red-500/30 ${isDark ? 'bg-red-950/20' : 'bg-red-50'}`}>
                    <h4 className="text-sm font-black text-red-400 mb-1 flex items-center gap-2">
                      <Icons.AlertCircle size={15} /> Top {nivProblematicas.length} Tiendas Problemáticas
                    </h4>
                    <p className={`text-[10px] mb-3 ${t.textMuted}`}>Siguen con sobreinventario tras nivelar — ya no se pudo bajar más su MOS.</p>
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-xs min-w-max">
                        <thead>
                          <tr className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} border-b ${t.border}`}>
                            {['Tienda','Zona',nivNivel==='sku'?'SKU':'Clave','OH Inicial','OH Final','MOS Inicial','MOS Final','VTA/mes','Importe'].map(h => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                          {nivProblematicas.map((p, i) => (
                            <tr key={i} className="text-xs">
                              <td className={`p-2 font-bold ${t.textMain}`}>{p.nombre} <span className={`text-[9px] ${t.textMuted}`}>({p.centro})</span></td>
                              <td className={`p-2 ${t.textMuted}`}>{p.zona}</td>
                              <td className={`p-2 font-mono ${t.textMain}`}>{nivNivel==='sku'?p.sku:p.clave}</td>
                              <td className={`p-2 font-mono text-yellow-400`}>{fmt(p.ohInicial)}</td>
                              <td className={`p-2 font-black text-amber-400`}>{fmt(p.oh)}</td>
                              <td className={`p-2 font-mono text-yellow-400`}>{p.mosInicial}m</td>
                              <td className="p-2 font-black text-red-400">{p.mosFinal}m</td>
                              <td className={`p-2 font-mono ${t.textMuted}`}>{p.vtaProyMes}</td>
                              <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(p.importe)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sugeridos para liquidación */}
                {nivLiquidacion.length > 0 && (
                  <div className={`p-4 rounded-xl border border-orange-500/30 ${isDark ? 'bg-orange-950/20' : 'bg-orange-50'}`}>
                    <h4 className="text-sm font-black text-orange-500 mb-1 flex items-center gap-2">
                      <Icons.Tag size={15} /> Sugeridos para Descuento / Liquidación ({nivLiquidacion.length})
                    </h4>
                    <p className={`text-[10px] mb-3 ${t.textMuted}`}>
                      Naranja = ya rebajado (no se puede rebajar más, requiere outlet/remate/devolución). Ámbar = sin venta reciente pero aún sin rebaja (candidato a descuento).
                    </p>
                    <div className="overflow-x-auto custom-scrollbar max-h-72">
                      <table className="w-full text-left text-xs min-w-max">
                        <thead>
                          <tr className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} border-b ${t.border} sticky top-0 ${isDark?'bg-zinc-900':'bg-white'}`}>
                            {['Zona','Marca','GOA',nivNivel==='sku'?'SKU / Descripción':'Clave','Motivo','Tiendas','OH Total','Importe'].map(h => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                          {nivLiquidacion.slice(0,50).map((l, i) => (
                            <tr key={i} className="text-xs">
                              <td className={`p-2 ${t.textMuted}`}>{l.zona}</td>
                              <td className={`p-2 ${t.textMuted}`}>{l.marca}</td>
                              <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{l.goa}</span></td>
                              <td className={`p-2 font-mono text-[10px] ${t.textMain}`}>{nivNivel==='sku' ? (l.nsku || l.sku) : l.clave}</td>
                              <td className="p-2">
                                {l.motivo === 'rebajado' ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-500/20 text-orange-400 border border-orange-500/40" title="Ya está rebajado, no se puede rebajar más">
                                    {l.letraDesc || 'Rebajado'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30" title="Sin venta reciente — candidato a descuento">
                                    Sin venta · descontar
                                  </span>
                                )}
                              </td>
                              <td className={`p-2 text-center ${t.textMuted}`}>{l.tiendas}</td>
                              <td className={`p-2 font-black text-orange-400`}>{fmt(l.oh)}</td>
                              <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(l.importe)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={`text-[10px] mt-2 font-bold ${t.textMuted}`}>
                      Total en liquidación: {fmt(nivLiquidacion.reduce((s,l)=>s+l.oh,0))} pzs · {fmtMXN(nivLiquidacion.reduce((s,l)=>s+l.importe,0))}
                    </p>
                  </div>
                )}

                {/* Tabla traslados */}
                <div className={`rounded-xl border overflow-hidden ${t.cardInner}`}>
                  <div className={`flex items-center justify-between px-4 py-2 border-b ${t.border}`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>{nivResult.length} traslados de nivelación</span>
                    <button onClick={exportNivelacion} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black ${t.btnSecondary}`}>
                      <Icons.Download size={12} /> Exportar Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-[55vh] custom-scrollbar">
                    <table className="w-full text-left min-w-max">
                      <thead>
                        <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                          {['Zona','Marca','GOA',nivNivel==='sku'?'SKU':'Clave','Centro Salida','Centro Receptor','Pzs','Importe','MOS Orig','MOS Dest','Índice pot.'].map(h => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                        {nivResult.map((r, i) => (
                          <tr key={i} className={`text-xs transition-colors ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-violet-50/30'}`}>
                            <td className={`p-2 font-bold ${t.textMuted}`}>{r.zona}</td>
                            <td className={`p-2 ${t.textMuted}`}>{r.marca}</td>
                            <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.goa}</span></td>
                            <td className={`p-2 font-mono text-[10px] ${t.textMain}`}>{r.sku}</td>
                            <td className={`p-2 font-bold ${t.textMain}`}>{r.nombreSalida} <span className={`text-[9px] font-mono ${t.textMuted}`}>({r.centroSalida})</span></td>
                            <td className={`p-2 font-bold text-emerald-400`}>{r.nombreReceptor} <span className={`text-[9px] font-mono ${t.textMuted}`}>({r.centroReceptor})</span></td>
                            <td className={`p-2 font-black ${t.textAccent1}`}>{fmt(r.pzs)}</td>
                            <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.importe)}</td>
                            <td className={`p-2 font-mono text-[10px]`}><span className="text-yellow-400">{r.mosSalidaAntes}</span>→<span className="text-violet-400">{r.mosSalidaDespues}</span></td>
                            <td className={`p-2 font-mono text-[10px]`}><span className="text-yellow-400">{r.mosReceptorAntes}</span>→<span className="text-violet-400">{r.mosReceptorDespues}</span></td>
                            <td className={`p-2 font-black text-center ${r.potencialReceptor > 0.6 ? 'text-emerald-400' : t.textMuted}`}>{(r.potencialReceptor*100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : nivExecuted ? (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Check size={32} className="text-emerald-400 mb-3" />
                <p className={`text-sm font-bold ${t.textMain}`}>Inventarios ya nivelados</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>No se encontraron desbalances que ameriten traslado con el MOS objetivo actual.</p>
              </div>
            ) : (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Sliders size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>{rawData.length ? 'Herramienta de nivelación lista' : 'Sin inventario base'}</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>{rawData.length ? 'Ajusta el nivel, MOS objetivo y pesos, luego ejecuta la nivelación.' : 'Carga el CSV con VTA_3M para calcular el forecast.'}</p>
              </div>
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

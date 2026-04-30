import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Icons from '../utils/icons';
import { useDispatch, useGlobal, globalActions } from '../context/GlobalContext';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
     .map(c => c.replace(/^"|"$/g, '').trim());

const num = v => parseFloat(String(v || '0').replace(/[^0-9.-]+/g, '')) || 0;

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
  const max = Math.max(...data.map(d => Math.max(d.antes, d.despues)), 1);
  return (
    <div className="space-y-2 mt-2">
      {data.slice(0, 12).map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px]">
          <span className={`w-24 truncate text-right font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`} title={d.centro}>
            {d.centro}
          </span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="relative h-2 rounded-full bg-zinc-700/30 overflow-hidden">
              <div className="absolute left-0 top-0 h-full rounded-full bg-amber-400/70"
                style={{ width: `${(d.antes / max) * 100}%` }} />
            </div>
            <div className="relative h-2 rounded-full bg-zinc-700/30 overflow-hidden">
              <div className="absolute left-0 top-0 h-full rounded-full bg-emerald-400"
                style={{ width: `${(d.despues / max) * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-col items-end w-14">
            <span className="text-amber-400 font-mono">{fmt(d.antes)}</span>
            <span className="text-emerald-400 font-mono">{fmt(d.despues)}</span>
          </div>
        </div>
      ))}
      <div className="flex gap-4 mt-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-amber-400/70 inline-block" /> Antes</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-emerald-400 inline-block" /> Después</span>
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
    },
  };
  const t = themes[theme] || themes.light;

  // ══════════════════════════════════════════════════════════════════════
  // TAB 1 — EXCEDENTE
  // ══════════════════════════════════════════════════════════════════════

  const csvInputRef    = useRef(null);
  const matrizInputRef = useRef(null);

  const [rawData,    setRawData]    = useState([]);
  const [brandMatrix, setBrandMatrix] = useState({});
  const [climaMatrix, setClimaMatrix] = useState({});

  // Panel configurable: { [goa]: 'FRIO' | 'CALOR' | 'PLAYA' | 'TODO' }
  // El usuario define qué GOAs son de temporada y qué clima requieren
  const [goasTemporada, setGoasTemporada] = useState({});
  const [showPanelGoas, setShowPanelGoas] = useState(false);

  const [filterSku,     setFilterSku]     = useState('ALL');
  const [filterTipoCentro, setFilterTipoCentro] = useState('ALL');
  const [filterSeccion, setFilterSeccion] = useState('ALL');
  const [filterMarca,   setFilterMarca]   = useState('ALL');
  const [filterGoa,     setFilterGoa]     = useState('ALL');

  const [excResult, setExcResult] = useState([]);   // traslados calculados
  const [excLoading, setExcLoading] = useState(false);

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

      const iSeccion  = idx(['SECCION', 'SECCIÓN', 'SECTION']);
      const iNumSec   = idx(['NUM_SECCION', 'NUMSEC', 'NUMERO_SECCION', 'NUM SEC']);
      const iGoa      = idx(['GOA', 'FAMILIA']);
      const iSku      = idx(['SKU', 'ARTICULO', 'MATERIAL']);
      const iNSku     = idx(['NSKU', 'N_SKU', 'DESC_SKU', 'NOMBRE_SKU', 'DESCRIPCION', 'DESC']);
      const iModelo   = idx(['MODELO', 'MODEL']);
      const iMarca    = idx(['MARCA', 'BRAND']);
      const iCentro   = idx(['CENTRO', 'ID', 'TIENDA']);
      const iNCentro  = idx(['N_CENTRO', 'NCENTRO', 'NUM_CENTRO', 'ID_CENTRO', 'COD_CENTRO']);
      const iOH       = idx(['OH', 'INV', 'INVENTARIO', 'STOCK', 'EXISTENCIAS']);
      const iPrecio   = idx(['PRECIO', 'PVP', 'PRICE', 'COSTO']);
      const iTipoCentro = idx(['TIPO_CENTRO', 'TIPO CENTRO', 'TIPO', 'TIPO_TIENDA']);
      const iZona     = idx(['ZONA', 'REGION', 'DISTRITO', 'ZONA_CENTRO']);
      const iVta      = idx(['VTA', 'VENTAS', 'VTAS', 'SALES']);
      const iNombre   = idx(['NOMBRE', 'NOMBRE_CENTRO', 'DESC CENTRO']);

      if (iGoa === -1 || iSku === -1 || iCentro === -1) {
        alert('El CSV debe tener mínimo: GOA, SKU, CENTRO'); return;
      }

      const extracted = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[iCentro] || !r[iGoa]) continue;
        extracted.push({
          seccion:    iSeccion   >= 0 ? r[iSeccion].trim()   : 'GENERAL',
          numSeccion: iNumSec    >= 0 ? r[iNumSec].trim()    : '',
          goa:        r[iGoa].trim().toUpperCase(),
          sku:        iSku       >= 0 ? r[iSku].trim()       : '',
          nsku:       iNSku      >= 0 ? r[iNSku].trim()      : '',
          modelo:     iModelo    >= 0 ? r[iModelo].trim().toUpperCase() : '',
          marca:      iMarca     >= 0 ? r[iMarca].trim().toUpperCase() : '',
          centro:     r[iCentro].trim(),
          nCentro:    iNCentro   >= 0 ? r[iNCentro].trim()   : '',
          nombre:     iNombre    >= 0 ? r[iNombre].trim()    : r[iCentro].trim(),
          oh:         num(iOH    >= 0 ? r[iOH]     : 0),
          precio:     num(iPrecio >= 0 ? r[iPrecio]  : 0),
          tipoCentro: iTipoCentro >= 0 ? r[iTipoCentro].trim().toUpperCase() : '',
          zona:       iZona      >= 0 ? r[iZona].trim().toUpperCase()    : '',
          vta:        num(iVta   >= 0 ? r[iVta]    : 0),
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
  const opcionesGoa    = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.goa).filter(Boolean))], [rawData]);
  const opcionesSku    = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.sku).filter(Boolean))], [rawData]);
  const opcionesMarca  = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.marca).filter(Boolean))], [rawData]);
  const opcionesSeccion = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.seccion).filter(Boolean))], [rawData]);
  const opcionesTipoCentro = useMemo(() => ['ALL', ...new Set(rawData.map(r => r.tipoCentro).filter(Boolean))], [rawData]);

  // HERRAMIENTA EXCEDENTE — usa goasTemporada configurado por el usuario
  const calcularExcedentes = useCallback(() => {
    if (!rawData.length) return;
    const goasActivos = Object.keys(goasTemporada).filter(g => goasTemporada[g] && goasTemporada[g] !== 'TODO');
    if (goasActivos.length === 0) {
      alert('Define al menos un GOA de temporada en el panel "GOAs de Temporada" antes de ejecutar la herramienta.');
      return;
    }
    setExcLoading(true);

    setTimeout(() => {
      // Agrupar OH por SKU x centro
      const centroPorSku = {};
      rawData.forEach(r => {
        const key = `${r.sku}|${r.goa}|${r.marca}|${r.seccion}|${r.numSeccion}`;
        if (!centroPorSku[key]) centroPorSku[key] = { meta: r, centros: {} };
        const prev = centroPorSku[key].centros[r.centro];
        centroPorSku[key].centros[r.centro] = {
          ...r,
          oh:  (prev?.oh  || 0) + r.oh,
          vta: (prev?.vta || 0) + r.vta,
        };
      });

      // Compatibilidad: compara el clima requerido del GOA vs el TIPO CENTRO
      // Climas posibles: FRIO, CALOR, PLAYA, TEMPLADO, EXTREMOSO
      // EXTREMOSO = climas extremos (muy frío o muy caluroso) — admite artículos de ambos extremos
      const zonaValida = (tipoClima, tipoCentro = '') => {
        const tc = tipoCentro.toUpperCase().trim();
        if (tipoClima === 'FRIO')  return ['FRIO','EXTREMOSO','TEMPLADO',''].includes(tc);
        if (tipoClima === 'CALOR') return ['CALOR','PLAYA','EXTREMOSO','TEMPLADO',''].includes(tc);
        if (tipoClima === 'PLAYA') return ['PLAYA','CALOR'].includes(tc);
        return true; // TODO = va a todos
      };

      const resultado = [];

      Object.entries(centroPorSku).forEach(([, { meta, centros }]) => {
        const goa   = meta.goa;
        const marca = meta.marca;
        const tipoClima = goasTemporada[goa]; // undefined si no está configurado
        if (!tipoClima || tipoClima === 'TODO') return; // solo GOAs de temporada

        // Filtros del usuario
        if (filterGoa      !== 'ALL' && goa         !== filterGoa)       return;
        if (filterSku      !== 'ALL' && meta.sku     !== filterSku)       return;
        if (filterMarca    !== 'ALL' && marca        !== filterMarca)     return;
        if (filterSeccion  !== 'ALL' && meta.seccion !== filterSeccion)   return;

        Object.entries(centros).forEach(([centroOrigen, dataOrigen]) => {
          if (dataOrigen.oh <= 0) return;
          if (filterTipoCentro !== 'ALL' && dataOrigen.tipoCentro !== filterTipoCentro) return;

          const zonaOrigen = dataOrigen.zona || '';
          // Tipo clima del centro: primero climaMatrix (viene de la matriz), luego col TIPO CENTRO del CSV
          const tcOrigen = climaMatrix[dataOrigen.nCentro] || climaMatrix[dataOrigen.centro] || dataOrigen.tipoCentro || '';
          if (zonaValida(tipoClima, tcOrigen)) return;

          // Buscar mejor receptor: tipoCentro compatible + mayor venta - menor OH + permiso de marca
          const posiblesReceptores = Object.entries(centros)
            .filter(([c]) => c !== centroOrigen)
            .map(([c, d]) => {
              const seccionMarca  = `${meta.seccion}|${marca}`;
              const tienePermiso  = !brandMatrix[c] || brandMatrix[c].length === 0 || brandMatrix[c].includes(seccionMarca);
              const tcRec = climaMatrix[d.nCentro] || climaMatrix[d.centro] || d.tipoCentro || '';
              const climaOK = zonaValida(tipoClima, tcRec);
              const score         = (d.vta || 0) - (d.oh || 0) * 0.3;
              return { centro: c, data: d, tienePermiso, climaOK, score };
            })
            .filter(r => r.tienePermiso && r.climaOK)
            .sort((a, b) => b.score - a.score);

          const receptor = posiblesReceptores[0];
          if (!receptor) return;

          resultado.push({
            seccion:    meta.seccion,
            numSeccion: meta.numSeccion,
            sku:        meta.sku,
            marca,
            goa,
            centroSalida:       centroOrigen,
            nombreSalida:       dataOrigen.nombre || centroOrigen,
            centroReceptor:     receptor.centro,
            nombreReceptor:     receptor.data.nombre || receptor.centro,
            pzs:                dataOrigen.oh,
            pesos:              dataOrigen.oh * (dataOrigen.precio || 0),
            precio:             dataOrigen.precio,
            razon:              `${goa} (${tipoClima}) en centro tipo ${tcOrigen} / zona: ${zonaOrigen}`,
            tipoCentroOrigen:   dataOrigen.tipoCentro,
            tipoCentroReceptor: receptor.data.tipoCentro,
          });
        });
      });

      setExcResult(resultado);
      setExcLoading(false);
    }, 300);
  }, [rawData, brandMatrix, goasTemporada, filterGoa, filterSku, filterMarca, filterSeccion, filterTipoCentro]);

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

    const centros = new Set([...Object.keys(byOrigen), ...Object.keys(byReceptor)]);
    return Array.from(centros).map(c => ({
      centro: c,
      antes:  byOrigen[c]   || 0,
      despues: Math.max(0, (byOrigen[c] || 0) - (salidas[c] || 0) + (byReceptor[c] || 0)),
    })).sort((a, b) => b.antes - a.antes).slice(0, 15);
  }, [excResult, rawData]);

  const exportExcedente = () => {
    const header = ['Sección', 'Núm. Sección', 'SKU', 'Marca', 'GOA', 'Centro Salida', 'Centro Receptor', 'Piezas', 'Importe ($)'];
    const rows = excResult.map(r => [r.seccion, r.numSeccion, r.sku, r.marca, r.goa, r.centroSalida, r.centroReceptor, r.pzs, r.pesos]);
    downloadExcel([header, ...rows], 'Traslados_Excedente.csv');
  };

  // ══════════════════════════════════════════════════════════════════════
  // TAB 2 — NECESIDAD
  // ══════════════════════════════════════════════════════════════════════

  const [chequeraText,      setChequeraText]      = useState('');
  const [centrosSurtidores, setCentrosSurtidores] = useState('');
  const [necesResult,       setNecesResult]       = useState([]);
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
        if (d.tallasCache)         setTallasCache(d.tallasCache);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gop_traslados_nec', JSON.stringify({ chequeraText, centrosSurtidores, necesResult, tallasCache }));
    } catch {}
  }, [chequeraText, centrosSurtidores, necesResult, tallasCache]);

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
    if (!input || !datos.length) return { nombre: input, nCentro: '' };
    const q = input.trim().toUpperCase();
    const hit = datos.find(r =>
      r.centro.toUpperCase() === q ||
      r.nCentro === q ||
      r.nombre?.toUpperCase() === q
    );
    return hit
      ? { nombre: hit.centro, nCentro: hit.nCentro }
      : { nombre: input, nCentro: '' };
  }, []);

  const fmtCentro = (nombre, nCentro) =>
    nCentro ? `${nombre} (${nCentro})` : nombre;

  // Auto-detectar si el identificador es MODELO, GOA o MARCA
  const detectarTipoId = useCallback((id, datos) => {
    const q = id.toUpperCase().trim();
    if (!q) return { tipo: null, valor: q };
    if (datos.some(r => (r.modelo || '').toUpperCase() === q)) return { tipo: 'modelo', valor: q };
    if (datos.some(r => r.goa === q))                          return { tipo: 'goa',    valor: q };
    if (datos.some(r => r.marca === q))                        return { tipo: 'marca',  valor: q };
    return { tipo: 'modelo', valor: q };
  }, []);

  // Parsear chequera: Identificador | Ppto | CentroReceptor
  const parsearChequera = useCallback((texto, datos) => {
    const lines = texto.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const sep   = line.includes('|') ? '|' : line.includes('\t') ? '\t' : ',';
      const parts = line.split(sep).map(p => p.trim());
      if (parts.length < 2) return null;
      const idRaw = parts[0] || '';
      const { tipo, valor } = detectarTipoId(idRaw, datos);
      return {
        idRaw,
        tipo,
        valor,
        pptoNeed:       num(parts[1] || '0'),
        centroReceptor: (parts[2] || 'DESTINO (definir)').trim(),
      };
    }).filter(Boolean);
  }, [detectarTipoId]);

  // HERRAMIENTA NECESIDAD — corridas por modelo+talla
  const calcularNecesidad = useCallback(() => {
    if (!chequeraText.trim() || !rawData.length) return;

    const chequera       = parsearChequera(chequeraText, rawData);
    const surtidoresList = centrosSurtidores
      ? centrosSurtidores.split(',').map(c => c.trim()).filter(Boolean)
      : null;

    // Detectar SKUs sin talla parseable que no estén en cache
    const sinTalla = rawData.filter(r => {
      if (surtidoresList && !surtidoresList.includes(r.centro)) return false;
      const t = extraerTalla(r.nsku, r.sku, tallasCache);
      return !t && r.oh > 0;
    });
    const skusSinTalla = [...new Map(sinTalla.map(r => [r.sku, r])).values()];

    if (skusSinTalla.length > 0) {
      // Abrir modal con el primer SKU sin talla
      setModalTallas({ skus: skusSinTalla, index: 0, pendingCalc: true });
      return;
    }

    ejecutarCalculo(chequera, surtidoresList, tallasCache, minCorridasAlto, minCorridasResto);
  }, [chequeraText, centrosSurtidores, rawData, tallasCache, minCorridasAlto, minCorridasResto]);

  const ejecutarCalculo = useCallback((chequera, surtidoresList, cache, minAlto, minResto) => {
    setNecesLoading(true);
    setTimeout(() => {
      // ── Inventario: centro → modeloKey → talla → [rows] ──────────────
      const inv = {};
      rawData.forEach(r => {
        if (surtidoresList && !surtidoresList.includes(r.centro)) return;
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
        if (surtidoresList && !surtidoresList.includes(r.centro)) return;
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

      chequera.forEach(item => {
        const recInfo = lookupCentro(item.centroReceptor, rawData);
        let pptoRestante = item.pptoNeed || 0;

        // Resolver qué modelos aplican según tipo detectado
        let modelosAplicables = new Set();
        if (item.tipo === 'modelo') {
          rawData.filter(r => (r.modelo || r.goa).toUpperCase() === item.valor)
            .forEach(r => modelosAplicables.add(r.modelo || r.goa));
        } else if (item.tipo === 'goa') {
          rawData.filter(r => r.goa === item.valor)
            .forEach(r => modelosAplicables.add(r.modelo || r.goa));
        } else if (item.tipo === 'marca') {
          rawData.filter(r => r.marca === item.valor)
            .forEach(r => modelosAplicables.add(r.modelo || r.goa));
        }
        if (!modelosAplicables.size) return;

        modelosAplicables.forEach(modeloKey => {
          if (pptoRestante <= 0 && item.pptoNeed > 0) return;

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
          const precioCorrida1 = corrida.reduce((s,t) => s + (precioTalla[t]||0), 0);
          if (precioCorrida1 <= 0) return;

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
          if (corridasMax <= 0) return;

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
              centro: mejor.centro, nCentro: row.nCentro,
              nombreCentro: row.centro,
              oh: mejor.ohTot, precio: precioTalla[talla]||row.precio,
              seccion: row.seccion, numSeccion: row.numSeccion,
              marca: row.marca, goa: row.goa, modelo: modeloKey,
            });
          });

          if (!asignaciones.length) return;

          const precioCorrida = asignaciones.reduce((s,a) => s + (a.precio||0), 0);

          // Emitir filas y descontar
          asignaciones.forEach(a => {
            const rows = invMut[a.centro]?.[modeloKey]?.[a.talla];
            let restante = a.pzsEnv;
            if (rows) rows.forEach(r => { const d = Math.min(r.ohDisp, restante); r.ohDisp -= d; restante -= d; });

            resultado.push({
              seccion: a.seccion, numSeccion: a.numSeccion,
              marca: a.marca, goa: a.goa, modelo: a.modelo,
              sku: a.sku, nsku: a.nsku, talla: a.talla,
              centroSalida:   fmtCentro(a.nombreCentro, a.nCentro),
              centroReceptor: fmtCentro(recInfo.nombre, recInfo.nCentro),
              ohDisp: a.oh, pzs: a.pzsEnv,
              ohQueda: a.oh - a.pzsEnv,
              importe: a.pzsEnv * (a.precio||0),
              precio: a.precio,
              corridasEnv: a.pzsEnv,
            });
          });

          if (pptoRestante > 0) pptoRestante -= asignaciones.reduce((s,a) => s + a.pzsEnv*(a.precio||0), 0);
        });
      });

      setNecesResult(resultado);
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
      ejecutarCalculo(chequera, surtidoresList, newCache, minCorridasAlto, minCorridasResto);
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
    const header = ['Sección', 'Núm. Sección', 'Marca', 'GOA', 'Modelo', 'SKU', 'N SKU', 'Centro Salida', 'Centro Receptor', 'OH Disp', 'Pzs', 'OH Queda', 'Importe ($)'];
    const rows = necesResult.map(r => [
      r.seccion, r.numSeccion, r.marca, r.goa, r.modelo,
      r.sku, r.nsku, r.centroSalida, r.centroReceptor,
      r.ohDisp, r.pzs, r.ohQueda, r.importe
    ]);
    downloadExcel([header, ...rows], 'Traslados_Necesidad.csv');
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
              <span className={`p-2 rounded-xl ${isDark ? 'bg-orange-500/20' : 'bg-orange-50'}`}>
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
            📦 Por Necesidad
          </button>
        </div>

        {/* ══════════ TAB 1: EXCEDENTE ══════════ */}
        {activeTab === 1 && (
          <div className="p-5 space-y-5">

            {/* Panel GOAs de Temporada */}
            <div className={`p-4 rounded-xl border ${t.cardInner}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xs font-black uppercase tracking-widest ${t.textMuted}`}>
                  GOAs de Temporada
                </h3>
                <button onClick={() => setShowPanelGoas(v => !v)}
                  className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all ${t.btnGhost}`}>
                  {showPanelGoas ? 'Ocultar' : `Configurar (${Object.keys(goasTemporada).length} definidos)`}
                </button>
              </div>
              {showPanelGoas && (
                <div className="space-y-2">
                  <p className={`text-[10px] mb-3 ${t.textMuted}`}>
                    Asigna el clima requerido de cada GOA. La herramienta detectará artículos de ese GOA en centros con <strong>TIPO CENTRO</strong> incompatible (ej. GOA de Calor en centro FRIO → excedente).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                    {opcionesGoa.filter(g => g !== 'ALL').map(goa => (
                      <div key={goa} className={`flex items-center gap-2 p-2 rounded-lg border ${isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-white'}`}>
                        <span className={`flex-1 text-xs font-bold truncate ${t.textMain}`}>{goa}</span>
                        <select
                          value={goasTemporada[goa] || ''}
                          onChange={e => setGoasTemporada(prev => ({ ...prev, [goa]: e.target.value || undefined }))}
                          className={`text-[10px] px-2 py-1 rounded border ${t.input} focus:outline-none focus:ring-1 w-28`}>
                          <option value="">— No aplica —</option>
                          <option value="FRIO">❄️ Frío</option>
                          <option value="CALOR">☀️ Calor</option>
                          <option value="PLAYA">🏖️ Playa</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  {opcionesGoa.filter(g => g !== 'ALL').length === 0 && (
                    <p className={`text-xs ${t.textMuted}`}>Carga el CSV primero para ver los GOAs disponibles.</p>
                  )}
                </div>
              )}
              {!showPanelGoas && Object.keys(goasTemporada).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(goasTemporada).filter(([, v]) => v).map(([goa, clima]) => (
                    <span key={goa} className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>
                      {goa} · {clima === 'FRIO' ? '❄️' : clima === 'CALOR' ? '☀️' : '🏖️'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Filtros */}
            <div className={`p-4 rounded-xl border ${t.cardInner}`}>
              <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>
                Filtros · La herramienta detectará artículos de temporada fuera de su zona ideal
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'GOA',       val: filterGoa,        set: setFilterGoa,        opts: opcionesGoa },
                  { label: 'SKU',       val: filterSku,        set: setFilterSku,        opts: opcionesSku },
                  { label: 'Marca',     val: filterMarca,      set: setFilterMarca,      opts: opcionesMarca },
                  { label: 'Sección',   val: filterSeccion,    set: setFilterSeccion,    opts: opcionesSeccion },
                  { label: 'Tipo Centro', val: filterTipoCentro, set: setFilterTipoCentro, opts: opcionesTipoCentro },
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
              <div className="mt-4 flex gap-3 flex-wrap">
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
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <div className={`flex items-center gap-2 text-[10px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>
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

                {/* Tabla de traslados */}
                <div className={`rounded-xl border overflow-hidden ${t.cardInner}`}>
                  <div className="overflow-x-auto max-h-[55vh] custom-scrollbar">
                    <table className="w-full text-left min-w-max">
                      <thead>
                        <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark ? 'bg-zinc-900 text-gray-400 border-b border-zinc-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                          {['Sección', 'Núm.', 'SKU', 'Marca', 'GOA', 'Centro Salida', 'Centro Receptor', 'Tipo Rec.', 'Pzs', 'Importe', 'Razón'].map(h => (
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
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.goa}</span>
                            </td>
                            <td className={`p-2 font-bold ${t.textMain}`}>{r.nombreSalida} <span className={`text-[9px] font-mono ${t.textMuted}`}>({r.centroSalida})</span></td>
                            <td className={`p-2 font-bold text-emerald-400`}>{r.nombreReceptor} <span className={`text-[9px] font-mono ${t.textMuted}`}>({r.centroReceptor})</span></td>
                            <td className={`p-2 text-[10px] ${t.textMuted}`}>{r.tipoCentroReceptor}</td>
                            <td className={`p-2 font-black ${t.textAccent1}`}>{fmt(r.pzs)}</td>
                            <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.pesos)}</td>
                            <td className={`p-2 text-[9px] max-w-[160px] truncate ${t.textMuted}`} title={r.razon}>{r.razon}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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
                  Chequera de Necesidad
                </h3>
                <p className={`text-[10px] mb-3 ${t.textMuted}`}>
                  Un identificador por línea: <code className="opacity-60">Modelo / GOA / Marca | Ppto ($) | Centro Receptor</code>
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
                    <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}>
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
                <p className={`text-sm font-bold ${t.textMain}`}>Herramienta de necesidad lista</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Llena la chequera. La herramienta detecta la corrida autom\u00e1ticamente por las tallas del nombre del SKU.</p>
              </div>
            )}

            {!rawData.length && (
              <div className={`p-8 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                <Icons.Upload size={32} className={`${isDark ? 'text-zinc-600' : 'text-gray-300'} mb-3`} />
                <p className={`text-sm font-bold ${t.textMain}`}>Sin inventario base</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Carga el CSV de art\u00edculos desde el bot\u00f3n del encabezado para que la herramienta pueda calcular disponibilidad.</p>
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

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
      const iMarca    = idx(['MARCA', 'BRAND']);
      const iCentro   = idx(['CENTRO', 'ID', 'TIENDA']);
      const iOH       = idx(['OH', 'INV', 'INVENTARIO', 'STOCK', 'EXISTENCIAS']);
      const iPrecio   = idx(['PRECIO', 'PVP', 'PRICE', 'COSTO']);
      const iTipoCentro = idx(['TIPO_CENTRO', 'TIPO CENTRO', 'TIPO', 'TIPO_TIENDA']);
      const iZona     = idx(['ZONA', 'REGION', 'DISTRITO', 'ZONA_CENTRO']);
      const iVta      = idx(['VTA', 'VENTAS', 'VTAS', 'SALES']);
      const iNombre   = idx(['NOMBRE', 'NOMBRE_CENTRO', 'DESC CENTRO', 'TIENDA']);

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
          marca:      iMarca     >= 0 ? r[iMarca].trim().toUpperCase() : '',
          centro:     r[iCentro].trim(),
          nombre:     iNombre    >= 0 ? r[iNombre].trim()    : r[iCentro].trim(),
          oh:         num(iOH    >= 0 ? r[iOH]     : 0),
          precio:     num(iPrecio >= 0 ? r[iPrecio]  : 0),
          tipoCentro: iTipoCentro >= 0 ? r[iTipoCentro].trim().toUpperCase() : 'ESTÁNDAR',
          zona:       iZona      >= 0 ? r[iZona].trim().toUpperCase()     : '',
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

      const H = rows[0].map(h => h.toUpperCase().trim());

      // Detectar si tiene col GOA/FAMILIA → es matriz clima
      const iGoa   = H.findIndex(h => h === 'GOA' || h === 'FAMILIA');
      const iClima = H.findIndex(h => h === 'CLIMA' || h === 'ZONA_CLIMA' || h === 'TIPO_CLIMA');

      if (iGoa >= 0 && iClima >= 0) {
        // Matriz clima: GOA | CLIMA
        const newClima = {};
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[iGoa]) continue;
          const g = r[iGoa].trim().toUpperCase();
          const c = r[iClima].trim().toUpperCase();
          newClima[g] = c; // CALOR | FRIO | TODO
        }
        setClimaMatrix(newClima);
        alert(`Matriz clima cargada: ${Object.keys(newClima).length} GOAs.`);
      } else {
        // Matriz de marca: MARCA | NOM_MARCA | SECCION | [centros...]
        const iMarca   = H.findIndex(h => h === 'MARCA' || h === 'NOM_MARCA');
        const iSeccion = H.findIndex(h => h.includes('SECCION') || h === 'SECTION');
        if (iMarca === -1) { alert('No se encontró columna MARCA o NOM_MARCA'); return; }

        const storeCols = [];
        H.forEach((h, j) => {
          if (j > Math.max(iMarca, iSeccion || 0) && /^\d+$/.test(h))
            storeCols.push({ colIndex: j, storeId: h });
        });

        const matrix = {};
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const marca   = r[iMarca]?.trim().toUpperCase() || '';
          const seccion = iSeccion >= 0 ? (r[iSeccion]?.trim().toUpperCase() || 'GENERAL') : 'GENERAL';
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
        alert(`Matriz marca cargada: ${storeCols.length} centros detectados.`);
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

      // Mapa zona→tipo para validar receptores
      const zonaValida = (tipoClima, zona = '') => {
        const z = zona.toUpperCase();
        if (tipoClima === 'FRIO')  return !z.includes('CALOR') && !z.includes('PLAYA') && !z.includes('TROPICAL');
        if (tipoClima === 'CALOR') return !z.includes('FRIO')  && !z.includes('NIEVE')  && !z.includes('SIERRA');
        if (tipoClima === 'PLAYA') return z.includes('PLAYA')  || z.includes('CALOR');
        return true; // TODO
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
          // Si la zona origen es incompatible con el clima del GOA → es excedente
          if (zonaValida(tipoClima, zonaOrigen)) return;

          // Buscar mejor receptor: zona compatible + mayor venta - menor OH + permiso de marca
          const posiblesReceptores = Object.entries(centros)
            .filter(([c]) => c !== centroOrigen)
            .map(([c, d]) => {
              const seccionMarca  = `${meta.seccion}|${marca}`;
              const tienePermiso  = !brandMatrix[c] || brandMatrix[c].length === 0 || brandMatrix[c].includes(seccionMarca);
              const climaOK       = zonaValida(tipoClima, d.zona || '');
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
            razon:              `${goa} (${tipoClima}) en zona incompatible: ${zonaOrigen}`,
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
  const [corrida,           setCorrida]           = useState('');
  const [centrosSurtidores, setCentrosSurtidores] = useState('');
  const [necesResult,       setNecesResult]       = useState([]);
  const [necesLoading,      setNecesLoading]      = useState(false);

  // Persistencia Tab 2
  useEffect(() => {
    try {
      const s = localStorage.getItem('gop_traslados_nec');
      if (s) {
        const d = JSON.parse(s);
        if (d.chequeraText)       setChequeraText(d.chequeraText);
        if (d.corrida)            setCorrida(d.corrida);
        if (d.centrosSurtidores)  setCentrosSurtidores(d.centrosSurtidores);
        if (d.necesResult?.length) setNecesResult(d.necesResult);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gop_traslados_nec', JSON.stringify({ chequeraText, corrida, centrosSurtidores, necesResult }));
    } catch {}
  }, [chequeraText, corrida, centrosSurtidores, necesResult]);

  // Parsear chequera: Modelo | GOA | Marca | Pzs | Ppto | CentroReceptor
  const parsearChequera = (texto) => {
    const lines = texto.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const sep   = line.includes('|') ? '|' : line.includes('\t') ? '\t' : ',';
      const parts = line.split(sep).map(p => p.trim());
      if (parts.length < 3) return null;
      return {
        modelo:          parts[0] || '',
        goa:             (parts[1] || '').toUpperCase(),
        marca:           (parts[2] || '').toUpperCase(),
        pzsNeed:         num(parts[3] || '0'),
        pptoNeed:        num(parts[4] || '0'),
        centroReceptor:  (parts[5] || 'DESTINO (definir)').trim(),
      };
    }).filter(Boolean);
  };

  // HERRAMIENTA NECESIDAD
  const calcularNecesidad = useCallback(() => {
    if (!chequeraText.trim() || !rawData.length) return;
    setNecesLoading(true);

    setTimeout(() => {
      const chequera       = parsearChequera(chequeraText);
      const corridaTallas  = corrida.split(',').map(t => t.trim()).filter(Boolean);
      const tamCorrida     = corridaTallas.length > 0 ? corridaTallas.length : 1;
      const surtidoresList = centrosSurtidores
        ? centrosSurtidores.split(',').map(c => c.trim()).filter(Boolean)
        : null;

      // Inventario disponible por centro → goa
      const invDisponible = {};
      rawData.forEach(r => {
        if (surtidoresList && !surtidoresList.includes(r.centro)) return;
        if (!invDisponible[r.centro]) invDisponible[r.centro] = {};
        const g = r.goa;
        if (!invDisponible[r.centro][g]) {
          invDisponible[r.centro][g] = {
            oh: 0, vta: 0, precio: r.precio,
            seccion: r.seccion, numSeccion: r.numSeccion,
            sku: r.sku, marca: r.marca, nombre: r.nombre,
          };
        }
        invDisponible[r.centro][g].oh  += r.oh;
        invDisponible[r.centro][g].vta += r.vta;
      });

      // Trabajar sobre una copia mutable del inventario
      const invMutable = JSON.parse(JSON.stringify(invDisponible));
      const resultado  = [];

      chequera.forEach(item => {
        if (!item.goa) return;
        let pzsRestantes = item.pzsNeed || 999999; // si no pone pzs, toma todo lo posible
        let pptoRestante = item.pptoNeed || 0;

        // Ordenar surtidores por mayor OH del GOA
        const surtidores = Object.entries(invMutable)
          .filter(([, data]) => data[item.goa] && data[item.goa].oh > 0)
          .map(([centro, data]) => ({ centro, ...data[item.goa] }))
          .sort((a, b) => b.oh - a.oh);

        surtidores.forEach(surt => {
          if (pzsRestantes <= 0) return;

          const ohDisp       = surt.oh;
          const corridasDisp = Math.floor(ohDisp / tamCorrida);
          // Debe dejar al menos 1 corrida completa en el surtidor
          const corridasMax  = Math.max(0, corridasDisp - 1);
          if (corridasMax <= 0) return;

          const corridasTransf = Math.min(
            Math.ceil(pzsRestantes / tamCorrida),
            corridasMax
          );
          if (corridasTransf <= 0) return;

          const pzsTransf  = corridasTransf * tamCorrida;
          const precioUnit = surt.precio || 0;
          const pptoTransf = pptoRestante > 0
            ? Math.min(pptoRestante, pzsTransf * precioUnit)
            : pzsTransf * precioUnit;

          resultado.push({
            modelo:         item.modelo,
            seccion:        surt.seccion,
            numSeccion:     surt.numSeccion,
            sku:            surt.sku || item.goa,
            marca:          item.marca || surt.marca,
            goa:            item.goa,
            centroSalida:   surt.centro,
            nombreSalida:   surt.nombre || surt.centro,
            centroReceptor: item.centroReceptor,
            pzsDisp:        ohDisp,
            corridasDisp,
            corridasEnv:    corridasTransf,
            pzs:            pzsTransf,
            pesos:          pptoTransf,
            precio:         precioUnit,
            ohQueda:        ohDisp - pzsTransf,
          });

          // Descontar del inventario mutable
          invMutable[surt.centro][item.goa].oh -= pzsTransf;
          pzsRestantes -= pzsTransf;
          if (pptoRestante > 0) pptoRestante -= pptoTransf;
        });
      });

      setNecesResult(resultado);
      setNecesLoading(false);
    }, 300);
  }, [chequeraText, corrida, centrosSurtidores, rawData]);

  const chartDataNec = useMemo(() => {
    if (!necesResult.length) return [];
    const byGoa = {};
    necesResult.forEach(r => {
      if (!byGoa[r.goa]) byGoa[r.goa] = { pzs: 0, pesos: 0 };
      byGoa[r.goa].pzs  += r.pzs;
      byGoa[r.goa].pesos += r.pesos;
    });
    return Object.entries(byGoa).map(([label, v]) => ({ label, value: v.pzs, pesos: v.pesos }));
  }, [necesResult]);

  const exportNecesidad = () => {
    const header = ['Modelo', 'Sección', 'Núm. Sección', 'SKU', 'Marca', 'GOA', 'Centro Salida', 'Centro Receptor', 'Corridas', 'Piezas', 'Importe ($)'];
    const rows = necesResult.map(r => [r.modelo, r.seccion, r.numSeccion, r.sku, r.marca, r.goa, r.centroSalida, r.centroReceptor, r.corridasEnv, r.pzs, r.pesos]);
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
                Matriz clima ✓
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
                    Marca qué GOAs son de temporada y qué clima necesitan. La herramienta solo moverá artículos cuyo GOA esté aquí y cuya zona de centro sea incompatible.
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Chequera */}
              <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                <h3 className={`text-xs font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>
                  Chequera de Necesidad
                </h3>
                <p className={`text-[10px] mb-3 ${t.textMuted}`}>
                  Un modelo por línea: <code className="opacity-60">Modelo | GOA | Marca | Pzs | Ppto | CentroReceptor</code>
                </p>
                <textarea
                  value={chequeraText}
                  onChange={e => setChequeraText(e.target.value)}
                  rows={10}
                  placeholder={"Modelo | GOA | Marca | Pzs | Ppto | CentroReceptor\nMODELO-01 | BOTA | NIKE | 120 | 50000 | 670\nMODELO-02 | CHANCLA | ADIDAS | 60 | 18000 | 522"}
                  className={`w-full text-xs font-mono px-3 py-2 rounded-lg border resize-y ${t.input} focus:outline-none focus:ring-1`}
                />
              </div>

              {/* Config herramienta */}
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${t.textMuted}`}>Parámetros de la Herramienta</h3>

                  <div className="space-y-3">
                    <div>
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>
                        Corrida completa (tallas separadas por coma)
                      </label>
                      <input
                        value={corrida}
                        onChange={e => setCorrida(e.target.value)}
                        placeholder="24, 26, 28, 30  ó  6, 7, 8, 9, 10"
                        className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}
                      />
                      <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                        La herramienta NO sacará mercancía que deje al surtidor sin esta corrida completa
                      </p>
                    </div>

                    <div>
                      <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>
                        Centros surtidores (dejar vacío = todos los del CSV)
                      </label>
                      <input
                        value={centrosSurtidores}
                        onChange={e => setCentrosSurtidores(e.target.value)}
                        placeholder="1001, 1005, 1023"
                        className={`w-full text-xs px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}
                      />
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>Resumen de Necesidad</h3>
                  {necesResult.length > 0 ? (
                    <DonutSummary items={chartDataNec.map(d => ({ label: d.label, value: d.pzs }))} theme={theme} />
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
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Líneas',      val: necesResult.length },
                    { label: 'Corridas',    val: fmt(necesResult.reduce((s, r) => s + r.corridasEnv, 0)) },
                    { label: 'Piezas',      val: fmt(necesResult.reduce((s, r) => s + r.pzs, 0)) },
                    { label: 'Importe',     val: fmtMXN(necesResult.reduce((s, r) => s + r.pesos, 0)) },
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
                          {['Modelo', 'Sección', 'Núm.', 'SKU', 'Marca', 'GOA', 'Centro Salida', 'OH Disp.', 'Corridas', 'Pzs', 'OH Queda', 'Importe'].map(h => (
                            <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-zinc-800/50' : 'divide-gray-100'}`}>
                        {necesResult.map((r, i) => (
                          <tr key={i} className={`text-xs hover:${isDark ? 'bg-zinc-800/30' : 'bg-teal-50/30'} transition-colors`}>
                            <td className={`p-2 font-black ${t.textMain}`}>{r.modelo}</td>
                            <td className={`p-2 ${t.textMuted}`}>{r.seccion}</td>
                            <td className={`p-2 font-mono text-[10px] ${t.textMuted}`}>{r.numSeccion}</td>
                            <td className={`p-2 font-mono ${t.textMain}`}>{r.sku}</td>
                            <td className={`p-2 ${t.textMuted}`}>{r.marca}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${t.badge}`}>{r.goa}</span>
                            </td>
                            <td className={`p-2 font-bold ${t.textMain}`}>{r.nombreSalida} <span className={`text-[9px] font-mono ${t.textMuted}`}>({r.centroSalida})</span></td>
                            <td className={`p-2 font-mono text-amber-400`}>{fmt(r.pzsDisp)}</td>
                            <td className={`p-2 font-black ${t.textAccent1}`}>{r.corridasEnv}</td>
                            <td className={`p-2 font-black ${t.textAccent2}`}>{fmt(r.pzs)}</td>
                            <td className={`p-2 font-mono ${r.ohQueda < (corrida.split(',').length || 1) ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(r.ohQueda)}</td>
                            <td className={`p-2 font-mono text-emerald-400`}>{fmtMXN(r.pesos)}</td>
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
                <p className={`text-xs mt-1 ${t.textMuted}`}>Llena la chequera con los modelos que necesitas trasladar y define la corrida mínima.</p>
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

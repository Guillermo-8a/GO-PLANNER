import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, Package, ShoppingCart, BarChart2, Box, Database, RefreshCw,
  Search, Calendar, Filter, CheckCircle2, AlertCircle, Upload, Download,
  Settings, FileText, Table
} from 'lucide-react';
import { bestForecast } from '../utils/fcstEngine';

// Números de CSV: "1,234.5" → 1234.5 (antes Number('1,234') daba NaN → 0)
const toNum = (v) => parseFloat(String(v ?? '').replace(/[^0-9.-]+/g, '')) || 0;

// --- FUNCIONES MATEMÁTICAS ---
// Lee CSV respetando acentos y ñ: intenta UTF-8 (Sheets/BigQuery) y si no es válido usa Windows-1252 (Excel/SAP)
const decodeCSV = (buf) => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); }
    catch { return new TextDecoder('windows-1252').decode(buf); }
};
// Texto ya roto de origen ("NIÃ‘A" = UTF-8 leído como Latin-1 y vuelto a guardar): se repara
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
const fixMojibake = (v) => {
    if (typeof v !== 'string' || !/[ÃÂ]./.test(v)) return v;
    const bytes = [];
    for (const ch of v) { const c = ch.charCodeAt(0); if (c < 256) bytes.push(c); else if (CP1252[c]) bytes.push(CP1252[c]); else return v; }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); } catch { return v; }
};
const fixRow = (r) => { const o = { ...r }; ['centro', 'seccion', 'marca', 'goa', 'modelo', 'norma', 'sku', 'sku_nombre'].forEach(k => { o[k] = fixMojibake(o[k]); }); return o; };
const normH = (h) => fixMojibake(String(h || '').replace(/^\uFEFF/, '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const isoWeek = (d = new Date()) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };

const calculateRegression = (data) => {
    if (data.length < 2) return { m: 0, b: data[0]?.y || 0, r2: 1 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = data.length;
    data.forEach(p => {
        sumX += p.x; sumY += p.y;
        sumXY += p.x * p.y;
        sumX2 += p.x * p.x;
    });
    const meanX = sumX / n;
    const meanY = sumY / n;
    
    let num = 0, den = 0, totSS = 0, resSS = 0;
    data.forEach(p => {
        num += (p.x - meanX) * (p.y - meanY);
        den += Math.pow(p.x - meanX, 2);
        totSS += Math.pow(p.y - meanY, 2);
    });
    
    const m = den === 0 ? 0 : num / den;
    const b = meanY - m * meanX;
    
    data.forEach(p => {
        const yPred = m * p.x + b;
        resSS += Math.pow(p.y - yPred, 2);
    });
    
    const r2 = totSS === 0 ? 1 : 1 - (resSS / totSS);
    return { m, b, r2 };
};

// --- MEJOR ALGORITMO JITTER PARA EVITAR PATRONES DE LÍNEAS (NUBE ORGÁNICA) ---
const pseudoRandom = (seed, salt) => {
    // Función hash determinista más caótica para evitar "banding" (líneas)
    let x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453123;
    return x - Math.floor(x);
};
const getJitterX = (seed) => (pseudoRandom(seed, 1) - 0.5) * 22; // Dispersión de 22px
const getJitterY = (seed) => (pseudoRandom(seed, 2) - 0.5) * 22;

export default function App() {
    const [data, setData] = useState([]);
    const [sheetUrl, setSheetUrl] = useState('');
    
    // ESTADOS DE FILTROS
    const [filterCentro, setFilterCentro] = useState('');
    const [filterSeccion, setFilterSeccion] = useState('');
    const [filterMarca, setFilterMarca] = useState('');
    const [filterGoa, setFilterGoa] = useState('');
    const [filterModelo, setFilterModelo] = useState('');
    const [filterNorma, setFilterNorma] = useState('');
    const [filterSku, setFilterSku] = useState('');
    
    // ORDENAMIENTO
    const [sortBy, setSortBy] = useState('toBuy_desc');
    
    // DEFAULT A MES ACTUAL + 2
    const currentMonth = new Date().getMonth() + 1;
    const [periodStart, setPeriodStart] = useState(currentMonth);
    const [periodEnd, setPeriodEnd] = useState(currentMonth + 2);

    // VARIABLES DE ALGORITMO
    const [calcMode, setCalcMode] = useState('TDM'); 
    const [maxGrowth, setMaxGrowth] = useState(50);
    const [maxDecline, setMaxDecline] = useState(30);
    // Pedido RA: cubre lead time logístico + días de inventario objetivo (WOS) a ritmo de la demanda pronosticada.
    // El forecast del rango solo da el ritmo diario; ya no se compra todo el rango.
    const [leadDias, setLeadDias] = useState(15);
    const [wosDias, setWosDias] = useState(45);
    const [safetyDias, setSafetyDias] = useState(0);
    // Ajustes por cluster de tienda: { A: { lead, wos, seg, min }, ... } (campo vacío = usa el general)
    const [clusterCfg, setClusterCfg] = useState(() => { try { return JSON.parse(localStorage.getItem('gop_resurtido_cluster') || '{}'); } catch { return {}; } });
    const [showCluster, setShowCluster] = useState(false);
    const [tablaLimite, setTablaLimite] = useState(300);
    useEffect(() => { try { localStorage.setItem('gop_resurtido_cluster', JSON.stringify(clusterCfg)); } catch {} }, [clusterCfg]);
    
    const [selectedItem, setSelectedItem] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);
    const [error, setError] = useState('');
    const [colAviso, setColAviso] = useState('');

    // Parseador de CSV
    const sepRef = { current: ',' };
    const splitCSVLine = (text) => {
        let result = [];
        let inQuotes = false;
        let start = 0;
        const sep = sepRef.current;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '"') inQuotes = !inQuotes;
            else if (text[i] === sep && !inQuotes) {
                result.push(text.slice(start, i).replace(/^"|"$/g, '').replace(/""/g, '"').trim());
                start = i + 1;
            }
        }
        result.push(text.slice(start).replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        return result;
    };

    const parseCSV = (str) => {
        const lines = str.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
        if(lines.length === 0) return { rawData: [], isHeaderRow: false };
        // Separador: el que más aparezca en el encabezado (coma, punto y coma o tabulador)
        const cnt = (c) => lines[0].split(c).length;
        sepRef.current = [',', ';', '\t'].sort((a, b) => cnt(b) - cnt(a))[0];

        const firstLineCols = splitCSVLine(lines[0]).map(normH);
        
        // Se agregaron meccion, vta acum y tend1 para detección robusta del header
        const isHeaderRow = firstLineCols.some(col => 
            ['centro', 'tienda', 'seccion', 'meccion', 'marca', 'proveedor', 'goa', 'modelo', 'sku', 'nombre', 'articulo', 'artículo', 'norma', 'oh', 'oo', 'm1_a1', 's1_a1', 'venta', 'vta acum', 'tend1'].includes(col)
        );
        
        if (isHeaderRow) {
            const headers = firstLineCols;
            return {
                isHeaderRow: true,
                rawData: lines.slice(1).map(line => {
                    const values = splitCSVLine(line);
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = values[index] !== undefined ? values[index] : '';
                    });
                    return obj;
                })
            };
        } else {
            return {
                isHeaderRow: false,
                rawData: lines.map(line => {
                    const values = splitCSVLine(line);
                    return {
                        centro: values[0] || '',
                        seccion: values[1] || '',
                        goa: values[2] || '',
                        norma: values[3] || '',
                        sku: values[4] || '',
                        m1_a1: values[5] || '0', 
                        m1_a2: values[6] || '0', 
                        oh: values[7] || '0',     
                        oo: values[8] || '0',     
                    };
                })
            };
        }
    };

    const processCSVData = (csvText) => {
        try {
            const { rawData, isHeaderRow } = parseCSV(csvText);

            // La columna que corresponde a cada lista de nombres se resuelve una sola vez (antes, por cada fila)
            const colCache = {};
            const headersAll = Object.keys(rawData[0] || {});
            const findCol = (row, possibleNames) => {
                const ck = possibleNames.join('|');
                if (!(ck in colCache)) colCache[ck] = headersAll.find(k => possibleNames.some(pn => k === pn || k.includes(pn))) ?? null;
                return colCache[ck] ? row[colCache[ck]] : undefined;
            }

            const processedData = rawData.map((row, index) => {
                const monthlySales = [];
                let sumTotalY2 = 0; 
                
                for (let p = 1; p <= 52; p++) {
                    const val1 = row[`m${p}_a1`] ?? row[`mes${p}_a1`] ?? row[`s${p}_a1`]; 
                    const val2 = row[`m${p}_a2`] ?? row[`mes${p}_a2`] ?? row[`s${p}_a2`]; 
                    
                    if (val1 !== undefined || val2 !== undefined) {
                        const y1 = toNum(val1);
                        const y2 = toNum(val2);
                        monthlySales.push({
                            period: p,
                            y1: y1,
                            y2: y2
                        });
                        sumTotalY2 += y2;
                    }
                }

                if (monthlySales.length === 0 && isHeaderRow) {
                    const v1 = findCol(row, ['venta', 'vta', 'año 1', 'ant']);
                    const v2 = findCol(row, ['año 2', 'act', 'año2']);
                    if (v1 !== undefined || v2 !== undefined) {
                        const y1 = toNum(v1);
                        const y2 = toNum(v2);
                        monthlySales.push({ period: 1, y1: y1, y2: y2 });
                        sumTotalY2 += y2;
                    }
                }
                
                // LÓGICA CORREGIDA PARA VTA ACUM: Toma estrictamente la columna de tu CSV
                const vtaAcumCol = findCol(row, ['vta acum', 'vta_acumulada_act', 'vta act']);
                const vtaAcumAct = (vtaAcumCol !== undefined && vtaAcumCol !== '') ? toNum(vtaAcumCol) : sumTotalY2;

                // LÓGICA PARA EXTRAER COLUMNAS tend1, tend2, tend3 SI EXISTEN
                const tend1Val = findCol(row, ['tend1']);
                const tend2Val = findCol(row, ['tend2']);
                const tend3Val = findCol(row, ['tend3']);

                return {
                    id: index + 1,
                    centro: row.centro || (isHeaderRow && findCol(row, ['centro', 'tienda', 'sucursal'])) || 'Sin Centro',
                    centro_num: row.centro_num || (isHeaderRow && findCol(row, ['centro_num', 'id_centro', 'num_centro', 'nodo'])) || '',
                    seccion: row.seccion || (isHeaderRow && findCol(row, ['seccion', 'sección', 'meccion', 'dpto'])) || 'Sin Sección',
                    marca: row.marca || (isHeaderRow && findCol(row, ['marca', 'proveedor', 'vendor'])) || 'Sin Marca',
                    goa: row.goa || (isHeaderRow && findCol(row, ['goa', 'familia', 'subfamilia'])) || 'Sin GOA',
                    modelo: row.modelo || (isHeaderRow && findCol(row, ['modelo', 'estilo', 'generico', 'style'])) || 'Sin Modelo',
                    norma: row.norma || (isHeaderRow && findCol(row, ['norma', 'resurtido', 'tipo'])) || 'Sin Norma',
                    cluster: String(row.cluster || (isHeaderRow && findCol(row, ['cluster', 'clasificacion tienda', 'clase tienda'])) || '').trim().toUpperCase(),
                    sku: row.sku || (isHeaderRow && findCol(row, ['sku', 'articulo', 'material', 'item', 'upc', 'ean', 'codigo'])) || `SKU-${index}`,
                    sku_nombre: row.sku_nombre || (isHeaderRow && findCol(row, ['sku_nombre', 'nombre', 'descripcion', 'desc', 'texto breve'])) || 'Sin Nombre',
                    oh: toNum(row.oh || (isHeaderRow && findCol(row, ['oh', 'inv', 'físico', 'stock']))),
                    oo: toNum(row.oo || (isHeaderRow && findCol(row, ['oo', 'transito', 'tránsito', 'pedido']))),
                    vtaAcumAct: vtaAcumAct,
                    tend1: tend1Val !== undefined && tend1Val !== '' ? toNum(tend1Val) : null,
                    tend2: tend2Val !== undefined && tend2Val !== '' ? toNum(tend2Val) : null,
                    tend3: tend3Val !== undefined && tend3Val !== '' ? toNum(tend3Val) : null,
                    monthlySales: monthlySales.length > 0 ? monthlySales : [{period: 1, y1: 0, y2: 0}]
                };
            });

            let maxPeriod = 1;
            if (processedData.length > 0) {
                maxPeriod = Math.max(...processedData.map(d => Math.max(...d.monthlySales.map(ms => ms.period), 1)));
            }

            // Horizonte por default = 26 semanas desde el periodo actual (mensual ≈ 6 meses). Puede cruzar de año.
            if (maxPeriod <= 1) {
                 setPeriodStart(1);
                 setPeriodEnd(1);
            } else if (maxPeriod <= 12) {
                 setPeriodStart(currentMonth);
                 setPeriodEnd(currentMonth + 5);
            } else {
                 const w = Math.min(isoWeek(), maxPeriod);
                 setPeriodStart(w);
                 setPeriodEnd(w + 25);
            }

            const fixed = processedData.map(fixRow);
            const faltan = [];
            if (fixed.every(r => r.modelo === 'Sin Modelo')) faltan.push('MODELO');
            if (fixed.every(r => /^SKU-\d+$/.test(r.sku))) faltan.push('SKU');
            if (fixed.every(r => r.sku_nombre === 'Sin Nombre')) faltan.push('NOMBRE');
            setColAviso(faltan.length ? `No encontré columna de ${faltan.join(', ')} en tu CSV. Encabezados que leí: ${Object.keys(rawData[0] || {}).join(' · ')}` : '');
            setData(fixed);
            setIsSyncing(false);
            setSyncSuccess(true);
            setTimeout(() => setSyncSuccess(false), 3000);

        } catch (err) {
            console.error(err);
            setError('Error al procesar el archivo CSV. Verifica el formato.');
            setIsSyncing(false);
        }
    };

    // ── Persistencia localStorage ─────────────────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem('gop_resurtido');
            if (saved) {
                const d = JSON.parse(saved);
                if (d.sheetUrl)     setSheetUrl(d.sheetUrl);
                if (d.calcMode)     setCalcMode(d.calcMode);
                if (d.maxGrowth)    setMaxGrowth(d.maxGrowth);
                if (d.maxDecline)   setMaxDecline(d.maxDecline);
                if (d.leadDias != null) setLeadDias(d.leadDias);
                if (d.wosDias != null) setWosDias(d.wosDias);
                if (d.safetyDias != null) setSafetyDias(d.safetyDias);
                if (d.periodStart)  setPeriodStart(d.periodStart);
                if (d.periodEnd)    setPeriodEnd(d.periodEnd);
                if (d.data?.length) setData(d.data.map(fixRow)); // repara acentos de datos guardados antes del arreglo
                if (d.filterCentro)  setFilterCentro(d.filterCentro);
                if (d.filterSeccion) setFilterSeccion(d.filterSeccion);
                if (d.filterMarca)   setFilterMarca(d.filterMarca);
                if (d.filterGoa)     setFilterGoa(d.filterGoa);
                if (d.filterModelo)  setFilterModelo(d.filterModelo);
                if (d.filterNorma)   setFilterNorma(d.filterNorma);
            }
        } catch {}
    }, []);

    // Guardado diferido (antes serializaba toda la base en cada clic de filtro y congelaba la página)
    useEffect(() => {
        if (!data.length) return; // No guardar estado vacío
        const tm = setTimeout(() => { try {
            const json = JSON.stringify({
                sheetUrl, calcMode, maxGrowth, maxDecline, leadDias, wosDias, safetyDias,
                periodStart, periodEnd, data,
                filterCentro, filterSeccion, filterMarca,
                filterGoa, filterModelo, filterNorma,
            });
            if (json.length < 4_500_000) localStorage.setItem('gop_resurtido', json);
            else localStorage.setItem('gop_resurtido', JSON.stringify({ sheetUrl, calcMode, maxGrowth, maxDecline, leadDias, wosDias, safetyDias, periodStart, periodEnd })); // base muy grande: solo config
        } catch {} }, 800);
        return () => clearTimeout(tm);
    }, [sheetUrl, calcMode, maxGrowth, maxDecline, leadDias, wosDias, safetyDias, periodStart, periodEnd, data,
        filterCentro, filterSeccion, filterMarca, filterGoa, filterModelo, filterNorma]);
    // ─────────────────────────────────────────────────────────────────

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsSyncing(true);
        setError('');
        setSyncSuccess(false);
        const reader = new FileReader();
        reader.onload = (evt) => {
            processCSVData(decodeCSV(evt.target.result));
            e.target.value = null;
        };
        reader.onerror = () => {
            setError("Error al leer el archivo local.");
            setIsSyncing(false);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSync = async () => {
        if (!sheetUrl) return setError('Por favor ingresa la URL.');
        setIsSyncing(true); setError(''); setSyncSuccess(false);
        try {
            const response = await fetch(sheetUrl);
            if (!response.ok) throw new Error('No se pudo acceder al archivo.');
            const csvText = await response.text();
            processCSVData(csvText);
        } catch (err) {
            setError(err.message); setIsSyncing(false);
        }
    };

    // BASE DE DATOS PRE-FILTROS DE UI
    // Periodos del ciclo (12 mensual / 52 semanal) y ventana de pronóstico con cruce de año
    const nPer = useMemo(() => data.reduce((mx, d) => d.monthlySales.reduce((a, m) => Math.max(a, m.period), mx), 1), [data]);
    // Etiqueta legible del periodo: mensual "Nov-26"; semanal "S45-26". wrapped = ya es del año siguiente
    const perLabel = (period, wrapped) => {
        const yy = String((new Date().getFullYear() + (wrapped ? 1 : 0)) % 100).padStart(2, '0');
        return nPer <= 12 ? `${MESES_C[(period - 1) % 12]}-${yy}` : `S${period}-${yy}`;
    };
    const rangoTxt = useMemo(() => {
        const n = periodEnd - periodStart + 1;
        const a = perLabel(((periodStart - 1) % nPer) + 1, periodStart > nPer), b = perLabel(((periodEnd - 1) % nPer) + 1, periodEnd > nPer);
        return `${a} a ${b} · ${n} ${nPer <= 12 ? (n === 1 ? 'mes' : 'meses') : 'semanas'}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodStart, periodEnd, nPer]);
    const windowPeriods = useMemo(() => {
        const out = [];
        for (let i = periodStart; i <= periodEnd; i++) out.push({ p: ((i - 1) % nPer) + 1, wrapped: i > nPer });
        return out;
    }, [periodStart, periodEnd, nPer]);

    // Top-Down con modelo: pronóstico por GOA con el mejor motor (SES/Holt/Holt-Winters/Estacional, backtest)
    // sobre la serie LY + meses cerrados de este año. Se hace a nivel GOA porque la serie SKU×tienda es muy rala.
    const goaFcst = useMemo(() => {
        if (calcMode !== 'TDM' || !data.length) return {};
        const curM = new Date().getMonth() + 1;
        // Periodo en curso (incompleto): mensual = mes actual; semanal = siguiente al último con venta de este año
        let cur = curM;
        if (nPer > 12) { cur = 1; data.forEach(r => r.monthlySales.forEach(m => { if (m.y2 > 0 && m.period + 1 > cur) cur = m.period + 1; })); }
        const agg = {};
        data.forEach(r => {
            if (!agg[r.goa]) agg[r.goa] = { y1: Array(nPer + 1).fill(0), y2: Array(nPer + 1).fill(0) };
            r.monthlySales.forEach(m => { agg[r.goa].y1[m.period] += m.y1; agg[r.goa].y2[m.period] += m.y2; });
        });
        const absOf = w => (w.wrapped ? nPer : 0) + w.p;
        const H = Math.max(1, ...windowPeriods.map(w => absOf(w) - cur + 1));
        const out = {};
        Object.entries(agg).forEach(([goa, a]) => {
            const serie = [...a.y1.slice(1), ...a.y2.slice(1, cur)];
            const f = bestForecast(serie, H, nPer);
            const perPeriod = windowPeriods.map(w => { const k = absOf(w) - cur; return k >= 0 ? f.future[k] || 0 : a.y2[w.p]; });
            out[goa] = { total: perPeriod.reduce((x, y) => x + y, 0), model: f.model, acc: f.accuracy };
        });
        return out;
    }, [calcMode, data, nPer, windowPeriods]);

    const computedData = useMemo(() => {
        if (!data || data.length === 0) return [];
        const currentMonthNow = new Date().getMonth() + 1;
        // Base por periodo. Mensual: mes ya cerrado este año o del año siguiente → venta de este año (y2);
        // mes actual/futuro → mismo mes del año anterior (y1). Antes el mes en curso usaba la venta parcial de y2
        // y el pronóstico salía muy bajo. Semanal: regla anterior (y2 si hay, si no y1).
        const winCache = new Map(); // se calcula una vez por fila (antes 3 veces, con búsqueda lineal por periodo)
        const winOf = (row) => {
            if (winCache.has(row)) return winCache.get(row);
            const byP = {}; row.monthlySales.forEach(x => { byP[x.period] = x; });
            const rel = windowPeriods.map(w => {
                const m = byP[w.p];
                return { period: w.p, y1: m?.y1 || 0, y2: m?.y2 || 0, wrapped: w.wrapped };
            });
            const sumY1 = rel.reduce((a, r) => a + r.y1, 0), sumY2 = rel.reduce((a, r) => a + r.y2, 0);
            rel.forEach(r => {
                if (nPer <= 12) r.b = (r.wrapped || r.period < currentMonthNow) ? r.y2 : r.y1;
                else r.b = sumY2 > 0 ? r.y2 : r.y1;
            });
            if (rel.every(r => !r.b)) rel.forEach(r => { r.b = r.y2 || r.y1; }); // SKU sin historia en el año elegido
            const out = { rel, sumY1, sumY2, base: rel.reduce((a, r) => a + r.b, 0) };
            winCache.set(row, out);
            return out;
        };
        
        const goaAgg = {};
        const gcAgg = {};
        const centroSalesMap = {};

        const currentM = new Date().getMonth() + 1;
        // Obtenemos los últimos 3 meses naturales anteriores al actual (Ej. Si estamos en Abril 4, usamos 1, 2, 3)
        let actualRecentPeriods = [currentM - 3, currentM - 2, currentM - 1].filter(m => m > 0);
        if (actualRecentPeriods.length === 0) actualRecentPeriods = [1];

        data.forEach(row => {
            centroSalesMap[row.centro] = (centroSalesMap[row.centro] || 0) + winOf(row).base;
        });
        
        const sortedCentros = Object.entries(centroSalesMap).sort((a, b) => b[1] - a[1]).map(e => e[0]);
        const top15Centros = new Set(sortedCentros.slice(0, 15));
        // Cluster de tienda: columna CLUSTER del CSV; si no viene, A/B/C por venta (top 20% / siguiente 30% / resto)
        const autoCl = {}; sortedCentros.forEach((c, i) => { const q = i / Math.max(1, sortedCentros.length); autoCl[c] = q < 0.2 ? 'A' : q < 0.5 ? 'B' : 'C'; });
        const clusterOf = (row) => row.cluster || autoCl[row.centro] || 'C';

        if (calcMode === 'TD' || calcMode === 'TDM') {
            data.forEach(row => {
                const base = winOf(row).base;

                // Extraer venta reciente histórica para sacar tendencia real (Últimos 3 meses vs Año anterior)
                let sumY1_recent = 0;
                let sumY2_recent = 0;
                row.monthlySales.forEach(m => {
                    if (actualRecentPeriods.includes(m.period)) {
                        sumY1_recent += m.y1;
                        sumY2_recent += m.y2;
                    }
                });

                // Si existen las columnas tend1, tend2, tend3 dadas por el usuario, las usa como la Venta Reciente Real Y2
                if (row.tend1 !== null || row.tend2 !== null || row.tend3 !== null) {
                    sumY2_recent = (row.tend1 || 0) + (row.tend2 || 0) + (row.tend3 || 0);
                }
                
                if (!goaAgg[row.goa]) goaAgg[row.goa] = { sumY1_recent: 0, sumY2_recent: 0, baseSales: 0, forecast: 0, rawTrend: 0, cappedTrend: 0 };
                goaAgg[row.goa].sumY1_recent += sumY1_recent;
                goaAgg[row.goa].sumY2_recent += sumY2_recent;

                const gcKey = `${row.goa}|${row.centro}`;
                if (!gcAgg[gcKey]) gcAgg[gcKey] = { baseSales: 0 };
                
                goaAgg[row.goa].baseSales += base;
                gcAgg[gcKey].baseSales += base;
            });

            const goaKeyOf = g => g.__goa;
            Object.entries(goaAgg).forEach(([k, g]) => { g.__goa = k; });
            Object.values(goaAgg).forEach(g => {
                if (g.sumY1_recent > 0) {
                    g.rawTrend = ((g.sumY2_recent - g.sumY1_recent) / g.sumY1_recent) * 100;
                } else if (g.sumY2_recent > 0) {
                    g.rawTrend = maxGrowth;
                } else {
                    g.rawTrend = 0;
                }
                g.cappedTrend = Math.min(Math.max(g.rawTrend, -maxDecline), maxGrowth);
                g.forecast = g.baseSales * (1 + (g.cappedTrend / 100));
                if (calcMode === 'TDM' && goaFcst[goaKeyOf(g)]) {
                    const m = goaFcst[goaKeyOf(g)];
                    g.forecast = m.total; g.model = m.model; g.acc = m.acc;
                    g.rawTrend = g.cappedTrend = g.baseSales > 0 ? (m.total / g.baseSales - 1) * 100 : 0;
                }
            });
        }

        return data.map(row => {
            const W = winOf(row);
            const relevantPeriods = W.rel, sumY1_base = W.sumY1, sumY2_base = W.sumY2;

            let sumY1_recent = 0;
            let sumY2_recent = 0;
            row.monthlySales.forEach(m => {
                if (actualRecentPeriods.includes(m.period)) {
                    sumY1_recent += m.y1;
                    sumY2_recent += m.y2;
                }
            });

            if (row.tend1 !== null || row.tend2 !== null || row.tend3 !== null) {
                sumY2_recent = (row.tend1 || 0) + (row.tend2 || 0) + (row.tend3 || 0);
            }

            let baseSales = W.base;
            let rawTrend = 0;
            let cappedTrend = 0;
            let forecast = 0;

            if (calcMode === 'TD' || calcMode === 'TDM') {
                const g = goaAgg[row.goa];
                const gc = gcAgg[`${row.goa}|${row.centro}`];

                const gcContrib = g.baseSales > 0 ? (gc.baseSales / g.baseSales) : 0;
                const forecastGC = g.forecast * gcContrib;
                const skuContrib = gc.baseSales > 0 ? (baseSales / gc.baseSales) : 0;
                
                forecast = Math.round(forecastGC * skuContrib);
                rawTrend = g.rawTrend;
                cappedTrend = g.cappedTrend;

            } else {
                if (sumY1_recent > 0) {
                    rawTrend = ((sumY2_recent - sumY1_recent) / sumY1_recent) * 100;
                } else if (sumY2_recent > 0) {
                    rawTrend = maxGrowth;
                }
                cappedTrend = Math.min(Math.max(rawTrend, -maxDecline), maxGrowth);
                forecast = Math.round(baseSales * (1 + (cappedTrend / 100)));
            }
            
            const totalInventory = row.oh + row.oo;
            
            const isTop15 = top15Centros.has(row.centro);
            const minStockRule = isTop15 ? 2 : 1;
            // Demanda diaria = forecast del rango ÷ días del rango. Objetivo = demanda × (lead time + WOS + seguridad).
            const diasRango = windowPeriods.length * (nPer <= 12 ? 30.44 : 7);
            const demandaDia = forecast / Math.max(1, diasRango);
            // Parámetros por cluster (editables); vacío = el general
            const cl = clusterOf(row), cc = clusterCfg[cl] || {};
            const lead = cc.lead ?? leadDias, wos = cc.wos ?? wosDias, seg = cc.seg ?? safetyDias, minPz = cc.min ?? minStockRule;
            const demCob = demandaDia * (lead + wos); // lo que se vende mientras llega + lo que debe quedar
            const targetTotalInventory = Math.max(Math.ceil(demCob + demandaDia * seg), forecast > 0 ? minPz : 0);
            const toBuy = Math.max(0, targetTotalInventory - totalInventory);
            // Cobertura en días de inventario actual (OH+OO) al ritmo pronosticado
            const coverage = demandaDia > 0 ? totalInventory / demandaDia : (totalInventory > 0 ? 999 : 0);

            const activeYears = (sumY1_base > 0 ? 1 : 0) + (sumY2_base > 0 ? 1 : 0);

            const periodsWithFcst = relevantPeriods.map(p => {
                let pBase = 0;
                if (calcMode === 'RA' || calcMode === 'TD' || calcMode === 'TDM') {
                    pBase = p.b;
                } else {
                    pBase = activeYears > 0 ? ((sumY1_base > 0 ? p.y1 : 0) + (sumY2_base > 0 ? p.y2 : 0)) / activeYears : 0;
                }
                return { ...p, rawBase: pBase };
            });

            const sumRawBase = periodsWithFcst.reduce((sum, p) => sum + p.rawBase, 0);
            periodsWithFcst.forEach(p => {
                p.fcst = sumRawBase > 0 ? (p.rawBase / sumRawBase) * forecast : 0;
            });

            return {
                ...row,
                baseSales,
                rawTrend,
                cappedTrend,
                forecast,
                totalInventory,
                toBuy,
                coverage,
                demandaDia,
                demCob,
                clusterTienda: cl,
                diasObj: lead + wos,
                relevantPeriods: periodsWithFcst
            };
        });
    }, [data, windowPeriods, nPer, calcMode, maxGrowth, maxDecline, leadDias, wosDias, safetyDias, goaFcst, clusterCfg]);

    // Resumen por cluster de tienda (para el panel editable)
    const clusterResumen = useMemo(() => {
        const m = {};
        computedData.forEach(r => {
            const c = r.clusterTienda; if (!m[c]) m[c] = { tiendas: new Set(), compra: 0, fcst: 0 };
            m[c].tiendas.add(r.centro); m[c].compra += r.toBuy; m[c].fcst += r.forecast;
        });
        return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => ({ c, tiendas: v.tiendas.size, compra: v.compra, fcst: v.fcst }));
    }, [computedData]);
    const hayClusterCSV = useMemo(() => data.some(r => r.cluster), [data]);

    // LISTAS DE OPCIONES PARA FILTROS
    const optionsCentros = useMemo(() => [...new Set(computedData.map(d => d.centro))].sort(), [computedData]);
    const optionsSecciones = useMemo(() => {
        let filtered = computedData;
        if (filterCentro) filtered = filtered.filter(d => d.centro === filterCentro);
        return [...new Set(filtered.map(d => d.seccion))].sort();
    }, [computedData, filterCentro]);
    const optionsMarcas = useMemo(() => {
        let filtered = computedData;
        if (filterCentro) filtered = filtered.filter(d => d.centro === filterCentro);
        if (filterSeccion) filtered = filtered.filter(d => d.seccion === filterSeccion);
        return [...new Set(filtered.map(d => d.marca))].sort();
    }, [computedData, filterCentro, filterSeccion]);
    const optionsGoas = useMemo(() => {
        let filtered = computedData;
        if (filterCentro) filtered = filtered.filter(d => d.centro === filterCentro);
        if (filterSeccion) filtered = filtered.filter(d => d.seccion === filterSeccion);
        if (filterMarca) filtered = filtered.filter(d => d.marca === filterMarca);
        return [...new Set(filtered.map(d => d.goa))].sort();
    }, [computedData, filterCentro, filterSeccion, filterMarca]);
    const optionsModelos = useMemo(() => {
        let filtered = computedData;
        if (filterCentro) filtered = filtered.filter(d => d.centro === filterCentro);
        if (filterSeccion) filtered = filtered.filter(d => d.seccion === filterSeccion);
        if (filterMarca) filtered = filtered.filter(d => d.marca === filterMarca);
        if (filterGoa) filtered = filtered.filter(d => d.goa === filterGoa);
        return [...new Set(filtered.map(d => d.modelo))].sort();
    }, [computedData, filterCentro, filterSeccion, filterMarca, filterGoa]);
    const optionsNormas = useMemo(() => {
        let filtered = computedData;
        if (filterCentro) filtered = filtered.filter(d => d.centro === filterCentro);
        if (filterSeccion) filtered = filtered.filter(d => d.seccion === filterSeccion);
        if (filterMarca) filtered = filtered.filter(d => d.marca === filterMarca);
        if (filterGoa) filtered = filtered.filter(d => d.goa === filterGoa);
        if (filterModelo) filtered = filtered.filter(d => d.modelo === filterModelo);
        return [...new Set(filtered.map(d => d.norma))].sort();
    }, [computedData, filterCentro, filterSeccion, filterMarca, filterGoa, filterModelo]);
    const optionsSkus = useMemo(() => {
        let filtered = computedData;
        if (filterCentro) filtered = filtered.filter(d => d.centro === filterCentro);
        if (filterSeccion) filtered = filtered.filter(d => d.seccion === filterSeccion);
        if (filterMarca) filtered = filtered.filter(d => d.marca === filterMarca);
        if (filterGoa) filtered = filtered.filter(d => d.goa === filterGoa);
        if (filterModelo) filtered = filtered.filter(d => d.modelo === filterModelo);
        if (filterNorma) filtered = filtered.filter(d => d.norma === filterNorma);
        return [...new Set(filtered.map(d => d.sku))].sort();
    }, [computedData, filterCentro, filterSeccion, filterMarca, filterGoa, filterModelo, filterNorma]);

    // APLICACIÓN DE FILTROS EN TABLA CON ORDENAMIENTO
    const enrichedData = useMemo(() => {
        let result = computedData;
        if (filterCentro) result = result.filter(d => d.centro === filterCentro);
        if (filterSeccion) result = result.filter(d => d.seccion === filterSeccion);
        if (filterMarca) result = result.filter(d => d.marca === filterMarca);
        if (filterGoa) result = result.filter(d => d.goa === filterGoa);
        if (filterModelo) result = result.filter(d => d.modelo === filterModelo);
        if (filterNorma) result = result.filter(d => d.norma === filterNorma);
        if (filterSku) result = result.filter(d => d.sku === filterSku);
        
        return [...result].sort((a, b) => {
            if (sortBy === 'toBuy_desc') return b.toBuy - a.toBuy;
            if (sortBy === 'toBuy_asc') return a.toBuy - b.toBuy;
            // Ordena por la suma real del inventario OH + OO
            if (sortBy === 'oh_desc') return (b.oh + b.oo) - (a.oh + a.oo);
            if (sortBy === 'oh_asc') return (a.oh + a.oo) - (b.oh + b.oo);
            // Ordena por el forecast
            if (sortBy === 'fcst_desc') return b.forecast - a.forecast;
            if (sortBy === 'fcst_asc') return a.forecast - b.forecast;
            return b.toBuy - a.toBuy;
        });
    }, [computedData, filterCentro, filterSeccion, filterMarca, filterGoa, filterModelo, filterNorma, filterSku, sortBy]);

    // INSIGHTS (TARJETAS DE RESUMEN)
    const insights = useMemo(() => {
        let beforeZeroes = 0;
        let afterZeroes = 0;
        const skuScores = {};
        const sizeScores = {};

        enrichedData.forEach(row => {
            // Contabilizar stockouts antes y después
            if (row.oh + row.oo === 0) beforeZeroes++;
            if (row.oh + row.oo + row.toBuy === 0) afterZeroes++;

            // Sumar forecast por SKU para encontrar la "mejor apuesta"
            if (!skuScores[row.sku_nombre]) skuScores[row.sku_nombre] = 0;
            skuScores[row.sku_nombre] += row.forecast;

            // Intentar extraer la talla del nombre (asume que la talla está después de la primer coma)
            let size = "N/A";
            const parts = row.sku_nombre.split(',');
            if (parts.length > 1) {
                const potentialSize = parts[1].trim();
                // Verifica si lo que está después de la coma es un número o un número con decimal (ej. "25" o "25.5")
                if (/^\d+(\.\d+)?$/.test(potentialSize)) {
                    size = potentialSize;
                }
            }
            // Fallback si no había coma o no encontró el número exacto, buscar cualquier número suelto de 2 dígitos.
            if (size === "N/A") {
                const match = row.sku_nombre.match(/(?:^|\s)(\d{2}(\.5)?)(\s|,|$)/);
                if (match) size = match[1];
            }

            if (size !== "N/A") {
                if (!sizeScores[size]) sizeScores[size] = 0;
                sizeScores[size] += row.forecast;
            }
        });

        // Ordenar para encontrar a los mejores
        const bestSku = Object.entries(skuScores).sort((a, b) => b[1] - a[1])[0] || ["Ninguno", 0];
        const sortedSizes = Object.entries(sizeScores).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxSizeScore = sortedSizes.length > 0 ? sortedSizes[0][1] : 1;
        const topSizes = sortedSizes.map(s => ({ size: s[0], score: s[1], percent: (s[1] / maxSizeScore) * 100 }));

        return { beforeZeroes, afterZeroes, bestSku: bestSku[0], topSizes };
    }, [enrichedData]);

    // ITEM GLOBAL PARA GRÁFICAS CUANDO NO HAY SELECCIÓN
    const globalAggregatedItem = useMemo(() => {
        if (enrichedData.length === 0) return null;
        const agg = {
            centro: filterCentro || 'TODOS LOS CENTROS',
            marca: filterMarca || 'FILTROS ACTUALES',
            sku_nombre: 'Resumen Acumulado (Global)',
            sku: 'Múltiples',
            toBuy: 0,
            oh: 0,
            oo: 0,
            relevantPeriods: []
        };
        const periodMap = {};
        enrichedData.forEach(row => {
            agg.toBuy += row.toBuy;
            agg.oh += row.oh;
            agg.oo += row.oo;
            row.relevantPeriods.forEach(p => {
                if (!periodMap[p.period]) periodMap[p.period] = { period: p.period, wrapped: p.wrapped, y1: 0, y2: 0, fcst: 0 };
                periodMap[p.period].y1 += p.y1;
                periodMap[p.period].y2 += p.y2;
                periodMap[p.period].fcst += p.fcst;
            });
        });
        // Orden del rango (Oct, Nov, Dic, Ene…), no por número de periodo (antes Ene salía antes que Oct)
        const orden = Object.fromEntries(windowPeriods.map((w, i) => [w.p, i]));
        agg.relevantPeriods = Object.values(periodMap).sort((a,b) => (orden[a.period] ?? a.period) - (orden[b.period] ?? b.period));
        return agg;
    }, [enrichedData, filterCentro, filterMarca, windowPeriods]);

    // Item Activo para las gráficas
    const activeItem = selectedItem || globalAggregatedItem;

    const kpis = useMemo(() => {
        return enrichedData.reduce((acc, curr) => ({
            toBuy: acc.toBuy + curr.toBuy,
            oh: acc.oh + curr.oh,
            oo: acc.oo + curr.oo,
            forecast: acc.forecast + curr.forecast
        }), { toBuy: 0, oh: 0, oo: 0, forecast: 0 });
    }, [enrichedData]);

    const skuPeriodSummary = useMemo(() => {
        const summary = {};
        enrichedData.forEach(row => {
            if (row.toBuy > 0) {
                if (!summary[row.sku]) {
                    summary[row.sku] = {
                        sku: row.sku,
                        nombre: row.sku_nombre,
                        marca: row.marca, 
                        totalComprar: 0,
                        periods: {}
                    };
                }
                summary[row.sku].totalComprar += row.toBuy;
                row.relevantPeriods.forEach(p => {
                    summary[row.sku].periods[p.period] = (summary[row.sku].periods[p.period] || 0) + p.fcst;
                });
            }
        });
        return Object.values(summary).sort((a, b) => b.totalComprar - a.totalComprar);
    }, [enrichedData]);

    const periodColumnsArray = useMemo(() => {
        return windowPeriods.map(w => w.p);
    }, [windowPeriods]);
    const wrapDe = useMemo(() => Object.fromEntries(windowPeriods.map(w => [w.p, w.wrapped])), [windowPeriods]);

    const getSummaryBy = (key) => {
        const groups = {};
        enrichedData.forEach(row => {
            if (row.toBuy > 0) {
                groups[row[key]] = (groups[row[key]] || 0) + row.toBuy;
            }
        });
        return Object.entries(groups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    };

    const summarySeccion = useMemo(() => getSummaryBy('seccion'), [enrichedData]);
    const summaryMarca = useMemo(() => getSummaryBy('marca').slice(0, 10), [enrichedData]); 
    const summaryGoa = useMemo(() => getSummaryBy('goa').slice(0, 10), [enrichedData]); 
    const summaryNorma = useMemo(() => getSummaryBy('norma'), [enrichedData]);

    // EXPORTACIONES
    const safeString = (str, fallback) => str ? str.replace(/[^a-zA-Z0-9]/g, '_') : fallback;
    
    const buildFilename = (prefix) => {
        const cen = safeString(filterCentro, 'TodosCen');
        const sec = safeString(filterSeccion, 'TodasSec');
        const mar = safeString(filterMarca, 'TodasMar');
        const mod = safeString(filterModelo, 'TodosMod');
        const nor = safeString(filterNorma, 'TodasNor');
        return `${prefix}_${cen}_${sec}_${mar}_${mod}_${nor}.csv`;
    };

    const downloadCSV = (filename, csvRows) => {
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const handleExportO9 = () => {
        if (enrichedData.length === 0) return;
        const aggregated = {};
        enrichedData.forEach(row => {
            if(row.toBuy > 0) {
                if(!aggregated[row.sku]) aggregated[row.sku] = 0;
                aggregated[row.sku] += row.toBuy;
            }
        });
        
        const csvRows = [];
        Object.keys(aggregated).forEach(sku => {
            csvRows.push(`880S,${sku},${aggregated[sku]}`);
        });
        downloadCSV(buildFilename('O9'), csvRows);
    };

    const handleExportRegular = () => {
        if (enrichedData.length === 0) return;
        const csvRows = [];
        enrichedData.forEach(row => {
            if(row.toBuy > 0) {
                const centroVal = row.centro_num || row.centro; 
                csvRows.push(`880S,${centroVal},${row.sku},${row.toBuy}`);
            }
        });
        downloadCSV(buildFilename('Regular'), csvRows);
    };

    const handleExportSkuPeriod = () => {
        if (skuPeriodSummary.length === 0) return;
        const headers = ["SKU", "Marca", "Nombre", "Total Comprar", ...periodColumnsArray.map(p => `FCST ${perLabel(p, wrapDe[p])}`)];
        const csvRows = [headers.join(',')];
        
        skuPeriodSummary.forEach(row => {
            const nombreClean = `"${String(row.nombre).replace(/"/g, '""')}"`;
            const marcaClean = `"${String(row.marca).replace(/"/g, '""')}"`;
            const rowData = [row.sku, marcaClean, nombreClean, row.totalComprar];
            periodColumnsArray.forEach(p => {
                rowData.push(Math.round(row.periods[p] || 0));
            });
            csvRows.push(rowData.join(','));
        });
        downloadCSV(buildFilename('Resumen_SKU_Periodo'), csvRows);
    };

    useEffect(() => {
        if (enrichedData.length > 0) {
            const stillExists = enrichedData.find(d => d.id === selectedItem?.id);
            if (!stillExists) setSelectedItem(null); 
        } else {
            setSelectedItem(null);
        }
    }, [enrichedData, selectedItem]);

    const MiniBarChart = ({ title, dataList, colorClass }) => {
        const maxVal = Math.max(...dataList.map(d => d.value), 1);
        return (
            <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] rounded-xl p-4 flex flex-col h-64 shadow-sm dark:shadow-none transition-colors">
                <h3 className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-4">{title}</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    {dataList.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-600 text-center mt-10">No hay compras sugeridas</p>
                    ) : (
                        dataList.map((item, i) => (
                            <div key={i} className="flex flex-col gap-1.5">
                                <div className="flex justify-between text-xs items-end">
                                    <span className="text-gray-700 dark:text-gray-300 truncate w-3/4 font-medium" title={item.name}>{item.name}</span>
                                    <span className="text-gray-900 dark:text-white font-bold">{item.value.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-[#262626] rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${colorClass}`} style={{ width: `${(item.value / maxVal) * 100}%` }}></div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen w-full p-4 md:p-6 transition-colors duration-300 text-gray-900 dark:text-gray-200">

            {/* HEADER */}
            <header className="mb-6 p-5 rounded-2xl border bg-white border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
                <div className="flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-purple-100 dark:bg-purple-500/20">
                        <RefreshCw size={22} className="text-purple-600 dark:text-purple-400" />
                    </span>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white leading-none">Resurtido</h1>
                        <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Reposición continua · Cobertura y sugerido de compra</p>
                    </div>
                </div>

                <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] p-2 rounded-lg border border-gray-200 dark:border-[#333] transition-colors w-full sm:w-auto">
                        <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all bg-purple-600 hover:bg-purple-700 dark:hover:bg-purple-500 text-white w-full sm:w-auto whitespace-nowrap shadow-sm">
                            <Upload className="w-4 h-4" />
                            Subir Archivo CSV
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <span className="text-gray-400 dark:text-gray-600 text-xs font-bold hidden sm:block">Ó</span>
                        <Database className="text-gray-400 w-5 h-5 ml-1 hidden sm:block" />
                        <input type="text" placeholder="Link CSV de Sheets..." value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} className="bg-transparent border-none text-sm text-gray-800 dark:text-white outline-none w-full sm:w-64 px-2" />
                        <button onClick={handleSync} disabled={isSyncing} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-all w-full sm:w-auto shadow-sm ${syncSuccess ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-transparent hover:bg-gray-100 dark:hover:bg-[#333] text-gray-700 dark:text-gray-300'}`}>
                            {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : syncSuccess ? <CheckCircle2 className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                            <span className="sm:hidden">Sincronizar</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ERROR MSG */}
            {error && (
                <div className="mb-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-5 h-5"/> {error}
                </div>
            )}

            {colAviso && (
                <div className="mb-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 rounded-xl text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <span className="break-all">{colAviso}</span>
                    <button onClick={() => setColAviso('')} className="ml-auto">✕</button>
                </div>
            )}

            {/* INSTRUCTIONS */}
            {data.length === 0 && !isSyncing && (
                <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-8 text-center max-w-4xl mx-auto mt-10 transition-colors">
                    <Database className="w-16 h-16 text-purple-500 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Conecta tu Base de Datos para empezar</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Elige el método que prefieras para cargar tu información:</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                        <div className="bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] p-6 rounded-lg border border-purple-200 dark:border-purple-500/30 relative transition-colors">
                            <div className="absolute top-0 right-0 bg-purple-600 text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg text-white">Recomendado</div>
                            <h3 className="text-gray-900 dark:text-white font-bold mb-3 flex items-center gap-2"><Upload className="w-5 h-5 text-purple-500 dark:text-purple-400"/> Opción 1: Archivo Local</h3>
                            <ul className="list-decimal pl-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
                                <li>Asegúrate de tener columnas como <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">marca</code>, <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">modelo</code>, <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">sku_nombre</code> si deseas ver el detalle completo.</li>
                                <li>Exporta tu archivo Excel en formato <strong>CSV (UTF-8 delimitado por comas)</strong>.</li>
                                <li>Haz clic en el botón morado de arriba <strong>"Subir Archivo CSV"</strong>.</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] p-6 rounded-lg border border-gray-200 dark:border-[#333] transition-colors">
                            <h3 className="text-gray-900 dark:text-white font-bold mb-3 flex items-center gap-2"><Database className="w-5 h-5 text-gray-500 dark:text-gray-400"/> Opción 2: Google Sheets</h3>
                            <ul className="list-decimal pl-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
                                <li>Ve a <strong>Archivo &gt; Compartir &gt; Publicar en la web</strong>.</li>
                                <li>Elige <strong>Valores separados por comas (.csv)</strong> y publica.</li>
                                <li>Pega el enlace en la barra superior.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN DASHBOARD */}
            {data.length > 0 && (
                <>
                    {/* CONFIGURACIÓN DEL ALGORITMO */}
                    <div className="flex flex-wrap items-center gap-4 bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] rounded-xl p-3 mb-4 shadow-sm dark:shadow-none transition-colors">
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#333]">
                            <Settings className="text-purple-600 dark:text-purple-500 w-4 h-4" />
                            <span className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wide">Configuración</span>
                        </div>
                        
                        <div className="flex items-center gap-2 border-r border-gray-200 dark:border-[#333] pr-4">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Método:</label>
                            <select value={calcMode} onChange={e => setCalcMode(e.target.value)} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg px-2 py-1 outline-none focus:border-purple-500 transition-colors">
                                <option value="TDM">Top-Down con modelo (mejor accuracy)</option>
                                <option value="TD">Top-Down (GOA ➔ Centro ➔ SKU)</option>
                                <option value="RA">Resurtido Automático (RA)</option>
                                <option value="CU">Compra Única (Promedio + Tend. 3M)</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Tope Crecimiento (+%):</label>
                            <input type="number" value={maxGrowth} onChange={e => setMaxGrowth(Number(e.target.value))} className="bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg w-16 px-2 py-1 outline-none focus:border-purple-500 text-center transition-colors" />
                        </div>
                        <div className="flex items-center gap-2 border-r border-gray-200 dark:border-[#333] pr-4">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Tope Decremento (-%):</label>
                            <input type="number" value={maxDecline} onChange={e => setMaxDecline(Number(e.target.value))} className="bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg w-16 px-2 py-1 outline-none focus:border-purple-500 text-center transition-colors" />
                        </div>
                        {[
                            ['Lead time (días)', leadDias, setLeadDias, 'Días desde que se pide hasta que llega a tienda (logístico + proveedor)'],
                            ['WOS objetivo (días)', wosDias, setWosDias, 'Días de inventario que debe quedar al llegar el pedido. RA ≈ 45'],
                            ['Seguridad (días)', safetyDias, setSafetyDias, 'Colchón extra en días de venta'],
                        ].map(([l, v, set, tip]) => (
                            <div key={l} className="flex items-center gap-2" title={tip}>
                                <label className="text-xs text-gray-500 dark:text-gray-400">{l}:</label>
                                <input type="number" min="0" value={v} onChange={e => set(Math.max(0, Number(e.target.value)))} className="bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg w-14 px-2 py-1 outline-none focus:border-purple-500 text-center transition-colors" />
                            </div>
                        ))}
                        <span className="text-[10px] text-gray-500">Pedido = demanda/día × {leadDias + wosDias + safetyDias} días − (OH+OO)</span>
                        {clusterResumen.length > 0 && (
                            <button onClick={() => setShowCluster(v => !v)} className="text-[11px] font-bold px-3 py-1 rounded-lg border border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-500/10">
                                {showCluster ? 'Ocultar' : 'Ajustes por cluster'} ({clusterResumen.length})
                            </button>
                        )}
                        {showCluster && clusterResumen.length > 0 && (
                            <div className="w-full pt-2 border-t border-gray-200 dark:border-white/10">
                                <p className="text-[10px] text-gray-500 mb-2">
                                    {hayClusterCSV ? 'Clusters tomados de la columna CLUSTER del CSV.' : 'Sin columna CLUSTER en el CSV: A = top 20% de tiendas por venta, B = siguiente 30%, C = resto.'} Campo vacío = usa el valor general.
                                </p>
                                <table className="text-xs">
                                    <thead className="text-[10px] uppercase text-gray-500"><tr>
                                        <th className="px-2 py-1 text-left">Cluster</th><th className="px-2 py-1">Tiendas</th><th className="px-2 py-1">Lead (d)</th><th className="px-2 py-1">WOS (d)</th><th className="px-2 py-1">Seg. (d)</th><th className="px-2 py-1">Mín pzs</th><th className="px-2 py-1 text-right">Fcst</th><th className="px-2 py-1 text-right">Comprar</th><th></th>
                                    </tr></thead>
                                    <tbody>
                                        {clusterResumen.map(({ c, tiendas, compra, fcst }) => (
                                            <tr key={c} className="border-t border-gray-100 dark:border-white/5">
                                                <td className="px-2 py-1 font-bold text-gray-900 dark:text-white">{c}</td>
                                                <td className="px-2 py-1 text-center text-gray-500">{tiendas}</td>
                                                {[['lead', leadDias], ['wos', wosDias], ['seg', safetyDias], ['min', null]].map(([k, def]) => (
                                                    <td key={k} className="px-1 py-1">
                                                        <input type="number" min="0" placeholder={def != null ? String(def) : 'auto'} value={clusterCfg[c]?.[k] ?? ''}
                                                            onChange={e => { const v = e.target.value; setClusterCfg(prev => { const n = { ...prev, [c]: { ...(prev[c] || {}) } }; if (v === '') delete n[c][k]; else n[c][k] = Math.max(0, Number(v)); return n; }); }}
                                                            className="bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded w-14 px-1 py-0.5 text-center outline-none focus:border-purple-500" />
                                                    </td>
                                                ))}
                                                <td className="px-2 py-1 text-right text-gray-600 dark:text-gray-300">{fcst.toLocaleString()}</td>
                                                <td className="px-2 py-1 text-right font-bold text-yellow-600 dark:text-yellow-400">{compra.toLocaleString()}</td>
                                                <td className="px-2 py-1">{clusterCfg[c] && Object.keys(clusterCfg[c]).length > 0 && <button onClick={() => setClusterCfg(prev => { const n = { ...prev }; delete n[c]; return n; })} className="text-[10px] text-gray-400 hover:text-red-500">restablecer</button>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {calcMode === 'TDM' && Object.keys(goaFcst).length > 0 && (
                            <div className="w-full flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-white/10">
                                <span className="text-[10px] uppercase font-bold text-gray-500">Modelo por GOA:</span>
                                {Object.entries(goaFcst).sort((a, b) => b[1].total - a[1].total).slice(0, 12).map(([g, m]) => (
                                    <span key={g} className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300">
                                        {g}: <b>{m.model}</b>{m.acc != null && <span className={m.acc >= 85 ? 'text-emerald-500' : m.acc >= 70 ? 'text-yellow-500' : 'text-rose-500'}> · {m.acc.toFixed(0)}%</span>}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* FILTERS */}
                    <div className="flex flex-wrap gap-3 mb-6 bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-4 transition-colors">
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Centro</label>
                            <select value={filterCentro} onChange={(e) => { setFilterCentro(e.target.value); setFilterSeccion(''); setFilterMarca(''); setFilterGoa(''); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsCentros.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Sección</label>
                            <select value={filterSeccion} onChange={(e) => { setFilterSeccion(e.target.value); setFilterMarca(''); setFilterGoa(''); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todas</option>
                                {optionsSecciones.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Marca/Prov.</label>
                            <select value={filterMarca} onChange={(e) => { setFilterMarca(e.target.value); setFilterGoa(''); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todas</option>
                                {optionsMarcas.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> GOA</label>
                            <select value={filterGoa} onChange={(e) => { setFilterGoa(e.target.value); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsGoas.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Modelo</label>
                            <select value={filterModelo} onChange={(e) => { setFilterModelo(e.target.value); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsModelos.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Norma</label>
                            <select value={filterNorma} onChange={(e) => { setFilterNorma(e.target.value); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todas</option>
                                {optionsNormas.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Search className="w-3 h-3"/> SKU</label>
                            <select value={filterSku} onChange={(e) => setFilterSku(e.target.value)} className="bg-gray-50 dark:bg-[#1c1720] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsSkus.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-[2] min-w-[150px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1" title={`Periodos ${nPer <= 12 ? 'mensuales (1 = Ene … 12 = Dic; 13 = Ene del año siguiente)' : 'semanales (1–52; 53 = S1 del año siguiente)'}`}><Calendar className="w-3 h-3"/> Rango · {rangoTxt}</label>
                            <div className="flex items-center gap-1">
                                <div className="flex items-center gap-1 w-full bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-gray-300 dark:border-[#333] rounded-lg p-1 px-2 transition-colors">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">De:</span>
                                    <input type="number" min="1" max={periodEnd} value={periodStart} onChange={(e) => setPeriodStart(Number(e.target.value))} className="bg-transparent border-none text-gray-900 dark:text-white w-8 text-center outline-none font-bold text-xs" />
                                </div>
                                <div className="flex items-center gap-1 w-full bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-gray-300 dark:border-[#333] rounded-lg p-1 px-2 transition-colors">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">A:</span>
                                    <input type="number" min={periodStart} max={nPer * 2} value={periodEnd} onChange={(e) => setPeriodEnd(Number(e.target.value))} className="bg-transparent border-none text-gray-900 dark:text-white w-8 text-center outline-none font-bold text-xs" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KPIS */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 transition-colors">
                            <div className="bg-gray-100 dark:bg-gray-800 p-2.5 rounded-lg hidden sm:block"><BarChart2 className="w-5 h-5 text-gray-500 dark:text-gray-300" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase font-semibold">Pronóstico ({rangoTxt})</p>
                                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{kpis.forecast.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">PZS</span></p>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 transition-colors">
                            <div className="bg-yellow-50 dark:bg-yellow-500/10 p-2.5 rounded-lg border border-yellow-200 dark:border-yellow-500/20 hidden sm:block"><Box className="w-5 h-5 text-yellow-600 dark:text-yellow-500" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase font-semibold">Inventario (OH)</p>
                                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{kpis.oh.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">PZS</span></p>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 transition-colors">
                            <div className="bg-purple-50 dark:bg-purple-500/10 p-2.5 rounded-lg border border-purple-200 dark:border-purple-500/20 hidden sm:block"><Package className="w-5 h-5 text-purple-600 dark:text-purple-500" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase font-semibold">En Tránsito (OO)</p>
                                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{kpis.oo.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">PZS</span></p>
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 relative overflow-hidden transition-colors">
                            <div className="absolute top-0 right-0 w-12 h-12 bg-purple-100 dark:bg-purple-600/10 rounded-bl-full"></div>
                            <div className="bg-purple-600 p-2.5 rounded-lg shadow-md dark:shadow-[0_0_15px_rgba(147,51,234,0.3)] hidden sm:block"><ShoppingCart className="w-5 h-5 text-white" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Sugerido Compra</p>
                                <p className="text-xl md:text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-0.5">{kpis.toBuy.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">PZS</span></p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                        {/* TABLA DETALLE */}
                        <div className="xl:col-span-2 bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl overflow-hidden flex flex-col h-[750px] transition-colors">
                            <div className="p-3 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-between items-center flex-wrap gap-2 transition-colors">
                                <div className="flex items-center gap-3">
                                    <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Detalle de Combinación (Centro-SKU)</h2>
                                    <span className="text-[10px] bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md">{enrichedData.length} reg.</span>
                                </div>
                                <div className="flex gap-4 items-center">
                                    <div className="flex items-center bg-gray-200 dark:bg-white/5 rounded-lg p-0.5 shadow-inner">
                                        <button 
                                            onClick={() => setSortBy(sortBy === 'toBuy_desc' ? 'toBuy_asc' : 'toBuy_desc')}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-all ${sortBy.startsWith('toBuy') ? 'bg-white dark:bg-[#333] text-yellow-600 dark:text-yellow-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                        >
                                            Sugerido <Filter className="w-3 h-3" />
                                        </button>
                                        <button 
                                            onClick={() => setSortBy(sortBy === 'oh_desc' ? 'oh_asc' : 'oh_desc')}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-all ${sortBy.startsWith('oh') ? 'bg-white dark:bg-[#333] text-yellow-600 dark:text-yellow-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                        >
                                            OH+OO <Filter className="w-3 h-3" />
                                        </button>
                                        <button 
                                            onClick={() => setSortBy(sortBy === 'fcst_desc' ? 'fcst_asc' : 'fcst_desc')}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold transition-all ${sortBy.startsWith('fcst') ? 'bg-white dark:bg-[#333] text-yellow-600 dark:text-yellow-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                        >
                                            Forecast <Filter className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={handleExportO9}
                                            className="flex items-center gap-1.5 bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-white text-[11px] px-3 py-1.5 rounded-md transition-colors font-medium shadow-sm"
                                            title="Descarga Nodo, SKU y Cantidad sin títulos"
                                        >
                                            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                            Exportar O9
                                        </button>
                                        <button 
                                            onClick={handleExportRegular}
                                            className="flex items-center gap-1.5 bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-[#444] hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-white text-[11px] px-3 py-1.5 rounded-md transition-colors font-medium shadow-sm"
                                            title="Descarga Nodo, Centro, SKU y Cantidad sin títulos"
                                        >
                                            <Download className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                            Exportar SAP
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-auto flex-1 custom-scrollbar">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-[#1c1720] sticky top-0 z-10 shadow-sm dark:shadow-md transition-colors">
                                        <tr>
                                            <th className="px-3 py-3 font-semibold">Centro</th>
                                            <th className="px-2 py-3 font-semibold">Cl.</th>
                                            <th className="px-3 py-3 font-semibold">Marca</th>
                                            <th className="px-3 py-3 font-semibold">GOA</th>
                                            <th className="px-3 py-3 font-semibold">SKU (Nombre)</th>
                                            <th className="px-3 py-3 font-semibold text-right border-l border-gray-200 dark:border-[#262626]">Vta Base</th>
                                            <th className="px-3 py-3 font-semibold text-right">Tend.%</th>
                                            <th className="px-3 py-3 font-semibold text-right border-r border-gray-200 dark:border-[#262626] text-gray-900 dark:text-white">Forecast</th>
                                            <th className="px-3 py-3 font-semibold text-right text-yellow-600 dark:text-yellow-500">OH</th>
                                            <th className="px-3 py-3 font-semibold text-right text-purple-600 dark:text-purple-400">OO</th>
                                            <th className="px-3 py-3 font-semibold text-right">Cob.</th>
                                            <th className="px-3 py-3 font-semibold text-right text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/5">Comprar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-[#262626]">
                                        {enrichedData.length === 0 ? (
                                            <tr><td colSpan="12" className="text-center py-10 text-gray-500">No se encontraron resultados</td></tr>
                                        ) : (
                                            enrichedData.slice(0, tablaLimite).map((row) => (
                                                <tr 
                                                    key={row.id} 
                                                    onClick={() => setSelectedItem(row)}
                                                    className={`cursor-pointer transition-colors text-xs ${selectedItem?.id === row.id ? 'bg-purple-50 dark:bg-[#2a2a2a] border-l-4 border-l-purple-500' : 'hover:bg-gray-50 dark:hover:bg-[#1f1f1f] border-l-4 border-l-transparent'}`}
                                                >
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.centro}</td>
                                                    <td className="px-2 py-2 text-[10px] font-bold text-purple-600 dark:text-purple-300" title={`Cluster ${row.clusterTienda} · objetivo ${row.diasObj} días`}>{row.clusterTienda}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 truncate max-w-[80px]" title={row.marca}>{row.marca}</td>
                                                    <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 truncate max-w-[80px]" title={row.goa}>{row.goa}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-900 dark:text-gray-100">{row.sku_nombre}</span>
                                                            <span className="text-[9px] text-gray-500 font-mono">{row.sku}</span>
                                                        </div>
                                                    </td>
                                                    
                                                    <td className="px-3 py-2 text-right border-l border-gray-200 dark:border-[#262626]/50 text-gray-600 dark:text-gray-300">{row.baseSales}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        {row.rawTrend !== 0 ? (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${row.cappedTrend > 0 ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/10' : row.cappedTrend < 0 ? 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/10' : 'text-gray-500 dark:text-gray-400'}`}
                                                                  title={row.rawTrend !== row.cappedTrend ? `Crecimiento real: ${row.rawTrend.toFixed(1)}% (Topado)` : ''}>
                                                                {row.cappedTrend > 0 ? '+' : ''}{row.cappedTrend.toFixed(1)}%
                                                                {row.rawTrend !== row.cappedTrend && <span className="ml-0.5 text-yellow-500 opacity-80">*</span>}
                                                            </span>
                                                        ) : <span className="text-gray-400 dark:text-gray-500">-</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right border-r border-gray-200 dark:border-[#262626]/50 font-bold text-gray-900 dark:text-white">{row.forecast}</td>
                                                    
                                                    <td className="px-3 py-2 text-right font-medium text-yellow-600 dark:text-yellow-500">{row.oh}</td>
                                                    <td className="px-3 py-2 text-right font-medium text-purple-600 dark:text-purple-400">{row.oo}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        <span title="Días de inventario (OH+OO) al ritmo pronosticado" className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${row.coverage > row.diasObj * 1.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : row.coverage >= row.diasObj ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' : row.coverage > leadDias ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                                                            {row.coverage === 999 ? 'sin vta' : `${row.coverage.toFixed(0)} d`}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/5">
                                                        {row.toBuy > 0 ? `+${row.toBuy}` : '-'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                                {enrichedData.length > tablaLimite && (
                                    <div className="text-center py-3 text-xs text-gray-500">
                                        Mostrando {tablaLimite.toLocaleString()} de {enrichedData.length.toLocaleString()} filas (totales y gráficas usan todo) ·{' '}
                                        <button onClick={() => setTablaLimite(l => l + 500)} className="font-bold text-purple-600 dark:text-purple-400 hover:underline">mostrar 500 más</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* PANEL DE GRÁFICAS DE ITEM SELECCIONADO O GLOBAL */}
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-4 flex flex-col h-[750px] transition-colors">
                            {activeItem ? (
                                <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar pr-2">
                                    <div className="mb-4 bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] p-3 rounded-lg border border-gray-200 dark:border-white/10 flex justify-between items-center shrink-0 transition-colors">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-[10px] text-gray-500 uppercase truncate font-semibold">{activeItem.centro} • {activeItem.marca}</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={activeItem.sku_nombre}>{activeItem.sku_nombre}</p>
                                            <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5 font-mono">{activeItem.sku}</p>
                                            {selectedItem && (
                                                <button onClick={() => setSelectedItem(null)} className="text-[10px] text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 underline mt-1 transition-colors">
                                                    Ver Total Acumulado (Global)
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Sugerido Total</p>
                                            <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">+{activeItem.toBuy}</p>
                                        </div>
                                    </div>

                                    {/* Gráfica 1 - Ventas y Degradación de Inventario */}
                                    <div className="flex-none border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] rounded-lg p-3 mb-4 flex flex-col min-h-[250px] transition-colors">
                                        <h3 className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-2">Ventas & Stockout ({rangoTxt})</h3>
                                        <div className="flex-1 relative w-full h-full mt-2 pb-6">
                                            {(() => {
                                                const periods = activeItem.relevantPeriods;
                                                if (!periods || periods.length === 0) return <p className="text-xs text-gray-500 text-center mt-10">Sin ventas</p>;
                                                
                                                const baseInventory = activeItem.oh + activeItem.oo;
                                                let runningInv = baseInventory;
                                                const projectedInv = periods.map((p, idx) => {
                                                    if (idx === 1) {
                                                        runningInv += activeItem.toBuy; 
                                                    }
                                                    runningInv -= p.fcst;
                                                    return runningInv;
                                                });
                                                
                                                const maxSales = Math.max(
                                                    ...periods.map(p => Math.max(p.y1, p.y2, p.fcst)), 
                                                    baseInventory,
                                                    ...projectedInv,
                                                    1
                                                );
                                                const minSales = Math.min(0, ...projectedInv);
                                                const range = maxSales - minSales || 1;
                                                
                                                const totalPoints = periods.length;
                                                
                                                const getX = (i) => totalPoints > 1 ? (i / (totalPoints - 1)) * 100 : 50;
                                                const getY = (val) => 100 - (((val - minSales) / range) * 100);
                                                
                                                const zeroY = getY(0);

                                                const getPoints = (key) => periods.map((p, i) => `${getX(i)},${getY(p[key])}`).join(' ');
                                                const getInvPoints = () => projectedInv.map((inv, i) => `${getX(i)},${getY(inv)}`).join(' ');

                                                return (
                                                    <div className="relative w-full h-full">
                                                        <div className="absolute inset-0 w-full h-full">
                                                            {/* Grid y Líneas de Fondo */}
                                                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                                                <div className="w-full h-px border-t border-gray-300 dark:border-[#333] border-dashed transition-colors"></div>
                                                                <div className="w-full h-px border-t border-gray-300 dark:border-[#333] border-dashed transition-colors"></div>
                                                                <div className="w-full h-px border-t border-gray-300 dark:border-[#333] transition-colors"></div>
                                                            </div>

                                                            {/* Zona Roja de Ruptura (Stock < 0) */}
                                                            {minSales < 0 && (
                                                                <>
                                                                    <div className="absolute w-full bottom-0 bg-red-500/10 pointer-events-none" style={{ top: `${zeroY}%`, height: `${100 - zeroY}%` }}></div>
                                                                    <div className="absolute w-full h-px border-dashed border-t border-red-400 dark:border-red-500/80" style={{ top: `${zeroY}%` }}>
                                                                        <span className="absolute -top-4 right-0 text-[9px] text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-[#1c1720] px-1 rounded">Stock 0</span>
                                                                    </div>
                                                                </>
                                                            )}

                                                            {/* Trazos SVG de las Ventas y el Forecast */}
                                                            <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                                <polyline points={getPoints('y1')} fill="none" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                                                <polyline points={getPoints('y2')} fill="none" className="stroke-purple-500 dark:stroke-purple-600" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                                                <polyline points={getPoints('fcst')} fill="none" className="stroke-yellow-500 dark:stroke-yellow-400" strokeWidth="2" strokeDasharray="4 2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                                                
                                                                {/* Curva de Degradación del Inventario */}
                                                                <line x1={getX(0)} y1={getY(baseInventory)} x2={getX(0)} y2={getY(projectedInv[0])} className="stroke-blue-500" strokeWidth="2" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                                                                <polyline points={getInvPoints()} fill="none" className="stroke-blue-500" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                                            </svg>
                                                            
                                                            {/* Nodos de la gráfica */}
                                                            {periods.map((p, i) => {
                                                                const x = getX(i);
                                                                const inv = projectedInv[i];
                                                                return (
                                                                    <React.Fragment key={i}>
                                                                        <div className="absolute w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(p.y1)}% - 4px)` }} title={`Año 1 ${perLabel(p.period, p.wrapped)}: ${p.y1.toFixed(1)}`}></div>
                                                                        <div className="absolute w-2 h-2 bg-purple-500 dark:bg-purple-600 rounded-full" style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(p.y2)}% - 4px)` }} title={`Año 2 ${perLabel(p.period, p.wrapped)}: ${p.y2.toFixed(1)}`}></div>
                                                                        <div className="absolute w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-sm rotate-45 z-10" style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(p.fcst)}% - 4px)` }} title={`Forecast ${perLabel(p.period, p.wrapped)}: ${p.fcst.toFixed(1)}`}></div>
                                                                        
                                                                        {/* Nodos del Inventario */}
                                                                        <div className={`absolute w-2 h-2 ${inv < 0 ? 'bg-red-500' : 'bg-blue-500'} rounded-full z-20 border border-white dark:border-black shadow-sm`} style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(inv)}% - 4px)` }} title={`Inv. proyectado ${perLabel(p.period, p.wrapped)}: ${inv.toFixed(1)}`}></div>
                                                                    </React.Fragment>
                                                                )
                                                            })}
                                                            
                                                            {/* Punto de Inventario Inicial (Arranque) */}
                                                            <div className="absolute w-3.5 h-3.5 bg-blue-500 dark:bg-blue-400 rounded-full z-30 border-2 border-white shadow-md" style={{ left: `calc(${getX(0)}% - 7px)`, top: `calc(${getY(baseInventory)}% - 7px)` }} title={`Inventario Actual (OH + OO): ${baseInventory}`}></div>
                                                        </div>
                                                        
                                                        {/* EJE X (Etiquetas de Periodos) */}
                                                        <div className="absolute -bottom-6 left-0 w-full flex justify-between text-[9px] text-gray-500 font-bold">
                                                            {periods.map((p, i) => (
                                                                <div key={i} className="absolute text-center w-10 -ml-5" style={{ left: `${getX(i)}%` }}>
                                                                    {(periods.length <= 8 || i % Math.ceil(periods.length / 8) === 0) ? perLabel(p.period, p.wrapped) : ''}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex flex-wrap justify-center gap-3 mt-4 text-[9px] text-gray-500 dark:text-gray-400 font-medium">
                                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full"></div> Año 1</span>
                                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-500 dark:bg-purple-600 rounded-full"></div> Año 2</span>
                                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-sm rotate-45"></div> Forecast</span>
                                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Inv Proyectado</span>
                                        </div>
                                    </div>

                                    {/* Dispersión por CENTRO (suma de las combinaciones que deja el filtro): demanda vs inventario, antes y después de comprar */}
                                    {(() => {
                                        const porCentro = {};
                                        enrichedData.forEach(d => {
                                            const c = porCentro[d.centro] || (porCentro[d.centro] = { centro: d.centro, fcst: 0, invA: 0, compra: 0, combos: 0 });
                                            c.fcst += d.demCob || 0; c.invA += (d.oh || 0) + (d.oo || 0); c.compra += d.toBuy || 0; c.combos += 1;
                                        });
                                        const pts = Object.values(porCentro).map(c => ({ ...c, invD: c.invA + c.compra }));
                                        const selC = selectedItem?.centro;
                                        // Mismo eje X (demanda pronosticada) y misma escala en las dos para que el R² y la nube se comparen directo
                                        const maxX = Math.max(...pts.map(p => p.fcst), 1) * 1.05;
                                        const maxY = Math.max(...pts.map(p => Math.max(p.invA, p.invD)), 1) * 1.05;
                                        const regA = calculateRegression(pts.map(p => ({ x: p.fcst, y: p.invA })));
                                        const regD = calculateRegression(pts.map(p => ({ x: p.fcst, y: p.invD })));
                                        const gx = x => (x / maxX) * 100, gy = y => 100 - (y / maxY) * 100;
                                        const panel = (titulo, sub, yKey, reg, color) => (
                                            <div className="flex-1 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.045] dark:backdrop-blur-xl rounded-lg p-3 flex flex-col relative overflow-hidden">
                                                <div className="flex justify-between items-start z-10 mb-2">
                                                    <div>
                                                        <h3 className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">{titulo}</h3>
                                                        <p className="text-[8px] text-gray-400 italic">{sub}</p>
                                                    </div>
                                                    <span className="text-[9px] font-bold bg-white dark:bg-white/5 px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/10" style={{ color }} title="Qué tanto el inventario de cada centro sigue a su demanda (1.0 = perfecto)">R² {reg.r2.toFixed(2)}</span>
                                                </div>
                                                <div className="flex-1 relative w-full h-full ml-4 mb-3">
                                                    <div className="absolute top-0 bottom-0 left-0 border-l border-gray-400 dark:border-gray-600"></div>
                                                    <div className="absolute bottom-0 left-0 right-0 border-b border-gray-400 dark:border-gray-600"></div>
                                                    <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                        <line x1={0} y1={gy(reg.b)} x2={100} y2={gy(reg.m * maxX + reg.b)} stroke={color} strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                                                    </svg>
                                                    {pts.map(p => {
                                                        const sel = selC && selC === p.centro;
                                                        return (
                                                            <div key={p.centro} className={`absolute rounded-full transition-transform ${sel ? 'w-4 h-4 bg-yellow-400 border-2 border-black z-30 shadow-lg' : 'w-2.5 h-2.5 hover:scale-150 z-10'}`}
                                                                style={{ left: `calc(${gx(p.fcst)}% - ${sel ? 8 : 5}px)`, top: `calc(${gy(p[yKey])}% - ${sel ? 8 : 5}px)`, background: sel ? undefined : color, opacity: sel ? 1 : 0.7 }}
                                                                title={`${p.centro} · ${p.combos} combinaciones\nDemanda en ${leadDias + wosDias} días (lead time + WOS): ${Math.round(p.fcst).toLocaleString('es-MX')}\nInv antes (OH+OO): ${Math.round(p.invA).toLocaleString('es-MX')}\nCompra sugerida: +${Math.round(p.compra).toLocaleString('es-MX')}\nInv después: ${Math.round(p.invD).toLocaleString('es-MX')}\nDías de inventario: ${p.fcst > 0 ? Math.round(p.invA / p.fcst * (leadDias + wosDias)) : '—'} → ${p.fcst > 0 ? Math.round(p.invD / p.fcst * (leadDias + wosDias)) : '—'}`}>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="absolute -bottom-3 left-0 text-[7px] text-gray-500">0</div>
                                                    <div className="absolute -bottom-3 right-0 text-[7px] text-gray-500">{Math.round(maxX).toLocaleString('es-MX')}</div>
                                                    <div className="absolute top-0 -left-4 text-[7px] text-gray-500">{Math.round(maxY).toLocaleString('es-MX')}</div>
                                                </div>
                                                <div className="absolute bottom-1 right-2 text-[8px] text-gray-500 dark:text-gray-400 font-bold">Demanda en lead time + WOS</div>
                                                <div className="absolute top-[40%] -left-3 text-[8px] text-gray-500 dark:text-gray-400 -rotate-90 font-bold tracking-widest">Inventario</div>
                                            </div>
                                        );
                                        return (
                                            <div className="flex-none flex flex-col gap-1 mb-4">
                                                <div className="flex flex-col sm:flex-row gap-4 min-h-[250px]">
                                                    {panel('Antes · Inv. actual (OH+OO) vs demanda', `${pts.length} centros · combinaciones del filtro`, 'invA', regA, '#60a5fa')}
                                                    {panel('Después · Inv. + compra vs demanda', 'Punto amarillo: centro de la combinación seleccionada', 'invD', regD, '#4ade80')}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                                    <BarChart2 className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-xs text-center px-4 font-medium">Cargando gráficos</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* TARJETAS DE INSIGHTS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 transition-colors">
                        {/* Tarjeta 1: Stockouts */}
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-5 flex flex-col justify-center transition-colors">
                            <h3 className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-3 flex items-center gap-1.5"><Box className="w-4 h-4 text-red-500" /> Stockouts (Combinaciones en 0)</h3>
                            <div className="flex items-end gap-6">
                                <div>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Antes de Distribuir</p>
                                    <p className="text-2xl font-black text-red-500 dark:text-red-400">{insights.beforeZeroes}</p>
                                </div>
                                <div className="pb-1 text-gray-300 dark:text-gray-600 text-xl font-light">➔</div>
                                <div>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Después (Final)</p>
                                    <p className="text-2xl font-black text-green-500 dark:text-green-400">{insights.afterZeroes}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tarjeta 2: Mejor Desempeño */}
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-5 flex flex-col justify-center transition-colors">
                            <h3 className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-2 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-purple-500" /> Mejor Desempeño</h3>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Recomendación apostarle a:</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={insights.bestSku}>
                                {insights.bestSku}
                            </p>
                        </div>

                        {/* Tarjeta 3: Ranking de Tallas */}
                        <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl p-5 flex flex-col justify-center transition-colors">
                            <h3 className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-2 flex items-center gap-1.5"><BarChart2 className="w-4 h-4 text-blue-500" /> Ranking de Tallas (Fcst)</h3>
                            <div className="flex flex-col gap-2.5 mt-2 w-full">
                                {insights.topSizes.length > 0 ? insights.topSizes.map((t, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="w-8 font-bold text-gray-700 dark:text-gray-300">{t.size}</span>
                                        <div className="flex-1 bg-gray-100 dark:bg-[#2a2a2a] h-2 rounded-full overflow-hidden flex">
                                            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${t.percent}%` }}></div>
                                        </div>
                                        <span className="w-8 text-right font-medium text-gray-500">{t.score}</span>
                                    </div>
                                )) : <span className="text-xs text-gray-500">N/D</span>}
                            </div>
                        </div>
                    </div>

                    {/* NUEVA TABLA: RESUMEN POR SKU / PERIODO */}
                    <div className="bg-white border border-gray-200 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] shadow-sm dark:shadow-none rounded-xl overflow-hidden flex flex-col h-[400px] mb-6 transition-colors">
                        <div className="p-3 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-between items-center flex-wrap gap-2 transition-colors">
                            <div className="flex items-center gap-3">
                                <Table className="w-4 h-4 text-purple-600 dark:text-purple-500" />
                                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Resumen por SKU y Periodo (Forecast a Comprar)</h2>
                                <span className="text-[10px] bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md">{skuPeriodSummary.length} SKUs</span>
                            </div>
                            <button 
                                onClick={handleExportSkuPeriod}
                                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 text-white text-[11px] px-3 py-1.5 rounded-md transition-colors font-medium shadow-sm"
                                title="Descarga la matriz de SKU con el Forecast distribuido por periodo"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Exportar Tabla Mensual/Semanal
                            </button>
                        </div>
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-[#1c1720] sticky top-0 z-10 shadow-sm dark:shadow-md transition-colors">
                                    <tr>
                                        <th className="px-3 py-3 font-semibold border-r border-gray-200 dark:border-[#262626]">SKU</th>
                                        <th className="px-3 py-3 font-semibold border-r border-gray-200 dark:border-[#262626]">Marca</th>
                                        <th className="px-3 py-3 font-semibold border-r border-gray-200 dark:border-[#262626]">Nombre</th>
                                        <th className="px-3 py-3 font-semibold text-yellow-600 dark:text-yellow-400 border-r border-gray-200 dark:border-[#262626]">Total a Comprar</th>
                                        {periodColumnsArray.map(p => (
                                            <th key={p} className="px-3 py-3 font-semibold text-center border-r border-gray-200 dark:border-[#262626]">FCST {perLabel(p, wrapDe[p])}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-[#262626]">
                                    {skuPeriodSummary.length === 0 ? (
                                        <tr><td colSpan={periodColumnsArray.length + 4} className="text-center py-10 text-gray-500">No hay compras sugeridas para los filtros actuales</td></tr>
                                    ) : (
                                        skuPeriodSummary.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors text-xs">
                                                <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-[#262626]/50">{row.sku}</td>
                                                <td className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-[#262626]/50">{row.marca}</td>
                                                <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-[#262626]/50">{row.nombre}</td>
                                                <td className="px-3 py-2 text-center font-bold text-yellow-600 dark:text-yellow-400 border-r border-gray-200 dark:border-[#262626]/50 bg-yellow-50 dark:bg-yellow-400/5">{row.totalComprar}</td>
                                                {periodColumnsArray.map(p => (
                                                    <td key={p} className="px-3 py-2 text-center text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-[#262626]/50">
                                                        {Math.round(row.periods[p] || 0)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* DASHBOARD DE RESUMEN (4 Gráficas ahora) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pt-4 border-t border-gray-200 dark:border-[#262626] transition-colors">
                        <MiniBarChart title="Compra por Marca/Prov" dataList={summaryMarca} colorClass="bg-pink-500" />
                        <MiniBarChart title="Compra por Sección" dataList={summarySeccion} colorClass="bg-purple-500" />
                        <MiniBarChart title="Compra por GOA (Top 10)" dataList={summaryGoa} colorClass="bg-yellow-500" />
                        <MiniBarChart title="Compra por Norma" dataList={summaryNorma} colorClass="bg-blue-500" />
                    </div>
                </>
            )}
        </div>
    );
}

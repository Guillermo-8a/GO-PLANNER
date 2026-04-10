import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, Package, ShoppingCart, BarChart2, Box, Database, RefreshCw,
  Search, Calendar, Filter, CheckCircle2, AlertCircle, Upload, Download,
  Settings, FileText, Table
} from 'lucide-react';

// --- FUNCIONES MATEMÁTICAS ---
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

// --- ALGORITMO JITTER PARA EVITAR OVERLAP DE PUNTOS EN SCATTER PLOT ---
// Crea un desfase determinístico sutil para visualizar tiendas apiladas en el mismo valor
const getJitterX = (i) => (i % 5 - 2) * 1.5; 
const getJitterY = (i) => ((i * 3) % 5 - 2) * 1.5;

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
    
    // DEFAULT A MES ACTUAL + 2
    const currentMonth = new Date().getMonth() + 1;
    const [periodStart, setPeriodStart] = useState(currentMonth);
    const [periodEnd, setPeriodEnd] = useState(currentMonth + 2);

    // VARIABLES DE ALGORITMO
    const [calcMode, setCalcMode] = useState('TD'); 
    const [maxGrowth, setMaxGrowth] = useState(50);
    const [maxDecline, setMaxDecline] = useState(30);
    
    const [selectedItem, setSelectedItem] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);
    const [error, setError] = useState('');

    // Parseador de CSV
    const splitCSVLine = (text) => {
        let result = [];
        let inQuotes = false;
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '"') inQuotes = !inQuotes;
            else if (text[i] === ',' && !inQuotes) {
                result.push(text.slice(start, i).replace(/^"|"$/g, '').replace(/""/g, '"').trim());
                start = i + 1;
            }
        }
        result.push(text.slice(start).replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        return result;
    };

    const parseCSV = (str) => {
        const lines = str.split('\n').filter(line => line.trim() !== '');
        if(lines.length === 0) return { rawData: [], isHeaderRow: false };

        const firstLineCols = splitCSVLine(lines[0]).map(h => h.toLowerCase());
        
        const isHeaderRow = firstLineCols.some(col => 
            ['centro', 'tienda', 'seccion', 'sección', 'marca', 'proveedor', 'goa', 'modelo', 'sku', 'nombre', 'articulo', 'artículo', 'norma', 'oh', 'oo', 'm1_a1', 's1_a1', 'venta'].includes(col)
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

            const findCol = (row, possibleNames) => {
                const key = Object.keys(row).find(k => possibleNames.some(pn => k === pn || k.includes(pn)));
                return key ? row[key] : undefined;
            }

            const processedData = rawData.map((row, index) => {
                const monthlySales = [];
                for (let p = 1; p <= 52; p++) {
                    const val1 = row[`m${p}_a1`] ?? row[`mes${p}_a1`] ?? row[`s${p}_a1`]; 
                    const val2 = row[`m${p}_a2`] ?? row[`mes${p}_a2`] ?? row[`s${p}_a2`]; 
                    
                    if (val1 !== undefined || val2 !== undefined) {
                        monthlySales.push({
                            period: p,
                            y1: Number(val1) || 0,
                            y2: Number(val2) || 0
                        });
                    }
                }

                if (monthlySales.length === 0 && isHeaderRow) {
                    const v1 = findCol(row, ['venta', 'vta', 'año 1', 'ant']);
                    const v2 = findCol(row, ['año 2', 'act', 'año2']);
                    if (v1 !== undefined || v2 !== undefined) {
                        monthlySales.push({ period: 1, y1: Number(v1) || 0, y2: Number(v2) || 0 });
                    }
                }

                return {
                    id: index + 1,
                    centro: row.centro || (isHeaderRow && findCol(row, ['centro', 'tienda', 'sucursal'])) || 'Sin Centro',
                    centro_num: row.centro_num || (isHeaderRow && findCol(row, ['centro_num', 'id_centro', 'num_centro', 'nodo'])) || '',
                    seccion: row.seccion || (isHeaderRow && findCol(row, ['seccion', 'sección', 'dpto'])) || 'Sin Sección',
                    marca: row.marca || (isHeaderRow && findCol(row, ['marca', 'proveedor', 'vendor'])) || 'Sin Marca',
                    goa: row.goa || (isHeaderRow && findCol(row, ['goa', 'familia', 'subfamilia'])) || 'Sin GOA',
                    modelo: row.modelo || (isHeaderRow && findCol(row, ['modelo', 'estilo'])) || 'Sin Modelo',
                    norma: row.norma || (isHeaderRow && findCol(row, ['norma', 'resurtido', 'tipo'])) || 'Sin Norma',
                    sku: row.sku || (isHeaderRow && findCol(row, ['sku', 'articulo', 'artículo', 'item'])) || `SKU-${index}`,
                    sku_nombre: row.sku_nombre || (isHeaderRow && findCol(row, ['sku_nombre', 'nombre', 'descripción', 'desc'])) || 'Sin Nombre',
                    oh: Number(row.oh || (isHeaderRow && findCol(row, ['oh', 'inv', 'físico', 'stock']))) || 0,
                    oo: Number(row.oo || (isHeaderRow && findCol(row, ['oo', 'transito', 'tránsito', 'pedido']))) || 0,
                    monthlySales: monthlySales.length > 0 ? monthlySales : [{period: 1, y1: 0, y2: 0}]
                };
            });

            let maxPeriod = 1;
            if (processedData.length > 0) {
                maxPeriod = Math.max(...processedData.map(d => Math.max(...d.monthlySales.map(ms => ms.period), 1)));
            }

            if (maxPeriod <= 1) {
                 setPeriodStart(1);
                 setPeriodEnd(1);
            } else {
                 setPeriodStart(Math.min(currentMonth, maxPeriod));
                 setPeriodEnd(Math.min(currentMonth + 2, maxPeriod)); 
            }

            setData(processedData);
            setIsSyncing(false);
            setSyncSuccess(true);
            setTimeout(() => setSyncSuccess(false), 3000);

        } catch (err) {
            console.error(err);
            setError('Error al procesar el archivo CSV. Verifica el formato.');
            setIsSyncing(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsSyncing(true);
        setError('');
        setSyncSuccess(false);
        const reader = new FileReader();
        reader.onload = (evt) => {
            processCSVData(evt.target.result);
            e.target.value = null;
        };
        reader.onerror = () => {
            setError("Error al leer el archivo local.");
            setIsSyncing(false);
        };
        // UTF-8 Por defecto (asegura acentos y "Ñ")
        reader.readAsText(file);
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

    // BASE DE DATOS PRE-FILTROS DE UI (Para calcular la Nube de Puntos global y Jerarquías Top-Down)
    const computedData = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        const goaAgg = {};
        const gcAgg = {};

        if (calcMode === 'TD') {
            data.forEach(row => {
                const relevantPeriods = row.monthlySales.filter(m => m.period >= periodStart && m.period <= periodEnd);
                const sumY1 = relevantPeriods.reduce((acc, curr) => acc + curr.y1, 0);
                const sumY2 = relevantPeriods.reduce((acc, curr) => acc + curr.y2, 0);
                
                if (!goaAgg[row.goa]) goaAgg[row.goa] = { sumY1: 0, sumY2: 0, baseSales: 0, forecast: 0, rawTrend: 0, cappedTrend: 0 };
                goaAgg[row.goa].sumY1 += sumY1;
                goaAgg[row.goa].sumY2 += sumY2;

                const gcKey = `${row.goa}|${row.centro}`;
                if (!gcAgg[gcKey]) gcAgg[gcKey] = { sumY1: 0, sumY2: 0, baseSales: 0 };
                gcAgg[gcKey].sumY1 += sumY1;
                gcAgg[gcKey].sumY2 += sumY2;
            });

            Object.values(goaAgg).forEach(g => {
                if (g.sumY1 > 0 && g.sumY2 > 0) {
                    g.baseSales = g.sumY2;
                    g.rawTrend = ((g.sumY2 - g.sumY1) / g.sumY1) * 100;
                } else if (g.sumY1 > 0 && g.sumY2 === 0) {
                    g.baseSales = g.sumY1;
                    g.rawTrend = 0;
                } else {
                    g.baseSales = g.sumY2;
                    g.rawTrend = 0;
                }
                g.cappedTrend = Math.min(Math.max(g.rawTrend, -maxDecline), maxGrowth);
                g.forecast = g.baseSales * (1 + (g.cappedTrend / 100));
            });

            Object.values(gcAgg).forEach(gc => {
                if (gc.sumY1 > 0 && gc.sumY2 > 0) gc.baseSales = gc.sumY2;
                else if (gc.sumY1 > 0 && gc.sumY2 === 0) gc.baseSales = gc.sumY1;
                else gc.baseSales = gc.sumY2;
            });
        }

        return data.map(row => {
            const relevantPeriods = row.monthlySales.filter(m => m.period >= periodStart && m.period <= periodEnd);
            const sumY1 = relevantPeriods.reduce((acc, curr) => acc + curr.y1, 0);
            const sumY2 = relevantPeriods.reduce((acc, curr) => acc + curr.y2, 0);
            const activeYears = (sumY1 > 0 ? 1 : 0) + (sumY2 > 0 ? 1 : 0);

            let baseSales = 0;
            let rawTrend = 0;
            let cappedTrend = 0;
            let forecast = 0;

            let skuBaseRA = 0;
            if (sumY1 > 0 && sumY2 > 0) skuBaseRA = sumY2;
            else if (sumY1 > 0 && sumY2 === 0) skuBaseRA = sumY1;
            else skuBaseRA = sumY2;

            if (calcMode === 'TD') {
                baseSales = skuBaseRA;
                const g = goaAgg[row.goa];
                const gc = gcAgg[`${row.goa}|${row.centro}`];

                const gcContrib = g.baseSales > 0 ? (gc.baseSales / g.baseSales) : 0;
                const forecastGC = g.forecast * gcContrib;
                const skuContrib = gc.baseSales > 0 ? (baseSales / gc.baseSales) : 0;
                
                forecast = Math.round(forecastGC * skuContrib);
                rawTrend = g.rawTrend;
                cappedTrend = g.cappedTrend;

            } else if (calcMode === 'RA') {
                baseSales = skuBaseRA;
                if (sumY1 > 0 && sumY2 > 0) rawTrend = ((sumY2 - sumY1) / sumY1) * 100;
                cappedTrend = Math.min(Math.max(rawTrend, -maxDecline), maxGrowth);
                forecast = Math.round(baseSales * (1 + (cappedTrend / 100)));

            } else {
                baseSales = activeYears > 0 ? (sumY1 + sumY2) / activeYears : 0;
                if (relevantPeriods.length > 0) {
                    const maxP = Math.max(...relevantPeriods.map(p => p.period));
                    const last3 = relevantPeriods.filter(p => p.period > maxP - 3 && p.period <= maxP);
                    const sumY1_3M = last3.reduce((acc, curr) => acc + curr.y1, 0);
                    const sumY2_3M = last3.reduce((acc, curr) => acc + curr.y2, 0);
                    if (sumY1_3M > 0 && sumY2_3M > 0) rawTrend = ((sumY2_3M - sumY1_3M) / sumY1_3M) * 100;
                }
                cappedTrend = Math.min(Math.max(rawTrend, -maxDecline), maxGrowth);
                forecast = Math.round(baseSales * (1 + (cappedTrend / 100)));
            }
            
            const totalInventory = row.oh + row.oo;
            const toBuy = Math.max(0, forecast - totalInventory);
            const coverage = forecast > 0 ? (totalInventory / forecast) * 100 : (totalInventory > 0 ? 999 : 0);

            const trendMult = 1 + (cappedTrend / 100);
            const periodsWithFcst = relevantPeriods.map(p => {
                let pBase = 0;
                if (calcMode === 'RA' || calcMode === 'TD') {
                    if (sumY1 > 0 && sumY2 > 0) pBase = p.y2;
                    else if (sumY1 > 0 && sumY2 === 0) pBase = p.y1;
                    else pBase = p.y2;
                } else {
                    pBase = activeYears > 0 ? ((sumY1 > 0 ? p.y1 : 0) + (sumY2 > 0 ? p.y2 : 0)) / activeYears : 0;
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
                relevantPeriods: periodsWithFcst
            };
        });
    }, [data, periodStart, periodEnd, calcMode, maxGrowth, maxDecline]);

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

    // APLICACIÓN DE FILTROS EN TABLA
    const enrichedData = useMemo(() => {
        let result = computedData;
        if (filterCentro) result = result.filter(d => d.centro === filterCentro);
        if (filterSeccion) result = result.filter(d => d.seccion === filterSeccion);
        if (filterMarca) result = result.filter(d => d.marca === filterMarca);
        if (filterGoa) result = result.filter(d => d.goa === filterGoa);
        if (filterModelo) result = result.filter(d => d.modelo === filterModelo);
        if (filterNorma) result = result.filter(d => d.norma === filterNorma);
        if (filterSku) result = result.filter(d => d.sku === filterSku);
        return result.sort((a, b) => b.toBuy - a.toBuy);
    }, [computedData, filterCentro, filterSeccion, filterMarca, filterGoa, filterModelo, filterNorma, filterSku]);

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
        const cols = [];
        for(let i = periodStart; i <= periodEnd; i++) {
            cols.push(i);
        }
        return cols;
    }, [periodStart, periodEnd]);

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
        const headers = ["SKU", "Marca", "Nombre", "Total Comprar", ...periodColumnsArray.map(p => `FCST P${p}`)];
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
            if (!stillExists) setSelectedItem(enrichedData[0]);
        } else {
            setSelectedItem(null);
        }
    }, [enrichedData, selectedItem]);

    const MiniBarChart = ({ title, dataList, colorClass }) => {
        const maxVal = Math.max(...dataList.map(d => d.value), 1);
        return (
            <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] rounded-xl p-4 flex flex-col h-64 shadow-sm dark:shadow-none transition-colors">
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
        <div className="min-h-screen text-gray-900 dark:text-gray-200 p-4 md:p-6 transition-colors duration-300">
            
            {/* HEADER UNIFICADO GO PLANNER (Sin bg de tarjeta, con border-b y sombra) */}
            <header className="mb-6 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 dark:border-[#262626] shadow-[0_4px_10px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_10px_-4px_rgba(0,0,0,0.4)] transition-colors">
                <h1 className="text-xl md:text-2xl font-black tracking-widest text-gray-900 dark:text-white flex items-center gap-3 px-2">
                    GO PLANNER 
                    <span className="text-gray-300 dark:text-[#333] font-light">|</span> 
                    <span className="text-purple-600 dark:text-purple-500 font-medium text-lg md:text-xl tracking-normal">Resurtido</span>
                </h1>
                
                <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-50 dark:bg-[#141414] p-2 rounded-lg border border-gray-200 dark:border-[#333] transition-colors w-full sm:w-auto">
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

            {/* INSTRUCTIONS */}
            {data.length === 0 && !isSyncing && (
                <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-8 text-center max-w-4xl mx-auto mt-10 transition-colors">
                    <Database className="w-16 h-16 text-purple-500 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Conecta tu Base de Datos para empezar</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Elige el método que prefieras para cargar tu información:</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                        <div className="bg-gray-50 dark:bg-[#0a0a0a] p-6 rounded-lg border border-purple-200 dark:border-purple-500/30 relative transition-colors">
                            <div className="absolute top-0 right-0 bg-purple-600 text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg text-white">Recomendado</div>
                            <h3 className="text-gray-900 dark:text-white font-bold mb-3 flex items-center gap-2"><Upload className="w-5 h-5 text-purple-500 dark:text-purple-400"/> Opción 1: Archivo Local</h3>
                            <ul className="list-decimal pl-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
                                <li>Asegúrate de tener columnas como <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">marca</code>, <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">modelo</code>, <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">sku_nombre</code> si deseas ver el detalle completo.</li>
                                <li>Exporta tu archivo Excel en formato <strong>CSV (UTF-8 delimitado por comas)</strong>.</li>
                                <li>Haz clic en el botón morado de arriba <strong>"Subir Archivo CSV"</strong>.</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 dark:bg-[#0a0a0a] p-6 rounded-lg border border-gray-200 dark:border-[#333] transition-colors">
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
                    <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] rounded-xl p-3 mb-4 shadow-sm dark:shadow-none transition-colors">
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#1a1a1a] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#333]">
                            <Settings className="text-purple-600 dark:text-purple-500 w-4 h-4" />
                            <span className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wide">Configuración</span>
                        </div>
                        
                        <div className="flex items-center gap-2 border-r border-gray-200 dark:border-[#333] pr-4">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Método:</label>
                            <select value={calcMode} onChange={e => setCalcMode(e.target.value)} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg px-2 py-1 outline-none focus:border-purple-500 transition-colors">
                                <option value="TD">Top-Down (GOA ➔ Centro ➔ SKU)</option>
                                <option value="RA">Resurtido Automático (RA)</option>
                                <option value="CU">Compra Única (Promedio + Tend. 3M)</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Tope Crecimiento (+%):</label>
                            <input type="number" value={maxGrowth} onChange={e => setMaxGrowth(Number(e.target.value))} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg w-16 px-2 py-1 outline-none focus:border-purple-500 text-center transition-colors" />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Tope Decremento (-%):</label>
                            <input type="number" value={maxDecline} onChange={e => setMaxDecline(Number(e.target.value))} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs font-bold rounded-lg w-16 px-2 py-1 outline-none focus:border-purple-500 text-center transition-colors" />
                        </div>
                    </div>

                    {/* FILTERS */}
                    <div className="flex flex-wrap gap-3 mb-6 bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-4 transition-colors">
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Centro</label>
                            <select value={filterCentro} onChange={(e) => { setFilterCentro(e.target.value); setFilterSeccion(''); setFilterMarca(''); setFilterGoa(''); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsCentros.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Sección</label>
                            <select value={filterSeccion} onChange={(e) => { setFilterSeccion(e.target.value); setFilterMarca(''); setFilterGoa(''); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todas</option>
                                {optionsSecciones.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Marca/Prov.</label>
                            <select value={filterMarca} onChange={(e) => { setFilterMarca(e.target.value); setFilterGoa(''); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todas</option>
                                {optionsMarcas.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> GOA</label>
                            <select value={filterGoa} onChange={(e) => { setFilterGoa(e.target.value); setFilterModelo(''); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsGoas.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Modelo</label>
                            <select value={filterModelo} onChange={(e) => { setFilterModelo(e.target.value); setFilterNorma(''); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsModelos.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Filter className="w-3 h-3"/> Norma</label>
                            <select value={filterNorma} onChange={(e) => { setFilterNorma(e.target.value); setFilterSku(''); }} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todas</option>
                                {optionsNormas.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Search className="w-3 h-3"/> SKU</label>
                            <select value={filterSku} onChange={(e) => setFilterSku(e.target.value)} className="bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] text-gray-900 dark:text-white text-xs rounded-lg p-2 outline-none focus:border-purple-500 transition-colors">
                                <option value="">Todos</option>
                                {optionsSkus.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-[2] min-w-[150px]">
                            <label className="text-[10px] text-gray-500 uppercase font-semibold flex items-center gap-1"><Calendar className="w-3 h-3"/> Rango</label>
                            <div className="flex items-center gap-1">
                                <div className="flex items-center gap-1 w-full bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] rounded-lg p-1 px-2 transition-colors">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">De:</span>
                                    <input type="number" min="1" max={periodEnd} value={periodStart} onChange={(e) => setPeriodStart(Number(e.target.value))} className="bg-transparent border-none text-gray-900 dark:text-white w-8 text-center outline-none font-bold text-xs" />
                                </div>
                                <div className="flex items-center gap-1 w-full bg-gray-50 dark:bg-[#0a0a0a] border border-gray-300 dark:border-[#333] rounded-lg p-1 px-2 transition-colors">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">A:</span>
                                    <input type="number" min={periodStart} max="52" value={periodEnd} onChange={(e) => setPeriodEnd(Number(e.target.value))} className="bg-transparent border-none text-gray-900 dark:text-white w-8 text-center outline-none font-bold text-xs" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KPIS */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 transition-colors">
                            <div className="bg-gray-100 dark:bg-gray-800 p-2.5 rounded-lg hidden sm:block"><BarChart2 className="w-5 h-5 text-gray-500 dark:text-gray-300" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase font-semibold">Pronóstico (P{periodStart}-P{periodEnd})</p>
                                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{kpis.forecast.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">uds</span></p>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 transition-colors">
                            <div className="bg-yellow-50 dark:bg-yellow-500/10 p-2.5 rounded-lg border border-yellow-200 dark:border-yellow-500/20 hidden sm:block"><Box className="w-5 h-5 text-yellow-600 dark:text-yellow-500" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase font-semibold">Inventario (OH)</p>
                                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{kpis.oh.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">uds</span></p>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 transition-colors">
                            <div className="bg-purple-50 dark:bg-purple-500/10 p-2.5 rounded-lg border border-purple-200 dark:border-purple-500/20 hidden sm:block"><Package className="w-5 h-5 text-purple-600 dark:text-purple-500" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase font-semibold">En Tránsito (OO)</p>
                                <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{kpis.oo.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">uds</span></p>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-4 flex items-center gap-4 relative overflow-hidden transition-colors">
                            <div className="absolute top-0 right-0 w-12 h-12 bg-purple-100 dark:bg-purple-600/10 rounded-bl-full"></div>
                            <div className="bg-purple-600 p-2.5 rounded-lg shadow-md dark:shadow-[0_0_15px_rgba(147,51,234,0.3)] hidden sm:block"><ShoppingCart className="w-5 h-5 text-white" /></div>
                            <div>
                                <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Sugerido Compra</p>
                                <p className="text-xl md:text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-0.5">{kpis.toBuy.toLocaleString()} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">uds</span></p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                        {/* TABLA DETALLE */}
                        <div className="xl:col-span-2 bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl overflow-hidden flex flex-col h-[750px] transition-colors">
                            <div className="p-3 border-b border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#1a1a1a] flex justify-between items-center flex-wrap gap-2 transition-colors">
                                <div className="flex items-center gap-3">
                                    <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Detalle de Combinación (Centro-SKU)</h2>
                                    <span className="text-[10px] bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md">{enrichedData.length} reg.</span>
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
                                        Exportar Regular
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-auto flex-1 custom-scrollbar">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-[#0f0f0f] sticky top-0 z-10 shadow-sm dark:shadow-md transition-colors">
                                        <tr>
                                            <th className="px-3 py-3 font-semibold">Centro</th>
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
                                            <tr><td colSpan="11" className="text-center py-10 text-gray-500">No se encontraron resultados</td></tr>
                                        ) : (
                                            enrichedData.map((row) => (
                                                <tr 
                                                    key={row.id} 
                                                    onClick={() => setSelectedItem(row)}
                                                    className={`cursor-pointer transition-colors text-xs ${selectedItem?.id === row.id ? 'bg-purple-50 dark:bg-[#2a2a2a] border-l-4 border-l-purple-500' : 'hover:bg-gray-50 dark:hover:bg-[#1f1f1f] border-l-4 border-l-transparent'}`}
                                                >
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.centro}</td>
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
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${row.coverage >= 100 ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' : row.coverage > 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                                                            {row.coverage === 999 ? '+100%' : `${row.coverage.toFixed(0)}%`}
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
                            </div>
                        </div>

                        {/* PANEL DE GRÁFICAS DE ITEM SELECCIONADO */}
                        <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl p-4 flex flex-col h-[750px] transition-colors">
                            {selectedItem ? (
                                <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar pr-2">
                                    <div className="mb-4 bg-gray-50 dark:bg-[#0a0a0a] p-3 rounded-lg border border-gray-200 dark:border-[#262626] flex justify-between items-center shrink-0 transition-colors">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-[10px] text-gray-500 uppercase truncate font-semibold">{selectedItem.centro} • {selectedItem.marca}</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={selectedItem.sku_nombre}>{selectedItem.sku_nombre}</p>
                                            <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5 font-mono">{selectedItem.sku}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[10px] text-gray-500 uppercase font-semibold">Sugerido</p>
                                            <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">+{selectedItem.toBuy}</p>
                                        </div>
                                    </div>

                                    {/* Gráfica 1 - Ventas y Degradación de Inventario */}
                                    <div className="flex-none border border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#0a0a0a] rounded-lg p-3 mb-4 flex flex-col min-h-[250px] transition-colors">
                                        <h3 className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-2">Ventas & Stockout (P{periodStart}-P{periodEnd})</h3>
                                        <div className="flex-1 relative w-full h-full mt-2 pb-6">
                                            {(() => {
                                                const periods = selectedItem.relevantPeriods;
                                                if (!periods || periods.length === 0) return <p className="text-xs text-gray-500 text-center mt-10">Sin ventas</p>;
                                                
                                                const baseInventory = selectedItem.oh + selectedItem.oo;
                                                let runningInv = baseInventory;
                                                const projectedInv = periods.map((p, idx) => {
                                                    if (idx === 1) {
                                                        runningInv += selectedItem.toBuy; 
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
                                                                        <span className="absolute -top-4 right-0 text-[9px] text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-[#0a0a0a] px-1 rounded">Stock 0</span>
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
                                                                        <div className="absolute w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(p.y1)}% - 4px)` }} title={`Año 1 P${p.period}: ${p.y1}`}></div>
                                                                        <div className="absolute w-2 h-2 bg-purple-500 dark:bg-purple-600 rounded-full" style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(p.y2)}% - 4px)` }} title={`Año 2 P${p.period}: ${p.y2}`}></div>
                                                                        <div className="absolute w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-sm rotate-45 z-10" style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(p.fcst)}% - 4px)` }} title={`Forecast P${p.period}: ${p.fcst.toFixed(1)}`}></div>
                                                                        
                                                                        {/* Nodos del Inventario */}
                                                                        <div className={`absolute w-2 h-2 ${inv < 0 ? 'bg-red-500' : 'bg-blue-500'} rounded-full z-20 border border-white dark:border-black shadow-sm`} style={{ left: `calc(${x}% - 4px)`, top: `calc(${getY(inv)}% - 4px)` }} title={`Inv. Proyectado P${p.period}: ${inv.toFixed(1)}`}></div>
                                                                    </React.Fragment>
                                                                )
                                                            })}
                                                            
                                                            {/* Punto de Inventario Inicial (Arranque) */}
                                                            <div className="absolute w-3.5 h-3.5 bg-blue-500 dark:bg-blue-400 rounded-full z-30 border-2 border-white shadow-md" style={{ left: `calc(${getX(0)}% - 7px)`, top: `calc(${getY(baseInventory)}% - 7px)` }} title={`Inventario Actual (OH + OO): ${baseInventory}`}></div>
                                                        </div>
                                                        
                                                        {/* EJE X (Etiquetas de Periodos) */}
                                                        <div className="absolute -bottom-6 left-0 w-full flex justify-between text-[9px] text-gray-500 font-bold">
                                                            {periods.map((p, i) => (
                                                                <div key={i} className="absolute text-center w-8 -ml-4" style={{ left: `${getX(i)}%` }}>
                                                                    P{p.period}
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

                                    {/* Gráficos de Dispersión (Antes y Después) LADO A LADO */}
                                    {(() => {
                                        const skuData = computedData.filter(d => d.sku === selectedItem.sku);
                                        
                                        const maxX = Math.max(...skuData.map(d => d.forecast), 1) * 1.1; 
                                        const maxY = Math.max(...skuData.map(d => d.oh + d.oo + d.toBuy), 1) * 1.1;

                                        const beforeData = skuData.map(d => ({ x: d.forecast, y: d.oh + d.oo, label: d.centro }));
                                        const afterData = skuData.map(d => ({ x: d.forecast, y: d.oh + d.oo + d.toBuy, label: d.centro }));

                                        const regBefore = calculateRegression(beforeData);
                                        const regAfter = calculateRegression(afterData);

                                        const getX = x => (x / maxX) * 100;
                                        const getY = y => 100 - (y / maxY) * 100;

                                        return (
                                            <div className="flex-none flex flex-col sm:flex-row gap-4 min-h-[250px] mb-4">
                                                
                                                {/* Gráfico 1: Antes */}
                                                <div className="flex-1 border border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#0a0a0a] rounded-lg p-3 flex flex-col relative transition-colors overflow-hidden">
                                                    <div className="flex justify-between items-start z-10 mb-2">
                                                        <div>
                                                            <h3 className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Antes (Inv. Inicial)</h3>
                                                            <p className="text-[8px] text-gray-400 italic">Puntos superpuestos se oscurecen</p>
                                                        </div>
                                                        <span className="text-[9px] text-red-600 dark:text-red-500 font-bold bg-white dark:bg-[#141414] px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/50" title="1.0 = Distribución Perfecta">R²: {regBefore.r2.toFixed(4)}</span>
                                                    </div>
                                                    <div className="flex-1 relative w-full h-full ml-4 mb-3">
                                                        <div className="absolute top-0 bottom-0 left-0 border-l border-gray-400 dark:border-gray-600"></div>
                                                        <div className="absolute bottom-0 left-0 right-0 border-b border-gray-400 dark:border-gray-600"></div>
                                                        
                                                        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                            <line x1={0} y1={getY(regBefore.b)} x2={100} y2={getY(regBefore.m * maxX + regBefore.b)} className="stroke-red-500" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                                                        </svg>
                                                        
                                                        {beforeData.map((p, i) => (
                                                            <div key={i} className="absolute w-2.5 h-2.5 bg-blue-600/40 dark:bg-blue-400/50 rounded-full cursor-pointer hover:scale-150 hover:bg-blue-500 transition-transform z-10 mix-blend-multiply dark:mix-blend-screen" style={{ left: `calc(${getX(p.x)}% - 5px + ${getJitterX(i)}px)`, top: `calc(${getY(p.y)}% - 5px + ${getJitterY(i)}px)` }} title={`Centro: ${p.label}\nDemanda (Fcst): ${p.x}\nInv Inicial (OH+OO): ${p.y}`}></div>
                                                        ))}
                                                    </div>
                                                    <div className="absolute bottom-1 right-2 text-[8px] text-gray-500 dark:text-gray-400 font-bold">Demanda</div>
                                                    <div className="absolute top-[40%] -left-3 text-[8px] text-gray-500 dark:text-gray-400 -rotate-90 font-bold tracking-widest">Inv. Inicial</div>
                                                </div>

                                                {/* Gráfico 2: Después */}
                                                <div className="flex-1 border border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#0a0a0a] rounded-lg p-3 flex flex-col relative transition-colors overflow-hidden">
                                                    <div className="flex justify-between items-start z-10 mb-2">
                                                        <div>
                                                            <h3 className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Después (Inv. + Compra)</h3>
                                                            <p className="text-[8px] text-gray-400 italic">Puntos superpuestos se oscurecen</p>
                                                        </div>
                                                        <span className="text-[9px] text-red-600 dark:text-red-500 font-bold bg-white dark:bg-[#141414] px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/50" title="1.0 = Distribución Perfecta">R²: {regAfter.r2.toFixed(4)}</span>
                                                    </div>
                                                    <div className="flex-1 relative w-full h-full ml-4 mb-3">
                                                        <div className="absolute top-0 bottom-0 left-0 border-l border-gray-400 dark:border-gray-600"></div>
                                                        <div className="absolute bottom-0 left-0 right-0 border-b border-gray-400 dark:border-gray-600"></div>

                                                        <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                            <line x1={0} y1={getY(regAfter.b)} x2={100} y2={getY(regAfter.m * maxX + regAfter.b)} className="stroke-red-500" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                                                        </svg>
                                                        
                                                        {afterData.map((p, i) => (
                                                            <div key={i} className="absolute w-2.5 h-2.5 bg-green-600/40 dark:bg-green-400/50 rounded-full cursor-pointer hover:scale-150 hover:bg-green-500 transition-transform z-10 mix-blend-multiply dark:mix-blend-screen" style={{ left: `calc(${getX(p.x)}% - 5px + ${getJitterX(i)}px)`, top: `calc(${getY(p.y)}% - 5px + ${getJitterY(i)}px)` }} title={`Centro: ${p.label}\nDemanda (Fcst): ${p.x}\nInv Final: ${p.y}`}></div>
                                                        ))}
                                                    </div>
                                                    <div className="absolute bottom-1 right-2 text-[8px] text-gray-500 dark:text-gray-400 font-bold">Demanda</div>
                                                    <div className="absolute top-[40%] -left-3 text-[8px] text-gray-500 dark:text-gray-400 -rotate-90 font-bold tracking-widest">Inv. Final</div>
                                                </div>
                                                
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                                    <BarChart2 className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-xs text-center px-4 font-medium">Selecciona un registro</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* NUEVA TABLA: RESUMEN POR SKU / PERIODO */}
                    <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#262626] shadow-sm dark:shadow-none rounded-xl overflow-hidden flex flex-col h-[400px] mb-6 transition-colors">
                        <div className="p-3 border-b border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#1a1a1a] flex justify-between items-center flex-wrap gap-2 transition-colors">
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
                                <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-[#0f0f0f] sticky top-0 z-10 shadow-sm dark:shadow-md transition-colors">
                                    <tr>
                                        <th className="px-3 py-3 font-semibold border-r border-gray-200 dark:border-[#262626]">SKU</th>
                                        <th className="px-3 py-3 font-semibold border-r border-gray-200 dark:border-[#262626]">Marca</th>
                                        <th className="px-3 py-3 font-semibold border-r border-gray-200 dark:border-[#262626]">Nombre</th>
                                        <th className="px-3 py-3 font-semibold text-yellow-600 dark:text-yellow-400 border-r border-gray-200 dark:border-[#262626]">Total a Comprar</th>
                                        {periodColumnsArray.map(p => (
                                            <th key={p} className="px-3 py-3 font-semibold text-center border-r border-gray-200 dark:border-[#262626]">FCST P{p}</th>
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

import React, { useState, useMemo, useEffect,useRef } from 'react';
import { Menu, Settings, Store, Package, Upload, ArrowUpDown, Sliders, Layers, MoreVertical, Sun, Moon, Info, Map, Database, Activity } from 'lucide-react';
import { useGlobal, useDispatch, globalActions } from '../context/GlobalContext';

// ============================================================================
// COMPONENTE EXTERNO: GRÁFICA DE DISPERSIÓN (Para evitar errores de React)
// ============================================================================
const ScatterPlot = ({ data, title, subtitle, colorClass, maxVentas, maxInv, t }) => {
  let trendline = null;
  const n = data.length;
  
  if (n > 1) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    data.forEach(d => { sumX += d.x; sumY += d.y; sumXY += d.x * d.y; sumXX += d.x * d.x; });
    const denominator = (n * sumXX - sumX * sumX);
    
    if (denominator !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        const y1 = slope * 0 + intercept;
        const y2 = slope * maxVentas + intercept;
        trendline = { 
          y1: 100 - (y1 / maxInv) * 100, 
          y2: 100 - (y2 / maxInv) * 100 
        };
    }
  }

  return (
    <div className={`p-5 rounded-xl border flex flex-col col-span-1 ${t.cardInner}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className={`text-sm font-bold flex items-center ${t.textMain}`}><Activity size={16} className="mr-2"/> {title}</h4>
          <p className={`text-[10px] ${t.textMuted}`}>{subtitle}</p>
        </div>
        <div className="flex flex-col items-end text-[9px] gap-1">
           <div className="flex items-center"><span className="w-6 border-t-2 border-dashed border-red-500 mr-1"></span> R² Tendencia</div>
           <div className="flex items-center"><span className={`w-2 h-2 rounded-full ${colorClass.replace('text-', 'bg-')} mr-1`}></span> Tiendas</div>
        </div>
      </div>
      
      <div className="relative h-48 w-full border-l border-b border-zinc-700/50 flex mt-auto">
        <svg className="w-full h-full absolute inset-0 overflow-visible">
          <line x1="0" y1="25%" x2="100%" y2="25%" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4"/>
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4"/>
          <line x1="0" y1="75%" x2="100%" y2="75%" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4"/>
          
          {trendline && !isNaN(trendline.y1) && !isNaN(trendline.y2) && (
            <line x1="0%" y1={`${trendline.y1}%`} x2="100%" y2={`${trendline.y2}%`} stroke="#ef4444" strokeWidth="2" strokeDasharray="6" className="opacity-70" />
          )}

          {data.map((d, i) => {
            if(maxVentas === 0 || maxInv === 0) return null;
            const cx = `${(d.x / maxVentas) * 100}%`;
            const cy = `${Math.max(0, Math.min(100, 100 - (d.y / maxInv) * 100))}%`; 
            return (
              <g key={i} className="group cursor-crosshair">
                <circle cx={cx} cy={cy} r="4" className={`opacity-60 hover:opacity-100 transition-all hover:r-6 fill-current ${colorClass}`} />
                <title>{`${d.name}\nVentas Históricas: $${d.x.toLocaleString()}\nOH Antes: ${d.oh}\nEnvío Nuevo: ${d.env}\nInventario Total: ${d.oh + d.env}`}</title>
              </g>
            );
          })}
        </svg>
        
        <div className="absolute -left-9 top-0 bottom-0 flex flex-col justify-between text-[8px] text-zinc-500 py-1 text-right pr-2 bg-transparent">
          <span>{Math.round(maxInv)}</span>
          <span>{Math.round(maxInv/2)}</span>
          <span>0</span>
        </div>
        <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[8px] text-zinc-500 px-1">
          <span>$0</span>
          <span>Ventas</span>
          <span>${Math.round(maxVentas).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Distribucion() {
  // --- INICIALIZACIÓN DEL CONTEXTO GLOBAL ---
  const gDispatch = useDispatch ? useDispatch() : null;
  const gState    = useGlobal ? useGlobal() : null;
  const otbDisponible = !!gState?.otbData;

  const [theme, setTheme] = useState('light'); // Por defecto light para tu layout
  const [activeTab, setActiveTab] = useState(1); 
  const fileInputRef = useRef(null);
  const chequeraFileInputRef = useRef(null);
  
  // --- 1. ESTADO DE BASE Y CLÚSTERES ---
  const [numClusters, setNumClusters] = useState(6);
  const activeClusters = useMemo(() => {
    if (numClusters === 6) return ['AA', 'A', 'B', 'C', 'D', 'E'];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({length: numClusters}, (_, i) => alphabet[i]);
  }, [numClusters]);

  const [rawStoreData, setRawStoreData] = useState([]);
  const [scoreWeights, setScoreWeights] = useState({ sales: 50, margin: 30, rotation: 20 });
  const [stores, setStores] = useState([]);
  const [goas, setGoas] = useState([]);
  const [storeSortBy, setStoreSortBy] = useState('score'); 
  const [storeSortOrder, setStoreSortOrder] = useState('desc');
  
  const [brandMatrix, setBrandMatrix] = useState({}); 
  const [matrixMetadata, setMatrixMetadata] = useState({ sections: [], brandsBySection: {}, allBrands: [] });
  const [selectedGoaFilter, setSelectedGoaFilter] = useState('ALL'); 

  // --- 2. ESTADO DE CHEQUERA Y SURTIDO ---
  const [entryMode, setEntryMode] = useState('MANUAL'); 
  const [modelsInputText, setModelsInputText] = useState('');
  const [manualEntry, setManualEntry] = useState({ seccion: '', goa: '', marca: '', modelo: '', sku: '', color: '', talla: '', qty: '' });
  
  const [chequera, setChequera] = useState([]); 
  const [editingItem, setEditingItem] = useState(null); 
  const [distributionResult, setDistributionResult] = useState([]);
  
  const [considerOH, setConsiderOH] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  // --- MOTOR DE TEMAS ---
  const themes = {
    dark: {
      appBg: "bg-transparent text-gray-100", 
      card: "bg-zinc-900 border-zinc-800 shadow-sm", cardInner: "bg-zinc-950 border-zinc-800",
      textMain: "text-white", textMuted: "text-gray-400", textAccent1: "text-purple-400", textAccent2: "text-yellow-400",
      iconAccent1: "text-purple-400 bg-purple-900/30", iconAccent2: "text-yellow-400 bg-yellow-500/20",
      border: "border-zinc-800", input: "bg-zinc-950 border-zinc-700 text-white focus:ring-purple-500",
      inputYellow: "bg-zinc-950 border-zinc-700 text-yellow-400 font-bold focus:ring-yellow-500",
      btnPrimary: "bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]",
      btnGhost: "bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700",
      badgeAA: "text-purple-400 bg-purple-900/30 border-purple-500/50", badgeA: "text-yellow-400 bg-yellow-900/30 border-yellow-500/50", badgeOther: "text-gray-300 bg-zinc-800 border-zinc-600",
      tabActive: "border-purple-500 text-purple-400",
    },
    light: {
      appBg: "bg-transparent text-gray-800", 
      card: "bg-white border-gray-200 shadow-sm", cardInner: "bg-gray-50 border-gray-200",
      textMain: "text-gray-900", textMuted: "text-gray-500", textAccent1: "text-blue-600", textAccent2: "text-indigo-600",
      iconAccent1: "text-blue-600 bg-blue-50", iconAccent2: "text-indigo-600 bg-indigo-50",
      border: "border-gray-200", input: "bg-white border-gray-300 text-gray-900 focus:ring-blue-500",
      inputYellow: "bg-white border-gray-300 text-indigo-700 font-bold focus:ring-indigo-500",
      btnPrimary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md",
      btnGhost: "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200",
      badgeAA: "text-indigo-700 bg-indigo-100 border-indigo-200", badgeA: "text-blue-700 bg-blue-100 border-blue-200", badgeOther: "text-gray-600 bg-gray-100 border-gray-200",
      tabActive: "border-blue-600 text-blue-600",
    }
  };
  const t = themes[theme];

  // --- LÓGICA CORE Y PARSERS ---
  const parseCSVRow = (row, sep) => {
    return row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`)).map(c => c.replace(/^"|"$/g, '').trim());
  };

  const recalculateClusters = (rawData, weights, currentClusters) => {
    if(!rawData || rawData.length === 0) return;
    const dataByGoa = {};
    const storeMap = new Map();
    const maxVals = {}; 

    rawData.forEach(row => {
      const goa = row.goa;
      if (!dataByGoa[goa]) { dataByGoa[goa] = []; maxVals[goa] = { sales: 0, margin: 0, rotation: 0 }; }
      dataByGoa[goa].push(row);
      
      if (row.sales > maxVals[goa].sales) maxVals[goa].sales = row.sales;
      if (row.margin > maxVals[goa].margin) maxVals[goa].margin = row.margin;
      if (row.rotation > maxVals[goa].rotation) maxVals[goa].rotation = row.rotation;

      if (!storeMap.has(row.centro)) {
        storeMap.set(row.centro, { 
          id: row.centro, centerCode: row.centro, name: row.name, zona: row.zona,
          sales: row.sales, margin: row.margin, rotation: row.rotation, totalOH: row.oh,
          score: 0, goaScores: {}, goaSales: {}, goaOH: {}, clusters: {} 
        });
      } else {
        const existing = storeMap.get(row.centro);
        existing.sales = (existing.sales + row.sales) / 2; 
        existing.margin = (existing.margin + row.margin) / 2;
        existing.rotation = (existing.rotation + row.rotation) / 2;
        existing.totalOH += row.oh;
      }
    });

    Object.keys(dataByGoa).forEach(goaName => {
      const storesInGoa = dataByGoa[goaName].map(item => {
        const nSales = maxVals[goaName].sales > 0 ? item.sales / maxVals[goaName].sales : 0;
        const nMargin = maxVals[goaName].margin > 0 ? item.margin / maxVals[goaName].margin : 0;
        const nRot = maxVals[goaName].rotation > 0 ? item.rotation / maxVals[goaName].rotation : 0;
        const score = (nSales * weights.sales) + (nMargin * weights.margin) + (nRot * weights.rotation);
        return { ...item, score };
      });

      const numClust = currentClusters.length;
      storesInGoa.forEach((item) => {
        let normalizedScore = item.score / 100;
        if (normalizedScore > 1) normalizedScore = 1;
        if (normalizedScore < 0) normalizedScore = 0;

        let clusterIndex = Math.floor((1 - normalizedScore) * numClust);
        if (clusterIndex >= numClust) clusterIndex = numClust - 1;
        
        const store = storeMap.get(item.centro);
        store.clusters[goaName] = currentClusters[clusterIndex];
        store.goaScores[goaName] = item.score; 
        store.goaSales[goaName] = item.sales; 
        store.goaOH[goaName] = (store.goaOH[goaName] || 0) + item.oh; 
        store.score = (store.score + item.score) / 2; 
      });

      setGoas(prev => {
        if (!prev.find(g => g.name.toUpperCase() === goaName)) {
          const formatted = goaName.charAt(0).toUpperCase() + goaName.slice(1).toLowerCase();
          return [...prev, { id: Date.now() + Math.random(), name: formatted }];
        }
        return prev;
      });
    });

    Array.from(storeMap.values()).forEach(store => {
      let normalizedScore = store.score / 100;
      if (normalizedScore > 1) normalizedScore = 1;
      if (normalizedScore < 0) normalizedScore = 0;
      let clusterIndex = Math.floor((1 - normalizedScore) * currentClusters.length);
      if (clusterIndex >= currentClusters.length) clusterIndex = currentClusters.length - 1;
      store.globalCluster = currentClusters[clusterIndex];
    });

    setStores(Array.from(storeMap.values()));
  };

  useEffect(() => {
    if (rawStoreData.length > 0) recalculateClusters(rawStoreData, scoreWeights, activeClusters);
  }, [scoreWeights, activeClusters]);


  // --- CARGAS Y LECTURAS (Con ISO-8859-1 para Acentos) ---
  const handleStoreCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const sep = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
      const rows = text.split('\n').map(row => parseCSVRow(row, sep));
      
      if (rows.length < 2) { if(fileInputRef.current) fileInputRef.current.value = ''; return; }

      const headers = rows[0].map(h => h.toUpperCase());
      const idxCentro = headers.findIndex(h => h === 'CENTRO' || h === 'ID');
      const idxNombre = headers.findIndex(h => h === 'NOMBRE' || h === 'TIENDA' || h === 'DESC CENTRO');
      const idxGoa = headers.findIndex(h => h === 'GOA' || h === 'FAMILIA');
      const idxVentas = headers.findIndex(h => h === 'VENTAS' || h === 'VTA' || h.includes('VTAS'));
      const idxMargen = headers.findIndex(h => h === 'MARGEN' || h === 'MG' || h.includes('%GM'));
      const idxRotacion = headers.findIndex(h => h === 'ROTACION' || h === 'ROT' || h.includes('SELL'));
      const idxOH = headers.findIndex(h => h === 'OH' || h === 'INV' || h === 'INVENTARIO' || h === 'STOCK');
      const idxZona = headers.findIndex(h => h === 'ZONA' || h === 'REGION' || h === 'DISTRITO');

      if (idxCentro === -1 || idxGoa === -1 || idxVentas === -1) {
        alert("El CSV debe tener mínimamente las columnas: Centro, GOA, Ventas"); 
        if(fileInputRef.current) fileInputRef.current.value = ''; return;
      }

      const extractedRawData = [];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][idxCentro] || !rows[i][idxGoa]) continue;
        const rawVentas = rows[i][idxVentas] ? String(rows[i][idxVentas]).replace(/[^0-9.-]+/g, "") : "0";
        const rawMargen = idxMargen !== -1 && rows[i][idxMargen] ? String(rows[i][idxMargen]).replace(/[^0-9.-]+/g, "") : "0";
        const rawRotacion = idxRotacion !== -1 && rows[i][idxRotacion] ? String(rows[i][idxRotacion]).replace(/[^0-9.-]+/g, "") : "1";
        const rawOH = idxOH !== -1 && rows[i][idxOH] ? String(rows[i][idxOH]).replace(/[^0-9.-]+/g, "") : "0";
        
        let ventas = parseFloat(rawVentas) || 0; let margen = parseFloat(rawMargen) || 0; let rotacion = parseFloat(rawRotacion) || 0;
        let oh = parseFloat(rawOH) || 0;
        if (margen > 1 && margen <= 100) margen = margen / 100; 

        extractedRawData.push({
          centro: rows[i][idxCentro], name: idxNombre !== -1 ? rows[i][idxNombre] : rows[i][idxCentro],
          zona: idxZona !== -1 && rows[i][idxZona] ? rows[i][idxZona] : 'General',
          goa: rows[i][idxGoa].toUpperCase(), sales: ventas, margin: margen, rotation: rotacion, oh: oh
        });
      }
      
      setGoas([]); setStores([]); setRawStoreData(extractedRawData);
      recalculateClusters(extractedRawData, scoreWeights, activeClusters);
      if(fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1'); 
  };

  const handleBrandMatrixUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const sep = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
      const rows = text.split('\n').map(row => parseCSVRow(row, sep));
      if (rows.length < 2) { e.target.value = ''; return; }

      let headerRow = -1;
      let marcaCol = -1, nomMarcaCol = -1;
      let seccionCol = -1, nomSeccionCol = -1;

      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const rowUpper = rows[i].map(c => c?.toUpperCase() || '');
        if (rowUpper.includes('MARCA') || rowUpper.includes('NOM_MARCA')) {
          headerRow = i;
          marcaCol = rowUpper.indexOf('MARCA');
          nomMarcaCol = rowUpper.indexOf('NOM_MARCA');
          seccionCol = rowUpper.indexOf('SECCIÓN') > -1 ? rowUpper.indexOf('SECCIÓN') : rowUpper.indexOf('SECCION');
          nomSeccionCol = rowUpper.indexOf('NOM_SECCIÓN') > -1 ? rowUpper.indexOf('NOM_SECCIÓN') : rowUpper.indexOf('NOM_SECCION');
          break;
        }
      }

      if (headerRow === -1) {
        alert("Formato no reconocido: No se encontró la columna 'MARCA' o 'NOM_MARCA'");
        e.target.value = ''; return;
      }

      const bestMarcaCol = nomMarcaCol > -1 ? nomMarcaCol : marcaCol;
      const bestSeccionCol = nomSeccionCol > -1 ? nomSeccionCol : seccionCol;

      const storeCols = [];
      const startDataCol = Math.max(bestMarcaCol, bestSeccionCol, 0) + 1;
      
      for (let i = 0; i <= headerRow; i++) {
        for (let j = startDataCol; j < rows[i].length; j++) {
          let cellVal = rows[i][j]?.trim();
          if (cellVal && cellVal.match(/^\d+$/) && !storeCols.find(sc => sc.colIndex === j)) {
            storeCols.push({ colIndex: j, storeId: parseInt(cellVal).toString() }); 
          }
        }
      }

      if (storeCols.length === 0) {
        alert("No se detectaron los números de Centro (Columnas) en el archivo cruzado.");
        e.target.value = ''; return;
      }

      const matrix = {};
      const metaSections = new Set();
      const metaBrandsBySection = {};
      const metaAllBrands = new Set();

      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        
        const marcaNom = bestMarcaCol > -1 ? (row[bestMarcaCol]?.trim().toUpperCase() || 'N/A') : 'N/A';
        const seccionNom = bestSeccionCol > -1 ? (row[bestSeccionCol]?.trim().toUpperCase() || 'N/A') : 'N/A';
        
        if (marcaNom === 'N/A' && seccionNom === 'N/A') continue; 
        
        const finalSeccion = seccionNom !== 'N/A' ? seccionNom : 'GENERAL';
        if (finalSeccion !== 'GENERAL') metaSections.add(finalSeccion);
        if (marcaNom !== 'N/A') metaAllBrands.add(marcaNom);
        
        if (finalSeccion !== 'GENERAL' && marcaNom !== 'N/A') {
           if (!metaBrandsBySection[finalSeccion]) metaBrandsBySection[finalSeccion] = new Set();
           metaBrandsBySection[finalSeccion].add(marcaNom);
        }

        storeCols.forEach(sc => {
          const isAuthorized = row[sc.colIndex]?.trim().toUpperCase();
          if (isAuthorized && isAuthorized !== 'NO' && isAuthorized !== 'N' && isAuthorized !== '0') {
            const cId = sc.storeId;
            if (!matrix[cId]) matrix[cId] = [];
            const combo = `${seccionNom}|${marcaNom}`;
            if (!matrix[cId].includes(combo)) matrix[cId].push(combo);
          }
        });
      }
      
      setBrandMatrix(matrix);
      setMatrixMetadata({
         sections: Array.from(metaSections).sort(),
         brandsBySection: Object.fromEntries(Object.entries(metaBrandsBySection).map(([k, v]) => [k, Array.from(v).sort()])),
         allBrands: Array.from(metaAllBrands).sort()
      });

      alert(`Matriz Dinámica cargada con éxito.\nSe detectaron ${storeCols.length} Tiendas y se registraron sus Marcas/Secciones permitidas.`);
      e.target.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1'); 
  };


  // --- CÁLCULOS VISUALES Y ORDENAMIENTO ---
  const storeStats = useMemo(() => {
    const stats = { total: stores.length, goas: goas.length, clusters: { 'Sin Asignar': 0 } };
    activeClusters.forEach(c => stats.clusters[c] = 0);
    stores.forEach(s => {
      const clusterValues = Object.values(s.clusters);
      if(clusterValues.length === 0) stats.clusters['Sin Asignar']++;
      else { const primaryCluster = clusterValues[0]; if(stats.clusters[primaryCluster] !== undefined) stats.clusters[primaryCluster]++; }
    });
    return stats;
  }, [stores, goas, activeClusters]);

  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      let valA = a[storeSortBy]; let valB = b[storeSortBy];
      if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
      if (valA < valB) return storeSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return storeSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [stores, storeSortBy, storeSortOrder]);

  const toggleSort = (field) => {
    if (storeSortBy === field) setStoreSortOrder(storeSortOrder === 'asc' ? 'desc' : 'asc');
    else { setStoreSortBy(field); setStoreSortOrder('desc'); }
  };

  const displayedStores = useMemo(() => {
    if (selectedGoaFilter === 'ALL') return sortedStores;
    return sortedStores.filter(s => s.clusters[selectedGoaFilter]);
  }, [sortedStores, selectedGoaFilter]);

  const downloadClusterMatrix = () => {
    if (stores.length === 0) return;
    const rows = [['CENTRO', 'NOMBRE', 'ZONA', 'CLUSTER_GLOBAL', 'SCORE_GLOBAL', 'GOA', 'CLUSTER_GOA', 'SCORE_GOA', 'VENTAS', 'OH', 'ROTACION']];
    const storesToExport = selectedGoaFilter === 'ALL' ? stores : displayedStores;

    storesToExport.forEach(s => {
      Object.keys(s.clusters).forEach(goa => {
        if (selectedGoaFilter !== 'ALL' && goa !== selectedGoaFilter) return;
        rows.push([
          s.centerCode, `"${s.name}"`, `"${s.zona}"`, s.globalCluster, Math.round(s.score),
          `"${goa}"`, s.clusters[goa], Math.round(s.goaScores[goa]), s.goaSales[goa], s.goaOH[goa] || 0, s.rotation
        ]);
      });
    });

    const csvContent = rows.map(e => e.join(",")).join("\n");
    triggerDownload(`Matriz_Clusters_${selectedGoaFilter}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
  };


  // --- LÓGICA DE CORRIDAS DE TALLAS Y CHEQUERA ---
  const createSizeRuns = (baseItem, tallaStr, qtyStr) => {
      const qtys = qtyStr.toString().split(/[,|/;\t-]+/).map(q => parseInt(q.trim())).filter(q => !isNaN(q) && q > 0);
      if (qtys.length === 0) return [];
      
      const tallas = (tallaStr || '').toString().split(/[,|/;\t]+/).map(t => t.trim()).filter(t => t);
      
      return qtys.map((q, i) => {
          let t = tallas[i];
          if (!t) {
              if (tallas[0] && !isNaN(parseFloat(tallas[0]))) {
                  t = String(parseFloat(tallas[0]) + i); 
              } else {
                  t = tallas[0] || 'UNICA'; 
              }
          }
          
          let finalSku = baseItem.sku;
          let finalModelo = baseItem.modelo || `GEN-${baseItem.goa.substring(0,3).toUpperCase()}`;
          
          if (!finalSku || finalSku === 'N/A') {
             const extColor = baseItem.color && baseItem.color !== 'N/A' ? `-${baseItem.color.substring(0,3).toUpperCase()}` : '';
             const extTalla = t !== 'UNICA' ? `-${t}` : '';
             finalSku = `${finalModelo}${extColor}${extTalla}`.replace(/\s+/g, '');
          }

          return { ...baseItem, id: Date.now() + Math.random() + i, talla: t, qty: q, sku: finalSku, modelo: finalModelo };
      });
  };

  const handleManualAdd = () => {
    const { seccion, goa, marca, modelo, sku, color, talla, qty } = manualEntry;
    if (!goa || !qty) return alert("Los campos GOA y Cantidad son obligatorios.");
    
    const baseItem = {
      seccion: seccion.toUpperCase() || 'N/A',
      goa: goa.toUpperCase(),
      marca: marca.toUpperCase() || 'N/A',
      modelo: modelo.trim().toUpperCase() || 'N/A',
      color: color.toUpperCase() || 'N/A',
      sku: sku.trim()
    };

    const newRuns = createSizeRuns(baseItem, talla, qty);
    setChequera(prev => [...prev, ...newRuns]);

    setManualEntry(prev => ({...prev, sku: '', color: '', talla: '', qty: ''}));
    setDistributionResult([]);
  };
  
  const handleBulkAddModels = () => {
    if (!modelsInputText.trim()) return;
    
    const lines = modelsInputText.split('\n').map(m => m.trim()).filter(m => m !== '');
    const newChequeraItems = [];
    let errores = 0;

    lines.forEach(line => {
      const hasTabs = line.includes('\t');
      let parts = hasTabs ? line.split('\t').map(p => p.trim()) : line.split(/[,;]+/).map(p => p.trim());
      
      if (parts.length < 3) parts = line.split(/\s{2,}/).map(p => p.trim()); 
      if (parts.length < 3) { errores++; return; }
      if (parts[0].toUpperCase() === 'GOA' || parts[0].toUpperCase() === 'SECCION' || parts[0].toUpperCase() === 'SECCIÓN') return;

      let seccion = 'N/A', goa = 'N/A', marca = 'N/A', modelo = 'N/A', sku = '', color = 'N/A', talla = 'N/A', qty = '';

      const n = parts.length;
      qty = parts[n - 1];

      if (n >= 8) {
        seccion = parts[0]; goa = parts[1]; marca = parts[2]; modelo = parts[3]; sku = parts[4]; color = parts[5]; talla = parts[6];
      } else if (n === 7) {
        goa = parts[0]; marca = parts[1]; modelo = parts[2]; sku = parts[3]; color = parts[4]; talla = parts[5];
      } else if (n === 6) {
        goa = parts[0]; modelo = parts[1]; sku = parts[2]; color = parts[3]; talla = parts[4];
      } else if (n === 5) {
        goa = parts[0]; modelo = parts[1]; sku = parts[2]; talla = parts[3];
      } else if (n === 4) {
        goa = parts[0]; modelo = parts[1]; sku = parts[2];
      } else {
        goa = parts[0]; sku = parts[1]; modelo = parts[1];
      }

      if (qty && goa && (sku || modelo)) {
        const baseItem = { seccion: seccion.toUpperCase(), goa: goa.toUpperCase(), marca: marca.toUpperCase(), modelo: modelo.toUpperCase(), sku, color: color.toUpperCase() };
        newChequeraItems.push(...createSizeRuns(baseItem, talla, qty));
      } else {
        errores++;
      }
    });

    if (newChequeraItems.length === 0) {
      alert(`No se detectó el formato correcto. Recuerda el orden de las 8 columnas recomendadas.`);
      return;
    }
    if (errores > 0) alert(`Se importaron las líneas, se ignoraron ${errores} filas por mal formato.`);

    setChequera([...chequera, ...newChequeraItems]);
    setModelsInputText('');
    setDistributionResult([]); 
  };

  const handleChequeraCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const sep = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
      const rows = text.split('\n').map(row => parseCSVRow(row, sep));
      
      const newItems = [];
      let errores = 0;

      let startIndex = 0;
      if (rows[0] && rows[0].some(c => c.toUpperCase().includes('GOA') || c.toUpperCase().includes('SKU') || c.toUpperCase().includes('MODELO'))) {
        startIndex = 1;
      }

      for (let i = startIndex; i < rows.length; i++) {
        const parts = rows[i];
        if (parts.length >= 3) {
           let seccion = 'N/A', goa = 'N/A', marca = 'N/A', modelo = 'N/A', sku = '', color = 'N/A', talla = 'N/A', qty = '';
           const n = parts.length;
           qty = parts[n - 1];

           if (n >= 8) {
             seccion = parts[0]; goa = parts[1]; marca = parts[2]; modelo = parts[3]; sku = parts[4]; color = parts[5]; talla = parts[6];
           } else if (n === 7) {
             goa = parts[0]; marca = parts[1]; modelo = parts[2]; sku = parts[3]; color = parts[4]; talla = parts[5];
           } else if (n === 6) {
             goa = parts[0]; modelo = parts[1]; sku = parts[2]; color = parts[3]; talla = parts[4];
           } else if (n === 5) {
             goa = parts[0]; modelo = parts[1]; sku = parts[2]; talla = parts[3];
           } else if (n === 4) {
             goa = parts[0]; modelo = parts[1]; sku = parts[2];
           } else {
             goa = parts[0]; sku = parts[1]; modelo = parts[1];
           }

           if (qty && goa && (sku || modelo)) {
              const baseItem = { seccion: seccion.toUpperCase(), goa: goa.toUpperCase(), marca: marca.toUpperCase(), modelo: modelo.toUpperCase(), sku, color: color.toUpperCase() };
              newItems.push(...createSizeRuns(baseItem, talla, qty));
           } else {
              errores++;
           }
        } else if (parts.length > 0 && parts[0] !== "") {
           errores++;
        }
      }
      
      if (newItems.length > 0) {
         setChequera(prev => [...prev, ...newItems]);
         setDistributionResult([]);
      } else {
         alert("No se detectaron datos válidos. Revisa las columnas.");
      }
      if(chequeraFileInputRef.current) chequeraFileInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const removeChequeraItem = (id) => {
    setChequera(chequera.filter(item => item.id !== id));
    setDistributionResult([]);
  };

  const startEditItem = (item) => {
    setEditingItem({ ...item });
  };

  const saveEditItem = () => {
    if(!editingItem.qty || !editingItem.goa) return alert("GOA y Cantidad son obligatorios");
    setChequera(prev => prev.map(i => i.id === editingItem.id ? {
      ...editingItem,
      seccion: editingItem.seccion.toUpperCase() || 'N/A',
      goa: editingItem.goa.toUpperCase(),
      marca: editingItem.marca.toUpperCase() || 'N/A',
      modelo: editingItem.modelo.toUpperCase() || 'N/A',
      color: editingItem.color?.toUpperCase() || 'N/A',
      talla: editingItem.talla?.toUpperCase() || 'UNICA',
      sku: editingItem.sku, 
      qty: parseInt(editingItem.qty)
    } : i));
    setEditingItem(null);
    setDistributionResult([]);
  };

  const processDistribution = () => {
    const results = [];
    const warnings = []; 
    
    // Clonar el Inventario (OH) inicial para actualizarlo dinámicamente corrida por corrida
    const dynamicOH = {};
    stores.forEach(s => {
       dynamicOH[s.centerCode] = { ...s.goaOH };
    });
    
    chequera.forEach(item => {
      let qtyToDistribute = parseInt(item.qty);
      if (qtyToDistribute <= 0) return;

      const goaName = item.goa.toUpperCase();
      let eligibleStores = stores.filter(s => s.goaScores && s.goaScores[goaName] > 0);
      
      if (eligibleStores.length === 0) {
         warnings.push(`[${item.sku}]: No hay tiendas con ventas o score > 0 para el GOA '${goaName}'.`);
         return;
      }

      if (Object.keys(brandMatrix).length > 0) {
         const preFilterCount = eligibleStores.length;
         eligibleStores = eligibleStores.filter(s => {
            const normStoreId = parseInt(s.centerCode).toString();
            const authBrands = brandMatrix[normStoreId] || [];
            
            const reqSeccion = item.seccion?.toUpperCase() || 'N/A';
            const reqMarca = item.marca?.toUpperCase() || 'N/A';
            
            if (reqSeccion === 'N/A' && reqMarca === 'N/A') return true;

            if (authBrands.includes(`${reqSeccion}|${reqMarca}`)) return true;
            if (reqSeccion === 'N/A' && authBrands.some(auth => auth.endsWith(`|${reqMarca}`))) return true;
            if (reqMarca === 'N/A' && authBrands.some(auth => auth.startsWith(`${reqSeccion}|`))) return true;
            if (authBrands.includes(`N/A|${reqMarca}`)) return true;

            return false;
         });

         if (eligibleStores.length === 0) {
            warnings.push(`[${item.sku}]: Ninguna tienda autorizada en la Matriz para SECCIÓN='${item.seccion}' / MARCA='${item.marca}'.`);
            return;
         }
      }

      const totalScore = eligibleStores.reduce((sum, s) => sum + s.goaScores[goaName], 0);
      const allocations = new Map();
      const remainders = [];
      let remainingQty = qtyToDistribute;

      if (considerOH) {
        let totalNeed = 0;
        const storeNeeds = [];
        
        // Calculamos usando el OH Dinámico (actualizado por tallas anteriores)
        let totalSystemOH = 0;
        eligibleStores.forEach(s => {
            totalSystemOH += (dynamicOH[s.centerCode][goaName] || 0);
        });
        
        const totalPool = totalSystemOH + qtyToDistribute; 

        eligibleStores.forEach(store => {
          const share = store.goaScores[goaName] / totalScore;
          const idealTotalQty = share * totalPool;
          const currentOH = dynamicOH[store.centerCode][goaName] || 0;
          
          let need = idealTotalQty - currentOH;
          if (need < 0) need = 0; 

          storeNeeds.push({ store, need });
          totalNeed += need;
        });

        if (totalNeed > 0) {
          storeNeeds.forEach(({ store, need }) => {
            const expectedQty = (need / totalNeed) * qtyToDistribute;
            const assignedQty = Math.floor(expectedQty);
            
            if (assignedQty > 0) {
              allocations.set(store.centerCode, assignedQty);
              remainingQty -= assignedQty;
            }
            remainders.push({ store, fraction: expectedQty - assignedQty });
          });
        } else {
            warnings.push(`[${item.sku}]: Las tiendas ya tienen suficiente OH global para este GOA. Usa 'Llenado Push' si quieres forzar envío.`);
            return;
        }
      } 
      
      if (!considerOH || allocations.size === 0) {
        eligibleStores.forEach(store => {
          const share = store.goaScores[goaName] / totalScore;
          const expectedQty = share * qtyToDistribute;
          const assignedQty = Math.floor(expectedQty);
          
          if (assignedQty > 0) {
            allocations.set(store.centerCode, assignedQty);
            remainingQty -= assignedQty;
          }
          remainders.push({ store, fraction: expectedQty - assignedQty });
        });
      }

      remainders.sort((a, b) => b.fraction - a.fraction);
      for (let i = 0; i < remainingQty; i++) {
        if(remainders.length === 0) break;
        const storeCenter = remainders[i % remainders.length].store.centerCode;
        allocations.set(storeCenter, (allocations.get(storeCenter) || 0) + 1);
      }

      // IMPORTANTE: Actualizar el OH dinámico para que la SIGUIENTE talla respete la dispersión real
      allocations.forEach((qty, centerCode) => {
        dynamicOH[centerCode][goaName] = (dynamicOH[centerCode][goaName] || 0) + qty;
        
        const storeObj = eligibleStores.find(s => s.centerCode === centerCode);
        results.push({
          centro: centerCode,
          nombre: storeObj ? storeObj.name : centerCode,
          zona: storeObj ? storeObj.zona : 'General',
          ventas: storeObj ? storeObj.goaSales[goaName] : 0, 
          score: storeObj ? storeObj.goaScores[goaName] : 0,
          globalCluster: storeObj ? storeObj.globalCluster : '',
          initialOH: storeObj ? (storeObj.goaOH[goaName] || 0) : 0,
          sku: item.sku,
          modelo: item.modelo,
          goa: goaName,
          marca: item.marca,
          color: item.color,
          talla: item.talla,
          qty: qty
        });
      });
    });
    
    if (warnings.length > 0) {
       alert("ATENCIÓN: Algunos modelos tuvieron bloqueos:\n\n" + warnings.join("\n\n"));
    }

    results.sort((a, b) => a.centro.localeCompare(b.centro) || a.sku.localeCompare(b.sku));
    setDistributionResult(results);

    // --- NUEVA INTEGRACIÓN CON GLOBAL CONTEXT ---
    try {
      const finalAllocations = {};
      results.forEach(r => { finalAllocations[r.centro] = (finalAllocations[r.centro] || 0) + r.qty; });
      const totalFcst = results.reduce((s, r) => s + r.qty, 0);
      const totalAlloc = Object.values(finalAllocations).reduce((a, b) => a + b, 0);
      const fillRate = totalFcst > 0 ? Math.min((totalAlloc / totalFcst) * 100, 100) : 0;
      
      if (typeof globalActions !== 'undefined' && gDispatch) {
        globalActions.publishDistribution(gDispatch, { allocations: finalAllocations, fillRate, result: results });
      }
    } catch (error) {
      console.log("Aviso: GlobalContext no detectado. Esto es normal en entornos aislados.");
    }
    // --------------------------------------------
  };

  const triggerDownload = (filename, content) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSAP = () => {
    if (distributionResult.length === 0) return;
    const csvContent = distributionResult.map(row => {
      const centroPad = String(row.centro).padStart(4, '0');
      return `880S,${centroPad},${row.sku},${row.qty}`;
    }).join('\n');
    triggerDownload(`SAP_Distribucion_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
  };

  const downloadO9 = () => {
    if (distributionResult.length === 0) return;
    const skuTotals = {};
    distributionResult.forEach(r => {
      skuTotals[r.sku] = (skuTotals[r.sku] || 0) + r.qty;
    });

    const csvContent = Object.entries(skuTotals).map(([sku, totalQty]) => {
      return `880S,${sku},${totalQty}`;
    }).join('\n');
    
    triggerDownload(`O9_Distribucion_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
  };

  // --- PREPARACIÓN DE DATOS PARA GRÁFICAS SIN COMPONENTES ANIDADOS ---
  const topStoresData = useMemo(() => {
    if (distributionResult.length === 0) return [];
    const agg = {};
    distributionResult.forEach(r => {
      if (!agg[r.nombre]) agg[r.nombre] = { qty: 0, cluster: r.globalCluster };
      agg[r.nombre].qty += r.qty;
    });
    return Object.entries(agg).map(([name, val]) => ({ name, qty: val.qty, cluster: val.cluster })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [distributionResult]);

  const topStoresMax = Math.max(...topStoresData.map(d => d.qty), 1);

  const modelsStoreData = useMemo(() => {
    if (distributionResult.length === 0) return { stores: [], models: [] };
    const agg = {};
    const modelsSet = new Set();
    distributionResult.forEach(r => {
      if (!agg[r.nombre]) agg[r.nombre] = { total: 0, models: {} };
      agg[r.nombre].total += r.qty;
      const dispModelo = r.modelo !== 'N/A' ? r.modelo : r.sku;
      agg[r.nombre].models[dispModelo] = (agg[r.nombre].models[dispModelo] || 0) + r.qty;
      modelsSet.add(dispModelo);
    });
    const sorted = Object.entries(agg).map(([name, val]) => ({ name, ...val })).sort((a, b) => b.total - a.total).slice(0, 15);
    return { stores: sorted, models: Array.from(modelsSet) };
  }, [distributionResult]);

  const modelsStoreMax = Math.max(...modelsStoreData.stores.map(d => d.total), 1);
  const modelsColors = ['bg-indigo-500', 'bg-pink-500', 'bg-amber-500', 'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-violet-500', 'bg-fuchsia-500'];

  const zonesData = useMemo(() => {
    if (distributionResult.length === 0) return [];
    const agg = {};
    distributionResult.forEach(r => {
      agg[r.zona] = (agg[r.zona] || 0) + r.qty;
    });
    return Object.entries(agg).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  }, [distributionResult]);

  const zonesMax = Math.max(...zonesData.map(d => d.qty), 1);

  const scatterData = useMemo(() => {
    if (distributionResult.length === 0) return { pre: [], post: [], maxInvPre: 10, maxInvPost: 10, maxVentas: 100 };
    const agg = {};
    distributionResult.forEach(r => {
      if(!agg[r.centro]) {
          agg[r.centro] = { name: r.nombre, env: 0, ohByGoa: {}, ventasByGoa: {} };
      }
      agg[r.centro].ohByGoa[r.goa] = r.initialOH;
      agg[r.centro].ventasByGoa[r.goa] = r.ventas;
      agg[r.centro].env += r.qty;
    });
    
    const pre = [];
    const post = [];
    
    Object.values(agg).forEach(d => {
        const totalOH = Object.values(d.ohByGoa).reduce((sum, val) => sum + val, 0);
        const totalVentas = Object.values(d.ventasByGoa).reduce((sum, val) => sum + val, 0);
        
        pre.push({ x: totalVentas, y: totalOH, name: d.name, oh: totalOH, env: 0 });
        post.push({ x: totalVentas, y: totalOH + d.env, name: d.name, oh: totalOH, env: d.env });
    });
    
    let preMax = Math.max(...pre.map(d => d.y), 5) * 1.1; 
    if (preMax === 0 || isNaN(preMax)) preMax = 10;

    let postMax = Math.max(...post.map(d => d.y), 5) * 1.1; 
    if (postMax === 0 || isNaN(postMax)) postMax = 10;

    let maxVentasVal = Math.max(...post.map(d => d.x), 100);
    
    return { pre: pre, post: post, maxInvPre: preMax, maxInvPost: postMax, maxVentas: maxVentasVal };
  }, [distributionResult]);


  return (
    <div className={`h-full flex flex-col font-sans transition-colors duration-300 ${t.appBg}`}>
      
      {/* TABS NATIVAS DEL SHELL */}
      <div className="flex space-x-6 px-8 mt-4 border-b border-gray-200 dark:border-zinc-800 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab(1)} className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 1 ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`}`}>
          <Store size={18} /><span>1. Tiendas y Clústeres</span>
        </button>
        <button 
          onClick={() => { if (stores.length > 0) setActiveTab(2); }} 
          className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 2 ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`} ${stores.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Calculator size={18} /><span>2. Distribución</span>
        </button>
        
        <div className="ml-auto flex items-center mb-2">
           <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg transition-colors ${t.btnGhost}`} title="Cambiar Tema Interno">
              {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
           </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-300">
        
        {/* TAB 1 */}
        {activeTab === 1 && (
          stores.length === 0 ? (
            <div className={`p-10 md:p-16 rounded-2xl border text-center flex flex-col items-center justify-center ${theme==='dark'?'bg-zinc-900/50 border-zinc-800':'bg-white border-gray-200 shadow-sm'}`}>
              <div className={`p-5 rounded-full mb-6 ${theme==='dark'?'bg-purple-900/20 text-purple-400':'bg-blue-50 text-blue-600'}`}>
                <Store size={48} strokeWidth={1.5} />
              </div>
              <h3 className={`text-2xl font-black mb-3 tracking-wide ${t.textMain}`}>Configura tu Matriz de Distribución</h3>
              <p className={`text-sm max-w-lg mb-8 leading-relaxed ${t.textMuted}`}>Para comenzar, necesitamos conocer el historial de ventas de tus sucursales para crear el clustering dinámico.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl text-left">
                <div className={`p-6 rounded-xl border relative overflow-hidden group ${theme==='dark'?'bg-zinc-900 border-zinc-700':'bg-gray-50 border-gray-200'}`}>
                  <div className={`absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>
                  <h4 className={`text-sm font-black uppercase tracking-widest mb-2 flex items-center ${t.textAccent1}`}><span className="bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded mr-2">Paso 1</span> Base de Tiendas</h4>
                  <p className={`text-xs mb-6 h-12 ${t.textMuted}`}>Archivo .CSV obligatorio con ventas históricas para calcular el Score de Mérito.</p>
                  
                  <label className={`cursor-pointer w-full py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center justify-center hover:scale-105 transform duration-200 ${t.btnPrimary}`}>
                    <Upload size={18} className="mr-2" /> Subir Base (.CSV)
                    <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                  </label>
                </div>

                <div className={`p-6 rounded-xl border relative overflow-hidden group ${theme==='dark'?'bg-zinc-900 border-zinc-700':'bg-gray-50 border-gray-200'}`}>
                  <div className={`absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>
                  <h4 className={`text-sm font-black uppercase tracking-widest mb-2 flex items-center ${t.textAccent2}`}><span className="bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded mr-2">Paso 2</span> Matriz de Marcas</h4>
                  <p className={`text-xs mb-6 h-12 ${t.textMuted}`}>Opcional. Matriz cruzada para restringir qué tiendas pueden recibir qué marcas.</p>
                  
                  <label className={`cursor-pointer w-full py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center justify-center border border-dashed hover:scale-105 transform duration-200 ${theme==='dark'?'border-zinc-600 text-zinc-300 hover:bg-zinc-800':'border-gray-400 text-gray-600 hover:bg-gray-100'}`}>
                    <ListPlus size={18} className="mr-2" /> Subir Matriz (.CSV)
                    <input type="file" accept=".csv" onChange={handleBrandMatrixUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              
              <div className={`p-4 rounded-xl border flex flex-col transition-all ${theme==='dark'?'bg-blue-900/10 border-blue-900/30':'bg-blue-50 border-blue-200'}`}>
                <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setShowGuide(!showGuide)}>
                  <div className="flex items-center">
                    <Info size={18} className={`mr-2 ${theme==='dark'?'text-blue-400':'text-blue-600'}`} />
                    <h3 className={`text-sm font-bold ${theme==='dark'?'text-blue-400':'text-blue-700'}`}>Guía Rápida y Formatos (CSV)</h3>
                  </div>
                  {showGuide ? <ChevronUp size={18} className={theme==='dark'?'text-blue-400':'text-blue-600'}/> : <ChevronDown size={18} className={theme==='dark'?'text-blue-400':'text-blue-600'}/>}
                </div>
                
                {showGuide && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 mt-3 border-t border-blue-500/20">
                    <div>
                      <h4 className={`text-[10px] font-black uppercase tracking-wider mb-2 ${theme==='dark'?'text-blue-300':'text-blue-800'}`}>1. Layout Base de Tiendas (.CSV)</h4>
                      <ul className={`text-xs space-y-1.5 ${theme==='dark'?'text-blue-200/80':'text-blue-900/80'} font-mono`}>
                        <li><span className="font-bold text-blue-500">CENTRO</span>: Obligatorio (Ej. 0953)</li>
                        <li><span className="font-bold text-blue-500">GOA</span>: Obligatorio (Familia, Ej. TENIS)</li>
                        <li><span className="font-bold text-blue-500">VENTAS</span>: Obligatorio ($ o unidades)</li>
                        <li><span className="font-bold text-blue-500">OH</span>: Inventario Actual (Recomendado)</li>
                        <li><span className="font-bold text-blue-500">NOMBRE / ZONA / MARGEN / ROTACION</span>: Opcionales</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className={`text-[10px] font-black uppercase tracking-wider mb-2 ${theme==='dark'?'text-blue-300':'text-blue-800'}`}>2. Matriz y Chequera</h4>
                      <ul className={`text-xs space-y-1.5 ${theme==='dark'?'text-blue-200/80':'text-blue-900/80'} font-mono`}>
                        <li><span className="font-bold text-blue-500">MATRIZ DE MARCAS</span>: Fila superior con códigos de tienda. Columna MARCA o NOM_MARCA (Obligatoria).</li>
                        <li><span className="font-bold text-blue-500">CHEQUERA</span>: Columnas recomendadas: SECCION | GOA | MARCA | MODELO | SKU | COLOR | TALLA | CANTIDAD</li>
                        <li><span className="font-bold text-blue-500">TIP TALLAS</span>: En cantidad puedes separar varias por coma (10,15,20) y el sistema generará corridas enteras para las tallas que le pongas (25,26,27).</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className={`p-5 rounded-xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${t.cardInner}`}>
                <div className={`flex items-center p-3 rounded-lg border ${theme==='dark'?'bg-black/20 border-black/30':'bg-white shadow-sm'}`}>
                  <Settings size={20} className={`mr-3 ${t.textAccent2}`} />
                  <div className="flex flex-col">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${t.textMuted}`}>Cantidad de Clústeres</label>
                    <select value={numClusters} onChange={(e) => setNumClusters(Number(e.target.value))} className={`mt-1 p-1.5 rounded outline-none font-bold text-sm cursor-pointer transition-colors ${t.inputYellow}`}>
                      {[3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={`opt-${n}`} value={n}>{n} Niveles ({n===6?'AA-E':'A-'+String.fromCharCode(64+n)})</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col flex-1 w-full lg:w-auto">
                  <div className="flex items-center mb-2">
                    <Sliders size={16} className={`mr-2 ${t.textAccent1}`} />
                    <span className={`text-xs font-bold ${t.textMain}`}>Calibración del Score (Total: {scoreWeights.sales + scoreWeights.margin + scoreWeights.rotation}%)</span>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex flex-col"><label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Venta ({scoreWeights.sales}%)</label><input type="range" min="0" max="100" value={scoreWeights.sales} onChange={e=>setScoreWeights({...scoreWeights, sales: Number(e.target.value)})} className="w-24 accent-purple-500 cursor-pointer" /></div>
                    <div className="flex flex-col"><label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Margen ({scoreWeights.margin}%)</label><input type="range" min="0" max="100" value={scoreWeights.margin} onChange={e=>setScoreWeights({...scoreWeights, margin: Number(e.target.value)})} className="w-24 accent-yellow-500 cursor-pointer" /></div>
                    <div className="flex flex-col"><label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Rotación ({scoreWeights.rotation}%)</label><input type="range" min="0" max="100" value={scoreWeights.rotation} onChange={e=>setScoreWeights({...scoreWeights, rotation: Number(e.target.value)})} className="w-24 accent-blue-500 cursor-pointer" /></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-purple-500 relative overflow-hidden ${t.card}`}>
                  <div className="absolute -right-4 -top-4 opacity-5"><Store size={100} /></div>
                  <div className={`p-3 rounded-full relative z-10 ${t.iconAccent1}`}><Store size={24}/></div>
                  <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Total Tiendas</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.total}</p></div>
                </div>
                <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-blue-500 relative overflow-hidden ${t.card}`}>
                  <div className="absolute -right-4 -top-4 opacity-5"><Package size={100} /></div>
                  <div className={`p-3 rounded-full relative z-10 ${t.iconAccent2}`}><Package size={24}/></div>
                  <div className="relative z-10 flex-1 min-w-0">
                    <p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Grupos de Artículos</p>
                    {goas.length === 0 ? (
                       <p className={`text-3xl font-black ${t.textMain}`}>0</p>
                    ) : (
                       <div className={`mt-1 flex flex-wrap gap-1 max-h-12 overflow-y-auto custom-scrollbar`}>
                         {goas.map(g => <span key={g.id} className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${t.badgeOther} truncate max-w-[100px]`} title={g.name}>{g.name}</span>)}
                       </div>
                    )}
                  </div>
                </div>
                <div className={`p-4 rounded-xl border border-l-4 border-l-gray-500 ${t.card}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Dispersión Clusters</p>
                  <div className="flex justify-between items-end px-2 overflow-x-auto custom-scrollbar pb-1">
                    {activeClusters.map(c => (
                      <div key={`clust-stat-${c}`} className="flex flex-col items-center mx-1">
                        <span className={`text-[10px] font-black mb-1 ${c === activeClusters[0] ? t.textAccent1 : c === activeClusters[1] ? t.textAccent2 : t.textMuted}`}>{c}</span>
                        <div className={`w-8 rounded-t flex items-end justify-center ${c === activeClusters[0] ? 'bg-purple-500/20' : 'bg-gray-500/20'}`} style={{height: `${Math.max(15, (storeStats.clusters[c]/storeStats.total)*100)}px`}}>
                           <span className={`text-sm font-bold pb-1 ${t.textMain}`}>{storeStats.clusters[c] || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-xl border ${t.card}`}>
                <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4 ${t.border}`}>
                  <div>
                    <h2 className={`text-xl font-bold ${t.textMain}`}>BASE DE TIENDAS</h2>
                    <p className={`text-sm mt-1 ${t.textMuted}`}>Los clústeres son otorgados de acuerdo al Score. (0 a 100).</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className={`flex rounded-lg p-1 border ${t.cardInner}`}>
                      <button onClick={()=>toggleSort('score')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='score'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Score <ArrowUpDown size={12} className="ml-1"/></button>
                      <button onClick={()=>toggleSort('sales')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='sales'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Vtas <ArrowUpDown size={12} className="ml-1"/></button>
                      <button onClick={()=>toggleSort('totalOH')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='totalOH'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>OH <ArrowUpDown size={12} className="ml-1"/></button>
                    </div>
                    
                    <select 
                      value={selectedGoaFilter} 
                      onChange={(e) => setSelectedGoaFilter(e.target.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer max-w-[150px] truncate ${t.input}`}
                    >
                      <option value="ALL">Todos los GOAs</option>
                      {goas.map(g => <option key={`filt-${g.id}`} value={g.name.toUpperCase()}>{g.name}</option>)}
                    </select>

                    <button 
                      onClick={downloadClusterMatrix}
                      className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow transition hover:scale-105 ${theme==='dark'?'bg-emerald-600 text-white hover:bg-emerald-500':'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                      title="Descargar CSV con Clústeres"
                    >
                      <Download size={14} className="mr-2" /> Bajar Matriz
                    </button>

                    <label className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold flex items-center transition border border-dashed ${theme==='dark'?'border-zinc-600 text-zinc-300 hover:bg-zinc-800':'border-gray-400 text-gray-600 hover:bg-gray-100'}`} title="Opcional: Matriz Cruzada">
                      <ListPlus size={14} className="mr-2" /> 
                      {Object.keys(brandMatrix).length > 0 ? `Marcas (${Object.keys(brandMatrix).length})` : 'Subir Marcas'}
                      <input type="file" accept=".csv" onChange={handleBrandMatrixUpload} className="hidden" />
                    </label>

                    <label className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold flex items-center transition ${t.btnGhost}`}>
                      <Upload size={14} className="mr-2" /> Recargar Base
                      <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {displayedStores.map(store => {
                    const isFiltered = selectedGoaFilter !== 'ALL';
                    const activeCluster = isFiltered ? store.clusters[selectedGoaFilter] : store.globalCluster;
                    const activeScore = isFiltered ? store.goaScores[selectedGoaFilter] : store.score;
                    const activeOH = isFiltered ? (store.goaOH[selectedGoaFilter] || 0) : store.totalOH;

                    return (
                      <div key={`store-card-${store.id}`} className={`p-5 rounded-xl shadow-sm transition-colors group border hover:border-purple-500/50 flex flex-col ${t.cardInner}`}>
                        
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className={`text-sm font-bold truncate ${t.textMain}`} title={store.name}>{store.name}</p>
                            <p className={`text-[10px] ${t.textMuted}`}>{store.zona}</p>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className={`text-[10px] px-2 py-0.5 mb-1 rounded border font-mono ${t.badgeOther}`}>{store.centerCode}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-black ${activeCluster === activeClusters[0] ? t.badgeAA : activeCluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>
                              {activeCluster}
                            </span>
                          </div>
                        </div>
                        
                        <div className={`rounded-lg p-3 mb-4 mt-auto grid grid-cols-3 gap-2 text-center divide-x border ${theme==='dark'?'divide-zinc-800 bg-zinc-900 border-zinc-800':'divide-gray-200 bg-white border-gray-100'}`}>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Ventas</p><p className={`text-[10px] font-bold ${t.textMain}`}>${store.sales?.toLocaleString()}</p></div>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>OH</p><p className={`text-[10px] font-bold ${t.textMain}`}>{activeOH?.toLocaleString()}</p></div>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Rot</p><p className={`text-[10px] font-bold ${t.textMain}`}>{store.rotation?.toFixed(1)}</p></div>
                          <div className={`col-span-3 pt-3 border-t divide-none mt-2 flex justify-between px-2 items-center ${theme==='dark'?'border-zinc-800':'border-gray-100'}`}>
                             <p className={`text-[9px] uppercase font-black tracking-widest ${t.textAccent2}`}>Score {isFiltered ? 'GOA' : 'Global'}:</p>
                             <p className={`text-base font-black leading-tight ${t.textAccent2}`}>{Math.round(activeScore || 0).toLocaleString()}</p>
                          </div>
                        </div>

                        {!isFiltered && (
                          <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-1 mt-2">
                            <p className={`text-[10px] uppercase font-bold tracking-wider mb-1 border-b pb-1 ${t.border} ${t.textMuted}`}>Clúster por GOA:</p>
                            {Object.keys(store.clusters).length === 0 && <span className="text-xs text-red-500">Sin clúster asignado</span>}
                            {Object.entries(store.clusters).map(([goa, cluster]) => (
                              <div key={`store-${store.id}-goa-${goa}`} className={`flex justify-between items-center text-xs py-0.5`}>
                                <span className={`truncate max-w-[120px] font-medium ${t.textMuted}`} title={goa}>{goa}</span>
                                <span className={`font-black px-2 py-0.5 rounded border ${cluster === activeClusters[0] ? t.badgeAA : cluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>
                                  {cluster}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}

        {/* TAB 2 */}
        {activeTab === 2 && (
          <div className="space-y-6">
            
            <div className={`p-6 rounded-xl border flex flex-col gap-6 ${t.card}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className={`text-xl font-bold flex items-center mb-2 ${t.textMain}`}>
                    <ListPlus className={`mr-2 ${t.textAccent1}`} size={24} />
                    Ingreso de Modelos a Distribuir
                  </h2>
                  <p className={`text-sm ${t.textMuted}`}>Agrega los modelos que deseas repartir. Tip: Puedes poner varias cantidades (10,20) para generar corridas de tallas.</p>
                </div>
                
                <div className={`flex items-center p-1 rounded-lg border ${t.cardInner}`}>
                  <button onClick={() => setEntryMode('MANUAL')} className={`px-4 py-2 rounded text-xs font-bold transition-all ${entryMode === 'MANUAL' ? (theme==='dark'?'bg-zinc-800 text-purple-400 shadow':'bg-white text-blue-600 shadow') : t.textMuted}`}>
                    Formulario Inteligente
                  </button>
                  <button onClick={() => setEntryMode('MASIVO')} className={`px-4 py-2 rounded text-xs font-bold transition-all ${entryMode === 'MASIVO' ? (theme==='dark'?'bg-zinc-800 text-purple-400 shadow':'bg-white text-blue-600 shadow') : t.textMuted}`}>
                    Carga Masiva (Texto/CSV)
                  </button>
                </div>
              </div>

              {entryMode === 'MANUAL' && (
                <div className={`p-5 rounded-xl border ${theme==='dark'?'bg-zinc-950/50 border-zinc-800':'bg-gray-50 border-gray-200'}`}>
                  
                  <datalist id="secciones-list">
                    {matrixMetadata.sections.map(s => <option key={s} value={s} />)}
                  </datalist>
                  <datalist id="marcas-list">
                    {(matrixMetadata.brandsBySection[manualEntry.seccion.toUpperCase()] || matrixMetadata.allBrands).map(b => <option key={b} value={b} />)}
                  </datalist>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-8 gap-3 items-end">
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Sección</label>
                      <input list="secciones-list" placeholder="Sugerencias" value={manualEntry.seccion} onChange={e => setManualEntry({...manualEntry, seccion: e.target.value})} className={`p-2.5 rounded-lg border text-sm outline-none ${t.input}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textAccent2}`}>GOA *</label>
                      <select value={manualEntry.goa} onChange={e => setManualEntry({...manualEntry, goa: e.target.value})} className={`p-2.5 rounded-lg border text-sm outline-none font-bold ${!manualEntry.goa ? 'border-red-500/50 text-red-400' : ''} ${t.input}`}>
                        <option value="">-- Elige --</option>
                        {goas.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Marca</label>
                      <input list="marcas-list" placeholder="Sugerencias" value={manualEntry.marca} onChange={e => setManualEntry({...manualEntry, marca: e.target.value})} className={`p-2.5 rounded-lg border text-sm outline-none ${t.input}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Modelo</label>
                      <input type="text" placeholder="Ej. AIRMAX" value={manualEntry.modelo} onChange={e => setManualEntry({...manualEntry, modelo: e.target.value})} className={`p-2.5 rounded-lg border text-sm font-mono outline-none ${t.input}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>SKU (Opc)</label>
                      <input type="text" placeholder="Autogenerar" value={manualEntry.sku} onChange={e => setManualEntry({...manualEntry, sku: e.target.value})} className={`p-2.5 rounded-lg border text-sm font-mono outline-none ${t.input}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Color</label>
                      <input type="text" placeholder="Ej. BLK" value={manualEntry.color} onChange={e => setManualEntry({...manualEntry, color: e.target.value})} className={`p-2.5 rounded-lg border text-sm outline-none ${t.input}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Tallas</label>
                      <input type="text" placeholder="25,26.." value={manualEntry.talla} onChange={e => setManualEntry({...manualEntry, talla: e.target.value})} className={`p-2.5 rounded-lg border text-sm outline-none ${t.input}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-[10px] font-bold uppercase mb-1 ${t.textAccent1}`}>Cant *</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="10,15.." value={manualEntry.qty} onChange={e => setManualEntry({...manualEntry, qty: e.target.value})} className={`w-full p-2.5 rounded-lg border text-sm font-bold outline-none ${!manualEntry.qty ? 'border-red-500/50' : ''} ${t.input}`} />
                        <button onClick={handleManualAdd} className={`px-4 rounded-lg flex items-center justify-center transition-all ${t.btnPrimary}`} title="Añadir a lista">
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {entryMode === 'MASIVO' && (
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <textarea 
                      value={modelsInputText}
                      onChange={(e) => setModelsInputText(e.target.value)}
                      placeholder="Pega desde Excel. Orden: SECCIÓN | GOA | MARCA | MODELO | SKU | COLOR | TALLA | CANTIDAD&#10;&#10;Ej: ZAPATOS   TENIS   NIKE   AIRMAX   AM-BLK   NGR   25,26,27   150,150,100"
                      className={`w-full h-32 p-3 rounded-lg border font-mono text-sm resize-y outline-none transition-all whitespace-pre ${t.input}`}
                    />
                  </div>

                  <div className={`w-full md:w-72 flex flex-col justify-end gap-3 p-4 rounded-xl border ${t.cardInner}`}>
                    <label className={`cursor-pointer w-full py-3.5 rounded-lg font-bold text-sm tracking-wide transition-all flex items-center justify-center border border-dashed ${theme==='dark'?'border-zinc-600 text-zinc-300 hover:bg-zinc-800':'border-gray-400 text-gray-600 hover:bg-gray-100'}`}>
                      <Upload size={16} className="mr-2" /> Subir CSV
                      <input type="file" accept=".csv" onChange={handleChequeraCSVUpload} ref={chequeraFileInputRef} className="hidden" />
                    </label>

                    <div className="relative flex items-center py-2">
                       <div className={`flex-grow border-t ${theme==='dark'?'border-zinc-700':'border-gray-200'}`}></div>
                       <span className={`flex-shrink-0 mx-4 text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>O Texto Pegado</span>
                       <div className={`flex-grow border-t ${theme==='dark'?'border-zinc-700':'border-gray-200'}`}></div>
                    </div>

                    <button 
                      onClick={handleBulkAddModels}
                      disabled={!modelsInputText.trim()}
                      className={`w-full py-4 rounded-lg font-black uppercase tracking-wider transition-all flex items-center justify-center ${modelsInputText.trim() ? t.btnPrimary : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'}`}
                    >
                      <Plus size={18} className="mr-2" /> Añadir Pegados
                    </button>
                  </div>
                </div>
              )}
            </div>

            {chequera.length > 0 && (
              <div className={`rounded-xl border overflow-hidden ${t.card}`}>
                <div className="overflow-x-auto max-h-80 custom-scrollbar">
                  <table className="w-full text-left border-collapse relative">
                    <thead className="sticky top-0 z-10">
                      <tr className={`text-[10px] uppercase font-black tracking-widest ${theme==='dark'?'bg-zinc-950 text-gray-400 border-b border-zinc-800':'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                        <th className="p-3 pl-4">SECCIÓN</th>
                        <th className="p-3">GOA</th>
                        <th className="p-3">MARCA</th>
                        <th className="p-3">MODELO</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3">COLOR</th>
                        <th className="p-3">TALLA</th>
                        <th className="p-3 text-right">CANTIDAD</th>
                        <th className="p-3 w-20 text-center">ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${theme==='dark'?'divide-zinc-800':'divide-gray-200'}`}>
                      {chequera.map((item) => {
                        const isEditing = editingItem && editingItem.id === item.id;

                        return (
                          <tr key={item.id} className={`transition-colors ${isEditing ? (theme==='dark'?'bg-purple-900/10':'bg-blue-50') : `hover:${theme==='dark'?'bg-zinc-800/50':'bg-gray-50'}`}`}>
                            {isEditing ? (
                              <>
                                <td className="p-2 pl-4"><input type="text" value={editingItem.seccion} onChange={e=>setEditingItem({...editingItem, seccion: e.target.value})} className={`w-full p-1.5 rounded text-xs outline-none border ${t.input}`} /></td>
                                <td className="p-2"><input type="text" value={editingItem.goa} onChange={e=>setEditingItem({...editingItem, goa: e.target.value})} className={`w-full p-1.5 rounded text-xs outline-none border font-bold ${!editingItem.goa ? 'border-red-500' : ''} ${t.input}`} /></td>
                                <td className="p-2"><input type="text" value={editingItem.marca} onChange={e=>setEditingItem({...editingItem, marca: e.target.value})} className={`w-full p-1.5 rounded text-xs outline-none border ${t.input}`} /></td>
                                <td className="p-2"><input type="text" value={editingItem.modelo} onChange={e=>setEditingItem({...editingItem, modelo: e.target.value})} className={`w-full p-1.5 rounded text-xs outline-none border ${t.input}`} /></td>
                                <td className="p-2"><input type="text" value={editingItem.sku} onChange={e=>setEditingItem({...editingItem, sku: e.target.value})} className={`w-full p-1.5 rounded text-xs font-mono outline-none border ${t.input}`} /></td>
                                <td className="p-2"><input type="text" value={editingItem.color} onChange={e=>setEditingItem({...editingItem, color: e.target.value})} className={`w-full p-1.5 rounded text-xs outline-none border ${t.input}`} /></td>
                                <td className="p-2"><input type="text" value={editingItem.talla} onChange={e=>setEditingItem({...editingItem, talla: e.target.value})} className={`w-full p-1.5 rounded text-xs outline-none border ${t.input}`} /></td>
                                <td className="p-2"><input type="number" min="1" value={editingItem.qty} onChange={e=>setEditingItem({...editingItem, qty: e.target.value})} className={`w-full p-1.5 rounded text-xs text-right font-bold outline-none border ${!editingItem.qty ? 'border-red-500' : ''} ${t.input}`} /></td>
                                <td className="p-2 text-center flex justify-center gap-2">
                                  <button onClick={saveEditItem} className="text-emerald-500 hover:text-emerald-400 p-1"><Check size={16}/></button>
                                  <button onClick={()=>setEditingItem(null)} className="text-gray-500 hover:text-red-400 p-1"><X size={16}/></button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className={`p-3 pl-4 text-xs font-bold ${t.textMuted}`}>{item.seccion !== 'N/A' ? item.seccion : '-'}</td>
                                <td className={`p-3 text-xs font-bold ${t.textAccent1}`}>{item.goa}</td>
                                <td className={`p-3 text-xs font-bold ${t.textAccent2}`}>{item.marca !== 'N/A' ? item.marca : '-'}</td>
                                <td className={`p-3 text-xs font-bold ${t.textMuted}`}>{item.modelo !== 'N/A' ? item.modelo : '-'}</td>
                                <td className={`p-3 font-mono text-sm font-bold ${item.sku.startsWith('GEN-') ? t.textMuted : t.textMain}`} title={item.sku.startsWith('GEN-') ? 'Auto-generado' : ''}>{item.sku}</td>
                                <td className={`p-3 text-xs font-bold ${t.textMuted}`}>{item.color !== 'N/A' ? item.color : '-'}</td>
                                <td className={`p-3 text-xs font-bold ${t.textMuted}`}>{item.talla !== 'N/A' ? item.talla : '-'}</td>
                                <td className={`p-3 text-right font-mono text-sm ${t.textMain}`}>{item.qty.toLocaleString()}</td>
                                <td className="p-3 text-center flex justify-center gap-2">
                                  <button onClick={() => startEditItem(item)} className="text-gray-500 hover:text-blue-500 transition-colors p-1"><Edit3 size={16} /></button>
                                  <button onClick={() => removeChequeraItem(item.id)} className="text-gray-500 hover:text-red-500 transition-colors p-1"><Trash2 size={16} /></button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {chequera.length > 0 && (
              <div className={`p-6 rounded-xl border flex flex-col items-center md:flex-row justify-between gap-6 ${t.cardInner}`}>
                <div className="flex-1">
                  <h3 className={`font-bold mb-1 ${t.textMain}`}>Tipo de distribución</h3>
                  <p className={`text-sm mb-4 md:mb-0 ${t.textMuted}`}>Puedes evaluar el inventario actual (OH) de las tiendas para no sobre-stockear o forzar la distribución por la calificación de GOA.</p>
                </div>
                
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className={`flex items-center p-2 rounded-lg border ${theme==='dark'?'bg-black/30 border-zinc-800':'bg-gray-100 border-gray-200'}`}>
                    <button onClick={() => setConsiderOH(false)} className={`flex items-center px-3 py-1.5 rounded text-xs font-bold transition-all ${!considerOH ? (theme==='dark'?'bg-zinc-800 text-white shadow':'bg-white text-black shadow') : t.textMuted}`}>
                      <ToggleLeft size={16} className={`mr-1 ${!considerOH ? 'text-red-400' : ''}`} /> Llenado Push
                    </button>
                    <button onClick={() => setConsiderOH(true)} className={`flex items-center px-3 py-1.5 rounded text-xs font-bold transition-all ${considerOH ? (theme==='dark'?'bg-zinc-800 text-white shadow':'bg-white text-black shadow') : t.textMuted}`}>
                      Cuidar Dispersión (OH) <ToggleRight size={16} className={`ml-1 ${considerOH ? 'text-emerald-400' : ''}`} />
                    </button>
                  </div>

                  <button 
                    onClick={processDistribution}
                    className={`px-8 py-4 rounded-xl font-black uppercase tracking-wider transition-all flex items-center justify-center shadow-lg hover:scale-105 transform duration-200 ${theme==='dark'?'bg-purple-600 text-white hover:bg-purple-500':'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    <Wand2 size={20} className="mr-2" /> Calcular Distribución
                  </button>
                </div>
              </div>
            )}

            {/* RENDERIZADO EN LÍNEA DE GRÁFICAS PARA EVITAR ERRORES DE COMPONENTES ANIDADOS */}
            {distributionResult.length > 0 && (
              <div className="space-y-6 animate-fade-in-up">
                <div className={`p-6 rounded-xl border border-green-500/50 bg-green-500/5 ${theme==='light' ? 'bg-green-50 border-green-200' : ''}`}>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center">
                      <div className="p-3 rounded-full bg-green-500 text-white mr-4"><CheckSquare size={24} /></div>
                      <div>
                        <h3 className={`text-xl font-black text-green-600 ${theme==='dark'?'text-green-400':''}`}>Distribución Completa</h3>
                        <p className={`text-sm ${t.textMuted}`}>Se generaron <strong>{distributionResult.length}</strong> combinaciones mediante {considerOH ? 'el calculo con OH' : 'Push Proporcional'}.</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={downloadSAP} className="px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-md bg-blue-600 text-white hover:bg-blue-500 hover:scale-105">
                        <FileSpreadsheet size={16} className="mr-2" /> Descargar SAP
                      </button>
                      <button onClick={downloadO9} className="px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-md bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105">
                        <Download size={16} className="mr-2" /> Descargar O9
                      </button>
                    </div>
                  </div>
                </div>

                <h3 className={`text-lg font-bold flex items-center pt-2 ${t.textMain}`}>
                  <BarChart3 className={`mr-2 ${t.textAccent1}`} size={20} />
                  Dashboard de Resultados
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* TOP 10 TIENDAS */}
                  {topStoresData.length > 0 && (
                    <div className={`p-5 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold flex items-center mb-4 ${t.textMain}`}><Store size={16} className="mr-2"/> Top 10 Tiendas Receptoras</h4>
                      <div className="space-y-3">
                        {topStoresData.map((d, i) => (
                          <div key={i} className="flex items-center text-xs">
                            <span className={`font-black text-[9px] px-1.5 py-0.5 rounded border mr-2 ${d.cluster === activeClusters[0] ? t.badgeAA : d.cluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>{d.cluster || '-'}</span>
                            <span className={`w-28 truncate pr-2 ${t.textMuted}`} title={d.name}>{d.name}</span>
                            <div className="flex-1 h-5 bg-black/20 rounded overflow-hidden flex">
                              <div className="bg-purple-500 h-full flex items-center px-2 text-[10px] text-white font-bold transition-all duration-1000 ease-out" style={{width: `${(d.qty/topStoresMax)*100}%`}}>
                                {d.qty}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PIEZAS POR ZONA */}
                  {zonesData.length > 0 && (
                    <div className={`p-5 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold flex items-center mb-4 ${t.textMain}`}><MapIcon size={16} className="mr-2"/> Piezas por Zona</h4>
                      <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {zonesData.map((d, i) => (
                          <div key={i} className="flex items-center text-xs">
                            <span className={`w-28 truncate pr-2 font-bold ${t.textAccent2}`} title={d.name}>{d.name}</span>
                            <div className="flex-1 h-5 bg-black/20 rounded overflow-hidden flex">
                              <div className="bg-yellow-500 h-full flex items-center px-2 text-[10px] text-black font-black transition-all duration-1000 ease-out" style={{width: `${(d.qty/zonesMax)*100}%`}}>
                                {d.qty}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ENVÍO POR MODELO */}
                  {modelsStoreData.stores.length > 0 && (
                    <div className={`p-5 rounded-xl border col-span-1 md:col-span-2 ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold flex items-center mb-4 ${t.textMain}`}><Package size={16} className="mr-2"/> Envío por Modelo (Top 15 Tiendas)</h4>
                      <div className="flex flex-wrap gap-2 mb-4">
                         {modelsStoreData.models.map((m, i) => (
                            <div key={m} className="flex items-center text-[10px] text-gray-400"><span className={`w-3 h-3 rounded-sm mr-1 ${modelsColors[i%modelsColors.length]}`}></span>{m}</div>
                         ))}
                      </div>
                      <div className="space-y-3">
                        {modelsStoreData.stores.map((d, i) => (
                          <div key={i} className="flex items-center text-xs">
                            <span className={`w-32 truncate pr-2 ${t.textMuted}`} title={d.name}>{d.name}</span>
                            <div className="flex-1 h-5 bg-black/20 rounded overflow-hidden flex">
                              {modelsStoreData.models.map((m, j) => {
                                 const qty = d.models[m] || 0;
                                 if(qty === 0) return null;
                                 const width = `${(qty/modelsStoreMax)*100}%`;
                                 return (
                                    <div key={m} title={`${m}: ${qty} pzs`} className={`h-full flex items-center justify-center text-[9px] text-white font-bold transition-all duration-1000 ease-out ${modelsColors[j%modelsColors.length]}`} style={{width}}>
                                       {qty > (modelsStoreMax*0.05) ? qty : ''} 
                                    </div>
                                 )
                              })}
                            </div>
                            <span className={`w-8 text-right font-bold ml-2 ${t.textMain}`}>{d.total}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* GRÁFICAS DE DISPERSIÓN */}
                  {scatterData.pre.length > 0 && (
                    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ScatterPlot data={scatterData.pre} title="Antes: Físico (OH)" subtitle="OH Original vs Ventas" colorClass="text-blue-400" maxVentas={scatterData.maxVentas} maxInv={scatterData.maxInvPre} t={t} />
                      <ScatterPlot data={scatterData.post} title="Después: Distribuido" subtitle="Total (OH + Envío) vs Ventas" colorClass="text-emerald-400" maxVentas={scatterData.maxVentas} maxInv={scatterData.maxInvPost} t={t} />
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

      </main>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme === 'dark' ? '#3f3f46' : '#d1d5db'}; border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme === 'dark' ? '#52525b' : '#9ca3af'}; } @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }`}} />
    </div>
  );
}

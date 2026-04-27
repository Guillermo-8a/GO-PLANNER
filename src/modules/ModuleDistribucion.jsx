import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Icons from '../utils/icons';
import { useDispatch, useGlobal, globalActions } from '../context/GlobalContext';

// ============================================================================
// COMPONENTE EXTERNO: GRÁFICA DE DISPERSIÓN (Con cálculo de R²)
// ============================================================================
const ScatterPlot = ({ data, title, subtitle, colorClass, maxVentas, maxInv, t }) => {
  let trendline = null;
  let rSquared = 0;
  const n = data.length;
  
  if (n > 1) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    data.forEach(d => { 
      sumX += d.x; 
      sumY += d.y; 
      sumXY += d.x * d.y; 
      sumXX += d.x * d.x; 
      sumYY += d.y * d.y; 
    });
    
    const denominatorX = (n * sumXX - sumX * sumX);
    const denominatorY = (n * sumYY - sumY * sumY);
    
    if (denominatorX !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denominatorX;
        const intercept = (sumY - slope * sumX) / n;
        const y1 = slope * 0 + intercept;
        const y2 = slope * maxVentas + intercept;
        trendline = { 
          y1: 100 - (y1 / maxInv) * 100, 
          y2: 100 - (y2 / maxInv) * 100 
        };
    }

    if (denominatorX !== 0 && denominatorY !== 0) {
        rSquared = Math.pow(n * sumXY - sumX * sumY, 2) / (denominatorX * denominatorY);
    } else if (denominatorX === 0 && denominatorY === 0) {
        rSquared = 1;
    }
  }

  return (
    <div className={`p-5 rounded-xl border flex flex-col col-span-1 ${t.cardInner}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className={`text-sm font-bold flex items-center ${t.textMain}`}><Icons.Activity size={16} className="mr-2"/> {title}</h4>
          <p className={`text-[10px] ${t.textMuted}`}>{subtitle}</p>
        </div>
        <div className="flex flex-col items-end text-[9px] gap-1">
           <div className="flex items-center font-mono">
             <span className="w-6 border-t-2 border-dashed border-red-500 mr-1"></span> R²: {rSquared.toFixed(4)}
           </div>
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
                <title>{`${d.name}\nVentas Históricas: ${d.x.toLocaleString()} u\nOH Antes: ${d.oh}\nEnvío Nuevo: ${d.env}\nInventario Total: ${d.oh + d.env}`}</title>
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
          <span>0 u</span>
          <span>Ventas</span>
          <span>{Math.round(maxVentas).toLocaleString()} u</span>
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Distribucion() {
  const gDispatch = useDispatch();
  const gState    = useGlobal();
  const otbDisponible = !!gState?.otbData;
  
  // TEMA GLOBAL SINCRONIZADO DESDE EL SHELL
  const theme = gState?.theme || 'light'; 

  const [activeTab, setActiveTab] = useState(1); 
  const fileInputRef = useRef(null);
  const chequeraFileInputRef = useRef(null);
  
  const [numClusters, setNumClusters] = useState(6);
  const activeClusters = useMemo(() => {
    if (numClusters === 6) return ['AA', 'A', 'B', 'C', 'D', 'E'];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({length: numClusters}, (_, i) => alphabet[i]);
  }, [numClusters]);

  const [rawStoreData, setRawStoreData] = useState([]);
  const [scoreWeights, setScoreWeights] = useState({ sales: 50, margin: 50, rotation: 0 }); 
  const [stores, setStores] = useState([]);
  const [goas, setGoas] = useState([]);
  const [storeSortBy, setStoreSortBy] = useState('score'); 
  const [storeSortOrder, setStoreSortOrder] = useState('desc');
  
  const [brandMatrix, setBrandMatrix] = useState({}); 
  const [matrixMetadata, setMatrixMetadata] = useState({ sections: [], brandsBySection: {}, allBrands: [] });
  const [selectedGoaFilter, setSelectedGoaFilter] = useState('ALL'); 
  const [dashGoaFilter, setDashGoaFilter] = useState('ALL'); 

  const [showParamModal, setShowParamModal] = useState(false);
  const [paramForm, setParamForm] = useState({ etiquetaAP: '', stockMin: '', stockMax: '', leadTime: '', min: '', max: '', th: '', tipoDistribucion: '' });


  
  useEffect(() => {
    try {
      const savedMatrix = localStorage.getItem('goplanner_brand_matrix');
      const savedMeta = localStorage.getItem('goplanner_brand_meta');
      if (savedMatrix && savedMeta) {
        setBrandMatrix(JSON.parse(savedMatrix));
        setMatrixMetadata(JSON.parse(savedMeta));
      }
    } catch (e) { }
  }, []);

  const clearBrandMatrix = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setBrandMatrix({});
    setMatrixMetadata({ sections: [], brandsBySection: {}, allBrands: [] });
    localStorage.removeItem('goplanner_brand_matrix');
    localStorage.removeItem('goplanner_brand_meta');
  };

  const [entryMode, setEntryMode] = useState('MANUAL'); 
  const [modelsInputText, setModelsInputText] = useState('');
  const [manualEntry, setManualEntry] = useState({ seccion: '', goa: '', marca: '', modelo: '', sku: '', color: '', talla: '', qty: '' });
  
  const [chequera, setChequera] = useState([]); 
  const [editingItem, setEditingItem] = useState(null); 
  const [distributionResult, setDistributionResult] = useState([]);
  
  const [distMode, setDistMode] = useState('SKU');
  const [showGuide, setShowGuide] = useState(false);

  // SIZE SCALING (PACK) — curvas de empaquetado por GOA
  const [showPackModal, setShowPackModal] = useState(false);
  const [packCurves, setPackCurves] = useState({}); // { [GOA]: [{ talla, qty }, ...] }
  const [packAllowSwap, setPackAllowSwap] = useState({}); // { [GOA]: bool } — permite intercambio entre tallas manteniendo total
  const [packMinClusters, setPackMinClusters] = useState({}); // { [GOA]: ['AA','A',...] } — clusters que SÍ reciben aunque no alcance 1 pack natural
  const [packCoverThreshold, setPackCoverThreshold] = useState({}); // { [GOA]: meses } — umbral cobertura para swap (default 5)

  // MOS objetivo "sano" por GOA (usado por OH y SKU). Default 3 meses.
  const [mosTarget, setMosTarget] = useState({}); // { [GOA]: { min, max } }
  const [showMosModal, setShowMosModal] = useState(false);

  // Alertas a compras: combos GOA/MARCA con >20% tiendas sobre-inventariadas
  const [overstockAlerts, setOverstockAlerts] = useState([]); // [{ goa, marca, pct, total, overStores: [{centro, mos}], reason }]

  // Filtro de búsqueda en Tab 1 / Base de Tiendas
  const [storeNameFilter, setStoreNameFilter] = useState('');

  //GUARDAR LA MEMORIAS POR UN TIEMPO EN LA RAM, PAARA PODER MOVERME
useEffect(() => {
    try {
      const saved = localStorage.getItem('gop_distribucion');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.stores?.length)       setStores(d.stores);
        if (d.goas?.length)         setGoas(d.goas);
        if (d.rawStoreData?.length) setRawStoreData(d.rawStoreData);
        if (d.chequera?.length)     setChequera(d.chequera);
        if (d.brandMatrix && Object.keys(d.brandMatrix).length) {
          setBrandMatrix(d.brandMatrix);
          if (d.matrixMetadata) setMatrixMetadata(d.matrixMetadata);
        }
        if (d.numClusters)    setNumClusters(d.numClusters);
        if (d.scoreWeights)   setScoreWeights(d.scoreWeights);
        if (d.distributionResult?.length) setDistributionResult(d.distributionResult);
        if (d.packCurves)     setPackCurves(d.packCurves);
        if (d.packAllowSwap)  setPackAllowSwap(d.packAllowSwap);
        if (d.packMinClusters) setPackMinClusters(d.packMinClusters);
        if (d.packCoverThreshold) setPackCoverThreshold(d.packCoverThreshold);
        if (d.mosTarget) setMosTarget(d.mosTarget);
      }
    } catch {}
  }, []);
 
  useEffect(() => {
    try {
      localStorage.setItem('gop_distribucion', JSON.stringify({
        stores, goas, rawStoreData, chequera,
        brandMatrix, matrixMetadata,
        numClusters, scoreWeights, distributionResult,
        packCurves, packAllowSwap, packMinClusters, packCoverThreshold, mosTarget,
      }));
    } catch {}
  }, [stores, goas, rawStoreData, chequera, brandMatrix, matrixMetadata, numClusters, scoreWeights, distributionResult, packCurves, packAllowSwap, packMinClusters, packCoverThreshold, mosTarget]);
  
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
  const t = themes[theme] || themes.light;

  const parseCSVRow = (row, sep) => {
    return row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`)).map(c => c.replace(/^"|"$/g, '').trim());
  };

  const recalculateClusters = (rawData, weights, currentClusters) => {
    if(!rawData || rawData.length === 0) return;
    
    const storeMap = new Map();
    const storeGoaAgg = {}; 

    rawData.forEach(row => {
      if (!storeMap.has(row.centro)) {
        storeMap.set(row.centro, { 
          id: row.centro, centerCode: row.centro, name: row.name, zona: row.zona,
          sales: 0, margin: 0, rotation: row.rotation, totalOH: 0,
          score: 0, goaScores: {}, goaSales: {}, goaMargin: {}, goaOH: {}, goaOO: {}, goaTrend3M: {}, clusters: {},
          skuSales: {}, skuOH: {}, goaSizeSales: {}, goaSizeOH: {}, goaSizeOO: {}, goaSizeTrend3M: {}
        });
      }
      
      const existing = storeMap.get(row.centro);
      existing.sales += row.sales; 
      existing.margin += row.margin; 
      existing.totalOH += row.oh;

      if (row.sku && row.sku !== 'N/A') {
        existing.skuSales[row.sku] = (existing.skuSales[row.sku] || 0) + row.sales;
        existing.skuOH[row.sku] = (existing.skuOH[row.sku] || 0) + row.oh;
      }
      
      if (row.talla && row.talla !== 'N/A') {
        const goaTallaKey = `${row.goa.toUpperCase()}|${row.talla}`;
        existing.goaSizeSales[goaTallaKey] = (existing.goaSizeSales[goaTallaKey] || 0) + row.sales;
        existing.goaSizeOH[goaTallaKey] = (existing.goaSizeOH[goaTallaKey] || 0) + row.oh;
        existing.goaSizeOO[goaTallaKey] = (existing.goaSizeOO[goaTallaKey] || 0) + (row.oo || 0);
        existing.goaSizeTrend3M[goaTallaKey] = (existing.goaSizeTrend3M[goaTallaKey] || 0) + (row.trend3M || 0);
      }

      const key = `${row.centro}|${row.goa}`;
      if (!storeGoaAgg[key]) {
        storeGoaAgg[key] = { centro: row.centro, goa: row.goa, sales: 0, margin: 0, rotation: row.rotation, oh: 0, oo: 0, trend3M: 0 };
      }
      storeGoaAgg[key].sales += row.sales;
      storeGoaAgg[key].margin += row.margin;
      storeGoaAgg[key].oh += row.oh;
      storeGoaAgg[key].oo += (row.oo || 0);
      storeGoaAgg[key].trend3M += (row.trend3M || 0);
    });

    const maxVals = {}; 
    const dataByGoa = {};
    
    Object.values(storeGoaAgg).forEach(agg => {
      if (!dataByGoa[agg.goa]) { 
          dataByGoa[agg.goa] = []; 
          maxVals[agg.goa] = { sales: 0, margin: 0, rotation: 0 }; 
      }
      dataByGoa[agg.goa].push(agg);
      if (agg.sales > maxVals[agg.goa].sales) maxVals[agg.goa].sales = agg.sales;
      if (agg.margin > maxVals[agg.goa].margin) maxVals[agg.goa].margin = agg.margin;
      if (agg.rotation > maxVals[agg.goa].rotation) maxVals[agg.goa].rotation = agg.rotation;
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
        store.goaMargin[goaName] = item.margin; 
        store.goaOH[goaName] = item.oh; 
        store.goaOO[goaName] = item.oo || 0;
        store.goaTrend3M[goaName] = item.trend3M || 0;
        store.score = (store.score + item.score) / 2; 
      });

      setGoas(prev => {
        if (!prev.find(g => g.name.toUpperCase() === goaName)) {
          const formatted = goaName.charAt(0).toUpperCase() + goaName.slice(1).toLowerCase();
          const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `goa-${Date.now()}-${Math.random().toString(36).substring(2)}`;
          return [...prev, { id: uniqueId, name: formatted }];
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
      const idxMargen = headers.findIndex(h => h === 'MARGEN' || h === 'MG' || h.includes('%GM') || h === 'UTILIDAD');
      const idxRotacion = headers.findIndex(h => h === 'ROTACION' || h === 'ROT' || h.includes('SELL'));
      const idxOH = headers.findIndex(h => h === 'OH' || h === 'INV' || h === 'INVENTARIO' || h === 'STOCK');
      const idxZona = headers.findIndex(h => h === 'ZONA' || h === 'REGION' || h === 'DISTRITO');
      const idxSku = headers.findIndex(h => h === 'SKU' || h === 'ARTICULO' || h === 'MATERIAL' || h === 'ITEM');
      const idxTalla = headers.findIndex(h => h === 'TALLA' || h === 'SIZE' || h === 'NUMERO');
      const idxOO = headers.findIndex(h => h === 'OO' || h === 'ON ORDER' || h === 'ONORDER' || h === 'EN PEDIDO' || h === 'PEDIDO');
      const idxTrend3M = headers.findIndex(h => h === 'VTA3M' || h === 'VENTAS3M' || h === 'VENTAS_3M' || h === 'TREND3M' || h === 'TREND_3M' || h === 'V3M' || h === 'VTAS3M');

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
        const rawOO = idxOO !== -1 && rows[i][idxOO] ? String(rows[i][idxOO]).replace(/[^0-9.-]+/g, "") : "0";
        const rawTrend3M = idxTrend3M !== -1 && rows[i][idxTrend3M] ? String(rows[i][idxTrend3M]).replace(/[^0-9.-]+/g, "") : "0";
        const rawSku = idxSku !== -1 && rows[i][idxSku] ? String(rows[i][idxSku]).trim() : 'N/A';
        const rawTalla = idxTalla !== -1 && rows[i][idxTalla] ? String(rows[i][idxTalla]).trim() : 'N/A';
        const rawModelo = headers.includes('MODELO') ? String(rows[i][headers.indexOf('MODELO')]).trim() : 'N/A';
        
        let ventas = parseFloat(rawVentas) || 0; let margen = parseFloat(rawMargen) || 0; let rotacion = parseFloat(rawRotacion) || 0;
        let oh = parseFloat(rawOH) || 0;
        let oo = parseFloat(rawOO) || 0;
        let trend3M = parseFloat(rawTrend3M) || 0;
        if (margen > 1 && margen <= 100 && idxMargen !== -1 && String(rows[0][idxMargen]).includes('%')) margen = margen / 100; 

        extractedRawData.push({
          centro: rows[i][idxCentro], name: idxNombre !== -1 ? rows[i][idxNombre] : rows[i][idxCentro],
          zona: idxZona !== -1 && rows[i][idxZona] ? rows[i][idxZona] : 'General',
          goa: rows[i][idxGoa].toUpperCase(), sales: ventas, margin: margen, rotation: rotacion, oh: oh,
          oo: oo, trend3M: trend3M,
          sku: rawSku, modelo: rawModelo, talla: rawTalla
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
          nomSeccionCol = rowUpper.indexOf('NOM_SECCIÓN') > -1 ? rowUpper.indexOf('NOM_SECCIÓN') : rowUpper.indexOf('NOM_SECCIÓN');
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
      
      const newMeta = {
         sections: Array.from(metaSections).sort(),
         brandsBySection: Object.fromEntries(Object.entries(metaBrandsBySection).map(([k, v]) => [k, Array.from(v).sort()])),
         allBrands: Array.from(metaAllBrands).sort()
      };

      setBrandMatrix(matrix);
      setMatrixMetadata(newMeta);

      try {
        localStorage.setItem('goplanner_brand_matrix', JSON.stringify(matrix));
        localStorage.setItem('goplanner_brand_meta', JSON.stringify(newMeta));
      } catch(err) {}

      alert(`Matriz Dinámica cargada con éxito y FIJADA de forma segura.\nSe detectaron ${storeCols.length} Tiendas y se registraron sus Marcas/Secciones permitidas.`);
      e.target.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1'); 
  };

  const storeStats = useMemo(() => {
    const filteredStores = selectedGoaFilter === 'ALL' 
      ? (stores || []) 
      : (stores || []).filter(s => s.clusters && s.clusters[selectedGoaFilter]);

    const stats = {
      total: filteredStores.length,
      goas:  (goas  || []).length,
      clusters: { 'Sin Asignar': 0 },
    };
    
    (activeClusters || []).forEach(c => { stats.clusters[c] = 0; });
    
    filteredStores.forEach(s => {
      const clusterVal = selectedGoaFilter === 'ALL' ? s.globalCluster : (s.clusters ? s.clusters[selectedGoaFilter] : undefined);
      if (!clusterVal) { stats.clusters['Sin Asignar']++; } 
      else { if (stats.clusters[clusterVal] !== undefined) stats.clusters[clusterVal]++; }
    });
    
    return stats;
  }, [stores, goas, activeClusters, selectedGoaFilter]);

  const sortedStores = useMemo(() => {
    return [...(stores || [])].sort((a, b) => {
      let valA = a[storeSortBy];
      let valB = b[storeSortBy];
      if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
      if (valA < valB) return storeSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return storeSortOrder === 'asc' ?  1 : -1;
      return 0;
    });
  }, [stores, storeSortBy, storeSortOrder]);

  const toggleSort = (field) => {
    if (storeSortBy === field) { setStoreSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); } 
    else { setStoreSortBy(field); setStoreSortOrder('desc'); }
  };

  const displayedStores = useMemo(() => {
    let list = selectedGoaFilter === 'ALL' ? sortedStores : sortedStores.filter(s => s.clusters[selectedGoaFilter]);
    if (storeNameFilter.trim()) {
      const q = storeNameFilter.trim().toUpperCase();
      list = list.filter(s =>
        (s.name || '').toUpperCase().includes(q) ||
        String(s.centerCode || '').toUpperCase().includes(q) ||
        (s.zona || '').toUpperCase().includes(q)
      );
    }
    return list;
  }, [sortedStores, selectedGoaFilter, storeNameFilter]);
  
  // LÓGICA DE OVERRIDE MANUAL PARA CLÚSTERES (MEJORA VISUAL)
  const handleManualClusterChange = (storeCenterCode, goaName, newCluster) => {
    setStores(prev => prev.map(s => {
      if (s.centerCode === storeCenterCode) {
        return {
          ...s,
          clusters: {
            ...s.clusters,
            [goaName]: newCluster
          }
        };
      }
      return s;
    }));
  };

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

          const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${i}`;
          return { ...baseItem, id: uniqueId, talla: t, qty: q, sku: finalSku, modelo: finalModelo };
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
      
      while (parts.length > 0 && parts[parts.length - 1] === '') { parts.pop(); }

      if (parts.length < 3) { if (parts.length > 0 && parts[0] !== '') errores++; return; }
      if (parts[0].toUpperCase() === 'GOA' || parts[0].toUpperCase() === 'SECCION' || parts[0].toUpperCase() === 'SECCIÓN') return;

      let seccion = 'N/A', goa = 'N/A', marca = 'N/A', modelo = 'N/A', sku = '', color = 'N/A', talla = 'N/A', qty = '';

      const n = parts.length;
      
      if (n >= 8) {
        seccion = parts[0]; goa = parts[1]; marca = parts[2]; modelo = parts[3]; sku = parts[4]; color = parts[5]; talla = parts[6]; qty = parts[7];
      } else if (n === 7) {
        goa = parts[0]; marca = parts[1]; modelo = parts[2]; sku = parts[3]; color = parts[4]; talla = parts[5]; qty = parts[6];
      } else if (n === 6) {
        goa = parts[0]; modelo = parts[1]; sku = parts[2]; color = parts[3]; talla = parts[4]; qty = parts[5];
      } else if (n === 5) {
        goa = parts[0]; modelo = parts[1]; sku = parts[2]; talla = parts[3]; qty = parts[4];
      } else if (n === 4) {
        goa = parts[0]; modelo = parts[1]; sku = parts[2]; qty = parts[3];
      } else {
        goa = parts[0]; sku = parts[1]; modelo = parts[1]; qty = parts[2];
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
        let parts = [...rows[i]];
        while (parts.length > 0 && parts[parts.length - 1].trim() === "") { parts.pop(); }

        if (parts.length >= 3) {
           let seccion = 'N/A', goa = 'N/A', marca = 'N/A', modelo = 'N/A', sku = '', color = 'N/A', talla = 'N/A', qty = '';
           const n = parts.length;
           
           if (n >= 8) {
             seccion = parts[0] || 'N/A'; goa = parts[1] || 'N/A'; marca = parts[2] || 'N/A'; 
             modelo = parts[3] || 'N/A'; sku = parts[4] || ''; color = parts[5] || 'N/A'; 
             talla = parts[6] || 'N/A'; qty = parts[7]; 
           } else if (n === 7) {
             goa = parts[0]; marca = parts[1]; modelo = parts[2]; sku = parts[3]; color = parts[4]; talla = parts[5]; qty = parts[6];
           } else if (n === 6) {
             goa = parts[0]; modelo = parts[1]; sku = parts[2]; color = parts[3]; talla = parts[4]; qty = parts[5];
           } else if (n === 5) {
             goa = parts[0]; modelo = parts[1]; sku = parts[2]; talla = parts[3]; qty = parts[4];
           } else if (n === 4) {
             goa = parts[0]; modelo = parts[1]; sku = parts[2]; qty = parts[3];
           } else {
             goa = parts[0]; sku = parts[1]; modelo = parts[1]; qty = parts[2];
           }

           if (qty && goa && goa !== 'N/A' && (sku || modelo)) {
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
         if (errores > 0) alert(`Se cargó el CSV con éxito, pero se omitieron ${errores} filas por formato incorrecto o falta de datos.`);
      } else {
         alert("No se detectaron datos válidos. Revisa que las columnas coincidan con el formato requerido.");
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
    setOverstockAlerts([]);
    
    const dynamicOH = {};
    const dynamicSkuOH = {};
    stores.forEach(s => {
       dynamicOH[s.centerCode] = { ...s.goaOH };
       dynamicSkuOH[s.centerCode] = { ...s.skuOH };
    });

    // ========================================================================
    // SIZE SCALING (PACK): asigna packs enteros respetando curva del proveedor
    // ========================================================================
    if (distMode === 'PACK') {
      const allSwapLogs = []; // global a todos los GOA
      // 1) Agrupar items de la chequera por GOA (clave) — luego por SKU/talla
      const itemsByGoa = {};
      chequera.forEach(it => {
        const g = it.goa.toUpperCase();
        if (!itemsByGoa[g]) itemsByGoa[g] = [];
        itemsByGoa[g].push(it);
      });

      const goasWithoutCurve = [];
      Object.keys(itemsByGoa).forEach(goaName => {
        const curve = packCurves[goaName];
        if (!curve || curve.length === 0 || curve.every(r => !r.qty || r.qty <= 0)) {
          goasWithoutCurve.push(goaName);
        }
      });
      if (goasWithoutCurve.length > 0) {
        alert(`Falta definir la curva de empaquetado para: ${goasWithoutCurve.join(', ')}.\n\nAbre "Configurar Packs" y captura la curva por GOA.`);
        return;
      }

      Object.keys(itemsByGoa).forEach(goaName => {
        const items = itemsByGoa[goaName];
        const curve = packCurves[goaName].filter(r => r.talla && r.qty > 0);
        const packSize = curve.reduce((s, r) => s + Number(r.qty), 0);
        if (packSize <= 0) {
          warnings.push(`[${goaName}]: Pack size = 0. Revisa la curva.`);
          return;
        }

        // 2) Por cada talla del pack, ¿hay item disponible en la chequera con esa talla?
        //    Si hay varios SKU con la misma talla, los reparte proporcionalmente.
        const tallasPack = curve.map(r => String(r.talla).toUpperCase());
        const itemsByTalla = {};
        tallasPack.forEach(tl => { itemsByTalla[tl] = []; });
        items.forEach(it => {
          const tl = String(it.talla).toUpperCase();
          if (itemsByTalla[tl]) itemsByTalla[tl].push(it);
        });

        // Validación: cada talla del pack debe tener al menos 1 item
        const tallasFaltantes = tallasPack.filter(tl => itemsByTalla[tl].length === 0);
        if (tallasFaltantes.length > 0) {
          warnings.push(`[${goaName}]: Faltan SKUs en la chequera para las tallas ${tallasFaltantes.join(', ')} requeridas por el pack. No se distribuye este GOA.`);
          return;
        }

        // 3) Calcular cuántos packs caben con el inventario aportado por talla
        //    Por talla: qty disponible total / qty por pack = packs posibles para esa talla.
        const packsPosiblesPorTalla = curve.map(r => {
          const tl = String(r.talla).toUpperCase();
          const totalQty = itemsByTalla[tl].reduce((s, it) => s + Number(it.qty), 0);
          return Math.floor(totalQty / Number(r.qty));
        });
        const totalPacks = Math.min(...packsPosiblesPorTalla);

        if (totalPacks <= 0) {
          warnings.push(`[${goaName}]: Las cantidades de la chequera no alcanzan ni para 1 pack completo (${packSize} pzs). Revisa qty por talla.`);
          return;
        }

        // 4) Tiendas elegibles: ventas en GOA + matriz de marca de cada item
        let eligibleStores = stores.filter(s => s.goaScores && s.goaScores[goaName] > 0);
        if (eligibleStores.length === 0) {
          warnings.push(`[${goaName}]: Sin tiendas con ventas en este GOA.`);
          return;
        }
        if (Object.keys(brandMatrix).length > 0) {
          // Una tienda califica si está autorizada para AL MENOS uno de los SKUs del lote
          eligibleStores = eligibleStores.filter(s => {
            const normStoreId = parseInt(s.centerCode).toString();
            const authBrands = brandMatrix[normStoreId] || [];
            return items.some(it => {
              const reqSeccion = it.seccion?.toUpperCase() || 'N/A';
              const reqMarca = it.marca?.toUpperCase() || 'N/A';
              if (reqSeccion === 'N/A' && reqMarca === 'N/A') return true;
              if (authBrands.includes(`${reqSeccion}|${reqMarca}`)) return true;
              if (reqSeccion === 'N/A' && authBrands.some(a => a.endsWith(`|${reqMarca}`))) return true;
              if (reqMarca === 'N/A' && authBrands.some(a => a.startsWith(`${reqSeccion}|`))) return true;
              if (authBrands.includes(`N/A|${reqMarca}`)) return true;
              return false;
            });
          });
          if (eligibleStores.length === 0) {
            warnings.push(`[${goaName}]: Ninguna tienda autorizada en la Matriz para los SKUs del lote.`);
            return;
          }
        }

        // 5) Score por tienda = goaScore * (1 + 1/(1+OH)) — premia bajo OH y alto score
        //    Luego priorizar clusters "permitidos" para garantizar al menos 1 pack.
        const allowedClusters = packMinClusters[goaName] || [];
        const enriched = eligibleStores.map(s => {
          const oh = dynamicOH[s.centerCode]?.[goaName] || 0;
          const cluster = s.clusters?.[goaName] || s.globalCluster || '';
          const score = s.goaScores[goaName];
          const ohFactor = 1 / (1 + oh / Math.max(1, packSize)); // bajo OH = mayor factor
          const weight = score * (0.5 + 0.5 * ohFactor); // mezcla 50/50 score y OH inverso
          return { store: s, cluster, oh, score, weight, isAllowed: allowedClusters.includes(cluster) };
        });

        const totalWeight = enriched.reduce((s, e) => s + e.weight, 0);
        if (totalWeight <= 0) {
          warnings.push(`[${goaName}]: Score total = 0 entre tiendas elegibles.`);
          return;
        }

        // 6) Asignación de packs enteros — Hamilton (largest remainder)
        const packsByStore = new Map();
        const remainders = [];
        let assignedPacks = 0;
        enriched.forEach(e => {
          const ideal = (e.weight / totalWeight) * totalPacks;
          const floorPacks = Math.floor(ideal);
          if (floorPacks > 0) {
            packsByStore.set(e.store.centerCode, floorPacks);
            assignedPacks += floorPacks;
          }
          remainders.push({ store: e.store, fraction: ideal - floorPacks, isAllowed: e.isAllowed, weight: e.weight });
        });

        // Garantizar 1 pack a tiendas en clusters permitidos que aún no recibieron
        const allowedSinPack = remainders
          .filter(r => r.isAllowed && !packsByStore.has(r.store.centerCode))
          .sort((a, b) => b.weight - a.weight);
        const packsRestantes = totalPacks - assignedPacks;
        let used = 0;
        allowedSinPack.forEach(r => {
          if (used < packsRestantes) {
            packsByStore.set(r.store.centerCode, 1);
            used++; assignedPacks++;
          }
        });

        // Distribuir packs sobrantes por largest remainder entre todas
        let pendientes = totalPacks - assignedPacks;
        remainders.sort((a, b) => b.fraction - a.fraction);
        let idx = 0;
        while (pendientes > 0 && remainders.length > 0) {
          const target = remainders[idx % remainders.length].store.centerCode;
          packsByStore.set(target, (packsByStore.get(target) || 0) + 1);
          pendientes--;
          idx++;
        }

        // 7) Materializar resultado: por cada tienda, por cada talla del pack, asignar (packs * qty_curva)
        //    Si hay varios SKUs por talla, repartir proporcionalmente a la qty original de cada SKU.
        const swapEnabled = !!packAllowSwap[goaName];
        const coverThreshold = Number(packCoverThreshold[goaName]) > 0 ? Number(packCoverThreshold[goaName]) : 5;
        const swapLog = []; // para reporte al usuario

        packsByStore.forEach((numPacks, centerCode) => {
          if (numPacks <= 0) return;
          const storeObj = stores.find(s => s.centerCode === centerCode);

          // ---- SWAP por cobertura ----
          // effectiveCurve = curva ajustada para esta tienda
          let effectiveCurve = curve.map(r => ({ talla: String(r.talla).toUpperCase(), qty: Number(r.qty) * numPacks }));

          if (swapEnabled && storeObj) {
            // Calcular cobertura por talla (en meses). Ventas son ANUALES → /12
            const tallaInfo = effectiveCurve.map(r => {
              const key = `${goaName}|${r.talla}`;
              const ventasAnuales = storeObj.goaSizeSales?.[key] || 0;
              const ventasMensuales = ventasAnuales / 12;
              const ohActual = storeObj.goaSizeOH?.[key] || 0;
              const cover = ventasMensuales > 0 ? (ohActual / ventasMensuales) : (ohActual > 0 ? 999 : 0);
              return { ...r, ventasAnuales, cover };
            });

            // Tallas saturadas (> umbral) y tallas receptoras (≤ umbral, ordenadas por venta histórica desc)
            const saturadas = tallaInfo.filter(t => t.cover > coverThreshold && t.qty > 0);
            const receptoras = tallaInfo.filter(t => t.cover <= coverThreshold)
                                        .sort((a, b) => b.ventasAnuales - a.ventasAnuales);

            if (saturadas.length > 0 && receptoras.length > 0) {
              saturadas.forEach(sat => {
                // Receptora preferente: la de mayor venta histórica en esta tienda
                const target = receptoras.find(r => r.ventasAnuales > 0) || receptoras[0];
                if (!target) return;
                const idxSat = effectiveCurve.findIndex(c => c.talla === sat.talla);
                const idxTgt = effectiveCurve.findIndex(c => c.talla === target.talla);
                if (idxSat === -1 || idxTgt === -1) return;

                const movidas = effectiveCurve[idxSat].qty;
                effectiveCurve[idxTgt].qty += movidas;
                effectiveCurve[idxSat].qty = 0;
                swapLog.push(`[${centerCode}] ${goaName}: ${movidas} pzs T-${sat.talla} (cob ${sat.cover.toFixed(1)}m) → T-${target.talla}`);
              });
            }
          }

          // ---- Materializar usando effectiveCurve ----
          effectiveCurve.forEach(rule => {
            const tl = rule.talla;
            const piezasTalla = rule.qty;
            if (piezasTalla <= 0) return;
            const skusEnTalla = itemsByTalla[tl];
            if (!skusEnTalla || skusEnTalla.length === 0) return; // talla destino sin SKU en chequera (raro tras validación previa)
            const totalQtyTalla = skusEnTalla.reduce((s, it) => s + Number(it.qty), 0);

            // Reparto proporcional entre SKUs de la misma talla
            let asignadasAcum = 0;
            skusEnTalla.forEach((it, i) => {
              let asignar;
              if (i === skusEnTalla.length - 1) {
                asignar = piezasTalla - asignadasAcum; // último toma residuo
              } else {
                asignar = Math.floor((Number(it.qty) / totalQtyTalla) * piezasTalla);
                asignadasAcum += asignar;
              }
              if (asignar <= 0) return;

              dynamicOH[centerCode][goaName] = (dynamicOH[centerCode][goaName] || 0) + asignar;
              if (!dynamicSkuOH[centerCode]) dynamicSkuOH[centerCode] = {};
              dynamicSkuOH[centerCode][it.sku] = (dynamicSkuOH[centerCode][it.sku] || 0) + asignar;

              results.push({
                centro: centerCode,
                nombre: storeObj ? storeObj.name : centerCode,
                zona: storeObj ? storeObj.zona : 'General',
                ventas: storeObj ? storeObj.goaSales[goaName] : 0,
                score: storeObj ? storeObj.goaScores[goaName] : 0,
                globalCluster: storeObj ? storeObj.globalCluster : '',
                initialOH: storeObj ? (storeObj.goaOH[goaName] || 0) : 0,
                sku: it.sku, modelo: it.modelo, goa: goaName, marca: it.marca, color: it.color,
                talla: it.talla, qty: asignar,
                packs: numPacks // metadato de cuántos packs recibió
              });
            });
          });
        });
        if (swapLog.length > 0) allSwapLogs.push(...swapLog);
      });

      if (warnings.length > 0) alert("ATENCIÓN: Alertas del sistema durante la corrida (PACK):\n\n" + warnings.join("\n\n"));
      if (allSwapLogs.length > 0) alert(`SWAPS aplicados por cobertura excedida (${allSwapLogs.length}):\n\n${allSwapLogs.slice(0, 20).join('\n')}${allSwapLogs.length > 20 ? `\n\n... y ${allSwapLogs.length - 20} más` : ''}`);
      results.sort((a, b) => a.centro.localeCompare(b.centro) || a.sku.localeCompare(b.sku));
      setDistributionResult(results);
      try {
        const finalAllocations = {};
        results.forEach(r => { finalAllocations[r.centro] = (finalAllocations[r.centro] || 0) + r.qty; });
        const totalFcst = chequera.reduce((s, it) => s + Number(it.qty), 0);
        const totalAlloc = Object.values(finalAllocations).reduce((a, b) => a + b, 0);
        const fillRate = totalFcst > 0 ? Math.min((totalAlloc / totalFcst) * 100, 100) : 0;
        if (typeof globalActions !== 'undefined' && gDispatch) {
          globalActions.publishDistribution(gDispatch, { allocations: finalAllocations, fillRate, result: results });
        }
      } catch (error) {}
      return;
    }
    // ========================================================================
    // FIN BRANCH PACK
    // ========================================================================
    
    // ====================================================================
    // HELPERS COMPARTIDOS para PUSH / OH / SKU
    // ====================================================================
    const newAlerts = [];

    // Filtra tiendas elegibles aplicando matriz de marca + score > 0
    const filterEligible = (item, goaName, baseStores) => {
      let elig = baseStores.filter(s => s.goaScores && s.goaScores[goaName] > 0);
      if (elig.length === 0) return [];
      if (Object.keys(brandMatrix).length > 0) {
        elig = elig.filter(s => {
          const normStoreId = parseInt(s.centerCode).toString();
          const authBrands = brandMatrix[normStoreId] || [];
          const reqSeccion = item.seccion?.toUpperCase() || 'N/A';
          const reqMarca = item.marca?.toUpperCase() || 'N/A';
          if (reqSeccion === 'N/A' && reqMarca === 'N/A') return true;
          if (authBrands.includes(`${reqSeccion}|${reqMarca}`)) return true;
          if (reqSeccion === 'N/A' && authBrands.some(a => a.endsWith(`|${reqMarca}`))) return true;
          if (reqMarca === 'N/A' && authBrands.some(a => a.startsWith(`${reqSeccion}|`))) return true;
          if (authBrands.includes(`N/A|${reqMarca}`)) return true;
          return false;
        });
      }
      return elig;
    };

    // MOS objetivo (default 3 si no está configurado)
    const getMos = (goaName) => {
      const cfg = mosTarget[goaName];
      return { min: cfg?.min ?? 1.5, max: cfg?.max ?? 3 };
    };

    // Ventas mensuales priorizando tendencia 3M (si > 0) sobre 12M
    const monthlySales = (storeObj, goaName, talla = null) => {
      if (talla) {
        const key = `${goaName}|${talla}`;
        const v3m = storeObj.goaSizeTrend3M?.[key] || 0;
        if (v3m > 0) return v3m / 3;
        return (storeObj.goaSizeSales?.[key] || 0) / 12;
      }
      const v3m = storeObj.goaTrend3M?.[goaName] || 0;
      if (v3m > 0) return v3m / 3;
      return (storeObj.goaSales?.[goaName] || 0) / 12;
    };

    // Función para empujar resultado y actualizar OH dinámico
    const pushResult = (centerCode, qty, item, goaName, eligibleStores) => {
      if (qty <= 0) return;
      dynamicOH[centerCode][goaName] = (dynamicOH[centerCode][goaName] || 0) + qty;
      if (!dynamicSkuOH[centerCode]) dynamicSkuOH[centerCode] = {};
      dynamicSkuOH[centerCode][item.sku] = (dynamicSkuOH[centerCode][item.sku] || 0) + qty;

      const storeObj = eligibleStores.find(s => s.centerCode === centerCode);
      // Merge si ya existe la combinación centro+sku
      const existing = results.find(r => r.centro === centerCode && r.sku === item.sku);
      if (existing) {
        existing.qty += qty;
        return;
      }
      results.push({
        centro: centerCode,
        nombre: storeObj ? storeObj.name : centerCode,
        zona: storeObj ? storeObj.zona : 'General',
        ventas: storeObj ? storeObj.goaSales[goaName] : 0,
        score: storeObj ? storeObj.goaScores[goaName] : 0,
        globalCluster: storeObj ? storeObj.globalCluster : '',
        initialOH: storeObj ? (storeObj.goaOH[goaName] || 0) : 0,
        sku: item.sku, modelo: item.modelo, goa: goaName,
        marca: item.marca, color: item.color, talla: item.talla, qty: qty
      });
    };

    // ====================================================================
    // PUSH: Llenado por canal/cluster + corrida + round-robin
    // ====================================================================
    if (distMode === 'PUSH') {
      // Agrupar items por modelo+GOA para detectar corridas (varias tallas mismo modelo)
      const byModel = {};
      chequera.forEach(it => {
        const k = `${it.modelo.toUpperCase()}|${it.goa.toUpperCase()}|${(it.color || '').toUpperCase()}`;
        if (!byModel[k]) byModel[k] = [];
        byModel[k].push(it);
      });

      Object.values(byModel).forEach(items => {
        const sample = items[0];
        const goaName = sample.goa.toUpperCase();
        const eligibleStores = filterEligible(sample, goaName, stores);
        if (eligibleStores.length === 0) {
          warnings.push(`[${sample.modelo}/${goaName}]: sin tiendas elegibles tras filtro de matriz.`);
          return;
        }

        // Ordenar tiendas: cluster primero (AA → A → B...) y luego por score desc
        const clusterRank = {};
        activeClusters.forEach((c, i) => { clusterRank[c] = i; });
        const sortedStores = [...eligibleStores].sort((a, b) => {
          const ra = clusterRank[a.clusters?.[goaName] || a.globalCluster] ?? 999;
          const rb = clusterRank[b.clusters?.[goaName] || b.globalCluster] ?? 999;
          if (ra !== rb) return ra - rb;
          return (b.goaScores[goaName] || 0) - (a.goaScores[goaName] || 0);
        });

        const hasTallas = items.some(it => it.talla && it.talla !== 'UNICA' && it.talla !== 'N/A');

        if (hasTallas && items.length > 1) {
          // CORRIDA: cada talla tiene proporciones según qty del lote.
          // Calcular GCD para reducir a corrida mínima (ej. 10,20,30,20,10 → 1,2,3,2,1)
          const qtys = items.map(it => parseInt(it.qty));
          const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
          const totalGcd = qtys.reduce((g, q) => gcd(g, q));
          const corrida = qtys.map(q => q / totalGcd);
          const piezasPorCorrida = corrida.reduce((s, q) => s + q, 0);
          const totalPzs = qtys.reduce((s, q) => s + q, 0);
          const corridasDisponibles = Math.floor(totalPzs / piezasPorCorrida);

          // Asignar 1 corrida completa por tienda (en orden de cluster/score)
          let corridasUsadas = 0;
          for (const store of sortedStores) {
            if (corridasUsadas >= corridasDisponibles) break;
            items.forEach((it, idx) => {
              pushResult(store.centerCode, corrida[idx], it, goaName, eligibleStores);
            });
            corridasUsadas++;
          }

          // Sobrante: round-robin de corridas a las top tiendas
          let sobrantes = corridasDisponibles - corridasUsadas;
          let i = 0;
          while (sobrantes > 0 && sortedStores.length > 0) {
            const store = sortedStores[i % sortedStores.length];
            items.forEach((it, idx) => {
              pushResult(store.centerCode, corrida[idx], it, goaName, eligibleStores);
            });
            sobrantes--;
            i++;
          }
          // Residuo (piezas que no completan corrida) → descartar (no se rompe corrida)
        } else {
          // SIN TALLAS o talla única: round-robin de 1 pza por vuelta
          items.forEach(it => {
            let qtyToDist = parseInt(it.qty);
            let i = 0;
            while (qtyToDist > 0 && sortedStores.length > 0) {
              const store = sortedStores[i % sortedStores.length];
              pushResult(store.centerCode, 1, it, goaName, eligibleStores);
              qtyToDist--;
              i++;
            }
          });
        }
      });
    }

    // ====================================================================
    // OH (Dispersión GOA) — iterativo pza-a-pza con MOS objetivo
    // ====================================================================
    if (distMode === 'OH') {
      // Agrupar por GOA+marca para alertas
      const goaMarcaSummary = {};

      chequera.forEach(item => {
        const goaName = item.goa.toUpperCase();
        const marcaKey = `${goaName}|${(item.marca || 'N/A').toUpperCase()}`;
        let qtyToDistribute = parseInt(item.qty);
        if (qtyToDistribute <= 0) return;

        const eligibleStores = filterEligible(item, goaName, stores);
        if (eligibleStores.length === 0) {
          warnings.push(`[${item.sku}]: sin tiendas elegibles tras matriz.`);
          return;
        }

        const { min: mosMin, max: mosMax } = getMos(goaName);

        // Pre-calcular MOS actual por tienda (con OH+OO)
        const computeMos = (store) => {
          const oh = dynamicOH[store.centerCode]?.[goaName] || 0;
          const oo = store.goaOO?.[goaName] || 0;
          const ms = monthlySales(store, goaName);
          if (ms <= 0) return oh + oo > 0 ? 999 : 0;
          return (oh + oo) / ms;
        };

        // Iterar pza a pza: a cada paso, asignar a la tienda con menor MOS (entre las que aún están bajo el target max y respetan score)
        let pzasRest = qtyToDistribute;
        const safetyLimit = pzasRest * 100; // evitar loops infinitos
        let safety = 0;

        while (pzasRest > 0 && safety < safetyLimit) {
          // Candidatas: tiendas con MOS < mosMax (margen de seguridad)
          const candidates = eligibleStores
            .map(s => ({ store: s, mos: computeMos(s), score: s.goaScores[goaName] }))
            .filter(c => c.mos < mosMax);

          if (candidates.length === 0) break; // todas saturadas

          // Priorizar por: cluster (mejor primero) y mos (menor primero)
          const clusterRank = {};
          activeClusters.forEach((c, i) => { clusterRank[c] = i; });
          candidates.sort((a, b) => {
            const ra = clusterRank[a.store.clusters?.[goaName] || a.store.globalCluster] ?? 999;
            const rb = clusterRank[b.store.clusters?.[goaName] || b.store.globalCluster] ?? 999;
            if (ra !== rb) return ra - rb;
            return a.mos - b.mos;
          });

          const target = candidates[0];
          pushResult(target.store.centerCode, 1, item, goaName, eligibleStores);
          pzasRest--;
          safety++;
        }

        // Tracking sobre-inventariadas para alertas
        if (!goaMarcaSummary[marcaKey]) {
          goaMarcaSummary[marcaKey] = { goa: goaName, marca: item.marca || 'N/A', total: 0, over: [], saturadas: pzasRest };
        }
        eligibleStores.forEach(s => {
          goaMarcaSummary[marcaKey].total++;
          const mos = computeMos(s);
          if (mos > mosMax) {
            goaMarcaSummary[marcaKey].over.push({ centro: s.centerCode, name: s.name, mos: mos.toFixed(1) });
          }
        });
        if (pzasRest > 0) {
          warnings.push(`[${item.sku}]: ${pzasRest} pzs no asignadas. Todas las tiendas elegibles superan MOS objetivo (${mosMax}m).`);
        }
      });

      // Generar alertas
      Object.values(goaMarcaSummary).forEach(s => {
        if (s.total === 0) return;
        const uniqueOver = Array.from(new Map(s.over.map(o => [o.centro, o])).values());
        const totalUniqueStores = new Set(s.over.map(o => o.centro)).size + (s.total - s.over.length);
        const pct = (uniqueOver.length / Math.max(1, s.total)) * 100;
        if (pct > 20) {
          newAlerts.push({
            goa: s.goa, marca: s.marca, pct: pct.toFixed(1),
            totalStores: s.total, overStores: uniqueOver.slice(0, 50),
            reason: `Más del 20% de tiendas (${pct.toFixed(0)}%) supera MOS objetivo. Considerar pausar compras de ${s.goa}/${s.marca}.`
          });
        }
      });
    }

    // ====================================================================
    // SKU (Size-Level) — score-first + talla + MOS sano
    // ====================================================================
    if (distMode === 'SKU') {
      const goaMarcaSummary = {};

      chequera.forEach(item => {
        const goaName = item.goa.toUpperCase();
        const marcaKey = `${goaName}|${(item.marca || 'N/A').toUpperCase()}`;
        const tallaKey = item.talla?.toUpperCase() || null;
        let qtyToDistribute = parseInt(item.qty);
        if (qtyToDistribute <= 0) return;

        const eligibleStores = filterEligible(item, goaName, stores);
        if (eligibleStores.length === 0) {
          warnings.push(`[${item.sku}]: sin tiendas elegibles tras matriz.`);
          return;
        }

        const { min: mosMin, max: mosMax } = getMos(goaName);

        // Score combinado: prioridad a la talla específica, fallback a SKU, fallback a GOA
        const getScore = (s) => {
          if (tallaKey && tallaKey !== 'N/A' && s.goaSizeSales?.[`${goaName}|${tallaKey}`] > 0) {
            return s.goaSizeSales[`${goaName}|${tallaKey}`];
          }
          if (s.skuSales?.[item.sku] > 0) return s.skuSales[item.sku];
          return s.goaScores[goaName];
        };

        const computeMosSize = (store) => {
          // MOS por talla específica si existe data, sino por GOA
          if (tallaKey && tallaKey !== 'N/A') {
            const key = `${goaName}|${tallaKey}`;
            const oh = (store.goaSizeOH?.[key] || 0) + (dynamicOH[store.centerCode]?.[goaName] || 0) - (store.goaOH?.[goaName] || 0);
            // Acumulación: oh actual de la talla + lo nuevo asignado al GOA (aprox)
            const ohEff = (store.goaSizeOH?.[key] || 0) + ((dynamicSkuOH[store.centerCode]?.[item.sku] || 0) - (store.skuOH?.[item.sku] || 0));
            const oo = store.goaSizeOO?.[key] || 0;
            const ms = monthlySales(store, goaName, tallaKey);
            if (ms <= 0) return ohEff + oo > 0 ? 999 : 0;
            return (ohEff + oo) / ms;
          }
          const oh = dynamicOH[store.centerCode]?.[goaName] || 0;
          const oo = store.goaOO?.[goaName] || 0;
          const ms = monthlySales(store, goaName);
          if (ms <= 0) return oh + oo > 0 ? 999 : 0;
          return (oh + oo) / ms;
        };

        // Ordenar tiendas por score desc inicialmente
        const ranked = [...eligibleStores]
          .map(s => ({ store: s, score: getScore(s) }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score);

        if (ranked.length === 0) {
          warnings.push(`[${item.sku}]: sin tiendas con venta histórica para talla ${tallaKey || 'N/A'}. Se omite.`);
          return;
        }

        let pzasRest = qtyToDistribute;
        let cursor = 0;
        const safetyLimit = pzasRest * 100;
        let safety = 0;

        while (pzasRest > 0 && safety < safetyLimit) {
          if (cursor >= ranked.length) cursor = 0;
          const start = cursor;
          let asignada = false;

          // Buscar la siguiente tienda en orden con MOS sano
          do {
            const cand = ranked[cursor];
            const mos = computeMosSize(cand.store);
            if (mos < mosMax) {
              // Decidir cuántas pzs darle de un golpe: hasta llegar al MOS objetivo (mosMax) o al min, lo que sea menor
              const ms = monthlySales(cand.store, goaName, tallaKey);
              const ohEff = tallaKey && tallaKey !== 'N/A'
                ? (cand.store.goaSizeOH?.[`${goaName}|${tallaKey}`] || 0) + ((dynamicSkuOH[cand.store.centerCode]?.[item.sku] || 0) - (cand.store.skuOH?.[item.sku] || 0))
                : (dynamicOH[cand.store.centerCode]?.[goaName] || 0);
              const oo = tallaKey && tallaKey !== 'N/A' ? (cand.store.goaSizeOO?.[`${goaName}|${tallaKey}`] || 0) : (cand.store.goaOO?.[goaName] || 0);
              const targetOH = ms * mosMax;
              const headroom = Math.max(1, Math.floor(targetOH - ohEff - oo));
              const give = Math.min(headroom, pzasRest);
              pushResult(cand.store.centerCode, give, item, goaName, eligibleStores);
              pzasRest -= give;
              asignada = true;
              cursor++; // mover a siguiente tienda para no concentrar todo en una
              break;
            }
            cursor++;
            if (cursor >= ranked.length) cursor = 0;
          } while (cursor !== start);

          if (!asignada) break; // ninguna tienda con MOS sano
          safety++;
        }

        if (!goaMarcaSummary[marcaKey]) {
          goaMarcaSummary[marcaKey] = { goa: goaName, marca: item.marca || 'N/A', total: 0, over: [] };
        }
        eligibleStores.forEach(s => {
          goaMarcaSummary[marcaKey].total++;
          const mos = computeMosSize(s);
          if (mos > mosMax) {
            goaMarcaSummary[marcaKey].over.push({ centro: s.centerCode, name: s.name, mos: mos.toFixed(1) });
          }
        });
        if (pzasRest > 0) {
          warnings.push(`[${item.sku}]: ${pzasRest} pzs no asignadas. Todas las tiendas elegibles superan MOS objetivo (${mosMax}m) en talla ${tallaKey}.`);
        }
      });

      Object.values(goaMarcaSummary).forEach(s => {
        if (s.total === 0) return;
        const uniqueOver = Array.from(new Map(s.over.map(o => [o.centro, o])).values());
        const pct = (uniqueOver.length / Math.max(1, s.total)) * 100;
        if (pct > 20) {
          newAlerts.push({
            goa: s.goa, marca: s.marca, pct: pct.toFixed(1),
            totalStores: s.total, overStores: uniqueOver.slice(0, 50),
            reason: `Más del 20% de tiendas (${pct.toFixed(0)}%) supera MOS objetivo. Considerar pausar compras de ${s.goa}/${s.marca}.`
          });
        }
      });
    }

    setOverstockAlerts(newAlerts);
    
    if (warnings.length > 0) {
       alert("ATENCIÓN: Alertas del sistema durante la corrida:\n\n" + warnings.join("\n\n"));
    }

    results.sort((a, b) => a.centro.localeCompare(b.centro) || a.sku.localeCompare(b.sku));
    setDistributionResult(results);

    try {
      const finalAllocations = {};
      results.forEach(r => { finalAllocations[r.centro] = (finalAllocations[r.centro] || 0) + r.qty; });
      const totalFcst = results.reduce((s, r) => s + r.qty, 0);
      const totalAlloc = Object.values(finalAllocations).reduce((a, b) => a + b, 0);
      const fillRate = totalFcst > 0 ? Math.min((totalAlloc / totalFcst) * 100, 100) : 0;
      if (typeof globalActions !== 'undefined' && gDispatch) {
        globalActions.publishDistribution(gDispatch, { allocations: finalAllocations, fillRate, result: results });
      }
    } catch (error) {}
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
  
  const triggerDownloadTXT = (filename, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
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

  const downloadParamTXT = () => {
    if (distributionResult.length === 0) return;
    const rows = distributionResult.map(r => {
        const centroPad = String(r.centro).padStart(4, '0');
        return `${r.sku}\t${centroPad}\t${paramForm.etiquetaAP}\t${paramForm.stockMin}\t${paramForm.stockMax}\t${paramForm.leadTime}\t${paramForm.min}\t${paramForm.max}\t${paramForm.th}\t${paramForm.tipoDistribucion}`;
    });
    const txtContent = rows.join('\n');
    triggerDownloadTXT(`Parametrizacion_${new Date().toISOString().split('T')[0]}.txt`, txtContent);
    setShowParamModal(false);
  };

  const filteredDistResult = useMemo(() => {
    if (dashGoaFilter === 'ALL') return distributionResult;
    return distributionResult.filter(r => r.goa === dashGoaFilter);
  }, [distributionResult, dashGoaFilter]);

  const topStoresData = useMemo(() => {
    if (filteredDistResult.length === 0) return [];
    const agg = {};
    filteredDistResult.forEach(r => {
      if (!agg[r.nombre]) agg[r.nombre] = { qty: 0, cluster: r.globalCluster };
      agg[r.nombre].qty += r.qty;
    });
    return Object.entries(agg).map(([name, val]) => ({ name, qty: val.qty, cluster: val.cluster })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filteredDistResult]);
  const topStoresMax = Math.max(...topStoresData.map(d => d.qty), 1);

  const modelsStoreData = useMemo(() => {
    if (filteredDistResult.length === 0) return { stores: [], models: [] };
    const agg = {};
    const modelsSet = new Set();
    filteredDistResult.forEach(r => {
      if (!agg[r.nombre]) agg[r.nombre] = { total: 0, models: {} };
      agg[r.nombre].total += r.qty;
      const dispModelo = r.modelo !== 'N/A' ? r.modelo : r.sku;
      agg[r.nombre].models[dispModelo] = (agg[r.nombre].models[dispModelo] || 0) + r.qty;
      modelsSet.add(dispModelo);
    });
    const sorted = Object.entries(agg).map(([name, val]) => ({ name, ...val })).sort((a, b) => b.total - a.total).slice(0, 15);
    return { stores: sorted, models: Array.from(modelsSet) };
  }, [filteredDistResult]);
  const modelsStoreMax = Math.max(...modelsStoreData.stores.map(d => d.total), 1);
  const modelsColors = ['bg-indigo-500', 'bg-pink-500', 'bg-amber-500', 'bg-teal-500', 'bg-cyan-500', 'bg-rose-500', 'bg-violet-500', 'bg-fuchsia-500'];

  const zonesData = useMemo(() => {
    if (filteredDistResult.length === 0) return [];
    const agg = {};
    filteredDistResult.forEach(r => {
      agg[r.zona] = (agg[r.zona] || 0) + r.qty;
    });
    return Object.entries(agg).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  }, [filteredDistResult]);
  const zonesMax = Math.max(...zonesData.map(d => d.qty), 1);

  const scatterData = useMemo(() => {
    if (filteredDistResult.length === 0) return { pre: [], post: [], maxInvPre: 10, maxInvPost: 10, maxVentas: 100 };
    const agg = {};
    filteredDistResult.forEach(r => {
      if(!agg[r.centro]) { agg[r.centro] = { name: r.nombre, env: 0, ohByGoa: {}, ventasByGoa: {} }; }
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
  }, [filteredDistResult]);

  const buyInsights = useMemo(() => {
    if (distributionResult.length === 0 || rawStoreData.length === 0) return { suggestions: [], hasTalla: false };
    
    const hasTallaInHistory = rawStoreData.some(row => row.talla && row.talla !== 'N/A');
    if (!hasTallaInHistory) return { suggestions: [], hasTalla: false };

    const sizeAgg = {}; 
    distributionResult.forEach(r => {
       const key = `${r.goa}|${r.talla}`;
       if (!sizeAgg[key]) sizeAgg[key] = { comprado: 0, vendido: 0, goa: r.goa, talla: r.talla, marcas: new Set() };
       sizeAgg[key].comprado += r.qty;
       sizeAgg[key].marcas.add(r.marca);
    });

    const goaTotals = {};
    distributionResult.forEach(r => {
       goaTotals[r.goa] = (goaTotals[r.goa] || 0) + r.qty;
    });

    const historicGoaTotals = {};
    rawStoreData.forEach(row => {
       if (!row.talla || row.talla === 'N/A') return; 
       const key = `${row.goa}|${row.talla}`;
       if (!sizeAgg[key]) sizeAgg[key] = { comprado: 0, vendido: 0, goa: row.goa, talla: row.talla, marcas: new Set(['Varias']) };
       sizeAgg[key].vendido += row.sales;
       historicGoaTotals[row.goa] = (historicGoaTotals[row.goa] || 0) + row.sales;
    });

    const suggestions = [];
    Object.values(sizeAgg).forEach(data => {
       const tComprado = goaTotals[data.goa] || 0;
       const tVendido = historicGoaTotals[data.goa] || 0;
       
       if (tComprado > 0 && tVendido > 0 && data.vendido > 0) {
           const mixComprado = data.comprado / tComprado;
           const mixVendido = data.vendido / tVendido;
           const diff = mixVendido - mixComprado;
           
           if (diff > 0.03) { 
               suggestions.push({
                  goa: data.goa, talla: data.talla, marca: Array.from(data.marcas).join(', '),
                  mixComprado: (mixComprado * 100).toFixed(1),
                  mixVendido: (mixVendido * 100).toFixed(1),
                  diff
               });
           }
       }
    });

    return { suggestions: suggestions.sort((a, b) => b.diff - a.diff).slice(0, 5), hasTalla: true };
  }, [distributionResult, rawStoreData]);

  // --- DATOS MATRIZ SKU ---
  const matrixData = useMemo(() => {
    if (filteredDistResult.length === 0) return null;

    const skusMap = new Map();
    const sMap = new Map();

    filteredDistResult.forEach(r => {
      if (!skusMap.has(r.sku)) {
        skusMap.set(r.sku, { sku: r.sku, talla: r.talla, modelo: r.modelo, goa: r.goa });
      }
      if (!sMap.has(r.centro)) {
        sMap.set(r.centro, { centro: r.centro, nombre: r.nombre, total: 0 });
      }
    });

    const skuCols = Array.from(skusMap.values()).sort((a, b) => a.sku.localeCompare(b.sku));
    const storesList = Array.from(sMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

    const mData = {};
    const totals = { global: 0 };
    skuCols.forEach(c => totals[c.sku] = 0);

    storesList.forEach(s => {
       mData[s.centro] = {};
       skuCols.forEach(c => mData[s.centro][c.sku] = 0);
    });

    filteredDistResult.forEach(r => {
       mData[r.centro][r.sku] += r.qty;
       sMap.get(r.centro).total += r.qty;
       totals[r.sku] += r.qty;
       totals.global += r.qty;
    });

    return { storesList, skuCols, mData, totals };
  }, [filteredDistResult]);

  // --- DESCARGA EXCEL MATRIZ SKU ---
  const downloadSkuMatrixCSV = () => {
    if (!matrixData || matrixData.storesList.length === 0) return;
    
    const { storesList, skuCols, mData, totals } = matrixData;
    const rows = [];
    
    rows.push(['TIENDA', ...skuCols.map(c => c.goa), 'TOTAL']);
    rows.push(['', ...skuCols.map(c => c.modelo), '']);
    rows.push(['', ...skuCols.map(c => c.talla !== 'N/A' ? `T-${c.talla}` : c.sku), '']);
    
    storesList.forEach(s => {
      const row = [`${s.centro} ${s.nombre}`];
      skuCols.forEach(c => {
        row.push(mData[s.centro][c.sku] || 0);
      });
      row.push(s.total);
      rows.push(row);
    });
    
    const footer = ['TOTAL GENERAL'];
    skuCols.forEach(c => footer.push(totals[c.sku]));
    footer.push(totals.global);
    rows.push(footer);

    const csvContent = rows.map(e => e.join(",")).join("\n");
    triggerDownload(`Matriz_Surtido_SKU_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
  };


  return (
    //<div className={`h-full flex flex-col font-sans transition-colors duration-300 ${t.appBg}`}>
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-300 ${t.appBg}`}>  
      
      {/* ENCABEZADO HOMOLOGADO */}
      <header className={`px-6 py-4 mb-2 flex items-center justify-between border-b transition-colors
        ${theme === 'dark' ? 'border-zinc-800' : 'border-gray-200'}
        shadow-[0_4px_10px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_10px_-4px_rgba(0,0,0,0.4)]`}>
        <div className="flex items-center">
          <h1 className={`text-2xl font-black tracking-widest flex items-center ${t.textMain}`}>
            GO
            <span className="mx-3 text-gray-400 font-light">|</span>
            <Icons.MapIcon size={28} className={t.textAccent1} />
          </h1>
        </div>
      </header>

      {/* TABS NATIVAS */}
      <div className="flex space-x-6 px-8 mt-4 border-b border-gray-200 dark:border-zinc-800 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab(1)} className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 1 ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`}`}>
          <Icons.Store size={18} /><span>1. Tiendas y Clústeres</span>
        </button>
        <button 
          onClick={() => { if (stores.length > 0) setActiveTab(2); }} 
          className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 2 ? t.tabActive : `border-transparent ${t.textMuted} hover:${t.textMain}`} ${stores.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Icons.BarChart2 size={18} /><span>2. Distribución</span>
        </button>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-300 relative">
        
        {/* MODAL DE PARAMETRIZACIÓN FLOTANTE */}
        {/* MODAL: CONFIGURACIÓN DE PACKS (Size Scaling) */}
        {showPackModal && (() => {
          const goasEnChequera = Array.from(new Set(chequera.map(it => it.goa.toUpperCase())));
          const tallasPorGoa = {};
          goasEnChequera.forEach(g => {
            tallasPorGoa[g] = Array.from(new Set(chequera.filter(it => it.goa.toUpperCase() === g).map(it => String(it.talla).toUpperCase()))).filter(tl => tl && tl !== 'N/A');
          });

          const updateCurve = (goa, idx, field, value) => {
            setPackCurves(prev => {
              const curr = prev[goa] ? [...prev[goa]] : [];
              if (!curr[idx]) curr[idx] = { talla: '', qty: 0 };
              curr[idx] = { ...curr[idx], [field]: field === 'qty' ? (parseInt(value) || 0) : value };
              return { ...prev, [goa]: curr };
            });
          };
          const addRow = (goa) => {
            setPackCurves(prev => ({ ...prev, [goa]: [...(prev[goa] || []), { talla: '', qty: 0 }] }));
          };
          const removeRow = (goa, idx) => {
            setPackCurves(prev => ({ ...prev, [goa]: (prev[goa] || []).filter((_, i) => i !== idx) }));
          };
          const autoFillFromChequera = (goa) => {
            const filas = tallasPorGoa[goa].map(tl => ({ talla: tl, qty: 1 }));
            setPackCurves(prev => ({ ...prev, [goa]: filas }));
          };
          const toggleCluster = (goa, cluster) => {
            setPackMinClusters(prev => {
              const curr = new Set(prev[goa] || []);
              if (curr.has(cluster)) curr.delete(cluster); else curr.add(cluster);
              return { ...prev, [goa]: Array.from(curr) };
            });
          };

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className={`w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border shadow-2xl p-6 ${theme==='dark'?'bg-zinc-900 border-zinc-800':'bg-white border-gray-200'}`}>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className={`text-lg font-black flex items-center ${t.textMain}`}>
                      <Icons.Package size={20} className="mr-2 text-amber-500"/> Curvas de Empaquetado del Proveedor
                    </h3>
                    <p className={`text-xs mt-1 ${t.textMuted}`}>Define cuántas piezas por talla compone 1 pack. La distribución asignará packs enteros respetando esta curva.</p>
                  </div>
                  <button onClick={() => setShowPackModal(false)} className="text-gray-500 hover:text-red-500 transition-colors">
                    <Icons.X size={20} />
                  </button>
                </div>

                {goasEnChequera.length === 0 ? (
                  <div className={`p-8 text-center rounded-xl border ${t.cardInner}`}>
                    <Icons.AlertCircle size={32} className="mx-auto mb-3 text-amber-500"/>
                    <p className={`text-sm ${t.textMain}`}>Primero agrega items a la chequera. Las curvas se configuran por GOA detectado.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {goasEnChequera.map(goa => {
                      const curve = packCurves[goa] || [];
                      const packSize = curve.reduce((s, r) => s + (Number(r.qty) || 0), 0);
                      const allowed = packMinClusters[goa] || [];
                      return (
                        <div key={goa} className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 rounded-lg font-black text-sm ${theme==='dark'?'bg-amber-900/30 text-amber-400':'bg-amber-50 text-amber-700'}`}>{goa}</span>
                              <span className={`text-xs ${t.textMuted}`}>Tallas en chequera: {tallasPorGoa[goa].join(', ') || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${packSize > 0 ? 'text-emerald-500' : t.textMuted}`}>Pack = {packSize} pzs</span>
                              <button onClick={() => autoFillFromChequera(goa)} className={`text-[10px] px-2 py-1 rounded font-bold ${theme==='dark'?'bg-zinc-800 text-gray-300 hover:bg-zinc-700':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                                Auto desde chequera
                              </button>
                            </div>
                          </div>

                          <table className="w-full text-left">
                            <thead>
                              <tr className={`text-[10px] uppercase tracking-wider ${t.textMuted}`}>
                                <th className="p-1.5">Talla</th>
                                <th className="p-1.5 text-center">Pzs por pack</th>
                                <th className="p-1.5 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {curve.map((row, idx) => (
                                <tr key={idx}>
                                  <td className="p-1">
                                    <input list={`tallas-${goa}`} value={row.talla} onChange={e => updateCurve(goa, idx, 'talla', e.target.value.toUpperCase())} className={`w-full p-1.5 rounded border text-xs outline-none ${t.input}`} placeholder="Ej. M"/>
                                    <datalist id={`tallas-${goa}`}>
                                      {tallasPorGoa[goa].map(tl => <option key={tl} value={tl}/>)}
                                    </datalist>
                                  </td>
                                  <td className="p-1">
                                    <input type="number" min="0" value={row.qty} onChange={e => updateCurve(goa, idx, 'qty', e.target.value)} className={`w-full p-1.5 rounded border text-xs text-center font-mono outline-none ${t.input}`}/>
                                  </td>
                                  <td className="p-1 text-center">
                                    <button onClick={() => removeRow(goa, idx)} className="text-red-500 hover:text-red-700"><Icons.Trash2 size={14}/></button>
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan="3" className="pt-2">
                                  <button onClick={() => addRow(goa)} className={`text-xs font-bold px-3 py-1 rounded ${theme==='dark'?'bg-zinc-800 text-gray-300 hover:bg-zinc-700':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                                    + Agregar talla
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          <div className="mt-4 pt-3 border-t border-dashed border-gray-500/30">
                            <p className={`text-[10px] uppercase font-bold tracking-wider mb-2 ${t.textMuted}`}>
                              Clusters que SÍ reciben pack aunque no alcance naturalmente
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {activeClusters.map(c => (
                                <button key={c} onClick={() => toggleCluster(goa, c)} className={`px-2.5 py-1 rounded text-[10px] font-black border transition-all ${allowed.includes(c) ? (theme==='dark'?'bg-emerald-900/40 text-emerald-400 border-emerald-500/50':'bg-emerald-50 text-emerald-700 border-emerald-300') : (theme==='dark'?'bg-zinc-800 text-gray-500 border-zinc-700':'bg-gray-100 text-gray-500 border-gray-200')}`}>
                                  {c}
                                </button>
                              ))}
                            </div>
                            <p className={`text-[10px] mt-2 ${t.textMuted}`}>Tip: marca AA/A para asegurar que tus tiendas top reciban al menos 1 pack aunque la repartición proporcional no se los dé.</p>
                          </div>

                          <div className="mt-3 flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-2">
                              <input type="checkbox" checked={!!packAllowSwap[goa]} onChange={e => setPackAllowSwap(prev => ({...prev, [goa]: e.target.checked}))} className="rounded"/>
                              <span className={`text-[11px] font-bold ${t.textMain}`}>Swap por cobertura</span>
                            </label>
                            {packAllowSwap[goa] && (
                              <div className="flex items-center gap-2">
                                <span className={`text-[11px] ${t.textMuted}`}>Umbral cobertura (meses):</span>
                                <input type="number" min="1" step="0.5" value={packCoverThreshold[goa] ?? 5} onChange={e => setPackCoverThreshold(prev => ({...prev, [goa]: parseFloat(e.target.value) || 5}))} className={`w-16 p-1 rounded border text-xs text-center font-mono outline-none ${t.input}`}/>
                                <span className={`text-[10px] ${t.textMuted}`}>Si OH/venta_mensual &gt; umbral → mover pzs a la talla con más venta histórica.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowPackModal(false)} className={`px-4 py-2 rounded-lg text-sm font-bold ${t.btnGhost}`}>Cancelar</button>
                  <button onClick={() => setShowPackModal(false)} className={`px-5 py-2 rounded-lg text-sm font-black ${t.btnPrimary}`}>Guardar curvas</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* MODAL: MOS objetivo por GOA */}
        {showMosModal && (() => {
          const goasFromChequera = Array.from(new Set(chequera.map(it => it.goa.toUpperCase())));
          const goasInStores = goas.map(g => g.name.toUpperCase());
          const allGoas = Array.from(new Set([...goasFromChequera, ...goasInStores]));

          const updateMos = (goa, field, value) => {
            setMosTarget(prev => ({
              ...prev,
              [goa]: { ...(prev[goa] || { min: 1.5, max: 3 }), [field]: parseFloat(value) || 0 }
            }));
          };

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className={`w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl border shadow-2xl p-6 ${theme==='dark'?'bg-zinc-900 border-zinc-800':'bg-white border-gray-200'}`}>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className={`text-lg font-black flex items-center ${t.textMain}`}>
                      <Icons.Activity size={20} className="mr-2 text-emerald-500"/> MOS Objetivo por GOA
                    </h3>
                    <p className={`text-xs mt-1 ${t.textMuted}`}>Meses de inventario "sano". Si una tienda supera el MAX, no recibe más unidades. Default: 1.5–3 meses.</p>
                  </div>
                  <button onClick={() => setShowMosModal(false)} className="text-gray-500 hover:text-red-500"><Icons.X size={20} /></button>
                </div>

                {allGoas.length === 0 ? (
                  <div className={`p-8 text-center rounded-xl border ${t.cardInner}`}>
                    <p className={`text-sm ${t.textMain}`}>Carga primero la base de tiendas o agrega items a la chequera.</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className={`text-[10px] uppercase tracking-wider ${t.textMuted}`}>
                        <th className="p-2">GOA</th>
                        <th className="p-2 text-center">MOS Mínimo</th>
                        <th className="p-2 text-center">MOS Máximo (cap)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allGoas.map(goa => {
                        const cfg = mosTarget[goa] || { min: 1.5, max: 3 };
                        return (
                          <tr key={goa} className={`border-t ${theme==='dark'?'border-zinc-800':'border-gray-200'}`}>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded text-xs font-black ${theme==='dark'?'bg-emerald-900/30 text-emerald-400':'bg-emerald-50 text-emerald-700'}`}>{goa}</span>
                            </td>
                            <td className="p-2">
                              <input type="number" min="0" step="0.5" value={cfg.min} onChange={e => updateMos(goa, 'min', e.target.value)} className={`w-24 mx-auto block p-1.5 rounded border text-xs text-center font-mono outline-none ${t.input}`}/>
                            </td>
                            <td className="p-2">
                              <input type="number" min="0" step="0.5" value={cfg.max} onChange={e => updateMos(goa, 'max', e.target.value)} className={`w-24 mx-auto block p-1.5 rounded border text-xs text-center font-mono outline-none ${t.input}`}/>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <div className={`mt-4 p-3 rounded-lg text-[11px] ${theme==='dark'?'bg-zinc-800/50 text-gray-400':'bg-gray-50 text-gray-600'}`}>
                  <strong>Cómo se calcula:</strong> MOS = (OH + OO) / venta_mensual. Si la columna VTA3M está en el CSV, se usa <em>venta últimos 3M / 3</em> en lugar de venta anual / 12 (más sensible a tendencia).
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowMosModal(false)} className={`px-4 py-2 rounded-lg text-sm font-bold ${t.btnGhost}`}>Cerrar</button>
                </div>
              </div>
            </div>
          );
        })()}

        {showParamModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 ${theme==='dark'?'bg-zinc-900 border-zinc-800':'bg-white border-gray-200'}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-lg font-black ${t.textMain}`}>Parametrización de Descarga</h3>
                <button onClick={() => setShowParamModal(false)} className="text-gray-500 hover:text-red-500 transition-colors">
                  <Icons.X size={20} />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Etiqueta AP</label>
                  <input type="text" value={paramForm.etiquetaAP} onChange={e=>setParamForm({...paramForm, etiquetaAP: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="Ej. AP_2026"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Stock Min</label>
                  <input type="text" value={paramForm.stockMin} onChange={e=>setParamForm({...paramForm, stockMin: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="0"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Stock Max</label>
                  <input type="text" value={paramForm.stockMax} onChange={e=>setParamForm({...paramForm, stockMax: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="10"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Lead Time</label>
                  <input type="text" value={paramForm.leadTime} onChange={e=>setParamForm({...paramForm, leadTime: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="7"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Min</label>
                  <input type="text" value={paramForm.min} onChange={e=>setParamForm({...paramForm, min: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="1"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Max</label>
                  <input type="text" value={paramForm.max} onChange={e=>setParamForm({...paramForm, max: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="5"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>TH</label>
                  <input type="text" value={paramForm.th} onChange={e=>setParamForm({...paramForm, th: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="0"/>
                </div>
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Tipo de Distribución</label>
                  <input type="text" value={paramForm.tipoDistribucion} onChange={e=>setParamForm({...paramForm, tipoDistribucion: e.target.value})} className={`p-2 rounded-lg border text-sm outline-none ${t.input}`} placeholder="Push / Pull"/>
                </div>
              </div>
              
              <button onClick={downloadParamTXT} className={`w-full py-3 rounded-xl font-black uppercase tracking-wider transition-all flex items-center justify-center shadow-lg hover:scale-105 transform duration-200 ${t.btnPrimary}`}>
                <Icons.Download size={18} className="mr-2" /> Descargar TXT (Sin Títulos)
              </button>
            </div>
          </div>
        )}

        {/* TAB 1 */}
        {activeTab === 1 && (
          stores.length === 0 ? (
            <div className={`p-10 md:p-16 rounded-2xl border text-center flex flex-col items-center justify-center ${theme==='dark'?'bg-zinc-900/50 border-zinc-800':'bg-white border-gray-200 shadow-sm'}`}>
              <div className={`p-5 rounded-full mb-6 ${theme==='dark'?'bg-purple-900/20 text-purple-400':'bg-blue-50 text-blue-600'}`}>
                <Icons.MapIcon size={48} strokeWidth={1.5} />
              </div>
              <h3 className={`text-2xl font-black mb-3 tracking-wide ${t.textMain}`}>Configura tu Matriz de Distribución</h3>
              <p className={`text-sm max-w-lg mb-8 leading-relaxed ${t.textMuted}`}>Para comenzar, necesitamos conocer el historial de ventas de tus sucursales para crear el clustering dinámico.</p>
              
              <div className={`w-full max-w-2xl text-left mb-8 p-4 rounded-xl border flex flex-col transition-all ${theme==='dark'?'bg-blue-900/10 border-blue-900/30':'bg-blue-50 border-blue-200'}`}>
                <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setShowGuide(!showGuide)}>
                  <div className="flex items-center">
                    <Icons.AlertCircle size={18} className={`mr-2 ${theme==='dark'?'text-blue-400':'text-blue-600'}`} />
                    <h3 className={`text-sm font-bold ${theme==='dark'?'text-blue-400':'text-blue-700'}`}>Guía Rápida y Formatos (CSV)</h3>
                  </div>
                  {showGuide ? <Icons.ChevronUp size={18} className={theme==='dark'?'text-blue-400':'text-blue-600'}/> : <Icons.ChevronDown size={18} className={theme==='dark'?'text-blue-400':'text-blue-600'}/>}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl text-left">
                <div className={`p-6 rounded-xl border relative overflow-hidden group ${theme==='dark'?'bg-zinc-900 border-zinc-700':'bg-gray-50 border-gray-200'}`}>
                  <div className={`absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>
                  <h4 className={`text-sm font-black uppercase tracking-widest mb-2 flex items-center ${t.textAccent1}`}><span className="bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded mr-2">Paso 1</span> Base de Tiendas</h4>
                  <p className={`text-xs mb-6 h-12 ${t.textMuted}`}>Archivo .CSV obligatorio con ventas históricas para calcular el Score de Mérito.</p>
                  
                  <label className={`cursor-pointer w-full py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center justify-center hover:scale-105 transform duration-200 ${t.btnPrimary}`}>
                    <Icons.Upload size={18} className="mr-2" /> Subir Base (.CSV)
                    <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                  </label>
                </div>

                <div className={`p-6 rounded-xl border relative overflow-hidden group ${theme==='dark'?'bg-zinc-900 border-zinc-700':'bg-gray-50 border-gray-200'}`}>
                  <div className={`absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>
                  <h4 className={`text-sm font-black uppercase tracking-widest mb-2 flex items-center ${t.textAccent2}`}><span className="bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded mr-2">Paso 2</span> Matriz de Marcas</h4>
                  <p className={`text-xs mb-6 h-12 ${t.textMuted}`}>Opcional. Matriz cruzada para restringir qué tiendas pueden recibir qué marcas.</p>
                  
                  <label className={`cursor-pointer w-full py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center justify-center border border-dashed hover:scale-105 transform duration-200 ${theme==='dark'?'border-zinc-600 text-zinc-300 hover:bg-zinc-800':'border-gray-400 text-gray-600 hover:bg-gray-100'}`}>
                    <Icons.FileText size={18} className="mr-2" /> 
                    {Object.keys(brandMatrix).length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">Matriz Fija Activa ({Object.keys(brandMatrix).length})</span>
                        <button onClick={clearBrandMatrix} className="p-1 hover:bg-red-500/20 hover:text-red-500 rounded-full transition-colors" title="Borrar Matriz Fija">
                          <Icons.X size={16} />
                        </button>
                      </div>
                    ) : 'Subir Matriz (.CSV)'}
                    {Object.keys(brandMatrix).length === 0 && <input type="file" accept=".csv" onChange={handleBrandMatrixUpload} className="hidden" />}
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              
              <div className={`p-4 rounded-xl border flex flex-col transition-all ${theme==='dark'?'bg-blue-900/10 border-blue-900/30':'bg-blue-50 border-blue-200'}`}>
                <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setShowGuide(!showGuide)}>
                  <div className="flex items-center">
                    <Icons.AlertCircle size={18} className={`mr-2 ${theme==='dark'?'text-blue-400':'text-blue-600'}`} />
                    <h3 className={`text-sm font-bold ${theme==='dark'?'text-blue-400':'text-blue-700'}`}>Guía Rápida y Formatos (CSV)</h3>
                  </div>
                  {showGuide ? <Icons.ChevronUp size={18} className={theme==='dark'?'text-blue-400':'text-blue-600'}/> : <Icons.ChevronDown size={18} className={theme==='dark'?'text-blue-400':'text-blue-600'}/>}
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
                  <Icons.Settings size={20} className={`mr-3 ${t.textAccent2}`} />
                  <div className="flex flex-col">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${t.textMuted}`}>Cantidad de Clústeres</label>
                    <select value={numClusters} onChange={(e) => setNumClusters(Number(e.target.value))} className={`mt-1 p-1.5 rounded outline-none font-bold text-sm cursor-pointer transition-colors ${t.inputYellow}`}>
                      {[3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={`opt-${n}`} value={n}>{n} Niveles ({n===6?'AA-E':'A-'+String.fromCharCode(64+n)})</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col flex-1 w-full lg:w-auto">
                  <div className="flex items-center mb-2">
                    <Icons.Settings2 size={16} className={`mr-2 ${t.textAccent1}`} />
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
                  <div className="absolute -right-4 -top-4 opacity-5"><Icons.Store size={100} /></div>
                  <div className={`p-3 rounded-full relative z-10 ${t.iconAccent1}`}><Icons.Store size={24}/></div>
                  <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Total Tiendas</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.total}</p></div>
                </div>
                <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-blue-500 relative overflow-hidden ${t.card}`}>
                  <div className="absolute -right-4 -top-4 opacity-5"><Icons.Package size={100} /></div>
                  <div className={`p-3 rounded-full relative z-10 ${t.iconAccent2}`}><Icons.Package size={24}/></div>
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
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${t.cardInner}`}>
                      <Icons.Filter size={14} className={t.textMuted} />
                      <input
                        type="text"
                        placeholder="Buscar tienda…"
                        value={storeNameFilter}
                        onChange={e => setStoreNameFilter(e.target.value)}
                        className={`bg-transparent outline-none text-xs w-40 ${t.textMain}`}
                      />
                      {storeNameFilter && (
                        <button onClick={() => setStoreNameFilter('')} className="text-gray-400 hover:text-red-500"><Icons.X size={12}/></button>
                      )}
                    </div>
                    <div className={`flex rounded-lg p-1 border ${t.cardInner}`}>
                      <button onClick={()=>toggleSort('score')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='score'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Score <Icons.Filter size={12} className="ml-1"/></button>
                      <button onClick={()=>toggleSort('sales')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='sales'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Vtas <Icons.Filter size={12} className="ml-1"/></button>
                      <button onClick={()=>toggleSort('totalOH')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='totalOH'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>OH <Icons.Filter size={12} className="ml-1"/></button>
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
                      <Icons.Download size={14} className="mr-2" /> Bajar Matriz
                    </button>

                    <label className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold flex items-center transition border border-dashed ${theme==='dark'?'border-zinc-600 text-zinc-300 hover:bg-zinc-800':'border-gray-400 text-gray-600 hover:bg-gray-100'}`} title="Opcional: Matriz Cruzada">
                      <Icons.FileText size={14} className="mr-2" /> 
                      {Object.keys(brandMatrix).length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">Matriz Fija</span>
                          <button onClick={clearBrandMatrix} className="hover:text-red-500" title="Borrar Matriz Fija"><Icons.X size={14}/></button>
                        </div>
                      ) : 'Subir Marcas'}
                      {Object.keys(brandMatrix).length === 0 && <input type="file" accept=".csv" onChange={handleBrandMatrixUpload} className="hidden" />}
                    </label>

                    <label className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold flex items-center transition ${t.btnGhost}`}>
                      <Icons.Upload size={14} className="mr-2" /> Recargar Base
                      <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {displayedStores.map(store => {
                    const isFiltered = selectedGoaFilter !== 'ALL';
                    const activeCluster = isFiltered ? store.clusters[selectedGoaFilter] : store.globalCluster;
                    const activeScore = isFiltered ? store.goaScores[selectedGoaFilter] : store.score;
                    const activeSales = isFiltered ? (store.goaSales[selectedGoaFilter] || 0) : store.sales;
                    const activeOH = isFiltered ? (store.goaOH[selectedGoaFilter] || 0) : store.totalOH;
                    const activeMargin = isFiltered ? (store.goaMargin[selectedGoaFilter] || 0) : store.margin;

                    return (
                      <div key={`store-card-${store.id}`} className={`p-5 rounded-xl shadow-sm transition-colors group border hover:border-purple-500/50 flex flex-col ${t.cardInner}`}>
                        
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className={`text-sm font-bold truncate ${t.textMain}`} title={store.name}>{store.name}</p>
                            <p className={`text-[10px] ${t.textMuted}`}>{store.zona}</p>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className={`text-[10px] px-2 py-0.5 mb-1 rounded border font-mono ${t.badgeOther}`}>{store.centerCode}</span>
                            {isFiltered ? (
                              <div className="relative inline-block group">
                                <select
                                  value={activeCluster || ''}
                                  onChange={(e) => handleManualClusterChange(store.centerCode, selectedGoaFilter, e.target.value)}
                                  className={`text-[10px] pl-2 pr-5 py-0.5 rounded border font-black outline-none cursor-pointer appearance-none text-center bg-transparent transition-colors ${activeCluster === activeClusters[0] ? t.badgeAA : activeCluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}
                                  style={{ textAlignLast: 'center' }}
                                >
                                  {activeClusters.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 opacity-50 group-hover:opacity-100">
                                  <Icons.ChevronDown size={12} />
                                </div>
                              </div>
                            ) : (
                              <span className={`text-[10px] px-2 py-0.5 rounded border font-black ${activeCluster === activeClusters[0] ? t.badgeAA : activeCluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>
                                {activeCluster || '-'}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className={`rounded-lg p-3 mb-4 mt-auto grid grid-cols-3 gap-2 text-center divide-x border ${theme==='dark'?'divide-zinc-800 bg-zinc-900 border-zinc-800':'divide-gray-200 bg-white border-gray-100'}`}>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Ventas</p><p className={`text-[10px] font-bold ${t.textMain}`}>{activeSales?.toLocaleString()} u</p></div>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>OH</p><p className={`text-[10px] font-bold ${t.textMain}`}>{activeOH?.toLocaleString()}</p></div>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Mg</p><p className={`text-[10px] font-bold ${t.textMain}`}>{activeMargin?.toLocaleString()}%</p></div>
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
                                <div className="relative inline-block group">
                                  <select
                                    value={cluster}
                                    onChange={(e) => handleManualClusterChange(store.centerCode, goa, e.target.value)}
                                    className={`font-black pl-2 pr-5 py-0.5 rounded border outline-none cursor-pointer appearance-none bg-transparent text-center transition-colors ${cluster === activeClusters[0] ? t.badgeAA : cluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}
                                    style={{ textAlignLast: 'center' }}
                                  >
                                    {activeClusters.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 opacity-50 group-hover:opacity-100">
                                    <Icons.ChevronDown size={12} />
                                  </div>
                                </div>
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
                    <Icons.FileText className={`mr-2 ${t.textAccent1}`} size={24} />
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
                          <Icons.Plus size={20} />
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
                      <Icons.Upload size={16} className="mr-2" /> Subir CSV
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
                      <Icons.Plus size={18} className="mr-2" /> Añadir Pegados
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
                                  <button onClick={saveEditItem} className="text-emerald-500 hover:text-emerald-400 p-1"><Icons.Check size={16}/></button>
                                  <button onClick={()=>setEditingItem(null)} className="text-gray-500 hover:text-red-400 p-1"><Icons.X size={16}/></button>
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
                                  <button onClick={() => startEditItem(item)} className="text-gray-500 hover:text-blue-500 transition-colors p-1"><Icons.Edit3 size={16} /></button>
                                  <button onClick={() => removeChequeraItem(item.id)} className="text-gray-500 hover:text-red-500 transition-colors p-1"><Icons.Trash2 size={16} /></button>
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
                    <button onClick={() => setDistMode('PUSH')} className={`flex items-center px-3 py-1.5 rounded text-xs font-bold transition-all ${distMode === 'PUSH' ? (theme==='dark'?'bg-zinc-800 text-white shadow':'bg-white text-black shadow') : t.textMuted}`}>
                      <Icons.Box size={16} className={`mr-1 ${distMode === 'PUSH' ? 'text-red-400' : ''}`} /> Llenado Push
                    </button>
                    <button onClick={() => setDistMode('OH')} className={`flex items-center px-3 py-1.5 rounded text-xs font-bold transition-all ${distMode === 'OH' ? (theme==='dark'?'bg-zinc-800 text-white shadow':'bg-white text-black shadow') : t.textMuted}`}>
                       <Icons.CheckSquare size={16} className={`mr-1 ${distMode === 'OH' ? 'text-emerald-400' : ''}`} /> Dispersión (GOA)
                    </button>
                    <button onClick={() => setDistMode('SKU')} className={`flex items-center px-3 py-1.5 rounded text-xs font-bold transition-all ${distMode === 'SKU' ? (theme==='dark'?'bg-zinc-800 text-white shadow':'bg-white text-black shadow') : t.textMuted}`}>
                       <Icons.Layers size={16} className={`mr-1 ${distMode === 'SKU' ? 'text-violet-400' : ''}`} /> Size-Level
                    </button>
                    <button onClick={() => setDistMode('PACK')} className={`flex items-center px-3 py-1.5 rounded text-xs font-bold transition-all ${distMode === 'PACK' ? (theme==='dark'?'bg-zinc-800 text-white shadow':'bg-white text-black shadow') : t.textMuted}`}>
                       <Icons.Package size={16} className={`mr-1 ${distMode === 'PACK' ? 'text-amber-400' : ''}`} /> Size Scaling (Pack)
                    </button>
                  </div>

                  {distMode === 'PACK' && (
                    <button onClick={() => setShowPackModal(true)} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center transition-all ${theme==='dark'?'bg-amber-900/30 text-amber-400 border border-amber-500/50 hover:bg-amber-900/50':'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'}`}>
                      <Icons.Settings size={14} className="mr-1.5"/> Configurar Packs
                    </button>
                  )}

                  {(distMode === 'OH' || distMode === 'SKU') && (
                    <button onClick={() => setShowMosModal(true)} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center transition-all ${theme==='dark'?'bg-emerald-900/30 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-900/50':'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                      <Icons.Settings size={14} className="mr-1.5"/> Configurar MOS Objetivo
                    </button>
                  )}

                  <button 
                    onClick={processDistribution}
                    className={`px-8 py-4 rounded-xl font-black uppercase tracking-wider transition-all flex items-center justify-center shadow-lg hover:scale-105 transform duration-200 ${theme==='dark'?'bg-purple-600 text-white hover:bg-purple-500':'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    <Icons.Zap size={20} className="mr-2" /> Calcular Distribución
                  </button>
                </div>
              </div>
            )}

            {distributionResult.length > 0 && (
              <div className="space-y-6 animate-fade-in-up">
                {overstockAlerts.length > 0 && (
                  <div className={`p-5 rounded-xl border-2 border-red-500/60 ${theme==='dark'?'bg-red-950/30':'bg-red-50'}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 rounded-full bg-red-600 text-white"><Icons.AlertCircle size={20}/></div>
                      <div className="flex-1">
                        <h3 className="text-base font-black text-red-600">⚠️ Alerta a Compras: Combos sobre-inventariados</h3>
                        <p className={`text-xs ${theme==='dark'?'text-red-300':'text-red-700'}`}>Más del 20% de las tiendas elegibles superan el MOS objetivo en estos GOA/Marca. Considerar pausar o reducir compras.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {overstockAlerts.map((a, i) => (
                        <details key={i} className={`p-3 rounded-lg border ${theme==='dark'?'bg-zinc-900/60 border-red-900/40':'bg-white border-red-200'}`}>
                          <summary className="cursor-pointer flex items-center justify-between text-xs font-bold">
                            <span className={`${theme==='dark'?'text-red-300':'text-red-700'}`}>
                              <span className="px-2 py-0.5 rounded bg-red-600 text-white mr-2">{a.goa}</span>
                              <span className="px-2 py-0.5 rounded bg-zinc-700 text-white">{a.marca}</span>
                              <span className="ml-3 font-mono text-red-500">{a.pct}% de tiendas saturadas</span>
                            </span>
                            <span className={`text-[10px] ${t.textMuted}`}>{a.overStores.length} tiendas</span>
                          </summary>
                          <div className="mt-2 max-h-40 overflow-auto">
                            <table className="w-full text-[10px]">
                              <thead className={`${t.textMuted}`}>
                                <tr><th className="text-left p-1">Tienda</th><th className="text-right p-1">MOS actual</th></tr>
                              </thead>
                              <tbody>
                                {a.overStores.map((os, j) => (
                                  <tr key={j} className={`border-t ${theme==='dark'?'border-zinc-800':'border-gray-200'}`}>
                                    <td className={`p-1 ${t.textMain}`}>{os.centro} — {os.name}</td>
                                    <td className="p-1 text-right font-mono text-red-500">{os.mos}m</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`p-6 rounded-xl border border-green-500/50 bg-green-500/5 ${theme==='light' ? 'bg-green-50 border-green-200' : ''}`}>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center">
                      <div className="p-3 rounded-full bg-green-500 text-white mr-4"><Icons.CheckSquare size={24} /></div>
                      <div>
                        <h3 className={`text-xl font-black text-green-600 ${theme==='dark'?'text-green-400':''}`}>Distribución Completa</h3>
                        <p className={`text-sm ${t.textMuted}`}>Se generaron <strong>{distributionResult.length}</strong> combinaciones mediante {distMode === 'SKU' ? 'la dispersión ultra precisa (Size-Level)' : distMode === 'OH' ? 'el cálculo de perfil (Nivel GOA)' : distMode === 'PACK' ? 'Size Scaling con packs del proveedor' : 'Push Proporcional'}.</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={() => setShowParamModal(true)} className="px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-md bg-violet-600 text-white hover:bg-violet-500 hover:scale-105">
                        <Icons.Settings size={16} className="mr-2" /> Parametrización
                      </button>
                      <button onClick={downloadSAP} className="px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-md bg-blue-600 text-white hover:bg-blue-500 hover:scale-105">
                        <Icons.FileSpreadsheet size={16} className="mr-2" /> Descargar SAP
                      </button>
                      <button onClick={downloadO9} className="px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all flex items-center justify-center shadow-md bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105">
                        <Icons.Download size={16} className="mr-2" /> Descargar O9
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex items-center justify-between ${t.cardInner}`}>
                  <h3 className={`text-lg font-bold flex items-center ${t.textMain}`}>
                    <Icons.BarChart3 className={`mr-2 ${t.textAccent1}`} size={20} />
                    Dashboard de Resultados
                  </h3>
                  <select 
                    value={dashGoaFilter} 
                    onChange={(e) => setDashGoaFilter(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer max-w-[200px] truncate ${t.input}`}
                  >
                    <option value="ALL">Visualizando Todos los GOAs</option>
                    {Array.from(new Set(distributionResult.map(r => r.goa))).map(g => (
                        <option key={`dash-filt-${g}`} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {topStoresData.length > 0 && (
                    <div className={`p-5 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold flex items-center mb-4 ${t.textMain}`}><Icons.Store size={16} className="mr-2"/> Top 10 Tiendas Receptoras</h4>
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

                  {zonesData.length > 0 && (
                    <div className={`p-5 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold flex items-center mb-4 ${t.textMain}`}><Icons.MapIcon size={16} className="mr-2"/> Piezas por Zona</h4>
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

                  {modelsStoreData.stores.length > 0 && (
                    <div className={`p-5 rounded-xl border col-span-1 md:col-span-2 ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold flex items-center mb-4 ${t.textMain}`}><Icons.Package size={16} className="mr-2"/> Envío por Modelo (Top 15 Tiendas)</h4>
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

                  {scatterData.pre.length > 0 && (
                    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <ScatterPlot data={scatterData.pre} title="Antes: Físico (OH)" subtitle="OH Original vs Ventas" colorClass="text-blue-400" maxVentas={scatterData.maxVentas} maxInv={scatterData.maxInvPre} t={t} />
                      <ScatterPlot data={scatterData.post} title="Después: Distribuido" subtitle="Total (OH + Envío) vs Ventas" colorClass="text-emerald-400" maxVentas={scatterData.maxVentas} maxInv={scatterData.maxInvPost} t={t} />
                    </div>
                  )}
                </div>

                {buyInsights.hasTalla ? (
                  buyInsights.suggestions.length > 0 ? (
                    <div className={`p-6 rounded-xl border mt-6 ${t.cardInner}`}>
                      <h3 className={`text-lg font-bold flex items-center mb-4 ${t.textMain}`}>
                        <Icons.TrendingUp className={`mr-2 ${t.textAccent1}`} size={20} />
                        Insights: Sugerencias de Próxima Compra (Desabasto Detectado)
                      </h3>
                      <p className={`text-xs mb-4 ${t.textMuted}`}>Esta tabla detecta las tallas que tienen una demanda histórica mayor al porcentaje que acabas de enviarles en este resurtido.</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className={`text-[10px] uppercase font-black tracking-widest ${theme==='dark'?'text-gray-400 border-b border-zinc-800':'text-gray-500 border-b border-gray-200'}`}>
                              <th className="p-2">Marca</th>
                              <th className="p-2">Modelo / SKU</th>
                              <th className="p-2">Talla</th>
                              <th className="p-2">Mix Histórico (Demanda)</th>
                              <th className="p-2">Mix Distribuido (Envío)</th>
                              <th className="p-2">Acción Recomendada</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${theme==='dark'?'divide-zinc-800/50':'divide-gray-200'}`}>
                            {buyInsights.suggestions.map((ins, i) => (
                               <tr key={`ins-${i}`}>
                                  <td className={`p-2 text-xs font-bold ${t.textMuted}`}>{ins.marca}</td>
                                  <td className={`p-2 text-xs font-bold ${t.textMain}`}>SKU <span className="text-[10px] font-mono text-zinc-500 ml-1">({ins.talla})</span></td>
                                  <td className={`p-2 text-xs font-black ${t.textAccent2}`}>{ins.talla}</td>
                                  <td className={`p-2 text-xs font-mono ${t.textMain}`}>{ins.mixVendido}%</td>
                                  <td className={`p-2 text-xs font-mono text-red-400`}>{ins.mixComprado}%</td>
                                  <td className={`p-2 text-xs font-bold text-emerald-400 flex items-center`}><Icons.TrendingUp size={12} className="mr-1"/> Comprar +{(ins.diff * 100).toFixed(1)}%</td>
                               </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null 
                ) : (
                  <div className={`p-6 rounded-xl border mt-6 flex flex-col items-center justify-center text-center ${t.cardInner}`}>
                     <Icons.TrendingUp size={32} className={`${theme==='dark'?'text-zinc-600':'text-gray-300'} mb-3`} />
                     <h3 className={`text-sm font-bold ${t.textMain}`}>Insights de Compra Desactivados</h3>
                     <p className={`text-xs mt-1 ${t.textMuted} max-w-md`}>Para habilitar las sugerencias de compra inteligentes, asegúrate de que tu archivo inicial (Base de Tiendas) incluya las columnas <strong>SKU</strong> y <strong>TALLA</strong>.</p>
                  </div>
                )}

                {/* MATRIZ DE SKU */}
                {matrixData && matrixData.storesList.length > 0 && (
                  <div className={`p-5 rounded-xl border col-span-1 md:col-span-2 ${t.cardInner} overflow-hidden flex flex-col mt-6`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className={`text-sm font-bold flex items-center ${t.textMain}`}>
                          <Icons.Table size={16} className="mr-2"/> Resumen de Envío por Tienda y Talla (Matriz SKU)
                          <button onClick={downloadSkuMatrixCSV} className="ml-4 px-2 py-1 bg-green-600/20 text-green-500 hover:bg-green-600 hover:text-white rounded flex items-center text-[10px] transition-colors" title="Descargar Matriz Excel">
                            <Icons.Download size={12} className="mr-1" /> Excel
                          </button>
                        </h4>
                        <p className={`text-xs mt-1 ${t.textMuted}`}>Revisa la dispersión exacta de piezas por cada talla/SKU hacia cada sucursal.</p>
                      </div>
                    </div>
                    <div className="overflow-auto max-h-[60vh] custom-scrollbar flex-1 relative">
                      <table className="w-full text-left border-collapse min-w-max">
                        <thead>
                          <tr className={`text-[9px] uppercase font-black tracking-widest ${theme==='dark'?'text-gray-400':'text-gray-500'}`}>
                            <th className={`p-2 sticky left-0 top-0 z-30 ${theme==='dark'?'bg-zinc-950':'bg-gray-50'} shadow-[2px_2px_5px_-2px_rgba(0,0,0,0.3)] border-b ${theme==='dark'?'border-zinc-800':'border-gray-200'}`}>Tienda</th>
                            {matrixData.skuCols.map(c => (
                              <th key={c.sku} className={`p-2 text-center sticky top-0 z-10 ${theme==='dark'?'bg-zinc-950':'bg-gray-50'} border-b ${theme==='dark'?'border-zinc-800':'border-gray-200'}`} title={`GOA: ${c.goa} | Modelo: ${c.modelo} | SKU: ${c.sku}`}>
                                <div className="flex flex-col items-center">
                                  <span className="text-[9px] font-black text-gray-500 mb-0.5">{c.goa}</span>
                                  <span className="text-violet-500 text-xs">{c.talla !== 'N/A' ? `T-${c.talla}` : 'SKU'}</span>
                                  <span className="text-[8px] font-normal opacity-70 truncate max-w-[70px]">{c.sku}</span>
                                </div>
                              </th>
                            ))}
                            <th className={`p-2 text-right text-emerald-500 sticky right-0 top-0 z-30 ${theme==='dark'?'bg-zinc-950':'bg-gray-50'} shadow-[-2px_2px_5px_-2px_rgba(0,0,0,0.3)] border-b ${theme==='dark'?'border-zinc-800':'border-gray-200'}`}>Total</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${theme==='dark'?'divide-zinc-800/50':'divide-gray-200'}`}>
                          {matrixData.storesList.map(s => (
                            <tr key={s.centro} className={`hover:${theme==='dark'?'bg-zinc-800/50':'bg-white'}`}>
                              <td className={`p-2 text-xs font-bold sticky left-0 z-10 ${theme==='dark'?'bg-zinc-950':'bg-gray-50'} shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] truncate max-w-[200px]`} title={s.nombre}>
                                <span className="text-[9px] text-zinc-500 mr-2 font-mono">{s.centro}</span>
                                <span className={t.textMain}>{s.nombre}</span>
                              </td>
                              {matrixData.skuCols.map(c => {
                                const qty = matrixData.mData[s.centro][c.sku];
                                return (
                                  <td key={c.sku} className={`p-2 text-xs text-center font-mono ${qty > 0 ? t.textMain + ' font-bold bg-violet-500/5' : t.textMuted + ' opacity-30'}`}>
                                    {qty > 0 ? qty : '-'}
                                  </td>
                                );
                              })}
                              <td className={`p-2 text-xs text-right font-black text-emerald-500 sticky right-0 z-10 ${theme==='dark'?'bg-zinc-950':'bg-gray-50'} shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.3)]`}>{s.total}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className={`font-black text-xs`}>
                            <td className={`p-2 sticky left-0 bottom-0 z-30 ${theme==='dark'?'bg-zinc-900 border-t border-zinc-700':'bg-gray-100 border-t border-gray-300'} shadow-[2px_-2px_5px_-2px_rgba(0,0,0,0.3)] ${t.textMain}`}>TOTAL GENERAL</td>
                            {matrixData.skuCols.map(c => (
                              <td key={`tot-${c.sku}`} className={`p-2 text-center font-mono text-violet-500 sticky bottom-0 z-20 ${theme==='dark'?'bg-zinc-900 border-t border-zinc-700':'bg-gray-100 border-t border-gray-300'}`}>{matrixData.totals[c.sku]}</td>
                            ))}
                            <td className={`p-2 text-right font-mono text-emerald-500 sticky right-0 bottom-0 z-30 ${theme==='dark'?'bg-zinc-900 border-t border-zinc-700':'bg-gray-100 border-t border-gray-300'} shadow-[-2px_-2px_5px_-2px_rgba(0,0,0,0.3)]`}>{matrixData.totals.global}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </main>
      <style dangerouslySetInnerHTML={{__html: `
        * { scrollbar-width: thin; scrollbar-color: rgba(156, 163, 175, 0.3) transparent; }
        *::-webkit-scrollbar { width: 6px; height: 6px; }
        *::-webkit-scrollbar-track { background: transparent !important; }
        *::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.3); border-radius: 10px; }
        *::-webkit-scrollbar-thumb:hover { background-color: rgba(156, 163, 175, 0.8); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.2); }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.5); }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}} />
    </div>
  );
}

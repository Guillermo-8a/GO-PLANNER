import React, { useState, useMemo, useEffect } from 'react';
import { Settings, Store, Package, Upload, ArrowUpDown, Sliders, Layers, MoreVertical, Sun, Moon, Info, Map, Database } from 'lucide-react';

// =====================================================================
// IMPORT REAL (Descomenta esta línea en tu entorno local)
import { useDispatch, useGlobal, globalActions } from '../context/GlobalContext';

export default function App() {
  const [theme, setTheme] = useState('dark'); 
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  // --- INTEGRACIÓN GLOBAL CONTEXT (CÓDIGO DE CLAUDE) ---
  const gDispatch = useDispatch();
  const gState    = useGlobal();
  // Saber si hay datos de Forecast disponibles (opcional)
  const forecastDisponible = !!gState?.forecastData;
  
  // --- 1. ESTADO DE BASE Y CLÚSTERES (Limpio, sin datos falsos) ---
  const [numClusters, setNumClusters] = useState(6);
  const [clusterStrategy, setClusterStrategy] = useState('piramide'); // 'piramide' | 'lineal' | 'valor'
  
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

  // --- 2. PRESUPUESTOS ---
  // Se mantienen para la publicación del OTB global
  
  // --- 3. CALCULADORAS ---
  const [sizeCurves, setSizeCurves] = useState([]);
  const [calcRules, setCalcRules] = useState([]);

  // --- 4. COMPRAS Y ESTADO TEMPORAL ---
  const [purchases, setPurchases] = useState([]);
  
  const [newCurve, setNewCurve] = useState({ name: '', sizes: '', weights: '' });
  const [editingCurveId, setEditingCurveId] = useState(null);
  
  const [newRule, setNewRule] = useState({ name: '' });
  const [editingRuleId, setEditingRuleId] = useState(null);
  
  const [buyData, setBuyData] = useState({ goaId: '', modelo: '', pvp: '', curveId: '', ruleId: '' });

  // --- 5. REPORTES Y PLANEACIÓN ESTRATÉGICA ---
  const [reportView, setReportView] = useState('sugerido'); 
  const [suggestedPlans, setSuggestedPlans] = useState([]); 

  // --- PUBLICAR OTB AL GLOBAL CONTEXT (CÓDIGO DE CLAUDE) ---
  useEffect(() => {
    if (goas.length > 0) {
      const totalBudget = goas.reduce((s, g) => s + (g.budget || 0), 0);
      const totalSpent  = purchases.reduce((s, p) => s + (p.totalRetailValue || 0), 0);
      
      if (globalActions && globalActions.publishOTB) {
        globalActions.publishOTB(gDispatch, {
          goas,
          purchases,
          suggestedPlans,
          budget: totalBudget,
          spent:  totalSpent,
        });
      }
    }
  }, [goas, purchases, suggestedPlans, gDispatch]);


  // --- MOTOR DE TEMAS (Dark/Light) ---
  const themes = {
    dark: {
      appBg: "bg-black text-gray-100", header: "bg-zinc-950 border-purple-900/50 shadow-md",
      logoIcon: "bg-purple-600 text-white", logoAccent: "text-yellow-400",
      btnMenu: "bg-zinc-900 text-gray-300 hover:text-white hover:bg-zinc-800 border border-zinc-800",
      menuBg: "bg-zinc-900 border border-zinc-700 shadow-xl", menuItem: "hover:bg-zinc-800 text-gray-200 border-zinc-800",
      card: "bg-zinc-900 border-zinc-800 shadow-lg", cardInner: "bg-zinc-950 border-zinc-800",
      textMain: "text-white", textMuted: "text-gray-400", textAccent1: "text-purple-400", textAccent2: "text-yellow-400",
      iconAccent1: "text-purple-400 bg-purple-900/30", iconAccent2: "text-yellow-400 bg-yellow-500/20",
      border: "border-zinc-800", input: "bg-zinc-950 border-zinc-700 text-white focus:ring-purple-500",
      inputYellow: "bg-zinc-950 border-zinc-700 text-yellow-400 font-bold focus:ring-yellow-500",
      btnPrimary: "bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]",
      btnGhost: "bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700",
      badgeAA: "text-purple-400 bg-purple-900/30 border-purple-500/50", badgeA: "text-yellow-400 bg-yellow-900/30 border-yellow-500/50", badgeOther: "text-gray-300 bg-zinc-800 border-zinc-600",
      tabActive: "border-yellow-400 text-yellow-400", tabInactive: "border-transparent text-gray-500 hover:text-gray-300",
    },
    light: {
      appBg: "bg-gray-50 text-gray-800", header: "bg-white border-gray-200 shadow-sm",
      logoIcon: "bg-blue-600 text-white", logoAccent: "text-blue-600",
      btnMenu: "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-300",
      menuBg: "bg-white border border-gray-200 shadow-xl", menuItem: "hover:bg-gray-50 text-gray-700 border-gray-100",
      card: "bg-white border-gray-200 shadow-sm", cardInner: "bg-gray-50 border-gray-200",
      textMain: "text-gray-900", textMuted: "text-gray-500", textAccent1: "text-blue-600", textAccent2: "text-indigo-600",
      iconAccent1: "text-blue-600 bg-blue-50", iconAccent2: "text-indigo-600 bg-indigo-50",
      border: "border-gray-200", input: "bg-white border-gray-300 text-gray-900 focus:ring-blue-500",
      inputYellow: "bg-white border-gray-300 text-indigo-700 font-bold focus:ring-indigo-500",
      btnPrimary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md",
      btnGhost: "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200",
      badgeAA: "text-indigo-700 bg-indigo-100 border-indigo-200", badgeA: "text-blue-700 bg-blue-100 border-blue-200", badgeOther: "text-gray-600 bg-gray-100 border-gray-200",
      tabActive: "border-blue-600 text-blue-600", tabInactive: "border-transparent text-gray-500 hover:text-gray-700",
    }
  };
  const t = themes[theme];

  // --- LÓGICA DE CLUSTERIZACIÓN DINÁMICA ---
  const recalculateClusters = (rawData, weights, currentClusters, strategy) => {
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
          id: row.centro, centerCode: row.centro, name: row.name, 
          sales: row.sales, margin: row.margin, rotation: row.rotation, 
          score: 0, clusters: {} 
        });
      } else {
        const existing = storeMap.get(row.centro);
        existing.sales = (existing.sales + row.sales) / 2; 
        existing.margin = (existing.margin + row.margin) / 2;
        existing.rotation = (existing.rotation + row.rotation) / 2;
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

      // Ordenamiento de tiendas
      storesInGoa.sort((a, b) => b.score - a.score);
      const total = storesInGoa.length;
      const numClust = currentClusters.length;
      const maxScore = storesInGoa.length > 0 ? storesInGoa[0].score : 1;
      
      storesInGoa.forEach((item, index) => {
        const percentile = index / total; 
        let clusterIndex = numClust - 1; 
        
        if (strategy === 'piramide') {
          if (numClust === 6) {
            // Distribución Pirámide Retail: 5% AA | 15% A | 25% B | 30% C | 15% D | 10% E
            if (percentile <= 0.05) clusterIndex = 0;
            else if (percentile <= 0.20) clusterIndex = 1;
            else if (percentile <= 0.45) clusterIndex = 2;
            else if (percentile <= 0.75) clusterIndex = 3;
            else if (percentile <= 0.90) clusterIndex = 4;
            else clusterIndex = 5;
          } else {
            let assigned = false;
            for(let i=0; i<numClust; i++) {
              let threshold = Math.pow((i+1)/numClust, 2);
              if (percentile <= threshold) {
                clusterIndex = i; assigned = true; break;
              }
            }
            if(!assigned) clusterIndex = numClust - 1;
          }
        } else if (strategy === 'lineal') {
          clusterIndex = Math.min(Math.floor(percentile * numClust), numClust - 1);
        } else if (strategy === 'valor') {
          const scoreRatio = item.score / maxScore; 
          const invertedPercentile = 1.0 - scoreRatio; 
          clusterIndex = Math.min(Math.floor(invertedPercentile * numClust), numClust - 1);
        }
        
        const store = storeMap.get(item.centro);
        store.clusters[goaName] = currentClusters[clusterIndex];
        store.score = (store.score + item.score) / 2;
      });

      setGoas(prev => {
        if (!prev.find(g => g.name.toUpperCase() === goaName)) {
          const formatted = goaName.charAt(0).toUpperCase() + goaName.slice(1).toLowerCase();
          return [...prev, { id: Date.now() + Math.random(), name: formatted, budget: 0, historyPzs: 0 }];
        }
        return prev;
      });
    });
    setStores(Array.from(storeMap.values()));
  };

  useEffect(() => {
    if (rawStoreData.length > 0) recalculateClusters(rawStoreData, scoreWeights, activeClusters, clusterStrategy);
  }, [scoreWeights, activeClusters, clusterStrategy]);

  // --- CARGAR HISTÓRICOS DESDE FORECASTING (CÓDIGO DE CLAUDE) ---
  const handleLoadForecast = () => {
    if (forecastDisponible && gState.forecastData.brands) {
      const newGoas = gState.forecastData.brands.map((b, i) => ({
        id: Date.now() + i,
        name: b.name || b.brand || `GOA ${i+1}`,
        budget: b.budget || 0,
        historyPzs: b.historyPzs || 0,
        months: b.months || [16.6, 16.6, 16.6, 16.6, 16.6, 17]
      }));
      setGoas(newGoas);
      alert("Datos históricos y presupuestos cargados desde GO Forecasting.");
    }
  };

  // --- CARGA DE CSV TIENDAS ---
  const handleStoreCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.split(',').map(cell => cell?.trim().replace(/^"|"$/g, '') || ''));
      if (rows.length < 2) { if(fileInputRef.current) fileInputRef.current.value = ''; return; }

      const headers = rows[0].map(h => h.toUpperCase());
      const idxCentro = headers.findIndex(h => h === 'CENTRO' || h === 'ID');
      const idxNombre = headers.findIndex(h => h === 'NOMBRE' || h === 'TIENDA' || h === 'DESC CENTRO');
      const idxGoa = headers.findIndex(h => h === 'GOA' || h === 'FAMILIA');
      const idxVentas = headers.findIndex(h => h === 'VENTAS' || h === 'VTA' || h.includes('VTAS. $'));
      const idxMargen = headers.findIndex(h => h === 'MARGEN' || h === 'MG' || h.includes('%GM'));
      const idxRotacion = headers.findIndex(h => h === 'ROTACION' || h === 'ROT' || h.includes('SELL'));

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
        
        let ventas = parseFloat(rawVentas) || 0; let margen = parseFloat(rawMargen) || 0; let rotacion = parseFloat(rawRotacion) || 0;
        if (margen > 1 && margen <= 100) margen = margen / 100; 

        extractedRawData.push({
          centro: rows[i][idxCentro], name: idxNombre !== -1 ? rows[i][idxNombre] : rows[i][idxCentro],
          goa: rows[i][idxGoa].toUpperCase(), sales: ventas, margin: margen, rotation: rotacion
        });
      }
      
      // Limpiar datos anteriores para empezar fresco
      setGoas([]);
      setStores([]);
      
      setRawStoreData(extractedRawData);
      recalculateClusters(extractedRawData, scoreWeights, activeClusters, clusterStrategy);
      if(fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleUpdateStoreCluster = (storeId, goaName, newCluster) => {
    setStores(stores.map(s => s.id === storeId ? { ...s, clusters: { ...s.clusters, [goaName]: newCluster } } : s));
  };

  // --- CÁLCULOS VISUALES ---
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

  // --- COMPONENTES UI AUXILIARES ---
  const EmptyState = ({ icon: Icon, title, desc, rules, action }) => (
    <div className={`p-12 rounded-2xl border text-center flex flex-col items-center justify-center ${theme==='dark'?'bg-zinc-900/50 border-zinc-800':'bg-white border-gray-200 shadow-sm'}`}>
      <div className={`p-5 rounded-full mb-6 ${theme==='dark'?'bg-purple-900/20 text-purple-400':'bg-blue-50 text-blue-600'}`}>
        <Icon size={48} strokeWidth={1.5} />
      </div>
      <h3 className={`text-2xl font-black mb-3 tracking-wide ${t.textMain}`}>{title}</h3>
      <p className={`text-sm max-w-lg mb-6 leading-relaxed ${t.textMuted}`}>{desc}</p>
      
      {rules && (
        <div className={`text-left max-w-lg w-full mb-8 p-4 rounded-xl border ${t.cardInner}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${t.textAccent2}`}>Formato Requerido (CSV)</p>
          <ul className={`space-y-2 text-xs font-mono ${t.textMuted}`}>
            {rules.map((r, i) => <li key={i} className="flex items-start"><span className={`mr-2 ${t.textAccent1}`}>•</span> {r}</li>)}
          </ul>
        </div>
      )}
      
      <div className="flex flex-wrap justify-center gap-4">
        {action}
        
        {/* BOTÓN OPCIONAL DE FORECASTING */}
        {forecastDisponible && (
          <button onClick={handleLoadForecast} className={`px-6 py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center hover:scale-105 transform duration-200 bg-indigo-600 text-white hover:bg-indigo-500`}>
            <Database size={18} className="mr-2" /> Extraer de Forecast
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen font-sans pb-12 transition-colors duration-300 ${t.appBg}`}>
      
      {/* HEADER Y MINI MENU */}
      <header className={`border-b sticky top-0 z-20 transition-colors duration-300 ${t.header}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${t.logoIcon}`}><Map size={24} /></div>
              <h1 className={`text-xl font-black tracking-wide ${t.textMain}`}>GO PLANNER <span className={`font-medium ${t.logoAccent}`}>| Distribución</span></h1>
            </div>
            
            <div className="relative">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`p-2 rounded-lg transition-all focus:outline-none ${t.btnMenu}`} title="Ajustes">
                <Settings size={20} />
              </button>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                  <div className={`absolute right-0 mt-2 w-56 rounded-xl z-50 overflow-hidden transition-all shadow-2xl border ${t.menuBg}`}>
                    <div className={`px-4 py-2 text-[10px] font-black tracking-widest uppercase border-b ${theme==='dark'?'bg-zinc-950 border-zinc-800 text-gray-500':'bg-gray-50 border-gray-200 text-gray-400'}`}>Apariencia</div>
                    <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 text-sm font-bold transition-colors ${t.menuItem}`}>
                      {theme === 'dark' ? <Sun size={16} className={`mr-3 ${t.textAccent2}`}/> : <Moon size={16} className={`mr-3 ${t.textAccent1}`}/>}
                      {theme === 'dark' ? 'Cambiar a Claro' : 'Cambiar a Oscuro'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex space-x-6 mt-2 overflow-x-auto custom-scrollbar">
            <button className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${t.tabActive}`}>
              <Store size={18} /><span>1. Tiendas y Clústeres</span>
            </button>
            <button className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 opacity-50 cursor-not-allowed border-transparent ${t.textMuted}`} title="Próximamente">
              <Package size={18} /><span>2. Plan de Surtido</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-300">
        
        {stores.length === 0 ? (
          <EmptyState 
            icon={Store} 
            title="Configura tu Matriz de Distribución" 
            desc="Para comenzar a crear planes de surtido, GO PLANNER necesita conocer tus sucursales y sus KPIs. Sube un archivo con los datos históricos para que el motor califique a las tiendas automáticamente."
            rules={[
              "Centro (Ej. 0953)",
              "Nombre / Tienda (Ej. Madero Norte)",
              "GOA / Familia (Ej. Chancla)",
              "Ventas (Obligatorio, numérico)",
              "Margen (Opcional, en % o decimal)",
              "Rotacion (Opcional, numérico)"
            ]}
            action={
              <label className={`cursor-pointer px-6 py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center hover:scale-105 transform duration-200 ${t.btnPrimary}`}>
                <Upload size={18} className="mr-2" /> Subir Archivo Base (.CSV)
                <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
              </label>
            }
          />
        ) : (
          <div className="space-y-6">
            
            {/* CONTROLES DE PONDERACIÓN */}
            <div className={`p-5 rounded-xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 ${t.cardInner}`}>
              <div className={`flex items-center p-3 rounded-lg border ${theme==='dark'?'bg-black/20 border-black/30':'bg-white shadow-sm'}`}>
                <Settings size={20} className={`mr-3 ${t.textAccent2}`} />
                <div className="flex flex-col">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${t.textMuted}`}>Estrategia de Distribución</label>
                  <select value={clusterStrategy} onChange={(e) => setClusterStrategy(e.target.value)} className={`mt-1 mb-3 p-1.5 rounded outline-none font-bold text-sm cursor-pointer ${t.inputYellow}`}>
                    <option value="piramide">Pirámide Retail (Concentrar en Top)</option>
                    <option value="lineal">Equitativa (Partes Iguales)</option>
                    <option value="valor">Absoluta (Por Valor del Score)</option>
                  </select>

                  <label className={`text-[10px] font-bold uppercase tracking-wider ${t.textMuted}`}>Cantidad de Clústeres</label>
                  <select value={numClusters} onChange={(e) => setNumClusters(Number(e.target.value))} className={`mt-1 p-1.5 rounded outline-none font-bold text-sm cursor-pointer ${t.inputYellow}`}>
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

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-purple-500 relative overflow-hidden ${t.card}`}>
                <div className="absolute -right-4 -top-4 opacity-5"><Store size={100} /></div>
                <div className={`p-3 rounded-full relative z-10 ${t.iconAccent1}`}><Store size={24}/></div>
                <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Total Tiendas</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.total}</p></div>
              </div>
              <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-blue-500 relative overflow-hidden ${t.card}`}>
                <div className="absolute -right-4 -top-4 opacity-5"><Package size={100} /></div>
                <div className={`p-3 rounded-full relative z-10 ${t.iconAccent2}`}><Package size={24}/></div>
                <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Categorías (GOAs)</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.goas}</p></div>
              </div>
              <div className={`p-4 rounded-xl border border-l-4 border-l-gray-500 ${t.card}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Distribución Global (Niveles)</p>
                <div className="flex justify-between items-end px-2 overflow-x-auto custom-scrollbar pb-1">
                  {activeClusters.map(c => (
                    <div key={`clust-stat-${c}`} className="flex flex-col items-center mx-1">
                      <span className={`text-[10px] font-black mb-1 ${c === activeClusters[0] ? t.textAccent1 : c === activeClusters[1] ? t.textAccent2 : t.textMuted}`}>{c}</span>
                      <span className={`text-sm font-bold ${t.textMain}`}>{storeStats.clusters[c] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* TABLA PRINCIPAL DE TIENDAS */}
            <div className={`p-6 rounded-xl border ${t.card}`}>
              <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4 ${t.border}`}>
                <div>
                  <h2 className={`text-xl font-bold ${t.textMain}`}>Base Maestra de Tiendas</h2>
                  <p className={`text-sm mt-1 ${t.textMuted}`}>El Score global recalcula automáticamente los Clústeres de cada GOA.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className={`flex rounded-lg p-1 border ${t.cardInner}`}>
                    <button onClick={()=>toggleSort('score')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='score'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Score <ArrowUpDown size={12} className="ml-1"/></button>
                    <button onClick={()=>toggleSort('sales')} className={`px-3 py-1.5 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='sales'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Vtas <ArrowUpDown size={12} className="ml-1"/></button>
                  </div>
                  
                  {forecastDisponible && (
                    <button onClick={handleLoadForecast} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition bg-indigo-600 text-white hover:bg-indigo-500`}>
                      <Database size={16} className="mr-2" /> Extraer Forecast
                    </button>
                  )}

                  <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${t.btnGhost}`}>
                    <Upload size={16} className="mr-2" /> Cargar Nuevo CSV
                    <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                  </label>
                </div>
              </div>

              {/* GRID DE SUCURSALES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {sortedStores.map(store => (
                  <div key={`store-card-${store.id}`} className={`p-5 rounded-xl shadow-sm transition-colors group border hover:border-purple-500/50 ${t.cardInner}`}>
                    
                    <div className="flex justify-between items-center mb-3">
                      <p className={`text-sm font-bold truncate ${t.textMain}`} title={store.name}>{store.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${t.badgeOther}`}>{store.centerCode}</span>
                    </div>
                    
                    <div className={`rounded-lg p-3 mb-4 mt-2 grid grid-cols-3 gap-2 text-center divide-x border ${theme==='dark'?'divide-zinc-800 bg-zinc-900 border-zinc-800':'divide-gray-200 bg-white border-gray-100'}`}>
                      <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Ventas</p><p className={`text-[10px] font-bold ${t.textMain}`}>${store.sales?.toLocaleString()}</p></div>
                      <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Mg</p><p className={`text-[10px] font-bold ${t.textMain}`}>{store.margin?.toFixed(1)}%</p></div>
                      <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Rot</p><p className={`text-[10px] font-bold ${t.textMain}`}>{store.rotation?.toFixed(1)}</p></div>
                      <div className={`col-span-3 pt-3 border-t divide-none mt-2 flex justify-between px-2 items-center ${theme==='dark'?'border-zinc-800':'border-gray-100'}`}>
                         <p className={`text-[9px] uppercase font-black tracking-widest ${t.textAccent2}`}>Score Global:</p>
                         <p className={`text-base font-black leading-tight ${t.textAccent2}`}>{Math.round(store.score || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className={`text-[10px] uppercase font-bold tracking-wider mb-1 border-b pb-1 ${t.border} ${t.textMuted}`}>Clústeres Asignados:</p>
                      {Object.keys(store.clusters).length === 0 && <span className="text-xs text-red-500">Sin clúster asignado</span>}
                      {Object.entries(store.clusters).map(([goa, cluster]) => (
                        <div key={`store-${store.id}-goa-${goa}`} className={`flex justify-between items-center text-xs`}>
                          <span className={`truncate max-w-[120px] font-medium ${t.textMuted}`} title={goa}>{goa}</span>
                          <select 
                            value={cluster} 
                            onChange={(e) => handleUpdateStoreCluster(store.id, goa, e.target.value)} 
                            className={`font-black p-1 rounded outline-none cursor-pointer border transition-colors ${cluster === activeClusters[0] ? t.badgeAA : cluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}
                          >
                            {activeClusters.map(c => <option key={`opt-${store.id}-${goa}-${c}`} value={c} className={theme==='dark'?'bg-zinc-900 text-white':''}>{c}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>

                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme === 'dark' ? '#3f3f46' : '#d1d5db'}; border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme === 'dark' ? '#52525b' : '#9ca3af'}; }`}} />
    </div>
  );
}

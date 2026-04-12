import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Settings,
  ShoppingCart,
  BarChart3,
  Plus,
  Trash2,
  Store,
  Package,
  Save,
  Upload,
  Download,
  Zap,
  DollarSign,
  Calculator,
  FileSpreadsheet,
  ArrowUpDown,
  Edit3,
  Lightbulb,
  MoreVertical,
  Sun,
  Moon,
  Sliders,
  CalendarDays,
  Compass,
  Activity,
  Wand2,
  Database,
  RefreshCw,
  Layers,
  ClipboardList,
  Info,
  Map,
  Target
} from 'lucide-react';
import { useDispatch, useGlobal, globalActions } from '../context/GlobalContext';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const budgetFileInputRef = useRef(null);
  const forecastFileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('data');

  // --- INTEGRACIÓN GLOBAL CONTEXT ---
  const gDispatch = useDispatch();
  const gState    = useGlobal();
  const theme = gState?.theme || 'dark'; // El tema ahora viaja desde el contexto global
  
  // --- ESTADO DE BASE Y CLÚSTERES ---
  const [numClusters, setNumClusters] = useState(6);
  const [clusterStrategy, setClusterStrategy] = useState('piramide');
  
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

  // --- CALCULADORAS ---
  const [sizeCurves, setSizeCurves] = useState([]);
  const [calcRules, setCalcRules] = useState([]);

  // --- COMPRAS Y ESTADO TEMPORAL ---
  const [purchases, setPurchases] = useState([]);
  const [newCurve, setNewCurve] = useState({ name: '', sizes: '', weights: '' });
  const [editingCurveId, setEditingCurveId] = useState(null);
  const [newRule, setNewRule] = useState({ name: '' });
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [buyData, setBuyData] = useState({ goaId: '', modelo: '', pvp: '', curveId: '', ruleId: '' });

  // --- REPORTES Y PLANEACIÓN ESTRATÉGICA ---
  const [reportView, setReportView] = useState('sugerido'); 
  const [suggestedPlans, setSuggestedPlans] = useState([]); 

  // --- PUBLICAR OTB AL GLOBAL CONTEXT ---
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
      tabActive: "border-yellow-400 text-yellow-400", tabInactive: "border-transparent text-gray-500 hover:text-gray-300",
      card: "bg-zinc-900 border-zinc-800 shadow-lg", cardInner: "bg-zinc-950 border-zinc-800",
      textMain: "text-white", textMuted: "text-gray-400", textAccent1: "text-purple-400", textAccent2: "text-yellow-400",
      iconAccent1: "text-purple-400 bg-purple-900/30", iconAccent2: "text-yellow-400 bg-yellow-500/20",
      border: "border-zinc-800", input: "bg-zinc-950 border-zinc-700 text-white focus:ring-purple-500 outline-none",
      inputYellow: "bg-zinc-950 border-zinc-700 text-yellow-400 font-bold focus:ring-yellow-500 outline-none",
      btnPrimary: "bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]",
      btnSecondary: "bg-purple-600 text-white hover:bg-purple-500", btnDanger: "text-gray-400 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 border-zinc-800",
      btnEdit: "text-gray-400 hover:text-yellow-400 bg-zinc-900 hover:bg-zinc-800 border-zinc-800", btnGhost: "bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700",
      tableHead: "bg-zinc-950 text-gray-500 border-zinc-800", tableRow: "hover:bg-zinc-800/50",
      badgeAA: "text-purple-400 bg-purple-900/30 border-purple-500/50", badgeA: "text-yellow-400 bg-yellow-900/30 border-yellow-500/50", badgeOther: "text-gray-300 bg-zinc-800 border-zinc-600",
      gradientCard: "bg-gradient-to-br from-indigo-900 to-zinc-900 border border-zinc-800",
      successText: "text-green-400", successBg: "bg-green-900/20 border-green-500/50 text-green-300",
      warningText: "text-yellow-400", warningBg: "bg-yellow-900/20 border-yellow-500/50 text-yellow-300",
      dangerText: "text-red-400", dangerBg: "bg-red-900/20 border-red-500/50 text-red-300",
      toggleActive: "bg-yellow-500 text-black font-black shadow-md", toggleInactive: "bg-zinc-900 text-gray-400 hover:text-white border-zinc-800"
    },
    light: {
      appBg: "bg-gray-50 text-gray-800", header: "bg-white border-gray-200 shadow-sm",
      logoIcon: "bg-blue-600 text-white", logoAccent: "text-blue-600",
      btnMenu: "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-300",
      menuBg: "bg-white border border-gray-200 shadow-xl", menuItem: "hover:bg-gray-50 text-gray-700 border-gray-100",
      tabActive: "border-blue-600 text-blue-600", tabInactive: "border-transparent text-gray-500 hover:text-gray-700",
      card: "bg-white border-gray-200 shadow-sm", cardInner: "bg-gray-50 border-gray-200",
      textMain: "text-gray-900", textMuted: "text-gray-500", textAccent1: "text-blue-600", textAccent2: "text-indigo-600",
      iconAccent1: "text-blue-600 bg-blue-50", iconAccent2: "text-indigo-600 bg-indigo-50",
      border: "border-gray-200", input: "bg-white border-gray-300 text-gray-900 focus:ring-blue-500 outline-none",
      inputYellow: "bg-white border-gray-300 text-indigo-700 font-bold focus:ring-indigo-500 outline-none",
      btnPrimary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md",
      btnSecondary: "bg-indigo-600 text-white hover:bg-indigo-700", btnDanger: "text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 border-gray-200",
      btnEdit: "text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 border-gray-200", btnGhost: "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200",
      tableHead: "bg-gray-50 text-gray-500 border-gray-200", tableRow: "hover:bg-gray-50",
      badgeAA: "text-indigo-700 bg-indigo-100 border-indigo-200", badgeA: "text-blue-700 bg-blue-100 border-blue-200", badgeOther: "text-gray-600 bg-gray-100 border-gray-200",
      gradientCard: "bg-gradient-to-br from-blue-700 to-indigo-800 text-white",
      successText: "text-green-600", successBg: "bg-green-50 border-green-200 text-green-800",
      warningText: "text-yellow-600", warningBg: "bg-yellow-50 border-yellow-200 text-yellow-800",
      dangerText: "text-red-600", dangerBg: "bg-red-50 border-red-200 text-red-800",
      toggleActive: "bg-white text-blue-700 font-black shadow-sm border border-blue-200", toggleInactive: "bg-gray-100 text-gray-500 hover:text-gray-800 border-transparent"
    }
  };
  const t = themes[theme];

  // --- FUNCIONES DE ARCHIVOS (JSON) ---
  const handleExportProject = () => {
    const data = { stores, goas, sizeCurves, calcRules, purchases, rawStoreData, scoreWeights, numClusters, clusterStrategy, suggestedPlans };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GO_PLANNER_Assortment_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
  };

  const handleImportProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if(data.stores) setStores(data.stores);
        if(data.goas) setGoas(data.goas);
        if(data.sizeCurves) setSizeCurves(data.sizeCurves);
        if(data.calcRules) setCalcRules(data.calcRules);
        if(data.purchases) setPurchases(data.purchases);
        if(data.rawStoreData) setRawStoreData(data.rawStoreData);
        if(data.scoreWeights) setScoreWeights(data.scoreWeights);
        if(data.numClusters) setNumClusters(data.numClusters);
        if(data.clusterStrategy) setClusterStrategy(data.clusterStrategy);
        if(data.suggestedPlans) setSuggestedPlans(data.suggestedPlans);
        alert("¡Proyecto cargado con éxito!");
      } catch (err) { alert("Error al leer el archivo JSON."); }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

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
        storeMap.set(row.centro, { id: row.centro, centerCode: row.centro, name: row.name, sales: row.sales, margin: row.margin, rotation: row.rotation, score: 0, clusters: {} });
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

      storesInGoa.sort((a, b) => b.score - a.score);
      const total = storesInGoa.length;
      const numClust = currentClusters.length;
      const maxScore = storesInGoa.length > 0 ? storesInGoa[0].score : 1;
      
      storesInGoa.forEach((item, index) => {
        const percentile = index / total; 
        let clusterIndex = numClust - 1; 
        
        if (strategy === 'piramide') {
          if (numClust === 6) {
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
          return [...prev, { id: Date.now() + Math.random(), name: formatted, budget: 0, historyPzs: 0, months: [16.6, 16.6, 16.6, 16.6, 16.6, 17] }];
        }
        return prev;
      });
    });
    setStores(Array.from(storeMap.values()));
  };

  useEffect(() => {
    if (rawStoreData.length > 0) recalculateClusters(rawStoreData, scoreWeights, activeClusters, clusterStrategy);
  }, [scoreWeights, activeClusters, clusterStrategy]);

  // --- CARGA DE DATOS DESDE CONTEXT GLOBAL ---
  const handleLoadForecast = () => {
    if (gState?.forecastData?.brands) {
      const newGoas = gState.forecastData.brands.map((b, i) => ({
        id: Date.now() + i,
        name: String(b.name || b.brand || `GOA ${i+1}`),
        budget: Number(b.budget) || 0,
        historyPzs: Number(b.historyPzs) || 0,
        months: Array.isArray(b.months) ? b.months : [16.6, 16.6, 16.6, 16.6, 16.6, 17]
      }));
      setGoas(newGoas);
      alert("Datos históricos y presupuestos cargados desde GO Forecasting.");
    } else {
      alert("No se detectó información en el Contexto de GO Forecasting. Por favor valida la conexión o carga un archivo manual.");
    }
  };

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
      
      setGoas([]);
      setStores([]);
      setRawStoreData(extractedRawData);
      recalculateClusters(extractedRawData, scoreWeights, activeClusters, clusterStrategy);
      if(fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1'); // Soporte para acentos y caracteres de MS Excel
  };

  const handleUpdateStoreCluster = (storeId, goaName, newCluster) => {
    setStores((stores || []).map(s => s.id === storeId ? { ...s, clusters: { ...(s.clusters || {}), [goaName]: newCluster } } : s));
  };

  const handleBudgetCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.split(',').map(cell => cell?.trim().replace(/^"|"$/g, '') || ''));
      if (rows.length < 2) { if(budgetFileInputRef.current) budgetFileInputRef.current.value = ''; return; }
      
      const newGoas = [];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        newGoas.push({ 
          id: Date.now() + i, name: rows[i][0], 
          budget: parseFloat(rows[i][1]) || 0, historyPzs: parseInt(rows[i][2]) || 0,
          months: [16.6, 16.6, 16.6, 16.6, 16.6, 17] 
        });
      }
      setGoas(newGoas);
      alert("Presupuestos Básicos actualizados.");
      if(budgetFileInputRef.current) budgetFileInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleForecastCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.split(',').map(cell => cell?.trim().replace(/^"|"$/g, '') || ''));
      if (rows.length < 2) { if(forecastFileInputRef.current) forecastFileInputRef.current.value = ''; return; }
      
      const newGoas = [];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        const m1 = parseFloat(rows[i][3]) || 16.6; const m2 = parseFloat(rows[i][4]) || 16.6;
        const m3 = parseFloat(rows[i][5]) || 16.6; const m4 = parseFloat(rows[i][6]) || 16.6;
        const m5 = parseFloat(rows[i][7]) || 16.6; const m6 = parseFloat(rows[i][8]) || 17.0;

        newGoas.push({ 
          id: Date.now() + i, name: rows[i][0], 
          budget: parseFloat(rows[i][1]) || 0, historyPzs: parseInt(rows[i][2]) || 0,
          months: [m1, m2, m3, m4, m5, m6]
        });
      }
      setGoas(newGoas);
      alert("Forecast y Presupuestos Mensuales importados desde CSV con éxito.");
      if(forecastFileInputRef.current) forecastFileInputRef.current.value = '';
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  // --- CRUD CALCULADORAS ---
  const handleCurveSubmit = (e) => {
    e.preventDefault();
    if (!newCurve.name) return;
    if (editingCurveId) { setSizeCurves((sizeCurves || []).map(c => c.id === editingCurveId ? { ...c, ...newCurve } : c)); setEditingCurveId(null); } 
    else setSizeCurves([...(sizeCurves || []), { id: Date.now(), ...newCurve }]);
    setNewCurve({ name: '', sizes: '', weights: '' });
  };
  const editCurve = (c) => { setNewCurve({ name: c.name, sizes: c.sizes, weights: c.weights }); setEditingCurveId(c.id); };

  const handleRuleSubmit = (e) => {
    e.preventDefault();
    if (!newRule.name) return;
    const ruleCorridas = {};
    (activeClusters || []).forEach(c => { ruleCorridas[c] = Number(newRule[c]) || 0; });
    const ruleObj = { id: editingRuleId || Date.now(), name: newRule.name, corridas: ruleCorridas };
    if (editingRuleId) { setCalcRules((calcRules || []).map(r => r.id === editingRuleId ? ruleObj : r)); setEditingRuleId(null); } 
    else setCalcRules([...(calcRules || []), ruleObj]);
    setNewRule({ name: '' });
  };
  const editRule = (r) => { 
    const editObj = { name: r.name };
    (activeClusters || []).forEach(c => editObj[c] = r.corridas[c] || 0);
    setNewRule(editObj); setEditingRuleId(r.id); 
  };

  // --- EJECUCIÓN DE COMPRAS PREVENTA ---
  const handleGenerateBuy = (e) => {
    e.preventDefault();
    const { goaId, modelo, pvp, curveId, ruleId } = buyData;
    if (!goaId || !modelo || !pvp || !curveId || !ruleId) return;

    const goa = (goas || []).find(g => g.id === Number(goaId));
    const curve = (sizeCurves || []).find(c => c.id === Number(curveId));
    const rule = (calcRules || []).find(r => r.id === Number(ruleId));
    
    if(!goa || !curve || !rule) return;
    
    const weightsArr = (curve.weights || '').split(',').map(w => Number(w.trim()));
    const totalPzsPerRun = weightsArr.reduce((a, b) => a + b, 0);

    const storeDemands = {}; let totalPieces = 0; const goaNameUpper = (goa.name || '').toUpperCase();
    
    (stores || []).forEach(store => {
      let storeClusterForGoa = (store.clusters || {})[goa.name] || (store.clusters || {})[goaNameUpper] || activeClusters[activeClusters.length - 1]; 
      const runs = (rule.corridas || {})[storeClusterForGoa] || 0;
      const totalPerStore = runs * totalPzsPerRun;
      if (totalPerStore > 0) { storeDemands[store.id] = { clusterUsed: storeClusterForGoa, runs, totalPieces: totalPerStore }; totalPieces += totalPerStore; }
    });

    if (totalPieces === 0) { alert("La regla seleccionada no genera compras."); return; }

    setPurchases([...(purchases || []), {
      id: Date.now(), goaId: goa.id, goaName: goa.name, modelo: modelo.toUpperCase(),
      pvp: Number(pvp), curveId: curve.id, curveName: curve.name, ruleId: rule.id, ruleName: rule.name,
      totalPieces, totalRetailValue: totalPieces * Number(pvp), storeDemands
    }]);
    setBuyData({ ...buyData, modelo: '', pvp: '' });
  };

  // --- MOTOR MÁGICO DE SUGERENCIAS ---
  const handleAddSuggestion = (goaId) => {
    setSuggestedPlans([...(suggestedPlans || []), { id: Date.now(), goaId, curveId: '', ruleId: '', pvp: '', models: '' }]);
  };
  const handleUpdateSuggestion = (id, field, value) => {
    setSuggestedPlans((suggestedPlans || []).map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  const removeSuggestion = (id) => {
    setSuggestedPlans((suggestedPlans || []).filter(p => p.id !== id));
  };

  const getPiecesForOneModel = (goaName, curveId, ruleId) => {
    if (!curveId || !ruleId || !goaName) return 0;
    const curve = (sizeCurves || []).find(c => c.id === Number(curveId));
    const rule = (calcRules || []).find(r => r.id === Number(ruleId));
    if (!curve || !rule) return 0;

    const totalPzsPerRun = (curve.weights || '').split(',').map(w => Number(w.trim())).reduce((a, b) => a + b, 0);
    const goaNameUpper = goaName.toUpperCase();
    let pzs = 0;
    (stores || []).forEach(store => {
      let c = (store.clusters || {})[goaName] || (store.clusters || {})[goaNameUpper] || activeClusters[activeClusters.length - 1];
      const runs = (rule.corridas || {})[c] || 0;
      pzs += (runs * totalPzsPerRun);
    });
    return pzs;
  };

  const handleAutoSuggest = (planId) => {
    const plan = (suggestedPlans || []).find(p => p.id === planId);
    if(!plan || !plan.curveId || !plan.ruleId) { alert("Selecciona Curva y Regla."); return; }
    
    const goa = (goas || []).find(g => g.id === plan.goaId);
    if(!goa) return;
    
    const singleModelPzs = getPiecesForOneModel(goa.name, plan.curveId, plan.ruleId);
    
    if(singleModelPzs > 0) {
      const otherPlans = (suggestedPlans || []).filter(p => p.goaId === goa.id && p.id !== planId);
      let usedPzs = 0; let usedBudget = 0;
      otherPlans.forEach(op => {
         const opPzs = getPiecesForOneModel(goa.name, op.curveId, op.ruleId);
         usedPzs += opPzs * (Number(op.models)||0);
         usedBudget += opPzs * (Number(op.models)||0) * (Number(op.pvp)||0);
      });
      
      const remainingPzs = Math.max(0, (goa.historyPzs || 0) - usedPzs);
      const remainingBudget = Math.max(0, (goa.budget || 0) - usedBudget);
      
      const suggestedModels = remainingPzs > 0 ? Math.round(remainingPzs / singleModelPzs) : 1;
      const actualPzs = suggestedModels * singleModelPzs;
      const suggestedPvp = actualPzs > 0 ? (remainingBudget / actualPzs).toFixed(0) : 0;
      
      setSuggestedPlans((suggestedPlans || []).map(p => p.id === planId ? { ...p, models: suggestedModels || 1, pvp: suggestedPvp } : p));
    }
  };

  // --- REPORTES CONSOLIDADOS ---
  const reportData = useMemo(() => {
    const isSug = reportView === 'sugerido';
    
    const goaMetrics = (goas || []).map(g => {
      let boughtPzs = 0; let spentValue = 0;
      if (isSug) {
        const plans = (suggestedPlans || []).filter(p => p.goaId === g.id);
        plans.forEach(plan => {
          const pzsPerModel = getPiecesForOneModel(g.name, plan.curveId, plan.ruleId);
          const models = Number(plan.models) || 0;
          const pvp = Number(plan.pvp) || 0;
          boughtPzs += (pzsPerModel * models);
          spentValue += (pzsPerModel * models * pvp);
        });
      } else {
        const p = (purchases || []).filter(x => x.goaId === g.id);
        boughtPzs = p.reduce((acc, curr) => acc + (curr.totalPieces || 0), 0);
        spentValue = p.reduce((acc, curr) => acc + (curr.totalRetailValue || 0), 0);
      }
      const budget = g.budget || 0;
      const historyPzs = g.historyPzs || 0;
      return { ...g, boughtPzs, spentValue, otb: budget - spentValue, historyDiff: boughtPzs - historyPzs };
    });

    const storeSummary = (stores || []).map(store => {
      let storeTotalPzs = 0; let storeTotalValue = 0;
      if (isSug) {
        (suggestedPlans || []).forEach(plan => {
          const goa = (goas || []).find(g => g.id === plan.goaId);
          if (goa) {
            const c = (store.clusters || {})[goa.name] || (store.clusters || {})[(goa.name || '').toUpperCase()] || activeClusters[activeClusters.length - 1];
            const rule = (calcRules || []).find(r => r.id === Number(plan.ruleId));
            const curve = (sizeCurves || []).find(cv => cv.id === Number(plan.curveId));
            if (rule && curve) {
              const runs = (rule.corridas || {})[c] || 0;
              const pzsPerRun = (curve.weights || '').split(',').reduce((a, b) => a + Number(b), 0);
              const pzsInStore = runs * pzsPerRun;
              storeTotalPzs += pzsInStore * (Number(plan.models) || 0);
              storeTotalValue += pzsInStore * (Number(plan.models) || 0) * (Number(plan.pvp) || 0);
            }
          }
        });
      } else {
        (purchases || []).forEach(p => {
          const demand = (p.storeDemands || {})[store.id];
          if (demand) { storeTotalPzs += demand.totalPieces || 0; storeTotalValue += ((demand.totalPieces || 0) * (p.pvp || 0)); }
        });
      }
      return { ...store, storeTotalPzs, storeTotalValue };
    }).sort((a, b) => (b.storeTotalPzs || 0) - (a.storeTotalPzs || 0));

    const matrixByGoa = {};
    (goas || []).forEach(g => {
      const matrix = {};
      (activeClusters || []).forEach(c => matrix[c] = { stores: 0, ruleRunsAvg: 0, pzs: 0, totalStoreInstances: 0 });

      (stores || []).forEach(store => {
        const c = (store.clusters || {})[g.name] || (store.clusters || {})[(g.name || '').toUpperCase()] || activeClusters[activeClusters.length - 1];
        if(matrix[c]) matrix[c].stores += 1;
      });

      let totalModelsAffected = 0;

      if (isSug) {
        const plans = (suggestedPlans || []).filter(p => p.goaId === g.id);
        plans.forEach(plan => {
          const rule = (calcRules || []).find(r => r.id === Number(plan.ruleId));
          const curve = (sizeCurves || []).find(c => c.id === Number(plan.curveId));
          const models = Number(plan.models) || 0;
          
          if(rule && curve && models > 0) {
            totalModelsAffected += models;
            const totalPzsPerRun = (curve.weights || '').split(',').map(w => Number(w.trim())).reduce((a, b) => a + b, 0);
            
            (activeClusters || []).forEach(c => {
               const runs = (rule.corridas || {})[c] || 0;
               if (runs > 0 && matrix[c]) {
                 matrix[c].ruleRunsAvg += (runs * models); 
                 matrix[c].pzs += (runs * totalPzsPerRun * models * matrix[c].stores); 
                 matrix[c].totalStoreInstances += (matrix[c].stores * models);
               }
            });
          }
        });
      } else {
        const pForGoa = (purchases || []).filter(x => x.goaId === g.id);
        totalModelsAffected = pForGoa.length;
        pForGoa.forEach(purchase => {
          (stores || []).forEach(store => {
            const demand = (purchase.storeDemands || {})[store.id];
            if (demand && matrix[demand.clusterUsed]) {
              matrix[demand.clusterUsed].ruleRunsAvg += demand.runs || 0;
              matrix[demand.clusterUsed].pzs += demand.totalPieces || 0;
              matrix[demand.clusterUsed].totalStoreInstances += 1;
            }
          });
        });
      }
      
      matrixByGoa[g.name] = (activeClusters || []).map(c => {
        const avgRuns = (matrix[c] && matrix[c].totalStoreInstances > 0 && totalModelsAffected > 0) ? (matrix[c].ruleRunsAvg / totalModelsAffected).toFixed(1) : "0";
        return { cluster: c, numStores: matrix[c] ? matrix[c].stores : 0, runsPorTienda: avgRuns, totalPzs: matrix[c] ? matrix[c].pzs : 0 };
      });
    });

    return { goaMetrics, storeSummary, matrixByGoa };
  }, [purchases, stores, goas, activeClusters, reportView, suggestedPlans, calcRules, sizeCurves]);

  const storeStats = useMemo(() => {
    const stats = {
      total: (stores || []).length,
      goas:  (goas  || []).length,
      clusters: { 'Sin Asignar': 0 },
    };
    (activeClusters || []).forEach(c => { stats.clusters[c] = 0; });
    (stores || []).forEach(s => {
      const clusterValues = Object.values(s.clusters || {});
      if (clusterValues.length === 0) {
        stats.clusters['Sin Asignar']++;
      } else {
        const primary = clusterValues[0];
        if (stats.clusters[primary] !== undefined) stats.clusters[primary]++;
      }
    });
    return stats;
  }, [stores, goas, activeClusters]);

  const sortedStores = useMemo(() => {
    return [...(stores || [])].sort((a, b) => {
      let valA = a[storeSortBy];
      let valB = b[storeSortBy];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return storeSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return storeSortOrder === 'asc' ?  1 : -1;
      return 0;
    });
  }, [stores, storeSortBy, storeSortOrder]);

  const toggleSort = (field) => {
    if (storeSortBy === field) {
      setStoreSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStoreSortBy(field);
      setStoreSortOrder('desc');
    }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button onClick={() => setActiveTab(id)} className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === id ? t.tabActive : t.tabInactive}`}>
      <Icon size={18} /><span>{label}</span>
    </button>
  );

  const EmptyState = ({ icon: Icon, title, desc, rules, action }) => (
    <div className={`p-12 rounded-2xl border text-center flex flex-col items-center justify-center ${theme==='dark'?'bg-zinc-900/50 border-zinc-800':'bg-white border-gray-200 shadow-sm'}`}>
      <div className={`p-5 rounded-full mb-6 ${theme==='dark'?'bg-purple-900/20 text-purple-400':'bg-blue-50 text-blue-600'}`}>
        <Icon size={48} strokeWidth={1.5} />
      </div>
      <h3 className={`text-2xl font-black mb-3 tracking-wide ${t.textMain}`}>{title}</h3>
      <p className={`text-sm max-w-lg mb-6 leading-relaxed ${t.textMuted}`}>{desc}</p>
      
      {rules && rules.length > 0 && (
        <div className={`text-left max-w-lg w-full mb-8 p-4 rounded-xl border ${t.cardInner}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${t.textAccent2}`}>Formato Requerido (CSV)</p>
          <ul className={`space-y-2 text-xs font-mono ${t.textMuted}`}>
            {rules.map((r, i) => <li key={`rule-${i}`} className="flex items-start"><span className={`mr-2 ${t.textAccent1}`}>•</span> {r}</li>)}
          </ul>
        </div>
      )}
      
      <div className="flex flex-wrap justify-center gap-4">
        {action}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen font-sans pb-12 transition-colors duration-300 ${t.appBg}`}>
      
      <header className={`border-b sticky top-0 z-20 transition-colors duration-300 ${t.header}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className={`text-2xl font-black tracking-widest flex items-center ${t.textMain}`}>
                GO <span className="mx-3 text-gray-500 font-light">|</span> <ShoppingCart size={28} className={t.textAccent1} />
              </h1>
            </div>
            
            <div className="relative">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`p-2 rounded-lg transition-all focus:outline-none ${t.btnMenu}`} title="Ajustes">
                <MoreVertical size={20} />
              </button>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                  <div className={`absolute right-0 mt-2 w-56 rounded-xl z-50 overflow-hidden transition-all shadow-2xl border ${t.menuBg}`}>
                    <div className={`px-4 py-2 text-[10px] font-black tracking-widest uppercase border-b ${theme==='dark'?'bg-zinc-950 border-zinc-800 text-gray-500':'bg-gray-50 border-gray-200 text-gray-400'}`}>Ajustes de Herramienta</div>
                    <label className={`w-full flex items-center px-4 py-3 text-sm font-bold cursor-pointer border-b transition-colors ${t.menuItem}`}>
                      <Upload size={16} className={`mr-3 ${t.textAccent1}`}/> Cargar Sesión (.json)
                      <input type="file" accept=".json" onChange={(e) => { handleImportProject(e); setIsMenuOpen(false); }} className="hidden" />
                    </label>
                    <button onClick={() => { handleExportProject(); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 text-sm font-bold transition-colors ${t.menuItem}`}>
                      <Download size={16} className={`mr-3 ${t.textAccent2}`}/> Guardar Sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex space-x-6 mt-2 overflow-x-auto custom-scrollbar">
            <TabButton id="data" label="1. Tiendas y Clústeres" icon={Store} />
            <TabButton id="calc" label="2. Curvas y Reglas" icon={ClipboardList} />
            <TabButton id="budget" label="3. Forecast GO Planner" icon={Database} />
            <TabButton id="assortment" label="4. Ejecutar Preventa" icon={Package} />
            <TabButton id="reports" label="5. Reportes / Plan OTB" icon={Compass} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-300">
        
        {/* === PESTAÑA 1: BASE === */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {(stores || []).length === 0 ? (
              <EmptyState 
                icon={Store} title="Configura la Base de Tiendas" 
                desc="Para comenzar a planear, necesitamos calificar tus sucursales."
                rules={["Centro (Ej. 0953)", "Nombre (Ej. Tienda Norte)", "GOA / Familia (Ej. Chancla)", "Ventas (Numérico)", "Margen (Opcional)", "Rotacion (Opcional)"]}
                action={
                  <label className={`cursor-pointer px-6 py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center hover:scale-105 transform duration-200 ${t.btnPrimary}`}>
                    <Upload size={18} className="mr-2" /> Subir Archivo Base (.CSV)
                    <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                  </label>
                }
              />
            ) : (
              <>
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
                      <span className={`text-xs font-bold ${t.textMain}`}>Peso del Score (Total: {scoreWeights.sales + scoreWeights.margin + scoreWeights.rotation}%)</span>
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
                    <div className={`p-3 rounded-full relative z-10 ${t.iconAccent1}`}><Store size={24}/></div>
                    <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Total Tiendas</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.total || 0}</p></div>
                  </div>
                  <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-blue-500 relative overflow-hidden ${t.card}`}>
                    <div className={`p-3 rounded-full relative z-10 ${t.iconAccent2}`}><Package size={24}/></div>
                    <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Categorías (GOAs)</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.goas || 0}</p></div>
                  </div>
                  <div className={`p-4 rounded-xl border border-l-4 border-l-gray-500 ${t.card}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Distribución Global</p>
                    <div className="flex justify-between items-end px-2 overflow-x-auto custom-scrollbar pb-1">
                      {activeClusters.map(c => (
                        <div key={`clust-stat-${c}`} className="flex flex-col items-center mx-1"><span className={`text-[10px] font-black mb-1 ${c === activeClusters[0] ? t.textAccent1 : c === activeClusters[1] ? t.textAccent2 : t.textMuted}`}>{c}</span><span className={`text-sm font-bold ${t.textMain}`}>{storeStats.clusters[c] || 0}</span></div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-xl border ${t.card}`}>
                  <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4 ${t.border}`}>
                    <div>
                      <h2 className={`text-xl font-bold ${t.textMain}`}>Base de Tiendas y Calificación</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className={`flex rounded-lg p-1 border ${t.cardInner}`}>
                        <button onClick={()=>toggleSort('score')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='score'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Score <ArrowUpDown size={10} className="ml-1"/></button>
                        <button onClick={()=>toggleSort('sales')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='sales'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Vtas <ArrowUpDown size={10} className="ml-1"/></button>
                      </div>
                      
                      <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${t.btnGhost}`}>
                        <Upload size={16} className="mr-2" /> Actualizar CSV
                        <input type="file" accept=".csv" onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {sortedStores.map(store => (
                      <div key={store.id} className={`p-4 rounded-xl shadow-sm transition-colors group border hover:border-purple-500/50 ${t.cardInner}`}>
                        <div className="flex justify-between items-center mb-2"><p className={`text-sm font-bold truncate ${t.textMain}`} title={store.name}>{store.name}</p><span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${t.badgeOther}`}>{store.centerCode}</span></div>
                        <div className={`rounded-lg p-2 mb-4 mt-3 grid grid-cols-3 gap-2 text-center divide-x border ${theme==='dark'?'divide-zinc-800 bg-zinc-900 border-zinc-800':'divide-gray-200 bg-white border-gray-100'}`}>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Ventas</p><p className={`text-[10px] font-bold ${t.textMain}`}>${(store.sales || 0).toLocaleString()}</p></div>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Mg</p><p className={`text-[10px] font-bold ${t.textMain}`}>{(store.margin || 0).toFixed(1)}%</p></div>
                          <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Rot</p><p className={`text-[10px] font-bold ${t.textMain}`}>{(store.rotation || 0).toFixed(1)}</p></div>
                          <div className={`col-span-3 pt-2 border-t divide-none mt-1 flex justify-between px-2 items-center ${theme==='dark'?'border-zinc-800':'border-gray-100'}`}>
                             <p className={`text-[9px] uppercase font-black tracking-widest ${t.textAccent2}`}>Score Calificación:</p>
                             <p className={`text-sm font-black leading-tight ${t.textAccent2}`}>{Math.round(store.score || 0).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <p className={`text-[10px] uppercase font-bold tracking-wider ${t.textMuted}`}>Asignación por GOA:</p>
                          {Object.keys(store.clusters || {}).length === 0 && <span className="text-xs text-red-500">Sin clúster asignado</span>}
                          {Object.entries(store.clusters || {}).map(([goa, cluster]) => (
                            <div key={`goa-${goa}`} className={`flex justify-between items-center text-xs border-b pb-1.5 ${t.border}`}>
                              <span className={`truncate max-w-[120px] font-medium ${t.textMuted}`} title={goa}>{goa}</span>
                              <select value={cluster} onChange={(e) => handleUpdateStoreCluster(store.id, goa, e.target.value)} className={`font-black p-1 rounded outline-none cursor-pointer border ${cluster === activeClusters[0] ? t.badgeAA : cluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>
                                {activeClusters.map(c => <option key={`opt-${c}`} value={c} className={theme==='dark'?'bg-zinc-900 text-white':''}>{c}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* === PESTAÑA 2: CALCULADORAS === */}
        {activeTab === 'calc' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className={`p-6 rounded-xl border ${t.card}`}>
              <h2 className={`text-xl font-bold mb-6 flex items-center ${t.textMain}`}><ClipboardList className={`mr-3 ${t.textAccent1}`}/> Curvas de Tallas</h2>
              
              <form onSubmit={handleCurveSubmit} className={`mb-6 p-5 rounded-xl border ${editingCurveId ? t.warningBg : t.cardInner}`}>
                <h3 className={`text-sm font-bold tracking-wider uppercase mb-4 ${editingCurveId ? t.warningText : t.textMuted}`}>{editingCurveId ? '✏️ Editando Curva' : 'Crear Nueva Curva'}</h3>
                <div className="space-y-3">
                  <input required type="text" placeholder="Nombre (Ej. Curva Bebés)" value={newCurve.name} onChange={e=>setNewCurve({...newCurve, name: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                  <input required type="text" placeholder="Tallas separadas por coma" value={newCurve.sizes} onChange={e=>setNewCurve({...newCurve, sizes: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                  <input required type="text" placeholder="Corridas correspondientes" value={newCurve.weights} onChange={e=>setNewCurve({...newCurve, weights: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                </div>
                <div className="flex space-x-3 mt-4">
                  <button type="submit" className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition ${editingCurveId ? t.btnPrimary : t.btnSecondary}`}>
                    {editingCurveId ? 'Actualizar' : 'Guardar Curva'}
                  </button>
                  {editingCurveId && <button type="button" onClick={()=>{setEditingCurveId(null); setNewCurve({name:'', sizes:'', weights:''})}} className={`px-4 rounded-lg text-sm font-bold transition ${t.btnGhost}`}>Cancelar</button>}
                </div>
              </form>

              {(sizeCurves || []).length === 0 ? (
                 <div className={`p-8 text-center rounded-lg border border-dashed ${theme==='dark'?'border-zinc-800 text-gray-500':'border-gray-300 text-gray-400'}`}>Aún no hay curvas de tallas.</div>
              ) : (
                <div className="space-y-3">
                  {sizeCurves.map(c => (
                    <div key={c.id} className={`flex justify-between items-center p-4 border rounded-xl transition-all ${editingCurveId === c.id ? t.warningBg : t.cardInner}`}>
                      <div>
                        <p className={`font-bold ${t.textMain}`}>{c.name}</p>
                        <p className={`text-xs mt-1.5 ${t.textMuted}`}><span className={`font-bold`}>Tallas:</span> [{c.sizes}]<br/><span className={`font-bold`}>Corridas:</span> [{c.weights}]</p>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={()=>editCurve(c)} className={`p-2 rounded-lg transition ${t.btnEdit}`}><Edit3 size={16}/></button>
                        <button onClick={()=>setSizeCurves(sizeCurves.filter(x=>x.id!==c.id))} className={`p-2 rounded-lg transition ${t.btnDanger}`}><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`p-6 rounded-xl border ${t.card}`}>
              <h2 className={`text-xl font-bold mb-6 flex items-center ${t.textMain}`}><Settings className={`mr-3 ${t.textAccent2}`}/> Reglas de Corridas</h2>
              
              {activeClusters.length === 0 ? (
                 <div className={`p-8 text-center rounded-lg border border-dashed ${theme==='dark'?'border-zinc-800 text-gray-500':'border-gray-300 text-gray-400'}`}>Configura tiendas primero.</div>
              ) : (
                <form onSubmit={handleRuleSubmit} className={`mb-6 p-5 rounded-xl border ${editingRuleId ? t.warningBg : t.cardInner}`}>
                  <h3 className={`text-sm font-bold tracking-wider uppercase mb-4 ${editingRuleId ? t.warningText : t.textMuted}`}>{editingRuleId ? '✏️ Editando Regla' : 'Crear Nueva Regla'}</h3>
                  <input required type="text" placeholder="Nombre (Ej. Regla Invierno)" value={newRule.name} onChange={e=>setNewRule({...newRule, name: e.target.value})} className={`w-full mb-4 p-2.5 rounded-lg text-sm transition ${t.inputYellow}`} />
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
                    {activeClusters.map(c => (
                      <div key={`rule-clust-${c}`} className="text-center">
                        <label className={`block text-[10px] font-black mb-1 ${c === activeClusters[0] ? t.textAccent1 : c === activeClusters[1] ? t.textAccent2 : t.textMuted}`}>{c}</label>
                        <input type="number" min="0" value={newRule[c] || ''} onChange={e=>setNewRule({...newRule, [c]: e.target.value})} placeholder="0" className={`w-full p-2 rounded-md text-sm text-center transition ${t.input}`} />
                      </div>
                    ))}
                  </div>
                  <div className="flex space-x-3">
                    <button type="submit" className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition ${editingRuleId ? t.btnPrimary : t.btnSecondary}`}>
                      {editingRuleId ? 'Actualizar' : 'Guardar Regla'}
                    </button>
                    {editingRuleId && <button type="button" onClick={()=>{setEditingRuleId(null); setNewRule({name:''})}} className={`px-4 rounded-lg text-sm font-bold transition ${t.btnGhost}`}>Cancelar</button>}
                  </div>
                </form>
              )}

              {(calcRules || []).length === 0 ? (
                 <div className={`p-8 text-center rounded-lg border border-dashed ${theme==='dark'?'border-zinc-800 text-gray-500':'border-gray-300 text-gray-400'}`}>Aún no hay reglas.</div>
              ) : (
                <div className="space-y-3">
                  {calcRules.map(r => (
                    <div key={r.id} className={`flex justify-between items-center p-4 border rounded-xl transition-all ${editingRuleId === r.id ? t.warningBg : t.cardInner}`}>
                      <div>
                        <p className={`font-bold ${t.textMain}`}>{r.name}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {activeClusters.map(c => (
                            <span key={`disp-${c}`} className={`text-[10px] px-1.5 py-0.5 rounded border 
                              ${c === activeClusters[0] && (r.corridas || {})[c] > 0 ? t.badgeAA : 
                                c === activeClusters[1] && (r.corridas || {})[c] > 0 ? t.badgeA : 
                                (r.corridas || {})[c] > 0 ? t.badgeOther : `border-transparent ${t.textMuted}`}`}>
                              <span className="font-bold">{c}:</span> {(r.corridas || {})[c] || 0}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={()=>editRule(r)} className={`p-2 rounded-lg transition ${t.btnEdit}`}><Edit3 size={16}/></button>
                        <button onClick={()=>setCalcRules(calcRules.filter(x=>x.id!==r.id))} className={`p-2 rounded-lg transition ${t.btnDanger}`}><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === PESTAÑA 3: PRESUPUESTO Y FORECAST === */}
        {activeTab === 'budget' && (
          <div className="space-y-6">
            
            <div className={`p-6 rounded-xl border ${t.card}`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h2 className={`text-xl font-bold flex items-center ${t.textMain}`}><Database className={`mr-3 ${t.textAccent1}`}/> Forecast y Curvas Mensuales (Importado)</h2>
                <div className="flex space-x-3">
                  <button onClick={handleLoadForecast} className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center transition bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg`}>
                    <Database size={16} className="mr-2" /> Extraer de Forecast
                  </button>
                  <label className={`cursor-pointer px-4 py-2.5 rounded-lg text-sm font-bold flex items-center transition ${t.btnGhost} shadow-lg`}>
                    <Upload size={16} className="mr-2" /> Importar Manual (.CSV)
                    <input type="file" accept=".csv" onChange={handleForecastCSVUpload} ref={forecastFileInputRef} className="hidden" />
                  </label>
                </div>
              </div>
              
              <div className={`overflow-x-auto rounded-xl border ${t.border}`}>
                <table className="w-full text-left text-sm border-collapse">
                  <thead className={`border-b ${t.tableHead}`}>
                    <tr>
                      <th className="p-4 font-bold uppercase tracking-wider text-xs">GOA</th>
                      <th className="p-4 text-right font-bold uppercase tracking-wider text-xs">Ppto OTB ($)</th>
                      <th className="p-4 text-right font-bold uppercase tracking-wider text-xs">Historia (Pzs)</th>
                      <th className="p-4 text-center font-bold uppercase tracking-wider text-xs bg-black/10 border-l border-black/10" colSpan="6">Curva Mensual % (Forecast)</th>
                    </tr>
                    <tr className={`text-[10px] uppercase ${t.textMuted} ${theme==='dark'?'bg-zinc-950/50':'bg-gray-100'}`}>
                      <th colSpan="3"></th>
                      <th className="p-2 text-center border-l border-black/10">Mes 1</th><th className="p-2 text-center">Mes 2</th><th className="p-2 text-center">Mes 3</th>
                      <th className="p-2 text-center">Mes 4</th><th className="p-2 text-center">Mes 5</th><th className="p-2 text-center">Mes 6</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${t.border} ${theme==='dark'?'bg-zinc-900':'bg-white'}`}>
                    {(goas || []).length === 0 && <tr><td colSpan="9" className={`p-8 text-center ${t.textMuted}`}>Aún no hay datos de forecast disponibles.</td></tr>}
                    {goas.map(g => (
                      <tr key={g.id} className={`transition ${t.tableRow}`}>
                        <td className={`p-4 font-bold ${t.textMain}`}>{g.name}</td>
                        <td className={`p-4 text-right font-black tracking-wide ${t.textAccent2}`}>${(g.budget || 0).toLocaleString()}</td>
                        <td className={`p-4 text-right font-bold ${t.textMuted}`}>{(g.historyPzs || 0).toLocaleString()} pzs</td>
                        {(g.months || [16.6,16.6,16.6,16.6,16.6,17]).map((m, i) => (
                           <td key={`mes-${g.id}-${i}`} className={`p-3 text-center text-xs font-mono border-l border-black/5 ${t.textMain}`}>{m}%</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* === PESTAÑA 4: COMPRAR PREVENTA REAL === */}
        {activeTab === 'assortment' && (
          <div className="space-y-6">
            
            {(goas || []).length === 0 ? (
              <EmptyState 
                icon={Package} title="Sin Presupuestos Base" 
                desc="Importa el Forecast en la pestaña 3 antes de capturar."
                action={<button onClick={()=>setActiveTab('budget')} className={`px-6 py-3 rounded-xl text-sm font-black uppercase transition ${t.btnPrimary}`}>Ir al paso 3</button>}
              />
            ) : (
              <>
                <div className={`rounded-xl shadow-lg p-6 relative overflow-hidden ${t.gradientCard}`}>
                  <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none ${theme==='dark'?'bg-purple-600/10':'bg-white/10'}`}></div>
                  <h2 className="text-xl font-bold mb-6 flex items-center relative z-10 text-white"><Zap className={`mr-3 ${t.textAccent2}`}/> Captura de Preventa (Real)</h2>
                  
                  <form onSubmit={handleGenerateBuy} className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end relative z-10">
                    <div>
                      <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>1. GOA</label>
                      <select required value={buyData.goaId} onChange={e=>setBuyData({...buyData, goaId: e.target.value})} className={`w-full p-3 rounded-lg outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white'}`}>
                        <option value="" className={theme==='dark'?'':'text-black'}>GOA...</option>
                        {goas.map(g => <option key={g.id} value={g.id} className={theme==='dark'?'':'text-black'}>{g.name}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>2. Modelo Exacto</label>
                      <input required type="text" placeholder="Ej. Modelo" value={buyData.modelo} onChange={e=>setBuyData({...buyData, modelo: e.target.value})} className={`w-full p-3 rounded-lg outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white placeholder-blue-200'}`} />
                    </div>
                    <div>
                      <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>3. PVP Unitario ($)</label>
                      <input required type="number" placeholder="Ej. 299" value={buyData.pvp} onChange={e=>setBuyData({...buyData, pvp: e.target.value})} className={`w-full p-3 rounded-lg font-bold outline-none border ${theme==='dark'? t.inputYellow : 'bg-white/20 border-white/30 text-white placeholder-blue-200'}`} />
                    </div>
                    <div className={`col-span-1 md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-5 mt-2 border-t pt-6 ${theme==='dark'?'border-zinc-800':'border-white/20'}`}>
                      <div>
                        <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>4. Curva de Tallas</label>
                        <select required value={buyData.curveId} onChange={e=>setBuyData({...buyData, curveId: e.target.value})} className={`w-full p-3 rounded-lg outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white'}`}>
                          <option value="" className={theme==='dark'?'':'text-black'}>Curva...</option>
                          {sizeCurves.map(c => <option key={c.id} value={c.id} className={theme==='dark'?'':'text-black'}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>5. Regla Clúster</label>
                        <select required value={buyData.ruleId} onChange={e=>setBuyData({...buyData, ruleId: e.target.value})} className={`w-full p-3 rounded-lg outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white'}`}>
                          <option value="" className={theme==='dark'?'':'text-black'}>Regla...</option>
                          {calcRules.map(r => <option key={r.id} value={r.id} className={theme==='dark'?'':'text-black'}>{r.name}</option>)}
                        </select>
                      </div>
                      <button type="submit" className={`w-full h-12 self-end font-black uppercase tracking-wider rounded-lg transition flex justify-center items-center ${theme==='dark'? t.btnPrimary : 'bg-yellow-400 text-indigo-900 hover:bg-yellow-300 shadow-xl'}`}>
                        <Calculator size={18} className="mr-2" /> Agregar al Carrito
                      </button>
                    </div>
                  </form>
                </div>

                <div className={`rounded-xl border overflow-hidden shadow-lg ${t.card}`}>
                  <div className={`p-4 border-b flex justify-between items-center ${t.cardInner}`}>
                    <h3 className={`font-bold uppercase tracking-wider text-sm ${t.textMain}`}>Base de Compras Reales Generadas ({(purchases || []).length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className={`text-xs uppercase border-b tracking-wider ${t.tableHead}`}>
                        <tr>
                          <th className={`p-4 border-r ${t.border}`}>GOA</th>
                          <th className={`p-4 border-r ${t.border}`}>Modelo Exacto</th>
                          <th className={`p-4 border-r ${t.border}`}>Estrategia</th>
                          <th className={`p-4 border-r text-center ${t.border}`}>PVP</th>
                          <th className={`p-4 border-r text-center font-bold ${t.border} ${t.textMain}`}>Total Pzs</th>
                          <th className={`p-4 border-r text-right font-bold ${t.border} ${t.textMain}`}>Costo Total $</th>
                          <th className="p-4"></th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {(purchases || []).length === 0 && <tr><td colSpan="7" className={`p-10 text-center ${t.textMuted}`}>No hay compras reales registradas aún.</td></tr>}
                        {(purchases || []).map(p => (
                          <tr key={p.id} className={`transition ${t.tableRow}`}>
                            <td className={`p-4 border-r ${t.border} ${t.textMuted}`}>{p.goaName}</td>
                            <td className={`p-4 font-bold border-r ${t.border} ${t.textMain}`}>{p.modelo}</td>
                            <td className={`p-4 text-xs border-r ${t.border} ${t.textMuted}`}><span className={`font-bold ${t.textAccent1}`}>{p.ruleName}</span><br/>{p.curveName}</td>
                            <td className={`p-4 text-center border-r ${t.border} ${t.textMuted}`}>${p.pvp}</td>
                            <td className={`p-4 text-center font-black border-r ${t.border} ${t.textMain} ${theme==='dark'?'bg-purple-900/10':'bg-blue-50/50'}`}>{(p.totalPieces || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right font-black border-r ${t.border} ${t.textAccent2} ${theme==='dark'?'bg-yellow-900/10':'bg-indigo-50/50'}`}>${(p.totalRetailValue || 0).toLocaleString()}</td>
                            <td className="p-4 text-center"><button onClick={()=>setPurchases(purchases.filter(x=>x.id!==p.id))} className={`transition ${t.btnDanger} p-2 rounded-lg`}><Trash2 size={18}/></button></td>
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

        {/* === PESTAÑA 5: REPORTES E INTELIGENCIA === */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            
            {(goas || []).length === 0 ? (
               <EmptyState 
                 icon={Compass} title="Aún no hay Presupuestos" 
                 desc="Importa el Forecast de GO PLANNER en la pestaña 3."
                 action={<button onClick={()=>setActiveTab('budget')} className={`px-6 py-3 rounded-xl text-sm font-black uppercase transition ${t.btnPrimary}`}>Ir al paso 3</button>}
               />
            ) : (
               <>
                {/* SWITCHER DE VISTA */}
                <div className={`flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl shadow-lg border ${t.card}`}>
                  <div>
                    <h2 className={`text-lg font-black uppercase tracking-wider ${t.textMain}`}>Panel de Inteligencia OTB</h2>
                    <p className={`text-xs mt-1 ${t.textMuted}`}>Proyección de matrices y curvas de entrega.</p>
                  </div>
                  <div className={`flex p-1.5 rounded-xl border mt-4 sm:mt-0 ${theme==='dark'?'bg-zinc-950 border-zinc-800':'bg-gray-100 border-gray-200'}`}>
                    <button onClick={()=>setReportView('sugerido')} className={`flex items-center px-6 py-2.5 rounded-lg text-sm transition-all ${reportView==='sugerido' ? t.toggleActive : t.toggleInactive}`}>
                      <Compass size={16} className="mr-2" /> 1. Forecast Sugerido
                    </button>
                    <button onClick={()=>setReportView('preventa')} className={`flex items-center px-6 py-2.5 rounded-lg text-sm transition-all ${reportView==='preventa' ? t.toggleActive : t.toggleInactive}`}>
                      <Activity size={16} className="mr-2" /> 2. Preventa Real
                    </button>
                  </div>
                </div>

                {/* SECCIÓN SUGERIDO: CONSTRUCTOR DE MODELOS */}
                {reportView === 'sugerido' && (
                  <div className={`rounded-xl border shadow-lg overflow-hidden ${t.card}`}>
                    <div className={`p-5 border-b flex items-center justify-between ${t.cardInner}`}>
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg mr-4 ${t.iconAccent2}`}><Lightbulb size={24} /></div>
                        <div>
                          <h2 className={`text-lg font-bold ${t.textMain}`}>Planeación de Assortment (Sugerido)</h2>
                          <p className={`text-xs mt-1 ${t.textMuted}`}>Crea "combos" de compras por GOA.</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-8">
                      {goas.map(goa => {
                        const goaPlans = (suggestedPlans || []).filter(p => p.goaId === goa.id);
                        let goaPzs = 0; let goaSpent = 0;
                        goaPlans.forEach(plan => {
                          const pzs = getPiecesForOneModel(goa.name, plan.curveId, plan.ruleId);
                          goaPzs += (pzs * (Number(plan.models) || 0));
                          goaSpent += (pzs * (Number(plan.models) || 0) * (Number(plan.pvp) || 0));
                        });
                        const diffHist = goaPzs - (goa.historyPzs || 0);
                        const otbRestante = (goa.budget || 0) - goaSpent;

                        return (
                          <div key={goa.id} className={`rounded-xl border overflow-hidden ${theme==='dark'?'border-zinc-800 bg-zinc-950':'border-gray-200 bg-white shadow-sm'}`}>
                            <div className={`p-4 flex justify-between items-center border-b ${theme==='dark'?'border-zinc-800 bg-zinc-900/50':'border-gray-200 bg-gray-50'}`}>
                              <div>
                                <h3 className={`font-black text-lg tracking-wide ${t.textMain}`}>{goa.name}</h3>
                                <p className={`text-xs font-bold mt-1 ${t.textMuted}`}>Ppto Inicial: <span className={t.textAccent2}>${(goa.budget || 0).toLocaleString()}</span> | Hist: {(goa.historyPzs || 0).toLocaleString()} pzs</p>
                              </div>
                              <div className="flex gap-4 text-right">
                                <div>
                                  <p className={`text-[10px] uppercase font-bold ${t.textMuted}`}>OTB Disponible</p>
                                  <p className={`text-lg font-black ${otbRestante >= 0 ? t.successText : t.dangerText}`}>${otbRestante.toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className={`text-[10px] uppercase font-bold ${t.textMuted}`}>Pzs Planeadas</p>
                                  <p className={`text-lg font-black ${diffHist >= 0 ? t.successText : t.dangerText}`}>{goaPzs.toLocaleString()} <span className="text-[10px]">({diffHist > 0 ? '+':''}{diffHist})</span></p>
                                </div>
                              </div>
                            </div>

                            <div className="p-4">
                              {goaPlans.length > 0 ? (
                                <table className="w-full text-sm text-left">
                                  <thead className={`text-[10px] uppercase tracking-wider ${t.textMuted}`}>
                                    <tr>
                                      <th className="pb-2">Estrategia</th>
                                      <th className="pb-2 text-center w-32">Automático</th>
                                      <th className="pb-2 w-24 text-center">Modelos</th>
                                      <th className="pb-2 w-24 text-center">PVP ($)</th>
                                      <th className="pb-2 text-right">Total Pzs</th>
                                      <th className="pb-2 text-right">Inversión</th>
                                      <th className="pb-2"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="space-y-2">
                                    {goaPlans.map(plan => {
                                      const singleModelPzs = getPiecesForOneModel(goa.name, plan.curveId, plan.ruleId);
                                      const totalPzs = singleModelPzs * (Number(plan.models) || 0);
                                      const totalCost = totalPzs * (Number(plan.pvp) || 0);
                                      
                                      return (
                                        <tr key={plan.id} className={`group ${theme==='dark'?'bg-black':'bg-gray-50'} rounded-lg border-b border-transparent hover:border-zinc-800`}>
                                          <td className="py-2 pr-2">
                                            <div className="flex space-x-2">
                                              <select value={plan.curveId} onChange={e=>handleUpdateSuggestion(plan.id, 'curveId', e.target.value)} className={`w-1/2 p-2 rounded text-xs outline-none ${t.input}`}>
                                                <option value="">Curva...</option>{sizeCurves.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                                              </select>
                                              <select value={plan.ruleId} onChange={e=>handleUpdateSuggestion(plan.id, 'ruleId', e.target.value)} className={`w-1/2 p-2 rounded text-xs outline-none ${t.input}`}>
                                                <option value="">Regla...</option>{calcRules.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                                              </select>
                                            </div>
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            <button onClick={()=>handleAutoSuggest(plan.id)} className={`px-2 py-1.5 rounded text-[10px] uppercase font-black tracking-widest transition flex items-center justify-center w-full shadow-sm ${t.btnPrimary}`}>
                                              <Wand2 size={12} className="mr-1"/> Resolver
                                            </button>
                                          </td>
                                          <td className="py-2 px-2"><input type="number" min="1" value={plan.models} onChange={e=>handleUpdateSuggestion(plan.id, 'models', e.target.value)} className={`w-full p-2 rounded text-xs text-center font-bold outline-none ${t.input}`} /></td>
                                          <td className="py-2 px-2"><input type="number" value={plan.pvp} onChange={e=>handleUpdateSuggestion(plan.id, 'pvp', e.target.value)} placeholder="0.00" className={`w-full p-2 rounded text-xs font-bold text-center outline-none ${t.inputYellow}`} /></td>
                                          
                                          <td className={`py-2 px-2 text-right font-bold ${t.textMain}`}>{totalPzs > 0 ? totalPzs.toLocaleString() : '-'}</td>
                                          <td className={`py-2 px-2 text-right font-bold ${t.textAccent2}`}>{totalCost > 0 ? `$${totalCost.toLocaleString()}` : '-'}</td>
                                          <td className="py-2 pl-2 text-right"><button onClick={()=>removeSuggestion(plan.id)} className={`p-1.5 rounded transition opacity-0 group-hover:opacity-100 ${t.btnDanger}`}><Trash2 size={14}/></button></td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                 <p className={`text-sm italic text-center py-4 ${t.textMuted}`}>No hay estrategias en este GOA.</p>
                              )}
                              <button onClick={()=>handleAddSuggestion(goa.id)} className={`mt-3 w-full py-2.5 border border-dashed rounded-lg text-xs font-bold uppercase tracking-widest transition flex items-center justify-center ${theme==='dark'?'border-zinc-700 text-zinc-500 hover:text-purple-400 hover:border-purple-500':'border-gray-300 text-gray-400 hover:text-blue-500 hover:border-blue-300'}`}>
                                <Plus size={14} className="mr-1"/> Agregar Estrategia
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* TABLA 1 (SIEMPRE VISIBLE): OTB GENERAL */}
                <div className={`rounded-xl border shadow-lg p-6 mt-6 ${t.card}`}>
                  <h2 className={`text-lg font-bold mb-4 flex items-center ${t.textMain}`}>
                    <DollarSign className={`mr-3 ${t.textAccent2}`}/> 
                    Resumen OTB General ({reportView === 'sugerido' ? 'Sugerido' : 'Real'})
                  </h2>
                  <div className={`overflow-x-auto rounded-xl border ${t.border}`}>
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className={`text-xs uppercase border-b tracking-wider ${t.tableHead}`}>
                          <th className="p-4 font-bold">GOA</th>
                          <th className={`p-4 text-right border-l ${t.border}`}>Pzs {reportView === 'sugerido' ? 'Sugeridas' : 'Compradas'}</th>
                          <th className="p-4 text-right">Meta Historia</th>
                          <th className="p-4 text-right">Var. Historia</th>
                          <th className={`p-4 text-right border-l font-bold ${t.border} ${t.textMain}`}>$ {reportView === 'sugerido' ? 'Sugerido' : 'Invertido'}</th>
                          <th className={`p-4 text-right font-bold ${t.textMain}`}>Presupuesto ($)</th>
                          <th className={`p-4 text-right font-black ${t.textMain} ${theme==='dark'?'bg-purple-900/20':'bg-indigo-100'}`}>OTB Restante</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {reportData.goaMetrics.map(g => (
                          <tr key={g.id} className={`transition ${t.tableRow}`}>
                            <td className={`p-4 font-bold ${t.textMain}`}>{g.name}</td>
                            <td className={`p-4 text-right border-l font-bold ${t.border} ${t.textMain}`}>{(g.boughtPzs || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right ${t.textMuted}`}>{(g.historyPzs || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right font-bold ${g.historyDiff >= 0 ? t.successText : t.dangerText}`}>
                              {g.historyDiff > 0 ? '+' : ''}{(g.historyDiff || 0).toLocaleString()}
                            </td>
                            <td className={`p-4 text-right border-l font-bold ${t.border} ${t.textAccent2}`}>${(g.spentValue || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right ${t.textMuted}`}>${(g.budget || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right font-black ${g.otb >= 0 ? t.successBg : t.dangerBg}`}>${(g.otb || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* TABLA 2 (SIEMPRE VISIBLE): CURVA MENSUAL */}
                <div className={`rounded-xl border shadow-lg p-6 ${t.card}`}>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <div>
                      <h2 className={`text-lg font-bold flex items-center ${t.textMain}`}>
                        <CalendarDays className={`mr-3 ${t.textAccent1}`}/> Proyección de Entrega Mensual
                      </h2>
                      <p className={`text-xs mt-1 font-bold ${reportView==='sugerido'?t.textAccent2:t.textAccent1}`}>
                        Mostrando piezas {reportView==='sugerido'?'sugeridas':'reales'} distribuidas según GO Forecasting.
                      </p>
                    </div>
                  </div>

                  <div className={`overflow-x-auto rounded-xl border ${t.border}`}>
                    <table className="w-full text-center text-sm border-collapse">
                      <thead>
                        <tr className={`text-[10px] uppercase border-b tracking-wider ${t.tableHead}`}>
                          <th className={`p-3 font-bold text-left border-r ${t.border}`}>GOA</th>
                          <th className={`p-3 font-bold border-r ${t.border}`}>Total Pzs</th>
                          {[1,2,3,4,5,6].map((m, i) => (
                            <th key={`head-sug-m${i}`} className={`p-3 border-r ${t.border}`}>Mes {m}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {reportData.goaMetrics.map(g => (
                          <tr key={g.id} className={`transition ${t.tableRow}`}>
                            <td className={`p-3 font-bold text-left border-r ${t.border} ${t.textMain}`}>{g.name}</td>
                            <td className={`p-3 font-black border-r ${t.border} ${t.textAccent2}`}>{(g.boughtPzs || 0).toLocaleString()} pzs</td>
                            {(g.months || [16.6,16.6,16.6,16.6,16.6,17]).map((w, i) => (
                               <td key={`mes-sug-${g.id}-${i}`} className={`p-3 border-r font-medium ${t.border} ${theme==='dark'?'text-gray-300':'text-gray-700'}`}>
                                  <span className={`block text-[9px] mb-1 font-mono ${t.textMuted}`}>{w}%</span>
                                  {Math.round((g.boughtPzs || 0) * (w / 100)).toLocaleString()}
                               </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* TABLA 3 Y 4 (SIEMPRE VISIBLES): MATRICES Y ASSORTMENT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  <div className={`rounded-xl border shadow-lg p-6 max-h-[600px] overflow-y-auto custom-scrollbar ${t.card}`}>
                    <h2 className={`text-lg font-bold mb-4 flex items-center ${t.textMain}`}>
                      <Store className={`mr-3 ${t.textAccent1}`}/> 
                      Assortment por Tienda ({reportView === 'sugerido' ? 'Sugerido' : 'Real'})
                    </h2>
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className={`sticky top-0 z-10 shadow-sm border-b ${t.cardInner}`}>
                        <tr className={`text-[10px] font-bold uppercase tracking-wider ${t.textMuted}`}>
                          <th className="p-3">Centro</th>
                          <th className="p-3 text-center">Clústeres</th>
                          <th className="p-3 text-right">Total Pzs</th>
                          <th className="p-3 text-right">Valor Retail $</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {reportData.storeSummary.length === 0 && (
                          <tr><td colSpan="4" className={`p-8 text-center text-xs italic ${t.textMuted}`}>Aún no hay datos en esta vista.</td></tr>
                        )}
                        {reportData.storeSummary.map(s => {
                          if((s.storeTotalPzs || 0) === 0) return null;
                          return (
                            <tr key={s.id} className={`transition ${t.tableRow}`}>
                              <td className="p-3">
                                <p className={`font-bold ${t.textMain}`}>{s.name}</p>
                                <p className={`text-[10px] font-mono ${t.textMuted}`}>{s.centerCode}</p>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {Object.entries(s.clusters || {}).map(([goa, c]) => (
                                    <span key={`store-${s.id}-${goa}`} className={`text-[9px] px-1.5 py-0.5 rounded font-bold border
                                      ${c === activeClusters[0] ? t.badgeAA : 
                                        c === activeClusters[1] ? t.badgeA : 
                                        t.badgeOther}`} title={goa}>{c}</span>
                                  ))}
                                </div>
                              </td>
                              <td className={`p-3 text-right font-black ${t.textMain}`}>{(s.storeTotalPzs || 0).toLocaleString()}</td>
                              <td className={`p-3 text-right font-black ${t.textAccent2}`}>${(s.storeTotalValue || 0).toLocaleString()}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className={`rounded-xl border shadow-lg p-6 max-h-[600px] overflow-y-auto custom-scrollbar ${t.card}`}>
                    <h2 className={`text-lg font-bold mb-4 flex items-center ${t.textMain}`}>
                      <FileSpreadsheet className="mr-3 text-green-500"/> 
                      Matriz de Distribución ({reportView === 'sugerido' ? 'Sugerida' : 'Real'})
                    </h2>
                    
                    {Object.keys(reportData.matrixByGoa || {}).length === 0 || Object.values(reportData.matrixByGoa).every(d => d.reduce((acc, row) => acc + row.totalPzs, 0) === 0) ? (
                      <p className={`text-sm italic p-4 text-center ${t.textMuted}`}>No hay modelos suficientes para graficar la matriz en esta vista.</p>
                    ) : null}
                    
                    {Object.entries(reportData.matrixByGoa || {}).map(([goaName, data]) => {
                      const totalTiendas = data.reduce((acc, row) => acc + (row.numStores || 0), 0);
                      const totalPiezas = data.reduce((acc, row) => acc + (row.totalPzs || 0), 0);
                      
                      if(totalPiezas === 0) return null;

                      return (
                        <div key={`matriz-${goaName}`} className={`mb-8 border rounded-xl overflow-hidden shadow-sm ${t.border}`}>
                          <div className={`border-b p-3 font-black text-sm uppercase tracking-widest text-center flex justify-between items-center px-5 ${t.cardInner} ${t.textMain}`}>
                            <span className="w-1/3"></span><span className="w-1/3 text-center">{goaName}</span>
                            <span className="w-1/3 text-right"><span className={`text-[9px] px-2 py-1 rounded ${t.badgeOther}`}>{reportView==='sugerido'?'Proyectado':'Comprado'}</span></span>
                          </div>
                          <table className="w-full text-center text-sm border-collapse">
                            <thead>
                              <tr className={`text-[10px] font-bold uppercase tracking-wider border-b ${t.tableHead}`}>
                                <th className={`p-3 border-r ${t.border}`}>Cluster</th>
                                <th className={`p-3 border-r ${t.border}`}>Tiendas</th>
                                <th className={`p-3 border-r ${t.border}`}>Corridas x Tienda</th>
                                <th className={`p-3 font-black ${t.textMain} ${t.cardInner}`}>Total Pzs</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${t.border}`}>
                              {data.map(row => (
                                <tr key={`row-${row.cluster}`} className={`transition ${t.tableRow}`}>
                                  <td className={`p-3 font-black border-r ${t.border} ${row.cluster===activeClusters[0]?t.textAccent1:row.cluster===activeClusters[1]?t.textAccent2:t.textMuted}`}>{row.cluster}</td>
                                  <td className={`p-3 border-r ${t.border} ${t.textMuted}`}>{row.numStores}</td>
                                  <td className={`p-3 border-r font-bold ${t.border} ${theme==='dark'?'text-gray-300':'text-gray-700'}`}>{row.runsPorTienda}</td>
                                  <td className={`p-3 font-black ${t.textMain} ${theme==='dark'?'bg-zinc-950/50':'bg-gray-50'}`}>{(row.totalPzs || 0).toLocaleString()}</td>
                                </tr>
                              ))}
                              <tr className={`font-black border-t-2 ${theme==='dark'?'bg-purple-900/20 border-purple-500/30':'bg-indigo-50 border-indigo-200'}`}>
                                <td className={`p-3 border-r text-right uppercase text-xs tracking-wider ${theme==='dark'?'border-purple-500/20 text-purple-300':'border-indigo-200 text-indigo-700'}`}>Total</td>
                                <td className={`p-3 border-r ${theme==='dark'?'border-purple-500/20':'border-indigo-200'} ${t.textMain}`}>{totalTiendas}</td>
                                <td className={`p-3 border-r ${theme==='dark'?'border-purple-500/20':'border-indigo-200'} ${t.textMuted}`}>-</td>
                                <td className={`p-3 text-lg ${t.textAccent2}`}>{(totalPiezas || 0).toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>

                </div>
               </>
            )}
          </div>
        )}

      </main>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme === 'dark' ? '#3f3f46' : '#d1d5db'}; border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme === 'dark' ? '#52525b' : '#9ca3af'}; }`}} />
    </div>
  );
}

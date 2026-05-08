import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Store, Package, Upload, ArrowUpDown, Sliders, Layers, MoreVertical, Sun, Moon, Info, Map as MapIcon, Database, ShoppingCart, BarChart3, Plus, Trash2, Save, Download, Zap, DollarSign, Target, FileSpreadsheet, Edit3, Lightbulb, CalendarDays, Compass, Activity, Wand2, RefreshCw, ClipboardList, Calculator, ChevronDown, ChevronRight, LayoutList } from 'lucide-react';

// =====================================================================
// 1. IMPORT REAL (Descomenta esta línea en tu entorno local GO PLANNER)
import { useDispatch, useGlobal, globalActions } from '../context/GlobalContext';

// --- MOTOR INTELIGENTE PARA LEER CSV (Ignora comas dentro de comillas) ---
const parseCSV = (text) => {
  const separator = text.indexOf(';') > -1 ? ';' : (text.indexOf('\t') > -1 ? '\t' : ',');
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for(let i=0; i<line.length; i++) {
      const char = line[i];
      if(char === '"') {
        inQuotes = !inQuotes;
      } else if(char === separator && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  }).filter(row => row.length > 0 && row.some(cell => cell !== ""));
};

// --- COMPONENTES AUXILIARES ---
function TabButton({ id, label, icon: Icon, activeTab, setActiveTab, t }) {
  return (
    <button onClick={() => setActiveTab(id)} className={`flex items-center space-x-2 px-4 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === id ? t.tabActive : t.tabInactive}`}>
      <Icon size={18} /><span>{label}</span>
    </button>
  );
}

function EmptyState({ icon: Icon, title, desc, rules, action, theme, t }) {
  return (
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
      <div className="flex flex-wrap justify-center gap-4">{action}</div>
    </div>
  );
}

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const budgetFileInputRef = useRef(null);
  const forecastFileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('data');

  // --- ESTADOS PARA GUARDAR SESIÓN ---
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');

  // --- ESTADOS PARA ACORDEÓN DE REPORTES ---
  const [collapsedGoas, setCollapsedGoas] = useState({});

  // --- INTEGRACIÓN GLOBAL CONTEXT ---
  const gDispatch = useDispatch();
  const gState    = useGlobal();
  const theme = gState?.theme || 'dark'; 
  const forecastDisponible = !!gState?.forecastData;
  
  // =====================================================================
  // --- CARGA DE LOCALSTORAGE (PERSISTENCIA AL CAMBIAR DE MÓDULO) ---
  const initialState = useMemo(() => {
    try {
      const saved = localStorage.getItem('goplanner_assortment_state');
      if (saved) return JSON.parse(saved);
    } catch (e) { console.warn("No se pudo cargar la sesión de LocalStorage", e); }
    return null;
  }, []);

  // --- ESTADO DE BASE Y CLÚSTERES ---
  const [numClusters, setNumClusters] = useState(initialState?.numClusters ?? 6);
  const [clusterStrategy, setClusterStrategy] = useState(initialState?.clusterStrategy ?? 'valor'); 
  
  const activeClusters = useMemo(() => {
    if (numClusters === 6) return ['AA', 'A', 'B', 'C', 'D', 'E'];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({length: numClusters}, (_, i) => alphabet[i]);
  }, [numClusters]);

  const [rawStoreData, setRawStoreData] = useState(initialState?.rawStoreData ?? []);
  const [scoreWeights, setScoreWeights] = useState(initialState?.scoreWeights ?? { sales: 50, margin: 50, rotation: 0 });
  const [stores, setStores] = useState(initialState?.stores ?? []);
  const [goas, setGoas] = useState(initialState?.goas ?? []);
  
  const [storeSortBy, setStoreSortBy] = useState('score'); 
  const [storeSortOrder, setStoreSortOrder] = useState('desc');
  const [filterGoa, setFilterGoa] = useState('ALL'); 

  // --- CALCULADORAS Y COMPRAS ---
  const [sizeCurves, setSizeCurves] = useState(initialState?.sizeCurves ?? []);
  const [calcRules, setCalcRules] = useState(initialState?.calcRules ?? []);
  const [buckets, setBuckets] = useState(initialState?.buckets ?? []); 
  const [purchases, setPurchases] = useState(initialState?.purchases ?? []);
  const [modelCatalog, setModelCatalog] = useState(initialState?.modelCatalog ?? []);
  const [brandMatrix, setBrandMatrix] = useState(initialState?.brandMatrix ?? null); // { storeCode: { brand: 'Si'/'No' } }
  const catalogFileInputRef = useRef(null);
  const matrixFileInputRef = useRef(null);
  const [suggestedPlans, setSuggestedPlans] = useState(initialState?.suggestedPlans ?? []);
  // =====================================================================

  const [newCurve, setNewCurve] = useState({ name: '', sizes: '', weights: '' });
  const [editingCurveId, setEditingCurveId] = useState(null);
  
  const [newRule, setNewRule] = useState({ name: '' });
  const [editingRuleId, setEditingRuleId] = useState(null);

  const [newBucket, setNewBucket] = useState({ name: '', perfil: '', sharePct: '', pvpRange: '', notes: '' });
  const [editingBucketId, setEditingBucketId] = useState(null);

  const [buyData, setBuyData] = useState({ goaId: '', modelo: '', pvp: '', curveId: '', ruleId: '', bucketId: '', monthOffset: '' });
  const [purchaseMonthBase, setPurchaseMonthBase] = useState(() => {
    if (initialState?.purchaseMonthBase) return initialState.purchaseMonthBase;
    const d = new Date();
    return `${d.getFullYear()+1}-01`;
  });

  // --- Modal nivel alto chequera ---
  const [chequeraModal, setChequeraModal] = useState({ open: false, source: 'sugerido', seccion: '', marca: '' });
  const [reportView, setReportView] = useState('sugerido'); 

  // --- AUTO-GUARDADO A LOCALSTORAGE ---
  useEffect(() => {
    const stateToSave = { numClusters, clusterStrategy, rawStoreData, scoreWeights, stores, goas, sizeCurves, calcRules, buckets, purchases, suggestedPlans, purchaseMonthBase, modelCatalog, brandMatrix };
    localStorage.setItem('goplanner_assortment_state', JSON.stringify(stateToSave));
  }, [numClusters, clusterStrategy, rawStoreData, scoreWeights, stores, goas, sizeCurves, calcRules, buckets, purchases, suggestedPlans, purchaseMonthBase, modelCatalog, brandMatrix]);

  // --- PUBLICAR OTB AL GLOBAL CONTEXT ---
  useEffect(() => {
    const currentGoas = goas || [];
    const currentPurchases = purchases || [];
    const currentPlans = suggestedPlans || [];
    
    if (currentGoas.length > 0) {
      const totalBudget = currentGoas.reduce((s, g) => s + (Number(g.budget) || 0), 0);
      const totalSpent  = currentPurchases.reduce((s, p) => s + (Number(p.totalRetailValue) || 0), 0);
      
      if (globalActions && globalActions.publishOTB) {
        globalActions.publishOTB(gDispatch, {
          goas: currentGoas,
          purchases: currentPurchases,
          suggestedPlans: currentPlans,
          budget: totalBudget,
          spent:  totalSpent,
        });
      }
    }
  }, [goas, purchases, suggestedPlans, gDispatch]);


  // --- MOTOR DE TEMAS ---
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
  const t = themes[theme] || themes.dark;

  // --- HELPER: nombres de mes desde fecha base ---
  const MES_NAMES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const getMonthLabel = (offset) => {
    const [y, m] = (purchaseMonthBase || '2026-01').split('-').map(Number);
    const baseDate = new Date(y, (m||1)-1 + Number(offset), 1);
    return `${MES_NAMES_ES[baseDate.getMonth()]} ${String(baseDate.getFullYear()).slice(-2)}`;
  };

  // --- EXPORTAR / IMPORTAR PROYECTO ---
  const handleExportProject = () => {
    setIsSaveModalOpen(true);
    setSaveFileName(`GO_PLANNER_Assortment_${new Date().toISOString().slice(0,10)}`);
  };

  const confirmExportProject = () => {
    const data = { stores, goas, sizeCurves, calcRules, buckets, purchases, rawStoreData, scoreWeights, numClusters, clusterStrategy, suggestedPlans, purchaseMonthBase, modelCatalog, brandMatrix };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const finalName = saveFileName.endsWith('.json') ? saveFileName : `${saveFileName}.json`;
    link.download = finalName;
    link.click();
    setIsSaveModalOpen(false);
  };

  const handleImportProject = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if(Array.isArray(data.stores)) setStores(data.stores);
        if(Array.isArray(data.goas)) setGoas(data.goas);
        if(Array.isArray(data.sizeCurves)) setSizeCurves(data.sizeCurves);
        if(Array.isArray(data.calcRules)) setCalcRules(data.calcRules);
        if(Array.isArray(data.buckets)) setBuckets(data.buckets); 
        if(typeof data.purchaseMonthBase === 'string') setPurchaseMonthBase(data.purchaseMonthBase);
        if(Array.isArray(data.modelCatalog)) setModelCatalog(data.modelCatalog);
        if(data.brandMatrix && typeof data.brandMatrix === 'object') setBrandMatrix(data.brandMatrix);
        if(Array.isArray(data.purchases)) setPurchases(data.purchases);
        if(Array.isArray(data.rawStoreData)) setRawStoreData(data.rawStoreData);
        if(data.scoreWeights) setScoreWeights(data.scoreWeights);
        if(data.numClusters) setNumClusters(data.numClusters);
        if(data.clusterStrategy) setClusterStrategy(data.clusterStrategy);
        if(Array.isArray(data.suggestedPlans)) setSuggestedPlans(data.suggestedPlans);
        alert("¡Proyecto cargado con éxito!");
      } catch (err) { alert("Error al leer el archivo JSON."); }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  // --- DESCARGAR MATRIZ A EXCEL ---
  const handleDownloadMatrix = () => {
    if ((stores || []).length === 0) {
      alert("No hay tiendas para exportar.");
      return;
    }
    
    const allGoas = goas.map(g => g.name);
    let csv = "Centro,Nombre,Ventas (Pzs),Utilidad ($),Rotacion,Score Promedio,Cluster Global";
    allGoas.forEach(g => { csv += `,Cluster ${g}`; });
    csv += "\r\n";

    stores.forEach(s => {
      let row = `"${s.centerCode}","${s.name}",${s.sales},${s.margin},${s.rotation},${(s.score || 0).toFixed(2)},"${s.globalCluster || '-'}"`;
      allGoas.forEach(g => {
        const realKey = Object.keys(s.clusters || {}).find(k => k.toUpperCase() === g.toUpperCase());
        const clusterVal = realKey ? s.clusters[realKey] : 'Sin Asignar';
        row += `,"${clusterVal}"`;
      });
      csv += row + "\r\n";
    });

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); 
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Matriz_Tiendas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- LÓGICA DE CLUSTERIZACIÓN DINÁMICA ---
  const recalculateClusters = (rawData, weights, currentClusters, strategy, matrixOverride = undefined) => {
    if(!rawData || rawData.length === 0) return;
    // matrixOverride permite recibir matriz fresca antes del setState; si no, usa la del state
    const matrix = matrixOverride !== undefined ? matrixOverride : brandMatrix;
    // Filtrar filas según matriz: si hay matriz y la combinación tienda×marca dice "No" -> excluir
    const filteredRaw = matrix ? rawData.filter(row => {
      if (!row.marca) return true; // Sin marca, no se puede validar
      const storeMatrix = matrix[row.centro];
      if (!storeMatrix) return true; // Tienda no está en matriz, no excluir
      const brandUpper = String(row.marca).toUpperCase().trim();
      // Buscar match exacto o parcial
      let val = storeMatrix[brandUpper];
      if (val === undefined) {
        // Buscar por includes (la matriz puede tener nombres con espacios o variaciones)
        const matchKey = Object.keys(storeMatrix).find(k => k === brandUpper || k.includes(brandUpper) || brandUpper.includes(k));
        if (matchKey) val = storeMatrix[matchKey];
      }
      return val !== 'No'; // Si dice 'No' la excluyo; cualquier otro valor o ausencia la mantengo
    }) : rawData;

    const dataByGoa = {};
    const storeMap = new Map();
    const pvpByGoa = {};

    filteredRaw.forEach(row => {
      if (!storeMap.has(row.centro)) {
        storeMap.set(row.centro, { 
          id: row.centro, centerCode: row.centro, name: row.name, 
          sales: 0, margin: 0, rotation: 0, score: 0, 
          clusters: {}, globalCluster: '-', 
          goaCount: 0, totalScoreAcum: 0,
          // Métricas detalladas por GOA
          goaMetrics: {}, // { goaName: { sales, margin, rotation, score } }
          // Marcas presentes
          brands: new Set(),
          // Acumuladores para promedio ponderado
          _marginWeightedSum: 0, _rotationCount: 0
        });
      }
      
      // Agregación por GOA-Tienda (sumar ventas, ponderar margin)
      if (!dataByGoa[row.goa]) dataByGoa[row.goa] = {};
      if (!dataByGoa[row.goa][row.centro]) {
        dataByGoa[row.goa][row.centro] = { sales: 0, marginWeightedSum: 0, rotation: 0, count: 0, brands: new Set() };
      }
      
      const sg = dataByGoa[row.goa][row.centro];
      sg.sales += row.sales;
      sg.marginWeightedSum += row.margin * row.sales; // margin × ventas (peso)
      sg.rotation += row.rotation;
      sg.count += 1;
      if (row.marca) sg.brands.add(row.marca);

      // Agregación a nivel TIENDA (suma ventas, margin ponderado por ventas)
      const s = storeMap.get(row.centro);
      s.sales += row.sales;
      s._marginWeightedSum += row.margin * row.sales;
      s.rotation += row.rotation;
      s._rotationCount += 1;
      if (row.marca) s.brands.add(row.marca);

      // PVP ponderado por GOA (a nivel global, todos los stores)
      if (row.pvp > 0 && row.sales > 0) {
        if (!pvpByGoa[row.goa]) pvpByGoa[row.goa] = { totalSales: 0, weightedPvp: 0 };
        pvpByGoa[row.goa].totalSales += row.sales;
        pvpByGoa[row.goa].weightedPvp += row.pvp * row.sales;
      }
    });

    // Calcular margin% ponderado a nivel tienda
    storeMap.forEach(s => {
      s.margin = s.sales > 0 ? s._marginWeightedSum / s.sales : 0;
      s.rotation = s._rotationCount > 0 ? s.rotation / s._rotationCount : 0;
      s.brands = Array.from(s.brands);
    });

    Object.keys(dataByGoa).forEach(goaName => {
      const storesInGoa = Object.keys(dataByGoa[goaName]).map(centroId => {
        const d = dataByGoa[goaName][centroId];
        const marginPct = d.sales > 0 ? d.marginWeightedSum / d.sales : 0;
        return { 
          centro: centroId, sales: d.sales, margin: marginPct, 
          rotation: d.count > 0 ? d.rotation / d.count : 0,
          brands: Array.from(d.brands)
        };
      });

      let maxSales = 0, maxMargin = 0, maxRot = 0;
      storesInGoa.forEach(item => {
        if (item.sales > maxSales) maxSales = item.sales;
        if (item.margin > maxMargin) maxMargin = item.margin;
        if (item.rotation > maxRot) maxRot = item.rotation;
      });

      storesInGoa.forEach(item => {
        const nSales = maxSales > 0 ? item.sales / maxSales : 0;
        const nMargin = maxMargin > 0 ? item.margin / maxMargin : 0;
        const nRot = maxRot > 0 ? item.rotation / maxRot : 0;
        item.score = (nSales * weights.sales) + (nMargin * weights.margin) + (nRot * weights.rotation);
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
        if(store) {
          store.clusters[goaName] = currentClusters[clusterIndex];
          store.totalScoreAcum += item.score;
          store.goaCount += 1;
          store.score = store.totalScoreAcum / store.goaCount;
          // Persistir métricas por GOA en la tienda
          store.goaMetrics[goaName] = {
            sales: item.sales,
            margin: item.margin,
            rotation: item.rotation,
            score: item.score,
            cluster: currentClusters[clusterIndex],
            brands: item.brands
          };
        }
      });

      setGoas(prev => {
        if (!(prev || []).find(g => g.name.toUpperCase() === goaName)) {
          const formatted = goaName.charAt(0).toUpperCase() + goaName.slice(1).toLowerCase();
          // Calcular PVP default ponderado
          const pvpData = pvpByGoa[goaName];
          const defaultPvp = pvpData && pvpData.totalSales > 0 ? Math.round(pvpData.weightedPvp / pvpData.totalSales) : 0;
          return [...(prev || []), { id: Date.now() + Math.random(), name: formatted, budget: 0, historyPzs: 0, defaultPvp, months: [16.6, 16.6, 16.6, 16.6, 16.6, 17] }];
        }
        // Si el GOA ya existía, actualizar PVP solo si está en 0
        const pvpData = pvpByGoa[goaName];
        if (pvpData && pvpData.totalSales > 0) {
          return prev.map(g => {
            if (g.name.toUpperCase() === goaName && (!g.defaultPvp || g.defaultPvp === 0)) {
              return { ...g, defaultPvp: Math.round(pvpData.weightedPvp / pvpData.totalSales) };
            }
            return g;
          });
        }
        return prev || [];
      });
    });

    // 3. CALCULAR CLÚSTER GLOBAL PARA LA TIENDA
    const finalStores = Array.from(storeMap.values());
    finalStores.sort((a, b) => b.score - a.score);
    const totalS = finalStores.length;
    const maxSScore = totalS > 0 ? finalStores[0].score : 1;
    const numClust = currentClusters.length;

    finalStores.forEach((store, index) => {
      const percentile = index / totalS;
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
            if (percentile <= threshold) { clusterIndex = i; assigned = true; break; }
          }
          if(!assigned) clusterIndex = numClust - 1;
        }
      } else if (strategy === 'lineal') {
        clusterIndex = Math.min(Math.floor(percentile * numClust), numClust - 1);
      } else if (strategy === 'valor') {
        const scoreRatio = store.score / maxSScore; 
        const invertedPercentile = 1.0 - scoreRatio; 
        clusterIndex = Math.min(Math.floor(invertedPercentile * numClust), numClust - 1);
      }
      
      store.globalCluster = currentClusters[clusterIndex];
    });

    setStores(finalStores);
  };

  useEffect(() => {
    if ((rawStoreData || []).length > 0) recalculateClusters(rawStoreData, scoreWeights, activeClusters, clusterStrategy);
  }, [scoreWeights, activeClusters, clusterStrategy, brandMatrix]);

  // --- CARGA DE DATOS DESDE CONTEXT GLOBAL ---
  const handleLoadForecastFromContext = () => {
    if (forecastDisponible && gState?.forecastData?.brands) {
      const newGoas = gState.forecastData.brands.map((b, i) => {
        let parsedMonths = [16.6, 16.6, 16.6, 16.6, 16.6, 17];
        if (Array.isArray(b.months)) {
           parsedMonths = b.months.map(m => {
              if (typeof m === 'object' && m !== null) return Number(m.value || m.porcentaje || 0);
              return Number(m) || 0;
           });
        }
        return {
          id: Date.now() + i,
          name: String(b.name || b.brand || `GOA ${i+1}`),
          budget: Number(b.budget) || 0,
          historyPzs: Number(b.historyPzs) || 0,
          months: parsedMonths
        };
      });
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
    const processText = (text) => {
      const cleanText = text.replace(/^\uFEFF/, '');
      const rows = parseCSV(cleanText);
      if (rows.length < 2) { if(fileInputRef.current) fileInputRef.current.value = ''; return; }

      const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').trim().toUpperCase());
      const idxCentro = headers.findIndex(h => h === 'CENTRO' || h === 'ID');
      const idxNombre = headers.findIndex(h => h === 'NOMBRE' || h === 'TIENDA' || h === 'DESC CENTRO');
      const idxGoa = headers.findIndex(h => h === 'GOA' || h === 'FAMILIA');
      const idxMarca = headers.findIndex(h => h === 'MARCA' || h === 'BRAND');
      const idxVentas = headers.findIndex(h => h === 'VENTAS' || h === 'VTA' || h.includes('VTAS. $') || h.includes('UNIDADES'));
      const idxMargen = headers.findIndex(h => h === 'MARGEN' || h === 'MG' || h.includes('%GM') || h.includes('UTILIDAD'));
      const idxRotacion = headers.findIndex(h => h === 'ROTACION' || h === 'ROT' || h.includes('SELL'));
      const idxPvp = headers.findIndex(h => h === 'PVP' || h === 'PRECIO');

      if (idxCentro === -1 || idxGoa === -1 || idxVentas === -1) {
        alert(`Error de Formato CSV.\n\nSe detectaron las siguientes columnas: [${headers.join(', ')}]\nSe requieren al menos: Centro, GOA, Ventas.`); 
        return;
      }

      const cleanNum = (v) => v ? parseFloat(String(v).replace(/[^0-9.\-]+/g, "")) || 0 : 0;

      const extractedRawData = [];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i] || !rows[i][idxCentro] || !rows[i][idxGoa]) continue;
        extractedRawData.push({
          centro: String(rows[i][idxCentro]).trim(),
          name: idxNombre !== -1 ? rows[i][idxNombre] : rows[i][idxCentro],
          goa: String(rows[i][idxGoa]).toUpperCase().trim(),
          marca: idxMarca !== -1 ? String(rows[i][idxMarca] || '').trim() : '',
          sales: cleanNum(rows[i][idxVentas]),
          margin: cleanNum(idxMargen !== -1 ? rows[i][idxMargen] : 0),
          rotation: cleanNum(idxRotacion !== -1 ? rows[i][idxRotacion] : 1),
          pvp: cleanNum(idxPvp !== -1 ? rows[i][idxPvp] : 0)
        });
      }
      
      setGoas([]);
      setStores([]);
      setRawStoreData(extractedRawData);
      recalculateClusters(extractedRawData, scoreWeights, activeClusters, clusterStrategy);
    };
    // Probar UTF-8 primero, si truena con caracteres extraños, intentar latin1
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        // Si hay muchos caracteres de reemplazo (), reintentar como latin1
        if ((text.match(/\uFFFD/g) || []).length > 5) {
          const r2 = new FileReader();
          r2.onload = (ev) => processText(ev.target.result);
          r2.readAsText(file, 'ISO-8859-1');
        } else {
          processText(text);
        }
      } catch (err) { alert("Error procesando CSV: " + err.message); }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleBrandMatrixUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    const processMatrix = (text) => {
      try {
        const cleanText = text.replace(/^\uFEFF/, '');
        const rows = parseCSV(cleanText);
        if (rows.length < 4) { alert("Matriz inválida: se esperan al menos 4 filas (título, códigos, nombres, datos)."); return; }

        // Detectar fila de códigos: primera fila con muchos números en las columnas posteriores
        let codeRowIdx = -1;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const numCount = rows[i].slice(5).filter(c => c && /^\d+$/.test(String(c).trim())).length;
          if (numCount > 10) { codeRowIdx = i; break; }
        }
        if (codeRowIdx === -1) { alert("No se encontró fila con códigos de tienda. La matriz debe tener una fila con números (491, 492...) como columnas."); return; }

        const codeRow = rows[codeRowIdx];
        // Detectar columna inicial donde empiezan los códigos
        let firstCodeCol = -1;
        for (let c = 0; c < codeRow.length; c++) {
          if (codeRow[c] && /^\d+$/.test(String(codeRow[c]).trim())) { firstCodeCol = c; break; }
        }
        if (firstCodeCol === -1) { alert("No se pudo detectar dónde inician los códigos."); return; }

        // Header de columnas con los nombres de las marcas. Buscamos el header con "Marca" o "Nom_Marca"
        let headerRowIdx = -1;
        for (let i = 0; i < codeRowIdx; i++) {
          if (rows[i].some(c => String(c).toLowerCase().trim() === 'marca' || String(c).toLowerCase().trim() === 'nom_marca')) {
            headerRowIdx = i; break;
          }
        }
        // Si no la encontramos antes, buscamos después
        if (headerRowIdx === -1) {
          for (let i = codeRowIdx; i < Math.min(codeRowIdx+3, rows.length); i++) {
            if (rows[i].some(c => String(c).toLowerCase().trim() === 'marca' || String(c).toLowerCase().trim() === 'nom_marca')) {
              headerRowIdx = i; break;
            }
          }
        }

        let brandColIdx = -1;
        if (headerRowIdx !== -1) {
          // Preferir Nom_Marca sobre Marca
          brandColIdx = rows[headerRowIdx].findIndex(c => String(c).toLowerCase().trim() === 'nom_marca');
          if (brandColIdx === -1) brandColIdx = rows[headerRowIdx].findIndex(c => String(c).toLowerCase().trim() === 'marca');
        }
        if (brandColIdx === -1) brandColIdx = 5; // default según la estructura observada

        // Construir mapa { centerCode: { brandName: 'Si'|'No' } }
        const matrix = {};
        const dataStartRow = (headerRowIdx !== -1 ? headerRowIdx : codeRowIdx) + 1;
        for (let i = dataStartRow; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !r[brandColIdx]) continue;
          const brandName = String(r[brandColIdx]).trim().toUpperCase();
          if (!brandName) continue;
          for (let c = firstCodeCol; c < codeRow.length; c++) {
            const code = codeRow[c] ? String(codeRow[c]).trim() : '';
            if (!code) continue;
            const value = r[c] ? String(r[c]).trim().toLowerCase() : '';
            if (!matrix[code]) matrix[code] = {};
            // Normalizar: 'si','sí','yes','1' = Si; cualquier otro no vacío = No; vacío = No
            const normalized = (value === 'si' || value === 'sí' || value === 'yes' || value === '1') ? 'Si' : 'No';
            matrix[code][brandName] = normalized;
          }
        }

        const totalStores = Object.keys(matrix).length;
        const totalBrands = new Set();
        Object.values(matrix).forEach(b => Object.keys(b).forEach(k => totalBrands.add(k)));
        if (totalStores === 0) { alert("La matriz se cargó pero no tiene tiendas válidas."); return; }
        setBrandMatrix(matrix);
        alert(`Matriz cargada: ${totalStores} tiendas × ${totalBrands.size} marcas.\nLas tiendas marcadas con "No" serán excluidas al hacer cluster por GOA.`);
        // Recalcular clusters si ya hay datos
        if ((rawStoreData || []).length > 0) recalculateClusters(rawStoreData, scoreWeights, activeClusters, clusterStrategy, matrix);
      } catch (err) {
        alert("Error al procesar matriz: " + err.message);
      }
    };
    reader.onload = (event) => {
      const text = event.target.result;
      if ((text.match(/\uFFFD/g) || []).length > 5) {
        const r2 = new FileReader();
        r2.onload = (ev) => processMatrix(ev.target.result);
        r2.readAsText(file, 'ISO-8859-1');
      } else {
        processMatrix(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleUpdateStoreCluster = (storeId, goaName, newCluster) => {
    setStores((stores || []).map(s => s.id === storeId ? { ...s, clusters: { ...(s.clusters || {}), [goaName]: newCluster } } : s));
  };

  const handleUpdateGoaField = (goaId, field, value, monthIndex = null) => {
    setGoas(prev => prev.map(g => {
      if (g.id === goaId) {
        if (monthIndex !== null) {
          const newMonths = [...g.months];
          newMonths[monthIndex] = Number(value) || 0;
          return { ...g, months: newMonths };
        }
        return { ...g, [field]: Number(value) || 0 };
      }
      return g;
    }));
  };

  const handleBudgetCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result.replace(/^\uFEFF/, '');
      const rows = parseCSV(text);
      if (rows.length < 2) { if(budgetFileInputRef.current) budgetFileInputRef.current.value = ''; return; }
      
      const newGoas = [];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        newGoas.push({ 
          id: Date.now() + i, name: String(rows[i][0]), 
          budget: parseFloat(String(rows[i][1]).replace(/[^0-9.-]+/g, '')) || 0, 
          historyPzs: parseInt(String(rows[i][2]).replace(/[^0-9.-]+/g, '')) || 0,
          months: [16.6, 16.6, 16.6, 16.6, 16.6, 17] 
        });
      }
      setGoas(newGoas);
      alert("Presupuestos Básicos actualizados.");
      if(budgetFileInputRef.current) budgetFileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleForecastCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result.replace(/^\uFEFF/, '');
      const rows = parseCSV(text);
      if (rows.length < 2) { if(forecastFileInputRef.current) forecastFileInputRef.current.value = ''; return; }
      
      const newGoas = [];
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        const m1 = parseFloat(String(rows[i][3]).replace(/[^0-9.-]+/g, '')) || 16.6; 
        const m2 = parseFloat(String(rows[i][4]).replace(/[^0-9.-]+/g, '')) || 16.6;
        const m3 = parseFloat(String(rows[i][5]).replace(/[^0-9.-]+/g, '')) || 16.6; 
        const m4 = parseFloat(String(rows[i][6]).replace(/[^0-9.-]+/g, '')) || 16.6;
        const m5 = parseFloat(String(rows[i][7]).replace(/[^0-9.-]+/g, '')) || 16.6; 
        const m6 = parseFloat(String(rows[i][8]).replace(/[^0-9.-]+/g, '')) || 17.0;

        newGoas.push({ 
          id: Date.now() + i, name: String(rows[i][0]), 
          budget: parseFloat(String(rows[i][1]).replace(/[^0-9.-]+/g, '')) || 0, 
          historyPzs: parseInt(String(rows[i][2]).replace(/[^0-9.-]+/g, '')) || 0,
          months: [m1, m2, m3, m4, m5, m6]
        });
      }
      setGoas(newGoas);
      alert("Forecast y Presupuestos Mensuales importados desde CSV con éxito.");
      if(forecastFileInputRef.current) forecastFileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  // --- CRUD CALCULADORAS Y BUCKETS ---
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
    (activeClusters || []).forEach(c => editObj[c] = (r.corridas || {})[c] || 0);
    setNewRule(editObj); setEditingRuleId(r.id); 
  };

  const handleBucketSubmit = (e) => {
    e.preventDefault();
    if (!newBucket.name) return;
    const bucketObj = { 
      id: editingBucketId || Date.now(), 
      name: newBucket.name,
      perfil: newBucket.perfil || '',
      sharePct: Number(newBucket.sharePct) || 0,
      pvpRange: newBucket.pvpRange || '',
      notes: newBucket.notes || ''
    };
    if (editingBucketId) { setBuckets((buckets || []).map(b => b.id === editingBucketId ? bucketObj : b)); setEditingBucketId(null); } 
    else setBuckets([...(buckets || []), bucketObj]);
    setNewBucket({ name: '', perfil: '', sharePct: '', pvpRange: '', notes: '' });
  };
  const editBucket = (b) => { 
    setNewBucket({ name: b.name, perfil: b.perfil || '', sharePct: b.sharePct || '', pvpRange: b.pvpRange || '', notes: b.notes || '' }); 
    setEditingBucketId(b.id); 
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

    const bucket = (buckets || []).find(b => b.id === Number(buyData.bucketId));
    const monthOffset = buyData.monthOffset !== '' ? Number(buyData.monthOffset) : null;

    setPurchases([...(purchases || []), {
      id: Date.now(), goaId: goa.id, goaName: goa.name, modelo: String(modelo).toUpperCase(),
      pvp: Number(pvp), curveId: curve.id, curveName: curve.name, ruleId: rule.id, ruleName: rule.name,
      bucketId: bucket ? bucket.id : null, bucketName: bucket ? bucket.name : null,
      monthOffset, monthLabel: monthOffset !== null ? getMonthLabel(monthOffset) : null,
      totalPieces, totalRetailValue: totalPieces * Number(pvp), storeDemands
    }]);
    setBuyData({ ...buyData, modelo: '', pvp: '' });
  };

  // --- CATÁLOGO DE MODELOS (Tab 4) ---
  const downloadCatalogTemplate = () => {
    const headers = "GOA,Modelo,Descripcion,Bucket,PVP,Costo,Margen,MesCompra,Curva,Regla,Variantes,Notas";
    const sample = [
      `"Ejemplo GOA","JEANS_001","Skinny tiro alto","Chava Trendy",499,180,63.9,"Ene 27","CURVA_DAMAS","REGLA_AA",3,"Best seller"`,
      `"Ejemplo GOA","BLUSA_001","Manga 3/4","Premium",799,250,68.7,"Feb 27","CURVA_DAMAS","REGLA_A",2,""`
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + headers + "\r\n" + sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "Plantilla_Catalogo_Modelos.csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleCatalogUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const rows = parseCSV(evt.target.result);
        if (rows.length < 2) { alert("CSV vacío o sin datos."); return; }
        const headers = rows[0].map(h => h.toLowerCase().trim());
        const idx = (name) => headers.indexOf(name.toLowerCase());
        const catalog = rows.slice(1).filter(r => r.some(c => c)).map((r, i) => ({
          id: Date.now() + i,
          goaName: r[idx('goa')] || '',
          modelo: r[idx('modelo')] || '',
          descripcion: r[idx('descripcion')] || '',
          bucketName: r[idx('bucket')] || '',
          pvp: Number(r[idx('pvp')]) || 0,
          costo: Number(r[idx('costo')]) || 0,
          margen: Number(r[idx('margen')]) || 0,
          mesCompra: r[idx('mescompra')] || '',
          curveName: r[idx('curva')] || '',
          ruleName: r[idx('regla')] || '',
          variantes: Number(r[idx('variantes')]) || 1,
          notas: r[idx('notas')] || '',
          used: false
        }));
        setModelCatalog(catalog);
        alert(`Catálogo cargado: ${catalog.length} modelos.`);
      } catch (err) { alert("Error al leer CSV: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Buscar IDs por nombre
  const resolveByName = (collection, name, key='name') => {
    if (!name) return null;
    const norm = String(name).trim().toLowerCase();
    return (collection || []).find(x => String(x[key]||'').trim().toLowerCase() === norm);
  };

  // Prellenar form desde un modelo del catálogo
  const fillFromCatalog = (catalogId) => {
    const m = (modelCatalog || []).find(c => c.id === Number(catalogId));
    if (!m) return;
    const goa = resolveByName(goas, m.goaName);
    const curve = resolveByName(sizeCurves, m.curveName);
    const rule = resolveByName(calcRules, m.ruleName);
    const bucket = resolveByName(buckets, m.bucketName);
    // Buscar mes que matchee con label
    let monthOffset = '';
    for (let o = 0; o < 6; o++) { if (getMonthLabel(o) === m.mesCompra) { monthOffset = o; break; } }
    setBuyData({
      goaId: goa ? goa.id : '',
      modelo: m.modelo || '',
      pvp: m.pvp ? String(m.pvp) : (goa?.defaultPvp ? String(goa.defaultPvp) : ''),
      curveId: curve ? curve.id : '',
      ruleId: rule ? rule.id : '',
      bucketId: bucket ? bucket.id : '',
      monthOffset: monthOffset !== '' ? String(monthOffset) : ''
    });
  };

  // Auto-sugerir compras hasta agotar OTB del GOA
  const autoSuggestFromCatalog = (goaId) => {
    const goa = (goas || []).find(g => g.id === Number(goaId));
    if (!goa) { alert("Selecciona un GOA primero."); return; }
    const goaCatalog = (modelCatalog || []).filter(c => {
      const cgoa = resolveByName(goas, c.goaName);
      return cgoa && cgoa.id === goa.id && !c.used;
    });
    if (goaCatalog.length === 0) { alert("No hay modelos en el catálogo para este GOA (o todos ya están usados)."); return; }

    // OTB disponible
    const spent = (purchases || []).filter(p => p.goaId === goa.id).reduce((s,p) => s + (p.totalRetailValue || 0), 0);
    let remaining = (goa.budget || 0) - spent;
    if (remaining <= 0) { alert("Este GOA ya no tiene OTB disponible."); return; }

    const newPurchases = [];
    const newCatalog = [...modelCatalog];
    let added = 0;

    for (const m of goaCatalog) {
      if (remaining <= 0) break;
      const curve = resolveByName(sizeCurves, m.curveName);
      const rule = resolveByName(calcRules, m.ruleName);
      const bucket = resolveByName(buckets, m.bucketName);
      const pvp = m.pvp || goa.defaultPvp || 0;
      if (!curve || !rule || !pvp) continue;

      // Calcular piezas
      const sizes = curve.sizes.split(',').map(s => s.trim());
      const weights = curve.weights.split(',').map(w => Number(w.trim()));
      const goaStores = (stores || []).filter(s => (s.clusters[goa.name] || s.clusters[goa.name.toUpperCase()]));
      let totalPieces = 0; const storeDemands = {};
      goaStores.forEach(s => {
        const c = s.clusters[goa.name] || s.clusters[goa.name.toUpperCase()];
        const runs = rule.corridas[c] || 0;
        if (runs > 0) {
          const demand = {};
          sizes.forEach((tz, ti) => { const pz = runs * (weights[ti] || 0); if (pz > 0) demand[tz] = pz; totalPieces += pz; });
          storeDemands[s.id] = { storeId: s.id, name: s.name, centerCode: s.centerCode, cluster: c, demand };
        }
      });
      if (totalPieces === 0) continue;
      const cost = totalPieces * pvp;
      if (cost > remaining) continue; // No alcanza, prueba siguiente

      // Buscar mes
      let monthOffset = null, monthLabel = null;
      for (let o = 0; o < 6; o++) { if (getMonthLabel(o) === m.mesCompra) { monthOffset = o; monthLabel = m.mesCompra; break; } }

      newPurchases.push({
        id: Date.now() + Math.random(), goaId: goa.id, goaName: goa.name, modelo: m.modelo,
        pvp, curveId: curve.id, curveName: curve.name, ruleId: rule.id, ruleName: rule.name,
        bucketId: bucket ? bucket.id : null, bucketName: bucket ? bucket.name : null,
        monthOffset, monthLabel, totalPieces, totalRetailValue: cost, storeDemands,
        fromCatalog: true, catalogId: m.id
      });
      // Marcar usado
      const cIdx = newCatalog.findIndex(x => x.id === m.id);
      if (cIdx >= 0) newCatalog[cIdx] = { ...newCatalog[cIdx], used: true };
      remaining -= cost;
      added++;
    }

    if (added === 0) { alert("Ningún modelo del catálogo cabe en el OTB restante o falta info (curva/regla/PVP)."); return; }
    setPurchases([...(purchases || []), ...newPurchases]);
    setModelCatalog(newCatalog);
    alert(`Se agregaron ${added} modelos. OTB restante: $${Math.round(remaining).toLocaleString()}`);
  };

  // --- MOTOR MÁGICO DE SUGERENCIAS ---
  const handleAddSuggestion = (goaId) => {
    setSuggestedPlans([...(suggestedPlans || []), { id: Date.now(), goaId, curveId: '', ruleId: '', pvp: '', models: '', variants: '', bucketId: '', monthOffset: '' }]);
    setCollapsedGoas(prev => ({...prev, [goaId]: false}));
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
    const goaNameUpper = String(goaName).toUpperCase();
    let pzs = 0;
    (stores || []).forEach(store => {
      let c = (store.clusters || {})[goaName] || (store.clusters || {})[goaNameUpper] || activeClusters[activeClusters.length - 1];
      const runs = (rule.corridas || {})[c] || 0;
      pzs += (runs * totalPzsPerRun);
    });
    return pzs;
  };

  const processPlanLogic = (plan, allPlansToUpdate) => {
    if(!plan.curveId || !plan.ruleId) return "Falta seleccionar Curva y Regla.";
    const goa = (goas || []).find(g => g.id === plan.goaId);
    if(!goa) return "GOA no encontrado.";
    
    const singleModelBasePzs = getPiecesForOneModel(goa.name, plan.curveId, plan.ruleId);
    if(singleModelBasePzs <= 0) return "La regla y curva combinadas generan 0 piezas para las tiendas de este GOA. Valida la asignación de clústeres en Tab 1.";
    
    const otherPlans = allPlansToUpdate.filter(p => p.goaId === goa.id && p.id !== plan.id);
    let usedPzs = 0; let usedBudget = 0;
    otherPlans.forEach(op => {
       const opPzs = getPiecesForOneModel(goa.name, op.curveId, op.ruleId);
       const opVars = Number(op.variants) || 1;
       usedPzs += opPzs * (Number(op.models)||0) * opVars;
       usedBudget += opPzs * (Number(op.models)||0) * opVars * (Number(op.pvp)||0);
    });

    // Si el plan tiene bucket asignado, el budget restante es del bucket (no del GOA total)
    const planBucketId = plan.bucketId ? Number(plan.bucketId) : null;
    const planBucket = planBucketId ? (buckets || []).find(b => b.id === planBucketId) : null;
    let goaBudgetForCalc = (goa.budget || 0);
    let usedBudgetForCalc = usedBudget;
    if (planBucket) {
      goaBudgetForCalc = (goa.budget || 0) * ((Number(planBucket.sharePct) || 0) / 100);
      // Solo descontar lo que ya consumieron OTROS planes del MISMO bucket
      usedBudgetForCalc = otherPlans.filter(op => Number(op.bucketId) === planBucketId).reduce((s, op) => {
        const opPzs = getPiecesForOneModel(goa.name, op.curveId, op.ruleId);
        const opVars = Number(op.variants) || 1;
        return s + opPzs * (Number(op.models)||0) * opVars * (Number(op.pvp)||0);
      }, 0);
    }
    
    const remainingPzs = Math.max(0, (goa.historyPzs || 0) - usedPzs);
    const remainingBudget = Math.max(0, goaBudgetForCalc - usedBudgetForCalc);
    
    // ===== RESOLVER: cuántas variantes alcanza a comprar con el ppto disponible =====
    // - Modelos = 1 (siempre): el "modelo" es el genérico de esta estrategia.
    // - PVP = el del plan, o el defaultPvp del GOA, o error.
    // - Variantes = floor(remainingBudget / (piezas_por_variante × pvp))
    // - Las piezas se calculan a partir de la curva × regla × tiendas (necesidad real).

    const planPvp = Number(plan.pvp) || 0;
    const goaDefaultPvp = Number(goa.defaultPvp) || 0;
    const pvpToUse = planPvp > 0 ? planPvp : goaDefaultPvp;

    if (pvpToUse <= 0) {
      return `Falta PVP. Captura el PVP en este plan o configura el "PVP Default" del GOA "${goa.name}" en Tab 3.`;
    }
    if (singleModelBasePzs <= 0) {
      return "La curva y regla seleccionadas generan 0 piezas. Revisa Tab 1 (clústeres) y Tab 2 (curvas/reglas).";
    }
    if (remainingBudget <= 0) {
      return `Sin presupuesto disponible. ${planBucket ? `El bucket "${planBucket.name}"` : `El GOA "${goa.name}"`} ya está agotado.`;
    }

    const costPerVariant = singleModelBasePzs * pvpToUse;
    const variantsAffordable = Math.floor(remainingBudget / costPerVariant);

    plan.models = 1;
    plan.variants = variantsAffordable > 0 ? variantsAffordable : 0;
    plan.pvp = pvpToUse;
    return null;
  };

  const handleAutoSuggest = (planId) => {
    const plansCopy = [...(suggestedPlans || [])];
    const planIndex = plansCopy.findIndex(p => p.id === planId);
    if(planIndex === -1) return;
    
    const errorMsg = processPlanLogic(plansCopy[planIndex], plansCopy);
    if(errorMsg) alert(`⚠️ Imposible Resolver:\n\n${errorMsg}`);
    else setSuggestedPlans(plansCopy);
  };

  const handleResolveAll = () => {
    const plansCopy = [...(suggestedPlans || [])];
    let resolvedCount = 0;
    let errors = [];

    const validGoasIds = goas.filter(g => g.budget > 0).map(g => g.id);
    const plansToResolve = plansCopy.filter(p => validGoasIds.includes(p.goaId));

    if (plansToResolve.length === 0) {
      alert("No hay estrategias pendientes en los GOAs con Presupuesto activo.");
      return;
    }

    plansToResolve.forEach(plan => {
      const errorMsg = processPlanLogic(plan, plansCopy);
      if (errorMsg) {
        const goaName = goas.find(g => g.id === plan.goaId)?.name || 'GOA';
        errors.push(`- ${goaName}: ${errorMsg}`);
      } else {
        resolvedCount++;
      }
    });

    if (resolvedCount > 0) setSuggestedPlans(plansCopy);

    if (errors.length > 0) {
      alert(`✅ Se resolvieron ${resolvedCount} planes.\n\n⚠️ No se pudieron resolver los siguientes:\n${errors.slice(0,5).join('\n')}${errors.length>5?'\n... y otros más.':''}`);
    } else {
      alert(`✅ ¡Se resolvieron los ${resolvedCount} planes correctamente!`);
    }
  };

  const toggleAllGoas = () => {
    const allIds = goas.filter(g => g.budget > 0).map(g => g.id);
    const anyOpen = allIds.some(id => !collapsedGoas[id]);
    const newState = {};
    allIds.forEach(id => { newState[id] = anyOpen; }); 
    setCollapsedGoas(newState);
  };

  const toggleGoaCollapse = (id) => {
    setCollapsedGoas(prev => ({...prev, [id]: !prev[id]}));
  };

  // --- REPORTES CONSOLIDADOS ---
  const filteredStores = useMemo(() => {
    if (filterGoa === 'ALL') return stores || [];
    const filterUpper = filterGoa.toUpperCase();
    return (stores || []).filter(s => Object.keys(s.clusters || {}).some(k => k.toUpperCase() === filterUpper));
  }, [stores, filterGoa]);

  const reportData = useMemo(() => {
    const isSug = reportView === 'sugerido';
    
    const goaMetrics = (goas || []).map(g => {
      let boughtPzs = 0; let spentValue = 0;
      if (isSug) {
        const plans = (suggestedPlans || []).filter(p => p.goaId === g.id);
        plans.forEach(plan => {
          const pzsPerOption = getPiecesForOneModel(g.name, plan.curveId, plan.ruleId);
          const models = Number(plan.models) || 0;
          const variants = Number(plan.variants) || 1;
          const pvp = Number(plan.pvp) || 0;
          boughtPzs += (pzsPerOption * models * variants);
          spentValue += (pzsPerOption * models * variants * pvp);
        });
      } else {
        const p = (purchases || []).filter(x => x.goaId === g.id);
        boughtPzs = p.reduce((acc, curr) => acc + (curr.totalPieces || 0), 0);
        spentValue = p.reduce((acc, curr) => acc + (curr.totalRetailValue || 0), 0);
      }
      const budget = Number(g.budget) || 0;
      const historyPzs = Number(g.historyPzs) || 0;
      return { ...g, boughtPzs, spentValue, otb: budget - spentValue, historyDiff: boughtPzs - historyPzs };
    });

    const matrixByGoa = {};
    (goas || []).forEach(g => {
      const matrix = {};
      (activeClusters || []).forEach(c => matrix[c] = { stores: 0, ruleRunsAvg: 0, pzs: 0, totalStoreInstances: 0 });

      (stores || []).forEach(store => {
        const c = (store.clusters || {})[g.name] || (store.clusters || {})[String(g.name || '').toUpperCase()] || activeClusters[activeClusters.length - 1];
        if(matrix[c]) matrix[c].stores += 1;
      });

      let totalModelsAffected = 0;

      if (isSug) {
        const plans = (suggestedPlans || []).filter(p => p.goaId === g.id);
        plans.forEach(plan => {
          const rule = (calcRules || []).find(r => r.id === Number(plan.ruleId));
          const curve = (sizeCurves || []).find(c => c.id === Number(plan.curveId));
          const models = Number(plan.models) || 0;
          const variants = Number(plan.variants) || 1;
          
          if(rule && curve && models > 0) {
            const totalCombos = models * variants;
            totalModelsAffected += totalCombos;
            const totalPzsPerRun = (curve.weights || '').split(',').map(w => Number(w.trim())).reduce((a, b) => a + b, 0);
            
            (activeClusters || []).forEach(c => {
               const runs = (rule.corridas || {})[c] || 0;
               if (runs > 0 && matrix[c]) {
                 matrix[c].ruleRunsAvg += (runs * totalCombos); 
                 matrix[c].pzs += (runs * totalPzsPerRun * totalCombos * matrix[c].stores); 
                 matrix[c].totalStoreInstances += (matrix[c].stores * totalCombos);
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

    return { goaMetrics, matrixByGoa };
  }, [purchases, stores, goas, activeClusters, reportView, suggestedPlans, calcRules, sizeCurves]);

  // --- CÓDIGO DE AGREGACIÓN EXTERNO ---
  const storeStats = useMemo(() => {
    const stats = {
      total: (filteredStores || []).length,
      goas:  filterGoa === 'ALL' ? (goas || []).length : 1,
      clusters: { 'Sin Asignar': 0 },
    };
    (activeClusters || []).forEach(c => { stats.clusters[c] = 0; });
    (filteredStores || []).forEach(s => {
      const clusterValues = Object.values(s.clusters || {});
      if (clusterValues.length === 0) {
        stats.clusters['Sin Asignar']++;
      } else {
        const filterUpper = filterGoa.toUpperCase();
        const realKey = Object.keys(s.clusters || {}).find(k => k.toUpperCase() === filterUpper);
        const primary = filterGoa === 'ALL' ? s.globalCluster : (realKey ? s.clusters[realKey] : undefined);
        
        if (primary && stats.clusters[primary] !== undefined) stats.clusters[primary]++;
        else stats.clusters['Sin Asignar']++;
      }
    });
    return stats;
  }, [filteredStores, goas, activeClusters, filterGoa]);

  const sortedStores = useMemo(() => {
    return [...(filteredStores || [])].sort((a, b) => {
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
  }, [filteredStores, storeSortBy, storeSortOrder]);

  const toggleSort = (field) => {
    if (storeSortBy === field) {
      setStoreSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStoreSortBy(field);
      setStoreSortOrder('desc');
    }
  };

  const storeSummaryData = useMemo(() => {
    const isSug = reportView === 'sugerido';
    return (stores || []).map(store => {
      let storeTotalPzs = 0; let storeTotalValue = 0;
      if (isSug) {
        (suggestedPlans || []).forEach(plan => {
          const goa = (goas || []).find(g => g.id === plan.goaId);
          if (goa) {
            const c = (store.clusters || {})[goa.name] || (store.clusters || {})[String(goa.name || '').toUpperCase()] || activeClusters[activeClusters.length - 1];
            const rule = (calcRules || []).find(r => r.id === Number(plan.ruleId));
            const curve = (sizeCurves || []).find(cv => cv.id === Number(plan.curveId));
            if (rule && curve) {
              const runs = (rule.corridas || {})[c] || 0;
              const pzsPerRun = (curve.weights || '').split(',').reduce((a, b) => a + Number(b), 0);
              const variants = Number(plan.variants) || 1;
              const pzsInStore = runs * pzsPerRun;
              storeTotalPzs += pzsInStore * (Number(plan.models) || 0) * variants;
              storeTotalValue += pzsInStore * (Number(plan.models) || 0) * variants * (Number(plan.pvp) || 0);
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
  }, [stores, suggestedPlans, purchases, goas, activeClusters, calcRules, sizeCurves, reportView]);

  // --- GENERADOR DE CHEQUERAS (TAB 6) ---
  const generateChequera = (source = 'sugerido', level = 'detail', extras = {}) => {
    const dataToProcess = source === 'sugerido' ? suggestedPlans : purchases;

    if (!dataToProcess || dataToProcess.length === 0) {
      alert(`No hay datos en el plan ${source} para generar la chequera.`);
      return;
    }

    const seccion = (extras.seccion || '').trim();
    const marca = (extras.marca || '').trim();

    // ---- Detalle: una línea por (GOA, Modelo, Variante, Centro, Talla)
    // ---- Nivel alto: agrupado por (Sección, Marca, GOA, Modelo, Talla) — suma piezas, sin centro/cluster/variante
    const isHigh = level === 'high';

    let csv;
    if (isHigh) {
      csv = "Seccion,Marca,GOA,Modelo,Talla,Piezas,Bucket,Mes,PVP,Costo_Total\r\n";
    } else {
      csv = "Seccion,Marca,GOA,Modelo,Variante,Centro,Nombre_Centro,Cluster,Talla,Piezas,Bucket,Mes,PVP\r\n";
    }

    // Acumulador para nivel alto: key = `${goa}|${modelo}|${talla}|${bucket}|${mes}`
    const aggregated = {};

    dataToProcess.forEach((plan, i) => {
      const goa = goas.find(g => g.id === plan.goaId);
      if(!goa) return;
      const rule = calcRules.find(r => r.id === Number(plan.ruleId));
      const curve = sizeCurves.find(c => c.id === Number(plan.curveId));
      if(!rule || !curve) return;

      const sizes = curve.sizes.split(',').map(s => s.trim());
      const weights = curve.weights.split(',').map(w => Number(w.trim()));

      const modelsCount = Number(plan.models) || 1;
      const variantsCount = Number(plan.variants) || 1;
      const baseModelName = plan.modelo || `Mod_Gen_${i+1}`;
      const pvp = Number(plan.pvp) || 0;

      const bucketObj = plan.bucketId ? (buckets || []).find(b => b.id === Number(plan.bucketId)) : null;
      const bucketName = bucketObj ? bucketObj.name : (plan.bucketName || '');
      const monthLabel = plan.monthLabel || (plan.monthOffset !== null && plan.monthOffset !== undefined && plan.monthOffset !== '' ? getMonthLabel(plan.monthOffset) : '');

      stores.forEach(store => {
        const c = store.clusters[goa.name] || store.clusters[goa.name.toUpperCase()] || activeClusters[activeClusters.length - 1];
        const runs = rule.corridas[c] || 0;
        if(runs <= 0) return;

        const emit = (modelName, variantName) => {
          sizes.forEach((talla, tIdx) => {
            const pzs = runs * (weights[tIdx] || 0);
            if(pzs <= 0) return;
            if (isHigh) {
              const key = `${goa.name}|${modelName}|${talla}|${bucketName}|${monthLabel}`;
              if (!aggregated[key]) aggregated[key] = { goa: goa.name, modelo: modelName, talla, bucket: bucketName, mes: monthLabel, pzs: 0, pvp };
              aggregated[key].pzs += pzs;
            } else {
              csv += `"${seccion}","${marca}","${goa.name}","${modelName}","${variantName}","${store.centerCode}","${store.name}","${c}","${talla}",${pzs},"${bucketName}","${monthLabel}",${pvp}\r\n`;
            }
          });
        };

        if (source === 'sugerido') {
          for(let m = 1; m <= modelsCount; m++) {
            for(let v = 1; v <= variantsCount; v++) {
              emit(`${baseModelName}_M${m}`, `Var_${v}`);
            }
          }
        } else {
          emit(baseModelName, 'Única');
        }
      });
    });

    if (isHigh) {
      Object.values(aggregated).forEach(row => {
        const costo = row.pzs * row.pvp;
        csv += `"${seccion}","${marca}","${row.goa}","${row.modelo}","${row.talla}",${row.pzs},"${row.bucket}","${row.mes}",${row.pvp},${costo}\r\n`;
      });
    }

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Chequera_${source}_${level}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`min-h-screen w-full font-sans pb-12 transition-colors duration-300 ${t.appBg}`}>
      
      {/* HEADER Y MINI MENU */}
      <header className={`border-b sticky top-0 z-20 transition-colors duration-300 ${t.header}`}>
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
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
                      <input type="file" accept=".json" onClick={(e) => e.target.value = null} onChange={(e) => { handleImportProject(e); setIsMenuOpen(false); }} className="hidden" />
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
            <TabButton id="data" label="1. Tiendas y Clústeres" icon={Store} activeTab={activeTab} setActiveTab={setActiveTab} t={t} />
            <TabButton id="calc" label="2. Curvas y Reglas" icon={ClipboardList} activeTab={activeTab} setActiveTab={setActiveTab} t={t} />
            <TabButton id="budget" label="3. Forecast GO Planner" icon={Database} activeTab={activeTab} setActiveTab={setActiveTab} t={t} />
            <TabButton id="assortment" label="4. Ejecutar Preventa" icon={Package} activeTab={activeTab} setActiveTab={setActiveTab} t={t} />
            <TabButton id="reports" label="5. Reportes / Plan OTB" icon={Compass} activeTab={activeTab} setActiveTab={setActiveTab} t={t} />
            {/* NUEVA PESTAÑA */}
            <TabButton id="chequeras" label="6. Generador Chequeras" icon={FileSpreadsheet} activeTab={activeTab} setActiveTab={setActiveTab} t={t} />
          </div>
        </div>
      </header>

      <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors duration-300">
        
        {/* === PESTAÑA 1: BASE === */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {(stores || []).length === 0 ? (
              <EmptyState 
                icon={Store} title="Configura la Base de Tiendas" 
                desc="Para comenzar a planear, necesitamos calificar tus sucursales."
                rules={["Centro (Ej. 0953)", "Nombre (Ej. Tienda Norte)", "GOA / Familia (Ej. Chancla)", "Ventas en Unidades (Numérico)", "Utilidad en $ (Opcional)", "Rotacion (Opcional)"]}
                theme={theme} t={t}
                action={
                  <label className={`cursor-pointer px-6 py-3.5 rounded-xl text-sm font-black tracking-wider uppercase transition shadow-lg flex items-center hover:scale-105 transform duration-200 ${t.btnPrimary}`}>
                    <Upload size={18} className="mr-2" /> Subir Archivo Base (.CSV)
                    <input type="file" accept=".csv" onClick={(e) => e.target.value = null} onChange={handleStoreCSVUpload} ref={fileInputRef} className="hidden" />
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
                      <div className="flex flex-col"><label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Utilidad ({scoreWeights.margin}%)</label><input type="range" min="0" max="100" value={scoreWeights.margin} onChange={e=>setScoreWeights({...scoreWeights, margin: Number(e.target.value)})} className="w-24 accent-yellow-500 cursor-pointer" /></div>
                      <div className="flex flex-col"><label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Rotación ({scoreWeights.rotation}%)</label><input type="range" min="0" max="100" value={scoreWeights.rotation} onChange={e=>setScoreWeights({...scoreWeights, rotation: Number(e.target.value)})} className="w-24 accent-blue-500 cursor-pointer" /></div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-purple-500 relative overflow-hidden ${t.card}`}>
                    <div className={`p-3 rounded-full relative z-10 ${t.iconAccent1}`}><Store size={24}/></div>
                    <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Total Tiendas {filterGoa !== 'ALL' && '(En GOA)'}</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.total || 0}</p></div>
                  </div>
                  <div className={`p-4 rounded-xl border flex items-center space-x-4 border-l-4 border-l-blue-500 relative overflow-hidden ${t.card}`}>
                    <div className={`p-3 rounded-full relative z-10 ${t.iconAccent2}`}><Package size={24}/></div>
                    <div className="relative z-10"><p className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Categorías (GOAs)</p><p className={`text-3xl font-black ${t.textMain}`}>{storeStats.goas || 0}</p></div>
                  </div>
                  <div className={`p-4 rounded-xl border border-l-4 border-l-gray-500 ${t.card}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Distribución {filterGoa !== 'ALL' ? filterGoa : 'Global'}</p>
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
                    <div className="flex flex-wrap gap-2 items-center">
                      
                      {/* FILTRO POR GOA */}
                      <div className={`flex rounded-lg p-1 border ${t.cardInner}`}>
                        <select value={filterGoa} onChange={(e) => setFilterGoa(e.target.value)} className={`bg-transparent outline-none text-[10px] font-bold ${t.textMain} px-2 py-1`}>
                          <option value="ALL">Todos los GOAs</option>
                          {(goas || []).map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                        </select>
                      </div>

                      <div className={`flex rounded-lg p-1 border ${t.cardInner}`}>
                        <button onClick={()=>toggleSort('score')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='score'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Score <ArrowUpDown size={10} className="ml-1"/></button>
                        <button onClick={()=>toggleSort('sales')} className={`px-2 py-1 text-[10px] font-bold rounded flex items-center transition ${storeSortBy==='sales'? (theme==='dark'?'bg-zinc-800 text-yellow-400':'bg-white shadow text-blue-600') : t.textMuted}`}>Vtas <ArrowUpDown size={10} className="ml-1"/></button>
                      </div>

                      <button onClick={handleDownloadMatrix} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${t.btnGhost}`}>
                        <Download size={16} className="mr-2" /> Exportar Matriz
                      </button>

                      <input ref={matrixFileInputRef} type="file" accept=".csv" onChange={handleBrandMatrixUpload} className="hidden" />
                      <button onClick={()=>matrixFileInputRef.current?.click()} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${brandMatrix ? t.btnSecondary : t.btnGhost}`}>
                        <Layers size={16} className="mr-2" /> {brandMatrix ? `Matriz Cargada (${Object.keys(brandMatrix).length} tdas)` : 'Cargar Matriz Marcas'}
                      </button>
                      {brandMatrix && (
                        <button onClick={()=>{ if(confirm('¿Quitar matriz de marcas? Las tiendas marcadas con "No" volverán a incluirse.')) setBrandMatrix(null); }} className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center transition ${t.btnDanger}`}>
                          <Trash2 size={16}/>
                        </button>
                      )}
                      
                      <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold flex items-center transition ${t.btnGhost}`}>
                        <Upload size={16} className="mr-2" /> Actualizar CSV
                        <input type="file" accept=".csv" onClick={(e) => e.target.value = null} onChange={handleStoreCSVUpload} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {sortedStores.map(store => (
                      <div key={store.id} className={`p-4 rounded-xl shadow-sm transition-colors group border hover:border-purple-500/50 ${t.cardInner}`}>
                        <div className="flex justify-between items-center mb-2">
                          <p className={`text-sm font-bold truncate ${t.textMain}`} title={store.name}>{store.name}</p>
                          <div className="flex flex-col items-end">
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${t.badgeOther}`}>{store.centerCode}</span>
                            <span className={`text-[8px] mt-1 font-black px-1.5 py-0.5 rounded ${store.globalCluster === activeClusters[0] ? t.badgeAA : store.globalCluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>GBL: {store.globalCluster || '-'}</span>
                          </div>
                        </div>
                        <div className={`rounded-lg p-2 mb-4 mt-3 grid grid-cols-3 gap-2 text-center divide-x border ${theme==='dark'?'divide-zinc-800 bg-zinc-900 border-zinc-800':'divide-gray-200 bg-white border-gray-100'}`}>
                          {(() => {
                            // Si hay filtro de GOA, usar métricas POR GOA; si no, las globales de la tienda
                            let metrics = { sales: store.sales || 0, margin: store.margin || 0, rotation: store.rotation || 0, score: store.score || 0 };
                            if (filterGoa !== 'ALL') {
                              const goaKey = filterGoa.toUpperCase();
                              const gm = (store.goaMetrics || {})[goaKey];
                              if (gm) metrics = { sales: gm.sales || 0, margin: gm.margin || 0, rotation: gm.rotation || 0, score: gm.score || 0 };
                              else metrics = { sales: 0, margin: 0, rotation: 0, score: 0 };
                            }
                            return (
                              <>
                                <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Ventas (Pzs)</p><p className={`text-[10px] font-bold ${t.textMain}`}>{Math.round(metrics.sales).toLocaleString()}</p></div>
                                <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Mg (%)</p><p className={`text-[10px] font-bold ${t.textMain}`}>{metrics.margin.toFixed(1)}%</p></div>
                                <div><p className={`text-[8px] uppercase font-bold tracking-wider ${t.textMuted}`}>Rotación</p><p className={`text-[10px] font-bold ${t.textMain}`}>{metrics.rotation.toFixed(1)}</p></div>
                                <div className={`col-span-3 pt-2 border-t divide-none mt-1 flex justify-between px-2 items-center ${theme==='dark'?'border-zinc-800':'border-gray-100'}`}>
                                   <p className={`text-[9px] uppercase font-black tracking-widest ${t.textAccent2}`}>Score {filterGoa==='ALL' ? 'Promedio' : filterGoa}:</p>
                                   <p className={`text-sm font-black leading-tight ${t.textAccent2}`}>{Math.round(metrics.score).toLocaleString()}</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        <div className="space-y-1.5">
                          <p className={`text-[10px] uppercase font-bold tracking-wider ${t.textMuted}`}>Asignación por GOA:</p>
                          <div className="max-h-32 overflow-y-auto custom-scrollbar pr-1">
                            {Object.keys(store.clusters || {}).length === 0 && <span className="text-xs text-red-500">Sin clúster asignado</span>}
                            {Object.entries(store.clusters || {}).map(([goa, cluster]) => (
                              <div key={`goa-${goa}`} className={`flex justify-between items-center text-xs border-b pb-1.5 ${t.border} mb-1.5`}>
                                <span className={`truncate max-w-[120px] font-medium ${t.textMuted}`} title={goa}>{goa}</span>
                                <select value={cluster} onChange={(e) => handleUpdateStoreCluster(store.id, goa, e.target.value)} className={`font-black p-1 rounded outline-none cursor-pointer border ${cluster === activeClusters[0] ? t.badgeAA : cluster === activeClusters[1] ? t.badgeA : t.badgeOther}`}>
                                  {activeClusters.map(c => <option key={`opt-${c}`} value={c} className={theme==='dark'?'bg-zinc-900 text-white':''}>{c}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUMNA 1: BUCKETS */}
            <div className={`p-6 rounded-xl border ${t.card}`}>
              <h2 className={`text-xl font-bold mb-2 flex items-center ${t.textMain}`}><Layers className={`mr-3 ${t.textAccent1}`}/> Buckets de Producto</h2>
              <p className={`text-xs mb-6 ${t.textMuted}`}>Define "munditos" de producto (perfiles de cliente) para pre-asignar presupuesto. Ej: Señora Clásica, Chava Trendy, Premium, Value.</p>

              <form onSubmit={handleBucketSubmit} className={`mb-6 p-5 rounded-xl border ${editingBucketId ? t.warningBg : t.cardInner}`}>
                <h3 className={`text-sm font-bold tracking-wider uppercase mb-4 ${editingBucketId ? t.warningText : t.textMuted}`}>{editingBucketId ? '✏️ Editando Bucket' : 'Crear Nuevo Bucket'}</h3>
                <div className="space-y-3">
                  <input required type="text" placeholder="Nombre (Ej. Señora Clásica)" value={newBucket.name} onChange={e=>setNewBucket({...newBucket, name: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                  <input type="text" placeholder="Perfil de cliente (Ej. 45+, conservadora)" value={newBucket.perfil} onChange={e=>setNewBucket({...newBucket, perfil: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" max="100" step="0.1" placeholder="% del GOA" value={newBucket.sharePct} onChange={e=>setNewBucket({...newBucket, sharePct: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                    <input type="text" placeholder="Rango PVP (Ej. 299-599)" value={newBucket.pvpRange} onChange={e=>setNewBucket({...newBucket, pvpRange: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                  </div>
                  <input type="text" placeholder="Notas (opcional)" value={newBucket.notes} onChange={e=>setNewBucket({...newBucket, notes: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm transition ${t.input}`} />
                </div>
                <div className="flex space-x-3 mt-4">
                  <button type="submit" className={`flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition ${editingBucketId ? t.btnPrimary : t.btnSecondary}`}>
                    {editingBucketId ? 'Actualizar' : 'Guardar Bucket'}
                  </button>
                  {editingBucketId && <button type="button" onClick={()=>{setEditingBucketId(null); setNewBucket({name:'', perfil:'', sharePct:'', pvpRange:'', notes:''})}} className={`px-4 rounded-lg text-sm font-bold transition ${t.btnGhost}`}>Cancelar</button>}
                </div>
              </form>

              {(buckets || []).length === 0 ? (
                 <div className={`p-8 text-center rounded-lg border border-dashed ${theme==='dark'?'border-zinc-800 text-gray-500':'border-gray-300 text-gray-400'}`}>Aún no hay buckets definidos.</div>
              ) : (
                <>
                  <div className={`mb-3 px-3 py-2 rounded-lg text-xs flex justify-between items-center ${t.cardInner}`}>
                    <span className={`font-bold ${t.textMuted}`}>Suma de shares:</span>
                    <span className={`font-black ${(buckets || []).reduce((s,b)=>s+(Number(b.sharePct)||0),0) === 100 ? t.textAccent2 : t.textAccent1}`}>
                      {(buckets || []).reduce((s,b)=>s+(Number(b.sharePct)||0),0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-3">
                    {buckets.map(b => (
                      <div key={b.id} className={`flex justify-between items-center p-4 border rounded-xl transition-all ${editingBucketId === b.id ? t.warningBg : t.cardInner}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-bold ${t.textMain}`}>{b.name}</p>
                            {b.sharePct > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${t.badgeAA}`}>{b.sharePct}%</span>}
                            {b.pvpRange && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${t.badgeOther}`}>${b.pvpRange}</span>}
                          </div>
                          {b.perfil && <p className={`text-xs mt-1 ${t.textMuted}`}>{b.perfil}</p>}
                          {b.notes && <p className={`text-[10px] mt-1 italic ${t.textMuted}`}>{b.notes}</p>}
                        </div>
                        <div className="flex space-x-2 ml-2">
                          <button onClick={()=>editBucket(b)} className={`p-2 rounded-lg transition ${t.btnEdit}`}><Edit3 size={16}/></button>
                          <button onClick={()=>setBuckets(buckets.filter(x=>x.id!==b.id))} className={`p-2 rounded-lg transition ${t.btnDanger}`}><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* COLUMNA 2: CURVAS DE TALLAS */}
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

            {/* COLUMNA 3: REGLAS DE CORRIDAS */}
            <div className={`p-6 rounded-xl border ${t.card}`}>
              <h2 className={`text-xl font-bold mb-6 flex items-center ${t.textMain}`}><Settings className={`mr-3 ${t.textAccent2}`}/> Reglas de Corridas</h2>
              
              {activeClusters.length === 0 ? (
                 <div className={`p-8 text-center rounded-lg border border-dashed ${theme==='dark'?'border-zinc-800 text-gray-500':'border-gray-300 text-gray-400'}`}>Configura tiendas primero.</div>
              ) : (
                <form onSubmit={handleRuleSubmit} className={`mb-6 p-5 rounded-xl border ${editingRuleId ? t.warningBg : t.cardInner}`}>
                  <h3 className={`text-sm font-bold tracking-wider uppercase mb-4 ${editingRuleId ? t.warningText : t.textMuted}`}>{editingRuleId ? '✏️ Editando Regla' : 'Crear Nueva Regla'}</h3>
                  <input required type="text" placeholder="Nombre (Ej. Regla Invierno)" value={newRule.name} onChange={e=>setNewRule({...newRule, name: e.target.value})} className={`w-full mb-4 p-2.5 rounded-lg text-sm transition ${t.inputYellow}`} />
                  <div className="grid grid-cols-3 gap-2 mb-4">
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
                <h2 className={`text-xl font-bold flex items-center ${t.textMain}`}><Database className={`mr-3 ${t.textAccent1}`}/> Forecast y Curvas Mensuales</h2>
                <div className="flex space-x-3">
                  <button onClick={handleLoadForecastFromContext} className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center transition bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg`}>
                    <Database size={16} className="mr-2" /> Extraer de Forecast
                  </button>
                  <label className={`cursor-pointer px-4 py-2.5 rounded-lg text-sm font-bold flex items-center transition ${t.btnGhost} shadow-lg`}>
                    <Upload size={16} className="mr-2" /> Importar CSV
                    <input type="file" accept=".csv" onClick={(e) => e.target.value = null} onChange={handleForecastCSVUpload} className="hidden" />
                  </label>
                </div>
              </div>
              
              <div className={`overflow-x-auto rounded-xl border ${t.border}`}>
                <table className="w-full text-left text-sm border-collapse">
                  <thead className={`border-b ${t.tableHead}`}>
                    <tr>
                      <th className="p-4 font-bold uppercase tracking-wider text-xs">GOA</th>
                      <th className="p-4 text-right font-bold uppercase tracking-wider text-xs">Ppto OTB ($)</th>
                      <th className="p-4 text-right font-bold uppercase tracking-wider text-xs">PVP Default ($)</th>
                      <th className="p-4 text-right font-bold uppercase tracking-wider text-xs">Historia (Pzs)</th>
                      <th className="p-4 text-center font-bold uppercase tracking-wider text-xs bg-black/10 border-l border-black/10" colSpan="6">Curva Mensual % (Forecast)</th>
                    </tr>
                    <tr className={`text-[10px] uppercase ${t.textMuted} ${theme==='dark'?'bg-zinc-950/50':'bg-gray-100'}`}>
                      <th colSpan="4"></th>
                      <th className="p-2 text-center border-l border-black/10">Mes 1</th><th className="p-2 text-center">Mes 2</th><th className="p-2 text-center">Mes 3</th>
                      <th className="p-2 text-center">Mes 4</th><th className="p-2 text-center">Mes 5</th><th className="p-2 text-center">Mes 6</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${t.border} ${theme==='dark'?'bg-zinc-900':'bg-white'}`}>
                    {(goas || []).length === 0 && <tr><td colSpan="10" className={`p-8 text-center ${t.textMuted}`}>Aún no hay datos de forecast disponibles.</td></tr>}
                    {goas.map(g => (
                      <tr key={g.id} className={`transition ${t.tableRow}`}>
                        <td className={`p-4 font-bold ${t.textMain}`}>{g.name}</td>
                        <td className={`p-2 text-right font-black tracking-wide ${t.textAccent2}`}>
                          <div className="flex items-center justify-end">
                            $<input 
                              type="text" 
                              inputMode="numeric"
                              value={g.budget ? Number(g.budget).toLocaleString('en-US') : ''} 
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                                handleUpdateGoaField(g.id, 'budget', cleaned);
                              }}
                              placeholder="0"
                              className={`w-32 text-right bg-transparent outline-none border-b border-transparent focus:border-yellow-500 ${t.textAccent2}`} 
                            />
                          </div>
                        </td>
                        <td className={`p-2 text-right font-bold ${t.textMain}`}>
                          <div className="flex items-center justify-end">
                            $<input 
                              type="text" 
                              inputMode="numeric"
                              value={g.defaultPvp ? Number(g.defaultPvp).toLocaleString('en-US') : ''} 
                              placeholder="0" 
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                                handleUpdateGoaField(g.id, 'defaultPvp', cleaned);
                              }}
                              className={`w-20 text-right bg-transparent outline-none border-b border-transparent focus:border-blue-500`} 
                            />
                          </div>
                        </td>
                        <td className={`p-2 text-right font-bold ${t.textMuted}`}>
                          <input type="number" value={g.historyPzs} onChange={(e) => handleUpdateGoaField(g.id, 'historyPzs', e.target.value)} className={`w-20 text-right bg-transparent outline-none border-b border-transparent focus:border-purple-500`} /> pzs
                        </td>
                        {(g.months || [16.6,16.6,16.6,16.6,16.6,17]).map((m, i) => (
                           <td key={`mes-${g.id}-${i}`} className={`p-2 text-center text-xs font-mono border-l border-black/5 ${t.textMain}`}>{Number(m?.value ?? m) || 0}%</td>
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
                theme={theme} t={t}
                action={<button onClick={()=>setActiveTab('budget')} className={`px-6 py-3 rounded-xl text-sm font-black uppercase transition ${t.btnPrimary}`}>Ir al paso 3</button>}
              />
            ) : (
              <>
                {/* === BLOQUE CATÁLOGO DE MODELOS === */}
                <div className={`rounded-xl border shadow-lg p-6 ${t.card}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className={`text-lg font-bold flex items-center ${t.textMain}`}>
                        <ClipboardList className={`mr-3 ${t.textAccent1}`}/> Catálogo de Modelos
                      </h2>
                      <p className={`text-xs mt-1 ${t.textMuted}`}>Carga el universo de modelos posibles a comprar. Después selecciónalos en el form o usa "Auto-sugerir".</p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <button onClick={downloadCatalogTemplate} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center ${t.btnGhost}`}>
                        <Download size={14} className="mr-1.5"/> Plantilla
                      </button>
                      <input ref={catalogFileInputRef} type="file" accept=".csv" onChange={handleCatalogUpload} className="hidden" />
                      <button onClick={()=>catalogFileInputRef.current?.click()} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center ${t.btnPrimary}`}>
                        <Upload size={14} className="mr-1.5"/> Cargar CSV
                      </button>
                      {(modelCatalog || []).length > 0 && (
                        <button onClick={()=>{ if(confirm('¿Borrar todo el catálogo?')) setModelCatalog([]); }} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center ${t.btnDanger}`}>
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                  </div>

                  {(modelCatalog || []).length === 0 ? (
                    <div className={`p-6 text-center rounded-lg border border-dashed ${theme==='dark'?'border-zinc-800 text-gray-500':'border-gray-300 text-gray-400'}`}>
                      <p className="text-sm">Sin catálogo cargado.</p>
                      <p className="text-[11px] mt-1">Descarga la plantilla, llénala y súbela aquí.</p>
                    </div>
                  ) : (
                    <>
                      <div className={`mb-3 px-3 py-2 rounded-lg text-xs flex justify-between items-center ${t.cardInner}`}>
                        <span className={t.textMuted}>
                          <strong className={t.textMain}>{modelCatalog.length}</strong> modelos en catálogo · 
                          <strong className={t.textAccent2}> {modelCatalog.filter(m=>!m.used).length}</strong> disponibles · 
                          <strong className={t.textMuted}> {modelCatalog.filter(m=>m.used).length}</strong> usados
                        </span>
                        {buyData.goaId && (
                          <button onClick={()=>autoSuggestFromCatalog(buyData.goaId)} className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition ${t.btnPrimary} flex items-center`}>
                            <Wand2 size={12} className="mr-1.5"/> Auto-sugerir hasta agotar OTB
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs">
                          <thead className={`sticky top-0 ${t.tableHead}`}>
                            <tr className={`text-[10px] uppercase border-b ${t.border}`}>
                              <th className="p-2 text-left">Estado</th>
                              <th className="p-2 text-left">GOA</th>
                              <th className="p-2 text-left">Modelo</th>
                              <th className="p-2 text-left">Bucket</th>
                              <th className="p-2 text-right">PVP</th>
                              <th className="p-2 text-left">Mes</th>
                              <th className="p-2 text-center">Acción</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${t.border}`}>
                            {modelCatalog.map(m => (
                              <tr key={m.id} className={`transition ${t.tableRow} ${m.used ? 'opacity-50' : ''}`}>
                                <td className="p-2">
                                  {m.used ? <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border ${t.badgeOther}`}>USADO</span> : <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border ${t.badgeAA}`}>OK</span>}
                                </td>
                                <td className={`p-2 ${t.textMuted}`}>{m.goaName}</td>
                                <td className={`p-2 font-bold ${t.textMain}`}>{m.modelo}</td>
                                <td className={`p-2 ${t.textMuted}`}>{m.bucketName || '—'}</td>
                                <td className={`p-2 text-right font-bold ${t.textAccent2}`}>${m.pvp || 0}</td>
                                <td className={`p-2 ${t.textMuted}`}>{m.mesCompra || '—'}</td>
                                <td className="p-2 text-center">
                                  {!m.used && <button onClick={()=>fillFromCatalog(m.id)} className={`px-2 py-1 rounded text-[10px] font-black ${t.btnGhost}`}>Usar</button>}
                                  <button onClick={()=>setModelCatalog(modelCatalog.filter(x=>x.id!==m.id))} className={`ml-1 p-1 rounded ${t.btnDanger}`}><Trash2 size={11}/></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                <div className={`rounded-xl shadow-lg p-6 relative overflow-hidden ${t.gradientCard}`}>
                  <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none ${theme==='dark'?'bg-purple-600/10':'bg-white/10'}`}></div>
                  <div className="flex justify-between items-center mb-6 relative z-10">
                    <h2 className="text-xl font-bold flex items-center text-white"><Zap className={`mr-3 ${t.textAccent2}`}/> Captura de Preventa (Real)</h2>
                    <div className="flex items-center gap-2">
                      <label className={`text-[10px] font-black uppercase tracking-wider ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>Mes Base</label>
                      <input type="month" value={purchaseMonthBase} onChange={e=>setPurchaseMonthBase(e.target.value)} className={`p-2 rounded-lg text-xs font-bold outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white'}`} />
                    </div>
                  </div>
                  
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
                    <div className={`col-span-1 md:col-span-4 grid grid-cols-1 md:grid-cols-5 gap-5 mt-2 border-t pt-6 ${theme==='dark'?'border-zinc-800':'border-white/20'}`}>
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
                      <div>
                        <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>6. Bucket (Opc)</label>
                        <select value={buyData.bucketId} onChange={e=>setBuyData({...buyData, bucketId: e.target.value})} className={`w-full p-3 rounded-lg outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white'}`}>
                          <option value="" className={theme==='dark'?'':'text-black'}>Sin bucket</option>
                          {(buckets || []).map(b => <option key={b.id} value={b.id} className={theme==='dark'?'':'text-black'}>{b.name}{b.sharePct?` (${b.sharePct}%)`:''}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`text-[10px] font-black uppercase tracking-wider mb-1.5 block ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>7. Mes Compra</label>
                        <select required value={buyData.monthOffset} onChange={e=>setBuyData({...buyData, monthOffset: e.target.value})} className={`w-full p-3 rounded-lg outline-none border ${theme==='dark'? t.input : 'bg-white/20 border-white/30 text-white'}`}>
                          <option value="" className={theme==='dark'?'':'text-black'}>Mes...</option>
                          {[0,1,2,3,4,5].map(o => <option key={`mopt-${o}`} value={o} className={theme==='dark'?'':'text-black'}>{getMonthLabel(o)}</option>)}
                        </select>
                      </div>
                      <button type="submit" className={`w-full h-12 self-end font-black uppercase tracking-wider rounded-lg transition flex justify-center items-center ${theme==='dark'? t.btnPrimary : 'bg-yellow-400 text-indigo-900 hover:bg-yellow-300 shadow-xl'}`}>
                        <Calculator size={18} className="mr-2" /> Agregar
                      </button>
                    </div>
                  </form>

                  {buyData.goaId && (buckets || []).length > 0 && (() => {
                    const selectedGoa = goas.find(g => g.id === Number(buyData.goaId));
                    if (!selectedGoa || !selectedGoa.budget) return null;
                    const goaPurchases = (purchases || []).filter(p => p.goaId === selectedGoa.id);
                    const totalBudget = Number(selectedGoa.budget) || 0;

                    return (
                      <div className={`mt-6 pt-5 border-t relative z-10 ${theme==='dark'?'border-zinc-800':'border-white/20'}`}>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className={`text-xs font-black uppercase tracking-wider ${theme==='dark'?'text-gray-400':'text-blue-100'}`}>Consumo por Bucket — {selectedGoa.name}</h4>
                          <span className={`text-[10px] font-bold ${theme==='dark'?'text-gray-500':'text-blue-200'}`}>Budget total: ${totalBudget.toLocaleString()}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {buckets.map(b => {
                            const bucketBudget = totalBudget * ((Number(b.sharePct)||0) / 100);
                            const consumed = goaPurchases.filter(p => p.bucketId === b.id).reduce((s,p) => s + (p.totalRetailValue||0), 0);
                            const pct = bucketBudget > 0 ? (consumed / bucketBudget) * 100 : 0;
                            const remaining = bucketBudget - consumed;
                            const overBudget = pct > 100;
                            const barColor = overBudget ? 'bg-red-500' : pct >= 90 ? 'bg-yellow-500' : pct >= 50 ? 'bg-emerald-500' : 'bg-blue-500';
                            return (
                              <div key={`bk-cons-${b.id}`} className={`p-3 rounded-lg border ${theme==='dark'?'bg-zinc-900/60 border-zinc-700':'bg-white/15 border-white/30'}`}>
                                <div className="flex justify-between items-start mb-1">
                                  <p className={`text-xs font-black truncate text-white`} title={b.name}>{b.name}</p>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${theme==='dark'?'bg-zinc-800 text-gray-300':'bg-white/20 text-white'}`}>{b.sharePct||0}%</span>
                                </div>
                                <div className={`w-full h-1.5 rounded-full overflow-hidden mb-2 ${theme==='dark'?'bg-zinc-800':'bg-white/20'}`}>
                                  <div className={`h-full transition-all ${barColor}`} style={{width: `${Math.min(100, pct)}%`}}></div>
                                </div>
                                <div className="flex justify-between text-[10px]">
                                  <span className={`font-bold ${overBudget ? 'text-red-400' : theme==='dark'?'text-gray-300':'text-white'}`}>${consumed.toLocaleString()}</span>
                                  <span className={`font-mono ${theme==='dark'?'text-gray-500':'text-blue-200'}`}>${bucketBudget.toLocaleString()}</span>
                                </div>
                                <p className={`text-[9px] mt-0.5 font-bold ${overBudget ? 'text-red-400' : remaining > 0 ? 'text-emerald-400' : theme==='dark'?'text-gray-500':'text-blue-200'}`}>
                                  {overBudget ? `Sobre: $${Math.abs(remaining).toLocaleString()}` : `Disp: $${remaining.toLocaleString()}`}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
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
                          <th className={`p-4 border-r ${t.border}`}>Bucket</th>
                          <th className={`p-4 border-r text-center ${t.border}`}>Mes</th>
                          <th className={`p-4 border-r text-center ${t.border}`}>PVP</th>
                          <th className={`p-4 border-r text-center font-bold ${t.border} ${t.textMain}`}>Total Pzs</th>
                          <th className={`p-4 border-r text-right font-bold ${t.border} ${t.textMain}`}>Costo Total $</th>
                          <th className="p-4"></th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {(purchases || []).length === 0 && <tr><td colSpan="9" className={`p-10 text-center ${t.textMuted}`}>No hay compras reales registradas aún.</td></tr>}
                        {(purchases || []).map(p => {
                          const isRepeat = (purchases || []).some(o => o.id !== p.id && o.goaId === p.goaId && o.modelo === p.modelo);
                          return (
                          <tr key={p.id} className={`transition ${t.tableRow}`}>
                            <td className={`p-4 border-r ${t.border} ${t.textMuted}`}>{p.goaName}</td>
                            <td className={`p-4 font-bold border-r ${t.border} ${t.textMain}`}>
                              {p.modelo}
                              {isRepeat && <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-black border ${t.warningBg} ${t.warningText}`}>REPEAT</span>}
                            </td>
                            <td className={`p-4 text-xs border-r ${t.border} ${t.textMuted}`}><span className={`font-bold ${t.textAccent1}`}>{p.ruleName}</span><br/>{p.curveName}</td>
                            <td className={`p-4 text-xs border-r ${t.border} ${t.textMuted}`}>{p.bucketName ? <span className={`text-[10px] px-2 py-1 rounded font-bold border ${t.badgeAA}`}>{p.bucketName}</span> : <span className="opacity-40">—</span>}</td>
                            <td className={`p-4 text-center border-r ${t.border} ${t.textMuted}`}>{p.monthLabel ? <span className={`text-[10px] px-2 py-1 rounded font-bold border ${t.badgeOther}`}>{p.monthLabel}</span> : <span className="opacity-40">—</span>}</td>
                            <td className={`p-4 text-center border-r ${t.border} ${t.textMuted}`}>${p.pvp}</td>
                            <td className={`p-4 text-center font-black border-r ${t.border} ${t.textMain} ${theme==='dark'?'bg-purple-900/10':'bg-blue-50/50'}`}>{(p.totalPieces || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right font-black border-r ${t.border} ${t.textAccent2} ${theme==='dark'?'bg-yellow-900/10':'bg-indigo-50/50'}`}>${(p.totalRetailValue || 0).toLocaleString()}</td>
                            <td className="p-4 text-center"><button onClick={()=>setPurchases(purchases.filter(x=>x.id!==p.id))} className={`transition ${t.btnDanger} p-2 rounded-lg`}><Trash2 size={18}/></button></td>
                          </tr>
                          );
                        })}
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
                 theme={theme} t={t}
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
                      <div className="flex items-center">
                        <button onClick={toggleAllGoas} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition flex items-center shadow-lg border mr-3 ${t.btnGhost}`}>
                          <ArrowUpDown size={14} className="mr-2"/> Expandir/Contraer
                        </button>
                        <button onClick={handleResolveAll} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition flex items-center shadow-lg bg-indigo-600 hover:bg-indigo-500 text-white`}>
                          <Wand2 size={14} className="mr-2"/> Resolver Todos
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-4">
                      {/* FILTRAMOS SOLO LOS QUE TIENEN PRESUPUESTO */}
                      {goas.filter(g => g.budget > 0).map(goa => {
                        const goaPlans = (suggestedPlans || []).filter(p => p.goaId === goa.id);
                        let goaPzs = 0; let goaSpent = 0;
                        goaPlans.forEach(plan => {
                          const pzs = getPiecesForOneModel(goa.name, plan.curveId, plan.ruleId);
                          const variants = Number(plan.variants) || 1;
                          goaPzs += (pzs * (Number(plan.models) || 0) * variants);
                          goaSpent += (pzs * (Number(plan.models) || 0) * variants * (Number(plan.pvp) || 0));
                        });
                        const diffHist = goaPzs - (goa.historyPzs || 0);
                        const otbRestante = (goa.budget || 0) - goaSpent;
                        const isCollapsed = collapsedGoas[goa.id];

                        return (
                          <div key={goa.id} className={`rounded-xl border overflow-hidden ${theme==='dark'?'border-zinc-800 bg-zinc-950':'border-gray-200 bg-white shadow-sm'}`}>
                            <div className={`p-4 flex justify-between items-center border-b cursor-pointer transition hover:bg-black/5 ${theme==='dark'?'border-zinc-800 bg-zinc-900/50':'border-gray-200 bg-gray-50'}`} onClick={() => toggleGoaCollapse(goa.id)}>
                              <div className="flex items-center">
                                <button className={`p-1 mr-2 rounded-md ${t.btnGhost}`}>
                                  {isCollapsed ? <ChevronRight size={18}/> : <ChevronDown size={18}/>}
                                </button>
                                <div>
                                  <h3 className={`font-black text-lg tracking-wide ${t.textMain}`}>{goa.name}</h3>
                                  <p className={`text-xs font-bold mt-1 ${t.textMuted}`}>Ppto Inicial: <span className={t.textAccent2}>${(goa.budget || 0).toLocaleString()}</span> | Hist: {(goa.historyPzs || 0).toLocaleString()} pzs</p>
                                </div>
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

                            {!isCollapsed && (
                              <div className="p-4">
                                {goaPlans.length > 0 ? (
                                  <table className="w-full text-sm text-left">
                                    <thead className={`text-[10px] uppercase tracking-wider ${t.textMuted}`}>
                                      <tr>
                                        <th className="pb-2">Estrategia</th>
                                        <th className="pb-2 text-center w-32">Automático</th>
                                        <th className="pb-2 w-24 text-center">Modelos</th>
                                        <th className="pb-2 w-24 text-center">Variantes</th>
                                        <th className="pb-2 w-24 text-center">PVP ($)</th>
                                        <th className="pb-2 w-28 text-center">Bucket</th>
                                        <th className="pb-2 w-24 text-center">Mes</th>
                                        <th className="pb-2 text-right">Total Pzs</th>
                                        <th className="pb-2 text-right">Inversión</th>
                                        <th className="pb-2"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="space-y-2">
                                      {goaPlans.map(plan => {
                                        const singleModelPzs = getPiecesForOneModel(goa.name, plan.curveId, plan.ruleId);
                                        const variants = Number(plan.variants) || 1;
                                        const totalPzs = singleModelPzs * (Number(plan.models) || 0) * variants;
                                        const totalCost = totalPzs * (Number(plan.pvp) || 0);
                                        
                                        return (
                                          <tr key={plan.id} className={`group ${theme==='dark'?'bg-black':'bg-gray-50'} rounded-lg border-b border-transparent hover:border-zinc-800`}>
                                            <td className="py-2 pr-2">
                                              <div className="flex space-x-2">
                                                <select value={plan.curveId} onChange={e=>handleUpdateSuggestion(plan.id, 'curveId', e.target.value)} className={`w-1/2 p-2 rounded text-xs outline-none ${t.input}`}>
                                                  <option value="">Curva...</option>{(sizeCurves || []).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                                <select value={plan.ruleId} onChange={e=>handleUpdateSuggestion(plan.id, 'ruleId', e.target.value)} className={`w-1/2 p-2 rounded text-xs outline-none ${t.input}`}>
                                                  <option value="">Regla...</option>{(calcRules || []).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                                                </select>
                                              </div>
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                              <button onClick={()=>handleAutoSuggest(plan.id)} className={`px-2 py-1.5 rounded text-[10px] uppercase font-black tracking-widest transition flex items-center justify-center w-full shadow-sm ${t.btnPrimary}`}>
                                                <Wand2 size={12} className="mr-1"/> Resolver
                                              </button>
                                            </td>
                                            <td className="py-2 px-2">
                                              <input type="number" min="1" value={plan.models !== undefined ? plan.models : ''} onChange={e=>handleUpdateSuggestion(plan.id, 'models', e.target.value)} className={`w-full p-2 rounded text-xs text-center font-bold outline-none ${t.input}`} />
                                            </td>
                                            <td className="py-2 px-2">
                                              <input type="number" min="1" value={plan.variants !== undefined ? plan.variants : 1} onChange={e=>handleUpdateSuggestion(plan.id, 'variants', e.target.value)} className={`w-full p-2 rounded text-xs text-center font-bold outline-none ${t.input}`} />
                                            </td>
                                            <td className="py-2 px-2">
                                              <input type="number" value={plan.pvp !== undefined ? plan.pvp : ''} onChange={e=>handleUpdateSuggestion(plan.id, 'pvp', e.target.value)} placeholder="0.00" className={`w-full p-2 rounded text-xs font-bold text-center outline-none ${t.inputYellow}`} />
                                            </td>
                                            <td className="py-2 px-2">
                                              <select value={plan.bucketId || ''} onChange={e=>handleUpdateSuggestion(plan.id, 'bucketId', e.target.value)} className={`w-full p-2 rounded text-xs outline-none ${t.input}`}>
                                                <option value="">—</option>{(buckets || []).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                                              </select>
                                            </td>
                                            <td className="py-2 px-2">
                                              <select value={plan.monthOffset !== undefined && plan.monthOffset !== '' ? plan.monthOffset : ''} onChange={e=>handleUpdateSuggestion(plan.id, 'monthOffset', e.target.value)} className={`w-full p-2 rounded text-xs outline-none ${t.input}`}>
                                                <option value="">—</option>{[0,1,2,3,4,5].map(o=><option key={`mp-${o}`} value={o}>{getMonthLabel(o)}</option>)}
                                              </select>
                                            </td>
                                            
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
                            )}
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
                        {reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).map(g => (
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
                        {/* FILA DE TOTALES (OTB GENERAL) */}
                        <tr className={`font-black border-t-2 ${theme==='dark'?'bg-purple-900/20 border-purple-500/30':'bg-indigo-50 border-indigo-200'}`}>
                          <td className={`p-4 border-r text-right uppercase text-xs tracking-wider ${theme==='dark'?'border-purple-500/20 text-purple-300':'border-indigo-200 text-indigo-700'}`}>Total General</td>
                          <td className={`p-4 border-l text-right ${t.textMain}`}>
                            {reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.boughtPzs || 0), 0).toLocaleString()}
                          </td>
                          <td className={`p-4 text-right ${t.textMuted}`}>
                            {reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.historyPzs || 0), 0).toLocaleString()}
                          </td>
                          <td className={`p-4 text-right font-bold`}>
                            {(() => {
                                const diff = reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.historyDiff || 0), 0);
                                return <span className={diff >= 0 ? t.successText : t.dangerText}>{diff > 0 ? '+' : ''}{diff.toLocaleString()}</span>;
                            })()}
                          </td>
                          <td className={`p-4 border-l text-right ${t.textAccent2}`}>
                            ${reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.spentValue || 0), 0).toLocaleString()}
                          </td>
                          <td className={`p-4 text-right ${t.textMuted}`}>
                            ${reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.budget || 0), 0).toLocaleString()}
                          </td>
                          <td className={`p-4 text-right`}>
                            {(() => {
                                const otb = reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.otb || 0), 0);
                                return <span className={otb >= 0 ? t.successText : t.dangerText}>${otb.toLocaleString()}</span>;
                            })()}
                          </td>
                        </tr>
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
                          {[0,1,2,3,4,5].map((o) => (
                            <th key={`head-sug-m${o}`} className={`p-3 border-r ${t.border}`}>{getMonthLabel(o)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).map(g => {
                          const goaPurchases = (purchases || []).filter(p => p.goaId === g.id && p.monthOffset !== null && p.monthOffset !== undefined);
                          const useReal = reportView === 'preventa' && goaPurchases.length > 0;
                          const realPzsByMonth = {};
                          if (useReal) {
                            goaPurchases.forEach(p => {
                              realPzsByMonth[p.monthOffset] = (realPzsByMonth[p.monthOffset] || 0) + (p.totalPieces || 0);
                            });
                          }
                          const monthsWeights = (g.months || [16.6,16.6,16.6,16.6,16.6,17]);
                          return (
                          <tr key={g.id} className={`transition ${t.tableRow}`}>
                            <td className={`p-3 font-bold text-left border-r ${t.border} ${t.textMain}`}>
                              {g.name}
                              {useReal && <span className={`ml-2 text-[8px] px-1.5 py-0.5 rounded font-black border ${t.badgeAA}`}>REAL</span>}
                            </td>
                            <td className={`p-3 font-black border-r ${t.border} ${t.textAccent2}`}>{(g.boughtPzs || 0).toLocaleString()} pzs</td>
                            {[0,1,2,3,4,5].map((o) => {
                              const w = monthsWeights[o];
                              const pctVal = Number(w?.value ?? w) || 0;
                              const pzsCalc = useReal ? (realPzsByMonth[o] || 0) : Math.round((g.boughtPzs || 0) * (pctVal / 100));
                              const pctDisplay = useReal ? ((g.boughtPzs > 0 ? (pzsCalc / g.boughtPzs) * 100 : 0)) : pctVal;
                              // $ por celda: real -> suma totalRetailValue de compras del mes; sugerido -> proporcional a g.spentValue
                              let pesosCalc = 0;
                              if (useReal) {
                                pesosCalc = goaPurchases.filter(p => p.monthOffset === o).reduce((ss, p) => ss + (p.totalRetailValue || 0), 0);
                              } else {
                                pesosCalc = Math.round((g.spentValue || 0) * (pctVal / 100));
                              }
                              return (
                                <td key={`mes-sug-${g.id}-${o}`} className={`p-3 border-r font-medium ${t.border} ${theme==='dark'?'text-gray-300':'text-gray-700'}`}>
                                  <span className={`block text-[9px] mb-0.5 font-mono ${t.textMuted}`}>{pctDisplay.toFixed(1)}%</span>
                                  <span className="block">{pzsCalc.toLocaleString()}</span>
                                  <span className={`block text-[10px] font-bold ${t.textAccent2}`}>${pesosCalc.toLocaleString()}</span>
                                </td>
                              );
                            })}
                          </tr>
                          );
                        })}
                        {/* FILA DE TOTALES (PROYECCIÓN MENSUAL) */}
                        <tr className={`font-black border-t-2 ${theme==='dark'?'bg-purple-900/20 border-purple-500/30':'bg-indigo-50 border-indigo-200'}`}>
                          <td className={`p-3 border-r text-right uppercase text-xs tracking-wider ${theme==='dark'?'border-purple-500/20 text-purple-300':'border-indigo-200 text-indigo-700'}`}>Total Mensual</td>
                          <td className={`p-3 border-r ${t.textAccent2}`}>
                            {reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0).reduce((s, g) => s + (g.boughtPzs || 0), 0).toLocaleString()} pzs
                          </td>
                          {[0,1,2,3,4,5].map(o => {
                             const filtered = reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0);
                             const sumMes = filtered.reduce((s, g) => {
                               const goaPurchases = (purchases || []).filter(p => p.goaId === g.id && p.monthOffset !== null && p.monthOffset !== undefined);
                               const useReal = reportView === 'preventa' && goaPurchases.length > 0;
                               if (useReal) {
                                 return s + goaPurchases.filter(p => p.monthOffset === o).reduce((ss, p) => ss + (p.totalPieces || 0), 0);
                               }
                               const w = (g.months || [16.6,16.6,16.6,16.6,16.6,17])[o];
                               return s + Math.round((g.boughtPzs || 0) * ((Number(w?.value ?? w) || 0) / 100));
                             }, 0);
                             const sumMesPesos = filtered.reduce((s, g) => {
                               const goaPurchases = (purchases || []).filter(p => p.goaId === g.id && p.monthOffset !== null && p.monthOffset !== undefined);
                               const useReal = reportView === 'preventa' && goaPurchases.length > 0;
                               if (useReal) {
                                 return s + goaPurchases.filter(p => p.monthOffset === o).reduce((ss, p) => ss + (p.totalRetailValue || 0), 0);
                               }
                               const w = (g.months || [16.6,16.6,16.6,16.6,16.6,17])[o];
                               return s + Math.round((g.spentValue || 0) * ((Number(w?.value ?? w) || 0) / 100));
                             }, 0);
                             return (
                               <td key={`tot-mes-${o}`} className={`p-3 border-r ${t.textMain}`}>
                                 <div>{sumMes.toLocaleString()}</div>
                                 <div className={`text-[10px] font-bold ${t.textAccent2}`}>${sumMesPesos.toLocaleString()}</div>
                               </td>
                             );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* OTB MENSUAL GENERAL (ppto restante por mes) */}
                <div className={`rounded-xl border shadow-lg p-6 ${t.card}`}>
                  <h2 className={`text-lg font-bold mb-1 flex items-center ${t.textMain}`}>
                    <DollarSign className={`mr-3 ${t.textAccent2}`}/> OTB Mensual General ({reportView === 'sugerido' ? 'Sugerido' : 'Real'})
                  </h2>
                  <p className={`text-xs mb-5 ${t.textMuted}`}>Cuánto ppto te queda por mes para comprar. Budget mensual = Budget GOA × % Forecast del mes. Gastado = lo asignado a ese mes.</p>
                  <div className={`overflow-x-auto rounded-xl border ${t.border}`}>
                    <table className="w-full text-center text-sm border-collapse">
                      <thead>
                        <tr className={`text-[10px] uppercase border-b tracking-wider ${t.tableHead}`}>
                          <th className={`p-3 font-bold text-left border-r ${t.border}`}>Mes</th>
                          <th className={`p-3 font-bold border-r ${t.border}`}>Budget Mensual</th>
                          <th className={`p-3 font-bold border-r ${t.border}`}>Gastado / Sugerido</th>
                          <th className={`p-3 font-bold border-r ${t.border}`}>OTB Restante</th>
                          <th className={`p-3 font-bold ${t.border}`}>% Consumo</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${t.border}`}>
                        {[0,1,2,3,4,5].map(o => {
                          const filtered = reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0);
                          let budgetMes = 0, spentMes = 0;
                          filtered.forEach(g => {
                            const w = (g.months || [16.6,16.6,16.6,16.6,16.6,17])[o];
                            const pctVal = Number(w?.value ?? w) || 0;
                            budgetMes += (g.budget || 0) * (pctVal / 100);
                            const goaPurchases = (purchases || []).filter(p => p.goaId === g.id && p.monthOffset !== null && p.monthOffset !== undefined);
                            const useReal = reportView === 'preventa' && goaPurchases.length > 0;
                            if (useReal) {
                              spentMes += goaPurchases.filter(p => p.monthOffset === o).reduce((ss, p) => ss + (p.totalRetailValue || 0), 0);
                            } else {
                              spentMes += (g.spentValue || 0) * (pctVal / 100);
                            }
                          });
                          const otb = budgetMes - spentMes;
                          const pct = budgetMes > 0 ? (spentMes / budgetMes) * 100 : 0;
                          const overBudget = pct > 100;
                          return (
                            <tr key={`otb-mes-${o}`} className={`transition ${t.tableRow}`}>
                              <td className={`p-3 font-bold text-left border-r ${t.border} ${t.textMain}`}>{getMonthLabel(o)}</td>
                              <td className={`p-3 border-r ${t.border} ${t.textMuted}`}>${Math.round(budgetMes).toLocaleString()}</td>
                              <td className={`p-3 border-r font-bold ${t.border} ${t.textAccent2}`}>${Math.round(spentMes).toLocaleString()}</td>
                              <td className={`p-3 border-r font-black ${t.border} ${otb >= 0 ? t.successText : t.dangerText}`}>${Math.round(otb).toLocaleString()}</td>
                              <td className={`p-3 font-bold ${overBudget ? t.dangerText : pct >= 90 ? 'text-yellow-500' : t.textMain}`}>{pct.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                        <tr className={`font-black border-t-2 ${theme==='dark'?'bg-purple-900/20 border-purple-500/30':'bg-indigo-50 border-indigo-200'}`}>
                          <td className={`p-3 border-r text-right uppercase text-xs tracking-wider ${theme==='dark'?'border-purple-500/20 text-purple-300':'border-indigo-200 text-indigo-700'}`}>Total</td>
                          {(() => {
                            const filtered = reportData.goaMetrics.filter(g => (g.boughtPzs || 0) > 0 || (g.budget || 0) > 0);
                            const totalBudget = filtered.reduce((s, g) => s + (g.budget || 0), 0);
                            const totalSpent = filtered.reduce((s, g) => s + (g.spentValue || 0), 0);
                            const totalOtb = totalBudget - totalSpent;
                            const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
                            return (
                              <>
                                <td className={`p-3 border-r ${t.textMain}`}>${Math.round(totalBudget).toLocaleString()}</td>
                                <td className={`p-3 border-r ${t.textAccent2}`}>${Math.round(totalSpent).toLocaleString()}</td>
                                <td className={`p-3 border-r ${totalOtb >= 0 ? t.successText : t.dangerText}`}>${Math.round(totalOtb).toLocaleString()}</td>
                                <td className={`p-3 ${t.textMain}`}>{totalPct.toFixed(1)}%</td>
                              </>
                            );
                          })()}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RESUMEN POR BUCKET */}
                {(buckets || []).length > 0 && (
                  <div className={`rounded-xl border shadow-lg p-6 ${t.card}`}>
                    <h2 className={`text-lg font-bold mb-1 flex items-center ${t.textMain}`}>
                      <Layers className={`mr-3 ${t.textAccent1}`}/> Resumen por Bucket ({reportView === 'sugerido' ? 'Sugerido' : 'Real'})
                    </h2>
                    <p className={`text-xs mb-5 ${t.textMuted}`}>Vista cruzada Bucket × GOA × Mes con cantidades y montos.</p>
                    <div className={`overflow-x-auto rounded-xl border ${t.border}`}>
                      <table className="w-full text-center text-sm border-collapse">
                        <thead>
                          <tr className={`text-[10px] uppercase border-b tracking-wider ${t.tableHead}`}>
                            <th className={`p-3 font-bold text-left border-r ${t.border}`}>Bucket</th>
                            <th className={`p-3 font-bold text-left border-r ${t.border}`}>GOA</th>
                            {[0,1,2,3,4,5].map(o => <th key={`bk-h-${o}`} className={`p-3 border-r ${t.border}`}>{getMonthLabel(o)}</th>)}
                            <th className={`p-3 font-bold ${t.border}`}>Total</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${t.border}`}>
                          {(() => {
                            // Source: si reportView===preventa usa purchases; sino usa suggestedPlans
                            const isPreventa = reportView === 'preventa';
                            const items = isPreventa ? (purchases || []) : (suggestedPlans || []);
                            // Agrupar por bucketId+goaId
                            const groups = {};
                            items.forEach(it => {
                              const bucketId = it.bucketId ? Number(it.bucketId) : null;
                              const goaId = it.goaId;
                              const key = `${bucketId || 'null'}|${goaId}`;
                              if (!groups[key]) groups[key] = { bucketId, goaId, byMonth: {0:0,1:0,2:0,3:0,4:0,5:0}, byMonthValue: {0:0,1:0,2:0,3:0,4:0,5:0} };
                              const monthOff = it.monthOffset !== null && it.monthOffset !== undefined && it.monthOffset !== '' ? Number(it.monthOffset) : null;
                              if (monthOff === null) return;
                              if (isPreventa) {
                                groups[key].byMonth[monthOff] += (it.totalPieces || 0);
                                groups[key].byMonthValue[monthOff] += (it.totalRetailValue || 0);
                              } else {
                                const goa = goas.find(g => g.id === it.goaId);
                                if (!goa) return;
                                const singleModelPzs = getPiecesForOneModel(goa.name, it.curveId, it.ruleId);
                                const variants = Number(it.variants) || 1;
                                const totalPzs = singleModelPzs * (Number(it.models) || 0) * variants;
                                groups[key].byMonth[monthOff] += totalPzs;
                                groups[key].byMonthValue[monthOff] += totalPzs * (Number(it.pvp) || 0);
                              }
                            });
                            const rows = Object.values(groups);
                            if (rows.length === 0) return <tr><td colSpan="9" className={`p-6 text-center ${t.textMuted}`}>Sin asignaciones de Bucket × Mes en esta vista.</td></tr>;
                            return rows.map((row, idx) => {
                              const bucket = row.bucketId ? (buckets || []).find(b => b.id === row.bucketId) : null;
                              const goa = goas.find(g => g.id === row.goaId);
                              const totalPzs = Object.values(row.byMonth).reduce((s,v) => s+v, 0);
                              const totalValue = Object.values(row.byMonthValue).reduce((s,v) => s+v, 0);
                              return (
                                <tr key={`bk-row-${idx}`} className={`transition ${t.tableRow}`}>
                                  <td className={`p-3 text-left border-r ${t.border} ${t.textMain}`}>{bucket ? bucket.name : <span className="opacity-40">Sin bucket</span>}</td>
                                  <td className={`p-3 text-left border-r ${t.border} ${t.textMuted}`}>{goa ? goa.name : '?'}</td>
                                  {[0,1,2,3,4,5].map(o => (
                                    <td key={`bk-c-${idx}-${o}`} className={`p-3 border-r ${t.border}`}>
                                      <div className={t.textMain}>{(row.byMonth[o] || 0).toLocaleString()}</div>
                                      <div className={`text-[10px] font-bold ${t.textAccent2}`}>${Math.round(row.byMonthValue[o] || 0).toLocaleString()}</div>
                                    </td>
                                  ))}
                                  <td className={`p-3 font-black ${t.textMain}`}>
                                    <div>{totalPzs.toLocaleString()}</div>
                                    <div className={`text-[10px] font-bold ${t.textAccent2}`}>${Math.round(totalValue).toLocaleString()}</div>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

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
                        {(storeSummaryData || []).length === 0 && (
                          <tr><td colSpan="4" className={`p-8 text-center text-xs italic ${t.textMuted}`}>Aún no hay datos en esta vista.</td></tr>
                        )}
                        {(storeSummaryData || []).map(s => {
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
                    
                    {Object.keys(reportData?.matrixByGoa || {}).length === 0 || Object.values(reportData?.matrixByGoa || {}).every(d => (d || []).reduce((acc, row) => acc + (row.totalPzs || 0), 0) === 0) ? (
                      <p className={`text-sm italic p-4 text-center ${t.textMuted}`}>No hay modelos suficientes para graficar la matriz en esta vista.</p>
                    ) : null}
                    
                    {Object.entries(reportData?.matrixByGoa || {}).map(([goaName, data]) => {
                      const totalTiendas = (data || []).reduce((acc, row) => acc + (row.numStores || 0), 0);
                      const totalPiezas = (data || []).reduce((acc, row) => acc + (row.totalPzs || 0), 0);
                      
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
                              {(data || []).map(row => (
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

        {/* === NUEVA PESTAÑA 6: GENERADOR DE CHEQUERAS === */}
        {activeTab === 'chequeras' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-xl border shadow-lg ${t.card}`}>
              <h2 className={`text-xl font-bold mb-4 flex items-center ${t.textMain}`}>
                <LayoutList className={`mr-3 ${t.textAccent1}`}/> Generador de Chequeras (Allocation)
              </h2>
              <p className={`text-sm mb-8 ${t.textMuted}`}>
                Exporta el plan de surtido desglosado a nivel SKU y Talla por Centro para el equipo de Allocation. También puedes subir un archivo externo de preventa para procesarlo con las matrices actuales.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* EXPORTAR DESDE APP */}
                <div className={`p-6 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`font-bold mb-2 flex items-center ${t.textMain}`}><Download className="mr-2 text-green-500" size={18}/> Exportar Desde la App</h3>
                  <p className={`text-xs mb-6 ${t.textMuted}`}>Detalle = línea por centro/talla. Nivel Alto = agregado Sección-Marca-GOA-Modelo-Talla (sin centro).</p>

                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <p className={`col-span-2 text-[10px] font-black uppercase tracking-widest ${t.textAccent1}`}>Sugerido (Forecast)</p>
                    <button onClick={() => generateChequera('sugerido', 'detail')} className={`py-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center justify-center ${t.btnPrimary}`}>
                      Detalle x Centro
                    </button>
                    <button onClick={() => setChequeraModal({ open: true, source: 'sugerido', seccion: '', marca: '' })} className={`py-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center justify-center border ${theme==='dark'?'border-purple-500 text-purple-400 hover:bg-purple-900/30':'border-indigo-500 text-indigo-600 hover:bg-indigo-50'}`}>
                      Nivel Alto
                    </button>

                    <p className={`col-span-2 text-[10px] font-black uppercase tracking-widest mt-3 ${t.textAccent2}`}>Preventa (Real)</p>
                    <button onClick={() => generateChequera('preventa', 'detail')} className={`py-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center justify-center ${t.btnSecondary}`}>
                      Detalle x Centro
                    </button>
                    <button onClick={() => setChequeraModal({ open: true, source: 'preventa', seccion: '', marca: '' })} className={`py-3 rounded-lg text-[11px] font-black uppercase tracking-wider transition flex items-center justify-center border ${theme==='dark'?'border-yellow-500 text-yellow-400 hover:bg-yellow-900/30':'border-yellow-600 text-yellow-700 hover:bg-yellow-50'}`}>
                      Nivel Alto
                    </button>
                  </div>
                </div>

                {/* SUBIR PREVENTA EXTERNA */}
                <div className={`p-6 rounded-xl border ${t.cardInner}`}>
                  <h3 className={`font-bold mb-2 flex items-center ${t.textMain}`}><Upload className="mr-2 text-blue-500" size={18}/> Procesar Preventa Externa</h3>
                  <p className={`text-xs mb-6 ${t.textMuted}`}>
                    Sube un CSV de preventa. <span className="font-bold">Columnas requeridas: GOA, Modelo, Curva, Regla.</span> La app cruzará estos datos con tu matriz y devolverá el archivo de Allocation.
                  </p>
                  
                  <label className={`cursor-pointer w-full h-24 rounded-xl text-xs font-black uppercase tracking-widest transition flex flex-col items-center justify-center border-2 border-dashed ${theme==='dark'?'border-zinc-700 text-zinc-500 hover:border-yellow-400 hover:text-yellow-400 bg-zinc-900/50':'border-gray-300 text-gray-400 hover:border-blue-500 hover:text-blue-500 bg-gray-50'}`}>
                    <Upload size={24} className="mb-2" /> 
                    Subir y Procesar Archivo (.CSV)
                    <input type="file" accept=".csv" onClick={(e) => e.target.value = null} onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const text = event.target.result.replace(/^\uFEFF/, '');
                        const rows = parseCSV(text);
                        if(rows.length < 2) return;
                        
                        const headers = rows[0].map(h => h.toUpperCase());
                        const idxGoa = headers.findIndex(h => h === 'GOA' || h === 'FAMILIA');
                        const idxMod = headers.findIndex(h => h === 'MODELO' || h === 'SKU');
                        const idxCur = headers.findIndex(h => h === 'CURVA' || h === 'TALLAS');
                        const idxReg = headers.findIndex(h => h === 'REGLA' || h === 'CLUSTER');

                        if(idxGoa === -1 || idxMod === -1 || idxCur === -1 || idxReg === -1) {
                           alert("Tu CSV externo debe tener las columnas: GOA, MODELO, CURVA, REGLA");
                           return;
                        }

                        let tempExternalPurchases = [];
                        for(let i=1; i<rows.length; i++) {
                           if(!rows[i][idxGoa]) continue;
                           const goaName = rows[i][idxGoa];
                           const modeloName = rows[i][idxMod];
                           const curveName = rows[i][idxCur];
                           const ruleName = rows[i][idxReg];

                           const goaObj = goas.find(g => g.name.toUpperCase() === goaName.toUpperCase());
                           const curveObj = sizeCurves.find(c => c.name.toUpperCase() === curveName.toUpperCase());
                           const ruleObj = calcRules.find(r => r.name.toUpperCase() === ruleName.toUpperCase());

                           if(goaObj && curveObj && ruleObj) {
                              tempExternalPurchases.push({
                                 id: Date.now()+i, goaId: goaObj.id, goaName: goaObj.name, modelo: modeloName, curveId: curveObj.id, ruleId: ruleObj.id
                              });
                           }
                        }

                        if(tempExternalPurchases.length === 0) {
                           alert("No se pudieron emparejar las Reglas, Curvas o GOAs del archivo con la configuración actual.");
                           return;
                        }

                        // Generar el CSV al vuelo sin afectar el state actual
                        let csvOut = "GOA,Modelo,Variante,Centro,Nombre_Centro,Cluster,Talla,Piezas\r\n";
                        tempExternalPurchases.forEach((plan, i) => {
                           const goa = goas.find(g => g.id === plan.goaId);
                           const rule = calcRules.find(r => r.id === Number(plan.ruleId));
                           const curve = sizeCurves.find(c => c.id === Number(plan.curveId));
                           const sizes = curve.sizes.split(',').map(s => s.trim());
                           const weights = curve.weights.split(',').map(w => Number(w.trim()));

                           stores.forEach(store => {
                             const c = store.clusters[goa.name] || store.clusters[goa.name.toUpperCase()] || activeClusters[activeClusters.length - 1];
                             const runs = rule.corridas[c] || 0;
                             if(runs > 0) {
                               sizes.forEach((talla, tIdx) => {
                                 const pzs = runs * (weights[tIdx] || 0);
                                 if(pzs > 0) {
                                   csvOut += `"${goa.name}","${plan.modelo}","Única","${store.centerCode}","${store.name}","${c}","${talla}",${pzs}\r\n`;
                                 }
                               });
                             }
                           });
                        });

                        const blob = new Blob(["\uFEFF" + csvOut], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `Chequera_Externa_${new Date().toISOString().slice(0,10)}.csv`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      };
                      reader.readAsText(file, 'UTF-8');
                    }} className="hidden" />
                  </label>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL PARA GUARDAR SESIÓN */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-96 p-6 rounded-2xl shadow-2xl border ${theme==='dark'?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-bold mb-4 ${t.textMain}`}>Guardar Sesión</h3>
            <p className={`text-xs mb-4 ${t.textMuted}`}>Ingresa un nombre para identificar este escenario o GOA.</p>
            <input
              type="text"
              placeholder="Ej. Escenario_Verano_2026"
              value={saveFileName}
              onChange={e => setSaveFileName(e.target.value)}
              className={`w-full p-3 rounded-lg mb-6 text-sm font-bold outline-none border focus:ring-1 focus:ring-yellow-500 ${theme==='dark' ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-black'}`}
              autoFocus
            />
            <div className="flex space-x-3">
              <button onClick={() => setIsSaveModalOpen(false)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${t.btnGhost}`}>Cancelar</button>
              <button onClick={confirmExportProject} className={`flex-1 py-2.5 rounded-lg text-sm font-black transition ${t.btnPrimary}`}>Descargar</button>
            </div>
          </div>
        </div>
      )}

      {chequeraModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-[420px] p-6 rounded-2xl shadow-2xl border ${theme==='dark'?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-bold mb-2 ${t.textMain}`}>Chequera Nivel Alto — {chequeraModal.source === 'sugerido' ? 'Sugerido' : 'Preventa'}</h3>
            <p className={`text-xs mb-5 ${t.textMuted}`}>Estos valores se aplicarán a todas las filas. Si los dejas vacíos quedan en blanco.</p>
            <div className="space-y-3 mb-6">
              <div>
                <label className={`text-[10px] font-black uppercase tracking-wider mb-1 block ${t.textMuted}`}>Sección</label>
                <input type="text" placeholder="Ej. Damas" value={chequeraModal.seccion} onChange={e=>setChequeraModal({...chequeraModal, seccion: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm font-bold outline-none border ${theme==='dark' ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-black'}`} autoFocus />
              </div>
              <div>
                <label className={`text-[10px] font-black uppercase tracking-wider mb-1 block ${t.textMuted}`}>Marca</label>
                <input type="text" placeholder="Ej. MarcaPropia" value={chequeraModal.marca} onChange={e=>setChequeraModal({...chequeraModal, marca: e.target.value})} className={`w-full p-2.5 rounded-lg text-sm font-bold outline-none border ${theme==='dark' ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-black'}`} />
              </div>
            </div>
            <div className="flex space-x-3">
              <button onClick={() => setChequeraModal({ ...chequeraModal, open: false })} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${t.btnGhost}`}>Cancelar</button>
              <button onClick={() => { generateChequera(chequeraModal.source, 'high', { seccion: chequeraModal.seccion, marca: chequeraModal.marca }); setChequeraModal({ ...chequeraModal, open: false }); }} className={`flex-1 py-2.5 rounded-lg text-sm font-black transition ${t.btnPrimary}`}>Descargar</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme === 'dark' ? '#3f3f46' : '#d1d5db'}; border-radius: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme === 'dark' ? '#52525b' : '#9ca3af'}; }`}} />
    </div>
  );
}

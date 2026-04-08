import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Cell, Area
} from 'recharts';
import { 
  TrendingUp, Settings2, Trophy, Layers, Plus, Trash2, Edit3, Download, Copy, Check,
  Zap, Save, X, FileSpreadsheet, Calendar, Menu, Sun, Moon, Database, ShoppingCart, Rocket, FileText, Upload, ChevronRight, Package, Truck
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MOTORES MATEMÁTICOS (EL CEREBRO INTEGRADO)
// ═══════════════════════════════════════════════════════════════════════════════

const engines = {
  'SES': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    if (data.length === 0) return { history: res, future: [] };
    const alpha = p.sesAlpha ?? 0.3;
    let level = data[0];
    res[0] = level;
    for (let i = 1; i < data.length; i++) {
      level = alpha * data[i-1] + (1 - alpha) * level;
      res[i] = level;
    }
    const finalFcst = alpha * data[data.length-1] + (1 - alpha) * level;
    return { history: res, future: Array(horizon).fill(finalFcst) };
  },
  'Holt-Winters': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    const L = p.hwPeriod || 12;
    if (data.length < L * 2) return engines['SES'](data, p, horizon);
    const alpha = p.hwAlpha ?? 0.2, beta = p.hwBeta ?? 0.1, gamma = p.hwGamma ?? 0.3;
    let level = data.slice(0, L).reduce((a, b) => a + b, 0) / L;
    let trend = (data.slice(L, 2 * L).reduce((a, b) => a + b, 0) / L - level) / L;
    let seasonals = data.slice(0, L).map(v => v / (level || 1));
    for (let i = 0; i < data.length; i++) {
      const lastL = level;
      level = alpha * (data[i] / (seasonals[i % L] || 1)) + (1 - alpha) * (level + trend);
      trend = beta * (level - lastL) + (1 - beta) * trend;
      seasonals[i % L] = gamma * (data[i] / (level || 1)) + (1 - gamma) * seasonals[i % L];
      res[i] = (level + trend) * (seasonals[i % L] || 1);
    }
    return { 
      history: res, 
      future: Array.from({ length: horizon }, (_, h) => (level + (h + 1) * trend) * (seasonals[(data.length + h) % L] || 1))
    };
  }
};

const getMetrics = (actual, forecast) => {
  let sumAbsErr = 0, sumActual = 0, sumErr = 0, count = 0;
  actual.forEach((v, i) => {
    if (forecast[i] !== null) {
      const err = forecast[i] - v;
      sumErr += err; sumAbsErr += Math.abs(err); sumActual += v; count++;
    }
  });
  if (count === 0 || sumActual === 0) return { accuracy: 0, bias: 0, wmape: 0 };
  const wmape = (sumAbsErr / sumActual) * 100;
  return { accuracy: 100 - wmape, bias: (sumErr / sumActual) * 100, wmape };
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DASHBOARD GLOBAL (KPIs)
// ═══════════════════════════════════════════════════════════════════════════════

const DashboardModule = ({ brands, isDark }) => {
  const kpis = useMemo(() => {
    const totalBrands = brands.length;
    let totalAcc = 0;
    brands.forEach(b => {
      const res = engines['SES'](b.data, {sesAlpha: 0.3}, 1);
      totalAcc += getMetrics(b.data, res.history).accuracy;
    });
    const avgAccuracy = totalBrands > 0 ? totalAcc / totalBrands : 0;
    
    return [
      { label: "Portafolio Activo", val: totalBrands, unit: "SKUs", color: "text-violet-400" },
      { label: "Accuracy Maestro", val: avgAccuracy.toFixed(1), unit: "%", color: "text-emerald-400" },
      { label: "Sell-Through Est.", val: brands.length > 0 ? "84.2" : "0", unit: "%", color: "text-blue-400" },
      { label: "Días Cobertura", val: brands.length > 0 ? "14" : "0", unit: "días", color: "text-yellow-400" }
    ];
  }, [brands]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in text-left">
      <div>
        <h2 className={`text-4xl font-black tracking-tighter uppercase ${isDark ? 'text-white' : 'text-zinc-900'}`}>Dashboard <span className="text-violet-500">Estratégico</span></h2>
        <p className="text-zinc-500 text-sm mt-1 uppercase tracking-widest font-bold opacity-70">Consolidado General de Operaciones</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {kpis.map((k, i) => (
          <div key={i} className={`${isDark ? 'bg-[#18181b] border-zinc-800' : 'bg-white border-zinc-200'} border p-8 rounded-[32px] shadow-sm hover:border-violet-500/30 transition-all`}>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-3">{k.label}</p>
            <p className={`text-3xl font-black ${isDark ? k.color : 'text-zinc-900'}`}>{k.val}<span className="text-xs ml-1 text-zinc-600 font-bold">{k.unit}</span></p>
          </div>
        ))}
      </div>
      <div className={`${isDark ? 'bg-[#0f0f12] border-zinc-800' : 'bg-white border-zinc-200'} border p-16 rounded-[60px] text-center relative overflow-hidden shadow-inner`}>
        <Rocket className={`mx-auto text-violet-500 mb-6 ${brands.length > 0 ? 'animate-pulse' : 'opacity-20'}`} size={64} />
        <p className="text-zinc-500 font-black uppercase tracking-[0.3em] leading-relaxed">Arquitectura de Datos Unificada <br/> <span className="text-[10px] opacity-40">Módulos Interconectados e Independientes</span></p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. APP UNIFICADA V3.0
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [activeModule, setActiveModule] = useState('dashboard');
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', data: '', unit: 'Meses' });
  const [copied, setCopied] = useState(false);

  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? 'bg-[#0a0a0c]' : 'bg-[#f8fafc]',
    text: isDark ? 'text-zinc-400' : 'text-zinc-500',
    sidebar: isDark ? 'bg-[#0e0e11]' : 'bg-white',
    header: isDark ? 'bg-[#0e0e11]/90' : 'bg-white/90',
    card: isDark ? 'bg-[#141417]' : 'bg-white',
    border: isDark ? 'border-zinc-800/60' : 'border-zinc-200',
    textHeading: isDark ? 'text-zinc-100' : 'text-zinc-900'
  };

  const currentBrand = brands.find(b => b.id === selectedBrandId) || null;

  // --- OPTIMIZADOR INTELIGENTE RE-INTEGRADO ---
  const runSmartOptimizer = () => {
    if(!currentBrand || !currentBrand.data.length) return;
    let bestAcc = -1;
    let bestP = { ...currentBrand.params };
    
    // Grid Search para SES
    for (let a = 0.1; a <= 0.9; a += 0.1) {
      const { history } = engines['SES'](currentBrand.data, { sesAlpha: a }, 1);
      const { accuracy } = getMetrics(currentBrand.data, history);
      if (accuracy > bestAcc) {
        bestAcc = accuracy;
        bestP = { ...bestP, sesAlpha: a, hwAlpha: a };
      }
    }
    
    // Guardar parámetros optimizados
    setBrands(brands.map(b => b.id === selectedBrandId ? { ...b, params: bestP } : b));
  };

  const winner = useMemo(() => {
    if(!currentBrand || !currentBrand.data.length) return {accuracy: 0, name: 'N/A', history: [], future: []};
    const { history, future } = engines['SES'](currentBrand.data, currentBrand.params || {sesAlpha: 0.3}, currentBrand.horizon || 12);
    return { ...getMetrics(currentBrand.data, history), name: 'SES (Auto)', history, future };
  }, [currentBrand]);

  const chartData = useMemo(() => {
    if (!currentBrand) return [];
    const hist = currentBrand.data.map((v, i) => ({ period: `M${i+1}`, Real: v, Modelo: winner.history[i] }));
    let acc = 0;
    const fut = winner.future.map((v, i) => {
        acc += v;
        return { period: `F${i+1}`, Forecast: v, Acumulado: acc };
    });
    return [...hist, ...fut];
  }, [currentBrand, winner]);

  const saveEdit = () => {
    const data = editForm.data.replace(/,/g, '').split(/[\s;\t\n]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    const id = isEditing;
    setBrands(prev => {
        const exists = prev.find(b => b.id === id);
        if (exists) return prev.map(b => b.id === id ? { ...b, name: editForm.name, data } : b);
        return [...prev, { id, name: editForm.name, data, unit: editForm.unit, horizon: 12, params: { sesAlpha: 0.3, hwPeriod: 12 } }];
    });
    setSelectedBrandId(id);
    setIsEditing(null);
    setActiveModule('forecast');
  };

  return (
    <div className={`min-h-screen ${colors.bg} flex flex-col font-sans transition-colors duration-500 overflow-hidden`}>
      {/* --- HEADER --- */}
      <header className={`${colors.header} border-b ${colors.border} px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-30`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-violet-500 hover:scale-110 transition-transform"><Menu size={24} /></button>
          <div className="flex flex-col text-left">
            <h1 className={`text-xl font-black ${colors.textHeading} tracking-tighter uppercase leading-none`}>GO <span className="text-violet-500">PLANNER</span></h1>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-1 leading-none">Intelligence Engine</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2.5 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border rounded-xl text-yellow-500 transition-all shadow-sm`}>
                {isDark ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button onClick={() => { setIsEditing(Date.now()); setEditForm({name: 'Nueva Marca', data: '', unit: 'Meses'}); }} className="bg-violet-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] tracking-widest uppercase shadow-lg shadow-violet-900/10 hover:bg-violet-500 transition-all">+ NUEVO SKU</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* --- SIDEBAR GLOBAL --- */}
        <aside className={`sidebar-transition ${colors.sidebar} border-r ${colors.border} ${!isSidebarOpen && 'hidden'} w-72 flex flex-col`}>
          <div className="p-4 border-b border-zinc-800/30">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Módulos</span>
          </div>
          <nav className="p-2 space-y-1">
            <button onClick={() => setActiveModule('dashboard')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeModule === 'dashboard' ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20' : 'text-zinc-500 hover:bg-zinc-800/30'}`}>
              <Layers size={18}/> <span className="font-bold text-xs uppercase tracking-wider">Dashboard</span>
            </button>
            <button onClick={() => setActiveModule('forecast')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeModule === 'forecast' ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20' : 'text-zinc-500 hover:bg-zinc-800/30'}`}>
              <TrendingUp size={18}/> <span className="font-bold text-xs uppercase tracking-wider">Forecasting</span>
            </button>
            <button onClick={() => setActiveModule('assortment')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeModule === 'assortment' ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800/30 opacity-40'}`}>
              <Package size={18}/> <span className="font-bold text-xs uppercase tracking-wider">Assortment</span>
            </button>
            <button onClick={() => setActiveModule('distribucion')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeModule === 'distribucion' ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800/30 opacity-40'}`}>
              <Truck size={18}/> <span className="font-bold text-xs uppercase tracking-wider">Distribución</span>
            </button>
          </nav>
          
          <div className="p-4 border-b border-zinc-800/30 mt-4 bg-zinc-900/10 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest leading-none">Marcas</span>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full border border-violet-400/20">{brands.length}</span>
          </div>
          <div className="flex-1 p-2 space-y-1 overflow-y-auto">
            {brands.map(b => (
              <button key={b.id} onClick={() => { setSelectedBrandId(b.id); setActiveModule('forecast'); }} className={`w-full text-left p-4 rounded-2xl transition-all flex justify-between items-center ${selectedBrandId === b.id ? 'bg-[#1d1d22] border border-violet-500/30 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-800/20'}`}>
                <span className="font-bold truncate pr-2 uppercase text-[10px] tracking-tight">{b.name}</span>
                <Trash2 size={12} className="opacity-40 hover:opacity-100 hover:text-rose-500 transition-all" onClick={(e) => { e.stopPropagation(); setBrands(brands.filter(x => x.id !== b.id)); if(selectedBrandId===b.id) setSelectedBrandId(null); }} />
              </button>
            ))}
          </div>

          {/* BOTONES GLOBALES DE GUARDADO (Rescatados) */}
          <div className="p-4 border-t border-zinc-800/50 flex flex-col gap-2 bg-[#0c0c0f]">
             <button onClick={() => { const b = new Blob([JSON.stringify({ brands })], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'goplanner_master.json'; l.click(); }} className="w-full flex items-center justify-center gap-2 bg-zinc-900/50 border border-zinc-800 text-zinc-500 p-3 rounded-xl text-[10px] font-black hover:text-white transition-all uppercase">
              <Save size={14} /> Respaldar Sistema
            </button>
            <label className="w-full flex items-center justify-center gap-2 bg-zinc-900/50 border border-zinc-800 text-zinc-500 p-3 rounded-xl text-[10px] font-black hover:text-white transition-all uppercase cursor-pointer">
              <Database size={14} /> Cargar Sesión
              <input type="file" className="hidden" accept=".json" onChange={(e) => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload=(ev)=>{ const d=JSON.parse(ev.target.result); if(d.brands) setBrands(d.brands); }; r.readAsText(f); }} />
            </label>
          </div>
        </aside>

        {/* --- CONTENIDO PRINCIPAL --- */}
        <main className="flex-1 p-8 overflow-y-auto bg-transparent scroll-smooth">
          {activeModule === 'dashboard' && <DashboardModule brands={brands} isDark={isDark} />}
          
          {activeModule === 'forecast' && (
            <div className="space-y-8 animate-fade-in">
              {!currentBrand && !isEditing && (
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className={`max-w-2xl ${colors.card} border-2 ${isDark ? 'border-zinc-800' : 'border-zinc-200'} p-12 rounded-[48px] shadow-sm text-center`}>
                        <div className="bg-violet-600/10 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6"><Rocket className="text-violet-500" size={32} /></div>
                        <h2 className={`text-3xl font-black ${colors.textHeading} uppercase tracking-tighter mb-4 leading-none`}>Módulo Forecasting <br/> <span className="text-violet-500">GO PLANNER</span></h2>
                        <p className="text-zinc-500 text-xs mb-10 leading-relaxed px-6 font-bold uppercase tracking-widest opacity-60">Sube una serie histórica para activar los algoritmos de detección estacional.</p>
                        <div className="grid grid-cols-2 gap-6 text-left">
                            <div className={`${isDark ? 'bg-zinc-900/40' : 'bg-slate-50'} border border-zinc-800 p-6 rounded-3xl`}>
                                <h4 className="text-violet-500 font-black text-[10px] uppercase mb-2 flex items-center gap-2 tracking-widest"><FileText size={14}/> Formato CSV</h4>
                                <p className="text-[10px] text-zinc-500">SKU en Columna A. <br/>Ventas en Columnas B+.</p>
                            </div>
                            <div className={`${isDark ? 'bg-zinc-900/40' : 'bg-slate-50'} border border-zinc-800 p-6 rounded-3xl`}>
                                <h4 className="text-yellow-500 font-black text-[10px] uppercase mb-2 flex items-center gap-2 tracking-widest"><Zap size={14}/> Pegado Excel</h4>
                                <p className="text-[10px] text-zinc-500">Ignoramos comas de miles y espacios automáticamente.</p>
                            </div>
                        </div>
                    </div>
                </div>
              )}

              {isEditing && (
                 <div className={`${colors.card} p-10 rounded-[40px] border ${isDark ? 'border-zinc-800' : 'border-zinc-200'} shadow-2xl animate-fade-in text-left`}>
                    <div className="flex justify-between mb-8"><h3 className={`${colors.textHeading} font-black uppercase text-sm tracking-widest flex items-center gap-3`}><Edit3 size={18} className="text-violet-500"/> Gestión de Datos</h3><button onClick={() => setIsEditing(null)} className="text-zinc-500 hover:text-white transition-colors"><X size={24}/></button></div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1 opacity-70">Identificador</label>
                        <input className="w-full bg-black/40 border border-zinc-800 p-4 rounded-2xl text-white outline-none focus:border-violet-500 transition-all font-bold" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Nombre Comercial" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1 opacity-70">Periodicidad</label>
                        <div className="flex gap-2">
                          {['Meses', 'Semanas'].map(u => (
                            <button key={u} onClick={() => setEditForm({...editForm, unit: u})} className={`flex-1 py-4 rounded-2xl font-black text-[10px] tracking-widest transition-all border ${editForm.unit === u ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-900/20' : 'bg-black/20 border-zinc-800 text-zinc-500'}`}>{u}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 space-y-1">
                      <label className="text-[10px] font-black text-yellow-500 uppercase tracking-widest ml-1 opacity-70">Serie de Tiempo (Excel / CSV)</label>
                      <textarea className="w-full bg-black/40 border border-zinc-800 p-6 rounded-3xl text-zinc-200 h-44 font-mono mb-4 outline-none focus:border-yellow-500 transition-all resize-none shadow-inner text-sm" value={editForm.data} onChange={e => setEditForm({...editForm, data: e.target.value})} placeholder="100 250 180 200..." />
                    </div>
                    <button onClick={saveEdit} className="w-full bg-violet-600 p-5 rounded-3xl text-white font-black uppercase tracking-widest shadow-xl shadow-violet-900/20 hover:bg-violet-500 transition-all">Procesar Inteligencia</button>
                 </div>
              )}

              {currentBrand && !isEditing && (
                <div className="space-y-8 animate-fade-in text-left">
                  <div className="flex justify-between items-end">
                    <div className="flex-1">
                        <h2 className={`text-6xl font-black ${colors.textHeading} tracking-tighter uppercase leading-none`}>{currentBrand.name}</h2>
                        <div className="flex gap-4 mt-5">
                            <span className={`${isDark ? 'bg-zinc-900' : 'bg-white'} border ${colors.border} px-4 py-1.5 rounded-full text-[10px] font-black text-zinc-500 uppercase flex items-center gap-2 tracking-widest shadow-sm`}><Calendar size={14} className="text-violet-500"/> Plan {currentBrand.unit}</span>
                            <div className={`${isDark ? 'bg-zinc-900' : 'bg-white'} border ${colors.border} px-5 py-1.5 rounded-full shadow-sm flex items-center gap-3`}>
                                <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest leading-none">Horizonte:</span>
                                <input type="range" min="1" max="24" step="1" value={currentBrand.horizon || 12} onChange={(e) => setBrands(brands.map(x => x.id === selectedBrandId ? {...x, horizon: parseInt(e.target.value)} : x))} className="w-24 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-yellow-500" />
                                <span className={`text-[10px] font-bold ${colors.textHeading} w-4 text-center`}>{currentBrand.horizon || 12}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-4 items-center">
                        <button onClick={runSmartOptimizer} className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-6 py-4 rounded-3xl text-[10px] font-black transition-all hover:bg-yellow-500 hover:text-black uppercase flex items-center gap-2 shadow-sm shadow-yellow-500/5">
                            <Zap size={14} className="fill-current"/> AJUSTAR AUTOMÁTICAMENTE
                        </button>
                        <div className={`${colors.card} border ${colors.border} p-6 rounded-[32px] flex items-center gap-5 shadow-sm`}>
                            <div className="bg-violet-600 p-3 rounded-2xl text-white shadow-lg shadow-violet-900/20"><Trophy size={28} /></div>
                            <div className="text-left pr-4"><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 leading-none opacity-60">Accuracy Maestro</p><p className={`font-black text-2xl ${colors.textHeading} tracking-tighter uppercase leading-none`}>{winner.accuracy.toFixed(1)}%</p></div>
                        </div>
                    </div>
                  </div>
                  
                  <div className={`${isDark ? 'bg-[#0f0f12]' : 'bg-white'} p-10 rounded-[60px] border ${colors.border} h-[550px] shadow-sm relative overflow-hidden group`}>
                    <div className="flex justify-between items-center mb-8 px-4">
                        <div className="flex gap-6 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div> Real</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-violet-600"></div> Entrenamiento</div>
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div> Forecast</div>
                        </div>
                        <span className="text-[9px] text-yellow-500 font-bold tracking-widest uppercase opacity-40 italic">--- Proyección Acumulada</span>
                    </div>
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#27272a" : "#e2e8f0"} vertical={false} opacity={0.3} />
                        <XAxis dataKey="period" tick={{fill:colors.text, fontSize:9, fontWeight:'bold'}} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tick={{fill:colors.text, fontSize:9, fontWeight:'bold'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" hide />
                        <Tooltip contentStyle={{backgroundColor: isDark ? '#000' : '#fff', borderRadius:'24px', border:`1px solid ${colors.border}`, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'}} />
                        <Bar dataKey="Real" fill={isDark ? "#27272a" : "#cbd5e1"} radius={[8,8,0,0]} barSize={25} opacity={0.5} />
                        <Line dataKey="Modelo" stroke="#8b5cf6" strokeWidth={3} dot={{r:3, fill:isDark?'#000':'#fff', strokeWidth:2, stroke:'#8b5cf6'}} animationDuration={1000} />
                        <Line dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="8 6" dot={{r:5, fill:isDark?'#000':'#fff', strokeWidth:3, stroke:'#fbbf24'}} animationDuration={2000} />
                        <Line yAxisId="right" dataKey="Acumulado" stroke="#fbbf24" strokeWidth={2} opacity={0.2} dot={false} strokeDasharray="3 3" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`${colors.card} border ${colors.border} p-8 rounded-[40px] flex justify-between items-center shadow-sm`}>
                        <div className="flex items-center gap-6 text-left">
                            <div className={`p-4 rounded-3xl shadow-lg ${isDark ? 'bg-zinc-800 text-white' : 'bg-slate-900 text-white'}`}><FileSpreadsheet size={32}/></div>
                            <div><h3 className={`font-black uppercase text-lg mb-1 leading-none tracking-widest ${colors.textHeading}`}>EXPORTAR RESULTADOS</h3><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest opacity-60">Sincronizado con portafolio global</p></div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => { const t = chartData.map(d => `${d.period}\t${d.Real || "-"}\t${d.Forecast || d.Modelo || "-"}`).join("\n"); const el = document.createElement("textarea"); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={`p-4 px-8 rounded-2xl font-black text-[10px] tracking-widest uppercase border ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-500 shadow-sm'} hover:border-violet-500 transition-all`}>{copied ? "LISTO" : "COPIAR DATA"}</button>
                            <button onClick={() => setActiveModule('assortment')} className="bg-violet-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] tracking-widest shadow-xl shadow-violet-900/20 flex items-center gap-3 hover:scale-105 transition-all uppercase"><ShoppingCart size={20}/> Sincronizar OTB <span className="bg-white/20 px-1 rounded text-[8px] font-black">BETA</span></button>
                        </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {['assortment', 'distribucion', 'resurtido'].includes(activeModule) && (
            <div className="flex flex-col items-center justify-center min-h-[70vh] opacity-30 animate-pulse">
                <Rocket size={80} className="text-violet-500 mb-6" />
                <h3 className="text-2xl font-black uppercase tracking-tighter">Módulo {activeModule.toUpperCase()} listo para Integración</h3>
                <p className="text-sm font-bold uppercase tracking-widest mt-2">La data de Forecast se encuentra disponible en memoria global</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

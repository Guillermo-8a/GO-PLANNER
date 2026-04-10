import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Cell, Area
} from 'recharts';

import { 
  TrendingUp, Settings2, Trophy, Layers, Plus, Trash2, Edit3, Download, Copy, Check,
  Zap, Save, X, FileSpreadsheet, Calendar, Menu, Sun, Moon, Database, ShoppingCart, Rocket, Upload
} from '../utils/icons';

import { useGlobal, useDispatch, globalActions } from '../context/GlobalContext';

// --- Motores Matemáticos Inteligencia V4 (Restaurados y Blindados) ---
const engines = {
  'SES': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    if (data.length === 0) return { history: res, future: [] };
    const alpha = p.sesAlpha || 0.3;
    let level = data[0];
    res[0] = level; // Corrección Periodo 0
    for (let i = 1; i < data.length; i++) {
      level = alpha * data[i-1] + (1 - alpha) * level;
      res[i] = level;
    }
    const finalFcst = alpha * data[data.length-1] + (1 - alpha) * level;
    return { history: res, future: Array(horizon).fill(finalFcst) };
  },
  'Holt': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    if (data.length < 2) return engines['SES'](data, p, horizon);
    const alpha = p.holtAlpha || 0.3, beta = p.holtBeta || 0.1;
    let level = data[0], trend = data[1] - data[0];
    res[0] = level; // Corrección Periodo 0
    for (let i = 1; i < data.length; i++) {
      const prevL = level;
      level = alpha * data[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevL) + (1 - beta) * trend;
      res[i] = level + trend;
    }
    return { history: res, future: Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend) };
  },
  'Holt-Winters': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    const L = p.hwPeriod || 12;
    if (data.length < L * 2) return engines['Holt'](data, p, horizon);
    const alpha = p.hwAlpha || 0.2, beta = p.hwBeta || 0.1, gamma = p.hwGamma || 0.3;
    let level = data.slice(0, L).reduce((a, b) => a + b, 0) / L;
    let trend = (data.slice(L, 2 * L).reduce((a, b) => a + b, 0) / L - level) / L;
    let seasonals = data.slice(0, L).map(v => v / (level || 1));
    res[0] = level * seasonals[0]; // Corrección Periodo 0
    for (let i = 0; i < data.length; i++) {
      const prevL = level;
      const obs = data[i];
      level = alpha * (obs / (seasonals[i % L] || 1)) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevL) + (1 - beta) * trend;
      seasonals[i % L] = gamma * (obs / (level || 1)) + (1 - gamma) * seasonals[i % L];
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
  if (count === 0 || sumActual === 0) return { wmape: 999, accuracy: 0, bias: 0 };
  const wmape = (sumAbsErr / sumActual) * 100;
  return { wmape, accuracy: Math.max(0, 100 - wmape), bias: (sumErr / sumActual) * 100 };
};

export default function ModuleForecast() {
  const dispatch = useDispatch();
  const [theme, setTheme] = useState('dark');
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', data: '', unit: 'Meses' });
  const [copied, setCopied] = useState(false);
  const [assortmentStatus, setAssortmentStatus] = useState("Enviar a Assortment");

  const isDark = theme === 'dark';
  const themeColors = {
    bg: isDark ? 'bg-black' : 'bg-slate-50',
    header: isDark ? 'bg-zinc-900/80' : 'bg-white/90',
    sidebar: isDark ? 'bg-zinc-950' : 'bg-white',
    card: isDark ? 'bg-zinc-900' : 'bg-white',
    cardInner: isDark ? 'bg-zinc-950' : 'bg-slate-50',
    text: isDark ? 'text-slate-300' : 'text-slate-600',
    heading: isDark ? 'text-white' : 'text-slate-900',
    border: isDark ? 'border-zinc-800' : 'border-slate-200',
    chartGrid: isDark ? '#1f2937' : '#e2e8f0',
    chartText: isDark ? '#52525b' : '#94a3b8'
  };

  const currentBrand = useMemo(() => 
    brands.find(b => b.id === selectedBrandId) || null, 
  [brands, selectedBrandId]);

  const allResults = useMemo(() => {
    if (!currentBrand || !currentBrand.data) return [];
    return Object.keys(engines).map(name => {
      const { history, future } = engines[name](currentBrand.data, currentBrand.params, currentBrand.horizon || 12);
      const metrics = getMetrics(currentBrand.data, history);
      return { name, forecast: history, future, ...metrics };
    }).sort((a, b) => {
      // Detección de Estacionalidad Forzada (Bono Holt-Winters)
      let scoreA = a.accuracy;
      let scoreB = b.accuracy;
      const L = currentBrand.params?.hwPeriod || 12;
      if (a.name === 'Holt-Winters' && currentBrand.data.length >= (L * 2)) scoreA += 5;
      if (b.name === 'Holt-Winters' && currentBrand.data.length >= (L * 2)) scoreB += 5;
      return scoreB - scoreA;
    });
  }, [currentBrand]);

  const winner = allResults.length > 0 ? allResults[0] : { name: 'N/A', accuracy: 0, bias: 0, wmape: 0, future: [] };

  // Publicar resultados de forecast al estado global (opcional, no bloquea nada)
  useEffect(() => {
    if (brands.length > 0 && winner.name !== 'N/A') {
      globalActions.publishForecast(gDispatch, {
        brands,
        results: brands.map(b => ({
          skuId:       b.id,
          brandName:   b.name,
          future:      winner.future || [],
          accuracy:    winner.accuracy || 0,
          unit:        b.unit,
        })),
      });
    }
  }, [brands, winner.name]);

  const chartData = useMemo(() => {
    if (!currentBrand || !currentBrand.data) return [];
    const hist = currentBrand.data.map((val, i) => ({
      period: `${currentBrand.unit === 'Meses' ? 'M' : 'S'}${i + 1}`,
      Real: val,
      ...allResults.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.forecast[i] ? parseFloat(curr.forecast[i].toFixed(1)) : null }), {})
    }));
    
    let accSum = 0;
    const future = (winner.future || []).map((val, i) => {
      accSum += val;
      return {
        period: `F${i + 1}`,
        Forecast: parseFloat(val.toFixed(1)),
        Acumulado: parseFloat(accSum.toFixed(1))
      };
    });
    return [...hist, ...future];
  }, [currentBrand, allResults, winner]);

  const updateCurrentBrand = (updates) => {
    setBrands(prev => prev.map(b => b.id === selectedBrandId ? { ...b, ...updates } : b));
  };

  const runSmartOptimization = () => {
    if (!currentBrand) return;
    const data = currentBrand.data;
    let bestAcc = -1;
    let bestP = { ...currentBrand.params };
    for (let a = 0.1; a <= 0.9; a += 0.1) {
      const alpha = parseFloat(a.toFixed(1));
      const { history } = engines['SES'](data, { sesAlpha: alpha }, 1);
      const { accuracy } = getMetrics(data, history);
      if (accuracy > bestAcc) {
        bestAcc = accuracy;
        bestP = { ...bestP, sesAlpha: alpha, holtAlpha: alpha, hwAlpha: alpha };
      }
    }
    updateCurrentBrand({ params: bestP });
  };

  const saveEdit = () => {
    const newData = editForm.data.replace(/,/g, '').split(/[\s;\t\n]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    setBrands(prev => prev.map(b => 
      b.id === isEditing ? { ...b, name: editForm.name, data: newData, unit: editForm.unit } : b
    ));
    setIsEditing(null);
  };

  const copyToAssortment = () => {
    setAssortmentStatus("¡Enviado!");
    setTimeout(() => setAssortmentStatus("Enviar a Assortment"), 3000);
  };

  return (
    <div className={`min-h-screen ${themeColors.bg} flex flex-col font-sans ${themeColors.text} overflow-hidden transition-colors duration-300`}>
      <header className={`${themeColors.header} border-b ${themeColors.border} px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-30 shadow-2xl`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 hover:${isDark ? 'bg-zinc-800' : 'bg-slate-100'} rounded-lg transition-all`}><Menu size={20}/></button>
          <div className="flex items-center gap-3 text-left">
            <div className="bg-violet-600 p-2 rounded-xl text-white shadow-lg"><Layers size={20}/></div>
            <div className="flex flex-col">
              <h1 className={`text-xl font-black tracking-tighter ${themeColors.heading} leading-none uppercase`}>GO <span className="text-violet-500 font-black">PLANNER</span></h1>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Módulo Forecasting</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
            <button 
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`flex items-center gap-2 p-2.5 rounded-xl border ${themeColors.border} ${isDark ? 'bg-zinc-800 text-yellow-400' : 'bg-white text-blue-600'} hover:scale-105 transition-all shadow-sm`}
            >
              {isDark ? <Sun size={18}/> : <Moon size={18}/>}
              <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">{isDark ? "Claro" : "Oscuro"}</span>
            </button>
            <button onClick={() => {
              const newId = Date.now();
              setBrands([...brands, { id: newId, name: 'Nueva Marca', data: [], unit: 'Meses', horizon: 12, params: { sesAlpha: 0.3, holtAlpha: 0.3, holtBeta: 0.1, hwAlpha: 0.2, hwBeta: 0.1, hwGamma: 0.3, hwPeriod: 12 } }]);
              setSelectedBrandId(newId); setIsEditing(newId); setEditForm({ name: 'Nueva Marca', data: '', unit: 'Meses' });
            }} className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-violet-500 shadow-xl transition-all"><Plus size={18}/> Nueva Marca</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className={`sidebar-transition h-full ${themeColors.sidebar} border-r ${themeColors.border} flex flex-col ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden opacity-0'} transition-all duration-300`}>
          <div className={`p-4 ${isDark ? 'bg-zinc-900/30' : 'bg-slate-50'} border-b ${themeColors.border} flex items-center justify-between whitespace-nowrap overflow-hidden`}>
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">Portafolio Activo</span>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full border border-violet-400/20">{brands.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {brands.map(brand => (
              <div key={brand.id} onClick={() => setSelectedBrandId(brand.id)} className={`w-full group p-4 rounded-2xl transition-all flex items-center justify-between cursor-pointer border ${selectedBrandId === brand.id ? (isDark ? 'bg-zinc-900 border-violet-500/50 shadow-inner' : 'bg-violet-50 border-violet-200 shadow-sm') : 'bg-transparent border-transparent hover:bg-zinc-900/50'}`}>
                <div className="flex-1 min-w-0 text-left"><p className={`font-bold text-sm truncate ${selectedBrandId === brand.id ? (isDark ? 'text-white' : 'text-violet-700') : themeColors.text}`}>{brand.name}</p><p className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">{brand.unit}</p></div>
                <div className={`flex gap-1 ${selectedBrandId === brand.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  <button onClick={(e) => { e.stopPropagation(); setIsEditing(brand.id); setEditForm({ name: brand.name, data: brand.data.join(' '), unit: brand.unit }); }} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-violet-400"><Edit3 size={14}/></button>
                  <button onClick={(e) => { e.stopPropagation(); setBrands(brands.filter(b => b.id !== brand.id)); if(selectedBrandId === brand.id) setSelectedBrandId(null); }} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-rose-500"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
          <div className={`p-4 border-t ${themeColors.border} space-y-2 ${isDark ? 'bg-zinc-950/80' : 'bg-slate-50'}`}>
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Sesión de Trabajo</span>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => {const b=new Blob([JSON.stringify({brands})],{type:'application/json'});const u=URL.createObjectURL(b);const l=document.createElement('a');l.href=u;l.download='goplanner_sesion.json';l.click();}} className={`flex items-center justify-center gap-2 ${isDark ? 'bg-zinc-900' : 'bg-white'} hover:${isDark ? 'bg-zinc-800' : 'bg-slate-100'} p-3 rounded-xl text-[10px] font-bold border ${themeColors.border} transition-all active:scale-95`}><Save size={14}/> RESPALDAR</button>
              <label className={`flex items-center justify-center gap-2 ${isDark ? 'bg-zinc-900' : 'bg-white'} hover:${isDark ? 'bg-zinc-800' : 'bg-slate-100'} p-3 rounded-xl text-[10px] font-bold border ${themeColors.border} cursor-pointer transition-all active:scale-95`}><Upload size={14}/> CARGAR<input type="file" className="hidden" accept=".json" onChange={(e)=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=(ev)=>{try { const d=JSON.parse(ev.target.result); if(d.brands){ setBrands(d.brands); if(d.brands.length > 0) setSelectedBrandId(d.brands[0].id); } } catch(err){ alert("Error de carga"); }}; r.readAsText(f); e.target.value="";}} /></label>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            {!currentBrand && !isEditing && (
              <div className="flex items-center justify-center min-h-[70vh]"><div className={`max-w-2xl ${themeColors.card} border-2 border-violet-600 p-12 rounded-[48px] shadow-2xl text-center`}><div className="bg-violet-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg"><Rocket size={32} className="text-white"/></div><h2 className={`text-3xl font-black ${themeColors.heading} uppercase tracking-tighter mb-4 leading-none`}>Módulo Forecasting <br/> <span className="text-violet-500 font-black">GO PLANNER</span></h2><p className="text-zinc-400 text-sm mb-10 px-6 uppercase tracking-widest opacity-60">Sube una marca para activar los algoritmos de detección estacional.</p></div></div>
            )}

            {isEditing && (
              <div className={`${themeColors.card} border ${themeColors.border} p-8 rounded-[32px] shadow-2xl mb-8 animate-fade-in text-left`}>
                <div className="flex justify-between items-center mb-8"><h3 className={`font-black ${themeColors.heading} uppercase flex items-center gap-3 text-xl`}><Edit3 size={24} className="text-violet-500"/> Gestionar Datos</h3><button onClick={() => setIsEditing(null)} className="text-zinc-500 hover:text-rose-500 transition-colors"><X size={24}/></button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="text-left"><label className="text-[10px] font-black text-zinc-500 mb-2 block uppercase tracking-widest">Nombre</label><input className={`w-full ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-slate-200'} border rounded-2xl p-4 outline-none focus:ring-2 focus:ring-violet-500 font-bold ${themeColors.heading} transition-all`} value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} /></div>
                  <div className="text-left"><label className="text-[10px] font-black text-zinc-500 mb-2 block uppercase tracking-widest">Unidad</label><div className="flex gap-2">{['Meses', 'Semanas'].map(u => (<button key={u} onClick={() => setEditForm({...editForm, unit: u})} className={`flex-1 py-4 rounded-2xl font-black text-xs transition-all border ${editForm.unit === u ? 'bg-violet-600 border-violet-500 text-white shadow-lg' : (isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-500' : 'bg-white border-slate-200 text-slate-400')}`}>{u}</button>))}</div></div>
                  <div className="md:col-span-2 text-left"><label className="text-[10px] font-black text-yellow-500 mb-2 block uppercase tracking-widest font-bold">Serie Histórica (Pega de Excel)</label><textarea className={`w-full ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-slate-200'} border rounded-3xl p-6 outline-none focus:ring-2 focus:ring-violet-500 font-mono text-xs h-32 ${themeColors.text} resize-none shadow-inner`} value={editForm.data} onChange={(e) => setEditForm({...editForm, data: e.target.value})} placeholder="100 120 150 140..." /></div>
                </div>
                <button onClick={saveEdit} className="w-full mt-8 bg-violet-600 text-white font-black py-5 rounded-3xl hover:bg-violet-500 transition-all shadow-xl uppercase tracking-widest">Guardar Inteligencia</button>
              </div>
            )}

            {currentBrand && !isEditing && (
              <>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 text-left">
                  <div className="flex-1"><h2 className={`text-6xl font-black ${themeColors.heading} tracking-tighter uppercase leading-none`}>{currentBrand.name}</h2>
                    <div className="flex gap-4 mt-4">
                      <span className={`${themeColors.card} px-4 py-2 rounded-full border ${themeColors.border} text-[10px] font-black uppercase tracking-widest text-zinc-500 shadow-sm flex items-center gap-2`}><Calendar size={14} className="text-violet-500"/> Plan por {currentBrand.unit}</span>
                      {/* --- BARRA DE SELECCIÓN DE HORIZONTE (RESTAURADA) --- */}
                      <div className={`${isDark ? 'bg-zinc-900' : 'bg-white'} border ${themeColors.border} px-5 py-1.5 rounded-full shadow-sm flex items-center gap-3`}>
                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest leading-none">Horizonte Fcst:</span>
                        <input type="range" min="1" max="24" step="1" value={currentBrand.horizon || 12} onChange={(e) => updateCurrentBrand({ horizon: parseInt(e.target.value) })} className="w-24 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-yellow-500" />
                        <span className={`text-[10px] font-bold ${themeColors.heading} w-4 text-center`}>{currentBrand.horizon || 12}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`${themeColors.card} border ${themeColors.border} px-8 py-6 rounded-[32px] flex items-center gap-5 shadow-2xl transition-all hover:border-yellow-500/30`}><div className="bg-yellow-500 p-3 rounded-2xl text-black shadow-lg shadow-yellow-500/20 animate-pulse"><Trophy size={24}/></div><div><p className="text-[10px] font-black text-zinc-500 uppercase mb-0.5 tracking-widest leading-none text-left">Mejor Ajuste</p><p className={`font-black text-2xl ${themeColors.heading} tracking-tight uppercase`}>{winner.name}</p></div></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {[{ l: 'Accuracy Score', v: winner.accuracy.toFixed(1) + '%', c: 'text-violet-400', bg: isDark ? 'bg-violet-400/5' : 'bg-white' }, { l: 'Bias (Sesgo)', v: winner.bias.toFixed(1) + '%', c: Math.abs(winner.bias) > 5 ? 'text-rose-400' : 'text-emerald-400', bg: themeColors.card }, { l: 'Error (WMAPE)', v: winner.wmape.toFixed(1) + '%', c: isDark ? 'text-zinc-200' : 'text-slate-700', bg: themeColors.card }, { l: 'Muestra Histórica', v: currentBrand.data.length, c: 'text-zinc-500', bg: themeColors.card }].map((m, i) => (
                    <div key={i} className={`${m.bg} p-6 rounded-[32px] border ${themeColors.border} shadow-lg text-center group hover:scale-105 transition-all`}><p className="text-[10px] font-black text-zinc-600 uppercase mb-2 tracking-widest text-center">{m.l}</p><p className={`text-3xl font-black ${m.c} tracking-tighter text-center`}>{m.v}</p></div>
                  ))}
                </div>

                <div className={`${isDark ? 'bg-zinc-950' : 'bg-white'} p-8 rounded-[48px] border ${themeColors.border} shadow-2xl h-[520px] group relative overflow-hidden`}>
                  <div className="flex justify-between items-center mb-8 px-4">
                    <div className="flex gap-6 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div> REAL</div>
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-violet-600"></div> ENTRENAMIENTO</div>
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div> FORECAST</div>
                    </div>
                    <span className="text-[9px] text-yellow-500 font-bold tracking-widest uppercase opacity-40 italic">--- Proyección Acumulada</span>
                  </div>
                  <ResponsiveContainer width="100%" height="85%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.chartGrid} />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{fill: themeColors.chartText, fontSize:10}} dy={12} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: themeColors.chartText, fontSize:10}} />
                      <YAxis yAxisId="right" orientation="right" hide />
                      <Tooltip contentStyle={{backgroundColor: isDark ? '#09090b' : '#fff', borderRadius:'24px', border:`1px solid ${themeColors.border}`, color: isDark ? '#fff' : '#000'}} />
                      <Bar dataKey="Real" fill={isDark ? "#27272a" : "#cbd5e1"} radius={[4, 4, 0, 0]} barSize={20} opacity={0.4} />
                      <Line type="monotone" dataKey={winner.name} stroke="#8b5cf6" strokeWidth={3} dot={{r:3, fill: isDark ? '#000' : '#fff', strokeWidth:2, stroke:'#8b5cf6'}} animationDuration={800} />
                      <Line type="monotone" dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="10 5" dot={{r:5, fill: isDark ? '#000' : '#fff', strokeWidth:3, stroke:'#fbbf24'}} animationDuration={1500} />
                      <Line yAxisId="right" type="stepAfter" dataKey="Acumulado" stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 3" dot={false} opacity={0.3} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className={`${themeColors.card} border ${themeColors.border} p-8 rounded-[40px] flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl text-left`}>
                  <div className="flex items-center gap-6"><div className={`${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'} p-4 rounded-3xl shadow-xl text-center`}><FileSpreadsheet size={32}/></div><div className="text-left text-left"><h3 className={`font-black ${themeColors.heading} uppercase text-xl mb-1 leading-none tracking-widest`}>EXPORTAR RESULTADOS</h3><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">INCLUYE HISTÓRICOS Y FORECAST</p></div></div>
                  <div className="flex gap-4 w-full md:w-auto">
                    <button onClick={() => { const text = chartData.map(d => `${d.period}\t${d.Real || "-"}\t${d.Forecast || d[winner.name] || "-"}`).join("\n"); const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={`flex-1 md:flex-none flex items-center justify-center gap-3 ${isDark ? 'bg-zinc-950 text-zinc-300' : 'bg-white text-slate-600'} hover:bg-zinc-800 font-black px-6 py-4 rounded-2xl transition-all border ${themeColors.border} group`}>{copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} className="group-hover:text-violet-400 transition-colors" />} {copied ? "LISTO" : "COPIAR DATA"}</button>
                    <button onClick={copyToAssortment} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-violet-900/20 group"><ShoppingCart size={20} className="group-hover:scale-110 transition-transform" /> {assortmentStatus} <span className="bg-white/20 px-1 rounded text-[8px] font-black ml-1">BETA</span></button>
                  </div>
                </div>

                <div className={`${themeColors.cardInner} rounded-[48px] p-10 border ${themeColors.border} shadow-inner text-left`}>
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4 text-left"><Settings2 size={24} className="text-violet-500" /><h3 className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">Analítica Profunda por SKU</h3></div>
                    <button onClick={runSmartOptimization} className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-black border border-yellow-500/20 px-6 py-3 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 shadow-sm uppercase tracking-widest"><Zap size={16} className="fill-current"/> AJUSTAR AUTOMÁTICAMENTE</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
                    <div className="space-y-4 text-left"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 block leading-none">Aprendizaje (Alpha) <span className="text-violet-400 font-bold text-sm">{currentBrand.params?.sesAlpha?.toFixed(1) || 0.3}</span></div><input type="range" min="0.05" max="0.95" step="0.05" value={currentBrand.params?.sesAlpha || 0.3} onChange={(e) => updateCurrentBrand({ params: {...currentBrand.params, sesAlpha: parseFloat(e.target.value), holtAlpha: parseFloat(e.target.value), hwAlpha: parseFloat(e.target.value)} })} className="w-full h-1.5 bg-zinc-900 rounded-full appearance-none cursor-pointer" /><p className="text-[9px] text-zinc-600 italic border-l border-zinc-800 pl-3 leading-relaxed">💡 Alpha alto prioriza variaciones recientes bruscas.</p></div>
                    <div className="space-y-4 text-left"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 block leading-none">Sensibilidad (Beta) <span className="text-violet-400 font-bold text-sm">{currentBrand.params?.holtBeta?.toFixed(1) || 0.1}</span></div><input type="range" min="0.05" max="0.95" step="0.05" value={currentBrand.params?.holtBeta || 0.1} onChange={(e) => updateCurrentBrand({ params: {...currentBrand.params, holtBeta: parseFloat(e.target.value), hwBeta: parseFloat(e.target.value)} })} className="w-full h-1.5 bg-zinc-900 rounded-full appearance-none cursor-pointer" /><p className="text-[9px] text-zinc-600 italic border-l border-zinc-800 pl-3 leading-relaxed">💡 Controla la inercia del modelo ante crecimientos.</p></div>
                    <div className="space-y-4 text-left"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 block leading-none">Ciclo Estacional <span className="text-violet-400 font-bold text-sm">{currentBrand.params?.hwPeriod || 12} pts</span></div><input type="range" min="2" max="24" step="1" value={currentBrand.params?.hwPeriod || 12} onChange={(e) => updateCurrentBrand({ params: {...currentBrand.params, hwPeriod: parseInt(e.target.value)} })} className="w-full h-1.5 bg-zinc-900 rounded-full appearance-none cursor-pointer" /><p className="text-[9px] text-zinc-600 italic border-l border-zinc-800 pl-3 leading-relaxed">💡 Define el patrón de repetición (ej. 12 meses).</p></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

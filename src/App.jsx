import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Cell, Area
} from 'recharts';
import { 
  TrendingUp, Settings2, Trophy, Layers, Plus, Trash2, Edit3, Download, Copy, Check,
  Zap, Save, X, FileSpreadsheet, Calendar, Menu, Sun, Moon, Database, ShoppingCart, Rocket, FileText, Upload, ChevronRight
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MÓDULO DE SERVICIOS (LÓGICA MATEMÁTICA)
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
// 2. COMPONENTE: DASHBOARD GLOBAL (KPIs)
// ═══════════════════════════════════════════════════════════════════════════════

const DashboardModule = ({ brands, isDark }) => {
  const kpis = useMemo(() => {
    const totalBrands = brands.length;
    const avgAccuracy = brands.length > 0 
      ? brands.reduce((acc, b) => {
          const res = engines['SES'](b.data, b.params || {}, 1);
          return acc + getMetrics(b.data, res.history).accuracy;
        }, 0) / brands.length 
      : 0;
    
    return [
      { label: "Marcas Activas", val: totalBrands, unit: "SKUs", color: "text-violet-400" },
      { label: "Accuracy Promedio", val: avgAccuracy.toFixed(1), unit: "%", color: "text-emerald-400" },
      { label: "Sell-Through Est.", val: "84.2", unit: "%", color: "text-blue-400" },
      { label: "Días Cobertura", val: "14", unit: "días", color: "text-yellow-400" }
    ];
  }, [brands]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="text-left">
        <h2 className={`text-4xl font-black tracking-tighter uppercase ${isDark ? 'text-white' : 'text-zinc-900'}`}>Dashboard <span className="text-violet-500">Global</span></h2>
        <p className="text-zinc-500 text-sm mt-1">Consolidado de KPIs para toma de decisiones tácticas.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {kpis.map((k, i) => (
          <div key={i} className={`${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border p-8 rounded-[32px] shadow-lg`}>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-3">{k.label}</p>
            <p className={`text-3xl font-black ${isDark ? k.color : 'text-zinc-900'}`}>{k.val}<span className="text-xs ml-1 text-zinc-600">{k.unit}</span></p>
          </div>
        ))}
      </div>
      <div className={`${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'} border p-12 rounded-[48px] text-center`}>
        <Rocket className="mx-auto text-violet-500 mb-6 opacity-40" size={64} />
        <p className="text-zinc-500 font-bold uppercase tracking-widest">Pipeline de Abastecimiento en Línea</p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COMPONENTE PRINCIPAL: APP (SIDEBAR + NAVEGACIÓN)
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
    bg: isDark ? 'bg-black' : 'bg-slate-50',
    text: isDark ? 'text-slate-400' : 'text-slate-500',
    sidebar: isDark ? 'bg-zinc-950' : 'bg-white',
    header: isDark ? 'bg-zinc-900/80' : 'bg-white/90',
    card: isDark ? 'bg-zinc-900' : 'bg-white',
    border: isDark ? 'border-zinc-800' : 'border-slate-200',
    textHeading: isDark ? 'text-white' : 'text-slate-900'
  };

  const currentBrand = brands.find(b => b.id === selectedBrandId) || null;
  const results = useMemo(() => {
    if (!currentBrand || !currentBrand.data) return [];
    return Object.keys(engines).map(name => {
      const { history, future } = engines[name](currentBrand.data, currentBrand.params || {sesAlpha: 0.3, hwPeriod: 12}, currentBrand.horizon || 12);
      return { name, history, future, ...getMetrics(currentBrand.data, history) };
    }).sort((a,b) => b.accuracy - a.accuracy);
  }, [currentBrand]);

  const winner = results[0] || { accuracy: 0, name: 'N/A', history: [], future: [] };

  const chartData = useMemo(() => {
    if (!currentBrand) return [];
    const hist = currentBrand.data.map((v, i) => ({ period: `M${i+1}`, Real: v, Modelo: winner.history[i] }));
    let acc = 0;
    const future = winner.future.map((v, i) => {
        acc += v;
        return { period: `F${i+1}`, Forecast: v, Acumulado: acc };
    });
    return [...hist, ...future];
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
    <div className={`min-h-screen ${colors.bg} flex flex-col font-sans transition-colors duration-500`}>
      {/* --- HEADER --- */}
      <header className={`${colors.header} border-b ${colors.border} px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-30 shadow-sm`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-violet-500"><Menu size={24} /></button>
          <div className="flex flex-col text-left">
            <h1 className={`text-xl font-black ${colors.textHeading} tracking-tighter uppercase leading-none`}>GO <span className="text-violet-500">PLANNER</span></h1>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Módulo Forecasting</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2.5 ${isDark ? 'bg-zinc-800' : 'bg-gray-100'} rounded-xl text-yellow-500`}>
                {isDark ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button onClick={() => { setIsEditing(Date.now()); setEditForm({name: 'Nueva Marca', data: '', unit: 'Meses'}); }} className="bg-violet-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase shadow-lg shadow-violet-900/20 hover:bg-violet-500 transition-all">+ NUEVO SKU</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* --- SIDEBAR --- */}
        <aside className={`w-72 border-r ${colors.border} ${colors.sidebar} ${!isSidebarOpen && 'hidden'} transition-all duration-300 flex flex-col`}>
          <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/10 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Navegación</span>
          </div>
          <nav className="p-2 space-y-1">
            <button onClick={() => setActiveModule('dashboard')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeModule === 'dashboard' ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800/50'}`}>
              <Layers size={18}/> <span className="font-bold text-xs uppercase tracking-wider">Dashboard</span>
            </button>
            <button onClick={() => setActiveModule('forecast')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeModule === 'forecast' ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800/50'}`}>
              <TrendingUp size={18}/> <span className="font-bold text-xs uppercase tracking-wider">Forecasting</span>
            </button>
          </nav>

          <div className="p-4 border-b border-zinc-800/50 mt-4 bg-zinc-900/5">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Marcas ({brands.length})</span>
          </div>
          <div className="flex-1 p-2 space-y-1 overflow-y-auto">
            {brands.map(b => (
              <button key={b.id} onClick={() => { setSelectedBrandId(b.id); setActiveModule('forecast'); }} className={`w-full text-left p-4 rounded-2xl transition-all flex justify-between items-center ${selectedBrandId === b.id ? 'bg-zinc-800 border border-violet-500/50 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800/50'}`}>
                <span className="font-bold truncate pr-2 uppercase text-[11px] tracking-tight">{b.name}</span>
                <Trash2 size={14} className="opacity-40 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setBrands(brands.filter(x => x.id !== b.id)); if(selectedBrandId===b.id) setSelectedBrandId(null); }} />
              </button>
            ))}
          </div>

          <div className={`p-4 border-t ${colors.border} space-y-2`}>
            <button onClick={() => { const b = new Blob([JSON.stringify({ brands })], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'goplanner_bak.json'; l.click(); }} className="w-full flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-400 p-3 rounded-xl text-[10px] font-bold">
              <Save size={14} /> RESPALDAR
            </button>
          </div>
        </aside>

        {/* --- MAIN CONTENT --- */}
        <main className="flex-1 p-8 overflow-y-auto bg-transparent scroll-smooth">
          {activeModule === 'dashboard' && <DashboardModule brands={brands} isDark={isDark} />}
          
          {activeModule === 'forecast' && (
            <div className="space-y-8 animate-fade-in">
              {!currentBrand && !isEditing && (
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className={`max-w-2xl ${colors.card} border-4 border-violet-600 p-12 rounded-[48px] shadow-2xl text-center`}>
                        <Rocket className="mx-auto text-violet-500 mb-6" size={56} />
                        <h2 className={`text-3xl font-black ${colors.textHeading} uppercase tracking-tighter mb-4`}>Módulo Forecasting</h2>
                        <p className="text-zinc-500 text-sm mb-10 leading-relaxed px-6">Sube tu historia de ventas para descubrir el modelo óptimo de abastecimiento.</p>
                        <div className="grid grid-cols-2 gap-6 text-left">
                            <div className="bg-zinc-950/50 border border-violet-500/20 p-6 rounded-3xl group">
                                <h4 className="text-violet-500 font-black text-xs uppercase mb-3 flex items-center gap-2"><FileText size={14}/> Formato CSV</h4>
                                <p className="text-[10px] text-zinc-500 leading-relaxed">Marca en Columna A. <br/>Ventas en Columnas B+.</p>
                            </div>
                            <div className="bg-zinc-950/50 border border-yellow-500/20 p-6 rounded-3xl group">
                                <h4 className="text-yellow-500 font-black text-xs uppercase mb-3 flex items-center gap-2"><Zap size={14}/> Pegado Excel</h4>
                                <p className="text-[10px] text-zinc-500 leading-relaxed">Copia tus celdas. <br/>Ignoramos comas automáticamente.</p>
                            </div>
                        </div>
                    </div>
                </div>
              )}

              {isEditing && (
                 <div className={`${colors.card} p-10 rounded-[40px] border border-zinc-700 shadow-2xl`}>
                    <div className="flex justify-between mb-8"><h3 className={`${colors.textHeading} font-black uppercase`}>Gestionar Datos</h3><button onClick={() => setIsEditing(null)} className="text-zinc-500"><X size={24}/></button></div>
                    <input className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white mb-4 outline-none focus:border-violet-500" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Nombre del SKU" />
                    <textarea className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white h-44 font-mono mb-4 outline-none focus:border-yellow-500" value={editForm.data} onChange={e => setEditForm({...editForm, data: e.target.value})} placeholder="Pega tus datos aquí..." />
                    <button onClick={saveEdit} className="w-full bg-violet-600 p-5 rounded-3xl text-white font-black uppercase">PROCESAR SERIE</button>
                 </div>
              )}

              {currentBrand && !isEditing && (
                <div className="space-y-8 animate-fade-in text-left">
                  <div className="flex justify-between items-end">
                    <div>
                        <h2 className={`text-5xl font-black ${colors.textHeading} tracking-tighter uppercase leading-none`}>{currentBrand.name}</h2>
                        <div className="flex gap-4 mt-4">
                            <span className="bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-full text-[10px] font-black text-zinc-500 uppercase flex items-center gap-2 tracking-widest shadow-sm"><Calendar size={14} className="text-violet-500"/> {currentBrand.unit}</span>
                            <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 px-5 py-1.5 rounded-full shadow-inner">
                                <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Horizonte:</span>
                                <input type="range" min="1" max="24" step="1" value={currentBrand.horizon || 12} onChange={(e) => setBrands(brands.map(x => x.id === selectedBrandId ? {...x, horizon: parseInt(e.target.value)} : x))} className="w-24 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-yellow-500" />
                                <span className={`text-xs font-bold ${colors.textHeading} w-4 text-center`}>{currentBrand.horizon || 12}</span>
                            </div>
                        </div>
                    </div>
                    <div className={`${colors.card} border ${colors.border} p-6 rounded-[32px] flex items-center gap-5 shadow-2xl`}>
                        <div className="bg-yellow-500 p-3 rounded-2xl text-black shadow-lg animate-pulse"><Trophy size={28} /></div>
                        <div><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 leading-none">Mejor Ajuste</p><p className={`font-black text-xl ${colors.textHeading} tracking-tight uppercase leading-none`}>{winner.name}</p></div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-6">
                    {[
                        { l: 'Accuracy local', v: winner.accuracy.toFixed(1) + '%', c: 'text-violet-400' },
                        { l: 'Bias (Sesgo)', v: winner.bias.toFixed(1) + '%', c: Math.abs(winner.bias) > 5 ? 'text-rose-400' : 'text-emerald-500' },
                        { l: 'Error (WMAPE)', v: winner.wmape.toFixed(1) + '%', c: isDark ? 'text-zinc-200' : 'text-slate-700' },
                        { l: 'Historico', v: currentBrand.data.length, c: 'text-zinc-500' }
                    ].map((m, i) => (
                        <div key={i} className={`${colors.card} p-6 rounded-[32px] border ${colors.border} shadow-lg text-center`}>
                            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2">{m.l}</p>
                            <p className={`text-3xl font-black ${m.c} tracking-tighter`}>{m.v}</p>
                        </div>
                    ))}
                  </div>

                  <div className={`${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'} p-8 rounded-[48px] border h-[500px] shadow-2xl relative overflow-hidden`}>
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1f2937" : "#e2e8f0"} vertical={false} />
                        <XAxis dataKey="period" tick={{fill:colors.text, fontSize:10}} axisLine={false} />
                        <YAxis tick={{fill:colors.text, fontSize:10}} axisLine={false} />
                        <YAxis yAxisId="right" orientation="right" hide />
                        <Tooltip contentStyle={{backgroundColor: isDark ? '#000' : '#fff', borderRadius:'24px', border:`1px solid ${colors.border}`}} />
                        <Bar dataKey="Real" fill={isDark ? "#27272a" : "#cbd5e1"} radius={[6,6,0,0]} barSize={25} />
                        <Line dataKey="Modelo" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                        <Line dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="10 5" dot={false} />
                        <Line yAxisId="right" dataKey="Acumulado" stroke="#fbbf24" strokeWidth={2} opacity={0.3} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`${colors.card} border ${colors.border} p-8 rounded-[40px] flex justify-between items-center shadow-2xl`}>
                        <div className="flex items-center gap-6 text-left">
                            <div className={`p-4 rounded-3xl shadow-xl ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}><FileSpreadsheet size={32}/></div>
                            <div><h3 className={`font-black uppercase text-lg mb-1 leading-none tracking-widest ${colors.textHeading}`}>EXPORTAR RESULTADOS</h3><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">INCLUYE HISTORICOS Y FORECAST</p></div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => { const t = chartData.map(d => `${d.period}\t${d.Real || "-"}\t${d.Forecast || d.Modelo || "-"}`).join("\n"); const el = document.createElement("textarea"); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={`p-4 px-8 rounded-2xl font-black text-xs uppercase border ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'}`}>{copied ? "LISTO" : "COPIAR DATA"}</button>
                            <button className="bg-violet-600 text-white px-8 py-4 rounded-2xl font-black text-xs shadow-xl shadow-violet-900/20 flex items-center gap-2 hover:scale-105 transition-all uppercase"><ShoppingCart size={20}/> Enviar a Assortment <span className="bg-white/20 px-1 rounded text-[8px] font-black ml-1">BETA</span></button>
                        </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

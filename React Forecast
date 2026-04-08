import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Cell, Area
} from 'recharts';
import { 
  TrendingUp, Settings2, Trophy, Layers, Plus, Trash2, Edit3, Download, Copy, Check,
  Zap, Save, X, FileSpreadsheet, Calendar, Menu, Sun, Moon, Database, ShoppingCart, Rocket
} from 'lucide-react';

// --- Motores Matemáticos Centralizados ---
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
  if (count === 0 || sumActual === 0) return { wmape: 999, accuracy: 0, bias: 0 };
  const wmape = (sumAbsErr / sumActual) * 100;
  return { wmape, accuracy: Math.max(0, 100 - wmape), bias: (sumErr / sumActual) * 100 };
};

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', data: '', unit: 'Meses' });
  const [copied, setCopied] = useState(false);
  const [assortmentStatus, setAssortmentStatus] = useState("Enviar a Assortment");

  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? 'bg-black' : 'bg-slate-50',
    text: isDark ? 'text-slate-400' : 'text-slate-500',
    textHeading: isDark ? 'text-white' : 'text-slate-900',
    sidebar: isDark ? 'bg-zinc-950' : 'bg-white',
    header: isDark ? 'bg-zinc-900/80' : 'bg-white/90',
    card: isDark ? 'bg-zinc-900' : 'bg-white',
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
      return { name, history, future, ...metrics };
    }).sort((a, b) => b.accuracy - a.accuracy);
  }, [currentBrand]);

  const winner = allResults.length > 0 ? allResults[0] : { name: 'N/A', accuracy: 0, bias: 0, wmape: 0, history: [], future: [] };

  const chartData = useMemo(() => {
    if (!currentBrand || !currentBrand.data) return [];
    const hist = currentBrand.data.map((val, i) => ({
      period: `M${i + 1}`,
      Real: val,
      Modelo: winner.history[i]
    }));
    let accSum = 0;
    const future = (winner.future || []).map((val, i) => {
      accSum += val;
      return { period: `F${i + 1}`, Forecast: parseFloat(val.toFixed(1)), Acumulado: parseFloat(accSum.toFixed(1)) };
    });
    return [...hist, ...future];
  }, [currentBrand, winner]);

  const saveEdit = () => {
    const data = editForm.data.replace(/,/g, '').split(/[\s;\t\n]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    setBrands(prev => prev.map(b => b.id === isEditing ? { ...b, name: editForm.name, data, unit: editForm.unit } : b));
    setIsEditing(null);
  };

  const runOptimizer = () => {
    if(!currentBrand) return;
    const data = currentBrand.data;
    let bestAcc = -1;
    let bestP = { ...currentBrand.params };
    // Optimización rápida
    for (let a = 0.1; a <= 0.9; a += 0.2) {
        const { history } = engines['SES'](data, { sesAlpha: a }, 1);
        const { accuracy } = getMetrics(data, history);
        if (accuracy > bestAcc) { bestAcc = accuracy; bestP = { ...bestP, sesAlpha: a, hwAlpha: a }; }
    }
    const L = currentBrand.params.hwPeriod || 12;
    if (data.length >= L * 2) {
        for (let g = 0.1; g <= 0.5; g += 0.2) {
            const { history } = engines['Holt-Winters'](data, { ...bestP, hwGamma: g, hwPeriod: L }, 1);
            const { accuracy } = getMetrics(data, history);
            if (accuracy * 1.05 > bestAcc) { bestAcc = accuracy; bestP = { ...bestP, hwGamma: g }; }
        }
    }
    setBrands(prev => prev.map(b => b.id === selectedBrandId ? { ...b, params: bestP } : b));
  };

  return (
    <div className={`min-h-screen ${colors.bg} flex flex-col font-sans transition-colors duration-300`}>
      <header className={`${colors.header} border-b ${colors.border} px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-30`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-violet-500"><Menu /></button>
          <div className="flex flex-col text-left">
            <h1 className={`text-xl font-black ${colors.textHeading}`}>GO <span className="text-violet-500">PLANNER</span></h1>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">Módulo Forecasting</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="p-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-yellow-500">
                {isDark ? <Sun size={18}/> : <Moon size={18}/>}
            </button>
            <button onClick={() => {
                const id = Date.now();
                const newB = { id, name: 'Nueva Marca', data: [], unit: 'Meses', horizon: 12, params: { sesAlpha: 0.3, hwAlpha: 0.2, hwBeta: 0.1, hwGamma: 0.3, hwPeriod: 12 } };
                setBrands([...brands, newB]); setSelectedBrandId(id); setIsEditing(id); setEditForm({name: 'Nueva Marca', data: '', unit: 'Meses'});
            }} className="bg-violet-600 text-white px-5 py-2.5 rounded-xl font-black text-sm uppercase shadow-lg shadow-violet-900/20">+ Nueva Marca</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`w-72 border-r ${colors.border} ${colors.sidebar} ${!isSidebarOpen && 'hidden'} transition-all`}>
          <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/10 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Portafolio</span>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 px-2 rounded-full border border-violet-400/20">{brands.length}</span>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto">
            {brands.map(b => (
              <button key={b.id} onClick={() => setSelectedBrandId(b.id)} className={`w-full text-left p-4 rounded-2xl transition-all flex justify-between items-center ${selectedBrandId === b.id ? 'bg-violet-600 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-800'}`}>
                <span className="font-bold truncate pr-2">{b.name}</span>
                <Trash2 size={14} className="opacity-40 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setBrands(brands.filter(x => x.id !== b.id)); }} />
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
          {!currentBrand && !isEditing && (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className={`max-w-2xl ${colors.card} border-2 border-violet-600 p-12 rounded-[48px] shadow-2xl text-center`}>
                    <Rocket className="mx-auto text-violet-500 mb-6" size={56} />
                    <h2 className={`text-3xl font-black ${colors.textHeading} uppercase tracking-tighter mb-4 leading-none`}>Módulo Forecasting <br/> <span className="text-violet-500 font-black uppercase font-black uppercase font-black uppercase font-black uppercase font-black uppercase">GO PLANNER</span></h2>
                    <p className="text-zinc-400 text-sm mb-10 px-6 leading-relaxed">Analiza tu demanda histórica para optimizar el abastecimiento.</p>
                    <div className="grid grid-cols-2 gap-6 text-left">
                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
                            <h4 className="text-violet-500 font-bold text-xs uppercase mb-2">Estructura CSV</h4>
                            <p className="text-[10px] text-zinc-500">Columna A: Nombre marca. <br/>Siguientes: Ventas.</p>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl">
                            <h4 className="text-yellow-500 font-bold text-xs uppercase mb-2">Pegado Excel</h4>
                            <p className="text-[10px] text-zinc-500">Omitimos comas y procesamos espacios automáticamente.</p>
                        </div>
                    </div>
                </div>
            </div>
          )}

          {isEditing && (
             <div className={`${colors.card} p-10 rounded-[32px] mb-8 border border-zinc-700 shadow-2xl`}>
                <div className="flex justify-between items-center mb-8 text-left">
                    <h3 className={`font-black uppercase flex items-center gap-3 tracking-widest text-sm ${colors.textHeading}`}><Edit3 className="text-violet-500" /> Gestionar Datos</h3>
                    <button onClick={() => setIsEditing(null)} className="text-zinc-500 hover:text-white"><X /></button>
                </div>
                <div className="grid grid-cols-2 gap-8 text-left">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Nombre Marca</label>
                        <input className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white outline-none focus:border-violet-500" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Unidad</label>
                        <div className="flex gap-2">
                            {['Meses', 'Semanas'].map(u => <button key={u} onClick={() => setEditForm({...editForm, unit: u})} className={`flex-1 p-4 rounded-2xl font-bold text-xs border ${editForm.unit === u ? 'bg-violet-600 text-white' : 'bg-black text-zinc-600 border-zinc-800'}`}>{u}</button>)}
                        </div>
                    </div>
                </div>
                <div className="mt-8 space-y-2 text-left">
                    <label className="text-[10px] font-black uppercase text-yellow-500 tracking-widest">Histórico (Pega de Excel)</label>
                    <textarea className="w-full bg-black border border-zinc-800 p-6 rounded-3xl text-white h-40 font-mono text-xs outline-none focus:border-yellow-500" value={editForm.data} onChange={e => setEditForm({...editForm, data: e.target.value})} />
                </div>
                <button onClick={saveEdit} className="w-full bg-violet-600 p-5 rounded-3xl text-white font-black mt-8 hover:bg-violet-500 shadow-xl uppercase tracking-widest">Procesar Datos</button>
             </div>
          )}

          {currentBrand && !isEditing && (
            <div className="space-y-8 animate-fade-in text-left">
              <div className="flex justify-between items-end">
                <div>
                    <h2 className={`text-5xl font-black ${colors.textHeading} tracking-tighter uppercase`}>{currentBrand.name}</h2>
                    <div className="flex gap-4 mt-3">
                        <span className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-2 tracking-widest"><Calendar size={12} className="text-violet-500"/> {currentBrand.unit}</span>
                        <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 px-5 py-1.5 rounded-full">
                            <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Horizonte:</span>
                            <input type="range" min="1" max="24" step="1" value={currentBrand.horizon || 12} onChange={(e) => setBrands(brands.map(x => x.id === selectedBrandId ? {...x, horizon: parseInt(e.target.value)} : x))} className="w-24 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer" />
                            <span className={`text-xs font-bold ${colors.textHeading} w-4 text-center`}>{currentBrand.horizon || 12}</span>
                        </div>
                    </div>
                </div>
                <div className={`${colors.card} border ${colors.border} p-6 rounded-[32px] flex items-center gap-5 shadow-2xl`}>
                    <div className="bg-yellow-500 p-3 rounded-2xl text-black shadow-lg animate-pulse"><Trophy size={24} /></div>
                    <div className="text-left"><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 leading-none">Best Performer</p><p className={`font-black text-xl ${colors.textHeading} tracking-tight uppercase leading-none`}>{winner.name}</p></div>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-6">
                {[
                    { l: 'Accuracy Score', v: winner.accuracy.toFixed(1) + '%', c: 'text-violet-400' },
                    { l: 'Bias (Sesgo)', v: winner.bias.toFixed(1) + '%', c: Math.abs(winner.bias) > 5 ? 'text-rose-400' : 'text-emerald-500' },
                    { l: 'Error (WMAPE)', v: winner.wmape.toFixed(1) + '%', c: 'text-zinc-200' },
                    { l: 'Muestra', v: currentBrand.data.length, c: 'text-zinc-500' }
                ].map((m, i) => (
                    <div key={i} className={`${colors.card} p-6 rounded-[32px] border ${colors.border} shadow-lg text-center`}>
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2">{m.l}</p>
                        <p className={`text-3xl font-black ${m.c} tracking-tighter`}>{m.v}</p>
                    </div>
                ))}
              </div>

              <div className={`${isDark ? 'bg-zinc-950' : 'bg-white'} p-8 rounded-[48px] border ${colors.border} h-[500px] shadow-2xl relative overflow-hidden`}>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6 px-4">
                    <div className="flex gap-6">
                        <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-zinc-700"></div> Real</span>
                        <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-violet-600"></div> Modelo</span>
                        <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Forecast</span>
                    </div>
                    <span className="text-yellow-500/40">--- Acumulado (Eje Derecho)</span>
                </div>
                <ResponsiveContainer width="100%" height="90%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} vertical={false} />
                    <XAxis dataKey="period" tick={{fill:colors.chartText, fontSize:10}} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{fill:colors.chartText, fontSize:10}} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{fill:colors.chartText, fontSize:9}} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{backgroundColor: isDark ? '#000' : '#fff', border:`1px solid ${colors.border}`, borderRadius:'24px', color: isDark ? '#fff' : '#000'}} />
                    <Bar dataKey="Real" fill={isDark ? "#27272a" : "#cbd5e1"} radius={[6,6,0,0]} barSize={20} opacity={0.6} />
                    <Line dataKey="Modelo" stroke="#8b5cf6" strokeWidth={3} dot={{r:3, fill: isDark ? '#000' : '#fff', strokeWidth:2, stroke:'#8b5cf6'}} animationDuration={800} />
                    <Line dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="10 5" dot={{r:5, fill: isDark ? '#000' : '#fff', strokeWidth:3, stroke:'#fbbf24'}} animationDuration={1500} />
                    <Line yAxisId="right" dataKey="Acumulado" stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 3" dot={false} opacity={0.3} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className={`${colors.card} border ${colors.border} p-8 rounded-[40px] flex justify-between items-center shadow-2xl`}>
                    <div className="flex items-center gap-6">
                        <div className={`p-4 rounded-3xl shadow-xl ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}><FileSpreadsheet size={28}/></div>
                        <div className="text-left"><h3 className={`font-black uppercase text-lg mb-1 leading-none tracking-widest ${colors.textHeading}`}>EXPORTAR RESULTADOS</h3><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">INCLUYE HISTORICOS Y FORECAST</p></div>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => { const t = chartData.map(d => `${d.period}\t${d.Real || "-"}\t${d.Forecast || d.Modelo || "-"}`).join("\n"); const el = document.createElement("textarea"); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={`p-4 px-8 rounded-2xl font-black text-xs transition-all uppercase border ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'}`}>{copied ? "LISTO" : "COPIAR DATA"}</button>
                        <button onClick={() => setAssortmentStatus("Data Vinculada!")} className="bg-violet-600 text-white px-8 py-4 rounded-2xl font-black text-xs shadow-xl shadow-violet-900/20 flex items-center gap-2 hover:scale-105 transition-all uppercase"><ShoppingCart size={16}/> {assortmentStatus} <span className="bg-white/20 px-1 rounded text-[8px] font-black ml-1">BETA</span></button>
                    </div>
              </div>

              <div className={`${isDark ? 'bg-zinc-950' : 'bg-white'} rounded-[48px] p-10 border ${colors.border} shadow-inner`}>
                <div className="flex items-center justify-between mb-10 text-left">
                    <div className="flex items-center gap-4"><Settings2 className="text-violet-500" /><h3 className={`text-sm font-black uppercase tracking-[0.3em] ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Analítica Profunda por Marca</h3></div>
                    <button onClick={runOptimizer} className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-6 py-2.5 rounded-xl text-[10px] font-black transition-all hover:bg-yellow-500 hover:text-black uppercase flex items-center gap-2 shadow-sm"><Zap size={14}/> Optimizar Mejor Ajuste</button>
                </div>
                <div className="grid grid-cols-3 gap-12 text-left">
                    <div className="space-y-4">
                        <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500">Aprendizaje (Alpha) <span className="text-violet-400 font-black">{currentBrand.params?.sesAlpha?.toFixed(2)}</span></div>
                        <input type="range" min="0.01" max="0.99" step="0.01" value={currentBrand.params?.sesAlpha || 0.3} onChange={e => setBrands(brands.map(b => b.id === selectedBrandId ? {...b, params: {...b.params, sesAlpha: parseFloat(e.target.value), hwAlpha: parseFloat(e.target.value)}} : b))} className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer" />
                        <p className="text-[9px] text-zinc-500 italic border-l border-zinc-800 pl-3">💡 Alpha alto rastrea cambios recientes.</p>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500">Tendencia (Beta) <span className="text-violet-400 font-black">{currentBrand.params?.hwBeta || 0.1}</span></div>
                        <input type="range" min="0.01" max="0.99" step="0.01" value={currentBrand.params?.hwBeta || 0.1} onChange={e => setBrands(brands.map(b => b.id === selectedBrandId ? {...b, params: {...b.params, hwBeta: parseFloat(e.target.value)}} : b))} className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer" />
                        <p className="text-[9px] text-zinc-500 italic border-l border-zinc-800 pl-3">💡 Controla la inercia del crecimiento.</p>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500">Ciclo Estacional <span className="text-violet-400 font-black">{currentBrand.params?.hwPeriod} pts</span></div>
                        <input type="range" min="2" max="24" step="1" value={currentBrand.params?.hwPeriod || 12} onChange={e => setBrands(brands.map(b => b.id === selectedBrandId ? {...b, params: {...b.params, hwPeriod: parseInt(e.target.value)}} : b))} className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer" />
                        <p className="text-[9px] text-zinc-500 italic border-l border-zinc-800 pl-3">💡 Ajusta el patrón de repetición.</p>
                    </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

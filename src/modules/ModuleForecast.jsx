import React, { useState, useMemo, useEffect } from 'react';
import {
  Menu, ChevronLeft, ChevronRight, TrendingUp, Database, Plus,
  Edit3, Trash2, Save, Upload, Check, Copy, Download, ShoppingCart,
  Calendar, Trophy, Settings2, Zap, FileSpreadsheet, Rocket,
  Link, Percent, X,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Motores Matemáticos (sin cambios) ───────────────────────────────────────

const engines = {
  'SES': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    if (data.length === 0) return { history: res, future: [] };
    const alpha = p.sesAlpha || 0.3;
    let level = data[0];
    res[0] = level;
    for (let i = 1; i < data.length; i++) {
      level = alpha * (data[i - 1] || 0) + (1 - alpha) * level;
      res[i] = level;
    }
    const finalFcst = alpha * (data[data.length - 1] || 0) + (1 - alpha) * level;
    return { history: res, future: Array(horizon).fill(finalFcst) };
  },
  'Holt': (data, p, horizon) => {
    const res = Array(data.length).fill(null);
    if (data.length < 2) return engines['SES'](data, p, horizon);
    const alpha = p.holtAlpha || 0.3, beta = p.holtBeta || 0.1;
    let level = data[0], trend = data[1] - data[0];
    res[0] = level;
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
    res[0] = level * seasonals[0];
    for (let i = 0; i < data.length; i++) {
      const prevL = level;
      const obs = data[i];
      level = alpha * (obs / (seasonals[i % L] || 1)) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevL) + (1 - beta) * trend;
      seasonals[i % L] = gamma * (obs / (level || 1)) + (1 - gamma) * seasonals[i % L];
      res[i] = (level + trend) * (seasonals[i % L] || 1);
    }
    const future = Array.from({ length: horizon }, (_, h) => {
      const m = data.length + h;
      return (level + (h + 1) * trend) * (seasonals[m % L] || 1);
    });
    return { history: res, future };
  },
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', data: '', unit: 'Meses' });
  const [copied, setCopied] = useState(false);
  const [isAssortmentModalOpen, setIsAssortmentModalOpen] = useState(false);
  const [assortmentForm, setAssortmentForm] = useState({ name: '', start: 1, end: 6, budget: 0, historyPzs: 0 });

  // ── Persistencia localStorage ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gop_forecast');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.brands?.length) { setBrands(d.brands); setSelectedBrandId(d.brands[0].id); }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('gop_forecast', JSON.stringify({ brands })); } catch {}
  }, [brands]);

  // ── Datos derivados ───────────────────────────────────────────────────────
  const currentBrand = useMemo(() =>
    brands.find(b => b.id === selectedBrandId) || null,
  [brands, selectedBrandId]);

  const allResults = useMemo(() => {
    if (!currentBrand?.data) return [];
    return Object.keys(engines).map(name => {
      const { history, future } = engines[name](currentBrand.data, currentBrand.params, currentBrand.horizon || 12);
      const metrics = getMetrics(currentBrand.data, history);
      return { name, forecast: history, future, ...metrics };
    }).sort((a, b) => b.accuracy - a.accuracy);
  }, [currentBrand]);

  const winner = allResults[0] || { name: 'N/A', accuracy: 0, bias: 0, wmape: 0, future: [] };

  const chartData = useMemo(() => {
    if (!currentBrand?.data) return [];
    const hist = currentBrand.data.map((val, i) => ({
      period: `${currentBrand.unit === 'Meses' ? 'M' : 'S'}${i + 1}`,
      Real: val,
      ...allResults.reduce((acc, curr) => ({
        ...acc,
        [curr.name]: curr.forecast[i] ? parseFloat(curr.forecast[i].toFixed(1)) : null,
      }), {}),
    }));
    let accSum = 0;
    const future = (winner.future || []).map((val, i) => {
      accSum += val;
      return { period: `F${i + 1}`, Forecast: parseFloat(val.toFixed(1)), Acumulado: parseFloat(accSum.toFixed(1)) };
    });
    return [...hist, ...future];
  }, [currentBrand, allResults, winner]);

  const suggestions = useMemo(() => {
    if (winner.name === 'SES')          return { a: 'SES ganador. Sugerido Alpha 0.1-0.3.', b: 'No aplica.', p: 'No aplica.' };
    if (winner.name === 'Holt')         return { a: 'Holt ganador. Sugerido Alpha 0.3.', b: 'Beta 0.1 sugerido.', p: 'No aplica.' };
    if (winner.name === 'Holt-Winters') return { a: 'Estacionalidad detectada. Alpha 0.2.', b: 'Beta 0.05 sugerido.', p: 'Ajusta al ciclo real.' };
    return { a: 'Ajusta aprendizaje.', b: 'Ajusta tendencia.', p: 'Ajusta ciclo.' };
  }, [winner.name]);

  // ── Handlers (sin cambios de lógica) ─────────────────────────────────────
  const parseNumbers = (str) => {
    if (!str) return [];
    return str.replace(/,/g, '').split(/[\s;\t\n]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
  };

  const saveEdit = () => {
    const newData = parseNumbers(editForm.data);
    setBrands(prev => prev.map(b =>
      b.id === isEditing ? { ...b, name: editForm.name, data: newData, unit: editForm.unit } : b
    ));
    setIsEditing(null);
  };

  const updateCurrentBrand = (updates) => {
    setBrands(prev => prev.map(b => b.id === selectedBrandId ? { ...b, ...updates } : b));
  };

  const autoCalibrate = () => {
    if (!currentBrand) return;
    const best = winner.name;
    let rec = {};
    if (best === 'SES')          rec = { sesAlpha: 0.25 };
    else if (best === 'Holt')    rec = { holtAlpha: 0.3, holtBeta: 0.1 };
    else if (best === 'Holt-Winters') rec = { hwAlpha: 0.2, hwBeta: 0.05, hwGamma: 0.2, hwPeriod: currentBrand.unit === 'Meses' ? 12 : 4 };
    updateCurrentBrand({ params: { ...currentBrand.params, ...rec } });
  };

  const copyToClipboard = () => {
    const text = chartData.map(d => `${d.period}\t${d.Real || '-'}\t${d.Forecast || d[winner.name] || '-'}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      const el = document.createElement('textarea'); el.value = text;
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    });
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const openAssortmentModal = () => {
    if (!currentBrand) return;
    const historySum = currentBrand.data ? currentBrand.data.reduce((a, b) => a + b, 0) : 0;
    setAssortmentForm({ name: currentBrand.name, start: 1, end: 6, budget: 0, historyPzs: historySum });
    setIsAssortmentModalOpen(true);
  };

  const sendToAssortment = () => {
    if (!winner.future?.length) return;
    const startIdx = Math.max(0, assortmentForm.start - 1);
    const endIdx = Math.min(winner.future.length, assortmentForm.end);
    const selectedSlice = winner.future.slice(startIdx, endIdx);
    const totalSum = selectedSlice.reduce((a, b) => a + b, 0);
    const participations = selectedSlice.map(v => totalSum > 0 ? parseFloat(((v / totalSum) * 100).toFixed(2)) : 0);
    const exportData = {
      forecastData: {
        brands: [{
          name: assortmentForm.name,
          budget: parseFloat(assortmentForm.budget) || 0,
          historyPzs: parseFloat(assortmentForm.historyPzs) || 0,
          months: participations,
        }],
      },
    };
    const jsonContent = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(jsonContent).catch(() => {
      const el = document.createElement('textarea'); el.value = jsonContent;
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    });
    alert('Data JSON de participación vinculada correctamente para Assortment.');
    setIsAssortmentModalOpen(false);
  };

  const importDatabase = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = ev.target.result.split('\n');
      const newBrands = rows.map((row, idx) => {
        const cols = row.split(',');
        if (cols.length < 2) return null;
        const name = cols[0].trim();
        const data = parseNumbers(cols.slice(1).join(' '));
        if (!name || data.length === 0) return null;
        return {
          id: Date.now() + idx, name, data, unit: 'Meses', horizon: 12,
          params: { sesAlpha: 0.3, holtAlpha: 0.3, holtBeta: 0.1, hwAlpha: 0.2, hwBeta: 0.1, hwGamma: 0.3, hwPeriod: 12 },
        };
      }).filter(Boolean);
      if (newBrands.length > 0) { setBrands(newBrands); setSelectedBrandId(newBrands[0].id); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const newBrandDefaults = { sesAlpha: 0.3, holtAlpha: 0.3, holtBeta: 0.1, hwAlpha: 0.2, hwBeta: 0.1, hwGamma: 0.3, hwPeriod: 12 };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex flex-col font-sans text-slate-300 overflow-hidden">

      {/* HEADER */}
      <header className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-30 shadow-2xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all"
          >
            {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
          <div className="flex items-center gap-3">
            <TrendingUp size={22} className="text-violet-500" />
            <h1 className="text-2xl font-black tracking-tighter text-white leading-none uppercase">
              GO <span className="text-violet-500">Forecasting</span>
            </h1>
          </div>
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all border border-zinc-700 shadow-md">
            <Database size={16} /> Subir BD (CSV)
            <input type="file" className="hidden" accept=".csv" onChange={importDatabase} />
          </label>
          <button
            onClick={() => {
              const newId = Date.now();
              const newB = { id: newId, name: 'Nueva Marca', data: [], unit: 'Meses', horizon: 12, params: newBrandDefaults };
              setBrands(prev => [...prev, newB]);
              setSelectedBrandId(newId);
              setIsEditing(newId);
              setEditForm({ name: 'Nueva Marca', data: '', unit: 'Meses' });
            }}
            className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-violet-500 shadow-xl transition-all"
          >
            <Plus size={16} /> Nueva Marca
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative text-left">

        {/* SIDEBAR */}
        <aside className={`sidebar-transition absolute md:relative z-20 h-full bg-zinc-950 border-r border-zinc-800 flex flex-col ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 md:opacity-0 pointer-events-none'}`}>
          <div className="p-4 bg-zinc-900/30 border-b border-zinc-800 flex items-center justify-between whitespace-nowrap overflow-hidden">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Portafolio Activo</span>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full border border-violet-400/20">{brands.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {brands.map(brand => (
              <div
                key={brand.id}
                onClick={() => setSelectedBrandId(brand.id)}
                className={`w-full group p-4 rounded-2xl transition-all flex items-center justify-between cursor-pointer border ${selectedBrandId === brand.id ? 'bg-zinc-900 border-violet-500/50 shadow-inner' : 'bg-transparent border-transparent hover:bg-zinc-900/50'}`}
              >
                <div className="flex-1 min-w-0 text-left">
                  <p className={`font-bold text-sm truncate ${selectedBrandId === brand.id ? 'text-white' : 'text-zinc-400'}`}>{brand.name}</p>
                  <p className="text-[10px] text-zinc-600 font-bold uppercase mt-0.5">{brand.unit}</p>
                </div>
                <div className={`flex gap-1 ${selectedBrandId === brand.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  <button
                    onClick={e => { e.stopPropagation(); setIsEditing(brand.id); setEditForm({ name: brand.name, data: brand.data.join(' '), unit: brand.unit }); }}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-violet-400"
                  ><Edit3 size={14} /></button>
                  <button
                    onClick={e => { e.stopPropagation(); const f = brands.filter(b => b.id !== brand.id); setBrands(f); if (selectedBrandId === brand.id) setSelectedBrandId(f[0]?.id || null); }}
                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-rose-500 transition-all"
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-zinc-800 space-y-2 bg-zinc-950/80">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1 text-center">Gestión de Sesión</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { const b = new Blob([JSON.stringify({ brands })], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'goplanner_sesion.json'; l.click(); }}
                className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 p-3 rounded-xl text-[10px] font-bold border border-zinc-800 transition-all active:scale-95"
              ><Save size={12} /> RESPALDAR</button>
              <label className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 p-3 rounded-xl text-[10px] font-bold border border-zinc-800 cursor-pointer transition-all active:scale-95">
                <Upload size={12} /> CARGAR
                <input type="file" className="hidden" accept=".json" onChange={e => {
                  const f = e.target.files[0]; if (!f) return;
                  const r = new FileReader(); r.onload = ev => {
                    try { const d = JSON.parse(ev.target.result); if (d.brands) { setBrands(d.brands); if (d.brands.length) setSelectedBrandId(d.brands[0].id); } } catch { alert('Archivo no válido'); }
                  }; r.readAsText(f); e.target.value = '';
                }} />
              </label>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto p-8 bg-black">
          <div className="max-w-6xl mx-auto space-y-8 animate-fade-in text-left">

            {/* PANTALLA VACÍA */}
            {!currentBrand && !isEditing && (
              <div className="flex items-center justify-center min-h-[70vh]">
                <div className="max-w-2xl bg-zinc-950 border-4 border-violet-600 p-12 rounded-[48px] shadow-[0_0_80px_-20px_rgba(124,58,237,0.5)] text-center animate-fade-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={128} /></div>
                  <div className="bg-violet-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-600/30">
                    <Rocket size={28} className="text-white" />
                  </div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">
                    Módulo Forecasting <br /><span className="text-violet-500">GO PLANNER</span>
                  </h2>
                  <p className="text-zinc-400 text-sm mb-10 leading-relaxed px-6 font-bold uppercase tracking-widest opacity-60">Estación de planeación predictiva avanzada</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                    <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl hover:border-violet-500/50 transition-all shadow-inner">
                      <h4 className="text-violet-400 font-bold text-xs uppercase mb-3 flex items-center gap-2"><FileSpreadsheet size={14} /> Estructura del CSV</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Columna A: Nombre de Marca.<br />Columna B+: Valores numéricos históricos.<br /><br />
                        <code className="text-violet-300 block bg-black p-2 rounded mt-1 font-mono text-[10px] border border-zinc-800 uppercase">Marca X, 1200, 1000, 1500...</code>
                      </p>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl hover:border-yellow-500/50 transition-all shadow-inner">
                      <h4 className="text-yellow-500 font-bold text-xs uppercase mb-3 flex items-center gap-2"><Zap size={14} /> Pegado de Excel</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Copia datos directamente. El motor procesará espacios y omitirá comas de formato.<br /><br />
                        <span className="text-zinc-400 font-bold italic">Nota: "1,000" se lee como mil (1000).</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EDITOR */}
            {isEditing && (
              <div className="bg-zinc-900 border border-zinc-700 p-8 rounded-[32px] shadow-2xl mb-8 text-left">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="font-black text-xl text-white uppercase flex items-center gap-3"><Edit3 size={18} className="text-violet-500" /> Gestionar Datos</h3>
                  <button onClick={() => setIsEditing(null)} className="text-zinc-500 hover:text-white transition-colors"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                  <div>
                    <label className="text-[10px] font-black text-zinc-500 mb-2 block uppercase tracking-widest text-center">Nombre Comercial</label>
                    <input className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-violet-500 font-bold text-white transition-all uppercase" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-zinc-500 mb-2 block uppercase tracking-widest text-center">Unidad Estratégica</label>
                    <div className="flex gap-2">
                      {['Meses', 'Semanas'].map(u => (
                        <button key={u} onClick={() => setEditForm({ ...editForm, unit: u })} className={`flex-1 py-4 rounded-2xl font-black text-xs transition-all border ${editForm.unit === u ? 'bg-violet-600 border-violet-500 text-white shadow-lg' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>{u}</button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-yellow-500 mb-2 block uppercase tracking-widest text-center">Datos Históricos (Pega desde Excel)</label>
                    <textarea className="w-full bg-zinc-950 border border-zinc-800 rounded-3xl p-6 outline-none focus:ring-2 focus:ring-violet-500 font-mono text-xs h-32 text-zinc-300 resize-none shadow-inner" value={editForm.data} onChange={e => setEditForm({ ...editForm, data: e.target.value })} />
                  </div>
                </div>
                <button onClick={saveEdit} className="w-full mt-8 bg-violet-600 text-white font-black py-5 rounded-3xl hover:bg-violet-500 transition-all shadow-xl uppercase tracking-widest">Procesar y Guardar</button>
              </div>
            )}

            {/* VISTA MARCA SELECCIONADA */}
            {currentBrand && !isEditing && (
              <>
                {/* Nombre + horizonte + winner */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 text-left">
                  <div className="flex-1">
                    <h2 className="text-5xl font-black text-white tracking-tighter mb-4 leading-none uppercase">{currentBrand.name}</h2>
                    <div className="flex gap-4 items-center">
                      <span className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800 text-xs font-bold uppercase tracking-widest text-zinc-500 shadow-sm">
                        <Calendar size={12} className="text-violet-500" /> Plan por {currentBrand.unit}
                      </span>
                      <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 px-5 py-1.5 rounded-full shadow-inner">
                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Horizonte Fcst:</span>
                        <input type="range" min="1" max="24" step="1" value={currentBrand.horizon || 12} onChange={e => updateCurrentBrand({ horizon: parseInt(e.target.value) })} className="w-24 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-yellow-500" />
                        <span className="text-xs font-bold text-white w-4 text-center">{currentBrand.horizon || 12}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 px-8 py-5 rounded-[32px] flex items-center gap-5 shadow-2xl hover:border-yellow-500/30 transition-all">
                    <div className="bg-yellow-500 p-3 rounded-2xl text-black shadow-lg shadow-yellow-500/20 animate-pulse"><Trophy size={20} /></div>
                    <div className="text-left">
                      <p className="text-[10px] font-black text-zinc-500 uppercase mb-0.5 leading-none tracking-widest">Mejor Ajuste</p>
                      <p className="font-black text-xl text-white tracking-tight uppercase leading-tight">{winner.name}</p>
                    </div>
                  </div>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  {[
                    { l: 'Accuracy Score', v: winner.accuracy.toFixed(1) + '%', c: 'text-violet-400', bg: 'bg-violet-400/5' },
                    { l: 'Bias (Sesgo)',   v: winner.bias.toFixed(1) + '%',     c: Math.abs(winner.bias) > 5 ? 'text-rose-400' : 'text-emerald-400', bg: 'bg-zinc-900' },
                    { l: 'Error (WMAPE)', v: winner.wmape.toFixed(1) + '%',     c: 'text-zinc-200', bg: 'bg-zinc-900' },
                    { l: 'Data Points',   v: currentBrand.data?.length || 0,    c: 'text-zinc-500', bg: 'bg-zinc-900' },
                  ].map((m, i) => (
                    <div key={i} className={`${m.bg} p-6 rounded-[32px] border border-zinc-800 shadow-lg hover:scale-[1.02] transition-all text-center`}>
                      <p className="text-[10px] font-black text-zinc-600 uppercase mb-2 tracking-widest">{m.l}</p>
                      <p className={`text-3xl font-black ${m.c} tracking-tighter`}>{m.v}</p>
                    </div>
                  ))}
                </div>

                {/* Gráfica */}
                <div className="bg-zinc-950 p-8 rounded-[48px] border border-zinc-800 shadow-2xl h-[500px] overflow-hidden relative">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6 px-4">
                    <div className="flex gap-6">
                      <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-zinc-700" /> Real</span>
                      <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-violet-600" /> Modelo</span>
                      <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500" /> Forecast</span>
                    </div>
                    <span className="text-yellow-500/40 italic">--- Proyección Acumulada (Eje Secundario)</span>
                  </div>
                  <ResponsiveContainer width="100%" height="90%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: '#52525b', fontSize: 10 }} dy={12} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#52525b', fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#09090b', borderRadius: '24px', border: '1px solid #27272a' }} />
                      <Bar dataKey="Real" fill="#27272a" radius={[4, 4, 0, 0]} barSize={20} opacity={0.4} />
                      {winner.name !== 'N/A' && <Line type="monotone" dataKey={winner.name} stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3, fill: '#000', strokeWidth: 2, stroke: '#8b5cf6' }} />}
                      <Line type="monotone" dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="10 5" dot={{ r: 5, fill: '#000', strokeWidth: 3, stroke: '#fbbf24' }} />
                      <Line yAxisId="right" type="stepAfter" dataKey="Acumulado" stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 3" dot={false} opacity={0.3} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Export Pipeline */}
                <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl text-left">
                  <div className="flex items-center gap-6">
                    <div className="bg-white text-black p-4 rounded-3xl shadow-xl shadow-white/5"><FileSpreadsheet size={20} /></div>
                    <div className="text-left">
                      <h3 className="font-black text-white uppercase text-lg mb-1 leading-none tracking-widest">Export Pipeline</h3>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Salidas integradas para planeación</p>
                    </div>
                  </div>
                  <div className="flex gap-4 w-full md:w-auto flex-wrap">
                    <button onClick={copyToClipboard} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 font-black px-8 py-4 rounded-2xl transition-all border border-zinc-800 group">
                      {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="group-hover:text-violet-400 transition-colors" />}
                      {copied ? 'LISTO' : 'COPIAR DATA'}
                    </button>
                    <button onClick={() => {
                      const csv = 'data:text/csv;charset=utf-8,' + ['Periodo,Tipo,Valor', ...chartData.map(d => `${d.period},${d.Forecast ? 'FORECAST' : 'REAL'},${d.Forecast || d.Real || 0}`)].join('\n');
                      const link = document.createElement('a'); link.href = encodeURI(csv); link.download = `fcst_${currentBrand.name}.csv`; link.click();
                    }} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-zinc-950 border border-zinc-800 text-white font-black px-6 py-4 rounded-2xl hover:bg-zinc-800 transition-all shadow-xl">
                      <Download size={16} /> BAJAR EXCEL
                    </button>
                    <button onClick={openAssortmentModal} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-xl shadow-violet-900/20 group">
                      <ShoppingCart size={16} className="group-hover:scale-110 transition-transform" /> ENVIAR A ASSORTMENT
                      <span className="text-[8px] bg-white/20 px-1 rounded-sm ml-1 font-black">BETA</span>
                    </button>
                  </div>
                </div>

                {/* Parámetros */}
                <div className="bg-zinc-950 rounded-[48px] p-10 border border-zinc-900 shadow-inner text-left">
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4"><Settings2 size={18} className="text-violet-500" /><h3 className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">Analítica Profunda por SKU</h3></div>
                    <button onClick={autoCalibrate} className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-black border border-yellow-500/20 px-6 py-3 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 shadow-sm uppercase tracking-widest">
                      <Zap size={12} className="fill-current" /> AUTO-CALIBRAR MODELO
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {[
                      { label: 'Aprendizaje (Alpha)', val: currentBrand.params?.sesAlpha || 0.3,  min: 0.05, max: 0.95, step: 0.05, tip: suggestions.a, key: 'alpha' },
                      { label: 'Sensibilidad (Beta)',  val: currentBrand.params?.holtBeta || 0.1,  min: 0.05, max: 0.95, step: 0.05, tip: suggestions.b, key: 'beta' },
                      { label: 'Ciclo Estacional',     val: currentBrand.params?.hwPeriod || 12,  min: 2,    max: 24,   step: 1,    tip: suggestions.p, key: 'period' },
                    ].map(param => (
                      <div key={param.key} className="space-y-4 text-left">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 leading-none">
                          {param.label} <span className="text-violet-400 font-bold text-sm">{param.val}</span>
                        </div>
                        <input
                          type="range" min={param.min} max={param.max} step={param.step} value={param.val}
                          onChange={e => {
                            const v = param.step === 1 ? parseInt(e.target.value) : parseFloat(e.target.value);
                            if (param.key === 'alpha') updateCurrentBrand({ params: { ...currentBrand.params, sesAlpha: v, holtAlpha: v, hwAlpha: v } });
                            if (param.key === 'beta')  updateCurrentBrand({ params: { ...currentBrand.params, holtBeta: v, hwBeta: v } });
                            if (param.key === 'period')updateCurrentBrand({ params: { ...currentBrand.params, hwPeriod: v } });
                          }}
                          className="w-full h-1.5 bg-zinc-900 rounded-full appearance-none cursor-pointer"
                        />
                        <p className="text-[9px] text-zinc-600 italic border-l border-zinc-800 pl-3 leading-relaxed">💡 {param.tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* MODAL ASSORTMENT */}
      {isAssortmentModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-zinc-900 border-2 border-violet-500 w-full max-w-lg rounded-[32px] shadow-2xl p-8 relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 p-4 opacity-10"><ShoppingCart size={96} /></div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 flex items-center gap-3">
              <Link size={20} className="text-violet-500" /> Vincular a Assortment
            </h3>
            <p className="text-[10px] text-zinc-500 mb-8 font-black uppercase tracking-widest leading-relaxed">Define el rango de compra y el nombre del GOA para exportar participaciones.</p>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-zinc-400 mb-2 block uppercase tracking-widest">Nombre del GOA / Marca</label>
                <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none focus:ring-2 focus:ring-violet-500 font-bold text-white uppercase" value={assortmentForm.name} onChange={e => setAssortmentForm({ ...assortmentForm, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-400 mb-2 block uppercase tracking-widest">Mes Inicio</label>
                  <input type="number" min="1" max="24" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none text-white font-bold" value={assortmentForm.start} onChange={e => setAssortmentForm({ ...assortmentForm, start: parseInt(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-400 mb-2 block uppercase tracking-widest">Mes Final</label>
                  <input type="number" min="1" max="24" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none text-white font-bold" value={assortmentForm.end} onChange={e => setAssortmentForm({ ...assortmentForm, end: parseInt(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-400 mb-2 block uppercase tracking-widest">Presupuesto ($)</label>
                  <input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none focus:ring-2 focus:ring-violet-500 text-white font-bold" value={assortmentForm.budget} onChange={e => setAssortmentForm({ ...assortmentForm, budget: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-400 mb-2 block uppercase tracking-widest">Historia (Pzs)</label>
                  <input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 outline-none focus:ring-2 focus:ring-violet-500 text-white font-bold" value={assortmentForm.historyPzs} onChange={e => setAssortmentForm({ ...assortmentForm, historyPzs: e.target.value })} />
                </div>
              </div>

              {/* Accesos rápidos */}
              <div className="grid grid-cols-4 gap-2">
                {[{ l: 'S1 (1-6)', s: 1, e: 6 }, { l: 'S2 (7-12)', s: 7, e: 12 }, { l: 'Q1 (1-3)', s: 1, e: 3 }, { l: 'Q4 (10-12)', s: 10, e: 12 }].map(q => (
                  <button key={q.l} onClick={() => setAssortmentForm({ ...assortmentForm, start: q.s, end: q.e })} className="bg-zinc-800 hover:bg-violet-900/40 border border-zinc-700 p-2 rounded-lg text-[9px] font-bold transition-all text-white">{q.l}</button>
                ))}
              </div>

              <div className="bg-zinc-800/50 p-5 rounded-2xl border border-zinc-700 shadow-inner">
                <div className="flex items-center gap-2 mb-2"><Percent size={14} className="text-yellow-500" /><p className="text-[10px] text-yellow-500 font-black uppercase">Exportación Inteligente a Assortment</p></div>
                <p className="text-[11px] text-zinc-400 leading-relaxed italic font-medium">Se enviará un JSON con la distribución porcentual exacta de los meses seleccionados para automatizar la planeación de compras.</p>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsAssortmentModalOpen(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs border border-zinc-700">Cancelar</button>
                <button onClick={sendToAssortment} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-black py-4 px-10 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-xs shadow-violet-900/20">Enviar Data</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

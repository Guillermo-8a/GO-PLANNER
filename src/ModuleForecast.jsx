import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart
} from 'recharts';
import { 
  Trophy, Trash2, Edit3, X, Calendar, Menu, Rocket, FileText, Zap, ShoppingCart, Copy, Check
} from 'lucide-react';

// --- Motores Matemáticos ---
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
    const final = alpha * data[data.length-1] + (1 - alpha) * level;
    return { history: res, future: Array(horizon).fill(final) };
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

export default function ModuleForecast() {
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', data: '', unit: 'Meses' });

  // CONEXIÓN VITAL AL SHELL (Pipeline)
  useEffect(() => {
    if (window.__gopForecastBridge && brands.length > 0) {
      window.__gopForecastBridge.publishForecastResults(brands);
    }
  }, [brands]);

  const currentBrand = brands.find(b => b.id === selectedBrandId) || null;

  const results = useMemo(() => {
    if (!currentBrand || !currentBrand.data) return [];
    return Object.keys(engines).map(name => {
      const { history, future } = engines[name](currentBrand.data, currentBrand.params || {sesAlpha: 0.3, hwPeriod: 12}, currentBrand.horizon || 12);
      return { name, history, future, ...getMetrics(currentBrand.data, history) };
    }).sort((a,b) => b.accuracy - a.accuracy);
  }, [currentBrand]);

  const winner = results[0] || { accuracy: 0, name: 'N/A', history: [], future: [] };

  const saveEdit = () => {
    const data = editForm.data.replace(/,/g, '').split(/[\s;\t\n]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    const id = isEditing;
    setBrands(prev => {
        const exists = prev.find(b => b.id === id);
        if (exists) {
            return prev.map(b => b.id === id ? { ...b, name: editForm.name, data, unit: editForm.unit } : b);
        }
        return [...prev, { id, name: editForm.name, data, unit: editForm.unit, horizon: 12, params: { sesAlpha: 0.3, hwPeriod: 12 } }];
    });
    setSelectedBrandId(id);
    setIsEditing(null);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
        {!currentBrand && !isEditing && (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="max-w-2xl bg-zinc-950/50 border-2 border-violet-600 p-12 rounded-[48px] shadow-2xl text-center">
                    <Rocket className="mx-auto text-violet-500 mb-6" size={56} />
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Módulo Forecasting</h2>
                    <p className="text-zinc-400 text-sm mb-10">Carga una marca o SKU para iniciar el proceso de planeación.</p>
                    <button onClick={() => { setIsEditing(Date.now()); setEditForm({name: 'Nueva Marca', data: '', unit: 'Meses'}); }} className="bg-violet-600 text-white px-8 py-4 rounded-2xl font-black uppercase">+ Nueva Marca</button>
                </div>
            </div>
        )}

        {isEditing && (
             <div className="bg-zinc-900 p-10 rounded-[40px] border border-zinc-700 shadow-2xl">
                <div className="flex justify-between mb-8"><h3 className="text-white font-black uppercase">Gestionar Datos</h3><button onClick={() => setIsEditing(null)} className="text-zinc-500"><X /></button></div>
                <input className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white mb-4" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Nombre" />
                <textarea className="w-full bg-black border border-zinc-800 p-4 rounded-2xl text-white h-40 font-mono mb-4" value={editForm.data} onChange={e => setEditForm({...editForm, data: e.target.value})} placeholder="Pega datos de Excel..." />
                <button onClick={saveEdit} className="w-full bg-violet-600 p-5 rounded-3xl text-white font-black uppercase">VINCULAR AL PIPELINE</button>
             </div>
        )}

        {currentBrand && !isEditing && (
            <div className="space-y-8 text-left">
                <div className="flex justify-between items-end">
                    <h2 className="text-5xl font-black text-white uppercase leading-none">{currentBrand.name}</h2>
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex items-center gap-4">
                        <Trophy className="text-yellow-500" />
                        <div><p className="text-[10px] text-zinc-500 font-bold uppercase">Accuracy</p><p className="text-2xl font-black text-white">{winner.accuracy.toFixed(1)}%</p></div>
                    </div>
                </div>
                <div className="bg-zinc-950 p-8 rounded-[48px] border border-zinc-800 h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={currentBrand.data.map((v, i) => ({ p: i+1, r: v, m: winner.history[i] }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis dataKey="p" hide />
                        <YAxis tick={{fill:'#52525b', fontSize:10}} axisLine={false} />
                        <Tooltip contentStyle={{backgroundColor:'#000', borderRadius:'20px', border:'none'}} />
                        <Bar dataKey="r" fill="#27272a" radius={[6,6,0,0]} barSize={30} />
                        <Line dataKey="m" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                    </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}
    </div>
  );
}

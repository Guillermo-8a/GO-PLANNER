import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Cell, Area
} from 'recharts';
import { 
  Trophy, Plus, Trash2, Edit3, Download, Copy, Check,
  Zap, Save, X, FileSpreadsheet, Calendar, Menu, Sun, Moon, Database, ShoppingCart, Rocket, FileText
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
      const lastLevel = level;
      level = alpha * (data[i] / (seasonals[i % L] || 1)) + (1 - alpha) * (level + trend);
      trend = beta * (level - lastLevel) + (1 - beta) * trend;
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

// COMPONENTE PRINCIPAL DEL MÓDULO
export default function ModuleForecast() {
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null);
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', data: '', unit: 'Meses' });
  const [copied, setCopied] = useState(false);

  // CONEXIÓN AL SHELL (Bridge)
  useEffect(() => {
    if (window.__gopForecastBridge && brands.length > 0) {
      window.__gopForecastBridge.publishForecastResults(brands);
    }
  }, [brands]);

  const currentBrand = brands.find(b => b.id === selectedBrandId) || null;

  const results = useMemo(() => {
    if (!currentBrand || !currentBrand.data) return [];
    return Object.keys(engines).map(name => {
      const { history, future } = engines[name](currentBrand.data, currentBrand.params, currentBrand.horizon || 12);
      return { name, history, future, ...getMetrics(currentBrand.data, history) };
    }).sort((a,b) => b.accuracy - a.accuracy);
  }, [currentBrand]);

  const winner = results[0] || { accuracy: 0, name: 'N/A', history: [], future: [] };

  const chartData = useMemo(() => {
    if (!currentBrand) return [];
    const hist = currentBrand.data.map((v, i) => ({
      period: `M${i+1}`, Real: v, Modelo: winner.history[i]
    }));
    let acc = 0;
    const future = winner.future.map((v, i) => {
        acc += v;
        return { period: `F${i+1}`, Forecast: v, Acumulado: acc };
    });
    return [...hist, ...future];
  }, [currentBrand, winner]);

  const saveEdit = () => {
    const data = editForm.data.replace(/,/g, '').split(/[\s;\t\n]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    setBrands(prev => prev.map(b => b.id === isEditing ? { ...b, name: editForm.name, data, unit: editForm.unit } : b));
    setIsEditing(null);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
        {!currentBrand && !isEditing && (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="max-w-2xl bg-zinc-950/50 border-2 border-violet-600 p-12 rounded-[48px] shadow-2xl text-center">
                    <Rocket className="mx-auto text-violet-500 mb-6" size={56} />
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Módulo Forecasting</h2>
                    <p className="text-zinc-400 text-sm mb-10">Inicia cargando una marca en el panel lateral para activar el pipeline de planeación.</p>
                </div>
            </div>
        )}

        {/* ... Lógica de marcas y edición (Simplificada para el Shell) ... */}
        <div className="flex justify-end">
            <button onClick={() => {
                const id = Date.now();
                const newB = { id, name: 'Nueva Marca', data: [], unit: 'Meses', horizon: 12, params: { sesAlpha: 0.3, hwAlpha: 0.2, hwBeta: 0.1, hwGamma: 0.3, hwPeriod: 12 } };
                setBrands([...brands, newB]); setSelectedBrandId(id); setIsEditing(id); setEditForm({name: 'Nueva Marca', data: '', unit: 'Meses'});
            }} className="bg-violet-600 text-white px-6 py-3 rounded-2xl font-black">+ AÑADIR SERIE</button>
        </div>

        {isEditing && (
             <div className="bg-zinc-900 p-10 rounded-[32px] border border-zinc-700 shadow-2xl">
                <input className="w-full bg-black p-4 rounded-2xl text-white mb-4" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Nombre SKU" />
                <textarea className="w-full bg-black p-4 rounded-2xl text-white h-40 font-mono" value={editForm.data} onChange={e => setEditForm({...editForm, data: e.target.value})} placeholder="Pega datos de Excel..." />
                <button onClick={saveEdit} className="w-full bg-violet-600 p-5 rounded-3xl text-white font-black mt-4">PROCESAR Y VINCULAR AL PIPELINE</button>
             </div>
        )}

        {currentBrand && !isEditing && (
            <div className="space-y-8 text-left">
                <div className="flex justify-between items-end">
                    <h2 className="text-5xl font-black text-white uppercase">{currentBrand.name}</h2>
                    <div className="bg-zinc-900 p-6 rounded-3xl flex items-center gap-4">
                        <Trophy className="text-yellow-500" />
                        <div><p className="text-[10px] text-zinc-500 font-bold uppercase">Mejor Ajuste</p><p className="font-black text-white">{winner.name}</p></div>
                    </div>
                </div>

                <div className="bg-zinc-950 p-8 rounded-[48px] border border-zinc-800 h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis dataKey="period" tick={{fill:'#52525b', fontSize:10}} axisLine={false} />
                        <YAxis tick={{fill:'#52525b', fontSize:10}} axisLine={false} />
                        <Tooltip contentStyle={{backgroundColor:'#000', borderRadius:'24px', border:'none'}} />
                        <Bar dataKey="Real" fill="#27272a" radius={[6,6,0,0]} barSize={30} />
                        <Line dataKey="Modelo" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                        <Line dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="10 5" dot={false} />
                    </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import {
  Menu, ChevronLeft, ChevronRight, TrendingUp, Database, Plus,
  Edit3, Trash2, Save, Upload, Check, Copy, Download, ShoppingCart,
  Calendar, Trophy, Settings2, Zap, FileSpreadsheet, Rocket,
  Link, Percent, X,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea,
} from 'recharts';
import { useGlobal } from '../context/GlobalContext';

// ─── Motores ──────────────────────────────────────────────────────────────────
// Cada motor regresa `fit` (pronóstico one-step-ahead: fit[i] usa SOLO datos < i, sin fuga)
// y `future` (h periodos). Antes Holt/HW calculaban el ajuste después de ver el dato → accuracy inflado.
const engines = {
  'SES': {
    minTrain: () => 3,
    grid: () => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((alpha) => ({ alpha })),
    run: (d, p, h) => {
      let lv = d[0]; const fit = [null];
      for (let i = 1; i < d.length; i++) { fit.push(lv); lv = p.alpha * d[i] + (1 - p.alpha) * lv; }
      return { fit, future: Array(h).fill(lv) };
    },
  },
  'Holt': {
    minTrain: () => 4,
    grid: () => [0.1, 0.2, 0.3, 0.5, 0.7, 0.9].flatMap((alpha) => [0.01, 0.05, 0.1, 0.2, 0.3].map((beta) => ({ alpha, beta }))),
    run: (d, p, h) => {
      let lv = d[1], tr = d[1] - d[0]; const fit = [null, null];
      for (let i = 2; i < d.length; i++) {
        fit.push(lv + tr);
        const pl = lv; lv = p.alpha * d[i] + (1 - p.alpha) * (lv + tr); tr = p.beta * (lv - pl) + (1 - p.beta) * tr;
      }
      return { fit, future: Array.from({ length: h }, (_, j) => lv + (j + 1) * tr) };
    },
  },
  'Holt-Winters': {
    minTrain: (L) => L + 3,
    grid: () => [0.1, 0.2, 0.4, 0.6].flatMap((alpha) => [0.01, 0.05, 0.15].flatMap((beta) => [0.05, 0.1, 0.2, 0.4].map((gamma) => ({ alpha, beta, gamma })))),
    run: (d, p, h, L) => {
      // Multiplicativo. Inicio con el primer ciclo: nivel = promedio, índices = dato / nivel, tendencia 0
      let lv = d.slice(0, L).reduce((a, b) => a + b, 0) / L || 1, tr = 0;
      const si = d.slice(0, L).map((v) => (lv ? v / lv : 1) || 1);
      const fit = Array(L).fill(null);
      for (let i = L; i < d.length; i++) {
        const s = si[i % L];
        fit.push((lv + tr) * s);
        const pl = lv;
        lv = p.alpha * (d[i] / s) + (1 - p.alpha) * (lv + tr);
        tr = p.beta * (lv - pl) + (1 - p.beta) * tr;
        si[i % L] = p.gamma * (lv ? d[i] / lv : s) + (1 - p.gamma) * s;
      }
      return { fit, future: Array.from({ length: h }, (_, j) => (lv + (j + 1) * tr) * si[(d.length + j) % L]) };
    },
  },
  'Estacional': {
    // Mismo periodo del ciclo anterior × tendencia de los últimos 3 periodos vs sus equivalentes del ciclo anterior
    minTrain: (L) => L + 3,
    grid: () => [{}],
    run: (d, p, h, L) => {
      const g = (i) => { const a = d[i - 1] + d[i - 2] + d[i - 3], b = d[i - 1 - L] + d[i - 2 - L] + d[i - 3 - L]; return b ? a / b : 1; };
      const fit = d.map((_, i) => (i >= L + 3 ? d[i - L] * g(i) : null));
      const n = d.length, gf = n >= L + 3 ? g(n) : 1, ext = [...d];
      for (let j = 0; j < h; j++) ext.push(ext[n + j - L] * (j < L ? gf : 1));
      return { fit, future: ext.slice(n) };
    },
  },
};

const getMetrics = (actual, forecast) => {
  let sumAbsErr = 0, sumActual = 0, sumErr = 0, count = 0;
  actual.forEach((v, i) => {
    if (forecast[i] != null) {
      const err = forecast[i] - v;
      sumErr += err; sumAbsErr += Math.abs(err); sumActual += v; count++;
    }
  });
  if (count === 0 || sumActual === 0) return { wmape: 999, accuracy: 0, bias: 0 };
  const wmape = (sumAbsErr / sumActual) * 100;
  return { wmape, accuracy: Math.max(0, 100 - wmape), bias: (sumErr / sumActual) * 100 };
};

const PARAM_LABEL = { alpha: 'α', beta: 'β', gamma: 'γ' };
const cycleOf = (b) => b.params?.hwPeriod || (b.unit === 'Semanas' ? 52 : 12);

// Evalúa todos los motores con backtest: entrena sin los últimos `hold` periodos, pronostica esos
// periodos y mide accuracy (100 − WMAPE). En modo auto busca los mejores parámetros de cada motor.
// El ganador se re-entrena con toda la historia para el pronóstico final.
function evaluateBrand(b) {
  const data = (b.data || []).map((v) => +v || 0), n = data.length, L = cycleOf(b), H = b.horizon || 12;
  if (n < 4) return { results: [], winner: null, hold: 0, L };
  const hold = Math.min(L, Math.max(3, Math.round(n * 0.2)), n - 3);
  const train = data.slice(0, n - hold), test = data.slice(n - hold);
  const manual = b.params?.auto === false;
  const results = Object.entries(engines).map(([name, e]) => {
    if (train.length < e.minTrain(L)) return { name, disabled: `Requiere ${e.minTrain(L) + hold}+ periodos (tienes ${n})` };
    const grid = manual ? [{ alpha: b.params.alpha ?? 0.3, beta: b.params.beta ?? 0.1, gamma: b.params.gamma ?? 0.2 }] : e.grid();
    let best = null;
    grid.forEach((p) => {
      const bt = e.run(train, p, hold, L).future.map((v) => Math.max(0, v));
      const m = getMetrics(test, bt);
      if (!best || m.wmape < best.wmape || (m.wmape === best.wmape && Math.abs(m.bias) < Math.abs(best.bias))) best = { ...m, params: p, backtest: bt };
    });
    const full = e.run(data, best.params, H, L);
    return { name, ...best, fit: full.fit, future: full.future.map((v) => Math.max(0, v)) };
  });
  const ok = results.filter((r) => !r.disabled).sort((x, y) => y.accuracy - x.accuracy || Math.abs(x.bias) - Math.abs(y.bias));
  return { results: [...ok, ...results.filter((r) => r.disabled)], winner: ok[0] || null, hold, L };
}

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

  const gState = useGlobal();
  const isDark = (gState?.theme || 'light') === 'dark';

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

  // Se recalcula solo al cambiar datos/parámetros: ya no hace falta oprimir nada
  const evals = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, evaluateBrand(b)])), [brands]);
  const ev = (currentBrand && evals[currentBrand.id]) || { results: [], winner: null, hold: 0, L: 12 };
  const allResults = ev.results;
  const winner = ev.winner || { name: 'N/A', accuracy: 0, bias: 0, wmape: 0, future: [], fit: [], backtest: [], params: {} };
  const second = allResults.filter((r) => !r.disabled)[1];

  const chartData = useMemo(() => {
    if (!currentBrand?.data) return [];
    const p = currentBrand.unit === 'Meses' ? 'M' : 'S', n = currentBrand.data.length;
    const hist = currentBrand.data.map((val, i) => ({
      period: `${p}${i + 1}`,
      Real: val,
      Ajuste: winner.fit?.[i] != null ? +winner.fit[i].toFixed(1) : null,
      Backtest: i >= n - ev.hold && winner.backtest?.length ? +winner.backtest[i - (n - ev.hold)].toFixed(1) : null,
    }));
    let accSum = 0;
    const future = (winner.future || []).map((val, i) => {
      accSum += val;
      return { period: `F${i + 1}`, Forecast: +val.toFixed(1), Acumulado: +accSum.toFixed(1) };
    });
    return [...hist, ...future];
  }, [currentBrand, winner, ev.hold]);

  const unitTxt = currentBrand?.unit === 'Semanas' ? 'semanas' : 'meses';
  const why = !ev.winner ? 'Se necesitan al menos 4 periodos para evaluar modelos.'
    : `${winner.name} gana: acierta ${winner.accuracy.toFixed(1)}% al pronosticar los últimos ${ev.hold} ${unitTxt} sin haberlos visto`
      + (second ? `, ${(winner.accuracy - second.accuracy).toFixed(1)} pts arriba de ${second.name}` : '')
      + (Math.abs(winner.bias) > 5 ? `. Ojo: tiende a ${winner.bias > 0 ? 'sobre' : 'sub'}-pronosticar ${Math.abs(winner.bias).toFixed(1)}%.` : '.');

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

  const setManualParam = (k, v) => updateCurrentBrand({ params: { ...winner.params, ...currentBrand.params, auto: false, [k]: v } });
  const backToAuto = () => updateCurrentBrand({ params: { ...currentBrand.params, auto: true } });

  const copyToClipboard = () => {
    const text = chartData.map(d => `${d.period}\t${d.Real ?? '-'}\t${d.Forecast ?? d.Ajuste ?? '-'}`).join('\n');
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
          params: { auto: true },
        };
      }).filter(Boolean);
      if (newBrands.length > 0) { setBrands(newBrands); setSelectedBrandId(newBrands[0].id); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const newBrandDefaults = { auto: true };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen p-4 md:p-6 font-sans text-zinc-700 dark:text-slate-300 animate-fade-in`}>

      {/* HEADER MÓDULO */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 mb-6 flex items-center justify-between flex-wrap gap-4 dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-violet-100 dark:bg-violet-500/20">
            <TrendingUp size={22} className="text-violet-500" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white leading-none">Forecasting</h1>
            <p className="text-xs mt-1 text-zinc-500 dark:text-zinc-400">Predicción multi-modelo · SES · Holt · Holt-Winters</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 py-2 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700 transition-all"
          >
            {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />} Portafolio
          </button>
          <label className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border border-zinc-200 dark:border-zinc-700 transition-all">
            <Database size={14} /> Subir BD (CSV)
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
            className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-violet-500 shadow-sm transition-all"
          >
            <Plus size={14} /> Nueva Marca
          </button>
        </div>
      </div>

      {/* CUERPO */}
      <div className="flex gap-6 items-start text-left">

        {/* SIDEBAR PORTAFOLIO (en flujo) */}
        {isSidebarOpen && (
        <aside className="w-72 shrink-0 self-start sticky top-4 max-h-[calc(100vh-2rem)] bg-white dark:bg-[#1c1720] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 bg-zinc-100/30 dark:bg-white/[0.03] border-b border-zinc-200 dark:border-white/10 flex items-center justify-between whitespace-nowrap overflow-hidden">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Portafolio Activo</span>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full border border-violet-400/20">{brands.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {brands.map(brand => (
              <div
                key={brand.id}
                onClick={() => setSelectedBrandId(brand.id)}
                className={`w-full group p-4 rounded-2xl transition-all flex items-center justify-between cursor-pointer border ${selectedBrandId === brand.id ? 'bg-zinc-100 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border-violet-500/50 shadow-inner' : 'bg-transparent border-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50'}`}
              >
                <div className="flex-1 min-w-0 text-left">
                  <p className={`font-bold text-sm truncate ${selectedBrandId === brand.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'}`}>{brand.name}</p>
                  {(() => { const w = evals[brand.id]?.winner; return (
                    <p className="text-[10px] font-bold uppercase mt-0.5 text-zinc-500">
                      {w ? <>{w.name} · <span className={w.accuracy >= 85 ? 'text-emerald-500' : w.accuracy >= 70 ? 'text-yellow-500' : 'text-rose-500'}>{w.accuracy.toFixed(0)}%</span></> : brand.unit}
                    </p>); })()}
                </div>
                <div className={`flex gap-1 ${selectedBrandId === brand.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  <button
                    onClick={e => { e.stopPropagation(); setIsEditing(brand.id); setEditForm({ name: brand.name, data: brand.data.join(' '), unit: brand.unit }); }}
                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-violet-400"
                  ><Edit3 size={14} /></button>
                  <button
                    onClick={e => { e.stopPropagation(); const f = brands.filter(b => b.id !== brand.id); setBrands(f); if (selectedBrandId === brand.id) setSelectedBrandId(f[0]?.id || null); }}
                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-rose-500 transition-all"
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-zinc-200 dark:border-white/10 space-y-2 bg-white/80 dark:bg-white/[0.03]">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1 text-center">Gestión de Sesión</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { const b = new Blob([JSON.stringify({ brands })], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'goplanner_sesion.json'; l.click(); }}
                className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] hover:bg-zinc-200 dark:hover:bg-zinc-800 p-3 rounded-xl text-[10px] font-bold border border-zinc-200 dark:border-white/10 transition-all active:scale-95"
              ><Save size={12} /> RESPALDAR</button>
              <label className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] hover:bg-zinc-200 dark:hover:bg-zinc-800 p-3 rounded-xl text-[10px] font-bold border border-zinc-200 dark:border-white/10 cursor-pointer transition-all active:scale-95">
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
        )}

        {/* MAIN */}
        <main className="flex-1 min-w-0">
          <div className="w-full space-y-8 animate-fade-in text-left">

            {/* PANTALLA VACÍA */}
            {!currentBrand && !isEditing && (
              <div className="flex items-center justify-center min-h-[70vh]">
                <div className="max-w-2xl bg-white dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border-4 border-violet-600 p-12 rounded-[48px] shadow-[0_0_80px_-20px_rgba(124,58,237,0.5)] text-center animate-fade-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp size={128} /></div>
                  <div className="bg-violet-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-600/30">
                    <Rocket size={28} className="text-white" />
                  </div>
                  <h2 className="text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter mb-4 leading-none">
                    Módulo Forecasting <br /><span className="text-violet-500">GO PLANNER</span>
                  </h2>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-10 leading-relaxed px-6 font-bold uppercase tracking-widest opacity-60">Estación de planeación predictiva avanzada</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                    <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-3xl hover:border-violet-500/50 transition-all shadow-inner dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 duration-300 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                      <h4 className="text-violet-400 font-bold text-xs uppercase mb-3 flex items-center gap-2"><FileSpreadsheet size={14} /> Estructura del CSV</h4>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-500 leading-relaxed">
                        Columna A: Nombre de Marca.<br />Columna B+: Valores numéricos históricos.<br /><br />
                        <code className="text-violet-700 dark:text-violet-300 block bg-zinc-100 dark:bg-black p-2 rounded mt-1 font-mono text-[10px] border border-zinc-200 dark:border-zinc-800 uppercase">Marca X, 1200, 1000, 1500...</code>
                      </p>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-3xl hover:border-yellow-500/50 transition-all shadow-inner dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                      <h4 className="text-yellow-500 font-bold text-xs uppercase mb-3 flex items-center gap-2"><Zap size={14} /> Pegado de Excel</h4>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-500 leading-relaxed">
                        Copia datos directamente. El motor procesará espacios y omitirá comas de formato.<br /><br />
                        <span className="text-zinc-700 dark:text-zinc-400 font-bold italic">Nota: "1,000" se lee como mil (1000).</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* EDITOR */}
            {isEditing && (
              <div className="bg-zinc-50 border border-zinc-200 dark:border-zinc-700 p-8 rounded-[32px] shadow-2xl mb-8 text-left dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="font-black text-xl text-zinc-900 dark:text-white uppercase flex items-center gap-3"><Edit3 size={18} className="text-violet-500" /> Gestionar Datos</h3>
                  <button onClick={() => setIsEditing(null)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                  <div>
                    <label className="text-[10px] font-black text-zinc-500 mb-2 block uppercase tracking-widest text-center">Nombre Comercial</label>
                    <input className="w-full bg-white dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-violet-500 font-bold text-zinc-900 dark:text-white transition-all uppercase" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-zinc-500 mb-2 block uppercase tracking-widest text-center">Unidad Estratégica</label>
                    <div className="flex gap-2">
                      {['Meses', 'Semanas'].map(u => (
                        <button key={u} onClick={() => setEditForm({ ...editForm, unit: u })} className={`flex-1 py-4 rounded-2xl font-black text-xs transition-all border ${editForm.unit === u ? 'bg-violet-600 border-violet-500 text-white shadow-lg' : 'bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-700'}`}>{u}</button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-yellow-500 mb-2 block uppercase tracking-widest text-center">Datos Históricos (Pega desde Excel)</label>
                    <textarea className="w-full bg-white dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-3xl p-6 outline-none focus:ring-2 focus:ring-violet-500 font-mono text-xs h-32 text-zinc-700 dark:text-zinc-300 resize-none shadow-inner" value={editForm.data} onChange={e => setEditForm({ ...editForm, data: e.target.value })} />
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
                    <h2 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tighter mb-4 leading-none uppercase">{currentBrand.name}</h2>
                    <div className="flex gap-4 items-center">
                      <span className="flex items-center gap-2 bg-zinc-100 dark:bg-white/5 px-4 py-2 rounded-full border border-zinc-200 dark:border-white/10 text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-500 shadow-sm">
                        <Calendar size={12} className="text-violet-500" /> Plan por {currentBrand.unit}
                      </span>
                      <div className="flex items-center gap-3 bg-white border border-zinc-200 px-5 py-1.5 rounded-full shadow-inner dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Horizonte Fcst:</span>
                        <input type="range" min="1" max="24" step="1" value={currentBrand.horizon || 12} onChange={e => updateCurrentBrand({ horizon: parseInt(e.target.value) })} className="w-24 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-yellow-500" />
                        <span className="text-xs font-bold text-zinc-900 dark:text-white w-4 text-center">{currentBrand.horizon || 12}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-zinc-50 border border-zinc-200 px-8 py-5 rounded-[32px] flex items-center gap-5 shadow-2xl hover:border-yellow-500/30 transition-all dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                    <div className="bg-yellow-500 p-3 rounded-2xl text-black shadow-lg shadow-yellow-500/20 animate-pulse"><Trophy size={20} /></div>
                    <div className="text-left">
                      <p className="text-[10px] font-black text-zinc-500 uppercase mb-0.5 leading-none tracking-widest">Mejor Ajuste</p>
                      <p className="font-black text-xl text-zinc-900 dark:text-white tracking-tight uppercase leading-tight">{winner.name}</p>
                    </div>
                  </div>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                  {[
                    { l: 'Accuracy Score', v: winner.accuracy.toFixed(1) + '%', c: 'text-violet-400', bg: 'bg-violet-400/5' },
                    { l: 'Bias (Sesgo)',   v: winner.bias.toFixed(1) + '%',     c: Math.abs(winner.bias) > 5 ? 'text-rose-400' : 'text-emerald-400', bg: 'bg-zinc-50 dark:bg-white/5' },
                    { l: 'Error (WMAPE)', v: winner.wmape.toFixed(1) + '%',     c: 'text-zinc-900 dark:text-zinc-200', bg: 'bg-zinc-50 dark:bg-white/5' },
                    { l: 'Backtest',      v: `${ev.hold} / ${currentBrand.data?.length || 0}`, c: 'text-zinc-500', bg: 'bg-zinc-50 dark:bg-white/5' },
                  ].map((m, i) => (
                    <div key={i} className={`${m.bg} p-6 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-lg hover:scale-[1.02] transition-all text-center`}>
                      <p className="text-[10px] font-black text-zinc-600 uppercase mb-2 tracking-widest">{m.l}</p>
                      <p className={`text-3xl font-black ${m.c} tracking-tighter`}>{m.v}</p>
                    </div>
                  ))}
                </div>

                {/* Por qué gana + comparativo de modelos */}
                <div className="bg-white p-6 rounded-[32px] border border-zinc-200 shadow-lg dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-4">💡 {why}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left py-2">Modelo</th><th className="text-right">Accuracy</th><th className="text-right">WMAPE</th><th className="text-right">Bias</th>
                          <th className="text-left pl-6">Parámetros {currentBrand.params?.auto === false ? '(manual)' : '(optimizados)'}</th><th className="text-right">Total fcst</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allResults.map((r, i) => (
                          <tr key={r.name} className={`border-b border-zinc-100 dark:border-zinc-900 ${r.disabled ? 'opacity-50' : ''}`}>
                            <td className="py-2 font-bold text-zinc-900 dark:text-white">{i === 0 && !r.disabled && <Trophy size={12} className="inline mr-1 text-yellow-500" />}{r.name}</td>
                            {r.disabled ? (
                              <td colSpan={5} className="text-right italic text-zinc-500">{r.disabled}</td>
                            ) : (<>
                              <td className={`text-right font-black ${r.accuracy >= 85 ? 'text-emerald-500' : r.accuracy >= 70 ? 'text-yellow-500' : 'text-rose-500'}`}>{r.accuracy.toFixed(1)}%</td>
                              <td className="text-right">{r.wmape.toFixed(1)}%</td>
                              <td className={`text-right ${Math.abs(r.bias) > 5 ? 'text-rose-500' : ''}`}>{r.bias > 0 ? '+' : ''}{r.bias.toFixed(1)}%</td>
                              <td className="pl-6 font-mono text-zinc-500">{Object.entries(r.params || {}).filter(([k]) => PARAM_LABEL[k]).map(([k, v]) => `${PARAM_LABEL[k]} ${v}`).join(' · ') || '—'}</td>
                              <td className="text-right">{Math.round(r.future.reduce((a, b) => a + b, 0)).toLocaleString('es-MX')}</td>
                            </>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-3">Backtest: cada modelo se entrena sin los últimos {ev.hold} {unitTxt} y se compara su pronóstico contra lo real. Gana el mayor accuracy (empate → menor sesgo) y se re-entrena con toda la historia.</p>
                </div>

                {/* Gráfica */}
                <div className="bg-white p-8 rounded-[48px] border border-zinc-200 shadow-2xl h-[500px] overflow-hidden relative dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6 px-4">
                    <div className="flex gap-6">
                      <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-zinc-400 dark:bg-zinc-700" /> Real</span>
                      <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-violet-600" /> Ajuste</span>
                      <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Backtest</span>
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
                      {ev.hold > 0 && chartData.length > ev.hold && <ReferenceArea x1={chartData[currentBrand.data.length - ev.hold]?.period} x2={chartData[currentBrand.data.length - 1]?.period} fill="#10b981" fillOpacity={0.06} />}
                      {winner.name !== 'N/A' && <Line type="monotone" dataKey="Ajuste" stroke="#8b5cf6" strokeWidth={3} connectNulls dot={{ r: 3, fill: '#000', strokeWidth: 2, stroke: '#8b5cf6' }} />}
                      <Line type="monotone" dataKey="Backtest" stroke="#10b981" strokeWidth={3} strokeDasharray="4 3" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Forecast" stroke="#fbbf24" strokeWidth={4} strokeDasharray="10 5" dot={{ r: 5, fill: '#000', strokeWidth: 3, stroke: '#fbbf24' }} />
                      <Line yAxisId="right" type="stepAfter" dataKey="Acumulado" stroke="#fbbf24" strokeWidth={2} strokeDasharray="3 3" dot={false} opacity={0.3} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Export Pipeline */}
                <div className="bg-zinc-50 border border-zinc-200 p-8 rounded-[40px] flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl text-left dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                  <div className="flex items-center gap-6">
                    <div className="bg-zinc-900 dark:bg-white text-white dark:text-black p-4 rounded-3xl shadow-xl shadow-black/5"><FileSpreadsheet size={20} /></div>
                    <div className="text-left">
                      <h3 className="font-black text-zinc-900 dark:text-white uppercase text-lg mb-1 leading-none tracking-widest">Export Pipeline</h3>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Salidas integradas para planeación</p>
                    </div>
                  </div>
                  <div className="flex gap-4 w-full md:w-auto flex-wrap">
                    <button onClick={copyToClipboard} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-white dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-black px-8 py-4 rounded-2xl transition-all border border-zinc-200 dark:border-white/10 group">
                      {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="group-hover:text-violet-400 transition-colors" />}
                      {copied ? 'LISTO' : 'COPIAR DATA'}
                    </button>
                    <button onClick={() => {
                      const csv = 'data:text/csv;charset=utf-8,' + ['Periodo,Tipo,Valor', ...chartData.map(d => `${d.period},${d.Forecast ? 'FORECAST' : 'REAL'},${d.Forecast || d.Real || 0}`)].join('\n');
                      const link = document.createElement('a'); link.href = encodeURI(csv); link.download = `fcst_${currentBrand.name}.csv`; link.click();
                    }} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-white dark:bg-[#1c1720] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white font-black px-6 py-4 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-xl">
                      <Download size={16} /> BAJAR EXCEL
                    </button>
                    <button onClick={openAssortmentModal} className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-xl shadow-violet-900/20 group">
                      <ShoppingCart size={16} className="group-hover:scale-110 transition-transform" /> ENVIAR A ASSORTMENT
                      <span className="text-[8px] bg-white/20 px-1 rounded-sm ml-1 font-black">BETA</span>
                    </button>
                  </div>
                </div>

                {/* Parámetros */}
                <div className="bg-white rounded-[48px] p-10 border border-zinc-200 shadow-inner text-left dark:bg-white/[0.045] dark:backdrop-blur-xl dark:border-white/10 transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)]">
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4"><Settings2 size={18} className="text-violet-500" /><h3 className="text-sm font-black uppercase tracking-[0.3em] text-zinc-700 dark:text-zinc-400">Analítica Profunda por SKU</h3></div>
                    {currentBrand.params?.auto === false ? (
                      <button onClick={backToAuto} className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-black border border-yellow-500/20 px-6 py-3 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 shadow-sm uppercase tracking-widest">
                        <Zap size={12} className="fill-current" /> Volver a automático
                      </button>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2"><Zap size={12} className="fill-current" /> Auto · parámetros optimizados por backtest</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
                    {[
                      { label: 'Aprendizaje (α)',  k: 'alpha', min: 0.05, max: 0.95, step: 0.05, tip: 'Peso de lo más reciente en el nivel.' },
                      { label: 'Tendencia (β)',    k: 'beta',  min: 0.01, max: 0.5,  step: 0.01, tip: 'Qué tan rápido se ajusta la tendencia (Holt/HW).' },
                      { label: 'Estacional (γ)',   k: 'gamma', min: 0.05, max: 0.9,  step: 0.05, tip: 'Qué tan rápido se actualizan los índices (HW).' },
                      { label: 'Ciclo estacional', k: 'hwPeriod', min: 2, max: 52, step: 1, tip: '12 meses / 52 semanas. Aplica a HW y Estacional.' },
                    ].map((pr) => {
                      const val = pr.k === 'hwPeriod' ? ev.L : (currentBrand.params?.auto === false ? currentBrand.params?.[pr.k] : winner.params?.[pr.k]) ?? '—';
                      return (
                        <div key={pr.k} className="space-y-4 text-left">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500 leading-none">
                            {pr.label} <span className="text-violet-400 font-bold text-sm">{val}</span>
                          </div>
                          <input
                            type="range" min={pr.min} max={pr.max} step={pr.step} value={typeof val === 'number' ? val : pr.min}
                            onChange={(e) => { const v = +e.target.value; pr.k === 'hwPeriod' ? updateCurrentBrand({ params: { ...currentBrand.params, hwPeriod: v } }) : setManualParam(pr.k, v); }}
                            className="w-full h-1.5 bg-zinc-200 dark:bg-white/5 rounded-full appearance-none cursor-pointer"
                          />
                          <p className="text-[9px] text-zinc-600 italic border-l border-zinc-300 dark:border-zinc-800 pl-3 leading-relaxed">💡 {pr.tip}</p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-6">Mover α, β o γ pasa a modo manual: esos valores se aplican a todos los modelos y se vuelve a elegir el ganador.</p>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* MODAL ASSORTMENT */}
      {isAssortmentModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 dark:bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-white dark:bg-[#1c1720] border-2 border-violet-500 w-full max-w-lg rounded-[32px] shadow-2xl p-8 relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 p-4 opacity-10"><ShoppingCart size={96} /></div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter mb-2 flex items-center gap-3">
              <Link size={20} className="text-violet-500" /> Vincular a Assortment
            </h3>
            <p className="text-[10px] text-zinc-500 mb-8 font-black uppercase tracking-widest leading-relaxed">Define el rango de compra y el nombre del GOA para exportar participaciones.</p>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-zinc-600 dark:text-zinc-400 mb-2 block uppercase tracking-widest">Nombre del GOA / Marca</label>
                <input className="w-full bg-zinc-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-xl p-4 outline-none focus:ring-2 focus:ring-violet-500 font-bold text-zinc-900 dark:text-white uppercase" value={assortmentForm.name} onChange={e => setAssortmentForm({ ...assortmentForm, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-600 dark:text-zinc-400 mb-2 block uppercase tracking-widest">Mes Inicio</label>
                  <input type="number" min="1" max="24" className="w-full bg-zinc-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-xl p-4 outline-none text-zinc-900 dark:text-white font-bold" value={assortmentForm.start} onChange={e => setAssortmentForm({ ...assortmentForm, start: parseInt(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-600 dark:text-zinc-400 mb-2 block uppercase tracking-widest">Mes Final</label>
                  <input type="number" min="1" max="24" className="w-full bg-zinc-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-xl p-4 outline-none text-zinc-900 dark:text-white font-bold" value={assortmentForm.end} onChange={e => setAssortmentForm({ ...assortmentForm, end: parseInt(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-600 dark:text-zinc-400 mb-2 block uppercase tracking-widest">Presupuesto ($)</label>
                  <input type="number" className="w-full bg-zinc-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-xl p-4 outline-none focus:ring-2 focus:ring-violet-500 text-zinc-900 dark:text-white font-bold" value={assortmentForm.budget} onChange={e => setAssortmentForm({ ...assortmentForm, budget: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-600 dark:text-zinc-400 mb-2 block uppercase tracking-widest">Historia (Pzs)</label>
                  <input type="number" className="w-full bg-zinc-50 dark:bg-white/[0.045] dark:backdrop-blur-xl transition-all duration-300 dark:hover:border-white/20 dark:hover:shadow-[0_0_35px_-10px_rgba(138,115,173,0.55)] border border-zinc-200 dark:border-white/10 rounded-xl p-4 outline-none focus:ring-2 focus:ring-violet-500 text-zinc-900 dark:text-white font-bold" value={assortmentForm.historyPzs} onChange={e => setAssortmentForm({ ...assortmentForm, historyPzs: e.target.value })} />
                </div>
              </div>

              {/* Accesos rápidos */}
              <div className="grid grid-cols-4 gap-2">
                {[{ l: 'S1 (1-6)', s: 1, e: 6 }, { l: 'S2 (7-12)', s: 7, e: 12 }, { l: 'Q1 (1-3)', s: 1, e: 3 }, { l: 'Q4 (10-12)', s: 10, e: 12 }].map(q => (
                  <button key={q.l} onClick={() => setAssortmentForm({ ...assortmentForm, start: q.s, end: q.e })} className="bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-zinc-200 dark:border-zinc-700 p-2 rounded-lg text-[9px] font-bold transition-all text-zinc-900 dark:text-white">{q.l}</button>
                ))}
              </div>

              <div className="bg-zinc-100/70 dark:bg-zinc-800/50 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-inner">
                <div className="flex items-center gap-2 mb-2"><Percent size={14} className="text-yellow-500" /><p className="text-[10px] text-yellow-500 font-black uppercase">Exportación Inteligente a Assortment</p></div>
                <p className="text-[11px] text-zinc-700 dark:text-zinc-400 leading-relaxed italic font-medium">Se enviará un JSON con la distribución porcentual exacta de los meses seleccionados para automatizar la planeación de compras.</p>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsAssortmentModalOpen(false)} className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs border border-zinc-200 dark:border-zinc-700">Cancelar</button>
                <button onClick={sendToAssortment} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-black py-4 px-10 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-xs shadow-violet-900/20">Enviar Data</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}.animate-fade-in{animation:fadeIn .4s ease-out forwards;}` }} />
    </div>
  );
}

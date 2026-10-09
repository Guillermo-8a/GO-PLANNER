import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Download, Sparkles } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Forecast para modelos / marcas / proveedores nuevos con poca o nula historia.
// Se apoya en una REFERENCIA (análogo) del portafolio: usa su forecast ganador como curva y lo escala.
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const nums = (s) => String(s || '').replace(/,/g, '').split(/[\s;\t\n]+/).map(parseFloat).filter((v) => !isNaN(v));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const fmt = (v) => Math.round(v || 0).toLocaleString('es-MX');
const card = 'bg-white dark:bg-white/[0.045] border border-zinc-200 dark:border-white/10 rounded-[32px] p-6 shadow-lg';
const inp = 'w-full bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl p-3 outline-none focus:ring-2 focus:ring-violet-500 text-sm font-bold text-zinc-900 dark:text-white';
const lab = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block';

const METODOS = [
  { k: 'historia', t: 'Tiene poca historia', d: 'Compara sus ventas reales contra la referencia en los mismos meses y aplica esa proporción al forecast de la referencia.' },
  { k: 'pct', t: 'Sin historia · % del análogo', d: 'Supones que venderá un % de lo que vende la referencia (modelo, marca o GOA parecido).' },
  { k: 'meta', t: 'Sin historia · meta total', d: 'Tienes una meta de piezas para la temporada y la reparte con la estacionalidad de la referencia.' },
];

const nuevo = () => ({
  id: Date.now(), name: 'Nuevo modelo', refId: null, metodo: 'historia', ventas: '', omitirLanz: true,
  pct: 30, meta: 0, tdaHoy: 0, tdaPlan: 0, ajuste: 0, mesF1: (new Date().getMonth() + 1) % 12 + 1, ini: 1, fin: 6, st: 70, oh: 0,
});

export function calcNuevo(n, ref) {
  const fut = ref?.future || [], hist = (ref?.data || []).map((v) => +v || 0);
  if (!ref) return { error: 'Elige una referencia del portafolio.' };
  if (!fut.length) return { error: 'La referencia no tiene forecast (necesita al menos 4 periodos de historia).' };
  let factor = 0, nota = '';
  if (n.metodo === 'historia') {
    let v = nums(n.ventas);
    if (n.omitirLanz && v.length > 1) v = v.slice(1);
    if (!v.length) return { error: 'Pega las ventas reales del nuevo, del mes más viejo al más reciente.' };
    if (v.length > hist.length) return { error: `La referencia solo tiene ${hist.length} periodos de historia.` };
    const sr = sum(hist.slice(hist.length - v.length));
    if (!sr) return { error: 'La referencia vendió 0 en esos meses; elige otra.' };
    factor = sum(v) / sr;
    nota = `En sus últimos ${v.length} meses vendió ${(factor * 100).toFixed(1)}% de lo que vendió la referencia.`;
  } else if (n.metodo === 'pct') {
    factor = (+n.pct || 0) / 100;
    nota = `Se asume ${n.pct}% de la venta de la referencia.`;
  } else {
    const w = sum(fut.slice(n.ini - 1, n.fin));
    if (!w) return { error: 'La referencia no tiene forecast en esa ventana; sube su horizonte.' };
    factor = (+n.meta || 0) / w;
    nota = `Meta de ${fmt(n.meta)} pzs en la ventana, repartida con la curva de la referencia.`;
  }
  const esc = n.metodo !== 'meta' && +n.tdaHoy > 0 && +n.tdaPlan > 0 ? n.tdaPlan / n.tdaHoy : 1;
  const k = factor * esc * (n.metodo === 'meta' ? 1 : 1 + (+n.ajuste || 0) / 100);
  const serie = fut.map((v) => v * k);
  const venta = sum(serie.slice(n.ini - 1, n.fin));
  const compra = Math.max(0, (+n.st > 0 ? venta / (n.st / 100) : venta) - (+n.oh || 0));
  return { serie, factor, esc, k, venta, compra, nota, H: fut.length };
}

export default function ForecastNuevos({ brands, evals }) {
  const [items, setItems] = useState(() => { try { return JSON.parse(localStorage.getItem('gop_forecast_nuevos')) || []; } catch { return []; } });
  const [selId, setSelId] = useState(() => items[0]?.id ?? null);
  useEffect(() => { try { localStorage.setItem('gop_forecast_nuevos', JSON.stringify(items)); } catch {} }, [items]);

  const refs = brands.filter((b) => evals[b.id]?.winner);
  const refOf = (n) => { const b = brands.find((x) => x.id === n.refId); return b ? { name: b.name, data: b.data, future: evals[b.id]?.winner?.future || [] } : null; };
  const sel = items.find((i) => i.id === selId);
  const upd = (u) => setItems((p) => p.map((i) => (i.id === selId ? { ...i, ...u } : i)));
  const res = sel ? calcNuevo(sel, refOf(sel)) : null;
  const lbl = (n, i) => `${MESES[(n.mesF1 - 1 + i) % 12]}${i >= 12 ? '+1' : ''}`;

  const add = () => { const n = { ...nuevo(), refId: refs[0]?.id ?? null }; setItems((p) => [...p, n]); setSelId(n.id); };
  const del = (id) => { const f = items.filter((i) => i.id !== id); setItems(f); if (selId === id) setSelId(f[0]?.id ?? null); };

  const exportar = () => {
    const H = Math.max(0, ...items.map((n) => calcNuevo(n, refOf(n)).H || 0));
    const head = ['Nuevo', 'Referencia', 'Metodo', 'Factor_vs_ref', 'Venta_ventana', 'Compra_sugerida', ...Array.from({ length: H }, (_, i) => `F${i + 1}`)];
    const rows = items.map((n) => { const r = calcNuevo(n, refOf(n)); return [n.name, refOf(n)?.name || '', n.metodo, r.k?.toFixed(4) ?? '', Math.round(r.venta || 0), Math.round(r.compra || 0), ...(r.serie || []).map((v) => Math.round(v))]; });
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'fcst_nuevos.csv'; a.click();
  };

  if (!refs.length) return (
    <div className={`${card} text-sm`}>Primero carga en <b>Series</b> la historia de las referencias (GOA, marca o modelo parecido). Cada referencia necesita al menos 4 periodos para tener forecast.</div>
  );

  const ref = sel && refOf(sel);
  const chart = res?.serie ? res.serie.map((v, i) => ({ mes: lbl(sel, i), Referencia: Math.round(ref.future[i]), Nuevo: Math.round(v), ventana: i + 1 >= sel.ini && i + 1 <= sel.fin ? Math.round(v) : null })) : [];

  return (
    <div className="flex gap-6 items-start text-left">
      <aside className="w-72 shrink-0 space-y-2">
        <button onClick={add} className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-3 rounded-xl text-xs font-bold hover:bg-violet-500"><Plus size={14} /> Nuevo modelo / marca</button>
        {items.map((n) => { const r = calcNuevo(n, refOf(n)); return (
          <div key={n.id} onClick={() => setSelId(n.id)} className={`group p-4 rounded-2xl cursor-pointer border flex justify-between items-center ${selId === n.id ? 'bg-zinc-100 dark:bg-white/[0.045] border-violet-500/50' : 'border-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50'}`}>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate text-zinc-900 dark:text-white">{n.name}</p>
              <p className="text-[10px] font-bold uppercase text-zinc-500">{r.error ? 'Incompleto' : `Compra ${fmt(r.compra)} pzs`}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); del(n.id); }} className="p-2 rounded-lg text-zinc-500 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
          </div>); })}
        {items.length > 0 && <button onClick={exportar} className="w-full flex items-center justify-center gap-2 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-4 py-3 rounded-xl text-xs font-bold"><Download size={14} /> Bajar todos (CSV)</button>}
      </aside>

      <main className="flex-1 min-w-0 space-y-6">
        {!sel ? (
          <div className={card}>
            <h3 className="font-black text-lg text-zinc-900 dark:text-white flex items-center gap-2 mb-3"><Sparkles size={18} className="text-violet-500" /> Forecast para nuevos</h3>
            <p className="text-sm">Para modelos, marcas o proveedores con poca o nula historia. Eliges una <b>referencia</b> del portafolio (el GOA, la marca o un modelo parecido) y el nuevo toma su curva de estacionalidad, escalada con su propia venta, un % o una meta.</p>
          </div>
        ) : (<>
          <div className={`${card} grid grid-cols-1 md:grid-cols-4 gap-4`}>
            <div className="md:col-span-2"><span className={lab}>Nombre</span><input className={inp} value={sel.name} onChange={(e) => upd({ name: e.target.value })} /></div>
            <div className="md:col-span-2"><span className={lab}>Referencia (análogo)</span>
              <select className={inp} value={sel.refId ?? ''} onChange={(e) => upd({ refId: +e.target.value })}>
                <option value="">— Elige —</option>
                {refs.map((b) => <option key={b.id} value={b.id}>{b.name} · fcst {evals[b.id].winner.future.length} periodos</option>)}
              </select>
            </div>
            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-2">
              {METODOS.map((m) => (
                <button key={m.k} onClick={() => upd({ metodo: m.k })} className={`text-left p-3 rounded-xl border ${sel.metodo === m.k ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-200 dark:border-white/10'}`}>
                  <p className="text-xs font-black text-zinc-900 dark:text-white">{m.t}</p><p className="text-[10px] text-zinc-500 mt-1">{m.d}</p>
                </button>))}
            </div>
            {sel.metodo === 'historia' && (<>
              <div className="md:col-span-3"><span className={lab}>Ventas reales del nuevo (mes a mes, termina en el último mes de la referencia)</span>
                <textarea className={`${inp} font-mono h-20`} value={sel.ventas} onChange={(e) => upd({ ventas: e.target.value })} placeholder="Ej. 120 340 410 380" /></div>
              <label className="flex items-center gap-2 text-xs font-bold self-end pb-3"><input type="checkbox" checked={sel.omitirLanz} onChange={(e) => upd({ omitirLanz: e.target.checked })} /> Ignorar el 1er mes (lanzamiento incompleto)</label>
            </>)}
            {sel.metodo === 'pct' && <div><span className={lab}>% de la referencia</span><input type="number" className={inp} value={sel.pct} onChange={(e) => upd({ pct: e.target.value })} /></div>}
            {sel.metodo === 'meta' && <div><span className={lab}>Meta pzs en la ventana</span><input type="number" className={inp} value={sel.meta} onChange={(e) => upd({ meta: e.target.value })} /></div>}
            {sel.metodo !== 'meta' && (<>
              <div><span className={lab}>{sel.metodo === 'historia' ? 'Tiendas donde vende hoy' : 'Tiendas de la referencia'}</span><input type="number" className={inp} value={sel.tdaHoy} onChange={(e) => upd({ tdaHoy: e.target.value })} /></div>
              <div><span className={lab}>Tiendas planeadas</span><input type="number" className={inp} value={sel.tdaPlan} onChange={(e) => upd({ tdaPlan: e.target.value })} /></div>
            </>)}
            {sel.metodo !== 'meta' && <div><span className={lab}>Ajuste comercial %</span><input type="number" className={inp} value={sel.ajuste} onChange={(e) => upd({ ajuste: e.target.value })} /></div>}
            <div><span className={lab}>Mes del 1er periodo de forecast (F1)</span>
              <select className={inp} value={sel.mesF1} onChange={(e) => upd({ mesF1: +e.target.value })}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
            <div><span className={lab}>Ventana de compra: desde</span>
              <select className={inp} value={sel.ini} onChange={(e) => upd({ ini: +e.target.value })}>{(res?.serie || ref?.future || []).map((_, i) => <option key={i} value={i + 1}>F{i + 1} · {lbl(sel, i)}</option>)}</select></div>
            <div><span className={lab}>hasta</span>
              <select className={inp} value={sel.fin} onChange={(e) => upd({ fin: +e.target.value })}>{(res?.serie || ref?.future || []).map((_, i) => <option key={i} value={i + 1}>F{i + 1} · {lbl(sel, i)}</option>)}</select></div>
            <div><span className={lab}>Sell-through objetivo %</span><input type="number" className={inp} value={sel.st} onChange={(e) => upd({ st: e.target.value })} /></div>
            <div><span className={lab}>OH / pedido actual (pzs)</span><input type="number" className={inp} value={sel.oh} onChange={(e) => upd({ oh: e.target.value })} /></div>
          </div>

          {res?.error ? <div className={`${card} text-sm text-rose-500 font-bold`}>{res.error}</div> : (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { l: 'Factor vs referencia', v: `${(res.k * 100).toFixed(1)}%` },
                { l: `Venta F${sel.ini}–F${sel.fin}`, v: fmt(res.venta) },
                { l: 'Compra sugerida', v: fmt(res.compra), c: 'text-violet-500' },
                { l: 'Venta total horizonte', v: fmt(sum(res.serie)) },
              ].map((m) => <div key={m.l} className={card}><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">{m.l}</p><p className={`text-2xl font-black ${m.c || 'text-zinc-900 dark:text-white'}`}>{m.v}</p></div>)}
            </div>
            <div className={`${card} text-sm`}>
              💡 {res.nota}{res.esc !== 1 ? ` Escalado ×${res.esc.toFixed(2)} por tiendas.` : ''}{+sel.ajuste && sel.metodo !== 'meta' ? ` Ajuste ${sel.ajuste > 0 ? '+' : ''}${sel.ajuste}%.` : ''} Compra = venta de la ventana ÷ {sel.st}% de sell-through{+sel.oh ? ` − ${fmt(sel.oh)} pzs de OH/pedido` : ''}.
              {sel.metodo === 'historia' && nums(sel.ventas).length - (sel.omitirLanz ? 1 : 0) < 3 && <span className="block mt-2 text-yellow-600 font-bold">Ojo: con menos de 3 meses el factor es inestable; revísalo contra el % que esperas.</span>}
            </div>
            <div className={`${card} h-[360px]`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="ventana" name="Ventana de compra" fill="#8b5cf6" opacity={0.25} />
                  <Line dataKey="Referencia" stroke="#a1a1aa" strokeDasharray="5 4" dot={false} />
                  <Line dataKey="Nuevo" stroke="#8b5cf6" strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-xs">
                <thead><tr className="text-[10px] font-black uppercase text-zinc-500"><th className="text-left py-1">Mes</th>{res.serie.map((_, i) => <th key={i} className="text-right">{lbl(sel, i)}</th>)}</tr></thead>
                <tbody>
                  <tr><td className="py-1 font-bold">Referencia</td>{ref.future.map((v, i) => <td key={i} className="text-right">{fmt(v)}</td>)}</tr>
                  <tr className="font-black text-violet-500"><td className="py-1">{sel.name}</td>{res.serie.map((v, i) => <td key={i} className="text-right">{fmt(v)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </>)}
        </>)}
      </main>
    </div>
  );
}

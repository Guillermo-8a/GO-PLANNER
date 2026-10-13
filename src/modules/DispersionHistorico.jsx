import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Icons from '../utils/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Histórico de R² (venta vs inventario promedio entre tiendas) por sección y mes, LY vs TY.
// Mismo cálculo que el Excel "Resumen": RSQ(prom inv, venta) por sección-mes, omitiendo tiendas sin venta o con inventario ≤ 0.
// CSV (ya agregado en BigQuery): ANIO, MES, DIVISION, SECCION_KEY, SECCION, R2, TIENDAS, VENTA, INV_PROM
const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const KEY = 'gop_dispersion_hist_r2';
const splitRow = (row) => row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim());
const n = (v) => { const x = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(x) ? null : x; };
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const f3 = (v) => (v == null ? '' : v.toFixed(2));

export const parseHist = (text) => {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim()).map(splitRow);
  const H = rows[0].map((h) => h.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
  const i = (k) => H.indexOf(k);
  const I = { a: i('ANIO') >= 0 ? i('ANIO') : i('ANO'), m: i('MES'), d: i('DIVISION'), k: i('SECCION_KEY'), s: i('SECCION'), r: i('R2'), t: i('TIENDAS') };
  if (I.a < 0 || I.m < 0 || I.s < 0 || I.r < 0) throw new Error('Faltan columnas ANIO, MES, SECCION o R2');
  const out = rows.slice(1).map((r) => ({ ano: n(r[I.a]), mes: n(r[I.m]), div: r[I.d] || '', key: I.k >= 0 ? r[I.k] : '', sec: r[I.s] || '', r2: n(r[I.r]), tiendas: I.t >= 0 ? n(r[I.t]) : null }))
    .filter((r) => r.ano && r.mes);
  // Con menos de 3 tiendas el R² no significa nada (2 puntos siempre dan 1); se deja en blanco
  out.forEach((r) => { if (r.tiendas != null && r.tiendas < 3) r.r2 = null; });
  // Algunos meses vienen sin división: se toma la de la misma sección en otro mes
  const divOf = {}; out.forEach((r) => { if (r.div) divOf[r.key || r.sec] = r.div; });
  out.forEach((r) => { if (!r.div) r.div = divOf[r.key || r.sec] || ''; });
  return out;
};
export const saveHist = (rows) => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {} };

export default function DispersionHistorico({ t, isDark }) {
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } });
  const [div, setDiv] = useState('');
  const [selSec, setSelSec] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }, [data]);

  const upload = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try { setData(parseHist(ev.target.result)); setErr(''); setDiv(''); setSelSec(''); } catch (x) { setErr(x.message); } e.target.value = ''; };
    r.readAsText(f, 'UTF-8');
  };

  const TY = useMemo(() => Math.max(0, ...data.map((r) => r.ano || 0)), [data]);
  const LY = TY - 1;
  const ultMes = useMemo(() => Math.max(0, ...data.filter((r) => r.ano === TY && r.r2 != null).map((r) => r.mes)), [data, TY]);
  const divs = useMemo(() => [...new Set(data.map((r) => r.div).filter(Boolean))].sort(), [data]);

  // Una fila por sección con R² de cada mes LY y TY + indicadores del Resumen de Excel
  const filas = useMemo(() => {
    const m = new Map();
    for (const r of data) {
      if (div && r.div !== div) continue;
      const k = `${r.div}|${r.key || r.sec}`;
      const o = m.get(k) || { div: r.div, key: r.key, sec: r.sec, ly: Array(12).fill(null), ty: Array(12).fill(null) };
      if (r.ano === LY) o.ly[r.mes - 1] = r.r2;
      if (r.ano === TY) o.ty[r.mes - 1] = r.r2;
      m.set(k, o);
    }
    const u = ultMes - 1;
    return [...m.values()].map((o) => {
      const vals = o.ly.filter((x) => x != null);
      return {
        ...o,
        h1: avg(o.ly.slice(0, 6)), anual: avg(o.ly),
        h1TY: avg(o.ty.slice(0, 6)),
        vsMes: u >= 1 && o.ty[u] != null && o.ty[u - 1] != null ? o.ty[u] - o.ty[u - 1] : null,
        vsLY: u >= 0 && o.ty[u] != null && o.ly[u] != null ? o.ty[u] - o.ly[u] : null,
        acum: u >= 0 ? (avg(o.ty.slice(0, u + 1)) ?? 0) - (avg(o.ly.slice(0, u + 1)) ?? 0) : null,
        obj: vals.length ? (Math.max(...vals) + Math.min(...vals)) / 2 : null,
      };
    }).sort((a, b) => (a.div > b.div ? 1 : a.div < b.div ? -1 : (+a.key || 0) - (+b.key || 0) || a.sec.localeCompare(b.sec)));
  }, [data, div, LY, TY, ultMes]);

  const total = useMemo(() => ({
    ly: Array.from({ length: 12 }, (_, k) => avg(filas.map((f) => f.ly[k]))),
    ty: Array.from({ length: 12 }, (_, k) => avg(filas.map((f) => f.ty[k]))),
  }), [filas]);
  const serie = selSec ? filas.find((f) => `${f.div}|${f.sec}` === selSec) : null;
  const chart = MES.map((m, k) => ({ mes: m, [LY]: (serie || total).ly[k], [TY]: k < ultMes ? (serie || total).ty[k] : null }));

  const cell = (v) => {
    if (v == null) return '';
    if (v >= 0.7) return isDark ? 'bg-emerald-500/30 text-emerald-200' : 'bg-emerald-100 text-emerald-800';
    if (v >= 0.4) return isDark ? 'bg-amber-500/25 text-amber-200' : 'bg-amber-100 text-amber-800';
    return isDark ? 'bg-rose-500/25 text-rose-200' : 'bg-rose-100 text-rose-800';
  };
  const delta = (v) => (v == null ? '' : <span className={`font-black ${v >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>);
  const sel = `text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`;
  const th = 'px-2 py-2 text-right whitespace-nowrap';

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${t.cardInner}`}>
        <input ref={ref} type="file" accept=".csv,.txt" className="hidden" onChange={upload} />
        <button onClick={() => ref.current?.click()} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border ${t.btnGhost}`}><Icons.Upload size={14} /> CSV histórico R²</button>
        {data.length > 0 && <>
          <select value={div} onChange={(e) => { setDiv(e.target.value); setSelSec(''); }} className={sel}><option value="">División: Todas</option>{divs.map((v) => <option key={v}>{v}</option>)}</select>
          <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeAmber}`}>Corte: {MES[ultMes - 1] || '—'} {TY}</span>
          <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{LY} vs {TY} · {filas.length} secciones</span>
        </>}
        {err && <span className="text-xs font-bold text-rose-500">{err}</span>}
      </div>

      {!data.length ? (
        <div className={`p-12 rounded-xl border text-center ${t.cardInner}`}>
          <Icons.Upload size={36} className="text-gray-400 mb-3 mx-auto" />
          <p className={`text-sm font-bold ${t.textMain}`}>Carga el CSV histórico de R² por sección</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Columnas: ANIO, MES, DIVISION, SECCION_KEY, SECCION, R2, TIENDAS.</p>
        </div>
      ) : (<>
        <div className={`p-4 rounded-xl border h-[280px] ${t.cardInner}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>R² {serie ? serie.sec : 'promedio de secciones'} · clic en una sección de la tabla para verla</p>
          <ResponsiveContainer width="100%" height="88%">
            <LineChart data={chart} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#ede9fe'} />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => (v == null ? '—' : v.toFixed(3))} contentStyle={{ background: isDark ? '#1c1720' : '#fff', border: 'none', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line dataKey={String(LY)} stroke="#a1a1aa" strokeDasharray="5 4" connectNulls />
              <Line dataKey={String(TY)} stroke="#8b5cf6" strokeWidth={3} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className={`rounded-xl border overflow-auto max-h-[70vh] ${t.cardInner}`}>
          <table className="w-full text-[11px]">
            <thead className={`sticky top-0 z-10 ${t.thBg}`}>
              <tr>
                <th className="px-2 py-1 text-left" colSpan={2}></th>
                <th className="px-2 py-1 text-center border-l border-white/20" colSpan={14}>{LY}</th>
                <th className="px-2 py-1 text-center border-l border-white/20" colSpan={ultMes + 1}>{TY}</th>
                <th className="px-2 py-1 text-center border-l border-white/20" colSpan={4}>Mejora</th>
              </tr>
              <tr>
                <th className="px-2 py-2 text-left">Div.</th><th className="px-2 py-2 text-left">Sección</th>
                {MES.map((m) => <th key={'l' + m} className={th}>{m}</th>)}<th className={th}>1H</th><th className={th}>Anual</th>
                {MES.slice(0, ultMes).map((m) => <th key={'t' + m} className={th}>{m}</th>)}<th className={th}>1H</th>
                <th className={th}>vs mes ant.</th><th className={th}>vs LY</th><th className={th}>Acum.</th><th className={th}>Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, k) => { const id = `${f.div}|${f.sec}`; return (
                <tr key={id} onClick={() => setSelSec(selSec === id ? '' : id)} className={`cursor-pointer ${selSec === id ? 'outline outline-2 outline-violet-500' : k % 2 ? t.rowAlt : ''}`}>
                  <td className={`px-2 py-1 ${t.textMuted}`}>{f.div}</td>
                  <td className={`px-2 py-1 font-bold whitespace-nowrap ${t.textMain}`}>{f.key ? `${f.key} · ` : ''}{f.sec}</td>
                  {f.ly.map((v, j) => <td key={'l' + j} className={`px-2 text-right ${cell(v)}`}>{f3(v)}</td>)}
                  <td className="px-2 text-right font-bold">{f3(f.h1)}</td><td className="px-2 text-right font-bold">{f3(f.anual)}</td>
                  {f.ty.slice(0, ultMes).map((v, j) => <td key={'t' + j} className={`px-2 text-right ${cell(v)}`}>{f3(v)}</td>)}
                  <td className="px-2 text-right font-bold">{f3(f.h1TY)}</td>
                  <td className="px-2 text-right">{delta(f.vsMes)}</td><td className="px-2 text-right">{delta(f.vsLY)}</td>
                  <td className="px-2 text-right">{delta(f.acum)}</td><td className="px-2 text-right font-bold">{f3(f.obj)}</td>
                </tr>); })}
            </tbody>
          </table>
          <p className={`text-[10px] px-3 py-2 ${t.textMuted}`}>R² = qué tanto el inventario promedio de cada tienda sigue a su venta del mes (1 = perfecto). Mejora vs mes ant. y vs LY con el último mes de corte; Acum. = promedio {TY} − promedio {LY} en los mismos meses; Objetivo = punto medio entre el mejor y el peor mes de {LY}.</p>
        </div>
      </>)}
    </div>
  );
}

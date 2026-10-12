import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Icons from '../utils/icons';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Histórico por sección: venta e inventario mes a mes, año actual (TY) vs año pasado (LY).
// CSV: ANIO, MES (1-12), DIVISION, SECCION, VENTA, INV_INICIAL, INV_FINAL, INV_PROM (miles de pesos).
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const KEY = 'gop_dispersion_hist';
const splitRow = (row) => row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim());
const n = (v) => parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
const fmt = (v, d = 0) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (a, b) => (b ? (a / b - 1) * 100 : null);

export const parseHist = (text) => {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim()).map(splitRow);
  const H = rows[0].map((h) => h.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
  const i = (k) => H.findIndex((h) => h === k);
  const I = { a: i('ANIO') >= 0 ? i('ANIO') : i('ANO'), m: i('MES'), d: i('DIVISION'), s: i('SECCION'), v: i('VENTA'), ii: i('INV_INICIAL'), f: i('INV_FINAL'), p: i('INV_PROM') };
  if (I.a < 0 || I.m < 0 || I.s < 0) throw new Error('Faltan columnas ANIO, MES o SECCION');
  return rows.slice(1).map((r) => ({ ano: n(r[I.a]), mes: n(r[I.m]), div: r[I.d] || '', sec: r[I.s] || '', venta: n(r[I.v]), invIni: n(r[I.ii]), invFin: n(r[I.f]), invProm: n(r[I.p]) }));
};

export default function DispersionHistorico({ t, isDark }) {
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } });
  const [div, setDiv] = useState('');
  const [sec, setSec] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }, [data]);

  const upload = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try { setData(parseHist(ev.target.result)); setErr(''); setDiv(''); setSec(''); } catch (x) { setErr(x.message); } e.target.value = ''; };
    r.readAsText(f, 'UTF-8');
  };

  const divs = useMemo(() => [...new Set(data.map((r) => r.div).filter(Boolean))].sort(), [data]);
  const secs = useMemo(() => [...new Set(data.filter((r) => !div || r.div === div).map((r) => r.sec).filter(Boolean))].sort(), [data, div]);
  const TY = useMemo(() => Math.max(0, ...data.map((r) => r.ano)), [data]);
  const LY = TY - 1;

  const meses = useMemo(() => {
    const m = Array.from({ length: 12 }, (_, k) => ({ mes: MES[k], vLY: 0, vTY: 0, fLY: 0, fTY: 0, pLY: 0, pTY: 0, hasTY: false, hasLY: false }));
    for (const r of data) {
      if ((div && r.div !== div) || (sec && r.sec !== sec) || r.mes < 1 || r.mes > 12) continue;
      const x = m[r.mes - 1];
      if (r.ano === TY) { x.vTY += r.venta; x.fTY += r.invFin; x.pTY += r.invProm; if (r.venta || r.invFin) x.hasTY = true; }
      if (r.ano === LY) { x.vLY += r.venta; x.fLY += r.invFin; x.pLY += r.invProm; if (r.venta || r.invFin) x.hasLY = true; }
    }
    return m.map((x) => ({ ...x, mosLY: x.vLY ? x.fLY / x.vLY : null, mosTY: x.vTY ? x.fTY / x.vTY : null }));
  }, [data, div, sec, TY, LY]);

  const ultimo = useMemo(() => { for (let k = 11; k >= 0; k--) if (meses[k].hasTY && meses[k].vTY) return k; return -1; }, [meses]);
  const kpi = useMemo(() => {
    if (ultimo < 0) return null;
    const ytd = meses.slice(0, ultimo + 1);
    const vTY = ytd.reduce((s, x) => s + x.vTY, 0), vLY = ytd.reduce((s, x) => s + x.vLY, 0);
    const u = meses[ultimo];
    const rotTY = ytd.reduce((s, x) => s + x.pTY, 0), rotLY = ytd.reduce((s, x) => s + x.pLY, 0);
    return { vTY, vLY, fTY: u.fTY, fLY: u.fLY, mosTY: u.mosTY, mosLY: u.mosLY, rotTY: rotTY ? (vTY / (rotTY / ytd.length)) : null, rotLY: rotLY ? (vLY / (rotLY / ytd.length)) : null, mes: u.mes };
  }, [meses, ultimo]);

  const chart = meses.map((x) => ({ mes: x.mes, [`Venta ${LY}`]: x.hasLY ? Math.round(x.vLY) : null, [`Venta ${TY}`]: x.hasTY ? Math.round(x.vTY) : null, [`Inv. final ${LY}`]: x.hasLY ? Math.round(x.fLY) : null, [`Inv. final ${TY}`]: x.hasTY && x.fTY ? Math.round(x.fTY) : null }));
  const sel = `text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`;
  const varCls = (v, inv) => (v == null ? t.textMuted : (inv ? v <= 0 : v >= 0) ? 'text-emerald-500' : 'text-rose-500');

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${t.cardInner}`}>
        <input ref={ref} type="file" accept=".csv,.txt" className="hidden" onChange={upload} />
        <button onClick={() => ref.current?.click()} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border ${t.btnGhost}`}><Icons.Upload size={14} /> CSV histórico</button>
        {data.length > 0 && <>
          <select value={div} onChange={(e) => { setDiv(e.target.value); setSec(''); }} className={sel}><option value="">División: Todas</option>{divs.map((v) => <option key={v}>{v}</option>)}</select>
          <select value={sec} onChange={(e) => setSec(e.target.value)} className={sel}><option value="">Sección: Todas ({secs.length})</option>{secs.map((v) => <option key={v}>{v}</option>)}</select>
          <span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{LY} vs {TY}</span>
        </>}
        {err && <span className="text-xs font-bold text-rose-500">{err}</span>}
      </div>

      {!data.length ? (
        <div className={`p-12 rounded-xl border text-center ${t.cardInner}`}>
          <Icons.Upload size={36} className="text-gray-400 mb-3 mx-auto" />
          <p className={`text-sm font-bold ${t.textMain}`}>Carga el CSV histórico por sección</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Columnas: ANIO, MES, DIVISION, SECCION, VENTA, INV_INICIAL, INV_FINAL, INV_PROM (miles de pesos).</p>
        </div>
      ) : (<>
        {kpi && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { l: `Venta acum. ene–${kpi.mes}`, ty: kpi.vTY, ly: kpi.vLY },
              { l: `Inv. final ${kpi.mes}`, ty: kpi.fTY, ly: kpi.fLY, inv: true },
              { l: `Meses de inv. ${kpi.mes}`, ty: kpi.mosTY, ly: kpi.mosLY, inv: true, d: 1 },
              { l: 'Rotación acum.', ty: kpi.rotTY, ly: kpi.rotLY, d: 2 },
            ].map((k) => { const v = pct(k.ty, k.ly); return (
              <div key={k.l} className={`p-3 rounded-xl border text-center ${t.cardInner}`}>
                <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-0.5`}>{k.l}</div>
                <div className={`text-xl font-black ${t.accent}`}>{fmt(k.ty, k.d || 0)}</div>
                <div className={`text-[10px] ${t.textMuted}`}>LY {fmt(k.ly, k.d || 0)} · <span className={`font-black ${varCls(v, k.inv)}`}>{v == null ? '—' : `${v > 0 ? '+' : ''}${fmt(v, 1)}%`}</span></div>
              </div>); })}
          </div>
        )}
        <div className={`p-4 rounded-xl border h-[340px] ${t.cardInner}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#ede9fe'} />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="v" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="i" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="v" dataKey={`Venta ${LY}`} stroke="#a1a1aa" strokeDasharray="5 4" dot={false} />
              <Line yAxisId="v" dataKey={`Venta ${TY}`} stroke="#8b5cf6" strokeWidth={3} />
              <Line yAxisId="i" dataKey={`Inv. final ${LY}`} stroke="#fcd34d" strokeDasharray="5 4" dot={false} />
              <Line yAxisId="i" dataKey={`Inv. final ${TY}`} stroke="#f59e0b" strokeWidth={3} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className={`rounded-xl border overflow-x-auto ${t.cardInner}`}>
          <table className="w-full text-xs">
            <thead className={t.thBg}><tr>
              {['Mes', `Venta ${LY}`, `Venta ${TY}`, 'Var %', `Inv. final ${LY}`, `Inv. final ${TY}`, 'Var %', `MOS ${LY}`, `MOS ${TY}`].map((h, k) => <th key={k} className={`px-3 py-2 ${k ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {meses.map((x, k) => { const vv = x.hasTY && x.vTY ? pct(x.vTY, x.vLY) : null, vi = x.hasTY && x.fTY ? pct(x.fTY, x.fLY) : null; return (
                <tr key={x.mes} className={k % 2 ? t.rowAlt : ''}>
                  <td className={`px-3 py-1.5 font-bold ${t.textMain}`}>{x.mes}</td>
                  <td className="px-3 text-right">{fmt(x.vLY)}</td>
                  <td className="px-3 text-right font-bold">{x.hasTY ? fmt(x.vTY) : '—'}</td>
                  <td className={`px-3 text-right font-black ${varCls(vv)}`}>{vv == null ? '—' : `${vv > 0 ? '+' : ''}${fmt(vv, 1)}%`}</td>
                  <td className="px-3 text-right">{fmt(x.fLY)}</td>
                  <td className="px-3 text-right font-bold">{x.hasTY && x.fTY ? fmt(x.fTY) : '—'}</td>
                  <td className={`px-3 text-right font-black ${varCls(vi, true)}`}>{vi == null ? '—' : `${vi > 0 ? '+' : ''}${fmt(vi, 1)}%`}</td>
                  <td className="px-3 text-right">{fmt(x.mosLY, 1)}</td>
                  <td className="px-3 text-right font-bold">{x.hasTY && x.fTY ? fmt(x.mosTY, 1) : '—'}</td>
                </tr>); })}
            </tbody>
          </table>
          <p className={`text-[10px] px-3 py-2 ${t.textMuted}`}>Miles de pesos a precio de venta. MOS = inventario final ÷ venta del mes. Rotación = venta acumulada ÷ inventario promedio. En inventario, la variación en verde es bajar contra LY.</p>
        </div>
      </>)}
    </div>
  );
}

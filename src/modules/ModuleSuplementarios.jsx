// src/modules/ModuleSuplementarios.jsx
// Suplementarios (Financial): OTB general mensual → bajada a Marca/Proveedor.
// La bajada usa ajuste proporcional iterativo (IPF): respeta la estacionalidad histórica
// de cada entidad y SIEMPRE cuadra al OTB mensual. Celdas editadas a mano quedan fijas (lock).
import { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Upload, Download, Lock, RotateCcw, Check, AlertCircle, FileSpreadsheet, Trash2, Copy } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';

const LS_KEY = 'gop_suplementarios';
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const METRICS = [
  { key: 'vta', label: 'Venta' },
  { key: 'mkd', label: 'Mkds' },
  { key: 'cmsi', label: 'CMSI' },
  { key: 'compra', label: 'Compra' },
  { key: 'utilidad', label: 'Utilidad' },
  { key: 'inv', label: 'Inventario', stock: true },
];
const R12 = [...Array(12).keys()];
const PERIODS = [
  { key: 'Q1', m: [0, 1, 2] }, { key: 'Q2', m: [3, 4, 5] }, { key: 'Q3', m: [6, 7, 8] }, { key: 'Q4', m: [9, 10, 11] },
  { key: 'S1', m: R12.slice(0, 6) }, { key: 'S2', m: R12.slice(6) }, { key: 'Año', m: R12 },
];
const RATIO_ALIAS = {
  vta: ['VTA', 'VENTA', 'VENTAS', 'SALES'],
  mkd: ['MKD', 'MKDS', 'REBAJA', 'REBAJAS', 'MARKDOWN', 'MARKDOWNS'],
  cmsi: ['CMSI', 'COSTO', 'COSTO VTA', 'COSTO DE VENTA', 'COGS'],
  compra: ['COMPRA', 'COMPRAS', 'RECIBOS'],
  utilidad: ['UTILIDAD', 'UB', 'UTILIDAD BRUTA'],
  inv: ['INV', 'INVENTARIO', 'INV FINAL', 'INVENTARIO FINAL', 'EOH'],
};

const zeros = () => Array(12).fill(0);
const sum = (a) => a.reduce((s, v) => s + (+v || 0), 0);
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, '')) || 0);
const toRatio = (s) => { const n = norm(s); return Object.keys(RATIO_ALIAS).find((k) => RATIO_ALIAS[k].includes(n)) || null; };
const toTipo = (s) => {
  const n = norm(s);
  if (['OTB', 'OBJ', 'OBJETIVO', 'TARGET'].includes(n)) return 'otb';
  if (['HIST', 'HISTORICO', 'LY', 'AA', 'REAL'].includes(n)) return 'hist';
  return null;
};
const monthIdx = (h) => {
  const n = norm(h).replace(/\.$/, '');
  let i = MONTHS.findIndex((m) => norm(m) === n);
  if (i < 0) i = MONTHS_FULL.findIndex((m) => m === n || (n === 'SETIEMBRE' && m === 'SEPTIEMBRE'));
  if (i < 0 && /^M?\d{1,2}$/.test(n)) { const d = parseInt(n.replace('M', ''), 10); if (d >= 1 && d <= 12) i = d - 1; }
  return i;
};

const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const pct = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const dec = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
const growth = (p, l) => (l ? p / l - 1 : null);

// ─── Excel ────────────────────────────────────────────────────────────────────
async function parseExcel(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = { otb: {}, hist: {}, rows: 0 };
  wb.SheetNames.forEach((sn) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    const hi = rows.findIndex((r) => r.some((c) => norm(c) === 'TIPO') && r.some((c) => norm(c) === 'RATIO'));
    if (hi < 0) return;
    const h = rows[hi];
    const cTipo = h.findIndex((c) => norm(c) === 'TIPO');
    const cRatio = h.findIndex((c) => norm(c) === 'RATIO');
    const cEnt = h.findIndex((c) => ['ENTIDAD', 'MARCA', 'PROVEEDOR'].includes(norm(c)));
    const mCols = h.map((c, i) => ({ i, m: monthIdx(c) })).filter((x) => x.m >= 0);
    rows.slice(hi + 1).forEach((r) => {
      const tipo = toTipo(r[cTipo]); const ratio = toRatio(r[cRatio]);
      if (!tipo || !ratio) return;
      const arr = zeros(); mCols.forEach(({ i, m }) => { arr[m] = num(r[i]); });
      if (tipo === 'otb') out.otb[ratio] = arr;
      else {
        const ent = String(cEnt >= 0 ? r[cEnt] : '').trim();
        if (!ent) return;
        out.hist[ent] = { ...(out.hist[ent] || {}), [ratio]: arr };
      }
      out.rows++;
    });
  });
  return out;
}

function downloadTemplate(dim) {
  const head = ['Tipo', dim, 'Ratio', ...MONTHS];
  const aoa = [head];
  METRICS.forEach((m) => aoa.push(['OTB', '', m.label.toUpperCase(), ...zeros()]));
  ['MARCA A', 'MARCA B'].forEach((e) => METRICS.forEach((m) => aoa.push(['HIST', e, m.label.toUpperCase(), ...zeros()])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Suplementarios');
  XLSX.writeFile(wb, 'Plantilla_Suplementarios.xlsx');
}

// ─── Bajada (IPF) ─────────────────────────────────────────────────────────────
function allocate(metric, otbArr, entities, cfg = {}, locks = {}) {
  const n = entities.length;
  if (!n) return { rows: [], colTot: zeros() };
  const hist = entities.map((e) => (e.hist?.[metric] || zeros()).map((v) => Math.max(+v || 0, 0)));
  const histTot = hist.map(sum);
  const H = sum(histTot);
  const annual = sum(otbArr);
  const base = entities.map((e, i) => {
    const c = cfg[e.name] || {};
    const share = c.share !== '' && c.share != null ? +c.share / 100 : H ? histTot[i] / H : 1 / n;
    return Math.max(share * (1 + (+c.adj || 0) / 100), 0);
  });
  const W = sum(base) || 1;
  const rowT = base.map((b) => (annual * b) / W);
  const lk = entities.map((e) => locks[e.name] || {});
  const isL = (i, k) => lk[i][k] != null;
  const rowTe = rowT.map((r, i) => Math.max(r - sum(R12.map((k) => (isL(i, k) ? +lk[i][k] : 0))), 0));
  const colTe = R12.map((k) => Math.max((+otbArr[k] || 0) - sum(entities.map((_, i) => (isL(i, k) ? +lk[i][k] : 0))), 0));
  const M = hist.map((h, i) => R12.map((k) => (isL(i, k) ? 0 : histTot[i] > 0 ? h[k] : 1)));

  for (let it = 0; it < 60; it++) {
    M.forEach((row, i) => { const s = sum(row); if (s > 0) row.forEach((_, k) => { row[k] *= rowTe[i] / s; }); });
    R12.forEach((k) => {
      const free = M.map((_, i) => i).filter((i) => !isL(i, k));
      const s = sum(free.map((i) => M[i][k]));
      if (s > 0) free.forEach((i) => { M[i][k] *= colTe[k] / s; });
      else if (colTe[k] > 0 && free.length) {
        const w = sum(free.map((i) => rowTe[i]));
        free.forEach((i) => { M[i][k] = colTe[k] * (w ? rowTe[i] / w : 1 / free.length); });
      }
    });
  }
  const plan = M.map((row, i) => row.map((v, k) => (isL(i, k) ? +lk[i][k] : v)));
  const rows = entities.map((e, i) => ({
    name: e.name, hist: hist[i], histTot: histTot[i], histShare: H ? histTot[i] / H : null,
    share: base[i] / W, target: rowT[i], plan: plan[i], planTot: sum(plan[i]),
  }));
  const colTot = R12.map((k) => sum(plan.map((r) => r[k])));
  return { rows, colTot };
}

function kpis(d, ms) {
  const s = (k) => ms.reduce((a, i) => a + (+d[k]?.[i] || 0), 0);
  const vta = s('vta'), mkd = s('mkd'), cmsi = s('cmsi'), compra = s('compra'), ut = s('utilidad');
  const invAvg = s('inv') / ms.length, invFin = +d.inv?.[ms[ms.length - 1]] || 0;
  return {
    vta, mkd, cmsi, compra, ut, invAvg, invFin,
    margen: vta ? ut / vta : null, mkdPct: vta ? mkd / vta : null,
    st: cmsi + invFin ? cmsi / (cmsi + invFin) : null,
    mos: cmsi ? invFin / (cmsi / ms.length) : null,
    rot: invAvg ? (cmsi / invAvg) * (12 / ms.length) : null,
    vtaInv: invAvg ? vta / invAvg : null,
    vtaCompra: compra ? vta / compra : null,
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function NumCell({ value, onCommit, className = '', placeholder = '' }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = () => { if (String(v) !== String(value ?? '')) onCommit(v === '' ? '' : num(v)); };
  return (
    <input
      value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-full min-w-[72px] px-1.5 py-1 text-right text-xs rounded border focus:outline-none focus:ring-1 ${className}`}
    />
  );
}

function usePersisted() {
  const [st, setSt] = useState(() => {
    try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch {}
    return { dim: 'Marca', otb: Object.fromEntries(METRICS.map((m) => [m.key, zeros()])), entities: [], cfg: {}, locks: {} };
  });
  const tm = useRef(null);
  useEffect(() => {
    clearTimeout(tm.current);
    tm.current = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch {} }, 400);
    return () => clearTimeout(tm.current);
  }, [st]);
  return [st, setSt];
}

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function ModuleSuplementarios({ t, isDark, navIcon, navLabel, navDesc }) {
  const [st, setSt] = usePersisted();
  const [tab, setTab] = useState('otb');
  const [metric, setMetric] = useState('vta');
  const [ent, setEnt] = useState('__total');
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const { dim, otb, entities, cfg, locks } = st;

  const alloc = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, allocate(m.key, otb[m.key] || zeros(), entities, cfg[m.key], locks[m.key])])),
    [otb, entities, cfg, locks]
  );

  // data por entidad: { plan: {metric:[12]}, hist: {metric:[12]} }
  const byEnt = useMemo(() => {
    const out = {};
    entities.forEach((e, i) => {
      out[e.name] = {
        plan: Object.fromEntries(METRICS.map((m) => [m.key, alloc[m.key].rows[i]?.plan || zeros()])),
        hist: Object.fromEntries(METRICS.map((m) => [m.key, alloc[m.key].rows[i]?.hist || zeros()])),
      };
    });
    const histTot = Object.fromEntries(METRICS.map((m) => [m.key, R12.map((k) => sum(entities.map((e) => +e.hist?.[m.key]?.[k] || 0)))]));
    out.__total = { plan: otb, hist: histTot };
    return out;
  }, [alloc, entities, otb]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const r = await parseExcel(f);
      if (!r.rows) { setMsg({ ok: false, text: 'No encontré filas válidas. Revisa encabezados Tipo / Entidad / Ratio / Ene…Dic.' }); return; }
      setSt((s) => {
        const map = Object.fromEntries(s.entities.map((x) => [x.name, x]));
        Object.entries(r.hist).forEach(([name, h]) => { map[name] = { name, hist: { ...(map[name]?.hist || {}), ...h } }; });
        return { ...s, otb: { ...s.otb, ...r.otb }, entities: Object.values(map) };
      });
      setMsg({ ok: true, text: `${r.rows} filas · ${Object.keys(r.otb).length} ratios OTB · ${Object.keys(r.hist).length} ${dim.toLowerCase()}s` });
    } catch (err) { setMsg({ ok: false, text: `Error leyendo Excel: ${err.message}` }); }
  };

  const exportPlan = () => {
    const aoa = [['Tipo', dim, 'Ratio', ...MONTHS, 'Total']];
    METRICS.forEach((m) => aoa.push(['OTB', '', m.label.toUpperCase(), ...(otb[m.key] || zeros()).map(Math.round), Math.round(sum(otb[m.key] || []))]));
    METRICS.forEach((m) => alloc[m.key].rows.forEach((r) => aoa.push(['PLAN', r.name, m.label.toUpperCase(), ...r.plan.map(Math.round), Math.round(r.planTot)])));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Plan');
    XLSX.writeFile(wb, `Suplementarios_${dim}.xlsx`);
  };

  const setOtb = (mk, k, v) => setSt((s) => ({ ...s, otb: { ...s.otb, [mk]: (s.otb[mk] || zeros()).map((x, i) => (i === k ? +v || 0 : x)) } }));
  const setCfg = (name, field, v) => setSt((s) => ({ ...s, cfg: { ...s.cfg, [metric]: { ...(s.cfg[metric] || {}), [name]: { ...(s.cfg[metric]?.[name] || {}), [field]: v } } } }));
  const setLock = (name, k, v) => setSt((s) => {
    const ml = { ...(s.locks[metric] || {}) }; const row = { ...(ml[name] || {}) };
    if (v === '') delete row[k]; else row[k] = v;
    ml[name] = row; return { ...s, locks: { ...s.locks, [metric]: ml } };
  });
  const clearLocks = (name) => setSt((s) => {
    const ml = { ...(s.locks[metric] || {}) };
    if (name) delete ml[name]; else Object.keys(ml).forEach((n) => delete ml[n]);
    return { ...s, locks: { ...s.locks, [metric]: ml } };
  });
  const copyCfgToAll = () => setSt((s) => ({ ...s, cfg: Object.fromEntries(METRICS.map((m) => [m.key, JSON.parse(JSON.stringify(s.cfg[metric] || {}))])) }));
  const clearAll = () => { if (confirm('¿Borrar OTB, históricos y ajustes de Suplementarios?')) setSt({ dim, otb: Object.fromEntries(METRICS.map((m) => [m.key, zeros()])), entities: [], cfg: {}, locks: {} }); };

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-right whitespace-nowrap ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs text-right whitespace-nowrap tabular-nums';
  const good = t.success, bad = t.danger, warn = t.warning;

  const headerRight = (
    <>
      <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
        {['Marca', 'Proveedor'].map((d) => (
          <button key={d} onClick={() => setSt((s) => ({ ...s, dim: d }))} className={`px-3 py-1 text-xs rounded-md ${dim === d ? t.toggleActive : t.textMuted}`}>{d}</button>
        ))}
      </div>
      <button onClick={() => downloadTemplate(dim)} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg ${t.btnGhost}`}><FileSpreadsheet size={14} />Plantilla</button>
      <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-bold ${t.btn}`}><Upload size={14} />Cargar Excel</button>
      <button onClick={exportPlan} disabled={!entities.length} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg ${t.btnGhost} disabled:opacity-40`}><Download size={14} />Exportar</button>
      <button onClick={clearAll} className={`p-2 rounded-lg border ${t.btnDanger}`} title="Borrar todo"><Trash2 size={14} /></button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
    </>
  );

  // ── Tab 1: OTB general ──
  const totalK = kpis(otb, R12), lyK = kpis(byEnt.__total.hist, R12);
  const OtbTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ['Venta', fmt(totalK.vta), pct(growth(totalK.vta, lyK.vta)) + ' vs LY'],
          ['Margen', pct(totalK.margen), `LY ${pct(lyK.margen)}`],
          ['Mkd %', pct(totalK.mkdPct), `LY ${pct(lyK.mkdPct)}`],
          ['Sell-through', pct(totalK.st), `LY ${pct(lyK.st)}`],
          ['MOS cierre', dec(totalK.mos), `LY ${dec(lyK.mos)}`],
          ['Rotación', dec(totalK.rot), `LY ${dec(lyK.rot)}`],
        ].map(([l, v, s]) => (
          <div key={l} className={card}>
            <p className={`text-[10px] uppercase tracking-wide ${t.textMuted}`}>{l}</p>
            <p className={`text-xl font-black ${t.text}`}>{v}</p>
            <p className={`text-[10px] ${t.textMuted}`}>{s}</p>
          </div>
        ))}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead><tr><th className={`${th} text-left`}>Ratio</th>{MONTHS.map((m) => <th key={m} className={th}>{m}</th>)}<th className={th}>Total</th><th className={th}>LY</th><th className={th}>Crec.</th></tr></thead>
          <tbody>
            {METRICS.map((m) => {
              const arr = otb[m.key] || zeros();
              const tot = m.stock ? sum(arr) / 12 : sum(arr);
              const ly = m.stock ? sum(byEnt.__total.hist[m.key]) / 12 : sum(byEnt.__total.hist[m.key]);
              const g = growth(tot, ly);
              return (
                <tr key={m.key} className={t.tableRow}>
                  <td className={`px-2 py-1 text-xs font-bold ${t.text}`}>{m.label}{m.stock && <span className={`ml-1 text-[9px] ${t.textMuted}`}>(prom)</span>}</td>
                  {R12.map((k) => <td key={k} className="px-0.5 py-0.5"><NumCell value={arr[k] || ''} onCommit={(v) => setOtb(m.key, k, v)} className={t.inputY} /></td>)}
                  <td className={`${td} font-bold ${t.text}`}>{fmt(tot)}</td>
                  <td className={`${td} ${t.textMuted}`}>{fmt(ly)}</td>
                  <td className={`${td} ${g == null ? t.textMuted : g >= 0 ? good : bad}`}>{pct(g)}</td>
                </tr>
              );
            })}
            {[
              ['Margen %', 'margen', pct], ['Mkd %', 'mkdPct', pct], ['Sell-through', 'st', pct],
              ['MOS', 'mos', dec], ['Rotación (anualiz.)', 'rot', dec], ['Vta / Compra', 'vtaCompra', dec],
            ].map(([l, k, f]) => (
              <tr key={k} className={`border-t ${t.border}`}>
                <td className={`px-2 py-1 text-xs italic ${t.textMuted}`}>{l}</td>
                {R12.map((i) => <td key={i} className={`${td} ${t.textMuted}`}>{f(kpis(otb, [i])[k])}</td>)}
                <td className={`${td} font-bold ${t.text}`}>{f(totalK[k])}</td>
                <td className={`${td} ${t.textMuted}`}>{f(lyK[k])}</td><td />
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`mt-2 text-[10px] ${t.textMuted}`}>ST = CMSI / (CMSI + Inv fin) · MOS = Inv fin / CMSI promedio mensual · Rotación = CMSI / Inv promedio (anualizada). Inventario a costo.</p>
      </div>
    </div>
  );

  // ── Tab 2: Bajada ──
  const A = alloc[metric];
  const mCfg = cfg[metric] || {}, mLocks = locks[metric] || {};
  const otbM = otb[metric] || zeros();
  const monthOk = R12.map((k) => Math.abs(A.colTot[k] - (+otbM[k] || 0)) < 1);
  const manualSum = sum(Object.values(mCfg).map((c) => (c.share !== '' && c.share != null ? +c.share : 0)));
  const BajadaTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)} className={`px-3 py-1.5 text-xs rounded-lg border ${metric === m.key ? t.toggleActive : `${t.toggle} ${t.textMuted}`}`}>{m.label}</button>
        ))}
        <div className="flex-1" />
        <button onClick={copyCfgToAll} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`} title="Aplica share y estrategia de este ratio a todos"><Copy size={13} />Copiar ajustes a todos los ratios</button>
        <button onClick={() => clearLocks()} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}><RotateCcw size={13} />Liberar celdas fijas</button>
      </div>
      {!entities.length ? (
        <div className={`${card} text-center text-sm ${t.textMuted}`}>Carga el Excel con filas HIST por {dim.toLowerCase()} para hacer la bajada.</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full">
            <thead><tr>
              <th className={`${th} text-left sticky left-0 z-10`}>{dim}</th>
              <th className={th}>LY</th><th className={th}>Share LY</th><th className={th}>Share manual</th><th className={th}>Estrategia %</th>
              <th className={th}>Share final</th><th className={th}>Plan</th><th className={th}>Crec.</th>
              {MONTHS.map((m) => <th key={m} className={th}>{m}</th>)}
            </tr></thead>
            <tbody>
              {A.rows.map((r) => {
                const c = mCfg[r.name] || {}; const lk = mLocks[r.name] || {};
                const g = growth(r.planTot, r.histTot);
                return (
                  <tr key={r.name} className={t.tableRow}>
                    <td className={`px-2 py-1 text-xs font-bold whitespace-nowrap sticky left-0 ${isDark ? 'bg-[#1c1720]' : 'bg-white'} ${t.text}`}>
                      <span className="flex items-center gap-1">{r.name}
                        {Object.keys(lk).length > 0 && <button onClick={() => clearLocks(r.name)} title="Liberar celdas fijas"><Lock size={11} className={warn} /></button>}
                      </span>
                    </td>
                    <td className={`${td} ${t.textMuted}`}>{fmt(r.histTot)}</td>
                    <td className={`${td} ${t.textMuted}`}>{pct(r.histShare)}</td>
                    <td className="px-0.5 py-0.5 w-20"><NumCell value={c.share ?? ''} placeholder="hist" onCommit={(v) => setCfg(r.name, 'share', v)} className={t.input} /></td>
                    <td className="px-0.5 py-0.5 w-20"><NumCell value={c.adj ?? ''} placeholder="0" onCommit={(v) => setCfg(r.name, 'adj', v)} className={t.input} /></td>
                    <td className={`${td} font-bold ${t.text}`}>{pct(r.share)}</td>
                    <td className={`${td} font-bold ${t.text}`}>{fmt(r.planTot)}</td>
                    <td className={`${td} ${g == null ? t.textMuted : g >= 0 ? good : bad}`}>{pct(g)}</td>
                    {R12.map((k) => (
                      <td key={k} className="px-0.5 py-0.5">
                        <NumCell value={Math.round(r.plan[k])} onCommit={(v) => setLock(r.name, k, v)} className={lk[k] != null ? t.inputY : t.input} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 ${t.border}`}>
                <td className={`px-2 py-1 text-xs font-black ${t.text}`}>Total</td>
                <td className={`${td} ${t.textMuted}`}>{fmt(sum(A.rows.map((r) => r.histTot)))}</td><td />
                <td className={`${td} ${manualSum > 100 ? bad : t.textMuted}`}>{manualSum ? `${manualSum.toFixed(1)}%` : ''}</td><td />
                <td className={`${td} ${t.text}`}>100%</td>
                <td className={`${td} font-black ${t.text}`}>{fmt(sum(A.colTot))}</td><td />
                {R12.map((k) => <td key={k} className={`${td} font-bold ${t.text}`}>{fmt(A.colTot[k])}</td>)}
              </tr>
              <tr>
                <td className={`px-2 py-1 text-xs ${t.textMuted}`}>OTB objetivo</td><td colSpan={5} />
                <td className={`${td} ${t.textMuted}`}>{fmt(sum(otbM))}</td><td />
                {R12.map((k) => (
                  <td key={k} className={`${td} ${monthOk[k] ? good : bad}`}>
                    <span className="inline-flex items-center gap-0.5">{monthOk[k] ? <Check size={11} /> : <AlertCircle size={11} />}{fmt(otbM[k])}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          <p className={`mt-2 text-[10px] ${t.textMuted}`}>
            Share manual vacío = share histórico. Estrategia % multiplica el share (se renormaliza a 100%). Editar un mes lo fija (amarillo); el resto se reacomoda para cuadrar el OTB mensual. Si las celdas fijas exceden el OTB del mes, el check se pone en rojo.
          </p>
        </div>
      )}
    </div>
  );

  // ── Tab 3: Análisis ──
  const sel = byEnt[ent] || byEnt.__total;
  const chartData = R12.map((k) => ({ mes: MONTHS[k], 'Vta LY': sel.hist.vta?.[k] || 0, 'Vta Plan': sel.plan.vta?.[k] || 0, 'Inv Plan': sel.plan.inv?.[k] || 0 }));
  const seas = (arr) => { const avg = sum(arr) / 12; return R12.map((k) => (avg ? arr[k] / avg : null)); };
  const seasLY = seas(sel.hist.vta || zeros()), seasPl = seas(sel.plan.vta || zeros());
  const perRows = [
    ['Venta', 'vta', fmt, true], ['Mkd %', 'mkdPct', pct], ['Margen %', 'margen', pct], ['CMSI', 'cmsi', fmt, true],
    ['Compra', 'compra', fmt, true], ['Inv fin', 'invFin', fmt, true], ['Vta / Inv', 'vtaInv', dec], ['Vta / Compra', 'vtaCompra', dec],
    ['Sell-through', 'st', pct], ['MOS', 'mos', dec], ['Rotación', 'rot', dec],
  ];
  const tot = kpis(otb, R12);
  const totInvShareBase = sum(entities.map((e) => sum(byEnt[e.name].plan.inv) / 12)) || 1;
  const ranking = entities.map((e) => {
    const p = kpis(byEnt[e.name].plan, R12), l = kpis(byEnt[e.name].hist, R12);
    const shV = tot.vta ? p.vta / tot.vta : null, shI = p.invAvg / totInvShareBase;
    return { name: e.name, p, l, g: growth(p.vta, l.vta), shV, shI, gap: shV != null ? shI - shV : null };
  }).sort((a, b) => b.p.vta - a.p.vta);

  const AnalisisTab = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs ${t.textMuted}`}>{dim}:</span>
        <select value={ent} onChange={(e) => setEnt(e.target.value)} className={`px-2 py-1.5 text-xs rounded-lg border ${t.input}`}>
          <option value="__total">Total OTB</option>
          {entities.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={card}>
          <p className={`text-xs font-bold mb-2 ${t.text}`}>Venta LY vs Plan · Inventario plan</p>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#ffffff14' : '#e5e7eb'} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: isDark ? '#1c1720' : '#fff', border: 'none', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="l" dataKey="Vta LY" fill={isDark ? '#6b6778' : '#cbd5e1'} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="l" dataKey="Vta Plan" fill={isDark ? '#8A73AD' : '#2563eb'} radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" dataKey="Inv Plan" stroke="#E0BB3E" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className={`${card} overflow-x-auto`}>
          <p className={`text-xs font-bold mb-2 ${t.text}`}>Ciclicidad venta (índice mes / promedio)</p>
          <table className="w-full">
            <thead><tr><th className={`${th} text-left`} />{MONTHS.map((m) => <th key={m} className={th}>{m}</th>)}</tr></thead>
            <tbody>
              {[['LY', seasLY], ['Plan', seasPl]].map(([l, a]) => (
                <tr key={l}>
                  <td className={`px-2 py-1 text-xs font-bold ${t.text}`}>{l}</td>
                  {a.map((v, k) => (
                    <td key={k} className={`${td} ${t.text}`} style={{ background: v == null ? undefined : v >= 1 ? `rgba(16,185,129,${Math.min((v - 1) * 0.6, 0.45)})` : `rgba(239,68,68,${Math.min((1 - v) * 0.6, 0.45)})` }}>{dec(v, 2)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className={`px-2 py-1 text-xs ${t.textMuted}`}>Δ</td>
                {R12.map((k) => { const d = seasPl[k] != null && seasLY[k] != null ? seasPl[k] - seasLY[k] : null; return <td key={k} className={`${td} ${d == null ? t.textMuted : Math.abs(d) > 0.15 ? warn : t.textMuted}`}>{dec(d, 2)}</td>; })}
              </tr>
            </tbody>
          </table>
          <p className={`mt-2 text-[10px] ${t.textMuted}`}>Δ en amarillo = el plan se separa &gt;0.15 de la estacionalidad LY.</p>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <p className={`text-xs font-bold mb-2 ${t.text}`}>Trimestres y semestres · Plan (LY abajo)</p>
        <table className="w-full">
          <thead><tr><th className={`${th} text-left`}>Ratio</th>{PERIODS.map((p) => <th key={p.key} className={th}>{p.key}</th>)}</tr></thead>
          <tbody>
            {perRows.map(([l, k, f, isAmt]) => (
              <tr key={k} className={t.tableRow}>
                <td className={`px-2 py-1 text-xs font-bold ${t.text}`}>{l}</td>
                {PERIODS.map((p) => {
                  const pv = kpis(sel.plan, p.m)[k], lv = kpis(sel.hist, p.m)[k];
                  const g = isAmt ? growth(pv, lv) : null;
                  return (
                    <td key={p.key} className={td}>
                      <div className={`font-bold ${t.text}`}>{f(pv)}</div>
                      <div className={`text-[10px] ${t.textMuted}`}>{f(lv)}{g != null && <span className={g >= 0 ? good : bad}> {pct(g)}</span>}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entities.length > 0 && (
        <div className={`${card} overflow-x-auto`}>
          <p className={`text-xs font-bold mb-2 ${t.text}`}>Evaluación por {dim.toLowerCase()} (año)</p>
          <table className="w-full">
            <thead><tr>
              <th className={`${th} text-left`}>{dim}</th>
              {['Vta plan', 'Crec.', 'Share vta', 'Share inv', 'Gap inv-vta', 'Margen', 'Mkd %', 'ST', 'MOS', 'Rotación', 'Vta/Compra'].map((h) => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.name} className={`${t.tableRow} cursor-pointer`} onClick={() => setEnt(r.name)}>
                  <td className={`px-2 py-1 text-xs font-bold ${t.text}`}>{r.name}</td>
                  <td className={`${td} ${t.text}`}>{fmt(r.p.vta)}</td>
                  <td className={`${td} ${r.g == null ? t.textMuted : r.g >= 0 ? good : bad}`}>{pct(r.g)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.shV)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.shI)}</td>
                  <td className={`${td} ${r.gap > 0.03 ? bad : r.gap < -0.03 ? warn : t.textMuted}`}>{r.gap == null ? '—' : `${(r.gap * 100).toFixed(1)} pts`}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.margen)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.mkdPct)}</td>
                  <td className={`${td} ${t.text}`}>{pct(r.p.st)}</td>
                  <td className={`${td} ${tot.mos && r.p.mos > tot.mos * 1.25 ? bad : t.text}`}>{dec(r.p.mos)}</td>
                  <td className={`${td} ${t.text}`}>{dec(r.p.rot)}</td>
                  <td className={`${td} ${t.text}`}>{dec(r.p.vtaCompra, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`mt-2 text-[10px] ${t.textMuted}`}>Gap rojo = más inventario que venta (&gt;3 pts, riesgo de sobre-stock); amarillo = sub-inventariado. MOS rojo = &gt;25% arriba del total. Click en fila para ver su detalle arriba.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <div className={`flex gap-4 border-b ${t.border}`}>
        {[['otb', 'OTB General'], ['bajada', `Bajada por ${dim}`], ['analisis', 'Análisis']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`pb-2 text-sm font-bold border-b-2 ${tab === id ? t.tabActive : t.tabInactive}`}>{l}</button>
        ))}
      </div>
      {tab === 'otb' && OtbTab}
      {tab === 'bajada' && BajadaTab}
      {tab === 'analisis' && AnalisisTab}
    </div>
  );
}

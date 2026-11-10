import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Layers, Download, Upload, RotateCcw, AlertTriangle, Store, DollarSign, Package, Target } from 'lucide-react';
import { pricePoints, buildMatrix } from '../../lib/assortmentMatrix';

const TOL = 0.10;
const fmt = (n, d = 0) => (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d });
const money = (n) => '$' + fmt(n);
const mm = (n) => { const v = Number(n) || 0; return Math.abs(v) >= 1e6 ? `$${fmt(v / 1e6, 2)}M` : Math.abs(v) >= 1e3 ? `$${fmt(v / 1e3, 0)}K` : money(v); };
const norm = (h) => String(h ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const ck = (c) => { const n = parseInt(String(c ?? '').trim(), 10); return isNaN(n) ? String(c ?? '').trim().toUpperCase() : String(n); };
const loadLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const ATTRS = [['formato', 'Formato'], ['clima', 'Clima'], ['zona', 'Zona']];

// Matriz de compra: Ppto GOA → mes → bucket → campana de precios → modelos × tiendas elegibles → piezas por tienda.
export default function MatrizCompra({ t, theme, goas, setGoas, buckets, stores, sizeCurves, calcRules, pvpMix, bucketShareFor, rulesOf, mesesNorm, getMonthLabel }) {
  const isDark = theme === 'dark';
  const [goaId, setGoaId] = useState(null);
  const [metric, setMetric] = useState('modelos');
  const [attrs, setAttrs] = useState(() => loadLS('gop_assort_attrs'));
  const [elig, setElig] = useState(() => loadLS('gop_assort_elig'));
  const fileRef = useRef(null);
  useEffect(() => { try { localStorage.setItem('gop_assort_attrs', JSON.stringify(attrs)); } catch {} }, [attrs]);
  useEffect(() => { try { localStorage.setItem('gop_assort_elig', JSON.stringify(elig)); } catch {} }, [elig]);

  const g = (goas || []).find(x => x.id === goaId) || (goas || [])[0];
  const G = g ? String(g.name).toUpperCase() : '';
  const months = [0, 1, 2, 3, 4, 5].map(m => getMonthLabel(m));
  const attrOpts = useMemo(() => {
    const o = { formato: new Set(), clima: new Set(), zona: new Set() };
    Object.values(attrs).forEach(a => ATTRS.forEach(([k]) => { if (a[k]) o[k].add(a[k]); }));
    return Object.fromEntries(Object.entries(o).map(([k, s]) => [k, [...s].sort()]));
  }, [attrs]);

  // Histórico de precios del GOA (pvpMix: { GOA: { centro: { pvp: [pzs, $neto] } } })
  const hist = useMemo(() => {
    const m = {};
    Object.values(pvpMix?.[G] || {}).forEach(pvs => Object.entries(pvs).forEach(([pv, [u, p]]) => { const x = m[pv] = m[pv] || { pvp: Number(pv), u: 0, p: 0 }; x.u += Number(u) || 0; x.p += Number(p) || 0; }));
    return Object.values(m);
  }, [pvpMix, G]);

  const calc = useMemo(() => {
    if (!g) return null;
    const warn = [];
    const pm = mesesNorm(g).slice(0, 6);
    const budget = pm.map(p => (Number(g.budget) || 0) * p / 100);
    const share = bucketShareFor(g);
    const gStores = (stores || []).filter(st => st.clusters?.[g.name] || st.clusters?.[G]);
    const auto = pricePoints(hist, 4);
    const bks = (buckets || []).filter(b => share[b.id]).map(b => {
      const cfg = g.bkCfg?.[b.id] || {};
      // Reglas del bucket (OPP/MID/MAX…): cada una pesa por su %; las que no traen % se reparten lo que falte para 100
      const rl = rulesOf(g, b.id).map(r => ({ rule: (calcRules || []).find(x => x.id === Number(r.ruleId)), w: r.pct !== '' && r.pct != null ? Number(r.pct) || 0 : null })).filter(r => r.rule);
      const conPct = rl.filter(r => r.w != null).reduce((a, r) => a + r.w, 0), sinPct = rl.filter(r => r.w == null).length;
      rl.forEach(r => { if (r.w == null) r.w = sinPct ? Math.max(0, 100 - conPct) / sinPct : 0; });
      const wTot = rl.reduce((a, r) => a + r.w, 0) || 1;
      const rule = rl.length ? { corridas: Object.fromEntries([...new Set(rl.flatMap(r => Object.keys(r.rule.corridas || {})))].map(c => [c, rl.reduce((a, r) => a + (r.rule.corridas?.[c] || 0) * r.w / wTot, 0)])) } : null;
      const curve = (sizeCurves || []).find(c => c.id === Number(cfg.curveId || g.autoCurveId)) || (sizeCurves || [])[0];
      if (!rule) warn.push(`${b.name}: falta regla (paso 2 / 4)`);
      if (!curve) warn.push(`${b.name}: falta curva de tallas`);
      const pzsRun = curve ? (curve.weights || '').split(',').reduce((a, w) => a + (Number(w.trim()) || 0), 0) : 0;
      const e = elig[b.id] || {};
      const st = gStores.map(s => {
        const c = s.clusters?.[g.name] || s.clusters?.[G], at = attrs[ck(s.centerCode)] || {};
        const ok = ATTRS.every(([k]) => !(e[k] || []).length || (e[k] || []).includes(at[k]));
        return { id: s.id, centro: s.centerCode, name: s.name, cluster: c, qty: ok ? ((rule?.corridas || {})[c] || 0) * pzsRun : 0 };
      });
      let pts = (cfg.pts || []).filter(p => Number(p.pvp) > 0).map(p => ({ pvp: Number(p.pvp), pct: Number(p.pct) || 0 }));
      const manual = pts.length > 0;
      if (!manual) pts = auto.points.map(p => ({ pvp: p.pvp, pct: p.pct, lo: p.lo, hi: p.hi }));
      if (!pts.length) { const pv = Number(g.bucketPvps?.[b.id]) || Number(g.defaultPvp) || 0; if (pv > 0) pts = [{ pvp: pv, pct: 100 }]; else warn.push(`${b.name}: sin histórico de precios ni PVP capturado`); }
      return { id: b.id, name: b.name, pct: share[b.id], points: pts, manual, stores: st };
    });
    const res = buildMatrix({ budget, buckets: bks, tol: TOL });
    res.forEach(r => {
      if (!r.pzsModelo) warn.push(`${r.name}: ninguna tienda elegible con corridas (revisa regla, clusters o elegibilidad)`);
      r.points.forEach((p, i) => { if (p.otb > 0 && p.modelos === 0) warn.push(`${r.name} · P${i + 1} ($${fmt(p.pvp)}): su ppto no alcanza para 1 modelo — considera apagar el punto o fusionarlo`); });
    });
    return { budget, res, bks, warn, auto, total: budget.reduce((a, x) => a + x, 0) };
  }, [g, G, hist, buckets, stores, calcRules, sizeCurves, attrs, elig, pvpMix]);

  if (!g || !calc) return <div className={`rounded-xl border p-8 text-center text-sm ${t.card} ${t.textMuted}`}>Importa el Forecast en el paso 3 para ver la matriz de compra.</div>;
  const { res, budget, total, warn, auto } = calc;
  const tot = (f) => res.reduce((a, r) => a + r[f], 0);
  const compra = tot('importe'), modelos = tot('modelos'), pzs = tot('pzsReal'), noAsig = total - compra;
  const cobPct = total > 0 ? compra / total * 100 : 0;

  const setPts = (bId, pts) => setGoas(prev => prev.map(x => x.id !== g.id ? x : { ...x, bkCfg: { ...(x.bkCfg || {}), [bId]: { ...((x.bkCfg || {})[bId] || {}), pts } } }));
  const editPt = (r, i, k, v) => { const cur = r.points.map(p => ({ pvp: p.pvp, pct: Math.round(p.pct * 10) / 10 })); cur[i] = { ...cur[i], [k]: v === '' ? '' : Number(v) }; setPts(r.id, cur); };
  const cellVal = (c) => metric === 'modelos' ? c.modelos : metric === 'pzs' ? c.pzsReal : c.importe;
  const cellTxt = (v) => metric === 'importe' ? mm(v) : fmt(v);
  const cellCls = (c) => c.sinModelo ? (isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700') : c.fueraTol && c.modelos > 0 ? (isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700') : '';

  const loadAttrs = (file) => {
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const out = {};
        rows.forEach(r => {
          const m = {}; Object.entries(r).forEach(([k, v]) => { m[norm(k)] = String(v).trim(); });
          const c = ck(m.CENTRO || m.CENTRO_KEY || m.TIENDA_ID || m.ID);
          if (!c) return;
          out[c] = { formato: m.FORMATO || m.TIPO_TIENDA || '', clima: m.CLIMA || m.CLIMA_GENERAL || '', zona: m.ZONA || '' };
        });
        if (!Object.keys(out).length) { alert('No encontré la columna CENTRO. Columnas: CENTRO, FORMATO, CLIMA, ZONA.'); return; }
        setAttrs(out);
      } catch (err) { alert('Error al leer atributos: ' + err.message); }
    };
    rd.readAsArrayBuffer(file);
  };
  const toggleElig = (bId, k, v) => setElig(prev => { const cur = new Set((prev[bId] || {})[k] || []); cur.has(v) ? cur.delete(v) : cur.add(v); return { ...prev, [bId]: { ...(prev[bId] || {}), [k]: [...cur] } }; });
  const dl = (name, csv) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); };
  const exportMatriz = () => {
    let csv = 'GOA,Bucket,Punto,PVP,Mes,Ppto,Modelos,Piezas,Importe\r\n';
    res.forEach(r => r.points.forEach((p, i) => p.cells.forEach(c => { csv += `"${g.name}","${r.name}",P${i + 1},${p.pvp},"${months[c.mes]}",${Math.round(c.otb)},${c.modelos},${c.pzsReal},${Math.round(c.importe)}\r\n`; })));
    dl(`Matriz_compra_${g.name}.csv`, csv);
  };
  const exportTiendas = () => {
    let csv = 'GOA,Centro,Tienda,Cluster,Bucket,Modelos,Pzs por modelo,Piezas\r\n';
    res.forEach(r => r.stores.forEach(s => { csv += `"${g.name}","${s.centro}","${s.name}","${s.cluster}","${r.name}",${r.modelos},${s.qty},${s.qty * r.modelos}\r\n`; }));
    dl(`Compra_por_tienda_${g.name}.csv`, csv);
  };

  const clusters = [...new Set(res.flatMap(r => r.stores.map(s => s.cluster)))].sort();
  const th = `px-3 py-2 text-[10px] font-black uppercase tracking-wider text-right ${t.tableHead}`;
  const thL = th.replace('text-right', 'text-left');
  const td = 'px-3 py-2 text-xs text-right tabular-nums';
  const Kpi = ({ icon: Icon, label, value, sub, tone }) => (
    <div className={`rounded-xl border p-4 ${t.card}`}>
      <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${t.textMuted}`}><Icon size={13} className={t.textAccent1} /> {label}</div>
      <div className={`text-2xl font-black mt-1 ${tone || t.textMain}`}>{value}</div>
      <div className={`text-[11px] mt-0.5 ${t.textMuted}`}>{sub}</div>
    </div>
  );
  const maxU = Math.max(1, ...auto.bell.map(b => b.u));

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className={`rounded-xl border shadow-lg p-5 ${t.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={`text-lg font-bold flex items-center ${t.textMain}`}><Layers className={`mr-3 ${t.textAccent1}`} /> Matriz de compra</h2>
            <p className={`text-xs mt-1 max-w-3xl ${t.textMuted}`}>Ppto del GOA → mes → bucket → campana de precios (4 puntos del histórico) → modelos según las tiendas que entran y lo que le toca a cada cluster. Todo sale de tus pasos 1–3; solo edita lo amarillo si quieres cambiar algo. Ppto a venta neta: piezas = $ ÷ PVP.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={g.id} onChange={e => setGoaId(Number(e.target.value) || e.target.value)} className={`px-3 py-2 rounded-lg border text-sm font-bold ${t.input}`}>
              {(goas || []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button onClick={exportMatriz} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center ${t.btnPrimary}`}><Download size={14} className="mr-1.5" /> Matriz</button>
            <button onClick={exportTiendas} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center ${t.btnGhost}`}><Store size={14} className="mr-1.5" /> Por tienda</button>
          </div>
        </div>
      </div>

      {warn.length > 0 && (
        <div className={`rounded-xl border p-4 ${t.warningBg}`}>
          <div className="flex items-center gap-2 text-xs font-black uppercase mb-2"><AlertTriangle size={14} /> Revisar ({warn.length})</div>
          <ul className="text-xs space-y-1 list-disc pl-5">{warn.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}{warn.length > 8 && <li>y {warn.length - 8} más…</li>}</ul>
        </div>
      )}

      {/* Resumen para el comprador */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={DollarSign} label="Ppto GOA (6 meses)" value={mm(total)} sub={`${res.length} buckets activos`} />
        <Kpi icon={Target} label="Compra asignada" value={mm(compra)} sub={`${fmt(cobPct, 1)}% del ppto`} tone={cobPct >= 90 ? t.successText : t.warningText} />
        <Kpi icon={Package} label="Modelos / piezas" value={`${fmt(modelos)} mod`} sub={`${fmt(pzs)} piezas`} />
        <Kpi icon={AlertTriangle} label="Sin asignar" value={mm(noAsig)} sub="No alcanza para un modelo completo" tone={Math.abs(noAsig) > total * 0.1 ? t.dangerText : t.textMain} />
      </div>

      <div className={`rounded-xl border shadow-lg overflow-hidden ${t.card}`}>
        <div className={`px-5 py-3 border-b ${t.border}`}><h3 className={`text-sm font-black uppercase tracking-wider ${t.textMain}`}>Resumen por bucket</h3></div>
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className={thL}>Bucket</th><th className={th}>% ppto</th><th className={th}>Ppto</th><th className={th}>Compra</th><th className={th}>Dif</th><th className={th}>Modelos</th><th className={th}>Piezas</th><th className={th}>Tiendas</th><th className={th}>Pzs / modelo</th>{months.map(m => <th key={m} className={th}>{m}</th>)}</tr></thead>
          <tbody className={`divide-y ${t.border}`}>
            {res.map(r => (
              <tr key={r.id} className={t.tableRow}>
                <td className={`px-3 py-2 text-xs font-bold ${t.textMain}`}>{r.name}</td>
                <td className={td}>{fmt(r.otb / (total || 1) * 100, 0)}%</td>
                <td className={td}>{mm(r.otb)}</td><td className={`${td} font-bold`}>{mm(r.importe)}</td>
                <td className={`${td} ${Math.abs(r.importe - r.otb) > r.otb * TOL ? t.dangerText : t.textMuted}`}>{r.otb > 0 ? fmt((r.importe - r.otb) / r.otb * 100, 1) : 0}%</td>
                <td className={`${td} font-black ${t.textAccent1}`}>{fmt(r.modelos)}</td><td className={td}>{fmt(r.pzsReal)}</td><td className={td}>{fmt(r.tiendas)}</td><td className={td}>{fmt(r.pzsModelo)}</td>
                {r.modelosMes.map((v, i) => <td key={i} className={td}>{fmt(v)}</td>)}
              </tr>
            ))}
            <tr className={`font-black ${t.cardInner}`}>
              <td className="px-3 py-2 text-xs">TOTAL</td><td className={td}>100%</td><td className={td}>{mm(total)}</td><td className={td}>{mm(compra)}</td>
              <td className={td}>{total > 0 ? fmt((compra - total) / total * 100, 1) : 0}%</td><td className={td}>{fmt(modelos)}</td><td className={td}>{fmt(pzs)}</td><td className={td}></td><td className={td}></td>
              {months.map((_, i) => <td key={i} className={td}>{fmt(res.reduce((a, r) => a + r.modelosMes[i], 0))}</td>)}
            </tr>
          </tbody>
        </table></div>
      </div>

      {/* Matriz bucket × punto de precio × mes */}
      <div className={`rounded-xl border shadow-lg overflow-hidden ${t.card}`}>
        <div className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${t.border}`}>
          <div>
            <h3 className={`text-sm font-black uppercase tracking-wider ${t.textMain}`}>Matriz · bucket × punto de precio × mes</h3>
            <p className={`text-[11px] mt-0.5 ${t.textMuted}`}>PVP y % editables (amarillo). Rojo = el mes no alcanza para 1 modelo (se acumula al siguiente). Ámbar = el redondeo se desvía más de ±10%.</p>
          </div>
          <div className={`flex p-1 rounded-lg border ${t.cardInner}`}>
            {[['modelos', 'Modelos'], ['pzs', 'Piezas'], ['importe', '$ Compra']].map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} className={`px-3 py-1 rounded text-[11px] font-black ${metric === k ? t.toggleActive : t.toggleInactive}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className={thL}>Bucket · punto</th><th className={th}>PVP</th><th className={th}>% del bucket</th>{months.map(m => <th key={m} className={th}>{m}</th>)}<th className={th}>Total</th></tr></thead>
          <tbody className={`divide-y ${t.border}`}>
            {res.map(r => (
              <React.Fragment key={r.id}>
                <tr className={t.cardInner}>
                  <td colSpan={3 + months.length + 1} className={`px-3 py-1.5 text-[11px] font-black uppercase ${t.textMain}`}>
                    <span className="flex items-center gap-3">{r.name} <span className={`font-normal normal-case ${t.textMuted}`}>{fmt(r.tiendas)} tiendas · {fmt(r.pzsModelo)} pzs por modelo</span>
                      {calc.bks.find(b => b.id === r.id)?.manual && <button onClick={() => setPts(r.id, undefined)} className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${t.btnGhost}`}><RotateCcw size={10} /> Restaurar auto</button>}</span>
                  </td>
                </tr>
                {r.points.map((p, i) => (
                  <tr key={i} className={t.tableRow}>
                    <td className={`px-3 py-1.5 text-xs pl-6 ${t.textMuted}`}>P{i + 1}</td>
                    <td className="px-2 py-1 text-right"><input type="number" value={p.pvp} onChange={e => editPt(r, i, 'pvp', e.target.value)} className={`w-20 px-2 py-1 rounded text-xs text-right ${t.inputYellow}`} /></td>
                    <td className="px-2 py-1 text-right"><input type="number" step="0.1" value={Math.round(p.pct * 10) / 10} onChange={e => editPt(r, i, 'pct', e.target.value)} className={`w-16 px-2 py-1 rounded text-xs text-right ${t.inputYellow}`} /></td>
                    {p.cells.map((c, j) => <td key={j} className={`${td} ${cellCls(c)}`}>{cellTxt(cellVal(c))}</td>)}
                    <td className={`${td} font-black`}>{cellTxt(metric === 'modelos' ? p.modelos : metric === 'pzs' ? p.pzsReal : p.importe)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Campana + lo que le toca a cada cluster */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className={`rounded-xl border shadow-lg p-5 ${t.card}`}>
          <h3 className={`text-sm font-black uppercase tracking-wider mb-1 ${t.textMain}`}>Campana de precios · {g.name}</h3>
          <p className={`text-[11px] mb-3 ${t.textMuted}`}>Histórico de venta por PVP (paso 1, mezcla de PVP). Los 4 puntos cortan la campana donde cambia el comportamiento; color = punto.</p>
          {auto.bell.length === 0 ? <div className={`text-xs ${t.textMuted}`}>Sin histórico de PVP para este GOA: se usa el PVP capturado.</div> : (
            <div className="flex items-end gap-1 h-32">
              {auto.bell.map(b => {
                const pi = auto.points.findIndex(p => b.pvp >= p.lo && b.pvp <= p.hi);
                const cols = ['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500'];
                return <div key={b.pvp} title={`$${fmt(b.pvp)} · ${fmt(b.u)} pzs`} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className={`w-full rounded-t ${cols[pi] || 'bg-gray-400'}`} style={{ height: `${Math.max(3, b.u / maxU * 100)}%` }} />
                  <span className={`text-[8px] mt-1 ${t.textMuted}`}>{b.pvp}</span></div>;
              })}
            </div>
          )}
        </div>

        <div className={`rounded-xl border shadow-lg overflow-hidden ${t.card}`}>
          <div className={`px-5 py-3 border-b ${t.border}`}>
            <h3 className={`text-sm font-black uppercase tracking-wider ${t.textMain}`}>Lo que le toca a cada tienda</h3>
            <p className={`text-[11px] mt-0.5 ${t.textMuted}`}>Piezas por tienda en el horizonte (modelos del bucket × pzs por modelo del cluster).</p>
          </div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className={thL}>Cluster</th><th className={th}>Tiendas</th>{res.map(r => <th key={r.id} className={th}>{r.name}</th>)}<th className={th}>Total / tienda</th></tr></thead>
            <tbody className={`divide-y ${t.border}`}>
              {clusters.map(c => {
                const n = (res[0]?.stores || []).filter(s => s.cluster === c).length;
                const per = res.map(r => { const s = r.stores.find(x => x.cluster === c && x.qty > 0); return s ? s.qty * r.modelos : 0; });
                return <tr key={c} className={t.tableRow}><td className={`px-3 py-2 text-xs font-bold ${t.textMain}`}>{c}</td><td className={td}>{fmt(n)}</td>{per.map((v, i) => <td key={i} className={td}>{fmt(v)}</td>)}<td className={`${td} font-black`}>{fmt(per.reduce((a, x) => a + x, 0))}</td></tr>;
              })}
            </tbody>
          </table></div>
        </div>
      </div>

      {/* Elegibilidad de tiendas por bucket */}
      <div className={`rounded-xl border shadow-lg p-5 ${t.card}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 className={`text-sm font-black uppercase tracking-wider ${t.textMain}`}>Qué tiendas entran a cada bucket</h3>
            <p className={`text-[11px] mt-0.5 ${t.textMuted}`}>Por defecto todas. Carga los atributos de tienda (CENTRO, FORMATO, CLIMA, ZONA) y marca a cuáles va cada bucket; sin marcar = todas. Aplica a todos los GOAs.</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { if (e.target.files[0]) loadAttrs(e.target.files[0]); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center ${Object.keys(attrs).length ? t.btnSecondary : t.btnGhost}`}><Upload size={14} className="mr-1.5" /> {Object.keys(attrs).length ? `Atributos (${Object.keys(attrs).length} tiendas)` : 'Cargar atributos'}</button>
          </div>
        </div>
        {Object.keys(attrs).length === 0 ? <div className={`text-xs ${t.textMuted}`}>Sin atributos cargados: todos los buckets entran a todas las tiendas con clúster.</div> : (
          <div className="space-y-3">
            {res.map(r => (
              <div key={r.id} className={`rounded-lg border p-3 ${t.cardInner}`}>
                <div className={`text-xs font-black mb-2 ${t.textMain}`}>{r.name} <span className={`font-normal ${t.textMuted}`}>· {fmt(r.tiendas)} tiendas elegibles</span></div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {ATTRS.map(([k, l]) => attrOpts[k].length > 0 && (
                    <div key={k} className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-black uppercase ${t.textMuted}`}>{l}</span>
                      {attrOpts[k].map(v => { const on = ((elig[r.id] || {})[k] || []).includes(v); return <button key={v} onClick={() => toggleElig(r.id, k, v)} className={`px-2 py-0.5 rounded text-[11px] border transition ${on ? 'bg-violet-600 text-white border-violet-600' : `${t.btnGhost} border-transparent`}`}>{v}</button>; })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

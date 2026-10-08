import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Gauge } from 'lucide-react';

// Compra por capacidad: corridas desde el OTB (cuadre exacto), clusters venta × capacidad,
// flujo mensual compra vs venta vs espacio (saldo en CEDIS) y buckets PVP que cuadran OTB pzs y OTB $ neto.
const LS_KEY = 'gop_assortment_cap';
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DEF_BUCKETS = [{ name: 'Low', top: 699, desc: null }, { name: 'Mid', top: 899, desc: null }, { name: 'High', top: 1499, desc: null }, { name: 'Premium', top: 99999, desc: null }];
const DEF = { goa: '', norma: 2, densidad: '', pctDens: 0.75, freq: 2, pctHi: 0.667, pctLo: 0.333, base: 'pzs', otbPz: Array(12).fill(0), otb$: 0, buckets: DEF_BUCKETS, adjLo: 0, adjHi: 2 };

const norm = (h) => String(h ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9$]+/g, '_').replace(/^_|_$/g, '');
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n; };
const key = (v) => { const s = String(v ?? '').trim(); const n = parseInt(s, 10); return isNaN(n) ? s.toUpperCase() : String(n); };
const pctl = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fmt = (n) => Math.round(n || 0).toLocaleString('es-MX');
const fmt1 = (n) => (n || 0).toLocaleString('es-MX', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
const money = (n) => `$${fmt(n)}`;

const readRows = async (file) => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  const hi = rows.findIndex(r => r.filter(c => String(c).trim() !== '').length >= 3);
  if (hi < 0) return { head: [], body: [] };
  return { head: rows[hi].map(norm), body: rows.slice(hi + 1).filter(r => r.some(c => String(c).trim() !== '')) };
};
const pick = (head, names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };

export default function AssortmentCapacidad({ t, isDark }) {
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } }, []);
  const [base, setBase] = useState(saved?.base || {});        // centro → { name, zona, goas: { goa: { u, p, oh, m[12] } } }
  const [caps, setCaps] = useState(saved?.caps || {});        // centro → { m2, cap }
  const [mix, setMix] = useState(saved?.mix || {});           // goa → centro → { pvp: [u, p] }
  const [prm, setPrm] = useState({ ...DEF, ...(saved?.prm || {}) });
  const set = (k, v) => setPrm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ base, caps, mix, prm })); } catch (e) { console.warn('gop_assortment_cap', e); } }, 400);
    return () => clearTimeout(id);
  }, [base, caps, mix, prm]);

  // ---------- carga de archivos ----------
  const loadBase = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const { head, body } = await readRows(f);
    const kc = pick(head, ['CENTRO_KEY', 'CENTRO_ID', 'CLAVE_CENTRO', 'CENTRO']);
    const nc = pick(head.map((h, i) => (i === kc ? '' : h)), ['TIENDA', 'NOMBRE', 'NOM_CENTRO', 'CENTRO']);
    const gc = pick(head, ['GOA', 'FAMILIA']), zc = pick(head, ['ZONA']);
    const uc = pick(head, ['VENTA_U_12M', 'VENTA_U', 'VTA_U', 'VENTAS', 'VENTA_PZS']);
    const pc = pick(head, ['VENTA_P_12M', 'VENTA_P', 'VTA_P', 'VENTA_$', 'VENTA_PESOS']);
    const oc = pick(head, ['OH_U', 'OH']);
    const mc = head.map((h, i) => { const m = h.match(/^U_(\d{4})_(\d{2})$/); return m ? [i, Number(m[2]) - 1] : null; }).filter(Boolean);
    if (kc < 0 || (uc < 0 && !mc.length)) { alert('Falta CENTRO y venta en piezas (VENTA_U_12M o columnas U_AAAA_MM).'); return; }
    const out = {};
    body.forEach(r => {
      const c = key(r[kc]); if (!c) return;
      const g = gc >= 0 ? String(r[gc]).trim().toUpperCase() || 'TOTAL' : 'TOTAL';
      const s = out[c] || (out[c] = { name: nc >= 0 ? String(r[nc]).trim() : c, zona: '', goas: {} });
      if (zc >= 0 && !s.zona) s.zona = String(r[zc]).trim();
      const x = s.goas[g] || (s.goas[g] = { u: 0, p: 0, oh: 0, m: Array(12).fill(0) });
      const months = mc.map(([i, mi]) => [mi, num(r[i])]);
      months.forEach(([mi, v]) => { x.m[mi] += v; });
      x.u += uc >= 0 ? num(r[uc]) : months.reduce((a, [, v]) => a + v, 0);
      if (pc >= 0) x.p += num(r[pc]);
      if (oc >= 0) x.oh += num(r[oc]);
    });
    setBase(out);
    const gs = [...new Set(Object.values(out).flatMap(s => Object.keys(s.goas)))];
    if (!gs.includes(prm.goa)) set('goa', gs.includes('MALETA') ? 'MALETA' : gs[0]);
  };
  const loadCaps = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const { head, body } = await readRows(f);
    const kc = pick(head, ['CENTRO_KEY', 'CENTRO_ID', 'CENTRO']);
    const mc = head.findIndex(h => h === 'M2' || (h.startsWith('M2') && h.includes('ACTUAL')));
    const cc = head.findIndex(h => h.includes('CAPACIDAD'));
    if (kc < 0 || (mc < 0 && cc < 0)) { alert('Falta CENTRO y M2 (M2 Actuales) o CAPACIDAD (pzs).'); return; }
    const out = {};
    body.forEach(r => { const c = key(r[kc]); if (c) out[c] = { m2: mc >= 0 ? num(r[mc]) : 0, cap: cc >= 0 ? num(r[cc]) : 0 }; });
    setCaps(out);
  };
  const loadMix = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const { head, body } = await readRows(f);
    const kc = pick(head, ['CENTRO_KEY', 'CENTRO_ID', 'CENTRO']), gc = pick(head, ['GOA', 'FAMILIA']);
    const vc = pick(head, ['PVP', 'PVP_INICIAL', 'PRECIO']), uc = pick(head, ['VENTA_U', 'PZS', 'PIEZAS']), pc = pick(head, ['VENTA_P', 'VENTA_$', 'VALOR']);
    if (kc < 0 || vc < 0 || uc < 0) { alert('Falta CENTRO, PVP y VENTA_U.'); return; }
    const out = {};
    body.forEach(r => {
      const c = key(r[kc]), pv = num(r[vc]), u = num(r[uc]); if (!c || !pv || !u) return;
      const g = gc >= 0 ? String(r[gc]).trim().toUpperCase() || 'TOTAL' : 'TOTAL';
      const x = ((out[g] || (out[g] = {}))[c] || (out[g][c] = {}));
      const cell = x[pv] || (x[pv] = [0, 0]); cell[0] += u; cell[1] += pc >= 0 ? num(r[pc]) : 0;
    });
    setMix(out);
  };

  // ---------- cálculo ----------
  const goas = useMemo(() => [...new Set(Object.values(base).flatMap(s => Object.keys(s.goas)))].sort(), [base]);
  const R = useMemo(() => {
    const g = prm.goa, norma = Math.max(1, num(prm.norma));
    const rows = Object.entries(base).map(([c, s]) => {
      const x = s.goas[g] || { u: 0, p: 0, oh: 0, m: Array(12).fill(0) };
      const cp = caps[c] || {};
      return { c, name: s.name, zona: s.zona, u: x.u, p: x.p, oh: x.oh, m: x.m, m2: cp.m2 || 0, capReal: cp.cap || 0 };
    }).filter(r => r.u !== 0 || r.m2 > 0);
    if (!rows.length) return null;
    const ventaMin = norma * 12 / Math.max(1, num(prm.freq));
    rows.forEach(r => { r.eleg = r.u >= ventaMin; });
    const eleg = rows.filter(r => r.eleg);
    const dens = num(prm.densidad) || pctl(rows.filter(r => r.m2 > 0 && r.oh > 0).map(r => r.oh / r.m2), num(prm.pctDens));
    const m2s = rows.filter(r => r.m2 > 0).map(r => r.m2), vts = eleg.map(r => r.u);
    const cut = { capHi: pctl(m2s, prm.pctHi), capLo: pctl(m2s, prm.pctLo), vHi: pctl(vts, prm.pctHi), vLo: pctl(vts, prm.pctLo) };
    const useP = prm.base === 'pesos' && eleg.some(r => r.p > 0);
    const totB = eleg.reduce((a, r) => a + (useP ? r.p : r.u), 0) || 1;
    const otbPz = prm.otbPz.map(num), otbTot = otbPz.reduce((a, b) => a + b, 0);
    const corrObj = Math.round(otbTot / norma);
    rows.forEach(r => {
      r.cluster = !r.eleg ? 'Sin venta' : `${r.u >= cut.vHi ? 'A' : r.u < cut.vLo ? 'C' : 'B'}-${r.m2 > 0 ? (r.m2 >= cut.capHi ? 'Alta' : r.m2 < cut.capLo ? 'Baja' : 'Media') : 'Sin m²'}`;
      r.share = r.eleg ? (useP ? r.p : r.u) / totB : 0;
      r.teo = r.share * corrObj; r.corr = Math.floor(r.teo);
      r.cap = r.capReal > 0 ? r.capReal : r.m2 > 0 ? r.m2 * dens : Infinity;
    });
    let falta = corrObj - rows.reduce((a, r) => a + r.corr, 0);
    [...eleg].sort((a, b) => (b.teo - b.corr) - (a.teo - a.corr)).forEach(r => { if (falta > 0) { r.corr += 1; falta -= 1; } });
    // estacionalidad de venta por mes calendario (si no hay meses, plana)
    const hist = Array(12).fill(0); rows.forEach(r => r.m.forEach((v, i) => { hist[i] += v; }));
    const hTot = hist.reduce((a, b) => a + b, 0);
    const est = hTot > 0 ? hist.map(v => v / hTot) : Array(12).fill(1 / 12);
    const envio = Array(12).fill(0), saldo = Array(12).fill(0);
    rows.forEach(r => {
      r.pz = r.corr * norma; r.env = Array(12).fill(0); let pool = 0, inv = 0; r.maxSaldo = 0;
      for (let i = 0; i < 12; i++) {
        pool += otbTot ? r.pz * otbPz[i] / otbTot : 0;
        const send = Math.floor(Math.min(pool, Math.max(0, r.cap - inv)) / norma) * norma;
        pool -= send; inv = Math.max(0, inv + send - (r.eleg ? Math.max(0, r.u) * est[i] : 0));
        r.env[i] = send; envio[i] += send; saldo[i] += pool; r.maxSaldo = Math.max(r.maxSaldo, pool);
      }
      r.excede = r.cap === Infinity ? null : r.maxSaldo >= norma;
    });
    // clusters
    const order = ['A', 'B', 'C'].flatMap(v => ['Alta', 'Media', 'Baja', 'Sin m²'].map(c => `${v}-${c}`));
    const cl = order.map(name => {
      const rs = rows.filter(r => r.cluster === name); if (!rs.length) return null;
      const n = rs.length, ven = rs.reduce((a, r) => a + r.u, 0), m2 = rs.filter(r => r.m2 > 0);
      return {
        name, n, ven, share: rs.reduce((a, r) => a + r.share, 0), m2: m2.length ? m2.reduce((a, r) => a + r.m2, 0) / m2.length : null,
        vm2: m2.length ? m2.reduce((a, r) => a + r.u / r.m2, 0) / m2.length : null,
        corr: rs.reduce((a, r) => a + r.corr, 0) / n, pz: rs.reduce((a, r) => a + r.pz, 0), exc: rs.filter(r => r.excede).length,
        mes: MESES.map((_, i) => rs.reduce((a, r) => a + r.env[i], 0) / n / norma), rows: rs
      };
    }).filter(Boolean);
    // buckets PVP
    const mg = mix[g] || {}, bks = prm.buckets.map((b, i) => ({ ...b, lo: i ? num(prm.buckets[i - 1].top) : 0, top: num(b.top) }));
    const bOf = (pv) => bks.findIndex(b => pv > b.lo && pv <= b.top);
    bks.forEach(b => { b.u = 0; b.pi = 0; b.pn = 0; b.min = Infinity; b.max = 0; });
    const clMix = {};
    Object.entries(mg).forEach(([c, pvs]) => {
      const r = rows.find(x => x.c === c);
      Object.entries(pvs).forEach(([pv, [u, p]]) => {
        const i = bOf(Number(pv)); if (i < 0) return; const b = bks[i];
        b.u += u; b.pi += Number(pv) * u; b.pn += p; if (u > 0) { b.min = Math.min(b.min, Number(pv)); b.max = Math.max(b.max, Number(pv)); }
        if (r && r.eleg) { const m = clMix[r.cluster] || (clMix[r.cluster] = Array(bks.length).fill(0)); m[i] += u; }
      });
    });
    const bU = bks.reduce((a, b) => a + b.u, 0);
    bks.forEach(b => { b.pvp = b.u ? b.pi / b.u : 0; b.neto = b.u ? b.pn / b.u : 0; b.descH = b.pi ? 1 - b.pn / b.pi : 0; b.mixH = bU ? b.u / bU : 0; b.descP = b.desc ?? b.descH; b.precio = b.pvp * (1 - b.descP); });
    let bk = null;
    if (bU > 0) {
      const lo = Math.min(prm.adjLo, bks.length - 1), hi = Math.min(prm.adjHi, bks.length - 1);
      const clR = cl.map(x => { const m = clMix[x.name] || bks.map(b => b.mixH); const s = m.reduce((a, b) => a + b, 0) || 1; return { ...x, mixH: m.map(v => v / s) }; });
      const totPz = clR.reduce((a, x) => a + x.pz, 0);
      const base$ = clR.reduce((a, x) => a + x.pz * x.mixH.reduce((s, v, i) => s + v * bks[i].precio, 0), 0);
      const baseIni$ = clR.reduce((a, x) => a + x.pz * x.mixH.reduce((s, v, i) => s + v * bks[i].pvp, 0), 0);
      const otb$ = num(prm.otb$), dp = bks[hi].precio - bks[lo].precio;
      const s = otb$ && dp && totPz ? (otb$ - base$) / (dp * totPz) : 0;
      clR.forEach(x => { x.mixF = x.mixH.map((v, i) => v + (i === hi ? s : i === lo ? -s : 0)); x.pzB = x.mixF.map(v => v * x.pz); x.$ = x.pzB.reduce((a, v, i) => a + v * bks[i].precio, 0); x.ok = x.mixF.every(v => v >= -1e-9); });
      bk = { lo, hi, s, base$, totPz, cl: clR, tot$: clR.reduce((a, x) => a + x.$, 0), descImp: otb$ && baseIni$ ? 1 - otb$ / baseIni$ : null, descH: bks.reduce((a, b) => a + b.pi, 0) ? 1 - bks.reduce((a, b) => a + b.pn, 0) / bks.reduce((a, b) => a + b.pi, 0) : 0 };
    }
    return { rows, eleg, dens, cut, ventaMin, corrObj, otbTot, envio, saldo, cl, bks, bk, norma, est, useP };
  }, [base, caps, mix, prm]);

  const exportCSV = () => {
    if (!R) return;
    const bn = R.bk ? R.bks.map(b => `PZS_${b.name}`) : [];
    const lines = [['CENTRO', 'TIENDA', 'CLUSTER', 'M2', 'VENTA_12M', 'CORRIDAS', 'PZS', 'CAPACIDAD', 'MAX_SALDO_CEDIS', ...bn, ...MESES.map(m => `ENVIO_${m}`)].join(',')];
    R.rows.filter(r => r.corr > 0).forEach(r => {
      const cm = R.bk?.cl.find(x => x.name === r.cluster);
      lines.push([r.c, `"${r.name}"`, r.cluster, r.m2, r.u, r.corr, r.pz, r.cap === Infinity ? '' : Math.round(r.cap), Math.round(r.maxSaldo),
        ...(cm ? cm.mixF.map(v => Math.round(v * r.pz)) : bn.map(() => '')), ...r.env].join(','));
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    a.download = `Compra_Capacidad_${prm.goa || 'GOA'}.csv`; a.click();
  };

  // ---------- UI ----------
  const card = `rounded-2xl border p-5 ${t.card}`;
  const lbl = `text-[10px] font-black uppercase tracking-widest ${t.textMuted}`;
  const inp = `w-full px-2 py-1 rounded border text-sm ${t.inputYellow}`;
  const th = `px-2 py-2 text-right font-black`;
  const td = `px-2 py-1.5 text-right ${t.textMain}`;
  const Up = ({ label, desc, onChange, done }) => (
    <label className={`flex-1 min-w-[220px] cursor-pointer rounded-xl border border-dashed p-4 ${t.cardInner}`}>
      <div className="flex items-center gap-2"><Upload size={16} className={t.textAccent2} /><span className={`text-sm font-black ${t.textMain}`}>{label}</span>{done && <span className={`text-[10px] font-bold ${t.successText}`}>✓ {done}</span>}</div>
      <p className={`text-[11px] mt-1 ${t.textMuted}`}>{desc}</p>
      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onChange} />
    </label>
  );
  const Num = ({ k, step = 1, label, hint }) => (
    <div><div className={lbl}>{label}</div><input type="number" step={step} value={prm[k]} onChange={e => set(k, e.target.value)} className={inp} />{hint && <div className={`text-[10px] mt-0.5 ${t.textMuted}`}>{hint}</div>}</div>
  );
  const nMix = Object.keys(mix[prm.goa] || {}).length;

  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="flex items-center gap-2 mb-3"><Gauge size={18} className={t.textAccent1} /><h2 className={`text-lg font-black ${t.textMain}`}>Compra por capacidad</h2></div>
        <p className={`text-xs mb-4 ${t.textMuted}`}>Corridas desde el OTB con cuadre exacto, clusters venta × capacidad, prueba de espacio mes a mes y reparto por precio que cuadra el OTB en piezas y en $ neto. Capacidad y mezcla de precios son opcionales.</p>
        <div className="flex flex-wrap gap-3">
          {Up({ label: 'Venta por tienda *', desc: 'CENTRO, venta 12M (pzs y $) y meses U_AAAA_MM. GOA opcional (ej. VIAJE_TAMANO_MES).', onChange: loadBase, done: Object.keys(base).length ? `${Object.keys(base).length} tiendas` : '' })}
          {Up({ label: 'Capacidad / m²', desc: 'CENTRO + CAPACIDAD (pzs reales) o M2. Sin esto no hay tope de espacio.', onChange: loadCaps, done: Object.keys(caps).length ? `${Object.keys(caps).length} tiendas` : '' })}
          {Up({ label: 'Mezcla PVP', desc: 'CENTRO, GOA, PVP inicial, VENTA_U, VENTA_P (ej. VIAJE_MEZCLA_PVP).', onChange: loadMix, done: nMix ? `${nMix} tiendas` : '' })}
        </div>
      </div>

      {!R ? null : (<>
        <div className={card}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div><div className={lbl}>GOA</div><select value={prm.goa} onChange={e => set('goa', e.target.value)} className={inp}>{goas.map(g => <option key={g}>{g}</option>)}</select></div>
            {Num({k: "norma", label: "Pzs por corrida"})}
            {Num({ k: 'freq', label: '1 corrida cada N meses', hint: `Venta mín. ${fmt(R.ventaMin)} pzs/año` })}
            {Num({ k: 'densidad', step: 0.1, label: 'Pzs por m²', hint: num(prm.densidad) ? 'Manual' : `Auto ${fmt1(R.dens)} (p${Math.round(prm.pctDens * 100)} OH/m²)` })}
            {Num({k: "pctDens", step: 0.05, label: "Percentil densidad"})}
            {Num({k: "pctHi", step: 0.05, label: "Percentil corte alto"})}
            {Num({k: "pctLo", step: 0.05, label: "Percentil corte bajo"})}
            <div><div className={lbl}>Reparto por</div><select value={prm.base} onChange={e => set('base', e.target.value)} className={inp}><option value="pzs">Piezas</option><option value="pesos">Pesos netos</option></select></div>
          </div>
          <div className="mt-4">
            <div className={lbl}>OTB piezas por mes de recibo</div>
            <div className="grid grid-cols-6 lg:grid-cols-12 gap-2 mt-1">
              {MESES.map((m, i) => (
                <div key={m}><div className={`text-[10px] font-bold ${t.textMuted}`}>{m}</div>
                  <input type="number" value={prm.otbPz[i]} onChange={e => set('otbPz', prm.otbPz.map((v, j) => (j === i ? e.target.value : v)))} className={inp} /></div>
              ))}
            </div>
            <div className={`text-xs mt-2 font-bold ${t.textMain}`}>Total {fmt(R.otbTot)} pzs → {fmt(R.corrObj)} corridas · asignadas {fmt(R.rows.reduce((a, r) => a + r.corr, 0))}</div>
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-black uppercase tracking-wider ${t.textMain}`}>Clusters venta × capacidad</h3>
            <button onClick={exportCSV} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black ${t.btnPrimary}`}><Download size={14} /> CSV por tienda</button>
          </div>
          <div className={`text-[11px] mb-2 ${t.textMuted}`}>Cortes: venta A ≥ {fmt(R.cut.vHi)} · C &lt; {fmt(R.cut.vLo)} pzs | m² Alta ≥ {fmt1(R.cut.capHi)} · Baja &lt; {fmt1(R.cut.capLo)}</div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead className={`border-b ${t.tableHead}`}><tr><th className="px-2 py-2 text-left font-black">Cluster</th><th className={th}># Tdas</th><th className={th}>Venta 12M</th><th className={th}>Share</th><th className={th}>m² prom</th><th className={th}>Venta/m²</th><th className={th}>Corridas/tda/año</th><th className={th}>Pzs</th><th className={th}>No les cabe</th></tr></thead>
            <tbody>{R.cl.map(x => (
              <tr key={x.name} className={`border-b ${t.border} ${t.tableRow}`}><td className={`px-2 py-1.5 font-black ${t.textMain}`}>{x.name}</td><td className={td}>{x.n}</td><td className={td}>{fmt(x.ven)}</td><td className={td}>{pct(x.share)}</td><td className={td}>{x.m2 == null ? '—' : fmt1(x.m2)}</td><td className={td}>{x.vm2 == null ? '—' : fmt1(x.vm2)}</td><td className={td}>{fmt1(x.corr)}</td><td className={td}>{fmt(x.pz)}</td><td className={`px-2 py-1.5 text-right font-bold ${x.exc ? t.dangerText : t.textMuted}`}>{x.exc}</td></tr>
            ))}</tbody>
          </table></div>
        </div>

        <div className={card}>
          <h3 className={`text-sm font-black uppercase tracking-wider mb-1 ${t.textMain}`}>Flujo: compra vs venta vs espacio</h3>
          <p className={`text-[11px] mb-3 ${t.textMuted}`}>Arranca en 0 (sin OH). A tienda va solo lo que cabe (capacidad − inventario del mes anterior) en corridas completas; el resto espera en CEDIS. Corridas enviadas promedio por tienda.</p>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead className={`border-b ${t.tableHead}`}><tr><th className="px-2 py-2 text-left font-black">Cluster</th>{MESES.map(m => <th key={m} className={th}>{m}</th>)}<th className={th}>Año</th></tr></thead>
            <tbody>
              {R.cl.map(x => (<tr key={x.name} className={`border-b ${t.border} ${t.tableRow}`}><td className={`px-2 py-1.5 font-black ${t.textMain}`}>{x.name}</td>{x.mes.map((v, i) => <td key={i} className={td}>{fmt1(v)}</td>)}<td className={`${td} font-black`}>{fmt1(x.mes.reduce((a, b) => a + b, 0))}</td></tr>))}
              <tr className={`font-black ${t.tableHead}`}><td className="px-2 py-1.5">OTB pzs</td>{R.envio.map((_, i) => <td key={i} className="px-2 py-1.5 text-right">{fmt(num(prm.otbPz[i]))}</td>)}<td className="px-2 py-1.5 text-right">{fmt(R.otbTot)}</td></tr>
              <tr className={`font-black ${t.tableHead}`}><td className="px-2 py-1.5">Envío a tienda</td>{R.envio.map((v, i) => <td key={i} className="px-2 py-1.5 text-right">{fmt(v)}</td>)}<td className="px-2 py-1.5 text-right">{fmt(R.envio.reduce((a, b) => a + b, 0))}</td></tr>
              <tr className={`font-black ${t.tableHead}`}><td className={`px-2 py-1.5 ${t.warningText}`}>Saldo CEDIS</td>{R.saldo.map((v, i) => <td key={i} className={`px-2 py-1.5 text-right ${v >= R.norma * R.eleg.length ? t.warningText : ''}`}>{fmt(v)}</td>)}<td className="px-2 py-1.5"></td></tr>
            </tbody>
          </table></div>
          {!Object.keys(caps).length && <p className={`text-[11px] mt-2 ${t.warningText}`}>Sin capacidad cargada: todo cabe y el saldo CEDIS es solo redondeo.</p>}
        </div>

        <div className={card}>
          <h3 className={`text-sm font-black uppercase tracking-wider mb-1 ${t.textMain}`}>Buckets PVP · cuadre OTB $ neto</h3>
          {!R.bk ? <p className={`text-xs ${t.textMuted}`}>Carga la mezcla PVP para partir las corridas por rango de precio.</p> : (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div><div className={lbl}>OTB $ (venta neta)</div><input type="number" value={prm.otb$} onChange={e => set('otb$', e.target.value)} className={inp} /><div className={`text-[10px] mt-0.5 ${t.textMuted}`}>Pide {money(num(prm.otb$) / (R.otbTot || 1))}/pz neto</div></div>
              <div><div className={lbl}>Ajuste: baja</div><select value={prm.adjLo} onChange={e => set('adjLo', Number(e.target.value))} className={inp}>{R.bks.map((b, i) => <option key={i} value={i}>{b.name}</option>)}</select></div>
              <div><div className={lbl}>Ajuste: sube</div><select value={prm.adjHi} onChange={e => set('adjHi', Number(e.target.value))} className={inp}>{R.bks.map((b, i) => <option key={i} value={i}>{b.name}</option>)}</select></div>
              <div className={`rounded-lg border p-2 ${R.bk.cl.every(x => x.ok) ? t.successBg : t.dangerBg}`}>
                <div className="text-[10px] font-black uppercase">Mover {pct(Math.abs(R.bk.s))} {R.bk.s >= 0 ? `${R.bks[R.bk.lo].name} → ${R.bks[R.bk.hi].name}` : `${R.bks[R.bk.hi].name} → ${R.bks[R.bk.lo].name}`}</div>
                <div className="text-[11px]">Descuento que cuadra el OTB con la mezcla histórica: <b>{pct(R.bk.descImp)}</b> (hist. {pct(R.bk.descH)})</div>
              </div>
            </div>
            <div className="overflow-x-auto mb-4"><table className="w-full text-xs">
              <thead className={`border-b ${t.tableHead}`}><tr><th className="px-2 py-2 text-left font-black">Bucket</th><th className={th}>Hasta (≤)</th><th className={th}>PVP mín–máx vendido</th><th className={th}>Pzs 12M</th><th className={th}>Mezcla</th><th className={th}>PVP inicial prom</th><th className={th}>Neto prom</th><th className={th}>Desc. hist.</th><th className={th}>Desc. plan</th><th className={th}>Neto plan</th></tr></thead>
              <tbody>{R.bks.map((b, i) => (
                <tr key={i} className={`border-b ${t.border}`}>
                  <td className="px-2 py-1"><input value={b.name} onChange={e => set('buckets', prm.buckets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={`${inp} w-24`} /></td>
                  <td className="px-2 py-1"><input type="number" value={prm.buckets[i].top} onChange={e => set('buckets', prm.buckets.map((x, j) => (j === i ? { ...x, top: e.target.value } : x)))} className={`${inp} w-24 text-right`} /></td>
                  <td className={td}>{b.u ? `${money(b.min)}–${money(b.max)}` : '—'}</td><td className={td}>{fmt(b.u)}</td><td className={td}>{pct(b.mixH)}</td><td className={td}>{money(b.pvp)}</td><td className={td}>{money(b.neto)}</td><td className={td}>{pct(b.descH)}</td>
                  <td className="px-2 py-1"><input type="number" step={0.01} value={prm.buckets[i].desc ?? Number(b.descH.toFixed(2))} onChange={e => set('buckets', prm.buckets.map((x, j) => (j === i ? { ...x, desc: e.target.value === '' ? null : num(e.target.value) } : x)))} className={`${inp} w-20 text-right`} /></td>
                  <td className={`${td} font-black`}>{money(b.precio)}</td>
                </tr>))}</tbody>
            </table></div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead className={`border-b ${t.tableHead}`}><tr><th className="px-2 py-2 text-left font-black">Cluster</th><th className={th}>Pzs</th>{R.bks.map(b => <th key={b.name} className={th}>% {b.name}<br /><span className="font-normal">hist → final</span></th>)}{R.bks.map(b => <th key={`p${b.name}`} className={th}>Corr/tda {b.name}</th>)}<th className={th}>$ neto</th><th className={th}>$/pz</th></tr></thead>
              <tbody>{R.bk.cl.map(x => (
                <tr key={x.name} className={`border-b ${t.border} ${t.tableRow}`}>
                  <td className={`px-2 py-1.5 font-black ${x.ok ? t.textMain : t.dangerText}`}>{x.name}{!x.ok && ' ⚠'}</td><td className={td}>{fmt(x.pz)}</td>
                  {x.mixH.map((v, i) => <td key={i} className={`px-2 py-1.5 text-right ${x.mixF[i] < 0 ? t.dangerText : t.textMain}`}>{pct(v)} → <b>{pct(x.mixF[i])}</b></td>)}
                  {x.mixF.map((v, i) => <td key={`c${i}`} className={td}>{fmt1(v * x.corr)}</td>)}
                  <td className={td}>{money(x.$)}</td><td className={td}>{money(x.$ / (x.pz || 1))}</td>
                </tr>))}
                <tr className={`font-black ${t.tableHead}`}><td className="px-2 py-1.5">TOTAL</td><td className="px-2 py-1.5 text-right">{fmt(R.bk.totPz)}</td>{R.bks.map((_, i) => <td key={i} className="px-2 py-1.5 text-right">{pct(R.bk.cl.reduce((a, x) => a + x.pzB[i], 0) / (R.bk.totPz || 1))}</td>)}{R.bks.map((_, i) => <td key={`t${i}`}></td>)}<td className="px-2 py-1.5 text-right">{money(R.bk.tot$)}</td><td className="px-2 py-1.5 text-right">{money(R.bk.tot$ / (R.bk.totPz || 1))}</td></tr>
              </tbody>
            </table></div>
            {!R.bk.cl.every(x => x.ok) && <p className={`text-[11px] mt-2 ${t.dangerText}`}>Moviendo solo {R.bks[R.bk.lo].name}↔{R.bks[R.bk.hi].name} no alcanza: baja el descuento plan de algún bucket o revisa el OTB $.</p>}
          </>)}
        </div>
      </>)}
    </div>
  );
}

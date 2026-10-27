// src/modules/ModuleMargen.jsx
// Margen (Financial): dónde se mueve el margen TY vs LY. División → sección → marca → origen.
// Entrada: CSV de BigQuery (VEIL_TAB_UTILIDAD_COMPARATIVO_S, ver api/_queries.js › margen). Una fila por año × jerarquía.
// Puente exacto por segmento, en pts de venta neta: Descuento + Costo de compra + Bonificación + Merma + Financiamiento + Otros = Δ margen.
//   margen = 1 − costo/vn − bonif/vn − merma/vn − financ/vn + otros/vn ; costo/vn = (costo/precio lleno) / (vn/precio lleno)
// Contribución al total = tasa (cambio de margen del segmento) + mix (cambio de peso); suma exacta al Δ del total.
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Upload, Trash2, Database } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import MS from '../components/MultiSelect';
import FilterMenu, { FilterSection } from '../components/FilterMenu';

const LS_FILES = 'gop_margen_files', DB_NAME = 'gop_margen_db';
const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const fmtM = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)} M` : `$${Math.round(v / 1e3).toLocaleString('es-MX')} K`);
const pts = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}`);
const pc = (v, d = 1) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
const POS = '#A78BFA', NEG = '#D63F8C', LYC = '#6B5B8E'; // violeta GO / magenta GO / violeta apagado (LY)

const ALIAS = {
  anio: ['ANIO', 'AÑO', 'ANO', 'YEAR'], mes: ['MES', 'MES PERIODO'],
  div: ['DIVISION'], sec: ['SECCION'], marca: ['MARCA'], orig: ['TIPO IMPORTACION', 'ORIGEN'], tm: ['TIPO MARCA'],
  pl: ['PRECIO LLENO', 'VENTAS A PRECIO LLENO'], mkd: ['MKD', 'TOTAL MARKDOWNS'],
  vn: ['VENTA NETA', 'VENTAS NETAS'], costo: ['COSTO', 'COSTO DE LO VENDIDO'],
  bonif: ['BONIF', 'BONIFICACIONES PROVEEDOR'], merma: ['MERMA', 'PROVISION DE MERMA'],
  financ: ['FINANC', 'COSTO FINANCIAMIENTO INVENTARIOS'], ub: ['UB MERC', 'UTILIDAD BRUTA DE MERCANCIAS'],
};
const REQ = ['anio', 'vn', 'costo', 'pl', 'ub'];

function parse(text, src) {
  const wb = XLSX.read(text, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!rows.length) throw new Error('Archivo vacío');
  const col = {}; const heads = Object.keys(rows[0]);
  for (const k in ALIAS) col[k] = heads.find((h) => ALIAS[k].includes(norm(h)));
  const miss = REQ.filter((k) => !col[k]);
  if (miss.length) throw new Error(`Faltan columnas: ${miss.join(', ')}`);
  const g = (r, k) => (col[k] ? String(r[col[k]] ?? '').trim() || '(sin dato)' : '(sin dato)');
  const data = rows.map((r) => ({
    a: Math.round(num(r[col.anio])), mes: col.mes ? g(r, 'mes') : null, div: g(r, 'div'), sec: g(r, 'sec'), marca: g(r, 'marca'), orig: ((o) => (norm(o) === 'DIRECTO' ? 'Importación' : o))(g(r, 'orig')), tm: g(r, 'tm'),
    pl: num(r[col.pl]), vn: num(r[col.vn]), c: num(r[col.costo]), b: num(r[col.bonif]), me: num(r[col.merma]), f: num(r[col.financ]), ub: num(r[col.ub]),
  })).filter((r) => r.a > 2000);
  return { rows: data, src, hasMes: !!col.mes };
}

const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('data'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async (k) => { const db = await idb(); return new Promise((res) => { const q = db.transaction('data').objectStore('data').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const idbSet = async (k, v) => { const db = await idb(); return new Promise((res) => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put(v, k); tx.oncomplete = res; tx.onerror = res; }); };

const zero = () => ({ pl: 0, vn: 0, c: 0, b: 0, me: 0, f: 0, ub: 0 });
const add = (s, r) => { for (const k in s) s[k] += r[k]; };

// Ratios de un acumulado (null si no hay venta)
function ratios(s) {
  if (!s || s.vn <= 0 || s.pl <= 0) return null;
  const v = s.vn, m = s.ub / v, c = s.c / v, b = s.b / v, me = s.me / v, f = s.f / v;
  return { m, k: s.c / s.pl, d: 1 - v / s.pl, b, me, f, r: m - (1 - c - b - me - f) };
}
// Puente L → T en pts (cada término positivo suma margen)
function bridge(L, T) {
  const l = ratios(L), t = ratios(T);
  if (!l || !t) return null;
  const x = {
    desc: -l.k * (1 / (1 - t.d) - 1 / (1 - l.d)), compra: -(t.k - l.k) / (1 - t.d),
    bonif: -(t.b - l.b), merma: -(t.me - l.me), financ: -(t.f - l.f), otros: t.r - l.r,
  };
  return { ...x, total: t.m - l.m, mL: l.m, mT: t.m };
}
// Degradación sobre precio lleno: MG inicial → tras descuento → con bonif → tras merma → tras financ → UB final
function stages(s) {
  if (!s || s.pl <= 0) return null;
  const p = s.pl, s0 = 1 - s.c / p, s1 = (s.vn - s.c) / p, s2 = s1 - s.b / p, s3 = s2 - s.me / p, s4 = s3 - s.f / p, s5 = s.ub / p;
  return { ini: s0, desc: s1 - s0, bonif: s2 - s1, merma: s3 - s2, financ: s4 - s3, otros: s5 - s4, fin: s5, vn: s.vn > 0 ? s.ub / s.vn : null, cum: [s0, s1, s2, s3, s4, s5] };
}
const CAUSA = {
  desc: ['Descuento', 'Frenar rebajas / cupones; revisar eventos y letras'],
  compra: ['Costo de compra', 'Revisar IMU de OC vs PVP; reprecio o renegociar costo'],
  bonif: ['Bonificación', 'Confirmar bonificación del proveedor (cae si baja el descuento o la compra)'],
  merma: ['Merma', 'Revisar provisión y mermas por tienda'],
  financ: ['Financiamiento', 'Inventario inflado: bajar cobertura / mover nulo'],
  otros: ['Ajustes / saldos', 'Revisar ajustes de costo e inventario con Finanzas'],
};
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIMS = [['div', 'División'], ['sec', 'Sección'], ['marca', 'Marca'], ['orig', 'Origen'], ['tm', 'Tipo de marca']];
const DEG = ['MG inicial', 'Tras descto', 'Con bonif.', 'Tras merma', 'Tras financ.', 'UB final'];
const NEXT = { div: 'sec', sec: 'marca', marca: 'orig' };

export default function ModuleMargen({ t, isDark, navIcon, navLabel, navDesc }) {
  const [X, setX] = useState(null);
  const [F, setF] = useState({});
  const [dim, setDim] = useState('sec');
  const [soloBaja, setSoloBaja] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { idbGet('data').then((d) => { if (d) { setX(d); setF(defFilter(d)); } }); }, []);
  const defFilter = () => ({});

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setMsg(null); setBusy('Leyendo archivo…');
    await new Promise((r) => setTimeout(r, 30));
    try { await load(parse(await f.text(), f.name)); } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
    setBusy(null);
  };
  const load = async (d) => {
    setX(d); setF(defFilter(d)); setDim('sec'); await idbSet('data', d);
    try { localStorage.setItem(LS_FILES, JSON.stringify([d.src])); } catch {}
    const ys = [...new Set(d.rows.map((r) => r.a))].sort();
    setMsg({ ok: true, text: `${d.rows.length.toLocaleString('es-MX')} filas · años ${ys.join(', ')} · ${d.src}` });
  };
  // BigQuery (/api/bq?source=margen): año en curso vs anterior, acumulado hasta el mes de corte
  const traerBQ = async () => {
    const now = new Date(); const last = now.getMonth() === 0 ? [now.getFullYear() - 1, 12] : [now.getFullYear(), now.getMonth()];
    const inp = window.prompt('Año y mes de corte (AAAA-M). Compara contra el año anterior, acumulado ene → mes:', localStorage.getItem('gop_margen_corte') || `${last[0]}-${last[1]}`);
    const m = inp && inp.match(/^(20\d{2})[-/ ](\d{1,2})$/); if (!m || +m[2] < 1 || +m[2] > 12) { if (inp) setMsg({ ok: false, text: 'Formato: AAAA-M (ej. 2026-9)' }); return; }
    let tok = localStorage.getItem('gop_api_token') || ''; if (!tok) { tok = window.prompt('Token de GO PLANNER (GOP_API_TOKEN):') || ''; if (!tok) return; localStorage.setItem('gop_api_token', tok); }
    localStorage.setItem('gop_margen_corte', `${m[1]}-${+m[2]}`);
    setMsg(null); setBusy('Consultando BigQuery…');
    try {
      const r = await fetch(`/api/bq?source=margen&anio=${m[1]}&mes=${+m[2]}`, { headers: { 'x-gop-token': tok } });
      const txt = await r.text(); if (r.status === 401) localStorage.removeItem('gop_api_token'); if (!r.ok) throw new Error(txt);
      await load(parse(txt, `BigQuery · ene-${MES[+m[2] - 1]} ${m[1]}`));
    } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
    setBusy(null);
  };
  const clearAll = async () => { if (!confirm('¿Borrar la base de Margen?')) return; setX(null); setF({}); await idbSet('data', null); try { localStorage.removeItem(LS_FILES); } catch {} };

  const R = useMemo(() => {
    if (!X) return null;
    const years = [...new Set(X.rows.map((r) => r.a))].sort();
    const ty = years[years.length - 1], ly = ty - 1;
    if (!years.includes(ly)) return { err: `Falta el año ${ly} para comparar` };
    const pass = (r, skip) => Object.keys(F).every((k) => k === skip || !F[k]?.length || F[k].includes(r[k]));
    const rows = X.rows.filter((r) => (r.a === ty || r.a === ly) && pass(r));
    const opt = {}; // opciones en cascada: valores que existen con los demás filtros
    for (const [k] of [...DIMS, ['mes']]) { const m = {}; X.rows.filter((r) => (r.a === ty || r.a === ly) && pass(r, k)).forEach((r) => { if (r[k] != null) m[r[k]] = (m[r[k]] || 0) + Math.abs(r.vn); }); opt[k] = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([v, x]) => ({ value: v, label: v, hint: fmtM(x) })); }
    const TL = zero(), TT = zero(), by = {};
    for (const r of rows) {
      const tgt = r.a === ty ? TT : TL; add(tgt, r);
      const key = r[dim]; const o = (by[key] ||= { L: zero(), T: zero() });
      add(r.a === ty ? o.T : o.L, r);
    }
    const VL = TL.vn, VT = TT.vn, ML = TL.ub / VL;
    const list = Object.entries(by).map(([name, { L, T }]) => {
      const wL = L.vn / VL, wT = T.vn / VT, rl = ratios(L), rt = ratios(T);
      const contrib = T.ub / VT - L.ub / VL;
      const mix = rl ? (wT - wL) * (rl.m - ML) : 0;
      const br = bridge(L, T);
      let causa = null;
      if (br) { const [k, v] = Object.entries(br).filter(([k]) => CAUSA[k]).sort((a, b) => a[1] - b[1])[0]; if (v < -0.002) causa = k; }
      return { name, L, T, contrib, mix, tasa: contrib - mix, br, mL: rl?.m, mT: rt?.m, varV: L.vn > 0 ? T.vn / L.vn - 1 : null, imp$: br ? T.vn * br.total : null, causa,
        sT: stages(T), tag: L.vn <= 0 && T.vn > 0 ? 'nuevo' : T.vn <= 0 && L.vn > 0 ? 'salida' : null };
    });
    return { ty, ly, TL, TT, VL, VT, ML, MT: TT.ub / VT, list, sL: stages(TL), sT: stages(TT), br: bridge(TL, TT), opt, n: rows.length };
  }, [X, F, dim]);

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-center whitespace-nowrap select-none ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs whitespace-nowrap text-center tabular-nums';
  const col = (v) => (v == null || Math.abs(v) < 0.0005 ? undefined : v > 0 ? POS : NEG);
  const ttStyle = { contentStyle: { background: isDark ? '#1c1720' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`, borderRadius: 10, fontSize: 11 }, itemStyle: { color: isDark ? '#EDEBF2' : '#111' } };
  const axisTick = { fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' };

  const nF = Object.values(F).filter((v) => v?.length).length;
  const headerRight = (
    <>
      {R && !R.err && (
        <FilterMenu isDark={isDark} count={nF} width={640}>
          <FilterSection label="Filtros (cascada, venta neta)" isDark={isDark}>
            {DIMS.map(([k, l]) => <MS key={k} label={l} t={t} isDark={isDark} options={R.opt[k]} selected={F[k] || []} onChange={(a) => setF((s) => ({ ...s, [k]: a }))} />)}
            {X.hasMes && <MS label="Mes" t={t} isDark={isDark} options={R.opt.mes || []} selected={F.mes || []} onChange={(a) => setF((s) => ({ ...s, mes: a }))} />}
            {nF > 0 && <button onClick={() => setF({})} className={`px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>✕ Limpiar</button>}
          </FilterSection>
        </FilterMenu>
      )}
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
      <button onClick={traerBQ} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold ${t.btnGhost}`}><Database size={14} /> BigQuery</button>
      <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-bold ${t.btnGhost}`}><Upload size={14} /> CSV</button>
      {X && <button onClick={clearAll} className={`p-1.5 rounded-lg ${t.btnGhost}`} title="Borrar base"><Trash2 size={14} /></button>}
    </>
  );

  const chart = R?.br ? [['Descuento', R.br.desc], ['Costo compra', R.br.compra], ['Bonificación', R.br.bonif], ['Merma', R.br.merma], ['Financ.', R.br.financ], ['Otros', R.br.otros]].map(([name, v]) => ({ name, v: +(v * 100).toFixed(2) })) : [];
  const rows = R?.list ? R.list.filter((x) => Math.abs(x.contrib) >= 0.0005 || x.L.vn >= 1e6 || x.T.vn >= 1e6).filter((x) => !soloBaja || x.contrib < 0).sort((a, b) => a.contrib - b.contrib) : [];

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {busy && <div className={`px-3 py-2 rounded-lg border text-xs ${t.warningBg}`}>{busy}</div>}
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {!X && (
        <div className={`${card} text-center py-16`}>
          <Upload className="mx-auto mb-3 opacity-60" size={28} />
          <p className={`font-bold ${t.text}`}>Carga el CSV de margen</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Se guarda localmente (IndexedDB) y sobrevive al refresh.</p>
        </div>
      )}
      {R?.err && <div className={`px-3 py-2 rounded-lg border text-xs ${t.dangerBg}`}>{R.err}</div>}
      {R && !R.err && (
        <>
          {nF > 0 && (
            <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${t.textMuted}`}>
              {DIMS.filter(([k]) => F[k]?.length).map(([k, l]) => <button key={k} onClick={() => setF((s) => ({ ...s, [k]: [] }))} className={`px-2 py-0.5 rounded-md border font-bold ${t.badge || ''}`} title="Quitar filtro">{F[k].length === 1 ? F[k][0] : `${l}: ${F[k].length}`} ✕</button>)}
              <span className="ml-auto">{R.ty} vs {R.ly} · {R.n.toLocaleString('es-MX')} filas</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[[`Margen ${R.ly}`, pc(R.ML), null], [`Margen ${R.ty}`, pc(R.MT), null], ['Δ pts', pts(R.MT - R.ML), col(R.MT - R.ML)], ['Impacto UB', `${R.MT - R.ML >= 0 ? '+' : '-'}${fmtM(Math.abs((R.MT - R.ML) * R.VT))}`, col(R.MT - R.ML)]].map(([l, v, c]) => (
              <div key={l} className={`${card} text-center`}>
                <div className={`text-[10px] font-bold uppercase ${t.textMuted}`}>{l}</div>
                <div className="text-2xl font-black tabular-nums" style={{ color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
          <div className={card}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className={`text-sm font-black ${t.text}`}>Puente de margen (pts de venta neta)</h3>
                <span className={`text-[10px] ${t.textMuted}`}>+ = ayuda al margen (p. ej. costo o financiamiento más bajos) · incluye mix</span>
              </div>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <BarChart data={chart} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} />
                    <ReferenceLine y={0} stroke={isDark ? '#4b4458' : '#d1d5db'} />
                    <Tooltip {...ttStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }} formatter={(v) => [`${v > 0 ? '+' : ''}${v} pts`, 'Efecto']} />
                    <Bar isAnimationActive={false} dataKey="v" radius={[4, 4, 4, 4]} label={{ position: 'top', fontSize: 10, fill: isDark ? '#cbd5e1' : '#475569', formatter: (v) => (v > 0 ? `+${v}` : v) }}>
                      {chart.map((d, i) => <Cell key={i} fill={d.v >= 0 ? POS : NEG} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={card}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className={`text-sm font-black ${t.text}`}>MG inicial y cómo se degrada (% de precio lleno)</h3>
                <span className={`text-[10px] ${t.textMuted}`}>Venta {R.ly}→{R.ty}: {pc(R.VT / R.VL - 1)}</span>
              </div>
              <div style={{ height: 170 }}>
                <ResponsiveContainer>
                  <BarChart data={DEG.map((n, i) => ({ name: n, [R.ly]: R.sL ? +(R.sL.cum[i] * 100).toFixed(1) : 0, [R.ty]: R.sT ? +(R.sT.cum[i] * 100).toFixed(1) : 0 }))} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} unit="%" />
                    <Tooltip {...ttStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6' }} formatter={(v) => `${v}%`} />
                    <Bar isAnimationActive={false} dataKey={String(R.ly)} fill={LYC} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: isDark ? '#948FA0' : '#6b7280' }} />
                    <Bar isAnimationActive={false} dataKey={String(R.ty)} fill={POS} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: isDark ? '#cbd5e1' : '#475569' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="w-full mt-2">
                <thead><tr><th className={`${th} !text-left`}>Paso (pts s/ precio lleno)</th><th className={th}>{R.ly}</th><th className={th}>{R.ty}</th><th className={th}>Δ</th></tr></thead>
                <tbody>
                  {[['MG inicial', 'ini', true], ['Descuento', 'desc'], ['Bonificación', 'bonif'], ['Merma', 'merma'], ['Financiamiento', 'financ'], ['Otros', 'otros'], ['UB s/ precio lleno', 'fin', true], ['UB s/ venta neta', 'vn', true]].map(([l, k, bold]) => {
                    const a = R.sL?.[k], b = R.sT?.[k], dl = a != null && b != null ? b - a : null;
                    return (
                      <tr key={k} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'} ${bold ? 'font-black' : ''}`}>
                        <td className={`${td} !text-left ${t.text}`}>{l}</td>
                        <td className={`${td} ${t.text}`}>{bold ? pc(a) : pts(a)}</td><td className={`${td} ${t.text}`}>{bold ? pc(b) : pts(b)}</td>
                        <td className={td} style={{ color: col(dl) }}>{pts(dl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={card}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
                {DIMS.map(([k, l]) => <button key={k} onClick={() => setDim(k)} className={`px-3 py-1 text-xs rounded-md ${dim === k ? t.toggleActive : t.textMuted}`}>{l}</button>)}
              </div>
              <label className={`flex items-center gap-1 text-xs ${t.textMuted}`}><input type="checkbox" checked={soloBaja} onChange={(e) => setSoloBaja(e.target.checked)} /> Solo a la baja</label>
              <span className={`ml-auto text-[10px] ${t.textMuted}`}>Clic en una fila para bajar un nivel · ordenado por contribución al total</span>
            </div>
            <div className="overflow-auto max-h-[560px]">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={`${th} !text-left`}>{DIMS.find((d) => d[0] === dim)[1]}</th>
                    {['Venta TY', 'Var %', `Mg ${R.ly}`, `Mg ${R.ty}`, 'MG ini', 'Degrad.', 'Δ pts', 'Contrib.', 'Mix', 'Impacto UB', 'Descto', 'Compra', 'Bonif', 'Merma', 'Financ', 'Otros'].map((h) => <th key={h} className={th}>{h}</th>)}
                    <th className={`${th} !text-left`}>Causa → acción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`font-black ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                    <td className={`${td} !text-left ${t.text}`}>Total</td>
                    <td className={`${td} ${t.text}`}>{fmtM(R.VT)}</td><td className={`${td} ${t.text}`}>{pc(R.VT / R.VL - 1)}</td>
                    <td className={`${td} ${t.text}`}>{pc(R.ML)}</td><td className={`${td} ${t.text}`}>{pc(R.MT)}</td>
                    <td className={`${td} ${t.text}`}>{pc(R.sT?.ini)}</td><td className={td}>{pts(R.sT ? R.sT.fin - R.sT.ini : null)}</td>
                    <td className={td} style={{ color: col(R.MT - R.ML) }}>{pts(R.MT - R.ML)}</td>
                    <td className={td} style={{ color: col(R.MT - R.ML) }}>{pts(R.MT - R.ML)}</td>
                    <td className={td}>{pts(R.list.reduce((s, x) => s + x.mix, 0))}</td>
                    <td className={td} style={{ color: col(R.MT - R.ML) }}>{fmtM((R.MT - R.ML) * R.VT)}</td>
                    {['desc', 'compra', 'bonif', 'merma', 'financ', 'otros'].map((k) => <td key={k} className={td} style={{ color: col(R.br?.[k]) }}>{pts(R.br?.[k])}</td>)}
                    <td />
                  </tr>
                  {rows.map((x) => (
                    <tr key={x.name} onClick={() => NEXT[dim] && (setF((s) => ({ ...s, [dim]: [x.name] })), setDim(NEXT[dim]))} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'} ${t.tableRow} ${NEXT[dim] ? 'cursor-pointer' : ''}`}>
                      <td className={`${td} !text-left font-bold ${t.text} max-w-[240px] truncate`} title={x.name}>
                        {x.name}{x.tag && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black ${x.tag === 'salida' ? 'bg-amber-500/20 text-amber-500' : 'bg-sky-500/20 text-sky-500'}`}>{x.tag}</span>}
                      </td>
                      <td className={`${td} ${t.text}`}>{fmtM(x.T.vn)}</td>
                      <td className={td} style={{ color: col(x.varV) }}>{pc(x.varV)}</td>
                      <td className={`${td} ${t.text}`}>{pc(x.mL)}</td><td className={`${td} ${t.text}`}>{pc(x.mT)}</td>
                      <td className={`${td} ${t.text}`}>{pc(x.sT?.ini)}</td><td className={td}>{pts(x.sT ? x.sT.fin - x.sT.ini : null)}</td>
                      <td className={`${td} font-bold`} style={{ color: col(x.br?.total) }}>{pts(x.br?.total)}</td>
                      <td className={`${td} font-black`} style={{ color: col(x.contrib) }}>{pts(x.contrib)}</td>
                      <td className={td} style={{ color: col(x.mix) }}>{pts(x.mix)}</td>
                      <td className={td} style={{ color: col(x.imp$) }}>{x.imp$ == null ? '—' : `${x.imp$ >= 0 ? '+' : '-'}${fmtM(Math.abs(x.imp$))}`}</td>
                      {['desc', 'compra', 'bonif', 'merma', 'financ', 'otros'].map((k) => <td key={k} className={td} style={{ color: col(x.br?.[k]) }}>{pts(x.br?.[k])}</td>)}
                      <td className={`${td} !text-left text-[11px] ${t.textMuted}`} title={x.causa ? CAUSA[x.causa][1] : ''}>{x.causa ? <><b className={t.text}>{CAUSA[x.causa][0]}</b> → {CAUSA[x.causa][1]}</> : x.tag === 'salida' ? 'Marca en salida' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-[10px] mt-2 ${t.textMuted}`}>
              Descto = menor/mayor descuento (precio lleno → venta neta). Compra = costo ÷ precio lleno (IMU de compra y mezcla). Bonif/Merma/Financ = % sobre venta neta. Otros = ajustes y saldos de costo. Los efectos de cada fila son propios del segmento (pts de su venta); Contrib. = su aporte al Δ del total (tasa + mix) y suma exacta.
              MG ini = 1 − costo ÷ precio lleno; Degrad. = UB ÷ precio lleno − MG ini (lo que se pierde en descuento, merma y financiamiento, neto de bonificación). La bonificación es mensual y se calcula sobre costo (crece con el descuento); una marca descontinuada ya no bonifica.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// src/modules/ModuleDemanda.jsx
// Diagnóstico de demanda (Demand Planner): tipo de demanda por modelo (Suave / Errático / Intermitente / Irregular)
// y accionable (Básico, Temporada, Falla de inventario, No sirve). Lógica en utils/demandaEngine.js.
// Escribe `gop_demanda_diag` (modelo → acción) para que Nulo Movimiento lo muestre en su detalle.
import { useState, useEffect, useMemo, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, ComposedChart, Bar, Line, CartesianGrid } from 'recharts';
import { Upload, Download, Trash2, Search, ChevronDown } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import FilterMenu, { FilterSection } from '../components/FilterMenu';
import { parseDemanda, diagnosticar, mensual, TIPOS, TIPO_INFO, ACCIONES, ACCION_INFO, MIN_VIDA } from '../utils/demandaEngine';

const LS_FILES = 'gop_demanda_files', LS_DIAG = 'gop_demanda_diag', DB_NAME = 'gop_demanda_db';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore('data'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async (k) => { const db = await idb(); return new Promise((res) => { const q = db.transaction('data').objectStore('data').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const idbSet = async (k, v) => { const db = await idb(); return new Promise((res) => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put(v, k); tx.oncomplete = res; tx.onerror = res; }); };

const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const fmt$ = (v) => (v == null || !isFinite(v) ? '—' : `$${Math.round(v).toLocaleString('es-MX')}`);
const pct = (v) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(0)}%`);
const dec = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const mesTxt = (k) => `${MESES[+k.slice(5) - 1]} ${k.slice(2, 4)}`;
const nrm = (s) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const downloadCSV = (name, lines) => { const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

const FILTERS = [['sec', 'Sección'], ['goa', 'GOA'], ['marca', 'Marca'], ['temp', 'Temporada'], ['estado', 'Regular / liquidado'], ['tipo', 'Tipo de demanda'], ['accion', 'Accionable']];
const val = (r, k) => (k === 'estado' ? (r.liq ? 'Liquidado (con letra)' : 'Regular') : k === 'tipo' ? (r.tipo || '—') : k === 'accion' ? r.accion : r.m[k]);

function MultiSelect({ label, options, sel, onChange, t, isDark, inCls }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), ref = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const shown = options.filter((o) => (o.n > 0 || sel.has(o.v)) && (!q || nrm(o.v).includes(nrm(q))));
  const toggle = (v) => { const nx = new Set(sel); nx.has(v) ? nx.delete(v) : nx.add(v); onChange(nx); };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center justify-between gap-2 w-44 ${inCls} ${sel.size ? (isDark ? '!border-violet-400/60 text-violet-300' : '!border-violet-400 text-violet-700') : ''}`}>
        <span className="truncate">{sel.size ? (sel.size === 1 ? [...sel][0] : `${sel.size} seleccionados`) : `${label}: Todos`}</span><ChevronDown size={12} />
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 w-72 rounded-xl border p-2 ${t.menuBg}`}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className={`w-full mb-2 ${inCls}`} />
          <button onClick={() => onChange(new Set())} className={`text-[10px] mb-1 ${t.textMuted}`}>Limpiar</button>
          <div className="max-h-64 overflow-auto">
            {shown.map((o) => (
              <label key={o.v} className={`flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer ${t.tableRow} ${t.text}`}>
                <input type="checkbox" checked={sel.has(o.v)} onChange={() => toggle(o.v)} className="accent-violet-500" />
                <span className="flex-1 truncate">{o.v}</span><span className={`tabular-nums text-[10px] ${t.textMuted}`}>{fmt(o.n)}</span>
              </label>
            ))}
            {!shown.length && <p className={`text-xs px-1 py-2 ${t.textMuted}`}>Sin opciones</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModuleDemanda({ t, isDark, navIcon, navLabel, navDesc }) {
  const [X, setX] = useState(null);
  const [tab, setTab] = useState('tipos');
  const [F, setF] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('No sirve');
  const [sel, setSel] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { idbGet('data').then((d) => d && setX(d)); }, []);
  const R = useMemo(() => (X ? diagnosticar(X) : null), [X]);
  useEffect(() => { if (R) try { localStorage.setItem(LS_DIAG, JSON.stringify(Object.fromEntries(R.map((r) => [r.m.k, r.accion])))); } catch {} }, [R]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setMsg(null); setBusy('Leyendo CSV…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const d = parseDemanda(await f.text(), f.name);
      setX(d); setF({}); setSel(''); await idbSet('data', d);
      try { localStorage.setItem(LS_FILES, JSON.stringify([f.name])); } catch {}
      setMsg({ ok: true, text: `${fmt(d.M.length)} modelos · ${d.W.length} semanas (${d.W[0]} a ${d.W[d.W.length - 1]})` });
    } catch (err) { setMsg({ ok: false, text: `Error: ${err.message}` }); }
    setBusy(null);
  };
  const clearAll = async () => { if (!confirm('¿Borrar la base de Diagnóstico de demanda?')) return; setX(null); setF({}); await idbSet('data', null); try { localStorage.removeItem(LS_FILES); localStorage.removeItem(LS_DIAG); } catch {} };

  // Filtros en cascada: cada opción cuenta modelos que pasan los demás filtros
  const active = FILTERS.map((f) => f[0]).filter((k) => F[k]?.size);
  const pass = (r, skip) => active.every((k) => k === skip || F[k].has(val(r, k)));
  const rows = useMemo(() => (R ? R.filter((r) => pass(r)) : []), [R, F]);
  const opts = useMemo(() => {
    if (!R) return {};
    const o = Object.fromEntries(FILTERS.map(([k]) => [k, new Map()]));
    R.forEach((r) => FILTERS.forEach(([k]) => { const v = val(r, k), m = o[k]; if (!m.has(v)) m.set(v, 0); if (pass(r, k)) m.set(v, m.get(v) + 1); }));
    return Object.fromEntries(Object.entries(o).map(([k, m]) => [k, [...m].map(([v, n]) => ({ v, n })).sort((a, b) => b.n - a.n)]));
  }, [R, F]);
  const setDim = (k, s) => setF((p) => ({ ...p, [k]: s }));

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left whitespace-nowrap ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs whitespace-nowrap';
  const inCls = `px-2 py-1 text-xs rounded-lg border focus:outline-none focus:ring-1 ${t.input}`;
  const ttStyle = { contentStyle: { background: isDark ? '#1c1720' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`, borderRadius: 10, fontSize: 11 }, itemStyle: { color: isDark ? '#EDEBF2' : '#111' } };
  const axisTick = { fontSize: 10, fill: isDark ? '#948FA0' : '#6b7280' };
  const grid = isDark ? 'rgba(255,255,255,0.06)' : '#eef0f3';

  const totU = rows.reduce((s, r) => s + r.totU, 0);
  const searched = useMemo(() => { const s = nrm(q); return s ? rows.filter((r) => nrm(`${r.m.k} ${r.m.marca} ${r.m.goa}`).includes(s)) : rows; }, [rows, q]);
  const verModelo = (k) => { setSel(k); setTab('detalle'); };

  const headerRight = (
    <>
      {R && (
        <FilterMenu isDark={isDark} count={active.length} width={640}>
          <FilterSection label="Filtros (cascada, # modelos)" isDark={isDark}>
            {FILTERS.map(([k, l]) => <MultiSelect key={k} label={l} t={t} isDark={isDark} inCls={inCls} sel={F[k] || new Set()} onChange={(s) => setDim(k, s)} options={opts[k] || []} />)}
            {active.length > 0 && <button onClick={() => setF({})} className={`px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>✕ Limpiar</button>}
          </FilterSection>
        </FilterMenu>
      )}
      <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-bold ${t.btn} disabled:opacity-50`}><Upload size={14} />Cargar CSV</button>
      <button onClick={clearAll} className={`p-2 rounded-lg border ${t.btnDanger}`} title="Borrar base"><Trash2 size={14} /></button>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/comma-separated-values,text/plain,application/vnd.ms-excel" className="hidden" onChange={onFile} />
    </>
  );

  const ModelTable = ({ list, cols, limit = 300 }) => (
    <div className="overflow-auto max-h-[60vh]">
      <table className="w-full">
        <thead className="sticky top-0 z-10"><tr>{cols.map(([l, , right]) => <th key={l} className={`${th} ${right ? '!text-right' : ''}`}>{l}</th>)}</tr></thead>
        <tbody>
          {list.slice(0, limit).map((r) => (
            <tr key={r.m.k} onClick={() => verModelo(r.m.k)} className={`border-t cursor-pointer ${t.border} ${t.tableRow}`}>
              {cols.map(([l, f, right]) => { const v = f(r); return <td key={l} className={`${td} ${right ? 'text-right tabular-nums' : ''} ${l === 'Por qué' ? 'max-w-[360px] truncate' : ''} ${l === 'Modelo' ? `font-bold ${t.accent1}` : t.text}`} title={l === 'Por qué' ? v : undefined}>{v}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > limit && <p className={`mt-2 text-[10px] ${t.textMuted}`}>Mostrando {limit} de {fmt(list.length)}: usa filtros o búsqueda, o baja el CSV.</p>}
    </div>
  );
  const Pill = ({ txt, color }) => <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${color}26`, color }}>{txt}</span>;
  const COLS_BASE = [
    ['Modelo', (r) => r.m.k], ['GOA', (r) => r.m.goa], ['Marca', (r) => r.m.marca], ['Temporada', (r) => r.m.temp],
    ['Letra', (r) => (r.liq ? r.m.letra : 'Regular')],
    ['Tipo', (r) => (r.tipo ? <Pill txt={r.tipo} color={TIPO_INFO[r.tipo].color} /> : '—')],
  ];
  const COLS_TIPOS = [...COLS_BASE, ['ADI', (r) => dec(r.adi), 1], ['CV²', (r) => dec(r.cv2), 1], ['Sem c/vta', (r) => fmt(r.nSale), 1], ['Venta u', (r) => fmt(r.totU), 1], ['Prom. sem.', (r) => dec(r.vps, 1), 1], ['Accionable', (r) => <Pill txt={r.accion} color={ACCION_INFO[r.accion].color} />]];
  const COLS_ACC = [...COLS_BASE, ['Venta u', (r) => fmt(r.totU), 1], ['Venta $', (r) => fmt$(r.totP), 1], ['× mediana GOA', (r) => dec(r.idx, 1), 1], ['% u c/desc', (r) => pct(r.desc), 1], ['Sem. sin vender', (r) => fmt(r.last), 1], ['Por qué', (r) => r.porque]];

  const exportBucket = () => {
    const list = rows.filter((r) => r.accion === bucket).sort((a, b) => b.totU - a.totU);
    downloadCSV(`Diagnostico_${bucket.replace(/[ /]+/g, '_')}.csv`, [
      ['Modelo', 'Sección', 'GOA', 'Marca', 'Temporada', 'Letra', 'Tipo de demanda', 'ADI', 'CV2', 'Semanas con venta', 'Venta u', 'Venta $', 'Prom. semanal', 'x mediana GOA', '% u con desc', 'Semanas sin vender', 'Accionable', 'Acción', 'Por qué'].join(','),
      ...list.map((r) => [r.m.k, r.m.sec, r.m.goa, r.m.marca, r.m.temp, r.m.letra, r.tipo || '', dec(r.adi), dec(r.cv2), r.nSale, r.totU, Math.round(r.totP), dec(r.vps, 1), dec(r.idx, 2), pct(r.desc), r.last ?? '', r.accion, ACCION_INFO[r.accion].accion, r.porque].map(csvCell).join(',')),
    ]);
  };

  // ── Detalle mensual ──
  const cur = R && (R.find((r) => r.m.k === sel) || [...rows].sort((a, b) => b.totU - a.totU)[0]);
  const mens = useMemo(() => (X && cur ? mensual(X, cur.m) : []), [X, cur]);
  const goaCtx = useMemo(() => {
    if (!R || !cur) return null;
    const g = R.filter((r) => r.m.goa === cur.m.goa && r.nSale > 0), eleg = g.filter((r) => r.vida >= MIN_VIDA).sort((a, b) => b.vps - a.vps);
    const pos = eleg.findIndex((r) => r === cur);
    return { n: g.length, liq: g.filter((r) => r.liq).length, pos: pos >= 0 ? pos + 1 : null, nEleg: eleg.length, acc: ACCIONES.map((a) => [a, g.filter((r) => r.accion === a).length]).filter((x) => x[1]) };
  }, [R, cur]);

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {busy && <div className={`px-3 py-2 rounded-lg border text-xs ${t.warningBg}`}>{busy}</div>}
      {msg && <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}><span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button></div>}

      <div className={`flex gap-4 border-b ${t.border}`}>
        {[['tipos', 'Tipos de demanda'], ['acciones', 'Accionables'], ['detalle', 'Detalle mensual']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`pb-2 text-sm font-bold border-b-2 ${tab === id ? t.tabActive : t.tabInactive}`}>{l}</button>
        ))}
        {X && <span className={`ml-auto self-center text-[10px] ${t.textMuted}`}>{fmt(rows.length)} modelos · {X.W[0]} a {X.W[X.W.length - 1]}</span>}
      </div>

      {!X ? (
        <div className={`${card} text-center py-16`}>
          <Upload size={28} className={`mx-auto mb-3 ${t.textMuted}`} />
          <p className={`font-bold ${t.text}`}>Carga el CSV de BigQuery (modelo × semana)</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Columnas: SEMANA, SECCION, GOA, MARCA, MODELO, TEMPORADA, LETRA_ACTUAL, VTA_U, VTA_U_DESC, VTA_P, DESC_P, TIENDAS_CON_VTA, TIENDAS_ACTIVAS.</p>
          <p className={`text-[10px] mt-1 ${t.textMuted}`}>Mínimo {MIN_VIDA} semanas de historia para clasificar. Se guarda en IndexedDB.</p>
        </div>
      ) : tab === 'tipos' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TIPOS.map((tp) => {
              const l = rows.filter((r) => r.tipo === tp && r.vida >= MIN_VIDA), u = l.reduce((s, r) => s + r.totU, 0), on = F.tipo?.has(tp);
              return (
                <button key={tp} onClick={() => setDim('tipo', on ? new Set() : new Set([tp]))} className={`${card} text-left ${on ? '!border-violet-400' : ''}`}>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TIPO_INFO[tp].color }} /><p className={`text-sm font-black ${t.text}`}>{tp}</p></div>
                  <p className={`text-3xl font-black mt-1 tabular-nums ${t.text}`}>{fmt(l.length)}<span className={`text-xs font-bold ml-1 ${t.textMuted}`}>modelos · {pct(totU ? u / totU : null)} de la venta</span></p>
                  <p className={`text-[10px] mt-1 ${t.textMuted}`}>{TIPO_INFO[tp].regla} · {TIPO_INFO[tp].txt}</p>
                </button>
              );
            })}
          </div>
          <div className={card}>
            <p className={`text-xs font-bold mb-1 ${t.text}`}>ADI vs CV² por modelo <span className={`font-normal ${t.textMuted}`}>· tamaño = venta · clic abre su detalle · solo modelos con ≥ {MIN_VIDA} semanas</span></p>
            <div className="h-[340px]">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke={grid} />
                  <XAxis type="number" dataKey="x" name="ADI" domain={[1, 6]} allowDataOverflow tick={axisTick} label={{ value: 'ADI (semanas entre ventas)', position: 'insideBottom', offset: -8, fontSize: 10, fill: axisTick.fill }} />
                  <YAxis type="number" dataKey="y" name="CV²" domain={[0, 3]} allowDataOverflow tick={axisTick} width={32} />
                  <ZAxis type="number" dataKey="z" range={[12, 260]} />
                  <ReferenceLine x={1.32} stroke={axisTick.fill} strokeDasharray="4 4" />
                  <ReferenceLine y={0.49} stroke={axisTick.fill} strokeDasharray="4 4" />
                  <Tooltip {...ttStyle} cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { const p = payload?.[0]?.payload; return p ? <div style={ttStyle.contentStyle} className="px-2 py-1"><b>{p.k}</b><br />{p.goa} · {p.tipo}<br />ADI {dec(p.x)} · CV² {dec(p.y)} · {fmt(p.u)} u</div> : null; }} />
                  <Scatter isAnimationActive={false} data={rows.filter((r) => r.tipo && r.vida >= MIN_VIDA).map((r) => ({ x: Math.min(r.adi, 6), y: Math.min(r.cv2, 3), z: r.totU, k: r.m.k, goa: r.m.goa, tipo: r.tipo, u: r.totU }))} onClick={(p) => verModelo(p.k)} cursor="pointer">
                    {rows.filter((r) => r.tipo && r.vida >= MIN_VIDA).map((r) => <Cell key={r.m.k} fill={TIPO_INFO[r.tipo].color} fillOpacity={0.7} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={card}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="relative">
                <Search size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modelo, marca, GOA…" className={`w-64 ${inCls} !pl-6`} />
              </div>
              <span className={`text-xs ${t.textMuted}`}>{fmt(searched.length)} modelos, ordenados por venta</span>
            </div>
            <ModelTable list={[...searched].sort((a, b) => b.totU - a.totU)} cols={COLS_TIPOS} />
          </div>
        </>
      ) : tab === 'acciones' ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {ACCIONES.map((a) => {
              const l = rows.filter((r) => r.accion === a), u = l.reduce((s, r) => s + r.totU, 0);
              return (
                <button key={a} onClick={() => setBucket(a)} className={`${card} text-left ${bucket === a ? '!border-violet-400' : ''}`}>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: ACCION_INFO[a].color }} /><p className={`text-xs font-black ${t.text}`}>{a}</p></div>
                  <p className={`text-2xl font-black mt-1 tabular-nums ${t.text}`}>{fmt(l.length)}</p>
                  <p className={`text-[10px] ${t.textMuted}`}>{pct(totU ? u / totU : null)} de la venta u</p>
                  <p className={`text-[10px] mt-1 ${t.textMuted}`}>{ACCION_INFO[a].accion}</p>
                </button>
              );
            })}
          </div>
          <div className={card}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`text-sm font-black ${t.text}`}>{bucket}</span>
              <span className={`text-xs ${t.textMuted}`}>· {ACCION_INFO[bucket].accion}</span>
              <button onClick={exportBucket} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${t.btnSec}`}><Download size={12} />CSV</button>
            </div>
            <ModelTable list={rows.filter((r) => r.accion === bucket).sort((a, b) => b.totU - a.totU)} cols={COLS_ACC} />
            <p className={`mt-2 text-[10px] ${t.textMuted}`}>Sin OH histórico, "Falla de inventario" es sospecha: se infiere cuando un modelo que vendía bien se corta de golpe sin rebaja, o cuando se vende en menos tiendas con la misma venta por tienda. "No sirve" ya se marca en el detalle de Nulo Movimiento.</p>
          </div>
        </>
      ) : cur && (
        <>
          <div className={`${card} flex flex-wrap items-center gap-3`}>
            <input list="dem-modelos" value={sel || cur.m.k} onChange={(e) => setSel(e.target.value)} onFocus={(e) => e.target.select()} className={`w-60 ${inCls}`} placeholder="Busca un modelo…" />
            <datalist id="dem-modelos">{[...rows].sort((a, b) => b.totU - a.totU).slice(0, 800).map((r) => <option key={r.m.k} value={r.m.k}>{`${r.m.goa} · ${r.m.marca}`}</option>)}</datalist>
            <span className={`text-xs ${t.textMuted}`}>{cur.m.sec} · {cur.m.goa} · {cur.m.marca} · {cur.m.temp}</span>
            <Pill txt={cur.liq ? `Liquidado · ${cur.m.letra}` : 'Regular'} color={cur.liq ? '#D63F8C' : '#34d399'} />
            {cur.tipo && <Pill txt={cur.tipo} color={TIPO_INFO[cur.tipo].color} />}
            <Pill txt={cur.accion} color={ACCION_INFO[cur.accion].color} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[['Venta u', fmt(cur.totU)], ['Venta $', fmt$(cur.totP)], ['Prom. semanal', dec(cur.vps, 1)], ['× mediana del GOA', dec(cur.idx, 1)], ['% u con descuento', pct(cur.desc)], ['Semanas con venta', `${fmt(cur.nSale)} de ${fmt(cur.vida)}`]].map(([l, v]) => (
              <div key={l} className={`${card} text-center`}><p className={`text-[10px] font-bold uppercase tracking-wide ${t.textMuted}`}>{l}</p><p className={`text-xl font-black mt-1 tabular-nums ${t.text}`}>{v}</p></div>
            ))}
          </div>
          <div className={`${card} text-xs ${t.text}`}><b>{ACCION_INFO[cur.accion].accion}.</b> <span className={t.textMuted}>{cur.porque}.</span></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            <div className={`${card} lg:col-span-2`}>
              <p className={`text-xs font-bold mb-1 ${t.text}`}>Venta mensual <span className={`font-normal ${t.textMuted}`}>· barras = unidades · línea = % de unidades con descuento</span></p>
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <ComposedChart data={mens.map((o) => ({ ...o, mes: mesTxt(o.mes) }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="mes" tick={axisTick} interval={1} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="u" tick={axisTick} width={40} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="d" orientation="right" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={axisTick} width={36} axisLine={false} tickLine={false} />
                    <Tooltip {...ttStyle} formatter={(v, k) => (k === 'pDesc' ? [pct(v), '% u c/desc'] : [fmt(v), 'Venta u'])} />
                    <Bar yAxisId="u" dataKey="u" fill="#8A73AD" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="d" dataKey="pDesc" stroke="#D63F8C" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            {goaCtx && (
              <div className={card}>
                <p className={`text-xs font-bold mb-2 ${t.text}`}>Contexto del GOA · {cur.m.goa}</p>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  {[['Modelos', goaCtx.n], ['Regulares', goaCtx.n - goaCtx.liq], ['Liquidados', goaCtx.liq]].map(([l, v]) => (
                    <div key={l} className={`rounded-xl border p-2 ${t.cardInner}`}><p className={`text-[10px] ${t.textMuted}`}>{l}</p><p className={`text-lg font-black tabular-nums ${t.text}`}>{fmt(v)}</p></div>
                  ))}
                </div>
                <p className={`text-xs ${t.text}`}>Lugar por venta semanal: <b>{goaCtx.pos ? `#${goaCtx.pos} de ${goaCtx.nEleg}` : `— (menos de ${MIN_VIDA} sem)`}</b></p>
                <div className="mt-2 space-y-1">
                  {goaCtx.acc.map(([a, n]) => <div key={a} className="flex items-center gap-2 text-[11px]"><span className="w-2 h-2 rounded-full" style={{ background: ACCION_INFO[a].color }} /><span className={`flex-1 ${t.textMuted}`}>{a}</span><span className={`tabular-nums ${t.text}`}>{fmt(n)}</span></div>)}
                </div>
              </div>
            )}
          </div>
          <div className={card}>
            <div className="overflow-auto max-h-[50vh]">
              <table className="w-full">
                <thead className="sticky top-0"><tr>{['Mes', 'Venta u', 'Venta $', 'Descuento $', '% u con desc', 'Tiendas c/vta (prom. sem.)'].map((h, i) => <th key={h} className={`${th} ${i ? '!text-right' : ''}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...mens].reverse().map((o) => (
                    <tr key={o.mes} className={`border-t ${t.border} ${t.tableRow}`}>
                      <td className={`${td} font-bold ${t.text}`}>{mesTxt(o.mes)}</td>
                      {[fmt(o.u), fmt$(o.p), fmt$(o.dp), pct(o.u ? o.pDesc : null), dec(o.tiendas, 0)].map((v, i) => <td key={i} className={`${td} text-right tabular-nums ${t.text}`}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

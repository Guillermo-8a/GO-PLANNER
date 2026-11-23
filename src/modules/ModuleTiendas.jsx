// src/modules/ModuleTiendas.jsx
// Mapa de tiendas: ubica cada tienda (Google Places vía /api/places), detecta si está en plaza o junto a un Walmart
// y cuenta los puntos de interés a 1 y 3 km (hospital, escuela, universidad, parque, deportivo, estadio, playa, metro…).
// Con eso arma el perfil de cercanía de la tienda (para clusterizar) y el producto que no debe faltar ahí.
// Entrada: CSV/Excel con CENTRO, TIENDA y LAT/LNG (o DIRECCION para ubicarla). Se guarda en localStorage.
import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Trash2, Settings, Search, MapPin, Play, Square, ExternalLink } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import FilterMenu, { FilterSection } from '../components/FilterMenu';
import MS from '../components/MultiSelect';

const LS = 'gop_tiendas';
const R1 = 1000, R3 = 3000;

// Categorías de punto de interés → tipos de Google Places (Table A). anchor = basta 1 a ≤1 km para marcar perfil.
const CATS = [
  { id: 'plaza', label: 'Plaza', types: ['shopping_mall'], color: '#8b5cf6', prod: 'Moda / tendencia' },
  { id: 'super', label: 'Autoservicio', types: ['supermarket', 'hypermarket', 'warehouse_store'], color: '#0ea5e9', prod: 'Básicos familiares' },
  { id: 'hospital', label: 'Hospital', types: ['hospital'], color: '#ef4444', anchor: true, prod: 'Confort / clínico, uniformes' },
  { id: 'escuela', label: 'Escuela', types: ['school', 'primary_school', 'secondary_school', 'preschool'], color: '#f59e0b', prod: 'Escolar (colegial, mochilas)' },
  { id: 'universidad', label: 'Universidad', types: ['university'], color: '#6366f1', anchor: true, prod: 'Tenis casual / moda joven' },
  { id: 'parque', label: 'Parque', types: ['park'], color: '#22c55e', prod: 'Tenis / sandalia casual' },
  { id: 'deportivo', label: 'Deportivo', types: ['sports_complex', 'athletic_field', 'sports_club'], color: '#14b8a6', prod: 'Tenis deportivo / running' },
  { id: 'estadio', label: 'Estadio', types: ['stadium', 'arena'], color: '#e11d48', anchor: true, prod: 'Jerseys / deportivo de temporada' },
  { id: 'playa', label: 'Playa', types: ['beach'], color: '#06b6d4', anchor: true, prod: 'Sandalias, huaraches, trajes de baño' },
  { id: 'metro', label: 'Metro / transporte', types: ['subway_station', 'train_station', 'light_rail_station', 'bus_station'], color: '#a16207', prod: 'Confort / trabajo, alta rotación' },
  { id: 'turismo', label: 'Turismo', types: ['tourist_attraction'], color: '#d946ef', prod: 'Sandalia, maletas, souvenir' },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const WALMART = /walmart|bodega aurrer|aurrera|sam'?s club|superama/i;

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.]+/g, ' ').replace(/\s+/g, ' ');
const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')));
const ctr = (v) => { const s = String(v ?? '').trim(); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; };
const km = (m) => (m == null ? '—' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const ALIAS = {
  centro: ['CENTRO', 'ID CENTRO', 'CVE CENTRO', 'NUM TIENDA', 'NO TIENDA'],
  tienda: ['TIENDA', 'NOMBRE', 'NOMBRE TIENDA', 'NOMBRE CENTRO', 'DESC CENTRO'],
  lat: ['LAT', 'LATITUD', 'LATITUDE'], lng: ['LNG', 'LON', 'LONG', 'LONGITUD', 'LONGITUDE'],
  coords: ['COORDENADAS', 'COORDS', 'UBICACION'],
  dir: ['DIRECCION', 'DOMICILIO', 'ADDRESS'], zona: ['ZONA', 'ZONA DE VENTAS', 'REGION'], ciudad: ['CIUDAD', 'MUNICIPIO', 'ESTADO'],
};

function parseStores(rows) {
  if (!rows.length) return { error: 'Archivo vacío' };
  const hdr = Object.keys(rows[0]); const H = Object.fromEntries(hdr.map((h) => [norm(h), h]));
  const col = Object.fromEntries(Object.entries(ALIAS).map(([k, al]) => [k, al.map((a) => H[a]).find(Boolean)]));
  if (!col.centro && !col.tienda) return { error: 'Falta columna CENTRO o TIENDA' };
  const stores = rows.map((r) => {
    let lat = num(r[col.lat]), lng = num(r[col.lng]);
    if ((!isFinite(lat) || !isFinite(lng)) && col.coords) { const m = String(r[col.coords] ?? '').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if (m) { lat = +m[1]; lng = +m[2]; } }
    return {
      centro: ctr(r[col.centro] ?? r[col.tienda]), tienda: String(r[col.tienda] ?? '').trim(),
      lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null,
      dir: String(r[col.dir] ?? '').trim(), zona: String(r[col.zona] ?? '').trim(), ciudad: String(r[col.ciudad] ?? '').trim(),
    };
  }).filter((s) => s.centro);
  return { stores };
}

async function callPlaces(body) {
  let tok = localStorage.getItem('gop_api_token') || '';
  if (!tok) { tok = window.prompt('Token de GO PLANNER (GOP_API_TOKEN):') || ''; if (!tok) throw new Error('Sin token'); localStorage.setItem('gop_api_token', tok); }
  const r = await fetch('/api/places', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gop-token': tok }, body: JSON.stringify(body) });
  const txt = await r.text(); if (r.status === 401) localStorage.removeItem('gop_api_token');
  if (!r.ok) throw new Error(txt);
  return JSON.parse(txt);
}

const loadLS = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

export default function ModuleTiendas({ t, isDark, navIcon, navLabel, navDesc }) {
  const init = useRef(loadLS()).current;
  const [stores, setStores] = useState(init.stores || []);
  const [scans, setScans] = useState(init.scans || {});
  const [cfg, setCfg] = useState({ plazaM: 250, wmM: 250, prod: {}, ...(init.cfg || {}) });
  const [busy, setBusy] = useState(null); // { label, done, total }
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [fUbic, setFUbic] = useState([]); const [fPerfil, setFPerfil] = useState([]); const [fZona, setFZona] = useState([]);
  const [showCfg, setShowCfg] = useState(false);
  const stop = useRef(false); const fileRef = useRef(null);

  useEffect(() => {
    const h = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify({ stores, scans, cfg })); } catch { setMsg('No cupo en localStorage; exporta el CSV.'); } }, 400);
    return () => clearTimeout(h);
  }, [stores, scans, cfg]);

  const prodOf = (id) => cfg.prod[id] ?? CAT[id].prod;

  // ─── Derivados por tienda ────────────────────────────────────────────────
  const rows = useMemo(() => {
    const base = stores.map((s) => {
      const sc = scans[s.centro]; const cats = sc?.cats || {};
      const cnt = Object.fromEntries(CATS.map((c) => { const l = cats[c.id] || []; return [c.id, { c1: l.filter((p) => p.d <= R1).length, c3: l.filter((p) => p.d <= R3).length, full: l.length >= 20, near: l[0] }]; }));
      const plaza = (cats.plaza || []).find((p) => p.d <= cfg.plazaM);
      const wm = (cats.super || []).find((p) => p.d <= cfg.wmM && WALMART.test(p.n));
      const ubic = !sc ? 'Sin escanear' : plaza && wm ? 'Plaza + Walmart' : plaza ? 'Plaza' : wm ? 'Walmart' : 'Calle';
      return { ...s, sc, cnt, plaza, wm, ubic };
    });
    const scanned = base.filter((r) => r.sc);
    const score = (x) => x.c1 + 0.25 * (x.c3 - x.c1);
    const avg = Object.fromEntries(CATS.map((c) => [c.id, scanned.reduce((a, r) => a + score(r.cnt[c.id]), 0) / (scanned.length || 1)]));
    return base.map((r) => {
      if (!r.sc) return { ...r, tags: [], perfil: '—' };
      const tags = CATS.filter((c) => c.id !== 'plaza' && c.id !== 'super').map((c) => {
        const x = r.cnt[c.id]; const idx = avg[c.id] ? score(x) / avg[c.id] : 0;
        return { id: c.id, idx, on: x.c3 > 0 && ((c.anchor && x.c1 > 0) || idx >= 1.5) };
      }).filter((x) => x.on).sort((a, b) => (b.id === 'playa') - (a.id === 'playa') || b.idx - a.idx);
      const ids = tags.map((x) => x.id);
      if (r.plaza) ids.push('plaza'); else if (r.wm) ids.push('super');
      return { ...r, tags: ids, perfil: tags[0] ? CAT[tags[0].id].label : 'General' };
    });
  }, [stores, scans, cfg.plazaM, cfg.wmM]);

  const zonas = useMemo(() => [...new Set(rows.map((r) => r.zona).filter(Boolean))].sort(), [rows]);
  const view = useMemo(() => rows.filter((r) =>
    (!fUbic.length || fUbic.includes(r.ubic)) && (!fPerfil.length || fPerfil.includes(r.perfil)) && (!fZona.length || fZona.includes(r.zona)) &&
    (!q || norm(`${r.centro} ${r.tienda} ${r.ciudad}`).includes(norm(q)))), [rows, fUbic, fPerfil, fZona, q]);
  const groupCount = (k) => Object.entries(rows.reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const cur = rows.find((r) => r.centro === sel);

  // ─── Acciones ────────────────────────────────────────────────────────────
  const onFile = async (f) => {
    if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const { stores: st, error } = parseStores(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
    if (error) return setMsg(error);
    const old = Object.fromEntries(stores.map((s) => [s.centro, s]));
    const merged = st.map((s) => (s.lat == null && old[s.centro]?.lat != null ? { ...s, lat: old[s.centro].lat, lng: old[s.centro].lng, geo: old[s.centro].geo } : s));
    setScans((sc) => Object.fromEntries(Object.entries(sc).filter(([c]) => { const n = merged.find((s) => s.centro === c), o = old[c]; return n && (!o || (o.lat === n.lat && o.lng === n.lng)); })));
    setStores(merged);
    setMsg(`${merged.length} tiendas cargadas · ${merged.filter((s) => s.lat == null).length} sin coordenadas`);
  };

  const pool = async (items, label, fn) => {
    stop.current = false; let done = 0; setBusy({ label, done, total: items.length });
    const errs = [];
    const worker = async () => { while (items.length && !stop.current) { const it = items.shift(); try { await fn(it); } catch (e) { errs.push(`${it.centro}: ${e.message}`); if (/token|autorizado/i.test(e.message)) stop.current = true; } setBusy({ label, done: ++done, total: done + items.length }); } };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(null); setMsg(errs.length ? `${errs.length} con error · ${errs.slice(0, 3).join(' | ')}` : `${label}: listo (${done})`);
  };

  const geocode = () => pool(stores.filter((s) => s.lat == null), 'Ubicando', async (s) => {
    const g = await callPlaces({ action: 'geocode', query: `Suburbia ${s.tienda}${s.dir ? `, ${s.dir}` : ''}${s.ciudad ? `, ${s.ciudad}` : ''}, México` });
    if (g.lat == null) throw new Error('no encontrada');
    setStores((arr) => arr.map((x) => (x.centro === s.centro ? { ...x, lat: g.lat, lng: g.lng, geo: `${g.name} · ${g.address}` } : x)));
  });

  const scan = (all) => pool(stores.filter((s) => s.lat != null && (all || !scans[s.centro])), 'Escaneando', async (s) => {
    const r = await callPlaces({ action: 'scan', lat: s.lat, lng: s.lng, radius: R3, cats: CATS.map(({ id, types }) => ({ id, types })) });
    setScans((sc) => ({ ...sc, [s.centro]: { ts: Date.now(), cats: r.cats, errors: r.errors } }));
    const e = Object.keys(r.errors || {}); if (e.length) throw new Error(`categorías con error: ${e.join(', ')} (${Object.values(r.errors)[0]})`);
  });

  const exportCSV = () => {
    const head = ['CENTRO', 'TIENDA', 'ZONA', 'CIUDAD', 'LAT', 'LNG', 'UBICACION', 'PLAZA', 'WALMART', ...CATS.flatMap((c) => [`${c.label.toUpperCase()}_1KM`, `${c.label.toUpperCase()}_3KM`, `${c.label.toUpperCase()}_MAS_CERCANO`]), 'PERFIL', 'TAGS', 'PRODUCTO_QUE_NO_FALTA'];
    const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = rows.map((r) => [r.centro, r.tienda, r.zona, r.ciudad, r.lat, r.lng, r.ubic, r.plaza?.n, r.wm?.n,
      ...CATS.flatMap((c) => { const x = r.cnt[c.id]; return r.sc ? [x.c1, x.full && x.c3 === x.c1 ? `${x.c3}+` : x.c3, x.near ? `${x.near.n} (${km(x.near.d)})` : ''] : ['', '', '']; }),
      r.perfil, r.tags.map((id) => CAT[id].label).join(' | '), [...new Set(r.tags.map(prodOf))].join(' | ')].map(cell).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mapa_tiendas_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const clearAll = () => { if (window.confirm('¿Borrar tiendas y escaneos?')) { setStores([]); setScans({}); setSel(null); } };

  // ─── UI ──────────────────────────────────────────────────────────────────
  const nScan = rows.filter((r) => r.sc).length, nGeo = stores.filter((s) => s.lat != null).length;
  const btn = `flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border disabled:opacity-40`;
  const nF = fUbic.length + fPerfil.length + fZona.length;
  const Chip = ({ label, n, on, onClick, color }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${on ? t.toggleActive : t.cardInner}`}>
      {color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}
      <span className={t.text}>{label}</span><span className={`font-black tabular-nums ${t.text}`}>{n}</span>
    </button>
  );
  const toggleIn = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="p-6 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={<>
        <FilterMenu isDark={isDark} count={nF} width={520}>
          <FilterSection label="Filtros" isDark={isDark}>
            <div className="flex flex-wrap gap-2">
              <MS label="Ubicación" options={['Plaza', 'Walmart', 'Plaza + Walmart', 'Calle', 'Sin escanear']} selected={fUbic} onChange={setFUbic} t={t} isDark={isDark} />
              <MS label="Perfil" options={[...new Set(rows.map((r) => r.perfil))]} selected={fPerfil} onChange={setFPerfil} t={t} isDark={isDark} />
              {zonas.length > 0 && <MS label="Zona" options={zonas} selected={fZona} onChange={setFZona} t={t} isDark={isDark} />}
            </div>
          </FilterSection>
        </FilterMenu>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
        <button onClick={() => fileRef.current.click()} className={`${btn} ${t.btnGhost}`}><Upload size={14} /> Tiendas</button>
        {busy ? <button onClick={() => (stop.current = true)} className={`${btn} ${t.btnGhost}`}><Square size={14} /> {busy.label} {busy.done}/{busy.total}</button> : <>
          <button disabled={!stores.length || nGeo === stores.length} onClick={geocode} className={`${btn} ${t.btnGhost}`}><MapPin size={14} /> Ubicar ({stores.length - nGeo})</button>
          <button disabled={!nGeo} onClick={(e) => scan(e.shiftKey)} className={`${btn} ${t.btn}`} title="Escanea solo las tiendas pendientes. Shift+clic = re-escanear todas"><Play size={14} /> Escanear ({nGeo - nScan})</button>
        </>}
        <button disabled={!rows.length} onClick={exportCSV} className={`${btn} ${t.btnGhost}`}><Download size={14} /> CSV</button>
        <button onClick={() => setShowCfg((v) => !v)} className={`${btn} ${t.btnGhost}`}><Settings size={14} /></button>
        <button disabled={!stores.length} onClick={clearAll} className={`${btn} ${t.btnDanger}`}><Trash2 size={14} /></button>
      </>} />

      {msg && <p className={`text-xs px-3 py-2 rounded-lg border ${t.cardInner} ${t.textMuted}`}>{msg}</p>}

      {showCfg && (
        <div className={`p-4 rounded-2xl border space-y-3 ${t.card}`}>
          <div className="flex flex-wrap gap-4">
            {[['plazaM', 'Dentro de plaza si el mall está a ≤ (m)'], ['wmM', 'Junto a Walmart si está a ≤ (m)']].map(([k, l]) => (
              <label key={k} className={`text-[10px] font-bold uppercase ${t.textMuted}`}>{l}
                <input type="number" value={cfg[k]} onChange={(e) => setCfg((c) => ({ ...c, [k]: +e.target.value || 0 }))} className={`block mt-1 w-28 px-2 py-1 rounded border text-xs ${t.input}`} />
              </label>))}
          </div>
          <p className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Producto que no debe faltar por punto de interés</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {CATS.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 text-xs ${t.text}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} /><span className="w-28 shrink-0">{c.label}</span>
                <input value={prodOf(c.id)} onChange={(e) => setCfg((x) => ({ ...x, prod: { ...x.prod, [c.id]: e.target.value } }))} className={`flex-1 px-2 py-1 rounded border text-xs ${t.input}`} />
              </label>))}
          </div>
          <p className={`text-[10px] ${t.textMuted}`}>Perfil = el punto de interés más sobrerrepresentado vs el promedio de tus tiendas (índice ≥ 1.5). Hospital, universidad, estadio y playa marcan con tener 1 a ≤ 1 km. Cada escaneo = {CATS.length} llamadas a Google Places por tienda (Google cuenta máx. 20 resultados por categoría: "20+").</p>
        </div>
      )}

      {!stores.length ? (
        <div className={`p-10 rounded-2xl border-2 border-dashed text-center ${t.card}`}>
          <Upload size={28} className={`mx-auto mb-3 ${t.textMuted}`} />
          <p className={`font-bold ${t.text}`}>Carga tu catálogo de tiendas (CSV o Excel)</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Columnas: CENTRO, TIENDA y LAT + LNG (o COORDENADAS "19.43, -99.13"). Sin coordenadas: agrega DIRECCION / CIUDAD y usa "Ubicar". Opcional: ZONA.</p>
        </div>
      ) : <>
        <div className={`p-4 rounded-2xl border space-y-3 ${t.card}`}>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`text-[10px] font-bold uppercase w-20 ${t.textMuted}`}>Ubicación</span>
            {groupCount('ubic').map(([k, n]) => <Chip key={k} label={k} n={n} on={fUbic.includes(k)} onClick={() => toggleIn(fUbic, setFUbic, k)} />)}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`text-[10px] font-bold uppercase w-20 ${t.textMuted}`}>Perfil</span>
            {groupCount('perfil').map(([k, n]) => <Chip key={k} label={k} n={n} color={CATS.find((c) => c.label === k)?.color} on={fPerfil.includes(k)} onClick={() => toggleIn(fPerfil, setFPerfil, k)} />)}
          </div>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[1fr_420px] gap-4 items-start">
          <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
            <div className="p-3 flex items-center gap-2">
              <Search size={14} className={t.textMuted} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tienda, centro o ciudad" className={`flex-1 px-2 py-1 rounded border text-xs ${t.input}`} />
              <span className={`text-[10px] ${t.textMuted}`}>{view.length} tiendas · celdas = POIs a 1 km / 3 km</span>
            </div>
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-xs">
                <thead className={`sticky top-0 z-10 ${t.tableHead}`}>
                  <tr>
                    <th className="px-2 py-2 text-left">Centro</th><th className="px-2 py-2 text-left">Tienda</th><th className="px-2 py-2 text-left">Ubicación</th>
                    {CATS.filter((c) => c.id !== 'plaza').map((c) => <th key={c.id} className="px-2 py-2 text-center whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: c.color }} />{c.label}</th>)}
                    <th className="px-2 py-2 text-left">Perfil</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((r) => (
                    <tr key={r.centro} onClick={() => setSel(r.centro)} className={`border-t cursor-pointer ${t.border} ${t.tableRow} ${sel === r.centro ? (isDark ? 'bg-violet-500/10' : 'bg-violet-50') : ''}`}>
                      <td className={`px-2 py-1.5 tabular-nums ${t.textMuted}`}>{r.centro}</td>
                      <td className={`px-2 py-1.5 font-bold whitespace-nowrap ${t.text}`}>{r.tienda}{r.lat == null && <span className="ml-1 text-red-500" title="Sin coordenadas">●</span>}</td>
                      <td className={`px-2 py-1.5 whitespace-nowrap ${t.text}`} title={[r.plaza?.n, r.wm?.n].filter(Boolean).join(' · ')}>{r.ubic}</td>
                      {CATS.filter((c) => c.id !== 'plaza').map((c) => { const x = r.cnt[c.id]; const on = r.tags.includes(c.id);
                        return <td key={c.id} className={`px-2 py-1.5 text-center tabular-nums whitespace-nowrap ${on ? 'font-black' : t.textMuted}`} style={on ? { color: c.color } : null}>{r.sc ? `${x.c1} / ${x.c3}${x.full ? '+' : ''}` : '—'}</td>; })}
                      <td className={`px-2 py-1.5 whitespace-nowrap font-bold ${t.text}`}>{r.perfil}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 space-y-3 2xl:sticky 2xl:top-4 ${t.card}`}>
            {!cur ? <StoreMap rows={view} sel={sel} onSel={setSel} t={t} isDark={isDark} /> : <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-sm font-black ${t.text}`}>{cur.centro} · {cur.tienda}</p>
                  <p className={`text-[10px] ${t.textMuted}`}>{cur.ubic}{cur.plaza ? ` · ${cur.plaza.n}` : ''}{cur.wm ? ` · ${cur.wm.n} (${km(cur.wm.d)})` : ''}</p>
                  {cur.geo && <p className={`text-[10px] ${t.textMuted}`}>Ubicada como: {cur.geo}</p>}
                </div>
                <button onClick={() => setSel(null)} className={`text-xs px-2 py-1 rounded border ${t.btnGhost}`}>Mapa</button>
              </div>
              {cur.lat != null && <>
                <iframe title="mapa" className="w-full h-56 rounded-xl border-0" loading="lazy" src={`https://maps.google.com/maps?q=${cur.lat},${cur.lng}&z=15&output=embed`} />
                <a href={`https://www.google.com/maps/search/?api=1&query=${cur.lat},${cur.lng}`} target="_blank" rel="noreferrer" className={`text-[10px] flex items-center gap-1 ${t.accent1}`}><ExternalLink size={11} /> Abrir en Google Maps</a>
              </>}
              {cur.tags.length > 0 && (
                <div className={`p-3 rounded-xl border ${t.cardInner}`}>
                  <p className={`text-[10px] font-bold uppercase mb-1 ${t.textMuted}`}>Que nunca falte</p>
                  {[...new Set(cur.tags)].map((id) => <p key={id} className={`text-xs ${t.text}`}><span className="font-bold" style={{ color: CAT[id].color }}>{CAT[id].label}:</span> {prodOf(id)}</p>)}
                </div>)}
              {cur.sc && <div className="space-y-2 max-h-[40vh] overflow-auto">
                {CATS.map((c) => { const l = cur.sc.cats?.[c.id] || []; const err = cur.sc.errors?.[c.id];
                  return (
                    <div key={c.id}>
                      <p className="text-[10px] font-bold uppercase" style={{ color: c.color }}>{c.label} · {cur.cnt[c.id].c1} a 1 km / {cur.cnt[c.id].c3}{cur.cnt[c.id].full ? '+' : ''} a 3 km</p>
                      {err ? <p className="text-[10px] text-red-500">{err}</p> : l.slice(0, 5).map((p, i) => <p key={i} className={`text-[11px] flex justify-between gap-2 ${t.text}`}><span className="truncate">{p.n}</span><span className={`tabular-nums ${t.textMuted}`}>{km(p.d)}</span></p>)}
                    </div>); })}
              </div>}
            </>}
          </div>
        </div>
      </>}
    </div>
  );
}

// Mapa ligero de todas las tiendas (SVG), color = perfil. Clic = detalle con Google Maps.
function StoreMap({ rows, sel, onSel, t, isDark }) {
  const pts = rows.filter((r) => r.lat != null);
  if (!pts.length) return <p className={`text-xs ${t.textMuted}`}>Sin coordenadas aún. Usa "Ubicar" o carga LAT/LNG.</p>;
  const W = 380, H = 300, P = 12;
  const xs = pts.map((r) => r.lng), ys = pts.map((r) => r.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (W - 2 * P) / (x1 - x0 || 1), sy = (H - 2 * P) / (y1 - y0 || 1), s = Math.min(sx, sy);
  const X = (v) => P + (v - x0) * s + (W - 2 * P - (x1 - x0) * s) / 2, Y = (v) => H - P - (v - y0) * s - (H - 2 * P - (y1 - y0) * s) / 2;
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase mb-2 ${t.textMuted}`}>Tiendas por perfil · clic para detalle</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
        {pts.map((r) => { const c = CATS.find((k) => k.label === r.perfil)?.color || (isDark ? '#9ca3af' : '#6b7280');
          return <circle key={r.centro} cx={X(r.lng)} cy={Y(r.lat)} r={sel === r.centro ? 6 : 4} fill={c} fillOpacity={0.85} stroke={isDark ? '#000' : '#fff'} strokeWidth={0.8} className="cursor-pointer" onClick={() => onSel(r.centro)}><title>{`${r.centro} · ${r.tienda} · ${r.perfil}`}</title></circle>; })}
      </svg>
    </div>
  );
}

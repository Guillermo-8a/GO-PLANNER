// src/modules/ModuleComparador.jsx
// Radar de Competencia: cruza el catálogo SAP contra precios públicos de 8 tiendas (vía /api/gemini-agent,
// modo COMPETITOR_RADAR con Google Search) y recomienda precio/Letra según el inventario.
// Sin API o sin red no inventa precios: muestra el producto y la lectura de inventario.
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Search, ExternalLink, Trash2 } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import MS from '../components/MultiSelect';
import { BotClip } from '../components/GoBotRightDock';

const STORES = ['Coppel', 'C&A', 'Cuidado con el Perro', 'Mercado Libre', 'Amazon', 'Elektra', 'Liverpool', 'Sanborns'];
const LS_KEY = 'gop_comparador';
const MAX_SCAN = 5;

// Columnas SAP → campo interno (match sin acentos/mayúsculas/espacios)
const COLS = {
  seccion: ['seccion'], goa: ['agenerico', 'goa'], articulo: ['articulo'], desc: ['descripcionarticulo'],
  marca: ['marca'], modelo: ['modelo'], ean: ['codigoeanupc', 'ean', 'upc'], costo: ['costoneto'],
  precio: ['precioventa'], letra: ['letraderebaja'], margen: ['margen'], cdis: ['stcdis'],
  piso: ['stockpiso'], br: ['stockbackroom'], total: ['stockpisobrapar'], transito: ['intransit'],
};
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => Number(String(v ?? '').replace(/[$,%\s]/g, '')) || 0;
const money = (v) => `$${Math.round(v).toLocaleString('es-MX')}`;
const pct = (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

function mapRows(raw) {
  if (!raw.length) return [];
  const keys = Object.keys(raw[0]);
  const pick = {};
  Object.entries(COLS).forEach(([f, alts]) => { pick[f] = keys.find((k) => alts.includes(norm(k))); });
  return raw.map((r) => {
    const o = {};
    Object.entries(pick).forEach(([f, k]) => { o[f] = k ? r[k] : ''; });
    ['costo', 'precio', 'cdis', 'piso', 'br', 'total', 'transito'].forEach((f) => { o[f] = num(o[f]); });
    const m = num(o.margen);
    o.margen = m > 1 ? m / 100 : m;
    o.stock = o.total || o.piso + o.br;
    o.articulo = String(o.articulo || o.ean || o.modelo);
    return o;
  }).filter((o) => o.articulo);
}

// Margen a un precio nuevo, calibrado con el margen SAP actual (absorbe IVA o el criterio que use el reporte).
const marginAt = (row, price) => {
  if (!row.costo || !price) return null;
  const k = row.margen > 0 && row.margen < 1 && row.precio ? row.costo / (row.precio * (1 - row.margen)) : 1 / 1.16;
  return 1 - row.costo / (price * k);
};

function recommend(row, comps) {
  const inv = row.stock + row.cdis;
  if (!comps.length) {
    if (row.br > row.piso && row.br > 0) return { tone: 'amber', text: `Sin precio rival encontrado. Ojo: Back-Room (${row.br}) supera a Piso (${row.piso}); sube a piso antes de pensar en rebaja.` };
    return { tone: 'muted', text: 'Sin precio rival encontrado para comparar.' };
  }
  const best = comps.reduce((a, b) => (b.eff < a.eff ? b : a));
  const diff = (row.precio - best.eff) / best.eff;
  const target = Math.round(best.eff * 1.05);
  const mTarget = marginAt(row, target);
  const mTxt = mTarget != null ? ` (margen ≈ ${(mTarget * 100).toFixed(1)}%)` : '';
  if (diff > 0.1 && (row.br > row.piso || inv > 20)) {
    return { tone: 'red', text: `${pct(diff)} vs ${best.store} con ${inv} u. (BR ${row.br}, CDis ${row.cdis}). Mueve Letra de Rebaja o promo a ~${money(target)}${mTxt} para no cargar inventario.` };
  }
  if (diff > 0.1) return { tone: 'amber', text: `${pct(diff)} vs ${best.store}, pero con poco inventario (${inv} u.). Sostén precio y no resurtas a este costo.` };
  if (diff < -0.1) return { tone: 'green', text: `${pct(diff)} vs ${best.store}: hay espacio para quitar Letra o subir precio y cuidar margen${inv === 0 ? '; además estás sin stock, prioriza resurtido' : ''}.` };
  return { tone: 'green', text: `En rango vs mercado (${pct(diff)} vs ${best.store}). Mantén precio.` };
}

const TONE = { red: 'text-red-400', amber: 'text-amber-400', green: 'text-emerald-400', muted: '' };

export default function ModuleComparador({ t, isDark, navIcon, navLabel, navDesc }) {
  const [saved] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } });
  const [rows, setRows] = useState(saved.rows || []);
  const [results, setResults] = useState(saved.results || {}); // { articulo: [{store,title,price_regular,price_promo,url,match}] }
  const [scanned, setScanned] = useState(saved.scanned || []);
  const [sources, setSources] = useState(saved.sources || []);
  const [F, setF] = useState({ seccion: [], goa: [], marca: [] });
  const [q, setQ] = useState('');
  const [stores, setStores] = useState([]);
  const [sel, setSel] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | scanning | done | error
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ rows, results, scanned, sources })); }
    catch { try { localStorage.setItem(LS_KEY, JSON.stringify({ rows: [], results, scanned, sources })); } catch { /* sin espacio */ } }
  }, [rows, results, scanned, sources]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer());
    const mapped = mapRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
    setRows(mapped); setSel([]); setResults({}); setScanned([]); setSources([]);
    setMsg(mapped.length ? '' : 'No encontré columnas del catálogo SAP (Artículo, Precio Venta, Stock…).');
  };

  const opts = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort().map(String);
  const filtered = useMemo(() => {
    const ql = norm(q);
    return rows.filter((r) =>
      ['seccion', 'goa', 'marca'].every((k) => !F[k].length || F[k].includes(String(r[k]))) &&
      (!ql || norm(`${r.articulo} ${r.desc} ${r.modelo} ${r.marca} ${r.ean}`).includes(ql))
    ).sort((a, b) => b.stock + b.cdis - (a.stock + a.cdis));
  }, [rows, F, q]);

  const activeStores = stores.length ? stores : STORES;
  const toggle = (a) => setSel((s) => (s.includes(a) ? s.filter((x) => x !== a) : s.length < MAX_SCAN ? [...s, a] : s));

  const scan = async () => {
    const items = (sel.length ? rows.filter((r) => sel.includes(r.articulo)) : filtered.slice(0, MAX_SCAN));
    if (!items.length) return;
    setStatus('scanning'); setMsg('');
    const ids = items.map((r) => r.articulo);
    try {
      const r = await fetch('/api/gemini-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'COMPETITOR_RADAR', stores: activeStores,
          items: items.map((x) => ({ 'Artículo': x.articulo, 'Código EAN/UPC': x.ean, 'Modelo': x.modelo, 'Marca': x.marca, 'Descripcion artículo': x.desc })),
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const data = await r.json();
      const by = {};
      (data.results || []).forEach((x) => { const k = String(x.articulo); (by[k] = by[k] || []).push(x); });
      setResults((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, by[id] || []])) }));
      setSources(data.sources || []);
      setScanned(ids);
      setStatus('done');
      if (!data.results?.length) setMsg('El GO-Bot no encontró estos productos publicados en las tiendas seleccionadas.');
    } catch (err) {
      setScanned(ids);
      setStatus('error');
      setMsg(`Radar sin conexión (${err.message}). Te muestro la lectura de inventario sin precios rivales.`);
    }
  };

  const clip = status === 'scanning' ? 'triple' : status === 'done' ? 'victory' : status === 'error' ? 'peek' : 'spin';
  const cards = rows.filter((r) => scanned.includes(r.articulo));
  const inp = `text-xs px-3 py-1.5 rounded-lg border focus:outline-none ${t.input}`;

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader
        Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark}
        right={rows.length > 0 && (
          <button onClick={() => { setRows([]); setResults({}); setScanned([]); setSel([]); setSources([]); }} className={`text-xs px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 ${t.btnGhost}`}>
            <Trash2 size={13} /> Limpiar
          </button>
        )}
      />

      {/* Barra de control */}
      <div className={`relative z-20 p-4 rounded-2xl border flex flex-wrap items-center gap-3 ${t.card}`}>
        <div className={`relative shrink-0 ${status === 'scanning' ? 'animate-pulse' : ''}`}>
          {status === 'scanning' && <span className="absolute inset-2 rounded-full bg-violet-500/30 animate-ping" />}
          <BotClip clip={clip} size={72} isDark={isDark} framed />
        </div>
        <label className={`text-xs px-3 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer ${t.btnSec}`}>
          <UploadCloud size={14} /> {rows.length ? 'Cambiar catálogo SAP' : 'Cargar catálogo SAP'}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
        </label>
        {rows.length > 0 && (
          <>
            <MS label="Sección" options={opts('seccion')} selected={F.seccion} onChange={(v) => setF({ ...F, seccion: v })} t={t} isDark={isDark} />
            <MS label="GOA" options={opts('goa')} selected={F.goa} onChange={(v) => setF({ ...F, goa: v })} t={t} isDark={isDark} />
            <MS label="Marca" options={opts('marca')} selected={F.marca} onChange={(v) => setF({ ...F, marca: v })} t={t} isDark={isDark} />
            <MS label="Tiendas" allLabel="Las 8" options={STORES} selected={stores} onChange={setStores} t={t} isDark={isDark} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Artículo, modelo, EAN…" className={`${inp} w-44`} />
            <button
              onClick={scan}
              disabled={status === 'scanning' || !filtered.length}
              className={`ml-auto text-xs px-4 py-2 rounded-xl font-black flex items-center gap-2 disabled:opacity-40 ${t.btn}`}
            >
              <Search size={14} />
              {status === 'scanning' ? 'Escaneando catálogos…' : `Escanear catálogos competidores (${sel.length || Math.min(MAX_SCAN, filtered.length)})`}
            </button>
          </>
        )}
      </div>
      {msg && <p className={`text-xs font-bold ${status === 'error' ? 'text-amber-400' : t.textMuted}`}>{msg}</p>}

      {!rows.length && (
        <div className={`p-10 rounded-2xl border text-center ${t.card}`}>
          <p className={`text-sm font-bold ${t.text}`}>Carga el reporte de artículos SAP</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Sección, A. Genérico, Artículo, Descripción, Marca, Modelo, EAN/UPC, Costo neto, Precio Venta, Letra de Rebaja, Margen, St-CDis, Stock-PISO, Stock Back-Room, Stock PISO+BR+APAR, In Transit.</p>
        </div>
      )}

      {/* Resultados */}
      {cards.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {cards.map((row) => {
            const comps = (results[row.articulo] || [])
              .filter((c) => activeStores.includes(c.store))
              .map((c) => ({ ...c, eff: num(c.price_promo) || num(c.price_regular) }))
              .sort((a, b) => a.eff - b.eff);
            const rec = recommend(row, comps);
            return (
              <div key={row.articulo} className={`p-4 rounded-2xl border space-y-3 ${t.card}`}>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted}`}>{[row.seccion, row.goa, row.marca].filter(Boolean).join(' · ')}</p>
                  <p className={`text-sm font-black leading-snug ${t.text}`}>{row.desc || row.modelo}</p>
                  <p className={`text-[11px] ${t.textMuted}`}>Art. {row.articulo}{row.modelo ? ` · Mod. ${row.modelo}` : ''}{row.ean ? ` · EAN ${row.ean}` : ''}</p>
                </div>
                <div className={`grid grid-cols-4 gap-2 p-2.5 rounded-xl border text-center ${t.cardInner}`}>
                  {[['Precio', money(row.precio)], ['Margen', row.margen ? `${(row.margen * 100).toFixed(1)}%` : '—'], ['Letra', row.letra || '—'], ['Piso/BR/CDis', `${row.piso}/${row.br}/${row.cdis}`]].map(([l, v]) => (
                    <div key={l}><p className={`text-[9px] font-bold uppercase ${t.textMuted}`}>{l}</p><p className={`text-xs font-black ${t.text}`}>{v}</p></div>
                  ))}
                </div>
                {comps.length > 0 && (
                  <table className="w-full text-[11px]">
                    <thead><tr className={t.textMuted}><th className="text-left font-bold">Tienda</th><th className="text-right font-bold">Regular</th><th className="text-right font-bold">Promo</th><th className="text-right font-bold">Dif.</th></tr></thead>
                    <tbody>
                      {comps.map((c, i) => {
                        const d = (row.precio - c.eff) / c.eff;
                        return (
                          <tr key={i} className={t.text} title={`${c.title || ''} · match por ${c.match || '—'}`}>
                            <td className="py-0.5">
                              {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{c.store}<ExternalLink size={10} /></a> : c.store}
                              {c.match && <span className={`ml-1 text-[9px] ${t.textMuted}`}>{c.match}</span>}
                            </td>
                            <td className="text-right">{money(num(c.price_regular))}</td>
                            <td className="text-right">{num(c.price_promo) ? money(num(c.price_promo)) : '—'}</td>
                            <td className={`text-right font-black ${d > 0.05 ? 'text-red-400' : d < -0.05 ? 'text-emerald-400' : ''}`}>{pct(d)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <p className={`text-xs font-bold leading-snug ${TONE[rec.tone] || t.textMuted}`}>🤖 {rec.text}</p>
              </div>
            );
          })}
        </div>
      )}
      {sources.length > 0 && (
        <p className={`text-[10px] ${t.textMuted}`}>
          Fuentes: {sources.slice(0, 8).map((s, i) => <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="underline mr-2">{s.title || `[${i + 1}]`}</a>)}
          · Precios encontrados por IA con búsqueda web: valida antes de mover precio.
        </p>
      )}

      {/* Catálogo filtrado: elige hasta 5 para escanear */}
      {rows.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
          <div className={`px-4 py-2 text-[11px] font-bold flex justify-between ${t.textMuted}`}>
            <span>{filtered.length.toLocaleString('es-MX')} artículos · ordenados por inventario</span>
            <span>Seleccionados {sel.length}/{MAX_SCAN}{!sel.length && ' (si no eliges, escanea los primeros 5)'}</span>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs">
              <thead className={`sticky top-0 ${isDark ? 'bg-[#1c1720]' : 'bg-gray-50'}`}>
                <tr className={t.textMuted}>
                  {['', 'Artículo', 'Descripción', 'Marca', 'Precio', 'Margen', 'Letra', 'Piso', 'BR', 'CDis', 'Tránsito'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r) => (
                  <tr key={r.articulo} onClick={() => toggle(r.articulo)} className={`cursor-pointer border-t ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'} ${sel.includes(r.articulo) ? (isDark ? 'bg-violet-600/15' : 'bg-blue-50') : ''} ${t.text}`}>
                    <td className="px-2 py-1.5"><input type="checkbox" readOnly checked={sel.includes(r.articulo)} className="accent-violet-500" /></td>
                    <td className="px-2 py-1.5 font-bold whitespace-nowrap">{r.articulo}</td>
                    <td className="px-2 py-1.5 max-w-[260px] truncate">{r.desc || r.modelo}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.marca}</td>
                    <td className="px-2 py-1.5 text-right">{money(r.precio)}</td>
                    <td className="px-2 py-1.5 text-right">{r.margen ? `${(r.margen * 100).toFixed(1)}%` : '—'}</td>
                    <td className="px-2 py-1.5">{r.letra || '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.piso}</td>
                    <td className="px-2 py-1.5 text-right">{r.br}</td>
                    <td className="px-2 py-1.5 text-right">{r.cdis}</td>
                    <td className="px-2 py-1.5 text-right">{r.transito}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

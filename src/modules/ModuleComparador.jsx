import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Search } from 'lucide-react';
import GoBot3DAvatar from '../components/GoBot3DAvatar';

const STORES = ['Coppel', 'C&A', 'Cuidado con el Perro', 'Mercado Libre', 'Amazon', 'Elektra', 'Liverpool', 'Sanborns'];
const num = (v) => Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0;

const recommend = (row, diffPct) => {
  const stock = num(row['Stock PISO+BR+APAR']) || num(row['Stock-PISO']) + num(row['Stock Back-Room']);
  const total = stock + num(row['St-CDis']);
  if (diffPct > 10 && total > 0) return `Estamos ${diffPct.toFixed(1)}% arriba con ${total} u. en Piso+BR+CDis → evaluar Letra de Rebaja.`;
  if (diffPct < -10 && total === 0) return `Estamos ${Math.abs(diffPct).toFixed(1)}% abajo y sin stock → oportunidad de compra/resurtido.`;
  if (diffPct < -10) return `Estamos ${Math.abs(diffPct).toFixed(1)}% abajo → hay espacio para cuidar margen.`;
  return 'Precio en rango de mercado.';
};

export default function ModuleComparador({ t, isDark }) {
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [stores, setStores] = useState(STORES);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | scanning | done | error
  const [msg, setMsg] = useState('');

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer());
    setCatalog(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 20);
    return catalog.filter((r) =>
      ['Sección', 'A. Genérico', 'Artículo', 'Descripcion artículo', 'Marca', 'Modelo', 'Código EAN/UPC']
        .some((k) => String(r[k] ?? '').toLowerCase().includes(q))
    ).slice(0, 20);
  }, [catalog, query]);

  const scan = async () => {
    if (!filtered.length) return;
    setStatus('scanning'); setMsg(''); setResults([]);
    try {
      const res = await fetch('/api/gemini-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'COMPETITOR_RADAR', stores, items: filtered }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Esperado: { results: [{ 'Artículo', store, price, url }] }
      setResults(data.results || []);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setMsg(`No se pudo consultar /api/gemini-agent (${err.message}). El endpoint aún no está configurado.`);
    }
  };

  const toggleStore = (s) => setStores((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const anim = status === 'scanning' ? 'scanning' : status === 'done' ? 'fortniteVictoryDance' : 'idle';
  const card = t?.card || (isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-gray-200 text-gray-900');
  const muted = t?.textMuted || 'text-zinc-400';

  return (
    <div className="space-y-5">
      <div className={`p-5 rounded-3xl border flex items-center gap-4 ${card}`}>
        <GoBot3DAvatar variant="purple" animation={anim} isDark={isDark} size={72} />
        <div>
          <h2 className="text-xl font-black">Radar Competencia IA</h2>
          <p className={`text-xs ${muted}`}>Cruza tu catálogo SAP contra {STORES.length} tiendas y te dice dónde ajustar precio según tu stock.</p>
        </div>
      </div>

      <div className={`p-5 rounded-3xl border space-y-4 ${card}`}>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 text-white cursor-pointer">
            <UploadCloud size={14} /> Cargar catálogo SAP
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
          </label>
          <span className={`text-xs ${muted}`}>{catalog.length} artículos cargados</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtra por Sección, GOA, Marca, Modelo, EAN..."
            className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border text-xs bg-transparent"
          />
          <button onClick={scan} disabled={!filtered.length || status === 'scanning'} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 disabled:opacity-40">
            <Search size={14} /> {status === 'scanning' ? 'Escaneando…' : `Escanear ${filtered.length}`}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STORES.map((s) => (
            <button key={s} onClick={() => toggleStore(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${stores.includes(s) ? 'bg-violet-600/20 border-violet-500 text-violet-300' : 'border-zinc-700 text-zinc-500'}`}>
              {s}
            </button>
          ))}
        </div>
        {msg && <p className="text-xs text-amber-400">{msg}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const mine = num(row['Precio Venta']);
          const comps = results.filter((r) => String(r['Artículo']) === String(row['Artículo']) && stores.includes(r.store));
          return (
            <div key={row['Artículo'] || row['Código EAN/UPC']} className={`p-4 rounded-2xl border ${card}`}>
              <p className={`text-[10px] font-bold uppercase ${muted}`}>{row['Sección']} · {row['A. Genérico']} · {row['Marca']}</p>
              <p className="text-sm font-black">{row['Descripcion artículo'] || row['Modelo']}</p>
              <p className={`text-[11px] ${muted}`}>Art. {row['Artículo']} · Precio ${mine.toLocaleString('es-MX')} · Margen {row['Margen']} · Letra {row['Letra de Rebaja'] || '-'}</p>
              <p className={`text-[11px] ${muted}`}>Piso {num(row['Stock-PISO'])} · BR {num(row['Stock Back-Room'])} · CDis {num(row['St-CDis'])} · Tránsito {num(row['In Transit'])}</p>
              {comps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {comps.map((c) => {
                    const diff = c.price ? ((mine - c.price) / c.price) * 100 : 0;
                    return (
                      <div key={c.store} className="text-[11px]">
                        <div className="flex justify-between">
                          <span>{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.store}</a> : c.store}</span>
                          <span>${num(c.price).toLocaleString('es-MX')} <b className={diff > 0 ? 'text-rose-400' : 'text-emerald-400'}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}%</b></span>
                        </div>
                        <p className={muted}>{recommend(row, diff)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

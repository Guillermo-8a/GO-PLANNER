import { useState, useRef, useEffect } from 'react';

// Filtro multiselección estándar de GO PLANNER (mismo estilo que Dayli): buscador, checkboxes, "Todos" y "Cerrar".
// options: ['A','B'] o [{ value, label, hint? }]. selected: array de values ([] = todos).
// t / isDark son opcionales: sin ellos usa clases dark: de Tailwind y el modo del <html>.
const DEF_T = { input: 'bg-gray-50 dark:bg-[#1c1720] border-gray-300 dark:border-white/10 text-gray-900 dark:text-white',
  badge: 'bg-violet-50 dark:bg-violet-500/25 text-violet-700 dark:text-violet-300 border-violet-400/60', btnGhost: 'border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-300',
  btnPrimary: 'bg-violet-600 text-white', textMain: 'text-gray-900 dark:text-white', textMuted: 'text-gray-500 dark:text-gray-400' };
export default function MultiSelect({ label, options = [], selected = [], onChange, t = DEF_T, isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark'), allLabel = 'Todos', single = false }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const opts = options.map((o) => (o && typeof o === 'object' ? { value: o.value, label: String(o.label ?? o.value), hint: o.hint } : { value: o, label: String(o) }));
  const lbl = (v) => opts.find((o) => o.value === v)?.label ?? String(v);
  // single: misma UI pero una sola opción (vistas que dependen de un solo valor, p. ej. clusters por GOA)
  const toggle = (v) => { if (single) { onChange(selected.includes(v) ? [] : [v]); setOpen(false); return; } onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]); };
  const disp = selected.length === 0 ? `${label}: ${allLabel}` : selected.length === 1 ? lbl(selected[0]) : `${label}: ${selected.length}`;
  const filt = q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={label}
        className={`text-xs px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1 max-w-[200px] ${selected.length > 0 ? (t.badge || 'border-violet-500 text-violet-500') : t.input}`}>
        <span className="truncate">{disp}</span><span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className={`absolute top-full left-0 mt-1 z-50 rounded-xl border shadow-2xl p-2 w-60 ${isDark ? 'bg-[#1c1720] border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className={`text-[11px] px-2 py-1 rounded-lg border flex-1 ${t.input} focus:outline-none`} />
            {selected.length > 0 && <button type="button" onClick={() => onChange([])} className={`text-[9px] px-2 py-1 rounded-lg border font-black ${t.btnGhost}`}>Todos</button>}
          </div>
          <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-0.5">
            {filt.map((o) => (
              <label key={String(o.value)} className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer text-[11px] ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-100'} ${t.textMain || t.text}`}>
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="accent-violet-500" />
                <span className="truncate flex-1">{o.label}</span>{o.hint != null && <span className={`tabular-nums text-[10px] ${t.textMuted}`}>{o.hint}</span>}
              </label>))}
            {filt.length === 0 && <p className={`text-[10px] px-2 py-1 ${t.textMuted}`}>Sin resultados</p>}
          </div>
          <div className={`flex items-center justify-between mt-2 pt-2 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}`}>
            <span className={`text-[9px] font-black ${t.textMuted}`}>{selected.length === 0 ? 'Todos' : `${selected.length} seleccionado${selected.length > 1 ? 's' : ''}`}</span>
            <button type="button" onClick={() => setOpen(false)} className={`text-[9px] px-3 py-1 rounded-lg font-black ${t.btnPrimary || t.btn || 'bg-violet-600 text-white'}`}>Cerrar</button>
          </div>
        </div>)}
    </div>
  );
}

// Helper para predicados: [] = todos
export const inSel = (sel, v) => !sel || sel.length === 0 || sel.includes(v);

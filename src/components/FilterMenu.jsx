// src/components/FilterMenu.jsx
// Botón "Filtros" del header con menú flotante (estilo Dispersión). Se cierra al dar clic fuera.
//   <FilterMenu isDark={isDark} count={n}>
//     <FilterSection label="Filtros" isDark={isDark}>…selects…</FilterSection>
//   </FilterMenu>
// El contenedor del header debe llevar `relative z-30` para que el menú quede encima del contenido.
import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown } from 'lucide-react';

export default function FilterMenu({ isDark, count = 0, disabled = false, width = 680, label = 'Filtros', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const on = open || count > 0;
  const btn = on
    ? (isDark ? 'bg-violet-500/20 text-violet-300 border-violet-400/50 shadow-[0_0_12px_rgba(139,92,246,0.35)]' : 'bg-violet-100 text-violet-700 border-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]')
    : (isDark ? 'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700' : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200');
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 ${btn}`}>
        <Filter size={14} /> {label}{count ? ` (${count})` : ''}<ChevronDown size={12} />
      </button>
      {open && (
        <div className={`absolute right-0 mt-2 z-40 p-4 rounded-2xl border space-y-3 backdrop-blur-xl text-left ${isDark ? 'bg-[#1c1720] border-white/10 shadow-[0_0_40px_-10px_rgba(139,92,246,0.5)]' : 'bg-white border-gray-200 shadow-2xl'}`} style={{ width: `min(92vw, ${width}px)` }}>
          {children}
        </div>
      )}
    </div>
  );
}

export const FilterSection = ({ label, isDark, children }) => (
  <div>
    {label && <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</div>}
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

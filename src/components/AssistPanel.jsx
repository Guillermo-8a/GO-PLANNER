// AssistPanel.jsx — panel de "Asistencia" compacto, compartido entre el header
// principal y el de Team Tracker. Solo una descripción corta + botón a /about
// (antes esto listaba todos los módulos y quedaba enorme).
import { Link } from 'react-router-dom';
import { HelpCircle, X, ArrowRight } from 'lucide-react';

export default function AssistPanel({
  isDark,
  onClose,
  description = 'GO Planner es un sistema de planeación retail end-to-end. Cada módulo funciona de forma independiente y puede compartir datos con los demás.',
}) {
  const bg    = isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200';
  const text  = isDark ? 'text-white' : 'text-gray-900';
  const muted = isDark ? 'text-zinc-400' : 'text-gray-500';

  return (
    <div
      className={`absolute right-0 top-12 w-72 rounded-2xl border shadow-2xl z-50 overflow-hidden ${bg}`}
      style={{
        boxShadow: isDark
          ? '0 0 40px rgba(124,58,237,0.2), 0 20px 40px rgba(0,0,0,0.6)'
          : '0 8px 32px rgba(0,0,0,0.15)',
      }}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isDark ? 'bg-violet-600/20' : 'bg-blue-50'}`}>
            <HelpCircle size={14} className={isDark ? 'text-violet-400' : 'text-blue-600'} />
          </div>
          <span className={`font-black text-sm uppercase tracking-wider ${text}`}>Asistencia</span>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded-lg transition ${isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-white' : 'hover:bg-gray-200 text-gray-400'}`}
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3">
        <p className={`text-xs leading-relaxed ${muted}`}>{description}</p>
      </div>

      <Link
        to="/about"
        onClick={onClose}
        className={`flex items-center justify-center gap-1.5 mx-3 mb-3 py-2.5 rounded-xl border text-[11px] font-bold tracking-wide transition ${
          isDark ? 'border-violet-500/25 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'
                 : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
        }`}
      >
        Ver documentación completa <ArrowRight size={12} />
      </Link>
    </div>
  );
}

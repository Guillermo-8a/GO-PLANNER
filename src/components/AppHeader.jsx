// AppHeader.jsx — topbar compartido entre el shell principal y Team Tracker,
// para que ambos se vean idénticos. El logo/wordmark siempre manda a /about.
//
// Props:
//   t, isDark        — tokens de tema (THEMES.dark/light de App.jsx)
//   subtitle         — texto chico bajo "GO PLANNER" (ej. "Dashboard", "Team Tracker")
//   bell             — { count, critical, title } → muestra el ícono de campana. Omite para ocultarla.
//   search           — { items: [{id,label,Icon}], onSelect(id) } → muestra buscador. Omite para ocultarlo.
//   extraLinks       — [{ to, title, Icon }] → íconos de Link extra entre Asistencia y buscador.
//   statusBar        — nodo opcional, la franja delgada debajo del header (ej. "Datos: ...").
//   assistDescription— texto del panel de Asistencia (si no se pasa, usa el default de GO PLANNER).
//   sticky           — default true. Team Tracker lo usa en false porque su página no está
//                      armada con el mismo layout de altura fija que App.jsx.
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Bell, Search, HelpCircle } from 'lucide-react';
import AssistPanel from './AssistPanel';

export default function AppHeader({
  t, isDark, subtitle,
  bell, search, extraLinks = [], statusBar, assistDescription, sticky = true, kpiChips = [],
}) {
  const [showAssist, setShowAssist] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const assistRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (assistRef.current && !assistRef.current.contains(e.target)) setShowAssist(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const searchResults = search && searchQuery.trim()
    ? search.items.filter((i) => i.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  return (
    <header className={sticky ? `sticky top-0 z-30 border-b ${t.header}` : `rounded-2xl border mb-4 ${t.header}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/about" className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isDark ? 'bg-violet-600' : 'bg-blue-600'} text-white shadow-lg shrink-0`}>
            <Layers size={18} />
          </div>
          <div className="hidden sm:block">
            <h1 className={`text-lg font-black tracking-tighter uppercase leading-none ${t.text}`}>
              GO <span className={isDark ? 'text-violet-500' : 'text-blue-600'}>PLANNER</span>
            </h1>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted}`}>
              {subtitle}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {kpiChips.length > 0 && (
            <div className="hidden lg:flex gap-2">
              {kpiChips.map((c) => (
                <div key={c.label} className={`px-3 py-1.5 rounded-xl border text-xs ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                  <span className={t.textMuted}>{c.label}: </span>
                  <span className={`font-black ${c.valueClass}`}>{c.value}</span>
                </div>
              ))}
            </div>
          )}

          {bell && (
            <button
              title={bell.title}
              className={`relative p-2.5 rounded-xl border transition ${
                bell.critical
                  ? isDark ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'bg-red-50 border-red-300 text-red-600'
                  : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'
              }`}
            >
              <Bell size={17} />
              {bell.count > 0 && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white ${bell.critical ? 'bg-red-500' : 'bg-yellow-500'}`}>
                  {bell.count}
                </span>
              )}
            </button>
          )}

          <div className="relative" ref={assistRef}>
            <button
              onClick={() => setShowAssist((v) => !v)}
              title="Asistencia"
              className={`p-2.5 rounded-xl border transition-all ${
                showAssist
                  ? isDark ? 'bg-violet-600 border-violet-500 text-white' : 'bg-blue-600 border-blue-500 text-white'
                  : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-violet-400 hover:border-violet-500/50'
                            : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300'
              }`}
            >
              <HelpCircle size={17} />
            </button>
            {showAssist && (
              <AssistPanel isDark={isDark} onClose={() => setShowAssist(false)} description={assistDescription} />
            )}
          </div>

          {extraLinks.map(({ to, title, Icon }) => (
            <Link
              key={to}
              to={to}
              title={title}
              className={`p-2.5 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-violet-400 hover:border-violet-500/50' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300'}`}
            >
              <Icon size={17} />
            </Link>
          ))}

          {search && (
            <div className="relative" ref={searchRef}>
              <button
                onClick={() => setShowSearch((v) => !v)}
                title="Buscar módulo"
                className={`p-2.5 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-violet-400 hover:border-violet-500/50' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300'}`}
              >
                <Search size={17} />
              </button>
              {showSearch && (
                <div className={`absolute right-0 top-12 w-64 rounded-2xl border shadow-2xl z-50 p-2 ${isDark ? 'bg-[#1c1720]/95 border-white/10 backdrop-blur-xl' : 'bg-white border-gray-200'}`}>
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ir a un módulo…"
                    className={`w-full px-3 py-2 rounded-xl text-sm outline-none ${t.input}`}
                  />
                  {searchResults.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {searchResults.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => { search.onSelect(r.id); setShowSearch(false); setSearchQuery(''); }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-left ${isDark ? 'text-zinc-300 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          <r.Icon size={13} />
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {statusBar}
    </header>
  );
}

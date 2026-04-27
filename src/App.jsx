// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — Shell principal de GO Planner
// Sidebar: se colapsa a solo iconos al seleccionar módulo, glow en activo
// Botón Asistencia junto a notificaciones
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { GlobalProvider, useGlobal, useDispatch, globalActions } from './context/GlobalContext';
import ModuleForecast     from './modules/ModuleForecast';
import ModuleAssortment   from './modules/ModuleAssortment';
import ModuleDistribucion from './modules/ModuleDistribucion';
import ModuleResurtido    from './modules/ModuleReplenishment';
import ModuleTraslados from './modules/ModuleTraslados';

import {
  Layers, Menu, Bell, Sun, Moon,
  TrendingUp, ShoppingCart, Map, RefreshCw, LayoutDashboard,
  HelpCircle, X, Zap, ArrowLeftRight,
} from 'lucide-react';

// ─── Paletas de tema ──────────────────────────────────────────────────────────
export const THEMES = {
  dark: {
    app:          'bg-black text-gray-300',
    header:       'bg-zinc-950/90 border-zinc-800 backdrop-blur-md',
    sidebar:      'bg-zinc-950 border-zinc-800',
    card:         'bg-zinc-900 border-zinc-800 shadow-lg',
    cardInner:    'bg-zinc-950 border-zinc-800',
    input:        'bg-zinc-950 border-zinc-700 text-white placeholder-gray-600 focus:ring-violet-500',
    inputY:       'bg-zinc-950 border-zinc-700 text-yellow-400 font-bold focus:ring-yellow-500',
    btn:          'bg-yellow-500 text-black hover:bg-yellow-400',
    btnSec:       'bg-violet-600 text-white hover:bg-violet-500',
    btnGhost:     'bg-zinc-800 text-gray-300 hover:bg-zinc-700',
    btnDanger:    'text-gray-400 hover:text-red-400 bg-zinc-900 border-zinc-800',
    btnEdit:      'text-gray-400 hover:text-yellow-400 bg-zinc-900 border-zinc-800',
    text:         'text-white',
    textMuted:    'text-gray-400',
    accent1:      'text-violet-400',
    accent2:      'text-yellow-400',
    border:       'border-zinc-800',
    tabActive:    'border-yellow-400 text-yellow-400',
    tabInactive:  'border-transparent text-gray-500 hover:text-gray-300',
    tableHead:    'bg-zinc-950 text-gray-500 border-zinc-800',
    tableRow:     'hover:bg-zinc-800/50',
    success:      'text-emerald-400',
    successBg:    'bg-emerald-900/20 border-emerald-500/50 text-emerald-300',
    warning:      'text-yellow-400',
    warningBg:    'bg-yellow-900/20 border-yellow-500/50 text-yellow-300',
    danger:       'text-red-400',
    dangerBg:     'bg-red-900/20 border-red-500/50 text-red-300',
    toggle:       'bg-zinc-950 border-zinc-800',
    toggleActive: 'bg-zinc-800 text-white shadow',
    menuBg:       'bg-zinc-900 border-zinc-700 shadow-xl',
    badge: (c) => c === 'AA' ? 'text-violet-400 bg-violet-900/30 border-violet-500/50'
                : c === 'A'  ? 'text-yellow-400 bg-yellow-900/30 border-yellow-500/50'
                :              'text-gray-300 bg-zinc-800 border-zinc-600',
  },
  light: {
    app:          'bg-gray-50 text-gray-800',
    header:       'bg-white/90 border-gray-200 backdrop-blur-md',
    sidebar:      'bg-white border-gray-200',
    card:         'bg-white border-gray-200 shadow-sm',
    cardInner:    'bg-gray-50 border-gray-200',
    input:        'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-blue-500',
    inputY:       'bg-white border-gray-300 text-indigo-700 font-bold focus:ring-indigo-500',
    btn:          'bg-blue-600 text-white hover:bg-blue-700',
    btnSec:       'bg-indigo-600 text-white hover:bg-indigo-700',
    btnGhost:     'bg-gray-100 text-gray-600 hover:bg-gray-200',
    btnDanger:    'text-gray-400 hover:text-red-500 bg-gray-50 border-gray-200',
    btnEdit:      'text-gray-400 hover:text-blue-500 bg-gray-50 border-gray-200',
    text:         'text-gray-900',
    textMuted:    'text-gray-500',
    accent1:      'text-blue-600',
    accent2:      'text-indigo-600',
    border:       'border-gray-200',
    tabActive:    'border-blue-600 text-blue-600',
    tabInactive:  'border-transparent text-gray-500 hover:text-gray-700',
    tableHead:    'bg-gray-50 text-gray-500 border-gray-200',
    tableRow:     'hover:bg-gray-50',
    success:      'text-green-600',
    successBg:    'bg-green-50 border-green-200 text-green-800',
    warning:      'text-yellow-600',
    warningBg:    'bg-yellow-50 border-yellow-200 text-yellow-800',
    danger:       'text-red-600',
    dangerBg:     'bg-red-50 border-red-200 text-red-800',
    toggle:       'bg-gray-100 border-gray-200',
    toggleActive: 'bg-white text-blue-700 shadow border border-blue-200',
    menuBg:       'bg-white border-gray-200 shadow-xl',
    badge: (c) => c === 'AA' ? 'text-indigo-700 bg-indigo-100 border-indigo-200'
                : c === 'A'  ? 'text-blue-700 bg-blue-100 border-blue-200'
                :              'text-gray-600 bg-gray-100 border-gray-200',
  },
};

// ─── Módulos de navegación ────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',      Icon: LayoutDashboard, desc: 'KPIs y alertas',        dataKey: null },
  { id: 'forecast',     label: 'Forecasting',    Icon: TrendingUp,      desc: 'Proyección de demanda', dataKey: 'forecastData' },
  { id: 'assortment',   label: 'Assortment OTB', Icon: ShoppingCart,    desc: 'Compra y presupuesto',  dataKey: 'otbData' },
  { id: 'distribucion', label: 'Distribución',   Icon: Map,             desc: 'Surtido a tiendas',     dataKey: 'distributionData' },
  { id: 'resurtido',    label: 'Resurtido',       Icon: RefreshCw,       desc: 'Reposición continua',   dataKey: 'replenishmentData' },
  { id: 'traslados', label: 'Traslados', Icon: ArrowLeftRight, desc: 'Transferencias entre centros', dataKey: null },
];

const PIPELINE_STEPS = [
  { label: 'Forecast → OTB',     from: 'forecastData',     to: 'assortment' },
  { label: 'OTB → Distribución', from: 'otbData',          to: 'distribucion' },
  { label: 'Dist → Resurtido',   from: 'distributionData', to: 'resurtido' },
];

// ─── Panel de Asistencia ──────────────────────────────────────────────────────
function AssistPanel({ isDark, onClose }) {
  const bg    = isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200';
  const text  = isDark ? 'text-white' : 'text-gray-900';
  const muted = isDark ? 'text-zinc-400' : 'text-gray-500';
  const item  = isDark
    ? 'bg-zinc-900 border-zinc-800 hover:border-violet-500/40'
    : 'bg-gray-50 border-gray-200 hover:border-blue-300';

  const topics = [
    { Icon: TrendingUp,   color: 'text-violet-400', label: 'Forecasting',      desc: 'Modelos, parámetros y horizonte' },
    { Icon: ShoppingCart, color: 'text-yellow-400', label: 'Assortment OTB',   desc: 'Clusters, curvas y presupuesto' },
    { Icon: Map,          color: 'text-blue-400',   label: 'Distribución',      desc: 'Surtido por cluster y chequera' },
    { Icon: RefreshCw,    color: 'text-emerald-400',label: 'Resurtido',         desc: 'CSV, filtros y exportación' },
    { Icon: Zap,          color: 'text-orange-400', label: 'Pipeline de datos', desc: 'Cómo comparten info los módulos' },
  ];

  return (
    <div
      className={`absolute right-0 top-12 w-76 rounded-2xl border shadow-2xl z-50 overflow-hidden ${bg}`}
      style={{
        width: '300px',
        boxShadow: isDark
          ? '0 0 40px rgba(124,58,237,0.2), 0 20px 40px rgba(0,0,0,0.6)'
          : '0 8px 32px rgba(0,0,0,0.15)',
      }}
    >
      {/* Header */}
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

      {/* Descripción */}
      <div className="px-4 pt-3 pb-2">
        <p className={`text-xs leading-relaxed ${muted}`}>
          GO Planner es un sistema de planeación retail end-to-end. Cada módulo funciona de forma independiente y puede compartir datos con los demás.
        </p>
      </div>

      {/* Módulos */}
      <div className="px-3 pb-3 space-y-1.5">
        <p className={`text-[9px] font-black uppercase tracking-widest px-1 mb-2 ${muted}`}>Módulos disponibles</p>
        {topics.map(({ Icon, color, label, desc }) => (
          <div key={label} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-default transition ${item}`}>
            <Icon size={14} className={color} />
            <div className="min-w-0">
              <p className={`font-bold text-xs ${text}`}>{label}</p>
              <p className={`text-[10px] truncate ${muted}`}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div className={`mx-3 mb-3 p-3 rounded-xl border ${isDark ? 'bg-violet-900/20 border-violet-500/30' : 'bg-blue-50 border-blue-200'}`}>
        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-violet-400' : 'text-blue-600'}`}>💡 Tip del pipeline</p>
        <p className={`text-[10px] leading-relaxed ${muted}`}>
          Usa el sidebar para pasar datos entre módulos. Los botones se activan automáticamente cuando hay datos disponibles en el módulo anterior.
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ t, isDark }) {
  const global   = useGlobal();
  const dispatch = useDispatch();
  const { kpis = {}, alerts = [] } = global;

  const kpiCards = [
    { label: 'Inventario Total', val: kpis.totalInv?.toLocaleString()  || '—', unit: 'uds',    color: t.text },
    { label: 'Cobertura',        val: kpis.coverageWeeks?.toFixed(1)   || '—', unit: 'semanas', color: isDark ? 'text-yellow-400' : 'text-amber-600' },
    { label: 'Fill Rate',        val: kpis.fillRate?.toFixed(1)        || '—', unit: '%',       color: kpis.fillRate > 0 && kpis.fillRate < 85 ? 'text-red-400' : (isDark ? 'text-emerald-400' : 'text-green-600') },
    { label: 'OTB Disponible',   val: kpis.otbRemaining != null ? `$${Math.abs(kpis.otbRemaining).toLocaleString()}` : '—', unit: kpis.otbRemaining < 0 ? '⚠ excedido' : '', color: kpis.otbRemaining < 0 ? 'text-red-400' : (isDark ? 'text-emerald-400' : 'text-green-600') },
  ];

  const anyData = NAV_ITEMS.slice(1).some(m => m.dataKey && !!global[m.dataKey]);

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <h2 className={`text-5xl font-black tracking-tighter uppercase leading-none ${t.text}`}>
          GO <span className={isDark ? 'text-violet-500' : 'text-blue-600'}>PLANNER</span>
        </h2>
        <p className={`mt-2 text-sm ${t.textMuted}`}>
          Sistema integrado de planeación retail · Los módulos se comunican pero funcionan de forma independiente
        </p>
      </div>

      {anyData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map((c, i) => (
            <div key={i} className={`p-5 rounded-[28px] border ${t.card}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${t.textMuted}`}>{c.label}</p>
              <p className={`text-3xl font-black leading-none ${c.color}`}>{c.val}</p>
              {c.unit && <p className={`text-[10px] font-bold mt-1 ${t.textMuted}`}>{c.unit}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {NAV_ITEMS.slice(1).map(m => {
          const hasData = m.dataKey && !!global[m.dataKey];
          const Icon = m.Icon;
          return (
            <button
              key={m.id}
              onClick={() => globalActions.setModule(dispatch, m.id)}
              className={`p-6 rounded-[28px] border text-left transition-all hover:scale-[1.01] ${t.card} ${isDark ? 'hover:border-violet-500/40' : 'hover:border-blue-300'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-violet-600/20 text-violet-400' : 'bg-blue-50 text-blue-600'}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <p className={`font-black ${t.text}`}>{m.label}</p>
                  {hasData && <span className={`text-[9px] font-bold ${isDark ? 'text-emerald-400' : 'text-green-600'}`}>✓ Con datos</span>}
                </div>
              </div>
              <p className={`text-xs ${t.textMuted}`}>{m.desc}</p>
            </button>
          );
        })}
      </div>

      {alerts.length > 0 && (
        <div className={`p-6 rounded-[28px] border ${t.card}`}>
          <p className={`font-black text-sm uppercase tracking-widest mb-4 ${t.text}`}>Centro de Alertas</p>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className={`p-3 rounded-xl border text-xs ${a.level === 'critical' ? t.dangerBg : t.warningBg}`}>
                <p className="font-black">{a.title}</p>
                <p className="mt-0.5 opacity-80">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!anyData && (
        <div className={`p-10 rounded-[32px] border text-center ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'}`}>
          <p className="text-4xl mb-3">🚀</p>
          <p className={`font-black text-xl ${t.text}`}>Bienvenido a GO Planner</p>
          <p className={`text-sm mt-2 ${t.textMuted}`}>Abre cualquier módulo para comenzar.</p>
        </div>
      )}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
function Shell() {
  const global   = useGlobal();
  const dispatch = useDispatch();
  const { theme, activeModule, alerts = [], kpis = {} } = global;
  const isDark = theme === 'dark';
  const t = THEMES[theme];

  // false = colapsado (solo iconos) | true = expandido (labels visibles)
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showAssist,      setShowAssist]      = useState(false);
  const assistRef = useRef(null);

  const critical = alerts.filter(a => a.level === 'critical').length;

  // Cerrar asistencia al hacer click fuera
  useEffect(() => {
    const h = (e) => {
      if (assistRef.current && !assistRef.current.contains(e.target)) setShowAssist(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Navegar y colapsar sidebar automáticamente
  const handleNavigate = (id) => {
    globalActions.setModule(dispatch, id);
    setSidebarExpanded(false);
  };

  const moduleProps = { t, isDark };

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':    return <Dashboard {...moduleProps} />;
      case 'forecast':     return <ModuleForecast {...moduleProps} />;
      case 'assortment':   return <ModuleAssortment {...moduleProps} />;
      case 'distribucion': return <ModuleDistribucion {...moduleProps} />;
      case 'resurtido':    return <ModuleResurtido {...moduleProps} />;
      case 'traslados': return <ModuleTraslados />;  
      default:             return <Dashboard {...moduleProps} />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans ${t.app}`}>

      {/* ══════════ TOPBAR ══════════ */}
      <header className={`sticky top-0 z-30 border-b ${t.header}`}>
        <div className="flex items-center justify-between px-4 py-3">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? 'bg-violet-600' : 'bg-blue-600'} text-white shadow-lg shrink-0`}>
              <Layers size={18} />
            </div>
            <div className="hidden sm:block">
              <h1 className={`text-lg font-black tracking-tighter uppercase leading-none ${t.text}`}>
                GO <span className={isDark ? 'text-violet-500' : 'text-blue-600'}>PLANNER</span>
              </h1>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted}`}>
                {NAV_ITEMS.find(n => n.id === activeModule)?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">

            {/* KPIs rápidos */}
            {kpis.coverageWeeks > 0 && (
              <div className="hidden lg:flex gap-2">
                <div className={`px-3 py-1.5 rounded-xl border text-xs ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                  <span className={t.textMuted}>Cobertura: </span>
                  <span className={`font-black ${isDark ? 'text-yellow-400' : 'text-amber-600'}`}>{kpis.coverageWeeks.toFixed(1)}sem</span>
                </div>
                {kpis.fillRate > 0 && (
                  <div className={`px-3 py-1.5 rounded-xl border text-xs ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                    <span className={t.textMuted}>Fill: </span>
                    <span className={`font-black ${kpis.fillRate < 85 ? 'text-red-400' : (isDark ? 'text-emerald-400' : 'text-green-600')}`}>{kpis.fillRate.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Alertas */}
            <button className={`relative p-2.5 rounded-xl border transition ${
              critical > 0
                ? isDark ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'bg-red-50 border-red-300 text-red-600'
                : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'
            }`}>
              <Bell size={17} />
              {alerts.length > 0 && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white ${critical > 0 ? 'bg-red-500' : 'bg-yellow-500'}`}>
                  {alerts.length}
                </span>
              )}
            </button>

            {/* ── Botón Asistencia ── */}
            <div className="relative" ref={assistRef}>
              <button
                onClick={() => setShowAssist(v => !v)}
                title="Asistencia GO Planner"
                className={`p-2.5 rounded-xl border transition-all ${
                  showAssist
                    ? isDark ? 'bg-violet-600 border-violet-500 text-white' : 'bg-blue-600 border-blue-500 text-white'
                    : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-violet-400 hover:border-violet-500/50'
                              : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300'
                }`}
                style={showAssist && isDark ? { boxShadow: '0 0 18px rgba(124,58,237,0.5)' } : {}}
              >
                <HelpCircle size={17} />
              </button>
              {showAssist && <AssistPanel isDark={isDark} onClose={() => setShowAssist(false)} />}
            </div>

            {/* Toggle tema */}
            <button
              onClick={() => globalActions.setTheme(dispatch, isDark ? 'light' : 'dark')}
              className={`p-2.5 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-yellow-400' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600'}`}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Barra de estado del pipeline */}
        <div className={`flex items-center gap-2 px-4 py-1.5 text-[10px] border-t overflow-x-auto ${isDark ? 'border-zinc-800/50 bg-black/20' : 'border-gray-100 bg-gray-50/50'}`}>
          <span className={`font-black uppercase tracking-widest mr-1 shrink-0 ${t.textMuted}`}>Datos:</span>
          {NAV_ITEMS.slice(1).map((m, i) => (
            <span key={m.id} className={`font-bold whitespace-nowrap ${global[m.dataKey] ? (isDark ? 'text-emerald-400' : 'text-green-600') : (isDark ? 'text-zinc-700' : 'text-gray-300')}`}>
              {global[m.dataKey] ? '✓ ' : '○ '}{m.label}{i < 3 ? ' ·' : ''}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ══════════ SIDEBAR ══════════ */}
        <aside
          className={`relative flex flex-col border-r shrink-0 transition-all duration-300 ease-in-out ${t.sidebar}`}
          style={{ width: sidebarExpanded ? '216px' : '58px' }}
        >
          {/* Botón toggle expansión */}
          <button
            onClick={() => setSidebarExpanded(v => !v)}
            className={`flex items-center justify-center h-11 border-b shrink-0 transition ${t.border} ${
              isDark ? 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/60' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Menu size={16} />
          </button>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-1.5 overflow-x-hidden">
            {NAV_ITEMS.map(item => {
              const isActive = activeModule === item.id;
              const hasData  = item.dataKey && !!global[item.dataKey];
              const Icon     = item.Icon;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  title={!sidebarExpanded ? item.label : undefined}
                  className={`w-full flex items-center rounded-xl transition-all duration-200 relative group overflow-hidden
                    ${sidebarExpanded ? 'px-2.5 py-2 gap-3' : 'justify-center py-2.5 gap-0'}
                    ${isActive
                      ? isDark ? 'bg-violet-600/12 text-white' : 'bg-blue-50 text-blue-700'
                      : isDark ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  style={isActive
                    ? isDark
                      ? { boxShadow: 'inset 0 0 20px rgba(124,58,237,0.08)' }
                      : { boxShadow: 'inset 0 0 10px rgba(59,130,246,0.08)' }
                    : {}
                  }
                >
                  {/* Línea lateral glow */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                      style={{
                        background: isDark ? '#8b5cf6' : '#3b82f6',
                        boxShadow: isDark
                          ? '0 0 10px 2px rgba(139,92,246,0.7)'
                          : '0 0 8px 1px rgba(59,130,246,0.5)',
                      }}
                    />
                  )}

                  {/* Ícono con glow si activo */}
                  <span
                    className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                      isActive
                        ? isDark ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white'
                        : isDark ? 'text-zinc-500' : 'text-gray-400'
                    }`}
                    style={isActive && isDark
                      ? { boxShadow: '0 0 14px rgba(139,92,246,0.65)' }
                      : isActive && !isDark
                        ? { boxShadow: '0 0 10px rgba(59,130,246,0.4)' }
                        : {}
                    }
                  >
                    <Icon size={15} />
                  </span>

                  {/* Labels — solo expandido */}
                  {sidebarExpanded && (
                    <div className="flex-1 min-w-0 text-left">
                      <p className={`font-bold text-xs truncate leading-tight ${isActive ? (isDark ? 'text-white' : 'text-blue-700') : ''}`}>
                        {item.label}
                      </p>
                      <p className={`text-[10px] truncate leading-tight mt-0.5 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                        {item.desc}
                      </p>
                    </div>
                  )}

                  {/* Punto de datos — solo expandido */}
                  {sidebarExpanded && hasData && (
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDark ? 'bg-emerald-500' : 'bg-green-500'}`} />
                  )}

                  {/* Tooltip flotante — solo colapsado */}
                  {!sidebarExpanded && (
                    <span className={`absolute left-14 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap z-50
                      pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-100
                      ${isDark ? 'bg-zinc-800 border border-zinc-700 text-white' : 'bg-white border border-gray-200 text-gray-800 shadow-md'}`}>
                      {item.label}
                      {hasData && (
                        <span className={`ml-1.5 text-[9px] ${isDark ? 'text-emerald-400' : 'text-green-600'}`}>✓</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Pipeline expandido */}
          {sidebarExpanded && (
            <div className={`p-2.5 border-t shrink-0 ${t.border} ${isDark ? 'bg-zinc-950/80' : 'bg-gray-50'}`}>
              <p className={`text-[9px] font-black uppercase tracking-widest mb-2 px-1 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                Compartir datos
              </p>
              {PIPELINE_STEPS.map(step => {
                const active = !!global[step.from];
                return (
                  <button
                    key={step.label}
                    onClick={() => active && handleNavigate(step.to)}
                    disabled={!active}
                    className={`w-full text-[10px] font-bold py-1.5 px-2.5 rounded-xl border transition-all flex items-center justify-between mb-1 ${
                      active
                        ? isDark ? 'border-violet-500/30 text-violet-400 hover:bg-violet-500/10' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                        : isDark ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="truncate">{step.label}</span>
                    <span className="ml-1 shrink-0">→</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pipeline colapsado — solo puntos de estado */}
          {!sidebarExpanded && (
            <div className={`flex flex-col items-center gap-1.5 py-3 border-t shrink-0 ${t.border}`}>
              {PIPELINE_STEPS.map(step => (
                <span
                  key={step.label}
                  title={`${step.label} — ${global[step.from] ? 'datos disponibles' : 'sin datos'}`}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    global[step.from]
                      ? isDark ? 'bg-emerald-500' : 'bg-green-500'
                      : isDark ? 'bg-zinc-700' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}
        </aside>

        {/* ══════════ CONTENIDO ══════════ */}
        <main className={`flex-1 overflow-y-auto min-w-0 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
          {renderModule()}
        </main>
      </div>
    </div>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <GlobalProvider>
      <Shell />
    </GlobalProvider>
  );
}

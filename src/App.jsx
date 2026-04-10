// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — Shell principal de GO Planner
// Solo contiene: Topbar, Sidebar, Dashboard y routing de módulos
// Los módulos viven en src/modules/ — cada uno en su archivo
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { GlobalProvider, useGlobal, useDispatch, globalActions } from './context/GlobalContext';
import ModuleForecast     from './modules/ModuleForecast';
import ModuleAssortment   from './modules/ModuleAssortment';
import ModuleDistribución from './modules/ModuleDistribucion';
import ModuleReplenishment   from './modules/ModuleReplenishment';

import {
  Layers, Menu, Bell, Sun, Moon,
  TrendingUp, ShoppingCart, Map, RefreshCw, LayoutDashboard,
} from 'lucide-react';

// ─── Paletas de tema (pásalas como prop a cada móduloo) ───────────────────────
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
    badge:        (c) => c === 'AA' ? 'text-violet-400 bg-violet-900/30 border-violet-500/50'
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
    badge:        (c) => c === 'AA' ? 'text-indigo-700 bg-indigo-100 border-indigo-200'
                       : c === 'A'  ? 'text-blue-700 bg-blue-100 border-blue-200'
                       :              'text-gray-600 bg-gray-100 border-gray-200',
  },
};

// ─── Módulos disponibles ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',       Icon: LayoutDashboard, desc: 'KPIs y alertas',         dataKey: null },
  { id: 'forecast',    label: 'Forecasting',      Icon: TrendingUp,      desc: 'Proyección de demanda',  dataKey: 'forecastData' },
  { id: 'assortment',  label: 'Assortment OTB',   Icon: ShoppingCart,    desc: 'Compra y presupuesto',   dataKey: 'otbData' },
  { id: 'distribucion',label: 'Distribución',     Icon: Map,             desc: 'Surtido a tiendas',      dataKey: 'distributionData' },
  { id: 'resurtido',   label: 'Resurtido',        Icon: RefreshCw,       desc: 'Reposición continua',    dataKey: 'replenishmentData' },
];

// Botones del pipeline — solo activos si hay datos en el módulo origen
const PIPELINE_STEPS = [
  { label: 'Forecast → OTB',    from: 'forecastData',     to: 'assortment' },
  { label: 'OTB → Distribución',from: 'otbData',          to: 'distribucion' },
  { label: 'Dist → Resurtido',  from: 'distributionData', to: 'resurtido' },
];

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ t, isDark }) {
  const global   = useGlobal();
  const dispatch = useDispatch();
  const { kpis = {}, alerts = [] } = global;

  const kpiCards = [
    { label: 'Inventario Total',  val: kpis.totalInv?.toLocaleString()     || '—', unit: 'uds',     color: t.text },
    { label: 'Cobertura',         val: kpis.coverageWeeks?.toFixed(1)      || '—', unit: 'semanas',  color: isDark ? 'text-yellow-400' : 'text-amber-600' },
    { label: 'Fill Rate',         val: kpis.fillRate?.toFixed(1)           || '—', unit: '%',        color: kpis.fillRate > 0 && kpis.fillRate < 85 ? 'text-red-400' : (isDark ? 'text-emerald-400' : 'text-green-600') },
    { label: 'OTB Disponible',    val: kpis.otbRemaining != null ? `$${Math.abs(kpis.otbRemaining).toLocaleString()}` : '—', unit: kpis.otbRemaining < 0 ? '⚠ excedido' : '', color: kpis.otbRemaining < 0 ? 'text-red-400' : (isDark ? 'text-emerald-400' : 'text-green-600') },
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

      {/* KPIs — solo si hay datos de algún módulo */}
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

      {/* Módulos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {NAV_ITEMS.slice(1).map(m => {
          const hasData = m.dataKey && !!global[m.dataKey];
          const Icon = m.Icon;
          return (
            <button key={m.id} onClick={() => globalActions.setModule(dispatch, m.id)}
              className={`p-6 rounded-[28px] border text-left transition-all hover:scale-[1.01] ${t.card} ${isDark ? 'hover:border-violet-500/40' : 'hover:border-blue-300'}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-violet-600/20 text-violet-400' : 'bg-blue-50 text-blue-600'}`}><Icon size={20} /></div>
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

      {/* Alertas */}
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
          <p className={`text-sm mt-2 ${t.textMuted}`}>Abre cualquier módulo para comenzar. Los datos se comparten automáticamente cuando los generas.</p>
        </div>
      )}
    </div>
  );
}

// ─── Shell interno ────────────────────────────────────────────────────────────
function Shell() {
  const global   = useGlobal();
  const dispatch = useDispatch();
  const { theme, activeModule, alerts = [], kpis = {} } = global;
  const isDark = theme === 'dark';
  const t = THEMES[theme];
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const critical = alerts.filter(a => a.level === 'critical').length;
  const moduleProps = { t, isDark };

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':   return <Dashboard {...moduleProps} />;
      case 'forecast':    return <ModuleForecast {...moduleProps} />;
      case 'assortment':  return <ModuleAssortment {...moduleProps} />;
      case 'distribucion':return <ModuleDistribucion {...moduleProps} />;
      case 'resurtido':   return <ModuleReplenishment {...moduleProps} />;
      default:            return <Dashboard {...moduleProps} />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans ${t.app}`}>

      {/* ── Topbar ── */}
      <header className={`sticky top-0 z-30 border-b ${t.header}`}>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(v => !v)}
              className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500'}`}>
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-violet-600' : 'bg-blue-600'} text-white shadow-lg`}>
                <Layers size={20} />
              </div>
              <div>
                <h1 className={`text-xl font-black tracking-tighter uppercase leading-none ${t.text}`}>
                  GO <span className={isDark ? 'text-violet-500' : 'text-blue-600'}>PLANNER</span>
                </h1>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted}`}>
                  {NAV_ITEMS.find(n => n.id === activeModule)?.label || 'Dashboard'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* KPIs rápidos — solo si existen */}
            {kpis.coverageWeeks > 0 && (
              <div className={`hidden lg:flex items-center gap-2`}>
                <div className={`px-3 py-1.5 rounded-xl border text-xs ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                  <span className={t.textMuted}>Cobertura: </span>
                  <span className={`font-black ${isDark ? 'text-yellow-400' : 'text-amber-600'}`}>{kpis.coverageWeeks.toFixed(1)}sem</span>
                </div>
                {kpis.fillRate > 0 && (
                  <div className={`px-3 py-1.5 rounded-xl border text-xs ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                    <span className={t.textMuted}>Fill Rate: </span>
                    <span className={`font-black ${kpis.fillRate < 85 ? 'text-red-400' : (isDark ? 'text-emerald-400' : 'text-green-600')}`}>{kpis.fillRate.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Alertas */}
            <div className={`relative p-2.5 rounded-xl border cursor-default ${critical > 0 ? (isDark ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'bg-red-50 border-red-300 text-red-600') : (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-gray-200 text-gray-400')}`}>
              <Bell size={18} />
              {alerts.length > 0 && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white ${critical > 0 ? 'bg-red-500' : 'bg-yellow-500'}`}>
                  {alerts.length}
                </span>
              )}
            </div>

            {/* Toggle tema */}
            <button onClick={() => globalActions.setTheme(dispatch, isDark ? 'light' : 'dark')}
              className={`p-2.5 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-yellow-400' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600'}`}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* Barra de estado del pipeline — informativa, nunca bloqueante */}
        <div className={`flex items-center gap-2 px-5 py-1.5 text-[10px] border-t overflow-x-auto ${isDark ? 'border-zinc-800/50 bg-black/20' : 'border-gray-100 bg-gray-50/50'}`}>
          <span className={`font-black uppercase tracking-widest mr-1 shrink-0 ${t.textMuted}`}>Datos disponibles:</span>
          {NAV_ITEMS.slice(1).map((m, i) => (
            <span key={m.id} className={`font-bold whitespace-nowrap ${global[m.dataKey] ? (isDark ? 'text-emerald-400' : 'text-green-600') : (isDark ? 'text-zinc-700' : 'text-gray-300')}`}>
              {global[m.dataKey] ? '✓ ' : '○ '}{m.label}{i < 3 ? ' ·' : ''}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className={`flex flex-col border-r transition-all duration-300 overflow-hidden shrink-0 ${t.sidebar} ${sidebarOpen ? 'w-60' : 'w-0 opacity-0 pointer-events-none'}`}>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1 pt-4">
            {NAV_ITEMS.map(item => {
              const isActive = activeModule === item.id;
              const hasData  = item.dataKey && !!global[item.dataKey];
              const Icon     = item.Icon;
              return (
                <button key={item.id} onClick={() => globalActions.setModule(dispatch, item.id)}
                  className={`w-full group p-3 rounded-2xl transition-all flex items-center gap-3 border text-left ${
                    isActive
                      ? isDark ? 'bg-zinc-900 border-violet-500/50' : 'bg-blue-50 border-blue-200'
                      : isDark ? 'border-transparent hover:bg-zinc-900/50' : 'border-transparent hover:bg-gray-50'
                  }`}>
                  <div className={`p-1.5 rounded-xl shrink-0 ${isActive ? (isDark ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white') : (isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500')}`}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${isActive ? t.text : t.textMuted}`}>{item.label}</p>
                    <p className={`text-[10px] truncate ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{item.desc}</p>
                  </div>
                  {hasData && <span className={`w-2 h-2 rounded-full shrink-0 ${isDark ? 'bg-emerald-500' : 'bg-green-500'}`} />}
                </button>
              );
            })}
          </nav>

          {/* Pipeline manual — solo activos con datos */}
          <div className={`p-3 border-t ${t.border} ${isDark ? 'bg-zinc-950/80' : 'bg-gray-50'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Compartir datos</p>
            {PIPELINE_STEPS.map(step => {
              const active = !!global[step.from];
              return (
                <button key={step.label} onClick={() => active && globalActions.setModule(dispatch, step.to)} disabled={!active}
                  className={`w-full text-[10px] font-bold py-1.5 px-3 rounded-xl border transition-all flex items-center justify-between mb-1.5 ${
                    active
                      ? isDark ? 'border-violet-500/30 text-violet-400 hover:bg-violet-500/10' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                      : isDark ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed'
                  }`}
                  title={active ? `Ir a ${step.to}` : 'Genera datos en el módulo anterior primero'}>
                  {step.label} <span>→</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Contenido ── */}
        <main className={`flex-1 overflow-y-auto ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
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

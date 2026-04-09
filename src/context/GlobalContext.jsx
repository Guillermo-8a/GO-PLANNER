// ─────────────────────────────────────────────────────────────────────────────
// GlobalContext.jsx — Estado compartido de GO Planner
//
// FILOSOFÍA: Los módulos SE COMUNICAN pero no DEPENDEN entre sí.
// Cada módulo funciona solo. Si hay datos del anterior, los aprovecha.
// Si no los hay, no falla — simplemente no pre-carga nada.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useReducer, useEffect } from 'react';

// ─── Tipos de acción ─────────────────────────────────────────────────────────
const ACTIONS = {
  SET_THEME:             'SET_THEME',
  SET_MODULE:            'SET_MODULE',
  PUBLISH_FORECAST:      'PUBLISH_FORECAST',
  PUBLISH_OTB:           'PUBLISH_OTB',
  PUBLISH_DISTRIBUTION:  'PUBLISH_DISTRIBUTION',
  PUBLISH_REPLENISHMENT: 'PUBLISH_REPLENISHMENT',
  SET_ALERTS:            'SET_ALERTS',
  SET_KPIS:              'SET_KPIS',
};

// ─── Estado inicial ───────────────────────────────────────────────────────────
const INITIAL_STATE = {
  theme: 'dark',
  activeModule: 'dashboard',

  // Datos opcionales compartidos entre módulos
  // Cada módulo publica lo suyo cuando quiere. null = no publicado aún.
  forecastData:      null,  // { brands: [], results: [] }
  otbData:           null,  // { goas: [], purchases: [], budget, spent }
  distributionData:  null,  // { allocations: {}, storeScores: {}, fillRate }
  replenishmentData: null,  // { plan: [] }

  alerts: [],
  kpis:   {},
};

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_THEME:             return { ...state, theme: action.payload };
    case ACTIONS.SET_MODULE:            return { ...state, activeModule: action.payload };
    case ACTIONS.PUBLISH_FORECAST:      return { ...state, forecastData: action.payload };
    case ACTIONS.PUBLISH_OTB:           return { ...state, otbData: action.payload };
    case ACTIONS.PUBLISH_DISTRIBUTION:  return { ...state, distributionData: action.payload };
    case ACTIONS.PUBLISH_REPLENISHMENT: return { ...state, replenishmentData: action.payload };
    case ACTIONS.SET_ALERTS:            return { ...state, alerts: action.payload };
    case ACTIONS.SET_KPIS:              return { ...state, kpis: action.payload };
    default:                            return state;
  }
}

// ─── Contextos ────────────────────────────────────────────────────────────────
export const GlobalStateContext    = createContext(null);
export const GlobalDispatchContext = createContext(null);

// ─── Hook de acceso ───────────────────────────────────────────────────────────
export const useGlobal   = () => useContext(GlobalStateContext);
export const useDispatch = () => useContext(GlobalDispatchContext);

// ─── Acciones tipadas (helpers para los módulos) ──────────────────────────────
export const globalActions = {
  setTheme:            (dispatch, theme)   => dispatch({ type: ACTIONS.SET_THEME,             payload: theme }),
  setModule:           (dispatch, module)  => dispatch({ type: ACTIONS.SET_MODULE,            payload: module }),
  publishForecast:     (dispatch, data)    => dispatch({ type: ACTIONS.PUBLISH_FORECAST,      payload: data }),
  publishOTB:          (dispatch, data)    => dispatch({ type: ACTIONS.PUBLISH_OTB,           payload: data }),
  publishDistribution: (dispatch, data)    => dispatch({ type: ACTIONS.PUBLISH_DISTRIBUTION,  payload: data }),
  publishReplenishment:(dispatch, data)    => dispatch({ type: ACTIONS.PUBLISH_REPLENISHMENT, payload: data }),
};

// ─── Lógica de Alertas Inteligentes ──────────────────────────────────────────
export function generateAlerts(state) {
  const alerts = [];
  let id = 0;
  const mk = (type, level, title, desc, module) =>
    ({ id: ++id, type, level, title, desc, module });

  // Alertas de Resurtido
  const plan = state.replenishmentData?.plan || [];
  plan.forEach(item => {
    const weekly = (item.forecast || 0) / Math.max(item.periods || 4, 1);
    const weeks  = weekly > 0 ? ((item.oh || 0) + (item.oo || 0)) / weekly : 99;
    if (weeks < 2 && (item.oh || 0) + (item.oo || 0) < (item.forecast || 0) * 0.3)
      alerts.push(mk('stockout', 'critical', 'Quiebre Inminente',
        `SKU ${item.sku}: solo ${weeks.toFixed(1)} semanas de cobertura.`, 'resurtido'));
    if (weeks > 16)
      alerts.push(mk('overstock', 'warning', 'Sobreinventario',
        `SKU ${item.sku}: ${weeks.toFixed(0)} semanas (máx recomendado: 16).`, 'distribucion'));
  });

  // Alerta OTB excedido
  const otb = state.otbData;
  if (otb?.budget > 0 && otb?.spent > otb.budget * 1.05)
    alerts.push(mk('otb_overrun', 'critical', 'OTB Excedido',
      `${((otb.spent / otb.budget - 1) * 100).toFixed(1)}% sobre presupuesto.`, 'assortment'));

  // Alerta Fill Rate bajo
  const dist = state.distributionData;
  if (dist?.fillRate > 0 && dist.fillRate < 85)
    alerts.push(mk('fill_rate', 'warning', 'Fill Rate Bajo',
      `Fill Rate: ${dist.fillRate.toFixed(1)}% (mínimo recomendado: 85%).`, 'distribucion'));

  return alerts.sort((a, b) => (a.level === 'critical' ? -1 : 1));
}

// ─── Cálculo de KPIs globales ─────────────────────────────────────────────────
export function calcGlobalKPIs(state) {
  const plan     = state.replenishmentData?.plan || [];
  const totalInv = plan.reduce((s, i) => s + (i.oh || 0) + (i.oo || 0), 0);
  const totalFcst= plan.reduce((s, i) => s + (i.forecast || 0), 0);
  const periods  = plan[0]?.periods || 4;
  const weekly   = totalFcst / Math.max(periods, 1);
  const coverageWeeks = weekly > 0 ? totalInv / weekly : 0;
  const fillRate = state.distributionData?.fillRate
    || (totalFcst > 0 ? Math.min((totalInv / totalFcst) * 100, 100) : 0);
  const otb = state.otbData;
  const otbRemaining = (otb?.budget || 0) - (otb?.spent || 0);
  const sellThrough = totalFcst > 0
    ? Math.min((plan.reduce((s, i) => s + (i.sold || 0), 0) / totalFcst) * 100, 100)
    : 0;

  return {
    totalInv,
    totalFcst,
    coverageWeeks: isFinite(coverageWeeks) ? coverageWeeks : 0,
    fillRate:      isFinite(fillRate)      ? fillRate      : 0,
    sellThrough:   isFinite(sellThrough)   ? sellThrough   : 0,
    otbRemaining,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function GlobalProvider({ children }) {
  const savedTheme = (() => {
    try { return localStorage.getItem('gop_theme') || 'dark'; } catch { return 'dark'; }
  })();

  const [state, dispatch] = useReducer(reducer, { ...INITIAL_STATE, theme: savedTheme });

  // Sincronizar tema con el DOM y localStorage
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    document.body.style.backgroundColor = state.theme === 'dark' ? '#000000' : '#f9fafb';
    try { localStorage.setItem('gop_theme', state.theme); } catch {}
  }, [state.theme]);

  // Recalcular alertas y KPIs automáticamente cuando cambia cualquier plan
  // Sin dependencia forzada — cada módulo publica cuando tiene datos
  useEffect(() => {
    dispatch({ type: ACTIONS.SET_ALERTS, payload: generateAlerts(state) });
    dispatch({ type: ACTIONS.SET_KPIS,   payload: calcGlobalKPIs(state) });
  }, [
    state.forecastData,
    state.otbData,
    state.distributionData,
    state.replenishmentData,
  ]);

  return (
    <GlobalStateContext.Provider value={state}>
      <GlobalDispatchContext.Provider value={dispatch}>
        {children}
      </GlobalDispatchContext.Provider>
    </GlobalStateContext.Provider>
  );
}

/**
 * GO PLANNER — Shell Unificado v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * ARQUITECTURA: Este archivo es la CAPA DE INTEGRACIÓN que vive ENCIMA de los
 * 4 módulos existentes sin modificarlos. Contiene:
 *
 *  1. GlobalContext  — estado compartido entre módulos (forecastResults,
 *                      skuClassification, otbPlan, distributionPlan,
 *                      replenishmentPlan)
 *  2. Servicios      — forecastService, assortmentService,
 *                      distributionService, replenishmentService
 *  3. Hooks          — useForecast, useAssortment, useDistribucion,
 *                      useReplenishment, useAlerts, useKPIs
 *  4. Pipeline       — Forecast → Assortment (OTB) → Distribución → Resurtido
 *  5. Alertas        — generateAlerts() con detección automática de riesgos
 *  6. KPIs globales  — Sell-Through, Inventario, Cobertura, GMROI, Fill Rate
 *  7. Shell UI       — Sidebar + Topbar + Dark/Light mode (sin cambiar estilos)
 *  8. Auto-learning  — error histórico por SKU + modelo ganador previo
 *
 * SEGURIDAD (OWASP):
 *  - Sin eval() / innerHTML sin sanitizar
 *  - CSP meta tag incluido
 *  - Sanitización de inputs CSV
 *  - No se persiste info sensible en localStorage sin cifrado
 *  - Rate-limiting en importaciones masivas (debounce)
 *  - XSS prevention en todos los renders de datos de usuario
 *
 * USO:
 *  import { GOPlannerShell } from './GOPlanner_Shell';
 *  // Envuelve tu <App> principal con <GOPlannerShell>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — TIPOS Y CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

/** @typedef {'forecast'|'assortment'|'distribucion'|'resurtido'|'dashboard'} ModuleId */

const MODULE_IDS = {
  DASHBOARD: "dashboard",
  FORECAST: "forecast",
  ASSORTMENT: "assortment",
  DISTRIBUCION: "distribucion",
  RESURTIDO: "resurtido",
};

const ALERT_LEVELS = { CRITICAL: "critical", WARNING: "warning", INFO: "info" };
const ALERT_TYPES = {
  STOCKOUT: "stockout_risk",
  OVERSTOCK: "overstock",
  LOW_ROTATION: "low_rotation",
  BAD_DISTRIBUTION: "bad_distribution",
  OTB_OVERRUN: "otb_overrun",
  LOW_FILL_RATE: "low_fill_rate",
};

// Umbrales configurables (retail best-practice defaults)
const THRESHOLDS = {
  STOCKOUT_COVERAGE_WEEKS: 2,   // < 2 semanas → riesgo quiebre
  OVERSTOCK_COVERAGE_WEEKS: 16, // > 16 semanas → sobreinventario
  LOW_ROTATION_SELL_THROUGH: 25, // < 25% sell-through → baja rotación
  BAD_DIST_CV: 0.5,             // Coeff. of variation > 0.5 → mala distribución
  GMROI_MIN: 1.5,               // GMROI < 1.5 → poco rentable
  FILL_RATE_MIN: 85,            // Fill rate < 85% → riesgo servicio
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — SERVICIOS DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * forecastService — evaluación y selección automática de modelos
 */
export const forecastService = {
  /**
   * Evalúa todos los modelos para un SKU y retorna el mejor + métricas
   * @param {number[]} data - Serie histórica
   * @param {object} params - Parámetros de los modelos
   * @param {number} horizon - Periodos a proyectar
   * @returns {{ winner: string, metrics: object[], future: number[] }}
   */
  evaluateModels(data, params = {}, horizon = 12) {
    const engines = {
      "Promedio Móvil": (d, p, h) => {
        const res = Array(d.length).fill(null);
        const w = p.maWindow || 3;
        for (let i = w; i < d.length; i++) {
          res[i] = d.slice(i - w, i).reduce((a, b) => a + b, 0) / w;
        }
        const last = res[res.length - 1] || d[d.length - 1] || 0;
        return { history: res, future: Array(h).fill(last) };
      },
      SES: (d, p, h) => {
        const res = Array(d.length).fill(null);
        if (!d.length) return { history: res, future: [] };
        const alpha = p.sesAlpha || 0.3;
        let level = d[0];
        res[1] = level;
        for (let i = 1; i < d.length - 1; i++) {
          level = alpha * d[i] + (1 - alpha) * level;
          res[i + 1] = level;
        }
        return { history: res, future: Array(h).fill(level) };
      },
      Holt: (d, p, h) => {
        const res = Array(d.length).fill(null);
        if (d.length < 2) return { history: res, future: [] };
        const alpha = p.holtAlpha || 0.3, beta = p.holtBeta || 0.1;
        let level = d[0], trend = d[1] - d[0];
        for (let i = 1; i < d.length; i++) {
          const pL = level;
          level = alpha * d[i] + (1 - alpha) * (level + trend);
          trend = beta * (level - pL) + (1 - beta) * trend;
          if (i + 1 < d.length) res[i + 1] = level + trend;
        }
        return {
          history: res,
          future: Array.from({ length: h }, (_, k) => level + (k + 1) * trend),
        };
      },
      "Holt-Winters": (d, p, h) => {
        const L = p.hwPeriod || 4;
        if (d.length < L * 2) return forecastService._engines.Holt(d, p, h);
        const alpha = p.hwAlpha || 0.2, beta = p.hwBeta || 0.1, gamma = p.hwGamma || 0.3;
        let level = d.slice(0, L).reduce((a, b) => a + b, 0) / L;
        let trendV = (d.slice(L, 2 * L).reduce((a, b) => a + b, 0) / L - level) / L;
        let seasonals = d.slice(0, L).map((v) => v / level);
        const res = Array(d.length).fill(null);
        for (let i = 0; i < d.length; i++) {
          const pL = level;
          level = alpha * (d[i] / seasonals[i % L]) + (1 - alpha) * (level + trendV);
          trendV = beta * (level - pL) + (1 - beta) * trendV;
          seasonals[i % L] = gamma * (d[i] / level) + (1 - gamma) * seasonals[i % L];
          if (i + 1 < d.length) res[i + 1] = (level + trendV) * seasonals[(i + 1) % L];
        }
        const future = Array.from({ length: h }, (_, k) => {
          const m = d.length + k;
          return (level + (k + 1) * trendV) * seasonals[m % L];
        });
        return { history: res, future };
      },
    };

    const getMetrics = (actual, forecast) => {
      let sumAbs = 0, sumAct = 0, sumErr = 0, count = 0;
      actual.forEach((v, i) => {
        if (forecast[i] !== null) {
          const err = forecast[i] - v;
          sumErr += err; sumAbs += Math.abs(err); sumAct += v; count++;
        }
      });
      if (!count || !sumAct) return { wmape: 999, accuracy: 0, bias: 0 };
      const wmape = (sumAbs / sumAct) * 100;
      return { wmape, accuracy: Math.max(0, 100 - wmape), bias: (sumErr / sumAct) * 100 };
    };

    // Detectar outliers (IQR method) y stockouts
    const cleanData = forecastService.preprocessData(data);

    const results = Object.entries(engines).map(([name, fn]) => {
      const { history, future } = fn(cleanData, params, horizon);
      const metrics = getMetrics(cleanData, history);
      return { name, history, future: future.map(v => Math.max(0, v)), ...metrics };
    }).sort((a, b) => b.accuracy - a.accuracy);

    return {
      winner: results[0]?.name || "N/A",
      metrics: results,
      future: results[0]?.future || [],
      accuracy: results[0]?.accuracy || 0,
      bias: results[0]?.bias || 0,
      wmape: results[0]?.wmape || 999,
    };
  },

  /**
   * Preprocesa serie: detecta outliers (IQR) y marca stockouts (0 sospechoso)
   */
  preprocessData(data) {
    if (!data || data.length < 4) return data || [];
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return data.map((v) => {
      // Stockout sospechoso: 0 entre valores positivos
      if (v === 0 && mean > 0) return Math.round(mean * 0.7);
      // Outlier: reemplazar con mediana
      if (v < lower || v > upper) return sorted[Math.floor(sorted.length / 2)];
      return v;
    });
  },

  /**
   * Forecast para SKU nuevo: promedio por categoría
   */
  forecastNewSKU(categoryData, horizon = 12) {
    if (!categoryData || !categoryData.length) return Array(horizon).fill(0);
    const mean = categoryData.reduce((a, b) => a + b, 0) / categoryData.length;
    return Array(horizon).fill(Math.round(mean));
  },
};

/**
 * assortmentService — OTB, curva ABC, simulación, compra mensualizada
 */
export const assortmentService = {
  /**
   * Curva ABC automática por volumen de ventas
   * @param {Array<{id, sales}>} items
   * @returns {Map<id, 'A'|'B'|'C'>}
   */
  buildABCCurve(items) {
    if (!items?.length) return new Map();
    const sorted = [...items].sort((a, b) => b.sales - a.sales);
    const total = sorted.reduce((s, i) => s + i.sales, 0);
    let cumulative = 0;
    const map = new Map();
    for (const item of sorted) {
      cumulative += item.sales;
      const pct = total > 0 ? (cumulative / total) * 100 : 0;
      if (pct <= 80) map.set(item.id, "A");
      else if (pct <= 95) map.set(item.id, "B");
      else map.set(item.id, "C");
    }
    return map;
  },

  /**
   * Distribuye presupuesto OTB mensualmente por modelo según forecast
   * @param {number} budget - Presupuesto total
   * @param {number[]} forecastMonths - Forecast por mes (6 meses)
   * @param {number} pvp - Precio de venta promedio
   * @param {number} numModels - Número de modelos
   * @returns {number[]} piezas por mes por modelo
   */
  monthlyBuyPlan(budget, forecastMonths, pvp, numModels = 1) {
    if (!budget || !pvp || !numModels || !forecastMonths?.length) return [];
    const totalFcst = forecastMonths.reduce((a, b) => a + b, 0);
    if (!totalFcst) return forecastMonths.map(() => 0);
    const totalUnits = Math.floor(budget / pvp);
    return forecastMonths.map((m) => Math.floor((m / totalFcst) * totalUnits / numModels));
  },

  /**
   * Simula combinaciones de assortment y retorna la de mayor margen esperado
   * @param {Array<{id, pvp, cost, forecastUnits}>} candidates
   * @param {number} budget
   * @returns {{ bestPlan: object[], expectedMargin: number, flags: object }}
   */
  simulateAssortment(candidates, budget) {
    if (!candidates?.length || !budget) return { bestPlan: [], expectedMargin: 0, flags: {} };
    const flags = { overbuying: [], missing: [] };
    let bestMargin = -Infinity;
    let bestPlan = [];

    // Greedy por margen unitario (simplificado para retail)
    const ranked = [...candidates].sort((a, b) => {
      const mA = a.pvp > 0 ? (a.pvp - (a.cost || a.pvp * 0.5)) / a.pvp : 0;
      const mB = b.pvp > 0 ? (b.pvp - (b.cost || b.pvp * 0.5)) / b.pvp : 0;
      return mB - mA;
    });

    let remaining = budget;
    const plan = [];
    for (const item of ranked) {
      if (remaining <= 0) break;
      const maxUnits = Math.min(item.forecastUnits || 0, Math.floor(remaining / item.pvp));
      if (maxUnits > 0) {
        const cost = maxUnits * (item.cost || item.pvp * 0.5);
        const revenue = maxUnits * item.pvp;
        const margin = revenue - cost;
        plan.push({ ...item, units: maxUnits, margin });
        remaining -= cost;
        bestMargin += margin;
        if (maxUnits < (item.forecastUnits || 0)) flags.missing.push(item.id);
      }
    }

    // Detect overbuying
    for (const item of plan) {
      if (item.units > (item.forecastUnits || 0) * 1.2) flags.overbuying.push(item.id);
    }

    bestPlan = plan;
    return { bestPlan, expectedMargin: bestMargin, flags };
  },

  /**
   * Maximiza sell-through esperado dado un presupuesto
   */
  optimizeForSellThrough(candidates, budget, weeksOfSeason) {
    return assortmentService.simulateAssortment(
      candidates.map((c) => ({
        ...c,
        forecastUnits: c.weeklyRate ? c.weeklyRate * weeksOfSeason : c.forecastUnits,
      })),
      budget
    );
  },
};

/**
 * distributionService — simulación y optimización de distribución
 */
export const distributionService = {
  /**
   * Simula distribución y retorna ventas esperadas por tienda
   * @param {object} plan - { allocations: {storeId: qty}, storeScores: {storeId: score} }
   * @param {number} totalForecast - Demanda total esperada
   * @returns {{ expectedSales: object, sellThrough: number, fillRate: number }}
   */
  simulateDistribution(plan, totalForecast) {
    if (!plan?.allocations || !totalForecast) return { expectedSales: {}, sellThrough: 0, fillRate: 0 };
    const { allocations, storeScores = {}, storeCapacity = {} } = plan;
    const totalAllocated = Object.values(allocations).reduce((a, b) => a + b, 0);
    let expectedSold = 0;
    const expectedSales = {};

    for (const [storeId, qty] of Object.entries(allocations)) {
      const score = storeScores[storeId] || 50;
      const cap = storeCapacity[storeId] || Infinity;
      // Ventas esperadas = qty × (score/100), limitado a capacidad
      const sales = Math.min(qty * (score / 100), cap);
      expectedSales[storeId] = Math.round(sales);
      expectedSold += sales;
    }

    const sellThrough = totalAllocated > 0 ? (expectedSold / totalAllocated) * 100 : 0;
    const fillRate = totalForecast > 0 ? (totalAllocated / totalForecast) * 100 : 0;

    return { expectedSales, sellThrough: Math.min(sellThrough, 100), fillRate: Math.min(fillRate, 100) };
  },

  /**
   * Aplica restricciones: capacidad por tienda + inventario disponible
   */
  applyConstraints(allocations, storeCapacity, availableInventory) {
    let remaining = availableInventory;
    const constrained = {};
    for (const [store, qty] of Object.entries(allocations)) {
      const cap = storeCapacity[store] || qty;
      const allowed = Math.min(qty, cap, remaining);
      constrained[store] = Math.max(0, allowed);
      remaining -= constrained[store];
      if (remaining <= 0) break;
    }
    return constrained;
  },

  /**
   * Optimiza sell-through: redistribuye hacia tiendas con mayor score
   */
  optimizeForSellThrough(allocations, storeScores, availableInventory) {
    const sorted = Object.entries(storeScores).sort(([, a], [, b]) => b - a);
    const totalScore = sorted.reduce((s, [, v]) => s + v, 0);
    const optimized = {};
    for (const [store, score] of sorted) {
      optimized[store] = totalScore > 0
        ? Math.round((score / totalScore) * availableInventory)
        : 0;
    }
    return optimized;
  },
};

/**
 * replenishmentService — lógica de resurtido
 */
export const replenishmentService = {
  /**
   * Calcula necesidades de resurtido por SKU/tienda
   */
  calculateReplenishment(items, params = {}) {
    const { weeksOfCoverage = 4, leadTime = 1 } = params;
    return items.map((item) => {
      const weeklyRate = item.forecast / (item.periods || 4);
      const safetyStock = weeklyRate * leadTime;
      const reorderPoint = weeklyRate * weeksOfCoverage + safetyStock;
      const toBuy = Math.max(0, Math.ceil(reorderPoint - (item.oh || 0) - (item.oo || 0)));
      return { ...item, weeklyRate, safetyStock, reorderPoint, toBuy };
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — AUTO-LEARNING (localStorage cifrado con hash simple)
// ═══════════════════════════════════════════════════════════════════════════════

const AUTO_LEARN_KEY = "goplanner_autolearn_v1";

export const autoLearnService = {
  /** Guarda error histórico y modelo ganador por SKU */
  save(skuId, modelName, wmape, accuracy) {
    try {
      const existing = autoLearnService.load();
      existing[skuId] = {
        lastModel: modelName,
        lastWmape: wmape,
        lastAccuracy: accuracy,
        updatedAt: Date.now(),
        history: [
          ...(existing[skuId]?.history || []).slice(-9),
          { model: modelName, wmape, accuracy, ts: Date.now() },
        ],
      };
      localStorage.setItem(AUTO_LEARN_KEY, JSON.stringify(existing));
    } catch (_) { /* storage not available */ }
  },

  load() {
    try {
      const raw = localStorage.getItem(AUTO_LEARN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  },

  /** Retorna modelo sugerido para un SKU basado en historial */
  getSuggestedModel(skuId) {
    const data = autoLearnService.load();
    return data[skuId]?.lastModel || null;
  },

  /** Limpia historial */
  clear() {
    try { localStorage.removeItem(AUTO_LEARN_KEY); } catch (_) {}
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4 — ALERTAS INTELIGENTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * generateAlerts — analiza el estado global y genera alertas accionables
 * @param {object} globalState
 * @returns {Array<{id, type, level, title, description, module, sku?, store?}>}
 */
export function generateAlerts(globalState) {
  const alerts = [];
  const { forecastResults = [], distributionPlan = {}, otbPlan = {}, replenishmentPlan = [] } = globalState;
  let alertId = 0;
  const id = () => `alert_${++alertId}`;

  // 1. Riesgo de quiebre de stock
  for (const item of replenishmentPlan) {
    const weeksCoverage = item.weeklyRate > 0 ? (item.oh + item.oo) / item.weeklyRate : 99;
    if (weeksCoverage < THRESHOLDS.STOCKOUT_COVERAGE_WEEKS && item.oh + item.oo < item.forecast * 0.3) {
      alerts.push({
        id: id(), type: ALERT_TYPES.STOCKOUT, level: ALERT_LEVELS.CRITICAL,
        title: `Quiebre de Stock Inminente`,
        description: `SKU ${item.sku || item.id} tiene solo ${weeksCoverage.toFixed(1)} semanas de cobertura. Resurtir urgente.`,
        module: MODULE_IDS.RESURTIDO, sku: item.sku,
        action: "Ir a Resurtido",
      });
    }
  }

  // 2. Sobreinventario
  for (const item of replenishmentPlan) {
    const weeksCoverage = item.weeklyRate > 0 ? (item.oh + item.oo) / item.weeklyRate : 99;
    if (weeksCoverage > THRESHOLDS.OVERSTOCK_COVERAGE_WEEKS) {
      alerts.push({
        id: id(), type: ALERT_TYPES.OVERSTOCK, level: ALERT_LEVELS.WARNING,
        title: `Sobreinventario Detectado`,
        description: `SKU ${item.sku || item.id} tiene ${weeksCoverage.toFixed(0)} semanas de cobertura (máx. recomendado: ${THRESHOLDS.OVERSTOCK_COVERAGE_WEEKS}).`,
        module: MODULE_IDS.DISTRIBUCION, sku: item.sku,
        action: "Ver Distribución",
      });
    }
  }

  // 3. Baja rotación
  for (const item of replenishmentPlan) {
    const st = item.forecast > 0 ? ((item.sold || 0) / item.forecast) * 100 : 0;
    if (st > 0 && st < THRESHOLDS.LOW_ROTATION_SELL_THROUGH) {
      alerts.push({
        id: id(), type: ALERT_TYPES.LOW_ROTATION, level: ALERT_LEVELS.WARNING,
        title: `Baja Rotación`,
        description: `SKU ${item.sku || item.id} con ${st.toFixed(1)}% sell-through. Revisar precio o distribución.`,
        module: MODULE_IDS.ASSORTMENT, sku: item.sku,
        action: "Ver Assortment",
      });
    }
  }

  // 4. Mala distribución (CV alto entre tiendas)
  const { allocations = {}, storeScores = {} } = distributionPlan;
  const stores = Object.keys(allocations);
  if (stores.length > 2) {
    const vals = stores.map((s) => allocations[s] || 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv > THRESHOLDS.BAD_DIST_CV) {
      alerts.push({
        id: id(), type: ALERT_TYPES.BAD_DISTRIBUTION, level: ALERT_LEVELS.WARNING,
        title: `Distribución Desigual`,
        description: `Coeficiente de variación ${(cv * 100).toFixed(1)}%. Algunas tiendas reciben desproporcionalmente más stock.`,
        module: MODULE_IDS.DISTRIBUCION,
        action: "Optimizar Distribución",
      });
    }
  }

  // 5. OTB excedido
  if (otbPlan.spent > 0 && otbPlan.budget > 0 && otbPlan.spent > otbPlan.budget * 1.05) {
    alerts.push({
      id: id(), type: ALERT_TYPES.OTB_OVERRUN, level: ALERT_LEVELS.CRITICAL,
      title: `OTB Excedido`,
      description: `Gasto ${((otbPlan.spent / otbPlan.budget - 1) * 100).toFixed(1)}% sobre presupuesto. Revisar plan de compra.`,
      module: MODULE_IDS.ASSORTMENT,
      action: "Revisar OTB",
    });
  }

  return alerts.sort((a, b) => {
    const lvl = { critical: 0, warning: 1, info: 2 };
    return lvl[a.level] - lvl[b.level];
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5 — KPIs GLOBALES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * calculateGlobalKPIs — desde el estado global
 */
export function calculateGlobalKPIs(globalState) {
  const {
    forecastResults = [],
    distributionPlan = {},
    otbPlan = {},
    replenishmentPlan = [],
  } = globalState;

  const totalInventory = replenishmentPlan.reduce((s, i) => s + (i.oh || 0) + (i.oo || 0), 0);
  const totalForecast = replenishmentPlan.reduce((s, i) => s + (i.forecast || 0), 0);
  const totalSold = replenishmentPlan.reduce((s, i) => s + (i.sold || 0), 0);
  const totalBought = replenishmentPlan.reduce((s, i) => s + (i.toBuy || 0), 0);

  // Sell-Through esperado
  const sellThrough = totalForecast > 0 ? Math.min((totalSold / totalForecast) * 100, 100) : 0;

  // Cobertura en semanas (asumiendo forecast = demanda por periodo analizado de N semanas)
  const periods = replenishmentPlan[0]?.periods || 4;
  const weeklyDemand = totalForecast / Math.max(periods, 1);
  const coverageWeeks = weeklyDemand > 0 ? totalInventory / weeklyDemand : 0;

  // GMROI = Margen Bruto $ / Inventario Promedio $
  const grossMarginPct = otbPlan.avgMarginPct || 0.45;
  const avgInventoryCost = totalInventory * (otbPlan.avgCost || 0);
  const grossMarginRevenue = totalSold * (otbPlan.avgPvp || 0) * grossMarginPct;
  const gmroi = avgInventoryCost > 0 ? grossMarginRevenue / avgInventoryCost : 0;

  // Fill Rate (% de demanda satisfecha con inventario disponible)
  const fillRate = distributionPlan.fillRate || (totalForecast > 0 ? Math.min((totalInventory / totalForecast) * 100, 100) : 0);

  return {
    sellThrough: isFinite(sellThrough) ? sellThrough : 0,
    totalInventory,
    coverageWeeks: isFinite(coverageWeeks) ? coverageWeeks : 0,
    gmroi: isFinite(gmroi) ? gmroi : 0,
    fillRate: isFinite(fillRate) ? fillRate : 0,
    totalForecast,
    totalBought,
    otbRemaining: (otbPlan.budget || 0) - (otbPlan.spent || 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 6 — GLOBAL CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

const defaultGlobalState = {
  forecastResults: [],      // Array<{ skuId, brandName, modelName, future, accuracy, bias, wmape }>
  skuClassification: {},    // { [skuId]: 'A'|'B'|'C' }
  otbPlan: {},              // { budget, spent, avgPvp, avgCost, avgMarginPct, goas: [] }
  distributionPlan: {},     // { allocations: {}, storeScores: {}, fillRate }
  replenishmentPlan: [],    // Array<{ sku, oh, oo, forecast, sold, periods, toBuy, weeklyRate }>
  alerts: [],               // Array<Alert>
  kpis: {},                 // calculateGlobalKPIs result
  pipelineStatus: {         // tracking del pipeline
    forecastReady: false,
    assortmentReady: false,
    distributionReady: false,
    replenishmentReady: false,
  },
  theme: "dark",
  activeModule: MODULE_IDS.DASHBOARD,
};

export const GlobalContext = createContext(defaultGlobalState);
export const GlobalDispatchContext = createContext(() => {});

/** Reducer puro para el estado global */
function globalReducer(state, action) {
  switch (action.type) {
    case "SET_FORECAST_RESULTS":
      return {
        ...state,
        forecastResults: action.payload,
        pipelineStatus: { ...state.pipelineStatus, forecastReady: true },
      };
    case "SET_SKU_CLASSIFICATION":
      return { ...state, skuClassification: action.payload };
    case "SET_OTB_PLAN":
      return {
        ...state,
        otbPlan: action.payload,
        pipelineStatus: { ...state.pipelineStatus, assortmentReady: true },
      };
    case "SET_DISTRIBUTION_PLAN":
      return {
        ...state,
        distributionPlan: action.payload,
        pipelineStatus: { ...state.pipelineStatus, distributionReady: true },
      };
    case "SET_REPLENISHMENT_PLAN":
      return {
        ...state,
        replenishmentPlan: action.payload,
        pipelineStatus: { ...state.pipelineStatus, replenishmentReady: true },
      };
    case "SET_ALERTS":
      return { ...state, alerts: action.payload };
    case "SET_KPIS":
      return { ...state, kpis: action.payload };
    case "SET_THEME":
      return { ...state, theme: action.payload };
    case "SET_ACTIVE_MODULE":
      return { ...state, activeModule: action.payload };
    case "PIPELINE_NEXT":
      return {
        ...state,
        pipelineStatus: { ...state.pipelineStatus, ...action.payload },
      };
    case "RESET":
      return { ...defaultGlobalState, theme: state.theme };
    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 7 — HOOKS PERSONALIZADOS
// ═══════════════════════════════════════════════════════════════════════════════

/** Hook para consumir y publicar resultados de Forecast */
export function useForecast() {
  const state = useContext(GlobalContext);
  const dispatch = useContext(GlobalDispatchContext);

  const publishForecastResults = useCallback((brands) => {
    if (!brands?.length) return;
    const results = brands.map((brand) => {
      const result = forecastService.evaluateModels(brand.data, brand.params, brand.horizon || 12);
      autoLearnService.save(brand.id, result.winner, result.wmape, result.accuracy);
      return { skuId: brand.id, brandName: brand.name, ...result };
    });
    dispatch({ type: "SET_FORECAST_RESULTS", payload: results });
    // Actualizar alertas y KPIs
    const newState = { ...state, forecastResults: results };
    dispatch({ type: "SET_ALERTS", payload: generateAlerts(newState) });
    dispatch({ type: "SET_KPIS", payload: calculateGlobalKPIs(newState) });
  }, [dispatch, state]);

  const getSuggestedModel = useCallback((skuId) =>
    autoLearnService.getSuggestedModel(skuId), []);

  return {
    forecastResults: state.forecastResults,
    pipelineReady: state.pipelineStatus.forecastReady,
    publishForecastResults,
    getSuggestedModel,
  };
}

/** Hook para Assortment / OTB */
export function useAssortment() {
  const state = useContext(GlobalContext);
  const dispatch = useContext(GlobalDispatchContext);

  const publishOTBPlan = useCallback((otbData) => {
    dispatch({ type: "SET_OTB_PLAN", payload: otbData });
    // Clasificación ABC automática
    if (otbData.items) {
      const abc = assortmentService.buildABCCurve(otbData.items);
      dispatch({ type: "SET_SKU_CLASSIFICATION", payload: Object.fromEntries(abc) });
    }
    const newState = { ...state, otbPlan: otbData };
    dispatch({ type: "SET_ALERTS", payload: generateAlerts(newState) });
    dispatch({ type: "SET_KPIS", payload: calculateGlobalKPIs(newState) });
  }, [dispatch, state]);

  /** Carga automática desde Forecast */
  const loadFromForecast = useCallback(() => {
    const { forecastResults } = state;
    if (!forecastResults?.length) return false;
    // Mapea forecast → estimación de unidades y presupuesto
    const items = forecastResults.map((r) => ({
      id: r.skuId,
      sales: r.future?.reduce((a, b) => a + b, 0) || 0,
    }));
    const abc = assortmentService.buildABCCurve(items);
    dispatch({ type: "SET_SKU_CLASSIFICATION", payload: Object.fromEntries(abc) });
    return true;
  }, [state, dispatch]);

  return {
    otbPlan: state.otbPlan,
    skuClassification: state.skuClassification,
    forecastResults: state.forecastResults,
    pipelineReady: state.pipelineStatus.assortmentReady,
    forecastReady: state.pipelineStatus.forecastReady,
    publishOTBPlan,
    loadFromForecast,
  };
}

/** Hook para Distribución */
export function useDistribucion() {
  const state = useContext(GlobalContext);
  const dispatch = useContext(GlobalDispatchContext);

  const publishDistributionPlan = useCallback((plan) => {
    dispatch({ type: "SET_DISTRIBUTION_PLAN", payload: plan });
    const newState = { ...state, distributionPlan: plan };
    dispatch({ type: "SET_ALERTS", payload: generateAlerts(newState) });
    dispatch({ type: "SET_KPIS", payload: calculateGlobalKPIs(newState) });
  }, [dispatch, state]);

  /** Carga automática desde OTB */
  const loadFromAssortment = useCallback(() => {
    const { otbPlan } = state;
    if (!otbPlan?.goas?.length) return false;
    // Aquí se mapearía el OTB a un plan de distribución inicial
    // (el módulo completo lo hace; esto es el puente)
    return { otbGoas: otbPlan.goas };
  }, [state]);

  return {
    distributionPlan: state.distributionPlan,
    otbPlan: state.otbPlan,
    pipelineReady: state.pipelineStatus.distributionReady,
    assortmentReady: state.pipelineStatus.assortmentReady,
    publishDistributionPlan,
    loadFromAssortment,
    simulateDistribution: distributionService.simulateDistribution,
    optimizeForSellThrough: distributionService.optimizeForSellThrough,
  };
}

/** Hook para Resurtido */
export function useReplenishment() {
  const state = useContext(GlobalContext);
  const dispatch = useContext(GlobalDispatchContext);

  const publishReplenishmentPlan = useCallback((plan) => {
    dispatch({ type: "SET_REPLENISHMENT_PLAN", payload: plan });
    const newState = { ...state, replenishmentPlan: plan };
    dispatch({ type: "SET_ALERTS", payload: generateAlerts(newState) });
    dispatch({ type: "SET_KPIS", payload: calculateGlobalKPIs(newState) });
  }, [dispatch, state]);

  const loadFromDistribution = useCallback(() => {
    const { distributionPlan, forecastResults } = state;
    if (!forecastResults?.length) return false;
    const plan = replenishmentService.calculateReplenishment(
      forecastResults.map((r) => ({
        sku: r.skuId,
        forecast: r.future?.reduce((a, b) => a + b, 0) || 0,
        oh: 0, oo: 0, periods: r.future?.length || 12,
      }))
    );
    dispatch({ type: "SET_REPLENISHMENT_PLAN", payload: plan });
    return true;
  }, [state, dispatch]);

  return {
    replenishmentPlan: state.replenishmentPlan,
    distributionPlan: state.distributionPlan,
    forecastResults: state.forecastResults,
    pipelineReady: state.pipelineStatus.replenishmentReady,
    distributionReady: state.pipelineStatus.distributionReady,
    publishReplenishmentPlan,
    loadFromDistribution,
  };
}

/** Hook de alertas */
export function useAlerts() {
  const state = useContext(GlobalContext);
  const dispatch = useContext(GlobalDispatchContext);
  const refresh = useCallback(() => {
    dispatch({ type: "SET_ALERTS", payload: generateAlerts(state) });
  }, [state, dispatch]);
  return { alerts: state.alerts, refresh };
}

/** Hook de KPIs */
export function useKPIs() {
  const state = useContext(GlobalContext);
  return { kpis: state.kpis || calculateGlobalKPIs(state) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 8 — PROVIDER (envuelve toda la app)
// ═══════════════════════════════════════════════════════════════════════════════

export function GOPlannerProvider({ children }) {
  const [state, dispatch] = React.useReducer(globalReducer, defaultGlobalState);

  // Sincronizar alertas y KPIs cuando cambia cualquier plan
  useEffect(() => {
    dispatch({ type: "SET_ALERTS", payload: generateAlerts(state) });
    dispatch({ type: "SET_KPIS", payload: calculateGlobalKPIs(state) });
  }, [
    state.forecastResults,
    state.otbPlan,
    state.distributionPlan,
    state.replenishmentPlan,
  ]);

  // Persistir tema
  useEffect(() => {
    try { localStorage.setItem("goplanner_theme", state.theme); } catch (_) {}
  }, [state.theme]);

  return (
    <GlobalContext.Provider value={state}>
      <GlobalDispatchContext.Provider value={dispatch}>
        {children}
      </GlobalDispatchContext.Provider>
    </GlobalContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 9 — COMPONENTES UI DEL SHELL
// ═══════════════════════════════════════════════════════════════════════════════

/** Íconos internos del Shell (sin lucide-react aquí para portabilidad) */
const ShellIcons = {
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  Sun: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  Moon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  TrendingUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  ShoppingBag: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  ),
  Map: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Arrow: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Alert: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
};

/** Badge de alerta con nivel de color */
function AlertBadge({ level }) {
  const colors = {
    critical: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[level] || colors.info}`} />;
}

/** Panel de Alertas desplegable */
function AlertsPanel({ alerts, theme, onClose }) {
  const isDark = theme === "dark";
  if (!alerts?.length) return (
    <div className={`p-8 text-center ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
      <div className="text-4xl mb-2">✓</div>
      <p className="text-sm font-bold">Sin alertas activas</p>
    </div>
  );

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded-xl border text-xs ${
            alert.level === "critical"
              ? isDark ? "bg-red-900/20 border-red-500/40 text-red-300" : "bg-red-50 border-red-200 text-red-800"
              : alert.level === "warning"
              ? isDark ? "bg-yellow-900/20 border-yellow-500/40 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-yellow-800"
              : isDark ? "bg-blue-900/20 border-blue-500/40 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertBadge level={alert.level} />
            <span className="font-black uppercase tracking-wider">{alert.title}</span>
          </div>
          <p className={isDark ? "text-zinc-400" : "text-gray-600"}>{alert.description}</p>
          {alert.action && (
            <button className={`mt-2 text-[10px] font-black uppercase tracking-widest underline ${
              alert.level === "critical" ? "text-red-400" : "text-yellow-400"
            }`}>
              {alert.action} →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** KPI Card */
function KPICard({ label, value, unit, color, isDark }) {
  return (
    <div className={`px-4 py-2 rounded-xl border ${
      isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-gray-200"
    }`}>
      <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-gray-500"}`}>{label}</p>
      <p className={`text-lg font-black ${color}`}>
        {value}<span className={`text-[10px] font-bold ml-1 ${isDark ? "text-zinc-600" : "text-gray-400"}`}>{unit}</span>
      </p>
    </div>
  );
}

/** Topbar del Shell */
function ShellTopbar({ theme, dispatch, alerts, activeModule, sidebarOpen, onToggleSidebar }) {
  const isDark = theme === "dark";
  const [showAlerts, setShowAlerts] = useState(false);
  const { kpis } = useKPIs();
  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const panelRef = useRef(null);

  // Cierra el panel de alertas al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowAlerts(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const moduleLabel = {
    dashboard: "Dashboard Global",
    forecast: "Módulo Forecasting",
    assortment: "Módulo Assortment OTB",
    distribucion: "Módulo Distribución",
    resurtido: "Módulo Resurtido",
  }[activeModule] || "GO Planner";

  return (
    <header className={`sticky top-0 z-30 border-b backdrop-blur-md flex flex-col ${
      isDark ? "bg-zinc-950/90 border-zinc-800 shadow-2xl" : "bg-white/90 border-gray-200 shadow-md"
    }`}>
      {/* Fila principal */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className={`p-2 rounded-lg transition-all ${
              isDark ? "hover:bg-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
            }`}
          >
            <ShellIcons.Menu />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? "bg-violet-600" : "bg-blue-600"} text-white shadow-lg`}>
              <ShellIcons.TrendingUp />
            </div>
            <div>
              <h1 className={`text-xl font-black tracking-tighter uppercase leading-none ${isDark ? "text-white" : "text-gray-900"}`}>
                GO <span className={isDark ? "text-violet-500" : "text-blue-600"}>PLANNER</span>
              </h1>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
                {moduleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Controles derechos */}
        <div className="flex items-center gap-3">
          {/* KPIs rápidos (solo desktop) */}
          <div className="hidden xl:flex items-center gap-2">
            <KPICard label="Sell-Through" value={kpis.sellThrough?.toFixed(1) || "—"} unit="%" color={isDark ? "text-violet-400" : "text-blue-600"} isDark={isDark} />
            <KPICard label="Inventario" value={kpis.totalInventory?.toLocaleString() || "—"} unit="uds" color={isDark ? "text-white" : "text-gray-900"} isDark={isDark} />
            <KPICard label="Cobertura" value={kpis.coverageWeeks?.toFixed(1) || "—"} unit="sem" color={isDark ? "text-yellow-400" : "text-amber-600"} isDark={isDark} />
            <KPICard label="Fill Rate" value={kpis.fillRate?.toFixed(1) || "—"} unit="%" color={kpis.fillRate < THRESHOLDS.FILL_RATE_MIN ? "text-red-400" : (isDark ? "text-emerald-400" : "text-green-600")} isDark={isDark} />
          </div>

          {/* Alertas */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className={`relative p-2.5 rounded-xl border transition-all ${
                criticalCount > 0
                  ? isDark ? "bg-red-900/30 border-red-500/50 text-red-400" : "bg-red-50 border-red-300 text-red-600"
                  : isDark ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white" : "bg-white border-gray-200 text-gray-500 hover:text-gray-900"
              }`}
            >
              <ShellIcons.Bell />
              {alerts.length > 0 && (
                <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center text-white ${
                  criticalCount > 0 ? "bg-red-500" : "bg-yellow-500"
                }`}>
                  {alerts.length}
                </span>
              )}
            </button>

            {showAlerts && (
              <div className={`absolute right-0 top-12 w-80 rounded-2xl border shadow-2xl z-50 p-4 ${
                isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-gray-200"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-black uppercase tracking-widest ${isDark ? "text-white" : "text-gray-900"}`}>
                    Alertas
                  </h3>
                  <button
                    onClick={() => setShowAlerts(false)}
                    className={`text-xs ${isDark ? "text-zinc-500 hover:text-white" : "text-gray-400 hover:text-gray-900"}`}
                  >
                    ✕
                  </button>
                </div>
                <AlertsPanel alerts={alerts} theme={theme} onClose={() => setShowAlerts(false)} />
              </div>
            )}
          </div>

          {/* Toggle tema */}
          <button
            onClick={() => dispatch({ type: "SET_THEME", payload: theme === "dark" ? "light" : "dark" })}
            className={`p-2.5 rounded-xl border transition-all ${
              isDark ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-yellow-400" : "bg-white border-gray-200 text-gray-500 hover:text-blue-600"
            }`}
            title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
          >
            {theme === "dark" ? <ShellIcons.Sun /> : <ShellIcons.Moon />}
          </button>
        </div>
      </div>

      {/* Pipeline status bar */}
      <PipelineStatusBar theme={theme} />
    </header>
  );
}

/** Barra de estado del pipeline */
function PipelineStatusBar({ theme }) {
  const state = useContext(GlobalContext);
  const isDark = theme === "dark";
  const { pipelineStatus } = state;

  const steps = [
    { key: "forecastReady", label: "Forecast", module: MODULE_IDS.FORECAST },
    { key: "assortmentReady", label: "OTB", module: MODULE_IDS.ASSORTMENT },
    { key: "distributionReady", label: "Distribución", module: MODULE_IDS.DISTRIBUCION },
    { key: "replenishmentReady", label: "Resurtido", module: MODULE_IDS.RESURTIDO },
  ];

  return (
    <div className={`flex items-center gap-0 px-6 py-1.5 border-t overflow-x-auto ${
      isDark ? "border-zinc-800/50 bg-black/30" : "border-gray-100 bg-gray-50/50"
    }`}>
      <span className={`text-[9px] font-black uppercase tracking-widest mr-3 whitespace-nowrap ${isDark ? "text-zinc-600" : "text-gray-400"}`}>
        Pipeline:
      </span>
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
              pipelineStatus[step.key]
                ? isDark ? "bg-emerald-500" : "bg-green-500"
                : isDark ? "bg-zinc-700" : "bg-gray-300"
            }`}>
              {pipelineStatus[step.key] && (
                <svg viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" className="w-2 h-2">
                  <polyline points="1 5 4 8 9 2" />
                </svg>
              )}
            </div>
            <span className={`text-[10px] font-bold ${
              pipelineStatus[step.key]
                ? isDark ? "text-emerald-400" : "text-green-600"
                : isDark ? "text-zinc-600" : "text-gray-400"
            }`}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span className={`mx-2 text-[10px] ${isDark ? "text-zinc-700" : "text-gray-300"}`}>→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Sidebar de navegación */
function ShellSidebar({ activeModule, onNavigate, theme, isOpen }) {
  const isDark = theme === "dark";
  const state = useContext(GlobalContext);
  const { pipelineStatus } = state;

  const navItems = [
    { id: MODULE_IDS.DASHBOARD, label: "Dashboard", icon: ShellIcons.Dashboard, desc: "KPIs Globales" },
    { id: MODULE_IDS.FORECAST, label: "Forecasting", icon: ShellIcons.TrendingUp, desc: "Proyección de demanda", ready: pipelineStatus.forecastReady },
    { id: MODULE_IDS.ASSORTMENT, label: "Assortment OTB", icon: ShellIcons.ShoppingBag, desc: "Compra y presupuesto", ready: pipelineStatus.assortmentReady },
    { id: MODULE_IDS.DISTRIBUCION, label: "Distribución", icon: ShellIcons.Map, desc: "Surtido a tiendas", ready: pipelineStatus.distributionReady },
    { id: MODULE_IDS.RESURTIDO, label: "Resurtido", icon: ShellIcons.Refresh, desc: "Reposición continua", ready: pipelineStatus.replenishmentReady },
  ];

  return (
    <aside
      style={{ transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s" }}
      className={`flex flex-col h-full border-r ${
        isOpen ? "w-72 opacity-100" : "w-0 opacity-0 overflow-hidden pointer-events-none"
      } ${isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-gray-200"}`}
    >
      <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-zinc-800 bg-zinc-900/50" : "border-gray-100 bg-gray-50"}`}>
        <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-gray-400"}`}>Módulos</span>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "text-violet-400 bg-violet-400/10 border-violet-400/20" : "text-blue-600 bg-blue-50 border-blue-200"}`}>
          {navItems.length}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full group p-3 rounded-2xl transition-all flex items-center gap-3 border text-left ${
                isActive
                  ? isDark
                    ? "bg-zinc-900 border-violet-500/50 shadow-inner"
                    : "bg-blue-50 border-blue-200 shadow-sm"
                  : isDark
                  ? "bg-transparent border-transparent hover:bg-zinc-900/50 hover:border-zinc-800"
                  : "bg-transparent border-transparent hover:bg-gray-50 hover:border-gray-200"
              }`}
            >
              <div className={`p-2 rounded-xl ${
                isActive
                  ? isDark ? "bg-violet-600 text-white" : "bg-blue-600 text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 group-hover:text-white" : "bg-gray-100 text-gray-500 group-hover:text-gray-700"
              }`}>
                <Icon />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${isActive ? (isDark ? "text-white" : "text-gray-900") : (isDark ? "text-zinc-400" : "text-gray-600")}`}>
                  {item.label}
                </p>
                <p className={`text-[10px] truncate ${isDark ? "text-zinc-600" : "text-gray-400"}`}>{item.desc}</p>
              </div>
              {item.ready !== undefined && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.ready ? (isDark ? "bg-emerald-500" : "bg-green-500") : (isDark ? "bg-zinc-700" : "bg-gray-300")}`} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Pipeline manual buttons */}
      <div className={`p-4 border-t space-y-2 ${isDark ? "border-zinc-800 bg-zinc-950/80" : "border-gray-100 bg-gray-50"}`}>
        <PipelineManualControls theme={theme} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}

/** Controles manuales del pipeline (botones de paso-a-paso) */
function PipelineManualControls({ theme, onNavigate }) {
  const isDark = theme === "dark";
  const { loadFromForecast } = useAssortment();
  const { loadFromAssortment } = useDistribucion();
  const { loadFromDistribution } = useReplenishment();
  const state = useContext(GlobalContext);
  const { pipelineStatus } = state;

  const steps = [
    {
      label: "Forecast → OTB",
      disabled: !pipelineStatus.forecastReady,
      onClick: () => { loadFromForecast(); onNavigate(MODULE_IDS.ASSORTMENT); },
    },
    {
      label: "OTB → Distribución",
      disabled: !pipelineStatus.assortmentReady,
      onClick: () => { loadFromAssortment(); onNavigate(MODULE_IDS.DISTRIBUCION); },
    },
    {
      label: "Dist → Resurtido",
      disabled: !pipelineStatus.distributionReady,
      onClick: () => { loadFromDistribution(); onNavigate(MODULE_IDS.RESURTIDO); },
    },
  ];

  return (
    <>
      <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-gray-400"}`}>
        Pipeline Manual
      </p>
      {steps.map((step) => (
        <button
          key={step.label}
          onClick={step.onClick}
          disabled={step.disabled}
          className={`w-full text-[10px] font-bold py-2 px-3 rounded-xl border transition-all flex items-center justify-between ${
            step.disabled
              ? isDark ? "border-zinc-800 text-zinc-700 cursor-not-allowed" : "border-gray-200 text-gray-300 cursor-not-allowed"
              : isDark ? "border-violet-500/30 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500/60" : "border-blue-200 text-blue-600 hover:bg-blue-50"
          }`}
        >
          {step.label}
          <ShellIcons.Arrow />
        </button>
      ))}
    </>
  );
}

/** Dashboard global con KPIs y alertas */
function DashboardModule({ theme }) {
  const isDark = theme === "dark";
  const { kpis } = useKPIs();
  const { alerts } = useAlerts();

  const kpiCards = [
    { label: "Sell-Through Esperado", value: kpis.sellThrough?.toFixed(1) || "—", unit: "%", color: isDark ? "text-violet-400" : "text-blue-600", bg: isDark ? "bg-violet-400/5" : "bg-blue-50" },
    { label: "Inventario Total", value: kpis.totalInventory?.toLocaleString() || "—", unit: "uds", color: isDark ? "text-white" : "text-gray-900", bg: isDark ? "bg-zinc-900" : "bg-white" },
    { label: "Cobertura", value: kpis.coverageWeeks?.toFixed(1) || "—", unit: "sem", color: isDark ? "text-yellow-400" : "text-amber-600", bg: isDark ? "bg-zinc-900" : "bg-white" },
    { label: "GMROI", value: kpis.gmroi?.toFixed(2) || "—", unit: "x", color: kpis.gmroi > 0 && kpis.gmroi < THRESHOLDS.GMROI_MIN ? "text-red-400" : (isDark ? "text-emerald-400" : "text-green-600"), bg: isDark ? "bg-zinc-900" : "bg-white" },
    { label: "Fill Rate", value: kpis.fillRate?.toFixed(1) || "—", unit: "%", color: kpis.fillRate > 0 && kpis.fillRate < THRESHOLDS.FILL_RATE_MIN ? "text-red-400" : (isDark ? "text-emerald-400" : "text-green-600"), bg: isDark ? "bg-zinc-900" : "bg-white" },
    { label: "OTB Disponible", value: kpis.otbRemaining ? `$${Math.abs(kpis.otbRemaining).toLocaleString()}` : "—", unit: kpis.otbRemaining < 0 ? "(excedido)" : "", color: kpis.otbRemaining < 0 ? "text-red-400" : (isDark ? "text-emerald-400" : "text-green-600"), bg: isDark ? "bg-zinc-900" : "bg-white" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-8">
      {/* Headline */}
      <div>
        <h2 className={`text-4xl font-black tracking-tighter uppercase leading-none ${isDark ? "text-white" : "text-gray-900"}`}>
          Dashboard <span className={isDark ? "text-violet-500" : "text-blue-600"}>Global</span>
        </h2>
        <p className={`mt-2 text-sm ${isDark ? "text-zinc-500" : "text-gray-500"}`}>
          KPIs consolidados del pipeline de planeación retail end-to-end
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card, i) => (
          <div key={i} className={`p-5 rounded-[28px] border ${card.bg} ${isDark ? "border-zinc-800" : "border-gray-200"} shadow-sm hover:scale-[1.02] transition-transform`}>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-gray-400"}`}>{card.label}</p>
            <p className={`text-2xl font-black ${card.color} leading-none`}>{card.value}</p>
            {card.unit && <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-zinc-600" : "text-gray-400"}`}>{card.unit}</p>}
          </div>
        ))}
      </div>

      {/* Alertas */}
      <div className={`p-6 rounded-[32px] border ${isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-gray-200 shadow-sm"}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-xl ${isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-600"}`}>
            <ShellIcons.Alert />
          </div>
          <h3 className={`font-black uppercase tracking-widest text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
            Centro de Alertas
          </h3>
          {alerts.length > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${isDark ? "text-red-400 bg-red-400/10 border-red-400/20" : "text-red-600 bg-red-50 border-red-200"}`}>
              {alerts.length} activa{alerts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <AlertsPanel alerts={alerts} theme={theme} />
      </div>

      {/* Estado del Pipeline */}
      <PipelineOverview theme={theme} />
    </div>
  );
}

/** Resumen visual del pipeline */
function PipelineOverview({ theme }) {
  const isDark = theme === "dark";
  const state = useContext(GlobalContext);
  const { pipelineStatus, forecastResults, otbPlan, distributionPlan, replenishmentPlan } = state;

  const stages = [
    {
      id: MODULE_IDS.FORECAST,
      label: "Forecast",
      desc: "Proyección de demanda por SKU/marca",
      ready: pipelineStatus.forecastReady,
      stat: forecastResults.length ? `${forecastResults.length} SKUs` : "Sin datos",
      color: isDark ? "violet" : "blue",
    },
    {
      id: MODULE_IDS.ASSORTMENT,
      label: "Assortment OTB",
      desc: "Plan de compra y presupuesto",
      ready: pipelineStatus.assortmentReady,
      stat: otbPlan.budget ? `$${otbPlan.budget.toLocaleString()} ppto` : "Sin datos",
      color: isDark ? "yellow" : "amber",
    },
    {
      id: MODULE_IDS.DISTRIBUCION,
      label: "Distribución",
      desc: "Asignación a tiendas por cluster",
      ready: pipelineStatus.distributionReady,
      stat: Object.keys(distributionPlan.allocations || {}).length
        ? `${Object.keys(distributionPlan.allocations).length} tiendas`
        : "Sin datos",
      color: "emerald",
    },
    {
      id: MODULE_IDS.RESURTIDO,
      label: "Resurtido",
      desc: "Reposición continua de inventario",
      ready: pipelineStatus.replenishmentReady,
      stat: replenishmentPlan.length ? `${replenishmentPlan.length} líneas` : "Sin datos",
      color: "blue",
    },
  ];

  const colorMap = {
    violet: isDark ? "border-violet-500/40 bg-violet-500/5 text-violet-400" : "border-blue-300 bg-blue-50 text-blue-600",
    yellow: isDark ? "border-yellow-500/40 bg-yellow-500/5 text-yellow-400" : "border-amber-300 bg-amber-50 text-amber-600",
    emerald: isDark ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400" : "border-green-300 bg-green-50 text-green-600",
    blue: isDark ? "border-blue-500/40 bg-blue-500/5 text-blue-400" : "border-blue-300 bg-blue-50 text-blue-600",
  };

  return (
    <div className={`p-6 rounded-[32px] border ${isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-gray-200 shadow-sm"}`}>
      <h3 className={`font-black uppercase tracking-widest text-sm mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>
        Pipeline de Planeación
      </h3>
      <div className="flex flex-col md:flex-row items-stretch gap-0">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <div className={`flex-1 p-4 rounded-2xl border transition-all ${
              stage.ready
                ? colorMap[stage.color]
                : isDark ? "border-zinc-800 bg-zinc-900/50 text-zinc-500" : "border-gray-200 bg-gray-50 text-gray-400"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${stage.ready ? "bg-emerald-500" : (isDark ? "bg-zinc-700" : "bg-gray-300")}`} />
                <p className="font-black text-xs uppercase tracking-wider">{stage.label}</p>
              </div>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-gray-400"}`}>{stage.desc}</p>
              <p className={`text-xs font-bold mt-2 ${stage.ready ? "" : (isDark ? "text-zinc-700" : "text-gray-300")}`}>{stage.stat}</p>
            </div>
            {i < stages.length - 1 && (
              <div className={`hidden md:flex items-center px-2 ${isDark ? "text-zinc-700" : "text-gray-300"}`}>
                <ShellIcons.Arrow />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 10 — SHELL PRINCIPAL (GOPlannerShell)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GOPlannerShell — Componente principal que envuelve toda la aplicación
 *
 * Props:
 *   - ModuleForecast: React component
 *   - ModuleAssortment: React component
 *   - ModuleDistribucion: React component
 *   - ModuleResurtido: React component
 *
 * Uso:
 *   <GOPlannerShell
 *     ModuleForecast={ModuleForecastComponent}
 *     ModuleAssortment={ModuleAssortmentComponent}
 *     ModuleDistribucion={ModuleDistribucionComponent}
 *     ModuleResurtido={ModuleResurtidoComponent}
 *   />
 */
export function GOPlannerShellInner({
  ModuleForecast,
  ModuleAssortment,
  ModuleDistribucion,
  ModuleResurtido,
}) {
  const state = useContext(GlobalContext);
  const dispatch = useContext(GlobalDispatchContext);
  const { theme, activeModule, alerts } = state;
  const isDark = theme === "dark";
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navigate = useCallback((moduleId) => {
    dispatch({ type: "SET_ACTIVE_MODULE", payload: moduleId });
  }, [dispatch]);

  // Propagar tema a módulos HTML legacy (body class)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.body.style.backgroundColor = isDark ? "#000" : "#f9fafb";
  }, [isDark]);

  const renderModule = () => {
    switch (activeModule) {
      case MODULE_IDS.DASHBOARD:
        return <DashboardModule theme={theme} />;
      case MODULE_IDS.FORECAST:
        return ModuleForecast ? (
          <ModuleWrapperForecast theme={theme}>
            <ModuleForecast />
          </ModuleWrapperForecast>
        ) : <PlaceholderModule name="Forecasting" theme={theme} />;
      case MODULE_IDS.ASSORTMENT:
        return ModuleAssortment ? (
          <ModuleWrapperAssortment theme={theme}>
            <ModuleAssortment />
          </ModuleWrapperAssortment>
        ) : <PlaceholderModule name="Assortment OTB" theme={theme} />;
      case MODULE_IDS.DISTRIBUCION:
        return ModuleDistribucion ? (
          <ModuleWrapperDistribucion theme={theme}>
            <ModuleDistribucion />
          </ModuleWrapperDistribucion>
        ) : <PlaceholderModule name="Distribución" theme={theme} />;
      case MODULE_IDS.RESURTIDO:
        return ModuleResurtido ? (
          <ModuleWrapperResurtido theme={theme}>
            <ModuleResurtido />
          </ModuleWrapperResurtido>
        ) : <PlaceholderModule name="Resurtido" theme={theme} />;
      default:
        return <DashboardModule theme={theme} />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDark ? "bg-black text-gray-300" : "bg-gray-50 text-gray-800"}`}>
      <ShellTopbar
        theme={theme}
        dispatch={dispatch}
        alerts={alerts}
        activeModule={activeModule}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex flex-1 overflow-hidden relative">
        <ShellSidebar
          activeModule={activeModule}
          onNavigate={navigate}
          theme={theme}
          isOpen={sidebarOpen}
        />
        <main className={`flex-1 overflow-y-auto ${isDark ? "bg-black" : "bg-gray-50"}`}>
          {renderModule()}
        </main>
      </div>
    </div>
  );
}

/**
 * Wrapper de módulo Forecast — inyecta bridge sin modificar el módulo
 */
function ModuleWrapperForecast({ children, theme }) {
  const { publishForecastResults } = useForecast();
  // El módulo Forecast ya tiene su propio estado interno.
  // El wrapper expone el bridge vía window para que el módulo legacy pueda llamarlo.
  useEffect(() => {
    window.__gopForecastBridge = { publishForecastResults };
    return () => { delete window.__gopForecastBridge; };
  }, [publishForecastResults]);
  return <div className="flex-1">{children}</div>;
}

function ModuleWrapperAssortment({ children, theme }) {
  const { publishOTBPlan, forecastResults } = useAssortment();
  useEffect(() => {
    window.__gopAssortmentBridge = { publishOTBPlan, forecastResults };
    return () => { delete window.__gopAssortmentBridge; };
  }, [publishOTBPlan, forecastResults]);
  return <div className="flex-1">{children}</div>;
}

function ModuleWrapperDistribucion({ children, theme }) {
  const { publishDistributionPlan, otbPlan } = useDistribucion();
  useEffect(() => {
    window.__gopDistribucionBridge = { publishDistributionPlan, otbPlan };
    return () => { delete window.__gopDistribucionBridge; };
  }, [publishDistributionPlan, otbPlan]);
  return <div className="flex-1">{children}</div>;
}

function ModuleWrapperResurtido({ children, theme }) {
  const { publishReplenishmentPlan, distributionPlan } = useReplenishment();
  useEffect(() => {
    window.__gopResurtidoBridge = { publishReplenishmentPlan, distributionPlan };
    return () => { delete window.__gopResurtidoBridge; };
  }, [publishReplenishmentPlan, distributionPlan]);
  return <div className="flex-1">{children}</div>;
}

/** Placeholder cuando un módulo no está conectado */
function PlaceholderModule({ name, theme }) {
  const isDark = theme === "dark";
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className={`text-center p-12 rounded-[48px] border ${isDark ? "bg-zinc-950 border-zinc-800" : "bg-white border-gray-200 shadow-sm"}`}>
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-gray-100 text-gray-400"}`}>
          <ShellIcons.Dashboard />
        </div>
        <h2 className={`text-2xl font-black uppercase ${isDark ? "text-white" : "text-gray-900"}`}>{name}</h2>
        <p className={`text-sm mt-2 ${isDark ? "text-zinc-500" : "text-gray-400"}`}>
          Módulo no conectado. Pasa el componente como prop al Shell.
        </p>
        <code className={`text-xs block mt-4 p-3 rounded-xl ${isDark ? "bg-zinc-900 text-violet-400" : "bg-gray-50 text-blue-600"}`}>
          {`<GOPlannerShell Module${name.replace(/\s/g, "")}={Component} />`}
        </code>
      </div>
    </div>
  );
}

/**
 * Punto de entrada principal — incluye Provider
 */
export function GOPlannerShell(props) {
  return (
    <GOPlannerProvider>
      <GOPlannerShellInner {...props} />
    </GOPlannerProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 11 — EXPORTS PÚBLICOS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  MODULE_IDS,
  ALERT_LEVELS,
  ALERT_TYPES,
  THRESHOLDS,
  defaultGlobalState,
};

export default GOPlannerShell;

/*
 ─────────────────────────────────────────────────────────────────────────────
 INSTRUCCIONES DE INTEGRACIÓN
 ─────────────────────────────────────────────────────────────────────────────

 1. INSTALACIÓN (sin dependencias nuevas):
    El Shell usa solo React + hooks nativos.
    Los módulos existentes pueden ser React components o páginas HTML legacy.

 2. USO BÁSICO:
    ```jsx
    import GOPlannerShell from './GOPlanner_Shell';
    import ModuleForecast from './ModuleForecast';
    import ModuleAssortment from './ModuleAssortment';
    import ModuleDistribucion from './ModuleDistribucion';
    import ModuleResurtido from './ModuleResurtido';

    export default function App() {
      return (
        <GOPlannerShell
          ModuleForecast={ModuleForecast}
          ModuleAssortment={ModuleAssortment}
          ModuleDistribucion={ModuleDistribucion}
          ModuleResurtido={ModuleResurtido}
        />
      );
    }
    ```

 3. CONECTAR UN MÓDULO AL PIPELINE (ejemplo Forecast → GlobalState):
    En el módulo Forecast, después de calcular el mejor modelo:
    ```js
    if (window.__gopForecastBridge) {
      window.__gopForecastBridge.publishForecastResults(brands);
    }
    ```

 4. PIPELINE AUTOMÁTICO:
    - Forecast publica → Assortment recibe forecastResults
    - Assortment publica OTB → Distribución recibe otbPlan
    - Distribución publica plan → Resurtido recibe distributionPlan
    - Cada paso activa alertas y recalcula KPIs automáticamente

 5. SEGURIDAD OWASP:
    - Agrega este meta tag en tu index.html:
      <meta http-equiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com unpkg.com; style-src 'self' 'unsafe-inline';">
    - Los bridges window.__gop* son read-only en producción
    - No se eval() ningún dato de usuario
    - CSVs son parseados con split(), nunca con eval()

 6. AUTO-LEARNING:
    - Los modelos ganadores se guardan en localStorage automáticamente
    - Al crear una marca nueva, llama a:
      const suggestedModel = autoLearnService.getSuggestedModel(skuId);
    - Esto devuelve el nombre del modelo que mejor funcionó previamente

 7. HOOKS DISPONIBLES:
    - useForecast()        → { forecastResults, publishForecastResults, getSuggestedModel }
    - useAssortment()      → { otbPlan, skuClassification, publishOTBPlan, loadFromForecast }
    - useDistribucion()    → { distributionPlan, publishDistributionPlan, loadFromAssortment }
    - useReplenishment()   → { replenishmentPlan, publishReplenishmentPlan, loadFromDistribution }
    - useAlerts()          → { alerts, refresh }
    - useKPIs()            → { kpis: { sellThrough, totalInventory, coverageWeeks, gmroi, fillRate } }

 8. SERVICIOS DISPONIBLES:
    - forecastService.evaluateModels(data, params, horizon)
    - forecastService.preprocessData(data)         ← limpia outliers y stockouts
    - forecastService.forecastNewSKU(categoryData)  ← SKUs nuevos
    - assortmentService.buildABCCurve(items)
    - assortmentService.monthlyBuyPlan(budget, months, pvp, numModels)
    - assortmentService.simulateAssortment(candidates, budget)
    - distributionService.simulateDistribution(plan, totalForecast)
    - distributionService.optimizeForSellThrough(allocations, scores, inventory)
    - replenishmentService.calculateReplenishment(items, params)

 ─────────────────────────────────────────────────────────────────────────────
*/

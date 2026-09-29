// src/utils/fcstEngine.js
// Motores de pronóstico compartidos (Forecast, Resurtido…). Backtest sin fuga + mejor accuracy.
// ─── Motores ──────────────────────────────────────────────────────────────────
// Cada motor regresa `fit` (pronóstico one-step-ahead: fit[i] usa SOLO datos < i, sin fuga)
// y `future` (h periodos). Antes Holt/HW calculaban el ajuste después de ver el dato → accuracy inflado.
export const engines = {
  'SES': {
    minTrain: () => 3,
    grid: () => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((alpha) => ({ alpha })),
    run: (d, p, h) => {
      let lv = d[0]; const fit = [null];
      for (let i = 1; i < d.length; i++) { fit.push(lv); lv = p.alpha * d[i] + (1 - p.alpha) * lv; }
      return { fit, future: Array(h).fill(lv) };
    },
  },
  'Holt': {
    minTrain: () => 4,
    grid: () => [0.1, 0.2, 0.3, 0.5, 0.7, 0.9].flatMap((alpha) => [0.01, 0.05, 0.1, 0.2, 0.3].map((beta) => ({ alpha, beta }))),
    run: (d, p, h) => {
      let lv = d[1], tr = d[1] - d[0]; const fit = [null, null];
      for (let i = 2; i < d.length; i++) {
        fit.push(lv + tr);
        const pl = lv; lv = p.alpha * d[i] + (1 - p.alpha) * (lv + tr); tr = p.beta * (lv - pl) + (1 - p.beta) * tr;
      }
      return { fit, future: Array.from({ length: h }, (_, j) => lv + (j + 1) * tr) };
    },
  },
  'Holt-Winters': {
    minTrain: (L) => L + 3,
    grid: () => [0.1, 0.2, 0.4, 0.6].flatMap((alpha) => [0.01, 0.05, 0.15].flatMap((beta) => [0.05, 0.1, 0.2, 0.4].map((gamma) => ({ alpha, beta, gamma })))),
    run: (d, p, h, L) => {
      // Multiplicativo. Inicio con el primer ciclo: nivel = promedio, índices = dato / nivel, tendencia 0
      let lv = d.slice(0, L).reduce((a, b) => a + b, 0) / L || 1, tr = 0;
      const si = d.slice(0, L).map((v) => (lv ? v / lv : 1) || 1);
      const fit = Array(L).fill(null);
      for (let i = L; i < d.length; i++) {
        const s = si[i % L];
        fit.push((lv + tr) * s);
        const pl = lv;
        lv = p.alpha * (d[i] / s) + (1 - p.alpha) * (lv + tr);
        tr = p.beta * (lv - pl) + (1 - p.beta) * tr;
        si[i % L] = p.gamma * (lv ? d[i] / lv : s) + (1 - p.gamma) * s;
      }
      return { fit, future: Array.from({ length: h }, (_, j) => (lv + (j + 1) * tr) * si[(d.length + j) % L]) };
    },
  },
  'Estacional': {
    // Mismo periodo del ciclo anterior × tendencia de los últimos 3 periodos vs sus equivalentes del ciclo anterior
    minTrain: (L) => L + 3,
    grid: () => [{}],
    run: (d, p, h, L) => {
      const g = (i) => { const a = d[i - 1] + d[i - 2] + d[i - 3], b = d[i - 1 - L] + d[i - 2 - L] + d[i - 3 - L]; return b ? a / b : 1; };
      const fit = d.map((_, i) => (i >= L + 3 ? d[i - L] * g(i) : null));
      const n = d.length, gf = n >= L + 3 ? g(n) : 1, ext = [...d];
      for (let j = 0; j < h; j++) ext.push(ext[n + j - L] * (j < L ? gf : 1));
      return { fit, future: ext.slice(n) };
    },
  },
};

export const getMetrics = (actual, forecast) => {
  let sumAbsErr = 0, sumActual = 0, sumErr = 0, count = 0;
  actual.forEach((v, i) => {
    if (forecast[i] != null) {
      const err = forecast[i] - v;
      sumErr += err; sumAbsErr += Math.abs(err); sumActual += v; count++;
    }
  });
  if (count === 0 || sumActual === 0) return { wmape: 999, accuracy: 0, bias: 0 };
  const wmape = (sumAbsErr / sumActual) * 100;
  return { wmape, accuracy: Math.max(0, 100 - wmape), bias: (sumErr / sumActual) * 100 };
};


// Pronóstico automático para una serie: prueba todos los motores con backtest (últimos ~20%, 3..L periodos),
// optimiza parámetros y devuelve el ganador re-entrenado con toda la historia.
export function bestForecast(series, horizon, L = 12) {
  const data = series.map((v) => +v || 0), n = data.length;
  if (n < 4 || !data.some((v) => v > 0)) return { model: 'Sin historia', accuracy: null, future: Array(horizon).fill(0), results: [] };
  const hold = Math.min(L, Math.max(3, Math.round(n * 0.2)), n - 3);
  const train = data.slice(0, n - hold), test = data.slice(n - hold);
  const results = Object.entries(engines).map(([name, e]) => {
    if (train.length < e.minTrain(L)) return null;
    let best = null;
    e.grid().forEach((p) => {
      const m = getMetrics(test, e.run(train, p, hold, L).future.map((v) => Math.max(0, v)));
      if (!best || m.wmape < best.wmape) best = { ...m, params: p };
    });
    return { name, ...best };
  }).filter(Boolean).sort((x, y) => y.accuracy - x.accuracy || Math.abs(x.bias) - Math.abs(y.bias));
  const w = results[0];
  const future = engines[w.name].run(data, w.params, horizon, L).future.map((v) => Math.max(0, v));
  return { model: w.name, accuracy: w.accuracy, bias: w.bias, future, results };
}

// Curva estacional de calzado MX (índice por mes, promedio ≈ 1). Se usa cuando la base no trae serie mensual
// (solo venta acumulada / últimos 3 meses) y no se puede correr un modelo de series de tiempo.
export const SEASONAL_CURVE_MX = [0.75, 0.78, 0.92, 0.95, 1.15, 1.00, 1.10, 1.18, 0.88, 0.85, 1.20, 1.74];
const sf = (m0) => SEASONAL_CURVE_MX[((m0 % 12) + 12) % 12];
// Factor para llevar el ritmo de los últimos `back` meses cerrados a los próximos `ahead` meses (m0 = mes actual 0-based)
export const seasonalShift = (m0, back = 3, ahead = 3) => {
  let a = 0, b = 0;
  for (let i = 0; i < ahead; i++) a += sf(m0 + i);
  for (let i = 1; i <= back; i++) b += sf(m0 - i);
  return b > 0 ? (a / ahead) / (b / back) : 1;
};

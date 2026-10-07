// Lógica ÚNICA de clústers por score (Assortment y Distribución usan exactamente esta).
// Score = normalización min–max por GOA de venta, margen % y rotación × pesos.
// Asignación por estrategia: 'piramide' (percentiles concentrando en top), 'lineal' (partes iguales), 'valor' (por score absoluto).

export const DEFAULT_SCORE_WEIGHTS = { sales: 65, margin: 20, rotation: 15 };
export const DEFAULT_CLUSTER_STRATEGY = 'piramide';

// Percentil (0..1) de una lista
const pctl = (v, p) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };

// Min–max con tope en el percentil 95: una tienda gigante ya no aplasta al resto hacia 0
const minMax = (items, k) => {
  const v = items.map(i => Number(i[k]) || 0);
  const lo = Math.min(...v), hi = v.length >= 10 ? pctl(v, 0.95) : Math.max(...v);
  return (x) => hi > lo ? Math.min(1, ((Number(x) || 0) - lo) / (hi - lo)) : (hi > 0 ? 1 : 0);
};

// items: [{ sales, margin, rotation, ... }] → agrega item.score (0..Σpesos)
export const scoreItems = (items, weights) => {
  if (!items.length) return items;
  const nS = minMax(items, 'sales'), nM = minMax(items, 'margin'), nR = minMax(items, 'rotation');
  const w = weights || DEFAULT_SCORE_WEIGHTS;
  items.forEach(it => { it.score = nS(it.sales) * (w.sales || 0) + nM(it.margin) * (w.margin || 0) + nR(it.rotation) * (w.rotation || 0); });
  return items;
};

// Índice de clúster (0 = mejor) para una posición en el ranking
export const clusterIndexFor = (strategy, index, total, score, maxScore, numClust) => {
  if (numClust <= 1) return 0;
  const percentile = total > 0 ? index / total : 0;
  if (strategy === 'lineal') return Math.min(Math.floor(percentile * numClust), numClust - 1);
  if (strategy === 'valor') {
    const ratio = maxScore > 0 ? Math.min(1, score / maxScore) : 0;
    return Math.min(Math.max(Math.floor((1 - ratio) * numClust), 0), numClust - 1);
  }
  // piramide
  if (numClust === 6) {
    if (percentile <= 0.05) return 0;
    if (percentile <= 0.20) return 1;
    if (percentile <= 0.45) return 2;
    if (percentile <= 0.75) return 3;
    if (percentile <= 0.90) return 4;
    return 5;
  }
  for (let i = 0; i < numClust; i++) if (percentile <= Math.pow((i + 1) / numClust, 2)) return i;
  return numClust - 1;
};

// Ordena por score desc y asigna clúster a cada item (item.cluster, item.clusterIdx)
export const assignClusters = (items, clusters, strategy) => {
  const sorted = [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
  // Para 'valor' el 100% es el percentil 90 del score (no la tienda #1), así un outlier no manda a todas al fondo
  const total = sorted.length, n = clusters.length;
  const maxScore = total >= 10 ? (pctl(sorted.map(x => x.score || 0), 0.9) || sorted[0].score) : (total ? sorted[0].score : 1);
  sorted.forEach((it, idx) => {
    const ci = clusterIndexFor(strategy || DEFAULT_CLUSTER_STRATEGY, idx, total, it.score, maxScore, n);
    it.clusterIdx = ci; it.cluster = clusters[ci];
  });
  return sorted;
};

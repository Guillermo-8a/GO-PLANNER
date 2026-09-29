// Lógica ÚNICA de clústers por score (Assortment y Distribución usan exactamente esta).
// Score = normalización min–max por GOA de venta, margen % y rotación × pesos.
// Asignación por estrategia: 'piramide' (percentiles concentrando en top), 'lineal' (partes iguales), 'valor' (por score absoluto).

export const DEFAULT_SCORE_WEIGHTS = { sales: 65, margin: 20, rotation: 15 };
export const DEFAULT_CLUSTER_STRATEGY = 'piramide';

const minMax = (items, k) => {
  const v = items.map(i => Number(i[k]) || 0);
  const lo = Math.min(...v), hi = Math.max(...v);
  return (x) => hi > lo ? ((Number(x) || 0) - lo) / (hi - lo) : (hi > 0 ? 1 : 0);
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
    const ratio = maxScore > 0 ? score / maxScore : 0;
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
  const total = sorted.length, maxScore = total ? sorted[0].score : 1, n = clusters.length;
  sorted.forEach((it, idx) => {
    const ci = clusterIndexFor(strategy || DEFAULT_CLUSTER_STRATEGY, idx, total, it.score, maxScore, n);
    it.clusterIdx = ci; it.cluster = clusters[ci];
  });
  return sorted;
};

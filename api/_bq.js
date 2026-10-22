// Helper compartido para correr una consulta de la whitelist desde otras funciones (no es ruta: empieza con _).
import { BigQuery } from '@google-cloud/bigquery';
import { QUERIES } from './_queries.js';

export async function runQuery(source, args = {}) {
  const q = QUERIES[source];
  if (!q) throw new Error(`Fuente desconocida: ${source}`);
  const credentials = JSON.parse(process.env.GCP_SA_KEY);
  const projectId = process.env.GCP_PROJECT_ID || credentials.project_id;
  const bq = new BigQuery({ projectId, credentials });
  const params = Object.fromEntries((q.params || []).map((p) => [p, String(args[p] ?? '')]));
  const [rows] = await bq.query({
    query: q.sql(`${projectId}.${process.env.GCP_DATASET}`),
    params,
    location: process.env.GCP_LOCATION || 'US',
  });
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v])));
}

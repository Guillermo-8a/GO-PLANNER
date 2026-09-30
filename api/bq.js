// Vercel Serverless Function: GET /api/bq?source=<nombre>&token=<GOP_API_TOKEN>[&param=valor]
// Ejecuta una consulta de la whitelist (_queries.js) en BigQuery y regresa CSV (UTF-8).
// Env vars (Vercel → Settings → Environment Variables):
//   GCP_SA_KEY      JSON completo de la llave de la cuenta de servicio
//   GCP_PROJECT_ID  proyecto de GCP donde viven los datos
//   GCP_DATASET     dataset de BigQuery
//   GOP_API_TOKEN   contraseña compartida para que solo el equipo pueda llamar al endpoint
import { BigQuery } from '@google-cloud/bigquery';
import { QUERIES } from './_queries.js';

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'value' in v) v = v.value; // DATE/TIMESTAMP de BigQuery
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default async function handler(req, res) {
  const token = req.headers['x-gop-token'] || req.query.token;
  if (!process.env.GOP_API_TOKEN || token !== process.env.GOP_API_TOKEN) {
    return res.status(401).send('No autorizado');
  }
  const q = QUERIES[req.query.source];
  if (!q) return res.status(404).send(`Fuente desconocida. Disponibles: ${Object.keys(QUERIES).join(', ')}`);

  try {
    const credentials = JSON.parse(process.env.GCP_SA_KEY);
    const projectId = process.env.GCP_PROJECT_ID || credentials.project_id;
    const bq = new BigQuery({ projectId, credentials });
    const params = Object.fromEntries((q.params || []).map((p) => [p, req.query[p]]));
    const [rows] = await bq.query({
      query: q.sql(`${projectId}.${process.env.GCP_DATASET}`),
      params,
      location: process.env.GCP_LOCATION || 'US',
    });
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).send(`Error BigQuery: ${e.message}`);
  }
}

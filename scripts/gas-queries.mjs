// Genera apps-script/bq-bridge/Queries.gs desde api/_queries.js (una sola fuente de verdad).
// Uso: node scripts/gas-queries.mjs   → pegar/subir Queries.gs al proyecto de Apps Script.
import { writeFileSync } from 'node:fs';
import { QUERIES } from '../api/_queries.js';

const DS = process.env.GCP_DS || 'crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap';
const out = Object.fromEntries(Object.entries(QUERIES).map(([k, q]) => [k, { params: q.params || [], sql: q.sql(DS) }]));
writeFileSync(new URL('../apps-script/bq-bridge/Queries.gs', import.meta.url),
  `// GENERADO por scripts/gas-queries.mjs — no editar a mano; editar api/_queries.js y regenerar.\nconst QUERIES = ${JSON.stringify(out, null, 2)};\n`);
console.log('Queries.gs:', Object.keys(out).join(', '));

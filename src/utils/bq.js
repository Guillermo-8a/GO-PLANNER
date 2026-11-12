// fetchBQ(source, params) → texto CSV con los encabezados que ya esperan los módulos.
// Con VITE_GOOGLE_CLIENT_ID: cada usuario inicia sesión con su cuenta de Google y el navegador consulta BigQuery directo
// con SUS permisos (BigQuery decide qué puede leer cada quien). Sin esa variable cae a /api/bq (cuenta de servicio + token).
import { QUERIES } from '../../api/_queries.js';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const PROJECT = import.meta.env.VITE_BQ_PROJECT || 'crp-pro-dwh-semanticagold'; // proyecto donde se corren (y cobran) los jobs
const DS = 'crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap';
const SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
const DOMINIO = 'suburbia.com.mx';
const KEY = 'gop_bq_token';

const loadGis = () => window.google?.accounts?.oauth2 ? Promise.resolve() : new Promise((ok, ko) => {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.onload = ok; s.onerror = () => ko(new Error('No cargó Google Sign-In'));
  document.head.appendChild(s);
});

let pending = null;
const accessToken = () => {
  try { const c = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (c && c.exp - Date.now() > 60000) return Promise.resolve(c.t); } catch { /* sin token */ }
  return pending ||= loadGis().then(() => new Promise((ok, ko) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font:14px system-ui;color:#fff';
    ov.innerHTML = `<div>Inicia sesión con tu cuenta @${DOMINIO} para traer datos de BigQuery</div><button id="gop-go" style="padding:10px 18px;border-radius:8px;background:#7c3aed;color:#fff;font-weight:700">Iniciar sesión con Google</button><button id="gop-x" style="opacity:.7">Cancelar</button>`;
    document.body.appendChild(ov);
    const done = () => { ov.remove(); pending = null; };
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, hd: DOMINIO,
      callback: (r) => {
        done();
        if (r.error) return ko(new Error(`Google: ${r.error_description || r.error}`));
        sessionStorage.setItem(KEY, JSON.stringify({ t: r.access_token, exp: Date.now() + r.expires_in * 1000 }));
        ok(r.access_token);
      },
      error_callback: (e) => { done(); ko(new Error(`Inicio de sesión: ${e.type || 'cancelado'}`)); },
    });
    ov.querySelector('#gop-go').onclick = () => client.requestAccessToken(); // el clic abre el popup (requiere gesto del usuario)
    ov.querySelector('#gop-x').onclick = () => { done(); ko(new Error('Inicio de sesión cancelado')); };
  }));
};

const api = async (url, token, body) => {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401) sessionStorage.removeItem(KEY); throw new Error(j.error?.message || `HTTP ${r.status}`); }
  return j;
};

const cell = (v) => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function directo(source, params) {
  const q = QUERIES[source];
  if (!q) throw new Error(`Fuente desconocida: ${source}`);
  const sql = q.sql(DS);
  if (q.pendiente || sql.includes('TODO_')) throw new Error(`Consulta pendiente: falta el SQL real de «${source}» en api/_queries.js`);
  const token = await accessToken();
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`;
  let res = await api(base, token, {
    query: sql, useLegacySql: false, location: 'US', timeoutMs: 60000, maxResults: 50000, parameterMode: 'NAMED',
    queryParameters: (q.params || []).map((p) => ({ name: p, parameterType: { type: 'STRING' }, parameterValue: { value: String(params[p] ?? '') } })),
  });
  const jobId = res.jobReference.jobId;
  while (!res.jobComplete) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await api(`${base}/${jobId}?location=US&maxResults=50000`, token);
  }
  const lines = [res.schema.fields.map((f) => f.name).join(',')];
  const add = (rows) => (rows || []).forEach((r) => lines.push(r.f.map((c) => cell(c.v)).join(',')));
  add(res.rows);
  for (let page = res.pageToken; page;) {
    const p = await api(`${base}/${jobId}?location=US&maxResults=50000&pageToken=${encodeURIComponent(page)}`, token);
    add(p.rows); page = p.pageToken;
  }
  return lines.join('\n');
}

export async function fetchBQ(source, params = {}) {
  if (CLIENT_ID) return directo(source, params);
  let tok = localStorage.getItem('gop_api_token') || '';
  if (!tok) { tok = window.prompt('Token de GO PLANNER (GOP_API_TOKEN):') || ''; if (!tok) throw new Error('Sin token'); localStorage.setItem('gop_api_token', tok); }
  const r = await fetch(`/api/bq?${new URLSearchParams({ source, ...params })}`, { headers: { 'x-gop-token': tok } });
  const txt = await r.text();
  if (r.status === 401) localStorage.removeItem('gop_api_token');
  if (!r.ok) throw new Error(txt);
  return txt;
}

// Lo mismo que fetchBQ pero regresa un File, para alimentar el lector de archivos que ya tiene cada módulo.
export async function fetchBQFile(source, params = {}, name = `${source}.csv`) {
  return new File([await fetchBQ(source, params)], name, { type: 'text/csv' });
}

// Puente GO PLANNER → BigQuery (Apps Script). Corre las consultas de QUERIES (Queries.gs, generado de api/_queries.js)
// con el usuario del dueño del script y regresa CSV con los mismos encabezados que /api/bq.
// Acceso: solo cuentas @suburbia.com.mx, validado con el ID token de Google que manda el front (Google Identity Services).
//
// POST (Content-Type text/plain) body JSON: { id_token, source, params: { ... } }

const CLIENT_ID = 'PEGAR_AQUI.apps.googleusercontent.com'; // OAuth Client ID (Web) — el mismo que VITE_GOOGLE_CLIENT_ID
const DOMINIO = 'suburbia.com.mx';
const BILLING_PROJECT = 'PEGAR_PROYECTO';                   // proyecto donde tu usuario puede correr jobs de BigQuery
const LOCATION = 'US';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const email = verificar_(body.id_token);
    const q = QUERIES[body.source];
    if (!q) return out_(`ERROR 404\nFuente desconocida. Disponibles: ${Object.keys(QUERIES).join(', ')}`);
    if (q.pendiente) return out_(`ERROR 501\nConsulta pendiente: falta el SQL real de «${body.source}» en api/_queries.js`);
    console.log(`${email} → ${body.source} ${JSON.stringify(body.params || {})}`);
    return out_(correr_(q, body.params || {}));
  } catch (err) {
    return out_(`ERROR ${err.code || 500}\n${err.message}`);
  }
}

// Valida firma/expiración con Google y que el token sea de este Client ID y del dominio. Cachea 10 min por token.
function verificar_(tok) {
  if (!tok) throw Object.assign(new Error('Inicia sesión con tu cuenta @' + DOMINIO), { code: 401 });
  const key = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok));
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return hit;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok), { muteHttpExceptions: true });
  const info = JSON.parse(r.getContentText());
  if (r.getResponseCode() !== 200 || info.aud !== CLIENT_ID || info.hd !== DOMINIO || info.email_verified !== 'true') {
    throw Object.assign(new Error('No autorizado: usa tu cuenta @' + DOMINIO), { code: 401 });
  }
  cache.put(key, info.email, 600);
  return info.email;
}

function correr_(q, args) {
  const req = {
    query: q.sql,
    useLegacySql: false,
    location: LOCATION,
    timeoutMs: 60000,
    maxResults: 50000,
    parameterMode: 'NAMED',
    queryParameters: (q.params || []).map((p) => ({
      name: p, parameterType: { type: 'STRING' }, parameterValue: { value: String(args[p] == null ? '' : args[p]) },
    })),
  };
  let res = BigQuery.Jobs.query(req, BILLING_PROJECT);
  const jobId = res.jobReference.jobId;
  while (!res.jobComplete) {
    Utilities.sleep(1000);
    res = BigQuery.Jobs.getQueryResults(BILLING_PROJECT, jobId, { location: LOCATION, maxResults: 50000 });
  }
  const cols = res.schema.fields.map((f) => f.name);
  const lines = [cols.join(',')];
  const add = (rows) => (rows || []).forEach((r) => lines.push(r.f.map((c) => cell_(c.v)).join(',')));
  add(res.rows);
  let page = res.pageToken;
  while (page) {
    const p = BigQuery.Jobs.getQueryResults(BILLING_PROJECT, jobId, { location: LOCATION, pageToken: page, maxResults: 50000 });
    add(p.rows);
    page = p.pageToken;
  }
  return lines.join('\n');
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const out_ = (txt) => ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.CSV);

// Correr una vez desde el editor para autorizar BigQuery y probar la conexión.
function probar() {
  console.log(correr_(QUERIES.ping, {}));
}

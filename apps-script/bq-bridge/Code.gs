// Puente GO PLANNER → BigQuery (Apps Script, ejecuta como el dueño, acceso solo cuentas de la empresa).
// GO PLANNER abre esta web app en un iframe oculto: ?source=...&params={json}&id=...&origin=https://...
// La página corre la consulta con google.script.run (con los permisos de BigQuery del dueño) y regresa el CSV
// a GO PLANNER con postMessage, solo si el origen está en la lista permitida.

const DOMINIOS = ['suburbia.com.mx'];                       // quién puede usarlo
const ORIGEN_OK = /^(https:\/\/go-?planner[\w-]*\.vercel\.app|http:\/\/localhost:5173)$/;
const BILLING_PROJECT = 'crp-pro-dwh-semanticagold';
const LOCATION = 'US';

function doGet(e) {
  const p = e.parameter;
  const origin = ORIGEN_OK.test(p.origin || '') ? p.origin : '';
  const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const html = `<script>
    var id=${js(p.id || '')}, origin=${js(origin)};
    function send(m){ if(origin){ m.id=id; window.top.postMessage(m, origin); } }
    send({ started: true });
    google.script.run
      .withSuccessHandler(function(csv){ send({ csv: csv }); })
      .withFailureHandler(function(err){ send({ error: String(err && err.message || err) }); })
      .consulta(${js(p.source || '')}, ${js(p.params || '{}')});
  </script>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Llamada desde la página (google.script.run). Valida la cuenta de quien la abre y corre la consulta de la whitelist.
function consulta(source, paramsJson) {
  const email = Session.getActiveUser().getEmail();
  if (!DOMINIOS.some((d) => email.endsWith('@' + d))) throw new Error('No autorizado: usa tu cuenta @' + DOMINIOS[0]);
  const q = QUERIES[source];
  if (!q) throw new Error('Fuente desconocida: ' + source);
  if (q.pendiente) throw new Error(`Consulta pendiente: falta el SQL real de «${source}» en api/_queries.js`);
  console.log(`${email} → ${source} ${paramsJson}`);
  return correr_(q, JSON.parse(paramsJson || '{}'));
}

function correr_(q, args) {
  const req = {
    query: q.sql, useLegacySql: false, location: LOCATION, timeoutMs: 60000, maxResults: 50000, parameterMode: 'NAMED',
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
  const lines = [res.schema.fields.map((f) => f.name).join(',')];
  const add = (rows) => (rows || []).forEach((r) => lines.push(r.f.map((c) => cell_(c.v)).join(',')));
  add(res.rows);
  for (let page = res.pageToken; page;) {
    const pg = BigQuery.Jobs.getQueryResults(BILLING_PROJECT, jobId, { location: LOCATION, pageToken: page, maxResults: 50000 });
    add(pg.rows); page = pg.pageToken;
  }
  return lines.join('\n');
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Correr desde el editor para probar BigQuery.
function probar() { console.log(correr_(QUERIES.ping, {})); }

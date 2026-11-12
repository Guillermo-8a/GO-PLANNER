// fetchBQ(source, params) → texto CSV con los encabezados que ya esperan los módulos.
// Con VITE_GAS_URL: abre el puente de Apps Script en un iframe oculto. Corre con la sesión de Google del usuario
// (solo cuentas de la empresa) y consulta BigQuery con los permisos del dueño del script; el CSV regresa por postMessage.
// Sin esa variable cae a /api/bq (cuenta de servicio + token).
import { QUERIES } from '../../api/_queries.js';

const GAS_URL = import.meta.env.VITE_GAS_URL;
const ARRANQUE_MS = 20000;   // si en 20 s no arrancó, casi seguro no hay sesión de Google de la empresa
const MAX_MS = 7 * 60000;    // Apps Script corta a los 6 min

function viaIframe(source, params) {
  return new Promise((ok, ko) => {
    const id = Math.random().toString(36).slice(2);
    const f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = `${GAS_URL}?${new URLSearchParams({ source, params: JSON.stringify(params), id, origin: location.origin })}`;
    const fin = (fn, v) => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('message', on); f.remove(); fn(v); };
    const on = (e) => {
      if (!/\.googleusercontent\.com$|^https:\/\/script\.google\.com$/.test(e.origin) || e.data?.id !== id) return;
      if (e.data.started) clearTimeout(t1);
      else if (e.data.error) fin(ko, new Error(e.data.error));
      else if (typeof e.data.csv === 'string') fin(ok, e.data.csv);
    };
    const t1 = setTimeout(() => fin(ko, new Error(`No hay sesión de Google de la empresa en este navegador. Abre ${GAS_URL.split('/s/')[0]} en otra pestaña, inicia sesión con tu cuenta @suburbia.com.mx y vuelve a intentar.`)), ARRANQUE_MS);
    const t2 = setTimeout(() => fin(ko, new Error('BigQuery tardó demasiado (más de 6 min). Reduce el rango.')), MAX_MS);
    window.addEventListener('message', on);
    document.body.appendChild(f);
  });
}

export async function fetchBQ(source, params = {}) {
  const q = QUERIES[source];
  if (q && (q.pendiente || q.sql('').includes('TODO_'))) throw new Error(`Consulta pendiente: falta el SQL real de «${source}» en api/_queries.js`);
  if (GAS_URL) return viaIframe(source, params);
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

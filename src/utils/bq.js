// fetchBQ(source, params) → texto CSV.
// Si hay VITE_GAS_URL usa el puente de Apps Script (login con Google, solo @suburbia.com.mx);
// si no, cae a /api/bq con el token compartido (cuenta de servicio en Vercel/Cloud Run).
const GAS_URL = import.meta.env.VITE_GAS_URL;
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DOMINIO = 'suburbia.com.mx';
const KEY = 'gop_id_token';

const loadGis = () => window.google?.accounts?.id ? Promise.resolve() : new Promise((ok, ko) => {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.onload = ok; s.onerror = () => ko(new Error('No cargó Google Sign-In'));
  document.head.appendChild(s);
});

const expOf = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return 0; } };

let pending = null;
const idToken = () => {
  const t = localStorage.getItem(KEY);
  if (t && expOf(t) - Date.now() > 60000) return Promise.resolve(t);
  return pending ||= loadGis().then(() => new Promise((ok, ko) => {
    // Overlay con el botón de Google (One Tap puede estar bloqueado; el botón siempre funciona)
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font:14px system-ui;color:#fff';
    ov.innerHTML = `<div>Inicia sesión con tu cuenta @${DOMINIO} para traer datos</div><div id="gop-gis"></div><button style="opacity:.7">Cancelar</button>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); pending = null; };
    ov.querySelector('button').onclick = () => { close(); ko(new Error('Inicio de sesión cancelado')); };
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID, hd: DOMINIO, auto_select: true,
      callback: ({ credential }) => { localStorage.setItem(KEY, credential); close(); ok(credential); },
    });
    window.google.accounts.id.renderButton(ov.querySelector('#gop-gis'), { theme: 'filled_blue', size: 'large', text: 'signin_with' });
  }));
};

export async function fetchBQ(source, params = {}) {
  if (GAS_URL) {
    const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ id_token: await idToken(), source, params }) });
    const txt = await r.text();
    const m = txt.match(/^ERROR (\d+)\n/);
    if (m) { if (m[1] === '401') localStorage.removeItem(KEY); throw new Error(txt.slice(m[0].length)); }
    if (!r.ok) throw new Error(txt);
    return txt;
  }
  let tok = localStorage.getItem('gop_api_token') || '';
  if (!tok) { tok = window.prompt('Token de GO PLANNER (GOP_API_TOKEN):') || ''; if (!tok) throw new Error('Sin token'); localStorage.setItem('gop_api_token', tok); }
  const r = await fetch(`/api/bq?${new URLSearchParams({ source, ...params })}`, { headers: { 'x-gop-token': tok } });
  const txt = await r.text();
  if (r.status === 401) localStorage.removeItem('gop_api_token');
  if (!r.ok) throw new Error(txt);
  return txt;
}

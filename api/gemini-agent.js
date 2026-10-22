// Vercel Serverless Function: POST /api/gemini-agent
// Modos:
//   CHAT_QA           { question, snapshot }          → { answer }  (consulta chat_ventas en BigQuery si hace falta)
//   AUDIT_SCREEN      { snapshot }                    → { level, title, items[] }
//   COMPETITOR_RADAR  { items[], stores[] }           → { results[], sources[] }
// Env vars (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY   llave de Google AI Studio / Gemini API
//   GEMINI_MODEL     opcional (default gemini-2.5-flash)
//   GOP_API_TOKEN    misma contraseña que /api/bq (header x-gop-token)
// Sin llave o sin red responde 503 y el front usa su fallback local (nunca inventa precios).

import { runQuery } from './_bq.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function gemini(prompt, { search = false, json = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
    ...(search ? { tools: [{ google_search: {} }] } : {}),
  };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web && { title: c.web.title, uri: c.web.uri })
    .filter(Boolean);
  return { text, sources };
}

const parseJSON = (text) => {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const raw = m[1].trim();
  const start = raw.search(/[[{]/);
  return JSON.parse(raw.slice(start));
};

const snap = (s = {}) => JSON.stringify({
  modulo: s.module, kpis: s.kpis, alertas: s.alerts, pantalla: String(s.text || '').slice(0, 6000),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  if (process.env.GOP_API_TOKEN && req.headers['x-gop-token'] !== process.env.GOP_API_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY no configurada' });

  const { mode } = req.body || {};
  try {
    if (mode === 'CHAT_QA') {
      const { question, snapshot } = req.body;
      const q = String(question || '').slice(0, 500);
      const hoy = new Date().toISOString().slice(0, 10);

      // 1) ¿La pregunta necesita venta histórica de BigQuery? (venta por Sección/GOA/Marca en un periodo)
      let bqData = null;
      if (process.env.GCP_SA_KEY) {
        try {
          const { text: plan } = await gemini(
            `Hoy es ${hoy}. Decide si esta pregunta necesita venta histórica (unidades, pesos, margen, descuentos) por Sección, GOA o Marca.
Responde SOLO JSON: {"bq":true|false,"dim":"SECCION|GOA|MARCA","filtro":"<sección, GOA o marca mencionada o vacío>","ini":"YYYY-MM-DD","fin":"YYYY-MM-DD"}.
"Año pasado" = año calendario anterior completo; si no dice periodo usa los últimos 30 días.
PREGUNTA: ${q}`, { json: true }
          );
          const p = parseJSON(plan);
          if (p.bq && /^\d{4}-\d{2}-\d{2}$/.test(p.ini) && /^\d{4}-\d{2}-\d{2}$/.test(p.fin)) {
            const rows = await runQuery('chat_ventas', { dim: p.dim, filtro: p.filtro || '', ini: p.ini, fin: p.fin });
            bqData = { periodo: `${p.ini} a ${p.fin}`, por: p.dim, filtro: p.filtro || 'todo', filas: rows };
          }
        } catch (e) {
          bqData = { error: `No se pudo consultar BigQuery: ${e.message.slice(0, 120)}` };
        }
      }

      // 2) Respuesta corta con pantalla + CSV del módulo + BigQuery
      const { text } = await gemini(
        `Eres GO-Bot, copiloto de un planner/buyer de calzado en México. Español mexicano, directo.
Máximo 3 líneas. Primero el dato/número, luego (si aplica) una acción concreta. Sin saludos ni relleno.
Usa SOLO estos datos: pantalla del módulo, CSV cargado y BigQuery. Si el dato no está, dilo en una línea y di qué cargar. Nunca inventes cifras.
VTAS_P y GM vienen en pesos. Puedes explicar fórmulas retail (Sell-Through, WOS, MOS, rotación, margen, OTB, fill rate) en una línea.
PANTALLA: ${snap(snapshot)}
CSV DEL MÓDULO: ${String(snapshot?.csv || 'sin archivo').slice(0, 12000)}
BIGQUERY: ${bqData ? JSON.stringify(bqData).slice(0, 8000) : 'no aplica'}
PREGUNTA: ${q}`
      );
      return res.json({ answer: text.trim(), usedBQ: Boolean(bqData?.filas) });
    }

    if (mode === 'AUDIT_SCREEN') {
      const { text } = await gemini(
        `Audita la coherencia de esta pantalla de un sistema de planeación retail (WOS, cobertura, sell-through, margen, OTB, fill rate, stock vs compras).
Usa SOLO los datos dados; no inventes cifras. Responde SOLO JSON:
{"level":"green|amber|red","title":"frase corta","items":["hallazgo concreto con el dato que lo soporta", "..."]} (máximo 4 items).
DATOS: ${snap(req.body.snapshot)}`
      );
      return res.json(parseJSON(text));
    }

    if (mode === 'COMPETITOR_RADAR') {
      const items = (req.body.items || []).slice(0, 5).map((r) => ({
        articulo: r['Artículo'], ean: r['Código EAN/UPC'], modelo: r['Modelo'], marca: r['Marca'],
        descripcion: r['Descripcion artículo'] || r['Descripción artículo'],
      }));
      const stores = (req.body.stores || []).join(', ');
      const { text, sources } = await gemini(
        `Busca en Google el precio vigente en México de estos productos en las tiendas: ${stores}.
Haz match primero por código EAN/UPC, luego por Marca+Modelo y al final por descripción equivalente.
Reglas: incluye SOLO resultados que encontraste en una página real de esa tienda, con su URL. Si no lo encuentras, no lo incluyas. No estimes precios.
Responde SOLO un arreglo JSON:
[{"articulo":"<articulo>","store":"<tienda>","title":"<nombre en la tienda>","price_regular":<número MXN>,"price_promo":<número MXN o null>,"url":"<url>","match":"EAN|Modelo|Descripción"}]
PRODUCTOS: ${JSON.stringify(items)}`,
        { search: true }
      );
      let results = [];
      try { results = parseJSON(text); } catch { results = []; }
      results = (Array.isArray(results) ? results : []).filter((r) => r && r.store && Number(r.price_regular) > 0);
      return res.json({ results, sources });
    }

    return res.status(400).json({ error: `Modo desconocido: ${mode}` });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}

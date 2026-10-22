// Vercel Serverless Function: POST /api/gemini-agent
// Modos:
//   CHAT_QA           { question, snapshot }          → { answer }
//   AUDIT_SCREEN      { snapshot }                    → { level, title, items[] }
//   COMPETITOR_RADAR  { items[], stores[] }           → { results[], sources[] }
// Env vars (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY   llave de Google AI Studio / Gemini API
//   GEMINI_MODEL     opcional (default gemini-2.5-flash)
//   GOP_API_TOKEN    misma contraseña que /api/bq (header x-gop-token)
// Sin llave o sin red responde 503 y el front usa su fallback local (nunca inventa precios).

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function gemini(prompt, { search = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 },
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
      const { text } = await gemini(
        `Eres GO-Bot, copiloto de un planner/buyer de retail de calzado en México. Responde en español mexicano informal, directo y en máximo 6 líneas.
Usa SOLO los datos de la pantalla que te paso. Si el dato no está, dilo y sugiere qué módulo o archivo cargar. Nunca inventes cifras.
Puedes explicar fórmulas de retail (Sell-Through, WOS, MOS, rotación, margen, OTB, fill rate).
DATOS DE PANTALLA: ${snap(snapshot)}
PREGUNTA: ${String(question || '').slice(0, 500)}`
      );
      return res.json({ answer: text.trim() });
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

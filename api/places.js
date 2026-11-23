// Vercel Serverless Function: POST /api/places  (header x-gop-token = GOP_API_TOKEN)
// Proxy a Google Places API (New) para el módulo Mapa de tiendas; la llave nunca llega al navegador.
//   { action: 'geocode', query }                         → { lat, lng, name, address }
//   { action: 'scan', lat, lng, radius, cats:[{id,types}] } → { cats: { id: [{ n, d, t }] }, errors: { id: msg } }
// Env vars: GOOGLE_MAPS_KEY (Places API (New) habilitada), GOP_API_TOKEN.
const URL_BASE = 'https://places.googleapis.com/v1/places:';

const distM = (a, b, c, d) => {
  const R = 6371000, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

async function gcall(method, body, mask) {
  const r = await fetch(URL_BASE + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_KEY, 'X-Goog-FieldMask': mask },
    body: JSON.stringify({ languageCode: 'es', ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  return j.places || [];
}

export default async function handler(req, res) {
  const token = req.headers['x-gop-token'];
  if (!process.env.GOP_API_TOKEN || token !== process.env.GOP_API_TOKEN) return res.status(401).send('No autorizado');
  if (!process.env.GOOGLE_MAPS_KEY) return res.status(500).send('Falta GOOGLE_MAPS_KEY en Vercel');
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    if (b.action === 'geocode') {
      const [p] = await gcall('searchText', { textQuery: String(b.query || '').slice(0, 200), maxResultCount: 1, regionCode: 'MX' },
        'places.displayName,places.location,places.formattedAddress');
      if (!p) return res.status(200).json({ lat: null });
      return res.status(200).json({ lat: p.location.latitude, lng: p.location.longitude, name: p.displayName?.text, address: p.formattedAddress });
    }

    if (b.action === 'scan') {
      const lat = +b.lat, lng = +b.lng, radius = Math.min(Math.max(+b.radius || 3000, 100), 10000);
      if (!isFinite(lat) || !isFinite(lng)) return res.status(400).send('lat/lng inválidos');
      const cats = (b.cats || []).slice(0, 20).filter((c) => /^[a-z_]+$/.test(c.id) && (c.types || []).every((x) => /^[a-z_]+$/.test(x)));
      const out = {}, errors = {};
      await Promise.all(cats.map(async (c) => {
        try {
          const ps = await gcall('searchNearby', {
            includedTypes: c.types.slice(0, 10), maxResultCount: 20, rankPreference: 'DISTANCE',
            locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
          }, 'places.displayName,places.location,places.primaryType');
          out[c.id] = ps.map((p) => ({ n: p.displayName?.text || '', d: distM(lat, lng, p.location.latitude, p.location.longitude), t: p.primaryType || '' }))
            .sort((x, y) => x.d - y.d);
        } catch (e) { errors[c.id] = e.message; }
      }));
      return res.status(200).json({ cats: out, errors });
    }

    return res.status(400).send('action debe ser geocode o scan');
  } catch (e) {
    return res.status(500).send(`Error Places: ${e.message}`);
  }
}

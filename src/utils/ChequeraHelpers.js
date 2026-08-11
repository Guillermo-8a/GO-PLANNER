import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const CHEQUERA_FIELDS = [
  { key: 'sku', label: 'SKU/Modelo', synonyms: ['sku','codigo','clave','model','modelo','style','estilo','item'] },
  { key: 'marca', label: 'Marca', synonyms: ['marca','brand'] },
  { key: 'proveedor', label: 'Proveedor', synonyms: ['proveedor','supplier','vendor','fabricante'] },
  { key: 'goa', label: 'GOA', synonyms: ['goa'] },
  { key: 'talla', label: 'Talla', synonyms: ['talla','size','talle'] },
  { key: 'color', label: 'Color', synonyms: ['color','colour','colorway'] },
  { key: 'especificaciones', label: 'Especificaciones', synonyms: ['especificacion','descripcion','detalle','spec'] },
  { key: 'mesRecepcion', label: 'Mes Recepción', synonyms: ['mes recepcion','recepcion','eta','fecha recepcion'] },
  { key: 'mesPreventa', label: 'Mes Preventa', synonyms: ['preventa','mes preventa'] },
  { key: 'mesReal', label: 'Mes Real', synonyms: ['mes real','entrega real','fecha real'] },
  { key: 'cantidad', label: 'Cant. (pzs)', synonyms: ['cantidad','qty','piezas','pzs','unidades','pares'] },
  { key: 'pvp', label: 'PVP', synonyms: ['pvp','precio','price','precio venta','msrp'] },
];

const normalize = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function autoMapHeaders(headers) {
  const map = {};
  headers.forEach((h) => {
    const nh = normalize(h);
    let best = null, bestScore = 0;
    CHEQUERA_FIELDS.forEach((f) => {
      f.synonyms.forEach((syn) => {
        const ns = normalize(syn);
        let score = 0;
        if (nh === ns) score = 100;
        else if (nh.includes(ns) || ns.includes(nh)) score = 60 + Math.min(nh.length, ns.length);
        if (score > bestScore) { bestScore = score; best = f.key; }
      });
    });
    map[h] = bestScore >= 40 ? best : null;
  });
  return map;
}

export async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// idx = índice de fila de datos (0-based, sin encabezado)
export function applyMapping(rawRows, mapping, imgMap = new Map()) {
  return rawRows.map((raw, idx) => {
    const row = { id: crypto.randomUUID(), imagenUrl: '' };
    CHEQUERA_FIELDS.forEach((f) => { row[f.key] = ''; });
    Object.entries(raw).forEach(([header, value]) => {
      const field = mapping[header];
      if (field) row[field] = value != null ? String(value).trim() : '';
    });
    const blob = imgMap.get(idx + 1); // +1: la fila 0 del sheet es el encabezado
    if (blob) row._imageBlob = blob;
    return row;
  });
}

// Extrae imágenes embebidas de un .xlsx -> Map<rowIndex(0-based con encabezado), Blob>
// Asume: primera hoja del libro, imágenes ancladas vía twoCellAnchor/oneCellAnchor.
export async function extractEmbeddedImages(file) {
  const zip = await JSZip.loadAsync(file);
  const sheetRelsFile = zip.file('xl/worksheets/_rels/sheet1.xml.rels');
  if (!sheetRelsFile) return new Map();

  const relsDoc = new DOMParser().parseFromString(await sheetRelsFile.async('text'), 'application/xml');
  const drawingRel = [...relsDoc.getElementsByTagName('Relationship')]
    .find((r) => r.getAttribute('Type')?.includes('drawing'));
  if (!drawingRel) return new Map();

  const drawingPath = 'xl/drawings/' + drawingRel.getAttribute('Target').split('/').pop();
  const drawingFile = zip.file(drawingPath);
  if (!drawingFile) return new Map();
  const drawDoc = new DOMParser().parseFromString(await drawingFile.async('text'), 'application/xml');

  const drawingRelsPath = drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels';
  const drawingRelsFile = zip.file(drawingRelsPath);
  const ridToPath = {};
  if (drawingRelsFile) {
    const drDoc = new DOMParser().parseFromString(await drawingRelsFile.async('text'), 'application/xml');
    [...drDoc.getElementsByTagName('Relationship')].forEach((r) => {
      ridToPath[r.getAttribute('Id')] = 'xl/media/' + r.getAttribute('Target').split('/').pop();
    });
  }

  const anchors = [
    ...drawDoc.getElementsByTagName('xdr:twoCellAnchor'),
    ...drawDoc.getElementsByTagName('xdr:oneCellAnchor'),
  ];
  const rowToImage = new Map();
  for (const anchor of anchors) {
    const fromRow = anchor.getElementsByTagName('xdr:from')[0]?.getElementsByTagName('xdr:row')[0]?.textContent;
    const rId = anchor.getElementsByTagName('a:blip')[0]?.getAttribute('r:embed');
    if (fromRow == null || !rId || !ridToPath[rId]) continue;
    const imgFile = zip.file(ridToPath[rId]);
    if (!imgFile) continue;
    rowToImage.set(Number(fromRow), await imgFile.async('blob'));
  }
  return rowToImage;
}

// --- IndexedDB para fotos de marca propia (persisten entre sesiones) ---
const DB_NAME = 'chequeraDB', STORE = 'imagenes';
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export async function saveImageBlob(key, blob) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
export async function getImageBlob(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}

// --- Orden cronológico de meses para el resumen ---
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function sortMonthKeys(keys) {
  const parseKey = (k) => {
    const nk = normalize(k);
    const mIdx = MESES.findIndex((m) => nk.includes(m));
    const yMatch = nk.match(/\d{2,4}/);
    const year = yMatch ? (yMatch[0].length === 2 ? 2000 + Number(yMatch[0]) : Number(yMatch[0])) : 0;
    return mIdx >= 0 ? year * 12 + mIdx : null;
  };
  return [...keys].sort((a, b) => {
    const pa = parseKey(a), pb = parseKey(b);
    if (pa == null && pb == null) return a.localeCompare(b);
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
}

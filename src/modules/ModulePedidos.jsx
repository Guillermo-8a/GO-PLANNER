// src/modules/ModulePedidos.jsx
// Pedidos (Check Coo): rastreador de OCs. Proveedor → (tránsito internacional → aduana) → PLAN (almacén / cross dock)
// → bodegas regionales · fulfillment · foro fotográfico · ruta → tienda sin entrada → recibido.
// Tres tipos de pedido con ruta propia: importación, nacional y directo a tienda.
// Entrada: CSV con una fila por evento (OC, SKU, ETAPA, FECHA_EVENTO…) o fechas por etapa en columnas.
import { createElement, useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Download, Trash2, Search, AlertTriangle, Truck, Package, Clock, CheckCircle2, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Settings, X, Store, ChevronDown, ShieldAlert, Wand2, Warehouse as WhIcon, Camera, ShoppingBag, Factory, Activity } from 'lucide-react';
import { lazy, Suspense } from 'react';
import FilterMenu, { FilterSection } from '../components/FilterMenu';
import MS from '../components/MultiSelect';
import { siteOfKey } from './pedidos/layout';
const Scene3D = lazy(() => import('./pedidos/Scene3D').then(m => { try { sessionStorage.removeItem('gop_chunk_r'); } catch {} return m; }).catch(e => {
  try { if (!sessionStorage.getItem('gop_chunk_r')) { sessionStorage.setItem('gop_chunk_r', '1'); location.reload(); return new Promise(() => {}); } } catch {}
  throw e;
}));

const LS_KEY = 'gop_pedidos';
const LS_CFG = 'gop_pedidos_cfg';
const DAY = 864e5;
const idb = (mode, fn) => new Promise((res, rej) => {
  const rq = indexedDB.open('gop_pedidos_db', 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
  rq.onerror = () => rej(rq.error);
  rq.onsuccess = () => { const tx = rq.result.transaction('kv', mode); const r = fn(tx.objectStore('kv')); tx.oncomplete = () => res(r?.result); tx.onerror = () => rej(tx.error); };
});

// ─── Etapas y buckets ─────────────────────────────────────────────────────────
const STAGES = [
  { k: 'PROVEEDOR', l: 'Con proveedor', short: 'En prov.', b: 'OO' },
  { k: 'TRANSITO_INT', l: 'Tránsito internacional', short: 'Tránsito int.', b: 'OO' },
  { k: 'ADUANA', l: 'Aduana', short: 'Aduana', b: 'OO' },
  { k: 'ALMACEN', l: 'PLAN · Almacén', short: 'Almacén', b: 'BOD' },
  { k: 'CROSSDOCK', l: 'PLAN · Cross dock', short: 'Cross dock', b: 'INP' },
  { k: 'BODEGA_REG', l: 'Bodega regional', short: 'Bodega reg.', b: 'BOD' },
  { k: 'FULFILLMENT', l: 'Fulfillment', short: 'Fulfillment', b: 'FUL' },
  { k: 'FORO', l: 'Foro fotográfico', short: 'Foro', b: 'FORO' },
  { k: 'TRANSITO_TDA', l: 'En tránsito a tienda', short: 'Ruta', b: 'TRN' },
  { k: 'TIENDA', l: 'En tienda sin entrada', short: 'Sin entrada', b: 'TDA' },
  { k: 'RECIBIDO', l: 'Recibido', short: 'Recibido', b: 'REC' },
];
const SIDX = Object.fromEntries(STAGES.map((s, i) => [s.k, i]));
const SL = Object.fromEntries(STAGES.map((s) => [s.k, s.l]));
const BUCKETS = [
  { k: 'OO', l: 'On order', I: Factory, c: '#64748B' },
  { k: 'INP', l: 'In process', I: Activity, c: '#7C5CF0' },
  { k: 'TRN', l: 'In transit', I: Truck, c: '#3B82F6' },
  { k: 'BOD', l: 'Bodegas', I: WhIcon, c: '#0EA5E9' },
  { k: 'FORO', l: 'Foro fotográfico', I: Camera, c: '#EC4899' },
  { k: 'FUL', l: 'Fulfillment', I: ShoppingBag, c: '#14B8A6' },
  { k: 'TDA', l: 'Tienda sin entrada', I: Store, c: '#F59E0B' },
];
const TIPOS = { IMP: { l: 'Importación', c: '#14B8A6' }, NAC: { l: 'Nacional', c: '#3B82F6' }, DIR: { l: 'Directo a tienda', c: '#F59E0B' } };
// Centros que no son tienda: CRs (fulfillment) y CEDIS
// Zonas de venta Suburbia: siempre visibles (aunque no tengan pedidos) para que el plano no se mueva
const ZONAS_SBB = ['METRO CENTRO', 'METRO NORTE', 'METRO ORIENTE', 'METRO SUR', 'CENTRO NORTE', 'CENTRO SUR', 'BAJIO', 'OCCIDENTE', 'PACIFICO', 'NORTE', 'GOLFO', 'SUR'];
const CENTROS = { '1007': 'FORO FOTOGRÁFICO', '107S': 'CR ACAPULCO', '094S': 'CR LEON', '049S': 'CR MONTERREY', '147S': 'CR CULIACAN', '093S': 'CR VILLAHERMOSA', '155S': 'CR TAPACHULA', '185S': 'CR ZONA NORTE', '158S': 'CR LA PAZ', '108S': 'CR MORELIA', '151S': 'CR OAXACA', '171S': 'CR SALINA CRUZ', '119S': 'CR CANCUN', '148S': 'CR DURANGO', '032S': 'CR COATZACOALCOS', '880S': 'CEDIS SOFTLINE PLAN', '895S': 'PLAN SOFTLINE BODEGA', '0670': 'CEDIS TULTIPARK', '811S': 'PLAN BIG TICKET 2', '095S': 'CD NACIONAL BIG TICKET', '0681': 'SUBURBIA CEDIS MONTE' };
const DEF_UMBRAL = { PROVEEDOR: 0, TRANSITO_INT: 35, ADUANA: 7, ALMACEN: 15, CROSSDOCK: 3, BODEGA_REG: 20, FULFILLMENT: 30, FORO: 10, TRANSITO_TDA: 4, TIENDA: 2 };
const BASE_ROUTE = { IMP: ['PROVEEDOR', 'TRANSITO_INT', 'ADUANA', 'CROSSDOCK', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'], NAC: ['PROVEEDOR', 'CROSSDOCK', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'], DIR: ['PROVEEDOR', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'] };
const FINALES = ['BODEGA_REG', 'FULFILLMENT', 'FORO'];
// Umbrales de semáforo (KPIs y halos de nodos) en un solo lugar
const SEMAFORO = { aTiempo: { ok: 90, riesgo: 75 }, leadObjetivo: 30, nodo: { riesgo: 0.05, atorado: 0.2 } };
const BUCKET_SEL = { OO: { key: 'B:OO', stages: ['PROVEEDOR', 'TRANSITO_INT', 'ADUANA'], titulo: 'On order' }, INP: { key: 'XD', stages: ['CROSSDOCK'], titulo: 'PLAN · Cross dock (in process)' }, TRN: { key: 'B:TRN', stages: ['TRANSITO_TDA'], titulo: 'In transit a tienda' }, BOD: { key: 'B:BOD', stages: ['ALMACEN', 'BODEGA_REG'], titulo: 'Bodegas (PLAN + regionales)' }, FORO: { key: 'FORO', stages: ['FORO'], titulo: 'Foro fotográfico' }, FUL: { key: 'FUL', stages: ['FULFILLMENT'], titulo: 'Fulfillment · E-commerce' }, TDA: { key: 'B:TDA', stages: ['TIENDA'], titulo: 'Tienda sin entrada' } };

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
// Estatus de la OC de importación (SAP): el código dice exactamente dónde está la mercancía
const IMP_STATUS = {
  1: ['PROVEEDOR', '01 Pendiente de embarque'],
  2: ['PROVEEDOR', '02 En almacén (origen)'],
  3: ['TRANSITO_INT', '03 En tránsito'],
  4: ['ADUANA', '04 En aduana'],
  5: ['ALMACEN', '05 En CEDIS'],
};
const impStatus = (v) => { const m = norm(v).match(/^0?([1-5])(?:\s|$)/); return m ? IMP_STATUS[m[1]] : null; };
const stageOf = (v) => {
  const s = norm(v);
  if (!s) return null;
  const imp = impStatus(s); if (imp) return imp[0];
  if (/FORO|FOTO/.test(s)) return 'FORO';
  if (/FULFIL|E ?COMMERCE|ECOM|DIGITAL|WEB/.test(s)) return 'FULFILLMENT';
  if (/RECIB|ENTRADA|REGISTR|\bGR\b|INGRES/.test(s)) return 'RECIBIDO';
  if (/SIN ENTRADA|LLEGADA TIENDA|EN TIENDA|ENTREGAD|TIENDA/.test(s)) return 'TIENDA';
  if (/RUTA|SALIDA|TRANSITO T|IN TRANSIT|ENVIAD|DESPACH/.test(s)) return 'TRANSITO_TDA';
  if (/CROSS|PROCES|TRABAJ|SURTID|PICKING|DISTRIBU/.test(s)) return 'CROSSDOCK';
  if (/REGIONAL|BODEGA (?!CENTRAL)|\bBDG\b/.test(s)) return 'BODEGA_REG';
  if (/ALMAC|CEDIS|PLAN|BODEGA CENTRAL|\bCD\b/.test(s)) return 'ALMACEN';
  if (/ADUAN|PEDIMENT|LIBERA|PUERTO|DESADUAN/.test(s)) return 'ADUANA';
  if (/TRANSITO|MARITIM|EMBARC|NAVIER|ZARP|CONTENED|INTERNAC/.test(s)) return 'TRANSITO_INT';
  if (/PROV|FABRIC|COLOCAD|\bOC\b|ORDEN|CONFIRM|PRODUC|ON ORDER/.test(s)) return 'PROVEEDOR';
  return null;
};
const toDate = (v) => {
  if (v instanceof Date) return v;
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Math.round((Number(s) - 25569) * DAY));
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  const d = new Date(s);
  return isNaN(d) ? null : d;
};
const numv = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const fmt = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const fk = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : fmt(v));
const fdate = (d) => (d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—');
const dias = (a, b) => (a && b ? (b - a) / DAY : null);
const ctr = (v) => { const s = String(v ?? '').trim(); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; };
const hace = (d, hoy) => { const h = (hoy - d) / 36e5; return h < 24 ? `hace ${Math.max(1, Math.round(h))} h` : `hace ${Math.round(h / 24)} d`; };

// ─── CSV ──────────────────────────────────────────────────────────────────────
const decode = (buf) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } };
const parseCSV = (text) => {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const sep = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
};
const ALIAS = {
  oc: ['OC', 'PEDIDO', 'ORDEN', 'ORDEN DE COMPRA', 'PO', 'NO OC', 'NUM OC'],
  pos: ['POSICION', 'POS', 'ITEM'],
  sku: ['SKU', 'ARTICULO', 'MATERIAL', 'UPC', 'EAN'],
  modelo: ['MODELO', 'ESTILO', 'GENERICO', 'STYLE'],
  prov: ['PROVEEDOR', 'VENDOR', 'NOMBRE PROVEEDOR'],
  marca: ['MARCA', 'BRAND'],
  seccion: ['SECCION', 'DEPARTAMENTO'],
  division: ['DIVISION', 'DIV'],
  goa: ['GOA', 'FAMILIA'],
  origen: ['TIPO PEDIDO', 'ORIGEN', 'IMP NAC', 'TIPO', 'IMPORTACION', 'TIPO OC'],
  pzsPed: ['PIEZAS PEDIDAS', 'PZS PEDIDAS', 'CANTIDAD PEDIDA', 'PEDIDAS', 'CANTIDAD OC'],
  pzsEv: ['PIEZAS EVENTO', 'PIEZAS', 'PZS', 'CANTIDAD', 'UNIDADES'],
  valor: ['VALOR', 'IMPORTE', 'MONTO', 'COSTO'],
  etapa: ['ETAPA', 'ESTATUS', 'STATUS', 'EVENTO', 'ESTADO'],
  ubic: ['UBICACION', 'LUGAR', 'LOCACION', 'CIUDAD'],
  centro: ['CENTRO', 'TIENDA', 'DESTINO', 'CENTRO DESTINO'],
  zona: ['ZONA', 'REGION', 'PLAZA'],
  fecha: ['FECHA EVENTO', 'FECHA', 'FECHA HORA', 'TIMESTAMP'],
  fechaOc: ['FECHA OC', 'FECHA PEDIDO', 'FECHA CREACION'],
  fechaComp: ['FECHA COMPROMISO', 'COMPROMISO', 'ETA', 'FECHA ENTREGA', 'FECHA PROMESA'],
  cont: ['CONTENEDOR', 'GUIA', 'EMBARQUE', 'TRACKING'],
};
const mapCols = (hdr) => {
  const n = hdr.map(norm), cols = {}, used = new Set();
  Object.entries(ALIAS).forEach(([k, al]) => { const i = n.findIndex((h, j) => !used.has(j) && al.includes(h)); if (i >= 0) { cols[k] = i; used.add(i); } });
  Object.entries(ALIAS).forEach(([k, al]) => { if (cols[k] != null || k === 'fecha') return; const i = n.findIndex((h, j) => !used.has(j) && al.some((a) => a.length > 3 && h.includes(a))); if (i >= 0) { cols[k] = i; used.add(i); } });
  return { cols, n, used };
};
const tipoOf = (v) => { const s = norm(v); return /DIR|DIRECT|TIENDA/.test(s) ? 'DIR' : /IMP|INT|EXT/.test(s) ? 'IMP' : /NAC/.test(s) ? 'NAC' : ''; };
function parseEventos(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { ev: [], aviso: 'El archivo no trae filas.' };
  const { cols, n, used } = mapCols(rows[0]);
  if (cols.oc == null) return { ev: [], aviso: `No encontré la columna OC/PEDIDO. Leí: ${rows[0].slice(0, 12).join(', ')}` };
  // Extracto BigQuery (PEDIDOS_TRACK): una fila por OC × GOA × tienda con fecha-hora por evento (EKBE)
  if (n.includes('DT CEDIS')) {
    const v = (r, h) => String(r[n.indexOf(h)] ?? '').trim();
    const ev = [];
    rows.slice(1).forEach((r) => {
      const oc = v(r, 'OC'); if (!oc) return;
      const cOc = v(r, 'CENTRO OC'), tienda = v(r, 'TIENDA') || cOc;
      const origen = /IMP/.test(v(r, 'TIPO')) ? 'IMP' : /^\d{4}$/.test(cOc) && !CENTROS[cOc] ? 'DIR' : 'NAC'; // un CEDIS (0670, 0681) no es tienda
      const asig = numv(v(r, 'PZS ASIG'));
      const comp = v(r, 'COMPROMISO');
      const okF = (x) => (x && !x.startsWith('1900') ? x : ''), fv0 = okF(v(r, 'FIN VIGENCIA')), fe0 = okF(v(r, 'FCH ENTREGA CDI'));
      const base = {
        oc, pos: '', sku: v(r, 'GOA'), modelo: '', prov: v(r, 'PROVEEDOR') || 'Sin proveedor', marca: v(r, 'MARCA') || '—', seccion: v(r, 'SECCION'), division: v(r, 'DIV') || v(r, 'DIVISION'), goa: v(r, 'GOA'), origen,
        pzsPed: asig || numv(v(r, 'PZS PEDIDAS')), pzsEv: 0, valor: numv(v(r, 'COSTO ASIG')) || numv(v(r, 'COSTO PEDIDO')), ubic: '', centro: ctr(tienda), zona: norm(v(r, 'ZONA')), cont: '', mon: origen === 'IMP' ? 'USD' : '', // el costo de importación viene en dólares
        fechaOc: toDate(v(r, 'FCH OC')), fechaComp: fv0 ? toDate(fv0) : comp && !comp.startsWith('1900') ? toDate(comp) : null,
        // Cierre de la OC (SAP): entrega a CEDIS, piezas y montos pedidos vs entregados. Entregada con faltante = pedido incompleto
        fEntCDI: fe0 ? toDate(fe0) : null, pedOC: numv(v(r, 'PZS PEDIDAS OC')), recOC: numv(v(r, 'PZS RECIBIDAS OC')), mPedOC: numv(v(r, 'MONTO PEDIDO PV')), mEntOC: numv(v(r, 'MONTO ENTREGADO')),
        pedGoa: numv(v(r, 'PZS PEDIDAS')), recGoa: numv(v(r, 'PZS REC CEDIS')), pvGoa: numv(v(r, 'PV PEDIDO')), pvRecGoa: numv(v(r, 'PV REC CEDIS')), trCerrado: /^(TRUE|1|SI|X)$/i.test(v(r, 'TR CERRADO')), // pedido y recibido en CEDIS de la OC × GOA
        traslado: v(r, 'NUM TRASLADO'), fechaEntPlan: fv0 ? toDate(fv0) : comp && !comp.startsWith('1900') ? toDate(comp) : null, // el traslado vence con la fecha fin de la OC (no la del traslado, que SAP pone a +1 día)
      };
      const add = (etapa, h, pzsEv, ubic) => { const f = toDate(v(r, h)); if (f) ev.push({ ...base, etapa, fecha: f, pzsEv, ubic }); };
      // Inventario en CEDIS / CR (sin traslado, asignado) y mercancía embarcada: una sola foto fechada en la última entrada
      if (v(r, 'CLASE DOC') === 'INV') {
        const es = v(r, 'ESTATUS');
        // Tránsito a tienda según BI/SAP (IT_Unidades): solo alimenta la tarjeta "En tránsito a tiendas", no crea unidades
        if (es === 'IT BI') { ev.push({ ...base, etapa: 'TRANSITO_TDA', fecha: new Date(), pzsEv: 0, itbi: true, pzsPed: numv(v(r, 'PZS PEDIDAS')), valor: numv(v(r, 'PV PEDIDO')) }); return; }
        // 880S = cross dock de PLAN; 895S y demás CEDIS = bodega (almacén); CR = fulfillment
        const etapa = es === 'EMBARCADA' ? 'TRANSITO_INT' : v(r, 'TIPO DESTINO') === 'CR' ? 'FULFILLMENT' : cOc === '1007' ? 'FORO' : cOc === '880S' ? 'CROSSDOCK' : 'ALMACEN';
        base.inv = true; base.sku = [v(r, 'GOA'), v(r, 'MARCA'), v(r, 'SECCION'), v(r, 'DIV')].join(' · '); // inventario, no OC (no cuenta para atorados, lead ni a tiempo); llave única para no fusionar líneas
        add(etapa, 'DT CEDIS', 0, es === 'EMBARCADA' ? cOc : `${CENTROS[cOc] || cOc} · ${es === 'INV ASIGNADO' ? 'con traslado' : 'sin traslado'}`);
        return;
      }
      // Salida parcial (PZS_SALIDA < PZS_ASIG): lo surtido sigue su ruta y el saldo se queda en cross dock como línea aparte
      const sal = numv(v(r, 'PZS SALIDA')), asg = numv(v(r, 'PZS ASIG')), parcial = origen !== 'DIR' && !!v(r, 'DT SALIDA') && sal > 0 && asg > sal, i0 = ev.length;
      add('PROVEEDOR', 'FCH OC', 0, base.prov);
      if (origen === 'DIR') add('RECIBIDO', 'DT CEDIS', numv(v(r, 'PZS REC CEDIS')), `T${tienda}`);
      else {
        add(cOc === '880S' ? 'CROSSDOCK' : 'ALMACEN', 'DT CEDIS', 0, cOc); // la OC entra al cross dock (880S) o a bodega (895S)
        // Asignado en PLAN después (o antes) de recibir → se trabaja en cross dock desde la fecha más tardía
        const fC = toDate(v(r, 'DT CEDIS')), fP = toDate(v(r, 'DT PLAN'));
        if (fC && fP) ev.push({ ...base, etapa: 'CROSSDOCK', fecha: new Date(Math.max(fC, fP) + 1000), pzsEv: 0, ubic: `${cOc} · asignado` });
      }
      if (parcial) {
        const i1 = ev.length, k = sal / asg;
        for (let i = i0; i < i1; i++) ev.push({ ...ev[i], sku: `${ev[i].sku} · saldo`, pzsPed: asg - sal, valor: ev[i].valor * (1 - k), saldo: true });
        for (let i = i0; i < i1; i++) Object.assign(ev[i], { pzsPed: sal, valor: ev[i].valor * k });
        Object.assign(base, { pzsPed: sal, valor: base.valor * k });
      }
      add('TRANSITO_TDA', 'DT SALIDA', numv(v(r, 'PZS SALIDA')), `${cOc} → T${tienda}`);
      // Destino: CR (fulfillment) → Fulfillment; CEDIS o TIPO_DESTINO BODEGA → bodega; lo demás es tienda
      const td = v(r, 'TIPO DESTINO'), cen = CENTROS[tienda] || CENTROS[ctr(tienda)];
      add(cen === CENTROS['1007'] ? 'FORO' : td === 'CR' || cen?.startsWith('CR ') ? 'FULFILLMENT' : td === 'BODEGA' || cen ? 'BODEGA_REG' : 'RECIBIDO', 'DT TIENDA', numv(v(r, 'PZS TIENDA')), cen || `T${tienda}`);
    });
    return { ev, aviso: ev.length ? '' : 'No encontré eventos con fecha válida.' };
  }
  const wide = cols.etapa == null ? n.map((h, i) => (!used.has(i) && /^(FECHA|F) /.test(h) ? { i, st: stageOf(h.replace(/^(FECHA|F) /, '')) } : null)).filter((x) => x && x.st) : [];
  if (cols.etapa == null && !wide.length) return { ev: [], aviso: 'Falta ETAPA (o columnas FECHA_ADUANA, FECHA_PLAN…).' };
  const g = (r, k) => (cols[k] != null ? String(r[cols[k]] ?? '').trim() : '');
  const ev = [];
  rows.slice(1).forEach((r) => {
    const base = {
      oc: g(r, 'oc'), pos: g(r, 'pos'), sku: g(r, 'sku') || g(r, 'modelo'), modelo: g(r, 'modelo'), prov: g(r, 'prov') || 'Sin proveedor',
      marca: g(r, 'marca') || '—', seccion: g(r, 'seccion'), division: g(r, 'division'), goa: g(r, 'goa'), origen: tipoOf(g(r, 'origen')),
      pzsPed: numv(g(r, 'pzsPed')), pzsEv: numv(g(r, 'pzsEv')), valor: numv(g(r, 'valor')),
      ubic: g(r, 'ubic'), centro: ctr(g(r, 'centro')), zona: norm(g(r, 'zona')), cont: g(r, 'cont'),
      fechaOc: toDate(g(r, 'fechaOc')), fechaComp: toDate(g(r, 'fechaComp')),
    };
    if (!base.oc) return;
    if (cols.etapa != null) {
      const st = stageOf(g(r, 'etapa')) || stageOf(base.ubic);
      const f = toDate(g(r, 'fecha'));
      const imp = impStatus(g(r, 'etapa'));
      if (st && f) ev.push({ ...base, etapa: st, fecha: f, ubic: imp ? [imp[1], base.ubic].filter(Boolean).join(' · ') : base.ubic, ...(imp ? { origen: base.origen || 'IMP' } : {}) });
    } else wide.forEach(({ i, st }) => { const f = toDate(r[i]); if (f) ev.push({ ...base, etapa: st, fecha: f }); });
  });
  return { ev, aviso: ev.length ? '' : 'No encontré eventos con etapa y fecha válidas.' };
}

// Plan de compra (resumen ejecutivo): MES, SECCION, MARCA, GOA + BUDGET/OTB (pensado comprar) y PLAN, en $ y/o pzs
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const mesKey = (v) => {
  const s = norm(v); if (!s) return 'SIN';
  let m = s.match(/^(\d{4}) (\d{1,2})$/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2}) (\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const i = MESES.findIndex((x) => s.startsWith(x) || s.includes(` ${x}`)); const y = (s.match(/\d{4}/) || s.match(/\d{2}$/) || [])[0];
  if (i >= 0 && y) return `${y.length === 2 ? `20${y}` : y}-${String(i + 1).padStart(2, '0')}`;
  const d = toDate(v); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'SIN';
};
function parsePlanCompra(text) {
  const rows = parseCSV(text); if (rows.length < 2) return [];
  const h = rows[0].map(norm); const fi = (re) => h.findIndex((x) => re.test(x));
  const iMes = fi(/^(MES|PERIODO|FECHA)/), iDiv = fi(/^DIV/), iSec = fi(/SECCION|DEPARTAMENTO/), iMar = fi(/MARCA|BRAND/), iGoa = fi(/GOA|FAMILIA/);
  const isP = (x) => /PZS|PIEZAS|UNID|\bU$/.test(x);
  const col = (re, pz) => h.findIndex((x) => re.test(x) && isP(x) === pz);
  const B = /BUDGET|OTB|PENSADO|PRESUPUESTO/, P = /PLAN/;
  const c = { b$: col(B, false), bp: col(B, true), p$: col(P, false), pp: col(P, true) };
  return rows.slice(1).map((r) => ({ mes: iMes >= 0 ? mesKey(r[iMes]) : 'SIN', division: iDiv >= 0 ? norm(r[iDiv]) : '', seccion: iSec >= 0 ? norm(r[iSec]) : '', marca: iMar >= 0 ? norm(r[iMar]) : '', goa: iGoa >= 0 ? norm(r[iGoa]) : '',
    bud$: c.b$ >= 0 ? numv(r[c.b$]) : 0, budP: c.bp >= 0 ? numv(r[c.bp]) : 0, plan$: c.p$ >= 0 ? numv(r[c.p$]) : 0, planP: c.pp >= 0 ? numv(r[c.pp]) : 0 }))
    .filter((x) => x.bud$ || x.budP || x.plan$ || x.planP);
}

// ─── Datos de prueba ──────────────────────────────────────────────────────────
function demoEventos() {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const provs = [['WEEKEND', 'NAC'], ['FLEXI', 'NAC'], ['ANDREA', 'DIR'], ['SKECHERS', 'IMP'], ['NIKE', 'IMP'], ['CONVERSE', 'IMP'], ['PRICE SHOES', 'DIR'], ['VANS', 'IMP'], ['CKLASS', 'NAC'], ['MIRAMAR', 'NAC']];
  const zonas = { NORTE: 34, 'METRO CENTRO': 52, BAJIO: 30, OCCIDENTE: 33, SUR: 26, GOLFO: 25 };
  const tiendas = {}; let c0 = 100; Object.entries(zonas).forEach(([z, n]) => { tiendas[z] = Array.from({ length: n }, () => String(c0++).padStart(4, '0')); });
  const ciudades = ['MONTERREY', 'GUADALAJARA', 'MERIDA'];
  const goas = ['TENIS URBANO', 'CHOCLO', 'BOTA', 'SANDALIA', 'MOCASIN'];
  const dur = { PROVEEDOR: [8, 25], TRANSITO_INT: [22, 35], ADUANA: [2, 10], ALMACEN: [3, 14], CROSSDOCK: [0.5, 3], BODEGA_REG: [5, 18], FULFILLMENT: [5, 25], FORO: [3, 9], TRANSITO_TDA: [1, 4], TIENDA: [0.2, 3] };
  const now = Date.now(), ev = [];
  for (let o = 0; o < 150; o++) {
    const [prov, tipo] = pick(provs); const oc = String(4500100000 + o * 37);
    const zona = pick(Object.keys(zonas)); const centro = pick(tiendas[zona]); const goa = pick(goas);
    const r = rnd(); const destino = tipo === 'DIR' ? 'TIENDA' : r < 0.1 ? 'BODEGA_REG' : r < 0.17 ? 'FULFILLMENT' : r < 0.22 ? 'FORO' : 'TIENDA';
    let route = [...BASE_ROUTE[tipo]];
    if (tipo !== 'DIR' && rnd() < 0.35) route.splice(route.indexOf('CROSSDOCK'), 0, 'ALMACEN');
    if (destino !== 'TIENDA') route = [...route.slice(0, route.indexOf('CROSSDOCK') + 1), destino];
    const age = 3 + rnd() * (tipo === 'IMP' ? 100 : 55);
    let t = now - age * DAY; const fechaOc = new Date(t);
    const total = route.slice(0, -1).reduce((a, k) => a + (dur[k][0] + dur[k][1]) / 2, 0);
    const fechaComp = new Date(t + total * DAY * (0.85 + rnd() * 0.35));
    const pzs = 40 + Math.floor(rnd() * 700);
    const ciudad = pick(ciudades);
    const base = { oc, pos: '10', sku: `${goa.slice(0, 3)}${o}`, modelo: `${goa.slice(0, 3)}-${100 + o}`, prov, marca: prov, seccion: 'ZAPATERIA', division: 'CALZADO', goa, origen: tipo, pzsPed: pzs, pzsEv: pzs, valor: pzs * (tipo === 'IMP' ? 520 : 310), centro: destino === 'TIENDA' ? centro : '', zona: destino === 'TIENDA' ? zona : '', cont: tipo === 'IMP' ? `MSKU${700000 + o}` : '', fechaOc, fechaComp };
    for (const k of route) {
      if (t > now) break;
      const ubic = { ADUANA: 'Manzanillo', ALMACEN: 'PLAN', CROSSDOCK: 'PLAN', BODEGA_REG: ciudad, FULFILLMENT: 'Fulfillment', FORO: 'Foro', TIENDA: `T${centro}`, RECIBIDO: `T${centro}` }[k] || '';
      ev.push({ ...base, etapa: k, fecha: new Date(t), ubic });
      if (k === 'RECIBIDO' || FINALES.includes(k)) break;
      let d = dur[k][0] + rnd() * (dur[k][1] - dur[k][0]);
      if (rnd() < 0.1) d *= 2.3;
      t += d * DAY;
    }
  }
  return ev;
}

// ─── Modelo ───────────────────────────────────────────────────────────────────
function buildUnits(ev, umbral, hoy) {
  const m = new Map();
  ev.forEach((e) => {
    // Etapas de versiones anteriores (CEDIS, PLAN…) se re-mapean; las que no se reconocen se ignoran
    if (SIDX[e.etapa] == null) { const st = stageOf(e.etapa); if (!st) return; e = { ...e, etapa: st }; }
    if (e.origen && !TIPOS[e.origen]) e = { ...e, origen: tipoOf(e.origen) };
    const k = `${e.oc}|${e.sku}|${e.centro}`; if (!m.has(k)) m.set(k, []); m.get(k).push(e);
  });
  const units = [];
  m.forEach((list, key) => {
    list.sort((a, b) => a.fecha - b.fecha || SIDX[a.etapa] - SIDX[b.etapa]);
    const f = list[0], last = list[list.length - 1];
    const has = (k) => list.some((e) => e.etapa === k);
    const tipo = list.find((e) => e.origen)?.origen || (has('ADUANA') || has('TRANSITO_INT') ? 'IMP' : (has('TIENDA') || has('TRANSITO_TDA')) && !has('ALMACEN') && !has('CROSSDOCK') ? 'DIR' : 'NAC');
    const pzs = Math.max(...list.map((e) => e.pzsPed || 0), ...list.map((e) => e.pzsEv || 0));
    const pzsRec = list.filter((e) => e.etapa === 'RECIBIDO').reduce((a, e) => a + (e.pzsEv || 0), 0);
    const at = {}; list.forEach((e) => { if (!at[e.etapa]) at[e.etapa] = e.fecha; });
    const tramos = {};
    for (let i = 0; i < list.length - 1; i++) { if (list[i].etapa !== list[i + 1].etapa) tramos[list[i].etapa] = (tramos[list[i].etapa] || 0) + dias(list[i].fecha, list[i + 1].fecha); }
    const etapa = last.etapa;
    const enEtapa = etapa === 'RECIBIDO' ? 0 : dias(last.fecha, hoy);
    // Ruta: la base del tipo + etapas reales que no estén; si terminó en un destino final (bodega reg., fulfillment, foro) se corta ahí
    let route = [...BASE_ROUTE[tipo]];
    list.forEach((e) => { if (!route.includes(e.etapa)) route.push(e.etapa); });
    route.sort((a, b) => SIDX[a] - SIDX[b]);
    const fin = FINALES.find((k) => has(k));
    if (fin && !has('TIENDA') && !has('RECIBIDO')) route = route.filter((k) => SIDX[k] <= SIDX.CROSSDOCK || k === fin);
    if (fin && has('ALMACEN') && !has('CROSSDOCK')) route = route.filter((k) => k !== 'CROSSDOCK');
    const fechaComp = list.find((e) => e.fechaComp)?.fechaComp || null;
    const inicio = list.find((e) => e.fechaOc)?.fechaOc || f.fecha;
    const llegada = at.RECIBIDO || (fin ? at[fin] : null);
    units.push({
      key, oc: f.oc, sku: f.sku, modelo: f.modelo, prov: f.prov, marca: f.marca, seccion: f.seccion, division: f.division || '', goa: f.goa, centro: list.find((e) => e.centro)?.centro || '',
      zona: list.find((e) => e.zona)?.zona || '', cont: list.find((e) => e.cont)?.cont || '', traslado: list.find((e) => e.traslado)?.traslado || '', fechaEntPlan: list.find((e) => e.fechaEntPlan)?.fechaEntPlan || null,
      // traslado vencido: sigue en cross dock y ya pasó la fecha comprometida de entrega del traslado
      trCerrado: list.some((e) => e.trCerrado), trVencido: etapa === 'CROSSDOCK' && !has('TRANSITO_TDA') && !list.some((e) => e.trCerrado) && list.some((e) => e.traslado) && enEtapa > (umbral.CROSSDOCK ?? 3), ciudad: norm(list.filter((e) => e.etapa === 'BODEGA_REG').pop()?.ubic || ''),
      tipo, pzs, pzsRec, valor: Math.max(...list.map((e) => e.valor || 0)), etapa, desde: last.fecha, ubic: last.ubic, enEtapa, at, tramos, eventos: list, route,
      fechaComp, inicio, fin: llegada, lead: llegada ? dias(inicio, llegada) : null,
      // Con proveedor: atorado solo si ya pasó su compromiso + tolerancia (una OC para enero no está atorada hoy).
      // Resto de etapas: días sin moverse desde su último registro > umbral.
      atorado: etapa === 'FORO' ? false : etapa === 'PROVEEDOR' ? !!(fechaComp && dias(fechaComp, hoy) > (umbral.PROVEEDOR ?? 0)) : etapa !== 'RECIBIDO' && enEtapa > (umbral[etapa] ?? 99),
      // El compromiso es del proveedor: se mide contra la llegada a CEDIS (o al destino si no pasa por CEDIS)
      vencido: !(at.ALMACEN || at.CROSSDOCK || llegada) && fechaComp && hoy > fechaComp,
      aTiempo: fechaComp && (at.ALMACEN || at.CROSSDOCK || llegada) ? (at.ALMACEN || at.CROSSDOCK || llegada) <= new Date(fechaComp.getTime() + DAY - 1) : null,
    });
  });
  return units;
}
const bucketOf = (u) => STAGES[SIDX[u.etapa]].b;
const inS = (st, v) => !st.size || st.has(v); // filtro multi-selección: vacío = todos

function MultiSel({ label, options, sel, onChange, t, isDark, fmtOpt = (x) => x }) {
  return <MS label={label} options={options.map((o) => ({ value: o, label: fmtOpt(o) }))} selected={[...sel]} onChange={(a) => onChange(new Set(a))} t={t} isDark={isDark} />;
}

export default function ModulePedidos({ t, isDark, navIcon, navLabel, navDesc }) {
  const [ev, setEv] = useState(() => { try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s ? s.map((e) => ({ ...e, fecha: new Date(e.fecha), fechaOc: e.fechaOc ? new Date(e.fechaOc) : null, fechaComp: e.fechaComp ? new Date(e.fechaComp) : null })) : []; } catch { return []; } });
  const [cfg, setCfg] = useState(() => { try { const c = JSON.parse(localStorage.getItem(LS_CFG) || '{}'); return { ...c, v2: true, umbral: { ...DEF_UMBRAL, ...(c.umbral || {}), ...(c.v2 ? {} : { PROVEEDOR: 0 }) } }; } catch { return { umbral: DEF_UMBRAL }; } });
  const [aviso, setAviso] = useState('');
  const [fProv, setFProv] = useState(() => new Set()); const [fMarca, setFMarca] = useState(() => new Set()); const [fTipo, setFTipo] = useState(() => new Set()); const [fZona, setFZona] = useState(() => new Set()); const [fDiv, setFDiv] = useState(() => new Set()); const [fGoa, setFGoa] = useState(() => new Set());
  const [fSolo, setFSolo] = useState(''); const [q, setQ] = useState(''); const [fSec, setFSec] = useState(() => new Set()); const [fMes, setFMes] = useState(() => new Set());
  const [hoverTipo, setHoverTipo] = useState(''); const [feedAge, setFeedAge] = useState(''); const [expOC, setExpOC] = useState('');
  const [sel, setSel] = useState(null); // { key, stages:[...], titulo, zona?, ciudad? }
  const [selUnit, setSelUnit] = useState(null); const [selOC, setSelOC] = useState(''); // tracking de toda la OC (todas sus tiendas)
  const [selTienda, setSelTienda] = useState('');
  const [showCfg, setShowCfg] = useState(false);
  const [play, setPlay] = useState(() => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [zoomCmd, setZoomCmd] = useState({ n: 0, f: 1 });
  const [feedTab, setFeedTab] = useState('mov');
  const [feedOpen, setFeedOpen] = useState(false);
  const [site, setSite] = useState('RED');
  const [pTab, setPTab] = useState('rastreo'); // 'rastreo' | 'resumen' | 'validador'
  const [vRegla, setVRegla] = useState('');
  const [plan, setPlan] = useState(() => { try { return JSON.parse(localStorage.getItem('gop_pedidos_plan') || '[]'); } catch { return []; } });
  const [rsMed, setRsMed] = useState('$'); const [rsPorMes, setRsPorMes] = useState(true); const [rsOpen, setRsOpen] = useState(() => new Set());
  const planRef = useRef(null);
  useEffect(() => { try { localStorage.setItem('gop_pedidos_plan', JSON.stringify(plan)); } catch { /* sin espacio */ } }, [plan]);
  const fileRef = useRef(null);
  const hoy = useMemo(() => new Date(), [ev]);

  // La base real (decenas de miles de líneas) no cabe en localStorage → se guarda en IndexedDB
  // (al abrir se lee de IndexedDB y NO se vuelve a escribir: re-guardar decenas de miles de líneas congelaba la pantalla)
  const idbReady = useRef(false), skipSave = useRef(false);
  const [cargando, setCargando] = useState(true);
  useEffect(() => { idb('readonly', (st) => st.get('ev')).then((x) => { if (Array.isArray(x) && x.length && !ev.length) { skipSave.current = true; setEv(x); } }).catch(() => {}).finally(() => { idbReady.current = true; setCargando(false); }); }, []);
  useEffect(() => { if (!idbReady.current) return; if (skipSave.current) { skipSave.current = false; return; } idb('readwrite', (st) => st.put(ev, 'ev')).catch(() => {}); try { localStorage.removeItem(LS_KEY); if (ev.length) localStorage.setItem('gop_pedidos_has', '1'); else localStorage.removeItem('gop_pedidos_has'); } catch { /* nada */ } }, [ev]);
  useEffect(() => { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch { /* sin espacio */ } }, [cfg]);
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const { ev: x, aviso: a } = parseEventos(decode(rd.result)); setAviso(a); if (x.length) { setEv(x); setSel(null); setSelUnit(null); } };
    rd.readAsArrayBuffer(f); e.target.value = '';
  };

  // Zona de cada tienda: columna ZONA → base de Traslados → bloques por número de tienda
  // Tipo de cambio USD→MXN del día de la OC (Frankfurter/BCE, se guarda); si no hay conexión usa el manual de la configuración
  const [fx, setFx] = useState(() => { try { return JSON.parse(localStorage.getItem('gop_fx_usdmxn') || '{}'); } catch { return {}; } });
  useEffect(() => {
    const ds = ev.filter((e) => e.mon === 'USD' && e.fechaOc).map((e) => new Date(e.fechaOc).toISOString().slice(0, 10)).sort();
    if (!ds.length) return;
    const ini = new Date(new Date(ds[0]) - 7 * DAY).toISOString().slice(0, 10), fin = new Date().toISOString().slice(0, 10);
    const ks = Object.keys(fx).sort();
    if (ks.length && ks[0] <= ds[0] && ks[ks.length - 1] >= ds[ds.length - 1]) return;
    const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject()));
    get(`https://api.frankfurter.app/${ini}..${fin}?from=USD&to=MXN`).catch(() => get(`https://api.frankfurter.dev/v1/${ini}..${fin}?base=USD&symbols=MXN`))
      .then((j) => { const m = { ...fx }; Object.entries(j.rates || {}).forEach(([d, r]) => { if (r.MXN) m[d] = r.MXN; }); setFx(m); try { localStorage.setItem('gop_fx_usdmxn', JSON.stringify(m)); } catch { /* sin espacio */ } })
      .catch(() => {});
  }, [ev]);
  const tcDe = useMemo(() => {
    const ks = Object.keys(fx).sort(), memo = new Map();
    return (d) => {
      if (!d || !ks.length) return null;
      const k = new Date(d).toISOString().slice(0, 10);
      if (memo.has(k)) return memo.get(k);
      let lo = 0, hi = ks.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (ks[mid] <= k) { r = mid; lo = mid + 1; } else hi = mid - 1; }
      const v = fx[ks[Math.max(r, 0)]]; memo.set(k, v); return v;
    };
  }, [fx]);
  const zonaTraslados = useMemo(() => { try { const d = JSON.parse(localStorage.getItem('gop_traslados_exc') || 'null'); const m = {}; (d?.rawData || []).forEach((r) => { if (r.centro && r.zona) m[ctr(r.centro)] = norm(r.zona); }); return m; } catch { return {}; } }, []);
  const allUnits = useMemo(() => {
    const us = buildUnits(ev.filter((e) => !e.itbi), cfg.umbral, hoy);
    us.forEach((u) => { if (u.eventos[0]?.inv) Object.assign(u, { inv: true, atorado: false, lead: null, aTiempo: null, vencido: false }); if (!u.zona && u.centro) u.zona = zonaTraslados[u.centro] || ''; if (u.valor && u.eventos[0]?.mon === 'USD') { u.valorUSD = u.valor; u.tc = tcDe(u.inicio) || cfg.tc || 18.5; u.valor *= u.tc; } });
    // Sin zona: se agrupan por número de tienda en hasta 6 bloques para que el mapa no quede en un solo edificio
    const sinZ = [...new Set(us.filter((u) => !u.zona && u.centro).map((u) => u.centro))].sort();
    if (sinZ.length && !us.some((u) => u.zona)) { const k = Math.min(6, Math.ceil(sinZ.length / 8)), tam = Math.ceil(sinZ.length / k), blk = {}; sinZ.forEach((c, i) => { const b = Math.floor(i / tam); blk[c] = `T${sinZ[b * tam]}–${sinZ[Math.min(sinZ.length - 1, b * tam + tam - 1)]}`; }); us.forEach((u) => { if (!u.zona && u.centro) u.zona = blk[u.centro]; }); }
    // Entrega típica por zona = p90 de salida→entrada en lo ya recibido (mín. 1 d). DT_TIENDA es la entrada (GR), no la llegada:
    // lo que lleve en ruta más que lo típico ya llegó y está en tienda sin entrada (o se perdió en el camino)
    const tr = {}; us.forEach((u) => { if (u.etapa === 'RECIBIDO' && u.tramos.TRANSITO_TDA != null) (tr[u.zona] = tr[u.zona] || []).push(u.tramos.TRANSITO_TDA); });
    const p90 = (a) => { const x = [...a].sort((m, n) => m - n); return x[Math.floor((x.length - 1) * 0.9)]; };
    const todos = Object.values(tr).flat();
    const tip = (z) => Math.max(1, Math.ceil(tr[z]?.length >= 5 ? p90(tr[z]) : todos.length ? p90(todos) : (cfg.umbral.TRANSITO_TDA ?? 4)));
    us.entrega = {}; Object.keys(tr).forEach((z) => { const t0 = tip(z); const x = [...tr[z]].sort((m, n) => m - n); us.entrega[z] = { tip: t0, med: x[Math.floor((x.length - 1) / 2)] }; });
    // Pedido incompleto: la OC ya tiene entrega a CEDIS (FCH_ENTREGA_CDI) y en la GOA llegó menos de lo pedido (PZS_REC_CEDIS < PZS_PEDIDAS).
    // Las tiendas de esa OC × GOA que no salieron de CEDIS, cuando sus hermanas ya salieron hace más del umbral de cross dock,
    // son el faltante del proveedor: no son atorado ni traslado vencido. (PZS_RECIBIDAS_OC no se usa: a veces viene en 0 aunque sí se recibió.)
    const porGoa = new Map(); us.forEach((u) => { if (u.inv || !u.eventos[0]?.fEntCDI) return; const k = `${u.oc}|${u.goa}`; if (!porGoa.has(k)) porGoa.set(k, []); porGoa.get(k).push(u); });
    const sinSalir = (u) => ['PROVEEDOR', 'ALMACEN', 'CROSSDOCK'].includes(u.etapa);
    const xdU = cfg.umbral.CROSSDOCK ?? 3, incOC = {};
    porGoa.forEach((g) => {
      const e0 = g[0].eventos[0]; if (!(e0.recGoa > 0 && e0.recGoa < e0.pedGoa)) return;
      const ult = g.reduce((m, u) => (u.at.TRANSITO_TDA && (!m || u.at.TRANSITO_TDA > m) ? u.at.TRANSITO_TDA : m), null);
      const surtida = ult && dias(ult, hoy) > xdU; // las demás tiendas ya salieron
      // Primero las tiendas que no recibieron nada (no los saldos de salidas parciales), hasta cubrir lo que el proveedor no entregó
      const cand = g.filter((u) => sinSalir(u) && (surtida || u.trVencido)).sort((a, b) => !!a.eventos[0].saldo - !!b.eventos[0].saldo || b.enEtapa - a.enEtapa);
      let resto = e0.pedGoa - e0.recGoa; const falt = cand.filter((u) => { if (resto <= 0) return false; resto -= u.pzs; return true; }); if (!falt.length) return;
      const o = (incOC[g[0].oc] = incOC[g[0].oc] || { ped: 0, rec: 0, pv: 0, pvRec: 0 }); o.ped += e0.pedGoa; o.rec += e0.recGoa; o.pv += e0.pvGoa || 0; o.pvRec += e0.pvRecGoa || 0;
      falt.forEach((u) => Object.assign(u, { incompleto: true, atorado: false, trVencido: false, vencido: false }));
    });
    us.forEach((u) => { const o = incOC[u.oc]; if (!o) return; const e0 = u.eventos[0];
      u.ocInc = o.pv > 0 ? { fEnt: new Date(e0.fEntCDI), ped: o.ped, rec: o.rec, mPed: o.pv, mEnt: o.pvRec } : { fEnt: new Date(e0.fEntCDI), ped: o.ped, rec: o.rec, mPed: e0.mEntOC > 0 ? e0.mPedOC : 0, mEnt: e0.mEntOC }; }); // PV por OC × GOA (exacto); si no viene, montos de la OC
    us.forEach((u) => {
      if (u.etapa !== 'TRANSITO_TDA') return; const t0 = tip(u.zona); if (u.enEtapa <= t0) return;
      u.etapa = 'TIENDA'; u.estimado = true; u.enEtapa -= t0; u.desde = new Date(u.desde.getTime() + t0 * DAY); u.at = { ...u.at, TIENDA: u.desde }; u.atorado = u.enEtapa > (cfg.umbral.TIENDA ?? 2);
    });
    return us;
  }, [ev, cfg.umbral, cfg.tc, hoy, zonaTraslados, tcDe]);
  // Mes de recepción = mes de la fecha compromiso del proveedor (cuándo debe llegar a CEDIS)
  const mesDe = (u) => (u.fechaComp ? `${u.fechaComp.getFullYear()}-${String(u.fechaComp.getMonth() + 1).padStart(2, '0')}` : 'SIN');
  const opts = useMemo(() => { const u = (k) => [...new Set(allUnits.map((x) => x[k]).filter(Boolean))].sort(); return { prov: u('prov'), marca: u('marca'), zona: u('zona'), seccion: u('seccion'), goa: u('goa'), division: u('division'), mes: [...new Set(allUnits.map(mesDe))].sort() }; }, [allUnits]);
  const units = useMemo(() => {
    const qq = norm(q);
    return allUnits.filter((u) => inS(fProv, u.prov) && inS(fMarca, u.marca) && inS(fTipo, u.tipo) && inS(fZona, u.zona) && inS(fSec, u.seccion) && inS(fDiv, u.division) && inS(fGoa, u.goa) && inS(fMes, mesDe(u))
      && (fSolo === 'incompleto' ? u.incompleto : !u.incompleto) && (!fSolo || (fSolo === 'incompleto' ? true : fSolo === 'atorado' ? u.atorado : fSolo === 'vencido' ? u.vencido : fSolo === 'trvenc' ? u.trVencido : fSolo === 'activo' ? u.etapa !== 'RECIBIDO' : true))
      && (!qq || norm(`${u.oc} ${u.sku} ${u.modelo} ${u.centro} ${u.cont} ${u.traslado || ''}`).includes(qq)));
  }, [allUnits, fProv, fMarca, fTipo, fZona, fSec, fDiv, fGoa, fMes, fSolo, q]);

  // Resumen ejecutivo: Budget / Plan (CSV de plan) vs Pedido / Entregado (OCs) por Mes › Sección › Tipo › Marca › GOA
  const resumen = useMemo(() => {
    const LV = [...(rsPorMes ? ['mes'] : []), 'seccion', 'tipo', 'marca', 'goa']; const root = { kids: {} };
    // El plan no trae tipo: se toma el tipo que más pesa en las OCs de esa sección/marca/GOA (o de la marca)
    const cntT = {}; const addT = (k, tp, w) => { const o = (cntT[k] = cntT[k] || {}); o[tp] = (o[tp] || 0) + w; };
    allUnits.filter((u) => !u.inv).forEach((u) => { const sc = norm(u.seccion), mc = norm(u.marca); addT(`${sc}|${mc}|${norm(u.goa)}`, u.tipo, u.pzs); addT(`${sc}|${mc}`, u.tipo, u.pzs); addT(mc, u.tipo, u.pzs); });
    const top = (k) => { const o = cntT[k]; return o ? Object.entries(o).sort((a, b) => b[1] - a[1])[0][0] : null; };
    const tipoPlan = (x) => { const tp = top(`${x.seccion}|${x.marca}|${x.goa}`) || top(`${x.seccion}|${x.marca}`) || top(x.marca); return tp ? TIPOS[tp].l : 'Sin tipo'; };
    const add = (r, f) => { let n = root; const path = []; LV.forEach((k) => { const v = r[k] || '—'; path.push(v);
      if (!n.kids[v]) n.kids[v] = { id: path.join('›'), k, key: v, bud$: 0, budP: 0, plan$: 0, planP: 0, ped$: 0, pedP: 0, ent$: 0, entP: 0, lim: null, kids: {} }; n = n.kids[v]; f(n); }); };
    const nS = (st) => new Set([...st].map(norm));
    const pSec = nS(fSec), pMar = nS(fMarca), pDiv = nS(fDiv), pGoa = nS(fGoa);
    plan.filter((x) => inS(pSec, x.seccion) && inS(pMar, x.marca) && (!x.division || inS(pDiv, x.division)) && (!x.goa || inS(pGoa, x.goa)) && inS(fMes, x.mes))
      .forEach((x) => add({ ...x, tipo: tipoPlan(x) }, (n) => { n.bud$ += x.bud$; n.budP += x.budP; n.plan$ += x.plan$; n.planP += x.planP; }));
    units.filter((u) => !u.inv).forEach((u) => {
      const ent = !!(u.at.ALMACEN || u.at.CROSSDOCK || u.fin); const eP = ent ? (u.pzsRec || u.pzs) : 0; const e$ = u.pzs ? (u.valor || 0) * eP / u.pzs : 0;
      add({ mes: mesDe(u), seccion: norm(u.seccion), tipo: TIPOS[u.tipo].l, marca: norm(u.marca), goa: norm(u.goa) }, (n) => { n.ped$ += u.valor || 0; n.pedP += u.pzs; n.ent$ += e$; n.entP += eP; if (u.fechaComp && (!n.lim || u.fechaComp > n.lim)) n.lim = u.fechaComp; });
    });
    const fin = (n) => ({ ...n, kids: Object.values(n.kids).map(fin).sort((a, b) => (a.k === 'mes' ? a.key.localeCompare(b.key) : (b.plan$ + b.ped$) - (a.plan$ + a.ped$))) });
    const rows = Object.values(root.kids).map(fin).sort((a, b) => (a.k === 'mes' ? a.key.localeCompare(b.key) : (b.plan$ + b.ped$) - (a.plan$ + a.ped$)));
    const tot = rows.reduce((a, n) => { ['bud$', 'budP', 'plan$', 'planP', 'ped$', 'pedP', 'ent$', 'entP'].forEach((k) => { a[k] += n[k]; }); return a; }, { bud$: 0, budP: 0, plan$: 0, planP: 0, ped$: 0, pedP: 0, ent$: 0, entP: 0 });
    tot.lim = rows.reduce((m, n) => (n.lim && (!m || n.lim > m) ? n.lim : m), null);
    return { rows, tot, depth: LV.length };
  }, [plan, units, allUnits, rsPorMes, fSec, fMarca, fDiv, fGoa, fMes]);

  // Validador: OCs abiertas con fechas sospechosas (para revisar en SAP / pedir cierre o reprogramación)
  const VAL_REGLAS = {
    VENTANA: { l: 'Compromiso muy lejos de la OC', d: 'Más de 120 días entre la fecha de la OC y su compromiso: revisar si el compromiso es la fecha fin real' },
    VIEJA: { l: 'Abierta hace más de 150 días', d: 'La OC tiene más de 150 días y aún tiene piezas sin llegar a CEDIS' },
    VENCIDA: { l: 'Vencida sin recibir', d: 'Nada ha llegado a CEDIS y el compromiso venció hace más de 30 días: candidata a cancelar' },
    SALDO: { l: 'Saldo abierto tras recibir', d: 'Ya llegó parte a CEDIS pero queda saldo con compromiso vencido hace más de 30 días: candidata a cerrar' },
    FECHA: { l: 'Compromiso faltante o inválido', d: 'Sin fecha compromiso, o el compromiso es anterior a la fecha de la OC' },
  };
  const validador = useMemo(() => {
    const m = new Map();
    units.filter((u) => !u.inv).forEach((u) => {
      if (!m.has(u.oc)) m.set(u.oc, { oc: u.oc, prov: u.prov, seccion: u.seccion, marca: u.marca, tipo: u.tipo, ini: null, comp: null, us: [] });
      const o = m.get(u.oc); o.us.push(u);
      if (u.inicio && (!o.ini || u.inicio < o.ini)) o.ini = u.inicio;
      if (u.fechaComp && (!o.comp || u.fechaComp > o.comp)) o.comp = u.fechaComp;
    });
    const out = [];
    m.forEach((o) => {
      const lleg = (u) => !!(u.at.ALMACEN || u.at.CROSSDOCK || u.fin);
      const pend = o.us.filter((u) => !lleg(u)); if (!pend.length) return; // solo OCs con algo por llegar
      const pzsP = pend.reduce((a, u) => a + u.pzs, 0), valP = pend.reduce((a, u) => a + (u.valor || 0), 0);
      const dAb = o.ini ? dias(o.ini, hoy) : null, dVen = o.comp ? dias(o.comp, hoy) : null, vent = o.ini && o.comp ? dias(o.ini, o.comp) : null;
      const r = [];
      if (vent != null && vent > 120) r.push('VENTANA');
      if (dAb != null && dAb > 150) r.push('VIEJA');
      if (pend.length === o.us.length && dVen != null && dVen > 30) r.push('VENCIDA');
      if (pend.length < o.us.length && dVen != null && dVen > 30) r.push('SALDO');
      if (!o.comp || (o.ini && o.comp < o.ini)) r.push('FECHA');
      if (r.length) out.push({ ...o, r, pzsP, valP, dAb, dVen, vent, tiendas: o.us.length, pendT: pend.length });
    });
    return out.sort((a, b) => b.valP - a.valP);
  }, [units, hoy]);

  const zonas = useMemo(() => [...new Set([...ZONAS_SBB, ...allUnits.map((u) => u.zona).filter(Boolean).sort()])].slice(0, 14), [allUnits]);
  const zonaDe = (u) => (zonas.includes(u.zona) ? u.zona : zonas[zonas.length - 1]);
  const ciudades = useMemo(() => { const c = [...new Set(allUnits.map((u) => u.ciudad).filter(Boolean))].sort(); return c.length ? c.slice(0, 4) : ['REGIONAL']; }, [allUnits]);
  const ciudadDe = (u) => (ciudades.includes(u.ciudad) ? u.ciudad : ciudades[0]);

  // Agregados por llave de nodo
  const agg = useMemo(() => {
    const m = {};
    const add = (k, u) => { const o = (m[k] = m[k] || { n: 0, pzs: 0, ator: 0, maxDias: 0, oc: new Set() }); o.n++; if (u.inv) o.inv = (o.inv || 0) + u.pzs; else o.oc.add(u.oc); o.ocs = o.oc.size; o.pzs += Math.max(0, u.pzs - u.pzsRec); if (u.atorado) { o.ator++; o.pzsAtor = (o.pzsAtor || 0) + u.pzs; } o.maxDias = Math.max(o.maxDias, u.enEtapa || 0); o.sumDias = (o.sumDias || 0) + (u.enEtapa || 0); };
    units.forEach((u) => {
      add(u.etapa, u);
      if (u.etapa !== 'RECIBIDO') add(`B:${bucketOf(u)}`, u);
      if (['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].includes(u.etapa)) { add(`${u.etapa}|${zonaDe(u)}`, u); add(`${u.etapa}|${zonaDe(u)}|${u.tipo === 'DIR' ? 'DIR' : 'PLAN'}`, u); }
      if (u.etapa === 'BODEGA_REG') add(`BODEGA_REG|${ciudadDe(u)}`, u);
      if (u.etapa === 'PROVEEDOR') add(`PROVEEDOR|${u.tipo}`, u);
    });
    // faltante de OCs incompletas (para el letrero del cross dock en 3D)
    if (fSolo !== 'incompleto') allUnits.filter((u) => u.incompleto && inS(fProv, u.prov) && inS(fMarca, u.marca) && inS(fTipo, u.tipo) && inS(fSec, u.seccion) && inS(fDiv, u.division) && inS(fGoa, u.goa)).forEach((u) => add('INC', u));
    return m;
  }, [units, zonas, ciudades, allUnits, fSolo, fProv, fMarca, fTipo, fSec, fDiv, fGoa]);
  const cnt = (k) => agg[k] || { n: 0, pzs: 0, ator: 0, maxDias: 0, ocs: 0 };

  const tramoProm = useMemo(() => {
    const acc = {};
    allUnits.forEach((u) => Object.entries(u.tramos).forEach(([k, v]) => { (acc[k] = acc[k] || []).push(v); }));
    const out = {};
    Object.entries(acc).forEach(([k, a]) => { const s = [...a].sort((x, y) => x - y); out[k] = { prom: a.reduce((x, y) => x + y, 0) / a.length, p90: s[Math.floor(0.9 * (s.length - 1))], n: a.length }; });
    return out;
  }, [allUnits]);
  const porProv = useMemo(() => {
    const m = {};
    units.forEach((u) => {
      const o = (m[u.prov] = m[u.prov] || { prov: u.prov, tipo: u.tipo, n: 0, ator: 0, pzsTr: 0, leads: [], tram: {}, aT: 0, aTn: 0 });
      o.n++; if (u.etapa !== 'RECIBIDO') o.pzsTr += u.pzs - u.pzsRec; if (u.atorado) o.ator++;
      if (u.lead != null) o.leads.push(u.lead); if (u.aTiempo != null) { o.aTn++; if (u.aTiempo) o.aT++; }
      Object.entries(u.tramos).forEach(([k, v]) => { (o.tram[k] = o.tram[k] || []).push(v); });
    });
    return Object.values(m).sort((a, b) => b.pzsTr - a.pzsTr);
  }, [units]);
  // Tránsito a tiendas como lo reportan SAP y el OTB (IT_Unidades); si el CSV no lo trae se usa el calculado por movimientos
  const itBI = useMemo(() => { const xs = ev.filter((e) => e.itbi && inS(fProv, e.prov) && inS(fMarca, e.marca) && inS(fZona, e.zona) && inS(fSec, e.seccion) && inS(fDiv, e.division || '') && inS(fGoa, e.goa || '')); return ev.some((e) => e.itbi) ? { pzs: xs.reduce((a, e) => a + e.pzsPed, 0), val: xs.reduce((a, e) => a + e.valor, 0) } : null; }, [ev, fProv, fMarca, fZona, fSec, fDiv, fGoa]);
  const kpi = useMemo(() => {
    const rec = units.filter((u) => u.lead != null);
    const conComp = units.filter((u) => u.aTiempo != null);
    return {
      ator: units.filter((u) => u.atorado).length, pzsAtor: units.filter((u) => u.atorado).reduce((a, u) => a + u.pzs, 0), valAtor: units.filter((u) => u.atorado).reduce((a, u) => a + (u.valor || 0), 0),
      lead: rec.length ? rec.reduce((a, u) => a + u.lead, 0) / rec.length : null,
      onTime: conComp.length ? conComp.filter((u) => u.aTiempo).length / conComp.length : null,
      trv: units.filter((u) => u.trVencido).length, pzsTrv: units.filter((u) => u.trVencido).reduce((a, u) => a + u.pzs, 0),
      vencidos: units.filter((u) => u.vencido).length, ocs: new Set(units.filter((u) => u.etapa !== 'RECIBIDO').map((u) => u.oc)).size,
      // lead de lo recibido en los últimos 7 días vs los 7 anteriores
      lead7: (() => { const a = rec.filter((u) => dias(u.fin, hoy) <= 7); return a.length ? a.reduce((x, u) => x + u.lead, 0) / a.length : null; })(),
      leadPrev: (() => { const a = rec.filter((u) => { const d = dias(u.fin, hoy); return d > 7 && d <= 14; }); return a.length ? a.reduce((x, u) => x + u.lead, 0) / a.length : null; })(),
      pzsTransito: units.filter((u) => u.etapa === 'TRANSITO_TDA').reduce((a, u) => a + u.pzs, 0), valTransito: units.filter((u) => u.etapa === 'TRANSITO_TDA').reduce((a, u) => a + (u.valor || 0), 0),
      // fecha esperada entre hoy y hoy+7 (por día calendario) y aún sin llegar a CEDIS / destino
      vencen7: (() => { const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()), h7 = new Date(h0.getTime() + 8 * DAY); return new Set(units.filter((u) => u.fechaComp && u.fechaComp >= h0 && u.fechaComp < h7 && !(u.at.ALMACEN || u.at.CROSSDOCK || u.fin)).map((u) => u.oc)).size; })(),
      inc: (() => { const xs = allUnits.filter((u) => u.incompleto && inS(fProv, u.prov) && inS(fMarca, u.marca) && inS(fTipo, u.tipo) && inS(fSec, u.seccion) && inS(fDiv, u.division) && inS(fGoa, u.goa)); const ocs = new Map(); xs.forEach((u) => ocs.set(u.oc, u.ocInc)); return { n: xs.length, pzs: xs.reduce((a, u) => a + u.pzs, 0), ocs: ocs.size, falt$: [...ocs.values()].reduce((a, o) => a + Math.max(0, (o.mPed || 0) - (o.mEnt || 0)), 0) }; })(),
      compFuturo: units.some((u) => u.fechaComp && u.fechaComp >= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())),
    };
  }, [units, allUnits, fProv, fMarca, fTipo, fSec, fDiv, fGoa]);
  const leadTipo = useMemo(() => Object.keys(TIPOS).map((tp) => {
    const us = allUnits.filter((u) => u.tipo === tp);
    const tr = {}; us.forEach((u) => Object.entries(u.tramos).forEach(([k, v]) => { (tr[k] = tr[k] || []).push(v); }));
    const seg = BASE_ROUTE[tp].slice(0, -1).flatMap((k) => (k === 'CROSSDOCK' ? ['ALMACEN', 'CROSSDOCK'] : [k])).filter((k) => tr[k]).map((k) => ({ k, v: tr[k].reduce((a, b) => a + b, 0) / tr[k].length }));
    return { tp, seg, total: seg.reduce((a, s) => a + s.v, 0), n: us.length };
  }), [allUnits]);
  // Inventario en CEDIS (filas INV del extracto): OC = 'ASG|INV 880S 61-90 PROVEEDOR' → con/sin traslado, centro y rango de días desde su entrada
  const INV_B = ['00-15', '16-30', '31-60', '61-90', '90+', 'SIN'];
  const invCedis = useMemo(() => {
    const us = units.filter((u) => u.inv && u.etapa !== 'TRANSITO_INT'); if (!us.length) return null;
    const rows = {}, viejo = {};
    us.forEach((u) => {
      const [pre, cen, b] = u.oc.split(' '), con = pre === 'ASG', k = `${cen}|${con ? 1 : 0}`;
      const o = (rows[k] = rows[k] || { cen, con, b: {}, tot: 0 }); o.b[b] = (o.b[b] || 0) + u.pzs; o.tot += u.pzs;
      if (!con && b === '90+') { const kv = `${u.prov}|${u.goa}|${cen}`; viejo[kv] = (viejo[kv] || 0) + u.pzs; }
    });
    return { rows: Object.values(rows).sort((a, b) => a.cen.localeCompare(b.cen) || b.con - a.con), viejo: Object.entries(viejo).sort((a, b) => b[1] - a[1]).slice(0, 8) };
  }, [units]);
  const aging = useMemo(() => {
    const B = [[0, 3], [3, 7], [7, 15], [15, 30], [30, 1e9]];
    return STAGES.filter((s) => s.k !== 'RECIBIDO').map((s) => {
      const us = units.filter((u) => u.etapa === s.k);
      return { s, cells: B.map(([a, b]) => us.filter((u) => u.enEtapa >= a && u.enEtapa < b).reduce((x, u) => x + u.pzs, 0)), tot: us.reduce((x, u) => x + u.pzs, 0) };
    }).filter((r) => r.tot > 0);
  }, [units]);
  const feed = useMemo(() => units.map((u) => ({ u, e: u.eventos[u.eventos.length - 1] })).sort((a, b) => b.e.fecha - a.e.fecha).slice(0, 10), [units]);

  const nodeUnits = useMemo(() => {
    if (!sel) return [];
    return units.filter((u) => sel.stages.includes(u.etapa) && (!sel.zona || zonaDe(u) === sel.zona) && (!sel.ciudad || ciudadDe(u) === sel.ciudad) && (!sel.tipo || [].concat(sel.tipo).includes(u.tipo)) && (!selTienda || u.centro === selTienda))
      .sort((a, b) => b.atorado - a.atorado || b.enEtapa - a.enEtapa);
  }, [units, sel, selTienda, zonas, ciudades]);
  const tiendasZona = useMemo(() => {
    if (!sel?.zona) return [];
    const m = {};
    allUnits.filter((u) => zonaDe(u) === sel.zona && u.centro && ['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].includes(u.etapa)).forEach((u) => { const o = (m[u.centro] = m[u.centro] || { c: u.centro, ruta: 0, sin: 0, rec: 0, ator: 0, pzs: 0 }); if (u.etapa === 'TRANSITO_TDA') o.ruta++; if (u.etapa === 'TIENDA') { o.sin++; o.pzs += u.pzs; } if (u.etapa === 'RECIBIDO') o.rec++; if (u.atorado) o.ator++; });
    // peor estado primero: atorado → sin entrada → en ruta → recibido
    const rk = (o) => (o.ator ? 0 : o.sin ? 1 : o.ruta ? 2 : 3);
    return Object.values(m).sort((a, b) => rk(a) - rk(b) || a.c.localeCompare(b.c));
  }, [allUnits, sel, zonas]);

  const camTo = (k) => setSite(k);
  const abrir = (s) => { setSel(s); setSelUnit(null); setSelOC(''); setSelTienda(''); const k = siteOfKey(s?.key); if (k) setSite(k); };
  // Clic en la escena 3D → selección
  const onPick = (k) => {
    if (k === 'PROV') return abrir({ key: k, stages: ['PROVEEDOR'], tipo: ['NAC', 'DIR'], titulo: 'Proveedores nacionales · On order' });
    if (k === 'PIMP') return abrir({ key: k, stages: ['PROVEEDOR'], tipo: 'IMP', titulo: 'Proveedores importación · On order' });
    if (k === 'ADU') return abrir({ key: k, stages: ['ADUANA'], titulo: 'Aduana · Puerto' });
    if (k === 'MAR') return abrir({ key: k, stages: ['TRANSITO_INT', 'ADUANA'], titulo: 'Importación (tránsito y aduana)' });
    if (k === 'ALM') return abrir({ key: k, stages: ['ALMACEN'], titulo: 'PLAN · Almacén' });
    if (k === 'XD') return abrir(BUCKET_SEL.INP);
    if (k === 'FORO') return abrir(BUCKET_SEL.FORO);
    if (k === 'FUL') return abrir(BUCKET_SEL.FUL);
    if (k.startsWith('CIU|')) { const c = k.slice(4); return abrir({ key: k, stages: ['BODEGA_REG'], ciudad: c, titulo: c === 'REGIONAL' ? 'Bodegas regionales' : `Bodega ${c}` }); }
    if (k.startsWith('Z|') || k.startsWith('ZR|')) { const z = k.split('|')[1]; return abrir({ key: `Z|${z}`, stages: [k.startsWith('ZR|') ? 'TRANSITO_TDA' : 'TIENDA'], zona: z, titulo: z === 'TIENDAS' ? 'Tiendas' : `Zona ${z}` }); }
    return null;
  };
  const abrirUnidad = (u) => { abrir({ key: '', stages: [u.etapa], titulo: SL[u.etapa], zona: ['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].includes(u.etapa) ? zonaDe(u) : undefined, ciudad: u.etapa === 'BODEGA_REG' ? ciudadDe(u) : undefined }); setSelUnit(u.key); };
  const exportar = () => {
    const H = ['OC', 'SKU', 'MODELO', 'PROVEEDOR', 'MARCA', 'TIPO', 'CENTRO', 'ZONA', 'PIEZAS', 'BUCKET', 'ETAPA_ACTUAL', 'ULTIMO_REGISTRO', 'UBICACION', 'DIAS_EN_ETAPA', 'ATORADO', 'FECHA_COMPROMISO', 'VENCIDO', 'TRASLADO', 'ENTREGA_PLAN', ...STAGES.map((s) => `DIAS_${s.k}`)];
    const L = [H.join(',')];
    units.forEach((u) => L.push([u.oc, u.sku, u.modelo, u.prov, u.marca, TIPOS[u.tipo].l, u.centro, u.zona, u.pzs, BUCKETS.find((b) => b.k === bucketOf(u))?.l || 'Recibido', SL[u.etapa], u.desde.toISOString().slice(0, 10), u.ubic, (u.enEtapa || 0).toFixed(1), u.atorado ? 'SI' : '', u.fechaComp ? u.fechaComp.toISOString().slice(0, 10) : '', u.vencido ? 'SI' : '', u.traslado || '', ((x) => (x ? new Date(x).toISOString().slice(0, 10) : ''))(u.fechaEntPlan), ...STAGES.map((s) => (u.tramos[s.k] != null ? u.tramos[s.k].toFixed(1) : ''))].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Pedidos_rastreo.csv'; a.click();
  };

  const inCls = `px-2 py-1.5 rounded-lg border text-xs ${isDark ? 'bg-[#1a1520] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const selStyle = isDark ? { colorScheme: 'dark' } : undefined;
  const selKey = sel?.key || '';
  const glass = isDark ? 'bg-[#1a1520]/95 border-white/10' : 'bg-white/95 border-gray-200';
  const unit = selUnit ? allUnits.find((u) => u.key === selUnit) : null;
  const ocUs = selOC && !unit ? allUnits.filter((u) => u.oc === selOC && !u.inv) : [];
  const pill = (on) => (on ? (isDark ? 'bg-violet-600 border-violet-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : t.cardInner);
  const totPipe = BUCKETS.reduce((a, b) => a + cnt(`B:${b.k}`).pzs, 0) || 1;

  // Frescura de la base: último registro que trae vs hoy
  const baseAl = useMemo(() => ev.reduce((m, e) => (e.fecha && new Date(e.fecha) > m ? new Date(e.fecha) : m), null), [ev]);
  const baseDias = baseAl ? Math.round((new Date(hoy).setHours(0, 0, 0, 0) - new Date(baseAl).setHours(0, 0, 0, 0)) / DAY) : null;
  const nFil = [q, fSolo].filter(Boolean).length + [fSec, fDiv, fGoa, fProv, fMarca, fZona, fMes, fTipo].filter((x) => x.size).length;
  const mesLbl = (m) => (m === 'SIN' ? 'Sin compromiso' : m === '—' ? '—' : new Date(`${m}-15`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
  const Validador = () => {
    const rows = validador.filter((o) => !vRegla || o.r.includes(vRegla));
    const exp = () => {
      const H = ['OC', 'PROVEEDOR', 'SECCION', 'MARCA', 'TIPO', 'FECHA_OC', 'COMPROMISO', 'DIAS_ABIERTA', 'DIAS_OC_A_COMPROMISO', 'DIAS_VENCIDA', 'TIENDAS', 'TIENDAS_PENDIENTES', 'PZS_PENDIENTES', 'COSTO_PENDIENTE', 'HALLAZGOS'];
      const L = [H.join(',')]; rows.forEach((o) => L.push([o.oc, o.prov, o.seccion, o.marca, TIPOS[o.tipo].l, o.ini ? o.ini.toISOString().slice(0, 10) : '', o.comp ? o.comp.toISOString().slice(0, 10) : '', o.dAb?.toFixed(0) ?? '', o.vent?.toFixed(0) ?? '', o.dVen != null && o.dVen > 0 ? o.dVen.toFixed(0) : '', o.tiendas, o.pendT, o.pzsP, Math.round(o.valP), o.r.map((k) => VAL_REGLAS[k].l).join(' | ')].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Pedidos_validador_OCs.csv'; a.click();
    };
    return (
      <div className={`rounded-2xl border p-4 ${t.card}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className={`text-sm font-black flex items-center gap-2 ${t.text}`}><ShieldAlert size={16} className="text-amber-500" /> Validador de OCs abiertas</div>
            <div className={`text-[11px] ${t.textMuted}`}>OCs con piezas aún sin llegar a CEDIS y fechas que no cuadran. Respeta los filtros. {fmt(rows.length)} OCs · {fk(rows.reduce((a, o) => a + o.pzsP, 0))} pzs · ${fk(rows.reduce((a, o) => a + o.valP, 0))} pendientes.</div>
          </div>
          <button onClick={exp} className={`text-[11px] px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 ${t.cardInner}`}><Download size={12} /> CSV</button>
        </div>
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => setVRegla('')} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pill(!vRegla)}`}>Todas · {validador.length}</button>
          {Object.entries(VAL_REGLAS).map(([k, v]) => <button key={k} title={v.d} onClick={() => setVRegla(vRegla === k ? '' : k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pill(vRegla === k)}`}>{v.l} · {validador.filter((o) => o.r.includes(k)).length}</button>)}
        </div>
        {vRegla && <p className={`text-[11px] mb-2 ${t.textMuted}`}>{VAL_REGLAS[vRegla].d}.</p>}
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-xs min-w-max">
            <thead><tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 z-10 ${isDark ? 'bg-[#1a1520] text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
              {['OC', 'Proveedor', 'Sección · Marca', 'Fecha OC', 'Compromiso', 'Días abierta', 'OC → compromiso', 'Vencida', 'Tiendas pend.', 'Pzs pend.', '$ pend.', 'Hallazgos'].map((h, i) => <th key={h} className={`p-2 whitespace-nowrap ${i >= 5 && i <= 10 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
              {rows.slice(0, 500).map((o) => (
                <tr key={o.oc} className={isDark ? 'hover:bg-violet-500/10' : 'hover:bg-violet-50'}>
                  <td className={`p-2 font-black whitespace-nowrap ${t.text}`}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: TIPOS[o.tipo].c }} />{o.oc}</td>
                  <td className={`p-2 max-w-[220px] truncate ${t.text}`} title={o.prov}>{o.prov}</td>
                  <td className={`p-2 whitespace-nowrap ${t.textMuted}`}>{o.seccion} · {o.marca}</td>
                  <td className={`p-2 whitespace-nowrap ${t.text}`}>{o.ini ? o.ini.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                  <td className={`p-2 whitespace-nowrap ${t.text}`}>{o.comp ? o.comp.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                  <td className={`p-2 text-right font-mono ${o.r.includes('VIEJA') ? 'text-rose-500 font-bold' : t.text}`}>{o.dAb != null ? o.dAb.toFixed(0) : '—'}</td>
                  <td className={`p-2 text-right font-mono ${o.r.includes('VENTANA') ? 'text-amber-500 font-bold' : t.text}`}>{o.vent != null ? `${o.vent.toFixed(0)} d` : '—'}</td>
                  <td className={`p-2 text-right font-mono ${o.dVen > 0 ? 'text-rose-500' : t.textMuted}`}>{o.dVen != null && o.dVen > 0 ? `${o.dVen.toFixed(0)} d` : '—'}</td>
                  <td className={`p-2 text-right font-mono ${t.text}`}>{o.pendT}/{o.tiendas}</td>
                  <td className={`p-2 text-right font-mono ${t.text}`}>{fmt(o.pzsP)}</td>
                  <td className={`p-2 text-right font-mono ${t.text}`}>${fk(o.valP)}</td>
                  <td className="p-2"><div className="flex gap-1 flex-wrap">{o.r.map((k) => <span key={k} title={VAL_REGLAS[k].d} className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${k === 'VENCIDA' || k === 'VIEJA' ? 'bg-rose-500/15 text-rose-500' : 'bg-amber-500/15 text-amber-500'}`}>{VAL_REGLAS[k].l}</span>)}</div></td>
                </tr>))}
              {!rows.length && <tr><td colSpan={12} className={`p-6 text-center ${t.textMuted}`}>Sin hallazgos con los filtros actuales.</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > 500 && <p className={`text-[10px] mt-2 ${t.textMuted}`}>Mostrando 500 de {fmt(rows.length)}; el CSV trae todas.</p>}
      </div>);
  };
  const ResumenCompra = () => {
    const P = rsMed === '$'; const g = (n, k) => n[k + (P ? '$' : 'P')]; const fv = (v) => (P ? `$${fk(v)}` : fk(v));
    const pct = (a, b) => (b > 0 ? a / b * 100 : null);
    const pC = (v) => (v == null ? t.textMuted : v >= 95 ? 'text-emerald-500' : v >= 80 ? 'text-amber-500' : 'text-rose-500');
    const tog = (id) => setRsOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const cells = (n) => { const bud = g(n, 'bud'), pl = g(n, 'plan'), pe = g(n, 'ped'), en = g(n, 'ent'); const a = pct(pe, pl), b = pct(en, pe);
      return <>
        <td className={`p-2 text-right whitespace-nowrap ${n.lim && n.lim < hoy && pe - en > 0 ? 'text-rose-500 font-bold' : t.textMuted}`} title="Fecha límite de entrega: la fecha compromiso más tardía de sus OCs">{n.lim ? fdate(n.lim) : '—'}</td>
        <td className={`p-2 text-right font-mono ${t.textMuted}`}>{bud ? fv(bud) : '—'}</td>
        <td className={`p-2 text-right font-mono ${t.text}`}>{pl ? fv(pl) : '—'}</td>
        <td className="p-2 text-right font-mono text-violet-500 font-bold">{pe ? fv(pe) : '—'}</td>
        <td className="p-2 text-right font-mono text-emerald-500">{en ? fv(en) : '—'}</td>
        <td className={`p-2 text-right font-bold ${pC(a)}`}>{a != null ? `${a.toFixed(0)}%` : '—'}</td>
        <td className={`p-2 text-right font-bold ${pC(b)}`}>{b != null ? `${b.toFixed(0)}%` : '—'}</td>
        <td className={`p-2 text-right font-mono ${t.textMuted}`}>{pe - en > 0 ? fv(pe - en) : '—'}</td>
        <td className={`p-2 text-right font-mono ${pl - pe > 0 ? 'text-amber-500' : t.textMuted}`}>{pl ? fv(pl - pe) : '—'}</td>
      </>; };
    const Row = ({ n, d }) => { const open = rsOpen.has(n.id), hasK = n.kids.length > 0;
      return <>
        <tr onClick={hasK ? () => tog(n.id) : undefined} className={`${hasK ? 'cursor-pointer' : ''} ${d === 0 ? (isDark ? 'bg-white/5 font-black' : 'bg-gray-50 font-black') : ''} ${isDark ? 'hover:bg-violet-500/10' : 'hover:bg-violet-50'}`}>
          <td className={`p-2 whitespace-nowrap ${t.text}`} style={{ paddingLeft: 8 + d * 18 }}><span className={`inline-block w-4 ${t.textMuted}`}>{hasK ? (open ? '▾' : '▸') : ''}</span><span className={d === resumen.depth - 1 ? 'font-medium' : 'font-bold'}>{n.k === 'mes' ? mesLbl(n.key) : n.key}</span></td>
          {cells(n)}
        </tr>
        {open && n.kids.map((k) => <Row key={k.id} n={k} d={d + 1} />)}
      </>; };
    const all = []; const walk = (ns) => ns.forEach((n) => { if (n.kids.length) { all.push(n.id); walk(n.kids); } }); walk(resumen.rows);
    const btn = `text-[10px] px-2.5 py-1.5 rounded-lg border font-black ${t.cardInner}`;
    const T = resumen.tot;
    return (
      <div className={`rounded-2xl border p-4 ${t.card}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[['Pensado comprar', g(T, 'bud'), t.textMuted], ['Planeado', g(T, 'plan'), t.text], ['Pedido', g(T, 'ped'), 'text-violet-500'], ['Entregado', g(T, 'ent'), 'text-emerald-500']].map(([l, v, c]) => (
            <div key={l} className={`rounded-xl border p-3 text-center ${t.cardInner}`}><div className={`text-[11px] font-black uppercase tracking-widest ${t.textMuted}`}>{l}</div><div className={`text-2xl font-black ${c}`}>{v ? fv(v) : '—'}</div></div>))}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex gap-2 flex-wrap items-center">
            {['$', 'Pzs'].map((m) => <button key={m} onClick={() => setRsMed(m === '$' ? '$' : 'P')} className={`${btn} ${(m === '$') === P ? pill(true) : ''}`}>{m}</button>)}
            <label className={`${btn} flex items-center gap-1.5 cursor-pointer`}><input type="checkbox" checked={rsPorMes} onChange={(e) => { setRsPorMes(e.target.checked); setRsOpen(new Set()); }} className="accent-violet-500" /> Abrir por mes</label>
            <MultiSel label="Mes" options={[...new Set([...opts.mes, ...plan.map((x) => x.mes)])].sort()} sel={fMes} onChange={setFMes} t={t} isDark={isDark} inCls={inCls} fmtOpt={mesLbl} />
            <button onClick={() => setRsOpen(new Set(all))} className={btn}>Expandir todo</button>
            <button onClick={() => setRsOpen(new Set())} className={btn}>Colapsar</button>
          </div>
          <div className="flex gap-2 items-center">
            <input ref={planRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const x = parsePlanCompra(decode(rd.result)); setPlan(x); setAviso(x.length ? '' : 'El CSV de plan no trae columnas BUDGET/OTB o PLAN con valores.'); }; rd.readAsArrayBuffer(f); e.target.value = ''; }} />
            <button onClick={() => planRef.current?.click()} className={`${btn} flex items-center gap-1.5`}><Upload size={12} /> CSV Plan de compra</button>
            {plan.length > 0 && <button onClick={() => setPlan([])} className={`${btn} opacity-60 hover:opacity-100`} title="Quitar plan"><Trash2 size={12} /></button>}
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs min-w-max">
            <thead><tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 z-10 ${isDark ? 'bg-[#1a1520] text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
              {[`${rsPorMes ? 'Mes › ' : ''}Sección › Tipo › Marca › GOA`, 'Fecha límite', 'Pensado', 'Planeado', 'Pedido', 'Entregado', '% Ped/Plan', '% Ent/Ped', 'Por entregar', 'Por pedir'].map((h, i) => <th key={h} className={`p-2 whitespace-nowrap ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>{resumen.rows.map((n) => <Row key={n.id} n={n} d={0} />)}</tbody>
            <tfoot><tr className={`font-black sticky bottom-0 border-t-2 ${isDark ? 'bg-[#1a1520] border-violet-500/50' : 'bg-violet-50 border-violet-300'}`}><td className={`p-2 ${t.text}`}>TOTAL</td>{cells(T)}</tr></tfoot>
          </table>
        </div>
        <p className={`text-[10px] mt-2 ${t.textMuted}`}>Pedido y entregado salen de las OCs cargadas (mes = fecha compromiso; entregado = ya llegó a CEDIS/destino; $ importación convertido a MXN). Pensado y planeado salen del CSV de plan: MES, SECCION, MARCA, GOA, BUDGET (u OTB) y PLAN — en $ y/o con sufijo _PZS; el tipo del plan se toma de las OCs de esa marca/GOA. Fecha límite = compromiso más tardío de las OCs (en rojo si ya pasó y falta entregar). Respeta filtros de división, sección, marca y mes.</p>
      </div>);
  };

  // Buscar una OC o un traslado y abrir su tracking (sin importar filtros)
  const [busca, setBusca] = useState('');
  const buscar = () => {
    const x = busca.trim(); if (!x) return;
    const tr = allUnits.find((u) => u.traslado === x), oc = tr ? null : allUnits.find((u) => u.oc === x && !u.inv);
    if (!tr && !oc) { setAviso(`No encontré la OC o traslado ${x} en la base cargada.`); return; }
    setAviso(''); setPTab('rastreo');
    if (tr) { setSelOC(''); setSelUnit(tr.key); } else { setSelUnit(null); setSelOC(oc.oc); }
  };
  const headerRight = (
    <>
      {ev.length > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); buscar(); }} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${t.cardInner}`} title="Busca una OC o un número de traslado y abre su tracking">
          <Search size={14} className={t.textMuted} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OC o traslado" className={`w-40 bg-transparent outline-none text-xs ${t.text}`} />
        </form>
      )}
      {ev.length > 0 && (
        <FilterMenu isDark={isDark} count={nFil} width={860}>
          <FilterSection label="Buscar y filtrar" isDark={isDark}>
            <div className="relative"><Search size={13} className={`absolute left-2 top-2 ${t.textMuted}`} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OC, SKU, centro, contenedor…" className={`${inCls} pl-7 w-56`} /></div>
            {[['División', fDiv, setFDiv, opts.division], ['Sección', fSec, setFSec, opts.seccion], ['GOA', fGoa, setFGoa, opts.goa], ['Proveedor', fProv, setFProv, opts.prov], ['Marca', fMarca, setFMarca, opts.marca], ['Zona', fZona, setFZona, opts.zona]].map(([l, v, s, o]) => (
              <MultiSel key={l} label={l} options={o} sel={v} onChange={s} t={t} isDark={isDark} inCls={inCls} />
            ))}
            <MultiSel label="Mes de recepción" options={opts.mes} sel={fMes} onChange={setFMes} t={t} isDark={isDark} inCls={inCls} fmtOpt={(m) => (m === 'SIN' ? 'Sin compromiso' : new Date(`${m}-15`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))} />
          </FilterSection>
          <FilterSection label="Ruta" isDark={isDark}>
            <button onClick={() => setFTipo(new Set())} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pill(!fTipo.size)}`}>Todas las rutas</button>
            {Object.entries(TIPOS).map(([k, v]) => <button key={k} onClick={() => setFTipo((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 ${pill(fTipo.has(k))}`}><span className="w-2 h-2 rounded-full" style={{ background: v.c }} />{v.l}</button>)}
          </FilterSection>
          <FilterSection label="Estado" isDark={isDark}>
            {[['', 'Todos'], ['activo', 'En camino'], ['atorado', 'Atorados'], ['vencido', 'Vencidos'], ['incompleto', 'Incompletos']].map(([k, l]) => <button key={k} onClick={() => setFSolo(k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pill(fSolo === k)}`}>{l}</button>)}
            {nFil > 0 && <button onClick={() => { setQ(''); setFSec(new Set()); setFDiv(new Set()); setFGoa(new Set()); setFProv(new Set()); setFMarca(new Set()); setFZona(new Set()); setFMes(new Set()); setFTipo(new Set()); setFSolo(''); }} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${t.cardInner}`}>✕ Limpiar</button>}
            <button onClick={() => setShowCfg((v) => !v)} className={`ml-auto px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${showCfg ? pill(true) : t.cardInner}`}><Settings size={12} /> Días para atorado</button>
          </FilterSection>
          {showCfg && (
            <div className={`flex flex-wrap gap-3 pt-2 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <p className={`w-full text-[10px] ${t.textMuted}`}>Atorado = lleva más días que el umbral en su etapa actual, contando desde su último registro. <b>Con proveedor</b> es distinto: solo cuenta si ya pasó la fecha compromiso (el número son días de tolerancia), así una OC para enero no sale como atorada hoy.</p>
              {Object.keys(DEF_UMBRAL).map((k) => (
                <label key={k} className={`text-[11px] flex items-center gap-1.5 ${t.textMuted}`}>{SL[k]}
                  <input type="number" min="0" value={cfg.umbral[k] ?? ''} onChange={(e) => setCfg((c) => ({ ...c, umbral: { ...c.umbral, [k]: Math.max(0, Number(e.target.value)) } }))} className={`${inCls} w-14 text-center`} />
                  <span className="opacity-60" title="Promedio histórico / percentil 90">{tramoProm[k] ? `prom ${tramoProm[k].prom.toFixed(1)} · p90 ${tramoProm[k].p90.toFixed(1)}` : ''}</span>
                </label>
              ))}
              <label className={`text-[11px] flex items-center gap-1.5 ${t.textMuted}`}>Tipo de cambio USD (si no hay del día)
                <input type="number" min="1" step="0.01" value={cfg.tc ?? 18.5} onChange={(e) => setCfg((c) => ({ ...c, tc: Math.max(1, Number(e.target.value)) }))} className={`${inCls} w-16 text-center`} />
                <span className="opacity-60">{Object.keys(fx).length ? `${Object.keys(fx).length} días descargados (BCE)` : 'sin descarga'}</span>
              </label>
            </div>
          )}
        </FilterMenu>
      )}
      {baseAl && <span title="Fecha del registro más reciente de la base. Si tiene más de un día, los días en etapa y los atorados salen inflados." className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${baseDias > 1 ? 'bg-amber-500/15 border-amber-500/50 text-amber-500' : t.cardInner}`}><Clock size={12} /> Base al {fdate(baseAl)} · {baseDias <= 0 ? 'hoy' : baseDias === 1 ? 'ayer' : `hace ${baseDias} días`}</span>}
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
      <button onClick={() => fileRef.current?.click()} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}><Upload size={14} /> Cargar CSV</button>
      <button onClick={() => { setEv(demoEventos()); setAviso(''); abrir(null); }} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Wand2 size={14} /> Datos de prueba</button>
      {ev.length > 0 && <button onClick={exportar} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Download size={14} /> Exportar</button>}
      {ev.length > 0 && <button onClick={() => { setEv([]); abrir(null); }} className={`p-2 rounded-lg border ${t.cardInner}`} title="Borrar datos"><Trash2 size={14} /></button>}
    </>
  );

  return (
    <div className="p-4 md:p-8">
      {/* Header (mismo formato que Eventos) con filtros en menú flotante */}
      <div className={`relative z-30 p-5 rounded-2xl border flex items-center justify-between flex-wrap gap-4 mb-4 ${t.card}`}>
        <div className="flex items-center gap-3">
          <span className={`p-2 rounded-xl ${isDark ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-50 text-violet-600'}`}>{navIcon ? createElement(navIcon, { size: 22 }) : <Truck size={22} />}</span>
          <div><h1 className={`text-2xl font-black tracking-tight leading-none ${t.text}`}>{navLabel || 'Pedidos'}</h1><p className={`text-xs mt-1 ${t.textMuted}`}>{navDesc || 'Rastreador de OCs: dónde está la mercancía'}</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">{headerRight}</div>
      </div>
      {aviso && <div className="mb-4 px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs">{aviso}</div>}

      <div className={`inline-flex p-1 rounded-xl border mb-4 ${t.cardInner}`}>
        {[['rastreo', 'Rastreo'], ['resumen', 'Resumen ejecutivo'], ['validador', `Validador${validador.length ? ` · ${validador.length}` : ''}`]].map(([k, l]) => (
          <button key={k} onClick={() => setPTab(k)} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${pTab === k ? (isDark ? 'bg-violet-600 text-white' : 'bg-violet-600 text-white') : t.textMuted}`}>{l}</button>))}
      </div>
      {pTab === 'resumen' ? ResumenCompra() : pTab === 'validador' ? Validador() : !ev.length && cargando ? (
        <div className={`rounded-2xl border p-10 text-center text-sm font-bold animate-pulse ${t.card} ${t.textMuted}`}>Cargando pedidos guardados…</div>
      ) : !ev.length ? (
        <div className={`rounded-2xl border p-10 text-center ${t.card}`}>
          <Truck size={40} className={`mx-auto mb-3 ${t.textMuted}`} />
          <p className={`font-bold ${t.text}`}>Carga el CSV de eventos de tus pedidos o usa los datos de prueba</p>
          <p className={`text-xs mt-2 ${t.textMuted}`}>Una fila por evento: OC, SKU, PROVEEDOR, TIPO_PEDIDO (IMP / NAC / DIRECTO), PIEZAS, ETAPA, UBICACION, CENTRO, ZONA, FECHA_EVENTO, FECHA_COMPROMISO. También acepta fechas por etapa en columnas (FECHA_ADUANA, FECHA_PLAN, FECHA_TIENDA…).</p>
        </div>
      ) : (<>
        {/* Buckets de inventario */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">
          {BUCKETS.map((b) => { const c = cnt(`B:${b.k}`); const on = selKey === BUCKET_SEL[b.k].key; return (
            <button key={b.k} onClick={() => abrir(on ? null : BUCKET_SEL[b.k])} className={`text-left rounded-2xl border p-3 transition ${t.card} ${on ? 'ring-2 ring-violet-500' : ''}`}>
              <div className="flex items-center gap-2"><span className="p-1.5 rounded-lg" style={{ background: `${b.c}22`, color: b.c }}><b.I size={14} /></span><span className={`text-[10px] font-black uppercase tracking-wider ${t.textMuted}`}>{b.l}</span></div>
              <div className={`text-xl font-black mt-1 ${t.text}`}>{fmt(c.pzs)} <span className={`text-[10px] font-bold ${t.textMuted}`}>pzs</span></div>
              <div className={`text-[10px] ${t.textMuted}`}>{c.ocs || 0} OCs · {fmt(c.n)} líneas{c.ator ? <span className="text-rose-500 font-bold"> · {c.ator} atorados</span> : ''}</div>
              <div className="h-1 rounded-full mt-1.5" style={{ background: isDark ? '#ffffff14' : '#eef1f6' }}><div className="h-1 rounded-full" style={{ width: `${(c.pzs / totPipe) * 100}%`, background: b.c }} /></div>
            </button>
          ); })}
        </div>

        {/* Escena */}
        <div className={`relative rounded-2xl border overflow-hidden ${t.card}`} style={{ height: 720 }}>
          <Suspense fallback={<div className={`absolute inset-0 flex items-center justify-center text-xs ${t.textMuted}`}>Cargando escena 3D…</div>}>
            <Scene3D isDark={isDark} zonas={zonas} ciudades={ciudades} stats={agg} fTipo={hoverTipo || (fTipo.size === 1 ? [...fTipo][0] : '')} semaforo={SEMAFORO} selKey={sel?.key || ''} site={site} panelOpen={!!sel} play={play} onPick={onPick} zoomCmd={zoomCmd} />
          </Suspense>
          <div className={`absolute bottom-3 right-3 text-[10px] pointer-events-none ${t.textMuted} ${sel || unit ? 'hidden' : ''}`}>Arrastra para mover · rueda para zoom · clic derecho para girar</div>

          {/* KPIs flotantes */}
          <div data-hud className="absolute top-3 left-3 right-16 z-10 flex gap-2 overflow-hidden">
            {(() => {
              const ot = kpi.onTime != null ? kpi.onTime * 100 : null;
              const otC = ot == null ? '#94A3B8' : ot >= SEMAFORO.aTiempo.ok ? '#22C55E' : ot >= SEMAFORO.aTiempo.riesgo ? '#F59E0B' : '#E5484D';
              const ld = kpi.lead7 ?? kpi.lead, dl = kpi.lead7 != null && kpi.leadPrev != null ? kpi.lead7 - kpi.leadPrev : null;
              const ldC = ld == null ? '#7C5CF0' : ld <= SEMAFORO.leadObjetivo ? '#22C55E' : ld <= SEMAFORO.leadObjetivo * 1.25 ? '#F59E0B' : '#E5484D';
              return [
                { l: 'Atorados', v: fmt(kpi.ator), s: `${fmt(kpi.pzsAtor)} pzs${kpi.valAtor ? ` · $${fk(kpi.valAtor)}` : ''} · clic para ver`, I: AlertTriangle, bad: kpi.ator > 0, f: 'atorado', c: '#E5484D' },
                { l: 'Traslados vencidos', v: fk(kpi.pzsTrv), s: `pzs en cross dock · ${fmt(kpi.trv)} tienda-OC · clic para ver`, I: WhIcon, bad: kpi.trv > 0, f: 'trvenc', c: '#E5484D' },
                ...(kpi.inc.n ? [{ l: 'Incompletos', v: fk(kpi.inc.pzs), s: `pzs no entregadas · ${fmt(kpi.inc.ocs)} OCs${kpi.inc.falt$ ? ` · $${fk(kpi.inc.falt$)} PV` : ''} · clic para ver`, I: Package, f: 'incompleto', c: '#F59E0B' }] : []),
                { l: 'Vencen en 7 días', v: fmt(kpi.vencen7), s: kpi.compFuturo ? 'OCs aún sin llegar a CEDIS' : 'la base no trae compromisos futuros', I: Clock, c: '#F59E0B', f: 'activo' },
                { l: 'En tránsito a tiendas', v: fk(itBI ? itBI.pzs : kpi.pzsTransito), s: itBI ? `pzs · $${fk(itBI.val)} precio s/IVA` : `pzs${kpi.valTransito ? ` · $${fk(kpi.valTransito)}` : ''}`, I: Truck, c: '#3B82F6', onClick: () => abrir(BUCKET_SEL.TRN) },
                { l: 'Lead time', v: ld != null ? `${ld.toFixed(0)} d` : '—', s: <>obj. {SEMAFORO.leadObjetivo} d{dl != null && <> · <span style={{ color: dl > 0 ? '#E5484D' : '#22C55E', fontWeight: 700 }}>{dl > 0 ? '▲' : '▼'} {Math.abs(dl).toFixed(1)}</span> vs sem. ant.</>}</>, I: Clock, c: ldC },
                { l: 'A tiempo', v: ot != null ? `${ot.toFixed(0)}%` : '—', s: `${kpi.vencidos} vencidos hoy`, I: ot != null && ot < SEMAFORO.aTiempo.riesgo ? AlertTriangle : CheckCircle2, f: 'vencido', c: otC, color: otC },
              ];
            })().map(({ l, v, s, I, bad, f, c, color, onClick }) => (
              <button key={l} onClick={() => (onClick ? onClick() : f && setFSolo(fSolo === f ? '' : f))} className={`shrink-0 text-left px-3 py-2 rounded-xl border shadow-md flex items-center gap-2.5 ${glass} ${f && fSolo === f ? 'ring-2 ring-violet-500' : ''}`}>
                <span className="p-2 rounded-lg" style={{ background: `${c}1f`, color: c }}><I size={16} /></span>
                <span><span className={`block text-[9px] font-black uppercase tracking-wider ${t.textMuted}`}>{l}</span><span className={`block text-lg font-black leading-tight ${bad ? 'text-rose-500' : t.text}`} style={color ? { color } : undefined}>{v}</span><span className={`block text-[10px] ${t.textMuted}`}>{s}</span></span>
              </button>
            ))}
          </div>
          {/* Leyenda de rutas */}
          <div data-hud className={`absolute left-3 top-[100px] rounded-xl border px-3 py-2 shadow-md ${glass}`}>
            <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${t.textMuted}`}>Rutas</div>
            {Object.entries(TIPOS).map(([k, v]) => <button key={k} onMouseEnter={() => setHoverTipo(k)} onMouseLeave={() => setHoverTipo('')} onClick={() => setFTipo((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} className={`flex items-center gap-2 text-[11px] font-bold py-0.5 ${fTipo.size && !fTipo.has(k) ? 'opacity-40' : ''} ${t.text}`}><span className="w-5 h-1 rounded-full" style={{ background: v.c }} />{v.l} <span className={`font-semibold ${t.textMuted}`}>{(() => { const us = units.filter((u) => u.tipo === k && u.etapa !== 'RECIBIDO'); return `${new Set(us.map((u) => u.oc)).size} OCs · ${fmt(us.length)} líneas · ${fk(us.reduce((a, u) => a + u.pzs - u.pzsRec, 0))} pzs`; })()}</span></button>)}
            <div className={`flex items-center gap-2 text-[11px] font-bold py-0.5 ${t.text}`}><span className="w-5 h-1 rounded-full bg-violet-500" />PLAN → tiendas</div>
          </div>
          {/* Controles */}
          <div data-hud className={`absolute top-3 right-3 flex flex-col gap-1 rounded-xl border p-1 shadow-md ${glass} ${sel ? 'lg:right-[394px]' : ''}`}>
            <button onClick={() => setZoomCmd((z) => ({ n: z.n + 1, f: 1.25 }))} className="p-1.5"><ZoomIn size={15} /></button>
            <button onClick={() => setZoomCmd((z) => ({ n: z.n + 1, f: 0.8 }))} className="p-1.5"><ZoomOut size={15} /></button>
            <button onClick={() => { setSite('RED'); setZoomCmd((z) => ({ n: z.n + 1, f: 0, reset: true })); }} className="p-1.5" title="Vista completa"><RotateCcw size={15} /></button>
            <button onClick={() => setPlay((p) => !p)} className="p-1.5" title={play ? 'Pausar animación' : 'Reanudar'}>{play ? <Pause size={15} /> : <Play size={15} />}</button>
          </div>

          {/* Panel del nodo */}
          {sel && (
            <div data-hud className={`absolute top-3 right-3 bottom-3 z-20 w-[380px] max-w-[calc(100%-24px)] rounded-2xl border shadow-xl flex flex-col ${glass}`}>
              <div className="p-4 pb-2 flex items-start justify-between">
                <div>
                  <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>{sel.zona ? 'Zona de tiendas' : sel.ciudad ? 'Bodega regional' : 'Ubicación'}</div>
                  <div className={`text-lg font-black ${t.text}`}>{sel.titulo}</div>
                </div>
                <button onClick={() => abrir(null)} className={t.textMuted}><X size={16} /></button>
              </div>
              {sel.zona && (
                <div className="px-4 flex gap-1 mb-2 flex-wrap">
                  {['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].map((k) => <button key={k} onClick={() => setSel({ ...sel, stages: [k] })} className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${pill(sel.stages[0] === k)}`}>{STAGES[SIDX[k]].short} · {cnt(`${k}|${sel.zona}`).n}</button>)}
                  {allUnits.entrega?.[sel.zona] && <p className={`w-full text-[10px] mt-1 ${t.textMuted}`}>Salida de CEDIS → entrada en tienda: mediana {allUnits.entrega[sel.zona].med.toFixed(1)} d, 9 de cada 10 en ≤ {allUnits.entrega[sel.zona].tip} d. Lo que lleva más de {allUnits.entrega[sel.zona].tip} d en ruta cuenta como <b>sin entrada</b> (ya debería estar en tienda).</p>}
                </div>
              )}
              {(() => {
                const ks = sel.stages; const usT = units.filter((u) => ks.includes(u.etapa) && (!sel.zona || zonaDe(u) === sel.zona) && (!sel.ciudad || ciudadDe(u) === sel.ciudad) && (!sel.tipo || [].concat(sel.tipo).includes(u.tipo)));
                const us = usT.filter((u) => !u.inv), inv = usT.filter((u) => u.inv && u.etapa !== 'TRANSITO_INT');
                // Inventario almacenado en el nodo, por CEDIS: con traslado (ya asignado a tiendas) / sin traslado, y lo de 90+ días
                const iv = {}; inv.forEach((u) => { const [pre, cen, b] = u.oc.split(' '); const o = (iv[cen] = iv[cen] || { cen, con: 0, sin: 0, v90: 0 }); if (pre === 'ASG') o.con += u.pzs; else o.sin += u.pzs; if (b === '90+') o.v90 += u.pzs; });
                const ivR = Object.values(iv).sort((a, b) => b.con + b.sin - a.con - a.sin), ivT = ivR.reduce((a, o) => a + o.con + o.sin, 0);
                const c = { n: us.length, pzs: us.reduce((a, u) => a + Math.max(0, u.pzs - u.pzsRec), 0), ator: us.filter((u) => u.atorado).length, maxDias: us.reduce((a, u) => Math.max(a, u.enEtapa || 0), 0) };
                const tp = ks.length === 1 ? tramoProm[ks[0]] : null;
                return (<>
                  {ivT > 0 && (
                    <div className={`mx-4 mb-2 rounded-lg border p-2 ${t.cardInner}`}>
                      <div className="flex items-baseline justify-between mb-1"><span className={`text-[9px] font-black uppercase tracking-wider ${t.textMuted}`}>Inventario almacenado</span><span className={`text-base font-black ${t.text}`}>{fmt(ivT)} <span className={`text-[10px] font-bold ${t.textMuted}`}>pzs</span></span></div>
                      {ivR.map((o) => (
                        <div key={o.cen} className="text-[10.5px] flex justify-between gap-2 py-0.5">
                          <span className={`font-bold truncate ${t.text}`}>{CENTROS[o.cen] || o.cen}</span>
                          <span className={`shrink-0 ${t.textMuted}`}><b className="text-violet-500">{fmt(o.con)}</b> con traslado · <b className="text-amber-500">{fmt(o.sin)}</b> sin traslado{o.v90 ? <> · <b className="text-rose-500">{fmt(o.v90)}</b> de 90+ d</> : ''}</span>
                        </div>))}
                    </div>)}
                  <div className="px-4 grid grid-cols-4 gap-1.5 mb-2">
                    {[['OCs', fmt(new Set(us.map((u) => u.oc)).size)], ['Piezas', fk(c.pzs)], ['Pzs atoradas', fk(us.filter((u) => u.atorado).reduce((a, u) => a + u.pzs, 0))], ['Costo', `$${fk(us.reduce((a, u) => a + (u.valor || 0), 0))}`], ['Costo atorado', `$${fk(us.filter((u) => u.atorado).reduce((a, u) => a + (u.valor || 0), 0))}`], ['Días prom. aquí', us.length ? (us.reduce((a, u) => a + (u.enEtapa || 0), 0) / us.length).toFixed(1) : '—'], ['SLA (umbral)', ks.length === 1 && cfg.umbral[ks[0]] != null ? `${cfg.umbral[ks[0]]} d` : '—'], ['Máx. días', c.maxDias ? c.maxDias.toFixed(0) : '—']].map(([l, v]) => (
                      <div key={l} className={`rounded-lg border px-2 py-1.5 ${t.cardInner}`}><div className={`text-[8.5px] uppercase font-bold ${t.textMuted}`}>{l}</div><div className={`text-sm font-black ${(l === 'Pzs atoradas' || l === 'Costo atorado') && c.ator ? 'text-rose-500' : t.text}`}>{v}</div></div>
                    ))}
                  </div>
                </>);
              })()}
              {(() => {
                // Top 10 OCs más atrasadas del nodo (agrupadas por OC)
                const m = {};
                nodeUnits.filter((u) => u.atorado || u.vencido).forEach((u) => { const o = (m[u.oc] = m[u.oc] || { oc: u.oc, prov: u.prov, goa: u.goa || u.modelo || u.sku, pzs: 0, comp: u.fechaComp, dias: 0, u }); o.pzs += u.pzs; const d = u.etapa === 'PROVEEDOR' && u.fechaComp ? dias(u.fechaComp, hoy) : u.enEtapa - (cfg.umbral[u.etapa] ?? 0); if (d > o.dias) { o.dias = d; o.u = u; } });
                const top = Object.values(m).sort((a, b) => b.dias - a.dias).slice(0, 10);
                const exp = () => { const H = ['OC', 'PROVEEDOR', 'SECCION', 'GOA', 'TIENDA', 'TIPO', 'ETAPA', 'PIEZAS', 'DIAS_EN_ETAPA', 'ATORADO', 'COMPROMISO', 'TRASLADO', 'ENTREGA_PLAN', 'TRASLADO_VENCIDO']; const L = [H.join(',')]; nodeUnits.forEach((u) => L.push([u.oc, u.prov, u.seccion, u.goa, u.centro, TIPOS[u.tipo].l, SL[u.etapa], u.pzs, (u.enEtapa || 0).toFixed(1), u.atorado ? 'SI' : '', u.fechaComp ? u.fechaComp.toISOString().slice(0, 10) : '', u.traslado || '', ((x) => (x ? new Date(x).toISOString().slice(0, 10) : ''))(u.fechaEntPlan), u.trVencido ? 'SI' : ''].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = `Pedidos_${(sel.titulo || 'nodo').replace(/[^\w]+/g, '_')}.csv`; a.click(); };
                return (
                  <div className="px-4 mb-2">
                    <div className={`text-[9px] font-black uppercase tracking-wider mb-1 flex justify-between items-center ${t.textMuted}`}><span title="Días de atraso contra la fecha esperada (compromiso); fuera de proveedor, días en el nodo por encima del SLA">Top 10 · atraso vs compromiso / umbral</span><button onClick={exp} className="flex items-center gap-1 normal-case font-bold hover:underline"><Download size={11} /> CSV del nodo</button></div>
                    {top.length === 0 ? <p className={`text-[10px] ${t.textMuted}`}>Sin OCs atrasadas aquí.</p> : (
                      <div className={`rounded-lg border max-h-40 overflow-y-auto custom-scrollbar ${t.cardInner}`}>
                        {top.map((o) => <button key={o.oc} onClick={() => { setSelUnit(null); setSelOC(o.oc); }} className={`w-full grid grid-cols-[1fr_auto] gap-1 px-2 py-1 text-left border-b last:border-0 ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}><span className="min-w-0"><span className={`block text-[11px] font-bold truncate ${t.text}`}>{o.oc} · {o.prov}</span><span className={`block text-[9.5px] truncate ${t.textMuted}`}>{o.goa} · {fmt(o.pzs)} pzs{o.comp ? ` · esperada ${fdate(o.comp)}` : ''}</span></span><span className="text-[11px] font-black text-rose-500 self-center">+{Math.max(0, o.dias).toFixed(0)} d</span></button>)}
                      </div>
                    )}
                  </div>
                );
              })()}
              {sel.zona && tiendasZona.length > 0 && (
                <div className="px-4 mb-2">
                  <div className={`text-[9px] font-black uppercase tracking-wider mb-1 flex justify-between ${t.textMuted}`}><span>Tiendas de la zona ({tiendasZona.length}) · clic para ver sus OCs</span>{selTienda && <button onClick={() => setSelTienda('')} className="underline">ver todas</button>}</div>
                  <div className="flex flex-wrap gap-[3px] max-h-24 overflow-y-auto custom-scrollbar">
                    {tiendasZona.map((s) => <button key={s.c} onClick={() => { if (selTienda === s.c) return setSelTienda(''); setSelTienda(s.c); setSel({ ...sel, stages: [s.ator ? (s.sin >= s.ruta ? 'TIENDA' : 'TRANSITO_TDA') : s.sin ? 'TIENDA' : s.ruta ? 'TRANSITO_TDA' : 'RECIBIDO'] }); }} title={`T${s.c} · ${s.ruta} en ruta · ${s.sin} sin entrada (${fmt(s.pzs)} pzs) · ${s.rec} recibidos${s.ator ? ` · ${s.ator} atorados` : ''}`} className={`w-[18px] h-[18px] rounded-[4px] ${selTienda === s.c ? 'ring-2 ring-offset-1 ring-violet-500' : ''}`} style={{ background: s.ator ? '#E5484D' : s.sin ? '#F59E0B' : s.ruta ? '#7C5CF0' : s.rec ? '#22C55E' : (isDark ? '#ffffff22' : '#E2E8F0') }} />)}
                  </div>
                  <div className={`flex gap-3 text-[9px] mt-1 ${t.textMuted}`}>{[['#E5484D', 'atorado'], ['#F59E0B', 'sin entrada'], ['#7C5CF0', 'en ruta'], ['#22C55E', 'recibido']].map(([c, l]) => <span key={l} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: c }} />{l}</span>)}</div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
                {nodeUnits.length === 0 && <p className={`text-xs text-center py-6 ${t.textMuted}`}>Sin pedidos aquí con los filtros actuales.</p>}
                {nodeUnits.length > 0 && <div className={`text-[9px] font-black uppercase tracking-wider px-2 pb-1 ${t.textMuted}`} title="Días desde el último registro de la OC en este nodo (máximo entre sus tiendas)">Días en este nodo</div>}
                {(() => {
                  // Una fila por OC (tiendas, piezas y máximo de días); clic para ver sus tiendas
                  const m = new Map();
                  nodeUnits.forEach((u) => { if (!m.has(u.oc)) m.set(u.oc, { oc: u.oc, prov: u.prov, goa: u.goa || u.modelo || u.sku, tipo: u.tipo, us: [], pzs: 0, max: 0, ator: 0 }); const o = m.get(u.oc); o.us.push(u); o.pzs += u.pzs; o.max = Math.max(o.max, u.enEtapa || 0); if (u.atorado) o.ator++; });
                  return [...m.values()].sort((a, b) => b.max - a.max).slice(0, 200).map((o) => (
                    <div key={o.oc} className="mb-1">
                      <button onClick={() => { setExpOC(expOC === o.oc ? '' : o.oc); setSelUnit(null); setSelOC(o.oc); }} className={`w-full text-left px-2.5 py-2 rounded-lg border ${expOC === o.oc ? (isDark ? 'border-violet-500 bg-violet-500/10' : 'border-blue-400 bg-blue-50') : `border-transparent ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-black flex items-center gap-1.5 ${t.text}`}><span className="w-2 h-2 rounded-full" style={{ background: TIPOS[o.tipo].c }} />{o.us[0]?.inv ? (() => { const [pre, cen, b] = o.oc.split(' '); return `Inventario ${pre === 'ASG' ? 'con traslado' : 'sin traslado'} · ${CENTROS[cen] || cen} · ${b === 'SIN' ? 'sin fecha' : `${b} d`}`; })() : `OC ${o.oc}`}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.ator ? 'bg-rose-500/15 text-rose-500' : (isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>{o.max.toFixed(0)} d en nodo</span>
                        </div>
                        <div className={`text-[10px] ${t.textMuted}`}>{o.prov} · {o.goa} · {o.us.length} {o.us[0]?.inv ? (o.us.length === 1 ? 'línea' : 'líneas') : o.us.length === 1 ? 'tienda' : 'tiendas'} · {fmt(o.pzs)} pzs{o.us[0]?.etapa === 'FULFILLMENT' && o.us[0].ubic ? ` · ${o.us[0].ubic}` : ''}{o.ator ? ` · ${o.ator} atoradas` : ''}{o.us.length === 1 && o.us[0].traslado ? ` · Tr ${o.us[0].traslado}${o.us[0].fechaEntPlan ? ` · entrega ${fdate(new Date(o.us[0].fechaEntPlan))}` : ''}` : ''}{o.us.some((u) => u.trVencido) ? <b className="text-rose-500"> · {o.us.filter((u) => u.trVencido).length} traslado(s) vencido(s)</b> : ''}{o.us.some((u) => u.incompleto) ? <b className="text-amber-500"> · OC incompleta: no entregado por el proveedor</b> : ''}</div>
                      </button>
                      {expOC === o.oc && o.us.length > 1 && (
                        <div className={`ml-4 pl-2 border-l ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                          {o.us.sort((a, b) => b.enEtapa - a.enEtapa).map((u) => (
                            <button key={u.key} onClick={() => { setSelOC(''); setSelUnit(u.key); }} className={`w-full flex justify-between text-[10.5px] px-2 py-1 rounded ${selUnit === u.key ? (isDark ? 'bg-violet-500/15' : 'bg-blue-50') : (isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50')}`}>
                              <span className={t.text}>{u.centro ? `T${u.centro}` : '—'} · {fmt(u.pzs)} pzs{u.traslado ? ` · Tr ${u.traslado}` : ''}{u.fechaEntPlan ? ` · entrega ${fdate(new Date(u.fechaEntPlan))}` : ''}{u.eventos[0]?.saldo ? <b className="text-amber-500"> · saldo sin surtir</b> : ''}{u.trVencido ? <b className="text-rose-500"> · vencido</b> : ''}</span>
                              <span className={u.atorado ? 'text-rose-500 font-bold' : t.textMuted}>{u.etapa === 'RECIBIDO' ? `recibido ${fdate(u.fin)}` : `${(u.enEtapa || 0).toFixed(0)} d`}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
                {false && nodeUnits.slice(0, 300).map((u) => (
                  <button key={u.key} onClick={() => setSelUnit(u.key)} className={`w-full text-left px-2.5 py-2 rounded-lg mb-1 border ${selUnit === u.key ? (isDark ? 'border-violet-500 bg-violet-500/10' : 'border-blue-400 bg-blue-50') : `border-transparent ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-black flex items-center gap-1.5 ${t.text}`}><span className="w-2 h-2 rounded-full" style={{ background: TIPOS[u.tipo].c }} />OC {u.oc}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${u.atorado ? 'bg-rose-500/15 text-rose-500' : u.etapa === 'RECIBIDO' ? 'bg-emerald-500/15 text-emerald-500' : (isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>{u.etapa === 'RECIBIDO' ? `recibido ${fdate(u.fin)}` : `${(u.enEtapa || 0).toFixed(0)} d aquí`}</span>
                    </div>
                    <div className={`text-[10px] ${t.textMuted}`}>{u.prov} · {u.modelo || u.sku} · {fmt(u.pzs)} pzs{u.centro ? ` · T${u.centro}` : ''}{sel.stages.length > 1 ? ` · ${STAGES[SIDX[u.etapa]].short}` : ''}{u.vencido ? ' · vencido' : ''}{u.estimado ? ' · llegó sin entrada (estimado)' : ''}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Movimientos recientes / atorados */}
          {!sel && !unit && !ocUs.length && !feedOpen && (
            <button data-hud onClick={() => setFeedOpen(true)} className={`absolute left-3 bottom-3 px-3 py-2 rounded-xl border shadow-md text-[11px] font-bold flex items-center gap-2 ${glass} ${t.text}`}><Clock size={13} /> Movimientos{kpi.ator ? <span className="text-rose-500">· {kpi.ator} atorados</span> : ''}</button>
          )}
          {!sel && !unit && !ocUs.length && feedOpen && (
            <div data-hud className={`absolute left-3 bottom-3 w-[330px] max-w-[calc(100%-24px)] rounded-2xl border shadow-xl p-3 ${glass}`}>
              <div className="flex gap-1 mb-2 items-center">
                {[['mov', 'Movimientos recientes'], ['ator', `Atorados ${kpi.ator}`]].map(([k, l]) => <button key={k} onClick={() => setFeedTab(k)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${pill(feedTab === k)}`}>{l}</button>)}
                <button onClick={() => setFeedOpen(false)} className={`ml-auto ${t.textMuted}`}><X size={14} /></button>
              </div>
              {feedTab === 'ator' && (
                <div className="flex gap-1 mb-2">{[['', 'Todos'], ['0-7', '0–7 d'], ['8-15', '8–15 d'], ['16-30', '16–30 d'], ['31-9999', '>30 d']].map(([k, l]) => <button key={k} onClick={() => setFeedAge(k)} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${pill(feedAge === k)}`}>{l}</button>)}</div>
              )}
              <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                {(feedTab === 'mov' ? feed.map(({ u, e }) => ({ u, txt: SL[e.etapa], when: hace(e.fecha, hoy) })) : units.filter((u) => { if (!u.atorado) return false; if (!feedAge) return true; const [a, b] = feedAge.split('-').map(Number); return u.enEtapa >= a && u.enEtapa < b + 1; }).sort((a, b) => b.enEtapa - a.enEtapa).slice(0, 60).map((u) => ({ u, txt: `${STAGES[SIDX[u.etapa]].short} · ${u.enEtapa.toFixed(0)} d`, when: `umbral ${cfg.umbral[u.etapa]} d` }))).map(({ u, txt, when }) => (
                  <button key={u.key} onClick={() => abrirUnidad(u)} className={`w-full flex items-center justify-between text-left px-2 py-1.5 rounded-lg ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
                    <span className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: TIPOS[u.tipo].c }} /><span className="min-w-0"><span className={`block text-[11px] font-bold truncate ${t.text}`}>OC {u.oc} · {u.prov}</span><span className={`block text-[10px] truncate ${t.textMuted}`}>{txt}{u.ubic ? ` · ${u.ubic}` : ''}</span></span></span>
                    <span className={`text-[10px] shrink-0 ${feedTab === 'ator' ? 'text-rose-500 font-bold' : t.textMuted}`}>{when}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rastreo de la OC completa: cuántas tiendas/piezas han pasado por cada etapa y dónde están hoy */}
          {ocUs.length > 0 && (() => {
            const f = ocUs[0], N = ocUs.length, col = TIPOS[f.tipo].c;
            const route = [...new Set(ocUs.flatMap((u) => u.route))].sort((a, b) => SIDX[a] - SIDX[b]);
            const pzs = ocUs.reduce((a, u) => a + u.pzs, 0), ator = ocUs.filter((u) => u.atorado).length;
            const comp = ocUs.find((u) => u.fechaComp)?.fechaComp, ini = ocUs.reduce((m, u) => (u.inicio && (!m || u.inicio < m) ? u.inicio : m), null);
            const llego = ocUs.filter((u) => u.at.ALMACEN || u.at.CROSSDOCK || u.fin).length;
            const inc = ocUs.find((u) => u.ocInc)?.ocInc, falt = ocUs.filter((u) => u.incompleto);
            if (falt.length) route.push('NOENT');
            return (
              <div data-hud className={`absolute left-3 bottom-3 rounded-2xl border shadow-xl p-4 ${glass} ${sel ? 'right-[404px]' : 'right-3'} max-lg:right-3`}>
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div>
                    <div className={`text-sm font-black flex items-center gap-2 flex-wrap ${t.text}`}><Truck size={15} /> OC {f.oc}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${col}22`, color: col }}>{TIPOS[f.tipo].l}</span>
                      <span className={`text-[10px] font-bold ${t.textMuted}`}>{f.prov} · {[...new Set(ocUs.map((u) => u.goa || u.modelo || u.sku))].slice(0, 3).join(', ')} · {fmt(pzs)} pzs · {N} {N === 1 ? 'tienda' : 'tiendas'}</span></div>
                    <div className={`text-[11px] ${t.textMuted}`}>OC del {fdate(ini)}{comp ? ` · fin de vigencia ${fdate(comp)}` : ' · sin compromiso'}{inc ? <> · entregada a CEDIS {fdate(inc.fEnt)}{comp && inc.fEnt > comp ? <b className="text-rose-500"> ({Math.round(dias(comp, inc.fEnt))} d tarde)</b> : ''}</> : <>{comp && hoy > comp && llego < N ? <b className="text-rose-500"> · vencida</b> : ''} · llegó a CEDIS {llego}/{N}</>}{ator ? <b className="text-rose-500"> · {ator} atoradas</b> : ''}</div>
                    {inc && <div className="text-[11px] mt-0.5"><b className="text-amber-500">Pedido incompleto · cerrado:</b> <span className={t.textMuted}>entregó {fmt(inc.rec)} de {fmt(inc.ped)} pzs ({inc.ped ? (inc.rec / inc.ped * 100).toFixed(1) : '—'}%){inc.mPed ? ` · $${fmt(inc.mEnt)} de $${fmt(inc.mPed)} PV · faltan $${fmt(inc.mPed - inc.mEnt)}` : ''}{falt.length ? ` · ${falt.length} ${falt.length === 1 ? 'tienda' : 'tiendas'} sin mercancía (no es atorado)` : ''}</span></div>}
                  </div>
                  <button onClick={() => setSelOC('')} className={t.textMuted}><X size={15} /></button>
                </div>
                <div className="flex items-start overflow-x-auto pb-1">
                  {route.map((k, i) => {
                    if (k === 'NOENT') return (
                      <div key={k} className="flex items-start flex-1 min-w-[96px]">
                        <div className="flex flex-col items-center text-center w-full">
                          <div className="flex items-center w-full">
                            <div className="h-[3px] flex-1 rounded" style={{ background: 'repeating-linear-gradient(90deg,#F59E0B 0 4px,transparent 4px 8px)' }} />
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: '#F59E0B', boxShadow: '0 0 0 5px #F59E0B33' }}>{falt.length}</div>
                            <div className="h-[3px] flex-1 rounded opacity-0" />
                          </div>
                          <div className="text-[10px] font-bold mt-1 text-amber-500">No entregado</div>
                          <div className={`text-[9px] ${t.textMuted}`}>faltante del proveedor</div>
                          <div className="text-[9px] font-bold text-amber-500">{fk(falt.reduce((a, u) => a + u.pzs, 0))} pzs</div>
                        </div>
                      </div>);
                    const pas = ocUs.filter((u) => u.at[k]), aqui = ocUs.filter((u) => u.etapa === k && !u.incompleto), aqAt = aqui.some((u) => u.atorado);
                    const todo = pas.length >= N - falt.length && !aqui.length, algo = pas.length > 0;
                    const prim = pas.reduce((m, u) => (!m || u.at[k] < m ? u.at[k] : m), null);
                    const bg = aqui.length ? (aqAt ? '#E5484D' : FINALES.includes(k) || k === 'RECIBIDO' ? '#22C55E' : col) : todo || algo ? col : (isDark ? '#ffffff18' : '#E2E8F0');
                    return (
                      <div key={k} className="flex items-start flex-1 min-w-[96px]">
                        <div className="flex flex-col items-center text-center w-full">
                          <div className="flex items-center w-full">
                            <div className="h-[3px] flex-1 rounded" style={{ opacity: i === 0 ? 0 : 1, background: algo ? col : (isDark ? '#ffffff22' : '#E2E8F0') }} />
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${aqAt ? 'animate-pulse' : ''}`} style={{ background: bg, opacity: algo && !todo && !aqui.length ? 0.55 : 1, color: algo || aqui.length ? '#fff' : (isDark ? '#9CA3AF' : '#64748B'), boxShadow: aqui.length ? `0 0 0 5px ${aqAt ? '#E5484D33' : `${col}33`}` : 'none' }}>{todo ? '✓' : aqui.length || i + 1}</div>
                            <div className="h-[3px] flex-1 rounded" style={{ opacity: i === route.length - 1 ? 0 : 1, background: todo ? col : (isDark ? '#ffffff22' : '#E2E8F0') }} />
                          </div>
                          <div className={`text-[10px] font-bold mt-1 ${t.text}`}>{STAGES[SIDX[k]].short}</div>
                          <div className={`text-[9px] ${t.textMuted}`}>{algo ? `${pas.length}/${N} · desde ${fdate(prim)}` : '—'}</div>
                          {aqui.length > 0 && <div className={`text-[9px] font-bold ${aqAt ? 'text-rose-500' : t.text}`}>hoy {aqui.length} · {fk(aqui.reduce((a, u) => a + u.pzs, 0))} pzs</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={`text-[9px] mt-1 ${t.textMuted}`}>Número = tiendas que están hoy en esa etapa · x/N = tiendas que ya pasaron por ella. Para ver un traslado, abre la OC en el panel y elige la tienda.</div>
              </div>
            );
          })()}

          {/* Rastreo de la OC */}
          {unit && (
            <div data-hud className={`absolute left-3 bottom-3 rounded-2xl border shadow-xl p-4 ${glass} ${sel ? 'right-[404px]' : 'right-3'} max-lg:right-3`}>
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <div className={`text-sm font-black flex items-center gap-2 flex-wrap ${t.text}`}><Truck size={15} /> OC {unit.oc}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${TIPOS[unit.tipo].c}22`, color: TIPOS[unit.tipo].c }}>{TIPOS[unit.tipo].l}</span>
                    <span className={`text-[10px] font-bold ${t.textMuted}`}>{unit.prov} · {unit.modelo || unit.sku} · {fmt(unit.pzs)} pzs{unit.cont ? ` · ${unit.cont}` : ''}{unit.centro ? ` · T${unit.centro}` : ''}</span></div>
                  <div className={`text-[11px] ${t.textMuted}`}>Último registro: <b className={unit.atorado ? 'text-rose-500' : ''}>{SL[unit.etapa]}</b> · {fdate(unit.desde)}{unit.ubic ? ` · ${unit.ubic}` : ''}{unit.etapa !== 'RECIBIDO' ? ` · lleva ${(unit.enEtapa || 0).toFixed(1)} días` : ''}{unit.fechaComp ? ` · compromiso ${fdate(unit.fechaComp)}` : ''}{unit.vencido ? ' · vencido' : ''}{unit.estimado ? ' · llegó a tienda sin entrada (estimado por entrega típica de la zona)' : ''}</div>
                  {unit.traslado && (() => { const h = allUnits.filter((u) => u.traslado === unit.traslado && u.key !== unit.key); if (!h.length) return null; const sl = unit.eventos[0]?.saldo ? unit : h.find((u) => u.eventos[0]?.saldo), en = unit.eventos[0]?.saldo ? h[0] : unit; if (!sl || !en) return null;
                    return <div className="text-[11px] mt-0.5"><b className="text-amber-500">Salida parcial del traslado {unit.traslado}:</b> <span className={t.textMuted}>salieron {fmt(en.pzs)} de {fmt(en.pzs + sl.pzs)} pzs · {fmt(sl.pzs)} siguen en cross dock {sl.incompleto ? '(faltante del proveedor)' : sl.trVencido ? <b className="text-rose-500">(traslado vencido · {sl.enEtapa.toFixed(0)} d en CEDIS)</b> : `(${sl.enEtapa.toFixed(0)} d en CEDIS)`}</span> <button onClick={() => setSelUnit(unit === sl ? en.key : sl.key)} className="text-violet-500 font-bold hover:underline">ver {unit === sl ? 'lo que salió' : 'saldo'}</button></div>; })()}
                </div>
                <button onClick={() => setSelUnit(null)} className={t.textMuted}><X size={15} /></button>
              </div>
              {(() => {
                const route = unit.route; const ci = route.indexOf(unit.etapa);
                let eta = new Date(unit.desde);
                const col = TIPOS[unit.tipo].c;
                return (
                  <div className="flex items-start overflow-x-auto pb-1">
                    {route.map((k, i) => {
                      const done = unit.at[k] && i < ci, cur = i === ci, pend = i > ci;
                      if (pend) { eta = new Date(eta.getTime() + ((tramoProm[route[i - 1]]?.prom ?? (cfg.umbral[route[i - 1]] || 2) * 0.6) || 1) * DAY); if (i === ci + 1 && eta < hoy) eta = new Date(hoy.getTime() + DAY); }
                      const dur = unit.tramos[k];
                      return (
                        <div key={k} className="flex items-start flex-1 min-w-[92px]">
                          <div className="flex flex-col items-center text-center w-full">
                            <div className="flex items-center w-full">
                              <div className="h-[3px] flex-1 rounded" style={{ opacity: i === 0 ? 0 : 1, background: done || cur ? col : (isDark ? '#ffffff22' : '#E2E8F0') }} />
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black ${cur && unit.atorado ? 'animate-pulse' : ''}`} style={{ background: cur ? (unit.atorado ? '#E5484D' : FINALES.includes(k) || k === 'RECIBIDO' ? '#22C55E' : col) : done ? col : (isDark ? '#ffffff18' : '#E2E8F0'), color: cur || done ? '#fff' : (isDark ? '#9CA3AF' : '#64748B'), boxShadow: cur ? `0 0 0 5px ${unit.atorado ? '#E5484D33' : `${col}33`}` : 'none' }}>{done ? '✓' : i + 1}</div>
                              <div className="h-[3px] flex-1 rounded" style={{ opacity: i === route.length - 1 ? 0 : 1, background: done ? col : (isDark ? '#ffffff22' : '#E2E8F0') }} />
                            </div>
                            <div className={`text-[10px] font-bold mt-1 ${t.text}`}>{STAGES[SIDX[k]].short}</div>
                            <div className={`text-[9px] ${t.textMuted}`}>{unit.at[k] ? fdate(unit.at[k]) : pend ? `ETA ${fdate(eta)}` : '—'}</div>
                            {(dur != null || cur) && k !== 'RECIBIDO' && <div className={`text-[9px] font-bold ${cur && unit.atorado ? 'text-rose-500' : t.textMuted}`}>{cur ? `${(unit.enEtapa || 0).toFixed(1)} d` : `${dur.toFixed(1)} d`}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Inventario en CEDIS */}
        {invCedis && (
          <div className={`rounded-2xl border p-4 mt-4 ${t.card}`}>
            <div className={`text-sm font-black ${t.text}`}>Inventario en CEDIS</div>
            <div className={`text-[11px] mb-3 ${t.textMuted}`}>Piezas guardadas por antigüedad (días desde que entraron). <b>Con traslado</b> = ya asignadas a tiendas, esperando salir · <b>Sin traslado</b> = guardadas sin destino. Sin = sin fecha.</div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className={t.textMuted}><th className="text-left py-1 font-black uppercase text-[9px]">CEDIS</th>{INV_B.map((b) => <th key={b} className="text-right py-1 font-black uppercase text-[9px]">{b === 'SIN' ? 'Sin fecha' : `${b} d`}</th>)}<th className="text-right py-1 font-black uppercase text-[9px]">Total</th></tr></thead>
                  <tbody>{invCedis.rows.map((r) => (
                    <tr key={`${r.cen}${r.con}`} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <td className={`py-1.5 font-bold ${t.text}`}>{CENTROS[r.cen] || r.cen} <span className={`font-semibold ${r.con ? 'text-violet-500' : 'text-amber-500'}`}>· {r.con ? 'con traslado' : 'sin traslado'}</span></td>
                      {INV_B.map((b) => { const v = r.b[b] || 0, old = b === '90+' || b === '61-90'; return <td key={b} className={`text-right py-1.5 tabular-nums ${v && old && !r.con ? 'text-rose-500 font-bold' : v ? t.text : t.textMuted}`}>{v ? fmt(v) : '·'}</td>; })}
                      <td className={`text-right py-1.5 font-black tabular-nums ${t.text}`}>{fmt(r.tot)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div>
                <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${t.textMuted}`}>Lo más viejo sin traslado (90+ días)</div>
                {invCedis.viejo.length ? invCedis.viejo.map(([k, v]) => { const [prov, goa, cen] = k.split('|'); return <div key={k} className={`flex justify-between gap-2 text-[11px] py-0.5 ${t.text}`}><span className="truncate">{prov} · <span className={t.textMuted}>{goa} · {cen}</span></span><b className="text-rose-500 tabular-nums">{fmt(v)}</b></div>; }) : <div className={`text-[11px] ${t.textMuted}`}>Nada con más de 90 días.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Gráficos */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h4 className={`text-sm font-black mb-1 ${t.text}`}>Pipeline de piezas</h4>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Dónde están hoy las piezas que no se han recibido.</p>
            <div className="flex h-7 rounded-lg overflow-hidden mb-3">
              {BUCKETS.map((b) => { const v = cnt(`B:${b.k}`).pzs; return v ? <div key={b.k} title={`${b.l}: ${fmt(v)} pzs`} style={{ width: `${(v / totPipe) * 100}%`, background: b.c }} className="h-full" /> : null; })}
            </div>
            <div className="space-y-1.5">
              {BUCKETS.map((b) => { const c = cnt(`B:${b.k}`); return (
                <button key={b.k} onClick={() => abrir(BUCKET_SEL[b.k])} className="w-full flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.c }} /><span className={`flex-1 text-left ${t.text}`}>{b.l}</span>
                  <span className={`font-bold ${t.text}`}>{fmt(c.pzs)}</span><span className={`w-10 text-right ${t.textMuted}`}>{((c.pzs / totPipe) * 100).toFixed(0)}%</span>
                </button>
              ); })}
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h4 className={`text-sm font-black mb-1 ${t.text}`}>Lead time por tipo de pedido</h4>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Días promedio en cada tramo, de la OC a su destino.</p>
            {(() => {
              const mx = Math.max(1, ...leadTipo.map((l) => l.total));
              const colSt = { PROVEEDOR: '#64748B', TRANSITO_INT: '#0EA5E9', ADUANA: '#E2A93B', ALMACEN: '#3B82F6', CROSSDOCK: '#7C5CF0', TRANSITO_TDA: '#F59E0B', TIENDA: '#EC4899' };
              return (<>
                {leadTipo.map((l) => (
                  <div key={l.tp} className="mb-3">
                    <div className="flex justify-between text-[11px] mb-1"><span className={`font-bold flex items-center gap-1.5 ${t.text}`}><span className="w-2 h-2 rounded-full" style={{ background: TIPOS[l.tp].c }} />{TIPOS[l.tp].l}</span><span className={t.textMuted}>{l.total ? `${l.total.toFixed(0)} d` : 'sin historia'} · {l.n} líneas</span></div>
                    <div className={`flex h-5 rounded-md overflow-hidden ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} style={{ width: `${Math.max(8, (l.total / mx) * 100)}%` }}>
                      {l.seg.map((s) => <div key={s.k} title={`${SL[s.k]}: ${s.v.toFixed(1)} d`} style={{ width: `${(s.v / (l.total || 1)) * 100}%`, background: colSt[s.k] || '#94A3B8' }} className="h-full text-[8px] text-white font-bold flex items-center justify-center overflow-hidden">{s.v >= 3 ? s.v.toFixed(0) : ''}</div>)}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 mt-2">{Object.entries(colSt).map(([k, c]) => <span key={k} className={`text-[9px] flex items-center gap-1 ${t.textMuted}`}><span className="w-2 h-2 rounded-sm" style={{ background: c }} />{STAGES[SIDX[k]].short}</span>)}</div>
              </>);
            })()}
          </div>
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h4 className={`text-sm font-black mb-1 ${t.text}`}>Antigüedad por etapa (piezas)</h4>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Cuántos días llevan las piezas en la etapa donde están hoy.</p>
            <table className="w-full text-[11px]">
              <thead><tr className={`text-[9px] uppercase ${t.textMuted}`}><th className="text-left py-1">Etapa</th>{['0-3', '4-7', '8-15', '16-30', '30+'].map((h) => <th key={h} className="text-right py-1">{h} d</th>)}</tr></thead>
              <tbody>
                {aging.map(({ s, cells, tot }) => (
                  <tr key={s.k}>
                    <td className={`py-1 pr-2 whitespace-nowrap ${t.text}`}>{s.short}</td>
                    {cells.map((v, i) => { const a = tot ? v / tot : 0; const col = i >= 3 ? '229,72,77' : i === 2 ? '245,158,11' : '124,92,240'; return <td key={i} className="py-0.5 pl-1"><div className={`rounded text-right px-1.5 py-1 font-bold ${v ? '' : t.textMuted}`} style={{ background: v ? `rgba(${col},${0.12 + a * 0.6})` : 'transparent', color: v && a > 0.45 ? '#fff' : undefined }}>{v ? fk(v) : '·'}</div></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tablas */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h4 className={`text-sm font-black mb-1 ${t.text}`}>Tiempos por tramo y proveedor (días promedio)</h4>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Cuánto se queda la mercancía en cada etapa hasta su siguiente registro. Rojo = arriba del umbral de atorado.</p>
            <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className={`sticky top-0 ${isDark ? 'bg-[#1a1520]' : 'bg-gray-50'}`}><tr className={`text-[9px] uppercase ${t.textMuted}`}>
                  <th className="p-2 text-left">Proveedor</th>{STAGES.filter((s) => s.k !== 'RECIBIDO').map((s) => <th key={s.k} className="p-2 text-right whitespace-nowrap">{s.short}</th>)}<th className="p-2 text-right">Lead</th><th className="p-2 text-right">A tiempo</th><th className="p-2 text-right">Pend.</th>
                </tr></thead>
                <tbody>
                  {porProv.map((p) => (
                    <tr key={p.prov} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <td className={`p-2 font-bold whitespace-nowrap ${t.text}`}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: TIPOS[p.tipo].c }} />{p.prov}{p.ator > 0 && <span className="ml-1 text-rose-500 text-[10px]">● {p.ator}</span>}</td>
                      {STAGES.filter((s) => s.k !== 'RECIBIDO').map((s) => { const a = p.tram[s.k]; const v = a ? a.reduce((x, y) => x + y, 0) / a.length : null; return <td key={s.k} className={`p-2 text-right ${v != null && v > cfg.umbral[s.k] ? 'text-rose-500 font-bold' : t.textMuted}`}>{v != null ? v.toFixed(1) : '·'}</td>; })}
                      <td className={`p-2 text-right font-bold ${t.text}`}>{p.leads.length ? (p.leads.reduce((x, y) => x + y, 0) / p.leads.length).toFixed(0) : '—'}</td>
                      <td className={`p-2 text-right ${t.textMuted}`}>{p.aTn ? `${Math.round((p.aT / p.aTn) * 100)}%` : '—'}</td>
                      <td className={`p-2 text-right ${t.text}`}>{fmt(p.pzsTr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h4 className={`text-sm font-black mb-1 ${t.text}`}>Atorados — más días sin moverse</h4>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Pedidos que llevan en su etapa más días que el umbral. Clic para ver su rastreo.</p>
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className={`sticky top-0 ${isDark ? 'bg-[#1a1520]' : 'bg-gray-50'}`}><tr className={`text-[9px] uppercase ${t.textMuted}`}>
                  <th className="p-2 text-left">OC</th><th className="p-2 text-left">Proveedor</th><th className="p-2 text-left">Dónde</th><th className="p-2 text-right">Días</th><th className="p-2 text-right">Umbral</th><th className="p-2 text-right">Pzs</th>
                </tr></thead>
                <tbody>
                  {units.filter((u) => u.atorado).sort((a, b) => (b.enEtapa - cfg.umbral[b.etapa]) - (a.enEtapa - cfg.umbral[a.etapa])).slice(0, 200).map((u) => (
                    <tr key={u.key} onClick={() => abrirUnidad(u)} className={`border-t cursor-pointer ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <td className={`p-2 font-bold ${t.text}`}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: TIPOS[u.tipo].c }} />{u.oc}</td><td className={`p-2 ${t.textMuted}`}>{u.prov}</td>
                      <td className={`p-2 ${t.text}`}>{SL[u.etapa]}{u.ubic ? <span className={t.textMuted}> · {u.ubic}</span> : ''}</td>
                      <td className="p-2 text-right font-black text-rose-500">{u.enEtapa.toFixed(0)}</td><td className={`p-2 text-right ${t.textMuted}`}>{cfg.umbral[u.etapa]}</td><td className={`p-2 text-right ${t.text}`}>{fmt(u.pzs)}</td>
                    </tr>
                  ))}
                  {!units.some((u) => u.atorado) && <tr><td colSpan="6" className={`p-6 text-center ${t.textMuted}`}>Sin atorados con los filtros actuales.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </>)}
    </div>
  );
}

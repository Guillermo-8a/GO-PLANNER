// src/modules/ModulePedidos.jsx
// Pedidos (Check Coo): rastreador de OCs. Proveedor → (tránsito internacional → aduana) → PLAN (almacén / cross dock)
// → bodegas regionales · fulfillment · foro fotográfico · ruta → tienda sin entrada → recibido.
// Tres tipos de pedido con ruta propia: importación, nacional y directo a tienda.
// Entrada: CSV con una fila por evento (OC, SKU, ETAPA, FECHA_EVENTO…) o fechas por etapa en columnas.
import { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Download, Trash2, Search, AlertTriangle, Truck, Package, Clock, CheckCircle2, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Settings, X, Store, Wand2, Warehouse as WhIcon, Camera, ShoppingBag, Factory, Activity } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import { lazy, Suspense } from 'react';
import { siteOfKey } from './pedidos/layout';
const Scene3D = lazy(() => import('./pedidos/Scene3D'));

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
const DEF_UMBRAL = { PROVEEDOR: 0, TRANSITO_INT: 35, ADUANA: 7, ALMACEN: 15, CROSSDOCK: 3, BODEGA_REG: 20, FULFILLMENT: 30, FORO: 10, TRANSITO_TDA: 4, TIENDA: 2 };
const BASE_ROUTE = { IMP: ['PROVEEDOR', 'TRANSITO_INT', 'ADUANA', 'CROSSDOCK', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'], NAC: ['PROVEEDOR', 'CROSSDOCK', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'], DIR: ['PROVEEDOR', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'] };
const FINALES = ['BODEGA_REG', 'FULFILLMENT', 'FORO'];
// Umbrales de semáforo (KPIs y halos de nodos) en un solo lugar
const SEMAFORO = { aTiempo: { ok: 90, riesgo: 75 }, leadObjetivo: 30, nodo: { riesgo: 0.05, atorado: 0.2 } };
const BUCKET_SEL = { OO: { key: 'B:OO', stages: ['PROVEEDOR', 'TRANSITO_INT', 'ADUANA'], titulo: 'On order' }, INP: { key: 'XD', stages: ['CROSSDOCK'], titulo: 'PLAN · Cross dock (in process)' }, TRN: { key: 'B:TRN', stages: ['TRANSITO_TDA'], titulo: 'In transit a tienda' }, BOD: { key: 'B:BOD', stages: ['ALMACEN', 'BODEGA_REG'], titulo: 'Bodegas (PLAN + regionales)' }, FORO: { key: 'FORO', stages: ['FORO'], titulo: 'Foro fotográfico' }, FUL: { key: 'FUL', stages: ['FULFILLMENT'], titulo: 'Fulfillment · E-commerce' }, TDA: { key: 'B:TDA', stages: ['TIENDA'], titulo: 'Tienda sin entrada' } };

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
const stageOf = (v) => {
  const s = norm(v);
  if (!s) return null;
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
      const origen = /IMP/.test(v(r, 'TIPO')) ? 'IMP' : /^\d{4}$/.test(cOc) ? 'DIR' : 'NAC';
      const asig = numv(v(r, 'PZS ASIG'));
      const comp = v(r, 'COMPROMISO');
      const base = {
        oc, pos: '', sku: v(r, 'GOA'), modelo: '', prov: v(r, 'PROVEEDOR') || 'Sin proveedor', marca: v(r, 'MARCA') || '—', seccion: v(r, 'SECCION'), goa: v(r, 'GOA'), origen,
        pzsPed: asig || numv(v(r, 'PZS PEDIDAS')), pzsEv: 0, valor: numv(v(r, 'COSTO ASIG')) || numv(v(r, 'COSTO PEDIDO')), ubic: '', centro: ctr(tienda), zona: norm(v(r, 'ZONA')), cont: '',
        fechaOc: toDate(v(r, 'FCH OC')), fechaComp: comp && !comp.startsWith('1900') ? toDate(comp) : null,
      };
      const add = (etapa, h, pzsEv, ubic) => { const f = toDate(v(r, h)); if (f) ev.push({ ...base, etapa, fecha: f, pzsEv, ubic }); };
      add('PROVEEDOR', 'FCH OC', 0, base.prov);
      if (origen === 'DIR') add('RECIBIDO', 'DT CEDIS', numv(v(r, 'PZS REC CEDIS')), `T${tienda}`);
      else {
        add('ALMACEN', 'DT CEDIS', 0, cOc);
        // Asignado en PLAN después (o antes) de recibir → se trabaja en cross dock desde la fecha más tardía
        const fC = toDate(v(r, 'DT CEDIS')), fP = toDate(v(r, 'DT PLAN'));
        if (fC && fP) ev.push({ ...base, etapa: 'CROSSDOCK', fecha: new Date(Math.max(fC, fP) + 1000), pzsEv: 0, ubic: `${cOc} · asignado` });
      }
      add('TRANSITO_TDA', 'DT SALIDA', numv(v(r, 'PZS SALIDA')), `${cOc} → T${tienda}`);
      add(v(r, 'TIPO DESTINO') === 'BODEGA' ? 'BODEGA_REG' : 'RECIBIDO', 'DT TIENDA', numv(v(r, 'PZS TIENDA')), `T${tienda}`);
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
      marca: g(r, 'marca') || '—', seccion: g(r, 'seccion'), goa: g(r, 'goa'), origen: tipoOf(g(r, 'origen')),
      pzsPed: numv(g(r, 'pzsPed')), pzsEv: numv(g(r, 'pzsEv')), valor: numv(g(r, 'valor')),
      ubic: g(r, 'ubic'), centro: ctr(g(r, 'centro')), zona: norm(g(r, 'zona')), cont: g(r, 'cont'),
      fechaOc: toDate(g(r, 'fechaOc')), fechaComp: toDate(g(r, 'fechaComp')),
    };
    if (!base.oc) return;
    if (cols.etapa != null) {
      const st = stageOf(g(r, 'etapa')) || stageOf(base.ubic);
      const f = toDate(g(r, 'fecha'));
      if (st && f) ev.push({ ...base, etapa: st, fecha: f });
    } else wide.forEach(({ i, st }) => { const f = toDate(r[i]); if (f) ev.push({ ...base, etapa: st, fecha: f }); });
  });
  return { ev, aviso: ev.length ? '' : 'No encontré eventos con etapa y fecha válidas.' };
}

// ─── Datos de prueba ──────────────────────────────────────────────────────────
function demoEventos() {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const provs = [['WEEKEND', 'NAC'], ['FLEXI', 'NAC'], ['ANDREA', 'DIR'], ['SKECHERS', 'IMP'], ['NIKE', 'IMP'], ['CONVERSE', 'IMP'], ['PRICE SHOES', 'DIR'], ['VANS', 'IMP'], ['CKLASS', 'NAC'], ['MIRAMAR', 'NAC']];
  const zonas = { NORTE: 34, CENTRO: 52, BAJIO: 30, OCCIDENTE: 33, SUR: 26, SURESTE: 25 };
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
    const base = { oc, pos: '10', sku: `${goa.slice(0, 3)}${o}`, modelo: `${goa.slice(0, 3)}-${100 + o}`, prov, marca: prov, seccion: 'ZAPATERIA', goa, origen: tipo, pzsPed: pzs, pzsEv: pzs, valor: pzs * (tipo === 'IMP' ? 520 : 310), centro: destino === 'TIENDA' ? centro : '', zona: destino === 'TIENDA' ? zona : '', cont: tipo === 'IMP' ? `MSKU${700000 + o}` : '', fechaOc, fechaComp };
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
      key, oc: f.oc, sku: f.sku, modelo: f.modelo, prov: f.prov, marca: f.marca, seccion: f.seccion, goa: f.goa, centro: list.find((e) => e.centro)?.centro || '',
      zona: list.find((e) => e.zona)?.zona || '', cont: list.find((e) => e.cont)?.cont || '', ciudad: norm(list.filter((e) => e.etapa === 'BODEGA_REG').pop()?.ubic || ''),
      tipo, pzs, pzsRec, valor: Math.max(...list.map((e) => e.valor || 0)), etapa, desde: last.fecha, ubic: last.ubic, enEtapa, at, tramos, eventos: list, route,
      fechaComp, inicio, fin: llegada, lead: llegada ? dias(inicio, llegada) : null,
      // Con proveedor: atorado solo si ya pasó su compromiso + tolerancia (una OC para enero no está atorada hoy).
      // Resto de etapas: días sin moverse desde su último registro > umbral.
      atorado: etapa === 'PROVEEDOR' ? !!(fechaComp && dias(fechaComp, hoy) > (umbral.PROVEEDOR ?? 0)) : etapa !== 'RECIBIDO' && enEtapa > (umbral[etapa] ?? 99),
      // El compromiso es del proveedor: se mide contra la llegada a CEDIS (o al destino si no pasa por CEDIS)
      vencido: !(at.ALMACEN || at.CROSSDOCK || llegada) && fechaComp && hoy > fechaComp,
      aTiempo: fechaComp && (at.ALMACEN || at.CROSSDOCK || llegada) ? (at.ALMACEN || at.CROSSDOCK || llegada) <= new Date(fechaComp.getTime() + DAY - 1) : null,
    });
  });
  return units;
}
const bucketOf = (u) => STAGES[SIDX[u.etapa]].b;

export default function ModulePedidos({ t, isDark, navIcon, navLabel, navDesc }) {
  const [ev, setEv] = useState(() => { try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s ? s.map((e) => ({ ...e, fecha: new Date(e.fecha), fechaOc: e.fechaOc ? new Date(e.fechaOc) : null, fechaComp: e.fechaComp ? new Date(e.fechaComp) : null })) : []; } catch { return []; } });
  const [cfg, setCfg] = useState(() => { try { const c = JSON.parse(localStorage.getItem(LS_CFG) || '{}'); return { ...c, v2: true, umbral: { ...DEF_UMBRAL, ...(c.umbral || {}), ...(c.v2 ? {} : { PROVEEDOR: 0 }) } }; } catch { return { umbral: DEF_UMBRAL }; } });
  const [aviso, setAviso] = useState('');
  const [fProv, setFProv] = useState(''); const [fMarca, setFMarca] = useState(''); const [fTipo, setFTipo] = useState(''); const [fZona, setFZona] = useState('');
  const [fSolo, setFSolo] = useState(''); const [q, setQ] = useState(''); const [fSec, setFSec] = useState('');
  const [hoverTipo, setHoverTipo] = useState(''); const [feedAge, setFeedAge] = useState(''); const [expOC, setExpOC] = useState('');
  const [sel, setSel] = useState(null); // { key, stages:[...], titulo, zona?, ciudad? }
  const [selUnit, setSelUnit] = useState(null);
  const [selTienda, setSelTienda] = useState('');
  const [showCfg, setShowCfg] = useState(false);
  const [play, setPlay] = useState(() => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [zoomCmd, setZoomCmd] = useState({ n: 0, f: 1 });
  const [feedTab, setFeedTab] = useState('mov');
  const [feedOpen, setFeedOpen] = useState(false);
  const [site, setSite] = useState('RED');
  const fileRef = useRef(null);
  const hoy = useMemo(() => new Date(), [ev]);

  // La base real (decenas de miles de líneas) no cabe en localStorage → se guarda en IndexedDB
  const idbReady = useRef(false);
  useEffect(() => { idb('readonly', (st) => st.get('ev')).then((x) => { if (Array.isArray(x) && x.length && !ev.length) setEv(x); }).catch(() => {}).finally(() => { idbReady.current = true; }); }, []);
  useEffect(() => { if (!idbReady.current) return; idb('readwrite', (st) => st.put(ev, 'ev')).catch(() => {}); try { localStorage.removeItem(LS_KEY); if (ev.length) localStorage.setItem('gop_pedidos_has', '1'); else localStorage.removeItem('gop_pedidos_has'); } catch { /* nada */ } }, [ev]);
  useEffect(() => { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch { /* sin espacio */ } }, [cfg]);
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const { ev: x, aviso: a } = parseEventos(decode(rd.result)); setAviso(a); if (x.length) { setEv(x); setSel(null); setSelUnit(null); } };
    rd.readAsArrayBuffer(f); e.target.value = '';
  };

  // Zona de cada tienda: columna ZONA → catálogo cargado aquí → base de Traslados → bloques por número de tienda
  const [zonaCat, setZonaCat] = useState(() => { try { return JSON.parse(localStorage.getItem('gop_pedidos_zonas') || '{}'); } catch { return {}; } });
  const zonaRef = useRef(null);
  const onZonas = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const rows = parseCSV(decode(rd.result)); const h = (rows[0] || []).map(norm);
      const iC = h.findIndex((x) => ['TIENDA', 'CENTRO', 'CENTRO DESTINO', 'SUCURSAL'].includes(x)), iZ = h.findIndex((x) => ['ZONA', 'REGION', 'PLAZA', 'DISTRITO'].includes(x));
      if (iC < 0 || iZ < 0) { setAviso('El catálogo necesita columnas TIENDA (o CENTRO) y ZONA.'); return; }
      const m = {}; rows.slice(1).forEach((r) => { const c = ctr(r[iC]), z = norm(r[iZ]); if (c && z) m[c] = z; });
      setZonaCat(m); setAviso(''); try { localStorage.setItem('gop_pedidos_zonas', JSON.stringify(m)); } catch { /* sin espacio */ }
    };
    rd.readAsArrayBuffer(f); e.target.value = '';
  };
  const zonaTraslados = useMemo(() => { try { const d = JSON.parse(localStorage.getItem('gop_traslados_exc') || 'null'); const m = {}; (d?.rawData || []).forEach((r) => { if (r.centro && r.zona) m[ctr(r.centro)] = norm(r.zona); }); return m; } catch { return {}; } }, []);
  const allUnits = useMemo(() => {
    const us = buildUnits(ev, cfg.umbral, hoy);
    us.forEach((u) => { if (!u.zona && u.centro) u.zona = zonaCat[u.centro] || zonaTraslados[u.centro] || ''; });
    // Sin zona: se agrupan por número de tienda en hasta 6 bloques para que el mapa no quede en un solo edificio
    const sinZ = [...new Set(us.filter((u) => !u.zona && u.centro).map((u) => u.centro))].sort();
    if (sinZ.length) { const k = Math.min(6, Math.ceil(sinZ.length / 8)), tam = Math.ceil(sinZ.length / k), blk = {}; sinZ.forEach((c, i) => { const b = Math.floor(i / tam); blk[c] = `T${sinZ[b * tam]}–${sinZ[Math.min(sinZ.length - 1, b * tam + tam - 1)]}`; }); us.forEach((u) => { if (!u.zona && u.centro) u.zona = blk[u.centro]; }); }
    return us;
  }, [ev, cfg.umbral, hoy, zonaCat, zonaTraslados]);
  const opts = useMemo(() => { const u = (k) => [...new Set(allUnits.map((x) => x[k]).filter(Boolean))].sort(); return { prov: u('prov'), marca: u('marca'), zona: u('zona'), seccion: u('seccion') }; }, [allUnits]);
  const units = useMemo(() => {
    const qq = norm(q);
    return allUnits.filter((u) => (!fProv || u.prov === fProv) && (!fMarca || u.marca === fMarca) && (!fTipo || u.tipo === fTipo) && (!fZona || u.zona === fZona) && (!fSec || u.seccion === fSec)
      && (!fSolo || (fSolo === 'atorado' ? u.atorado : fSolo === 'vencido' ? u.vencido : fSolo === 'activo' ? u.etapa !== 'RECIBIDO' : true))
      && (!qq || norm(`${u.oc} ${u.sku} ${u.modelo} ${u.centro} ${u.cont}`).includes(qq)));
  }, [allUnits, fProv, fMarca, fTipo, fZona, fSec, fSolo, q]);

  const zonas = useMemo(() => { const z = [...new Set(allUnits.map((u) => u.zona).filter(Boolean))].sort(); return z.length ? z.slice(0, 6) : ['TIENDAS']; }, [allUnits]);
  const zonaDe = (u) => (zonas.includes(u.zona) ? u.zona : zonas[zonas.length - 1]);
  const ciudades = useMemo(() => { const c = [...new Set(allUnits.map((u) => u.ciudad).filter(Boolean))].sort(); return c.length ? c.slice(0, 4) : ['REGIONAL']; }, [allUnits]);
  const ciudadDe = (u) => (ciudades.includes(u.ciudad) ? u.ciudad : ciudades[0]);

  // Agregados por llave de nodo
  const agg = useMemo(() => {
    const m = {};
    const add = (k, u) => { const o = (m[k] = m[k] || { n: 0, pzs: 0, ator: 0, maxDias: 0, oc: new Set() }); o.n++; o.oc.add(u.oc); o.ocs = o.oc.size; o.pzs += Math.max(0, u.pzs - u.pzsRec); if (u.atorado) { o.ator++; o.pzsAtor = (o.pzsAtor || 0) + u.pzs; } o.maxDias = Math.max(o.maxDias, u.enEtapa || 0); o.sumDias = (o.sumDias || 0) + (u.enEtapa || 0); };
    units.forEach((u) => {
      add(u.etapa, u);
      if (u.etapa !== 'RECIBIDO') add(`B:${bucketOf(u)}`, u);
      if (['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].includes(u.etapa)) { add(`${u.etapa}|${zonaDe(u)}`, u); add(`${u.etapa}|${zonaDe(u)}|${u.tipo === 'DIR' ? 'DIR' : 'PLAN'}`, u); }
      if (u.etapa === 'BODEGA_REG') add(`BODEGA_REG|${ciudadDe(u)}`, u);
      if (u.etapa === 'PROVEEDOR') add(`PROVEEDOR|${u.tipo}`, u);
    });
    return m;
  }, [units, zonas, ciudades]);
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
  const kpi = useMemo(() => {
    const rec = units.filter((u) => u.lead != null);
    const conComp = units.filter((u) => u.aTiempo != null);
    return {
      ator: units.filter((u) => u.atorado).length, pzsAtor: units.filter((u) => u.atorado).reduce((a, u) => a + u.pzs, 0), valAtor: units.filter((u) => u.atorado).reduce((a, u) => a + (u.valor || 0), 0),
      lead: rec.length ? rec.reduce((a, u) => a + u.lead, 0) / rec.length : null,
      onTime: conComp.length ? conComp.filter((u) => u.aTiempo).length / conComp.length : null,
      vencidos: units.filter((u) => u.vencido).length, ocs: new Set(units.filter((u) => u.etapa !== 'RECIBIDO').map((u) => u.oc)).size,
      // lead de lo recibido en los últimos 7 días vs los 7 anteriores
      lead7: (() => { const a = rec.filter((u) => dias(u.fin, hoy) <= 7); return a.length ? a.reduce((x, u) => x + u.lead, 0) / a.length : null; })(),
      leadPrev: (() => { const a = rec.filter((u) => { const d = dias(u.fin, hoy); return d > 7 && d <= 14; }); return a.length ? a.reduce((x, u) => x + u.lead, 0) / a.length : null; })(),
      pzsTransito: units.filter((u) => u.etapa === 'TRANSITO_TDA').reduce((a, u) => a + u.pzs, 0), valTransito: units.filter((u) => u.etapa === 'TRANSITO_TDA').reduce((a, u) => a + (u.valor || 0), 0),
      // fecha esperada entre hoy y hoy+7 (por día calendario) y aún sin llegar a CEDIS / destino
      vencen7: (() => { const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()), h7 = new Date(h0.getTime() + 8 * DAY); return new Set(units.filter((u) => u.fechaComp && u.fechaComp >= h0 && u.fechaComp < h7 && !(u.at.ALMACEN || u.at.CROSSDOCK || u.fin)).map((u) => u.oc)).size; })(),
      compFuturo: units.some((u) => u.fechaComp && u.fechaComp >= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())),
    };
  }, [units]);
  const leadTipo = useMemo(() => Object.keys(TIPOS).map((tp) => {
    const us = allUnits.filter((u) => u.tipo === tp);
    const tr = {}; us.forEach((u) => Object.entries(u.tramos).forEach(([k, v]) => { (tr[k] = tr[k] || []).push(v); }));
    const seg = BASE_ROUTE[tp].slice(0, -1).flatMap((k) => (k === 'CROSSDOCK' ? ['ALMACEN', 'CROSSDOCK'] : [k])).filter((k) => tr[k]).map((k) => ({ k, v: tr[k].reduce((a, b) => a + b, 0) / tr[k].length }));
    return { tp, seg, total: seg.reduce((a, s) => a + s.v, 0), n: us.length };
  }), [allUnits]);
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
    return units.filter((u) => sel.stages.includes(u.etapa) && (!sel.zona || zonaDe(u) === sel.zona) && (!sel.ciudad || ciudadDe(u) === sel.ciudad) && (!sel.tipo || u.tipo === sel.tipo) && (!selTienda || u.centro === selTienda))
      .sort((a, b) => b.atorado - a.atorado || b.enEtapa - a.enEtapa);
  }, [units, sel, selTienda, zonas, ciudades]);
  const tiendasZona = useMemo(() => {
    if (!sel?.zona) return [];
    const m = {};
    allUnits.filter((u) => zonaDe(u) === sel.zona && u.centro).forEach((u) => { const o = (m[u.centro] = m[u.centro] || { c: u.centro, ruta: 0, sin: 0, rec: 0, ator: 0, pzs: 0 }); if (u.etapa === 'TRANSITO_TDA') o.ruta++; if (u.etapa === 'TIENDA') { o.sin++; o.pzs += u.pzs; } if (u.etapa === 'RECIBIDO') o.rec++; if (u.atorado) o.ator++; });
    return Object.values(m).sort((a, b) => a.c.localeCompare(b.c));
  }, [allUnits, sel, zonas]);

  const camTo = (k) => setSite(k);
  const abrir = (s) => { setSel(s); setSelUnit(null); setSelTienda(''); const k = siteOfKey(s?.key); if (k) setSite(k); };
  // Clic en la escena 3D → selección
  const onPick = (k) => {
    if (k === 'PROV') return abrir({ key: k, stages: ['PROVEEDOR'], titulo: 'Proveedores · On order' });
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
    const H = ['OC', 'SKU', 'MODELO', 'PROVEEDOR', 'MARCA', 'TIPO', 'CENTRO', 'ZONA', 'PIEZAS', 'BUCKET', 'ETAPA_ACTUAL', 'ULTIMO_REGISTRO', 'UBICACION', 'DIAS_EN_ETAPA', 'ATORADO', 'FECHA_COMPROMISO', 'VENCIDO', ...STAGES.map((s) => `DIAS_${s.k}`)];
    const L = [H.join(',')];
    units.forEach((u) => L.push([u.oc, u.sku, u.modelo, u.prov, u.marca, TIPOS[u.tipo].l, u.centro, u.zona, u.pzs, BUCKETS.find((b) => b.k === bucketOf(u))?.l || 'Recibido', SL[u.etapa], u.desde.toISOString().slice(0, 10), u.ubic, (u.enEtapa || 0).toFixed(1), u.atorado ? 'SI' : '', u.fechaComp ? u.fechaComp.toISOString().slice(0, 10) : '', u.vencido ? 'SI' : '', ...STAGES.map((s) => (u.tramos[s.k] != null ? u.tramos[s.k].toFixed(1) : ''))].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Pedidos_rastreo.csv'; a.click();
  };

  const inCls = `px-2 py-1.5 rounded-lg border text-xs ${isDark ? 'bg-[#1a1520] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const selStyle = isDark ? { colorScheme: 'dark' } : undefined;
  const selKey = sel?.key || '';
  const glass = isDark ? 'bg-[#1a1520]/95 border-white/10' : 'bg-white/95 border-gray-200';
  const unit = selUnit ? allUnits.find((u) => u.key === selUnit) : null;
  const pill = (on) => (on ? (isDark ? 'bg-violet-600 border-violet-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : t.cardInner);
  const totPipe = BUCKETS.reduce((a, b) => a + cnt(`B:${b.k}`).pzs, 0) || 1;

  const headerRight = (
    <>
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
      <button onClick={() => fileRef.current?.click()} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}><Upload size={14} /> Cargar CSV</button>
      <input ref={zonaRef} type="file" accept=".csv,.txt" className="hidden" onChange={onZonas} />
      <button onClick={() => zonaRef.current?.click()} title="CSV con TIENDA y ZONA para agrupar las tiendas en el mapa" className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Store size={14} /> Zonas{Object.keys(zonaCat).length ? ` · ${Object.keys(zonaCat).length}` : ''}</button>
      <button onClick={() => { setEv(demoEventos()); setAviso(''); abrir(null); }} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Wand2 size={14} /> Datos de prueba</button>
      {ev.length > 0 && <button onClick={exportar} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Download size={14} /> Exportar</button>}
      {ev.length > 0 && <button onClick={() => { setEv([]); abrir(null); }} className={`p-2 rounded-lg border ${t.cardInner}`} title="Borrar datos"><Trash2 size={14} /></button>}
    </>
  );

  return (
    <div className="p-4 md:p-8">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {aviso && <div className="mb-4 px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs">{aviso}</div>}

      {!ev.length ? (
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

        {/* Filtros */}
        <div className={`rounded-2xl border p-3 mb-3 flex flex-wrap items-center gap-2 ${t.card}`}>
          <div className="relative"><Search size={13} className={`absolute left-2 top-2 ${t.textMuted}`} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OC, SKU, centro, contenedor…" className={`${inCls} pl-7 w-56`} /></div>
          {[['Sección', fSec, setFSec, opts.seccion], ['Proveedor', fProv, setFProv, opts.prov], ['Marca', fMarca, setFMarca, opts.marca], ['Zona', fZona, setFZona, opts.zona]].map(([l, v, s, o]) => (
            <select key={l} value={v} onChange={(e) => s(e.target.value)} className={inCls} style={selStyle}><option value="">{l}: todas</option>{o.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          ))}
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setFTipo('')} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pill(!fTipo)}`}>Todas las rutas</button>
            {Object.entries(TIPOS).map(([k, v]) => <button key={k} onClick={() => setFTipo(fTipo === k ? '' : k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 ${pill(fTipo === k)}`}><span className="w-2 h-2 rounded-full" style={{ background: v.c }} />{v.l}</button>)}
          </div>
          <div className="flex gap-1">
            {[['', 'Todos'], ['activo', 'En camino'], ['atorado', 'Atorados'], ['vencido', 'Vencidos']].map(([k, l]) => <button key={k} onClick={() => setFSolo(k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${pill(fSolo === k)}`}>{l}</button>)}
          </div>
          <button onClick={() => setShowCfg((v) => !v)} className={`ml-auto px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${t.cardInner}`}><Settings size={12} /> Días para atorado</button>
          {showCfg && (
            <div className={`w-full flex flex-wrap gap-3 pt-2 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <p className={`w-full text-[10px] ${t.textMuted}`}>Atorado = lleva más días que el umbral en su etapa actual, contando desde su último registro. <b>Con proveedor</b> es distinto: solo cuenta si ya pasó la fecha compromiso (el número son días de tolerancia), así una OC para enero no sale como atorada hoy.</p>
              {Object.keys(DEF_UMBRAL).map((k) => (
                <label key={k} className={`text-[11px] flex items-center gap-1.5 ${t.textMuted}`}>{SL[k]}
                  <input type="number" min="0" value={cfg.umbral[k] ?? ''} onChange={(e) => setCfg((c) => ({ ...c, umbral: { ...c.umbral, [k]: Math.max(0, Number(e.target.value)) } }))} className={`${inCls} w-14 text-center`} />
                  <span className="opacity-60" title="Promedio histórico / percentil 90">{tramoProm[k] ? `prom ${tramoProm[k].prom.toFixed(1)} · p90 ${tramoProm[k].p90.toFixed(1)}` : ''}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Escena */}
        <div className={`relative rounded-2xl border overflow-hidden ${t.card}`} style={{ height: 720 }}>
          <Suspense fallback={<div className={`absolute inset-0 flex items-center justify-center text-xs ${t.textMuted}`}>Cargando escena 3D…</div>}>
            <Scene3D isDark={isDark} zonas={zonas} ciudades={ciudades} stats={agg} fTipo={hoverTipo || fTipo} semaforo={SEMAFORO} selKey={sel?.key || ''} site={site} panelOpen={!!sel} play={play} onPick={onPick} zoomCmd={zoomCmd} />
          </Suspense>
          <div className={`absolute bottom-3 right-3 text-[10px] pointer-events-none ${t.textMuted} ${sel || unit ? 'hidden' : ''}`}>Arrastra para mover · rueda para zoom · clic derecho para girar</div>

          {/* KPIs flotantes */}
          <div data-hud className={`absolute top-3 left-3 flex flex-wrap gap-2 ${sel ? 'max-w-[calc(100%-470px)]' : 'max-w-[calc(100%-80px)]'}`}>
            {(() => {
              const ot = kpi.onTime != null ? kpi.onTime * 100 : null;
              const otC = ot == null ? '#94A3B8' : ot >= SEMAFORO.aTiempo.ok ? '#22C55E' : ot >= SEMAFORO.aTiempo.riesgo ? '#F59E0B' : '#E5484D';
              const ld = kpi.lead7 ?? kpi.lead, dl = kpi.lead7 != null && kpi.leadPrev != null ? kpi.lead7 - kpi.leadPrev : null;
              const ldC = ld == null ? '#7C5CF0' : ld <= SEMAFORO.leadObjetivo ? '#22C55E' : ld <= SEMAFORO.leadObjetivo * 1.25 ? '#F59E0B' : '#E5484D';
              return [
                { l: 'Atorados', v: fmt(kpi.ator), s: `${fmt(kpi.pzsAtor)} pzs${kpi.valAtor ? ` · $${fk(kpi.valAtor)}` : ''} · clic para ver`, I: AlertTriangle, bad: kpi.ator > 0, f: 'atorado', c: '#E5484D' },
                { l: 'Vencen en 7 días', v: fmt(kpi.vencen7), s: kpi.compFuturo ? 'OCs aún sin llegar a CEDIS' : 'la base no trae compromisos futuros', I: Clock, c: '#F59E0B', f: 'activo' },
                { l: 'En tránsito a tiendas', v: fk(kpi.pzsTransito), s: `pzs${kpi.valTransito ? ` · $${fk(kpi.valTransito)}` : ''}`, I: Truck, c: '#3B82F6', onClick: () => abrir(BUCKET_SEL.TRN) },
                { l: 'Lead time', v: ld != null ? `${ld.toFixed(0)} d` : '—', s: <>obj. {SEMAFORO.leadObjetivo} d{dl != null && <> · <span style={{ color: dl > 0 ? '#E5484D' : '#22C55E', fontWeight: 700 }}>{dl > 0 ? '▲' : '▼'} {Math.abs(dl).toFixed(1)}</span> vs sem. ant.</>}</>, I: Clock, c: ldC },
                { l: 'A tiempo', v: ot != null ? `${ot.toFixed(0)}%` : '—', s: `${kpi.vencidos} vencidos hoy`, I: ot != null && ot < SEMAFORO.aTiempo.riesgo ? AlertTriangle : CheckCircle2, f: 'vencido', c: otC, color: otC },
              ];
            })().map(({ l, v, s, I, bad, f, c, color, onClick }) => (
              <button key={l} onClick={() => (onClick ? onClick() : f && setFSolo(fSolo === f ? '' : f))} className={`text-left ${sel ? 'px-2 py-1.5' : 'px-3 py-2'} rounded-xl border shadow-md flex items-center gap-2.5 ${glass} ${f && fSolo === f ? 'ring-2 ring-violet-500' : ''}`}>
                <span className="p-2 rounded-lg" style={{ background: `${c}1f`, color: c }}><I size={16} /></span>
                <span><span className={`block text-[9px] font-black uppercase tracking-wider ${t.textMuted}`}>{l}</span><span className={`block text-lg font-black leading-tight ${bad ? 'text-rose-500' : t.text}`} style={color ? { color } : undefined}>{v}</span><span className={`block text-[10px] ${t.textMuted}`}>{s}</span></span>
              </button>
            ))}
          </div>
          {/* Leyenda de rutas */}
          <div data-hud className={`absolute left-3 ${sel ? 'top-[150px]' : 'top-[100px]'} rounded-xl border px-3 py-2 shadow-md ${glass}`}>
            <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${t.textMuted}`}>Rutas</div>
            {Object.entries(TIPOS).map(([k, v]) => <button key={k} onMouseEnter={() => setHoverTipo(k)} onMouseLeave={() => setHoverTipo('')} onClick={() => setFTipo(fTipo === k ? '' : k)} className={`flex items-center gap-2 text-[11px] font-bold py-0.5 ${fTipo && fTipo !== k ? 'opacity-40' : ''} ${t.text}`}><span className="w-5 h-1 rounded-full" style={{ background: v.c }} />{v.l} <span className={`font-semibold ${t.textMuted}`}>{(() => { const us = units.filter((u) => u.tipo === k && u.etapa !== 'RECIBIDO'); return `${new Set(us.map((u) => u.oc)).size} OCs · ${fmt(us.length)} líneas · ${fk(us.reduce((a, u) => a + u.pzs - u.pzsRec, 0))} pzs`; })()}</span></button>)}
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
            <div data-hud className={`absolute top-3 right-3 bottom-3 w-[380px] max-w-[calc(100%-24px)] rounded-2xl border shadow-xl flex flex-col ${glass}`}>
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
                </div>
              )}
              {(() => {
                const ks = sel.stages; const us = units.filter((u) => ks.includes(u.etapa) && (!sel.zona || zonaDe(u) === sel.zona) && (!sel.ciudad || ciudadDe(u) === sel.ciudad) && (!sel.tipo || u.tipo === sel.tipo));
                const c = { n: us.length, pzs: us.reduce((a, u) => a + Math.max(0, u.pzs - u.pzsRec), 0), ator: us.filter((u) => u.atorado).length, maxDias: Math.max(0, ...us.map((u) => u.enEtapa || 0)) };
                const tp = ks.length === 1 ? tramoProm[ks[0]] : null;
                return (
                  <div className="px-4 grid grid-cols-4 gap-1.5 mb-2">
                    {[['OCs', fmt(new Set(us.map((u) => u.oc)).size)], ['Piezas', fk(c.pzs)], ['Pzs atoradas', fk(us.filter((u) => u.atorado).reduce((a, u) => a + u.pzs, 0))], ['Costo', `$${fk(us.reduce((a, u) => a + (u.valor || 0), 0))}`], ['Costo atorado', `$${fk(us.filter((u) => u.atorado).reduce((a, u) => a + (u.valor || 0), 0))}`], ['Días prom. aquí', us.length ? (us.reduce((a, u) => a + (u.enEtapa || 0), 0) / us.length).toFixed(1) : '—'], ['SLA (umbral)', ks.length === 1 && cfg.umbral[ks[0]] != null ? `${cfg.umbral[ks[0]]} d` : '—'], ['Máx. días', c.maxDias ? c.maxDias.toFixed(0) : '—']].map(([l, v]) => (
                      <div key={l} className={`rounded-lg border px-2 py-1.5 ${t.cardInner}`}><div className={`text-[8.5px] uppercase font-bold ${t.textMuted}`}>{l}</div><div className={`text-sm font-black ${(l === 'Pzs atoradas' || l === 'Costo atorado') && c.ator ? 'text-rose-500' : t.text}`}>{v}</div></div>
                    ))}
                  </div>
                );
              })()}
              {(() => {
                // Top 10 OCs más atrasadas del nodo (agrupadas por OC)
                const m = {};
                nodeUnits.filter((u) => u.atorado || u.vencido).forEach((u) => { const o = (m[u.oc] = m[u.oc] || { oc: u.oc, prov: u.prov, goa: u.goa || u.modelo || u.sku, pzs: 0, comp: u.fechaComp, dias: 0, u }); o.pzs += u.pzs; const d = u.etapa === 'PROVEEDOR' && u.fechaComp ? dias(u.fechaComp, hoy) : u.enEtapa - (cfg.umbral[u.etapa] ?? 0); if (d > o.dias) { o.dias = d; o.u = u; } });
                const top = Object.values(m).sort((a, b) => b.dias - a.dias).slice(0, 10);
                const exp = () => { const H = ['OC', 'PROVEEDOR', 'SECCION', 'GOA', 'TIENDA', 'TIPO', 'ETAPA', 'PIEZAS', 'DIAS_EN_ETAPA', 'ATORADO', 'COMPROMISO']; const L = [H.join(',')]; nodeUnits.forEach((u) => L.push([u.oc, u.prov, u.seccion, u.goa, u.centro, TIPOS[u.tipo].l, SL[u.etapa], u.pzs, (u.enEtapa || 0).toFixed(1), u.atorado ? 'SI' : '', u.fechaComp ? u.fechaComp.toISOString().slice(0, 10) : ''].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = `Pedidos_${(sel.titulo || 'nodo').replace(/[^\w]+/g, '_')}.csv`; a.click(); };
                return (
                  <div className="px-4 mb-2">
                    <div className={`text-[9px] font-black uppercase tracking-wider mb-1 flex justify-between items-center ${t.textMuted}`}><span title="Días de atraso contra la fecha esperada (compromiso); fuera de proveedor, días en el nodo por encima del SLA">Top 10 · atraso vs compromiso / umbral</span><button onClick={exp} className="flex items-center gap-1 normal-case font-bold hover:underline"><Download size={11} /> CSV del nodo</button></div>
                    {top.length === 0 ? <p className={`text-[10px] ${t.textMuted}`}>Sin OCs atrasadas aquí.</p> : (
                      <div className={`rounded-lg border max-h-40 overflow-y-auto custom-scrollbar ${t.cardInner}`}>
                        {top.map((o) => <button key={o.oc} onClick={() => setSelUnit(o.u.key)} className={`w-full grid grid-cols-[1fr_auto] gap-1 px-2 py-1 text-left border-b last:border-0 ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}><span className="min-w-0"><span className={`block text-[11px] font-bold truncate ${t.text}`}>{o.oc} · {o.prov}</span><span className={`block text-[9.5px] truncate ${t.textMuted}`}>{o.goa} · {fmt(o.pzs)} pzs{o.comp ? ` · esperada ${fdate(o.comp)}` : ''}</span></span><span className="text-[11px] font-black text-rose-500 self-center">+{Math.max(0, o.dias).toFixed(0)} d</span></button>)}
                      </div>
                    )}
                  </div>
                );
              })()}
              {sel.zona && tiendasZona.length > 0 && (
                <div className="px-4 mb-2">
                  <div className={`text-[9px] font-black uppercase tracking-wider mb-1 flex justify-between ${t.textMuted}`}><span>Tiendas de la zona ({tiendasZona.length})</span>{selTienda && <button onClick={() => setSelTienda('')} className="underline">ver todas</button>}</div>
                  <div className="flex flex-wrap gap-[3px] max-h-24 overflow-y-auto custom-scrollbar">
                    {tiendasZona.map((s) => <button key={s.c} onClick={() => setSelTienda(selTienda === s.c ? '' : s.c)} title={`T${s.c} · ${s.ruta} en ruta · ${s.sin} sin entrada (${fmt(s.pzs)} pzs) · ${s.rec} recibidos${s.ator ? ` · ${s.ator} atorados` : ''}`} className={`w-[18px] h-[18px] rounded-[4px] ${selTienda === s.c ? 'ring-2 ring-offset-1 ring-violet-500' : ''}`} style={{ background: s.ator ? '#E5484D' : s.sin ? '#F59E0B' : s.ruta ? '#7C5CF0' : s.rec ? '#22C55E' : (isDark ? '#ffffff22' : '#E2E8F0') }} />)}
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
                      <button onClick={() => { setExpOC(expOC === o.oc ? '' : o.oc); if (o.us.length === 1) setSelUnit(o.us[0].key); }} className={`w-full text-left px-2.5 py-2 rounded-lg border ${expOC === o.oc ? (isDark ? 'border-violet-500 bg-violet-500/10' : 'border-blue-400 bg-blue-50') : `border-transparent ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-black flex items-center gap-1.5 ${t.text}`}><span className="w-2 h-2 rounded-full" style={{ background: TIPOS[o.tipo].c }} />OC {o.oc}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.ator ? 'bg-rose-500/15 text-rose-500' : (isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>{o.max.toFixed(0)} d en nodo</span>
                        </div>
                        <div className={`text-[10px] ${t.textMuted}`}>{o.prov} · {o.goa} · {o.us.length} {o.us.length === 1 ? 'tienda' : 'tiendas'} · {fmt(o.pzs)} pzs{o.ator ? ` · ${o.ator} atoradas` : ''}</div>
                      </button>
                      {expOC === o.oc && o.us.length > 1 && (
                        <div className={`ml-4 pl-2 border-l ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                          {o.us.sort((a, b) => b.enEtapa - a.enEtapa).map((u) => (
                            <button key={u.key} onClick={() => setSelUnit(u.key)} className={`w-full flex justify-between text-[10.5px] px-2 py-1 rounded ${selUnit === u.key ? (isDark ? 'bg-violet-500/15' : 'bg-blue-50') : (isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50')}`}>
                              <span className={t.text}>{u.centro ? `T${u.centro}` : '—'} · {fmt(u.pzs)} pzs</span>
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
                    <div className={`text-[10px] ${t.textMuted}`}>{u.prov} · {u.modelo || u.sku} · {fmt(u.pzs)} pzs{u.centro ? ` · T${u.centro}` : ''}{sel.stages.length > 1 ? ` · ${STAGES[SIDX[u.etapa]].short}` : ''}{u.vencido ? ' · vencido' : ''}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Movimientos recientes / atorados */}
          {!sel && !unit && !feedOpen && (
            <button data-hud onClick={() => setFeedOpen(true)} className={`absolute left-3 bottom-3 px-3 py-2 rounded-xl border shadow-md text-[11px] font-bold flex items-center gap-2 ${glass} ${t.text}`}><Clock size={13} /> Movimientos{kpi.ator ? <span className="text-rose-500">· {kpi.ator} atorados</span> : ''}</button>
          )}
          {!sel && !unit && feedOpen && (
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

          {/* Rastreo de la OC */}
          {unit && (
            <div data-hud className={`absolute left-3 bottom-3 rounded-2xl border shadow-xl p-4 ${glass} ${sel ? 'right-[404px]' : 'right-3'} max-lg:right-3`}>
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <div className={`text-sm font-black flex items-center gap-2 flex-wrap ${t.text}`}><Truck size={15} /> OC {unit.oc}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${TIPOS[unit.tipo].c}22`, color: TIPOS[unit.tipo].c }}>{TIPOS[unit.tipo].l}</span>
                    <span className={`text-[10px] font-bold ${t.textMuted}`}>{unit.prov} · {unit.modelo || unit.sku} · {fmt(unit.pzs)} pzs{unit.cont ? ` · ${unit.cont}` : ''}{unit.centro ? ` · T${unit.centro}` : ''}</span></div>
                  <div className={`text-[11px] ${t.textMuted}`}>Último registro: <b className={unit.atorado ? 'text-rose-500' : ''}>{SL[unit.etapa]}</b> · {fdate(unit.desde)}{unit.ubic ? ` · ${unit.ubic}` : ''}{unit.etapa !== 'RECIBIDO' ? ` · lleva ${(unit.enEtapa || 0).toFixed(1)} días` : ''}{unit.fechaComp ? ` · compromiso ${fdate(unit.fechaComp)}` : ''}{unit.vencido ? ' · vencido' : ''}</div>
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

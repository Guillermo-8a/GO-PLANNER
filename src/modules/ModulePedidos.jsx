// src/modules/ModulePedidos.jsx
// Pedidos (Check Coo): rastreador de OCs. Proveedor → (tránsito internacional → aduana) → PLAN (almacén / cross dock)
// → bodegas regionales · fulfillment · foro fotográfico · ruta → tienda sin entrada → recibido.
// Tres tipos de pedido con ruta propia: importación, nacional y directo a tienda.
// Entrada: CSV con una fila por evento (OC, SKU, ETAPA, FECHA_EVENTO…) o fechas por etapa en columnas.
import { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Download, Trash2, Search, AlertTriangle, Truck, Package, Clock, CheckCircle2, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Settings, X, Store, Wand2, Warehouse as WhIcon, Camera, ShoppingBag, Factory, Activity } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import { P, pts, quad, Box, faceL, faceR, Warehouse, TruckSprite, Ship, Tree, Pallet, Forklift, MapPin } from './pedidos/iso';

const LS_KEY = 'gop_pedidos';
const LS_CFG = 'gop_pedidos_cfg';
const DAY = 864e5;

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
const DEF_UMBRAL = { PROVEEDOR: 30, TRANSITO_INT: 35, ADUANA: 7, ALMACEN: 15, CROSSDOCK: 3, BODEGA_REG: 20, FULFILLMENT: 30, FORO: 10, TRANSITO_TDA: 4, TIENDA: 2 };
const BASE_ROUTE = { IMP: ['PROVEEDOR', 'TRANSITO_INT', 'ADUANA', 'CROSSDOCK', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'], NAC: ['PROVEEDOR', 'CROSSDOCK', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'], DIR: ['PROVEEDOR', 'TRANSITO_TDA', 'TIENDA', 'RECIBIDO'] };
const FINALES = ['BODEGA_REG', 'FULFILLMENT', 'FORO'];
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
      atorado: etapa !== 'RECIBIDO' && enEtapa > (umbral[etapa] ?? 99),
      vencido: !llegada && fechaComp && hoy > fechaComp, aTiempo: llegada && fechaComp ? llegada <= fechaComp : null,
    });
  });
  return units;
}
const bucketOf = (u) => STAGES[SIDX[u.etapa]].b;

// ─── Escena: posiciones de mundo ──────────────────────────────────────────────
const N = {
  PROV: { x: -1, y: -9.2, w: 3.4, d: 2.6, h: 1.4 },
  ADUANA: { x: -0.6, y: 1.8, w: 2.8, d: 2.1, h: 1.2 },
  ALM: { x: 8.2, y: -2.8, w: 4.8, d: 4, h: 2.1 },
  XD: { x: 13.8, y: -2.4, w: 3.4, d: 3.6, h: 1.35 },
  FORO: { x: 8.4, y: -8.6, w: 2.4, d: 2, h: 1.25 },
  FUL: { x: 12.6, y: -8.8, w: 3.6, d: 2.3, h: 1.45 },
};
const XV1 = 6, XV2 = 20.5, XDIR = 27.2, YTOP = -12, YFAC = -5.6, YLOW = 4.9;

export default function ModulePedidos({ t, isDark, navIcon, navLabel, navDesc }) {
  const C = isDark
    ? { ground: '#17131F', plate: '#211B2C', grass: '#1F2B25', grass2: '#22332A', road: '#38314A', line: '#7D7594', pad: '#2A2337', padLine: '#E0BB3E', water: '#16324A', water2: '#1D4060', roof: '#6D4FD8', roof2: '#3B82F6', text: '#EDEBF2', sub: '#A9A2B8', card: '#241E2F', cardB: '#3B3350', tree: '#3E8E5A' }
    : { ground: '#E9EEF7', plate: '#F3F6FB', grass: '#DDEBD8', grass2: '#D2E5CC', road: '#CFD8E6', line: '#FFFFFF', pad: '#E4E9F1', padLine: '#F2B705', water: '#BFDDF6', water2: '#A8D0F2', roof: '#2F6BE8', roof2: '#3B82F6', text: '#1E2A44', sub: '#5B6680', card: '#FFFFFF', cardB: '#D5DDEB', tree: '#5DBB7A' };
  const [ev, setEv] = useState(() => { try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s ? s.map((e) => ({ ...e, fecha: new Date(e.fecha), fechaOc: e.fechaOc ? new Date(e.fechaOc) : null, fechaComp: e.fechaComp ? new Date(e.fechaComp) : null })) : []; } catch { return []; } });
  const [cfg, setCfg] = useState(() => { try { const c = JSON.parse(localStorage.getItem(LS_CFG) || '{}'); return { ...c, umbral: { ...DEF_UMBRAL, ...(c.umbral || {}) } }; } catch { return { umbral: DEF_UMBRAL }; } });
  const [aviso, setAviso] = useState('');
  const [fProv, setFProv] = useState(''); const [fMarca, setFMarca] = useState(''); const [fTipo, setFTipo] = useState(''); const [fZona, setFZona] = useState('');
  const [fSolo, setFSolo] = useState(''); const [q, setQ] = useState('');
  const [sel, setSel] = useState(null); // { key, stages:[...], titulo, zona?, ciudad? }
  const [selUnit, setSelUnit] = useState(null);
  const [selTienda, setSelTienda] = useState('');
  const [showCfg, setShowCfg] = useState(false);
  const [zoom, setZoom] = useState(1.3); const [pan, setPan] = useState([0, 0]);
  const [play, setPlay] = useState(true);
  const [tick, setTick] = useState(0);
  const [feedTab, setFeedTab] = useState('mov');
  const fileRef = useRef(null); const drag = useRef(null);
  const hoy = useMemo(() => new Date(), [ev]);

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(ev)); } catch { /* base grande */ } }, [ev]);
  useEffect(() => { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch { /* sin espacio */ } }, [cfg]);
  useEffect(() => {
    if (!play) return undefined;
    let raf, last = 0;
    const loop = (ts) => { if (ts - last > 33) { setTick(ts / 1000); last = ts; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [play]);

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const { ev: x, aviso: a } = parseEventos(decode(rd.result)); setAviso(a); if (x.length) { setEv(x); setSel(null); setSelUnit(null); } };
    rd.readAsArrayBuffer(f); e.target.value = '';
  };

  const allUnits = useMemo(() => buildUnits(ev, cfg.umbral, hoy), [ev, cfg.umbral, hoy]);
  const opts = useMemo(() => { const u = (k) => [...new Set(allUnits.map((x) => x[k]).filter(Boolean))].sort(); return { prov: u('prov'), marca: u('marca'), zona: u('zona') }; }, [allUnits]);
  const units = useMemo(() => {
    const qq = norm(q);
    return allUnits.filter((u) => (!fProv || u.prov === fProv) && (!fMarca || u.marca === fMarca) && (!fTipo || u.tipo === fTipo) && (!fZona || u.zona === fZona)
      && (!fSolo || (fSolo === 'atorado' ? u.atorado : fSolo === 'vencido' ? u.vencido : fSolo === 'activo' ? u.etapa !== 'RECIBIDO' : true))
      && (!qq || norm(`${u.oc} ${u.sku} ${u.modelo} ${u.centro} ${u.cont}`).includes(qq)));
  }, [allUnits, fProv, fMarca, fTipo, fZona, fSolo, q]);

  const zonas = useMemo(() => { const z = [...new Set(allUnits.map((u) => u.zona).filter(Boolean))].sort(); return z.length ? z.slice(0, 6) : ['TIENDAS']; }, [allUnits]);
  const zonaDe = (u) => (zonas.includes(u.zona) ? u.zona : zonas[zonas.length - 1]);
  const ciudades = useMemo(() => { const c = [...new Set(allUnits.map((u) => u.ciudad).filter(Boolean))].sort(); return c.length ? c.slice(0, 4) : ['REGIONAL']; }, [allUnits]);
  const ciudadDe = (u) => (ciudades.includes(u.ciudad) ? u.ciudad : ciudades[0]);

  // Agregados por llave de nodo
  const agg = useMemo(() => {
    const m = {};
    const add = (k, u) => { const o = (m[k] = m[k] || { n: 0, pzs: 0, ator: 0, maxDias: 0 }); o.n++; o.pzs += Math.max(0, u.pzs - u.pzsRec); if (u.atorado) o.ator++; o.maxDias = Math.max(o.maxDias, u.enEtapa || 0); };
    units.forEach((u) => {
      add(u.etapa, u);
      if (u.etapa !== 'RECIBIDO') add(`B:${bucketOf(u)}`, u);
      if (['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].includes(u.etapa)) { add(`${u.etapa}|${zonaDe(u)}`, u); add(`${u.etapa}|${zonaDe(u)}|${u.tipo === 'DIR' ? 'DIR' : 'PLAN'}`, u); }
      if (u.etapa === 'BODEGA_REG') add(`BODEGA_REG|${ciudadDe(u)}`, u);
      if (u.etapa === 'PROVEEDOR') add(`PROVEEDOR|${u.tipo}`, u);
    });
    return m;
  }, [units, zonas, ciudades]);
  const cnt = (k) => agg[k] || { n: 0, pzs: 0, ator: 0, maxDias: 0 };

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
      ator: units.filter((u) => u.atorado).length, pzsAtor: units.filter((u) => u.atorado).reduce((a, u) => a + u.pzs, 0),
      lead: rec.length ? rec.reduce((a, u) => a + u.lead, 0) / rec.length : null,
      onTime: conComp.length ? conComp.filter((u) => u.aTiempo).length / conComp.length : null,
      vencidos: units.filter((u) => u.vencido).length, ocs: new Set(units.filter((u) => u.etapa !== 'RECIBIDO').map((u) => u.oc)).size,
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
    return units.filter((u) => sel.stages.includes(u.etapa) && (!sel.zona || zonaDe(u) === sel.zona) && (!sel.ciudad || ciudadDe(u) === sel.ciudad) && (!selTienda || u.centro === selTienda))
      .sort((a, b) => b.atorado - a.atorado || b.enEtapa - a.enEtapa);
  }, [units, sel, selTienda, zonas, ciudades]);
  const tiendasZona = useMemo(() => {
    if (!sel?.zona) return [];
    const m = {};
    allUnits.filter((u) => zonaDe(u) === sel.zona && u.centro).forEach((u) => { const o = (m[u.centro] = m[u.centro] || { c: u.centro, ruta: 0, sin: 0, rec: 0, ator: 0, pzs: 0 }); if (u.etapa === 'TRANSITO_TDA') o.ruta++; if (u.etapa === 'TIENDA') { o.sin++; o.pzs += u.pzs; } if (u.etapa === 'RECIBIDO') o.rec++; if (u.atorado) o.ator++; });
    return Object.values(m).sort((a, b) => a.c.localeCompare(b.c));
  }, [allUnits, sel, zonas]);

  const abrir = (s) => { setSel(s); setSelUnit(null); setSelTienda(''); };
  const abrirUnidad = (u) => { abrir({ key: '', stages: [u.etapa], titulo: SL[u.etapa], zona: ['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].includes(u.etapa) ? zonaDe(u) : undefined, ciudad: u.etapa === 'BODEGA_REG' ? ciudadDe(u) : undefined }); setSelUnit(u.key); };
  const exportar = () => {
    const H = ['OC', 'SKU', 'MODELO', 'PROVEEDOR', 'MARCA', 'TIPO', 'CENTRO', 'ZONA', 'PIEZAS', 'BUCKET', 'ETAPA_ACTUAL', 'ULTIMO_REGISTRO', 'UBICACION', 'DIAS_EN_ETAPA', 'ATORADO', 'FECHA_COMPROMISO', 'VENCIDO', ...STAGES.map((s) => `DIAS_${s.k}`)];
    const L = [H.join(',')];
    units.forEach((u) => L.push([u.oc, u.sku, u.modelo, u.prov, u.marca, TIPOS[u.tipo].l, u.centro, u.zona, u.pzs, BUCKETS.find((b) => b.k === bucketOf(u))?.l || 'Recibido', SL[u.etapa], u.desde.toISOString().slice(0, 10), u.ubic, (u.enEtapa || 0).toFixed(1), u.atorado ? 'SI' : '', u.fechaComp ? u.fechaComp.toISOString().slice(0, 10) : '', u.vencido ? 'SI' : '', ...STAGES.map((s) => (u.tramos[s.k] != null ? u.tramos[s.k].toFixed(1) : ''))].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Pedidos_rastreo.csv'; a.click();
  };

  // ─── Escena ────────────────────────────────────────────────────────────────
  const zs = zonas.map((z, i) => ({ z, x: 23.2, y: -1.2 + i * 4 }));
  const cs = ciudades.map((c, i) => ({ c, x: 22.6, y: -15.2 + i * 2.8 }));
  const yBot = Math.max(...zs.map((p) => p.y)) + 3;
  const selKey = sel?.key || '';
  const dim = (k) => (sel && selKey !== k ? 0.82 : 1);
  const hl = (tp) => (!fTipo || fTipo === tp ? 1 : 0.15);

  const pathAt = (path, f) => {
    const seg = []; let L = 0;
    for (let i = 0; i < path.length - 1; i++) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); seg.push(l); L += l; }
    let d = f * L;
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const r = seg[i] ? d / seg[i] : 0; const a = path[i], b = path[i + 1]; return { x: a[0] + (b[0] - a[0]) * r, y: a[1] + (b[1] - a[1]) * r, dir: a[0] !== b[0] ? 'x' : 'y', rev: a[0] !== b[0] ? b[0] < a[0] : b[1] < a[1] }; } d -= seg[i]; }
    const b = path[path.length - 1]; return { x: b[0], y: b[1], dir: 'x', rev: false };
  };
  const PATHS = {
    NAC: [[1.2, YFAC], [XV1, YFAC], [XV1, 1.9], [8.4, 1.9]],
    IMP: [[2.6, YLOW], [XV1, YLOW], [XV1, 1.9], [8.4, 1.9]],
    SHIP: [[-15, 8.6], [-2.2, 8.6]],
    DIR: (zy) => [[-0.4, YFAC], [-2.6, YFAC], [-2.6, YTOP], [XDIR, YTOP], [XDIR, zy + 1.0], [25.9, zy + 1.0]],
    OUT: (zy) => [[15.6, 2.2], [15.6, YLOW], [XV2, YLOW], [XV2, zy + 1.0], [23.0, zy + 1.0]],
    BOD: (cy) => [[15.6, 2.2], [15.6, YLOW], [XV2, YLOW], [XV2, cy + 0.9], [22.4, cy + 0.9]],
    FORO: [[XV1, 1.9], [XV1, YFAC], [9.6, YFAC]],
    FUL: [[XV1, 1.9], [XV1, YFAC], [14.4, YFAC]],
  };
  const roads = [
    [[-2.6, YFAC], [XV1, YFAC]], [[XV1, YFAC], [XV2, YFAC]], [[XV1, YTOP], [XV1, YLOW]], [[1.2, YLOW], [XV2, YLOW]],
    [[XV2, -16], [XV2, yBot]], [[-2.6, YTOP], [-2.6, YFAC]], [[-2.6, YTOP], [XDIR, YTOP]], [[XDIR, YTOP], [XDIR, yBot]],
    [[15.6, 1.6], [15.6, YLOW]],
    ...zs.flatMap((p) => [[[XV2, p.y + 1], [23.1, p.y + 1]], [[25.6, p.y + 1], [XDIR, p.y + 1]]]),
    ...cs.map((p) => [[XV2, p.y + 0.9], [22.5, p.y + 0.9]]),
  ];
  const roadPoly = ([a, b], w = 1.05) => {
    const [x1, y1] = a, [x2, y2] = b;
    if (x1 === x2) { const y0 = Math.min(y1, y2) - w / 2, y3 = Math.max(y1, y2) + w / 2; return quad(x1 - w / 2, y0, x1 + w / 2, y3); }
    const x0 = Math.min(x1, x2) - w / 2, x3 = Math.max(x1, x2) + w / 2; return quad(x0, y1 - w / 2, x3, y1 + w / 2);
  };
  const routeLine = (path, color, key, op = 1) => <polyline key={key} points={pts(path.map(([x, y]) => P(x, y, 0.02)))} fill="none" stroke={color} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" strokeDashoffset={-tick * 14} opacity={0.85 * op} />;

  const items = []; const overlay = [];
  const push = (depth, el) => items.push({ depth, el });
  const label = (key, x, y, z, txt, sub, onClick, active, color) => {
    const [sx, sy] = P(x, y, z);
    const w = Math.max(txt.length * 6.4, (sub || '').length * 5.2) + 26;
    overlay.push(
      <g key={key} transform={`translate(${sx},${sy})`} onClick={onClick} style={{ cursor: 'pointer' }}>
        <rect x={-w / 2 + 1} y={-35} width={w} height={sub ? 33 : 22} rx="9" fill="#0F172A" opacity="0.08" />
        <rect x={-w / 2} y={-37} width={w} height={sub ? 33 : 22} rx="9" fill={active ? (isDark ? '#3A2F55' : '#EEF3FF') : C.card} stroke={active ? color : C.cardB} strokeWidth={active ? 1.6 : 1} />
        <circle cx={-w / 2 + 11} cy={sub ? -27 : -26} r="4" fill={color} />
        <text x={-w / 2 + 19} y={sub ? -23.5 : -22.5} fontSize="10" fontWeight="800" fill={C.text}>{txt}</text>
        {sub && <text x={-w / 2 + 11} y="-10" fontSize="8.5" fill={C.sub}>{sub}</text>}
      </g>,
    );
  };
  const palletsAt = (key, x0, y0, pzs, alert, cols = 3) => {
    const n = pzs > 0 ? Math.min(14, Math.max(1, Math.round(Math.log2(pzs / 60 + 1) * 2.4))) : 0;
    for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols) % 2, l = Math.floor(i / (cols * 2)); const x = x0 + c * 0.66, y = y0 + r * 0.66; push(x + y + 0.6, <Pallet key={`${key}${i}`} x={x} y={y} z={l * 0.44} alert={alert} />); }
  };
  const pinIf = (key, c, x, y, z) => { if (c.ator) overlay.push(<MapPin key={key} x={x} y={y} z={z} n={c.ator} color="#E5484D" t={tick} />); };

  // Suelo
  const ground = [];
  ground.push(<polygon key="plate" points={quad(-16, -17, 30, yBot + 2)} fill={C.plate} />);
  ground.push(<polygon key="g1" points={quad(-5, -16.5, 5, -6.8)} fill={C.grass} />);
  ground.push(<polygon key="g2" points={quad(7.2, -16.5, 19.6, -10)} fill={C.grass} />);
  ground.push(<polygon key="g3" points={quad(7.2, 5.8, 19.6, yBot + 1)} fill={C.grass2} />);
  ground.push(<polygon key="g4" points={quad(21.3, -16.5, 26.4, -4)} fill={C.grass} opacity="0.7" />);
  ground.push(<polygon key="water" points={quad(-16, 6.4, 5.2, yBot + 2)} fill={C.water} />);
  for (let i = 0; i < 7; i++) {
    const yy = 7.4 + i * 1.3, off = ((tick * 0.6 + i * 0.37) % 1) * 3;
    const [a, b] = [P(-14 + off + (i % 2) * 2, yy, 0), P(-11 + off + (i % 2) * 2, yy, 0)];
    ground.push(<line key={`wv${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.water2} strokeWidth="2" strokeLinecap="round" opacity="0.9" />);
    const [c2, d2] = [P(-6 + off, yy + 0.5, 0), P(-3.5 + off, yy + 0.5, 0)];
    ground.push(<line key={`wvb${i}`} x1={c2[0]} y1={c2[1]} x2={d2[0]} y2={d2[1]} stroke={C.water2} strokeWidth="2" strokeLinecap="round" opacity="0.7" />);
  }
  ground.push(<polygon key="quay" points={quad(-3.4, 0.6, 5.2, 6.4)} fill={C.pad} />);
  ground.push(<polygon key="quayEdge" points={pts([P(-3.4, 6.4, 0), P(5.2, 6.4, 0), P(5.2, 6.4, -0.3), P(-3.4, 6.4, -0.3)])} fill={isDark ? '#3A3350' : '#B9C3D3'} />);
  ground.push(<polygon key="padPlan" points={quad(7.2, -4, 19.4, 3.8)} fill={C.pad} />);
  ground.push(<polygon key="padNorth" points={quad(7.6, -10, 17, -6.6)} fill={C.pad} />);
  ground.push(<polygon key="padProv" points={quad(-2.4, -10.6, 3.6, -6.4)} fill={C.pad} />);
  for (let i = 0; i < 10; i++) { const x = 8.4 + i * 1.05; const [a, b] = [P(x, 2.4, 0.01), P(x, 3.6, 0.01)]; ground.push(<line key={`pk${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.padLine} strokeWidth="1.4" opacity="0.8" />); }
  { const [a, b] = [P(8.4, 2.4, 0.01), P(18.9, 2.4, 0.01)]; ground.push(<line key="pkl" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.padLine} strokeWidth="1.4" opacity="0.8" />); }
  const shadow = (n, k) => ground.push(<polygon key={`sh${k}`} points={pts([P(n.x + n.w, n.y, 0), P(n.x + n.w + n.h * 0.9, n.y + n.h * 0.3, 0), P(n.x + n.w + n.h * 0.9, n.y + n.d + n.h * 0.3, 0), P(n.x + n.w, n.y + n.d, 0)])} fill="#0F172A" opacity="0.10" />);
  Object.entries(N).forEach(([k, n]) => shadow(n, k));
  zs.forEach((p, i) => shadow({ x: p.x, y: p.y, w: 2.4, d: 1.9, h: 1.1 }, `z${i}`));
  cs.forEach((p, i) => shadow({ x: p.x, y: p.y, w: 2.4, d: 1.8, h: 1.1 }, `c${i}`));

  // ── Proveedores (fábrica con techo dentado)
  {
    const n = N.PROV, c = cnt('PROVEEDOR'), key = 'PROV', click = () => abrir({ key, stages: ['PROVEEDOR'], titulo: 'Proveedores · On order' });
    const g = [<Box key="b" x={n.x} y={n.y} w={n.w} d={n.d} h={n.h} c={isDark ? '#5A5470' : '#AEB8C9'} left={isDark ? '#3A3550' : '#C9D1DE'} right={isDark ? '#4A4462' : '#E3E8F0'} top={isDark ? '#6A6488' : '#B7C1D2'} />];
    for (let i = 0; i < 4; i++) {
      const x0 = n.x + i * (n.w / 4);
      g.push(<polygon key={`st${i}`} points={pts([P(x0, n.y, n.h), P(x0, n.y + n.d, n.h), P(x0 + n.w / 4, n.y + n.d, n.h + 0.55), P(x0 + n.w / 4, n.y, n.h + 0.55)])} fill={isDark ? '#7A6FA8' : '#8FA2C0'} stroke="rgba(15,23,42,0.12)" />);
      g.push(<polygon key={`sg${i}`} points={pts([P(x0 + n.w / 4, n.y, n.h), P(x0 + n.w / 4, n.y + n.d, n.h), P(x0 + n.w / 4, n.y + n.d, n.h + 0.55), P(x0 + n.w / 4, n.y, n.h + 0.55)])} fill={isDark ? '#E0BB3E' : '#D5E6FA'} opacity="0.85" />);
    }
    g.push(<Box key="ch" x={n.x + 0.3} y={n.y + 0.2} w={0.5} d={0.5} h={n.h + 1.6} c={isDark ? '#7B7090' : '#9AA4B6'} />);
    g.push(<Box key="ch2" x={n.x + 0.28} y={n.y + 0.18} z={n.h + 1.45} w={0.54} d={0.54} h={0.15} c="#E5484D" />);
    [0, 1, 2, 3].forEach((i) => { const ph = (tick * 0.35 + i / 4) % 1; const [sx, sy] = P(n.x + 0.55, n.y + 0.45, n.h + 1.7 + ph * 1.8); g.push(<circle key={`sm${i}`} cx={sx + ph * 14} cy={sy} r={4 + ph * 8} fill={isDark ? '#8C86A0' : '#D4D9E2'} opacity={0.8 * (1 - ph)} />); });
    for (let i = 0; i < 3; i++) g.push(<polygon key={`w${i}`} points={faceL(n.y + n.d, n.x + 0.5 + i, n.x + 1.1 + i, 0.45, 0.95)} fill={isDark ? '#E0BB3E' : '#BFD6F6'} />);
    push(n.x + n.y + n.w / 2 + n.d / 2, <g key={key} onClick={click} style={{ cursor: 'pointer' }} opacity={dim(key)}>{g}</g>);
    palletsAt('pp', n.x + 0.2, n.y + n.d + 0.4, c.pzs, c.ator > 0, 4);
    label('lprov', n.x + n.w / 2, n.y + n.d / 2, n.h + 2.3, 'Proveedores', c.n ? `${c.n} OCs · ${fk(c.pzs)} pzs on order` : 'Sin OCs abiertas', click, selKey === key, '#64748B');
    pinIf('pinprov', c, n.x + n.w, n.y + n.d / 2, n.h + 0.6);
  }
  // ── Puerto / Aduana
  {
    const n = N.ADUANA, c = cnt('ADUANA'), key = 'ADU', click = () => abrir({ key, stages: ['ADUANA'], titulo: 'Aduana · Puerto' });
    push(n.x + n.y + 1.8, <g key={key} onClick={click} style={{ cursor: 'pointer' }} opacity={dim(key)}><Warehouse x={n.x} y={n.y} w={n.w} d={n.d} h={n.h} roof="#E2A93B" doors={2} dark={isDark} logo="ADUANA" rh={0.4} windows={false} /></g>);
    const cols = ['#2BB3A8', '#E5484D', '#3B6FE0', '#F2A900', '#7C5CF0', '#2BB3A8', '#3B6FE0', '#E5484D'];
    for (let i = 0; i < 8; i++) { const r = i % 2, l = Math.floor(i / 4); const x = 2.7, y = 1.4 + r * 0.72 + (i % 4 >= 2 ? 1.6 : 0); push(x + y + 0.5 + l * 0.01, <Box key={`ct${i}`} x={x} y={y} z={l * 0.62} w={1.9} d={0.66} h={0.6} c={cols[i]} stroke="rgba(0,0,0,0.22)" />); }
    const gx = -1.6, gy = 5.6; const legs = [[gx, gy], [gx + 2.6, gy], [gx, gy - 1.2], [gx + 2.6, gy - 1.2]];
    push(gx + gy + 1.6, <g key="crane">{legs.map(([x, y], i) => <Box key={i} x={x} y={y} w={0.14} d={0.14} h={2.6} c="#F2A900" />)}<Box x={gx} y={gy - 1.2} z={2.6} w={2.74} d={1.34} h={0.18} c="#F2A900" /><Box x={gx + 0.8 + Math.sin(tick * 0.6) * 0.7} y={gy - 0.9} z={2.2} w={0.5} d={0.7} h={0.35} c="#3A3A44" /></g>);
    palletsAt('pa', 3.2, 4.6, c.pzs * 0.4, c.ator > 0, 3);
    label('ladu', n.x + n.w / 2, n.y + n.d / 2, n.h + 1.7, 'Aduana · Puerto', c.n ? `${c.n} OCs · ${fk(c.pzs)} pzs` : 'Sin OCs en aduana', click, selKey === key, '#E2A93B');
    pinIf('pinadu', c, n.x + n.w, n.y + n.d / 2, n.h + 0.5);
    const cT = cnt('TRANSITO_INT');
    if (cT.n) label('lmar', -8, 9.2, 1.6, 'Tránsito marítimo', `${cT.n} OCs · ${fk(cT.pzs)} pzs`, () => abrir({ key: 'MAR', stages: ['TRANSITO_INT'], titulo: 'Tránsito internacional' }), selKey === 'MAR', '#14B8A6');
    pinIf('pinmar', cT, -6, 9.2, 0.9);
  }
  // ── PLAN: almacén + cross dock
  {
    const a = N.ALM, x = N.XD, cA = cnt('ALMACEN'), cX = cnt('CROSSDOCK');
    const clickA = () => abrir({ key: 'ALM', stages: ['ALMACEN'], titulo: 'PLAN · Almacén' });
    const clickX = () => abrir(BUCKET_SEL.INP);
    push(a.x + a.y + a.w / 2 + a.d / 2, <g key="ALM" onClick={clickA} style={{ cursor: 'pointer' }} opacity={dim('ALM')}><Warehouse x={a.x} y={a.y} w={a.w} d={a.d} h={a.h} roof={C.roof} doors={4} dark={isDark} logo="PLAN" /></g>);
    push(x.x + x.y + x.w / 2 + x.d / 2, <g key="XD" onClick={clickX} style={{ cursor: 'pointer' }} opacity={dim('XD')}><Warehouse x={x.x} y={x.y} w={x.w} d={x.d} h={x.h} roof="#7C5CF0" doors={3} dark={isDark} rh={0.35} logo="XD" /></g>);
    push(a.x + a.y + 0.2, <g key="rack">{[0, 1, 2].map((l) => <Box key={l} x={a.x + 0.2} y={a.y - 1.0} z={l * 0.55} w={2.2} d={0.6} h={0.06} c="#E5484D" />)}{[0, 1, 2].map((l) => [0, 1, 2].map((i) => <Box key={`${l}${i}`} x={a.x + 0.3 + i * 0.7} y={a.y - 0.95} z={l * 0.55 + 0.06} w={0.5} d={0.48} h={0.36} c={C.roof2} />))}</g>);
    palletsAt('pal', a.x + 0.3, a.y + a.d + 0.35, cA.pzs, cA.ator > 0, 5);
    palletsAt('pxd', x.x + 0.2, x.y + x.d + 0.35, cX.pzs, cX.ator > 0, 4);
    const f1 = (Math.sin(tick * 0.9) + 1) / 2, f2 = (Math.sin(tick * 0.7 + 2) + 1) / 2;
    push(a.x + 2 + a.y + a.d + 1.7, <Forklift key="fk1" x={a.x + 0.4 + f1 * 3} y={a.y + a.d + 1.55} carrying={f1 > 0.5} rev={Math.cos(tick * 0.9) < 0} />);
    push(x.x + x.y + x.d + 1.9, <Forklift key="fk2" x={x.x + 0.2 + f2 * 2.2} y={x.y + x.d + 1.65} carrying={f2 < 0.5} rev={Math.cos(tick * 0.7 + 2) > 0} />);
    [[9.2, 'NAC', cA.n > 0], [11.4, 'IMP', cA.n > 1], [14.5, 'NAC', cX.n > 0], [16.6, 'IMP', cX.n > 1]].forEach(([px, tp, on], i) => { if (on) push(px + 3.1, <TruckSprite key={`dock${i}`} x={px} y={3.05} dir="y" rev color={TIPOS[tp].c} dark={isDark} />); });
    label('lalm', a.x + a.w / 2, a.y + a.d / 2, a.h + 1.9, 'PLAN · Almacén', cA.n ? `${cA.n} OCs · ${fk(cA.pzs)} pzs en bodega` : 'Sin inventario', clickA, selKey === 'ALM', C.roof);
    label('lxd', x.x + x.w / 2, x.y + x.d / 2, x.h + 1.6, 'PLAN · Cross dock', cX.n ? `${cX.n} OCs · ${fk(cX.pzs)} pzs in process` : 'Sin proceso', clickX, selKey === 'XD', '#7C5CF0');
    pinIf('pinalm', cA, a.x + a.w, a.y + a.d / 2, a.h + 0.7);
    pinIf('pinxd', cX, x.x + x.w, x.y + x.d / 2, x.h + 0.5);
  }
  // ── Foro fotográfico
  {
    const n = N.FORO, c = cnt('FORO'), key = 'FORO', click = () => abrir(BUCKET_SEL.FORO);
    const flash = Math.sin(tick * 2.3) > 0.92;
    const [cx, cy] = P(n.x + 1.2, n.y + n.d, 0.8);
    push(n.x + n.y + n.w / 2 + n.d / 2, <g key={key} onClick={click} style={{ cursor: 'pointer' }} opacity={dim(key)}>
      <Box x={n.x} y={n.y} w={n.w} d={n.d} h={n.h} c="#F4F6FB" left={isDark ? '#2C2640' : '#E6EAF2'} right={isDark ? '#363050' : '#F4F6FB'} top={isDark ? '#5B3F6E' : '#F9A8D4'} />
      <polygon points={faceL(n.y + n.d, n.x + 0.3, n.x + 2.1, 0.55, 1.05)} fill="#EC4899" />
      <rect x={cx - 11} y={cy - 8} width="22" height="14" rx="3" fill="#fff" /><circle cx={cx} cy={cy - 1} r="4.5" fill="#EC4899" /><circle cx={cx} cy={cy - 1} r="2" fill="#fff" />
      <polygon points={faceL(n.y + n.d, n.x + 1.6, n.x + 2.2, 0, 0.45)} fill={isDark ? '#3A3050' : '#BFD3F2'} />
      {flash && (() => { const [fx, fy] = P(n.x + n.w / 2, n.y + n.d / 2, n.h + 0.3); return <circle cx={fx} cy={fy} r="18" fill="#fff" opacity="0.7" />; })()}
    </g>);
    [[n.x - 0.6, n.y + 0.4], [n.x - 0.6, n.y + 1.6]].forEach(([fx, fy], i) => push(fx + fy, <g key={`lamp${i}`}><Box x={fx} y={fy} w={0.06} d={0.06} h={0.9} c="#6B7280" /><Box x={fx - 0.12} y={fy - 0.12} z={0.9} w={0.3} d={0.3} h={0.22} c="#1F2430" /></g>));
    label('lforo', n.x + n.w / 2, n.y + n.d / 2, n.h + 1.4, 'Foro fotográfico', c.n ? `${c.n} OCs · ${fk(c.pzs)} pzs` : 'Sin muestras', click, selKey === key, '#EC4899');
    pinIf('pinforo', c, n.x + n.w, n.y + n.d / 2, n.h + 0.4);
  }
  // ── Fulfillment
  {
    const n = N.FUL, c = cnt('FULFILLMENT'), key = 'FUL', click = () => abrir(BUCKET_SEL.FUL);
    push(n.x + n.y + n.w / 2 + n.d / 2, <g key={key} onClick={click} style={{ cursor: 'pointer' }} opacity={dim(key)}><Warehouse x={n.x} y={n.y} w={n.w} d={n.d} h={n.h} roof="#14B8A6" doors={2} dark={isDark} logo="E-COM" rh={0.4} /></g>);
    const bx = n.x + n.w + 0.2, by = n.y + 0.6;
    push(bx + by + 1.5, <g key="belt"><Box x={bx} y={by} w={2.4} d={0.5} h={0.35} c="#4B5563" />{[0, 1, 2, 3].map((i) => { const u = ((tick * 0.35 + i / 4) % 1) * 2.1; return <Box key={i} x={bx + u} y={by + 0.08} z={0.35} w={0.32} d={0.32} h={0.26} c="#E2B57A" />; })}</g>);
    label('lful', n.x + n.w / 2, n.y + n.d / 2, n.h + 1.6, 'Fulfillment', c.n ? `${c.n} OCs · ${fk(c.pzs)} pzs` : 'Sin inventario', click, selKey === key, '#14B8A6');
    pinIf('pinful', c, n.x + n.w, n.y + n.d / 2, n.h + 0.5);
  }
  // ── Bodegas regionales
  cs.forEach(({ c: ciudad, x, y }, i) => {
    const c = cnt(`BODEGA_REG|${ciudad}`), key = `CIU|${ciudad}`, click = () => abrir({ key, stages: ['BODEGA_REG'], ciudad, titulo: ciudad === 'REGIONAL' ? 'Bodegas regionales' : `Bodega ${ciudad}` });
    push(x + y + 2, <g key={key} onClick={click} style={{ cursor: 'pointer' }} opacity={dim(key)}><Warehouse x={x} y={y} w={2.4} d={1.8} h={1.1} roof="#0EA5E9" doors={2} dark={isDark} rh={0.35} windows={false} /></g>);
    palletsAt(`pc${i}`, x + 2.7, y + 0.2, c.pzs, c.ator > 0, 2);
    label(`lc${i}`, x + 1.2, y + 0.9, 1.9, ciudad === 'REGIONAL' ? 'Bodegas regionales' : `Bodega ${ciudad[0]}${ciudad.slice(1).toLowerCase()}`, c.n ? `${c.n} OCs · ${fk(c.pzs)} pzs` : 'Sin inventario', click, selKey === key, '#0EA5E9');
    pinIf(`pinc${i}`, c, x + 2.4, y + 0.9, 1.4);
  });
  // ── Zonas de tiendas
  zs.forEach(({ z, x, y }, i) => {
    const cT = cnt(`TIENDA|${z}`), cR = cnt(`RECIBIDO|${z}`), cRu = cnt(`TRANSITO_TDA|${z}`), key = `Z|${z}`;
    const click = () => abrir({ key, stages: ['TIENDA'], zona: z, titulo: z === 'TIENDAS' ? 'Tiendas' : `Zona ${z}` });
    const w = 2.4, d = 1.9, h = 1.05;
    const stripes = [];
    for (let k = 0; k < 6; k++) { const u0 = x + 0.1 + k * ((w - 0.2) / 6), u1 = u0 + (w - 0.2) / 6; stripes.push(<polygon key={k} points={pts([P(u0, y + d, h * 0.72), P(u1, y + d, h * 0.72), P(u1, y + d + 0.35, h * 0.5), P(u0, y + d + 0.35, h * 0.5)])} fill={k % 2 ? '#fff' : '#7C5CF0'} />); }
    push(x + y + 2.2, <g key={key} onClick={click} style={{ cursor: 'pointer' }} opacity={dim(key)}>
      <Box x={x} y={y} w={w} d={d} h={h} c="#F4F6FB" left={isDark ? '#2C2640' : '#E8ECF3'} right={isDark ? '#363050' : '#F7F9FC'} top={isDark ? '#4A4266' : '#DDE3EE'} />
      <Box x={x - 0.05} y={y - 0.05} z={h} w={w + 0.1} d={d + 0.1} h={0.2} c="#E0BB3E" />
      <polygon points={faceL(y + d, x + 0.25, x + 1.0, 0, 0.62)} fill={isDark ? '#3A3050' : '#BFD3F2'} />
      <polygon points={faceL(y + d, x + 1.25, x + 2.15, 0.12, 0.62)} fill={isDark ? '#3A3050' : '#BFD3F2'} />
      {stripes}
      <polygon points={faceR(x + w, y + 0.3, y + 1.6, 0.55, 0.85)} fill="#7C5CF0" />
    </g>);
    palletsAt(`pz${i}`, x - 1.4, y + 0.1, cT.pzs, cT.ator > 0, 2);
    label(`lz${i}`, x + w / 2, y + d / 2, h + 1.3, z === 'TIENDAS' ? 'Tiendas' : `Zona ${z}`, `${cRu.n} en ruta · ${fk(cT.pzs)} pzs sin entrada · ${cR.n} recibidos`, click, selKey === key, '#F59E0B');
    pinIf(`pinz${i}`, cT, x + w, y + d / 2, h + 0.3);
  });
  // ── Decoración
  [[-4, -14], [-3.6, -8], [3.8, -12.5], [4.2, -2.5], [2.8, -1.8], [8, -12.5], [11, -13.4], [15, -12.8], [18.5, -13.4], [9, 7.5], [12, 8.6], [16, 7.2], [18.6, 10.4], [24.6, -4.6], [-4.6, -3], [21.2, 15]].forEach(([x, y], i) => push(x + y, <Tree key={`tr${i}`} x={x} y={y} s={0.8 + ((i * 37) % 10) / 25} color={C.tree} />));
  [[10.2, '#E5484D'], [12.3, '#F4F6FB'], [13.4, '#3B82F6']].forEach(([px, col], i) => push(px + 6.8, <Box key={`car${i}`} x={px} y={6.4} w={0.45} d={0.8} h={0.3} c={col} />));

  // ── Rutas y vehículos
  const routeOverlay = [routeLine(PATHS.SHIP, TIPOS.IMP.c, 'rship', hl('IMP')), routeLine(PATHS.IMP, TIPOS.IMP.c, 'rimp', hl('IMP')), routeLine(PATHS.NAC, TIPOS.NAC.c, 'rnac', hl('NAC'))];
  zs.forEach((p, i) => { routeOverlay.push(routeLine(PATHS.DIR(p.y), TIPOS.DIR.c, `rdir${i}`, hl('DIR'))); routeOverlay.push(routeLine(PATHS.OUT(p.y), '#7C5CF0', `rout${i}`, fTipo === 'DIR' ? 0.15 : 0.8)); });
  const nShip = Math.min(3, cnt('TRANSITO_INT').n);
  for (let i = 0; i < nShip; i++) { const fr = ((tick * 0.025) + i / nShip) % 1; const p = pathAt(PATHS.SHIP, fr); push(p.x + p.y + 1, <g key={`ship${i}`} opacity={hl('IMP')} onClick={() => abrir({ key: 'MAR', stages: ['TRANSITO_INT'], titulo: 'Tránsito internacional' })} style={{ cursor: 'pointer' }}><Ship x={p.x - 2} y={p.y - 0.55} bob={Math.sin(tick * 1.5 + i)} /></g>); }
  const lane = (key, path, n, speed, color, op, cont, onClick) => { for (let i = 0; i < n; i++) { const fr = ((tick * speed) + i / n) % 1; const p = pathAt(path, fr); push(p.x + p.y + 0.5, <g key={`${key}${i}`} opacity={op} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}><TruckSprite x={p.x} y={p.y} dir={p.dir} rev={p.rev} color={color} cont={cont} dark={isDark} /></g>); } };
  lane('timp', PATHS.IMP, Math.min(3, cnt('ADUANA').n), 0.045, TIPOS.IMP.c, hl('IMP'), '#2BB3A8');
  lane('tnac', PATHS.NAC, Math.min(3, Math.ceil(cnt('PROVEEDOR|NAC').n / 6)), 0.04, TIPOS.NAC.c, hl('NAC'));
  if (cnt('FORO').n) lane('tforo', PATHS.FORO, 1, 0.05, '#EC4899', 1);
  if (cnt('FULFILLMENT').n) lane('tful', PATHS.FUL, 1, 0.04, '#14B8A6', 1);
  cs.forEach((p, i) => { if (cnt(`BODEGA_REG|${p.c}`).n) lane(`tb${i}`, PATHS.BOD(p.y), 1, 0.03 + i * 0.004, '#0EA5E9', 1); });
  zs.forEach((p, i) => {
    const ab = () => abrir({ key: `Z|${p.z}`, stages: ['TRANSITO_TDA'], zona: p.z, titulo: p.z === 'TIENDAS' ? 'Tiendas' : `Zona ${p.z}` });
    lane(`to${i}`, PATHS.OUT(p.y), Math.min(3, cnt(`TRANSITO_TDA|${p.z}|PLAN`).n), 0.05 + i * 0.003, '#7C5CF0', fTipo === 'DIR' ? 0.15 : 1, undefined, ab);
    lane(`td${i}`, PATHS.DIR(p.y), Math.min(2, cnt(`TRANSITO_TDA|${p.z}|DIR`).n), 0.025 + i * 0.002, TIPOS.DIR.c, hl('DIR'), undefined, ab);
  });
  items.sort((a, b) => a.depth - b.depth);

  // viewBox
  const corners = [P(-16, -17), P(-16, yBot + 2), P(30, -17), P(30, yBot + 2), P(30, -17, 4), P(-16, -17, 4)];
  const minX = Math.min(...corners.map((c) => c[0])) + 40, maxX = Math.max(...corners.map((c) => c[0])) - 40;
  const minY = Math.min(...corners.map((c) => c[1])) + 60, maxY = Math.max(...corners.map((c) => c[1])) - 40;
  const vbW = (maxX - minX) / zoom, vbH = (maxY - minY) / zoom;
  const vb = `${minX + (maxX - minX - vbW) / 2 - pan[0]} ${minY + (maxY - minY - vbH) / 2 - pan[1]} ${vbW} ${vbH}`;

  const inCls = `px-2 py-1.5 rounded-lg border text-xs ${isDark ? 'bg-[#1a1520] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const selStyle = isDark ? { colorScheme: 'dark' } : undefined;
  const glass = isDark ? 'bg-[#1a1520]/95 border-white/10' : 'bg-white/95 border-gray-200';
  const unit = selUnit ? allUnits.find((u) => u.key === selUnit) : null;
  const pill = (on) => (on ? (isDark ? 'bg-violet-600 border-violet-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : t.cardInner);
  const totPipe = BUCKETS.reduce((a, b) => a + cnt(`B:${b.k}`).pzs, 0) || 1;

  const headerRight = (
    <>
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
      <button onClick={() => fileRef.current?.click()} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}><Upload size={14} /> Cargar CSV</button>
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
              <div className={`text-[10px] ${t.textMuted}`}>{c.n} OCs{c.ator ? <span className="text-rose-500 font-bold"> · {c.ator} atorados</span> : ''}</div>
              <div className="h-1 rounded-full mt-1.5" style={{ background: isDark ? '#ffffff14' : '#eef1f6' }}><div className="h-1 rounded-full" style={{ width: `${(c.pzs / totPipe) * 100}%`, background: b.c }} /></div>
            </button>
          ); })}
        </div>

        {/* Filtros */}
        <div className={`rounded-2xl border p-3 mb-3 flex flex-wrap items-center gap-2 ${t.card}`}>
          <div className="relative"><Search size={13} className={`absolute left-2 top-2 ${t.textMuted}`} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OC, SKU, centro, contenedor…" className={`${inCls} pl-7 w-56`} /></div>
          {[['Proveedor', fProv, setFProv, opts.prov], ['Marca', fMarca, setFMarca, opts.marca], ['Zona', fZona, setFZona, opts.zona]].map(([l, v, s, o]) => (
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
          <svg viewBox={vb} className="w-full h-full select-none" style={{ background: C.ground, cursor: drag.current ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, p: pan }; }}
            onMouseMove={(e) => { if (!drag.current) return; const k = vbW / e.currentTarget.clientWidth; setPan([drag.current.p[0] + (e.clientX - drag.current.x) * k, drag.current.p[1] + (e.clientY - drag.current.y) * k]); }}
            onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
            onWheel={(e) => setZoom((z) => Math.min(3.5, Math.max(0.6, z * (e.deltaY < 0 ? 1.1 : 0.9))))}>
            <defs>
              <radialGradient id="pedVignette" cx="50%" cy="45%" r="70%"><stop offset="60%" stopColor={C.ground} stopOpacity="0" /><stop offset="100%" stopColor={isDark ? '#000' : '#9FB0CC'} stopOpacity={isDark ? 0.5 : 0.25} /></radialGradient>
            </defs>
            {ground}
            {roads.map((r, i) => <polygon key={`rd${i}`} points={roadPoly(r)} fill={C.road} />)}
            {roads.map((r, i) => { const [a, b] = r; const [x1, y1] = P(...a, 0.01), [x2, y2] = P(...b, 0.01); return <line key={`ln${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth="1.3" strokeDasharray="7 8" opacity="0.9" />; })}
            {routeOverlay}
            {items.map((it) => it.el)}
            {overlay}
            {!isDark && [0, 1, 2].map((i) => { const x = ((tick * 6 + i * 420) % 1600) - 600 + minX; const y = minY + 60 + i * 140; return <g key={`cl${i}`} opacity="0.55" style={{ pointerEvents: 'none' }}><ellipse cx={x} cy={y} rx="60" ry="16" fill="#fff" /><ellipse cx={x + 30} cy={y - 10} rx="34" ry="14" fill="#fff" /></g>; })}
            <rect x={minX - 2000} y={minY - 2000} width="6000" height="6000" fill="url(#pedVignette)" style={{ pointerEvents: 'none' }} />
          </svg>

          {/* KPIs flotantes */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-2 max-w-[60%]">
            {[
              { l: 'Atorados', v: fmt(kpi.ator), s: `${fmt(kpi.pzsAtor)} pzs`, I: AlertTriangle, bad: kpi.ator > 0, f: 'atorado', c: '#E5484D' },
              { l: 'OCs activas', v: fmt(kpi.ocs), s: `${fmt(units.length)} líneas`, I: Package, c: '#3B82F6' },
              { l: 'Lead time OC → destino', v: kpi.lead != null ? `${kpi.lead.toFixed(0)} d` : '—', s: 'promedio de lo recibido', I: Clock, c: '#7C5CF0' },
              { l: 'A tiempo', v: kpi.onTime != null ? `${(kpi.onTime * 100).toFixed(0)}%` : '—', s: `${kpi.vencidos} vencidos hoy`, I: CheckCircle2, f: 'vencido', c: '#14B8A6' },
            ].map(({ l, v, s, I, bad, f, c }) => (
              <button key={l} onClick={() => f && setFSolo(fSolo === f ? '' : f)} className={`text-left px-3 py-2 rounded-xl border shadow-md flex items-center gap-2.5 ${glass}`}>
                <span className="p-2 rounded-lg" style={{ background: `${c}1f`, color: c }}><I size={16} /></span>
                <span><span className={`block text-[9px] font-black uppercase tracking-wider ${t.textMuted}`}>{l}</span><span className={`block text-lg font-black leading-tight ${bad ? 'text-rose-500' : t.text}`}>{v}</span><span className={`block text-[10px] ${t.textMuted}`}>{s}</span></span>
              </button>
            ))}
          </div>
          {/* Leyenda de rutas */}
          <div className={`absolute left-3 top-[92px] rounded-xl border px-3 py-2 shadow-md ${glass}`}>
            <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${t.textMuted}`}>Rutas</div>
            {Object.entries(TIPOS).map(([k, v]) => <button key={k} onClick={() => setFTipo(fTipo === k ? '' : k)} className={`flex items-center gap-2 text-[11px] font-bold py-0.5 ${fTipo && fTipo !== k ? 'opacity-40' : ''} ${t.text}`}><span className="w-5 h-1 rounded-full" style={{ background: v.c }} />{v.l} <span className={t.textMuted}>{units.filter((u) => u.tipo === k && u.etapa !== 'RECIBIDO').length}</span></button>)}
            <div className={`flex items-center gap-2 text-[11px] font-bold py-0.5 ${t.text}`}><span className="w-5 h-1 rounded-full bg-violet-500" />PLAN → tiendas</div>
          </div>
          {/* Controles */}
          <div className={`absolute top-3 right-3 flex flex-col gap-1 rounded-xl border p-1 shadow-md ${glass} ${sel ? 'lg:right-[394px]' : ''}`}>
            <button onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))} className="p-1.5"><ZoomIn size={15} /></button>
            <button onClick={() => setZoom((z) => Math.max(0.6, z / 1.2))} className="p-1.5"><ZoomOut size={15} /></button>
            <button onClick={() => { setZoom(1.3); setPan([0, 0]); }} className="p-1.5"><RotateCcw size={15} /></button>
            <button onClick={() => setPlay((p) => !p)} className="p-1.5" title={play ? 'Pausar animación' : 'Reanudar'}>{play ? <Pause size={15} /> : <Play size={15} />}</button>
          </div>

          {/* Panel del nodo */}
          {sel && (
            <div className={`absolute top-3 right-3 bottom-3 w-[380px] max-w-[calc(100%-24px)] rounded-2xl border shadow-xl flex flex-col ${glass}`}>
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
                const ks = sel.stages; const us = units.filter((u) => ks.includes(u.etapa) && (!sel.zona || zonaDe(u) === sel.zona) && (!sel.ciudad || ciudadDe(u) === sel.ciudad));
                const c = { n: us.length, pzs: us.reduce((a, u) => a + Math.max(0, u.pzs - u.pzsRec), 0), ator: us.filter((u) => u.atorado).length, maxDias: Math.max(0, ...us.map((u) => u.enEtapa || 0)) };
                const tp = ks.length === 1 ? tramoProm[ks[0]] : null;
                return (
                  <div className="px-4 grid grid-cols-3 gap-1.5 mb-2">
                    {[['Pedidos', fmt(c.n)], ['Piezas', fk(c.pzs)], ['Atorados', fmt(c.ator)], ['Máx. días', c.maxDias ? c.maxDias.toFixed(0) : '—'], ['Prom. hist.', tp ? `${tp.prom.toFixed(1)} d` : '—'], ['Umbral', ks.length === 1 && cfg.umbral[ks[0]] != null ? `${cfg.umbral[ks[0]]} d` : '—']].map(([l, v]) => (
                      <div key={l} className={`rounded-lg border px-2 py-1.5 ${t.cardInner}`}><div className={`text-[8.5px] uppercase font-bold ${t.textMuted}`}>{l}</div><div className={`text-sm font-black ${l === 'Atorados' && c.ator ? 'text-rose-500' : t.text}`}>{v}</div></div>
                    ))}
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
                {nodeUnits.slice(0, 300).map((u) => (
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
          {!sel && !unit && (
            <div className={`absolute left-3 bottom-3 w-[330px] max-w-[calc(100%-24px)] rounded-2xl border shadow-xl p-3 ${glass}`}>
              <div className="flex gap-1 mb-2">
                {[['mov', 'Movimientos recientes'], ['ator', `Atorados ${kpi.ator}`]].map(([k, l]) => <button key={k} onClick={() => setFeedTab(k)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${pill(feedTab === k)}`}>{l}</button>)}
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {(feedTab === 'mov' ? feed.map(({ u, e }) => ({ u, txt: SL[e.etapa], when: hace(e.fecha, hoy) })) : units.filter((u) => u.atorado).sort((a, b) => b.enEtapa - a.enEtapa).slice(0, 12).map((u) => ({ u, txt: `${STAGES[SIDX[u.etapa]].short} · ${u.enEtapa.toFixed(0)} d`, when: `umbral ${cfg.umbral[u.etapa]} d` }))).map(({ u, txt, when }) => (
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
            <div className={`absolute left-3 bottom-3 rounded-2xl border shadow-xl p-4 ${glass} ${sel ? 'right-[404px]' : 'right-3'} max-lg:right-3`}>
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

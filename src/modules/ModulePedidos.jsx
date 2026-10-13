// src/modules/ModulePedidos.jsx
// Pedidos (Check Coo): rastreador de OCs de proveedor → aduana → CEDIS → PLAN → tienda → entrada.
// Entrada: CSV con una fila por evento (OC, SKU, ETAPA, FECHA_EVENTO…) o con fechas por etapa en columnas
// (FECHA_ADUANA, FECHA_CEDIS…). Salida: escena isométrica animada (dónde está cada pedido), atorados,
// tiempos por tramo y línea de tiempo por OC.
import { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Download, Trash2, Search, AlertTriangle, Truck, Package, Clock, CheckCircle2, ZoomIn, ZoomOut, RotateCcw, Play, Pause, Settings, X, Store, Wand2 } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';

const LS_KEY = 'gop_pedidos';
const LS_CFG = 'gop_pedidos_cfg';
const DAY = 864e5;

// ─── Etapas ───────────────────────────────────────────────────────────────────
const STAGES = [
  { k: 'PROVEEDOR', l: 'Proveedor', short: 'Prov.' },
  { k: 'TRANSITO_INT', l: 'Tránsito internacional', short: 'Tránsito' },
  { k: 'ADUANA', l: 'Aduana', short: 'Aduana' },
  { k: 'CEDIS', l: 'CEDIS', short: 'CEDIS' },
  { k: 'PLAN', l: 'PLAN', short: 'PLAN' },
  { k: 'TRANSITO_TDA', l: 'Ruta a tienda', short: 'Ruta' },
  { k: 'TIENDA', l: 'En tienda sin entrada', short: 'Sin entrada' },
  { k: 'RECIBIDO', l: 'Recibido', short: 'Recibido' },
];
const SIDX = Object.fromEntries(STAGES.map((s, i) => [s.k, i]));
const SL = Object.fromEntries(STAGES.map((s) => [s.k, s.l]));
const DEF_UMBRAL = { PROVEEDOR: 30, TRANSITO_INT: 35, ADUANA: 7, CEDIS: 5, PLAN: 3, TRANSITO_TDA: 4, TIENDA: 2 };
const routeOf = (origen) => STAGES.map((s) => s.k).filter((k) => origen === 'IMP' || (k !== 'TRANSITO_INT' && k !== 'ADUANA'));

const norm = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
const stageOf = (v) => {
  const s = norm(v);
  if (!s) return null;
  if (/RECIB|ENTRADA|REGISTR|\bGR\b|INGRES/.test(s)) return 'RECIBIDO';
  if (/SIN ENTRADA|LLEGADA TIENDA|EN TIENDA|ENTREGAD|TIENDA/.test(s)) return 'TIENDA';
  if (/RUTA|SALIDA|TRANSITO T|ENVIAD|DESPACH|EMBARQUE T/.test(s)) return 'TRANSITO_TDA';
  if (/PLAN|CROSS|DISTRIBU|SURTID/.test(s)) return 'PLAN';
  if (/CEDIS|BODEGA|ALMAC|CD\b/.test(s)) return 'CEDIS';
  if (/ADUAN|PEDIMENT|LIBERA|PUERTO|DESADUAN/.test(s)) return 'ADUANA';
  if (/TRANSITO|MARITIM|EMBARC|NAVIER|ZARP|CONTENED|INTERNAC/.test(s)) return 'TRANSITO_INT';
  if (/PROV|FABRIC|COLOCAD|\bOC\b|ORDEN|CONFIRM|PRODUC/.test(s)) return 'PROVEEDOR';
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
const fdate = (d) => (d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—');
const dias = (a, b) => (a && b ? (b - a) / DAY : null);
const ctr = (v) => { const s = String(v ?? '').trim(); return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s; };

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
  origen: ['ORIGEN', 'IMP NAC', 'TIPO', 'IMPORTACION', 'TIPO OC'],
  pzsPed: ['PIEZAS PEDIDAS', 'PZS PEDIDAS', 'CANTIDAD PEDIDA', 'PEDIDAS', 'CANTIDAD OC'],
  pzsEv: ['PIEZAS EVENTO', 'PIEZAS', 'PZS', 'CANTIDAD', 'UNIDADES'],
  valor: ['VALOR', 'IMPORTE', 'MONTO', 'COSTO'],
  etapa: ['ETAPA', 'ESTATUS', 'STATUS', 'EVENTO', 'ESTADO'],
  ubic: ['UBICACION', 'LUGAR', 'LOCACION'],
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
function parseEventos(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { ev: [], aviso: 'El archivo no trae filas.' };
  const { cols, n, used } = mapCols(rows[0]);
  if (cols.oc == null) return { ev: [], aviso: `No encontré la columna OC/PEDIDO. Leí: ${rows[0].slice(0, 12).join(', ')}` };
  // Formato ancho: columnas FECHA <ETAPA>
  const wide = cols.etapa == null ? n.map((h, i) => (!used.has(i) && /^(FECHA|F) /.test(h) ? { i, st: stageOf(h.replace(/^(FECHA|F) /, '')) } : null)).filter((x) => x && x.st) : [];
  if (cols.etapa == null && !wide.length) return { ev: [], aviso: 'Falta ETAPA (o columnas FECHA_ADUANA, FECHA_CEDIS…).' };
  const g = (r, k) => (cols[k] != null ? String(r[cols[k]] ?? '').trim() : '');
  const ev = [];
  rows.slice(1).forEach((r) => {
    const base = {
      oc: g(r, 'oc'), pos: g(r, 'pos'), sku: g(r, 'sku') || g(r, 'modelo'), modelo: g(r, 'modelo'), prov: g(r, 'prov') || 'Sin proveedor',
      marca: g(r, 'marca') || '—', seccion: g(r, 'seccion'), goa: g(r, 'goa'),
      origen: /IMP|INT|EXT/i.test(g(r, 'origen')) ? 'IMP' : /NAC/i.test(g(r, 'origen')) ? 'NAC' : '',
      pzsPed: numv(g(r, 'pzsPed')), pzsEv: numv(g(r, 'pzsEv')), valor: numv(g(r, 'valor')),
      ubic: g(r, 'ubic'), centro: ctr(g(r, 'centro')), zona: g(r, 'zona'), cont: g(r, 'cont'),
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
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const provs = [['WEEKEND', 'NAC'], ['FLEXI', 'NAC'], ['ANDREA', 'NAC'], ['SKECHERS', 'IMP'], ['NIKE', 'IMP'], ['CONVERSE', 'IMP'], ['PRICE SHOES', 'NAC'], ['VANS', 'IMP']];
  const zonas = { NORTE: ['0491', '0510', '0533', '0548'], CENTRO: ['0101', '0122', '0140', '0177', '0190'], BAJIO: ['0301', '0312', '0330'], OCCIDENTE: ['0401', '0418', '0425'], SUR: ['0601', '0615', '0622'] };
  const goas = ['TENIS URBANO', 'CHOCLO', 'BOTA', 'SANDALIA', 'MOCASIN'];
  const dur = { PROVEEDOR: [10, 25], TRANSITO_INT: [22, 35], ADUANA: [2, 12], CEDIS: [1, 7], PLAN: [1, 5], TRANSITO_TDA: [1, 5], TIENDA: [0.2, 4] };
  const now = Date.now(), ev = [];
  for (let o = 0; o < 70; o++) {
    const [prov, origen] = pick(provs); const oc = String(4500100000 + o * 37);
    const zona = pick(Object.keys(zonas)); const centro = pick(zonas[zona]); const goa = pick(goas);
    const route = routeOf(origen);
    const age = 5 + rnd() * (origen === 'IMP' ? 95 : 55);
    let t = now - age * DAY; const fechaOc = new Date(t);
    const total = route.slice(0, -1).reduce((a, k) => a + (dur[k][0] + dur[k][1]) / 2, 0);
    const fechaComp = new Date(t + total * DAY * (0.9 + rnd() * 0.3));
    const pzs = 60 + Math.floor(rnd() * 900);
    const base = { oc, pos: '10', sku: `${goa.slice(0, 3)}${o}`, modelo: `${goa.slice(0, 3)}-${100 + o}`, prov, marca: prov, seccion: 'ZAPATERIA', goa, origen, pzsPed: pzs, pzsEv: pzs, valor: pzs * (origen === 'IMP' ? 520 : 310), centro, zona, cont: origen === 'IMP' ? `MSKU${700000 + o}` : '', fechaOc, fechaComp };
    for (const k of route) {
      if (t > now) break;
      ev.push({ ...base, etapa: k, fecha: new Date(t), ubic: k === 'ADUANA' ? 'Manzanillo' : k === 'CEDIS' ? 'CEDIS Tultitlán' : k === 'PLAN' ? 'PLAN Tultitlán' : k === 'TIENDA' || k === 'RECIBIDO' ? `T${centro}` : '' });
      if (k === 'RECIBIDO') break;
      let d = dur[k][0] + rnd() * (dur[k][1] - dur[k][0]);
      if (rnd() < 0.12) d *= 2.2; // algunos se atoran
      t += d * DAY;
    }
  }
  return ev;
}

// ─── Modelo: unidades rastreables (OC × SKU × centro) ─────────────────────────
function buildUnits(ev, umbral, hoy) {
  const m = new Map();
  ev.forEach((e) => { const k = `${e.oc}|${e.sku}|${e.centro}`; if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
  const units = [];
  m.forEach((list, key) => {
    list.sort((a, b) => a.fecha - b.fecha || SIDX[a.etapa] - SIDX[b.etapa]);
    const f = list[0], last = list[list.length - 1];
    const origen = list.find((e) => e.origen)?.origen || (list.some((e) => e.etapa === 'ADUANA' || e.etapa === 'TRANSITO_INT') ? 'IMP' : 'NAC');
    const pzs = Math.max(...list.map((e) => e.pzsPed || 0), ...list.map((e) => e.pzsEv || 0));
    const pzsRec = list.filter((e) => e.etapa === 'RECIBIDO').reduce((a, e) => a + (e.pzsEv || 0), 0);
    // Primera fecha por etapa y permanencia en cada una (hasta el siguiente evento)
    const at = {}; list.forEach((e) => { if (!at[e.etapa]) at[e.etapa] = e.fecha; });
    const tramos = {};
    for (let i = 0; i < list.length - 1; i++) { if (list[i].etapa !== list[i + 1].etapa) tramos[list[i].etapa] = (tramos[list[i].etapa] || 0) + dias(list[i].fecha, list[i + 1].fecha); }
    const etapa = last.etapa;
    const enEtapa = etapa === 'RECIBIDO' ? 0 : dias(last.fecha, hoy);
    const fechaComp = list.find((e) => e.fechaComp)?.fechaComp || null;
    const inicio = list.find((e) => e.fechaOc)?.fechaOc || f.fecha;
    const fin = at.RECIBIDO || null;
    units.push({
      key, oc: f.oc, sku: f.sku, modelo: f.modelo, prov: f.prov, marca: f.marca, seccion: f.seccion, goa: f.goa, centro: f.centro,
      zona: list.find((e) => e.zona)?.zona || (f.centro ? 'TIENDAS' : 'TIENDAS'), cont: list.find((e) => e.cont)?.cont || '',
      origen, pzs, pzsRec, valor: Math.max(...list.map((e) => e.valor || 0)), etapa, desde: last.fecha, ubic: last.ubic, enEtapa, at, tramos, eventos: list,
      fechaComp, inicio, fin, lead: fin ? dias(inicio, fin) : null,
      atorado: etapa !== 'RECIBIDO' && enEtapa > (umbral[etapa] ?? 99),
      vencido: !fin && fechaComp && hoy > fechaComp, aTiempo: fin && fechaComp ? fin <= fechaComp : null,
    });
  });
  return units;
}

// ─── Isométrico ───────────────────────────────────────────────────────────────
const S = 26;
const P = (x, y, z = 0) => [(x - y) * S * 0.866, (x + y) * S * 0.5 - z * S];
const pts = (arr) => arr.map((p) => p.join(',')).join(' ');
function IsoBox({ x, y, z = 0, w, d, h, top, left, right, stroke = 'rgba(0,0,0,0.08)', onClick, style }) {
  const T = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const R = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  const L = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  return (
    <g onClick={onClick} style={style}>
      <polygon points={pts(L)} fill={left} stroke={stroke} />
      <polygon points={pts(R)} fill={right} stroke={stroke} />
      <polygon points={pts(T)} fill={top} stroke={stroke} />
    </g>
  );
}
// Cara izquierda (y = y+d): rectángulo en coordenadas de la cara (u a lo largo de x, v altura)
const faceL = (x, y, d, u0, u1, v0, v1) => pts([P(x + u0, y + d, v0), P(x + u1, y + d, v0), P(x + u1, y + d, v1), P(x + u0, y + d, v1)]);
const faceR = (x, y, w, u0, u1, v0, v1) => pts([P(x + w, y + u0, v0), P(x + w, y + u1, v0), P(x + w, y + u1, v1), P(x + w, y + u0, v1)]);

const PAL = {
  light: { ground: '#E8EEF8', grass: '#DCE8D5', road: '#C9D3E3', line: '#FFFFFF', bTop: '#3B6FE0', bL: '#2F5BC2', bR: '#4A80F0', wall: '#EEF2F9', wall2: '#DDE4F0', box: '#E2B57A', boxL: '#C9975A', boxR: '#EDC48E', tree: '#5DBB7A', text: '#1E2A44' },
  dark: { ground: '#1B1724', grass: '#1E2A22', road: '#3A3350', line: '#8A82A0', bTop: '#6D4FD8', bL: '#5238B0', bR: '#7C5CF0', wall: '#2E2840', wall2: '#262036', box: '#C99A5E', boxL: '#A97C45', boxR: '#D9AE76', tree: '#3E8E5A', text: '#EDEBF2' },
};

// Posiciones del mundo
const NODES = {
  PROVEEDOR: { x: 0, y: 0, w: 3.2, d: 2.6, h: 1.6, l: 'Proveedores' },
  ADUANA: { x: 8, y: 0, w: 3, d: 2.4, h: 1.3, l: 'Aduana · Puerto' },
  CEDIS: { x: 8, y: -8.5, w: 4.2, d: 3.2, h: 2, l: 'CEDIS' },
  PLAN: { x: 15, y: -8.5, w: 3, d: 2.6, h: 1.5, l: 'PLAN' },
};
const ROAD_X = 21.5;

export default function ModulePedidos({ t, isDark, navIcon, navLabel, navDesc }) {
  const C = isDark ? PAL.dark : PAL.light;
  const [ev, setEv] = useState(() => { try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s ? s.map((e) => ({ ...e, fecha: new Date(e.fecha), fechaOc: e.fechaOc ? new Date(e.fechaOc) : null, fechaComp: e.fechaComp ? new Date(e.fechaComp) : null })) : []; } catch { return []; } });
  const [cfg, setCfg] = useState(() => { try { return { umbral: DEF_UMBRAL, ...JSON.parse(localStorage.getItem(LS_CFG) || '{}') }; } catch { return { umbral: DEF_UMBRAL }; } });
  const [aviso, setAviso] = useState('');
  const [fProv, setFProv] = useState(''); const [fMarca, setFMarca] = useState(''); const [fOrigen, setFOrigen] = useState(''); const [fZona, setFZona] = useState('');
  const [fSolo, setFSolo] = useState(''); const [q, setQ] = useState('');
  const [sel, setSel] = useState(null); // { stage, zona? }
  const [selUnit, setSelUnit] = useState(null);
  const [showCfg, setShowCfg] = useState(false);
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState([0, 0]);
  const [play, setPlay] = useState(true);
  const [tick, setTick] = useState(0);
  const fileRef = useRef(null); const drag = useRef(null);
  const hoy = useMemo(() => new Date(), [ev]);

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(ev)); } catch { /* base grande: no se guarda */ } }, [ev]);
  useEffect(() => { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch {} }, [cfg]);
  // Animación (~30 fps)
  useEffect(() => {
    if (!play) return;
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
  const opts = useMemo(() => {
    const u = (k) => [...new Set(allUnits.map((x) => x[k]).filter(Boolean))].sort();
    return { prov: u('prov'), marca: u('marca'), zona: u('zona') };
  }, [allUnits]);
  const units = useMemo(() => {
    const qq = norm(q);
    return allUnits.filter((u) => (!fProv || u.prov === fProv) && (!fMarca || u.marca === fMarca) && (!fOrigen || u.origen === fOrigen) && (!fZona || u.zona === fZona)
      && (!fSolo || (fSolo === 'atorado' ? u.atorado : fSolo === 'vencido' ? u.vencido : fSolo === 'activo' ? u.etapa !== 'RECIBIDO' : true))
      && (!qq || norm(`${u.oc} ${u.sku} ${u.modelo} ${u.centro} ${u.cont}`).includes(qq)));
  }, [allUnits, fProv, fMarca, fOrigen, fZona, fSolo, q]);

  const zonas = useMemo(() => { const z = [...new Set(allUnits.map((u) => u.zona))].sort(); return z.length ? z.slice(0, 8) : ['TIENDAS']; }, [allUnits]);
  const zonaPos = (z) => { const i = Math.max(0, zonas.indexOf(z)); const n = zonas.length; return { x: ROAD_X + 1.6, y: -8.5 - ((n - 1) * 4) / 2 + i * 4 + 0.3 }; };

  // Agregados por nodo
  const porNodo = useMemo(() => {
    const m = {};
    const add = (k, u) => { const o = (m[k] = m[k] || { n: 0, pzs: 0, ator: 0, pzsAtor: 0, maxDias: 0 }); o.n++; o.pzs += u.pzs - u.pzsRec; if (u.atorado) { o.ator++; o.pzsAtor += u.pzs; } o.maxDias = Math.max(o.maxDias, u.enEtapa || 0); };
    units.forEach((u) => {
      if (u.etapa === 'TIENDA' || u.etapa === 'RECIBIDO' || u.etapa === 'TRANSITO_TDA') add(`${u.etapa}|${u.zona}`, u);
      add(u.etapa, u);
    });
    return m;
  }, [units]);

  // Promedios por tramo (histórico de lo que ya pasó por cada etapa)
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
      const o = (m[u.prov] = m[u.prov] || { prov: u.prov, n: 0, act: 0, ator: 0, pzsTr: 0, leads: [], tram: {}, aT: 0, aTn: 0 });
      o.n++; if (u.etapa !== 'RECIBIDO') { o.act++; o.pzsTr += u.pzs - u.pzsRec; } if (u.atorado) o.ator++;
      if (u.lead != null) o.leads.push(u.lead); if (u.aTiempo != null) { o.aTn++; if (u.aTiempo) o.aT++; }
      Object.entries(u.tramos).forEach(([k, v]) => { (o.tram[k] = o.tram[k] || []).push(v); });
    });
    return Object.values(m).sort((a, b) => b.pzsTr - a.pzsTr);
  }, [units]);

  const kpi = useMemo(() => {
    const act = units.filter((u) => u.etapa !== 'RECIBIDO');
    const rec = units.filter((u) => u.lead != null);
    const conComp = units.filter((u) => u.aTiempo != null);
    return {
      pzsCamino: act.reduce((a, u) => a + u.pzs - u.pzsRec, 0), ocs: new Set(act.map((u) => u.oc)).size,
      ator: units.filter((u) => u.atorado).length, pzsAtor: units.filter((u) => u.atorado).reduce((a, u) => a + u.pzs, 0),
      lead: rec.length ? rec.reduce((a, u) => a + u.lead, 0) / rec.length : null,
      onTime: conComp.length ? conComp.filter((u) => u.aTiempo).length / conComp.length : null,
      sinEntrada: units.filter((u) => u.etapa === 'TIENDA').reduce((a, u) => a + u.pzs, 0),
      vencidos: units.filter((u) => u.vencido).length,
    };
  }, [units]);

  const nodeUnits = useMemo(() => {
    if (!sel) return [];
    return units.filter((u) => u.etapa === sel.stage && (!sel.zona || u.zona === sel.zona)).sort((a, b) => b.enEtapa - a.enEtapa);
  }, [units, sel]);

  const exportar = () => {
    const H = ['OC', 'SKU', 'MODELO', 'PROVEEDOR', 'MARCA', 'ORIGEN', 'CENTRO', 'ZONA', 'PIEZAS', 'ETAPA_ACTUAL', 'ULTIMO_REGISTRO', 'DIAS_EN_ETAPA', 'ATORADO', 'FECHA_COMPROMISO', 'VENCIDO', ...STAGES.map((s) => `DIAS_${s.k}`)];
    const L = [H.join(',')];
    units.forEach((u) => L.push([u.oc, u.sku, u.modelo, u.prov, u.marca, u.origen, u.centro, u.zona, u.pzs, SL[u.etapa], u.desde.toISOString().slice(0, 10), (u.enEtapa || 0).toFixed(1), u.atorado ? 'SI' : '', u.fechaComp ? u.fechaComp.toISOString().slice(0, 10) : '', u.vencido ? 'SI' : '', ...STAGES.map((s) => (u.tramos[s.k] != null ? u.tramos[s.k].toFixed(1) : ''))].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Pedidos_rastreo.csv'; a.click();
  };

  // ─── Escena ────────────────────────────────────────────────────────────────
  const scene = useMemo(() => {
    // Caminos (segmentos en coordenadas de mundo)
    const zs = zonas.map((z) => ({ z, ...zonaPos(z) }));
    const yTop = Math.min(...zs.map((p) => p.y)) + 1, yBot = Math.max(...zs.map((p) => p.y)) + 1;
    const roads = [
      [[1.6, 3.2], [9.5, 3.2]], [[9.5, 3.2], [9.5, -4.7]], [[9.5, -4.7], [ROAD_X, -4.7]],
      [[ROAD_X, Math.min(-4.7, yTop)], [ROAD_X, Math.max(-4.7, yBot)]],
      ...zs.map((p) => [[ROAD_X, p.y + 1], [p.x, p.y + 1]]),
    ];
    return { zs, roads };
  }, [zonas]);

  const roadPoly = ([a, b], wdt = 0.9) => {
    const [x1, y1] = a, [x2, y2] = b;
    if (x1 === x2) { const y0 = Math.min(y1, y2) - wdt / 2, y3 = Math.max(y1, y2) + wdt / 2; return pts([P(x1 - wdt / 2, y0), P(x1 + wdt / 2, y0), P(x1 + wdt / 2, y3), P(x1 - wdt / 2, y3)]); }
    const x0 = Math.min(x1, x2) - wdt / 2, x3 = Math.max(x1, x2) + wdt / 2; return pts([P(x0, y1 - wdt / 2), P(x3, y1 - wdt / 2), P(x3, y1 + wdt / 2), P(x0, y1 + wdt / 2)]);
  };
  // Rutas animadas: lista de puntos de mundo
  const pathAt = (path, f) => {
    const seg = []; let L = 0;
    for (let i = 0; i < path.length - 1; i++) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); seg.push(l); L += l; }
    let d = f * L;
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const r = d / seg[i]; const a = path[i], b = path[i + 1]; return { x: a[0] + (b[0] - a[0]) * r, y: a[1] + (b[1] - a[1]) * r, dir: a[0] !== b[0] ? 'x' : 'y', rev: a[0] !== b[0] ? b[0] < a[0] : b[1] < a[1] }; } d -= seg[i]; }
    const b = path[path.length - 1]; return { x: b[0], y: b[1], dir: 'x', rev: false };
  };
  const truck = (key, pos, color, cont) => {
    const along = pos.dir === 'x';
    const L = 1.5, W = 0.6, ox = pos.x - (along ? L / 2 : W / 2), oy = pos.y - (along ? W / 2 : L / 2);
    const cab = along ? { x: pos.rev ? ox : ox + L - 0.45, y: oy, w: 0.45, d: W } : { x: ox, y: pos.rev ? oy : oy + L - 0.45, w: W, d: 0.45 };
    const box = along ? { x: pos.rev ? ox + 0.5 : ox, y: oy, w: L - 0.5, d: W } : { x: ox, y: pos.rev ? oy + 0.5 : oy, w: W, d: L - 0.5 };
    return { depth: pos.x + pos.y, el: (
      <g key={key}>
        <IsoBox {...box} h={0.62} z={0.08} top={cont ? '#2BB3A8' : '#FFFFFF'} left={cont ? '#1E8F86' : '#DCE3EE'} right={cont ? '#38C9BD' : '#F4F7FB'} />
        <IsoBox {...cab} h={0.5} z={0.08} top={color} left={color} right={color} stroke="rgba(0,0,0,0.25)" />
      </g>
    ) };
  };
  const pallets = (key, x, y, n, ator) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const col = i % 3, row = Math.floor(i / 3) % 2, lvl = Math.floor(i / 6);
      out.push(<IsoBox key={`${key}-${i}`} x={x + col * 0.62} y={y + row * 0.62} z={lvl * 0.42} w={0.5} d={0.5} h={0.4} top={ator ? '#F3A6A6' : C.boxR} left={ator ? '#C96B6B' : C.boxL} right={ator ? '#E58C8C' : C.box} />);
    }
    return out;
  };
  const nPal = (pzs) => (pzs > 0 ? Math.min(12, Math.max(1, Math.round(Math.log2(pzs / 80 + 1) * 2.2))) : 0);
  const pin = (key, x, y, z, n, color = '#E5484D') => {
    const [sx, sy] = P(x, y, z); const b = Math.sin(tick * 4 + x) * 4;
    return (
      <g key={key} transform={`translate(${sx},${sy - 18 + b})`} style={{ pointerEvents: 'none' }}>
        <path d="M0,0 C-9,-10 -9,-22 0,-22 C9,-22 9,-10 0,0 Z" fill={color} stroke="#fff" strokeWidth="1.5" />
        <text x="0" y="-11" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{n}</text>
      </g>
    );
  };
  const label = (key, x, y, z, txt, sub, onClick, active) => {
    const [sx, sy] = P(x, y, z);
    const w = Math.max(txt.length, (sub || '').length) * 6.2 + 18;
    return (
      <g key={key} transform={`translate(${sx},${sy})`} onClick={onClick} style={{ cursor: 'pointer' }}>
        <rect x={-w / 2} y={-30} width={w} height={sub ? 30 : 20} rx="7" fill={isDark ? (active ? '#3A2F55' : '#241E2F') : (active ? '#E8EEFF' : '#FFFFFF')} stroke={active ? '#7C5CF0' : (isDark ? '#3B3350' : '#D5DDEB')} />
        <text x="0" y={sub ? -17 : -16} textAnchor="middle" fontSize="10" fontWeight="800" fill={C.text}>{txt}</text>
        {sub && <text x="0" y="-5" textAnchor="middle" fontSize="8.5" fill={isDark ? '#A9A2B8' : '#5B6680'}>{sub}</text>}
      </g>
    );
  };

  const items = []; // { depth, el }
  const overlay = [];
  const selKey = sel ? `${sel.stage}|${sel.zona || ''}` : '';
  const cnt = (k) => porNodo[k] || { n: 0, pzs: 0, ator: 0, maxDias: 0 };

  // Edificios principales
  Object.entries(NODES).forEach(([k, nd]) => {
    const c = cnt(k); const active = selKey === `${k}|`;
    const click = () => { setSel({ stage: k }); setSelUnit(null); };
    const g = [];
    if (k === 'PROVEEDOR') {
      g.push(<IsoBox key="b" x={nd.x} y={nd.y} w={nd.w} d={nd.d} h={nd.h} top="#9AA6BA" left="#7B879C" right="#AEB9CB" />);
      g.push(<IsoBox key="ch" x={nd.x + 0.4} y={nd.y + 0.3} z={nd.h} w={0.45} d={0.45} h={1.1} top="#8A95A8" left="#6E788B" right="#9AA5B6" />);
      [0, 1, 2].forEach((i) => { const ph = (tick * 0.5 + i / 3) % 1; const [sx, sy] = P(nd.x + 0.62, nd.y + 0.52, nd.h + 1.2 + ph * 1.6); g.push(<circle key={`sm${i}`} cx={sx + ph * 10} cy={sy} r={4 + ph * 7} fill={isDark ? '#8C86A0' : '#C9CFDA'} opacity={0.7 * (1 - ph)} />); });
      [0.5, 1.4, 2.3].forEach((u, i) => g.push(<polygon key={`w${i}`} points={faceL(nd.x, nd.y, nd.d, u, u + 0.55, 0.6, 1.1)} fill={isDark ? '#E0BB3E' : '#FFF4C2'} opacity="0.85" />));
    } else if (k === 'ADUANA') {
      g.push(<IsoBox key="b" x={nd.x} y={nd.y} w={nd.w} d={nd.d} h={nd.h} top="#E2A93B" left="#C48C24" right="#F0BC55" />);
      g.push(<polygon key="dr" points={faceL(nd.x, nd.y, nd.d, 0.9, 2.1, 0, 0.9)} fill={isDark ? '#3A3020' : '#F7E2B5'} />);
      // contenedores apilados
      [[0, 0, 0, '#2BB3A8'], [0, 0.75, 0, '#E5484D'], [0, 0, 0.6, '#3B6FE0'], [1.9, 0.0, 0, '#2BB3A8']].forEach(([dx, dy, dz, col], i) => g.push(<IsoBox key={`c${i}`} x={nd.x + nd.w + 0.4 + dx} y={nd.y + 0.2 + dy} z={dz} w={1.7} d={0.65} h={0.6} top={col} left={col} right={col} stroke="rgba(0,0,0,0.25)" />));
      // grúa
      const [gx, gy] = P(nd.x - 0.6, nd.y + 1.2, 0), [gx2, gy2] = P(nd.x - 0.6, nd.y + 1.2, 3.2), [gx3, gy3] = P(nd.x + 1.8, nd.y + 1.2, 3.2);
      g.push(<g key="cr" stroke={isDark ? '#E0BB3E' : '#F2A900'} strokeWidth="3"><line x1={gx} y1={gy} x2={gx2} y2={gy2} /><line x1={gx2} y1={gy2} x2={gx3} y2={gy3} /><line x1={gx3} y1={gy3} x2={gx3} y2={gy3 + 18 + Math.sin(tick) * 6} strokeWidth="1.5" /></g>);
    } else {
      g.push(<IsoBox key="b" x={nd.x} y={nd.y} w={nd.w} d={nd.d} h={nd.h} top={C.wall} left={C.wall2} right={C.wall} />);
      g.push(<IsoBox key="r" x={nd.x - 0.1} y={nd.y - 0.1} z={nd.h} w={nd.w + 0.2} d={nd.d + 0.2} h={0.35} top={C.bTop} left={C.bL} right={C.bR} />);
      const nDoors = k === 'CEDIS' ? 3 : 2;
      for (let i = 0; i < nDoors; i++) { const u = 0.4 + i * ((nd.w - 0.6) / nDoors); g.push(<polygon key={`d${i}`} points={faceL(nd.x, nd.y, nd.d, u, u + 0.8, 0, 1.1)} fill={C.bL} />); g.push(<polygon key={`di${i}`} points={faceL(nd.x, nd.y, nd.d, u + 0.08, u + 0.72, 0, 0.95)} fill={isDark ? '#3A3050' : '#C9A26A'} opacity="0.9" />); }
      g.push(<polygon key="side" points={faceR(nd.x, nd.y, nd.w, 0.5, nd.d - 0.5, 0.5, 1.2)} fill={C.bR} opacity="0.35" />);
    }
    items.push({ depth: nd.x + nd.y + nd.w / 2 + nd.d / 2, el: <g key={`n-${k}`} onClick={click} style={{ cursor: 'pointer' }} opacity={sel && !active ? 0.75 : 1}>{g}</g> });
    // tarimas frente al edificio
    const np = nPal(c.pzs);
    if (np) items.push({ depth: nd.x + nd.y + nd.d + 1.5, el: <g key={`p-${k}`} onClick={click} style={{ cursor: 'pointer' }}>{pallets(k, nd.x + 0.2, nd.y + nd.d + 0.35, np, c.ator > 0)}</g> });
    overlay.push(label(`l-${k}`, nd.x + nd.w / 2, nd.y + nd.d / 2, nd.h + 1.3, nd.l, c.n ? `${c.n} pedidos · ${fmt(c.pzs)} pzs` : 'Sin pedidos', click, active));
    if (c.ator) overlay.push(pin(`pin-${k}`, nd.x + nd.w, nd.y + nd.d / 2, nd.h + 0.3, c.ator));
  });

  // Zonas de tiendas
  scene.zs.forEach(({ z, x, y }) => {
    const kT = `TIENDA|${z}`, kR = `RECIBIDO|${z}`; const cT = cnt(kT), cR = cnt(kR);
    const active = selKey === `TIENDA|${z}` || selKey === `RECIBIDO|${z}`;
    const click = () => { setSel({ stage: 'TIENDA', zona: z }); setSelUnit(null); };
    const w = 2.2, d = 1.8, h = 1.1;
    items.push({ depth: x + y + 2, el: (
      <g key={`z-${z}`} onClick={click} style={{ cursor: 'pointer' }} opacity={sel && !active ? 0.75 : 1}>
        <IsoBox x={x} y={y} w={w} d={d} h={h} top={C.wall} left={C.wall2} right={C.wall} />
        <IsoBox x={x - 0.05} y={y - 0.05} z={h} w={w + 0.1} d={d + 0.1} h={0.18} top="#E0BB3E" left="#C99F22" right="#EBCB5E" />
        <polygon points={faceL(x, y, d, 0.3, 1.9, 0.75, 1.0)} fill="#7C5CF0" />
        <polygon points={faceL(x, y, d, 0.35, 0.95, 0, 0.65)} fill={isDark ? '#3A3050' : '#BFD3F2'} />
        <polygon points={faceL(x, y, d, 1.2, 1.85, 0.25, 0.65)} fill={isDark ? '#3A3050' : '#BFD3F2'} />
      </g>
    ) });
    const np = nPal(cT.pzs);
    if (np) items.push({ depth: x + y + d + 2.5, el: <g key={`zp-${z}`} onClick={click} style={{ cursor: 'pointer' }}>{pallets(`zp${z}`, x - 1.6, y + 0.1, np, cT.ator > 0)}</g> });
    overlay.push(label(`zl-${z}`, x + w / 2, y + d / 2, h + 1, z, `${cT.n ? `${fmt(cT.pzs)} pzs sin entrada · ` : ''}${cR.n} recibidos`, click, active));
    if (cT.ator) overlay.push(pin(`zpin-${z}`, x + w, y + d / 2, h + 0.2, cT.ator));
  });

  // Árboles y montacargas (decoración)
  [[-2, 4], [3.5, -2], [5, 5], [12.5, 1.5], [13.5, -2], [6, -10], [18.5, -12], [17.5, -2.5], [-1.5, -3]].forEach(([x, y], i) => {
    const [sx, sy] = P(x, y, 0);
    items.push({ depth: x + y, el: <g key={`tr${i}`}><rect x={sx - 2} y={sy - 14} width="4" height="14" fill="#8B6B4A" /><circle cx={sx} cy={sy - 22} r="11" fill={C.tree} /><circle cx={sx - 4} cy={sy - 26} r="5" fill="#fff" opacity="0.12" /></g> });
  });
  {
    const f = (Math.sin(tick * 0.8) + 1) / 2; const fx = NODES.CEDIS.x + 0.5 + f * 2.6, fy = NODES.CEDIS.y + NODES.CEDIS.d + 2.6;
    items.push({ depth: fx + fy, el: (
      <g key="fork"><IsoBox x={fx} y={fy} w={0.6} d={0.45} h={0.4} top="#F2B705" left="#C99400" right="#FFCB2E" />
        <IsoBox x={fx + 0.1} y={fy + 0.08} z={0.4} w={0.3} d={0.3} h={0.35} top="#2A2A2A" left="#1A1A1A" right="#333" />
        {f > 0.5 && <IsoBox x={fx - 0.55} y={fy} z={0.05} w={0.45} d={0.45} h={0.35} top={C.boxR} left={C.boxL} right={C.box} />}
      </g>
    ) });
  }

  // Vehículos: tránsito internacional (contenedores), salidas a CEDIS/PLAN y rutas a cada zona
  const vehicles = [];
  const nInt = cnt('TRANSITO_INT').n, pathInt = [[1.6, 3.2], [9.5, 3.2]];
  for (let i = 0; i < Math.min(5, nInt); i++) { const fr = ((tick * 0.05) + i / Math.min(5, nInt)) % 1; vehicles.push(truck(`vi${i}`, pathAt(pathInt, fr), '#1E8F86', true)); }
  const nFlow = Math.min(3, cnt('CEDIS').n + cnt('PLAN').n), pathMid = [[9.5, 3.2], [9.5, -4.7], [ROAD_X - 1, -4.7]];
  for (let i = 0; i < nFlow; i++) { const fr = ((tick * 0.04) + i / Math.max(1, nFlow)) % 1; vehicles.push(truck(`vm${i}`, pathAt(pathMid, fr), '#3B6FE0', false)); }
  scene.zs.forEach(({ z, x, y }, zi) => {
    const n = Math.min(3, cnt(`TRANSITO_TDA|${z}`).n);
    const path = [[NODES.PLAN.x + NODES.PLAN.w, -4.7], [ROAD_X, -4.7], [ROAD_X, y + 1], [x - 0.2, y + 1]];
    for (let i = 0; i < n; i++) { const fr = ((tick * 0.06) + i / n + zi * 0.13) % 1; vehicles.push(truck(`vz${z}${i}`, pathAt(path, fr), '#7C5CF0', false)); }
    if (n) { const p = pathAt(path, 0.55); overlay.push(<text key={`zt${z}`} {...(() => { const [sx, sy] = P(p.x, p.y, 1.5); return { x: sx, y: sy }; })()} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={isDark ? '#C9B8FF' : '#5238B0'} style={{ pointerEvents: 'none' }}>{cnt(`TRANSITO_TDA|${z}`).n} en ruta</text>); }
  });
  items.push(...vehicles);
  items.sort((a, b) => a.depth - b.depth);

  // viewBox
  const zy = scene.zs.map((p) => p.y);
  const corners = [P(-3, Math.min(-11, ...zy) - 1), P(-3, 6), P(26, Math.min(-11, ...zy) - 1), P(26, Math.max(6, ...zy.map((y) => y + 3))), P(-3, 6, 3.5), P(26, Math.min(-11, ...zy) - 1, 3.5)];
  const minX = Math.min(...corners.map((c) => c[0])), maxX = Math.max(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1])), maxY = Math.max(...corners.map((c) => c[1]));
  const vbW = (maxX - minX) / zoom, vbH = (maxY - minY) / zoom;
  const vb = `${minX + (maxX - minX - vbW) / 2 - pan[0]} ${minY + (maxY - minY - vbH) / 2 - pan[1]} ${vbW} ${vbH}`;

  const inCls = `px-2 py-1.5 rounded-lg border text-xs ${isDark ? 'bg-[#1a1520] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const selStyle = isDark ? { colorScheme: 'dark' } : undefined;
  const glass = isDark ? 'bg-[#1a1520]/90 border-white/10' : 'bg-white/90 border-gray-200';
  const unit = selUnit ? allUnits.find((u) => u.key === selUnit) : null;

  const headerRight = (
    <>
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
      <button onClick={() => fileRef.current?.click()} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-violet-600 text-white hover:bg-violet-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}><Upload size={14} /> Cargar CSV</button>
      <button onClick={() => { setEv(demoEventos()); setAviso(''); setSel(null); setSelUnit(null); }} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Wand2 size={14} /> Datos de prueba</button>
      {ev.length > 0 && <button onClick={exportar} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${t.cardInner}`}><Download size={14} /> Exportar</button>}
      {ev.length > 0 && <button onClick={() => { setEv([]); setSel(null); setSelUnit(null); }} className={`p-2 rounded-lg border ${t.cardInner}`} title="Borrar datos"><Trash2 size={14} /></button>}
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
          <p className={`text-xs mt-2 ${t.textMuted}`}>Una fila por evento: OC, SKU, PROVEEDOR, MARCA, ORIGEN (IMP/NAC), PIEZAS, ETAPA, UBICACION, CENTRO, ZONA, FECHA_EVENTO, FECHA_COMPROMISO. También acepta las fechas por etapa en columnas (FECHA_ADUANA, FECHA_CEDIS, FECHA_TIENDA…).</p>
        </div>
      ) : (<>
        {/* Filtros */}
        <div className={`rounded-2xl border p-3 mb-4 flex flex-wrap items-center gap-2 ${t.card}`}>
          <div className="relative"><Search size={13} className={`absolute left-2 top-2 ${t.textMuted}`} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OC, SKU, centro, contenedor…" className={`${inCls} pl-7 w-56`} /></div>
          {[['Proveedor', fProv, setFProv, opts.prov], ['Marca', fMarca, setFMarca, opts.marca], ['Zona', fZona, setFZona, opts.zona]].map(([l, v, s, o]) => (
            <select key={l} value={v} onChange={(e) => s(e.target.value)} className={inCls} style={selStyle}><option value="">{l}: todas</option>{o.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          ))}
          <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)} className={inCls} style={selStyle}><option value="">Origen: todos</option><option value="IMP">Importación</option><option value="NAC">Nacional</option></select>
          <div className="flex gap-1">
            {[['', 'Todos'], ['activo', 'En camino'], ['atorado', 'Atorados'], ['vencido', 'Vencidos']].map(([k, l]) => (
              <button key={k} onClick={() => setFSolo(k)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${fSolo === k ? (isDark ? 'bg-violet-600 border-violet-500 text-white' : 'bg-blue-600 border-blue-600 text-white') : t.cardInner}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowCfg((v) => !v)} className={`ml-auto px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${t.cardInner}`}><Settings size={12} /> Días para atorado</button>
          {showCfg && (
            <div className="w-full flex flex-wrap gap-3 pt-2 border-t border-white/10">
              {Object.keys(DEF_UMBRAL).map((k) => (
                <label key={k} className={`text-[11px] flex items-center gap-1.5 ${t.textMuted}`}>{SL[k]}
                  <input type="number" min="0" value={cfg.umbral[k] ?? ''} onChange={(e) => setCfg((c) => ({ ...c, umbral: { ...c.umbral, [k]: Math.max(0, Number(e.target.value)) } }))} className={`${inCls} w-14 text-center`} />
                  <span className="opacity-60" title="Promedio histórico / percentil 90">{tramoProm[k] ? `prom ${tramoProm[k].prom.toFixed(1)} · p90 ${tramoProm[k].p90.toFixed(1)}` : ''}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Escena + paneles flotantes */}
        <div className={`relative rounded-2xl border overflow-hidden ${t.card}`} style={{ height: 640 }}>
          <svg viewBox={vb} className="w-full h-full select-none" style={{ background: C.ground, cursor: drag.current ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, p: pan }; }}
            onMouseMove={(e) => { if (!drag.current) return; const k = vbW / e.currentTarget.clientWidth; setPan([drag.current.p[0] + (e.clientX - drag.current.x) * k, drag.current.p[1] + (e.clientY - drag.current.y) * k]); }}
            onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
            onWheel={(e) => setZoom((z) => Math.min(3, Math.max(0.6, z * (e.deltaY < 0 ? 1.1 : 0.9))))}>
            {/* pasto */}
            <polygon points={pts([P(-3, -15), P(27, -15), P(27, 7), P(-3, 7)])} fill={C.grass} opacity="0.55" />
            {scene.roads.map((r, i) => <polygon key={`rd${i}`} points={roadPoly(r)} fill={C.road} />)}
            {scene.roads.map((r, i) => { const [a, b] = r; const [x1, y1] = P(...a), [x2, y2] = P(...b); return <line key={`ln${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth="1.5" strokeDasharray="6 7" strokeDashoffset={-tick * 12} opacity="0.8" />; })}
            {items.map((it) => it.el)}
            {overlay}
          </svg>

          {/* KPIs */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-2 max-w-[62%]">
            {[
              { l: 'Piezas en camino', v: fmt(kpi.pzsCamino), s: `${kpi.ocs} OCs activas`, I: Package },
              { l: 'Atorados', v: fmt(kpi.ator), s: `${fmt(kpi.pzsAtor)} pzs`, I: AlertTriangle, bad: kpi.ator > 0, f: 'atorado' },
              { l: 'Sin entrada en tienda', v: fmt(kpi.sinEntrada), s: 'pzs', I: Store },
              { l: 'Lead time OC → tienda', v: kpi.lead != null ? `${kpi.lead.toFixed(0)} d` : '—', s: 'promedio recibidos', I: Clock },
              { l: 'A tiempo', v: kpi.onTime != null ? `${(kpi.onTime * 100).toFixed(0)}%` : '—', s: `${kpi.vencidos} vencidos hoy`, I: CheckCircle2, f: 'vencido' },
            ].map(({ l, v, s, I, bad, f }) => (
              <button key={l} onClick={() => f && setFSolo(fSolo === f ? '' : f)} className={`text-left px-3 py-2 rounded-xl border backdrop-blur shadow-sm ${glass}`}>
                <div className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${t.textMuted}`}><I size={11} /> {l}</div>
                <div className={`text-lg font-black leading-tight ${bad ? 'text-rose-500' : t.text}`}>{v}</div>
                <div className={`text-[10px] ${t.textMuted}`}>{s}</div>
              </button>
            ))}
          </div>

          {/* Controles */}
          <div className={`absolute top-3 right-3 flex flex-col gap-1 rounded-xl border p-1 ${glass} ${sel ? 'lg:right-[372px]' : ''}`}>
            <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="p-1.5"><ZoomIn size={15} /></button>
            <button onClick={() => setZoom((z) => Math.max(0.6, z / 1.2))} className="p-1.5"><ZoomOut size={15} /></button>
            <button onClick={() => { setZoom(1); setPan([0, 0]); }} className="p-1.5"><RotateCcw size={15} /></button>
            <button onClick={() => setPlay((p) => !p)} className="p-1.5" title={play ? 'Pausar animación' : 'Reanudar'}>{play ? <Pause size={15} /> : <Play size={15} />}</button>
          </div>

          {/* Panel del nodo */}
          {sel && (
            <div className={`absolute top-3 right-3 bottom-3 w-[360px] max-w-[calc(100%-24px)] rounded-2xl border shadow-xl flex flex-col ${glass} backdrop-blur`}>
              <div className="p-4 pb-2 flex items-start justify-between">
                <div>
                  <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>{sel.zona ? `Zona · ${sel.zona}` : 'Etapa'}</div>
                  <div className={`text-lg font-black ${t.text}`}>{sel.zona ? sel.zona : SL[sel.stage]}</div>
                </div>
                <button onClick={() => { setSel(null); setSelUnit(null); }} className={t.textMuted}><X size={16} /></button>
              </div>
              {sel.zona && (
                <div className="px-4 flex gap-1 mb-2">
                  {['TRANSITO_TDA', 'TIENDA', 'RECIBIDO'].map((k) => (
                    <button key={k} onClick={() => setSel({ stage: k, zona: sel.zona })} className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${sel.stage === k ? (isDark ? 'bg-violet-600 text-white border-violet-500' : 'bg-blue-600 text-white border-blue-600') : t.cardInner}`}>{SL[k]} · {cnt(`${k}|${sel.zona}`).n}</button>
                  ))}
                </div>
              )}
              {(() => {
                const c = sel.zona ? cnt(`${sel.stage}|${sel.zona}`) : cnt(sel.stage);
                const tp = tramoProm[sel.stage];
                return (
                  <div className="px-4 grid grid-cols-2 gap-2 mb-3">
                    {[['Pedidos', fmt(c.n)], ['Piezas', fmt(c.pzs)], ['Atorados', fmt(c.ator)], ['Máx. días aquí', c.maxDias ? c.maxDias.toFixed(0) : '—'], ['Prom. histórico', tp ? `${tp.prom.toFixed(1)} d` : '—'], ['Atorado si pasa de', sel.stage !== 'RECIBIDO' ? `${cfg.umbral[sel.stage]} d` : '—']].map(([l, v]) => (
                      <div key={l} className={`rounded-lg border px-2.5 py-1.5 ${t.cardInner}`}><div className={`text-[9px] uppercase font-bold ${t.textMuted}`}>{l}</div><div className={`text-sm font-black ${l === 'Atorados' && c.ator ? 'text-rose-500' : t.text}`}>{v}</div></div>
                    ))}
                  </div>
                );
              })()}
              <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
                {nodeUnits.length === 0 && <p className={`text-xs text-center py-6 ${t.textMuted}`}>Sin pedidos aquí con los filtros actuales.</p>}
                {nodeUnits.slice(0, 300).map((u) => (
                  <button key={u.key} onClick={() => setSelUnit(u.key)} className={`w-full text-left px-2.5 py-2 rounded-lg mb-1 border ${selUnit === u.key ? (isDark ? 'border-violet-500 bg-violet-500/10' : 'border-blue-400 bg-blue-50') : 'border-transparent hover:bg-white/5'}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-black ${t.text}`}>OC {u.oc}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${u.atorado ? 'bg-rose-500/15 text-rose-500' : u.etapa === 'RECIBIDO' ? 'bg-emerald-500/15 text-emerald-500' : (isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>{u.etapa === 'RECIBIDO' ? `recibido ${fdate(u.fin)}` : `${(u.enEtapa || 0).toFixed(0)} d aquí`}</span>
                    </div>
                    <div className={`text-[10px] ${t.textMuted}`}>{u.prov} · {u.modelo || u.sku} · {fmt(u.pzs)} pzs{u.centro ? ` · T${u.centro}` : ''}{u.vencido ? ' · vencido' : ''}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rastreo de la OC */}
          {unit && (
            <div className={`absolute left-3 bottom-3 rounded-2xl border shadow-xl p-4 ${glass} backdrop-blur ${sel ? 'right-[384px]' : 'right-3'} max-lg:right-3`}>
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <div className={`text-sm font-black flex items-center gap-2 ${t.text}`}><Truck size={15} /> OC {unit.oc} <span className={`text-[10px] font-bold ${t.textMuted}`}>{unit.prov} · {unit.modelo || unit.sku} · {fmt(unit.pzs)} pzs · {unit.origen === 'IMP' ? 'Importación' : 'Nacional'}{unit.cont ? ` · ${unit.cont}` : ''}</span></div>
                  <div className={`text-[11px] ${t.textMuted}`}>Último registro: {SL[unit.etapa]} · {fdate(unit.desde)}{unit.ubic ? ` · ${unit.ubic}` : ''}{unit.etapa !== 'RECIBIDO' ? ` · lleva ${(unit.enEtapa || 0).toFixed(1)} días` : ''}{unit.fechaComp ? ` · compromiso ${fdate(unit.fechaComp)}` : ''}</div>
                </div>
                <button onClick={() => setSelUnit(null)} className={t.textMuted}><X size={15} /></button>
              </div>
              {(() => {
                const route = routeOf(unit.origen); const ci = route.indexOf(unit.etapa);
                let eta = unit.desde ? new Date(unit.desde) : new Date();
                return (
                  <div className="flex items-start overflow-x-auto pb-1">
                    {route.map((k, i) => {
                      const done = unit.at[k] && i < ci, cur = i === ci, pend = i > ci;
                      if (pend) { eta = new Date(eta.getTime() + ((tramoProm[route[i - 1]]?.prom ?? cfg.umbral[route[i - 1]] * 0.6) || 1) * DAY); if (i === ci + 1 && eta < hoy) eta = new Date(hoy.getTime() + DAY); } // si ya se pasó del promedio, sale mañana como pronto
                      const dur = unit.tramos[k];
                      return (
                        <div key={k} className="flex items-start flex-1 min-w-[96px]">
                          <div className="flex flex-col items-center text-center w-full">
                            <div className="flex items-center w-full">
                              <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : done || cur ? (isDark ? 'bg-violet-500' : 'bg-blue-500') : (isDark ? 'bg-white/15' : 'bg-gray-200')}`} />
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${cur ? (unit.atorado ? 'bg-rose-500 text-white ring-4 ring-rose-500/30 animate-pulse' : unit.etapa === 'RECIBIDO' ? 'bg-emerald-500 text-white' : (isDark ? 'bg-violet-500 text-white ring-4 ring-violet-500/30' : 'bg-blue-600 text-white ring-4 ring-blue-500/25')) : done ? (isDark ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white') : (isDark ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-500')}`}>{done ? '✓' : i + 1}</div>
                              <div className={`h-0.5 flex-1 ${i === route.length - 1 ? 'opacity-0' : done ? (isDark ? 'bg-violet-500' : 'bg-blue-500') : (isDark ? 'bg-white/15' : 'bg-gray-200')}`} />
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

        {/* Tablas */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
          <div className={`rounded-2xl border p-4 ${t.card}`}>
            <h4 className={`text-sm font-black mb-1 ${t.text}`}>Tiempos por tramo y proveedor (días promedio)</h4>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Cuánto se queda la mercancía en cada etapa hasta su siguiente registro. Rojo = arriba del umbral de atorado.</p>
            <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className={`sticky top-0 ${isDark ? 'bg-[#1a1520]' : 'bg-gray-50'}`}><tr className={`text-[9px] uppercase ${t.textMuted}`}>
                  <th className="p-2 text-left">Proveedor</th>{STAGES.slice(0, -1).map((s) => <th key={s.k} className="p-2 text-right">{s.short}</th>)}<th className="p-2 text-right">Lead</th><th className="p-2 text-right">A tiempo</th><th className="p-2 text-right">En camino</th>
                </tr></thead>
                <tbody>
                  {porProv.map((p) => (
                    <tr key={p.prov} className={`border-t ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
                      <td className={`p-2 font-bold ${t.text}`}>{p.prov}{p.ator > 0 && <span className="ml-1 text-rose-500 text-[10px]">● {p.ator}</span>}</td>
                      {STAGES.slice(0, -1).map((s) => { const a = p.tram[s.k]; const v = a ? a.reduce((x, y) => x + y, 0) / a.length : null; return <td key={s.k} className={`p-2 text-right ${v != null && v > cfg.umbral[s.k] ? 'text-rose-500 font-bold' : t.textMuted}`}>{v != null ? v.toFixed(1) : '·'}</td>; })}
                      <td className={`p-2 text-right font-bold ${t.text}`}>{p.leads.length ? (p.leads.reduce((x, y) => x + y, 0) / p.leads.length).toFixed(0) : '—'}</td>
                      <td className={`p-2 text-right ${t.textMuted}`}>{p.aTn ? `${Math.round(p.aT / p.aTn * 100)}%` : '—'}</td>
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
                    <tr key={u.key} onClick={() => { setSel({ stage: u.etapa, zona: ['TRANSITO_TDA', 'TIENDA'].includes(u.etapa) ? u.zona : undefined }); setSelUnit(u.key); }} className={`border-t cursor-pointer ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <td className={`p-2 font-bold ${t.text}`}>{u.oc}</td><td className={`p-2 ${t.textMuted}`}>{u.prov}</td>
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

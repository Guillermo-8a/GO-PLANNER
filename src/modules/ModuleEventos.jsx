import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line, PieChart, Pie, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import * as Icons from '../utils/icons';
import { useGlobal } from '../context/GlobalContext';

// ─── HELPERS ────────────────────────────────────────────────────────────────
const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`)).map(c => c.replace(/^"|"$/g, '').trim());
const num  = v => parseFloat(String(v||'0').replace(/[^0-9.-]+/g,''))||0;
const fmt  = (n,d=0) => n==null?'-':n.toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtP = (n,d=1) => n==null?'-':n.toFixed(d)+'%';
const fmtM = n => n==null?'-':'$'+n.toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0});
const parseDate = s => {
  if(!s) return null;
  const c=s.trim(); let d;
  if(/^\d{4}-\d{2}-\d{2}/.test(c)) d=new Date(c.slice(0,10)+'T00:00:00');
  else { const p=c.split(/[\/\-\.]/);
    if(p.length===3){ const [a,b,cc]=p;
      if(a.length===4) d=new Date(`${a}-${b.padStart(2,'0')}-${cc.padStart(2,'0')}T00:00:00`);
      else d=new Date(`${cc.length===4?cc:'20'+cc}-${b.padStart(2,'0')}-${a.padStart(2,'0')}T00:00:00`);
    }}
  return d&&!isNaN(d)?d:null;
};

// ─── INDEXEDDB (snapshot/ventas por evento, sobrevive refresh) ───────────────
const DB='gop_eventos_db', STORE='kv';
const idbOpen=()=>new Promise((res,rej)=>{ const o=indexedDB.open(DB,1);
  o.onupgradeneeded=()=>o.result.createObjectStore(STORE); o.onsuccess=()=>res(o.result); o.onerror=()=>rej(o.error); });
const idbSet=async(k,v)=>{ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>rej(tx.error); }); };
const idbGet=async k=>{ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>{db.close();res(rq.result);}; rq.onerror=()=>rej(rq.error); }); };
const idbDel=async k=>{ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(k); tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>rej(tx.error); }); };

// ─── CATÁLOGOS ────────────────────────────────────────────────────────────────
const TIPOS_EVENTO=['NM Mamás','NM Papás','BTS','MS','GVL','ATH','NM Navidad','NM','Hot Sale','Buen Fin','Otro'];
const OBJETIVOS=['Liquidar depreciado','Tráfico','Margen'];
// Paleta validada (CVD-safe, dark + light) para las 3 clasificaciones
const CLASIF_COLOR={ regular:'#8b5cf6', descuento:'#059669', depreciado:'#c2410c', sin_snapshot:'#dc2626' };
const VIOLET_SHADES=['#8b5cf6','#a78bfa','#c4b5fd','#7c3aed','#ddd6fe','#6d28d9','#e9d5ff','#5b21b6'];
const CLASIF_GRAD={ regular:'gradRegular', descuento:'gradDescuento', depreciado:'gradDepreciado', sin_snapshot:'gradAlerta' };
const CLASIF_LABEL={ regular:'Regular', descuento:'Descuento', depreciado:'Depreciado', sin_snapshot:'Sin snapshot' };

// ─── PARSERS ─────────────────────────────────────────────────────────────────
// Snapshot de inventario al arranque — mismo esquema/alias que Traslados (GOA, SKU, CENTRO, OH, PRECIO, LETRA_DESC)
const parseSnapshotCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep)); if(rows.length<2) return {rows:[],error:null};
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_'));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const I={goa:idx('GOA','FAMILIA'),sku:idx('SKU','ARTICULO','MATERIAL'),nsku:idx('NSKU','DESC_SKU','NOMBRE_SKU','DESCRIPCION'),
    modelo:idx('MODELO','MODEL'),marca:idx('MARCA','PROVEEDOR','BRAND'),seccion:idx('SECCION','SECTION'),
    centro:idx('CENTRO','ID_CENTRO','TIENDA'),oh:idx('OH','ON_HAND','INVENTARIO','STOCK','EXISTENCIAS'),
    precio:idx('PRECIO','PVP','PRICE'),letra:idx('LETRA_DESC','LETRA DESC','DESC','DESCUENTO')};
  if(I.goa===-1||I.sku===-1){ return {rows:[],error:'El CSV debe tener mínimo: GOA, SKU, OH'}; }
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    const sku=I.sku>=0?r[I.sku].trim():''; if(!sku) continue;
    out.push({ sku, nsku:I.nsku>=0?r[I.nsku].trim():'', modelo:I.modelo>=0?r[I.modelo].trim().toUpperCase():'',
      marca:I.marca>=0?r[I.marca].trim().toUpperCase():'SIN MARCA', goa:I.goa>=0?r[I.goa].trim().toUpperCase():'',
      seccion:I.seccion>=0?r[I.seccion].trim().toUpperCase():'GENERAL', centro:I.centro>=0?r[I.centro].trim():'',
      oh:num(I.oh>=0?r[I.oh]:0), precio:num(I.precio>=0?r[I.precio]:0), letraDesc:I.letra>=0?r[I.letra].trim():'' });
  }
  return {rows:out,error:null};
};
// Snapshot desde el layout de descuentos (pestaña "OH y Montos" — catálogo completo con OH y letra de descuento)
const parseSnapshotXLSX = async file => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf,{type:'array'});
  const sheetName = wb.SheetNames.find(n=>n.trim()==='OH y Montos') || wb.SheetNames.find(n=>/OH.*Monto/i.test(n));
  if(!sheetName) return {rows:[],error:'El archivo debe incluir la pestaña "OH y Montos".'};
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:true});
  if(rows.length<2) return {rows:[],error:null};
  // Se indexa por NOMBRE de columna (no posición): este layout ya cambió más de una vez (letra de descuento,
  // y ahora columna "Año" para traer 2 años de snapshot apilados) y leer por índice fijo rompe todo silenciosamente.
  // "Artículo" se repite 2 veces (SKU y descripción) — se toman en el orden en que aparecen.
  const head=(rows[0]||[]).map(s=>String(s||'').trim());
  const hidx=(...names)=>{ for(const n of names){ const i=head.indexOf(n); if(i>=0) return i; } return -1; };
  const artIdx=head.reduce((a,h,i)=>{ if(h==='Artículo') a.push(i); return a; },[]);
  const iAno=hidx('Año'), iRebaja=hidx('Rebaja'), iSeccion=hidx('Sección'), iGoa=hidx('Grupo artículos'),
    iMarca=hidx('Marca'), iNorma=hidx('Norma de Aprovisionamiento'), iEstatus=hidx('Estatus del Artículo'),
    iModelo=hidx('Modelo Proveedor'), iSku=artIdx.length?artIdx[0]:-1, iDesc=artIdx.length>1?artIdx[1]:iSku,
    iPrecio=hidx('Precio De Venta Act'), iOh=hidx('OH_'), iOhAant=hidx('OH aant'), iMontoAant=hidx('Monto aant');
  // Col "Rebaja": Regular = sin letra; Depreciado = liquidación permanente; MS = letra temporal (regresa a precio).
  // Col "Año": si existe, marca a qué ejercicio pertenece cada bloque de filas (permite clasificar por año real, no por hoy).
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>c===''||c==null)) continue;
    const sku=iSku>=0?String(r[iSku]||'').trim():''; if(!sku) continue;
    const rebaja=iRebaja>=0?String(r[iRebaja]||'').trim():'';
    const letraDesc=(rebaja&&rebaja.toUpperCase()!=='REGULAR')?rebaja:'';
    const anoRaw=iAno>=0?String(r[iAno]||'').trim():'';
    out.push({ sku, nsku:iDesc>=0?String(r[iDesc]||'').trim():'', modelo:iModelo>=0?String(r[iModelo]||'').trim().toUpperCase():'',
      marca:(iMarca>=0?String(r[iMarca]||'').trim().toUpperCase():'')||'SIN MARCA', goa:iGoa>=0?String(r[iGoa]||'').trim().toUpperCase():'',
      seccion:(iSeccion>=0?String(r[iSeccion]||'').trim().toUpperCase():'')||'GENERAL', centro:'',
      norma:iNorma>=0?String(r[iNorma]||'').trim().toUpperCase():'', estatus:iEstatus>=0?String(r[iEstatus]||'').trim().toUpperCase():'',
      ano:anoRaw?(parseInt(anoRaw,10)||null):null,
      oh:num(iOh>=0?r[iOh]:0), precio:num(iPrecio>=0?r[iPrecio]:0), letraDesc,
      ohAant:num(iOhAant>=0?r[iOhAant]:0), montoAant:num(iMontoAant>=0?r[iMontoAant]:0)*1000 });
  }
  // Ventas del evento, si el mismo archivo trae la pestaña "Vtas_Evento" (export SAP diario por SKU).
  // Se indexa por NOMBRE de columna (no posición): el layout de este export cambia si se agregan/quitan
  // columnas (p.ej. GOA/Modelo/Marca), y leer por índice fijo rompe todo silenciosamente.
  let salesRows=null;
  const salesSheetName = wb.SheetNames.find(n=>n.trim()==='Vtas_Evento');
  if(salesSheetName){
    const vrows = XLSX.utils.sheet_to_json(wb.Sheets[salesSheetName],{header:1,defval:'',raw:true});
    const norm=s=>String(s||'').trim();
    const vhead=(vrows[0]||[]).map(norm);
    const vidx=(...names)=>{ for(const n of names){ const i=vhead.indexOf(norm(n)); if(i>=0) return i; } return -1; };
    const iFecha=vidx('Día/Periodo'), iSeccion=vidx('N_Seccion'), iSubcanal=vidx('Subcanal'),
      iGoa=vidx('N_GOA'), iModelo=vidx('Modelo Proveedor'), iSku=vidx('Artículo'), iMarca=vidx('Marca'),
      iEstatus=vidx('N_Estatus'), iNorma=vidx('Norma de Aprovisionamiento'),
      iVentaU=vidx('Vtas. U'), iVentaP=vidx('Vtas. $'), iGM=vidx('GM'), iDescuento=vidx('Total Descuentos');
    salesRows = iSku<0 ? [] : (()=>{ const out2=[];
      for(let i=1;i<vrows.length;i++){ const r=vrows[i]; if(!r||r.every(c=>c===''||c==null)) continue;
        const sku=String(r[iSku]||'').trim(); if(!sku) continue;
        out2.push({ fecha:parseDate(String(r[iFecha]||'')), sku,
          modelo:iModelo>=0?String(r[iModelo]||'').trim().toUpperCase():'',
          marca:iMarca>=0?String(r[iMarca]||'').trim().toUpperCase():'',
          goa:iGoa>=0?String(r[iGoa]||'').trim().toUpperCase():'',
          seccion:(iSeccion>=0?String(r[iSeccion]||'').trim().toUpperCase():'')||'', centro:'',
          subcanal:(iSubcanal>=0?String(r[iSubcanal]||'').trim().toUpperCase():'')||'SIN DATO',
          estatus:iEstatus>=0?String(r[iEstatus]||'').trim().toUpperCase():'',
          norma:iNorma>=0?String(r[iNorma]||'').trim().toUpperCase():'',
          ventaU:iVentaU>=0?(Number(r[iVentaU])||0):0, ventaP:iVentaP>=0?(Number(r[iVentaP])||0)*1000:0,
          utilidad:iGM>=0?(Number(r[iGM])||0):0, totalDescuento:iDescuento>=0?(Number(r[iDescuento])||0)*1000:0 });
      }
      return out2; })();
  }
  return {rows:out,error:null,salesRows};
};
// Ventas del evento — CSV. Primero intenta las columnas exactas de la pestaña "Vtas_Evento" del xlsx
// (mismo nombre, sin importar orden/acentos) para traer subcanal/estatus/norma/goa/marca igual que el xlsx;
// si no calzan, cae al formato genérico simple (SKU, VENTA_$, ...).
const stripAcc=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');
const normHeader=h=>stripAcc(h).toUpperCase().trim().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const parseSalesCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep)); if(rows.length<2) return {rows:[],error:null};
  const Hn=rows[0].map(normHeader);
  const vidx=(...names)=>{ for(const n of names){ const i=Hn.indexOf(n); if(i>=0) return i; } return -1; };
  const iSku=vidx('ARTICULO'), iVtas=vidx('VTAS');
  if(iSku>=0 && iVtas>=0){
    const iFecha=vidx('DIA_PERIODO','FECHA'), iSeccion=vidx('N_SECCION','SECCION'), iSubcanal=vidx('SUBCANAL'),
      iGoa=vidx('N_GOA','GOA','GRUPO_ARTICULOS'), iModelo=vidx('MODELO_PROVEEDOR','MODELO'), iMarca=vidx('MARCA'),
      iEstatus=vidx('N_ESTATUS'), iNorma=vidx('NORMA_DE_APROVISIONAMIENTO'),
      iVentaU=vidx('VTAS_U'), iGM=vidx('GM'), iDescuento=vidx('TOTAL_DESCUENTOS');
    const out2=[];
    for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
      const sku=(r[iSku]||'').trim(); if(!sku) continue;
      out2.push({ fecha:iFecha>=0?parseDate(r[iFecha]):null, sku,
        modelo:iModelo>=0?(r[iModelo]||'').trim().toUpperCase():'',
        marca:iMarca>=0?(r[iMarca]||'').trim().toUpperCase():'',
        goa:iGoa>=0?(r[iGoa]||'').trim().toUpperCase():'',
        seccion:iSeccion>=0?(r[iSeccion]||'').trim().toUpperCase():'', centro:'',
        subcanal:(iSubcanal>=0?(r[iSubcanal]||'').trim().toUpperCase():'')||'SIN DATO',
        estatus:iEstatus>=0?(r[iEstatus]||'').trim().toUpperCase():'',
        norma:iNorma>=0?(r[iNorma]||'').trim().toUpperCase():'',
        ventaU:iVentaU>=0?num(r[iVentaU]):0, ventaP:num(r[iVtas])*1000,
        utilidad:iGM>=0?num(r[iGM]):0, totalDescuento:iDescuento>=0?num(r[iDescuento])*1000:0 });
    }
    return {rows:out2,error:null};
  }
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_'));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const I={fecha:idx('FECHA','DATE','DIA'),goa:idx('GOA','FAMILIA'),sku:idx('SKU','ARTICULO','MATERIAL'),
    modelo:idx('MODELO','MODEL'),marca:idx('MARCA','PROVEEDOR','BRAND'),seccion:idx('SECCION','SECTION'),
    centro:idx('CENTRO','ID_CENTRO','TIENDA'),vu:idx('VENTA_U','UNIDADES','PIEZAS'),
    vp:idx('VENTA_','VENTA$','VENTA_PESOS','VENTAS'),mg:idx('MG','MARGEN'),util:idx('UTILIDAD','UTIL')};
  if(I.sku===-1||I.vp===-1){ return {rows:[],error:'El CSV debe tener mínimo: SKU, VENTA_$'}; }
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    const sku=I.sku>=0?r[I.sku].trim():''; const vp=num(I.vp>=0?r[I.vp]:0); if(!sku||(!vp&&!(I.vu>=0&&num(r[I.vu])))) continue;
    const util=I.util>=0?num(r[I.util]):(I.mg>=0?vp*num(r[I.mg])/100:0);
    out.push({ fecha:I.fecha>=0?parseDate(r[I.fecha]):null, sku, modelo:I.modelo>=0?r[I.modelo].trim().toUpperCase():'',
      marca:I.marca>=0?r[I.marca].trim().toUpperCase():'', goa:I.goa>=0?r[I.goa].trim().toUpperCase():'',
      seccion:I.seccion>=0?r[I.seccion].trim().toUpperCase():'', centro:I.centro>=0?r[I.centro].trim():'',
      ventaU:num(I.vu>=0?r[I.vu]:0), ventaP:vp, utilidad:util });
  }
  return {rows:out,error:null};
};

// ─── MINI COMPONENTS ──────────────────────────────────────────────────────────
const DeltaBadge = ({value,pts=false}) => {
  if(value==null) return <span className="text-gray-400 text-[10px]">Sin LY</span>;
  const pos=value>=0;
  return <span className={`text-[10px] font-black ${pos?'text-emerald-500':'text-red-500'}`}>{pos?'▲':'▼'} {Math.abs(value).toFixed(1)}{pts?' pts':'%'}</span>;
};
const KpiCard = ({label,value,delta,pts,t,isDark}) => {
  const glow = (delta===undefined||delta==null)
    ? (isDark?'shadow-[0_0_22px_rgba(139,92,246,0.35)]':'shadow-[0_0_16px_rgba(139,92,246,0.18)]')
    : delta>=0 ? (isDark?'shadow-[0_0_22px_rgba(16,185,129,0.4)]':'shadow-[0_0_16px_rgba(16,185,129,0.22)]')
    : (isDark?'shadow-[0_0_22px_rgba(239,68,68,0.4)]':'shadow-[0_0_16px_rgba(239,68,68,0.22)]');
  return (
    <div className={`p-4 rounded-xl border text-center transition-shadow duration-300 ${t.cardInner} ${glow}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${t.textMuted}`}>{label}</p>
      <p className={`text-xl font-black mt-1 ${t.textMain}`}>{value}</p>
      {delta!==undefined && <div className="mt-1 flex justify-center"><DeltaBadge value={delta} pts={pts}/></div>}
    </div>
  );
};
const EmptyState = ({Icon,title,sub,t}) => (
  <div className={`p-10 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
    {Icon&&<Icon size={32} className="text-gray-400 mb-3"/>}
    <p className={`text-sm font-bold ${t.textMain}`}>{title}</p>
    {sub&&<p className={`text-xs mt-1 ${t.textMuted}`}>{sub}</p>}
  </div>
);
const ClasifBadge = ({clasif,t}) => {
  const cls = clasif==='depreciado'?t.badgeOrange:clasif==='descuento'?t.badgeEmerald:clasif==='regular'?t.badge:t.badgeRed;
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${cls}`}>{CLASIF_LABEL[clasif]||clasif}</span>;
};
// Popup de cristal — usado para crear evento y editar LY/objetivo
const Modal = ({onClose,children,isDark,wide}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" onClick={onClose}>
    <div className={`absolute inset-0 backdrop-blur-sm ${isDark?'bg-black/60':'bg-black/30'}`}/>
    <div onClick={e=>e.stopPropagation()}
      className={`relative w-full ${wide?'max-w-2xl':'max-w-lg'} max-h-[85vh] overflow-y-auto rounded-2xl border p-6 space-y-4
      shadow-[0_8px_40px_rgba(139,92,246,0.25)] backdrop-blur-2xl
      ${isDark?'bg-zinc-900/70 border-white/10':'bg-white/75 border-white/60'}`}>
      {children}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
export default function ModuleEventos(){
  const gState=useGlobal();
  const theme=gState?.theme||'light';
  const isDark=theme==='dark';
  const themes={
    dark:{appBg:'bg-transparent text-gray-100',card:'bg-zinc-900/80 backdrop-blur-xl border-zinc-800 shadow-sm',cardInner:'bg-zinc-950/70 backdrop-blur-xl border-zinc-800',
      textMain:'text-white',textMuted:'text-gray-400',textAccent1:'text-violet-300',textAccent2:'text-purple-300',border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-violet-500',btnPrimary:'bg-violet-500 text-white hover:bg-violet-400 shadow-[0_0_18px_rgba(139,92,246,0.4)]',
      btnGhost:'bg-zinc-800/80 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      badge:'bg-violet-500/25 text-violet-300 border-violet-400/60',badgeCyan:'bg-cyan-500/20 text-cyan-300 border-cyan-400/50',
      badgeAmber:'bg-amber-600/25 text-amber-400 border-amber-500/60',badgeRed:'bg-rose-500/25 text-rose-300 border-rose-400/60',
      badgeEmerald:'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',badgeOrange:'bg-orange-600/25 text-orange-400 border-orange-500/60'},
    light:{appBg:'bg-transparent text-gray-800',card:'bg-white/80 backdrop-blur-xl border-gray-200 shadow-sm',cardInner:'bg-gray-50/80 backdrop-blur-xl border-gray-200',
      textMain:'text-gray-900',textMuted:'text-gray-500',textAccent1:'text-violet-600',textAccent2:'text-purple-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-violet-500',btnPrimary:'bg-violet-600 text-white hover:bg-violet-700 shadow-md',
      btnGhost:'bg-gray-100/80 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-violet-100 text-violet-700 border-violet-300',badgeCyan:'bg-cyan-100 text-cyan-700 border-cyan-300',
      badgeAmber:'bg-amber-100 text-amber-800 border-amber-300',badgeRed:'bg-rose-100 text-rose-700 border-rose-300',
      badgeEmerald:'bg-emerald-100 text-emerald-700 border-emerald-300',badgeOrange:'bg-orange-100 text-orange-800 border-orange-300'},
  };
  const t=themes[theme]||themes.light;
  const gridC=isDark?'#27272a':'#f0f0f0', axisC=isDark?'#52525b':'#d1d5db', txtC=isDark?'#a1a1aa':'#6b7280';
  const cursorFill=isDark?'rgba(139,92,246,0.14)':'rgba(139,92,246,0.08)'; // glass violeta, en vez del cursor gris/blanco default de recharts
  const lineC=isDark?'#f4f4f5':'#18181b';
  const TTip=({active,payload,label})=>{ if(!active||!payload?.length) return null;
    const d=payload[0].payload;
    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmtM(p.value)}</p>)}
      {d?.vsAA!=null && <p className="mt-1 flex items-center gap-1">vs AA: <DeltaBadge value={d.vsAA}/></p>}</div>; };
  const DiaTTip=({active,payload,label})=>{ if(!active||!payload?.length) return null;
    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {p.dataKey==='margenPct'?fmtP(p.value):fmtM(p.value)}</p>)}</div>; };
  const ModeloTTip=({active,payload,label})=>{ if(!active||!payload?.length) return null;
    const d=payload[0].payload;
    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
      {d.seccion && <p className={t.textMuted}>Sección: {d.seccion}</p>}
      {d.marca && <p className={t.textMuted}>Marca: {d.marca}</p>}
      {d.goa && <p className={t.textMuted}>GOA: {d.goa}</p>}
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmtM(p.value)}</p>)}
      {d.vsAA!=null && <p className="mt-1 flex items-center gap-1">vs AA: <DeltaBadge value={d.vsAA}/></p>}</div>; };

  // ── Event master ──
  const [events,setEvents]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('gop_eventos')||'[]'); }catch{ return []; } });
  const saveEvents=next=>{ setEvents(next); try{ localStorage.setItem('gop_eventos',JSON.stringify(next)); }catch{} };
  const [activeId,setActiveId]=useState(null);
  const active=events.find(e=>e.id===activeId)||null;
  const [showForm,setShowForm]=useState(false);
  const [editingLY,setEditingLY]=useState(false);
  const [reportTab,setReportTab]=useState('resumen'); // 'resumen' | 'desglose'
  const [groupBy,setGroupBy]=useState('marca'); // 'marca' | 'goa'
  const [expanded,setExpanded]=useState(()=>new Set());
  const FILTRO_DIMS=['seccion','marca','goa','norma','estatus','subcanal','clasif'];
  const FILTRO_LABEL={seccion:'Sección',marca:'Marca',goa:'GOA',norma:'Norma',estatus:'Estatus',subcanal:'Subcanal',clasif:'Rebaja'};
  const [filtros,setFiltros]=useState({seccion:[],marca:[],goa:[],norma:[],estatus:[],subcanal:[],clasif:[]});
  const [filtroAbierto,setFiltroAbierto]=useState(null);
  const [filtroQuery,setFiltroQuery]=useState('');
  const toggleFiltroValor=(dim,val)=>setFiltros(f=>{ const s=f[dim].includes(val)?f[dim].filter(v=>v!==val):[...f[dim],val]; return {...f,[dim]:s}; });
  const limpiarFiltro=dim=>setFiltros(f=>({...f,[dim]:[]}));
  const limpiarFiltros=()=>setFiltros({seccion:[],marca:[],goa:[],norma:[],estatus:[],subcanal:[],clasif:[]});
  const nFiltrosActivos=FILTRO_DIMS.reduce((n,d)=>n+(filtros[d].length>0?1:0),0);
  const blankForm={nombre:'',tipo:TIPOS_EVENTO[0],tipoOtro:'',fechaInicio:'',fechaFin:'',objetivo:OBJETIVOS[0],lyVentaP:'',lyMargenPct:'',lyStPct:''};
  const [form,setForm]=useState(blankForm);
  const [exporting,setExporting]=useState(false);

  const handleDownloadPDF=async()=>{
    const node=document.getElementById('eventos-print-area');
    if(!node||exporting) return;
    setExporting(true);
    try{
      const canvas=await html2canvas(node,{
        scale:2, backgroundColor:isDark?'#18181b':'#ffffff', useCORS:true,
        ignoreElements:el=>el.classList?.contains('no-print'),
      });
      const imgData=canvas.toDataURL('image/png');
      const pdf=new jsPDF({orientation:'p',unit:'pt',format:'letter'});
      const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight();
      const imgW=pageW, imgH=canvas.height*imgW/canvas.width;
      let heightLeft=imgH, position=0;
      pdf.addImage(imgData,'PNG',0,position,imgW,imgH);
      heightLeft-=pageH;
      while(heightLeft>0){ position=heightLeft-imgH; pdf.addPage(); pdf.addImage(imgData,'PNG',0,position,imgW,imgH); heightLeft-=pageH; }
      const slug=(active?.nombre||'evento').trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'');
      pdf.save(`resumen_${slug||'evento'}.pdf`);
    }catch(err){ console.error(err); alert('No se pudo generar el PDF. Revisa la consola.'); }
    finally{ setExporting(false); }
  };

  const createEvent=()=>{
    if(!form.nombre.trim()||!form.fechaInicio||!form.fechaFin){ alert('Nombre, fecha inicio y fecha fin son obligatorios.'); return; }
    const ev={ id:Date.now(), nombre:form.nombre.trim(), tipo:form.tipo==='Otro'?(form.tipoOtro.trim()||'Otro'):form.tipo,
      fechaInicio:form.fechaInicio, fechaFin:form.fechaFin, objetivo:form.objetivo,
      lyVentaP:num(form.lyVentaP)||null, lyMargenPct:num(form.lyMargenPct)||null, lyStPct:num(form.lyStPct)||null,
      createdAt:Date.now() };
    saveEvents([ev,...events]); setForm(blankForm); setShowForm(false); setActiveId(ev.id);
  };
  const updateLY=()=>{
    const next=events.map(e=>e.id===activeId?{...e,lyVentaP:num(form.lyVentaP)||null,lyMargenPct:num(form.lyMargenPct)||null,lyStPct:num(form.lyStPct)||null,objetivo:form.objetivo}:e);
    saveEvents(next); setEditingLY(false);
  };
  const deleteEvent=id=>{
    if(!window.confirm('¿Eliminar este evento y sus datos (snapshot + ventas)? No se puede deshacer.')) return;
    saveEvents(events.filter(e=>e.id!==id)); idbDel(`snap_${id}`); idbDel(`sales_${id}`);
    if(activeId===id) setActiveId(null);
  };

  // ── Snapshot / ventas del evento activo (IndexedDB) ──
  const [snapRows,setSnapRows]=useState([]);
  const [salesRows,setSalesRows]=useState([]);
  const snapRef=useRef(null), salesRef=useRef(null);

  useEffect(()=>{
    if(!activeId){ setSnapRows([]); setSalesRows([]); return; }
    setExpanded(new Set());
    Promise.all([idbGet(`snap_${activeId}`),idbGet(`sales_${activeId}`)]).then(([s,v])=>{
      setSnapRows(Array.isArray(s)?s:[]); setSalesRows(Array.isArray(v)?v:[]);
    }).catch(()=>{});
  },[activeId]);

  useEffect(()=>{ if(snapRows.length===0 && reportTab==='desglose') setReportTab('resumen'); },[snapRows.length,reportTab]);

  const uploadSnapshot=e=>{
    const file=e.target.files[0]; if(!file) return;
    if(snapRows.length>0 && !window.confirm('Ya existe un snapshot de arranque para este evento (inmutable por diseño). Subir uno nuevo lo REEMPLAZARÁ. ¿Continuar?')){
      if(snapRef.current) snapRef.current.value=''; return;
    }
    const finish=({rows,error,salesRows:sr})=>{
      if(error){ alert(error); if(snapRef.current) snapRef.current.value=''; return; }
      if(rows.length===0){ alert('No se encontraron filas válidas en el archivo.'); if(snapRef.current) snapRef.current.value=''; return; }
      setSnapRows(rows); idbSet(`snap_${activeId}`,rows).catch(()=>{});
      if(sr && sr.length){ setSalesRows(sr); idbSet(`sales_${activeId}`,sr).catch(()=>{}); }
      if(snapRef.current) snapRef.current.value='';
    };
    if(/\.xlsx?$/i.test(file.name)){
      parseSnapshotXLSX(file).then(finish).catch(()=>{ alert('No se pudo leer el archivo .xlsx.'); if(snapRef.current) snapRef.current.value=''; });
      return;
    }
    const reader=new FileReader();
    reader.onload=ev=>finish(parseSnapshotCSV(ev.target.result));
    reader.readAsText(file,'ISO-8859-1');
  };
  const uploadSales=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ const {rows,error}=parseSalesCSV(ev.target.result);
      if(error){ alert(error); return; }
      if(rows.length===0){ alert('No se encontraron filas válidas en el CSV.'); return; }
      setSalesRows(rows); idbSet(`sales_${activeId}`,rows).catch(()=>{});
      if(salesRef.current) salesRef.current.value='';
    };
    reader.readAsText(file,'ISO-8859-1');
  };
  const clearSnapshot=()=>{
    if(!window.confirm('¿Eliminar el snapshot cargado de este evento?')) return;
    setSnapRows([]); idbDel(`snap_${activeId}`).catch(()=>{});
    if(snapRef.current) snapRef.current.value='';
  };
  const clearSales=()=>{
    if(!window.confirm('¿Eliminar las ventas cargadas de este evento?')) return;
    setSalesRows([]); idbDel(`sales_${activeId}`).catch(()=>{});
    if(salesRef.current) salesRef.current.value='';
  };

  // ── Join pesado (snapshot + ventas → SKU, clasificación) — solo recalcula al cargar archivos ──
  const joined=useMemo(()=>{
    // Año actual / año anterior — se detecta solo por el año de las fechas en Vtas_Evento (sin config manual)
    const years=[...new Set(salesRows.map(r=>r.fecha?r.fecha.getFullYear():null).filter(Boolean))].sort((a,b)=>b-a);
    const anoActual=years[0]??null;
    const anoAnterior=years.length>1?years[1]:(anoActual?anoActual-1:null);
    const hasLY=anoAnterior!=null && years.includes(anoAnterior);
    // El snapshot (OH y Montos) puede traer 2 bloques apilados por año (columna "Año"). Si existe, el snapshot
    // "de hoy" usa solo el bloque del año actual, y hay un bloque aparte para el año anterior (misma letra/rebaja
    // que tenía ESE año). Archivos viejos sin columna "Año" se tratan como un solo bloque (comportamiento previo).
    const hasAnoCol = snapRows.some(r=>r.ano!=null);
    const snapRowsActual = hasAnoCol ? snapRows.filter(r=>r.ano===anoActual || r.ano==null) : snapRows;
    const snapRowsLY = hasAnoCol && hasLY ? snapRows.filter(r=>r.ano===anoAnterior) : [];
    const buildSnapBySku = rows => { const m={};
      rows.forEach(r=>{ const k=r.sku;
        if(!m[k]) m[k]={sku:k,nsku:r.nsku,modelo:r.modelo,marca:r.marca,goa:r.goa,seccion:r.seccion,norma:r.norma||'',estatus:r.estatus||'',oh:0,precio:0,letraDesc:r.letraDesc,ohAant:0,montoAant:0};
        m[k].oh+=r.oh;
        m[k].ohAant+=r.ohAant||0; m[k].montoAant+=r.montoAant||0;
        if(r.precio>m[k].precio) m[k].precio=r.precio;
        if(r.letraDesc && !m[k].letraDesc) m[k].letraDesc=r.letraDesc;
      });
      return m; };
    const snapBySku = buildSnapBySku(snapRowsActual);
    const snapBySkuLY = hasLY ? buildSnapBySku(snapRowsLY) : {};
    const salesBySkuFull={};
    salesRows.forEach(r=>{
      const k=r.sku;
      if(!salesBySkuFull[k]) salesBySkuFull[k]={ventaU:0,ventaP:0};
      salesBySkuFull[k].ventaU+=r.ventaU; salesBySkuFull[k].ventaP+=r.ventaP;
    });
    const salesBySkuFullLY={};
    if(hasLY) salesRows.filter(r=>r.fecha&&r.fecha.getFullYear()===anoAnterior).forEach(r=>{
      const k=r.sku;
      if(!salesBySkuFullLY[k]) salesBySkuFullLY[k]={ventaU:0,ventaP:0};
      salesBySkuFullLY[k].ventaU+=r.ventaU; salesBySkuFullLY[k].ventaP+=r.ventaP;
    });
    // Clasificación (estructural, no depende de filtros): depreciado = liquidación permanente;
    // descuento = letra temporal (MS) o venta bajo lista sin letra; regular = resto.
    const buildClasif = (snapMap, ventaMap) => { const m={};
      const allSkus=new Set([...Object.keys(snapMap),...Object.keys(ventaMap)]);
      allSkus.forEach(sku=>{
        const s=snapMap[sku], v=ventaMap[sku];
        if(!s){ m[sku]='sin_snapshot'; return; }
        const tag=(s.letraDesc||'').trim().toUpperCase();
        if(tag==='MS'){ m[sku]='descuento'; return; }
        if(tag){ m[sku]='depreciado'; return; }
        const realizado = v&&v.ventaU>0 ? v.ventaP/v.ventaU : null;
        m[sku] = (realizado!=null && s.precio>0 && realizado<s.precio*0.99) ? 'descuento' : 'regular';
      });
      return m; };
    const clasifBySku = buildClasif(snapBySku, salesBySkuFull);
    // Clasificación del año anterior: usa el snapshot/letra que tenía ESE año (no la de hoy aplicada al pasado).
    // Sin columna "Año" o sin bloque histórico, cae a la clasificación de hoy (comportamiento previo, como fallback).
    const clasifBySkuLY = (hasLY && hasAnoCol && Object.keys(snapBySkuLY).length>0)
      ? buildClasif(snapBySkuLY, salesBySkuFullLY)
      : clasifBySku;
    const uniq=arr=>[...new Set(arr.filter(Boolean))].sort();
    const opciones={
      seccion: uniq([...Object.values(snapBySku).map(s=>s.seccion),...salesRows.map(r=>r.seccion)]),
      marca: uniq(Object.values(snapBySku).map(s=>s.marca)),
      goa: uniq(Object.values(snapBySku).map(s=>s.goa)),
      norma: uniq([...Object.values(snapBySku).map(s=>s.norma),...salesRows.map(r=>r.norma)]),
      estatus: uniq([...Object.values(snapBySku).map(s=>s.estatus),...salesRows.map(r=>r.estatus)]),
      subcanal: uniq(salesRows.map(r=>r.subcanal)),
      clasif: uniq(Object.values(clasifBySku)),
    };
    return { snapBySku, clasifBySku, clasifBySkuLY, opciones, anoActual, anoAnterior, hasLY,
      nSkuSnap:Object.keys(snapBySku).length, nSkuVenta:Object.keys(salesBySkuFull).length };
  },[snapRows,salesRows]);

  // ── Cálculos filtrados — rápido, solo agrupa lo ya unido ──
  const calc=useMemo(()=>{
    if(!active) return null;
    const {snapBySku,clasifBySku,clasifBySkuLY,opciones}=joined;
    const passSnap=sku=>{
      const s=snapBySku[sku];
      const v=f=>filtros[f].length===0 || filtros[f].includes(s?.[f]||'');
      const passClasif=filtros.clasif.length===0 || filtros.clasif.includes(clasifBySku[sku]||'sin_snapshot');
      return v('seccion')&&v('marca')&&v('goa')&&v('norma')&&v('estatus')&&passClasif;
    };
    const salesF=salesRows.filter(r=>
      (filtros.subcanal.length===0||filtros.subcanal.includes(r.subcanal)) && passSnap(r.sku));
    // Año actual vs año anterior — detectado solo, por año de fecha (si la data trae 2 años en Vtas_Evento).
    // Filas sin fecha se tratan como "actual" (no se pueden ubicar en el histórico).
    const {anoActual,anoAnterior,hasLY}=joined;
    const salesFActual=salesF.filter(r=>!r.fecha||r.fecha.getFullYear()!==anoAnterior);
    const salesFLY=hasLY?salesF.filter(r=>r.fecha&&r.fecha.getFullYear()===anoAnterior):[];
    const pctVs=(act,ly)=>(ly>0)?(act-ly)/ly*100:null;
    const salesBySku={};
    let fMin=null,fMax=null;
    salesFActual.forEach(r=>{
      const k=r.sku;
      if(!salesBySku[k]) salesBySku[k]={sku:k,modelo:r.modelo,marca:r.marca,goa:r.goa,seccion:r.seccion,ventaU:0,ventaP:0,utilidad:0};
      salesBySku[k].ventaU+=r.ventaU; salesBySku[k].ventaP+=r.ventaP; salesBySku[k].utilidad+=r.utilidad;
      if(r.fecha){ if(!fMin||r.fecha<fMin) fMin=r.fecha; if(!fMax||r.fecha>fMax) fMax=r.fecha; }
    });
    const salesBySkuLY={};
    salesFLY.forEach(r=>{
      const k=r.sku;
      if(!salesBySkuLY[k]) salesBySkuLY[k]={sku:k,modelo:r.modelo,marca:r.marca,goa:r.goa,seccion:r.seccion,ventaU:0,ventaP:0,utilidad:0};
      salesBySkuLY[k].ventaU+=r.ventaU; salesBySkuLY[k].ventaP+=r.ventaP; salesBySkuLY[k].utilidad+=r.utilidad;
    });
    const allSkus=new Set([...Object.keys(snapBySku).filter(passSnap),...Object.keys(salesBySku)]);
    const detail=[]; let sinSnapshot=0;
    allSkus.forEach(sku=>{
      const s=snapBySku[sku], v=salesBySku[sku]||{ventaU:0,ventaP:0,utilidad:0};
      const ohInicio=s?.oh||0, precio=s?.precio||0;
      const clasif=clasifBySku[sku]||'sin_snapshot';
      if(clasif==='sin_snapshot') sinSnapshot++;
      const remanente = s ? Math.max(0,ohInicio-v.ventaU) : null;
      detail.push({ sku, marca:v.marca||s?.marca||'', goa:v.goa||s?.goa||'', seccion:v.seccion||s?.seccion||'GENERAL',
        modelo:v.modelo||s?.modelo||s?.nsku||'', clasif, ohInicio, precio, remanente,
        montoInicio: ohInicio*precio, montoRemanente:(remanente||0)*precio,
        ohAant:s?.ohAant||0, montoAant:s?.montoAant||0,
        ventaU:v.ventaU, ventaP:v.ventaP, utilidad:v.utilidad,
        stPct: ohInicio>0 ? Math.min(100,(v.ventaU/ohInicio)*100) : null });
    });
    const rollup = rows => { const ventaP=rows.reduce((s,r)=>s+r.ventaP,0), ventaU=rows.reduce((s,r)=>s+r.ventaU,0),
      utilidad=rows.reduce((s,r)=>s+r.utilidad,0), ohInicio=rows.reduce((s,r)=>s+r.ohInicio,0),
      remanente=rows.reduce((s,r)=>s+(r.remanente||0),0), montoRemanente=rows.reduce((s,r)=>s+(r.montoRemanente||0),0);
      return { ventaP, ventaU, utilidad, margenPct: ventaP>0?utilidad/ventaP*100:null,
        ohInicio, remanente, montoRemanente, stPct: ohInicio>0?Math.min(100,ventaU/ohInicio*100):null }; };
    const total=rollup(detail);
    const regular=rollup(detail.filter(r=>r.clasif==='regular'));
    const descuento=rollup(detail.filter(r=>r.clasif==='descuento'));
    const depreciado=rollup(detail.filter(r=>r.clasif==='depreciado'));
    // ── Año anterior (mismos SKU, misma clasificación actual) — solo venta, no hay OH histórico ──
    const rollupSimple = rows => { const ventaP=rows.reduce((s,r)=>s+r.ventaP,0), ventaU=rows.reduce((s,r)=>s+r.ventaU,0),
      utilidad=rows.reduce((s,r)=>s+r.utilidad,0);
      return { ventaP, ventaU, utilidad, margenPct: ventaP>0?utilidad/ventaP*100:null }; };
    const detailLY=Object.entries(salesBySkuLY).map(([sku,v])=>({ sku, clasif:clasifBySkuLY[sku]||'sin_snapshot',
      seccion:v.seccion||snapBySku[sku]?.seccion||'GENERAL', modelo:v.modelo||snapBySku[sku]?.modelo||sku, ...v }));
    const totalLY=rollupSimple(detailLY);
    const regularLY=rollupSimple(detailLY.filter(r=>r.clasif==='regular'));
    const descuentoLY=rollupSimple(detailLY.filter(r=>r.clasif==='descuento'));
    const depreciadoLY=rollupSimple(detailLY.filter(r=>r.clasif==='depreciado'));
    const attachVsAA=(r,rLY)=>{ r.vsAA=hasLY?pctVs(r.ventaP,rLY.ventaP):null;
      r.vsAA_u=hasLY?pctVs(r.ventaU,rLY.ventaU):null;
      r.vsAA_mg=hasLY?pctVs(r.utilidad,rLY.utilidad):null; };
    attachVsAA(total,totalLY); attachVsAA(regular,regularLY); attachVsAA(descuento,descuentoLY); attachVsAA(depreciado,depreciadoLY);
    // Breakdown por categoría (sección) — venta/margen/ST, solo secciones con venta
    const catMap={};
    detail.forEach(r=>{ const k=r.seccion||'GENERAL'; if(!catMap[k]) catMap[k]=[]; catMap[k].push(r); });
    const catMapLY={}; detailLY.forEach(r=>{ const k=r.seccion||'GENERAL'; catMapLY[k]=(catMapLY[k]||0)+r.ventaP; });
    const categorias=Object.entries(catMap).map(([seccion,rows])=>{ const rl=rollup(rows);
        return {seccion,...rl, vsAA:hasLY?pctVs(rl.ventaP,catMapLY[seccion]||0):null}; })
      .filter(c=>c.ventaP>0).sort((a,b)=>b.ventaP-a.ventaP);
    // Top 10 / Bottom 10 por modelo (agrega SKU → modelo)
    const modMap={};
    detail.forEach(r=>{ const k=r.modelo||r.sku;
      if(!modMap[k]) modMap[k]={modelo:k,marca:r.marca,goa:r.goa,seccion:r.seccion,ventaP:0,ventaU:0,ohInicio:0,remanente:0,montoRemanente:0};
      modMap[k].ventaP+=r.ventaP; modMap[k].ventaU+=r.ventaU; modMap[k].ohInicio+=r.ohInicio;
      modMap[k].remanente+=r.remanente||0; modMap[k].montoRemanente+=r.montoRemanente||0; });
    const modMapLY={}; detailLY.forEach(r=>{ const k=r.modelo||r.sku; modMapLY[k]=(modMapLY[k]||0)+r.ventaP; });
    const modArr=Object.values(modMap).map(m=>({...m, stPct: m.ohInicio>0?Math.min(100,m.ventaU/m.ohInicio*100):null,
      vsAA: hasLY?pctVs(m.ventaP,modMapLY[m.modelo]||0):null}));
    const topModelo=modArr.filter(m=>m.ventaP>0).sort((a,b)=>b.ventaP-a.ventaP).slice(0,10);
    const bottom10=modArr.filter(m=>m.ohInicio>0).sort((a,b)=>a.ventaP-b.ventaP).slice(0,10);
    // Por día (combo venta+margen), subcanal, estatus, norma — desde ventas filtradas del año actual
    const porDiaMap={};
    salesFActual.forEach(r=>{
      if(!r.fecha) return;
      const key=r.fecha.toISOString().slice(0,10);
      if(!porDiaMap[key]) porDiaMap[key]={fecha:key,regular:0,descuento:0,depreciado:0,ventaP:0,utilidad:0};
      const c=clasifBySku[r.sku]||'sin_snapshot';
      if(porDiaMap[key][c]!=null) porDiaMap[key][c]+=r.ventaP;
      porDiaMap[key].ventaP+=r.ventaP; porDiaMap[key].utilidad+=r.utilidad;
    });
    const porDiaMapLY={};
    salesFLY.forEach(r=>{ if(!r.fecha) return;
      const label=r.fecha.toISOString().slice(8,10)+'/'+r.fecha.toISOString().slice(5,7);
      porDiaMapLY[label]=(porDiaMapLY[label]||0)+r.ventaP; });
    const porDia=Object.values(porDiaMap).sort((a,b)=>a.fecha<b.fecha?-1:1)
      .map(d=>{ const label=d.fecha.slice(8,10)+'/'+d.fecha.slice(5,7);
        return {...d, label, margenPct: d.ventaP>0?d.utilidad/d.ventaP*100:null, ventaPLY: hasLY?(porDiaMapLY[label]??null):null}; });
    const groupSum=(key,rows)=>{ const m={}; rows.forEach(r=>{ const k=r[key]||'SIN DATO'; m[k]=(m[k]||0)+r.ventaP; }); return m; };
    const groupCombined=key=>{ const mAct=groupSum(key,salesFActual), mLY=groupSum(key,salesFLY);
      return Object.entries(mAct).filter(([,ventaP])=>ventaP!==0)
        .map(([name,ventaP])=>({name,ventaP,vsAA:hasLY?pctVs(ventaP,mLY[name]||0):null}))
        .sort((a,b)=>b.ventaP-a.ventaP); };
    const porSubcanal=groupCombined('subcanal');
    const porEstatus=groupCombined('estatus');
    const porNorma=groupCombined('norma');
    const porGoa=groupCombined('goa').slice(0,12);
    // Deltas vs LY — usa la data del propio archivo si trae año anterior; si no, cae a los campos manuales del evento
    const deltaVentaP = hasLY ? total.vsAA : (active.lyVentaP ? (total.ventaP-active.lyVentaP)/active.lyVentaP*100 : null);
    const deltaMargen = hasLY ? (totalLY.margenPct!=null && total.margenPct!=null ? total.margenPct-totalLY.margenPct : null)
      : (active.lyMargenPct!=null && total.margenPct!=null ? total.margenPct-active.lyMargenPct : null);
    const deltaST = active.lyStPct!=null && total.stPct!=null ? total.stPct-active.lyStPct : null;

    // ── Desglose de inventario Regular / Descuento / Depreciado (valor $, no venta) ──
    const invRows=detail.filter(r=>r.clasif!=='sin_snapshot');
    const sumByClasif = rows => {
      const out={};
      ['regular','descuento','depreciado'].forEach(k=>{
        const rs=rows.filter(r=>r.clasif===k);
        out[k]={ oh:rs.reduce((s,r)=>s+r.ohInicio,0), ohA:rs.reduce((s,r)=>s+(r.remanente||0),0),
          monto:rs.reduce((s,r)=>s+r.montoInicio,0), montoA:rs.reduce((s,r)=>s+r.montoRemanente,0),
          montoAant:rs.reduce((s,r)=>s+(r.montoAant||0),0) };
      });
      out.total={ oh:rows.reduce((s,r)=>s+r.ohInicio,0), ohA:rows.reduce((s,r)=>s+(r.remanente||0),0),
        monto:rows.reduce((s,r)=>s+r.montoInicio,0), montoA:rows.reduce((s,r)=>s+r.montoRemanente,0),
        montoAant:rows.reduce((s,r)=>s+(r.montoAant||0),0) };
      return out;
    };
    const grand=sumByClasif(invRows);
    const buildTree = subKey => {
      const bySeccion={};
      invRows.forEach(r=>{ const secc=r.seccion||'GENERAL'; if(!bySeccion[secc]) bySeccion[secc]=[]; bySeccion[secc].push(r); });
      return Object.entries(bySeccion).map(([seccion,rows])=>{
        const subMap={};
        rows.forEach(r=>{ const sv=r[subKey]||'SIN DATO'; if(!subMap[sv]) subMap[sv]=[]; subMap[sv].push(r); });
        const subs=Object.entries(subMap).map(([nombre,rs])=>({nombre,...sumByClasif(rs)})).sort((a,b)=>b.total.montoA-a.total.montoA);
        return { seccion, ...sumByClasif(rows), subs };
      }).sort((a,b)=>b.total.montoA-a.total.montoA);
    };
    const treeMarca=buildTree('marca');
    const treeGoa=buildTree('goa');

    return { total, regular, descuento, depreciado, categorias, topModelo, bottom10, sinSnapshot, fMin, fMax,
      deltaVentaP, deltaMargen, deltaST, nSkuSnap:joined.nSkuSnap, nSkuVenta:joined.nSkuVenta,
      grand, treeMarca, treeGoa, porDia, porSubcanal, porEstatus, porNorma, porGoa, opciones,
      hasLY, anoActual, anoAnterior };
  },[active,joined,salesRows,filtros]);

  const toggleExpand=key=>setExpanded(s=>{ const n=new Set(s); n.has(key)?n.delete(key):n.add(key); return n; });
  const tree = groupBy==='marca' ? calc?.treeMarca : calc?.treeGoa;

  // ═══ VISTA: LISTA DE EVENTOS ═══
  if(!activeId){
    return (
      <div className={`min-h-screen p-4 md:p-6 space-y-5 ${t.appBg}`}>
        <div className={`p-5 rounded-2xl border flex items-center justify-between flex-wrap gap-4 ${t.card}`}>
          <div className="flex items-center gap-3">
            <span className={`p-2 rounded-xl ${isDark?'bg-violet-500/20':'bg-violet-50'}`}>
              <Icons.Tag size={22} className={t.textAccent1}/>
            </span>
            <div>
              <h1 className={`text-2xl font-black tracking-tight leading-none ${t.textMain}`}>Eventos</h1>
              <p className={`text-xs mt-1 ${t.textMuted}`}>Eventos promocionales · Detalle por SKU, venta, margen, sell-through y remanente</p>
            </div>
          </div>
          <button onClick={()=>setShowForm(true)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold ${t.btnPrimary}`}>
            <Icons.Plus size={14}/> Nuevo evento
          </button>
        </div>

        {showForm && (
          <Modal onClose={()=>{setShowForm(false);setForm(blankForm);}} isDark={isDark} wide>
            <h3 className={`text-base font-black ${t.textMain}`}>Nuevo evento</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Nombre del evento</label>
                <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej. BTS 2026"
                  className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Tipo</label>
                <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}>
                  {TIPOS_EVENTO.map(x=><option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              {form.tipo==='Otro' && (
                <div className="col-span-2">
                  <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Nombre del tipo</label>
                  <input value={form.tipoOtro} onChange={e=>setForm(f=>({...f,tipoOtro:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
                </div>
              )}
              <div>
                <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Fecha inicio</label>
                <input type="date" value={form.fechaInicio} onChange={e=>setForm(f=>({...f,fechaInicio:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Fecha fin</label>
                <input type="date" value={form.fechaFin} onChange={e=>setForm(f=>({...f,fechaFin:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Objetivo</label>
                <select value={form.objetivo} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}>
                  {OBJETIVOS.map(x=><option key={x} value={x}>{x}</option>)}
                </select>
              </div>
            </div>
            <div className={`pt-3 border-t ${t.border}`}>
              <p className={`text-[10px] font-bold uppercase mb-2 ${t.textMuted}`}>Comparativo LY (opcional — captúralo si lo tienes a mano)</p>
              <div className="grid grid-cols-3 gap-3">
                <input value={form.lyVentaP} onChange={e=>setForm(f=>({...f,lyVentaP:e.target.value}))} placeholder="Venta $ LY" className={`px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
                <input value={form.lyMargenPct} onChange={e=>setForm(f=>({...f,lyMargenPct:e.target.value}))} placeholder="Margen % LY" className={`px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
                <input value={form.lyStPct} onChange={e=>setForm(f=>({...f,lyStPct:e.target.value}))} placeholder="Sell-through % LY" className={`px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>{setShowForm(false);setForm(blankForm);}} className={`px-4 py-2 rounded-lg text-xs font-bold border ${t.btnGhost}`}>Cancelar</button>
              <button onClick={createEvent} className={`px-4 py-2 rounded-lg text-xs font-bold ${t.btnPrimary}`}>Crear evento</button>
            </div>
          </Modal>
        )}

        {events.length===0 ? (
          <EmptyState Icon={Icons.Tag} title="Sin eventos capturados" sub="Crea tu primer evento promocional para empezar a bajar al detalle por SKU." t={t}/>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(ev=>(
              <button key={ev.id} onClick={()=>setActiveId(ev.id)} className={`text-left p-4 rounded-xl border transition-all hover:scale-[1.01] hover:shadow-[0_0_24px_rgba(139,92,246,0.25)] ${t.card}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${t.badge}`}>{ev.tipo}</span>
                  <Icons.Trash2 size={13} className="text-gray-400 hover:text-red-400" onClick={e=>{e.stopPropagation();deleteEvent(ev.id);}}/>
                </div>
                <p className={`text-sm font-black ${t.textMain}`}>{ev.nombre}</p>
                <p className={`text-[11px] mt-1 ${t.textMuted}`}>{ev.fechaInicio} → {ev.fechaFin}</p>
                <p className={`text-[10px] mt-1 ${t.textAccent2}`}>{ev.objetivo}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══ VISTA: RESUMEN EJECUTIVO DEL EVENTO ═══
  return (
    <div className={`p-6 space-y-5 ${t.appBg}`}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #eventos-print-area, #eventos-print-area * { visibility: visible; }
          #eventos-print-area { position: absolute; left:0; top:0; width:100%; padding:16px; }
          .no-print { display:none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <button onClick={()=>setActiveId(null)} className={`flex items-center gap-1 text-xs font-bold ${t.textMuted} hover:${t.textMain}`}>
          <Icons.ChevronLeft size={14}/> Eventos
        </button>
        <div className="flex gap-2">
          <button onClick={handleDownloadPDF} disabled={exporting} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50 ${t.btnGhost}`}>
            <Icons.Download size={13}/> {exporting?'Generando PDF…':'Descargar PDF'}
          </button>
          <button onClick={()=>{setEditingLY(true);setForm(f=>({...f,lyVentaP:active.lyVentaP||'',lyMargenPct:active.lyMargenPct||'',lyStPct:active.lyStPct||'',objetivo:active.objetivo}));}}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${t.btnGhost}`}>Editar LY / objetivo</button>
        </div>
      </div>

      {editingLY && (
        <Modal onClose={()=>setEditingLY(false)} isDark={isDark} wide>
          <h3 className={`text-base font-black ${t.textMain}`}>Editar LY / Objetivo</h3>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Objetivo</label>
              <select value={form.objetivo} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}>
                {OBJETIVOS.map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Venta $ LY</label>
              <input value={form.lyVentaP} onChange={e=>setForm(f=>({...f,lyVentaP:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
            </div>
            <div>
              <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Margen % LY</label>
              <input value={form.lyMargenPct} onChange={e=>setForm(f=>({...f,lyMargenPct:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
            </div>
            <div>
              <label className={`text-[10px] font-bold uppercase ${t.textMuted}`}>Sell-through % LY</label>
              <input value={form.lyStPct} onChange={e=>setForm(f=>({...f,lyStPct:e.target.value}))} className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${t.input}`}/>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={()=>setEditingLY(false)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${t.btnGhost}`}>Cancelar</button>
            <button onClick={updateLY} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${t.btnPrimary}`}>Guardar</button>
          </div>
        </Modal>
      )}

      <svg width="0" height="0" style={{position:'absolute'}}>
        <defs>
          {Object.entries(CLASIF_COLOR).map(([k,hex])=>(
            <React.Fragment key={k}>
              <linearGradient id={`${CLASIF_GRAD[k]}V`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hex} stopOpacity="1"/>
                <stop offset="100%" stopColor={hex} stopOpacity="0.72"/>
              </linearGradient>
              <linearGradient id={`${CLASIF_GRAD[k]}H`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={hex} stopOpacity="0.72"/>
                <stop offset="100%" stopColor={hex} stopOpacity="1"/>
              </linearGradient>
            </React.Fragment>
          ))}
        </defs>
      </svg>

      <div id="eventos-print-area" className="space-y-5">
        <div className={`p-5 rounded-xl border ${t.card}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${t.badge}`}>{active.tipo}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${t.badgeCyan}`}>{active.objetivo}</span>
              </div>
              <h2 className={`text-xl font-black mt-2 ${t.textMain}`}>{active.nombre}</h2>
              <p className={`text-xs mt-1 ${t.textMuted}`}>{active.fechaInicio} → {active.fechaFin}
                {calc?.fMin && ` · Venta capturada: ${calc.fMin.toLocaleDateString('es-MX')} – ${calc.fMax.toLocaleDateString('es-MX')}`}</p>
            </div>

            {/* Carga de datos — compacto */}
            <div className="flex items-center gap-1 no-print">
              <input ref={snapRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={uploadSnapshot}/>
              <button onClick={()=>snapRef.current?.click()} title='Snapshot arranque (xlsx/csv) — si trae la pestaña "Vtas_Evento", las ventas se cargan solas'
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${t.btnGhost}`}>
                <Icons.Upload size={12}/> {snapRows.length>0 ? `Snapshot (${joined.nSkuSnap})` : 'Snapshot'}
              </button>
              {snapRows.length>0 && <button onClick={clearSnapshot} title="Eliminar snapshot" className={`p-1.5 rounded-lg border ${t.btnGhost} opacity-60 hover:opacity-100`}><Icons.Trash2 size={12}/></button>}
              <input ref={salesRef} type="file" accept=".csv,.txt" className="hidden" onChange={uploadSales}/>
              <button onClick={()=>salesRef.current?.click()} title="CSV Ventas del evento (opcional)"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${t.btnGhost}`}>
                <Icons.Upload size={12}/> {salesRows.length>0 ? `Ventas (${joined.nSkuVenta})` : 'Ventas'}
              </button>
              {salesRows.length>0 && <button onClick={clearSales} title="Eliminar ventas" className={`p-1.5 rounded-lg border ${t.btnGhost} opacity-60 hover:opacity-100`}><Icons.Trash2 size={12}/></button>}
            </div>
          </div>
          {(snapRows.length>0 || calc?.sinSnapshot>0) && (
            <div className="flex flex-wrap gap-2 mt-3 no-print">
              {snapRows.length>0 && <span className={`text-[10px] px-2 py-1 rounded-full border ${t.badgeAmber}`}>Snapshot inmutable — reemplazar pide confirmación</span>}
              {calc?.sinSnapshot>0 && <span className={`text-[10px] px-2 py-1 rounded-full border ${t.badgeRed}`}>{calc.sinSnapshot} SKU con venta sin snapshot inicial (no cuentan en remanente/ST)</span>}
            </div>
          )}
        </div>

        {(!calc || (snapRows.length===0 && salesRows.length===0)) ? (
          <EmptyState Icon={Icons.Upload} title="Sube el snapshot de inventario y el CSV de ventas" sub="Con ambos se calculan venta, margen, sell-through y remanente automáticamente." t={t}/>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 no-print">
              {[['resumen','Resumen Ejecutivo'],...(snapRows.length>0?[['desglose','Regular · Descuento · Depreciado']]:[])].map(([k,lbl])=>(
                <button key={k} onClick={()=>setReportTab(k)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${reportTab===k?t.btnPrimary:t.btnGhost}`}>{lbl}</button>
              ))}
            </div>

            {/* Filtros — aplican a todo el dashboard (resumen y desglose) */}
            <div className="flex flex-wrap items-center gap-2 no-print relative">
              {filtroAbierto && <div className="fixed inset-0 z-10" onClick={()=>setFiltroAbierto(null)}/>}
              {FILTRO_DIMS.map(dim=>{
                const opts=calc.opciones[dim]||[];
                if(opts.length===0) return null;
                const n=filtros[dim].length;
                const dimLabel=val=>dim==='clasif'?(CLASIF_LABEL[val]||val):val;
                const optsF = filtroQuery.trim() ? opts.filter(v=>dimLabel(v).toUpperCase().includes(filtroQuery.trim().toUpperCase())) : opts;
                return (
                  <div key={dim} className="relative">
                    <button onClick={()=>{ setFiltroAbierto(o=>o===dim?null:dim); setFiltroQuery(''); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border ${n>0?t.badge:t.btnGhost}`}>
                      {FILTRO_LABEL[dim]}{n>0?` (${n})`:''} <Icons.ChevronDown size={11}/>
                    </button>
                    {filtroAbierto===dim && (
                      <div className={`absolute z-20 mt-1 w-56 max-h-72 overflow-y-auto p-2 rounded-lg border shadow-xl ${t.card}`}>
                        {opts.length>6 && (
                          <input autoFocus value={filtroQuery} onChange={e=>setFiltroQuery(e.target.value)} placeholder="Buscar..."
                            onClick={e=>e.stopPropagation()}
                            className={`w-full mb-1.5 px-2 py-1 rounded-md border text-[11px] ${t.input}`}/>
                        )}
                        {n>0 && <button onClick={()=>limpiarFiltro(dim)} className={`text-[10px] font-bold mb-1 ${t.textMuted} hover:underline`}>Limpiar</button>}
                        {optsF.length===0 && <p className={`text-[10px] py-1 ${t.textMuted}`}>Sin resultados</p>}
                        {optsF.map(val=>(
                          <label key={val} className={`flex items-center gap-2 py-1 text-[11px] cursor-pointer ${t.textMain}`}>
                            <input type="checkbox" checked={filtros[dim].includes(val)} onChange={()=>toggleFiltroValor(dim,val)}/>
                            <span className="truncate">{dimLabel(val)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {nFiltrosActivos>0 && (
                <button onClick={limpiarFiltros} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border ${t.badgeRed}`}>
                  <Icons.X size={11}/> Limpiar filtros ({nFiltrosActivos})
                </button>
              )}
            </div>

            {reportTab==='resumen' && (
              <>
                {calc.hasLY && (
                  <span className={`inline-flex items-center gap-1 w-fit text-[10px] font-bold px-2 py-1 rounded-full border ${t.badge}`}>
                    <Icons.Calendar size={11}/> Comparando {calc.anoActual} vs {calc.anoAnterior} (detectado de la data)
                  </span>
                )}
                {/* KPIs totales */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard label="Venta $" value={fmtM(calc.total.ventaP)} delta={calc.deltaVentaP} t={t} isDark={isDark}/>
                  <KpiCard label="Venta U" value={fmt(calc.total.ventaU)} t={t} isDark={isDark}/>
                  <KpiCard label="Margen %" value={fmtP(calc.total.margenPct)} delta={calc.deltaMargen} pts t={t} isDark={isDark}/>
                  <KpiCard label="Margen $" value={fmtM(calc.total.utilidad)} t={t} isDark={isDark}/>
                  <KpiCard label="Sell-through" value={fmtP(calc.total.stPct)} delta={calc.deltaST} pts t={t} isDark={isDark}/>
                  <KpiCard label="Remanente U" value={fmt(calc.total.remanente)} t={t} isDark={isDark}/>
                </div>

                {/* Regular / Descuento / Depreciado — solo si hay snapshot (sin él, la clasificación no existe) */}
                {snapRows.length>0 && (
                <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                  <p className={`text-xs font-black mb-3 ${t.textMain}`}>Regular · Descuento · Depreciado</p>
                  <table className="w-full text-xs">
                    <thead><tr className={t.textMuted}>
                      <th className="text-left pb-2">Clasificación (al arranque)</th><th className="text-right pb-2">Venta $</th>
                      {calc.hasLY && <th className="text-right pb-2">vs AA</th>}
                      <th className="text-right pb-2">Venta U</th><th className="text-right pb-2">Margen %</th>
                      <th className="text-right pb-2">Sell-through</th><th className="text-right pb-2">Remanente U</th><th className="text-right pb-2">Remanente $</th>
                    </tr></thead>
                    <tbody>
                      {[['regular',calc.regular],['descuento',calc.descuento],['depreciado',calc.depreciado],['total',calc.total]].map(([key,r])=>(
                        <tr key={key} className={`border-t ${t.border} ${key==='total'?'font-black':''} ${t.textMain}`}>
                          <td className="py-2">{key==='total'?'Total':<span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:CLASIF_COLOR[key]}}/>{CLASIF_LABEL[key]}</span>}</td>
                          <td className="text-right">{fmtM(r.ventaP)}</td>
                          {calc.hasLY && <td className="text-right"><DeltaBadge value={r.vsAA}/></td>}
                          <td className="text-right">{fmt(r.ventaU)}{calc.hasLY && <div><DeltaBadge value={r.vsAA_u}/></div>}</td>
                          <td className="text-right">{fmtP(r.margenPct)}{calc.hasLY && <div><DeltaBadge value={r.vsAA_mg}/></div>}</td>
                          <td className="text-right">{fmtP(r.stPct)}</td><td className="text-right">{fmt(r.remanente)}</td>
                          <td className="text-right">{fmtM(r.montoRemanente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={[{name:'Regular',ventaP:calc.regular.ventaP},{name:'Descuento',ventaP:calc.descuento.ventaP},{name:'Depreciado',ventaP:calc.depreciado.ventaP}]} margin={{top:10}} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke={gridC} vertical={false}/>
                      <XAxis dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC}/>
                      <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                      <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                      <Bar dataKey="ventaP" name="Venta $" radius={[6,6,0,0]} maxBarSize={64}>
                        <Cell fill="url(#gradRegularV)"/><Cell fill="url(#gradDescuentoV)"/><Cell fill="url(#gradDepreciadoV)"/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                )}

                {/* Breakdown por categoría — solo secciones con venta */}
                {calc.categorias.length>0 && (
                  <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                    <p className={`text-xs font-black mb-3 ${t.textMain}`}>Breakdown por categoría</p>
                    <table className="w-full text-xs">
                      <thead><tr className={t.textMuted}>
                        <th className="text-left pb-2">Sección</th><th className="text-right pb-2">Venta $</th>
                        {calc.hasLY && <th className="text-right pb-2">vs AA</th>}
                        <th className="text-right pb-2">Venta U</th><th className="text-right pb-2">Margen %</th><th className="text-right pb-2">Sell-through</th>
                      </tr></thead>
                      <tbody>
                        {calc.categorias.map(c=>(
                          <tr key={c.seccion} className={`border-t ${t.border} ${t.textMain}`}>
                            <td className="py-2">{c.seccion}</td><td className="text-right">{fmtM(c.ventaP)}</td>
                            {calc.hasLY && <td className="text-right"><DeltaBadge value={c.vsAA}/></td>}
                            <td className="text-right">{fmt(c.ventaU)}</td><td className="text-right">{fmtP(c.margenPct)}</td><td className="text-right">{fmtP(c.stPct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Dashboard de venta del evento — ligado a los filtros */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top 10 Modelo */}
                  {calc.topModelo.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Top 10 Modelo · Venta $</p>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={calc.topModelo} layout="vertical" margin={{left:10}} barCategoryGap="28%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis type="category" dataKey="modelo" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={80}/>
                          <Tooltip content={<ModeloTTip/>} cursor={{fill:cursorFill}}/>
                          <Bar dataKey="ventaP" name="Venta $" fill="url(#gradRegularH)" radius={[0,6,6,0]} maxBarSize={22}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Venta por Subcanal */}
                  {calc.porSubcanal.length>0 && (
                    <div className={`p-4 rounded-xl border ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Venta por Subcanal</p>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie data={calc.porSubcanal} dataKey="ventaP" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2}>
                            {calc.porSubcanal.map((r,i)=><Cell key={i} fill={VIOLET_SHADES[i%VIOLET_SHADES.length]}/>)}
                          </Pie>
                          <Tooltip content={<TTip/>}/>
                          <Legend wrapperStyle={{fontSize:10,color:txtC}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Desempeño por día */}
                  {calc.porDia.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto lg:col-span-2 ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Desempeño por día — venta por clasificación y margen %{calc.hasLY?' (línea punteada = AA)':''}</p>
                      <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={calc.porDia} margin={{top:10}} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} vertical={false}/>
                          <XAxis dataKey="label" tick={{fontSize:9,fill:txtC}} stroke={axisC}/>
                          <YAxis yAxisId="izq" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis yAxisId="der" orientation="right" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>v.toFixed(0)+'%'}/>
                          <Tooltip content={<DiaTTip/>} cursor={{fill:cursorFill}}/>
                          <Legend wrapperStyle={{fontSize:10,color:txtC}}/>
                          <Bar yAxisId="izq" dataKey="regular" stackId="v" name="Regular" fill="url(#gradRegularV)"/>
                          <Bar yAxisId="izq" dataKey="descuento" stackId="v" name="Descuento" fill="url(#gradDescuentoV)"/>
                          <Bar yAxisId="izq" dataKey="depreciado" stackId="v" name="Depreciado" fill="url(#gradDepreciadoV)" radius={[6,6,0,0]}/>
                          <Line yAxisId="der" type="monotone" dataKey="margenPct" name="Margen %" stroke={lineC} strokeWidth={2} dot={false}/>
                          {calc.hasLY && <Line yAxisId="izq" type="monotone" dataKey="ventaPLY" name="Venta $ AA" stroke={txtC} strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* N_Estatus */}
                  {calc.porEstatus.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Venta por Estatus del artículo</p>
                      <ResponsiveContainer width="100%" height={Math.max(160,calc.porEstatus.length*32)}>
                        <BarChart data={calc.porEstatus} layout="vertical" margin={{left:10}} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={120}/>
                          <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                          <Bar dataKey="ventaP" name="Venta $" fill="url(#gradRegularH)" radius={[0,6,6,0]} maxBarSize={22}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Norma de Aprovisionamiento */}
                  {calc.porNorma.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Venta por Norma de Aprovisionamiento</p>
                      <ResponsiveContainer width="100%" height={Math.max(160,calc.porNorma.length*32)}>
                        <BarChart data={calc.porNorma} layout="vertical" margin={{left:10}} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={120}/>
                          <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                          <Bar dataKey="ventaP" name="Venta $" fill="url(#gradRegularH)" radius={[0,6,6,0]} maxBarSize={22}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Grupo de Artículo (GOA) */}
                  {calc.porGoa.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto lg:col-span-2 ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Venta por Grupo de Artículo (GOA)</p>
                      <ResponsiveContainer width="100%" height={Math.max(200,calc.porGoa.length*28)}>
                        <BarChart data={calc.porGoa} layout="vertical" margin={{left:10}} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={120}/>
                          <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                          <Bar dataKey="ventaP" name="Venta $" fill="url(#gradRegularH)" radius={[0,6,6,0]} maxBarSize={20}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Bottom 10 Modelo */}
                <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                  <p className={`text-xs font-black mb-3 ${t.textMain}`}>Bottom 10 Modelo · Venta $ (con inventario inicial y remanente)</p>
                  <table className="w-full text-xs">
                    <thead><tr className={t.textMuted}><th className="text-left pb-2">Modelo</th><th className="text-left pb-2">Marca</th><th className="text-left pb-2">GOA</th>
                      <th className="text-right pb-2">Venta $</th>{calc.hasLY && <th className="text-right pb-2">vs AA</th>}
                      <th className="text-right pb-2">Venta U</th><th className="text-right pb-2">ST%</th>
                      <th className="text-right pb-2">Remanente U</th><th className="text-right pb-2">Remanente $</th></tr></thead>
                    <tbody>
                      {calc.bottom10.length===0 ? (<tr><td colSpan={9} className={`py-3 text-center ${t.textMuted}`}>Sin datos</td></tr>) :
                      calc.bottom10.map(r=>(
                        <tr key={r.modelo} className={`border-t ${t.border} ${t.textMain}`}>
                          <td className="py-1.5">{r.modelo}</td>
                          <td className={t.textMuted}>{r.marca}</td>
                          <td className={t.textMuted}>{r.goa}</td>
                          <td className="text-right">{fmtM(r.ventaP)}</td>
                          {calc.hasLY && <td className="text-right"><DeltaBadge value={r.vsAA}/></td>}
                          <td className="text-right">{fmt(r.ventaU)}</td><td className="text-right">{fmtP(r.stPct)}</td>
                          <td className="text-right">{fmt(r.remanente)}</td><td className="text-right">{fmtM(r.montoRemanente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {reportTab==='desglose' && calc && (
              <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                <div className="flex items-center justify-between mb-3 no-print">
                  <p className={`text-xs font-black ${t.textMain}`}>Valor de inventario por clasificación — antes (snapshot) vs actual</p>
                  <div className="flex gap-1">
                    {[['marca','Marca'],['goa','GOA']].map(([k,lbl])=>(
                      <button key={k} onClick={()=>setGroupBy(k)} className={`px-3 py-1 rounded-lg text-[10px] font-bold border ${groupBy===k?t.btnPrimary:t.btnGhost}`}>{lbl}</button>
                    ))}
                  </div>
                </div>

                {/* Header con totales generales por clasificación */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {['regular','descuento','depreciado'].map(k=>(
                    <div key={k} className={`p-3 rounded-lg border ${t.cardInner}`} style={{boxShadow:`0 0 18px ${CLASIF_COLOR[k]}33`}}>
                      <p className="text-[10px] font-black uppercase flex items-center gap-1.5" style={{color:CLASIF_COLOR[k]}}>
                        <span className="w-2 h-2 rounded-full" style={{background:CLASIF_COLOR[k]}}/>{CLASIF_LABEL[k]}
                      </p>
                      <p className={`text-sm font-black mt-1 ${t.textMain}`}>{fmtM(calc.grand[k].montoA)}</p>
                      <p className={`text-[10px] ${t.textMuted}`}>{calc.grand.total.montoA>0?fmtP(calc.grand[k].montoA/calc.grand.total.montoA*100):'-'} del total · {fmt(calc.grand[k].ohA)} pzs</p>
                      <p className="text-[10px] mt-1 flex items-center gap-1">vs AA:{' '}
                        {calc.grand[k].montoAant>0?<DeltaBadge value={(calc.grand[k].montoA-calc.grand[k].montoAant)/calc.grand[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}
                      </p>
                    </div>
                  ))}
                </div>

                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className={t.textMuted}>
                      <th className="text-left pb-2" rowSpan={2}>Sección / {groupBy==='marca'?'Marca':'GOA'}</th>
                      {['regular','descuento','depreciado'].map(k=>(
                        <th key={k} className="text-center pb-1 border-l" colSpan={3} style={{color:CLASIF_COLOR[k]}}>{CLASIF_LABEL[k]}</th>
                      ))}
                      <th className="text-center pb-1 border-l" colSpan={3}>Total</th>
                    </tr>
                    <tr className={t.textMuted}>
                      {['regular','descuento','depreciado','total'].map(k=>(
                        <React.Fragment key={k}>
                          <th className="text-right pb-2 font-normal border-l">OH pzs</th>
                          <th className="text-right pb-2 font-normal">Monto $</th>
                          <th className="text-right pb-2 font-normal">vs AA</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tree?.filter(sec=>sec.total.monto>0||sec.total.oh>0).map(sec=>{
                      const key=sec.seccion;
                      const isOpen=expanded.has(key);
                      return (
                        <React.Fragment key={key}>
                          <tr className={`border-t cursor-pointer ${t.border} ${t.textMain} font-bold`} onClick={()=>toggleExpand(key)}>
                            <td className="py-2 flex items-center gap-1.5">
                              <span className={`transition-transform inline-block ${isOpen?'rotate-90':''}`}>▸</span>{sec.seccion}
                            </td>
                            {['regular','descuento','depreciado','total'].map(k=>(
                              <React.Fragment key={k}>
                                <td className="text-right border-l">{fmt(sec[k].ohA)}</td>
                                <td className="text-right">{fmtM(sec[k].montoA)}</td>
                                <td className="text-right">{sec[k].montoAant>0?<DeltaBadge value={(sec[k].montoA-sec[k].montoAant)/sec[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}</td>
                              </React.Fragment>
                            ))}
                          </tr>
                          {isOpen && sec.subs.filter(sub=>sub.total.monto>0||sub.total.oh>0).map(sub=>(
                            <tr key={sub.nombre} className={`border-t ${t.border} ${t.textMuted}`}>
                              <td className="py-1.5 pl-6">{sub.nombre}</td>
                              {['regular','descuento','depreciado','total'].map(k=>(
                                <React.Fragment key={k}>
                                  <td className="text-right border-l">{fmt(sub[k].ohA)}</td>
                                  <td className="text-right">{fmtM(sub[k].montoA)}</td>
                                  <td className="text-right">{sub[k].montoAant>0?<DeltaBadge value={(sub[k].montoA-sub[k].montoAant)/sub[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}</td>
                                </React.Fragment>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={`border-t-2 ${t.border} ${t.textMain} font-black`}>
                      <td className="py-2">Suma total</td>
                      {['regular','descuento','depreciado','total'].map(k=>(
                        <React.Fragment key={k}>
                          <td className="text-right border-l">{fmt(calc.grand[k].ohA)}</td>
                          <td className="text-right">{fmtM(calc.grand[k].montoA)}</td>
                          <td className="text-right">{calc.grand[k].montoAant>0?<DeltaBadge value={(calc.grand[k].montoA-calc.grand[k].montoAant)/calc.grand[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}</td>
                        </React.Fragment>
                      ))}
                    </tr>
                  </tfoot>
                </table>
                <p className={`text-[10px] mt-3 ${t.textMuted}`}>Click en una sección para desplegar por {groupBy==='marca'?'marca':'GOA'}. "Depreciado" = ya está en liquidación o pronto a estarlo (permanente). "Descuento" = letra temporal (MS) que regresa a su precio después del evento, o venta por debajo de lista sin letra formal.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

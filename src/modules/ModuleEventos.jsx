import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line, PieChart, Pie, Legend, ReferenceLine } from 'recharts';
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
const CLASIF_COLOR={ regular:'#8b5cf6', descuento:'#f59e0b', depreciado:'#00bcd4', sin_snapshot:'#00bcd4' };
// Verde esmeralda para "Venta $" en las gráficas GOA/Marca — ahí conviven con la barra "Inv. Regular"
// (violeta, de CLASIF_COLOR), que si no se distinguen fácil a simple vista.
const VENTA_COLOR='#10b981';
const VIOLET_SHADES=['#8b5cf6','#a78bfa','#c4b5fd','#7c3aed','#ddd6fe','#6d28d9','#e9d5ff','#5b21b6'];
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
  const iAno=hidx('Año','AÑO','Ano','ANO','Year'), iRebaja=hidx('Rebaja'), iSeccion=hidx('Sección'), iGoa=hidx('Grupo artículos'),
    iMarca=hidx('Marca'), iNorma=hidx('Norma de Aprovisionamiento'), iEstatus=hidx('Estatus del Artículo'),
    iModelo=hidx('Modelo Proveedor'), iSku=artIdx.length?artIdx[0]:-1, iDesc=artIdx.length>1?artIdx[1]:iSku,
    iPrecio=hidx('Precio De Venta Act'), iOh=hidx('OH_'), iOhAant=hidx('OH aant'), iMontoAant=hidx('Monto aant');
  // Col "Rebaja": Regular = sin letra; Depreciado = liquidación permanente; MS = letra temporal (regresa a precio).
  // Col "Año": si existe, marca a qué ejercicio pertenece cada bloque de filas (permite clasificar por año real, no por hoy).
  const out=[];
  // La columna "Año" suele venir de una celda combinada (una sola "2026"/"2025" cubriendo visualmente todo
  // el bloque en Excel) — sheet_to_json solo trae el valor en la fila ancla de la combinación; el resto de
  // filas del bloque llegan en blanco. Se arrastra hacia abajo el último año visto (forward-fill) para que
  // todo el bloque quede etiquetado, no solo su primera fila.
  let lastAno=null;
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>c===''||c==null)) continue;
    if(iAno>=0){ const anoRaw=String(r[iAno]||'').trim(); if(anoRaw){ const p=parseInt(anoRaw,10); if(!isNaN(p)) lastAno=p; } }
    const sku=iSku>=0?String(r[iSku]||'').trim():''; if(!sku) continue;
    const rebaja=iRebaja>=0?String(r[iRebaja]||'').trim():'';
    const letraDesc=(rebaja&&rebaja.toUpperCase()!=='REGULAR')?rebaja:'';
    out.push({ sku, nsku:iDesc>=0?String(r[iDesc]||'').trim():'', modelo:iModelo>=0?String(r[iModelo]||'').trim().toUpperCase():'',
      marca:(iMarca>=0?String(r[iMarca]||'').trim().toUpperCase():'')||'SIN MARCA', goa:iGoa>=0?String(r[iGoa]||'').trim().toUpperCase():'',
      seccion:(iSeccion>=0?String(r[iSeccion]||'').trim().toUpperCase():'')||'GENERAL', centro:'',
      norma:iNorma>=0?String(r[iNorma]||'').trim().toUpperCase():'', estatus:iEstatus>=0?String(r[iEstatus]||'').trim().toUpperCase():'',
      ano:iAno>=0?lastAno:null,
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
    const norm=s=>String(s||'').trim().replace(/\s+/g,' ');
    const vhead=(vrows[0]||[]).map(norm);
    const vidx=(...names)=>{ for(const n of names){ const i=vhead.indexOf(norm(n)); if(i>=0) return i; } return -1; };
    const iFecha=vidx('Día/Periodo'), iSeccion=vidx('N_Seccion'), iSubcanal=vidx('Subcanal'),
      iGoa=vidx('N_GOA'), iModelo=vidx('Modelo Proveedor'), iSku=vidx('Artículo'), iMarca=vidx('Marca'),
      iEstatus=vidx('N_Estatus'), iNorma=vidx('Norma de Aprovisionamiento'),
      iVentaU=vidx('Vtas. U'), iVentaP=vidx('Vtas. $'), iGM=vidx('GM'), iDescuento=vidx('Total Descuentos'),
      // Inventario inicial por SKU: TY = INV INI ($) + OH (U); AA = INV INI AA ($) + OH AA (U).
      // Cambian fila a fila (no son constantes por SKU) y vienen en crudo aquí; el escalado ×1000 de los $
      // y la elección de "qué fila usar" (la de fecha más antigua) se resuelven en el useMemo `joined`.
      iInvIni=vidx('INV INI'), iOh=vidx('OH'), iInvIniAA=vidx('INV INI AA'), iOhAA=vidx('OH AA');
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
          utilidad:iGM>=0?(Number(r[iGM])||0):0, totalDescuento:iDescuento>=0?(Number(r[iDescuento])||0)*1000:0,
          invIni:iInvIni>=0?(Number(r[iInvIni])||0):null, oh:iOh>=0?(Number(r[iOh])||0):null,
          invIniAA:iInvIniAA>=0?(Number(r[iInvIniAA])||0):null, ohAA:iOhAA>=0?(Number(r[iOhAA])||0):null });
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
      iVentaU=vidx('VTAS_U'), iGM=vidx('GM'), iDescuento=vidx('TOTAL_DESCUENTOS'),
      // Inventario inicial por SKU: TY = INV_INI ($) + OH (U); AA = INV_INI_AA ($) + OH_AA (U). Crudo aquí,
      // igual que en el xlsx (ver comentario arriba): escalado y selección de fila se hacen en `joined`.
      iInvIni=vidx('INV_INI'), iOh=vidx('OH'), iInvIniAA=vidx('INV_INI_AA'), iOhAA=vidx('OH_AA');
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
        utilidad:iGM>=0?num(r[iGM]):0, totalDescuento:iDescuento>=0?num(r[iDescuento])*1000:0,
        invIni:iInvIni>=0?num(r[iInvIni]):null, oh:iOh>=0?num(r[iOh]):null,
        invIniAA:iInvIniAA>=0?num(r[iInvIniAA]):null, ohAA:iOhAA>=0?num(r[iOhAA]):null });
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
  return <span className={`text-[10px] font-black ${pos?'text-[#f59e0b]':'text-[#00bcd4]'}`}>{pos?'▲':'▼'} {Math.abs(value).toFixed(1)}{pts?' pts':'%'}</span>;
};
const KpiCard = ({label,value,delta,pts,t,isDark}) => {
  const glow = (delta===undefined||delta==null)
    ? (isDark?'shadow-[0_0_22px_rgba(139,92,246,0.35)]':'shadow-[0_0_16px_rgba(139,92,246,0.18)]')
    : delta>=0 ? (isDark?'shadow-[0_0_22px_rgba(245,158,11,0.4)]':'shadow-[0_0_16px_rgba(245,158,11,0.22)]')
    : (isDark?'shadow-[0_0_22px_rgba(0,188,212,0.4)]':'shadow-[0_0_16px_rgba(0,188,212,0.22)]');
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
      ${isDark?'bg-[#1e222d]/70 border-white/10':'bg-white/75 border-white/60'}`}>
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
    dark:{appBg:'bg-transparent text-gray-100',card:'bg-[#1e222d]/80 backdrop-blur-xl border-[#2a2e3d] shadow-sm',cardInner:'bg-[#161922]/70 backdrop-blur-xl border-[#2a2e3d]',
      textMain:'text-white',textMuted:'text-gray-400',textAccent1:'text-violet-300',textAccent2:'text-purple-300',border:'border-[#2a2e3d]',
      input:'bg-[#161922] border-[#2a2e3d] text-white focus:ring-violet-500',btnPrimary:'bg-violet-500 text-white hover:bg-violet-400 shadow-[0_0_18px_rgba(139,92,246,0.4)]',
      btnGhost:'bg-[#1e222d]/80 text-gray-300 hover:text-white hover:bg-[#2a2e3d] border-[#2a2e3d]',
      badge:'bg-violet-500/25 text-violet-300 border-violet-400/60',badgeCyan:'bg-cyan-500/20 text-cyan-300 border-cyan-400/50',
      badgeAmber:'bg-amber-600/25 text-amber-400 border-amber-500/60',badgeRed:'bg-[#00bcd4]/20 text-[#5ddef4] border-[#00bcd4]/50',
      badgeEmerald:'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/50',badgeOrange:'bg-orange-600/25 text-orange-400 border-orange-500/60'},
    light:{appBg:'bg-transparent text-gray-800',card:'bg-white/80 backdrop-blur-xl border-gray-200 shadow-sm',cardInner:'bg-gray-50/80 backdrop-blur-xl border-gray-200',
      textMain:'text-gray-900',textMuted:'text-gray-500',textAccent1:'text-violet-600',textAccent2:'text-purple-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-violet-500',btnPrimary:'bg-violet-600 text-white hover:bg-violet-700 shadow-md',
      btnGhost:'bg-gray-100/80 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-violet-100 text-violet-700 border-violet-300',badgeCyan:'bg-cyan-100 text-cyan-700 border-cyan-300',
      badgeAmber:'bg-amber-100 text-amber-800 border-amber-300',badgeRed:'bg-[#00bcd4]/10 text-[#0e7490] border-[#00bcd4]/40',
      badgeEmerald:'bg-[#f59e0b]/15 text-[#92400e] border-[#f59e0b]/40',badgeOrange:'bg-orange-100 text-orange-800 border-orange-300'},
  };
  const t=themes[theme]||themes.light;
  const gridC=isDark?'#2a2e3d':'#f0f0f0', axisC=isDark?'#52525b':'#d1d5db', txtC=isDark?'#a1a1aa':'#6b7280';
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
      // Se captura CADA gráfica/tabla en su propio canvas (en vez de una sola captura gigante que
      // luego se corta a una altura de página fija) — así una tarjeta nunca queda partida a la mitad
      // entre dos páginas, sin importar dónde caiga el borde de la página. El grid marcado
      // .pdf-flatten se "aplana" para tratar cada una de sus tarjetas como su propia sección.
      const collectSections=el=>{
        let out=[];
        Array.from(el.children).forEach(child=>{
          if(child.classList?.contains('no-print')) return;
          if(child.classList?.contains('pdf-flatten')) out=out.concat(collectSections(child));
          else out.push(child);
        });
        return out;
      };
      const sections=collectSections(node);
      if(sections.length===0) return;

      const pdf=new jsPDF({orientation:'p',unit:'pt',format:'letter'});
      const pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight();
      const bg=isDark?'#18181b':'#ffffff';
      let y=0, pageHasContent=false;

      for(const sec of sections){
        const canvas=await html2canvas(sec,{scale:2, backgroundColor:bg, useCORS:true,
          ignoreElements:el=>el.classList?.contains('no-print')});
        const ptPerPx=pageW/canvas.width; // misma escala horizontal siempre (ancho completo de página)
        const fullHpt=canvas.height*ptPerPx;

        if(fullHpt<=pageH+0.5){
          if(pageHasContent && y+fullHpt>pageH+0.5){ pdf.addPage(); y=0; pageHasContent=false; }
          pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,y,pageW,fullHpt);
          y+=fullHpt; pageHasContent=true;
        } else {
          // Sección más alta que una página completa (p.ej. una tabla larga) — es la única situación
          // donde se corta a fuerza, por altura de página, nunca a media gráfica de otra sección.
          if(pageHasContent){ pdf.addPage(); y=0; pageHasContent=false; }
          const pxPerPt=canvas.height/fullHpt;
          const maxSlicePx=Math.floor(pageH*pxPerPt);
          let cutPx=0, lastSliceHpt=0;
          while(cutPx<canvas.height-0.5){
            const sliceHpx=Math.min(canvas.height-cutPx, maxSlicePx);
            const slice=document.createElement('canvas');
            slice.width=canvas.width; slice.height=sliceHpx;
            slice.getContext('2d').drawImage(canvas,0,cutPx,canvas.width,sliceHpx,0,0,canvas.width,sliceHpx);
            lastSliceHpt=sliceHpx/pxPerPt;
            pdf.addImage(slice.toDataURL('image/png'),'PNG',0,0,pageW,lastSliceHpt);
            cutPx+=sliceHpx;
            if(cutPx<canvas.height-0.5) pdf.addPage();
          }
          y=lastSliceHpt; pageHasContent=true;
        }
      }
      const slug=(active?.nombre||'evento').trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'');
      pdf.save(`resumen_${slug||'evento'}.pdf`);
    }catch(err){ console.error(err); alert('No se pudo generar el PDF. Revisa la consola.'); }
    finally{ setExporting(false); }
  };

  // Excel para compartir: mismas tablas que la vista (respeta filtros activos), una hoja por bloque.
  // La librería instalada (xlsx community) no escribe gráficos nativos — son solo tablas, pero limpias y
  // listas para que Excel les meta un gráfico en 2 clics si hace falta.
  const handleDownloadExcel=()=>{
    if(!calc||!active) return;
    const wb=XLSX.utils.book_new();
    const addSheet=(name,aoa,widths)=>{
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      if(widths) ws['!cols']=widths.map(w=>({wch:w}));
      XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
    };
    const pct=v=>v==null?'':Math.round(v*10)/10;

    // Resumen
    const resumenAoa=[
      [active.nombre||'Evento',active.tipo||''],
      [`${active.fechaInicio||''} → ${active.fechaFin||''}`],
      [],
      ['KPI','Valor','vs AA (%)'],
      ['Venta $',calc.total.ventaP,pct(calc.deltaVentaP)],
      ['Venta U',calc.total.ventaU,''],
      ['Margen %',pct(calc.total.margenPct),pct(calc.deltaMargen)],
      ['Utilidad $',calc.total.utilidad,''],
      ['Sell-through %',pct(calc.total.stPct),pct(calc.deltaST)],
      ['Remanente U',calc.total.remanente,''],
      [],
      ['Breakdown por categoría (Sección)'],
      ['Sección','Venta $','vs AA (%)','Venta U','Margen %','Sell-through %'],
      ...calc.categorias.map(c=>[c.seccion,c.ventaP,pct(c.vsAA),c.ventaU,pct(c.margenPct),pct(c.stPct)]),
    ];
    addSheet('Resumen',resumenAoa,[28,16,12,12,12,14]);

    // Regular / Descuento / Depreciado
    if(calc.hasRealSnapshot){
      const rows=[['Clasificación','Venta $','vs AA (%)','Venta U','Margen %','Sell-through %','Remanente U','Remanente $','Desplazado $','Desplazado %']];
      [['Regular',calc.regular],['Descuento',calc.descuento],['Depreciado',calc.depreciado],['Total',calc.total]].forEach(([lbl,r])=>
        rows.push([lbl,r.ventaP,pct(r.vsAA),r.ventaU,pct(r.margenPct),pct(r.stPct),r.remanente,r.montoRemanente,r.montoDesplazado,pct(r.pctDesplazado)]));
      addSheet('Regular-Descuento-Deprec',rows,[16,14,12,12,12,14,14,14,14,14]);
    }

    // Por día
    const diaRows=[calc.hasRealSnapshot
      ?['Fecha','Regular $','Descuento $','Depreciado $','Venta $ Total','Margen %','Venta $ AA']
      :['Fecha','Venta $ Total','Margen %','Venta $ AA']];
    calc.porDia.forEach(d=>{ diaRows.push(calc.hasRealSnapshot
      ?[d.label,d.regular,d.descuento,d.depreciado,d.ventaP,pct(d.margenPct),d.ventaPLY??'']
      :[d.label,d.ventaP,pct(d.margenPct),d.ventaPLY??'']); });
    addSheet('Por Día',diaRows,[10,14,14,14,14,12,14]);

    // Por GOA / Marca (venta, con inv inicial si aplica)
    const dimSheet=(name,rows)=>{
      const head=calc.hasInvIniData?['Nombre','Venta $','vs AA (%)','Inv. Inicial $']:['Nombre','Venta $','vs AA (%)'];
      const aoa=[head,...rows.map(r=>calc.hasInvIniData?[r.name,r.ventaP,pct(r.vsAA),r.invIni||0]:[r.name,r.ventaP,pct(r.vsAA)])];
      addSheet(name,aoa,[22,14,12,16]);
    };
    dimSheet('Por GOA',calc.porGoa);
    dimSheet('Por Marca',calc.porMarca);
    addSheet('Por Subcanal',[['Subcanal','Venta $','vs AA (%)'],...calc.porSubcanal.map(r=>[r.name,r.ventaP,pct(r.vsAA)])],[22,14,12]);
    addSheet('Por Estatus',[['Estatus','Venta $','vs AA (%)'],...calc.porEstatus.map(r=>[r.name,r.ventaP,pct(r.vsAA)])],[22,14,12]);

    // Top 10 / Bottom 10 Modelo
    const modeloHead=['Modelo','Marca','GOA','Venta $','vs AA (%)','Venta U','ST %','Remanente U','Remanente $'];
    addSheet('Top 10 Modelo',[modeloHead,...calc.topModelo.map(r=>[r.modelo,r.marca,r.goa,r.ventaP,pct(r.vsAA),r.ventaU,pct(r.stPct),r.remanente,r.montoRemanente])],[16,16,16,12,12,10,10,12,12]);
    addSheet('Bottom 10 Modelo',[modeloHead,...calc.bottom10.map(r=>[r.modelo,r.marca,r.goa,r.ventaP,pct(r.vsAA),r.ventaU,pct(r.stPct),r.remanente,r.montoRemanente])],[16,16,16,12,12,10,10,12,12]);

    // Inventario Inicial (Sección+GOA+Marca, cuando el evento solo trae CSV de ventas)
    if(calc.hasInvIniData){
      const invHead=['Nombre','Inv. Inicial $','vs AA (%)','Inv. Inicial U','vs AA U (%)'];
      const invRows=(list)=>list.map(r=>[r.name,r.invIni,pct(r.vsAA),r.oh,pct(r.vsAA_u)]);
      addSheet('Inv. Inicial por GOA',[invHead,...invRows(calc.invIniPorGoa)],[22,16,12,14,12]);
      addSheet('Inv. Inicial por Marca',[invHead,...invRows(calc.invIniPorMarca)],[22,16,12,14,12]);
    }

    const slug=(active?.nombre||'evento').trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'');
    XLSX.writeFile(wb,`resumen_${slug||'evento'}.xlsx`);
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
  // Recupera el CSV de ventas desde lo que ya está parseado en memoria/IndexedDB (por si se perdió el
  // archivo original) — usa los mismos encabezados que Vtas_Evento para que se pueda re-subir tal cual
  // a este mismo módulo. Se codifica en ISO-8859-1 (igual que uploadSales lee el archivo) para que los
  // acentos no se rompan al volver a cargarlo.
  const handleDownloadSalesCSV=()=>{
    if(!salesRows.length) return;
    const pad2=n=>String(n).padStart(2,'0');
    const fmtFecha=d=>d?`${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`:'';
    const val=v=>v==null?'':v;
    const esc=v=>{ const s=String(val(v)); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    const headers=['Día/Periodo','Sección','N_Seccion','Subcanal','Grupo Artículos','N_GOA','Modelo Proveedor',
      'Artículo','N_Articulo','Marca','Estatus del Artículo','N_Estatus','Norma de Aprovisionamiento',
      'Vtas. U','Vtas. $ ','GM ','Total Descuentos','Costo MSI ','INV INI  AA','OH AA','INV INI','OH'];
    const lines=[headers.join(',')];
    salesRows.forEach(r=>{
      lines.push([fmtFecha(r.fecha),'',r.seccion,r.subcanal,'',r.goa,r.modelo,r.sku,'',r.marca,'',r.estatus,
        r.norma,val(r.ventaU),val(r.ventaP/1000),val(r.utilidad),val(r.totalDescuento/1000),'',
        val(r.invIniAA),val(r.ohAA),val(r.invIni),val(r.oh)].map(esc).join(','));
    });
    const text=lines.join('\n');
    const bytes=new Uint8Array(text.length);
    for(let i=0;i<text.length;i++) bytes[i]=text.charCodeAt(i)&0xFF;
    const blob=new Blob([bytes],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const slug=(active?.nombre||'evento').trim().replace(/\s+/g,'_').replace(/[^\w\-]/g,'');
    a.href=url; a.download=`ventas_${slug||'evento'}_recuperado.csv`; a.click();
    URL.revokeObjectURL(url);
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
    // Inventario inicial desde las columnas del propio archivo de ventas (INV INI/OH/INV INI AA/OH AA).
    // OJO: este dato NO viene a nivel SKU — es un total por Sección+GOA+Marca repetido/parcial en las filas
    // de venta (a diferencia del snapshot formal por xlsx, que sí es por SKU y alimenta la clasificación
    // Regular/Descuento/Depreciado — esa sigue intacta, este bloque es independiente y no la toca).
    // OJO 2: el nombre de GOA se repite entre Secciones (p.ej. "BOTA", "SANDALIA", "CHANCLA" existen igual
    // en Zapatos Hombre/Mujer/Niño/Niña) — agrupar solo por (GOA, Marca) mezclaba/perdía inventario de
    // distintas Secciones bajo la misma llave. Se agrupa por (Sección, GOA, Marca).
    // Se toma la fila con fecha más antigua que traiga el dato, no el máximo (evita mezclar niveles de
    // distintos días). INV INI/INV INI AA son $ escalados ×1000 como Vtas.$/Descuentos; OH/OH AA son
    // unidades y no se escalan.
    // OJO 3: las celdas en blanco llegan aquí ya convertidas a 0 (no null/undefined), así que el filtro de
    // "trae dato" tiene que ser por valor realmente distinto de cero, no por null — si no, la fila "más
    // antigua" que se agarra casi siempre es una de las miles de filas en blanco (=0), no la única fila
    // real con el inventario, y todo sale en $0.
    const invIniBySeccionGoaMarca={};
    salesRows.forEach(r=>{
      if(!r.invIni&&!r.oh&&!r.invIniAA&&!r.ohAA) return;
      const k=`${r.seccion}|${r.goa}|${r.marca}`;
      const e=invIniBySeccionGoaMarca[k];
      if(!e || (r.fecha && (!e.fecha || r.fecha<e.fecha))){
        invIniBySeccionGoaMarca[k]={seccion:r.seccion,marca:r.marca,goa:r.goa,fecha:r.fecha||null,
          oh:r.oh||0, invIni:(r.invIni||0)*1000, ohAA:r.ohAA||0, invIniAA:(r.invIniAA||0)*1000};
      }
    });
    const hasInvIniData=Object.keys(invIniBySeccionGoaMarca).length>0;
    const hasRealSnapshot=snapRows.length>0;
    const hasSnapshot=hasRealSnapshot||hasInvIniData; // gate de visibilidad de la tab Desglose
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
        m[sku] = (realizado!=null && s.precio>0 && realizado<s.precio*0.75) ? 'descuento' : 'regular';
      });
      return m; };
    const clasifBySku = buildClasif(snapBySku, salesBySkuFull);
    // Clasificación del año anterior: usa el snapshot/letra que tenía ESE año (no la de hoy aplicada al pasado).
    // Sin columna "Año" o sin bloque histórico, cae a la clasificación de hoy (comportamiento previo, como fallback).
    const clasifBySkuLY = (hasLY && hasAnoCol && Object.keys(snapBySkuLY).length>0)
      ? buildClasif(snapBySkuLY, salesBySkuFullLY)
      : clasifBySku;
    // Atributos por SKU tomados de las propias filas de venta (Sección/Marca/GOA/Norma/Estatus ya vienen en
    // Vtas_Evento/CSV). Sirven de respaldo para filtrar cuando no hay snapshot (o el SKU no está en él): sin esto,
    // los filtros (salvo Subcanal, que sí lee directo de la fila) dejaban todo en $0 en eventos solo-CSV.
    const salesAttrBySku={};
    salesRows.forEach(r=>{ const k=r.sku; if(!salesAttrBySku[k]) salesAttrBySku[k]={seccion:'',marca:'',goa:'',norma:'',estatus:''};
      const a=salesAttrBySku[k];
      if(!a.seccion&&r.seccion) a.seccion=r.seccion; if(!a.marca&&r.marca) a.marca=r.marca;
      if(!a.goa&&r.goa) a.goa=r.goa; if(!a.norma&&r.norma) a.norma=r.norma; if(!a.estatus&&r.estatus) a.estatus=r.estatus;
    });
    const uniq=arr=>[...new Set(arr.filter(Boolean))].sort();
    const opciones={
      seccion: uniq([...Object.values(snapBySku).map(s=>s.seccion),...salesRows.map(r=>r.seccion)]),
      marca: uniq([...Object.values(snapBySku).map(s=>s.marca),...salesRows.map(r=>r.marca)]),
      goa: uniq([...Object.values(snapBySku).map(s=>s.goa),...salesRows.map(r=>r.goa)]),
      norma: uniq([...Object.values(snapBySku).map(s=>s.norma),...salesRows.map(r=>r.norma)]),
      estatus: uniq([...Object.values(snapBySku).map(s=>s.estatus),...salesRows.map(r=>r.estatus)]),
      subcanal: uniq(salesRows.map(r=>r.subcanal)),
      clasif: uniq(Object.values(clasifBySku)),
    };
    return { snapBySku, snapBySkuLY, clasifBySku, clasifBySkuLY, opciones, anoActual, anoAnterior, hasLY, hasAnoCol, salesAttrBySku,
      hasSnapshot, hasRealSnapshot, hasInvIniData, invIniBySeccionGoaMarca,
      nSkuSnap:Object.keys(snapBySku).length, nSkuVenta:Object.keys(salesBySkuFull).length };
  },[snapRows,salesRows]);

  // ── Cálculos filtrados — rápido, solo agrupa lo ya unido ──
  const calc=useMemo(()=>{
    if(!active) return null;
    const {snapBySku,snapBySkuLY,clasifBySku,clasifBySkuLY,opciones,salesAttrBySku,hasSnapshot,hasRealSnapshot,hasInvIniData,invIniBySeccionGoaMarca,hasAnoCol}=joined;
    const passSnap=sku=>{
      const s=snapBySku[sku], a=salesAttrBySku[sku];
      const v=f=>filtros[f].length===0 || filtros[f].includes(s?.[f]||a?.[f]||'');
      const passClasif=filtros.clasif.length===0 || filtros.clasif.includes(clasifBySku[sku]||'sin_snapshot');
      return v('seccion')&&v('marca')&&v('goa')&&v('norma')&&v('estatus')&&passClasif;
    };
    // Filtros dinámicos/cascada: las opciones de cada dimensión se calculan ignorando el filtro de ESA
    // misma dimensión pero respetando todos los demás activos — así, si Sección=Zapatos Dama, el
    // desplegable de Marca/GOA solo lista lo que existe dentro de esa Sección (y viceversa).
    const dimsBase=['seccion','marca','goa','norma','estatus'];
    const skuPassExcept=(sku,exceptDim)=>{
      const s=snapBySku[sku]; if(!s) return false;
      for(const f of dimsBase){ if(f===exceptDim) continue;
        if(filtros[f].length>0 && !filtros[f].includes(s[f]||'')) return false; }
      if(exceptDim!=='clasif' && filtros.clasif.length>0 && !filtros.clasif.includes(clasifBySku[sku]||'sin_snapshot')) return false;
      return true;
    };
    const rowPassExcept=(r,exceptDim)=>{
      for(const f of dimsBase){ if(f===exceptDim) continue;
        if(filtros[f].length>0 && !filtros[f].includes(r[f]||'')) return false; }
      if(exceptDim!=='subcanal' && filtros.subcanal.length>0 && !filtros.subcanal.includes(r.subcanal||'')) return false;
      if(exceptDim!=='clasif' && filtros.clasif.length>0 && !filtros.clasif.includes(clasifBySku[r.sku]||'sin_snapshot')) return false;
      return true;
    };
    const opcionesDinamicas={};
    [...dimsBase,'subcanal'].forEach(d=>{
      const set=new Set();
      if(d!=='subcanal') Object.keys(snapBySku).forEach(sku=>{ if(skuPassExcept(sku,d)){ const val=snapBySku[sku][d]; if(val) set.add(val); } });
      salesRows.forEach(r=>{ if(rowPassExcept(r,d)){ const val=d==='subcanal'?r.subcanal:r[d]; if(val) set.add(val); } });
      opcionesDinamicas[d]=[...set].sort();
    });
    { const set=new Set();
      Object.keys(snapBySku).forEach(sku=>{ if(skuPassExcept(sku,'clasif')) set.add(clasifBySku[sku]||'sin_snapshot'); });
      opcionesDinamicas.clasif=[...set].sort(); }
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
      remanente=rows.reduce((s,r)=>s+(r.remanente||0),0), montoRemanente=rows.reduce((s,r)=>s+(r.montoRemanente||0),0),
      montoInicio=rows.reduce((s,r)=>s+(r.montoInicio||0),0);
      const montoDesplazado=montoInicio-montoRemanente;
      return { ventaP, ventaU, utilidad, margenPct: ventaP>0?utilidad/ventaP*100:null,
        ohInicio, remanente, montoRemanente, montoInicio, montoDesplazado,
        pctDesplazado: montoInicio>0?Math.min(100,montoDesplazado/montoInicio*100):null,
        stPct: ohInicio>0?Math.min(100,ventaU/ohInicio*100):null }; };
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
      r.vsAA_mg=hasLY?pctVs(r.utilidad,rLY.utilidad):null;
      r.ventaPLY=hasLY?rLY.ventaP:null;
      r.margenPctLY=hasLY?rLY.margenPct:null; };
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
    // Sin snapshot real no hay OH por modelo (ohInicio siempre 0), así que ahí se ordena solo por venta.
    const bottom10=modArr.filter(m=>hasRealSnapshot?m.ohInicio>0:m.ventaP>0).sort((a,b)=>a.ventaP-b.ventaP).slice(0,10);
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
    // LY se suma por fecha real...
    const porDiaMapLY={};
    salesFLY.forEach(r=>{ if(!r.fecha) return;
      const key=r.fecha.toISOString().slice(0,10);
      porDiaMapLY[key]=(porDiaMapLY[key]||0)+r.ventaP; });
    // ...pero se cruza contra TY por N° de día del evento (día 1 con día 1, día 2 con día 2), no por
    // mismo DD/MM: el evento no cae en el mismo día de semana año con año, así que igualar por fecha
    // calendario corre los picos de venta (fines de semana, etc.) un día. Se alinea por orden, no por label.
    const lyDatesOrdenadas=Object.keys(porDiaMapLY).sort();
    const porDia=Object.values(porDiaMap).sort((a,b)=>a.fecha<b.fecha?-1:1)
      .map((d,i)=>{ const label=d.fecha.slice(8,10)+'/'+d.fecha.slice(5,7);
        const lyKey=lyDatesOrdenadas[i];
        return {...d, label, margenPct: d.ventaP>0?d.utilidad/d.ventaP*100:null,
          ventaPLY: hasLY?(lyKey!=null?porDiaMapLY[lyKey]:null):null}; });
    const groupSum=(key,rows)=>{ const m={}; rows.forEach(r=>{ const k=r[key]||'SIN DATO'; m[k]=(m[k]||0)+r.ventaP; }); return m; };
    const groupCombined=key=>{ const mAct=groupSum(key,salesFActual), mLY=groupSum(key,salesFLY);
      return Object.entries(mAct).filter(([,ventaP])=>ventaP!==0)
        .map(([name,ventaP])=>({name,ventaP,vsAA:hasLY?pctVs(ventaP,mLY[name]||0):null}))
        .sort((a,b)=>b.ventaP-a.ventaP); };
    const porSubcanal=groupCombined('subcanal');
    const porEstatus=groupCombined('estatus');
    const porMarca=groupCombined('marca').slice(0,12);
    const porGoa=groupCombined('goa').slice(0,12);
    // Deltas vs LY — usa la data del propio archivo si trae año anterior; si no, cae a los campos manuales del evento
    const deltaVentaP = hasLY ? total.vsAA : (active.lyVentaP ? (total.ventaP-active.lyVentaP)/active.lyVentaP*100 : null);
    const deltaMargen = hasLY ? (totalLY.margenPct!=null && total.margenPct!=null ? total.margenPct-totalLY.margenPct : null)
      : (active.lyMargenPct!=null && total.margenPct!=null ? total.margenPct-active.lyMargenPct : null);
    const deltaST = active.lyStPct!=null && total.stPct!=null ? total.stPct-active.lyStPct : null;

    // ── Desglose de inventario Regular / Descuento / Depreciado (valor $, no venta) ──
    const invRows=detail.filter(r=>r.clasif!=='sin_snapshot');
    // AA real: reconstruido desde el propio snapshot del año anterior (columna "Año" del xlsx, snapBySkuLY),
    // no del campo legado "Monto aant" (casi nunca viene en el export actual, por eso salía "Sin AA" aunque
    // sí hubiera un bloque de 2025 cargado). Se agrupa igual que invRows: por clasificación/sección/sub.
    const invRowsLY = (hasLY && hasAnoCol && Object.keys(snapBySkuLY).length>0)
      ? Object.values(snapBySkuLY).filter(s=>(clasifBySkuLY[s.sku]||'sin_snapshot')!=='sin_snapshot')
          .map(s=>({ sku:s.sku, clasif:clasifBySkuLY[s.sku], seccion:s.seccion||'GENERAL', marca:s.marca, goa:s.goa,
            montoInicio:s.oh*s.precio }))
      : [];
    const sumByClasif = (rows, rowsLY=[]) => {
      const out={};
      ['regular','descuento','depreciado'].forEach(k=>{
        const rs=rows.filter(r=>r.clasif===k);
        const rsLY=rowsLY.filter(r=>r.clasif===k);
        out[k]={ oh:rs.reduce((s,r)=>s+r.ohInicio,0), ohA:rs.reduce((s,r)=>s+(r.remanente||0),0),
          monto:rs.reduce((s,r)=>s+r.montoInicio,0), montoA:rs.reduce((s,r)=>s+r.montoRemanente,0),
          // Si hay AA real (snapshot del año anterior) se usa ese; si no, cae al campo legado por SKU.
          montoAant: rsLY.length>0 ? rsLY.reduce((s,r)=>s+r.montoInicio,0) : rs.reduce((s,r)=>s+(r.montoAant||0),0) };
      });
      out.total={ oh:rows.reduce((s,r)=>s+r.ohInicio,0), ohA:rows.reduce((s,r)=>s+(r.remanente||0),0),
        monto:rows.reduce((s,r)=>s+r.montoInicio,0), montoA:rows.reduce((s,r)=>s+r.montoRemanente,0),
        montoAant: rowsLY.length>0 ? rowsLY.reduce((s,r)=>s+r.montoInicio,0) : rows.reduce((s,r)=>s+(r.montoAant||0),0) };
      return out;
    };
    const grand=sumByClasif(invRows, invRowsLY);
    const buildTree = subKey => {
      const bySeccion={}, bySeccionLY={};
      invRows.forEach(r=>{ const secc=r.seccion||'GENERAL'; if(!bySeccion[secc]) bySeccion[secc]=[]; bySeccion[secc].push(r); });
      invRowsLY.forEach(r=>{ const secc=r.seccion||'GENERAL'; if(!bySeccionLY[secc]) bySeccionLY[secc]=[]; bySeccionLY[secc].push(r); });
      return Object.entries(bySeccion).map(([seccion,rows])=>{
        const rowsLY=bySeccionLY[seccion]||[];
        const subMap={}, subMapLY={};
        rows.forEach(r=>{ const sv=r[subKey]||'SIN DATO'; if(!subMap[sv]) subMap[sv]=[]; subMap[sv].push(r); });
        rowsLY.forEach(r=>{ const sv=r[subKey]||'SIN DATO'; if(!subMapLY[sv]) subMapLY[sv]=[]; subMapLY[sv].push(r); });
        const subs=Object.entries(subMap).map(([nombre,rs])=>({nombre,...sumByClasif(rs,subMapLY[nombre]||[])})).sort((a,b)=>b.total.monto-a.total.monto);
        return { seccion, ...sumByClasif(rows,rowsLY), subs };
      }).sort((a,b)=>b.total.monto-a.total.monto);
    };
    const treeMarca=buildTree('marca');
    const treeGoa=buildTree('goa');

    // ── Inventario inicial TY vs AA por Sección/GOA/Marca (desde columnas INV INI/OH del propio archivo) ──
    // Este dato viene a nivel Sección+GOA+Marca, no por SKU/Subcanal/Estatus/Norma, así que solo se puede
    // cruzar con Sección, Marca y GOA de los filtros — hasta donde el dato alcanza.
    const invIniRows=Object.values(invIniBySeccionGoaMarca).filter(r=>
      (filtros.seccion.length===0||filtros.seccion.includes(r.seccion)) &&
      (filtros.marca.length===0||filtros.marca.includes(r.marca)) &&
      (filtros.goa.length===0||filtros.goa.includes(r.goa)));
    const invIniGroup=key=>{ const m={};
      invIniRows.forEach(r=>{ const k=r[key]||'SIN DATO'; if(!m[k]) m[k]={name:k,oh:0,invIni:0,ohAA:0,invIniAA:0};
        m[k].oh+=r.oh; m[k].invIni+=r.invIni; m[k].ohAA+=r.ohAA; m[k].invIniAA+=r.invIniAA; });
      return Object.values(m).map(g=>({...g, vsAA:pctVs(g.invIni,g.invIniAA), vsAA_u:pctVs(g.oh,g.ohAA)}))
        .filter(g=>g.oh>0||g.invIni>0||g.ohAA>0||g.invIniAA>0).sort((a,b)=>b.invIni-a.invIni); };
    const invIniPorGoa=invIniGroup('goa'), invIniPorMarca=invIniGroup('marca');
    const invIniTotal=invIniRows.reduce((acc,r)=>{ acc.oh+=r.oh; acc.invIni+=r.invIni; acc.ohAA+=r.ohAA; acc.invIniAA+=r.invIniAA; return acc; },{oh:0,invIni:0,ohAA:0,invIniAA:0});
    invIniTotal.vsAA=pctVs(invIniTotal.invIni,invIniTotal.invIniAA); invIniTotal.vsAA_u=pctVs(invIniTotal.oh,invIniTotal.ohAA);
    // ST% con inv. inicial cuando no hay snapshot real (a nivel Sección/GOA/Marca, lo que alcancen los filtros)
    if(!hasRealSnapshot && hasInvIniData && invIniTotal.oh>0){
      total.stPct=Math.min(100,total.ventaU/invIniTotal.oh*100);
      if(hasLY && invIniTotal.ohAA>0) total.stPctAA=Math.min(100,totalLY.ventaU/invIniTotal.ohAA*100);
    }
    // Inv. inicial $ por Marca/GOA, para pintarlo como barra extra en esos gráficos de venta
    const invIniByName=key=>{ const m={}; invIniRows.forEach(r=>{ const k=r[key]||'SIN DATO'; m[k]=(m[k]||0)+r.invIni; }); return m; };
    const invIniByMarcaName=invIniByName('marca'), invIniByGoaName=invIniByName('goa');
    // Mismo inv. inicial pero partido por Regular/Descuento/Depreciado (solo tiene sentido con snapshot real,
    // que es lo único que trae la clasificación por letra/rebaja) — usa invRows, ya filtrado por los filtros activos.
    const invClasifByName=key=>{ const m={}; invRows.forEach(r=>{ const k=r[key]||'SIN DATO';
      if(!m[k]) m[k]={regular:0,descuento:0,depreciado:0}; m[k][r.clasif]+=r.montoInicio; }); return m; };
    const invClasifByMarcaName=invClasifByName('marca'), invClasifByGoaName=invClasifByName('goa');
    const porMarcaConInv=porMarca.map(r=>({...r, invIni:invIniByMarcaName[r.name]||0,
      ...(invClasifByMarcaName[r.name]||{regular:0,descuento:0,depreciado:0})}));
    const porGoaConInv=porGoa.map(r=>({...r, invIni:invIniByGoaName[r.name]||0,
      ...(invClasifByGoaName[r.name]||{regular:0,descuento:0,depreciado:0})}));
    // Venta diaria promedio TY vs AA (para el KPI chico del header de "Desempeño por día")
    const nDiasTY=porDia.length, nDiasLY=new Set(salesFLY.filter(r=>r.fecha).map(r=>r.fecha.toISOString().slice(0,10))).size;
    const avgDiaTY=nDiasTY>0?total.ventaP/nDiasTY:null, avgDiaLY=nDiasLY>0?totalLY.ventaP/nDiasLY:null;

    return { total, regular, descuento, depreciado, categorias, topModelo, bottom10, sinSnapshot, fMin, fMax,
      deltaVentaP, deltaMargen, deltaST, nSkuSnap:joined.nSkuSnap, nSkuVenta:joined.nSkuVenta,
      grand, treeMarca, treeGoa, porDia, porSubcanal, porEstatus, porMarca:porMarcaConInv, porGoa:porGoaConInv, opciones, opcionesDinamicas,
      hasLY, anoActual, anoAnterior, hasSnapshot, hasRealSnapshot, hasInvIniData, invIniPorGoa, invIniPorMarca, invIniTotal,
      avgDiaTY, avgDiaLY };
  },[active,joined,salesRows,filtros]);

  // Si no hay snapshot (ni real ni sintético desde inv. inicial del CSV/Vtas_Evento) y estaban en Desglose, regresa a Resumen.
  useEffect(()=>{ if(!calc?.hasSnapshot && reportTab==='desglose') setReportTab('resumen'); },[calc?.hasSnapshot,reportTab]);

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
          <button onClick={handleDownloadExcel} disabled={!calc} className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50 ${t.btnGhost}`}>
            <Icons.Download size={13}/> Descargar Excel
          </button>
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

      <div id="eventos-print-area" className="space-y-5">
        {/* Antes usábamos gradientes SVG (url(#gradXxx)) para las barras, pero html2canvas serializa cada
            <svg> de Recharts por separado al exportar a PDF, así que un url(#id) que apunta a un <defs>
            en OTRO <svg> (aunque esté en el mismo documento) no resuelve — las barras salían invisibles.
            Se usan colores sólidos (CLASIF_COLOR) en su lugar, que no dependen de nada externo al <svg>. */}
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
              {salesRows.length>0 && <button onClick={handleDownloadSalesCSV} title="Descargar el CSV de ventas cargado (por si se perdió el archivo original)" className={`p-1.5 rounded-lg border ${t.btnGhost} opacity-60 hover:opacity-100`}><Icons.Download size={12}/></button>}
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
              {[['resumen','Resumen Ejecutivo'],...(calc?.hasSnapshot?[['desglose',calc.hasRealSnapshot?'Regular · Descuento · Depreciado':'Inventario Inicial']]:[])].map(([k,lbl])=>(
                <button key={k} onClick={()=>setReportTab(k)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${reportTab===k?t.btnPrimary:t.btnGhost}`}>{lbl}</button>
              ))}
            </div>

            {/* Filtros — aplican a todo el dashboard (resumen y desglose) */}
            <div className="flex flex-wrap items-center gap-2 no-print relative">
              {filtroAbierto && <div className="fixed inset-0 z-10" onClick={()=>setFiltroAbierto(null)}/>}
              {FILTRO_DIMS.map(dim=>{
                const opts=calc.opcionesDinamicas[dim]||[];
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
                  <KpiCard label="Utilidad $" value={fmtM(calc.total.utilidad)} t={t} isDark={isDark}/>
                  <KpiCard label="Sell-through" value={fmtP(calc.total.stPct)} delta={calc.total.stPctAA!=null?calc.total.stPct-calc.total.stPctAA:calc.deltaST} pts t={t} isDark={isDark}/>
                  <KpiCard label="Remanente U" value={fmt(calc.total.remanente)} t={t} isDark={isDark}/>
                </div>

                {/* Regular / Descuento / Depreciado — solo con snapshot REAL (sin él, la clasificación no es confiable) */}
                {calc.hasRealSnapshot && (
                <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                  <p className={`text-xs font-black mb-3 ${t.textMain}`}>Regular · Descuento · Depreciado</p>
                  <table className="w-full text-xs">
                    <thead><tr className={t.textMuted}>
                      <th className="text-left pb-2">Clasificación (al arranque)</th><th className="text-right pb-2">Venta $</th>
                      {calc.hasLY && <th className="text-right pb-2">Venta $ AA</th>}
                      {calc.hasLY && <th className="text-right pb-2">vs AA</th>}
                      <th className="text-right pb-2">Venta U</th><th className="text-right pb-2">Margen %</th>
                      <th className="text-right pb-2">Sell-through</th><th className="text-right pb-2">Remanente U</th><th className="text-right pb-2">Remanente $</th>
                      <th className="text-right pb-2">Desplazado $</th><th className="text-right pb-2">Desplazado %</th>
                    </tr></thead>
                    <tbody>
                      {[['regular',calc.regular],['descuento',calc.descuento],['depreciado',calc.depreciado],['total',calc.total]].map(([key,r])=>(
                        <tr key={key} className={`border-t ${t.border} ${key==='total'?'font-black':''} ${t.textMain}`}>
                          <td className="py-2">{key==='total'?'Total':<span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:CLASIF_COLOR[key]}}/>{CLASIF_LABEL[key]}</span>}</td>
                          <td className="text-right">{fmtM(r.ventaP)}</td>
                          {calc.hasLY && <td className="text-right">{fmtM(r.ventaPLY)}</td>}
                          {calc.hasLY && <td className="text-right"><DeltaBadge value={r.vsAA}/></td>}
                          <td className="text-right">{fmt(r.ventaU)}{calc.hasLY && <div><DeltaBadge value={r.vsAA_u}/></div>}</td>
                          <td className="text-right">{fmtP(r.margenPct)}{calc.hasLY && <div><DeltaBadge value={r.margenPct!=null&&r.margenPctLY!=null?r.margenPct-r.margenPctLY:null} pts/></div>}</td>
                          <td className="text-right">{fmtP(r.stPct)}</td><td className="text-right">{fmt(r.remanente)}</td>
                          <td className="text-right">{fmtM(r.montoRemanente)}</td>
                          <td className="text-right">{fmtM(r.montoDesplazado)}</td><td className="text-right">{fmtP(r.pctDesplazado)}</td>
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
                        <Cell fill={CLASIF_COLOR.regular}/><Cell fill={CLASIF_COLOR.descuento}/><Cell fill={CLASIF_COLOR.depreciado}/>
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
                <div className="pdf-flatten grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Grupo de Artículo (GOA) */}
                  {calc.porGoa.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Venta por Grupo de Artículo (GOA){calc.hasRealSnapshot?' (con Inv. Inicial $ por tipo)':calc.hasInvIniData?' (con Inv. Inicial $)':''}</p>
                      <ResponsiveContainer width="100%" height={Math.max(200,calc.porGoa.length*28)}>
                        <BarChart data={calc.porGoa} layout="vertical" margin={{left:10}} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={120}/>
                          <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                          {(calc.hasRealSnapshot||calc.hasInvIniData) && <Legend wrapperStyle={{fontSize:10,color:txtC}}/>}
                          <Bar dataKey="ventaP" name="Venta $" fill={VENTA_COLOR} radius={[0,6,6,0]} maxBarSize={20}/>
                          {calc.hasRealSnapshot ? (<>
                            <Bar dataKey="regular" stackId="inv" name="Inv. Regular" fill={CLASIF_COLOR.regular} maxBarSize={20}/>
                            <Bar dataKey="descuento" stackId="inv" name="Inv. Descuento" fill={CLASIF_COLOR.descuento} maxBarSize={20}/>
                            <Bar dataKey="depreciado" stackId="inv" name="Inv. Depreciado" fill={CLASIF_COLOR.depreciado} radius={[0,6,6,0]} maxBarSize={20}/>
                          </>) : calc.hasInvIniData && <Bar dataKey="invIni" name="Inv. Inicial $" fill="#f59e0b" radius={[0,6,6,0]} maxBarSize={20}/>}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Marca */}
                  {calc.porMarca.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                      <p className={`text-xs font-black mb-3 ${t.textMain}`}>Venta por Marca{calc.hasRealSnapshot?' (con Inv. Inicial $ por tipo)':calc.hasInvIniData?' (con Inv. Inicial $)':''}</p>
                      <ResponsiveContainer width="100%" height={Math.max(160,calc.porMarca.length*32)}>
                        <BarChart data={calc.porMarca} layout="vertical" margin={{left:10}} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={120}/>
                          <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                          {(calc.hasRealSnapshot||calc.hasInvIniData) && <Legend wrapperStyle={{fontSize:10,color:txtC}}/>}
                          <Bar dataKey="ventaP" name="Venta $" fill={VENTA_COLOR} radius={[0,6,6,0]} maxBarSize={22}/>
                          {calc.hasRealSnapshot ? (<>
                            <Bar dataKey="regular" stackId="inv" name="Inv. Regular" fill={CLASIF_COLOR.regular} maxBarSize={22}/>
                            <Bar dataKey="descuento" stackId="inv" name="Inv. Descuento" fill={CLASIF_COLOR.descuento} maxBarSize={22}/>
                            <Bar dataKey="depreciado" stackId="inv" name="Inv. Depreciado" fill={CLASIF_COLOR.depreciado} radius={[0,6,6,0]} maxBarSize={22}/>
                          </>) : calc.hasInvIniData && <Bar dataKey="invIni" name="Inv. Inicial $" fill="#f59e0b" radius={[0,6,6,0]} maxBarSize={22}/>}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {/* Desempeño por día */}
                  {calc.porDia.length>0 && (
                    <div className={`p-4 rounded-xl border overflow-x-auto lg:col-span-2 ${t.card}`}>
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <p className={`text-xs font-black ${t.textMain}`}>Desempeño por día — {calc.hasRealSnapshot?'venta por clasificación y margen %':'venta total y margen %'}{calc.hasLY?' (línea punteada = AA, alineado por día de evento)':''}</p>
                        <div className="flex gap-2">
                          <div className={`px-2.5 py-1 rounded-lg border text-right ${t.border}`}>
                            <p className={`text-[9px] font-bold ${t.textMuted}`}>Vta. diaria prom.</p>
                            <p className={`text-xs font-black ${t.textMain}`}>{calc.avgDiaTY!=null?fmtM(calc.avgDiaTY):'-'}</p>
                          </div>
                          {calc.hasLY && (
                            <div className={`px-2.5 py-1 rounded-lg border text-right ${t.border}`}>
                              <p className={`text-[9px] font-bold ${t.textMuted}`}>Vta. diaria prom. AA</p>
                              <p className={`text-xs font-black ${t.textMain}`}>{calc.avgDiaLY!=null?fmtM(calc.avgDiaLY):'-'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={calc.porDia} margin={{top:10}} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" stroke={gridC} vertical={false}/>
                          <XAxis dataKey="label" tick={{fontSize:9,fill:txtC}} stroke={axisC}/>
                          <YAxis yAxisId="izq" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                          <YAxis yAxisId="der" orientation="right" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>v.toFixed(0)+'%'}/>
                          <Tooltip content={<DiaTTip/>} cursor={{fill:cursorFill}}/>
                          <Legend wrapperStyle={{fontSize:10,color:txtC}}/>
                          {calc.hasRealSnapshot ? (<>
                            <Bar yAxisId="izq" dataKey="regular" stackId="v" name="Regular" fill={CLASIF_COLOR.regular}/>
                            <Bar yAxisId="izq" dataKey="descuento" stackId="v" name="Descuento" fill={CLASIF_COLOR.descuento}/>
                            <Bar yAxisId="izq" dataKey="depreciado" stackId="v" name="Depreciado" fill={CLASIF_COLOR.depreciado} radius={[6,6,0,0]}/>
                          </>) : (
                            <Bar yAxisId="izq" dataKey="ventaP" name="Venta $ Total" fill={CLASIF_COLOR.regular} radius={[6,6,0,0]}/>
                          )}
                          <Line yAxisId="der" type="monotone" dataKey="margenPct" name="Margen %" stroke={lineC} strokeWidth={2} dot={false}/>
                          {calc.hasLY && <Line yAxisId="izq" type="monotone" dataKey="ventaPLY" name="Venta $ AA" stroke={txtC} strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>}
                          {calc.hasInvIniData && calc.invIniTotal.invIni>0 &&
                            <ReferenceLine yAxisId="izq" y={calc.invIniTotal.invIni} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1.5}
                              label={{value:'Inv. Inicial $',position:'insideTopRight',fontSize:9,fill:'#f59e0b'}}/>}
                        </ComposedChart>
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
                          <Bar dataKey="ventaP" name="Venta $" fill={CLASIF_COLOR.regular} radius={[0,6,6,0]} maxBarSize={22}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
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
                          <Bar dataKey="ventaP" name="Venta $" fill={CLASIF_COLOR.regular} radius={[0,6,6,0]} maxBarSize={22}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
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
                </div>
              </>
            )}

            {reportTab==='desglose' && calc && (
              <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                {calc.hasRealSnapshot ? (<>
                <div className="flex items-center justify-between mb-3 no-print">
                  <p className={`text-xs font-black ${t.textMain}`}>Valor de inventario por clasificación — al arranque de la promo</p>
                  <div className="flex gap-1">
                    {[['marca','Marca'],['goa','GOA']].map(([k,lbl])=>(
                      <button key={k} onClick={()=>setGroupBy(k)} className={`px-3 py-1 rounded-lg text-[10px] font-bold border ${groupBy===k?t.btnPrimary:t.btnGhost}`}>{lbl}</button>
                    ))}
                  </div>
                </div>

                {/* Header con totales generales por clasificación — inventario AL ARRANQUE (monto/oh), no remanente */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {['regular','descuento','depreciado'].map(k=>(
                    <div key={k} className={`p-3 rounded-lg border ${t.cardInner}`} style={{boxShadow:`0 0 18px ${CLASIF_COLOR[k]}33`}}>
                      <p className="text-[10px] font-black uppercase flex items-center gap-1.5" style={{color:CLASIF_COLOR[k]}}>
                        <span className="w-2 h-2 rounded-full" style={{background:CLASIF_COLOR[k]}}/>{CLASIF_LABEL[k]}
                      </p>
                      <p className={`text-sm font-black mt-1 ${t.textMain}`}>{fmtM(calc.grand[k].monto)}</p>
                      <p className={`text-[10px] ${t.textMuted}`}>{calc.grand.total.monto>0?fmtP(calc.grand[k].monto/calc.grand.total.monto*100):'-'} del total · {fmt(calc.grand[k].oh)} pzs</p>
                      <p className={`text-[10px] mt-0.5 ${t.textMuted}`}>Remanente: {fmtM(calc.grand[k].montoA)} · {fmt(calc.grand[k].ohA)} pzs</p>
                      <p className="text-[10px] mt-1 flex items-center gap-1">vs AA:{' '}
                        {calc.grand[k].montoAant>0?<DeltaBadge value={(calc.grand[k].monto-calc.grand[k].montoAant)/calc.grand[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}
                      </p>
                    </div>
                  ))}
                </div>

                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={[{name:'Regular',monto:calc.grand.regular.monto},{name:'Descuento',monto:calc.grand.descuento.monto},{name:'Depreciado',monto:calc.grand.depreciado.monto}]} margin={{top:10}} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke={gridC} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC}/>
                    <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                    <Tooltip content={<TTip/>} cursor={{fill:cursorFill}}/>
                    <Bar dataKey="monto" name="Inventario inicial $" radius={[6,6,0,0]} maxBarSize={64}>
                      <Cell fill={CLASIF_COLOR.regular}/><Cell fill={CLASIF_COLOR.descuento}/><Cell fill={CLASIF_COLOR.depreciado}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

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
                                <td className="text-right border-l">{fmt(sec[k].oh)}</td>
                                <td className="text-right">{fmtM(sec[k].monto)}</td>
                                <td className="text-right">{sec[k].montoAant>0?<DeltaBadge value={(sec[k].monto-sec[k].montoAant)/sec[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}</td>
                              </React.Fragment>
                            ))}
                          </tr>
                          {isOpen && sec.subs.filter(sub=>sub.total.monto>0||sub.total.oh>0).map(sub=>(
                            <tr key={sub.nombre} className={`border-t ${t.border} ${t.textMuted}`}>
                              <td className="py-1.5 pl-6">{sub.nombre}</td>
                              {['regular','descuento','depreciado','total'].map(k=>(
                                <React.Fragment key={k}>
                                  <td className="text-right border-l">{fmt(sub[k].oh)}</td>
                                  <td className="text-right">{fmtM(sub[k].monto)}</td>
                                  <td className="text-right">{sub[k].montoAant>0?<DeltaBadge value={(sub[k].monto-sub[k].montoAant)/sub[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}</td>
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
                          <td className="text-right border-l">{fmt(calc.grand[k].oh)}</td>
                          <td className="text-right">{fmtM(calc.grand[k].monto)}</td>
                          <td className="text-right">{calc.grand[k].montoAant>0?<DeltaBadge value={(calc.grand[k].monto-calc.grand[k].montoAant)/calc.grand[k].montoAant*100}/>:<span className="text-gray-400">Sin AA</span>}</td>
                        </React.Fragment>
                      ))}
                    </tr>
                  </tfoot>
                </table>
                <p className={`text-[10px] mt-3 ${t.textMuted}`}>Click en una sección para desplegar por {groupBy==='marca'?'marca':'GOA'}. "Depreciado" = ya está en liquidación o pronto a estarlo (permanente). "Descuento" = letra temporal (MS) que regresa a su precio después del evento, o venta por debajo de lista sin letra formal.</p>
                </>) : (<>
                {/* Sin snapshot formal (sólo CSV/Vtas_Evento con columnas INV INI/OH): no hay letra de rebaja para
                    clasificar Regular/Descuento/Depreciado, pero sí inventario inicial $/U por SKU (TY vs AA) */}
                <div className="flex items-center justify-between mb-3 no-print">
                  <p className={`text-xs font-black ${t.textMain}`}>Inventario inicial (TY vs AA) — desde columnas INV INI / OH del archivo de ventas</p>
                  <div className="flex gap-1">
                    {[['marca','Marca'],['goa','GOA']].map(([k,lbl])=>(
                      <button key={k} onClick={()=>setGroupBy(k)} className={`px-3 py-1 rounded-lg text-[10px] font-bold border ${groupBy===k?t.btnPrimary:t.btnGhost}`}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <KpiCard label="Inv. Inicial $" value={fmtM(calc.invIniTotal.invIni)} delta={calc.invIniTotal.vsAA} t={t} isDark={isDark}/>
                  <KpiCard label="Inv. Inicial U" value={fmt(calc.invIniTotal.oh)} delta={calc.invIniTotal.vsAA_u} t={t} isDark={isDark}/>
                  <KpiCard label="Inv. Inicial $ AA" value={fmtM(calc.invIniTotal.invIniAA)} t={t} isDark={isDark}/>
                  <KpiCard label="Inv. Inicial U AA" value={fmt(calc.invIniTotal.ohAA)} t={t} isDark={isDark}/>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className={t.textMuted}>
                    <th className="text-left pb-2">{groupBy==='marca'?'Marca':'GOA'}</th>
                    <th className="text-right pb-2">Inv. Inicial $</th><th className="text-right pb-2">vs AA</th>
                    <th className="text-right pb-2">Inv. Inicial U</th><th className="text-right pb-2">vs AA</th>
                  </tr></thead>
                  <tbody>
                    {(groupBy==='marca'?calc.invIniPorMarca:calc.invIniPorGoa).map(r=>(
                      <tr key={r.name} className={`border-t ${t.border} ${t.textMain}`}>
                        <td className="py-2">{r.name}</td>
                        <td className="text-right">{fmtM(r.invIni)}</td><td className="text-right"><DeltaBadge value={r.vsAA}/></td>
                        <td className="text-right">{fmt(r.oh)}</td><td className="text-right"><DeltaBadge value={r.vsAA_u}/></td>
                      </tr>
                    ))}
                    {(groupBy==='marca'?calc.invIniPorMarca:calc.invIniPorGoa).length===0 && (
                      <tr><td colSpan={5} className={`py-6 text-center ${t.textMuted}`}>Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
                <p className={`text-[10px] mt-3 ${t.textMuted}`}>Sin snapshot ("OH y Montos") no hay letra de rebaja para separar Regular/Descuento/Depreciado — sube el snapshot para ese desglose. Este inventario inicial sale de las columnas agregadas al archivo de ventas.</p>
                </>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

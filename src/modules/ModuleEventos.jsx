import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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
const TIPOS_EVENTO=['BTS','Buen Fin','Navidad','Hot Sale','Día de las Madres','Liquidación','Otro'];
const OBJETIVOS=['Liquidar depreciado','Tráfico','Margen'];

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
// Ventas del evento — SKU-level, FECHA + VENTA_U + VENTA_$ + (MG% o UTILIDAD_$)
const parseSalesCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep)); if(rows.length<2) return {rows:[],error:null};
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
  return <span className={`text-[10px] font-black ${pos?'text-violet-400':'text-red-400'}`}>{pos?'▲':'▼'} {Math.abs(value).toFixed(1)}{pts?' pts':'%'}</span>;
};
const KpiCard = ({label,value,delta,pts,t}) => (
  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
    <p className={`text-[10px] font-bold uppercase tracking-wide ${t.textMuted}`}>{label}</p>
    <p className={`text-xl font-black mt-1 ${t.textMain}`}>{value}</p>
    {delta!==undefined && <div className="mt-1"><DeltaBadge value={delta} pts={pts}/></div>}
  </div>
);
const EmptyState = ({Icon,title,sub,t}) => (
  <div className={`p-10 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
    {Icon&&<Icon size={32} className="text-gray-400 mb-3"/>}
    <p className={`text-sm font-bold ${t.textMain}`}>{title}</p>
    {sub&&<p className={`text-xs mt-1 ${t.textMuted}`}>{sub}</p>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
export default function ModuleEventos(){
  const gState=useGlobal();
  const theme=gState?.theme||'light';
  const isDark=theme==='dark';
  const themes={
    dark:{appBg:'bg-transparent text-gray-100',card:'bg-zinc-900 border-zinc-800 shadow-sm',cardInner:'bg-zinc-950 border-zinc-800',
      textMain:'text-white',textMuted:'text-gray-400',textAccent1:'text-violet-300',textAccent2:'text-purple-300',border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-violet-500',btnPrimary:'bg-violet-500 text-white hover:bg-violet-400 shadow-[0_0_18px_rgba(139,92,246,0.4)]',
      btnGhost:'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      badge:'bg-violet-500/25 text-violet-300 border-violet-400/60',badgeTeal:'bg-purple-500/25 text-purple-300 border-purple-400/60',
      badgeAmber:'bg-amber-500/25 text-amber-300 border-amber-400/60',badgeRed:'bg-rose-500/25 text-rose-300 border-rose-400/60'},
    light:{appBg:'bg-transparent text-gray-800',card:'bg-white border-gray-200 shadow-sm',cardInner:'bg-gray-50 border-gray-200',
      textMain:'text-gray-900',textMuted:'text-gray-500',textAccent1:'text-violet-600',textAccent2:'text-purple-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-violet-500',btnPrimary:'bg-violet-600 text-white hover:bg-violet-700 shadow-md',
      btnGhost:'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-violet-100 text-violet-700 border-violet-300',badgeTeal:'bg-purple-100 text-purple-700 border-purple-300',
      badgeAmber:'bg-amber-100 text-amber-700 border-amber-300',badgeRed:'bg-rose-100 text-rose-700 border-rose-300'},
  };
  const t=themes[theme]||themes.light;
  const gridC=isDark?'#27272a':'#f0f0f0', axisC=isDark?'#52525b':'#d1d5db', txtC=isDark?'#a1a1aa':'#6b7280';
  const TTip=({active,payload,label})=>{ if(!active||!payload?.length) return null;
    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmtM(p.value)}</p>)}</div>; };

  // ── Event master ──
  const [events,setEvents]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('gop_eventos')||'[]'); }catch{ return []; } });
  const saveEvents=next=>{ setEvents(next); try{ localStorage.setItem('gop_eventos',JSON.stringify(next)); }catch{} };
  const [activeId,setActiveId]=useState(null);
  const active=events.find(e=>e.id===activeId)||null;
  const [showForm,setShowForm]=useState(false);
  const [editingLY,setEditingLY]=useState(false);
  const blankForm={nombre:'',tipo:TIPOS_EVENTO[0],tipoOtro:'',fechaInicio:'',fechaFin:'',objetivo:OBJETIVOS[0],lyVentaP:'',lyMargenPct:'',lyStPct:''};
  const [form,setForm]=useState(blankForm);

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
  const [loadingData,setLoadingData]=useState(false);
  const snapRef=useRef(null), salesRef=useRef(null);

  useEffect(()=>{
    if(!activeId){ setSnapRows([]); setSalesRows([]); return; }
    setLoadingData(true);
    Promise.all([idbGet(`snap_${activeId}`),idbGet(`sales_${activeId}`)]).then(([s,v])=>{
      setSnapRows(Array.isArray(s)?s:[]); setSalesRows(Array.isArray(v)?v:[]); setLoadingData(false);
    }).catch(()=>setLoadingData(false));
  },[activeId]);

  const uploadSnapshot=e=>{
    const file=e.target.files[0]; if(!file) return;
    if(snapRows.length>0 && !window.confirm('Ya existe un snapshot de arranque para este evento (inmutable por diseño). Subir uno nuevo lo REEMPLAZARÁ. ¿Continuar?')){
      if(snapRef.current) snapRef.current.value=''; return;
    }
    const reader=new FileReader();
    reader.onload=ev=>{ const {rows,error}=parseSnapshotCSV(ev.target.result);
      if(error){ alert(error); return; }
      if(rows.length===0){ alert('No se encontraron filas válidas en el CSV.'); return; }
      setSnapRows(rows); idbSet(`snap_${activeId}`,rows).catch(()=>{});
      if(snapRef.current) snapRef.current.value='';
    };
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

  // ── Cálculos ──
  const calc=useMemo(()=>{
    if(!active) return null;
    // Snapshot agregado a nivel SKU (nacional — suma OH entre centros si el CSV trae centro)
    const snapBySku={};
    snapRows.forEach(r=>{
      const k=r.sku;
      if(!snapBySku[k]) snapBySku[k]={sku:k,nsku:r.nsku,modelo:r.modelo,marca:r.marca,goa:r.goa,seccion:r.seccion,oh:0,letraDesc:r.letraDesc};
      snapBySku[k].oh+=r.oh;
      if(r.letraDesc && !snapBySku[k].letraDesc) snapBySku[k].letraDesc=r.letraDesc; // conserva si algún centro trae letra
    });
    // Ventas agregadas a nivel SKU
    const salesBySku={};
    let fMin=null,fMax=null;
    salesRows.forEach(r=>{
      const k=r.sku;
      if(!salesBySku[k]) salesBySku[k]={sku:k,modelo:r.modelo,marca:r.marca,goa:r.goa,seccion:r.seccion,ventaU:0,ventaP:0,utilidad:0};
      salesBySku[k].ventaU+=r.ventaU; salesBySku[k].ventaP+=r.ventaP; salesBySku[k].utilidad+=r.utilidad;
      if(r.fecha){ if(!fMin||r.fecha<fMin) fMin=r.fecha; if(!fMax||r.fecha>fMax) fMax=r.fecha; }
    });
    const allSkus=new Set([...Object.keys(snapBySku),...Object.keys(salesBySku)]);
    const detail=[]; let sinSnapshot=0;
    allSkus.forEach(sku=>{
      const s=snapBySku[sku], v=salesBySku[sku]||{ventaU:0,ventaP:0,utilidad:0};
      const clasif = s ? (s.letraDesc?'depreciado':'regular') : 'sin_snapshot';
      if(clasif==='sin_snapshot') sinSnapshot++;
      const ohInicio=s?.oh||0;
      detail.push({ sku, marca:v.marca||s?.marca||'', goa:v.goa||s?.goa||'', seccion:v.seccion||s?.seccion||'GENERAL',
        modelo:v.modelo||s?.modelo||s?.nsku||'', clasif, ohInicio, ventaU:v.ventaU, ventaP:v.ventaP, utilidad:v.utilidad,
        remanente: s ? Math.max(0,ohInicio-v.ventaU) : null,
        stPct: ohInicio>0 ? Math.min(100,(v.ventaU/ohInicio)*100) : null });
    });
    const rollup = rows => { const ventaP=rows.reduce((s,r)=>s+r.ventaP,0), ventaU=rows.reduce((s,r)=>s+r.ventaU,0),
      utilidad=rows.reduce((s,r)=>s+r.utilidad,0), ohInicio=rows.reduce((s,r)=>s+r.ohInicio,0),
      remanente=rows.reduce((s,r)=>s+(r.remanente||0),0);
      return { ventaP, ventaU, utilidad, margenPct: ventaP>0?utilidad/ventaP*100:null,
        ohInicio, remanente, stPct: ohInicio>0?Math.min(100,ventaU/ohInicio*100):null }; };
    const total=rollup(detail);
    const regular=rollup(detail.filter(r=>r.clasif==='regular'));
    const depreciado=rollup(detail.filter(r=>r.clasif==='depreciado'));
    // Breakdown por categoría (sección)
    const catMap={};
    detail.forEach(r=>{ const k=r.seccion||'GENERAL'; if(!catMap[k]) catMap[k]=[]; catMap[k].push(r); });
    const categorias=Object.entries(catMap).map(([seccion,rows])=>({seccion,...rollup(rows)})).sort((a,b)=>b.ventaP-a.ventaP);
    // Top/bottom SKU (bottom solo entre los que arrancaron con inventario, para que sea accionable)
    const bySkuVenta=[...detail].sort((a,b)=>b.ventaP-a.ventaP);
    const top10=bySkuVenta.slice(0,10);
    const bottom10=[...detail].filter(r=>r.ohInicio>0).sort((a,b)=>a.ventaP-b.ventaP).slice(0,10);
    // Deltas vs LY
    const deltaVentaP = active.lyVentaP ? (total.ventaP-active.lyVentaP)/active.lyVentaP*100 : null;
    const deltaMargen = active.lyMargenPct!=null && total.margenPct!=null ? total.margenPct-active.lyMargenPct : null;
    const deltaST = active.lyStPct!=null && total.stPct!=null ? total.stPct-active.lyStPct : null;
    return { total, regular, depreciado, categorias, top10, bottom10, sinSnapshot, fMin, fMax,
      deltaVentaP, deltaMargen, deltaST, nSkuSnap:Object.keys(snapBySku).length, nSkuVenta:Object.keys(salesBySku).length };
  },[active,snapRows,salesRows]);

  // ═══ VISTA: LISTA DE EVENTOS ═══
  if(!activeId){
    return (
      <div className={`p-6 space-y-5 ${t.appBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-black flex items-center gap-2 ${t.textMain}`}><Icons.Tag size={20} className={t.textAccent1}/> Eventos Promocionales</h2>
            <p className={`text-xs mt-1 ${t.textMuted}`}>Detalle por SKU de cada evento — snapshot de arranque, venta, margen, sell-through y remanente.</p>
          </div>
          <button onClick={()=>setShowForm(true)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold ${t.btnPrimary}`}>
            <Icons.Plus size={14}/> Nuevo evento
          </button>
        </div>

        {showForm && (
          <div className={`p-5 rounded-xl border space-y-3 ${t.card}`}>
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
          </div>
        )}

        {events.length===0 ? (
          <EmptyState Icon={Icons.Tag} title="Sin eventos capturados" sub="Crea tu primer evento promocional para empezar a bajar al detalle por SKU." t={t}/>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(ev=>(
              <button key={ev.id} onClick={()=>setActiveId(ev.id)} className={`text-left p-4 rounded-xl border transition-all hover:scale-[1.01] ${t.card}`}>
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
      <div className="flex items-center justify-between">
        <button onClick={()=>setActiveId(null)} className={`flex items-center gap-1 text-xs font-bold ${t.textMuted} hover:${t.textMain}`}>
          <Icons.ChevronLeft size={14}/> Eventos
        </button>
        <button onClick={()=>{setEditingLY(true);setForm(f=>({...f,lyVentaP:active.lyVentaP||'',lyMargenPct:active.lyMargenPct||'',lyStPct:active.lyStPct||'',objetivo:active.objetivo}));}}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${t.btnGhost}`}>Editar LY / objetivo</button>
      </div>

      <div className={`p-5 rounded-xl border ${t.card}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${t.badge}`}>{active.tipo}</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${t.badgeTeal}`}>{active.objetivo}</span>
        </div>
        <h2 className={`text-xl font-black mt-2 ${t.textMain}`}>{active.nombre}</h2>
        <p className={`text-xs mt-1 ${t.textMuted}`}>{active.fechaInicio} → {active.fechaFin}
          {calc?.fMin && ` · Venta capturada: ${calc.fMin.toLocaleDateString('es-MX')} – ${calc.fMax.toLocaleDateString('es-MX')}`}</p>
      </div>

      {editingLY && (
        <div className={`p-4 rounded-xl border space-y-3 ${t.card}`}>
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
        </div>
      )}

      {/* Carga de datos */}
      <div className={`p-4 rounded-xl border flex flex-wrap items-center gap-3 ${t.card}`}>
        <input ref={snapRef} type="file" accept=".csv,.txt" className="hidden" onChange={uploadSnapshot}/>
        <button onClick={()=>snapRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border ${t.btnGhost}`}>
          <Icons.Upload size={13}/> CSV Snapshot arranque {snapRows.length>0 && `(${calc?.nSkuSnap} SKU)`}
        </button>
        <input ref={salesRef} type="file" accept=".csv,.txt" className="hidden" onChange={uploadSales}/>
        <button onClick={()=>salesRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border ${t.btnGhost}`}>
          <Icons.Upload size={13}/> CSV Ventas del evento {salesRows.length>0 && `(${calc?.nSkuVenta} SKU)`}
        </button>
        {snapRows.length>0 && <span className={`text-[10px] px-2 py-1 rounded-full border ${t.badgeAmber}`}>Snapshot inmutable — reemplazar pide confirmación</span>}
        {calc?.sinSnapshot>0 && <span className={`text-[10px] px-2 py-1 rounded-full border ${t.badgeRed}`}>{calc.sinSnapshot} SKU con venta sin snapshot inicial (no cuentan en remanente/ST)</span>}
      </div>

      {(!calc || (snapRows.length===0 && salesRows.length===0)) ? (
        <EmptyState Icon={Icons.Upload} title="Sube el snapshot de inventario y el CSV de ventas" sub="Con ambos se calculan venta, margen, sell-through y remanente automáticamente." t={t}/>
      ) : (
        <>
          {/* KPIs totales */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Venta $" value={fmtM(calc.total.ventaP)} delta={calc.deltaVentaP} t={t}/>
            <KpiCard label="Venta U" value={fmt(calc.total.ventaU)} t={t}/>
            <KpiCard label="Margen %" value={fmtP(calc.total.margenPct)} delta={calc.deltaMargen} pts t={t}/>
            <KpiCard label="Margen $" value={fmtM(calc.total.utilidad)} t={t}/>
            <KpiCard label="Sell-through" value={fmtP(calc.total.stPct)} delta={calc.deltaST} pts t={t}/>
            <KpiCard label="Remanente U" value={fmt(calc.total.remanente)} t={t}/>
          </div>

          {/* Regular vs Depreciado */}
          <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
            <p className={`text-xs font-black mb-3 ${t.textMain}`}>Regular vs Depreciado</p>
            <table className="w-full text-xs">
              <thead><tr className={t.textMuted}>
                <th className="text-left pb-2">Clasificación (al arranque)</th><th className="text-right pb-2">Venta $</th>
                <th className="text-right pb-2">Venta U</th><th className="text-right pb-2">Margen %</th>
                <th className="text-right pb-2">Sell-through</th><th className="text-right pb-2">Remanente U</th>
              </tr></thead>
              <tbody>
                {[['Regular',calc.regular],['Depreciado',calc.depreciado],['Total',calc.total]].map(([lbl,r])=>(
                  <tr key={lbl} className={`border-t ${t.border} ${lbl==='Total'?'font-black':''} ${t.textMain}`}>
                    <td className="py-2">{lbl}</td><td className="text-right">{fmtM(r.ventaP)}</td>
                    <td className="text-right">{fmt(r.ventaU)}</td><td className="text-right">{fmtP(r.margenPct)}</td>
                    <td className="text-right">{fmtP(r.stPct)}</td><td className="text-right">{fmt(r.remanente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={[{name:'Regular',ventaP:calc.regular.ventaP},{name:'Depreciado',ventaP:calc.depreciado.ventaP}]} margin={{top:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridC} vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:10,fill:txtC}} stroke={axisC}/>
                <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                <Tooltip content={<TTip/>}/>
                <Bar dataKey="ventaP" name="Venta $" radius={[4,4,0,0]}>
                  <Cell fill="#8b5cf6"/><Cell fill="#f59e0b"/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown por categoría */}
          {calc.categorias.length>0 && (
            <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
              <p className={`text-xs font-black mb-3 ${t.textMain}`}>Breakdown por categoría</p>
              <table className="w-full text-xs">
                <thead><tr className={t.textMuted}>
                  <th className="text-left pb-2">Sección</th><th className="text-right pb-2">Venta $</th>
                  <th className="text-right pb-2">Venta U</th><th className="text-right pb-2">Margen %</th><th className="text-right pb-2">Sell-through</th>
                </tr></thead>
                <tbody>
                  {calc.categorias.map(c=>(
                    <tr key={c.seccion} className={`border-t ${t.border} ${t.textMain}`}>
                      <td className="py-2">{c.seccion}</td><td className="text-right">{fmtM(c.ventaP)}</td>
                      <td className="text-right">{fmt(c.ventaU)}</td><td className="text-right">{fmtP(c.margenPct)}</td><td className="text-right">{fmtP(c.stPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ResponsiveContainer width="100%" height={Math.max(160,calc.categorias.length*32)}>
                <BarChart data={calc.categorias} layout="vertical" margin={{left:10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                  <YAxis type="category" dataKey="seccion" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={110}/>
                  <Tooltip content={<TTip/>}/>
                  <Bar dataKey="ventaP" name="Venta $" fill="#8b5cf6" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top 10 SKU — gráfica */}
          {calc.top10.length>0 && (
            <div className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
              <p className={`text-xs font-black mb-3 ${t.textMain}`}>Top 10 SKU · Venta $</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={calc.top10} layout="vertical" margin={{left:10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                  <YAxis type="category" dataKey="sku" tick={{fontSize:10,fill:txtC}} stroke={axisC} width={70}/>
                  <Tooltip content={<TTip/>}/>
                  <Bar dataKey="ventaP" name="Venta $" radius={[0,4,4,0]}>
                    {calc.top10.map((r,i)=><Cell key={i} fill={r.clasif==='depreciado'?'#f59e0b':r.clasif==='regular'?'#8b5cf6':'#fb7185'}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top / Bottom SKU */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[['Top 10 SKU · Venta $',calc.top10],['Bottom 10 SKU · Venta $ (con inventario inicial)',calc.bottom10]].map(([title,rows])=>(
              <div key={title} className={`p-4 rounded-xl border overflow-x-auto ${t.card}`}>
                <p className={`text-xs font-black mb-3 ${t.textMain}`}>{title}</p>
                <table className="w-full text-xs">
                  <thead><tr className={t.textMuted}><th className="text-left pb-2">SKU</th><th className="text-left pb-2">Clasif.</th>
                    <th className="text-right pb-2">Venta $</th><th className="text-right pb-2">Venta U</th><th className="text-right pb-2">ST%</th></tr></thead>
                  <tbody>
                    {rows.length===0 ? (<tr><td colSpan={5} className={`py-3 text-center ${t.textMuted}`}>Sin datos</td></tr>) :
                    rows.map(r=>(
                      <tr key={r.sku} className={`border-t ${t.border} ${t.textMain}`}>
                        <td className="py-1.5">{r.sku}<div className={`text-[9px] ${t.textMuted}`}>{r.modelo||r.marca}</div></td>
                        <td><span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${r.clasif==='depreciado'?t.badgeAmber:r.clasif==='regular'?t.badge:t.badgeRed}`}>{r.clasif}</span></td>
                        <td className="text-right">{fmtM(r.ventaP)}</td><td className="text-right">{fmt(r.ventaU)}</td><td className="text-right">{fmtP(r.stPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

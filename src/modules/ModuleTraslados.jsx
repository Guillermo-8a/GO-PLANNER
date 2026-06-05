import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Icons from '../utils/icons';
import { useGlobal } from '../context/GlobalContext';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
     .map(c => c.replace(/^"|"$/g, '').trim());

const num = v => parseFloat(String(v||'0').replace(/[^0-9.,-]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.'))||0;
const fmt = (n,d=0) => n==null?'-':n.toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const stripDiac = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');

const linearRegression = pts => {
  const n=pts.length; if(n<2) return {slope:0,intercept:0,r2:0,n};
  const sx=pts.reduce((s,p)=>s+p.x,0), sy=pts.reduce((s,p)=>s+p.y,0);
  const sxy=pts.reduce((s,p)=>s+p.x*p.y,0), sx2=pts.reduce((s,p)=>s+p.x*p.x,0);
  const slope=(n*sxy-sx*sy)/(n*sx2-sx*sx)||0;
  const intercept=(sy-slope*sx)/n;
  const ym=sy/n;
  const sst=pts.reduce((s,p)=>s+Math.pow(p.y-ym,2),0);
  const ssr=pts.reduce((s,p)=>s+Math.pow(p.y-(slope*p.x+intercept),2),0);
  return {slope,intercept,r2:Math.max(0,sst>0?1-ssr/sst:0),n};
};

// ─── INDEXEDDB (persistencia local, sin red, sobrevive refresh) ───────────────
const DB='gop_db', STORE='dispersion';
const idbOpen=()=>new Promise((res,rej)=>{
  const o=indexedDB.open(DB,1);
  o.onupgradeneeded=()=>{ if(!o.result.objectStoreNames.contains(STORE)) o.result.createObjectStore(STORE); };
  o.onsuccess=()=>res(o.result); o.onerror=()=>rej(o.error);
});
const idbSet=async(key,val)=>{ const db=await idbOpen(); return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(val,key);
  tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>rej(tx.error); }); };
const idbGet=async key=>{ const db=await idbOpen(); return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(key);
  rq.onsuccess=()=>{db.close();res(rq.result);}; rq.onerror=()=>rej(rq.error); }); };

// ─── CSV PARSER (layout de extracción, blindado acentos/BOM/CRLF) ─────────────
const parseCSV = text => {
  text=text.replace(/^\uFEFF/,'');
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split(/\r?\n/).map(r=>parseCSVRow(r,sep));
  if(rows.length<2) return [];
  const H=rows[0].map(h=>stripDiac(h.toUpperCase().trim()).replace(/\s+/g,'_').replace(/[.()]/g,''));
  const idx=(...ns)=>{ for(const n of ns){ const i=H.findIndex(h=>h===n); if(i>=0) return i; }
                       for(const n of ns){ const i=H.findIndex(h=>h.includes(n)); if(i>=0) return i; } return -1; };
  const I={
    direccion:idx('DIRECCION'), division:idx('DIVISION'), seccion:idx('SECCION'),
    norma:idx('NORMA_DE_APROVISIONAMIENTO','NORMA'), goa:idx('GRUPO_ARTICULOS','GRUPO'),
    proveedor:idx('PROVEEDOR'), marca:idx('MARCA'), centro:idx('CENTRO'), tienda:idx('TIENDA'),
    venta:idx('VTAS_PESOS','VTAS','VENTAS'), prom:idx('PROM_INVENTARIO','PROM_INV'),
    invIni:idx('INVENTARIO_INICIAL','INV_INICIAL'), invFin:idx('INVENTARIO_FINAL','INV_FINAL'),
    ideal:idx('INVENTARIO_IDEAL','INV_IDEAL','IDEAL'),
  };
  const g=(r,k)=>I[k]>=0?(r[I[k]]||'').trim():'';
  const gn=(r,k)=>I[k]>=0?num(r[I[k]]):0;
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    out.push({
      direccion:g(r,'direccion')||'GENERAL', division:g(r,'division')||'GENERAL',
      seccion:g(r,'seccion')||'GENERAL', norma:g(r,'norma')||'SIN NORMA',
      goa:g(r,'goa')||'SIN GOA', proveedor:g(r,'proveedor')||'SIN PROV',
      marca:g(r,'marca')||'SIN MARCA', centro:g(r,'centro')||'', tienda:g(r,'tienda')||g(r,'centro')||'',
      venta:gn(r,'venta'), prom:gn(r,'prom'),
      invIni:gn(r,'invIni'), invFin:gn(r,'invFin'), ideal:gn(r,'ideal'),
    });
  }
  out._cols=Object.entries(I).filter(([,v])=>v>=0).map(([k])=>k); // diagnóstico
  return out;
};

// ─── CONFIG ───────────────────────────────────────────────────────────────
const MEASURES=[
  {key:'venta',label:'Vtas. Pesos'},{key:'prom',label:'Prom Inventario'},
  {key:'invIni',label:'Inv. Inicial'},{key:'invFin',label:'Inv. Final'},{key:'ideal',label:'Inv. Ideal'},
];
const LEVELS=[
  {key:'__row__',label:'Granular'},{key:'tienda',label:'Tienda'},{key:'centro',label:'Centro'},
  {key:'goa',label:'GOA'},{key:'marca',label:'Marca'},{key:'proveedor',label:'Proveedor'},
  {key:'seccion',label:'Sección'},{key:'division',label:'División'},
];
const FILTER_DIMS=[
  {key:'division',label:'División'},{key:'seccion',label:'Sección'},{key:'marca',label:'Marca'},
  {key:'goa',label:'GOA'},{key:'proveedor',label:'Proveedor'},{key:'norma',label:'Norma'},
];

// ═══════════════════════════════════════════════════════════════════════════
export default function ModuleDispersion(){
  const gState=useGlobal();
  const theme=gState?.theme||'light';
  const isDark=theme==='dark';

  const themes={
    dark:{
      appBg:'bg-transparent text-gray-100',card:'bg-zinc-900 border-zinc-800 shadow-sm',
      cardInner:'bg-zinc-950 border-zinc-800',textMain:'text-white',textMuted:'text-gray-400',
      accent:'text-violet-400',border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-violet-500',
      btnGhost:'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      badge:'bg-violet-900/30 text-violet-300 border-violet-500/40',
      badgeAmber:'bg-amber-900/30 text-amber-400 border-amber-500/40',
      badgeGray:'bg-zinc-800/60 text-gray-400 border-zinc-600/40',
      thBg:'bg-violet-900/40 text-violet-200', rowAlt:'bg-zinc-900/40',
    },
    light:{
      appBg:'bg-transparent text-gray-800',card:'bg-white border-gray-200 shadow-sm',
      cardInner:'bg-gray-50 border-gray-200',textMain:'text-gray-900',textMuted:'text-gray-500',
      accent:'text-violet-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-violet-500',
      btnGhost:'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-violet-50 text-violet-700 border-violet-200',
      badgeAmber:'bg-amber-50 text-amber-700 border-amber-200',
      badgeGray:'bg-gray-100 text-gray-500 border-gray-200',
      thBg:'bg-violet-100 text-violet-800', rowAlt:'bg-gray-50',
    },
  };
  const t=themes[theme]||themes.light;

  const fileRef=useRef(null);
  const [data,setData]=useState([]);
  const [cols,setCols]=useState([]);
  const [xKey,setXKey]=useState('venta');
  const [yKey,setYKey]=useState('prom');
  const [level,setLevel]=useState('tienda');
  const [excludeZeros,setExcludeZeros]=useState(false);
  const [filters,setFilters]=useState({});
  const [loading,setLoading]=useState(true);

  // Cargar data desde IndexedDB al montar (sobrevive refresh y cambio de módulo)
  useEffect(()=>{ (async()=>{
    try{ const d=await idbGet('data'); if(Array.isArray(d)&&d.length){ setData(d); setCols(d._cols||[]); } }catch{}
    try{ const c=localStorage.getItem('gop_dispersion'); if(c){ const o=JSON.parse(c);
      o.xKey&&setXKey(o.xKey); o.yKey&&setYKey(o.yKey); o.level&&setLevel(o.level);
      o.excludeZeros!=null&&setExcludeZeros(o.excludeZeros); o.filters&&setFilters(o.filters); } }catch{}
    setLoading(false);
  })(); },[]);
  useEffect(()=>{ if(!loading) try{ localStorage.setItem('gop_dispersion',JSON.stringify({xKey,yKey,level,excludeZeros,filters})); }catch{} },[xKey,yKey,level,excludeZeros,filters,loading]);

  const handleUpload=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ const rows=parseCSV(ev.target.result);
      setData(rows); setCols(rows._cols||[]); setFilters({});
      idbSet('data',rows).catch(()=>{}); e.target.value=''; };
    reader.readAsText(file,'UTF-8');
  };
  const clearData=()=>{ if(window.confirm('¿Borrar datos?')){ setData([]); setCols([]); idbSet('data',[]).catch(()=>{}); } };

  // Filtros en cascada: opciones de cada dim = valores válidos dado los OTROS filtros activos
  const opts=useMemo(()=>{
    const o={};
    for(const d of FILTER_DIMS){
      const rows=data.filter(r=>FILTER_DIMS.every(f=>f.key===d.key||!filters[f.key]||r[f.key]===filters[f.key]));
      const set=new Set(rows.map(r=>r[d.key]).filter(Boolean));
      if(filters[d.key]) set.add(filters[d.key]); // mantener el seleccionado aunque se acote
      o[d.key]=[...set].sort();
    }
    return o;
  },[data,filters]);

  const passFilters=r=>FILTER_DIMS.every(d=>!filters[d.key]||r[d.key]===filters[d.key]);

  // PIPELINE: filtrar → (excluir 0) → agregar al nivel → puntos
  const { points, reg, dropped, raw } = useMemo(()=>{
    let pairs=data.filter(passFilters).map(r=>({x:r[xKey],y:r[yKey],g:r[level]}));
    const before=pairs.length;
    if(excludeZeros) pairs=pairs.filter(p=>p.x!==0&&p.y!==0);
    const dropped=before-pairs.length;
    let pts;
    if(level==='__row__'){ pts=pairs.map(p=>({x:p.x,y:p.y,name:''})); }
    else { const m=new Map();
      for(const p of pairs){ const k=p.g||'N/D'; const a=m.get(k)||{x:0,y:0,name:k}; a.x+=p.x; a.y+=p.y; m.set(k,a); }
      pts=[...m.values()]; }
    return { points:pts, reg:linearRegression(pts), dropped, raw:pairs.length };
  },[data,filters,xKey,yKey,level,excludeZeros]);

  // Tabla: resumen por nivel (en granular resume por Tienda para no listar 349k filas)
  const tableLevel=level==='__row__'?'tienda':level;
  const tableRows=useMemo(()=>{
    const m=new Map();
    for(const r of data){ if(!passFilters(r)) continue;
      const k=r[tableLevel]||'N/D';
      const a=m.get(k)||{name:k,venta:0,prom:0,invIni:0,invFin:0,ideal:0,n:0};
      a.venta+=r.venta;a.prom+=r.prom;a.invIni+=r.invIni;a.invFin+=r.invFin;a.ideal+=r.ideal;a.n++; m.set(k,a); }
    return [...m.values()].map(a=>({...a,dif:a.ideal-a.invFin})).sort((x,y)=>y.venta-x.venta);
  },[data,filters,tableLevel]);
  const totals=useMemo(()=>tableRows.reduce((s,r)=>({venta:s.venta+r.venta,prom:s.prom+r.prom,invIni:s.invIni+r.invIni,invFin:s.invFin+r.invFin,ideal:s.ideal+r.ideal,dif:s.dif+r.dif}),{venta:0,prom:0,invIni:0,invFin:0,ideal:0,dif:0}),[tableRows]);

  const gridC=isDark?'#27272a':'#f0f0f0';
  const axisC=isDark?'#52525b':'#d1d5db';
  const txtC=isDark?'#a1a1aa':'#6b7280';
  const xLabel=MEASURES.find(m=>m.key===xKey)?.label;
  const yLabel=MEASURES.find(m=>m.key===yKey)?.label;
  const r2=reg.r2;
  const r2Badge=r2>0.7?t.badge:r2>0.4?t.badgeAmber:t.badgeGray;
  const hasData=data.length>0;
  const TABLE_LIMIT=200;

  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>

      {/* HEADER */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark?'bg-violet-500/20':'bg-violet-50'}`}>
                <Icons.BarChart2 size={22} className={t.accent}/>
              </span>
              Dispersión
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>R² multinivel · Venta vs Inventario · agrega como tabla dinámica según el nivel</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload}/>
            <button onClick={()=>fileRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14}/> CSV Extracción
            </button>
            {hasData&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{data.length.toLocaleString()} filas</span>}
            {hasData&&<button onClick={clearData} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost} opacity-40 hover:opacity-100`}><Icons.Trash2 size={14}/></button>}
          </div>
        </div>
        {hasData&&cols.length>0&&(
          <p className={`text-[9px] mt-3 ${t.textMuted}`}>Columnas detectadas: {cols.join(' · ')}</p>
        )}
      </div>

      {!hasData?(
        <div className={`p-12 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
          <Icons.Upload size={36} className="text-gray-400 mb-3"/>
          <p className={`text-sm font-bold ${t.textMain}`}>Carga tu CSV de extracción</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>La data queda guardada localmente (IndexedDB) y sobrevive al refresh.</p>
        </div>
      ):(
        <div className="space-y-4">

          {/* CONTROLES */}
          <div className={`flex flex-wrap items-end gap-3 p-3 rounded-xl border ${t.cardInner}`}>
            <Ctrl label="Eje X" t={t}><select value={xKey} onChange={e=>setXKey(e.target.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>{MEASURES.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></Ctrl>
            <Ctrl label="Eje Y" t={t}><select value={yKey} onChange={e=>setYKey(e.target.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>{MEASURES.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></Ctrl>
            <Ctrl label="Excluir ceros" t={t}><button onClick={()=>setExcludeZeros(v=>!v)} className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${excludeZeros?t.badge:t.btnGhost}`}>{excludeZeros?'Sí':'No'}</button></Ctrl>
          </div>

          {/* NIVEL */}
          <div className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${t.cardInner}`}>
            <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted} mr-1`}><Icons.BarChart2 size={11} className="inline mr-1"/>Nivel (cada punto =)</span>
            {LEVELS.map(l=><button key={l.key} onClick={()=>setLevel(l.key)} className={`text-[10px] px-3 py-1 rounded-full border font-black transition-all ${level===l.key?t.badge:t.btnGhost}`}>{l.label}</button>)}
          </div>

          {/* FILTROS (cascada) */}
          <div className={`flex flex-wrap gap-2 p-3 rounded-xl border ${t.cardInner}`}>
            {FILTER_DIMS.map(d=>(
              <select key={d.key} value={filters[d.key]||''} onChange={e=>setFilters(f=>({...f,[d.key]:e.target.value}))}
                className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                <option value="">{d.label}: Todos ({opts[d.key]?.length||0})</option>
                {opts[d.key]?.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            ))}
            {Object.values(filters).some(Boolean)&&<button onClick={()=>setFilters({})} className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>✕ Limpiar</button>}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              {label:'R²',val:fmt(r2,3),color:t.accent},
              {label:'Puntos (n)',val:fmt(points.length),color:t.accent,sub:`${fmt(raw)} filas en scope`},
              {label:'Pendiente',val:fmt(reg.slope,4),color:t.textMuted},
              {label:'Filas excluidas (0)',val:excludeZeros?fmt(dropped):'—',color:t.textMuted},
            ].map(({label,val,color,sub})=>(
              <div key={label} className={`p-3 rounded-xl border ${t.cardInner}`}>
                <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-0.5`}>{label}</div>
                <div className={`text-xl font-black ${color}`}>{val}</div>
                {sub&&<div className={`text-[9px] ${t.textMuted}`}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* SCATTER */}
          <div className={`p-4 rounded-xl border ${t.cardInner}`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h4 className={`text-sm font-bold ${t.textMain}`}>🟣 {xLabel} vs {yLabel} · por {LEVELS.find(l=>l.key===level)?.label}</h4>
              <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${r2Badge}`}>R² = {r2.toFixed(2)}</span>
            </div>
            {points.length<2?(
              <p className={`text-xs ${t.textMuted} py-8 text-center`}>Se necesitan ≥2 puntos. Ajusta filtros o nivel.</p>
            ):(
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{top:10,right:20,left:0,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                  <XAxis dataKey="x" name={xLabel} type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC}
                    tickFormatter={v=>Math.abs(v)>=1000?(v/1000).toFixed(0)+'k':fmt(v)}
                    label={{value:xLabel,position:'insideBottom',offset:-10,fontSize:10,fill:txtC}}/>
                  <YAxis dataKey="y" name={yLabel} type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC}
                    tickFormatter={v=>Math.abs(v)>=1000?(v/1000).toFixed(0)+'k':fmt(v)}
                    label={{value:yLabel,angle:-90,position:'insideLeft',fontSize:10,fill:txtC}}/>
                  <Tooltip content={({active,payload})=>{
                    if(!active||!payload?.length) return null; const d=payload[0]?.payload;
                    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>
                      {d?.name&&<p className={`font-bold mb-1 ${t.textMain}`}>{d.name}</p>}
                      <p className="text-gray-400">{xLabel}: {fmt(d?.x,1)}</p>
                      <p className={t.accent}>{yLabel}: {fmt(d?.y,1)}</p>
                    </div>; }}/>
                  <Scatter data={points} fill="#9ca3af" fillOpacity={0.65}/>
                  {reg.n>=2&&(()=>{ const xs=points.map(d=>d.x); const xMin=Math.min(...xs),xMax=Math.max(...xs);
                    return <Scatter data={[{x:xMin,y:reg.slope*xMin+reg.intercept},{x:xMax,y:reg.slope*xMax+reg.intercept}]}
                      fill="none" line={{stroke:'#8b5cf6',strokeWidth:2.5}} shape={()=>null} legendType="none"/>; })()}
                </ScatterChart>
              </ResponsiveContainer>
            )}
            <p className={`text-[9px] mt-2 ${t.textMuted}`}>Granular = cada fila un punto (R² fina, baja). Agregar suma combinaciones por grupo (como tabla dinámica) → R² más alta. Filtros se aplican antes de agregar.</p>
          </div>

          {/* TABLA */}
          <div className={`p-4 rounded-xl border ${t.cardInner}`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className={`text-sm font-bold ${t.textMain}`}>Detalle por {LEVELS.find(l=>l.key===tableLevel)?.label}</h4>
              <span className={`text-[10px] ${t.textMuted}`}>{tableRows.length.toLocaleString()} grupos{tableRows.length>TABLE_LIMIT?` · mostrando top ${TABLE_LIMIT} por venta`:''}</span>
            </div>
            <div className="overflow-x-auto rounded-lg">
              <table className="w-full text-xs">
                <thead><tr className={`${t.thBg}`}>
                  {[LEVELS.find(l=>l.key===tableLevel)?.label,'Vtas $','Prom Inv','Inv Inicial','Inv Final','Inv Ideal','Diferencia'].map((h,i)=>(
                    <th key={i} className={`px-3 py-2 font-black uppercase tracking-wide text-[9px] ${i===0?'text-left':'text-right'}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {tableRows.slice(0,TABLE_LIMIT).map((r,i)=>(
                    <tr key={r.name} className={`${i%2?t.rowAlt:''} border-b ${t.border}`}>
                      <td className={`px-3 py-1.5 font-bold ${t.textMain} truncate max-w-[160px]`}>{r.name}</td>
                      <td className={`px-3 py-1.5 text-right ${t.accent} font-bold`}>{fmt(r.venta)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.prom)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.invIni)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.invFin)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.ideal)}</td>
                      <td className={`px-3 py-1.5 text-right font-bold ${r.dif>=0?'text-amber-500':t.accent}`}>{fmt(r.dif)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className={`border-t-2 ${t.border} font-black ${t.textMain}`}>
                  <td className="px-3 py-2 text-left">TOTAL</td>
                  <td className={`px-3 py-2 text-right ${t.accent}`}>{fmt(totals.venta)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.prom)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.invIni)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.invFin)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.ideal)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.dif)}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html:`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        .animate-fade-in-up{animation:fadeInUp 0.4s ease-out forwards;}
      `}}/>
    </div>
  );
}

const Ctrl=({label,t,children})=>(
  <div><div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-1`}>{label}</div>{children}</div>
);

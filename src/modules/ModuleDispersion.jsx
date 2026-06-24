import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Icons from '../utils/icons';
import { useGlobal } from '../context/GlobalContext';
import {
  ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── HELPERS ────────────────────────────────────────────────────────────────
const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`)).map(c => c.replace(/^"|"$/g, '').trim());
const num = v => parseFloat(String(v||'0').replace(/[^0-9.,-]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.'))||0;
const fmt = (n,d=0) => n==null?'-':n.toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const stripDiac = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const minMax = arr => { let mn=Infinity,mx=-Infinity; for(const v of arr){ if(v<mn)mn=v; if(v>mx)mx=v; } return [mn,mx]; };
const MESES={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12};
const mesNum = s => { const u=stripDiac(String(s||'').toUpperCase().trim()); return MESES[u]||parseInt(u)||0; };

const linearRegression = pts => {
  const n=pts.length; if(n<2) return {slope:0,intercept:0,r2:0,n};
  let sx=0,sy=0,sxy=0,sx2=0; for(const p of pts){ sx+=p.x; sy+=p.y; sxy+=p.x*p.y; sx2+=p.x*p.x; }
  const slope=(n*sxy-sx*sy)/(n*sx2-sx*sx)||0; const intercept=(sy-slope*sx)/n; const ym=sy/n;
  let sst=0,ssr=0; for(const p of pts){ sst+=Math.pow(p.y-ym,2); ssr+=Math.pow(p.y-(slope*p.x+intercept),2); }
  return {slope,intercept,r2:Math.max(0,sst>0?1-ssr/sst:0),n};
};

// ─── INDEXEDDB (local, sin red, sobrevive refresh) ────────────────────────────
const DB='gop_db', STORE='dispersion';
const idbOpen=()=>new Promise((res,rej)=>{ const o=indexedDB.open(DB,1);
  o.onupgradeneeded=()=>{ if(!o.result.objectStoreNames.contains(STORE)) o.result.createObjectStore(STORE); };
  o.onsuccess=()=>res(o.result); o.onerror=()=>rej(o.error); });
const idbSet=async(k,v)=>{ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>{db.close();res();}; tx.onerror=()=>rej(tx.error); }); };
const idbGet=async k=>{ const db=await idbOpen(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>{db.close();res(rq.result);}; rq.onerror=()=>rej(rq.error); }); };

// ─── CSV PARSER ───────────────────────────────────────────────────────────────
const parseCSV = text => {
  text=text.replace(/^\uFEFF/,'');
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split(/\r?\n/).map(r=>parseCSVRow(r,sep));
  if(rows.length<2) return [];
  const H=rows[0].map(h=>stripDiac(h.toUpperCase().trim()).replace(/\s+/g,'_').replace(/[.()]/g,''));
  const idx=(...ns)=>{ for(const n of ns){ const i=H.findIndex(h=>h===n); if(i>=0) return i; }
                       for(const n of ns){ const i=H.findIndex(h=>h.includes(n)); if(i>=0) return i; } return -1; };
  const I={ ano:idx('ANO'), mes:idx('MES_NATURAL','MES'),
    direccion:idx('DIRECCION'), division:idx('DIVISION'), seccion:idx('SECCION'),
    norma:idx('NORMA_DE_APROVISIONAMIENTO','NORMA'), goa:idx('GRUPO_ARTICULOS','GRUPO'),
    proveedor:idx('PROVEEDOR'), marca:idx('MARCA'), centro:idx('CENTRO'), tienda:idx('TIENDA'),
    venta:idx('VTAS_PESOS','VTAS','VENTAS'), prom:idx('PROM_INVENTARIO','PROM_INV'),
    invIni:idx('INVENTARIO_INICIAL','INV_INICIAL'), invFin:idx('INVENTARIO_FINAL','INV_FINAL'), ideal:idx('INVENTARIO_IDEAL','INV_IDEAL','IDEAL') };
  const g=(r,k)=>I[k]>=0?(r[I[k]]||'').trim():'';
  const gn=(r,k)=>I[k]>=0?num(r[I[k]]):0;
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    out.push({ ano:g(r,'ano'), mes:g(r,'mes'),
      direccion:g(r,'direccion')||'GENERAL', division:g(r,'division')||'GENERAL', seccion:g(r,'seccion')||'GENERAL',
      norma:g(r,'norma')||'SIN NORMA', goa:g(r,'goa')||'SIN GOA', proveedor:g(r,'proveedor')||'SIN PROV',
      marca:g(r,'marca')||'SIN MARCA', centro:g(r,'centro')||'', tienda:g(r,'tienda')||g(r,'centro')||'',
      venta:gn(r,'venta'), prom:gn(r,'prom'), invIni:gn(r,'invIni'), invFin:gn(r,'invFin'), ideal:gn(r,'ideal') }); }
  out._cols=Object.entries(I).filter(([,v])=>v>=0).map(([k])=>k);
  return out;
};

// ─── CONFIG ───────────────────────────────────────────────────────────────
const MEASURES=[{key:'venta',label:'Vtas. Pesos'},{key:'prom',label:'Prom Inventario'},{key:'invIni',label:'Inv. Inicial'},{key:'invFin',label:'Inv. Final'},{key:'ideal',label:'Inv. Ideal'}];
const LEVELS=[{key:'__row__',label:'Granular'},{key:'tienda',label:'Tienda'},{key:'centro',label:'Centro'},{key:'goa',label:'GOA'},{key:'marca',label:'Marca'},{key:'proveedor',label:'Proveedor'},{key:'seccion',label:'Sección'},{key:'division',label:'División'}];
const FILTER_DIMS=[{key:'division',label:'División'},{key:'seccion',label:'Sección'},{key:'marca',label:'Marca'},{key:'goa',label:'GOA'},{key:'proveedor',label:'Proveedor'},{key:'norma',label:'Norma'}];
const MAX_PLOT=3000, TABLE_RENDER=500;

// ═══════════════════════════════════════════════════════════════════════════
export default function ModuleDispersion(){
  const gState=useGlobal();
  const theme=gState?.theme||'light';
  const isDark=theme==='dark';

  const themes={
    dark:{
      appBg:'bg-transparent text-gray-100', card:'bg-zinc-900 border-zinc-800 shadow-lg',
      cardInner:'bg-zinc-950/80 border-zinc-800', textMain:'text-white', textMuted:'text-gray-400',
      accent:'text-violet-400', amber:'text-amber-400', border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-violet-500',
      btnGhost:'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      badge:'bg-violet-500/20 text-violet-300 border-violet-400/50 shadow-[0_0_12px_rgba(139,92,246,0.35)]',
      badgeAmber:'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.35)]',
      badgeGray:'bg-zinc-800/60 text-gray-400 border-zinc-600/40',
      thBg:'bg-violet-900/50 text-violet-200', rowAlt:'bg-zinc-900/50',
      kpiHero:'bg-gradient-to-br from-violet-600/30 to-violet-900/10 border-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.25)]',
      kpiAmber:'bg-gradient-to-br from-amber-500/20 to-amber-900/5 border-amber-500/40',
    },
    light:{
      appBg:'bg-transparent text-gray-800', card:'bg-white border-gray-200 shadow-sm',
      cardInner:'bg-gray-50 border-gray-200', textMain:'text-gray-900', textMuted:'text-gray-500',
      accent:'text-violet-600', amber:'text-amber-600', border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-violet-500',
      btnGhost:'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-violet-100 text-violet-700 border-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]',
      badgeAmber:'bg-amber-100 text-amber-700 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
      badgeGray:'bg-gray-100 text-gray-500 border-gray-200',
      thBg:'bg-violet-600 text-white', rowAlt:'bg-violet-50/40',
      kpiHero:'bg-gradient-to-br from-violet-500 to-violet-700 text-white border-violet-400 shadow-lg',
      kpiAmber:'bg-gradient-to-br from-amber-400 to-amber-500 text-white border-amber-300 shadow-md',
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
  const [hover,setHover]=useState(null);
  const [sortKey,setSortKey]=useState('venta');
  const [sortDir,setSortDir]=useState('desc');
  const [search,setSearch]=useState('');
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saveModal,setSaveModal]=useState(null); // {label, sug} cuando abierto

  useEffect(()=>{ (async()=>{
    try{ const d=await idbGet('data'); if(Array.isArray(d)&&d.length){ setData(d); setCols(d._cols||[]); } }catch{}
    try{ const h=await idbGet('history'); if(Array.isArray(h)) setHistory(h); }catch{}
    try{ const c=localStorage.getItem('gop_dispersion'); if(c){ const o=JSON.parse(c);
      o.xKey&&setXKey(o.xKey); o.yKey&&setYKey(o.yKey); o.level&&setLevel(o.level);
      o.excludeZeros!=null&&setExcludeZeros(o.excludeZeros); o.filters&&setFilters(o.filters); o.sortKey&&setSortKey(o.sortKey); o.sortDir&&setSortDir(o.sortDir); } }catch{}
    setLoading(false);
  })(); },[]);
  useEffect(()=>{ if(!loading) try{ localStorage.setItem('gop_dispersion',JSON.stringify({xKey,yKey,level,excludeZeros,filters,sortKey,sortDir})); }catch{} },[xKey,yKey,level,excludeZeros,filters,sortKey,sortDir,loading]);

  const handleUpload=e=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader();
    reader.onload=ev=>{ const rows=parseCSV(ev.target.result); setData(rows); setCols(rows._cols||[]); setFilters({}); idbSet('data',rows).catch(()=>{}); e.target.value=''; };
    reader.readAsText(file,'UTF-8'); };
  const clearData=()=>{ if(window.confirm('¿Borrar datos?')){ setData([]); setCols([]); idbSet('data',[]).catch(()=>{}); } };

  const opts=useMemo(()=>{ const o={};
    for(const d of FILTER_DIMS){ const rows=data.filter(r=>FILTER_DIMS.every(f=>f.key===d.key||!filters[f.key]||r[f.key]===filters[f.key]));
      const set=new Set(rows.map(r=>r[d.key]).filter(Boolean)); if(filters[d.key]) set.add(filters[d.key]); o[d.key]=[...set].sort(); }
    return o; },[data,filters]);
  const passFilters=r=>FILTER_DIMS.every(d=>!filters[d.key]||r[d.key]===filters[d.key]);

  const { points, reg, dropped, raw, xMin, xMax } = useMemo(()=>{
    let pairs=data.filter(passFilters).map(r=>({x:r[xKey],y:r[yKey],g:r[level]}));
    const before=pairs.length; if(excludeZeros) pairs=pairs.filter(p=>p.x!==0&&p.y!==0);
    const dropped=before-pairs.length;
    let pts; if(level==='__row__'){ pts=pairs.map(p=>({x:p.x,y:p.y,name:''})); }
    else { const m=new Map(); for(const p of pairs){ const k=p.g||'N/D'; const a=m.get(k)||{x:0,y:0,name:k}; a.x+=p.x; a.y+=p.y; m.set(k,a); } pts=[...m.values()]; }
    const [xMin,xMax]=minMax(pts.map(p=>p.x));
    return { points:pts, reg:linearRegression(pts), dropped, raw:pairs.length, xMin, xMax };
  },[data,filters,xKey,yKey,level,excludeZeros]);

  const plotPoints=useMemo(()=>{ if(points.length<=MAX_PLOT) return points;
    const step=Math.ceil(points.length/MAX_PLOT); return points.filter((_,i)=>i%step===0); },[points]);

  // R² jerárquico por nivel (respeta filtros activos)
  const r2ByLevel=useMemo(()=>{
    const dims=[{key:'direccion',label:'Dirección'},{key:'division',label:'División'},{key:'seccion',label:'Sección'},{key:'goa',label:'GOA'},{key:'marca',label:'Marca'},{key:'tienda',label:'Tienda'}];
    const filtered=data.filter(passFilters);
    return dims.map(d=>{
      const m=new Map();
      for(const r of filtered){ const k=r[d.key]||'N/D'; const a=m.get(k)||{x:0,y:0,name:k}; a.x+=r[xKey]||0; a.y+=r[yKey]||0; m.set(k,a); }
      let pts=[...m.values()]; if(excludeZeros) pts=pts.filter(p=>p.x!==0&&p.y!==0);
      return {...d, ...linearRegression(pts), nGroups:pts.length, value:filters[d.key]||null};
    });
  },[data,filters,xKey,yKey,excludeZeros]);

  const tableLevel=level==='__row__'?'tienda':level;
  const tableRows=useMemo(()=>{ const m=new Map();
    for(const r of data){ if(!passFilters(r)) continue; const k=r[tableLevel]||'N/D';
      const a=m.get(k)||{name:k,venta:0,prom:0,invIni:0,invFin:0,ideal:0,n:0};
      a.venta+=r.venta;a.prom+=r.prom;a.invIni+=r.invIni;a.invFin+=r.invFin;a.ideal+=r.ideal;a.n++; m.set(k,a); }
    let arr=[...m.values()].map(a=>({...a,dif:a.ideal-a.invFin}));
    if(search.trim()){ const q=search.toLowerCase(); arr=arr.filter(r=>r.name.toLowerCase().includes(q)); }
    arr.sort((x,y)=>{ const d=Math.abs(y[sortKey])-Math.abs(x[sortKey]); return sortDir==='desc'?d:-d; });
    return arr; },[data,filters,tableLevel,sortKey,sortDir,search]);
  const totals=useMemo(()=>tableRows.reduce((s,r)=>({venta:s.venta+r.venta,prom:s.prom+r.prom,invIni:s.invIni+r.invIni,invFin:s.invFin+r.invFin,ideal:s.ideal+r.ideal,dif:s.dif+r.dif}),{venta:0,prom:0,invIni:0,invFin:0,ideal:0,dif:0}),[tableRows]);

  // Snapshot mensual
  const openSaveModal=()=>{
    const anos=[...new Set(data.filter(passFilters).map(r=>r.ano).filter(Boolean))];
    const mess=[...new Set(data.filter(passFilters).map(r=>r.mes).filter(Boolean))];
    const sug=`${mess.join('/')} ${anos.join('/')}`.trim().toUpperCase()||new Date().toLocaleDateString('es-MX');
    setSaveModal({label:sug, anos, mess});
  };
  const confirmSave=()=>{
    const {label,anos,mess}=saveModal; if(!label.trim()){ setSaveModal(null); return; }
    const scope=FILTER_DIMS.filter(d=>filters[d.key]).map(d=>`${d.label}:${filters[d.key]}`).join(', ')||'Todo';
    const snap={ id:Date.now(), label:label.trim(), ts:Date.now(),
      ano:parseInt(anos[0])||0, mesNum:mesNum(mess[0]), scope, level,
      venta:totals.venta, prom:totals.prom, invFin:totals.invFin, ideal:totals.ideal, dif:totals.dif, r2:reg.r2 };
    const next=[...history.filter(h=>h.label!==snap.label), snap].sort((a,b)=>(a.ano-b.ano)||(a.mesNum-b.mesNum)||(a.ts-b.ts));
    setHistory(next); idbSet('history',next).catch(()=>{}); setSaveModal(null);
  };
  const delSnapshot=id=>{ const next=history.filter(h=>h.id!==id); setHistory(next); idbSet('history',next).catch(()=>{}); };
  const clearHistory=()=>{ if(window.confirm('¿Borrar histórico?')){ setHistory([]); idbSet('history',[]).catch(()=>{}); } };

  const gridC=isDark?'#27272a':'#ede9fe';
  const axisC=isDark?'#52525b':'#c4b5fd';
  const txtC=isDark?'#a1a1aa':'#6b7280';
  const xLabel=MEASURES.find(m=>m.key===xKey)?.label;
  const yLabel=MEASURES.find(m=>m.key===yKey)?.label;
  const r2=reg.r2;
  const r2Badge=r2>0.7?t.badge:r2>0.4?t.badgeAmber:t.badgeGray;
  const hasData=data.length>0;
  const SORTS=[{k:'venta',label:'Vta'},{k:'invFin',label:'Inv'},{k:'dif',label:'Dif'}];

  const heroText=isDark?'':'text-white';

  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>
      {/* HEADER */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark?'bg-violet-500/20':'bg-violet-100'}`}><Icons.BarChart2 size={22} className={t.accent}/></span>
              Dispersión
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>R² multinivel · Venta vs Inventario · histórico mensual</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {hasData&&<button onClick={openSaveModal} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.badge}`}><Icons.Save size={14}/> Guardar mes</button>}
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload}/>
            <button onClick={()=>fileRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}><Icons.Upload size={14}/> CSV Extracción</button>
            {hasData&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{data.length.toLocaleString()} filas</span>}
            {hasData&&<button onClick={clearData} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost} opacity-40 hover:opacity-100`}><Icons.Trash2 size={14}/></button>}
          </div>
        </div>
        {hasData&&cols.length>0&&<p className={`text-[9px] mt-3 ${t.textMuted}`}>Columnas detectadas: {cols.join(' · ')}</p>}
      </div>

      {!hasData?(
        <div className={`p-12 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
          <Icons.Upload size={36} className="text-gray-400 mb-3"/>
          <p className={`text-sm font-bold ${t.textMain}`}>Carga tu CSV de extracción</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>La data se guarda localmente (IndexedDB) y sobrevive al refresh.</p>
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
          {/* FILTROS cascada */}
          <div className={`flex flex-wrap gap-2 p-3 rounded-xl border ${t.cardInner}`}>
            {FILTER_DIMS.map(d=>(
              <select key={d.key} value={filters[d.key]||''} onChange={e=>setFilters(f=>({...f,[d.key]:e.target.value}))} className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                <option value="">{d.label}: Todos ({opts[d.key]?.length||0})</option>
                {opts[d.key]?.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            ))}
            {Object.values(filters).some(Boolean)&&<button onClick={()=>setFilters({})} className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>✕ Limpiar</button>}
          </div>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className={`p-3 rounded-xl border text-center ${t.kpiHero}`}>
              <div className={`text-[9px] font-black uppercase tracking-widest ${isDark?'text-violet-300':heroText} opacity-80 mb-0.5`}>R²</div>
              <div className={`text-2xl font-black ${isDark?'text-violet-200':heroText}`}>{fmt(r2,3)}</div>
            </div>
            {[{label:'Puntos (n)',val:fmt(points.length),sub:`${fmt(raw)} filas en scope`},
              {label:'Pendiente',val:fmt(reg.slope,4)},
              {label:'Excluidas (0)',val:excludeZeros?fmt(dropped):'—'}].map(({label,val,sub})=>(
              <div key={label} className={`p-3 rounded-xl border text-center ${t.cardInner}`}>
                <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-0.5`}>{label}</div>
                <div className={`text-xl font-black ${t.accent}`}>{val}</div>
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
            {points.length<2?(<p className={`text-xs ${t.textMuted} py-8 text-center`}>Se necesitan ≥2 puntos. Ajusta filtros o nivel.</p>):(
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{top:10,right:20,left:0,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                  <XAxis dataKey="x" name={xLabel} type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} domain={['dataMin','dataMax']} tickFormatter={v=>Math.abs(v)>=1000?(v/1000).toFixed(0)+'k':fmt(v)} label={{value:xLabel,position:'insideBottom',offset:-10,fontSize:10,fill:txtC}}/>
                  <YAxis dataKey="y" name={yLabel} type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>Math.abs(v)>=1000?(v/1000).toFixed(0)+'k':fmt(v)} label={{value:yLabel,angle:-90,position:'insideLeft',fontSize:10,fill:txtC}}/>
                  <Tooltip cursor={{strokeDasharray:'3 3'}} content={({active,payload})=>{ if(!active||!payload?.length) return null; const d=payload[0]?.payload;
                    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>{d?.name&&<p className={`font-bold mb-1 ${t.textMain}`}>{d.name}</p>}<p className="text-gray-400">{xLabel}: {fmt(d?.x,1)}</p><p className={t.accent}>{yLabel}: {fmt(d?.y,1)}</p></div>; }}/>
                  <Scatter data={plotPoints} shape={(p)=>{ const on=p.payload?.name&&p.payload.name===hover;
                    return <circle cx={p.cx} cy={p.cy} r={on?7:4} fill={on?'#fbbf24':'#9ca3af'} fillOpacity={on?1:0.6} stroke={on?'#f59e0b':'none'} strokeWidth={on?2:0} style={{filter:on?'drop-shadow(0 0 6px #fbbf24)':'none',cursor:'pointer'}} onMouseEnter={()=>p.payload?.name&&setHover(p.payload.name)} onMouseLeave={()=>setHover(null)}/>; }}/>
                  {reg.n>=2&&<Scatter data={[{x:xMin,y:reg.slope*xMin+reg.intercept},{x:xMax,y:reg.slope*xMax+reg.intercept}]} fill="none" line={{stroke:'#8b5cf6',strokeWidth:2.5}} shape={()=>null} legendType="none"/>}
                </ScatterChart>
              </ResponsiveContainer>
            )}
            <p className={`text-[9px] mt-2 ${t.textMuted}`}>Granular muestrea hasta {MAX_PLOT.toLocaleString()} puntos para dibujar (R² se calcula sobre todas). Agregar suma combinaciones por grupo, como tabla dinámica.</p>
          </div>
          {/* TABLA */}
          <div className={`p-4 rounded-xl border ${t.cardInner}`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className={`text-sm font-bold ${t.textMain}`}>Detalle por {LEVELS.find(l=>l.key===tableLevel)?.label} <span className={`text-[10px] font-normal ${t.textMuted}`}>· {tableRows.length.toLocaleString()} grupos</span></h4>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Icons.Search size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${t.textMuted}`}/>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar tienda/centro" className={`text-xs pl-7 pr-2 py-1.5 rounded-lg border w-40 ${t.input} focus:outline-none focus:ring-1`}/>
                </div>
                <span className={`text-[9px] font-black uppercase ${t.textMuted}`}>Ordenar:</span>
                {SORTS.map(s=><button key={s.k} onClick={()=>{ if(sortKey===s.k) setSortDir(d=>d==='desc'?'asc':'desc'); else { setSortKey(s.k); setSortDir('desc'); } }} className={`text-[10px] px-2.5 py-1 rounded-full border font-black ${sortKey===s.k?t.badge:t.btnGhost}`}>{s.label}{sortKey===s.k?(sortDir==='desc'?' ↓':' ↑'):''}</button>)}
              </div>
            </div>
            <div className="overflow-auto rounded-lg" style={{maxHeight:320}}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10"><tr className={`${t.thBg}`}>
                  {[LEVELS.find(l=>l.key===tableLevel)?.label,'Vtas $','Prom Inv','Inv Inicial','Inv Final','Inv Ideal','Diferencia'].map((h,i)=><th key={i} className={`px-3 py-2 font-black uppercase tracking-wide text-[9px] ${i===0?'text-left':'text-right'}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {tableRows.slice(0,TABLE_RENDER).map((r,i)=>(
                    <tr key={r.name} onMouseEnter={()=>setHover(r.name)} onMouseLeave={()=>setHover(null)} className={`${i%2?t.rowAlt:''} ${hover===r.name?(isDark?'!bg-amber-500/10':'!bg-amber-50'):''} border-b ${t.border} cursor-pointer transition-colors`}>
                      <td className={`px-3 py-1.5 font-bold ${t.textMain} truncate max-w-[160px]`}>{r.name}</td>
                      <td className={`px-3 py-1.5 text-right ${t.accent} font-bold`}>{fmt(r.venta)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.prom)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.invIni)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.invFin)}</td>
                      <td className={`px-3 py-1.5 text-right ${t.textMuted}`}>{fmt(r.ideal)}</td>
                      <td className={`px-3 py-1.5 text-right font-bold ${r.dif>=0?t.amber:t.accent}`}>{fmt(r.dif)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0"><tr className={`${isDark?'bg-zinc-900':'bg-white'} border-t-2 ${t.border} font-black ${t.textMain}`}>
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
            {tableRows.length>TABLE_RENDER&&<p className={`text-[9px] mt-2 ${t.textMuted}`}>Mostrando {TABLE_RENDER} de {tableRows.length.toLocaleString()} (usa buscar/ordenar para acotar).</p>}
          </div>
{/* HISTÓRICO + R² JERÁRQUICO */}
          <div className={`grid grid-cols-1 ${history.length>0?'lg:grid-cols-2':''} gap-4`}>
            {history.length>0&&(
              <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h4 className={`text-sm font-bold ${t.textMain}`}>📈 Histórico mensual <span className={`text-[10px] font-normal ${t.textMuted}`}>· {history.length} meses</span></h4>
                  <button onClick={clearHistory} className={`text-[10px] px-2.5 py-1 rounded-full border font-black ${t.btnGhost}`}>Limpiar histórico</button>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={history} margin={{top:5,right:10,left:0,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                    <XAxis dataKey="label" tick={{fontSize:9,fill:txtC}} stroke={axisC}/>
                    <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>Math.abs(v)>=1000?(v/1000).toFixed(0)+'k':fmt(v)}/>
                    <Tooltip content={({active,payload,label})=>{ if(!active||!payload?.length) return null; const d=payload[0]?.payload;
                      return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{label}</p><p className={t.accent}>Prom Inv: {fmt(d.prom)}</p><p className={t.amber}>Diferencia: {fmt(d.dif)}</p><p className={t.textMuted}>R²: {fmt(d.r2,3)} · {d.scope}</p></div>; }}/>
                    <Legend wrapperStyle={{fontSize:10}}/>
                    <Line type="monotone" dataKey="prom" name="Prom Inventario" stroke="#8b5cf6" strokeWidth={2.5} dot={{r:3,fill:'#8b5cf6'}}/>
                    <Line type="monotone" dataKey="dif" name="Diferencia" stroke="#f59e0b" strokeWidth={2.5} dot={{r:3,fill:'#f59e0b'}}/>
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-3">
                  {history.map((h,i)=>{ const prev=history[i-1]; const dPct=prev&&prev.prom?((h.prom-prev.prom)/Math.abs(prev.prom))*100:null;
                    return (
                    <span key={h.id} className={`flex items-center gap-2 text-[10px] px-2.5 py-1 rounded-full border ${t.badgeGray}`}>
                      <b className={t.textMain}>{h.label}</b>
                      <span className={t.textMuted}>R² {fmt(h.r2,2)}</span>
                      {dPct!=null&&<span className={`font-black ${dPct<=0?'text-emerald-400':'text-red-400'}`}>{dPct<=0?'▼':'▲'}{Math.abs(dPct).toFixed(1)}%</span>}
                      <button onClick={()=>delSnapshot(h.id)} className="opacity-50 hover:opacity-100">✕</button>
                    </span>
                  ); })}
                </div>
                <p className={`text-[9px] mt-2 ${t.textMuted}`}>Cada punto = una "foto" guardada con "Guardar mes". El % chip es Δ Prom Inv vs mes anterior: ▼ verde = baja inventario, ▲ rojo = sube.</p>
              </div>
            )}
            {/* R² JERÁRQUICO */}
            <div className={`p-4 rounded-xl border ${t.cardInner}`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className={`text-sm font-bold ${t.textMain}`}>🎯 R² por nivel jerárquico <span className={`text-[10px] font-normal ${t.textMuted}`}>· {xLabel} vs {yLabel}</span></h4>
              </div>
              <div className="space-y-2">
                {r2ByLevel.map(lv=>{
                  const valid=lv.n>=2;
                  const badge=!valid?t.badgeGray:lv.r2>0.7?t.badge:lv.r2>0.4?t.badgeAmber:t.badgeGray;
                  const barW=Math.min(100,Math.round(lv.r2*100));
                  const barColor=lv.r2>0.7?'#10b981':lv.r2>0.4?'#f59e0b':'#71717a';
                  return (
                    <div key={lv.key} className={`p-2.5 rounded-lg border ${t.border} ${lv.value?(isDark?'bg-violet-500/5':'bg-violet-50/50'):''}`}>
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${t.textMain}`}>{lv.label}</span>
                          {lv.value&&<span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${t.badge} truncate max-w-[140px]`}>{lv.value}</span>}
                          <span className={`text-[9px] ${t.textMuted}`}>{lv.nGroups} {lv.nGroups===1?'grupo':'grupos'}</span>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${badge}`}>R² {valid?lv.r2.toFixed(3):'—'}</span>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark?'bg-zinc-800':'bg-gray-200'}`}>
                        <div className="h-full rounded-full transition-all" style={{width:`${valid?barW:0}%`,background:barColor}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className={`text-[9px] mt-3 ${t.textMuted}`}>R² calculada agregando los datos del scope a cada nivel. Niveles con &lt;2 grupos (filtro fijo o nivel único) no son calculables.</p>
            </div>
          </div>
          )}
      {/* MODAL GUARDAR MES */}
      {saveModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:isDark?'rgba(9,9,11,0.6)':'rgba(255,255,255,0.5)',backdropFilter:'blur(6px)'}} onClick={()=>setSaveModal(null)}>
          <div onClick={e=>e.stopPropagation()} className={`w-full max-w-sm p-5 rounded-2xl border ${t.card} ${isDark?'shadow-[0_0_40px_rgba(139,92,246,0.3)]':'shadow-2xl'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`p-1.5 rounded-lg ${isDark?'bg-violet-500/20':'bg-violet-100'}`}><Icons.Save size={16} className={t.accent}/></span>
              <h3 className={`text-sm font-black ${t.textMain}`}>Guardar mes</h3>
            </div>
            <p className={`text-[10px] mb-3 ${t.textMuted}`}>Foto del scope actual: {FILTER_DIMS.filter(d=>filters[d.key]).map(d=>filters[d.key]).join(' · ')||'Todo'} · nivel {LEVELS.find(l=>l.key===level)?.label}</p>
            <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>Etiqueta del mes</label>
            <input autoFocus value={saveModal.label} onChange={e=>setSaveModal(m=>({...m,label:e.target.value}))} onKeyDown={e=>{ if(e.key==='Enter') confirmSave(); if(e.key==='Escape') setSaveModal(null); }}
              placeholder="ej. MAYO 2026" className={`w-full mt-1 text-sm px-3 py-2 rounded-lg border ${t.input} focus:outline-none focus:ring-2`}/>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {[{label:'Vtas',v:totals.venta},{label:'Prom Inv',v:totals.prom},{label:'Diferencia',v:totals.dif},{label:'R²',v:reg.r2,d:3}].map(x=>(
                <div key={x.label} className={`px-3 py-2 rounded-lg ${t.cardInner} border text-center`}>
                  <div className={`text-[8px] font-black uppercase ${t.textMuted}`}>{x.label}</div>
                  <div className={`text-sm font-black ${t.accent}`}>{fmt(x.v,x.d||0)}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>setSaveModal(null)} className={`text-xs px-4 py-2 rounded-lg border font-bold ${t.btnGhost}`}>Cancelar</button>
              <button onClick={confirmSave} className={`text-xs px-4 py-2 rounded-lg border font-bold ${t.badge}`}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html:`@keyframes fadeInUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}.animate-fade-in-up{animation:fadeInUp 0.4s ease-out forwards;}`}}/>
       </div>
  );
}
const Ctrl=({label,t,children})=>(<div><div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-1`}>{label}</div>{children}</div>);

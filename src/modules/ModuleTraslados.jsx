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

// ─── CSV PARSER (layout de extracción) ───────────────────────────────────────

const parseCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep));
  if(rows.length<2) return [];
  const H=rows[0].map(h=>h.toUpperCase().trim()
    .replace(/[ÁÉÍÓÚ]/g,c=>({Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U'}[c]))
    .replace(/\s+/g,'_').replace(/[.()]/g,''));
  const idx=(...ns)=>{ for(const n of ns){ const i=H.findIndex(h=>h===n||h.includes(n)); if(i>=0) return i; } return -1; };
  const I={
    direccion:idx('DIRECCION'), division:idx('DIVISION','DIV'), seccion:idx('SECCION'),
    norma:idx('NORMA'), goa:idx('GRUPO_ARTICULOS','GRUPO','GOA'), proveedor:idx('PROVEEDOR'),
    marca:idx('MARCA'), centro:idx('CENTRO'), tienda:idx('TIENDA'),
    venta:idx('VTAS_PESOS','VTAS','VENTAS'), prom:idx('PROM_INVENTARIO','PROM_INV'),
    invIni:idx('INVENTARIO_INICIAL'), invFin:idx('INVENTARIO_FINAL'), ideal:idx('INVENTARIO_IDEAL','IDEAL'),
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
  return out;
};

// ─── CONFIG ───────────────────────────────────────────────────────────────

const MEASURES=[
  {key:'venta',  label:'Vtas. Pesos'},
  {key:'prom',   label:'Prom Inventario'},
  {key:'invIni', label:'Inv. Inicial'},
  {key:'invFin', label:'Inv. Final'},
  {key:'ideal',  label:'Inv. Ideal'},
];
// Nivel de agregación: cada punto del scatter = una de estas dimensiones (o cada fila)
const LEVELS=[
  {key:'__row__', label:'Granular'},
  {key:'tienda',  label:'Tienda'},
  {key:'centro',  label:'Centro'},
  {key:'goa',     label:'GOA'},
  {key:'marca',   label:'Marca'},
  {key:'proveedor',label:'Proveedor'},
  {key:'seccion', label:'Sección'},
  {key:'division',label:'División'},
];
const FILTER_DIMS=[
  {key:'division', label:'División'},
  {key:'seccion',  label:'Sección'},
  {key:'marca',    label:'Marca'},
  {key:'goa',      label:'GOA'},
  {key:'proveedor',label:'Proveedor'},
  {key:'norma',    label:'Norma'},
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
      textAccent1:'text-emerald-400',border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-emerald-500',
      btnGhost:'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      badge:'bg-emerald-900/30 text-emerald-400 border-emerald-500/40',
      badgeAmber:'bg-amber-900/30 text-amber-400 border-amber-500/40',
      badgeRed:'bg-red-900/30 text-red-400 border-red-500/40',
    },
    light:{
      appBg:'bg-transparent text-gray-800',card:'bg-white border-gray-200 shadow-sm',
      cardInner:'bg-gray-50 border-gray-200',textMain:'text-gray-900',textMuted:'text-gray-500',
      textAccent1:'text-emerald-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-emerald-500',
      btnGhost:'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-emerald-50 text-emerald-700 border-emerald-200',
      badgeAmber:'bg-amber-50 text-amber-700 border-amber-200',
      badgeRed:'bg-red-50 text-red-700 border-red-200',
    },
  };
  const t=themes[theme]||themes.light;

  const fileRef=useRef(null);
  const [data,setData]=useState([]);
  const [xKey,setXKey]=useState('venta');
  const [yKey,setYKey]=useState('prom');
  const [level,setLevel]=useState('tienda');
  const [excludeZeros,setExcludeZeros]=useState(false);
  const [filters,setFilters]=useState({});

  // Persistir SOLO config (no la data: la extracción es enorme y revienta localStorage)
  useEffect(()=>{ try{ const s=localStorage.getItem('gop_dispersion'); if(s){ const d=JSON.parse(s);
    d.xKey&&setXKey(d.xKey); d.yKey&&setYKey(d.yKey); d.level&&setLevel(d.level);
    d.excludeZeros!=null&&setExcludeZeros(d.excludeZeros); d.filters&&setFilters(d.filters); } }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem('gop_dispersion',JSON.stringify({xKey,yKey,level,excludeZeros,filters})); }catch{} },[xKey,yKey,level,excludeZeros,filters]);

  const handleUpload=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ setData(parseCSV(ev.target.result)); e.target.value=''; };
    reader.readAsText(file,'UTF-8');
  };

  const opts=useMemo(()=>{
    const o={}; for(const d of FILTER_DIMS){ o[d.key]=[...new Set(data.map(r=>r[d.key]).filter(Boolean))].sort(); }
    return o;
  },[data]);

  // PIPELINE: filtrar → (excluir 0) → agregar al nivel (suma X y Y por grupo) → puntos
  const { points, reg, dropped, raw } = useMemo(()=>{
    let rows=data.filter(r=>FILTER_DIMS.every(d=>!filters[d.key]||r[d.key]===filters[d.key]));
    let pairs=rows.map(r=>({x:r[xKey],y:r[yKey],g:r[level]}));
    const before=pairs.length;
    if(excludeZeros) pairs=pairs.filter(p=>p.x!==0&&p.y!==0);
    const dropped=before-pairs.length;

    let pts;
    if(level==='__row__'){ pts=pairs.map(p=>({x:p.x,y:p.y,name:''})); }
    else {
      const m=new Map();
      for(const p of pairs){ const k=p.g||'N/D'; const a=m.get(k)||{x:0,y:0,name:k}; a.x+=p.x; a.y+=p.y; m.set(k,a); }
      pts=[...m.values()];
    }
    return { points:pts, reg:linearRegression(pts), dropped, raw:pairs.length };
  },[data,filters,xKey,yKey,level,excludeZeros]);

  // Chart colors
  const gridC=isDark?'#27272a':'#f0f0f0';
  const axisC=isDark?'#52525b':'#d1d5db';
  const txtC=isDark?'#a1a1aa':'#6b7280';

  const xLabel=MEASURES.find(m=>m.key===xKey)?.label;
  const yLabel=MEASURES.find(m=>m.key===yKey)?.label;
  const r2=reg.r2;
  const r2Badge=r2>0.7?t.badge:r2>0.4?t.badgeAmber:t.badgeRed;

  const hasData=data.length>0;

  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>

      {/* HEADER */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark?'bg-emerald-500/20':'bg-emerald-50'}`}>
                <Icons.BarChart2 size={22} className={t.textAccent1}/>
              </span>
              Dispersión
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>
              R² multinivel · Venta vs Inventario · agrega como tabla dinámica según el nivel
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload}/>
            <button onClick={()=>fileRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14}/> CSV Extracción
            </button>
            {hasData&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{data.length.toLocaleString()} filas</span>}
            {hasData&&(
              <button onClick={()=>{if(window.confirm('¿Borrar datos?')){setData([]);}}}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost} opacity-40 hover:opacity-100`}>
                <Icons.Trash2 size={14}/>
              </button>
            )}
          </div>
        </div>
      </div>

      {!hasData?(
        <div className={`p-12 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
          <Icons.Upload size={36} className="text-gray-400 mb-3"/>
          <p className={`text-sm font-bold ${t.textMain}`}>Carga tu CSV de extracción</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Layout: División, Sección, Marca, Grupo Artículos, Proveedor, Centro, Tienda, Vtas. Pesos, Prom Inventario…</p>
        </div>
      ):(
        <div className="space-y-4">

          {/* CONTROLES */}
          <div className={`flex flex-wrap items-end gap-3 p-3 rounded-xl border ${t.cardInner}`}>
            <Ctrl label="Eje X" t={t}>
              <select value={xKey} onChange={e=>setXKey(e.target.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                {MEASURES.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Ctrl>
            <Ctrl label="Eje Y" t={t}>
              <select value={yKey} onChange={e=>setYKey(e.target.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                {MEASURES.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Ctrl>
            <Ctrl label="Excluir ceros" t={t}>
              <button onClick={()=>setExcludeZeros(v=>!v)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${excludeZeros?t.badge:t.btnGhost}`}>
                {excludeZeros?'Sí':'No'}
              </button>
            </Ctrl>
          </div>

          {/* NIVEL DE AGREGACIÓN */}
          <div className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border ${t.cardInner}`}>
            <span className={`text-[10px] font-black uppercase tracking-widest ${t.textMuted} mr-1`}>
              <Icons.BarChart2 size={11} className="inline mr-1"/>Nivel (cada punto =)
            </span>
            {LEVELS.map(l=>(
              <button key={l.key} onClick={()=>setLevel(l.key)}
                className={`text-[10px] px-3 py-1 rounded-full border font-black transition-all ${level===l.key?t.badge:t.btnGhost}`}>
                {l.label}
              </button>
            ))}
          </div>

          {/* FILTROS */}
          <div className={`flex flex-wrap gap-2 p-3 rounded-xl border ${t.cardInner}`}>
            {FILTER_DIMS.map(d=>(
              <select key={d.key} value={filters[d.key]||''} onChange={e=>setFilters(f=>({...f,[d.key]:e.target.value}))}
                className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                <option value="">{d.label}: Todos</option>
                {opts[d.key]?.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            ))}
            {Object.values(filters).some(Boolean)&&(
              <button onClick={()=>setFilters({})} className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>✕ Limpiar</button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              {label:'R²',val:fmt(r2,3),color:r2>0.7?'text-emerald-400':r2>0.4?'text-amber-400':'text-red-400'},
              {label:'Puntos (n)',val:fmt(points.length),color:t.textAccent1,sub:`${fmt(raw)} filas en scope`},
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
              <h4 className={`text-sm font-bold ${t.textMain}`}>🔵 {xLabel} vs {yLabel} · por {LEVELS.find(l=>l.key===level)?.label}</h4>
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
                    if(!active||!payload?.length) return null;
                    const d=payload[0]?.payload;
                    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>
                      {d?.name&&<p className={`font-bold mb-1 ${t.textMain}`}>{d.name}</p>}
                      <p className="text-emerald-400">{xLabel}: {fmt(d?.x,1)}</p>
                      <p className="text-teal-400">{yLabel}: {fmt(d?.y,1)}</p>
                    </div>;
                  }}/>
                  <Scatter data={points} fill="#10b981" fillOpacity={0.6}/>
                  {reg.n>=2&&(()=>{
                    const xs=points.map(d=>d.x); const xMin=Math.min(...xs), xMax=Math.max(...xs);
                    return <Scatter data={[{x:xMin,y:reg.slope*xMin+reg.intercept},{x:xMax,y:reg.slope*xMax+reg.intercept}]}
                      fill="none" line={{stroke:'#f59e0b',strokeWidth:2,strokeDasharray:'6 3'}} shape={()=>null} legendType="none"/>;
                  })()}
                </ScatterChart>
              </ResponsiveContainer>
            )}
            <p className={`text-[9px] mt-2 ${t.textMuted}`}>
              Granular = cada fila es un punto (ajuste fino, R² baja). Agregar por Tienda/Sección/División suma las combinaciones
              dentro de cada grupo (como tabla dinámica) → menos puntos, R² más alta. Filtros se aplican antes de agregar.
            </p>
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

// ─── MINI ───────────────────────────────────────────────────────────────────
const Ctrl=({label,t,children})=>(
  <div>
    <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-1`}>{label}</div>
    {children}
  </div>
);

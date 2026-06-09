import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Icons from '../utils/icons';
import { useGlobal } from '../context/GlobalContext';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── HELPERS ────────────────────────────────────────────────────────────────
const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`)).map(c => c.replace(/^"|"$/g, '').trim());
const num  = v  => parseFloat(String(v||'0').replace(/[^0-9.-]+/g,''))||0;
const fmt  = (n,d=0) => n==null?'-':n.toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtP = (n,d=1) => n==null?'-':n.toFixed(d)+'%';
const fmtM = (n)     => n==null?'-':'$'+n.toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0});
const delta = (curr,prev) => prev&&prev!==0?((curr-prev)/Math.abs(prev))*100:null;
const isoOf = d => d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : d;
const mdOf  = d => `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

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
const fmtDate = d => d?d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}):'';

const linearRegression = pts => {
  const n=pts.length; if(n<2) return {slope:0,intercept:0,r2:0};
  const sx=pts.reduce((s,p)=>s+p.x,0), sy=pts.reduce((s,p)=>s+p.y,0);
  const sxy=pts.reduce((s,p)=>s+p.x*p.y,0), sx2=pts.reduce((s,p)=>s+p.x*p.x,0);
  const slope=(n*sxy-sx*sy)/(n*sx2-sx*sx)||0, intercept=(sy-slope*sx)/n, ym=sy/n;
  const sst=pts.reduce((s,p)=>s+Math.pow(p.y-ym,2),0);
  const ssr=pts.reduce((s,p)=>s+Math.pow(p.y-(slope*p.x+intercept),2),0);
  return {slope,intercept,r2:Math.max(0,sst>0?1-ssr/sst:0)};
};

// ── Festivos MX (clave retail, ene–may) matcheados por mes-día ──
const HOLIDAYS = [
  {md:'01-01',name:'Año Nuevo'}, {md:'01-06',name:'Día de Reyes'},
  {md:'02-05',name:'Constitución'}, {md:'02-14',name:'San Valentín'},
  {md:'03-21',name:'Benito Juárez'}, {md:'05-01',name:'Día del Trabajo'},
  {md:'05-05',name:'Cinco de Mayo'}, {md:'05-10',name:'Día de las Madres'},
  {md:'05-15',name:'Día del Maestro'},
];
const holidayName = d => HOLIDAYS.find(h=>h.md===mdOf(d))?.name || null;
const isWeekend = d => d.getDay()===0||d.getDay()===6;
const dayType = d => holidayName(d)?'festivo':isWeekend(d)?'finde':'normal';

// ─── MINI COMPONENTS ────────────────────────────────────────────────────────
const DeltaBadge = ({value}) => {
  if(value==null) return <span className="text-gray-400 text-[10px]">N/D</span>;
  const pos=value>=0;
  return <span className={`text-[10px] font-black ${pos?'text-emerald-400':'text-red-400'}`}>{pos?'▲':'▼'} {Math.abs(value).toFixed(1)}%</span>;
};
const MiniBar = ({value,max,color='bg-emerald-500',isDark}) => (
  <div className={`w-full h-1.5 rounded-full ${isDark?'bg-zinc-700/40':'bg-gray-200'} overflow-hidden`}>
    <div className={`h-1.5 rounded-full ${color} transition-all duration-500`} style={{width:`${Math.min(100,max>0?(value/max)*100:0)}%`}}/>
  </div>
);
const EmptyState = ({icon:Icon,title,sub,t}) => (
  <div className={`p-12 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
    {Icon&&<Icon size={36} className="text-gray-400 mb-3"/>}
    <p className={`text-sm font-bold ${t.textMain}`}>{title}</p>
    <p className={`text-xs mt-1 ${t.textMuted}`}>{sub}</p>
  </div>
);

// ─── DATE RANGE PICKER (con fallback de iconos) ──────────────────────────────
const ChevL = Icons.ChevronLeft  || (p=><span {...p}>‹</span>);
const ChevR = Icons.ChevronRight || (p=><span {...p}>›</span>);
const CalIcon = Icons.Calendar || (p=><span {...p}>📅</span>);

const DateRangePicker = ({from,to,onChange,t,isDark}) => {
  const [open,setOpen]=useState(false);
  const [hov,setHov]=useState(null);
  const [selStart,setSelStart]=useState(null);
  const [view,setView]=useState(()=>{ const d=from?new Date(from):new Date(); return {year:d.getFullYear(),month:d.getMonth()}; });
  const ref=useRef(null);
  useEffect(()=>{ const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[]);
  const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const DOW=['L','M','M','J','V','S','D'];
  const getDays=(y,m)=>{ const first=new Date(y,m,1).getDay(); return {adj:(first+6)%7,days:new Date(y,m+1,0).getDate()}; };
  const handleDay=iso=>{ if(!selStart){ setSelStart(iso); onChange({from:iso,to:iso}); }
    else { const [a,b]=[selStart,iso].sort(); onChange({from:a,to:b}); setSelStart(null); setOpen(false); } };
  const inRange=iso=>{ const e=selStart&&hov?[selStart,hov].sort():[from,to].sort(); return e[0]&&iso>=e[0]&&iso<=e[1]; };
  const renderMonth=(y,m)=>{ const {adj,days}=getDays(y,m); const cells=[];
    for(let i=0;i<adj;i++) cells.push(<div key={`e${i}`}/>);
    for(let d=1;d<=days;d++){ const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const ep=iso===from||iso===to, inR=inRange(iso);
      cells.push(<button key={iso} onMouseEnter={()=>selStart&&setHov(iso)} onClick={()=>handleDay(iso)}
        className={`text-[11px] h-7 w-7 rounded-full flex items-center justify-center transition-all font-medium ${ep?'bg-emerald-500 text-white font-black':inR?(isDark?'bg-emerald-900/40 text-emerald-300':'bg-emerald-100 text-emerald-700'):(isDark?'text-gray-300 hover:bg-zinc-700':'text-gray-700 hover:bg-gray-100')}`}>{d}</button>);
    } return cells; };
  const prevM=()=>setView(v=>v.month===0?{year:v.year-1,month:11}:{...v,month:v.month-1});
  const nextM=()=>setView(v=>v.month===11?{year:v.year+1,month:0}:{...v,month:v.month+1});
  const vN={year:view.month===11?view.year+1:view.year,month:view.month===11?0:view.month+1};
  const label=()=>{ if(!from&&!to) return 'Todas las fechas'; if(from===to) return fmtDate(new Date(from)); return `${from?fmtDate(new Date(from)):'...'} → ${to?fmtDate(new Date(to)):'...'}`; };
  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(v=>!v)} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all ${t.btnGhost}`}>
        <CalIcon size={13}/> {label()}
      </button>
      {open&&(
        <div className={`absolute top-full left-0 mt-2 z-50 rounded-2xl border shadow-2xl p-4 ${isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`} style={{minWidth:560}}>
          <div className="flex gap-6">
            {[{y:view.year,m:view.month},{y:vN.year,m:vN.month}].map(({y,m},idx)=>(
              <div key={idx} className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  {idx===0?<button onClick={prevM} className={`p-1 rounded-lg ${isDark?'hover:bg-zinc-700':'hover:bg-gray-100'}`}><ChevL size={14}/></button>:<div/>}
                  <span className={`text-xs font-black ${t.textMain}`}>{MONTHS[m]} {y}</span>
                  {idx===1?<button onClick={nextM} className={`p-1 rounded-lg ${isDark?'hover:bg-zinc-700':'hover:bg-gray-100'}`}><ChevR size={14}/></button>:<div/>}
                </div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">{DOW.map((d,i)=><div key={i} className={`text-[9px] font-black text-center ${t.textMuted}`}>{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-0.5">{renderMonth(y,m)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-700/30">
            <button onClick={()=>{onChange({from:'',to:''});setSelStart(null);setOpen(false);}} className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>Limpiar</button>
            <button onClick={()=>setOpen(false)} className={`text-xs px-3 py-1.5 rounded-lg font-bold ${t.btnPrimary}`}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PARSERS ─────────────────────────────────────────────────────────────────
const parseSalesCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep));
  if(rows.length<2) return [];
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_').replace(/[#ÁÉÍÓÚ]/g,c=>({'#':'NUM',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U'}[c]||c)));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const I={div:idx('DIVISION','DIV'),sec:idx('SECCION','SECTION'),numSec:idx('NUM_SECCION','_SECCION'),goa:idx('GOA','FAMILIA'),
    marca:idx('MARCA','PROVEEDOR','BRAND'),norma:idx('NORMA','TIPO_COMPRA'),canal:idx('CANAL','CHANNEL'),
    pago:idx('TIPO_PAGO','PAGO','PAYMENT'),fecha:idx('FECHA','DATE','DIA'),vp:idx('VENTA_','VENTA$','VENTA_PESOS','VENTAS'),
    vu:idx('VENTA_U','UNIDADES','PIEZAS'),mg:idx('MG','MARGEN'),util:idx('UTILIDAD','UTIL'),md:idx('MARKDOWN','DESCUENTO','MD')};
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    const fecha=I.fecha>=0?parseDate(r[I.fecha]):null; const vp=num(I.vp>=0?r[I.vp]:0);
    if(!vp&&!fecha) continue;
    out.push({ division:I.div>=0?r[I.div].trim().toUpperCase():'GENERAL', seccion:I.sec>=0?r[I.sec].trim().toUpperCase():'GENERAL',
      numSec:I.numSec>=0?r[I.numSec].trim():'', goa:I.goa>=0?r[I.goa].trim().toUpperCase():'', marca:I.marca>=0?r[I.marca].trim().toUpperCase():'SIN MARCA',
      norma:I.norma>=0?r[I.norma].trim().toUpperCase():'', canal:I.canal>=0?r[I.canal].trim().toUpperCase():'SIN CANAL',
      pago:I.pago>=0?r[I.pago].trim().toUpperCase():'', fecha, year:fecha?fecha.getFullYear():0,
      ventaP:vp, ventaU:num(I.vu>=0?r[I.vu]:0), mg:num(I.mg>=0?r[I.mg]:0), utilidad:num(I.util>=0?r[I.util]:0), markdown:num(I.md>=0?r[I.md]:0) });
  }
  return out;
};
const parseInvCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep)); if(rows.length<2) return [];
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_'));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const I={div:idx('DIVISION','DIV'),sec:idx('SECCION'),goa:idx('GOA','FAMILIA'),marca:idx('MARCA','PROVEEDOR'),norma:idx('NORMA','TIPO_COMPRA'),
    ubic:idx('UBICACION','CENTRO','TIENDA','BODEGA'),tipo:idx('TIPO_UBICACION','TIPO_CENTRO','TIPO'),oh:idx('OH','ON_HAND','INVENTARIO'),
    oo:idx('OO','ON_ORDER','PEDIDO'),cv:idx('COSTO_VENDIDO','COSTO'),uv:idx('UTILIDAD_VENDIDA','UTIL_VENDIDA'),comp:idx('COMPRADO','COMPRA_TOTAL'),
    nac:idx('NACIONAL','NAC'),imp:idx('IMPORTACION','IMP'),vref:idx('VENTA','VENTAS')};
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    const ubicRaw=I.ubic>=0?r[I.ubic].trim():''; let tipo=I.tipo>=0?r[I.tipo].trim().toUpperCase():'';
    if(!tipo){ const u=ubicRaw.toUpperCase();
      if(u.startsWith('S-')||u.startsWith('S ')) tipo='LOGISTICO';
      else if(u.includes('BODEGA')||u.includes('BDG')) tipo='BODEGA';
      else if(u.includes('PLAN')||u.startsWith('P-')) tipo='PLAN'; else tipo='TIENDA'; }
    out.push({ division:I.div>=0?r[I.div].trim().toUpperCase():'', seccion:I.sec>=0?r[I.sec].trim().toUpperCase():'',
      goa:I.goa>=0?r[I.goa].trim().toUpperCase():'', marca:I.marca>=0?r[I.marca].trim().toUpperCase():'', norma:I.norma>=0?r[I.norma].trim().toUpperCase():'',
      ubicacion:ubicRaw, tipo, oh:num(I.oh>=0?r[I.oh]:0), oo:num(I.oo>=0?r[I.oo]:0), costoVendido:num(I.cv>=0?r[I.cv]:0),
      utilidadVendida:num(I.uv>=0?r[I.uv]:0), comprado:num(I.comp>=0?r[I.comp]:0), nacional:num(I.nac>=0?r[I.nac]:0),
      importacion:num(I.imp>=0?r[I.imp]:0), ventaRef:num(I.vref>=0?r[I.vref]:0) });
  }
  return out;
};
const parsePromoCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep)); if(rows.length<2) return [];
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_'));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const iF=idx('FECHA','DATE'),iS=idx('SECCION'),iM=idx('MARCA','PROVEEDOR'),iU=idx('UPLIFT','INCREMENTO','%');
  const out=[];
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||r.every(c=>!c)) continue;
    const f=iF>=0?parseDate(r[iF]):null; if(!f) continue;
    out.push({ fecha:isoOf(f), seccion:iS>=0?r[iS].trim().toUpperCase():'', marca:iM>=0?r[iM].trim().toUpperCase():'', uplift:iU>=0?num(r[iU]):0 });
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════
export default function ModuleDaily(){
  const gState=useGlobal();
  const theme=gState?.theme||'light';
  const isDark=theme==='dark';

  const themes={
    dark:{appBg:'bg-transparent text-gray-100',card:'bg-zinc-900 border-zinc-800 shadow-sm',cardInner:'bg-zinc-950 border-zinc-800',
      textMain:'text-white',textMuted:'text-gray-400',textAccent1:'text-emerald-400',textAccent2:'text-teal-400',border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-emerald-500',btnPrimary:'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]',
      btnGhost:'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      badge:'bg-emerald-900/30 text-emerald-400 border-emerald-500/40',badgeTeal:'bg-teal-900/30 text-teal-400 border-teal-500/40',
      badgeAmber:'bg-amber-900/30 text-amber-400 border-amber-500/40',badgeRed:'bg-red-900/30 text-red-400 border-red-500/40'},
    light:{appBg:'bg-transparent text-gray-800',card:'bg-white border-gray-200 shadow-sm',cardInner:'bg-gray-50 border-gray-200',
      textMain:'text-gray-900',textMuted:'text-gray-500',textAccent1:'text-emerald-600',textAccent2:'text-teal-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-emerald-500',btnPrimary:'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md',
      btnGhost:'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      badge:'bg-emerald-50 text-emerald-700 border-emerald-200',badgeTeal:'bg-teal-50 text-teal-700 border-teal-200',
      badgeAmber:'bg-amber-50 text-amber-700 border-amber-200',badgeRed:'bg-red-50 text-red-700 border-red-200'},
  };
  const t=themes[theme]||themes.light;
  const BarIcon=Icons.BarChart2||(p=><span {...p}>📊</span>);
  const UpIcon=Icons.Upload||(p=><span {...p}>⬆️</span>);
  const PkgIcon=Icons.Package||(p=><span {...p}>📦</span>);
  const TrashIcon=Icons.Trash2||(p=><span {...p}>🗑️</span>);

  const salesRef=useRef(null), invRef=useRef(null), promoRef=useRef(null);
  const [allData,setAllData]=useState([]);
  const [invData,setInvData]=useState([]);
  const [promoEntries,setPromoEntries]=useState([]);
  const [manualPromo,setManualPromo]=useState([]); // ISO strings (aplica a todo)
  const [defaultUplift,setDefaultUplift]=useState(20);

  const years=useMemo(()=>[...new Set(allData.map(r=>r.year))].sort((a,b)=>b-a),[allData]);
  const tyYear=useMemo(()=>years[0]||new Date().getFullYear(),[years]);
  const lyYear=useMemo(()=>years[1]||tyYear-1,[years,tyYear]);

  // Filtros
  const [dateFrom,setDateFrom]=useState(''); const [dateTo,setDateTo]=useState('');
  const [fCanal,setFCanal]=useState('ALL'),[fDiv,setFDiv]=useState('ALL'),[fSec,setFSec]=useState('ALL');
  const [fMarca,setFMarca]=useState('ALL'),[fNorma,setFNorma]=useState('ALL'),[fPago,setFPago]=useState('ALL');
  const [showInv,setShowInv]=useState(true);
  const [fcstOverridePct,setFcstOverridePct]=useState(0);
  const [scenarioSel,setScenarioSel]=useState('actual');
  const [cmpMode,setCmpMode]=useState(0);
  const [scatterLevel,setScatterLevel]=useState(0);

  // Persistencia
  useEffect(()=>{ try{ const s=localStorage.getItem('gop_daily_v3'); if(s){ const d=JSON.parse(s);
    if(d.allData?.length) setAllData(d.allData.map(r=>({...r,fecha:r.fecha?new Date(r.fecha):null})));
    if(d.invData?.length) setInvData(d.invData);
    if(d.promoEntries) setPromoEntries(d.promoEntries);
    if(d.manualPromo) setManualPromo(d.manualPromo);
    if(d.defaultUplift!=null) setDefaultUplift(d.defaultUplift);
    if(d.dateFrom) setDateFrom(d.dateFrom); if(d.dateTo) setDateTo(d.dateTo);
    if(d.fCanal) setFCanal(d.fCanal); if(d.fDiv) setFDiv(d.fDiv); if(d.fSec) setFSec(d.fSec);
    if(d.fMarca) setFMarca(d.fMarca); if(d.fNorma) setFNorma(d.fNorma); if(d.fPago) setFPago(d.fPago);
  }}catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem('gop_daily_v3',JSON.stringify({allData,invData,promoEntries,manualPromo,defaultUplift,dateFrom,dateTo,fCanal,fDiv,fSec,fMarca,fNorma,fPago})); }catch{} },
    [allData,invData,promoEntries,manualPromo,defaultUplift,dateFrom,dateTo,fCanal,fDiv,fSec,fMarca,fNorma,fPago]);

  const upload=(ref,setter,parser)=>e=>{ const f=e.target.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=ev=>{ setter(parser(ev.target.result)); e.target.value=''; }; rd.readAsText(f,'UTF-8'); };

  // Filtros
  const applyF=useCallback((rows,year)=>rows.filter(r=>r.year===year&&
    (fCanal==='ALL'||r.canal===fCanal)&&(fDiv==='ALL'||r.division===fDiv)&&(fSec==='ALL'||r.seccion===fSec)&&
    (fMarca==='ALL'||r.marca===fMarca)&&(fNorma==='ALL'||r.norma===fNorma)&&(fPago==='ALL'||r.pago===fPago)&&
    (!dateFrom||!r.fecha||r.fecha>=new Date(dateFrom+'T00:00:00'))&&(!dateTo||!r.fecha||r.fecha<=new Date(dateTo+'T23:59:59'))
  ),[fCanal,fDiv,fSec,fMarca,fNorma,fPago,dateFrom,dateTo]);
  const applyInvF=useCallback(rows=>rows.filter(r=>(fDiv==='ALL'||r.division===fDiv)&&(fSec==='ALL'||r.seccion===fSec)&&
    (fMarca==='ALL'||r.marca===fMarca)&&(fNorma==='ALL'||r.norma===fNorma)),[fDiv,fSec,fMarca,fNorma]);

  const tyData=useMemo(()=>applyF(allData,tyYear),[allData,tyYear,applyF]);
  const lyData=useMemo(()=>applyF(allData,lyYear),[allData,lyYear,applyF]);
  const filtInv=useMemo(()=>applyInvF(invData),[invData,applyInvF]);

  const opts=useMemo(()=>{ const s=k=>[...new Set(allData.map(r=>r[k]).filter(Boolean))].sort();
    return {canal:s('canal'),div:s('division'),sec:s('seccion'),marca:s('marca'),norma:s('norma'),pago:s('pago')}; },[allData]);

  const agg=useCallback(rows=>{ const ventaP=rows.reduce((s,r)=>s+r.ventaP,0),ventaU=rows.reduce((s,r)=>s+r.ventaU,0),
    utilidad=rows.reduce((s,r)=>s+r.utilidad,0),markdown=rows.reduce((s,r)=>s+r.markdown,0);
    return {ventaP,ventaU,utilidad,markdown,mgPct:ventaP>0?utilidad/ventaP*100:0,atv:ventaP>0&&ventaU>0?ventaP/ventaU:0}; },[]);
  const kpiTY=useMemo(()=>agg(tyData),[tyData,agg]);
  const kpiLY=useMemo(()=>agg(lyData),[lyData,agg]);

  const lastDateTY=useMemo(()=>{ const d=tyData.map(r=>r.fecha).filter(Boolean); return d.length?new Date(Math.max(...d)):null; },[tyData]);

  // Promo helpers
  const isPromoDate=useCallback(iso=>{
    if(manualPromo.includes(iso)) return true;
    return promoEntries.some(e=>{ if(e.fecha!==iso) return false;
      const secOk=!e.seccion||fSec==='ALL'||e.seccion===fSec; const marOk=!e.marca||fMarca==='ALL'||e.marca===fMarca;
      return secOk&&marOk; });
  },[manualPromo,promoEntries,fSec,fMarca]);
  const upliftFor=useCallback(iso=>{
    let u=manualPromo.includes(iso)?defaultUplift:0;
    promoEntries.forEach(e=>{ if(e.fecha===iso){ const secOk=!e.seccion||fSec==='ALL'||e.seccion===fSec; const marOk=!e.marca||fMarca==='ALL'||e.marca===fMarca;
      if(secOk&&marOk) u=Math.max(u,e.uplift||defaultUplift); }});
    return u||defaultUplift;
  },[manualPromo,promoEntries,fSec,fMarca,defaultUplift]);

  // Promedio por día de semana (proyección consciente de findes)
  const avgByDow=useMemo(()=>{ const m={};
    tyData.forEach(r=>{ if(!r.fecha) return; const d=(r.fecha.getDay()+6)%7; if(!m[d])m[d]={sum:0,dates:new Set()}; m[d].sum+=r.ventaP; m[d].dates.add(r.fecha.toDateString()); });
    const o={}; for(let d=0;d<7;d++) o[d]=m[d]?m[d].sum/m[d].dates.size:0; return o; },[tyData]);

  // ── FORECAST ──
  const forecastMes=useMemo(()=>{
    if(!tyData.length||!lastDateTY) return null;
    const now=lastDateTY, month=now.getMonth(), year=now.getFullYear(), diaActual=now.getDate();
    const diasMes=new Date(year,month+1,0).getDate();
    const mesRows=tyData.filter(r=>r.fecha&&r.fecha.getMonth()===month&&r.fecha.getFullYear()===year);
    const accMes=mesRows.reduce((s,r)=>s+r.ventaP,0), accMesU=mesRows.reduce((s,r)=>s+r.ventaU,0);
    const runRate=diaActual>0?accMes/diaActual:0;
    let projNeutral=0, promoDaysAhead=0;
    for(let n=diaActual+1;n<=diasMes;n++){
      const date=new Date(year,month,n), dow=(date.getDay()+6)%7;
      let base=avgByDow[dow]||runRate; const iso=isoOf(date);
      const lyIso=`${lyYear}-${String(month+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
      let mult=1;
      if(isPromoDate(iso)){ mult*=1+upliftFor(iso)/100; promoDaysAhead++; }
      else if(isPromoDate(lyIso)) mult*=1-upliftFor(lyIso)/200; // LY tuvo promo, TY no → menos venta
      projNeutral+=base*mult;
    }
    const lyMesRows=lyData.filter(r=>r.fecha&&r.fecha.getMonth()===month&&r.fecha.getFullYear()===lyYear);
    const lyMesTotal=lyMesRows.reduce((s,r)=>s+r.ventaP,0);
    const lyMesDias=new Set(lyMesRows.map(r=>r.fecha.toDateString())).size||diasMes;
    const lyRunRate=lyMesDias>0?lyMesTotal/lyMesDias:0;
    const crecLY=lyRunRate>0?runRate/lyRunRate-1:0;
    const ov=1+fcstOverridePct/100;
    const avgPrice=accMesU>0?accMes/accMesU:1;
    const mk=v=>({ventaP:v,ventaU:avgPrice>0?Math.round(v/avgPrice):0,mg:v*kpiTY.mgPct/100});
    return { diaActual,diasMes,runRate,accMes,lyMesTotal,crecLY,promoDaysAhead,
      cons:mk(Math.max(0,(accMes+runRate*(diasMes-diaActual)*0.85))*ov),
      neut:mk(Math.max(0,(accMes+projNeutral))*ov),
      risk:mk(Math.max(0,(accMes+projNeutral*(1+Math.max(0,crecLY))))*ov) };
  },[tyData,lyData,lastDateTY,avgByDow,isPromoDate,upliftFor,lyYear,fcstOverridePct,kpiTY.mgPct]);

  // ── Serie diaria ──
  const serieDiaria=useMemo(()=>{ const map={};
    tyData.forEach(r=>{ if(!r.fecha) return; const k=isoOf(r.fecha); if(!map[k])map[k]={fecha:k,ty:0,ly:null}; map[k].ty+=r.ventaP; });
    lyData.forEach(r=>{ if(!r.fecha) return; const sh=new Date(r.fecha); sh.setFullYear(tyYear); const k=isoOf(sh);
      if(!map[k])map[k]={fecha:k,ty:0,ly:0}; map[k].ly=(map[k].ly||0)+r.ventaP; });
    return Object.values(map).sort((a,b)=>a.fecha.localeCompare(b.fecha)); },[tyData,lyData,tyYear]);

  // ── Heatmap: TODAS las semanas del rango ──
  const heatmap=useMemo(()=>{
    const dated=tyData.filter(r=>r.fecha); if(!dated.length) return {weeks:[],cells:{},max:1};
    const minD=new Date(Math.min(...dated.map(r=>r.fecha))); const dow0=(minD.getDay()+6)%7;
    const weekStart=new Date(minD); weekStart.setDate(minD.getDate()-dow0);
    const cells={}; let max=1;
    dated.forEach(r=>{ const diff=Math.floor((r.fecha-weekStart)/(7*86400000)); const d=(r.fecha.getDay()+6)%7;
      const k=`${d}-${diff}`; cells[k]=(cells[k]||0)+r.ventaP; if(cells[k]>max) max=cells[k]; });
    const weekIdxs=[...new Set(Object.keys(cells).map(k=>+k.split('-')[1]))].sort((a,b)=>a-b);
    const weeks=weekIdxs.map(wi=>{ const ws=new Date(weekStart); ws.setDate(weekStart.getDate()+wi*7); return {idx:wi,label:`${ws.getDate()}/${ws.getMonth()+1}`}; });
    return {weeks,cells,max};
  },[tyData]);

  // ── byKey con tendencia + fcst ──
  const byKeyFcst=useCallback((key)=>{
    const tyM={},lyM={};
    tyData.forEach(r=>{ const k=r[key]||'N/D'; if(!tyM[k])tyM[k]={key:k,ventaP:0,ventaU:0,utilidad:0,markdown:0}; tyM[k].ventaP+=r.ventaP; tyM[k].ventaU+=r.ventaU; tyM[k].utilidad+=r.utilidad; tyM[k].markdown+=r.markdown; });
    lyData.forEach(r=>{ const k=r[key]||'N/D'; lyM[k]=(lyM[k]||0)+r.ventaP; });
    const diaActual=lastDateTY?lastDateTY.getDate():30;
    const diasMes=lastDateTY?new Date(lastDateTY.getFullYear(),lastDateTY.getMonth()+1,0).getDate():30;
    return Object.values(tyM).map(g=>({ ...g, mgPct:g.ventaP>0?g.utilidad/g.ventaP*100:0,
      tendencia:delta(g.ventaP,lyM[g.key]), fcst:diaActual>0?g.ventaP/diaActual*diasMes:g.ventaP })).sort((a,b)=>b.ventaP-a.ventaP);
  },[tyData,lyData,lastDateTY]);

  const byCanal=useMemo(()=>byKeyFcst('canal'),[byKeyFcst]);
  const byDiv=useMemo(()=>byKeyFcst('division'),[byKeyFcst]);
  const bySec=useMemo(()=>byKeyFcst('seccion'),[byKeyFcst]);
  const byMarca=useMemo(()=>byKeyFcst('marca'),[byKeyFcst]);
  const byGoa=useMemo(()=>byKeyFcst('goa'),[byKeyFcst]);
  const byPago=useMemo(()=>byKeyFcst('pago'),[byKeyFcst]);
  const byNorma=useMemo(()=>byKeyFcst('norma'),[byKeyFcst]);

  // ── COMPARACIONES ──
  const cmpWeekday=useMemo(()=>{ const DOW=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const calc=rows=>{ const m={}; rows.forEach(r=>{ if(!r.fecha)return; const d=(r.fecha.getDay()+6)%7; if(!m[d])m[d]={sum:0,dates:new Set()}; m[d].sum+=r.ventaP; m[d].dates.add(r.fecha.toDateString()); }); return m; };
    const ty=calc(tyData),ly=calc(lyData);
    return DOW.map((label,d)=>{ const ta=ty[d]?ty[d].sum/ty[d].dates.size:0, la=ly[d]?ly[d].sum/ly[d].dates.size:0;
      return {label,ty:Math.round(ta),ly:Math.round(la),delta:delta(ta,la)}; }); },[tyData,lyData]);

  const cmpDayMonth=useMemo(()=>{ if(!lastDateTY) return {data:[],warnings:[]};
    const month=lastDateTY.getMonth(), diasMes=new Date(tyYear,month+1,0).getDate();
    const tyM=tyData.filter(r=>r.fecha&&r.fecha.getMonth()===month&&r.fecha.getFullYear()===tyYear);
    const lyM=lyData.filter(r=>r.fecha&&r.fecha.getMonth()===month&&r.fecha.getFullYear()===lyYear);
    const sd=(rows,n)=>rows.filter(r=>r.fecha.getDate()===n).reduce((s,r)=>s+r.ventaP,0);
    const data=[],warnings=[];
    for(let n=1;n<=diasMes;n++){ const tv=sd(tyM,n),lv=sd(lyM,n); if(tv===0&&lv===0) continue;
      const tT=dayType(new Date(tyYear,month,n)),lT=dayType(new Date(lyYear,month,n)),d=delta(tv,lv);
      data.push({label:String(n),ty:tv,ly:lv,delta:d,tT,lT});
      if(d!=null&&d<0&&tT!==lT) warnings.push(`Día ${n}: caída de ${Math.abs(d).toFixed(0)}% pero comparas ${tT.toUpperCase()} (TY) vs ${lT.toUpperCase()} (LY)`);
    } return {data,warnings}; },[tyData,lyData,lastDateTY,tyYear,lyYear]);

  const cmpPromo=useMemo(()=>{ const sd=(rows)=>{ let sum=0,days=new Set();
      rows.forEach(r=>{ if(r.fecha&&isPromoDate(isoOf(r.fecha))){ sum+=r.ventaP; days.add(r.fecha.toDateString()); }}); return {sum,n:days.size}; };
    const ty=sd(tyData),ly=sd(lyData);
    const perDay={};
    tyData.forEach(r=>{ if(r.fecha&&isPromoDate(isoOf(r.fecha))){ const k=isoOf(r.fecha); perDay[k]=perDay[k]||{label:`${r.fecha.getDate()}/${r.fecha.getMonth()+1}`,ty:0,ly:0}; perDay[k].ty+=r.ventaP; }});
    return { tySum:ty.sum,tyN:ty.n,lySum:ly.sum,lyN:ly.n,delta:delta(ty.sum,ly.sum),
      avgTY:ty.n>0?ty.sum/ty.n:0,avgLY:ly.n>0?ly.sum/ly.n:0,perDay:Object.values(perDay).sort((a,b)=>b.ty-a.ty) }; },[tyData,lyData,isPromoDate]);

  const cmpHoliday=useMemo(()=>HOLIDAYS.map(h=>{
      const tv=tyData.filter(r=>r.fecha&&mdOf(r.fecha)===h.md&&r.fecha.getFullYear()===tyYear).reduce((s,r)=>s+r.ventaP,0);
      const lv=lyData.filter(r=>r.fecha&&mdOf(r.fecha)===h.md&&r.fecha.getFullYear()===lyYear).reduce((s,r)=>s+r.ventaP,0);
      return {name:h.name,label:h.name,ty:tv,ly:lv,delta:delta(tv,lv)};
    }).filter(x=>x.ty>0||x.ly>0),[tyData,lyData,tyYear,lyYear]);

  // ── Inventario ──
  const invKPI=useMemo(()=>{ const oh=filtInv.reduce((s,r)=>s+r.oh,0),oo=filtInv.reduce((s,r)=>s+r.oo,0),
    costoV=filtInv.reduce((s,r)=>s+r.costoVendido,0),utilV=filtInv.reduce((s,r)=>s+r.utilidadVendida,0),
    comprado=filtInv.reduce((s,r)=>s+r.comprado,0),nacional=filtInv.reduce((s,r)=>s+r.nacional,0),
    importacion=filtInv.reduce((s,r)=>s+r.importacion,0),ventaRef=filtInv.reduce((s,r)=>s+r.ventaRef,0)||kpiTY.ventaP;
    return {oh,oo,total:oh+oo,costoV,utilV,comprado,nacional,importacion,ventaRef,
      st:(oh+ventaRef)>0?ventaRef/(oh+ventaRef)*100:0, cob:kpiTY.ventaP>0&&lastDateTY?oh/(kpiTY.ventaP/lastDateTY.getDate()):0}; },[filtInv,kpiTY,lastDateTY]);

  const SCATTER_KEY=['seccion','goa','marca','norma'], SCATTER_LBL=['SECCIÓN','GOA','MARCA','NORMA'];
  const scatterData=useMemo(()=>{ const key=SCATTER_KEY[scatterLevel]; const sm={},im={};
    tyData.forEach(r=>{ const k=r[key]||'N/D'; if(!sm[k])sm[k]={ventaP:0}; sm[k].ventaP+=r.ventaP; });
    filtInv.forEach(r=>{ const k=r[key]||'N/D'; if(!im[k])im[k]={oh:0,oo:0}; im[k].oh+=r.oh; im[k].oo+=r.oo; });
    return Object.keys({...sm,...im}).map(k=>({name:k,x:sm[k]?.ventaP||0,y:(im[k]?.oh||0)+(im[k]?.oo||0)})).filter(p=>p.x>0||p.y>0); },[tyData,filtInv,scatterLevel]);
  const scatterReg=useMemo(()=>scatterData.length>=3?linearRegression(scatterData):null,[scatterData]);

  // ── Resultado del ejercicio (ajusta por escenario) ──
  const resultado=useMemo(()=>{
    let venta,label,proj=false;
    if(scenarioSel==='actual'||!forecastMes){ venta=kpiTY.ventaP; label='Real acumulado'; }
    else { venta=forecastMes[scenarioSel].ventaP; label=`Proyección cierre · ${{cons:'Conservador',neut:'Neutral',risk:'Arriesgado'}[scenarioSel]}`; proj=true; }
    const mg=kpiTY.mgPct, util=venta*mg/100;
    const costo=(!proj&&invKPI.costoV)?invKPI.costoV:venta-util;
    const diaActual=lastDateTY?lastDateTY.getDate():30, diasMes=lastDateTY?new Date(lastDateTY.getFullYear(),lastDateTY.getMonth()+1,0).getDate():30;
    const markdown=proj?(diaActual>0?kpiTY.markdown/diaActual*diasMes:kpiTY.markdown):kpiTY.markdown;
    return {venta,costo,util,markdown,mgFinal:venta>0?util/venta*100:0,label,proj}; },[scenarioSel,forecastMes,kpiTY,invKPI,lastDateTY]);

  // ── Chart config ──
  const gridC=isDark?'#27272a':'#f0f0f0',axisC=isDark?'#52525b':'#d1d5db',txtC=isDark?'#a1a1aa':'#6b7280';
  const TTip=({active,payload,label})=>{ if(!active||!payload?.length) return null;
    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmtM(p.value)}</p>)}</div>; };

  // ── Promo calendar interactivo (mes de lastDateTY) ──
  const togglePromo=iso=>setManualPromo(p=>p.includes(iso)?p.filter(x=>x!==iso):[...p,iso]);
  const promoMonth=useMemo(()=>{ const d=lastDateTY||new Date(tyYear,0,1); return {year:d.getFullYear(),month:d.getMonth()}; },[lastDateTY,tyYear]);

  // ── Sub-componentes UI ──
  const FilterBar=()=>(
    <div className={`flex flex-wrap gap-2 p-3 rounded-xl border items-center ${t.cardInner}`}>
      <DateRangePicker from={dateFrom} to={dateTo} onChange={({from,to})=>{setDateFrom(from);setDateTo(to);}} t={t} isDark={isDark}/>
      {[{label:'Canal',val:fCanal,set:setFCanal,ops:opts.canal},{label:'División',val:fDiv,set:setFDiv,ops:opts.div},
        {label:'Sección',val:fSec,set:setFSec,ops:opts.sec},{label:'Marca',val:fMarca,set:setFMarca,ops:opts.marca},
        {label:'Norma',val:fNorma,set:setFNorma,ops:opts.norma},{label:'Pago',val:fPago,set:setFPago,ops:opts.pago}].map(({label,val,set,ops})=>(
        <select key={label} value={val} onChange={e=>set(e.target.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
          {['ALL',...ops].map(o=><option key={o} value={o}>{o==='ALL'?`${label}: Todos`:o}</option>)}
        </select>))}
      <label className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border font-bold cursor-pointer ${t.btnGhost}`}>
        <input type="checkbox" checked={showInv} onChange={e=>setShowInv(e.target.checked)} className="accent-emerald-500"/> Inventario
      </label>
      {(fCanal!=='ALL'||fDiv!=='ALL'||fSec!=='ALL'||fMarca!=='ALL'||fNorma!=='ALL'||fPago!=='ALL'||dateFrom||dateTo)&&(
        <button onClick={()=>{setFCanal('ALL');setFDiv('ALL');setFSec('ALL');setFMarca('ALL');setFNorma('ALL');setFPago('ALL');setDateFrom('');setDateTo('');}}
          className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>✕ Limpiar</button>)}
    </div>
  );

  const KPIStrip=()=>(
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
      {[{label:'Venta TY',val:fmtM(kpiTY.ventaP),d:delta(kpiTY.ventaP,kpiLY.ventaP),c:'text-emerald-400'},
        {label:`vs LY (${lyYear})`,val:fmtM(kpiLY.ventaP),d:null,c:t.textMuted},
        {label:'MG %',val:fmtP(kpiTY.mgPct),d:null,c:kpiTY.mgPct>=45?'text-emerald-400':kpiTY.mgPct>=35?'text-amber-400':'text-red-400'},
        {label:'Utilidad',val:fmtM(kpiTY.utilidad),d:null,c:'text-teal-400'},
        {label:'Markdowns',val:fmtM(kpiTY.markdown),d:null,c:'text-amber-400'},
        {label:'ATV',val:fmtM(kpiTY.atv),d:null,c:t.textAccent1,sub:'ticket prom.'}].map(({label,val,d,c,sub})=>(
        <div key={label} className={`p-3 rounded-xl border ${t.cardInner}`}>
          <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-0.5`}>{label}</div>
          <div className={`text-base font-black ${c}`}>{val}</div>{sub&&<div className={`text-[9px] ${t.textMuted}`}>{sub}</div>}
          {d!=null&&<DeltaBadge value={d}/>}
        </div>))}
    </div>
  );

  // Tabla con tendencia + fcst
  const FcstTable=({title,data,accent})=>(
    <div className={`p-4 rounded-xl border ${t.cardInner}`}>
      <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>{title}</h4>
      <div className="overflow-x-auto custom-scrollbar max-h-[260px]">
        <table className="w-full text-left text-xs min-w-max">
          <thead><tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark?'bg-zinc-950 text-gray-400 border-b border-zinc-800':'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
            {['Nombre','Venta $','PZS','MG%','Tend. vs LY','Fcst Mes'].map(h=><th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody className={`divide-y ${isDark?'divide-zinc-800/50':'divide-gray-100'}`}>
            {data.slice(0,12).map((r,i)=>(
              <tr key={i} className={`transition-colors ${isDark?'hover:bg-zinc-800/30':'hover:bg-emerald-50/30'}`}>
                <td className={`p-2 font-bold ${t.textMain} max-w-[110px] truncate`} title={r.key}>{r.key}</td>
                <td className={`p-2 font-mono ${accent||'text-emerald-400'}`}>{fmtM(r.ventaP)}</td>
                <td className={`p-2 font-mono ${t.textMuted}`}>{fmt(r.ventaU)}</td>
                <td className={`p-2 font-bold ${r.mgPct>=45?'text-emerald-400':r.mgPct>=35?'text-amber-400':'text-red-400'}`}>{fmtP(r.mgPct)}</td>
                <td className="p-2"><DeltaBadge value={r.tendencia}/></td>
                <td className={`p-2 font-mono font-bold ${t.textAccent2}`}>{fmtM(r.fcst)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const hasData=allData.length>0;

  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen p-4 md:p-6 ${t.appBg} animate-fade-in-up`}>
      {/* HEADER */}
      <div className={`p-5 rounded-2xl border mb-6 ${t.card}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${t.textMain}`}>
              <span className={`p-2 rounded-xl ${isDark?'bg-emerald-500/20':'bg-emerald-50'}`}><BarIcon size={22} className={t.textAccent1}/></span>
              Daily
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>Desempeño diario · Venta, margen e inventario · {tyYear} vs {lyYear}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={salesRef} type="file" accept=".csv,.txt" className="hidden" onChange={upload(salesRef,setAllData,parseSalesCSV)}/>
            <button onClick={()=>salesRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}><UpIcon size={14}/> CSV Ventas</button>
            <input ref={invRef} type="file" accept=".csv,.txt" className="hidden" onChange={upload(invRef,setInvData,parseInvCSV)}/>
            <button onClick={()=>invRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}><PkgIcon size={14}/> CSV Inventario</button>
            <input ref={promoRef} type="file" accept=".csv,.txt" className="hidden" onChange={upload(promoRef,setPromoEntries,parsePromoCSV)}/>
            <button onClick={()=>promoRef.current?.click()} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>🏷️ CSV Promos</button>
            {allData.length>0&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{allData.length.toLocaleString()} regs</span>}
            {invData.length>0&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeAmber}`}>Inv: {invData.length.toLocaleString()}</span>}
            {promoEntries.length>0&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeTeal}`}>Promos: {promoEntries.length}</span>}
            {(allData.length||invData.length)>0&&(
              <button onClick={()=>{if(window.confirm('¿Borrar datos?')){setAllData([]);setInvData([]);setPromoEntries([]);setManualPromo([]);localStorage.removeItem('gop_daily_v3');}}}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost} opacity-40 hover:opacity-100`}><TrashIcon size={14}/></button>)}
          </div>
        </div>
      </div>

      {!hasData?(
        <div className={`rounded-2xl border p-5 ${t.card}`}>
          <EmptyState icon={BarIcon} t={t} title="Sin datos" sub="Carga el CSV de ventas (TY+LY en un solo archivo) desde el encabezado."/>
        </div>
      ):(
        <div className="space-y-5">
          <FilterBar/>
          <KPIStrip/>

          {/* SEMÁFOROS mejorados */}
          <div className={`p-4 rounded-2xl border ${t.card}`}>
            <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Semáforos Ejecutivos</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                {label:'Venta vs LY',val:delta(kpiTY.ventaP,kpiLY.ventaP),txt:delta(kpiTY.ventaP,kpiLY.ventaP)!=null?fmtP(delta(kpiTY.ventaP,kpiLY.ventaP)):'N/D',target:'≥ 0%',ok:delta(kpiTY.ventaP,kpiLY.ventaP)>=0,warn:delta(kpiTY.ventaP,kpiLY.ventaP)>=-5},
                {label:'Margen',val:kpiTY.mgPct,txt:fmtP(kpiTY.mgPct),target:'≥ 40%',ok:kpiTY.mgPct>=40,warn:kpiTY.mgPct>=35},
                {label:'Markdown / Venta',val:kpiTY.ventaP>0?kpiTY.markdown/kpiTY.ventaP*100:0,txt:kpiTY.ventaP>0?fmtP(kpiTY.markdown/kpiTY.ventaP*100):'N/D',target:'< 5%',ok:kpiTY.ventaP>0&&kpiTY.markdown/kpiTY.ventaP<0.05,warn:kpiTY.ventaP>0&&kpiTY.markdown/kpiTY.ventaP<0.08},
                {label:'Sell Through',val:invKPI.st,txt:invData.length?fmtP(invKPI.st):'Sin inv',target:'≥ 60%',ok:invData.length?invKPI.st>=60:null,warn:invData.length?invKPI.st>=45:null},
                {label:'Cobertura',val:invKPI.cob,txt:invData.length&&invKPI.cob>0?`${invKPI.cob.toFixed(0)} d`:'Sin inv',target:'< 60 d',ok:invData.length?invKPI.cob<=60:null,warn:invData.length?invKPI.cob<=90:null},
              ].map(({label,txt,target,ok,warn})=>{
                const color=ok===true?'emerald':ok===false&&warn?'amber':ok==null?'gray':'red';
                const cmap={emerald:{t:'text-emerald-400',b:'bg-emerald-500',bd:isDark?'border-emerald-500/40':'border-emerald-300'},
                  amber:{t:'text-amber-400',b:'bg-amber-400',bd:isDark?'border-amber-500/40':'border-amber-300'},
                  red:{t:'text-red-400',b:'bg-red-500',bd:isDark?'border-red-500/40':'border-red-300'},
                  gray:{t:t.textMuted,b:'bg-gray-400',bd:t.border}}[color];
                return (
                  <div key={label} className={`p-3 rounded-xl border ${cmap.bd} ${isDark?'bg-zinc-900':'bg-white'} relative overflow-hidden`}>
                    <div className={`absolute top-0 left-0 w-1 h-full ${cmap.b}`}/>
                    <div className="flex items-center justify-between mb-1 pl-1">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted}`}>{label}</span>
                      <span className={`inline-block w-2 h-2 rounded-full ${cmap.b}`}/>
                    </div>
                    <div className={`text-lg font-black pl-1 ${cmap.t}`}>{txt}</div>
                    <div className={`text-[9px] pl-1 ${t.textMuted}`}>meta: {target}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COMPARACIONES */}
          <div className={`p-4 rounded-2xl border ${t.card}`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className={`text-sm font-bold ${t.textMain}`}>🔍 Comparativos TY vs LY</h3>
              <div className="flex gap-1 flex-wrap">
                {['Día vs Día','Fecha vs Fecha','Promo vs Promo','Festivo vs Festivo'].map((m,i)=>(
                  <button key={m} onClick={()=>setCmpMode(i)} className={`text-[10px] px-3 py-1.5 rounded-lg border font-black transition-all ${cmpMode===i?t.badge:t.btnGhost}`}>{m}</button>
                ))}
              </div>
            </div>

            {cmpMode===0&&(<>
              <p className={`text-[10px] mb-3 ${t.textMuted}`}>Venta promedio por día de semana (mismo "martes" TY vs LY, sin importar la fecha exacta).</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cmpWeekday}><CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:txtC}} stroke={axisC}/>
                  <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                  <Tooltip content={<TTip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                  <Bar dataKey="ly" name={`LY ${lyYear}`} fill={isDark?'#52525b':'#cbd5e1'} radius={[4,4,0,0]}/>
                  <Bar dataKey="ty" name={`TY ${tyYear}`} fill="#10b981" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </>)}

            {cmpMode===1&&(<>
              <p className={`text-[10px] mb-3 ${t.textMuted}`}>Mismo día del mes (10 vs 10) sin importar el día de semana. ⚠️ = comparas tipos de día distintos.</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={cmpDayMonth.data}><CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                  <XAxis dataKey="label" tick={{fontSize:9,fill:txtC}} stroke={axisC}/>
                  <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                  <Tooltip content={<TTip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                  <Line type="monotone" dataKey="ly" name={`LY ${lyYear}`} stroke={axisC} dot={false} strokeWidth={1.5} strokeDasharray="4 2"/>
                  <Line type="monotone" dataKey="ty" name={`TY ${tyYear}`} stroke="#10b981" dot={{r:2}} strokeWidth={2}/>
                </LineChart>
              </ResponsiveContainer>
              {cmpDayMonth.warnings.length>0&&(
                <div className={`mt-3 p-3 rounded-xl border ${t.badgeAmber}`}>
                  <p className="text-[10px] font-black uppercase mb-1">⚠️ Advertencias de comparación</p>
                  <ul className="space-y-0.5">{cmpDayMonth.warnings.slice(0,6).map((w,i)=><li key={i} className="text-[10px]">• {w}</li>)}</ul>
                </div>)}
            </>)}

            {cmpMode===2&&(<>
              <p className={`text-[10px] mb-3 ${t.textMuted}`}>Días marcados con promoción (calendario abajo o CSV). Respeta filtros de sección/marca.</p>
              {cmpPromo.tyN===0&&cmpPromo.lyN===0?(
                <EmptyState icon={null} t={t} title="Sin días de promo marcados" sub="Marca días en el Promo Calendar abajo o carga el CSV de promos."/>
              ):(
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[{l:`Venta Promo TY (${cmpPromo.tyN}d)`,v:fmtM(cmpPromo.tySum),c:'text-emerald-400'},
                    {l:`Venta Promo LY (${cmpPromo.lyN}d)`,v:fmtM(cmpPromo.lySum),c:t.textMuted},
                    {l:'Avg/día Promo TY',v:fmtM(cmpPromo.avgTY),c:'text-teal-400'},
                    {l:'Δ vs LY',v:cmpPromo.delta!=null?fmtP(cmpPromo.delta):'N/D',c:(cmpPromo.delta||0)>=0?'text-emerald-400':'text-red-400'}].map(({l,v,c})=>(
                    <div key={l} className={`p-3 rounded-xl border ${t.cardInner}`}><div className={`text-[9px] uppercase font-black ${t.textMuted}`}>{l}</div><div className={`text-base font-black ${c}`}>{v}</div></div>))}
                </div>)}
              {cmpPromo.perDay.length>0&&(
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={cmpPromo.perDay}><CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                    <XAxis dataKey="label" tick={{fontSize:9,fill:txtC}} stroke={axisC}/>
                    <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                    <Tooltip content={<TTip/>}/><Bar dataKey="ty" name="Venta promo" fill="#10b981" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>)}
            </>)}

            {cmpMode===3&&(<>
              <p className={`text-[10px] mb-3 ${t.textMuted}`}>Días festivos comparados por nombre (Día de las Madres TY vs LY, etc).</p>
              {cmpHoliday.length===0?(
                <EmptyState icon={null} t={t} title="Sin festivos en el rango" sub="No hay ventas en fechas festivas dentro del periodo cargado."/>
              ):(
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={cmpHoliday} margin={{bottom:40}}><CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                    <XAxis dataKey="label" tick={{fontSize:9,fill:txtC}} stroke={axisC} angle={-25} textAnchor="end" height={60} interval={0}/>
                    <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                    <Tooltip content={<TTip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                    <Bar dataKey="ly" name={`LY ${lyYear}`} fill={isDark?'#52525b':'#cbd5e1'} radius={[4,4,0,0]}/>
                    <Bar dataKey="ty" name={`TY ${tyYear}`} fill="#f59e0b" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>)}
            </>)}
          </div>

          {/* TENDENCIA */}
          {serieDiaria.length>1&&(
            <div className={`p-4 rounded-2xl border ${t.card}`}>
              <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>📈 Tendencia Diaria TY vs LY</h4>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={serieDiaria}><CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                  <XAxis dataKey="fecha" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>v?.slice(5)}/>
                  <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                  <Tooltip content={<TTip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                  {lyData.length>0&&<Line type="monotone" dataKey="ly" name={`LY ${lyYear}`} stroke={axisC} dot={false} strokeWidth={1.5} strokeDasharray="4 2"/>}
                  <Line type="monotone" dataKey="ty" name={`TY ${tyYear}`} stroke="#10b981" dot={false} strokeWidth={2.5} activeDot={{r:4}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>)}

          {/* BARRAS canal + division */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[{title:'Por Canal',data:byCanal,fill:'#10b981'},{title:'Por División',data:byDiv,fill:'#14b8a6'}].map(({title,data,fill})=>(
              <div key={title} className={`p-4 rounded-2xl border ${t.card}`}>
                <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>{title}</h4>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.slice(0,6)} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                    <YAxis type="category" dataKey="key" tick={{fontSize:9,fill:txtC}} stroke={axisC} width={80}/>
                    <Tooltip content={<TTip/>}/><Bar dataKey="ventaP" name="Venta $" fill={fill} radius={[0,4,4,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>))}
          </div>

          {/* PAGO + NORMA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[{title:'Tipo de Pago',data:byPago,colors:['bg-emerald-500','bg-teal-500','bg-blue-500','bg-purple-500']},
              {title:'Norma de Compra',data:byNorma,colors:['bg-amber-500','bg-orange-500','bg-yellow-500']}].map(({title,data,colors})=>(
              <div key={title} className={`p-4 rounded-2xl border ${t.card}`}>
                <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>{title}</h4>
                <div className="space-y-2">
                  {data.map((p,i)=>{ const mx=data[0]?.ventaP||1; return (
                    <div key={p.key}>
                      <div className="flex justify-between mb-0.5"><span className={`text-xs font-bold ${t.textMain}`}>{p.key}</span>
                        <div className="flex items-center gap-2"><span className={`text-[9px] ${t.textMuted}`}>{fmtP(kpiTY.ventaP>0?p.ventaP/kpiTY.ventaP*100:0)}</span>
                          <span className="text-xs font-mono text-emerald-400">{fmtM(p.ventaP)}</span></div></div>
                      <MiniBar value={p.ventaP} max={mx} color={colors[i%colors.length]} isDark={isDark}/>
                    </div>); })}
                </div>
              </div>))}
          </div>

          {/* HEATMAP todas las semanas */}
          {heatmap.weeks.length>0&&(
            <div className={`p-4 rounded-2xl border ${t.card}`}>
              <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>🗓️ Heatmap — Venta por Día de Semana (todas las semanas)</h4>
              <div className="overflow-x-auto custom-scrollbar">
                <div className="grid gap-1" style={{gridTemplateColumns:`44px repeat(${heatmap.weeks.length},minmax(38px,1fr))`}}>
                  <div/>
                  {heatmap.weeks.map(w=><div key={w.idx} className={`text-center text-[8px] font-black ${t.textMuted}`}>{w.label}</div>)}
                  {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((d,di)=>(
                    <React.Fragment key={d}>
                      <div className={`text-[9px] font-black ${t.textMuted} flex items-center`}>{d}</div>
                      {heatmap.weeks.map(w=>{ const v=heatmap.cells[`${di}-${w.idx}`]; const it=v?v/heatmap.max:0;
                        return <div key={w.idx} title={v?fmtM(v):''} className="h-7 rounded-md flex items-center justify-center text-[8px] font-bold"
                          style={{background:v?`rgba(16,185,129,${0.12+it*0.85})`:(isDark?'rgba(39,39,42,0.4)':'rgba(243,244,246,0.7)'),color:it>0.5?'white':(isDark?'#71717a':'#9ca3af')}}>
                          {v?(v/1000).toFixed(0):'·'}</div>; })}
                    </React.Fragment>))}
                </div>
              </div>
              <p className={`text-[9px] mt-2 ${t.textMuted}`}>Valores en miles ($k). Hover para monto exacto.</p>
            </div>)}

          {/* PROMO CALENDAR */}
          <div className={`p-4 rounded-2xl border ${t.card}`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h4 className={`text-sm font-bold ${t.textMain}`}>🏷️ Promo Calendar — {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][promoMonth.month]} {promoMonth.year}</h4>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black uppercase ${t.textMuted}`}>Uplift default</span>
                  <input type="range" min={5} max={50} value={defaultUplift} onChange={e=>setDefaultUplift(Number(e.target.value))} className="w-24 accent-emerald-500"/>
                  <span className="text-xs font-black text-emerald-400 w-10">+{defaultUplift}%</span>
                </div>
                {manualPromo.length>0&&<button onClick={()=>setManualPromo([])} className={`text-[10px] px-3 py-1 rounded-lg border font-bold ${t.btnGhost}`}>Limpiar marcados</button>}
              </div>
            </div>
            {(()=>{ const {year,month}=promoMonth; const first=(new Date(year,month,1).getDay()+6)%7; const days=new Date(year,month+1,0).getDate();
              const cells=[]; for(let i=0;i<first;i++) cells.push(<div key={`e${i}`}/>);
              for(let d=1;d<=days;d++){ const date=new Date(year,month,d); const iso=isoOf(date); const promo=isPromoDate(iso);
                const hol=holidayName(date); const we=isWeekend(date);
                cells.push(<button key={iso} onClick={()=>togglePromo(iso)} title={hol||''}
                  className={`relative h-12 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold border transition-all ${promo?'bg-emerald-500 text-white border-emerald-400':(isDark?`bg-zinc-900 border-zinc-700 ${we?'text-amber-400':'text-gray-300'} hover:border-emerald-500`:`bg-white border-gray-200 ${we?'text-amber-600':'text-gray-700'} hover:border-emerald-400`)}`}>
                  <span>{d}</span>{hol&&<span className="absolute top-0.5 right-0.5 text-[7px]">🎉</span>}
                  {promo&&<span className="text-[7px]">promo</span>}
                </button>); }
              return <div className="grid grid-cols-7 gap-1.5">
                {['L','M','M','J','V','S','D'].map((d,i)=><div key={i} className={`text-[9px] font-black text-center ${t.textMuted}`}>{d}</div>)}
                {cells}</div>;
            })()}
            <p className={`text-[9px] mt-3 ${t.textMuted}`}>Click para marcar/desmarcar días con promo. 🎉 = festivo · días naranja = fin de semana. El forecast suma uplift en días promo TY y descuenta si LY tuvo promo que TY no tiene. CSV de promos puede acotar por sección/marca.</p>
          </div>

          {/* FORECAST */}
          {forecastMes&&(
            <div className={`p-4 rounded-2xl border ${t.card}`}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h4 className={`text-sm font-bold ${t.textMain}`}>🎯 Forecast Cierre de Mes</h4>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-[9px] ${t.textMuted}`}>Día {forecastMes.diaActual}/{forecastMes.diasMes} · run rate {fmtM(forecastMes.runRate)}/d · {forecastMes.promoDaysAhead} días promo restantes{forecastMes.lyMesTotal>0&&` · crec LY ${fmtP(forecastMes.crecLY*100)}`}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase ${t.textMuted}`}>Override</span>
                    <input type="range" min={-30} max={30} value={fcstOverridePct} onChange={e=>setFcstOverridePct(Number(e.target.value))} className="w-20 accent-emerald-500"/>
                    <span className={`text-xs font-black w-10 ${fcstOverridePct>0?'text-emerald-400':fcstOverridePct<0?'text-red-400':t.textMuted}`}>{fcstOverridePct>0?'+':''}{fcstOverridePct}%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[{key:'cons',label:'Conservador',icon:'🛡️',color:'text-blue-400',bar:'bg-blue-400'},
                  {key:'neut',label:'Neutral',icon:'⚖️',color:'text-emerald-400',bar:'bg-emerald-400'},
                  {key:'risk',label:'Arriesgado',icon:'🚀',color:'text-amber-400',bar:'bg-amber-400'}].map(({key,label,icon,color,bar})=>{
                  const s=forecastMes[key]; const sel=scenarioSel===key;
                  return (
                    <button key={key} onClick={()=>setScenarioSel(sel?'actual':key)}
                      className={`text-left p-4 rounded-xl border transition-all ${sel?'border-emerald-500 ring-1 ring-emerald-500':(isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200')}`}>
                      <div className="flex items-center justify-between mb-2"><span className="flex items-center gap-2"><span>{icon}</span><span className={`text-xs font-black uppercase ${color}`}>{label}</span></span>{sel&&<span className={`text-[8px] px-2 py-0.5 rounded-full border font-black ${t.badge}`}>activo</span>}</div>
                      <div className={`text-2xl font-black ${color}`}>{fmtM(s.ventaP)}</div>
                      <div className={`text-[10px] ${t.textMuted} mt-0.5`}>{fmt(s.ventaU)} pzs · MG {fmtP(s.ventaP>0?s.mg/s.ventaP*100:0)}</div>
                      {forecastMes.lyMesTotal>0&&<div className={`text-[10px] mt-1 font-bold ${delta(s.ventaP,forecastMes.lyMesTotal)>=0?'text-emerald-400':'text-red-400'}`}>{delta(s.ventaP,forecastMes.lyMesTotal)>=0?'▲':'▼'} {Math.abs(delta(s.ventaP,forecastMes.lyMesTotal)).toFixed(1)}% vs LY mes</div>}
                      <div className="mt-3"><MiniBar value={s.ventaP} max={forecastMes.risk.ventaP*1.1} color={bar} isDark={isDark}/></div>
                    </button>); })}
              </div>
              <p className={`text-[9px] mt-3 ${t.textMuted}`}>Click en un escenario para proyectar el Resultado del Ejercicio con ese cierre. La proyección usa promedio por día de semana (cubre findes/días faltantes) + promos del calendario.</p>
            </div>)}

          {/* RESULTADO DEL EJERCICIO */}
          <div className={`p-4 rounded-2xl border ${t.card}`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h4 className={`text-sm font-bold ${t.textMain}`}>📊 Resultado del Ejercicio</h4>
              <span className={`text-[10px] px-3 py-1 rounded-full border font-black ${resultado.proj?t.badgeAmber:t.badge}`}>{resultado.label}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[{label:'Venta',val:fmtM(resultado.venta),c:'text-emerald-400'},
                {label:'Costo Vendido',val:fmtM(resultado.costo),c:'text-red-400'},
                {label:'Utilidad',val:fmtM(resultado.util),c:'text-teal-400'},
                {label:'Markdowns',val:fmtM(resultado.markdown),c:'text-amber-400'},
                {label:'MG % Final',val:fmtP(resultado.mgFinal),c:resultado.mgFinal>=45?'text-emerald-400':resultado.mgFinal>=35?'text-amber-400':'text-red-400'}].map(({label,val,c})=>(
                <div key={label} className={`p-3 rounded-lg border ${isDark?'border-zinc-800':'border-gray-100'}`}>
                  <div className={`text-[9px] uppercase font-black ${t.textMuted}`}>{label}</div><div className={`text-base font-black ${c}`}>{val}</div>
                </div>))}
            </div>
            {scenarioSel!=='actual'&&<p className={`text-[9px] mt-2 ${t.textMuted}`}>Proyectado a cierre de mes con escenario {scenarioSel==='cons'?'Conservador':scenarioSel==='neut'?'Neutral':'Arriesgado'}. Click de nuevo en el escenario para volver a "Real".</p>}
          </div>

          {/* TABLAS con tendencia + fcst */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FcstTable title="Top Marcas" data={byMarca}/>
            <FcstTable title="Por Sección" data={bySec} accent="text-teal-400"/>
          </div>
          <FcstTable title="Top GOA" data={byGoa} accent="text-blue-400"/>

          {/* ── INVENTARIO (toggle) ── */}
          {showInv&&(
            <>
              {(invData.length>0)?(<>
                <div className={`p-4 rounded-2xl border ${t.card}`}>
                  <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Inventario Actual</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    {[{label:'On Hand (OH)',val:fmt(invKPI.oh),sub:'disponibles',c:'text-emerald-400'},
                      {label:'On Order (OO)',val:fmt(invKPI.oo),sub:'en tránsito',c:'text-teal-400'},
                      {label:'Total',val:fmt(invKPI.total),sub:'OH+OO',c:t.textAccent1},
                      {label:'Sell Through',val:fmtP(invKPI.st),sub:'venta/(OH+venta)',c:invKPI.st>=60?'text-emerald-400':invKPI.st>=40?'text-amber-400':'text-red-400'}].map(({label,val,sub,c})=>(
                      <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}><div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div><div className={`text-xl font-black ${c}`}>{val}</div><div className={`text-[9px] ${t.textMuted}`}>{sub}</div></div>))}
                  </div>
                  {/* Por tipo ubicación */}
                  <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Inventario por Tipo de Ubicación</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {['LOGISTICO','BODEGA','PLAN','TIENDA'].map(tipo=>{ const rows=filtInv.filter(r=>r.tipo===tipo);
                      const oh=rows.reduce((s,r)=>s+r.oh,0),oo=rows.reduce((s,r)=>s+r.oo,0),n=new Set(rows.map(r=>r.ubicacion)).size;
                      const col={LOGISTICO:'text-blue-400',BODEGA:'text-purple-400',PLAN:'text-amber-400',TIENDA:'text-emerald-400'}[tipo];
                      const barc={LOGISTICO:'bg-blue-400',BODEGA:'bg-purple-400',PLAN:'bg-amber-400',TIENDA:'bg-emerald-400'}[tipo];
                      return (<div key={tipo} className={`p-4 rounded-xl border ${isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2"><span className={`text-[9px] font-black uppercase ${col}`}>{tipo}</span>{n>0&&<span className={`text-[9px] px-2 py-0.5 rounded-full border font-black ${t.badge}`}>{n} ub.</span>}</div>
                        <div className={`text-xl font-black ${col}`}>{fmt(oh)}</div><div className={`text-[9px] ${t.textMuted}`}>OH · {fmt(oo)} OO</div>
                        {(oh+oo)>0&&invKPI.total>0&&<div className="mt-2"><MiniBar value={oh+oo} max={invKPI.total} color={barc} isDark={isDark}/></div>}
                      </div>); })}
                  </div>
                  {/* Detalle ubicaciones */}
                  {(()=>{ const u={}; filtInv.forEach(r=>{ if(!u[r.ubicacion])u[r.ubicacion]={ubicacion:r.ubicacion,tipo:r.tipo,oh:0,oo:0}; u[r.ubicacion].oh+=r.oh; u[r.ubicacion].oo+=r.oo; });
                    const sorted=Object.values(u).sort((a,b)=>b.oh-a.oh); const mx=sorted[0]?.oh||1; if(!sorted.length) return null;
                    const tc={LOGISTICO:'bg-blue-400',BODEGA:'bg-purple-400',PLAN:'bg-amber-400',TIENDA:'bg-emerald-500'};
                    const txc={LOGISTICO:'text-blue-400',BODEGA:'text-purple-400',PLAN:'text-amber-400',TIENDA:'text-emerald-400'};
                    return <div className="space-y-2"><h5 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-2`}>Detalle por Ubicación</h5>
                      {sorted.map(x=>(<div key={x.ubicacion} className="flex items-center gap-3">
                        <span className={`w-32 truncate text-[10px] font-bold text-right ${t.textMain}`} title={x.ubicacion}>{x.ubicacion}</span>
                        <div className="flex-1 relative h-5 rounded-lg overflow-hidden bg-zinc-700/20">
                          <div className={`absolute left-0 top-0 h-full rounded-lg ${tc[x.tipo]||'bg-gray-400'} opacity-70`} style={{width:`${(x.oh/mx)*100}%`}}/>
                          <span className={`absolute left-2 top-0 h-full flex items-center text-[9px] font-black ${x.oh/mx>0.4?'text-white':t.textMain}`}>{fmt(x.oh)} OH{x.oo>0?` · ${fmt(x.oo)} OO`:''}</span></div>
                        <span className={`w-16 text-[9px] font-black text-right ${txc[x.tipo]||t.textMuted}`}>{x.tipo}</span></div>))}
                    </div>; })()}
                </div>

                {/* Compras */}
                {invKPI.comprado>0&&(
                  <div className={`p-4 rounded-2xl border ${t.card}`}>
                    <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Compras</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[{label:'Comprado Total',val:fmtM(invKPI.comprado),c:'text-blue-400'},
                        {label:'Nacional',val:fmtM(invKPI.nacional),sub:fmtP(invKPI.nacional/invKPI.comprado*100),c:'text-emerald-400'},
                        {label:'Importación',val:fmtM(invKPI.importacion),sub:fmtP(invKPI.importacion/invKPI.comprado*100),c:'text-purple-400'},
                        {label:'Cobertura',val:invKPI.cob>0?`${invKPI.cob.toFixed(0)} días`:'N/D',sub:'OH/run rate',c:invKPI.cob>60?'text-red-400':invKPI.cob>30?'text-amber-400':'text-emerald-400'}].map(({label,val,sub,c})=>(
                        <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}><div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div><div className={`text-xl font-black ${c}`}>{val}</div>{sub&&<div className={`text-[9px] ${t.textMuted}`}>{sub}</div>}</div>))}
                    </div>
                  </div>)}

                {/* Scatter */}
                {scatterData.length>=2&&(
                  <div className={`p-4 rounded-2xl border ${t.card}`}>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h4 className={`text-sm font-bold ${t.textMain}`}>🔵 Dispersión: Venta vs Inventario</h4>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] ${t.textMuted}`}>Desagregar:</span>
                        {SCATTER_LBL.map((l,i)=><button key={l} onClick={()=>setScatterLevel(i)} className={`text-[10px] px-3 py-1 rounded-full border font-black transition-all ${scatterLevel===i?t.badge:t.btnGhost}`}>{l}</button>)}
                        {scatterReg&&<span className={`text-[10px] font-black px-2 py-1 rounded-full border ${scatterReg.r2>0.7?t.badge:scatterReg.r2>0.4?t.badgeAmber:t.badgeRed}`}>R² = {scatterReg.r2.toFixed(2)}</span>}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <ScatterChart margin={{top:10,right:20,left:0,bottom:20}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                        <XAxis dataKey="x" name="Venta $" type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'} label={{value:'Venta $',position:'insideBottom',offset:-10,fontSize:10,fill:txtC}}/>
                        <YAxis dataKey="y" name="OH+OO" type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>fmt(v)} label={{value:'OH+OO',angle:-90,position:'insideLeft',fontSize:10,fill:txtC}}/>
                        <Tooltip content={({active,payload})=>{ if(!active||!payload?.length) return null; const d=payload[0]?.payload;
                          return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}><p className={`font-bold mb-1 ${t.textMain}`}>{d?.name}</p><p className="text-emerald-400">Venta: {fmtM(d?.x)}</p><p className="text-teal-400">OH+OO: {fmt(d?.y)}</p></div>; }}/>
                        <Scatter data={scatterData} fill="#10b981" fillOpacity={0.75}/>
                        {scatterReg&&(()=>{ const xs=scatterData.map(d=>d.x); const xn=Math.min(...xs),xx=Math.max(...xs);
                          return <Scatter data={[{x:xn,y:scatterReg.slope*xn+scatterReg.intercept},{x:xx,y:scatterReg.slope*xx+scatterReg.intercept}]} fill="none" line={{stroke:'#f59e0b',strokeWidth:2,strokeDasharray:'6 3'}} shape={()=>null} legendType="none"/>; })()}
                      </ScatterChart>
                    </ResponsiveContainer>
                    <p className={`text-[9px] mt-1 ${t.textMuted}`}>Nivel actual: <strong className={t.textAccent1}>{SCATTER_LBL[scatterLevel]}</strong>. Arriba de la línea = sobreinventario vs venta. Abajo = oportunidad de surtir. Reacciona a filtros.</p>
                  </div>)}

                {/* ST + cobertura por división */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className={`p-4 rounded-2xl border ${t.card}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Sell Through por División</h4>
                    <div className="space-y-2">{byDiv.map((d,i)=>{ const inv=filtInv.filter(r=>r.division===d.key); const oh=inv.reduce((s,r)=>s+r.oh,0);
                      const st=(oh+d.ventaP)>0?d.ventaP/(oh+d.ventaP)*100:null; return (
                      <div key={i}><div className="flex justify-between mb-0.5"><span className={`text-[10px] font-bold ${t.textMain}`}>{d.key}</span>
                        <span className={`text-[10px] font-black ${st!=null?(st>=60?'text-emerald-400':st>=40?'text-amber-400':'text-red-400'):t.textMuted}`}>{st!=null?fmtP(st):'N/D'}</span></div>
                        {st!=null&&<MiniBar value={st} max={100} color={st>=60?'bg-emerald-500':st>=40?'bg-amber-400':'bg-red-400'} isDark={isDark}/>}</div>); })}</div>
                  </div>
                  <div className={`p-4 rounded-2xl border ${t.card}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Cobertura por División (semanas)</h4>
                    <div className="space-y-2">{byDiv.map((d,i)=>{ const inv=filtInv.filter(r=>r.division===d.key); const oh=inv.reduce((s,r)=>s+r.oh,0);
                      const dias=lastDateTY?lastDateTY.getDate():30; const rr=d.ventaP/(dias||1); const cob=rr>0?oh/rr:null; const sem=cob!=null?(cob/7).toFixed(1):null;
                      return <div key={i} className="flex items-center justify-between"><span className={`text-[10px] font-bold ${t.textMain} truncate max-w-[120px]`}>{d.key}</span>
                        <span className={`text-[10px] font-black ${sem!=null?(parseFloat(sem)>12?'text-red-400':parseFloat(sem)>8?'text-amber-400':'text-emerald-400'):t.textMuted}`}>{sem!=null?`${sem} sem`:'N/D'}</span></div>; })}</div>
                    <p className={`text-[9px] mt-3 ${t.textMuted}`}>&gt;12 sem = riesgo · &lt;4 sem = ok</p>
                  </div>
                </div>
              </>):(
                <div className={`p-4 rounded-2xl border ${t.card}`}><EmptyState icon={PkgIcon} t={t} title="Sin datos de inventario" sub="Carga el CSV de inventario o desmarca el check 'Inventario' en los filtros."/></div>
              )}
            </>)}
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html:`
        *{scrollbar-width:thin;scrollbar-color:rgba(156,163,175,0.3) transparent;}
        *::-webkit-scrollbar{width:6px;height:6px;}
        *::-webkit-scrollbar-track{background:transparent!important;}
        *::-webkit-scrollbar-thumb{background-color:rgba(156,163,175,0.3);border-radius:10px;}
        .custom-scrollbar::-webkit-scrollbar{width:4px;height:4px;}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        .animate-fade-in-up{animation:fadeInUp 0.4s ease-out forwards;}
      `}}/>
    </div>
  );
}

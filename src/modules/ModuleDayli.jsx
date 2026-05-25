import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Icons from '../utils/icons';
import { useGlobal } from '../context/GlobalContext';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const parseCSVRow = (row, sep) =>
  row.split(new RegExp(`\\${sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
     .map(c => c.replace(/^"|"$/g, '').trim());

const num  = v  => parseFloat(String(v||'0').replace(/[^0-9.-]+/g,''))||0;
const fmt  = (n,d=0) => n==null?'-':n.toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtP = (n,d=1) => n==null?'-':n.toFixed(d)+'%';
const fmtM = (n)     => n==null?'-':'$'+n.toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0});

const delta = (curr,prev) => prev&&prev!==0?((curr-prev)/Math.abs(prev))*100:null;

const parseDate = s => {
  if(!s) return null;
  const c = s.trim();
  let d;
  if(/^\d{4}-\d{2}-\d{2}/.test(c)) d=new Date(c.slice(0,10));
  else {
    const p=c.split(/[\/\-\.]/);
    if(p.length===3){
      const [a,b,cc]=p;
      if(a.length===4) d=new Date(`${a}-${b.padStart(2,'0')}-${cc.padStart(2,'0')}`);
      else d=new Date(`${cc.length===4?cc:'20'+cc}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`);
    }
  }
  return d&&!isNaN(d)?d:null;
};

const fmtDate = d => d?d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}):'';

const downloadCSV = (rows,filename) => {
  const BOM='\uFEFF';
  const csv=BOM+rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
};

const linearRegression = pts => {
  const n=pts.length; if(n<2) return {slope:0,intercept:0,r2:0};
  const sx=pts.reduce((s,p)=>s+p.x,0), sy=pts.reduce((s,p)=>s+p.y,0);
  const sxy=pts.reduce((s,p)=>s+p.x*p.y,0), sx2=pts.reduce((s,p)=>s+p.x*p.x,0);
  const slope=(n*sxy-sx*sy)/(n*sx2-sx*sx)||0;
  const intercept=(sy-slope*sx)/n;
  const ym=sy/n;
  const sst=pts.reduce((s,p)=>s+Math.pow(p.y-ym,2),0);
  const ssr=pts.reduce((s,p)=>s+Math.pow(p.y-(slope*p.x+intercept),2),0);
  return {slope,intercept,r2:Math.max(0,sst>0?1-ssr/sst:0)};
};

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

const SemaforoCircle = ({ok}) => (
  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ok===true?'bg-emerald-400':ok===false?'bg-red-400':'bg-amber-400'}`}/>
);

const EmptyState = ({icon:Icon,title,sub,t}) => (
  <div className={`p-12 rounded-xl border flex flex-col items-center justify-center text-center ${t.cardInner}`}>
    <Icon size={36} className="text-gray-400 mb-3"/>
    <p className={`text-sm font-bold ${t.textMain}`}>{title}</p>
    <p className={`text-xs mt-1 ${t.textMuted}`}>{sub}</p>
  </div>
);

// ─── DATE RANGE PICKER ───────────────────────────────────────────────────────

const DateRangePicker = ({from,to,onChange,t,isDark}) => {
  const [open,setOpen]=useState(false);
  const [hov,setHov]=useState(null);
  const [selStart,setSelStart]=useState(null);
  const [view,setView]=useState(() => {
    const d=from?new Date(from):new Date();
    return {year:d.getFullYear(),month:d.getMonth()};
  });
  const ref=useRef(null);

  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const DOW=['L','M','M','J','V','S','D'];

  const getDays = (y,m) => {
    const first=new Date(y,m,1).getDay(); // 0=Sun
    const adj=(first+6)%7; // make Mon=0
    const days=new Date(y,m+1,0).getDate();
    return {adj,days};
  };

  const toISO = d => d instanceof Date ? d.toISOString().slice(0,10) : d;

  const handleDay = (iso) => {
    if(!selStart){
      setSelStart(iso);
      onChange({from:iso,to:iso});
    } else {
      const [a,b]=[selStart,iso].sort();
      onChange({from:a,to:b});
      setSelStart(null);
      setOpen(false);
    }
  };

  const inRange = iso => {
    const end=selStart&&hov?[selStart,hov].sort():[from,to].sort();
    return iso>=end[0]&&iso<=end[1];
  };

  const renderMonth = (y,m) => {
    const {adj,days}=getDays(y,m);
    const cells=[];
    for(let i=0;i<adj;i++) cells.push(<div key={`e${i}`}/>);
    for(let d=1;d<=days;d++){
      const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isFrom=iso===from, isTo=iso===to;
      const inR=inRange(iso);
      const isEndpoint=isFrom||isTo;
      cells.push(
        <button key={iso}
          onMouseEnter={()=>selStart&&setHov(iso)}
          onClick={()=>handleDay(iso)}
          className={`text-[11px] h-7 w-7 rounded-full flex items-center justify-center transition-all font-medium
            ${isEndpoint?'bg-emerald-500 text-white font-black':
              inR?(isDark?'bg-emerald-900/40 text-emerald-300':'bg-emerald-100 text-emerald-700'):
              (isDark?'text-gray-300 hover:bg-zinc-700':'text-gray-700 hover:bg-gray-100')}`}>
          {d}
        </button>
      );
    }
    return cells;
  };

  const prevMonth=()=>setView(v=>v.month===0?{year:v.year-1,month:11}:{...v,month:v.month-1});
  const nextMonth=()=>setView(v=>v.month===11?{year:v.year+1,month:0}:{...v,month:v.month+1});
  const viewNext={year:view.month===11?view.year+1:view.year,month:view.month===11?0:view.month+1};

  const label=()=>{
    if(!from&&!to) return 'Todas las fechas';
    if(from===to) return fmtDate(new Date(from));
    return `${from?fmtDate(new Date(from)):'...'} → ${to?fmtDate(new Date(to)):'...'}`;
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(v=>!v)}
        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all ${t.btnGhost}`}>
        <Icons.Calendar size={13}/> {label()}
      </button>
      {open && (
        <div className={`absolute top-full left-0 mt-2 z-50 rounded-2xl border shadow-2xl p-4 ${isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`}
          style={{minWidth:560}}>
          <div className="flex gap-6">
            {[{y:view.year,m:view.month},{y:viewNext.year,m:viewNext.month}].map(({y,m},idx)=>(
              <div key={idx} className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  {idx===0?<button onClick={prevMonth} className={`p-1 rounded-lg ${isDark?'hover:bg-zinc-700':'hover:bg-gray-100'}`}><Icons.ChevronLeft size={14}/></button>:<div/>}
                  <span className={`text-xs font-black ${t.textMain}`}>{MONTHS[m]} {y}</span>
                  {idx===1?<button onClick={nextMonth} className={`p-1 rounded-lg ${isDark?'hover:bg-zinc-700':'hover:bg-gray-100'}`}><Icons.ChevronRight size={14}/></button>:<div/>}
                </div>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {DOW.map(d=><div key={d} className={`text-[9px] font-black text-center ${t.textMuted}`}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-0.5">{renderMonth(y,m)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-700/30">
            <button onClick={()=>{onChange({from:'',to:''});setSelStart(null);setOpen(false);}}
              className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>Limpiar</button>
            <button onClick={()=>setOpen(false)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold ${t.btnPrimary}`}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CSV PARSER ──────────────────────────────────────────────────────────────

const parseSalesCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep));
  if(rows.length<2) return [];
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_').replace(/[#ÁÉÍÓÚ]/g,c=>
    ({'#':'NUM',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U'}[c]||c)));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const iDiv=idx('DIVISION','DIV');
  const iSec=idx('SECCION','SECTION');
  const iNumSec=idx('NUM_SECCION','_SECCION');
  const iGoa=idx('GOA','FAMILIA');
  const iMarca=idx('MARCA','PROVEEDOR','BRAND');
  const iNorma=idx('NORMA','TIPO_COMPRA');
  const iCanal=idx('CANAL','CHANNEL');
  const iPago=idx('TIPO_PAGO','PAGO','PAYMENT','TIPO PAGO');
  const iFecha=idx('FECHA','DATE','DIA');
  const iVP=idx('VENTA_','VENTA$','VENTA_PESOS','VENTAS');
  const iVU=idx('VENTA_U','UNIDADES','PIEZAS');
  const iMG=idx('MG','MARGEN','MARGIN');
  const iUtil=idx('UTILIDAD','UTIL');
  const iMD=idx('MARKDOWN','DESCUENTO','MD');

  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(!r||r.every(c=>!c)) continue;
    const fecha=iFecha>=0?parseDate(r[iFecha]):null;
    const ventaP=num(iVP>=0?r[iVP]:0);
    if(!ventaP&&!fecha) continue;
    const year=fecha?fecha.getFullYear():0;
    out.push({
      division: iDiv>=0?r[iDiv].trim().toUpperCase():'GENERAL',
      seccion:  iSec>=0?r[iSec].trim().toUpperCase():'GENERAL',
      numSec:   iNumSec>=0?r[iNumSec].trim():'',
      goa:      iGoa>=0?r[iGoa].trim().toUpperCase():'',
      marca:    iMarca>=0?r[iMarca].trim().toUpperCase():'SIN MARCA',
      norma:    iNorma>=0?r[iNorma].trim().toUpperCase():'',
      canal:    iCanal>=0?r[iCanal].trim().toUpperCase():'SIN CANAL',
      pago:     iPago>=0?r[iPago].trim().toUpperCase():'',
      fecha, year,
      ventaP, ventaU:num(iVU>=0?r[iVU]:0),
      mg:num(iMG>=0?r[iMG]:0),
      utilidad:num(iUtil>=0?r[iUtil]:0),
      markdown:num(iMD>=0?r[iMD]:0),
    });
  }
  return out;
};

const parseInvCSV = text => {
  const sep=text.includes('\t')?'\t':text.includes(';')?';':',';
  const rows=text.split('\n').map(r=>parseCSVRow(r,sep));
  if(rows.length<2) return [];
  const H=rows[0].map(h=>h.toUpperCase().trim().replace(/\s+/g,'_'));
  const idx=(...ns)=>ns.map(n=>H.findIndex(h=>h===n||h.includes(n))).find(i=>i>=0)??-1;
  const iDiv=idx('DIVISION','DIV');
  const iSec=idx('SECCION');
  const iGoa=idx('GOA','FAMILIA');
  const iMarca=idx('MARCA','PROVEEDOR');
  const iNorma=idx('NORMA','TIPO_COMPRA');
  const iUbic=idx('UBICACION','CENTRO','TIENDA','BODEGA');
  const iTipo=idx('TIPO_UBICACION','TIPO_CENTRO','TIPO');
  const iOH=idx('OH','ON_HAND','INVENTARIO');
  const iOO=idx('OO','ON_ORDER','PEDIDO');
  const iCV=idx('COSTO_VENDIDO','COSTO');
  const iUV=idx('UTILIDAD_VENDIDA','UTIL_VENDIDA');
  const iComp=idx('COMPRADO','COMPRA_TOTAL');
  const iNac=idx('NACIONAL','NAC');
  const iImp=idx('IMPORTACION','IMP');
  const iVRef=idx('VENTA','VENTAS');

  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(!r||r.every(c=>!c)) continue;
    const ubicRaw=iUbic>=0?r[iUbic].trim():'';
    // Auto-detect tipo: "S" prefix = logístico, else use column or name heuristic
    let tipo=iTipo>=0?r[iTipo].trim().toUpperCase():'';
    if(!tipo){
      const u=ubicRaw.toUpperCase();
      if(u.startsWith('S-')||u.startsWith('S ')) tipo='LOGISTICO';
      else if(u.includes('BODEGA')||u.includes('BDG')) tipo='BODEGA';
      else if(u.includes('PLAN')||u.startsWith('P-')) tipo='PLAN';
      else tipo='TIENDA';
    }
    const oh=num(iOH>=0?r[iOH]:0);
    out.push({
      division:iDiv>=0?r[iDiv].trim().toUpperCase():'',
      seccion:iSec>=0?r[iSec].trim().toUpperCase():'',
      goa:iGoa>=0?r[iGoa].trim().toUpperCase():'',
      marca:iMarca>=0?r[iMarca].trim().toUpperCase():'',
      norma:iNorma>=0?r[iNorma].trim().toUpperCase():'',
      ubicacion:ubicRaw,tipo,
      oh, oo:num(iOO>=0?r[iOO]:0),
      costoVendido:num(iCV>=0?r[iCV]:0),
      utilidadVendida:num(iUV>=0?r[iUV]:0),
      comprado:num(iComp>=0?r[iComp]:0),
      nacional:num(iNac>=0?r[iNac]:0),
      importacion:num(iImp>=0?r[iImp]:0),
      ventaRef:num(iVRef>=0?r[iVRef]:0),
    });
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function ModuleDaily(){
  const gState=useGlobal();
  const theme=gState?.theme||'light';
  const isDark=theme==='dark';
  const [activeTab,setActiveTab]=useState(0);

  const themes={
    dark:{
      appBg:'bg-transparent text-gray-100',card:'bg-zinc-900 border-zinc-800 shadow-sm',
      cardInner:'bg-zinc-950 border-zinc-800',textMain:'text-white',textMuted:'text-gray-400',
      textAccent1:'text-emerald-400',textAccent2:'text-teal-400',border:'border-zinc-800',
      input:'bg-zinc-950 border-zinc-700 text-white focus:ring-emerald-500',
      btnPrimary:'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]',
      btnSecondary:'bg-teal-700 text-white hover:bg-teal-600',
      btnGhost:'bg-zinc-800 text-gray-300 hover:text-white hover:bg-zinc-700 border-zinc-700',
      tabActive:'border-emerald-500 text-emerald-400',
      badge:'bg-emerald-900/30 text-emerald-400 border-emerald-500/40',
      badgeTeal:'bg-teal-900/30 text-teal-400 border-teal-500/40',
      badgeAmber:'bg-amber-900/30 text-amber-400 border-amber-500/40',
      badgeRed:'bg-red-900/30 text-red-400 border-red-500/40',
    },
    light:{
      appBg:'bg-transparent text-gray-800',card:'bg-white border-gray-200 shadow-sm',
      cardInner:'bg-gray-50 border-gray-200',textMain:'text-gray-900',textMuted:'text-gray-500',
      textAccent1:'text-emerald-600',textAccent2:'text-teal-600',border:'border-gray-200',
      input:'bg-white border-gray-300 text-gray-900 focus:ring-emerald-500',
      btnPrimary:'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md',
      btnSecondary:'bg-teal-600 text-white hover:bg-teal-700 shadow-md',
      btnGhost:'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 border-gray-200',
      tabActive:'border-emerald-500 text-emerald-600',
      badge:'bg-emerald-50 text-emerald-700 border-emerald-200',
      badgeTeal:'bg-teal-50 text-teal-700 border-teal-200',
      badgeAmber:'bg-amber-50 text-amber-700 border-amber-200',
      badgeRed:'bg-red-50 text-red-700 border-red-200',
    },
  };
  const t=themes[theme]||themes.light;

  // ── Refs ──
  const salesRef=useRef(null);
  const invRef=useRef(null);

  // ── Data ──
  const [allData,setAllData]=useState([]);
  const [invData,setInvData]=useState([]);

  // ── Años disponibles ──
  const years=useMemo(()=>[...new Set(allData.map(r=>r.year))].sort((a,b)=>b-a),[allData]);
  const tyYear=useMemo(()=>years[0]||new Date().getFullYear(),[years]);
  const lyYear=useMemo(()=>years[1]||tyYear-1,[years,tyYear]);

  // ── Filters ──
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [fCanal,setFCanal]=useState('ALL');
  const [fDiv,setFDiv]=useState('ALL');
  const [fSec,setFSec]=useState('ALL');
  const [fMarca,setFMarca]=useState('ALL');
  const [fNorma,setFNorma]=useState('ALL');
  const [fPago,setFPago]=useState('ALL');

  // ── Forecast overrides ──
  const [fcstOverridePct,setFcstOverridePct]=useState(0);   // promo override %
  const [fcstDowAdd,setFcstDowAdd]=useState(0);              // extra days (positive=add, negative=remove)
  const [fcstDowType,setFcstDowType]=useState(6);            // 0=Lun..6=Dom
  const [showFcstConfig,setShowFcstConfig]=useState(false);

  // ── Scatter desag ──
  const SCATTER_LEVELS=['SECCION','GOA','MARCA','NORMA'];
  const [scatterLevel,setScatterLevel]=useState(0);

  // ── Persist ──
  useEffect(()=>{
    try{
      const s=localStorage.getItem('gop_daily');
      if(s){
        const d=JSON.parse(s);
        if(d.allData?.length) setAllData(d.allData.map(r=>({...r,fecha:r.fecha?new Date(r.fecha):null})));
        if(d.invData?.length) setInvData(d.invData);
        if(d.dateFrom) setDateFrom(d.dateFrom);
        if(d.dateTo)   setDateTo(d.dateTo);
        if(d.fCanal)   setFCanal(d.fCanal);
        if(d.fDiv)     setFDiv(d.fDiv);
        if(d.fSec)     setFSec(d.fSec);
        if(d.fMarca)   setFMarca(d.fMarca);
        if(d.fNorma)   setFNorma(d.fNorma);
        if(d.fPago)    setFPago(d.fPago);
      }
    }catch{}
  },[]);

  useEffect(()=>{
    try{ localStorage.setItem('gop_daily',JSON.stringify({allData,invData,dateFrom,dateTo,fCanal,fDiv,fSec,fMarca,fNorma,fPago})); }
    catch{}
  },[allData,invData,dateFrom,dateTo,fCanal,fDiv,fSec,fMarca,fNorma,fPago]);

  // ── Upload handlers ──
  const handleSalesUpload=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ setAllData(parseSalesCSV(ev.target.result)); e.target.value=''; };
    reader.readAsText(file,'UTF-8');
  };
  const handleInvUpload=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ setInvData(parseInvCSV(ev.target.result)); e.target.value=''; };
    reader.readAsText(file,'UTF-8');
  };

  // ── Filter logic ──
  const applyFilters=useCallback((rows,year)=>
    rows.filter(r=>
      r.year===year &&
      (fCanal==='ALL'||r.canal===fCanal)&&
      (fDiv==='ALL'||r.division===fDiv)&&
      (fSec==='ALL'||r.seccion===fSec)&&
      (fMarca==='ALL'||r.marca===fMarca)&&
      (fNorma==='ALL'||r.norma===fNorma)&&
      (fPago==='ALL'||r.pago===fPago)&&
      (!dateFrom||!r.fecha||r.fecha>=new Date(dateFrom+'T00:00:00'))&&
      (!dateTo||!r.fecha||r.fecha<=new Date(dateTo+'T23:59:59'))
    ),[fCanal,fDiv,fSec,fMarca,fNorma,fPago,dateFrom,dateTo]);

  const applyInvFilters=useCallback(rows=>
    rows.filter(r=>
      (fDiv==='ALL'||r.division===fDiv)&&
      (fSec==='ALL'||r.seccion===fSec)&&
      (fMarca==='ALL'||r.marca===fMarca)&&
      (fNorma==='ALL'||r.norma===fNorma)
    ),[fDiv,fSec,fMarca,fNorma]);

  const tyData=useMemo(()=>applyFilters(allData,tyYear),[allData,tyYear,applyFilters]);
  const lyData=useMemo(()=>applyFilters(allData,lyYear),[allData,lyYear,applyFilters]);
  const filtInv=useMemo(()=>applyInvFilters(invData),[invData,applyInvFilters]);

  // Opciones de filtros
  const opts=useMemo(()=>{
    const s=k=>[...new Set(allData.map(r=>r[k]).filter(Boolean))].sort();
    return {canal:s('canal'),div:s('division'),sec:s('seccion'),marca:s('marca'),norma:s('norma'),pago:s('pago')};
  },[allData]);

  // ── Aggregate ──
  const agg=useCallback(rows=>{
    const ventaP=rows.reduce((s,r)=>s+r.ventaP,0);
    const ventaU=rows.reduce((s,r)=>s+r.ventaU,0);
    const utilidad=rows.reduce((s,r)=>s+r.utilidad,0);
    const markdown=rows.reduce((s,r)=>s+r.markdown,0);
    const mgPct=ventaP>0?(utilidad/ventaP)*100:0;
    const atv=ventaP>0&&ventaU>0?ventaP/ventaU:0;
    return {ventaP,ventaU,utilidad,markdown,mgPct,atv};
  },[]);

  const kpiTY=useMemo(()=>agg(tyData),[tyData,agg]);
  const kpiLY=useMemo(()=>agg(lyData),[lyData,agg]);

  const lastDateTY=useMemo(()=>{
    const dates=tyData.map(r=>r.fecha).filter(Boolean);
    return dates.length?new Date(Math.max(...dates)):null;
  },[tyData]);

  const kpiDayTY=useMemo(()=>{
    if(!lastDateTY) return agg([]);
    return agg(tyData.filter(r=>r.fecha&&r.fecha.toDateString()===lastDateTY.toDateString()));
  },[tyData,lastDateTY,agg]);

  const kpiDayLY=useMemo(()=>{
    if(!lastDateTY) return agg([]);
    // Mismo mes+día año anterior
    const lyRef=new Date(lastDateTY); lyRef.setFullYear(lyYear);
    return agg(lyData.filter(r=>r.fecha&&r.fecha.toDateString()===lyRef.toDateString()));
  },[lyData,lastDateTY,lyYear,agg]);

  // ── Forecast ──
  const forecastMes=useMemo(()=>{
    if(!tyData.length||!lastDateTY) return null;
    const now=lastDateTY;
    const diaActual=now.getDate();
    const diasMes=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();

    // Días restantes del mes
    let diasRestantes=diasMes-diaActual;

    // Ajuste por día de semana extra/faltante
    // fcstDowAdd: cuántos días tipo fcstDowType se agregan (+) o quitan (-)
    const DOW_NAMES=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    // Promedio de venta por ese día de semana (TY)
    const ventaDow=tyData.filter(r=>r.fecha&&((r.fecha.getDay()+6)%7)===fcstDowType)
      .reduce((s,r)=>s+r.ventaP,0);
    const countDow=tyData.filter(r=>r.fecha&&((r.fecha.getDay()+6)%7)===fcstDowType).length;
    const avgDow=countDow>0?ventaDow/countDow:0;
    const dowAdjustment=fcstDowAdd*avgDow; // puede ser negativo

    // Run rate
    const runRate=diaActual>0?kpiTY.ventaP/diaActual:0;
    const runRateU=diaActual>0?kpiTY.ventaU/diaActual:0;

    // Tendencia 7 días recientes
    const rec=tyData.filter(r=>r.fecha&&r.fecha>=new Date(now.getTime()-7*86400000));
    const rr7=rec.length>0?rec.reduce((s,r)=>s+r.ventaP,0)/Math.max(1,[...new Set(rec.map(r=>r.fecha?.toDateString()))].length):runRate;

    // LY mismo mes completo
    const lyMesRows=lyData.filter(r=>{
      if(!r.fecha) return false;
      const ref=new Date(now); ref.setFullYear(lyYear);
      return r.fecha.getMonth()===ref.getMonth()&&r.fecha.getFullYear()===lyYear;
    });
    const lyMesTotal=lyMesRows.reduce((s,r)=>s+r.ventaP,0);
    const lyMesDias=[...new Set(lyMesRows.map(r=>r.fecha?.toDateString()))].length||diasMes;
    const lyRunRate=lyMesDias>0?lyMesTotal/lyMesDias:0;

    // Crecimiento vs LY
    const crecLY=lyRunRate>0?(runRate/lyRunRate)-1:0;

    // Override promo %
    const overrideFactor=1+(fcstOverridePct/100);

    const project=(rr,factor=1)=>{
      const base=kpiTY.ventaP+(rr*diasRestantes*factor)+dowAdjustment;
      return Math.max(0,base)*overrideFactor;
    };

    const cons=project(runRate,0.85);
    const neut=project(rr7,1.0);
    const risk=project(rr7*(1+Math.max(0,crecLY)),1.0);

    const mgEst=v=>v>0?kpiTY.utilidad+(v-kpiTY.ventaP)*(kpiTY.mgPct/100):0;
    const uEst=v=>v>0?kpiTY.ventaU+(v-kpiTY.ventaP)/(kpiTY.ventaP/Math.max(1,kpiTY.ventaU)):kpiTY.ventaU;

    return {
      diaActual,diasMes,diasRestantes,runRate,lyMesTotal,crecLY,dowAdjustment,
      DOW_NAMES,avgDow,
      cons:{ventaP:cons,ventaU:uEst(cons),mg:mgEst(cons)},
      neut:{ventaP:neut,ventaU:uEst(neut),mg:mgEst(neut)},
      risk:{ventaP:risk,ventaU:uEst(risk),mg:mgEst(risk)},
    };
  },[tyData,lyData,lastDateTY,kpiTY,lyYear,fcstOverridePct,fcstDowAdd,fcstDowType]);

  // ── Serie diaria TY+LY ──
  const serieDiaria=useMemo(()=>{
    const map={};
    tyData.forEach(r=>{
      if(!r.fecha) return;
      const k=r.fecha.toISOString().slice(0,10);
      if(!map[k]) map[k]={fecha:k,ty:0,ly:null};
      map[k].ty+=r.ventaP;
    });
    lyData.forEach(r=>{
      if(!r.fecha) return;
      // shift LY → TY calendar
      const shifted=new Date(r.fecha); shifted.setFullYear(tyYear);
      const k=shifted.toISOString().slice(0,10);
      if(!map[k]) map[k]={fecha:k,ty:0,ly:0};
      map[k].ly=(map[k].ly||0)+r.ventaP;
    });
    return Object.values(map).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  },[tyData,lyData,tyYear]);

  // ── Heatmap ──
  const heatmapData=useMemo(()=>{
    const DOW=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const map={};
    tyData.forEach(r=>{
      if(!r.fecha) return;
      const d=(r.fecha.getDay()+6)%7; // 0=Lun
      const w=Math.floor((r.fecha.getDate()-1)/7)+1;
      const k=`${d}-${w}`;
      if(!map[k]) map[k]={dow:d,week:w,label:DOW[d],ventaP:0};
      map[k].ventaP+=r.ventaP;
    });
    return Object.values(map);
  },[tyData]);

  // ── By key ──
  const byKey=useCallback((rows,key)=>{
    const map={};
    rows.forEach(r=>{
      const k=r[key]||'N/D';
      if(!map[k]) map[k]={key:k,ventaP:0,ventaU:0,utilidad:0,markdown:0};
      map[k].ventaP+=r.ventaP; map[k].ventaU+=r.ventaU;
      map[k].utilidad+=r.utilidad; map[k].markdown+=r.markdown;
    });
    return Object.values(map).map(g=>({...g,mgPct:g.ventaP>0?(g.utilidad/g.ventaP)*100:0}))
      .sort((a,b)=>b.ventaP-a.ventaP);
  },[]);

  const byCanal=useMemo(()=>byKey(tyData,'canal'),[tyData,byKey]);
  const byDiv=useMemo(()=>byKey(tyData,'division'),[tyData,byKey]);
  const bySec=useMemo(()=>byKey(tyData,'seccion'),[tyData,byKey]);
  const byMarca=useMemo(()=>byKey(tyData,'marca'),[tyData,byKey]);
  const byPago=useMemo(()=>byKey(tyData,'pago'),[tyData,byKey]);
  const byNorma=useMemo(()=>byKey(tyData,'norma'),[tyData,byKey]);

  // ── Inventario KPIs ──
  const invKPI=useMemo(()=>{
    const oh=filtInv.reduce((s,r)=>s+r.oh,0);
    const oo=filtInv.reduce((s,r)=>s+r.oo,0);
    const costoV=filtInv.reduce((s,r)=>s+r.costoVendido,0);
    const utilV=filtInv.reduce((s,r)=>s+r.utilidadVendida,0);
    const comprado=filtInv.reduce((s,r)=>s+r.comprado,0);
    const nacional=filtInv.reduce((s,r)=>s+r.nacional,0);
    const importacion=filtInv.reduce((s,r)=>s+r.importacion,0);
    const ventaRef=filtInv.reduce((s,r)=>s+r.ventaRef,0)||kpiTY.ventaP;
    const st=(oh+ventaRef)>0?ventaRef/(oh+ventaRef)*100:0;
    const cob=kpiTY.ventaP>0&&lastDateTY?oh/(kpiTY.ventaP/lastDateTY.getDate()):0;
    return {oh,oo,total:oh+oo,costoV,utilV,comprado,nacional,importacion,ventaRef,st,cob};
  },[filtInv,kpiTY,lastDateTY]);

  // ── Scatter data (reactive to level + filters) ──
  const SCATTER_KEY=['seccion','goa','marca','norma'];
  const scatterData=useMemo(()=>{
    const key=SCATTER_KEY[scatterLevel];
    const salesMap={};
    tyData.forEach(r=>{
      const k=r[key]||'N/D';
      if(!salesMap[k]) salesMap[k]={ventaP:0,ventaU:0};
      salesMap[k].ventaP+=r.ventaP; salesMap[k].ventaU+=r.ventaU;
    });
    const invMap={};
    filtInv.forEach(r=>{
      const k=r[key]||'N/D';
      if(!invMap[k]) invMap[k]={oh:0,oo:0};
      invMap[k].oh+=r.oh; invMap[k].oo+=r.oo;
    });
    return Object.keys({...salesMap,...invMap}).map(k=>({
      name:k, x:salesMap[k]?.ventaP||0, y:(invMap[k]?.oh||0)+(invMap[k]?.oo||0),
    })).filter(p=>p.x>0||p.y>0);
  },[tyData,filtInv,scatterLevel]);

  const scatterReg=useMemo(()=>scatterData.length>=3?linearRegression(scatterData):null,[scatterData]);

  // ── Inv por tipo ──
  const invByTipo=useMemo(()=>{
    const map={};
    filtInv.forEach(r=>{
      const k=r.tipo||'OTRO';
      if(!map[k]) map[k]={tipo:k,oh:0,oo:0,ubicaciones:new Set()};
      map[k].oh+=r.oh; map[k].oo+=r.oo; map[k].ubicaciones.add(r.ubicacion);
    });
    return Object.values(map).map(v=>({...v,ubicaciones:v.ubicaciones.size}))
      .sort((a,b)=>b.oh-a.oh);
  },[filtInv]);

  // Resultado final: venta + costo inv para mg real
  const resultadoFinal=useMemo(()=>{
    const venta=kpiTY.ventaP;
    const costo=invKPI.costoV||venta*(1-kpiTY.mgPct/100);
    const util=kpiTY.utilidad||venta-costo;
    const mgFinal=venta>0?util/venta*100:0;
    return {venta,costo,util,mgFinal,markdown:kpiTY.markdown};
  },[kpiTY,invKPI]);

  // ── Chart config ──
  const gridC=isDark?'#27272a':'#f0f0f0';
  const axisC=isDark?'#52525b':'#d1d5db';
  const txtC=isDark?'#a1a1aa':'#6b7280';

  const TTip=({active,payload,label})=>{
    if(!active||!payload?.length) return null;
    return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>
      <p className={`font-bold mb-1 ${t.textMain}`}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmtM(p.value)}</p>)}
    </div>;
  };

  // ── TabStyle ──
  const tabStyle=n=>`px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
    activeTab===n?t.tabActive:`border-transparent ${t.textMuted}`}`;

  // ── Filter Bar ──
  const FilterBar=()=>(
    <div className={`flex flex-wrap gap-2 p-3 rounded-xl border ${t.cardInner}`}>
      <DateRangePicker from={dateFrom} to={dateTo}
        onChange={({from,to})=>{setDateFrom(from);setDateTo(to);}} t={t} isDark={isDark}/>
      {[
        {label:'Canal',val:fCanal,set:setFCanal,ops:opts.canal},
        {label:'División',val:fDiv,set:setFDiv,ops:opts.div},
        {label:'Sección',val:fSec,set:setFSec,ops:opts.sec},
        {label:'Marca',val:fMarca,set:setFMarca,ops:opts.marca},
        {label:'Norma',val:fNorma,set:setFNorma,ops:opts.norma},
        {label:'Pago',val:fPago,set:setFPago,ops:opts.pago},
      ].map(({label,val,set,ops})=>(
        <select key={label} value={val} onChange={e=>set(e.target.value)}
          className={`text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
          {['ALL',...ops].map(o=><option key={o} value={o}>{o==='ALL'?`${label}: Todos`:o}</option>)}
        </select>
      ))}
      {(fCanal!=='ALL'||fDiv!=='ALL'||fSec!=='ALL'||fMarca!=='ALL'||fNorma!=='ALL'||fPago!=='ALL'||dateFrom||dateTo)&&(
        <button onClick={()=>{setFCanal('ALL');setFDiv('ALL');setFSec('ALL');setFMarca('ALL');setFNorma('ALL');setFPago('ALL');setDateFrom('');setDateTo('');}}
          className={`text-xs px-3 py-1.5 rounded-lg border font-bold ${t.btnGhost}`}>✕ Limpiar</button>
      )}
    </div>
  );

  // ── KPI Strip (fixed bar) ──
  const KPIStrip=()=>(
    <div className={`grid grid-cols-2 md:grid-cols-6 gap-2`}>
      {[
        {label:'Venta TY',val:fmtM(kpiTY.ventaP),d:delta(kpiTY.ventaP,kpiLY.ventaP),color:'text-emerald-400'},
        {label:`vs LY (${lyYear})`,val:fmtM(kpiLY.ventaP),d:null,color:t.textMuted},
        {label:'MG %',val:fmtP(kpiTY.mgPct),d:null,color:kpiTY.mgPct>=45?'text-emerald-400':kpiTY.mgPct>=35?'text-amber-400':'text-red-400'},
        {label:'Utilidad',val:fmtM(kpiTY.utilidad),d:null,color:'text-teal-400'},
        {label:'Markdowns',val:fmtM(kpiTY.markdown),d:null,color:'text-amber-400'},
        {label:'ATV',val:fmtM(kpiTY.atv),d:null,color:t.textAccent1,sub:'ticket promedio'},
      ].map(({label,val,d,color,sub})=>(
        <div key={label} className={`p-3 rounded-xl border ${t.cardInner}`}>
          <div className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-0.5`}>{label}</div>
          <div className={`text-base font-black ${color}`}>{val}</div>
          {sub&&<div className={`text-[9px] ${t.textMuted}`}>{sub}</div>}
          {d!=null&&<DeltaBadge value={d}/>}
        </div>
      ))}
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
              <span className={`p-2 rounded-xl ${isDark?'bg-emerald-500/20':'bg-emerald-50'}`}>
                <Icons.BarChart2 size={22} className={t.textAccent1}/>
              </span>
              Daily
            </h1>
            <p className={`text-xs mt-1 ml-10 ${t.textMuted}`}>
              Desempeño diario · Venta, margen e inventario · {tyYear} vs {lyYear}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={salesRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleSalesUpload}/>
            <button onClick={()=>salesRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Upload size={14}/> CSV Ventas
            </button>
            <input ref={invRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleInvUpload}/>
            <button onClick={()=>invRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost}`}>
              <Icons.Package size={14}/> CSV Inventario
            </button>
            {allData.length>0&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badge}`}>{allData.length.toLocaleString()} registros</span>}
            {invData.length>0&&<span className={`px-3 py-1 rounded-full text-[10px] font-black border ${t.badgeAmber}`}>Inv: {invData.length.toLocaleString()}</span>}
            {(allData.length||invData.length)>0&&(
              <button onClick={()=>{if(window.confirm('¿Borrar datos?')){setAllData([]);setInvData([]);localStorage.removeItem('gop_daily');}}}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${t.btnGhost} opacity-40 hover:opacity-100`}>
                <Icons.Trash2 size={14}/>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className={`rounded-2xl border overflow-hidden ${t.card}`}>
        <div className={`flex border-b ${t.border} px-2 overflow-x-auto`}>
          <button className={tabStyle(0)} onClick={()=>setActiveTab(0)}>📈 Sales Daily</button>
          <button className={tabStyle(1)} onClick={()=>setActiveTab(1)}>📦 Inventory & Buying</button>
        </div>

        {/* ══════════ TAB 0 — SALES DAILY ══════════ */}
        {activeTab===0&&(
          <div className="p-5 space-y-5">
            {!hasData?(
              <EmptyState icon={Icons.TrendingUp} t={t} title="Sin datos" sub="Carga el CSV de ventas desde el encabezado."/>
            ):(
              <>
                <FilterBar/>

                {/* KPI strip fija */}
                <KPIStrip/>

                {/* Semáforos + DÍA */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Semáforos */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Semáforos</h4>
                    <div className="space-y-2.5">
                      {[
                        {label:'Venta TY vs LY',ok:delta(kpiTY.ventaP,kpiLY.ventaP)>=0,txt:delta(kpiTY.ventaP,kpiLY.ventaP)!=null?`${delta(kpiTY.ventaP,kpiLY.ventaP).toFixed(1)}%`:'Sin LY'},
                        {label:'MG ≥ 40%',ok:kpiTY.mgPct>=40,txt:fmtP(kpiTY.mgPct)},
                        {label:'Markdown < 5% venta',ok:kpiTY.ventaP>0&&kpiTY.markdown/kpiTY.ventaP<0.05,txt:kpiTY.ventaP>0?fmtP(kpiTY.markdown/kpiTY.ventaP*100):'N/D'},
                        {label:`Día TY vs Día LY (${lastDateTY?fmtDate(lastDateTY):'-'})`,ok:delta(kpiDayTY.ventaP,kpiDayLY.ventaP)>=0,txt:delta(kpiDayTY.ventaP,kpiDayLY.ventaP)!=null?`${delta(kpiDayTY.ventaP,kpiDayLY.ventaP).toFixed(1)}%`:'N/D'},
                        {label:'Sell Through ≥ 60%',ok:invData.length?invKPI.st>=60:null,txt:invData.length?fmtP(invKPI.st):'Sin inv'},
                      ].map(({label,ok,txt})=>(
                        <div key={label} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2"><SemaforoCircle ok={ok}/><span className={`text-xs ${t.textMuted}`}>{label}</span></div>
                          <span className={`text-xs font-black font-mono ${ok===true?'text-emerald-400':ok===false?'text-red-400':'text-amber-400'}`}>{txt}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Comparativo día */}
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Último Día · Acumulado</h4>
                    <div className="space-y-3">
                      {[
                        {label:'Venta $',ty:kpiTY.ventaP,ly:kpiLY.ventaP},
                        {label:'Piezas', ty:kpiTY.ventaU,ly:kpiLY.ventaU},
                        {label:'Utilidad',ty:kpiTY.utilidad,ly:kpiLY.utilidad},
                      ].map(({label,ty,ly})=>{
                        const d=delta(ty,ly);
                        const mx=Math.max(ty,ly,1);
                        return(
                          <div key={label}>
                            <div className="flex justify-between mb-1">
                              <span className={`text-[10px] font-bold ${t.textMuted}`}>{label}</span>
                              <DeltaBadge value={d}/>
                            </div>
                            <div className="relative h-3.5 rounded-full overflow-hidden bg-gray-200/20">
                              <div className="absolute left-0 top-0 h-full rounded-full bg-gray-400/30" style={{width:`${(ly/mx)*100}%`}}/>
                              <div className="absolute left-0 top-0 h-full rounded-full bg-emerald-500/70" style={{width:`${(ty/mx)*100}%`}}/>
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[9px] text-emerald-400 font-mono">{label==='Piezas'?fmt(ty):fmtM(ty)} TY</span>
                              <span className={`text-[9px] ${t.textMuted} font-mono`}>{label==='Piezas'?fmt(ly):fmtM(ly)} LY</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Gráfica línea */}
                {serieDiaria.length>1&&(
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>📈 Tendencia Diaria TY vs LY</h4>
                    <ResponsiveContainer width="100%" height={230}>
                      <LineChart data={serieDiaria}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                        <XAxis dataKey="fecha" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>v?.slice(5)}/>
                        <YAxis tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                        <Tooltip content={<TTip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                        {lyData.length>0&&<Line type="monotone" dataKey="ly" name={`LY (${lyYear})`} stroke={axisC} dot={false} strokeWidth={1.5} strokeDasharray="4 2"/>}
                        <Line type="monotone" dataKey="ty" name={`TY (${tyYear})`} stroke="#10b981" dot={false} strokeWidth={2.5} activeDot={{r:4}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Barras canal + división */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>Por Canal</h4>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={byCanal.slice(0,6)} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                        <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                        <YAxis type="category" dataKey="key" tick={{fontSize:9,fill:txtC}} stroke={axisC} width={80}/>
                        <Tooltip content={<TTip/>}/>
                        <Bar dataKey="ventaP" name="Venta $" fill="#10b981" radius={[0,4,4,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>Por División</h4>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={byDiv.slice(0,6)} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                        <XAxis type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
                        <YAxis type="category" dataKey="key" tick={{fontSize:9,fill:txtC}} stroke={axisC} width={80}/>
                        <Tooltip content={<TTip/>}/>
                        <Bar dataKey="ventaP" name="Venta $" fill="#14b8a6" radius={[0,4,4,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tipo de Pago + Norma */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Tipo de Pago</h4>
                    <div className="space-y-2">
                      {byPago.map((p,i)=>{
                        const maxV=byPago[0]?.ventaP||1;
                        return(
                          <div key={p.key}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`text-xs font-bold ${t.textMain}`}>{p.key}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] ${t.textMuted}`}>{fmtP(p.ventaP/kpiTY.ventaP*100)}</span>
                                <span className={`text-xs font-mono text-emerald-400`}>{fmtM(p.ventaP)}</span>
                              </div>
                            </div>
                            <MiniBar value={p.ventaP} max={maxV} color={['bg-emerald-500','bg-teal-500','bg-blue-500','bg-purple-500'][i%4]} isDark={isDark}/>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Por Norma de Compra</h4>
                    <div className="space-y-2">
                      {byNorma.map((p,i)=>{
                        const maxV=byNorma[0]?.ventaP||1;
                        return(
                          <div key={p.key}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`text-xs font-bold ${t.textMain}`}>{p.key}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] ${t.textMuted}`}>{fmtP(p.ventaP/kpiTY.ventaP*100)}</span>
                                <span className={`text-xs font-mono text-amber-400`}>{fmtM(p.ventaP)}</span>
                              </div>
                            </div>
                            <MiniBar value={p.ventaP} max={maxV} color={['bg-amber-500','bg-orange-500','bg-yellow-500'][i%3]} isDark={isDark}/>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Heatmap */}
                {heatmapData.length>0&&(
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>🗓️ Heatmap — Venta por Día de Semana</h4>
                    {(()=>{
                      const DOW=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
                      const weeks=[1,2,3,4,5];
                      const maxV=Math.max(...heatmapData.map(d=>d.ventaP),1);
                      return(
                        <div className="grid gap-1" style={{gridTemplateColumns:`50px repeat(5,1fr)`}}>
                          <div/>
                          {weeks.map(w=><div key={w} className={`text-center text-[9px] font-black ${t.textMuted}`}>Sem {w}</div>)}
                          {DOW.map((d,di)=>(
                            <React.Fragment key={d}>
                              <div className={`text-[9px] font-black ${t.textMuted} flex items-center`}>{d}</div>
                              {weeks.map(w=>{
                                const cell=heatmapData.find(h=>h.dow===di&&h.week===w);
                                const intensity=cell?cell.ventaP/maxV:0;
                                return(
                                  <div key={w} title={cell?fmtM(cell.ventaP):''}
                                    className="h-8 rounded-lg flex items-center justify-center text-[9px] font-bold"
                                    style={{background:cell?`rgba(16,185,129,${0.1+intensity*0.85})`:(isDark?'rgba(39,39,42,0.5)':'rgba(243,244,246,0.8)'),color:intensity>0.5?'white':(isDark?'#a1a1aa':'#9ca3af')}}>
                                    {cell?'$'+(cell.ventaP/1000).toFixed(0)+'k':'·'}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Tablas marca + sección */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[{title:'Top Marcas',data:byMarca},{title:'Por Sección',data:bySec}].map(({title,data})=>(
                    <div key={title} className={`p-4 rounded-xl border ${t.cardInner}`}>
                      <h4 className={`text-sm font-bold mb-3 ${t.textMain}`}>{title}</h4>
                      <div className="overflow-x-auto custom-scrollbar max-h-[240px]">
                        <table className="w-full text-left text-xs min-w-max">
                          <thead>
                            <tr className={`text-[9px] uppercase font-black tracking-widest sticky top-0 ${isDark?'bg-zinc-950 text-gray-400 border-b border-zinc-800':'bg-gray-50 text-gray-500 border-b border-gray-200'}`}>
                              {['Nombre','Venta $','PZS','MG%','MD'].map(h=><th key={h} className="p-2 whitespace-nowrap">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark?'divide-zinc-800/50':'divide-gray-100'}`}>
                            {data.slice(0,12).map((r,i)=>(
                              <tr key={i} className={`transition-colors ${isDark?'hover:bg-zinc-800/30':'hover:bg-emerald-50/30'}`}>
                                <td className={`p-2 font-bold ${t.textMain} max-w-[120px] truncate`} title={r.key}>{r.key}</td>
                                <td className="p-2 font-mono text-emerald-400">{fmtM(r.ventaP)}</td>
                                <td className={`p-2 font-mono ${t.textMuted}`}>{fmt(r.ventaU)}</td>
                                <td className={`p-2 font-bold ${r.mgPct>=45?'text-emerald-400':r.mgPct>=35?'text-amber-400':'text-red-400'}`}>{fmtP(r.mgPct)}</td>
                                <td className="p-2 font-mono text-amber-400">{fmtM(r.markdown)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resultado final */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-sm font-bold mb-4 ${t.textMain}`}>📊 Resultado del Ejercicio</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      {label:'Venta Total',val:fmtM(resultadoFinal.venta),color:'text-emerald-400'},
                      {label:'Costo Vendido',val:fmtM(resultadoFinal.costo),color:'text-red-400'},
                      {label:'Utilidad Bruta',val:fmtM(resultadoFinal.util),color:'text-teal-400'},
                      {label:'Markdowns',val:fmtM(resultadoFinal.markdown),color:'text-amber-400'},
                      {label:'MG % Final',val:fmtP(resultadoFinal.mgFinal),color:resultadoFinal.mgFinal>=45?'text-emerald-400':resultadoFinal.mgFinal>=35?'text-amber-400':'text-red-400'},
                    ].map(({label,val,color})=>(
                      <div key={label} className={`p-3 rounded-lg border ${isDark?'border-zinc-800':'border-gray-100'}`}>
                        <div className={`text-[9px] uppercase font-black ${t.textMuted}`}>{label}</div>
                        <div className={`text-base font-black ${color}`}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <p className={`text-[9px] mt-2 ${t.textMuted}`}>Costo vendido extraído del CSV de inventario cuando está disponible.</p>
                </div>

                {/* FORECAST */}
                {forecastMes&&(
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h4 className={`text-sm font-bold ${t.textMain}`}>🎯 Forecast Cierre de Mes</h4>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] ${t.textMuted}`}>
                          Día {forecastMes.diaActual}/{forecastMes.diasMes} · Run rate: {fmtM(forecastMes.runRate)}/día
                          {lyData.length>0&&forecastMes.lyMesTotal>0&&` · LY mes: ${fmtM(forecastMes.lyMesTotal)} · crec: ${fmtP(forecastMes.crecLY*100)}`}
                        </span>
                        <button onClick={()=>setShowFcstConfig(v=>!v)}
                          className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all ${t.btnGhost}`}>
                          ⚙️ {showFcstConfig?'Ocultar':'Ajustes'}
                        </button>
                      </div>
                    </div>

                    {showFcstConfig&&(
                      <div className={`mb-4 p-3 rounded-xl border ${isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'} grid grid-cols-1 md:grid-cols-3 gap-4`}>
                        <div>
                          <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>Override Promo (% sobre forecast)</label>
                          <div className="flex items-center gap-2">
                            <input type="range" min={-30} max={30} value={fcstOverridePct} onChange={e=>setFcstOverridePct(Number(e.target.value))} className="flex-1"/>
                            <span className={`text-xs font-black w-12 text-right ${fcstOverridePct>0?'text-emerald-400':fcstOverridePct<0?'text-red-400':t.textMuted}`}>
                              {fcstOverridePct>0?'+':''}{fcstOverridePct}%
                            </span>
                          </div>
                          <p className={`text-[9px] mt-1 ${t.textMuted}`}>+ si tienes promo que LY no tuvo. − si LY tuvo promo que ahora no.</p>
                        </div>
                        <div>
                          <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>Días extra/faltantes</label>
                          <div className="flex items-center gap-2">
                            <input type="range" min={-2} max={2} step={1} value={fcstDowAdd} onChange={e=>setFcstDowAdd(Number(e.target.value))} className="flex-1"/>
                            <span className={`text-xs font-black w-8 text-right ${fcstDowAdd>0?'text-emerald-400':fcstDowAdd<0?'text-red-400':t.textMuted}`}>
                              {fcstDowAdd>0?'+':''}{fcstDowAdd}
                            </span>
                          </div>
                          <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                            {fcstDowAdd!==0?`Ajuste: ${fcstDowAdd>0?'+':''}{fmtM(forecastMes.dowAdjustment)} (avg ${forecastMes.DOW_NAMES[fcstDowType]}: ${fmtM(forecastMes.avgDow)})`:'Sin ajuste de días'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} block mb-1`}>Día de semana a ajustar</label>
                          <select value={fcstDowType} onChange={e=>setFcstDowType(Number(e.target.value))}
                            className={`w-full text-xs px-3 py-1.5 rounded-lg border ${t.input} focus:outline-none focus:ring-1`}>
                            {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((d,i)=><option key={i} value={i}>{d}</option>)}
                          </select>
                          <p className={`text-[9px] mt-1 ${t.textMuted}`}>Ej: +1 Dom = suma un domingo "extra" al cierre.</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        {label:'Conservador',icon:'🛡️',s:forecastMes.cons,color:'text-blue-400',bar:'bg-blue-400'},
                        {label:'Neutral',icon:'⚖️',s:forecastMes.neut,color:'text-emerald-400',bar:'bg-emerald-400'},
                        {label:'Arriesgado',icon:'🚀',s:forecastMes.risk,color:'text-amber-400',bar:'bg-amber-400'},
                      ].map(({label,icon,s,color,bar})=>(
                        <div key={label} className={`p-4 rounded-xl border ${isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`}>
                          <div className="flex items-center gap-2 mb-2"><span>{icon}</span><span className={`text-xs font-black uppercase ${color}`}>{label}</span></div>
                          <div className={`text-2xl font-black ${color}`}>{fmtM(s.ventaP)}</div>
                          <div className={`text-[10px] ${t.textMuted} mt-0.5`}>{fmt(s.ventaU)} pzs · MG {fmtP(s.ventaP>0?s.mg/s.ventaP*100:0)}</div>
                          {lyData.length>0&&forecastMes.lyMesTotal>0&&(
                            <div className={`text-[10px] mt-1 font-bold ${delta(s.ventaP,forecastMes.lyMesTotal)>=0?'text-emerald-400':'text-red-400'}`}>
                              {delta(s.ventaP,forecastMes.lyMesTotal)>=0?'▲':'▼'} {Math.abs(delta(s.ventaP,forecastMes.lyMesTotal)).toFixed(1)}% vs LY mes
                            </div>
                          )}
                          {fcstOverridePct!==0&&<div className={`text-[9px] mt-1 ${fcstOverridePct>0?'text-emerald-400':'text-red-400'}`}>Promo: {fcstOverridePct>0?'+':''}{fcstOverridePct}% aplicado</div>}
                          <div className="mt-3"><MiniBar value={s.ventaP} max={forecastMes.risk.ventaP*1.1} color={bar} isDark={isDark} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════ TAB 1 — INVENTORY & BUYING ══════════ */}
        {activeTab===1&&(
          <div className="p-5 space-y-5">
            {!invData.length&&!allData.length?(
              <EmptyState icon={Icons.Package} t={t} title="Sin datos" sub="Carga el CSV de inventario desde el encabezado."/>
            ):(
              <>
                <FilterBar/>

                {/* KPI strip fija */}
                <KPIStrip/>

                {/* Inventario KPIs */}
                <div>
                  <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Inventario Actual</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      {label:'On Hand (OH)',val:fmt(invKPI.oh),sub:'unidades disponibles',color:'text-emerald-400'},
                      {label:'On Order (OO)',val:fmt(invKPI.oo),sub:'en tránsito/pedido',color:'text-teal-400'},
                      {label:'Total (OH+OO)',val:fmt(invKPI.total),sub:'inventario total',color:t.textAccent1},
                      {label:'Sell Through',val:fmtP(invKPI.st),sub:'venta/(OH+venta)',color:invKPI.st>=60?'text-emerald-400':invKPI.st>=40?'text-amber-400':'text-red-400'},
                    ].map(({label,val,sub,color})=>(
                      <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}>
                        <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                        <div className={`text-xl font-black ${color}`}>{val}</div>
                        <div className={`text-[9px] ${t.textMuted}`}>{sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inventario por tipo ubicación */}
                <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                  <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-4`}>Inventario por Tipo de Ubicación</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {['LOGISTICO','BODEGA','PLAN','TIENDA'].map(tipo=>{
                      const rows=filtInv.filter(r=>r.tipo===tipo);
                      const oh=rows.reduce((s,r)=>s+r.oh,0);
                      const oo=rows.reduce((s,r)=>s+r.oo,0);
                      const n=new Set(rows.map(r=>r.ubicacion)).size;
                      const colors={LOGISTICO:'text-blue-400',BODEGA:'text-purple-400',PLAN:'text-amber-400',TIENDA:'text-emerald-400'};
                      const badges={LOGISTICO:t.badgeTeal,BODEGA:'bg-purple-900/30 text-purple-400 border-purple-500/40',PLAN:t.badgeAmber,TIENDA:t.badge};
                      return(
                        <div key={tipo} className={`p-4 rounded-xl border ${isDark?'bg-zinc-900 border-zinc-700':'bg-white border-gray-200'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[9px] font-black uppercase ${colors[tipo]||t.textMuted}`}>{tipo}</span>
                            {n>0&&<span className={`text-[9px] px-2 py-0.5 rounded-full border font-black ${badges[tipo]||t.badge}`}>{n} ub.</span>}
                          </div>
                          <div className={`text-xl font-black ${colors[tipo]||t.textMain}`}>{fmt(oh)}</div>
                          <div className={`text-[9px] ${t.textMuted}`}>OH · {fmt(oo)} OO</div>
                          {(oh+oo)>0&&invKPI.total>0&&(
                            <div className="mt-2"><MiniBar value={oh+oo} max={invKPI.total} color={{LOGISTICO:'bg-blue-400',BODEGA:'bg-purple-400',PLAN:'bg-amber-400',TIENDA:'bg-emerald-400'}[tipo]||'bg-gray-400'} isDark={isDark}/></div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Detalle por ubicación individual */}
                  {(()=>{
                    const ubics={};
                    filtInv.forEach(r=>{
                      if(!ubics[r.ubicacion]) ubics[r.ubicacion]={ubicacion:r.ubicacion,tipo:r.tipo,oh:0,oo:0};
                      ubics[r.ubicacion].oh+=r.oh; ubics[r.ubicacion].oo+=r.oo;
                    });
                    const sorted=Object.values(ubics).sort((a,b)=>b.oh-a.oh);
                    const maxOH=sorted[0]?.oh||1;
                    const colorByTipo={LOGISTICO:'bg-blue-400',BODEGA:'bg-purple-400',PLAN:'bg-amber-400',TIENDA:'bg-emerald-500'};
                    if(!sorted.length) return null;
                    return(
                      <div className="space-y-2 mt-2">
                        <h5 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-2`}>Detalle por Ubicación</h5>
                        {sorted.map(u=>(
                          <div key={u.ubicacion} className="flex items-center gap-3">
                            <span className={`w-32 truncate text-[10px] font-bold text-right ${t.textMain}`} title={u.ubicacion}>{u.ubicacion}</span>
                            <div className="flex-1 relative h-5 rounded-lg overflow-hidden bg-zinc-700/20">
                              <div className={`absolute left-0 top-0 h-full rounded-lg ${colorByTipo[u.tipo]||'bg-gray-400'} opacity-70`}
                                style={{width:`${(u.oh/maxOH)*100}%`}}/>
                              <span className={`absolute left-2 top-0 h-full flex items-center text-[9px] font-black ${u.oh/maxOH>0.4?'text-white':t.textMain}`}>
                                {fmt(u.oh)} OH{u.oo>0?` · ${fmt(u.oo)} OO`:''}
                              </span>
                            </div>
                            <span className={`w-16 text-[9px] font-black text-right ${{'LOGISTICO':'text-blue-400','BODEGA':'text-purple-400','PLAN':'text-amber-400','TIENDA':'text-emerald-400'}[u.tipo]||t.textMuted}`}>{u.tipo}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Compras */}
                {invKPI.comprado>0&&(
                  <div>
                    <h3 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Compras</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {label:'Comprado Total',val:fmtM(invKPI.comprado),color:'text-blue-400'},
                        {label:'Nacional',val:fmtM(invKPI.nacional),sub:fmtP(invKPI.nacional/invKPI.comprado*100),color:'text-emerald-400'},
                        {label:'Importación',val:fmtM(invKPI.importacion),sub:fmtP(invKPI.importacion/invKPI.comprado*100),color:'text-purple-400'},
                        {label:'Cobertura',val:invKPI.cob>0?`${invKPI.cob.toFixed(0)} días`:'N/D',sub:'OH / run rate',color:invKPI.cob>60?'text-red-400':invKPI.cob>30?'text-amber-400':'text-emerald-400'},
                      ].map(({label,val,sub,color})=>(
                        <div key={label} className={`p-4 rounded-xl border ${t.cardInner}`}>
                          <div className={`text-[9px] uppercase font-black tracking-widest ${t.textMuted} mb-1`}>{label}</div>
                          <div className={`text-xl font-black ${color}`}>{val}</div>
                          {sub&&<div className={`text-[9px] ${t.textMuted}`}>{sub}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scatter con desagregación */}
                {scatterData.length>=2&&(
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h4 className={`text-sm font-bold ${t.textMain}`}>🔵 Dispersión: Venta vs Inventario</h4>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] ${t.textMuted}`}>Desagregación:</span>
                        {SCATTER_LEVELS.map((l,i)=>(
                          <button key={l} onClick={()=>setScatterLevel(i)}
                            className={`text-[10px] px-3 py-1 rounded-full border font-black transition-all ${scatterLevel===i?t.badge:t.btnGhost}`}>
                            {l}
                          </button>
                        ))}
                        {scatterReg&&(
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${scatterReg.r2>0.7?t.badge:scatterReg.r2>0.4?t.badgeAmber:t.badgeRed}`}>
                            R² = {scatterReg.r2.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <ScatterChart margin={{top:10,right:20,left:0,bottom:20}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
                        <XAxis dataKey="x" name="Venta $" type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC}
                          tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}
                          label={{value:'Venta $',position:'insideBottom',offset:-10,fontSize:10,fill:txtC}}/>
                        <YAxis dataKey="y" name="OH+OO" type="number" tick={{fontSize:9,fill:txtC}} stroke={axisC}
                          tickFormatter={v=>fmt(v)}
                          label={{value:'OH+OO',angle:-90,position:'insideLeft',fontSize:10,fill:txtC}}/>
                        <Tooltip content={({active,payload})=>{
                          if(!active||!payload?.length) return null;
                          const d=payload[0]?.payload;
                          return <div className={`p-3 rounded-xl border text-xs shadow-xl ${t.card}`}>
                            <p className={`font-bold mb-1 ${t.textMain}`}>{d?.name}</p>
                            <p className="text-emerald-400">Venta: {fmtM(d?.x)}</p>
                            <p className="text-teal-400">OH+OO: {fmt(d?.y)}</p>
                          </div>;
                        }}/>
                        <Scatter data={scatterData} fill="#10b981" fillOpacity={0.75}/>
                        {scatterReg&&(()=>{
                          const xs=scatterData.map(d=>d.x);
                          const xMin=Math.min(...xs), xMax=Math.max(...xs);
                          return <Scatter data={[{x:xMin,y:scatterReg.slope*xMin+scatterReg.intercept},{x:xMax,y:scatterReg.slope*xMax+scatterReg.intercept}]}
                            fill="none" line={{stroke:'#f59e0b',strokeWidth:2,strokeDasharray:'6 3'}} shape={()=>null} legendType="none"/>;
                        })()}
                      </ScatterChart>
                    </ResponsiveContainer>
                    <p className={`text-[9px] mt-1 ${t.textMuted}`}>
                      Puntos arriba de la línea = inventario alto vs venta (riesgo sobreinventario). Abajo = oportunidad de surtir.
                      Filtros activos se reflejan automáticamente.
                    </p>
                  </div>
                )}

                {/* ST y cobertura por división */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Sell Through por División</h4>
                    <div className="space-y-2">
                      {byDiv.map((d,i)=>{
                        const invRow=filtInv.filter(r=>r.division===d.key);
                        const ohDiv=invRow.reduce((s,r)=>s+r.oh,0);
                        const st=(ohDiv+d.ventaP)>0?d.ventaP/(ohDiv+d.ventaP)*100:null;
                        return(
                          <div key={i}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`text-[10px] font-bold ${t.textMain}`}>{d.key}</span>
                              <span className={`text-[10px] font-black ${st!=null?(st>=60?'text-emerald-400':st>=40?'text-amber-400':'text-red-400'):t.textMuted}`}>
                                {st!=null?fmtP(st):'N/D'}
                              </span>
                            </div>
                            {st!=null&&<MiniBar value={st} max={100} color={st>=60?'bg-emerald-500':st>=40?'bg-amber-400':'bg-red-400'} isDark={isDark}/>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border ${t.cardInner}`}>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${t.textMuted} mb-3`}>Cobertura por División (semanas)</h4>
                    <div className="space-y-2">
                      {byDiv.map((d,i)=>{
                        const invRow=filtInv.filter(r=>r.division===d.key);
                        const ohDiv=invRow.reduce((s,r)=>s+r.oh,0);
                        const dias=lastDateTY?lastDateTY.getDate():30;
                        const rr=d.ventaP/(dias||1);
                        const cob=rr>0?ohDiv/rr:null;
                        const sem=cob!=null?(cob/7).toFixed(1):null;
                        return(
                          <div key={i} className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold ${t.textMain} truncate max-w-[120px]`}>{d.key}</span>
                            <span className={`text-[10px] font-black ${sem!=null?(parseFloat(sem)>12?'text-red-400':parseFloat(sem)>8?'text-amber-400':'text-emerald-400'):t.textMuted}`}>
                              {sem!=null?`${sem} sem`:'N/D'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className={`text-[9px] mt-3 ${t.textMuted}`}>&gt;12 sem = riesgo. &lt;4 sem = ok.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

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

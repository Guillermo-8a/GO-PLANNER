// AboutPage.jsx — página de presentación de GO PLANNER.
// Hero 3D con scroll (HelixScene), pilares con todos los módulos, "qué resuelve" con gráficas animadas,
// formatos de archivo interactivos, preguntas frecuentes y GO-Bot.
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Download, FileSpreadsheet, Sparkles, Database, Layers, Cpu, ShieldCheck as Shield } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LineChart, Line, CartesianGrid, Tooltip } from 'recharts';
import { CSV_SCHEMAS } from './csvSchemas';
import { PILLARS, MODULE_COUNT, SOLVES, FAQS } from './about/aboutData';
import AboutBot from './about/AboutBot';

const HelixScene = lazy(() => import('./about/HelixScene'));

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); io.disconnect(); } }, { threshold });
    io.observe(el); return () => io.disconnect();
  }, [threshold]);
  return [ref, v];
}
// Progreso 0→1 del scroll a través de un elemento alto (para escenas "sticky")
function useScrollProgress(ref, intoRef) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf;
    const calc = () => {
      raf = null; const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect(), total = r.height - window.innerHeight;
      const v = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      if (intoRef) intoRef.current = v;
      setP(v);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [ref, intoRef]);
  return p;
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const band = (p, a, b) => clamp01((p - a) / (b - a)); // 0→1 entre a y b

function Reveal({ children, delay = 0, y = 28, className = '', as: Tag = 'div' }) {
  const [ref, v] = useInView(0.12);
  return (
    <Tag ref={ref} className={className}
      style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity .9s cubic-bezier(.2,.7,.2,1) ${delay}s, transform .9s cubic-bezier(.2,.7,.2,1) ${delay}s` }}>
      {children}
    </Tag>
  );
}

// Tarjeta de vidrio con brillo que sigue al cursor
function Glass({ children, className = '', style, accent = '#a78bfa' }) {
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`); };
  return (
    <div onMouseMove={onMove} className={`gp-glass ${className}`} style={{ '--acc': accent, ...style }}>
      {children}
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function NavBar({ navigate }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 40); h(); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h); }, []);
  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center px-4 pt-4 pointer-events-none">
      <nav className={`pointer-events-auto flex items-center gap-2 sm:gap-6 pl-3 pr-1.5 sm:pr-2 py-2 rounded-full border transition-all duration-500 ${scrolled ? 'bg-[#0b0812]/70 border-white/10 shadow-2xl shadow-black/50' : 'bg-white/[0.03] border-white/[0.06]'}`}
        style={{ backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)' }}>
        <a href="#top" className="flex shrink-0 items-center"><img src="/logo.png" alt="GO PLANNER" className="h-6 sm:h-7 w-auto" /></a>
        <div className="flex items-center gap-2 sm:gap-5">
          {[['Pilares', 'pilares'], [<><span className="sm:hidden">Casos</span><span className="hidden sm:inline">Qué resuelve</span></>, 'resuelve'], ['Formatos', 'formatos'], ['Preguntas', 'preguntas']].map(([l, id]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap text-[11px] sm:text-[12px] font-semibold text-zinc-400 hover:text-white transition-colors">{l}</a>
          ))}
        </div>
        <button onClick={() => navigate('/app')} className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white text-black px-3 sm:px-4 py-2 text-[11px] sm:text-[12px] font-bold hover:bg-violet-200 transition-colors">
          <span className="hidden sm:inline">Abrir app</span><span className="sm:hidden">App</span> <ArrowRight size={13} />
        </button>
      </nav>
    </div>
  );
}

// ── Hero (escena 3D con scroll) ───────────────────────────────────────────────
function Hero({ navigate }) {
  const wrap = useRef(null), pRef = useRef(0);
  const p = useScrollProgress(wrap, pRef);
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = setTimeout(() => setReady(true), 60); return () => clearTimeout(id); }, []);
  const a = 1 - band(p, 0.08, 0.3);           // titular
  const b = band(p, 0.3, 0.46) * (1 - band(p, 0.8, 0.92)); // tarjetas
  const stats = [
    { k: 'Pilares', v: '4', d: 'Financial, Demand Planner, Inventory Control y Check Coo.', pos: 'left-[4%] top-[18%]' },
    { k: 'Módulos', v: String(MODULE_COUNT), d: 'Del plan financiero al anaquel, conectados entre sí.', pos: 'right-[4%] top-[14%]' },
    { k: 'En tu equipo', v: '100%', d: 'Tus archivos se procesan en tu navegador.', pos: 'left-[6%] bottom-[12%]' },
    { k: 'BigQuery', v: 'Live', d: 'Eventos y GO-Bot leen la venta directo de la fuente.', pos: 'right-[6%] bottom-[16%]' },
  ];
  return (
    <section id="top" ref={wrap} className="relative" style={{ height: '260vh' }}>
      <div className="sticky top-0 h-screen overflow-hidden" style={{ opacity: 1 - band(p, 0.82, 0.97) }}>
        <Suspense fallback={<div className="absolute inset-0 bg-[#05030a]" />}>
          <HelixScene progressRef={pRef} />
        </Suspense>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 30% 50%, transparent 30%, rgba(5,3,10,0.85) 100%)' }} />
        {/* Legibilidad del titular: sombra a la izquierda (en móvil cubre más) */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b md:bg-gradient-to-r from-[#05030a]/90 via-[#05030a]/50 md:via-[#05030a]/20 to-transparent" style={{ opacity: a }} />

        {/* Titular */}
        <div className="absolute inset-0 flex items-center px-6 sm:px-16 lg:px-24" style={{ opacity: a, transform: `translateY(${(1 - a) * -60}px)` }}>
          <div className="max-w-2xl" style={{ opacity: ready ? 1 : 0, transform: ready ? 'none' : 'translateY(30px)', transition: 'all 1.1s cubic-bezier(.2,.7,.2,1)' }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.18em] uppercase text-violet-300">
              <Sparkles size={12} /> Planeación comercial · SBB
            </span>
            <h1 className="mt-6 font-black uppercase leading-[0.85] tracking-[-0.05em] text-white">
              <span className="block text-[clamp(72px,12vw,168px)]">GO</span>
              <span className="block text-[clamp(56px,9.5vw,136px)] gp-grad" style={{ filter: 'drop-shadow(0 0 40px rgba(139,92,246,.35))' }}>PLANNER</span>
            </h1>
            <p className="mt-6 max-w-lg text-[clamp(15px,1.4vw,18px)] leading-relaxed text-zinc-400">
              Junta los 4 pilares de PAC, buscando qué mejorar, automatizar y dar seguimiento diario en una sola herramienta que corre en cualquier navegador.
            </p>
            <div className="mt-9 flex flex-wrap gap-3 pointer-events-auto">
              <button onClick={() => navigate('/app')} className="gp-cta">Abrir GO PLANNER <ArrowRight size={16} /></button>
              <a href="#pilares" className="gp-ghost">Conoce los módulos</a>
            </div>
          </div>
        </div>

        {/* Un sistema · cuatro pilares: centrado, con tarjetas grandes y fondo sólido para leerse sobre la hélice */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none" style={{ opacity: b }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 75% 65% at 50% 50%, rgba(5,3,10,.82), rgba(5,3,10,.35) 70%, transparent)' }} />
          <p className="relative text-center text-[clamp(36px,5.5vw,76px)] font-black tracking-[-0.04em] text-white leading-[1] mb-10" style={{ textShadow: '0 4px 30px rgba(0,0,0,.7)', transform: `translateY(${(1 - b) * 30}px)` }}>
            Un sistema. <span className="gp-grad">Cuatro pilares.</span>
          </p>
          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-6xl">
            {stats.map((s, i) => (
              <div key={s.k} style={{ transform: `translateY(${(1 - b) * (50 + i * 18)}px)` }}>
                <Glass className="h-full p-6 lg:p-7 rounded-3xl text-center !bg-[#0b0814]/80" accent={['#a78bfa', '#fbbf24', '#34d399', '#22d3ee'][i]}>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: ['#c4b5fd', '#fcd34d', '#6ee7b7', '#67e8f9'][i] }}>{s.k}</p>
                  <p className="mt-2 text-5xl lg:text-6xl font-black tracking-tight text-white">{s.v}</p>
                  <p className="mt-3 text-[14px] leading-snug text-zinc-300">{s.d}</p>
                </Glass>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-500" style={{ opacity: a }}>
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase">Scroll</span>
          <ChevronDown size={18} className="animate-bounce" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-72 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #05030a)' }} />
      </div>
    </section>
  );
}

// ── Manifiesto: palabras que se encienden con el scroll ───────────────────────
function Manifesto() {
  const ref = useRef(null);
  const p = useScrollProgress(ref);
  // Entra encimada sobre la última pantalla del hero (margin -100vh) y aparece mientras el hero se disuelve: sin hueco ni brinco
  const [enter, setEnter] = useState(0);
  useEffect(() => {
    const on = () => { const r = ref.current?.getBoundingClientRect(); if (r) setEnter(clamp01(1 - r.top / (window.innerHeight * 0.3))); };
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  const words = 'Cada decisión de compra, cada traslado y cada promoción deja datos. GO PLANNER los convierte en la siguiente acción.'.split(' ');
  return (
    <section ref={ref} className="relative pointer-events-none" style={{ height: '170vh', marginTop: '-100vh' }}>
      <div className="sticky top-0 h-screen flex items-center justify-center px-6" style={{ opacity: enter, transform: `scale(${0.96 + enter * 0.04})` }}>
        <p className="max-w-5xl text-center text-[clamp(30px,5vw,68px)] font-black leading-[1.08] tracking-[-0.035em]">
          {words.map((w, i) => {
            const on = band(p, i / words.length * 0.8, (i + 1.5) / words.length * 0.8);
            const hot = /GO|PLANNER|acción\./.test(w);
            return <span key={i} style={{ color: hot ? undefined : `rgba(255,255,255,${0.12 + on * 0.88})`, opacity: hot ? 0.15 + on * 0.85 : 1 }} className={hot ? 'gp-grad' : ''}>{w} </span>;
          })}
        </p>
      </div>
    </section>
  );
}

// ── Pilares ───────────────────────────────────────────────────────────────────
function Pillars() {
  return (
    <section id="pilares" className="relative px-6 sm:px-10 py-28 max-w-7xl mx-auto scroll-mt-20">
      <Reveal className="text-center max-w-2xl mx-auto mb-20">
        <p className="gp-eyebrow">Arquitectura</p>
        <h2 className="gp-h2">{MODULE_COUNT} módulos.<br />4 pilares.</h2>
        <p className="mt-5 text-zinc-400 text-[15px] leading-relaxed">Cada pilar resuelve una parte del ciclo comercial. Funcionan por separado y comparten datos cuando hace falta.</p>
      </Reveal>
      <div className="space-y-28">
        {PILLARS.map((pl, pi) => (
          <div key={pl.id} id={pl.id} className="grid lg:grid-cols-[320px_1fr] gap-10 lg:gap-14 scroll-mt-24">
            <div className="lg:sticky lg:top-28 self-start">
              <Reveal>
                <span className="text-[64px] font-black leading-none tracking-tighter" style={{ color: pl.color, opacity: 0.25 }}>0{pi + 1}</span>
                <span className="mt-2 block w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: pl.color, borderColor: `${pl.color}55`, background: `${pl.color}14` }}>{pl.tag}</span>
                <h3 className="mt-4 text-3xl font-black tracking-tight text-white">{pl.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">{pl.desc}</p>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{pl.modules.length} módulos</p>
              </Reveal>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 auto-rows-fr">
              {pl.modules.map((m, i) => (
                <Reveal key={m.name} delay={(i % 2) * 0.08 + Math.floor(i / 2) * 0.05} className="h-full">
                  <Glass accent={pl.color} className="h-full rounded-3xl p-6 flex flex-col">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl p-2.5" style={{ background: `${pl.color}1f`, color: pl.color, boxShadow: `0 0 24px ${pl.glow}` }}><m.Icon size={20} /></div>
                      <h4 className="text-[17px] font-black text-white tracking-tight">{m.name}</h4>
                    </div>
                    <p className="mt-4 text-[13.5px] leading-relaxed text-zinc-400 flex-1">{m.desc}</p>
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {m.chips.map((c) => <span key={c} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-semibold text-zinc-300">{c}</span>)}
                    </div>
                  </Glass>
                </Reveal>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Flujo: los módulos se pasan los datos ─────────────────────────────────────
function Flow() {
  const steps = [['Forecasting', 'Cuánto se va a vender'], ['Assortment', 'Cuánto y qué comprar (OTB)'], ['Distribución', 'A qué tienda va'], ['Resurtido', 'Cuándo reponer']];
  return (
    <section className="px-6 sm:px-10 py-24 max-w-6xl mx-auto">
      <Reveal className="text-center mb-14">
        <p className="gp-eyebrow">Flujo conectado</p>
        <h2 className="gp-h2 !text-[clamp(30px,4.5vw,56px)]">Un dato entra.<br /><span className="gp-grad">Cuatro módulos lo usan.</span></h2>
      </Reveal>
      <Reveal>
        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-4">
          <svg className="hidden md:block absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full h-6 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 6">
            <line x1="6" y1="3" x2="94" y2="3" stroke="url(#gpflow)" strokeWidth="0.5" className="gp-dash" />
            <defs><linearGradient id="gpflow" x1="0" x2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#fbbf24" /></linearGradient></defs>
          </svg>
          {steps.map(([n, d], i) => (
            <Glass key={n} accent={i < 2 ? '#a78bfa' : '#fbbf24'} className="relative rounded-3xl p-6 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-black text-white gp-pulse" style={{ animationDelay: `${i * 0.6}s` }}>{i + 1}</span>
              <p className="mt-4 text-lg font-black text-white">{n}</p>
              <p className="mt-1 text-[13px] text-zinc-400">{d}</p>
            </Glass>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

// ── Qué resuelve (gráficas ilustrativas) ──────────────────────────────────────
const TT = { contentStyle: { background: '#120e1a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 11 }, itemStyle: { color: '#e4e4e7' }, cursor: { fill: 'rgba(255,255,255,.04)' } };
function SolveChart({ kind }) {
  if (kind === 'waterfall') {
    const d = [{ n: 'LY', b: 0, v: 1.43, c: '#bae6fd' }, { n: 'Crecimiento', b: 1.43, v: 0.29, c: '#c4b5fd' }, { n: 'Meta', b: 0, v: 1.82, c: '#86efac' }, { n: 'Gap', b: 1.75, v: 0.07, c: '#fdba74' }, { n: 'Mejor Est.', b: 0, v: 1.75, c: '#818cf8' }];
    return (
      <ResponsiveContainer width="100%" height={260}><BarChart data={d} barCategoryGap="28%">
        <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="n" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[1.2, 1.9]} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(1)}B`} allowDataOverflow />
        <Tooltip {...TT} formatter={(v, k) => (k === 'v' ? [`${v.toFixed(2)}B`, 'Monto'] : null)} />
        <Bar dataKey="b" stackId="a" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="v" stackId="a" radius={[6, 6, 0, 0]} animationDuration={1200}>{d.map((x) => <Cell key={x.n} fill={x.c} />)}</Bar>
      </BarChart></ResponsiveContainer>
    );
  }
  if (kind === 'mos') {
    const d = ['Norte', 'Bajío', 'Metro', 'Occidente', 'Sur', 'Golfo'].map((z, i) => ({ z, antes: [7.2, 6.1, 4.2, 6.8, 5.4, 5.1][i], despues: [3.9, 3.7, 3.4, 3.8, 3.5, 3.3][i] }));
    return (
      <ResponsiveContainer width="100%" height={260}><BarChart data={d} barGap={4}>
        <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="z" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip {...TT} /><Bar dataKey="antes" name="MOS antes" fill="#52525b" radius={[6, 6, 0, 0]} animationDuration={1000} /><Bar dataKey="despues" name="MOS después" fill="#34d399" radius={[6, 6, 0, 0]} animationDuration={1400} />
      </BarChart></ResponsiveContainer>
    );
  }
  if (kind === 'event') {
    const d = Array.from({ length: 10 }, (_, i) => ({ d: `Día ${i + 1}`, ty: [62, 70, 95, 140, 168, 150, 110, 88, 76, 70][i], ly: [60, 64, 80, 118, 150, 132, 101, 84, 72, 66][i] }));
    return (
      <ResponsiveContainer width="100%" height={260}><LineChart data={d}>
        <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="d" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip {...TT} /><Line dataKey="ly" name="Año pasado" stroke="#71717a" strokeDasharray="5 4" dot={false} strokeWidth={2} animationDuration={1200} />
        <Line dataKey="ty" name="Este año" stroke="#22d3ee" dot={false} strokeWidth={3} animationDuration={1600} />
      </LineChart></ResponsiveContainer>
    );
  }
  const d = [['Proveedor', 52], ['Tránsito', 38], ['Aduana', 14], ['CEDIS', 46], ['Ruta a tienda', 22], ['Tienda', 12]].map(([e, v]) => ({ e, v, at: Math.round(v * [0.04, 0.06, 0.3, 0.08, 0.1, 0.25][['Proveedor', 'Tránsito', 'Aduana', 'CEDIS', 'Ruta a tienda', 'Tienda'].indexOf(e)]) }));
  return (
    <ResponsiveContainer width="100%" height={260}><BarChart data={d} layout="vertical" barCategoryGap="24%">
      <CartesianGrid stroke="rgba(255,255,255,.06)" horizontal={false} /><XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}k`} />
      <YAxis type="category" dataKey="e" width={90} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
      <Tooltip {...TT} /><Bar dataKey="v" name="Piezas (k)" stackId="s" fill="#8b5cf6" animationDuration={1200} /><Bar dataKey="at" name="Atorado (k)" stackId="s" fill="#f43f5e" radius={[0, 6, 6, 0]} animationDuration={1500} />
    </BarChart></ResponsiveContainer>
  );
}
function Solves() {
  const [sel, setSel] = useState(0);
  const s = SOLVES[sel];
  return (
    <section id="resuelve" className="px-6 sm:px-10 py-28 max-w-7xl mx-auto scroll-mt-20">
      <Reveal className="mb-14 max-w-3xl">
        <p className="gp-eyebrow !text-left">Qué resuelve</p>
        <h2 className="gp-h2 !text-left">Menos armar reportes.<br /><span className="gp-grad">Más decidir.</span></h2>
      </Reveal>
      <Reveal>
        <div className="grid lg:grid-cols-[260px_1fr] gap-6">
          <div className="flex lg:flex-col gap-1 overflow-x-auto">
            {SOLVES.map((x, i) => (
              <button key={x.id} onClick={() => setSel(i)}
                className={`text-left shrink-0 px-5 py-4 border-l-2 lg:border-l-2 transition-all ${i === sel ? 'border-violet-400 bg-white text-black' : 'border-white/10 text-zinc-300 hover:bg-white/5'}`}>
                <span className="block text-[14px] font-black">{x.title}</span>
                <span className={`block text-[11px] mt-0.5 ${i === sel ? 'text-zinc-600' : 'text-zinc-500'}`}>{x.module}</span>
              </button>
            ))}
          </div>
          <Glass key={s.id} accent="#a78bfa" className="rounded-3xl p-6 sm:p-8 gp-fadein">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white max-w-md">{s.head}</h3>
              <p className="text-[14px] text-zinc-400 max-w-sm leading-relaxed">{s.sub}</p>
            </div>
            <div className="mt-7 grid grid-cols-2 lg:grid-cols-4 gap-2">
              {s.kpis.map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-black/30 border border-white/[0.06] p-4">
                  <p className="text-[11px] text-zinc-400">{k}</p>
                  <p className="mt-3 text-3xl font-light tracking-tight text-white">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-black/30 border border-white/[0.06] p-4"><SolveChart kind={s.chart} /></div>
            <p className="mt-3 text-[10.5px] text-zinc-500">Ejemplo ilustrativo con datos de muestra.</p>
          </Glass>
        </div>
      </Reveal>
    </section>
  );
}

// ── Formatos de archivo ───────────────────────────────────────────────────────
const templateRows = (f) => {
  if (f.template) return f.template;
  const head = f.columns.flatMap((c) => {
    if (c.trim().startsWith('(')) return [];
    const multi = /\(opcionales\)/i.test(c);
    const parts = c.replace(/\(.*?\)/g, '').replace(/\*/g, '').split('/').map((x) => x.trim()).filter(Boolean);
    return multi ? parts : parts.slice(0, 1);
  });
  return head.length ? [head] : null;
};
const downloadTemplate = (mod, f) => {
  const rows = templateRows(f);
  const csv = '﻿' + rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `Plantilla_${mod}_${f.title}.csv`.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]+/g, '_');
  a.click();
};
const colLetter = (i) => String.fromCharCode(65 + (i % 26));
function Formats() {
  const [mi, setMi] = useState(0), [fi, setFi] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const mod = CSV_SCHEMAS[mi], f = mod.formats[Math.min(fi, mod.formats.length - 1)];
  const head = templateRows(f)?.[0] || f.columns;
  const cols = (head && head.length ? head : f.columns).slice(0, 12);
  return (
    <section id="formatos" className="relative px-6 sm:px-10 py-28 max-w-7xl mx-auto scroll-mt-20">
      <Reveal className="text-center max-w-2xl mx-auto mb-14">
        <p className="gp-eyebrow">Formatos</p>
        <h2 className="gp-h2">Tu archivo,<br /><span className="gp-grad">listo a la primera.</span></h2>
        <p className="mt-5 text-zinc-400 text-[15px] leading-relaxed">Elige un módulo para ver qué columnas espera y descarga su plantilla con los encabezados exactos.</p>
      </Reveal>
      <Reveal>
        <div className="flex flex-wrap gap-2 pb-3 mb-8 justify-center">
          {CSV_SCHEMAS.map((m, i) => (
            <button key={m.module} onClick={() => { setMi(i); setFi(0); }}
              className={`shrink-0 rounded-full px-4 py-2 text-[12px] font-bold border transition-all ${i === mi ? 'bg-white text-black border-white' : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/30'}`}>{m.module}</button>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_1.35fr] gap-10 items-center">
          <div key={`${mi}-${fi}`} className="gp-fadein min-w-0">
            <div className="flex items-center gap-3 text-violet-300"><FileSpreadsheet size={22} /><span className="text-[12px] font-black uppercase tracking-[0.2em]">{mod.module}</span></div>
            {mod.formats.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {mod.formats.map((x, i) => <button key={x.title} onClick={() => setFi(i)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold border ${i === fi ? 'border-violet-400/60 bg-violet-500/15 text-violet-200' : 'border-white/10 text-zinc-400 hover:text-white'}`}>{x.title}</button>)}
              </div>
            )}
            <h3 className="mt-4 text-3xl font-black tracking-tight text-white">{f.title}</h3>
            <p className="mt-4 text-[14px] leading-relaxed text-zinc-400">{f.desc}</p>
            {f.columns.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {f.columns.map((c, i) => <span key={c} className="gp-chip" style={{ animationDelay: `${i * 0.035}s` }}>{c}</span>)}
              </div>
            )}
            {templateRows(f) && (
              <button onClick={() => downloadTemplate(mod.module, f)} className="gp-cta mt-8"><Download size={15} /> Descargar plantilla</button>
            )}
          </div>
          {/* Hoja de cálculo 3D */}
          <div className="relative min-w-0" style={{ perspective: 1400 }}
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -10, y: ((e.clientX - r.left) / r.width - 0.5) * 14 }); }}
            onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
            <div className="absolute -inset-10 rounded-full blur-3xl opacity-60 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,.35), transparent 65%)' }} />
            <div key={`${mi}-${fi}`} className="relative rounded-2xl border border-white/10 bg-[#0d0a14]/90 shadow-2xl shadow-violet-900/30 overflow-hidden gp-sheet"
              style={{ transform: `rotateX(${8 + tilt.x}deg) rotateY(${-14 + tilt.y}deg)`, transition: 'transform .25s ease-out' }}>
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-[11px] font-mono text-zinc-400 truncate">Plantilla_{mod.module.replace(/\s+/g, '_')}.csv</span>
              </div>
              <div className="overflow-hidden">
                <table className="w-full text-[11px] font-mono">
                  <thead><tr className="text-zinc-500">
                    <th className="w-8 border-r border-b border-white/5 py-1" />
                    {cols.map((_, i) => <th key={i} className="border-r border-b border-white/5 py-1 font-normal">{colLetter(i)}</th>)}
                  </tr></thead>
                  <tbody>
                    {Array.from({ length: 9 }).map((_, r) => (
                      <tr key={r}>
                        <td className="text-center text-zinc-600 border-r border-b border-white/5 py-1.5">{r + 1}</td>
                        {cols.map((c, i) => (
                          <td key={i} className="border-r border-b border-white/5 px-2 py-1.5 whitespace-nowrap max-w-[120px] truncate">
                            {r === 0 ? <span className="gp-cell text-violet-200 font-bold" style={{ animationDelay: `${0.15 + i * 0.07}s` }}>{String(c).replace(/\(.*?\)|\*/g, '').trim()}</span>
                              : <span className="block h-2 rounded bg-white/[0.06] gp-shimmer" style={{ width: `${40 + ((r * 7 + i * 13) % 50)}%`, animationDelay: `${(r + i) * 0.08}s` }} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ── Preguntas ─────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="preguntas" className="px-6 sm:px-10 py-28 max-w-3xl mx-auto scroll-mt-20">
      <Reveal className="text-center mb-14">
        <p className="gp-eyebrow">Preguntas</p>
        <h2 className="gp-h2">Preguntas<br /><span className="gp-grad">Frecuentes</span></h2>
      </Reveal>
      <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {FAQS.map((f, i) => {
          const on = open === i;
          return (
            <Reveal key={f.q} delay={i * 0.04}>
              <button onClick={() => setOpen(on ? -1 : i)} className="w-full flex items-center justify-between gap-6 py-6 text-left group">
                <span className={`text-[17px] font-bold transition-colors ${on ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>{f.q}</span>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${on ? 'rotate-45 border-violet-400 bg-violet-500/20 text-violet-200' : 'border-white/15 text-zinc-400'}`}>+</span>
              </button>
              <div className="grid transition-all duration-500 ease-out" style={{ gridTemplateRows: on ? '1fr' : '0fr', opacity: on ? 1 : 0 }}>
                <p className="overflow-hidden text-[15px] leading-relaxed text-zinc-400 pr-12">{f.a}<span className="block h-6" /></p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// ── CTA + footer ──────────────────────────────────────────────────────────────
function CTA({ navigate }) {
  return (
    <section className="px-6 sm:px-10 pb-28 max-w-6xl mx-auto">
      <Reveal>
        <div className="relative overflow-hidden rounded-[36px] border border-white/10 px-8 py-20 text-center" style={{ background: 'radial-gradient(ellipse 80% 120% at 50% 0%, rgba(124,58,237,.45), rgba(20,12,36,.9) 60%)' }}>
          <div className="absolute inset-0 gp-gridbg opacity-40 pointer-events-none" />
          <div className="relative">
            <h2 className="text-[clamp(34px,5.5vw,72px)] font-black tracking-[-0.04em] text-white leading-[0.98]">Abre<br />y analiza.</h2>
            <p className="mt-5 text-zinc-300 text-[15px]">Todos los módulos disponibles desde el primer día.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-5 text-[12px] text-zinc-400">
              <span className="flex items-center gap-1.5"><Cpu size={14} /> Corre en tu navegador</span>
              <span className="flex items-center gap-1.5"><Database size={14} /> CSV, Excel o BigQuery</span>
              <span className="flex items-center gap-1.5"><Shield size={14} /> Tus archivos en tu equipo</span>
            </div>
            <button onClick={() => navigate('/app')} className="gp-cta mt-10 mx-auto">Abrir GO PLANNER <ArrowRight size={16} /></button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
function Footer({ navigate }) {
  return (
    <footer className="border-t border-white/[0.06] px-6 sm:px-10 py-8 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 text-[12px] font-bold text-zinc-500"><Layers size={14} className="text-violet-400" /> GO PLANNER · Sbb · {new Date().getFullYear()}</div>
      <button onClick={() => navigate('/app')} className="text-[12px] font-bold text-zinc-400 hover:text-white flex items-center gap-1">Abrir app <ArrowRight size={12} /></button>
    </footer>
  );
}

const CSS = `
html { scroll-behavior: smooth; }
.gp-grad { background: linear-gradient(110deg,#c4b5fd 0%,#8b5cf6 35%,#f0abfc 60%,#fbbf24 100%); -webkit-background-clip: text; background-clip: text; color: transparent; background-size: 200% 100%; animation: gp-shine 8s ease-in-out infinite; }
@keyframes gp-shine { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
.gp-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .3em; text-transform: uppercase; color: #a78bfa; text-align: center; margin-bottom: 18px; }
.gp-h2 { font-size: clamp(36px,6vw,80px); font-weight: 900; letter-spacing: -.045em; line-height: .96; color: #fff; text-align: center; }
.gp-cta { display: inline-flex; align-items: center; gap: 8px; border-radius: 9999px; padding: 14px 26px; font-size: 14px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg,#8b5cf6,#6d28d9); box-shadow: 0 10px 40px -10px rgba(139,92,246,.8), inset 0 1px 0 rgba(255,255,255,.25); transition: transform .25s, box-shadow .25s; }
.gp-cta:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 18px 50px -12px rgba(139,92,246,.95), inset 0 1px 0 rgba(255,255,255,.3); }
.gp-ghost { display: inline-flex; align-items: center; border-radius: 9999px; padding: 14px 26px; font-size: 14px; font-weight: 700; color: #e4e4e7; border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.04); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: all .25s; }
.gp-ghost:hover { border-color: rgba(167,139,250,.6); color: #fff; }
.gp-glass { position: relative; border: 1px solid rgba(255,255,255,.09); overflow: hidden;
  background: linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.015) 45%, rgba(255,255,255,.03));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 20px 50px -30px rgba(0,0,0,.8);
  backdrop-filter: blur(20px) saturate(150%); -webkit-backdrop-filter: blur(20px) saturate(150%); transition: border-color .35s, transform .35s; }
.gp-glass::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .35s;
  background: radial-gradient(420px circle at var(--mx,50%) var(--my,50%), color-mix(in srgb, var(--acc) 22%, transparent), transparent 60%); }
.gp-glass:hover { border-color: color-mix(in srgb, var(--acc) 45%, transparent); transform: translateY(-3px); }
.gp-glass:hover::before { opacity: 1; }
.gp-glass > * { position: relative; }
.gp-dash { stroke-dasharray: 1.5 1.5; animation: gp-dash 2.4s linear infinite; }
@keyframes gp-dash { to { stroke-dashoffset: -6; } }
.gp-pulse { animation: gp-pulse 2.4s ease-in-out infinite; }
@keyframes gp-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,.0); } 50% { box-shadow: 0 0 0 8px rgba(167,139,250,.18); } }
.gp-fadein { animation: gp-fadein .7s cubic-bezier(.2,.7,.2,1) both; }
@keyframes gp-fadein { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.gp-chip { font-family: ui-monospace, monospace; font-size: 11px; color: #e4e4e7; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 4px 9px; animation: gp-pop .5s cubic-bezier(.2,.9,.3,1.3) both; }
@keyframes gp-pop { from { opacity: 0; transform: translateY(8px) scale(.9); } to { opacity: 1; transform: none; } }
.gp-cell { display: inline-block; animation: gp-drop .55s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes gp-drop { from { opacity: 0; transform: translateY(-18px); } to { opacity: 1; transform: none; } }
.gp-shimmer { background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.12), rgba(255,255,255,.04)); background-size: 200% 100%; animation: gp-shim 2.2s linear infinite; }
@keyframes gp-shim { to { background-position: -200% 0; } }
.gp-sheet { animation: gp-fadein .8s cubic-bezier(.2,.7,.2,1) both; }
.gp-gridbg { background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%); }
.gp-noscroll::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) { .gp-grad, .gp-dash, .gp-pulse, .gp-shimmer { animation: none !important; } }
`;

export default function AboutPage() {
  const navigate = useNavigate();
  useEffect(() => { document.title = 'GO PLANNER · Planeación comercial'; }, []);
  return (
    <div data-gobot-screen className="min-h-screen overflow-x-clip text-white antialiased" style={{ background: '#05030a', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <style>{CSS}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="gop-aura" style={{ width: '45vw', height: '45vw', left: '-10%', top: '30%', background: 'rgba(124,58,237,.12)', animation: 'gop-drift-a 30s ease-in-out infinite' }} />
        <div className="gop-aura" style={{ width: '35vw', height: '35vw', right: '-8%', top: '60%', background: 'rgba(245,158,11,.06)', animation: 'gop-drift-b 36s ease-in-out infinite' }} />
      </div>
      <div className="relative" style={{ zIndex: 1 }}>
        <NavBar navigate={navigate} />
        <Hero navigate={navigate} />
        <Manifesto />
        <Pillars />
        <Flow />
        <Solves />
        <Formats />
        <FAQ />
        <CTA navigate={navigate} />
        <Footer navigate={navigate} />
      </div>
      <AboutBot />
    </div>
  );
}

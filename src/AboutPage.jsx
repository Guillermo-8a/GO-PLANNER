// AboutPage.jsx — GO PLANNER landing con animaciones full
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, ShoppingCart, Map, RefreshCw,
  ArrowLeftRight, ChevronDown, Zap, BarChart3,
  Calendar, ArrowRight, Layers
} from 'lucide-react';

// ── Hook: detecta si el elemento es visible ───────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// ── Hook: parallax con scroll ─────────────────────────────────────────────────
function useParallax(speed = 0.3) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const h = () => setOffset(window.scrollY * speed);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, [speed]);
  return offset;
}

// ── Datos ─────────────────────────────────────────────────────────────────────
const WORLDS = [
  {
    id: 'far', tag: 'FAR',
    name: 'Forecast · Assortment · Replenishment',
    desc: 'El núcleo de la planeación de compra. Proyecta demanda, define el surtido óptimo y mantiene el inventario saludable.',
    accent: '#8b5cf6', glow: 'rgba(139,92,246,0.18)',
    modules: [
      { label: 'Forecasting',    Icon: TrendingUp,   desc: 'Regresión lineal con ajuste estacional y 4 escenarios IS.' },
      { label: 'Assortment OTB', Icon: ShoppingCart, desc: 'Presupuesto de compra, buckets por marca y OTB mensual.' },
      { label: 'Resurtido',      Icon: RefreshCw,    desc: 'Reposición continua basada en cobertura y fill rate.' },
    ],
  },
  {
    id: 'planes', tag: 'PLANES',
    name: 'Planning · Daily',
    desc: 'Conecta la estrategia con la ejecución diaria. Vista unificada que une forecast, OTB y distribución.',
    accent: '#f59e0b', glow: 'rgba(245,158,11,0.15)',
    modules: [
      { label: 'Planning', Icon: BarChart3, desc: 'Vista unificada de forecast, OTB y distribución por periodo.' },
      { label: 'Dayli',    Icon: Calendar,  desc: 'Ajustes diarios de inventario, ventas y cobertura.' },
    ],
  },
  {
    id: 'ops', tag: 'OPERACIONES',
    name: 'Distribución · Traslados',
    desc: 'Movimiento de mercancía entre centros y tiendas. Detecta excedentes y cubre necesidades por presupuesto.',
    accent: '#10b981', glow: 'rgba(16,185,129,0.15)',
    modules: [
      { label: 'Distribución', Icon: Map,            desc: 'Surtido inicial por cluster, curva de tallas y chequera.' },
      { label: 'Traslados',    Icon: ArrowLeftRight, desc: 'Transferencias inter-tienda por clima y presupuesto.' },
    ],
  },
];

const FAQS = [
  { q: '¿Qué es GO PLANNER?', a: 'Sistema integrado de planeación retail desarrollado en El Yaqui. Cubre el ciclo completo: forecast → compra → distribución → reposición → traslados.' },
  { q: '¿Los módulos comparten datos?', a: 'Sí. El pipeline conecta Forecasting → OTB → Distribución → Resurtido automáticamente. El sidebar muestra qué módulos tienen información activa.' },
  { q: '¿Qué son los "mundos"?', a: 'Agrupaciones por función: FAR (compra y reposición), Planes (estrategia y operación diaria) y Operaciones (movimiento de mercancía).' },
  { q: '¿Se guarda mi trabajo?', a: 'Sí. Cada módulo persiste en localStorage (gop_forecast, gop_assortment, etc.). Al volver encontrarás todo como lo dejaste.' },
  { q: '¿Qué es OTB?', a: 'Open To Buy — presupuesto disponible para comprar en un periodo. GO PLANNER lo calcula con inventario actual, ventas proyectadas y compromisos de compra.' },
];

// ── Cursor glow ───────────────────────────────────────────────────────────────
function CursorGlow() {
  const [pos, setPos] = useState({ x: -200, y: -200 });
  useEffect(() => {
    const h = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);
  return (
    <div style={{
      position: 'fixed', pointerEvents: 'none', zIndex: 1,
      left: pos.x - 200, top: pos.y - 200,
      width: 400, height: 400, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
      transition: 'left 0.1s ease, top 0.1s ease',
    }} />
  );
}

// ── Grid de fondo animado ─────────────────────────────────────────────────────
function GridBg() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      backgroundImage: `
        linear-gradient(rgba(139,92,246,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(139,92,246,0.03) 1px, transparent 1px)
      `,
      backgroundSize: '60px 60px',
    }} />
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function NavBar({ navigate }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '0 2.5rem', height: '64px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: scrolled ? 'rgba(0,0,0,0.8)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(139,92,246,0.15)' : 'none',
      transition: 'all 0.4s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          padding: '7px', borderRadius: '12px', display: 'flex',
          boxShadow: '0 0 20px rgba(124,58,237,0.4)',
        }}>
          <Layers size={16} color="white" />
        </div>
        <span style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '-0.5px', color: 'white' }}>
          GO <span style={{ color: '#8b5cf6' }}>PLANNER</span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {['FAR', 'Planes', 'Operaciones'].map(w => (
          <a key={w} href={`#${w.toLowerCase()}`} style={{
            fontSize: '12px', fontWeight: 600, color: '#71717a',
            textDecoration: 'none', transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.target.style.color = '#8b5cf6'}
          onMouseLeave={e => e.target.style.color = '#71717a'}
          >{w}</a>
        ))}
        <button onClick={() => navigate('/')} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          color: 'white', border: 'none', borderRadius: '12px',
          padding: '9px 20px', fontSize: '13px', fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 0 24px rgba(124,58,237,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(124,58,237,0.6)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.4)'; }}
        >
          Abrir app <ArrowRight size={13} />
        </button>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ navigate }) {
  const parallax = useParallax(0.2);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 100); }, []);

  return (
    <section style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 2rem', textAlign: 'center', position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Orbs de fondo */}
      <div style={{
        position: 'absolute', top: '10%', left: '20%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
        transform: `translateY(${parallax * 0.5}px)`,
        transition: 'transform 0.1s linear',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '15%',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        transform: `translateY(${-parallax * 0.3}px)`,
        transition: 'transform 0.1s linear',
        pointerEvents: 'none',
      }} />

      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '7px 16px', borderRadius: '100px',
        border: '1px solid rgba(139,92,246,0.35)',
        background: 'rgba(139,92,246,0.08)',
        marginBottom: '36px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.7s ease',
      }}>
        <Zap size={11} color="#8b5cf6" />
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Sistema de planeación retail · El Yaqui
        </span>
      </div>

      {/* Título */}
      <div style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(30px)',
        transition: 'all 0.8s ease 0.1s',
      }}>
        <h1 style={{
          fontSize: 'clamp(72px, 14vw, 160px)',
          fontWeight: 900, lineHeight: 0.85,
          letterSpacing: '-6px', textTransform: 'uppercase',
          color: 'white', margin: '0 0 8px',
        }}>GO</h1>
        <h1 style={{
          fontSize: 'clamp(60px, 12vw, 140px)',
          fontWeight: 900, lineHeight: 0.85,
          letterSpacing: '-5px', textTransform: 'uppercase',
          margin: '0 0 32px',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%, #7c3aed 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 40px rgba(139,92,246,0.4))',
        }}>PLANNER</h1>
      </div>

      {/* Desc */}
      <p style={{
        fontSize: '17px', color: '#71717a', maxWidth: '560px',
        lineHeight: 1.7, margin: '0 0 44px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s ease 0.2s',
      }}>
        Plataforma integrada de planeación para retail de moda. Desde el forecast hasta los traslados, todo en un sistema que habla solo.
      </p>

      {/* CTAs */}
      <div style={{
        display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center',
        marginBottom: '72px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s ease 0.3s',
      }}>
        <button onClick={() => navigate('/')} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          color: 'white', border: 'none', borderRadius: '16px',
          padding: '16px 32px', fontSize: '15px', fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 0 40px rgba(124,58,237,0.5)',
          transition: 'all 0.25s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 60px rgba(124,58,237,0.7)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(124,58,237,0.5)'; }}
        >
          Abrir GO PLANNER <ArrowRight size={16} />
        </button>
        <a href="#far" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(255,255,255,0.04)', color: '#a1a1aa',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px', padding: '16px 32px',
          fontSize: '15px', fontWeight: 700, textDecoration: 'none',
          transition: 'all 0.25s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.color = 'white'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#a1a1aa'; }}
        >
          Ver mundos
        </a>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: '60px', flexWrap: 'wrap', justifyContent: 'center',
        opacity: mounted ? 1 : 0,
        transition: 'all 0.8s ease 0.4s',
      }}>
        {[{ val: '7', label: 'Módulos' }, { val: '3', label: 'Mundos' }, { val: '∞', label: 'Tiendas' }].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '48px', fontWeight: 900, color: 'white', lineHeight: 1, letterSpacing: '-2px', margin: 0 }}>{s.val}</p>
            <p style={{ fontSize: '11px', color: '#52525b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '6px' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Scroll hint */}
      <div style={{ position: 'absolute', bottom: '36px', left: '50%', transform: 'translateX(-50%)', opacity: 0.35 }}>
        <ChevronDown size={22} color="white" />
      </div>
    </section>
  );
}

// ── World card ────────────────────────────────────────────────────────────────
function WorldCard({ world, index }) {
  const [ref, visible] = useInView(0.1);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      id={world.id}
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `rgba(255,255,255,0.035)` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hovered ? world.accent + '50' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '28px', padding: '36px',
        position: 'relative', overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.7s ease ${index * 0.15}s, transform 0.7s ease ${index * 0.15}s, border-color 0.3s, background 0.3s`,
        cursor: 'default',
      }}
    >
      {/* Glow en hover */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: '250px', height: '250px', borderRadius: '50%',
        background: `radial-gradient(ellipse at top right, ${world.glow} 0%, transparent 65%)`,
        opacity: hovered ? 1 : 0.4,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }} />

      <span style={{
        display: 'inline-block', fontSize: '10px', fontWeight: 900,
        letterSpacing: '2px', textTransform: 'uppercase',
        color: world.accent, background: `${world.accent}15`,
        border: `1px solid ${world.accent}35`,
        padding: '5px 14px', borderRadius: '100px', marginBottom: '20px',
      }}>{world.tag}</span>

      <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'white', margin: '0 0 14px', lineHeight: 1.4 }}>
        {world.name}
      </h3>
      <p style={{ fontSize: '13px', color: '#71717a', lineHeight: 1.75, margin: '0 0 28px' }}>
        {world.desc}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {world.modules.map(({ label, Icon, desc }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'flex-start', gap: '14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px', padding: '14px',
            transition: 'background 0.2s',
          }}>
            <div style={{ padding: '9px', borderRadius: '12px', background: `${world.accent}15`, flexShrink: 0 }}>
              <Icon size={14} color={world.accent} />
            </div>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 800, color: 'white', margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: '11px', color: '#52525b', margin: 0, lineHeight: 1.6 }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mundos ────────────────────────────────────────────────────────────────────
function WorldsSection() {
  const [ref, visible] = useInView(0.1);
  return (
    <section style={{ padding: '120px 2rem', maxWidth: '1140px', margin: '0 auto' }}>
      <div ref={ref} style={{
        textAlign: 'center', marginBottom: '72px',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'all 0.7s ease',
      }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#52525b', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '16px' }}>
          Arquitectura modular
        </p>
        <h2 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, color: 'white', letterSpacing: '-3px', margin: 0 }}>
          Los 3 mundos
        </h2>
        <p style={{ color: '#52525b', marginTop: '16px', fontSize: '15px', maxWidth: '480px', margin: '16px auto 0' }}>
          Módulos agrupados por función y flujo de trabajo. Cada mundo opera de forma independiente pero comparte datos con los demás.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {WORLDS.map((w, i) => <WorldCard key={w.id} world={w} index={i} />)}
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQSection() {
  const [open, setOpen] = useState(null);
  const [ref, visible] = useInView(0.1);

  return (
    <section style={{ padding: '80px 2rem 140px', maxWidth: '740px', margin: '0 auto' }}>
      <div ref={ref} style={{
        textAlign: 'center', marginBottom: '60px',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'all 0.7s ease',
      }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#52525b', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '16px' }}>
          Soporte
        </p>
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, color: 'white', letterSpacing: '-2px', margin: 0 }}>
          Preguntas frecuentes
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{
              background: isOpen ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isOpen ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: '18px', overflow: 'hidden',
              transition: 'all 0.25s ease',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: `${i * 0.08}s`,
            }}>
              <button onClick={() => setOpen(isOpen ? null : i)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '22px 26px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{faq.q}</span>
                <ChevronDown size={16} color={isOpen ? '#8b5cf6' : '#52525b'}
                  style={{ flexShrink: 0, marginLeft: '12px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }} />
              </button>
              {isOpen && (
                <p style={{
                  fontSize: '13px', color: '#71717a', lineHeight: 1.75,
                  padding: '0 26px 22px', margin: 0,
                  borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '18px',
                }}>{faq.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CTA final ─────────────────────────────────────────────────────────────────
function CTASection({ navigate }) {
  const [ref, visible] = useInView(0.2);
  const [hovered, setHovered] = useState(false);
  return (
    <section style={{ padding: '0 2rem 120px', maxWidth: '900px', margin: '0 auto' }}>
      <div ref={ref} style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(91,33,182,0.08) 100%)',
        border: '1px solid rgba(139,92,246,0.25)',
        borderRadius: '32px', padding: '64px 48px', textAlign: 'center',
        opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.96)',
        transition: 'all 0.8s ease',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
          width: '400px', height: '300px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' }}>
          Listo para planear
        </p>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, color: 'white', letterSpacing: '-2px', margin: '0 0 16px' }}>
          Empieza a usar GO PLANNER
        </h2>
        <p style={{ color: '#71717a', fontSize: '15px', margin: '0 0 40px', lineHeight: 1.6 }}>
          Todos los módulos disponibles. Sin configuración. Solo abre y planea.
        </p>
        <button
          onClick={() => navigate('/')}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            color: 'white', border: 'none', borderRadius: '16px',
            padding: '18px 40px', fontSize: '16px', fontWeight: 700,
            cursor: 'pointer',
            boxShadow: hovered ? '0 0 60px rgba(124,58,237,0.7)' : '0 0 30px rgba(124,58,237,0.4)',
            transform: hovered ? 'scale(1.05) translateY(-2px)' : 'scale(1)',
            transition: 'all 0.25s ease',
          }}
        >
          Abrir GO PLANNER <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer({ navigate }) {
  return (
    <footer style={{
      borderTop: '1px solid rgba(255,255,255,0.05)',
      padding: '32px 2.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '16px',
      maxWidth: '1140px', margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ background: '#7c3aed', padding: '6px', borderRadius: '10px', display: 'flex' }}>
          <Layers size={14} color="white" />
        </div>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#3f3f46' }}>
          GO PLANNER · El Yaqui · {new Date().getFullYear()}
        </span>
      </div>
      <button onClick={() => navigate('/')} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'none', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px', padding: '8px 16px',
        color: '#52525b', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
        transition: 'color 0.2s, border-color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
      >
        Abrir app <ArrowRight size={12} />
      </button>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AboutPage() {
  const navigate = useNavigate();
  return (
    <div style={{ background: '#000', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
      `}</style>
      <GridBg />
      <CursorGlow />
      <div style={{ position: 'relative', zIndex: 2 }}>
        <NavBar navigate={navigate} />
        <Hero navigate={navigate} />
        <WorldsSection />
        <FAQSection />
        <CTASection navigate={navigate} />
        <Footer navigate={navigate} />
      </div>
    </div>
  );
}

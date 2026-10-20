// AboutPage.jsx — GO PLANNER landing con animaciones full
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, ShoppingCart, Map, RefreshCw,
  ArrowLeftRight, ChevronDown, Zap, BarChart3,
  Calendar, ArrowRight, Layers, FileSpreadsheet, Tag, Download, ListChecks, PieChart, Truck, Hourglass
} from 'lucide-react';
import { CSV_SCHEMAS } from './csvSchemas';

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

function useParallax(speed = 0.3) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const h = () => setOffset(window.scrollY * speed);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, [speed]);
  return offset;
}

const WORLDS = [
  {
    id: 'plan', tag: 'PLANES FINANCIEROS',
    name: 'Planning · Suplementarios',
    desc: 'El núcleo de la planeación, planes a nivel canal de venta | tienda | goa. ',
    accent: '#8b5cf6', glow: 'rgba(139,92,246,0.18)',
    modules: [
      { label: 'Planning', Icon: BarChart3, desc: 'Construye Mejor Estimado, Ajusta tu OTB, Alinea tu canales, y baja a nivel tienda.' },
      { label: 'Suplementarios', Icon: PieChart, desc: 'Baja el OTB mensual a marca o proveedor con histórico o IS, siempre cuadrando al OTB general.' },
    ],
  },
  {
    id: 'demanda', tag: 'PLANEACIÓN DE LA DEMANDA',
    name: 'Assortment · Forecasting · Distribución · Resurtido',
    desc: 'Conecta la estrategia con la ejecución diaria. Vista unificada que une forecast, OTB y distribución.',
    accent: '#f59e0b', glow: 'rgba(245,158,11,0.15)',
    modules: [
      { label: 'Forecasting', Icon: TrendingUp, desc: 'Regresión lineal con ajuste estacional y 4 escenarios IS.' },
      { label: 'Assortment', Icon: ShoppingCart, desc: 'Presupuesto de compra y OTB mensual. Curvas y piezas por modelo.' },
      { label: 'Resurtido', Icon: RefreshCw, desc: 'Reposición por días de inventario con ajustes por cluster.' },
      { label: 'Distribución', Icon: Map, desc: 'Surtido inicial por cluster, curva de tallas y chequera.' },
    ],
  },
  {
    id: 'inventario', tag: 'CONTROL DE INVENTARIOS',
    name: 'Disperción · Traslados · Chequera',
    desc: 'Movimiento de mercancía entre tiendas. Detecta excedentes y cubre necesidades.',
    accent: '#10b981', glow: 'rgba(16,185,129,0.15)',
    modules: [
      { label: 'Traslados', Icon: ArrowLeftRight, desc: 'Excedente de temporada y nivelación por MOS.' },
      { label: 'Dispersión', Icon: ArrowLeftRight, desc: 'Dispersión entre ventas e inventario por centro o GOA.' },
      { label: 'Chequera', Icon: ArrowLeftRight, desc: 'Información a nivel SKU para organizar la compra.' },
    ],
  },
  {
    id: 'check', tag: 'CHECK DE COORDINADORES',
    name: 'Daily · Eventos · Allocation · Pedidos · Nulo Movimiento',
    desc: 'Detalle diario, eventos promocionales, parametrizaciones y rastreo de OCs.',
    accent: '#06b6d4', glow: 'rgba(6, 182, 212, 0.15)',
    modules: [
      { label: 'Daily', Icon: Calendar, desc: 'Ajustes diarios de inventario, ventas y margen.' },
      { label: 'Eventos', Icon: Tag, desc: 'Venta, margen y sell-through de eventos promocionales.' },
      { label: 'Allocation', Icon: ListChecks, desc: 'Reportero de parametrizaciones ZO9_DM y de OC.' },
      { label: 'Pedidos', Icon: Truck, desc: 'Rastreador de OCs con rutas de importación y nacional.' },
      { label: 'Nulo Movimiento', Icon: Hourglass, desc: 'Inventario sin venta en cada combinación SKU × centro.' },
    ],
  },
];

const FAQS = [
  { q: '¿Qué es GO PLANNER?', a: 'Sistema integrado de planeación comercial desarrollado por PAC.' },
  { q: '¿Los módulos comparten datos?', a: 'Sí. El pipeline conecta Forecasting → OTB → Distribución → Resurtido automáticamente.' },
  { q: '¿Cómo funciona GO PLANNER?', a: 'Funciona con la información cargada en los CSVs en la memoria RAM.' },
  { q: '¿Se guarda mi trabajo?', a: 'Sí. Cada módulo persiste en localStorage.' },
  { q: '¿Mi información corre peligro?', a: 'No. Todo procesa de forma local en tu equipo, sin servidores externos.' },
];

function GridBg() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      backgroundImage: `linear-gradient(rgba(139,92,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.03) 1px, transparent 1px)`,
      backgroundSize: '60px 60px',
    }} />
  );
}

function NavBar({ navigate }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '0 2.5rem', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(139,92,246,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img src="/logo.png" alt="GO PLANNER" style={{ width: '120px', height: 'auto', filter: 'drop-shadow(0 0 30px rgba(139,92,246,0.35))' }} />
      </div>
      <button onClick={() => navigate('/')} style={{
        background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: 'white', border: 'none',
        borderRadius: '12px', padding: '9px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
      }}>
        Abrir app <ArrowRight size={13} />
      </button>
    </nav>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();
  return (
    <div style={{ background: '#000', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: 'white', position: 'relative' }}>
      <GridBg />
      <NavBar navigate={navigate} />
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '120px 2rem 80px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '20px' }}>Sobre GO PLANNER</h1>
        <p style={{ color: '#a1a1aa', fontSize: '16px', lineHeight: 1.7, marginBottom: '40px' }}>
          Sistema integrado de planeación comercial para cubrir los tres pilares del negocio.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {WORLDS.map(w => (
            <div key={w.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px', padding: '24px' }}>
              <span style={{ fontSize: '10px', fontWeight: 900, color: w.accent, textTransform: 'uppercase' }}>{w.tag}</span>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '8px 0 12px' }}>{w.name}</h3>
              <p style={{ fontSize: '13px', color: '#71717a', lineHeight: 1.6 }}>{w.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

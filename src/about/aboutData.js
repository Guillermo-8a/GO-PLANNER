// Contenido de la página About: pilares, módulos (todos los del menú de la app), problemas que resuelve y FAQ.
// Si agregas un módulo a NAV_ITEMS en App.jsx, agrégalo aquí también.
import {
  BarChart3, PieChart, Radar, ShoppingCart, TrendingUp, Map, RefreshCw, Stethoscope, BarChart2, ArrowLeftRight, Wallet,
  CalendarDays, Tag, ListChecks, Truck, Hourglass, Percent, ShieldCheck,
} from 'lucide-react';

export const PILLARS = [
  {
    id: 'financial', tag: 'Financial', title: 'Planes financieros',
    desc: 'Arma el plan del negocio y bájalo hasta donde se ejecuta: canal, tienda, marca y proveedor.',
    color: '#a78bfa', glow: 'rgba(167,139,250,0.22)',
    modules: [
      { name: 'Planning', Icon: BarChart3, desc: 'Construye el Mejor Estimado, ajusta el OTB, alinea canales y baja el plan a nivel tienda.', chips: ['Mejor Estimado', 'OTB', 'Plan por tienda'] },
      { name: 'Suplementarios', Icon: PieChart, desc: 'Reparte el OTB mensual (venta, rebajas, CMSI, compra, utilidad e inventario) entre marcas o proveedores y siempre cuadra al total.', chips: ['Marca / proveedor', 'Cuadre automático'] },
      { name: 'Margen', Icon: Percent, desc: 'Explica dónde se movió el margen contra el año pasado: descuento, costo, bonificación, merma y mezcla, por división, sección y marca.', chips: ['Puente de margen', 'TY vs LY'] },
      { name: 'Radar Competencia', Icon: Radar, desc: 'Compara tus precios contra Coppel, Liverpool, Amazon, Mercado Libre y más, y sugiere qué hacer según tu inventario.', chips: ['Precios rivales', 'Sugerencia de letra'] },
    ],
  },
  {
    id: 'demand', tag: 'Demand Planner', title: 'Planeación de la demanda',
    desc: 'Convierte el plan en compra y surtido: cuánto comprar, de qué, para qué tienda y cuándo reponer.',
    color: '#fbbf24', glow: 'rgba(251,191,36,0.18)',
    modules: [
      { name: 'Forecasting', Icon: TrendingUp, desc: 'Pronostica la venta por marca con varios motores, mide su precisión con backtest y te da 4 escenarios.', chips: ['Backtest', '4 escenarios'] },
      { name: 'Assortment', Icon: ShoppingCart, desc: 'Presupuesto de compra en 7 pasos: clústeres, curvas, reglas de precio, OTB mensual, preventa y chequeras.', chips: ['OTB mensual', 'Clústeres', 'Chequeras'] },
      { name: 'Distribución', Icon: Map, desc: 'Surtido inicial por clúster con curva de tallas, topes de MOS y la estacionalidad del retail en México.', chips: ['Push / Pack', 'Curva de tallas'] },
      { name: 'Resurtido', Icon: RefreshCw, desc: 'Pedido sugerido por días de inventario: demanda diaria × (lead time + cobertura + seguridad) − lo que ya tienes.', chips: ['Pedido sugerido', 'Por clúster'] },
      { name: 'Diagnóstico de demanda', Icon: Stethoscope, desc: 'Clasifica cada modelo por cómo se vende (suave, errático, intermitente o irregular) y te dice qué hacer con él.', chips: ['Básico vs temporada', 'Acción por modelo'] },
    ],
  },
  {
    id: 'inventory', tag: 'Inventory Control', title: 'Control de inventarios',
    desc: 'Pon el inventario donde está la venta: mide el desbalance y mueve la mercancía entre tiendas.',
    color: '#34d399', glow: 'rgba(52,211,153,0.16)',
    modules: [
      { name: 'Dispersión', Icon: BarChart2, desc: 'Mide qué tan alineado está el inventario con la venta entre tiendas (R²), por sección y mes, contra el año pasado.', chips: ['R² venta vs inventario', 'LY vs TY'] },
      { name: 'Traslados', Icon: ArrowLeftRight, desc: 'Propone traslados por excedente de temporada, aperturas con corrida completa y nivelación de MOS, hasta nivel SKU.', chips: ['Por clima', 'Nivelación MOS'] },
      { name: 'Chequera', Icon: Wallet, desc: 'Ficha de cada modelo a nivel SKU, con foto, para organizar y administrar la compra.', chips: ['Modelos y fotos', 'Control de compra'] },
    ],
  },
  {
    id: 'check', tag: 'Check Coo', title: 'Seguimiento diario',
    desc: 'Lo que el coordinador revisa todos los días: venta, eventos, pedidos, parametrizaciones e inventario parado.',
    color: '#22d3ee', glow: 'rgba(34,211,238,0.16)',
    modules: [
      { name: 'Daily', Icon: CalendarDays, desc: 'Venta, margen e inventario del día contra el año pasado, cierre proyectado del mes y devoluciones.', chips: ['TY vs LY', 'Cierre del mes'] },
      { name: 'Eventos', Icon: Tag, desc: 'Resultado de cada evento promocional (Buen Fin, BTS, Navidad…): venta, margen, sell-through y remanente contra el año pasado.', chips: ['BigQuery', 'Sell-through'] },
      { name: 'Allocation', Icon: ListChecks, desc: 'Revisa parametrizaciones y OC antes de que salga la mercancía: dice qué está mal, dónde y cómo corregirlo.', chips: ['ZO9_DM', 'CSV corregido'] },
      { name: 'Pedidos', Icon: Truck, desc: 'Rastrea cada OC en un mapa 3D, desde el proveedor hasta la tienda, y marca lo atorado o vencido.', chips: ['Mapa 3D', 'Atorados'] },
      { name: 'Nulo Movimiento', Icon: Hourglass, desc: 'Encuentra el inventario sin venta por SKU × centro, cuánto vale y quién tiene más, con acción sugerida.', chips: ['Por SKU × centro', 'Regular vs liquidación'] },
      { name: 'Validador de parametrizaciones', Icon: ShieldCheck, desc: 'Valida las combinaciones que viajan de O9 y entrega el archivo corregido listo para volver a cargar.', chips: ['O9', 'Tipos de afectación'] },
    ],
  },
];

export const MODULE_COUNT = PILLARS.reduce((n, p) => n + p.modules.length, 0);

// "Qué resuelve" — gráficas ilustrativas (no son datos reales)
export const SOLVES = [
  {
    id: 'plan', title: 'Plan que cuadra', module: 'Planning · Suplementarios',
    head: 'Del año pasado al Mejor Estimado, en una sola vista', sub: 'Ve cuánto crece el plan, qué tan lejos queda de la meta y cómo se reparte por marca sin perder el cuadre.',
    kpis: [['Mejor Estimado', '1.75B'], ['vs LY', '+17%'], ['Gap vs meta', '-4.1%'], ['Marcas cuadradas', '100%']],
    chart: 'waterfall',
  },
  {
    id: 'inv', title: 'Inventario donde se vende', module: 'Dispersión · Traslados · Nulo',
    head: 'Menos meses de inventario en las zonas que no venden', sub: 'Detecta excedentes por zona, propone traslados y separa lo que ya no se mueve.',
    kpis: [['MOS antes', '5.8'], ['MOS después', '3.6'], ['Pzs a mover', '42k'], ['NM detectado', '$8.4M']],
    chart: 'mos',
  },
  {
    id: 'event', title: 'Eventos medidos', module: 'Eventos · Daily',
    head: 'Cada promo comparada día contra día con el año pasado', sub: 'Venta, margen y sell-through del evento sin armar el reporte a mano.',
    kpis: [['Venta evento', '+12%'], ['Margen', '-1.2 pts'], ['Sell-through', '38%'], ['Remanente', '61k pzs']],
    chart: 'event',
  },
  {
    id: 'oc', title: 'OCs sin sorpresas', module: 'Pedidos · Allocation',
    head: 'Dónde está cada pieza que compraste', sub: 'Del proveedor a la tienda, con lo atorado marcado antes de que se vuelva quiebre.',
    kpis: [['En tránsito', '184k'], ['Atorado', '9%'], ['Lead time', '41 d'], ['A tiempo', '86%']],
    chart: 'pipeline',
  },
];

export const FAQS = [
  { q: '¿Qué es GO PLANNER?', a: 'Es la herramienta de planeación comercial del equipo de PAC de El Yaqui. Junta en un solo lugar el plan financiero, la planeación de la demanda, el control de inventarios y el seguimiento diario, para que no tengas que armar cada análisis en Excel.' },
  { q: '¿Cómo empiezo a usarlo?', a: 'Abre el módulo que necesitas y carga su archivo (CSV o Excel con las columnas de la sección Formatos). Algunos módulos, como Eventos, también traen la información directo de BigQuery. Los cálculos y las gráficas salen al momento.' },
  { q: '¿Dónde se guarda mi información?', a: 'Los archivos que cargas se procesan y se guardan en tu navegador, en tu propio equipo. Solo salen de él cuando usas una función conectada: la lista compartida de eventos, las consultas a BigQuery o las preguntas al GO-Bot con IA.' },
  { q: '¿Pierdo mi trabajo si cierro la página?', a: 'No. Al volver encuentras todo como lo dejaste en ese navegador. Si cambias de computadora o borras los datos del navegador, tendrás que volver a cargar tus archivos.' },
  { q: '¿Los módulos comparten datos entre sí?', a: 'Sí. Forecasting alimenta el OTB de Assortment, que alimenta Distribución, que alimenta Resurtido. La barra "Datos" en la parte superior de la app marca qué módulos ya tienen información.' },
  { q: '¿Qué hace el GO-Bot?', a: 'Revisa la pantalla en la que estás y te avisa de alertas. También contesta preguntas sobre cómo funciona cada módulo y cómo se calculan sus indicadores (sell-through, MOS, OTB, margen, etc.).' },
  { q: '¿Qué formato deben tener mis archivos?', a: 'Cada módulo pide encabezados específicos. En la sección Formatos de esta página ves las columnas de cada uno y puedes descargar la plantilla lista para llenar.' },
  { q: '¿A quién le reporto un error o una idea?', a: 'Desde el botón de Soporte (?) dentro de la app. Ahí está el correo para mandar tu comentario.' },
];

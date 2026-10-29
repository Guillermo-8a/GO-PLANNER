// Base de conocimiento de GO PLANNER: qué hace cada módulo, qué archivo pide y cómo calcula.
// La usa el GO-Bot (chat) para contestar "¿cómo funciona / cómo se calcula…?" con o sin IA.
// Fuente: lógica de cada módulo (src/modules/*), About y csvSchemas. Si cambias una regla en un módulo, actualízala aquí.
import { CSV_SCHEMAS } from '../csvSchemas.js';

const BASE = [
  {
    id: 'general', titulo: 'Qué es GO PLANNER',
    keywords: ['go planner', 'que es', 'como funciona', 'pilares', 'modulos', 'datos', 'guarda', 'seguridad'],
    texto: `Sistema de planeación comercial del equipo de PAC (Sbb) en 4 pilares: Financial (Planning, Suplementarios, Radar Competencia), Demand Planner (Assortment, Forecasting, Distribución, Resurtido, Diagnóstico de demanda), Inventory Control (Dispersión, Traslados, Chequera) y Check Coo (Daily, Eventos, Allocation, Pedidos, Nulo Movimiento, Validador).
Cada módulo trabaja con un CSV/Excel que cargas (o con BigQuery en Eventos y el GO-Bot); los cálculos corren en tu navegador y se guardan en localStorage / IndexedDB de tu equipo.
Pipeline: Forecasting → OTB (Assortment) → Distribución → Resurtido comparten datos; el header "Datos:" marca qué módulos tienen información.`,
  },
  {
    id: 'kpis', titulo: 'Fórmulas retail',
    keywords: ['sell through', 'sell-through', 'wos', 'mos', 'rotacion', 'margen', 'otb', 'fill rate', 'cobertura', 'formula'],
    texto: `Sell-Through % = venta unidades ÷ (inventario inicial + recibos) × 100.
WOS (semanas de cobertura) = inventario (OH + OO) ÷ venta semanal promedio. MOS = inventario ÷ venta mensual promedio.
Rotación = venta a costo del periodo ÷ inventario promedio a costo.
Margen % = (venta neta − costo) ÷ venta neta × 100.
OTB = inventario final planeado + venta + rebajas − inventario inicial − pedidos colocados.
Fill Rate % = unidades surtidas ÷ unidades solicitadas × 100.
En el header: Cobertura = (OH+OO) ÷ venta semanal del plan de Resurtido; alerta de sobreinventario arriba de 16 semanas y de fill rate abajo de 85%.`,
  },
  {
    id: 'nulo', modulo: 'nulo', titulo: 'Nulo Movimiento',
    keywords: ['nulo', 'nm', 'sin venta', 'sin movimiento', 'umbral', 'antiguedad', 'recepcion'],
    texto: `Inventario sin venta por combinación SKU × centro (tiendas y bodegas), desde el CSV de BigQuery o la hoja BASE del Excel "Nulo Propuesta".
Regla: una combinación es NULO si los meses desde su última venta son mayores al umbral (3 por default, editable por sección en Configuración).
Si no tuvo venta en la ventana (">14 meses"), se mide la antigüedad desde la 1a recepción (semanas desde la 1a recepción > umbral × 52/12); si llegó hace poco NO es nulo. Sin venta ni fecha de recepción → nulo.
Muestra monto y piezas en NM, meses promedio sin venta, proveedor top, % por estatus, marca, zona, tienda, talla, GOA y modelo, inventario por letra de rebaja (Regular, Rebaja, Liquidación PR/SR/TR) y la tabla "¿Quién tiene más de su inventario en NM?" = monto NM ÷ inventario propio del grupo (marca, GOA, zona, tienda o modelo), con "vs prom." = veces el % NM promedio.
El tab Detalle lista las combinaciones con acción sugerida y destinos, y baja CSV.`,
  },
  {
    id: 'dayli', modulo: 'dayli', titulo: 'Daily',
    keywords: ['daily', 'dayli', 'venta diaria', 'fcst', 'forecast mes', 'cierre', 'escenario', 'conservador', 'neutral', 'arriesgado', 'tendencia'],
    texto: `Venta, margen e inventario diario TY vs LY (CSV o BigQuery), por división, sección, GOA, marca, canal y tipo de pago.
Proyección de cierre del mes (4 escenarios), acumulado del mes + lo que falta:
• Conservador = acumulado + run-rate × días restantes × 0.85.
• Neutral = acumulado + Σ días restantes de (promedio de ese día de la semana, últimas 6 semanas) × ajuste de promo (día con promo TY: +uplift; día que LY tuvo promo y TY no: −uplift/2).
• Arriesgado = acumulado + máx(Neutral, resto del mes LY × (1 + crecimiento run-rate TY vs LY)); sin LY, Neutral +5%.
• Tendencia mes = acumulado + resto del mes LY × (1 + crecimiento real a la fecha vs LY mismos días).
El override % de Configuración aplica a lo que falta del mes. "vs LY mes" compara contra el mes LY completo.
Validador de crecimiento: cada escenario muestra el crecimiento que implica vs el que llevas a la fecha; verde ≤3 pts, ámbar ≤8, rojo >8.
"Fcst Mes" por fila: el total (escenario elegido o run-rate) se reparte con el modo elegido: Run-rate del mes (venta del mes ÷ días con venta × días del mes), Participación LY (peso de la fila en el mes LY completo) o Tendencia por fila (venta de la fila + su resto LY × (1 + su crecimiento)).
Backtest ("Medir accuracy"): proyecta cada mes cerrado (últimos 12 con LY) al día 7, 14 y 21 y compara con el cierre real; accuracy = 100 − WMAPE y sesgo (+ = se pasa), para el total y para el reparto por sección.
"Tend período" = venta vs LY del mismo filtro; "Tend cierre" = fcst vs LY del mes completo.
Detalle por segmento: "Crec MG" = crecimiento % del MG% (MG = utilidad ÷ venta; utilidad = $) vs LY del mismo período; "Desv Inv ini AA" = inventario inicial del mes (INV_INI) vs mismo mes del año pasado (INV_INI_AA); si el CSV no los trae, "Desv Inv AA" = OH de la foto vs OH_AA.`,
  },
  {
    id: 'pedidos', modulo: 'pedidos', titulo: 'Pedidos',
    keywords: ['pedidos', 'oc', 'orden de compra', 'aduana', 'transito', 'cedis', 'cross dock', 'atorado', 'embarque', 'lead time', 'estatus'],
    texto: `Rastreador de OCs con mapa 3D. Rutas: importación (proveedor → tránsito internacional → aduana → PLAN), nacional (proveedor → PLAN) y directo a tienda.
Etapas: Con proveedor, Tránsito internacional, Aduana, PLAN Almacén, PLAN Cross dock, Bodega regional, Fulfillment, Foro fotográfico, En tránsito a tienda, Tienda sin entrada, Recibido.
Estatus de importación: 01 Pendiente de embarque y 02 En almacén (bodega del proveedor antes de embarcar) = Con proveedor; 03 En tránsito = Tránsito internacional; 04 En aduana = Aduana; 05 En CEDIS = PLAN Almacén.
Atorado = días sin moverse en su etapa > umbral editable (con proveedor solo si ya pasó su fecha compromiso). Vencido = no llegó a CEDIS y ya pasó la fecha compromiso. Traslado vencido = sigue en cross dock con traslado abierto más días que el umbral.
Si en ruta lleva más que el p90 de entrega de su zona, se asume que ya llegó y está "en tienda sin entrada". Importación en USD se convierte al tipo de cambio del día de la OC.`,
  },
  {
    id: 'demanda', modulo: 'demanda', titulo: 'Diagnóstico de demanda',
    keywords: ['demanda', 'diagnostico', 'suave', 'erratico', 'intermitente', 'irregular', 'adi', 'cv2', 'basico', 'temporada'],
    texto: `Clasifica cada modelo (CSV de BigQuery MODELO × SEMANA) con Syntetos-Boylan entre su 1a y última semana con venta:
ADI = semanas ÷ semanas con venta; CV² = (desv. est. ÷ promedio)² de las semanas con venta; cortes 1.32 y 0.49.
Suave (ADI<1.32, CV²<0.49), Errático (ADI<1.32, CV²≥0.49), Intermitente (ADI≥1.32, CV²<0.49), Irregular (ADI≥1.32, CV²≥0.49). Necesita 26 semanas de vida.
Acción: Básico (resurtido continuo), Temporada (compra única y plan de salida), Falla de inventario (revisar mínimos y distribución), No sirve (liquidar → Nulo Movimiento), Mantener / revisar, En observación. El diagnóstico se ve en el detalle de Nulo.`,
  },
  {
    id: 'forecast', modulo: 'forecast', titulo: 'Forecasting',
    keywords: ['forecast', 'pronostico', 'regresion', 'wmape', 'accuracy', 'backtest', 'estacional'],
    texto: `Pronóstico por marca con varios motores (regresión lineal con ajuste estacional, entre otros) y 4 escenarios IS.
Backtest: entrena sin los últimos periodos, los pronostica y mide accuracy = 100 − WMAPE; en automático busca los mejores parámetros. El motor ganador se re-entrena con toda la historia para el pronóstico final. Forecast Nuevos usa un análogo del portafolio y lo escala.`,
  },
  {
    id: 'resurtido', modulo: 'resurtido', titulo: 'Resurtido',
    keywords: ['resurtido', 'reposicion', 'replenishment', 'pedido sugerido', 'lead time', 'seguridad'],
    texto: `Reposición por días de inventario: pedido = demanda/día × (lead time + WOS objetivo + seguridad) − (OH + OO), con ajustes por cluster de tienda (CSV o A/B/C automático) y forecast por GOA.`,
  },
  {
    id: 'suplementarios', modulo: 'suplementarios', titulo: 'Suplementarios',
    keywords: ['suplementarios', 'otb marca', 'proveedor', 'ipf', 'bajada'],
    texto: `Baja el OTB mensual (venta, mkds, CMSI, compra, utilidad, inventario) a marca o proveedor con ajuste proporcional iterativo (IPF): respeta la estacionalidad histórica de cada entidad y siempre cuadra al OTB del mes. Las celdas editadas a mano quedan fijas.`,
  },
  {
    id: 'assortment', modulo: 'assortment', titulo: 'Assortment',
    keywords: ['assortment', 'surtido', 'clusters', 'curvas', 'bucket', 'preventa', 'chequeras', 'capacidad'],
    texto: `Presupuesto de compra y OTB mensual en 7 pasos (Tiendas y clústeres, Curvas y reglas, Forecast, Compra Ppto/Preventa, Reportes/Plan OTB, VS compra real, Generador de chequeras).
La resultante da piezas y modelos por mes por GOA × Bucket × Regla (OPP/MID/MAX con su PVP y %); la curva solo reparte tallas por centro. Venta × Capacidad: clústeres por venta y m², corridas desde la venta y prueba de espacio.`,
  },
  {
    id: 'distribucion', modulo: 'distribucion', titulo: 'Distribución',
    keywords: ['distribucion', 'push', 'pack', 'curva de tallas', 'fill rate'],
    texto: `Surtido inicial por cluster en 4 modos (Push, Dispersión GOA, Size-Level, Pack), con demanda corregida por agotados, curva de tallas, topes de MOS, fill rate y curva estacional retail MX (dic pico, ene-feb débil, may día de las madres, jun-ago regreso a clases, nov Buen Fin).`,
  },
  {
    id: 'dispersion', modulo: 'dispersion', titulo: 'Dispersión',
    keywords: ['dispersion', 'r2', 'r cuadrada', 'venta vs inventario'],
    texto: `Mide qué tan alineado está el inventario con la venta entre tiendas: R² entre inventario promedio y venta (como RSQ del Excel "Resumen"), por sección y mes, omitiendo tiendas sin venta o con inventario ≤ 0. Al juntar meses el stock se promedia. Tiene histórico LY vs TY.`,
  },
  {
    id: 'traslados', modulo: 'traslados', titulo: 'Traslados',
    keywords: ['traslados', 'excedente', 'nivelacion', 'clima', 'corrida completa', 'zona'],
    texto: `Movimiento entre tiendas: excedente de temporada por clima, aperturas por corrida completa y nivelación por MOS (misma zona, metro, todas u óptimo en cascada), excluyendo bodegas y bajando a SKU. Un centro sin clima conocido no envía ni recibe por clima.`,
  },
  {
    id: 'chequera', modulo: 'chequera', titulo: 'Chequera',
    keywords: ['chequera'],
    texto: `Información de modelos a nivel SKU para organizar y administrar la compra (externa y propia).`,
  },
  {
    id: 'eventos', modulo: 'eventos', titulo: 'Eventos',
    keywords: ['eventos', 'promocion', 'buen fin', 'bts', 'navidad', 'snapshot', 'remanente'],
    texto: `Venta, margen, sell-through y remanente de eventos promocionales vs el año anterior. Con el snapshot de inventario al arranque (OH, precio y letra por SKU) y las ventas del evento (BigQuery, TY y LY en ventanas de 3 días): sell-through = unidades vendidas en el evento ÷ OH inicial (tope 100%). Los eventos se comparten entre usuarios.`,
  },
  {
    id: 'allocation', modulo: 'allocation', titulo: 'Allocation',
    keywords: ['allocation', 'parametrizacion', 'zo9', 'minimos', 'maximos', 'oc', 'destalle'],
    texto: `Reportero de parametrizaciones ZO9_DM (matriz de marca, clima, AP8, WOS, compra vs mínimos, curvas, clusters) y de OC (mínimos, destalle, picos, concentración). Dice qué está mal, dónde y a qué cambiarlo, y baja el CSV corregido.`,
  },
  {
    id: 'validador', modulo: 'validador', titulo: 'Validador de parametrizaciones',
    keywords: ['validador', 'o9', 'afectacion', 'combinaciones'],
    texto: `Revisa la parametrización ZO9_DM que viaja de O9: tabla de combinaciones artículo × centro con filtro de forecast sí/no, resumen por tipo de afectación y CSV corregido para volver a cargar en O9.`,
  },
  {
    id: 'planning', modulo: 'planning', titulo: 'Planning',
    keywords: ['planning', 'mejor estimado', 'canal', 'plan financiero'],
    texto: `Construye el Mejor Estimado, ajusta el OTB, alinea canales y baja el plan a nivel tienda (usa regresión lineal sobre el histórico).`,
  },
  {
    id: 'comparador', modulo: 'comparador', titulo: 'Radar Competencia',
    keywords: ['radar', 'competencia', 'comparador', 'precios', 'coppel', 'liverpool', 'amazon'],
    texto: `Cruza tu catálogo SAP contra Coppel, C&A, Cuidado con el Perro, Mercado Libre, Amazon, Elektra, Liverpool y Sanborns (búsqueda web con Gemini por EAN, luego marca+modelo, luego descripción; máx. 5 artículos por escaneo).
Diferencial = (nuestro precio − precio rival efectivo) ÷ precio rival (promo si hay). Recomendación: >10% más caros con inventario (BR > Piso o >20 pzs) → mover letra/promo a ~5% arriba del más barato; caros con poco stock → sostener; >10% más baratos → espacio para cuidar margen.`,
  },
];

// Formatos de archivo por módulo (salen de csvSchemas, una sola fuente)
const FORMATOS = CSV_SCHEMAS.map((s) => ({
  id: `csv-${s.module}`, titulo: `Formato de archivo · ${s.module}`,
  keywords: ['csv', 'archivo', 'formato', 'columnas', 'plantilla', 'cargar', s.module.toLowerCase()],
  texto: s.formats.map((f) => `${f.title}: ${f.desc}${f.columns?.length ? ` Columnas: ${f.columns.join(', ')}.` : ''}`).join('\n'),
}));

export const KB = [...BASE, ...FORMATOS];

const normTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Secciones más relevantes para una pregunta (y el módulo abierto)
export function kbSearch(question, activeModule, k = 3) {
  const q = normTxt(question);
  const words = q.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2);
  const scored = KB.map((e) => {
    let s = 0;
    e.keywords.forEach((kw) => { if (q.includes(normTxt(kw))) s += 3; });
    const body = normTxt(`${e.titulo} ${e.texto}`);
    words.forEach((w) => { if (body.includes(w)) s += 1; });
    if (e.modulo && e.modulo === activeModule) s += 2;
    return { e, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map((x) => x.e);
}

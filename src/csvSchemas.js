// csvSchemas.js — Formato de CSV que espera cada módulo de GO PLANNER.
// Fuente: extraído directo de los parsers/guías que ya viven en cada módulo
// (ModuleXxx.jsx) al día en que se escribió esto. Si cambias un parser,
// actualiza su entrada aquí — es un array plano, no hace falta tocar layout.

export const CSV_SCHEMAS = [
  {
    module: 'Forecasting',
    formats: [
      {
        title: 'Histórico de marcas',
        desc: 'Sin fila de encabezado. Cada línea es una marca: primera columna el nombre, el resto valores mensuales separados por coma.',
        columns: [],
        template: [['MARCA A', 1200, 1000, 1500, 1300], ['MARCA B', 800, 750, 900, 950]],
      },
    ],
  },
  {
    module: 'Suplementarios',
    formats: [
      {
        title: 'OTB + histórico por marca / proveedor',
        desc: 'Una fila por Tipo × Marca × Ratio (acepta .csv o .xlsx). Tipo: OTB (sin marca), HIST (año en curso, real hasta el corte; el resto se pronostica = IS → LY del plan) o REAL (año anterior cerrado → LLY del plan). Ratio: VENTA, MKDS, CMSI, COMPRA, UTILIDAD, INVENTARIO (inv inicial de cada mes; Cierre = inv final de Dic). La columna Marca también puede llamarse Proveedor.',
        columns: ['Tipo', 'Marca', 'Ratio', 'Ene … Dic', 'Cierre'],
        template: [
          ['Tipo', 'Marca', 'Ratio', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Cierre'],
          ...['VENTA', 'MKDS', 'CMSI', 'COMPRA', 'UTILIDAD', 'INVENTARIO'].map((r) => ['OTB', '', r, ...Array(12).fill(0), r === 'INVENTARIO' ? 0 : '']),
          ...['HIST', 'REAL'].flatMap((tp) => ['VENTA', 'MKDS', 'CMSI', 'COMPRA', 'UTILIDAD', 'INVENTARIO'].map((r) => [tp, 'MARCA A', r, ...Array(12).fill(0), r === 'INVENTARIO' ? 0 : ''])),
        ],
      },
    ],
  },
  {
    module: 'Pedidos',
    formats: [
      {
        title: 'Extracto BigQuery PEDIDOS_TRACK (recomendado)',
        desc: 'Una fila por OC × tienda. FCH_OC = colocada con proveedor; DT_CEDIS = recibida en PLAN (almacén); DT_PLAN = asignada (si es después de recibir pasa a cross dock / in process); DT_SALIDA = sale a tienda (in transit); DT_TIENDA = llegó a tienda. Las piezas por tienda salen de PZS_ASIG. TIPO NACIONAL / IMPORTACION; CENTRO_OC con número de tienda = directo a tienda. COMPROMISO es la fecha del proveedor: "a tiempo" se mide contra la llegada a CEDIS y "atorado con proveedor" solo cuenta si ya pasó. ZONA agrupa las tiendas en el mapa; TIPO_DESTINO = BODEGA va a bodegas regionales. COSTO_ASIG da el $ por nodo: en importación viene en dólares y se convierte con el tipo de cambio del día de FCH_OC. Para ver importación en tránsito o aduana hacen falta fechas de embarque y aduana (aún no vienen en el extracto).',
        columns: ['OC*', 'TIPO', 'SECCION', 'GOA', 'PROVEEDOR', 'FCH_OC', 'COMPROMISO', 'PZS_PEDIDAS', 'PZS_REC_CEDIS', 'DT_CEDIS*', 'CENTRO_OC', 'TIENDA', 'ZONA', 'TIPO_DESTINO', 'PZS_ASIG', 'COSTO_ASIG', 'DT_PLAN', 'PZS_SALIDA', 'DT_SALIDA', 'PZS_TIENDA', 'DT_TIENDA', 'ESTATUS'],
      },
      {
        title: 'Eventos de pedidos (una fila por evento)',
        desc: 'Cada vez que la OC cambia de etapa o de lugar. ETAPA se reconoce por texto: proveedor / on order, tránsito o embarque, aduana o pedimento, PLAN almacén (CEDIS), cross dock / in process, bodega regional (la ciudad va en UBICACION), fulfillment / e-commerce, foro fotográfico, ruta / in transit, tienda (sin entrada), recibido / entrada / GR. TIPO_PEDIDO: IMP, NAC o DIRECTO (si falta se deduce: con aduana = importación; a tienda sin pasar por PLAN = directo). ZONA agrupa tiendas en el mapa (hasta 6). Fechas AAAA-MM-DD o DD/MM/AAAA con hora opcional. También acepta formato ancho: una fila por OC con FECHA_PROVEEDOR, FECHA_ADUANA, FECHA_PLAN, FECHA_CROSS_DOCK, FECHA_TIENDA, FECHA_RECIBIDO.',
        columns: ['OC*', 'SKU', 'MODELO', 'PROVEEDOR', 'MARCA', 'TIPO_PEDIDO', 'PIEZAS_PEDIDAS', 'PIEZAS_EVENTO', 'ETAPA*', 'UBICACION', 'CENTRO', 'ZONA', 'FECHA_EVENTO*', 'FECHA_OC', 'FECHA_COMPROMISO', 'CONTENEDOR'],
        template: [['OC', 'SKU', 'MODELO', 'PROVEEDOR', 'MARCA', 'TIPO_PEDIDO', 'PIEZAS_PEDIDAS', 'PIEZAS_EVENTO', 'ETAPA', 'UBICACION', 'CENTRO', 'ZONA', 'FECHA_EVENTO', 'FECHA_OC', 'FECHA_COMPROMISO', 'CONTENEDOR'], ['4500123456', 'ZAP025', 'ZAP-025', 'SKECHERS', 'SKECHERS', 'IMP', '600', '600', 'ADUANA', 'Manzanillo', '', '', '2026-10-01', '2026-08-15', '2026-10-20', 'MSKU700001']],
      },
    ],
  },
  {
    module: 'Nulo Movimiento',
    formats: [
      {
        title: 'Base SKU × centro (CSV de BigQuery u hoja BASE del Excel Nulo Propuesta)',
        desc: 'Una fila por SKU × centro con inventario (tiendas y bodegas: centros con S al final o CR / PLAN se marcan como bodega). Nulo = #Meses desde Ult Vta > umbral (3 por default, editable por sección). Si no trae #Meses, se calcula con Mes Ultima Vta (JUL 2026, fecha o AAAA-MM) contra el mes de corte. ">14 meses" / sin venta → cuenta la antigüedad desde Mes 1a Recepción + Año Recepción (o Fecha de Primera Rec semana.año). Se lee por streaming: CSV recomendado para 1M+ filas.',
        columns: ['# Sección', 'Sección', 'Zona de ventas', 'Centro*', 'Tienda', 'Proveedor', 'Grupo artículos', 'Marca', 'Estatus del Artículo', 'Norma de Aprovisionamiento', 'Letra Actual', 'SKU*', 'Artículo', 'Pzs*', 'Monto*', 'Mes Ultima Vta', '#Meses desde Ult Vta*', 'Mes 1a Recepción', 'Año Recepción', 'Fecha de Primera Rec'],
        template: [['# Sección', 'Sección', 'Zona de ventas', 'Centro', 'Tienda', 'Proveedor', 'Grupo artículos', 'Marca', 'Estatus del Artículo', 'Norma de Aprovisionamiento', 'Letra Actual', 'SKU', 'Artículo', 'Pzs', 'Monto', 'Mes Ultima Vta', '#Meses desde Ult Vta', 'Mes 1a Recepción', 'Año Recepción'], ['892', 'ZAPATOS NIÑO', 'METRO NORTE', '0529', 'SATELITE', 'ADIDAS DE MEXICO SA DE CV', 'TENIS NIÑO', 'ADIDAS', 'ACTIVO', 'Compra única', 'RG', '5012345678', 'TENIS NIÑO 20', '3', '1499.1', 'ABR 2026', '4', 'Octubre', '2025']],
      },
    ],
  },
  {
    module: 'Diagnóstico de demanda',
    formats: [
      {
        title: 'Venta modelo × semana (CSV de BigQuery, vista VEIL_ANALISIS_VTAS_DIARIAS)',
        desc: 'Una fila por MODELO × SEMANA (lunes, AAAA-MM-DD) a nivel cadena, idealmente 104 semanas. Clasifica la demanda (ADI / CV²) y propone accionable: Básico, Temporada, Falla de inventario, No sirve.',
        columns: ['SEMANA*', 'SECCION', 'GOA', 'MARCA', 'MODELO*', 'TEMPORADA', 'LETRA_ACTUAL', 'VTA_U*', 'VTA_U_DESC', 'VTA_P', 'DESC_P', 'TIENDAS_CON_VTA', 'TIENDAS_ACTIVAS'],
        template: [['SEMANA', 'SECCION', 'GOA', 'MARCA', 'MODELO', 'TEMPORADA', 'LETRA_ACTUAL', 'VTA_U', 'VTA_U_DESC', 'VTA_P', 'DESC_P', 'TIENDAS_CON_VTA', 'TIENDAS_ACTIVAS'], ['2026-09-28', 'ZAPATOS NIÑO', 'CHANCLA', 'MARCA X', 'E-8008-NINO', 'PRIMAVERA - VERANO', 'Sin Asignar', '120', '20', '14500.5', '310.2', '85', '192']],
      },
    ],
  },
  {
    module: 'Allocation',
    formats: [
      {
        title: 'ZO9_DM (Red Logística)',
        desc: 'Obligatorio en cada revisión. Solo el export crudo de parametrizaciones, sin las columnas de fórmulas (A–N, AG–AW) de la plantilla de validación. Acepta .xlsx o .csv; cada hoja se reconoce por encabezados, no por nombre. Los archivos pueden cargarse juntos (selección múltiple) o por separado.',
        columns: ['Gpo.Art.', 'Proveedor', 'Marca', 'Gen. / Ind.', 'Var. / Ind.', 'Descripción', 'BT', 'Centro', 'AP N', 'Nivel Forecast N', 'Stock Min. N', 'Stock Max. N', 'WOS N', 'Plazo Ent. N', 'AA threshold N', 'Allocation Min. N', 'Allocation Max. N', 'Store Priority N'],
        template: [['Gpo.Art.', 'Proveedor', 'Marca', 'Gen. / Ind.', 'Var. / Ind.', 'Descripción', 'BT', 'Centro', 'AP N', 'Nivel Forecast N', 'Stock Min. N', 'Stock Max. N', 'WOS N', 'Plazo Ent. N', 'AA threshold N', 'Allocation Min. N', 'Allocation Max. N', 'Store Priority N']],
      },
      {
        title: 'BASE_FECHAS O9 (ZRT_FECHASO9)',
        desc: 'Obligatorio. Da el mes de inicio de temporada (clima del mes, compra del mes), las semanas para validar WOS y el check de inicio en lunes.',
        columns: ['Material', 'Fecha in de temp.', 'Fecha fin de temp.'],
        template: [['Material', 'Fecha in de temp.', 'Fecha fin de temp.']],
      },
      {
        title: 'COMPRA_MES (chequera a nivel SKU)',
        desc: 'Obligatorio para las reglas de compra vs Σ Stock Min y curva de tallas.',
        columns: ['Artículo', 'MES', 'Piezas'],
        template: [['Modelo', 'Artículo', 'Descripción grupo', 'MES', 'Piezas', 'Proveedor']],
      },
      {
        title: 'CATALOGO (ZSCLB1)',
        desc: 'Obligatorio. De las ~70 columnas del catálogo solo se leen estas; el resto puede ir o no.',
        columns: ['Artículo', 'Modelo', 'Color', 'Talla', 'Descripción grupo', 'Denominación marca', 'Descr. Proveedor (opcional)'],
      },
      {
        title: 'BASE (matrices)',
        desc: 'Se carga una vez: queda guardada en el navegador hasta que subas otra. Tablas lado a lado: matriz marca × centro con clima y cluster; Código-Marca-Agrupador (licencias); Código de grupo-Grupo-Tipo de mercancía (INVERNAL/CALOR/ATEMPORAL); Centro-AP (centros AP7); CEDIS y fullfilment.',
        columns: ['Centro', 'Zona', 'Desc Centro', 'Clima', 'MARCA', 'VA / NO VA', 'Cluster', 'CODIGO · MARCA_CAT · AGRUPADOR', 'CODIGO · MARCA_CAT · TIPO MERCANCÍA', 'CENTRO · AP', 'CEDIS Y FULLFILMENT'],
      },
      {
        title: 'MATRIZ CLIMA',
        desc: 'Se carga una vez (queda guardada). Clima general y por mes 1–12 de cada centro.',
        columns: ['DET', 'CLIMA GENERAL', '1 … 12'],
        template: [['DET', 'BLOQUE', 'TIENDAS', 'PLAZA', 'ZONA', 'FORMATO', 'CLIMA GENERAL', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
      },
      {
        title: 'ZO9_MARA (opcional)',
        desc: 'Solo para validar Allocation coverage vs semanas de temporada. Sin ella esa regla no corre.',
        columns: ['Material', 'Allocation coverage'],
        template: [['Grupo art.', 'Material', 'Threshold centralización', 'Allocation coverage', 'EOL', 'EOL ALL']],
      },
      {
        title: 'OC / pedidos',
        desc: 'Para el tab OC. Se cruza artículo × centro contra la parametrización ya corregida. PASOS y VALIDACIONES de la plantilla no se usan.',
        columns: ['Var. / Ind. / Artículo / SKU*', 'Centro*', 'Cantidad*', 'OC (opcional)'],
        template: [['OC', 'Var. / Ind.', 'Centro', 'Cantidad']],
      },
    ],
  },
  {
    module: 'Assortment OTB',
    formats: [
      {
        title: 'Base de tiendas',
        desc: 'Una fila por tienda.',
        columns: ['Centro o CENTRO_KEY', 'Nombre', 'GOA / Familia', 'Ventas en unidades (VENTAS o VENTA_U)', 'Utilidad en $ (opcional)', 'Rotación (opcional)', 'PVP + VENTA_P (opcional: mezcla de precio y descuento por bucket)'],
      },
      {
        title: 'CSV de preventa (para Allocation)',
        desc: 'Se cruza contra la matriz para generar el archivo de allocation.',
        columns: ['GOA', 'Modelo', 'Curva', 'Regla'],
      },
      {
        title: 'Histórico de compra LY/LLY (Tab 4, sugerido de reglas y buckets)',
        desc: 'Una fila por compra. Por GOA (y por bucket si traes BUCKET) los precios se agrupan en hasta 3 escalones cortando en los saltos de precio más grandes (ej. 499/549 | 799 | 999): cada escalón se vuelve una regla OPP / MID / MAX (la que lleve ese texto y el nombre del bucket) con su PVP (el precio con más piezas) y su % (en $). Con BUCKET también sugiere la mezcla de buckets y apaga los de <5%.',
        columns: ['GOA*', 'PVP*', 'PIEZAS', 'VALOR (opcional)', 'BUCKET (opcional)', 'AÑO (opcional)'],
      },
      {
        title: 'Base de tiendas (estrategia Venta × Capacidad)',
        desc: 'Mismo archivo base (Centro, GOA, Ventas en piezas). La venta de 12 meses define el tercil A/B/C por GOA y el peso de cada tienda en el reparto.',
        columns: ['Centro*', 'Nombre', 'GOA*', 'Ventas (pzs 12M)*'],
      },
      {
        title: 'Capacidad por tienda (Tab 1, estrategia Venta × Capacidad)',
        desc: 'CSV o Excel. CAPACIDAD en piezas manda sobre m² (m² × pzs por m²). Da el tercil Alta/Media/Baja y el tope de espacio de la resultante.',
        columns: ['CENTRO*', 'CAPACIDAD (pzs)', 'M2 / M2 Actuales'],
      },
      {
        title: 'Mezcla PVP por tienda (Tab 1, opcional si la base ya trae PVP)',
        desc: 'Venta por tienda × PVP inicial. Cada PVP cae en el bucket por su rango: da la afinidad de cada clúster por precio y el descuento histórico por bucket (el OTB está a venta neta).',
        columns: ['CENTRO_KEY*', 'GOA', 'PVP*', 'VENTA_U*', 'VENTA_P'],
      },
    ],
  },
  {
    module: 'Distribución',
    formats: [
      {
        title: 'Base de tiendas',
        desc: 'CENTRO, GOA y VENTAS son obligatorias.',
        columns: ['CENTRO*', 'GOA*', 'VENTAS*', 'OH (recomendado)', 'NOMBRE / ZONA / MARGEN / ROTACION (opcionales)'],
      },
      {
        title: 'Matriz de marcas',
        desc: 'Fila superior con códigos de tienda. Columna MARCA o NOM_MARCA es obligatoria.',
        columns: ['MARCA / NOM_MARCA*', '(códigos de centro como columnas)'],
      },
      {
        title: 'Chequera / curva de tallas',
        desc: 'En cantidad puedes separar varias tallas con coma (10,15,20).',
        columns: ['SECCION', 'GOA', 'MARCA', 'MODELO', 'SKU', 'COLOR', 'TALLA', 'CANTIDAD'],
      },
    ],
  },
  {
    module: 'Resurtido',
    formats: [
      {
        title: 'Base de artículos',
        desc: 'Una fila por artículo × centro. Ventas mensuales m1_a1..m12_a1 (año anterior) y m1_a2..m12_a2 (año actual) o semanales s1..s52. Acepta coma, punto y coma o tabulador, UTF-8 o ANSI (ñ/acentos se corrigen). NIVEL (opcional, 1/0) marca las combinaciones parametrizadas: nivel 1 siempre recibe al menos el mínimo aunque no tenga venta, nivel 0 se queda vacía y no cuenta como stockout. CLUSTER (opcional) agrupa tiendas para darles lead time, WOS, seguridad y mínimo distintos; sin él se arman A/B/C por venta (20/30/50%). Pedido = demanda/día × (lead + WOS + seguridad) − (OH+OO). La tabla muestra 300 filas a la vez; totales y gráficas usan toda la base.',
        columns: ['Centro', 'CLUSTER (opcional)', 'Seccion', 'Marca', 'GOA', 'Modelo', 'SKU', 'Nombre', 'Norma', 'NIVEL (opcional)', 'OH', 'OO', 'm1_a1..m12_a2 ó s1..s52'],
      },
    ],
  },
  {
    module: 'Planning',
    formats: [
      {
        title: 'Histórico (formato wide, 3 filas de header)',
        desc: 'Fila 1: Año/Mes_natural · Fila 2: Canal_de_Venta (Piso/Digital/Sin asignar) · Fila 3: Métricas (Vtas_U, Vtas_$, %GM, Markdown, Costo_MSI).',
        columns: ['Seccion', 'N_Seccion', 'Centro', 'N.Seccion', 'Tipo_Tda', 'GOA', 'Medida'],
      },
    ],
  },
  {
    module: 'Dayli',
    formats: [
      {
        title: 'Ventas diarias TY + LY',
        desc: 'Un solo archivo con este año y el pasado (el año sale de FECHA). Acepta coma, punto y coma o tabulador. SECCION puede venir como número si agregas #SECCION con el nombre.',
        columns: ['DIVISION', 'SECCION', '#SECCION', 'GOA', 'MARCA', 'NORMA', 'CANAL', 'TIPO_PAGO', 'FECHA*', 'VENTA_PESOS*', 'VENTA_U', 'MG', 'UTILIDAD', 'MARKDOWN'],
      },
      {
        title: 'Inventario',
        desc: 'Foto de inventario por ubicación. Si no hay TIPO_UBICACION se deduce: S- = logístico, BODEGA/BDG = bodega, PLAN/P- = plan, lo demás tienda. OH_PESOS / OO_PESOS (opcionales) dan el inventario en $ real; sin ellas se estima con el precio promedio de venta por sección.',
        columns: ['DIVISION', 'SECCION', '#SECCION', 'GOA', 'MARCA', 'NORMA', 'UBICACION', 'TIPO_UBICACION', 'OH', 'OO', 'OH_PESOS', 'OO_PESOS', 'COSTO_VENDIDO', 'UTILIDAD_VENDIDA', 'COMPRADO', 'NACIONAL', 'IMPORTACION', 'VENTA'],
      },
      {
        title: 'Calendario de promociones',
        desc: 'Una fila por promo. Usa FECHA_FIN o DIAS para rangos; sin SECCION/MARCA aplica a todo. UPLIFT = % extra de venta esperado (20 = +20%).',
        columns: ['NOMBRE', 'FECHA_INICIO*', 'FECHA_FIN', 'DIAS', 'SECCION', 'MARCA', 'UPLIFT'],
      },
    ],
  },
  {
    module: 'Dispersión',
    formats: [
      {
        title: 'Venta vs inventario por tienda (mensual)',
        desc: 'Una fila por tienda × mes × jerarquía. Acepta variaciones de nombre (VTAS, VENTAS, PROM_INV, INV_INICIAL…).',
        columns: ['AÑO', 'MES', 'DIRECCION', 'DIVISION', 'SECCION', 'NORMA', 'GRUPO_ARTICULOS', 'PROVEEDOR', 'MARCA', 'CENTRO', 'TIENDA', 'VTAS_PESOS', 'PROM_INVENTARIO', 'INVENTARIO_INICIAL', 'INVENTARIO_FINAL', 'INVENTARIO_IDEAL'],
      },
    ],
  },
  {
    module: 'Chequera',
    formats: [
      {
        title: 'Marca externa / Marca propia',
        desc: 'El importador auto-detecta tus encabezados por sinónimos (ej. "codigo", "clave" o "modelo" todos matchean a SKU) y te deja corregir el match antes de confirmar.',
        columns: ['SKU / Modelo', 'Marca', 'Proveedor', 'GOA', 'Talla', 'Color', 'Especificaciones', 'Mes recepción', 'Mes preventa', 'Mes real', 'Cantidad (pzs)', 'PVP'],
      },
    ],
  },
  {
    module: 'Traslados',
    formats: [
      {
        title: 'Base de artículos',
        desc: 'OH, VTA y VTA_3M en piezas o en pesos (botón "OH en pesos/piezas"; cambiarlo re-convierte lo cargado). Pesos de BI vienen sin IVA y PRECIO con IVA: piezas = pesos ÷ (PRECIO ÷ 1.16) (botón "Pesos sin IVA"). VTA = acumulada del año (se divide entre el mes actual). VTA_3M en 0 = sin venta real en 3 meses. Clima de centro desconocido ("Sin asignar") = no sale ni recibe por clima; cárgalo con la matriz. Bodegas/PLAN/CEDIS se excluyen por nombre y puedes excluir centros a mano. Opcional: FECHA_ALTA o MESES_VIDA.',
        columns: ['SECCION', 'NOMBRE', 'GOA*', 'CENTRO*', 'N_CENTRO', 'TIPO CENTRO', 'ZONA*', 'MARCA', 'MODELO', 'SKU*', 'NSKU', 'PRECIO*', 'VTA', 'OH*', 'VTA_3M', 'VTA_MES_ANT', 'LETRA_DESC', 'FECHA_ALTA (opcional)', 'MESES_VIDA (opcional)'],
      },
    ],
  },
];

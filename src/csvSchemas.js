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
      },
    ],
  },
  {
    module: 'Assortment OTB',
    formats: [
      {
        title: 'Base de tiendas',
        desc: 'Una fila por tienda.',
        columns: ['Centro', 'Nombre', 'GOA / Familia', 'Ventas en unidades', 'Utilidad en $ (opcional)', 'Rotación (opcional)'],
      },
      {
        title: 'CSV de preventa (para Allocation)',
        desc: 'Se cruza contra la matriz para generar el archivo de allocation.',
        columns: ['GOA', 'Modelo', 'Curva', 'Regla'],
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
        desc: 'El motor usa GOA, centro, OH, OO e histórico de ventas/tendencia. Marca, modelo y sku_nombre son opcionales, solo para ver el detalle completo. Exporta tu Excel como CSV UTF-8 delimitado por comas.',
        columns: ['GOA', 'Centro', 'OH', 'OO', 'marca (opcional)', 'modelo (opcional)', 'sku_nombre (opcional)'],
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
        title: 'Ventas TY + LY combinado',
        desc: 'Un solo archivo con este año y el pasado. Trae venta, costo, margen, inventario y tendencia por sección/canal/división — el listado exacto de encabezados todavía no está documentado en el propio módulo, así que si quieres el detalle línea por línea dime y lo sacamos del parser.',
        columns: [],
      },
    ],
  },
  {
    module: 'Dispersión',
    formats: [
      {
        title: 'Cualquier CSV con encabezados',
        desc: 'No hay columnas fijas: subes tu CSV y dentro de la app eliges qué columna es Tienda, Venta, Promedio, etc. Solo necesita traer una fila de encabezados.',
        columns: [],
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
        desc: 'Opcional: FECHA_ALTA o MESES_VIDA (si no vienen, usa la lista manual dentro del módulo).',
        columns: ['GOA*', 'SKU*', 'CENTRO*', 'OH*', 'ZONA*', 'TIPO_CENTRO*', 'FECHA_ALTA (opcional)', 'MESES_VIDA (opcional)'],
      },
    ],
  },
];

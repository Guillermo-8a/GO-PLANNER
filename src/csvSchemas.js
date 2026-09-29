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
        desc: 'Una fila por Tipo × Marca × Ratio (acepta .csv o .xlsx). Tipo: OTB (sin marca), HIST (año anterior) o REAL (año en curso, para base IS). Ratio: VENTA, MKDS, CMSI, COMPRA, UTILIDAD, INVENTARIO (inv inicial de cada mes; Cierre = inv final de Dic). La columna Marca también puede llamarse Proveedor.',
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
        title: 'Ventas diarias TY + LY',
        desc: 'Un solo archivo con este año y el pasado (el año sale de FECHA). Acepta coma, punto y coma o tabulador. SECCION puede venir como número si agregas #SECCION con el nombre.',
        columns: ['DIVISION', 'SECCION', '#SECCION', 'GOA', 'MARCA', 'NORMA', 'CANAL', 'TIPO_PAGO', 'FECHA*', 'VENTA_PESOS*', 'VENTA_U', 'MG', 'UTILIDAD', 'MARKDOWN'],
      },
      {
        title: 'Inventario',
        desc: 'Foto de inventario por ubicación. Si no hay TIPO_UBICACION se deduce: S- = logístico, BODEGA/BDG = bodega, PLAN/P- = plan, lo demás tienda.',
        columns: ['DIVISION', 'SECCION', '#SECCION', 'GOA', 'MARCA', 'NORMA', 'UBICACION', 'TIPO_UBICACION', 'OH', 'OO', 'COSTO_VENDIDO', 'UTILIDAD_VENDIDA', 'COMPRADO', 'NACIONAL', 'IMPORTACION', 'VENTA'],
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
        desc: 'Opcional: FECHA_ALTA o MESES_VIDA (si no vienen, usa la lista manual dentro del módulo).',
        columns: ['GOA*', 'SKU*', 'CENTRO*', 'OH*', 'ZONA*', 'TIPO_CENTRO*', 'FECHA_ALTA (opcional)', 'MESES_VIDA (opcional)'],
      },
    ],
  },
];

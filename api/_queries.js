// Catálogo de consultas permitidas (whitelist). El front solo puede pedir estas por nombre;
// nunca se ejecuta SQL que venga del navegador.
// Cada SELECT usa alias = encabezados que ya esperan los parsers de cada módulo,
// así el CSV que regresa /api/bq entra tal cual al módulo sin tocar su parser.
// `${DS}` se reemplaza por `proyecto.dataset` (env GCP_PROJECT_ID + GCP_DATASET).
// TODO: reemplazar nombres de tabla/columna por los reales cuando se confirmen en BigQuery.

export const QUERIES = {
  // Prueba de conexión — no toca tablas.
  ping: {
    sql: () => `SELECT CURRENT_TIMESTAMP() AS ahora, 'ok' AS estado`,
  },

  // Resurtido: GOA × Centro con OH/OO (+ ventas mensuales LY/TY en columnas).
  resurtido: {
    sql: (DS) => `
      SELECT goa AS GOA, centro AS Centro, oh AS OH, oo AS OO,
             marca, modelo, sku_nombre
      FROM \`${DS}.TODO_inventario_resurtido\``,
  },

  // Dayli: ventas diarias TY + LY.
  dayli_ventas: {
    params: ['desde'],
    sql: (DS) => `
      SELECT division AS DIVISION, seccion AS SECCION, n_seccion AS \`#SECCION\`, goa AS GOA,
             marca AS MARCA, norma AS NORMA, canal AS CANAL, tipo_pago AS TIPO_PAGO,
             FORMAT_DATE('%Y-%m-%d', fecha) AS FECHA, venta_pesos AS VENTA_PESOS, venta_u AS VENTA_U,
             mg AS MG, utilidad AS UTILIDAD, markdown AS MARKDOWN
      FROM \`${DS}.TODO_ventas_diarias\`
      WHERE fecha >= @desde`,
  },

  // Dayli: foto de inventario por ubicación.
  dayli_inventario: {
    sql: (DS) => `
      SELECT division AS DIVISION, seccion AS SECCION, n_seccion AS \`#SECCION\`, goa AS GOA,
             marca AS MARCA, norma AS NORMA, ubicacion AS UBICACION, tipo_ubicacion AS TIPO_UBICACION,
             oh AS OH, oo AS OO
      FROM \`${DS}.TODO_inventario_foto\``,
  },

  // Dispersión: venta vs inventario tienda × mes.
  dispersion: {
    params: ['anio'],
    sql: (DS) => `
      SELECT anio AS \`AÑO\`, mes AS MES, direccion AS DIRECCION, division AS DIVISION, seccion AS SECCION,
             norma AS NORMA, grupo_articulos AS GRUPO_ARTICULOS, proveedor AS PROVEEDOR, marca AS MARCA,
             centro AS CENTRO, tienda AS TIENDA, vtas_pesos AS VTAS_PESOS, prom_inventario AS PROM_INVENTARIO,
             inventario_inicial AS INVENTARIO_INICIAL, inventario_final AS INVENTARIO_FINAL
      FROM \`${DS}.TODO_venta_inventario_mensual\`
      WHERE anio >= @anio`,
  },

  // Traslados: base de artículos GOA × SKU × Centro.
  traslados: {
    sql: (DS) => `
      SELECT goa AS GOA, sku AS SKU, centro AS CENTRO, oh AS OH, zona AS ZONA, tipo_centro AS TIPO_CENTRO
      FROM \`${DS}.TODO_inventario_sku_centro\``,
  },
};

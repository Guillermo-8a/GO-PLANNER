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

  // Eventos: snapshot de arranque (OH cadena + precio + letra por SKU) — foto ACTUAL de SAC.
  // Sin centro: Eventos no lo usa y a nivel centro la respuesta rebasa el límite de Vercel.
  // Correr el día que arranca el evento. @secciones = número o nombre de sección, separados por coma.
  // Encabezados = los que lee parseSnapshotCSV de Eventos (SKU va antes de NSKU para que el alias no se cruce).
  eventos_oh: {
    params: ['secciones'],
    sql: () => `
      SELECT LTRIM(ARTICULO_KEY, '0') AS SKU, ARTICULO AS NSKU, MODELO_PROVEEDOR AS MODELO, MARCA, GRUPO_ARTICULOS AS GOA,
             SECCION, SUM(OH) AS OH,
             MAX(SAFE_CAST(PRECIO_VENTA_ACT AS NUMERIC)) AS PRECIO, NULLIF(UPPER(MAX(LETRA_ACTUAL)), 'REGULAR') AS LETRA_DESC
      FROM \`crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_TAB_VENTAS_MENSUALES_U_S\`
      WHERE (LTRIM(SECCION_KEY, '0') IN UNNEST(ARRAY(SELECT LTRIM(x, '0') FROM UNNEST(SPLIT(REPLACE(@secciones, ' ', ''), ',')) x))
             OR UPPER(SECCION) IN UNNEST(SPLIT(UPPER(@secciones), ',')))
        AND OH > 0
      GROUP BY 1, 2, 3, 4, 5, 6`,
  },

  // Eventos: ventas diarias por SKU en [ini, fin] (YYYY-MM-DD) para las secciones indicadas.
  // El front pide ventanas de pocos días (TY y LY) y las concatena: un rango largo rebasa el límite de respuesta de Vercel.
  // VTAS y TOTAL_DESCUENTOS van en miles (parseSalesCSV de Eventos los multiplica ×1000); GM en pesos.
  eventos_ventas: {
    params: ['ini', 'fin', 'secciones'],
    sql: () => `
      SELECT DIA_PERIODO, LTRIM(ARTICULO_KEY, '0') AS ARTICULO, MODELO_PROVEEDOR, MARCA, GRUPO_ARTICULOS AS GOA,
             SECCION, ESTATUS_ARTICULO AS N_ESTATUS, NORMA_APROVISIONAMIENTO AS NORMA_DE_APROVISIONAMIENTO,
             SUM(VTAS_U) AS VTAS_U, SUM(Vtas_P) / 1000 AS VTAS, SUM(GM) AS GM, SUM(Total_Descuentos) / 1000 AS TOTAL_DESCUENTOS
      FROM \`crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_ANALISIS_VTAS_DIARIAS\`
      WHERE DIA_PERIODO BETWEEN DATE(@ini) AND DATE(@fin)
        AND (LTRIM(SECCION_KEY, '0') IN UNNEST(ARRAY(SELECT LTRIM(x, '0') FROM UNNEST(SPLIT(REPLACE(@secciones, ' ', ''), ',')) x))
             OR UPPER(SECCION) IN UNNEST(SPLIT(UPPER(@secciones), ',')))
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`,
  },

  // GO-Bot (chat): venta agregada por SECCION | GOA | MARCA en [ini, fin]. @filtro = texto libre
  // (sección, GOA o marca; vacío = todo). Top 40 por venta para que la respuesta sea chica.
  chat_ventas: {
    params: ['dim', 'filtro', 'ini', 'fin'],
    sql: () => `
      SELECT CASE @dim WHEN 'GOA' THEN GRUPO_ARTICULOS WHEN 'MARCA' THEN MARCA ELSE SECCION END AS DIM,
             SUM(VTAS_U) AS VTAS_U, ROUND(SUM(Vtas_P)) AS VTAS_P, ROUND(SUM(GM)) AS GM,
             ROUND(SUM(Total_Descuentos)) AS DESCUENTOS
      FROM \`crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_ANALISIS_VTAS_DIARIAS\`
      WHERE DIA_PERIODO BETWEEN DATE(@ini) AND DATE(@fin)
        AND (@filtro = ''
             OR UPPER(SECCION) LIKE CONCAT('%', UPPER(@filtro), '%')
             OR LTRIM(SECCION_KEY, '0') = LTRIM(@filtro, '0')
             OR UPPER(GRUPO_ARTICULOS) LIKE CONCAT('%', UPPER(@filtro), '%')
             OR UPPER(MARCA) LIKE CONCAT('%', UPPER(@filtro), '%'))
      GROUP BY 1
      ORDER BY VTAS_P DESC
      LIMIT 40`,
  },

  // Traslados: base de artículos GOA × SKU × Centro.
  traslados: {
    sql: (DS) => `
      SELECT goa AS GOA, sku AS SKU, centro AS CENTRO, oh AS OH, zona AS ZONA, tipo_centro AS TIPO_CENTRO
      FROM \`${DS}.TODO_inventario_sku_centro\``,
  },
};

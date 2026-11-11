// GENERADO por scripts/gas-queries.mjs — no editar a mano; editar api/_queries.js y regenerar.
const QUERIES = {
  "ping": {
    "params": [],
    "sql": "SELECT CURRENT_TIMESTAMP() AS ahora, 'ok' AS estado"
  },
  "resurtido": {
    "params": [],
    "sql": "\n      SELECT goa AS GOA, centro AS Centro, oh AS OH, oo AS OO,\n             marca, modelo, sku_nombre\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.TODO_inventario_resurtido`"
  },
  "dayli_ventas": {
    "params": [
      "desde"
    ],
    "sql": "\n      SELECT division AS DIVISION, seccion AS SECCION, n_seccion AS `#SECCION`, goa AS GOA,\n             marca AS MARCA, norma AS NORMA, canal AS CANAL, tipo_pago AS TIPO_PAGO,\n             FORMAT_DATE('%Y-%m-%d', fecha) AS FECHA, venta_pesos AS VENTA_PESOS, venta_u AS VENTA_U,\n             mg AS MG, utilidad AS UTILIDAD, markdown AS MARKDOWN\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.TODO_ventas_diarias`\n      WHERE fecha >= @desde"
  },
  "dayli_inventario": {
    "params": [],
    "sql": "\n      SELECT division AS DIVISION, seccion AS SECCION, n_seccion AS `#SECCION`, goa AS GOA,\n             marca AS MARCA, norma AS NORMA, ubicacion AS UBICACION, tipo_ubicacion AS TIPO_UBICACION,\n             oh AS OH, oo AS OO\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.TODO_inventario_foto`"
  },
  "dispersion": {
    "params": [
      "anio"
    ],
    "sql": "\n      SELECT anio AS `AÑO`, mes AS MES, direccion AS DIRECCION, division AS DIVISION, seccion AS SECCION,\n             norma AS NORMA, grupo_articulos AS GRUPO_ARTICULOS, proveedor AS PROVEEDOR, marca AS MARCA,\n             centro AS CENTRO, tienda AS TIENDA, vtas_pesos AS VTAS_PESOS, prom_inventario AS PROM_INVENTARIO,\n             inventario_inicial AS INVENTARIO_INICIAL, inventario_final AS INVENTARIO_FINAL\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.TODO_venta_inventario_mensual`\n      WHERE anio >= @anio"
  },
  "eventos_oh": {
    "params": [
      "secciones"
    ],
    "sql": "\n      SELECT LTRIM(ARTICULO_KEY, '0') AS SKU, ARTICULO AS NSKU, MODELO_PROVEEDOR AS MODELO, MARCA, GRUPO_ARTICULOS AS GOA,\n             SECCION, SUM(OH) AS OH,\n             MAX(SAFE_CAST(PRECIO_VENTA_ACT AS NUMERIC)) AS PRECIO, NULLIF(UPPER(MAX(LETRA_ACTUAL)), 'REGULAR') AS LETRA_DESC\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_TAB_VENTAS_MENSUALES_U_S`\n      WHERE (LTRIM(SECCION_KEY, '0') IN UNNEST(ARRAY(SELECT LTRIM(x, '0') FROM UNNEST(SPLIT(REPLACE(@secciones, ' ', ''), ',')) x))\n             OR UPPER(SECCION) IN UNNEST(SPLIT(UPPER(@secciones), ',')))\n        AND OH > 0\n      GROUP BY 1, 2, 3, 4, 5, 6"
  },
  "eventos_ventas": {
    "params": [
      "ini",
      "fin",
      "secciones"
    ],
    "sql": "\n      SELECT DIA_PERIODO, LTRIM(ARTICULO_KEY, '0') AS ARTICULO, MODELO_PROVEEDOR, MARCA, GRUPO_ARTICULOS AS GOA,\n             SECCION, ESTATUS_ARTICULO AS N_ESTATUS, NORMA_APROVISIONAMIENTO AS NORMA_DE_APROVISIONAMIENTO,\n             SUM(VTAS_U) AS VTAS_U, SUM(Vtas_P) / 1000 AS VTAS, SUM(GM) AS GM, SUM(Total_Descuentos) / 1000 AS TOTAL_DESCUENTOS\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_ANALISIS_VTAS_DIARIAS`\n      WHERE DIA_PERIODO BETWEEN DATE(@ini) AND DATE(@fin)\n        AND (LTRIM(SECCION_KEY, '0') IN UNNEST(ARRAY(SELECT LTRIM(x, '0') FROM UNNEST(SPLIT(REPLACE(@secciones, ' ', ''), ',')) x))\n             OR UPPER(SECCION) IN UNNEST(SPLIT(UPPER(@secciones), ',')))\n      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8"
  },
  "chat_ventas": {
    "params": [
      "dim",
      "filtro",
      "ini",
      "fin"
    ],
    "sql": "\n      SELECT CASE @dim WHEN 'GOA' THEN GRUPO_ARTICULOS WHEN 'MARCA' THEN MARCA ELSE SECCION END AS DIM,\n             SUM(VTAS_U) AS VTAS_U, ROUND(SUM(Vtas_P)) AS VTAS_P, ROUND(SUM(GM)) AS GM,\n             ROUND(SUM(Total_Descuentos)) AS DESCUENTOS\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_ANALISIS_VTAS_DIARIAS`\n      WHERE DIA_PERIODO BETWEEN DATE(@ini) AND DATE(@fin)\n        AND (@filtro = ''\n             OR UPPER(SECCION) LIKE CONCAT('%', UPPER(@filtro), '%')\n             OR LTRIM(SECCION_KEY, '0') = LTRIM(@filtro, '0')\n             OR UPPER(GRUPO_ARTICULOS) LIKE CONCAT('%', UPPER(@filtro), '%')\n             OR UPPER(MARCA) LIKE CONCAT('%', UPPER(@filtro), '%'))\n      GROUP BY 1\n      ORDER BY VTAS_P DESC\n      LIMIT 40"
  },
  "traslados": {
    "params": [],
    "sql": "\n      SELECT goa AS GOA, sku AS SKU, centro AS CENTRO, oh AS OH, zona AS ZONA, tipo_centro AS TIPO_CENTRO\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.TODO_inventario_sku_centro`"
  },
  "margen": {
    "params": [
      "anio",
      "mes"
    ],
    "sql": "\n      SELECT EXTRACT(YEAR FROM MES_PERIODO) AS anio, EXTRACT(MONTH FROM MES_PERIODO) AS mes, DIVISION, SECCION, MARCA, TIPO_IMPORTACION, TIPO_MARCA,\n             SUM(Ventas_a_Precio_Lleno) AS precio_lleno, SUM(TOTAL_MARKDOWNS) AS mkd, SUM(Venta_Neta) AS venta_neta,\n             SUM(Costo_de_lo_Vendido) AS costo, SUM(Bonificaciones_Proveedor) AS bonif,\n             SUM(Provision_de_Merma) AS merma, SUM(Costo_Financiamiento_Inventarios) AS financ,\n             SUM(Utilidad_Bruta_de_Mercancias) AS ub_merc\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_TAB_UTILIDAD_COMPARATIVO_S`\n      WHERE EXTRACT(YEAR FROM MES_PERIODO) IN (CAST(@anio AS INT64) - 1, CAST(@anio AS INT64))\n        AND EXTRACT(MONTH FROM MES_PERIODO) <= CAST(@mes AS INT64)\n      GROUP BY 1, 2, 3, 4, 5, 6, 7"
  },
  "margen_cat": {
    "params": [
      "anio",
      "mes"
    ],
    "sql": "\n      WITH p AS (\n        SELECT CAST(ARTICULO_KEY AS STRING) art,\n               MAX(SAFE_CAST(PRECIO_VENTA_INIC AS FLOAT64)) / 1.16 p_ini, MAX(SAFE_CAST(PRECIO_VENTA_ACT AS FLOAT64)) / 1.16 p_act\n        FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_TAB_VENTAS_MENSUALES_U_S`\n        WHERE SAFE_CAST(PRECIO_VENTA_INIC AS FLOAT64) > 0 GROUP BY 1)\n      SELECT EXTRACT(YEAR FROM SAFE_CAST(v.DIA_PERIODO AS DATE)) AS anio, EXTRACT(MONTH FROM SAFE_CAST(v.DIA_PERIODO AS DATE)) AS mes,\n             v.DIVISION, v.SECCION, v.MARCA,\n             SUM(SAFE_CAST(v.VTAS_U AS FLOAT64) * p.p_ini) AS pl_ini, SUM(SAFE_CAST(v.VTAS_U AS FLOAT64) * p.p_act) AS pl_act,\n             SUM(SAFE_CAST(v.TOTAL_COSTO_DE_VENTA_RK AS FLOAT64)) AS costo\n      FROM `crp-pro-dwh-semanticagold.mus_pro_dwh_views_sap.VEIL_ANALISIS_VTAS_DIARIAS` v\n      JOIN p ON p.art = CAST(v.ARTICULO_KEY AS STRING)\n      WHERE EXTRACT(YEAR FROM SAFE_CAST(v.DIA_PERIODO AS DATE)) IN (CAST(@anio AS INT64) - 1, CAST(@anio AS INT64))\n        AND EXTRACT(MONTH FROM SAFE_CAST(v.DIA_PERIODO AS DATE)) <= CAST(@mes AS INT64)\n      GROUP BY 1, 2, 3, 4, 5"
  }
};

# Directorio de datos — GO PLANNER

Qué archivo consume cada módulo, de qué sistema sale y a qué **tabla maestra** de BigQuery debería apuntar.
Columnas exactas por archivo: `src/csvSchemas.js`. "Fuente probable" = a confirmar con TI/BI.

## 1. Tablas maestras (lo que hay que encontrar en BigQuery)

Con ~9 tablas se alimentan los 12 módulos. Prioridad = cuántos módulos desbloquea.

| # | Tabla maestra | Grano | Campos clave | Fuente probable | Alimenta | Prioridad |
|---|---|---|---|---|---|---|
| T1 | **VENTAS** | día × centro × SKU × canal | fecha, centro, sku, goa, sección, marca, norma, canal, tipo_pago, venta_u, venta_$, GM, markdown, costo | SAP BW / BI ventas | Dayli, Eventos, Dispersión, Planning, Resurtido, Forecasting, Assortment, Distribución, Suplementarios (HIST/REAL) | 🔴 1 |
| T2 | **INVENTARIO** (foto) | fecha × ubicación × SKU | OH, OO, costo, tipo_ubicación, inv inicial/final | SAP MM / BW | Dayli, Resurtido, Traslados, Dispersión, Eventos (OH), Distribución (OH) | 🔴 2 |
| T3 | **CATÁLOGO ARTÍCULOS** | SKU | artículo, modelo, color, talla, GOA, sección, marca, proveedor, norma, estatus, precio venta, rebaja | SAP ZSCLB1 / MARA / PLM | Allocation, Eventos, Assortment, Chequera, Traslados | 🔴 3 |
| T4 | **MAESTRO CENTROS** | centro | nombre, zona, plaza, formato, tipo_centro, clima general + mensual, AP, CEDIS | SAP T001W + matriz manual | Allocation (BASE, CLIMA), Traslados, Distribución, Assortment | 🟠 4 |
| T5 | **COMPRAS / OC** | OC × SKU × centro × mes | OC, piezas solicitadas/recibidas, valor, mes recepción | SAP ME2M / EKPO | Allocation (COMPRA_MES, OC), Assortment (compras reales), Chequera, Distribución | 🟠 5 |
| T6 | **PARÁMETROS O9** | SKU × centro | ZO9_DM, ZO9_MARA, ZRT_FECHASO9 | o9 / SAP | Allocation | 🟡 6 |
| T7 | **PLAN FINANCIERO / OTB** | marca/sección × mes | venta, MKDS, CMSI, compra, utilidad, inventario | SAC | Suplementarios (OTB), Assortment (budget) | 🟡 7 |
| T8 | **MATRIZ MARCA × CENTRO** | marca × centro | VA/NO VA, cluster, agrupador | Manual (Excel) | Allocation, Distribución, Assortment, Traslados | ⚪ Google Sheet |
| T9 | **CALENDARIO PROMOS / EVENTOS** | promo | nombre, fechas, sección, marca, uplift | Manual | Dayli, Eventos | ⚪ Google Sheet |

T8 y T9 son manuales: se quedan en Google Sheets (o se suben a BigQuery como tabla externa sobre el Sheet).

## 2. Por módulo

| Módulo | Archivo que pide hoy | Formato | Tabla(s) | Endpoint `/api/bq?source=` |
|---|---|---|---|---|
| **Forecasting** | Histórico de marcas (marca × mes, sin header) | CSV | T1 agregada marca×mes | — pendiente |
| **Suplementarios** | OTB + HIST + REAL por marca × ratio | CSV/XLSX | T7 (OTB) + T1/T2 mensual | — pendiente |
| **Allocation** | ZO9_DM, BASE_FECHAS O9, COMPRA_MES, CATALOGO ZSCLB1, BASE matrices, MATRIZ CLIMA, ZO9_MARA, OC | XLSX/CSV (8 archivos) | T6, T5, T3, T4, T8 | — pendiente |
| **Assortment OTB** | Base tiendas, matriz marcas, forecast/budget GOA, catálogo modelos, compras reales, preventa | CSV (6) | T1, T8, T7, T3/PLM, T5 | — pendiente |
| **Distribución** | Base tiendas (CENTRO, GOA, VENTAS, OH), matriz marcas, chequera tallas | CSV (3) | T1+T2, T8, T5 | — pendiente |
| **Resurtido** | Base artículos GOA × Centro (OH, OO, ventas mes) | CSV **o URL** | T1 + T2 | `resurtido` ✅ ya acepta URL |
| **Planning** | Histórico wide (3 filas header: mes / canal / métrica) | CSV | T1 mensual × canal | — pendiente (pivot) |
| **Dayli** | Ventas diarias TY+LY, inventario, promociones | CSV (3) | T1, T2, T9 | `dayli_ventas`, `dayli_inventario` |
| **Eventos** | Snapshot "OH y Montos" + Vtas_Evento | XLSX / CSV | T3 + T2 + T1 diario SKU | — pendiente |
| **Dispersión** | Venta vs inventario tienda × mes | CSV | T1 + T2 mensual | `dispersion` |
| **Chequera** | Marca externa / propia | CSV/XLSX | T5 + T3 | — pendiente |
| **Traslados** | Base artículos GOA×SKU×Centro, matriz marca+clima, chequera (texto) | CSV | T2 + T4, T8, T5 | `traslados` |
| **Team Tracker** | Ya conectado a Google Sheets vía Apps Script | — | — | n/a |

## 3. Cómo se conecta (arquitectura)

```
BigQuery (GCP empresa) ──► /api/bq (función Vercel, cuenta de servicio, solo lectura)
                                   │  regresa CSV con los mismos encabezados que hoy
                                   ▼
                     Módulo de GO PLANNER (mismo parser que el archivo manual)
```

- Solo se ejecutan consultas de la whitelist `api/_queries.js` (el navegador no manda SQL).
- Credenciales viven en variables de entorno de Vercel, nunca en el código.
- `GOP_API_TOKEN` evita que cualquiera con la URL pública descargue datos.
- La carga manual de archivos sigue funcionando igual (respaldo).

Prueba: `https://<tu-app>.vercel.app/api/bq?source=ping&token=<GOP_API_TOKEN>`

# Puente BigQuery (Apps Script) — setup

Sirve los mismos `source` de `api/_queries.js` mientras llega la cuenta de servicio. Corre con TU usuario de BigQuery; solo responde a cuentas @suburbia.com.mx (ID token de Google validado en el script).

> El deployment va como "Cualquier usuario" a propósito: con "Cualquier usuario de suburbia.com.mx" el navegador no puede hacer fetch desde goplanner (CORS + redirect a login). La restricción de dominio la hace `verificar_()` con el token.

## 1. OAuth Client ID (una vez)
1. console.cloud.google.com → un proyecto donde puedas crear credenciales → **APIs y servicios → Pantalla de consentimiento** (Interna si es proyecto de la empresa; si no, Externa con scopes `openid email`).
2. **Credenciales → Crear → ID de cliente OAuth → Aplicación web**.
3. Orígenes JavaScript autorizados: `https://goplanner-gg.vercel.app` y `http://localhost:5173`.
4. Copia el Client ID.

## 2. Apps Script
1. script.google.com → Proyecto nuevo "GO PLANNER · BQ bridge" (con tu cuenta @suburbia.com.mx).
2. Configuración ⚙️ → "Mostrar appsscript.json" → pega `appsscript.json`.
3. Crea `Code.gs` y `Queries.gs` con el contenido de esta carpeta (`node scripts/gas-queries.mjs` regenera Queries.gs).
4. En `Code.gs`: `CLIENT_ID` y `BILLING_PROJECT` (el proyecto que aparece arriba en tu consola de BigQuery cuando corres queries).
5. Ejecuta `probar` → autoriza → debe imprimir `ahora,estado ... ok`.
6. **Implementar → Nueva implementación → App web**: Ejecutar como *Yo*, Acceso *Cualquier usuario*. Copia la URL `/exec`.

## 3. GO PLANNER (Vercel → Environment Variables)
```
VITE_GAS_URL=https://script.google.com/macros/s/.../exec
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```
Redeploy. Margen y Eventos ya usan `fetchBQ`; al presionar "BigQuery" pide login con Google la primera vez (~1 h de vigencia, se renueva solo con auto-select).

Cuando haya cuenta de servicio: borra `VITE_GAS_URL` y todo vuelve a `/api/bq` sin tocar módulos.

## Al cambiar consultas
Edita `api/_queries.js` → `node scripts/gas-queries.mjs` → pega Queries.gs → **Implementar → Administrar → Editar → Nueva versión** (la URL no cambia).

## Límites
- 6 min por llamada; respuestas de decenas de MB fallan → agregar en SQL o pedir por ventanas (como Eventos).
- Las consultas corren con tus permisos: solo lo que tú puedes leer. Tu correo queda registrado por cada llamada (Ejecuciones).
- Avísale a TI que existe; es un puente temporal hacia Cloud Run.

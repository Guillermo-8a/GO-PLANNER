// Barra global de carga para archivos (CSV / Excel) en todos los módulos.
// Se engancha a FileReader y File.arrayBuffer()/text(): ningún módulo necesita cambios.
// Muestra % de lectura y "Procesando…" mientras el módulo parsea (el spinner es CSS y sigue girando aunque el hilo esté ocupado).
const MIN = 200 * 1024; // archivos chicos cargan al instante: no se muestra nada
let root, bar, txt, activos = 0;

function ui() {
  if (root) return;
  const st = document.createElement('style');
  st.textContent = `
#gop-load{position:fixed;inset:0 0 auto 0;z-index:9999;pointer-events:none;opacity:0;transition:opacity .15s}
#gop-load.on{opacity:1}
#gop-load .b{height:3px;width:0;background:linear-gradient(90deg,#7C5CF0,#A78BFA);box-shadow:0 0 8px #7C5CF0;transition:width .2s}
#gop-load .p{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(26,21,32,.92);border:1px solid rgba(124,92,240,.5);color:#fff;font:600 12px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)}
#gop-load .s{width:12px;height:12px;border-radius:50%;border:2px solid rgba(167,139,250,.3);border-top-color:#A78BFA;animation:gop-spin .7s linear infinite;will-change:transform}
@keyframes gop-spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(st);
  root = document.createElement('div');
  root.id = 'gop-load';
  root.innerHTML = '<div class="b"></div><div class="p"><div class="s"></div><span></span></div>';
  document.body.appendChild(root);
  bar = root.querySelector('.b');
  txt = root.querySelector('span');
}
const tipo = (f) => (/\.xlsx?$|\.xlsm$/i.test(f?.name || '') ? 'Excel' : 'CSV');
function show(pct, label) {
  ui();
  root.classList.add('on');
  bar.style.width = `${Math.round(pct * 100)}%`;
  txt.textContent = label;
}
function inicio() { activos++; }
function fin() {
  if (--activos > 0) return;
  activos = 0;
  if (root) { bar.style.width = '100%'; root.classList.remove('on'); setTimeout(() => { if (!activos) bar.style.width = '0'; }, 200); }
}

const P = FileReader.prototype;
['readAsText', 'readAsArrayBuffer', 'readAsBinaryString', 'readAsDataURL'].forEach((m) => {
  const orig = P[m];
  P[m] = function (blob, ...a) {
    if (!(blob instanceof File) || blob.size < MIN) return orig.call(this, blob, ...a);
    const t = tipo(blob);
    let cerrado = false;
    const cerrar = () => { if (!cerrado) { cerrado = true; fin(); } };
    inicio();
    show(0.02, `Leyendo ${t}… 0%`);
    this.addEventListener('progress', (e) => { if (e.lengthComputable) show(e.loaded / e.total, `Leyendo ${t}… ${Math.round((e.loaded / e.total) * 100)}%`); });
    this.addEventListener('error', cerrar);
    this.addEventListener('abort', cerrar);
    const onload = this.onload;
    if (typeof onload === 'function') {
      // Se pinta "Procesando…" antes de que el módulo empiece a parsear (si no, el navegador no alcanza a mostrarlo)
      this.onload = (ev) => {
        show(1, 'Procesando…');
        requestAnimationFrame(() => setTimeout(() => {
          let r;
          try { r = onload.call(this, ev); } finally { Promise.resolve(r).finally(() => setTimeout(cerrar, 0)); }
        }, 0));
      };
    } else this.addEventListener('loadend', () => setTimeout(cerrar, 0));
    return orig.call(this, blob, ...a);
  };
});

// Lecturas con await file.arrayBuffer() / file.text() (Excel en Assortment, Allocation, Eventos, Suplementarios…)
['arrayBuffer', 'text'].forEach((m) => {
  const orig = Blob.prototype[m];
  Blob.prototype[m] = function (...a) {
    if (!(this instanceof File) || this.size < MIN) return orig.apply(this, a);
    inicio();
    show(0.3, `Leyendo ${tipo(this)}…`);
    const p = orig.apply(this, a);
    // El parseo corre justo después del await; se cierra en el siguiente turno para cubrirlo
    p.then(() => show(1, 'Procesando…'), () => {}).finally(() => setTimeout(fin, 0));
    return p;
  };
});

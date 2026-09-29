// src/utils/excelNav.js
// Navegación tipo Excel para TODAS las tablas de GO PLANNER (se instala una vez en App.jsx):
//   Enter / Shift+Enter → celda de abajo / arriba · ↑ ↓ → mover · ← → → mover si recién entraste a la celda
//   (o el cursor está en la orilla) · al entrar a una celda se selecciona todo (escribir reemplaza).
// Aplica a <input> de texto/número dentro de <td>. Los inputs con data-grid (Suplementarios) tienen su propio manejo.
import { useEffect, useRef } from 'react';

const isCell = (el) =>
  el?.tagName === 'INPUT' && ['text', 'number', 'search', ''].includes(el.type) &&
  !el.dataset.grid && !el.disabled && !el.readOnly && !!el.closest('td');

// Posición visual de una celda respetando colSpan
const colOf = (td) => { let c = 0; for (const x of td.parentElement.cells) { if (x === td) return c; c += x.colSpan || 1; } return c; };
const cellAtCol = (tr, col) => { let c = 0; for (const x of tr.cells) { const w = x.colSpan || 1; if (col >= c && col < c + w) return x; c += w; } return null; };

function findNext(el, dr, dc) {
  const td = el.closest('td'), table = td?.closest('table');
  if (!table) return null;
  const rows = [...table.rows];
  let r = rows.indexOf(td.parentElement), c = colOf(td);
  for (let i = 0; i < 60; i++) {
    r += dr; c += dc;
    if (r < 0 || r >= rows.length || c < 0) return null;
    const cell = cellAtCol(rows[r], c);
    const inp = cell && [...cell.querySelectorAll('input')].find(isCell);
    if (inp && inp.offsetParent !== null) return inp;
  }
  return null;
}

export function installExcelNav() {
  const onFocus = (e) => {
    const el = e.target;
    if (!isCell(el)) return;
    el.dataset.fresh = '1';
    try { el.select(); } catch { /* number inputs en algunos browsers */ }
  };
  const onInput = (e) => { if (e.target?.dataset?.fresh) delete e.target.dataset.fresh; };
  const onKey = (e) => {
    const el = e.target;
    if (!isCell(el) || e.altKey || e.metaKey || e.ctrlKey) return;
    const k = e.key;
    if (!['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) return;
    const ae = document.activeElement;
    if (ae !== el && ae !== document.body) return; // el módulo ya movió el foco
    let dr = 0, dc = 0;
    if (k === 'Enter') dr = e.shiftKey ? -1 : 1;
    else if (k === 'ArrowDown') dr = 1;
    else if (k === 'ArrowUp') dr = -1;
    else {
      let edge = el.dataset.fresh === '1';
      if (!edge && el.type !== 'number') edge = k === 'ArrowRight' ? el.selectionStart === el.value.length : el.selectionEnd === 0;
      if (!edge) return;
      dc = k === 'ArrowRight' ? 1 : -1;
    }
    if (el.type === 'number' && dr) e.preventDefault(); // que ↑↓ no sumen/resten al número
    const next = findNext(el, dr, dc);
    if (next) { e.preventDefault(); next.focus(); }
    else if (k === 'Enter') el.blur();
  };
  document.addEventListener('focusin', onFocus);
  document.addEventListener('input', onInput, true);
  window.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('input', onInput, true);
    window.removeEventListener('keydown', onKey);
  };
}

// Alt/Option + ↑ / ↓ recorre las pestañas del módulo
export function useAltTabs(tabs, setTab) {
  const ref = useRef(tabs);
  ref.current = tabs;
  useEffect(() => {
    const h = (e) => {
      if (!e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const list = ref.current;
      if (!list?.length) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setTab((cur) => { const i = Math.max(list.indexOf(cur), 0); return list[(i + d + list.length) % list.length]; });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setTab]);
}

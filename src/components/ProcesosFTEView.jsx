// Pestaña "Procesos FTE" del Team Tracker.
// Calculadora de carga: horas por ejecución × veces al mes × factor de complejidad ÷ horas FTE.
// Matriz de complejidad por sección: índice = Σ peso × (valor ÷ promedio de secciones).
// Los datos viven en la llave 'fte-board' del mismo Google Sheet del tracker.
import React, { useMemo, useState } from 'react';
import { FTE_ACTIVIDADES, FTE_PROCESOS, FTE_FRECUENCIAS, FTE_PUESTOS } from '../data/procesosFTE';

export const FTE_VARS = ['Marcas activas', 'Proveedores activos', 'Grupos de artículos', 'OTB', 'Pestañas de LR', 'Scorecards', 'Combinaciones SKU-Tienda'];
export const FTE_DEFAULT = {
  caps: {},
  secciones: [],
  params: { horasDia: 8, diasMes: 21, cx: { Baja: 1, Media: 1.2, Alta: 1.5 }, pesos: [0.15, 0.15, 0.15, 0.10, 0.10, 0.10, 0.25] },
};
const PILARES = {
  financiero: 'Planeación Financiera',
  demand: 'Planeación de la Demanda',
  inventarios: 'Control de Inventarios',
  colaborador: 'Cliente Colaborador',
};
const PUESTOS_SECCION = ['Coordinador de Planeación Comercial', 'Planner Comercial', 'Comprador', 'Gerente Sr de Planeación Comercial', 'Directora de Planeación Comercial'];
const VECES = Object.fromEntries(FTE_FRECUENCIAS.map((f) => [f.nombre, f.vecesMes]));
const PROC = Object.fromEntries(FTE_PROCESOS.map((p) => [p.code, p.nombre]));
const ROWS = FTE_ACTIVIDADES.flatMap((a) => a.puestos.map((p) => ({ key: `${a.id}|${p}`, puesto: p, ...a })));

const n2 = (v) => (Number.isFinite(v) ? v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const n1 = (v) => (Number.isFinite(v) ? v.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

export function computeFte(fte) {
  const { params, caps, secciones } = fte;
  const horasFte = params.horasDia * params.diasMes;
  const rows = ROWS.map((r) => {
    const c = caps[r.key] || {};
    const frec = c.f ?? r.frecSug;
    const horas = c.h === '' || c.h == null ? null : Number(c.h);
    const factor = params.cx[c.c] ?? 1;
    const hm = horas == null ? 0 : horas * (VECES[frec] || 0) * factor;
    return { ...r, frec, horas, cx: c.c || '', nota: c.n || '', hm, fte: hm / horasFte };
  });
  const byPuesto = {};
  rows.forEach((r) => { byPuesto[r.puesto] = (byPuesto[r.puesto] || 0) + r.hm; });
  const valid = secciones.filter((s) => s.nombre);
  const avgs = FTE_VARS.map((_, i) => {
    const vals = valid.map((s) => Number(s.v?.[i])).filter((x) => Number.isFinite(x) && x > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const indice = (s) => FTE_VARS.reduce((acc, _, i) => {
    const v = Number(s.v?.[i]);
    return acc + (params.pesos[i] || 0) * (avgs[i] && Number.isFinite(v) ? v / avgs[i] : 0);
  }, 0);
  const secs = secciones.map((s) => {
    const idx = s.nombre ? indice(s) : null;
    return { ...s, idx, nivel: idx == null ? '' : idx >= 1.25 ? 'Alta' : idx >= 0.85 ? 'Media' : 'Baja' };
  });
  return { rows, horasFte, byPuesto, secs };
}

export default function ProcesosFTEView({ fte, isAdmin, onSave }) {
  const [sub, setSub] = useState('captura');
  const [pilar, setPilar] = useState('all');
  const [puesto, setPuesto] = useState('all');
  const [q, setQ] = useState('');
  const [soloPend, setSoloPend] = useState(false);
  const [drafts, setDrafts] = useState({});
  const calc = useMemo(() => computeFte(fte), [fte]);

  const setCap = (key, patch) => onSave((cur) => ({ ...cur, caps: { ...cur.caps, [key]: { ...(cur.caps[key] || {}), ...patch } } }));
  const draftVal = (k, v) => (k in drafts ? drafts[k] : v ?? '');
  const onDraft = (k, v) => setDrafts((d) => ({ ...d, [k]: v }));
  const clearDraft = (k) => setDrafts((d) => { const n = { ...d }; delete n[k]; return n; });

  const capturadas = calc.rows.filter((r) => r.horas != null).length;
  const totalHm = calc.rows.reduce((a, r) => a + r.hm, 0);

  const visibles = calc.rows.filter((r) => (pilar === 'all' || r.pilar === pilar)
    && (puesto === 'all' || r.puesto === puesto)
    && (!soloPend || r.horas == null)
    && (!q || `${r.id} ${r.actividad} ${r.funcion}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="fte">
      <style>{FTE_CSS}</style>
      <div className="fte-kpis">
        <div><span>Capturadas</span><b>{capturadas} / {calc.rows.length}</b><i style={{ width: pct(capturadas / calc.rows.length) }} /></div>
        <div><span>Horas al mes</span><b>{n1(totalHm)}</b></div>
        <div><span>FTE estándar</span><b>{n2(totalHm / calc.horasFte)}</b></div>
        <div><span>1 FTE</span><b>{calc.horasFte} h/mes</b></div>
      </div>

      <div className="tt-group-toggle">
        {[['captura', 'Captura'], ['secciones', 'Complejidad por sección'], ['resumen', 'Resumen']].map(([k, l]) => (
          <button key={k} className={sub === k ? 'is-active' : ''} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>

      {sub === 'captura' && (
        <>
          <div className="fte-filters">
            <select value={pilar} onChange={(e) => setPilar(e.target.value)}>
              <option value="all">Todos los pilares</option>
              {Object.entries(PILARES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={puesto} onChange={(e) => setPuesto(e.target.value)}>
              <option value="all">Todos los puestos</option>
              {FTE_PUESTOS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="Buscar ID o actividad…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="fte-check"><input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} /> Solo sin capturar</label>
            <span className="tt-tag">{visibles.length} filas · tiempos para una sección de complejidad promedio</span>
          </div>
          <div className="fte-table-wrap">
            <table className="fte-table">
              <thead><tr>
                <th>ID</th><th>Actividad</th><th>Puesto</th><th>Frecuencia</th><th>Horas por ejecución</th><th>Complejidad</th><th className="r">Horas / mes</th><th className="r">FTE</th><th>Comentario</th>
              </tr></thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.key} className={r.propuesta ? 'is-prop' : ''}>
                    <td className="fte-id">{r.id}</td>
                    <td className="fte-act" title={r.actividad}><small>{r.proceso} {PROC[r.proceso]} · {r.funcion}</small>{r.actividad}</td>
                    <td className="fte-puesto">{r.puesto}</td>
                    <td>
                      <select value={r.frec || ''} onChange={(e) => setCap(r.key, { f: e.target.value })}>
                        <option value="">—</option>
                        {FTE_FRECUENCIAS.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" min="0" step="0.25" className="fte-num"
                        value={draftVal(`${r.key}|h`, r.horas)}
                        onChange={(e) => onDraft(`${r.key}|h`, e.target.value)}
                        onBlur={(e) => { const v = e.target.value; clearDraft(`${r.key}|h`); if (String(v) !== String(r.horas ?? '')) setCap(r.key, { h: v === '' ? '' : Number(v) }); }} />
                    </td>
                    <td>
                      <select value={r.cx} onChange={(e) => setCap(r.key, { c: e.target.value })}>
                        <option value="">—</option>
                        {Object.keys(fte.params.cx).map((k) => <option key={k} value={k}>{k} ({fte.params.cx[k]})</option>)}
                      </select>
                    </td>
                    <td className="r">{r.horas == null ? '—' : n1(r.hm)}</td>
                    <td className="r">{r.horas == null ? '—' : n2(r.fte)}</td>
                    <td>
                      <input className="fte-note" value={draftVal(`${r.key}|n`, r.nota)}
                        onChange={(e) => onDraft(`${r.key}|n`, e.target.value)}
                        onBlur={(e) => { const v = e.target.value; clearDraft(`${r.key}|n`); if (v !== r.nota) setCap(r.key, { n: v }); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tt-empty-hint">Filas en amarillo: actividades propuestas (1.5 y 1.6), pendientes de validar. Si no eliges complejidad, el factor es 1.</p>
        </>
      )}

      {sub === 'secciones' && <SeccionesView fte={fte} calc={calc} isAdmin={isAdmin} onSave={onSave} />}
      {sub === 'resumen' && <ResumenFTE calc={calc} />}
    </div>
  );
}

function SeccionesView({ fte, calc, isAdmin, onSave }) {
  const [drafts, setDrafts] = useState({});
  const p = fte.params;
  const sumPesos = p.pesos.reduce((a, b) => a + (Number(b) || 0), 0);
  const commit = (k, v, apply) => { setDrafts((d) => { const n = { ...d }; delete n[k]; return n; }); onSave(apply(v)); };
  const field = (k, v, apply, cls = 'fte-num') => (
    <input className={cls} disabled={!isAdmin} value={k in drafts ? drafts[k] : v ?? ''}
      onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
      onBlur={(e) => { if (k in drafts) commit(k, e.target.value, apply); }} />
  );
  const num = (v) => (v === '' ? '' : Number(v));
  const setSec = (id, patch) => (cur) => ({ ...cur, secciones: cur.secciones.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div className="fte-sec">
      {!isAdmin && <p className="tt-empty-hint">Solo lectura. Abre el candado 🔒 para editar parámetros y secciones.</p>}
      <div className="fte-params">
        <div><span>Horas por jornada</span>{field('hd', p.horasDia, (v) => (cur) => ({ ...cur, params: { ...cur.params, horasDia: num(v) || 8 } }))}</div>
        <div><span>Días laborables / mes</span>{field('dm', p.diasMes, (v) => (cur) => ({ ...cur, params: { ...cur.params, diasMes: num(v) || 21 } }))}</div>
        {Object.keys(p.cx).map((k) => (
          <div key={k}><span>Factor {k}</span>{field(`cx${k}`, p.cx[k], (v) => (cur) => ({ ...cur, params: { ...cur.params, cx: { ...cur.params.cx, [k]: num(v) || 1 } } }))}</div>
        ))}
      </div>

      <div className="fte-table-wrap">
        <table className="fte-table">
          <thead>
            <tr><th>Dirección</th><th>Sección</th>{FTE_VARS.map((v) => <th key={v} className="r">{v}</th>)}<th className="r">Índice</th><th>Nivel</th>
              {PUESTOS_SECCION.map((r) => <th key={r} className="r">FTE {r.replace(' de Planeación Comercial', '')}</th>)}{isAdmin && <th />}</tr>
            <tr className="fte-pesos"><td colSpan={2}>Peso {Math.abs(sumPesos - 1) > 0.001 && <b className="fte-warn">· suman {pct(sumPesos)}, deben sumar 100%</b>}</td>
              {p.pesos.map((w, i) => <td key={i} className="r">{field(`w${i}`, Math.round(w * 100), (v) => (cur) => ({ ...cur, params: { ...cur.params, pesos: cur.params.pesos.map((x, j) => (j === i ? (Number(v) || 0) / 100 : x)) } }))}%</td>)}
              <td colSpan={2 + PUESTOS_SECCION.length + (isAdmin ? 1 : 0)} />
            </tr>
          </thead>
          <tbody>
            {calc.secs.map((s) => (
              <tr key={s.id}>
                <td>{field(`${s.id}d`, s.dir, (v) => setSec(s.id, { dir: v }), 'fte-txt')}</td>
                <td>{field(`${s.id}n`, s.nombre, (v) => setSec(s.id, { nombre: v }), 'fte-txt')}</td>
                {FTE_VARS.map((_, j) => <td key={j} className="r">{field(`${s.id}v${j}`, s.v?.[j], (v) => (cur) => setSec(s.id, { v: FTE_VARS.map((__, k) => (k === j ? num(v) : cur.secciones.find((x) => x.id === s.id)?.v?.[k] ?? '')) })(cur))}</td>)}
                <td className="r"><b>{s.idx == null ? '—' : n2(s.idx)}</b></td>
                <td><span className={`fte-nivel is-${s.nivel}`}>{s.nivel || '—'}</span></td>
                {PUESTOS_SECCION.map((r) => <td key={r} className="r">{s.idx == null ? '—' : n2(((calc.byPuesto[r] || 0) / calc.horasFte) * s.idx)}</td>)}
                {isAdmin && <td><button className="fte-x" onClick={() => onSave((cur) => ({ ...cur, secciones: cur.secciones.filter((x) => x.id !== s.id) }))}>Quitar</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && <button className="tt-ghost-btn fte-add" onClick={() => onSave((cur) => ({ ...cur, secciones: [...cur.secciones, { id: Date.now().toString(36), dir: '', nombre: '', v: [] }] }))}>+ Agregar sección</button>}
      <p className="tt-empty-hint">Índice = Σ peso × (valor ÷ promedio de las secciones). 1.00 = sección promedio · Alta ≥ 1.25 · Media 0.85–1.24 · Baja &lt; 0.85. FTE de la sección = FTE estándar del puesto × índice.</p>
    </div>
  );
}

function ResumenFTE({ calc }) {
  const puestos = FTE_PUESTOS.map((p) => ({ p, fte: (calc.byPuesto[p] || 0) / calc.horasFte })).filter((x) => x.fte > 0).sort((a, b) => b.fte - a.fte);
  const max = Math.max(0.0001, ...puestos.map((x) => x.fte));
  const porPilar = Object.keys(PILARES).map((k) => ({ k, fte: calc.rows.filter((r) => r.pilar === k).reduce((a, r) => a + r.fte, 0) }));
  const procesos = FTE_PROCESOS.map((p) => ({ ...p, hm: calc.rows.filter((r) => r.proceso === p.code).reduce((a, r) => a + r.hm, 0) }))
    .filter((p) => p.hm > 0).sort((a, b) => b.hm - a.hm).slice(0, 10);
  if (!puestos.length) return <p className="tt-empty-hint">Todavía no hay tiempos capturados.</p>;
  return (
    <div className="fte-res">
      <section>
        <h4>FTE por puesto</h4>
        <div className="tt-bars">
          {puestos.map((x) => (
            <div className="tt-bar-row" key={x.p}>
              <div className="tt-bar-label">{x.p}</div>
              <div className="tt-bar-track"><div className="tt-bar-fill" style={{ width: `${(x.fte / max) * 100}%`, background: 'linear-gradient(90deg,#8A73AD,#E0BB3E)' }} /></div>
              <div className="tt-bar-value">{n2(x.fte)} FTE</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h4>FTE por pilar</h4>
        <table className="fte-table fte-mini"><tbody>
          {porPilar.map((x) => <tr key={x.k}><td>{PILARES[x.k]}</td><td className="r">{n2(x.fte)}</td></tr>)}
        </tbody></table>
        <h4>Top 10 procesos por horas</h4>
        <table className="fte-table fte-mini"><tbody>
          {procesos.map((p) => <tr key={p.code}><td>{p.code} {p.nombre}</td><td className="r">{n1(p.hm)} h</td></tr>)}
        </tbody></table>
      </section>
    </div>
  );
}

const FTE_CSS = `
.fte { animation: ttFadeIn .3s ease; }
.fte-kpis { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 14px; }
.fte-kpis > div { position: relative; overflow: hidden; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; padding: 12px 14px; }
.fte-kpis span { display: block; font-size: 11px; color: #948FA0; }
.fte-kpis b { font-size: 20px; color: #F2F0F6; }
.fte-kpis i { position: absolute; left: 0; bottom: 0; height: 3px; background: linear-gradient(90deg,#8A73AD,#E0BB3E); }
.fte-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.fte select, .fte input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #EDEBF2; border-radius: 7px; padding: 5px 8px; font-size: 12px; font-family: inherit; }
.fte select option { background: #1c1720; }
.fte input:disabled { opacity: .7; }
.fte-check { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #B7B2C4; }
.fte-table-wrap { overflow: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; max-height: calc(100vh - 330px); }
.fte-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.fte-table th { position: sticky; top: 0; z-index: 1; background: #221d29; color: #948FA0; font-weight: 600; text-align: left; padding: 8px; font-size: 11px; white-space: nowrap; }
.fte-table td { padding: 6px 8px; border-top: 1px solid rgba(255,255,255,0.06); vertical-align: top; }
.fte-table .r { text-align: right; }
.fte-table tr.is-prop td { background: rgba(224,187,62,0.08); }
.fte-id { font-weight: 700; white-space: nowrap; color: #B39DDB; }
.fte-act { min-width: 320px; max-width: 460px; line-height: 1.35; white-space: pre-line; }
.fte-act small { display: block; color: #8A8596; font-size: 10.5px; margin-bottom: 2px; white-space: normal; }
.fte-puesto { white-space: nowrap; color: #C9C5D3; }
.fte-num { width: 70px; text-align: right; }
.fte-txt { width: 130px; }
.fte-note { width: 160px; }
.fte-pesos td { background: #1e1a24; position: sticky; top: 33px; font-size: 11px; color: #948FA0; }
.fte-pesos .fte-num { width: 48px; }
.fte-warn { color: #E58E8E; font-weight: 600; }
.fte-params { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.fte-params > div { display: flex; flex-direction: column; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 8px 10px; }
.fte-params span { font-size: 11px; color: #948FA0; }
.fte-nivel { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.08); }
.fte-nivel.is-Alta { background: rgba(229,142,142,0.2); color: #F2B8B8; }
.fte-nivel.is-Media { background: rgba(224,187,62,0.18); color: #EFE3B0; }
.fte-nivel.is-Baja { background: rgba(138,115,173,0.25); color: #D4C8EA; }
.fte-x { background: none; border: none; color: #8A8596; cursor: pointer; font-size: 12px; }
.fte-x:hover { color: #E58E8E; }
.fte-add { margin-top: 10px; }
.fte-res { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; }
.fte-res h4 { margin: 4px 0 10px; font-size: 13px; color: #EDEBF2; }
.fte-mini { margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; }
@media (max-width: 900px) { .fte-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } .fte-res { grid-template-columns: 1fr; } }
`;

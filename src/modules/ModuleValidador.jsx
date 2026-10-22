// src/modules/ModuleValidador.jsx
// Validador de parametrizaciones (Check Coo): revisa la parametrización ZO9_DM que viaja de O9.
// Entrada: el mismo export crudo que Allocation (Excel o CSV con Gpo. Art … Store Priority N).
// Salida: tabla de combinaciones artículo × centro, resumen por tipo de afectación y CSV corregido para volver a cargar en O9.
import { useState, useMemo, useRef, useEffect } from 'react';
import { Upload, Download, Trash2, Search, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import ModuleHeader from '../components/ModuleHeader';
import FilterMenu, { FilterSection } from '../components/FilterMenu';
import { parseFile, downloadCSV, norm, str, moda } from './ModuleAllocation';

// ─── Tipos de afectación ──────────────────────────────────────────────────────
// SUPUESTO: definición provisional de los 7 tipos (estado válido de una combinación artículo × centro).
// Si O9 usa otra, solo hay que editar TIPOS y tipoDe(); el resto del módulo no cambia.
const TIPOS = {
  apagado: { label: 'Apagado', help: 'Forecast 0 y AP, MIN, MAX, WOS y plazo vacíos o en 0' },
  a8mm: { label: 'Activo AP8 · MIN y MAX', help: 'Forecast 1, AP 8, MIN > 0, MAX ≥ MIN, WOS y plazo > 0' },
  a8m: { label: 'Activo AP8 · MIN sin tope', help: 'Forecast 1, AP 8, MIN > 0, MAX 0 (sin tope)' },
  a8w: { label: 'Activo AP8 · solo WOS', help: 'Forecast 1, AP 8, MIN y MAX en 0: lo manda la cobertura WOS' },
  a7mm: { label: 'Activo AP7 · MIN y MAX', help: 'Igual que AP8 pero en centros AP 7' },
  a7m: { label: 'Activo AP7 · MIN sin tope', help: 'Igual que AP8 pero en centros AP 7' },
  a7w: { label: 'Activo AP7 · solo WOS', help: 'Igual que AP8 pero en centros AP 7' },
};
const SIN_TIPO = 'sinTipo';

const n = (v) => parseFloat(String(v ?? '').replace(/[,\s]/g, '')) || 0;
const fmt = (v) => Math.round(v).toLocaleString('es-MX');
const sinPlazo = (w) => !(n(w.plazo) > 0);

// null = la combinación no cae en ningún tipo
const tipoDe = (w) => {
  if (!w.act) return !w.ap && !w.min && !w.max && !w.wos && !n(w.plazo) ? 'apagado' : null;
  if (w.ap !== '7' && w.ap !== '8') return null;
  if (!(w.wos > 0) || sinPlazo(w) || (w.max > 0 && w.min > w.max)) return null;
  if (w.min > 0) return `a${w.ap}${w.max > 0 ? 'mm' : 'm'}`;
  return w.max > 0 ? null : `a${w.ap}w`;
};

const motivosDe = (w) => {
  const m = [];
  if (!w.act) { if (w.ap || w.min || w.max || w.wos || n(w.plazo)) m.push('Apagado con valores'); return m; }
  if (w.ap !== '7' && w.ap !== '8') m.push('AP distinto de 7/8');
  if (!(w.wos > 0)) m.push('Sin WOS');
  if (sinPlazo(w)) m.push('Sin plazo de entrega');
  if (w.max > 0 && w.min > w.max) m.push('MIN > MAX');
  if (!(w.min > 0) && w.max > 0) m.push('MAX sin MIN');
  return m;
};

// Lo que se puede corregir sin inventar datos; ref = moda de WOS/plazo de los activos del mismo artículo
const arreglo = (w, ref) => {
  const p = {};
  if (!w.act) {
    if (w.ap) p.ap = ''; if (w.min) p.min = 0; if (w.max) p.max = 0; if (w.wos) p.wos = 0; if (n(w.plazo)) p.plazo = '0';
    return p;
  }
  if (w.ap !== '7' && w.ap !== '8') p.ap = '8';
  if (w.max > 0 && w.min > w.max) p.max = w.min;
  if (!(w.wos > 0) && ref?.wos) p.wos = ref.wos;
  if (sinPlazo(w) && ref?.plazo) p.plazo = ref.plazo;
  return p;
};

function validar(P) {
  const c = P.cols;
  const W = P.rows.map((r, i) => ({
    i, grp: str(r[c.grp]), art: str(r[c.art]), desc: str(r[c.desc]), centro: str(r[c.centro]), act: str(r[c.nivel]) === '1',
    ap: str(r[c.ap]), min: n(r[c.min]), max: n(r[c.max]), wos: n(r[c.wos]), plazo: str(r[c.plazo]),
  }));
  const ref = new Map();
  W.filter((w) => w.act).forEach((w) => { const a = ref.get(w.art) || { wos: [], plazo: [] }; if (w.wos > 0) a.wos.push(w.wos); if (!sinPlazo(w)) a.plazo.push(w.plazo); ref.set(w.art, a); });
  ref.forEach((a, k) => ref.set(k, { wos: a.wos.length ? +moda(a.wos) : null, plazo: a.plazo.length ? moda(a.plazo) : null }));
  W.forEach((w) => {
    w.tipo = tipoDe(w);
    if (w.tipo) { w.estado = 'ok'; w.patch = {}; return; }
    w.motivos = motivosDe(w);
    w.patch = arreglo(w, ref.get(w.art));
    w.estado = Object.keys(w.patch).length && tipoDe({ ...w, ...w.patch }) ? 'corregido' : 'manual';
    if (w.estado === 'manual') w.patch = {}; // si no queda válido no se toca: se revisa a mano en O9
  });
  return W;
}

// ─── Módulo ───────────────────────────────────────────────────────────────────
export default function ModuleValidador({ t, isDark, navIcon, navLabel, navDesc }) {
  const [P, setP] = useState(null);
  const [tab, setTab] = useState('combos');
  const [msg, setMsg] = useState(null);
  const [fFcst, setFFcst] = useState('all');
  const [fEstado, setFEstado] = useState('all');
  const [fTipo, setFTipo] = useState('all');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { try { localStorage.setItem('gop_validador_files', JSON.stringify(P ? [P.name] : [])); } catch {} }, [P]);
  const W = useMemo(() => (P ? validar(P) : null), [P]);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const r = await parseFile(f);
      if (!r.param) { setMsg({ ok: false, text: 'No encontré el bloque ZO9_DM (encabezados Gpo. Art … Nivel Forecast N, Stock Min N).' }); return; }
      setP(r.param); setMsg({ ok: true, text: `${r.param.name} · ${fmt(r.param.rows.length)} combinaciones` });
    } catch (err) { setMsg({ ok: false, text: `Error leyendo archivo: ${err.message}` }); }
  };

  const exportCorregido = () => {
    const c = P.cols, aoa = [[...P.header, 'CAMBIOS']];
    W.forEach((w) => {
      if (!Object.keys(w.patch).length) return;
      const row = [...P.rows[w.i]], ch = [];
      Object.entries(w.patch).forEach(([k, v]) => { const old = row[c[k]]; ch.push(`${P.header[c[k]]} ${old === '' ? '∅' : old}→${v === '' ? '∅' : v}`); row[c[k]] = v; });
      aoa.push([...row, ch.join('; ')]);
    });
    if (aoa.length === 1) { setMsg({ ok: true, text: 'Sin cambios que exportar.' }); return; }
    downloadCSV('Parametrizacion_corregida.csv', aoa);
  };

  const stats = useMemo(() => {
    if (!W) return null;
    const porTipo = {}, motivos = {};
    Object.keys(TIPOS).concat(SIN_TIPO).forEach((k) => (porTipo[k] = { si: 0, no: 0 }));
    W.forEach((w) => { porTipo[w.tipo || SIN_TIPO][w.act ? 'si' : 'no']++; (w.motivos || []).forEach((m) => { const x = (motivos[m] = motivos[m] || { total: 0, corr: 0 }); x.total++; if (w.estado === 'corregido') x.corr++; }); });
    return { porTipo, motivos, si: W.filter((w) => w.act).length, ok: W.filter((w) => w.estado === 'ok').length, corr: W.filter((w) => w.estado === 'corregido').length, man: W.filter((w) => w.estado === 'manual').length };
  }, [W]);

  const shown = useMemo(() => {
    if (!W) return [];
    const s = norm(q);
    return W.filter((w) => (fFcst === 'all' || (fFcst === 'si') === w.act) && (fEstado === 'all' || w.estado === fEstado) && (fTipo === 'all' || (w.tipo || SIN_TIPO) === fTipo)
      && (!s || norm(`${w.art} ${w.desc} ${w.centro} ${w.grp}`).includes(s)));
  }, [W, fFcst, fEstado, fTipo, q]);

  const card = `rounded-2xl border p-4 ${t.card}`;
  const th = `px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-left whitespace-nowrap ${t.tableHead}`;
  const td = 'px-2 py-1 text-xs whitespace-nowrap';
  const inCls = `px-2 py-1 text-xs rounded-lg border focus:outline-none focus:ring-1 ${t.input}`;
  const seg = (val, set, opts) => (
    <div className={`flex rounded-lg border p-0.5 ${t.toggle}`}>
      {opts.map(([k, l]) => <button key={k} onClick={() => set(k)} className={`px-3 py-1 text-xs rounded-md ${val === k ? t.toggleActive : t.textMuted}`}>{l}</button>)}
    </div>
  );
  const nFil = (fFcst !== 'all') + (fEstado !== 'all') + (fTipo !== 'all') + (q ? 1 : 0);
  const verTipo = (k) => { setFTipo(k); setFFcst('all'); setFEstado('all'); setQ(''); setTab('combos'); };
  const tipoLabel = (k) => TIPOS[k]?.label || 'Sin tipo válido';

  const headerRight = (
    <>
      {W && (
        <FilterMenu isDark={isDark} count={nFil} width={520}>
          <FilterSection label="Buscar" isDark={isDark}>
            <div className="relative">
              <Search size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${t.textMuted}`} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Artículo, centro, grupo…" className={`pl-6 ${inCls}`} />
            </div>
          </FilterSection>
          <FilterSection label="Forecast" isDark={isDark}>{seg(fFcst, setFFcst, [['all', 'Todos'], ['si', 'Sí'], ['no', 'No']])}</FilterSection>
          <FilterSection label="Estado" isDark={isDark}>{seg(fEstado, setFEstado, [['all', 'Todos'], ['ok', 'Válidos'], ['corregido', 'Corregidos'], ['manual', 'Revisar']])}</FilterSection>
          <FilterSection label="Tipo de afectación" isDark={isDark}>
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={inCls} style={isDark ? { colorScheme: 'dark', backgroundColor: '#241e29' } : undefined}>
              <option value="all">Todos</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              <option value={SIN_TIPO}>Sin tipo válido</option>
            </select>
          </FilterSection>
          {nFil > 0 && <button onClick={() => { setFFcst('all'); setFEstado('all'); setFTipo('all'); setQ(''); }} className={`px-3 py-1.5 text-xs rounded-lg ${t.btnGhost}`}>✕ Limpiar</button>}
        </FilterMenu>
      )}
      <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-bold ${t.btn}`}><Upload size={14} />Cargar parametrización</button>
      <button onClick={exportCorregido} disabled={!W} className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg ${t.btnSec} disabled:opacity-40`}><Download size={14} />CSV corregido</button>
      <button onClick={() => { if (confirm('¿Borrar la parametrización cargada?')) setP(null); }} disabled={!W} className={`p-2 rounded-lg border ${t.btnDanger} disabled:opacity-40`} title="Borrar"><Trash2 size={14} /></button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={onFile} />
    </>
  );

  return (
    <div className="p-4 md:p-8 space-y-4">
      <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} right={headerRight} />
      {msg && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${msg.ok ? t.successBg : t.dangerBg}`}>
          <span>{msg.text}</span><button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {!W ? (
        <div className={`${card} text-center py-16`}>
          <Upload size={28} className={`mx-auto mb-3 ${t.textMuted}`} />
          <p className={`font-bold ${t.text}`}>Carga la parametrización que viaja de O9</p>
          <p className={`text-xs mt-1 ${t.textMuted}`}>Excel o CSV con el bloque ZO9_DM: Gpo. Art., Var / Ind, Descripción, Centro, AP N, Nivel Forecast N, Stock Min N, Stock Max N, WOS N, Plazo Ent N.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ['Combinaciones', fmt(W.length), t.text],
              ['Con forecast', `${fmt(stats.si)} · ${fmt(W.length - stats.si)} sin`, t.accent1],
              ['Caen en un tipo', fmt(stats.ok), t.success],
              ['Corregibles', fmt(stats.corr), stats.corr ? t.warning : t.success],
              ['Revisar a mano', fmt(stats.man), stats.man ? t.danger : t.success],
            ].map(([l, v, cl]) => (
              <div key={l} className={card}>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${t.textMuted}`}>{l}</p>
                <p className={`text-2xl font-black mt-1 ${cl}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className={`flex gap-4 border-b ${t.border}`}>
            {[['combos', 'Combinaciones'], ['resumen', 'Resumen por tipo']].map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)} className={`pb-2 text-sm font-bold border-b-2 ${tab === id ? t.tabActive : t.tabInactive}`}>{l}</button>
            ))}
          </div>

          {tab === 'combos' ? (
            <div className={card}>
              <p className={`text-xs mb-3 ${t.textMuted}`}>{fmt(shown.length)} combinaciones{fTipo !== 'all' ? ` · ${tipoLabel(fTipo)}` : ''}</p>
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full">
                  <thead className="sticky top-0 z-10"><tr>{['Gpo. Art.', 'Artículo', 'Descripción', 'Centro', 'Forecast', 'AP', 'MIN', 'MAX', 'WOS', 'Plazo', 'Tipo de afectación', 'Estado'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.slice(0, 500).map((w) => (
                      <tr key={w.i} className={`border-t ${t.border} ${t.tableRow}`}>
                        <td className={td}>{w.grp}</td><td className={`${td} ${t.accent1}`}>{w.art}</td><td className={`${td} max-w-[220px] truncate`}>{w.desc}</td><td className={td}>{w.centro}</td>
                        <td className={`${td} font-bold ${w.act ? t.success : t.textMuted}`}>{w.act ? 'Sí' : 'No'}</td>
                        {['ap', 'min', 'max', 'wos', 'plazo'].map((k) => <td key={k} className={`${td} tabular-nums text-right ${w.patch[k] !== undefined ? `${t.accent2} font-bold` : ''}`}>{w[k] === '' || w[k] == null ? '—' : String(w[k])}</td>)}
                        <td className={`${td} font-bold ${w.tipo ? t.text : t.danger}`}>{tipoLabel(w.tipo)}</td>
                        <td className={`${td} ${w.estado === 'ok' ? t.success : w.estado === 'corregido' ? t.warning : t.danger}`}>
                          {w.estado === 'ok' ? '✓' : `${w.estado === 'corregido' ? 'Corregido' : 'Revisar'} · ${w.motivos.join(', ')}`}
                          {w.estado === 'corregido' && <span className={t.textMuted}> → {Object.entries(w.patch).map(([k, v]) => `${k.toUpperCase()} ${v === '' ? '∅' : v}`).join(', ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!shown.length && <p className={`text-center py-8 text-sm ${t.textMuted}`}>Sin combinaciones con estos filtros.</p>}
                {shown.length > 500 && <p className={`mt-2 text-[10px] ${t.textMuted}`}>Mostrando 500 de {fmt(shown.length)} — afina los filtros para ver el resto.</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={card}>
                <p className={`text-xs mb-3 ${t.textMuted}`}>Cada combinación debe caer en uno de los 7 tipos de afectación. Click en un renglón para ver sus combinaciones.</p>
                <table className="w-full">
                  <thead><tr>{['Tipo de afectación', 'Definición', 'Con forecast', 'Sin forecast', 'Total', '% del total'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...Object.keys(TIPOS), SIN_TIPO].map((k) => {
                      const { si, no } = stats.porTipo[k], tot = si + no, bad = k === SIN_TIPO;
                      return (
                        <tr key={k} onClick={() => verTipo(k)} className={`border-t cursor-pointer ${t.border} ${t.tableRow}`}>
                          <td className={`${td} font-bold ${bad && tot ? t.danger : t.text}`}>{!bad && tot ? <CheckCircle2 size={12} className={`inline mr-1 ${t.success}`} /> : bad && tot ? <AlertOctagon size={12} className="inline mr-1" /> : null}{tipoLabel(k)}</td>
                          <td className={`${td} ${t.textMuted} whitespace-normal`}>{bad ? 'No cumple ninguna definición: se corrige o se revisa a mano' : TIPOS[k].help}</td>
                          <td className={`${td} tabular-nums text-right`}>{fmt(si)}</td><td className={`${td} tabular-nums text-right`}>{fmt(no)}</td>
                          <td className={`${td} tabular-nums text-right font-bold`}>{fmt(tot)}</td><td className={`${td} tabular-nums text-right ${t.textMuted}`}>{W.length ? ((tot / W.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {Object.keys(stats.motivos).length > 0 && (
                <div className={card}>
                  <p className={`text-xs mb-3 flex items-center gap-1.5 ${t.textMuted}`}><AlertTriangle size={12} className={t.warning} />Por qué no caen en un tipo</p>
                  <table className="w-full">
                    <thead><tr>{['Motivo', 'Combinaciones', 'Con corrección automática'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {Object.entries(stats.motivos).sort((a, b) => b[1].total - a[1].total).map(([m, x]) => (
                        <tr key={m} className={`border-t ${t.border} ${t.tableRow}`}>
                          <td className={`${td} font-bold ${t.text}`}>{m}</td><td className={`${td} tabular-nums text-right`}>{fmt(x.total)}</td><td className={`${td} tabular-nums text-right ${t.accent2}`}>{fmt(x.corr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={`text-[10px] mt-2 ${t.textMuted}`}>El CSV corregido solo trae las filas que cambian (formato ZO9_DM + columna CAMBIOS). Lo que queda en «Revisar» no se toca: hay que decidirlo a mano.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

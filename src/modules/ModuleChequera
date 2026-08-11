import { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Plus, Trash2, X, Check, Search, Image as ImageIcon } from 'lucide-react';
import {
  CHEQUERA_FIELDS, autoMapHeaders, parseSpreadsheet, applyMapping,
  extractEmbeddedImages, saveImageBlob, getImageBlob, sortMonthKeys,
} from '../utilidades/chequeraHelpers';

const emptyRow = () => {
  const row = { id: crypto.randomUUID(), imagenUrl: '' };
  CHEQUERA_FIELDS.forEach((f) => { row[f.key] = ''; });
  return row;
};

function useLocalRows(storageKey) {
  const [rows, setRows] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(rows));
    }, 400);
    return () => clearTimeout(timer.current);
  }, [rows, storageKey]);
  return [rows, setRows];
}

function ImportModal({ tipo, onClose, onConfirm }) {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [imgMap, setImgMap] = useState(new Map());
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setLoading(true);
    setFile(f);
    const { headers: h, rows } = await parseSpreadsheet(f);
    setHeaders(h);
    setRawRows(rows);
    setMapping(autoMapHeaders(h));
    if (tipo === 'propia' && f.name.toLowerCase().endsWith('.xlsx')) {
      try { setImgMap(await extractEmbeddedImages(f)); } catch { setImgMap(new Map()); }
    }
    setLoading(false);
  };

  const confirm = () => onConfirm(applyMapping(rawRows, mapping, imgMap));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-neutral-900 dark:text-white">
            Importar {tipo === 'externa' ? 'Marca Externa' : 'Marca Propia (PLM)'}
          </h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        {!file && (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg py-10 cursor-pointer hover:border-violet-500">
            <Upload size={28} className="text-neutral-400 mb-2" />
            <span className="text-sm text-neutral-500">Selecciona CSV o XLSX</span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
          </label>
        )}

        {loading && <p className="text-sm text-neutral-500 mt-4">Procesando archivo…</p>}

        {!loading && headers.length > 0 && (
          <>
            <p className="text-xs text-neutral-500 mb-3">
              Revisa el match de columnas ({rawRows.length} filas{imgMap.size > 0 ? `, ${imgMap.size} fotos encontradas` : ''}):
            </p>
            <div className="space-y-2 mb-4">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-3">
                  <span className="text-sm text-neutral-700 dark:text-neutral-300 w-1/2 truncate">{h}</span>
                  <select
                    value={mapping[h] || ''}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value || null })}
                    className="flex-1 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-transparent dark:bg-neutral-800 px-2 py-1"
                  >
                    <option value="">— Ignorar —</option>
                    {CHEQUERA_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700">
                Cancelar
              </button>
              <button onClick={confirm} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white flex items-center gap-1">
                <Check size={16} /> Importar {rawRows.length} filas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChequeraTable({ rows, setRows, tipo, imageUrls }) {
  const updateCell = (id, key, value) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const buscarGoogle = (row) => {
    const q = [row.marca, row.sku, row.especificaciones].filter(Boolean).join(' ');
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`, '_blank');
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 dark:bg-neutral-800">
            <tr>
              <th className="p-2 text-left w-14">Foto</th>
              {CHEQUERA_FIELDS.map((f) => (
                <th key={f.key} className="p-2 text-left whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                  {f.label}
                </th>
              ))}
              {tipo === 'externa' && <th className="p-2 text-left w-24">Foto URL</th>}
              <th className="p-2 text-left w-16">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const src = tipo === 'propia' ? imageUrls[row.sku] || '' : row.imagenUrl;
              return (
                <tr key={row.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="p-2">
                    {src ? (
                      <img src={src} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
                        <ImageIcon size={16} />
                      </div>
                    )}
                  </td>
                  {CHEQUERA_FIELDS.map((f) => (
                    <td key={f.key} className="p-1">
                      <input
                        value={row[f.key] || ''}
                        onChange={(e) => updateCell(row.id, f.key, e.target.value)}
                        className="w-28 bg-transparent px-1 py-1 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500 rounded"
                      />
                    </td>
                  ))}
                  {tipo === 'externa' && (
                    <td className="p-1">
                      <input
                        placeholder="Pega URL"
                        value={row.imagenUrl || ''}
                        onChange={(e) => updateCell(row.id, 'imagenUrl', e.target.value)}
                        className="w-24 bg-transparent px-1 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500 rounded"
                      />
                    </td>
                  )}
                  <td className="p-2 flex items-center gap-2">
                    {tipo === 'externa' && (
                      <button onClick={() => buscarGoogle(row)} title="Buscar foto en Google" className="text-neutral-400 hover:text-violet-500">
                        <Search size={16} />
                      </button>
                    )}
                    <button onClick={() => deleteRow(row.id)} className="text-neutral-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="text-sm text-neutral-500 text-center py-6">Sin registros aún.</p>}
      <button onClick={addRow} className="mt-3 flex items-center gap-1 text-sm text-violet-600 hover:text-violet-500">
        <Plus size={16} /> Agregar fila
      </button>
    </div>
  );
}

function ResumenTab({ externaRows, propiaRows }) {
  const { groups, months, matrix, totalsByMonth, grandTotal } = useMemo(() => {
    const all = [
      ...externaRows.map((r) => ({ ...r, proveedor: r.proveedor || '—' })),
      ...propiaRows.map((r) => ({ ...r, proveedor: r.proveedor || 'Marca Propia' })),
    ];
    const groupSet = new Set(), monthSet = new Set(), map = {};
    all.forEach((r) => {
      const g = `${r.marca || '—'} / ${r.proveedor || '—'}`;
      const m = r.mesRecepcion || 'Sin mes';
      const val = (Number(r.pvp) || 0) * (Number(r.cantidad) || 0);
      groupSet.add(g); monthSet.add(m);
      map[g] = map[g] || {};
      map[g][m] = (map[g][m] || 0) + val;
    });
    const groups = [...groupSet].sort();
    const months = sortMonthKeys([...monthSet]);
    const totalsByMonth = {};
    let grandTotal = 0;
    groups.forEach((g) => months.forEach((m) => {
      const v = map[g]?.[m] || 0;
      totalsByMonth[m] = (totalsByMonth[m] || 0) + v;
      grandTotal += v;
    }));
    return { groups, months, matrix: map, totalsByMonth, grandTotal };
  }, [externaRows, propiaRows]);

  const fmt = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

  if (groups.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-10">Sin datos para resumir todavía.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 dark:bg-neutral-800">
          <tr>
            <th className="p-2 text-left sticky left-0 bg-neutral-100 dark:bg-neutral-800">Marca / Proveedor</th>
            {months.map((m) => <th key={m} className="p-2 text-right whitespace-nowrap">{m}</th>)}
            <th className="p-2 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const rowTotal = months.reduce((s, m) => s + (matrix[g]?.[m] || 0), 0);
            return (
              <tr key={g} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="p-2 sticky left-0 bg-white dark:bg-neutral-900 font-medium">{g}</td>
                {months.map((m) => (
                  <td key={m} className="p-2 text-right text-neutral-700 dark:text-neutral-300">
                    {matrix[g]?.[m] ? fmt(matrix[g][m]) : '—'}
                  </td>
                ))}
                <td className="p-2 text-right font-bold">{fmt(rowTotal)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-300 dark:border-neutral-700 font-bold">
            <td className="p-2 sticky left-0 bg-white dark:bg-neutral-900">Total</td>
            {months.map((m) => <td key={m} className="p-2 text-right">{fmt(totalsByMonth[m] || 0)}</td>)}
            <td className="p-2 text-right">{fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function ModuleChequera() {
  const [tab, setTab] = useState('externa');
  const [externaRows, setExternaRows] = useLocalRows('chequera_externa');
  const [propiaRows, setPropiaRows] = useLocalRows('chequera_propia');
  const [importOpen, setImportOpen] = useState(null);
  const [imageUrls, setImageUrls] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = {};
      for (const row of propiaRows) {
        if (!row.sku || imageUrls[row.sku]) continue;
        const blob = await getImageBlob(row.sku);
        if (blob) entries[row.sku] = URL.createObjectURL(blob);
      }
      if (!cancelled && Object.keys(entries).length) setImageUrls((prev) => ({ ...prev, ...entries }));
    })();
    return () => { cancelled = true; };
  }, [propiaRows]);

  const handleImportConfirm = async (mapped) => {
    if (importOpen === 'externa') {
      setExternaRows((prev) => [...prev, ...mapped]);
    } else {
      for (const row of mapped) {
        if (row._imageBlob && row.sku) await saveImageBlob(row.sku, row._imageBlob);
        delete row._imageBlob;
      }
      setPropiaRows((prev) => [...prev, ...mapped]);
    }
    setImportOpen(null);
  };

  const tabs = [
    { key: 'externa', label: 'Marca Externa' },
    { key: 'propia', label: 'Marca Propia' },
    { key: 'resumen', label: 'Resumen' },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Chequera</h2>
        {tab !== 'resumen' && (
          <button onClick={() => setImportOpen(tab)} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-violet-600 text-white">
            <Upload size={16} /> Importar archivo
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? 'border-violet-600 text-violet-600' : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'externa' && <ChequeraTable rows={externaRows} setRows={setExternaRows} tipo="externa" imageUrls={imageUrls} />}
      {tab === 'propia' && <ChequeraTable rows={propiaRows} setRows={setPropiaRows} tipo="propia" imageUrls={imageUrls} />}
      {tab === 'resumen' && <ResumenTab externaRows={externaRows} propiaRows={propiaRows} />}

      {importOpen && <ImportModal tipo={importOpen} onClose={() => setImportOpen(null)} onConfirm={handleImportConfirm} />}
    </div>
  );
}

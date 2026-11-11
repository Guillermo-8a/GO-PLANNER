import { useState } from 'react';
import { Database } from 'lucide-react';
import { fetchBQFile } from '../utils/bq';

// Botón "BigQuery" estándar: trae el CSV de la fuente y se lo pasa al mismo handler que el input de archivo del módulo.
export default function BQButton({ source, params, onFile, label = 'BigQuery', className = '' }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const file = await fetchBQFile(source, typeof params === 'function' ? params() : params);
      await onFile({ target: { files: [file], value: '' } });
    } catch (e) { window.alert(`BigQuery (${source}): ${e.message}`); }
    setBusy(false);
  };
  return (
    <button onClick={go} disabled={busy} title={`Traer de BigQuery · ${source}`}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 ${className}`}>
      <Database size={14} /> {busy ? 'Consultando…' : label}
    </button>
  );
}

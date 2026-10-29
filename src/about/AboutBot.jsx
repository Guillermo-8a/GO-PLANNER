// GO-Bot flotante de la página About: chat sobre GO PLANNER (IA si hay API; si no, el manual goplannerKB).
import { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useGoBot } from '../context/GoBotContext';
import { BotClip } from '../components/GoBotRightDock';

const QUICK = ['¿Qué es GO PLANNER?', '¿Qué archivo pide Eventos?', '¿Cómo se calcula el Sell-Through?'];

export default function AboutBot() {
  const bot = useGoBot();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [bot?.chat, open]);
  if (!bot) return null;
  const { chat, isBusy, ask } = bot;
  const send = (text) => { if (!text.trim()) return; ask(text); setQ(''); };

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(360px,calc(100vw-40px))] rounded-3xl border border-white/10 p-4 shadow-2xl shadow-black/60 gp-fadein"
          style={{ background: 'rgba(16,12,24,.82)', backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-black text-white">GO-Bot</p>
              <p className="text-[11px] text-zinc-400">Pregúntame cómo funciona GO PLANNER</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"><X size={15} /></button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {chat.map((m, i) => (
              <div key={i} className={`px-3 py-2 rounded-2xl text-[12.5px] leading-snug whitespace-pre-line ${m.role === 'user' ? 'ml-8 bg-violet-600/40 text-white' : 'mr-6 bg-white/[0.06] text-zinc-200'}`}>{m.text}</div>
            ))}
            {isBusy && <p className="text-[11px] text-violet-300 animate-pulse px-1">Pensando…</p>}
            <div ref={end} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK.map((x) => <button key={x} onClick={() => send(x)} className="rounded-full bg-white/[0.06] hover:bg-white/10 px-2.5 py-1 text-[10.5px] text-zinc-300">{x}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="mt-3 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe tu pregunta…" className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-[12.5px] text-white placeholder:text-zinc-500 outline-none focus:border-violet-400/60" />
            <button disabled={isBusy} className="rounded-xl bg-violet-600 hover:bg-violet-500 px-3 text-white disabled:opacity-50"><Send size={14} /></button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} title="GO-Bot" className="group relative rounded-full">
        {!open && <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white text-black text-[11px] font-bold px-3 py-1.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">¿Dudas? Pregúntame</span>}
        <BotClip clip="peek" size={88} isDark />
      </button>
    </div>
  );
}

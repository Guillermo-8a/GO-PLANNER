import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Sparkles } from 'lucide-react';
import { useGoBot } from '../context/GoBotContext';

// Video del bot. Fondo negro + mix-blend-screen = "transparente" sobre fondo oscuro.
// En tema claro va dentro de un tile oscuro aislado para que el blend no lo deslave.
export function BotClip({ clip, size = 120, isDark = true, framed = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [clip]);
  const box = { width: size, height: size };
  if (failed) {
    return (
      <div style={box} className="flex items-center justify-center rounded-2xl bg-[#121016] border border-violet-500/30">
        <Bot size={size * 0.42} className="text-violet-400" />
      </div>
    );
  }
  return (
    <div style={box} className={isDark && !framed ? '' : 'rounded-2xl overflow-hidden bg-black isolate ring-1 ring-white/10'}>
      <video
        key={clip}
        src={`/bots/bot-${clip}.mp4`}
        autoPlay loop muted playsInline
        onError={() => setFailed(true)}
        width={size} height={size}
        className="block mix-blend-screen pointer-events-none select-none"
      />
    </div>
  );
}

// Botón dentro del rail derecho (debajo de "?").
export function GoBotRailButton({ isDark }) {
  const { mode, open, close, runAudit, critCount } = useGoBot();
  const active = mode === 'open';
  return (
    <button
      title="GO-Bot"
      onClick={() => { if (active) close(); else { open('audit'); runAudit(); } }}
      className={`relative p-2.5 rounded-xl border transition ${
        active
          ? 'bg-violet-600/20 border-violet-500/60 text-violet-300'
          : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-violet-400 hover:border-violet-500/50' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300'
      }`}
    >
      <Bot size={16} />
      {critCount > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black" />}
    </button>
  );
}

const LEVEL = {
  red: { dot: 'bg-red-500', text: 'text-red-400', label: 'Crítico' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Revisar' },
  green: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'En rango' },
};
const QUICK = ['¿Qué alertas tengo y qué hago primero?', '¿Cómo se calcula el Sell-Through?', '¿Cómo mejoro la rotación?'];

// Escenario: vive detrás del rail derecho (el "muro"). Se coloca pegado a su borde izquierdo
// con overflow-hidden y desliza con `left` (no transform, para no romper el mix-blend).
export default function GoBotStage({ isDark, railRef }) {
  const { mode, clip, tab, setTab, bubble, audit, chat, isBusy, close, runAudit, ask } = useGoBot();
  const [railW, setRailW] = useState(56);
  const [q, setQ] = useState('');
  const chatEnd = useRef(null);

  useEffect(() => { if (railRef?.current) setRailW(railRef.current.offsetWidth); }, [railRef]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat, tab]);

  const shown = mode !== 'hidden';
  const card = isDark ? 'bg-[#1c1720]/95 border-white/10 text-zinc-100' : 'bg-white border-gray-200 text-gray-800';
  const muted = isDark ? 'text-zinc-400' : 'text-gray-500';
  const chip = isDark ? 'bg-white/5 hover:bg-white/10 text-zinc-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600';
  const lv = LEVEL[audit?.level] || LEVEL.green;

  const submit = (e) => { e.preventDefault(); ask(q); setQ(''); };

  return (
    <div
      className="absolute bottom-3 overflow-hidden"
      style={{ right: railW, width: 'min(460px, calc(100vw - 120px))', pointerEvents: shown ? 'auto' : 'none' }}
      aria-hidden={!shown}
    >
      <div
        className="relative flex items-end justify-end gap-1 transition-[left] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
        style={{ left: shown ? 0 : '100%' }}
      >
        {mode === 'open' && (
          <div className={`flex-1 min-w-0 mb-2 rounded-2xl border shadow-2xl p-3.5 ${card}`}>
            <div className="flex items-center gap-1.5 mb-3">
              {[['audit', 'Auditoría'], ['chat', 'Pregúntale']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${tab === id ? 'bg-violet-600 text-white' : chip}`}
                >
                  {label}
                </button>
              ))}
              <button onClick={close} title="Esconder" className={`ml-auto p-1 rounded-lg ${muted} hover:text-current`}><X size={14} /></button>
            </div>

            {tab === 'audit' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${lv.dot}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${lv.text}`}>{lv.label}</span>
                  <span className={`text-[10px] ${muted}`}>· {audit?.source === 'ia' ? 'local + IA' : 'local'}</span>
                </div>
                <p className="text-sm font-black leading-snug">{audit?.title || 'Sin auditoría todavía'}</p>
                {audit?.items?.length > 0 && (
                  <ul className={`text-xs space-y-1 max-h-40 overflow-y-auto pr-1 ${muted}`}>
                    {audit.items.map((it, i) => <li key={i} className="leading-snug">• {it}</li>)}
                  </ul>
                )}
                {audit?.note && <p className="text-[10px] text-amber-400">{audit.note}</p>}
                <button
                  onClick={() => runAudit({ withAI: true })}
                  disabled={isBusy}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
                >
                  <Sparkles size={13} /> {isBusy ? 'Analizando pantalla…' : 'Auditar esta pantalla con IA'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {chat.map((m, i) => (
                    <div
                      key={i}
                      className={`px-2.5 py-2 rounded-xl text-xs whitespace-pre-line leading-snug ${
                        m.role === 'user' ? 'ml-6 bg-violet-600/25' : `mr-4 ${isDark ? 'bg-white/5' : 'bg-gray-100'}`
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                  {isBusy && <p className="text-[11px] text-violet-400 animate-pulse">Leyendo tus datos…</p>}
                  <div ref={chatEnd} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {QUICK.map((x) => <button key={x} onClick={() => ask(x)} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${chip}`}>{x}</button>)}
                </div>
                <form onSubmit={submit} className="flex gap-1.5">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Pregunta sobre lo que ves…"
                    className={`flex-1 min-w-0 px-3 py-2 rounded-xl border text-xs outline-none ${isDark ? 'bg-black/40 border-white/10' : 'bg-white border-gray-200'}`}
                  />
                  <button type="submit" disabled={isBusy} className="px-3 rounded-xl bg-violet-600 text-white disabled:opacity-50"><Send size={13} /></button>
                </form>
              </div>
            )}
          </div>
        )}

        {mode === 'peek' && bubble && (
          <div className={`mb-16 max-w-[220px] rounded-2xl rounded-br-sm border px-3 py-2 text-xs font-bold shadow-xl ${card}`}>
            {bubble}
          </div>
        )}

        <div className="shrink-0">
          <BotClip clip={clip} size={mode === 'open' ? 120 : 140} isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

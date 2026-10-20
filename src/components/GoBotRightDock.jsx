import React, { useState } from 'react';
import { Sparkles, X, ArrowRight, Lock, MessageSquare, Send } from 'lucide-react';
import GoBot3DAvatar from './GoBot3DAvatar';
import { useGoBot } from '../context/GoBotContext';

export default function GoBotRightDock({ isDark = true }) {
  const {
    semaphore,
    animation,
    isPeekOpen,
    setIsPeekOpen,
    isBotVisible,
    setIsBotVisible,
    auditReport,
    runCognitiveAudit,
    chatHistory,
    askGoBotQuestion,
    isAsking
  } = useGoBot();

  const [tab, setTab] = useState('audit');
  const [inputQuestion, setInputQuestion] = useState('');

  const handleToggleBot = () => {
    if (!isPeekOpen) {
      setIsBotVisible(true);
      setIsPeekOpen(true);
      setTab('audit');
      runCognitiveAudit();
    } else {
      setIsPeekOpen(false);
      setTimeout(() => setIsBotVisible(false), 400);
    }
  };

  const handleClosePanel = () => {
    setIsPeekOpen(false);
    setTimeout(() => setIsBotVisible(false), 450);
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputQuestion.trim()) return;
    askGoBotQuestion(inputQuestion);
    setInputQuestion('');
  };

  return (
    <div id="gobot-dock-root">
      {/* Botón único integrado en tu barra lateral derecha (debajo del icono '?') */}
      <button
        onClick={handleToggleBot}
        title="GO-Bot Sentinel"
        className={`fixed right-[7px] top-[190px] z-50 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 border ${
          semaphore === 'red'
            ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse shadow-lg shadow-rose-500/30'
            : isPeekOpen
            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/40'
            : 'bg-slate-900/90 border-slate-700/80 text-sky-400 hover:border-sky-400 hover:scale-105'
        }`}
      >
        <Sparkles className="w-4 h-4" />
      </button>

      {/* Panel y Avatar asomándose por detrás de la barra lateral derecha */}
      <div
        className="fixed right-[48px] bottom-4 z-40 pointer-events-none flex items-end justify-end overflow-hidden"
        style={{ width: '540px', height: '440px' }}
      >
        <div
          className={`pointer-events-auto flex items-end gap-2 transition-transform duration-500 ease-out ${
            isBotVisible || isPeekOpen ? 'translate-x-0' : 'translate-x-[150%]'
          }`}
        >
          {/* Globo de diálogo */}
          {isPeekOpen && (
            <div className="mb-4 w-80 sm:w-[370px] p-4 rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-slate-800 text-slate-100 shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800/80">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setTab('audit'); runCognitiveAudit(); }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                      tab === 'audit' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    Auditoría en Vivo
                  </button>
                  <button
                    onClick={() => { setTab('chat'); setIsPeekOpen(true); }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition ${
                      tab === 'chat' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" /> Preguntar
                  </button>
                </div>

                <button
                  onClick={handleClosePanel}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {tab === 'audit' ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      semaphore === 'red' ? 'bg-rose-500 animate-ping' :
                      semaphore === 'amber' ? 'bg-amber-400' :
                      semaphore === 'green' ? 'bg-emerald-400' : 'bg-sky-400'
                    }`} />
                    <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                      {auditReport.pillar || 'Análisis de Pantalla'}
                    </span>
                  </div>

                  <h4 className="text-sm font-extrabold text-white">{auditReport.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{auditReport.message}</p>

                  {auditReport.suggestion && (
                    <div className="pt-2">
                      <button
                        onClick={auditReport.onApplyFix || handleClosePanel}
                        className="w-full py-2 px-3.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 text-white flex items-center justify-center gap-2 hover:opacity-95 shadow-md"
                      >
                        <span>{auditReport.suggestion}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  )}

                  {semaphore === 'red' && (
                    <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 flex items-center gap-2 text-[11px] text-rose-200 font-semibold">
                      <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                      Revisa esta desviación antes de enviar el plan.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {chatHistory.map((m, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-2xl text-xs leading-relaxed ${
                          m.role === 'user'
                            ? 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-100 ml-6'
                            : 'bg-slate-900 border border-slate-800 text-slate-200 mr-3'
                        }`}
                      >
                        {m.text}
                      </div>
                    ))}
                    {isAsking && (
                      <div className="text-[11px] text-cyan-400 animate-pulse px-1">
                        Leyendo indicadores de tu pantalla...
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSend} className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={inputQuestion}
                      onChange={(e) => setInputQuestion(e.target.value)}
                      placeholder="Pregunta sobre esta vista..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* Avatar 3D Vectorial Limpio (Cero dependencia de archivos de video externos) */}
          <div
            onClick={() => setIsPeekOpen(!isPeekOpen)}
            className="cursor-pointer relative transition-transform duration-300 hover:scale-105"
          >
            <GoBot3DAvatar variant={semaphore} animation={animation} isDark={isDark} size={92} />
          </div>
        </div>
      </div>
    </div>
  );
}

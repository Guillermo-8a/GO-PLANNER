import React, { useState } from 'react';
import { Sparkles, Smile, X, ArrowRight, Lock, MessageSquare, Send } from 'lucide-react';
import GoBot3DAvatar from './GoBot3DAvatar';
import { useGoBot } from '../context/GoBotContext';

export default function GoBotRightDock({ isDark = true }) {
  const {
    semaphore, animation, isPeekOpen, setIsPeekOpen,
    auditReport, runCognitiveAudit, triggerFunBreak,
    chatHistory, askGoBotQuestion, isAsking
  } = useGoBot();

  const [tab, setTab] = useState('audit');
  const [inputQuestion, setInputQuestion] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputQuestion.trim()) return;
    askGoBotQuestion(inputQuestion);
    setInputQuestion('');
  };

  return (
    <>
      <div className="fixed right-2 top-1/3 z-50 flex flex-col items-center gap-2.5 bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 p-2 rounded-2xl shadow-2xl">
        <button
          onClick={() => { setTab('audit'); runCognitiveAudit(); }}
          title="Check Pantalla con GO-Bot"
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shadow-lg hover:scale-105 transition"
        >
          <Sparkles className="w-5 h-5"/>
        </button>
        <button
          onClick={() => { setTab('chat'); setIsPeekOpen(true); }}
          title="Pregúntale al GO-Bot (Ventas por Sección/GOA/Marca, Sell-Through, Rotación)"
          className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 flex items-center justify-center hover:bg-cyan-500/25 transition"
        >
          <MessageSquare className="w-5 h-5"/>
        </button>
        <button
          onClick={() => triggerFunBreak()}
          title="Animación GO-Bot"
          className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-center hover:bg-amber-500/25 transition"
        >
          <Smile className="w-5 h-5"/>
        </button>
      </div>

      <div className={`fixed right-3 bottom-5 z-50 flex items-end gap-3 transition-all duration-500 ${isPeekOpen ? 'translate-x-0' : 'translate-x-8 hover:translate-x-0'}`}>
        {isPeekOpen && (
          <div className="w-80 sm:w-[400px] p-5 rounded-3xl bg-slate-900/95 backdrop-blur-2xl border border-slate-700/90 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setTab('audit')}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold ${tab === 'audit' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  🛡️ Auditoría
                </button>
                <button
                  onClick={() => setTab('chat')}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold ${tab === 'chat' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  💬 Pregúntale al Bot
                </button>
              </div>
              <button onClick={() => setIsPeekOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4"/>
              </button>
            </div>

            {tab === 'audit' ? (
              <>
                <h4 className="text-sm font-extrabold text-white">{auditReport.title}</h4>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{auditReport.message}</p>
                {auditReport.canFix && (
                  <button
                    onClick={auditReport.onApplyFix}
                    className="mt-3 w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 text-white flex items-center justify-center gap-2"
                  >
                    <span>{auditReport.suggestion}</span>
                    <ArrowRight className="w-4 h-4 shrink-0"/>
                  </button>
                )}
                {semaphore === 'red' && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 flex items-center gap-2 text-[11px] text-rose-200 font-semibold">
                    <Lock className="w-4 h-4 text-rose-400 shrink-0"/>
                    Envío bloqueado hasta corregir esta anomalía.
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2.5">
                <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                  {chatHistory.map((m, i) => (
                    <div key={i} className={`p-2.5 rounded-2xl text-xs ${m.role === 'user' ? 'bg-indigo-600/30 text-indigo-100 ml-5' : 'bg-slate-800 text-slate-200 mr-3'}`}>
                      {m.text}
                    </div>
                  ))}
                  {isAsking && <div className="text-[11px] text-cyan-400 animate-pulse">Analizando datos SAP...</div>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => askGoBotQuestion('¿Cuánto vendí el año pasado en mi Sección, GOA y Marca?')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-cyan-300">📊 Venta LY Sección/GOA</button>
                  <button onClick={() => askGoBotQuestion('¿Cómo se calcula el Sell-Through?')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-amber-300">📐 Fórmula Sell-Through</button>
                  <button onClick={() => askGoBotQuestion('¿Qué hacer para mejorar la rotación?')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-emerald-300">🚀 Subir Rotación</button>
                </div>
                <form onSubmit={handleSend} className="flex gap-1.5">
                  <input
                    type="text"
                    value={inputQuestion}
                    onChange={(e) => setInputQuestion(e.target.value)}
                    placeholder="Pregunta por Sección, GOA, Marca, WOS..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white outline-none"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs">
                    <Send className="w-3.5 h-3.5"/>
                  </button>
                </form>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1 mt-3 pt-2 border-t border-slate-800">
              <button onClick={() => triggerFunBreak('chairSpin360')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-sky-300">🪑 Silla 360°</button>
              <button onClick={() => triggerFunBreak('threePointShot')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-amber-300">🏀 Triple</button>
              <button onClick={() => triggerFunBreak('paperBallThrow')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-purple-300">📄 Papelazo</button>
              <button onClick={() => triggerFunBreak('cocaColaBreak')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-rose-300">🥤 Coquita</button>
              <button onClick={() => triggerFunBreak('fortniteVictoryDance')} className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-emerald-300">🕺 Fortnite</button>
            </div>
          </div>
        )}

        <GoBot3DAvatar variant={semaphore} animation={animation} isDark={isDark} size={94} onClick={() => setIsPeekOpen(!isPeekOpen)} />
      </div>
    </>
  );
}

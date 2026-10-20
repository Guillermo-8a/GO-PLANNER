import React, { useState, useEffect } from 'react';
import { Sparkles, X, ArrowRight, Lock, MessageSquare, Send } from 'lucide-react';
import GoBot3DAvatar from './GoBot3DAvatar';
import { useGoBot } from '../context/GoBotContext';

// Mapa de tus videos 3D pre-renderizados en public/bots/
const VIDEO_CLIPS = {
  idle: '/bots/bot-peek.mp4',
  scanning: '/bots/bot-peek.mp4',
  chairSpin360: '/bots/bot-spin.mp4',
  threePointShot: '/bots/bot-triple.mp4',
  paperBallThrow: '/bots/bot-paper.mp4',
  cocaColaBreak: '/bots/bot-drink.mp4',
  fortniteVictoryDance: '/bots/bot-victory.mp4'
};

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
    isAsking,
    triggerSurprisePeek
  } = useGoBot();

  const [tab, setTab] = useState('audit');
  const [inputQuestion, setInputQuestion] = useState('');
  const [videoFailed, setVideoFailed] = useState(false);

  const currentVideoSrc = VIDEO_CLIPS[animation] || VIDEO_CLIPS.idle;

  // Resetear estado de video cuando cambia la animación
  useEffect(() => {
    setVideoFailed(false);
  }, [currentVideoSrc]);

  // Aparición sorpresa orgánica cada 3.5 minutos (sale detrás del muro 6 seg y se esconde)
  useEffect(() => {
    const randomAnims = ['chairSpin360', 'threePointShot', 'paperBallThrow', 'cocaColaBreak', 'fortniteVictoryDance'];
    const interval = setInterval(() => {
      if (!isPeekOpen && semaphore !== 'red') {
        const pick = randomAnims[Math.floor(Math.random() * randomAnims.length)];
        triggerSurprisePeek(pick, 6500);
      }
    }, 210000);
    return () => clearInterval(interval);
  }, [isPeekOpen, semaphore, triggerSurprisePeek]);

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

  // Filtros de color neón según el semáforo para teñir la luz del video 3D
  const semaphoreGlow = {
    neutral: 'drop-shadow(0 0 18px rgba(56, 189, 248, 0.75))',
    green: 'drop-shadow(0 0 20px rgba(52, 211, 153, 0.85)) hue-rotate(85deg)',
    amber: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.85))',
    red: 'drop-shadow(0 0 22px rgba(244, 63, 94, 0.95)) hue-rotate(320deg)'
  };

  return (
    <div id="gobot-dock-root">
      {/* 1. UN SOLO BOTÓN DISCRETO INTEGRADO EN TU BARRA LATERAL DERECHA (Debajo del icono '?') */}
      <button
        onClick={handleToggleBot}
        title="Invocar GO-Bot Sentinel (Auditoría & Consultas)"
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

      {/* 2. ESCENARIO "PEEK-A-BOO": USA EL BORDE DE LA BARRA DERECHA (48px) COMO MURO FÍSICO */}
      <div
        className="fixed right-[48px] bottom-4 z-40 pointer-events-none flex items-end justify-end overflow-hidden"
        style={{ width: '560px', height: '460px' }}
      >
        <div
          className={`pointer-events-auto flex items-end gap-2 transition-transform duration-500 ease-out ${
            isBotVisible || isPeekOpen
              ? 'translate-x-0'
              : 'translate-x-[150%]' /* Escondido 100% detrás del muro de la barra lateral */
          }`}
        >
          {/* GLOBO DE DIÁLOGO (Solo visible cuando está abierto) */}
          {isPeekOpen && (
            <div className="mb-4 w-80 sm:w-[370px] p-4 rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-slate-800 text-slate-100 shadow-2xl transition-all duration-300">
              {/* Pestañas limpias */}
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
                    onClick={() => setTab('chat')}
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
                  title="Esconder detrás de la barra"
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
                /* CHAT CONECTADO A LOS DATOS EN PANTALLA */
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
                        Leyendo indicadores y tablas de tu pantalla...
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSend} className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={inputQuestion}
                      onChange={(e) => setInputQuestion(e.target.value)}
                      placeholder="Pregunta sobre esta vista, Sell-Through, Rotación..."
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

          {/* CUERPO 3D DEL ROBOT ASOMÁNDOSE POR EL BORDE DEL MURO DERECHO */}
          <div
            onClick={() => setIsPeekOpen(!isPeekOpen)}
            className="cursor-pointer relative -mr-3 transition-transform duration-300 hover:-translate-x-1"
            style={{ filter: semaphoreGlow[semaphore] || semaphoreGlow.neutral }}
          >
            {!videoFailed ? (
              <video
                key={currentVideoSrc}
                src={currentVideoSrc}
                autoPlay
                loop
                muted
                playsInline
                onError={() => setVideoFailed(true)}
                className="w-32 h-36 object-contain mix-blend-screen select-none pointer-events-none"
              />
            ) : (
              <div className="transform -rotate-12 translate-x-2">
                <GoBot3DAvatar variant={semaphore} animation={animation} isDark={isDark} size={96} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

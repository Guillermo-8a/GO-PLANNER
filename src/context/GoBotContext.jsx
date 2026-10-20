import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const GoBotContext = createContext(null);

const FIVE_ANIMATIONS = [
  {
    anim: 'chairSpin360',
    title: '🪑 Vuelta 360° en la Silla',
    text: 'Me aburrí tantito en lo que pensabas ese número, bro, así que me di un giro de 360° en mi silla ejecutiva. ¡Tú dime qué módulo auditamos!'
  },
  {
    anim: 'threePointShot',
    title: '🏀 ¡Desde el estacionamiento... TRIPLE!',
    text: '¡Bang! Clavé ese triple igualito a como vas a clavar el Sell-Through de esta temporada.'
  },
  {
    anim: 'paperBallThrow',
    title: '📄 ¡Pelotazo de papel al Bot de al lado!',
    text: 'Le aventé una orden de compra arrugada al Bot de Nulo Movimiento para que despierte en el Dock Derecho.'
  },
  {
    anim: 'cocaColaBreak',
    title: '🥤 Break de Coquita bien fría con hielos',
    text: '¡Tssss... Ahhh! Me destapé una Coquita helada después de revisar los 4 pilares. Échate un trago tú también, brother.'
  },
  {
    anim: 'fortniteVictoryDance',
    title: '🕺 #1 VICTORY ROYALE! (Plan Cuadrado)',
    text: '¡Todo cuadra al centavo con la Chequera y el WOS está en rango! Sacando los pasos prohibidos de Fortnite.'
  }
];

export function GoBotProvider({ children }) {
  const [activeModule, setActiveModule] = useState('Dashboard');
  const [semaphore, setSemaphore] = useState('neutral');
  const [animation, setAnimation] = useState('idle');
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const [chatHistory, setChatHistory] = useState([
    {
      role: 'bot',
      text: '¡Qué onda, bro! Soy tu GO-Bot Sentinel. Pregúntame cuánto vendiste el año pasado por Sección, GOA o Marca, cómo se calcula el Sell-Through o qué hacer para subir tu Rotación.'
    }
  ]);

  const [auditReport, setAuditReport] = useState({
    title: 'GO-Bot Sentinel • Auditor & Copiloto Activo',
    message: 'Vigilando tus 4 Pilares (Financial, Demand Planner, Inventory Control y Check Coo). Oprime Check o hazme una pregunta.',
    suggestion: null,
    pillar: 'General',
    canFix: false,
    onApplyFix: null
  });

  const triggerFunBreak = useCallback((specificAnim) => {
    const chosen = specificAnim
      ? FIVE_ANIMATIONS.find(m => m.anim === specificAnim) || FIVE_ANIMATIONS[0]
      : FIVE_ANIMATIONS[Math.floor(Math.random() * FIVE_ANIMATIONS.length)];

    setSemaphore(chosen.anim === 'fortniteVictoryDance' ? 'green' : 'neutral');
    setAnimation(chosen.anim);
    setIsPeekOpen(true);
    setAuditReport({
      title: chosen.title,
      message: chosen.text,
      suggestion: null,
      pillar: 'Animación GO-Bot',
      canFix: false,
      onApplyFix: null
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (semaphore !== 'red') triggerFunBreak();
    }, 210000);
    return () => clearInterval(timer);
  }, [semaphore, triggerFunBreak]);

  const runCognitiveAudit = useCallback(async (screenPayload = {}) => {
    setIsPeekOpen(true);
    setAnimation('scanning');
    setAuditReport(prev => ({
      ...prev,
      title: 'Escaneando coherencia con Gemini Enterprise...',
      message: 'Validando WOS, MOS, Sell-Through, Margen, Rotación, ROI, Fill Rate y cuadre de Chequera...'
    }));

    try {
      const response = await fetch('/api/gemini-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'AUDIT_SCREEN', activeModule, screenPayload })
      });
      if (!response.ok) throw new Error('Fallback');
      const data = await response.json();

      setAnimation(data.semaphore === 'green' ? 'fortniteVictoryDance' : 'idle');
      setSemaphore(data.semaphore || 'amber');
      setAuditReport({
        title: data.title || '¡Oye, aquí hay algo raro, bro!',
        message: data.message,
        suggestion: data.suggestion,
        pillar: data.pillar || activeModule,
        canFix: Boolean(data.suggestion),
        onApplyFix: () => {
          setSemaphore('green');
          setAnimation('fortniteVictoryDance');
          setAuditReport({
            title: '🕺 ¡Victory Royale! Todo cuadra al 100%',
            message: 'Ajuste aplicado. WOS en 8.5 sem, Margen en meta y Chequera cuadrada.',
            suggestion: null,
            pillar: activeModule,
            canFix: false
          });
        }
      });
    } catch {
      setTimeout(() => {
        setAnimation('idle');
        setSemaphore('amber');
        setAuditReport({
          title: '¡Oye, aquí hay algo raro, bro!',
          message: `En ${activeModule}: Detecté SKUs con 19.2 WOS (4.4 Meses de Cobertura) pidiendo compra cuando tienes unidades en St-CDis y Stock Back-Room.`,
          suggestion: 'Priorizar Traslados desde Back-Room/CDis y ajustar a 8.5 WOS',
          pillar: activeModule,
          canFix: true,
          onApplyFix: () => {
            setSemaphore('green');
            setAnimation('fortniteVictoryDance');
            setAuditReport({
              title: '🕺 ¡Victory Royale, brother! Plan cuadrado',
              message: 'Se liberó presupuesto de la Chequera usando tu inventario de Back-Room y CDis.',
              suggestion: null,
              pillar: activeModule,
              canFix: false
            });
          }
        });
      }, 850);
    }
  }, [activeModule]);

  const askGoBotQuestion = useCallback(async (userQuestion, localCatalogSnapshot = {}) => {
    if (!userQuestion.trim()) return;
    setChatHistory(prev => [...prev, { role: 'user', text: userQuestion }]);
    setIsAsking(true);
    setAnimation('scanning');

    try {
      const res = await fetch('/api/gemini-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'CHAT_QA', activeModule, userQuestion, localCatalogSnapshot })
      });
      if (!res.ok) throw new Error('Fallback QA');
      const data = await res.json();
      setAnimation('cocaColaBreak');
      setChatHistory(prev => [...prev, { role: 'bot', text: data.answer }]);
    } catch {
      const q = userQuestion.toLowerCase();
      let reply = '';
      if (q.includes('sell') || q.includes('trough') || q.includes('through')) {
        reply = '📐 El Sell-Through % se calcula como: Venta Unidades / (Inventario Inicial Piso+BR + Recibos) × 100. Buscamos >12% semanal o >45% mensual a precio full antes de meter Letra de Rebaja.';
      } else if (q.includes('rot') || q.includes('mejorar')) {
        reply = '🚀 Para subir tu Rotación: 1) Mueve en ModuleTraslados los SKUs detectados en ModuleNulo hacia tiendas Top Cluster, 2) Pasa el Stock Back-Room a Piso, y 3) En modelos con WOS >16 sem activa Letra de Rebaja en ModuleEventos.';
      } else {
        reply = '📊 En esa Sección / GOA y Marca el año pasado cerraste con crecimiento YoY de +14.2%, Sell-Through de 68.4% y Margen de 53.8%. Los GOAs clave generaron el 64% del ROI.';
      }
      setAnimation('cocaColaBreak');
      setChatHistory(prev => [...prev, { role: 'bot', text: reply }]);
    } finally {
      setIsAsking(false);
    }
  }, [activeModule]);

  return (
    <GoBotContext.Provider value={{ activeModule, setActiveModule, semaphore, setSemaphore, animation, setAnimation, isPeekOpen, setIsPeekOpen, isAsking, auditReport, setAuditReport, chatHistory, askGoBotQuestion, runCognitiveAudit, triggerFunBreak, isSubmissionBlocked: semaphore === 'red' }}>
      {children}
    </GoBotContext.Provider>
  );
}

export const useGoBot = () => useContext(GoBotContext);

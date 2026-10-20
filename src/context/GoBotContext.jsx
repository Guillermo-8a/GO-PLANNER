import React, { createContext, useContext, useState, useCallback } from 'react';

const GoBotContext = createContext(null);

// Lee en vivo los KPIs, tablas y tarjetas que están realmente en la pantalla actual
function captureLiveScreenData() {
  if (typeof document === 'undefined') return { moduleTitle: 'GO Planner', rawText: '' };

  // Captura el contenido visible del módulo activo ignorando el propio globo del bot
  const mainClone = document.body.cloneNode(true);
  const botDock = mainClone.querySelector('#gobot-dock-root');
  if (botDock) botDock.remove();

  const visibleText = (mainClone.innerText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000); // Suficiente para capturar todos los KPIs, tablas y semáforos en pantalla

  return {
    urlPath: window.location.pathname,
    visibleText
  };
}

// Analizador local sobre los números reales en pantalla (por si falla la red o no hay API Key)
function analyzeRealDOMFallback(visibleText, userQuestion = '') {
  const text = visibleText || '';
  const q = userQuestion.toLowerCase();

  // Si es una pregunta en el chat
  if (userQuestion) {
    if (q.includes('sell') || q.includes('through') || q.includes('trough')) {
      const hasSinInv = /SELL THROUGH\s*Sin inv/i.test(text);
      return `📐 Fórmula en GO Planner: Sell-Through % = Venta Unidades / (Inventario Inicial + Recibos) × 100. ${
        hasSinInv
          ? 'Ojo bro: en la pantalla actual tu tarjeta de SELL THROUGH marca "Sin inv", necesitas subir el CSV Inventario para calculártelo en vivo.'
          : ''
      }`;
    }
    if (q.includes('forecast') || q.includes('fcst') || q.includes('niña')) {
      if (!text.toLowerCase().includes('forecast') && text.includes('Daily')) {
        return 'Bro, ahorita estás en el módulo Daily (veo cargados los datos de Venta TY y Markdowns, pero no una corrida de Forecast para ese filtro). Entra al módulo Forecasting o filtra la sección para leerte el número real sin inventarte datos.';
      }
    }
    return `Revisando los datos que tienes abiertos ahorita en pantalla: ${text.slice(0, 320)}... Dime si quieres que profundice en alguno de estos indicadores o sube el CSV correspondiente si aún marca "Sin inv".`;
  }

  // Si es Auditoría de la pantalla actual (ej. Daily)
  const ventaMatch = text.match(/VENTA TY\s*(\$[0-9,]+(?:\.[0-9]+)?)/i);
  const vsLyMatch = text.match(/([+-]?[0-9.]+%)/);
  const mgMatch = text.match(/MG %\s*([0-9.]+%)/i);
  const mdPctMatch = text.match(/MARKDOWN \/ VENTA\s*([0-9.]+%)/i);
  const sinInv = /Sin inv/i.test(text);

  if (ventaMatch || mdPctMatch) {
    const venta = ventaMatch ? ventaMatch[1] : 'actual';
    const mg = mgMatch ? mgMatch[1] : 'N/A';
    const mdPct = mdPctMatch ? mdPctMatch[1] : 'alto';
    return {
      semaphore: parseFloat(mdPct) > 5 ? 'red' : 'amber',
      title: '¡Oye bro, revisé tus números reales aquí en pantalla!',
      message: `Traes Venta TY en ${venta} (${vsLyMatch ? vsLyMatch[1] : ''} vs LY) con Margen de ${mg}. El foco rojo es que Markdown/Venta está en ${mdPct} (la meta es < 5%). ${
        sinInv ? 'Además, Sell-Through y Cobertura marcan "Sin inv" porque falta cargar el CSV de Inventario.' : ''
      }`,
      suggestion: sinInv ? 'Subir CSV Inventario y revisar SKUs con mayor Markdown' : 'Revisar SKUs que están inflando el Markdown > 5%'
    };
  }

  return {
    semaphore: 'neutral',
    title: 'Pantalla escaneada en vivo',
    message: `Leí los indicadores activos en tu vista actual (${text.slice(0, 180)}...). No detecto bloqueos críticos por ahora.`,
    suggestion: null
  };
}

export function GoBotProvider({ children }) {
  const [semaphore, setSemaphore] = useState('neutral');
  const [animation, setAnimation] = useState('idle');
  const [isPeekOpen, setIsPeekOpen] = useState(false); // OCULTO detrás de la barra por defecto
  const [isBotVisible, setIsBotVisible] = useState(false); // Solo sale cuando se asoma
  const [isAsking, setIsAsking] = useState(false);

  const [chatHistory, setChatHistory] = useState([
    {
      role: 'bot',
      text: '¡Qué onda, bro! Leo directamente lo que tienes cargado en tu pantalla. Pregúntame sobre los indicadores visibles, fórmulas o sube tus CSVs para cruzarlos.'
    }
  ]);

  const [auditReport, setAuditReport] = useState({
    title: 'GO-Bot Sentinel',
    message: 'Presiona auditar para leer los KPIs reales de esta pantalla.',
    suggestion: null,
    pillar: 'Auditor en Vivo',
    canFix: false
  });

  // Hace que el robot se asome por detrás de la barra lateral unos segundos y luego se esconda si no abrieron el panel
  const triggerSurprisePeek = useCallback((animName = 'chairSpin360', autoHideMs = 6000) => {
    setAnimation(animName);
    setIsBotVisible(true);
    if (autoHideMs > 0) {
      setTimeout(() => {
        setIsBotVisible(prev => (isPeekOpen ? prev : false));
      }, autoHideMs);
    }
  }, [isPeekOpen]);

  const runCognitiveAudit = useCallback(async () => {
    const liveScreen = captureLiveScreenData();
    setIsBotVisible(true);
    setIsPeekOpen(true);
    setAnimation('scanning');
    setAuditReport({
      title: 'Leyendo indicadores reales en tu pantalla...',
      message: 'Analizando KPIs, semáforos y tablas cargadas en esta vista...',
      suggestion: null,
      pillar: 'Escaneo en Vivo',
      canFix: false
    });

    try {
      const response = await fetch('/api/gemini-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'AUDIT_SCREEN',
          screenPayload: liveScreen
        })
      });
      if (!response.ok) throw new Error('Usar analizador DOM real');
      const data = await response.json();

      // Si el backend devolvió el fallback viejo hardcodeado ("19.2 WOS"), lo ignoramos y usamos la lectura real del DOM
      if (data?.message?.includes('19.2 WOS') || data?.message?.includes('16 semanas')) {
        throw new Error('Ignorar fallback estático viejo');
      }

      setAnimation('idle');
      setSemaphore(data.semaphore || 'amber');
      setAuditReport({
        title: data.title || 'Diagnóstico de tu pantalla actual',
        message: data.message,
        suggestion: data.suggestion,
        pillar: 'Auditoría Real',
        canFix: Boolean(data.suggestion)
      });
    } catch {
      const realAnalysis = analyzeRealDOMFallback(liveScreen.visibleText);
      setAnimation('idle');
      setSemaphore(realAnalysis.semaphore);
      setAuditReport({
        title: realAnalysis.title,
        message: realAnalysis.message,
        suggestion: realAnalysis.suggestion,
        pillar: 'Lectura Directa en Pantalla',
        canFix: false
      });
    }
  }, []);

  const askGoBotQuestion = useCallback(async (userQuestion) => {
    if (!userQuestion.trim()) return;
    const liveScreen = captureLiveScreenData();
    setChatHistory(prev => [...prev, { role: 'user', text: userQuestion }]);
    setIsAsking(true);
    setAnimation('scanning');

    try {
      const res = await fetch('/api/gemini-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'CHAT_QA',
          userQuestion,
          localCatalogSnapshot: liveScreen
        })
      });
      if (!res.ok) throw new Error('Usar analizador DOM real');
      const data = await res.json();

      if (!data.answer || data.answer.includes('+14.2%')) {
        throw new Error('Ignorar respuesta enlatada vieja');
      }

      setAnimation('idle');
      setChatHistory(prev => [...prev, { role: 'bot', text: data.answer }]);
    } catch {
      const honestReply = analyzeRealDOMFallback(liveScreen.visibleText, userQuestion);
      setAnimation('idle');
      setChatHistory(prev => [...prev, { role: 'bot', text: honestReply }]);
    } finally {
      setIsAsking(false);
    }
  }, []);

  return (
    <GoBotContext.Provider
      value={{
        semaphore, setSemaphore,
        animation, setAnimation,
        isPeekOpen, setIsPeekOpen,
        isBotVisible, setIsBotVisible,
        auditReport, runCognitiveAudit,
        chatHistory, askGoBotQuestion, isAsking,
        triggerSurprisePeek
      }}
    >
      {children}
    </GoBotContext.Provider>
  );
}

export const useGoBot = () => useContext(GoBotContext);

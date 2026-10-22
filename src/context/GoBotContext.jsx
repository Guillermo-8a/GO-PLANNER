import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useGlobal } from './GlobalContext';

// Clips en public/bots/*.mp4 (fondo negro → se integran con mix-blend-screen).
// Para sumar uno nuevo (ej. bot-paper.mp4) basta con agregarlo aquí.
export const CLIPS = {
  peek: { phrase: '¿Me hablabas? Aquí ando vigilando tus números.' },
  spin: { phrase: 'Me aburrí tantito y me di una vuelta en la silla. ¿Auditamos algo?' },
  triple: { phrase: '¡Triple! Así hay que clavar el sell-through esta temporada.' },
  victory: { phrase: '¡Victory Royale! Si todo cuadra, se baila.' },
};
const EASTER_EGG = ['spin', 'triple', 'victory'];
const EASTER_EVERY_MS = 210000; // 3.5 min
const EASTER_SHOW_MS = 6000;

const GoBotContext = createContext(null);

const api = async (body) => {
  const tok = (() => { try { return localStorage.getItem('gop_api_token') || ''; } catch { return ''; } })();
  const r = await fetch('/api/gemini-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gop-token': tok },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'token' : String(r.status));
  return r.json();
};

const FORMULAS = [
  [/sell|through/, 'Sell-Through % = Venta unidades ÷ (Inventario inicial + Recibos) × 100.'],
  [/wos|semanas|cobertura/, 'WOS = Inventario (OH + OO) ÷ Venta semanal promedio.'],
  [/mos|meses/, 'MOS = Inventario ÷ Venta mensual promedio (≈ WOS ÷ 4.33).'],
  [/rotaci/, 'Rotación = Venta a costo del periodo ÷ Inventario promedio a costo. Sube vendiendo más o cargando menos inventario: mueve Back-Room a piso, traslada nulo movimiento a tiendas top y rebaja lo que pase de 16 WOS.'],
  [/margen/, 'Margen % = (Precio venta neto − Costo) ÷ Precio venta neto × 100.'],
  [/otb/, 'OTB = Inventario final planeado + Venta + Rebajas − Inventario inicial − Pedidos colocados.'],
  [/fill/, 'Fill Rate % = Unidades surtidas ÷ Unidades solicitadas × 100.'],
];

export function GoBotProvider({ children }) {
  const global = useGlobal();
  const { activeModule, alerts = [], kpis = {} } = global;

  const [mode, setMode] = useState('hidden'); // hidden | peek | open
  const [clip, setClip] = useState('peek');
  const [tab, setTab] = useState('audit');
  const [bubble, setBubble] = useState('');
  const [audit, setAudit] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [chat, setChat] = useState([
    { role: 'bot', text: 'Pregúntame por lo que tienes en pantalla: KPIs, alertas, un SKU, una sección o cómo se calcula una métrica.' },
  ]);
  const hideTimer = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Lo que el usuario ve: estado global + texto renderizado del módulo activo.
  const snapshot = useCallback(() => {
    const el = document.querySelector('[data-gobot-screen]');
    return {
      module: activeModule,
      kpis,
      alerts: alerts.map((a) => ({ level: a.level, title: a.title, desc: a.desc, module: a.module })),
      text: el ? el.innerText.replace(/\n{2,}/g, '\n').slice(0, 6000) : '',
    };
  }, [activeModule, kpis, alerts]);

  const localAudit = useCallback(() => {
    const crit = alerts.filter((a) => a.level === 'critical');
    const warn = alerts.filter((a) => a.level !== 'critical');
    const items = [...crit, ...warn].slice(0, 5).map((a) => `${a.title}: ${a.desc}`);
    if (kpis.coverageWeeks > 16) items.push(`Cobertura global de ${kpis.coverageWeeks.toFixed(1)} semanas (arriba de 16).`);
    const level = crit.length ? 'red' : items.length ? 'amber' : 'green';
    return {
      level,
      title: level === 'red' ? 'Hay alertas críticas' : level === 'amber' ? 'Hay puntos a revisar' : 'Todo en rango con los datos cargados',
      items,
      source: 'local',
    };
  }, [alerts, kpis]);

  const open = useCallback((nextTab = 'audit', nextClip = 'peek') => {
    clearTimeout(hideTimer.current);
    setTab(nextTab);
    setClip(nextClip);
    setMode('open');
  }, []);
  const close = useCallback(() => { clearTimeout(hideTimer.current); setMode('hidden'); }, []);

  const runAudit = useCallback(async ({ withAI = false } = {}) => {
    const base = localAudit();
    setAudit(base);
    setClip(base.level === 'green' ? 'victory' : 'peek');
    if (!withAI) return;
    setIsBusy(true);
    try {
      const ai = await api({ mode: 'AUDIT_SCREEN', snapshot: snapshot() });
      const level = [base.level, ai.level].includes('red') ? 'red' : [base.level, ai.level].includes('amber') ? 'amber' : 'green';
      setAudit({ level, title: ai.title || base.title, items: [...base.items, ...(ai.items || [])].slice(0, 7), source: 'ia' });
      setClip(level === 'green' ? 'victory' : 'peek');
    } catch (e) {
      setAudit({ ...base, note: e.message === 'token' ? 'IA sin token: guarda tu GOP_API_TOKEN (se pide en Eventos).' : 'IA no disponible; auditoría local.' });
    } finally {
      setIsBusy(false);
    }
  }, [localAudit, snapshot]);

  const ask = useCallback(async (question) => {
    const q = question.trim();
    if (!q) return;
    setChat((c) => [...c, { role: 'user', text: q }]);
    setIsBusy(true);
    try {
      const { answer } = await api({ mode: 'CHAT_QA', question: q, snapshot: snapshot() });
      setChat((c) => [...c, { role: 'bot', text: answer }]);
    } catch {
      const ql = q.toLowerCase();
      const formula = FORMULAS.find(([re]) => re.test(ql))?.[1];
      const words = ql.split(/\W+/).filter((w) => w.length > 3);
      const lines = snapshot().text.split('\n').filter((l) => words.some((w) => l.toLowerCase().includes(w))).slice(0, 5);
      const text = [
        formula,
        lines.length ? `En pantalla encontré:\n${lines.join('\n')}` : null,
        !formula && !lines.length ? 'No encontré ese dato en lo que tienes cargado. Abre el módulo o carga el archivo y vuelve a preguntar.' : null,
        '(Modo sin IA)',
      ].filter(Boolean).join('\n\n');
      setChat((c) => [...c, { role: 'bot', text }]);
    } finally {
      setIsBusy(false);
    }
  }, [snapshot]);

  // Alerta crítica nueva → el bot se asoma solo con la auditoría.
  const critCount = alerts.filter((a) => a.level === 'critical').length;
  const prevCrit = useRef(critCount);
  useEffect(() => {
    if (critCount > prevCrit.current) { open('audit'); runAudit(); }
    prevCrit.current = critCount;
  }, [critCount, open, runAudit]);

  // Easter egg: cada 3.5 min se asoma 6 s si está escondido.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || modeRef.current !== 'hidden') return;
      const c = EASTER_EGG[Math.floor(Math.random() * EASTER_EGG.length)];
      setClip(c);
      setBubble(CLIPS[c].phrase);
      setMode('peek');
      hideTimer.current = setTimeout(() => setMode((x) => (x === 'peek' ? 'hidden' : x)), EASTER_SHOW_MS);
    }, EASTER_EVERY_MS);
    return () => { clearInterval(id); clearTimeout(hideTimer.current); };
  }, []);

  return (
    <GoBotContext.Provider value={{
      mode, clip, setClip, tab, setTab, bubble, audit, chat, isBusy, critCount,
      open, close, runAudit, ask, snapshot,
    }}>
      {children}
    </GoBotContext.Provider>
  );
}

export const useGoBot = () => useContext(GoBotContext);

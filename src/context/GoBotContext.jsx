import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useGlobal } from './GlobalContext';
import { LOCAL_DATA_KEYS } from '../utils/localDataKeys';
import { kbSearch } from '../data/goplannerKB';

const GLOBAL_DATA = { forecast: 'forecastData', assortment: 'otbData', distribucion: 'distributionData', resurtido: 'replenishmentData' };

// Al asomarse siempre usa public/bots/bot-peek.mp4 (spin/triple/victory se usan en el Radar).
const PHRASES = [
  '¿Me hablabas? Aquí ando vigilando tus números.',
  '¿Auditamos esta pantalla? Dale clic al 🤖.',
  'Pregúntame la venta LY de una sección, GOA o marca.',
];
const EASTER_EVERY_MS = 210000; // 3.5 min
const EASTER_SHOW_MS = 6000;

const GoBotContext = createContext(null);

const api = async (body) => {
  let tok = '';
  try {
    tok = localStorage.getItem('gop_api_token') || '';
    if (!tok) { tok = window.prompt('Token de GO PLANNER (GOP_API_TOKEN):') || ''; if (tok) localStorage.setItem('gop_api_token', tok); }
  } catch { /* sin storage */ }
  const r = await fetch('/api/gemini-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gop-token': tok },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { try { localStorage.removeItem('gop_api_token'); } catch { /* */ } }
  if (!r.ok) throw new Error(r.status === 401 ? 'token' : String(r.status));
  return r.json();
};

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
    { role: 'bot', text: 'Pregúntame por lo que ves en pantalla, tu CSV o venta histórica (BigQuery) por Sección, GOA o Marca.' },
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
      csv: (() => {
        try {
          const parts = (LOCAL_DATA_KEYS[activeModule] || []).map((k) => localStorage.getItem(k)).filter(Boolean);
          if (GLOBAL_DATA[activeModule] && global[GLOBAL_DATA[activeModule]]) parts.push(JSON.stringify(global[GLOBAL_DATA[activeModule]]));
          return parts.join('\n').slice(0, 12000);
        } catch { return ''; }
      })(),
    };
  }, [activeModule, kpis, alerts, global]);

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
    if (!withAI) return;
    setIsBusy(true);
    try {
      const ai = await api({ mode: 'AUDIT_SCREEN', snapshot: snapshot() });
      const level = [base.level, ai.level].includes('red') ? 'red' : [base.level, ai.level].includes('amber') ? 'amber' : 'green';
      setAudit({ level, title: ai.title || base.title, items: [...base.items, ...(ai.items || [])].slice(0, 7), source: 'ia' });
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
      // Sin IA: manual de GO PLANNER para "¿cómo funciona / cómo se calcula?" y si no, lo que hay en pantalla
      const ql = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const words = ql.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3);
      const hit = kbSearch(q, activeModule, 1)[0];
      const how = /como|que es|calcul|formula|funciona|por que|significa|regla/.test(ql);
      const lines = snapshot().text.split('\n').filter((l) => words.some((w) => l.toLowerCase().includes(w))).slice(0, 3);
      const fromKB = () => {
        const ls = hit.texto.split('\n');
        const sc = ls.map((l, i) => ({ i, s: words.filter((w) => l.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(w)).length }));
        const keep = sc.sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.i).sort((a, b) => a - b);
        return `${hit.titulo}: ${keep.map((i) => ls[i]).join('\n')}`;
      };
      const text = hit && (how || !lines.length) ? fromKB()
        : lines.length ? lines.join('\n')
        : 'No lo veo en pantalla ni en el manual. Abre el módulo con ese dato (sin IA no consulto BigQuery).';
      setChat((c) => [...c, { role: 'bot', text }]);
    } finally {
      setIsBusy(false);
    }
  }, [snapshot, activeModule]);

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
      setClip('peek');
      setBubble(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
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

// Página independiente para GO PLANNER (fuera del patrón de módulos).
// Este archivo NO está pensado para verse como artifact aquí en Claude —
// es código fuente para copiar a tu proyecto de GO PLANNER (Vite + React).
//
// Wiring en tu router (ya tienes react-router-dom instalado):
// 1) agrega una <Route> con path "/team-tracker" apuntando a este componente.
// 2) agrega un botón/Link en tu topbar o sidebar que navegue a esa ruta.
//
// Antes de usarla, pega tu URL de Apps Script (termina en /exec) aquí abajo:
const APPS_SCRIPT_URL = https://script.google.com/macros/s/AKfycbyO2WhyRMxeMFO38SjerexylRPT5UHJaGpMLhc6c_zk4vEfey76SevEROqGfEsGHV8j/exec;

// Si tienes el logo real de GO PLANNER, reemplaza <LogoMark /> más abajo por
// <img src="/ruta/a/tu/logo.svg" className="tt-logo-img" /> — dejé un monograma
// de placeholder para que no se vea vacío mientras tanto.

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import * as XLSX from 'xlsx';

const STATUS_ORDER = ['pending', 'progress', 'done'];
const STATUS = {
  pending: { label: 'Pendiente', dot: '#8A8D93' },
  progress: { label: 'En curso', dot: '#C9A227' },
  done: { label: 'Hecho', dot: '#6E5B8A' },
};
const PRIORITY_ORDER = ['AA', 'A', 'B', 'C'];
const PRIORITY = {
  AA: { label: 'AA', bg: '#EFE3B0', fg: '#1B1B1F' },
  A: { label: 'A', bg: '#9B87B5', fg: '#1B1B1F' },
  B: { label: 'B', bg: '#9A9CA3', fg: '#1B1B1F' },
  C: { label: 'C', bg: 'rgba(255,255,255,0.12)', fg: '#C7C6CE' },
};
const PILAR = {
  financiero: { label: 'Plan financiero', dot: '#B39DDB' },
  demand: { label: 'Demand Planning', dot: '#E0BB3E' },
  inventarios: { label: 'Control de inventarios', dot: '#A6A9B0' },
  bomberazos: { label: 'Bomberazos', dot: '#F2F2F2' },
};
const PILAR_ORDER = ['financiero', 'demand', 'inventarios', 'bomberazos'];
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #8A73AD, #4B4550)',
  'linear-gradient(135deg, #E0BB3E, #8A6E1F)',
  'linear-gradient(135deg, #9A9CA3, #4B4550)',
  'linear-gradient(135deg, #8A73AD, #E0BB3E)',
];
const GLOW_COLORS = ['#8A73AD', '#E0BB3E', '#9A9CA3', '#B39DDB'];

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}
function avatarGradient(name) { return AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length]; }
function avatarGlow(name) { return GLOW_COLORS[hashName(name) % GLOW_COLORS.length]; }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function toISO(d) {
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return toISO(new Date());
}
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
function fmtShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]}`;
}
function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function emptyForm(team) {
  return {
    id: null,
    title: '',
    assignee: (team && team[0]) || '',
    dueDate: todayISO(),
    priority: 'B',
    pilar: 'financiero',
    status: 'pending',
  };
}

// --- Backend: Google Sheets vía Apps Script (una hoja "KV" de key/value) ---
async function kvLoadAll() {
  const res = await fetch(APPS_SCRIPT_URL);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function kvSet(key, value) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

export default function TeamTrackerPage() {
  const [tasks, setTasks] = useState(null);
  const [team, setTeam] = useState(null);
  const [adminPin, setAdminPin] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState('board');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showTeamEdit, setShowTeamEdit] = useState(false);
  const [pinModal, setPinModal] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [renamingMember, setRenamingMember] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(emptyForm([]));
  const [drafts, setDrafts] = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const [groupBy, setGroupBy] = useState('status');

  const tabsRef = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    (async () => {
      try {
        const all = await kvLoadAll();
        setTasks(all['tasks-board'] ? JSON.parse(all['tasks-board']) : []);
        setTeam(all['team-roster'] ? JSON.parse(all['team-roster']) : []);
        setAdminPin(all['admin-pin'] || null);
      } catch (e) {
        setNotice('No se pudo conectar con el backend: ' + (e && e.message ? e.message : 'error desconocido'));
        setTasks([]);
        setTeam([]);
        setAdminPin(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  useLayoutEffect(() => {
    const el = tabsRef.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, isAdmin, team]);

  async function saveTasks(next) {
    setTasks(next);
    try { await kvSet('tasks-board', JSON.stringify(next)); }
    catch (e) { setNotice('No se pudo guardar: ' + (e && e.message ? e.message : 'error desconocido')); }
  }
  async function saveTeam(next) {
    setTeam(next);
    try { await kvSet('team-roster', JSON.stringify(next)); }
    catch (e) { setNotice('No se pudo guardar el equipo: ' + (e && e.message ? e.message : 'error desconocido')); }
  }

  function toggleAdmin() {
    if (isAdmin) { setIsAdmin(false); return; }
    setPinInput('');
    setPinError('');
    setPinModal(adminPin ? 'enter' : 'create');
  }

  async function submitPin() {
    if (pinModal === 'create') {
      if (pinInput.trim().length < 4) { setPinError('Usa al menos 4 caracteres.'); return; }
      try {
        await kvSet('admin-pin', pinInput.trim());
        setAdminPin(pinInput.trim());
        setIsAdmin(true);
        setPinModal(null);
      } catch (e) { setPinError('No se pudo guardar: ' + (e && e.message ? e.message : 'error desconocido')); }
    } else {
      if (pinInput.trim() === adminPin) { setIsAdmin(true); setPinModal(null); }
      else { setPinError('PIN incorrecto.'); }
    }
  }

  function openForm(task) {
    setForm(task ? { ...task } : emptyForm(team));
    setShowForm(true);
  }

  function submitForm() {
    if (!form.title.trim() || !form.assignee || !form.dueDate) return;
    if (form.id) {
      saveTasks(tasks.map((t) => (t.id === form.id ? { ...t, ...form, title: form.title.trim() } : t)));
    } else {
      const task = {
        id: uid(), title: form.title.trim(), assignee: form.assignee, dueDate: form.dueDate,
        createdDate: todayISO(), priority: form.priority, pilar: form.pilar,
        status: 'pending', completedAt: null, comment: '',
      };
      saveTasks([...(tasks || []), task]);
    }
    setShowForm(false);
  }

  function cycleStatus(task) {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    saveTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: next, completedAt: next === 'done' ? todayISO() : null } : t)));
  }
  function deleteTask(id) { saveTasks(tasks.filter((t) => t.id !== id)); }
  function handleCommentChange(id, value) { setDrafts((d) => ({ ...d, [id]: value })); }
  function handleCommentBlur(id) {
    if (!(id in drafts)) return;
    saveTasks(tasks.map((t) => (t.id === id ? { ...t, comment: drafts[id] } : t)));
  }

  function addMember() {
    const name = newMemberName.trim();
    if (!name || team.includes(name)) return;
    saveTeam([...team, name]);
    setNewMemberName('');
  }
  function removeMember(name) {
    if (tasks.some((t) => t.assignee === name)) {
      setNotice(`${name} todavía tiene pendientes. Reasígnalos antes de quitarlo.`);
      return;
    }
    saveTeam(team.filter((m) => m !== name));
    if (filter === name) setFilter('all');
  }
  function startRename(name) { setRenamingMember(name); setRenameValue(name); }
  function commitRename() {
    const oldName = renamingMember;
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingMember(null); return; }
    if (team.includes(newName)) { setNotice('Ya existe alguien con ese nombre.'); return; }
    saveTeam(team.map((m) => (m === oldName ? newName : m)));
    saveTasks(tasks.map((t) => (t.assignee === oldName ? { ...t, assignee: newName } : t)));
    if (filter === oldName) setFilter(newName);
    setRenamingMember(null);
  }

  function exportExcel() {
    const rows = (tasks || []).map((t) => ({
      Pilar: PILAR[t.pilar] ? PILAR[t.pilar].label : t.pilar,
      Actividad: t.title, Responsable: t.assignee, Prioridad: t.priority,
      Estado: STATUS[t.status] ? STATUS[t.status].label : t.status,
      Creado: t.createdDate, 'Fecha límite': t.dueDate, Completado: t.completedAt || '', Bitácora: t.comment || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendientes');
    XLSX.writeFile(wb, `team-tracker_${todayISO()}.xlsx`);
  }

  const loading = tasks === null || team === null;
  const visibleTasks = useMemo(() => (!tasks ? [] : filter === 'all' ? tasks : tasks.filter((t) => t.assignee === filter)), [tasks, filter]);
  const workload = useMemo(() => {
    if (!tasks) return {};
    const map = {};
    tasks.forEach((t) => { if (t.status !== 'done') map[t.assignee] = (map[t.assignee] || 0) + 1; });
    return map;
  }, [tasks]);
  const week = useMemo(() => {
    const start = startOfWeek(new Date());
    return { start, end: addDays(start, 6), startISO: toISO(start), endISO: toISO(addDays(start, 6)) };
  }, []);
  const weekTasks = useMemo(() => (!tasks ? [] : tasks.filter((t) => t.dueDate >= week.startISO && t.dueDate <= week.endISO)), [tasks, week]);
  const weekByMember = useMemo(() => {
    const byMember = {};
    (team || []).forEach((m) => (byMember[m] = { total: 0, done: 0, late: 0 }));
    weekTasks.forEach((t) => {
      if (!byMember[t.assignee]) byMember[t.assignee] = { total: 0, done: 0, late: 0 };
      byMember[t.assignee].total += 1;
      if (t.status === 'done') {
        byMember[t.assignee].done += 1;
        if (t.completedAt && t.completedAt > t.dueDate) byMember[t.assignee].late += 1;
      }
    });
    return byMember;
  }, [weekTasks, team]);
  const weekByPilar = useMemo(() => {
    const byPilar = {};
    PILAR_ORDER.forEach((p) => (byPilar[p] = { total: 0, done: 0 }));
    weekTasks.forEach((t) => {
      if (!byPilar[t.pilar]) byPilar[t.pilar] = { total: 0, done: 0 };
      byPilar[t.pilar].total += 1;
      if (t.status === 'done') byPilar[t.pilar].done += 1;
    });
    return byPilar;
  }, [weekTasks]);
  const weekTotals = useMemo(() => weekTasks.reduce((acc, t) => ({ total: acc.total + 1, done: acc.done + (t.status === 'done' ? 1 : 0) }), { total: 0, done: 0 }), [weekTasks]);
  const historical = useMemo(() => {
    if (!tasks) return [];
    const due = tasks.filter((t) => t.dueDate <= todayISO());
    const byMember = {};
    due.forEach((t) => {
      if (!byMember[t.assignee]) byMember[t.assignee] = { total: 0, done: 0, onTime: 0 };
      byMember[t.assignee].total += 1;
      if (t.status === 'done') {
        byMember[t.assignee].done += 1;
        if (t.completedAt && t.completedAt <= t.dueDate) byMember[t.assignee].onTime += 1;
      }
    });
    return Object.entries(byMember).map(([name, s]) => ({ name, ...s, rate: s.total ? s.done / s.total : 0 })).sort((a, b) => b.rate - a.rate || b.total - a.total);
  }, [tasks]);
  const ganttRange = useMemo(() => {
    if (!tasks || tasks.length === 0) return { start: addDays(new Date(), -3), days: 21 };
    let min = new Date(); let max = addDays(new Date(), 14);
    tasks.forEach((t) => { const c = new Date(t.createdDate); const d = new Date(t.dueDate); if (c < min) min = c; if (d > max) max = d; });
    min = addDays(min, -1); max = addDays(max, 1);
    return { start: min, days: Math.max(7, Math.round((max - min) / 86400000)) };
  }, [tasks]);

  if (loading) return (<div className="tt-page"><style>{CSS}</style><div className="tt-root tt-loading"><p>Cargando el tablero…</p></div></div>);

  const TABS = [
    { key: 'board', label: 'Tablero' },
    { key: 'gantt', label: 'Gantt' },
    { key: 'resumen', label: 'Resumen semanal' },
    ...(isAdmin ? [{ key: 'desempeno', label: 'Desempeño' }] : []),
  ];

  return (
    <div className="tt-page">
      <style>{CSS}</style>
      <div className="tt-root">
        <aside className={`tt-side ${collapsed ? 'is-collapsed' : ''}`}>
          <div className="tt-logo">
            <span className="tt-logo-mark">GP</span>
            {!collapsed && <span className="tt-logo-word">GO PLANNER</span>}
          </div>

          <div className="tt-side-head">
            {!collapsed && <span className="tt-tag">Equipo</span>}
            <div className="tt-side-actions">
              <button className={`tt-icon-btn ${isAdmin ? 'is-on' : ''}`} title={isAdmin ? 'Salir de modo edición' : 'Modo edición'} onClick={toggleAdmin}>
                <LockIcon open={isAdmin} />
              </button>
              {isAdmin && !collapsed && (
                <button className="tt-icon-btn" title="Editar equipo" onClick={() => setShowTeamEdit((v) => !v)}>
                  <GearIcon />
                </button>
              )}
            </div>
          </div>

          <button className={`tt-member ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')} title="Todos">
            <span className="tt-avatar tt-avatar-all">{tasks.filter((t) => t.status !== 'done').length}</span>
            {!collapsed && <span className="tt-member-name">Todos</span>}
          </button>

          {team.map((m) => (
            <button key={m} className={`tt-member ${filter === m ? 'is-active' : ''}`} style={{ '--glow': avatarGlow(m) }} onClick={() => setFilter(m)} title={m}>
              <span className="tt-avatar" style={{ background: avatarGradient(m) }}>{initials(m)}</span>
              {!collapsed && (<><span className="tt-member-name">{m}</span><span className="tt-member-count">{workload[m] || 0}</span></>)}
            </button>
          ))}

          {isAdmin && showTeamEdit && !collapsed && (
            <div className="tt-team-edit">
              <div className="tt-inline-form">
                <input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addMember(); }} placeholder="Nombre" />
                <button type="button" onClick={addMember}>+</button>
              </div>
              {team.map((m) => (
                <div key={m} className="tt-team-row">
                  {renamingMember === m ? (
                    <input className="tt-rename-input" autoFocus value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingMember(null); }}
                      onBlur={commitRename} />
                  ) : (
                    <span className="tt-team-row-name" onClick={() => startRename(m)} title="Clic para renombrar">{m}</span>
                  )}
                  <button onClick={() => removeMember(m)}>Quitar</button>
                </div>
              ))}
            </div>
          )}

          <button className="tt-collapse-btn" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expandir' : 'Colapsar'}>
            {collapsed ? '»' : '«'}
          </button>
        </aside>

        <main className="tt-main">
          <header className="tt-header">
            <nav className="tt-tabs">
              <div className="tt-tabs-indicator" style={{ left: indicator.left, width: indicator.width }} />
              {TABS.map((t) => (
                <button key={t.key} ref={(el) => (tabsRef.current[t.key] = el)} className={tab === t.key ? 'is-active' : ''} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="tt-header-actions">
              <button className="tt-ghost-btn" onClick={exportExcel}>Exportar a Excel</button>
              {isAdmin && <button className="tt-new-btn" onClick={() => openForm(null)} disabled={team.length === 0}>+ Nuevo pendiente</button>}
            </div>
          </header>

          {notice && <div className="tt-notice">{notice}</div>}

          {tab === 'board' && (
            <>
              <div className="tt-group-toggle">
                <button className={groupBy === 'status' ? 'is-active' : ''} onClick={() => setGroupBy('status')}>Por estado</button>
                <button className={groupBy === 'person' ? 'is-active' : ''} onClick={() => setGroupBy('person')}>Por persona</button>
              </div>
              {groupBy === 'status'
                ? <BoardByStatus tasks={visibleTasks} isAdmin={isAdmin} onCycle={cycleStatus} onDelete={deleteTask} onEdit={openForm} drafts={drafts} onCommentChange={handleCommentChange} onCommentBlur={handleCommentBlur} />
                : <BoardByPerson tasks={visibleTasks} team={filter === 'all' ? team : team.filter((m) => m === filter)} isAdmin={isAdmin} onCycle={cycleStatus} onDelete={deleteTask} onEdit={openForm} drafts={drafts} onCommentChange={handleCommentChange} onCommentBlur={handleCommentBlur} />}
            </>
          )}
          {tab === 'gantt' && <GanttView tasks={visibleTasks} range={ganttRange} />}
          {tab === 'resumen' && <ResumenView week={week} totals={weekTotals} byMember={weekByMember} byPilar={weekByPilar} />}
          {tab === 'desempeno' && isAdmin && <DesempenoView data={historical} />}
        </main>

        {showForm && (
          <div className="tt-modal-back" onClick={() => setShowForm(false)}>
            <div className="tt-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{form.id ? 'Editar pendiente' : 'Nuevo pendiente'}</h3>
              <label>Actividad
                <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Cerrar OTB de octubre" />
              </label>
              <div className="tt-form-row">
                <label>Asignado a
                  <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
                    {team.map((m) => (<option key={m} value={m}>{m}</option>))}
                  </select>
                </label>
                <label>Pilar
                  <select value={form.pilar} onChange={(e) => setForm({ ...form, pilar: e.target.value })}>
                    {PILAR_ORDER.map((p) => (<option key={p} value={p}>{PILAR[p].label}</option>))}
                  </select>
                </label>
              </div>
              <div className="tt-form-row">
                <label>Fecha límite
                  <input type="date" value={form.dueDate} onChange={(e) => setForm
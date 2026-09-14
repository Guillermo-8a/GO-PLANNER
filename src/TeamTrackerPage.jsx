// Página independiente para GO PLANNER (fuera del patrón de módulos).
// Este archivo NO está pensado para verse como artifact aquí en Claude —
// es código fuente para copiar a tu proyecto de GO PLANNER (Vite + React).
//
// Wiring en tu router (ya tienes react-router-dom instalado):
// 1) agrega una <Route> con path "/team-tracker" apuntando a este componente.
// 2) agrega un botón/Link en tu topbar o sidebar que navegue a esa ruta.
//
// Antes de usarla, pega tu URL de Apps Script (termina en /exec) aquí abajo:
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyO2WhyRMxeMFO38SjerexylRPT5UHJaGpMLhc6c_zk4vEfey76SevEROqGfEsGHV8j/exec';

// Si tienes el logo real de GO PLANNER, reemplaza <LogoMark /> más abajo por
// <img src="/ruta/a/tu/logo.svg" className="tt-logo-img" /> — dejé un monograma
// de placeholder para que no se vea vacío mientras tanto.

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, HelpCircle } from 'lucide-react';
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
    notas: '',
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
  const [showInfo, setShowInfo] = useState(false);
  const [editScope, setEditScope] = useState('solo');

  const tabsRef = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    (async () => {
      try {
        const all = await kvLoadAll();
        setTasks(all['tasks-board'] ? JSON.parse(all['tasks-board']) : []);
        setTeam(all['team-roster'] ? JSON.parse(all['team-roster']) : []);
        setAdminPin(all['admin-pin'] != null && all['admin-pin'] !== '' ? String(all['admin-pin']) : null);
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
    setForm(task ? { ...task, notas: task.notas || '' } : emptyForm(team));
    setEditScope('solo');
    setShowForm(true);
  }

  function notifyNewTask(task) {
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'notify', title: task.title, assignee: task.assignee, dueDate: task.dueDate, priority: task.priority }),
    }).catch(() => {});
  }

  function submitForm() {
    if (!form.title.trim() || !form.dueDate) return;
    if (form.id) {
      if (!form.assignee) return;
      if (form.groupId && editScope === 'group') {
        saveTasks(tasks.map((t) => (t.groupId === form.groupId
          ? { ...t, title: form.title.trim(), dueDate: form.dueDate, priority: form.priority, pilar: form.pilar, notas: form.notas }
          : t)));
      } else {
        saveTasks(tasks.map((t) => (t.id === form.id ? { ...t, ...form, title: form.title.trim() } : t)));
      }
    } else if (form.assignee === '__ALL__') {
      const groupId = uid();
      const base = {
        title: form.title.trim(), dueDate: form.dueDate, createdDate: todayISO(),
        priority: form.priority, pilar: form.pilar, status: 'pending', completedAt: null, comment: '', notas: form.notas, groupId,
      };
      const newTasks = team.map((m) => ({ id: uid(), assignee: m, ...base }));
      saveTasks([...(tasks || []), ...newTasks]);
      notifyNewTask({ title: base.title, assignee: `Todo el equipo (${team.length})`, dueDate: base.dueDate, priority: base.priority });
    } else {
      if (!form.assignee) return;
      const task = {
        id: uid(), title: form.title.trim(), assignee: form.assignee, dueDate: form.dueDate,
        createdDate: todayISO(), priority: form.priority, pilar: form.pilar,
        status: 'pending', completedAt: null, comment: '', notas: form.notas, groupId: null,
      };
      saveTasks([...(tasks || []), task]);
      notifyNewTask(task);
    }
    setShowForm(false);
  }

  function cycleStatus(task) {
    const idx = STATUS_ORDER.indexOf(task.status);
    let next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    if (next === 'done' && !isAdmin) next = 'pending'; // solo admin confirma "Hecho"
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
  const overdueCount = useMemo(() => (!tasks ? 0 : tasks.filter((t) => t.status !== 'done' && t.dueDate < todayISO()).length), [tasks]);

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

      <header className="tt-topbar">
        <Link to="/" className="tt-topbar-brand" title="Volver a GO PLANNER">
          <span className="tt-logo-mark">GP</span>
          <span className="tt-topbar-titles">
            <span className="tt-topbar-title">GO <b>PLANNER</b></span>
            <span className="tt-topbar-sub">Team Tracker</span>
          </span>
        </Link>
        <div className="tt-topbar-actions">
          <button className="tt-topbar-icon" title="Pendientes vencidos">
            <Bell size={16} />
            {overdueCount > 0 && <span className="tt-topbar-badge">{overdueCount}</span>}
          </button>
          <div className="tt-info-wrap">
            <button className="tt-topbar-icon" onClick={() => setShowInfo((v) => !v)} title="Acerca de Team Tracker">
              <HelpCircle size={16} />
            </button>
            {showInfo && (
              <div className="tt-info-pop">
                <p><b>Team Tracker</b></p>
                <p>Pendientes del equipo, checklist, Gantt y resumen semanal. El candado 🔒 desbloquea agregar, editar o borrar. Los datos viven en un Google Sheet aparte.</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="tt-root">
        <aside className={`tt-side ${collapsed ? 'is-collapsed' : ''}`}>
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
                    {!form.id && <option value="__ALL__">Todo el equipo ({team.length})</option>}
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
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </label>
                <label>Prioridad
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITY_ORDER.map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>
                </label>
              </div>
              <label>Notas / enlaces (opcional)
                <textarea className="tt-notes-input" rows={3} placeholder="Contexto, liga de Sheets, Drive, lo que necesiten saber…"
                  value={form.notas || ''} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </label>
              {form.id && form.groupId && (
                <div className="tt-scope-row">
                  <span className="tt-scope-label">Aplicar cambios a:</span>
                  <div className="tt-group-toggle">
                    <button type="button" className={editScope === 'solo' ? 'is-active' : ''} onClick={() => setEditScope('solo')}>Solo {form.assignee}</button>
                    <button type="button" className={editScope === 'group' ? 'is-active' : ''} onClick={() => setEditScope('group')}>Todo el equipo</button>
                  </div>
                </div>
              )}
              {form.id && (
                <label>Estado
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_ORDER.map((s) => (<option key={s} value={s}>{STATUS[s].label}</option>))}
                  </select>
                </label>
              )}
              <div className="tt-modal-actions">
                <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="button" className="tt-primary" onClick={submitForm}>Guardar</button>
              </div>
            </div>
          </div>
        )}

        {pinModal && (
          <div className="tt-modal-back" onClick={() => setPinModal(null)}>
            <div className="tt-modal tt-modal-narrow" onClick={(e) => e.stopPropagation()}>
              <h3>{pinModal === 'create' ? 'Crea tu PIN de edición' : 'Modo edición'}</h3>
              <label>{pinModal === 'create' ? 'Nuevo PIN (mín. 4 caracteres)' : 'PIN'}
                <input autoFocus type="password" value={pinInput} onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitPin(); }} />
              </label>
              {pinError && <p className="tt-pin-error">{pinError}</p>}
              <div className="tt-modal-actions">
                <button type="button" onClick={() => setPinModal(null)}>Cancelar</button>
                <button type="button" className="tt-primary" onClick={submitPin}>{pinModal === 'create' ? 'Crear' : 'Entrar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LockIcon({ open }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2.5" />
      {open ? <path d="M7 11V7a5 5 0 0 1 9.9-1" /> : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function ProgressRing({ pct, size = 68, stroke = 6, color = '#E0BB3E' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = pct === null ? c : c - (pct / 100) * c;
  return (
    <svg width={size} height={size} className="tt-ring">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="tt-ring-text">{pct === null ? '—' : `${pct}%`}</text>
    </svg>
  );
}
function PriorityBadge({ code }) {
  const p = PRIORITY[code] || PRIORITY.C;
  return <span className="tt-prio" style={{ background: p.bg, color: p.fg }}>{p.label}</span>;
}
function PilarTag({ code }) {
  const p = PILAR[code];
  if (!p) return null;
  return <span className="tt-pilar-tag"><span className="tt-dot" style={{ background: p.dot }} />{p.label}</span>;
}

function linkify(text) {
  if (!text) return null;
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" className="tt-link">{part}</a> : part
  );
}

function TaskCard({ t, isAdmin, onCycle, onDelete, onEdit, drafts, onCommentChange, onCommentBlur, showAssignee = true }) {
  const overdue = t.status !== 'done' && t.dueDate < todayISO();
  const idx = STATUS_ORDER.indexOf(t.status);
  let nextKey = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
  if (nextKey === 'done' && !isAdmin) nextKey = 'pending';
  return (
    <div className={`tt-card ${overdue ? 'is-overdue' : ''}`} style={{ '--glow': avatarGlow(t.assignee) }}>
      <div className="tt-card-top">
        <PriorityBadge code={t.priority} />
        <PilarTag code={t.pilar} />
        {t.groupId && <span className="tt-batch-tag" title="Asignada a todo el equipo">👥</span>}
        {isAdmin && (
          <span className="tt-card-admin-actions">
            <button className="tt-card-icon" onClick={() => onEdit(t)} title="Editar">✎</button>
            <button className="tt-card-icon tt-card-x" onClick={() => onDelete(t.id)} title="Eliminar">×</button>
          </span>
        )}
      </div>
      <p className="tt-card-title">{t.title}</p>
      {t.notas && <p className="tt-card-notes">{linkify(t.notas)}</p>}
      <div className="tt-card-foot">
        {showAssignee && <span className="tt-avatar tt-avatar-sm" style={{ background: avatarGradient(t.assignee) }}>{initials(t.assignee)}</span>}
        <span className="tt-status-chip"><span className="tt-dot" style={{ background: STATUS[t.status].dot }} />{STATUS[t.status].label}</span>
        <span className={`tt-due ${overdue ? 'is-overdue-text' : ''}`}>{overdue ? 'venció ' : 'vence '}{fmtShort(t.dueDate)}</span>
      </div>
      {t.status === 'done' && (
        <textarea className="tt-comment" placeholder="Bitácora: ¿qué pasó con esta tarea?"
          value={t.id in drafts ? drafts[t.id] : (t.comment || '')}
          onChange={(e) => onCommentChange(t.id, e.target.value)} onBlur={() => onCommentBlur(t.id)} />
      )}
      <button className="tt-cycle" onClick={() => onCycle(t)}>
        Mover a {STATUS[nextKey].label.toLowerCase()}
      </button>
    </div>
  );
}

function BoardByStatus({ tasks, isAdmin, onCycle, onDelete, onEdit, drafts, onCommentChange, onCommentBlur }) {
  const cols = STATUS_ORDER.map((key) => ({
    key, label: STATUS[key].label,
    items: tasks.filter((t) => t.status === key).sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || a.dueDate.localeCompare(b.dueDate)),
  }));
  if (tasks.length === 0) return <p className="tt-empty-hint tt-empty-big">Sin pendientes todavía.</p>;
  return (
    <div className="tt-board">
      {cols.map((col) => (
        <div className="tt-col" key={col.key}>
          <div className="tt-col-head"><span className="tt-dot" style={{ background: STATUS[col.key].dot }} />{col.label}<span className="tt-col-count">{col.items.length}</span></div>
          <div className="tt-col-body">
            {col.items.map((t) => (
              <TaskCard key={t.id} t={t} isAdmin={isAdmin} onCycle={onCycle} onDelete={onDelete} onEdit={onEdit} drafts={drafts} onCommentChange={onCommentChange} onCommentBlur={onCommentBlur} />
            ))}
            {col.items.length === 0 && <p className="tt-col-empty">—</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardByPerson({ tasks, team, isAdmin, onCycle, onDelete, onEdit, drafts, onCommentChange, onCommentBlur }) {
  if (tasks.length === 0) return <p className="tt-empty-hint tt-empty-big">Sin pendientes todavía.</p>;
  return (
    <div className="tt-person-board">
      {team.map((m) => {
        const items = tasks.filter((t) => t.assignee === m)
          .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
        return (
          <div className="tt-person-group" key={m}>
            <div className="tt-person-head">
              <span className="tt-avatar" style={{ background: avatarGradient(m) }}>{initials(m)}</span>
              <span className="tt-person-name">{m}</span>
              <span className="tt-col-count">{items.length}</span>
            </div>
            <div className="tt-person-cards">
              {items.length === 0 && <p className="tt-col-empty">Sin pendientes</p>}
              {items.map((t) => (
                <TaskCard key={t.id} t={t} isAdmin={isAdmin} onCycle={onCycle} onDelete={onDelete} onEdit={onEdit} drafts={drafts} onCommentChange={onCommentChange} onCommentBlur={onCommentBlur} showAssignee={false} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttView({ tasks, range }) {
  const totalMs = range.days * 86400000;
  const todayOffset = ((new Date() - range.start) / totalMs) * 100;
  const sorted = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (sorted.length === 0) return <p className="tt-empty-hint tt-empty-big">Sin pendientes para mostrar en la línea de tiempo.</p>;
  const days = Array.from({ length: range.days });
  return (
    <div className="tt-gantt">
      <div className="tt-gantt-grid">
        <div className="tt-gantt-labels-col">
          <div className="tt-gantt-labels-spacer" />
          {sorted.map((t) => (
            <div className="tt-gantt-label" key={t.id}>
              <span className="tt-avatar tt-avatar-sm" style={{ background: avatarGradient(t.assignee) }}>{initials(t.assignee)}</span>
              <PriorityBadge code={t.priority} />{t.title}
            </div>
          ))}
        </div>
        <div className="tt-gantt-tracks-col">
          <div className="tt-gantt-scale">
            {days.map((_, i) => (
              <span key={i} className={`tt-gantt-day-line ${i % 7 === 0 ? 'is-week' : ''}`} style={{ left: `${(i / range.days) * 100}%` }}>
                {i % 7 === 0 && <em>{fmtShort(toISO(addDays(range.start, i)))}</em>}
              </span>
            ))}
          </div>
          <div className="tt-gantt-body">
            <div className="tt-gantt-today" style={{ left: `${todayOffset}%` }} />
            {sorted.map((t) => {
              const start = new Date(t.createdDate); const end = new Date(t.dueDate);
              const left = Math.max(0, ((start - range.start) / totalMs) * 100);
              const width = Math.max(2, ((end - start) / totalMs) * 100);
              const overdue = t.status !== 'done' && t.dueDate < todayISO();
              return (
                <div className="tt-gantt-track" key={t.id}>
                  <div className={`tt-gantt-bar status-${t.status} ${overdue ? 'is-overdue' : ''}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${fmtShort(t.createdDate)} → ${fmtShort(t.dueDate)}`} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumenView({ week, totals, byMember, byPilar }) {
  const rate = totals.total ? Math.round((totals.done / totals.total) * 100) : null;
  const members = Object.entries(byMember);
  return (
    <div className="tt-resumen">
      <div className="tt-resumen-banner">
        <div>
          <span className="tt-tag">Semana del {fmtShort(week.startISO)} al {fmtShort(week.endISO)}</span>
          <p className="tt-banner-big">{totals.done} de {totals.total || 0}<span className="tt-banner-small"> pendientes con fecha esta semana, completados</span></p>
        </div>
        <ProgressRing pct={rate} />
      </div>
      <h4 className="tt-subhead">Por persona</h4>
      {members.length === 0 && <p className="tt-empty-hint">Agrega gente al equipo para ver su avance.</p>}
      <div className="tt-bars">
        {members.map(([name, s]) => {
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <div className="tt-bar-row" key={name}>
              <div className="tt-bar-label"><span className="tt-avatar tt-avatar-sm" style={{ background: avatarGradient(name) }}>{initials(name)}</span>{name}</div>
              <div className="tt-bar-track"><div className="tt-bar-fill" style={{ width: `${pct}%`, background: avatarGradient(name) }} /></div>
              <div className="tt-bar-value">{s.done}/{s.total}{s.late > 0 && <span className="tt-bar-late"> · {s.late} tarde</span>}</div>
            </div>
          );
        })}
      </div>
      <h4 className="tt-subhead">Por pilar</h4>
      <div className="tt-bars">
        {PILAR_ORDER.map((p) => {
          const s = byPilar[p] || { total: 0, done: 0 };
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <div className="tt-bar-row" key={p}>
              <div className="tt-bar-label"><span className="tt-dot" style={{ background: PILAR[p].dot }} />{PILAR[p].label}</div>
              <div className="tt-bar-track"><div className="tt-bar-fill" style={{ width: `${pct}%`, background: PILAR[p].dot }} /></div>
              <div className="tt-bar-value">{s.done}/{s.total}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesempenoView({ data }) {
  return (
    <div className="tt-desempeno">
      <p className="tt-empty-hint tt-desempeno-note">Vista privada, solo visible en modo edición. Cumplimiento sobre pendientes cuya fecha límite ya pasó.</p>
      {data.length === 0 && <p className="tt-empty-hint">Todavía no hay historial suficiente.</p>}
      <div className="tt-bars">
        {data.map((s) => {
          const pct = Math.round(s.rate * 100);
          return (
            <div className="tt-bar-row" key={s.name}>
              <div className="tt-bar-label"><span className="tt-avatar tt-avatar-sm" style={{ background: avatarGradient(s.name) }}>{initials(s.name)}</span>{s.name}</div>
              <div className="tt-bar-track"><div className="tt-bar-fill" style={{ width: `${pct}%`, background: avatarGradient(s.name) }} /></div>
              <div className="tt-bar-value">{s.done}/{s.total} · {pct}%{s.onTime < s.done && <span className="tt-bar-late"> · {s.done - s.onTime} tarde</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
@keyframes ttFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ttFadeIn { from { opacity: 0; } to { opacity: 1; } }

html, body { margin: 0; padding: 0; }
body { background: #14121a; }
.tt-page {
  position: relative; min-height: 100vh; width: 100%; box-sizing: border-box;
  padding: 28px; overflow: hidden;
  background: radial-gradient(ellipse 60% 50% at 15% 10%, rgba(138,115,173,0.35), transparent 60%),
              radial-gradient(ellipse 55% 45% at 90% 85%, rgba(224,187,62,0.22), transparent 60%),
              linear-gradient(160deg, #16141a 0%, #1c1720 45%, #14121a 100%);
}
.tt-root { position: relative; display: flex; min-height: 560px; color: #EDEBF2; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; }
.tt-loading { align-items: center; justify-content: center; width: 100%; }

.tt-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; position: relative; z-index: 3; }
.tt-topbar-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.tt-topbar-titles { display: flex; flex-direction: column; line-height: 1.15; }
.tt-topbar-title { font-size: 15px; font-weight: 800; letter-spacing: 0.02em; color: #EDEBF2; text-transform: uppercase; }
.tt-topbar-title b { color: #B39DDB; }
.tt-topbar-sub { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #948FA0; }
.tt-topbar-actions { display: flex; gap: 8px; }
.tt-topbar-icon { position: relative; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: #948FA0; width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(10px); transition: all .15s ease; }
.tt-topbar-icon:hover { color: #EDEBF2; background: rgba(255,255,255,0.12); }
.tt-topbar-badge { position: absolute; top: -4px; right: -4px; background: #A1402C; color: #fff; font-size: 9px; font-weight: 800; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.tt-info-wrap { position: relative; }
.tt-info-pop { position: absolute; top: 42px; right: 0; width: 230px; background: rgba(28,25,34,0.92); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px; font-size: 11.5px; line-height: 1.5; color: #B7B2C4; z-index: 20; box-shadow: 0 12px 30px rgba(0,0,0,0.45); animation: ttFadeIn .15s ease; }
.tt-info-pop b { color: #EDEBF2; }
.tt-info-pop p { margin: 0 0 6px; }
.tt-info-pop p:last-child { margin-bottom: 0; }

.tt-side { width: 210px; flex-shrink: 0; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px;
  background: rgba(255,255,255,0.045); backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,0.09);
  border-radius: 16px; margin-right: 16px; position: relative; transition: width 0.28s cubic-bezier(.4,0,.2,1); }
.tt-side.is-collapsed { width: 68px; align-items: center; }

.tt-logo { display: flex; align-items: center; gap: 8px; padding: 2px 4px 16px; }
.tt-logo-mark { width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; letter-spacing: 0.02em; color: #16141a;
  background: linear-gradient(135deg, #E0BB3E, #B39DDB); box-shadow: 0 0 14px rgba(224,187,62,0.35); }
.tt-logo-word { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #B7B2C4; white-space: nowrap; }

.tt-side-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; width: 100%; }
.tt-side-actions { display: flex; gap: 6px; }
.tt-tag { font-size: 11px; letter-spacing: 0.02em; color: #948FA0; }
.tt-icon-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: #948FA0; cursor: pointer; width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; transition: all .18s ease; }
.tt-icon-btn:hover { color: #EDEBF2; background: rgba(255,255,255,0.12); }
.tt-icon-btn.is-on { color: #16141a; background: #E0BB3E; border-color: #E0BB3E; }

.tt-member { position: relative; display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 8px; border: none; background: none; color: #CFCBDA; border-radius: 9px; cursor: pointer; text-align: left; font-size: 13px; transition: all .2s ease; }
.tt-member:hover { background: rgba(255,255,255,0.07); backdrop-filter: blur(6px); box-shadow: 0 10px 24px -8px var(--glow, transparent); transform: translateY(-1px); }
.tt-member.is-active { background: rgba(255,255,255,0.1); color: #FFFFFF; font-weight: 600; box-shadow: 0 8px 20px -6px var(--glow, transparent); }
.tt-side.is-collapsed .tt-member { justify-content: center; padding: 7px 0; }
.tt-member-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-member-count { font-size: 11px; background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 10px; }

.tt-avatar { width: 24px; height: 24px; border-radius: 50%; color: #16141a; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
.tt-avatar-all { background: rgba(255,255,255,0.14); color: #EDEBF2; }
.tt-avatar-sm { width: 19px; height: 19px; font-size: 9px; }

.tt-collapse-btn { margin-top: auto; align-self: flex-end; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: #948FA0; width: 22px; height: 22px; border-radius: 6px; cursor: pointer; font-size: 11px; }
.tt-collapse-btn:hover { color: #EDEBF2; background: rgba(255,255,255,0.12); }

.tt-team-edit { margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; width: 100%; }
.tt-inline-form { display: flex; gap: 6px; margin-bottom: 8px; }
.tt-inline-form input { flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #EDEBF2; border-radius: 6px; padding: 5px 7px; font-size: 12px; }
.tt-inline-form button { background: #E0BB3E; border: none; color: #16141a; border-radius: 6px; padding: 5px 10px; font-size: 13px; cursor: pointer; font-weight: 700; }
.tt-team-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 2px; font-size: 12px; color: #CFCBDA; gap: 6px; }
.tt-team-row-name { cursor: pointer; border-bottom: 1px dashed rgba(255,255,255,0.25); }
.tt-team-row-name:hover { color: #E0BB3E; }
.tt-rename-input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid #E0BB3E; color: #EDEBF2; border-radius: 5px; padding: 3px 6px; font-size: 12px; }
.tt-team-row button { background: none; border: none; color: #C99A9A; cursor: pointer; font-size: 11px; flex-shrink: 0; }

.tt-empty-hint { color: #948FA0; font-size: 12px; padding: 6px 2px; }
.tt-empty-big { padding: 40px 0; text-align: center; font-size: 14px; }

.tt-main { flex: 1; min-width: 0; padding: 4px 4px 4px 0; }
.tt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.tt-tabs { position: relative; display: flex; gap: 2px; background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 3px; border-radius: 10px; }
.tt-tabs-indicator { position: absolute; top: 3px; bottom: 3px; border-radius: 7px; background: linear-gradient(135deg, #8A73AD, #6E5B8A); box-shadow: 0 4px 14px rgba(138,115,173,0.45); transition: left .3s cubic-bezier(.4,0,.2,1), width .3s cubic-bezier(.4,0,.2,1); z-index: 0; }
.tt-tabs button { position: relative; z-index: 1; border: none; background: none; padding: 7px 14px; border-radius: 7px; font-size: 13px; cursor: pointer; color: #B7B2C4; transition: color .2s ease; }
.tt-tabs button.is-active { color: #FFFFFF; font-weight: 600; }
.tt-header-actions { display: flex; gap: 8px; }
.tt-new-btn { background: linear-gradient(135deg, #8A73AD, #6E5B8A); color: #FFFFFF; border: none; padding: 8px 14px; border-radius: 9px; font-size: 13px; cursor: pointer; font-weight: 600; box-shadow: 0 6px 16px rgba(138,115,173,0.35); transition: transform .15s ease; }
.tt-new-btn:hover:not(:disabled) { transform: translateY(-1px); }
.tt-new-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.tt-ghost-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #EDEBF2; padding: 8px 14px; border-radius: 9px; font-size: 13px; cursor: pointer; backdrop-filter: blur(8px); }
.tt-ghost-btn:hover { background: rgba(255,255,255,0.12); }

.tt-notice { background: rgba(224,187,62,0.12); color: #E0BB3E; border: 1px solid rgba(224,187,62,0.3); padding: 8px 12px; border-radius: 9px; font-size: 12px; margin-bottom: 12px; backdrop-filter: blur(8px); }

.tt-group-toggle { display: inline-flex; gap: 2px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 3px; border-radius: 8px; margin-bottom: 14px; }
.tt-group-toggle button { border: none; background: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; color: #B7B2C4; }
.tt-group-toggle button.is-active { background: rgba(255,255,255,0.12); color: #FFFFFF; }

.tt-board { display: flex; gap: 14px; align-items: flex-start; }
.tt-col { flex: 1; min-width: 0; background: rgba(255,255,255,0.045); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.09); border-radius: 12px; }
.tt-col-head { display: flex; align-items: center; gap: 7px; padding: 11px 13px; font-size: 12px; font-weight: 600; color: #CFCBDA; border-bottom: 1px solid rgba(255,255,255,0.08); }
.tt-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.tt-col-count { margin-left: auto; color: #948FA0; font-weight: 400; }
.tt-col-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 60px; }
.tt-col-empty { color: #6E6A7A; font-size: 12px; text-align: center; padding: 10px 0; }

.tt-person-board { display: flex; flex-direction: column; gap: 14px; }
.tt-person-group { background: rgba(255,255,255,0.04); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; }
.tt-person-head { display: flex; align-items: center; gap: 9px; padding: 11px 14px; font-size: 13px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); }
.tt-person-name { flex: 1; }
.tt-person-cards { padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }

.tt-card { background: rgba(255,255,255,0.055); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 10px 11px; animation: ttFadeUp .35s ease both; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.tt-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.2); box-shadow: 0 14px 28px -10px var(--glow, rgba(0,0,0,0.4)); }
.tt-card.is-overdue { border-color: rgba(196,120,120,0.5); background: rgba(196,120,120,0.08); }
.tt-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.tt-card-admin-actions { margin-left: auto; display: flex; gap: 4px; }
.tt-card-icon { background: none; border: none; color: #6E6A7A; cursor: pointer; font-size: 13px; line-height: 1; }
.tt-card-icon:hover { color: #EDEBF2; }
.tt-card-x:hover { color: #D98A8A; }
.tt-prio { font-size: 10.5px; font-weight: 800; padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.tt-pilar-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: #A9A4B6; }
.tt-card-title { font-size: 13px; line-height: 1.35; margin: 0 0 8px; color: #F2F0F6; }
.tt-card-foot { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.tt-status-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: #A9A4B6; }
.tt-due { font-size: 11px; color: #948FA0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-left: auto; }
.tt-due.is-overdue-text { color: #E0A0A0; font-weight: 600; }
.tt-comment { width: 100%; resize: vertical; min-height: 40px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; margin-bottom: 8px; color: #EDEBF2; background: rgba(0,0,0,0.2); }
.tt-cycle { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #CFCBDA; border-radius: 7px; padding: 6px 0; font-size: 11px; cursor: pointer; transition: background .15s ease; }
.tt-cycle:hover { background: rgba(255,255,255,0.14); }

.tt-gantt { font-size: 12px; animation: ttFadeIn .3s ease; }
.tt-gantt-grid { display: flex; }
.tt-gantt-labels-col { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; }
.tt-gantt-labels-spacer { height: 34px; flex-shrink: 0; }
.tt-gantt-label { height: 33px; flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding-right: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,0.06); }
.tt-gantt-tracks-col { flex: 1; min-width: 0; }
.tt-gantt-scale { position: relative; height: 34px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.tt-gantt-day-line { position: absolute; top: 16px; bottom: 0; width: 1px; background: rgba(255,255,255,0.05); }
.tt-gantt-day-line.is-week { top: 0; background: rgba(255,255,255,0.18); }
.tt-gantt-day-line em { position: absolute; top: 0; left: 0; font-style: normal; color: #948FA0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; white-space: nowrap; }
.tt-gantt-body { position: relative; }
.tt-gantt-today { position: absolute; top: 0; bottom: 0; width: 2px; background: #E0BB3E; box-shadow: 0 0 8px #E0BB3E; z-index: 1; }
.tt-gantt-track { position: relative; height: 33px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.tt-gantt-bar { position: absolute; top: 8px; bottom: 8px; border-radius: 5px; background: #9A9CA3; transition: width .5s ease; }
.tt-gantt-bar.status-pending { background: #9A9CA3; }
.tt-gantt-bar.status-progress { background: #E0BB3E; }
.tt-gantt-bar.status-done { background: #8A73AD; }
.tt-gantt-bar.is-overdue { background: #D98A8A; }

.tt-subhead { font-size: 12.5px; font-weight: 600; color: #B7B2C4; margin: 22px 0 10px; }
.tt-resumen-banner { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 20px 24px; animation: ttFadeIn .3s ease; }
.tt-resumen-banner .tt-tag { color: #948FA0; }
.tt-banner-big { font-size: 27px; font-weight: 700; margin: 6px 0 0; }
.tt-banner-small { font-size: 13px; font-weight: 400; color: #948FA0; }
.tt-ring-text { font-size: 14px; font-weight: 700; fill: #EDEBF2; }

.tt-bars { display: flex; flex-direction: column; gap: 12px; }
.tt-bar-row { display: flex; align-items: center; gap: 12px; }
.tt-bar-label { width: 170px; flex-shrink: 0; display: flex; align-items: center; gap: 6px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tt-bar-track { flex: 1; height: 10px; background: rgba(255,255,255,0.08); border-radius: 5px; overflow: hidden; }
.tt-bar-fill { height: 100%; border-radius: 5px; transition: width .7s cubic-bezier(.4,0,.2,1); }
.tt-bar-value { width: 130px; flex-shrink: 0; font-size: 12px; color: #B7B2C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.tt-bar-late { color: #E0A0A0; }
.tt-desempeno-note { margin-bottom: 14px; }

.tt-modal-back { position: fixed; inset: 0; background: rgba(10,9,13,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10; animation: ttFadeIn .15s ease; }
.tt-modal { background: rgba(28,25,34,0.85); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 22px; width: 340px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); animation: ttFadeUp .2s ease; }
.tt-modal-narrow { width: 280px; }
.tt-modal h3 { margin: 0 0 4px; font-size: 15px; color: #FFFFFF; }
.tt-modal label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #B7B2C4; }
.tt-modal input, .tt-modal select, .tt-modal textarea { border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); border-radius: 7px; padding: 7px 9px; font-size: 13px; color: #EDEBF2; font-family: inherit; }
.tt-modal select { appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, #948FA0 50%), linear-gradient(135deg, #948FA0 50%, transparent 50%); background-position: calc(100% - 16px) center, calc(100% - 11px) center; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.tt-modal select option { background: #1c1720; color: #EDEBF2; }
.tt-modal textarea { resize: vertical; font-family: inherit; }
.tt-notes-input { width: 100%; box-sizing: border-box; }
.tt-card-notes { font-size: 12px; color: #B7B2C4; line-height: 1.4; margin: 0 0 8px; white-space: pre-wrap; word-break: break-word; }
.tt-link { color: #B39DDB; text-decoration: underline; }
.tt-scope-row { display: flex; flex-direction: column; gap: 6px; }
.tt-scope-label { font-size: 12px; color: #B7B2C4; }
.tt-form-row { display: flex; gap: 10px; }
.tt-form-row label { flex: 1; }
.tt-assign-all-note { border: 1px dashed rgba(255,255,255,0.18); border-radius: 6px; padding: 7px 9px; font-size: 12.5px; color: #B39DDB; background: rgba(139,115,173,0.08); }
.tt-checkbox-row { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 12.5px; color: #CFCBDA; cursor: pointer; }
.tt-checkbox-row input { width: auto; }
.tt-batch-tag { font-size: 11px; }
.tt-pin-error { color: #E0A0A0; font-size: 12px; margin: -6px 0 0; }
.tt-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.tt-modal-actions button { border: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; background: rgba(255,255,255,0.08); color: #EDEBF2; }
.tt-modal-actions .tt-primary { background: linear-gradient(135deg, #8A73AD, #6E5B8A); color: #FFFFFF; font-weight: 600; }
`;

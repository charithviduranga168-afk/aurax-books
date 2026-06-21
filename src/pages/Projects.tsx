import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { X } from 'lucide-react';

interface Project {
  id: string; project_number: string; name: string;
  client_id: string | null; client_name: string;
  description: string; start_date: string; end_date: string;
  budget: number; spent: number; status: string; priority: string;
  manager: string; created_at: string;
}

interface Task {
  id: string; project_id: string; task_number: string;
  title: string; description: string; assignee: string;
  due_date: string; status: string; priority: string;
  hours_estimated: number; hours_logged: number; created_at: string;
}

interface Customer { id: string; name: string; }

const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const PROJECT_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  planning:  { bg: '#e0e7ff', color: '#4f46e5' },
  active:    { bg: '#dcfce7', color: '#16a34a' },
  on_hold:   { bg: '#fef9c3', color: '#a16207' },
  completed: { bg: '#f0fdf4', color: '#15803d' },
  cancelled: { bg: '#fee2e2', color: '#dc2626' },
};
const TASK_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  todo:        { bg: '#f3f4f6', color: '#374151' },
  in_progress: { bg: '#dbeafe', color: '#1d4ed8' },
  review:      { bg: '#fef3c7', color: '#d97706' },
  done:        { bg: '#dcfce7', color: '#16a34a' },
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280', medium: '#d97706', high: '#dc2626', urgent: '#7c3aed',
};

function fmt(n: number) { return 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
      border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '14px',
      padding: '6px 0', marginBottom: '16px', fontWeight: 500,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      {label}
    </button>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dialog, setDialog] = useState<{ type: 'alert' | 'confirm'; msg: string; onOk?: () => void } | null>(null);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Project | null>(null);

  const blankProject = { name: '', client_id: '', client_name: '', description: '', start_date: new Date().toISOString().split('T')[0], end_date: '', budget: '', status: 'planning', priority: 'medium', manager: '' };
  const blankTask = { title: '', description: '', assignee: '', due_date: '', status: 'todo', priority: 'medium', hours_estimated: '0', hours_logged: '0' };
  const [projectForm, setProjectForm] = useState<any>(blankProject);
  const [taskForm, setTaskForm] = useState<any>(blankTask);

  function showAlert(msg: string) { setDialog({ type: 'alert', msg }); }
  function showConfirm(msg: string, onOk: () => void) { setDialog({ type: 'confirm', msg, onOk }); }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: proj }, { data: taskData }, { data: custData }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name').order('name'),
    ]);
    setProjects(proj || []);
    setTasks(taskData || []);
    setCustomers(custData || []);
    setLoading(false);
  }

  async function getNextProjectNumber() {
    const { data } = await supabase.from('projects').select('project_number').order('created_at', { ascending: false }).limit(50);
    let max = 0;
    (data || []).forEach(r => { const m = r.project_number?.match(/(\d+)$/); if (m) max = Math.max(max, parseInt(m[1])); });
    return 'PRJ-' + String(max + 1).padStart(4, '0');
  }

  async function getNextTaskNumber(projectId: string) {
    const { data } = await supabase.from('project_tasks').select('task_number').eq('project_id', projectId).order('created_at', { ascending: false }).limit(50);
    let max = 0;
    (data || []).forEach(r => { const m = r.task_number?.match(/(\d+)$/); if (m) max = Math.max(max, parseInt(m[1])); });
    return 'TASK-' + String(max + 1).padStart(3, '0');
  }

  async function saveProject() {
    if (!projectForm.name.trim()) { showAlert('Project name is required.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); showAlert('Session expired. Please refresh.'); return; }

    const cust = customers.find(c => c.id === projectForm.client_id);
    const payload = {
      name: projectForm.name.trim(), client_id: projectForm.client_id || null,
      client_name: cust?.name || projectForm.client_name.trim(),
      description: projectForm.description.trim(),
      start_date: projectForm.start_date || null, end_date: projectForm.end_date || null,
      budget: parseFloat(projectForm.budget) || 0, status: projectForm.status,
      priority: projectForm.priority, manager: projectForm.manager.trim(), user_id: user.id,
    };

    let error;
    if (editProjectId) {
      ({ error } = await supabase.from('projects').update(payload).eq('id', editProjectId));
      if (!error && selected?.id === editProjectId) {
        setSelected({ ...selected, ...payload } as Project);
      }
    } else {
      const project_number = await getNextProjectNumber();
      ({ error } = await supabase.from('projects').insert({ ...payload, project_number }));
    }
    setSaving(false);
    setShowProjectForm(false);
    if (error) { showAlert('Failed to save: ' + error.message); return; }
    loadAll();
  }

  async function saveTask() {
    if (!taskForm.title.trim()) { showAlert('Task title is required.'); return; }
    if (!selected?.id) { showAlert('No project selected.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); showAlert('Session expired. Please refresh.'); return; }

    const payload = {
      project_id: selected.id, title: taskForm.title.trim(),
      description: taskForm.description.trim(), assignee: taskForm.assignee.trim(),
      due_date: taskForm.due_date || null, status: taskForm.status, priority: taskForm.priority,
      hours_estimated: parseFloat(taskForm.hours_estimated) || 0,
      hours_logged: parseFloat(taskForm.hours_logged) || 0, user_id: user.id,
    };

    let error;
    if (editTaskId) {
      ({ error } = await supabase.from('project_tasks').update(payload).eq('id', editTaskId));
    } else {
      const task_number = await getNextTaskNumber(selected.id);
      ({ error } = await supabase.from('project_tasks').insert({ ...payload, task_number }));
    }
    setSaving(false);
    setShowTaskForm(false);
    if (error) { showAlert('Failed to save: ' + error.message); return; }
    loadAll();
  }

  async function updateTaskStatus(taskId: string, status: string) {
    await supabase.from('project_tasks').update({ status }).eq('id', taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
  }

  function deleteProject(id: string) {
    showConfirm('Delete this project and all its tasks?', async () => {
      await supabase.from('project_tasks').delete().eq('project_id', id);
      await supabase.from('projects').delete().eq('id', id);
      if (selected?.id === id) setView('list');
      loadAll();
    });
  }

  function deleteTask(id: string) {
    showConfirm('Delete this task?', async () => {
      await supabase.from('project_tasks').delete().eq('id', id);
      loadAll();
    });
  }

  const filteredProjects = projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.project_number.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || p.manager.toLowerCase().includes(q);
    const matchStatus = !filterStatus || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalBudget = projects.filter(p => p.status === 'active').reduce((s, p) => s + p.budget, 0);
  const completedCount = projects.filter(p => p.status === 'completed').length;
  const activeCount = projects.filter(p => p.status === 'active').length;
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;

  const ProjectFormModal = () => !showProjectForm ? null : (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{editProjectId ? 'Edit Project' : 'New Project'}</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowProjectForm(false)}><X size={14} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Project Name *</label>
            <input className="form-input" value={projectForm.name} onChange={e => setProjectForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. Website Redesign for ABC Ltd" />
          </div>
          <div className="form-group">
            <label className="form-label">Client</label>
            <select className="form-input" value={projectForm.client_id} onChange={e => setProjectForm((f: any) => ({ ...f, client_id: e.target.value }))}>
              <option value="">— No Client —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Project Manager</label>
            <input className="form-input" value={projectForm.manager} onChange={e => setProjectForm((f: any) => ({ ...f, manager: e.target.value }))} placeholder="Manager name" />
          </div>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input className="form-input" type="date" value={projectForm.start_date} onChange={e => setProjectForm((f: any) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input className="form-input" type="date" value={projectForm.end_date} onChange={e => setProjectForm((f: any) => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Budget (Rs.)</label>
            <input className="form-input" type="number" min="0" value={projectForm.budget} onChange={e => setProjectForm((f: any) => ({ ...f, budget: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-input" value={projectForm.priority} onChange={e => setProjectForm((f: any) => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" value={projectForm.status} onChange={e => setProjectForm((f: any) => ({ ...f, status: e.target.value }))}>
              {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={projectForm.description} onChange={e => setProjectForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Project description..." style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
          <button className="btn btn-secondary" onClick={() => setShowProjectForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveProject} disabled={saving}>{saving ? 'Saving...' : editProjectId ? 'Save Changes' : 'Create Project'}</button>
        </div>
      </div>
    </div>
  );

  const TaskFormModal = () => !showTaskForm ? null : (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{editTaskId ? 'Edit Task' : 'New Task'}</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowTaskForm(false)}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Task Title *</label>
            <input className="form-input" value={taskForm.title} onChange={e => setTaskForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="e.g. Design homepage mockup" />
          </div>
          <div className="form-group">
            <label className="form-label">Assignee</label>
            <input className="form-input" value={taskForm.assignee} onChange={e => setTaskForm((f: any) => ({ ...f, assignee: e.target.value }))} placeholder="Team member name" />
          </div>
          <div className="form-group">
            <label className="form-label">Due Date</label>
            <input className="form-input" type="date" value={taskForm.due_date} onChange={e => setTaskForm((f: any) => ({ ...f, due_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-input" value={taskForm.priority} onChange={e => setTaskForm((f: any) => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" value={taskForm.status} onChange={e => setTaskForm((f: any) => ({ ...f, status: e.target.value }))}>
              {TASK_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Estimated Hours</label>
            <input className="form-input" type="number" min="0" step="0.5" value={taskForm.hours_estimated} onChange={e => setTaskForm((f: any) => ({ ...f, hours_estimated: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Logged Hours</label>
            <input className="form-input" type="number" min="0" step="0.5" value={taskForm.hours_logged} onChange={e => setTaskForm((f: any) => ({ ...f, hours_logged: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={taskForm.description} onChange={e => setTaskForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Task details..." style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
          <button className="btn btn-secondary" onClick={() => setShowTaskForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveTask} disabled={saving}>{saving ? 'Saving...' : editTaskId ? 'Save Changes' : 'Create Task'}</button>
        </div>
      </div>
    </div>
  );

  const DialogEl = () => !dialog ? null : (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: 380 }}>
        <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>{dialog.msg}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {dialog.type === 'confirm' && <button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>}
          <button className="btn btn-primary" onClick={() => { dialog.onOk?.(); setDialog(null); }}>OK</button>
        </div>
      </div>
    </div>
  );

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const sc = PROJECT_STATUS_COLORS[selected.status] || PROJECT_STATUS_COLORS.planning;
    const projectTasks = tasks.filter(t => t.project_id === selected.id);
    const doneProjTasks = projectTasks.filter(t => t.status === 'done').length;
    const totalProjHrsEst = projectTasks.reduce((s, t) => s + t.hours_estimated, 0);
    const totalProjHrsLog = projectTasks.reduce((s, t) => s + t.hours_logged, 0);
    const budgetPct = selected.budget > 0 ? Math.min(100, ((selected.spent || 0) / selected.budget) * 100) : 0;
    const isOverdue = selected.end_date && new Date(selected.end_date) < new Date() && selected.status === 'active';

    return (
      <div className="page-wrap">
        <DialogEl />
        <ProjectFormModal />
        <TaskFormModal />

        <BackBtn label="Projects" onClick={() => { setView('list'); setSelected(null) }} />

        {/* Hero card */}
        <div className="card" style={{ marginBottom: '16px', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '12px',
              background: `${PRIORITY_COLORS[selected.priority] || '#6b7280'}20`, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: '14px' }}>{selected.project_number}</span>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{selected.name}</h2>
                <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: '2px 12px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
                  {selected.status.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_COLORS[selected.priority] || '#6b7280', textTransform: 'capitalize' }}>
                  ▲ {selected.priority}
                </span>
              </div>
              <div style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '6px' }}>
                {selected.client_name ? `Client: ${selected.client_name}` : 'No client'}
                {selected.manager ? ` · Manager: ${selected.manager}` : ''}
              </div>
              {selected.description && (
                <div style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '4px' }}>{selected.description}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" onClick={() => { setEditTaskId(null); setTaskForm(blankTask); setShowTaskForm(true); }}>+ Task</button>
              <button className="btn btn-secondary" onClick={() => { setEditProjectId(selected.id); setProjectForm({ ...selected, budget: String(selected.budget), client_id: selected.client_id || '' }); setShowProjectForm(true); }}>Edit</button>
              <button className="btn" style={{ background: 'var(--red-light)', color: 'var(--red)' }} onClick={() => deleteProject(selected.id)}>Delete</button>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Budget', value: fmt(selected.budget), color: '#d97706' },
            { label: 'Tasks Done', value: `${doneProjTasks} / ${projectTasks.length}`, color: '#16a34a' },
            { label: 'Hours Est. / Logged', value: `${totalProjHrsEst}h / ${totalProjHrsLog}h`, color: '#0284c7' },
            {
              label: 'Deadline',
              value: selected.end_date ? fmtDate(selected.end_date) : '—',
              color: isOverdue ? '#dc2626' : 'var(--text)',
            },
          ].map(kpi => (
            <div key={kpi.label} className="card" style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: kpi.color, marginTop: '6px' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Budget bar */}
        {selected.budget > 0 && (
          <div className="card" style={{ marginBottom: '16px', padding: '14px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              <span>Budget utilisation</span>
              <span style={{ color: budgetPct > 90 ? '#dc2626' : '#16a34a' }}>{budgetPct.toFixed(0)}%</span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4 }}>
              <div style={{ width: budgetPct + '%', height: '100%', background: budgetPct > 90 ? '#dc2626' : '#16a34a', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>
              <span>Spent: {fmt(selected.spent || 0)}</span>
              <span>Budget: {fmt(selected.budget)}</span>
            </div>
          </div>
        )}

        {/* Tasks kanban */}
        {projectTasks.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>No tasks yet</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 16 }}>Add the first task to get started</div>
            <button className="btn btn-primary" onClick={() => { setEditTaskId(null); setTaskForm(blankTask); setShowTaskForm(true); }}>+ Add Task</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {TASK_STATUSES.map(status => {
              const tsc = TASK_STATUS_COLORS[status];
              const colTasks = projectTasks.filter(t => t.status === status);
              const label = status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <div key={status} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: tsc.color }}>{label}</span>
                    <span style={{ background: tsc.bg, color: tsc.color, borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{colTasks.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {colTasks.map(task => (
                      <div key={task.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] || '#6b7280'}` }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{task.title}</div>
                        {task.assignee && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>👤 {task.assignee}</div>}
                        {task.due_date && <div style={{ fontSize: 11, color: new Date(task.due_date) < new Date() && task.status !== 'done' ? '#dc2626' : 'var(--text3)', marginBottom: 6 }}>📅 {task.due_date}</div>}
                        {task.hours_estimated > 0 && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>⏱ {task.hours_logged}h / {task.hours_estimated}h</div>}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {TASK_STATUSES.filter(s => s !== status).map(s => (
                            <button key={s} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: TASK_STATUS_COLORS[s].color }} onClick={() => updateTaskStatus(task.id, s)}>
                              → {s.replace('_', ' ')}
                            </button>
                          ))}
                          <button style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text2)' }} onClick={() => { setEditTaskId(task.id); setTaskForm({ ...task, hours_estimated: String(task.hours_estimated), hours_logged: String(task.hours_logged), due_date: task.due_date || '' }); setShowTaskForm(true); }}>Edit</button>
                          <button style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fee2e2', cursor: 'pointer', color: '#dc2626' }} onClick={() => deleteTask(task.id)}>Del</button>
                        </div>
                      </div>
                    ))}
                    {colTasks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>No tasks</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap">
      <DialogEl />
      <ProjectFormModal />
      <TaskFormModal />

      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Track client projects, tasks, and time</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditProjectId(null); setProjectForm(blankProject); setShowProjectForm(true); }}>+ New Project</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Projects', value: projects.length, color: 'var(--brand)' },
          { label: 'Active', value: activeCount, color: '#16a34a' },
          { label: 'Completed', value: completedCount, color: '#0284c7' },
          { label: 'Active Budget', value: fmt(totalBudget), color: '#d97706' },
          { label: 'Tasks Done', value: `${doneTasks} / ${totalTasks}`, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 22px', minWidth: 140 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {['Projects', 'All Tasks'].map((t, i) => (
          <button key={t} className={`tab-btn ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>{t}</button>
        ))}
      </div>

      {activeTab === 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input className="form-input" style={{ flex: 1, minWidth: 220 }} placeholder="Search name, number, client, manager..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
            </select>
          </div>

          <div className="table-wrap">
            <div className="table-toolbar"><h3>Projects ({filteredProjects.length})</h3></div>
            {loading ? <div className="empty-state">Loading...</div> : filteredProjects.length === 0 ? (
              <div className="empty-state">No projects found.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Number</th><th>Project</th><th>Client</th><th>Manager</th>
                    <th>Priority</th><th>Status</th>
                    <th style={{ textAlign: 'right' }}>Budget</th>
                    <th>End Date</th><th>Tasks</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(p => {
                    const sc = PROJECT_STATUS_COLORS[p.status] || PROJECT_STATUS_COLORS.planning;
                    const ptasks = tasks.filter(t => t.project_id === p.id);
                    const pdone = ptasks.filter(t => t.status === 'done').length;
                    const budgetPct = p.budget > 0 ? Math.min(100, ((p.spent || 0) / p.budget) * 100) : 0;
                    return (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(p); setView('detail') }}>
                        <td style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{p.project_number}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          {p.description && <div style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{p.client_name || '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{p.manager || '—'}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[p.priority] || '#6b7280', textTransform: 'capitalize' }}>▲ {p.priority}</span>
                        </td>
                        <td>
                          <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                            {p.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(p.budget)}</div>
                          {p.budget > 0 && (
                            <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 3 }}>
                              <div style={{ width: budgetPct + '%', height: '100%', background: budgetPct > 90 ? '#dc2626' : '#16a34a', borderRadius: 2 }} />
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: p.end_date && new Date(p.end_date) < new Date() && p.status === 'active' ? '#dc2626' : 'var(--text2)' }}>
                          {p.end_date || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{pdone}/{ptasks.length}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setEditProjectId(p.id); setProjectForm({ ...p, budget: String(p.budget), client_id: p.client_id || '' }); setShowProjectForm(true); }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteProject(p.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 1 && (
        <div className="table-wrap">
          <div className="table-toolbar"><h3>All Tasks Overview</h3></div>
          {loading ? <div className="empty-state">Loading...</div> : tasks.length === 0 ? (
            <div className="empty-state">No tasks yet. Click a project to add tasks.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Due Date</th><th>Status</th><th style={{ textAlign: 'right' }}>Hours Est.</th><th style={{ textAlign: 'right' }}>Hours Logged</th></tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const sc = TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.todo;
                  const proj = projects.find(p => p.id === task.project_id);
                  const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                  return (
                    <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => { const p = projects.find(pr => pr.id === task.project_id); if (p) { setSelected(p); setView('detail'); } }}>
                      <td style={{ fontWeight: 600 }}>{task.title}</td>
                      <td style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>{proj?.project_number || '—'} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>{proj?.name}</span></td>
                      <td style={{ fontSize: 13, color: 'var(--text2)' }}>{task.assignee || '—'}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[task.priority] || '#6b7280', textTransform: 'capitalize' }}>▲ {task.priority}</span></td>
                      <td style={{ fontSize: 12, color: overdue ? '#dc2626' : 'var(--text2)', fontWeight: overdue ? 700 : 400 }}>{task.due_date || '—'}{overdue ? ' ⚠' : ''}</td>
                      <td>
                        <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 13 }}>{task.hours_estimated}h</td>
                      <td style={{ textAlign: 'right', fontSize: 13, color: task.hours_logged > task.hours_estimated && task.hours_estimated > 0 ? '#dc2626' : 'var(--text)' }}>{task.hours_logged}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

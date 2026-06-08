import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface TeamMember {
  id: string;
  admin_user_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  permissions: Record<string, boolean>;
  created_at: string;
}

const MODULES = [
  { key: 'customers',         label: 'Customers',           group: 'Sales' },
  { key: 'salesorders',       label: 'Sales Orders',        group: 'Sales' },
  { key: 'invoices',          label: 'Invoices',            group: 'Sales' },
  { key: 'receipts',          label: 'Receipts',            group: 'Sales' },
  { key: 'suppliers',         label: 'Suppliers',           group: 'Purchasing' },
  { key: 'purchaseorders',    label: 'Purchase Orders',     group: 'Purchasing' },
  { key: 'bills',             label: 'Vendor Bills',        group: 'Purchasing' },
  { key: 'payments',          label: 'Payments',            group: 'Purchasing' },
  { key: 'grn',               label: 'Goods Received',      group: 'Purchasing' },
  { key: 'products',          label: 'Products',            group: 'Inventory' },
  { key: 'categories',        label: 'Categories',          group: 'Inventory' },
  { key: 'inventory',         label: 'Stock & Movements',   group: 'Inventory' },
  { key: 'stockadjustments',  label: 'Stock Adjustments',   group: 'Inventory' },
  { key: 'coa',               label: 'Chart of Accounts',   group: 'Accounting' },
  { key: 'expenses',          label: 'Expenses',            group: 'Accounting' },
  { key: 'journal',           label: 'Journal Entries',     group: 'Accounting' },
  { key: 'bankreconciliation',label: 'Bank Reconciliation', group: 'Accounting' },
  { key: 'hr',                label: 'HR & Payroll',        group: 'HR' },
  { key: 'reports',           label: 'Financial Reports',   group: 'Reports' },
  { key: 'analytics',         label: 'Analytics',           group: 'Reports' },
  { key: 'manufacturing',     label: 'BOM & Production',    group: 'Manufacturing' },
  { key: 'pos',               label: 'Point of Sale',       group: 'POS' },
  { key: 'qc',                label: 'Quality Control',     group: 'Operations' },
  { key: 'projects',          label: 'Projects',            group: 'Operations' },
];

const MODULE_GROUPS = Array.from(new Set(MODULES.map(m => m.group)));

const ROLE_PRESETS: Record<string, string[]> = {
  Admin: MODULES.map(m => m.key),
  Accountant: ['customers', 'invoices', 'receipts', 'suppliers', 'bills', 'payments', 'coa', 'expenses', 'journal', 'bankreconciliation', 'reports', 'analytics'],
  Sales: ['customers', 'salesorders', 'invoices', 'receipts', 'products'],
  Purchasing: ['suppliers', 'purchaseorders', 'bills', 'payments', 'grn', 'products'],
  Inventory: ['products', 'categories', 'inventory', 'stockadjustments', 'grn'],
  HR: ['hr'],
  Viewer: ['reports', 'analytics'],
};

const ROLES = Object.keys(ROLE_PRESETS);

const ROLE_COLORS: Record<string, string> = {
  Admin: '#7c3aed', Accountant: '#0284c7', Sales: '#16a34a',
  Purchasing: '#ea580c', Inventory: '#ca8a04', HR: '#db2777', Viewer: '#6b7280',
};

function roleColor(role: string) {
  return ROLE_COLORS[role] || '#6b7280';
}

function presetToMap(role: string): Record<string, boolean> {
  const keys = ROLE_PRESETS[role] || [];
  return Object.fromEntries(MODULES.map(m => [m.key, keys.includes(m.key)]));
}

export default function UserRoles() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<{ type: 'alert' | 'confirm'; msg: string; onOk?: () => void } | null>(null);

  const blank = { name: '', email: '', role: 'Viewer', permissions: presetToMap('Viewer') };
  const [form, setForm] = useState<{ name: string; email: string; role: string; permissions: Record<string, boolean> }>(blank);

  function showAlert(msg: string) { setDialog({ type: 'alert', msg }); }
  function showConfirm(msg: string, onOk: () => void) { setDialog({ type: 'confirm', msg, onOk }); }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('admin_user_id', user.id)
      .order('created_at', { ascending: false });
    setMembers((data || []).map(m => ({
      ...m,
      permissions: m.permissions || {},
    })));
    setLoading(false);
  }

  function openAdd() {
    setEditId(null);
    setForm(blank);
    setShowForm(true);
  }

  function openEdit(m: TeamMember) {
    setEditId(m.id);
    setForm({ name: m.name, email: m.email, role: m.role, permissions: m.permissions || presetToMap(m.role) });
    setShowForm(true);
  }

  function applyPreset(role: string) {
    setForm(f => ({ ...f, role, permissions: presetToMap(role) }));
  }

  function togglePerm(key: string) {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  }

  async function save() {
    if (!form.name.trim()) { showAlert('Name is required.'); return; }
    if (!form.email.trim()) { showAlert('Email is required.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let error;
    if (editId) {
      ({ error } = await supabase.from('team_members')
        .update({ name: form.name.trim(), email: form.email.trim(), role: form.role, permissions: form.permissions })
        .eq('id', editId));
    } else {
      ({ error } = await supabase.from('team_members').insert({
        admin_user_id: user.id,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        permissions: form.permissions,
        is_active: true,
      }));
    }
    setSaving(false);
    if (error) { showAlert('Failed to save: ' + error.message); return; }
    setShowForm(false);
    load();
  }

  async function toggleActive(m: TeamMember) {
    await supabase.from('team_members').update({ is_active: !m.is_active }).eq('id', m.id);
    load();
  }

  function deleteMember(id: string) {
    showConfirm('Delete this team member?', async () => {
      await supabase.from('team_members').delete().eq('id', id);
      load();
    });
  }

  const permCount = (m: TeamMember) => Object.values(m.permissions).filter(Boolean).length;

  return (
    <div className="page-wrap">
      {dialog && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>{dialog.msg}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && (
                <button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              )}
              <button className="btn btn-primary" onClick={() => { dialog.onOk?.(); setDialog(null); }}>OK</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Users & Roles</h1>
          <p className="page-subtitle">Manage team members and their module permissions</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Member</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Members', value: members.length },
          { label: 'Active', value: members.filter(m => m.is_active).length },
          { label: 'Inactive', value: members.filter(m => !m.is_active).length },
          { label: 'Roles Used', value: new Set(members.map(m => m.role)).size },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 22px', minWidth: 130 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Role Presets legend */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role Presets</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ROLES.map(r => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleColor(r), display: 'inline-block' }} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{(ROLE_PRESETS[r] || []).length} modules</span>
            </div>
          ))}
        </div>
      </div>

      {/* Members table */}
      <div className="table-wrap">
        <div className="table-toolbar"><h3>Team Members ({members.length})</h3></div>
        {loading ? <div className="empty-state">Loading...</div> : members.length === 0 ? (
          <div className="empty-state">No team members yet. Add your first member above.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{m.email}</td>
                  <td>
                    <span style={{ background: roleColor(m.role) + '22', color: roleColor(m.role), border: `1px solid ${roleColor(m.role)}44`, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                      {m.role}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {permCount(m)} / {MODULES.length} modules
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 600, color: m.is_active ? '#16a34a' : '#dc2626' }}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(m)}>{m.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteMember(m.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{editId ? 'Edit Member' : 'Add Team Member'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Silva" />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.lk" disabled={!!editId} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Role</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ROLES.map(r => (
                  <button key={r}
                    onClick={() => applyPreset(r)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${form.role === r ? roleColor(r) : 'var(--border)'}`, background: form.role === r ? roleColor(r) + '18' : 'var(--bg)', color: form.role === r ? roleColor(r) : 'var(--text)', fontWeight: form.role === r ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
                    {r}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Selecting a role auto-fills permissions below. You can customise further.</div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ marginBottom: 12 }}>Module Permissions</label>
              {MODULE_GROUPS.map(group => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{group}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {MODULES.filter(m => m.group === group).map(mod => (
                      <label key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 10px', borderRadius: 7, border: `1px solid ${form.permissions[mod.key] ? 'var(--brand)' : 'var(--border)'}`, background: form.permissions[mod.key] ? 'rgba(124,58,237,0.08)' : 'var(--bg)', userSelect: 'none' }}>
                        <input type="checkbox" checked={!!form.permissions[mod.key]} onChange={() => togglePerm(mod.key)} style={{ accentColor: 'var(--brand)' }} />
                        <span style={{ fontSize: 12, fontWeight: form.permissions[mod.key] ? 600 : 400 }}>{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Member'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

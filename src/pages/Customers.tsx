import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: number;
  balance: number;
  created_at: string;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    credit_limit: '0',
  });
  const [saving, setSaving] = useState(false);
  const [portalDialog, setPortalDialog] = useState<{ customerId: string; customerName: string } | null>(null);
  const [portalEmail, setPortalEmail] = useState('');
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalMsg, setPortalMsg] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    setCustomers(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      credit_limit: String(c.credit_limit || 0),
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Customer name is required');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (editing) {
      await supabase
        .from('customers')
        .update({
          name: form.name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          credit_limit: parseFloat(form.credit_limit) || 0,
        })
        .eq('id', editing.id);
    } else {
      const code = 'CUST-' + String(Date.now()).slice(-4);
      await supabase.from('customers').insert({
        user_id: user.id,
        customer_code: code,
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        credit_limit: parseFloat(form.credit_limit) || 0,
        balance: 0,
      });
    }
    setSaving(false);
    setShowForm(false);
    loadCustomers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    loadCustomers();
  }

  async function grantPortalAccess() {
    if (!portalEmail.trim() || !portalDialog) return;
    setPortalSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('customer_portal_users').upsert({
      customer_id: portalDialog.customerId,
      invite_email: portalEmail.trim().toLowerCase(),
      admin_user_id: user.id,
      is_active: true,
      user_id: null,
    }, { onConflict: 'invite_email' });
    setPortalSaving(false);
    if (error) { setPortalMsg('Error: ' + error.message); return; }
    setPortalMsg('✓ Portal access granted. They can now sign up / log in with ' + portalEmail.trim());
  }

  function openPortalDialog(c: Customer) {
    setPortalDialog({ customerId: c.id, customerName: c.name });
    setPortalEmail(c.email || '');
    setPortalMsg('');
  }

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search)
  );

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-sub">{customers.length} total customers</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
        >
          {showForm ? 'Close' : '+ Add Customer'}
        </button>
      </div>
      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">
              {editing ? 'Edit Customer' : 'Add New Customer'}
            </div>
            <button
              className="modal-close"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group full">
                <label>Customer Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. ABC Company"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  placeholder="email@company.lk"
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value })
                  }
                  placeholder="+94 XX XXX XXXX"
                />
              </div>
              <div className="form-group full">
                <label>Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  placeholder="Street, City"
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>Credit Limit (LKR)</label>
                <input
                  type="number"
                  value={form.credit_limit}
                  onChange={(e) =>
                    setForm({ ...form, credit_limit: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : editing
                ? 'Save Changes'
                : 'Add Customer'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Customers</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <h3>{search ? 'No customers found' : 'No customers yet'}</h3>
            <p>
              {search
                ? 'Try a different search'
                : 'Add your first customer to get started'}
            </p>
            {!search && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
                onClick={openAdd}
              >
                + Add Customer
              </button>
            )}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Credit Limit</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text3)', fontSize: '12px' }}>
                    {c.customer_code}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ color: 'var(--text2)' }}>{c.email || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{c.phone || '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(c.credit_limit)}
                  </td>
                  <td>
                    <span
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: c.balance > 0 ? 'var(--blue)' : 'var(--text)',
                      }}
                    >
                      {fmt(c.balance)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openPortalDialog(c)}
                        title="Grant Customer Portal Access"
                      >
                        Portal
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(c.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Portal Access Dialog */}
      {portalDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 440, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Grant Customer Portal Access</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setPortalDialog(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              Customer: <strong>{portalDialog.customerName}</strong><br />
              Enter the email address they will use to log in. They can sign up or sign in with this email to access their portal.
            </p>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Login Email *</label>
              <input className="form-input" type="email" value={portalEmail} onChange={e => setPortalEmail(e.target.value)} placeholder="customer@example.com" />
            </div>
            {portalMsg && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: portalMsg.startsWith('✓') ? '#dcfce7' : '#fee2e2', color: portalMsg.startsWith('✓') ? '#16a34a' : '#dc2626', fontSize: 13, marginBottom: 12 }}>
                {portalMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPortalDialog(null)}>Close</button>
              <button className="btn btn-primary" onClick={grantPortalAccess} disabled={portalSaving || !portalEmail.trim()}>
                {portalSaving ? 'Saving...' : 'Grant Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
    </div>
  );
}

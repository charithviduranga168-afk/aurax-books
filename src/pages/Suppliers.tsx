import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: number;
  balance: number;
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    credit_limit: '0',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    setSuppliers(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      email: s.email || '',
      phone: s.phone || '',
      address: s.address || '',
      credit_limit: String(s.credit_limit || 0),
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Supplier name is required');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase
        .from('suppliers')
        .update({
          name: form.name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          credit_limit: parseFloat(form.credit_limit) || 0,
        })
        .eq('id', editing.id);
    } else {
      await supabase.from('suppliers').insert({
        user_id: user.id,
        supplier_code: 'SUPP-' + String(Date.now()).slice(-4),
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
    loadSuppliers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this supplier?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    loadSuppliers();
  }

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || '').includes(search)
  );

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Suppliers</div>
          <div className="page-sub">{suppliers.length} total suppliers</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
        >
          {showForm ? 'Close' : '+ Add Supplier'}
        </button>
      </div>
      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">
              {editing ? 'Edit Supplier' : 'Add New Supplier'}
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
                <label>Supplier Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. XYZ Traders"
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
                  placeholder="email@supplier.lk"
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
                : 'Add Supplier'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Suppliers</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Search suppliers..."
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
            <div className="empty-state-icon">🏭</div>
            <h3>{search ? 'No suppliers found' : 'No suppliers yet'}</h3>
            <p>
              {search
                ? 'Try a different search'
                : 'Add your first supplier to get started'}
            </p>
            {!search && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
                onClick={openAdd}
              >
                + Add Supplier
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
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text3)', fontSize: '12px' }}>
                    {s.supplier_code}
                  </td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: 'var(--text2)' }}>{s.email || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{s.phone || '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(s.credit_limit)}
                  </td>
                  <td
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                      color: s.balance > 0 ? 'var(--red)' : 'var(--text)',
                    }}
                  >
                    {fmt(s.balance)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(s)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(s.id)}
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

    </div>
  );
}

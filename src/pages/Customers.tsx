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
  const [showModal, setShowModal] = useState(false);
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
    setShowModal(true);
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
    setShowModal(true);
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
    setShowModal(false);
    loadCustomers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    loadCustomers();
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
        <button className="btn btn-primary" onClick={openAdd}>
          + Add Customer
        </button>
      </div>

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

      {/* Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">
                {editing ? 'Edit Customer' : 'Add New Customer'}
              </div>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
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
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
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
        </div>
      )}
    </div>
  );
}

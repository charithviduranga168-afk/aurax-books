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

interface Props {
  onBack: () => void;
}

const fmt = (n: number) =>
  'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Back button ───────────────────────────────────────────────────
function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text2)', fontSize: 13, fontWeight: 600,
        padding: '0 0 22px 0', transition: 'color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text2)')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
      </svg>
      {label}
    </button>
  );
}

// ── Avatar circle ─────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: 'white',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {initials(name)}
    </div>
  );
}

// ── Customer Detail ───────────────────────────────────────────────
function CustomerDetail({
  customer,
  onBack,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [portalEmail, setPortalEmail] = useState(customer.email || '');
  const [portalMsg, setPortalMsg] = useState('');
  const [portalSaving, setPortalSaving] = useState(false);
  const [showPortal, setShowPortal] = useState(false);

  useEffect(() => {
    setLoadingData(true);
    Promise.all([
      supabase.from('invoices').select('id,invoice_number,invoice_date,total,paid,status').eq('customer_id', customer.id).order('invoice_date', { ascending: false }).limit(20),
      supabase.from('receipts').select('id,receipt_number,receipt_date,amount,payment_method').eq('customer_id', customer.id).order('receipt_date', { ascending: false }).limit(20),
    ]).then(([inv, rec]) => {
      setInvoices(inv.data || []);
      setReceipts(rec.data || []);
      setLoadingData(false);
    });
  }, [customer.id]);

  async function grantPortal() {
    if (!portalEmail.trim()) return;
    setPortalSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('customer_portal_users').upsert({
      customer_id: customer.id,
      invite_email: portalEmail.trim().toLowerCase(),
      admin_user_id: user.id,
      is_active: true,
      user_id: null,
    }, { onConflict: 'invite_email' });
    setPortalSaving(false);
    setPortalMsg(error ? ('Error: ' + error.message) : '✓ Portal access granted for ' + portalEmail.trim());
  }

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paid || 0), 0);
  const outstanding = totalInvoiced - totalPaid;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <BackBtn label="Back to Customers" onClick={onBack} />

      {/* Hero */}
      <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Avatar name={customer.name} size={64} />
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.4px', marginBottom: 6 }}>
                {customer.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-purple">{customer.customer_code}</span>
                {customer.email && (
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>✉&nbsp;{customer.email}</span>
                )}
                {customer.phone && (
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>📞&nbsp;{customer.phone}</span>
                )}
                {customer.address && (
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>📍&nbsp;{customer.address}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPortal(!showPortal)}>🌐 Portal</button>
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
          </div>
        </div>

        {/* Portal access inline */}
        {showPortal && (
          <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Grant Customer Portal Access</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="email" value={portalEmail} onChange={e => setPortalEmail(e.target.value)}
                placeholder="customer@example.com"
                style={{ flex: 1, maxWidth: 320 }}
              />
              <button className="btn btn-primary btn-sm" onClick={grantPortal} disabled={portalSaving || !portalEmail.trim()}>
                {portalSaving ? 'Saving...' : 'Grant Access'}
              </button>
            </div>
            {portalMsg && (
              <div style={{ marginTop: 8, fontSize: 13, color: portalMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{portalMsg}</div>
            )}
          </div>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Invoiced', value: fmt(totalInvoiced), color: '#7c3aed' },
          { label: 'Total Paid', value: fmt(totalPaid), color: '#10b981' },
          { label: 'Outstanding', value: fmt(outstanding), color: outstanding > 0 ? '#ef4444' : '#10b981' },
          { label: 'Credit Limit', value: fmt(customer.credit_limit), color: '#3b82f6' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="table-wrap">
        <div className="table-toolbar">
          <div style={{ display: 'flex', gap: 4 }}>
            {(['invoices', 'payments'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '7px 16px', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: tab === t ? 'var(--brand-light)' : 'transparent',
                color: tab === t ? 'var(--brand)' : 'var(--text2)',
                transition: 'all 0.15s',
              }}>
                {t === 'invoices' ? `Invoices (${invoices.length})` : `Payments (${receipts.length})`}
              </button>
            ))}
          </div>
        </div>

        {loadingData ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : tab === 'invoices' ? (
          invoices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <h3>No invoices yet</h3>
              <p>Invoices for this customer will appear here</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Invoice #</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{inv.invoice_date || '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.total)}</td>
                    <td style={{ color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.paid)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt((inv.total || 0) - (inv.paid || 0))}</td>
                    <td>
                      <span className={`badge badge-${inv.status === 'paid' ? 'green' : inv.status === 'partial' ? 'yellow' : 'red'}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          receipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💳</div>
              <h3>No payments yet</h3>
              <p>Payments received from this customer will appear here</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Receipt #</th><th>Date</th><th>Amount</th><th>Method</th></tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{r.receipt_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.receipt_date || '—'}</td>
                    <td style={{ color: 'var(--green)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.payment_method || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

// ── Customers List ────────────────────────────────────────────────
export default function Customers({ onBack }: Props) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Customer | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name');
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
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', credit_limit: String(c.credit_limit || 0) });
    setShowForm(true);
    if (view === 'detail') setView('list'); // go to list to show form
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Customer name is required');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase.from('customers').update({ name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0 }).eq('id', editing.id);
    } else {
      await supabase.from('customers').insert({ user_id: user.id, customer_code: 'CUST-' + String(Date.now()).slice(-4), name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0, balance: 0 });
    }
    setSaving(false);
    setShowForm(false);
    loadCustomers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return;
    await supabase.from('customers').delete().eq('id', id);
    if (view === 'detail') setView('list');
    loadCustomers();
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  // ── Detail view ──
  if (view === 'detail' && selected) {
    return (
      <CustomerDetail
        customer={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onEdit={() => openEdit(selected)}
        onDelete={() => handleDelete(selected.id)}
      />
    );
  }

  // ── List view ──
  return (
    <div>
      <BackBtn label="Dashboard" onClick={onBack} />

      <div className="page-header">
        <div>
          <div className="page-title">Customers</div>
          <div className="page-sub">{customers.length} total customers</div>
        </div>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : openAdd())}>
          {showForm ? 'Close' : '+ Add Customer'}
        </button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">{editing ? 'Edit Customer' : 'Add New Customer'}</div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group full">
                <label>Customer Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. ABC Company" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@company.lk" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+94 XX XXX XXXX" />
              </div>
              <div className="form-group full">
                <label>Address</label>
                <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, City" rows={2} />
              </div>
              <div className="form-group">
                <label>Credit Limit (LKR)</label>
                <input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} placeholder="0" />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Customers</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <h3>{search ? 'No customers found' : 'No customers yet'}</h3>
            <p>{search ? 'Try a different search' : 'Add your first customer to get started'}</p>
            {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>+ Add Customer</button>}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Customer</th><th>Contact</th><th>Credit Limit</th><th>Balance</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  onClick={() => { setSelected(c); setView('detail'); }}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar name={c.name} size={34} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text1)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{c.customer_code}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{c.email || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{c.phone || ''}</div>
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' }}>{fmt(c.credit_limit)}</td>
                  <td>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: c.balance > 0 ? 'var(--blue)' : 'var(--text1)' }}>
                      {fmt(c.balance)}
                    </span>
                  </td>
                  <td style={{ width: 32, textAlign: 'right' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
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

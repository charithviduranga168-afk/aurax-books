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

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2'];
  const bg = colors[(name?.charCodeAt(0) || 0) % colors.length];
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

export default function Suppliers() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Supplier | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
  const [saving, setSaving] = useState(false);

  // Detail view data
  const [detailTab, setDetailTab] = useState<'orders' | 'bills' | 'payments'>('bills');
  const [detailBills, setDetailBills] = useState<any[]>([]);
  const [detailPOs, setDetailPOs] = useState<any[]>([]);
  const [detailPayments, setDetailPayments] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailKpi, setDetailKpi] = useState({ totalBilled: 0, totalPaid: 0, outstanding: 0 });

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('suppliers').select('*').eq('user_id', user.id).order('name');
    setSuppliers(data || []);
    setLoading(false);
  }

  async function loadDetail(s: Supplier) {
    setDetailLoading(true);
    const [billRes, poRes, payRes] = await Promise.all([
      supabase.from('bills').select('*').eq('supplier_id', s.id).order('date', { ascending: false }).limit(20),
      supabase.from('purchase_orders').select('*').eq('supplier_id', s.id).order('date', { ascending: false }).limit(20),
      supabase.from('payments').select('*').eq('supplier_id', s.id).order('date', { ascending: false }).limit(20),
    ]);
    const bills = billRes.data || [];
    const payments = payRes.data || [];
    const totalBilled = bills.reduce((s, b) => s + (b.total || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    setDetailBills(bills);
    setDetailPOs(poRes.data || []);
    setDetailPayments(payments);
    setDetailKpi({ totalBilled, totalPaid, outstanding: totalBilled - totalPaid });
    setDetailLoading(false);
  }

  function openDetail(s: Supplier) {
    setSelected(s);
    setView('detail');
    setDetailTab('bills');
    loadDetail(s);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '', credit_limit: '0' });
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, email: s.email || '', phone: s.phone || '', address: s.address || '', credit_limit: String(s.credit_limit || 0) });
    setShowForm(true);
    if (view === 'detail') setView('list');
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Supplier name is required');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase.from('suppliers').update({ name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0 }).eq('id', editing.id);
    } else {
      await supabase.from('suppliers').insert({ user_id: user.id, supplier_code: 'SUPP-' + String(Date.now()).slice(-4), name: form.name, email: form.email, phone: form.phone, address: form.address, credit_limit: parseFloat(form.credit_limit) || 0, balance: 0 });
    }
    setSaving(false);
    setShowForm(false);
    loadSuppliers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this supplier?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    if (view === 'detail') setView('list');
    loadSuppliers();
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || '').includes(search)
  );

  // ── Detail view ──
  if (view === 'detail' && selected) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <BackBtn label="Back to Suppliers" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero */}
        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <Avatar name={selected.name} size={64} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.4px', marginBottom: 6 }}>{selected.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  <span className="badge badge-purple">{selected.supplier_code}</span>
                  {selected.email && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{selected.email}</span>}
                  {selected.phone && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{selected.phone}</span>}
                  {selected.address && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{selected.address}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected.id)}>Delete</button>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Total Billed', value: fmt(detailKpi.totalBilled), color: '#7c3aed' },
            { label: 'Total Paid', value: fmt(detailKpi.totalPaid), color: '#059669' },
            { label: 'Outstanding', value: fmt(detailKpi.outstanding), color: detailKpi.outstanding > 0 ? '#dc2626' : '#059669' },
            { label: 'Credit Limit', value: fmt(selected.credit_limit), color: '#2563eb' },
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
              {(['orders', 'bills', 'payments'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)} style={{
                  padding: '7px 16px', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: detailTab === t ? 'var(--brand-light)' : 'transparent',
                  color: detailTab === t ? 'var(--brand)' : 'var(--text2)',
                }}>
                  {t === 'orders' ? `Purchase Orders (${detailPOs.length})` : t === 'bills' ? `Bills (${detailBills.length})` : `Payments (${detailPayments.length})`}
                </button>
              ))}
            </div>
          </div>

          {detailLoading ? (
            <div className="empty-state"><p>Loading...</p></div>
          ) : detailTab === 'orders' ? (
            detailPOs.length === 0 ? (
              <div className="empty-state"><h3>No purchase orders yet</h3></div>
            ) : (
              <table>
                <thead><tr><th>PO #</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {detailPOs.map(po => (
                    <tr key={po.id}>
                      <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{po.po_number}</td>
                      <td style={{ color: 'var(--text2)' }}>{po.date}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(po.total)}</td>
                      <td><span className="badge badge-purple">{po.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : detailTab === 'bills' ? (
            detailBills.length === 0 ? (
              <div className="empty-state"><h3>No bills yet</h3></div>
            ) : (
              <table>
                <thead><tr><th>Bill #</th><th>Date</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {detailBills.map(b => (
                    <tr key={b.id}>
                      <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{b.bill_number}</td>
                      <td style={{ color: 'var(--text2)' }}>{b.date}</td>
                      <td style={{ color: new Date(b.due_date) < new Date() && b.status !== 'Paid' ? 'var(--red)' : 'var(--text2)' }}>{b.due_date}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(b.total)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(b.balance)}</td>
                      <td><span className={`badge ${b.status === 'Paid' ? 'badge-green' : b.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{b.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            detailPayments.length === 0 ? (
              <div className="empty-state"><h3>No payments yet</h3></div>
            ) : (
              <table>
                <thead><tr><th>Payment #</th><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                <tbody>
                  {detailPayments.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{p.payment_number}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.date}</td>
                      <td style={{ color: '#dc2626', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.payment_method || '—'}</td>
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

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Suppliers</div>
          <div className="page-sub">{suppliers.length} total suppliers</div>
        </div>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : openAdd())}>
          {showForm ? 'Close' : '+ Add Supplier'}
        </button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">{editing ? 'Edit Supplier' : 'Add New Supplier'}</div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group full">
                <label>Supplier Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. XYZ Traders" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@supplier.lk" />
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
                <input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Supplier'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Suppliers</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{search ? 'No suppliers found' : 'No suppliers yet'}</h3>
            <p>{search ? 'Try a different search' : 'Add your first supplier to get started'}</p>
            {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>+ Add Supplier</button>}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Email</th><th>Phone</th><th>Credit Limit</th><th>Balance</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} onClick={() => openDetail(s)} style={{ cursor: 'pointer' }}>
                  <td style={{ color: 'var(--text3)', fontSize: '12px' }}>{s.supplier_code}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={s.name} size={32} />
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{s.email || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{s.phone || '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(s.credit_limit)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: s.balance > 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(s.balance)}</td>
                  <td style={{ width: 32, textAlign: 'right' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}>
                      <polyline points="9 18 15 12 9 6" />
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

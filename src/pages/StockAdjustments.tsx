import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Product { id: string; name: string; stock_qty: number; }
interface Adjustment {
  id: string; reference: string; date: string;
  product_name: string; adjustment_type: string;
  quantity: number; before_qty: number; after_qty: number;
  reason: string; notes: string;
}

const REASONS = ['Count Correction', 'Damage', 'Expiry', 'Theft / Loss', 'Return to Supplier', 'Sample / Tester', 'Transfer', 'Opening Stock', 'Other'];
const TYPES = [
  { value: 'Add',   label: 'Add Stock',    color: '#16a34a', bg: 'rgba(34,197,94,0.08)',  desc: 'Increase stock quantity' },
  { value: 'Remove',label: 'Remove Stock', color: '#dc2626', bg: 'rgba(239,68,68,0.08)',  desc: 'Decrease stock quantity' },
  { value: 'Count', label: 'Set Count',    color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', desc: 'Set stock to exact number' },
];

export default function StockAdjustments() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    product_id: '',
    adjustment_type: 'Add',
    quantity: '',
    reason: 'Count Correction',
    notes: '',
  });

  const [dialog, setDialog] = useState<{ msg: string; type: 'alert' | 'confirm'; onOk?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ msg, type: 'alert' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [adjRes, prodRes] = await Promise.all([
      supabase.from('stock_adjustments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('products').select('id,name,stock_qty').eq('user_id', user.id).order('name'),
    ]);
    setAdjustments(adjRes.data || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  }

  function generateRef(existing: Adjustment[]) {
    if (!existing.length) return 'ADJ-0001';
    const max = Math.max(0, ...existing.map((a) => { const m = a.reference?.match(/(\d+)$/); return m ? +m[1] : 0; }));
    return 'ADJ-' + String(max + 1).padStart(4, '0');
  }

  async function handleSave() {
    if (!form.product_id) { showAlert('Please select a product.'); return; }
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) { showAlert('Quantity must be greater than zero.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const product = products.find((p) => p.id === form.product_id);
    if (!product) { setSaving(false); return; }

    const before = product.stock_qty || 0;
    let after: number;
    if (form.adjustment_type === 'Add')    after = before + qty;
    else if (form.adjustment_type === 'Remove') after = Math.max(0, before - qty);
    else after = qty; // Count

    const ref = generateRef(adjustments);

    const { error } = await supabase.from('stock_adjustments').insert({
      user_id: user.id,
      reference: ref,
      date: form.date,
      product_id: form.product_id,
      product_name: product.name,
      adjustment_type: form.adjustment_type,
      quantity: qty,
      before_qty: before,
      after_qty: after,
      reason: form.reason,
      notes: form.notes,
    });

    if (error) { showAlert('Failed to save: ' + error.message); setSaving(false); return; }

    // Update product stock
    await supabase.from('products').update({ stock_qty: after }).eq('id', form.product_id);

    setSaving(false);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], product_id: '', adjustment_type: 'Add', quantity: '', reason: 'Count Correction', notes: '' });
    loadData();
  }

  const selectedProduct = products.find((p) => p.id === form.product_id);
  const qty = parseFloat(form.quantity) || 0;
  const previewAfter = !selectedProduct ? null
    : form.adjustment_type === 'Add'    ? (selectedProduct.stock_qty || 0) + qty
    : form.adjustment_type === 'Remove' ? Math.max(0, (selectedProduct.stock_qty || 0) - qty)
    : qty;

  const filtered = adjustments.filter((a) => {
    const matchSearch = !search || a.product_name.toLowerCase().includes(search.toLowerCase()) || a.reference.toLowerCase().includes(search.toLowerCase());
    const matchType = !filterType || a.adjustment_type === filterType;
    return matchSearch && matchType;
  });

  const todayAdj = adjustments.filter((a) => a.date === new Date().toISOString().split('T')[0]);
  const totalAdded   = adjustments.filter((a) => a.adjustment_type === 'Add').reduce((s, a) => s + a.quantity, 0);
  const totalRemoved = adjustments.filter((a) => a.adjustment_type === 'Remove').reduce((s, a) => s + a.quantity, 0);

  const sectionLabel = { fontSize: '13px', fontWeight: 700, color: 'var(--brand)', marginBottom: '16px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      {dialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 360, padding: '28px 24px' }}>
            <p style={{ margin: '0 0 20px', fontSize: '14px' }}>{dialog.msg}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && <button className="btn btn-danger" onClick={() => { dialog.onOk?.(); setDialog(null); }}>Confirm</button>}
              <button className="btn btn-secondary" onClick={() => setDialog(null)}>{dialog.type === 'alert' ? 'OK' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Stock Adjustments</div>
          <div className="page-sub">Correct stock counts, write-offs, and manual adjustments</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Adjustment'}
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Adjustments', value: adjustments.length, color: 'var(--brand)' },
          { label: "Today's Adjustments", value: todayAdj.length, color: '#2563eb' },
          { label: 'Total Units Added', value: totalAdded.toLocaleString(), color: '#16a34a' },
          { label: 'Total Units Removed', value: totalRemoved.toLocaleString(), color: '#dc2626' },
        ].map((k) => (
          <div key={k.label} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* New Adjustment Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={sectionLabel}>New Stock Adjustment</div>

          {/* Type selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
            {TYPES.map((t) => (
              <button key={t.value} onClick={() => setForm({ ...form, adjustment_type: t.value })}
                style={{ padding: '14px 12px', borderRadius: 10, border: `2px solid ${form.adjustment_type === t.value ? t.color : 'var(--border)'}`, background: form.adjustment_type === t.value ? t.bg : 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: t.color, marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.desc}</div>
              </button>
            ))}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Product *</label>
              <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                <option value="">— Select Product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (Current: {p.stock_qty})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{form.adjustment_type === 'Count' ? 'Set Stock To *' : 'Quantity *'}</label>
              <input type="number" min="0.001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Reason</label>
              <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group full">
              <label>Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional internal notes" />
            </div>
          </div>

          {/* Preview */}
          {selectedProduct && qty > 0 && (
            <div style={{ margin: '16px 0', padding: '14px 18px', background: 'var(--bg2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Before</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedProduct.stock_qty}</div>
              </div>
              <div style={{ fontSize: 24, color: 'var(--text3)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>After</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: form.adjustment_type === 'Add' ? '#16a34a' : form.adjustment_type === 'Remove' ? '#dc2626' : 'var(--brand)' }}>{previewAfter}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedProduct.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {form.adjustment_type === 'Add' ? `+${qty} units` : form.adjustment_type === 'Remove' ? `-${qty} units` : `Set to ${qty} units`}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Adjustment'}</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>Adjustment History</h3>
          <div className="table-actions">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ minWidth: 130 }}>
              <option value="">All Types</option>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input placeholder="Search product / ref..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <h3>No adjustments yet</h3>
            <p>Create your first stock adjustment to track inventory corrections</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reference</th><th>Date</th><th>Product</th><th>Type</th>
                <th>Before</th><th>Change</th><th>After</th><th>Reason</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const t = TYPES.find((t) => t.value === a.adjustment_type)!;
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{a.reference}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 13 }}>{a.date}</td>
                    <td style={{ fontWeight: 500 }}>{a.product_name}</td>
                    <td>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: t?.bg, color: t?.color }}>
                        {a.adjustment_type}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text2)' }}>{a.before_qty}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: t?.color }}>
                      {a.adjustment_type === 'Add' ? `+${a.quantity}` : a.adjustment_type === 'Remove' ? `-${a.quantity}` : `→${a.quantity}`}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{a.after_qty}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{a.reason}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

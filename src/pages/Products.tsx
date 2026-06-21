import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Product {
  id: string;
  product_code: string;
  name: string;
  category: string;
  type: string;
  sales_price: number;
  cost_price: number;
  stock_qty: number;
  reorder_level: number;
  unit: string;
  notes: string;
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2'];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.22, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.38, flexShrink: 0, letterSpacing: '-0.02em' }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: '',
    type: 'Stock Item',
    sales_price: '0',
    cost_price: '0',
    stock_qty: '0',
    reorder_level: '0',
    unit: 'Pcs',
    notes: '',
  });

  // list→detail state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'details' | 'stock'>('details');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('name').eq('user_id', user.id).eq('type', 'Product').order('name'),
    ]);
    setProducts(prodRes.data || []);
    setCategories((catRes.data || []).map((c: any) => c.name));
    setLoading(false);
  }

  async function openDetail(p: Product) {
    setSelected(p);
    setDetailTab('details');
    // Load stock movements from invoice_lines (sales) and grn_lines (purchases)
    const [{ data: salesLines }, { data: grnLines }] = await Promise.all([
      supabase.from('invoice_lines').select('*, invoices(invoice_number, date, status)').eq('product_id', p.id),
      supabase.from('grn_lines').select('*, grn_headers(grn_number, date, status)').eq('product_id', p.id),
    ]);
    const movements: any[] = [];
    (salesLines || []).forEach((l: any) => {
      movements.push({ date: l.invoices?.date, ref: l.invoices?.invoice_number, type: 'Sale', qty: -(l.qty || 0), cost: l.unit_price || 0 });
    });
    (grnLines || []).forEach((l: any) => {
      movements.push({ date: l.grn_headers?.date, ref: l.grn_headers?.grn_number, type: 'Receipt', qty: l.received_qty || 0, cost: l.unit_cost || 0 });
    });
    movements.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    setStockMovements(movements);
    setView('detail');
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', category: '', type: 'Stock Item', sales_price: '0', cost_price: '0', stock_qty: '0', reorder_level: '0', unit: 'Pcs', notes: '' });
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, category: p.category || '', type: p.type || 'Stock Item', sales_price: String(p.sales_price || 0), cost_price: String(p.cost_price || 0), stock_qty: String(p.stock_qty || 0), reorder_level: String(p.reorder_level || 0), unit: p.unit || 'Pcs', notes: p.notes || '' });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Product name is required');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { name: form.name, category: form.category, type: form.type, sales_price: parseFloat(form.sales_price) || 0, cost_price: parseFloat(form.cost_price) || 0, stock_qty: parseFloat(form.stock_qty) || 0, reorder_level: parseFloat(form.reorder_level) || 0, unit: form.unit, notes: form.notes };
    if (editing) {
      await supabase.from('products').update(payload).eq('id', editing.id);
      // Refresh detail if we're in detail view
      if (view === 'detail' && selected?.id === editing.id) {
        setSelected({ ...selected, ...payload });
      }
    } else {
      await supabase.from('products').insert({ ...payload, user_id: user.id, product_code: 'PROD-' + String(Date.now()).slice(-4) });
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
    if (view === 'detail' && selected?.id === id) { setView('list'); setSelected(null); }
    loadData();
  }

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase()) || (p.product_code || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const lowStock = products.filter(p => p.type !== 'Service' && p.stock_qty <= p.reorder_level).length;

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    background: active ? 'var(--brand)' : 'var(--bg2)',
    color: active ? '#fff' : 'var(--text2)',
    border: active ? 'none' : '1px solid var(--border)',
  });

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const p = selected;
    const isLowStock = p.type !== 'Service' && p.stock_qty <= p.reorder_level;
    const stockValue = (p.stock_qty || 0) * (p.cost_price || 0);
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <BackBtn label="Back to Products" onClick={() => { setView('list'); setSelected(null); setShowForm(false); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Avatar name={p.name} size={64} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)', marginBottom: 6 }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {p.product_code && <span className="badge badge-blue">{p.product_code}</span>}
                  <span className="badge badge-purple">{p.type}</span>
                  {p.category && <span className="badge badge-blue">{p.category}</span>}
                  {isLowStock && <span className="badge badge-red">Low Stock</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>Unit: {p.unit}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-color': '#16a34a' } as any}>
            <div className="kpi-label">Sales Price</div>
            <div className="kpi-value" style={{ fontSize: 15 }}>{fmt(p.sales_price)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#7c3aed' } as any}>
            <div className="kpi-label">Cost Price</div>
            <div className="kpi-value" style={{ fontSize: 15 }}>{fmt(p.cost_price)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': isLowStock ? '#dc2626' : '#2e90fa' } as any}>
            <div className="kpi-label">Stock Qty</div>
            <div className="kpi-value" style={{ color: isLowStock ? '#dc2626' : undefined }}>{p.stock_qty} {p.unit}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#d97706' } as any}>
            <div className="kpi-label">Stock Value</div>
            <div className="kpi-value" style={{ fontSize: 15 }}>{fmt(stockValue)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={tabStyle(detailTab === 'details')} onClick={() => setDetailTab('details')}>Details</button>
          <button style={tabStyle(detailTab === 'stock')} onClick={() => setDetailTab('stock')}>Stock Movements ({stockMovements.length})</button>
        </div>

        {detailTab === 'details' && (
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'Product Code', value: p.product_code || '—' },
                { label: 'Category', value: p.category || '—' },
                { label: 'Type', value: p.type },
                { label: 'Unit', value: p.unit },
                { label: 'Reorder Level', value: String(p.reorder_level) },
                { label: 'Margin', value: p.sales_price > 0 ? Math.round(((p.sales_price - p.cost_price) / p.sales_price) * 100) + '%' : '—' },
              ].map(f => (
                <div key={f.label} style={{ padding: '12px', background: 'var(--bg3)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600, marginBottom: '4px' }}>{f.label}</div>
                  <div style={{ fontWeight: 700 }}>{f.value}</div>
                </div>
              ))}
            </div>
            {p.notes && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
                <strong>Notes:</strong> {p.notes}
              </div>
            )}
          </div>
        )}

        {detailTab === 'stock' && (
          <div className="table-wrap">
            {stockMovements.length === 0 ? (
              <div className="empty-state">
                <h3>No movements yet</h3>
                <p>Stock movements appear here when invoices or GRNs are created for this product.</p>
              </div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th style={{ textAlign: 'right' }}>Qty Change</th><th style={{ textAlign: 'right' }}>Unit Cost</th></tr></thead>
                <tbody>
                  {stockMovements.map((m, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text2)' }}>{m.date || '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{m.ref}</td>
                      <td><span className={`badge ${m.type === 'Sale' ? 'badge-red' : 'badge-green'}`}>{m.type}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: m.qty < 0 ? 'var(--red)' : '#16a34a' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{fmt(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{editing ? 'Edit Product' : 'Add Product'}</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
              </div>
              {renderForm()}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderForm() {
    return (
      <>
        <div className="form-grid">
          <div className="form-group full">
            <label>Product Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office Chair" />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="">— Select Category —</option>
              {categories.map(c => <option key={c}>{c}</option>)}
              <option value="__new__">+ Add new category...</option>
            </select>
            {form.category === '__new__' && <input style={{ marginTop: '6px' }} placeholder="Type new category name" onChange={e => setForm({ ...form, category: e.target.value })} />}
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option>Stock Item</option>
              <option>Service</option>
              <option>Raw Material</option>
              <option>Finished Good</option>
            </select>
          </div>
          <div className="form-group">
            <label>Sales Price (LKR)</label>
            <input type="number" value={form.sales_price} onChange={e => setForm({ ...form, sales_price: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Cost Price (LKR)</label>
            <input type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} />
            <span style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>Starting cost. Recalculated automatically when goods are received.</span>
          </div>
          <div className="form-group">
            <label>Opening Stock Qty</label>
            <input type="number" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Reorder Level</label>
            <input type="number" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Unit</label>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              <option>Pcs</option><option>Kg</option><option>L</option><option>M</option><option>Box</option><option>Pack</option><option>Set</option><option>Unit</option>
            </select>
          </div>
          <div className="form-group full">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Product'}</button>
        </div>
      </>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Products</div>
          <div className="page-sub">
            {products.length} products{lowStock > 0 && <span className="badge badge-red" style={{ marginLeft: '8px' }}>{lowStock} low stock</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : openAdd())}>{showForm ? 'Close' : '+ Add Product'}</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">{editing ? 'Edit Product' : 'Add New Product'}</div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">{renderForm()}</div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Products</h3>
          <div className="table-actions">
            {categories.length > 0 && (
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ minWidth: '140px' }}>
                <option value="">All Categories</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            )}
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{search || filterCategory ? 'No products found' : 'No products yet'}</h3>
            <p>{search || filterCategory ? 'Try clearing filters' : 'Add your first product to get started'}</p>
            {!search && !filterCategory && <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openAdd}>+ Add Product</button>}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Category</th><th>Type</th><th>Sales Price</th><th>Cost Price</th><th>Stock</th><th>Unit</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isLow = p.type !== 'Service' && p.stock_qty <= p.reorder_level;
                return (
                  <tr key={p.id} onClick={() => openDetail(p)} style={{ cursor: 'pointer', background: isLow ? 'rgba(220, 38, 38, 0.04)' : undefined }}>
                    <td style={{ color: 'var(--text3)', fontSize: '12px' }}>{p.product_code}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.category ? <span className="badge badge-blue">{p.category}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                    <td><span className="badge badge-purple">{p.type}</span></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--green)', fontWeight: 500 }}>{fmt(p.sales_price)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' }}>{fmt(p.cost_price)}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: isLow ? 'var(--red)' : 'var(--text)' }}>{p.stock_qty}</span>
                      {isLow && <span className="badge badge-red" style={{ marginLeft: '6px', fontSize: '10px' }}>Low</span>}
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{p.unit}</td>
                    <td style={{ width: 32, textAlign: 'right' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}><polyline points="9 18 15 12 9 6" /></svg>
                    </td>
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

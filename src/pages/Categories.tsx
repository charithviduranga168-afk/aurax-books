import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Category {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'Product' });
  const [saving, setSaving] = useState(false);

  // list→detail state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Category | null>(null);
  const [linkedProducts, setLinkedProducts] = useState<any[]>([]);

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
    setCategories(data || []);
    setLoading(false);
  }

  async function openDetail(c: Category) {
    setSelected(c);
    // Load products in this category
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('products').select('id,name,product_code,type,stock_qty,sales_price').eq('user_id', user.id).eq('category', c.name).order('name');
      setLinkedProducts(data || []);
    }
    setView('detail');
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', type: 'Product' });
    setShowForm(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, type: c.type });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Category name is required');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase.from('categories').update({ name: form.name, type: form.type }).eq('id', editing.id);
      if (view === 'detail' && selected?.id === editing.id) {
        setSelected({ ...selected, name: form.name, type: form.type });
      }
    } else {
      await supabase.from('categories').insert({ user_id: user.id, name: form.name, type: form.type });
    }
    setSaving(false);
    setShowForm(false);
    loadCategories();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category?')) return;
    await supabase.from('categories').delete().eq('id', id);
    if (view === 'detail' && selected?.id === id) { setView('list'); setSelected(null); }
    loadCategories();
  }

  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  const grouped = categories.reduce((acc: any, c) => {
    if (!acc[c.type]) acc[c.type] = [];
    acc[c.type].push(c);
    return acc;
  }, {});

  const typeColors: Record<string, string> = {
    Product: 'badge-purple',
    Expense: 'badge-yellow',
    Service: 'badge-blue',
  };

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const c = selected;
    const productTypes = [...new Set(linkedProducts.map(p => p.type))].length;
    const totalValue = linkedProducts.reduce((s, p) => s + (p.stock_qty || 0) * (p.sales_price || 0), 0);
    return (
      <div>
        <BackBtn label="Back to Categories" onClick={() => { setView('list'); setSelected(null); setShowForm(false); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text1)', marginBottom: 10 }}>{c.name}</div>
              <span className={`badge ${typeColors[c.type] || 'badge-blue'}`}>{c.type} Category</span>
              {c.created_at && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>
                  Created {new Date(c.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Delete</button>
            </div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-color': '#7c3aed' } as any}>
            <div className="kpi-label">Total Products</div>
            <div className="kpi-value">{linkedProducts.length}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#2e90fa' } as any}>
            <div className="kpi-label">Product Types</div>
            <div className="kpi-value">{productTypes || '—'}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#16a34a' } as any}>
            <div className="kpi-label">Total Stock Value</div>
            <div className="kpi-value" style={{ fontSize: 14 }}>{fmt(totalValue)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#d97706' } as any}>
            <div className="kpi-label">Created</div>
            <div className="kpi-value" style={{ fontSize: 14 }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</div>
          </div>
        </div>

        {c.type === 'Product' && (
          <div className="table-wrap">
            <div className="table-toolbar">
              <h3>Products in "{c.name}"</h3>
              <span className="badge badge-purple">{linkedProducts.length}</span>
            </div>
            {linkedProducts.length === 0 ? (
              <div className="empty-state">
                <h3>No products in this category</h3>
                <p>Assign products to this category from the Products page.</p>
              </div>
            ) : (
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Type</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Sales Price</th></tr></thead>
                <tbody>
                  {linkedProducts.map(p => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--text3)', fontSize: 12 }}>{p.product_code}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><span className="badge badge-purple">{p.type}</span></td>
                      <td style={{ textAlign: 'right' }}>{p.stock_qty}</td>
                      <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmt(p.sales_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: 400, padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{editing ? 'Edit Category' : 'Add Category'}</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
              </div>
              <div className="form-grid cols-1">
                <div className="form-group">
                  <label>Category Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Electronics, Furniture" />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option>Product</option>
                    <option>Expense</option>
                    <option>Service</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Category'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Categories</div>
          <div className="page-sub">{categories.length} total categories</div>
        </div>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : openAdd())}>{showForm ? 'Close' : '+ Add Category'}</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">{editing ? 'Edit Category' : 'Add Category'}</div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid cols-1">
              <div className="form-group">
                <label>Category Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Electronics, Furniture" />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option>Product</option>
                  <option>Expense</option>
                  <option>Service</option>
                </select>
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Category'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <h3>No categories yet</h3>
          <p>Add categories to organize your products and expenses</p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openAdd}>+ Add Category</button>
        </div>
      ) : (
        Object.entries(grouped).map(([type, cats]: any) => (
          <div key={type} className="table-wrap" style={{ marginBottom: '20px' }}>
            <div className="table-toolbar">
              <h3>{type} Categories</h3>
              <span className="badge badge-purple">{cats.length}</span>
            </div>
            <table>
              <thead>
                <tr><th>Category Name</th><th>Type</th><th>Products</th><th></th></tr>
              </thead>
              <tbody>
                {cats.map((c: Category) => (
                  <tr key={c.id} onClick={() => openDetail(c)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><span className={`badge ${typeColors[c.type] || 'badge-blue'}`}>{c.type}</span></td>
                    <td style={{ color: 'var(--text2)', fontSize: 13 }}>{c.type === 'Product' ? 'View products →' : '—'}</td>
                    <td style={{ width: 32, textAlign: 'right' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}><polyline points="9 18 15 12 9 6" /></svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

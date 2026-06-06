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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [prodRes, catRes] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('categories')
        .select('name')
        .eq('user_id', user.id)
        .eq('type', 'Product')
        .order('name'),
    ]);
    setProducts(prodRes.data || []);
    setCategories((catRes.data || []).map((c: any) => c.name));
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm({
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
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      category: p.category || '',
      type: p.type || 'Stock Item',
      sales_price: String(p.sales_price || 0),
      cost_price: String(p.cost_price || 0),
      stock_qty: String(p.stock_qty || 0),
      reorder_level: String(p.reorder_level || 0),
      unit: p.unit || 'Pcs',
      notes: p.notes || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Product name is required');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      name: form.name,
      category: form.category,
      type: form.type,
      sales_price: parseFloat(form.sales_price) || 0,
      cost_price: parseFloat(form.cost_price) || 0,
      stock_qty: parseFloat(form.stock_qty) || 0,
      reorder_level: parseFloat(form.reorder_level) || 0,
      unit: form.unit,
      notes: form.notes,
    };
    if (editing) {
      await supabase.from('products').update(payload).eq('id', editing.id);
    } else {
      await supabase
        .from('products')
        .insert({
          ...payload,
          user_id: user.id,
          product_code: 'PROD-' + String(Date.now()).slice(-4),
        });
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
    loadData();
  }

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.product_code || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const lowStock = products.filter(
    (p) => p.type !== 'Service' && p.stock_qty <= p.reorder_level
  ).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Products</div>
          <div className="page-sub">
            {products.length} products{' '}
            {lowStock > 0 && (
              <span className="badge badge-red" style={{ marginLeft: '8px' }}>
                {lowStock} low stock
              </span>
            )}
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
        >
          {showForm ? 'Close' : '+ Add Product'}
        </button>
      </div>
      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">
              {editing ? 'Edit Product' : 'Add New Product'}
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
                <label>Product Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Office Chair"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  <option value="">— Select Category —</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                  <option value="__new__">+ Add new category...</option>
                </select>
                {form.category === '__new__' && (
                  <input
                    style={{ marginTop: '6px' }}
                    placeholder="Type new category name"
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  />
                )}
              </div>
              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option>Stock Item</option>
                  <option>Service</option>
                  <option>Raw Material</option>
                  <option>Finished Good</option>
                </select>
              </div>
              <div className="form-group">
                <label>Sales Price (LKR)</label>
                <input
                  type="number"
                  value={form.sales_price}
                  onChange={(e) =>
                    setForm({ ...form, sales_price: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Cost Price (LKR)</label>
                <input
                  type="number"
                  value={form.cost_price}
                  onChange={(e) =>
                    setForm({ ...form, cost_price: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Opening Stock Qty</label>
                <input
                  type="number"
                  value={form.stock_qty}
                  onChange={(e) =>
                    setForm({ ...form, stock_qty: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Reorder Level</label>
                <input
                  type="number"
                  value={form.reorder_level}
                  onChange={(e) =>
                    setForm({ ...form, reorder_level: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                >
                  <option>Pcs</option>
                  <option>Kg</option>
                  <option>L</option>
                  <option>M</option>
                  <option>Box</option>
                  <option>Pack</option>
                  <option>Set</option>
                  <option>Unit</option>
                </select>
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  rows={2}
                  placeholder="Optional notes"
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
                : 'Add Product'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Products</h3>
          <div className="table-actions">
            {categories.length > 0 && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{ minWidth: '140px' }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Search products..."
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
            <div className="empty-state-icon">📦</div>
            <h3>
              {search || filterCategory
                ? 'No products found'
                : 'No products yet'}
            </h3>
            <p>
              {search || filterCategory
                ? 'Try clearing filters'
                : 'Add your first product to get started'}
            </p>
            {!search && !filterCategory && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '16px' }}
                onClick={openAdd}
              >
                + Add Product
              </button>
            )}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Sales Price</th>
                <th>Cost Price</th>
                <th>Stock</th>
                <th>Unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text3)', fontSize: '12px' }}>
                    {p.product_code}
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>
                    {p.category ? (
                      <span className="badge badge-blue">{p.category}</span>
                    ) : (
                      <span style={{ color: 'var(--text3)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-purple">{p.type}</span>
                  </td>
                  <td
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--green)',
                      fontWeight: 500,
                    }}
                  >
                    {fmt(p.sales_price)}
                  </td>
                  <td
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text2)',
                    }}
                  >
                    {fmt(p.cost_price)}
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          p.stock_qty <= p.reorder_level && p.type !== 'Service'
                            ? 'var(--red)'
                            : 'var(--text)',
                      }}
                    >
                      {p.stock_qty}
                    </span>
                    {p.stock_qty <= p.reorder_level && p.type !== 'Service' && (
                      <span
                        className="badge badge-red"
                        style={{ marginLeft: '6px', fontSize: '10px' }}
                      >
                        Low
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{p.unit}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(p.id)}
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

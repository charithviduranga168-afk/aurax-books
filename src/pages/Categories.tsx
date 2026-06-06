import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface Category {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'Product' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    setCategories(data || []);
    setLoading(false);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await supabase
        .from('categories')
        .update({ name: form.name, type: form.type })
        .eq('id', editing.id);
    } else {
      await supabase
        .from('categories')
        .insert({ user_id: user.id, name: form.name, type: form.type });
    }
    setSaving(false);
    setShowForm(false);
    loadCategories();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category?')) return;
    await supabase.from('categories').delete().eq('id', id);
    loadCategories();
  }

  const grouped = categories.reduce((acc: any, c) => {
    if (!acc[c.type]) acc[c.type] = [];
    acc[c.type].push(c);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Categories</div>
          <div className="page-sub">{categories.length} total categories</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
        >
          {showForm ? 'Close' : '+ Add Category'}
        </button>
      </div>
      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div className="inline-panel-title">
              {editing ? 'Edit Category' : 'Add Category'}
            </div>
            <button
              className="modal-close"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid cols-1">
              <div className="form-group">
                <label>Category Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Electronics, Furniture"
                />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option>Product</option>
                  <option>Expense</option>
                  <option>Service</option>
                </select>
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
                : 'Add Category'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <p>Loading...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏷️</div>
          <h3>No categories yet</h3>
          <p>Add categories to organize your products and expenses</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '16px' }}
            onClick={openAdd}
          >
            + Add Category
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([type, cats]: any) => (
          <div
            key={type}
            className="table-wrap"
            style={{ marginBottom: '20px' }}
          >
            <div className="table-toolbar">
              <h3>{type} Categories</h3>
              <span className="badge badge-purple">{cats.length}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c: Category) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      <span className="badge badge-blue">{c.type}</span>
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
          </div>
        ))
      )}

    </div>
  );
}

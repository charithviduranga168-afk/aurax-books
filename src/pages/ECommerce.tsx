import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

interface EcomSettings {
  id?: string;
  store_name: string;
  store_description: string;
  banner_text: string;
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  product_code: string;
  sales_price: number;
}

interface EcomProduct {
  id: string;
  product_id: string;
  product_name: string;
  online_price: number;
  description: string;
  image_url: string;
  is_active: boolean;
}

interface StoreOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  items: any[];
  total: number;
  payment_status: string;
  order_status: string;
  created_at: string;
}

const ORDER_STATUSES = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:        { bg: '#dbeafe', color: '#1d4ed8' },
  processing: { bg: '#fef3c7', color: '#d97706' },
  shipped:    { bg: '#e0f2fe', color: '#0284c7' },
  delivered:  { bg: '#dcfce7', color: '#16a34a' },
  cancelled:  { bg: '#fee2e2', color: '#dc2626' },
  pending:    { bg: '#fef9c3', color: '#a16207' },
  paid:       { bg: '#dcfce7', color: '#16a34a' },
  failed:     { bg: '#fee2e2', color: '#dc2626' },
  refunded:   { bg: '#f3f4f6', color: '#374151' },
};

function badge(status: string) {
  const s = STATUS_COLORS[status] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '2px 9px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function fmt(n: number) {
  return 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ECommerce() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');

  const [settings, setSettings] = useState<EcomSettings>({ store_name: 'Online Store', store_description: '', banner_text: '', is_active: true });
  const [settingsForm, setSettingsForm] = useState<EcomSettings>({ store_name: '', store_description: '', banner_text: '', is_active: true });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [ecomProducts, setEcomProducts] = useState<EcomProduct[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editEcomId, setEditEcomId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ product_id: '', online_price: '', description: '', image_url: '' });
  const [savingProduct, setSavingProduct] = useState(false);

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const [{ data: st }, { data: prods }, { data: eprods }, { data: ords }] = await Promise.all([
      supabase.from('ecommerce_settings').select('*').eq('admin_user_id', user.id).maybeSingle(),
      supabase.from('products').select('id,name,product_code,sales_price').eq('user_id', user.id).order('name'),
      supabase.from('ecommerce_products').select('*').eq('admin_user_id', user.id).order('sort_order'),
      supabase.from('store_orders').select('*').eq('admin_user_id', user.id).order('created_at', { ascending: false }),
    ]);

    const s = st || { store_name: 'Online Store', store_description: '', banner_text: '', is_active: true };
    setSettings(s);
    setSettingsForm({ store_name: s.store_name, store_description: s.store_description || '', banner_text: s.banner_text || '', is_active: s.is_active });
    setProducts(prods || []);
    setEcomProducts(eprods || []);
    setOrders(ords || []);
    setLoading(false);
  }

  async function saveSettings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSavingSettings(true);
    const payload = { ...settingsForm, admin_user_id: user.id };
    const existing = settings as any;
    if (existing.id) {
      await supabase.from('ecommerce_settings').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('ecommerce_settings').insert(payload);
    }
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    loadAll();
  }

  function openAddProduct() {
    setEditEcomId(null);
    setProductForm({ product_id: '', online_price: '', description: '', image_url: '' });
    setShowProductDialog(true);
  }

  function openEditProduct(ep: EcomProduct) {
    setEditEcomId(ep.id);
    setProductForm({ product_id: ep.product_id, online_price: String(ep.online_price), description: ep.description || '', image_url: ep.image_url || '' });
    setShowProductDialog(true);
  }

  async function saveProduct() {
    if (!productForm.product_id || !productForm.online_price) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSavingProduct(true);
    const selectedProduct = products.find(p => p.id === productForm.product_id);
    const payload = {
      admin_user_id: user.id,
      product_id: productForm.product_id,
      product_name: selectedProduct?.name ?? '',
      online_price: parseFloat(productForm.online_price) || 0,
      description: productForm.description.trim(),
      image_url: productForm.image_url.trim(),
      is_active: true,
    };
    let error;
    if (editEcomId) {
      ({ error } = await supabase.from('ecommerce_products').update(payload).eq('id', editEcomId));
    } else {
      ({ error } = await supabase.from('ecommerce_products').insert(payload));
    }
    setSavingProduct(false);
    if (error) { alert('Failed to save: ' + error.message); return; }
    setShowProductDialog(false);
    loadAll();
  }

  async function toggleProduct(ep: EcomProduct) {
    await supabase.from('ecommerce_products').update({ is_active: !ep.is_active }).eq('id', ep.id);
    setEcomProducts(prev => prev.map(p => p.id === ep.id ? { ...p, is_active: !p.is_active } : p));
  }

  async function removeProduct(id: string) {
    if (!confirm('Remove this product from the store?')) return;
    await supabase.from('ecommerce_products').delete().eq('id', id);
    setEcomProducts(prev => prev.filter(p => p.id !== id));
  }

  async function updateOrderStatus(id: string, order_status: string) {
    await supabase.from('store_orders').update({ order_status }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, order_status } : o));
  }

  async function updatePaymentStatus(id: string, payment_status: string) {
    await supabase.from('store_orders').update({ payment_status }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status } : o));
  }

  const storeUrl = `${window.location.origin}${window.location.pathname}?store=${userId}`;
  const listedProductIds = new Set(ecomProducts.map(ep => ep.product_id));
  const unlistedProducts = products.filter(p => !listedProductIds.has(p.id));

  const newOrdersCount = orders.filter(o => o.order_status === 'new').length;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">E-Commerce</div>
          <div className="page-sub">Online store — {ecomProducts.filter(p => p.is_active).length} products listed, {orders.length} orders</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={storeUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
            View Store ↗
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 24 }}>
        {[
          { label: 'Store Settings', icon: '⚙️' },
          { label: `Products (${ecomProducts.length})`, icon: '🛍️' },
          { label: `Orders${newOrdersCount > 0 ? ` (${newOrdersCount} new)` : ` (${orders.length})`}`, icon: '📦' },
        ].map((t, i) => (
          <button key={t.label} onClick={() => setTab(i)}
            style={{ padding: '10px 22px', background: 'none', border: 'none', borderBottom: tab === i ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -2, color: tab === i ? 'var(--blue)' : 'var(--text2)', fontWeight: tab === i ? 700 : 500, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Store Settings ── */}
      {tab === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* Settings form */}
          <div className="card" style={{ padding: 28 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700 }}>Store Configuration</h3>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Store Name *</label>
              <input className="form-input" value={settingsForm.store_name} onChange={e => setSettingsForm(p => ({ ...p, store_name: e.target.value }))} placeholder="My Online Store" />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Store Description</label>
              <textarea className="form-input" rows={3} value={settingsForm.store_description} onChange={e => setSettingsForm(p => ({ ...p, store_description: e.target.value }))} placeholder="Welcome to our store..." style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Banner Text <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(promotional message at top)</span></label>
              <input className="form-input" value={settingsForm.banner_text} onChange={e => setSettingsForm(p => ({ ...p, banner_text: e.target.value }))} placeholder="Free delivery on orders over Rs. 5,000!" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={settingsForm.is_active} onChange={e => setSettingsForm(p => ({ ...p, is_active: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <span style={{ fontWeight: 600 }}>Store is active</span>
              </label>
              <span style={{ fontSize: 12, color: settingsForm.is_active ? '#16a34a' : '#dc2626' }}>
                {settingsForm.is_active ? '● Customers can visit and order' : '● Store is hidden from customers'}
              </span>
            </div>
            <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings} style={{ minWidth: 120 }}>
              {settingsSaved ? '✓ Saved!' : savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Store URL card */}
          <div>
            <div className="card" style={{ padding: 24, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Your Store Link</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Share this link with your customers. Anyone with the link can browse and order from your store.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={storeUrl} style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', background: 'var(--bg)' }} onClick={e => (e.target as HTMLInputElement).select()} />
                <button className="btn btn-secondary" onClick={() => { navigator.clipboard.writeText(storeUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}>
                  {linkCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 24, background: settings.is_active ? '#f0fdf4' : '#fef9c3', border: `1px solid ${settings.is_active ? '#bbf7d0' : '#fde68a'}` }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{settings.is_active ? '🟢' : '🟡'}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: settings.is_active ? '#15803d' : '#a16207', marginBottom: 4 }}>
                Store is {settings.is_active ? 'Live' : 'Inactive'}
              </div>
              <div style={{ fontSize: 13, color: settings.is_active ? '#16a34a' : '#d97706' }}>
                {settings.is_active
                  ? `${ecomProducts.filter(p => p.is_active).length} products visible to customers`
                  : 'Customers will see a "Store Offline" message'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 1: Products ── */}
      {tab === 1 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>
              {ecomProducts.filter(p => p.is_active).length} of {ecomProducts.length} products visible online
            </div>
            <button className="btn btn-primary" onClick={openAddProduct} disabled={unlistedProducts.length === 0}>
              + Add Product to Store
            </button>
          </div>

          {ecomProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🛍️</div>
              <h3>No products listed yet</h3>
              <p>Add products from your inventory to start selling online.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAddProduct} disabled={products.length === 0}>
                {products.length === 0 ? 'Add products to inventory first' : '+ Add First Product'}
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Online Price</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ecomProducts.map(ep => (
                    <tr key={ep.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {ep.image_url ? (
                            <img src={ep.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, flexShrink: 0 }}>
                              {ep.product_name.charAt(0)}
                            </div>
                          )}
                          <span style={{ fontWeight: 600 }}>{ep.product_name}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 240 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.description || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(ep.online_price)}</td>
                      <td>
                        <button onClick={() => toggleProduct(ep)}
                          style={{ background: ep.is_active ? '#dcfce7' : '#f3f4f6', color: ep.is_active ? '#16a34a' : '#6b7280', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          {ep.is_active ? '● Visible' : '○ Hidden'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditProduct(ep)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeProduct(ep.id)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Orders ── */}
      {tab === 2 && (
        <div>
          {orders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <h3>No orders yet</h3>
              <p>Share your store link with customers to start receiving orders.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16 }}>
                {['all', 'new', 'processing', 'shipped', 'delivered'].map(s => {
                  const count = s === 'all' ? orders.length : orders.filter(o => o.order_status === s).length;
                  return (
                    <span key={s} style={{ fontSize: 13, color: 'var(--text2)' }}>
                      <strong style={{ color: s === 'new' && count > 0 ? '#dc2626' : 'var(--text)' }}>{count}</strong> {s}
                    </span>
                  );
                })}
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <>
                      <tr key={o.id} style={{ cursor: 'pointer', background: expandedOrder === o.id ? '#f8f7ff' : undefined }}
                        onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                        <td style={{ fontWeight: 700, color: 'var(--blue)' }}>{o.order_number}</td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{o.customer_email}</div>
                        </td>
                        <td style={{ fontSize: 13 }}>{o.items.length} item{o.items.length !== 1 ? 's' : ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(o.total)}</td>
                        <td>
                          <select value={o.payment_status} onChange={e => { e.stopPropagation(); updatePaymentStatus(o.id, e.target.value); }}
                            style={{ fontSize: 12, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                            onClick={e => e.stopPropagation()}>
                            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>{badge(o.order_status)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {ORDER_STATUSES.filter(s => s !== o.order_status && s !== 'cancelled').slice(0, 1).map(next => (
                              <button key={next} className="btn btn-secondary btn-sm" onClick={() => updateOrderStatus(o.id, next)} style={{ fontSize: 11 }}>
                                → {next}
                              </button>
                            ))}
                            {o.order_status !== 'cancelled' && (
                              <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => updateOrderStatus(o.id, 'cancelled')}>
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedOrder === o.id && (
                        <tr key={`${o.id}-detail`} style={{ background: '#faf9ff' }}>
                          <td colSpan={8} style={{ padding: '12px 24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Customer Details</div>
                                <div style={{ fontSize: 13 }}>{o.customer_name}</div>
                                {o.customer_email && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{o.customer_email}</div>}
                                {o.customer_phone && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{o.customer_phone}</div>}
                                {o.customer_address && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{o.customer_address}</div>}
                              </div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Items Ordered</div>
                                {o.items.map((item: any, idx: number) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                    <span>{item.productName} × {item.qty}</span>
                                    <span style={{ fontWeight: 600 }}>{fmt(item.price * item.qty)}</span>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                                  <span>Total</span>
                                  <span>{fmt(o.total)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Product Dialog */}
      {showProductDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 480, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{editEcomId ? 'Edit Product Listing' : 'Add Product to Store'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowProductDialog(false)}>✕</button>
            </div>
            <div className="form-grid">
              {!editEcomId && (
                <div className="form-group full">
                  <label className="form-label">Product *</label>
                  <select className="form-input" value={productForm.product_id} onChange={e => {
                    const p = products.find(x => x.id === e.target.value);
                    setProductForm(f => ({ ...f, product_id: e.target.value, online_price: p ? String(p.sales_price) : '' }));
                  }}>
                    <option value="">-- Select a product --</option>
                    {(editEcomId ? products : unlistedProducts).map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.product_code ? `(${p.product_code})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group full">
                <label className="form-label">Online Price (LKR) *</label>
                <input className="form-input" type="number" value={productForm.online_price} onChange={e => setProductForm(f => ({ ...f, online_price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="form-group full">
                <label className="form-label">Product Description <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
                <textarea className="form-input" rows={3} value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this product for customers..." style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group full">
                <label className="form-label">Image URL <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
                <input className="form-input" type="url" value={productForm.image_url} onChange={e => setProductForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://example.com/product.jpg" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowProductDialog(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProduct} disabled={savingProduct || !productForm.product_id || !productForm.online_price}>
                {savingProduct ? 'Saving...' : editEcomId ? 'Save Changes' : 'Add to Store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

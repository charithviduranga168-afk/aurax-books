import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { X } from 'lucide-react';

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
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '2px 9px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' as const }}>
      {status}
    </span>
  );
}

function fmt(n: number) {
  return 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

export default function ECommerce() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedOrder, setSelectedOrder] = useState<StoreOrder | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

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
    const payload = { admin_user_id: user.id, product_id: productForm.product_id, product_name: selectedProduct?.name ?? '', online_price: parseFloat(productForm.online_price) || 0, description: productForm.description.trim(), image_url: productForm.image_url.trim(), is_active: true };
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
    if (selectedOrder?.id === id) setSelectedOrder(prev => prev ? { ...prev, order_status } : null);
  }

  async function updatePaymentStatus(id: string, payment_status: string) {
    await supabase.from('store_orders').update({ payment_status }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status } : o));
    if (selectedOrder?.id === id) setSelectedOrder(prev => prev ? { ...prev, payment_status } : null);
  }

  const storeUrl = `${window.location.origin}${window.location.pathname}?store=${userId}`;
  const listedProductIds = new Set(ecomProducts.map(ep => ep.product_id));
  const unlistedProducts = products.filter(p => !listedProductIds.has(p.id));
  const newOrdersCount = orders.filter(o => o.order_status === 'new').length;

  const filteredOrders = orders.filter(o => {
    const matchSearch = !search || (o.order_number || '').toLowerCase().includes(search.toLowerCase()) || (o.customer_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || o.order_status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  // ── Order detail view ──
  if (view === 'detail' && selectedOrder) {
    return (
      <div>
        <BackBtn label="Back to Orders" onClick={() => { setView('list'); setSelectedOrder(null); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>{selectedOrder.order_number}</div>
              <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
                {badge(selectedOrder.order_status)}
                {badge(selectedOrder.payment_status)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{new Date(selectedOrder.created_at).toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {ORDER_STATUSES.filter(s => s !== selectedOrder.order_status && s !== 'cancelled').slice(0, 1).map(next => (
                <button key={next} className="btn btn-secondary btn-sm" onClick={() => updateOrderStatus(selectedOrder.id, next)}>
                  Move to {next}
                </button>
              ))}
              {selectedOrder.order_status !== 'cancelled' && (
                <button className="btn btn-danger btn-sm" onClick={() => updateOrderStatus(selectedOrder.id, 'cancelled')}>Cancel Order</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Customer info */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.05em' }}>Customer Details</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{selectedOrder.customer_name}</div>
            {selectedOrder.customer_email && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{selectedOrder.customer_email}</div>}
            {selectedOrder.customer_phone && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{selectedOrder.customer_phone}</div>}
            {selectedOrder.customer_address && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>{selectedOrder.customer_address}</div>}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>Payment Status</div>
              <select value={selectedOrder.payment_status} onChange={e => updatePaymentStatus(selectedOrder.id, e.target.value)} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Order items */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.05em' }}>Items Ordered</div>
            {selectedOrder.items.map((item: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.productName}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 12 }}>Qty: {item.qty} × {fmt(item.price)}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{fmt(item.price * item.qty)}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 12, paddingTop: 8, borderTop: '2px solid var(--border)' }}>
              <span>Total</span>
              <span style={{ color: 'var(--brand)' }}>{fmt(selectedOrder.total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">E-Commerce</div>
          <div className="page-sub">
            {settings.is_active ? (
              <span style={{ color: '#16a34a' }}>Store Live</span>
            ) : (
              <span style={{ color: '#d97706' }}>Store Inactive</span>
            )}
            {' · '}{ecomProducts.filter(p => p.is_active).length} products · {orders.length} orders
            {newOrdersCount > 0 && <span className="badge badge-red" style={{ marginLeft: 8 }}>{newOrdersCount} new</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? 'Close Settings' : 'Store Settings'}
          </button>
          <a href={storeUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">View Store</a>
        </div>
      </div>

      {/* Store settings panel */}
      {showSettings && (
        <div className="inline-panel" style={{ marginBottom: 24 }}>
          <div className="inline-panel-header">
            <div className="inline-panel-title">Store Settings</div>
            <button className="modal-close" onClick={() => setShowSettings(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Store Name *</label>
                  <input value={settingsForm.store_name} onChange={e => setSettingsForm(p => ({ ...p, store_name: e.target.value }))} placeholder="My Online Store" />
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Store Description</label>
                  <textarea rows={3} value={settingsForm.store_description} onChange={e => setSettingsForm(p => ({ ...p, store_description: e.target.value }))} placeholder="Welcome to our store..." style={{ resize: 'vertical' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Banner Text</label>
                  <input value={settingsForm.banner_text} onChange={e => setSettingsForm(p => ({ ...p, banner_text: e.target.value }))} placeholder="Free delivery on orders over Rs. 5,000!" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={settingsForm.is_active} onChange={e => setSettingsForm(p => ({ ...p, is_active: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  <span style={{ fontWeight: 600 }}>Store is active (customers can order)</span>
                </label>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Your Store Link</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input readOnly value={storeUrl} style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', background: 'var(--bg)' }} onClick={e => (e.target as HTMLInputElement).select()} />
                  <button className="btn btn-secondary" onClick={() => { navigator.clipboard.writeText(storeUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}>
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>{settingsSaved ? 'Saved!' : savingSettings ? 'Saving...' : 'Save Settings'}</button>
          </div>
        </div>
      )}

      {/* Products section */}
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <div className="table-toolbar">
          <h3>Online Products ({ecomProducts.filter(p => p.is_active).length} of {ecomProducts.length} visible)</h3>
          <button className="btn btn-primary btn-sm" onClick={openAddProduct} disabled={unlistedProducts.length === 0}>+ Add Product to Store</button>
        </div>
        {ecomProducts.length === 0 ? (
          <div className="empty-state">
            <h3>No products listed yet</h3>
            <p>Add products from your inventory to start selling online.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAddProduct} disabled={products.length === 0}>
              {products.length === 0 ? 'Add products to inventory first' : '+ Add First Product'}
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Product</th><th>Description</th><th style={{ textAlign: 'right' }}>Online Price</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {ecomProducts.map(ep => (
                <tr key={ep.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {ep.image_url ? (
                        <img src={ep.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, flexShrink: 0 }}>{ep.product_name.charAt(0)}</div>
                      )}
                      <span style={{ fontWeight: 600 }}>{ep.product_name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.description || '—'}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(ep.online_price)}</td>
                  <td>
                    <button onClick={() => toggleProduct(ep)} style={{ background: ep.is_active ? '#dcfce7' : '#f3f4f6', color: ep.is_active ? '#16a34a' : '#6b7280', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      {ep.is_active ? 'Visible' : 'Hidden'}
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
        )}
      </div>

      {/* Orders table */}
      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>Store Orders {newOrdersCount > 0 && <span className="badge badge-red" style={{ marginLeft: 8 }}>{newOrdersCount} new</span>}</h3>
          <div className="table-actions">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: 120 }}>
              <option value="">All Statuses</option>
              {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {orders.length === 0 ? (
          <div className="empty-state">
            <h3>No orders yet</h3>
            <p>Share your store link with customers to start receiving orders.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Order #</th><th>Date</th><th>Customer</th><th>Items</th><th style={{ textAlign: 'right' }}>Total</th><th>Payment</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filteredOrders.map(o => (
                <tr key={o.id} onClick={() => { setSelectedOrder(o); setView('detail'); }} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{o.order_number}</td>
                  <td style={{ fontSize: 13, color: 'var(--text2)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{o.customer_email}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>{o.items.length} item{o.items.length !== 1 ? 's' : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(o.total)}</td>
                  <td onClick={e => e.stopPropagation()}>{badge(o.payment_status)}</td>
                  <td>{badge(o.order_status)}</td>
                  <td style={{ width: 32, textAlign: 'right' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}><polyline points="9 18 15 12 9 6" /></svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Product Dialog */}
      {showProductDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 480, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{editEcomId ? 'Edit Product Listing' : 'Add Product to Store'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowProductDialog(false)}><X size={14} /></button>
            </div>
            <div className="form-grid">
              {!editEcomId && (
                <div className="form-group full">
                  <label>Product *</label>
                  <select value={productForm.product_id} onChange={e => {
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
                <label>Online Price (LKR) *</label>
                <input type="number" value={productForm.online_price} onChange={e => setProductForm(f => ({ ...f, online_price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="form-group full">
                <label>Product Description</label>
                <textarea rows={3} value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this product for customers..." style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group full">
                <label>Image URL</label>
                <input type="url" value={productForm.image_url} onChange={e => setProductForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://example.com/product.jpg" />
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

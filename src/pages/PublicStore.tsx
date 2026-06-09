import { useState, useEffect } from 'react';
import md5 from 'md5';
import { supabase } from '../supabase';

const PAYHERE_MERCHANT = '1233250';
const PAYHERE_SECRET = 'MTIzNDU0OTgxNDMyNzE1OTQ2NTMzMTIzMTI2MDczMTA3MzAxNTM5Ng==';

interface Props {
  adminUserId: string;
  confirmedOrderId: string | null;
}

interface StoreSettings {
  store_name: string;
  store_description: string;
  banner_text: string;
  is_active: boolean;
}

interface StoreProduct {
  id: string;
  product_id: string;
  product_name: string;
  online_price: number;
  description: string;
  image_url: string;
}

interface CartItem {
  productId: string;
  productName: string;
  price: number;
  qty: number;
  imageUrl: string;
}

type View = 'products' | 'checkout' | 'confirmed';

function fmt(n: number) {
  return 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PRODUCT_COLORS = ['#7c3aed', '#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed', '#6d28d9'];

export default function PublicStore({ adminUserId, confirmedOrderId }: Props) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [view, setView] = useState<View>('products');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [placing, setPlacing] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);

  useEffect(() => {
    loadStore();
    if (confirmedOrderId) loadConfirmedOrder(confirmedOrderId);
  }, [adminUserId, confirmedOrderId]);

  async function loadStore() {
    setLoading(true);
    const [{ data: st }, { data: prods }] = await Promise.all([
      supabase.from('ecommerce_settings').select('store_name,store_description,banner_text,is_active').eq('admin_user_id', adminUserId).maybeSingle(),
      supabase.from('ecommerce_products').select('id,product_id,product_name,online_price,description,image_url').eq('admin_user_id', adminUserId).eq('is_active', true).order('sort_order'),
    ]);
    setSettings(st || { store_name: 'Online Store', store_description: '', banner_text: '', is_active: true });
    setProducts(prods || []);
    setLoading(false);
  }

  async function loadConfirmedOrder(orderId: string) {
    const { data } = await supabase.from('store_orders').select('*').eq('id', orderId).maybeSingle();
    if (data) {
      setConfirmedOrder(data);
      setView('confirmed');
    }
  }

  function addToCart(p: StoreProduct) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id);
      if (existing) return prev.map(i => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { productId: p.id, productName: p.product_name, price: p.online_price, qty: 1, imageUrl: p.image_url }];
    });
    setShowCart(true);
  }

  function updateQty(productId: string, delta: number) {
    setCart(prev => {
      const updated = prev.map(i => i.productId === productId ? { ...i, qty: Math.max(0, i.qty + delta) } : i);
      return updated.filter(i => i.qty > 0);
    });
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  async function placeOrder() {
    if (!form.name.trim()) return alert('Please enter your name');
    if (cart.length === 0) return;
    setPlacing(true);

    const orderNumber = 'ORD-' + Date.now();
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    const { data: newOrder, error } = await supabase.from('store_orders').insert({
      admin_user_id: adminUserId,
      order_number: orderNumber,
      customer_name: form.name.trim(),
      customer_email: form.email.trim(),
      customer_phone: form.phone.trim(),
      customer_address: form.address.trim(),
      items: cart.map(i => ({ productId: i.productId, productName: i.productName, price: i.price, qty: i.qty })),
      subtotal: total,
      total,
      payment_method: 'payhere',
      payment_status: 'pending',
      order_status: 'new',
    }).select().single();

    setPlacing(false);

    if (error || !newOrder) {
      alert('Failed to place order. Please try again.');
      return;
    }

    // Build PayHere form
    const orderId = `STORE-${newOrder.id.slice(0, 8)}-${Date.now()}`;
    const amount = total.toFixed(2);
    const currency = 'LKR';
    const secretHash = md5(PAYHERE_SECRET).toUpperCase();
    const hash = md5(PAYHERE_MERCHANT + orderId + amount + currency + secretHash).toUpperCase();
    const nameParts = form.name.trim().split(' ');
    const returnUrl = `${window.location.origin}${window.location.pathname}?store=${adminUserId}&order=${newOrder.id}`;

    const fields: Record<string, string> = {
      merchant_id: PAYHERE_MERCHANT,
      return_url: returnUrl,
      cancel_url: returnUrl,
      notify_url: '',
      order_id: orderId,
      items: `Order from ${settings?.store_name || 'Online Store'}`,
      currency,
      amount,
      first_name: nameParts[0] || form.name,
      last_name: nameParts.slice(1).join(' ') || '',
      email: form.email || '',
      phone: form.phone || '0000000000',
      address: form.address || 'Sri Lanka',
      city: 'Colombo',
      country: 'Sri Lanka',
      hash,
    };

    const payForm = document.createElement('form');
    payForm.method = 'POST';
    payForm.action = 'https://www.payhere.lk/pay/checkout';
    payForm.style.display = 'none';
    for (const [k, v] of Object.entries(fields)) {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = k; inp.value = v;
      payForm.appendChild(inp);
    }
    document.body.appendChild(payForm);
    payForm.submit();
  }

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div>
          <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 16 }}>Loading store...</div>
        </div>
      </div>
    );
  }

  if (!settings?.is_active) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
          <h2 style={{ color: '#374151', marginBottom: 8 }}>{settings?.store_name || 'Online Store'}</h2>
          <p style={{ color: '#6b7280' }}>This store is temporarily offline. Please check back later.</p>
        </div>
      </div>
    );
  }

  // ─── Confirmed order view ──────────────────────────────────────────────────
  if (view === 'confirmed' && confirmedOrder) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff' }}>
        <StoreHeader settings={settings} itemCount={0} onCartClick={() => {}} storeName={settings?.store_name || 'Store'} />
        <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 40, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ color: '#111827', marginBottom: 8, fontSize: 24 }}>Order Placed!</h2>
            <p style={{ color: '#6b7280', marginBottom: 24 }}>Thank you for your order. We'll be in touch soon.</p>
            <div style={{ background: '#f8f7ff', borderRadius: 10, padding: '16px 24px', marginBottom: 24, display: 'inline-block', minWidth: 200 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Order Number</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#7c3aed' }}>{confirmedOrder.order_number}</div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: '#374151', marginBottom: 8 }}>
                <strong>{confirmedOrder.customer_name}</strong>
              </div>
              {confirmedOrder.customer_email && <div style={{ fontSize: 13, color: '#6b7280' }}>{confirmedOrder.customer_email}</div>}
            </div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, marginBottom: 20 }}>
              {confirmedOrder.items.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                  <span style={{ color: '#374151' }}>{item.productName} × {item.qty}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(item.price * item.qty)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, borderTop: '1px solid #f3f4f6', paddingTop: 10, marginTop: 8, color: '#7c3aed' }}>
                <span>Total Paid</span>
                <span>{fmt(confirmedOrder.total)}</span>
              </div>
            </div>
            <button onClick={() => { setView('products'); window.history.replaceState({}, '', `?store=${adminUserId}`); }}
              style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, padding: '12px 28px', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Checkout view ─────────────────────────────────────────────────────────
  if (view === 'checkout') {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff' }}>
        <StoreHeader settings={settings} itemCount={itemCount} onCartClick={() => setView('products')} storeName={settings?.store_name || 'Store'} />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
          <button onClick={() => setView('products')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            ← Back to Store
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28, alignItems: 'start' }}>

            {/* Checkout form */}
            <div style={{ background: 'white', borderRadius: 14, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 800 }}>Checkout</h2>
              {[
                { key: 'name', label: 'Full Name *', type: 'text', placeholder: 'John Silva' },
                { key: 'email', label: 'Email Address', type: 'email', placeholder: 'john@example.com' },
                { key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+94 77 123 4567' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Delivery Address</label>
                <textarea placeholder="No. 45, Main Street, Colombo 03" value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ background: '#f8f7ff', borderRadius: 10, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22 }}>💳</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Secure Payment via PayHere</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Visa, Mastercard, Amex, and more accepted</div>
                </div>
              </div>
              <button onClick={placeOrder} disabled={placing || !form.name.trim() || cart.length === 0}
                style={{ width: '100%', background: placing ? '#9ca3af' : '#7c3aed', color: 'white', border: 'none', borderRadius: 10, padding: '14px', cursor: placing ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {placing ? 'Placing order...' : (
                  <>
                    <img src="https://www.payhere.lk/downloads/images/payhere_short_banner.png" alt="PayHere" style={{ height: 22 }} />
                    Pay {fmt(total)}
                  </>
                )}
              </button>
            </div>

            {/* Order summary */}
            <div style={{ background: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', position: 'sticky', top: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Order Summary</h3>
              {cart.map(item => (
                <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{item.productName}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>× {item.qty}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(item.price * item.qty)}</div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #f3f4f6', fontSize: 18, fontWeight: 900, color: '#7c3aed' }}>
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Product listing view ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8f7ff' }}>
      <StoreHeader settings={settings} itemCount={itemCount} onCartClick={() => setShowCart(true)} storeName={settings?.store_name || 'Store'} />

      {/* Banner */}
      {settings?.banner_text && (
        <div style={{ background: '#7c3aed', color: 'white', textAlign: 'center', padding: '10px 20px', fontSize: 14, fontWeight: 600 }}>
          {settings.banner_text}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>

        {/* Store description */}
        {settings?.store_description && (
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{ fontSize: 16, color: '#6b7280', maxWidth: 600, margin: '0 auto' }}>{settings.store_description}</p>
          </div>
        )}

        {products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🛍️</div>
            <h3 style={{ color: '#374151', marginBottom: 8 }}>Coming Soon</h3>
            <p style={{ color: '#6b7280' }}>Products are being added. Check back soon!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 24 }}>
            {products.map((p, idx) => {
              const inCart = cart.find(i => i.productId === p.id);
              const color = PRODUCT_COLORS[idx % PRODUCT_COLORS.length];
              return (
                <div key={p.id} style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'default' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}>
                  {/* Product image / placeholder */}
                  <div style={{ height: 200, overflow: 'hidden', background: `linear-gradient(135deg, ${color} 0%, ${color}99 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => {
                        const parent = (e.target as HTMLImageElement).parentElement!;
                        (e.target as HTMLImageElement).style.display = 'none';
                        parent.innerHTML = `<div style="font-size:60px;opacity:0.4">🛒</div>`;
                      }} />
                    ) : (
                      <div style={{ fontSize: 60, opacity: 0.4 }}>🛒</div>
                    )}
                  </div>
                  {/* Product info */}
                  <div style={{ padding: '18px 20px 20px' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 6 }}>{p.product_name}</div>
                    {p.description && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{p.description}</div>}
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#7c3aed', marginBottom: 14 }}>{fmt(p.online_price)}</div>

                    {inCart ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => updateQty(p.id, -1)}
                          style={{ width: 32, height: 32, borderRadius: 8, background: '#f3f4f6', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#374151' }}>−</button>
                        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: 'center' }}>{inCart.qty}</span>
                        <button onClick={() => updateQty(p.id, 1)}
                          style={{ width: 32, height: 32, borderRadius: 8, background: '#7c3aed', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'white' }}>+</button>
                        <span style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600, marginLeft: 4 }}>{fmt(inCart.price * inCart.qty)}</span>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(p)}
                        style={{ width: '100%', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, padding: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                        Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart panel */}
      {showCart && (
        <>
          <div onClick={() => setShowCart(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200 }} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, background: 'white', zIndex: 201, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Your Cart <span style={{ color: '#7c3aed' }}>({itemCount})</span></h3>
              <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                  <p>Your cart is empty</p>
                </div>
              ) : cart.map(item => (
                <div key={item.productId} style={{ display: 'flex', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                  <div style={{ width: 50, height: 50, borderRadius: 8, background: '#7c3aed22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span style={{ fontSize: 20 }}>🛒</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.productName}</div>
                    <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 700 }}>{fmt(item.price)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => updateQty(item.productId, -1)} style={{ width: 26, height: 26, borderRadius: 6, background: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <span style={{ fontWeight: 700, fontSize: 14, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.productId, 1)} style={{ width: 26, height: 26, borderRadius: 6, background: '#7c3aed', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'white' }}>+</button>
                  </div>
                  <button onClick={() => removeFromCart(item.productId)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div style={{ padding: '20px 24px', borderTop: '2px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, color: '#111827', marginBottom: 16 }}>
                  <span>Total</span>
                  <span style={{ color: '#7c3aed' }}>{fmt(total)}</span>
                </div>
                <button onClick={() => { setShowCart(false); setView('checkout'); }}
                  style={{ width: '100%', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, padding: '14px', cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>
                  Proceed to Checkout
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StoreHeader({ settings, itemCount, onCartClick, storeName }: { settings: StoreSettings | null; itemCount: number; onCartClick: () => void; storeName: string }) {
  return (
    <div style={{ background: '#7c3aed', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
      <div>
        <span style={{ color: 'white', fontWeight: 900, fontSize: 20, letterSpacing: '-0.5px' }}>{storeName}</span>
      </div>
      <button onClick={onCartClick} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 10, padding: '8px 18px', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
        🛒 Cart
        {itemCount > 0 && (
          <span style={{ background: '#fbbf24', color: '#1f2937', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>{itemCount}</span>
        )}
      </button>
    </div>
  );
}

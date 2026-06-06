import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';

interface Product {
  id: string;
  name: string;
  sales_price: number;
  cost_price: number;
  stock_qty: number;
  category_id?: string;
}

interface Category {
  id: string;
  name: string;
}

interface CartItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
}

interface Sale {
  id: string;
  sale_number: string;
  date: string;
  customer_name: string | null;
  total: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  status: string;
}

type NumpadMode = 'qty' | 'disc' | 'price';
type ViewMode = 'pos' | 'history';

const CARD_COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#9333ea','#65a30d','#ea580c','#0f766e'];
function cardColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return CARD_COLORS[h % CARD_COLORS.length];
}

interface Props { nav?: (p: any) => void; }

export default function PointOfSale({ nav }: Props) {
  const [products, setProducts]   = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [settings, setSettings]   = useState<any>({});
  const [sales, setSales]         = useState<Sale[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<ViewMode>('pos');

  // Cart
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [numpadMode, setNumpadMode]   = useState<NumpadMode>('qty');
  const [numpadBuf, setNumpadBuf]     = useState('');

  // Filters
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('all');

  // Order meta
  const [customerId, setCustomerId] = useState('');
  const [orderNote, setOrderNote]   = useState('');
  const [discount, setDiscount]     = useState(0);

  // Payment modal
  const [showPay, setShowPay]       = useState(false);
  const [payMethod, setPayMethod]   = useState('Cash');
  const [cashBuf, setCashBuf]       = useState('');

  // Receipt success
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [processing, setProcessing]   = useState(false);

  // History search
  const [histSearch, setHistSearch]   = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [p, c, cu, se, sa] = await Promise.all([
      supabase.from('products').select('id,name,sales_price,cost_price,stock_qty,category_id').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('customers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('pos_sales').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(200),
    ]);
    setProducts(p.data || []);
    setCategories(c.data || []);
    setCustomers(cu.data || []);
    setSettings(se.data || {});
    setSales(sa.data || []);
    setLoading(false);
  }

  // ── Numpad logic ──
  const applyNumpad = useCallback((buf: string, mode: NumpadMode, idx: number, prev: CartItem[]) => {
    const val = parseFloat(buf) || 0;
    return prev.map((item, i) => {
      if (i !== idx) return item;
      let { qty, unit_price, discount_pct } = item;
      if (mode === 'qty')   qty           = buf === '' ? 1 : Math.max(0.001, val);
      if (mode === 'price') unit_price    = buf === '' ? 0 : Math.max(0, val);
      if (mode === 'disc')  discount_pct  = buf === '' ? 0 : Math.min(100, Math.max(0, val));
      return { ...item, qty, unit_price, discount_pct, line_total: qty * unit_price * (1 - discount_pct / 100) };
    });
  }, []);

  function handleNumpad(key: string) {
    if (selectedIdx === null) return;
    let next = numpadBuf;
    if (key === 'back') {
      next = numpadBuf.slice(0, -1);
    } else if (key === '.' && numpadBuf.includes('.')) {
      return;
    } else {
      next = numpadBuf + key;
    }
    setNumpadBuf(next);
    setCart((prev) => applyNumpad(next, numpadMode, selectedIdx, prev));
  }

  function switchMode(m: NumpadMode) {
    setNumpadMode(m);
    setNumpadBuf('');
    if (selectedIdx !== null) {
      const item = cart[selectedIdx];
      const val = m === 'qty' ? item.qty : m === 'price' ? item.unit_price : item.discount_pct;
      setNumpadBuf(String(val));
    }
  }

  // ── Cart ──
  function addToCart(p: Product) {
    if (p.stock_qty <= 0) return;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product_id === p.id);
      if (idx >= 0) {
        const updated = prev.map((item, i) => {
          if (i !== idx) return item;
          const qty = item.qty + 1;
          return { ...item, qty, line_total: qty * item.unit_price * (1 - item.discount_pct / 100) };
        });
        setSelectedIdx(idx);
        setNumpadBuf(String(updated[idx].qty));
        setNumpadMode('qty');
        return updated;
      }
      const newItem: CartItem = { product_id: p.id, product_name: p.name, qty: 1, unit_price: p.sales_price, discount_pct: 0, line_total: p.sales_price };
      const newIdx = prev.length;
      setSelectedIdx(newIdx);
      setNumpadBuf('1');
      setNumpadMode('qty');
      return [...prev, newItem];
    });
  }

  function removeCartItem(i: number) {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
    setSelectedIdx(null);
    setNumpadBuf('');
  }

  function clearOrder() {
    setCart([]); setSelectedIdx(null); setNumpadBuf(''); setDiscount(0);
    setCustomerId(''); setOrderNote(''); setPayMethod('Cash'); setCashBuf('');
  }

  // ── Totals ──
  const subtotal  = cart.reduce((s, c) => s + c.line_total, 0);
  const taxRate   = parseFloat(settings.tax_rate || '0');
  const taxAmt    = ((subtotal - discount) * taxRate) / 100;
  const total     = subtotal - discount + taxAmt;
  const tendered  = parseFloat(cashBuf) || 0;
  const changeDue = Math.max(0, tendered - total);

  // ── Sale number ──
  function nextSaleNo() {
    if (!sales.length) return 'POS-0001';
    const max = Math.max(0, ...sales.map((s) => { const m = s.sale_number?.match(/(\d+)$/); return m ? +m[1] : 0; }));
    return 'POS-' + String(max + 1).padStart(4, '0');
  }

  // ── Checkout ──
  async function handleCharge() {
    if (!cart.length) return;
    if (payMethod === 'Cash' && tendered < total) return;
    setProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProcessing(false); return; }
    const customer = customers.find((c) => c.id === customerId);
    const saleNo   = nextSaleNo();
    const { data: saleData, error } = await supabase.from('pos_sales').insert({
      user_id: user.id, sale_number: saleNo,
      customer_id: customerId || null, customer_name: customer?.name || null,
      subtotal, discount, tax_amount: taxAmt, total,
      payment_method: payMethod,
      amount_tendered: payMethod === 'Cash' ? tendered : total,
      change_due: payMethod === 'Cash' ? changeDue : 0,
      notes: orderNote, status: 'Completed',
    }).select().single();
    if (error || !saleData) { alert('Error: ' + (error?.message || 'unknown')); setProcessing(false); return; }
    await supabase.from('pos_sale_lines').insert(cart.map((c) => ({ sale_id: saleData.id, product_id: c.product_id, product_name: c.product_name, qty: c.qty, unit_price: c.unit_price, discount_pct: c.discount_pct, line_total: c.line_total })));
    for (const item of cart) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod) await supabase.from('products').update({ stock_qty: Math.max(0, prod.stock_qty - item.qty) }).eq('id', item.product_id);
    }
    setLastReceipt({ ...saleData, lines: cart, customer_name: customer?.name || null });
    setShowPay(false);
    setShowSuccess(true);
    setProcessing(false);
    await loadAll();
    clearOrder();
  }

  // ── Receipt PDF ──
  function printReceipt(r: any) {
    const doc = new jsPDF({ unit: 'mm', format: [80, 220] });
    let y = 8;
    const co = settings;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(co.company_name || 'POINT OF SALE', 40, y, { align: 'center' }); y += 5;
    if (co.address) { doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text(co.address, 40, y, { align: 'center' }); y += 4; }
    doc.setFontSize(7); doc.text('─'.repeat(44), 40, y, { align: 'center' }); y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('RECEIPT', 40, y, { align: 'center' }); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(r.sale_number, 2, y);
    doc.text(new Date(r.date).toLocaleString('en-LK'), 78, y, { align: 'right' }); y += 3;
    if (r.customer_name) { doc.text('Customer: ' + r.customer_name, 2, y); y += 3; }
    doc.text('─'.repeat(44), 40, y, { align: 'center' }); y += 4;
    for (const l of r.lines) {
      doc.text(l.product_name.slice(0, 30), 2, y); y += 3;
      const d = `  ${l.qty} × Rs.${l.unit_price.toLocaleString()}${l.discount_pct ? ` (−${l.discount_pct}%)` : ''}`;
      doc.text(d, 2, y);
      doc.text('Rs.' + l.line_total.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' }); y += 4;
    }
    doc.text('─'.repeat(44), 40, y, { align: 'center' }); y += 4;
    doc.text('Subtotal:', 2, y); doc.text('Rs.' + r.subtotal.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' }); y += 3;
    if (r.discount > 0) { doc.text('Discount:', 2, y); doc.text('−Rs.' + r.discount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' }); y += 3; }
    if (r.tax_amount > 0) { doc.text(`Tax (${taxRate}%):`, 2, y); doc.text('Rs.' + r.tax_amount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' }); y += 3; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('TOTAL:', 2, y); doc.text('Rs.' + r.total.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' }); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text('Payment: ' + r.payment_method, 2, y); y += 3;
    if (r.payment_method === 'Cash') {
      doc.text('Tendered: Rs.' + r.amount_tendered.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 2, y); y += 3;
      doc.setFont('helvetica', 'bold');
      doc.text('Change: Rs.' + r.change_due.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 2, y); y += 5;
      doc.setFont('helvetica', 'normal');
    }
    doc.text('─'.repeat(44), 40, y, { align: 'center' }); y += 4;
    doc.text('Thank you!', 40, y, { align: 'center' }); y += 3;
    doc.text('Powered by Aurax Books', 40, y, { align: 'center' });
    doc.save(r.sale_number + '.pdf');
  }

  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const filteredProducts = products.filter((p) => {
    const matchCat = catFilter === 'all' || p.category_id === catFilter;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  if (loading) return <div className="empty-state"><p>Loading Point of Sale...</p></div>;

  // ── HISTORY VIEW ──
  if (view === 'history') {
    const todaySales = sales.filter((s) => new Date(s.date).toDateString() === new Date().toDateString());
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Point of Sale — History</div>
            <div className="page-sub">{sales.length} total sales</div>
          </div>
          <button className="btn btn-primary" onClick={() => setView('pos')}>Open Terminal</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: "Today's Sales",   value: todaySales.length },
            { label: "Today's Revenue", value: fmt(todaySales.reduce((a, s) => a + s.total, 0)) },
            { label: 'Total Sales',     value: sales.length },
            { label: 'All-Time Revenue',value: fmt(sales.reduce((a, s) => a + s.total, 0)) },
          ].map((k) => (
            <div key={k.label} className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)' }}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="table-wrap">
          <div className="table-toolbar">
            <h3>Sales</h3>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input placeholder="Search..." value={histSearch} onChange={(e) => setHistSearch(e.target.value)} />
            </div>
          </div>
          {sales.filter((s) => !histSearch || s.sale_number.includes(histSearch) || (s.customer_name || '').toLowerCase().includes(histSearch.toLowerCase())).length === 0
            ? <div className="empty-state"><div className="empty-state-icon">🛒</div><h3>No sales yet</h3></div>
            : (
              <table>
                <thead><tr><th>Sale #</th><th>Date & Time</th><th>Customer</th><th>Payment</th><th>Total</th><th>Change</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {sales.filter((s) => !histSearch || s.sale_number.includes(histSearch) || (s.customer_name || '').toLowerCase().includes(histSearch.toLowerCase())).map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{s.sale_number}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{new Date(s.date).toLocaleString('en-LK')}</td>
                      <td>{s.customer_name || <span style={{ color: 'var(--text3)' }}>Walk-in</span>}</td>
                      <td>{s.payment_method}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(s.total)}</td>
                      <td>{s.payment_method === 'Cash' ? fmt(s.change_due) : '—'}</td>
                      <td><span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>{s.status}</span></td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={async () => {
                          const { data: lines } = await supabase.from('pos_sale_lines').select('*').eq('sale_id', s.id);
                          printReceipt({ ...s, lines: lines || [] });
                        }}>PDF</button>
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

  // ── NUMPAD KEYS ──
  const numpadKeys = ['7','8','9','4','5','6','1','2','3','.','0','back'];

  // ── FULL-SCREEN POS TERMINAL ──
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: '#f3f4f6', fontFamily: 'inherit' }}>

      {/* ── SUCCESS OVERLAY ── */}
      {showSuccess && lastReceipt && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', width: 360, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Payment Received</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>{lastReceipt.sale_number}</div>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: '16px 20px', marginBottom: 20, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#6b7280' }}>Total</span><span style={{ fontWeight: 700 }}>{fmt(lastReceipt.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: lastReceipt.payment_method === 'Cash' ? 8 : 0 }}>
                <span style={{ color: '#6b7280' }}>Method</span><span>{lastReceipt.payment_method}</span>
              </div>
              {lastReceipt.payment_method === 'Cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: '#6b7280' }}>Tendered</span><span>{fmt(lastReceipt.amount_tendered)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#16a34a' }}>
                    <span>Change</span><span>{fmt(lastReceipt.change_due)}</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => printReceipt(lastReceipt)} style={{ flex: 1, height: 42, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>🖨 Receipt</button>
              <button onClick={() => setShowSuccess(false)} style={{ flex: 1, height: 42, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>New Sale</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {showPay && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Payment</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Total: <strong style={{ color: 'var(--brand)', fontSize: 16 }}>{fmt(total)}</strong></div>

            {/* Method selection */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['Cash', 'Card', 'Bank Transfer'].map((m) => (
                <button key={m} onClick={() => { setPayMethod(m); setCashBuf(''); }} style={{ flex: 1, height: 40, border: '2px solid', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, borderColor: payMethod === m ? 'var(--brand)' : '#e5e7eb', background: payMethod === m ? 'var(--brand)' : '#fff', color: payMethod === m ? '#fff' : '#374151' }}>{m}</button>
              ))}
            </div>

            {/* Cash numpad */}
            {payMethod === 'Cash' && (
              <>
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Amount Tendered</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: cashBuf ? '#111' : '#d1d5db' }}>{cashBuf ? 'Rs. ' + parseFloat(cashBuf).toLocaleString('en-LK', { minimumFractionDigits: 2 }) : 'Rs. 0.00'}</div>
                  {tendered >= total && total > 0 && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>Change: {fmt(changeDue)}</div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                  {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
                    <button key={k} onClick={() => {
                      const key = k === '⌫' ? 'back' : k;
                      setCashBuf((b) => key === 'back' ? b.slice(0,-1) : (key === '.' && b.includes('.')) ? b : b + key);
                    }} style={{ height: 48, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 18, fontWeight: 600, cursor: 'pointer', background: k === '⌫' ? '#fee2e2' : '#f9fafb', color: k === '⌫' ? '#dc2626' : '#111' }}>{k}</button>
                  ))}
                </div>
                {/* Quick cash shortcuts */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[500, 1000, 2000, 5000].filter((v) => v >= total).slice(0, 4).map((v) => (
                    <button key={v} onClick={() => setCashBuf(String(v))} style={{ padding: '4px 12px', border: '1px solid var(--brand)', borderRadius: 20, background: '#fff', color: 'var(--brand)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Rs. {v.toLocaleString()}</button>
                  ))}
                  <button onClick={() => setCashBuf(total.toFixed(2))} style={{ padding: '4px 12px', border: '1px solid #10b981', borderRadius: 20, background: '#fff', color: '#10b981', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Exact</button>
                </div>
              </>
            )}

            {payMethod !== 'Cash' && (
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '16px', marginBottom: 16, textAlign: 'center', color: '#15803d', fontWeight: 600, fontSize: 14 }}>
                Confirm {payMethod} payment of {fmt(total)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowPay(false)} style={{ flex: 1, height: 46, background: '#f3f4f6', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button
                onClick={handleCharge}
                disabled={processing || (payMethod === 'Cash' && tendered < total)}
                style={{ flex: 2, height: 46, background: (processing || (payMethod === 'Cash' && tendered < total)) ? '#9ca3af' : '#16a34a', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 16 }}
              >
                {processing ? 'Processing...' : `✓ Confirm ${fmt(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div style={{ height: 56, background: '#1e1b4b', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, flexShrink: 0 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: '0.5px' }}>POINT OF SALE</span>
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />
        {/* Customer picker */}
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ height: 34, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
          <option value="">👤 Walk-in Customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.6 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." style={{ height: 34, width: 220, paddingLeft: 32, paddingRight: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }} />
        </div>

        <button onClick={() => setView('history')} style={{ height: 34, padding: '0 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>📋 History</button>
        <button onClick={() => nav?.('dashboard')} style={{ height: 34, padding: '0 14px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', overflow: 'hidden' }}>

        {/* ── LEFT: Products ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 14px', background: '#fff', borderBottom: '1px solid #e5e7eb', overflowX: 'auto', flexShrink: 0 }}>
            {[{ id: 'all', name: 'All Products' }, ...categories].map((cat) => (
              <button key={cat.id} onClick={() => setCatFilter(cat.id)} style={{ whiteSpace: 'nowrap', padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: catFilter === cat.id ? 'var(--brand)' : '#f3f4f6', color: catFilter === cat.id ? '#fff' : '#374151', transition: 'all 0.15s' }}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12, alignContent: 'start' }}>
            {filteredProducts.map((p) => {
              const color = cardColor(p.name);
              const outOfStock = p.stock_qty <= 0;
              return (
                <button key={p.id} onClick={() => addToCart(p)} disabled={outOfStock} style={{ border: 'none', borderRadius: 12, overflow: 'hidden', cursor: outOfStock ? 'not-allowed' : 'pointer', textAlign: 'left', padding: 0, opacity: outOfStock ? 0.5 : 1, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', transition: 'transform 0.1s, box-shadow 0.1s', background: '#fff' }}
                  onMouseEnter={(e) => { if (!outOfStock) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'; }}
                >
                  {/* Colored top */}
                  <div style={{ height: 72, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 28, opacity: 0.9 }}>📦</span>
                  </div>
                  {/* Info */}
                  <div style={{ padding: '10px 10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color }}>{fmt(p.sales_price)}</div>
                    <div style={{ fontSize: 11, color: p.stock_qty <= 5 ? '#d97706' : '#9ca3af', marginTop: 3 }}>
                      {outOfStock ? 'Out of stock' : `Stock: ${p.stock_qty}`}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 20px', color: '#9ca3af', fontSize: 14 }}>No products found</div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Order panel ── */}
        <div style={{ background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Order header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>
              Order <span style={{ color: '#9ca3af', fontWeight: 500 }}>({cart.length})</span>
            </div>
            {cart.length > 0 && <button onClick={clearOrder} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗑 Clear</button>}
          </div>

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {cart.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
                <div style={{ fontSize: 14 }}>Tap a product to start</div>
              </div>
            ) : (
              cart.map((item, i) => {
                const selected = selectedIdx === i;
                return (
                  <div key={i} onClick={() => { setSelectedIdx(i); setNumpadMode('qty'); setNumpadBuf(String(item.qty)); }}
                    style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selected ? '#f5f3ff' : '#fff', borderLeft: selected ? '3px solid var(--brand)' : '3px solid transparent', transition: 'background 0.1s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, paddingRight: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{item.product_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          {item.qty} × Rs.{item.unit_price.toLocaleString()}
                          {item.discount_pct > 0 && <span style={{ color: '#ef4444', marginLeft: 6 }}>−{item.discount_pct}%</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand)' }}>
                          {fmt(item.line_total)}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeCartItem(i); }} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Totals */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#ef4444', marginBottom: 4 }}><span>Discount</span><span>−{fmt(discount)}</span></div>}
            {taxAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', marginBottom: 4 }}><span>Tax ({taxRate}%)</span><span>{fmt(taxAmt)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: '#111', paddingTop: 6, borderTop: '2px solid #e5e7eb', marginTop: 4 }}>
              <span>Total</span><span style={{ color: 'var(--brand)' }}>{fmt(total)}</span>
            </div>
          </div>

          {/* Numpad mode tabs */}
          <div style={{ display: 'flex', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
            {(['qty', 'disc', 'price'] as NumpadMode[]).map((m) => (
              <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, height: 36, border: 'none', background: numpadMode === m ? '#1e1b4b' : '#f9fafb', color: numpadMode === m ? '#fff' : '#374151', fontWeight: 700, fontSize: 12, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: numpadMode === m ? 'none' : '1px solid #e5e7eb' }}>
                {m === 'qty' ? 'Qty' : m === 'disc' ? 'Disc %' : 'Price'}
              </button>
            ))}
          </div>

          {/* Numpad display */}
          <div style={{ background: '#1e1b4b', padding: '8px 16px', textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{numpadMode === 'qty' ? 'Quantity' : numpadMode === 'disc' ? 'Discount %' : 'Unit Price'}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', minHeight: 34 }}>{numpadBuf || (selectedIdx === null ? '—' : '0')}</div>
          </div>

          {/* Numpad grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e5e7eb', flexShrink: 0 }}>
            {numpadKeys.map((k) => (
              <button key={k} onClick={() => handleNumpad(k)} style={{ height: 52, border: 'none', background: k === 'back' ? '#fef2f2' : '#fff', color: k === 'back' ? '#dc2626' : '#111', fontSize: k === 'back' ? 20 : 18, fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseDown={(e) => { e.currentTarget.style.background = k === 'back' ? '#fee2e2' : '#f3f4f6'; }}
                onMouseUp={(e) => { e.currentTarget.style.background = k === 'back' ? '#fef2f2' : '#fff'; }}
              >
                {k === 'back' ? '⌫' : k}
              </button>
            ))}
          </div>

          {/* Discount row */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#f9fafb' }}>
            <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Order Discount (Rs.)</span>
            <input type="number" value={discount || ''} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} placeholder="0" style={{ flex: 1, height: 30, border: '1px solid #e5e7eb', borderRadius: 6, padding: '0 8px', fontSize: 13, background: '#fff' }} />
          </div>

          {/* Charge button */}
          <button onClick={() => { if (cart.length) setShowPay(true); }} disabled={cart.length === 0}
            style={{ height: 56, border: 'none', background: cart.length === 0 ? '#9ca3af' : '#16a34a', color: '#fff', fontWeight: 800, fontSize: 18, cursor: cart.length ? 'pointer' : 'not-allowed', flexShrink: 0, letterSpacing: '0.5px', transition: 'background 0.15s' }}>
            {cart.length === 0 ? 'Add items to charge' : `💳  Charge  ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Product {
  id: string;
  name: string;
  sales_price: number;
  cost_price: number;
  stock_qty: number;
  category?: string;
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
  status: string;
}

const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer'];

export default function PointOfSale() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>({});
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'terminal' | 'history'>('terminal');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [overallDiscount, setOverallDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [notes, setNotes] = useState('');

  // Checkout state
  const [processing, setProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // History
  const [histSearch, setHistSearch] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (view === 'terminal') searchRef.current?.focus();
  }, [view]);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [prodRes, custRes, settRes, salesRes] = await Promise.all([
      supabase.from('products').select('id,name,sales_price,cost_price,stock_qty').eq('user_id', user.id).order('name'),
      supabase.from('customers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('pos_sales').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(100),
    ]);
    setProducts(prodRes.data || []);
    setCustomers(custRes.data || []);
    setCompanySettings(settRes.data || {});
    setSales(salesRes.data || []);
    setLoading(false);
  }

  // ── CART LOGIC ──
  function addToCart(p: Product) {
    if (p.stock_qty <= 0) return;
    setCart((prev) => {
      const existing = prev.findIndex((c) => c.product_id === p.id);
      if (existing >= 0) {
        const updated = [...prev];
        const item = { ...updated[existing] };
        if (item.qty >= p.stock_qty) return prev;
        item.qty += 1;
        item.line_total = item.qty * item.unit_price * (1 - item.discount_pct / 100);
        updated[existing] = item;
        return updated;
      }
      return [...prev, {
        product_id: p.id,
        product_name: p.name,
        qty: 1,
        unit_price: p.sales_price,
        discount_pct: 0,
        line_total: p.sales_price,
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function updateCartQty(i: number, qty: number) {
    if (qty <= 0) { removeFromCart(i); return; }
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[i], qty };
      item.line_total = item.qty * item.unit_price * (1 - item.discount_pct / 100);
      updated[i] = item;
      return updated;
    });
  }

  function updateCartDiscount(i: number, disc: number) {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[i], discount_pct: disc };
      item.line_total = item.qty * item.unit_price * (1 - disc / 100);
      updated[i] = item;
      return updated;
    });
  }

  function updateCartPrice(i: number, price: number) {
    setCart((prev) => {
      const updated = [...prev];
      const item = { ...updated[i], unit_price: price };
      item.line_total = item.qty * price * (1 - item.discount_pct / 100);
      updated[i] = item;
      return updated;
    });
  }

  function removeFromCart(i: number) {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
  }

  function clearCart() {
    setCart([]);
    setOverallDiscount(0);
    setAmountTendered('');
    setCustomerId('');
    setNotes('');
    setPaymentMethod('Cash');
    setSearch('');
    searchRef.current?.focus();
  }

  // ── TOTALS ──
  const subtotal = cart.reduce((s, c) => s + c.line_total, 0);
  const discountAmt = overallDiscount;
  const taxRate = parseFloat(companySettings.tax_rate || '0');
  const taxAmt = ((subtotal - discountAmt) * taxRate) / 100;
  const total = subtotal - discountAmt + taxAmt;
  const tendered = parseFloat(amountTendered) || 0;
  const changeDue = Math.max(0, tendered - total);

  // ── SALE NUMBER ──
  function generateSaleNumber() {
    if (sales.length === 0) return 'POS-0001';
    const nums = sales.map((s) => { const m = s.sale_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'POS-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  // ── CHECKOUT ──
  async function handleCheckout() {
    if (cart.length === 0) return;
    if (paymentMethod === 'Cash' && tendered < total) {
      alert('Amount tendered is less than total.');
      return;
    }
    setProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProcessing(false); return; }

    const saleNumber = generateSaleNumber();
    const customer = customers.find((c) => c.id === customerId);

    const { data: saleData, error } = await supabase.from('pos_sales').insert({
      user_id: user.id,
      sale_number: saleNumber,
      customer_id: customerId || null,
      customer_name: customer?.name || null,
      subtotal,
      discount: discountAmt,
      tax_amount: taxAmt,
      total,
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === 'Cash' ? tendered : total,
      change_due: paymentMethod === 'Cash' ? changeDue : 0,
      notes,
      status: 'Completed',
    }).select().single();

    if (error || !saleData) {
      alert('Failed to save sale: ' + (error?.message || 'Unknown error'));
      setProcessing(false);
      return;
    }

    // Insert lines
    await supabase.from('pos_sale_lines').insert(
      cart.map((c) => ({
        sale_id: saleData.id,
        product_id: c.product_id,
        product_name: c.product_name,
        qty: c.qty,
        unit_price: c.unit_price,
        discount_pct: c.discount_pct,
        line_total: c.line_total,
      }))
    );

    // Deduct stock
    for (const item of cart) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod) {
        await supabase.from('products').update({ stock_qty: Math.max(0, prod.stock_qty - item.qty) }).eq('id', item.product_id);
      }
    }

    const receiptData = {
      ...saleData,
      lines: cart,
      customer_name: customer?.name || null,
      change_due: paymentMethod === 'Cash' ? changeDue : 0,
    };

    setLastReceipt(receiptData);
    setShowReceipt(true);
    setProcessing(false);
    await loadData();
    clearCart();
  }

  // ── RECEIPT PDF ──
  function printReceipt(receipt: any) {
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
    const company = companySettings;
    let y = 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'AURAX BOOKS', 40, y, { align: 'center' });
    y += 5;

    if (company.address) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(company.address, 40, y, { align: 'center' });
      y += 4;
    }

    doc.setFontSize(7);
    doc.text('─'.repeat(42), 40, y, { align: 'center' });
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('RECEIPT', 40, y, { align: 'center' });
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(receipt.sale_number, 2, y);
    doc.text(new Date(receipt.date).toLocaleString('en-LK'), 78, y, { align: 'right' });
    y += 3;

    if (receipt.customer_name) {
      doc.text('Customer: ' + receipt.customer_name, 2, y);
      y += 3;
    }

    doc.text('─'.repeat(42), 40, y, { align: 'center' });
    y += 4;

    for (const line of receipt.lines) {
      doc.text(line.product_name.slice(0, 28), 2, y);
      y += 3;
      const lineDesc = `  ${line.qty} x Rs.${line.unit_price.toLocaleString()}${line.discount_pct ? ` (-${line.discount_pct}%)` : ''}`;
      doc.text(lineDesc, 2, y);
      doc.text('Rs. ' + line.line_total.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' });
      y += 4;
    }

    doc.text('─'.repeat(42), 40, y, { align: 'center' });
    y += 4;

    doc.text('Subtotal:', 2, y);
    doc.text('Rs. ' + receipt.subtotal.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' });
    y += 3;

    if (receipt.discount > 0) {
      doc.text('Discount:', 2, y);
      doc.text('- Rs. ' + receipt.discount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' });
      y += 3;
    }

    if (receipt.tax_amount > 0) {
      doc.text(`Tax (${taxRate}%):`, 2, y);
      doc.text('Rs. ' + receipt.tax_amount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' });
      y += 3;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL:', 2, y);
    doc.text('Rs. ' + receipt.total.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 78, y, { align: 'right' });
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Payment: ' + receipt.payment_method, 2, y);
    y += 3;

    if (receipt.payment_method === 'Cash') {
      doc.text('Tendered: Rs. ' + receipt.amount_tendered.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 2, y);
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.text('Change: Rs. ' + receipt.change_due.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 2, y);
      doc.setFont('helvetica', 'normal');
      y += 4;
    }

    doc.text('─'.repeat(42), 40, y, { align: 'center' });
    y += 4;
    doc.text('Thank you for your purchase!', 40, y, { align: 'center' });
    y += 3;
    doc.text('Powered by Aurax Books', 40, y, { align: 'center' });

    doc.save(receipt.sale_number + '-receipt.pdf');
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      {/* Receipt Modal */}
      {showReceipt && lastReceipt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--brand)', marginBottom: '4px' }}>Sale Complete!</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>{lastReceipt.sale_number}</div>
            <div style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text2)' }}>Total</span>
                <span style={{ fontWeight: 700 }}>{fmt(lastReceipt.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text2)' }}>Payment</span>
                <span>{lastReceipt.payment_method}</span>
              </div>
              {lastReceipt.payment_method === 'Cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text2)' }}>Tendered</span>
                    <span>{fmt(lastReceipt.amount_tendered)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, color: 'var(--green, #16a34a)' }}>
                    <span>Change Due</span>
                    <span>{fmt(lastReceipt.change_due)}</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => printReceipt(lastReceipt)}>
                Print Receipt
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReceipt(false)}>
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Point of Sale</div>
          <div className="page-sub">Walk-in sales terminal</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${view === 'terminal' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('terminal')}
          >
            Terminal
          </button>
          <button
            className={`btn ${view === 'history' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('history')}
          >
            Sales History
          </button>
        </div>
      </div>

      {/* ── TERMINAL VIEW ── */}
      {view === 'terminal' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', height: 'calc(100vh - 140px)', minHeight: '600px' }}>

          {/* LEFT: Product Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
            {/* Search bar */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: '16px' }}>🔍</span>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name..."
                style={{ width: '100%', paddingLeft: '38px', paddingRight: '12px', height: '44px', fontSize: '14px', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg)', color: 'var(--text1)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--brand)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Product grid */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', alignContent: 'start' }}>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.stock_qty <= 0}
                  style={{
                    background: p.stock_qty <= 0 ? 'var(--bg2)' : 'var(--bg)',
                    border: '1.5px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: p.stock_qty <= 0 ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s',
                    opacity: p.stock_qty <= 0 ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (p.stock_qty > 0) (e.currentTarget.style.borderColor = 'var(--brand)'); }}
                  onMouseLeave={(e) => { (e.currentTarget.style.borderColor = 'var(--border)'); }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text1)', marginBottom: '6px', lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--brand)' }}>Rs. {p.sales_price.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: p.stock_qty <= 5 && p.stock_qty > 0 ? '#d97706' : 'var(--text3)', marginTop: '4px' }}>
                    {p.stock_qty <= 0 ? 'Out of stock' : `Stock: ${p.stock_qty}`}
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '13px' }}>
                  No products found
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Cart Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>

            {/* Cart header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>Cart <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({cart.length} item{cart.length !== 1 ? 's' : ''})</span></div>
              {cart.length > 0 && (
                <button onClick={clearCart} style={{ background: 'none', border: 'none', color: 'var(--red, #dc2626)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                  Clear All
                </button>
              )}
            </div>

            {/* Cart items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text3)', fontSize: '13px' }}>
                  Tap a product to add it to the cart
                </div>
              ) : (
                cart.map((item, i) => (
                  <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, flex: 1, paddingRight: '8px' }}>{item.product_name}</div>
                      <button onClick={() => removeFromCart(i)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 80px 60px', gap: '6px', alignItems: 'center' }}>
                      {/* Qty */}
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                        <button onClick={() => updateCartQty(i, item.qty - 1)} style={{ width: '24px', height: '28px', background: 'var(--bg2)', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text1)' }}>−</button>
                        <input
                          type="number"
                          value={item.qty}
                          min="1"
                          onChange={(e) => updateCartQty(i, parseFloat(e.target.value) || 1)}
                          style={{ width: '22px', textAlign: 'center', border: 'none', background: 'transparent', fontSize: '13px', padding: 0, color: 'var(--text1)' }}
                        />
                        <button onClick={() => updateCartQty(i, item.qty + 1)} style={{ width: '24px', height: '28px', background: 'var(--bg2)', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text1)' }}>+</button>
                      </div>
                      {/* Price */}
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateCartPrice(i, parseFloat(e.target.value) || 0)}
                        style={{ height: '28px', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 6px', fontSize: '12px', background: 'var(--bg)', color: 'var(--text1)', width: '100%', boxSizing: 'border-box' }}
                      />
                      {/* Disc% */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number"
                          value={item.discount_pct}
                          min="0"
                          max="100"
                          onChange={(e) => updateCartDiscount(i, parseFloat(e.target.value) || 0)}
                          style={{ height: '28px', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 18px 0 6px', fontSize: '12px', background: 'var(--bg)', color: 'var(--text1)', width: '100%', boxSizing: 'border-box' }}
                        />
                        <span style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text3)' }}>%</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--brand)', marginTop: '6px' }}>
                      {fmt(item.line_total)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Payment section */}
            <div style={{ borderTop: '2px solid var(--border)', padding: '14px 16px', background: 'var(--bg2)' }}>
              {/* Customer (optional) */}
              <div style={{ marginBottom: '10px' }}>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  style={{ width: '100%', height: '34px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text1)', fontSize: '12px', padding: '0 8px' }}
                >
                  <option value="">Walk-in Customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Overall discount */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>Discount (Rs.)</span>
                <input
                  type="number"
                  value={overallDiscount || ''}
                  onChange={(e) => setOverallDiscount(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  style={{ flex: 1, height: '34px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text1)', fontSize: '12px', padding: '0 8px' }}
                />
              </div>

              {/* Totals */}
              <div style={{ marginBottom: '10px' }}>
                {discountAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    <span>Subtotal</span><span>{fmt(subtotal)}</span>
                  </div>
                )}
                {discountAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
                    <span>Discount</span><span>− {fmt(discountAmt)}</span>
                  </div>
                )}
                {taxAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    <span>Tax ({taxRate}%)</span><span>{fmt(taxAmt)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 800, color: 'var(--brand)', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <span>TOTAL</span><span>{fmt(total)}</span>
                </div>
              </div>

              {/* Payment method */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    style={{
                      flex: 1, height: '34px', border: '1.5px solid', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                      borderColor: paymentMethod === m ? 'var(--brand)' : 'var(--border)',
                      background: paymentMethod === m ? 'var(--brand)' : 'var(--bg)',
                      color: paymentMethod === m ? '#fff' : 'var(--text2)',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Cash tendered */}
              {paymentMethod === 'Cash' && (
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="number"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    placeholder="Amount tendered (Rs.)"
                    style={{ width: '100%', height: '38px', border: '1.5px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text1)', fontSize: '14px', padding: '0 10px', boxSizing: 'border-box' }}
                  />
                  {tendered >= total && total > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800, color: '#16a34a', marginTop: '6px' }}>
                      <span>Change Due</span><span>{fmt(changeDue)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Charge button */}
              <button
                className="btn btn-primary"
                onClick={handleCheckout}
                disabled={processing || cart.length === 0 || (paymentMethod === 'Cash' && tendered < total && total > 0)}
                style={{ width: '100%', height: '48px', fontSize: '16px', fontWeight: 800, borderRadius: '8px' }}
              >
                {processing ? 'Processing...' : `Charge ${fmt(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === 'history' && (
        <div>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
            {[
              { label: 'Total Sales', value: sales.length },
              { label: 'Today\'s Sales', value: sales.filter((s) => new Date(s.date).toDateString() === new Date().toDateString()).length },
              { label: 'Today\'s Revenue', value: fmt(sales.filter((s) => new Date(s.date).toDateString() === new Date().toDateString()).reduce((a, s) => a + s.total, 0)) },
              { label: 'All-Time Revenue', value: fmt(sales.reduce((a, s) => a + s.total, 0)) },
            ].map((k) => (
              <div key={k.label} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{k.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand)' }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div className="table-wrap">
            <div className="table-toolbar">
              <h3>Sales History</h3>
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input placeholder="Search sales..." value={histSearch} onChange={(e) => setHistSearch(e.target.value)} />
              </div>
            </div>
            {sales.filter((s) =>
              s.sale_number?.toLowerCase().includes(histSearch.toLowerCase()) ||
              s.customer_name?.toLowerCase().includes(histSearch.toLowerCase())
            ).length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🛒</div>
                <h3>No sales yet</h3>
                <p>Complete a sale from the Terminal to see it here</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Sale #</th>
                    <th>Date & Time</th>
                    <th>Customer</th>
                    <th>Payment</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {sales
                    .filter((s) =>
                      s.sale_number?.toLowerCase().includes(histSearch.toLowerCase()) ||
                      (s.customer_name || '').toLowerCase().includes(histSearch.toLowerCase())
                    )
                    .map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{s.sale_number}</td>
                        <td style={{ color: 'var(--text2)', fontSize: '12px' }}>{new Date(s.date).toLocaleString('en-LK')}</td>
                        <td>{s.customer_name || <span style={{ color: 'var(--text3)' }}>Walk-in</span>}</td>
                        <td>{s.payment_method}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(s.total)}</td>
                        <td>
                          <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                            {s.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              const { data: lines } = await supabase.from('pos_sale_lines').select('*').eq('sale_id', s.id);
                              printReceipt({ ...s, lines: lines || [], change_due: (s as any).change_due || 0 });
                            }}
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import md5 from 'md5';
import { supabase } from '../supabase';

const PAYHERE_MERCHANT = '1233250';
const PAYHERE_SECRET = 'MTIzNDU0OTgxNDMyNzE1OTQ2NTMzMTIzMTI2MDczMTA3MzAxNTM5Ng==';

interface PortalCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  credit_limit: number;
  balance: number;
}

interface PortalInvoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  total: number;
  status: string;
}

interface PortalOrder {
  id: string;
  so_number: string;
  date: string;
  total: number;
  status: string;
}

interface PortalReceipt {
  id: string;
  receipt_number: string;
  date: string;
  amount: number;
  payment_method: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:     { bg: '#f3f4f6', color: '#374151' },
  sent:      { bg: '#dbeafe', color: '#1d4ed8' },
  paid:      { bg: '#dcfce7', color: '#16a34a' },
  overdue:   { bg: '#fee2e2', color: '#dc2626' },
  partial:   { bg: '#fef3c7', color: '#d97706' },
  confirmed: { bg: '#dcfce7', color: '#16a34a' },
  pending:   { bg: '#fef9c3', color: '#a16207' },
  cancelled: { bg: '#fee2e2', color: '#dc2626' },
  delivered: { bg: '#f0fdf4', color: '#15803d' },
};

function statusBadge(status: string) {
  const s = STATUS_COLORS[status] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function fmt(n: number) {
  return 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CustomerPortal() {
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [receipts, setReceipts] = useState<PortalReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: cpu } = await supabase
      .from('customer_portal_users')
      .select('customer_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!cpu) { setLoading(false); return; }
    const cid = cpu.customer_id;

    const [{ data: cust }, { data: inv }, { data: ord }, { data: rec }] = await Promise.all([
      supabase.from('customers').select('id,name,email,phone,address,credit_limit,balance').eq('id', cid).single(),
      supabase.from('invoices').select('id,invoice_number,date,due_date,total,status').eq('customer_id', cid).order('date', { ascending: false }),
      supabase.from('sales_orders').select('id,so_number,date,total,status').eq('customer_id', cid).order('date', { ascending: false }),
      supabase.from('receipts').select('id,receipt_number,date,amount,payment_method').eq('customer_id', cid).order('date', { ascending: false }),
    ]);

    setCustomer(cust || null);
    setInvoices(inv || []);
    setOrders(ord || []);
    setReceipts(rec || []);
    setLoading(false);
  }

  const outstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  const overdueInvoices = invoices.filter(i => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'paid' && i.status !== 'cancelled');

  function submitPayHere(amountNum: number, orderId: string, itemsDesc: string) {
    if (!customer) return;
    const amount = amountNum.toFixed(2);
    const currency = 'LKR';
    const secretHash = md5(PAYHERE_SECRET).toUpperCase();
    const hash = md5(PAYHERE_MERCHANT + orderId + amount + currency + secretHash).toUpperCase();

    const nameParts = customer.name.trim().split(' ');
    const fields: Record<string, string> = {
      merchant_id: PAYHERE_MERCHANT,
      return_url: window.location.origin + window.location.pathname,
      cancel_url: window.location.origin + window.location.pathname,
      notify_url: '',
      order_id: orderId,
      items: itemsDesc,
      currency,
      amount,
      first_name: nameParts[0] || customer.name,
      last_name: nameParts.slice(1).join(' ') || '',
      email: customer.email || '',
      phone: customer.phone || '0000000000',
      address: customer.address || 'Sri Lanka',
      city: 'Colombo',
      country: 'Sri Lanka',
      hash,
    };

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.payhere.lk/pay/checkout';
    form.style.display = 'none';
    for (const [k, v] of Object.entries(fields)) {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = k; inp.value = v;
      form.appendChild(inp);
    }
    document.body.appendChild(form);
    form.submit();
  }

  function payInvoice(inv: PortalInvoice) {
    const orderId = `PORTAL-INV-${inv.id.slice(0, 8)}-${Date.now()}`;
    submitPayHere(inv.total, orderId, `Invoice ${inv.invoice_number}`);
  }

  function payAllOutstanding() {
    const orderId = `PORTAL-BAL-${customer!.id.slice(0, 8)}-${Date.now()}`;
    submitPayHere(outstanding, orderId, `Outstanding Balance — ${customer!.name}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📒</div>
          <div style={{ fontWeight: 700, color: '#7c3aed' }}>Loading your portal...</div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h2 style={{ color: '#374151', marginBottom: 8 }}>Portal Access Not Set Up</h2>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>Your account doesn't have portal access yet. Please contact the company to activate your portal.</p>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7ff' }}>
      {/* Portal Header */}
      <div style={{ background: '#7c3aed', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'white', fontWeight: 900, fontSize: 18, letterSpacing: '-0.5px' }}>AURAX BOOKS</span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>/ Customer Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Welcome, <strong>{customer.name}</strong></span>
          <button onClick={() => supabase.auth.signOut()} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* Pay outstanding banner */}
        {outstanding > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', borderRadius: 12, padding: '20px 28px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 }}>Total Outstanding Balance</div>
              <div style={{ color: 'white', fontSize: 28, fontWeight: 900 }}>{fmt(outstanding)}</div>
            </div>
            <button onClick={payAllOutstanding}
              style={{ background: 'white', color: '#7c3aed', border: 'none', borderRadius: 10, padding: '12px 28px', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="https://www.payhere.lk/downloads/images/payhere_short_banner.png" alt="PayHere" style={{ height: 20 }} />
              Pay All Outstanding
            </button>
          </div>
        )}

        {/* Overdue alert */}
        {overdueInvoices.length > 0 && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <strong style={{ color: '#dc2626' }}>Overdue Invoices</strong>
              <span style={{ color: '#dc2626', fontSize: 13, marginLeft: 8 }}>{overdueInvoices.length} invoice{overdueInvoices.length > 1 ? 's' : ''} past due date — please contact us to arrange payment.</span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Outstanding Balance', value: fmt(outstanding), color: outstanding > 0 ? '#dc2626' : '#16a34a', icon: '💳' },
            { label: 'Total Paid', value: fmt(totalPaid), color: '#16a34a', icon: '✅' },
            { label: 'Total Invoices', value: invoices.length, color: '#7c3aed', icon: '📄' },
            { label: 'Sales Orders', value: orders.length, color: '#0284c7', icon: '📦' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#ede9fe', padding: 4, borderRadius: 10, marginBottom: 24, width: 'fit-content' }}>
          {['Invoices', 'Sales Orders', 'Payments', 'My Profile'].map((t, i) => (
            <button key={t} onClick={() => setActiveTab(i)}
              style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: activeTab === i ? '#7c3aed' : 'transparent', color: activeTab === i ? 'white' : '#7c3aed', fontWeight: activeTab === i ? 700 : 500, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Invoices Tab */}
        {activeTab === 0 && (
          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Your Invoices</h3>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
            </div>
            {invoices.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>No invoices found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    {['Invoice #', 'Date', 'Due Date', 'Amount', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' && inv.status !== 'cancelled';
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#7c3aed' }}>{inv.invoice_number}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#374151' }}>{inv.date}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: isOverdue ? '#dc2626' : '#374151', fontWeight: isOverdue ? 700 : 400 }}>
                          {inv.due_date || '—'}{isOverdue ? ' ⚠' : ''}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{fmt(inv.total)}</td>
                        <td style={{ padding: '14px 20px' }}>{statusBadge(inv.status)}</td>
                        <td style={{ padding: '14px 20px' }}>
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button onClick={() => payInvoice(inv)}
                              style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Pay Now
                            </button>
                          )}
                          {inv.status === 'paid' && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Paid</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fafafa', borderTop: '2px solid #f3f4f6' }}>
                    <td colSpan={3} style={{ padding: '12px 20px', fontWeight: 700, fontSize: 14 }}>Outstanding Total</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: outstanding > 0 ? '#dc2626' : '#16a34a' }}>{fmt(outstanding)}</td>
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 1 && (
          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Your Sales Orders</h3>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
            </div>
            {orders.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>No orders found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    {['Order #', 'Date', 'Amount', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#7c3aed' }}>{o.so_number}</td>
                      <td style={{ padding: '14px 20px', fontSize: 14, color: '#374151' }}>{o.date}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{fmt(o.total)}</td>
                      <td style={{ padding: '14px 20px' }}>{statusBadge(o.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 2 && (
          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Payment History</h3>
              <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 700 }}>Total paid: {fmt(totalPaid)}</span>
            </div>
            {receipts.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>No payment records found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    {['Receipt #', 'Date', 'Payment Method', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#16a34a' }}>{r.receipt_number}</td>
                      <td style={{ padding: '14px 20px', fontSize: 14, color: '#374151' }}>{r.date}</td>
                      <td style={{ padding: '14px 20px', fontSize: 14, color: '#6b7280', textTransform: 'capitalize' }}>{r.payment_method || '—'}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#16a34a' }}>{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 3 && (
          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: 28 }}>
            <h3 style={{ margin: '0 0 24px', fontSize: 16, fontWeight: 700 }}>Your Profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {[
                { label: 'Company Name', value: customer.name },
                { label: 'Email', value: customer.email || '—' },
                { label: 'Phone', value: customer.phone || '—' },
                { label: 'Address', value: customer.address || '—' },
                { label: 'Credit Limit', value: fmt(customer.credit_limit || 0) },
                { label: 'Account Balance', value: fmt(customer.balance || 0) },
              ].map(f => (
                <div key={f.label} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, padding: '12px 16px', background: '#f8f7ff', borderRadius: 8, border: '1px solid #ede9fe', fontSize: 13, color: '#6b7280' }}>
              To update your profile information, please contact us directly.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

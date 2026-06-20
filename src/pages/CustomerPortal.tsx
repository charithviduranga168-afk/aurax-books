import { useState, useEffect } from 'react';
import md5 from 'md5';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

interface InvoiceLine {
  id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
}

interface FullInvoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  customer_name: string;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  paid_amount: number;
  balance: number;
  status: string;
  notes: string;
  lines: InvoiceLine[];
}

interface CompanySettings {
  company_name: string;
  address: string;
  phone: string;
  email: string;
  tax_reg: string;
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

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [fullInvoice, setFullInvoice] = useState<FullInvoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  async function openInvoice(invId: string) {
    setSelectedInvoiceId(invId);
    setFullInvoice(null);
    setDetailLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDetailLoading(false); return; }

    const { data: cpu } = await supabase
      .from('customer_portal_users')
      .select('admin_user_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    const [{ data: inv }, { data: lines }, { data: comp }] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', invId).single(),
      supabase.from('invoice_lines').select('id,product_name,qty,unit_price,discount_pct,line_total').eq('invoice_id', invId),
      cpu
        ? supabase.from('company_settings').select('company_name,address,phone,email,tax_reg').eq('user_id', cpu.admin_user_id).single()
        : Promise.resolve({ data: null }),
    ]);

    if (inv) setFullInvoice({ ...inv, lines: lines || [] });
    if (comp) setCompany(comp);
    setDetailLoading(false);
  }

  function downloadInvoicePDF() {
    if (!fullInvoice || !customer) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    // Purple header band
    doc.setFillColor(124, 58, 237);
    doc.rect(0, 0, pw, 42, 'F');

    // Company name (left)
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(company?.company_name || 'AURAX BOOKS', 14, 17);

    // "TAX INVOICE" label below
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 200, 255);
    doc.text('TAX INVOICE', 14, 25);

    // Company details (right)
    doc.setFontSize(8);
    doc.setTextColor(230, 220, 255);
    let ch = 11;
    if (company?.address) { doc.text(company.address, pw - 14, ch, { align: 'right' }); ch += 5; }
    if (company?.phone) { doc.text('Tel: ' + company.phone, pw - 14, ch, { align: 'right' }); ch += 5; }
    if (company?.email) { doc.text(company.email, pw - 14, ch, { align: 'right' }); ch += 5; }
    if (company?.tax_reg) { doc.text('Tax Reg: ' + company.tax_reg, pw - 14, ch, { align: 'right' }); }

    let y = 54;

    // Two-column info section
    // Left: Invoice details
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('INVOICE DETAILS', 14, y);

    // Right: Billed To
    doc.text('BILLED TO', pw / 2 + 4, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);

    const leftItems: [string, string][] = [
      ['Invoice No:', fullInvoice.invoice_number],
      ['Date:', fullInvoice.date || '—'],
      ['Due Date:', fullInvoice.due_date || '—'],
      ['Status:', fullInvoice.status.toUpperCase()],
    ];

    let ly = y;
    leftItems.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(label, 14, ly);
      doc.setFont('helvetica', 'normal');
      doc.text(value, 42, ly);
      ly += 5.5;
    });

    // Right column - customer info
    let ry = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(customer.name, pw / 2 + 4, ry);
    ry += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (customer.email) { doc.text(customer.email, pw / 2 + 4, ry); ry += 5; }
    if (customer.phone) { doc.text(customer.phone, pw / 2 + 4, ry); ry += 5; }
    if (customer.address) {
      const addrLines = doc.splitTextToSize(customer.address, 80);
      addrLines.forEach((l: string) => { doc.text(l, pw / 2 + 4, ry); ry += 5; });
    }

    // Divider line
    y = Math.max(ly, ry) + 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, pw - 14, y);
    y += 8;

    // Line items table
    const tableRows = fullInvoice.lines.map(l => [
      l.product_name,
      String(l.qty),
      fmt(l.unit_price),
      l.discount_pct ? l.discount_pct + '%' : '—',
      fmt(l.line_total),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Qty', 'Unit Price', 'Discount', 'Total']],
      body: tableRows.length > 0 ? tableRows : [['No items', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [124, 58, 237],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'left',
      },
      bodyStyles: { fontSize: 8.5, textColor: [50, 50, 50] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'right', cellWidth: 32 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 32 },
      },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 3 },
    });

    const tableEndY = (doc as any).lastAutoTable.finalY + 6;

    // Totals block
    const totX1 = pw - 80;
    const totX2 = pw - 14;
    let ty = tableEndY;

    const totalsRows: [string, string][] = [
      ['Subtotal', fmt(fullInvoice.subtotal || 0)],
    ];
    if ((fullInvoice.tax_amount || 0) > 0) totalsRows.push(['Tax', fmt(fullInvoice.tax_amount)]);
    if ((fullInvoice.discount || 0) > 0) totalsRows.push(['Discount', '- ' + fmt(fullInvoice.discount)]);

    doc.setFontSize(8.5);
    totalsRows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(label, totX1, ty);
      doc.text(value, totX2, ty, { align: 'right' });
      ty += 5.5;
    });

    // Total band
    doc.setFillColor(124, 58, 237);
    doc.roundedRect(totX1 - 4, ty - 1, totX2 - totX1 + 4 + 4, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL', totX1, ty + 6);
    doc.text(fmt(fullInvoice.total || 0), totX2, ty + 6, { align: 'right' });
    ty += 16;

    // Notes
    if (fullInvoice.notes) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text('Notes:', 14, ty);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const noteLines = doc.splitTextToSize(fullInvoice.notes, pw - 28);
      doc.text(noteLines, 14, ty + 5);
    }

    // Footer
    doc.setFillColor(124, 58, 237);
    doc.rect(0, ph - 14, pw, 14, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 200, 255);
    doc.text('Thank you for your business!', pw / 2, ph - 5, { align: 'center' });

    doc.save(`Invoice-${fullInvoice.invoice_number}.pdf`);
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

  function payInvoice(inv: PortalInvoice | FullInvoice) {
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

  // ─── Portal header (always visible) ──────────────────────────────────────
  const portalHeader = (
    <div style={{ background: '#7c3aed', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/logo.png" alt="Aurax Books" style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>/ Customer Portal</span>
        {selectedInvoiceId && fullInvoice && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>{fullInvoice.invoice_number}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Welcome, <strong>{customer.name}</strong></span>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
          Sign Out
        </button>
      </div>
    </div>
  );

  // ─── Invoice detail view ──────────────────────────────────────────────────
  if (selectedInvoiceId) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff' }}>
        {portalHeader}
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

          {/* Back + actions bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <button
              onClick={() => { setSelectedInvoiceId(null); setFullInvoice(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              ← Back to Invoices
            </button>
            {fullInvoice && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={downloadInvoicePDF}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #7c3aed', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#7c3aed' }}>
                  ↓ Download PDF
                </button>
                {fullInvoice.status !== 'paid' && fullInvoice.status !== 'cancelled' && (
                  <button onClick={() => payInvoice(fullInvoice)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#7c3aed', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'white' }}>
                    Pay Now
                  </button>
                )}
              </div>
            )}
          </div>

          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#7c3aed', fontWeight: 700 }}>Loading invoice...</div>
          ) : !fullInvoice ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>Invoice not found.</div>
          ) : (
            <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

              {/* Invoice header band */}
              <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', padding: '28px 36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ color: 'white', fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>
                      {company?.company_name || 'AURAX BOOKS'}
                    </div>
                    {company?.address && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{company.address}</div>}
                    {company?.phone && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Tel: {company.phone}</div>}
                    {company?.email && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{company.email}</div>}
                    {company?.tax_reg && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>Tax Reg: {company.tax_reg}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 6 }}>TAX INVOICE</div>
                    <div style={{ color: 'white', fontSize: 26, fontWeight: 900 }}>{fullInvoice.invoice_number}</div>
                    <div style={{ marginTop: 8 }}>{statusBadge(fullInvoice.status)}</div>
                  </div>
                </div>
              </div>

              {/* Invoice meta + billed to */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ padding: '24px 36px', borderRight: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Invoice Details</div>
                  {[
                    { label: 'Invoice #', value: fullInvoice.invoice_number },
                    { label: 'Date', value: fullInvoice.date || '—' },
                    { label: 'Due Date', value: fullInvoice.due_date || '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#6b7280', width: 90, flexShrink: 0 }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '24px 36px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Billed To</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{customer.name}</div>
                  {customer.email && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{customer.email}</div>}
                  {customer.phone && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{customer.phone}</div>}
                  {customer.address && <div style={{ fontSize: 13, color: '#6b7280' }}>{customer.address}</div>}
                </div>
              </div>

              {/* Line items */}
              <div style={{ padding: '0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Description', 'Qty', 'Unit Price', 'Discount', 'Total'].map((h, i) => (
                        <th key={h} style={{
                          padding: '11px 20px',
                          textAlign: i >= 1 ? 'right' : 'left',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          borderBottom: '1px solid #f3f4f6',
                          ...(i === 0 ? { paddingLeft: 36 } : {}),
                          ...(i === 4 ? { paddingRight: 36 } : {}),
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fullInvoice.lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '32px 36px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>No line items</td>
                      </tr>
                    ) : fullInvoice.lines.map(line => (
                      <tr key={line.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '14px 20px 14px 36px', fontSize: 14, fontWeight: 500, color: '#111827' }}>{line.product_name}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 14, color: '#374151' }}>{line.qty}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 14, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmt(line.unit_price)}</td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 14, color: '#6b7280' }}>{line.discount_pct ? line.discount_pct + '%' : '—'}</td>
                        <td style={{ padding: '14px 36px 14px 20px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 36px', borderTop: '2px solid #f3f4f6', background: '#fafafa' }}>
                <div style={{ minWidth: 280 }}>
                  {[
                    { label: 'Subtotal', value: fmt(fullInvoice.subtotal || 0), muted: true },
                    ...(fullInvoice.tax_amount > 0 ? [{ label: 'Tax', value: fmt(fullInvoice.tax_amount), muted: true }] : []),
                    ...(fullInvoice.discount > 0 ? [{ label: 'Discount', value: '- ' + fmt(fullInvoice.discount), muted: true }] : []),
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>{row.label}</span>
                      <span style={{ fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#7c3aed', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>TOTAL</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums' }}>{fmt(fullInvoice.total || 0)}</span>
                  </div>
                  {(fullInvoice.paid_amount || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>Amount Paid</span>
                      <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>{fmt(fullInvoice.paid_amount)}</span>
                    </div>
                  )}
                  {(fullInvoice.balance || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>Balance Due</span>
                      <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{fmt(fullInvoice.balance)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {fullInvoice.notes && (
                <div style={{ padding: '16px 36px 24px', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Notes</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{fullInvoice.notes}</div>
                </div>
              )}

              {/* Footer actions */}
              <div style={{ padding: '16px 36px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Thank you for your business!</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={downloadInvoicePDF}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #7c3aed', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>
                    ↓ Download PDF
                  </button>
                  {fullInvoice.status !== 'paid' && fullInvoice.status !== 'cancelled' && (
                    <button onClick={() => payInvoice(fullInvoice)}
                      style={{ background: '#7c3aed', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'white' }}>
                      Pay Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main portal view ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8f7ff' }}>
      {portalHeader}

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
              <span style={{ fontSize: 13, color: '#6b7280' }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} — click a row to view details</span>
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
                      <tr key={inv.id}
                        onClick={() => openInvoice(inv.id)}
                        style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#faf5ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '14px 20px', fontWeight: 700, color: '#7c3aed', textDecoration: 'underline', textDecorationColor: '#c4b5fd' }}>{inv.invoice_number}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#374151' }}>{inv.date}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: isOverdue ? '#dc2626' : '#374151', fontWeight: isOverdue ? 700 : 400 }}>
                          {inv.due_date || '—'}{isOverdue ? ' ⚠' : ''}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{fmt(inv.total)}</td>
                        <td style={{ padding: '14px 20px' }}>{statusBadge(inv.status)}</td>
                        <td style={{ padding: '14px 20px' }}>
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button onClick={e => { e.stopPropagation(); payInvoice(inv); }}
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

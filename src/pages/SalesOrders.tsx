import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Page } from '../App';

interface SoLine {
  id?: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  tax_rate: number;
  line_total: number;
}

interface Props {
  onCreateInvoice?: (so: any, lines: any[]) => void;
  nav?: (p: Page) => void;
}

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-blue',
  Confirmed: 'badge-purple',
  Invoiced: 'badge-green',
  Cancelled: 'badge-red',
};

const STATUS_STEPS = ['Draft', 'Confirmed', 'Invoiced'];

const STATUS_COLOR: Record<string, string> = {
  Draft: '#6b7280', Confirmed: '#7c3aed', Invoiced: '#059669', Cancelled: '#dc2626',
};

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

export default function SalesOrders({ onCreateInvoice }: Props) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedLines, setSelectedLines] = useState<SoLine[]>([]);
  const [linkedInvoice, setLinkedInvoice] = useState<any>(null);

  const [sos, setSos] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'quotations' | 'confirmed' | 'invoiced'>('all');

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSO, setEditingSO] = useState<any>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), expiry_date: '', customer_id: '', customer_name: '', notes: '', tax_rate: '0' });
  const [lines, setLines] = useState<SoLine[]>([{ product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, tax_rate: 0, line_total: 0 }]);

  const [dialog, setDialog] = useState<{ message: string; onConfirm?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ message: msg });
  const showConfirm = (msg: string, fn: () => void) => setDialog({ message: msg, onConfirm: fn });
  const clampNonNeg = (v: string) => Math.max(0, parseFloat(v) || 0);

  const [detailTab, setDetailTab] = useState<'lines' | 'details'>('lines');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [soRes, custRes, prodRes, settRes] = await Promise.all([
      supabase.from('sales_orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('customers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('products').select('id,name,sales_price,cost_price,stock_qty,unit').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setSos(soRes.data || []);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generateSoNumber() {
    if (sos.length === 0) return 'SO-0001';
    const nums = sos.map(s => { const m = s.so_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'SO-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function resetForm() {
    setForm({ date: new Date().toISOString().slice(0, 10), expiry_date: '', customer_id: '', customer_name: '', notes: '', tax_rate: '0' });
    setLines([{ product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, tax_rate: 0, line_total: 0 }]);
    setEditingSO(null);
  }

  function addLine() {
    setLines([...lines, { product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, tax_rate: parseFloat(form.tax_rate) || 0, line_total: 0 }]);
  }

  function removeLine(i: number) {
    if (lines.length === 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: string, value: any) {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    if (field === 'product_id') {
      const prod = products.find(p => p.id === value);
      if (prod) { updated[i].product_name = prod.name; updated[i].unit_price = prod.sales_price || 0; updated[i].tax_rate = parseFloat(form.tax_rate) || 0; }
    }
    const qty = updated[i].qty || 0;
    const price = updated[i].unit_price || 0;
    const disc = updated[i].discount_pct || 0;
    updated[i].line_total = qty * price * (1 - disc / 100);
    setLines(updated);
  }

  function updateLineDiscount(i: number, val: string) {
    const updated = [...lines];
    updated[i] = { ...updated[i], discount_pct: clampNonNeg(val) };
    const qty = updated[i].qty || 0;
    const price = updated[i].unit_price || 0;
    updated[i].line_total = qty * price * (1 - updated[i].discount_pct / 100);
    setLines(updated);
  }

  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const taxAmt = lines.reduce((s, l) => s + (l.line_total || 0) * ((l.tax_rate || 0) / 100), 0);
  const total = subtotal + taxAmt;

  async function handleSave() {
    if (!form.customer_id) { showAlert('Please select a customer'); return; }
    const validLines = lines.filter(l => l.product_id && l.qty > 0);
    if (validLines.length === 0) { showAlert('Add at least one product line'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload: any = {
      user_id: user.id,
      so_number: editingSO ? editingSO.so_number : generateSoNumber(),
      date: form.date,
      expiry_date: form.expiry_date || null,
      customer_id: form.customer_id,
      customer_name: form.customer_name,
      status: editingSO ? editingSO.status : 'Draft',
      notes: form.notes,
      subtotal,
      tax_amount: taxAmt,
      total,
    };

    let soId = editingSO?.id;
    if (editingSO) {
      await supabase.from('sales_orders').update(payload).eq('id', editingSO.id);
      await supabase.from('sales_order_lines').delete().eq('so_id', editingSO.id);
    } else {
      const { data } = await supabase.from('sales_orders').insert(payload).select().single();
      soId = data?.id;
    }

    if (soId) {
      await supabase.from('sales_order_lines').insert(
        validLines.map(l => ({ so_id: soId, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: l.tax_rate, line_total: l.line_total }))
      );
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
    loadAll();
  }

  async function openDetail(so: any) {
    setSelected(so);
    setLinkedInvoice(null);
    const [{ data: lineData }, invRes] = await Promise.all([
      supabase.from('sales_order_lines').select('*').eq('so_id', so.id),
      so.invoice_id ? supabase.from('invoices').select('invoice_number,status').eq('id', so.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setSelectedLines((lineData || []).map((l: any) => ({ id: l.id, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct || 0, tax_rate: l.tax_rate || 0, line_total: l.line_total })));
    setLinkedInvoice(invRes.data || null);
    setDetailTab('lines');
    setView('detail');
  }

  async function openEdit(so: any) {
    setEditingSO(so);
    setForm({ date: so.date, expiry_date: so.expiry_date || '', customer_id: so.customer_id || '', customer_name: so.customer_name || '', notes: so.notes || '', tax_rate: '0' });
    const { data } = await supabase.from('sales_order_lines').select('*').eq('so_id', so.id);
    setLines((data || []).map((l: any) => ({ id: l.id, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct || 0, tax_rate: l.tax_rate || 0, line_total: l.line_total })));
    setShowForm(true);
    setView('list');
  }

  function handleDelete(so: any) {
    showConfirm(`Delete quotation ${so.so_number}? This cannot be undone.`, async () => {
      await supabase.from('sales_order_lines').delete().eq('so_id', so.id);
      await supabase.from('sales_orders').delete().eq('id', so.id);
      if (view === 'detail') setView('list');
      loadAll();
    });
  }

  async function updateStatus(so: any, newStatus: string) {
    await supabase.from('sales_orders').update({ status: newStatus }).eq('id', so.id);
    setSelected((prev: any) => prev?.id === so.id ? { ...prev, status: newStatus } : prev);
    loadAll();
  }

  async function createInvoice(so: any) {
    const { data } = await supabase.from('sales_order_lines').select('*').eq('so_id', so.id);
    onCreateInvoice?.(so, data || []);
  }

  function exportPDF(so: any, lineItems: SoLine[]) {
    const doc = new jsPDF();
    const fmtN = (n: number) => (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
    doc.setFillColor(248, 249, 252); doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, 0, 4, 42, 'F');
    doc.setTextColor(79, 53, 200); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'Company Name', 12, 14);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
    doc.text('SALES ORDER / QUOTATION', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }
    doc.setTextColor(30, 30, 30); doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(so.so_number, 198, 14, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + so.date, 198, 22, { align: 'right' });
    if (so.expiry_date) doc.text('Valid Until: ' + so.expiry_date, 198, 28, { align: 'right' });
    doc.setDrawColor(79, 53, 200); doc.setLineWidth(0.5); doc.line(0, 42, 210, 42);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
    doc.text('CUSTOMER:', 12, 50);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(so.customer_name || '—', 12, 57);
    const sc: Record<string, number[]> = { Confirmed: [79, 53, 200], Invoiced: [18, 183, 106], Cancelled: [240, 68, 56] };
    const c = sc[so.status] || [108, 171, 238];
    doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(so.status?.toUpperCase() || 'DRAFT', 172, 53, { align: 'center' });
    autoTable(doc, {
      startY: 68,
      head: [['#', 'Product', 'Qty', 'Unit Price (Rs.)', 'Disc%', 'Tax%', 'Total (Rs.)']],
      body: lineItems.map((l, i) => [i + 1, l.product_name, l.qty, fmtN(l.unit_price), (l.discount_pct || 0) + '%', (l.tax_rate || 0) + '%', fmtN(l.line_total)]),
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 12, right: 12 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    const lSub = lineItems.reduce((s, l) => s + (l.line_total || 0), 0);
    const lTax = lineItems.reduce((s, l) => s + (l.line_total || 0) * ((l.tax_rate || 0) / 100), 0);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Subtotal:', 140, finalY + 4); doc.text('Rs. ' + fmtN(lSub), 198, finalY + 4, { align: 'right' });
    doc.text('Tax:', 140, finalY + 10); doc.text('Rs. ' + fmtN(lTax), 198, finalY + 10, { align: 'right' });
    doc.setFillColor(79, 53, 200); doc.rect(120, finalY + 14, 78, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TOTAL:', 125, finalY + 22); doc.text('Rs. ' + fmtN(lSub + lTax), 196, finalY + 22, { align: 'right' });
    if (so.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + so.notes, 12, finalY + 34); }
    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252); doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150); doc.setFontSize(8);
    doc.text('Generated by LedgerX', 105, pageH - 6, { align: 'center' });
    doc.save(so.so_number + '.pdf');
  }

  function statusPipeline(currentStatus: string) {
    const currentIdx = STATUS_STEPS.indexOf(currentStatus);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {STATUS_STEPS.map((step, i) => {
          const done = currentStatus === 'Cancelled' ? false : i <= currentIdx;
          const isCurrent = i === currentIdx && currentStatus !== 'Cancelled';
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: currentStatus === 'Cancelled' && step === 'Draft' ? '#fef3f2' : done ? (isCurrent ? 'var(--brand)' : 'var(--green-bg)') : 'var(--bg3)', color: currentStatus === 'Cancelled' && step === 'Draft' ? '#f04438' : done ? (isCurrent ? '#fff' : '#12b76a') : 'var(--text3)', border: `1px solid ${currentStatus === 'Cancelled' && step === 'Draft' ? '#fecdca' : done ? (isCurrent ? 'transparent' : 'var(--green)') : 'var(--border)'}` }}>
                {currentStatus === 'Cancelled' && step === 'Draft' ? '✕ Cancelled' : step}
              </div>
              {i < STATUS_STEPS.length - 1 && <span style={{ color: 'var(--text3)', fontSize: '12px' }}>→</span>}
            </div>
          );
        })}
      </div>
    );
  }

  const canEdit = (so: any) => so.status === 'Draft';
  const canDelete = (so: any) => so.status === 'Draft';
  const canConfirm = (so: any) => so.status === 'Draft';
  const canInvoice = (so: any) => so.status === 'Confirmed';
  const canCancel = (so: any) => ['Draft', 'Confirmed'].includes(so.status);
  const canReturnToDraft = (so: any) => so.status === 'Confirmed' && !so.invoice_id;

  const tabFiltered = sos.filter(s => {
    if (activeTab === 'quotations') return s.status === 'Draft';
    if (activeTab === 'confirmed') return s.status === 'Confirmed';
    if (activeTab === 'invoiced') return s.status === 'Invoiced';
    return true;
  });

  const filtered = tabFiltered.filter(s =>
    (s.so_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const quotationCount = sos.filter(s => s.status === 'Draft').length;
  const confirmedCount = sos.filter(s => s.status === 'Confirmed').length;
  const invoicedCount = sos.filter(s => s.status === 'Invoiced').length;

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    background: active ? 'var(--brand)' : 'var(--bg2)',
    color: active ? '#fff' : 'var(--text2)',
    border: active ? 'none' : '1px solid var(--border)',
  });

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const lineSub = selectedLines.reduce((s, l) => s + (l.line_total || 0), 0);
    const lineTax = selectedLines.reduce((s, l) => s + (l.line_total || 0) * ((l.tax_rate || 0) / 100), 0);
    return (
      <div>
        <BackBtn label="Back to Sales Orders" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero */}
        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 8 }}>{selected.so_number}</div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: (STATUS_COLOR[selected.status] || '#6b7280') + '18', color: STATUS_COLOR[selected.status] || '#6b7280' }}>{selected.status}</span>
              </div>
              {statusPipeline(selected.status)}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--text2)' }}>
                <span><strong>Customer:</strong> {selected.customer_name}</span>
                <span><strong>Date:</strong> {selected.date}</span>
                {selected.expiry_date && <span><strong>Valid Until:</strong> {selected.expiry_date}</span>}
              </div>
              {linkedInvoice && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-bg)', borderRadius: 8, border: '1px solid var(--green)', display: 'inline-flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#12b76a' }}>Linked Invoice:</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{linkedInvoice.invoice_number}</span>
                  <span className={`badge ${linkedInvoice.status === 'Paid' ? 'badge-green' : linkedInvoice.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{linkedInvoice.status}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => exportPDF(selected, selectedLines)}>PDF</button>
              {canConfirm(selected) && <button className="btn btn-primary btn-sm" onClick={() => updateStatus(selected, 'Confirmed')}>Confirm</button>}
              {canInvoice(selected) && <button className="btn btn-primary btn-sm" onClick={() => createInvoice(selected)}>Create Invoice</button>}
              {canEdit(selected) && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(selected)}>Edit</button>}
              {canReturnToDraft(selected) && <button className="btn btn-secondary btn-sm" onClick={() => showConfirm(`Return ${selected.so_number} to Draft?`, () => updateStatus(selected, 'Draft'))}>Return to Draft</button>}
              {canCancel(selected) && <button className="btn btn-danger btn-sm" onClick={() => showConfirm(`Cancel ${selected.so_number}?`, () => updateStatus(selected, 'Cancelled'))}>Cancel</button>}
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Subtotal', value: fmt(selected.subtotal), color: '#7c3aed' },
            { label: 'Tax', value: fmt(selected.tax_amount), color: '#d97706' },
            { label: 'Discount', value: fmt(0), color: '#6b7280' },
            { label: 'Total', value: fmt(selected.total), color: '#059669' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Detail tabs */}
        <div className="table-wrap">
          <div className="table-toolbar">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['lines', 'details'] as const).map(t => (
                <button key={t} onClick={() => setDetailTab(t)} style={{ padding: '7px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: detailTab === t ? 'var(--brand-light)' : 'transparent', color: detailTab === t ? 'var(--brand)' : 'var(--text2)' }}>
                  {t === 'lines' ? 'Line Items' : 'Details'}
                </button>
              ))}
            </div>
          </div>
          {detailTab === 'lines' ? (
            selectedLines.length === 0 ? (
              <div className="empty-state"><h3>No line items</h3></div>
            ) : (
              <>
                <table>
                  <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Disc%</th><th>Tax%</th><th>Total</th></tr></thead>
                  <tbody>
                    {selectedLines.map((l, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text2)', textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                        <td>{l.qty}</td>
                        <td>{fmt(l.unit_price)}</td>
                        <td style={{ color: 'var(--text2)' }}>{l.discount_pct}%</td>
                        <td style={{ color: 'var(--text2)' }}>{l.tax_rate}%</td>
                        <td style={{ fontWeight: 600 }}>{fmt(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ textAlign: 'right', padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '4px' }}>Subtotal: {fmt(lineSub)}</div>
                  <div style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '4px' }}>Tax: {fmt(lineTax)}</div>
                  <div style={{ fontWeight: 700, fontSize: '16px' }}>Total: {fmt(lineSub + lineTax)}</div>
                </div>
              </>
            )
          ) : (
            <div style={{ padding: 20 }}>
              {selected.notes ? (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <strong>Notes:</strong> {selected.notes}
                </div>
              ) : <p style={{ color: 'var(--text3)' }}>No additional details.</p>}
              {selected.expiry_date && (
                <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13 }}>
                  <strong>Valid Until:</strong> {selected.expiry_date}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Sales Orders</div>
          <div className="page-sub">Quotation → Confirm → Invoice · {sos.length} total</div>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ New Quotation</button>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--kpi-color': '#2e90fa' } as any} onClick={() => setActiveTab('quotations')}>
          <div className="kpi-label">Quotations</div>
          <div className="kpi-value">{quotationCount}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#7a5af8' } as any} onClick={() => setActiveTab('confirmed')}>
          <div className="kpi-label">Confirmed</div>
          <div className="kpi-value">{confirmedCount}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#12b76a' } as any} onClick={() => setActiveTab('invoiced')}>
          <div className="kpi-label">Invoiced</div>
          <div className="kpi-value">{invoicedCount}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#4f35c8' } as any} onClick={() => setActiveTab('all')}>
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value">{fmt(sos.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + (s.total || 0), 0))}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button style={tabStyle(activeTab === 'all')} onClick={() => setActiveTab('all')}>All ({sos.length})</button>
        <button style={tabStyle(activeTab === 'quotations')} onClick={() => setActiveTab('quotations')}>Quotations ({quotationCount})</button>
        <button style={tabStyle(activeTab === 'confirmed')} onClick={() => setActiveTab('confirmed')}>Confirmed ({confirmedCount})</button>
        <button style={tabStyle(activeTab === 'invoiced')} onClick={() => setActiveTab('invoiced')}>Invoiced ({invoicedCount})</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">{editingSO ? `Edit ${editingSO.so_number}` : 'New Quotation / Sales Order'}</div>
              {!editingSO && <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Next number: {generateSoNumber()}</div>}
            </div>
            <button className="modal-close" onClick={() => { setShowForm(false); resetForm(); }}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Customer *</label>
                <select value={form.customer_id} onChange={e => {
                  const c = customers.find(x => x.id === e.target.value);
                  setForm({ ...form, customer_id: e.target.value, customer_name: c?.name || '' });
                }}>
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Order Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Valid Until / Expiry</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Default Tax Rate (%)</label>
                <input type="number" min="0" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div className="form-group full">
                <label>Notes / Terms</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Delivery terms, payment terms, special instructions..." />
              </div>
            </div>

            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Product</th>
                    <th style={{ width: '10%' }}>Qty</th>
                    <th style={{ width: '16%' }}>Unit Price</th>
                    <th style={{ width: '10%' }}>Disc%</th>
                    <th style={{ width: '10%' }}>Tax%</th>
                    <th style={{ width: '16%' }}>Line Total</th>
                    <th style={{ width: '10%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                          <option value="">Select product...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_qty})</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" value={line.qty} onChange={e => updateLine(i, 'qty', clampNonNeg(e.target.value))} /></td>
                      <td><input type="number" min="0" value={line.unit_price} onChange={e => updateLine(i, 'unit_price', clampNonNeg(e.target.value))} /></td>
                      <td><input type="number" min="0" max="100" value={line.discount_pct} onChange={e => updateLineDiscount(i, e.target.value)} /></td>
                      <td><input type="number" min="0" max="100" value={line.tax_rate} onChange={e => { const u = [...lines]; u[i] = { ...u[i], tax_rate: clampNonNeg(e.target.value) }; setLines(u); }} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)', paddingLeft: '8px' }}>{fmt(line.line_total)}</td>
                      <td><button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => removeLine(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: '10px' }}>+ Add Line</button>
            </div>
            <div className="totals-box">
              <div className="total-row"><span className="total-label">Subtotal:</span><span className="total-value">{fmt(subtotal)}</span></div>
              <div className="total-row"><span className="total-label">Tax:</span><span className="total-value">{fmt(taxAmt)}</span></div>
              <div className="total-row total-final"><span className="total-label">TOTAL:</span><span className="total-value">{fmt(total)}</span></div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editingSO ? 'Update SO' : 'Save Quotation'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>Sales Orders</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search SO or customer..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{activeTab === 'all' ? 'No sales orders yet' : 'None in this category'}</h3>
            <p>{activeTab === 'all' ? 'Create your first quotation to start the Sales cycle' : 'Switch to All to see all orders'}</p>
            {activeTab === 'all' && <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => { resetForm(); setShowForm(true); }}>+ New Quotation</button>}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>SO #</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(so => (
                <tr key={so.id} onClick={() => openDetail(so)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{so.so_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{so.date}</td>
                  <td style={{ fontWeight: 500 }}>{so.customer_name}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(so.total)}</td>
                  <td><span className={`badge ${STATUS_BADGE[so.status] || 'badge-blue'}`}>{so.status}</span></td>
                  <td style={{ width: 32, textAlign: 'right' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}><polyline points="9 18 15 12 9 6" /></svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && (
        <div className="modal-overlay" onClick={() => setDialog(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div>
              <button className="modal-close" onClick={() => setDialog(null)}>×</button>
            </div>
            <div className="modal-body"><p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p></div>
            <div className="modal-footer">
              {dialog.onConfirm ? (
                <>
                  <button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => { const fn = dialog.onConfirm; setDialog(null); fn?.(); }}>Confirm</button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => setDialog(null)}>OK</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

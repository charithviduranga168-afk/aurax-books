import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

export default function Receipts() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const [receipts, setReceipts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], customer_id: '', invoice_id: '', amount: '', payment_method: '', reference: '', notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [recRes, invRes, allInvRes, custRes, coaRes, settRes] = await Promise.all([
      supabase.from('receipts').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('invoices').select('id,invoice_number,customer_name,customer_id,balance,total').eq('user_id', user.id).neq('status', 'Paid'),
      supabase.from('invoices').select('id,invoice_number,customer_name,total,balance,status').eq('user_id', user.id),
      supabase.from('customers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('chart_of_accounts').select('id,code,name').eq('user_id', user.id).eq('sub_type', 'Cash & Bank').eq('is_active', true).order('code'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setReceipts(recRes.data || []);
    setInvoices(invRes.data || []);
    setAllInvoices(allInvRes.data || []);
    setCustomers(custRes.data || []);
    setCashBankAccounts(coaRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generateReceiptNumber(existing: any[]) {
    if (existing.length === 0) return 'REC-0001';
    const nums = existing.map(r => { const m = r.receipt_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'REC-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  const filteredInvoices = form.customer_id ? invoices.filter(i => i.customer_id === form.customer_id) : invoices;

  async function handleSave() {
    if (!form.customer_id || !form.invoice_id || !form.amount) return alert('Please fill all required fields');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const customer = customers.find(c => c.id === form.customer_id);
    const invoice = invoices.find(i => i.id === form.invoice_id);
    const recNumber = generateReceiptNumber(receipts);

    const { data: rec } = await supabase.from('receipts').insert({
      user_id: user.id,
      receipt_number: recNumber,
      date: form.date,
      invoice_id: form.invoice_id,
      customer_id: form.customer_id,
      customer_name: customer?.name,
      amount,
      payment_method: form.payment_method,
      reference: form.reference,
      notes: form.notes,
    }).select().single();

    if (invoice) {
      const newPaid = invoice.total - invoice.balance + amount;
      const newBalance = Math.max(0, invoice.total - newPaid);
      await supabase.from('invoices').update({ paid_amount: newPaid, balance: newBalance, status: newBalance <= 0 ? 'Paid' : 'Partial' }).eq('id', form.invoice_id);
      const { data: cust } = await supabase.from('customers').select('balance').eq('id', form.customer_id).single();
      if (cust) await supabase.from('customers').update({ balance: Math.max(0, (cust.balance || 0) - amount) }).eq('id', form.customer_id);
    }

    setSaving(false);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], customer_id: '', invoice_id: '', amount: '', payment_method: '', reference: '', notes: '' });
    if (rec) exportPDF({ ...rec, customer_name: customer?.name }, invoice);
    loadData();
  }

  function exportPDF(rec: any, invoice?: any) {
    const doc = new jsPDF();
    const fmtN = (n: number) => (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
    doc.setFillColor(248, 249, 252); doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, 0, 4, 42, 'F');
    doc.setTextColor(79, 53, 200); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'Company Name', 12, 14);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
    doc.text('PAYMENT RECEIPT', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }
    doc.setTextColor(30, 30, 30); doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(rec.receipt_number, 198, 14, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + rec.date, 198, 22, { align: 'right' });
    doc.setDrawColor(79, 53, 200); doc.setLineWidth(0.5); doc.line(0, 42, 210, 42);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
    doc.text('RECEIVED FROM:', 12, 50);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(rec.customer_name || '—', 12, 57);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Payment Method: ' + rec.payment_method, 12, 63);
    if (rec.reference) doc.text('Reference: ' + rec.reference, 12, 68);
    doc.setFillColor(18, 183, 106); doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('RECEIVED', 172, 53, { align: 'center' });
    autoTable(doc, {
      startY: 76,
      head: [['Description', 'Invoice #', 'Amount (Rs.)']],
      body: [['Payment received', invoice?.invoice_number || '—', fmtN(rec.amount)]],
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 12, right: 12 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFillColor(79, 53, 200); doc.rect(120, finalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('AMOUNT RECEIVED:', 125, finalY + 8); doc.text('Rs. ' + fmtN(rec.amount), 196, finalY + 8, { align: 'right' });
    if (rec.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + rec.notes, 12, finalY + 22); }
    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252); doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150); doc.setFontSize(8);
    doc.text('Thank you for your payment!', 105, pageH - 6, { align: 'center' });
    doc.save(rec.receipt_number + '.pdf');
  }

  async function openDetail(r: any) {
    setSelected(r);
    const inv = allInvoices.find(i => i.id === r.invoice_id) || null;
    setSelectedInvoice(inv);
    setView('detail');
  }

  const filtered = receipts.filter(r =>
    (r.receipt_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Detail view ──
  if (view === 'detail' && selected) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <BackBtn label="Back to Receipts" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero */}
        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 8 }}>{selected.receipt_number}</div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, background: '#05996918', color: '#059669' }}>Received</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--text2)' }}>
                <span><strong>Customer:</strong> {selected.customer_name}</span>
                <span><strong>Date:</strong> {selected.date}</span>
                <span><strong>Method:</strong> {selected.payment_method || '—'}</span>
                {selected.reference && <span><strong>Ref:</strong> {selected.reference}</span>}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => exportPDF(selected, selectedInvoice)}>PDF</button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Amount', value: fmt(selected.amount), color: '#059669' },
            { label: 'Payment Method', value: selected.payment_method || '—', color: '#7c3aed' },
            { label: 'Invoice #', value: selectedInvoice?.invoice_number || '—', color: '#2563eb' },
            { label: 'Date', value: selected.date, color: '#6b7280' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
              <div style={{ fontSize: k.label === 'Payment Method' || k.label === 'Invoice #' || k.label === 'Date' ? 15 : 20, fontWeight: 800, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Linked invoice card */}
        {selectedInvoice && (
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.05em' }}>Linked Invoice</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { label: 'Invoice #', value: selectedInvoice.invoice_number },
                { label: 'Total', value: fmt(selectedInvoice.total) },
                { label: 'Balance', value: fmt(selectedInvoice.balance) },
                { label: 'Status', value: selectedInvoice.status },
              ].map(f => (
                <div key={f.label} style={{ padding: '12px', background: 'var(--bg3)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontWeight: 700 }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected.notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
            <strong>Notes:</strong> {selected.notes}
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Receipts</div>
          <div className="page-sub">Total collected: <strong>{fmt(receipts.reduce((s, r) => s + (r.amount || 0), 0))}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ New Receipt'}</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">New Receipt</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Next: {generateReceiptNumber(receipts)}</div>
            </div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Receipt Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Customer *</label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value, invoice_id: '' })}>
                  <option value="">— Select Customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Invoice *</label>
                <select value={form.invoice_id} onChange={e => {
                  const inv = invoices.find(i => i.id === e.target.value);
                  setForm({ ...form, invoice_id: e.target.value, amount: inv ? String(inv.balance) : '' });
                }}>
                  <option value="">— Select Invoice —</option>
                  {filteredInvoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {i.customer_name} — Balance: {fmt(i.balance)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Amount (LKR) *</label>
                <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                  <option value="">— Select Account —</option>
                  {cashBankAccounts.map(a => <option key={a.id} value={`${a.code} - ${a.name}`}>{a.code} - {a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Reference</label>
                <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Cheque no, transfer ref..." />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save & Print Receipt'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Receipts</h3>
          <div className="search-wrap">
            <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Search receipts..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No receipts yet</h3>
            <p>Record payments received from customers</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Receipt #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Method</th><th>Invoice</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{r.receipt_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                  <td>{r.customer_name}</td>
                  <td style={{ fontWeight: 600, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                  <td><span className="badge badge-blue">{r.payment_method}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>{allInvoices.find(i => i.id === r.invoice_id)?.invoice_number || '—'}</td>
                  <td style={{ width: 32, textAlign: 'right' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text3)' }}><polyline points="9 18 15 12 9 6" /></svg>
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

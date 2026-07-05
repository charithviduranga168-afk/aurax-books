import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import type { NavFilter } from '../App';
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

export default function Payments({ navFilter, onConsumeFilter }: { navFilter?: NavFilter | null; onConsumeFilter?: () => void } = {}) {
  const [payments, setPayments] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [allBills, setAllBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // list→detail state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any>(null);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    bill_id: '',
    amount: '',
    payment_method: '',
    reference: '',
    notes: '',
  });

  const [navFilterActive, setNavFilterActive] = useState<NavFilter | null>(null);
  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (navFilter) { setNavFilterActive(navFilter); onConsumeFilter?.(); } }, [navFilter]);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [payRes, billRes, allBillRes, suppRes, coaRes, settRes] = await Promise.all([
      supabase.from('payments').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('bills').select('id,bill_number,supplier_name,supplier_id,balance,total').eq('user_id', user.id).neq('status', 'Paid'),
      supabase.from('bills').select('id,bill_number,supplier_name,supplier_id,balance,total,status').eq('user_id', user.id),
      supabase.from('suppliers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('chart_of_accounts').select('id,code,name').eq('user_id', user.id).eq('sub_type', 'Cash & Bank').eq('is_active', true).order('code'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setPayments(payRes.data || []);
    setBills(billRes.data || []);
    setAllBills(allBillRes.data || []);
    setSuppliers(suppRes.data || []);
    setCashBankAccounts(coaRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generatePaymentNumber(existing: any[]) {
    if (existing.length === 0) return 'PAY-0001';
    const nums = existing.map(p => { const m = p.payment_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'PAY-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  const filteredBills = form.supplier_id ? bills.filter(b => b.supplier_id === form.supplier_id) : bills;

  async function handleSave() {
    if (!form.supplier_id || !form.bill_id || !form.amount) return alert('Please fill all required fields');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const bill = bills.find(b => b.id === form.bill_id);
    const payNumber = generatePaymentNumber(payments);

    const { data: pay } = await supabase.from('payments').insert({
      user_id: user.id,
      payment_number: payNumber,
      date: form.date,
      bill_id: form.bill_id,
      supplier_id: form.supplier_id,
      supplier_name: supplier?.name,
      amount,
      payment_method: form.payment_method,
      reference: form.reference,
      notes: form.notes,
    }).select().single();

    if (bill) {
      const newPaid = bill.total - bill.balance + amount;
      const newBalance = Math.max(0, bill.total - newPaid);
      await supabase.from('bills').update({ paid_amount: newPaid, balance: newBalance, status: newBalance <= 0 ? 'Paid' : 'Partial' }).eq('id', form.bill_id);
      const { data: supp } = await supabase.from('suppliers').select('balance').eq('id', form.supplier_id).single();
      if (supp) await supabase.from('suppliers').update({ balance: Math.max(0, (supp.balance || 0) - amount) }).eq('id', form.supplier_id);
    }

    setSaving(false);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], supplier_id: '', bill_id: '', amount: '', payment_method: '', reference: '', notes: '' });
    if (pay) exportPDF({ ...pay, supplier_name: supplier?.name }, bill);
    loadData();
  }

  function exportPDF(pay: any, bill?: any) {
    const doc = new jsPDF();
    const fmtN = (n: number) => (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

    doc.setFillColor(248, 249, 252);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, 0, 4, 42, 'F');

    doc.setTextColor(79, 53, 200);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'Company Name', 12, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('PAYMENT VOUCHER', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(pay.payment_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + pay.date, 198, 22, { align: 'right' });

    doc.setDrawColor(79, 53, 200);
    doc.setLineWidth(0.5);
    doc.line(0, 42, 210, 42);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 120, 120);
    doc.text('PAID TO:', 12, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(pay.supplier_name || '—', 12, 57);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Payment Method: ' + pay.payment_method, 12, 63);
    if (pay.reference) doc.text('Reference: ' + pay.reference, 12, 68);

    doc.setFillColor(79, 53, 200);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PAID', 172, 53, { align: 'center' });

    autoTable(doc, {
      startY: 76,
      head: [['Description', 'Bill #', 'Amount (Rs.)']],
      body: [['Payment to supplier', bill?.bill_number || '—', fmtN(pay.amount)]],
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 12, right: 12 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFillColor(79, 53, 200);
    doc.rect(120, finalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AMOUNT PAID:', 125, finalY + 8);
    doc.text('Rs. ' + fmtN(pay.amount), 196, finalY + 8, { align: 'right' });

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, pageH - 6, { align: 'center' });
    doc.save(pay.payment_number + '.pdf');
  }

  const filtered = payments.filter(p => {
    if (navFilterActive?.field === 'supplier_id') return p.supplier_id === navFilterActive.value;
    return (p.payment_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.supplier_name || '').toLowerCase().includes(search.toLowerCase());
  });

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const pay = selected;
    const linkedBill = allBills.find(b => b.id === pay.bill_id);
    return (
      <div>
        <BackBtn label="Back to Payments" onClick={() => { setView('list'); setSelected(null); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>{pay.payment_number}</div>
              <div style={{ marginBottom: 10 }}>
                <span className="badge badge-green">Paid</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{pay.supplier_name} · {pay.date}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => exportPDF(pay, linkedBill)}>PDF</button>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-color': '#dc2626' } as any}>
            <div className="kpi-label">Amount</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(pay.amount)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#7c3aed' } as any}>
            <div className="kpi-label">Payment Method</div>
            <div className="kpi-value" style={{ fontSize: 13 }}>{pay.payment_method || '—'}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#2e90fa' } as any}>
            <div className="kpi-label">Bill #</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{linkedBill?.bill_number || '—'}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#16a34a' } as any}>
            <div className="kpi-label">Date</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{pay.date}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.05em' }}>Payment Details</div>
            {[
              { label: 'Supplier', value: pay.supplier_name },
              { label: 'Date', value: pay.date },
              { label: 'Payment Method', value: pay.payment_method || '—' },
              { label: 'Reference', value: pay.reference || '—' },
              { label: 'Notes', value: pay.notes || '—' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text2)' }}>{f.label}</span>
                <span style={{ fontWeight: 600 }}>{f.value}</span>
              </div>
            ))}
          </div>

          {linkedBill && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.05em' }}>Linked Bill</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)', marginBottom: 8 }}>{linkedBill.bill_number}</div>
              <span className={`badge ${linkedBill.status === 'Paid' ? 'badge-green' : linkedBill.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{linkedBill.status}</span>
              <div style={{ marginTop: 16 }}>
                {[
                  { label: 'Total', value: fmt(linkedBill.total) },
                  { label: 'Balance', value: fmt(linkedBill.balance) },
                ].map(f => (
                  <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text2)' }}>{f.label}</span>
                    <span style={{ fontWeight: 600 }}>{f.value}</span>
                  </div>
                ))}
              </div>
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
          <div className="page-title">Payments</div>
          <div className="page-sub">Total paid: <strong>{fmt(payments.reduce((s, p) => s + (p.amount || 0), 0))}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ New Payment'}</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">New Payment</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Next: {generatePaymentNumber(payments)}</div>
            </div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Payment Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Supplier *</label>
                <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value, bill_id: '' })}>
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Bill *</label>
                <select value={form.bill_id} onChange={e => { const b = bills.find(b => b.id === e.target.value); setForm({ ...form, bill_id: e.target.value, amount: b ? String(b.balance) : '' }); }}>
                  <option value="">— Select Bill —</option>
                  {filteredBills.map(b => <option key={b.id} value={b.id}>{b.bill_number} — {b.supplier_name} — Balance: {fmt(b.balance)}</option>)}
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
                <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Transfer ref, cheque no..." />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save & Print'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Payments</h3>
          <div className="search-wrap">
            <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No payments yet</h3>
            <p>Record payments made to suppliers</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Payment #</th><th>Date</th><th>Supplier</th><th>Bill</th><th>Amount</th><th>Method</th><th>Ref</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => { setSelected(p); setView('detail'); }} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{p.payment_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{p.date}</td>
                  <td>{p.supplier_name}</td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>{allBills.find(b => b.id === p.bill_id)?.bill_number || '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</td>
                  <td><span className="badge badge-blue">{p.payment_method}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>{p.reference || '—'}</td>
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

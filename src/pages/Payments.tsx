import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Payments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    bill_id: '',
    amount: '',
    payment_method: '',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [payRes, billRes, suppRes, coaRes, settRes] = await Promise.all([
      supabase
        .from('payments')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('bills')
        .select('id,bill_number,supplier_name,supplier_id,balance,total')
        .eq('user_id', user.id)
        .neq('status', 'Paid'),
      supabase
        .from('suppliers')
        .select('id,name')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('chart_of_accounts')
        .select('id,code,name')
        .eq('user_id', user.id)
        .eq('sub_type', 'Cash & Bank')
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setPayments(payRes.data || []);
    setBills(billRes.data || []);
    setSuppliers(suppRes.data || []);
    setCashBankAccounts(coaRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generatePaymentNumber(existing: any[]) {
    if (existing.length === 0) return 'PAY-0001';
    const nums = existing.map((p) => {
      const m = p.payment_number?.match(/(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    return 'PAY-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  const filteredBills = form.supplier_id
    ? bills.filter((b) => b.supplier_id === form.supplier_id)
    : bills;

  async function handleSave() {
    if (!form.supplier_id || !form.bill_id || !form.amount)
      return alert('Please fill all required fields');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const supplier = suppliers.find((s) => s.id === form.supplier_id);
    const bill = bills.find((b) => b.id === form.bill_id);
    const payNumber = generatePaymentNumber(payments);

    const { data: pay } = await supabase
      .from('payments')
      .insert({
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
      })
      .select()
      .single();

    if (bill) {
      const newPaid = bill.total - bill.balance + amount;
      const newBalance = Math.max(0, bill.total - newPaid);
      await supabase
        .from('bills')
        .update({
          paid_amount: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? 'Paid' : 'Partial',
        })
        .eq('id', form.bill_id);
      const { data: supp } = await supabase
        .from('suppliers')
        .select('balance')
        .eq('id', form.supplier_id)
        .single();
      if (supp)
        await supabase
          .from('suppliers')
          .update({ balance: Math.max(0, (supp.balance || 0) - amount) })
          .eq('id', form.supplier_id);
    }

    setSaving(false);
    setShowModal(false);
    setForm({
      date: new Date().toISOString().split('T')[0],
      supplier_id: '',
      bill_id: '',
      amount: '',
      payment_method: '',
      reference: '',
      notes: '',
    });
    if (pay) exportPDF({ ...pay, supplier_name: supplier?.name }, bill);
    loadData();
  }

  function exportPDF(pay: any, bill?: any) {
    const doc = new jsPDF();
    const fmt = (n: number) =>
      (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

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
    if (company.address) {
      doc.text(company.address, 12, cy);
      cy += 5;
    }
    if (company.phone) {
      doc.text('Tel: ' + company.phone, 12, cy);
      cy += 5;
    }
    if (company.email) {
      doc.text(company.email, 12, cy);
    }

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
      body: [
        ['Payment to supplier', bill?.bill_number || '—', fmt(pay.amount)],
      ],
      headStyles: {
        fillColor: [79, 53, 200],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
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
    doc.text('Rs. ' + fmt(pay.amount), 196, finalY + 8, { align: 'right' });

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, pageH - 6, {
      align: 'center',
    });

    doc.save(pay.payment_number + '.pdf');
  }

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const filtered = payments.filter(
    (p) =>
      (p.payment_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.supplier_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Payments</div>
          <div className="page-sub">
            Total paid:{' '}
            <strong>
              {fmt(payments.reduce((s, p) => s + (p.amount || 0), 0))}
            </strong>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Payment
        </button>
      </div>

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Payments</h3>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <h3>No payments yet</h3>
            <p>Record payments made to suppliers</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Payment #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Bill</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Ref</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    {p.payment_number}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{p.date}</td>
                  <td>{p.supplier_name}</td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>
                    {bills.find((b) => b.id === p.bill_id)?.bill_number || '—'}
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: 'var(--red)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(p.amount)}
                  </td>
                  <td>
                    <span className="badge badge-blue">{p.payment_method}</span>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>
                    {p.reference || '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        exportPDF(
                          p,
                          bills.find((b) => b.id === p.bill_id)
                        )
                      }
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

      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">New Payment</div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text2)',
                    marginTop: '2px',
                  }}
                >
                  Next: {generatePaymentNumber(payments)}
                </div>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Payment Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Supplier *</label>
                  <select
                    value={form.supplier_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        supplier_id: e.target.value,
                        bill_id: '',
                      })
                    }
                  >
                    <option value="">— Select Supplier —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group full">
                  <label>Bill *</label>
                  <select
                    value={form.bill_id}
                    onChange={(e) => {
                      const b = bills.find((b) => b.id === e.target.value);
                      setForm({
                        ...form,
                        bill_id: e.target.value,
                        amount: b ? String(b.balance) : '',
                      });
                    }}
                  >
                    <option value="">— Select Bill —</option>
                    {filteredBills.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bill_number} — {b.supplier_name} — Balance:{' '}
                        {fmt(b.balance)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount (LKR) *</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) =>
                      setForm({ ...form, payment_method: e.target.value })
                    }
                  >
                    <option value="">— Select Account —</option>
                    {cashBankAccounts.map((a) => (
                      <option key={a.id} value={`${a.code} - ${a.name}`}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    value={form.reference}
                    onChange={(e) =>
                      setForm({ ...form, reference: e.target.value })
                    }
                    placeholder="Transfer ref, cheque no..."
                  />
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <input
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save & Print'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

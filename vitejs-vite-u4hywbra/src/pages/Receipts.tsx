import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Receipts() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    customer_id: '',
    invoice_id: '',
    amount: '',
    payment_method: 'Cash',
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
    const [recRes, invRes, custRes, settRes] = await Promise.all([
      supabase
        .from('receipts')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('invoices')
        .select('id,invoice_number,customer_name,customer_id,balance,total')
        .eq('user_id', user.id)
        .neq('status', 'Paid'),
      supabase
        .from('customers')
        .select('id,name')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setReceipts(recRes.data || []);
    setInvoices(invRes.data || []);
    setCustomers(custRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  function generateReceiptNumber(existing: any[]) {
    if (existing.length === 0) return 'REC-0001';
    const nums = existing.map((r) => {
      const m = r.receipt_number?.match(/(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    return 'REC-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  const filteredInvoices = form.customer_id
    ? invoices.filter((i) => i.customer_id === form.customer_id)
    : invoices;

  async function handleSave() {
    if (!form.customer_id || !form.invoice_id || !form.amount)
      return alert('Please fill all required fields');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return alert('Enter a valid amount');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const customer = customers.find((c) => c.id === form.customer_id);
    const invoice = invoices.find((i) => i.id === form.invoice_id);
    const recNumber = generateReceiptNumber(receipts);

    const { data: rec } = await supabase
      .from('receipts')
      .insert({
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
      })
      .select()
      .single();

    if (invoice) {
      const newPaid = invoice.total - invoice.balance + amount;
      const newBalance = Math.max(0, invoice.total - newPaid);
      await supabase
        .from('invoices')
        .update({
          paid_amount: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? 'Paid' : 'Partial',
        })
        .eq('id', form.invoice_id);
      const { data: cust } = await supabase
        .from('customers')
        .select('balance')
        .eq('id', form.customer_id)
        .single();
      if (cust)
        await supabase
          .from('customers')
          .update({ balance: Math.max(0, (cust.balance || 0) - amount) })
          .eq('id', form.customer_id);
    }

    setSaving(false);
    setShowModal(false);
    setForm({
      date: new Date().toISOString().split('T')[0],
      customer_id: '',
      invoice_id: '',
      amount: '',
      payment_method: 'Cash',
      reference: '',
      notes: '',
    });
    if (rec) exportPDF({ ...rec, customer_name: customer?.name }, invoice);
    loadData();
  }

  function exportPDF(rec: any, invoice?: any) {
    const doc = new jsPDF();
    const fmt = (n: number) =>
      (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

    // Header
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
    doc.text('PAYMENT RECEIPT', 12, 21);

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
    doc.text(rec.receipt_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + rec.date, 198, 22, { align: 'right' });

    doc.setDrawColor(79, 53, 200);
    doc.setLineWidth(0.5);
    doc.line(0, 42, 210, 42);

    // Party
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 120, 120);
    doc.text('RECEIVED FROM:', 12, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(rec.customer_name || '—', 12, 57);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Payment Method: ' + rec.payment_method, 12, 63);
    if (rec.reference) doc.text('Reference: ' + rec.reference, 12, 68);

    // Status badge
    doc.setFillColor(18, 183, 106);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIVED', 172, 53, { align: 'center' });

    autoTable(doc, {
      startY: 76,
      head: [['Description', 'Invoice #', 'Amount (Rs.)']],
      body: [
        ['Payment received', invoice?.invoice_number || '—', fmt(rec.amount)],
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
    doc.text('AMOUNT RECEIVED:', 125, finalY + 8);
    doc.text('Rs. ' + fmt(rec.amount), 196, finalY + 8, { align: 'right' });

    if (rec.notes) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Notes: ' + rec.notes, 12, finalY + 22);
    }

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Thank you for your payment!', 105, pageH - 6, {
      align: 'center',
    });

    doc.save(rec.receipt_number + '.pdf');
  }

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const filtered = receipts.filter(
    (r) =>
      (r.receipt_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Receipts</div>
          <div className="page-sub">
            Total collected:{' '}
            <strong>
              {fmt(receipts.reduce((s, r) => s + (r.amount || 0), 0))}
            </strong>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Receipt
        </button>
      </div>

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Receipts</h3>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Search receipts..."
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
            <div className="empty-state-icon">💵</div>
            <h3>No receipts yet</h3>
            <p>Record payments received from customers</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Ref</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    {r.receipt_number}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                  <td>{r.customer_name}</td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>
                    {invoices.find((i) => i.id === r.invoice_id)
                      ?.invoice_number || '—'}
                  </td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: 'var(--green)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmt(r.amount)}
                  </td>
                  <td>
                    <span className="badge badge-blue">{r.payment_method}</span>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: '12px' }}>
                    {r.reference || '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        exportPDF(
                          r,
                          invoices.find((i) => i.id === r.invoice_id)
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
                <div className="modal-title">New Receipt</div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text2)',
                    marginTop: '2px',
                  }}
                >
                  Next: {generateReceiptNumber(receipts)}
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
                  <label>Receipt Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Customer *</label>
                  <select
                    value={form.customer_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customer_id: e.target.value,
                        invoice_id: '',
                      })
                    }
                  >
                    <option value="">— Select Customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group full">
                  <label>Invoice *</label>
                  <select
                    value={form.invoice_id}
                    onChange={(e) => {
                      const inv = invoices.find((i) => i.id === e.target.value);
                      setForm({
                        ...form,
                        invoice_id: e.target.value,
                        amount: inv ? String(inv.balance) : '',
                      });
                    }}
                  >
                    <option value="">— Select Invoice —</option>
                    {filteredInvoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoice_number} — {i.customer_name} — Balance:{' '}
                        {fmt(i.balance)}
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
                    <option>Cash</option>
                    <option>Bank Transfer</option>
                    <option>Cheque</option>
                    <option>Online Payment</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    value={form.reference}
                    onChange={(e) =>
                      setForm({ ...form, reference: e.target.value })
                    }
                    placeholder="Cheque no, transfer ref..."
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
                {saving ? 'Saving...' : 'Save & Print Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

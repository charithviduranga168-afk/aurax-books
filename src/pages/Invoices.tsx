import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import md5 from 'md5';

interface Invoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  customer_id: string;
  customer_name: string;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  paid_amount: number;
  balance: number;
  status: string;
  notes: string;
}

interface LineItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  cost_price: number;
  cogs: number;
}

interface Props {
  prefillFromSO?: { so: any; lines: any[] } | null;
  onConsumeSoPrefill?: () => void;
}

export default function Invoices({ prefillFromSO, onConsumeSoPrefill }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(() => !!prefillFromSO);
  const [showView, setShowView] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewLines, setViewLines] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSoId, setActiveSoId] = useState<string | null>(() => prefillFromSO?.so?.id || null);
  const [form, setForm] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (prefillFromSO?.so) {
      return { date: today, due_date: due, customer_id: prefillFromSO.so.customer_id || '', notes: `Ref: ${prefillFromSO.so.so_number}`, discount: '0', tax_rate: '0' };
    }
    return { date: today, due_date: due, customer_id: '', notes: '', discount: '0', tax_rate: '0' };
  });
  const [lines, setLines] = useState<LineItem[]>(() => {
    if (prefillFromSO?.lines?.length) {
      return prefillFromSO.lines.map((l: any) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        qty: l.qty,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct || 0,
        line_total: l.line_total,
        cost_price: 0,
        cogs: 0,
      }));
    }
    return [{ product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0, cost_price: 0, cogs: 0 }];
  });

  useEffect(() => {
    loadData();
    if (prefillFromSO) onConsumeSoPrefill?.();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [invRes, custRes, prodRes, settRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false }),
      supabase
        .from('customers')
        .select('id,name,balance')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('products')
        .select('id,name,sales_price,cost_price,stock_qty,unit')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .single(),
    ]);
    setInvoices(invRes.data || []);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);
    setCompanySettings(settRes.data || {});
    setLoading(false);
  }

  function generateInvoiceNumber(existingInvoices: Invoice[]) {
    if (existingInvoices.length === 0) return 'INV-0001';
    const numbers = existingInvoices
      .map((inv) => {
        const match = inv.invoice_number?.match(/(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((n) => !isNaN(n));
    const max = Math.max(0, ...numbers);
    return 'INV-' + String(max + 1).padStart(4, '0');
  }

  function addLine() {
    setLines([
      ...lines,
      {
        product_id: '',
        product_name: '',
        qty: 1,
        unit_price: 0,
        discount_pct: 0,
        line_total: 0,
        cost_price: 0,
        cogs: 0,
      },
    ]);
  }

  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: string, value: any) {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        updated[i].product_name = prod.name;
        updated[i].unit_price = prod.sales_price;
        updated[i].cost_price = prod.cost_price;
      }
    }
    const qty = parseFloat(String(updated[i].qty)) || 0;
    const price = parseFloat(String(updated[i].unit_price)) || 0;
    const disc = parseFloat(String(updated[i].discount_pct)) || 0;
    updated[i].line_total = qty * price * (1 - disc / 100);
    updated[i].cogs = qty * (parseFloat(String(updated[i].cost_price)) || 0);
    setLines(updated);
  }

  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const discountAmt = parseFloat(form.discount) || 0;
  const taxAmt =
    ((subtotal - discountAmt) * (parseFloat(form.tax_rate) || 0)) / 100;
  const total = subtotal - discountAmt + taxAmt;

  function openAdd() {
    setForm({
      date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      customer_id: '',
      notes: '',
      discount: '0',
      tax_rate: '0',
    });
    setLines([
      {
        product_id: '',
        product_name: '',
        qty: 1,
        unit_price: 0,
        discount_pct: 0,
        line_total: 0,
        cost_price: 0,
        cogs: 0,
      },
    ]);
    setShowForm(true);
  }

  async function openView(inv: Invoice) {
    setViewInvoice(inv);
    const { data } = await supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', inv.id);
    setViewLines(data || []);
    setShowView(true);
  }

  async function handleSave() {
    if (!form.customer_id) return alert('Please select a customer');
    const validLines = lines.filter((l) => l.product_id && l.qty > 0);
    if (validLines.length === 0) return alert('Add at least one product line');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const customer = customers.find((c) => c.id === form.customer_id);
    const invNumber = generateInvoiceNumber(invoices);

    const { data: invData, error } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        invoice_number: invNumber,
        date: form.date,
        due_date: form.due_date,
        customer_id: form.customer_id,
        customer_name: customer?.name,
        subtotal,
        tax_amount: taxAmt,
        discount: discountAmt,
        total,
        paid_amount: 0,
        balance: total,
        status: 'Unpaid',
        notes: form.notes,
      })
      .select()
      .single();

    if (error) {
      alert('Error saving invoice: ' + error.message);
      setSaving(false);
      return;
    }

    if (invData) {
      await supabase.from('invoice_lines').insert(
        validLines.map((l) => ({
          invoice_id: invData.id,
          product_id: l.product_id,
          product_name: l.product_name,
          qty: l.qty,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          line_total: l.line_total,
          cost_price: l.cost_price,
          cogs: l.cogs,
        }))
      );
      for (const l of validLines) {
        const { data: prod } = await supabase
          .from('products')
          .select('stock_qty')
          .eq('id', l.product_id)
          .single();
        if (prod)
          await supabase
            .from('products')
            .update({ stock_qty: (prod.stock_qty || 0) - l.qty })
            .eq('id', l.product_id);
      }
      if (customer) {
        await supabase
          .from('customers')
          .update({ balance: (customer.balance || 0) + total })
          .eq('id', form.customer_id);
      }
      if (activeSoId) {
        await supabase.from('sales_orders')
          .update({ status: 'Invoiced', invoice_id: invData.id })
          .eq('id', activeSoId);
        setActiveSoId(null);
      }
    }

    setSaving(false);
    setShowForm(false);
    loadData();
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return;
    await supabase.from('invoice_lines').delete().eq('invoice_id', id);
    await supabase.from('invoices').delete().eq('id', id);
    loadData();
  }

  function exportPDF(inv: Invoice, lineItems: any[]) {
    const doc = new jsPDF();
    const company = companySettings;

    // Header background
    doc.setFillColor(245, 246, 250);
    doc.rect(0, 0, 210, 40, 'F');

    // Company name
    doc.setTextColor(79, 53, 200);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'AURAX BOOKS', 14, 16);

    // Invoice label
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('TAX INVOICE', 14, 26);

    // Invoice number top right
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(inv.invoice_number, 196, 16, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + inv.date, 196, 24, { align: 'right' });
    doc.text('Due: ' + inv.due_date, 196, 31, { align: 'right' });

    // Purple accent line
    doc.setDrawColor(79, 53, 200);
    doc.setLineWidth(0.8);
    doc.line(0, 40, 210, 40);

    // Company details
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    let y = 48;
    if (company.address) {
      doc.text(company.address, 14, y);
      y += 5;
    }
    if (company.phone) {
      doc.text('Tel: ' + company.phone, 14, y);
      y += 5;
    }
    if (company.email) {
      doc.text('Email: ' + company.email, 14, y);
      y += 5;
    }
    if (company.tax_reg) {
      doc.text('Tax Reg: ' + company.tax_reg, 14, y);
      y += 5;
    }

    // Bill to
    y = 48;
    doc.setTextColor(79, 53, 200);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO:', 120, y);
    y += 6;
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(inv.customer_name, 120, y);
    y += 6;

    // Status badge
    const statusColors: any = {
      Paid: [18, 183, 106],
      Partial: [247, 144, 9],
      Unpaid: [240, 68, 56],
    };
    const sc = statusColors[inv.status] || [100, 100, 100];
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.roundedRect(150, 80, 30, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(inv.status.toUpperCase(), 165, 85.5, { align: 'center' });

    // Line items table
    autoTable(doc, {
      startY: 95,
      head: [
        [
          '#',
          'Product / Service',
          'Qty',
          'Unit Price (Rs.)',
          'Disc%',
          'Total (Rs.)',
        ],
      ],
      body: lineItems.map((l, i) => [
        i + 1,
        l.product_name,
        l.qty,
        parseFloat(l.unit_price).toLocaleString('en-LK', {
          minimumFractionDigits: 2,
        }),
        (l.discount_pct || 0) + '%',
        parseFloat(l.line_total).toLocaleString('en-LK', {
          minimumFractionDigits: 2,
        }),
      ]),
      headStyles: {
        fillColor: [79, 53, 200],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 246, 250] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { halign: 'right', cellWidth: 15 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'right', cellWidth: 35 },
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;

    // Totals box
    doc.setFillColor(245, 246, 250);
    doc.rect(
      120,
      finalY,
      76,
      inv.discount > 0 || inv.tax_amount > 0 ? 32 : 16,
      'F'
    );

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let ty = finalY + 7;
    doc.text('Subtotal:', 125, ty);
    doc.text(
      'Rs. ' +
        inv.subtotal.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
      194,
      ty,
      { align: 'right' }
    );

    if (inv.discount > 0) {
      ty += 6;
      doc.text('Discount:', 125, ty);
      doc.text(
        '- Rs. ' +
          inv.discount.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
        194,
        ty,
        { align: 'right' }
      );
    }
    if (inv.tax_amount > 0) {
      ty += 6;
      doc.text('Tax:', 125, ty);
      doc.text(
        'Rs. ' +
          inv.tax_amount.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
        194,
        ty,
        { align: 'right' }
      );
    }

    // Total line
    const totalY = finalY + (inv.discount > 0 || inv.tax_amount > 0 ? 36 : 20);
    doc.setFillColor(79, 53, 200);
    doc.rect(120, totalY, 76, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 125, totalY + 8);
    doc.text(
      'Rs. ' + inv.total.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
      194,
      totalY + 8,
      { align: 'right' }
    );

    // Paid / Balance
    if (inv.paid_amount > 0) {
      const pb = totalY + 18;
      doc.setTextColor(18, 183, 106);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Paid: Rs. ' +
          inv.paid_amount.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
        194,
        pb,
        { align: 'right' }
      );
      doc.setTextColor(240, 68, 56);
      doc.setFont('helvetica', 'bold');
      doc.text(
        'Balance: Rs. ' +
          inv.balance.toLocaleString('en-LK', { minimumFractionDigits: 2 }),
        194,
        pb + 6,
        { align: 'right' }
      );
    }

    // Notes
    if (inv.notes) {
      const ny = totalY + 30;
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Notes: ' + inv.notes, 14, ny);
    }

    // Footer
    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(245, 246, 250);
    doc.rect(0, pageH - 16, 210, 16, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, pageH - 7, {
      align: 'center',
    });
    if (company.company_name) doc.text(company.company_name, 14, pageH - 7);

    doc.save(inv.invoice_number + '.pdf');
  }

  async function handlePrint(inv: Invoice) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', inv.id);
    exportPDF(inv, lines || []);
  }

  function generatePaymentLink(inv: Invoice) {
    const merchantId = companySettings.payhere_merchant_id;
    const merchantSecret = companySettings.payhere_secret;
    if (!merchantId) return;

    const amount = (inv.balance || inv.total).toFixed(2);
    const currency = 'LKR';
    const orderId = inv.invoice_number;

    // PayHere hash: MD5(merchant_id + order_id + amount + currency + MD5(merchant_secret).toUpperCase()).toUpperCase()
    const secretHash = md5(merchantSecret).toUpperCase();
    const hash = md5(merchantId + orderId + amount + currency + secretHash).toUpperCase();

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.payhere.lk/pay/checkout';
    form.style.display = 'none';

    const fields: Record<string, string> = {
      merchant_id: merchantId,
      return_url: window.location.origin,
      cancel_url: window.location.origin,
      notify_url: '',
      order_id: orderId,
      items: `Invoice ${inv.invoice_number}`,
      currency,
      amount,
      first_name: inv.customer_name.split(' ')[0] || inv.customer_name,
      last_name: inv.customer_name.split(' ').slice(1).join(' ') || '',
      email: '',
      phone: '0000000000',
      address: 'Sri Lanka',
      city: 'Colombo',
      country: 'Sri Lanka',
      hash,
    };

    for (const [k, v] of Object.entries(fields)) {
      const inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = k;
      inp.value = v;
      form.appendChild(inp);
    }

    document.body.appendChild(form);
    form.submit();
  }

  const fmt = (n: number) =>
    'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  const filtered = invoices.filter((inv) => {
    const matchSearch =
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalReceivables = invoices.reduce((s, i) => s + (i.balance || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Invoices</div>
          <div className="page-sub">
            {invoices.length} invoices · Receivables:{' '}
            <strong>{fmt(totalReceivables)}</strong>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
        >
          {showForm ? 'Close' : '+ New Invoice'}
        </button>
      </div>
      {/* New Invoice Modal */}
      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">New Invoice</div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text2)',
                  marginTop: '2px',
                }}
              >
                Next: {generateInvoiceNumber(invoices)}
              </div>
            </div>
            <button
              className="modal-close"
              onClick={() => setShowForm(false)}
            >
              ×
            </button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Customer *</label>
                <select
                  value={form.customer_id}
                  onChange={(e) =>
                    setForm({ ...form, customer_id: e.target.value })
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
              <div className="form-group">
                <label>Invoice Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) =>
                    setForm({ ...form, due_date: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Tax %</label>
                <input
                  type="number"
                  value={form.tax_rate}
                  onChange={(e) =>
                    setForm({ ...form, tax_rate: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Discount (LKR)</label>
                <input
                  type="number"
                  value={form.discount}
                  onChange={(e) =>
                    setForm({ ...form, discount: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Product</th>
                    <th style={{ width: '10%' }}>Qty</th>
                    <th style={{ width: '18%' }}>Unit Price</th>
                    <th style={{ width: '10%' }}>Disc%</th>
                    <th style={{ width: '18%' }}>Total</th>
                    <th style={{ width: '9%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select
                          value={line.product_id}
                          onChange={(e) =>
                            updateLine(i, 'product_id', e.target.value)
                          }
                        >
                          <option value="">— Select —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Stock: {p.stock_qty})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.qty}
                          min="1"
                          onChange={(e) =>
                            updateLine(
                              i,
                              'qty',
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(
                              i,
                              'unit_price',
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.discount_pct}
                          min="0"
                          max="100"
                          onChange={(e) =>
                            updateLine(
                              i,
                              'discount_pct',
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: 'var(--brand)',
                          paddingLeft: '8px',
                        }}
                      >
                        {fmt(line.line_total)}
                      </td>
                      <td>
                        {lines.length > 1 && (
                          <button
                            onClick={() => removeLine(i)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--red)',
                              cursor: 'pointer',
                              fontSize: '16px',
                            }}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="line-add-btn" onClick={addLine}>
                + Add Line
              </button>
            </div>

            <div className="totals-box">
              <div className="total-row">
                <span className="total-label">Subtotal:</span>
                <span className="total-value">{fmt(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="total-row">
                  <span className="total-label">Discount:</span>
                  <span
                    className="total-value"
                    style={{ color: 'var(--red)' }}
                  >
                    - {fmt(discountAmt)}
                  </span>
                </div>
              )}
              {taxAmt > 0 && (
                <div className="total-row">
                  <span className="total-label">Tax:</span>
                  <span className="total-value">{fmt(taxAmt)}</span>
                </div>
              )}
              <div className="total-row total-final">
                <span className="total-label">TOTAL:</span>
                <span className="total-value">{fmt(total)}</span>
              </div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Invoice'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Invoices</h3>
          <div className="table-actions">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ minWidth: '120px' }}
            >
              <option value="">All Status</option>
              <option>Unpaid</option>
              <option>Partial</option>
              <option>Paid</option>
            </select>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <h3>No invoices yet</h3>
            <p>Create your first invoice to get started</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: '16px' }}
              onClick={openAdd}
            >
              + New Invoice
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                    {inv.invoice_number}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{inv.date}</td>
                  <td
                    style={{
                      color:
                        new Date(inv.due_date) < new Date() &&
                        inv.status !== 'Paid'
                          ? 'var(--red)'
                          : 'var(--text2)',
                    }}
                  >
                    {inv.due_date}
                  </td>
                  <td style={{ fontWeight: 500 }}>{inv.customer_name}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(inv.total)}
                  </td>
                  <td
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--green)',
                    }}
                  >
                    {fmt(inv.paid_amount)}
                  </td>
                  <td
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                    }}
                  >
                    {fmt(inv.balance)}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        inv.status === 'Paid'
                          ? 'badge-green'
                          : inv.status === 'Partial'
                          ? 'badge-yellow'
                          : 'badge-red'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openView(inv)}
                      >
                        View
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handlePrint(inv)}
                      >
                        PDF
                      </button>
                      {companySettings.payhere_merchant_id && inv.status !== 'Paid' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => generatePaymentLink(inv)}
                          title="Generate PayHere payment link for this invoice"
                          style={{ color: '#0070ba', borderColor: '#0070ba' }}
                        >
                          💳 Pay Link
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteInvoice(inv.id)}
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      {/* View Invoice Modal */}
      {showView && viewInvoice && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowView(false)}
        >
          <div className="modal" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{viewInvoice.invoice_number}</div>
                <span
                  className={`badge ${
                    viewInvoice.status === 'Paid'
                      ? 'badge-green'
                      : viewInvoice.status === 'Partial'
                      ? 'badge-yellow'
                      : 'badge-red'
                  }`}
                  style={{ marginTop: '4px' }}
                >
                  {viewInvoice.status}
                </span>
              </div>
              <div
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => exportPDF(viewInvoice, viewLines)}
                >
                  ⬇ Download PDF
                </button>
                <button
                  className="modal-close"
                  onClick={() => setShowView(false)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                {[
                  { label: 'Customer', value: viewInvoice.customer_name },
                  { label: 'Invoice Date', value: viewInvoice.date },
                  { label: 'Due Date', value: viewInvoice.due_date },
                  { label: 'Total', value: fmt(viewInvoice.total) },
                  { label: 'Paid', value: fmt(viewInvoice.paid_amount) },
                  { label: 'Balance', value: fmt(viewInvoice.balance) },
                ].map((f) => (
                  <div
                    key={f.label}
                    style={{
                      padding: '12px',
                      background: 'var(--bg3)',
                      borderRadius: '8px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text2)',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      {f.label}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="section-header" style={{ marginBottom: '12px' }}>
                LINE ITEMS
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Disc%</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewLines.map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                      <td>{l.qty}</td>
                      <td>{fmt(l.unit_price)}</td>
                      <td>{l.discount_pct || 0}%</td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)' }}>
                        {fmt(l.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="totals-box" style={{ marginTop: '16px' }}>
                <div className="total-row">
                  <span className="total-label">Subtotal:</span>
                  <span className="total-value">
                    {fmt(viewInvoice.subtotal)}
                  </span>
                </div>
                {viewInvoice.discount > 0 && (
                  <div className="total-row">
                    <span className="total-label">Discount:</span>
                    <span
                      className="total-value"
                      style={{ color: 'var(--red)' }}
                    >
                      - {fmt(viewInvoice.discount)}
                    </span>
                  </div>
                )}
                {viewInvoice.tax_amount > 0 && (
                  <div className="total-row">
                    <span className="total-label">Tax:</span>
                    <span className="total-value">
                      {fmt(viewInvoice.tax_amount)}
                    </span>
                  </div>
                )}
                <div className="total-row total-final">
                  <span className="total-label">TOTAL:</span>
                  <span className="total-value">{fmt(viewInvoice.total)}</span>
                </div>
              </div>
              {viewInvoice.notes && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px',
                    background: 'var(--bg3)',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                >
                  <strong>Notes:</strong> {viewInvoice.notes}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowView(false)}
              >
                Close
              </button>
              {companySettings.payhere_merchant_id && viewInvoice.status !== 'Paid' && (
                <button
                  className="btn btn-secondary"
                  onClick={() => generatePaymentLink(viewInvoice)}
                  style={{ color: '#0070ba', borderColor: '#0070ba' }}
                >
                  💳 Send Payment Link
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => exportPDF(viewInvoice, viewLines)}
              >
                ⬇ Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

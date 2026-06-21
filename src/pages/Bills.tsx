import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LineItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}

interface Props {
  onCreateGrn?: (bill: any, lines: any[]) => void;
  prefillFromPO?: { po: any; lines: any[] } | null;
  onConsumePOPrefill?: () => void;
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

export default function Bills({ onCreateGrn, prefillFromPO, onConsumePOPrefill }: Props = {}) {
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // list→detail state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any>(null);
  const [selectedLines, setSelectedLines] = useState<any[]>([]);
  const [selectedGrns, setSelectedGrns] = useState<any[]>([]);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    supplier_id: '',
    notes: '',
    tax_rate: '0',
  });
  const [lines, setLines] = useState<LineItem[]>([
    { product_id: '', product_name: '', qty: 1, unit_cost: 0, line_total: 0 },
  ]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!prefillFromPO) return;
    const { po, lines: poLines } = prefillFromPO;
    setForm(f => ({ ...f, supplier_id: po.supplier_id || '', notes: `Ref: ${po.po_number}` }));
    setLines((poLines || []).map((l: any) => ({ product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, line_total: l.line_total })));
    setShowForm(true);
    onConsumePOPrefill?.();
  }, [prefillFromPO]);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [billRes, suppRes, prodRes, settRes] = await Promise.all([
      supabase.from('bills').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('suppliers').select('id,name,balance').eq('user_id', user.id).order('name'),
      supabase.from('products').select('id,name,cost_price,stock_qty').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setBills(billRes.data || []);
    setSuppliers(suppRes.data || []);
    setProducts(prodRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  async function openDetail(bill: any) {
    setSelected(bill);
    const [{ data: lineData }, { data: grnData }] = await Promise.all([
      supabase.from('bill_lines').select('*').eq('bill_id', bill.id),
      supabase.from('grn_headers').select('*').eq('bill_id', bill.id),
    ]);
    setSelectedLines(lineData || []);
    setSelectedGrns(grnData || []);
    setView('detail');
  }

  function generateBillNumber(existing: any[]) {
    if (existing.length === 0) return 'BILL-0001';
    const nums = existing.map(b => { const m = b.bill_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'BILL-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function addLine() {
    setLines([...lines, { product_id: '', product_name: '', qty: 1, unit_cost: 0, line_total: 0 }]);
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, field: string, value: any) {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    if (field === 'product_id') {
      const prod = products.find(p => p.id === value);
      if (prod) { updated[i].product_name = prod.name; updated[i].unit_cost = prod.cost_price; }
    }
    updated[i].line_total = (parseFloat(String(updated[i].qty)) || 0) * (parseFloat(String(updated[i].unit_cost)) || 0);
    setLines(updated);
  }

  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const taxAmt = (subtotal * (parseFloat(form.tax_rate) || 0)) / 100;
  const total = subtotal + taxAmt;

  // Bill → GRN → Stock document flow trail
  function flowBar(bill: any, grn: any) {
    const stockDone = grn?.status === 'Received' || grn?.status === 'Partial';
    const chip = (label: string, tone: 'done' | 'pending') => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: tone === 'done' ? 'var(--green-bg)' : 'var(--bg3)', color: tone === 'done' ? '#12b76a' : 'var(--text3)', border: `1px solid ${tone === 'done' ? 'var(--green)' : 'var(--border)'}`, whiteSpace: 'nowrap' }}>{label}</span>
    );
    const arrow = <span style={{ color: 'var(--text3)' }}>→</span>;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px', background: 'var(--bg3)', borderRadius: '10px', marginBottom: '20px' }}>
        {chip(`Bill (${bill.bill_number})`, 'done')}
        {arrow}
        {chip(grn ? `GRN (${grn.grn_number})` : 'GRN — pending', grn ? 'done' : 'pending')}
        {arrow}
        {chip(stockDone ? 'Stock Updated' : 'Stock — pending', stockDone ? 'done' : 'pending')}
      </div>
    );
  }

  async function handleSave() {
    if (!form.supplier_id) return alert('Please select a supplier');
    const validLines = lines.filter(l => l.product_id && l.qty > 0);
    if (validLines.length === 0) return alert('Add at least one product line');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    const billNumber = generateBillNumber(bills);

    const { data: billData } = await supabase.from('bills').insert({
      user_id: user.id,
      bill_number: billNumber,
      date: form.date,
      due_date: form.due_date,
      supplier_id: form.supplier_id,
      supplier_name: supplier?.name,
      subtotal,
      tax_amount: taxAmt,
      total,
      paid_amount: 0,
      balance: total,
      status: 'Unpaid',
      notes: form.notes,
    }).select().single();

    if (billData) {
      await supabase.from('bill_lines').insert(
        validLines.map(l => ({ bill_id: billData.id, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, line_total: l.line_total }))
      );
      if (supplier) await supabase.from('suppliers').update({ balance: (supplier.balance || 0) + total }).eq('id', form.supplier_id);
      exportPDF({ ...billData, supplier_name: supplier?.name }, validLines);
    }

    setSaving(false);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], supplier_id: '', notes: '', tax_rate: '0' });
    setLines([{ product_id: '', product_name: '', qty: 1, unit_cost: 0, line_total: 0 }]);
    loadData();
  }

  function exportPDF(bill: any, lineItems: any[]) {
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
    doc.text('PURCHASE BILL', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(bill.bill_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + bill.date, 198, 22, { align: 'right' });
    doc.text('Due: ' + bill.due_date, 198, 28, { align: 'right' });

    doc.setDrawColor(79, 53, 200);
    doc.setLineWidth(0.5);
    doc.line(0, 42, 210, 42);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 120, 120);
    doc.text('SUPPLIER:', 12, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(bill.supplier_name || '—', 12, 57);

    const statusColors: any = { Paid: [18, 183, 106], Partial: [247, 144, 9], Unpaid: [240, 68, 56] };
    const sc = statusColors[bill.status] || [79, 53, 200];
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(bill.status?.toUpperCase() || 'UNPAID', 172, 53, { align: 'center' });

    autoTable(doc, {
      startY: 68,
      head: [['#', 'Product', 'Qty', 'Unit Cost (Rs.)', 'Total (Rs.)']],
      body: lineItems.map((l, i) => [i + 1, l.product_name, l.qty, fmtN(l.unit_cost), fmtN(l.line_total)]),
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 12, right: 12 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    if (bill.subtotal !== bill.total) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text('Subtotal:', 145, finalY + 6); doc.text('Rs. ' + fmtN(bill.subtotal), 196, finalY + 6, { align: 'right' });
      if (bill.tax_amount > 0) { doc.text('Tax:', 145, finalY + 12); doc.text('Rs. ' + fmtN(bill.tax_amount), 196, finalY + 12, { align: 'right' }); }
    }
    const totalY = bill.subtotal !== bill.total ? finalY + 16 : finalY;
    doc.setFillColor(79, 53, 200);
    doc.rect(120, totalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', 125, totalY + 8);
    doc.text('Rs. ' + fmtN(bill.total), 196, totalY + 8, { align: 'right' });

    if (bill.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + bill.notes, 12, totalY + 22); }

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, pageH - 6, { align: 'center' });
    doc.save(bill.bill_number + '.pdf');
  }

  const filtered = bills.filter(b => {
    const matchSearch = (b.bill_number || '').toLowerCase().includes(search.toLowerCase()) || (b.supplier_name || '').toLowerCase().includes(search.toLowerCase());
    return matchSearch && (!filterStatus || b.status === filterStatus);
  });

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const bill = selected;
    const isOverdue = bill.status !== 'Paid' && new Date(bill.due_date) < new Date();
    return (
      <div>
        <BackBtn label="Back to Bills" onClick={() => { setView('list'); setSelected(null); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>{bill.bill_number}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <span className={`badge ${bill.status === 'Paid' ? 'badge-green' : bill.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{bill.status}</span>
                {isOverdue && <span className="badge badge-red">Overdue</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{bill.supplier_name} · Due: {bill.due_date}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => exportPDF(bill, selectedLines)}>PDF</button>
              {bill.status !== 'Paid' && (
                <button className="btn btn-secondary btn-sm" onClick={async () => { onCreateGrn?.(bill, selectedLines); }}>Create GRN</button>
              )}
            </div>
          </div>
        </div>

        {flowBar(bill, selectedGrns[0] || null)}

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-color': '#7c3aed' } as any}>
            <div className="kpi-label">Total</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(bill.total)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#16a34a' } as any}>
            <div className="kpi-label">Paid</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(bill.paid_amount)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#dc2626' } as any}>
            <div className="kpi-label">Balance</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(bill.balance)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': isOverdue ? '#dc2626' : '#2e90fa' } as any}>
            <div className="kpi-label">Due Date</div>
            <div className="kpi-value" style={{ fontSize: 16, color: isOverdue ? '#dc2626' : undefined }}>{bill.due_date}</div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <div className="table-toolbar"><h3>Line Items</h3></div>
          <table>
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead>
            <tbody>
              {selectedLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.product_name}</td>
                  <td>{l.qty}</td>
                  <td>{fmt(l.unit_cost)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Subtotal: {fmt(bill.subtotal)}</div>
            {bill.tax_amount > 0 && <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Tax: {fmt(bill.tax_amount)}</div>}
            <div style={{ fontWeight: 700, fontSize: 16 }}>Total: {fmt(bill.total)}</div>
          </div>
        </div>

        {selectedGrns.length > 0 && (
          <div className="table-wrap">
            <div className="table-toolbar"><h3>Linked GRNs</h3></div>
            <table>
              <thead><tr><th>GRN #</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {selectedGrns.map(g => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{g.grn_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{g.date}</td>
                    <td><span className={`badge ${g.status === 'Received' ? 'badge-green' : g.status === 'Partial' ? 'badge-yellow' : 'badge-blue'}`}>{g.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {bill.notes && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
            <strong>Notes:</strong> {bill.notes}
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
          <div className="page-title">Purchase Bills</div>
          <div className="page-sub">Payables: <strong>{fmt(bills.reduce((s, b) => s + (b.balance || 0), 0))}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ New Bill'}</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">New Purchase Bill</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Next: {generateBillNumber(bills)}</div>
            </div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Supplier *</label>
                <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Bill Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tax %</label>
                <input type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} placeholder="0" />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead><tr><th style={{ width: '40%' }}>Product</th><th style={{ width: '12%' }}>Qty</th><th style={{ width: '22%' }}>Unit Cost</th><th style={{ width: '18%' }}>Total</th><th style={{ width: '8%' }}></th></tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                          <option value="">— Select —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" value={line.qty} min="1" onChange={e => updateLine(i, 'qty', parseFloat(e.target.value) || 0)} /></td>
                      <td><input type="number" value={line.unit_cost} onChange={e => updateLine(i, 'unit_cost', parseFloat(e.target.value) || 0)} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)', paddingLeft: '8px' }}>{fmt(line.line_total)}</td>
                      <td>{lines.length > 1 && <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '16px' }}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="line-add-btn" onClick={addLine}>+ Add Line</button>
            </div>
            <div className="totals-box">
              <div className="total-row"><span className="total-label">Subtotal:</span><span className="total-value">{fmt(subtotal)}</span></div>
              {taxAmt > 0 && <div className="total-row"><span className="total-label">Tax:</span><span className="total-value">{fmt(taxAmt)}</span></div>}
              <div className="total-row total-final"><span className="total-label">TOTAL:</span><span className="total-value">{fmt(total)}</span></div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save & Print Bill'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Bills</h3>
          <div className="table-actions">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: '120px' }}>
              <option value="">All Status</option>
              <option>Unpaid</option>
              <option>Partial</option>
              <option>Paid</option>
            </select>
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search bills..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No bills yet</h3>
            <p>Record supplier invoices here</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Bill #</th><th>Date</th><th>Due Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id} onClick={() => openDetail(b)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{b.bill_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{b.date}</td>
                  <td style={{ color: new Date(b.due_date) < new Date() && b.status !== 'Paid' ? 'var(--red)' : 'var(--text2)' }}>{b.due_date}</td>
                  <td style={{ fontWeight: 500 }}>{b.supplier_name}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(b.total)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--green)' }}>{fmt(b.paid_amount)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(b.balance)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <span className={`badge ${b.status === 'Paid' ? 'badge-green' : b.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{b.status}</span>
                  </td>
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

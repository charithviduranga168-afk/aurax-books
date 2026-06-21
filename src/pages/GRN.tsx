import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Page } from '../App';

interface GrnLine {
  id?: string;
  product_id: string;
  product_name: string;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  line_total: number;
}

interface Props {
  nav?: (p: Page) => void;
  prefill?: { bill: any; lines: any[] } | null;
  onConsumePrefill?: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-blue',
  Partial: 'badge-yellow',
  Received: 'badge-green',
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

export default function GRN({ nav, prefill, onConsumePrefill }: Props) {
  const [grns, setGrns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // list→detail state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any>(null);
  const [selectedLines, setSelectedLines] = useState<GrnLine[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    supplier_id: '',
    supplier_name: '',
    bill_id: '',
    bill_number: '',
  });
  const [lines, setLines] = useState<GrnLine[]>([]);

  const [dialog, setDialog] = useState<{ message: string; onConfirm?: () => void } | null>(null);
  function showAlert(message: string) { setDialog({ message }); }
  function showConfirm(message: string, onConfirm: () => void) { setDialog({ message, onConfirm }); }
  const clampNonNeg = (v: string) => Math.max(0, parseFloat(v) || 0);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!prefill) return;
    const { bill, lines: billLines } = prefill;
    setForm({ date: new Date().toISOString().slice(0, 10), notes: '', supplier_id: bill.supplier_id, supplier_name: bill.supplier_name, bill_id: bill.id, bill_number: bill.bill_number });
    setLines((billLines || []).map((l: any) => ({ product_id: l.product_id, product_name: l.product_name, ordered_qty: l.qty, received_qty: l.qty, unit_cost: l.unit_cost, line_total: l.qty * l.unit_cost })));
    setShowForm(true);
    onConsumePrefill?.();
  }, [prefill]);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [grnRes, prodRes, settRes] = await Promise.all([
      supabase.from('grn_headers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('products').select('id,name,cost_price,stock_qty').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setGrns(grnRes.data || []);
    setProducts(prodRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  async function openDetail(grn: any) {
    setSelected(grn);
    const { data } = await supabase.from('grn_lines').select('*').eq('grn_id', grn.id);
    setSelectedLines((data || []).map((l: any) => ({ id: l.id, product_id: l.product_id, product_name: l.product_name, ordered_qty: l.ordered_qty, received_qty: l.received_qty, unit_cost: l.unit_cost, line_total: l.line_total })));
    setView('detail');
  }

  function generateGrnNumber() {
    if (grns.length === 0) return 'GRN-0001';
    const nums = grns.map(g => { const m = g.grn_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'GRN-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function resetForm() {
    setForm({ date: new Date().toISOString().slice(0, 10), notes: '', supplier_id: '', supplier_name: '', bill_id: '', bill_number: '' });
    setLines([]);
  }

  function updateLine(i: number, field: 'received_qty' | 'unit_cost', value: number) {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    updated[i].line_total = (updated[i].received_qty || 0) * (updated[i].unit_cost || 0);
    setLines(updated);
  }

  function updateSelectedLine(i: number, field: 'received_qty' | 'unit_cost', value: number) {
    const updated = [...selectedLines];
    updated[i] = { ...updated[i], [field]: value };
    updated[i].line_total = (updated[i].received_qty || 0) * (updated[i].unit_cost || 0);
    setSelectedLines(updated);
  }

  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  async function handleSave() {
    if (!form.supplier_id) { showAlert('No supplier linked — open this GRN from a Bill'); return; }
    if (lines.length === 0) { showAlert('No line items to receive'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const grnNumber = generateGrnNumber();
    const { data: grnData, error } = await supabase.from('grn_headers').insert({
      user_id: user.id, grn_number: grnNumber, date: form.date, supplier_id: form.supplier_id, supplier_name: form.supplier_name,
      bill_id: form.bill_id || null, bill_number: form.bill_number || null, status: 'Draft', notes: form.notes,
    }).select().single();

    if (error || !grnData) { setSaving(false); showAlert('Failed to create GRN'); return; }

    await supabase.from('grn_lines').insert(
      lines.map(l => ({ grn_id: grnData.id, product_id: l.product_id, product_name: l.product_name, ordered_qty: l.ordered_qty, received_qty: l.received_qty, unit_cost: l.unit_cost, line_total: l.line_total }))
    );

    setSaving(false);
    setShowForm(false);
    resetForm();
    loadAll();
  }

  function handleDelete(grn: any) {
    showConfirm(`Delete draft GRN ${grn.grn_number}? This cannot be undone.`, async () => {
      await supabase.from('grn_lines').delete().eq('grn_id', grn.id);
      await supabase.from('grn_headers').delete().eq('id', grn.id);
      setView('list');
      setSelected(null);
      loadAll();
    });
  }

  function markReceived(grn: any) {
    showConfirm(
      `Mark ${grn.grn_number} as received? This will add the received quantities to product stock and update the linked bill.`,
      async () => {
        for (const l of selectedLines) {
          if (l.id) {
            await supabase.from('grn_lines').update({ received_qty: l.received_qty, unit_cost: l.unit_cost, line_total: l.line_total }).eq('id', l.id);
          }
          const product = products.find(p => p.id === l.product_id);
          if (product) {
            const oldQty = product.stock_qty || 0;
            const oldCost = product.cost_price || 0;
            const recvQty = l.received_qty || 0;
            const newQty = oldQty + recvQty;
            const newCost = newQty > 0 ? (oldQty * oldCost + recvQty * (l.unit_cost || 0)) / newQty : oldCost;
            await supabase.from('products').update({ stock_qty: newQty, cost_price: newCost }).eq('id', product.id);
          }
        }
        const isFull = selectedLines.every(l => (l.received_qty || 0) >= (l.ordered_qty || 0));
        const newStatus = isFull ? 'Received' : 'Partial';
        await supabase.from('grn_headers').update({ status: newStatus }).eq('id', grn.id);
        if (grn.bill_id) { await supabase.from('bills').update({ status: newStatus }).eq('id', grn.bill_id); }
        if (!grn.bill_id && grn.bill_number && /^PO-/i.test(grn.bill_number)) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) { await supabase.from('purchase_orders').update({ status: newStatus }).eq('po_number', grn.bill_number).eq('user_id', user.id); }
        }
        setSelected((prev: any) => prev?.id === grn.id ? { ...prev, status: newStatus } : prev);
        loadAll();
      }
    );
  }

  function exportPDF(grn: any, lineItems: GrnLine[]) {
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
    doc.text('GOODS RECEIVED NOTE', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(grn.grn_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + grn.date, 198, 22, { align: 'right' });
    doc.text('Bill Ref: ' + (grn.bill_number || '—'), 198, 28, { align: 'right' });

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
    doc.text(grn.supplier_name || '—', 12, 57);

    const statusColors: any = { Received: [18, 183, 106], Partial: [247, 144, 9], Draft: [108, 171, 238] };
    const sc = statusColors[grn.status] || [79, 53, 200];
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(grn.status?.toUpperCase() || 'DRAFT', 172, 53, { align: 'center' });

    autoTable(doc, {
      startY: 68,
      head: [['#', 'Product', 'Ordered', 'Received', 'Unit Cost (Rs.)', 'Total (Rs.)']],
      body: lineItems.map((l, i) => [i + 1, l.product_name, l.ordered_qty, l.received_qty, fmtN(l.unit_cost), fmtN(l.line_total)]),
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 12, right: 12 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    const total = lineItems.reduce((s, l) => s + (l.line_total || 0), 0);
    doc.setFillColor(79, 53, 200);
    doc.rect(120, finalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', 125, finalY + 8);
    doc.text('Rs. ' + fmtN(total), 196, finalY + 8, { align: 'right' });

    if (grn.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + grn.notes, 12, finalY + 22); }

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Generated by LedgerX', 105, pageH - 6, { align: 'center' });
    doc.save(grn.grn_number + '.pdf');
  }

  function statusBadge(status: string) {
    return <span className={`badge ${STATUS_BADGE[status] || 'badge-blue'}`}>{status}</span>;
  }

  function flowBar(billNumber: string | null, grnNumber: string | null, status: string | null) {
    const stockDone = status === 'Received' || status === 'Partial';
    const chip = (label: string, tone: 'done' | 'pending') => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: tone === 'done' ? 'var(--green-bg)' : 'var(--bg3)', color: tone === 'done' ? '#12b76a' : 'var(--text3)', border: `1px solid ${tone === 'done' ? 'var(--green)' : 'var(--border)'}`, whiteSpace: 'nowrap' }}>{label}</span>
    );
    const arrow = <span style={{ color: 'var(--text3)' }}>→</span>;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px', background: 'var(--bg3)', borderRadius: '10px', marginBottom: '20px' }}>
        {chip(billNumber?.startsWith('PO-') ? `PO (${billNumber})` : `Bill (${billNumber || '—'})`, 'done')}
        {arrow}
        {chip(grnNumber ? `GRN (${grnNumber})` : 'GRN — pending', grnNumber ? 'done' : 'pending')}
        {arrow}
        {chip(stockDone ? 'Stock Updated' : 'Stock — pending', stockDone ? 'done' : 'pending')}
      </div>
    );
  }

  const filtered = grns.filter(g =>
    (g.grn_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.supplier_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.bill_number || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const grn = selected;
    const detailTotal = selectedLines.reduce((s, l) => s + (l.line_total || 0), 0);
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <BackBtn label="Back to GRNs" onClick={() => { setView('list'); setSelected(null); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>{grn.grn_number}</div>
              <div style={{ marginBottom: 10 }}>{statusBadge(grn.status)}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{grn.supplier_name} · {grn.date}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => exportPDF(grn, selectedLines)}>PDF</button>
              {grn.status === 'Draft' && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => markReceived(grn)}>Mark as Received</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(grn)}>Delete</button>
                </>
              )}
            </div>
          </div>
        </div>

        {flowBar(grn.bill_number, grn.grn_number, grn.status)}

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-color': '#7c3aed' } as any}>
            <div className="kpi-label">Total Value</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(detailTotal)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#2e90fa' } as any}>
            <div className="kpi-label">Status</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{grn.status}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#16a34a' } as any}>
            <div className="kpi-label">Linked Ref</div>
            <div className="kpi-value" style={{ fontSize: 14 }}>{grn.bill_number || '—'}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#d97706' } as any}>
            <div className="kpi-label">GRN Date</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{grn.date}</div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="table-toolbar"><h3>Line Items</h3></div>
          <table>
            <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Unit Cost</th><th>Total</th></tr></thead>
            <tbody>
              {selectedLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                  <td>{l.ordered_qty}</td>
                  <td>
                    {grn.status === 'Draft' ? (
                      <input type="number" min="0" style={{ maxWidth: '90px' }} value={l.received_qty} onChange={e => updateSelectedLine(i, 'received_qty', clampNonNeg(e.target.value))} />
                    ) : l.received_qty}
                  </td>
                  <td>
                    {grn.status === 'Draft' ? (
                      <input type="number" min="0" style={{ maxWidth: '100px' }} value={l.unit_cost} onChange={e => updateSelectedLine(i, 'unit_cost', clampNonNeg(e.target.value))} />
                    ) : fmt(l.unit_cost)}
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmt(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: '12px 16px', borderTop: '1px solid var(--border)', fontWeight: 700 }}>
            Total: {fmt(detailTotal)}
          </div>
        </div>

        {grn.notes && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
            <strong>Notes:</strong> {grn.notes}
          </div>
        )}

        {dialog && (
          <div className="modal-overlay" onClick={() => setDialog(null)}>
            <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header"><div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div><button className="modal-close" onClick={() => setDialog(null)}>×</button></div>
              <div className="modal-body"><p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p></div>
              <div className="modal-footer">
                {dialog.onConfirm ? (
                  <><button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const action = dialog.onConfirm; setDialog(null); action?.(); }}>Confirm</button></>
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

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Goods Received Notes</div>
          <div className="page-sub">{grns.length} total GRNs · created from purchase bills</div>
        </div>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">New Goods Received Note</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Next: {generateGrnNumber()} · From Bill {form.bill_number || '—'}</div>
            </div>
            <button className="modal-close" onClick={() => { setShowForm(false); resetForm(); }}>×</button>
          </div>
          <div className="inline-panel-body">
            {flowBar(form.bill_number, null, null)}
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group"><label>Supplier</label><input value={form.supplier_name} disabled /></div>
              <div className="form-group">
                <label>{form.bill_number?.startsWith('PO-') ? 'Linked PO' : 'Linked Bill'}</label>
                <input value={form.bill_number || '—'} disabled />
              </div>
              <div className="form-group">
                <label>GRN Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group full">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="section-header">LINE ITEMS — confirm received quantities</div>
            <div className="line-items">
              <table>
                <thead><tr><th style={{ width: '34%' }}>Product</th><th style={{ width: '14%' }}>Ordered Qty</th><th style={{ width: '16%' }}>Received Qty</th><th style={{ width: '18%' }}>Unit Cost</th><th style={{ width: '18%' }}>Total</th></tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{line.product_name}</td>
                      <td style={{ color: 'var(--text2)' }}>{line.ordered_qty}</td>
                      <td><input type="number" min="0" value={line.received_qty} onChange={e => updateLine(i, 'received_qty', clampNonNeg(e.target.value))} /></td>
                      <td><input type="number" min="0" value={line.unit_cost} onChange={e => updateLine(i, 'unit_cost', clampNonNeg(e.target.value))} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)', paddingLeft: '8px' }}>{fmt(line.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals-box">
              <div className="total-row total-final"><span className="total-label">TOTAL:</span><span className="total-value">{fmt(subtotal)}</span></div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Draft GRN'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>All Goods Received Notes</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search GRNs..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No GRNs yet</h3>
            <p>Create a Goods Received Note from a purchase bill to track stock receipts</p>
            {nav && <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => nav('bills')}>Go to Bills</button>}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>GRN #</th><th>Date</th><th>Supplier</th><th>Linked Bill</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} onClick={() => openDetail(g)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{g.grn_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{g.date}</td>
                  <td style={{ fontWeight: 500 }}>{g.supplier_name}</td>
                  <td>
                    {g.bill_number ? (
                      <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{g.bill_number}</span>
                    ) : (
                      <span style={{ color: 'var(--text3)' }}>—</span>
                    )}
                  </td>
                  <td>{statusBadge(g.status)}</td>
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
            <div className="modal-header"><div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div><button className="modal-close" onClick={() => setDialog(null)}>×</button></div>
            <div className="modal-body"><p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p></div>
            <div className="modal-footer">
              {dialog.onConfirm ? (
                <><button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const action = dialog.onConfirm; setDialog(null); action?.(); }}>Confirm</button></>
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

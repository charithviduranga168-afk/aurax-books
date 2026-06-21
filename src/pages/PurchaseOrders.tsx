import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Page } from '../App';
import { StatusBar } from '../components/StatusBar';

interface PoLine {
  id?: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_cost: number;
  tax_rate: number;
  line_total: number;
}

interface Props {
  onReceiveProducts?: (po: any, lines: any[]) => void;
  onCreateBill?: (po: any, lines: any[]) => void;
  nav?: (p: Page) => void;
}

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-blue',
  Sent: 'badge-yellow',
  Confirmed: 'badge-purple',
  Partial: 'badge-yellow',
  Received: 'badge-green',
  Cancelled: 'badge-red',
};

const STATUS_STEPS = ['Draft', 'Sent', 'Confirmed', 'Received'];

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

export default function PurchaseOrders({ onReceiveProducts, onCreateBill, nav }: Props) {
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'rfq' | 'confirmed' | 'received'>('all');

  // list→detail state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<any>(null);
  const [selectedLines, setSelectedLines] = useState<PoLine[]>([]);
  const [linkedGrns, setLinkedGrns] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPO, setEditingPO] = useState<any>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    supplier_id: '',
    supplier_name: '',
    notes: '',
    tax_rate: '0',
  });
  const [lines, setLines] = useState<PoLine[]>([
    { product_id: '', product_name: '', qty: 1, unit_cost: 0, tax_rate: 0, line_total: 0 },
  ]);

  const [dialog, setDialog] = useState<{ message: string; onConfirm?: () => void } | null>(null);
  const showAlert = (msg: string) => setDialog({ message: msg });
  const showConfirm = (msg: string, fn: () => void) => setDialog({ message: msg, onConfirm: fn });
  const clampNonNeg = (v: string) => Math.max(0, parseFloat(v) || 0);
  const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [poRes, supRes, prodRes, settRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id,name').eq('user_id', user.id).order('name'),
      supabase.from('products').select('id,name,cost_price,unit').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setPos(poRes.data || []);
    setSuppliers(supRes.data || []);
    setProducts(prodRes.data || []);
    setCompany(settRes.data || {});
    setLoading(false);
  }

  async function openDetail(po: any) {
    setSelected(po);
    const [{ data: lineData }, { data: grnData }] = await Promise.all([
      supabase.from('purchase_order_lines').select('*').eq('po_id', po.id),
      supabase.from('grn_headers').select('*').eq('bill_number', po.po_number),
    ]);
    setSelectedLines((lineData || []).map((l: any) => ({ id: l.id, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, tax_rate: l.tax_rate, line_total: l.line_total })));
    setLinkedGrns(grnData || []);
    setView('detail');
  }

  function generatePoNumber() {
    if (pos.length === 0) return 'PO-0001';
    const nums = pos.map(p => { const m = p.po_number?.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
    return 'PO-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
  }

  function resetForm() {
    setForm({ date: new Date().toISOString().slice(0, 10), expected_date: '', supplier_id: '', supplier_name: '', notes: '', tax_rate: '0' });
    setLines([{ product_id: '', product_name: '', qty: 1, unit_cost: 0, tax_rate: 0, line_total: 0 }]);
    setEditingPO(null);
  }

  function addLine() {
    setLines([...lines, { product_id: '', product_name: '', qty: 1, unit_cost: 0, tax_rate: parseFloat(form.tax_rate) || 0, line_total: 0 }]);
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
      if (prod) {
        updated[i].product_name = prod.name;
        updated[i].unit_cost = prod.cost_price || 0;
        updated[i].tax_rate = parseFloat(form.tax_rate) || 0;
      }
    }
    updated[i].line_total = (updated[i].qty || 0) * (updated[i].unit_cost || 0);
    setLines(updated);
  }

  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const taxAmt = lines.reduce((s, l) => s + (l.line_total || 0) * ((l.tax_rate || 0) / 100), 0);
  const total = subtotal + taxAmt;

  async function handleSave() {
    if (!form.supplier_id) { showAlert('Please select a supplier'); return; }
    const validLines = lines.filter(l => l.product_id && l.qty > 0);
    if (validLines.length === 0) { showAlert('Add at least one product line'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload: any = {
      user_id: user.id,
      po_number: editingPO ? editingPO.po_number : generatePoNumber(),
      date: form.date,
      expected_date: form.expected_date || null,
      supplier_id: form.supplier_id,
      supplier_name: form.supplier_name,
      status: editingPO ? editingPO.status : 'Draft',
      notes: form.notes,
      subtotal,
      tax_amount: taxAmt,
      total,
    };

    let poId = editingPO?.id;
    if (editingPO) {
      await supabase.from('purchase_orders').update(payload).eq('id', editingPO.id);
      await supabase.from('purchase_order_lines').delete().eq('po_id', editingPO.id);
    } else {
      const { data } = await supabase.from('purchase_orders').insert(payload).select().single();
      poId = data?.id;
    }

    if (poId) {
      await supabase.from('purchase_order_lines').insert(
        validLines.map(l => ({ po_id: poId, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, tax_rate: l.tax_rate, line_total: l.line_total }))
      );
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
    loadAll();
  }

  async function openEdit(po: any) {
    setEditingPO(po);
    setForm({ date: po.date, expected_date: po.expected_date || '', supplier_id: po.supplier_id || '', supplier_name: po.supplier_name || '', notes: po.notes || '', tax_rate: '0' });
    const { data } = await supabase.from('purchase_order_lines').select('*').eq('po_id', po.id);
    setLines((data || []).map((l: any) => ({ id: l.id, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, tax_rate: l.tax_rate || 0, line_total: l.line_total })));
    setShowForm(true);
  }

  function handleDelete(po: any) {
    showConfirm(`Delete draft PO ${po.po_number}? This cannot be undone.`, async () => {
      await supabase.from('purchase_order_lines').delete().eq('po_id', po.id);
      await supabase.from('purchase_orders').delete().eq('id', po.id);
      setView('list');
      setSelected(null);
      loadAll();
    });
  }

  async function updateStatus(po: any, newStatus: string) {
    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', po.id);
    setSelected((prev: any) => prev?.id === po.id ? { ...prev, status: newStatus } : prev);
    setPos(prev => prev.map(p => p.id === po.id ? { ...p, status: newStatus } : p));
  }

  async function receiveProducts(po: any) {
    const { data } = await supabase.from('purchase_order_lines').select('*').eq('po_id', po.id);
    onReceiveProducts?.(po, data || []);
  }

  async function createBill(po: any) {
    const { data } = await supabase.from('purchase_order_lines').select('*').eq('po_id', po.id);
    onCreateBill?.(po, data || []);
  }

  function exportPDF(po: any, lineItems: PoLine[]) {
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
    doc.text('PURCHASE ORDER', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(po.po_number, 198, 14, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + po.date, 198, 22, { align: 'right' });
    if (po.expected_date) doc.text('Expected: ' + po.expected_date, 198, 28, { align: 'right' });

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
    doc.text(po.supplier_name || '—', 12, 57);

    const sc: Record<string, number[]> = { Confirmed: [79, 53, 200], Received: [18, 183, 106], Cancelled: [240, 68, 56], Sent: [247, 144, 9], Partial: [247, 144, 9] };
    const c = sc[po.status] || [108, 171, 238];
    doc.setFillColor(c[0], c[1], c[2]);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(po.status?.toUpperCase() || 'DRAFT', 172, 53, { align: 'center' });

    autoTable(doc, {
      startY: 68,
      head: [['#', 'Product', 'Qty', 'Unit Cost (Rs.)', 'Tax %', 'Total (Rs.)']],
      body: lineItems.map((l, i) => [i + 1, l.product_name, l.qty, fmtN(l.unit_cost), (l.tax_rate || 0) + '%', fmtN(l.line_total)]),
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 12, right: 12 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    const lSub = lineItems.reduce((s, l) => s + (l.line_total || 0), 0);
    const lTax = lineItems.reduce((s, l) => s + (l.line_total || 0) * ((l.tax_rate || 0) / 100), 0);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Subtotal:', 140, finalY + 4); doc.text('Rs. ' + fmtN(lSub), 198, finalY + 4, { align: 'right' });
    doc.text('Tax:', 140, finalY + 10); doc.text('Rs. ' + fmtN(lTax), 198, finalY + 10, { align: 'right' });
    doc.setFillColor(79, 53, 200);
    doc.rect(120, finalY + 14, 78, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', 125, finalY + 22);
    doc.text('Rs. ' + fmtN(lSub + lTax), 196, finalY + 22, { align: 'right' });

    if (po.notes) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Notes: ' + po.notes, 12, finalY + 34);
    }

    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252);
    doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('Generated by LedgerX', 105, pageH - 6, { align: 'center' });
    doc.save(po.po_number + '.pdf');
  }

  function statusBadge(status: string) {
    return <span className={`badge ${STATUS_BADGE[status] || 'badge-blue'}`}>{status}</span>;
  }

  function flowBar(poNumber: string, grn: any | null) {
    const grnDone = grn?.status === 'Received' || grn?.status === 'Partial';
    const chip = (label: string, tone: 'done' | 'active' | 'pending') => (
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' as const, background: tone === 'done' ? 'var(--green-bg)' : tone === 'active' ? '#ede9ff' : 'var(--bg3)', color: tone === 'done' ? '#12b76a' : tone === 'active' ? 'var(--brand)' : 'var(--text3)', border: `1px solid ${tone === 'done' ? 'var(--green)' : tone === 'active' ? 'var(--brand)' : 'var(--border)'}` }}>{label}</span>
    );
    const arrow = <span style={{ color: 'var(--text3)' }}>→</span>;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const, padding: '14px 18px', background: 'var(--bg3)', borderRadius: '10px', marginBottom: '20px' }}>
        {chip(`PO (${poNumber})`, 'active')}
        {arrow}
        {chip(grn ? `GRN (${grn.grn_number})` : 'GRN — pending', grnDone ? 'done' : 'pending')}
        {arrow}
        {chip('Vendor Bill — pending', 'pending')}
      </div>
    );
  }

  const tabFiltered = pos.filter(p => {
    if (activeTab === 'rfq') return p.status === 'Draft' || p.status === 'Sent';
    if (activeTab === 'confirmed') return p.status === 'Confirmed' || p.status === 'Partial';
    if (activeTab === 'received') return p.status === 'Received';
    return true;
  });

  const filtered = tabFiltered.filter(p => {
    const matchSearch = (p.po_number || '').toLowerCase().includes(search.toLowerCase()) || (p.supplier_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const rfqCount = pos.filter(p => p.status === 'Draft' || p.status === 'Sent').length;
  const confirmedCount = pos.filter(p => p.status === 'Confirmed' || p.status === 'Partial').length;
  const receivedCount = pos.filter(p => p.status === 'Received').length;

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    background: active ? 'var(--brand)' : 'var(--bg2)',
    color: active ? '#fff' : 'var(--text2)',
    border: active ? 'none' : '1px solid var(--border)',
    transition: 'all 0.15s',
  });

  const canEdit    = (po: any) => po.status === 'Draft';
  const canDelete  = (po: any) => po.status === 'Draft';
  const canSend    = (po: any) => po.status === 'Draft';
  const canConfirm = (po: any) => po.status === 'Draft' || po.status === 'Sent';
  const canReceive = (po: any) => po.status === 'Confirmed' || po.status === 'Partial';
  const canBill    = (po: any) => ['Confirmed', 'Partial', 'Received'].includes(po.status);
  const canCancel  = (po: any) => ['Draft', 'Sent', 'Confirmed'].includes(po.status);
  const canReturnToDraft = (po: any) => po.status === 'Sent' || po.status === 'Confirmed';

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const po = selected;
    return (
      <div>
        <BackBtn label="Back to Purchase Orders" onClick={() => { setView('list'); setSelected(null); setShowForm(false); }} />

        <div className="card" style={{ marginBottom: 16, padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', marginBottom: 8 }}>{po.po_number}</div>
              <div style={{ marginBottom: 10 }}>{statusBadge(po.status)}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{po.supplier_name} · {po.date}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => exportPDF(po, selectedLines)}>PDF</button>
              {canEdit(po) && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(po)}>Edit</button>}
              {canSend(po) && <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(po, 'Sent')}>Send RFQ</button>}
              {canConfirm(po) && <button className="btn btn-primary btn-sm" onClick={() => updateStatus(po, 'Confirmed')}>Confirm PO</button>}
              {canReturnToDraft(po) && <button className="btn btn-secondary btn-sm" onClick={() => showConfirm(`Return ${po.po_number} to Draft?`, () => updateStatus(po, 'Draft'))}>Return to Draft</button>}
              {canReceive(po) && <button className="btn btn-primary btn-sm" onClick={() => receiveProducts(po)}>Receive Products</button>}
              {canBill(po) && <button className="btn btn-secondary btn-sm" onClick={() => createBill(po)}>Create Bill</button>}
              {canDelete(po) && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(po)}>Delete</button>}
              {canCancel(po) && <button className="btn btn-danger btn-sm" onClick={() => showConfirm(`Cancel ${po.po_number}?`, () => updateStatus(po, 'Cancelled'))}>Cancel</button>}
            </div>
          </div>
        </div>

        <StatusBar steps={['Draft', 'Sent', 'Confirmed', 'Partial', 'Received']} current={po.status} />
        {flowBar(po.po_number, linkedGrns[0] || null)}

        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-color': '#7c3aed' } as any}>
            <div className="kpi-label">Subtotal</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(po.subtotal)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#d97706' } as any}>
            <div className="kpi-label">Tax</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(po.tax_amount)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#16a34a' } as any}>
            <div className="kpi-label">Total</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmt(po.total)}</div>
          </div>
          <div className="kpi-card" style={{ '--kpi-color': '#2e90fa' } as any}>
            <div className="kpi-label">Expected Date</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{po.expected_date || '—'}</div>
          </div>
        </div>

        {linkedGrns.length > 0 && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--green-bg)', borderRadius: 8, border: '1px solid var(--green)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#12b76a', marginBottom: 8 }}>LINKED GOODS RECEIVED NOTES</div>
            {linkedGrns.map(g => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{g.grn_number}</span>
                <span style={{ color: 'var(--text2)' }}>{g.date}</span>
                <span className={`badge ${STATUS_BADGE[g.status]}`}>{g.status}</span>
              </div>
            ))}
          </div>
        )}

        <div className="table-wrap">
          <div className="table-toolbar"><h3>Line Items</h3></div>
          <table>
            <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Tax %</th><th>Total</th></tr></thead>
            <tbody>
              {selectedLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text2)', textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                  <td>{l.qty}</td>
                  <td>{fmt(l.unit_cost)}</td>
                  <td style={{ color: 'var(--text2)' }}>{l.tax_rate}%</td>
                  <td style={{ fontWeight: 600 }}>{fmt(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Subtotal: {fmt(po.subtotal)}</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Tax: {fmt(po.tax_amount)}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Total: {fmt(po.total)}</div>
          </div>
        </div>

        {po.notes && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
            <strong>Notes:</strong> {po.notes}
          </div>
        )}

        {dialog && (
          <div className="modal-overlay" onClick={() => setDialog(null)}>
            <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header"><div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div><button className="modal-close" onClick={() => setDialog(null)}>×</button></div>
              <div className="modal-body"><p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p></div>
              <div className="modal-footer">
                {dialog.onConfirm ? (
                  <><button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const fn = dialog.onConfirm; setDialog(null); fn?.(); }}>Confirm</button></>
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
          <div className="page-title">Purchase Orders</div>
          <div className="page-sub">RFQ → Confirm → Receive → Bill · {pos.length} total POs</div>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ New PO</button>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--kpi-color': '#2e90fa' } as any} onClick={() => setActiveTab('rfq')}>
          <div className="kpi-label">RFQ / Draft</div>
          <div className="kpi-value">{rfqCount}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#7a5af8' } as any} onClick={() => setActiveTab('confirmed')}>
          <div className="kpi-label">Confirmed</div>
          <div className="kpi-value">{confirmedCount}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#12b76a' } as any} onClick={() => setActiveTab('received')}>
          <div className="kpi-label">Received</div>
          <div className="kpi-value">{receivedCount}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#4f35c8' } as any} onClick={() => setActiveTab('all')}>
          <div className="kpi-label">Total Spend</div>
          <div className="kpi-value">{fmt(pos.filter(p => p.status !== 'Cancelled').reduce((s, p) => s + (p.total || 0), 0))}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button style={tabStyle(activeTab === 'all')} onClick={() => setActiveTab('all')}>All ({pos.length})</button>
        <button style={tabStyle(activeTab === 'rfq')} onClick={() => setActiveTab('rfq')}>RFQ ({rfqCount})</button>
        <button style={tabStyle(activeTab === 'confirmed')} onClick={() => setActiveTab('confirmed')}>Confirmed ({confirmedCount})</button>
        <button style={tabStyle(activeTab === 'received')} onClick={() => setActiveTab('received')}>Received ({receivedCount})</button>
      </div>

      {showForm && (
        <div className="inline-panel">
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">{editingPO ? `Edit ${editingPO.po_number}` : 'New Purchase Order'}</div>
              {!editingPO && <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Next number: {generatePoNumber()}</div>}
            </div>
            <button className="modal-close" onClick={() => { setShowForm(false); resetForm(); }}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Supplier *</label>
                <select value={form.supplier_id} onChange={e => { const s = suppliers.find(x => x.id === e.target.value); setForm({ ...form, supplier_id: e.target.value, supplier_name: s?.name || '' }); }}>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>PO Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Expected Arrival</label>
                <input type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Default Tax Rate (%)</label>
                <input type="number" min="0" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div className="form-group full">
                <label>Notes / Reference</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional supplier reference, delivery instructions..." />
              </div>
            </div>
            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead>
                  <tr><th style={{ width: '33%' }}>Product</th><th style={{ width: '11%' }}>Qty</th><th style={{ width: '18%' }}>Unit Cost</th><th style={{ width: '10%' }}>Tax %</th><th style={{ width: '18%' }}>Line Total</th><th style={{ width: '10%' }}></th></tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}>
                          <option value="">Select product...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" value={line.qty} onChange={e => updateLine(i, 'qty', clampNonNeg(e.target.value))} /></td>
                      <td><input type="number" min="0" value={line.unit_cost} onChange={e => updateLine(i, 'unit_cost', clampNonNeg(e.target.value))} /></td>
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
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editingPO ? 'Update PO' : 'Save Draft PO'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-toolbar">
          <h3>Purchase Orders</h3>
          <div className="table-actions">
            <div className="search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Search PO or supplier..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {activeTab === 'all' && (
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Sent">Sent (RFQ)</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Partial">Partial</option>
                <option value="Received">Received</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            )}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{activeTab === 'all' ? 'No purchase orders yet' : 'None in this category'}</h3>
            <p>{activeTab === 'all' ? 'Create your first PO to start the Procure-to-Pay cycle' : 'Switch to All to see all purchase orders'}</p>
            {activeTab === 'all' && <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => { resetForm(); setShowForm(true); }}>+ New Purchase Order</button>}
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Expected</th><th>Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(po => (
                <tr key={po.id} onClick={() => openDetail(po)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{po.po_number}</td>
                  <td style={{ color: 'var(--text2)' }}>{po.date}</td>
                  <td style={{ fontWeight: 500 }}>{po.supplier_name}</td>
                  <td style={{ color: 'var(--text2)' }}>{po.expected_date || '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(po.total)}</td>
                  <td>{statusBadge(po.status)}</td>
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
                <><button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const fn = dialog.onConfirm; setDialog(null); fn?.(); }}>Confirm</button></>
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

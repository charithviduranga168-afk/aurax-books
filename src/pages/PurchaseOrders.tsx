import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Page, NavFilter } from '../App';
import { StatusBar } from '../components/StatusBar';
import { SmartButton, SmartButtons } from '../components/SmartButton';
import {
  Package, List, FileText, CheckCircle, DollarSign,
  Download, Filter, LayoutList, LayoutGrid, BarChart2,
  ChevronLeft, ChevronRight, MoreVertical, X, Search,
  Building2, Calendar,
} from 'lucide-react';
import { Chatter, logChatter } from '../components/Chatter';

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
  navTo?: (p: Page, filter?: NavFilter) => void;
}

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-blue', Sent: 'badge-yellow', Confirmed: 'badge-purple',
  Partial: 'badge-yellow', Received: 'badge-green', Cancelled: 'badge-red',
};

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2'];
  const bg = colors[(name?.charCodeAt(0) || 0) % colors.length];
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>{initials}</div>;
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontWeight: 600, fontSize: 14, padding: '0 0 20px' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text2)')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

function statusBadge(status: string) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-blue'}`}>{status}</span>;
}

function exportExcel(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function PurchaseOrders({ onReceiveProducts, onCreateBill, nav, navTo }: Props) {
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'analytics'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [groupBy, setGroupBy] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const filtersRef = useRef<HTMLDivElement>(null);
  const groupByRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem('lx_purchaseorders_favorites') || '[]')); } catch { setFavorites([]); }
  }, []);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setShowFilters(false);
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) setShowGroupBy(false);
      if (favRef.current && !favRef.current.contains(e.target as Node)) setShowFavorites(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    void logChatter('purchase_order', po.id, `Status changed to ${newStatus}`);
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
    doc.text('Generated by NeoGrid', 105, pageH - 6, { align: 'center' });
    doc.save(po.po_number + '.pdf');
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

  const canEdit = (po: any) => po.status === 'Draft';
  const canDelete = (po: any) => po.status === 'Draft';
  const canSend = (po: any) => po.status === 'Draft';
  const canConfirm = (po: any) => po.status === 'Draft' || po.status === 'Sent';
  const canReceive = (po: any) => po.status === 'Confirmed' || po.status === 'Partial';
  const canBill = (po: any) => ['Confirmed', 'Partial', 'Received'].includes(po.status);
  const canCancel = (po: any) => ['Draft', 'Sent', 'Confirmed'].includes(po.status);
  const canReturnToDraft = (po: any) => po.status === 'Sent' || po.status === 'Confirmed';

  const filtered = pos.filter(p => {
    const matchSearch = (p.po_number || '').toLowerCase().includes(search.toLowerCase()) || (p.supplier_name || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = !activeFilter || p.status === activeFilter;
    return matchSearch && matchFilter;
  });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const rfqCount = pos.filter(p => p.status === 'Draft' || p.status === 'Sent').length;
  const confirmedCount = pos.filter(p => p.status === 'Confirmed' || p.status === 'Partial').length;
  const receivedCount = pos.filter(p => p.status === 'Received').length;
  const totalSpend = pos.filter(p => p.status !== 'Cancelled').reduce((s, p) => s + (p.total || 0), 0);

  useEffect(() => {
    if (!selectAllRef.current) return;
    const pageIds = paged.map(p => p.id);
    const allSel = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    const someSel = pageIds.some(id => selectedIds.has(id));
    selectAllRef.current.checked = allSel;
    selectAllRef.current.indeterminate = someSel && !allSel;
  }, [selectedIds, paged]);

  function toggleSelectAll() {
    const pageIds = paged.map(p => p.id);
    const allSel = pageIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSel) pageIds.forEach(id => next.delete(id)); else pageIds.forEach(id => next.add(id));
    setSelectedIds(next);
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  function doExport() {
    const rows = selectedIds.size > 0 ? pos.filter(p => selectedIds.has(p.id)) : filtered;
    exportExcel(rows.map(p => ({ 'PO #': p.po_number, Date: p.date, Supplier: p.supplier_name, Expected: p.expected_date || '', Total: p.total, Status: p.status })), 'purchase_orders');
  }

  function saveFavorite(name: string) {
    const next = [...favorites, name];
    setFavorites(next);
    localStorage.setItem('lx_purchaseorders_favorites', JSON.stringify(next));
  }
  function removeFavorite(name: string) {
    const next = favorites.filter(f => f !== name);
    setFavorites(next);
    localStorage.setItem('lx_purchaseorders_favorites', JSON.stringify(next));
  }

  const kpiCards = [
    { label: 'RFQ / Draft', value: rfqCount, sub: 'pending confirmation', color: '#2563eb', Icon: FileText, filter: 'Draft' },
    { label: 'Confirmed', value: confirmedCount, sub: 'awaiting receipt', color: '#7c3aed', Icon: CheckCircle, filter: 'Confirmed' },
    { label: 'Received', value: receivedCount, sub: 'goods received', color: '#059669', Icon: Package, filter: 'Received' },
    { label: 'Total Spend', value: fmt(totalSpend), sub: 'non-cancelled', color: '#4338ca', Icon: DollarSign, filter: '' },
  ];

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const po = selected;
    return (
      <div>
        <BackBtn label="Back to Purchase Orders" onClick={() => { setView('list'); setSelected(null); setShowForm(false); }} />

        <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.4px', marginBottom: 8 }}>{po.po_number}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {statusBadge(po.status)}
                {po.supplier_name && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', background: 'var(--bg)', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)' }}><Building2 size={13} />{po.supplier_name}</span>}
                {po.date && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', background: 'var(--bg)', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)' }}><Calendar size={13} />{fmtDate(po.date)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
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
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Subtotal</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{fmt(po.subtotal)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{fmt(po.total)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SmartButtons>
          <SmartButton icon={<Package size={18} />} value={linkedGrns.length} label="Receipts (GRN)"
            onClick={navTo && po ? () => navTo('grn', { field: 'purchase_order_id', value: po.id, label: po.po_number }) : undefined} />
          <SmartButton icon={<List size={18} />} value={selectedLines.length} label="Line Items" />
        </SmartButtons>

        <StatusBar steps={['Draft', 'Sent', 'Confirmed', 'Partial', 'Received']} current={po.status} />
        {flowBar(po.po_number, linkedGrns[0] || null)}

        <div className="card" style={{ marginBottom: 16, padding: '20px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>FINANCIAL OVERVIEW</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { label: 'Subtotal', value: fmt(po.subtotal), color: '#7c3aed' },
              { label: 'Tax', value: fmt(po.tax_amount), color: '#d97706' },
              { label: 'Total', value: fmt(po.total), color: '#059669' },
              { label: 'Expected Date', value: po.expected_date ? fmtDate(po.expected_date) : '—', color: '#2563eb' },
            ].map((k, i) => (
              <div key={k.label} style={{ paddingTop: 20, paddingBottom: 4, paddingLeft: i === 0 ? 0 : 28, paddingRight: 28, borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
              </div>
            ))}
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

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Line Items</div>
          <table>
            <thead><tr><th><input type="checkbox" /></th><th>#</th><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Tax %</th><th>Total</th></tr></thead>
            <tbody>
              {selectedLines.map((l, i) => (
                <tr key={i}>
                  <td><input type="checkbox" /></td>
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
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text3)' }}>
            <span>{selectedLines.length} items</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronLeft size={14} /></button>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronRight size={14} /></button>
            </div>
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

        <Chatter recordType="purchase_order" recordId={selected.id} />
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ fontSize: 26, fontWeight: 800 }}>Purchase Orders</div>
          <div className="page-sub">RFQ → Confirm → Receive → Bill · {pos.length} total POs</div>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>New</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {kpiCards.map(k => (
          <div key={k.label} className="card" style={{ padding: '20px 24px', cursor: 'pointer', background: activeFilter === k.filter && k.filter ? 'var(--brand-light)' : '' }} onClick={() => setActiveFilter(activeFilter === k.filter ? '' : k.filter)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color, letterSpacing: '-1px', marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{k.sub}</div>
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <k.Icon size={22} color="var(--brand)" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {activeFilter}
            <button onClick={() => setActiveFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, display: 'flex' }}><X size={12} /></button>
          </span>
          <button onClick={() => setActiveFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12 }}>Clear all</button>
        </div>
      )}

      {showForm && (
        <div className="inline-panel" style={{ marginBottom: 20 }}>
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

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }}>New</button>
            <button onClick={doExport} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', position: 'relative' }}>
              <Download size={15} />
              <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--brand)', color: '#fff', borderRadius: 10, fontSize: 9, padding: '1px 4px', fontWeight: 700 }}>
                {selectedIds.size > 0 ? selectedIds.size : filtered.length}
              </span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, color: 'var(--text3)' }} />
              <input placeholder="Search PO or supplier..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 30, height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', width: 200 }} />
            </div>

            <div style={{ position: 'relative' }} ref={filtersRef}>
              <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <Filter size={13} />Filters{activeFilter && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '0 5px', marginLeft: 2 }}>1</span>}
              </button>
              {showFilters && (
                <div style={{ position: 'absolute', top: 36, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, padding: 12, minWidth: 160 }}>
                  {['', 'Draft', 'Sent', 'Confirmed', 'Received', 'Cancelled'].map(f => (
                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}>
                      <input type="radio" checked={activeFilter === f} onChange={() => { setActiveFilter(f); setPage(1); setShowFilters(false); }} />
                      {f || 'All'}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }} ref={groupByRef}>
              <button onClick={() => setShowGroupBy(!showGroupBy)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                Group By{groupBy && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '0 5px', marginLeft: 2 }}>1</span>}
              </button>
              {showGroupBy && (
                <div style={{ position: 'absolute', top: 36, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, padding: 12, minWidth: 160 }}>
                  {[{ label: 'None', value: '' }, { label: 'Supplier', value: 'supplier' }, { label: 'Status', value: 'status' }].map(g => (
                    <label key={g.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}>
                      <input type="radio" checked={groupBy === g.value} onChange={() => { setGroupBy(g.value); setShowGroupBy(false); }} />
                      {g.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }} ref={favRef}>
              <button onClick={() => setShowFavorites(!showFavorites)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                Favorites
              </button>
              {showFavorites && (
                <div style={{ position: 'absolute', top: 36, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, padding: 12, minWidth: 200 }}>
                  {favorites.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 8px' }}>No saved favorites</div>}
                  {favorites.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', fontSize: 13 }}>
                      <span style={{ cursor: 'pointer', color: 'var(--brand)' }} onClick={() => { setSearch(f); setShowFavorites(false); }}>{f}</span>
                      <button onClick={() => removeFavorite(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={12} /></button>
                    </div>
                  ))}
                  {search && <button onClick={() => saveFavorite(search)} style={{ width: '100%', marginTop: 8, padding: '6px 8px', background: 'var(--brand-light)', color: 'var(--brand)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Save "{search}"</button>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              <span>{filtered.length === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filtered.length)}`} / {filtered.length}</span>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} /></button>
            </div>

            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {([{ mode: 'list', Icon: LayoutList }, { mode: 'kanban', Icon: LayoutGrid }, { mode: 'analytics', Icon: BarChart2 }] as const).map(({ mode, Icon }) => (
                <button key={mode} onClick={() => setViewMode(mode as 'list' | 'kanban' | 'analytics')} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: viewMode === mode ? 'var(--brand-light)' : '#fff', cursor: 'pointer', color: viewMode === mode ? 'var(--brand)' : 'var(--text3)' }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No purchase orders yet</h3>
            <p>Create your first PO to start the Procure-to-Pay cycle</p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => { resetForm(); setShowForm(true); }}>+ New Purchase Order</button>
          </div>
        ) : viewMode === 'analytics' ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase' }}>Spend by Supplier</div>
            {(() => {
              const bySupplier: Record<string, number> = {};
              filtered.forEach(p => { if (p.status !== 'Cancelled') bySupplier[p.supplier_name] = (bySupplier[p.supplier_name] || 0) + (p.total || 0); });
              const max = Math.max(...Object.values(bySupplier), 1);
              return Object.entries(bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, val]) => (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <span style={{ color: '#7c3aed', fontWeight: 700 }}>{fmt(val)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#7c3aed', borderRadius: 4, width: `${Math.min(100, (val / max) * 100)}%` }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : viewMode === 'kanban' ? (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {paged.map(po => (
              <div key={po.id} className="card" style={{ padding: '16px 20px', cursor: 'pointer', border: selectedIds.has(po.id) ? '2px solid var(--brand)' : '1px solid var(--border)' }} onClick={() => openDetail(po)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <Avatar name={po.supplier_name || 'PO'} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{po.po_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{po.supplier_name}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{statusBadge(po.status)}</span>
                  <span style={{ fontWeight: 700, color: '#7c3aed' }}>{fmt(po.total)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" ref={selectAllRef} onChange={toggleSelectAll} /></th>
                <th>PO #</th><th>Date</th><th>Supplier</th><th>Expected</th><th>Total</th><th>Status</th><th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {groupBy ? (() => {
                const groups: Record<string, any[]> = {};
                paged.forEach(p => {
                  const k = groupBy === 'supplier' ? (p.supplier_name || 'Unknown') : groupBy === 'status' ? p.status : '';
                  if (!groups[k]) groups[k] = [];
                  groups[k].push(p);
                });
                return Object.entries(groups).flatMap(([group, rows]) => [
                  <tr key={`g-${group}`} style={{ background: 'var(--bg)', cursor: 'default' }}>
                    <td colSpan={8} style={{ fontWeight: 700, fontSize: 12, color: 'var(--text3)', padding: '8px 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group} ({rows.length})</td>
                  </tr>,
                  ...rows.map(po => <PORow key={po.id} po={po} selectedIds={selectedIds} toggleSelect={toggleSelect} openDetail={openDetail} openEdit={openEdit} handleDelete={handleDelete} fmt={fmt} fmtDate={fmtDate} />),
                ]);
              })() : paged.map(po => <PORow key={po.id} po={po} selectedIds={selectedIds} toggleSelect={toggleSelect} openDetail={openDetail} openEdit={openEdit} handleDelete={handleDelete} fmt={fmt} fmtDate={fmtDate} />)}
            </tbody>
          </table>
        )}

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text3)' }}>
          <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : `Showing ${filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}><ChevronRight size={14} /></button>
          </div>
        </div>
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

function PORow({ po, selectedIds, toggleSelect, openDetail, openEdit, handleDelete, fmt, fmtDate }: {
  po: any; selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openDetail: (po: any) => void;
  openEdit: (po: any) => void;
  handleDelete: (po: any) => void;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const STATUS_BADGE2: Record<string, string> = { Draft: 'badge-blue', Sent: 'badge-yellow', Confirmed: 'badge-purple', Partial: 'badge-yellow', Received: 'badge-green', Cancelled: 'badge-red' };
  return (
    <tr onClick={() => openDetail(po)} style={{ cursor: 'pointer', background: selectedIds.has(po.id) ? 'var(--brand-light)' : '' }}>
      <td onClick={e => { e.stopPropagation(); toggleSelect(po.id); }}><input type="checkbox" checked={selectedIds.has(po.id)} onChange={() => toggleSelect(po.id)} /></td>
      <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{po.po_number}</td>
      <td style={{ color: 'var(--text2)' }}>{fmtDate(po.date)}</td>
      <td style={{ fontWeight: 500 }}>{po.supplier_name}</td>
      <td style={{ color: 'var(--text2)' }}>{po.expected_date ? fmtDate(po.expected_date) : '—'}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(po.total)}</td>
      <td><span className={`badge ${STATUS_BADGE2[po.status] || 'badge-blue'}`}>{po.status}</span></td>
      <td onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <MoreVertical size={15} color="var(--text3)" />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120 }}>
              {po.status === 'Draft' && <button onClick={() => { openEdit(po); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>Edit</button>}
              {po.status === 'Draft' && <button onClick={() => { handleDelete(po); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}>Delete</button>}
              <button onClick={() => { openDetail(po); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>View</button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

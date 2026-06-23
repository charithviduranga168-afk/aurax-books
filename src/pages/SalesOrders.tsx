import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Page } from '../App';
import { StatusBar } from '../components/StatusBar';
import { SmartButton, SmartButtons } from '../components/SmartButton';
import { Chatter, logChatter } from '../components/Chatter';
import {
  FileText, List, CheckCircle, Receipt, DollarSign,
  Download, Filter, LayoutGrid, LayoutList, BarChart2,
  Star, Check, X, ChevronLeft, ChevronRight, MoreVertical,
  Pencil, Trash2,
} from 'lucide-react';

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

const STATUS_STEPS = ['Draft', 'Confirmed', 'Invoiced'];

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

function initials(name: string) {
  return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const color = colors[(name || 'U').charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, letterSpacing: '-0.5px',
    }}>
      {initials(name)}
    </div>
  );
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--text2)', fontSize: 13, fontWeight: 600,
      padding: '0 0 20px 0', transition: 'color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text2)')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
      </svg>
      {label}
    </button>
  );
}

function statusBadge(s: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    draft:     { bg: '#f3f4f6', text: '#6b7280' },
    confirmed: { bg: '#ede9fe', text: '#7c3aed' },
    invoiced:  { bg: '#dcfce7', text: '#16a34a' },
    cancelled: { bg: '#fee2e2', text: '#dc2626' },
  };
  const c = colors[(s || '').toLowerCase()] || { bg: '#f3f4f6', text: '#6b7280' };
  return <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: c.bg, color: c.text }}>{s}</span>;
}

interface SoFavorite { name: string; statusFilter: string; groupByVal: string; }

function loadSoFavorites(): SoFavorite[] {
  try { return JSON.parse(localStorage.getItem('so_favorites') || '[]'); } catch { return []; }
}
function saveSoFavorites(favs: SoFavorite[]) {
  localStorage.setItem('so_favorites', JSON.stringify(favs));
}

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
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('');

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
  const [detailSearch, setDetailSearch] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'analytics'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'customer'>('none');
  const [favorites, setFavorites] = useState<SoFavorite[]>(loadSoFavorites());
  const [favName, setFavName] = useState('');
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const groupByRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) setShowGroupBy(false);
      if (favRef.current && !favRef.current.contains(e.target as Node)) setShowFavorites(false);
      if (showActionMenu) setShowActionMenu(null);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showActionMenu]);

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
    setDetailSearch('');
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
    void logChatter('sales_order', so.id, `Status changed to ${newStatus}`);
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
    const pdfC = sc[so.status] || [108, 171, 238];
    doc.setFillColor(pdfC[0], pdfC[1], pdfC[2]); doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
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
    doc.text('Generated by NeoGrid', 105, pageH - 6, { align: 'center' });
    doc.save(so.so_number + '.pdf');
  }

  const canEdit = (so: any) => so.status === 'Draft';
  const canDelete = (so: any) => so.status === 'Draft';
  const canConfirm = (so: any) => so.status === 'Draft';
  const canInvoice = (so: any) => so.status === 'Confirmed';
  const canCancel = (so: any) => ['Draft', 'Confirmed'].includes(so.status);
  const canReturnToDraft = (so: any) => so.status === 'Confirmed' && !so.invoice_id;

  const filtered = sos.filter(s => {
    const matchStatus = !activeStatusFilter || s.status === activeStatusFilter;
    const matchSearch =
      (s.so_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.customer_name || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const quotationCount = sos.filter(s => s.status === 'Draft').length;
  const confirmedCount = sos.filter(s => s.status === 'Confirmed').length;
  const invoicedCount = sos.filter(s => s.status === 'Invoiced').length;
  const totalRevenue = sos.filter(s => s.status !== 'Cancelled').reduce((sum, s) => sum + (s.total || 0), 0);

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someSelected = filtered.some(r => selectedIds.has(r.id)) && !allSelected;
  function toggleSelectAll() {
    if (allSelected || someSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(r => r.id)));
  }
  function toggleSelect(id: string) {
    const n = new Set(selectedIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedIds(n);
  }

  function exportExcel() {
    const toExport = selectedIds.size > 0 ? sos.filter(r => selectedIds.has(r.id)) : filtered;
    const data = toExport.map(r => ({
      'SO #': r.so_number, 'Date': r.date, 'Customer': r.customer_name,
      'Expiry': r.expiry_date || '', 'Subtotal': r.subtotal || 0,
      'Tax': r.tax_amount || 0, 'Total': r.total || 0, 'Status': r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SalesOrders');
    XLSX.writeFile(wb, `sales_orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const groups: { key: string; items: any[] }[] = [];
  if (groupBy === 'none') {
    groups.push({ key: '', items: filtered });
  } else {
    const map = new Map<string, any[]>();
    filtered.forEach(s => {
      const k = groupBy === 'status' ? (s.status || 'Unknown') : (s.customer_name || 'Unknown');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    });
    map.forEach((items, key) => groups.push({ key, items }));
    groups.sort((a, b) => a.key.localeCompare(b.key));
  }

  function saveFav() {
    if (!favName.trim()) return;
    const newFavs = [...favorites, { name: favName.trim(), statusFilter: activeStatusFilter, groupByVal: groupBy }];
    setFavorites(newFavs); saveSoFavorites(newFavs); setFavName('');
  }
  function loadFav(fav: SoFavorite) {
    setActiveStatusFilter(fav.statusFilter);
    setGroupBy(fav.groupByVal as any);
    setShowFavorites(false);
  }
  function deleteFav(idx: number) {
    const newFavs = favorites.filter((_, i) => i !== idx);
    setFavorites(newFavs); saveSoFavorites(newFavs);
  }

  const activeFilterCount = activeStatusFilter ? 1 : 0;
  const maxTotal = Math.max(...sos.map(s => s.total || 0), 1);

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const lineSub = selectedLines.reduce((s, l) => s + (l.line_total || 0), 0);
    const lineTax = selectedLines.reduce((s, l) => s + (l.line_total || 0) * ((l.tax_rate || 0) / 100), 0);
    const discountTotal = selectedLines.reduce((s, l) => s + ((l.qty * l.unit_price * ((l.discount_pct || 0) / 100)) || 0), 0);
    const filteredDetailLines = detailSearch
      ? selectedLines.filter(l => (l.product_name || '').toLowerCase().includes(detailSearch.toLowerCase()))
      : selectedLines;

    return (
      <div>
        <BackBtn label="Back to Sales Orders" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero */}
        <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 6 }}>{selected.so_number}</div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {statusBadge(selected.status)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <FileText size={13} color="var(--text3)" />{selected.customer_name}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  {fmtDate(selected.date)}
                </span>
                {selected.expiry_date && (
                  <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    Valid Until: {fmtDate(selected.expiry_date)}
                  </span>
                )}
              </div>
              {linkedInvoice && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#dcfce7', borderRadius: 8, border: '1px solid #16a34a40', display: 'inline-flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>Linked Invoice:</span>
                  <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{linkedInvoice.invoice_number}</span>
                  {statusBadge(linkedInvoice.status)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 40, flexShrink: 0, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Subtotal</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{fmt(selected.subtotal)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{fmt(selected.total)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[
                { label: 'PDF', show: true, onClick: () => exportPDF(selected, selectedLines), danger: false, primary: false },
                { label: 'Confirm', show: canConfirm(selected), onClick: () => updateStatus(selected, 'Confirmed'), danger: false, primary: false },
                { label: 'Create Invoice', show: canInvoice(selected), onClick: () => createInvoice(selected), danger: false, primary: true },
                { label: 'Edit', show: canEdit(selected), onClick: () => openEdit(selected), danger: false, primary: false },
                { label: 'Return to Draft', show: canReturnToDraft(selected), onClick: () => showConfirm(`Return ${selected.so_number} to Draft?`, () => updateStatus(selected, 'Draft')), danger: false, primary: false },
                { label: 'Cancel', show: canCancel(selected), onClick: () => showConfirm(`Cancel ${selected.so_number}?`, () => updateStatus(selected, 'Cancelled')), danger: true, primary: false },
              ].filter(b => b.show).map(btn => (
                <button key={btn.label} onClick={btn.onClick} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  border: btn.primary ? 'none' : btn.danger ? '1px solid #fecaca' : '1px solid var(--border)',
                  background: btn.primary ? 'var(--brand)' : '#fff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: btn.primary ? '#fff' : btn.danger ? '#dc2626' : 'var(--text1)',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = btn.primary ? '#6d28d9' : btn.danger ? '#fee2e2' : 'var(--bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = btn.primary ? 'var(--brand)' : '#fff'; }}
                >{btn.label}</button>
              ))}
            </div>
          </div>
        </div>

        <SmartButtons>
          <SmartButton icon={<FileText size={18} />} value={linkedInvoice ? 1 : 0} label="Invoice" />
          <SmartButton icon={<List size={18} />} value={selectedLines.length} label="Line Items" />
        </SmartButtons>

        <StatusBar steps={STATUS_STEPS} current={selected.status} />

        {/* Financial Overview */}
        <div className="card" style={{ marginBottom: 20, padding: '20px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Financial Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0 }}>
            {[
              { label: 'Subtotal', value: fmt(lineSub), color: 'var(--brand)' },
              { label: 'Tax', value: fmt(lineTax), color: '#d97706' },
              { label: 'Discount', value: fmt(discountTotal), color: '#6b7280' },
              { label: 'Total', value: fmt(lineSub + lineTax), color: '#16a34a' },
            ].map((k, i) => (
              <div key={k.label} style={{ paddingRight: i < 3 ? 28 : 0, borderRight: i < 3 ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 28 : 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.color, letterSpacing: '-0.4px' }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
            <div style={{ display: 'flex', flex: 1 }}>
              {[
                { key: 'lines' as const, label: `Line Items (${selectedLines.length})` },
                { key: 'details' as const, label: 'Details' },
              ].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} style={{
                  padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, color: detailTab === t.key ? 'var(--brand)' : 'var(--text2)',
                  borderBottom: detailTab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
                  transition: 'all 0.15s', marginBottom: -1,
                }}>{t.label}</button>
              ))}
            </div>
            {detailTab === 'lines' && (
              <div style={{ position: 'relative' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input value={detailSearch} onChange={e => setDetailSearch(e.target.value)} placeholder="Search lines..."
                  style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 180 }} />
              </div>
            )}
          </div>
          {detailTab === 'lines' ? (
            filteredDetailLines.length === 0 ? (
              <div className="empty-state"><h3>No line items</h3></div>
            ) : (
              <>
                <table>
                  <thead><tr><th style={{ width: 40 }}><input type="checkbox" /></th><th>#</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Disc%</th><th>Tax%</th><th>Total</th></tr></thead>
                  <tbody>
                    {filteredDetailLines.map((l, i) => (
                      <tr key={i}>
                        <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Showing {filteredDetailLines.length} of {selectedLines.length}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Subtotal: {fmt(lineSub)}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Tax: {fmt(lineTax)}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>Total: {fmt(lineSub + lineTax)}</div>
                  </div>
                </div>
              </>
            )
          ) : (
            <div style={{ padding: 20 }}>
              {selected.notes
                ? <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}><strong>Notes:</strong> {selected.notes}</div>
                : <p style={{ color: 'var(--text3)' }}>No additional details.</p>}
              {selected.expiry_date && (
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, fontSize: 13 }}>
                  <strong>Valid Until:</strong> {fmtDate(selected.expiry_date)}
                </div>
              )}
            </div>
          )}
        </div>

        <Chatter recordType="sales_order" recordId={selected.id} />

        {dialog && (
          <div className="modal-overlay" onClick={() => setDialog(null)}>
            <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header"><div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div><button className="modal-close" onClick={() => setDialog(null)}>×</button></div>
              <div className="modal-body"><p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p></div>
              <div className="modal-footer">
                {dialog.onConfirm ? (<><button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const fn = dialog.onConfirm; setDialog(null); fn?.(); }}>Confirm</button></>) : (<button className="btn btn-primary" onClick={() => setDialog(null)}>OK</button>)}
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 4 }}>Sales Orders</div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>Manage your quotations, orders, and the sales pipeline.</div>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>{showForm ? 'Close' : '+ New'}</button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { icon: <FileText size={22} color="var(--brand)" />, label: 'Quotations', value: String(quotationCount), sub: 'Awaiting confirmation', filterVal: 'Draft' },
          { icon: <CheckCircle size={22} color="#7c3aed" />, label: 'Confirmed', value: String(confirmedCount), sub: 'Ready to invoice', filterVal: 'Confirmed' },
          { icon: <Receipt size={22} color="#16a34a" />, label: 'Invoiced', value: String(invoicedCount), sub: 'Completed orders', filterVal: 'Invoiced' },
          { icon: <DollarSign size={22} color="#0ea5e9" />, label: 'Total Revenue', value: fmt(totalRevenue), sub: 'Excluding cancelled', filterVal: '' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: k.filterVal ? 'pointer' : 'default', border: activeStatusFilter === k.filterVal && k.filterVal ? '2px solid var(--brand)' : undefined }}
            onClick={() => k.filterVal ? setActiveStatusFilter(activeStatusFilter === k.filterVal ? '' : k.filterVal) : undefined}
          >
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: k.filterVal ? 28 : 16, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="inline-panel" style={{ marginBottom: 20 }}>
          <div className="inline-panel-header">
            <div>
              <div className="inline-panel-title">{editingSO ? `Edit ${editingSO.so_number}` : 'New Quotation / Sales Order'}</div>
              {!editingSO && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Next number: {generateSoNumber()}</div>}
            </div>
            <button className="modal-close" onClick={() => { setShowForm(false); resetForm(); }}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: 20 }}>
              <div className="form-group">
                <label>Customer *</label>
                <select value={form.customer_id} onChange={e => { const c = customers.find(x => x.id === e.target.value); setForm({ ...form, customer_id: e.target.value, customer_name: c?.name || '' }); }}>
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Order Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Valid Until / Expiry</label><input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} /></div>
              <div className="form-group"><label>Default Tax Rate (%)</label><input type="number" min="0" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></div>
              <div className="form-group full"><label>Notes / Terms</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Delivery terms, payment terms, special instructions..." /></div>
            </div>
            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead><tr><th style={{ width: '28%' }}>Product</th><th style={{ width: '10%' }}>Qty</th><th style={{ width: '16%' }}>Unit Price</th><th style={{ width: '10%' }}>Disc%</th><th style={{ width: '10%' }}>Tax%</th><th style={{ width: '16%' }}>Line Total</th><th style={{ width: '10%' }}></th></tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td><select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}><option value="">Select product...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_qty})</option>)}</select></td>
                      <td><input type="number" min="0" value={line.qty} onChange={e => updateLine(i, 'qty', clampNonNeg(e.target.value))} /></td>
                      <td><input type="number" min="0" value={line.unit_price} onChange={e => updateLine(i, 'unit_price', clampNonNeg(e.target.value))} /></td>
                      <td><input type="number" min="0" max="100" value={line.discount_pct} onChange={e => updateLineDiscount(i, e.target.value)} /></td>
                      <td><input type="number" min="0" max="100" value={line.tax_rate} onChange={e => { const u = [...lines]; u[i] = { ...u[i], tax_rate: clampNonNeg(e.target.value) }; setLines(u); }} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)', paddingLeft: 8 }}>{fmt(line.line_total)}</td>
                      <td><button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => removeLine(i)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 10 }}>+ Add Line</button>
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

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {activeStatusFilter && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              Status: {activeStatusFilter}
              <button onClick={() => setActiveStatusFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--brand)' }}><X size={12} /></button>
            </span>
          )}
          <button onClick={() => setActiveStatusFilter('')} style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Clear all</button>
        </div>
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }} style={{ padding: '7px 16px' }}>New</button>
          <button onClick={exportExcel} title={selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export all to Excel'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', position: 'relative' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <Download size={14} color="var(--text2)" />
            {selectedIds.size > 0 && <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, background: 'var(--brand)', color: '#fff', borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selectedIds.size}</span>}
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Search SO or customer..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 200 }} />
          </div>
          {/* Filters */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button onClick={() => { setShowFilters(!showFilters); setShowGroupBy(false); setShowFavorites(false); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${showFilters || activeFilterCount > 0 ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8, background: showFilters || activeFilterCount > 0 ? 'var(--brand-light)' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: showFilters || activeFilterCount > 0 ? 'var(--brand)' : 'var(--text2)' }}>
              <Filter size={13} /> Filters {activeFilterCount > 0 && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{activeFilterCount}</span>}
            </button>
            {showFilters && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 220, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[{ key: '', label: 'All' }, { key: 'Draft', label: 'Draft' }, { key: 'Confirmed', label: 'Confirmed' }, { key: 'Invoiced', label: 'Invoiced' }, { key: 'Cancelled', label: 'Cancelled' }].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      <input type="radio" name="soStatus" checked={activeStatusFilter === opt.key} onChange={() => { setActiveStatusFilter(opt.key); setShowFilters(false); }} />{opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Group By */}
          <div style={{ position: 'relative' }} ref={groupByRef}>
            <button onClick={() => { setShowGroupBy(!showGroupBy); setShowFilters(false); setShowFavorites(false); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${groupBy !== 'none' ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8, background: groupBy !== 'none' ? 'var(--brand-light)' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: groupBy !== 'none' ? 'var(--brand)' : 'var(--text2)' }}>
              <LayoutGrid size={13} /> Group By {groupBy !== 'none' && <Check size={12} />}
            </button>
            {showGroupBy && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 200, padding: 8 }}>
                {[{ key: 'none', label: 'No Grouping' }, { key: 'status', label: 'By Status' }, { key: 'customer', label: 'By Customer' }].map(opt => (
                  <button key={opt.key} onClick={() => { setGroupBy(opt.key as any); setShowGroupBy(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', background: groupBy === opt.key ? 'var(--brand-light)' : 'none', color: groupBy === opt.key ? 'var(--brand)' : 'var(--text1)', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 8, textAlign: 'left' }}>
                    {opt.label}{groupBy === opt.key && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Favorites */}
          <div style={{ position: 'relative' }} ref={favRef}>
            <button onClick={() => { setShowFavorites(!showFavorites); setShowFilters(false); setShowGroupBy(false); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: `1px solid ${favorites.length > 0 ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: favorites.length > 0 ? 'var(--brand)' : 'var(--text2)' }}>
              <Star size={13} /> Favorites {favorites.length > 0 && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{favorites.length}</span>}
            </button>
            {showFavorites && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 260, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Save Current Filters</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={favName} onChange={e => setFavName(e.target.value)} placeholder="Favorite name..." style={{ flex: 1, fontSize: 13 }} onKeyDown={e => e.key === 'Enter' && saveFav()} />
                  <button onClick={saveFav} disabled={!favName.trim()} className="btn btn-primary btn-sm">Save</button>
                </div>
                {favorites.length > 0 ? (
                  <>{favorites.map((fav, i) => (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < favorites.length - 1 ? '1px solid var(--border)' : 'none' }}><button onClick={() => loadFav(fav)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text1)', textAlign: 'left', padding: '2px 0' }}><Star size={12} style={{ marginRight: 6 }} color="var(--brand)" />{fav.name}</button><button onClick={() => deleteFav(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={13} /></button></div>))}</>
                ) : <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>No saved favorites yet</div>}
              </div>
            )}
          </div>
          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ fontWeight: 500 }}>{filtered.length > 0 ? `1-${filtered.length} / ${filtered.length}` : '0 / 0'}</span>
            <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronLeft size={13} color="var(--text3)" /></button>
            <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronRight size={13} color="var(--text3)" /></button>
          </div>
          {/* View toggles */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {([{ mode: 'list' as const, icon: <LayoutList size={15} /> }, { mode: 'kanban' as const, icon: <LayoutGrid size={15} /> }, { mode: 'analytics' as const, icon: <BarChart2 size={15} /> }] as const).map((v, i) => (
              <button key={v.mode} onClick={() => setViewMode(v.mode)} style={{ padding: '7px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', background: viewMode === v.mode ? 'var(--brand-light)' : '#fff', color: viewMode === v.mode ? 'var(--brand)' : 'var(--text3)', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>{v.icon}</button>
            ))}
          </div>
        </div>

        {/* List view */}
        {viewMode === 'list' && (loading ? <div className="empty-state"><p>Loading...</p></div> : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>{search || activeStatusFilter ? 'No sales orders match' : 'No sales orders yet'}</h3>
            <p>{search || activeStatusFilter ? 'Try adjusting your search or filters' : 'Create your first quotation to start the sales cycle'}</p>
            {!search && !activeStatusFilter && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => { resetForm(); setShowForm(true); }}>+ New Quotation</button>}
          </div>
        ) : (
          <>
            <table>
              <thead><tr>
                <th style={{ width: 40 }}><input type="checkbox" ref={el => { if (el) el.indeterminate = someSelected; }} checked={allSelected} onChange={toggleSelectAll} /></th>
                <th>SO #</th><th>Date</th><th>Customer</th><th>Expiry</th><th>Total</th><th>Status</th><th style={{ width: 48 }}></th>
              </tr></thead>
              <tbody>
                {groups.map(group => (
                  <>
                    {groupBy !== 'none' && (
                      <tr key={`grp-${group.key}`} style={{ background: 'var(--bg)' }}>
                        <td colSpan={8} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {group.key} <span style={{ fontWeight: 400, textTransform: 'none' }}>({group.items.length})</span>
                        </td>
                      </tr>
                    )}
                    {group.items.map(so => (
                      <tr key={so.id} onClick={() => openDetail(so)} style={{ cursor: 'pointer', background: selectedIds.has(so.id) ? '#faf5ff' : undefined }}>
                        <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(so.id)} onChange={() => toggleSelect(so.id)} /></td>
                        <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{so.so_number}</td>
                        <td style={{ color: 'var(--text2)' }}>{fmtDate(so.date)}</td>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={so.customer_name || 'U'} size={28} />{so.customer_name}</div>
                        </td>
                        <td style={{ color: 'var(--text2)' }}>{so.expiry_date ? fmtDate(so.expiry_date) : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(so.total)}</td>
                        <td>{statusBadge(so.status)}</td>
                        <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                          <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowActionMenu(showActionMenu === so.id ? null : so.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            ><MoreVertical size={16} color="var(--text3)" /></button>
                            {showActionMenu === so.id && (
                              <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 99, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', minWidth: 140, padding: 4 }}>
                                {canEdit(so) && <button onClick={() => { setShowActionMenu(null); openEdit(so); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 7, color: 'var(--text1)', textAlign: 'left' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><Pencil size={13} /> Edit</button>}
                                {canDelete(so) && <button onClick={() => { setShowActionMenu(null); handleDelete(so); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 7, color: '#dc2626', textAlign: 'left' }} onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><Trash2 size={13} /> Delete</button>}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)' }}>
              <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length}-${filtered.length} / ${filtered.length}`}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronLeft size={14} color="var(--text3)" /></button>
                <button style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: '#fff', cursor: 'pointer', lineHeight: 0 }}><ChevronRight size={14} color="var(--text3)" /></button>
              </div>
            </div>
          </>
        ))}

        {/* Kanban view */}
        {viewMode === 'kanban' && (
          <div style={{ padding: 20 }}>
            {filtered.length === 0 ? <div className="empty-state"><h3>No sales orders match</h3></div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {filtered.map(so => (
                  <div key={so.id} onClick={() => openDetail(so)} style={{ border: `2px solid ${selectedIds.has(so.id) ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer', background: '#fff', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { if (!selectedIds.has(so.id)) e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)'; }}
                    onMouseLeave={e => { if (!selectedIds.has(so.id)) e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand)' }}>{so.so_number}</span>
                      {statusBadge(so.status)}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text1)', marginBottom: 4 }}>{so.customer_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>{fmtDate(so.date)}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text1)' }}>{fmt(so.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analytics view */}
        {viewMode === 'analytics' && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 16 }}>Revenue by Order</div>
            {filtered.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 14 }}>No data to display.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...filtered].sort((a, b) => (b.total || 0) - (a.total || 0)).map(so => (
                  <div key={so.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar name={so.customer_name || 'U'} size={30} />
                    <div style={{ width: 110, fontSize: 13, fontWeight: 600, color: 'var(--brand)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{so.so_number}</div>
                    <div style={{ width: 120, fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{so.customer_name}</div>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(((so.total || 0) / maxTotal) * 100, 0)}%`, background: 'linear-gradient(90deg, var(--brand), #a78bfa)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ width: 130, fontSize: 13, fontWeight: 700, color: 'var(--brand)', textAlign: 'right' }}>{fmt(so.total)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { label: 'Average Order', value: fmt(filtered.length ? filtered.reduce((s, so) => s + (so.total || 0), 0) / filtered.length : 0) },
                { label: 'Highest Order', value: fmt(Math.max(...filtered.map(so => so.total || 0), 0)) },
                { label: 'Total Orders', value: String(filtered.length) },
              ].map(k => (
                <div key={k.label} style={{ padding: '16px 20px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <div className="modal-overlay" onClick={() => setDialog(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">{dialog.onConfirm ? 'Confirm' : 'Notice'}</div><button className="modal-close" onClick={() => setDialog(null)}>×</button></div>
            <div className="modal-body"><p style={{ margin: 0, color: 'var(--text2)', lineHeight: 1.6 }}>{dialog.message}</p></div>
            <div className="modal-footer">
              {dialog.onConfirm ? (<><button className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { const fn = dialog.onConfirm; setDialog(null); fn?.(); }}>Confirm</button></>) : (<button className="btn btn-primary" onClick={() => setDialog(null)}>OK</button>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

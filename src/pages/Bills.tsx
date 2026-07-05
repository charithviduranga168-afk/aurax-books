import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StatusBar } from '../components/StatusBar';
import { Chatter, logChatter } from '../components/Chatter';
import {
  DollarSign, AlertCircle, Clock, CheckCircle,
  Download, Filter, LayoutList, LayoutGrid, BarChart2,
  ChevronLeft, ChevronRight, MoreVertical, X, Search,
  Building2, Calendar,
} from 'lucide-react';

interface LineItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}

import type { NavFilter, Page } from '../App';
interface Props {
  onCreateGrn?: (bill: any, lines: any[]) => void;
  prefillFromPO?: { po: any; lines: any[] } | null;
  onConsumePOPrefill?: () => void;
  navFilter?: NavFilter | null;
  onConsumeFilter?: () => void;
  navTo?: (p: Page, filter?: NavFilter) => void;
}

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

function statusBadge(s: string) {
  const map: Record<string, [string, string]> = {
    Paid: ['#05966922', '#059669'], Partial: ['#d9770622', '#d97706'],
    Unpaid: ['#dc262622', '#dc2626'], Overdue: ['#dc262622', '#dc2626'],
    Cancelled: ['#6b728022', '#6b7280'],
  };
  const [bg, color] = map[s] || ['#6b728022', '#6b7280'];
  return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color, border: `1px solid ${color}33` }}>{s}</span>;
}

function exportExcel(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Bills({ onCreateGrn, prefillFromPO, onConsumePOPrefill, navFilter, onConsumeFilter }: Props = {}) {
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [saving, setSaving] = useState(false);
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

  const [navFilterActive, setNavFilterActive] = useState<NavFilter | null>(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (navFilter) { setNavFilterActive(navFilter); onConsumeFilter?.(); } }, [navFilter]);
  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem('lx_bills_favorites') || '[]')); } catch { setFavorites([]); }
  }, []);
  useEffect(() => {
    if (!prefillFromPO) return;
    const { po, lines: poLines } = prefillFromPO;
    setForm(f => ({ ...f, supplier_id: po.supplier_id || '', notes: `Ref: ${po.po_number}` }));
    setLines((poLines || []).map((l: any) => ({ product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost, line_total: l.line_total })));
    setShowForm(true);
    onConsumePOPrefill?.();
  }, [prefillFromPO]);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setShowFilters(false);
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) setShowGroupBy(false);
      if (favRef.current && !favRef.current.contains(e.target as Node)) setShowFavorites(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

    doc.setFillColor(248, 249, 252); doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, 0, 4, 42, 'F');
    doc.setTextColor(79, 53, 200); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'Company Name', 12, 14);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
    doc.text('PURCHASE BILL', 12, 21);
    let cy = 27;
    if (company.address) { doc.text(company.address, 12, cy); cy += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 12, cy); cy += 5; }
    if (company.email) { doc.text(company.email, 12, cy); }
    doc.setTextColor(30, 30, 30); doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(bill.bill_number, 198, 14, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + bill.date, 198, 22, { align: 'right' });
    doc.text('Due: ' + bill.due_date, 198, 28, { align: 'right' });
    doc.setDrawColor(79, 53, 200); doc.setLineWidth(0.5); doc.line(0, 42, 210, 42);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120);
    doc.text('SUPPLIER:', 12, 50);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(bill.supplier_name || '—', 12, 57);
    const statusColors: any = { Paid: [18, 183, 106], Partial: [247, 144, 9], Unpaid: [240, 68, 56] };
    const sc = statusColors[bill.status] || [79, 53, 200];
    doc.setFillColor(sc[0], sc[1], sc[2]);
    doc.roundedRect(150, 47, 44, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
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
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('Subtotal:', 145, finalY + 6); doc.text('Rs. ' + fmtN(bill.subtotal), 196, finalY + 6, { align: 'right' });
      if (bill.tax_amount > 0) { doc.text('Tax:', 145, finalY + 12); doc.text('Rs. ' + fmtN(bill.tax_amount), 196, finalY + 12, { align: 'right' }); }
    }
    const totalY = bill.subtotal !== bill.total ? finalY + 16 : finalY;
    doc.setFillColor(79, 53, 200); doc.rect(120, totalY, 78, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TOTAL:', 125, totalY + 8);
    doc.text('Rs. ' + fmtN(bill.total), 196, totalY + 8, { align: 'right' });
    if (bill.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + bill.notes, 12, totalY + 22); }
    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(248, 249, 252); doc.rect(0, pageH - 14, 210, 14, 'F');
    doc.setFillColor(79, 53, 200); doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setTextColor(150, 150, 150); doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, pageH - 6, { align: 'center' });
    doc.save(bill.bill_number + '.pdf');
  }

  async function updateBillStatus(id: string, newStatus: string) {
    await supabase.from('bills').update({ status: newStatus }).eq('id', id);
    setSelected((prev: any) => prev?.id === id ? { ...prev, status: newStatus } : prev);
    void logChatter('bill', id, `Status changed to ${newStatus}`);
    loadData();
  }

  const today = new Date();
  const totalPayables = bills.filter(b => b.status !== 'Cancelled').reduce((s, b) => s + (b.balance || 0), 0);
  const unpaidCount = bills.filter(b => b.status === 'Unpaid').length;
  const partialCount = bills.filter(b => b.status === 'Partial').length;
  const paidCount = bills.filter(b => b.status === 'Paid').length;

  const kpiCards = [
    { label: 'Total Payables', value: fmt(totalPayables), sub: 'outstanding balance', color: '#7c3aed', Icon: DollarSign, filter: '' },
    { label: 'Unpaid', value: unpaidCount, sub: 'bills pending', color: '#dc2626', Icon: AlertCircle, filter: 'Unpaid' },
    { label: 'Partial', value: partialCount, sub: 'partially paid', color: '#d97706', Icon: Clock, filter: 'Partial' },
    { label: 'Paid', value: paidCount, sub: 'fully settled', color: '#059669', Icon: CheckCircle, filter: 'Paid' },
  ];

  const filtered = bills.filter(b => {
    if (navFilterActive) {
      if (navFilterActive.field === 'supplier_id') return b.supplier_id === navFilterActive.value;
      if (navFilterActive.field === 'purchase_order_id') return b.purchase_order_id === navFilterActive.value;
    }
    const matchSearch = (b.bill_number || '').toLowerCase().includes(search.toLowerCase()) || (b.supplier_name || '').toLowerCase().includes(search.toLowerCase());
    const isOverdue = b.status !== 'Paid' && new Date(b.due_date) < today;
    const matchFilter = !activeFilter || b.status === activeFilter || (activeFilter === 'Overdue' && isOverdue);
    return matchSearch && matchFilter;
  });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  useEffect(() => {
    if (!selectAllRef.current) return;
    const pageIds = paged.map(b => b.id);
    const allSel = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    const someSel = pageIds.some(id => selectedIds.has(id));
    selectAllRef.current.checked = allSel;
    selectAllRef.current.indeterminate = someSel && !allSel;
  }, [selectedIds, paged]);

  function toggleSelectAll() {
    const pageIds = paged.map(b => b.id);
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
    const rows = selectedIds.size > 0 ? bills.filter(b => selectedIds.has(b.id)) : filtered;
    exportExcel(rows.map(b => ({ 'Bill #': b.bill_number, Date: b.date, 'Due Date': b.due_date, Supplier: b.supplier_name, Total: b.total, Paid: b.paid_amount, Balance: b.balance, Status: b.status })), 'bills');
  }

  function saveFavorite(name: string) {
    const next = [...favorites, name];
    setFavorites(next);
    localStorage.setItem('lx_bills_favorites', JSON.stringify(next));
  }
  function removeFavorite(name: string) {
    const next = favorites.filter(f => f !== name);
    setFavorites(next);
    localStorage.setItem('lx_bills_favorites', JSON.stringify(next));
  }

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const bill = selected;
    const isOverdue = bill.status !== 'Paid' && new Date(bill.due_date) < today;
    return (
      <div>
        <BackBtn label="Back to Bills" onClick={() => { setView('list'); setSelected(null); }} />

        <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.4px', marginBottom: 8 }}>{bill.bill_number}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {statusBadge(bill.status)}
                {isOverdue && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#dc262622', color: '#dc2626', border: '1px solid #dc262633' }}>Overdue</span>}
                {bill.supplier_name && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', background: 'var(--bg)', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)' }}><Building2 size={13} />{bill.supplier_name}</span>}
                {bill.date && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text2)', background: 'var(--bg)', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)' }}><Calendar size={13} />{fmtDate(bill.date)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={() => exportPDF(bill, selectedLines)}>PDF</button>
                {bill.status !== 'Paid' && <button className="btn btn-secondary btn-sm" onClick={() => onCreateGrn?.(bill, selectedLines)}>Create GRN</button>}
                {bill.status !== 'Paid' && bill.status !== 'Cancelled' && (
                  <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Cancel bill ${bill.bill_number}?`)) updateBillStatus(bill.id, 'Cancelled'); }}>Cancel</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{fmt(bill.total)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Balance</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: bill.balance > 0 ? '#dc2626' : '#059669' }}>{fmt(bill.balance)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <StatusBar steps={['Unpaid', 'Partial', 'Paid']} current={bill.status} />
        {flowBar(bill, selectedGrns[0] || null)}

        <div className="card" style={{ marginBottom: 16, padding: '20px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>FINANCIAL OVERVIEW</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { label: 'Total', value: fmt(bill.total), color: '#7c3aed' },
              { label: 'Paid', value: fmt(bill.paid_amount), color: '#059669' },
              { label: 'Balance', value: fmt(bill.balance), color: bill.balance > 0 ? '#dc2626' : '#059669' },
              { label: 'Due Date', value: fmtDate(bill.due_date), color: isOverdue ? '#dc2626' : '#2563eb' },
            ].map((k, i) => (
              <div key={k.label} style={{ paddingTop: 20, paddingBottom: 4, paddingLeft: i === 0 ? 0 : 28, paddingRight: 28, borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Line Items</div>
          <table>
            <thead><tr><th><input type="checkbox" /></th><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead>
            <tbody>
              {selectedLines.map((l, i) => (
                <tr key={i}>
                  <td><input type="checkbox" /></td>
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
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text3)' }}>
            <span>{selectedLines.length} items</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronLeft size={14} /></button>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>

        {selectedGrns.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Linked GRNs</div>
            <table>
              <thead><tr><th><input type="checkbox" /></th><th>GRN #</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {selectedGrns.map(g => (
                  <tr key={g.id}>
                    <td><input type="checkbox" /></td>
                    <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{g.grn_number}</td>
                    <td style={{ color: 'var(--text2)' }}>{fmtDate(g.date)}</td>
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

        <Chatter recordType="bill" recordId={selected.id} />
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title" style={{ fontSize: 26, fontWeight: 800 }}>Purchase Bills</div>
          <div className="page-sub">Payables: <strong>{fmt(totalPayables)}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : 'New'}</button>
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

      {(activeFilter || navFilterActive) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {navFilterActive && (
            <span style={{ padding: '4px 12px', borderRadius: 20, background: '#ede9fe', color: 'var(--brand)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {navFilterActive.label ? `Supplier: ${navFilterActive.label}` : 'Filtered'}
              <button onClick={() => setNavFilterActive(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, display: 'flex' }}><X size={12} /></button>
            </span>
          )}
          {activeFilter && (
            <span style={{ padding: '4px 12px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeFilter}
              <button onClick={() => setActiveFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, display: 'flex' }}><X size={12} /></button>
            </span>
          )}
          <button onClick={() => { setActiveFilter(''); setNavFilterActive(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12 }}>Clear all</button>
        </div>
      )}

      {showForm && (
        <div className="inline-panel" style={{ marginBottom: 20 }}>
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
              <div className="form-group"><label>Bill Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              <div className="form-group"><label>Tax %</label><input type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} placeholder="0" /></div>
              <div className="form-group full"><label>Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></div>
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

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>New</button>
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
              <input placeholder="Search bills..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 30, height: 32, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', width: 200 }} />
            </div>

            <div style={{ position: 'relative' }} ref={filtersRef}>
              <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <Filter size={13} />Filters{activeFilter && <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '0 5px', marginLeft: 2 }}>1</span>}
              </button>
              {showFilters && (
                <div style={{ position: 'absolute', top: 36, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, padding: 12, minWidth: 160 }}>
                  {['', 'Unpaid', 'Partial', 'Paid', 'Overdue'].map(f => (
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
              <button onClick={() => setShowFavorites(!showFavorites)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Favorites</button>
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
          <div className="empty-state"><h3>No bills yet</h3><p>Record supplier invoices here</p></div>
        ) : viewMode === 'kanban' ? (
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {paged.map(b => (
              <div key={b.id} className="card" style={{ padding: '16px 20px', cursor: 'pointer', border: selectedIds.has(b.id) ? '2px solid var(--brand)' : '1px solid var(--border)' }} onClick={() => openDetail(b)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <Avatar name={b.supplier_name || 'BILL'} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{b.bill_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{b.supplier_name}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  {statusBadge(b.status)}
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(b.balance)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'analytics' ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase' }}>Balance by Supplier</div>
            {(() => {
              const bySupplier: Record<string, number> = {};
              filtered.filter(b => b.balance > 0).forEach(b => { bySupplier[b.supplier_name] = (bySupplier[b.supplier_name] || 0) + (b.balance || 0); });
              const max = Math.max(...Object.values(bySupplier), 1);
              return Object.entries(bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, val]) => (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(val)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#dc2626', borderRadius: 4, width: `${Math.min(100, (val / max) * 100)}%` }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" ref={selectAllRef} onChange={toggleSelectAll} /></th>
                <th>Bill #</th><th>Date</th><th>Due Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {groupBy ? (() => {
                const groups: Record<string, any[]> = {};
                paged.forEach(b => {
                  const k = groupBy === 'supplier' ? (b.supplier_name || 'Unknown') : groupBy === 'status' ? b.status : '';
                  if (!groups[k]) groups[k] = [];
                  groups[k].push(b);
                });
                return Object.entries(groups).flatMap(([group, rows]) => [
                  <tr key={`g-${group}`} style={{ background: 'var(--bg)', cursor: 'default' }}>
                    <td colSpan={10} style={{ fontWeight: 700, fontSize: 12, color: 'var(--text3)', padding: '8px 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group} ({rows.length})</td>
                  </tr>,
                  ...rows.map(b => <BillRow key={b.id} b={b} selectedIds={selectedIds} toggleSelect={toggleSelect} openDetail={openDetail} fmt={fmt} fmtDate={fmtDate} today={today} />),
                ]);
              })() : paged.map(b => <BillRow key={b.id} b={b} selectedIds={selectedIds} toggleSelect={toggleSelect} openDetail={openDetail} fmt={fmt} fmtDate={fmtDate} today={today} />)}
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
    </div>
  );
}

function BillRow({ b, selectedIds, toggleSelect, openDetail, fmt, fmtDate, today }: {
  b: any; selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openDetail: (b: any) => void;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
  today: Date;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOverdue = b.status !== 'Paid' && new Date(b.due_date) < today;
  return (
    <tr onClick={() => openDetail(b)} style={{ cursor: 'pointer', background: selectedIds.has(b.id) ? 'var(--brand-light)' : '' }}>
      <td onClick={e => { e.stopPropagation(); toggleSelect(b.id); }}><input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} /></td>
      <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{b.bill_number}</td>
      <td style={{ color: 'var(--text2)' }}>{fmtDate(b.date)}</td>
      <td style={{ color: isOverdue ? '#dc2626' : 'var(--text2)' }}>{fmtDate(b.due_date)}</td>
      <td style={{ fontWeight: 500 }}>{b.supplier_name}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(b.total)}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums', color: '#059669' }}>{fmt(b.paid_amount)}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(b.balance)}</td>
      <td onClick={e => e.stopPropagation()}>
        <span className={`badge ${b.status === 'Paid' ? 'badge-green' : b.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>{b.status}</span>
      </td>
      <td onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}>
            <MoreVertical size={15} color="var(--text3)" />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 28, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120 }}>
              <button onClick={() => { openDetail(b); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>View</button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

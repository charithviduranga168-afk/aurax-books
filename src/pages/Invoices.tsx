import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import md5 from 'md5';
import { StatusBar } from '../components/StatusBar';
import { Chatter, logChatter } from '../components/Chatter';
import {
  Wallet, AlertCircle, Clock, CheckCircle,
  Download, Filter, LayoutGrid, LayoutList, BarChart2,
  Star, Check, X, ChevronLeft, ChevronRight, MoreVertical, Trash2,
} from 'lucide-react';

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

const fmt = (n: number) => 'Rs. ' + (n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

function initials(name: string) {
  return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const color = colors[(name || 'U').charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', fontSize: size * 0.38, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '-0.5px' }}>
      {initials(name)}
    </div>
  );
}

function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 13, fontWeight: 600, padding: '0 0 20px 0', transition: 'color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text2)')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
      {label}
    </button>
  );
}

function statusBadge(s: string) {
  const colors: Record<string, { bg: string; text: string }> = {
    unpaid:    { bg: '#fee2e2', text: '#dc2626' },
    partial:   { bg: '#fef3c7', text: '#d97706' },
    paid:      { bg: '#dcfce7', text: '#16a34a' },
    overdue:   { bg: '#fee2e2', text: '#dc2626' },
    cancelled: { bg: '#f3f4f6', text: '#6b7280' },
  };
  const c = colors[(s || '').toLowerCase()] || { bg: '#f3f4f6', text: '#6b7280' };
  return <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: c.bg, color: c.text }}>{s}</span>;
}

interface InvFavorite { name: string; statusFilter: string; groupByVal: string; }
function loadInvFavorites(): InvFavorite[] { try { return JSON.parse(localStorage.getItem('inv_favorites') || '[]'); } catch { return []; } }
function saveInvFavorites(favs: InvFavorite[]) { localStorage.setItem('inv_favorites', JSON.stringify(favs)); }

export default function Invoices({ prefillFromSO, onConsumeSoPrefill }: Props) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [selectedLines, setSelectedLines] = useState<any[]>([]);
  const [selectedReceipts, setSelectedReceipts] = useState<any[]>([]);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(() => !!prefillFromSO);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSoId, setActiveSoId] = useState<string | null>(() => prefillFromSO?.so?.id || null);
  const [form, setForm] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (prefillFromSO?.so) return { date: today, due_date: due, customer_id: prefillFromSO.so.customer_id || '', notes: `Ref: ${prefillFromSO.so.so_number}`, discount: '0', tax_rate: '0' };
    return { date: today, due_date: due, customer_id: '', notes: '', discount: '0', tax_rate: '0' };
  });
  const [lines, setLines] = useState<LineItem[]>(() => {
    if (prefillFromSO?.lines?.length) return prefillFromSO.lines.map((l: any) => ({ product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct || 0, line_total: l.line_total, cost_price: 0, cogs: 0 }));
    return [{ product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0, cost_price: 0, cogs: 0 }];
  });
  const [detailTab, setDetailTab] = useState<'lines' | 'payments'>('lines');
  const [detailSearch, setDetailSearch] = useState('');

  // List toolbar state
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'analytics'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupBy, setShowGroupBy] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'customer'>('none');
  const [favorites, setFavorites] = useState<InvFavorite[]>(loadInvFavorites());
  const [favName, setFavName] = useState('');
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const groupByRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
    if (prefillFromSO) onConsumeSoPrefill?.();
  }, []);

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

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [invRes, custRes, prodRes, settRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('customers').select('id,name,balance').eq('user_id', user.id).order('name'),
      supabase.from('products').select('id,name,sales_price,cost_price,stock_qty,unit').eq('user_id', user.id).order('name'),
      supabase.from('company_settings').select('*').eq('user_id', user.id).single(),
    ]);
    setInvoices(invRes.data || []);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);
    setCompanySettings(settRes.data || {});
    setLoading(false);
  }

  async function openDetail(inv: Invoice) {
    setSelected(inv);
    const [{ data: lineData }, { data: recData }] = await Promise.all([
      supabase.from('invoice_lines').select('*').eq('invoice_id', inv.id),
      supabase.from('receipts').select('*').eq('invoice_id', inv.id).order('date', { ascending: false }),
    ]);
    setSelectedLines(lineData || []);
    setSelectedReceipts(recData || []);
    setDetailTab('lines');
    setDetailSearch('');
    setView('detail');
  }

  function generateInvoiceNumber(existingInvoices: Invoice[]) {
    if (existingInvoices.length === 0) return 'INV-0001';
    const numbers = existingInvoices.map(inv => { const match = inv.invoice_number?.match(/(\d+)$/); return match ? parseInt(match[1]) : 0; }).filter(n => !isNaN(n));
    return 'INV-' + String(Math.max(0, ...numbers) + 1).padStart(4, '0');
  }

  function addLine() {
    setLines([...lines, { product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0, cost_price: 0, cogs: 0 }]);
  }

  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: string, value: any) {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    if (field === 'product_id') {
      const prod = products.find(p => p.id === value);
      if (prod) { updated[i].product_name = prod.name; updated[i].unit_price = prod.sales_price; updated[i].cost_price = prod.cost_price; }
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
  const taxAmt = ((subtotal - discountAmt) * (parseFloat(form.tax_rate) || 0)) / 100;
  const total = subtotal - discountAmt + taxAmt;

  function openAdd() {
    setForm({ date: new Date().toISOString().split('T')[0], due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], customer_id: '', notes: '', discount: '0', tax_rate: '0' });
    setLines([{ product_id: '', product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0, cost_price: 0, cogs: 0 }]);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.customer_id) return alert('Please select a customer');
    const validLines = lines.filter(l => l.product_id && l.qty > 0);
    if (validLines.length === 0) return alert('Add at least one product line');
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const customer = customers.find(c => c.id === form.customer_id);
    const invNumber = generateInvoiceNumber(invoices);
    const { data: invData, error } = await supabase.from('invoices').insert({
      user_id: user.id, invoice_number: invNumber, date: form.date, due_date: form.due_date,
      customer_id: form.customer_id, customer_name: customer?.name, subtotal, tax_amount: taxAmt,
      discount: discountAmt, total, paid_amount: 0, balance: total, status: 'Unpaid', notes: form.notes,
    }).select().single();

    if (error) { alert('Error saving invoice: ' + error.message); setSaving(false); return; }

    if (invData) {
      await supabase.from('invoice_lines').insert(validLines.map(l => ({ invoice_id: invData.id, product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct, line_total: l.line_total, cost_price: l.cost_price, cogs: l.cogs })));
      for (const l of validLines) {
        const { data: prod } = await supabase.from('products').select('stock_qty').eq('id', l.product_id).single();
        if (prod) await supabase.from('products').update({ stock_qty: (prod.stock_qty || 0) - l.qty }).eq('id', l.product_id);
      }
      if (customer) await supabase.from('customers').update({ balance: (customer.balance || 0) + total }).eq('id', form.customer_id);
      if (activeSoId) { await supabase.from('sales_orders').update({ status: 'Invoiced', invoice_id: invData.id }).eq('id', activeSoId); setActiveSoId(null); }
    }

    setSaving(false); setShowForm(false); loadData();
  }

  async function updateInvoiceStatus(id: string, newStatus: string) {
    await supabase.from('invoices').update({ status: newStatus }).eq('id', id);
    setSelected((prev: any) => prev?.id === id ? { ...prev, status: newStatus } : prev);
    void logChatter('invoice', id, `Status changed to ${newStatus}`);
    loadData();
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return;
    await supabase.from('invoice_lines').delete().eq('invoice_id', id);
    await supabase.from('invoices').delete().eq('id', id);
    if (view === 'detail') setView('list');
    loadData();
  }

  function exportPDF(inv: Invoice, lineItems: any[]) {
    const doc = new jsPDF();
    const company = companySettings;
    doc.setFillColor(245, 246, 250); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(79, 53, 200); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text(company.company_name || 'NeoGrid', 14, 16);
    doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('TAX INVOICE', 14, 26);
    doc.setTextColor(30, 30, 30); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(inv.invoice_number, 196, 16, { align: 'right' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Date: ' + inv.date, 196, 24, { align: 'right' });
    doc.text('Due: ' + inv.due_date, 196, 31, { align: 'right' });
    doc.setDrawColor(79, 53, 200); doc.setLineWidth(0.8); doc.line(0, 40, 210, 40);
    doc.setTextColor(80, 80, 80); doc.setFontSize(9);
    let y = 48;
    if (company.address) { doc.text(company.address, 14, y); y += 5; }
    if (company.phone) { doc.text('Tel: ' + company.phone, 14, y); y += 5; }
    if (company.email) { doc.text('Email: ' + company.email, 14, y); y += 5; }
    if (company.tax_reg) { doc.text('Tax Reg: ' + company.tax_reg, 14, y); }
    y = 48;
    doc.setTextColor(79, 53, 200); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('BILL TO:', 120, y); y += 6;
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(inv.customer_name, 120, y);
    const statusColors: any = { Paid: [18, 183, 106], Partial: [247, 144, 9], Unpaid: [240, 68, 56] };
    const sc = statusColors[inv.status] || [100, 100, 100];
    doc.setFillColor(sc[0], sc[1], sc[2]); doc.roundedRect(150, 80, 30, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(inv.status.toUpperCase(), 165, 85.5, { align: 'center' });
    autoTable(doc, {
      startY: 95,
      head: [['#', 'Product / Service', 'Qty', 'Unit Price (Rs.)', 'Disc%', 'Total (Rs.)']],
      body: lineItems.map((l, i) => [i + 1, l.product_name, l.qty, parseFloat(l.unit_price).toLocaleString('en-LK', { minimumFractionDigits: 2 }), (l.discount_pct || 0) + '%', parseFloat(l.line_total).toLocaleString('en-LK', { minimumFractionDigits: 2 })]),
      headStyles: { fillColor: [79, 53, 200], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 246, 250] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right', cellWidth: 15 }, 3: { halign: 'right', cellWidth: 35 }, 4: { halign: 'center', cellWidth: 15 }, 5: { halign: 'right', cellWidth: 35 } },
      margin: { left: 14, right: 14 },
    });
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFillColor(245, 246, 250); doc.rect(120, finalY, 76, inv.discount > 0 || inv.tax_amount > 0 ? 32 : 16, 'F');
    doc.setTextColor(80, 80, 80); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    let ty = finalY + 7;
    doc.text('Subtotal:', 125, ty); doc.text('Rs. ' + inv.subtotal.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 194, ty, { align: 'right' });
    if (inv.discount > 0) { ty += 6; doc.text('Discount:', 125, ty); doc.text('- Rs. ' + inv.discount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 194, ty, { align: 'right' }); }
    if (inv.tax_amount > 0) { ty += 6; doc.text('Tax:', 125, ty); doc.text('Rs. ' + inv.tax_amount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 194, ty, { align: 'right' }); }
    const totalY = finalY + (inv.discount > 0 || inv.tax_amount > 0 ? 36 : 20);
    doc.setFillColor(79, 53, 200); doc.rect(120, totalY, 76, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 125, totalY + 8); doc.text('Rs. ' + inv.total.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 194, totalY + 8, { align: 'right' });
    if (inv.paid_amount > 0) {
      const pb = totalY + 18;
      doc.setTextColor(18, 183, 106); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text('Paid: Rs. ' + inv.paid_amount.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 194, pb, { align: 'right' });
      doc.setTextColor(240, 68, 56); doc.setFont('helvetica', 'bold');
      doc.text('Balance: Rs. ' + inv.balance.toLocaleString('en-LK', { minimumFractionDigits: 2 }), 194, pb + 6, { align: 'right' });
    }
    if (inv.notes) { doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + inv.notes, 14, totalY + 30); }
    const pageH = doc.internal.pageSize.height;
    doc.setFillColor(245, 246, 250); doc.rect(0, pageH - 16, 210, 16, 'F');
    doc.setTextColor(150, 150, 150); doc.setFontSize(8);
    doc.text('Thank you for your business!', 105, pageH - 7, { align: 'center' });
    if (company.company_name) doc.text(company.company_name, 14, pageH - 7);
    doc.save(inv.invoice_number + '.pdf');
  }

  async function handlePrint(inv: Invoice) {
    const { data: lns } = await supabase.from('invoice_lines').select('*').eq('invoice_id', inv.id);
    exportPDF(inv, lns || []);
  }

  function generatePaymentLink(inv: Invoice) {
    const merchantId = companySettings.payhere_merchant_id;
    const merchantSecret = companySettings.payhere_secret;
    if (!merchantId) return;
    const amount = (inv.balance || inv.total).toFixed(2);
    const currency = 'LKR';
    const orderId = inv.invoice_number;
    const secretHash = md5(merchantSecret).toUpperCase();
    const hash = md5(merchantId + orderId + amount + currency + secretHash).toUpperCase();
    const frm = document.createElement('form');
    frm.method = 'POST'; frm.action = 'https://www.payhere.lk/pay/checkout'; frm.style.display = 'none';
    const fields: Record<string, string> = { merchant_id: merchantId, return_url: window.location.origin, cancel_url: window.location.origin, notify_url: '', order_id: orderId, items: `Invoice ${inv.invoice_number}`, currency, amount, first_name: inv.customer_name.split(' ')[0] || inv.customer_name, last_name: inv.customer_name.split(' ').slice(1).join(' ') || '', email: '', phone: '0000000000', address: 'Sri Lanka', city: 'Colombo', country: 'Sri Lanka', hash };
    for (const [k, v] of Object.entries(fields)) { const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = k; inp.value = v; frm.appendChild(inp); }
    document.body.appendChild(frm); frm.submit();
  }

  const filtered = invoices.filter(inv => {
    const matchSearch = (inv.invoice_number || '').toLowerCase().includes(search.toLowerCase()) || (inv.customer_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalReceivables = invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const unpaidCount = invoices.filter(i => i.status === 'Unpaid').length;
  const partialCount = invoices.filter(i => i.status === 'Partial').length;
  const paidCount = invoices.filter(i => i.status === 'Paid').length;

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someSelected = filtered.some(r => selectedIds.has(r.id)) && !allSelected;
  function toggleSelectAll() { if (allSelected || someSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(filtered.map(r => r.id))); }
  function toggleSelect(id: string) { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); }

  function exportExcel() {
    const toExport = selectedIds.size > 0 ? invoices.filter(r => selectedIds.has(r.id)) : filtered;
    const data = toExport.map(r => ({ 'Invoice #': r.invoice_number, 'Date': r.date, 'Due Date': r.due_date, 'Customer': r.customer_name, 'Total': r.total || 0, 'Paid': r.paid_amount || 0, 'Balance': r.balance || 0, 'Status': r.status }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const groups: { key: string; items: Invoice[] }[] = [];
  if (groupBy === 'none') { groups.push({ key: '', items: filtered }); }
  else {
    const map = new Map<string, Invoice[]>();
    filtered.forEach(inv => { const k = groupBy === 'status' ? (inv.status || 'Unknown') : (inv.customer_name || 'Unknown'); if (!map.has(k)) map.set(k, []); map.get(k)!.push(inv); });
    map.forEach((items, key) => groups.push({ key, items }));
    groups.sort((a, b) => a.key.localeCompare(b.key));
  }

  function saveFav() {
    if (!favName.trim()) return;
    const newFavs = [...favorites, { name: favName.trim(), statusFilter: filterStatus, groupByVal: groupBy }];
    setFavorites(newFavs); saveInvFavorites(newFavs); setFavName('');
  }
  function loadFav(fav: InvFavorite) { setFilterStatus(fav.statusFilter); setGroupBy(fav.groupByVal as any); setShowFavorites(false); }
  function deleteFav(idx: number) { const newFavs = favorites.filter((_, i) => i !== idx); setFavorites(newFavs); saveInvFavorites(newFavs); }

  const activeFilterCount = filterStatus ? 1 : 0;
  const maxBalance = Math.max(...invoices.map(i => i.balance || 0), 1);

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const isOverdue = selected.due_date && new Date(selected.due_date) < new Date() && selected.status !== 'Paid';
    const overdueDays = isOverdue ? Math.floor((Date.now() - new Date(selected.due_date).getTime()) / 86400000) : 0;
    const filteredDetailLines = detailSearch ? selectedLines.filter(l => (l.product_name || '').toLowerCase().includes(detailSearch.toLowerCase())) : selectedLines;

    return (
      <div>
        <BackBtn label="Back to Invoices" onClick={() => { setView('list'); setSelected(null); }} />

        {/* Hero */}
        <div className="card" style={{ marginBottom: 16, padding: '28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 6 }}>{selected.invoice_number}</div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {statusBadge(selected.status)}
                {isOverdue && <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#fee2e2', color: '#dc2626' }}>Overdue {overdueDays}d</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  {selected.customer_name}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  {fmtDate(selected.date)}
                </span>
                <span style={{ fontSize: 13, color: isOverdue ? '#dc2626' : 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  Due: {fmtDate(selected.due_date)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 40, flexShrink: 0, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{fmt(selected.total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Balance</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: selected.balance > 0 ? '#dc2626' : '#16a34a' }}>{fmt(selected.balance)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[
                { label: 'PDF', show: true, onClick: () => handlePrint(selected), danger: false, blue: false },
                { label: 'Pay Link', show: !!(companySettings.payhere_merchant_id && selected.status !== 'Paid'), onClick: () => generatePaymentLink(selected), danger: false, blue: true },
                { label: 'Cancel', show: selected.status !== 'Paid' && selected.status !== 'Cancelled', onClick: () => { if (confirm(`Cancel invoice ${selected.invoice_number}?`)) updateInvoiceStatus(selected.id, 'Cancelled'); }, danger: true, blue: false },
                { label: 'Delete', show: true, onClick: () => deleteInvoice(selected.id), danger: true, blue: false },
              ].filter(b => b.show).map(btn => (
                <button key={btn.label} onClick={btn.onClick} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                  border: btn.blue ? '1px solid #0070ba' : btn.danger ? '1px solid #fecaca' : '1px solid var(--border)',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: btn.blue ? '#0070ba' : btn.danger ? '#dc2626' : 'var(--text1)', transition: 'background 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = btn.danger ? '#fee2e2' : 'var(--bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >{btn.label}</button>
              ))}
            </div>
          </div>
        </div>

        <StatusBar steps={['Unpaid', 'Partial', 'Paid']} current={selected.status === 'Overdue' ? 'Unpaid' : selected.status} />

        {/* Financial Overview */}
        <div className="card" style={{ marginBottom: 20, padding: '20px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Financial Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0 }}>
            {[
              { label: 'Total', value: fmt(selected.total), color: 'var(--brand)' },
              { label: 'Paid', value: fmt(selected.paid_amount), color: '#16a34a' },
              { label: 'Balance', value: fmt(selected.balance), color: selected.balance > 0 ? '#dc2626' : '#16a34a' },
              { label: 'Due Date', value: fmtDate(selected.due_date), color: isOverdue ? '#dc2626' : '#2563eb' },
            ].map((k, i) => (
              <div key={k.label} style={{ paddingRight: i < 3 ? 28 : 0, borderRight: i < 3 ? '1px solid var(--border)' : 'none', paddingLeft: i > 0 ? 28 : 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontSize: i === 3 ? 15 : 18, fontWeight: 800, color: k.color, letterSpacing: '-0.4px' }}>{k.value}</div>
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
                { key: 'payments' as const, label: `Payments (${selectedReceipts.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} style={{ padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: detailTab === t.key ? 'var(--brand)' : 'var(--text2)', borderBottom: detailTab === t.key ? '2px solid var(--brand)' : '2px solid transparent', transition: 'all 0.15s', marginBottom: -1 }}>{t.label}</button>
              ))}
            </div>
            {detailTab === 'lines' && (
              <div style={{ position: 'relative' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input value={detailSearch} onChange={e => setDetailSearch(e.target.value)} placeholder="Search lines..." style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 180 }} />
              </div>
            )}
          </div>
          {detailTab === 'lines' ? (
            filteredDetailLines.length === 0 ? <div className="empty-state"><h3>No line items</h3></div> : (
              <>
                <table>
                  <thead><tr><th style={{ width: 40 }}><input type="checkbox" /></th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Disc%</th><th>Total</th></tr></thead>
                  <tbody>
                    {filteredDetailLines.map((l, i) => (
                      <tr key={i}>
                        <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                        <td style={{ fontWeight: 500 }}>{l.product_name}</td>
                        <td>{l.qty}</td>
                        <td>{fmt(l.unit_price)}</td>
                        <td>{l.discount_pct || 0}%</td>
                        <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{fmt(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Showing {filteredDetailLines.length} of {selectedLines.length}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Subtotal: {fmt(selected.subtotal)}</div>
                    {selected.discount > 0 && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 4 }}>Discount: - {fmt(selected.discount)}</div>}
                    {selected.tax_amount > 0 && <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>Tax: {fmt(selected.tax_amount)}</div>}
                    <div style={{ fontWeight: 700, fontSize: 16 }}>Total: {fmt(selected.total)}</div>
                  </div>
                </div>
              </>
            )
          ) : (
            selectedReceipts.length === 0 ? <div className="empty-state"><h3>No payments recorded</h3></div> : (
              <table>
                <thead><tr><th style={{ width: 40 }}><input type="checkbox" /></th><th>Receipt #</th><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                <tbody>
                  {selectedReceipts.map(r => (
                    <tr key={r.id}>
                      <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                      <td style={{ color: 'var(--brand)', fontWeight: 600 }}>{r.receipt_number}</td>
                      <td style={{ color: 'var(--text2)' }}>{fmtDate(r.date)}</td>
                      <td style={{ color: '#059669', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                      <td style={{ color: 'var(--text2)' }}>{r.payment_method || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        {selected.notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
            <strong>Notes:</strong> {selected.notes}
          </div>
        )}

        <Chatter recordType="invoice" recordId={selected.id} />
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.5px', marginBottom: 4 }}>Invoices</div>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>Track and manage customer invoices and receivables.</div>
        </div>
        <button className="btn btn-primary" onClick={() => showForm ? setShowForm(false) : openAdd()}>{showForm ? 'Close' : '+ New'}</button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { icon: <Wallet size={22} color="var(--brand)" />, label: 'Total Receivables', value: fmt(totalReceivables), sub: 'Outstanding balance', filterVal: '' },
          { icon: <AlertCircle size={22} color="#dc2626" />, label: 'Unpaid', value: String(unpaidCount), sub: 'Awaiting payment', filterVal: 'Unpaid' },
          { icon: <Clock size={22} color="#d97706" />, label: 'Partial', value: String(partialCount), sub: 'Partially paid', filterVal: 'Partial' },
          { icon: <CheckCircle size={22} color="#16a34a" />, label: 'Paid', value: String(paidCount), sub: 'Fully settled', filterVal: 'Paid' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: k.filterVal ? 'pointer' : 'default', border: filterStatus === k.filterVal && k.filterVal ? '2px solid var(--brand)' : undefined }}
            onClick={() => k.filterVal ? setFilterStatus(filterStatus === k.filterVal ? '' : k.filterVal) : undefined}
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
              <div className="inline-panel-title">New Invoice</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Next: {generateInvoiceNumber(invoices)}</div>
            </div>
            <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
          </div>
          <div className="inline-panel-body">
            <div className="form-grid" style={{ marginBottom: 20 }}>
              <div className="form-group"><label>Customer *</label><select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}><option value="">— Select Customer —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="form-group"><label>Invoice Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              <div className="form-group"><label>Tax %</label><input type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} placeholder="0" /></div>
              <div className="form-group"><label>Discount (LKR)</label><input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} placeholder="0" /></div>
              <div className="form-group"><label>Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
            </div>
            <div className="section-header">LINE ITEMS</div>
            <div className="line-items">
              <table>
                <thead><tr><th style={{ width: '35%' }}>Product</th><th style={{ width: '10%' }}>Qty</th><th style={{ width: '18%' }}>Unit Price</th><th style={{ width: '10%' }}>Disc%</th><th style={{ width: '18%' }}>Total</th><th style={{ width: '9%' }}></th></tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td><select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}><option value="">— Select —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_qty})</option>)}</select></td>
                      <td><input type="number" value={line.qty} min="1" onChange={e => updateLine(i, 'qty', parseFloat(e.target.value) || 0)} /></td>
                      <td><input type="number" value={line.unit_price} onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)} /></td>
                      <td><input type="number" value={line.discount_pct} min="0" max="100" onChange={e => updateLine(i, 'discount_pct', parseFloat(e.target.value) || 0)} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)', paddingLeft: 8 }}>{fmt(line.line_total)}</td>
                      <td>{lines.length > 1 && <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="line-add-btn" onClick={addLine}>+ Add Line</button>
            </div>
            <div className="totals-box">
              <div className="total-row"><span className="total-label">Subtotal:</span><span className="total-value">{fmt(subtotal)}</span></div>
              {discountAmt > 0 && <div className="total-row"><span className="total-label">Discount:</span><span className="total-value" style={{ color: '#dc2626' }}>- {fmt(discountAmt)}</span></div>}
              {taxAmt > 0 && <div className="total-row"><span className="total-label">Tax:</span><span className="total-value">{fmt(taxAmt)}</span></div>}
              <div className="total-row total-final"><span className="total-label">TOTAL:</span><span className="total-value">{fmt(total)}</span></div>
            </div>
          </div>
          <div className="inline-panel-footer">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Invoice'}</button>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {filterStatus && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--brand-light)', color: 'var(--brand)', fontSize: 12, fontWeight: 600 }}>
              Status: {filterStatus}
              <button onClick={() => setFilterStatus('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--brand)' }}><X size={12} /></button>
            </span>
          )}
          <button onClick={() => setFilterStatus('')} style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Clear all</button>
        </div>
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ padding: '7px 16px' }}>New</button>
          <button onClick={exportExcel} title={selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export all to Excel'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', position: 'relative' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--brand)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <Download size={14} color="var(--text2)" />
            {selectedIds.size > 0 && <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, background: 'var(--brand)', color: '#fff', borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selectedIds.size}</span>}
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, width: 200 }} />
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
                  {[{ key: '', label: 'All' }, { key: 'Unpaid', label: 'Unpaid' }, { key: 'Partial', label: 'Partial' }, { key: 'Paid', label: 'Paid' }, { key: 'Overdue', label: 'Overdue' }].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      <input type="radio" name="invStatus" checked={filterStatus === opt.key} onChange={() => { setFilterStatus(opt.key); setShowFilters(false); }} />{opt.label}
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
            <h3>{search || filterStatus ? 'No invoices match' : 'No invoices yet'}</h3>
            <p>{search || filterStatus ? 'Try adjusting your search or filters' : 'Create your first invoice to get started'}</p>
            {!search && !filterStatus && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>+ New Invoice</button>}
          </div>
        ) : (
          <>
            <table>
              <thead><tr>
                <th style={{ width: 40 }}><input type="checkbox" ref={el => { if (el) el.indeterminate = someSelected; }} checked={allSelected} onChange={toggleSelectAll} /></th>
                <th>Invoice #</th><th>Date</th><th>Due Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th style={{ width: 48 }}></th>
              </tr></thead>
              <tbody>
                {groups.map(group => (
                  <>
                    {groupBy !== 'none' && (
                      <tr key={`grp-${group.key}`} style={{ background: 'var(--bg)' }}>
                        <td colSpan={10} style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {group.key} <span style={{ fontWeight: 400, textTransform: 'none' }}>({group.items.length})</span>
                        </td>
                      </tr>
                    )}
                    {group.items.map(inv => {
                      const overdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'Paid';
                      return (
                        <tr key={inv.id} onClick={() => openDetail(inv)} style={{ cursor: 'pointer', background: selectedIds.has(inv.id) ? '#faf5ff' : undefined }}>
                          <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(inv.id)} onChange={() => toggleSelect(inv.id)} /></td>
                          <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{inv.invoice_number}</td>
                          <td style={{ color: 'var(--text2)' }}>{fmtDate(inv.date)}</td>
                          <td style={{ color: overdue ? '#dc2626' : 'var(--text2)' }}>{fmtDate(inv.due_date)}</td>
                          <td style={{ fontWeight: 500 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={inv.customer_name || 'U'} size={28} />{inv.customer_name}</div>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.total)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{fmt(inv.paid_amount)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.balance)}</td>
                          <td>{statusBadge(inv.status)}</td>
                          <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                            <div style={{ position: 'relative' }}>
                              <button onClick={() => setShowActionMenu(showActionMenu === inv.id ? null : inv.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><MoreVertical size={16} color="var(--text3)" /></button>
                              {showActionMenu === inv.id && (
                                <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 99, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', minWidth: 140, padding: 4 }}>
                                  <button onClick={() => { setShowActionMenu(null); handlePrint(inv); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 7, color: 'var(--text1)', textAlign: 'left' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>PDF</button>
                                  <button onClick={() => { setShowActionMenu(null); deleteInvoice(inv.id); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderRadius: 7, color: '#dc2626', textAlign: 'left' }} onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><Trash2 size={13} /> Delete</button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
            {filtered.length === 0 ? <div className="empty-state"><h3>No invoices match</h3></div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {filtered.map(inv => {
                  const overdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'Paid';
                  return (
                    <div key={inv.id} onClick={() => openDetail(inv)} style={{ border: `2px solid ${selectedIds.has(inv.id) ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 12, padding: '18px 20px', cursor: 'pointer', background: '#fff', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                      onMouseEnter={e => { if (!selectedIds.has(inv.id)) e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.1)'; }}
                      onMouseLeave={e => { if (!selectedIds.has(inv.id)) e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand)' }}>{inv.invoice_number}</span>
                        {statusBadge(inv.status)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text1)', marginBottom: 4 }}>{inv.customer_name}</div>
                      <div style={{ fontSize: 12, color: overdue ? '#dc2626' : 'var(--text3)', marginBottom: 12 }}>Due: {fmtDate(inv.due_date)}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <div><div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Total</div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>{fmt(inv.total)}</div></div>
                        <div><div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Balance</div><div style={{ fontSize: 14, fontWeight: 700, color: inv.balance > 0 ? '#dc2626' : '#16a34a' }}>{fmt(inv.balance)}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Analytics view */}
        {viewMode === 'analytics' && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 16 }}>Balance by Invoice</div>
            {filtered.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 14 }}>No data to display.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...filtered].filter(i => i.balance > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0)).map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Avatar name={inv.customer_name || 'U'} size={30} />
                    <div style={{ width: 110, fontSize: 13, fontWeight: 600, color: 'var(--brand)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.invoice_number}</div>
                    <div style={{ width: 120, fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.customer_name}</div>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(((inv.balance || 0) / maxBalance) * 100, 0)}%`, background: 'linear-gradient(90deg, #dc2626, #f87171)', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ width: 130, fontSize: 13, fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>{fmt(inv.balance)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { label: 'Average Balance', value: fmt(filtered.length ? filtered.reduce((s, i) => s + (i.balance || 0), 0) / filtered.length : 0) },
                { label: 'Highest Balance', value: fmt(Math.max(...filtered.map(i => i.balance || 0), 0)) },
                { label: 'With Balance', value: `${filtered.filter(i => i.balance > 0).length} of ${filtered.length}` },
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
    </div>
  );
}
